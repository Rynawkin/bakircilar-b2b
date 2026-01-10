/**
 * Price Synchronization Service
 *
 * Mikro ERP'den fiyat değişikliklerini PostgreSQL'e senkronize eder
 * - İlk çalıştırmada: Tüm geçmişi çeker (full sync)
 * - Sonraki çalıştırmalarda: Sadece son sync'ten sonraki değişiklikleri çeker (incremental sync)
 */

import { PrismaClient } from '@prisma/client';
import mikroService from './mikro.service';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

interface PriceChangeRecord {
  fid_stok_kod: string;
  fid_tarih: Date;
  fid_fiyat_no: number;
  fid_eskifiy_tutar: number;
  fid_yenifiy_tutar: number;
  sto_isim: string;
  sto_marka_kodu: string | null;
  sto_standartmaliyet: number;
}

class PriceSyncService {
  private async syncPriceStatsFromMikro(priceListMap: Map<string, number[]>): Promise<void> {
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
      const values = batch.map((code) => {
        const priceLists = priceListMap.get(code) || Array(10).fill(0);
        const product = productMap.get(code);
        const productName = (product?.name || code).replace(/'/g, "''");
        const cost = product?.currentCost;
        const costValue = cost === null || cost === undefined ? 'NULL' : cost;

        const margins = priceLists.map((price) => {
          if (!price || price === 0 || !cost || cost === 0) return 0;
          return ((price - cost) / price) * 100;
        });

        return `(
          '${randomUUID()}',
          '${code}',
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
          ${priceLists[0] || 0},
          ${priceLists[1] || 0},
          ${priceLists[2] || 0},
          ${priceLists[3] || 0},
          ${priceLists[4] || 0},
          ${priceLists[5] || 0},
          ${priceLists[6] || 0},
          ${priceLists[7] || 0},
          ${priceLists[8] || 0},
          ${priceLists[9] || 0},
          ${margins[0] || 0},
          ${margins[1] || 0},
          ${margins[2] || 0},
          ${margins[3] || 0},
          ${margins[4] || 0},
          ${margins[5] || 0},
          ${margins[6] || 0},
          ${margins[7] || 0},
          ${margins[8] || 0},
          ${margins[9] || 0},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )`;
      }).join(',\n');

      await prisma.$executeRawUnsafe(`
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
      `);
    }
  }

