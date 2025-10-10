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
    CATEGORY_CODE: 'sto_kategori_kodu',
    UNIT: 'sto_birim1_ad',
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

  // Siparişler (Master ve Detay aynı tabloda)
  ORDERS: 'SIPARISLER',
  ORDERS_COLUMNS: {
    ORDER_NO: 'sip_evrakno_seri', // Sipariş numarası serisi (varsayım)
    CARI_CODE: 'sip_cari_kod', // Cari kodu (varsayım)
    DATE: 'sip_tarih', // Sipariş tarihi (varsayım)
    STATUS: 'sip_durum', // Sipariş durumu (varsayım)
    ORDER_TYPE: 'sip_tip', // Sipariş tipi
    PRODUCT_CODE: 'sip_stok_kod',
    QUANTITY: 'sip_miktar',
    UNIT_PRICE: 'sip_fiyat', // Birim fiyat (varsayım)
    VAT_RATE: 'sip_vergi', // KDV oranı (varsayım)
    LINE_TOTAL: 'sip_tutar', // Satır toplamı (varsayım)
  },

  // Cariler (Müşteriler)
  CARI: 'CARI_HESAPLAR',
  CARI_COLUMNS: {
    CODE: 'cari_kod',
    NAME: 'cari_unvan1',
  },
} as const;

export default MIKRO_TABLES;
