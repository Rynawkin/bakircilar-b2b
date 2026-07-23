/**
 * Price Synchronization Service
 *
 * Mikro ERP'den fiyat değişikliklerini PostgreSQL'e senkronize eder
 * - İlk çalıştırmada: Tüm geçmişi çeker (full sync)
 * - Sonraki çalıştırmalarda: Sadece son sync'ten sonraki değişiklikleri çeker (incremental sync)
 */

import { PrismaClient } from '@prisma/client';
import mikroService from './mikro.service';
import pricingService from './pricing.service';
import { randomUUID } from 'crypto';
import {
  LEGACY_STANDARD_PRICE_LIST_NOS,
  SYNC_PRICE_LIST_NOS,
} from '../config/price-list-registry';
import {
  MikroPriceListCosts,
  parseOptionalMikroNumber,
  resolvePriceListSnapshotMetrics,
} from '../utils/price-list-snapshot';
import {
  MikroSyncBusyError,
  withMikroSyncLock,
} from '../utils/mikro-sync-lock';

const prisma = new PrismaClient();

interface PriceChangeRecord {
  fid_Guid: string;
  fid_stok_kod: string;
  fid_tarih: Date;
  fid_fiyat_no: number;
  fid_eskifiy_tutar: number;
  fid_yenifiy_tutar: number;
  sto_isim: string;
  sto_marka_kodu: string | null;
  sto_standartmaliyet: number;
}

type PriceListMap = Map<string, Map<number, number>>;
type PriceCostMap = Map<string, MikroPriceListCosts>;

type PriceSyncSnapshot = {
  priceListMap: PriceListMap;
  priceCostMap: PriceCostMap;
};

type PriceSyncResult = {
  success: boolean;
  syncType: 'full' | 'incremental';
  recordsSynced: number;
  error?: string;
};

class PriceSyncService {
  // 12.6: Fiyat senkronunun ayni anda iki kez calismasini engelleyen kilit
  private isRunning = false;

