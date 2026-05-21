import * as XLSX from 'xlsx';
import https from 'https';
import { OrderStatus, QuoteStatus, UserRole } from '@prisma/client';
import { prisma } from '../utils/prisma';
import mikroService from './mikroFactory.service';
import exclusionService from './exclusion.service';
import notificationService from './notification.service';

type RiskType = 'NO_RECENT_SALES' | 'INSIGNIFICANT_ACTIVITY' | 'DECLINING' | 'WATCH';
type SortBy = 'riskScore' | 'lostPotential' | 'dropPercent' | 'lastSaleDate' | 'historicalAverage' | 'recentAverage' | 'customerName';
type SortDirection = 'asc' | 'desc';
type SeasonalityMode = 'include' | 'exclude' | 'only';
type SeasonalityStatus = 'ON_TRACK' | 'OVERDUE' | null;
type PurchasePattern = 'ALL' | 'FREQUENT' | 'PERIODIC' | 'SPORADIC';
type HistoricalValueSortBy = 'lostPotentialAdjusted' | 'peakAdjustedAmount' | 'totalRawAmount' | 'totalAdjustedAmount' | 'lastSaleDate' | 'maxConsecutiveActiveMonths' | 'customerName';

interface ReportOptions {
  recentMonths?: number;
  baselineMonths?: number;
  minDropPercent?: number;
  minHistoricalActiveMonths?: number;
  minHistoricalAmount?: number;
  minMeaningfulMonthlyAmount?: number;
  includeCurrentMonth?: boolean;
  customerCode?: string;
  search?: string;
  resultSearch?: string;
  sectorCode?: string;
  assignedToId?: string;
  riskTypes?: string;
  onlyWithOpenAction?: boolean;
  onlyDueFollowUp?: boolean;
  minLostPotential?: number;
  seasonalityMode?: SeasonalityMode | string;
  purchasePattern?: PurchasePattern | string;
  page?: number;
  limit?: number;
  sortBy?: SortBy;
  sortDirection?: SortDirection;
}

interface HistoricalValueOptions {
  startYear?: number;
  inactiveMonths?: number;
  minConsecutiveMonths?: number;
  minMonthlyAmount?: number;
  minTotalAdjustedAmount?: number;
  onlyLostFrequent?: boolean;
  customerCode?: string;
  search?: string;
  sectorCode?: string;
  page?: number;
  limit?: number;
  sortBy?: HistoricalValueSortBy;
  sortDirection?: SortDirection;
}

interface RequestContext {
  userId?: string;
  role?: string;
  assignedSectorCodes?: string[];
}

interface MonthlyBucket {
  amount: number;
  quantity: number;
  documentCount: number;
  lastSaleDate: string | null;
}

interface RecoveryRow {
  customerCode: string;
  customerName: string | null;
  sectorCode: string | null;
  city: string | null;
  district: string | null;
  phone: string | null;
  balance: number;
  assignedSalesRep: { id: string; name: string; email?: string | null } | null;
  riskType: RiskType;
  riskLabels: string[];
  riskScore: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  lastSaleDate: string | null;
  daysSinceLastSale: number | null;
  historicalActiveMonths: number;
  historicalDocumentCount: number;
  historicalAmount: number;
  historicalAverage: number;
  historicalMedian: number;
  recentActiveMonths: number;
  recentDocumentCount: number;
  recentAmount: number;
  recentAverage: number;
  dropPercent: number;
  seasonalAverage: number | null;
  seasonalDropPercent: number | null;
  isSeasonal: boolean;
  seasonalityScore: number;
  seasonalityReason: string | null;
  seasonalityStatus: SeasonalityStatus;
  averagePurchaseIntervalMonths: number | null;
  monthsSinceLastMeaningfulPurchase: number | null;
  seasonalOverdueMonths: number | null;
  purchasePattern: Exclude<PurchasePattern, 'ALL'>;
  maxConsecutiveHistoricalActiveMonths: number;
  historicalActiveRatio: number;
  lostPotential: number;
  openQuoteCount: number;
  openOrderCount: number;
  topLostCategory: {
    categoryCode: string;
    categoryName: string;
    historicalAmount: number;
    recentAmount: number;
    lostAmount: number;
  } | null;
  topLostProduct: {
    productCode: string;
    productName: string;
    historicalAmount: number;
    recentAmount: number;
    lostAmount: number;
    lastPurchaseDate: string | null;
  } | null;
  lastPurchasedProduct: {
    productCode: string;
    productName: string;
    lastPurchaseDate: string | null;
    amount: number;
  } | null;
  recommendedAction: string;
  lastAction: any | null;
  openActionCount: number;
  overdueActionCount: number;
  nextFollowUpDate: string | null;
  developmentStatus: 'RECOVERED' | 'IMPROVED' | 'UNCHANGED' | 'WORSENED' | 'NO_ACTION';
  postActionAmount: number;
  postActionDocumentCount: number;
  monthlySales: Array<{ month: string; amount: number; documentCount: number }>;
}

interface HistoricalValueRow {
  customerCode: string;
  customerName: string | null;
  sectorCode: string | null;
  city: string | null;
  district: string | null;
  phone: string | null;
  balance: number;
  assignedSalesRep: { id: string; name: string; email?: string | null } | null;
  firstSaleDate: string | null;
  lastSaleDate: string | null;
  monthsSinceLastActive: number | null;
  activeMonths: number;
  documentCount: number;
  totalRawAmount: number;
  totalAdjustedAmount: number;
  averageAdjustedActiveMonth: number;
  maxConsecutiveActiveMonths: number;
  latestConsecutiveStreak: {
    startMonth: string;
    endMonth: string;
    months: number;
    adjustedAmount: number;
    averageAdjustedAmount: number;
  } | null;
  peakMonth: {
    month: string;
    amount: number;
    adjustedAmount: number;
    usdRate: number | null;
  } | null;
  lastActiveMonth: {
    month: string;
    amount: number;
    adjustedAmount: number;
    usdRate: number | null;
  } | null;
  lostAfterConsecutiveActivity: boolean;
  lostPotentialAdjusted: number;
  monthlySales: Array<{
    month: string;
    amount: number;
    adjustedAmount: number;
    usdRate: number | null;
    documentCount: number;
    active: boolean;
  }>;
  topMonths: Array<{
    month: string;
    amount: number;
    adjustedAmount: number;
    usdRate: number | null;
  }>;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const toNumber = (value: any, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const normalizeCode = (value?: string | null) => String(value || '').trim().toUpperCase();
const escapeSqlLiteral = (value: string) => String(value || '').replace(/'/g, "''");
const formatDateKey = (date: Date) => date.toISOString().slice(0, 10);
const formatDateCompact = (date: Date) => formatDateKey(date).replace(/-/g, '');
const formatMonthKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
const parseMonthKey = (monthKey: string) => {
  const [year, month] = String(monthKey || '').split('-').map((part) => Number(part));
  if (!year || !month) return null;
  return new Date(Date.UTC(year, month - 1, 1));
};

const startOfMonthUtc = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
const endOfMonthUtc = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
const addMonthsUtc = (date: Date, months: number) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
const monthDiff = (fromMonthKey: string, toMonthKey: string) => {
  const from = parseMonthKey(fromMonthKey);
  const to = parseMonthKey(toMonthKey);
  if (!from || !to) return 0;
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
};
const buildMonthKeysInclusive = (start: Date, end: Date) => {
  const keys: string[] = [];
  let cursor = startOfMonthUtc(start);
  const endMonth = startOfMonthUtc(end);
  while (cursor <= endMonth) {
    keys.push(formatMonthKey(cursor));
    cursor = addMonthsUtc(cursor, 1);
  }
  return keys;
};
const chunkArray = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};
const average = (values: number[]) => values.length > 0
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : 0;

const maxConsecutiveTrue = (values: boolean[]) => {
  let current = 0;
  let max = 0;
  values.forEach((value) => {
    current = value ? current + 1 : 0;
    max = Math.max(max, current);
  });
  return max;
};

const compactDateToDisplay = (value: any) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatDateKey(date);
};

const median = (values: number[]) => {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
};

const parseBoolean = (value?: boolean) => Boolean(value);
const parseLooseBoolean = (value: any) => value === true || value === 1 || String(value || '').toLowerCase() === 'true';
const TCMB_USD_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml';
const USD_RATE_CACHE_MS = 60 * 60 * 1000;
const HISTORICAL_VALUE_CACHE_MS = 10 * 60 * 1000;
let customerRecoveryUsdRateCache: { rate: number; source: string; fetchedAt: number } | null = null;
const historicalValueReportCache = new Map<string, {
  expiresAt: number;
  rows: HistoricalValueRow[];
  usdRate: { rate: number; source: string; fetchedAt: string };
}>();

class CustomerRecoveryService {
  private normalizeHistoricalValueOptions(options: HistoricalValueOptions) {
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const startYear = clamp(Math.floor(toNumber(options.startYear, 2020)), 2000, currentYear);
    const page = Math.max(1, Math.floor(toNumber(options.page, 1)));
    const limit = clamp(Math.floor(toNumber(options.limit, 50)), 1, 500);
    const sortBy: HistoricalValueSortBy = options.sortBy || 'lostPotentialAdjusted';
    const sortDirection: SortDirection = options.sortDirection === 'asc' ? 'asc' : 'desc';
    const startDate = new Date(Date.UTC(startYear, 0, 1));
    const endDate = now;
    const allMonthKeys = buildMonthKeysInclusive(startDate, endDate);

    return {
      startYear,
      inactiveMonths: clamp(Math.floor(toNumber(options.inactiveMonths, 3)), 1, 36),
      minConsecutiveMonths: clamp(Math.floor(toNumber(options.minConsecutiveMonths, 3)), 2, 24),
      minMonthlyAmount: Math.max(0, toNumber(options.minMonthlyAmount, 5000)),
      minTotalAdjustedAmount: Math.max(0, toNumber(options.minTotalAdjustedAmount, 0)),
      onlyLostFrequent: options.onlyLostFrequent === undefined ? true : Boolean(options.onlyLostFrequent),
      customerCode: normalizeCode(options.customerCode),
      search: String(options.search || '').trim(),
      sectorCode: normalizeCode(options.sectorCode),
      page,
      limit,
      sortBy,
      sortDirection,
      startDate,
      endDate,
      currentMonthKey: formatMonthKey(endDate),
      allMonthKeys,
    };
  }

  private buildHistoricalValueCacheKey(
    normalized: ReturnType<CustomerRecoveryService['normalizeHistoricalValueOptions']>,
    context?: RequestContext
  ) {
    return JSON.stringify({
      startYear: normalized.startYear,
      inactiveMonths: normalized.inactiveMonths,
      minConsecutiveMonths: normalized.minConsecutiveMonths,
      minMonthlyAmount: normalized.minMonthlyAmount,
      customerCode: normalized.customerCode,
      search: normalized.search,
      sectorCode: normalized.sectorCode,
      role: context?.role || null,
      userId: context?.userId || null,
      assignedSectorCodes: (context?.assignedSectorCodes || []).map(normalizeCode).sort(),
    });
  }

