/**
 * Price History Service (New - PostgreSQL based)
 *
 * Artık Mikro ERP'ye her seferinde sorgu atmıyoruz.
 * PostgreSQL'deki senkronize edilmiş verileri kullanıyoruz.
 */

import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface PriceHistoryFilters {
  startDate?: string;
  endDate?: string;
  productCode?: string;
  productName?: string;
  brand?: string;
  category?: string;
  hasStock?: boolean; // Sadece stoktakiler
  minDaysSinceChange?: number; // Uzun süredir değişmeyenler (örn: 180 gün)
  maxDaysSinceChange?: number;
  minChangeFrequency?: number; // Sık değişenler
  maxChangeFrequency?: number;
  page?: number;
  limit?: number;
  sortBy?: 'lastChangeDate' | 'changeFrequency' | 'productName' | 'brand' | 'totalChanges';
  sortOrder?: 'asc' | 'desc';
}

interface ProductPriceInfo {
  productCode: string;
  productName: string;
  brand: string | null;
  category: string | null;

  // Güncel durum
  currentCost: number;
  currentStock: number;

  // Güncel fiyatlar
  priceList1: number;
  priceList2: number;
  priceList3: number;
  priceList4: number;
  priceList5: number;
  priceList6: number;
  priceList7: number;
  priceList8: number;
  priceList9: number;
  priceList10: number;
  priceList13: number;
  priceList14: number;
  priceLists: Record<string, number>;

  // Kar marjları
  marginList1: number;
  marginList2: number;
  marginList3: number;
  marginList4: number;
  marginList5: number;
  marginList6: number;
  marginList7: number;
  marginList8: number;
  marginList9: number;
  marginList10: number;
  marginList13: number | null;
  marginList14: number | null;
  marginLists: Record<string, number | null>;
  costByPriceList: Record<string, number | null>;

  // İstatistikler
  totalChanges: number;
  firstChangeDate: Date | null;
  lastChangeDate: Date | null;
  daysSinceLastChange: number | null;
  avgChangeFrequencyDays: number | null; // Ortalama kaç günde bir değişiyor
}

interface PriceChangeDetail {
  productCode: string;
  changeDate: Date;
  priceListNo: number;
  oldPrice: number;
  newPrice: number;
  changeAmount: number;
  changePercent: number;
}

interface NormalizedPriceRow {
  product_code: string;
  price_list_no: number;
  current_price: Prisma.Decimal | number | string;
  current_cost: Prisma.Decimal | number | string | null;
  current_margin: Prisma.Decimal | number | string | null;
}

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const groupNormalizedRows = (
  rows: NormalizedPriceRow[]
): Map<string, NormalizedPriceRow[]> => {
  const grouped = new Map<string, NormalizedPriceRow[]>();
  rows.forEach((row) => {
    const productCode = String(row.product_code || '').trim();
    if (!productCode) return;
    const list = grouped.get(productCode) || [];
    list.push(row);
    grouped.set(productCode, list);
  });
  return grouped;
};

