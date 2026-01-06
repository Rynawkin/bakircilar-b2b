/**
 * Stock Service
 *
 * Fazla stok hesaplama ve stok kontrolü
 */

import { prisma } from '../utils/prisma';
import { splitSearchTokens } from '../utils/search';
import mikroService from './mikroFactory.service';

class StockService {
  /**
   * Fazla stok hesapla
   *
   * Formül:
   * Fazla Stok = Toplam Stok - (Aylık Ortalama × 3) - Bekleyen Müşteri Siparişleri
   *
   * Örnek: 100 stok, son 90 günde 180 satış (aylık 60):
   * → Fazla Stok = 100 - (60 × 3) - 0 = -80 = 0 adet
   */
  async calculateExcessStock(productId: string): Promise<number> {
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new Error('Product not found');
    }

    // Settings'den parametreleri al
    const settings = await prisma.settings.findFirst();
    if (!settings) {
      throw new Error('Settings not found');
    }

    const { calculationPeriodDays, includedWarehouses, minimumExcessThreshold } = settings;

    const warehouseStocks = product.warehouseStocks as Record<string, number>;
    const salesHistory = product.salesHistory as Record<string, number>;

    // 1. Toplam stok hesapla (sadece included warehouses)
    const totalStock = includedWarehouses.reduce((sum, warehouse) => {
      return sum + (warehouseStocks[warehouse] || 0);
    }, 0);

    // 2. Günlük satış geçmişinden aylık ortalama hesapla
    const averageMonthlySales = this.calculateAverageSales(
      salesHistory,
      calculationPeriodDays
    );

    // 3. Bekleyen müşteri siparişleri
    const pendingCustomer = product.pendingCustomerOrders || 0;

    // 4. Fazla stok hesapla
    // Fazla Stok = Toplam Stok - (Aylık Ortalama × 3) - Bekleyen Müşteri Siparişleri
    let excessStock = totalStock - (averageMonthlySales * 3) - pendingCustomer;

    // 5. Negatif ise 0 yap
    excessStock = Math.max(0, excessStock);

    // 6. Minimum eşik kontrolü
    const finalExcessStock = excessStock >= minimumExcessThreshold ? excessStock : 0;

    // 7. Depo bazlı fazla stok hesapla (oransal dağıtım)
    const warehouseExcessStocks: Record<string, number> = {};

    if (finalExcessStock > 0 && totalStock > 0) {
      for (const warehouse of includedWarehouses) {
        const warehouseStock = warehouseStocks[warehouse] || 0;
        const warehouseRatio = warehouseStock / totalStock;
        warehouseExcessStocks[warehouse] = Math.floor(finalExcessStock * warehouseRatio);
      }
    } else {
      for (const warehouse of includedWarehouses) {
        warehouseExcessStocks[warehouse] = 0;
      }
    }

    // 8. Veritabanını güncelle
    await prisma.product.update({
      where: { id: productId },
      data: {
        excessStock: finalExcessStock,
        warehouseExcessStocks: warehouseExcessStocks,
      },
    });

    return finalExcessStock;
  }

  /**
   * Tüm ürünler için fazla stok hesapla
   */
  async calculateExcessStockForAllProducts(syncLogId?: string): Promise<number> {
    const products = await prisma.product.findMany({
      where: { active: true },
    });

    const totalProducts = products.length;
    let count = 0;

    // SyncLog'a toplam stok hesaplama sayısını kaydet
    if (syncLogId) {
      await prisma.syncLog.update({
        where: { id: syncLogId },
        data: {
          details: {
            totalStocksToCalculate: totalProducts,
          },
        },
      });
    }

    for (const product of products) {
      await this.calculateExcessStock(product.id);
      count++;

      // Her 100 üründe bir SyncLog'u güncelle
      if (syncLogId && count % 100 === 0) {
        try {
          await prisma.syncLog.update({
            where: { id: syncLogId },
            data: {
              details: {
                totalStocksToCalculate: totalProducts,
                stocksCalculated: count,
              },
            },
          });
        } catch (error) {
          console.error('SyncLog güncelleme hatası (stock):', error);
        }
      }
    }

    return count;
  }

  /**
   * Ortalama aylık satış hesapla (günlük verilerden)
   *
   * Son X günün satışlarını topla, aylık ortalamaya çevir
   * Örnek: Son 90 günde 180 adet satış → Aylık ortalama = (180 / 90) * 30 = 60 adet/ay
   */
  private calculateAverageSales(
    salesHistory: Record<string, number>,
    periodDays: number
  ): number {
    const now = new Date();
    let totalSales = 0;

    // Son X günün satışlarını topla
    for (let i = 0; i < periodDays; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);

      // YYYY-MM-DD formatı
      const key = date.toISOString().split('T')[0];

      // Satış varsa ekle
      totalSales += salesHistory[key] || 0;
    }

    // Günlük ortalama hesapla
    const dailyAverage = totalSales / periodDays;

    // Aylık ortalamaya çevir (30 gün = 1 ay)
    const monthlyAverage = dailyAverage * 30;

    return Math.ceil(monthlyAverage);
  }

  /**
   * Anlık stok kontrolü (Mikro'dan)
   *
   * Sipariş verilirken gerçek zamanlı stok kontrolü için
   */
  async checkRealtimeStock(
    productId: string,
    requestedQuantity: number
  ): Promise<{ available: boolean; currentStock: number }> {
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new Error('Product not found');
    }

    const settings = await prisma.settings.findFirst();
    if (!settings) {
      throw new Error('Settings not found');
    }

    // Mikro'dan anlık stok sor
    const currentStock = await mikroService.getRealtimeStock(
      product.mikroCode,
      settings.includedWarehouses
    );

    return {
      available: currentStock >= requestedQuantity,
      currentStock,
    };
  }

  /**
   * Toplu stok kontrolü (sepet için)
   */
  async checkRealtimeStockBatch(
    items: Array<{ productId: string; quantity: number }>
  ): Promise<{
    allAvailable: boolean;
    details: Array<{
      productId: string;
      productName: string;
      requested: number;
      available: number;
      sufficient: boolean;
    }>;
  }> {
    const results = [];
    let allAvailable = true;

    for (const item of items) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
      });

      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      const stockCheck = await this.checkRealtimeStock(item.productId, item.quantity);

      const sufficient = stockCheck.available;
      if (!sufficient) {
        allAvailable = false;
      }

      results.push({
        productId: product.id,
        productName: product.name,
        requested: item.quantity,
        available: stockCheck.currentStock,
        sufficient,
      });
    }

    return {
      allAvailable,
      details: results,
    };
  }

  /**
   * Fazla stoklu ürünleri getir (müşteri için)
   */
  async getExcessStockProducts(filters?: {
    categoryId?: string;
    search?: string;
    minStock?: number;
  }): Promise<any[]> {
    const where: any = {
      excessStock: { gt: 0 },
      active: true,
    };

    if (filters?.categoryId) {
      where.categoryId = filters.categoryId;
    }

    const searchTokens = splitSearchTokens(filters?.search);
    if (searchTokens.length > 0) {
      where.AND = searchTokens.map((token) => ({
        OR: [
          { name: { contains: token, mode: 'insensitive' } },
          { mikroCode: { contains: token, mode: 'insensitive' } },
        ],
      }));
    }

    if (filters?.minStock) {
      where.excessStock = { gte: filters.minStock };
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        excessStock: 'desc',
      },
    });

    return products;
  }
}

export default new StockService();
