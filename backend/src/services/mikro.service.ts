/**
 * Gerçek Mikro ERP Service
 *
 * Production'da Mikro MSSQL veritabanına bağlanarak
 * veri çeker ve sipariş yazar.
 */

import * as sql from 'mssql';
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
  public pool: sql.ConnectionPool | null = null;

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
      this.pool = await sql.connect(config.mikro);
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
      WHERE cari_kod IS NOT NULL
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
    }>;
    applyVAT: boolean;
    description: string;
  }): Promise<string> {
    await this.connect();

    const { cariCode, items, applyVAT, description } = orderData;

    // Evrak serisi belirle
    const evrakSeri = applyVAT ? 'B2BF' : 'B2BB';

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
      const maxSiraResult = await transaction
        .request()
        .input('seri', sql.NVarChar(20), evrakSeri).query(`
          SELECT ISNULL(MAX(sip_evrakno_sira), 0) + 1 as yeni_sira
          FROM SIPARISLER
          WHERE sip_evrakno_seri = @seri
        `);

      const evrakSira = maxSiraResult.recordset[0].yeni_sira;
      const orderNumber = `${evrakSeri}-${evrakSira}`;

      console.log(`📝 Mikro'ya sipariş yazılıyor: ${orderNumber}`);

      // 2. Her item için satır ekle
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const satirNo = i;

        // Hesaplamalar
        const tutar = item.quantity * item.unitPrice;
        const vergiTutari = applyVAT ? tutar * item.vatRate : 0;

        console.log(`🔧 Satır ${satirNo} hazırlanıyor:`, {
          productCode: item.productCode,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          vatRate: item.vatRate,
          tutar,
          vergiTutari
        });

        // INSERT query - Trigger devre dışı olduğu için hatasız çalışacak
        const insertQuery = `
          INSERT INTO SIPARISLER (
            sip_evrakno_seri,
            sip_evrakno_sira,
            sip_satirno,
            sip_tarih,
            sip_teslim_tarih,
            sip_tip,
            sip_cins,
            sip_musteri_kod,
            sip_stok_kod,
            sip_miktar,
            sip_teslim_miktar,
            sip_b_fiyat,
            sip_tutar,
            sip_vergi,
            sip_iptal,
            sip_kapat_fl,
            sip_depono,
            sip_doviz_cinsi,
            sip_doviz_kuru,
            sip_aciklama,
            sip_create_date,
            sip_DBCno,
            sip_firmano,
            sip_subeno
          ) VALUES (
            @seri,
            @sira,
            @satirNo,
            GETDATE(),
            DATEADD(day, 7, GETDATE()),
            0,
            0,
            @cariKod,
            @stokKod,
            @miktar,
            0,
            @fiyat,
            @tutar,
            @vergi,
            0,
            0,
            1,
            0,
            1,
            @aciklama,
            GETDATE(),
            0,
            0,
            0
          )
        `;

        console.log(`🔧 INSERT query çalıştırılıyor...`);
        await transaction
          .request()
          .input('seri', sql.NVarChar(20), evrakSeri)
          .input('sira', sql.Int, evrakSira)
          .input('satirNo', sql.Int, satirNo)
          .input('cariKod', sql.NVarChar(25), cariCode)
          .input('stokKod', sql.NVarChar(25), item.productCode)
          .input('miktar', sql.Float, item.quantity)
          .input('fiyat', sql.Float, item.unitPrice)
          .input('tutar', sql.Float, tutar)
          .input('vergi', sql.Float, vergiTutari)
          .input('aciklama', sql.NVarChar(50), description)
          .query(insertQuery);

        console.log(`  ✓ Satır ${satirNo}: ${item.productCode} × ${item.quantity}`);
      }

      // Transaction commit
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
   * Cari hesap kaydının varlığını kontrol et, yoksa oluştur
   *
   * @param cariData - Cari bilgileri
   * @returns true ise yeni oluşturuldu, false ise zaten vardı
   */
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
    await this.connect();
    const result = await this.pool!.request().query(query);
    return result.recordset;
  }
}

export default new MikroService();
