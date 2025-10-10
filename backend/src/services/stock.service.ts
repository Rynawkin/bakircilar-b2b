/**
 * Stock Service
 *
 * Fazla stok hesaplama ve stok kontrolü
 */

import { prisma } from '../utils/prisma';
import mikroService from './mikroFactory.service';

class StockService {
  /**
   * Fazla stok hesapla
   *
   * Formül:
   * Fazla Stok = Toplam Stok - (Aylık Ortalama × Periyot) - Bekleyen Müşteri Siparişleri
   *
   * Örnek: 100 stok, aylık 20, 3 ay periyot:
   * → Fazla Stok = 100 - (20 × 3) - 0 = 40 adet
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

    const { calculationPeriodMonths, includedWarehouses, minimumExcessThreshold } = settings;

    const warehouseStocks = product.warehouseStocks as Record<string, number>;
    const salesHistory = product.salesHistory as Record<string, number>;

    // 1. Toplam stok hesapla (sadece included warehouses)
    const totalStock = includedWarehouses.reduce((sum, warehouse) => {
      return sum + (warehouseStocks[warehouse] || 0);
    }, 0);

    // 2. Aylık ortalama satış hesapla
    const averageMonthlySales = this.calculateAverageSales(
      salesHistory,
      calculationPeriodMonths
    );

    // 3. Bekleyen müşteri siparişleri
    const pendingCustomer = product.pendingCustomerOrders || 0;

    // 4. Fazla stok hesapla
    // Fazla Stok = Toplam Stok - (Aylık Ortalama × Periyot) - Bekleyen Müşteri Siparişleri
    let excessStock = totalStock - (averageMonthlySales * calculationPeriodMonths) - pendingCustomer;

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
   * Ortalama aylık satış hesapla
   *
   * Toplam satış / Periyot (ay sayısı)
   * Satış olmayan aylar da hesaba katılır (0 olarak)
   */
  private calculateAverageSales(
    salesHistory: Record<string, number>,
    periodMonths: number
  ): number {
    const now = new Date();

    // Son X ayın satışlarını topla
    let totalSales = 0;

    for (let i = 0; i < periodMonths; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;

      // Satış varsa ekle, yoksa 0 olarak hesaba kat
      totalSales += salesHistory[key] || 0;
    }

    // Ortalama = Toplam Satış / Periyot
    // Periyot 0 olamaz çünkü settings'den gelir
    return Math.ceil(totalSales / periodMonths);
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

    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { mikroCode: { contains: filters.search, mode: 'insensitive' } },
      ];
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
