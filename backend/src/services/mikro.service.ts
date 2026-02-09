/**
 * Gerçek Mikro ERP Service
 *
 * Production'da Mikro MSSQL veritabanına bağlanarak
 * veri çeker ve sipariş yazar.
 */

import * as sql from 'mssql';
import crypto from 'crypto';
import { config } from '../config';
import MIKRO_TABLES from '../config/mikro-tables';
import { cacheService } from './cache.service';
import {
  MikroCategory,
  MikroProduct,
  MikroWarehouseStock,
  MikroSalesMovement,
  MikroCustomerSaleMovement,
  MikroCustomerQuoteHistory,
  MikroPendingOrder,
  MikroPendingOrderByWarehouse,
  MikroCari,
  MikroCariPersonel,
} from '../types';

class MikroService {
  public purchasedCodesCache = new Map<string, { expiresAt: number; codes: string[] }>();
  public purchasedCodesTtlMs = 10 * 60 * 1000;

  public pool: sql.ConnectionPool | null = null;
  public sipBelgeColumns: { no: 'sip_belge_no' | 'sip_belgeno' | null; tarih: boolean } | null = null;
  public sipExtraColumns: { teklifUid: boolean } | null = null;

  /**
   * Mikro KDV kod → yüzde dönüşümü
   * Gerçek hareketlerden tespit edildi
   */
  public convertVatCodeToRate(vatCode: number): number {
    const vatMap: { [key: number]: number } = {
      0: 0.00,  // İstisna
      1: 0.00,  // İstisna
      2: 0.01,  // %1
      3: 0.00,  // Kullanılmıyor
      4: 0.18,  // %18
      5: 0.20,  // %20
      6: 0.00,  // Kullanılmıyor
      7: 0.10,  // %10
    };
    return vatMap[vatCode] ?? 0.20; // Default %20
  }
  /**
   * VAT rate -> Mikro vergi pntr code
   */
  public convertVatRateToCode(rate: number): number {
    const normalized = Math.round(rate * 100) / 100;
    if (!normalized) return 0;
    if (Math.abs(normalized - 0.01) < 0.001) return 2;
    if (Math.abs(normalized - 0.18) < 0.001) return 4;
    if (Math.abs(normalized - 0.2) < 0.001) return 5;
    if (Math.abs(normalized - 0.1) < 0.001) return 7;
    return 0;
  }

  private normalizeVatRate(rate: number): number {
    const numeric = Number(rate) || 0;
    if (numeric > 1) {
      return numeric / 100;
    }
    return numeric;
  }

  /**
   * Mikro veritabanına bağlan
   */
  async connect(): Promise<void> {
    if (this.pool) {
      if (this.pool.connected) {
        return;
      }

      if (this.pool.connecting) {
        await this.pool.connect();
        return;
      }

      try {
        await this.pool.close();
      } catch (error) {
        console.warn('WARN: Mikro connection could not be closed, retrying:', error);
      } finally {
        this.pool = null;
      }
    }

    try {
      this.pool = new sql.ConnectionPool(config.mikro);
      this.pool.on('error', (error) => {
        console.error('WARN: Mikro pool error:', error);
        this.pool = null;
      });
      await this.pool.connect();
      console.log('✅ Mikro ERP bağlantısı başarılı');
    } catch (error) {
      console.error('❌ Mikro ERP bağlantı hatası:', error);
      this.pool = null;
      throw new Error('Mikro ERP bağlantısı kurulamadı');
    }
  }