  private normalizeOptions(options: ReportOptions) {
    const recentMonths = clamp(Math.floor(toNumber(options.recentMonths, 3)), 1, 12);
    const baselineMonths = clamp(Math.floor(toNumber(options.baselineMonths, 18)), 3, 48);
    const minDropPercent = clamp(toNumber(options.minDropPercent, 50), 1, 99);
    const minHistoricalActiveMonths = clamp(Math.floor(toNumber(options.minHistoricalActiveMonths, 2)), 1, 24);
    const minHistoricalAmount = Math.max(0, toNumber(options.minHistoricalAmount, 1000));
    const minMeaningfulMonthlyAmount = Math.max(0, toNumber(options.minMeaningfulMonthlyAmount, 1000));
    const minLostPotential = Math.max(0, toNumber(options.minLostPotential, 0));
    const page = Math.max(1, Math.floor(toNumber(options.page, 1)));
    const limit = clamp(Math.floor(toNumber(options.limit, 50)), 1, 5000);
    const sortBy: SortBy = options.sortBy || 'riskScore';
    const sortDirection: SortDirection = options.sortDirection === 'asc' ? 'asc' : 'desc';
    const seasonalityModeValue = String(options.seasonalityMode || 'include').toLowerCase();
    const seasonalityMode: SeasonalityMode = seasonalityModeValue === 'exclude'
      ? 'exclude'
      : seasonalityModeValue === 'only'
        ? 'only'
        : 'include';
    const purchasePatternValue = String(options.purchasePattern || 'ALL').toUpperCase();
    const purchasePattern: PurchasePattern = purchasePatternValue === 'FREQUENT'
      ? 'FREQUENT'
      : purchasePatternValue === 'PERIODIC'
        ? 'PERIODIC'
        : purchasePatternValue === 'SPORADIC'
          ? 'SPORADIC'
          : 'ALL';

    const now = new Date();
    const reportEnd = parseBoolean(options.includeCurrentMonth)
      ? now
      : endOfMonthUtc(addMonthsUtc(startOfMonthUtc(now), -1));
    const reportEndMonthStart = startOfMonthUtc(reportEnd);
    const recentStart = addMonthsUtc(reportEndMonthStart, -(recentMonths - 1));
    const baselineStart = addMonthsUtc(recentStart, -baselineMonths);
    const queryEnd = parseBoolean(options.includeCurrentMonth) ? now : endOfMonthUtc(reportEndMonthStart);

    const baselineMonthKeys = Array.from({ length: baselineMonths }, (_, index) =>
      formatMonthKey(addMonthsUtc(baselineStart, index))
    );
    const recentMonthKeys = Array.from({ length: recentMonths }, (_, index) =>
      formatMonthKey(addMonthsUtc(recentStart, index))
    );
    const allMonthKeys = [...baselineMonthKeys, ...recentMonthKeys];

    return {
      recentMonths,
      baselineMonths,
      minDropPercent,
      minHistoricalActiveMonths,
      minHistoricalAmount,
      minMeaningfulMonthlyAmount,
      page,
      limit,
      sortBy,
      sortDirection,
      reportEnd,
      queryEnd,
      recentStart,
      baselineStart,
      baselineMonthKeys,
      recentMonthKeys,
      allMonthKeys,
      customerCode: normalizeCode(options.customerCode),
      search: String(options.search || '').trim(),
      resultSearch: String(options.resultSearch || '').trim(),
      sectorCode: normalizeCode(options.sectorCode),
      assignedToId: String(options.assignedToId || '').trim(),
      riskTypeSet: new Set(
        String(options.riskTypes || '')
          .split(',')
          .map((item) => item.trim().toUpperCase())
          .filter(Boolean)
      ),
      onlyWithOpenAction: Boolean(options.onlyWithOpenAction),
      onlyDueFollowUp: Boolean(options.onlyDueFollowUp),
      minLostPotential,
      seasonalityMode,
      purchasePattern,
      includeCurrentMonth: Boolean(options.includeCurrentMonth),
    };
  }

  private emptyBucket(): MonthlyBucket {
    return { amount: 0, quantity: 0, documentCount: 0, lastSaleDate: null };
  }

  private buildBaseWhere(extra: string[], context?: RequestContext) {
    const conditions = [
      'sth.sth_cins = 0',
      'sth.sth_tip = 1',
      'sth.sth_evraktip IN (1, 4)',
      '(sth.sth_iptal = 0 OR sth.sth_iptal IS NULL)',
      'sth.sth_stok_kod IS NOT NULL',
      "LTRIM(RTRIM(sth.sth_stok_kod)) <> ''",
      'sth.sth_cari_kodu IS NOT NULL',
      "LTRIM(RTRIM(sth.sth_cari_kodu)) <> ''",
      "UPPER(LTRIM(RTRIM(ISNULL(c.cari_sektor_kodu, '')))) <> 'FATURA'",
    ];

    const assignedSectorCodes = (context?.role === 'SALES_REP' ? context?.assignedSectorCodes || [] : [])
      .map(normalizeCode)
      .filter(Boolean);
    if (context?.role === 'SALES_REP') {
      if (assignedSectorCodes.length === 0) {
        conditions.push('1 = 0');
      } else {
        conditions.push(`RTRIM(c.cari_sektor_kodu) IN (${assignedSectorCodes.map((code) => `'${escapeSqlLiteral(code)}'`).join(', ')})`);
      }
    }

    return [...conditions, ...extra];
  }

  private async resolveCandidateCustomerCodes(
    normalized: ReturnType<CustomerRecoveryService['normalizeOptions']>,
    context?: RequestContext
  ) {
    if (normalized.customerCode) return [normalized.customerCode];
    if (normalized.sectorCode === 'FATURA') return [];

    const assignedSectorCodes = (context?.role === 'SALES_REP' ? context?.assignedSectorCodes || [] : [])
      .map(normalizeCode)
      .filter(Boolean);
    if (context?.role === 'SALES_REP' && assignedSectorCodes.length === 0) return [];

    const customers = await prisma.user.findMany({
      where: {
        role: UserRole.CUSTOMER,
        mikroCariCode: { not: null },
        NOT: { sectorCode: { in: ['FATURA', 'Fatura', 'fatura'] } },
        ...(normalized.sectorCode ? { sectorCode: normalized.sectorCode } : {}),
        ...(context?.role === 'SALES_REP' ? { sectorCode: { in: assignedSectorCodes } } : {}),
      },
      select: { mikroCariCode: true },
    });

    return Array.from(
      new Set(customers.map((customer) => normalizeCode(customer.mikroCariCode)).filter(Boolean))
    );
  }

  private calculateSeasonality(
    entryMonths: Map<string, MonthlyBucket>,
    normalized: ReturnType<CustomerRecoveryService['normalizeOptions']>
  ) {
    const activeIndexes = normalized.allMonthKeys
      .map((month, index) => ({ month, index, amount: entryMonths.get(month)?.amount || 0 }))
      .filter((item) => item.amount >= normalized.minMeaningfulMonthlyAmount);

    if (activeIndexes.length < 2) {
      return {
        isSeasonal: false,
        seasonalityScore: 0,
        seasonalityReason: null,
        seasonalityStatus: null as SeasonalityStatus,
        averagePurchaseIntervalMonths: null,
        monthsSinceLastMeaningfulPurchase: activeIndexes.length === 1
          ? normalized.allMonthKeys.length - 1 - activeIndexes[0].index
          : null,
        seasonalOverdueMonths: null,
      };
    }

    const activeRatio = activeIndexes.length / normalized.allMonthKeys.length;
    const gaps = activeIndexes.slice(1).map((item, index) => item.index - activeIndexes[index].index);
    const maxGap = gaps.length > 0 ? Math.max(...gaps) : normalized.allMonthKeys.length;
    const minGap = gaps.length > 0 ? Math.min(...gaps) : maxGap;
    const averageGap = average(gaps);
    const roundedAverageGap = Math.max(1, Math.round(averageGap));
    const maxDeviation = gaps.length > 0
      ? Math.max(...gaps.map((gap) => Math.abs(gap - averageGap)))
      : 0;
    const tolerance = Math.max(1, Math.round(averageGap * 0.25));
    const overdueThreshold = Math.ceil(averageGap + tolerance);
    const lastActiveIndex = activeIndexes[activeIndexes.length - 1].index;
    const monthsSinceLastMeaningfulPurchase = normalized.allMonthKeys.length - 1 - lastActiveIndex;
    const calendarMonthCounts = activeIndexes.reduce<Record<string, number>>((acc, item) => {
      const monthPart = item.month.slice(5, 7);
      acc[monthPart] = (acc[monthPart] || 0) + 1;
      return acc;
    }, {});
    const repeatedCalendarMonthCount = Object.values(calendarMonthCounts).filter((count) => count >= 2).length;
    const hasRegularInterval = gaps.length >= 2 && averageGap >= 3 && maxDeviation <= Math.max(1, averageGap * 0.35);
    const hasSparsePeriodicRhythm = activeRatio <= 0.4 && averageGap >= 3 && maxGap - minGap <= Math.max(2, tolerance + 1);
    const isOverdue = monthsSinceLastMeaningfulPurchase > overdueThreshold;
    const score = clamp(
      Math.round(
        (1 - activeRatio) * 45 +
        clamp(averageGap * 7, 0, 35) +
        repeatedCalendarMonthCount * 12 +
        (hasRegularInterval ? 15 : 0) +
        (isOverdue ? 12 : 0)
      ),
      0,
      100
    );
    const isSeasonal = averageGap >= 3 &&
      (hasRegularInterval || hasSparsePeriodicRhythm || repeatedCalendarMonthCount > 0) &&
      score >= 50;

    let reason: string | null = null;
    if (isSeasonal) {
      if (isOverdue) {
        reason = `Yaklasik ${roundedAverageGap} ayda bir alim ritmi var; son anlamli alimin uzerinden ${monthsSinceLastMeaningfulPurchase} ay gecti`;
      } else if (hasRegularInterval || hasSparsePeriodicRhythm) {
        reason = `Yaklasik ${roundedAverageGap} ayda bir alim ritmi var; ${monthsSinceLastMeaningfulPurchase} ay tolerans icinde`;
      } else if (repeatedCalendarMonthCount > 0) {
        reason = 'Benzer takvim aylarinda tekrar eden alim var';
      } else {
        reason = `Alimlar seyrek; en uzun bosluk ${maxGap} ay`;
      }
    }

    return {
      isSeasonal,
      seasonalityScore: isSeasonal ? score : 0,
      seasonalityReason: reason,
      seasonalityStatus: isSeasonal ? (isOverdue ? 'OVERDUE' : 'ON_TRACK') as SeasonalityStatus : null,
      averagePurchaseIntervalMonths: isSeasonal ? Number(averageGap.toFixed(1)) : null,
      monthsSinceLastMeaningfulPurchase,
      seasonalOverdueMonths: isSeasonal && isOverdue ? monthsSinceLastMeaningfulPurchase - overdueThreshold : null,
    };
  }

  private async fetchMonthlySales(normalized: ReturnType<CustomerRecoveryService['normalizeOptions']>, context?: RequestContext) {
    const connect = (mikroService as any).connect;
    if (typeof connect === 'function') {
      await connect.call(mikroService);
    }
    const exclusionConditions = await exclusionService.buildStokHareketleriExclusionConditions();
    const candidateCodes = await this.resolveCandidateCustomerCodes(normalized, context);
    if (candidateCodes.length === 0) return [];

    const rows: any[] = [];
    for (const chunk of chunkArray(candidateCodes, 150)) {
      const customerList = chunk.map((code) => `'${escapeSqlLiteral(code)}'`).join(', ');
      const extra = [
        `sth.sth_tarih >= '${formatDateCompact(normalized.baselineStart)}'`,
        `sth.sth_tarih <= '${formatDateCompact(normalized.queryEnd)}'`,
        `RTRIM(sth.sth_cari_kodu) IN (${customerList})`,
        ...exclusionConditions,
      ];
      if (normalized.sectorCode) {
        extra.push(`RTRIM(c.cari_sektor_kodu) = '${escapeSqlLiteral(normalized.sectorCode)}'`);
      }

      const whereClause = this.buildBaseWhere(extra, context).join(' AND ');
      const query = `
        SELECT
          RTRIM(sth.sth_cari_kodu) as customerCode,
          MAX(NULLIF(LTRIM(RTRIM(ISNULL(c.cari_unvan1, '') + ' ' + ISNULL(c.cari_unvan2, ''))), '')) as customerName,
          MAX(RTRIM(c.cari_sektor_kodu)) as sectorCode,
          CONVERT(char(7), sth.sth_tarih, 120) as monthKey,
          SUM(CASE WHEN ISNULL(sth.sth_normal_iade, 0) = 1 THEN -ABS(ISNULL(sth.sth_tutar, 0)) ELSE ISNULL(sth.sth_tutar, 0) END) as amount,
          SUM(CASE WHEN ISNULL(sth.sth_normal_iade, 0) = 1 THEN -ABS(ISNULL(sth.sth_miktar, 0)) ELSE ISNULL(sth.sth_miktar, 0) END) as quantity,
          COUNT(DISTINCT RTRIM(sth.sth_evrakno_seri) + '-' + CAST(sth.sth_evrakno_sira AS VARCHAR(30))) as documentCount,
          MAX(sth.sth_tarih) as lastSaleDate
        FROM STOK_HAREKETLERI sth WITH (NOLOCK)
        LEFT JOIN CARI_HESAPLAR c WITH (NOLOCK) ON sth.sth_cari_kodu = c.cari_kod
        LEFT JOIN STOKLAR st WITH (NOLOCK) ON sth.sth_stok_kod = st.sto_kod
        WHERE ${whereClause}
        GROUP BY sth.sth_cari_kodu, CONVERT(char(7), sth.sth_tarih, 120)
      `;

      const chunkRows = await mikroService.executeQuery(query);
      rows.push(...chunkRows);
    }

    return rows;
  }