  private async syncPriceStatsFromMikro(
    priceListMap: PriceListMap,
    priceCostMap: PriceCostMap
  ): Promise<void> {
    const codes = Array.from(priceListMap.keys());
    if (codes.length === 0) return;

    const batchSize = 500;
    for (let i = 0; i < codes.length; i += batchSize) {
      const batch = codes.slice(i, i + batchSize);
      const products = await prisma.product.findMany({
        where: { mikroCode: { in: batch } },
        select: { mikroCode: true, name: true, currentCost: true },
      });
      const productMap = new Map(
        products.map((product) => [product.mikroCode, product])
      );
      // 12.2: Mikro kaynakli metin/sayilari SQL'e ham gomerken tek bozuk kayit (ozel
      // karakter veya NaN/Infinity) tum 500'luk partinin yazimini cokertiyordu.
      // Cozum: tum string alanlari kacisla temizle, tum sayisal alanlari sonlu sayiya zorla.
      const num = (v: any): number => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };
      const esc = (v: any): string => String(v ?? '').replace(/'/g, "''");

      const values = batch.map((code) => {
        const priceLists = priceListMap.get(code);
        const product = productMap.get(code);
        const safeCode = esc(code);
        const productName = esc(product?.name || code);
        const rawCost = product?.currentCost;
        const cost = rawCost === null || rawCost === undefined || !Number.isFinite(Number(rawCost))
          ? null
          : Number(rawCost);
        const costValue = cost === null ? 'NULL' : cost;

        // Legacy product_price_stats keeps its existing fixed 1..10 snapshot.
        const safePrices = LEGACY_STANDARD_PRICE_LIST_NOS.map((listNo) =>
          num(priceLists?.get(listNo))
        );
        const margins = safePrices.map((price) => {
          if (!price || price === 0 || cost === null || cost === 0) return 0;
          return ((price - cost) / price) * 100;
        });

        return `(
          '${randomUUID()}',
          '${safeCode}',
          '${productName}',
          NULL,
          NULL,
          0,
          NULL,
          NULL,
          NULL,
          NULL,
          ${costValue},
          NULL,
          ${num(safePrices[0])},
          ${num(safePrices[1])},
          ${num(safePrices[2])},
          ${num(safePrices[3])},
          ${num(safePrices[4])},
          ${num(safePrices[5])},
          ${num(safePrices[6])},
          ${num(safePrices[7])},
          ${num(safePrices[8])},
          ${num(safePrices[9])},
          ${num(margins[0])},
          ${num(margins[1])},
          ${num(margins[2])},
          ${num(margins[3])},
          ${num(margins[4])},
          ${num(margins[5])},
          ${num(margins[6])},
          ${num(margins[7])},
          ${num(margins[8])},
          ${num(margins[9])},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )`;
      }).join(',\n');

      const legacyUpsertSql = `
        INSERT INTO product_price_stats (
          id, product_code, product_name, brand, category,
          total_changes, first_change_date, last_change_date,
          days_since_last_change, avg_change_frequency_days,
          current_cost, current_stock,
          current_price_list_1, current_price_list_2, current_price_list_3,
          current_price_list_4, current_price_list_5, current_price_list_6,
          current_price_list_7, current_price_list_8, current_price_list_9,
          current_price_list_10,
          current_margin_list_1, current_margin_list_2, current_margin_list_3,
          current_margin_list_4, current_margin_list_5, current_margin_list_6,
          current_margin_list_7, current_margin_list_8, current_margin_list_9,
          current_margin_list_10,
          updated_at, created_at
        )
        VALUES ${values}
        ON CONFLICT (product_code) DO UPDATE SET
          product_name = EXCLUDED.product_name,
          current_cost = COALESCE(EXCLUDED.current_cost, product_price_stats.current_cost),
          current_price_list_1 = EXCLUDED.current_price_list_1,
          current_price_list_2 = EXCLUDED.current_price_list_2,
          current_price_list_3 = EXCLUDED.current_price_list_3,
          current_price_list_4 = EXCLUDED.current_price_list_4,
          current_price_list_5 = EXCLUDED.current_price_list_5,
          current_price_list_6 = EXCLUDED.current_price_list_6,
          current_price_list_7 = EXCLUDED.current_price_list_7,
          current_price_list_8 = EXCLUDED.current_price_list_8,
          current_price_list_9 = EXCLUDED.current_price_list_9,
          current_price_list_10 = EXCLUDED.current_price_list_10,
          current_margin_list_1 = EXCLUDED.current_margin_list_1,
          current_margin_list_2 = EXCLUDED.current_margin_list_2,
          current_margin_list_3 = EXCLUDED.current_margin_list_3,
          current_margin_list_4 = EXCLUDED.current_margin_list_4,
          current_margin_list_5 = EXCLUDED.current_margin_list_5,
          current_margin_list_6 = EXCLUDED.current_margin_list_6,
          current_margin_list_7 = EXCLUDED.current_margin_list_7,
          current_margin_list_8 = EXCLUDED.current_margin_list_8,
          current_margin_list_9 = EXCLUDED.current_margin_list_9,
          current_margin_list_10 = EXCLUDED.current_margin_list_10,
          updated_at = CURRENT_TIMESTAMP
        WHERE
          product_price_stats.current_price_list_1 IS DISTINCT FROM EXCLUDED.current_price_list_1
          OR product_price_stats.current_price_list_2 IS DISTINCT FROM EXCLUDED.current_price_list_2
          OR product_price_stats.current_price_list_3 IS DISTINCT FROM EXCLUDED.current_price_list_3
          OR product_price_stats.current_price_list_4 IS DISTINCT FROM EXCLUDED.current_price_list_4
          OR product_price_stats.current_price_list_5 IS DISTINCT FROM EXCLUDED.current_price_list_5
          OR product_price_stats.current_price_list_6 IS DISTINCT FROM EXCLUDED.current_price_list_6
          OR product_price_stats.current_price_list_7 IS DISTINCT FROM EXCLUDED.current_price_list_7
          OR product_price_stats.current_price_list_8 IS DISTINCT FROM EXCLUDED.current_price_list_8
          OR product_price_stats.current_price_list_9 IS DISTINCT FROM EXCLUDED.current_price_list_9
          OR product_price_stats.current_price_list_10 IS DISTINCT FROM EXCLUDED.current_price_list_10
      `;

      // Row-based mirror is the canonical path for non-contiguous physical
      // lists (campaign 11/12 and standard F6/P6 at 13/14). Writing zero rows
      // as well as positive rows prevents a removed Mikro price from remaining
      // stale in PostgreSQL.
      const normalizedValues = batch.flatMap((code) => {
        const priceLists = priceListMap.get(code);
        const costs = priceCostMap.get(code);
        const safeCode = esc(code);

        return SYNC_PRICE_LIST_NOS.map((listNo) => {
          const price = num(priceLists?.get(listNo));
          const { currentCost, currentMargin } =
            resolvePriceListSnapshotMetrics(listNo, price, costs);
          const costValue =
            currentCost === null ? 'NULL' : String(currentCost);
          const marginValue =
            currentMargin !== null ? String(currentMargin) : 'NULL';

          return `(
            '${randomUUID()}',
            '${safeCode}',
            ${listNo},
            ${price},
            ${costValue},
            ${marginValue},
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )`;
        });
      }).join(',\n');

      const normalizedUpsertSql = `
        INSERT INTO product_price_list_current (
          id, product_code, price_list_no, current_price, current_cost,
          current_margin, synced_at, created_at, updated_at
        )
        VALUES ${normalizedValues}
        ON CONFLICT (product_code, price_list_no) DO UPDATE SET
          current_price = EXCLUDED.current_price,
          -- Assign NULL as well: missing/campaign cost data must clear any
          -- legacy value that may have been attributed to the wrong plane.
          current_cost = EXCLUDED.current_cost,
          current_margin = EXCLUDED.current_margin,
          synced_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      `;

      // Keep legacy and normalized snapshots at the same batch boundary.
      await prisma.$transaction([
        prisma.$executeRawUnsafe(legacyUpsertSql),
        prisma.$executeRawUnsafe(normalizedUpsertSql),
      ]);
    }

    // The Mikro snapshot is complete and active-stock based. Rows that are no
    // longer active must not keep serving a stale positive price.
    const snapshotTime = new Date();
    await prisma.productPriceListCurrent.updateMany({
      where: { productCode: { notIn: codes } },
      data: {
        currentPrice: 0,
        currentCost: null,
        currentMargin: null,
        syncedAt: snapshotTime,
      },
    });
  }