const mapProductPriceInfo = (
  product: any,
  normalizedRows: NormalizedPriceRow[] = []
): ProductPriceInfo => {
  const priceLists: Record<string, number> = {};
  const marginLists: Record<string, number | null> = {};
  const costByPriceList: Record<string, number | null> = {};

  for (let listNo = 1; listNo <= 10; listNo += 1) {
    priceLists[String(listNo)] = toNumber(product[`current_price_list_${listNo}`]);
    marginLists[String(listNo)] = toNullableNumber(product[`current_margin_list_${listNo}`]);
    costByPriceList[String(listNo)] = toNullableNumber(product.current_cost);
  }

  normalizedRows.forEach((row) => {
    const listNo = Number(row.price_list_no);
    if (!Number.isInteger(listNo)) return;
    const key = String(listNo);
    priceLists[key] = toNumber(row.current_price);
    marginLists[key] = toNullableNumber(row.current_margin);
    costByPriceList[key] = toNullableNumber(row.current_cost);
  });

  return {
    productCode: product.product_code,
    productName: product.product_name,
    brand: product.brand,
    category: product.category,
    currentCost: toNumber(product.current_cost),
    currentStock: toNumber(product.current_stock),
    priceList1: priceLists['1'] || 0,
    priceList2: priceLists['2'] || 0,
    priceList3: priceLists['3'] || 0,
    priceList4: priceLists['4'] || 0,
    priceList5: priceLists['5'] || 0,
    priceList6: priceLists['6'] || 0,
    priceList7: priceLists['7'] || 0,
    priceList8: priceLists['8'] || 0,
    priceList9: priceLists['9'] || 0,
    priceList10: priceLists['10'] || 0,
    priceList13: priceLists['13'] || 0,
    priceList14: priceLists['14'] || 0,
    priceLists,
    marginList1: marginLists['1'] || 0,
    marginList2: marginLists['2'] || 0,
    marginList3: marginLists['3'] || 0,
    marginList4: marginLists['4'] || 0,
    marginList5: marginLists['5'] || 0,
    marginList6: marginLists['6'] || 0,
    marginList7: marginLists['7'] || 0,
    marginList8: marginLists['8'] || 0,
    marginList9: marginLists['9'] || 0,
    marginList10: marginLists['10'] || 0,
    marginList13: marginLists['13'] ?? null,
    marginList14: marginLists['14'] ?? null,
    marginLists,
    costByPriceList,
    totalChanges: toNumber(product.total_changes),
    firstChangeDate: product.first_change_date,
    lastChangeDate: product.last_change_date,
    daysSinceLastChange:
      product.days_since_last_change === null ||
      product.days_since_last_change === undefined
        ? null
        : toNumber(product.days_since_last_change),
    avgChangeFrequencyDays: toNullableNumber(product.avg_change_frequency_days),
  };
};

class PriceHistoryNewService {
  private async getNormalizedPriceRows(productCodes: string[]): Promise<NormalizedPriceRow[]> {
    const codes = Array.from(
      new Set(productCodes.map((code) => String(code || '').trim()).filter(Boolean))
    );
    if (codes.length === 0) return [];

    return prisma.$queryRaw<NormalizedPriceRow[]>(Prisma.sql`
      SELECT
        product_code,
        price_list_no,
        current_price,
        current_cost,
        current_margin
      FROM product_price_list_current
      WHERE product_code IN (${Prisma.join(codes)})
      ORDER BY product_code, price_list_no
    `);
  }

