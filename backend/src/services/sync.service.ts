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
import { UserRole } from '@prisma/client';
import mikroService from './mikroFactory.service';
import pricingService from './pricing.service';
import stockService from './stock.service';
import imageService from './image.service';
import priceSyncService from './priceSync.service';
import notificationService from './notification.service';
import {
  MikroSyncBusyError,
  withMikroSyncLock,
} from '../utils/mikro-sync-lock';
import { runRequiredMikroSyncStages } from '../utils/mikro-sync-sequence';

class SyncService {
  // 12.6: Ayni anda iki tam senkronun calismasini engelleyen kilit
  private isRunning = false;

  /** 12.3/12.6: Disaridan (or. fiyat senkronu cron'u) tam senkronun calisip
   *  calismadigini kontrol etmek icin. Ortak Mikro baglantisinin kesilmesini onler. */
  isBusy(): boolean {
    return this.isRunning;
  }

  /**
   * 12.5 / 12.1: Senkron hatasi veya anomalisinde yoneticilere bildirim gonder.
   */
  private async notifyAdmins(title: string, body: string): Promise<void> {
    try {
      const admins = await prisma.user.findMany({
        where: { role: { in: [UserRole.HEAD_ADMIN, UserRole.ADMIN] } },
        select: { id: true },
      });
      await notificationService.createForUsers(
        admins.map((a) => a.id),
        { category: 'SYSTEM', title, body, linkUrl: '/dashboard' }
      );
    } catch (e) {
      console.error('notifyAdmins basarisiz:', e);
    }
  }
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
      return Number.isNaN(dateStr.getTime()) ? null : dateStr;
    }

    // String kontrolü
    if (typeof dateStr !== 'string' || dateStr.trim() === '') {
      return null;
    }

    const cleaned = dateStr.trim();
    const isValidDateParts = (year: number, month: number, day: number) => {
      if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
      if (year < 1900 || year > 2500 || month < 1 || month > 12 || day < 1 || day > 31) return false;
      const parsed = new Date(Date.UTC(year, month - 1, day));
      return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
    };

    // Mikro current cost date is stored as dd.mm.yyyy. Parse it before new Date(),
    // otherwise strings like 08.05.2026 are interpreted as August 5 by JavaScript.
    const trMatch = cleaned.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s.*)?$/);
    if (trMatch) {
      const day = Number(trMatch[1]);
      const month = Number(trMatch[2]);
      const year = Number(trMatch[3]);
      if (isValidDateParts(year, month, day)) {
        return new Date(Date.UTC(year, month - 1, day));
      }
      return null;
    }

    const isoDateOnlyMatch = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
    if (isoDateOnlyMatch) {
      const year = Number(isoDateOnlyMatch[1]);
      const month = Number(isoDateOnlyMatch[2]);
      const day = Number(isoDateOnlyMatch[3]);
      if (isValidDateParts(year, month, day)) {
        return new Date(Date.UTC(year, month - 1, day));
      }
      return null;
    }

    const parsedDate = new Date(cleaned);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  /**
   * Senkronizasyonu arka planda başlat ve log ID'sini döndür
   */
  async startSync(syncType: 'AUTO' | 'MANUAL' = 'MANUAL'): Promise<string> {
    // 12.6: Zaten calisan bir senkron varken yenisini baslatma (cron + manuel cakismasi)
    if (this.isRunning) {
      throw new Error('Senkronizasyon zaten calisiyor. Lutfen mevcut islemin bitmesini bekleyin.');
    }
    this.isRunning = true;

    // Sync log oluştur
    let syncLog;
    try {
      syncLog = await prisma.syncLog.create({
        data: {
          syncType,
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });
    } catch (e) {
      this.isRunning = false;
      throw e;
    }

    // Arka planda sync'i çalıştır (await etme!)
    withMikroSyncLock(async () => {
      const sequence = await runRequiredMikroSyncStages(
        () => this.runFullSync(syncLog.id),
        () => priceSyncService.syncPriceChangesWithinExistingLock()
      );

      if (!sequence.success) {
        if (sequence.fullResult.success) {
          const errorMessage =
            sequence.error || 'Fiyat senkronizasyonu tamamlanamadi.';
          await prisma.syncLog.update({
            where: { id: syncLog.id },
            data: {
              status: 'FAILED',
              errorMessage,
              completedAt: new Date(),
            },
          });
          await this.notifyAdmins(
            'Senkronizasyon basarisiz',
            `Stok senkronu tamamlandi ancak zorunlu fiyat senkronu basarisiz: ${errorMessage}`
          );
        }

        return;
      }

      const stats = sequence.fullResult.stats;
      const completedAt = new Date();
      await prisma.$transaction([
        prisma.settings.updateMany({
          data: { lastSyncAt: completedAt },
        }),
        prisma.syncLog.update({
          where: { id: syncLog.id },
          data: {
            status: 'SUCCESS',
            categoriesCount: stats.categoriesUpdated,
            productsCount: stats.productsUpdated,
            completedAt,
          },
        }),
      ]);
      console.log('Stok ve fiyat senkronizasyonu tamamlandi.');
    })
      .catch(async (error) => {
        const errorMessage =
          error instanceof MikroSyncBusyError
            ? error.message
            : String(error?.message || error || 'Bilinmeyen senkronizasyon hatasi');
        await prisma.syncLog
          .update({
            where: { id: syncLog.id },
            data: {
              status: 'FAILED',
              errorMessage,
              completedAt: new Date(),
            },
          })
          .catch(() => {});
        await this.notifyAdmins(
          'Senkronizasyon basarisiz',
          `Otomatik/manuel senkronizasyon baslatilamadi veya yarida kaldi: ${errorMessage}`
        );
        console.error('Background sync error:', error);
      })
      .finally(() => {
        this.isRunning = false;
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

      // 5. Stok alarmi bildirimleri (best-effort; senkron sonucunu etkilemez)
      await this.processStockAlerts();

      console.log('Tam stok senkronu adimlari tamamlandi; fiyat asamasina geciliyor.');

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

      // 12.5: Senkron sessizce cokmemeli; yoneticilere bildirim gonder
      await this.notifyAdmins(
        'Senkronizasyon basarisiz',
        `Otomatik/manuel senkronizasyon hata verdi: ${error?.message || 'Bilinmeyen hata'}. Fiyat/stok verisi guncellenememis olabilir.`
      );

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
   * Settings.includedWarehouses girdilerini Mikro depo NUMARALARINA çevirir.
   *
   * Pratikte liste, warehouseStocks JSON anahtarlarıyla aynı numerik string'leri
   * tutar ('1','2','6','7'; bkz. mikro.service getProducts depo eşlemesi ve
   * getRealtimeStock'taki parseInt kullanımı). Eski kayıtlarda depo ADI kalmış
   * olabileceği için bilinen ad -> numara eşlemesi de desteklenir
   * (1=Merkez, 2=Ereğli, 6=Topça, 7=Dükkan).
   */
  private resolveIncludedWarehouseNos(includedWarehouses: string[]): number[] {
    const NAME_TO_NO: Record<string, number> = {
      MERKEZ: 1,
      EREGLI: 2,
      'EREĞLİ': 2,
      'EREĞLI': 2,
      TOPCA: 6,
      'TOPÇA': 6,
      DUKKAN: 7,
      'DÜKKAN': 7,
    };

    const nos = new Set<number>();
    for (const raw of includedWarehouses || []) {
      const value = String(raw || '').trim();
      if (!value) continue;

      const numeric = Number(value);
      if (Number.isInteger(numeric) && numeric > 0) {
        nos.add(numeric);
        continue;
      }

      const mapped = NAME_TO_NO[value.toUpperCase()];
      if (mapped) {
        nos.add(mapped);
      }
    }

    return Array.from(nos);
  }

  /**
   * Ürünleri Mikro'dan çek ve sync et
   */
  private async syncProducts(): Promise<number> {
    const [mikroProducts, salesHistory, pendingOrdersByWarehouse] = await Promise.all([
      mikroService.getProducts(),
      mikroService.getSalesHistory(),
      mikroService.getPendingOrdersByWarehouse(),
    ]);

    console.log(`📊 Mikro'dan ${mikroProducts.length} ürün çekildi`);

    // MAX-bazlı fazla stok hesabı için: dahil depoların STOK_DEPO_DETAYLARI
    // min/max toplamlarını TEK toplu sorguyla çek (ürün başına sorgu YOK).
    // Mock serviste bu metod yok; o durumda veya sorgu hatasında alanlar
    // GÜNCELLENMEZ (mevcut değerler korunur) ve fazla stok hesabı eski
    // satış-hızı formülüne düşer (bkz. stock.service.calculateExcessStock).
    const settingsForMinMax = await prisma.settings.findFirst({
      select: { includedWarehouses: true },
    });
    const includedWarehouseNos = this.resolveIncludedWarehouseNos(
      settingsForMinMax?.includedWarehouses || []
    );

    const minMaxTotalsMap = new Map<string, { min: number; max: number }>();
    let minMaxFetched = false;
    const mikroServiceWithMinMax = mikroService as unknown as {
      getStockMinMaxTotals?: (
        warehouseNos: number[]
      ) => Promise<Array<{ productCode: string; minTotal: number; maxTotal: number }>>;
    };

    if (
      includedWarehouseNos.length > 0 &&
      typeof mikroServiceWithMinMax.getStockMinMaxTotals === 'function'
    ) {
      try {
        const minMaxRows = await mikroServiceWithMinMax.getStockMinMaxTotals(includedWarehouseNos);
        for (const row of minMaxRows) {
          minMaxTotalsMap.set(row.productCode, { min: row.minTotal, max: row.maxTotal });
        }
        minMaxFetched = true;
        console.log(
          `📊 ${minMaxTotalsMap.size} ürün için min/max toplamları çekildi (depolar: ${includedWarehouseNos.join(', ')})`
        );
      } catch (error: any) {
        console.error(
          '⚠️ Min/max toplamları çekilemedi, mevcut değerler korunuyor:',
          error?.message || error
        );
      }
    }

    // 12.1: Mikro gecici hata/timeout ile EKSIK liste dondurdugunde, listede olmayan
    // tum urunlerin toptan pasife cekilip vitrinden kaybolmasini onleyen guvenlik esigi.
    // Donen urun sayisi, mevcut aktif urun sayisinin %50'sinin altindaysa pasiflestirmeyi
    // ATLA ve yoneticilere bildir (gercek toplu silme degil, eksik veri suphesi).
    if (mikroProducts.length > 0) {
      const mikroCodes = mikroProducts.map((product) => product.code);
      const activeCount = await prisma.product.count({ where: { active: true } });
      const SAFETY_RATIO = 0.5;

      if (activeCount > 0 && mikroProducts.length < activeCount * SAFETY_RATIO) {
        console.error(
          `⚠️ Pasiflestirme ATLANDI: Mikro ${mikroProducts.length} urun dondu, mevcut aktif urun ${activeCount}. ` +
          `Esik (%${SAFETY_RATIO * 100}) altinda kalindi; eksik liste suphesiyle urunler pasife cekilmedi.`
        );
        await this.notifyAdmins(
          'Urun senkronu: eksik liste suphesi',
          `Mikro beklenenden cok az urun dondurdu (${mikroProducts.length} / aktif ${activeCount}). ` +
          `Urunlerin yanlislikla pasife cekilmesini onlemek icin pasiflestirme atlandi. Mikro baglantisini/raporu kontrol edin.`
        );
      } else {
        await prisma.product.updateMany({
          where: {
            active: true,
            mikroCode: { notIn: mikroCodes },
            // Paketler (isBundle) sentetik koda sahiptir; Mikro listesinde olmadigi icin
            // asla pasife cekilmemeli (guard).
            isBundle: false,
          },
          data: { active: false },
        });
      }
    }

    let count = 0;
    let skippedNoCategory = 0;

    const pendingMap = new Map<string, {
      sales: number;
      purchases: number;
      salesByWarehouse: Record<string, number>;
    }>();

    for (const pending of pendingOrdersByWarehouse) {
      const productCode = String(pending.productCode || '').trim();
      if (!productCode) continue;

      const entry = pendingMap.get(productCode) || {
        sales: 0,
        purchases: 0,
        salesByWarehouse: {},
      };

      const quantity = Math.max(0, Number(pending.quantity) || 0);
      if (pending.type === 'SALES') {
        entry.sales += quantity;
        const warehouseKey = String(pending.warehouseCode || '').trim();
        if (warehouseKey) {
          entry.salesByWarehouse[warehouseKey] = (entry.salesByWarehouse[warehouseKey] || 0) + quantity;
        }
      } else {
        entry.purchases += quantity;
      }

      pendingMap.set(productCode, entry);
    }

    let errorCount = 0;
    for (const mikroProduct of mikroProducts) {
      try {
      // Kategorisini bul
      const category = await prisma.category.findUnique({
        where: { mikroCode: mikroProduct.categoryId },
      });

      if (!category) {
        console.warn(`⚠️ Kategori bulunamadı: ${mikroProduct.categoryId} (Ürün: ${mikroProduct.code})`);
        skippedNoCategory++;
        continue;
      }

      // Depo stokları zaten mikroProduct.warehouseStocks içinde geliyor
      const warehouseStocksJson = mikroProduct.warehouseStocks || {};
      const unit2 = mikroProduct.unit2?.trim() || null;
      const rawUnit2Factor = Number(mikroProduct.unit2Factor);
      const unit2Factor = Number.isFinite(rawUnit2Factor) && rawUnit2Factor !== 0 ? rawUnit2Factor : null;

      // Satış geçmişini topla (günlük)
      const productSales = salesHistory.filter((s) => s.productCode === mikroProduct.code);
      const salesHistoryJson: Record<string, number> = {};
      productSales.forEach((s) => {
        // YYYY-MM-DD formatına çevir
        const saleDate = s.saleDate instanceof Date ? s.saleDate : new Date(s.saleDate);
        const key = saleDate.toISOString().split('T')[0];
        salesHistoryJson[key] = s.totalQuantity;
      });

      // Bekleyen siparişleri topla
      const pendingEntry = pendingMap.get(mikroProduct.code);
      const pendingSales = pendingEntry?.sales || 0;
      const pendingPurchases = pendingEntry?.purchases || 0;
      const pendingSalesByWarehouse = pendingEntry?.salesByWarehouse || {};

      // Tarihleri parse et
      const parsedCurrentCostDate = this.parseDateString(mikroProduct.currentCostDate);

      // Min/max toplamları (MAX-bazlı fazla stok için).
      // minMaxFetched=false ise alanlara HİÇ dokunma (mevcut değerler kalsın);
      // fetch başarılıysa kaydı olmayan ürünlerde null'a çek (bayat değer kalmasın).
      const minMaxEntry = minMaxTotalsMap.get(String(mikroProduct.code || '').trim());
      const minMaxData: { minStockTotal?: number | null; maxStockTotal?: number | null } =
        minMaxFetched
          ? {
              minStockTotal: minMaxEntry ? minMaxEntry.min : null,
              maxStockTotal: minMaxEntry ? minMaxEntry.max : null,
            }
          : {};

      // Ürünü upsert et
        await prisma.product.upsert({
          where: { mikroCode: mikroProduct.code },
          update: {
            name: mikroProduct.name,
            foreignName: mikroProduct.foreignName || null,
            brandCode: mikroProduct.brandCode || null,
            unit: mikroProduct.unit,
            unit2,
            unit2Factor,
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
          pendingCustomerOrdersByWarehouse: pendingSalesByWarehouse,
          ...minMaxData,
          active: true,
        },
          create: {
            mikroCode: mikroProduct.code,
            name: mikroProduct.name,
            foreignName: mikroProduct.foreignName || null,
            brandCode: mikroProduct.brandCode || null,
            unit: mikroProduct.unit,
            unit2,
            unit2Factor,
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
          pendingCustomerOrdersByWarehouse: pendingSalesByWarehouse,
          ...minMaxData,
          excessStock: 0,
          prices: {},
          active: true,
        },
      });

      count++;
      } catch (err: any) {
        // 12.4: Tek bir urunun hatasi tum senkronu cokertmesin; logla, atla, devam et.
        errorCount++;
        console.error(`⚠️ Urun sync hatasi atlandi (${mikroProduct.code}):`, err?.message || err);
      }
    }

    if (errorCount > 0) {
      console.warn(`⚠️ ${errorCount} urun sync sirasinda hata verdi ve atlandi (toplam ${mikroProducts.length}).`);
      if (errorCount > mikroProducts.length * 0.2) {
        await this.notifyAdmins(
          'Urun senkronu: cok sayida urun hatasi',
          `${mikroProducts.length} urunun ${errorCount} tanesi senkron sirasinda hata verdi ve atlandi. Veri kismen guncel olabilir.`
        );
      }
    }

    return count;
  }

  /**
   * Stok alarmi bildirimleri: bekleyen alarmlardan (notifiedAt null) urunu
   * stoga girenlere (depo 1+6 toplam stok > 0) Turkce in-app bildirim uretir;
   * push varsa notification service uzerinden best-effort gonderilir.
   * Senkron akisini yavaslatmamak icin tek toplu sorgu + try/catch ile calisir.
   */
  private async processStockAlerts(): Promise<void> {
    try {
      const alerts = await prisma.productStockAlert.findMany({
        where: {
          notifiedAt: null,
          product: { active: true, hiddenFromCustomers: false },
        },
        select: {
          id: true,
          userId: true,
          productId: true,
          product: {
            select: { name: true, warehouseStocks: true },
          },
        },
      });
      if (alerts.length === 0) return;

      // Depo 1 (merkez) + depo 6 (Topca) toplam stogu > 0 olan urunlerin alarmlari
      const inStockAlerts = alerts.filter((alert) => {
        const stocks = (alert.product?.warehouseStocks || {}) as Record<string, number>;
        return (Number(stocks['1']) || 0) + (Number(stocks['6']) || 0) > 0;
      });
      if (inStockAlerts.length === 0) return;

      // Ayni urunu bekleyen kullanicilara tek seferde bildir
      const byProduct = new Map<string, { name: string; userIds: string[]; alertIds: string[] }>();
      for (const alert of inStockAlerts) {
        const entry = byProduct.get(alert.productId) || {
          name: alert.product?.name || 'Urun',
          userIds: [],
          alertIds: [],
        };
        entry.userIds.push(alert.userId);
        entry.alertIds.push(alert.id);
        byProduct.set(alert.productId, entry);
      }

      const notifiedAlertIds: string[] = [];
      for (const [productId, entry] of byProduct) {
        try {
          await notificationService.createForUsers(entry.userIds, {
            category: 'STOCK',
            title: 'Beklediginiz urun stokta',
            body: `${entry.name} urunu stoga girdi — hemen siparis verebilirsiniz.`,
            linkUrl: `/products/${productId}`,
          });
          notifiedAlertIds.push(...entry.alertIds);
        } catch (error) {
          console.error(`Stok alarmi bildirimi gonderilemedi (${productId}):`, error);
        }
      }

      if (notifiedAlertIds.length > 0) {
        await prisma.productStockAlert.updateMany({
          where: { id: { in: notifiedAlertIds } },
          data: { notifiedAt: new Date() },
        });
        console.log(`✅ ${notifiedAlertIds.length} stok alarmi bildirildi`);
      }
    } catch (error) {
      console.error('Stok alarmi bildirimleri islenemedi:', error);
    }
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

  async startImageSyncForProducts(productIds: string[]): Promise<string> {
    const syncLog = await prisma.syncLog.create({
      data: {
        syncType: 'MANUAL',
        status: 'RUNNING',
        startedAt: new Date(),
        details: {
          scope: 'SELECTED',
          selectedCount: productIds.length,
        },
      },
    });

    this.runImageSyncForProducts(productIds, syncLog.id).catch((error) => {
      console.error('Background selected image sync error:', error);
    });

    return syncLog.id;
  }

  async runImageSyncForProducts(
    productIds: string[],
    syncLogId: string
  ): Promise<{
    success: boolean;
    stats: {
      downloaded: number;
      skipped: number;
      failed: number;
    };
    error?: string;
  }> {
    try {
      console.log('Secili urunler icin resim senkronu basliyor...');

      const productsForImageSync = await prisma.product.findMany({
        where: {
          id: { in: productIds },
          active: true,
          imageUrl: null,
        },
        select: {
          id: true,
          mikroCode: true,
          name: true,
          imageUrl: true,
        },
      });

      if (productsForImageSync.length === 0) {
        await prisma.syncLog.update({
          where: { id: syncLogId },
          data: {
            status: 'SUCCESS',
            imagesDownloaded: 0,
            imagesSkipped: 0,
            imagesFailed: 0,
            completedAt: new Date(),
          },
        });

        return {
          success: true,
          stats: {
            downloaded: 0,
            skipped: 0,
            failed: 0,
          },
        };
      }

      const codes = productsForImageSync.map((product) => product.mikroCode);
      const guidRows = await mikroService.getProductGuidsByCodes(codes);
      const guidMap = new Map(guidRows.map((row) => [row.code, row.guid]));

      const productsWithGuid = productsForImageSync
        .map((product) => ({
          ...product,
          guid: guidMap.get(product.mikroCode),
        }))
        .filter((product) => product.guid);

      const productsMissingGuid = productsForImageSync.filter(
        (product) => !guidMap.get(product.mikroCode)
      );

      if (productsMissingGuid.length > 0) {
        await prisma.product.updateMany({
          where: { id: { in: productsMissingGuid.map((product) => product.id) } },
          data: {
            imageSyncStatus: 'SKIPPED',
            imageSyncErrorType: 'NO_GUID',
            imageSyncErrorMessage: 'GUID bulunamadi',
            imageSyncUpdatedAt: new Date(),
            imageChecksum: null,
          },
        });
      }

      const imageStats = await imageService.syncAllImages(productsWithGuid as any, syncLogId);
      const missingGuidWarnings = productsMissingGuid.slice(0, 50).map((product) => ({
        type: 'NO_GUID',
        productCode: product.mikroCode,
        productName: product.name,
        message: 'GUID bulunamadi',
      }));

      const warnings = [...imageStats.warnings, ...missingGuidWarnings];
      const skippedTotal = imageStats.skipped + productsMissingGuid.length;

      await prisma.syncLog.update({
        where: { id: syncLogId },
        data: {
          status: 'SUCCESS',
          categoriesCount: 0,
          productsCount: 0,
          imagesDownloaded: imageStats.downloaded,
          imagesSkipped: skippedTotal,
          imagesFailed: imageStats.failed,
          warnings: warnings.length > 0 ? warnings : undefined,
          completedAt: new Date(),
        },
      });

      console.log('Secili resim senkronu tamamlandi!');

      return {
        success: true,
        stats: {
          downloaded: imageStats.downloaded,
          skipped: skippedTotal,
          failed: imageStats.failed,
        },
      };
    } catch (error: any) {
      console.error('Secili resim senkronu hatasi:', error);

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

      const codes = productsForImageSync.map((product) => product.mikroCode);
      const guidRows = await mikroService.getProductGuidsByCodes(codes);
      const guidMap = new Map(guidRows.map((row) => [row.code, row.guid]));

      const productsWithGuid = productsForImageSync
        .map((product) => ({
          ...product,
          guid: guidMap.get(product.mikroCode),
        }))
        .filter((product) => product.guid);

      const productsMissingGuid = productsForImageSync.filter(
        (product) => !guidMap.get(product.mikroCode)
      );

      if (productsMissingGuid.length > 0) {
        await prisma.product.updateMany({
          where: { id: { in: productsMissingGuid.map((product) => product.id) } },
          data: {
            imageSyncStatus: 'SKIPPED',
            imageSyncErrorType: 'NO_GUID',
            imageSyncErrorMessage: 'GUID bulunamadi',
            imageSyncUpdatedAt: new Date(),
            imageChecksum: null,
          },
        });
      }

      console.log(`✅ ${productsWithGuid.length} ürün için GUID bulundu`);

      // Resimleri sync et
      const imageStats = await imageService.syncAllImages(productsWithGuid as any, syncLogId);
      const missingGuidWarnings = productsMissingGuid.slice(0, 50).map((product) => ({
        type: 'NO_GUID',
        productCode: product.mikroCode,
        productName: product.name,
        message: 'GUID bulunamadi',
      }));

      const warnings = [...imageStats.warnings, ...missingGuidWarnings];
      const skippedTotal = imageStats.skipped + productsMissingGuid.length;

      // Sync log güncelle (warnings ile birlikte)
      await prisma.syncLog.update({
        where: { id: syncLogId },
        data: {
          status: 'SUCCESS',
          categoriesCount: 0,
          productsCount: 0,
          imagesDownloaded: imageStats.downloaded,
          imagesSkipped: skippedTotal,
          imagesFailed: imageStats.failed,
          warnings: warnings.length > 0 ? warnings : undefined,
          completedAt: new Date(),
        },
      });

      console.log('🎉 Resim senkronizasyonu tamamlandı!');
      console.log(`  ✅ İndirilen: ${imageStats.downloaded}`);
      console.log(`  ⏭️ Atlanan: ${skippedTotal}`);
      console.log(`  ❌ Başarısız: ${imageStats.failed}`);

      return {
        success: true,
        stats: {
          downloaded: imageStats.downloaded,
          skipped: skippedTotal,
          failed: imageStats.failed,
        },
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
