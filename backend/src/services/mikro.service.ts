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
   */
  async getProducts(): Promise<MikroProduct[]> {
    await this.connect();

    const { PRODUCTS, PRODUCTS_COLUMNS } = MIKRO_TABLES;

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
        GETDATE() as currentCostDate
      FROM ${PRODUCTS}
      WHERE ${PRODUCTS_COLUMNS.PASSIVE} = 0
        AND ${PRODUCTS_COLUMNS.CODE} IS NOT NULL
        AND ${PRODUCTS_COLUMNS.CODE} != ''
        AND ${PRODUCTS_COLUMNS.NAME} IS NOT NULL
        AND ${PRODUCTS_COLUMNS.NAME} != ''
      ORDER BY ${PRODUCTS_COLUMNS.NAME}
    `;

    const result = await this.pool!.request().query(query);

    // KDV kodunu yüzde oranına çevir
    return result.recordset.map((product: any) => ({
      ...product,
      vatRate: this.convertVatCodeToRate(product.vatCode),
    }));
  }

  /**
   * Depo stoklarını çek (STOK_HAREKETLERI'nden hesaplanır)
   * sth_tip: 0=Giriş, 1=Çıkış
   * Sadece aktif ürünlerin stokları
   */
  async getWarehouseStocks(): Promise<MikroWarehouseStock[]> {
    await this.connect();

    const { STOCK_MOVEMENTS, STOCK_MOVEMENTS_COLUMNS, PRODUCTS, PRODUCTS_COLUMNS } = MIKRO_TABLES;

    const query = `
      SELECT
        sh.${STOCK_MOVEMENTS_COLUMNS.PRODUCT_CODE} as productCode,
        sh.${STOCK_MOVEMENTS_COLUMNS.WAREHOUSE_NO} as warehouseCode,
        SUM(
          CASE
            WHEN sh.${STOCK_MOVEMENTS_COLUMNS.MOVEMENT_TYPE} = 0 THEN sh.${STOCK_MOVEMENTS_COLUMNS.QUANTITY}
            WHEN sh.${STOCK_MOVEMENTS_COLUMNS.MOVEMENT_TYPE} = 1 THEN -sh.${STOCK_MOVEMENTS_COLUMNS.QUANTITY}
            ELSE 0
          END
        ) as quantity
      FROM ${STOCK_MOVEMENTS} sh
      INNER JOIN ${PRODUCTS} s ON sh.${STOCK_MOVEMENTS_COLUMNS.PRODUCT_CODE} = s.${PRODUCTS_COLUMNS.CODE}
      WHERE s.${PRODUCTS_COLUMNS.PASSIVE} = 0
      GROUP BY
        sh.${STOCK_MOVEMENTS_COLUMNS.PRODUCT_CODE},
        sh.${STOCK_MOVEMENTS_COLUMNS.WAREHOUSE_NO}
      HAVING SUM(
        CASE
          WHEN sh.${STOCK_MOVEMENTS_COLUMNS.MOVEMENT_TYPE} = 0 THEN sh.${STOCK_MOVEMENTS_COLUMNS.QUANTITY}
          WHEN sh.${STOCK_MOVEMENTS_COLUMNS.MOVEMENT_TYPE} = 1 THEN -sh.${STOCK_MOVEMENTS_COLUMNS.QUANTITY}
          ELSE 0
        END
      ) > 0
    `;

    const result = await this.pool!.request().query(query);
    return result.recordset;
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
   * Anlık stok kontrolü (STOK_HAREKETLERI'nden hesaplanır)
   */
  async getRealtimeStock(
    productCode: string,
    includedWarehouses: string[]
  ): Promise<number> {
    await this.connect();

    const { STOCK_MOVEMENTS, STOCK_MOVEMENTS_COLUMNS } = MIKRO_TABLES;

    const warehousePlaceholders = includedWarehouses.map((_, i) => `@warehouse${i}`).join(',');

    const query = `
      SELECT SUM(
        CASE
          WHEN ${STOCK_MOVEMENTS_COLUMNS.MOVEMENT_TYPE} = 0 THEN ${STOCK_MOVEMENTS_COLUMNS.QUANTITY}
          WHEN ${STOCK_MOVEMENTS_COLUMNS.MOVEMENT_TYPE} = 1 THEN -${STOCK_MOVEMENTS_COLUMNS.QUANTITY}
          ELSE 0
        END
      ) as totalStock
      FROM ${STOCK_MOVEMENTS}
      WHERE ${STOCK_MOVEMENTS_COLUMNS.PRODUCT_CODE} = @productCode
        AND ${STOCK_MOVEMENTS_COLUMNS.WAREHOUSE_NO} IN (${warehousePlaceholders})
    `;

    const request = this.pool!.request();
    request.input('productCode', mssql.VarChar, productCode);

    includedWarehouses.forEach((warehouse, i) => {
      request.input(`warehouse${i}`, mssql.VarChar, warehouse);
    });

    const result = await request.query(query);
    return result.recordset[0]?.totalStock || 0;
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
