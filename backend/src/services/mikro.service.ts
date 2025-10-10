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
        ${PRODUCTS_COLUMNS.CURRENT_COST} as lastEntryPrice,
        ${PRODUCTS_COLUMNS.CURRENT_COST} as currentCost,
        GETDATE() as lastEntryDate,
        GETDATE() as currentCostDate,
        dbo.fn_DepodakiMiktar(${PRODUCTS_COLUMNS.CODE}, 1, 0) as depo1,
        dbo.fn_DepodakiMiktar(${PRODUCTS_COLUMNS.CODE}, 2, 0) as depo2,
        dbo.fn_DepodakiMiktar(${PRODUCTS_COLUMNS.CODE}, 6, 0) as depo6,
        dbo.fn_DepodakiMiktar(${PRODUCTS_COLUMNS.CODE}, 7, 0) as depo7,
        sto_Guid as guid
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
      lastEntryPrice: product.lastEntryPrice,
      currentCost: product.currentCost,
      lastEntryDate: product.lastEntryDate,
      currentCostDate: product.currentCostDate,
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
   * sth_tip: 1=Çıkış (Satış)
   * Sadece aktif ürünler
   */
  async getSalesHistory(): Promise<MikroSalesMovement[]> {
    await this.connect();

    const { SALES_MOVEMENTS, SALES_MOVEMENTS_COLUMNS, PRODUCTS, PRODUCTS_COLUMNS } = MIKRO_TABLES;

    const query = `
      SELECT
        sh.${SALES_MOVEMENTS_COLUMNS.PRODUCT_CODE} as productCode,
        YEAR(sh.${SALES_MOVEMENTS_COLUMNS.DATE}) as year,
        MONTH(sh.${SALES_MOVEMENTS_COLUMNS.DATE}) as month,
        SUM(sh.${SALES_MOVEMENTS_COLUMNS.QUANTITY}) as totalQuantity
      FROM ${SALES_MOVEMENTS} sh
      INNER JOIN ${PRODUCTS} s ON sh.${SALES_MOVEMENTS_COLUMNS.PRODUCT_CODE} = s.${PRODUCTS_COLUMNS.CODE}
      WHERE sh.${SALES_MOVEMENTS_COLUMNS.DATE} >= DATEADD(MONTH, -6, GETDATE())
        AND sh.${SALES_MOVEMENTS_COLUMNS.MOVEMENT_TYPE} = 1
        AND s.${PRODUCTS_COLUMNS.PASSIVE} = 0
      GROUP BY
        sh.${SALES_MOVEMENTS_COLUMNS.PRODUCT_CODE},
        YEAR(sh.${SALES_MOVEMENTS_COLUMNS.DATE}),
        MONTH(sh.${SALES_MOVEMENTS_COLUMNS.DATE})
    `;

    const result = await this.pool!.request().query(query);
    return result.recordset;
  }

  /**
   * Bekleyen siparişler
   * TODO: Sipariş yapısı netleşince implement edilecek
   */
  async getPendingOrders(): Promise<MikroPendingOrder[]> {
    await this.connect();
    // Şimdilik boş array döndür
    return [];
  }

  /**
   * Cari listesini getir
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