  /**
   * Ana senkronizasyon metodu
   * Otomatik olarak full veya incremental sync yapar
   */
  async syncPriceChanges(): Promise<{
    success: boolean;
    syncType: 'full' | 'incremental';
    recordsSynced: number;
    error?: string;
  }> {
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

      const syncType: 'full' | 'incremental' = lastSync && lastSync.length > 0 && lastSync[0].last_synced_date
        ? 'incremental'
        : 'full';

      console.log(`🔄 Starting ${syncType} price sync...`);

      // Sync log oluştur
      await prisma.$executeRaw`
        INSERT INTO price_sync_log (id, sync_type, start_time, status, created_at)
        VALUES (${syncId}, ${syncType}, ${startTime}, 'running', ${startTime})
      `;

      // Mikro'ya bağlan
      await mikroService.connect();
      const priceListMap = await this.fetchPriceListMap();

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
          SELECT MAX(change_date) as max_date FROM price_changes WHERE change_date > ${fromDate}
        `;
        lastSyncedDate = maxDate[0]?.max_date || fromDate;
      }

      // İstatistikleri güncelle
      await this.updateProductStats();
      await this.syncPriceStatsFromMikro(priceListMap);

      await mikroService.disconnect();

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

  private async fetchPriceListMap(): Promise<Map<string, number[]>> {
    console.log('📥 Fetching current price lists from Mikro...');

    const rows = await mikroService.executeQuery(`
      SELECT
        sfiyat_stokkod,
        sfiyat_listesirano,
        sfiyat_fiyati
      FROM STOK_SATIS_FIYAT_LISTELERI
      WHERE sfiyat_listesirano BETWEEN 1 AND 10
        AND sfiyat_deposirano = 0
        AND sfiyat_doviz = 0
        AND sfiyat_odemeplan = 0
        AND sfiyat_iptal = 0
        AND sfiyat_fiyati > 0
    `);

    const priceListMap = new Map<string, number[]>();

    for (const row of rows) {
      const code = (row.sfiyat_stokkod || '').trim();
      const listNo = Number(row.sfiyat_listesirano);

      if (!code || Number.isNaN(listNo) || listNo < 1 || listNo > 10) continue;

      if (!priceListMap.has(code)) {
        priceListMap.set(code, Array(10).fill(0));
      }

      const prices = priceListMap.get(code)!;
      prices[listNo - 1] = Number(row.sfiyat_fiyati) || 0;
    }

    console.log(`📊 Loaded price lists for ${priceListMap.size} products`);

    return priceListMap;
  }

  /**
   * Tüm fiyat geçmişini çeker
   */
  private async performFullSync(priceListMap: Map<string, number[]>): Promise<number> {
    console.log('📥 Fetching all price changes from Mikro...');

    const changes = await mikroService.executeQuery(`
      SELECT
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

    for (let i = 0; i < changes.length; i += batchSize) {
      const batch = changes.slice(i, i + batchSize);
      await this.insertPriceChanges(batch, priceListMap);
      inserted += batch.length;
      console.log(`  → Inserted ${inserted}/${changes.length} records`);

      // Her 10 batch'te bir kısa bekleme (connection pool recover için)
      if (inserted % 5000 === 0) {
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
    priceListMap: Map<string, number[]>
  ): Promise<number> {
    console.log(`📥 Fetching price changes since ${fromDate.toISOString()}...`);

    const changes = await mikroService.executeQuery(`
      SELECT
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
      WHERE f.fid_tarih > '${fromDate.toISOString()}'
        AND f.fid_eskifiy_tutar != f.fid_yenifiy_tutar
        AND s.sto_pasif_fl = 0
      ORDER BY f.fid_tarih DESC, f.fid_stok_kod, f.fid_fiyat_no
    `);

    console.log(`📊 Found ${changes.length} new price changes`);

    if (changes.length > 0) {
      await this.insertPriceChanges(changes, priceListMap);
    }

    return changes.length;
  }

  /**
   * Fiyat değişikliklerini PostgreSQL'e ekler
   */
  private async insertPriceChanges(
    changes: PriceChangeRecord[],
    priceListMap: Map<string, number[]>,
  ): Promise<void> {
    const values = changes.map((change) => {
      const changeAmount = change.fid_yenifiy_tutar - change.fid_eskifiy_tutar;
      const changePercent = change.fid_eskifiy_tutar !== 0
        ? (changeAmount / change.fid_eskifiy_tutar) * 100
        : 0;

      const cost = change.sto_standartmaliyet || 0;
      const priceLists = priceListMap.get((change.fid_stok_kod || '').trim());
      const prices = priceLists
        ? [...priceLists]
        : Array(10).fill(0);

      // Marjları hesapla (10 fiyat)
      const margins = prices.map((price) => {
        if (!price || price === 0 || cost === 0) return 0;
        return ((price - cost) / price) * 100; // Kar marjı %
      });

      return `(
        '${randomUUID()}',
        '${change.fid_stok_kod}',
        '${change.sto_isim?.replace(/'/g, "''") || ''}',
        ${change.sto_marka_kodu ? `'${change.sto_marka_kodu.replace(/'/g, "''")}'` : 'NULL'},
        'Kategori Yok',
        '${change.fid_tarih.toISOString()}',
        ${change.fid_fiyat_no},
        ${change.fid_eskifiy_tutar},
        ${change.fid_yenifiy_tutar},
        ${changeAmount},
        ${changePercent},
        ${cost || 0},
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
    while (retries > 0) {
      try {
        await prisma.$executeRawUnsafe(`
          INSERT INTO price_changes (
            id, product_code, product_name, brand, category, change_date, price_list_no,
            old_price, new_price, change_amount, change_percent,
            current_cost, current_stock,
            price_list_1, price_list_2, price_list_3, price_list_4, price_list_5,
            price_list_6, price_list_7, price_list_8, price_list_9, price_list_10,
            margin_list_1, margin_list_2, margin_list_3, margin_list_4, margin_list_5,
            margin_list_6, margin_list_7, margin_list_8, margin_list_9, margin_list_10,
            synced_at, created_at
          )
          VALUES ${values}
          ON CONFLICT DO NOTHING
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
