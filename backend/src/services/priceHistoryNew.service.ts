/**
 * Price History Service (New - PostgreSQL based)
 *
 * Artık Mikro ERP'ye her seferinde sorgu atmıyoruz.
 * PostgreSQL'deki senkronize edilmiş verileri kullanıyoruz.
 */

import { PrismaClient } from '@prisma/client';

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

class PriceHistoryNewService {
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

    // WHERE conditions
    const conditions: string[] = ['1=1'];

    if (startDate && endDate) {
      conditions.push(`first_change_date >= '${startDate}' AND last_change_date <= '${endDate}'`);
    } else if (startDate) {
      conditions.push(`first_change_date >= '${startDate}'`);
    } else if (endDate) {
      conditions.push(`last_change_date <= '${endDate}'`);
    }

    if (productCode) {
      conditions.push(`product_code ILIKE '%${productCode}%'`);
    }

    if (productName) {
      conditions.push(`product_name ILIKE '%${productName}%'`);
    }

    if (brand) {
      conditions.push(`brand ILIKE '%${brand}%'`);
    }

    if (category) {
      conditions.push(`category ILIKE '%${category}%'`);
    }

    if (hasStock) {
      conditions.push(`current_stock > 0`);
    }

    if (minDaysSinceChange !== undefined) {
      conditions.push(`days_since_last_change >= ${minDaysSinceChange}`);
    }

    if (maxDaysSinceChange !== undefined) {
      conditions.push(`days_since_last_change <= ${maxDaysSinceChange}`);
    }

    if (minChangeFrequency !== undefined) {
      conditions.push(`avg_change_frequency_days <= ${minChangeFrequency}`);
    }

    if (maxChangeFrequency !== undefined) {
      conditions.push(`avg_change_frequency_days >= ${maxChangeFrequency}`);
    }

    const whereClause = conditions.join(' AND ');

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
    const countResult = await prisma.$queryRawUnsafe<any[]>(`
      SELECT COUNT(*) as count
      FROM product_price_stats
      WHERE ${whereClause}
    `);
    const totalRecords = parseInt(countResult[0]?.count || '0', 10);
    const totalPages = Math.ceil(totalRecords / limit);

    // Data
    const offset = (page - 1) * limit;
    const products = await prisma.$queryRawUnsafe<any[]>(`
      SELECT *
      FROM product_price_stats
      WHERE ${whereClause}
      ORDER BY ${orderByClause}
      LIMIT ${limit} OFFSET ${offset}
    `);

    return {
      products: products.map(p => ({
        productCode: p.product_code,
        productName: p.product_name,
        brand: p.brand,
        category: p.category,
        currentCost: parseFloat(p.current_cost || '0'),
        currentStock: parseFloat(p.current_stock || '0'),
        priceList1: parseFloat(p.current_price_list_1 || '0'),
        priceList2: parseFloat(p.current_price_list_2 || '0'),
        priceList3: parseFloat(p.current_price_list_3 || '0'),
        priceList4: parseFloat(p.current_price_list_4 || '0'),
        priceList5: parseFloat(p.current_price_list_5 || '0'),
        priceList6: parseFloat(p.current_price_list_6 || '0'),
        priceList7: parseFloat(p.current_price_list_7 || '0'),
        priceList8: parseFloat(p.current_price_list_8 || '0'),
        priceList9: parseFloat(p.current_price_list_9 || '0'),
        priceList10: parseFloat(p.current_price_list_10 || '0'),
        marginList1: parseFloat(p.current_margin_list_1 || '0'),
        marginList2: parseFloat(p.current_margin_list_2 || '0'),
        marginList3: parseFloat(p.current_margin_list_3 || '0'),
        marginList4: parseFloat(p.current_margin_list_4 || '0'),
        marginList5: parseFloat(p.current_margin_list_5 || '0'),
        marginList6: parseFloat(p.current_margin_list_6 || '0'),
        marginList7: parseFloat(p.current_margin_list_7 || '0'),
        marginList8: parseFloat(p.current_margin_list_8 || '0'),
        marginList9: parseFloat(p.current_margin_list_9 || '0'),
        marginList10: parseFloat(p.current_margin_list_10 || '0'),
        totalChanges: parseInt(p.total_changes || '0', 10),
        firstChangeDate: p.first_change_date,
        lastChangeDate: p.last_change_date,
        daysSinceLastChange: parseInt(p.days_since_last_change || '0', 10),
        avgChangeFrequencyDays: p.avg_change_frequency_days ? parseFloat(p.avg_change_frequency_days) : null,
      })),
      totalRecords,
      totalPages,
      page,
      limit,
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
    const productResult = await prisma.$queryRawUnsafe<any[]>(`
      SELECT *
      FROM product_price_stats
      WHERE product_code = '${productCode}'
      LIMIT 1
    `);

    if (productResult.length === 0) {
      return { product: null, changes: [] };
    }

    const p = productResult[0];
    const product: ProductPriceInfo = {
      productCode: p.product_code,
      productName: p.product_name,
      brand: p.brand,
      category: p.category,
      currentCost: parseFloat(p.current_cost || '0'),
      currentStock: parseFloat(p.current_stock || '0'),
      priceList1: parseFloat(p.current_price_list_1 || '0'),
      priceList2: parseFloat(p.current_price_list_2 || '0'),
      priceList3: parseFloat(p.current_price_list_3 || '0'),
      priceList4: parseFloat(p.current_price_list_4 || '0'),
      priceList5: parseFloat(p.current_price_list_5 || '0'),
      priceList6: parseFloat(p.current_price_list_6 || '0'),
      priceList7: parseFloat(p.current_price_list_7 || '0'),
      priceList8: parseFloat(p.current_price_list_8 || '0'),
      priceList9: parseFloat(p.current_price_list_9 || '0'),
      priceList10: parseFloat(p.current_price_list_10 || '0'),
      marginList1: parseFloat(p.current_margin_list_1 || '0'),
      marginList2: parseFloat(p.current_margin_list_2 || '0'),
      marginList3: parseFloat(p.current_margin_list_3 || '0'),
      marginList4: parseFloat(p.current_margin_list_4 || '0'),
      marginList5: parseFloat(p.current_margin_list_5 || '0'),
      marginList6: parseFloat(p.current_margin_list_6 || '0'),
      marginList7: parseFloat(p.current_margin_list_7 || '0'),
      marginList8: parseFloat(p.current_margin_list_8 || '0'),
      marginList9: parseFloat(p.current_margin_list_9 || '0'),
      marginList10: parseFloat(p.current_margin_list_10 || '0'),
      totalChanges: parseInt(p.total_changes || '0', 10),
      firstChangeDate: p.first_change_date,
      lastChangeDate: p.last_change_date,
      daysSinceLastChange: parseInt(p.days_since_last_change || '0', 10),
      avgChangeFrequencyDays: p.avg_change_frequency_days ? parseFloat(p.avg_change_frequency_days) : null,
    };

    // Fiyat değişim geçmişi
    const changesResult = await prisma.$queryRawUnsafe<any[]>(`
      SELECT *
      FROM price_changes
      WHERE product_code = '${productCode}'
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
