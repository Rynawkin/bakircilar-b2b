/**
 * Mikro ERP Tablo İsimleri
 *
 * Gerçek Mikro ERP Database: MikroDB_V16_BKRC2020
 * Tablo ve kolon isimleri SQL Server'dan sorgulanarak belirlendi.
 */

export const MIKRO_TABLES = {
  // Kategoriler
  CATEGORIES: 'STOK_KATEGORILERI',
  CATEGORIES_COLUMNS: {
    CODE: 'ktg_kod',
    NAME: 'ktg_isim',
  },

  // Ürünler
  PRODUCTS: 'STOKLAR',
  PRODUCTS_COLUMNS: {
    CODE: 'sto_kod',
    NAME: 'sto_isim',
    FOREIGN_NAME: 'sto_yabanci_isim',
    BRAND_CODE: 'sto_marka_kodu',
    CATEGORY_CODE: 'sto_kategori_kodu',
    UNIT: 'sto_birim1_ad',
    UNIT2: 'sto_birim2_ad',
    UNIT2_FACTOR: 'sto_birim2_katsayi',
    VAT_RATE: 'sto_toptan_Vergi', // VAT kodu (dbo.fn_VergiYuzde ile çevrilmeli)
    CURRENT_COST: 'sto_standartmaliyet', // Standart maliyet
    PASSIVE: 'sto_pasif_fl', // false=aktif, true=pasif
  },

  // Stok Hareketleri (stok hesaplama için)
  STOCK_MOVEMENTS: 'STOK_HAREKETLERI',
  STOCK_MOVEMENTS_COLUMNS: {
    PRODUCT_CODE: 'sth_stok_kod',
    QUANTITY: 'sth_miktar',
    MOVEMENT_TYPE: 'sth_tip', // 0=Giriş, 1=Çıkış
    DATE: 'sth_tarih',
    WAREHOUSE_NO: 'sth_depo_no', // Depo numarası (varsayım)
  },

  // Satış Hareketleri (satış geçmişi için - STOK_HAREKETLERI'nden filtrelenir)
  SALES_MOVEMENTS: 'STOK_HAREKETLERI',
  SALES_MOVEMENTS_COLUMNS: {
    PRODUCT_CODE: 'sth_stok_kod',
    DATE: 'sth_tarih',
    QUANTITY: 'sth_miktar',
    MOVEMENT_TYPE: 'sth_tip', // Satış hareketleri için belirli tip kodları
  },

  // Siparişler (Master ve Detay aynı tabloda) - Gerçek kolonlar
  ORDERS: 'SIPARISLER',
  ORDERS_COLUMNS: {
    // Evrak bilgileri
    ORDER_SERIES: 'sip_evrakno_seri', // "HENDEK", "ADAPAZARI"
    ORDER_SEQUENCE: 'sip_evrakno_sira', // 8162
    LINE_NO: 'sip_satirno', // Satır numarası (0, 1, 2...)

    // Tarih bilgileri
    DATE: 'sip_tarih', // Sipariş tarihi
    DELIVERY_DATE: 'sip_teslim_tarih', // Planlanan teslimat tarihi

    // Müşteri ve ürün
    CUSTOMER_CODE: 'sip_musteri_kod', // "120.05.125"
    PRODUCT_CODE: 'sip_stok_kod', // "B108195"

    // Miktar bilgileri
    QUANTITY: 'sip_miktar', // Sipariş miktarı
    DELIVERED_QUANTITY: 'sip_teslim_miktar', // Teslim edilen miktar

    // Fiyat bilgileri
    UNIT_PRICE: 'sip_b_fiyat', // Birim fiyat
    LINE_TOTAL: 'sip_tutar', // Satır toplamı (KDV hariç)
    VAT: 'sip_vergi', // KDV tutarı

    // Durum bayrakları
    CANCELLED: 'sip_iptal', // true/false
    CLOSED: 'sip_kapat_fl', // true/false

    // Tip bilgileri
    TYPE: 'sip_tip', // Sipariş tipi (0, 1, 2...)
    KIND: 'sip_cins', // Sipariş cinsi (0, 1, 2...)
  },

  // Cariler (Müşteriler)
  CARI: 'CARI_HESAPLAR',
  CARI_COLUMNS: {
    CODE: 'cari_kod',
    NAME: 'cari_unvan1',
    EMAIL: 'cari_EMail',
    SECTOR_CODE: 'cari_sektor_kodu', // Sektör kodu (örn: "satıcı" = tedarikçi)
  },
} as const;

export default MIKRO_TABLES;
