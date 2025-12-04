/**
 * Price Synchronization Service
 *
 * Mikro ERP'den fiyat değişikliklerini PostgreSQL'e senkronize eder
 * - İlk çalıştırmada: Tüm geçmişi çeker (full sync)
 * - Sonraki çalıştırmalarda: Sadece son sync'ten sonraki değişiklikleri çeker (incremental sync)
 */

import { PrismaClient } from '@prisma/client';
import mikroService from './mikro.service';
import { v4 as uuidv4 } from 'uuid';

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
  sto_eldekmiktar: number;
  // Tüm liste fiyatları
  sto_satisfiyati1: number;
  sto_satisfiyati2: number;
  sto_satisfiyati3: number;
  sto_satisfiyati4: number;
  sto_satisfiyati5: number;
  sto_satisfiyati6: number;
  sto_satisfiyati7: number;
  sto_satisfiyati8: number;
  sto_satisfiyati9: number;
  sto_satisfiyati10: number;
}

class PriceSyncService {
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
    const syncId = uuidv4();
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

      let recordsSynced = 0;
      let lastSyncedDate: Date | null = null;

      if (syncType === 'full') {
        // Tüm geçmişi çek
        recordsSynced = await this.performFullSync();

        // En son değişiklik tarihini al
        const maxDate = await prisma.$queryRaw<any[]>`
          SELECT MAX(change_date) as max_date FROM price_changes
        `;
        lastSyncedDate = maxDate[0]?.max_date || new Date();
      } else {
        // Sadece son sync'ten sonraki değişiklikleri çek
        const fromDate = lastSync[0].last_synced_date;
        recordsSynced = await this.performIncrementalSync(fromDate);

        // Yeni en son tarih
        const maxDate = await prisma.$queryRaw<any[]>`
          SELECT MAX(change_date) as max_date FROM price_changes WHERE change_date > ${fromDate}
        `;
        lastSyncedDate = maxDate[0]?.max_date || fromDate;
      }

      // İstatistikleri güncelle
      await this.updateProductStats();

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

  /**
   * Tüm fiyat geçmişini çeker
   */
  private async performFullSync(): Promise<number> {
    console.log('📥 Fetching all price changes from Mikro...');

    const changes = await mikroService.executeQuery<PriceChangeRecord>(`
      SELECT
        f.fid_stok_kod,
        f.fid_tarih,
        f.fid_fiyat_no,
        f.fid_eskifiy_tutar,
        f.fid_yenifiy_tutar,
        s.sto_isim,
        s.sto_marka_kodu,
        s.sto_standartmaliyet,
        s.sto_eldekmiktar,
        s.sto_satisfiyati1,
        s.sto_satisfiyati2,
        s.sto_satisfiyati3,
        s.sto_satisfiyati4,
        s.sto_satisfiyati5,
        s.sto_satisfiyati6,
        s.sto_satisfiyati7,
        s.sto_satisfiyati8,
        s.sto_satisfiyati9,
        s.sto_satisfiyati10
      FROM STOK_FIYAT_DEGISIKLIKLERI f
      LEFT JOIN STOKLAR s ON f.fid_stok_kod = s.sto_kod
      WHERE f.fid_eskifiy_tutar != f.fid_yenifiy_tutar
        AND s.sto_pasif_fl = 0
      ORDER BY f.fid_tarih DESC, f.fid_stok_kod, f.fid_fiyat_no
    `);

    console.log(`📊 Found ${changes.length} price changes`);

    // Batch insert (1000'er kayıt)
    const batchSize = 1000;
    let inserted = 0;

    for (let i = 0; i < changes.length; i += batchSize) {
      const batch = changes.slice(i, i + batchSize);
      await this.insertPriceChanges(batch);
      inserted += batch.length;
      console.log(`  → Inserted ${inserted}/${changes.length} records`);
    }

    return inserted;
  }

  /**
   * Belirli bir tarihten sonraki değişiklikleri çeker
   */
  private async performIncrementalSync(fromDate: Date): Promise<number> {
    console.log(`📥 Fetching price changes since ${fromDate.toISOString()}...`);

    const changes = await mikroService.executeQuery<PriceChangeRecord>(`
      SELECT
        f.fid_stok_kod,
        f.fid_tarih,
        f.fid_fiyat_no,
        f.fid_eskifiy_tutar,
        f.fid_yenifiy_tutar,
        s.sto_isim,
        s.sto_marka_kodu,
        s.sto_standartmaliyet,
        s.sto_eldekmiktar,
        s.sto_satisfiyati1,
        s.sto_satisfiyati2,
        s.sto_satisfiyati3,
        s.sto_satisfiyati4,
        s.sto_satisfiyati5,
        s.sto_satisfiyati6,
        s.sto_satisfiyati7,
        s.sto_satisfiyati8,
        s.sto_satisfiyati9,
        s.sto_satisfiyati10
      FROM STOK_FIYAT_DEGISIKLIKLERI f
      LEFT JOIN STOKLAR s ON f.fid_stok_kod = s.sto_kod
      WHERE f.fid_tarih > '${fromDate.toISOString()}'
        AND f.fid_eskifiy_tutar != f.fid_yenifiy_tutar
        AND s.sto_pasif_fl = 0
      ORDER BY f.fid_tarih DESC, f.fid_stok_kod, f.fid_fiyat_no
    `);

    console.log(`📊 Found ${changes.length} new price changes`);

    if (changes.length > 0) {
      await this.insertPriceChanges(changes);
    }

    return changes.length;
  }

  /**
   * Fiyat değişikliklerini PostgreSQL'e ekler
   */
  private async insertPriceChanges(changes: PriceChangeRecord[]): Promise<void> {
    const values = changes.map((change) => {
      const changeAmount = change.fid_yenifiy_tutar - change.fid_eskifiy_tutar;
      const changePercent = change.fid_eskifiy_tutar !== 0
        ? (changeAmount / change.fid_eskifiy_tutar) * 100
        : 0;

      // Kar marjlarını hesapla
      const cost = change.sto_standartmaliyet || 0;
      const margins = [
        change.sto_satisfiyati1,
        change.sto_satisfiyati2,
        change.sto_satisfiyati3,
        change.sto_satisfiyati4,
        change.sto_satisfiyati5,
        change.sto_satisfiyati6,
        change.sto_satisfiyati7,
        change.sto_satisfiyati8,
        change.sto_satisfiyati9,
        change.sto_satisfiyati10,
      ].map((price) => {
        if (!price || price === 0 || cost === 0) return 0;
        return ((price - cost) / price) * 100; // Kar marjı %
      });

      return `(
        '${uuidv4()}',
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
        ${change.sto_eldekmiktar || 0},
        ${change.sto_satisfiyati1 || 0},
        ${change.sto_satisfiyati2 || 0},
        ${change.sto_satisfiyati3 || 0},
        ${change.sto_satisfiyati4 || 0},
        ${change.sto_satisfiyati5 || 0},
        ${change.sto_satisfiyati6 || 0},
        ${change.sto_satisfiyati7 || 0},
        ${change.sto_satisfiyati8 || 0},
        ${change.sto_satisfiyati9 || 0},
        ${change.sto_satisfiyati10 || 0},
        ${margins[0]},
        ${margins[1]},
        ${margins[2]},
        ${margins[3]},
        ${margins[4]},
        ${margins[5]},
        ${margins[6]},
        ${margins[7]},
        ${margins[8]},
        ${margins[9]},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )`;
    }).join(',\n');

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