  /**
   * Ana senkronizasyon metodu
   * Otomatik olarak full veya incremental sync yapar
   */
  async syncPriceChanges(): Promise<PriceSyncResult> {
    if (this.isRunning) {
      console.log('⚠️ Fiyat senkronu zaten calisiyor, yeni istek atlandi.');
      return { success: false, syncType: 'incremental', recordsSynced: 0, error: 'Fiyat senkronu zaten calisiyor' };
    }
    this.isRunning = true;

    try {
      return await withMikroSyncLock(() => this.syncPriceChangesLocked());
    } catch (error: any) {
      const message = error instanceof MikroSyncBusyError
        ? error.message
        : String(error?.message || error || 'Fiyat senkronu baslatilamadi');
      return {
        success: false,
        syncType: 'incremental',
        recordsSynced: 0,
        error: message,
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Run price sync while the caller already owns withMikroSyncLock.
   *
   * Full stock sync uses this entry point so both stages stay inside one
   * cross-process lock and one overall success decision. Calling the public
   * syncPriceChanges() here would try to acquire the same advisory lock again.
   */
  async syncPriceChangesWithinExistingLock(): Promise<PriceSyncResult> {
    if (this.isRunning) {
      console.log('⚠️ Fiyat senkronu zaten calisiyor, tam senkron fiyat asamasi durduruldu.');
      return {
        success: false,
        syncType: 'incremental',
        recordsSynced: 0,
        error: 'Fiyat senkronu zaten calisiyor',
      };
    }
    this.isRunning = true;

    try {
      return await this.syncPriceChangesLocked();
    } finally {
      this.isRunning = false;
    }
  }

  private async syncPriceChangesLocked(): Promise<PriceSyncResult> {
    const syncId = randomUUID();
    const startTime = new Date();

    try {
      // Son başarılı sync'i kontrol et
      const lastSync = await prisma.$queryRaw<any[]>`
        SELECT * FROM price_sync_log
        WHERE status = 'completed'
        ORDER BY created_at DESC
        LIMIT 1
      `;
      const legacyRows = await prisma.$queryRaw<Array<{ row_count: bigint }>>`
        SELECT COUNT(*)::bigint AS row_count
        FROM price_changes
        WHERE source_guid IS NULL
      `;

      const syncType: 'full' | 'incremental' = lastSync && lastSync.length > 0 && lastSync[0].last_synced_date
        ? 'incremental'
        : 'full';
      const legacyRowsWithoutSourceGuid = Number(legacyRows[0]?.row_count || 0);
      if (syncType === 'full' && legacyRowsWithoutSourceGuid > 0) {
        throw new Error(
          `${legacyRowsWithoutSourceGuid} eski fiyat gecmisi satirinda Mikro source GUID yok ` +
            've tamamlanmis fiyat-sync watermark bulunamadi. Mukerrer gecmis olusmamasi ' +
            'icin full sync durduruldu; once kontrollu baseline/reconciliation gerekir.'
        );
      }

      console.log(`🔄 Starting ${syncType} price sync...`);

      // Sync log oluştur
      await prisma.$executeRaw`
        INSERT INTO price_sync_log (id, sync_type, start_time, status, created_at)
        VALUES (${syncId}, ${syncType}, ${startTime}, 'running', ${startTime})
      `;

      // Mikro'ya bağlan
      await mikroService.connect();
      const { priceListMap, priceCostMap } = await this.fetchPriceListSnapshot();

      let recordsSynced = 0;
      let lastSyncedDate: Date | null = null;

      if (syncType === 'full') {
        // Tüm geçmişi çek
        recordsSynced = await this.performFullSync(priceListMap);

        // En son değişiklik tarihini al
        const maxDate = await prisma.$queryRaw<any[]>`
          SELECT MAX(change_date) as max_date FROM price_changes
        `;
        lastSyncedDate = maxDate[0]?.max_date || new Date();
      } else {
        // Sadece son sync'ten sonraki değişiklikleri çek
        const fromDate = lastSync[0].last_synced_date;
        recordsSynced = await this.performIncrementalSync(fromDate, priceListMap);

        // Yeni en son tarih
        const maxDate = await prisma.$queryRaw<any[]>`
          SELECT MAX(change_date) as max_date FROM price_changes WHERE change_date >= ${fromDate}
        `;
        lastSyncedDate = maxDate[0]?.max_date || fromDate;
      }

      // İstatistikleri güncelle
      await this.updateProductStats();
      await this.syncPriceStatsFromMikro(priceListMap, priceCostMap);

      // Kullanici talebi: fiyat-sync de musteriye giden INDIRIMLI/excess fiyati (Product.prices)
      // guncel maliyet + ayarlardaki marj ile yeniden hesaplasin. Bu zorunlu asama
      // basarisizsa price/full sync tamamlanmis sayilmamalidir.
      try {
        const priced = await pricingService.recalculateAllPrices();
        console.log(`✅ Indirimli/excess fiyatlar yeniden hesaplandi (price-sync sonu): ${priced} urun`);
      } catch (recalcErr: any) {
        console.error('⚠️ Fiyat recalc (price-sync sonu) hatasi:', recalcErr?.message || recalcErr);
        throw new Error(
          `Fiyat recalc (price-sync sonu) basarisiz: ${
            recalcErr?.message || String(recalcErr)
          }`
        );
      }

      // Sync log'u güncelle - completed
      const endTime = new Date();
      await prisma.$executeRaw`
        UPDATE price_sync_log
        SET status = 'completed',
            end_time = ${endTime},
            records_synced = ${recordsSynced},
            last_synced_date = ${lastSyncedDate}
        WHERE id = ${syncId}
      `;

      console.log(`✅ Sync completed: ${recordsSynced} records synced`);

      return {
        success: true,
        syncType,
        recordsSynced,
      };
    } catch (error: any) {
      console.error('❌ Sync failed:', error);

      // Sync log'u güncelle - failed
      await prisma.$executeRaw`
        UPDATE price_sync_log
        SET status = 'failed',
            end_time = ${new Date()},
            error_message = ${error.message}
        WHERE id = ${syncId}
      `.catch(() => {});

      return {
        success: false,
        syncType: 'full',
        recordsSynced: 0,
        error: error.message,
      };
    }
  }

  private async fetchPriceListSnapshot(): Promise<PriceSyncSnapshot> {
    console.log('📥 Fetching current price lists from Mikro...');

    const rows = await mikroService.executeQuery(`
      WITH ActiveStocks AS (
        SELECT
          s.sto_Guid,
          LTRIM(RTRIM(s.sto_kod)) AS stockCode
        FROM STOKLAR s
        WHERE ISNULL(s.sto_pasif_fl, 0) = 0
          AND LTRIM(RTRIM(ISNULL(s.sto_kod, N''))) <> N''
      ),
      RankedPrices AS (
        SELECT
          LTRIM(RTRIM(p.sfiyat_stokkod)) AS stockCode,
          p.sfiyat_listesirano,
          p.sfiyat_fiyati,
          COUNT(*) OVER (
            PARTITION BY
              LTRIM(RTRIM(p.sfiyat_stokkod)),
              p.sfiyat_listesirano
          ) AS candidateCount,
          ROW_NUMBER() OVER (
            PARTITION BY LTRIM(RTRIM(p.sfiyat_stokkod)), p.sfiyat_listesirano
            ORDER BY
              ISNULL(p.sfiyat_lastup_date, p.sfiyat_create_date) DESC,
              p.sfiyat_create_date DESC,
              p.sfiyat_Guid DESC
          ) AS rowNo
        FROM STOK_SATIS_FIYAT_LISTELERI p
        INNER JOIN ActiveStocks active
          ON active.stockCode = LTRIM(RTRIM(p.sfiyat_stokkod))
        WHERE p.sfiyat_listesirano IN (${SYNC_PRICE_LIST_NOS.join(', ')})
          AND p.sfiyat_deposirano = 0
          AND p.sfiyat_doviz = 0
          AND p.sfiyat_odemeplan = 0
          AND p.sfiyat_iptal = 0
          AND ISNULL(p.sfiyat_hidden, 0) = 0
      )
      SELECT
        active.stockCode AS sfiyat_stokkod,
        price.sfiyat_listesirano,
        ISNULL(price.sfiyat_fiyati, 0) AS sfiyat_fiyati,
        ISNULL(price.candidateCount, 0) AS candidateCount,
        u.MaliyetP AS costP,
        u.MaliyetT AS costT
      FROM ActiveStocks active
      LEFT JOIN RankedPrices price
        ON price.stockCode = active.stockCode
       AND price.rowNo = 1
      LEFT JOIN STOKLAR_USER u
        ON active.sto_Guid = u.Record_uid
      ORDER BY active.stockCode, price.sfiyat_listesirano
    `);

    const priceListMap: PriceListMap = new Map();
    const priceCostMap: PriceCostMap = new Map();
    const syncListNos = new Set<number>(SYNC_PRICE_LIST_NOS);
    const duplicateCanonicalKeys = new Set<string>();

    for (const row of rows) {
      const code = (row.sfiyat_stokkod || '').trim();
      const listNo = Number(row.sfiyat_listesirano);
      const candidateCount = Number(row.candidateCount) || 0;

      if (!code) continue;
      if (candidateCount > 1) {
        // Legacy Mikro data can contain duplicate canonical rows. Snapshot
        // reads use the explicit RankedPrices ordering above; write flows keep
        // failing closed for the affected product until it is reconciled.
        duplicateCanonicalKeys.add(`${code}/L${listNo}`);
      }

      if (!priceListMap.has(code)) {
        priceListMap.set(code, new Map());
      }
      priceCostMap.set(code, {
        costP: parseOptionalMikroNumber(row.costP),
        costT: parseOptionalMikroNumber(row.costT),
      });

      if (Number.isInteger(listNo) && syncListNos.has(listNo)) {
        const prices = priceListMap.get(code)!;
        prices.set(listNo, Number(row.sfiyat_fiyati) || 0);
      }
    }

    if (duplicateCanonicalKeys.size > 0) {
      console.warn(
        'Mikro fiyat snapshotinda birden fazla canonical satiri olan ' +
          `${duplicateCanonicalKeys.size} urun/liste cifti deterministik son satirla okundu. ` +
          `Ilk ornekler: ${Array.from(duplicateCanonicalKeys).slice(0, 10).join(', ')}`
      );
    }
    console.log(`📊 Loaded price lists for ${priceListMap.size} products`);

    return { priceListMap, priceCostMap };
  }

  /**
   * Tüm fiyat geçmişini çeker
   */
  private async performFullSync(priceListMap: PriceListMap): Promise<number> {
    console.log('📥 Fetching all price changes from Mikro...');

    const changes = await mikroService.executeQuery(`
      SELECT
        f.fid_Guid,
        f.fid_stok_kod,
        f.fid_tarih,
        f.fid_fiyat_no,
        f.fid_eskifiy_tutar,
        f.fid_yenifiy_tutar,
        s.sto_isim,
        s.sto_marka_kodu,
        s.sto_standartmaliyet
      FROM STOK_FIYAT_DEGISIKLIKLERI f
      LEFT JOIN STOKLAR s ON f.fid_stok_kod = s.sto_kod
      WHERE f.fid_eskifiy_tutar != f.fid_yenifiy_tutar
        AND s.sto_pasif_fl = 0
      ORDER BY f.fid_tarih DESC, f.fid_stok_kod, f.fid_fiyat_no
    `);

    console.log(`📊 Found ${changes.length} price changes`);

    // Batch insert (500'er kayıt - daha küçük batch, daha az connection timeout)
    const batchSize = 500;
    let inserted = 0;
    let processed = 0;

    for (let i = 0; i < changes.length; i += batchSize) {
      const batch = changes.slice(i, i + batchSize);
      inserted += await this.insertPriceChanges(batch, priceListMap);
      processed += batch.length;
      console.log(
        `  → Processed ${processed}/${changes.length}; inserted ${inserted}`
      );

      // Her 10 batch'te bir kısa bekleme (connection pool recover için)
      if (processed % 5000 === 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return inserted;
  }

  /**
   * Belirli bir tarihten sonraki değişiklikleri çeker
   */
  private async performIncrementalSync(
    fromDate: Date,
    priceListMap: PriceListMap
  ): Promise<number> {
    console.log(`📥 Fetching price changes since ${fromDate.toISOString()}...`);

    const changes = await mikroService.executeQuery(`
      SELECT
        f.fid_Guid,
        f.fid_stok_kod,
        f.fid_tarih,
        f.fid_fiyat_no,
        f.fid_eskifiy_tutar,
        f.fid_yenifiy_tutar,
        s.sto_isim,
        s.sto_marka_kodu,
        s.sto_standartmaliyet
      FROM STOK_FIYAT_DEGISIKLIKLERI f
      LEFT JOIN STOKLAR s ON f.fid_stok_kod = s.sto_kod
      WHERE f.fid_tarih >= '${fromDate.toISOString()}'
        AND f.fid_eskifiy_tutar != f.fid_yenifiy_tutar
        AND s.sto_pasif_fl = 0
      ORDER BY f.fid_tarih DESC, f.fid_stok_kod, f.fid_fiyat_no
    `);

    console.log(`📊 Found ${changes.length} new price changes`);

    if (changes.length > 0) {
      return this.insertPriceChanges(changes, priceListMap);
    }

    return 0;
  }

  /**
   * Fiyat değişikliklerini PostgreSQL'e ekler
   */
  private async insertPriceChanges(
    changes: PriceChangeRecord[],
    priceListMap: PriceListMap,
  ): Promise<number> {
    const values = changes.map((change) => {
      const sourceGuid = String(change.fid_Guid || '').trim().toLowerCase();
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          sourceGuid
        )
      ) {
        throw new Error(
          `Mikro fiyat degisiklik GUID degeri gecersiz: ${sourceGuid || 'bos'}`
        );
      }
      const changeAmount = change.fid_yenifiy_tutar - change.fid_eskifiy_tutar;
      const changePercent = change.fid_eskifiy_tutar !== 0
        ? (changeAmount / change.fid_eskifiy_tutar) * 100
        : 0;

      const cost = Number(change.sto_standartmaliyet) || 0;
      const priceLists = priceListMap.get((change.fid_stok_kod || '').trim());
      // 12.2: Tum sayisal degerleri sonlu sayiya zorla (NaN/Infinity SQL'i bozmasin)
      const prices = LEGACY_STANDARD_PRICE_LIST_NOS.map(
        (listNo) => Number(priceLists?.get(listNo)) || 0
      );

      // Marjları hesapla (10 fiyat)
      const margins = prices.map((price) => {
        const p = Number(price) || 0;
        if (!p || cost === 0) return 0;
        const m = ((p - cost) / p) * 100; // Kar marjı %
        return Number.isFinite(m) ? m : 0;
      });

      return `(
        '${randomUUID()}',
        '${sourceGuid}',
        '${(change.fid_stok_kod ?? '').replace(/'/g, "''")}',
        '${change.sto_isim?.replace(/'/g, "''") || ''}',
        ${change.sto_marka_kodu ? `'${change.sto_marka_kodu.replace(/'/g, "''")}'` : 'NULL'},
        'Kategori Yok',
        '${(change.fid_tarih instanceof Date ? change.fid_tarih : new Date(change.fid_tarih)).toISOString()}',
        ${Number(change.fid_fiyat_no) || 0},
        ${Number(change.fid_eskifiy_tutar) || 0},
        ${Number(change.fid_yenifiy_tutar) || 0},
        ${Number.isFinite(changeAmount) ? changeAmount : 0},
        ${Number.isFinite(changePercent) ? changePercent : 0},
        ${Number(cost) || 0},
        0,
        ${prices[0] || 0},
        ${prices[1] || 0},
        ${prices[2] || 0},
        ${prices[3] || 0},
        ${prices[4] || 0},
        ${prices[5] || 0},
        ${prices[6] || 0},
        ${prices[7] || 0},
        ${prices[8] || 0},
        ${prices[9] || 0},
        ${margins[0]},
        ${margins[1]},
        ${margins[2]},
        ${margins[3]},
        ${margins[4]},
        ${margins[5]},
        ${margins[6]},
        ${margins[7] || 0},
        ${margins[8] || 0},
        ${margins[9] || 0},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )`;
    }).join(',\n');

    // Retry logic for connection issues
    let retries = 3;
    let inserted = 0;
    while (retries > 0) {
      try {
        inserted = await prisma.$executeRawUnsafe(`
          INSERT INTO price_changes (
            id, source_guid, product_code, product_name, brand, category, change_date, price_list_no,
            old_price, new_price, change_amount, change_percent,
            current_cost, current_stock,
            price_list_1, price_list_2, price_list_3, price_list_4, price_list_5,
            price_list_6, price_list_7, price_list_8, price_list_9, price_list_10,
            margin_list_1, margin_list_2, margin_list_3, margin_list_4, margin_list_5,
            margin_list_6, margin_list_7, margin_list_8, margin_list_9, margin_list_10,
            synced_at, created_at
          )
          VALUES ${values}
          ON CONFLICT (source_guid) DO NOTHING
        `);
        break; // Success, exit retry loop
      } catch (error: any) {
        retries--;
        if (retries === 0 || !error.message?.includes('Server has closed')) {
          throw error; // Re-throw if no retries left or different error
        }
        console.log(`⚠️ Connection lost, retrying... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry

        // Reconnect Prisma
        await prisma.$disconnect();
        await new Promise(resolve => setTimeout(resolve, 1000));
        await prisma.$connect();
      }
    }
    return inserted;
  }