  private fetchTcmbUsdRate() {
    return new Promise<number>((resolve, reject) => {
      const request = https.get(TCMB_USD_URL, (response) => {
        if (response.statusCode && response.statusCode >= 400) {
          response.resume();
          reject(new Error(`TCMB request failed with status ${response.statusCode}`));
          return;
        }

        response.setEncoding('utf8');
        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => {
          const currencyMatch = data.match(/<Currency[^>]*(?:CurrencyCode|Kod)="USD"[^>]*>([\s\S]*?)<\/Currency>/);
          const currencyBlock = currencyMatch?.[1] || '';
          const sellingMatch =
            currencyBlock.match(/<ForexSelling>([^<]+)<\/ForexSelling>/) ||
            currencyBlock.match(/<BanknoteSelling>([^<]+)<\/BanknoteSelling>/);
          const rate = Number(String(sellingMatch?.[1] || '').trim().replace(',', '.'));
          if (Number.isFinite(rate) && rate > 0) {
            resolve(rate);
            return;
          }
          reject(new Error('TCMB USD rate not found'));
        });
      });

      request.setTimeout(8000, () => {
        request.destroy(new Error('TCMB request timeout'));
      });
      request.on('error', reject);
    });
  }

  private async fetchLatestMikroUsdRate() {
    const connect = (mikroService as any).connect;
    if (typeof connect === 'function') {
      await connect.call(mikroService);
    }
    const rows = await mikroService.executeQuery(`
      SELECT TOP 1 CAST(sth_alt_doviz_kuru AS FLOAT) as rate
      FROM STOK_HAREKETLERI WITH (NOLOCK)
      WHERE ISNULL(sth_alt_doviz_kuru, 0) > 1
      ORDER BY sth_tarih DESC
    `);
    const rate = toNumber(rows?.[0]?.rate, 0);
    return rate > 0 ? rate : null;
  }

  private async getCurrentUsdTryRate() {
    const now = Date.now();
    if (customerRecoveryUsdRateCache && now - customerRecoveryUsdRateCache.fetchedAt < USD_RATE_CACHE_MS) {
      return {
        rate: customerRecoveryUsdRateCache.rate,
        source: customerRecoveryUsdRateCache.source,
        fetchedAt: new Date(customerRecoveryUsdRateCache.fetchedAt).toISOString(),
      };
    }

    try {
      const rate = await this.fetchTcmbUsdRate();
      customerRecoveryUsdRateCache = { rate, source: 'TCMB', fetchedAt: now };
      return {
        rate,
        source: 'TCMB',
        fetchedAt: new Date(now).toISOString(),
      };
    } catch (tcmbError) {
      const fallbackRate = await this.fetchLatestMikroUsdRate();
      if (!fallbackRate) throw tcmbError;
      customerRecoveryUsdRateCache = { rate: fallbackRate, source: 'MIKRO_LAST_MOVEMENT', fetchedAt: now };
      return {
        rate: fallbackRate,
        source: 'MIKRO_LAST_MOVEMENT',
        fetchedAt: new Date(now).toISOString(),
      };
    }
  }

  private async fetchHistoricalValueMonthlySales(
    normalized: ReturnType<CustomerRecoveryService['normalizeHistoricalValueOptions']>,
    context?: RequestContext
  ) {
    const connect = (mikroService as any).connect;
    if (typeof connect === 'function') {
      await connect.call(mikroService);
    }
    const exclusionConditions = await exclusionService.buildStokHareketleriExclusionConditions();
    const candidateFilter = this.normalizeOptions({
      customerCode: normalized.customerCode,
      search: normalized.search,
      sectorCode: normalized.sectorCode,
      limit: normalized.limit,
      page: normalized.page,
    });
    const candidateCodes = await this.resolveCandidateCustomerCodes(candidateFilter, context);
    if (candidateCodes.length === 0) return [];

    const rows: any[] = [];
    for (const chunk of chunkArray(candidateCodes, 150)) {
      const customerList = chunk.map((code) => `'${escapeSqlLiteral(code)}'`).join(', ');
      const extra = [
        `sth.sth_tarih >= '${formatDateCompact(normalized.startDate)}'`,
        `sth.sth_tarih <= '${formatDateCompact(normalized.endDate)}'`,
        `RTRIM(sth.sth_cari_kodu) IN (${customerList})`,
        ...exclusionConditions,
      ];
      if (normalized.sectorCode) {
        extra.push(`RTRIM(c.cari_sektor_kodu) = '${escapeSqlLiteral(normalized.sectorCode)}'`);
      }

      const whereClause = this.buildBaseWhere(extra, context).join(' AND ');
      const query = `
        WITH movements AS (
          SELECT
            RTRIM(sth.sth_cari_kodu) as customerCode,
            NULLIF(LTRIM(RTRIM(ISNULL(c.cari_unvan1, '') + ' ' + ISNULL(c.cari_unvan2, ''))), '') as customerName,
            RTRIM(c.cari_sektor_kodu) as sectorCode,
            CONVERT(char(7), sth.sth_tarih, 120) as monthKey,
            sth.sth_tarih as saleDate,
            CASE WHEN ISNULL(sth.sth_normal_iade, 0) = 1 THEN -ABS(ISNULL(sth.sth_tutar, 0)) ELSE ISNULL(sth.sth_tutar, 0) END as amount,
            CASE WHEN ISNULL(sth.sth_normal_iade, 0) = 1 THEN -ABS(ISNULL(sth.sth_miktar, 0)) ELSE ISNULL(sth.sth_miktar, 0) END as quantity,
            NULLIF(CAST(ISNULL(sth.sth_alt_doviz_kuru, 0) AS FLOAT), 0) as usdRate,
            LTRIM(RTRIM(ISNULL(sth.sth_evrakno_seri, ''))) + '-' + CAST(ISNULL(sth.sth_evrakno_sira, 0) AS VARCHAR(30)) as documentNo
          FROM STOK_HAREKETLERI sth WITH (NOLOCK)
          LEFT JOIN CARI_HESAPLAR c WITH (NOLOCK) ON sth.sth_cari_kodu = c.cari_kod
          LEFT JOIN STOKLAR st WITH (NOLOCK) ON sth.sth_stok_kod = st.sto_kod
          WHERE ${whereClause}
        )
        SELECT
          customerCode,
          MAX(customerName) as customerName,
          MAX(sectorCode) as sectorCode,
          monthKey,
          SUM(amount) as amount,
          SUM(quantity) as quantity,
          COUNT(DISTINCT documentNo) as documentCount,
          MIN(saleDate) as firstSaleDate,
          MAX(saleDate) as lastSaleDate,
          CASE
            WHEN SUM(CASE WHEN usdRate IS NOT NULL THEN ABS(amount) ELSE 0 END) > 0
              THEN SUM(CASE WHEN usdRate IS NOT NULL THEN ABS(amount) * usdRate ELSE 0 END)
                / NULLIF(SUM(CASE WHEN usdRate IS NOT NULL THEN ABS(amount) ELSE 0 END), 0)
            ELSE NULL
          END as historicalUsdRate
        FROM movements
        GROUP BY customerCode, monthKey
        HAVING ABS(SUM(amount)) > 0
      `;

      const chunkRows = await mikroService.executeQuery(query);
      rows.push(...chunkRows);
    }

    return rows;
  }

  private buildHistoricalValueRows(
    monthlyRows: any[],
    normalized: ReturnType<CustomerRecoveryService['normalizeHistoricalValueOptions']>,
    currentUsdTryRate: number
  ): HistoricalValueRow[] {
    const entryByCustomer = new Map<string, {
      customerCode: string;
      customerName: string | null;
      sectorCode: string | null;
      firstSaleDate: string | null;
      lastSaleDate: string | null;
      months: Map<string, {
        amount: number;
        adjustedAmount: number;
        usdRate: number | null;
        documentCount: number;
      }>;
    }>();

    monthlyRows.forEach((row) => {
      const customerCode = normalizeCode(row.customerCode);
      const monthKey = String(row.monthKey || '').slice(0, 7);
      if (!customerCode || !monthKey) return;
      const amount = toNumber(row.amount, 0);
      const usdRate = toNumber(row.historicalUsdRate, 0);
      const effectiveRate = usdRate > 0 ? usdRate : null;
      const adjustedAmount = effectiveRate && currentUsdTryRate > 0
        ? amount * (currentUsdTryRate / effectiveRate)
        : amount;
      const current = entryByCustomer.get(customerCode) || {
        customerCode,
        customerName: row.customerName || null,
        sectorCode: row.sectorCode || null,
        firstSaleDate: null,
        lastSaleDate: null,
        months: new Map(),
      };

      current.customerName = current.customerName || row.customerName || null;
      current.sectorCode = current.sectorCode || row.sectorCode || null;
      const firstSaleDate = compactDateToDisplay(row.firstSaleDate);
      const lastSaleDate = compactDateToDisplay(row.lastSaleDate);
      if (firstSaleDate && (!current.firstSaleDate || firstSaleDate < current.firstSaleDate)) {
        current.firstSaleDate = firstSaleDate;
      }
      if (lastSaleDate && (!current.lastSaleDate || lastSaleDate > current.lastSaleDate)) {
        current.lastSaleDate = lastSaleDate;
      }
      current.months.set(monthKey, {
        amount,
        adjustedAmount,
        usdRate: effectiveRate,
        documentCount: Math.floor(toNumber(row.documentCount, 0)),
      });
      entryByCustomer.set(customerCode, current);
    });

    return Array.from(entryByCustomer.values()).map((entry) => {
      const monthlySales = normalized.allMonthKeys.map((month) => {
        const bucket = entry.months.get(month) || {
          amount: 0,
          adjustedAmount: 0,
          usdRate: null,
          documentCount: 0,
        };
        return {
          month,
          amount: bucket.amount,
          adjustedAmount: bucket.adjustedAmount,
          usdRate: bucket.usdRate,
          documentCount: bucket.documentCount,
          active: bucket.adjustedAmount >= normalized.minMonthlyAmount,
        };
      });
      const activeMonths = monthlySales.filter((month) => month.active);
      const activeIndexes = monthlySales
        .map((month, index) => ({ ...month, index }))
        .filter((month) => month.active);
      const streaks: Array<{ startIndex: number; endIndex: number; months: number; adjustedAmount: number }> = [];
      let streakStart: number | null = null;
      let streakAmount = 0;
      monthlySales.forEach((month, index) => {
        if (month.active) {
          if (streakStart === null) {
            streakStart = index;
            streakAmount = 0;
          }
          streakAmount += month.adjustedAmount;
          return;
        }
        if (streakStart !== null) {
          streaks.push({
            startIndex: streakStart,
            endIndex: index - 1,
            months: index - streakStart,
            adjustedAmount: streakAmount,
          });
          streakStart = null;
          streakAmount = 0;
        }
      });
      if (streakStart !== null) {
        streaks.push({
          startIndex: streakStart,
          endIndex: monthlySales.length - 1,
          months: monthlySales.length - streakStart,
          adjustedAmount: streakAmount,
        });
      }

      const qualifyingStreaks = streaks.filter((streak) => streak.months >= normalized.minConsecutiveMonths);
      const latestConsecutive = qualifyingStreaks
        .slice()
        .sort((a, b) => b.endIndex - a.endIndex || b.adjustedAmount - a.adjustedAmount)[0] || null;
      const maxStreak = streaks
        .slice()
        .sort((a, b) => b.months - a.months || b.adjustedAmount - a.adjustedAmount)[0] || null;
      const lastActiveIndex = activeIndexes.length > 0 ? activeIndexes[activeIndexes.length - 1].index : null;
      const monthsSinceLastActive = lastActiveIndex === null
        ? null
        : monthDiff(monthlySales[lastActiveIndex].month, normalized.currentMonthKey);
      const lostAfterConsecutiveActivity = Boolean(
        latestConsecutive &&
        monthsSinceLastActive !== null &&
        monthsSinceLastActive >= normalized.inactiveMonths
      );
      const peakMonth = monthlySales
        .filter((month) => month.adjustedAmount > 0)
        .sort((a, b) => b.adjustedAmount - a.adjustedAmount)[0] || null;
      const lastActiveMonth = lastActiveIndex === null ? null : monthlySales[lastActiveIndex];
      const totalRawAmount = monthlySales.reduce((sum, month) => sum + month.amount, 0);
      const totalAdjustedAmount = monthlySales.reduce((sum, month) => sum + month.adjustedAmount, 0);
      const activeAdjustedTotal = activeMonths.reduce((sum, month) => sum + month.adjustedAmount, 0);
      const averageAdjustedActiveMonth = activeMonths.length > 0 ? activeAdjustedTotal / activeMonths.length : 0;
      const latestAverage = latestConsecutive ? latestConsecutive.adjustedAmount / latestConsecutive.months : 0;
      const lostPotentialAdjusted = lostAfterConsecutiveActivity && monthsSinceLastActive !== null
        ? latestAverage * monthsSinceLastActive
        : 0;

      return {
        customerCode: entry.customerCode,
        customerName: entry.customerName,
        sectorCode: entry.sectorCode,
        city: null,
        district: null,
        phone: null,
        balance: 0,
        assignedSalesRep: null,
        firstSaleDate: entry.firstSaleDate,
        lastSaleDate: entry.lastSaleDate,
        monthsSinceLastActive,
        activeMonths: activeMonths.length,
        documentCount: monthlySales.reduce((sum, month) => sum + month.documentCount, 0),
        totalRawAmount,
        totalAdjustedAmount,
        averageAdjustedActiveMonth,
        maxConsecutiveActiveMonths: maxStreak?.months || 0,
        latestConsecutiveStreak: latestConsecutive
          ? {
              startMonth: monthlySales[latestConsecutive.startIndex].month,
              endMonth: monthlySales[latestConsecutive.endIndex].month,
              months: latestConsecutive.months,
              adjustedAmount: latestConsecutive.adjustedAmount,
              averageAdjustedAmount: latestConsecutive.adjustedAmount / latestConsecutive.months,
            }
          : null,
        peakMonth: peakMonth
          ? {
              month: peakMonth.month,
              amount: peakMonth.amount,
              adjustedAmount: peakMonth.adjustedAmount,
              usdRate: peakMonth.usdRate,
            }
          : null,
        lastActiveMonth: lastActiveMonth
          ? {
              month: lastActiveMonth.month,
              amount: lastActiveMonth.amount,
              adjustedAmount: lastActiveMonth.adjustedAmount,
              usdRate: lastActiveMonth.usdRate,
            }
          : null,
        lostAfterConsecutiveActivity,
        lostPotentialAdjusted,
        monthlySales: monthlySales.filter((month) => month.amount !== 0 || month.adjustedAmount !== 0 || month.documentCount > 0),
        topMonths: monthlySales
          .filter((month) => month.adjustedAmount > 0)
          .sort((a, b) => b.adjustedAmount - a.adjustedAmount)
          .slice(0, 5)
          .map((month) => ({
            month: month.month,
            amount: month.amount,
            adjustedAmount: month.adjustedAmount,
            usdRate: month.usdRate,
          })),
      };
    });
  }

