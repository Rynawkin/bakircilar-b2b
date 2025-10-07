/**
 * Mikro ERP Tablo İsimleri
 *
 * ÖNEMLI: Bu tablo isimleri VARSAYIMDIR!
 * Gerçek tablo isimlerini Bora Abi'den aldıktan sonra güncellenmeli.
 *
 * Şu anda mock data kullandığımız için bu dosya referans amaçlıdır.
 */

export const MIKRO_TABLES = {
  // Kategoriler
  CATEGORIES: 'KATEGORI_TABLOSU',
  CATEGORIES_COLUMNS: {
    ID: 'kategori_id',
    CODE: 'kategori_kodu',
    NAME: 'kategori_adi',
    ACTIVE: 'aktif',
  },

  // Ürünler
  PRODUCTS: 'URUNLER',
  PRODUCTS_COLUMNS: {
    ID: 'urun_id',
    CODE: 'urun_kodu',
    NAME: 'urun_adi',
    CATEGORY_ID: 'kategori_id',
    UNIT: 'birim',
    VAT_RATE: 'kdv_orani',
    LAST_ENTRY_PRICE: 'son_alis_fiyati',
    LAST_ENTRY_DATE: 'son_alis_tarihi',
    CURRENT_COST: 'guncel_maliyet',
    CURRENT_COST_DATE: 'guncel_maliyet_tarihi',
    ACTIVE: 'aktif',
  },

  // Stoklar
  STOCKS: 'STOK_TABLOSU',
  STOCKS_COLUMNS: {
    PRODUCT_CODE: 'urun_kodu',
    WAREHOUSE_CODE: 'depo_kodu',
    QUANTITY: 'miktar',
  },

  // Satış Hareketleri
  SALES_MOVEMENTS: 'SATIS_HAREKETLERI',
  SALES_MOVEMENTS_COLUMNS: {
    PRODUCT_CODE: 'urun_kodu',
    DATE: 'tarih',
    QUANTITY: 'miktar',
    MOVEMENT_TYPE: 'hareket_tipi',
  },

  // Siparişler (Master)
  ORDERS: 'SIPARISLER',
  ORDERS_COLUMNS: {
    ID: 'siparis_id',
    ORDER_NO: 'siparis_no',
    CARI_CODE: 'cari_kod',
    DATE: 'tarih',
    STATUS: 'durum',
    ORDER_TYPE: 'siparis_tipi',
    VAT_TOTAL: 'kdv_toplam',
    GRAND_TOTAL: 'genel_toplam',
    DESCRIPTION: 'aciklama',
  },

  // Sipariş Detayları
  ORDER_DETAILS: 'SIPARIS_DETAYLARI',
  ORDER_DETAILS_COLUMNS: {
    ID: 'detay_id',
    ORDER_ID: 'siparis_id',
    PRODUCT_CODE: 'urun_kodu',
    QUANTITY: 'miktar',
    UNIT_PRICE: 'birim_fiyat',
    VAT_RATE: 'kdv_orani',
    LINE_TOTAL: 'satir_toplam',
  },

  // Cariler (Müşteriler)
  CARI: 'CARILER',
  CARI_COLUMNS: {
    CODE: 'cari_kod',
    NAME: 'cari_unvan',
    TYPE: 'cari_tipi',
    ACTIVE: 'aktif',
  },
} as const;

export default MIKRO_TABLES;
