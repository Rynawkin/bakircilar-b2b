/**
 * Stock Service
 *
 * Fazla stok hesaplama ve stok kontrolü
 */

import { prisma } from '../utils/prisma';
import mikroService from './mikroFactory.service';

class StockService {
  /**
   * Fazla stok hesapla (hem toplam hem depo bazlı)
   *
   * Formül:
   * Depo Fazla Stok = (Depo Stoku) - (Depo için aylık satış ort. * depo stok oranı) +
   *                   (Bekleyen alımlar * oran) - (Bekleyen satışlar * oran)
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

    // X aylık satış ortalaması (toplam)
    const averageMonthlySales = this.calculateAverageSales(
      salesHistory,
      calculationPeriodMonths
    );

    // Bekleyen siparişler
    const pendingPurchase = product.pendingPurchaseOrders;
    const pendingCustomer = product.pendingCustomerOrders;

    // 1. Toplam stok hesapla (sadece included warehouses)
    const totalStock = includedWarehouses.reduce((sum, warehouse) => {
      return sum + (warehouseStocks[warehouse] || 0);
    }, 0);

    // 2. Her depo için fazla stok hesapla
    const warehouseExcessStocks: Record<string, number> = {};
    let totalExcessStock = 0;

    for (const warehouse of includedWarehouses) {
      const warehouseStock = warehouseStocks[warehouse] || 0;

      // Bu deponun toplam stok içindeki oranı
      const warehouseRatio = totalStock > 0 ? warehouseStock / totalStock : 0;

      // Bu depoya düşen satış ortalaması
      const warehouseSalesAvg = Math.ceil(averageMonthlySales * warehouseRatio);

      // Bu depoya düşen bekleyen siparişler
      const warehousePendingPurchase = Math.ceil(pendingPurchase * warehouseRatio);
      const warehousePendingCustomer = Math.ceil(pendingCustomer * warehouseRatio);

      // Depo fazla stok hesapla
      let warehouseExcess = warehouseStock - warehouseSalesAvg + warehousePendingPurchase - warehousePendingCustomer;

      // Negatif ise 0 yap
      warehouseExcess = Math.max(0, warehouseExcess);

      warehouseExcessStocks[warehouse] = warehouseExcess;
      totalExcessStock += warehouseExcess;
    }

    // 3. Minimum eşik kontrolü
    const finalExcessStock = totalExcessStock >= minimumExcessThreshold ? totalExcessStock : 0;

    // Eğer toplam fazla stok 0 ise, tüm depo fazla stokları da 0 yap
    if (finalExcessStock === 0) {
      for (const warehouse of includedWarehouses) {
        warehouseExcessStocks[warehouse] = 0;
      }
    }

    // 4. Veritabanını güncelle
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
  async calculateExcessStockForAllProducts(): Promise<number> {
    const products = await prisma.product.findMany({
      where: { active: true },
    });

    let count = 0;

    for (const product of products) {
      await this.calculateExcessStock(product.id);
      count++;
    }

    return count;
  }

  /**
   * Ortalama aylık satış hesapla
   */
  private calculateAverageSales(
    salesHistory: Record<string, number>,
    periodMonths: number
  ): number {
    const now = new Date();
    const entries = Object.entries(salesHistory);

    // Son X ayın satışlarını topla
    let totalSales = 0;
    let monthsWithSales = 0;

    for (let i = 0; i < periodMonths; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;

      if (salesHistory[key]) {
        totalSales += salesHistory[key];
        monthsWithSales++;
      }
    }

    // Ortalama hesapla
    if (monthsWithSales === 0) {
      return 0;
    }

    return Math.ceil(totalSales / monthsWithSales);
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
