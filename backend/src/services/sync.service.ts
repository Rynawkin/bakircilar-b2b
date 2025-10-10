/**
 * Sync Service
 *
 * Mikro ERP'den veri çekip PostgreSQL'e senkronize eder:
 * 1. Kategorileri sync
 * 2. Ürünleri sync
 * 3. Stokları güncelle
 * 4. Satış geçmişini güncelle
 * 5. Fazla stok hesapla
 * 6. Fiyatları hesapla
 */

import { prisma } from '../utils/prisma';
import mikroService from './mikroFactory.service';
import pricingService from './pricing.service';
import stockService from './stock.service';
import imageService from './image.service';

class SyncService {
  /**
   * Senkronizasyonu arka planda başlat ve log ID'sini döndür
   */
  async startSync(syncType: 'AUTO' | 'MANUAL' = 'MANUAL'): Promise<string> {
    // Sync log oluştur
    const syncLog = await prisma.syncLog.create({
      data: {
        syncType,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    // Arka planda sync'i çalıştır (await etme!)
    this.runFullSync(syncLog.id).catch((error) => {
      console.error('❌ Background sync error:', error);
    });

    return syncLog.id;
  }

  /**
   * Tam senkronizasyon çalıştır
   */
  async runFullSync(syncLogId: string): Promise<{
    success: boolean;
    stats: {
      categoriesUpdated: number;
      productsUpdated: number;
      pricesCalculated: number;
    };
    error?: string;
  }> {
    const startTime = new Date();

    try {
      console.log('🔄 Senkronizasyon başladı...');

      // 1. Kategorileri sync
      const categoriesCount = await this.syncCategories();
      console.log(`✅ ${categoriesCount} kategori sync edildi`);

      // Progress güncelle
      await prisma.syncLog.update({
        where: { id: syncLogId },
        data: { categoriesCount },
      });

      // 2. Ürünleri sync (stoklar, satış geçmişi dahil)
      const productsCount = await this.syncProducts();
      console.log(`✅ ${productsCount} ürün sync edildi`);

      // Progress güncelle
      await prisma.syncLog.update({
        where: { id: syncLogId },
        data: { productsCount },
      });

      // 3. Fazla stok hesapla
      await stockService.calculateExcessStockForAllProducts();
      console.log('✅ Fazla stoklar hesaplandı');

      // 4. Fiyatları hesapla
      const pricesCount = await pricingService.recalculateAllPrices();
      console.log(`✅ ${pricesCount} ürün için fiyatlar hesaplandı`);

      // 5. Resimleri sync et (sadece resmi olmayanlara)
      console.log('\n📸 Resim senkronizasyonu başlıyor...');
      const productsForImageSync = await prisma.product.findMany({
        where: {
          active: true,
          imageUrl: null, // Sadece resmi olmayanları çek
        },
        select: {
          id: true,
          mikroCode: true,
          name: true,
          imageUrl: true,
        },
      });

      // Mikro'dan GUID'leri al
      const mikroProducts = await mikroService.getProducts();
      const guidMap = new Map(mikroProducts.map(p => [p.code, p.guid]));

      // GUID'leri ekle
      const productsWithGuid = productsForImageSync
        .map(p => ({
          ...p,
          guid: guidMap.get(p.mikroCode),
        }))
        .filter(p => p.guid); // GUID olmayanlari atla

      const imageStats = await imageService.syncAllImages(productsWithGuid as any);

      // Settings'deki lastSyncAt güncelle
      await prisma.settings.updateMany({
        data: { lastSyncAt: new Date() },
      });

      // Sync log güncelle (warnings ile birlikte)
      await prisma.syncLog.update({
        where: { id: syncLogId },
        data: {
          status: 'SUCCESS',
          categoriesCount,
          productsCount,
          imagesDownloaded: imageStats.downloaded,
          imagesSkipped: imageStats.skipped,
          imagesFailed: imageStats.failed,
          warnings: imageStats.warnings.length > 0 ? imageStats.warnings : null,
          completedAt: new Date(),
        },
      });

      console.log('🎉 Senkronizasyon tamamlandı!');

      return {
        success: true,
        stats: {
          categoriesUpdated: categoriesCount,
          productsUpdated: productsCount,
          pricesCalculated: pricesCount,
        },
      };
    } catch (error: any) {
      console.error('❌ Senkronizasyon hatası:', error);

      // Sync log'u hata olarak güncelle
      await prisma.syncLog.update({
        where: { id: syncLogId },
        data: {
          status: 'FAILED',
          errorMessage: error.message,
          completedAt: new Date(),
        },
      });

      return {
        success: false,
        stats: {
          categoriesUpdated: 0,
          productsUpdated: 0,
          pricesCalculated: 0,
        },
        error: error.message,
      };
    }
  }

  /**
   * Kategorileri Mikro'dan çek ve sync et
   */
  private async syncCategories(): Promise<number> {
    const mikroCategories = await mikroService.getCategories();

    let count = 0;

    for (const mikroCat of mikroCategories) {
      await prisma.category.upsert({
        where: { mikroCode: mikroCat.code },
        update: {
          name: mikroCat.name,
          active: true,
        },
        create: {
          mikroCode: mikroCat.code,
          name: mikroCat.name,
          active: true,
        },
      });
      count++;
    }

    return count;
  }

  /**
   * Ürünleri Mikro'dan çek ve sync et
   */
  private async syncProducts(): Promise<number> {
    const [mikroProducts, warehouseStocks, salesHistory, pendingOrders] = await Promise.all([
      mikroService.getProducts(),
      mikroService.getWarehouseStocks(),
      mikroService.getSalesHistory(),
      mikroService.getPendingOrders(),
    ]);

    let count = 0;

    for (const mikroProduct of mikroProducts) {
      // Kategorisini bul
      const category = await prisma.category.findUnique({
        where: { mikroCode: mikroProduct.categoryId },
      });

      if (!category) {
        console.warn(`⚠️ Kategori bulunamadı: ${mikroProduct.categoryId} (Ürün: ${mikroProduct.code})`);
        continue;
      }

      // Ürünün stok bilgilerini topla
      const productStocks = warehouseStocks.filter((s) => s.productCode === mikroProduct.code);
      const warehouseStocksJson: Record<string, number> = {};
      productStocks.forEach((s) => {
        warehouseStocksJson[s.warehouseCode] = s.quantity;
      });

      // Satış geçmişini topla
      const productSales = salesHistory.filter((s) => s.productCode === mikroProduct.code);
      const salesHistoryJson: Record<string, number> = {};
      productSales.forEach((s) => {
        const key = `${s.year}-${s.month.toString().padStart(2, '0')}`;
        salesHistoryJson[key] = s.totalQuantity;
      });

      // Bekleyen siparişleri topla
      const pendingSales = pendingOrders
        .filter((o) => o.productCode === mikroProduct.code && o.type === 'SALES')
        .reduce((sum, o) => sum + o.quantity, 0);

      const pendingPurchases = pendingOrders
        .filter((o) => o.productCode === mikroProduct.code && o.type === 'PURCHASE')
        .reduce((sum, o) => sum + o.quantity, 0);

      // Ürünü upsert et
      await prisma.product.upsert({
        where: { mikroCode: mikroProduct.code },
        update: {
          name: mikroProduct.name,
          unit: mikroProduct.unit,
          categoryId: category.id,
          lastEntryPrice: mikroProduct.lastEntryPrice,
          lastEntryDate: mikroProduct.lastEntryDate,
          currentCost: mikroProduct.currentCost,
          currentCostDate: mikroProduct.currentCostDate,
          vatRate: mikroProduct.vatRate,
          warehouseStocks: warehouseStocksJson,
          salesHistory: salesHistoryJson,
          pendingCustomerOrders: pendingSales,
          pendingPurchaseOrders: pendingPurchases,
          active: true,
        },
        create: {
          mikroCode: mikroProduct.code,
          name: mikroProduct.name,
          unit: mikroProduct.unit,
          categoryId: category.id,
          lastEntryPrice: mikroProduct.lastEntryPrice,
          lastEntryDate: mikroProduct.lastEntryDate,
          currentCost: mikroProduct.currentCost,
          currentCostDate: mikroProduct.currentCostDate,
          vatRate: mikroProduct.vatRate,
          warehouseStocks: warehouseStocksJson,
          salesHistory: salesHistoryJson,
          pendingCustomerOrders: pendingSales,
          pendingPurchaseOrders: pendingPurchases,
          excessStock: 0,
          prices: {},
          active: true,
        },
      });

      count++;
    }

    return count;
  }

  /**
   * Tek bir ürünü sync et (anlık güncelleme için)
   */
  async syncSingleProduct(productId: string): Promise<void> {
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new Error('Product not found');
    }

    // Mikro'dan güncel veriyi çek
    const [warehouseStocks] = await Promise.all([
      mikroService.getWarehouseStocks(),
    ]);

    // Bu ürünün stoklarını güncelle
    const productStocks = warehouseStocks.filter((s) => s.productCode === product.mikroCode);
    const warehouseStocksJson: Record<string, number> = {};
    productStocks.forEach((s) => {
      warehouseStocksJson[s.warehouseCode] = s.quantity;
    });

    await prisma.product.update({
      where: { id: productId },
      data: {
        warehouseStocks: warehouseStocksJson,
      },
    });

    // Fazla stok hesapla
    await stockService.calculateExcessStock(productId);
  }
}

export default new SyncService();