  async disconnect(): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.close();
    } catch (error) {
      console.warn('WARN: Mikro connection could not be closed:', error);
    } finally {
      this.pool = null;
    }
  }

  public async resolveSipBelgeColumns(): Promise<{ no: 'sip_belge_no' | 'sip_belgeno' | null; tarih: boolean }> {
    if (this.sipBelgeColumns) {
      return this.sipBelgeColumns;
    }

    if (!this.pool) {
      this.sipBelgeColumns = { no: null, tarih: false };
      return this.sipBelgeColumns;
    }

    try {
      const result = await this.pool
        .request()
        .query(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = 'SIPARISLER'
            AND COLUMN_NAME IN ('sip_belge_no', 'sip_belgeno', 'sip_belge_tarih')
        `);
      const columns = new Set(
        result.recordset.map((row: { COLUMN_NAME?: string }) =>
          String(row.COLUMN_NAME || '').toLowerCase()
        )
      );
      const hasBelgeNo = columns.has('sip_belge_no');
      const hasBelgeNoAlt = columns.has('sip_belgeno');
      this.sipBelgeColumns = {
        no: hasBelgeNo ? 'sip_belge_no' : hasBelgeNoAlt ? 'sip_belgeno' : null,
        tarih: columns.has('sip_belge_tarih'),
      };
    } catch (error) {
      console.warn('WARN: SIPARISLER belge kolonlari kontrol edilemedi:', error);
      this.sipBelgeColumns = { no: null, tarih: false };
    }

    return this.sipBelgeColumns;
  }

  public async resolveSipExtraColumns(): Promise<{ teklifUid: boolean }> {
    if (this.sipExtraColumns) {
      return this.sipExtraColumns;
    }

    try {
      const columnsResult = await this.pool!.request().query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'SIPARISLER'
      `);
      const columns = new Set(
        columnsResult.recordset.map((row: any) =>
          String(row.COLUMN_NAME || '').toLowerCase()
        )
      );
      this.sipExtraColumns = { teklifUid: columns.has('sip_teklif_uid') };
    } catch (error) {
      console.warn('WARN: SIPARISLER ekstra kolonlari kontrol edilemedi:', error);
      this.sipExtraColumns = { teklifUid: false };
    }

    return this.sipExtraColumns;
  }

  /**
   * Mikro teklif satirlarini getir
   */
  async getQuoteLines(params: { evrakSeri: string; evrakSira: number }): Promise<Array<{
    evrakSeri: string;
    evrakSira: number;
    satirNo: number;
    evrakTarihi: Date | null;
    baslangicTarihi: Date | null;
    gecerlilikSure: number | null;
    cariCode: string;
    productCode: string;
    quantity: number;
    unitPrice: number;
    brutPrice: number;
    vatAmount: number;
    vatCode: number;
    lineDescription: string;
    priceListNo: number;
    isClosed: boolean;
    closeReason: string;
    lastUpdatedAt: Date | null;
  }>> {
    await this.connect();

    const { evrakSeri, evrakSira } = params;

    const result = await this.pool!
      .request()
      .input('seri', sql.NVarChar(20), evrakSeri)
      .input('sira', sql.Int, evrakSira)
      .query(`
        SELECT
          tkl_evrakno_seri,
          tkl_evrakno_sira,
          tkl_satirno,
          tkl_evrak_tarihi,
          tkl_baslangic_tarihi,
          tkl_Gecerlilik_Sures,
          tkl_cari_kod,
          tkl_stok_kod,
          tkl_miktar,
          tkl_Birimfiyati,
          tkl_Brut_fiyat,
          tkl_vergi,
          tkl_vergi_pntr,
          tkl_Aciklama,
          tkl_fiyat_liste_no,
          tkl_kapat_fl,
          tkl_kapatmanedenkod,
          tkl_lastup_date
        FROM VERILEN_TEKLIFLER
        WHERE tkl_evrakno_seri = @seri AND tkl_evrakno_sira = @sira
        ORDER BY tkl_satirno
      `);

    return result.recordset.map((row: any) => ({
      evrakSeri: row.tkl_evrakno_seri,
      evrakSira: row.tkl_evrakno_sira,
      satirNo: row.tkl_satirno,
      evrakTarihi: row.tkl_evrak_tarihi || null,
      baslangicTarihi: row.tkl_baslangic_tarihi || null,
      gecerlilikSure: row.tkl_Gecerlilik_Sures ?? null,
      cariCode: row.tkl_cari_kod,
      productCode: row.tkl_stok_kod,
      quantity: Number(row.tkl_miktar) || 0,
      unitPrice: Number(row.tkl_Birimfiyati) || 0,
      brutPrice: Number(row.tkl_Brut_fiyat) || 0,
      vatAmount: Number(row.tkl_vergi) || 0,
      vatCode: Number(row.tkl_vergi_pntr) || 0,
      lineDescription: row.tkl_Aciklama || '',
      priceListNo: Number(row.tkl_fiyat_liste_no) || 0,
      isClosed: Boolean(row.tkl_kapat_fl),
      closeReason: row.tkl_kapatmanedenkod || '',
      lastUpdatedAt: row.tkl_lastup_date || null,
    }));
  }

  async getQuoteBelgeNos(pairs: Array<{ evrakSeri: string; evrakSira: number }>): Promise<Map<string, string>> {
    const normalized = pairs
      .map((pair) => ({
        evrakSeri: String(pair.evrakSeri || '').trim(),
        evrakSira: Number(pair.evrakSira),
      }))
      .filter((pair) => pair.evrakSeri && Number.isFinite(pair.evrakSira));

    const uniqueMap = new Map<string, { evrakSeri: string; evrakSira: number }>();
    normalized.forEach((pair) => {
      uniqueMap.set(`${pair.evrakSeri}-${pair.evrakSira}`, pair);
    });

    const uniquePairs = Array.from(uniqueMap.values()).slice(0, 200);
    if (uniquePairs.length === 0) {
      return new Map();
    }

    await this.connect();

    const conditions = uniquePairs
      .map((_, index) => `(tkl_evrakno_seri = @seri${index} AND tkl_evrakno_sira = @sira${index})`)
      .join(' OR ');

    const request = this.pool!.request();
    uniquePairs.forEach((pair, index) => {
      request.input(`seri${index}`, sql.NVarChar(20), pair.evrakSeri);
      request.input(`sira${index}`, sql.Int, pair.evrakSira);
    });

    const result = await request.query(`
      SELECT
        tkl_evrakno_seri,
        tkl_evrakno_sira,
        MAX(tkl_belge_no) as belge_no
      FROM VERILEN_TEKLIFLER
      WHERE ${conditions}
      GROUP BY tkl_evrakno_seri, tkl_evrakno_sira
    `);

    const map = new Map<string, string>();
    result.recordset.forEach((row: any) => {
      const evrakSeri = row.tkl_evrakno_seri ? String(row.tkl_evrakno_seri).trim() : '';
      const evrakSira = Number(row.tkl_evrakno_sira);
      const belgeNo = row.belge_no ? String(row.belge_no).trim() : '';
      if (!evrakSeri || !Number.isFinite(evrakSira) || !belgeNo) return;
      map.set(`${evrakSeri}-${evrakSira}`, belgeNo);
    });

    return map;
  }
  async getCustomerQuoteHistory(params: {
    cariCode: string;
    productCodes: string[];
    limit: number;
  }): Promise<MikroCustomerQuoteHistory[]> {
    const cariCode = String(params.cariCode || '').trim();
    const limit = Math.max(1, Math.min(10, Number(params.limit) || 1));
    const codes = (params.productCodes || [])
      .map((code) => String(code || '').trim())
      .filter(Boolean)
      .slice(0, 200);

    if (!cariCode || codes.length === 0) return [];

    await this.connect();

    const inClause = codes.map((_, index) => `@code${index}`).join(', ');
    const request = this.pool!.request();
    request.input('cariCode', sql.NVarChar(25), cariCode);
    codes.forEach((code, index) => {
      request.input(`code${index}`, sql.NVarChar(25), code);
    });

    const result = await request.query(`
      WITH ranked AS (
        SELECT
          tkl_stok_kod as productCode,
          tkl_Birimfiyati as unitPrice,
          tkl_miktar as quantity,
          tkl_evrak_tarihi as quoteDate,
          tkl_evrakno_seri as evrakSeri,
          tkl_evrakno_sira as evrakSira,
          tkl_belge_no as documentNo,
          ROW_NUMBER() OVER (
            PARTITION BY tkl_stok_kod
            ORDER BY tkl_evrak_tarihi DESC, tkl_evrakno_sira DESC, tkl_satirno DESC
          ) as rn
        FROM VERILEN_TEKLIFLER
        WHERE tkl_cari_kod = @cariCode
          AND tkl_stok_kod IN (${inClause})
      )
      SELECT * FROM ranked
      WHERE rn <= ${limit}
      ORDER BY productCode, rn
    `);

    return result.recordset.map((row: any) => ({
      productCode: String(row.productCode || '').trim(),
      quoteDate: row.quoteDate || new Date(),
      quantity: Number(row.quantity) || 0,
      unitPrice: Number(row.unitPrice) || 0,
      documentNo: row.documentNo ? String(row.documentNo).trim() : null,
      quoteNumber: row.evrakSeri && row.evrakSira
        ? `${String(row.evrakSeri).trim()}-${Number(row.evrakSira)}`
        : null,
    }));
  }


  async getQuoteLineGuids(params: { evrakSeri: string; evrakSira: number }): Promise<Array<{
    satirNo: number;
    guid: string;
    productCode: string;
    unitPrice: number;
    quantity: number;
  }>> {
    await this.connect();

    const { evrakSeri, evrakSira } = params;

    const result = await this.pool!
      .request()
      .input('seri', sql.NVarChar(20), evrakSeri)
      .input('sira', sql.Int, evrakSira)
      .query(`
        SELECT
          tkl_satirno,
          tkl_Guid,
          tkl_stok_kod,
          tkl_Birimfiyati,
          tkl_miktar
        FROM VERILEN_TEKLIFLER
        WHERE tkl_evrakno_seri = @seri AND tkl_evrakno_sira = @sira
        ORDER BY tkl_satirno
      `);

    return result.recordset.map((row: any) => ({
      satirNo: Number(row.tkl_satirno) || 0,
      guid: row.tkl_Guid || '',
      productCode: row.tkl_stok_kod || '',
      unitPrice: Number(row.tkl_Birimfiyati) || 0,
      quantity: Number(row.tkl_miktar) || 0,
    }));
  }

  async hasOrdersForQuote(params: { evrakSeri: string; evrakSira: number }): Promise<boolean> {
    const sipExtraColumns = await this.resolveSipExtraColumns();
    if (!sipExtraColumns.teklifUid) {
      return false;
    }

    const guids = await this.getQuoteLineGuids(params);
    const guidList = guids.map((row) => row.guid).filter(Boolean) as string[];
    if (!guidList.length) {
      return false;
    }

    const request = this.pool!.request();
    guidList.forEach((guid, index) => {
      request.input(`guid${index}`, sql.UniqueIdentifier, guid);
    });
    const inClause = guidList.map((_, index) => `@guid${index}`).join(",");

    const result = await request.query(`
      SELECT TOP 1 sip_teklif_uid
      FROM SIPARISLER
      WHERE sip_teklif_uid IN (${inClause})
    `);

    return result.recordset.length > 0;
  }

  async closeQuoteLines(params: {
    evrakSeri: string;
    evrakSira: number;
    lines: Array<{ satirNo: number; reason: string }>;
  }): Promise<number> {
    await this.connect();

    const { evrakSeri, evrakSira, lines } = params;
    let affected = 0;

    for (const line of lines) {
      const reason = String(line.reason || '').trim().slice(0, 25);
      const satirNo = Number(line.satirNo);
      if (!Number.isFinite(satirNo)) {
        continue;
      }
      const result = await this.pool!
        .request()
        .input('seri', sql.NVarChar(20), evrakSeri)
        .input('sira', sql.Int, evrakSira)
        .input('satirNo', sql.Int, satirNo)
        .input('reason', sql.NVarChar(25), reason)
        .query(`
          UPDATE VERILEN_TEKLIFLER
          SET
            TKL_KAPAT_FL = 1,
            tkl_kapatmanedenkod = @reason,
            tkl_lastup_date = GETDATE()
          WHERE tkl_evrakno_seri = @seri
            AND tkl_evrakno_sira = @sira
            AND tkl_satirno = @satirNo
        `);
      if (Array.isArray(result.rowsAffected) && result.rowsAffected.length > 0) {
        affected += result.rowsAffected[0] || 0;
      }
    }

    return affected;
  }

  async reopenQuoteLines(params: {
    evrakSeri: string;
    evrakSira: number;
    lines: Array<{ satirNo: number }>;
  }): Promise<number> {
    await this.connect();

    const { evrakSeri, evrakSira, lines } = params;
    let affected = 0;

    for (const line of lines) {
      const satirNo = Number(line.satirNo);
      if (!Number.isFinite(satirNo)) {
        continue;
      }
      const result = await this.pool!
        .request()
        .input('seri', sql.NVarChar(20), evrakSeri)
        .input('sira', sql.Int, evrakSira)
        .input('satirNo', sql.Int, satirNo)
        .query(`
          UPDATE VERILEN_TEKLIFLER
          SET
            TKL_KAPAT_FL = 0,
            tkl_kapatmanedenkod = '',
            tkl_lastup_date = GETDATE()
          WHERE tkl_evrakno_seri = @seri
            AND tkl_evrakno_sira = @sira
            AND tkl_satirno = @satirNo
        `);
      if (Array.isArray(result.rowsAffected) && result.rowsAffected.length > 0) {
        affected += result.rowsAffected[0] || 0;
      }
    }

    return affected;
  }

  /**
   * Kategorileri çek
   */
  async getCategories(): Promise<MikroCategory[]> {
    await this.connect();

    const { CATEGORIES, CATEGORIES_COLUMNS } = MIKRO_TABLES;

    const query = `
      SELECT
        ${CATEGORIES_COLUMNS.CODE} as id,
        ${CATEGORIES_COLUMNS.CODE} as code,
        ${CATEGORIES_COLUMNS.NAME} as name
      FROM ${CATEGORIES}
      WHERE ${CATEGORIES_COLUMNS.CODE} IS NOT NULL
        AND ${CATEGORIES_COLUMNS.CODE} != ''
      ORDER BY ${CATEGORIES_COLUMNS.NAME}
    `;

    const result = await this.pool!.request().query(query);
    return result.recordset;
  }

  /**
   * Ürünleri çek (sadece aktif stoklar)
   * Depo bazlı stok bilgilerini de dahil eder
   */
  async getProducts(): Promise<MikroProduct[]> {
    await this.connect();

    const { PRODUCTS, PRODUCTS_COLUMNS } = MIKRO_TABLES;

    // Ana depolar: 1=Merkez, 2=Ereğli, 6=Topça, 7=Dükkan
    const query = `
        SELECT
          ${PRODUCTS_COLUMNS.CODE} as id,
          ${PRODUCTS_COLUMNS.CODE} as code,
          ${PRODUCTS_COLUMNS.NAME} as name,
          ${PRODUCTS_COLUMNS.FOREIGN_NAME} as foreignName,
          ${PRODUCTS_COLUMNS.BRAND_CODE} as brandCode,
          ${PRODUCTS_COLUMNS.CATEGORY_CODE} as categoryId,
        ${PRODUCTS_COLUMNS.UNIT} as unit,
        ${PRODUCTS_COLUMNS.UNIT2} as unit2,
        ${PRODUCTS_COLUMNS.UNIT2_FACTOR} as unit2Factor,
        ${PRODUCTS_COLUMNS.VAT_RATE} as vatCode,
        ${PRODUCTS_COLUMNS.CURRENT_COST} as currentCost,
        sto_Guid as guid,

        -- Güncel maliyet tarihi (sto_resim_url alanında tutuluyor)
        sto_resim_url as currentCostDate,

        -- Son giriş tarihi (STOK_HAREKETLERI'nden)
        (SELECT TOP 1 sth_tarih
         FROM STOK_HAREKETLERI
         WHERE sth_stok_kod = ${PRODUCTS_COLUMNS.CODE}
           AND sth_tip = 0
           AND sth_evraktip IN (3, 13)
           AND sth_cins IN (0, 1)
           AND sth_normal_iade = 0
         ORDER BY sth_tarih DESC) as lastEntryDate,

        -- Son giriş maliyeti (KDV hariç, birim fiyat)
        -- F10'daki ile aynı mantık: Sadece gerçek depo girişleri
        (SELECT TOP 1
         dbo.fn_StokHareketNetDeger(
           sth_tutar,
           sth_iskonto1,
           sth_iskonto2,
           sth_iskonto3,
           sth_iskonto4,
           sth_iskonto5,
           sth_iskonto6,
           sth_masraf1,
           sth_masraf2,
           sth_masraf3,
           sth_masraf4,
           sth_otvtutari,
           sth_tip,
           0,
           0,
           sth_har_doviz_kuru,
           sth_alt_doviz_kuru,
           sth_stok_doviz_kuru
         ) / sth_miktar
         FROM STOK_HAREKETLERI
         WHERE sth_stok_kod = ${PRODUCTS_COLUMNS.CODE}
           AND sth_tip = 0
           AND sth_evraktip IN (3, 13)
           AND sth_cins IN (0, 1)
           AND sth_normal_iade = 0
           AND sth_fat_uid != '00000000-0000-0000-0000-000000000000'
         ORDER BY sth_tarih DESC) as lastEntryPrice,

        -- Depo stokları
        dbo.fn_DepodakiMiktar(${PRODUCTS_COLUMNS.CODE}, 1, 0) as depo1,
        dbo.fn_DepodakiMiktar(${PRODUCTS_COLUMNS.CODE}, 2, 0) as depo2,
        dbo.fn_DepodakiMiktar(${PRODUCTS_COLUMNS.CODE}, 6, 0) as depo6,
        dbo.fn_DepodakiMiktar(${PRODUCTS_COLUMNS.CODE}, 7, 0) as depo7
      FROM ${PRODUCTS}
      WHERE ${PRODUCTS_COLUMNS.PASSIVE} = 0
        AND ${PRODUCTS_COLUMNS.CODE} IS NOT NULL
        AND ${PRODUCTS_COLUMNS.CODE} != ''
        AND ${PRODUCTS_COLUMNS.NAME} IS NOT NULL
        AND ${PRODUCTS_COLUMNS.NAME} != ''
      ORDER BY ${PRODUCTS_COLUMNS.NAME}
    `;

    const result = await this.pool!.request().query(query);

    // KDV kodunu yüzde oranına çevir ve depo stoklarını JSON'a dönüştür
      return result.recordset.map((product: any) => ({
        id: product.id,
        code: product.code,
        name: product.name,
        foreignName: product.foreignName || null,
        brandCode: product.brandCode || null,
        categoryId: product.categoryId,
      unit: product.unit,
      unit2: product.unit2 || null,
      unit2Factor: Number.isFinite(Number(product.unit2Factor)) ? Number(product.unit2Factor) : null,
      vatCode: product.vatCode,
      vatRate: this.convertVatCodeToRate(product.vatCode),
      currentCost: product.currentCost,
      currentCostDate: product.currentCostDate,
      lastEntryPrice: product.lastEntryPrice,
      lastEntryDate: product.lastEntryDate,
      guid: product.guid, // Resim çekmek için GUID gerekli
      // Depo stoklarını JSON formatına çevir
      warehouseStocks: {
        '1': product.depo1 || 0,  // Merkez
        '2': product.depo2 || 0,  // Ereğli
        '6': product.depo6 || 0,  // Topça
        '7': product.depo7 || 0,  // Dükkan
      },
    }));
  }

  async getProductGuidsByCodes(productCodes: string[]): Promise<Array<{ code: string; guid: string | null }>> {
    if (!productCodes || productCodes.length === 0) {
      return [];
    }

    await this.connect();

    const uniqueCodes = Array.from(
      new Set(productCodes.map((code) => (code || '').trim()).filter((code) => code.length > 0))
    );

    const safeCodes = uniqueCodes
      .map((code) => code.replace(/'/g, "''"))
      .map((code) => `'${code}'`)
      .join(', ');

    if (!safeCodes) {
      return [];
    }

    const { PRODUCTS, PRODUCTS_COLUMNS } = MIKRO_TABLES;
    const query = `
      SELECT
        ${PRODUCTS_COLUMNS.CODE} as code,
        sto_Guid as guid
      FROM ${PRODUCTS}
      WHERE ${PRODUCTS_COLUMNS.CODE} IN (${safeCodes})
    `;

    const result = await this.pool!.request().query(query);

    return result.recordset.map((row: any) => ({
      code: row.code,
      guid: row.guid || null,
    }));
  }

  /**
   * Depo stoklarını çek
   * NOT: Bu metod artık getProducts() içinde çekiliyor
   */
  async getWarehouseStocks(): Promise<MikroWarehouseStock[]> {
    // Artık bu metoda gerek yok, getProducts() içinde alınıyor
    // Ama geriye dönük uyumluluk için boş array döndürüyoruz
    return [];
  }

  /**
   * Satış geçmişi (günlük - son 90 gün)
   * F10 sorgusundan alınan TAMAMEN AYNI mantık:
   * - İrsaliyeli (evraktip=4) satışlar
   * - VEYA Faturalı (evraktip=1 + fat_uid dolu) satışlar
   * - VEYA fat_uid boş olan satışlar (evraktip ne olursa olsun)
   * - Sadece belirli sektör kodlarına sahip carilerle yapılan satışlar
   */
  async getSalesHistory(): Promise<MikroSalesMovement[]> {
    await this.connect();

    const query = `
      SELECT
        sth_stok_kod as productCode,
        CONVERT(DATE, sth_tarih) as saleDate,
        SUM(sth_miktar) as totalQuantity
      FROM STOK_HAREKETLERI
      WHERE
        -- Satış hareketleri (tip=1)
        sth_tip = 1
        -- F10'daki mantık: İrsaliyeli VEYA Faturalı VEYA fat_uid boş olanlar
        AND (
          (sth_evraktip = 4)
          OR
          (sth_evraktip = 1 AND sth_fat_uid != '00000000-0000-0000-0000-000000000000')
          OR
          (sth_fat_uid = '00000000-0000-0000-0000-000000000000')
        )
        -- Belirli sektör kodlarına sahip carilerle yapılan satışlar
        AND (
          SELECT cari_sektor_kodu
          FROM CARI_HESAPLAR
          WHERE cari_kod = sth_cari_kodu
        ) IN ('İNTERNET','HENDEK','HUKUKİ','İPTAL EDİLECEK CARİ','ERHAN','TOPÇA','BÜŞRA','ENSAR','SATICI BARTIR','BETÜL','HAVUZ','ERTANE','MERVE','SELDA','SORUNLU CARİ')
        -- Son 90 gün (F10 ile aynı)
        AND sth_tarih >= DATEADD(DAY, -90, GETDATE())
      GROUP BY
        sth_stok_kod,
        CONVERT(DATE, sth_tarih)
    `;

    const result = await this.pool!.request().query(query);
    return result.recordset;
  }

  /**
   * Cari bazlŽñ daha Çônce satŽñY yapŽñlan Ç¬rÇ¬n kodlarŽñnŽñ getir
   */
  async getPurchasedProductCodes(cariCode: string): Promise<string[]> {
    if (!cariCode) {
      return [];
    }

    const cacheKey = cariCode.trim();
    const cached = this.purchasedCodesCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.codes;
    }

    const redisCached = await cacheService.get<string[]>('mikro-purchased', cacheKey);
    if (redisCached) {
      this.purchasedCodesCache.set(cacheKey, {
        expiresAt: Date.now() + this.purchasedCodesTtlMs,
        codes: redisCached,
      });
      return redisCached;
    }

    await this.connect();

    const request = this.pool!.request();
    request.input('cariCode', sql.NVarChar, cariCode);

      const query = `
        SELECT DISTINCT
          sth_stok_kod as productCode
        FROM STOK_HAREKETLERI
        WHERE
          sth_tip = 1
          AND sth_cari_kodu = @cariCode
          AND (
            (sth_evraktip = 4)
            OR
            (sth_evraktip = 1 AND sth_fat_uid != '00000000-0000-0000-0000-000000000000')
            OR
            (sth_fat_uid = '00000000-0000-0000-0000-000000000000')
          )
          AND sth_stok_kod IS NOT NULL
      `;

      const result = await request.query(query);
      const codes = new Set<string>();
      for (const row of result.recordset || []) {
        const raw = String(row.productCode || '');
        const trimmed = raw.trim();
        if (!trimmed) continue;
        codes.add(raw);
        codes.add(trimmed);
      }
      const resultCodes = Array.from(codes);
      this.purchasedCodesCache.set(cacheKey, {
        expiresAt: Date.now() + this.purchasedCodesTtlMs,
        codes: resultCodes,
      });
      cacheService
        .set('mikro-purchased', cacheKey, resultCodes, Math.floor(this.purchasedCodesTtlMs / 1000))
        .catch((error) => {
          console.error('Purchased codes redis cache set failed:', error);
        });
      return resultCodes;
  }

  /**
   * Cari bazlÄ± son satÄ±ÅŸ hareketleri (Ã¼rÃ¼n bazÄ±nda son N)
   */
  async getCustomerSalesMovements(
    cariCode: string,
    productCodes: string[],
    limit = 1
  ): Promise<MikroCustomerSaleMovement[]> {
    if (!cariCode || productCodes.length === 0) {
      return [];
    }

    const normalizedCodes = productCodes
      .map((code) => code.trim())
      .filter((code) => code.length > 0);
    if (normalizedCodes.length === 0) {
      return [];
    }

    const codesHash = crypto
      .createHash('sha1')
      .update(normalizedCodes.slice().sort().join('|'))
      .digest('hex');
    const cacheKey = `${cariCode}:${limit}:${codesHash}`;
    const redisCached = await cacheService.get<MikroCustomerSaleMovement[]>('mikro-last-sales', cacheKey);
    if (redisCached) {
      return redisCached;
    }

    await this.connect();

        const safeCodes = normalizedCodes
          .map((code) => code.replace(/'/g, "''"))
          .map((code) => `'${code}'`)
          .join(', ');
        if (!safeCodes) {
          return [];
        }

    const request = this.pool!.request();
    request.input('cariCode', sql.NVarChar, cariCode);
    request.input('limit', sql.Int, limit);

    const query = `
      WITH RankedSales AS (
        SELECT
          sth_stok_kod as productCode,
          sth_tarih as saleDate,
          sth_miktar as quantity,
          CASE
            WHEN sth_miktar = 0 THEN 0
            ELSE sth_tutar / NULLIF(sth_miktar, 0)
          END as unitPrice,
          sth_tutar as lineTotal,
          sth_vergi as vatAmount,
          CASE
            WHEN sth_tutar = 0 THEN 0
            ELSE sth_vergi / NULLIF(sth_tutar, 0)
          END as vatRate,
          ROW_NUMBER() OVER (PARTITION BY sth_stok_kod ORDER BY sth_tarih DESC) as rn
        FROM STOK_HAREKETLERI
        WHERE
          sth_tip = 1
          AND sth_cari_kodu = @cariCode
          AND sth_stok_kod IN (${safeCodes})
          AND (
            (sth_evraktip = 4)
            OR
            (sth_evraktip = 1 AND sth_fat_uid != '00000000-0000-0000-0000-000000000000')
            OR
            (sth_fat_uid = '00000000-0000-0000-0000-000000000000')
          )
      )
      SELECT
        productCode,
        saleDate,
        quantity,
        unitPrice,
        lineTotal,
        vatAmount,
        vatRate
      FROM RankedSales
      WHERE rn <= @limit
      ORDER BY productCode, saleDate DESC
    `;

      const result = await request.query(query);
      const rows = result.recordset.map((row: any) => ({
        productCode: row.productCode,
        saleDate: row.saleDate,
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        lineTotal: row.lineTotal,
        vatAmount: row.vatAmount,
        vatRate: row.vatRate,
        vatZeroed: Number(row.vatAmount || 0) === 0,
      }));
      cacheService
        .set('mikro-last-sales', cacheKey, rows, 300)
        .catch((error) => {
          console.error('Customer last sales redis cache set failed:', error);
        });
      return rows;
    }

  /**
   * Bekleyen siparişler (müşteri siparişleri ve satın alma siparişleri)
   *
   * F10'dan alınan gerçek sorgu:
   * - sip_tip=0: Müşteri siparişi (SALES)
   * - sip_tip=1: Satın alma siparişi (PURCHASE)
   */
  async getPendingOrders(): Promise<MikroPendingOrder[]> {
    await this.connect();

    const query = `
      SELECT
        sip_stok_kod as productCode,
        SUM(sip_miktar - sip_teslim_miktar) as quantity,
        sip_tip as orderType
      FROM SIPARISLER
      WHERE sip_kapat_fl = 0
        AND sip_miktar > sip_teslim_miktar
        AND sip_stok_kod IS NOT NULL
      GROUP BY sip_stok_kod, sip_tip
    `;

    const result = await this.pool!.request().query(query);

    return result.recordset.map((row: any) => ({
      productCode: row.productCode,
      quantity: row.quantity,
      type: row.orderType === 0 ? 'SALES' : 'PURCHASE',
    }));
  }

  /**
   * Bekleyen sipari�ler (depo bazl�)
   */
  async getPendingOrdersByWarehouse(): Promise<MikroPendingOrderByWarehouse[]> {
    await this.connect();

    const query = `
      SELECT
        sip_stok_kod as productCode,
        sip_depono as warehouseCode,
        SUM(sip_miktar - sip_teslim_miktar) as quantity,
        sip_tip as orderType
      FROM SIPARISLER
      WHERE sip_kapat_fl = 0
        AND sip_miktar > sip_teslim_miktar
        AND sip_stok_kod IS NOT NULL
      GROUP BY sip_stok_kod, sip_tip, sip_depono
    `;

    const result = await this.pool!.request().query(query);

    return result.recordset.map((row: any) => ({
      productCode: row.productCode,
      warehouseCode: String(row.warehouseCode ?? ''),
      quantity: Number(row.quantity) || 0,
      type: row.orderType === 0 ? 'SALES' : 'PURCHASE',
    }));
  }

  /**
   * Cari listesini getir (basit - sadece kod ve isim)
   */
  async getCariList(): Promise<MikroCari[]> {
    await this.connect();

    const { CARI, CARI_COLUMNS } = MIKRO_TABLES;

    const query = `
      SELECT
        ${CARI_COLUMNS.CODE} as code,
        ${CARI_COLUMNS.NAME} as name
      FROM ${CARI}
      WHERE ${CARI_COLUMNS.CODE} IS NOT NULL
        AND ${CARI_COLUMNS.CODE} != ''
      ORDER BY ${CARI_COLUMNS.NAME}
    `;

    const result = await this.pool!.request().query(query);

    return result.recordset.map((row: any) => ({
      code: row.code,
      name: row.name,
      isLocked: false,
      hasEInvoice: false,
      balance: 0,
    }));
  }

  /**
   * Cari detaylı bilgilerini getir (tüm cariler)
   * Şehir, telefon, bakiye, vade gibi detaylı bilgilerle
   */
  async getCariDetails(): Promise<Array<{
    code: string;
    name: string;
    city?: string;
    district?: string;
    phone?: string;
    isLocked: boolean;
    groupCode?: string;
    sectorCode?: string;
    paymentTerm?: number | null;
    paymentPlanNo?: number | null;
    paymentPlanCode?: string | null;
    paymentPlanName?: string | null;
    hasEInvoice: boolean;
    balance: number;
  }>> {
    await this.connect();

    const query = `
      SELECT
        cari_kod as code,
        cari_unvan1 as name,
        cari_cari_kilitli_flg as isLocked,
        cari_grup_kodu as groupCode,
        cari_sektor_kodu as sectorCode,
        cari_CepTel as phone,
        ABS(cari_odemeplan_no) as paymentPlanNo,
        odp.odp_kodu as paymentPlanCode,
        odp.odp_adi as paymentPlanName,
        cari_efatura_fl as hasEInvoice,

        -- Adres bilgileri (1 numaralı adres = ana adres)
        (SELECT adr_il FROM CARI_HESAP_ADRESLERI
         WHERE adr_adres_no = '1' AND adr_cari_kod = cari_kod) as city,
        (SELECT adr_ilce FROM CARI_HESAP_ADRESLERI
         WHERE adr_adres_no = '1' AND adr_cari_kod = cari_kod) as district,

        -- Genel bakiye (ana döviz - TL)
        dbo.fn_CariHesapAnaDovizBakiye('', 0, cari_kod, '', '', NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL) as balance

      FROM CARI_HESAPLAR
      LEFT JOIN ODEME_PLANLARI odp ON odp.odp_no = ABS(cari_odemeplan_no)
      WHERE cari_kod IS NOT NULL
        AND cari_kod != ''
      ORDER BY cari_unvan1
    `;

    const result = await this.pool!.request().query(query);

    return result.recordset.map((row: any) => {
      const planCode = row.paymentPlanCode ? String(row.paymentPlanCode).trim() : '';
      const planCodeNumber = planCode ? Number(planCode.replace(',', '.')) : NaN;
      const paymentTerm = Number.isInteger(planCodeNumber) ? planCodeNumber : null;

      return {
        code: row.code,
        name: row.name,
        city: row.city,
        district: row.district,
        phone: row.phone,
        isLocked: row.isLocked === 1,
        groupCode: row.groupCode,
        sectorCode: row.sectorCode,
        paymentTerm,
        paymentPlanNo: row.paymentPlanNo ? Number(row.paymentPlanNo) : null,
        paymentPlanCode: planCode || null,
        paymentPlanName: row.paymentPlanName ? String(row.paymentPlanName).trim() : null,
        hasEInvoice: row.hasEInvoice === 1,
        balance: row.balance || 0,
      };
    });
  }

  /**
   * Cari personel listesini getir
   */
  async getCariPersonelList(): Promise<MikroCariPersonel[]> {
    await this.connect();

    const result = await this.pool!.request().query(`
      SELECT
        cari_per_kod as code,
        cari_per_adi as name,
        cari_per_soyadi as surname
      FROM CARI_PERSONEL_TANIMLARI
      WHERE cari_per_iptal = 0
        AND cari_per_kilitli = 0
        AND cari_per_kod IS NOT NULL
        AND cari_per_kod != ''
      ORDER BY cari_per_kod
    `);

    return result.recordset
      .map((row: any) => ({
        code: (row.code || '').trim(),
        name: row.name || '',
        surname: row.surname || '',
      }))
      .filter((row) => row.code);
  }

  /**
   * Anlık stok kontrolü (Mikro fonksiyonu kullanarak)
   */
  async getRealtimeStock(
    productCode: string,
    includedWarehouses: string[]
  ): Promise<number> {
    await this.connect();

    // Her depo için ayrı ayrı fonksiyon çağır ve topla
    let totalStock = 0;

    for (const warehouseNo of includedWarehouses) {
      const query = `
        SELECT dbo.fn_DepodakiMiktar(@productCode, @warehouseNo, 0) as stock
      `;

      const request = this.pool!.request();
      request.input('productCode', sql.VarChar, productCode);
      request.input('warehouseNo', sql.Int, parseInt(warehouseNo));

      const result = await request.query(query);
      totalStock += result.recordset[0]?.stock || 0;
    }

    return totalStock;
  }

  /**
   * Mikro'ya sipariş yaz
   *
   * Faturalı ve beyaz siparişler için ayrı evrak serileri kullanılır:
   * - Faturalı: "B2B_FATURAL"
   * - Beyaz: "B2B_BEYAZ"
   *
   * Her sipariş için:
   * 1. Yeni evrak sıra numarası alınır (MAX + 1)
   * 2. Her item için ayrı satır eklenir (satirno: 0, 1, 2...)
   * 3. Transaction içinde çalışır (hepsi veya hiçbiri)
   */
  async writeOrder(orderData: {
    cariCode: string;
    items: Array<{
      productCode: string;
      quantity: number;
      unitPrice: number;
      vatRate: number;
      lineDescription?: string;
      quoteLineGuid?: string;
      responsibilityCenter?: string;
    }>;
    applyVAT: boolean;
    description: string;
    documentDescription?: string;
    documentNo?: string;
    evrakSeri?: string;
    evrakSira?: number;
    warehouseNo?: number;
  }): Promise<string> {
    await this.connect();

    const { cariCode, items, applyVAT, description, documentDescription, documentNo, evrakSeri: evrakSeriInput, evrakSira: evrakSiraInput, warehouseNo } = orderData;
    const descriptionValue = String((documentDescription ?? description) || '').trim();
    const documentDescriptionValue = descriptionValue ? descriptionValue.slice(0, 127) : null;
    const documentNoValue = documentNo ? String(documentNo).trim().slice(0, 50) : null;
    const belgeTarih = documentNoValue ? new Date() : null;
    const sipBelgeColumns = await this.resolveSipBelgeColumns();
    const belgeNoColumn = sipBelgeColumns.no;
    const includeBelgeNo = Boolean(belgeNoColumn);
    const includeBelgeTarih = sipBelgeColumns.tarih;
    const sipExtraColumns = await this.resolveSipExtraColumns();
    const includeQuoteGuid = sipExtraColumns.teklifUid && items.some((item) => Boolean(item.quoteLineGuid));
    const zeroGuid = '00000000-0000-0000-0000-000000000000';
    const warehouseValueRaw = Number(warehouseNo);
    const warehouseValue = Number.isFinite(warehouseValueRaw) && warehouseValueRaw > 0 ? Math.trunc(warehouseValueRaw) : 1;
    const evrakSeriValue = evrakSeriInput ? String(evrakSeriInput).trim().slice(0, 20) : '';
    const defaultSorMerkez = String(process.env.MIKRO_SORMERK || 'HENDEK').trim().slice(0, 25);
    const projeKodu = String(process.env.MIKRO_PROJE_KODU || 'R').trim().slice(0, 25);
    const hareketTipi = 0;
    const vergiSizFlag = applyVAT ? 0 : 1;

    if (documentNoValue && !includeBelgeNo) {
      console.warn('WARN: SIPARISLER sip_belge_no/sip_belgeno kolonunu bulamadik, belge no yazilmadi.');
    }

    // Evrak serisi belirle
    const evrakSeri = evrakSeriValue || (applyVAT ? 'B2BF' : 'B2BB');
    let sipFileId: number | null = null;

    try {
      const fileResult = await this.pool!
        .request()
        .input('seri', sql.NVarChar(20), evrakSeri)
        .query(`
          SELECT TOP 1 sip_fileid
          FROM SIPARISLER
          WHERE sip_evrakno_seri = @seri
            AND sip_fileid IS NOT NULL
          ORDER BY sip_create_date DESC
        `);
      const foundFileId = Number(fileResult.recordset?.[0]?.sip_fileid);
      sipFileId = Number.isFinite(foundFileId) && foundFileId > 0 ? foundFileId : null;
    } catch (error) {
      console.warn('WARN: SIPARISLER sip_fileid okunamadi, varsayilan kullaniliyor:', error);
    }

    if (!sipFileId) {
      sipFileId = 21;
    }

    console.log(`🔧 Sipariş parametreleri:`, {
      cariCode,
      itemCount: items.length,
      applyVAT,
      evrakSeri
    });

    // SIPARISLER_OZET trigger'ını geçici olarak devre dışı bırak
    // Bu trigger duplicate key hatası veriyor ve transaction'ı uncommittable yapıyor
    try {
      await this.pool!.request().query('DISABLE TRIGGER mye_SIPARISLER_Trigger ON SIPARISLER');
      console.log('✓ SIPARISLER trigger devre dışı bırakıldı');
    } catch (err) {
      console.log('⚠️ Trigger devre dışı bırakılamadı:', err);
    }

    // Transaction başlat
    const transaction = this.pool!.transaction();

    try {
      console.log('🔧 Transaction başlatılıyor...');
      await transaction.begin();
      console.log('✓ Transaction başlatıldı');

      // 1. Yeni evrak sıra numarası al (bu seri için)
      console.log('🔧 Yeni sıra numarası alınıyor...');
      const requestedSiraRaw = Number(evrakSiraInput);
      const requestedSira =
        Number.isFinite(requestedSiraRaw) && requestedSiraRaw > 0
          ? Math.trunc(requestedSiraRaw)
          : null;

      let evrakSira: number;

      if (requestedSira) {
        const existingResult = await transaction
          .request()
          .input('seri', sql.NVarChar(20), evrakSeri)
          .input('sira', sql.Int, requestedSira)
          .query(`
            SELECT TOP 1 sip_evrakno_sira
            FROM SIPARISLER
            WHERE sip_evrakno_seri = @seri AND sip_evrakno_sira = @sira
          `);

        if (existingResult.recordset.length > 0) {
          throw new Error(`Evrak sira zaten kullanilmis: ${evrakSeri}-${requestedSira}`);
        }

        evrakSira = requestedSira;
      } else {
        const maxSiraResult = await transaction
          .request()
          .input('seri', sql.NVarChar(20), evrakSeri)
          .query(`
            SELECT ISNULL(MAX(sip_evrakno_sira), 0) + 1 as yeni_sira
            FROM SIPARISLER
            WHERE sip_evrakno_seri = @seri
          `);

        evrakSira = maxSiraResult.recordset[0].yeni_sira;
      }

      const orderNumber = `${evrakSeri}-${evrakSira}`;

      console.log(`📝 Mikro'ya sipariş yazılıyor: ${orderNumber}`);

      // 2. Her item için satır ekle
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const satirNo = i;
        const itemLineNote = item.lineDescription ? String(item.lineDescription).trim() : '';
        const lineDescriptionValue = itemLineNote.slice(0, 50);
        const lineSorMerkez = (item.responsibilityCenter || defaultSorMerkez || '').trim().slice(0, 25);

        // Hesaplamalar
        const vatRate = this.normalizeVatRate(Number(item.vatRate) || 0);
        const tutar = item.quantity * item.unitPrice;
        const vergiTutari = applyVAT ? tutar * vatRate : 0;
        const vatCode = applyVAT ? this.convertVatRateToCode(vatRate) : 0;

        console.log(`🔧 Satır ${satirNo} hazırlanıyor:`, {
          productCode: item.productCode,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          vatRate,
          vatCode,
          tutar,
          vergiTutari,
        });

        // INSERT query - Trigger devre dışı olduğu için hatasız çalışacak
        const columnNames = [
          'sip_evrakno_seri',
          'sip_evrakno_sira',
          'sip_satirno',
          'sip_tarih',
          'sip_teslim_tarih',
          'sip_tip',
          'sip_cins',
          'sip_musteri_kod',
          'sip_stok_kod',
          ...(includeQuoteGuid ? ['sip_teklif_uid'] : []),
          'sip_miktar',
          'sip_teslim_miktar',
          'sip_b_fiyat',
          'sip_tutar',
          'sip_vergi',
          'sip_vergi_pntr',
          'sip_iptal',
          'sip_kapat_fl',
          'sip_depono',
          'sip_doviz_cinsi',
          'sip_doviz_kuru',
          'sip_fileid',
          'sip_aciklama',
          'sip_harekettipi',
          'sip_stok_sormerk',
          'sip_cari_sormerk',
          'sip_projekodu',
          ...(belgeNoColumn ? [belgeNoColumn] : []),
          ...(includeBelgeTarih ? ['sip_belge_tarih'] : []),
          'sip_create_date',
          'sip_DBCno',
          'sip_firmano',
          'sip_subeno',
          'sip_iskonto_1',
          'sip_iskonto_2',
          'sip_iskonto_3',
          'sip_iskonto_4',
          'sip_iskonto_5',
          'sip_iskonto_6',
          'sip_masraf_1',
          'sip_masraf_2',
          'sip_masraf_3',
          'sip_masraf_4',
          'sip_masvergi',
          'sip_Otv_Vergi',
          'sip_otvtutari',
        ];

        const valueNames = [
          '@seri',
          '@sira',
          '@satirNo',
          'GETDATE()',
          'DATEADD(day, 7, GETDATE())',
          '0',
          '0',
          '@cariKod',
          '@stokKod',
          ...(includeQuoteGuid ? ['@teklifUid'] : []),
          '@miktar',
          '0',
          '@fiyat',
          '@tutar',
          '@vergiTutari',
          '@vergiPntr',
          '0',
          '0',
          '@depoNo',
          '0',
          '1',
          '@sipFileId',
          '@aciklama',
          '@hareketTipi',
          '@stokSorMerkez',
          '@cariSorMerkez',
          '@projeKodu',
          ...(belgeNoColumn ? ['@belgeNo'] : []),
          ...(includeBelgeTarih ? ['@belgeTarih'] : []),
          'GETDATE()',
          '0',
          '0',
          '0',
          '0',
          '0',
          '0',
          '0',
          '0',
          '0',
          '0',
          '0',
          '0',
          '0',
          '0',
          '0',
          '0',
        ];

        const insertQuery = `
          INSERT INTO SIPARISLER (
            ${columnNames.join(',\n            ')}
          ) VALUES (
            ${valueNames.join(',\n            ')}
          )
        `;

        console.log(`???? INSERT query ?al??t?r?l?yor...`);
        const request = transaction
          .request()
          .input('seri', sql.NVarChar(20), evrakSeri)
          .input('sira', sql.Int, evrakSira)
          .input('satirNo', sql.Int, satirNo)
          .input('cariKod', sql.NVarChar(25), cariCode)
          .input('stokKod', sql.NVarChar(25), item.productCode)
          .input('miktar', sql.Float, item.quantity)
          .input('depoNo', sql.Int, warehouseValue)
          .input('fiyat', sql.Float, item.unitPrice)
          .input('tutar', sql.Float, tutar)
          .input('vergiTutari', sql.Float, vergiTutari)
          .input('vergiPntr', sql.TinyInt, vatCode)
          .input('sipFileId', sql.SmallInt, sipFileId)
          .input('aciklama', sql.NVarChar(50), lineDescriptionValue)
          .input('hareketTipi', sql.TinyInt, hareketTipi)
          .input('stokSorMerkez', sql.NVarChar(25), lineSorMerkez)
          .input('cariSorMerkez', sql.NVarChar(25), lineSorMerkez)
          .input('projeKodu', sql.NVarChar(25), projeKodu);

        if (includeQuoteGuid) {
          request.input('teklifUid', sql.UniqueIdentifier, item.quoteLineGuid || zeroGuid);
        }

        if (includeBelgeNo) {
          request.input('belgeNo', sql.NVarChar(50), documentNoValue);
        }
        if (includeBelgeTarih) {
          request.input('belgeTarih', sql.DateTime, belgeTarih);
        }

        await request.query(insertQuery);

        console.log(`  ✓ Satır ${satirNo}: ${item.productCode} × ${item.quantity}`);
      }

      // Transaction commit
      if (documentDescriptionValue) {
        let evrakDefaults: {
          fileId?: number | null;
          dosyaNo?: number | null;
          createUser?: number | null;
          lastupUser?: number | null;
          iptal?: boolean | null;
          hidden?: boolean | null;
          kilitli?: boolean | null;
          degisti?: boolean | null;
          checksum?: number | null;
          special1?: string | null;
          special2?: string | null;
          special3?: string | null;
          evrUstKod?: string | null;
          evrDokSayisi?: number | null;
          previewSayisi?: number | null;
          emailSayisi?: number | null;
          evrakOpnoVerildiFl?: boolean | null;
        } | null = null;

        try {
          const defaultsResult = await transaction
            .request()
            .input('dosyaNo', sql.SmallInt, sipFileId)
            .query(`
              SELECT TOP 1
                egk_fileid,
                egk_create_user,
                egk_lastup_user,
                egk_iptal,
                egk_hidden,
                egk_kilitli,
                egk_degisti,
                egk_checksum,
                egk_special1,
                egk_special2,
                egk_special3,
                egk_evr_ustkod,
                egk_evr_doksayisi,
                egk_prevwiewsayisi,
                egk_emailsayisi,
                egk_Evrakopno_verildi_fl
              FROM EVRAK_ACIKLAMALARI
              WHERE egk_dosyano = @dosyaNo
                AND egk_fileid IS NOT NULL
              ORDER BY egk_create_date DESC
            `);
          const defaultsRow = defaultsResult.recordset?.[0];
          evrakDefaults = {
            fileId: defaultsRow?.egk_fileid ?? 66,
            dosyaNo: sipFileId,
            createUser: defaultsRow?.egk_create_user ?? null,
            lastupUser: defaultsRow?.egk_lastup_user ?? null,
            iptal: defaultsRow?.egk_iptal ?? false,
            hidden: defaultsRow?.egk_hidden ?? false,
            kilitli: defaultsRow?.egk_kilitli ?? false,
            degisti: defaultsRow?.egk_degisti ?? false,
            checksum: defaultsRow?.egk_checksum ?? 0,
            special1: defaultsRow?.egk_special1 ?? '',
            special2: defaultsRow?.egk_special2 ?? '',
            special3: defaultsRow?.egk_special3 ?? '',
            evrUstKod: defaultsRow?.egk_evr_ustkod ?? '',
            evrDokSayisi: defaultsRow?.egk_evr_doksayisi ?? 0,
            previewSayisi: defaultsRow?.egk_prevwiewsayisi ?? 0,
            emailSayisi: defaultsRow?.egk_emailsayisi ?? 0,
            evrakOpnoVerildiFl: defaultsRow?.egk_Evrakopno_verildi_fl ?? false,
          };
        } catch (error) {
          console.warn('WARN: Evrak aciklama varsayilanlari okunamadi:', error);
          evrakDefaults = {
            fileId: 66,
            dosyaNo: sipFileId,
            iptal: false,
            hidden: false,
            kilitli: false,
            degisti: false,
            checksum: 0,
            special1: '',
            special2: '',
            special3: '',
            evrUstKod: '',
            evrDokSayisi: 0,
            previewSayisi: 0,
            emailSayisi: 0,
            evrakOpnoVerildiFl: false,
          };
        }

        const updateParts = [
          'egk_evracik1 = @acik1',
          'egk_lastup_date = GETDATE()',
        ];
        updateParts.push(
          'egk_iptal = @iptal',
          'egk_hidden = @hidden',
          'egk_kilitli = @kilitli',
          'egk_degisti = @degisti',
          'egk_checksum = @checksum',
          'egk_special1 = @special1',
          'egk_special2 = @special2',
          'egk_special3 = @special3',
          'egk_evr_ustkod = @evrUstKod',
          'egk_evr_doksayisi = @evrDokSayisi',
          'egk_prevwiewsayisi = @previewSayisi',
          'egk_emailsayisi = @emailSayisi',
          'egk_Evrakopno_verildi_fl = @evrakOpnoVerildiFl'
        );
        if (evrakDefaults?.fileId !== null && evrakDefaults?.fileId !== undefined) {
          updateParts.push('egk_fileid = @fileId');
        }
        if (evrakDefaults?.dosyaNo !== null && evrakDefaults?.dosyaNo !== undefined) {
          updateParts.push('egk_dosyano = @dosyaNo');
        }
        if (evrakDefaults?.createUser !== null && evrakDefaults?.createUser !== undefined) {
          updateParts.push('egk_create_user = @createUser');
        }
        if (evrakDefaults?.lastupUser !== null && evrakDefaults?.lastupUser !== undefined) {
          updateParts.push('egk_lastup_user = @lastupUser');
        }

        const insertColumns = [
          'egk_iptal',
          'egk_hidden',
          'egk_kilitli',
          'egk_degisti',
          'egk_checksum',
          'egk_special1',
          'egk_special2',
          'egk_special3',
          'egk_evr_ustkod',
          'egk_evr_doksayisi',
          'egk_prevwiewsayisi',
          'egk_emailsayisi',
          'egk_Evrakopno_verildi_fl',
          'egk_evr_seri',
          'egk_evr_sira',
          'egk_hareket_tip',
          'egk_evr_tip',
          'egk_evracik1',
        ];
        const insertValues = [
          '@iptal',
          '@hidden',
          '@kilitli',
          '@degisti',
          '@checksum',
          '@special1',
          '@special2',
          '@special3',
          '@evrUstKod',
          '@evrDokSayisi',
          '@previewSayisi',
          '@emailSayisi',
          '@evrakOpnoVerildiFl',
          '@seri',
          '@sira',
          '0',
          '0',
          '@acik1',
        ];
        if (evrakDefaults?.fileId !== null && evrakDefaults?.fileId !== undefined) {
          insertColumns.push('egk_fileid');
          insertValues.push('@fileId');
        }
        if (evrakDefaults?.dosyaNo !== null && evrakDefaults?.dosyaNo !== undefined) {
          insertColumns.push('egk_dosyano');
          insertValues.push('@dosyaNo');
        }
        if (evrakDefaults?.createUser !== null && evrakDefaults?.createUser !== undefined) {
          insertColumns.push('egk_create_user');
          insertValues.push('@createUser');
        }
        if (evrakDefaults?.lastupUser !== null && evrakDefaults?.lastupUser !== undefined) {
          insertColumns.push('egk_lastup_user');
          insertValues.push('@lastupUser');
        }

        const evrakRequest = transaction
          .request()
          .input('seri', sql.NVarChar(20), evrakSeri)
          .input('sira', sql.Int, evrakSira)
          .input('acik1', sql.NVarChar(127), documentDescriptionValue)
          .input('iptal', sql.Bit, evrakDefaults?.iptal ?? false)
          .input('hidden', sql.Bit, evrakDefaults?.hidden ?? false)
          .input('kilitli', sql.Bit, evrakDefaults?.kilitli ?? false)
          .input('degisti', sql.Bit, evrakDefaults?.degisti ?? false)
          .input('checksum', sql.Int, evrakDefaults?.checksum ?? 0)
          .input('special1', sql.NVarChar(4), evrakDefaults?.special1 ?? '')
          .input('special2', sql.NVarChar(4), evrakDefaults?.special2 ?? '')
          .input('special3', sql.NVarChar(4), evrakDefaults?.special3 ?? '')
          .input('evrUstKod', sql.NVarChar(25), evrakDefaults?.evrUstKod ?? '')
          .input('evrDokSayisi', sql.Int, evrakDefaults?.evrDokSayisi ?? 0)
          .input('previewSayisi', sql.Int, evrakDefaults?.previewSayisi ?? 0)
          .input('emailSayisi', sql.Int, evrakDefaults?.emailSayisi ?? 0)
          .input('evrakOpnoVerildiFl', sql.Bit, evrakDefaults?.evrakOpnoVerildiFl ?? false);

        if (evrakDefaults?.fileId !== null && evrakDefaults?.fileId !== undefined) {
          evrakRequest.input('fileId', sql.SmallInt, evrakDefaults.fileId);
        }
        if (evrakDefaults?.dosyaNo !== null && evrakDefaults?.dosyaNo !== undefined) {
          evrakRequest.input('dosyaNo', sql.SmallInt, evrakDefaults.dosyaNo);
        }
        if (evrakDefaults?.createUser !== null && evrakDefaults?.createUser !== undefined) {
          evrakRequest.input('createUser', sql.SmallInt, evrakDefaults.createUser);
        }
        if (evrakDefaults?.lastupUser !== null && evrakDefaults?.lastupUser !== undefined) {
          evrakRequest.input('lastupUser', sql.SmallInt, evrakDefaults.lastupUser);
        }

        await evrakRequest.query(`
            IF EXISTS (
              SELECT 1
              FROM EVRAK_ACIKLAMALARI
              WHERE egk_evr_seri = @seri
                AND egk_evr_sira = @sira
                AND egk_hareket_tip = 0
                AND egk_evr_tip = 0
            )
              UPDATE EVRAK_ACIKLAMALARI
              SET ${updateParts.join(', ')}
              WHERE egk_evr_seri = @seri
                AND egk_evr_sira = @sira
                AND egk_hareket_tip = 0
                AND egk_evr_tip = 0
            ELSE
              INSERT INTO EVRAK_ACIKLAMALARI (
                ${insertColumns.join(', ')}
              )
              VALUES (${insertValues.join(', ')})
          `);

        // Ctrl+Q aciklama alani icin SIPARISLER.sip_aciklama2'yi de guncelle
        try {
          await transaction
            .request()
            .input('seri', sql.NVarChar(20), evrakSeri)
            .input('sira', sql.Int, evrakSira)
            .input('aciklama2', sql.NVarChar(127), documentDescriptionValue)
            .query(`
              UPDATE SIPARISLER
              SET sip_aciklama2 = @aciklama2
              WHERE sip_evrakno_seri = @seri
                AND sip_evrakno_sira = @sira
            `);
        } catch (error) {
          console.warn('WARN: sip_aciklama2 guncellenemedi:', error);
        }
      }


      try {
        await transaction
          .request()
          .input('seri', sql.NVarChar(20), evrakSeri)
          .input('sira', sql.Int, evrakSira)
          .input('zeroGuid', sql.UniqueIdentifier, zeroGuid)
          .input('vergiSiz', sql.Bit, vergiSizFlag)
          .query(`
            UPDATE SIPARISLER
            SET
              sip_SpecRECno = ISNULL(sip_SpecRECno, 0),
              sip_hidden = ISNULL(sip_hidden, 0),
              sip_kilitli = ISNULL(sip_kilitli, 0),
              sip_degisti = ISNULL(sip_degisti, 0),
              sip_checksum = ISNULL(sip_checksum, 0),
              sip_special1 = ISNULL(sip_special1, ''),
              sip_special2 = ISNULL(sip_special2, ''),
              sip_special3 = ISNULL(sip_special3, ''),
              sip_satici_kod = ISNULL(sip_satici_kod, ''),
              sip_birim_pntr = ISNULL(sip_birim_pntr, 1),
              sip_masvergi_pntr = ISNULL(sip_masvergi_pntr, 0),
              sip_opno = ISNULL(sip_opno, 8),
              sip_aciklama2 = ISNULL(sip_aciklama2, ''),
              sip_OnaylayanKulNo = ISNULL(sip_OnaylayanKulNo, 0),
              sip_vergisiz_fl = ISNULL(sip_vergisiz_fl, @vergiSiz),
              sip_promosyon_fl = ISNULL(sip_promosyon_fl, 0),
              sip_cari_grupno = ISNULL(sip_cari_grupno, 0),
              sip_alt_doviz_kuru = ISNULL(sip_alt_doviz_kuru, 1),
              sip_adresno = ISNULL(sip_adresno, 1),
              sip_teslimturu = ISNULL(sip_teslimturu, ''),
              sip_cagrilabilir_fl = ISNULL(sip_cagrilabilir_fl, 1),
              sip_prosip_uid = ISNULL(sip_prosip_uid, @zeroGuid),
              sip_iskonto1 = ISNULL(sip_iskonto1, 0),
              sip_iskonto2 = ISNULL(sip_iskonto2, 1),
              sip_iskonto3 = ISNULL(sip_iskonto3, 1),
              sip_iskonto4 = ISNULL(sip_iskonto4, 1),
              sip_iskonto5 = ISNULL(sip_iskonto5, 1),
              sip_iskonto6 = ISNULL(sip_iskonto6, 1),
              sip_masraf1 = ISNULL(sip_masraf1, 1),
              sip_masraf2 = ISNULL(sip_masraf2, 1),
              sip_masraf3 = ISNULL(sip_masraf3, 1),
              sip_masraf4 = ISNULL(sip_masraf4, 1),
              sip_isk1 = ISNULL(sip_isk1, 0),
              sip_isk2 = ISNULL(sip_isk2, 0),
              sip_isk3 = ISNULL(sip_isk3, 0),
              sip_isk4 = ISNULL(sip_isk4, 0),
              sip_isk5 = ISNULL(sip_isk5, 0),
              sip_isk6 = ISNULL(sip_isk6, 0),
              sip_mas1 = ISNULL(sip_mas1, 0),
              sip_mas2 = ISNULL(sip_mas2, 0),
              sip_mas3 = ISNULL(sip_mas3, 0),
              sip_mas4 = ISNULL(sip_mas4, 0),
              sip_Exp_Imp_Kodu = ISNULL(sip_Exp_Imp_Kodu, ''),
              sip_kar_orani = ISNULL(sip_kar_orani, 0),
              sip_durumu = ISNULL(sip_durumu, 0),
              sip_stal_uid = ISNULL(sip_stal_uid, @zeroGuid),
              sip_planlananmiktar = ISNULL(sip_planlananmiktar, 0),
              sip_parti_kodu = ISNULL(sip_parti_kodu, ''),
              sip_lot_no = ISNULL(sip_lot_no, 0),
              sip_fiyat_liste_no = ISNULL(sip_fiyat_liste_no, 1),
              sip_Otv_Pntr = ISNULL(sip_Otv_Pntr, 0),
              sip_OtvVergisiz_Fl = ISNULL(sip_OtvVergisiz_Fl, 0),
              sip_paket_kod = ISNULL(sip_paket_kod, ''),
              sip_Rez_uid = ISNULL(sip_Rez_uid, @zeroGuid),
              sip_yetkili_uid = ISNULL(sip_yetkili_uid, @zeroGuid),
              sip_kapatmanedenkod = ISNULL(sip_kapatmanedenkod, ''),
              sip_gecerlilik_tarihi = ISNULL(sip_gecerlilik_tarihi, '1899-12-30'),
              sip_onodeme_evrak_tip = ISNULL(sip_onodeme_evrak_tip, 0),
              sip_onodeme_evrak_seri = ISNULL(sip_onodeme_evrak_seri, ''),
              sip_onodeme_evrak_sira = ISNULL(sip_onodeme_evrak_sira, 0),
              sip_rezervasyon_miktari = ISNULL(sip_rezervasyon_miktari, 0),
              sip_rezerveden_teslim_edilen = ISNULL(sip_rezerveden_teslim_edilen, 0),
              sip_HareketGrupKodu1 = ISNULL(sip_HareketGrupKodu1, ''),
              sip_HareketGrupKodu2 = ISNULL(sip_HareketGrupKodu2, ''),
              sip_HareketGrupKodu3 = ISNULL(sip_HareketGrupKodu3, ''),
              sip_Olcu1 = ISNULL(sip_Olcu1, 0),
              sip_Olcu2 = ISNULL(sip_Olcu2, 0),
              sip_Olcu3 = ISNULL(sip_Olcu3, 0),
              sip_Olcu4 = ISNULL(sip_Olcu4, 0),
              sip_Olcu5 = ISNULL(sip_Olcu5, 0),
              sip_FormulMiktarNo = ISNULL(sip_FormulMiktarNo, 0),
              sip_FormulMiktar = ISNULL(sip_FormulMiktar, 0),
              sip_satis_fiyat_doviz_cinsi = ISNULL(sip_satis_fiyat_doviz_cinsi, 0),
              sip_satis_fiyat_doviz_kuru = ISNULL(sip_satis_fiyat_doviz_kuru, 0),
              sip_eticaret_kanal_kodu = ISNULL(sip_eticaret_kanal_kodu, ''),
              sip_Tevkifat_turu = ISNULL(sip_Tevkifat_turu, 0),
              sip_otv_tevkifat_turu = ISNULL(sip_otv_tevkifat_turu, 0),
              sip_otv_tevkifat_tutari = ISNULL(sip_otv_tevkifat_tutari, 0),
              sip_tevkifat_sifirlandi_fl = ISNULL(sip_tevkifat_sifirlandi_fl, 0)
            WHERE sip_evrakno_seri = @seri
              AND sip_evrakno_sira = @sira
          `);
      } catch (error) {
        console.warn('WARN: Siparis varsayilan alanlari guncellenemedi:', error);
      }

      await transaction.commit();

      console.log(`✅ Sipariş başarıyla oluşturuldu: ${orderNumber}`);
      return orderNumber;
    } catch (error) {
      // Transaction rollback
      await transaction.rollback();

      // Detaylı hata logu
      console.error('❌ Sipariş yazma hatası - DETAYLI:');
      console.error('Error type:', error instanceof Error ? error.constructor.name : typeof error);
      console.error('Error message:', error instanceof Error ? error.message : String(error));
      if (error instanceof Error && 'code' in error) {
        console.error('Error code:', (error as any).code);
      }
      if (error instanceof Error && 'number' in error) {
        console.error('SQL Error number:', (error as any).number);
      }
      console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

      throw new Error(`Sipariş Mikro'ya yazılamadı: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    } finally {
      // Trigger'ı tekrar enable et (başarılı veya başarısız fark etmez)
      try {
        await this.pool!.request().query('ENABLE TRIGGER mye_SIPARISLER_Trigger ON SIPARISLER');
        console.log('✓ SIPARISLER trigger tekrar etkinleştirildi');
      } catch (err) {
        console.error('⚠️ Trigger tekrar etkinleştirilemedi:', err);
      }
    }
  }

  /**
   * Update existing Mikro order lines
   */
  async updateOrderLines(params: {
    orderNumber: string;
    items: Array<{
      productCode: string;
      quantity: number;
      unitPrice: number;
      vatRate: number;
      lineDescription?: string;
    }>;
    documentDescription?: string;
  }): Promise<void> {
    await this.connect();

    const orderNumber = String(params.orderNumber || '').trim();
    const lastDash = orderNumber.lastIndexOf('-');
    if (lastDash <= 0 || lastDash === orderNumber.length - 1) {
      throw new Error('Invalid Mikro order number');
    }
    const evrakSeri = orderNumber.slice(0, lastDash);
    const evrakSira = Number(orderNumber.slice(lastDash + 1));
    if (!Number.isFinite(evrakSira) || evrakSira <= 0) {
      throw new Error('Invalid Mikro order sequence');
    }

    const documentDescriptionValue = params.documentDescription
      ? String(params.documentDescription).trim().slice(0, 127)
      : '';

    const transaction = this.pool!.transaction();
    try {
      await transaction.begin();

      if (documentDescriptionValue) {
        try {
          await transaction
            .request()
            .input('seri', sql.NVarChar(20), evrakSeri)
            .input('sira', sql.Int, evrakSira)
            .input('aciklama2', sql.NVarChar(127), documentDescriptionValue)
            .query(`
              UPDATE SIPARISLER
              SET sip_aciklama2 = @aciklama2
              WHERE sip_evrakno_seri = @seri
                AND sip_evrakno_sira = @sira
            `);
        } catch (error) {
          console.warn('WARN: sip_aciklama2 guncellenemedi:', error);
        }
      }

      for (const item of params.items) {
        const quantity = Number(item.quantity) || 0;
        const unitPrice = Number(item.unitPrice) || 0;
        const vatRate = this.normalizeVatRate(Number(item.vatRate) || 0);
        const vatCode = this.convertVatRateToCode(vatRate);
        const lineTotal = unitPrice * quantity;
        const vatAmount = lineTotal * vatRate;
        const lineDescription = item.lineDescription ? String(item.lineDescription).slice(0, 40) : null;

        await transaction
          .request()
          .input('seri', sql.NVarChar(20), evrakSeri)
          .input('sira', sql.Int, evrakSira)
          .input('stokKod', sql.NVarChar(25), item.productCode)
          .input('miktar', sql.Float, quantity)
          .input('fiyat', sql.Float, unitPrice)
          .input('tutar', sql.Float, lineTotal)
          .input('vergi', sql.Float, vatAmount)
          .input('vergiPntr', sql.TinyInt, vatCode)
          .input('aciklama', sql.NVarChar(40), lineDescription)
          .input('kapat', sql.Bit, quantity <= 0 ? 1 : 0)
          .input('iptal', sql.Bit, quantity <= 0 ? 1 : 0)
          .query(`
            UPDATE SIPARISLER
            SET
              sip_miktar = @miktar,
              sip_b_fiyat = @fiyat,
              sip_tutar = @tutar,
              sip_vergi = @vergi,
              sip_vergi_pntr = @vergiPntr,
              sip_aciklama = ISNULL(@aciklama, sip_aciklama),
              sip_kapat_fl = @kapat,
              sip_iptal = @iptal
            WHERE sip_evrakno_seri = @seri
              AND sip_evrakno_sira = @sira
              AND sip_stok_kod = @stokKod
          `);
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Cari hesap kaydının varlığını kontrol et, yoksa oluştur
   *
   * @param cariData - Cari bilgileri
   * @returns true ise yeni oluşturuldu, false ise zaten vardı
   */
  /**
   * Mikro'ya teklif yaz
   * NOT: GerÃ§ek kolonlar kesinleÅŸtirildikten sonra gÃ¼ncellenecek.
   */
  async writeQuote(quoteData: {
    cariCode: string;
    quoteNumber: string;
    validityDate: Date;
    description: string;
    documentNo?: string;
    responsibleCode?: string;
    paymentPlanNo?: number | null;
    items: Array<{
      productCode: string;
      quantity: number;
      unitPrice: number;
      vatRate: number;
      lineDescription?: string;
      priceListNo?: number;
    }>;
  }): Promise<{ quoteNumber: string; guid?: string }> {
    await this.connect();

    const { cariCode, validityDate, description, documentNo, responsibleCode, paymentPlanNo, items } = quoteData;
    const evrakSeri = 'B2B';

    console.log('⚡ Teklif parametreleri:', {
      cariCode,
      itemCount: items.length,
      evrakSeri,
    });

    const transaction = this.pool!.transaction();

    try {
      await transaction.begin();

      const maxSiraResult = await transaction
        .request()
        .input('seri', sql.NVarChar(20), evrakSeri)
        .query(`
          SELECT ISNULL(MAX(tkl_evrakno_sira), 0) + 1 as yeni_sira
          FROM VERILEN_TEKLIFLER
          WHERE tkl_evrakno_seri = @seri
        `);

      const evrakSira = maxSiraResult.recordset[0].yeni_sira;
      const mikroQuoteNumber = `${evrakSeri}-${evrakSira}`;

      const now = new Date();
      const evrakDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const safeValidityDate = Number.isFinite(validityDate?.getTime?.()) ? validityDate : now;
      const validityDateOnly = new Date(Date.UTC(
        safeValidityDate.getUTCFullYear(),
        safeValidityDate.getUTCMonth(),
        safeValidityDate.getUTCDate()
      ));
      const descriptionValue = (description || '').trim();
      const documentNoValue = (documentNo || '').trim().slice(0, 50);
      const responsibleValue = (responsibleCode || '').trim().slice(0, 25);
      const paymentPlanValue = Number.isFinite(paymentPlanNo as number) ? Number(paymentPlanNo) : 0;
      const sorMerkez = process.env.MIKRO_SORMERK || 'HENDEK';
      const mikroUserNo = Number(process.env.MIKRO_USER_NO || process.env.MIKRO_USERNO || 1);
      const fileId = Number(process.env.MIKRO_FILE_ID || 100);
      const zeroGuid = '00000000-0000-0000-0000-000000000000';

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const satirNo = i;
        const itemLineNote = item.lineDescription ? String(item.lineDescription).trim() : '';
        const lineDescriptionValue = (
          itemLineNote
            ? itemLineNote + (descriptionValue ? ' | ' + descriptionValue : '')
            : descriptionValue
        ).slice(0, 50);
        const quantity = item.quantity;
        const unitPrice = item.unitPrice;
        const brutFiyat = unitPrice * quantity;
        const vatRate = item.vatRate || 0;
        const vatAmount = vatRate > 0 ? brutFiyat * vatRate : 0;
        const vatCode = this.convertVatRateToCode(vatRate);
        const priceListNo = item.priceListNo ?? 0;
        const descriptionLine = (itemLineNote || descriptionValue || '').slice(0, 40);

        const insertQuery = `
          INSERT INTO VERILEN_TEKLIFLER (
            tkl_evrakno_seri,
            tkl_evrakno_sira,
            tkl_satirno,
            tkl_evrak_tarihi,
            tkl_baslangic_tarihi,
            tkl_Gecerlilik_Sures,
            tkl_cari_kod,
            tkl_stok_kod,
            tkl_miktar,
            tkl_Birimfiyati,
            tkl_Brut_fiyat,
            tkl_vergi,
            tkl_vergi_pntr,
            tkl_Aciklama,
            tkl_doviz_cins,
            tkl_doviz_kur,
            tkl_alt_doviz_kur,
            tkl_birim_pntr,
            tkl_cari_tipi,
            tkl_fiyat_liste_no,
            tkl_teslim_miktar,
            tkl_teslimat_suresi,
            TKL_VERGISIZ_FL,
            tkl_Tevkifat_turu,
            tkl_tevkifat_sifirlandi_fl,
            tkl_belge_tarih,
            tkl_belge_no,
            tkl_Sorumlu_Kod,
            tkl_iptal,
            TKL_KAPAT_FL,
            tkl_hidden,
            tkl_kilitli,
            tkl_fileid,
            tkl_cagrilabilir_fl,
            tkl_create_user,
            tkl_create_date,
            tkl_lastup_user,
            tkl_lastup_date,
            tkl_firmano,
            tkl_subeno,
            tkl_Odeme_Plani,
            tkl_durumu,
            tkl_harekettipi
          ) VALUES (
            @seri,
            @sira,
            @satirNo,
            @evrakTarihi,
            @baslangicTarihi,
            @gecerlilikTarihi,
            @cariKod,
            @stokKod,
            @miktar,
            @birimFiyat,
            @brutFiyat,
            @vergi,
            @vergiPntr,
            @aciklama,
            @dovizCins,
            @dovizKur,
            @altDovizKur,
            @birimPntr,
            @cariTipi,
            @fiyatListeNo,
            @teslimMiktar,
            @teslimatSuresi,
            @vergiSiz,
            @tevkifatTur,
            @tevkifatSifir,
            @belgeTarih,
            @belgeNo,
            @sorumluKod,
            @iptal,
            @kapat,
            @hidden,
            @kilitli,
            @fileId,
            @cagrilabilir,
            @createUser,
            @createDate,
            @lastupUser,
            @lastupDate,
            @firmano,
            @subeno,
            @odemePlan,
            @durum,
            @hareketTipi
          )
        `;

        await transaction
          .request()
          .input('seri', sql.NVarChar(20), evrakSeri)
          .input('sira', sql.Int, evrakSira)
          .input('satirNo', sql.Int, satirNo)
          .input('evrakTarihi', sql.DateTime, evrakDate)
          .input('baslangicTarihi', sql.DateTime, evrakDate)
          .input('gecerlilikTarihi', sql.DateTime, validityDateOnly)
          .input('cariKod', sql.NVarChar(25), cariCode)
          .input('stokKod', sql.NVarChar(25), item.productCode)
          .input('miktar', sql.Float, quantity)
          .input('birimFiyat', sql.Float, unitPrice)
          .input('brutFiyat', sql.Float, brutFiyat)
          .input('vergi', sql.Float, vatAmount)
          .input('vergiPntr', sql.TinyInt, vatCode)
          .input('aciklama', sql.NVarChar(40), descriptionLine)
          .input('dovizCins', sql.TinyInt, 0)
          .input('dovizKur', sql.Float, 1)
          .input('altDovizKur', sql.Float, 1)
          .input('birimPntr', sql.TinyInt, 1)
          .input('cariTipi', sql.TinyInt, 0)
          .input('fiyatListeNo', sql.Int, priceListNo)
          .input('teslimMiktar', sql.Float, 0)
          .input('teslimatSuresi', sql.SmallInt, 0)
          .input('vergiSiz', sql.Bit, vatRate === 0)
          .input('tevkifatTur', sql.TinyInt, 0)
          .input('tevkifatSifir', sql.Bit, 0)
          .input('belgeTarih', sql.DateTime, evrakDate)
          .input('belgeNo', sql.NVarChar(50), documentNoValue)
          .input('sorumluKod', sql.NVarChar(25), responsibleValue || null)
          .input('iptal', sql.Bit, 0)
          .input('kapat', sql.Bit, 0)
          .input('hidden', sql.Bit, 0)
          .input('kilitli', sql.Bit, 0)
          .input('fileId', sql.SmallInt, fileId)
          .input('cagrilabilir', sql.Bit, 1)
          .input('createUser', sql.SmallInt, mikroUserNo)
          .input('createDate', sql.DateTime, now)
          .input('lastupUser', sql.SmallInt, mikroUserNo)
          .input('lastupDate', sql.DateTime, now)
          .input('firmano', sql.Int, 0)
          .input('subeno', sql.Int, 0)
          .input('odemePlan', sql.Int, paymentPlanValue)
          .input('durum', sql.TinyInt, 0)
          .input('hareketTipi', sql.TinyInt, 0)
          .query(insertQuery);
      }

      const normalizeQuery = `
        UPDATE VERILEN_TEKLIFLER
        SET
          tkl_SpecRECno = ISNULL(tkl_SpecRECno, 0),
          tkl_degisti = ISNULL(tkl_degisti, 0),
          tkl_checksum = ISNULL(tkl_checksum, 0),
          tkl_fileid = ISNULL(tkl_fileid, @fileId),
          tkl_cagrilabilir_fl = ISNULL(tkl_cagrilabilir_fl, 1),
          tkl_special1 = ISNULL(tkl_special1, ''),
          tkl_special2 = ISNULL(tkl_special2, ''),
          tkl_special3 = ISNULL(tkl_special3, ''),
          tkl_asgari_miktar = ISNULL(tkl_asgari_miktar, 0),
          tkl_Alisfiyati = ISNULL(tkl_Alisfiyati, 0),
          tkl_karorani = ISNULL(tkl_karorani, 0),
          tkl_iskonto1 = ISNULL(tkl_iskonto1, 0),
          tkl_iskonto2 = ISNULL(tkl_iskonto2, 0),
          tkl_iskonto3 = ISNULL(tkl_iskonto3, 0),
          tkl_iskonto4 = ISNULL(tkl_iskonto4, 0),
          tkl_iskonto5 = ISNULL(tkl_iskonto5, 0),
          tkl_iskonto6 = ISNULL(tkl_iskonto6, 0),
          tkl_masraf1 = ISNULL(tkl_masraf1, 0),
          tkl_masraf2 = ISNULL(tkl_masraf2, 0),
          tkl_masraf3 = ISNULL(tkl_masraf3, 0),
          tkl_masraf4 = ISNULL(tkl_masraf4, 0),
          tkl_masraf_vergi_pnt = ISNULL(tkl_masraf_vergi_pnt, 0),
          tkl_masraf_vergi = ISNULL(tkl_masraf_vergi, 0),
          tkl_isk_mas1 = ISNULL(tkl_isk_mas1, 0),
          TKL_ISK_MAS2 = ISNULL(TKL_ISK_MAS2, 1),
          TKL_ISK_MAS3 = ISNULL(TKL_ISK_MAS3, 1),
          TKL_ISK_MAS4 = ISNULL(TKL_ISK_MAS4, 1),
          TKL_ISK_MAS5 = ISNULL(TKL_ISK_MAS5, 1),
          TKL_ISK_MAS6 = ISNULL(TKL_ISK_MAS6, 1),
          TKL_ISK_MAS7 = ISNULL(TKL_ISK_MAS7, 1),
          TKL_ISK_MAS8 = ISNULL(TKL_ISK_MAS8, 1),
          TKL_ISK_MAS9 = ISNULL(TKL_ISK_MAS9, 1),
          TKL_ISK_MAS10 = ISNULL(TKL_ISK_MAS10, 1),
          TKL_SAT_ISKMAS1 = ISNULL(TKL_SAT_ISKMAS1, 0),
          TKL_SAT_ISKMAS2 = ISNULL(TKL_SAT_ISKMAS2, 0),
          TKL_SAT_ISKMAS3 = ISNULL(TKL_SAT_ISKMAS3, 0),
          TKL_SAT_ISKMAS4 = ISNULL(TKL_SAT_ISKMAS4, 0),
          TKL_SAT_ISKMAS5 = ISNULL(TKL_SAT_ISKMAS5, 0),
          TKL_SAT_ISKMAS6 = ISNULL(TKL_SAT_ISKMAS6, 0),
          TKL_SAT_ISKMAS7 = ISNULL(TKL_SAT_ISKMAS7, 0),
          TKL_SAT_ISKMAS8 = ISNULL(TKL_SAT_ISKMAS8, 0),
          TKL_SAT_ISKMAS9 = ISNULL(TKL_SAT_ISKMAS9, 0),
          TKL_SAT_ISKMAS10 = ISNULL(TKL_SAT_ISKMAS10, 0),
          TKL_TESLIMTURU = ISNULL(TKL_TESLIMTURU, ''),
          tkl_adres_no = ISNULL(tkl_adres_no, 1),
          tkl_yetkili_uid = ISNULL(tkl_yetkili_uid, @zeroGuid),
          tkl_TedarikEdilecekCari = ISNULL(tkl_TedarikEdilecekCari, ''),
          tkl_paket_kod = ISNULL(tkl_paket_kod, ''),
          tkl_OnaylayanKulNo = ISNULL(tkl_OnaylayanKulNo, @onayKulNo),
          tkl_cari_sormerk = ISNULL(tkl_cari_sormerk, @sorMerkez),
          tkl_stok_sormerk = ISNULL(tkl_stok_sormerk, @sorMerkez),
          tkl_ProjeKodu = ISNULL(tkl_ProjeKodu, 'R'),
          tkl_kapatmanedenkod = ISNULL(tkl_kapatmanedenkod, ''),
          tkl_servisisemrikodu = ISNULL(tkl_servisisemrikodu, ''),
          tkl_HareketGrupKodu1 = ISNULL(tkl_HareketGrupKodu1, ''),
          tkl_HareketGrupKodu2 = ISNULL(tkl_HareketGrupKodu2, ''),
          tkl_HareketGrupKodu3 = ISNULL(tkl_HareketGrupKodu3, ''),
          tkl_Olcu1 = ISNULL(tkl_Olcu1, 0),
          tkl_Olcu2 = ISNULL(tkl_Olcu2, 0),
          tkl_Olcu3 = ISNULL(tkl_Olcu3, 0),
          tkl_Olcu4 = ISNULL(tkl_Olcu4, 0),
          tkl_Olcu5 = ISNULL(tkl_Olcu5, 0),
          tkl_FormulMiktarNo = ISNULL(tkl_FormulMiktarNo, 0),
          tkl_FormulMiktar = ISNULL(tkl_FormulMiktar, 0)
        WHERE tkl_evrakno_seri = @seri AND tkl_evrakno_sira = @sira
      `;

      await transaction
        .request()
        .input('seri', sql.NVarChar(20), evrakSeri)
        .input('sira', sql.Int, evrakSira)
        .input('zeroGuid', sql.UniqueIdentifier, zeroGuid)
        .input('onayKulNo', sql.SmallInt, mikroUserNo)
        .input('sorMerkez', sql.NVarChar(25), sorMerkez)
        .input('fileId', sql.SmallInt, fileId)
        .query(normalizeQuery);

      await transaction.commit();

      console.log(`✅ Teklif Mikro'ya yazildi: ${mikroQuoteNumber}`);

      return {
        quoteNumber: mikroQuoteNumber,
      };
    } catch (error) {
      await transaction.rollback();

      console.error('❌ Teklif yazma hatasi:', error);
      throw new Error(`Teklif Mikro'ya yazilamadi: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }

  async updateQuote(quoteData: {
    evrakSeri: string;
    evrakSira: number;
    cariCode: string;
    validityDate: Date;
    description: string;
    documentNo?: string;
    responsibleCode?: string;
    paymentPlanNo?: number | null;
    items: Array<{
      productCode: string;
      quantity: number;
      unitPrice: number;
      vatRate: number;
      lineDescription?: string;
      priceListNo?: number;
    }>;
  }): Promise<{ quoteNumber: string }> {
    await this.connect();

    const {
      evrakSeri,
      evrakSira,
      cariCode,
      validityDate,
      description,
      documentNo,
      responsibleCode,
      paymentPlanNo,
      items,
    } = quoteData;

    const transaction = this.pool!.transaction();

    try {
      await transaction.begin();

      await transaction
        .request()
        .input('seri', sql.NVarChar(20), evrakSeri)
        .input('sira', sql.Int, evrakSira)
        .query(`
          DELETE FROM VERILEN_TEKLIFLER
          WHERE tkl_evrakno_seri = @seri AND tkl_evrakno_sira = @sira
        `);

      const now = new Date();
      const evrakDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const safeValidityDate = Number.isFinite(validityDate?.getTime?.()) ? validityDate : now;
      const validityDateOnly = new Date(Date.UTC(
        safeValidityDate.getUTCFullYear(),
        safeValidityDate.getUTCMonth(),
        safeValidityDate.getUTCDate()
      ));
      const descriptionValue = (description || '').trim();
      const documentNoValue = (documentNo || '').trim().slice(0, 50);
      const responsibleValue = (responsibleCode || '').trim().slice(0, 25);
      const paymentPlanValue = Number.isFinite(paymentPlanNo as number) ? Number(paymentPlanNo) : 0;
      const sorMerkez = process.env.MIKRO_SORMERK || 'HENDEK';
      const mikroUserNo = Number(process.env.MIKRO_USER_NO || process.env.MIKRO_USERNO || 1);
      const fileId = Number(process.env.MIKRO_FILE_ID || 100);
      const zeroGuid = '00000000-0000-0000-0000-000000000000';

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const satirNo = i;
        const itemLineNote = item.lineDescription ? String(item.lineDescription).trim() : '';
        const lineDescriptionValue = (
          itemLineNote
            ? itemLineNote + (descriptionValue ? ' | ' + descriptionValue : '')
            : descriptionValue
        ).slice(0, 50);
        const quantity = item.quantity;
        const unitPrice = item.unitPrice;
        const brutFiyat = unitPrice * quantity;
        const vatRate = item.vatRate || 0;
        const vatAmount = vatRate > 0 ? brutFiyat * vatRate : 0;
        const vatCode = this.convertVatRateToCode(vatRate);
        const priceListNo = item.priceListNo ?? 0;
        const descriptionLine = (itemLineNote || descriptionValue || '').slice(0, 40);

        const insertQuery = `
          INSERT INTO VERILEN_TEKLIFLER (
            tkl_evrakno_seri,
            tkl_evrakno_sira,
            tkl_satirno,
            tkl_evrak_tarihi,
            tkl_baslangic_tarihi,
            tkl_Gecerlilik_Sures,
            tkl_cari_kod,
            tkl_stok_kod,
            tkl_miktar,
            tkl_Birimfiyati,
            tkl_Brut_fiyat,
            tkl_vergi,
            tkl_vergi_pntr,
            tkl_Aciklama,
            tkl_doviz_cins,
            tkl_doviz_kur,
            tkl_alt_doviz_kur,
            tkl_birim_pntr,
            tkl_cari_tipi,
            tkl_fiyat_liste_no,
            tkl_teslim_miktar,
            tkl_teslimat_suresi,
            TKL_VERGISIZ_FL,
            tkl_Tevkifat_turu,
            tkl_tevkifat_sifirlandi_fl,
            tkl_belge_tarih,
            tkl_belge_no,
            tkl_Sorumlu_Kod,
            tkl_iptal,
            TKL_KAPAT_FL,
            tkl_hidden,
            tkl_kilitli,
            tkl_fileid,
            tkl_cagrilabilir_fl,
            tkl_create_user,
            tkl_create_date,
            tkl_lastup_user,
            tkl_lastup_date,
            tkl_firmano,
            tkl_subeno,
            tkl_Odeme_Plani,
            tkl_durumu,
            tkl_harekettipi
          ) VALUES (
            @seri,
            @sira,
            @satirNo,
            @evrakTarihi,
            @baslangicTarihi,
            @gecerlilikTarihi,
            @cariKod,
            @stokKod,
            @miktar,
            @birimFiyat,
            @brutFiyat,
            @vergi,
            @vergiPntr,
            @aciklama,
            @dovizCins,
            @dovizKur,
            @altDovizKur,
            @birimPntr,
            @cariTipi,
            @fiyatListeNo,
            @teslimMiktar,
            @teslimatSuresi,
            @vergiSiz,
            @tevkifatTur,
            @tevkifatSifir,
            @belgeTarih,
            @belgeNo,
            @sorumluKod,
            @iptal,
            @kapat,
            @hidden,
            @kilitli,
            @fileId,
            @cagrilabilir,
            @createUser,
            @createDate,
            @lastupUser,
            @lastupDate,
            @firmano,
            @subeno,
            @odemePlan,
            @durum,
            @hareketTipi
          )
        `;

        await transaction
          .request()
          .input('seri', sql.NVarChar(20), evrakSeri)
          .input('sira', sql.Int, evrakSira)
          .input('satirNo', sql.Int, satirNo)
          .input('evrakTarihi', sql.DateTime, evrakDate)
          .input('baslangicTarihi', sql.DateTime, evrakDate)
          .input('gecerlilikTarihi', sql.DateTime, validityDateOnly)
          .input('cariKod', sql.NVarChar(25), cariCode)
          .input('stokKod', sql.NVarChar(25), item.productCode)
          .input('miktar', sql.Float, quantity)
          .input('birimFiyat', sql.Float, unitPrice)
          .input('brutFiyat', sql.Float, brutFiyat)
          .input('vergi', sql.Float, vatAmount)
          .input('vergiPntr', sql.TinyInt, vatCode)
          .input('aciklama', sql.NVarChar(40), descriptionLine)
          .input('dovizCins', sql.TinyInt, 0)
          .input('dovizKur', sql.Float, 1)
          .input('altDovizKur', sql.Float, 1)
          .input('birimPntr', sql.TinyInt, 1)
          .input('cariTipi', sql.TinyInt, 0)
          .input('fiyatListeNo', sql.Int, priceListNo)
          .input('teslimMiktar', sql.Float, 0)
          .input('teslimatSuresi', sql.SmallInt, 0)
          .input('vergiSiz', sql.Bit, vatRate === 0)
          .input('tevkifatTur', sql.TinyInt, 0)
          .input('tevkifatSifir', sql.Bit, 0)
          .input('belgeTarih', sql.DateTime, evrakDate)
          .input('belgeNo', sql.NVarChar(50), documentNoValue)
          .input('sorumluKod', sql.NVarChar(25), responsibleValue || null)
          .input('iptal', sql.Bit, 0)
          .input('kapat', sql.Bit, 0)
          .input('hidden', sql.Bit, 0)
          .input('kilitli', sql.Bit, 0)
          .input('fileId', sql.SmallInt, fileId)
          .input('cagrilabilir', sql.Bit, 1)
          .input('createUser', sql.SmallInt, mikroUserNo)
          .input('createDate', sql.DateTime, now)
          .input('lastupUser', sql.SmallInt, mikroUserNo)
          .input('lastupDate', sql.DateTime, now)
          .input('firmano', sql.Int, 0)
          .input('subeno', sql.Int, 0)
          .input('odemePlan', sql.Int, paymentPlanValue)
          .input('durum', sql.TinyInt, 0)
          .input('hareketTipi', sql.TinyInt, 0)
          .query(insertQuery);
      }

      const normalizeQuery = `
        UPDATE VERILEN_TEKLIFLER
        SET
          tkl_SpecRECno = ISNULL(tkl_SpecRECno, 0),
          tkl_degisti = ISNULL(tkl_degisti, 0),
          tkl_checksum = ISNULL(tkl_checksum, 0),
          tkl_fileid = ISNULL(tkl_fileid, @fileId),
          tkl_cagrilabilir_fl = ISNULL(tkl_cagrilabilir_fl, 1),
          tkl_special1 = ISNULL(tkl_special1, ''),
          tkl_special2 = ISNULL(tkl_special2, ''),
          tkl_special3 = ISNULL(tkl_special3, ''),
          tkl_asgari_miktar = ISNULL(tkl_asgari_miktar, 0),
          tkl_Alisfiyati = ISNULL(tkl_Alisfiyati, 0),
          tkl_karorani = ISNULL(tkl_karorani, 0),
          tkl_iskonto1 = ISNULL(tkl_iskonto1, 0),
          tkl_iskonto2 = ISNULL(tkl_iskonto2, 0),
          tkl_iskonto3 = ISNULL(tkl_iskonto3, 0),
          tkl_iskonto4 = ISNULL(tkl_iskonto4, 0),
          tkl_iskonto5 = ISNULL(tkl_iskonto5, 0),
          tkl_iskonto6 = ISNULL(tkl_iskonto6, 0),
          tkl_masraf1 = ISNULL(tkl_masraf1, 0),
          tkl_masraf2 = ISNULL(tkl_masraf2, 0),
          tkl_masraf3 = ISNULL(tkl_masraf3, 0),
          tkl_masraf4 = ISNULL(tkl_masraf4, 0),
          tkl_masraf_vergi_pnt = ISNULL(tkl_masraf_vergi_pnt, 0),
          tkl_masraf_vergi = ISNULL(tkl_masraf_vergi, 0),
          tkl_isk_mas1 = ISNULL(tkl_isk_mas1, 0),
          TKL_ISK_MAS2 = ISNULL(TKL_ISK_MAS2, 1),
          TKL_ISK_MAS3 = ISNULL(TKL_ISK_MAS3, 1),
          TKL_ISK_MAS4 = ISNULL(TKL_ISK_MAS4, 1),
          TKL_ISK_MAS5 = ISNULL(TKL_ISK_MAS5, 1),
          TKL_ISK_MAS6 = ISNULL(TKL_ISK_MAS6, 1),
          TKL_ISK_MAS7 = ISNULL(TKL_ISK_MAS7, 1),
          TKL_ISK_MAS8 = ISNULL(TKL_ISK_MAS8, 1),
          TKL_ISK_MAS9 = ISNULL(TKL_ISK_MAS9, 1),
          TKL_ISK_MAS10 = ISNULL(TKL_ISK_MAS10, 1),
          TKL_SAT_ISKMAS1 = ISNULL(TKL_SAT_ISKMAS1, 0),
          TKL_SAT_ISKMAS2 = ISNULL(TKL_SAT_ISKMAS2, 0),
          TKL_SAT_ISKMAS3 = ISNULL(TKL_SAT_ISKMAS3, 0),
          TKL_SAT_ISKMAS4 = ISNULL(TKL_SAT_ISKMAS4, 0),
          TKL_SAT_ISKMAS5 = ISNULL(TKL_SAT_ISKMAS5, 0),
          TKL_SAT_ISKMAS6 = ISNULL(TKL_SAT_ISKMAS6, 0),
          TKL_SAT_ISKMAS7 = ISNULL(TKL_SAT_ISKMAS7, 0),
          TKL_SAT_ISKMAS8 = ISNULL(TKL_SAT_ISKMAS8, 0),
          TKL_SAT_ISKMAS9 = ISNULL(TKL_SAT_ISKMAS9, 0),
          TKL_SAT_ISKMAS10 = ISNULL(TKL_SAT_ISKMAS10, 0),
          TKL_TESLIMTURU = ISNULL(TKL_TESLIMTURU, ''),
          tkl_adres_no = ISNULL(tkl_adres_no, 1),
          tkl_yetkili_uid = ISNULL(tkl_yetkili_uid, @zeroGuid),
          tkl_TedarikEdilecekCari = ISNULL(tkl_TedarikEdilecekCari, ''),
          tkl_paket_kod = ISNULL(tkl_paket_kod, ''),
          tkl_OnaylayanKulNo = ISNULL(tkl_OnaylayanKulNo, @onayKulNo),
          tkl_cari_sormerk = ISNULL(tkl_cari_sormerk, @sorMerkez),
          tkl_stok_sormerk = ISNULL(tkl_stok_sormerk, @sorMerkez),
          tkl_ProjeKodu = ISNULL(tkl_ProjeKodu, 'R'),
          tkl_kapatmanedenkod = ISNULL(tkl_kapatmanedenkod, ''),
          tkl_servisisemrikodu = ISNULL(tkl_servisisemrikodu, ''),
          tkl_HareketGrupKodu1 = ISNULL(tkl_HareketGrupKodu1, ''),
          tkl_HareketGrupKodu2 = ISNULL(tkl_HareketGrupKodu2, ''),
          tkl_HareketGrupKodu3 = ISNULL(tkl_HareketGrupKodu3, ''),
          tkl_Olcu1 = ISNULL(tkl_Olcu1, 0),
          tkl_Olcu2 = ISNULL(tkl_Olcu2, 0),
          tkl_Olcu3 = ISNULL(tkl_Olcu3, 0),
          tkl_Olcu4 = ISNULL(tkl_Olcu4, 0),
          tkl_Olcu5 = ISNULL(tkl_Olcu5, 0),
          tkl_FormulMiktarNo = ISNULL(tkl_FormulMiktarNo, 0),
          tkl_FormulMiktar = ISNULL(tkl_FormulMiktar, 0)
        WHERE tkl_evrakno_seri = @seri AND tkl_evrakno_sira = @sira
      `;

      await transaction
        .request()
        .input('seri', sql.NVarChar(20), evrakSeri)
        .input('sira', sql.Int, evrakSira)
        .input('zeroGuid', sql.UniqueIdentifier, zeroGuid)
        .input('onayKulNo', sql.SmallInt, mikroUserNo)
        .input('sorMerkez', sql.NVarChar(25), sorMerkez)
        .input('fileId', sql.SmallInt, fileId)
        .query(normalizeQuery);

      await transaction.commit();

      return {
        quoteNumber: `${evrakSeri}-${evrakSira}`,
      };
    } catch (error) {
      await transaction.rollback();
      console.error('? Teklif guncelleme hatasi:', error);
      throw new Error(`Teklif Mikro'da guncellenemedi: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }

  async ensureCariExists(cariData: {
    cariCode: string;
    unvan: string;
    email?: string;
    phone?: string;
    city?: string;
    district?: string;
    hasEInvoice?: boolean;
    taxOffice?: string;
    taxNumber?: string;
  }): Promise<boolean> {
    await this.connect();

    const { cariCode, unvan, email, phone, city, district, hasEInvoice, taxOffice, taxNumber } = cariData;

    // 1. Cari var mı kontrol et
    const checkResult = await this.pool!.request()
      .input('cariKod', sql.NVarChar(25), cariCode)
      .query(`
        SELECT COUNT(*) as count
        FROM CARI_HESAPLAR
        WHERE cari_kod = @cariKod
      `);

    if (checkResult.recordset[0].count > 0) {
      console.log(`ℹ️ Cari zaten mevcut: ${cariCode}`);
      return false;
    }

    // 2. Cari yoksa oluştur
    console.log(`📝 Yeni cari oluşturuluyor: ${cariCode} - ${unvan}`);

    try {
      await this.pool!.request()
        .input('cariKod', sql.NVarChar(25), cariCode)
        .input('unvan', sql.NVarChar(127), unvan)
        .input('email', sql.NVarChar(127), email || '')
        .input('phone', sql.NVarChar(20), phone || '')
        .input('city', sql.NVarChar(50), city || '')
        .input('district', sql.NVarChar(50), district || '')
        .input('taxOffice', sql.NVarChar(50), taxOffice || '')
        .input('taxNumber', sql.NVarChar(15), taxNumber || '')
        .input('efatura', sql.Bit, hasEInvoice || false)
        .query(`
          INSERT INTO CARI_HESAPLAR (
            cari_kod,
            cari_unvan1,
            cari_EMail,
            cari_CepTel,
            cari_vdaire_adi,
            cari_vdaire_no,
            cari_efatura_fl,
            cari_create_date,
            cari_DBCno,
            cari_iptal,
            cari_fileid
          ) VALUES (
            @cariKod,
            @unvan,
            @email,
            @phone,
            @taxOffice,
            @taxNumber,
            @efatura,
            GETDATE(),
            0,
            0,
            31
          )
        `);

      console.log(`✅ Cari başarıyla oluşturuldu: ${cariCode}`);
      return true;
    } catch (error) {
      console.error('❌ Cari oluşturma hatası:', error);
      throw new Error(`Cari oluşturulamadı: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }

  /**
   * E-fatura meta bilgilerini getir (GIB seri+sira)
   */
  async getEInvoiceMetadataByGibNo(gibNo: string): Promise<{
    gibNo: string;
    uuid: string | null;
    evrakSeri: string | null;
    evrakSira: number | null;
    cariCode: string | null;
    cariName: string | null;
    issueDate: Date | null;
    sentAt: Date | null;
    currencyCode: number | null;
  } | null> {
    if (!gibNo) {
      return null;
    }

    await this.connect();

    const request = this.pool!.request();
    request.input('gibNo', sql.NVarChar(50), gibNo);

    const result = await request.query(`
      SELECT TOP 1
        efi_uuid,
        efi_gib_seri_sira,
        efi_evrakno_seri,
        efi_evrakno_sira,
        efi_carikod,
        efi_gonderim_tarihi,
        efi_create_date,
        cari_unvan1
      FROM E_FATURA_ISLEMLERI
      LEFT JOIN CARI_HESAPLAR ON cari_kod = efi_carikod
      WHERE efi_gib_seri_sira = @gibNo
      ORDER BY efi_gonderim_tarihi DESC
    `);

    if (!result.recordset.length) {
      return null;
    }

    const row: any = result.recordset[0];

    return {
      gibNo: row.efi_gib_seri_sira,
      uuid: row.efi_uuid || null,
      evrakSeri: row.efi_evrakno_seri ? String(row.efi_evrakno_seri).trim() : null,
      evrakSira: Number.isFinite(Number(row.efi_evrakno_sira)) ? Number(row.efi_evrakno_sira) : null,
      cariCode: row.efi_carikod ? String(row.efi_carikod).trim() : null,
      cariName: row.cari_unvan1 ? String(row.cari_unvan1).trim() : null,
      issueDate: row.efi_create_date || null,
      sentAt: row.efi_gonderim_tarihi || null,
      currencyCode: null,
    };
  }

  /**
   * Cari hareketlerden fatura tutarlarini getir
   */
  async getInvoiceTotalsByEvrak(evrakSeri: string, evrakSira: number): Promise<{
    subtotal?: number | null;
    total?: number | null;
    currency?: string | null;
    issueDate?: Date | null;
  } | null> {
    if (!evrakSeri || !Number.isFinite(Number(evrakSira))) {
      return null;
    }

    await this.connect();

    const request = this.pool!.request();
    request.input('seri', sql.NVarChar(20), evrakSeri);
    request.input('sira', sql.Int, evrakSira);

    const result = await request.query(`
      SELECT TOP 1
        cha_meblag,
        cha_aratoplam,
        cha_tarihi
      FROM CARI_HESAP_HAREKETLERI
      WHERE cha_evrakno_seri = @seri
        AND cha_evrakno_sira = @sira
        AND cha_evrak_tip = 63
      ORDER BY cha_tarihi DESC
    `);

    if (!result.recordset.length) {
      return null;
    }

    const row: any = result.recordset[0];

    return {
      subtotal: Number.isFinite(Number(row.cha_aratoplam)) ? Number(row.cha_aratoplam) : null,
      total: Number.isFinite(Number(row.cha_meblag)) ? Number(row.cha_meblag) : null,
      currency: 'TRY',
      issueDate: row.cha_tarihi || null,
    };
  }

  /**
   * Mikro teklif satirlarini getir
   */
  /**
   * Bağlantı testi
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.connect();
      await this.pool!.request().query('SELECT 1 as test');
      return true;
    } catch (error) {
      console.error('❌ Mikro bağlantı testi başarısız:', error);
      return false;
    }
  }

  /**
   * Ham SQL sorgusu çalıştır
   */
  async executeQuery(query: string): Promise<any[]> {
    try {
      await this.connect();
      const result = await this.pool!.request().query(query);
      return result.recordset;
    } catch (error: any) {
      if (error?.code === 'ECONNCLOSED' || error?.code === 'ESOCKET' || error?.code === 'ETIMEDOUT') {
        console.warn('WARN: Mikro connection lost, reconnecting...');
        try {
          if (this.pool) {
            await this.pool.close();
          }
        } catch (closeError) {
          console.warn('WARN: Mikro connection could not be closed:', closeError);
        } finally {
          this.pool = null;
        }
        await this.connect();
        const result = await this.pool!.request().query(query);
        return result.recordset;
      }
      throw error;
    }
  }
}

export default new MikroService();








