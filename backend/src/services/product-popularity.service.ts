import * as sql from 'mssql';
import { prisma } from '../utils/prisma';
import mikroService from './mikroFactory.service';
import { cacheService } from './cache.service';

type PopularityRow = {
  productCode: string;
  salesQuantity: number;
};

const normalizeCode = (value: unknown) => String(value || '').trim().toUpperCase();
const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

class ProductPopularityService {
  async refreshPopularSales(days = 90) {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodStart.getDate() - Math.max(1, days));

    const products = await prisma.product.findMany({
      where: { active: true },
      select: {
        id: true,
        mikroCode: true,
        currentCost: true,
        lastEntryPrice: true,
        salesHistory: true,
      },
    });
    const productByCode = new Map(products.map((product) => [normalizeCode(product.mikroCode), product]));

    let rows: PopularityRow[] = [];
    try {
      rows = await this.fetchMikroSalesRows(periodStart, periodEnd);
    } catch (error) {
      console.error('Product popularity Mikro refresh failed, falling back to local salesHistory:', error);
      rows = this.buildRowsFromLocalSalesHistory(products, periodStart, periodEnd);
    }

    const updatedAt = new Date();
    const metrics = rows
      .map((row) => {
        const code = normalizeCode(row.productCode);
        const product = productByCode.get(code);
        if (!product) return null;
        const salesQuantity = Math.max(0, toNumber(row.salesQuantity, 0));
        const cost = toNumber(product.currentCost, 0) || toNumber(product.lastEntryPrice, 0);
        return {
          id: product.id,
          salesQuantity,
          salesValue: Number((salesQuantity * Math.max(0, cost)).toFixed(4)),
        };
      })
      .filter(Boolean) as Array<{ id: string; salesQuantity: number; salesValue: number }>;

    await prisma.product.updateMany({
      where: { active: true },
      data: {
        popularSalesQuantity: 0,
        popularSalesValue: 0,
        popularSalesUpdatedAt: updatedAt,
      },
    });

    for (let index = 0; index < metrics.length; index += 100) {
      const chunk = metrics.slice(index, index + 100);
      await Promise.all(
        chunk.map((metric) =>
          prisma.product.update({
            where: { id: metric.id },
            data: {
              popularSalesQuantity: metric.salesQuantity,
              popularSalesValue: metric.salesValue,
              popularSalesUpdatedAt: updatedAt,
            },
          })
        )
      );
    }

    await cacheService.deletePattern('products:*').catch((error) => {
      console.error('Product popularity product cache invalidation failed:', error);
    });

    return {
      success: true,
      periodStart,
      periodEnd,
      productsScanned: products.length,
      productsUpdated: metrics.length,
    };
  }

  async ensureFresh(maxAgeDays = 8) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - maxAgeDays);
    const freshCount = await prisma.product.count({
      where: {
        active: true,
        popularSalesUpdatedAt: { gte: threshold },
      },
    });
    if (freshCount > 0) {
      return { skipped: true, reason: 'fresh-cache', freshCount };
    }
    return this.refreshPopularSales();
  }

  private async fetchMikroSalesRows(periodStart: Date, periodEnd: Date): Promise<PopularityRow[]> {
    const service: any = mikroService as any;
    if (typeof service.connect !== 'function') {
      throw new Error('Mikro service does not expose direct connection');
    }
    await service.connect();
    if (!service.pool) {
      throw new Error('Mikro pool is not available');
    }

    const request = service.pool.request();
    request.input('periodStart', sql.DateTime, periodStart);
    request.input('periodEnd', sql.DateTime, periodEnd);
    (request as any).timeout = 120000;

    const result = await request.query(`
      SELECT
        LTRIM(RTRIM(sth_stok_kod)) AS productCode,
        SUM(CASE
          WHEN ISNULL(sth_normal_iade, 0) = 1 THEN -ABS(ISNULL(sth_miktar, 0))
          ELSE ISNULL(sth_miktar, 0)
        END) AS salesQuantity
      FROM STOK_HAREKETLERI WITH (NOLOCK)
      WHERE ISNULL(sth_iptal, 0) = 0
        AND ISNULL(sth_tip, 0) = 1
        AND ISNULL(sth_cins, 0) = 0
        AND ISNULL(sth_evraktip, 0) IN (1, 4)
        AND sth_tarih >= @periodStart
        AND sth_tarih < DATEADD(DAY, 1, @periodEnd)
        AND sth_stok_kod IS NOT NULL
        AND LTRIM(RTRIM(sth_stok_kod)) <> ''
      GROUP BY LTRIM(RTRIM(sth_stok_kod))
    `);

    return (result.recordset || []).map((row: any) => ({
      productCode: row.productCode,
      salesQuantity: toNumber(row.salesQuantity, 0),
    }));
  }

  private buildRowsFromLocalSalesHistory(
    products: Array<{ mikroCode: string; salesHistory: unknown }>,
    periodStart: Date,
    periodEnd: Date
  ): PopularityRow[] {
    const startKey = periodStart.toISOString().slice(0, 10);
    const endKey = periodEnd.toISOString().slice(0, 10);
    return products.map((product) => {
      const history = (product.salesHistory || {}) as Record<string, number>;
      const salesQuantity = Object.entries(history).reduce((sum, [dateKey, quantity]) => {
        if (dateKey >= startKey && dateKey <= endKey) return sum + toNumber(quantity, 0);
        return sum;
      }, 0);
      return { productCode: product.mikroCode, salesQuantity };
    });
  }
}

export default new ProductPopularityService();