  /**
   * Ürün listesi ve istatistikleri getirir
   */
  async getProductPriceList(filters: PriceHistoryFilters): Promise<{
    products: ProductPriceInfo[];
    totalRecords: number;
    totalPages: number;
    page: number;
    limit: number;
  }> {
    const {
      startDate,
      endDate,
      productCode,
      productName,
      brand,
      category,
      hasStock,
      minDaysSinceChange,
      maxDaysSinceChange,
      minChangeFrequency,
      maxChangeFrequency,
      page = 1,
      limit = 50,
      sortBy = 'lastChangeDate',
      sortOrder = 'desc',
    } = filters;

    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const safeLimit = Number.isFinite(limit)
      ? Math.min(200, Math.max(1, Math.floor(limit)))
      : 50;

    // User-controlled values are bound as parameters. The ORDER BY fragment
    // below is selected only from a closed allow-list.
    const conditions: Prisma.Sql[] = [Prisma.sql`1=1`];

    if (startDate && endDate) {
      conditions.push(
        Prisma.sql`first_change_date >= ${startDate}::timestamp AND last_change_date <= ${endDate}::timestamp`
      );
    } else if (startDate) {
      conditions.push(Prisma.sql`first_change_date >= ${startDate}::timestamp`);
    } else if (endDate) {
      conditions.push(Prisma.sql`last_change_date <= ${endDate}::timestamp`);
    }

    if (productCode) {
      conditions.push(Prisma.sql`product_code ILIKE ${`%${productCode}%`}`);
    }

    if (productName) {
      conditions.push(Prisma.sql`product_name ILIKE ${`%${productName}%`}`);
    }

    if (brand) {
      conditions.push(Prisma.sql`brand ILIKE ${`%${brand}%`}`);
    }

    if (category) {
      conditions.push(Prisma.sql`category ILIKE ${`%${category}%`}`);
    }

    if (hasStock) {
      conditions.push(Prisma.sql`current_stock > 0`);
    }

    if (minDaysSinceChange !== undefined && Number.isFinite(minDaysSinceChange)) {
      conditions.push(
        Prisma.sql`days_since_last_change >= ${Math.floor(minDaysSinceChange)}`
      );
    }

    if (maxDaysSinceChange !== undefined && Number.isFinite(maxDaysSinceChange)) {
      conditions.push(
        Prisma.sql`days_since_last_change <= ${Math.floor(maxDaysSinceChange)}`
      );
    }

    if (minChangeFrequency !== undefined && Number.isFinite(minChangeFrequency)) {
      conditions.push(
        Prisma.sql`avg_change_frequency_days <= ${Math.floor(minChangeFrequency)}`
      );
    }

    if (maxChangeFrequency !== undefined && Number.isFinite(maxChangeFrequency)) {
      conditions.push(
        Prisma.sql`avg_change_frequency_days >= ${Math.floor(maxChangeFrequency)}`
      );
    }

    const whereClause = Prisma.join(conditions, ' AND ');

    // Sorting
    let orderByClause = 'last_change_date DESC';
    if (sortBy === 'changeFrequency') {
      orderByClause = `avg_change_frequency_days ${sortOrder === 'asc' ? 'ASC' : 'DESC'} NULLS LAST`;
    } else if (sortBy === 'productName') {
      orderByClause = `product_name ${sortOrder === 'asc' ? 'ASC' : 'DESC'}`;
    } else if (sortBy === 'brand') {
      orderByClause = `brand ${sortOrder === 'asc' ? 'ASC NULLS LAST' : 'DESC NULLS LAST'}`;
    } else if (sortBy === 'totalChanges') {
      orderByClause = `total_changes ${sortOrder === 'asc' ? 'ASC' : 'DESC'}`;
    } else if (sortBy === 'lastChangeDate') {
      orderByClause = `last_change_date ${sortOrder === 'asc' ? 'ASC NULLS LAST' : 'DESC NULLS LAST'}`;
    }

    // Count
    const countResult = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT COUNT(*) as count
      FROM product_price_stats
      WHERE ${whereClause}
    `);
    const totalRecords = toNumber(countResult[0]?.count);
    const totalPages = Math.ceil(totalRecords / safeLimit);

    // Data
    const offset = (safePage - 1) * safeLimit;
    const products = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT *
      FROM product_price_stats
      WHERE ${whereClause}
      ORDER BY ${Prisma.raw(orderByClause)}
      LIMIT ${safeLimit} OFFSET ${offset}
    `);
    const normalizedByProduct = groupNormalizedRows(
      await this.getNormalizedPriceRows(products.map((product) => product.product_code))
    );