  private async attachHistoricalLocalMetadata(rows: HistoricalValueRow[]) {
    const customerCodes = rows.map((row) => normalizeCode(row.customerCode)).filter(Boolean);
    if (customerCodes.length === 0) return;

    const [customers, salesReps] = await Promise.all([
      prisma.user.findMany({
        where: { role: UserRole.CUSTOMER, mikroCariCode: { in: customerCodes } },
        select: {
          mikroCariCode: true,
          displayName: true,
          mikroName: true,
          name: true,
          city: true,
          district: true,
          phone: true,
          balance: true,
          sectorCode: true,
        },
      }),
      prisma.user.findMany({
        where: { role: { in: [UserRole.SALES_REP, UserRole.MANAGER, UserRole.ADMIN, UserRole.HEAD_ADMIN] } },
        select: { id: true, name: true, email: true, assignedSectorCodes: true },
      }),
    ]);

    const customerByCode = new Map(customers.map((customer) => [normalizeCode(customer.mikroCariCode), customer]));
    const salesRepBySector = new Map<string, { id: string; name: string; email?: string | null }>();
    salesReps.forEach((rep) => {
      (rep.assignedSectorCodes || []).forEach((sector) => {
        const code = normalizeCode(sector);
        if (code && !salesRepBySector.has(code)) {
          salesRepBySector.set(code, { id: rep.id, name: rep.name || rep.email || rep.id, email: rep.email });
        }
      });
    });

    rows.forEach((row) => {
      const customer = customerByCode.get(normalizeCode(row.customerCode));
      if (customer) {
        row.customerName = customer.displayName || customer.mikroName || customer.name || row.customerName;
        row.city = customer.city || null;
        row.district = customer.district || null;
        row.phone = customer.phone || null;
        row.balance = toNumber(customer.balance);
        row.sectorCode = customer.sectorCode || row.sectorCode || null;
      }
      row.assignedSalesRep = row.sectorCode ? salesRepBySector.get(normalizeCode(row.sectorCode)) || null : null;
    });
  }

  private filterAndSortHistoricalValueRows(
    rows: HistoricalValueRow[],
    normalized: ReturnType<CustomerRecoveryService['normalizeHistoricalValueOptions']>
  ) {
    let result = rows;
    if (normalized.search) {
      const search = normalized.search.toLocaleLowerCase('tr-TR');
      result = result.filter((row) =>
        `${row.customerCode} ${row.customerName || ''} ${row.sectorCode || ''} ${row.city || ''} ${row.district || ''}`
          .toLocaleLowerCase('tr-TR')
          .includes(search)
      );
    }
    if (normalized.minTotalAdjustedAmount > 0) {
      result = result.filter((row) => row.totalAdjustedAmount >= normalized.minTotalAdjustedAmount);
    }
    if (normalized.onlyLostFrequent) {
      result = result.filter((row) => row.lostAfterConsecutiveActivity);
    }

    const direction = normalized.sortDirection === 'asc' ? 1 : -1;
    return [...result].sort((a, b) => {
      let compare = 0;
      switch (normalized.sortBy) {
        case 'peakAdjustedAmount':
          compare = (a.peakMonth?.adjustedAmount || 0) - (b.peakMonth?.adjustedAmount || 0);
          break;
        case 'totalRawAmount':
          compare = a.totalRawAmount - b.totalRawAmount;
          break;
        case 'totalAdjustedAmount':
          compare = a.totalAdjustedAmount - b.totalAdjustedAmount;
          break;
        case 'lastSaleDate':
          compare = String(a.lastSaleDate || '').localeCompare(String(b.lastSaleDate || ''));
          break;
        case 'maxConsecutiveActiveMonths':
          compare = a.maxConsecutiveActiveMonths - b.maxConsecutiveActiveMonths;
          break;
        case 'customerName':
          compare = String(a.customerName || '').localeCompare(String(b.customerName || ''), 'tr');
          break;
        case 'lostPotentialAdjusted':
        default:
          compare = a.lostPotentialAdjusted - b.lostPotentialAdjusted;
          break;
      }
      if (compare !== 0) return compare * direction;
      return b.totalAdjustedAmount - a.totalAdjustedAmount;
    });
  }

  private buildHistoricalValueSummary(rows: HistoricalValueRow[]) {
    return {
      totalCustomers: rows.length,
      lostAfterConsecutiveCount: rows.filter((row) => row.lostAfterConsecutiveActivity).length,
      totalRawAmount: rows.reduce((sum, row) => sum + row.totalRawAmount, 0),
      totalAdjustedAmount: rows.reduce((sum, row) => sum + row.totalAdjustedAmount, 0),
      totalLostPotentialAdjusted: rows.reduce((sum, row) => sum + row.lostPotentialAdjusted, 0),
      maxPeakAdjustedAmount: rows.reduce((max, row) => Math.max(max, row.peakMonth?.adjustedAmount || 0), 0),
      averageMultiplier: (() => {
        const raw = rows.reduce((sum, row) => sum + row.totalRawAmount, 0);
        const adjusted = rows.reduce((sum, row) => sum + row.totalAdjustedAmount, 0);
        return raw > 0 ? adjusted / raw : 1;
      })(),
    };
  }

  private async attachLocalMetadata(rows: RecoveryRow[]) {
    const customerCodes = rows.map((row) => normalizeCode(row.customerCode)).filter(Boolean);
    if (customerCodes.length === 0) return;

    const [customers, salesReps] = await Promise.all([
      prisma.user.findMany({
        where: { role: 'CUSTOMER', mikroCariCode: { in: customerCodes } },
        select: {
          id: true,
          mikroCariCode: true,
          displayName: true,
          mikroName: true,
          name: true,
          city: true,
          district: true,
          phone: true,
          balance: true,
          sectorCode: true,
        },
      }),
      prisma.user.findMany({
        where: { role: { in: [UserRole.SALES_REP, UserRole.MANAGER, UserRole.ADMIN, UserRole.HEAD_ADMIN] } },
        select: { id: true, name: true, email: true, assignedSectorCodes: true },
      }),
    ]);

    const customerByCode = new Map(customers.map((customer) => [normalizeCode(customer.mikroCariCode), customer]));
    const salesRepBySector = new Map<string, { id: string; name: string; email?: string | null }>();
    salesReps.forEach((rep) => {
      (rep.assignedSectorCodes || []).forEach((sector) => {
        const code = normalizeCode(sector);
        if (code && !salesRepBySector.has(code)) {
          salesRepBySector.set(code, { id: rep.id, name: rep.name, email: rep.email });
        }
      });
    });

    const customerIds = customers.map((customer) => customer.id);
    const [quoteGroups, orderGroups] = await Promise.all([
      prisma.quote.groupBy({
        by: ['customerId'],
        where: {
          customerId: { in: customerIds },
          status: { in: [QuoteStatus.PENDING_APPROVAL, QuoteStatus.SENT_TO_MIKRO, QuoteStatus.CUSTOMER_ACCEPTED] },
        },
        _count: { _all: true },
      }),
      prisma.order.groupBy({
        by: ['userId'],
        where: {
          userId: { in: customerIds },
          status: { in: [OrderStatus.PENDING, OrderStatus.APPROVED] },
        },
        _count: { _all: true },
      }),
    ]);
    const quoteCountByCustomer = new Map(quoteGroups.map((row) => [row.customerId, row._count._all]));
    const orderCountByCustomer = new Map(orderGroups.map((row) => [row.userId, row._count._all]));

    rows.forEach((row) => {
      const customer = customerByCode.get(normalizeCode(row.customerCode));
      if (customer) {
        row.customerName = customer.displayName || customer.mikroName || customer.name || row.customerName;
        row.city = customer.city || null;
        row.district = customer.district || null;
        row.phone = customer.phone || null;
        row.balance = toNumber(customer.balance);
        row.sectorCode = customer.sectorCode || row.sectorCode || null;
        row.openQuoteCount = quoteCountByCustomer.get(customer.id) || 0;
        row.openOrderCount = orderCountByCustomer.get(customer.id) || 0;
      }
      row.assignedSalesRep = row.sectorCode ? salesRepBySector.get(normalizeCode(row.sectorCode)) || null : null;
    });
  }

