/**
 * Gerçek Mikro ERP Service
 *
 * Production'da Mikro MSSQL veritabanına bağlanarak
 * veri çeker ve sipariş yazar.
 */

import mssql from 'mssql';
import { config } from '../config';
import MIKRO_TABLES from '../config/mikro-tables';
import {
  MikroCategory,
  MikroProduct,
  MikroWarehouseStock,
  MikroSalesMovement,
  MikroPendingOrder,
  MikroCari,
} from '../types';

class MikroService {
  public pool: mssql.ConnectionPool | null = null;

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
   * Mikro veritabanına bağlan
   */
  async connect(): Promise<void> {
    if (this.pool) {
      return;
    }

    try {
      this.pool = await mssql.connect(config.mikro);
      console.log('✅ Mikro ERP bağlantısı başarılı');
    } catch (error) {
      console.error('❌ Mikro ERP bağlantı hatası:', error);
      throw new Error('Mikro ERP bağlantısı kurulamadı');
    }
  }

  /**
   * Bağlantıyı kapat
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
      console.log('🔌 Mikro ERP bağlantısı kapatıldı');
    }
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
        ${PRODUCTS_COLUMNS.CATEGORY_CODE} as categoryId,
        ${PRODUCTS_COLUMNS.UNIT} as unit,
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
      categoryId: product.categoryId,
      unit: product.unit,
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
   * Satış geçmişi (son 6 ay)
   * F10 sorgusundan alınan doğru mantık:
   * - Sadece İrsaliyeli (evraktip=4) veya Faturalı (evraktip=1 + fat_uid dolu) satışlar
   * - Sadece belirli sektör kodlarına sahip carilerle yapılan satışlar
   */
  async getSalesHistory(): Promise<MikroSalesMovement[]> {
    await this.connect();

    const query = `
      SELECT
        sth_stok_kod as productCode,
        YEAR(sth_tarih) as year,
        MONTH(sth_tarih) as month,
        SUM(sth_miktar) as totalQuantity
      FROM STOK_HAREKETLERI
      WHERE
        -- Satış hareketleri (tip=1)
        sth_tip = 1
        -- İrsaliyeli VEYA Faturalı satışlar
        AND (
          (sth_evraktip = 4)
          OR
          (sth_evraktip = 1 AND sth_fat_uid != '00000000-0000-0000-0000-000000000000')
        )
        -- Belirli sektör kodlarına sahip carilerle yapılan satışlar
        AND (
          SELECT cari_sektor_kodu
          FROM CARI_HESAPLAR
          WHERE cari_kod = sth_cari_kodu
        ) IN ('İNTERNET','HENDEK','HUKUKİ','İPTAL EDİLECEK CARİ','ERHAN','TOPÇA','BÜŞRA','ENSAR','SATICI BARTIR','BETÜL','HAVUZ','ERTANE','MERVE','SELDA','SORUNLU CARİ')
        -- Son 6 ay
        AND sth_tarih >= DATEADD(MONTH, -6, GETDATE())
      GROUP BY
        sth_stok_kod,
        YEAR(sth_tarih),
        MONTH(sth_tarih)
    `;

    const result = await this.pool!.request().query(query);
    return result.recordset;
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
    }));
  }

  /**
   * Cari detaylı bilgilerini getir (sync için)
   * Sadece sektör ismi "SATIŞ" olan cariler
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
    paymentTerm?: number;
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
        cari_odemeplan_no * -1 as paymentTerm,
        cari_efatura_fl as hasEInvoice,

        -- Adres bilgileri (1 numaralı adres = ana adres)
        (SELECT adr_il FROM CARI_HESAP_ADRESLERI
         WHERE adr_adres_no = '1' AND adr_cari_kod = cari_kod) as city,
        (SELECT adr_ilce FROM CARI_HESAP_ADRESLERI
         WHERE adr_adres_no = '1' AND adr_cari_kod = cari_kod) as district,

        -- Genel bakiye (ana döviz - TL)
        dbo.fn_CariHesapAnaDovizBakiye('', 0, cari_kod, '', '', NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL) as balance

      FROM CARI_HESAPLAR
      WHERE cari_sektor_kodu = 'SATIŞ'
        AND cari_kod IS NOT NULL
        AND cari_kod != ''
      ORDER BY cari_unvan1
    `;

    const result = await this.pool!.request().query(query);

    return result.recordset.map((row: any) => ({
      code: row.code,
      name: row.name,
      city: row.city,
      district: row.district,
      phone: row.phone,
      isLocked: row.isLocked === 1,
      groupCode: row.groupCode,
      sectorCode: row.sectorCode,
      paymentTerm: row.paymentTerm,
      hasEInvoice: row.hasEInvoice === 1,
      balance: row.balance || 0,
    }));
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
      request.input('productCode', mssql.VarChar, productCode);
      request.input('warehouseNo', mssql.Int, parseInt(warehouseNo));

      const result = await request.query(query);
      totalStock += result.recordset[0]?.stock || 0;
    }

    return totalStock;
  }

  /**
   * Mikro'ya sipariş yaz
   * TODO: Sipariş yapısı netleşince implement edilecek
   */
  async writeOrder(orderData: {
    cariCode: string;
    items: Array<{
      productCode: string;
      quantity: number;
      unitPrice: number;
      vatRate: number;
    }>;
    applyVAT: boolean;
    description: string;
  }): Promise<string> {
    await this.connect();
    // TODO: Sipariş yazma implement edilecek
    throw new Error('Sipariş yazma henüz implement edilmedi');
  }

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
}

export default new MikroService();