    return {
      products: products.map((product) =>
        mapProductPriceInfo(
          product,
          normalizedByProduct.get(String(product.product_code || '').trim()) || []
        )
      ),
      totalRecords,
      totalPages,
      page: safePage,
      limit: safeLimit,
    };
  }

  /**
   * Belirli bir ürünün detaylı fiyat değişim geçmişini getirir
   */
  async getProductPriceHistory(productCode: string): Promise<{
    product: ProductPriceInfo | null;
    changes: PriceChangeDetail[];
  }> {
    // Ürün bilgisi
    const productResult = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT *
      FROM product_price_stats
      WHERE product_code = ${productCode}
      LIMIT 1
    `);

    if (productResult.length === 0) {
      return { product: null, changes: [] };
    }

    const p = productResult[0];
    const product = mapProductPriceInfo(
      p,
      await this.getNormalizedPriceRows([productCode])
    );

    // Fiyat değişim geçmişi
    const changesResult = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT *
      FROM price_changes
      WHERE product_code = ${productCode}
      ORDER BY change_date DESC, price_list_no ASC
      LIMIT 1000
    `);

    const changes: PriceChangeDetail[] = changesResult.map(c => ({
      productCode: c.product_code,
      changeDate: c.change_date,
      priceListNo: parseInt(c.price_list_no, 10),
      oldPrice: parseFloat(c.old_price),
      newPrice: parseFloat(c.new_price),
      changeAmount: parseFloat(c.change_amount),
      changePercent: parseFloat(c.change_percent),
    }));

    return { product, changes };
  }

  /**
   * Özet istatistikler
   */
  async getSummaryStats(): Promise<{
    totalProducts: number;
    totalChanges: number;
    productsWithStock: number;
    avgChangeFrequency: number;
    productsNotChangedInMonths: {
      '3months': number;
      '6months': number;
      '12months': number;
    };
    mostFrequentChangers: Array<{ productCode: string; productName: string; changeFrequency: number }>;
    leastFrequentChangers: Array<{ productCode: string; productName: string; daysSinceChange: number }>;
  }> {
    const stats = await prisma.$queryRaw<any[]>`
      SELECT
        COUNT(*) as total_products,
        SUM(total_changes) as total_changes,
        SUM(CASE WHEN current_stock > 0 THEN 1 ELSE 0 END) as products_with_stock,
        AVG(avg_change_frequency_days) as avg_change_frequency,
        SUM(CASE WHEN days_since_last_change > 90 THEN 1 ELSE 0 END) as not_changed_3months,
        SUM(CASE WHEN days_since_last_change > 180 THEN 1 ELSE 0 END) as not_changed_6months,
        SUM(CASE WHEN days_since_last_change > 365 THEN 1 ELSE 0 END) as not_changed_12months
      FROM product_price_stats
    `;

    const mostFrequent = await prisma.$queryRaw<any[]>`
      SELECT product_code, product_name, avg_change_frequency_days as change_frequency
      FROM product_price_stats
      WHERE avg_change_frequency_days IS NOT NULL
        AND total_changes > 5
      ORDER BY avg_change_frequency_days ASC
      LIMIT 10
    `;

    const leastFrequent = await prisma.$queryRaw<any[]>`
      SELECT product_code, product_name, days_since_last_change
      FROM product_price_stats
      WHERE days_since_last_change IS NOT NULL
      ORDER BY days_since_last_change DESC
      LIMIT 10
    `;

    const s = stats[0];

    return {
      totalProducts: parseInt(s.total_products || '0', 10),
      totalChanges: parseInt(s.total_changes || '0', 10),
      productsWithStock: parseInt(s.products_with_stock || '0', 10),
      avgChangeFrequency: parseFloat(s.avg_change_frequency || '0'),
      productsNotChangedInMonths: {
        '3months': parseInt(s.not_changed_3months || '0', 10),
        '6months': parseInt(s.not_changed_6months || '0', 10),
        '12months': parseInt(s.not_changed_12months || '0', 10),
      },
      mostFrequentChangers: mostFrequent.map(m => ({
        productCode: m.product_code,
        productName: m.product_name,
        changeFrequency: parseFloat(m.change_frequency),
      })),
      leastFrequentChangers: leastFrequent.map(l => ({
        productCode: l.product_code,
        productName: l.product_name,
        daysSinceChange: parseInt(l.days_since_last_change, 10),
      })),
    };
  }
}

export default new PriceHistoryNewService();