  private async attachActionMetadata(rows: RecoveryRow[], normalized: ReturnType<CustomerRecoveryService['normalizeOptions']>) {
    const customerCodes = rows.map((row) => normalizeCode(row.customerCode)).filter(Boolean);
    if (customerCodes.length === 0) return;

    const actions = await prisma.customerRecoveryAction.findMany({
      where: { customerCode: { in: customerCodes } },
      include: {
        author: { select: { id: true, name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(customerCodes.length * 20, 5000),
    });

    const actionsByCustomer = new Map<string, typeof actions>();
    actions.forEach((action) => {
      const code = normalizeCode(action.customerCode);
      const list = actionsByCustomer.get(code) || [];
      list.push(action);
      actionsByCustomer.set(code, list);
    });

    const now = new Date();
    rows.forEach((row) => {
      const list = actionsByCustomer.get(normalizeCode(row.customerCode)) || [];
      const openActions = list.filter((action) => action.status === 'OPEN');
      const overdueActions = openActions.filter((action) => action.followUpDate && action.followUpDate < now);
      const lastAction = list[0] || null;
      row.lastAction = lastAction
        ? {
            id: lastAction.id,
            actionType: lastAction.actionType,
            note: lastAction.note,
            status: lastAction.status,
            priority: lastAction.priority,
            outcome: lastAction.outcome,
            followUpDate: lastAction.followUpDate ? lastAction.followUpDate.toISOString() : null,
            completedAt: lastAction.completedAt ? lastAction.completedAt.toISOString() : null,
            createdAt: lastAction.createdAt.toISOString(),
            author: lastAction.author,
            assignedTo: lastAction.assignedTo,
          }
        : null;
      row.openActionCount = openActions.length;
      row.overdueActionCount = overdueActions.length;
      row.nextFollowUpDate = openActions
        .map((action) => action.followUpDate)
        .filter((date): date is Date => Boolean(date))
        .sort((a, b) => a.getTime() - b.getTime())[0]?.toISOString() || null;

      if (!lastAction) {
        row.developmentStatus = 'NO_ACTION';
        return;
      }

      const postActionMonths = row.monthlySales.filter((month) => month.month >= lastAction.createdAt.toISOString().slice(0, 7));
      row.postActionAmount = postActionMonths.reduce((sum, month) => sum + month.amount, 0);
      row.postActionDocumentCount = postActionMonths.reduce((sum, month) => sum + month.documentCount, 0);
      if (row.postActionAmount > 0 && row.recentAverage >= row.historicalAverage * 0.8) {
        row.developmentStatus = 'RECOVERED';
      } else if (row.postActionAmount > 0 || row.dropPercent < normalized.minDropPercent) {
        row.developmentStatus = 'IMPROVED';
      } else if (row.dropPercent >= 90 || row.riskType === 'NO_RECENT_SALES') {
        row.developmentStatus = 'WORSENED';
      } else {
        row.developmentStatus = 'UNCHANGED';
      }
    });
  }

  private async attachProductInsights(
    rows: RecoveryRow[],
    normalized: ReturnType<CustomerRecoveryService['normalizeOptions']>,
    context?: RequestContext
  ) {
    const customerCodes = Array.from(new Set(rows.map((row) => normalizeCode(row.customerCode)).filter(Boolean)));
    if (customerCodes.length === 0) return;

    const connect = (mikroService as any).connect;
    if (typeof connect === 'function') {
      await connect.call(mikroService);
    }
    const exclusionConditions = await exclusionService.buildStokHareketleriExclusionConditions();
    const productRows: any[] = [];

    for (const chunk of chunkArray(customerCodes, 150)) {
      const customerList = chunk.map((code) => `'${escapeSqlLiteral(code)}'`).join(', ');
      const baseWhere = this.buildBaseWhere([
        ...exclusionConditions,
        `RTRIM(sth.sth_cari_kodu) IN (${customerList})`,
        `sth.sth_tarih >= '${formatDateCompact(normalized.baselineStart)}'`,
        `sth.sth_tarih <= '${formatDateCompact(normalized.queryEnd)}'`,
      ], context).join(' AND ');

      const chunkRows = await mikroService.executeQuery(`
        SELECT
          RTRIM(sth.sth_cari_kodu) as customerCode,
          RTRIM(sth.sth_stok_kod) as productCode,
          MAX(st.sto_isim) as productName,
          MAX(sth.sth_tarih) as lastPurchaseDate,
          SUM(CASE
            WHEN sth.sth_tarih < '${formatDateCompact(normalized.recentStart)}'
              THEN CASE WHEN ISNULL(sth.sth_normal_iade, 0) = 1 THEN -ABS(ISNULL(sth.sth_tutar, 0)) ELSE ISNULL(sth.sth_tutar, 0) END
            ELSE 0
          END) as historicalAmount,
          SUM(CASE
            WHEN sth.sth_tarih >= '${formatDateCompact(normalized.recentStart)}'
              THEN CASE WHEN ISNULL(sth.sth_normal_iade, 0) = 1 THEN -ABS(ISNULL(sth.sth_tutar, 0)) ELSE ISNULL(sth.sth_tutar, 0) END
            ELSE 0
          END) as recentAmount,
          SUM(CASE WHEN ISNULL(sth.sth_normal_iade, 0) = 1 THEN -ABS(ISNULL(sth.sth_tutar, 0)) ELSE ISNULL(sth.sth_tutar, 0) END) as totalAmount
        FROM STOK_HAREKETLERI sth WITH (NOLOCK)
        LEFT JOIN STOKLAR st WITH (NOLOCK) ON sth.sth_stok_kod = st.sto_kod
        LEFT JOIN CARI_HESAPLAR c WITH (NOLOCK) ON sth.sth_cari_kodu = c.cari_kod
        WHERE ${baseWhere}
        GROUP BY sth.sth_cari_kodu, sth.sth_stok_kod
      `);
      productRows.push(...chunkRows);
    }

    const productCodes = Array.from(new Set(productRows.map((item) => normalizeCode(item.productCode)).filter(Boolean)));
    const products = await prisma.product.findMany({
      where: { mikroCode: { in: productCodes } },
      select: { mikroCode: true, name: true, category: { select: { mikroCode: true, name: true } } },
    });
    const productMap = new Map(products.map((product) => [normalizeCode(product.mikroCode), product]));

    const insightsByCustomer = new Map<string, {
      topLostProduct: RecoveryRow['topLostProduct'];
      lastPurchasedProduct: RecoveryRow['lastPurchasedProduct'];
      categories: Map<string, NonNullable<RecoveryRow['topLostCategory']>>;
    }>();

    productRows.forEach((item) => {
      const customerCode = normalizeCode(item.customerCode);
      const productCode = normalizeCode(item.productCode);
      if (!customerCode || !productCode) return;

      const product = productMap.get(productCode);
      const productName = product?.name || item.productName || productCode;
      const historicalAmount = toNumber(item.historicalAmount);
      const recentAmount = toNumber(item.recentAmount);
      const lostAmount = Math.max(0, historicalAmount - recentAmount);
      const lastPurchaseDate = compactDateToDisplay(item.lastPurchaseDate);
      const current = insightsByCustomer.get(customerCode) || {
        topLostProduct: null,
        lastPurchasedProduct: null,
        categories: new Map<string, NonNullable<RecoveryRow['topLostCategory']>>(),
      };

      const productInsight = {
        productCode,
        productName,
        historicalAmount,
        recentAmount,
        lostAmount,
        lastPurchaseDate,
      };
      if (lostAmount > 0 && (!current.topLostProduct || lostAmount > current.topLostProduct.lostAmount)) {
        current.topLostProduct = productInsight;
      }

      if (lastPurchaseDate && (!current.lastPurchasedProduct?.lastPurchaseDate || lastPurchaseDate > current.lastPurchasedProduct.lastPurchaseDate)) {
        current.lastPurchasedProduct = {
          productCode,
          productName,
          lastPurchaseDate,
          amount: toNumber(item.totalAmount),
        };
      }

      const categoryCode = normalizeCode(product?.category?.mikroCode) || 'DIGER';
      const categoryName = product?.category?.name || 'Diger';
      const category = current.categories.get(categoryCode) || {
        categoryCode,
        categoryName,
        historicalAmount: 0,
        recentAmount: 0,
        lostAmount: 0,
      };
      category.historicalAmount += historicalAmount;
      category.recentAmount += recentAmount;
      category.lostAmount += lostAmount;
      current.categories.set(categoryCode, category);
      insightsByCustomer.set(customerCode, current);
    });

    rows.forEach((row) => {
      const insight = insightsByCustomer.get(normalizeCode(row.customerCode));
      if (insight) {
        row.topLostProduct = insight.topLostProduct;
        row.lastPurchasedProduct = insight.lastPurchasedProduct;
        row.topLostCategory = Array.from(insight.categories.values()).sort((a, b) => b.lostAmount - a.lostAmount)[0] || null;
      }
      row.recommendedAction = this.buildRecommendedAction(row);
    });
  }

  private buildRecommendedAction(row: RecoveryRow) {
    if (row.overdueActionCount > 0) return 'Geciken takibi kapat ve sonucu notla';
    if (row.openQuoteCount > 0) return 'Acik teklifi telefonla takip et';
    if (row.openOrderCount > 0) return 'Acik siparisi kontrol et';
    if (row.seasonalityStatus === 'OVERDUE') return 'Donemsel alim periyodu asildi; ihale/talep takvimini ara';
    if (row.isSeasonal) return 'Donemsel alim takvimini notla, kayip gibi takip etme';
    if (row.purchasePattern === 'FREQUENT') return 'Eskiden sik alim yapan cariyi arama/ziyaret listesine al';
    if (row.riskType === 'NO_RECENT_SALES') {
      return row.topLostCategory
        ? `${row.topLostCategory.categoryName} kategorisi icin arama/ziyaret planla`
        : 'Cariyle yeniden temas kur';
    }
    if (row.lostPotential >= 25000) return 'Ziyaret ve ozel teklif hazirla';
    if (row.topLostProduct) return `${row.topLostProduct.productName} icin tekrar teklif ver`;
    if (row.riskType === 'INSIGNIFICANT_ACTIVITY') return 'Dusuk tutarli son alimin nedenini sor';
    return 'Cariyle temas kur ve ihtiyacini notla';
  }

  private buildRows(monthlyRows: any[], normalized: ReturnType<CustomerRecoveryService['normalizeOptions']>): RecoveryRow[] {
    const map = new Map<string, {
      customerCode: string;
      customerName: string | null;
      sectorCode: string | null;
      months: Map<string, MonthlyBucket>;
      lastSaleDate: string | null;
    }>();

    monthlyRows.forEach((row) => {
      const customerCode = normalizeCode(row.customerCode);
      const monthKey = String(row.monthKey || '').slice(0, 7);
      if (!customerCode || !monthKey) return;
      const entry = map.get(customerCode) || {
        customerCode,
        customerName: row.customerName || null,
        sectorCode: normalizeCode(row.sectorCode) || null,
        months: new Map<string, MonthlyBucket>(),
        lastSaleDate: null,
      };
      const bucket = entry.months.get(monthKey) || this.emptyBucket();
      bucket.amount += toNumber(row.amount);
      bucket.quantity += toNumber(row.quantity);
      bucket.documentCount += Math.floor(toNumber(row.documentCount));
      const lastDate = compactDateToDisplay(row.lastSaleDate);
      if (lastDate && (!bucket.lastSaleDate || lastDate > bucket.lastSaleDate)) bucket.lastSaleDate = lastDate;
      if (lastDate && (!entry.lastSaleDate || lastDate > entry.lastSaleDate)) entry.lastSaleDate = lastDate;
      entry.customerName = entry.customerName || row.customerName || null;
      entry.sectorCode = entry.sectorCode || normalizeCode(row.sectorCode) || null;
      entry.months.set(monthKey, bucket);
      map.set(customerCode, entry);
    });

    const today = new Date();
    const rows: RecoveryRow[] = [];
    map.forEach((entry) => {
      const historicalBuckets = normalized.baselineMonthKeys.map((month) => entry.months.get(month) || this.emptyBucket());
      const recentBuckets = normalized.recentMonthKeys.map((month) => entry.months.get(month) || this.emptyBucket());
      const meaningfulHistorical = historicalBuckets.filter((bucket) => bucket.amount >= normalized.minMeaningfulMonthlyAmount);
      const historicalActiveFlags = historicalBuckets.map((bucket) => bucket.amount >= normalized.minMeaningfulMonthlyAmount);
      const historicalAmount = historicalBuckets.reduce((sum, bucket) => sum + bucket.amount, 0);
      const historicalDocumentCount = historicalBuckets.reduce((sum, bucket) => sum + bucket.documentCount, 0);
      const historicalActiveMonths = meaningfulHistorical.length;
      const maxConsecutiveHistoricalActiveMonths = maxConsecutiveTrue(historicalActiveFlags);
      const historicalActiveRatio = historicalActiveMonths / normalized.baselineMonths;

      if (historicalActiveMonths < normalized.minHistoricalActiveMonths) return;
      if (historicalAmount < normalized.minHistoricalAmount) return;

      const historicalAverage = meaningfulHistorical.reduce((sum, bucket) => sum + bucket.amount, 0) / historicalActiveMonths;
      const historicalMedian = median(meaningfulHistorical.map((bucket) => bucket.amount));
      const recentAmount = recentBuckets.reduce((sum, bucket) => sum + bucket.amount, 0);
      const recentDocumentCount = recentBuckets.reduce((sum, bucket) => sum + bucket.documentCount, 0);
      const recentAverage = recentAmount / normalized.recentMonths;
      const recentActiveMonths = recentBuckets.filter((bucket) => bucket.amount >= normalized.minMeaningfulMonthlyAmount).length;
      const dropPercent = historicalAverage > 0
        ? clamp(((historicalAverage - recentAverage) / historicalAverage) * 100, 0, 100)
        : 0;

      const samePeriodLastYear = normalized.recentMonthKeys.map((month) => {
        const [year, monthPart] = month.split('-');
        return `${Number(year) - 1}-${monthPart}`;
      });
      const seasonalBuckets = samePeriodLastYear.map((month) => entry.months.get(month)).filter(Boolean) as MonthlyBucket[];
      const seasonalAverage = seasonalBuckets.length > 0
        ? seasonalBuckets.reduce((sum, bucket) => sum + bucket.amount, 0) / normalized.recentMonths
        : null;
      const seasonalDropPercent = seasonalAverage && seasonalAverage > 0
        ? clamp(((seasonalAverage - recentAverage) / seasonalAverage) * 100, 0, 100)
        : null;
      const seasonality = this.calculateSeasonality(entry.months, normalized);
      const purchasePattern: Exclude<PurchasePattern, 'ALL'> = seasonality.isSeasonal
        ? 'PERIODIC'
        : maxConsecutiveHistoricalActiveMonths >= 3 || historicalActiveRatio >= 0.55
          ? 'FREQUENT'
          : 'SPORADIC';

      const labels: string[] = [];
      let riskType: RiskType = 'WATCH';
      if (recentDocumentCount === 0 || recentAmount <= 0) {
        riskType = 'NO_RECENT_SALES';
        labels.push('Son donemde satis yok');
      } else if (recentActiveMonths === 0 || recentAverage < normalized.minMeaningfulMonthlyAmount) {
        riskType = 'INSIGNIFICANT_ACTIVITY';
        labels.push('Anlamsiz dusuk hareket');
      } else if (dropPercent >= normalized.minDropPercent) {
        riskType = 'DECLINING';
        labels.push('Ortalamanin altinda');
      }
      if (seasonalDropPercent !== null && seasonalDropPercent >= normalized.minDropPercent) {
        labels.push('Gecen yilin ayni donemine gore dusuk');
      }
      if (seasonality.isSeasonal) {
        labels.push(seasonality.seasonalityStatus === 'OVERDUE' ? 'Donemsel ritim gecikmis' : 'Donemsel/ihale ritmi tolerans icinde');
      }
      if (purchasePattern === 'FREQUENT') labels.push('Eskiden sik alim yapan cari');
      if (historicalActiveMonths <= 2) labels.push('Dusuk guven: az aktif ay');

      if (riskType === 'WATCH' && (!seasonalDropPercent || seasonalDropPercent < normalized.minDropPercent)) {
        return;
      }

      const expectedRecentAmount = historicalAverage * normalized.recentMonths;
      const lostPotential = Math.max(0, expectedRecentAmount - recentAmount);
      const daysSinceLastSale = entry.lastSaleDate
        ? Math.max(0, Math.floor((today.getTime() - new Date(entry.lastSaleDate).getTime()) / 86400000))
        : null;
      const confidence = historicalActiveMonths >= 5 && historicalDocumentCount >= 5
        ? 'HIGH'
        : historicalActiveMonths >= 3
          ? 'MEDIUM'
          : 'LOW';
      const riskScore = clamp(
        Math.round(
          dropPercent * 0.5 +
          (riskType === 'NO_RECENT_SALES' ? 25 : riskType === 'INSIGNIFICANT_ACTIVITY' ? 18 : 8) +
          clamp(lostPotential / 5000, 0, 20) +
          (confidence === 'HIGH' ? 5 : 0)
        ),
        0,
        100
      );

      rows.push({
        customerCode: entry.customerCode,
        customerName: entry.customerName,
        sectorCode: entry.sectorCode,
        city: null,
        district: null,
        phone: null,
        balance: 0,
        assignedSalesRep: null,
        riskType,
        riskLabels: labels,
        riskScore,
        confidence,
        lastSaleDate: entry.lastSaleDate,
        daysSinceLastSale,
        historicalActiveMonths,
        historicalDocumentCount,
        historicalAmount,
        historicalAverage,
        historicalMedian,
        recentActiveMonths,
        recentDocumentCount,
        recentAmount,
        recentAverage,
        dropPercent,
        seasonalAverage,
        seasonalDropPercent,
        isSeasonal: seasonality.isSeasonal,
        seasonalityScore: seasonality.seasonalityScore,
        seasonalityReason: seasonality.seasonalityReason,
        seasonalityStatus: seasonality.seasonalityStatus,
        averagePurchaseIntervalMonths: seasonality.averagePurchaseIntervalMonths,
        monthsSinceLastMeaningfulPurchase: seasonality.monthsSinceLastMeaningfulPurchase,
        seasonalOverdueMonths: seasonality.seasonalOverdueMonths,
        purchasePattern,
        maxConsecutiveHistoricalActiveMonths,
        historicalActiveRatio,
        lostPotential,
        openQuoteCount: 0,
        openOrderCount: 0,
        topLostCategory: null,
        topLostProduct: null,
        lastPurchasedProduct: null,
        recommendedAction: '',
        lastAction: null,
        openActionCount: 0,
        overdueActionCount: 0,
        nextFollowUpDate: null,
        developmentStatus: 'NO_ACTION',
        postActionAmount: 0,
        postActionDocumentCount: 0,
        monthlySales: normalized.allMonthKeys.map((month) => ({
          month,
          amount: entry.months.get(month)?.amount || 0,
          documentCount: entry.months.get(month)?.documentCount || 0,
        })),
      });
    });

    return rows;
  }

  private filterAndSortRows(rows: RecoveryRow[], normalized: ReturnType<CustomerRecoveryService['normalizeOptions']>) {
    let result = rows;
    if (normalized.search) {
      const search = normalized.search.toLocaleLowerCase('tr-TR');
      result = result.filter((row) =>
        `${row.customerCode} ${row.customerName || ''} ${row.sectorCode || ''} ${row.city || ''} ${row.district || ''}`
          .toLocaleLowerCase('tr-TR')
          .includes(search)
      );
    }
    if (normalized.resultSearch) {
      const search = normalized.resultSearch.toLocaleLowerCase('tr-TR');
      result = result.filter((row) =>
        `${row.customerCode} ${row.customerName || ''} ${row.sectorCode || ''} ${row.city || ''} ${row.district || ''}`
          .toLocaleLowerCase('tr-TR')
          .includes(search)
      );
    }
    if (normalized.assignedToId) {
      result = result.filter((row) => row.lastAction?.assignedTo?.id === normalized.assignedToId || row.assignedSalesRep?.id === normalized.assignedToId);
    }
    if (normalized.riskTypeSet.size > 0) {
      result = result.filter((row) => normalized.riskTypeSet.has(row.riskType));
    }
    if (normalized.onlyWithOpenAction) {
      result = result.filter((row) => row.openActionCount > 0);
    }
    if (normalized.onlyDueFollowUp) {
      result = result.filter((row) => row.overdueActionCount > 0);
    }
    if (normalized.minLostPotential > 0) {
      result = result.filter((row) => row.lostPotential >= normalized.minLostPotential);
    }
    if (normalized.seasonalityMode === 'exclude') {
      result = result.filter((row) => !row.isSeasonal || row.seasonalityStatus === 'OVERDUE');
    } else if (normalized.seasonalityMode === 'only') {
      result = result.filter((row) => row.isSeasonal);
    }
    if (normalized.purchasePattern !== 'ALL') {
      result = result.filter((row) => row.purchasePattern === normalized.purchasePattern);
    }

    const direction = normalized.sortDirection === 'asc' ? 1 : -1;
    result = [...result].sort((a, b) => {
      let compare = 0;
      switch (normalized.sortBy) {
        case 'lostPotential':
          compare = a.lostPotential - b.lostPotential;
          break;
        case 'dropPercent':
          compare = a.dropPercent - b.dropPercent;
          break;
        case 'lastSaleDate':
          compare = String(a.lastSaleDate || '').localeCompare(String(b.lastSaleDate || ''));
          break;
        case 'historicalAverage':
          compare = a.historicalAverage - b.historicalAverage;
          break;
        case 'recentAverage':
          compare = a.recentAverage - b.recentAverage;
          break;
        case 'customerName':
          compare = String(a.customerName || '').localeCompare(String(b.customerName || ''), 'tr');
          break;
        case 'riskScore':
        default:
          compare = a.riskScore - b.riskScore;
          break;
      }
      if (compare !== 0) return compare * direction;
      return b.lostPotential - a.lostPotential;
    });

    return result;
  }

  private buildSummary(rows: RecoveryRow[]) {
    const totalLostPotential = rows.reduce((sum, row) => sum + row.lostPotential, 0);
    const countsByRisk = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.riskType] = (acc[row.riskType] || 0) + 1;
      return acc;
    }, {});
    const recoveredCount = rows.filter((row) => row.developmentStatus === 'RECOVERED').length;
    const dueFollowUpCount = rows.filter((row) => row.overdueActionCount > 0).length;
    const noActionCount = rows.filter((row) => row.openActionCount === 0 && !row.lastAction).length;
    const seasonalCount = rows.filter((row) => row.isSeasonal).length;
    const seasonalLostPotential = rows
      .filter((row) => row.isSeasonal)
      .reduce((sum, row) => sum + row.lostPotential, 0);

    const teamMap = new Map<string, {
      userId: string;
      name: string;
      customerCount: number;
      openActionCount: number;
      overdueActionCount: number;
      recoveredCount: number;
      lostPotential: number;
    }>();
    rows.forEach((row) => {
      const owner = row.lastAction?.assignedTo || row.assignedSalesRep;
      if (!owner?.id) return;
      const current = teamMap.get(owner.id) || {
        userId: owner.id,
        name: owner.name,
        customerCount: 0,
        openActionCount: 0,
        overdueActionCount: 0,
        recoveredCount: 0,
        lostPotential: 0,
      };
      current.customerCount += 1;
      current.openActionCount += row.openActionCount;
      current.overdueActionCount += row.overdueActionCount;
      current.recoveredCount += row.developmentStatus === 'RECOVERED' ? 1 : 0;
      current.lostPotential += row.lostPotential;
      teamMap.set(owner.id, current);
    });

    return {
      totalCustomers: rows.length,
      countsByRisk,
      totalLostPotential,
      recoveredCount,
      dueFollowUpCount,
      noActionCount,
      seasonalCount,
      seasonalLostPotential,
      teamSummary: Array.from(teamMap.values()).sort((a, b) => b.lostPotential - a.lostPotential),
    };
  }