  /**
   * Ürün bazında istatistikleri günceller
   */
  private async updateProductStats(): Promise<void> {
    console.log('📊 Updating product statistics...');

    await prisma.$executeRaw`
      INSERT INTO product_price_stats (
        id, product_code, product_name, brand, category,
        total_changes, first_change_date, last_change_date,
        days_since_last_change, avg_change_frequency_days,
        current_cost, current_stock,
        current_price_list_1, current_price_list_2, current_price_list_3,
        current_price_list_4, current_price_list_5, current_price_list_6,
        current_price_list_7, current_price_list_8, current_price_list_9,
        current_price_list_10,
        current_margin_list_1, current_margin_list_2, current_margin_list_3,
        current_margin_list_4, current_margin_list_5, current_margin_list_6,
        current_margin_list_7, current_margin_list_8, current_margin_list_9,
        current_margin_list_10,
        updated_at, created_at
      )
      SELECT
        gen_random_uuid(),
        product_code,
        MAX(product_name) as product_name,
        MAX(brand) as brand,
        MAX(category) as category,
        COUNT(*) as total_changes,
        MIN(change_date) as first_change_date,
        MAX(change_date) as last_change_date,
        EXTRACT(DAY FROM (CURRENT_TIMESTAMP - MAX(change_date))) as days_since_last_change,
        CASE
          WHEN COUNT(*) > 1 THEN
            EXTRACT(DAY FROM (MAX(change_date) - MIN(change_date))) / (COUNT(*) - 1)
          ELSE NULL
        END as avg_change_frequency_days,
        MAX(current_cost) as current_cost,
        MAX(current_stock) as current_stock,
        MAX(price_list_1) as current_price_list_1,
        MAX(price_list_2) as current_price_list_2,
        MAX(price_list_3) as current_price_list_3,
        MAX(price_list_4) as current_price_list_4,
        MAX(price_list_5) as current_price_list_5,
        MAX(price_list_6) as current_price_list_6,
        MAX(price_list_7) as current_price_list_7,
        MAX(price_list_8) as current_price_list_8,
        MAX(price_list_9) as current_price_list_9,
        MAX(price_list_10) as current_price_list_10,
        MAX(margin_list_1) as current_margin_list_1,
        MAX(margin_list_2) as current_margin_list_2,
        MAX(margin_list_3) as current_margin_list_3,
        MAX(margin_list_4) as current_margin_list_4,
        MAX(margin_list_5) as current_margin_list_5,
        MAX(margin_list_6) as current_margin_list_6,
        MAX(margin_list_7) as current_margin_list_7,
        MAX(margin_list_8) as current_margin_list_8,
        MAX(margin_list_9) as current_margin_list_9,
        MAX(margin_list_10) as current_margin_list_10,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      FROM price_changes
      GROUP BY product_code
      ON CONFLICT (product_code) DO UPDATE SET
        product_name = EXCLUDED.product_name,
        brand = EXCLUDED.brand,
        category = EXCLUDED.category,
        total_changes = EXCLUDED.total_changes,
        first_change_date = EXCLUDED.first_change_date,
        last_change_date = EXCLUDED.last_change_date,
        days_since_last_change = EXCLUDED.days_since_last_change,
        avg_change_frequency_days = EXCLUDED.avg_change_frequency_days,
        current_cost = EXCLUDED.current_cost,
        current_stock = EXCLUDED.current_stock,
        current_price_list_1 = EXCLUDED.current_price_list_1,
        current_price_list_2 = EXCLUDED.current_price_list_2,
        current_price_list_3 = EXCLUDED.current_price_list_3,
        current_price_list_4 = EXCLUDED.current_price_list_4,
        current_price_list_5 = EXCLUDED.current_price_list_5,
        current_price_list_6 = EXCLUDED.current_price_list_6,
        current_price_list_7 = EXCLUDED.current_price_list_7,
        current_price_list_8 = EXCLUDED.current_price_list_8,
        current_price_list_9 = EXCLUDED.current_price_list_9,
        current_price_list_10 = EXCLUDED.current_price_list_10,
        current_margin_list_1 = EXCLUDED.current_margin_list_1,
        current_margin_list_2 = EXCLUDED.current_margin_list_2,
        current_margin_list_3 = EXCLUDED.current_margin_list_3,
        current_margin_list_4 = EXCLUDED.current_margin_list_4,
        current_margin_list_5 = EXCLUDED.current_margin_list_5,
        current_margin_list_6 = EXCLUDED.current_margin_list_6,
        current_margin_list_7 = EXCLUDED.current_margin_list_7,
        current_margin_list_8 = EXCLUDED.current_margin_list_8,
        current_margin_list_9 = EXCLUDED.current_margin_list_9,
        current_margin_list_10 = EXCLUDED.current_margin_list_10,
        updated_at = CURRENT_TIMESTAMP
    `;

    console.log('✅ Product statistics updated');
  }

  /**
   * Son senkronizasyon durumunu getirir
   */
  async getLastSyncStatus(): Promise<any> {
    const lastSync = await prisma.$queryRaw`
      SELECT * FROM price_sync_log
      ORDER BY created_at DESC
      LIMIT 1
    `;

    return lastSync && (lastSync as any[]).length > 0 ? (lastSync as any[])[0] : null;
  }
}

export default new PriceSyncService();
