/**
 * GerÃ§ek Mikro ERP Service
 *
 * Production'da Mikro MSSQL veritabanÄ±na baÄŸlanarak
 * veri Ã§eker ve sipariÅŸ yazar.
 */

import * as sql from 'mssql';
import { config } from '../config';
import MIKRO_TABLES from '../config/mikro-tables';
import {
  MikroCategory,
  MikroProduct,
  MikroWarehouseStock,
  MikroSalesMovement,
  MikroCustomerSaleMovement,
  MikroPendingOrder,
  MikroCari,
  MikroCariPersonel,
} from '../types';

class MikroService {
  public pool: sql.ConnectionPool | null = null;
  public sipBelgeColumns: { no: 'sip_belge_no' | 'sip_belgeno' | null; tarih: boolean } | null = null;

  /**
   * Mikro KDV kod â†’ yÃ¼zde dÃ¶nÃ¼ÅŸÃ¼mÃ¼
   * GerÃ§ek hareketlerden tespit edildi
   */
  public convertVatCodeToRate(vatCode: number): number {
    const vatMap: { [key: number]: number } = {
      0: 0.00,  // Ä°stisna
      1: 0.00,  // Ä°stisna
      2: 0.01,  // %1
      3: 0.00,  // KullanÄ±lmÄ±yor
      4: 0.18,  // %18
      5: 0.20,  // %20
      6: 0.00,  // KullanÄ±lmÄ±yor
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

  /**
   * Mikro veritabanÄ±na baÄŸlan
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
      console.log('âœ… Mikro ERP baÄŸlantÄ±sÄ± baÅŸarÄ±lÄ±');
    } catch (error) {
      console.error('âŒ Mikro ERP baÄŸlantÄ± hatasÄ±:', error);
      this.pool = null;
      throw new Error('Mikro ERP baÄŸlantÄ±sÄ± kurulamadÄ±');
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
          tkl_fiyat_liste_no
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
    }));
  }

  /**
   * BaÄŸlantÄ±yÄ± kapat
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
      console.log('ğŸ”Œ Mikro ERP baÄŸlantÄ±sÄ± kapatÄ±ldÄ±');
    }
  }

  /**
   * Kategorileri Ã§ek
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
   * ÃœrÃ¼nleri Ã§ek (sadece aktif stoklar)
   * Depo bazlÄ± stok bilgilerini de dahil eder
   */
  async getProducts(): Promise<MikroProduct[]> {
    await this.connect();

    const { PRODUCTS, PRODUCTS_COLUMNS } = MIKRO_TABLES;

    // Ana depolar: 1=Merkez, 2=EreÄŸli, 6=TopÃ§a, 7=DÃ¼kkan
    const query = `
      SELECT
        ${PRODUCTS_COLUMNS.CODE} as id,
        ${PRODUCTS_COLUMNS.CODE} as code,
        ${PRODUCTS_COLUMNS.NAME} as name,
        ${PRODUCTS_COLUMNS.CATEGORY_CODE} as categoryId,
        ${PRODUCTS_COLUMNS.UNIT} as unit,
        ${PRODUCTS_COLUMNS.UNIT2} as unit2,
        ${PRODUCTS_COLUMNS.UNIT2_FACTOR} as unit2Factor,
        ${PRODUCTS_COLUMNS.VAT_RATE} as vatCode,
        ${PRODUCTS_COLUMNS.CURRENT_COST} as currentCost,
        sto_Guid as guid,

        -- GÃ¼ncel maliyet tarihi (sto_resim_url alanÄ±nda tutuluyor)
        sto_resim_url as currentCostDate,

        -- Son giriÅŸ tarihi (STOK_HAREKETLERI'nden)
        (SELECT TOP 1 sth_tarih
         FROM STOK_HAREKETLERI
         WHERE sth_stok_kod = ${PRODUCTS_COLUMNS.CODE}
           AND sth_tip = 0
           AND sth_evraktip IN (3, 13)
           AND sth_cins IN (0, 1)
           AND sth_normal_iade = 0
         ORDER BY sth_tarih DESC) as lastEntryDate,

        -- Son giriÅŸ maliyeti (KDV hariÃ§, birim fiyat)
        -- F10'daki ile aynÄ± mantÄ±k: Sadece gerÃ§ek depo giriÅŸleri
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

        -- Depo stoklarÄ±
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

    // KDV kodunu yÃ¼zde oranÄ±na Ã§evir ve depo stoklarÄ±nÄ± JSON'a dÃ¶nÃ¼ÅŸtÃ¼r
    return result.recordset.map((product: any) => ({
      id: product.id,
      code: product.code,
      name: product.name,
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
      guid: product.guid, // Resim Ã§ekmek iÃ§in GUID gerekli
      // Depo stoklarÄ±nÄ± JSON formatÄ±na Ã§evir
      warehouseStocks: {
        '1': product.depo1 || 0,  // Merkez
        '2': product.depo2 || 0,  // EreÄŸli
        '6': product.depo6 || 0,  // TopÃ§a
        '7': product.depo7 || 0,  // DÃ¼kkan
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
   * Depo stoklarÄ±nÄ± Ã§ek
   * NOT: Bu metod artÄ±k getProducts() iÃ§inde Ã§ekiliyor
   */
  async getWarehouseStocks(): Promise<MikroWarehouseStock[]> {
    // ArtÄ±k bu metoda gerek yok, getProducts() iÃ§inde alÄ±nÄ±yor
    // Ama geriye dÃ¶nÃ¼k uyumluluk iÃ§in boÅŸ array dÃ¶ndÃ¼rÃ¼yoruz
    return [];
  }

  /**
   * SatÄ±ÅŸ geÃ§miÅŸi (gÃ¼nlÃ¼k - son 90 gÃ¼n)
   * F10 sorgusundan alÄ±nan TAMAMEN AYNI mantÄ±k:
   * - Ä°rsaliyeli (evraktip=4) satÄ±ÅŸlar
   * - VEYA FaturalÄ± (evraktip=1 + fat_uid dolu) satÄ±ÅŸlar
   * - VEYA fat_uid boÅŸ olan satÄ±ÅŸlar (evraktip ne olursa olsun)
   * - Sadece belirli sektÃ¶r kodlarÄ±na sahip carilerle yapÄ±lan satÄ±ÅŸlar
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
        -- SatÄ±ÅŸ hareketleri (tip=1)
        sth_tip = 1
        -- F10'daki mantÄ±k: Ä°rsaliyeli VEYA FaturalÄ± VEYA fat_uid boÅŸ olanlar
        AND (
          (sth_evraktip = 4)
          OR
          (sth_evraktip = 1 AND sth_fat_uid != '00000000-0000-0000-0000-000000000000')
          OR
          (sth_fat_uid = '00000000-0000-0000-0000-000000000000')
        )
        -- Belirli sektÃ¶r kodlarÄ±na sahip carilerle yapÄ±lan satÄ±ÅŸlar
        AND (
          SELECT cari_sektor_kodu
          FROM CARI_HESAPLAR
          WHERE cari_kod = sth_cari_kodu
        ) IN ('Ä°NTERNET','HENDEK','HUKUKÄ°','Ä°PTAL EDÄ°LECEK CARÄ°','ERHAN','TOPÃ‡A','BÃœÅRA','ENSAR','SATICI BARTIR','BETÃœL','HAVUZ','ERTANE','MERVE','SELDA','SORUNLU CARÄ°')
        -- Son 90 gÃ¼n (F10 ile aynÄ±)
        AND sth_tarih >= DATEADD(DAY, -90, GETDATE())
      GROUP BY
        sth_stok_kod,
        CONVERT(DATE, sth_tarih)
    `;

    const result = await this.pool!.request().query(query);
    return result.recordset;
  }

  /**
   * Cari bazlÅ½Ã± daha Ã‡Ã´nce satÅ½Ã±ÂY yapÅ½Ã±lan Ã‡Â¬rÃ‡Â¬n kodlarÅ½Ã±nÅ½Ã± getir
   */
  async getPurchasedProductCodes(cariCode: string): Promise<string[]> {
    if (!cariCode) {
      return [];
    }

    await this.connect();

    const request = this.pool!.request();
    request.input('cariCode', sql.NVarChar, cariCode);

      const query = `
        SELECT DISTINCT
          LTRIM(RTRIM(sth_stok_kod)) as productCode
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
      return result.recordset
        .map((row: any) => (row.productCode || '').trim())
        .filter((code: string) => !!code);
  }

  /**
   * Cari bazlÃ„Â± son satÃ„Â±Ã…Å¸ hareketleri (ÃƒÂ¼rÃƒÂ¼n bazÃ„Â±nda son N)
   */
  async getCustomerSalesMovements(
    cariCode: string,
    productCodes: string[],
    limit = 1
  ): Promise<MikroCustomerSaleMovement[]> {
    if (!cariCode || productCodes.length === 0) {
      return [];
    }

    await this.connect();

      const safeCodes = productCodes
        .map((code) => code.trim())
        .filter((code) => code.length > 0)
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
    return result.recordset.map((row: any) => ({
      productCode: row.productCode,
      saleDate: row.saleDate,
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      lineTotal: row.lineTotal,
      vatAmount: row.vatAmount,
      vatRate: row.vatRate,
      vatZeroed: Number(row.vatAmount || 0) === 0,
    }));
  }

  /**
   * Bekleyen sipariÅŸler (mÃ¼ÅŸteri sipariÅŸleri ve satÄ±n alma sipariÅŸleri)
   *
   * F10'dan alÄ±nan gerÃ§ek sorgu:
   * - sip_tip=0: MÃ¼ÅŸteri sipariÅŸi (SALES)
   * - sip_tip=1: SatÄ±n alma sipariÅŸi (PURCHASE)
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
   * Cari detaylÄ± bilgilerini getir (tÃ¼m cariler)
   * Åehir, telefon, bakiye, vade gibi detaylÄ± bilgilerle
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

        -- Adres bilgileri (1 numaralÄ± adres = ana adres)
        (SELECT adr_il FROM CARI_HESAP_ADRESLERI
         WHERE adr_adres_no = '1' AND adr_cari_kod = cari_kod) as city,
        (SELECT adr_ilce FROM CARI_HESAP_ADRESLERI
         WHERE adr_adres_no = '1' AND adr_cari_kod = cari_kod) as district,

        -- Genel bakiye (ana dÃ¶viz - TL)
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
   * AnlÄ±k stok kontrolÃ¼ (Mikro fonksiyonu kullanarak)
   */
  async getRealtimeStock(
    productCode: string,
    includedWarehouses: string[]
  ): Promise<number> {
    await this.connect();

    // Her depo iÃ§in ayrÄ± ayrÄ± fonksiyon Ã§aÄŸÄ±r ve topla
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
   * Mikro'ya sipariÅŸ yaz
   *
   * FaturalÄ± ve beyaz sipariÅŸler iÃ§in ayrÄ± evrak serileri kullanÄ±lÄ±r:
   * - FaturalÄ±: "B2B_FATURAL"
   * - Beyaz: "B2B_BEYAZ"
   *
   * Her sipariÅŸ iÃ§in:
   * 1. Yeni evrak sÄ±ra numarasÄ± alÄ±nÄ±r (MAX + 1)
   * 2. Her item iÃ§in ayrÄ± satÄ±r eklenir (satirno: 0, 1, 2...)
   * 3. Transaction iÃ§inde Ã§alÄ±ÅŸÄ±r (hepsi veya hiÃ§biri)
   */
  async writeOrder(orderData: {
    cariCode: string;
    items: Array<{
      productCode: string;
      quantity: number;
      unitPrice: number;
      vatRate: number;
      lineDescription?: string;
    }>;
    applyVAT: boolean;
    description: string;
    documentNo?: string;
  }): Promise<string> {
    await this.connect();

    const { cariCode, items, applyVAT, description, documentNo } = orderData;
    const descriptionValue = String(description || '').trim();
    const documentNoValue = documentNo ? String(documentNo).trim().slice(0, 50) : null;
    const belgeTarih = documentNoValue ? new Date() : null;
    const sipBelgeColumns = await this.resolveSipBelgeColumns();
    const belgeNoColumn = sipBelgeColumns.no;
    const includeBelgeNo = Boolean(belgeNoColumn);
    const includeBelgeTarih = sipBelgeColumns.tarih;

    if (documentNoValue && !includeBelgeNo) {
      console.warn('WARN: SIPARISLER sip_belge_no/sip_belgeno kolonunu bulamadik, belge no yazilmadi.');
    }

    // Evrak serisi belirle
    const evrakSeri = applyVAT ? 'B2BF' : 'B2BB';

    console.log(`ğŸ”§ SipariÅŸ parametreleri:`, {
      cariCode,
      itemCount: items.length,
      applyVAT,
      evrakSeri
    });

    // SIPARISLER_OZET trigger'Ä±nÄ± geÃ§ici olarak devre dÄ±ÅŸÄ± bÄ±rak
    // Bu trigger duplicate key hatasÄ± veriyor ve transaction'Ä± uncommittable yapÄ±yor
    try {
      await this.pool!.request().query('DISABLE TRIGGER mye_SIPARISLER_Trigger ON SIPARISLER');
      console.log('âœ“ SIPARISLER trigger devre dÄ±ÅŸÄ± bÄ±rakÄ±ldÄ±');
    } catch (err) {
      console.log('âš ï¸ Trigger devre dÄ±ÅŸÄ± bÄ±rakÄ±lamadÄ±:', err);
    }

    // Transaction baÅŸlat
    const transaction = this.pool!.transaction();

    try {
      console.log('ğŸ”§ Transaction baÅŸlatÄ±lÄ±yor...');
      await transaction.begin();
      console.log('âœ“ Transaction baÅŸlatÄ±ldÄ±');

      // 1. Yeni evrak sÄ±ra numarasÄ± al (bu seri iÃ§in)
      console.log('ğŸ”§ Yeni sÄ±ra numarasÄ± alÄ±nÄ±yor...');
      const maxSiraResult = await transaction
        .request()
        .input('seri', sql.NVarChar(20), evrakSeri).query(`
          SELECT ISNULL(MAX(sip_evrakno_sira), 0) + 1 as yeni_sira
          FROM SIPARISLER
          WHERE sip_evrakno_seri = @seri
        `);

      const evrakSira = maxSiraResult.recordset[0].yeni_sira;
      const orderNumber = `${evrakSeri}-${evrakSira}`;

      console.log(`ğŸ“ Mikro'ya sipariÅŸ yazÄ±lÄ±yor: ${orderNumber}`);

      // 2. Her item iÃ§in satÄ±r ekle
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const satirNo = i;
        const itemLineNote = item.lineDescription ? String(item.lineDescription).trim() : '';
        const lineDescriptionValue = (
          itemLineNote
            ? itemLineNote + (descriptionValue ? ' | ' + descriptionValue : '')
            : descriptionValue
        ).slice(0, 50);

        // Hesaplamalar
        const tutar = item.quantity * item.unitPrice;
        const vergiTutari = applyVAT ? tutar * item.vatRate : 0;
        const vergiYuzdesi = applyVAT ? item.vatRate * 100 : 0; // Mikro'da yÃ¼zde olarak (18, 0.18 deÄŸil)

        console.log(`ğŸ”§ SatÄ±r ${satirNo} hazÄ±rlanÄ±yor:`, {
          productCode: item.productCode,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          vatRate: item.vatRate,
          tutar,
          vergiTutari,
          vergiYuzdesi
        });

        // INSERT query - Trigger devre dÄ±ÅŸÄ± olduÄŸu iÃ§in hatasÄ±z Ã§alÄ±ÅŸacak
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
          'sip_aciklama',
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
          '@miktar',
          '0',
          '@fiyat',
          '@tutar',
          '@vergiTutari',
          '@vergiYuzdesi',
          '0',
          '0',
          '1',
          '0',
          '1',
          '@aciklama',
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
          .input('fiyat', sql.Float, item.unitPrice)
          .input('tutar', sql.Float, tutar)
          .input('vergiTutari', sql.Float, vergiTutari)
          .input('vergiYuzdesi', sql.Float, vergiYuzdesi)
          .input('aciklama', sql.NVarChar(50), lineDescriptionValue);

        if (includeBelgeNo) {
          request.input('belgeNo', sql.NVarChar(50), documentNoValue);
        }
        if (includeBelgeTarih) {
          request.input('belgeTarih', sql.DateTime, belgeTarih);
        }

        await request.query(insertQuery);

        console.log(`  âœ“ SatÄ±r ${satirNo}: ${item.productCode} Ã— ${item.quantity}`);
      }

      // Transaction commit
      await transaction.commit();

      console.log(`âœ… SipariÅŸ baÅŸarÄ±yla oluÅŸturuldu: ${orderNumber}`);
      return orderNumber;
    } catch (error) {
      // Transaction rollback
      await transaction.rollback();

      // DetaylÄ± hata logu
      console.error('âŒ SipariÅŸ yazma hatasÄ± - DETAYLI:');
      console.error('Error type:', error instanceof Error ? error.constructor.name : typeof error);
      console.error('Error message:', error instanceof Error ? error.message : String(error));
      if (error instanceof Error && 'code' in error) {
        console.error('Error code:', (error as any).code);
      }
      if (error instanceof Error && 'number' in error) {
        console.error('SQL Error number:', (error as any).number);
      }
      console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

      throw new Error(`SipariÅŸ Mikro'ya yazÄ±lamadÄ±: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    } finally {
      // Trigger'Ä± tekrar enable et (baÅŸarÄ±lÄ± veya baÅŸarÄ±sÄ±z fark etmez)
      try {
        await this.pool!.request().query('ENABLE TRIGGER mye_SIPARISLER_Trigger ON SIPARISLER');
        console.log('âœ“ SIPARISLER trigger tekrar etkinleÅŸtirildi');
      } catch (err) {
        console.error('âš ï¸ Trigger tekrar etkinleÅŸtirilemedi:', err);
      }
    }
  }

  /**
   * Cari hesap kaydÄ±nÄ±n varlÄ±ÄŸÄ±nÄ± kontrol et, yoksa oluÅŸtur
   *
   * @param cariData - Cari bilgileri
   * @returns true ise yeni oluÅŸturuldu, false ise zaten vardÄ±
   */
  /**
   * Mikro'ya teklif yaz
   * NOT: GerÃƒÂ§ek kolonlar kesinleÃ…Å¸tirildikten sonra gÃƒÂ¼ncellenecek.
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

    console.log('âš¡ Teklif parametreleri:', {
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

      console.log(`âœ… Teklif Mikro'ya yazildi: ${mikroQuoteNumber}`);

      return {
        quoteNumber: mikroQuoteNumber,
      };
    } catch (error) {
      await transaction.rollback();

      console.error('âŒ Teklif yazma hatasi:', error);
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
      console.error('❌ Teklif guncelleme hatasi:', error);
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

    // 1. Cari var mÄ± kontrol et
    const checkResult = await this.pool!.request()
      .input('cariKod', sql.NVarChar(25), cariCode)
      .query(`
        SELECT COUNT(*) as count
        FROM CARI_HESAPLAR
        WHERE cari_kod = @cariKod
      `);

    if (checkResult.recordset[0].count > 0) {
      console.log(`â„¹ï¸ Cari zaten mevcut: ${cariCode}`);
      return false;
    }

    // 2. Cari yoksa oluÅŸtur
    console.log(`ğŸ“ Yeni cari oluÅŸturuluyor: ${cariCode} - ${unvan}`);

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

      console.log(`âœ… Cari baÅŸarÄ±yla oluÅŸturuldu: ${cariCode}`);
      return true;
    } catch (error) {
      console.error('âŒ Cari oluÅŸturma hatasÄ±:', error);
      throw new Error(`Cari oluÅŸturulamadÄ±: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
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
   * BaÄŸlantÄ± testi
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.connect();
      await this.pool!.request().query('SELECT 1 as test');
      return true;
    } catch (error) {
      console.error('âŒ Mikro baÄŸlantÄ± testi baÅŸarÄ±sÄ±z:', error);
      return false;
    }
  }

  /**
   * Ham SQL sorgusu Ã§alÄ±ÅŸtÄ±r
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