  async getReport(options: ReportOptions = {}, context?: RequestContext) {
    const normalized = this.normalizeOptions(options);
    const monthlyRows = await this.fetchMonthlySales(normalized, context);
    let rows = this.buildRows(monthlyRows, normalized);
    await this.attachLocalMetadata(rows);
    await this.attachActionMetadata(rows, normalized);
    rows = this.filterAndSortRows(rows, normalized);

    const totalRecords = rows.length;
    const totalPages = totalRecords > 0 ? Math.ceil(totalRecords / normalized.limit) : 0;
    const offset = (normalized.page - 1) * normalized.limit;
    const paginatedRows = rows.slice(offset, offset + normalized.limit);
    await this.attachProductInsights(paginatedRows, normalized, context);

    return {
      rows: paginatedRows,
      summary: this.buildSummary(rows),
      pagination: {
        page: normalized.page,
        limit: normalized.limit,
        totalPages,
        totalRecords,
      },
      metadata: {
        recentMonths: normalized.recentMonths,
        baselineMonths: normalized.baselineMonths,
        minDropPercent: normalized.minDropPercent,
        minHistoricalActiveMonths: normalized.minHistoricalActiveMonths,
        minHistoricalAmount: normalized.minHistoricalAmount,
        minMeaningfulMonthlyAmount: normalized.minMeaningfulMonthlyAmount,
        minLostPotential: normalized.minLostPotential,
        seasonalityMode: normalized.seasonalityMode,
        purchasePattern: normalized.purchasePattern,
        includeCurrentMonth: normalized.includeCurrentMonth,
        baselineStartDate: formatDateKey(normalized.baselineStart),
        recentStartDate: formatDateKey(normalized.recentStart),
        reportEndDate: formatDateKey(normalized.queryEnd),
        baselineMonthKeys: normalized.baselineMonthKeys,
        recentMonthKeys: normalized.recentMonthKeys,
      },
    };
  }

