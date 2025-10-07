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
  protected pool: mssql.ConnectionPool | null = null;

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
        ${CATEGORIES_COLUMNS.ID} as id,
        ${CATEGORIES_COLUMNS.CODE} as code,
        ${CATEGORIES_COLUMNS.NAME} as name
      FROM ${CATEGORIES}
      WHERE ${CATEGORIES_COLUMNS.ACTIVE} = 1
    `;

    const result = await this.pool!.request().query(query);
    return result.recordset;
  }

  /**
   * Ürünleri çek
   */
  async getProducts(): Promise<MikroProduct[]> {
    await this.connect();

    const { PRODUCTS, PRODUCTS_COLUMNS } = MIKRO_TABLES;

    const query = `
      SELECT
        ${PRODUCTS_COLUMNS.ID} as id,
        ${PRODUCTS_COLUMNS.CODE} as code,
        ${PRODUCTS_COLUMNS.NAME} as name,
        ${PRODUCTS_COLUMNS.CATEGORY_ID} as categoryId,
        ${PRODUCTS_COLUMNS.UNIT} as unit,
        ${PRODUCTS_COLUMNS.VAT_RATE} as vatRate,
        ${PRODUCTS_COLUMNS.LAST_ENTRY_PRICE} as lastEntryPrice,
        ${PRODUCTS_COLUMNS.LAST_ENTRY_DATE} as lastEntryDate,
        ${PRODUCTS_COLUMNS.CURRENT_COST} as currentCost,
        ${PRODUCTS_COLUMNS.CURRENT_COST_DATE} as currentCostDate
      FROM ${PRODUCTS}
      WHERE ${PRODUCTS_COLUMNS.ACTIVE} = 1
    `;

    const result = await this.pool!.request().query(query);
    return result.recordset;
  }

  /**
   * Depo stoklarını çek
   */
  async getWarehouseStocks(): Promise<MikroWarehouseStock[]> {
    await this.connect();

    const { STOCKS, STOCKS_COLUMNS } = MIKRO_TABLES;

    const query = `
      SELECT
        ${STOCKS_COLUMNS.PRODUCT_CODE} as productCode,
        ${STOCKS_COLUMNS.WAREHOUSE_CODE} as warehouseCode,
        ${STOCKS_COLUMNS.QUANTITY} as quantity
      FROM ${STOCKS}
      WHERE ${STOCKS_COLUMNS.QUANTITY} > 0
    `;

    const result = await this.pool!.request().query(query);
    return result.recordset;
  }

  /**
   * Satış geçmişi (son 6 ay)
   */
  async getSalesHistory(): Promise<MikroSalesMovement[]> {
    await this.connect();

    const { SALES_MOVEMENTS, SALES_MOVEMENTS_COLUMNS } = MIKRO_TABLES;

    const query = `
      SELECT
        ${SALES_MOVEMENTS_COLUMNS.PRODUCT_CODE} as productCode,
        YEAR(${SALES_MOVEMENTS_COLUMNS.DATE}) as year,
        MONTH(${SALES_MOVEMENTS_COLUMNS.DATE}) as month,
        SUM(${SALES_MOVEMENTS_COLUMNS.QUANTITY}) as totalQuantity
      FROM ${SALES_MOVEMENTS}
      WHERE ${SALES_MOVEMENTS_COLUMNS.DATE} >= DATEADD(MONTH, -6, GETDATE())
        AND ${SALES_MOVEMENTS_COLUMNS.MOVEMENT_TYPE} = 'SATIS'
      GROUP BY
        ${SALES_MOVEMENTS_COLUMNS.PRODUCT_CODE},
        YEAR(${SALES_MOVEMENTS_COLUMNS.DATE}),
        MONTH(${SALES_MOVEMENTS_COLUMNS.DATE})
    `;

    const result = await this.pool!.request().query(query);
    return result.recordset;
  }

  /**
   * Bekleyen siparişler
   */
  async getPendingOrders(): Promise<MikroPendingOrder[]> {
    await this.connect();

    const { ORDERS, ORDER_DETAILS, ORDERS_COLUMNS, ORDER_DETAILS_COLUMNS } = MIKRO_TABLES;

    // Müşteri siparişleri (satış)
    const salesQuery = `
      SELECT
        ${ORDER_DETAILS_COLUMNS.PRODUCT_CODE} as productCode,
        SUM(${ORDER_DETAILS_COLUMNS.QUANTITY}) as quantity,
        'SALES' as type
      FROM ${ORDER_DETAILS} sd
      JOIN ${ORDERS} s ON sd.${ORDER_DETAILS_COLUMNS.ORDER_ID} = s.${ORDERS_COLUMNS.ID}
      WHERE s.${ORDERS_COLUMNS.STATUS} IN ('BEKLEMEDE', 'ONAYLANDI')
        AND s.${ORDERS_COLUMNS.ORDER_TYPE} = 'SATIS'
      GROUP BY ${ORDER_DETAILS_COLUMNS.PRODUCT_CODE}
    `;

    // Satınalma siparişleri
    const purchaseQuery = `
      SELECT
        ${ORDER_DETAILS_COLUMNS.PRODUCT_CODE} as productCode,
        SUM(${ORDER_DETAILS_COLUMNS.QUANTITY}) as quantity,
        'PURCHASE' as type
      FROM ${ORDER_DETAILS} sd
      JOIN ${ORDERS} s ON sd.${ORDER_DETAILS_COLUMNS.ORDER_ID} = s.${ORDERS_COLUMNS.ID}
      WHERE s.${ORDERS_COLUMNS.STATUS} IN ('BEKLEMEDE', 'ONAYLANDI')
        AND s.${ORDERS_COLUMNS.ORDER_TYPE} = 'SATIN_ALMA'
      GROUP BY ${ORDER_DETAILS_COLUMNS.PRODUCT_CODE}
    `;

    const [salesResult, purchaseResult] = await Promise.all([
      this.pool!.request().query(salesQuery),
      this.pool!.request().query(purchaseQuery),
    ]);

    return [...salesResult.recordset, ...purchaseResult.recordset];
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
      WHERE ${CARI_COLUMNS.ACTIVE} = 1
      ORDER BY ${CARI_COLUMNS.NAME}
    `;

    const result = await this.pool!.request().query(query);

    return result.recordset.map((row: any) => ({
      code: row.code,
      name: row.name,
    }));
  }

  /**
   * Anlık stok kontrolü
   */
  async getRealtimeStock(
    productCode: string,
    includedWarehouses: string[]
  ): Promise<number> {
    await this.connect();

    const { STOCKS, STOCKS_COLUMNS } = MIKRO_TABLES;

    const warehousePlaceholders = includedWarehouses.map((_, i) => `@warehouse${i}`).join(',');

    const query = `
      SELECT SUM(${STOCKS_COLUMNS.QUANTITY}) as totalStock
      FROM ${STOCKS}
      WHERE ${STOCKS_COLUMNS.PRODUCT_CODE} = @productCode
        AND ${STOCKS_COLUMNS.WAREHOUSE_CODE} IN (${warehousePlaceholders})
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

    const { ORDERS, ORDER_DETAILS, ORDERS_COLUMNS, ORDER_DETAILS_COLUMNS } = MIKRO_TABLES;

    const transaction = this.pool!.transaction();
    await transaction.begin();

    try {
      // 1. Sipariş master kaydı
      const totalAmount = orderData.items.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0
      );

      const vatTotal = orderData.applyVAT
        ? orderData.items.reduce(
            (sum, item) => sum + item.quantity * item.unitPrice * item.vatRate,
            0
          )
        : 0;

      const grandTotal = totalAmount + vatTotal;

      const orderNumber = `WEB-${Date.now()}`;

      const insertOrderQuery = `
        INSERT INTO ${ORDERS} (
          ${ORDERS_COLUMNS.ORDER_NO},
          ${ORDERS_COLUMNS.CARI_CODE},
          ${ORDERS_COLUMNS.DATE},
          ${ORDERS_COLUMNS.STATUS},
          ${ORDERS_COLUMNS.ORDER_TYPE},
          ${ORDERS_COLUMNS.VAT_TOTAL},
          ${ORDERS_COLUMNS.GRAND_TOTAL},
          ${ORDERS_COLUMNS.DESCRIPTION}
        )
        OUTPUT INSERTED.${ORDERS_COLUMNS.ID}
        VALUES (
          @orderNumber,
          @cariCode,
          GETDATE(),
          'ONAYLANDI',
          'SATIS',
          @vatTotal,
          @grandTotal,
          @description
        )
      `;

      const orderResult = await transaction
        .request()
        .input('orderNumber', mssql.VarChar, orderNumber)
        .input('cariCode', mssql.VarChar, orderData.cariCode)
        .input('vatTotal', mssql.Decimal(18, 2), vatTotal)
        .input('grandTotal', mssql.Decimal(18, 2), grandTotal)
        .input('description', mssql.VarChar, orderData.description)
        .query(insertOrderQuery);

      const orderId = orderResult.recordset[0][ORDERS_COLUMNS.ID];

      // 2. Sipariş detayları
      for (const item of orderData.items) {
        const lineTotal = item.quantity * item.unitPrice;
        const itemVatRate = orderData.applyVAT ? item.vatRate : 0;

        const insertDetailQuery = `
          INSERT INTO ${ORDER_DETAILS} (
            ${ORDER_DETAILS_COLUMNS.ORDER_ID},
            ${ORDER_DETAILS_COLUMNS.PRODUCT_CODE},
            ${ORDER_DETAILS_COLUMNS.QUANTITY},
            ${ORDER_DETAILS_COLUMNS.UNIT_PRICE},
            ${ORDER_DETAILS_COLUMNS.VAT_RATE},
            ${ORDER_DETAILS_COLUMNS.LINE_TOTAL}
          )
          VALUES (
            @orderId,
            @productCode,
            @quantity,
            @unitPrice,
            @vatRate,
            @lineTotal
          )
        `;

        await transaction
          .request()
          .input('orderId', mssql.Int, orderId)
          .input('productCode', mssql.VarChar, item.productCode)
          .input('quantity', mssql.Int, item.quantity)
          .input('unitPrice', mssql.Decimal(18, 2), item.unitPrice)
          .input('vatRate', mssql.Decimal(5, 2), itemVatRate)
          .input('lineTotal', mssql.Decimal(18, 2), lineTotal)
          .query(insertDetailQuery);
      }

      await transaction.commit();

      console.log('✅ Mikro\'ya sipariş yazıldı:', orderNumber);
      return orderNumber;
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Mikro sipariş yazma hatası:', error);
      throw error;
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
}

export default new MikroService();
