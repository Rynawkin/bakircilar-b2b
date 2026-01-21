/**
 * Reports Service
 *
 * Raporları PostgreSQL'den (senkronize edilmiş verilerden) üretir.
 * Mikro'ya her seferinde bağlanmaya gerek yok, sabah sync'te çekilen veriler kullanılır.
 */

import { prisma } from '../utils/prisma';
import { config } from '../config';
import { AppError, ErrorCode } from '../types/errors';
import mikroService from './mikro.service';
import exclusionService from './exclusion.service';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '../utils/search';

interface CostUpdateAlert {
  productCode: string;
  productName: string;
  category: string;
  currentCostDate: Date | null;
  currentCost: number;
  lastEntryDate: Date | null;
  lastEntryCost: number;
  diffAmount: number;
  diffPercent: number;
  dayDiff: number;
  stockQuantity: number;
  riskAmount: number;
  salePrice: number;
}

interface CostUpdateAlertResponse {
  products: CostUpdateAlert[];
  summary: {
    totalAlerts: number;
    totalRiskAmount: number;
    totalStockValue: number;
    avgDiffPercent: number;
  };
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    totalRecords: number;
  };
  metadata: {
    lastSyncAt: Date | null;
    syncType: string | null;
  };
}

// Margin Compliance types
interface MarginComplianceAlert {
  productCode: string;
  productName: string;
  category: string;
  currentCost: number;
  customerType: string;
  expectedMargin: number; // % kar marjı (e.g., 60 for 1.6x multiplier)
  expectedPrice: number;
  actualPrice: number;
  deviation: number; // % deviation
  deviationAmount: number; // TL deviation
  status: 'OK' | 'HIGH' | 'LOW'; // OK: ±2%, HIGH: >2%, LOW: <-2%
  priceSource: 'CATEGORY_RULE' | 'PRODUCT_OVERRIDE' | 'MIKRO_MARGIN';
}

interface MarginComplianceResponse {
  alerts: MarginComplianceAlert[];
  summary: {
    totalProducts: number;
    compliantCount: number;
    highDeviationCount: number;
    lowDeviationCount: number;
    avgDeviation: number;
  };
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    totalRecords: number;
  };
  metadata: {
    lastSyncAt: Date | null;
    syncType: string | null;
  };
}

// Price History types
interface PriceListChange {
  listNo: number;
  listName: string;
  oldPrice: number;
  newPrice: number;
  changeAmount: number;
  changePercent: number;
}

interface PriceChange {
  productCode: string;
  productName: string;
  category: string;
  changeDate: Date;
  priceChanges: PriceListChange[];
  isConsistent: boolean; // true if all 10 lists changed on same date
  updatedListsCount: number;
  missingLists: number[];
  avgChangePercent: number;
  changeDirection: 'increase' | 'decrease' | 'mixed';
}

interface PriceHistoryResponse {
  changes: PriceChange[];
  summary: {
    totalChanges: number;
    consistentChanges: number;
    inconsistentChanges: number;
    inconsistencyRate: number;
    avgIncreasePercent: number;
    avgDecreasePercent: number;
    topIncreases: { product: string; percent: number }[];
    topDecreases: { product: string; percent: number }[];
    last30DaysChanges: number;
    last7DaysChanges: number;
  };
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    totalRecords: number;
  };
  metadata: {
    dataSource: string;
  };
}


const parseDateInput = (value?: string): Date | null => {
  if (!value) return null;
  const cleaned = value.replace(/-/g, '');
  if (!/^\d{8}$/.test(cleaned)) return null;
  const year = Number(cleaned.slice(0, 4));
  const month = Number(cleaned.slice(4, 6));
  const day = Number(cleaned.slice(6, 8));
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
};

const formatDateKey = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateCompact = (date: Date): string => formatDateKey(date).replace(/-/g, '');

const addDaysUtc = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const listUtcDates = (start: Date, end: Date): Date[] => {
  const dates: Date[] = [];
  let current = new Date(start);
  while (current <= end) {
    dates.push(new Date(current));
    current = addDaysUtc(current, 1);
  }
  return dates;
};

const getDateInTimeZone = (date: Date, timeZone: string): Date => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [year, month, day] = formatter.format(date).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const getYesterdayInTimeZone = (timeZone: string): Date => {
  const today = getDateInTimeZone(new Date(), timeZone);
  return addDaysUtc(today, -1);
};

const toNumber = (value: unknown): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const pickTotalProfit = (row: Record<string, any>): number => {
  if (!row || typeof row !== 'object') return 0;

  const direct = row['ToplamKarOrtMalGore'];
  if (direct !== undefined && direct !== null) {
    return toNumber(direct);
  }

  const key = Object.keys(row).find((candidate) =>
    candidate.toLowerCase().includes('toplamkarortmal')
  );

  return key ? toNumber(row[key]) : 0;
};