  private async resolveHistoricalValueRows(
    normalized: ReturnType<CustomerRecoveryService['normalizeHistoricalValueOptions']>,
    context?: RequestContext
  ) {
    const cacheKey = this.buildHistoricalValueCacheKey(normalized, context);
    const now = Date.now();
    let cacheEntry = historicalValueReportCache.get(cacheKey);

    if (!cacheEntry || cacheEntry.expiresAt <= now) {
      const usdRate = await this.getCurrentUsdTryRate();
      const monthlyRows = await this.fetchHistoricalValueMonthlySales(normalized, context);
      const builtRows = this.buildHistoricalValueRows(monthlyRows, normalized, usdRate.rate);
      await this.attachHistoricalLocalMetadata(builtRows);
      cacheEntry = {
        expiresAt: now + HISTORICAL_VALUE_CACHE_MS,
        rows: builtRows,
        usdRate,
      };
      historicalValueReportCache.set(cacheKey, cacheEntry);
      if (historicalValueReportCache.size > 30) {
        const expiredKeys = Array.from(historicalValueReportCache.entries())
          .filter(([, value]) => value.expiresAt <= now)
          .map(([key]) => key);
        expiredKeys.forEach((key) => historicalValueReportCache.delete(key));
      }
    }

    const rows = this.filterAndSortHistoricalValueRows(cacheEntry.rows, normalized);
    return { rows, cacheEntry };
  }

  async getHistoricalValueReport(options: HistoricalValueOptions = {}, context?: RequestContext) {
    const normalized = this.normalizeHistoricalValueOptions(options);
    const { rows, cacheEntry } = await this.resolveHistoricalValueRows(normalized, context);

    const totalRecords = rows.length;
    const totalPages = totalRecords > 0 ? Math.ceil(totalRecords / normalized.limit) : 0;
    const offset = (normalized.page - 1) * normalized.limit;

    return {
      rows: rows.slice(offset, offset + normalized.limit),
      summary: this.buildHistoricalValueSummary(rows),
      pagination: {
        page: normalized.page,
        limit: normalized.limit,
        totalPages,
        totalRecords,
      },
      metadata: {
        startYear: normalized.startYear,
        startDate: formatDateKey(normalized.startDate),
        endDate: formatDateKey(normalized.endDate),
        currentMonthKey: normalized.currentMonthKey,
        inactiveMonths: normalized.inactiveMonths,
        minConsecutiveMonths: normalized.minConsecutiveMonths,
        minMonthlyAmount: normalized.minMonthlyAmount,
        minTotalAdjustedAmount: normalized.minTotalAdjustedAmount,
        onlyLostFrequent: normalized.onlyLostFrequent,
        sortBy: normalized.sortBy,
        sortDirection: normalized.sortDirection,
        currentUsdTryRate: cacheEntry.usdRate.rate,
        currentUsdTryRateSource: cacheEntry.usdRate.source,
        currentUsdTryRateFetchedAt: cacheEntry.usdRate.fetchedAt,
        historicalUsdRateSource: 'MIKRO_STH_ALT_DOVIZ_KURU',
        cacheExpiresAt: new Date(cacheEntry.expiresAt).toISOString(),
        monthKeys: normalized.allMonthKeys,
      },
    };
  }

  private getActionCustomerLabel(action: { customerCode?: string | null; customerName?: string | null }) {
    return [action.customerCode, action.customerName].filter(Boolean).join(' - ') || 'Cari';
  }

  private async notifyUsers(userIds: Array<string | null | undefined>, payload: {
    title: string;
    body?: string | null;
    linkUrl?: string | null;
  }) {
    try {
      await notificationService.createForUsers(userIds, payload);
    } catch (error) {
      console.error('Customer recovery notification failed', { error });
    }
  }

  private async notifyActionAssigned(action: any) {
    if (!action.assignedToId) return;
    await this.notifyUsers([action.assignedToId], {
      title: 'Cari geri kazanim aksiyonu atandi',
      body: `${this.getActionCustomerLabel(action)} icin ${action.actionType || 'takip'} aksiyonu atandi.`,
      linkUrl: '/reports/customer-recovery/actions',
    });
  }

  private async notifyActionUpdated(existing: any, action: any, input: any, actorId?: string | null) {
    const assignedChanged = input?.assignedToId !== undefined && existing.assignedToId !== action.assignedToId;
    if (assignedChanged) {
      await this.notifyActionAssigned(action);
    }

    const statusChanged = input?.status !== undefined && existing.status !== action.status;
    const outcomeChanged = input?.outcome !== undefined && String(existing.outcome || '') !== String(action.outcome || '');
    const followUpChanged = input?.followUpDate !== undefined;
    if (!statusChanged && !outcomeChanged && !followUpChanged) return;

    const bodyParts = [`${this.getActionCustomerLabel(action)} aksiyonu guncellendi.`];
    if (statusChanged) bodyParts.push(`Durum: ${action.status}.`);
    if (action.outcome) bodyParts.push(`Not: ${String(action.outcome).slice(0, 120)}`);

    await this.notifyUsers([action.authorId, action.assignedToId].filter((userId) => userId && userId !== actorId), {
      title: 'Cari geri kazanim aksiyonu guncellendi',
      body: bodyParts.join(' '),
      linkUrl: '/reports/customer-recovery/actions',
    });
  }

