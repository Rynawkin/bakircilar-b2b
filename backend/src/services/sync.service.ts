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
   * Tarih string'ini parse et (Türkçe formatı ISO'ya çevir)
   * Geçersiz tarihler için null döner
   */
  private parseDateString(dateStr: string | Date | null | undefined): Date | null {
    if (!dateStr) {
      return null;
    }

    // Eğer zaten Date objesi ise direkt döndür
    if (dateStr instanceof Date) {
      return dateStr;
    }

    // String kontrolü
    if (typeof dateStr !== 'string' || dateStr.trim() === '') {
      return null;
    }

    // Eğer zaten ISO formatındaysa direkt parse et
    const isoDate = new Date(dateStr);
    if (!isNaN(isoDate.getTime())) {
      return isoDate;
    }

    // Türkçe format: "22.3.2024" veya "22.03.2024"
    const parts = dateStr.split('.');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
      const year = parseInt(parts[2], 10);

      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        const parsed = new Date(year, month, day);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      }
    }

    return null;
  }

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
      await stockService.calculateExcessStockForAllProducts(syncLogId);
      console.log('✅ Fazla stoklar hesaplandı');

      // 4. Fiyatları hesapla
      const pricesCount = await pricingService.recalculateAllPrices(syncLogId);
      console.log(`✅ ${pricesCount} ürün için fiyatlar hesaplandı`);

      // Settings'deki lastSyncAt güncelle
      await prisma.settings.updateMany({
        data: { lastSyncAt: new Date() },
      });

      // Sync log güncelle (resim sync artık ayrı)
      await prisma.syncLog.update({
        where: { id: syncLogId },
        data: {
          status: 'SUCCESS',
          categoriesCount,
          productsCount,
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
    const [mikroProducts, salesHistory, pendingOrders] = await Promise.all([
      mikroService.getProducts(),
      mikroService.getSalesHistory(),
      mikroService.getPendingOrders(),
    ]);

    console.log(`📊 Mikro'dan ${mikroProducts.length} ürün çekildi`);

    let count = 0;
    let skippedNoCategory = 0;

    for (const mikroProduct of mikroProducts) {
      // Kategorisini bul
      const category = await prisma.category.findUnique({
        where: { mikroCode: mikroProduct.categoryId },
      });

      if (!category) {
        console.warn(`⚠️ Kategori bulunamadı: ${mikroProduct.categoryId} (Ürün: ${mikroProduct.code})`);
        continue;
      }

      // Depo stokları zaten mikroProduct.warehouseStocks içinde geliyor
      const warehouseStocksJson = mikroProduct.warehouseStocks || {};

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

      // Tarihleri parse et
      const parsedCurrentCostDate = this.parseDateString(mikroProduct.currentCostDate);

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
          currentCostDate: parsedCurrentCostDate,
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
          currentCostDate: parsedCurrentCostDate,
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

  /**
   * Resim senkronizasyonunu başlat ve log ID döndür
   */
  async startImageSync(): Promise<string> {
    // Sync log oluştur
    const syncLog = await prisma.syncLog.create({
      data: {
        syncType: 'MANUAL',
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    // Arka planda resim sync'i çalıştır (await etme!)
    this.runImageSync(syncLog.id).catch((error) => {
      console.error('❌ Background image sync error:', error);
    });

    return syncLog.id;
  }

  /**
   * Sadece resim senkronizasyonunu çalıştır
   */
  async runImageSync(syncLogId: string): Promise<{
    success: boolean;
    stats: {
      downloaded: number;
      skipped: number;
      failed: number;
    };
    error?: string;
  }> {
    try {
      console.log('📸 Resim senkronizasyonu başlıyor...');

      // Sadece resmi olmayan ürünleri getir
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

      console.log(`📊 ${productsForImageSync.length} ürün için resim sync edilecek`);

      // Mikro'dan GUID'leri al
      const mikroProducts = await mikroService.getProducts();
      const guidMap = new Map(mikroProducts.map(p => [p.code, p.guid]));

      // GUID'leri ekle
      const productsWithGuid = productsForImageSync
        .map(p => ({
          ...p,
          guid: guidMap.get(p.mikroCode),
        }))
        .filter(p => p.guid); // GUID olmayanları atla

      console.log(`✅ ${productsWithGuid.length} ürün için GUID bulundu`);

      // Resimleri sync et
      const imageStats = await imageService.syncAllImages(productsWithGuid as any, syncLogId);

      // Sync log güncelle (warnings ile birlikte)
      await prisma.syncLog.update({
        where: { id: syncLogId },
        data: {
          status: 'SUCCESS',
          categoriesCount: 0,
          productsCount: 0,
          imagesDownloaded: imageStats.downloaded,
          imagesSkipped: imageStats.skipped,
          imagesFailed: imageStats.failed,
          warnings: imageStats.warnings.length > 0 ? imageStats.warnings : undefined,
          completedAt: new Date(),
        },
      });

      console.log('🎉 Resim senkronizasyonu tamamlandı!');
      console.log(`  ✅ İndirilen: ${imageStats.downloaded}`);
      console.log(`  ⏭️ Atlanan: ${imageStats.skipped}`);
      console.log(`  ❌ Başarısız: ${imageStats.failed}`);

      return {
        success: true,
        stats: imageStats,
      };
    } catch (error: any) {
      console.error('❌ Resim senkronizasyon hatası:', error);

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
          downloaded: 0,
          skipped: 0,
          failed: 0,
        },
        error: error.message,
      };
    }
  }
}

export default new SyncService();