export class ReportsService {
  /**
   * Maliyet Güncelleme Uyarıları Raporu
   *
   * Son giriş maliyeti güncel maliyetten yüksek olan ürünleri listeler.
   * Veriler sabah sync'te PostgreSQL'e çekilir, buradan okunur.
   */
  async getCostUpdateAlerts(options: {
    dayDiff?: number;
    percentDiff?: number;
    category?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<CostUpdateAlertResponse> {
    const {
      dayDiff = 0,
      percentDiff = 0,
      category,
      page = 1,
      limit = 50,
      sortBy = 'riskAmount',
      sortOrder = 'desc',
    } = options;

    const pageValue = Number.isFinite(page) && page > 0 ? page : 1;
    const limitValue = Number.isFinite(limit) ? limit : 50;
    const isAll = limitValue <= 0;
    const offset = isAll ? 0 : (pageValue - 1) * limitValue;

    // WHERE koşulları
    const where: any = {
      active: true,
      lastEntryDate: { not: null },
      lastEntryPrice: { not: null },
      currentCost: { not: null },
      currentCostDate: { not: null },
    };

    // Kategori filtresi
    if (category) {
      where.category = {
        mikroCode: category,
      };
    }

    // Ürünleri çek (tüm eşleşenler, sayfalama sonradan yapılır)
    const products = await prisma.product.findMany({
      where,
      include: {
        category: true,
      },
    });

    // Filtreleme ve hesaplama
    const alerts: CostUpdateAlert[] = [];

    for (const product of products) {
      const currentCost = product.currentCost || 0;
      const lastEntryPrice = product.lastEntryPrice || 0;
      const currentCostDate = product.currentCostDate;
      const lastEntryDate = product.lastEntryDate;

      // Son giriş maliyeti güncel maliyetten yüksek mi?
      if (lastEntryPrice <= currentCost) continue;

      // Son giriş tarihi güncel maliyet tarihinden sonra mı?
      if (!currentCostDate || !lastEntryDate) continue;
      if (lastEntryDate <= currentCostDate) continue;

      // Gün farkı
      const dayDifference = Math.floor(
        (lastEntryDate.getTime() - currentCostDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Gün farkı filtresi
      if (dayDiff > 0 && dayDifference < dayDiff) continue;

      // Fark hesaplama
      const diffAmount = lastEntryPrice - currentCost;
      const diffPercent = (diffAmount / currentCost) * 100;

      // Yüzde farkı filtresi
      if (percentDiff > 0 && diffPercent < percentDiff) continue;

      // Toplam stok (tüm depolar)
      const warehouseStocks = product.warehouseStocks as Record<string, number>;
      const stockQuantity = Object.values(warehouseStocks).reduce((sum, qty) => sum + qty, 0);

      // Risk tutarı
      const riskAmount = diffAmount * stockQuantity;

      // Satış fiyatı (faturalı bayi fiyatı varsayılan)
      const prices = product.prices as any;
      const salePrice = prices?.BAYI?.INVOICED || prices?.PERAKENDE?.INVOICED || currentCost * 1.3;

      alerts.push({
        productCode: product.mikroCode,
        productName: product.name,
        category: product.category.name,
        currentCostDate,
        currentCost,
        lastEntryDate,
        lastEntryCost: lastEntryPrice,
        diffAmount,
        diffPercent,
        dayDiff: dayDifference,
        stockQuantity,
        riskAmount,
        salePrice,
      });
    }

    // Sıralama
    alerts.sort((a, b) => {
      const aValue = (a as any)[sortBy] || 0;
      const bValue = (b as any)[sortBy] || 0;
      return sortOrder === 'desc' ? bValue - aValue : aValue - bValue;
    });

    // Pagination
    const totalRecords = alerts.length;
    const paginatedAlerts = isAll ? alerts : alerts.slice(offset, offset + limitValue);
    const totalPages = isAll ? 1 : Math.ceil(totalRecords / limitValue);
    const paginationLimit = isAll ? totalRecords : limitValue;

    // Summary hesaplama
    const totalRiskAmount = alerts.reduce((sum, a) => sum + a.riskAmount, 0);
    const totalStockValue = alerts.reduce((sum, a) => sum + a.stockQuantity * a.currentCost, 0);
    const avgDiffPercent = alerts.length > 0
      ? alerts.reduce((sum, a) => sum + a.diffPercent, 0) / alerts.length
      : 0;

    // Son senkronizasyon bilgisini al
    const lastSync = await prisma.syncLog.findFirst({
      where: { status: 'SUCCESS' },
      orderBy: { completedAt: 'desc' },
      select: {
        completedAt: true,
        syncType: true,
      },
    });

    return {
      products: paginatedAlerts,
      summary: {
        totalAlerts: totalRecords,
        totalRiskAmount,
        totalStockValue,
        avgDiffPercent,
      },
      pagination: {
        page: isAll ? 1 : pageValue,
        limit: paginationLimit,
        totalPages,
        totalRecords,
      },
      metadata: {
        lastSyncAt: lastSync?.completedAt || null,
        syncType: lastSync?.syncType || null,
      },
    };
  }

  /**
   * Rapor kategorilerini döndür
   */
  async getReportCategories(): Promise<{ categories: string[] }> {
    const categories = await prisma.category.findMany({
      where: { active: true },
      select: { mikroCode: true, name: true },
      orderBy: { name: 'asc' },
    });

    return {
      categories: categories.map((c) => c.mikroCode),
    };
  }

  /**
   * Kar Marjı Analizi Raporu (019703 - Komisyon Faturası Hareket Yönetimi)
   *
   * Mikro'daki fn_KomisyonFaturasiHareketYonetimi fonksiyonunu kullanarak
   * bekleyen siparişler ve faturalar üzerinden detaylı kar marjı analizi yapar.
   *
   * Özellikler:
   * - Son giriş maliyeti ve ortalama maliyete göre kar hesaplar
   * - Gerçek satış işlemlerini analiz eder
   * - Evrak bazında detaylı bilgi verir
   */
  async getMarginComplianceReport(options: {
    startDate?: string;
    endDate?: string;
    includeCompleted?: number; // 1 = tamamlananlari da dahil et, 0 = sadece bekleyenler
    customerType?: string;
    category?: string;
    status?: string; // HIGH (>30%), LOW (<10%), NEGATIVE (<0%), OK (10-30%)
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<any> {
    const {
      startDate,
      endDate,
      includeCompleted = 1,
      customerType,
      category,
      status,
      page = 1,
      limit = 100,
      sortBy = 'OrtalamaKarYuzde',
      sortOrder = 'desc',
    } = options;

    const defaultDate = getYesterdayInTimeZone(config.cronTimezone);
    const parsedStart = parseDateInput(startDate) || defaultDate;
    const parsedEnd = parseDateInput(endDate) || parsedStart;
    const reportStart = parsedStart <= parsedEnd ? parsedStart : parsedEnd;
    const reportEnd = parsedStart <= parsedEnd ? parsedEnd : parsedStart;

    const expectedDates = listUtcDates(reportStart, reportEnd).map(formatDateKey);
    const availableDays = await prisma.marginComplianceReportDay.findMany({
      where: {
        reportDate: { gte: reportStart, lte: reportEnd },
        status: 'SUCCESS',
      },
      select: { reportDate: true },
    });

    const availableSet = new Set(availableDays.map((day) => formatDateKey(day.reportDate)));
    const missingDates = expectedDates.filter((dateKey) => !availableSet.has(dateKey));

    if (missingDates.length > 0) {
      const preview = missingDates.slice(0, 5).join(', ');
      const suffix = missingDates.length > 5 ? '...' : '';
      throw new AppError(`Veri hazir degil. Eksik gunler: ${preview}${suffix}`, 409, ErrorCode.REPORT_DATA_NOT_READY, { missingDates });
    }

    const where: any = {
      reportDate: { gte: reportStart, lte: reportEnd },
    };

    if (customerType) {
      where.sectorCode = { contains: customerType };
    }

    if (category) {
      where.groupCode = { contains: category };
    }

    if (status) {
      if (status === 'HIGH') {
        where.avgMargin = { gt: 30 };
      } else if (status === 'LOW') {
        where.avgMargin = { lt: 10 };
      } else if (status === 'NEGATIVE') {
        where.avgMargin = { lt: 0 };
      } else if (status === 'OK') {
        where.avgMargin = { gte: 10, lte: 30 };
      }
    }

    const sortField =
      sortBy === 'OrtalamaKarYuzde' || sortBy === 'avgMargin'
        ? 'avgMargin'
        : sortBy === 'TutarKDV' || sortBy === 'totalRevenue'
        ? 'totalRevenue'
        : sortBy === 'ToplamKarOrtMalGore' || sortBy === 'totalProfit'
        ? 'totalProfit'
        : 'avgMargin';

    const orderBy = {
      [sortField]: sortOrder === 'asc' ? 'asc' : 'desc',
    } as const;

    const pageValue = Number.isFinite(page) && page > 0 ? page : 1;
    const limitValue = Number.isFinite(limit) && limit > 0 ? limit : 100;
    const offset = (pageValue - 1) * limitValue;

    const [rows, totalRecords, aggregates, highMarginCount, lowMarginCount, negativeMarginCount] =
      await prisma.$transaction([
        prisma.marginComplianceReportRow.findMany({
          where,
          orderBy,
          skip: offset,
          take: limitValue,
        }),
        prisma.marginComplianceReportRow.count({ where }),
        prisma.marginComplianceReportRow.aggregate({
          where,
          _sum: { totalRevenue: true, totalProfit: true },
          _avg: { avgMargin: true },
        }),
        prisma.marginComplianceReportRow.count({
          where: { ...where, avgMargin: { gt: 30 } },
        }),
        prisma.marginComplianceReportRow.count({
          where: { ...where, avgMargin: { lt: 10 } },
        }),
        prisma.marginComplianceReportRow.count({
          where: { ...where, avgMargin: { lt: 0 } },
        }),
      ]);

    const totalRevenue = toNumber(aggregates._sum.totalRevenue);
    const totalProfit = toNumber(aggregates._sum.totalProfit);
    const avgMargin = toNumber(aggregates._avg.avgMargin);

    return {
      data: rows.map((row) => row.data),
      summary: {
        totalRecords,
        totalRevenue,
        totalProfit,
        avgMargin,
        highMarginCount,
        lowMarginCount,
        negativeMarginCount,
      },
      pagination: {
        page: pageValue,
        limit: limitValue,
        totalPages: Math.ceil(totalRecords / limitValue),
        totalRecords,
      },
      metadata: {
        reportDate: new Date(),
        startDate: formatDateCompact(reportStart),
        endDate: formatDateCompact(reportEnd),
        includeCompleted,
      },
    };
  }

  async syncMarginComplianceReportForDate(reportDate: Date, options: {
    includeCompleted?: number;
  } = {}): Promise<{ success: boolean; rowCount: number; reportDate: string; error?: string }> {
    const includeCompleted = options.includeCompleted ?? 1;
    const reportDateKey = formatDateKey(reportDate);
    const start = formatDateCompact(reportDate);
    const end = start;

    const mikroFactory = require('./mikroFactory.service').default;
    await mikroFactory.connect();

    try {
      const query = `
        SELECT *
        FROM dbo.fn_KomisyonFaturasiHareketYonetimi('${start}', '${end}', ${includeCompleted})
        ORDER BY [msg_S_0089], [msg_S_0001]
      `;

      const result = await mikroFactory.executeQuery(query);
      const sanitizedRows = result.map((row: any) => JSON.parse(JSON.stringify(row)));
      const rowData = sanitizedRows.map((row: any) => ({
        reportDate,
        sectorCode: typeof row.SektorKodu === 'string' ? row.SektorKodu : null,
        groupCode: typeof row.GrupKodu === 'string' ? row.GrupKodu : null,
        avgMargin: toNumber(row.OrtalamaKarYuzde),
        totalRevenue: toNumber(row.TutarKDV),
        totalProfit: pickTotalProfit(row),
        data: row,
      }));

      await prisma.marginComplianceReportRow.deleteMany({ where: { reportDate } });

      const chunkSize = 1000;
      for (let i = 0; i < rowData.length; i += chunkSize) {
        const chunk = rowData.slice(i, i + chunkSize);
        if (chunk.length > 0) {
          await prisma.marginComplianceReportRow.createMany({ data: chunk });
        }
      }

      await prisma.marginComplianceReportDay.upsert({
        where: { reportDate },
        create: {
          reportDate,
          status: 'SUCCESS',
          rowCount: rowData.length,
          syncedAt: new Date(),
        },
        update: {
          status: 'SUCCESS',
          rowCount: rowData.length,
          errorMessage: null,
          syncedAt: new Date(),
        },
      });

      await mikroFactory.disconnect();

      return {
        success: true,
        rowCount: rowData.length,
        reportDate: reportDateKey,
      };
    } catch (error: any) {
      await mikroFactory.disconnect();
      await prisma.marginComplianceReportDay.upsert({
        where: { reportDate },
        create: {
          reportDate,
          status: 'FAILED',
          rowCount: 0,
          errorMessage: error?.message || 'Unknown error',
          syncedAt: new Date(),
        },
        update: {
          status: 'FAILED',
          rowCount: 0,
          errorMessage: error?.message || 'Unknown error',
          syncedAt: new Date(),
        },
      });

      return {
        success: false,
        rowCount: 0,
        reportDate: reportDateKey,
        error: error?.message || 'Unknown error',
      };
    }
  }

  async backfillMarginComplianceReport(days: number, options: {
    includeCompleted?: number;
    timeZone?: string;
    delayMs?: number;
  } = {}): Promise<{ success: boolean; results: Array<{ reportDate: string; success: boolean; rowCount: number; error?: string }> }> {
    const safeDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 1;
    const timeZone = options.timeZone || config.cronTimezone;
    const delayMs = Number.isFinite(options.delayMs) ? Number(options.delayMs) : 0;
    const includeCompleted = options.includeCompleted ?? 1;

    const endDate = getYesterdayInTimeZone(timeZone);
    const startDate = addDaysUtc(endDate, -(safeDays - 1));
    const dateList = listUtcDates(startDate, endDate);

    const results: Array<{ reportDate: string; success: boolean; rowCount: number; error?: string }> = [];

    for (const date of dateList) {
      const result = await this.syncMarginComplianceReportForDate(date, { includeCompleted });
      results.push(result);
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return {
      success: results.every((item) => item.success),
      results,
    };
  }


  /**
   * En Çok Satan Ürünler Raporu
   *
   * Belirtilen tarih aralığında en çok satılan ürünleri listeler.
   * Hem satış tutarı hem de karlılık bazında sıralanabilir.
   */
  async getTopProducts(options: {
    startDate?: string;
    endDate?: string;
    brand?: string;
    category?: string;
    minQuantity?: number;
    sortBy?: 'revenue' | 'profit' | 'profit_asc' | 'margin' | 'margin_asc' | 'quantity';
    page?: number;
    limit?: number;
  } = {}): Promise<{
    products: Array<{
      productCode: string;
      productName: string;
      brand: string;
      category: string;
      quantity: number;
      revenue: number;
      cost: number;
      profit: number;
      profitMargin: number;
      avgPrice: number;
      customerCount: number;
    }>;
    summary: {
      totalRevenue: number;
      totalProfit: number;
      avgProfitMargin: number;
      totalProducts: number;
    };
    pagination: {
      page: number;
      limit: number;
      totalPages: number;
      totalRecords: number;
    };
  }> {
    const {
      startDate,
      endDate,
      brand,
      category,
      minQuantity = 0,
      sortBy = 'revenue',
      page = 1,
      limit = 50,
    } = options;

    await mikroService.connect();

    // WHERE koşulları - STOK_HAREKETLERI kullan (gerçek satışlar)
    const whereConditions = [
      'sth_cins = 0',  // Satış hareketleri
      'sth_tip = 1'    // Normal hareket (fatura/irsaliye)
    ];

    if (startDate) {
      whereConditions.push(`sth_tarih >= '${startDate}'`);
    }
    if (endDate) {
      whereConditions.push(`sth_tarih <= '${endDate}'`);
    }

    // Add exclusion conditions
    const exclusionConditions = await exclusionService.buildStokHareketleriExclusionConditions();
    whereConditions.push(...exclusionConditions);

    const whereClause = whereConditions.join(' AND ');

    // DEBUG LOGGING
    console.log('=== TOP PRODUCTS EXCLUSION DEBUG ===');
    console.log('Exclusion conditions:', exclusionConditions);
    console.log('Full WHERE clause:', whereClause);

    // Stok hareketlerini çek ve grupla (gerçek satışlar)
    const query = `
      SELECT
        sth.sth_stok_kod as productCode,
        MAX(st.sto_isim) as productName,
        MAX(st.sto_marka_kodu) as brand,
        SUM(sth.sth_miktar) as quantity,
        SUM(sth.sth_tutar) as revenue,
        SUM(sth.sth_miktar * st.sto_standartmaliyet) as totalCost,
        COUNT(DISTINCT sth.sth_cari_kodu) as customerCount
      FROM STOK_HAREKETLERI sth
      LEFT JOIN STOKLAR st ON sth.sth_stok_kod = st.sto_kod
      WHERE ${whereClause}
        AND sth.sth_stok_kod IS NOT NULL
        AND sth.sth_stok_kod != ''
      GROUP BY sth.sth_stok_kod
      HAVING SUM(sth.sth_miktar) >= ${minQuantity}
    `;

    console.log('Full SQL query:', query);

    const rawData = await mikroService.executeQuery(query);

    console.log('Raw data count:', rawData.length);
    console.log('First 3 product codes:', rawData.slice(0, 3).map((p: any) => p.productCode));
    await mikroService.disconnect();

    // Filtreleme
    let filteredData = rawData;
    const brandTokens = buildSearchTokens(brand);
    if (brandTokens.length > 0) {
      filteredData = filteredData.filter((p: any) => {
        const haystack = normalizeSearchText(p.brand || '');
        return matchesSearchTokens(haystack, brandTokens);
      });
    }
    const categoryTokens = buildSearchTokens(category);
    if (categoryTokens.length > 0) {
      filteredData = filteredData.filter((p: any) => {
        const haystack = normalizeSearchText(p.category || '');
        return matchesSearchTokens(haystack, categoryTokens);
      });
    }

    // Hesaplamalar
    const products = filteredData.map((p: any) => {
      const revenue = p.revenue || 0;
      const cost = p.totalCost || 0;
      const profit = revenue - cost;
      const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;
      const avgPrice = p.quantity > 0 ? revenue / p.quantity : 0;

      return {
        productCode: p.productCode,
        productName: p.productName || 'Bilinmiyor',
        brand: p.brand || 'Belirtilmemiş',
        category: 'Kategori', // TODO: Get from category table
        quantity: p.quantity,
        revenue,
        cost,
        profit,
        profitMargin,
        avgPrice,
        customerCount: p.customerCount,
      };
    });

    // Sıralama
    products.sort((a, b) => {
      switch (sortBy) {
        case 'profit':
          return b.profit - a.profit;
        case 'profit_asc':
          return a.profit - b.profit;  // Düşükten yükseğe
        case 'margin':
          return b.profitMargin - a.profitMargin;
        case 'margin_asc':
          return a.profitMargin - b.profitMargin;  // Düşükten yükseğe
        case 'quantity':
          return b.quantity - a.quantity;
        case 'revenue':
        default:
          return b.revenue - a.revenue;
      }
    });

    // Summary
    const totalRevenue = products.reduce((sum, p) => sum + p.revenue, 0);
    const totalProfit = products.reduce((sum, p) => sum + p.profit, 0);
    const avgProfitMargin = products.length > 0
      ? products.reduce((sum, p) => sum + p.profitMargin, 0) / products.length
      : 0;

    // Pagination
    const totalRecords = products.length;
    const totalPages = Math.ceil(totalRecords / limit);
    const offset = (page - 1) * limit;
    const paginatedProducts = products.slice(offset, offset + limit);

    return {
      products: paginatedProducts,
      summary: {
        totalRevenue,
        totalProfit,
        avgProfitMargin,
        totalProducts: totalRecords,
      },
      pagination: {
        page,
        limit,
        totalPages,
        totalRecords,
      },
    };
  }

  /**
   * En Çok Satın Alan Müşteriler Raporu
   *
   * Belirtilen tarih aralığında en çok satın alan müşterileri listeler.
   * Hem alış tutarı hem de karlılık bazında sıralanabilir.
   */
  async getTopCustomers(options: {
    startDate?: string;
    endDate?: string;
    sector?: string;
    minOrderAmount?: number;
    sortBy?: 'revenue' | 'profit' | 'margin' | 'orderCount';
    page?: number;
    limit?: number;
  } = {}): Promise<{
    customers: Array<{
      customerCode: string;
      customerName: string;
      sector: string;
      orderCount: number;
      revenue: number;
      cost: number;
      profit: number;
      profitMargin: number;
      avgOrderAmount: number;
      topCategory: string;
      lastOrderDate: Date;
    }>;
    summary: {
      totalRevenue: number;
      totalProfit: number;
      avgProfitMargin: number;
      totalCustomers: number;
    };
    pagination: {
      page: number;
      limit: number;
      totalPages: number;
      totalRecords: number;
    };
  }> {
    const {
      startDate,
      endDate,
      sector,
      minOrderAmount = 0,
      sortBy = 'revenue',
      page = 1,
      limit = 50,
    } = options;

    await mikroService.connect();

    // WHERE koşulları - STOK_HAREKETLERI kullan (gerçek satışlar)
    const whereConditions = [
      'sth_cins = 0',  // Satış hareketleri
      'sth_tip = 1'    // Normal hareket (fatura/irsaliye)
    ];

    if (startDate) {
      whereConditions.push(`sth_tarih >= '${startDate}'`);
    }
    if (endDate) {
      whereConditions.push(`sth_tarih <= '${endDate}'`);
    }

    // Add exclusion conditions
    const exclusionConditions = await exclusionService.buildStokHareketleriExclusionConditions();
    whereConditions.push(...exclusionConditions);

    const whereClause = whereConditions.join(' AND ');

    // Müşteri bazında stok hareketlerini çek (gerçek satışlar)
    const query = `
      SELECT
        sth.sth_cari_kodu as customerCode,
        MAX(c.cari_unvan1) as customerName,
        MAX(c.cari_sektor) as sector,
        COUNT(DISTINCT sth.sth_evrakno_seri + CAST(sth.sth_evrakno_sira AS VARCHAR)) as orderCount,
        SUM(sth.sth_tutar) as revenue,
        SUM(sth.sth_miktar * st.sto_standartmaliyet) as totalCost,
        MAX(sth.sth_tarih) as lastOrderDate
      FROM STOK_HAREKETLERI sth
      LEFT JOIN CARI_HESAPLAR c ON sth.sth_cari_kodu = c.cari_kod
      LEFT JOIN STOKLAR st ON sth.sth_stok_kod = st.sto_kod
      WHERE ${whereClause}
        AND sth.sth_cari_kodu IS NOT NULL
        AND sth.sth_cari_kodu != ''
      GROUP BY sth.sth_cari_kodu
      HAVING SUM(sth.sth_tutar) >= ${minOrderAmount}
    `;

    const rawData = await mikroService.executeQuery(query);

    // Artık maliyet de sorguya dahil, ayrı sorgu gerek yok
    const customersWithCost = rawData.map((customer: any) => ({
      ...customer,
      totalCost: customer.totalCost || 0,
    }));

    await mikroService.disconnect();

    // Filtreleme
    let filteredData = customersWithCost;
    const sectorTokens = buildSearchTokens(sector);
    if (sectorTokens.length > 0) {
      filteredData = filteredData.filter((c: any) => {
        const haystack = normalizeSearchText(c.sector || '');
        return matchesSearchTokens(haystack, sectorTokens);
      });
    }

    // Hesaplamalar
    const customers = filteredData.map((c: any) => {
      const revenue = c.revenue || 0;
      const cost = c.totalCost || 0;
      const profit = revenue - cost;
      const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;
      const avgOrderAmount = c.orderCount > 0 ? revenue / c.orderCount : 0;

      return {
        customerCode: c.customerCode,
        customerName: c.customerName || 'Bilinmiyor',
        sector: c.sector || 'Belirtilmemiş',
        orderCount: c.orderCount,
        revenue,
        cost,
        profit,
        profitMargin,
        avgOrderAmount,
        topCategory: 'TODO', // TODO: En çok alınan kategori
        lastOrderDate: c.lastOrderDate,
      };
    });

    // Sıralama
    customers.sort((a, b) => {
      switch (sortBy) {
        case 'profit':
          return b.profit - a.profit;
        case 'margin':
          return b.profitMargin - a.profitMargin;
        case 'orderCount':
          return b.orderCount - a.orderCount;
        case 'revenue':
        default:
          return b.revenue - a.revenue;
      }
    });

    // Summary
    const totalRevenue = customers.reduce((sum, c) => sum + c.revenue, 0);
    const totalProfit = customers.reduce((sum, c) => sum + c.profit, 0);
    const avgProfitMargin = customers.length > 0
      ? customers.reduce((sum, c) => sum + c.profitMargin, 0) / customers.length
      : 0;

    // Pagination
    const totalRecords = customers.length;
    const totalPages = Math.ceil(totalRecords / limit);
    const offset = (page - 1) * limit;
    const paginatedCustomers = customers.slice(offset, offset + limit);

    return {
      customers: paginatedCustomers,
      summary: {
        totalRevenue,
        totalProfit,
        avgProfitMargin,
        totalCustomers: totalRecords,
      },
      pagination: {
        page,
        limit,
        totalPages,
        totalRecords,
      },
    };
  }

  /**
   * Fiyat Geçmişi Raporu
   *
   * Mikro'daki STOK_FIYAT_DEGISIKLIKLERI tablosundan tüm fiyat değişikliklerini listeler.
   * Önemli: Her ürünün 10 fiyat listesi olmalı ve hepsi aynı gün güncellenmelidir.
   * - Liste 1-5: Perakende (KDV Dahil Maliyet × Marj_{1-5})
   * - Liste 6-10: Faturalı (KDV Hariç Maliyet × Marj_{1-5})
   */
  async getPriceHistory(options: {
    startDate?: string;
    endDate?: string;
    productCode?: string;
    productName?: string;
    category?: string;
    priceListNo?: number;
    consistencyStatus?: 'all' | 'consistent' | 'inconsistent';
    changeDirection?: 'increase' | 'decrease' | 'mixed' | 'all';
    minChangePercent?: number;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PriceHistoryResponse> {
    const {
      startDate,
      endDate,
      productCode,
      productName,
      category,
      priceListNo,
      consistencyStatus = 'all',
      changeDirection = 'all',
      minChangePercent,
      page = 1,
      limit = 50,
      sortBy = 'changeDate',
      sortOrder = 'desc',
    } = options;

    await mikroService.connect();

    // Liste isimleri
    const priceListNames: { [key: number]: string } = {
      1: 'Perakende 1',
      2: 'Perakende 2',
      3: 'Perakende 3',
      4: 'Perakende 4',
      5: 'Perakende 5',
      6: 'Faturalı 1',
      7: 'Faturalı 2',
      8: 'Faturalı 3',
      9: 'Faturalı 4',
      10: 'Faturalı 5',
    };

    // 1. Fiyat değişikliklerini çek
    let whereConditions = ['1=1'];

    if (startDate) {
      whereConditions.push(`fid_tarih >= '${startDate}'`);
    }
    if (endDate) {
      whereConditions.push(`fid_tarih <= '${endDate}'`);
    }
    if (productCode) {
      whereConditions.push(`fid_stok_kod LIKE '%${productCode}%'`);
    }
    if (priceListNo) {
      whereConditions.push(`fid_fiyat_no = ${priceListNo}`);
    }

    const whereClause = whereConditions.join(' AND ');

    const priceChangesQuery = `
      SELECT TOP 10000
        f.fid_stok_kod,
        f.fid_tarih,
        f.fid_fiyat_no,
        f.fid_eskifiy_tutar,
        f.fid_yenifiy_tutar,
        s.sto_isim,
        'Kategori Yok' as kategori
      FROM STOK_FIYAT_DEGISIKLIKLERI f
      LEFT JOIN STOKLAR s ON f.fid_stok_kod = s.sto_kod
      
      WHERE ${whereClause}
        AND f.fid_eskifiy_tutar != f.fid_yenifiy_tutar
        AND s.sto_pasif_fl = 0
      ORDER BY f.fid_tarih DESC, f.fid_stok_kod, f.fid_fiyat_no
    `;

    const rawChanges = await mikroService.executeQuery(priceChangesQuery);

    // 2. Ürün adı filtresi (SQL'de LIKE performans sorunu olabilir, sonradan filtrele)
    let filteredChanges = rawChanges;
    const productTokens = buildSearchTokens(productName);
    if (productTokens.length > 0) {
      filteredChanges = rawChanges.filter((c: any) => {
        const haystack = normalizeSearchText(c.sto_isim || '');
        return matchesSearchTokens(haystack, productTokens);
      });
    }
    const categoryTokens = buildSearchTokens(category);
    if (categoryTokens.length > 0) {
      filteredChanges = filteredChanges.filter((c: any) => {
        const haystack = normalizeSearchText(c.kategori || '');
        return matchesSearchTokens(haystack, categoryTokens);
      });
    }

    // 3. Ürün + Tarih bazında grupla
    const groupedByProductAndDate: {
      [key: string]: {
        productCode: string;
        productName: string;
        category: string;
        changeDate: Date;
        changes: Array<{
          listNo: number;
          oldPrice: number;
          newPrice: number;
        }>;
      };
    } = {};

    for (const change of filteredChanges) {
      const key = `${change.fid_stok_kod}_${change.fid_tarih.toISOString().split('T')[0]}`;

      if (!groupedByProductAndDate[key]) {
        groupedByProductAndDate[key] = {
          productCode: change.fid_stok_kod,
          productName: change.sto_isim || 'Bilinmiyor',
          category: change.kategori || 'Kategori Yok',
          changeDate: change.fid_tarih,
          changes: [],
        };
      }

      groupedByProductAndDate[key].changes.push({
        listNo: change.fid_fiyat_no,
        oldPrice: change.fid_eskifiy_tutar,
        newPrice: change.fid_yenifiy_tutar,
      });
    }

    // 4. Her grup için PriceChange objesi oluştur
    const priceChanges: PriceChange[] = [];

    for (const key in groupedByProductAndDate) {
      const group = groupedByProductAndDate[key];

      // Consistency check: 10 liste de güncellenmiş mi?
      const updatedLists = group.changes.map(c => c.listNo);
      const isConsistent = updatedLists.length === 10;
      const missingLists = Array.from({ length: 10 }, (_, i) => i + 1)
        .filter(n => !updatedLists.includes(n));

      // PriceListChange'leri oluştur
      const priceListChanges: PriceListChange[] = group.changes.map(c => {
        const changeAmount = c.newPrice - c.oldPrice;
        const changePercent = c.oldPrice > 0
          ? (changeAmount / c.oldPrice) * 100
          : 0;

        return {
          listNo: c.listNo,
          listName: priceListNames[c.listNo] || `Liste ${c.listNo}`,
          oldPrice: c.oldPrice,
          newPrice: c.newPrice,
          changeAmount,
          changePercent,
        };
      });

      // Ortalama değişim yüzdesi
      const avgChangePercent = priceListChanges.length > 0
        ? priceListChanges.reduce((sum, c) => sum + c.changePercent, 0) / priceListChanges.length
        : 0;

      // Değişim yönü
      let direction: 'increase' | 'decrease' | 'mixed' = 'mixed';
      const increases = priceListChanges.filter(c => c.changeAmount > 0).length;
      const decreases = priceListChanges.filter(c => c.changeAmount < 0).length;

      if (increases > 0 && decreases === 0) {
        direction = 'increase';
      } else if (decreases > 0 && increases === 0) {
        direction = 'decrease';
      }

      priceChanges.push({
        productCode: group.productCode,
        productName: group.productName,
        category: group.category,
        changeDate: group.changeDate,
        priceChanges: priceListChanges,
        isConsistent,
        updatedListsCount: updatedLists.length,
        missingLists,
        avgChangePercent,
        changeDirection: direction,
      });
    }

    await mikroService.disconnect();

    // 5. Filtreleme
    let filtered = priceChanges;

    // Consistency filtresi
    if (consistencyStatus === 'consistent') {
      filtered = filtered.filter(c => c.isConsistent);
    } else if (consistencyStatus === 'inconsistent') {
      filtered = filtered.filter(c => !c.isConsistent);
    }

    // Değişim yönü filtresi
    if (changeDirection !== 'all') {
      filtered = filtered.filter(c => c.changeDirection === changeDirection);
    }

    // Min değişim yüzdesi filtresi
    if (minChangePercent !== undefined) {
      filtered = filtered.filter(c => Math.abs(c.avgChangePercent) >= minChangePercent);
    }

    // 6. Sıralama
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;

      if (sortBy === 'changeDate') {
        aValue = a.changeDate.getTime();
        bValue = b.changeDate.getTime();
      } else if (sortBy === 'avgChangePercent') {
        aValue = Math.abs(a.avgChangePercent);
        bValue = Math.abs(b.avgChangePercent);
      } else if (sortBy === 'productName') {
        aValue = a.productName;
        bValue = b.productName;
      } else if (sortBy === 'category') {
        aValue = a.category;
        bValue = b.category;
      } else {
        aValue = a.changeDate.getTime();
        bValue = b.changeDate.getTime();
      }

      if (sortOrder === 'desc') {
        return bValue > aValue ? 1 : bValue < aValue ? -1 : 0;
      } else {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      }
    });

    // 7. Summary istatistikleri
    const totalChanges = filtered.length;
    const consistentChanges = filtered.filter(c => c.isConsistent).length;
    const inconsistentChanges = totalChanges - consistentChanges;
    const inconsistencyRate = totalChanges > 0
      ? (inconsistentChanges / totalChanges) * 100
      : 0;

    const increases = filtered.filter(c => c.avgChangePercent > 0);
    const decreases = filtered.filter(c => c.avgChangePercent < 0);

    const avgIncreasePercent = increases.length > 0
      ? increases.reduce((sum, c) => sum + c.avgChangePercent, 0) / increases.length
      : 0;

    const avgDecreasePercent = decreases.length > 0
      ? decreases.reduce((sum, c) => sum + c.avgChangePercent, 0) / decreases.length
      : 0;

    // En yüksek artışlar
    const topIncreases = [...filtered]
      .filter(c => c.avgChangePercent > 0)
      .sort((a, b) => b.avgChangePercent - a.avgChangePercent)
      .slice(0, 5)
      .map(c => ({
        product: `${c.productCode} - ${c.productName}`,
        percent: c.avgChangePercent,
      }));

    // En yüksek azalışlar
    const topDecreases = [...filtered]
      .filter(c => c.avgChangePercent < 0)
      .sort((a, b) => a.avgChangePercent - b.avgChangePercent)
      .slice(0, 5)
      .map(c => ({
        product: `${c.productCode} - ${c.productName}`,
        percent: c.avgChangePercent,
      }));

    // Son 30 ve 7 gün
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const last30DaysChanges = filtered.filter(c => c.changeDate >= thirtyDaysAgo).length;
    const last7DaysChanges = filtered.filter(c => c.changeDate >= sevenDaysAgo).length;

    // 8. Pagination
    const totalRecords = filtered.length;
    const totalPages = Math.ceil(totalRecords / limit);
    const offset = (page - 1) * limit;
    const paginatedChanges = filtered.slice(offset, offset + limit);

    return {
      changes: paginatedChanges,
      summary: {
        totalChanges,
        consistentChanges,
        inconsistentChanges,
        inconsistencyRate,
        avgIncreasePercent,
        avgDecreasePercent,
        topIncreases,
        topDecreases,
        last30DaysChanges,
        last7DaysChanges,
      },
      pagination: {
        page,
        limit,
        totalPages,
        totalRecords,
      },
      metadata: {
        dataSource: 'MIKRO_STOK_FIYAT_DEGISIKLIKLERI',
      },
    };
  }

  /**
   * Ürün Detay Raporu - Belirli bir ürünün hangi müşterilere satıldığını gösterir
   */
  async getProductCustomers(params: {
    productCode: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      productCode,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = params;

    await mikroService.connect();

    // WHERE koşulları
    const whereConditions = [
      'sth_cins = 0',  // Satış hareketleri
      'sth_tip = 1',    // Normal hareket (fatura/irsaliye)
      `sth_stok_kod = '${productCode}'`,
    ];

    if (startDate) {
      whereConditions.push(`sth_tarih >= '${startDate}'`);
    }
    if (endDate) {
      whereConditions.push(`sth_tarih <= '${endDate}'`);
    }

    // Add exclusion conditions (customer-based exclusions only for this report)
    const exclusionConditions = await exclusionService.buildStokHareketleriExclusionConditions();
    whereConditions.push(...exclusionConditions);

    const whereClause = whereConditions.join(' AND ');

    // Müşteri detaylarını çek
    const query = `
      SELECT
        sth.sth_cari_kodu as customerCode,
        MAX(c.cari_unvan1) as customerName,
        MAX(c.cari_sektor_kodu) as sectorCode,
        COUNT(DISTINCT sth.sth_evrakno_seri + CAST(sth.sth_evrakno_sira AS VARCHAR)) as orderCount,
        SUM(sth.sth_miktar) as totalQuantity,
        SUM(sth.sth_tutar) as totalRevenue,
        SUM(sth.sth_miktar * st.sto_standartmaliyet) as totalCost,
        MAX(sth.sth_tarih) as lastOrderDate
      FROM STOK_HAREKETLERI sth
      LEFT JOIN CARI_HESAPLAR c ON sth.sth_cari_kodu = c.cari_kod
      LEFT JOIN STOKLAR st ON sth.sth_stok_kod = st.sto_kod
      WHERE ${whereClause}
      GROUP BY sth.sth_cari_kodu
      ORDER BY SUM(sth.sth_tutar) DESC
    `;

    const rawData = await mikroService.executeQuery(query);
    await mikroService.disconnect();

    // Kar ve kar marjını hesapla
    const customers = rawData.map((row: any) => ({
      customerCode: row.customerCode,
      customerName: row.customerName || 'Bilinmeyen Müşteri',
      sectorCode: row.sectorCode || '-',
      orderCount: row.orderCount,
      totalQuantity: parseFloat(row.totalQuantity || 0),
      totalRevenue: parseFloat(row.totalRevenue || 0),
      totalCost: parseFloat(row.totalCost || 0),
      totalProfit: parseFloat(row.totalRevenue || 0) - parseFloat(row.totalCost || 0),
      profitMargin: parseFloat(row.totalRevenue || 0) > 0
        ? ((parseFloat(row.totalRevenue || 0) - parseFloat(row.totalCost || 0)) / parseFloat(row.totalRevenue || 0)) * 100
        : 0,
      lastOrderDate: row.lastOrderDate,
    }));

    // Summary
    const totalRevenue = customers.reduce((sum, c) => sum + c.totalRevenue, 0);
    const totalProfit = customers.reduce((sum, c) => sum + c.totalProfit, 0);
    const totalQuantity = customers.reduce((sum, c) => sum + c.totalQuantity, 0);
    const avgProfitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    // Pagination
    const totalRecords = customers.length;
    const totalPages = Math.ceil(totalRecords / limit);
    const offset = (page - 1) * limit;
    const paginatedCustomers = customers.slice(offset, offset + limit);

    return {
      customers: paginatedCustomers,
      summary: {
        totalCustomers: totalRecords,
        totalQuantity,
        totalRevenue,
        totalProfit,
        avgProfitMargin,
      },
      pagination: {
        page,
        limit,
        totalPages,
        totalRecords,
      },
    };
  }
}

export default new ReportsService();