  async getCustomerActions(customerCode: string) {
    const code = normalizeCode(customerCode);
    const actions = await prisma.customerRecoveryAction.findMany({
      where: { customerCode: code },
      include: {
        author: { select: { id: true, name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { actions };
  }

  async getAssignedActions(userId: string, query: any = {}) {
    const status = String(query?.status || 'OPEN').trim().toUpperCase();
    const search = String(query?.search || '').trim();
    const dueOnly = parseLooseBoolean(query?.dueOnly);
    const page = Math.max(1, Math.floor(toNumber(query?.page, 1)));
    const limit = clamp(Math.floor(toNumber(query?.limit, 50)), 1, 200);
    const where: any = {
      assignedToId: userId,
      ...(status && status !== 'ALL' ? { status } : {}),
      ...(dueOnly ? { status: 'OPEN', followUpDate: { lte: new Date() } } : {}),
    };
    if (search) {
      where.OR = [
        { customerCode: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { note: { contains: search, mode: 'insensitive' } },
        { outcome: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [actions, totalRecords] = await prisma.$transaction([
      prisma.customerRecoveryAction.findMany({
        where,
        include: {
          author: { select: { id: true, name: true, email: true } },
          assignedTo: { select: { id: true, name: true, email: true } },
        },
        orderBy: [
          { followUpDate: 'asc' },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.customerRecoveryAction.count({ where }),
    ]);

    return {
      actions,
      pagination: {
        page,
        limit,
        totalPages: totalRecords > 0 ? Math.ceil(totalRecords / limit) : 0,
        totalRecords,
      },
    };
  }

  async createAction(customerCode: string, input: any, authorId?: string) {
    const code = normalizeCode(customerCode);
    if (!code) throw new Error('Customer code is required');
    const note = String(input?.note || '').trim();
    if (!note) throw new Error('Note is required');
    const followUpDate = input?.followUpDate ? new Date(input.followUpDate) : null;
    const action = await prisma.customerRecoveryAction.create({
      data: {
        customerCode: code,
        customerName: String(input?.customerName || '').trim() || null,
        actionType: String(input?.actionType || 'NOTE').trim().toUpperCase().slice(0, 30) || 'NOTE',
        note,
        status: String(input?.status || 'OPEN').trim().toUpperCase().slice(0, 30) || 'OPEN',
        priority: String(input?.priority || 'NORMAL').trim().toUpperCase().slice(0, 30) || 'NORMAL',
        outcome: String(input?.outcome || '').trim() || null,
        followUpDate: followUpDate && !Number.isNaN(followUpDate.getTime()) ? followUpDate : null,
        authorId: authorId || undefined,
        assignedToId: input?.assignedToId || undefined,
        snapshot: input?.snapshot || undefined,
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });
    await this.notifyActionAssigned(action);
    return { action };
  }

  async updateAction(actionId: string, input: any, actorId?: string) {
    const existing = await prisma.customerRecoveryAction.findUnique({ where: { id: actionId } });
    if (!existing) throw new Error('Action not found');
    const status = input?.status !== undefined ? String(input.status || '').trim().toUpperCase() : undefined;
    const followUpDate = input?.followUpDate !== undefined && input.followUpDate
      ? new Date(input.followUpDate)
      : input?.followUpDate === null || input?.followUpDate === ''
        ? null
        : undefined;
    const action = await prisma.customerRecoveryAction.update({
      where: { id: actionId },
      data: {
        ...(input?.actionType !== undefined ? { actionType: String(input.actionType || 'NOTE').trim().toUpperCase().slice(0, 30) } : {}),
        ...(input?.note !== undefined ? { note: String(input.note || '').trim() } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(input?.priority !== undefined ? { priority: String(input.priority || 'NORMAL').trim().toUpperCase().slice(0, 30) } : {}),
        ...(input?.outcome !== undefined ? { outcome: String(input.outcome || '').trim() || null } : {}),
        ...(followUpDate !== undefined ? { followUpDate: followUpDate && !Number.isNaN(followUpDate.getTime()) ? followUpDate : null } : {}),
        ...(input?.assignedToId !== undefined ? { assignedToId: input.assignedToId || null } : {}),
        ...(input?.postSnapshot !== undefined ? { postSnapshot: input.postSnapshot || null } : {}),
        ...(status === 'DONE' && !existing.completedAt ? { completedAt: new Date() } : {}),
        ...(status && status !== 'DONE' ? { completedAt: null } : {}),
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });
    await this.notifyActionUpdated(existing, action, input, actorId);
    return { action };
  }

  async bulkAssign(input: any, authorId?: string) {
    const rawCustomerCodes = Array.isArray(input?.customerCodes) ? input.customerCodes : [];
    const customerCodes: string[] = Array.from(
      new Set(rawCustomerCodes.map((value: any) => normalizeCode(value)).filter((code: string) => Boolean(code)))
    );
    if (customerCodes.length === 0) throw new Error('Customer codes are required');
    const assignedToId = String(input?.assignedToId || '').trim();
    if (!assignedToId) throw new Error('Assigned user is required');
    const note = String(input?.note || 'Geri kazanim takibi icin atandi').trim();
    const followUpDate = input?.followUpDate ? new Date(input.followUpDate) : null;
    await prisma.customerRecoveryAction.createMany({
      data: customerCodes.map((customerCode) => ({
        customerCode,
        customerName: input?.customerNames?.[customerCode] || null,
        actionType: 'ASSIGNMENT',
        note,
        status: 'OPEN',
        priority: String(input?.priority || 'HIGH').trim().toUpperCase().slice(0, 30) || 'HIGH',
        followUpDate: followUpDate && !Number.isNaN(followUpDate.getTime()) ? followUpDate : null,
        authorId: authorId || null,
        assignedToId,
        snapshot: input?.snapshotByCustomer?.[customerCode] || undefined,
      })),
    });
    await this.notifyUsers([assignedToId], {
      title: 'Cari geri kazanim takipleri atandi',
      body: `${customerCodes.length} cari icin takip aksiyonu atandi.`,
      linkUrl: '/reports/customer-recovery/actions',
    });
    return { createdCount: customerCodes.length };
  }

  async getCustomerDetail(customerCode: string, options: ReportOptions = {}, context?: RequestContext) {
    const code = normalizeCode(customerCode);
    const report = await this.getReport({ ...options, customerCode: code, limit: 1 }, context);
    const row = report.rows[0] || null;
    if (!row) {
      return { row: null, actions: [], categories: [], documents: [], metadata: report.metadata };
    }

    const normalized = this.normalizeOptions({ ...options, customerCode: code });
    const connect = (mikroService as any).connect;
    if (typeof connect === 'function') {
      await connect.call(mikroService);
    }
    const exclusionConditions = await exclusionService.buildStokHareketleriExclusionConditions();
    const baseWhere = this.buildBaseWhere([
      ...exclusionConditions,
      `RTRIM(sth.sth_cari_kodu) = '${escapeSqlLiteral(code)}'`,
      `sth.sth_tarih >= '${formatDateCompact(normalized.baselineStart)}'`,
      `sth.sth_tarih <= '${formatDateCompact(normalized.queryEnd)}'`,
    ], context).join(' AND ');

    const productRows = await mikroService.executeQuery(`
      SELECT
        RTRIM(sth.sth_stok_kod) as productCode,
        MAX(st.sto_isim) as productName,
        MAX(sth.sth_tarih) as lastPurchaseDate,
        SUM(CASE WHEN sth.sth_tarih < '${formatDateCompact(normalized.recentStart)}' THEN ISNULL(sth.sth_tutar, 0) ELSE 0 END) as historicalAmount,
        SUM(CASE WHEN sth.sth_tarih >= '${formatDateCompact(normalized.recentStart)}' THEN ISNULL(sth.sth_tutar, 0) ELSE 0 END) as recentAmount
      FROM STOK_HAREKETLERI sth WITH (NOLOCK)
      LEFT JOIN STOKLAR st WITH (NOLOCK) ON sth.sth_stok_kod = st.sto_kod
      LEFT JOIN CARI_HESAPLAR c WITH (NOLOCK) ON sth.sth_cari_kodu = c.cari_kod
      WHERE ${baseWhere}
      GROUP BY sth.sth_stok_kod
    `);

    const productCodes = productRows.map((item: any) => normalizeCode(item.productCode)).filter(Boolean);
    const products = await prisma.product.findMany({
      where: { mikroCode: { in: productCodes } },
      select: { mikroCode: true, name: true, category: { select: { mikroCode: true, name: true } } },
    });
    const productMap = new Map(products.map((product) => [normalizeCode(product.mikroCode), product]));
    const categoryMap = new Map<string, any>();
    productRows.forEach((item: any) => {
      const product = productMap.get(normalizeCode(item.productCode));
      const categoryCode = normalizeCode(product?.category?.mikroCode) || 'DIGER';
      const current = categoryMap.get(categoryCode) || {
        categoryCode,
        categoryName: product?.category?.name || 'Diger',
        historicalAmount: 0,
        recentAmount: 0,
        lostAmount: 0,
        productCount: 0,
        products: [],
      };
      const historicalAmount = toNumber(item.historicalAmount);
      const recentAmount = toNumber(item.recentAmount);
      current.historicalAmount += historicalAmount;
      current.recentAmount += recentAmount;
      current.lostAmount += Math.max(0, historicalAmount - recentAmount);
      current.productCount += 1;
      current.products.push({
        productCode: normalizeCode(item.productCode),
        productName: product?.name || item.productName || normalizeCode(item.productCode),
        historicalAmount,
        recentAmount,
        lostAmount: Math.max(0, historicalAmount - recentAmount),
        lastPurchaseDate: compactDateToDisplay(item.lastPurchaseDate),
      });
      categoryMap.set(categoryCode, current);
    });

    const documents = await mikroService.executeQuery(`
      SELECT TOP 25
        RTRIM(sth.sth_evrakno_seri) + '-' + CAST(sth.sth_evrakno_sira AS VARCHAR(30)) as documentNo,
        MAX(sth.sth_tarih) as documentDate,
        SUM(ISNULL(sth.sth_tutar, 0)) as amount,
        COUNT(*) as lineCount
      FROM STOK_HAREKETLERI sth WITH (NOLOCK)
      LEFT JOIN CARI_HESAPLAR c WITH (NOLOCK) ON sth.sth_cari_kodu = c.cari_kod
      LEFT JOIN STOKLAR st WITH (NOLOCK) ON sth.sth_stok_kod = st.sto_kod
      WHERE ${baseWhere}
      GROUP BY sth.sth_evrakno_seri, sth.sth_evrakno_sira
      ORDER BY MAX(sth.sth_tarih) DESC
    `);

    const actions = await this.getCustomerActions(code);
    return {
      row,
      actions: actions.actions,
      categories: Array.from(categoryMap.values()).sort((a, b) => b.lostAmount - a.lostAmount).slice(0, 20),
      documents: documents.map((document: any) => ({
        documentNo: document.documentNo,
        documentDate: compactDateToDisplay(document.documentDate),
        amount: toNumber(document.amount),
        lineCount: Math.floor(toNumber(document.lineCount)),
      })),
      metadata: report.metadata,
    };
  }

  async exportReport(options: ReportOptions = {}, context?: RequestContext) {
    const data = await this.getReport({ ...options, page: 1, limit: 5000 }, context);
    const rows = data.rows.map((row) => ({
      'Cari Kodu': row.customerCode,
      'Cari Adi': row.customerName || '',
      'Sektor': row.sectorCode || '',
      'Sehir': row.city || '',
      'Risk Tipi': row.riskType,
      'Risk Skoru': row.riskScore,
      'Gecmis Aktif Ay': row.historicalActiveMonths,
      'Gecmis Aylik Ortalama': row.historicalAverage,
      'Son Donem Ortalama': row.recentAverage,
      'Dusme %': row.dropPercent,
      'Tahmini Kayip': row.lostPotential,
      'Donemsel Mi': row.isSeasonal ? 'Evet' : 'Hayir',
      'Donemsellik Sebebi': row.seasonalityReason || '',
      'Kayip Kategori': row.topLostCategory?.categoryName || '',
      'Kayip Kategori Tutar': row.topLostCategory?.lostAmount || 0,
      'Kayip Urun': row.topLostProduct?.productName || '',
      'Son Alinan Urun': row.lastPurchasedProduct?.productName || '',
      'Onerilen Aksiyon': row.recommendedAction || '',
      'Alim Ritmi': row.purchasePattern,
      'Ortalama Alim Araligi Ay': row.averagePurchaseIntervalMonths || '',
      'Son Anlamli Alimdan Gecen Ay': row.monthsSinceLastMeaningfulPurchase ?? '',
      'Donemsel Durum': row.seasonalityStatus || '',
      'Acik Teklif': row.openQuoteCount,
      'Acik Siparis': row.openOrderCount,
      'Bakiye': row.balance,
      'Son Satis': row.lastSaleDate || '',
      'Acik Aksiyon': row.openActionCount,
      'Geciken Aksiyon': row.overdueActionCount,
      'Son Not': row.lastAction?.note || '',
      'Takip Tarihi': row.nextFollowUpDate || '',
      'Gelisme': row.developmentStatus,
      'Not Sonrasi Satis': row.postActionAmount,
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Cari Geri Kazanim');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.summary.teamSummary), 'Temsilci Ozeti');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return {
      buffer,
      fileName: `cari-geri-kazanim-${data.metadata.recentStartDate}-${data.metadata.reportEndDate}.xlsx`,
    };
  }

  async exportHistoricalValueReport(options: HistoricalValueOptions = {}, context?: RequestContext) {
    const normalized = this.normalizeHistoricalValueOptions({ ...options, page: 1, limit: 500 });
    const { rows, cacheEntry } = await this.resolveHistoricalValueRows(normalized, context);
    const exportRows = rows.map((row) => ({
      'Cari Kodu': row.customerCode,
      'Cari Adi': row.customerName || '',
      'Sektor': row.sectorCode || '',
      'Sehir': row.city || '',
      'Ilce': row.district || '',
      'Temsilci': row.assignedSalesRep?.name || '',
      'Durum': row.lostAfterConsecutiveActivity ? 'Ardisik alirken durdu' : 'Izleme',
      'Ilk Satis': row.firstSaleDate || '',
      'Son Satis': row.lastSaleDate || '',
      'Son Aktif Ay': row.lastActiveMonth?.month || '',
      'Son Aktiften Gecen Ay': row.monthsSinceLastActive ?? '',
      'Aktif Ay Sayisi': row.activeMonths,
      'Evrak Sayisi': row.documentCount,
      'Max Ardisik Aktif Ay': row.maxConsecutiveActiveMonths,
      'Son Ardisik Donem': row.latestConsecutiveStreak
        ? `${row.latestConsecutiveStreak.startMonth} - ${row.latestConsecutiveStreak.endMonth}`
        : '',
      'Son Ardisik Donem Ort. Bugunku': row.latestConsecutiveStreak?.averageAdjustedAmount || 0,
      'En Yuksek Ay': row.peakMonth?.month || '',
      'En Yuksek Ay Nominal': row.peakMonth?.amount || 0,
      'En Yuksek Ay Bugunku Deger': row.peakMonth?.adjustedAmount || 0,
      'En Yuksek Ay Kuru': row.peakMonth?.usdRate || '',
      'Nominal Toplam': row.totalRawAmount,
      'Bugunku Deger Toplam': row.totalAdjustedAmount,
      'Ortalama Aktif Ay Bugunku': row.averageAdjustedActiveMonth,
      'Tahmini Kayip Bugunku': row.lostPotentialAdjusted,
      'Bakiye': row.balance,
      'Top Ay 1': row.topMonths[0] ? `${row.topMonths[0].month} / ${Math.round(row.topMonths[0].adjustedAmount)}` : '',
      'Top Ay 2': row.topMonths[1] ? `${row.topMonths[1].month} / ${Math.round(row.topMonths[1].adjustedAmount)}` : '',
      'Top Ay 3': row.topMonths[2] ? `${row.topMonths[2].month} / ${Math.round(row.topMonths[2].adjustedAmount)}` : '',
    }));
    const summary = this.buildHistoricalValueSummary(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportRows), 'Degerlenmis Cariler');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
      'Cari Sayisi': summary.totalCustomers,
      'Ardisik Alirken Duran': summary.lostAfterConsecutiveCount,
      'Nominal Toplam': summary.totalRawAmount,
      'Bugunku Deger Toplam': summary.totalAdjustedAmount,
      'Tahmini Kayip Bugunku': summary.totalLostPotentialAdjusted,
      'Ortalama Katsayi': summary.averageMultiplier,
      'Guncel USD/TL': cacheEntry.usdRate.rate,
      'Guncel Kur Kaynagi': cacheEntry.usdRate.source,
      'Guncel Kur Tarihi': cacheEntry.usdRate.fetchedAt,
      'Gecmis Kur Kaynagi': 'MIKRO_STH_ALT_DOVIZ_KURU',
      'Baslangic': formatDateKey(normalized.startDate),
      'Bitis': formatDateKey(normalized.endDate),
      'Sektor Filtresi': normalized.sectorCode || 'Tumu',
      'Arama': normalized.search || '',
      'Pasif Ay Esigi': normalized.inactiveMonths,
      'Min Ardisik Aktif Ay': normalized.minConsecutiveMonths,
      'Anlamli Ay Cirosu': normalized.minMonthlyAmount,
      'Min Bugunku Toplam': normalized.minTotalAdjustedAmount,
      'Sadece Ardisik Alirken Duran': normalized.onlyLostFrequent ? 'Evet' : 'Hayir',
    }]), 'Ozet');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return {
      buffer,
      fileName: `cari-degerlenmis-ciro-${formatDateKey(normalized.startDate)}-${formatDateKey(normalized.endDate)}.xlsx`,
    };
  }
}

export default new CustomerRecoveryService();
