/**
 * Reports Service
 *
 * RaporlarÄ± PostgreSQL'den (senkronize edilmiÅŸ verilerden) Ã¼retir.
 * Mikro'ya her seferinde baÄŸlanmaya gerek yok, sabah sync'te Ã§ekilen veriler kullanÄ±lÄ±r.
 */

import { CustomerActivityType, Prisma, UserRole } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { config } from '../config';
import { AppError, ErrorCode } from '../types/errors';
import mikroService from './mikro.service';
import exclusionService from './exclusion.service';
import priceListService from './price-list.service';
import pricingService from './pricing.service';
import { resolveCustomerPriceLists, resolveCustomerPriceListsForProduct } from '../utils/customerPricing';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '../utils/search';
import { parseTier6Cutover } from '../utils/tier6-cutover';
import {
  CAMPAIGN_PRICE_LIST_NOS,
  getPriceListDefinition,
  getPriceListLabel,
  LEGACY_STANDARD_PRICE_LIST_NOS,
  STANDARD_PRICE_LIST_DEFINITIONS,
  STANDARD_PRICE_LIST_NOS,
} from '../config/price-list-registry';
import { createHash, randomUUID } from 'crypto';
import * as XLSX from 'xlsx';
import * as sql from 'mssql';

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

type UcarerMinMaxJobStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

interface ReportRequestScope {
  userId?: string | null;
  role?: string | null;
  assignedSectorCodes?: string[] | null;
}

const getSalesRepSectorCodes = (scope?: ReportRequestScope) =>
  scope?.role === UserRole.SALES_REP
    ? Array.from(new Set((scope.assignedSectorCodes || []).map((code) => String(code || '').trim()).filter(Boolean)))
    : [];

interface UcarerMinMaxJobState {
  id: string;
  status: UcarerMinMaxJobStatus;
  startedAt: string;
  finishedAt?: string | null;
  requestedById?: string | null;
  data?: {
    rows: Record<string, any>[];
    columns: string[];
    total: number;
  } | null;
  error?: string | null;
}

// Margin Compliance types
interface MarginComplianceAlert {
  productCode: string;
  productName: string;
  category: string;
  currentCost: number;
  customerType: string;
  expectedMargin: number; // % kar marjÃ„Â± (e.g., 60 for 1.6x multiplier)
  expectedPrice: number;
  actualPrice: number;
  deviation: number; // % deviation
  deviationAmount: number; // TL deviation
  status: 'OK' | 'HIGH' | 'LOW'; // OK: Ã‚Â±2%, HIGH: >2%, LOW: <-2%
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
  consistencyApplicable: boolean;
  isConsistent: boolean;
  /** Backward-compatible count of standard lists only. */
  updatedListsCount: number;
  updatedStandardListsCount: number;
  expectedStandardListCount: number;
  updatedCampaignLists: number[];
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
    consistencyNotApplicableChanges: number;
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


interface ComplementMissingItem {
  productCode: string;
  productName: string;
  estimatedQuantity?: number | null;
  unitPrice?: number | null;
  estimatedRevenue?: number | null;
}

type ComplementMatchMode = 'product' | 'category' | 'group';

interface ComplementMissingRow {
  customerCode?: string;
  customerName?: string;
  productCode?: string;
  productName?: string;
  documentCount?: number;
  lastPurchaseDate: string | null;
  daysSinceLastPurchase: number | null;
  missingComplements: ComplementMissingItem[];
  missingCount: number;
  estimatedRevenue: number | null;
}

type ComplementAssociationSource = 'AUTO' | 'MANUAL' | 'MIXED' | 'NONE';

interface ComplementMissingReportResponse {
  rows: ComplementMissingRow[];
  summary: {
    totalRows: number;
    totalMissing: number;
    totalEstimatedRevenue: number | null;
    rowsWithRevenueEstimate: number;
    pricedMissingItems: number;
    unpricedMissingItems: number;
    averageMissingPerRow: number;
  };
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    totalRecords: number;
  };
  metadata: {
    mode: 'product' | 'customer';
    matchMode: ComplementMatchMode;
    periodMonths: number;
    startDate: string;
    endDate: string;
    baseProduct?: {
      productCode: string;
      productName: string;
    };
    customer?: {
      customerCode: string;
      customerName: string | null;
    };
    sectorCode?: string | null;
    salesRep?: {
      id: string;
      name: string | null;
      email: string | null;
      assignedSectorCodes: string[];
    };
    minDocumentCount?: number | null;
    associationSource: ComplementAssociationSource;
    associationWindowStart: string | null;
    associationWindowEnd: string | null;
    associationUpdatedAt: string | null;
  };
}

type CategoryChurnMode = 'category' | 'customer';
type CategoryChurnSortBy =
  | 'customerCode'
  | 'customerName'
  | 'customerSectorCode'
  | 'customerLastSaleDate'
  | 'categoryCode'
  | 'categoryName'
  | 'lastPurchaseDate'
  | 'historicalDocumentCount'
  | 'historicalQuantity'
  | 'historicalAmount';
type CategoryChurnSortDirection = 'asc' | 'desc';

interface CategoryChurnRow {
  customerCode?: string;
  customerName?: string | null;
  customerSectorCode?: string | null;
  customerLastSaleDate?: string | null;
  daysSinceCustomerLastSale: number | null;
  categoryCode?: string;
  categoryName?: string | null;
  lastPurchaseDate: string | null;
  daysSinceCategoryPurchase: number | null;
  customerActiveOutsideCategory: boolean;
  historicalDocumentCount: number;
  historicalQuantity: number;
  historicalAmount: number;
}

interface CategoryChurnDetailItem {
  productCode: string;
  productName: string;
  firstPurchaseDate: string | null;
  lastPurchaseDate: string | null;
  documentCount: number;
  totalQuantity: number;
  totalAmount: number;
}

interface CategoryChurnReportResponse {
  rows: CategoryChurnRow[];
  summary: {
    totalRows: number;
    affectedCustomers: number;
    affectedCategories: number;
    historicalRevenue: number;
    activeOutsideCategoryCustomers: number;
    averageInactiveDays: number | null;
  };
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    totalRecords: number;
  };
  metadata: {
    mode: CategoryChurnMode;
    inactiveMonths: number;
    inactiveStartDate: string;
    endDate: string;
    activeCustomerMonths: number | null;
    sectorCode: string | null;
    minHistoricalDocumentCount: number | null;
    minHistoricalAmount: number | null;
    category?: {
      categoryCode: string;
      categoryName: string | null;
    };
    customer?: {
      customerCode: string;
      customerName: string | null;
    };
  };
}

interface CategoryOpportunitySourceProduct {
  productCode: string;
  productName: string;
  pairCount: number;
  customerDocumentCount: number;
}

interface CategoryOpportunityRecommendation {
  recommendedProductCode: string;
  recommendedProductName: string;
  weightedScore: number;
  associationDocumentCount: number;
  sourceProductCount: number;
  sourceProducts: CategoryOpportunitySourceProduct[];
}

interface CategoryOpportunityRow {
  customerCode: string;
  customerName: string | null;
  customerSectorCode: string | null;
  totalOpportunityScore: number;
  recommendationCount: number;
  sourceDocumentCount: number;
  sourceRevenue: number;
  lastSourcePurchaseDate: string | null;
  daysSinceLastSourcePurchase: number | null;
  recommendations: CategoryOpportunityRecommendation[];
}

interface CategoryOpportunityReportResponse {
  rows: CategoryOpportunityRow[];
  summary: {
    totalCustomers: number;
    totalRecommendations: number;
    scannedCustomers: number;
    excludedBecauseAlreadyBoughtCategory: number;
    eligibleCustomers: number;
    coverageRate: number;
    averageOpportunityScore: number;
  };
  metadata: {
    category: {
      categoryCode: string;
      categoryName: string | null;
      productCount: number;
    };
    customerFilterCode: string | null;
    lookbackMonths: number;
    minPairCount: number;
    startDate: string;
    endDate: string;
    sectorCode: string | null;
    minOpportunityScore: number | null;
    minRecommendationCount: number | null;
    candidateSourceProductCount: number;
    associationWindowStart: string | null;
    associationWindowEnd: string | null;
    associationUpdatedAt: string | null;
  };
}

interface CustomerActivityDailyCount {
  date: string;
  count: number;
}

interface CustomerActivitySummary {
  totalEvents: number;
  uniqueUsers: number;
  pageViews: number;
  productViews: number;
  cartAdds: number;
  cartRemoves: number;
  cartUpdates: number;
  activeSeconds: number;
  clickCount: number;
  searchCount: number;
  dailyCounts: CustomerActivityDailyCount[];
}

interface CustomerActivityTopPage {
  pagePath: string;
  count: number;
}

interface CustomerActivityTopClickPage {
  pagePath: string;
  clickCount: number;
  eventCount: number;
}

interface CustomerActivityTopProduct {
  productId: string | null;
  productCode: string | null;
  productName: string | null;
  count: number;
}

interface CustomerActivityTopUser {
  userId: string;
  userName: string | null;
  customerCode: string | null;
  customerName: string | null;
  eventCount: number;
  activeSeconds: number;
  clickCount: number;
  searchCount: number;
}

interface CustomerActivityEventRow {
  id: string;
  type: CustomerActivityType;
  createdAt: Date;
  pagePath: string | null;
  pageTitle: string | null;
  productCode: string | null;
  productName: string | null;
  quantity: number | null;
  durationSeconds: number | null;
  clickCount: number | null;
  meta: Prisma.JsonValue | null;
  userId: string;
  userName: string | null;
  customerCode: string | null;
  customerName: string | null;
}

interface CustomerActivityReportResponse {
  summary: CustomerActivitySummary;
  topPages: CustomerActivityTopPage[];
  topClickPages: CustomerActivityTopClickPage[];
  topProducts: CustomerActivityTopProduct[];
  topUsers: CustomerActivityTopUser[];
  events: CustomerActivityEventRow[];
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    totalRecords: number;
  };
  metadata: {
    startDate: string;
    endDate: string;
    customer?: {
      id: string;
      code: string;
      name: string | null;
    } | null;
    userId?: string | null;
  };
}

interface StaffActivitySummary {
  totalEvents: number;
  uniqueStaff: number;
  activeSeconds: number;
  clickCount: number;
  getCount: number;
  postCount: number;
  putCount: number;
  patchCount: number;
  deleteCount: number;
}

interface StaffActivityTopRoute {
  route: string;
  count: number;
}

interface StaffActivityTopUser {
  userId: string;
  userName: string | null;
  email: string | null;
  role: UserRole;
  eventCount: number;
  activeSeconds: number;
  clickCount: number;
}

interface StaffActivityEventRow {
  id: string;
  createdAt: Date;
  userId: string;
  userName: string | null;
  email: string | null;
  role: UserRole;
  method: string;
  route: string | null;
  action: string;
  details: string | null;
  statusCode: number | null;
  durationMs: number | null;
  pageTitle: string | null;
  pagePath: string | null;
  meta: Prisma.JsonValue | null;
}

interface StaffActivityReportResponse {
  summary: StaffActivitySummary;
  topRoutes: StaffActivityTopRoute[];
  topUsers: StaffActivityTopUser[];
  events: StaffActivityEventRow[];
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    totalRecords: number;
  };
  metadata: {
    startDate: string;
    endDate: string;
    role: UserRole | null;
    userId: string | null;
  };
}

interface CustomerCartItemRow {
  id: string;
  productId: string;
  productCode: string | null;
  productName: string | null;
  quantity: number;
  priceType: string;
  priceMode: string;
  unitPrice: number;
  totalPrice: number;
  updatedAt: Date;
}

interface CustomerCartRow {
  cartId: string;
  userId: string;
  userName: string | null;
  customerCode: string | null;
  customerName: string | null;
  isSubUser: boolean;
  updatedAt: Date;
  lastItemAt: Date | null;
  itemCount: number;
  totalQuantity: number;
  totalAmount: number;
  items: CustomerCartItemRow[];
}

interface CustomerCartsReportResponse {
  carts: CustomerCartRow[];
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    totalRecords: number;
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

const parseDateKeyToUtcDate = (dateKey: string): Date | null => {
  const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
};

const normalizeReportDateKey = (value: unknown): string | null => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateKey(value);
  }

  const raw = String(value).trim();
  if (!raw) return null;
  const datePrefix = raw.match(/^(\d{4})[-/.]?(\d{2})[-/.]?(\d{2})/);
  if (datePrefix) {
    const date = new Date(
      Date.UTC(Number(datePrefix[1]), Number(datePrefix[2]) - 1, Number(datePrefix[3]))
    );
    return Number.isNaN(date.getTime()) ? null : formatDateKey(date);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : formatDateKey(parsed);
};

const daysSinceUtcCalendarDate = (
  reportEnd: Date,
  dateKey: string | null
): number | null => {
  if (!dateKey) return null;
  const date = parseDateKeyToUtcDate(dateKey);
  if (!date || Number.isNaN(date.getTime())) return null;
  const reportEndUtcDay = Date.UTC(
    reportEnd.getUTCFullYear(),
    reportEnd.getUTCMonth(),
    reportEnd.getUTCDate()
  );
  return Math.max(0, Math.floor((reportEndUtcDay - date.getTime()) / 86_400_000));
};

const formatDateKeyInTimeZone = (date: Date, timeZone: string): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
};

const STAFF_ACTIVITY_HIDDEN_ROUTE_TOKENS = ['/notifications'];

const UCARER_MERKEZ_DEPO_SQL = `
SELECT
DMD.[STOK KODU],
DMD.[STOK ADI],
DMD.[Merkez Depo] AS [Merkez Depo Miktari],
DMD.[Al\u0131nan Sipari\u015fte Bekleyen] AS [Alinan Sipariste Bekleyen],
DMD.[Al\u0131nan Siparis Tarihi] AS [Alinan Siparis Ilk Tarihi],
DMD.[SIPARIS SONRASI DEPODAKI MIKTAR] AS [Alinan Siparis Sonrasi Depo Ihtiyac Durumu 1.SORUN],
ISNULL((SELECT KALAN FROM DEPOLAR_ARASI_SIPARIS_PORTO WHERE SKOD = DMD.[STOK KODU] AND DEPO = '1'), 0) AS [Diger Depolardan Gelecek Dsv Toplamlari],
(DMD.[SIPARIS SONRASI DEPODAKI MIKTAR]) + (ISNULL((SELECT KALAN FROM DEPOLAR_ARASI_SIPARIS_PORTO WHERE SKOD = DMD.[STOK KODU] AND DEPO = '1'), 0)) AS [Gelecek Dsv Sonrasi Ihtiyac Durumu 2. SORUN],
DMD.[Verilen Sipari\u015fte Bekleyen] AS [Verilen Sipariste Bekleyen],
CASE
WHEN DMD.[Verilen Tarihi] = '01.01.1900' THEN ''
WHEN DMD.[Verilen Tarihi] NOT LIKE '01.01.1900' THEN DMD.[Verilen Tarihi]
END AS [Verilen Siparis Son Tarihi],
DMD.[DEPO + VERILEN SIPARIS MIKTARI],
DMD.[REEL MIKTAR] AS [Satinalma Siparisi Sonrasi Ihtiyac Durumu 3.SORUN],
DMD.[Merkez Minimum Miktar],
DMD.[Merkez Maximum Miktar],
CASE
WHEN DMD.[REEL MIKTAR] < DMD.[Merkez Minimum Miktar] THEN (DMD.[Merkez Maximum Miktar] - DMD.[REEL MIKTAR])
WHEN DMD.[REEL MIKTAR] > DMD.[Merkez Minimum Miktar] AND DMD.[Merkez Minimum Miktar] = '0' THEN (DMD.[Merkez Maximum Miktar] - DMD.[REEL MIKTAR])
WHEN DMD.[REEL MIKTAR] > DMD.[Merkez Minimum Miktar] AND DMD.[REEL MIKTAR] > DMD.[Merkez Maximum Miktar] THEN (DMD.[Merkez Maximum Miktar] - DMD.[REEL MIKTAR])
WHEN DMD.[REEL MIKTAR] > DMD.[Merkez Minimum Miktar] THEN '0'
WHEN DMD.[REEL MIKTAR] = DMD.[Merkez Minimum Miktar] THEN '0'
END AS [Eksiltilecek Ilave Verilecek Islem Yapilmayacak Miktar Durumu 4. SORUN],
dbo.fn_DepodakiMiktar(DMD.[STOK KODU], 7, 0) AS [Dukkan Depo],
dbo.fn_DepodakiMiktar(DMD.[STOK KODU], 1, 0) AS [Merkez Depo],
dbo.fn_DepodakiMiktar(DMD.[STOK KODU], 2, 0) AS [Eregli Depo],
dbo.fn_DepodakiMiktar(DMD.[STOK KODU], 6, 0) AS [Topca Depo],
(dbo.fn_DepodakiMiktar(DMD.[STOK KODU], 6, 0)) + (dbo.fn_DepodakiMiktar(DMD.[STOK KODU], 2, 0)) + (dbo.fn_DepodakiMiktar(DMD.[STOK KODU], 1, 0)) + (dbo.fn_DepodakiMiktar(DMD.[STOK KODU], 7, 0)) AS [4 Depo Toplam Miktari]
FROM DEPO_MERKEZ_DURUM DMD
`;

const UCARER_TOPCA_DEPO_SQL = `
SELECT
DTD.[STOK KODU],
DTD.[STOK ADI],
DTD.[Topca Depo] AS [Topca Depo Miktari],
DTD.[Al\u0131nan Sipari\u015fte Bekleyen] AS [Alinan Sipariste Bekleyen],
DTD.[Al\u0131nan Siparis Tarihi] AS [Alinan Siparis Ilk Tarihi],
DTD.[SIPARIS SONRASI DEPODAKI MIKTAR] AS [Alinan Siparis Sonrasi Depo Ihtiyac Durumu 1.SORUN],
ISNULL((SELECT KALAN FROM DEPOLAR_ARASI_SIPARIS_PORTO WHERE SKOD = DTD.[STOK KODU] AND DEPO = '6'), 0) AS [Diger Depolardan Gelecek Dsv Toplamlari],
(DTD.[SIPARIS SONRASI DEPODAKI MIKTAR]) + (ISNULL((SELECT KALAN FROM DEPOLAR_ARASI_SIPARIS_PORTO WHERE SKOD = DTD.[STOK KODU] AND DEPO = '6'), 0)) AS [Gelecek Dsv Sonrasi Ihtiyac Durumu 2. SORUN],
DTD.[Verilen Sipari\u015fte Bekleyen] AS [Verilen Sipariste Bekleyen],
CASE
WHEN DTD.[Verilen Tarihi] = '01.01.1900' THEN ''
WHEN DTD.[Verilen Tarihi] NOT LIKE '01.01.1900' THEN DTD.[Verilen Tarihi]
END AS [Verilen Siparis Son Tarihi],
DTD.[DEPO + VERILEN SIPARIS MIKTARI],
DTD.[REEL MIKTAR] AS [Satinalma Siparisi Sonrasi Ihtiyac Durumu 3.SORUN],
DTD.[Merkez Minimum Miktar],
DTD.[Merkez Maximum Miktar],
CASE
WHEN DTD.[REEL MIKTAR] < DTD.[Merkez Minimum Miktar] THEN (DTD.[Merkez Maximum Miktar] - DTD.[REEL MIKTAR])
WHEN DTD.[REEL MIKTAR] > DTD.[Merkez Minimum Miktar] AND DTD.[Merkez Minimum Miktar] = '0' THEN (DTD.[Merkez Maximum Miktar] - DTD.[REEL MIKTAR])
WHEN DTD.[REEL MIKTAR] > DTD.[Merkez Minimum Miktar] AND DTD.[REEL MIKTAR] > DTD.[Merkez Maximum Miktar] THEN (DTD.[Merkez Maximum Miktar] - DTD.[REEL MIKTAR])
WHEN DTD.[REEL MIKTAR] > DTD.[Merkez Minimum Miktar] THEN '0'
WHEN DTD.[REEL MIKTAR] = DTD.[Merkez Minimum Miktar] THEN '0'
END AS [Eksiltilecek Ilave Verilecek Islem Yapilmayacak Miktar Durumu 4. SORUN],
dbo.fn_DepodakiMiktar(DTD.[STOK KODU], 7, 0) AS [Dukkan Depo],
dbo.fn_DepodakiMiktar(DTD.[STOK KODU], 1, 0) AS [Merkez Depo],
dbo.fn_DepodakiMiktar(DTD.[STOK KODU], 2, 0) AS [Eregli Depo],
dbo.fn_DepodakiMiktar(DTD.[STOK KODU], 6, 0) AS [Topca Depo],
(dbo.fn_DepodakiMiktar(DTD.[STOK KODU], 6, 0)) + (dbo.fn_DepodakiMiktar(DTD.[STOK KODU], 2, 0)) + (dbo.fn_DepodakiMiktar(DTD.[STOK KODU], 1, 0)) + (dbo.fn_DepodakiMiktar(DTD.[STOK KODU], 7, 0)) AS [4 Depo Toplam Miktari]
FROM DEPO_TOPCA_DURUM DTD
`;

const UCARER_CUSTOMER_ORDER_NEED_COLUMN = 'Acil Musteri Siparis Ihtiyaci';
const UCARER_ZERO_MAX_COMPAT_VALUE = 0.000001;

const addUcarerCustomerOrderNeedCompatibility = (rows: any[]) => {
  if (!Array.isArray(rows) || rows.length === 0) return;

  const keys = Object.keys(rows[0] || {});
  const findKey = (predicate: (normalized: string) => boolean) =>
    keys.find((key) => predicate(normalizeKeyToken(key)));

  const incomingOrderKey = findKey((key) => key.includes('alinansiparistebekleyen'));
  const depotQtyKey = findKey((key) => key.includes('depomiktari'));
  const outgoingOrderKey = findKey((key) => key.includes('verilensiparistebekleyen'));
  const incomingDsvKey = findKey((key) =>
    key.includes('digerdepolardangelecekdsv') || key.includes('gelecekdsvtoplam')
  );
  const maxQtyKey = findKey((key) => key.includes('maximummiktar'));
  const realQtyKey = findKey((key) => key.includes('reelmiktar') || key.includes('satinalmasiparisisonrasi'));

  if (!incomingOrderKey) return;

  rows.forEach((row) => {
    const incomingCustomerOrders = Math.max(0, toNumber(row?.[incomingOrderKey]));
    const depotQty = depotQtyKey ? Math.max(0, toNumber(row?.[depotQtyKey])) : 0;
    const outgoingSupplierOrders = outgoingOrderKey ? Math.max(0, toNumber(row?.[outgoingOrderKey])) : 0;
    const incomingDsv = incomingDsvKey ? Math.max(0, toNumber(row?.[incomingDsvKey])) : 0;
    const uncoveredCustomerOrderNeed = Math.max(
      0,
      Math.ceil(incomingCustomerOrders - depotQty - outgoingSupplierOrders - incomingDsv)
    );

    row[UCARER_CUSTOMER_ORDER_NEED_COLUMN] = uncoveredCustomerOrderNeed;

    // Eski frontend bundle'lari INCLUDE_MINMAX modunda MAX <= 0 ise satiri oneriden siliyordu.
    // Musteri siparisi acik ve karsiliksizse satiri gorunur tutmak icin sadece API cevabinda
    // sifira cok yakin pozitif bir max isareti kullanilir; Mikro min/max degerleri yazilmaz.
    if (
      uncoveredCustomerOrderNeed > 0 &&
      maxQtyKey &&
      toNumber(row?.[maxQtyKey]) <= 0 &&
      (!realQtyKey || toNumber(row?.[realQtyKey]) < 0)
    ) {
      row[maxQtyKey] = UCARER_ZERO_MAX_COMPAT_VALUE;
    }
  });
};

const isLikelyRouteIdSegment = (segment: string): boolean => {
  if (!segment) return false;
  if (/^\d{3,}$/.test(segment)) return true;
  if (/^[0-9a-f]{24}$/i.test(segment)) return true;
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(segment)
  ) {
    return true;
  }
  return false;
};

const normalizeRouteForAction = (route?: string | null): string => {
  const raw = String(route || '').trim();
  if (!raw) return '/';
  const [pathOnly] = raw.split('?');
  const normalized = pathOnly
    .split('/')
    .filter(Boolean)
    .map((segment) => (isLikelyRouteIdSegment(segment) ? ':id' : segment))
    .join('/');
  return `/${normalized}`;
};

const summarizeMetaKeys = (value: unknown): string | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value as Record<string, unknown>).filter(Boolean);
  return keys.length ? keys.slice(0, 6).join(', ') : null;
};

const buildStaffEventDetails = (meta: Record<string, any>): string | null => {
  const chunks: string[] = [];
  const queryKeys = summarizeMetaKeys(meta.query);
  if (queryKeys) chunks.push(`query: ${queryKeys}`);

  const bodyKeys =
    Array.isArray(meta.bodyKeys) ? meta.bodyKeys.filter((key: unknown) => typeof key === 'string' && key.trim()) : [];
  if (bodyKeys.length) chunks.push(`body: ${bodyKeys.slice(0, 6).join(', ')}`);

  const originalUrl = typeof meta.originalUrl === 'string' ? meta.originalUrl.trim() : '';
  if (originalUrl.includes('?') && chunks.length === 0) chunks.push(`url: ${originalUrl}`);

  return chunks.length ? chunks.join(' | ') : null;
};

const subtractMonthsUtc = (date: Date, months: number): Date => {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() - months);
  return next;
};

const normalizeReportCode = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().toUpperCase();
};

const COMPLEMENT_REPORT_LIMIT = 10;
const REPORT_CODE_BATCH_SIZE = 900;
const REPORT_CUSTOMER_BATCH_SIZE = 200;

const chunkArray = <T>(items: T[], size: number): T[][] => {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const escapeSqlLiteral = (value: string): string => value.replace(/'/g, "''");

const addDaysUtc = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const startOfMonthUtc = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const endOfMonthUtc = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));

const isSameUtcDate = (left: Date, right: Date): boolean => formatDateKey(left) === formatDateKey(right);

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

let marginDefaultSectorCodesCache: { codes: string[]; fetchedAt: number } | null = null;
let marginSectorScopeState: { source: 'SETTINGS' | 'MIKRO' | 'STALE_CACHE'; warning: string | null } = {
  source: 'MIKRO',
  warning: null,
};

const stableJsonStringify = (value: unknown): string => {
  if (value === null || value === undefined) return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableJsonStringify).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJsonStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

const attachDeterministicRowKeys = <T extends { data: Record<string, any> }>(rows: T[]): Array<T & { rowKey: string }> => {
  const occurrences = new Map<string, number>();
  return rows.map((row) => {
    const baseHash = sha256(stableJsonStringify(row.data));
    const occurrence = (occurrences.get(baseHash) || 0) + 1;
    occurrences.set(baseHash, occurrence);
    return { ...row, rowKey: `${baseHash}:${occurrence}` };
  });
};
const DEFAULT_MARGIN_THRESHOLDS: MarginThresholds = { low: 5, high: 70, worstLimit: 15 };

// Marj raporu kullanici bazli dislama servisi (marka / stok kodu / stok adi).
// Ust import blogu yerine require: marj bolgesi disina dokunmamak icin
// (ayni kalip mikroFactory icin de kullaniliyor).
const getMarginExclusionService = () => require('./margin-exclusion.service').default;

const parseNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    let normalized = trimmed.replace(/\s+/g, '');
    if (normalized.includes(',') && normalized.includes('.')) {
      if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
        normalized = normalized.replace(/\./g, '').replace(',', '.');
      } else {
        normalized = normalized.replace(/,/g, '');
      }
    } else if (normalized.includes(',')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const toNumber = (value: unknown): number => parseNumberOrNull(value) ?? 0;

const hasNumericValue = (value: unknown): boolean => {
  return parseNumberOrNull(value) !== null;
};

const areSameMoney = (left: number, right: number): boolean => {
  if (left <= 0 || right <= 0) return false;
  return Math.abs(left - right) < 0.01;
};

const isNoVatSaleRow = (data: Record<string, any>): boolean => {
  const rawStatus = resolveDataValueByCandidates(
    data,
    ['SatısDurumu', 'SatisDurumu', 'SatışDurumu', 'Satış Durumu'],
    'satisdurumu'
  );
  const status = normalizeKeyToken(rawStatus);
  if (status.includes('vergiyok')) return true;
  if (status.includes('vergivar')) return false;
  return toNumber(resolveDataValueByCandidates(data, ['Vergi'], 'vergi')) === 0;
};

const pickCurrentCostWithoutVat = (data: Record<string, any>): number => {
  const value = resolveDataValueByCandidates(data, ['A.Teklif+'], 'ateklif');
  return toNumber(value);
};

const pickCurrentCostWithVat = (data: Record<string, any>): number => {
  const value = resolveDataValueByCandidates(data, ['A.TeklifDahil', 'A.Teklif KDV Dahil'], 'ateklifdahil');
  return toNumber(value);
};

const pickHalfVatFactor = (data: Record<string, any>): number => {
  const ratioCandidates: Array<[unknown, unknown]> = [
    [resolveDataValueByCandidates(data, ['P1'], 'p1'), resolveDataValueByCandidates(data, ['F1'], 'f1')],
    [resolveDataValueByCandidates(data, ['P3'], 'p3'), resolveDataValueByCandidates(data, ['F3'], 'f3')],
    [resolveDataValueByCandidates(data, ['P5'], 'p5'), resolveDataValueByCandidates(data, ['F5'], 'f5')],
    [pickCurrentCostWithVat(data), pickCurrentCostWithoutVat(data)],
  ];

  for (const [withHalfVat, withoutHalfVat] of ratioCandidates) {
    const left = toNumber(withHalfVat);
    const right = toNumber(withoutHalfVat);
    if (left > 0 && right > 0) {
      const ratio = left / right;
      if (ratio > 1 && ratio < 1.3) return ratio;
    }
  }

  const revenue = toNumber(resolveDataValueByCandidates(data, ['Tutar'], 'tutar'));
  const vat = toNumber(resolveDataValueByCandidates(data, ['Vergi'], 'vergi'));
  if (revenue > 0 && vat > 0) {
    return 1 + (vat / revenue) / 2;
  }

  const entryCost = toNumber(resolveDataValueByCandidates(data, ['SÖ-BirimMaliyet', 'SO-BirimMaliyet'], 'sobirimmaliyet'));
  const entryCostVat = toNumber(resolveDataValueByCandidates(data, ['Sö-BirimMaliyetKdv', 'SO-BirimMaliyetKdv'], 'sobirimmaliyetkdv'));
  if (entryCost > 0 && entryCostVat > entryCost) {
    return 1 + ((entryCostVat / entryCost) - 1) / 2;
  }

  return 1.1;
};

const pickCurrentCostBasis = (data: Record<string, any>): number => {
  const noVatSale = isNoVatSaleRow(data);
  const withoutVat = pickCurrentCostWithoutVat(data);
  const withVat = pickCurrentCostWithVat(data);
  const halfVatFactor = pickHalfVatFactor(data);
  const sameCost = areSameMoney(withoutVat, withVat);

  if (noVatSale) {
    if (sameCost) return withVat * halfVatFactor;
    return hasNumericValue(withVat) && withVat > 0 ? withVat : withoutVat * halfVatFactor;
  }

  if (sameCost) return withoutVat / halfVatFactor;
  return hasNumericValue(withoutVat) && withoutVat > 0 ? withoutVat : withVat / halfVatFactor;
};

const findValueByExactNormalizedToken = (data: Record<string, any>, token: string): unknown => {
  const normalizedToken = normalizeKeyToken(token);
  const key = Object.keys(data).find((candidate) => normalizeKeyToken(candidate) === normalizedToken);
  return key ? data[key] : null;
};

// Son giris (SO-...) birim maliyet kolonlarini okur. 'sobirimmaliyet' token'i
// 'sobirimmaliyetkdv' icinde de gectigi icin once exact-normalized esleme kullanilir.
const pickEntryUnitCostNet = (data: Record<string, any>): number => {
  const exact = pickValueByKeys(data, ['SÖ-BirimMaliyet', 'SO-BirimMaliyet']);
  if (exact !== null && exact !== undefined) return toNumber(exact);
  const normalized = findValueByExactNormalizedToken(data, 'sobirimmaliyet');
  if (normalized !== null && normalized !== undefined) return toNumber(normalized);
  const key = Object.keys(data).find((candidate) => {
    const token = normalizeKeyToken(candidate);
    return token.includes('birimmaliyet') && !token.includes('kdv');
  });
  return key ? toNumber(data[key]) : 0;
};

const pickEntryUnitCostWithVat = (data: Record<string, any>): number => {
  const exact = pickValueByKeys(data, ['Sö-BirimMaliyetKdv', 'SÖ-BirimMaliyetKdv', 'SO-BirimMaliyetKdv']);
  if (exact !== null && exact !== undefined) return toNumber(exact);
  const key = Object.keys(data).find((candidate) => {
    const token = normalizeKeyToken(candidate);
    return token.includes('birimmaliyet') && token.includes('kdv');
  });
  return key ? toNumber(data[key]) : 0;
};

// Son giris maliyetini satirin KDV durumuna gore kar hesap bazina cevirir:
// faturali satirda KDV haric net maliyet, beyaz satirda yarim KDV yuklu maliyet.
const pickEntryUnitCostBasis = (data: Record<string, any>): number => {
  const net = pickEntryUnitCostNet(data);
  const withVat = pickEntryUnitCostWithVat(data);
  const halfVatFactor = pickHalfVatFactor(data);
  const fullVatFactor = 1 + (halfVatFactor - 1) * 2;

  if (isNoVatSaleRow(data)) {
    if (net > 0) return net * halfVatFactor;
    if (withVat > 0 && fullVatFactor > 0) return (withVat / fullVatFactor) * halfVatFactor;
    return 0;
  }

  if (net > 0) return net;
  if (withVat > 0 && fullVatFactor > 0) return withVat / fullVatFactor;
  return 0;
};

const pickCurrentRevenueBasis = (data: Record<string, any>): number => {
  const noVatSale = isNoVatSaleRow(data);
  const withoutVat = resolveDataValueByCandidates(data, ['Tutar'], 'tutar');
  const withVat = resolveDataValueByCandidates(data, ['TutarKDV', 'Tutar KDV', 'VergiDahil'], 'tutarkdv');
  if (noVatSale && hasNumericValue(withVat)) return toNumber(withVat);
  if (hasNumericValue(withoutVat)) return toNumber(withoutVat);
  return toNumber(withVat);
};

const pickCurrentUnitRevenueBasis = (data: Record<string, any>): number => {
  const noVatSale = isNoVatSaleRow(data);
  const withoutVat = resolveDataValueByCandidates(
    data,
    ['BirimSatış', 'BirimSatis', 'Birim Satış', 'Birim Satis'],
    'birimsatis'
  );
  const withVat = resolveDataValueByCandidates(
    data,
    ['BirimSatışKDV', 'BirimSatisKDV', 'Birim Satış KDV', 'Birim Satis KDV'],
    'birimsatiskdv'
  );
  if (noVatSale && hasNumericValue(withVat)) return toNumber(withVat);
  if (hasNumericValue(withoutVat)) return toNumber(withoutVat);
  return toNumber(withVat);
};

// GUNCEL maliyet tabanina gore kar hesabi. Son giris tabani ayridir:
// Mikro'nun kendi SO-... kolonlarindan okunur (pickEntryProfit / pickEntryMargin).
const calculateCurrentProfit = (data: Record<string, any>): { unitProfit: number; totalProfit: number; margin: number; markup: number; costBasis: number; revenueBasis: number; totalCost: number } => {
  const quantity = pickQuantity(data);
  const costBasis = pickCurrentCostBasis(data);
  const revenueBasis = pickCurrentRevenueBasis(data);
  const unitRevenue = pickCurrentUnitRevenueBasis(data);
  const unitProfit = unitRevenue - costBasis;
  const totalProfit = revenueBasis - costBasis * quantity;
  const totalCost = costBasis * quantity;
  // Yonetim raporundaki tek marj tanimi: kar / ciro. Kar / maliyet ayrica
  // "maliyet uzerine kar" (markup) olarak tutulur; alarm esigi olarak kullanilmaz.
  const margin = revenueBasis > 0 ? (totalProfit / revenueBasis) * 100 : 0;
  const markup = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;
  return { unitProfit, totalProfit, margin, markup, costBasis, revenueBasis, totalCost };
};

const pickTotalProfit = (row: Record<string, any>): number => {
  if (!row || typeof row !== 'object') return 0;
  return calculateCurrentProfit(row).totalProfit;
};

const pickTotalCost = (row: Record<string, any>): number => {
  if (!row || typeof row !== 'object') return 0;
  return calculateCurrentProfit(row).totalCost;
};

const formatExportValue = (value: unknown): string | number | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return value as string | number;
};

const getRowData = (row: { data?: unknown }): Record<string, any> => {
  if (row && typeof row.data === 'object' && row.data !== null) {
    return row.data as Record<string, any>;
  }
  return {};
};

const pickValueByKeys = (data: Record<string, any>, keys: string[]): unknown => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const value = data[key];
      if (value !== undefined && value !== null) return value;
    }
  }
  return null;
};

const findValueByToken = (data: Record<string, any>, token: string): unknown => {
  const normalizedToken = token.toLowerCase();
  const key = Object.keys(data).find((candidate) =>
    candidate.toLowerCase().replace(/\s+/g, '').includes(normalizedToken)
  );
  return key ? data[key] : null;
};

const normalizeKeyToken = (value: unknown): string => {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/Ä±/g, 'i')
    .replace(/ÅŸ/g, 's')
    .replace(/ÄŸ/g, 'g')
    .replace(/Ã¼/g, 'u')
    .replace(/Ã¶/g, 'o')
    .replace(/Ã§/g, 'c')
    .replace(/Ã„Â±/g, 'i')
    .replace(/Ã…ÂŸ/g, 's')
    .replace(/Ã„ÂŸ/g, 'g')
    .replace(/ÃƒÂ¼/g, 'u')
    .replace(/ÃƒÂ¶/g, 'o')
    .replace(/ÃƒÂ§/g, 'c')
    .replace(/[^a-z0-9]+/g, '');
};

const findValueByNormalizedToken = (data: Record<string, any>, token: string): unknown => {
  const normalizedToken = normalizeKeyToken(token);
  const key = Object.keys(data).find((candidate) =>
    normalizeKeyToken(candidate).includes(normalizedToken)
  );
  return key ? data[key] : null;
};

const resolveDataValueByCandidates = (
  data: Record<string, any>,
  keys: string[],
  fallbackToken?: string
): unknown => {
  const exact = pickValueByKeys(data, keys);
  if (exact !== null && exact !== undefined) return exact;

  for (const key of keys) {
    const normalized = findValueByNormalizedToken(data, key);
    if (normalized !== null && normalized !== undefined) return normalized;
  }

  if (fallbackToken) {
    const fallback = findValueByNormalizedToken(data, fallbackToken);
    if (fallback !== null && fallback !== undefined) return fallback;
  }

  return null;
};


const pickUnitProfit = (data: Record<string, any>): number => {
  return calculateCurrentProfit(data).unitProfit;
};

const pickAvgMargin = (data: Record<string, any>): number => {
  return calculateCurrentProfit(data).margin;
};

const pickEntryProfitValue = (data: Record<string, any>): number | null => {
  const resolved = resolveDataValueByCandidates(
    data,
    ['SÃ–-ToplamKar', 'SO-ToplamKar', 'SÃƒâ€“-ToplamKar'],
    'sotoplamkar'
  );
  if (resolved !== null && resolved !== undefined) {
    return parseNumberOrNull(resolved);
  }
  const direct = pickValueByKeys(data, ['SÃ–-ToplamKar', 'SÃƒâ€“-ToplamKar']);
  if (direct !== null && direct !== undefined) {
    return parseNumberOrNull(direct);
  }
  const fallback = findValueByNormalizedToken(data, 'sotoplamkar');
  return parseNumberOrNull(fallback);
};

const pickEntryProfit = (data: Record<string, any>): number => pickEntryProfitValue(data) ?? 0;

const pickCurrentCost = (data: Record<string, any>): number => {
  // Guncel maliyet, satirin KDV duzlemine cevrilmis hali.
  return pickCurrentCostBasis(data);
};

const pickEntrySourceMargin = (data: Record<string, any>): number | null => {
  const resolved = resolveDataValueByCandidates(
    data,
    ['SÃ–-KarYuzde', 'SO-KarYuzde', 'SÃƒâ€“-KarYuzde', 'SÃ–-KarYÃ¼zde'],
    'sokaryuzde'
  );
  if (resolved !== null && resolved !== undefined) {
    return parseNumberOrNull(resolved);
  }

  return null;
};

const pickEntryMargin = (data: Record<string, any>, revenue?: number): number => {
  const safeRevenue = Number.isFinite(revenue) ? Number(revenue) : pickRevenue(data);
  const entryProfit = pickEntryProfitValue(data);
  if (entryProfit === null) return 0;
  return safeRevenue > 0 ? (entryProfit / safeRevenue) * 100 : 0;
};


const pickStockName = (data: Record<string, any>): string => {
  const resolved = resolveDataValueByCandidates(
    data,
    ['Stok Ä°smi', 'Stok Ismi', 'Stok ?smi', 'Stok ??smi'],
    'stokismi'
  );
  if (resolved !== null && resolved !== undefined) {
    return String(resolved);
  }
  const direct = pickValueByKeys(data, ['Stok ?smi', 'Stok ??smi', 'Stok Ismi']);
  if (direct !== null && direct !== undefined) {
    return String(direct);
  }
  const fallback = findValueByNormalizedToken(data, 'stokismi');
  return fallback ? String(fallback) : '';
};

const pickStockCode = (data: Record<string, any>): string => {
  const direct = pickValueByKeys(data, ['Stok Kodu']);
  if (direct !== null && direct !== undefined) {
    return String(direct);
  }
  const fallback = findValueByToken(data, 'stokkodu');
  return fallback ? String(fallback) : '';
};

const pickCustomerName = (data: Record<string, any>): string => {
  const resolved = resolveDataValueByCandidates(
    data,
    ['Cari Ã„Â°smi', 'Cari Ismi', 'Cari Ãƒâ€Ã‚Â°smi', 'Cari ÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â°smi', 'Cari ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°smi'],
    'cariismi'
  );
  if (resolved !== null && resolved !== undefined) {
    return String(resolved);
  }
  const direct = pickValueByKeys(data, [
    'Cari Ismi',
    'Cari Ã„Â°smi',
    'Cari Ãƒâ€Ã‚Â°smi',
    'Cari ÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â°smi',
  ]);
  if (direct !== null && direct !== undefined) {
    return String(direct);
  }
  const fallback = findValueByNormalizedToken(data, 'cariismi');
  return fallback ? String(fallback) : '';
};

const pickCustomerCode = (data: Record<string, any>): string => {
  const direct = pickValueByKeys(data, [
    'Cari Kodu',
    'Cari Kod',
    'Cari Hesap Kodu',
    'CariHesapKodu',
  ]);
  if (direct !== null && direct !== undefined) {
    return String(direct);
  }
  const fallback = findValueByNormalizedToken(data, 'carikodu');
  return fallback ? String(fallback) : '';
};

const pickDocumentType = (data: Record<string, any>): string => {
  const direct = pickValueByKeys(data, ['Tip']);
  if (direct !== null && direct !== undefined) {
    return String(direct);
  }
  const fallback = findValueByToken(data, 'tip');
  return fallback ? String(fallback) : '';
};

const pickQuantity = (data: Record<string, any>): number => {
  return toNumber(pickValueByKeys(data, ['Miktar']));
};

const pickUnit = (data: Record<string, any>): string => {
  const direct = pickValueByKeys(data, ['Birimi', 'Birim']);
  return direct ? String(direct) : '';
};

const pickRevenueNet = (data: Record<string, any>): number =>
  toNumber(resolveDataValueByCandidates(data, ['Tutar'], 'tutar'));

const pickRevenueGross = (data: Record<string, any>): number =>
  toNumber(resolveDataValueByCandidates(data, ['TutarKDV', 'Tutar KDV', 'Tutar KDVli'], 'tutarkdv'));

// Tum rapor, mail ve alarm hesaplari ayni ekonomik gelir bazini kullanir.
// Ham net/brut tutarlar ayri kolonlarda saklanir; beyaz satis KDV duzlemi korunur.
const pickRevenue = (data: Record<string, any>): number => pickCurrentRevenueBasis(data);

// Mikro '01.01.1900' gibi placeholder tarihler gonderebiliyor; bunlari gecersiz say.
const MARGIN_MIN_VALID_YEAR = 1990;

const guardMarginRowDate = (date: Date | null): Date | null => {
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.getUTCFullYear() >= MARGIN_MIN_VALID_YEAR ? date : null;
};

const pickMarginRowDate = (data: Record<string, any>): Date | null => {
  const raw = resolveDataValueByCandidates(
    data,
    ['Evrak Tarihi', 'Belge_Tarihi'],
    'evraktarihi'
  );
  if (!raw) return null;

  if (raw instanceof Date) {
    return guardMarginRowDate(parseDateKeyToUtcDate(formatDateKeyInTimeZone(raw, config.cronTimezone)));
  }

  const text = String(raw).trim();
  const plainDateMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (plainDateMatch) {
    return guardMarginRowDate(parseDateKeyToUtcDate(`${plainDateMatch[1]}-${plainDateMatch[2]}-${plainDateMatch[3]}`));
  }

  // Mikro rapor fonksiyonlari tarihi cogunlukla gun.ay.yil (dd.MM.yyyy) metni olarak dondurur.
  // Bu metni new Date()'e birakmak ABD formati (ay.gun.yil) gibi yorumlanmasina ve ay/gun
  // takasina yol aciyordu; eski tarihli satirlarin gunun raporuna sizmasinin kok nedeni buydu.
  const dayFirstMatch = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T].*)?$/);
  if (dayFirstMatch) {
    const day = Number(dayFirstMatch[1]);
    const month = Number(dayFirstMatch[2]);
    const year = Number(dayFirstMatch[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return guardMarginRowDate(new Date(Date.UTC(year, month - 1, day)));
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;

  return guardMarginRowDate(parseDateKeyToUtcDate(formatDateKeyInTimeZone(parsed, config.cronTimezone)));
};

const pickUnitPrice = (data: Record<string, any>): number => {
  const resolved = resolveDataValueByCandidates(
    data,
    [
      'BirimFiyat',
      'Birim Fiyat',
      'BirimSatis',
      'BirimSatÃ„Â±Ã…Å¸',
      'BirimSatÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸',
      'BirimSatisKDV',
      'BirimSatÃ„Â±Ã…Å¸KDV',
      'BirimSatÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸KDV',
      'BirimSatÃ„Â±Ã…Å¸KDVli',
      'BirimSatÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸KDVli',
    ],
    'birimsatiskdv'
  );
  if (resolved !== null && resolved !== undefined) {
    return toNumber(resolved);
  }
  const direct = pickValueByKeys(data, [
    'BirimFiyat',
    'Birim Fiyat',
    'BirimSatis',
    'BirimSatÃ„Â±Ã…Å¸',
    'BirimSatisKDV',
    'BirimSatÃ„Â±Ã…Å¸KDV',
    'BirimSatÃ„Â±Ã…Å¸KDVli',
  ]);
  if (direct !== null && direct !== undefined) {
    return toNumber(direct);
  }
  const revenue = pickRevenue(data);
  const quantity = pickQuantity(data);
  return quantity > 0 ? revenue / quantity : 0;
};

const buildMarginAlertRow = (
  row: { avgMargin?: number | null; data?: unknown; sectorCode?: string | null }
): MarginAlertRow => {
  const data = getRowData(row);
  const computed = calculateCurrentProfit(data);
  const revenue = pickRevenue(data);
  const profit = computed.totalProfit;
  const entryProfit = pickEntryProfit(data);
  const entryProfitValue = pickEntryProfitValue(data);
  const avgMargin = computed.margin;
  const entryMargin = pickEntryMargin(data, revenue);
  const entrySourceMargin = pickEntrySourceMargin(data);
  const quantity = pickQuantity(data);
  const unit = pickUnit(data);
  // Birim fiyat, marj hesabinda kullanilan gelir bazi ile ayni KDV duzleminde gosterilir.
  const unitRevenue = pickCurrentUnitRevenueBasis(data);

  return {
    documentNo: resolveDocumentKey(data) || '',
    documentType: pickDocumentType(data),
    customerCode: pickCustomerCode(data),
    customerName: pickCustomerName(data),
    productCode: pickStockCode(data),
    productName: pickStockName(data),
    quantity,
    unit,
    quantityLabel: unit ? `${quantity} ${unit}` : `${quantity}`,
    unitPrice: unitRevenue > 0 ? unitRevenue : pickUnitPrice(data),
    unitCost: computed.costBasis,
    unitCostEntry: pickEntryUnitCostBasis(data),
    revenue,
    revenueNet: pickRevenueNet(data),
    revenueGross: pickRevenueGross(data),
    profit,
    entryProfit,
    avgMargin,
    currentMarkup: computed.markup,
    entryMargin,
    entrySourceMargin,
    currentDataAvailable: computed.costBasis > 0 && computed.revenueBasis > 0,
    entryDataAvailable: entryProfitValue !== null && pickEntryUnitCostBasis(data) > 0 && revenue > 0,
    sectorCode: resolveSectorCode(row, data),
  };
};

const splitRowsByType = (
  rows: Array<{ avgMargin?: number | null; data?: unknown; sectorCode?: string | null }>
) => {
  const orderRows: Array<{ avgMargin?: number | null; data?: unknown; sectorCode?: string | null }> = [];
  const salesRows: Array<{ avgMargin?: number | null; data?: unknown; sectorCode?: string | null }> = [];

  rows.forEach((row) => {
    const data = getRowData(row);
    const type = resolveReportType(data);
    if (type === 'order') {
      orderRows.push(row);
    } else {
      salesRows.push(row);
    }
  });

  return { orderRows, salesRows };
};

const sortAlertRows = (
  rows: MarginAlertRow[],
  direction: 'asc' | 'desc',
  field: 'avgMargin' | 'entryMargin'
) => {
  rows.sort((a, b) => {
    const aValue = Number.isFinite(a[field]) ? a[field] : 0;
    const bValue = Number.isFinite(b[field]) ? b[field] : 0;
    return direction === 'asc' ? aValue - bValue : bValue - aValue;
  });
};

const buildAlertSet = (
  rows: Array<{ avgMargin?: number | null; data?: unknown; sectorCode?: string | null }>,
  field: 'avgMargin' | 'entryMargin',
  thresholds: MarginThresholds
): MarginAlertSet => {
  const negative: MarginAlertRow[] = [];
  const low: MarginAlertRow[] = [];
  const high: MarginAlertRow[] = [];
  const missing: MarginAlertRow[] = [];

  rows.forEach((row) => {
    const alertRow = buildMarginAlertRow(row);
    const available = field === 'entryMargin' ? alertRow.entryDataAvailable : alertRow.currentDataAvailable;
    if (!available) {
      missing.push(alertRow);
      return;
    }
    const marginValue = Number.isFinite(alertRow[field]) ? alertRow[field] : 0;
    if (marginValue < 0) {
      negative.push(alertRow);
    } else if (marginValue < thresholds.low) {
      low.push(alertRow);
    }
    if (marginValue > thresholds.high) {
      high.push(alertRow);
    }
  });

  sortAlertRows(negative, 'asc', field);
  sortAlertRows(low, 'asc', field);
  sortAlertRows(high, 'desc', field);

  return { negative, low, high, missing };
};

const buildAlertSummary = (
  rows: Array<{ avgMargin?: number | null; data?: unknown; sectorCode?: string | null }>,
  thresholds: MarginThresholds
): MarginAlertSummary => ({
  current: buildAlertSet(rows, 'avgMargin', thresholds),
  entry: buildAlertSet(rows, 'entryMargin', thresholds),
});

const aggregateRows = (
  rows: Array<{ avgMargin?: number | null; data?: unknown; sectorCode?: string | null }>,
  keyResolver: (row: { avgMargin?: number | null; data?: unknown; sectorCode?: string | null }, data: Record<string, any>) => string,
  nameResolver: (row: { avgMargin?: number | null; data?: unknown; sectorCode?: string | null }, data: Record<string, any>) => string
): MarginAggregateRow[] => {
  const map = new Map<string, MarginAggregateRow>();

  rows.forEach((row) => {
    const data = getRowData(row);
    const key = keyResolver(row, data);
    if (!key) return;
    const name = nameResolver(row, data) || key;
    const revenue = pickRevenue(data);
    const computed = calculateCurrentProfit(data);
    const profit = computed.totalProfit;
    const entryProfit = pickEntryProfit(data);
    const current = map.get(key) || {
      key,
      name,
      revenue: 0,
      cost: 0,
      profit: 0,
      entryProfit: 0,
      avgMargin: 0,
      entryMargin: 0,
      count: 0,
    };
    current.revenue += revenue;
    current.cost += computed.totalCost;
    current.profit += profit;
    current.entryProfit += entryProfit;
    current.count += 1;
    map.set(key, current);
  });

  const results = Array.from(map.values()).map((entry) => {
    // Agregat marj tanimi: kar / ciro (iki taban icin de ayni tanim).
    const avgMargin = entry.revenue > 0 ? (entry.profit / entry.revenue) * 100 : 0;
    const entryMargin = entry.revenue > 0 ? (entry.entryProfit / entry.revenue) * 100 : 0;
    return {
      ...entry,
      avgMargin,
      entryMargin,
    };
  });

  return results;
};

const buildTopBottom = (
  rows: Array<{ avgMargin?: number | null; data?: unknown; sectorCode?: string | null }>,
  keyResolver: (row: { avgMargin?: number | null; data?: unknown; sectorCode?: string | null }, data: Record<string, any>) => string,
  nameResolver: (row: { avgMargin?: number | null; data?: unknown; sectorCode?: string | null }, data: Record<string, any>) => string,
  limit = 10
): MarginTopBottom => {
  const aggregates = aggregateRows(rows, keyResolver, nameResolver);
  const top = [...aggregates].sort((a, b) => b.profit - a.profit).slice(0, limit);
  const bottom = [...aggregates].filter((entry) => entry.profit < 0).sort((a, b) => a.profit - b.profit).slice(0, limit);
  return { top, bottom };
};

// "Fiyat Farki" tipi ozel (sahte) urun kodlari: gercek urun degildir, marj analizini kirletir.
const MARGIN_EXCLUDED_STOCK_CODES = new Set(['B100963', 'B100964', 'B105959']);

// Stok adi bu token'lardan birini iceriyorsa ozel satir kabul edilir (normalize edilmis halde).
const MARGIN_EXCLUDED_NAME_TOKENS = ['fiyatfarki', 'ciroprimi', 'muhtelif'];

const shouldExcludeMarginRow = (data: Record<string, any>): boolean => {
  if (!data || typeof data !== 'object') return false;

  // Iade / iptal satirlari kar marji analizine dahil edilmez.
  const tip = normalizeKeyToken(pickDocumentType(data));
  if (tip.includes('iade') || tip.includes('iptal')) return true;

  // Negatif miktarli satirlar (iade/duzeltme) marj hesabini bozar.
  if (pickQuantity(data) < 0) return true;

  // "Fiyat Farki" turu ozel urun kodlari.
  const stockCode = pickStockCode(data).trim().toUpperCase();
  if (stockCode && MARGIN_EXCLUDED_STOCK_CODES.has(stockCode)) return true;

  const stockNameToken = normalizeKeyToken(pickStockName(data));
  if (stockNameToken && MARGIN_EXCLUDED_NAME_TOKENS.some((token) => stockNameToken.includes(token))) return true;

  // TOPLU sorumluluk merkezi (ic transfer) satirlari min-max/marj analizlerine girmez.
  const srmValue =
    findValueByNormalizedToken(data, 'sorumlulukmerkezi') ??
    findValueByNormalizedToken(data, 'sormerk') ??
    findValueByNormalizedToken(data, 'srmrk');
  if (normalizeKeyToken(srmValue) === 'toplu') return true;

  return false;
};

const filterMarginRowsBySectorCodes = <
  T extends { avgMargin?: number | null; data?: unknown; sectorCode?: string | null }
>(
  rows: T[],
  includedSectorCodes: string[]
): T[] => {
  if (!includedSectorCodes.length) return rows;

  const allowed = new Set(
    includedSectorCodes
      .map((code) => String(code || '').trim().toLocaleUpperCase('tr-TR'))
      .filter(Boolean)
  );

  if (!allowed.size) return rows;

  return rows.filter((row) => {
    const data = getRowData(row);
    const sectorCode = resolveSectorCode(row, data);
    return allowed.has(sectorCode.toLocaleUpperCase('tr-TR'));
  });
};


const DEFAULT_MARGIN_REPORT_EMAIL_COLUMNS = [
  'documentNo',
  'documentType',
  'documentDate',
  'customerName',
  'stockCode',
  'stockName',
  'quantity',
  'unitPrice',
  'revenueNet',
  'revenueGross',
  'avgCost',
  'unitProfit',
  'totalProfit',
  'margin',
  'currentMarkup',
  'entryUnitCost',
  'entryProfit',
  'entryMargin',
  'entrySourceMargin',
];

const BASE_MARGIN_REPORT_COLUMNS: Record<string, { label: string; resolve: (data: Record<string, any>) => unknown }> = {
  documentNo: {
    label: 'Evrak No',
    resolve: (data) => resolveDataValueByCandidates(data, ['Evrak No'], 'evrakno'),
  },
  documentType: {
    label: 'Tip',
    resolve: (data) => resolveDataValueByCandidates(data, ['Tip'], 'tip'),
  },
  documentDate: {
    label: 'Evrak Tarihi',
    resolve: (data) => resolveDataValueByCandidates(data, ['Evrak Tarihi'], 'evraktarihi'),
  },
  customerName: {
    label: 'Cari',
    resolve: (data) => resolveDataValueByCandidates(data, ['Cari Ã„Â°smi', 'Cari Ãƒâ€Ã‚Â°smi', 'Cari Ismi', 'Cari Ä°smi'], 'cariismi'),
  },
  stockCode: {
    label: 'Stok Kodu',
    resolve: (data) => resolveDataValueByCandidates(data, ['Stok Kodu'], 'stokkodu'),
  },
  stockName: {
    label: 'Ürün Adı',
    resolve: (data) => resolveDataValueByCandidates(data, ['Stok Ã„Â°smi', 'Stok Ãƒâ€Ã‚Â°smi', 'Stok Ismi', 'Stok Ä°smi'], 'stokismi'),
  },
  quantity: {
    label: 'Miktar',
    resolve: (data) => {
      const quantity = toNumber(pickValueByKeys(data, ['Miktar']));
      const unit = pickValueByKeys(data, ['Birimi', 'Birim']);
      return unit ? `${quantity} ${unit}` : quantity;
    },
  },
  unitPrice: {
    label: 'Birim Satış',
    resolve: (data) => pickCurrentUnitRevenueBasis(data),
  },
  totalAmount: {
    label: 'Ciro (Hesap Bazı)',
    resolve: (data) => pickRevenue(data),
  },
  revenueNet: {
    label: 'Ciro (KDV Hariç)',
    resolve: (data) => pickRevenueNet(data),
  },
  revenueGross: {
    label: 'Ciro (KDV Dahil)',
    resolve: (data) => pickRevenueGross(data),
  },
  avgCost: {
    label: 'Guncel Maliyet (KDV Duzlemine Gore)',
    resolve: (data) => pickCurrentCost(data),
  },
  unitProfit: {
    label: 'Birim Kar (Guncel)',
    resolve: (data) => pickUnitProfit(data),
  },
  totalProfit: {
    label: 'Toplam Kar (Guncel)',
    resolve: (data) => pickTotalProfit(data),
  },
  margin: {
    label: 'Kâr / Ciro % (Güncel)',
    resolve: (data) => pickAvgMargin(data),
  },
  currentMarkup: {
    label: 'Kâr / Maliyet % (Bilgi)',
    resolve: (data) => calculateCurrentProfit(data).markup,
  },
  entryUnitCost: {
    label: 'Birim Maliyet (Son Giris)',
    resolve: (data) => pickEntryUnitCostBasis(data),
  },
  entryProfit: {
    label: 'Toplam Kar (Son Giris)',
    resolve: (data) => pickEntryProfit(data),
  },
  entryMargin: {
    label: 'Kâr / Ciro % (Son Giriş)',
    resolve: (data) => pickEntryMargin(data),
  },
  entrySourceMargin: {
    label: 'Mikro SÖ % (Bilgi)',
    resolve: (data) => pickEntrySourceMargin(data),
  },
  TeklifAdetKar: {
    label: 'TeklifAdetKar (Hesaplanan)',
    resolve: (data) => pickUnitProfit(data),
  },
  TeklifToplamKar: {
    label: 'TeklifToplamKar (Hesaplanan)',
    resolve: (data) => pickTotalProfit(data),
  },
  TeklifKarYuzde: {
    label: 'TeklifKarYuzde (Hesaplanan)',
    resolve: (data) => pickAvgMargin(data),
  },
};

const resolveMarginReportColumns = (columnIds: string[]) => {
  const uniqueIds = Array.from(new Set(columnIds.filter(Boolean)));

  return uniqueIds.map((id) => {
    const baseColumn = BASE_MARGIN_REPORT_COLUMNS[id];
    if (baseColumn) {
      return {
        id,
        label: baseColumn.label,
        resolve: baseColumn.resolve,
      };
    }

    return {
      id,
      label: id,
      resolve: (data: Record<string, any>) => {
        if (!data) return null;
        if (Object.prototype.hasOwnProperty.call(data, id)) {
          return data[id];
        }
        return findValueByNormalizedToken(data, id);
      },
    };
  });
};

type MarginSummaryBucket = {
  totalRecords: number;
  totalDocuments: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  entryProfit: number;
  avgMargin: number;
  negativeLines: number;
  negativeDocuments: number;
  entryNegativeLines: number;
  entryNegativeDocuments: number;
  currentDataMissingLines: number;
  entryDataMissingLines: number;
};

type MarginThresholds = {
  low: number;
  high: number;
  worstLimit: number;
};

type MarginComplianceSummary = {
  totalRecords: number;
  totalDocuments: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  entryProfit: number;
  avgMargin: number;
  highMarginCount: number;
  lowMarginCount: number;
  negativeMarginCount: number;
  orderSummary: MarginSummaryBucket;
  salesSummary: MarginSummaryBucket;
  salespersonSummary: Array<{
    sectorCode: string;
    orderSummary: MarginSummaryBucket;
    salesSummary: MarginSummaryBucket;
  }>;
};

type MarginAlertRow = {
  documentNo: string;
  documentType: string;
  customerCode: string;
  customerName: string;
  productCode: string;
  productName: string;
  quantity: number;
  unit: string;
  quantityLabel: string;
  unitPrice: number;
  unitCost: number;
  unitCostEntry: number;
  revenue: number;
  revenueNet: number;
  revenueGross: number;
  profit: number;
  entryProfit: number;
  avgMargin: number;
  currentMarkup: number;
  entryMargin: number;
  entrySourceMargin: number | null;
  currentDataAvailable: boolean;
  entryDataAvailable: boolean;
  sectorCode: string;
};

type MarginAlertSet = {
  negative: MarginAlertRow[];
  low: MarginAlertRow[];
  high: MarginAlertRow[];
  missing: MarginAlertRow[];
};

type MarginAlertSummary = {
  current: MarginAlertSet;
  entry: MarginAlertSet;
};

type MarginAlertGroups = {
  order: MarginAlertSummary;
  sales: MarginAlertSummary;
};

type MarginAggregateRow = {
  key: string;
  name: string;
  revenue: number;
  cost: number;
  profit: number;
  entryProfit: number;
  avgMargin: number;
  entryMargin: number;
  count: number;
};

type MarginTopBottom = {
  top: MarginAggregateRow[];
  bottom: MarginAggregateRow[];
};

type MarginTopBottomGroup = {
  products: MarginTopBottom;
  customers: MarginTopBottom;
  salespeople: MarginTopBottom;
};

type MarginTopBottomSummary = {
  orders: MarginTopBottomGroup;
  sales: MarginTopBottomGroup;
};

type MarginSevenDaySummary = {
  startDate: Date;
  endDate: Date;
  overall: MarginSummaryBucket;
  orders: MarginSummaryBucket;
  sales: MarginSummaryBucket;
  days: Array<{
    date: Date;
    status: 'SUCCESS' | 'FAILED' | 'MISSING';
    overall: MarginSummaryBucket | null;
    quality: Record<string, any> | null;
  }>;
};

type MarginComplianceEmailSummary = MarginComplianceSummary & {
  alerts: MarginAlertGroups;
  topBottom: MarginTopBottomSummary;
  sevenDaySummary: MarginSevenDaySummary;
  thresholds: MarginThresholds;
  previousDay: {
    status: 'SUCCESS' | 'FAILED' | 'MISSING';
    summary: MarginComplianceSummary | null;
  };
  dayQuality: Record<string, any> | null;
  priorDayRefreshQuality: Record<string, any> | null;
  salespersonNamesBySector: Record<string, string[]>;
  violationStatsBySector: Record<string, { open: number; resolvedOnReportDate: number }>;
  productRepeatCounts: Record<string, number>;
  // Rapor sayfasindan yonetilen aktif marka/urun dislama kurali sayisi (dipnot icin).
  activeExclusionCount: number;
};

const normalizeReportText = (value: unknown): string => {
  const raw = String(value || '').toLowerCase();
  return raw
    .replace(/Ä±/g, 'i')
    .replace(/ÅŸ/g, 's')
    .replace(/ÄŸ/g, 'g')
    .replace(/Ã¼/g, 'u')
    .replace(/Ã¶/g, 'o')
    .replace(/Ã§/g, 'c');
};

const resolveReportType = (data: Record<string, any>): 'order' | 'sale' => {
  const tip = normalizeKeyToken(pickValueByKeys(data, ['Tip']));
  if (tip.includes('siparis')) return 'order';
  if (tip.includes('irsaliye') || tip.includes('fatura')) return 'sale';
  return 'sale';
};

const resolveDocumentKey = (data: Record<string, any>): string | null => {
  const resolved = resolveDataValueByCandidates(
    data,
    ['Evrak No', 'msg_S_0089', 'Belge No'],
    'evrakno'
  );
  if (resolved !== null && resolved !== undefined) {
    const key = String(resolved).trim();
    if (key) return key;
  }
  const docValue = pickValueByKeys(data, ['Evrak No', 'msg_S_0089', 'Belge No']);
  const docKey = docValue !== null && docValue !== undefined ? String(docValue).trim() : '';
  return docKey || null;
};

const resolveSectorCode = (row: { sectorCode?: string | null }, data: Record<string, any>): string => {
  const sectorValue = row?.sectorCode ?? pickValueByKeys(data, ['SektorKodu']);
  const sector = typeof sectorValue === 'string' ? sectorValue.trim() : '';
  return sector || 'TANIMSIZ';
};

const buildMarginSummaryBucket = (
  rows: Array<{ avgMargin?: number | null; data?: unknown }>,
  options: { useTypePrefix?: boolean } = {}
): MarginSummaryBucket => {
  const useTypePrefix = options.useTypePrefix === true;
  const docMap = new Map<string, { profit: number; entryProfit: number; revenue: number }>();
  let totalRevenue = 0;
  let totalCost = 0;
  let totalProfit = 0;
  let entryProfit = 0;
  let negativeLines = 0;
  let entryNegativeLines = 0;
  let currentDataMissingLines = 0;
  let entryDataMissingLines = 0;

  rows.forEach((row) => {
    const data = getRowData(row);
    const revenue = pickRevenue(data);
    const computed = calculateCurrentProfit(data);
    const profit = computed.totalProfit;
    const entryProfitRaw = pickEntryProfitValue(data);
    const entryProfitValue = entryProfitRaw ?? 0;
    totalRevenue += revenue;
    totalCost += computed.totalCost;
    totalProfit += profit;
    entryProfit += entryProfitValue;
    const currentDataAvailable = computed.costBasis > 0 && computed.revenueBasis > 0;
    const entryDataAvailable = entryProfitRaw !== null && pickEntryUnitCostBasis(data) > 0 && revenue > 0;
    if (!currentDataAvailable) currentDataMissingLines += 1;
    if (!entryDataAvailable) entryDataMissingLines += 1;
    if (currentDataAvailable && profit < 0) {
      negativeLines += 1;
    }
    if (entryDataAvailable && entryProfitValue < 0) {
      entryNegativeLines += 1;
    }

    const docKey = resolveDocumentKey(data);
    if (docKey) {
      const prefix = useTypePrefix ? `${resolveReportType(data)}:` : '';
      const key = `${prefix}${docKey}`;
      const entry = docMap.get(key) || { profit: 0, entryProfit: 0, revenue: 0 };
      entry.profit += profit;
      entry.entryProfit += entryProfitValue;
      entry.revenue += revenue;
      docMap.set(key, entry);
    }
  });

  let negativeDocuments = 0;
  let entryNegativeDocuments = 0;
  for (const entry of docMap.values()) {
    if (entry.profit < 0) {
      negativeDocuments += 1;
    }
    if (entry.entryProfit < 0) entryNegativeDocuments += 1;
  }

  // Agregat ve satir marji ayni tanimi kullanir: kar / ciro.
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  return {
    totalRecords: rows.length,
    totalDocuments: docMap.size,
    totalRevenue,
    totalCost,
    totalProfit,
    entryProfit,
    avgMargin,
    negativeLines,
    negativeDocuments,
    entryNegativeLines,
    entryNegativeDocuments,
    currentDataMissingLines,
    entryDataMissingLines,
  };
};

const buildMarginComplianceSummary = (
  rows: Array<{ avgMargin?: number | null; data?: unknown; sectorCode?: string | null }>,
  thresholds: MarginThresholds
): MarginComplianceSummary => {
  const orderRows: Array<{ avgMargin?: number | null; data?: unknown; sectorCode?: string | null }> = [];
  const salesRows: Array<{ avgMargin?: number | null; data?: unknown; sectorCode?: string | null }> = [];
  const salespeople = new Map<string, { orderRows: Array<{ avgMargin?: number | null; data?: unknown; sectorCode?: string | null }>; salesRows: Array<{ avgMargin?: number | null; data?: unknown; sectorCode?: string | null }> }>();

  let highMarginCount = 0;
  let lowMarginCount = 0;
  let negativeMarginCount = 0;

  rows.forEach((row) => {
    const data = getRowData(row);
    const marginValue = pickAvgMargin(data);

    if (marginValue > thresholds.high) {
      highMarginCount += 1;
    } else if (marginValue < 0) {
      negativeMarginCount += 1;
    } else if (marginValue < thresholds.low) {
      lowMarginCount += 1;
    }

    const type = resolveReportType(data);
    if (type === 'order') {
      orderRows.push(row);
    } else {
      salesRows.push(row);
    }

    const sectorCode = resolveSectorCode(row, data);
    const entry = salespeople.get(sectorCode) || { orderRows: [], salesRows: [] };
    if (type === 'order') {
      entry.orderRows.push(row);
    } else {
      entry.salesRows.push(row);
    }
    salespeople.set(sectorCode, entry);
  });

  const overallSummary = buildMarginSummaryBucket(rows, { useTypePrefix: true });
  const orderSummary = buildMarginSummaryBucket(orderRows);
  const salesSummary = buildMarginSummaryBucket(salesRows);

  const salespersonSummary = Array.from(salespeople.entries())
    .map(([sectorCode, entry]) => ({
      sectorCode,
      orderSummary: buildMarginSummaryBucket(entry.orderRows),
      salesSummary: buildMarginSummaryBucket(entry.salesRows),
    }))
    .sort((a, b) => a.sectorCode.localeCompare(b.sectorCode, 'tr'));

  return {
    totalRecords: overallSummary.totalRecords,
    totalDocuments: overallSummary.totalDocuments,
    totalRevenue: overallSummary.totalRevenue,
    totalCost: overallSummary.totalCost,
    totalProfit: overallSummary.totalProfit,
    entryProfit: overallSummary.entryProfit,
    avgMargin: overallSummary.avgMargin,
    highMarginCount,
    lowMarginCount,
    negativeMarginCount,
    orderSummary,
    salesSummary,
    salespersonSummary,
  };
};

export const marginReportTestUtils = {
  parseNumberOrNull,
  hasNumericValue,
  calculateCurrentProfit,
  pickEntryMargin,
  pickEntrySourceMargin,
  attachDeterministicRowKeys,
};

export class ReportsService {
  private ucarerMinMaxJob: UcarerMinMaxJobState | null = null;

  private async assertStandardPriceUserColumns(): Promise<void> {
    const requiredColumns = [
      'MaliyetP',
      'MaliyetT',
      'Marj_1',
      'Marj_2',
      'Marj_3',
      'Marj_4',
      'Marj_5',
      'Marj_6',
    ];
    let rows: any[];
    try {
      rows = await mikroService.executeQuery(`
        SELECT COLUMN_NAME AS columnName
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = N'dbo'
          AND TABLE_NAME = N'STOKLAR_USER'
          AND COLUMN_NAME IN (${requiredColumns.map((column) => `N'${column}'`).join(', ')})
      `);
    } catch (error: any) {
      throw new AppError(
        this.normalizeMikroErrorMessage(error, 'Mikro fiyat alani metadata kontrolu tamamlanamadi.'),
        502,
        ErrorCode.MIKRO_CONNECTION_ERROR
      );
    }

    const availableColumns = new Set(
      (rows || [])
        .map((row: any) => String(row?.columnName ?? row?.COLUMN_NAME ?? '').trim().toLowerCase())
        .filter(Boolean)
    );
    const missingColumns = requiredColumns.filter(
      (column) => !availableColumns.has(column.toLowerCase())
    );
    if (missingColumns.length > 0) {
      throw new AppError(
        `Fiyat listeleri guncellenemez: Mikro STOKLAR_USER kolonlari eksik (${missingColumns.join(', ')}).`,
        409,
        ErrorCode.INVALID_PROFIT_MARGIN
      );
    }
  }

  private normalizeMikroErrorMessage(error: any, fallback: string): string {
    const rawMessage = String(error?.message || '').trim();
    const code = String(error?.code || '').trim();
    const message = rawMessage || (typeof error === 'string' ? error : '');
    const lower = message.toLowerCase();

    if (
      lower.includes('timeout') ||
      lower.includes('timed out') ||
      lower.includes('failed to cancel') ||
      code.toUpperCase().includes('ETIME')
    ) {
      return fallback;
    }

    if (message) {
      return message;
    }

    return fallback;
  }

  private async resolveUcarerOperationUser(userId?: string | null): Promise<{ userId: string | null; userName: string | null }> {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) {
      return { userId: null, userName: null };
    }

    const user = await prisma.user.findUnique({
      where: { id: normalizedUserId },
      select: { id: true, name: true, email: true },
    });

    return {
      userId: user?.id || normalizedUserId,
      userName: user?.name || user?.email || null,
    };
  }

  private async logUcarerOperation(input: {
    operationType: string;
    title: string;
    productCode?: string | null;
    productName?: string | null;
    familyId?: string | null;
    familyName?: string | null;
    depot?: string | null;
    supplierCode?: string | null;
    supplierName?: string | null;
    documentNo?: string | null;
    orderNumbers?: string[];
    previousValues?: Record<string, any> | any[] | null;
    newValues?: Record<string, any> | any[] | null;
    metadata?: Record<string, any> | any[] | null;
    userId?: string | null;
  }): Promise<void> {
    try {
      const actor = await this.resolveUcarerOperationUser(input.userId);
      const jsonOrUndefined = (value: unknown): Prisma.InputJsonValue | undefined => {
        if (value === undefined || value === null) return undefined;
        return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
      };
      await prisma.ucarerOperationLog.create({
        data: {
          operationType: String(input.operationType || 'UNKNOWN').trim() || 'UNKNOWN',
          title: String(input.title || '').trim() || 'Ucarer islemi',
          productCode: input.productCode ? String(input.productCode).trim().toUpperCase() : null,
          productName: input.productName ? String(input.productName).trim() : null,
          familyId: input.familyId ? String(input.familyId).trim() : null,
          familyName: input.familyName ? String(input.familyName).trim() : null,
          depot: input.depot ? String(input.depot).trim().toUpperCase() : null,
          supplierCode: input.supplierCode ? String(input.supplierCode).trim().toUpperCase() : null,
          supplierName: input.supplierName ? String(input.supplierName).trim() : null,
          documentNo: input.documentNo ? String(input.documentNo).trim() : null,
          orderNumbers: jsonOrUndefined(input.orderNumbers || []) || [],
          previousValues: jsonOrUndefined(input.previousValues),
          newValues: jsonOrUndefined(input.newValues),
          metadata: jsonOrUndefined(input.metadata),
          userId: actor.userId,
          userName: actor.userName,
        },
      });
    } catch (error) {
      console.warn('Ucarer operation log could not be written:', error);
    }
  }

  async getUcarerOperationLogs(options: {
    page?: number;
    limit?: number;
    operationType?: string;
    productCode?: string;
    familyId?: string;
    search?: string;
  } = {}): Promise<{
    rows: Array<{
      id: string;
      operationType: string;
      title: string;
      productCode: string | null;
      productName: string | null;
      familyId: string | null;
      familyName: string | null;
      depot: string | null;
      supplierCode: string | null;
      supplierName: string | null;
      documentNo: string | null;
      orderNumbers: any;
      previousValues: any;
      newValues: any;
      metadata: any;
      userId: string | null;
      userName: string | null;
      createdAt: Date;
    }>;
    pagination: {
      page: number;
      limit: number;
      totalPages: number;
      totalRecords: number;
    };
  }> {
    const page = Math.max(1, Math.trunc(Number(options.page) || 1));
    const limit = Math.max(10, Math.min(Math.trunc(Number(options.limit) || 25), 100));
    const where: Prisma.UcarerOperationLogWhereInput = {};

    const operationType = String(options.operationType || '').trim();
    if (operationType) {
      where.operationType = operationType;
    }

    const productCode = String(options.productCode || '').trim().toUpperCase();
    if (productCode) {
      where.productCode = { contains: productCode, mode: 'insensitive' };
    }

    const familyId = String(options.familyId || '').trim();
    if (familyId) {
      where.familyId = familyId;
    }

    const search = String(options.search || '').trim();
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { productCode: { contains: search, mode: 'insensitive' } },
        { productName: { contains: search, mode: 'insensitive' } },
        { familyName: { contains: search, mode: 'insensitive' } },
        { supplierCode: { contains: search, mode: 'insensitive' } },
        { supplierName: { contains: search, mode: 'insensitive' } },
        { documentNo: { contains: search, mode: 'insensitive' } },
        { userName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [rows, totalRecords] = await prisma.$transaction([
      prisma.ucarerOperationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.ucarerOperationLog.count({ where }),
    ]);

    return {
      rows,
      pagination: {
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(totalRecords / limit)),
        totalRecords,
      },
    };
  }

  /**
   * Maliyet GÃ¼ncelleme UyarÄ±larÄ± Raporu
   *
   * Son giriÅŸ maliyeti gÃ¼ncel maliyetten yÃ¼ksek olan Ã¼rÃ¼nleri listeler.
   * Veriler sabah sync'te PostgreSQL'e Ã§ekilir, buradan okunur.
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

    // WHERE koÅŸullarÄ±
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

    // ÃœrÃ¼nleri Ã§ek (tÃ¼m eÅŸleÅŸenler, sayfalama sonradan yapÄ±lÄ±r)
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

      // Son giriÅŸ maliyeti gÃ¼ncel maliyetten yÃ¼ksek mi?
      if (lastEntryPrice <= currentCost) continue;

      // Son giriÅŸ tarihi gÃ¼ncel maliyet tarihinden sonra mÄ±?
      if (!currentCostDate || !lastEntryDate) continue;
      if (lastEntryDate <= currentCostDate) continue;

      // GÃ¼n farkÄ±
      const dayDifference = Math.floor(
        (lastEntryDate.getTime() - currentCostDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // GÃ¼n farkÄ± filtresi
      if (dayDiff > 0 && dayDifference < dayDiff) continue;

      // Fark hesaplama
      const diffAmount = lastEntryPrice - currentCost;
      const diffPercent = (diffAmount / currentCost) * 100;

      // YÃ¼zde farkÄ± filtresi
      if (percentDiff > 0 && diffPercent < percentDiff) continue;

      // Toplam stok (tÃ¼m depolar)
      const warehouseStocks = product.warehouseStocks as Record<string, number>;
      const stockQuantity = Object.values(warehouseStocks).reduce((sum, qty) => sum + qty, 0);

      // Risk tutarÄ±
      const riskAmount = diffAmount * stockQuantity;

      // SatÄ±ÅŸ fiyatÄ± (faturalÄ± bayi fiyatÄ± varsayÄ±lan)
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

    // SÄ±ralama
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
   * Rapor kategorilerini dÃ¶ndÃ¼r
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

  private async getDefaultMarginIncludedSectorCodes(): Promise<string[]> {
    const now = Date.now();
    if (marginDefaultSectorCodesCache && now - marginDefaultSectorCodesCache.fetchedAt < 5 * 60 * 1000) {
      return marginDefaultSectorCodesCache.codes;
    }

    try {
      const rows = await mikroService.executeQuery(`
        SELECT DISTINCT
          LTRIM(RTRIM(ISNULL(sktr_kod, ''))) AS sectorCode,
          LTRIM(RTRIM(ISNULL(sktr_ismi, ''))) AS sectorName
        FROM STOK_SEKTORLERI
        WHERE ISNULL(sktr_iptal, 0) = 0
          AND LTRIM(RTRIM(ISNULL(sktr_kod, ''))) <> ''
      `);

      const codes = Array.from(
        new Set(
          rows
            .filter((row: any) => normalizeKeyToken(row?.sectorName) === 'satis')
            .map((row: any) => String(row?.sectorCode || '').trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, 'tr'));

      marginDefaultSectorCodesCache = {
        codes,
        fetchedAt: now,
      };
      marginSectorScopeState = { source: 'MIKRO', warning: null };

      return codes;
    } catch (error) {
      console.error('Margin report default sector codes could not be loaded:', error);
      if (marginDefaultSectorCodesCache?.codes?.length) {
        marginSectorScopeState = {
          source: 'STALE_CACHE',
          warning: 'Sektor listesi Mikrodan yenilenemedi; son basarili liste kullanildi.',
        };
        return marginDefaultSectorCodesCache.codes;
      }
      throw new AppError(
        'Marj raporu sektor filtresi uygulanamadi; rapor filtresiz uretilmedi.',
        503,
        ErrorCode.REPORT_DATA_NOT_READY
      );
    }
  }

  private async getResolvedMarginIncludedSectorCodes(): Promise<string[]> {
    const settings = await prisma.settings.findFirst({
      orderBy: [
        { updatedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      select: {
        marginReportIncludedSectorCodes: true,
      },
    });

    const savedCodes = Array.isArray(settings?.marginReportIncludedSectorCodes)
      ? settings.marginReportIncludedSectorCodes
          .map((code) => String(code || '').trim())
          .filter(Boolean)
      : [];

    if (savedCodes.length > 0) {
      marginSectorScopeState = { source: 'SETTINGS', warning: null };
      return Array.from(new Set(savedCodes));
    }

    return this.getDefaultMarginIncludedSectorCodes();
  }

  async getMarginRuntimeSettings(): Promise<MarginThresholds & {
    personalEmailEnabled: boolean;
    escalationBusinessDays: number;
  }> {
    const settings = await prisma.settings.findFirst({
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        marginAlertLowThreshold: true,
        marginAlertHighThreshold: true,
        marginEmailWorstLimit: true,
        marginPersonalEmailEnabled: true,
        marginViolationEscalationBusinessDays: true,
      },
    });
    const low = Number(settings?.marginAlertLowThreshold ?? DEFAULT_MARGIN_THRESHOLDS.low);
    const high = Number(settings?.marginAlertHighThreshold ?? DEFAULT_MARGIN_THRESHOLDS.high);
    const normalizedLow = Number.isFinite(low) ? Math.max(0, low) : DEFAULT_MARGIN_THRESHOLDS.low;
    return {
      low: normalizedLow,
      high: Number.isFinite(high) ? Math.max(normalizedLow + 0.01, high) : DEFAULT_MARGIN_THRESHOLDS.high,
      worstLimit: Math.max(1, Math.min(100, Number(settings?.marginEmailWorstLimit) || DEFAULT_MARGIN_THRESHOLDS.worstLimit)),
      personalEmailEnabled: settings?.marginPersonalEmailEnabled === true,
      escalationBusinessDays: Math.max(1, Math.min(30, Number(settings?.marginViolationEscalationBusinessDays) || 3)),
    };
  }

  /**
   * Kar MarjÄ± Analizi Raporu (019703 - Komisyon FaturasÄ± Hareket YÃ¶netimi)
   *
   * Mikro'daki fn_KomisyonFaturasiHareketYonetimi fonksiyonunu kullanarak
   * bekleyen sipariÅŸler ve faturalar Ã¼zerinden detaylÄ± kar marjÄ± analizi yapar.
   *
   * Ã–zellikler:
   * - Son giriÅŸ maliyeti ve ortalama maliyete gÃ¶re kar hesaplar
   * - GerÃ§ek satÄ±ÅŸ iÅŸlemlerini analiz eder
   * - Evrak bazÄ±nda detaylÄ± bilgi verir
   */
  async getMarginComplianceReport(options: {
    startDate?: string;
    endDate?: string;
    includeCompleted?: number; // 1 = tamamlananlari da dahil et, 0 = sadece bekleyenler
    customerType?: string;
    category?: string;
    sector?: string;
    group?: string;
    search?: string;
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
      sector,
      group,
      search,
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

    const sectorFilter = String(sector || customerType || '').trim();
    const groupFilter = String(group || category || '').trim();
    if (sectorFilter) {
      where.sectorCode = { contains: sectorFilter, mode: 'insensitive' };
    }

    if (groupFilter) {
      where.groupCode = { contains: groupFilter, mode: 'insensitive' };
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

    const allRows = await prisma.marginComplianceReportRow.findMany({
      where,
      select: {
        avgMargin: true,
        data: true,
        sectorCode: true,
        totalRevenue: true,
        totalProfit: true,
      },
    });

    const baseRows = allRows.filter((row) => !shouldExcludeMarginRow(getRowData(row)));
    // Once sektor filtresi: excludedByUserRules sayaci gorunur rapordan gercekten
    // dusen satir sayisini vermeli (dahil olmayan sektorlerin satirlari sayaca girmesin).
    const includedSectorCodes = await this.getResolvedMarginIncludedSectorCodes();
    const sectorScopedRows = filterMarginRowsBySectorCodes(baseRows, includedSectorCodes);
    // Kullanici bazli dislama kurallari (marka/urun) okuma aninda uygulanir;
    // kural kapatilinca satirlar tekrar gorunur (sync verisi silinmez).
    const { kept: sectorFilteredRows, excludedCount: excludedByUserRules }: {
      kept: typeof sectorScopedRows;
      excludedCount: number;
    } = await getMarginExclusionService().applyToMarginRows(sectorScopedRows, pickStockCode, pickStockName);
    const thresholds = await this.getMarginRuntimeSettings();
    const searchTokens = buildSearchTokens(search || '');
    const filteredRows = sectorFilteredRows.filter((row) => {
      if (searchTokens.length > 0) {
        const data = getRowData(row);
        const haystack = normalizeSearchText([
          pickStockCode(data),
          pickStockName(data),
          pickCustomerCode(data),
          pickCustomerName(data),
          resolveDocumentKey(data),
          pickDocumentType(data),
          resolveSectorCode(row, data),
          row.sectorCode,
        ].filter(Boolean).join(' '));
        if (!matchesSearchTokens(haystack, searchTokens)) return false;
      }
      if (!status) return true;
      const marginValue = pickAvgMargin(getRowData(row));
      if (status === 'HIGH') return marginValue > thresholds.high;
      if (status === 'LOW') return marginValue >= 0 && marginValue < thresholds.low;
      if (status === 'NEGATIVE') return marginValue < 0;
      if (status === 'OK') return marginValue >= thresholds.low && marginValue <= thresholds.high;
      return true;
    });
    const summary = buildMarginComplianceSummary(filteredRows, thresholds);
    const totalRecords = summary.totalRecords;

    const sortedRows = filteredRows.slice().sort((a, b) => {
      const aData = getRowData(a);
      const bData = getRowData(b);
      const aValue =
        sortField === 'totalRevenue'
          ? pickRevenue(aData)
          : sortField === 'totalProfit'
          ? pickTotalProfit(aData)
          : pickAvgMargin(aData);
      const bValue =
        sortField === 'totalRevenue'
          ? pickRevenue(bData)
          : sortField === 'totalProfit'
          ? pickTotalProfit(bData)
          : pickAvgMargin(bData);
      return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
    });

    const pageRows = sortedRows.slice(offset, offset + limitValue);

    return {
      data: pageRows.map((row) => row.data),
      summary,
      excludedByUserRules,
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
        thresholds: { low: thresholds.low, high: thresholds.high },
      },
    };
  }

  async syncMarginComplianceReportForDates(reportDates: Date[], options: {
    includeCompleted?: number;
  } = {}): Promise<{
    success: boolean;
    rowCount: number;
    reportDate: string;
    results: Array<{ reportDate: string; rowCount: number; lateAddedCount: number; lateRemovedCount: number }>;
    error?: string;
  }> {
    const normalizedDates: Date[] = Array.from(new Map(
      reportDates.map((date) => [
        formatDateKey(date),
        new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())),
      ])
    ).values()).sort((a, b) => a.getTime() - b.getTime());
    if (!normalizedDates.length) {
      return { success: true, rowCount: 0, reportDate: '', results: [] };
    }

    const includeCompleted = options.includeCompleted ?? 1;
    const firstDate = normalizedDates[0];
    const lastDate = normalizedDates[normalizedDates.length - 1];
    const reportDateKeys = new Set(normalizedDates.map(formatDateKey));
    const rangeStart = formatDateCompact(firstDate);
    const rangeEnd = formatDateCompact(lastDate);
    const mikroFactory = require('./mikroFactory.service').default;
    const queryStartedAt = Date.now();

    try {
      await mikroFactory.connect();
      const query = `
        SELECT *
        FROM dbo.fn_KomisyonFaturasiHareketYonetimi('${rangeStart}', '${rangeEnd}', ${includeCompleted})
        ORDER BY [msg_S_0089], [msg_S_0001]
      `;
      const result = await mikroFactory.executeQuery(query);
      const sanitizedRows = result.map((row: any) => JSON.parse(JSON.stringify(row)));
      const parsedRows: Array<{ row: Record<string, any>; dateKey: string }> = [];
      let invalidDateCount = 0;
      sanitizedRows.forEach((row: Record<string, any>) => {
        const rowDate = pickMarginRowDate(row);
        if (!rowDate) {
          invalidDateCount += 1;
          return;
        }
        const dateKey = formatDateKey(rowDate);
        if (reportDateKeys.has(dateKey)) parsedRows.push({ row, dateKey });
      });

      const existingDays = await prisma.marginComplianceReportDay.findMany({
        where: { reportDate: { in: normalizedDates } },
        select: { reportDate: true, status: true },
      });
      const existingSuccessfulDates = new Set(
        existingDays.filter((day) => day.status === 'SUCCESS').map((day) => formatDateKey(day.reportDate))
      );
      const existingRows = await prisma.marginComplianceReportRow.findMany({
        where: { reportDate: { in: normalizedDates } },
        select: { reportDate: true, rowKey: true, data: true },
      });
      const existingKeysByDate = new Map<string, Set<string>>();
      normalizedDates.forEach((date) => existingKeysByDate.set(formatDateKey(date), new Set()));
      const legacyByDate = new Map<string, Array<{ data: Record<string, any> }>>();
      existingRows.forEach((row) => {
        const dateKey = formatDateKey(row.reportDate);
        if (row.rowKey) existingKeysByDate.get(dateKey)?.add(row.rowKey);
        else {
          const list = legacyByDate.get(dateKey) || [];
          list.push({ data: getRowData(row) });
          legacyByDate.set(dateKey, list);
        }
      });
      legacyByDate.forEach((rows, dateKey) => {
        attachDeterministicRowKeys(rows).forEach((row) => existingKeysByDate.get(dateKey)?.add(row.rowKey));
      });

      await this.getResolvedMarginIncludedSectorCodes();
      const queryDurationMs = Date.now() - queryStartedAt;
      const preparedByDate = new Map<string, {
        reportDate: Date;
        rows: any[];
        quality: Record<string, any>;
        lateAddedCount: number;
        lateRemovedCount: number;
      }>();

      normalizedDates.forEach((reportDate) => {
        const dateKey = formatDateKey(reportDate);
        const dailyRows = parsedRows.filter((entry) => entry.dateKey === dateKey).map((entry) => entry.row);
        const includedRows = dailyRows.filter((row) => !shouldExcludeMarginRow(row));
        const excludedCount = dailyRows.length - includedRows.length;
        const preparedRows = attachDeterministicRowKeys(includedRows.map((row) => {
          const computed = calculateCurrentProfit(row);
          return {
            reportDate,
            sectorCode: typeof row.SektorKodu === 'string' ? row.SektorKodu.trim() : null,
            groupCode: typeof row.GrupKodu === 'string' ? row.GrupKodu.trim() : null,
            avgMargin: computed.margin,
            totalRevenue: computed.revenueBasis,
            revenueNet: pickRevenueNet(row),
            revenueGross: pickRevenueGross(row),
            totalProfit: computed.totalProfit,
            currentMarkup: computed.markup,
            entryMargin: pickEntryMargin(row, computed.revenueBasis),
            entrySourceMargin: pickEntrySourceMargin(row),
            data: row,
          };
        }));

        const oldKeys = existingKeysByDate.get(dateKey) || new Set<string>();
        const newKeys = new Set(preparedRows.map((row) => row.rowKey));
        const isResync = existingSuccessfulDates.has(dateKey);
        const lateAdded = isResync ? preparedRows.filter((row) => !oldKeys.has(row.rowKey)) : [];
        const lateRemovedCount = isResync ? Array.from(oldKeys).filter((key) => !newKeys.has(key)).length : 0;
        const missingEntrySourceMarginCount = includedRows.filter((row) => pickEntrySourceMargin(row) === null).length;
        const missingEntryDataCount = includedRows.filter((row) => pickEntryProfitValue(row) === null || pickEntryUnitCostBasis(row) <= 0).length;
        const missingCurrentCostCount = includedRows.filter((row) => pickCurrentCostBasis(row) <= 0).length;
        const grossFallbackCount = includedRows.filter((row) => !hasNumericValue(resolveDataValueByCandidates(row, ['Tutar'], 'tutar')) && pickRevenueGross(row) > 0).length;
        const quality = {
          sourceRangeRowCount: sanitizedRows.length,
          matchedDateRowCount: dailyRows.length,
          persistedRowCount: preparedRows.length,
          excludedCount,
          invalidDateCount,
          missingEntrySourceMarginCount,
          missingEntryDataCount,
          missingCurrentCostCount,
          grossFallbackCount,
          sectorFilterSource: marginSectorScopeState.source,
          sectorFilterWarning: marginSectorScopeState.warning,
          queryDurationMs,
          lateAddedCount: lateAdded.length,
          lateRemovedCount,
          lateAddedItems: lateAdded.slice(0, 25).map((entry) => ({
            productCode: pickStockCode(entry.data),
            productName: pickStockName(entry.data),
            customerName: pickCustomerName(entry.data),
            documentNo: resolveDocumentKey(entry.data),
          })),
        };
        preparedByDate.set(dateKey, {
          reportDate,
          rows: preparedRows,
          quality,
          lateAddedCount: lateAdded.length,
          lateRemovedCount,
        });
      });

      await prisma.$transaction(async (tx) => {
        for (const prepared of preparedByDate.values()) {
          await tx.marginComplianceReportRow.deleteMany({ where: { reportDate: prepared.reportDate } });
          for (let i = 0; i < prepared.rows.length; i += 1000) {
            const chunk = prepared.rows.slice(i, i + 1000);
            if (chunk.length) await tx.marginComplianceReportRow.createMany({ data: chunk });
          }
          await tx.marginComplianceReportDay.upsert({
            where: { reportDate: prepared.reportDate },
            create: {
              reportDate: prepared.reportDate,
              status: 'SUCCESS',
              rowCount: prepared.rows.length,
              quality: prepared.quality as Prisma.InputJsonValue,
              syncedAt: new Date(),
            },
            update: {
              status: 'SUCCESS',
              rowCount: prepared.rows.length,
              quality: prepared.quality as Prisma.InputJsonValue,
              errorMessage: null,
              syncedAt: new Date(),
            },
          });
        }
      });

      const results = Array.from(preparedByDate.values()).map((prepared) => ({
        reportDate: formatDateKey(prepared.reportDate),
        rowCount: prepared.rows.length,
        lateAddedCount: prepared.lateAddedCount,
        lateRemovedCount: prepared.lateRemovedCount,
      }));
      return {
        success: true,
        rowCount: results.reduce((sum, item) => sum + item.rowCount, 0),
        reportDate: formatDateKey(lastDate),
        results,
      };
    } catch (error: any) {
      const message = error?.message || 'Unknown error';
      const existingDays = await prisma.marginComplianceReportDay.findMany({
        where: { reportDate: { in: normalizedDates } },
        select: { reportDate: true, status: true, quality: true },
      });
      const existingByDate = new Map(existingDays.map((day) => [formatDateKey(day.reportDate), day]));
      await prisma.$transaction(async (tx) => {
        for (const reportDate of normalizedDates) {
          const existing = existingByDate.get(formatDateKey(reportDate));
          if (existing?.status === 'SUCCESS') {
            const previousQuality = existing.quality && typeof existing.quality === 'object'
              ? existing.quality as Record<string, any>
              : {};
            await tx.marginComplianceReportDay.update({
              where: { reportDate },
              data: {
                quality: {
                  ...previousQuality,
                  lastRefreshFailedAt: new Date().toISOString(),
                  lastRefreshError: message,
                } as Prisma.InputJsonValue,
              },
            });
            continue;
          }
          await tx.marginComplianceReportDay.upsert({
            where: { reportDate },
            create: { reportDate, status: 'FAILED', rowCount: 0, errorMessage: message, syncedAt: new Date() },
            update: { status: 'FAILED', errorMessage: message, syncedAt: new Date() },
          });
        }
      });
      return {
        success: false,
        rowCount: 0,
        reportDate: formatDateKey(lastDate),
        results: [],
        error: message,
      };
    } finally {
      await mikroFactory.disconnect().catch(() => undefined);
    }
  }

  async syncMarginComplianceReportForDate(reportDate: Date, options: {
    includeCompleted?: number;
  } = {}): Promise<{ success: boolean; rowCount: number; reportDate: string; error?: string }> {
    const result = await this.syncMarginComplianceReportForDates([reportDate], options);
    return {
      success: result.success,
      rowCount: result.results[0]?.rowCount || result.rowCount,
      reportDate: result.reportDate,
      error: result.error,
    };
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

  private buildMarginTopBottomSummary(
    orderRows: Array<{ avgMargin?: number | null; data?: unknown; sectorCode?: string | null }>,
    salesRows: Array<{ avgMargin?: number | null; data?: unknown; sectorCode?: string | null }>
  ): MarginTopBottomSummary {
    const buildGroup = (rows: Array<{ avgMargin?: number | null; data?: unknown; sectorCode?: string | null }>): MarginTopBottomGroup => ({
      products: buildTopBottom(
        rows,
        (_row, data) => pickStockCode(data),
        (_row, data) => pickStockName(data)
      ),
      customers: buildTopBottom(
        rows,
        (_row, data) => pickCustomerCode(data) || pickCustomerName(data),
        (_row, data) => pickCustomerName(data)
      ),
      salespeople: buildTopBottom(
        rows,
        (row, data) => resolveSectorCode(row, data),
        (row, data) => resolveSectorCode(row, data)
      ),
    });

    return {
      orders: buildGroup(orderRows),
      sales: buildGroup(salesRows),
    };
  }

  private async buildMarginSevenDaySummary(reportDate: Date, includedSectorCodes: string[] = []): Promise<MarginSevenDaySummary> {
    const startDate = addDaysUtc(reportDate, -6);
    const dayRows = await prisma.marginComplianceReportDay.findMany({
      where: { reportDate: { gte: startDate, lte: reportDate } },
      select: { reportDate: true, status: true, quality: true },
    });
    const dayByKey = new Map(dayRows.map((day) => [formatDateKey(day.reportDate), day]));
    const successfulDates = dayRows.filter((day) => day.status === 'SUCCESS').map((day) => day.reportDate);
    const rows = await prisma.marginComplianceReportRow.findMany({
      where: {
        reportDate: { in: successfulDates },
      },
    });
    const baseRows = rows.filter((row) => !shouldExcludeMarginRow(getRowData(row)));
    // Kullanici bazli dislama kurallari 7 gunluk ozete de uygulanir.
    const { kept: userFilteredRows } =
      await getMarginExclusionService().applyToMarginRows(baseRows, pickStockCode, pickStockName);
    const filteredRows = filterMarginRowsBySectorCodes(userFilteredRows, includedSectorCodes);
    const { orderRows, salesRows } = splitRowsByType(filteredRows);
    const filteredByDate = new Map<string, typeof filteredRows>();
    filteredRows.forEach((row) => {
      const key = formatDateKey((row as any).reportDate);
      const list = filteredByDate.get(key) || [];
      list.push(row);
      filteredByDate.set(key, list);
    });
    const days = listUtcDates(startDate, reportDate).map((date) => {
      const key = formatDateKey(date);
      const day = dayByKey.get(key);
      const status: 'SUCCESS' | 'FAILED' | 'MISSING' = day?.status === 'SUCCESS'
        ? 'SUCCESS'
        : day?.status === 'FAILED'
          ? 'FAILED'
          : 'MISSING';
      return {
        date,
        status,
        overall: status === 'SUCCESS' ? buildMarginSummaryBucket(filteredByDate.get(key) || [], { useTypePrefix: true }) : null,
        quality: day?.quality && typeof day.quality === 'object' ? day.quality as Record<string, any> : null,
      };
    });

    return {
      startDate,
      endDate: reportDate,
      overall: buildMarginSummaryBucket(filteredRows, { useTypePrefix: true }),
      orders: buildMarginSummaryBucket(orderRows),
      sales: buildMarginSummaryBucket(salesRows),
      days,
    };
  }

  async getMarginViolationCandidatesForDate(reportDate: Date) {
    const rows = await prisma.marginComplianceReportRow.findMany({ where: { reportDate } });
    const rowsWithKeys = attachDeterministicRowKeys(rows.map((row) => ({
      ...row,
      persistedRowKey: row.rowKey,
      data: getRowData(row),
    }))).map((row) => ({ ...row, rowKey: row.persistedRowKey || row.rowKey }));
    const baseRows = rowsWithKeys.filter((row) => !shouldExcludeMarginRow(row.data));
    const marginExclusionService = getMarginExclusionService();
    const { kept: userFilteredRows } = await marginExclusionService.applyToMarginRows(baseRows, pickStockCode, pickStockName);
    const includedSectorCodes = await this.getResolvedMarginIncludedSectorCodes();
    const filteredRows = filterMarginRowsBySectorCodes(userFilteredRows, includedSectorCodes);

    return filteredRows.flatMap((row) => {
      const alert = buildMarginAlertRow(row);
      const bases: Array<{
        basis: 'CURRENT' | 'ENTRY';
        violationType: 'NEGATIVE';
        unitCost: number;
        profit: number;
        margin: number;
        sourceMargin: number | null;
        dataAvailable: boolean;
        missingReason: string | null;
      }> = [];
      if (alert.currentDataAvailable && alert.profit < 0) {
        bases.push({
          basis: 'CURRENT',
          violationType: 'NEGATIVE',
          unitCost: alert.unitCost,
          profit: alert.profit,
          margin: alert.avgMargin,
          sourceMargin: alert.currentMarkup,
          dataAvailable: true,
          missingReason: null,
        });
      }
      if (alert.entryDataAvailable && alert.entryProfit < 0) {
        bases.push({
          basis: 'ENTRY',
          violationType: 'NEGATIVE',
          unitCost: alert.unitCostEntry,
          profit: alert.entryProfit,
          margin: alert.entryMargin,
          sourceMargin: alert.entrySourceMargin,
          dataAvailable: true,
          missingReason: null,
        });
      }
      if (!bases.length) return [];

      const fingerprint = sha256(stableJsonStringify({
        productCode: alert.productCode.trim().toLocaleUpperCase('tr-TR'),
        customerCode: alert.customerCode.trim().toLocaleUpperCase('tr-TR'),
        documentType: alert.documentType.trim().toLocaleUpperCase('tr-TR'),
      }));
      return [{
        reportDate,
        rowKey: (row as any).rowKey,
        fingerprint,
        documentNo: alert.documentNo || null,
        documentType: alert.documentType || null,
        customerCode: alert.customerCode || null,
        customerName: alert.customerName || null,
        productCode: alert.productCode,
        productName: alert.productName || null,
        quantity: alert.quantity,
        unit: alert.unit || null,
        quantityLabel: alert.quantityLabel || null,
        unitPrice: alert.unitPrice,
        revenueNet: alert.revenueNet,
        revenueGross: alert.revenueGross,
        sectorCode: alert.sectorCode || null,
        snapshot: row.data,
        bases,
      }];
    });
  }

  async exportMarginComplianceReport(options: {
    startDate?: string;
    endDate?: string;
    sector?: string;
    group?: string;
    search?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    columnIds?: string[];
  }) {
    const report = await this.getMarginComplianceReport({
      ...options,
      page: 1,
      limit: 100000,
    });
    const resolvedIds = options.columnIds?.length ? options.columnIds : DEFAULT_MARGIN_REPORT_EMAIL_COLUMNS;
    const columns = resolveMarginReportColumns(resolvedIds);
    const sheetRows = [
      columns.map((column) => column.label),
      ...report.data.map((data: Record<string, any>) => columns.map((column) => formatExportValue(column.resolve(data)) ?? '')),
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Kar Marji Analizi');
    const buffer = Buffer.from(XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }));
    const start = String(options.startDate || '').replace(/[^0-9]/g, '') || 'rapor';
    const end = String(options.endDate || '').replace(/[^0-9]/g, '') || start;
    return { buffer, fileName: `kar-marji-analizi-${start}-${end}.xlsx` };
  }



  async buildMarginComplianceEmailPayload(reportDate: Date, columnIds: string[] = []) {
    const thresholds = await this.getMarginRuntimeSettings();
    const rows = await prisma.marginComplianceReportRow.findMany({ where: { reportDate } });
    const baseRows = rows.filter((row) => !shouldExcludeMarginRow(getRowData(row)));
    // Kullanici bazli dislama kurallari: ozet, alert, top/bottom ve XLSX satirlarina uygulanir.
    const marginExclusionService = getMarginExclusionService();
    const { kept: userFilteredRows } =
      await marginExclusionService.applyToMarginRows(baseRows, pickStockCode, pickStockName);
    const activeExclusionCount: number = await marginExclusionService.getActiveExclusionCount();
    const includedSectorCodes = await this.getResolvedMarginIncludedSectorCodes();
    const filteredRows = filterMarginRowsBySectorCodes(userFilteredRows, includedSectorCodes);
    const summary = buildMarginComplianceSummary(filteredRows, thresholds);
    const { orderRows, salesRows } = splitRowsByType(filteredRows);
    const alerts: MarginAlertGroups = {
      order: buildAlertSummary(orderRows, thresholds),
      sales: buildAlertSummary(salesRows, thresholds),
    };
    const topBottom = this.buildMarginTopBottomSummary(orderRows, salesRows);
    const sevenDaySummary = await this.buildMarginSevenDaySummary(reportDate, includedSectorCodes);
    const previousDate = addDaysUtc(reportDate, -1);
    const nextReportDate = addDaysUtc(reportDate, 1);
    const [dayRecord, previousDayRecord, salesReps, openViolations, resolvedViolations] = await Promise.all([
      prisma.marginComplianceReportDay.findUnique({ where: { reportDate }, select: { quality: true } }),
      prisma.marginComplianceReportDay.findUnique({ where: { reportDate: previousDate }, select: { status: true, quality: true } }),
      prisma.user.findMany({
        where: { role: 'SALES_REP', active: true },
        select: { id: true, name: true, displayName: true, mikroName: true, assignedSectorCodes: true },
      }),
      prisma.marginViolation.findMany({
        where: { status: { in: ['OPEN', 'IN_REVIEW', 'REOPENED'] } },
        select: { sectorCode: true },
      }),
      prisma.marginViolation.findMany({
        where: { resolvedAt: { gte: reportDate, lt: nextReportDate } },
        select: { sectorCode: true },
      }),
    ]);

    let previousSummary: MarginComplianceSummary | null = null;
    if (previousDayRecord?.status === 'SUCCESS') {
      const previousRows = await prisma.marginComplianceReportRow.findMany({ where: { reportDate: previousDate } });
      const previousBaseRows = previousRows.filter((row) => !shouldExcludeMarginRow(getRowData(row)));
      const { kept: previousUserRows } = await marginExclusionService.applyToMarginRows(previousBaseRows, pickStockCode, pickStockName);
      previousSummary = buildMarginComplianceSummary(
        filterMarginRowsBySectorCodes(previousUserRows, includedSectorCodes),
        thresholds
      );
    }

    const salespersonNamesBySector: Record<string, string[]> = {};
    salesReps.forEach((rep) => {
      const name = rep.displayName || rep.mikroName || rep.name;
      (rep.assignedSectorCodes || []).forEach((code) => {
        const normalized = String(code || '').trim().toLocaleUpperCase('tr-TR');
        if (!normalized) return;
        salespersonNamesBySector[normalized] = Array.from(new Set([...(salespersonNamesBySector[normalized] || []), name])).sort((a, b) => a.localeCompare(b, 'tr'));
      });
    });

    const violationStatsBySector: Record<string, { open: number; resolvedOnReportDate: number }> = {};
    const countViolation = (sectorCode: string | null, key: 'open' | 'resolvedOnReportDate') => {
      const normalized = String(sectorCode || 'ATANMAMIS').trim().toLocaleUpperCase('tr-TR') || 'ATANMAMIS';
      const current = violationStatsBySector[normalized] || { open: 0, resolvedOnReportDate: 0 };
      current[key] += 1;
      violationStatsBySector[normalized] = current;
    };
    openViolations.forEach((row) => countViolation(row.sectorCode, 'open'));
    resolvedViolations.forEach((row) => countViolation(row.sectorCode, 'resolvedOnReportDate'));

    const repeatStart = addDaysUtc(reportDate, -6);
    const repeatRows = await prisma.marginViolation.findMany({
      where: {
        reportDate: { gte: repeatStart, lte: reportDate },
        status: { not: 'INVALIDATED' },
      },
      select: { reportDate: true, productCode: true },
    });
    const repeatDatesByProduct = new Map<string, Set<string>>();
    repeatRows.forEach((row) => {
      const code = row.productCode.trim().toLocaleUpperCase('tr-TR');
      if (!code) return;
      const dates = repeatDatesByProduct.get(code) || new Set<string>();
      dates.add(formatDateKey(row.reportDate));
      repeatDatesByProduct.set(code, dates);
    });
    const productRepeatCounts = Object.fromEntries(
      Array.from(repeatDatesByProduct.entries()).map(([code, dates]) => [code, dates.size])
    );
    const emailSummary: MarginComplianceEmailSummary = {
      ...summary,
      alerts,
      topBottom,
      sevenDaySummary,
      thresholds,
      previousDay: {
        status: previousDayRecord?.status === 'SUCCESS' ? 'SUCCESS' : previousDayRecord?.status === 'FAILED' ? 'FAILED' : 'MISSING',
        summary: previousSummary,
      },
      dayQuality: dayRecord?.quality && typeof dayRecord.quality === 'object' ? dayRecord.quality as Record<string, any> : null,
      priorDayRefreshQuality: previousDayRecord?.quality && typeof previousDayRecord.quality === 'object'
        ? previousDayRecord.quality as Record<string, any>
        : null,
      salespersonNamesBySector,
      violationStatsBySector,
      productRepeatCounts,
      activeExclusionCount,
    };

    const resolvedIds = columnIds && columnIds.length > 0
      ? columnIds
      : DEFAULT_MARGIN_REPORT_EMAIL_COLUMNS;
    const columns = resolveMarginReportColumns(resolvedIds);

    const headerRow = columns.map((column) => column.label);
    const dataRows = filteredRows.map((row) => {
      const data = getRowData(row);
      return columns.map((column) => {
        const value = column.resolve(data);
        return formatExportValue(value) ?? '';
      });
    });

    const sheetData = [headerRow, ...dataRows];
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Kar Marji Analizi');

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    const fileName = `kar-marji-analizi-${formatDateCompact(reportDate)}.xlsx`;

    return {
      summary: emailSummary,
      attachment: {
        name: fileName,
        content: Buffer.from(buffer).toString('base64'),
      },
    };
  }

  /**
   * En Ã‡ok Satan ÃœrÃ¼nler Raporu
   *
   * Belirtilen tarih aralÄ±ÄŸÄ±nda en Ã§ok satÄ±lan Ã¼rÃ¼nleri listeler.
   * Hem satÄ±ÅŸ tutarÄ± hem de karlÄ±lÄ±k bazÄ±nda sÄ±ralanabilir.
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

    // 8.5: Tarih verilmediyse tum gecmisi taramak yerine son 12 ay ile sinirla.
    // Boylece her acilista yillarca biriken hareket bellege yuklenmez.
    let effStartDate = startDate;
    let effEndDate = endDate;
    if (!effStartDate && !effEndDate) {
      const _now = new Date();
      const _past = new Date(_now);
      _past.setFullYear(_past.getFullYear() - 1);
      effStartDate = _past.toISOString().slice(0, 10);
      effEndDate = _now.toISOString().slice(0, 10);
    }

    await mikroService.connect();

    // WHERE koÅŸullarÄ± - STOK_HAREKETLERI kullan (gerÃ§ek satÄ±ÅŸlar)
    const whereConditions = [
      'sth_cins = 0',  // SatÄ±ÅŸ hareketleri
      'sth_tip = 1'    // Normal hareket (fatura/irsaliye)
    ];

    if (effStartDate) {
      whereConditions.push(`sth_tarih >= '${effStartDate}'`);
    }
    if (effEndDate) {
      whereConditions.push(`sth_tarih <= '${effEndDate}'`);
    }

    // Add exclusion conditions
    const exclusionConditions = await exclusionService.buildStokHareketleriExclusionConditions();
    whereConditions.push(...exclusionConditions);

    const whereClause = whereConditions.join(' AND ');

    // DEBUG LOGGING
    console.log('=== TOP PRODUCTS EXCLUSION DEBUG ===');
    console.log('Exclusion conditions:', exclusionConditions);
    console.log('Full WHERE clause:', whereClause);

    // Stok hareketlerini Ã§ek ve grupla (gerÃ§ek satÄ±ÅŸlar)
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

    // 8.3: Kategori bilgisini B2B Category tablosundan (senkronlu veri) doldur.
    // Mikro sorgusu kategori dondurmuyordu; bu yuzden kategori sutunu sabit "Kategori"
    // gorunuyor, kategori filtresi de bos sonuc veriyordu.
    const productCodes = rawData
      .map((p: any) => String(p.productCode || '').trim())
      .filter((c: string) => c.length > 0);
    const categoryMap = new Map<string, string>();
    if (productCodes.length > 0) {
      const dbProducts = await prisma.product.findMany({
        where: { mikroCode: { in: productCodes } },
        select: { mikroCode: true, category: { select: { name: true } } },
      });
      for (const dp of dbProducts) {
        if (dp.mikroCode) categoryMap.set(dp.mikroCode, dp.category?.name || '');
      }
    }

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
        const catName = categoryMap.get(String(p.productCode || '').trim()) || '';
        const haystack = normalizeSearchText(catName);
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
        brand: p.brand || 'BelirtilmemiÅŸ',
        category: categoryMap.get(String(p.productCode || '').trim()) || 'Bilinmiyor',
        quantity: p.quantity,
        revenue,
        cost,
        profit,
        profitMargin,
        avgPrice,
        customerCount: p.customerCount,
      };
    });

    // SÄ±ralama
    products.sort((a, b) => {
      switch (sortBy) {
        case 'profit':
          return b.profit - a.profit;
        case 'profit_asc':
          return a.profit - b.profit;  // DÃ¼ÅŸÃ¼kten yÃ¼kseÄŸe
        case 'margin':
          return b.profitMargin - a.profitMargin;
        case 'margin_asc':
          return a.profitMargin - b.profitMargin;  // DÃ¼ÅŸÃ¼kten yÃ¼kseÄŸe
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
   * En Ã‡ok SatÄ±n Alan MÃ¼ÅŸteriler Raporu
   *
   * Belirtilen tarih aralÄ±ÄŸÄ±nda en Ã§ok satÄ±n alan mÃ¼ÅŸterileri listeler.
   * Hem alÄ±ÅŸ tutarÄ± hem de karlÄ±lÄ±k bazÄ±nda sÄ±ralanabilir.
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
      sectorCode: string;
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
      totalOrders: number;
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

    // 8.5: Tarih verilmediyse tum gecmisi taramak yerine son 12 ay ile sinirla.
    let effStartDate = startDate;
    let effEndDate = endDate;
    if (!effStartDate && !effEndDate) {
      const _now = new Date();
      const _past = new Date(_now);
      _past.setFullYear(_past.getFullYear() - 1);
      effStartDate = _past.toISOString().slice(0, 10);
      effEndDate = _now.toISOString().slice(0, 10);
    }

    await mikroService.connect();

    // WHERE koÅŸullarÄ± - STOK_HAREKETLERI kullan (gerÃ§ek satÄ±ÅŸlar)
    const whereConditions = [
      'sth_cins = 0',  // SatÄ±ÅŸ hareketleri
      'sth_tip = 1'    // Normal hareket (fatura/irsaliye)
    ];

    if (effStartDate) {
      whereConditions.push(`sth_tarih >= '${effStartDate}'`);
    }
    if (effEndDate) {
      whereConditions.push(`sth_tarih <= '${effEndDate}'`);
    }

    // Add exclusion conditions
    const exclusionConditions = await exclusionService.buildStokHareketleriExclusionConditions();
    whereConditions.push(...exclusionConditions);

    const whereClause = whereConditions.join(' AND ');

    // MÃ¼ÅŸteri bazÄ±nda stok hareketlerini Ã§ek (gerÃ§ek satÄ±ÅŸlar)
    const query = `
      SELECT
        sth.sth_cari_kodu as customerCode,
        MAX(c.cari_unvan1) as customerName,
        MAX(c.cari_sektor_kodu) as sector,
        MAX(c.cari_sektor_kodu) as sectorCode,
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

    // ArtÄ±k maliyet de sorguya dahil, ayrÄ± sorgu gerek yok
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
        const haystack = normalizeSearchText(`${c.sector || ''} ${c.sectorCode || ''}`);
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
        sector: c.sector || 'BelirtilmemiÅŸ',
        sectorCode: c.sectorCode || '',
        orderCount: c.orderCount,
        revenue,
        cost,
        profit,
        profitMargin,
        avgOrderAmount,
        topCategory: 'TODO', // TODO: En Ã§ok alÄ±nan kategori
        lastOrderDate: c.lastOrderDate,
      };
    });

    // SÄ±ralama
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
    const totalOrders = customers.reduce((sum, c) => sum + c.orderCount, 0);
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
        totalOrders,
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
   * Fiyat GeÃ§miÅŸi Raporu
   *
   * Mikro'daki STOK_FIYAT_DEGISIKLIKLERI tablosundan tÃ¼m fiyat deÄŸiÅŸikliklerini listeler.
   * Standart fiyat listeleri ayni gunde birlikte guncellenmelidir.
   * Kampanya listeleri 11/12 bu tutarlilik kontrolune dahil edilmez.
   * Gecis tarihi PRICE_LIST_TIER6_CUTOVER_DATE ile sabitlenene kadar, 13/14
   * iceren gruplar yeni 12-listelik; diger gruplar eski 10-listelik setle okunur.
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

    let tier6MikroCutoverDate: Date;
    try {
      tier6MikroCutoverDate = parseTier6Cutover(
        process.env.PRICE_LIST_TIER6_CUTOVER_DATE
      ).mikroWallClock;
    } catch {
      throw new AppError(
        'Fiyat listesi 6 gecis tarihi yapilandirilmamis. PRICE_LIST_TIER6_CUTOVER_DATE zorunludur.',
        503,
        ErrorCode.REPORT_DATA_NOT_READY
      );
    }

    // 1. Fiyat deÄŸiÅŸikliklerini Ã§ek
    const whereConditions = ['1=1'];
    const request = mikroService.pool!.request();
    const productTokens = buildSearchTokens(productName);
    const categoryTokens = buildSearchTokens(category);

    if (startDate) {
      whereConditions.push('fid_tarih >= @startDate');
      request.input('startDate', sql.NVarChar(30), String(startDate).trim());
    }
    if (endDate) {
      whereConditions.push('fid_tarih <= @endDate');
      request.input('endDate', sql.NVarChar(30), String(endDate).trim());
    }
    if (productCode) {
      whereConditions.push('fid_stok_kod LIKE @productCode');
      request.input('productCode', sql.NVarChar(255), `%${String(productCode).trim()}%`);
    }
    for (let index = 0; index < productTokens.length; index += 1) {
      const parameterName = `productNameToken${index}`;
      whereConditions.push(
        `REPLACE(REPLACE(ISNULL(s.sto_isim, N''), N'ı', N'i'), N'I', N'i') ` +
          `COLLATE Latin1_General_100_CI_AI LIKE @${parameterName}`
      );
      request.input(parameterName, sql.NVarChar(255), `%${productTokens[index]}%`);
    }
    for (let index = 0; index < categoryTokens.length; index += 1) {
      const parameterName = `categoryToken${index}`;
      whereConditions.push(
        `N'Kategori Yok' COLLATE Latin1_General_100_CI_AI LIKE @${parameterName}`
      );
      request.input(parameterName, sql.NVarChar(255), `%${categoryTokens[index]}%`);
    }
    if (priceListNo !== undefined) {
      if (!Number.isInteger(priceListNo)) {
        throw new AppError(
          'Gecersiz fiyat listesi numarasi',
          400,
          ErrorCode.VALIDATION_ERROR
        );
      }
      whereConditions.push('fid_fiyat_no = @priceListNo');
      request.input('priceListNo', sql.Int, priceListNo);
    }

    const whereClause = whereConditions.join(' AND ');

    const outerPriceListFilter =
      priceListNo === undefined ? '' : 'AND f.fid_fiyat_no = @priceListNo';
    const priceChangesQuery = `
      WITH LimitedRows AS (
        SELECT TOP 10000
          f.fid_stok_kod,
          f.fid_tarih,
          COUNT_BIG(*) OVER() AS totalMatchedRowCount
        FROM STOK_FIYAT_DEGISIKLIKLERI f
        LEFT JOIN STOKLAR s ON f.fid_stok_kod = s.sto_kod
        WHERE ${whereClause}
          AND f.fid_eskifiy_tutar != f.fid_yenifiy_tutar
          AND s.sto_pasif_fl = 0
        ORDER BY f.fid_tarih DESC, f.fid_stok_kod, f.fid_fiyat_no
      ),
      BatchKeys AS (
        SELECT DISTINCT fid_stok_kod, fid_tarih
        FROM LimitedRows
      ),
      LimitState AS (
        SELECT MAX(totalMatchedRowCount) AS totalMatchedRowCount
        FROM LimitedRows
      )
      SELECT
        f.fid_stok_kod,
        f.fid_tarih,
        f.fid_fiyat_no,
        f.fid_eskifiy_tutar,
        f.fid_yenifiy_tutar,
        s.sto_isim,
        'Kategori Yok' as kategori,
        limitState.totalMatchedRowCount
      FROM STOK_FIYAT_DEGISIKLIKLERI f
      INNER JOIN BatchKeys batch
        ON batch.fid_stok_kod = f.fid_stok_kod
       AND batch.fid_tarih = f.fid_tarih
      CROSS JOIN LimitState limitState
      LEFT JOIN STOKLAR s ON f.fid_stok_kod = s.sto_kod
      WHERE f.fid_eskifiy_tutar != f.fid_yenifiy_tutar
        AND s.sto_pasif_fl = 0
        ${outerPriceListFilter}
      ORDER BY f.fid_tarih DESC, f.fid_stok_kod, f.fid_fiyat_no
    `;

    const rawChanges: any[] = Array.from(
      (await request.query<any>(priceChangesQuery)).recordset
    );
    const totalMatchedRowCount = Number(
      rawChanges[0]?.totalMatchedRowCount || 0
    );
    if (totalMatchedRowCount > 10000) {
      await mikroService.disconnect();
      throw new AppError(
        `Fiyat gecmisi sorgusu ${totalMatchedRowCount} ham satir eslestirdi. ` +
          'Eksik rapor gostermemek icin tarih veya urun filtresini daraltin.',
        422,
        ErrorCode.VALIDATION_ERROR,
        {
          matchedRowCount: totalMatchedRowCount,
          maximumRows: 10000,
        }
      );
    }

    // 2. SQL'deki TOP sinirindan once kaba token filtresi uygulandi. Buradaki
    // normalizeSearchText kontrolu ayni adaylari uygulama semantigiyle kesinlestirir.
    let filteredChanges = rawChanges;
    if (productTokens.length > 0) {
      filteredChanges = rawChanges.filter((c: any) => {
        const haystack = normalizeSearchText(c.sto_isim || '');
        return matchesSearchTokens(haystack, productTokens);
      });
    }
    if (categoryTokens.length > 0) {
      filteredChanges = filteredChanges.filter((c: any) => {
        const haystack = normalizeSearchText(c.kategori || '');
        return matchesSearchTokens(haystack, categoryTokens);
      });
    }

    // 3. ÃœrÃ¼n + Tarih bazÄ±nda grupla
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
      // Mikro writes one timestamp for a batch. Calendar-day grouping merged
      // unrelated batches from the same product and created false consistency.
      const key = `${change.fid_stok_kod}_${change.fid_tarih.toISOString()}`;

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

    // 4. Her grup iÃ§in PriceChange objesi oluÅŸtur
    const priceChanges: PriceChange[] = [];

    for (const key in groupedByProductAndDate) {
      const group = groupedByProductAndDate[key];

      const updatedLists = Array.from(new Set(group.changes.map((change) => change.listNo)));
      const updatedStandardLists = updatedLists.filter((listNo) =>
        (STANDARD_PRICE_LIST_NOS as readonly number[]).includes(listNo)
      );
      const updatedCampaignLists = updatedLists.filter((listNo) =>
        (CAMPAIGN_PRICE_LIST_NOS as readonly number[]).includes(listNo)
      );
      const usesTier6Set =
        group.changeDate.getTime() >= tier6MikroCutoverDate.getTime();
      const expectedLists = usesTier6Set
        ? STANDARD_PRICE_LIST_NOS
        : LEGACY_STANDARD_PRICE_LIST_NOS;
      const consistencyApplicable =
        priceListNo === undefined && updatedStandardLists.length > 0;
      const missingLists = consistencyApplicable
        ? expectedLists.filter(
            (listNo) => !updatedStandardLists.includes(listNo)
          )
        : [];
      const isConsistent =
        consistencyApplicable && missingLists.length === 0;

      // PriceListChange'leri oluÅŸtur
      const priceListChanges: PriceListChange[] = group.changes.map(c => {
        const changeAmount = c.newPrice - c.oldPrice;
        const changePercent = c.oldPrice > 0
          ? (changeAmount / c.oldPrice) * 100
          : 0;

        return {
          listNo: c.listNo,
          listName: getPriceListLabel(c.listNo) || `Liste ${c.listNo}`,
          oldPrice: c.oldPrice,
          newPrice: c.newPrice,
          changeAmount,
          changePercent,
        };
      });
      const standardPriceListChanges = priceListChanges.filter((change) =>
        (STANDARD_PRICE_LIST_NOS as readonly number[]).includes(change.listNo)
      );

      // Standard KPI'lar kampanya 11/12 satirlarini bilerek disarida tutar.
      const avgChangePercent = standardPriceListChanges.length > 0
        ? standardPriceListChanges.reduce((sum, c) => sum + c.changePercent, 0) /
          standardPriceListChanges.length
        : 0;

      // DeÄŸiÅŸim yÃ¶nÃ¼
      let direction: 'increase' | 'decrease' | 'mixed' = 'mixed';
      const increases = standardPriceListChanges.filter(c => c.changeAmount > 0).length;
      const decreases = standardPriceListChanges.filter(c => c.changeAmount < 0).length;

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
        consistencyApplicable,
        isConsistent,
        updatedListsCount: updatedStandardLists.length,
        updatedStandardListsCount: updatedStandardLists.length,
        expectedStandardListCount: expectedLists.length,
        updatedCampaignLists,
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
      filtered = filtered.filter(c => c.consistencyApplicable && c.isConsistent);
    } else if (consistencyStatus === 'inconsistent') {
      filtered = filtered.filter(c => c.consistencyApplicable && !c.isConsistent);
    }

    // DeÄŸiÅŸim yÃ¶nÃ¼ filtresi
    if (changeDirection !== 'all') {
      filtered = filtered.filter(c => c.changeDirection === changeDirection);
    }

    // Min deÄŸiÅŸim yÃ¼zdesi filtresi
    if (minChangePercent !== undefined) {
      filtered = filtered.filter(c => Math.abs(c.avgChangePercent) >= minChangePercent);
    }

    // 6. SÄ±ralama
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
    const consistencyApplicableChanges = filtered.filter(
      c => c.consistencyApplicable
    );
    const consistentChanges = consistencyApplicableChanges.filter(
      c => c.isConsistent
    ).length;
    const inconsistentChanges =
      consistencyApplicableChanges.length - consistentChanges;
    const consistencyNotApplicableChanges =
      totalChanges - consistencyApplicableChanges.length;
    const inconsistencyRate = consistencyApplicableChanges.length > 0
      ? (inconsistentChanges / consistencyApplicableChanges.length) * 100
      : 0;

    const increases = filtered.filter(c => c.avgChangePercent > 0);
    const decreases = filtered.filter(c => c.avgChangePercent < 0);

    const avgIncreasePercent = increases.length > 0
      ? increases.reduce((sum, c) => sum + c.avgChangePercent, 0) / increases.length
      : 0;

    const avgDecreasePercent = decreases.length > 0
      ? decreases.reduce((sum, c) => sum + c.avgChangePercent, 0) / decreases.length
      : 0;

    // En yÃ¼ksek artÄ±ÅŸlar
    const topIncreases = [...filtered]
      .filter(c => c.avgChangePercent > 0)
      .sort((a, b) => b.avgChangePercent - a.avgChangePercent)
      .slice(0, 5)
      .map(c => ({
        product: `${c.productCode} - ${c.productName}`,
        percent: c.avgChangePercent,
      }));

    // En yÃ¼ksek azalÄ±ÅŸlar
    const topDecreases = [...filtered]
      .filter(c => c.avgChangePercent < 0)
      .sort((a, b) => a.avgChangePercent - b.avgChangePercent)
      .slice(0, 5)
      .map(c => ({
        product: `${c.productCode} - ${c.productName}`,
        percent: c.avgChangePercent,
      }));

    // Son 30 ve 7 gÃ¼n
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
        consistencyNotApplicableChanges,
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
   * ÃœrÃ¼n Detay Raporu - Belirli bir Ã¼rÃ¼nÃ¼n hangi mÃ¼ÅŸterilere satÄ±ldÄ±ÄŸÄ±nÄ± gÃ¶sterir
   */
  private async resolveComplementIdsForProducts(
    products: Array<{ id: string; complementMode: 'AUTO' | 'MANUAL' }>,
    limit: number
  ): Promise<Map<string, string[]>> {
    const productIds = products.map((product) => product.id);
    if (productIds.length === 0) return new Map();

    const manualIds = products
      .filter((product) => product.complementMode === 'MANUAL')
      .map((product) => product.id);

    const [manualRows, autoRows] = await Promise.all([
      manualIds.length
        ? prisma.productComplementManual.findMany({
            where: { productId: { in: manualIds } },
            orderBy: [{ productId: 'asc' }, { sortOrder: 'asc' }],
            select: { productId: true, relatedProductId: true },
          })
        : Promise.resolve([]),
      productIds.length
        ? prisma.productComplementAuto.findMany({
            where: { productId: { in: productIds } },
            orderBy: [{ productId: 'asc' }, { rank: 'asc' }],
            select: { productId: true, relatedProductId: true },
          })
        : Promise.resolve([]),
    ]);

    const manualMap = new Map<string, string[]>();
    manualRows.forEach((row) => {
      const list = manualMap.get(row.productId) || [];
      list.push(row.relatedProductId);
      manualMap.set(row.productId, list);
    });

    const autoMap = new Map<string, string[]>();
    autoRows.forEach((row) => {
      const list = autoMap.get(row.productId) || [];
      list.push(row.relatedProductId);
      autoMap.set(row.productId, list);
    });

    const result = new Map<string, string[]>();
    products.forEach((product) => {
      const manualList = manualMap.get(product.id) || [];
      const autoList = autoMap.get(product.id) || [];
      const baseList = product.complementMode === 'MANUAL' && manualList.length > 0
        ? manualList
        : autoList;

      result.set(product.id, baseList.slice(0, limit));
    });

    return result;
  }

  async getComplementMissingReport(options: {
    mode: 'product' | 'customer';
    matchMode?: ComplementMatchMode;
    productCode?: string;
    customerCode?: string;
    sectorCode?: string;
    salesRepId?: string;
    periodMonths?: number;
    page?: number;
    limit?: number;
    minDocumentCount?: number;
    scope?: ReportRequestScope;
    forExport?: boolean;
  }): Promise<ComplementMissingReportResponse> {
    const { mode, productCode, customerCode, sectorCode, salesRepId } = options;
    if (mode !== 'product' && mode !== 'customer') {
      throw new AppError('Rapor modu gecersiz.', 400, ErrorCode.BAD_REQUEST);
    }

    const periodMonths = options.periodMonths === 12 ? 12 : 6;
    const page = options.page && options.page > 0 ? options.page : 1;
    const requestedLimit = options.limit && options.limit > 0 ? Math.floor(options.limit) : 50;
    const limit = Math.min(requestedLimit, options.forExport ? 50_000 : 500);
    const minDocumentCount =
      Number.isFinite(options.minDocumentCount) && (options.minDocumentCount as number) > 0
        ? Math.floor(options.minDocumentCount as number)
        : null;

    const reportEnd = new Date();
    const reportStart = subtractMonthsUtc(reportEnd, periodMonths);
    const startDate = formatDateCompact(reportStart);
    const endDate = formatDateCompact(reportEnd);

    const matchMode: ComplementMatchMode =
      options.matchMode === 'category' || options.matchMode === 'group'
        ? options.matchMode
        : 'product';
    const includePotentialRevenue = matchMode === 'product';
    const priceSettings = includePotentialRevenue
      ? await prisma.settings.findFirst({ select: { customerPriceLists: true } })
      : null;
    const round2 = (value: number): number =>
      Number.isFinite(value) ? Math.round((value + Number.EPSILON) * 100) / 100 : 0;
    const safeDivide = (numerator: number, denominator: number): number =>
      denominator > 0 ? numerator / denominator : 0;
    const monthDivider = periodMonths > 0 ? periodMonths : 1;

    type ComplementProductMeta = {
      productCode: string;
      productName?: string | null;
      categoryCode?: string | null;
      categoryName?: string | null;
      groupCode?: string | null;
    };

    const makeProductKey = (code: string) => `PRODUCT:${code}`;
    const makeCategoryKey = (code: string) => `CATEGORY:${code}`;
    const makeGroupKey = (code: string) => `GROUP:${code}`;

    const addPurchasedKeys = (set: Set<string>, code: string, meta?: ComplementProductMeta) => {
      if (!code) return;
      set.add(makeProductKey(code));
      if (meta?.categoryCode) {
        set.add(makeCategoryKey(meta.categoryCode));
      }
      if (meta?.groupCode) {
        set.add(makeGroupKey(meta.groupCode));
      }
    };

    const buildComplementKey = (meta: ComplementProductMeta | undefined, code: string): string => {
      if (!code) return '';
      if (matchMode === 'group') {
        if (meta?.groupCode) return makeGroupKey(meta.groupCode);
        if (meta?.categoryCode) return makeCategoryKey(meta.categoryCode);
        return makeProductKey(code);
      }
      if (matchMode === 'category') {
        if (meta?.categoryCode) return makeCategoryKey(meta.categoryCode);
        return makeProductKey(code);
      }
      return makeProductKey(code);
    };

    const buildComplementDisplay = (
      meta: ComplementProductMeta | undefined,
      code: string,
      name: string
    ): ComplementMissingItem => {
      if (matchMode === 'group') {
        if (meta?.groupCode) {
          return { productCode: meta.groupCode, productName: `Grup ${meta.groupCode}` };
        }
        if (meta?.categoryCode) {
          return {
            productCode: meta.categoryCode,
            productName: meta.categoryName || `Kategori ${meta.categoryCode}`,
          };
        }
      }

      if (matchMode === 'category' && meta?.categoryCode) {
        return {
          productCode: meta.categoryCode,
          productName: meta.categoryName || `Kategori ${meta.categoryCode}`,
        };
      }

      return { productCode: code, productName: name };
    };

    const buildProductMetaMap = async (codes: string[]) => {
      const uniqueCodes = Array.from(new Set(codes.map(normalizeReportCode).filter(Boolean)));
      const map = new Map<string, ComplementProductMeta>();
      for (const chunk of chunkArray(uniqueCodes, REPORT_CODE_BATCH_SIZE)) {
        if (chunk.length === 0) continue;
        const rows = await prisma.product.findMany({
          where: { mikroCode: { in: chunk } },
          select: {
            mikroCode: true,
            name: true,
            complementGroupCode: true,
            category: { select: { mikroCode: true, name: true } },
          },
        });
        rows.forEach((row) => {
          const normalized = normalizeReportCode(row.mikroCode);
          if (!normalized) return;
          map.set(normalized, {
            productCode: normalized,
            productName: row.name,
            categoryCode: row.category?.mikroCode ? normalizeReportCode(row.category.mikroCode) : null,
            categoryName: row.category?.name ?? null,
            groupCode: row.complementGroupCode ? normalizeReportCode(row.complementGroupCode) : null,
          });
        });
      }
      return map;
    };

    const normalizedSectorCode = normalizeReportCode(sectorCode);
    const isScopedSalesRep = options.scope?.role === UserRole.SALES_REP;
    const requestSectorCodes = getSalesRepSectorCodes(options.scope)
      .map(normalizeReportCode)
      .filter(Boolean);
    let salesRepMeta: ComplementMissingReportResponse['metadata']['salesRep'] = undefined;
    let salesRepSectorCodes: string[] = [];

    if (
      isScopedSalesRep
      && salesRepId
      && salesRepId !== options.scope?.userId
    ) {
      throw new AppError('Bu satis temsilcisi kapsamina erisim yetkiniz yok.', 403, ErrorCode.FORBIDDEN);
    }

    if (salesRepId) {
      const salesRep = await prisma.user.findUnique({
        where: { id: salesRepId },
        select: { id: true, name: true, email: true, assignedSectorCodes: true },
      });
      if (salesRep) {
        salesRepSectorCodes = (salesRep.assignedSectorCodes || [])
          .map(normalizeReportCode)
          .filter(Boolean);
        salesRepMeta = {
          id: salesRep.id,
          name: salesRep.name || null,
          email: salesRep.email || null,
          assignedSectorCodes: salesRepSectorCodes,
        };
      }
    }

    let hasSectorConstraint = false;
    let allowedSectorCodes: string[] = [];
    const constrainToSectors = (codes: string[]) => {
      const normalizedCodes = Array.from(new Set(codes.map(normalizeReportCode).filter(Boolean)));
      allowedSectorCodes = hasSectorConstraint
        ? allowedSectorCodes.filter((code) => normalizedCodes.includes(code))
        : normalizedCodes;
      hasSectorConstraint = true;
    };

    if (normalizedSectorCode) {
      constrainToSectors([normalizedSectorCode]);
    }
    if (salesRepId) {
      constrainToSectors(salesRepSectorCodes);
    }
    if (isScopedSalesRep) {
      constrainToSectors(requestSectorCodes);
    }

    const sectorFilterImpossible = hasSectorConstraint && allowedSectorCodes.length === 0;
    const allowedSectorSet = hasSectorConstraint ? new Set(allowedSectorCodes) : null;

    const metadata: ComplementMissingReportResponse['metadata'] = {
      mode,
      matchMode,
      periodMonths,
      startDate,
      endDate,
      sectorCode: normalizedSectorCode || null,
      salesRep: salesRepMeta,
      minDocumentCount,
      associationSource: 'NONE',
      associationWindowStart: null,
      associationWindowEnd: null,
      associationUpdatedAt: null,
    };

    const attachAssociationMetadata = async (
      products: Array<{ id: string; complementMode: 'AUTO' | 'MANUAL' }>
    ) => {
      const manualModeProductIds = products
        .filter((product) => product.complementMode === 'MANUAL')
        .map((product) => product.id);
      const manualRows = manualModeProductIds.length > 0
        ? await prisma.productComplementManual.findMany({
            where: { productId: { in: manualModeProductIds } },
            select: { productId: true },
            distinct: ['productId'],
          })
        : [];
      const manualProductIds = new Set(manualRows.map((row) => row.productId));
      const autoProductIds = products
        .filter((product) => !manualProductIds.has(product.id))
        .map((product) => product.id);
      const autoAggregate = autoProductIds.length > 0
        ? await prisma.productComplementAuto.aggregate({
            where: { productId: { in: autoProductIds } },
            _count: { _all: true },
            _min: { windowStart: true },
            _max: { windowEnd: true, updatedAt: true },
          })
        : null;
      const hasManual = manualProductIds.size > 0;
      const hasAuto = Boolean(autoAggregate?._count._all);

      metadata.associationSource = hasManual && hasAuto
        ? 'MIXED'
        : hasManual
          ? 'MANUAL'
          : hasAuto
            ? 'AUTO'
            : 'NONE';
      metadata.associationWindowStart = autoAggregate?._min.windowStart?.toISOString() || null;
      metadata.associationWindowEnd = autoAggregate?._max.windowEnd?.toISOString() || null;
      metadata.associationUpdatedAt = autoAggregate?._max.updatedAt?.toISOString() || null;
    };

    const buildResponse = (rows: ComplementMissingRow[]): ComplementMissingReportResponse => {
      const totalRows = rows.length;
      const totalMissing = rows.reduce((sum, row) => sum + row.missingCount, 0);
      const rowsWithRevenueEstimate = rows.filter((row) => row.estimatedRevenue !== null).length;
      const pricedMissingItems = rows.reduce(
        (sum, row) => sum + row.missingComplements.filter(
          (item) => Number.isFinite(item.estimatedRevenue)
        ).length,
        0
      );
      const unpricedMissingItems = Math.max(0, totalMissing - pricedMissingItems);
      const totalEstimatedRevenue = rowsWithRevenueEstimate > 0
        ? round2(rows.reduce((sum, row) => sum + (row.estimatedRevenue || 0), 0))
        : null;
      const averageMissingPerRow = totalRows > 0 ? round2(totalMissing / totalRows) : 0;
      const totalPages = totalRows > 0 ? Math.ceil(totalRows / limit) : 0;
      const offset = (page - 1) * limit;
      const paginatedRows = rows.slice(offset, offset + limit);

      return {
        rows: paginatedRows,
        summary: {
          totalRows,
          totalMissing,
          totalEstimatedRevenue,
          rowsWithRevenueEstimate,
          pricedMissingItems,
          unpricedMissingItems,
          averageMissingPerRow,
        },
        pagination: {
          page,
          limit,
          totalPages,
          totalRecords: totalRows,
        },
        metadata,
      };
    };

    if (sectorFilterImpossible || (salesRepId && !salesRepMeta)) {
      return buildResponse([]);
    }

    if (mode === 'product') {
      const normalizedProductCode = normalizeReportCode(productCode);
      if (!normalizedProductCode) {
        throw new AppError('Urun kodu gerekli.', 400, ErrorCode.BAD_REQUEST);
      }

      const product = await prisma.product.findFirst({
        where: {
          mikroCode: {
            equals: normalizedProductCode,
            mode: 'insensitive',
          },
        },
        select: {
          id: true,
          mikroCode: true,
          name: true,
          complementMode: true,
        },
      });

      if (!product) {
        throw new AppError('Urun bulunamadi.', 404, ErrorCode.PRODUCT_NOT_FOUND);
      }

      metadata.baseProduct = {
        productCode: product.mikroCode,
        productName: product.name,
      };
      await attachAssociationMetadata([
        { id: product.id, complementMode: product.complementMode },
      ]);

      const complementMap = await this.resolveComplementIdsForProducts(
        [{ id: product.id, complementMode: product.complementMode }],
        COMPLEMENT_REPORT_LIMIT
      );
      const complementIds = complementMap.get(product.id) || [];
      if (complementIds.length === 0) {
        return buildResponse([]);
      }

      const complementProducts = await prisma.product.findMany({
        where: { id: { in: complementIds } },
        select: {
          id: true,
          mikroCode: true,
          name: true,
          brandCode: true,
          categoryId: true,
          complementGroupCode: true,
          prices: true,
          category: { select: { mikroCode: true, name: true } },
        },
      });
      const complementLookup = new Map(complementProducts.map((item) => [item.id, item]));
      const complementList = complementIds
        .map((id) => complementLookup.get(id))
        .filter(Boolean) as Array<{
          id: string;
          mikroCode: string;
          name: string;
          brandCode?: string | null;
          categoryId?: string | null;
          complementGroupCode: string | null;
          prices?: unknown;
          category: { mikroCode: string; name: string } | null;
        }>;

      if (complementList.length === 0) {
        return buildResponse([]);
      }

      const complementCodes = complementList
        .map((item) => normalizeReportCode(item.mikroCode))
        .filter(Boolean);
      const complementMetaByCode = new Map<string, {
        code: string;
        brandCode?: string | null;
        categoryId?: string | null;
        prices?: unknown;
      }>();
      complementList.forEach((item) => {
        const code = normalizeReportCode(item.mikroCode);
        if (!code) return;
        complementMetaByCode.set(code, {
          code,
          brandCode: item.brandCode ?? null,
          categoryId: item.categoryId ?? null,
          prices: item.prices,
        });
      });

      const priceStatsMap = includePotentialRevenue && complementCodes.length > 0
        ? await priceListService.getPriceStatsMap(complementCodes)
        : new Map();
      const pairCountByCode = new Map<string, number>();
      if (includePotentialRevenue && product.complementMode !== 'MANUAL' && complementIds.length > 0) {
        const pairRows = await prisma.productComplementAuto.findMany({
          where: { productId: product.id, relatedProductId: { in: complementIds } },
          select: { relatedProductId: true, pairCount: true },
        });
        pairRows.forEach((row) => {
          const related = complementLookup.get(row.relatedProductId);
          const code = related ? normalizeReportCode(related.mikroCode) : '';
          if (!code) return;
          pairCountByCode.set(code, toNumber(row.pairCount));
        });
      }

      await mikroService.connect();
      try {
      const baseConditions = [
        'sth_cins = 0',
        'sth_tip = 1',
        'sth_evraktip IN (1, 4)',
        `sth_tarih >= '${startDate}'`,
        `sth_tarih <= '${endDate}'`,
        '(sth_iptal = 0 OR sth_iptal IS NULL)',
        'sth.sth_stok_kod IS NOT NULL',
        "LTRIM(RTRIM(sth.sth_stok_kod)) <> ''",
        'sth.sth_cari_kodu IS NOT NULL',
        "LTRIM(RTRIM(sth.sth_cari_kodu)) <> ''",
      ];

      const exclusionConditions = await exclusionService.buildStokHareketleriExclusionConditions();
      const perakendeNameFilter =
        "(c.cari_unvan1 IS NULL OR UPPER(c.cari_unvan1) NOT LIKE '%PERAKENDE%')";
      const averageConditions = [...baseConditions, perakendeNameFilter];
      const associationStartDate = metadata.associationWindowStart
        ? formatDateCompact(new Date(metadata.associationWindowStart))
        : startDate;
      const associationEndDate = metadata.associationWindowEnd
        ? formatDateCompact(new Date(metadata.associationWindowEnd))
        : endDate;
      const associationConditions = metadata.associationWindowStart && metadata.associationWindowEnd
        ? [
            'sth_cins = 0',
            'sth_tip = 1',
            'sth_evraktip IN (1, 4)',
            `sth_tarih >= '${associationStartDate}'`,
            `sth_tarih < '${associationEndDate}'`,
            '(sth_iptal = 0 OR sth_iptal IS NULL)',
            'sth.sth_stok_kod IS NOT NULL',
            "LTRIM(RTRIM(sth.sth_stok_kod)) <> ''",
          ]
        : [...averageConditions, ...exclusionConditions];

        const loadQuantityStats = async (codes: string[]) => {
          const normalized = Array.from(new Set(codes.map(normalizeReportCode).filter(Boolean)));
          const result = new Map<string, { docCount: number; totalQuantity: number }>();
          if (normalized.length === 0) return result;

          for (const chunk of chunkArray(normalized, REPORT_CODE_BATCH_SIZE)) {
            if (chunk.length === 0) continue;
            const inClause = chunk.map((code) => `'${escapeSqlLiteral(code)}'`).join(', ');
            const statsQuery = `
              SELECT
                RTRIM(sth.sth_stok_kod) as productCode,
                COUNT(DISTINCT CAST(sth.sth_evraktip AS VARCHAR(10)) + '|' + ISNULL(RTRIM(sth.sth_evrakno_seri), '') + '|' + CAST(sth.sth_evrakno_sira AS VARCHAR(30))) as documentCount,
                SUM(CASE WHEN ISNULL(sth.sth_normal_iade, 0) = 1 THEN -ABS(ISNULL(sth.sth_miktar, 0)) ELSE ISNULL(sth.sth_miktar, 0) END) as totalQuantity
              FROM STOK_HAREKETLERI sth
              LEFT JOIN CARI_HESAPLAR c ON sth.sth_cari_kodu = c.cari_kod
              LEFT JOIN STOKLAR st ON sth.sth_stok_kod = st.sto_kod
              WHERE ${[...associationConditions, `RTRIM(sth.sth_stok_kod) IN (${inClause})`].join(' AND ')}
              GROUP BY sth.sth_stok_kod
            `;
            const rows = await mikroService.executeQuery(statsQuery);
            rows.forEach((row: any) => {
              const code = normalizeReportCode(row.productCode);
              if (!code) return;
              result.set(code, {
                docCount: toNumber(row.documentCount),
                totalQuantity: toNumber(row.totalQuantity),
              });
            });
          }

          return result;
        };

        const baseCustomerConditions = [
          ...baseConditions,
          ...exclusionConditions,
          `RTRIM(sth.sth_stok_kod) = '${escapeSqlLiteral(product.mikroCode)}'`,
        ];
        const baseCustomerClause = baseCustomerConditions.join(' AND ');

        const customerQuery = `
          SELECT
            RTRIM(sth.sth_cari_kodu) as customerCode,
            MAX(c.cari_unvan1) as customerName,
            MAX(c.cari_sektor_kodu) as sectorCode,
            COUNT(DISTINCT CASE
              WHEN ISNULL(sth.sth_normal_iade, 0) = 0
                THEN CAST(sth.sth_evraktip AS VARCHAR(10)) + '|' + ISNULL(RTRIM(sth.sth_evrakno_seri), '') + '|' + CAST(sth.sth_evrakno_sira AS VARCHAR(30))
              ELSE NULL
            END) as documentCount,
            MAX(CASE
              WHEN ISNULL(sth.sth_normal_iade, 0) = 0 THEN sth.sth_tarih
              ELSE NULL
            END) as lastPurchaseDate,
            SUM(CASE WHEN ISNULL(sth.sth_normal_iade, 0) = 1 THEN -ABS(ISNULL(sth.sth_miktar, 0)) ELSE ISNULL(sth.sth_miktar, 0) END) as totalQuantity
          FROM STOK_HAREKETLERI sth
          LEFT JOIN CARI_HESAPLAR c ON sth.sth_cari_kodu = c.cari_kod
          LEFT JOIN STOKLAR st ON sth.sth_stok_kod = st.sto_kod
          WHERE ${baseCustomerClause}
          GROUP BY sth.sth_cari_kodu
        `;

        const customerRows = await mikroService.executeQuery(customerQuery);

        const customerMap = new Map<string, {
          customerCode: string;
          customerName: string | null;
          sectorCode: string | null;
          documentCount: number;
          totalQuantity: number;
          lastPurchaseDate: string | null;
        }>();
        const customerCodes: string[] = [];
        customerRows.forEach((row: any) => {
          const customer = normalizeReportCode(row.customerCode);
          if (!customer) return;
          if (customerMap.has(customer)) return;
          const sectorValue = normalizeReportCode(row.sectorCode);
          if (allowedSectorSet && (!sectorValue || !allowedSectorSet.has(sectorValue))) return;
          const rawCode = row.customerCode?.trim() || customer;
          const documentCountValue = Number(row.documentCount) || 0;
          const totalQuantityValue = toNumber(row.totalQuantity);
          if (documentCountValue <= 0 || totalQuantityValue <= 0) return;
          customerMap.set(customer, {
            customerCode: rawCode,
            customerName: row.customerName || null,
            sectorCode: sectorValue || null,
            documentCount: documentCountValue,
            totalQuantity: totalQuantityValue,
            lastPurchaseDate: normalizeReportDateKey(row.lastPurchaseDate),
          });
          customerCodes.push(rawCode);
        });

        if (customerCodes.length === 0) {
          return buildResponse([]);
        }

        let customerPricingMap = new Map<string, {
          customerType: 'BAYI' | 'PERAKENDE' | 'VIP' | 'OZEL';
          basePair: { invoiced: number; white: number };
          rules: Array<{
            brandCode?: string | null;
            categoryId?: string | null;
            invoicedPriceListNo: number;
            whitePriceListNo: number;
          }>;
        }>();
        if (includePotentialRevenue) {
          const pricingCustomers = await prisma.user.findMany({
            where: { mikroCariCode: { in: customerCodes } },
            select: {
              id: true,
              mikroCariCode: true,
              customerType: true,
              invoicedPriceListNo: true,
              whitePriceListNo: true,
              priceListRules: true,
            },
          });
          pricingCustomers.forEach((customer) => {
            const code = normalizeReportCode(customer.mikroCariCode || '');
            if (!code) return;
            const customerType =
              customer.customerType === 'PERAKENDE' ||
              customer.customerType === 'VIP' ||
              customer.customerType === 'OZEL'
                ? customer.customerType
                : 'BAYI';
            const basePair = resolveCustomerPriceLists(customer, priceSettings);
            customerPricingMap.set(code, {
              customerType,
              basePair,
              rules: customer.priceListRules || [],
            });
          });
        }

        let baseDocCount = 0;
        let complementAvgQtyMap = new Map<string, number>();
        if (includePotentialRevenue) {
          const baseStats = await loadQuantityStats([product.mikroCode]);
          const baseCode = normalizeReportCode(product.mikroCode);
          const baseEntry = baseCode ? baseStats.get(baseCode) : undefined;
          baseDocCount = baseEntry?.docCount || 0;

          const complementStats = await loadQuantityStats(complementCodes);
          complementAvgQtyMap = new Map(
            Array.from(complementStats.entries()).map(([code, stat]) => [
              code,
              safeDivide(stat.totalQuantity, stat.docCount),
            ])
          );
        }

        const purchaseMap = new Map<string, Set<string>>();

        const customerChunks = chunkArray(customerCodes, REPORT_CUSTOMER_BATCH_SIZE);
        for (const chunk of customerChunks) {
          if (chunk.length === 0) continue;
          const inClause = chunk
            .map((code) => `'${escapeSqlLiteral(code)}'`)
            .join(', ');

          const purchaseConditions = [
            ...baseConditions,
            ...exclusionConditions,
            `RTRIM(sth.sth_cari_kodu) IN (${inClause})`,
            'ISNULL(sth.sth_normal_iade, 0) = 0',
          ];
          const purchaseClause = purchaseConditions.join(' AND ');

          const purchaseQuery = `
            SELECT
              RTRIM(sth.sth_cari_kodu) as customerCode,
              RTRIM(sth.sth_stok_kod) as productCode
            FROM STOK_HAREKETLERI sth
            LEFT JOIN CARI_HESAPLAR c ON sth.sth_cari_kodu = c.cari_kod
            LEFT JOIN STOKLAR st ON sth.sth_stok_kod = st.sto_kod
            WHERE ${purchaseClause}
            GROUP BY sth.sth_cari_kodu, sth.sth_stok_kod
          `;

          const purchaseRows = await mikroService.executeQuery(purchaseQuery);
          purchaseRows.forEach((row: any) => {
            const customer = normalizeReportCode(row.customerCode);
            const code = normalizeReportCode(row.productCode);
            if (!customer || !code) return;
            const set = purchaseMap.get(customer) || new Set<string>();
            set.add(code);
            purchaseMap.set(customer, set);
          });
        }

        const allPurchasedCodes = Array.from(purchaseMap.values())
          .flatMap((set) => Array.from(set));
        const metaMap = await buildProductMetaMap([
          product.mikroCode,
          ...complementList.map((item) => item.mikroCode),
          ...allPurchasedCodes,
        ]);

        const complementTargets = new Map<string, ComplementMissingItem>();
        complementList.forEach((item) => {
          const normalizedCode = normalizeReportCode(item.mikroCode);
          if (!normalizedCode) return;
          const meta = metaMap.get(normalizedCode);
          const key = buildComplementKey(meta, normalizedCode);
          if (!key) return;
          const display = buildComplementDisplay(meta, item.mikroCode, item.name);
          if (!complementTargets.has(key)) {
            complementTargets.set(key, display);
          }
        });

        if (complementTargets.size === 0) {
          return buildResponse([]);
        }

        const resolveUnitPrice = (customerCode: string, complementCode: string): number | null => {
          if (!includePotentialRevenue) return null;
          const customerKey = normalizeReportCode(customerCode);
          const productKey = normalizeReportCode(complementCode);
          if (!customerKey || !productKey) return null;
          const pricing = customerPricingMap.get(customerKey);
          const productMeta = complementMetaByCode.get(productKey);
          if (!pricing || !productMeta) return null;

          const listPair = resolveCustomerPriceListsForProduct(
            pricing.basePair,
            pricing.rules,
            {
              brandCode: productMeta.brandCode || null,
              categoryId: productMeta.categoryId || null,
            }
          );
          const priceStats = priceStatsMap.get(productMeta.code) || null;
          let unitPrice = priceListService.getListPriceWithFallback(priceStats, listPair.invoiced);
          if (!unitPrice && productMeta.prices) {
            const basePrices = pricingService.getPriceForCustomer(
              productMeta.prices as any,
              pricing.customerType
            );
            unitPrice = basePrices.invoiced;
          }
          return unitPrice > 0 ? round2(unitPrice) : null;
        };

        const rows: ComplementMissingRow[] = [];
        customerMap.forEach((customerInfo, normalizedCustomer) => {
          if (minDocumentCount && customerInfo.documentCount < minDocumentCount) return;
          const purchasedCodes = purchaseMap.get(normalizedCustomer);
          if (!purchasedCodes || purchasedCodes.size === 0) return;

          const purchasedKeys = new Set<string>();
          purchasedCodes.forEach((code) => {
            const meta = metaMap.get(code);
            addPurchasedKeys(purchasedKeys, code, meta);
          });

          const missingComplements: ComplementMissingItem[] = [];
          const baseAvgQty = safeDivide(customerInfo.totalQuantity, customerInfo.documentCount);
          complementTargets.forEach((item, key) => {
            if (purchasedKeys.has(key)) return;
            if (!includePotentialRevenue) {
              missingComplements.push(item);
              return;
            }

            const normalizedCode = normalizeReportCode(item.productCode);
            const pairCount = normalizedCode ? (pairCountByCode.get(normalizedCode) || 0) : 0;
            const ratio = baseDocCount > 0 ? Math.min(1, pairCount / baseDocCount) : 0;
            const effectiveRatio =
              ratio > 0 ? ratio : (product.complementMode === 'MANUAL' ? 1 : 0);
            const avgComplementQty = normalizedCode ? (complementAvgQtyMap.get(normalizedCode) || 0) : 0;
            const quantityPerDoc = avgComplementQty > 0 ? avgComplementQty : baseAvgQty;
            const estimatedDocs = (customerInfo.documentCount * effectiveRatio) / monthDivider;
            const estimatedQuantity = estimatedDocs * quantityPerDoc;
            const unitPrice = resolveUnitPrice(customerInfo.customerCode, item.productCode);
            const estimatedRevenue =
              unitPrice !== null ? round2(estimatedQuantity * unitPrice) : null;

            missingComplements.push({
              ...item,
              estimatedQuantity: round2(estimatedQuantity),
              unitPrice,
              estimatedRevenue,
            });
          });

          if (missingComplements.length === 0) return;
          const hasRevenueEstimate = missingComplements.some((item) =>
            Number.isFinite(item.estimatedRevenue)
          );
          const estimatedRevenue = hasRevenueEstimate
            ? round2(missingComplements.reduce(
                (sum, item) => sum + (Number.isFinite(item.estimatedRevenue) ? Number(item.estimatedRevenue) : 0),
                0
              ))
            : null;

          rows.push({
            customerCode: customerInfo.customerCode,
            customerName: customerInfo.customerName || '-',
            documentCount: customerInfo.documentCount,
            lastPurchaseDate: customerInfo.lastPurchaseDate,
            daysSinceLastPurchase: daysSinceUtcCalendarDate(
              reportEnd,
              customerInfo.lastPurchaseDate
            ),
            missingComplements,
            missingCount: missingComplements.length,
            estimatedRevenue,
          });
        });

        rows.sort((a, b) => {
          if (b.missingCount !== a.missingCount) {
            return b.missingCount - a.missingCount;
          }
          return (a.customerName || '').localeCompare(b.customerName || '');
        });

        return buildResponse(rows);
      } finally {
        await mikroService.disconnect();
      }
    }

    const normalizedCustomerCode = normalizeReportCode(customerCode);
    if (!normalizedCustomerCode) {
      throw new AppError('Cari kodu gerekli.', 400, ErrorCode.BAD_REQUEST);
    }

    await mikroService.connect();
    try {
      const whereConditions = [
        'sth_cins = 0',
        'sth_tip = 1',
        'sth_evraktip IN (1, 4)',
        `sth_tarih >= '${startDate}'`,
        `sth_tarih <= '${endDate}'`,
        '(sth_iptal = 0 OR sth_iptal IS NULL)',
        'sth.sth_stok_kod IS NOT NULL',
        "LTRIM(RTRIM(sth.sth_stok_kod)) <> ''",
        `RTRIM(sth.sth_cari_kodu) = '${escapeSqlLiteral(normalizedCustomerCode)}'`,
      ];

      const exclusionConditions = await exclusionService.buildStokHareketleriExclusionConditions();
      whereConditions.push(...exclusionConditions);

      const whereClause = whereConditions.join(' AND ');

      const query = `
        SELECT
          RTRIM(sth.sth_stok_kod) as productCode,
          MAX(st.sto_isim) as productName,
          MAX(c.cari_unvan1) as customerName,
          MAX(c.cari_sektor_kodu) as sectorCode,
          COUNT(DISTINCT CASE
            WHEN ISNULL(sth.sth_normal_iade, 0) = 0
              THEN CAST(sth.sth_evraktip AS VARCHAR(10)) + '|' + ISNULL(RTRIM(sth.sth_evrakno_seri), '') + '|' + CAST(sth.sth_evrakno_sira AS VARCHAR(30))
            ELSE NULL
          END) as documentCount,
          MAX(CASE
            WHEN ISNULL(sth.sth_normal_iade, 0) = 0 THEN sth.sth_tarih
            ELSE NULL
          END) as lastPurchaseDate,
          SUM(CASE WHEN ISNULL(sth.sth_normal_iade, 0) = 1 THEN -ABS(ISNULL(sth.sth_miktar, 0)) ELSE ISNULL(sth.sth_miktar, 0) END) as totalQuantity
        FROM STOK_HAREKETLERI sth
        LEFT JOIN CARI_HESAPLAR c ON sth.sth_cari_kodu = c.cari_kod
        LEFT JOIN STOKLAR st ON sth.sth_stok_kod = st.sto_kod
        WHERE ${whereClause}
        GROUP BY sth.sth_stok_kod
      `;

      const rawData = await mikroService.executeQuery(query);
      const customerName = rawData.length > 0 ? rawData[0].customerName || null : null;
      const customerSector = rawData.length > 0 ? normalizeReportCode(rawData[0].sectorCode) : '';
      if (allowedSectorSet && (!customerSector || !allowedSectorSet.has(customerSector))) {
        return buildResponse([]);
      }
      metadata.customer = {
        customerCode: normalizedCustomerCode,
        customerName,
      };
      metadata.sectorCode = customerSector || null;

      const documentCountMap = new Map<string, number>();
      const quantityMap = new Map<string, number>();
      const lastPurchaseDateMap = new Map<string, string | null>();
      const purchasedCodes = rawData
        .map((row: any) => {
          const normalized = normalizeReportCode(row.productCode);
          if (!normalized) return '';
          const docCount = Number(row.documentCount) || 0;
          const totalQuantity = toNumber(row.totalQuantity);
          if (docCount <= 0 || totalQuantity <= 0) return '';
          documentCountMap.set(normalized, docCount);
          quantityMap.set(normalized, totalQuantity);
          lastPurchaseDateMap.set(normalized, normalizeReportDateKey(row.lastPurchaseDate));
          return normalized;
        })
        .filter(Boolean);

      if (purchasedCodes.length === 0) {
        return buildResponse([]);
      }

      const purchasedProducts = await prisma.product.findMany({
        where: { mikroCode: { in: purchasedCodes } },
        select: {
          id: true,
          mikroCode: true,
          name: true,
          complementMode: true,
          brandCode: true,
          categoryId: true,
          complementGroupCode: true,
          prices: true,
          category: { select: { mikroCode: true, name: true } },
        },
      });

      if (purchasedProducts.length === 0) {
        return buildResponse([]);
      }
      await attachAssociationMetadata(
        purchasedProducts.map((product) => ({
          id: product.id,
          complementMode: product.complementMode,
        }))
      );

      const complementMap = await this.resolveComplementIdsForProducts(
        purchasedProducts,
        COMPLEMENT_REPORT_LIMIT
      );
      const allComplementIds = Array.from(
        new Set(Array.from(complementMap.values()).flat())
      );

      if (allComplementIds.length === 0) {
        return buildResponse([]);
      }

      const complementProducts = await prisma.product.findMany({
        where: { id: { in: allComplementIds } },
        select: {
          id: true,
          mikroCode: true,
          name: true,
          brandCode: true,
          categoryId: true,
          complementGroupCode: true,
          prices: true,
          category: { select: { mikroCode: true, name: true } },
        },
      });
      const complementLookup = new Map(complementProducts.map((item) => [item.id, item]));

      const pricingMetaByCode = new Map<string, {
        code: string;
        brandCode?: string | null;
        categoryId?: string | null;
        prices?: unknown;
      }>();
      const addPricingMeta = (item: {
        mikroCode: string;
        brandCode?: string | null;
        categoryId?: string | null;
        prices?: unknown;
      }) => {
        const normalized = normalizeReportCode(item.mikroCode);
        if (!normalized) return;
        pricingMetaByCode.set(normalized, {
          code: normalized,
          brandCode: item.brandCode ?? null,
          categoryId: item.categoryId ?? null,
          prices: item.prices,
        });
      };

      const metaMap = new Map<string, ComplementProductMeta>();
      const addMeta = (item: {
        mikroCode: string;
        name: string;
        complementGroupCode?: string | null;
        category?: { mikroCode: string; name: string } | null;
      }) => {
        const normalized = normalizeReportCode(item.mikroCode);
        if (!normalized) return;
        metaMap.set(normalized, {
          productCode: normalized,
          productName: item.name,
          categoryCode: item.category?.mikroCode ? normalizeReportCode(item.category.mikroCode) : null,
          categoryName: item.category?.name ?? null,
          groupCode: item.complementGroupCode ? normalizeReportCode(item.complementGroupCode) : null,
        });
      };

      purchasedProducts.forEach(addMeta);
      complementProducts.forEach(addMeta);
      purchasedProducts.forEach(addPricingMeta);
      complementProducts.forEach(addPricingMeta);

      const purchasedKeys = new Set<string>();
      purchasedCodes.forEach((code) => {
        const normalized = normalizeReportCode(code);
        if (!normalized) return;
        const meta = metaMap.get(normalized);
        addPurchasedKeys(purchasedKeys, normalized, meta);
      });

      const complementCodes = Array.from(new Set(
        complementProducts.map((item) => normalizeReportCode(item.mikroCode)).filter(Boolean)
      ));
      const priceStatsMap = includePotentialRevenue && complementCodes.length > 0
        ? await priceListService.getPriceStatsMap(complementCodes)
        : new Map();

      let customerPricing: {
        customerType: 'BAYI' | 'PERAKENDE' | 'VIP' | 'OZEL';
        basePair: { invoiced: number; white: number };
        rules: Array<{
          brandCode?: string | null;
          categoryId?: string | null;
          invoicedPriceListNo: number;
          whitePriceListNo: number;
        }>;
      } | null = null;

      if (includePotentialRevenue) {
        const pricingCustomer = await prisma.user.findFirst({
          where: { mikroCariCode: normalizedCustomerCode },
          select: {
            customerType: true,
            invoicedPriceListNo: true,
            whitePriceListNo: true,
            priceListRules: true,
          },
        });
        if (pricingCustomer) {
          const customerType =
            pricingCustomer.customerType === 'PERAKENDE' ||
            pricingCustomer.customerType === 'VIP' ||
            pricingCustomer.customerType === 'OZEL'
              ? pricingCustomer.customerType
              : 'BAYI';
          customerPricing = {
            customerType,
            basePair: resolveCustomerPriceLists(pricingCustomer, priceSettings),
            rules: pricingCustomer.priceListRules || [],
          };
        }
      }

      const globalConditions = [
        'sth_cins = 0',
        'sth_tip = 1',
        'sth_evraktip IN (1, 4)',
        `sth_tarih >= '${startDate}'`,
        `sth_tarih <= '${endDate}'`,
        '(sth_iptal = 0 OR sth_iptal IS NULL)',
        'sth.sth_stok_kod IS NOT NULL',
        "LTRIM(RTRIM(sth.sth_stok_kod)) <> ''",
        'sth.sth_cari_kodu IS NOT NULL',
        "LTRIM(RTRIM(sth.sth_cari_kodu)) <> ''",
      ];
      const perakendeNameFilter =
        "(c.cari_unvan1 IS NULL OR UPPER(c.cari_unvan1) NOT LIKE '%PERAKENDE%')";
      const averageGlobalConditions = [...globalConditions, perakendeNameFilter];
      const associationStartDate = metadata.associationWindowStart
        ? formatDateCompact(new Date(metadata.associationWindowStart))
        : startDate;
      const associationEndDate = metadata.associationWindowEnd
        ? formatDateCompact(new Date(metadata.associationWindowEnd))
        : endDate;
      const globalStatsConditions = metadata.associationWindowStart && metadata.associationWindowEnd
        ? [
            'sth_cins = 0',
            'sth_tip = 1',
            'sth_evraktip IN (1, 4)',
            `sth_tarih >= '${associationStartDate}'`,
            `sth_tarih < '${associationEndDate}'`,
            '(sth_iptal = 0 OR sth_iptal IS NULL)',
            'sth.sth_stok_kod IS NOT NULL',
            "LTRIM(RTRIM(sth.sth_stok_kod)) <> ''",
          ]
        : [...averageGlobalConditions, ...exclusionConditions];

      const loadGlobalStats = async (codes: string[]) => {
        const normalized = Array.from(new Set(codes.map(normalizeReportCode).filter(Boolean)));
        const result = new Map<string, { docCount: number; totalQuantity: number }>();
        if (normalized.length === 0) return result;

        for (const chunk of chunkArray(normalized, REPORT_CODE_BATCH_SIZE)) {
          if (chunk.length === 0) continue;
          const inClause = chunk.map((code) => `'${escapeSqlLiteral(code)}'`).join(', ');
          const statsQuery = `
              SELECT
                RTRIM(sth.sth_stok_kod) as productCode,
                COUNT(DISTINCT CAST(sth.sth_evraktip AS VARCHAR(10)) + '|' + ISNULL(RTRIM(sth.sth_evrakno_seri), '') + '|' + CAST(sth.sth_evrakno_sira AS VARCHAR(30))) as documentCount,
              SUM(CASE WHEN ISNULL(sth.sth_normal_iade, 0) = 1 THEN -ABS(ISNULL(sth.sth_miktar, 0)) ELSE ISNULL(sth.sth_miktar, 0) END) as totalQuantity
              FROM STOK_HAREKETLERI sth
              LEFT JOIN CARI_HESAPLAR c ON sth.sth_cari_kodu = c.cari_kod
              LEFT JOIN STOKLAR st ON sth.sth_stok_kod = st.sto_kod
              WHERE ${[...globalStatsConditions, `RTRIM(sth.sth_stok_kod) IN (${inClause})`].join(' AND ')}
              GROUP BY sth.sth_stok_kod
          `;
          const rows = await mikroService.executeQuery(statsQuery);
          rows.forEach((row: any) => {
            const code = normalizeReportCode(row.productCode);
            if (!code) return;
            result.set(code, {
              docCount: toNumber(row.documentCount),
              totalQuantity: toNumber(row.totalQuantity),
            });
          });
        }

        return result;
      };

      const baseDocCountMap = new Map<string, number>();
      const complementAvgQtyMap = new Map<string, number>();
      if (includePotentialRevenue) {
        const baseStats = await loadGlobalStats(purchasedCodes);
        baseStats.forEach((stat, code) => {
          baseDocCountMap.set(code, stat.docCount);
        });

        const complementStats = await loadGlobalStats(complementCodes);
        complementStats.forEach((stat, code) => {
          complementAvgQtyMap.set(code, safeDivide(stat.totalQuantity, stat.docCount));
        });
      }

      const pairCountByPair = new Map<string, number>();
      if (includePotentialRevenue && allComplementIds.length > 0) {
        const pairRows = await prisma.productComplementAuto.findMany({
          where: { productId: { in: purchasedProducts.map((item) => item.id) }, relatedProductId: { in: allComplementIds } },
          select: { productId: true, relatedProductId: true, pairCount: true },
        });
        pairRows.forEach((row) => {
          const key = `${row.productId}:${row.relatedProductId}`;
          pairCountByPair.set(key, toNumber(row.pairCount));
        });
      }

      const rows: ComplementMissingRow[] = [];
      purchasedProducts.forEach((product) => {
        const normalized = normalizeReportCode(product.mikroCode);
        const documentCount = documentCountMap.get(normalized) || 0;
        if (minDocumentCount && documentCount < minDocumentCount) return;
        const complementIds = complementMap.get(product.id) || [];
        if (complementIds.length === 0) return;

        const missingMap = new Map<string, ComplementMissingItem>();
        complementIds.forEach((id) => {
          const complement = complementLookup.get(id);
          if (!complement) return;
          const normalizedCode = normalizeReportCode(complement.mikroCode);
          if (!normalizedCode) return;
          const meta = metaMap.get(normalizedCode);
          const key = buildComplementKey(meta, normalizedCode);
          if (!key || purchasedKeys.has(key)) return;
          if (!missingMap.has(key)) {
            if (!includePotentialRevenue) {
              missingMap.set(
                key,
                buildComplementDisplay(meta, complement.mikroCode, complement.name)
              );
            } else {
              const baseTotalQty = quantityMap.get(normalized) || 0;
              const baseAvgQty = safeDivide(baseTotalQty, documentCount);
              const baseDocCount = baseDocCountMap.get(normalized) || 0;
              const pairCount = pairCountByPair.get(`${product.id}:${id}`) || 0;
              const ratio = baseDocCount > 0 ? Math.min(1, pairCount / baseDocCount) : 0;
              const effectiveRatio =
                ratio > 0 ? ratio : (product.complementMode === 'MANUAL' ? 1 : 0);
              const avgComplementQty = complementAvgQtyMap.get(normalizedCode) || 0;
              const quantityPerDoc = avgComplementQty > 0 ? avgComplementQty : baseAvgQty;
              const estimatedDocs = (documentCount * effectiveRatio) / monthDivider;
              const estimatedQuantity = estimatedDocs * quantityPerDoc;
              const productMeta = pricingMetaByCode.get(normalizedCode);
              let unitPrice: number | null = null;
              if (customerPricing && productMeta) {
                const listPair = resolveCustomerPriceListsForProduct(
                  customerPricing.basePair,
                  customerPricing.rules,
                  {
                    brandCode: productMeta.brandCode || null,
                    categoryId: productMeta.categoryId || null,
                  }
                );
                const priceStats = priceStatsMap.get(productMeta.code) || null;
                let priceValue = priceListService.getListPriceWithFallback(priceStats, listPair.invoiced);
                if (!priceValue && productMeta.prices) {
                  const basePrices = pricingService.getPriceForCustomer(
                    productMeta.prices as any,
                    customerPricing.customerType
                  );
                  priceValue = basePrices.invoiced;
                }
                unitPrice = priceValue > 0 ? round2(priceValue) : null;
              }
              const estimatedRevenue =
                unitPrice !== null ? round2(estimatedQuantity * unitPrice) : null;

              missingMap.set(
                key,
                {
                  ...buildComplementDisplay(meta, complement.mikroCode, complement.name),
                  estimatedQuantity: round2(estimatedQuantity),
                  unitPrice,
                  estimatedRevenue,
                }
              );
            }
          }
        });

        if (missingMap.size === 0) return;

        const missingComplements = Array.from(missingMap.values());
        const hasRevenueEstimate = missingComplements.some((item) =>
          Number.isFinite(item.estimatedRevenue)
        );
        const estimatedRevenue = hasRevenueEstimate
          ? round2(missingComplements.reduce(
              (sum, item) => sum + (Number.isFinite(item.estimatedRevenue) ? Number(item.estimatedRevenue) : 0),
              0
            ))
          : null;

        rows.push({
          productCode: product.mikroCode,
          productName: product.name,
          documentCount,
          lastPurchaseDate: lastPurchaseDateMap.get(normalized) || null,
          daysSinceLastPurchase: daysSinceUtcCalendarDate(
            reportEnd,
            lastPurchaseDateMap.get(normalized) || null
          ),
          missingComplements,
          missingCount: missingComplements.length,
          estimatedRevenue,
        });
      });

      rows.sort((a, b) => {
        if (b.missingCount !== a.missingCount) {
          return b.missingCount - a.missingCount;
        }
        return (a.productName || '').localeCompare(b.productName || '');
      });

      return buildResponse(rows);
    } finally {
      await mikroService.disconnect();
    }
  }

  async getCategoryChurnCategoryOptions(options?: {
    search?: string;
    limit?: number;
  }): Promise<{ categories: Array<{ categoryCode: string; categoryName: string | null }> }> {
    const search = String(options?.search || '').trim();
    const limitRaw = Number(options?.limit);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(100, Math.floor(limitRaw))
        : 30;

    const categories = await prisma.category.findMany({
      where: search
        ? {
            OR: [
              { mikroCode: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      select: {
        mikroCode: true,
        name: true,
      },
      orderBy: [{ mikroCode: 'asc' }],
      take: limit,
    });

    return {
      categories: categories.map((row) => ({
        categoryCode: row.mikroCode,
        categoryName: row.name || null,
      })),
    };
  }

  async getCategoryChurnDetail(options: {
    mode: CategoryChurnMode;
    categoryCode?: string;
    customerCode?: string;
    inactiveMonths?: number;
    scope?: ReportRequestScope;
  }): Promise<{
    items: CategoryChurnDetailItem[];
    metadata: {
      mode: CategoryChurnMode;
      categoryCode: string;
      categoryName: string | null;
      customerCode: string;
      inactiveMonths: number;
      inactiveStartDate: string;
      endDate: string;
    };
  }> {
    const mode: CategoryChurnMode = options.mode === 'customer' ? 'customer' : 'category';
    const categoryCode = normalizeReportCode(options.categoryCode);
    const customerCode = normalizeReportCode(options.customerCode);
    const inactiveMonthsRaw = Number(options.inactiveMonths);
    const inactiveMonths =
      Number.isFinite(inactiveMonthsRaw) && inactiveMonthsRaw > 0
        ? Math.min(24, Math.floor(inactiveMonthsRaw))
        : 4;

    if (!categoryCode) {
      throw new AppError('Kategori kodu gerekli.', 400, ErrorCode.BAD_REQUEST);
    }
    if (!customerCode) {
      throw new AppError('Cari kodu gerekli.', 400, ErrorCode.BAD_REQUEST);
    }

    if (options.scope?.role === UserRole.SALES_REP) {
      const allowedSectorCodes = new Set(getSalesRepSectorCodes(options.scope).map(normalizeReportCode));
      const customer = await prisma.user.findFirst({
        where: {
          role: 'CUSTOMER',
          parentCustomerId: null,
          mikroCariCode: { equals: customerCode, mode: 'insensitive' },
        },
        select: { sectorCode: true },
      });
      if (
        allowedSectorCodes.size === 0
        || !allowedSectorCodes.has(normalizeReportCode(customer?.sectorCode))
      ) {
        throw new AppError('Bu carinin kategori detayina erisemezsiniz.', 403, ErrorCode.FORBIDDEN);
      }
    }

    const reportEnd = new Date();
    const inactiveStart = subtractMonthsUtc(reportEnd, inactiveMonths);
    const inactiveStartCompact = formatDateCompact(inactiveStart);

    const selectedCategory = await prisma.category.findFirst({
      where: { mikroCode: { equals: categoryCode, mode: 'insensitive' } },
      select: { mikroCode: true, name: true },
    });

    const categoryProducts = await prisma.product.findMany({
      where: {
        category: {
          mikroCode: {
            equals: selectedCategory?.mikroCode || categoryCode,
            mode: 'insensitive',
          },
        },
      },
      select: {
        mikroCode: true,
        name: true,
      },
    });

    const normalizedProductCodes = Array.from(
      new Set(categoryProducts.map((row) => normalizeReportCode(row.mikroCode)).filter(Boolean))
    );
    const productNameMap = new Map<string, string>();
    categoryProducts.forEach((row) => {
      const code = normalizeReportCode(row.mikroCode);
      if (!code) return;
      productNameMap.set(code, row.name || code);
    });

    const metadata = {
      mode,
      categoryCode: selectedCategory?.mikroCode || categoryCode,
      categoryName: selectedCategory?.name || null,
      customerCode,
      inactiveMonths,
      inactiveStartDate: formatDateKey(inactiveStart),
      endDate: formatDateKey(reportEnd),
    };

    if (normalizedProductCodes.length === 0) {
      return {
        items: [],
        metadata,
      };
    }

    const toCompactDate = (value: unknown): string | null => {
      if (!value) return null;
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return formatDateCompact(value);
      }
      const raw = String(value).trim();
      if (!raw) return null;
      const cleaned = raw.replace(/[^0-9]/g, '');
      if (/^\d{8}$/.test(cleaned)) return cleaned;
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) return null;
      return formatDateCompact(parsed);
    };

    const compactToDisplay = (value: string | null): string | null =>
      value && /^\d{8}$/.test(value)
        ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
        : null;

    const productInClause = normalizedProductCodes
      .map((code) => `'${escapeSqlLiteral(code)}'`)
      .join(', ');

    const baseConditions = [
      'sth_cins = 0',
      'sth_tip = 1',
      'sth_evraktip IN (1, 4)',
      '(sth_iptal = 0 OR sth_iptal IS NULL)',
      'sth.sth_stok_kod IS NOT NULL',
      "LTRIM(RTRIM(sth.sth_stok_kod)) <> ''",
      'sth.sth_cari_kodu IS NOT NULL',
      "LTRIM(RTRIM(sth.sth_cari_kodu)) <> ''",
    ];
    const exclusionConditions = await exclusionService.buildStokHareketleriExclusionConditions();
    const whereClause = [
      ...baseConditions,
      ...exclusionConditions,
      `RTRIM(sth.sth_cari_kodu) = '${escapeSqlLiteral(customerCode)}'`,
      `RTRIM(sth.sth_stok_kod) IN (${productInClause})`,
      `sth.sth_tarih < '${inactiveStartCompact}'`,
    ].join(' AND ');

    await mikroService.connect();
    try {
      const query = `
        SELECT
          RTRIM(sth.sth_stok_kod) as productCode,
          MAX(st.sto_isim) as productName,
          MIN(CASE WHEN ISNULL(sth.sth_normal_iade, 0) = 0 THEN sth.sth_tarih END) as firstPurchaseDate,
          MAX(CASE WHEN ISNULL(sth.sth_normal_iade, 0) = 0 THEN sth.sth_tarih END) as lastPurchaseDate,
          COUNT(DISTINCT CASE
            WHEN ISNULL(sth.sth_normal_iade, 0) = 0
              THEN CAST(sth.sth_evraktip AS VARCHAR(10)) + '|' + ISNULL(RTRIM(sth.sth_evrakno_seri), '') + '|' + CAST(sth.sth_evrakno_sira AS VARCHAR(30))
            ELSE NULL
          END) as documentCount,
          SUM(CASE WHEN ISNULL(sth.sth_normal_iade, 0) = 1 THEN -ABS(ISNULL(sth.sth_miktar, 0)) ELSE ISNULL(sth.sth_miktar, 0) END) as totalQuantity,
          SUM(CASE WHEN ISNULL(sth.sth_normal_iade, 0) = 1 THEN -ABS(ISNULL(sth.sth_tutar, 0)) ELSE ISNULL(sth.sth_tutar, 0) END) as totalAmount
        FROM STOK_HAREKETLERI sth
        LEFT JOIN STOKLAR st ON sth.sth_stok_kod = st.sto_kod
        LEFT JOIN CARI_HESAPLAR c ON sth.sth_cari_kodu = c.cari_kod
        WHERE ${whereClause}
        GROUP BY sth.sth_stok_kod
      `;

      const rows = await mikroService.executeQuery(query);
      const items: CategoryChurnDetailItem[] = rows
        .map((row: any) => {
          const code = normalizeReportCode(row.productCode);
          const fallbackName = code ? productNameMap.get(code) : null;
          return {
            productCode: code || String(row.productCode || '').trim(),
            productName: row.productName || fallbackName || '-',
            firstPurchaseDate: compactToDisplay(toCompactDate(row.firstPurchaseDate)),
            lastPurchaseDate: compactToDisplay(toCompactDate(row.lastPurchaseDate)),
            documentCount: Number(row.documentCount) || 0,
            totalQuantity: toNumber(row.totalQuantity),
            totalAmount: toNumber(row.totalAmount),
          };
        })
        .filter((item) => item.documentCount > 0);

      items.sort((a, b) => {
        const aDate = normalizeReportCode((a.lastPurchaseDate || '').replace(/-/g, ''));
        const bDate = normalizeReportCode((b.lastPurchaseDate || '').replace(/-/g, ''));
        if (aDate !== bDate) return bDate.localeCompare(aDate);
        return b.totalAmount - a.totalAmount;
      });

      return {
        items,
        metadata,
      };
    } finally {
      await mikroService.disconnect();
    }
  }

  async getCategoryChurnReport(options: {
    mode: CategoryChurnMode;
    categoryCode?: string;
    customerCode?: string;
    inactiveMonths?: number;
    activeCustomerMonths?: number;
    sectorCode?: string;
    minHistoricalDocumentCount?: number;
    minHistoricalAmount?: number;
    scope?: ReportRequestScope;
    page?: number;
    limit?: number;
    forExport?: boolean;
    sortBy?: CategoryChurnSortBy;
    sortDirection?: CategoryChurnSortDirection;
  }): Promise<CategoryChurnReportResponse> {
    const mode: CategoryChurnMode = options.mode === 'customer' ? 'customer' : 'category';
    const normalizedCategoryCode = normalizeReportCode(options.categoryCode);
    const normalizedCustomerCode = normalizeReportCode(options.customerCode);
    const inactiveMonthsRaw = Number(options.inactiveMonths);
    const inactiveMonths =
      Number.isFinite(inactiveMonthsRaw) && inactiveMonthsRaw > 0
        ? Math.min(24, Math.floor(inactiveMonthsRaw))
        : 4;
    const activeCustomerMonthsRaw = Number(options.activeCustomerMonths);
    const activeCustomerMonths =
      Number.isFinite(activeCustomerMonthsRaw) && activeCustomerMonthsRaw > 0
        ? Math.min(24, Math.floor(activeCustomerMonthsRaw))
        : null;
    const normalizedSectorCode = normalizeReportCode(options.sectorCode);
    const isScopedSalesRep = options.scope?.role === UserRole.SALES_REP;
    const scopedSectorCodes = getSalesRepSectorCodes(options.scope).map(normalizeReportCode);
    const scopedSectorSet = new Set(scopedSectorCodes);
    const minHistoricalDocumentCountRaw = Number(options.minHistoricalDocumentCount);
    const minHistoricalDocumentCount =
      Number.isFinite(minHistoricalDocumentCountRaw) && minHistoricalDocumentCountRaw > 0
        ? Math.floor(minHistoricalDocumentCountRaw)
        : null;
    const minHistoricalAmountRaw = Number(options.minHistoricalAmount);
    const minHistoricalAmount =
      Number.isFinite(minHistoricalAmountRaw) && minHistoricalAmountRaw > 0
        ? minHistoricalAmountRaw
        : null;
    const page = options.page && options.page > 0 ? Math.floor(options.page) : 1;
    const requestedLimit = options.limit && options.limit > 0 ? Math.floor(options.limit) : 50;
    const limit = Math.min(requestedLimit, options.forExport ? 50_000 : 500);
    const allowedSortFields: CategoryChurnSortBy[] = [
      'customerCode',
      'customerName',
      'customerSectorCode',
      'customerLastSaleDate',
      'categoryCode',
      'categoryName',
      'lastPurchaseDate',
      'historicalDocumentCount',
      'historicalQuantity',
      'historicalAmount',
    ];
    const sortBy = allowedSortFields.includes(options.sortBy as CategoryChurnSortBy)
      ? (options.sortBy as CategoryChurnSortBy)
      : 'historicalDocumentCount';
    const sortDirection: CategoryChurnSortDirection = options.sortDirection === 'asc' ? 'asc' : 'desc';

    if (mode === 'category' && !normalizedCategoryCode) {
      throw new AppError('Kategori kodu gerekli.', 400, ErrorCode.BAD_REQUEST);
    }

    if (mode === 'customer' && !normalizedCustomerCode) {
      throw new AppError('Cari kodu gerekli.', 400, ErrorCode.BAD_REQUEST);
    }

    const reportEnd = new Date();
    const inactiveStart = subtractMonthsUtc(reportEnd, inactiveMonths);
    const inactiveStartCompact = formatDateCompact(inactiveStart);
    const endDateCompact = formatDateCompact(reportEnd);
    const activeStartCompact = activeCustomerMonths
      ? formatDateCompact(subtractMonthsUtc(reportEnd, activeCustomerMonths))
      : null;

    const toCompactDate = (value: unknown): string | null => {
      if (!value) return null;
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return formatDateCompact(value);
      }
      const raw = String(value).trim();
      if (!raw) return null;
      const cleaned = raw.replace(/[^0-9]/g, '');
      if (/^\d{8}$/.test(cleaned)) return cleaned;
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) return null;
      return formatDateCompact(parsed);
    };

    const compactToDisplay = (value: string | null): string | null =>
      value && /^\d{8}$/.test(value)
        ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
        : null;

    const baseConditions = [
      'sth_cins = 0',
      'sth_tip = 1',
      'sth_evraktip IN (1, 4)',
      '(sth_iptal = 0 OR sth_iptal IS NULL)',
      'sth.sth_stok_kod IS NOT NULL',
      "LTRIM(RTRIM(sth.sth_stok_kod)) <> ''",
      'sth.sth_cari_kodu IS NOT NULL',
      "LTRIM(RTRIM(sth.sth_cari_kodu)) <> ''",
    ];
    const exclusionConditions = await exclusionService.buildStokHareketleriExclusionConditions();
    const buildWhereClause = (extra: string[]) => [...baseConditions, ...exclusionConditions, ...extra].join(' AND ');
    const attachCustomerMetadata = async (rows: CategoryChurnRow[]) => {
      const customerCodes = Array.from(
        new Set(rows.map((row) => normalizeReportCode(row.customerCode)).filter(Boolean))
      );

      if (customerCodes.length === 0) {
        return;
      }

      const sectorRows = await prisma.user.findMany({
        where: {
          role: 'CUSTOMER',
          parentCustomerId: null,
          mikroCariCode: { in: customerCodes },
        },
        select: {
          mikroCariCode: true,
          sectorCode: true,
        },
      });

      const sectorByCustomerCode = new Map<string, string | null>();
      sectorRows.forEach((row) => {
        const code = normalizeReportCode(row.mikroCariCode);
        if (!code) return;
        sectorByCustomerCode.set(code, row.sectorCode || null);
      });

      const customerInClause = customerCodes.map((code) => `'${escapeSqlLiteral(code)}'`).join(', ');
      const customerLastSaleRows = await mikroService.executeQuery(`
        SELECT
          RTRIM(sth.sth_cari_kodu) as customerCode,
          MAX(sth.sth_tarih) as customerLastSaleDate
        FROM STOK_HAREKETLERI sth
        LEFT JOIN CARI_HESAPLAR c ON sth.sth_cari_kodu = c.cari_kod
        LEFT JOIN STOKLAR st ON sth.sth_stok_kod = st.sto_kod
        WHERE ${buildWhereClause([
          `RTRIM(sth.sth_cari_kodu) IN (${customerInClause})`,
          `sth.sth_tarih <= '${endDateCompact}'`,
          'ISNULL(sth.sth_normal_iade, 0) = 0',
        ])}
        GROUP BY sth.sth_cari_kodu
      `);

      const lastSaleByCustomerCode = new Map<string, string | null>();
      customerLastSaleRows.forEach((row: any) => {
        const code = normalizeReportCode(row.customerCode);
        if (!code) return;
        lastSaleByCustomerCode.set(code, compactToDisplay(toCompactDate(row.customerLastSaleDate)));
      });

      rows.forEach((row) => {
        const customerCode = normalizeReportCode(row.customerCode);
        if (!customerCode) return;
        row.customerSectorCode = sectorByCustomerCode.get(customerCode) || null;
        row.customerLastSaleDate = lastSaleByCustomerCode.get(customerCode) || null;
        row.daysSinceCustomerLastSale = daysSinceUtcCalendarDate(
          reportEnd,
          row.customerLastSaleDate
        );

        const lastCategoryPurchase = row.lastPurchaseDate ? new Date(`${row.lastPurchaseDate}T00:00:00Z`) : null;
        row.daysSinceCategoryPurchase =
          lastCategoryPurchase && !Number.isNaN(lastCategoryPurchase.getTime())
            ? Math.max(0, Math.floor((reportEnd.getTime() - lastCategoryPurchase.getTime()) / 86_400_000))
            : null;

        const customerLastSale = row.customerLastSaleDate
          ? new Date(`${row.customerLastSaleDate}T00:00:00Z`)
          : null;
        row.customerActiveOutsideCategory = Boolean(
          customerLastSale
          && !Number.isNaN(customerLastSale.getTime())
          && customerLastSale >= inactiveStart
        );
      });
    };

    const buildResponse = (
      rows: CategoryChurnRow[],
      metadata: CategoryChurnReportResponse['metadata']
    ): CategoryChurnReportResponse => {
      const normalizeDateForSort = (value: string | null | undefined) => {
        const compact = normalizeReportCode(String(value || '').replace(/-/g, ''));
        return compact || '';
      };
      const compareText = (left: string | null | undefined, right: string | null | undefined) =>
        String(left || '').localeCompare(String(right || ''), 'tr');
      const filteredRows = rows.filter((row) => {
        if (
          isScopedSalesRep
          && (
            scopedSectorSet.size === 0
            || !scopedSectorSet.has(normalizeReportCode(row.customerSectorCode))
          )
        ) {
          return false;
        }
        if (normalizedSectorCode && normalizeReportCode(row.customerSectorCode) !== normalizedSectorCode) {
          return false;
        }
        if (
          minHistoricalDocumentCount !== null
          && row.historicalDocumentCount < minHistoricalDocumentCount
        ) {
          return false;
        }
        if (minHistoricalAmount !== null && row.historicalAmount < minHistoricalAmount) {
          return false;
        }
        return true;
      });
      const sortedRows = [...filteredRows].sort((a, b) => {
        let compare = 0;
        switch (sortBy) {
          case 'customerCode':
            compare = compareText(a.customerCode, b.customerCode);
            break;
          case 'customerName':
            compare = compareText(a.customerName, b.customerName);
            break;
          case 'customerSectorCode':
            compare = compareText(a.customerSectorCode, b.customerSectorCode);
            break;
          case 'customerLastSaleDate':
            compare = normalizeDateForSort(a.customerLastSaleDate).localeCompare(normalizeDateForSort(b.customerLastSaleDate));
            break;
          case 'categoryCode':
            compare = compareText(a.categoryCode, b.categoryCode);
            break;
          case 'categoryName':
            compare = compareText(a.categoryName, b.categoryName);
            break;
          case 'lastPurchaseDate':
            compare = normalizeDateForSort(a.lastPurchaseDate).localeCompare(normalizeDateForSort(b.lastPurchaseDate));
            break;
          case 'historicalQuantity':
            compare = (a.historicalQuantity || 0) - (b.historicalQuantity || 0);
            break;
          case 'historicalAmount':
            compare = (a.historicalAmount || 0) - (b.historicalAmount || 0);
            break;
          case 'historicalDocumentCount':
          default:
            compare = (a.historicalDocumentCount || 0) - (b.historicalDocumentCount || 0);
            break;
        }

        if (compare !== 0) {
          return sortDirection === 'asc' ? compare : -compare;
        }

        if (mode === 'category') {
          const nameCompare = compareText(a.customerName, b.customerName);
          if (nameCompare !== 0) return nameCompare;
          return compareText(a.customerCode, b.customerCode);
        }
        const nameCompare = compareText(a.categoryName, b.categoryName);
        if (nameCompare !== 0) return nameCompare;
        return compareText(a.categoryCode, b.categoryCode);
      });

      const totalRows = sortedRows.length;
      const uniqueCustomers = new Set(sortedRows.map((row) => normalizeReportCode(row.customerCode)).filter(Boolean)).size;
      const uniqueCategories = new Set(sortedRows.map((row) => normalizeReportCode(row.categoryCode)).filter(Boolean)).size;
      const historicalRevenue = sortedRows.reduce((sum, row) => sum + (row.historicalAmount || 0), 0);
      const activeOutsideCategoryCustomers = new Set(
        sortedRows
          .filter((row) => row.customerActiveOutsideCategory)
          .map((row) => normalizeReportCode(row.customerCode))
          .filter(Boolean)
      ).size;
      const inactivityValues = sortedRows
        .map((row) => row.daysSinceCategoryPurchase)
        .filter((value): value is number => Number.isFinite(value));
      const averageInactiveDays = inactivityValues.length > 0
        ? Math.round(inactivityValues.reduce((sum, value) => sum + value, 0) / inactivityValues.length)
        : null;
      const totalPages = totalRows > 0 ? Math.ceil(totalRows / limit) : 0;
      const offset = (page - 1) * limit;
      const paginatedRows = sortedRows.slice(offset, offset + limit);

      return {
        rows: paginatedRows,
        summary: {
          totalRows,
          affectedCustomers: mode === 'category' ? uniqueCustomers : totalRows > 0 ? 1 : 0,
          affectedCategories: uniqueCategories,
          historicalRevenue,
          activeOutsideCategoryCustomers,
          averageInactiveDays,
        },
        pagination: {
          page,
          limit,
          totalPages,
          totalRecords: totalRows,
        },
        metadata,
      };
    };

    await mikroService.connect();
    try {
      if (mode === 'category') {
        const selectedCategory = await prisma.category.findFirst({
          where: { mikroCode: { equals: normalizedCategoryCode, mode: 'insensitive' } },
          select: { mikroCode: true, name: true },
        });

        const categoryProducts = await prisma.product.findMany({
          where: {
            category: {
              mikroCode: {
                equals: selectedCategory?.mikroCode || normalizedCategoryCode,
                mode: 'insensitive',
              },
            },
          },
          select: { mikroCode: true },
        });

        const categoryProductCodes = Array.from(
          new Set(
            categoryProducts
              .map((item) => normalizeReportCode(item.mikroCode))
              .filter(Boolean)
          )
        );

        const metadata: CategoryChurnReportResponse['metadata'] = {
          mode,
          inactiveMonths,
          inactiveStartDate: formatDateKey(inactiveStart),
          endDate: formatDateKey(reportEnd),
          activeCustomerMonths,
          sectorCode: normalizedSectorCode || null,
          minHistoricalDocumentCount,
          minHistoricalAmount,
          category: {
            categoryCode: selectedCategory?.mikroCode || normalizedCategoryCode,
            categoryName: selectedCategory?.name || null,
          },
        };

        if (categoryProductCodes.length === 0) {
          return buildResponse([], metadata);
        }

        const categoryInClause = categoryProductCodes
          .map((code) => `'${escapeSqlLiteral(code)}'`)
          .join(', ');

        const historicalQuery = `
          SELECT
            RTRIM(sth.sth_cari_kodu) as customerCode,
            MAX(c.cari_unvan1) as customerName,
            MAX(CASE WHEN ISNULL(sth.sth_normal_iade, 0) = 0 THEN sth.sth_tarih END) as lastPurchaseDate,
            COUNT(DISTINCT CASE
              WHEN ISNULL(sth.sth_normal_iade, 0) = 0
                THEN CAST(sth.sth_evraktip AS VARCHAR(10)) + '|' + ISNULL(RTRIM(sth.sth_evrakno_seri), '') + '|' + CAST(sth.sth_evrakno_sira AS VARCHAR(30))
              ELSE NULL
            END) as documentCount,
            SUM(CASE WHEN ISNULL(sth.sth_normal_iade, 0) = 1 THEN -ABS(ISNULL(sth.sth_miktar, 0)) ELSE ISNULL(sth.sth_miktar, 0) END) as totalQuantity,
            SUM(CASE WHEN ISNULL(sth.sth_normal_iade, 0) = 1 THEN -ABS(ISNULL(sth.sth_tutar, 0)) ELSE ISNULL(sth.sth_tutar, 0) END) as totalAmount
          FROM STOK_HAREKETLERI sth
          LEFT JOIN CARI_HESAPLAR c ON sth.sth_cari_kodu = c.cari_kod
          LEFT JOIN STOKLAR st ON sth.sth_stok_kod = st.sto_kod
          WHERE ${buildWhereClause([
            `RTRIM(sth.sth_stok_kod) IN (${categoryInClause})`,
            `sth.sth_tarih < '${inactiveStartCompact}'`,
          ])}
          GROUP BY sth.sth_cari_kodu
        `;

        const recentQuery = `
          SELECT RTRIM(sth.sth_cari_kodu) as customerCode
          FROM STOK_HAREKETLERI sth
          LEFT JOIN CARI_HESAPLAR c ON sth.sth_cari_kodu = c.cari_kod
          LEFT JOIN STOKLAR st ON sth.sth_stok_kod = st.sto_kod
          WHERE ${buildWhereClause([
            `RTRIM(sth.sth_stok_kod) IN (${categoryInClause})`,
            `sth.sth_tarih >= '${inactiveStartCompact}'`,
            `sth.sth_tarih <= '${endDateCompact}'`,
            'ISNULL(sth.sth_normal_iade, 0) = 0',
          ])}
          GROUP BY sth.sth_cari_kodu
        `;

        const [historicalRows, recentRows] = await Promise.all([
          mikroService.executeQuery(historicalQuery),
          mikroService.executeQuery(recentQuery),
        ]);

        const recentCustomerSet = new Set<string>();
        recentRows.forEach((row: any) => {
          const code = normalizeReportCode(row.customerCode);
          if (code) recentCustomerSet.add(code);
        });

        let activeCustomerSet: Set<string> | null = null;
        if (activeStartCompact) {
          const activeQuery = `
            SELECT RTRIM(sth.sth_cari_kodu) as customerCode
            FROM STOK_HAREKETLERI sth
            LEFT JOIN CARI_HESAPLAR c ON sth.sth_cari_kodu = c.cari_kod
            LEFT JOIN STOKLAR st ON sth.sth_stok_kod = st.sto_kod
            WHERE ${buildWhereClause([
              `sth.sth_tarih >= '${activeStartCompact}'`,
              `sth.sth_tarih <= '${endDateCompact}'`,
              `RTRIM(sth.sth_stok_kod) NOT IN (${categoryInClause})`,
              'ISNULL(sth.sth_normal_iade, 0) = 0',
            ])}
            GROUP BY sth.sth_cari_kodu
          `;
          const activeRows = await mikroService.executeQuery(activeQuery);
          activeCustomerSet = new Set<string>();
          activeRows.forEach((row: any) => {
            const code = normalizeReportCode(row.customerCode);
            if (code) activeCustomerSet?.add(code);
          });
        }

        const rows: CategoryChurnRow[] = [];
        historicalRows.forEach((row: any) => {
          const customerCode = normalizeReportCode(row.customerCode);
          if (!customerCode) return;
          if ((Number(row.documentCount) || 0) <= 0) return;
          if (recentCustomerSet.has(customerCode)) return;
          if (activeCustomerSet && !activeCustomerSet.has(customerCode)) return;

          rows.push({
            customerCode: String(row.customerCode || customerCode).trim(),
            customerName: row.customerName || '-',
            categoryCode: metadata.category?.categoryCode || normalizedCategoryCode,
            categoryName: metadata.category?.categoryName || null,
            lastPurchaseDate: compactToDisplay(toCompactDate(row.lastPurchaseDate)),
            daysSinceCategoryPurchase: null,
            daysSinceCustomerLastSale: null,
            customerActiveOutsideCategory: false,
            historicalDocumentCount: Number(row.documentCount) || 0,
            historicalQuantity: toNumber(row.totalQuantity),
            historicalAmount: toNumber(row.totalAmount),
          });
        });

        await attachCustomerMetadata(rows);
        return buildResponse(rows, metadata);
      }

      const metadata: CategoryChurnReportResponse['metadata'] = {
        mode,
        inactiveMonths,
        inactiveStartDate: formatDateKey(inactiveStart),
        endDate: formatDateKey(reportEnd),
        activeCustomerMonths,
        sectorCode: normalizedSectorCode || null,
        minHistoricalDocumentCount,
        minHistoricalAmount,
        customer: {
          customerCode: normalizedCustomerCode,
          customerName: null,
        },
      };

      if (isScopedSalesRep || normalizedSectorCode) {
        const customerScope = await prisma.user.findFirst({
          where: {
            role: UserRole.CUSTOMER,
            parentCustomerId: null,
            mikroCariCode: {
              equals: normalizedCustomerCode,
              mode: 'insensitive',
            },
          },
          select: { sectorCode: true },
        });
        const customerSectorCode = normalizeReportCode(customerScope?.sectorCode);
        const outsideSalesRepScope =
          isScopedSalesRep
          && (
            scopedSectorSet.size === 0
            || !customerSectorCode
            || !scopedSectorSet.has(customerSectorCode)
          );
        const outsideRequestedSector =
          Boolean(normalizedSectorCode)
          && customerSectorCode !== normalizedSectorCode;

        if (outsideSalesRepScope || outsideRequestedSector) {
          return buildResponse([], metadata);
        }
      }

      if (activeStartCompact) {
        const activeCustomerQuery = `
          SELECT TOP 1 1 as hasAny
          FROM STOK_HAREKETLERI sth
          LEFT JOIN CARI_HESAPLAR c ON sth.sth_cari_kodu = c.cari_kod
          LEFT JOIN STOKLAR st ON sth.sth_stok_kod = st.sto_kod
          WHERE ${buildWhereClause([
            `RTRIM(sth.sth_cari_kodu) = '${escapeSqlLiteral(normalizedCustomerCode)}'`,
            `sth.sth_tarih >= '${activeStartCompact}'`,
            `sth.sth_tarih <= '${endDateCompact}'`,
            'ISNULL(sth.sth_normal_iade, 0) = 0',
          ])}
        `;
        const activeRows = await mikroService.executeQuery(activeCustomerQuery);
        if (!activeRows || activeRows.length === 0) {
          return buildResponse([], metadata);
        }
      }

      const historicalByProductQuery = `
        SELECT
          RTRIM(sth.sth_stok_kod) as productCode,
          sth.sth_evraktip as documentType,
          ISNULL(RTRIM(sth.sth_evrakno_seri), '') as documentSeries,
          sth.sth_evrakno_sira as documentSequence,
          MAX(CASE WHEN ISNULL(sth.sth_normal_iade, 0) = 0 THEN sth.sth_tarih END) as lastPurchaseDate,
          SUM(CASE WHEN ISNULL(sth.sth_normal_iade, 0) = 1 THEN -ABS(ISNULL(sth.sth_miktar, 0)) ELSE ISNULL(sth.sth_miktar, 0) END) as totalQuantity,
          SUM(CASE WHEN ISNULL(sth.sth_normal_iade, 0) = 1 THEN -ABS(ISNULL(sth.sth_tutar, 0)) ELSE ISNULL(sth.sth_tutar, 0) END) as totalAmount,
          MIN(ISNULL(sth.sth_normal_iade, 0)) as isReturnOnly,
          MAX(c.cari_unvan1) as customerName
        FROM STOK_HAREKETLERI sth
        LEFT JOIN CARI_HESAPLAR c ON sth.sth_cari_kodu = c.cari_kod
        LEFT JOIN STOKLAR st ON sth.sth_stok_kod = st.sto_kod
        WHERE ${buildWhereClause([
          `RTRIM(sth.sth_cari_kodu) = '${escapeSqlLiteral(normalizedCustomerCode)}'`,
          `sth.sth_tarih < '${inactiveStartCompact}'`,
        ])}
        GROUP BY
          sth.sth_stok_kod,
          sth.sth_evraktip,
          sth.sth_evrakno_seri,
          sth.sth_evrakno_sira
      `;

      const recentByProductQuery = `
        SELECT RTRIM(sth.sth_stok_kod) as productCode
        FROM STOK_HAREKETLERI sth
        LEFT JOIN CARI_HESAPLAR c ON sth.sth_cari_kodu = c.cari_kod
        LEFT JOIN STOKLAR st ON sth.sth_stok_kod = st.sto_kod
        WHERE ${buildWhereClause([
            `RTRIM(sth.sth_cari_kodu) = '${escapeSqlLiteral(normalizedCustomerCode)}'`,
            `sth.sth_tarih >= '${inactiveStartCompact}'`,
            `sth.sth_tarih <= '${endDateCompact}'`,
            'ISNULL(sth.sth_normal_iade, 0) = 0',
        ])}
        GROUP BY sth.sth_stok_kod
      `;

      const [historicalRows, recentRows] = await Promise.all([
        mikroService.executeQuery(historicalByProductQuery),
        mikroService.executeQuery(recentByProductQuery),
      ]);

      if (!historicalRows || historicalRows.length === 0) {
        return buildResponse([], metadata);
      }

      metadata.customer = {
        customerCode: normalizedCustomerCode,
        customerName: historicalRows[0]?.customerName || null,
      };

      const historicalProducts = historicalRows
        .map((row: any) => normalizeReportCode(row.productCode))
        .filter(Boolean);
      const recentProducts = recentRows
        .map((row: any) => normalizeReportCode(row.productCode))
        .filter(Boolean);
      const allProducts = Array.from(new Set([...historicalProducts, ...recentProducts]));

      if (allProducts.length === 0) {
        return buildResponse([], metadata);
      }

      const productCategoryRows = await prisma.product.findMany({
        where: { mikroCode: { in: allProducts } },
        select: {
          mikroCode: true,
          category: {
            select: {
              mikroCode: true,
              name: true,
            },
          },
        },
      });

      const productToCategory = new Map<string, { code: string; name: string | null }>();
      productCategoryRows.forEach((row) => {
        const productCode = normalizeReportCode(row.mikroCode);
        const categoryCode = normalizeReportCode(row.category?.mikroCode);
        if (!productCode || !categoryCode) return;
        productToCategory.set(productCode, {
          code: categoryCode,
          name: row.category?.name || null,
        });
      });

      const recentCategorySet = new Set<string>();
      recentProducts.forEach((productCode) => {
        const category = productToCategory.get(productCode);
        if (category?.code) recentCategorySet.add(category.code);
      });

      const historicalCategoryMap = new Map<
        string,
        {
          categoryCode: string;
          categoryName: string | null;
          lastPurchaseCompact: string | null;
          documentKeys: Set<string>;
          historicalDocumentCount: number;
          historicalQuantity: number;
          historicalAmount: number;
        }
      >();

      historicalRows.forEach((row: any) => {
        const productCode = normalizeReportCode(row.productCode);
        const category = productToCategory.get(productCode);
        if (!productCode || !category?.code) return;

        const current = historicalCategoryMap.get(category.code) || {
          categoryCode: category.code,
          categoryName: category.name || null,
          lastPurchaseCompact: null as string | null,
          documentKeys: new Set<string>(),
          historicalDocumentCount: 0,
          historicalQuantity: 0,
          historicalAmount: 0,
        };

        const rowDate = toCompactDate(row.lastPurchaseDate);
        if (rowDate && (!current.lastPurchaseCompact || rowDate > current.lastPurchaseCompact)) {
          current.lastPurchaseCompact = rowDate;
        }
        if (Number(row.isReturnOnly) === 0) {
          current.documentKeys.add(
            `${String(row.documentType ?? '')}|${String(row.documentSeries ?? '')}|${String(row.documentSequence ?? '')}`
          );
        }
        current.historicalDocumentCount = current.documentKeys.size;
        current.historicalQuantity += toNumber(row.totalQuantity);
        current.historicalAmount += toNumber(row.totalAmount);
        historicalCategoryMap.set(category.code, current);
      });

      const rows: CategoryChurnRow[] = Array.from(historicalCategoryMap.values())
        .filter(
          (item) =>
            item.historicalDocumentCount > 0
            && !recentCategorySet.has(item.categoryCode)
        )
        .map((item) => ({
          customerCode: normalizedCustomerCode,
          customerName: metadata.customer?.customerName || '-',
          categoryCode: item.categoryCode,
          categoryName: item.categoryName,
          lastPurchaseDate: compactToDisplay(item.lastPurchaseCompact),
          daysSinceCategoryPurchase: null,
          daysSinceCustomerLastSale: null,
          customerActiveOutsideCategory: false,
          historicalDocumentCount: item.historicalDocumentCount,
          historicalQuantity: item.historicalQuantity,
          historicalAmount: item.historicalAmount,
        }));

      await attachCustomerMetadata(rows);
      return buildResponse(rows, metadata);
    } finally {
      await mikroService.disconnect();
    }
  }

  async exportCategoryChurnReport(options: {
    mode: CategoryChurnMode;
    categoryCode?: string;
    customerCode?: string;
    inactiveMonths?: number;
    activeCustomerMonths?: number;
    sectorCode?: string;
    minHistoricalDocumentCount?: number;
    minHistoricalAmount?: number;
    scope?: ReportRequestScope;
    sortBy?: CategoryChurnSortBy;
    sortDirection?: CategoryChurnSortDirection;
  }): Promise<{ buffer: Buffer; fileName: string }> {
    const data = await this.getCategoryChurnReport({
      ...options,
      page: 1,
      limit: 100000,
      forExport: true,
    });

    const header = data.metadata.mode === 'category'
      ? [
          'Cari Kodu',
          'Cari Adi',
          'Cari Sektor Kodu',
          'Kategori Kodu',
          'Kategori Adi',
          'Son Alim Tarihi',
          'Alim Yapilmayan Gun',
          'Baska Kategorilerde Aktif',
          'Cari Son Satis Tarihi',
          'Gecmis Evrak',
          'Gecmis Miktar',
          'Gecmis Tutar',
          'Cari Son Satistan Beri Gun',
        ]
      : [
          'Kategori Kodu',
          'Kategori Adi',
          'Cari Sektor Kodu',
          'Son Alim Tarihi',
          'Alim Yapilmayan Gun',
          'Baska Kategorilerde Aktif',
          'Cari Son Satis Tarihi',
          'Gecmis Evrak',
          'Gecmis Miktar',
          'Gecmis Tutar',
          'Cari Son Satistan Beri Gun',
        ];

    const rows = data.rows.map((row) => (
      data.metadata.mode === 'category'
        ? [
            row.customerCode || '',
            row.customerName || '',
            row.customerSectorCode || '',
            row.categoryCode || '',
            row.categoryName || '',
            row.lastPurchaseDate || '',
            row.daysSinceCategoryPurchase ?? '',
            row.customerActiveOutsideCategory ? 'Evet' : 'Hayir',
            row.customerLastSaleDate || '',
            row.historicalDocumentCount || 0,
            Number(row.historicalQuantity || 0),
            Number(row.historicalAmount || 0),
            row.daysSinceCustomerLastSale ?? '',
          ]
        : [
            row.categoryCode || '',
            row.categoryName || '',
            row.customerSectorCode || '',
            row.lastPurchaseDate || '',
            row.daysSinceCategoryPurchase ?? '',
            row.customerActiveOutsideCategory ? 'Evet' : 'Hayir',
            row.customerLastSaleDate || '',
            row.historicalDocumentCount || 0,
            Number(row.historicalQuantity || 0),
            Number(row.historicalAmount || 0),
            row.daysSinceCustomerLastSale ?? '',
          ]
    ));

    const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Kategori-Cari Kesintileri');

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
    const fileName = `kategori-cari-alim-kesintileri-${data.metadata.mode}-${data.metadata.inactiveStartDate}-${data.metadata.endDate}.xlsx`;

    return { buffer, fileName };
  }

  async getCategoryOpportunityReport(options: {
    categoryCode?: string;
    customerCode?: string;
    sectorCode?: string;
    lookbackMonths?: number;
    minPairCount?: number;
    minOpportunityScore?: number;
    minRecommendationCount?: number;
    limit?: number;
    scope?: ReportRequestScope;
  }): Promise<CategoryOpportunityReportResponse> {
    const normalizedCategoryCode = normalizeReportCode(options.categoryCode);
    const normalizedCustomerCode = normalizeReportCode(options.customerCode);
    const normalizedSectorCode = normalizeReportCode(options.sectorCode);
    const isScopedSalesRep = options.scope?.role === UserRole.SALES_REP;
    const scopedSectorSet = new Set(
      getSalesRepSectorCodes(options.scope).map(normalizeReportCode)
    );
    const lookbackMonthsRaw = Number(options.lookbackMonths);
    const minPairCountRaw = Number(options.minPairCount);
    const minOpportunityScoreRaw = Number(options.minOpportunityScore);
    const minRecommendationCountRaw = Number(options.minRecommendationCount);
    const limitRaw = Number(options.limit);

    const lookbackMonths =
      Number.isFinite(lookbackMonthsRaw) && lookbackMonthsRaw > 0
        ? Math.min(24, Math.floor(lookbackMonthsRaw))
        : 6;
    const minPairCount =
      Number.isFinite(minPairCountRaw) && minPairCountRaw > 0
        ? Math.min(1000, Math.floor(minPairCountRaw))
        : 2;
    const minOpportunityScore =
      Number.isFinite(minOpportunityScoreRaw) && minOpportunityScoreRaw > 0
        ? minOpportunityScoreRaw
        : null;
    const minRecommendationCount =
      Number.isFinite(minRecommendationCountRaw) && minRecommendationCountRaw > 0
        ? Math.floor(minRecommendationCountRaw)
        : null;
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(200, Math.floor(limitRaw))
        : 50;

    if (!normalizedCategoryCode) {
      throw new AppError('Kategori kodu gerekli.', 400, ErrorCode.BAD_REQUEST);
    }

    const selectedCategory = await prisma.category.findFirst({
      where: { mikroCode: { equals: normalizedCategoryCode, mode: 'insensitive' } },
      select: { id: true, mikroCode: true, name: true },
    });

    const categoryProducts = await prisma.product.findMany({
      where: {
        category: {
          mikroCode: {
            equals: selectedCategory?.mikroCode || normalizedCategoryCode,
            mode: 'insensitive',
          },
        },
      },
      select: {
        id: true,
        mikroCode: true,
        name: true,
      },
    });

    const reportEnd = new Date();
    const lookbackStart = subtractMonthsUtc(reportEnd, lookbackMonths);
    const startDateCompact = formatDateCompact(lookbackStart);
    const endDateCompact = formatDateCompact(reportEnd);

    const metadataBase: CategoryOpportunityReportResponse['metadata'] = {
      category: {
        categoryCode: selectedCategory?.mikroCode || normalizedCategoryCode,
        categoryName: selectedCategory?.name || null,
        productCount: categoryProducts.length,
      },
      customerFilterCode: normalizedCustomerCode || null,
      lookbackMonths,
      minPairCount,
      startDate: formatDateKey(lookbackStart),
      endDate: formatDateKey(reportEnd),
      sectorCode: normalizedSectorCode || null,
      minOpportunityScore,
      minRecommendationCount,
      candidateSourceProductCount: 0,
      associationWindowStart: null,
      associationWindowEnd: null,
      associationUpdatedAt: null,
    };

    const emptyResponse = (summaryOverrides?: Partial<CategoryOpportunityReportResponse['summary']>) => ({
      rows: [],
      summary: {
        totalCustomers: 0,
        totalRecommendations: 0,
        scannedCustomers: 0,
        excludedBecauseAlreadyBoughtCategory: 0,
        eligibleCustomers: 0,
        coverageRate: 0,
        averageOpportunityScore: 0,
        ...(summaryOverrides || {}),
      },
      metadata: metadataBase,
    });

    if (categoryProducts.length === 0) {
      return emptyResponse();
    }

    const categoryProductIds = categoryProducts.map((row) => row.id);
    const categoryProductCodes = Array.from(
      new Set(categoryProducts.map((row) => normalizeReportCode(row.mikroCode)).filter(Boolean))
    );

    if (categoryProductCodes.length === 0) {
      return emptyResponse();
    }

    const categoryInClause = categoryProductCodes
      .map((code) => `'${escapeSqlLiteral(code)}'`)
      .join(', ');

    // Start from products that can actually produce evidence for the selected
    // category. This avoids grouping every non-category movement in Mikro.
    const pairRows = await prisma.productComplementAuto.findMany({
      where: {
        relatedProductId: { in: categoryProductIds },
        pairCount: { gte: minPairCount },
      },
      select: {
        productId: true,
        relatedProductId: true,
        pairCount: true,
        windowStart: true,
        windowEnd: true,
        updatedAt: true,
        product: {
          select: {
            mikroCode: true,
            name: true,
          },
        },
        relatedProduct: {
          select: {
            mikroCode: true,
            name: true,
          },
        },
      },
    });

    const candidateSourceProductCodes = Array.from(
      new Set(
        pairRows
          .map((row) => normalizeReportCode(row.product?.mikroCode))
          .filter(Boolean)
      )
    );
    metadataBase.candidateSourceProductCount = candidateSourceProductCodes.length;
    if (pairRows.length > 0) {
      const associationWindowStarts = pairRows.map((row) => row.windowStart.getTime());
      const associationWindowEnds = pairRows.map((row) => row.windowEnd.getTime());
      const associationUpdates = pairRows.map((row) => row.updatedAt.getTime());
      metadataBase.associationWindowStart = formatDateKey(new Date(Math.min(...associationWindowStarts)));
      metadataBase.associationWindowEnd = formatDateKey(new Date(Math.max(...associationWindowEnds)));
      metadataBase.associationUpdatedAt = new Date(Math.max(...associationUpdates)).toISOString();
    }

    if (candidateSourceProductCodes.length === 0) {
      return emptyResponse();
    }
    const candidateSourceInClause = candidateSourceProductCodes
      .map((code) => `'${escapeSqlLiteral(code)}'`)
      .join(', ');

    const baseConditions = [
      'sth_cins = 0',
      'sth_tip = 1',
      'sth_evraktip IN (1, 4)',
      '(sth_iptal = 0 OR sth_iptal IS NULL)',
      'sth.sth_stok_kod IS NOT NULL',
      "LTRIM(RTRIM(sth.sth_stok_kod)) <> ''",
      'sth.sth_cari_kodu IS NOT NULL',
      "LTRIM(RTRIM(sth.sth_cari_kodu)) <> ''",
    ];
    const exclusionConditions = await exclusionService.buildStokHareketleriExclusionConditions();
    const buildWhereClause = (extra: string[]) => [...baseConditions, ...exclusionConditions, ...extra].join(' AND ');
    if (
      isScopedSalesRep
      && (
        scopedSectorSet.size === 0
        || (normalizedSectorCode && !scopedSectorSet.has(normalizedSectorCode))
      )
    ) {
      return emptyResponse();
    }
    const effectiveSectorCodes = normalizedSectorCode
      ? [normalizedSectorCode]
      : isScopedSalesRep
        ? Array.from(scopedSectorSet)
        : [];

    await mikroService.connect();
    try {
      const sourceConditions = [
        `sth.sth_tarih >= '${startDateCompact}'`,
        `sth.sth_tarih <= '${endDateCompact}'`,
        `RTRIM(sth.sth_stok_kod) IN (${candidateSourceInClause})`,
      ];
      if (normalizedCustomerCode) {
        sourceConditions.push(`RTRIM(sth.sth_cari_kodu) = '${escapeSqlLiteral(normalizedCustomerCode)}'`);
      }
      if (effectiveSectorCodes.length > 0) {
        const sectorInClause = effectiveSectorCodes
          .map((code) => `'${escapeSqlLiteral(code)}'`)
          .join(', ');
        sourceConditions.push(`UPPER(LTRIM(RTRIM(c.cari_sektor_kodu))) IN (${sectorInClause})`);
      }

      const sourceRows = await mikroService.executeQuery(`
        SELECT
          RTRIM(sth.sth_cari_kodu) as customerCode,
          MAX(c.cari_unvan1) as customerName,
          MAX(c.cari_sektor_kodu) as sectorCode,
          CASE
            WHEN GROUPING(sth.sth_stok_kod) = 1 THEN NULL
            ELSE RTRIM(sth.sth_stok_kod)
          END as productCode,
          MAX(st.sto_isim) as productName,
          MAX(CASE WHEN ISNULL(sth.sth_normal_iade, 0) = 0 THEN sth.sth_tarih END) as lastPurchaseDate,
          COUNT(DISTINCT CASE
            WHEN ISNULL(sth.sth_normal_iade, 0) = 0
              THEN CAST(sth.sth_evraktip AS VARCHAR(10)) + '|' + ISNULL(RTRIM(sth.sth_evrakno_seri), '') + '|' + CAST(sth.sth_evrakno_sira AS VARCHAR(30))
            ELSE NULL
          END) as documentCount,
          SUM(CASE WHEN ISNULL(sth.sth_normal_iade, 0) = 1 THEN -ABS(ISNULL(sth.sth_tutar, 0)) ELSE ISNULL(sth.sth_tutar, 0) END) as totalAmount,
          GROUPING(sth.sth_stok_kod) as isCustomerTotal
        FROM STOK_HAREKETLERI sth
        LEFT JOIN STOKLAR st ON sth.sth_stok_kod = st.sto_kod
        LEFT JOIN CARI_HESAPLAR c ON sth.sth_cari_kodu = c.cari_kod
        WHERE ${buildWhereClause(sourceConditions)}
        GROUP BY GROUPING SETS (
          (sth.sth_cari_kodu, sth.sth_stok_kod),
          (sth.sth_cari_kodu)
        )
      `);

      const sourceMetricsByCustomerCode = new Map<
        string,
        Map<
          string,
          {
            productCode: string;
            productName: string;
            customerDocumentCount: number;
            customerAmount: number;
            lastPurchaseDate: string | null;
          }
        >
      >();
      const sourceDocumentCountByCustomerCode = new Map<string, number>();
      const sourceCodesSet = new Set<string>();
      const mikroCustomerInfoByCode = new Map<
        string,
        { customerName: string | null; customerSectorCode: string | null }
      >();
      sourceRows.forEach((row: any) => {
        const customerCode = normalizeReportCode(row.customerCode);
        const productCode = normalizeReportCode(row.productCode);
        const customerDocumentCount = Number(row.documentCount) || 0;
        if (!customerCode) return;
        if (!mikroCustomerInfoByCode.has(customerCode)) {
          mikroCustomerInfoByCode.set(customerCode, {
            customerName: row.customerName || null,
            customerSectorCode: normalizeReportCode(row.sectorCode) || null,
          });
        }
        if (Number(row.isCustomerTotal) === 1) {
          sourceDocumentCountByCustomerCode.set(customerCode, customerDocumentCount);
          return;
        }
        if (!productCode || customerDocumentCount <= 0) return;
        const customerMap = sourceMetricsByCustomerCode.get(customerCode) || new Map();
        customerMap.set(productCode, {
          productCode,
          productName: String(row.productName || productCode),
          customerDocumentCount,
          customerAmount: toNumber(row.totalAmount),
          lastPurchaseDate: normalizeReportDateKey(row.lastPurchaseDate),
        });
        sourceMetricsByCustomerCode.set(customerCode, customerMap);
        sourceCodesSet.add(productCode);
      });

      const scannedCustomerCodes = Array.from(sourceMetricsByCustomerCode.keys());
      if (scannedCustomerCodes.length === 0) {
        return emptyResponse();
      }

      const sourceCodes = Array.from(sourceCodesSet);
      if (sourceCodes.length === 0) {
        return emptyResponse({
          scannedCustomers: scannedCustomerCodes.length,
        });
      }

      const sourceProducts = await prisma.product.findMany({
        where: { mikroCode: { in: sourceCodes } },
        select: {
          id: true,
          mikroCode: true,
          name: true,
        },
      });

      const productIdByCode = new Map<string, { id: string; name: string | null }>();
      sourceProducts.forEach((row) => {
        const code = normalizeReportCode(row.mikroCode);
        if (!code) return;
        productIdByCode.set(code, { id: row.id, name: row.name || null });
      });

      const sourceByCustomerAndProductId = new Map<
        string,
        Map<
          string,
          {
            productCode: string;
            productName: string;
            customerDocumentCount: number;
            customerAmount: number;
            lastPurchaseDate: string | null;
          }
        >
      >();
      sourceMetricsByCustomerCode.forEach((productsMap, customerCode) => {
        const productIdMap = new Map<
          string,
          {
            productCode: string;
            productName: string;
            customerDocumentCount: number;
            customerAmount: number;
            lastPurchaseDate: string | null;
          }
        >();
        productsMap.forEach((source, productCode) => {
          const resolved = productIdByCode.get(productCode);
          if (!resolved) return;
          productIdMap.set(resolved.id, {
            productCode: source.productCode,
            productName: resolved.name || source.productName,
            customerDocumentCount: source.customerDocumentCount,
            customerAmount: source.customerAmount,
            lastPurchaseDate: source.lastPurchaseDate,
          });
        });
        if (productIdMap.size > 0) {
          sourceByCustomerAndProductId.set(customerCode, productIdMap);
        }
      });

      const candidateCustomerCodes = Array.from(sourceByCustomerAndProductId.keys());
      if (candidateCustomerCodes.length === 0) {
        return emptyResponse({
          scannedCustomers: scannedCustomerCodes.length,
        });
      }

      const customersWithCategoryPurchase = new Set<string>();
      const customerChunks = chunkArray(candidateCustomerCodes, REPORT_CUSTOMER_BATCH_SIZE);
      for (const customerChunk of customerChunks) {
        if (customerChunk.length === 0) continue;
        const customerInClause = customerChunk
          .map((code) => `'${escapeSqlLiteral(code)}'`)
          .join(', ');

        const purchasedRows = await mikroService.executeQuery(`
          SELECT DISTINCT RTRIM(sth.sth_cari_kodu) as customerCode
          FROM STOK_HAREKETLERI sth
          LEFT JOIN CARI_HESAPLAR c ON sth.sth_cari_kodu = c.cari_kod
          LEFT JOIN STOKLAR st ON sth.sth_stok_kod = st.sto_kod
          WHERE ${buildWhereClause([
            `RTRIM(sth.sth_cari_kodu) IN (${customerInClause})`,
            `RTRIM(sth.sth_stok_kod) IN (${categoryInClause})`,
          ])}
        `);

        purchasedRows.forEach((row: any) => {
          const code = normalizeReportCode(row.customerCode);
          if (!code) return;
          customersWithCategoryPurchase.add(code);
        });
      }

      const eligibleCustomerCodes = candidateCustomerCodes.filter(
        (customerCode) => !customersWithCategoryPurchase.has(customerCode)
      );
      if (eligibleCustomerCodes.length === 0) {
        return emptyResponse({
          scannedCustomers: scannedCustomerCodes.length,
          excludedBecauseAlreadyBoughtCategory: customersWithCategoryPurchase.size,
        });
      }

      const customerUsers = await prisma.user.findMany({
        where: {
          role: 'CUSTOMER',
          parentCustomerId: null,
          mikroCariCode: { in: eligibleCustomerCodes },
        },
        select: {
          mikroCariCode: true,
          displayName: true,
          name: true,
          sectorCode: true,
        },
      });
      const customerInfoByCode = new Map<
        string,
        {
          customerName: string | null;
          customerSectorCode: string | null;
        }
      >(mikroCustomerInfoByCode);
      customerUsers.forEach((row) => {
        const code = normalizeReportCode(row.mikroCariCode);
        if (!code) return;
        customerInfoByCode.set(code, {
          customerName: row.displayName || row.name || null,
          customerSectorCode: row.sectorCode || null,
        });
      });

      const scopedEligibleCustomerCodes = eligibleCustomerCodes.filter((customerCode) => {
        const customerSectorCode = normalizeReportCode(
          customerInfoByCode.get(customerCode)?.customerSectorCode
        );
        if (
          isScopedSalesRep
          && (scopedSectorSet.size === 0 || !scopedSectorSet.has(customerSectorCode))
        ) {
          return false;
        }
        return !normalizedSectorCode || customerSectorCode === normalizedSectorCode;
      });

      const pairRowsBySourceProductId = new Map<typeof pairRows[number]['productId'], typeof pairRows>();
      pairRows.forEach((row) => {
        const existing = pairRowsBySourceProductId.get(row.productId) || [];
        existing.push(row);
        pairRowsBySourceProductId.set(row.productId, existing);
      });

      const customerRows: CategoryOpportunityRow[] = [];
      let totalRecommendations = 0;

      scopedEligibleCustomerCodes.forEach((customerCode) => {
        const sourceMap = sourceByCustomerAndProductId.get(customerCode);
        if (!sourceMap || sourceMap.size === 0) return;

        const recommendationMap = new Map<
          string,
          {
            recommendedProductCode: string;
            recommendedProductName: string;
            weightedScore: number;
            associationDocumentCount: number;
            sourceProductsMap: Map<string, CategoryOpportunitySourceProduct>;
          }
        >();

        sourceMap.forEach((source, sourceProductId) => {
          const sourcePairs = pairRowsBySourceProductId.get(sourceProductId) || [];
          sourcePairs.forEach((pair) => {
            const pairCount = Number(pair.pairCount) || 0;
            if (pairCount <= 0) return;
            const recommendedProductCode = normalizeReportCode(pair.relatedProduct?.mikroCode);
            if (!recommendedProductCode) return;

            const current = recommendationMap.get(pair.relatedProductId) || {
              recommendedProductCode,
              recommendedProductName: pair.relatedProduct?.name || recommendedProductCode,
              weightedScore: 0,
              associationDocumentCount: 0,
              sourceProductsMap: new Map<string, CategoryOpportunitySourceProduct>(),
            };

            current.associationDocumentCount += pairCount;
            current.weightedScore += pairCount * source.customerDocumentCount;

            const sourceCurrent = current.sourceProductsMap.get(source.productCode) || {
              productCode: source.productCode,
              productName: source.productName,
              pairCount: 0,
              customerDocumentCount: source.customerDocumentCount,
            };
            sourceCurrent.pairCount += pairCount;
            sourceCurrent.customerDocumentCount = source.customerDocumentCount;
            current.sourceProductsMap.set(source.productCode, sourceCurrent);
            recommendationMap.set(pair.relatedProductId, current);
          });
        });

        const recommendations: CategoryOpportunityRecommendation[] = Array.from(recommendationMap.values())
          .map((recommendation) => {
            const sourceProducts = Array.from(recommendation.sourceProductsMap.values()).sort((a, b) => {
              if (b.pairCount !== a.pairCount) return b.pairCount - a.pairCount;
              return a.productCode.localeCompare(b.productCode, 'tr');
            });
            return {
              recommendedProductCode: recommendation.recommendedProductCode,
              recommendedProductName: recommendation.recommendedProductName,
              weightedScore: recommendation.weightedScore,
              associationDocumentCount: recommendation.associationDocumentCount,
              sourceProductCount: sourceProducts.length,
              sourceProducts: sourceProducts.slice(0, 8),
            };
          })
          .sort((a, b) => {
            if (b.weightedScore !== a.weightedScore) return b.weightedScore - a.weightedScore;
            if (b.associationDocumentCount !== a.associationDocumentCount) {
              return b.associationDocumentCount - a.associationDocumentCount;
            }
            return a.recommendedProductCode.localeCompare(b.recommendedProductCode, 'tr');
          });

        if (recommendations.length === 0) return;

        const customerInfo = customerInfoByCode.get(customerCode);
        const totalOpportunityScore = recommendations.reduce((sum, item) => sum + item.weightedScore, 0);
        if (minOpportunityScore !== null && totalOpportunityScore < minOpportunityScore) return;
        if (
          minRecommendationCount !== null
          && recommendations.length < minRecommendationCount
        ) {
          return;
        }
        const sourceValues = Array.from(sourceMap.values());
        const sourceDocumentCount = sourceDocumentCountByCustomerCode.get(customerCode)
          || sourceValues.reduce((sum, source) => sum + source.customerDocumentCount, 0);
        const sourceRevenue = sourceValues.reduce(
          (sum, source) => sum + source.customerAmount,
          0
        );
        const lastSourcePurchaseDate = sourceValues
          .map((source) => source.lastPurchaseDate)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) || null;

        customerRows.push({
          customerCode,
          customerName: customerInfo?.customerName || null,
          customerSectorCode: customerInfo?.customerSectorCode || null,
          totalOpportunityScore,
          recommendationCount: recommendations.length,
          sourceDocumentCount,
          sourceRevenue,
          lastSourcePurchaseDate,
          daysSinceLastSourcePurchase: daysSinceUtcCalendarDate(
            reportEnd,
            lastSourcePurchaseDate
          ),
          recommendations,
        });
        totalRecommendations += recommendations.length;
      });

      const sortedRows = customerRows.sort((a, b) => {
        if (b.totalOpportunityScore !== a.totalOpportunityScore) {
          return b.totalOpportunityScore - a.totalOpportunityScore;
        }
        if (b.recommendationCount !== a.recommendationCount) {
          return b.recommendationCount - a.recommendationCount;
        }
        return a.customerCode.localeCompare(b.customerCode, 'tr');
      });
      const rows = sortedRows.slice(0, limit);
      const eligibleCustomers = scopedEligibleCustomerCodes.length;
      const coverageRate = eligibleCustomers > 0
        ? Math.round((sortedRows.length / eligibleCustomers) * 1000) / 10
        : 0;
      const averageOpportunityScore = sortedRows.length > 0
        ? Math.round(
            (sortedRows.reduce((sum, row) => sum + row.totalOpportunityScore, 0)
              / sortedRows.length) * 10
          ) / 10
        : 0;

      return {
        rows,
        summary: {
          totalCustomers: sortedRows.length,
          totalRecommendations,
          scannedCustomers: scannedCustomerCodes.length,
          excludedBecauseAlreadyBoughtCategory: customersWithCategoryPurchase.size,
          eligibleCustomers,
          coverageRate,
          averageOpportunityScore,
        },
        metadata: metadataBase,
      };
    } finally {
      await mikroService.disconnect();
    }
  }

  async exportComplementMissingReport(options: {
    mode: 'product' | 'customer';
    matchMode?: ComplementMatchMode;
    productCode?: string;
    customerCode?: string;
    sectorCode?: string;
    salesRepId?: string;
    periodMonths?: number;
    minDocumentCount?: number;
    scope?: ReportRequestScope;
  }): Promise<{ buffer: Buffer; fileName: string }> {
    const data = await this.getComplementMissingReport({
      ...options,
      page: 1,
      limit: 100000,
      forExport: true,
    });

    const formatNumber = (value: number | null | undefined) =>
      Number.isFinite(value) ? Number(value).toFixed(2) : '-';
    const round2Local = (value: number): number =>
      Number.isFinite(value) ? Math.round((value + Number.EPSILON) * 100) / 100 : 0;

    const header = data.metadata.mode === 'product'
      ? ['Cari Kodu', 'Cari Adi', 'Evrak Sayisi', 'Eksik Tamamlayicilar', 'Eksik Sayisi', 'Fiyati Bulunan Kalemlerin Potansiyel Aylik Geliri', 'Baz Urun Son Alim Tarihi', 'Baz Urun Son Alimdan Beri Gun']
      : ['Urun Kodu', 'Urun Adi', 'Evrak Sayisi', 'Eksik Tamamlayicilar', 'Eksik Sayisi', 'Fiyati Bulunan Kalemlerin Potansiyel Aylik Geliri', 'Urun Son Alim Tarihi', 'Urun Son Alimdan Beri Gun'];

    const rows = data.rows.map((row) => {
      const missingList = row.missingComplements
        .map((item) => {
          const qty = formatNumber(item.estimatedQuantity);
          const unitPrice = formatNumber(item.unitPrice);
          const revenue = formatNumber(item.estimatedRevenue);
          return `${item.productCode} - ${item.productName} (${qty} x ${unitPrice} = ${revenue})`;
        })
        .join(', ');
      const potentialRevenue = row.estimatedRevenue === null
        ? ''
        : round2Local(row.estimatedRevenue);
      return data.metadata.mode === 'product'
        ? [
            row.customerCode || '',
            row.customerName || '',
            row.documentCount || 0,
            missingList,
            row.missingCount,
            potentialRevenue,
            row.lastPurchaseDate || '',
            row.daysSinceLastPurchase ?? '',
          ]
        : [
            row.productCode || '',
            row.productName || '',
            row.documentCount || 0,
            missingList,
            row.missingCount,
            potentialRevenue,
            row.lastPurchaseDate || '',
            row.daysSinceLastPurchase ?? '',
          ];
    });

    const sheetData = [header, ...rows];
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Eksik Tamamlayici Firsatlari');

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
    const fileName = `eksik-tamamlayici-urun-firsatlari-${data.metadata.mode}-${data.metadata.startDate}-${data.metadata.endDate}.xlsx`;

    return { buffer, fileName };
  }

  async getCustomerActivityReport(options: {
    startDate?: string;
    endDate?: string;
    customerCode?: string;
    userId?: string;
    page?: number;
    limit?: number;
    scope?: ReportRequestScope;
  }): Promise<CustomerActivityReportResponse> {
    const now = new Date();
    const defaultEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const parsedEnd = parseDateInput(options.endDate) || defaultEnd;
    const parsedStart =
      parseDateInput(options.startDate) ||
      (() => {
        const start = new Date(parsedEnd);
        start.setUTCDate(start.getUTCDate() - 6);
        return start;
      })();

    if (parsedStart > parsedEnd) {
      throw new AppError('Baslangic tarihi bitis tarihinden sonra olamaz.', 400, ErrorCode.BAD_REQUEST);
    }

    const endExclusive = new Date(parsedEnd);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? options.limit : 50;

    const sectorCodes = getSalesRepSectorCodes(options.scope);
    const hasEmptySalesRepScope = options.scope?.role === UserRole.SALES_REP && sectorCodes.length === 0;

    let customer: { id: string; code: string; name: string | null; sectorCode: string | null } | null = null;
    if (options.customerCode) {
      const customerUser = await prisma.user.findFirst({
        where: {
          mikroCariCode: options.customerCode,
          role: 'CUSTOMER',
          parentCustomerId: null,
        },
        select: {
          id: true,
          mikroCariCode: true,
          displayName: true,
          name: true,
          sectorCode: true,
        },
      });

      if (!customerUser) {
        throw new AppError('Customer not found.', 404, ErrorCode.NOT_FOUND);
      }

      customer = {
        id: customerUser.id,
        code: customerUser.mikroCariCode || options.customerCode,
        name: customerUser.displayName || customerUser.name || null,
        sectorCode: customerUser.sectorCode || null,
      };

      if (options.scope?.role === UserRole.SALES_REP && (!customer.sectorCode || !sectorCodes.includes(customer.sectorCode))) {
        throw new AppError('Bu carinin aktivitesine erisemezsiniz.', 403, ErrorCode.FORBIDDEN);
      }
    }

    const where: Prisma.CustomerActivityEventWhereInput = {
      createdAt: {
        gte: parsedStart,
        lt: endExclusive,
      },
      user: {
        role: 'CUSTOMER',
      },
    };

    if (customer?.id) {
      where.customerId = customer.id;
    }

    if (options.userId) {
      where.userId = options.userId;
    }

    if (hasEmptySalesRepScope) {
      where.customerId = '__none__';
    } else if (options.scope?.role === UserRole.SALES_REP) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { customer: { sectorCode: { in: sectorCodes } } },
            { user: { sectorCode: { in: sectorCodes } } },
          ],
        },
      ];
    }

    // Gunluk olay sayisi (Aktivite Trendi + KPI sparkline icin). Salt-okuma.
    // Postgres date_trunc ile gun bazinda gruplanir; opsiyonel cari/kullanici filtreleri uygulanir.
    const dailyWhereSql: Prisma.Sql[] = [
      Prisma.sql`"createdAt" >= ${parsedStart}`,
      Prisma.sql`"createdAt" < ${endExclusive}`,
      Prisma.sql`"userId" IN (SELECT "id" FROM "User" WHERE "role" = 'CUSTOMER')`,
    ];
    if (customer?.id) {
      dailyWhereSql.push(Prisma.sql`"customerId" = ${customer.id}`);
    }
    if (options.userId) {
      dailyWhereSql.push(Prisma.sql`"userId" = ${options.userId}`);
    }
    if (hasEmptySalesRepScope) {
      dailyWhereSql.push(Prisma.sql`FALSE`);
    } else if (options.scope?.role === UserRole.SALES_REP) {
      dailyWhereSql.push(Prisma.sql`
        (
          "customerId" IN (SELECT "id" FROM "User" WHERE "sectorCode" IN (${Prisma.join(sectorCodes)}))
          OR "userId" IN (SELECT "id" FROM "User" WHERE "sectorCode" IN (${Prisma.join(sectorCodes)}))
        )
      `);
    }

    const [totalRecords, uniqueUserRows, typeCounts, activeAgg, dailyCountRows] = await Promise.all([
      prisma.customerActivityEvent.count({ where }),
      prisma.customerActivityEvent.groupBy({
        by: ['userId'],
        where,
        _count: { id: true },
      }),
      prisma.customerActivityEvent.groupBy({
        by: ['type'],
        where,
        _count: { id: true },
      }),
      prisma.customerActivityEvent.aggregate({
        where: { ...where, type: 'ACTIVE_PING' },
        _sum: { durationSeconds: true, clickCount: true },
      }),
      prisma.$queryRaw<Array<{ day: Date; count: bigint }>>(Prisma.sql`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
        FROM "CustomerActivityEvent"
        WHERE ${Prisma.join(dailyWhereSql, ' AND ')}
        GROUP BY day
        ORDER BY day ASC
      `),
    ]);

    // Tarih araligindaki her gun icin (bos gunler dahil) sayim serisi olustur.
    const dailyCountMap = new Map<string, number>();
    dailyCountRows.forEach((row) => {
      dailyCountMap.set(formatDateKey(new Date(row.day)), Number(row.count));
    });
    const dailyCounts: CustomerActivityDailyCount[] = [];
    {
      const cursor = new Date(parsedStart);
      while (cursor <= parsedEnd) {
        const key = formatDateKey(cursor);
        dailyCounts.push({ date: key, count: dailyCountMap.get(key) || 0 });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }

    const uniqueUsers = uniqueUserRows.length;

    const typeMap = new Map<CustomerActivityType, number>();
    typeCounts.forEach((row) => {
      typeMap.set(row.type, row._count.id);
    });

    const summary: CustomerActivitySummary = {
      totalEvents: totalRecords,
      uniqueUsers,
      pageViews: typeMap.get('PAGE_VIEW') || 0,
      productViews: typeMap.get('PRODUCT_VIEW') || 0,
      cartAdds: typeMap.get('CART_ADD') || 0,
      cartRemoves: typeMap.get('CART_REMOVE') || 0,
      cartUpdates: typeMap.get('CART_UPDATE') || 0,
      activeSeconds: Number(activeAgg._sum.durationSeconds || 0),
      clickCount: Number(activeAgg._sum.clickCount || 0),
      searchCount: typeMap.get('SEARCH') || 0,
      dailyCounts,
    };

    const [topPagesRaw, topClickPagesRaw, topProductsRaw, topUsersRaw, searchCountsByUser] = await Promise.all([
      prisma.customerActivityEvent.groupBy({
        by: ['pagePath'],
        where: { ...where, type: 'PAGE_VIEW', pagePath: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      prisma.customerActivityEvent.groupBy({
        by: ['pagePath'],
        where: { ...where, type: 'ACTIVE_PING', pagePath: { not: null } },
        _count: { id: true },
        _sum: { clickCount: true },
        orderBy: { _sum: { clickCount: 'desc' } },
        take: 10,
      }),
      prisma.customerActivityEvent.groupBy({
        by: ['productId', 'productCode'],
        where: { ...where, type: 'PRODUCT_VIEW', productId: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      prisma.customerActivityEvent.groupBy({
        by: ['userId'],
        where,
        _count: { id: true },
        _sum: { durationSeconds: true, clickCount: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      prisma.customerActivityEvent.groupBy({
        by: ['userId'],
        where: { ...where, type: 'SEARCH' },
        _count: { id: true },
      }),
    ]);

    const topPages: CustomerActivityTopPage[] = topPagesRaw
      .filter((row) => row.pagePath)
      .map((row) => ({
        pagePath: row.pagePath as string,
        count: row._count.id,
      }));

    const topClickPages: CustomerActivityTopClickPage[] = topClickPagesRaw
      .filter((row) => row.pagePath)
      .map((row) => ({
        pagePath: row.pagePath as string,
        clickCount: Number(row._sum.clickCount || 0),
        eventCount: row._count.id,
      }))
      .filter((row) => row.clickCount > 0);

    const searchCountMap = new Map(searchCountsByUser.map((row) => [row.userId, row._count.id]));


    const topProductIds = topProductsRaw
      .map((row) => row.productId)
      .filter((value): value is string => Boolean(value));

    const productRows = topProductIds.length
      ? await prisma.product.findMany({
          where: { id: { in: topProductIds } },
          select: { id: true, mikroCode: true, name: true },
        })
      : [];

    const productMap = new Map(productRows.map((row) => [row.id, row]));

    const topProducts: CustomerActivityTopProduct[] = topProductsRaw.map((row) => {
      const product = row.productId ? productMap.get(row.productId) : undefined;
      return {
        productId: row.productId ?? null,
        productCode: row.productCode || product?.mikroCode || null,
        productName: product?.name || null,
        count: row._count.id,
      };
    });

    const topUserIds = topUsersRaw.map((row) => row.userId);
    const userRows = topUserIds.length
      ? await prisma.user.findMany({
          where: { id: { in: topUserIds } },
          select: {
            id: true,
            name: true,
            displayName: true,
            mikroCariCode: true,
            parentCustomer: {
              select: {
                name: true,
                displayName: true,
                mikroCariCode: true,
              },
            },
          },
        })
      : [];

    const userMap = new Map(userRows.map((row) => [row.id, row]));

    const topUsers: CustomerActivityTopUser[] = topUsersRaw.map((row) => {
      const user = userMap.get(row.userId);
      const customerInfo = user?.parentCustomer || user;
      return {
        userId: row.userId,
        userName: user?.displayName || user?.name || null,
        customerCode: customerInfo?.mikroCariCode || null,
        customerName: customerInfo?.displayName || customerInfo?.name || null,
        eventCount: row._count.id,
        activeSeconds: Number(row._sum.durationSeconds || 0),
        clickCount: Number(row._sum.clickCount || 0),
        searchCount: searchCountMap.get(row.userId) || 0,
      };
    });

    const totalPages = Math.max(1, Math.ceil(totalRecords / limit));
    const offset = (page - 1) * limit;

    const events = await prisma.customerActivityEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            displayName: true,
            mikroCariCode: true,
            parentCustomer: {
              select: {
                name: true,
                displayName: true,
                mikroCariCode: true,
              },
            },
          },
        },
        product: {
          select: {
            id: true,
            mikroCode: true,
            name: true,
          },
        },
      },
    });

    const eventRows: CustomerActivityEventRow[] = events.map((event) => {
      const user = event.user;
      const customerInfo = user?.parentCustomer || user;
      return {
        id: event.id,
        type: event.type,
        createdAt: event.createdAt,
        pagePath: event.pagePath,
        pageTitle: event.pageTitle,
        productCode: event.productCode || event.product?.mikroCode || null,
        productName: event.product?.name || null,
        quantity: event.quantity ?? null,
        durationSeconds: event.durationSeconds ?? null,
        clickCount: event.clickCount ?? null,
        meta: event.meta ?? null,
        userId: event.userId,
        userName: user?.displayName || user?.name || null,
        customerCode: customerInfo?.mikroCariCode || null,
        customerName: customerInfo?.displayName || customerInfo?.name || null,
      };
    });

    return {
      summary,
      topPages,
      topClickPages,
      topProducts,
      topUsers,
      events: eventRows,
      pagination: {
        page,
        limit,
        totalPages,
        totalRecords,
      },
      metadata: {
        startDate: formatDateKey(parsedStart),
        endDate: formatDateKey(parsedEnd),
        customer,
        userId: options.userId || null,
      },
    };
  }

  async getStaffActivityReport(options: {
    startDate?: string;
    endDate?: string;
    role?: UserRole;
    userId?: string;
    page?: number;
    limit?: number;
    route?: string;
  }): Promise<StaffActivityReportResponse> {
    const staffRoles: UserRole[] = ['HEAD_ADMIN', 'ADMIN', 'MANAGER', 'SALES_REP', 'DEPOCU', 'DIVERSEY'];
    const now = new Date();
    const defaultEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const parsedEnd = parseDateInput(options.endDate) || defaultEnd;
    const parsedStart =
      parseDateInput(options.startDate) ||
      (() => {
        const start = new Date(parsedEnd);
        start.setUTCDate(start.getUTCDate() - 6);
        return start;
      })();

    if (parsedStart > parsedEnd) {
      throw new AppError('Baslangic tarihi bitis tarihinden sonra olamaz.', 400, ErrorCode.BAD_REQUEST);
    }

    const endExclusive = new Date(parsedEnd);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? options.limit : 50;
    const roleFilter = options.role && staffRoles.includes(options.role) ? options.role : null;

    const where: Prisma.CustomerActivityEventWhereInput = {
      type: 'CLICK',
      createdAt: { gte: parsedStart, lt: endExclusive },
      user: {
        role: roleFilter ? roleFilter : { in: staffRoles },
      },
      meta: {
        path: ['source'],
        equals: 'STAFF_API',
      },
      NOT: STAFF_ACTIVITY_HIDDEN_ROUTE_TOKENS.flatMap((token) => [
        { pagePath: { contains: token, mode: 'insensitive' as const } },
        { pageTitle: { contains: token, mode: 'insensitive' as const } },
      ]),
    };

    if (options.userId) {
      where.userId = options.userId;
    }

    if (options.route) {
      where.pagePath = { contains: options.route, mode: 'insensitive' };
    }

    const [totalRecords, uniqueUserRows, activeAgg, methodCounts] = await Promise.all([
      prisma.customerActivityEvent.count({ where }),
      prisma.customerActivityEvent.groupBy({
        by: ['userId'],
        where,
        _count: { id: true },
      }),
      prisma.customerActivityEvent.aggregate({
        where,
        _sum: { durationSeconds: true, clickCount: true },
      }),
      Promise.all([
        prisma.customerActivityEvent.count({ where: { ...where, pageTitle: { startsWith: 'GET ' } } }),
        prisma.customerActivityEvent.count({ where: { ...where, pageTitle: { startsWith: 'POST ' } } }),
        prisma.customerActivityEvent.count({ where: { ...where, pageTitle: { startsWith: 'PUT ' } } }),
        prisma.customerActivityEvent.count({ where: { ...where, pageTitle: { startsWith: 'PATCH ' } } }),
        prisma.customerActivityEvent.count({ where: { ...where, pageTitle: { startsWith: 'DELETE ' } } }),
      ]),
    ]);

    const summary: StaffActivitySummary = {
      totalEvents: totalRecords,
      uniqueStaff: uniqueUserRows.length,
      activeSeconds: Number(activeAgg._sum.durationSeconds || 0),
      clickCount: Number(activeAgg._sum.clickCount || 0),
      getCount: methodCounts[0],
      postCount: methodCounts[1],
      putCount: methodCounts[2],
      patchCount: methodCounts[3],
      deleteCount: methodCounts[4],
    };

    const [topRoutesRaw, topUsersRaw] = await Promise.all([
      prisma.customerActivityEvent.groupBy({
        by: ['pagePath'],
        where: { ...where, pagePath: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      prisma.customerActivityEvent.groupBy({
        by: ['userId'],
        where,
        _count: { id: true },
        _sum: { durationSeconds: true, clickCount: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
    ]);

    const topRoutes: StaffActivityTopRoute[] = topRoutesRaw
      .filter((row) => row.pagePath)
      .map((row) => ({
        route: row.pagePath as string,
        count: row._count.id,
      }));

    const topUserIds = topUsersRaw.map((row) => row.userId);
    const topUsersDetails = topUserIds.length
      ? await prisma.user.findMany({
          where: { id: { in: topUserIds } },
          select: {
            id: true,
            email: true,
            name: true,
            displayName: true,
            role: true,
          },
        })
      : [];

    const userMap = new Map(topUsersDetails.map((row) => [row.id, row]));
    const topUsers: StaffActivityTopUser[] = topUsersRaw.map((row) => {
      const user = userMap.get(row.userId);
      return {
        userId: row.userId,
        userName: user?.displayName || user?.name || null,
        email: user?.email || null,
        role: (user?.role || 'ADMIN') as UserRole,
        eventCount: row._count.id,
        activeSeconds: Number(row._sum.durationSeconds || 0),
        clickCount: Number(row._sum.clickCount || 0),
      };
    });

    const totalPages = Math.max(1, Math.ceil(totalRecords / limit));
    const offset = (page - 1) * limit;
    const events = await prisma.customerActivityEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            name: true,
            displayName: true,
          },
        },
      },
    });

    const eventRows: StaffActivityEventRow[] = events.map((event) => {
      const meta = event.meta && typeof event.meta === 'object' ? (event.meta as Record<string, any>) : {};
      const method = typeof meta.method === 'string' ? meta.method : event.pageTitle?.split(' ')[0] || 'GET';
      const route = typeof meta.route === 'string' ? meta.route : event.pagePath;
      const statusCode = Number.isFinite(meta.statusCode) ? Number(meta.statusCode) : null;
      const durationMs = Number.isFinite(meta.durationMs)
        ? Number(meta.durationMs)
        : Number.isFinite(event.durationSeconds)
        ? Number(event.durationSeconds) * 1000
        : null;
      const action = `${method.toUpperCase()} ${normalizeRouteForAction(route || event.pagePath)}`;
      const details = buildStaffEventDetails(meta);

      return {
        id: event.id,
        createdAt: event.createdAt,
        userId: event.userId,
        userName: event.user?.displayName || event.user?.name || null,
        email: event.user?.email || null,
        role: event.user?.role || 'ADMIN',
        method,
        route: route || null,
        action,
        details,
        statusCode,
        durationMs,
        pageTitle: event.pageTitle,
        pagePath: event.pagePath,
        meta: event.meta ?? null,
      };
    });

    return {
      summary,
      topRoutes,
      topUsers,
      events: eventRows,
      pagination: {
        page,
        limit,
        totalPages,
        totalRecords,
      },
      metadata: {
        startDate: formatDateKey(parsedStart),
        endDate: formatDateKey(parsedEnd),
        role: roleFilter,
        userId: options.userId || null,
      },
    };
  }


  async getCustomerCartsReport(options: {
    search?: string;
    includeEmpty?: boolean;
    page?: number;
    limit?: number;
    scope?: ReportRequestScope;
  }): Promise<CustomerCartsReportResponse> {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? options.limit : 20;
    const searchTerm = options.search ? options.search.trim() : '';

    const sectorCodes = getSalesRepSectorCodes(options.scope);
    if (options.scope?.role === UserRole.SALES_REP && sectorCodes.length === 0) {
      return {
        carts: [],
        pagination: { page, limit, totalPages: 1, totalRecords: 0 },
      };
    }

    const scopedUserWhere: Prisma.UserWhereInput = {
      role: 'CUSTOMER',
      ...(options.scope?.role === UserRole.SALES_REP
        ? { OR: [{ sectorCode: { in: sectorCodes } }, { parentCustomer: { sectorCode: { in: sectorCodes } } }] }
        : {}),
    };

    const where: Prisma.CartWhereInput = {
      user: scopedUserWhere,
    };

    if (!options.includeEmpty) {
      where.items = { some: {} };
    }

    if (searchTerm) {
      where.OR = [
        { user: { mikroCariCode: { contains: searchTerm, mode: 'insensitive' } } },
        { user: { displayName: { contains: searchTerm, mode: 'insensitive' } } },
        { user: { name: { contains: searchTerm, mode: 'insensitive' } } },
        { user: { email: { contains: searchTerm, mode: 'insensitive' } } },
        { user: { parentCustomer: { mikroCariCode: { contains: searchTerm, mode: 'insensitive' } } } },
        { user: { parentCustomer: { displayName: { contains: searchTerm, mode: 'insensitive' } } } },
        { user: { parentCustomer: { name: { contains: searchTerm, mode: 'insensitive' } } } },
      ];
    }

    const totalRecords = await prisma.cart.count({ where });
    const totalPages = Math.max(1, Math.ceil(totalRecords / limit));
    const offset = (page - 1) * limit;

    const carts = await prisma.cart.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            displayName: true,
            mikroCariCode: true,
            parentCustomer: {
              select: {
                id: true,
                name: true,
                displayName: true,
                mikroCariCode: true,
              },
            },
          },
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                mikroCode: true,
                name: true,
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
      skip: offset,
      take: limit,
    });

    const cartRows: CustomerCartRow[] = carts.map((cart) => {
      const customerInfo = cart.user.parentCustomer || cart.user;
      const items: CustomerCartItemRow[] = cart.items.map((item) => {
        const unitPrice = Number(item.unitPrice || 0);
        const totalPrice = unitPrice * item.quantity;
        return {
          id: item.id,
          productId: item.productId,
          productCode: item.product?.mikroCode || null,
          productName: item.product?.name || null,
          quantity: item.quantity,
          priceType: item.priceType,
          priceMode: item.priceMode,
          unitPrice,
          totalPrice,
          updatedAt: item.updatedAt,
        };
      });

      const totals = items.reduce(
        (acc, item) => {
          acc.totalQuantity += item.quantity;
          acc.totalAmount += item.totalPrice;
          return acc;
        },
        { totalQuantity: 0, totalAmount: 0 }
      );

      const lastItemAt = items.length
        ? items.reduce((max, item) => (max && max > item.updatedAt ? max : item.updatedAt), items[0].updatedAt)
        : null;

      return {
        cartId: cart.id,
        userId: cart.user.id,
        userName: cart.user.displayName || cart.user.name || null,
        customerCode: customerInfo?.mikroCariCode || null,
        customerName: customerInfo?.displayName || customerInfo?.name || null,
        isSubUser: Boolean(cart.user.parentCustomer),
        updatedAt: cart.updatedAt,
        lastItemAt,
        itemCount: items.length,
        totalQuantity: totals.totalQuantity,
        totalAmount: totals.totalAmount,
        items,
      };
    });

    return {
      carts: cartRows,
      pagination: {
        page,
        limit,
        totalPages,
        totalRecords,
      },
    };
  }

  async clearCustomerCart(options: {
    cartId: string;
    scope?: ReportRequestScope;
  }): Promise<{
    cartId: string;
    deletedCount: number;
    customerCode: string | null;
    customerName: string | null;
  }> {
    const cartId = String(options.cartId || '').trim();
    if (!cartId) {
      throw new AppError('Sepet kimligi gerekli.', 400, ErrorCode.BAD_REQUEST);
    }

    const cart = await prisma.cart.findUnique({
      where: { id: cartId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            displayName: true,
            mikroCariCode: true,
            sectorCode: true,
            parentCustomer: {
              select: {
                id: true,
                name: true,
                displayName: true,
                mikroCariCode: true,
                sectorCode: true,
              },
            },
          },
        },
      },
    });

    if (!cart) {
      throw new AppError('Sepet bulunamadi.', 404, ErrorCode.NOT_FOUND);
    }

    const customerInfo = cart.user.parentCustomer || cart.user;
    if (options.scope?.role === UserRole.SALES_REP) {
      const sectorCodes = getSalesRepSectorCodes(options.scope).map(normalizeReportCode);
      const cartSectorCodes = [
        normalizeReportCode(cart.user.sectorCode),
        normalizeReportCode(cart.user.parentCustomer?.sectorCode),
      ].filter(Boolean);
      const allowed = sectorCodes.length > 0 && cartSectorCodes.some((code) => sectorCodes.includes(code));
      if (!allowed) {
        throw new AppError('Bu musteri sepetini temizleme yetkiniz yok.', 403, ErrorCode.FORBIDDEN);
      }
    }

    const result = await prisma.cartItem.deleteMany({ where: { cartId } });
    await prisma.cart.update({
      where: { id: cartId },
      data: {
        updatedAt: new Date(),
        giftCampaignId: null,
        giftProductIds: [],
      } as any,
    });

    return {
      cartId,
      deletedCount: result.count,
      customerCode: customerInfo?.mikroCariCode || null,
      customerName: customerInfo?.displayName || customerInfo?.name || null,
    };
  }

  async getUcarerDepotReport(options: {
    depot: 'MERKEZ' | 'TOPCA';
    limit?: number;
    all?: boolean;
  }): Promise<{
    depot: 'MERKEZ' | 'TOPCA';
    rows: Record<string, any>[];
    columns: string[];
    total: number;
    limited: boolean;
  }> {
    const depot = options.depot === 'TOPCA' ? 'TOPCA' : 'MERKEZ';
    const returnAll = Boolean(options.all);
    const limit = options.limit && options.limit > 0 ? Math.min(options.limit, 20000) : 1000;
    const sql = depot === 'TOPCA' ? UCARER_TOPCA_DEPO_SQL : UCARER_MERKEZ_DEPO_SQL;
    let rows: any[] = [];
    try {
      rows = await mikroService.executeQuery(sql);
    } catch (error: any) {
      const message = String(error?.message || '');
      const isColumnMismatch = message.toLowerCase().includes('invalid column name');
      if (!isColumnMismatch) {
        throw error;
      }

      const fallbackSql =
        depot === 'TOPCA'
          ? 'SELECT * FROM DEPO_TOPCA_DURUM'
          : 'SELECT * FROM DEPO_MERKEZ_DURUM';
      rows = await mikroService.executeQuery(fallbackSql);
    }

    const normalizedRows = Array.isArray(rows) ? rows : [];
    addUcarerCustomerOrderNeedCompatibility(normalizedRows);

    // "Kac gunluk stok kaldi" kolonlari: son 120 gun satisindan urun basina gunluk ortalama.
    // Tek TOPLU sorgu (N+1 yok); TOPLU srm ve mevcut exclusion kosullari haric tutulur.
    if (normalizedRows.length > 0) {
      try {
        const lookbackDays = 120;
        const baseConditions = [
          'sth.sth_cins = 0',
          'sth.sth_tip = 1',
          'ISNULL(sth.sth_normal_iade, 0) = 0',
          'sth.sth_evraktip IN (1, 4)',
          '(sth.sth_iptal = 0 OR sth.sth_iptal IS NULL)',
          'sth.sth_stok_kod IS NOT NULL',
          "LTRIM(RTRIM(sth.sth_stok_kod)) <> ''",
        ];
        const exclusionConditions = await exclusionService.buildStokHareketleriExclusionConditions();
        const whereClause = [
          ...baseConditions,
          ...exclusionConditions,
          `sth.sth_tarih >= DATEADD(DAY, -${lookbackDays}, CAST(GETDATE() AS date))`,
          'ISNULL(sth.sth_miktar, 0) > 0',
          "UPPER(LTRIM(RTRIM(ISNULL(sth.sth_stok_srm_merkezi, '')))) <> 'TOPLU'",
        ].join(' AND ');

        const salesRows = await mikroService.executeQuery(`
          SELECT
            UPPER(LTRIM(RTRIM(sth.sth_stok_kod))) AS productCode,
            SUM(CAST(ISNULL(sth.sth_miktar, 0) AS FLOAT)) AS totalQuantity
          FROM STOK_HAREKETLERI sth WITH (NOLOCK)
          WHERE ${whereClause}
          GROUP BY UPPER(LTRIM(RTRIM(sth.sth_stok_kod)))
        `);

        const dailyAvgByCode = new Map<string, number>();
        (Array.isArray(salesRows) ? salesRows : []).forEach((row: any) => {
          const code = String(row?.productCode || '').trim().toUpperCase();
          const total = Number(row?.totalQuantity || 0);
          if (code && Number.isFinite(total) && total > 0) {
            dailyAvgByCode.set(code, total / lookbackDays);
          }
        });

        const sampleKeys = Object.keys(normalizedRows[0] || {});
        const codeKey = sampleKeys.find((key) => normalizeKeyToken(key).includes('stokkodu'));
        const depotToken = depot === 'TOPCA' ? 'topcadepo' : 'merkezdepo';
        const depotQtyKey =
          sampleKeys.find((key) => normalizeKeyToken(key) === `${depotToken}miktari`) ||
          sampleKeys.find((key) => normalizeKeyToken(key) === depotToken);
        if (codeKey) {
          normalizedRows.forEach((row) => {
            const code = String(row?.[codeKey] || '').trim().toUpperCase();
            const dailyAvg = dailyAvgByCode.get(code) || 0;
            const depotQtyRaw = depotQtyKey ? Number(row?.[depotQtyKey]) : NaN;
            const depotQty = Number.isFinite(depotQtyRaw) ? Math.max(0, depotQtyRaw) : 0;
            row['Gunluk Ortalama Satis (120g)'] = dailyAvg > 0 ? Math.round(dailyAvg * 100) / 100 : 0;
            row['Kalan Stok Gunu'] = dailyAvg > 0 ? Math.round((depotQty / dailyAvg) * 10) / 10 : null;
          });
        }
      } catch (error: any) {
        // Stok gunu kolonlari hesaplanamazsa rapor yine de donsun.
        console.warn('Ucarer depo stok gunu kolonlari hesaplanamadi:', error?.message || error);
      }
    }

    const columns = normalizedRows.length > 0 ? Object.keys(normalizedRows[0] || {}) : [];
    const limitedRows = returnAll ? normalizedRows : normalizedRows.slice(0, limit);

    return {
      depot,
      rows: limitedRows,
      columns,
      total: normalizedRows.length,
      limited: !returnAll && normalizedRows.length > limitedRows.length,
    };
  }

  async getUcarerIncomingOrderDetails(
    productCodeInput: string,
    depotInput?: 'MERKEZ' | 'TOPCA' | string | null
  ): Promise<{
    productCode: string;
    rows: Array<{
      customerCode: string;
      customerName: string;
      orderSeries: string;
      orderSequence: number;
      orderLineNo: number;
      orderDate: string | null;
      quantity: number;
      deliveredQuantity: number;
      remainingQuantity: number;
      unitPrice: number;
    }>;
    total: number;
    depot: 'MERKEZ' | 'TOPCA';
  }> {
    const productCode = String(productCodeInput || '').trim().toUpperCase();
    if (!productCode) {
      throw new AppError('Stok kodu zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }
    const depot = String(depotInput || 'MERKEZ').trim().toUpperCase() === 'TOPCA' ? 'TOPCA' : 'MERKEZ';
    const warehouseNo = depot === 'TOPCA' ? 6 : 1;
    const escapedCode = productCode.replace(/'/g, "''");
    const rawRows = await mikroService.executeQuery(`
      SELECT TOP 750
        sip_musteri_kod,
        sip_evrakno_seri,
        sip_evrakno_sira,
        sip_satirno,
        sip_tarih,
        sip_miktar,
        sip_teslim_miktar,
        sip_b_fiyat
      FROM SIPARISLER WITH (NOLOCK)
      WHERE sip_tip = 0
        AND ISNULL(sip_kapat_fl, 0) = 0
        AND ISNULL(sip_iptal, 0) = 0
        AND ISNULL(sip_depono, ${warehouseNo}) = ${warehouseNo}
        AND LTRIM(RTRIM(ISNULL(sip_stok_kod, ''))) = '${escapedCode}'
        AND ISNULL(sip_miktar, 0) > ISNULL(sip_teslim_miktar, 0)
      ORDER BY sip_tarih DESC, sip_evrakno_sira DESC, sip_satirno DESC
    `);

    const rows = Array.isArray(rawRows) ? rawRows : [];
    if (rows.length === 0) {
      return { productCode, rows: [], total: 0, depot };
    }

    const readByTokens = (row: Record<string, any>, tokens: string[]): any => {
      for (const token of tokens) {
        const key = Object.keys(row).find((candidate) =>
          normalizeKeyToken(candidate).includes(normalizeKeyToken(token))
        );
        if (key) return row[key];
      }
      return null;
    };
    const toNum = (value: unknown): number => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const normalized = rows.map((row) => {
      const customerCode = String(
        readByTokens(row, ['sipcarikod', 'sipmusterikod', 'carikod', 'musterikod']) || ''
      )
        .trim()
        .toUpperCase();
      const orderSeries = String(readByTokens(row, ['sipevraknoseri', 'evraknoseri']) || '').trim().toUpperCase();
      const orderSequence = Math.max(0, Math.trunc(toNum(readByTokens(row, ['sipevraknosira', 'evraknosira']))));
      const orderLineNo = Math.max(0, Math.trunc(toNum(readByTokens(row, ['sipsatirno', 'satirno']))));
      const quantity = Math.max(0, toNum(readByTokens(row, ['sipmiktar'])));
      const deliveredQuantity = Math.max(0, toNum(readByTokens(row, ['sipteslimmiktar'])));
      const remainingQuantity = Math.max(0, quantity - deliveredQuantity);
      const unitPrice = Math.max(0, toNum(readByTokens(row, ['sipbfiyat', 'birimfiyat', 'bfiyat'])));
      const orderDateValue = readByTokens(row, ['siptarih', 'tarih']);
      const parsedDate = orderDateValue ? new Date(orderDateValue) : null;
      const orderDate = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null;
      return {
        customerCode,
        orderSeries,
        orderSequence,
        orderLineNo,
        orderDate,
        quantity,
        deliveredQuantity,
        remainingQuantity,
        unitPrice,
      };
    });

    const customerCodes = Array.from(
      new Set(normalized.map((row) => row.customerCode).filter(Boolean))
    );
    let customerNameMap = new Map<string, string>();
    if (customerCodes.length > 0) {
      const inClause = customerCodes.map((code) => `'${code.replace(/'/g, "''")}'`).join(', ');
      const customerRows = await mikroService.executeQuery(`
        SELECT cari_kod AS customerCode, LTRIM(RTRIM(ISNULL(cari_unvan1, ''))) AS customerName
        FROM CARI_HESAPLAR WITH (NOLOCK)
        WHERE cari_kod IN (${inClause})
      `);
      customerNameMap = new Map(
        (Array.isArray(customerRows) ? customerRows : []).map((row: any) => [
          String(row?.customerCode || '').trim().toUpperCase(),
          String(row?.customerName || '').trim(),
        ])
      );
    }

    const responseRows = normalized
      .filter((row) => row.remainingQuantity > 0)
      .map((row) => ({
        ...row,
        customerName: customerNameMap.get(row.customerCode) || row.customerCode || '-',
      }))
      .sort((a, b) => {
        const dateA = a.orderDate ? new Date(a.orderDate).getTime() : 0;
        const dateB = b.orderDate ? new Date(b.orderDate).getTime() : 0;
        if (dateB !== dateA) return dateB - dateA;
        if (b.orderSequence !== a.orderSequence) return b.orderSequence - a.orderSequence;
        return b.orderLineNo - a.orderLineNo;
      });

    return {
      productCode,
      rows: responseRows,
      total: responseRows.length,
      depot,
    };
  }

  async getUcarerRecentSupplierOrderSeries(supplierCodesInput: string[]): Promise<{
    rows: Array<{ supplierCode: string; series: string; lastOrderNumber: string; lastOrderDate: string | null }>;
    bySupplier: Record<string, Array<{ series: string; lastOrderNumber: string; lastOrderDate: string | null }>>;
  }> {
    const supplierCodes = Array.from(
      new Set((supplierCodesInput || []).map((code) => String(code || '').trim().toUpperCase()).filter(Boolean))
    ).slice(0, 100);
    if (supplierCodes.length === 0) return { rows: [], bySupplier: {} };

    const inClause = supplierCodes.map((code) => `'${code.replace(/'/g, "''")}'`).join(',');
    const rowsRaw = await mikroService.executeQuery(`
      WITH SeriesRows AS (
        SELECT
          LTRIM(RTRIM(ISNULL(sip_musteri_kod, ''))) AS supplierCode,
          LTRIM(RTRIM(ISNULL(sip_evrakno_seri, ''))) AS series,
          MAX(ISNULL(sip_tarih, sip_create_date)) AS lastOrderDate,
          MAX(ISNULL(sip_evrakno_sira, 0)) AS lastSequence,
          ROW_NUMBER() OVER (
            PARTITION BY LTRIM(RTRIM(ISNULL(sip_musteri_kod, '')))
            ORDER BY MAX(ISNULL(sip_tarih, sip_create_date)) DESC, MAX(ISNULL(sip_evrakno_sira, 0)) DESC
          ) AS rn
        FROM SIPARISLER WITH (NOLOCK)
        WHERE sip_tip = 1
          AND LTRIM(RTRIM(ISNULL(sip_musteri_kod, ''))) IN (${inClause})
          AND LTRIM(RTRIM(ISNULL(sip_evrakno_seri, ''))) <> ''
        GROUP BY
          LTRIM(RTRIM(ISNULL(sip_musteri_kod, ''))),
          LTRIM(RTRIM(ISNULL(sip_evrakno_seri, '')))
      )
      SELECT supplierCode, series, lastOrderDate, lastSequence
      FROM SeriesRows
      WHERE rn <= 3
      ORDER BY supplierCode, rn
    `);

    const rows = (Array.isArray(rowsRaw) ? rowsRaw : []).map((row: any) => {
      const supplierCode = String(row?.supplierCode || '').trim().toUpperCase();
      const series = String(row?.series || '').trim().toUpperCase();
      const lastSequence = Math.trunc(Number(row?.lastSequence || 0));
      const parsedDate = row?.lastOrderDate ? new Date(row.lastOrderDate) : null;
      const lastOrderDate = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null;
      return {
        supplierCode,
        series,
        lastOrderNumber: series && lastSequence > 0 ? `${series}-${lastSequence}` : series,
        lastOrderDate,
      };
    }).filter((row) => row.supplierCode && row.series);

    const bySupplier: Record<string, Array<{ series: string; lastOrderNumber: string; lastOrderDate: string | null }>> = {};
    rows.forEach((row) => {
      bySupplier[row.supplierCode] = bySupplier[row.supplierCode] || [];
      bySupplier[row.supplierCode].push({
        series: row.series,
        lastOrderNumber: row.lastOrderNumber,
        lastOrderDate: row.lastOrderDate,
      });
    });

    return { rows, bySupplier };
  }

  async getUcarerProductSalesHistory(productCodeInput: string): Promise<{
    productCode: string;
    rows: Array<{
      lineGuid: string;
      customerCode: string;
      customerName: string;
      documentSeries: string;
      documentSequence: number;
      documentLineNo: number;
      stockResponsibilityCenter: string;
      customerResponsibilityCenter: string;
      saleDate: string | null;
      quantity: number;
      unitPrice: number;
      totalAmount: number;
    }>;
    total: number;
    summary: {
      totalQuantity: number;
      totalAmount: number;
      averageUnitPrice: number;
    };
    metadata: {
      lookbackMonths: number;
    };
  }> {
    const lookbackMonths = 4; // MinMax hesabindaki Fth_MinMaxHesaplama penceresi
    const productCode = String(productCodeInput || '').trim().toUpperCase();
    if (!productCode) {
      throw new AppError('Stok kodu zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }

    const escapedCode = productCode.replace(/'/g, "''");
    const baseConditions = [
      'sth.sth_cins = 0',
      'sth.sth_tip = 1',
      'ISNULL(sth.sth_normal_iade, 0) = 0',
      'sth.sth_evraktip IN (1, 4)',
      '(sth.sth_iptal = 0 OR sth.sth_iptal IS NULL)',
      'sth.sth_stok_kod IS NOT NULL',
      "LTRIM(RTRIM(sth.sth_stok_kod)) <> ''",
      'sth.sth_cari_kodu IS NOT NULL',
      "LTRIM(RTRIM(sth.sth_cari_kodu)) <> ''",
    ];
    const exclusionConditions = await exclusionService.buildStokHareketleriExclusionConditions();
    const whereClause = [
      ...baseConditions,
      ...exclusionConditions,
      `LTRIM(RTRIM(sth.sth_stok_kod)) = '${escapedCode}'`,
      `sth.sth_tarih >= DATEADD(MONTH, -${lookbackMonths}, CAST(GETDATE() AS date))`,
      'ISNULL(sth.sth_miktar, 0) > 0',
      "UPPER(LTRIM(RTRIM(ISNULL(sth.sth_stok_srm_merkezi, '')))) <> 'TOPLU'",
    ].join(' AND ');

    const rawRows = await mikroService.executeQuery(`
      SELECT TOP 1500
        CONVERT(varchar(36), sth.sth_Guid) as lineGuid,
        RTRIM(sth.sth_cari_kodu) as customerCode,
        LTRIM(RTRIM(ISNULL(ch.cari_unvan1, ''))) as customerName,
        RTRIM(ISNULL(sth.sth_evrakno_seri, '')) as documentSeries,
        CAST(ISNULL(sth.sth_evrakno_sira, 0) AS INT) as documentSequence,
        CAST(ISNULL(sth.sth_satirno, 0) AS INT) as documentLineNo,
        LTRIM(RTRIM(ISNULL(sth.sth_stok_srm_merkezi, ''))) as stockResponsibilityCenter,
        LTRIM(RTRIM(ISNULL(sth.sth_cari_srm_merkezi, ''))) as customerResponsibilityCenter,
        sth.sth_tarih as saleDate,
        CAST(ISNULL(sth.sth_miktar, 0) AS FLOAT) as quantity,
        CAST(
          CASE
            WHEN ISNULL(sth.sth_miktar, 0) = 0 THEN 0
            ELSE ISNULL(sth.sth_tutar, 0) / NULLIF(sth.sth_miktar, 0)
          END
        AS FLOAT) as unitPrice,
        CAST(ISNULL(sth.sth_tutar, 0) AS FLOAT) as totalAmount
      FROM STOK_HAREKETLERI sth WITH (NOLOCK)
      LEFT JOIN CARI_HESAPLAR ch WITH (NOLOCK) ON ch.cari_kod = sth.sth_cari_kodu
      WHERE ${whereClause}
      ORDER BY sth.sth_tarih DESC, sth.sth_evrakno_sira DESC, sth.sth_satirno DESC
    `);

    const rows = (Array.isArray(rawRows) ? rawRows : []).map((row: any) => {
      const parsedDate = row?.saleDate ? new Date(row.saleDate) : null;
      const saleDate = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null;
      const quantity = Number(row?.quantity) || 0;
      const unitPrice = Number(row?.unitPrice) || 0;
      const totalAmount = Number(row?.totalAmount) || 0;
      return {
        lineGuid: String(row?.lineGuid || '').trim(),
        customerCode: String(row?.customerCode || '').trim().toUpperCase(),
        customerName: String(row?.customerName || '').trim() || String(row?.customerCode || '').trim().toUpperCase() || '-',
        documentSeries: String(row?.documentSeries || '').trim().toUpperCase(),
        documentSequence: Math.max(0, Math.trunc(Number(row?.documentSequence) || 0)),
        documentLineNo: Math.max(0, Math.trunc(Number(row?.documentLineNo) || 0)),
        stockResponsibilityCenter: String(row?.stockResponsibilityCenter || '').trim().toUpperCase(),
        customerResponsibilityCenter: String(row?.customerResponsibilityCenter || '').trim().toUpperCase(),
        saleDate,
        quantity: Number.isFinite(quantity) ? quantity : 0,
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
        totalAmount: Number.isFinite(totalAmount) ? totalAmount : 0,
      };
    });

    const totalQuantity = rows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
    const totalAmount = rows.reduce((sum, row) => sum + (Number(row.totalAmount) || 0), 0);
    const averageUnitPrice = totalQuantity > 0 ? totalAmount / totalQuantity : 0;

    return {
      productCode,
      rows,
      total: rows.length,
      summary: {
        totalQuantity,
        totalAmount,
        averageUnitPrice,
      },
      metadata: {
        lookbackMonths,
      },
    };
  }

  async markUcarerSalesLineAsToplu(input: {
    productCode?: string;
    lineGuid?: string;
    documentSeries?: string;
    documentSequence?: number;
    documentLineNo?: number;
    userId?: string | null;
  }): Promise<{
    updated: boolean;
    alreadyToplu: boolean;
    line: {
      lineGuid: string;
      productCode: string;
      documentSeries: string;
      documentSequence: number;
      documentLineNo: number;
      previousStockResponsibilityCenter: string;
      stockResponsibilityCenter: string;
      customerResponsibilityCenter: string;
    };
  }> {
    const productCode = String(input.productCode || '').trim().toUpperCase();
    const lineGuid = String(input.lineGuid || '').trim();
    const documentSeries = String(input.documentSeries || '').trim().toUpperCase();
    const documentSequence = Math.trunc(Number(input.documentSequence) || 0);
    const documentLineNo = Math.trunc(Number(input.documentLineNo) || 0);

    if (!productCode || !lineGuid || !documentSeries || documentSequence <= 0 || documentLineNo < 0) {
      throw new AppError('Stok kodu, evrak ve satir bilgisi zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }

    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(lineGuid)) {
      throw new AppError('Satir kimligi gecersiz.', 400, ErrorCode.BAD_REQUEST);
    }

    const escapedCode = productCode.replace(/'/g, "''");
    const escapedSeries = documentSeries.replace(/'/g, "''");
    const mikroUserNoRaw = Number(process.env.MIKRO_USER_NO || process.env.MIKRO_USERNO || 1);
    const mikroUserNo = Number.isFinite(mikroUserNoRaw) && mikroUserNoRaw > 0 ? Math.trunc(mikroUserNoRaw) : 1;

    const rows = await mikroService.executeQuery(`
      SET NOCOUNT ON;

      DECLARE @updated TABLE (
        lineGuid varchar(36),
        productCode nvarchar(25),
        documentSeries nvarchar(25),
        documentSequence int,
        documentLineNo int,
        previousStockResponsibilityCenter nvarchar(25),
        stockResponsibilityCenter nvarchar(25),
        customerResponsibilityCenter nvarchar(25)
      );

      UPDATE sth
      SET
        sth_stok_srm_merkezi = N'TOPLU',
        sth_lastup_date = GETDATE(),
        sth_lastup_user = CASE WHEN ISNULL(sth_lastup_user, 0) = 0 THEN ${mikroUserNo} ELSE sth_lastup_user END
      OUTPUT
        CONVERT(varchar(36), inserted.sth_Guid),
        RTRIM(inserted.sth_stok_kod),
        RTRIM(inserted.sth_evrakno_seri),
        CAST(inserted.sth_evrakno_sira AS int),
        CAST(inserted.sth_satirno AS int),
        LTRIM(RTRIM(ISNULL(deleted.sth_stok_srm_merkezi, ''))),
        LTRIM(RTRIM(ISNULL(inserted.sth_stok_srm_merkezi, ''))),
        LTRIM(RTRIM(ISNULL(inserted.sth_cari_srm_merkezi, '')))
      INTO @updated
      FROM STOK_HAREKETLERI sth
      WHERE sth.sth_Guid = CAST('${lineGuid}' AS uniqueidentifier)
        AND LTRIM(RTRIM(sth.sth_stok_kod)) = '${escapedCode}'
        AND UPPER(LTRIM(RTRIM(ISNULL(sth.sth_evrakno_seri, '')))) = '${escapedSeries}'
        AND ISNULL(sth.sth_evrakno_sira, 0) = ${documentSequence}
        AND ISNULL(sth.sth_satirno, 0) = ${documentLineNo}
        AND ISNULL(sth.sth_tip, 0) = 1
        AND ISNULL(sth.sth_cins, 0) = 0
        AND ISNULL(sth.sth_normal_iade, 0) = 0
        AND ISNULL(sth.sth_evraktip, 0) IN (1, 4)
        AND ISNULL(sth.sth_iptal, 0) = 0
        AND UPPER(LTRIM(RTRIM(ISNULL(sth.sth_stok_srm_merkezi, '')))) <> 'TOPLU';

      IF EXISTS (SELECT 1 FROM @updated)
      BEGIN
        SELECT
          CAST(1 AS bit) AS updated,
          CAST(0 AS bit) AS alreadyToplu,
          lineGuid,
          productCode,
          documentSeries,
          documentSequence,
          documentLineNo,
          previousStockResponsibilityCenter,
          stockResponsibilityCenter,
          customerResponsibilityCenter
        FROM @updated;
      END
      ELSE
      BEGIN
        SELECT TOP 1
          CAST(0 AS bit) AS updated,
          CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(sth.sth_stok_srm_merkezi, '')))) = 'TOPLU' THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS alreadyToplu,
          CONVERT(varchar(36), sth.sth_Guid) AS lineGuid,
          RTRIM(sth.sth_stok_kod) AS productCode,
          RTRIM(sth.sth_evrakno_seri) AS documentSeries,
          CAST(sth.sth_evrakno_sira AS int) AS documentSequence,
          CAST(sth.sth_satirno AS int) AS documentLineNo,
          LTRIM(RTRIM(ISNULL(sth.sth_stok_srm_merkezi, ''))) AS previousStockResponsibilityCenter,
          LTRIM(RTRIM(ISNULL(sth.sth_stok_srm_merkezi, ''))) AS stockResponsibilityCenter,
          LTRIM(RTRIM(ISNULL(sth.sth_cari_srm_merkezi, ''))) AS customerResponsibilityCenter
        FROM STOK_HAREKETLERI sth WITH (NOLOCK)
        WHERE sth.sth_Guid = CAST('${lineGuid}' AS uniqueidentifier)
          AND LTRIM(RTRIM(sth.sth_stok_kod)) = '${escapedCode}'
          AND UPPER(LTRIM(RTRIM(ISNULL(sth.sth_evrakno_seri, '')))) = '${escapedSeries}'
          AND ISNULL(sth.sth_evrakno_sira, 0) = ${documentSequence}
          AND ISNULL(sth.sth_satirno, 0) = ${documentLineNo}
          AND ISNULL(sth.sth_tip, 0) = 1
          AND ISNULL(sth.sth_cins, 0) = 0
          AND ISNULL(sth.sth_normal_iade, 0) = 0
          AND ISNULL(sth.sth_evraktip, 0) IN (1, 4)
          AND ISNULL(sth.sth_iptal, 0) = 0;
      END
    `);

    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row?.lineGuid) {
      throw new AppError('Eslesen satis satiri bulunamadi.', 404, ErrorCode.NOT_FOUND);
    }

    const result = {
      updated: Boolean(row.updated),
      alreadyToplu: Boolean(row.alreadyToplu),
      line: {
        lineGuid: String(row.lineGuid || '').trim(),
        productCode: String(row.productCode || '').trim().toUpperCase(),
        documentSeries: String(row.documentSeries || '').trim().toUpperCase(),
        documentSequence: Math.max(0, Math.trunc(Number(row.documentSequence) || 0)),
        documentLineNo: Math.max(0, Math.trunc(Number(row.documentLineNo) || 0)),
        previousStockResponsibilityCenter: String(row.previousStockResponsibilityCenter || '').trim().toUpperCase(),
        stockResponsibilityCenter: String(row.stockResponsibilityCenter || '').trim().toUpperCase(),
        customerResponsibilityCenter: String(row.customerResponsibilityCenter || '').trim().toUpperCase(),
      },
    };

    await this.logUcarerOperation({
      operationType: 'MARK_TOPLU',
      title: result.alreadyToplu ? 'Satir zaten TOPLU olarak isaretli' : 'Satis satiri TOPLU yapildi',
      productCode: result.line.productCode,
      documentNo: `${result.line.documentSeries}-${result.line.documentSequence}`,
      previousValues: {
        stockResponsibilityCenter: result.line.previousStockResponsibilityCenter || null,
      },
      newValues: {
        stockResponsibilityCenter: result.line.stockResponsibilityCenter || null,
      },
      metadata: {
        lineGuid: result.line.lineGuid,
        documentLineNo: result.line.documentLineNo,
        customerResponsibilityCenter: result.line.customerResponsibilityCenter || null,
        alreadyToplu: result.alreadyToplu,
      },
      userId: input.userId || null,
    });

    return result;
  }

  async getUcarerProductPurchaseHistory(productCodeInput: string): Promise<{
    productCode: string;
    rows: Array<{
      customerCode: string;
      customerName: string;
      documentSeries: string;
      documentSequence: number;
      documentLineNo: number;
      saleDate: string | null;
      quantity: number;
      unitPrice: number;
      totalAmount: number;
    }>;
    total: number;
    summary: {
      totalQuantity: number;
      totalAmount: number;
      averageUnitPrice: number;
    };
    metadata: {
      lookbackMonths: number;
    };
  }> {
    const lookbackMonths = 4;
    const productCode = String(productCodeInput || '').trim().toUpperCase();
    if (!productCode) {
      throw new AppError('Stok kodu zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }

    const escapedCode = productCode.replace(/'/g, "''");
    const baseConditions = [
      'sth.sth_tip = 0',
      'ISNULL(sth.sth_cins, 0) IN (0, 1)',
      'sth.sth_evraktip IN (3, 13)',
      '(sth.sth_iptal = 0 OR sth.sth_iptal IS NULL)',
      '(sth.sth_normal_iade = 0 OR sth.sth_normal_iade IS NULL)',
      "ISNULL(sth.sth_fat_uid, '00000000-0000-0000-0000-000000000000') <> '00000000-0000-0000-0000-000000000000'",
      'sth.sth_stok_kod IS NOT NULL',
      "LTRIM(RTRIM(sth.sth_stok_kod)) <> ''",
      'sth.sth_cari_kodu IS NOT NULL',
      "LTRIM(RTRIM(sth.sth_cari_kodu)) <> ''",
    ];
    const exclusionConditions = await exclusionService.buildStokHareketleriExclusionConditions();
    const whereClause = [
      ...baseConditions,
      ...exclusionConditions,
      `LTRIM(RTRIM(sth.sth_stok_kod)) = '${escapedCode}'`,
      `sth.sth_tarih >= DATEADD(MONTH, -${lookbackMonths}, CAST(GETDATE() AS date))`,
      'ISNULL(sth.sth_miktar, 0) > 0',
    ].join(' AND ');

    const rawRows = await mikroService.executeQuery(`
      SELECT TOP 1500
        RTRIM(sth.sth_cari_kodu) as customerCode,
        LTRIM(RTRIM(ISNULL(ch.cari_unvan1, ''))) as customerName,
        RTRIM(ISNULL(sth.sth_evrakno_seri, '')) as documentSeries,
        CAST(ISNULL(sth.sth_evrakno_sira, 0) AS INT) as documentSequence,
        CAST(ISNULL(sth.sth_satirno, 0) AS INT) as documentLineNo,
        sth.sth_tarih as saleDate,
        CAST(ISNULL(sth.sth_miktar, 0) AS FLOAT) as quantity,
        CAST(
          CASE
            WHEN ISNULL(sth.sth_miktar, 0) = 0 THEN 0
            ELSE ISNULL(sth.sth_tutar, 0) / NULLIF(sth.sth_miktar, 0)
          END
        AS FLOAT) as unitPrice,
        CAST(ISNULL(sth.sth_tutar, 0) AS FLOAT) as totalAmount
      FROM STOK_HAREKETLERI sth WITH (NOLOCK)
      LEFT JOIN CARI_HESAPLAR ch WITH (NOLOCK) ON ch.cari_kod = sth.sth_cari_kodu
      WHERE ${whereClause}
      ORDER BY sth.sth_tarih DESC, sth.sth_evrakno_sira DESC, sth.sth_satirno DESC
    `);

    const rows = (Array.isArray(rawRows) ? rawRows : []).map((row: any) => {
      const parsedDate = row?.saleDate ? new Date(row.saleDate) : null;
      const saleDate = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null;
      const quantity = Number(row?.quantity) || 0;
      const unitPrice = Number(row?.unitPrice) || 0;
      const totalAmount = Number(row?.totalAmount) || 0;
      return {
        customerCode: String(row?.customerCode || '').trim().toUpperCase(),
        customerName: String(row?.customerName || '').trim() || String(row?.customerCode || '').trim().toUpperCase() || '-',
        documentSeries: String(row?.documentSeries || '').trim().toUpperCase(),
        documentSequence: Math.max(0, Math.trunc(Number(row?.documentSequence) || 0)),
        documentLineNo: Math.max(0, Math.trunc(Number(row?.documentLineNo) || 0)),
        saleDate,
        quantity: Number.isFinite(quantity) ? quantity : 0,
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
        totalAmount: Number.isFinite(totalAmount) ? totalAmount : 0,
      };
    });

    const totalQuantity = rows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
    const totalAmount = rows.reduce((sum, row) => sum + (Number(row.totalAmount) || 0), 0);
    const averageUnitPrice = totalQuantity > 0 ? totalAmount / totalQuantity : 0;

    return {
      productCode,
      rows,
      total: rows.length,
      summary: {
        totalQuantity,
        totalAmount,
        averageUnitPrice,
      },
      metadata: {
        lookbackMonths,
      },
    };
  }

  async runUcarerMinMaxReport(options: { userId?: string | null } = {}): Promise<{
    rows: Record<string, any>[];
    columns: string[];
    total: number;
  }> {
    await mikroService.connect();
    const request = mikroService.pool!.request();
    (request as any).timeout = Number(process.env.UCARER_MINMAX_TIMEOUT_MS || 300000);
    const queryResult = await request.query('exec [FEBG_MinMaxHesaplaRES]');
    const rows = queryResult.recordset;
    const normalizedRows = Array.isArray(rows) ? rows : [];
    const columns = normalizedRows.length > 0 ? Object.keys(normalizedRows[0] || {}) : [];

    const result = {
      rows: normalizedRows,
      columns,
      total: normalizedRows.length,
    };

    await this.logUcarerOperation({
      operationType: 'MINMAX_RUN',
      title: 'MinMax hesaplama calistirildi',
      metadata: {
        total: result.total,
        columns: result.columns,
      },
      userId: options.userId || null,
    });

    return result;
  }

  async startUcarerMinMaxJob(options: { userId?: string | null } = {}): Promise<UcarerMinMaxJobState> {
    if (this.ucarerMinMaxJob?.status === 'RUNNING') {
      return this.ucarerMinMaxJob;
    }

    const job: UcarerMinMaxJobState = {
      id: randomUUID(),
      status: 'RUNNING',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      requestedById: options.userId || null,
      data: null,
      error: null,
    };
    this.ucarerMinMaxJob = job;

    this.runUcarerMinMaxReport({ userId: options.userId || null })
      .then((data) => {
        this.ucarerMinMaxJob = {
          ...job,
          status: 'COMPLETED',
          finishedAt: new Date().toISOString(),
          data,
          error: null,
        };
      })
      .catch((error) => {
        console.error('Ucarer MinMax background job failed:', error);
        this.ucarerMinMaxJob = {
          ...job,
          status: 'FAILED',
          finishedAt: new Date().toISOString(),
          data: null,
          error: this.normalizeMikroErrorMessage(error, 'MinMax hesaplama tamamlanamadi. Mikro baglantisi zaman asimina ugradi.'),
        };
      });

    return job;
  }

  getUcarerMinMaxJobStatus(jobId?: string | null): UcarerMinMaxJobState | null {
    if (!this.ucarerMinMaxJob) {
      return null;
    }
    if (jobId && this.ucarerMinMaxJob.id !== jobId) {
      return null;
    }
    return this.ucarerMinMaxJob;
  }

  async setUcarerMinMaxExclusion(input: {
    productCode: string;
    exclude: boolean;
    resetMinMaxValues?: boolean;
    depot?: 'MERKEZ' | 'TOPCA';
    userId?: string | null;
  }): Promise<{
    productCode: string;
    excluded: boolean;
    stoModelKodu: string | null;
  }> {
    const productCode = String(input.productCode || '').trim().toUpperCase();
    const exclude = Boolean(input.exclude);
    const resetMinMaxValues = Boolean(input.resetMinMaxValues);
    const depot = input.depot === 'TOPCA' ? 'TOPCA' : 'MERKEZ';

    if (!productCode) {
      throw new AppError('Stok kodu zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }

    const escapedCode = productCode.replace(/'/g, "''");
    const existsRows = await mikroService.executeQuery(`
      SELECT TOP 1 sto_kod
      FROM STOKLAR
      WHERE sto_kod = '${escapedCode}'
    `);
    if (!Array.isArray(existsRows) || existsRows.length === 0) {
      throw new AppError('Stok bulunamadi.', 404, ErrorCode.NOT_FOUND);
    }

    if (exclude) {
      await mikroService.executeQuery(`
        UPDATE STOKLAR
        SET sto_model_kodu = 'HAYIR'
        WHERE sto_kod = '${escapedCode}'
      `);

      if (resetMinMaxValues) {
        const targetTable = depot === 'TOPCA' ? 'DEPO_TOPCA_DURUM' : 'DEPO_MERKEZ_DURUM';
        const quoteIdentifier = (identifier: string) => `[${String(identifier || '').replace(/]/g, ']]')}]`;
        let resetApplied = false;
        const depotNo = depot === 'TOPCA' ? 6 : 1;

        try {
          await mikroService.executeQuery(`
            UPDATE STOK_DEPO_DETAYLARI
            SET sdp_min_stok = 0,
                sdp_max_stok = 0
            WHERE LTRIM(RTRIM(sdp_depo_kod)) = '${escapedCode}'
              AND sdp_depo_no = ${depotNo}
          `);
          const verifyRows = await mikroService.executeQuery(`
            SELECT COUNT(1) AS rowCount
            FROM STOK_DEPO_DETAYLARI
            WHERE LTRIM(RTRIM(sdp_depo_kod)) = '${escapedCode}'
              AND sdp_depo_no = ${depotNo}
              AND ISNULL(sdp_min_stok, 0) = 0
              AND ISNULL(sdp_max_stok, 0) = 0
          `);
          const rowCount = Number(verifyRows?.[0]?.rowCount || 0);
          if (Number.isFinite(rowCount) && rowCount > 0) {
            resetApplied = true;
          }
        } catch {
          // continue to legacy fallback logic
        }

        try {
          const sampleRows = await mikroService.executeQuery(`SELECT TOP 1 * FROM ${targetTable}`);
          const sampleRow = Array.isArray(sampleRows) && sampleRows.length > 0 ? (sampleRows[0] as Record<string, any>) : {};
          const allColumns = Object.keys(sampleRow);
          const stockCodeColumn = allColumns.find((column) =>
            normalizeKeyToken(column).includes(normalizeKeyToken('stok kodu'))
          );
          const minColumn = allColumns.find((column) =>
            normalizeKeyToken(column).includes(normalizeKeyToken('minimum miktar'))
          );
          const maxColumn = allColumns.find((column) =>
            normalizeKeyToken(column).includes(normalizeKeyToken('maximum miktar'))
          );
          if (stockCodeColumn && minColumn && maxColumn) {
            await mikroService.executeQuery(`
              UPDATE ${targetTable}
              SET ${quoteIdentifier(minColumn)} = 0,
                  ${quoteIdentifier(maxColumn)} = 0
            WHERE LTRIM(RTRIM(CONVERT(NVARCHAR(100), ${quoteIdentifier(stockCodeColumn)}))) = '${escapedCode}'
          `);
          resetApplied = true;
          }
        } catch {
          // fallback updates below
        }

        const readColumns = async (tableName: string) => {
          const rows = await mikroService.executeQuery(`
            SELECT COLUMN_NAME AS columnName
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = '${tableName}'
          `);
          return (Array.isArray(rows) ? rows : [])
            .map((row: any) => String(row?.columnName || '').trim())
            .filter(Boolean);
        };
        const pickMinMaxColumns = (columns: string[], preferTopca: boolean) => {
          const normalized = columns.map((column) => ({
            column,
            key: normalizeKeyToken(column),
          }));
          const minCandidates = normalized.filter((item) =>
            item.key.includes('min') || item.key.includes('minimum')
          );
          const maxCandidates = normalized.filter((item) =>
            item.key.includes('max') || item.key.includes('maximum')
          );
          const score = (key: string, wantTopca: boolean, isMin: boolean) => {
            let total = 0;
            if (wantTopca && key.includes('topca')) total += 5;
            if (!wantTopca && key.includes('topca')) total -= 3;
            if (wantTopca && key.includes('merkez')) total -= 1;
            if (!wantTopca && key.includes('merkez')) total += 3;
            if (isMin && key.includes('min')) total += 2;
            if (!isMin && key.includes('max')) total += 2;
            if (key.startsWith('sto_')) total += 1;
            return total;
          };
          const minColumn = minCandidates
            .sort((a, b) => score(b.key, preferTopca, true) - score(a.key, preferTopca, true))[0]?.column;
          const maxColumn = maxCandidates
            .sort((a, b) => score(b.key, preferTopca, false) - score(a.key, preferTopca, false))[0]?.column;
          return { minColumn, maxColumn };
        };

        if (!resetApplied) {
          try {
            const stoklarColumns = await readColumns('STOKLAR');
            const picked = pickMinMaxColumns(stoklarColumns, false);
            if (picked.minColumn && picked.maxColumn) {
              await mikroService.executeQuery(`
                UPDATE STOKLAR
                SET ${quoteIdentifier(picked.minColumn)} = 0,
                    ${quoteIdentifier(picked.maxColumn)} = 0
                WHERE LTRIM(RTRIM(sto_kod)) = '${escapedCode}'
              `);
              resetApplied = true;
            }
          } catch {
            // continue
          }
        }

        if (!resetApplied) {
          try {
            const stoklarUserColumns = await readColumns('STOKLAR_USER');
            const picked = pickMinMaxColumns(stoklarUserColumns, depot === 'TOPCA');
            if (picked.minColumn && picked.maxColumn) {
              await mikroService.executeQuery(`
                UPDATE STOKLAR_USER
                SET ${quoteIdentifier(picked.minColumn)} = 0,
                    ${quoteIdentifier(picked.maxColumn)} = 0
                WHERE LTRIM(RTRIM(sto_kod)) = '${escapedCode}'
              `);
              resetApplied = true;
            }
          } catch {
            // continue
          }
        }

        if (!resetApplied) {
          throw new AppError('0-0 minmax alanlari bulunamadi veya guncellenemedi.', 400, ErrorCode.BAD_REQUEST);
        }
      }
    } else {
      await mikroService.executeQuery(`
        UPDATE STOKLAR
        SET sto_model_kodu =
          CASE
            WHEN UPPER(LTRIM(RTRIM(ISNULL(sto_model_kodu, '')))) = 'HAYIR' THEN ''
            ELSE sto_model_kodu
          END
        WHERE sto_kod = '${escapedCode}'
      `);
    }

    const resultRows = await mikroService.executeQuery(`
      SELECT TOP 1 LTRIM(RTRIM(ISNULL(sto_model_kodu, ''))) AS stoModelKodu
      FROM STOKLAR
      WHERE sto_kod = '${escapedCode}'
    `);
    const stoModelKoduRaw = String(resultRows?.[0]?.stoModelKodu || '').trim();
    const normalizedStoModelKodu = stoModelKoduRaw || null;
    const excluded = String(normalizedStoModelKodu || '').toUpperCase() === 'HAYIR';

    const product = await prisma.product.findFirst({
      where: { mikroCode: productCode },
      select: { name: true },
    });

    const result = {
      productCode,
      excluded,
      stoModelKodu: normalizedStoModelKodu,
    };

    await this.logUcarerOperation({
      operationType: 'MINMAX_EXCLUSION',
      title: excluded ? 'Stok MinMax hesaplamasindan cikarildi' : 'Stok MinMax hesaplamasina dahil edildi',
      productCode,
      productName: product?.name || null,
      depot,
      previousValues: {
        requestedExclude: exclude,
      },
      newValues: {
        excluded,
        stoModelKodu: normalizedStoModelKodu,
      },
      metadata: {
        resetMinMaxValues,
      },
      userId: input.userId || null,
    });

    return result;
  }

  async getUcarerMinMaxExcludedProductsReport(): Promise<{
    rows: Array<{
      productCode: string;
      productName: string;
      stoModelKodu: string;
      distinctCustomersLast1Month: number;
      distinctCustomersLast2Months: number;
      distinctCustomersLast3Months: number;
      hasMultiCustomerSalesLast2Months: boolean;
    }>;
    total: number;
  }> {
    const rows = await mikroService.executeQuery(`
      WITH ExcludedProducts AS (
        SELECT
          s.sto_kod AS productCode,
          LTRIM(RTRIM(ISNULL(s.sto_isim, ''))) AS productName,
          LTRIM(RTRIM(ISNULL(s.sto_model_kodu, ''))) AS stoModelKodu
        FROM STOKLAR s
        WHERE UPPER(LTRIM(RTRIM(ISNULL(s.sto_model_kodu, '')))) = 'HAYIR'
      ),
      SalesAgg AS (
        SELECT
          sth.sth_stok_kod AS productCode,
          COUNT(DISTINCT CASE
            WHEN sth.sth_tarih >= DATEADD(MONTH, -1, CAST(GETDATE() AS date))
            THEN LTRIM(RTRIM(ISNULL(sth.sth_cari_kodu, '')))
            ELSE NULL
          END) AS distinctCustomersLast1Month,
          COUNT(DISTINCT CASE
            WHEN sth.sth_tarih >= DATEADD(MONTH, -2, CAST(GETDATE() AS date))
            THEN LTRIM(RTRIM(ISNULL(sth.sth_cari_kodu, '')))
            ELSE NULL
          END) AS distinctCustomersLast2Months,
          COUNT(DISTINCT CASE
            WHEN sth.sth_tarih >= DATEADD(MONTH, -3, CAST(GETDATE() AS date))
            THEN LTRIM(RTRIM(ISNULL(sth.sth_cari_kodu, '')))
            ELSE NULL
          END) AS distinctCustomersLast3Months
        FROM STOK_HAREKETLERI sth
        INNER JOIN ExcludedProducts ep
          ON ep.productCode = sth.sth_stok_kod
        WHERE sth.sth_cins = 0
          AND sth.sth_tip = 1
          AND LTRIM(RTRIM(ISNULL(sth.sth_cari_kodu, ''))) <> ''
          AND sth.sth_tarih >= DATEADD(MONTH, -3, CAST(GETDATE() AS date))
        GROUP BY sth.sth_stok_kod
      )
      SELECT
        ep.productCode,
        ep.productName,
        ep.stoModelKodu,
        ISNULL(x.distinctCustomersLast1Month, 0) AS distinctCustomersLast1Month,
        ISNULL(x.distinctCustomersLast2Months, 0) AS distinctCustomersLast2Months,
        ISNULL(x.distinctCustomersLast3Months, 0) AS distinctCustomersLast3Months
      FROM ExcludedProducts ep
      LEFT JOIN SalesAgg x
        ON x.productCode = ep.productCode
      ORDER BY
        ISNULL(x.distinctCustomersLast2Months, 0) DESC,
        ISNULL(x.distinctCustomersLast1Month, 0) DESC,
        ep.productCode ASC
    `);

    const normalizedRows = (Array.isArray(rows) ? rows : []).map((row: any) => {
      const distinctCustomersLast1Month = Number(row?.distinctCustomersLast1Month || 0);
      const distinctCustomersLast2Months = Number(row?.distinctCustomersLast2Months || 0);
      const distinctCustomersLast3Months = Number(row?.distinctCustomersLast3Months || 0);
      return {
        productCode: String(row?.productCode || '').trim().toUpperCase(),
        productName: String(row?.productName || '').trim(),
        stoModelKodu: String(row?.stoModelKodu || '').trim(),
        distinctCustomersLast1Month: Number.isFinite(distinctCustomersLast1Month) ? distinctCustomersLast1Month : 0,
        distinctCustomersLast2Months: Number.isFinite(distinctCustomersLast2Months) ? distinctCustomersLast2Months : 0,
        distinctCustomersLast3Months: Number.isFinite(distinctCustomersLast3Months) ? distinctCustomersLast3Months : 0,
        hasMultiCustomerSalesLast2Months: Number.isFinite(distinctCustomersLast2Months) && distinctCustomersLast2Months > 1,
      };
    });

    return {
      rows: normalizedRows,
      total: normalizedRows.length,
    };
  }

  async getProductFamilies(): Promise<Array<{
    id: string;
    name: string;
    code: string | null;
    note: string | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    items: Array<{
      id: string;
      productCode: string;
      productName: string | null;
      supplierName: string | null;
      priority: number;
      active: boolean;
    }>;
  }>> {
    const rows = await prisma.productFamily.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: {
        items: {
          orderBy: [{ priority: 'asc' }, { productCode: 'asc' }],
        },
      },
    });

    const allProductCodes = Array.from(
      new Set(
        rows
          .flatMap((row) => row.items.map((item) => String(item.productCode || '').trim().toUpperCase()))
          .filter(Boolean)
      )
    );

    const supplierNameByProductCode = new Map<string, string>();
    if (allProductCodes.length > 0) {
      const inClause = allProductCodes.map((code) => `'${code.replace(/'/g, "''")}'`).join(',');
      const supplierRows = await mikroService.executeQuery(`
        SELECT
          s.sto_kod AS productCode,
          LTRIM(RTRIM(ISNULL(s.sto_sat_cari_kod, ''))) AS supplierCode,
          c.cari_unvan1 AS supplierName
        FROM STOKLAR s
        LEFT JOIN CARI_HESAPLAR c
          ON c.cari_kod = LTRIM(RTRIM(ISNULL(s.sto_sat_cari_kod, '')))
        WHERE s.sto_kod IN (${inClause})
      `);
      (supplierRows || []).forEach((row: any) => {
        const productCode = String(row?.productCode || '').trim().toUpperCase();
        const supplierName = String(row?.supplierName || '').trim();
        if (productCode) {
          supplierNameByProductCode.set(productCode, supplierName || '');
        }
      });
    }

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code || null,
      note: row.note || null,
      active: row.active,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      items: row.items.map((item) => ({
        id: item.id,
        productCode: item.productCode,
        productName: item.productName || null,
        supplierName: supplierNameByProductCode.get(String(item.productCode || '').trim().toUpperCase()) || null,
        priority: item.priority,
        active: item.active,
      })),
    }));
  }

  async upsertProductFamily(input: {
    id?: string;
    name: string;
    code?: string | null;
    note?: string | null;
    active?: boolean;
    productCodes: string[];
    userId?: string | null;
  }): Promise<{ id: string }> {
    const name = String(input.name || '').trim();
    if (!name) {
      throw new AppError('Aile adi zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }

    const normalizedCodes = Array.from(
      new Set(
        (input.productCodes || [])
          .map((code) => String(code || '').trim().toUpperCase())
          .filter(Boolean)
      )
    );

    if (normalizedCodes.length === 0) {
      throw new AppError('En az bir stok kodu girilmelidir.', 400, ErrorCode.BAD_REQUEST);
    }

    const products = await prisma.product.findMany({
      where: { mikroCode: { in: normalizedCodes } },
      select: { id: true, mikroCode: true, name: true },
    });
    const productMap = new Map(products.map((row) => [row.mikroCode.toUpperCase(), row]));
    const previousFamily = input.id
      ? await prisma.productFamily.findUnique({
          where: { id: input.id },
          include: { items: { orderBy: [{ priority: 'asc' }, { productCode: 'asc' }] } },
        })
      : null;

    const payload = {
      name,
      code: input.code ? String(input.code).trim().toUpperCase() : null,
      note: input.note ? String(input.note).trim() : null,
      active: input.active !== false,
    };

    const familyId = input.id
      ? (
          await prisma.productFamily.update({
            where: { id: input.id },
            data: payload,
            select: { id: true },
          })
        ).id
      : (
          await prisma.productFamily.create({
            data: payload,
            select: { id: true },
          })
        ).id;

    await prisma.$transaction(async (tx) => {
      await tx.productFamilyItem.deleteMany({ where: { familyId } });
      if (normalizedCodes.length === 0) return;
      await tx.productFamilyItem.createMany({
        data: normalizedCodes.map((code, index) => ({
          familyId,
          productCode: code,
          productId: productMap.get(code)?.id || null,
          productName: productMap.get(code)?.name || null,
          priority: index + 1,
          active: true,
        })),
      });
    });

    await this.logUcarerOperation({
      operationType: previousFamily ? 'PRODUCT_FAMILY_UPDATE' : 'PRODUCT_FAMILY_CREATE',
      title: previousFamily ? 'Stok ailesi guncellendi' : 'Stok ailesi olusturuldu',
      familyId,
      familyName: name,
      previousValues: previousFamily
        ? {
            name: previousFamily.name,
            code: previousFamily.code,
            note: previousFamily.note,
            active: previousFamily.active,
            productCodes: previousFamily.items.map((item) => item.productCode),
          }
        : null,
      newValues: {
        name,
        code: payload.code,
        note: payload.note,
        active: payload.active,
        productCodes: normalizedCodes,
      },
      metadata: {
        productCount: normalizedCodes.length,
      },
      userId: input.userId || null,
    });

    return { id: familyId };
  }

  async deleteProductFamily(id: string, userId?: string | null): Promise<void> {
    const previousFamily = await prisma.productFamily.findUnique({
      where: { id },
      include: { items: { orderBy: [{ priority: 'asc' }, { productCode: 'asc' }] } },
    });
    await prisma.productFamily.delete({
      where: { id },
    });

    await this.logUcarerOperation({
      operationType: 'PRODUCT_FAMILY_DELETE',
      title: 'Stok ailesi silindi',
      familyId: id,
      familyName: previousFamily?.name || null,
      previousValues: previousFamily
        ? {
            name: previousFamily.name,
            code: previousFamily.code,
            note: previousFamily.note,
            active: previousFamily.active,
            productCodes: previousFamily.items.map((item) => item.productCode),
          }
        : null,
      metadata: {
        productCount: previousFamily?.items.length || 0,
      },
      userId: userId || null,
    });
  }

  async getPriceFamilies(): Promise<Array<{
    id: string;
    name: string;
    code: string | null;
    note: string | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    items: Array<{
      id: string;
      productCode: string;
      productName: string | null;
      currentCost: number | null;
      currentCostDate: Date | null;
      lastEntryPrice: number | null;
      lastEntryDate: Date | null;
      vatRate: number;
      priority: number;
      active: boolean;
    }>;
  }>> {
    const rows = await prisma.priceFamily.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: {
        items: {
          orderBy: [{ priority: 'asc' }, { productCode: 'asc' }],
          include: {
            product: {
              select: {
                mikroCode: true,
                name: true,
                currentCost: true,
                currentCostDate: true,
                lastEntryPrice: true,
                lastEntryDate: true,
                vatRate: true,
              },
            },
          },
        },
      },
    });

    const productCodes = Array.from(
      new Set(
        rows
          .flatMap((row) => row.items.map((item) => String(item.productCode || '').trim().toUpperCase()))
          .filter(Boolean)
      )
    );
    const fallbackProducts = productCodes.length
      ? await prisma.product.findMany({
          where: { mikroCode: { in: productCodes } },
          select: {
            mikroCode: true,
            name: true,
            currentCost: true,
            currentCostDate: true,
            lastEntryPrice: true,
            lastEntryDate: true,
            vatRate: true,
          },
        })
      : [];
    const fallbackProductMap = new Map(fallbackProducts.map((product) => [product.mikroCode.toUpperCase(), product]));

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code || null,
      note: row.note || null,
      active: row.active,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      items: row.items.map((item) => {
        const code = String(item.productCode || '').trim().toUpperCase();
        const product = item.product || fallbackProductMap.get(code) || null;
        return {
          id: item.id,
          productCode: code,
          productName: product?.name || item.productName || null,
          currentCost: product?.currentCost ?? null,
          currentCostDate: product?.currentCostDate ?? null,
          lastEntryPrice: product?.lastEntryPrice ?? null,
          lastEntryDate: product?.lastEntryDate ?? null,
          vatRate: Number(product?.vatRate || 0),
          priority: item.priority,
          active: item.active,
        };
      }),
    }));
  }

  async upsertPriceFamily(input: {
    id?: string;
    name: string;
    code?: string | null;
    note?: string | null;
    active?: boolean;
    productCodes: string[];
  }): Promise<{ id: string }> {
    const name = String(input.name || '').trim();
    if (!name) {
      throw new AppError('Fiyat ailesi adi zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }

    const normalizedCodes = Array.from(
      new Set(
        (input.productCodes || [])
          .map((code) => String(code || '').trim().toUpperCase())
          .filter(Boolean)
      )
    );

    if (normalizedCodes.length === 0) {
      throw new AppError('En az bir stok kodu girilmelidir.', 400, ErrorCode.BAD_REQUEST);
    }

    const existingFamily = input.id
      ? await prisma.priceFamily.findUnique({ where: { id: input.id }, select: { id: true } })
      : null;
    if (input.id && !existingFamily) {
      throw new AppError('Fiyat ailesi bulunamadi.', 404, ErrorCode.NOT_FOUND);
    }

    const normalizedFamilyCode = input.code ? String(input.code).trim().toUpperCase() : null;
    if (normalizedFamilyCode) {
      const codeOwner = await prisma.priceFamily.findFirst({
        where: {
          code: normalizedFamilyCode,
          ...(input.id ? { id: { not: input.id } } : {}),
        },
        select: { name: true },
      });
      if (codeOwner) {
        throw new AppError(`Bu fiyat ailesi kodu zaten kullaniliyor: ${codeOwner.name}`, 400, ErrorCode.BAD_REQUEST);
      }
    }

    const duplicateItems = await prisma.priceFamilyItem.findMany({
      where: {
        productCode: { in: normalizedCodes },
        ...(input.id ? { familyId: { not: input.id } } : {}),
      },
      include: {
        family: { select: { name: true } },
      },
      orderBy: [{ productCode: 'asc' }],
    });
    if (duplicateItems.length > 0) {
      const conflicts = duplicateItems
        .slice(0, 8)
        .map((item) => `${item.productCode} (${item.family?.name || 'baska aile'})`)
        .join(', ');
      throw new AppError(
        `Her stok sadece bir fiyat ailesinde olabilir. Cakisan stoklar: ${conflicts}`,
        400,
        ErrorCode.BAD_REQUEST
      );
    }

    const products = await prisma.product.findMany({
      where: { mikroCode: { in: normalizedCodes } },
      select: { id: true, mikroCode: true, name: true },
    });
    const productMap = new Map(products.map((row) => [row.mikroCode.toUpperCase(), row]));

    const payload = {
      name,
      code: normalizedFamilyCode,
      note: input.note ? String(input.note).trim() : null,
      active: input.active !== false,
    };

    const familyId = input.id
      ? (
          await prisma.priceFamily.update({
            where: { id: input.id },
            data: payload,
            select: { id: true },
          })
        ).id
      : (
          await prisma.priceFamily.create({
            data: payload,
            select: { id: true },
          })
        ).id;

    await prisma.$transaction(async (tx) => {
      await tx.priceFamilyItem.deleteMany({ where: { familyId } });
      await tx.priceFamilyItem.createMany({
        data: normalizedCodes.map((code, index) => ({
          familyId,
          productCode: code,
          productId: productMap.get(code)?.id || null,
          productName: productMap.get(code)?.name || null,
          priority: index + 1,
          active: true,
        })),
      });
    });

    return { id: familyId };
  }

  async deletePriceFamily(id: string): Promise<void> {
    await prisma.priceFamily.delete({
      where: { id },
    });
  }

  async getPriceFamilyCostReport(options?: {
    status?: 'all' | 'problem' | 'ok';
    search?: string;
    includeInactive?: boolean;
  }): Promise<{
    families: Array<{
      id: string;
      name: string;
      code: string | null;
      note: string | null;
      active: boolean;
      status: 'problem' | 'ok';
      itemCount: number;
      outdatedCount: number;
      missingCostDateCount: number;
      latestCostDate: string | null;
      oldestCostDate: string | null;
      dateGroups: Array<{ date: string | null; count: number; productCodes: string[] }>;
      items: Array<{
        id: string;
        productCode: string;
        productName: string | null;
        currentCost: number | null;
        currentCostDate: string | null;
        lastEntryPrice: number | null;
        lastEntryDate: string | null;
        vatRate: number;
        issueType: 'ok' | 'outdated' | 'missing-date';
        daysBehind: number | null;
      }>;
      recentLogs: Array<{
        id: string;
        productCode: string;
        productName: string | null;
        previousCost: number | null;
        newCost: number;
        previousCostDate: string | null;
        newCostDate: string;
        updatePriceLists: boolean;
        userId: string | null;
        createdAt: string;
      }>;
    }>;
    summary: {
      totalFamilies: number;
      problemFamilies: number;
      okFamilies: number;
      inactiveFamilies: number;
      productCount: number;
      outdatedProductCount: number;
      missingCostDateCount: number;
    };
  }> {
    const status = options?.status === 'all' || options?.status === 'ok' ? options.status : 'problem';
    const searchTokens = buildSearchTokens(options?.search || '');
    const includeInactive = Boolean(options?.includeInactive);
    const reportTimeZone = config.cronTimezone || 'Europe/Istanbul';

    const families = await prisma.priceFamily.findMany({
      where: includeInactive ? undefined : { active: true },
      include: {
        items: {
          where: { active: true },
          orderBy: [{ priority: 'asc' }, { productCode: 'asc' }],
        },
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });

    const productCodes = Array.from(
      new Set(
        families
          .flatMap((family) => family.items.map((item) => String(item.productCode || '').trim().toUpperCase()))
          .filter(Boolean)
      )
    );
    const products = productCodes.length
      ? await prisma.product.findMany({
          where: { mikroCode: { in: productCodes } },
          select: {
            id: true,
            mikroCode: true,
            name: true,
            currentCost: true,
            currentCostDate: true,
            lastEntryPrice: true,
            lastEntryDate: true,
            vatRate: true,
          },
        })
      : [];
    const productMap = new Map(products.map((product) => [product.mikroCode.toUpperCase(), product]));

    const logs = families.length
      ? await prisma.priceFamilyCostUpdateLog.findMany({
          where: { familyId: { in: families.map((family) => family.id) } },
          orderBy: [{ createdAt: 'desc' }],
          take: Math.min(500, Math.max(100, families.length * 8)),
        })
      : [];
    const logsByFamilyId = new Map<string, typeof logs>();
    logs.forEach((log) => {
      if (!log.familyId) return;
      const list = logsByFamilyId.get(log.familyId) || [];
      if (list.length < 5) list.push(log);
      logsByFamilyId.set(log.familyId, list);
    });

    const diffDays = (leftKey: string | null, rightKey: string | null): number | null => {
      if (!leftKey || !rightKey) return null;
      const left = parseDateKeyToUtcDate(leftKey);
      const right = parseDateKeyToUtcDate(rightKey);
      if (!left || !right) return null;
      return Math.max(0, Math.round((right.getTime() - left.getTime()) / (1000 * 60 * 60 * 24)));
    };

    const dateToKey = (value: Date | null | undefined): string | null =>
      value ? formatDateKeyInTimeZone(value, reportTimeZone) : null;

    const allRows = families.map((family) => {
      const itemBasics = family.items.map((item) => {
        const productCode = String(item.productCode || '').trim().toUpperCase();
        const product = productMap.get(productCode) || null;
        const currentCostDate = dateToKey(product?.currentCostDate || null);
        const lastEntryDate = dateToKey(product?.lastEntryDate || null);
        return {
          id: item.id,
          productCode,
          productName: product?.name || item.productName || null,
          currentCost: product?.currentCost ?? null,
          currentCostDate,
          lastEntryPrice: product?.lastEntryPrice ?? null,
          lastEntryDate,
          vatRate: Number(product?.vatRate || 0),
        };
      });

      const presentDateKeys = Array.from(
        new Set(itemBasics.map((item) => item.currentCostDate).filter(Boolean) as string[])
      ).sort();
      const latestCostDate = presentDateKeys.length > 0 ? presentDateKeys[presentDateKeys.length - 1] : null;
      const oldestCostDate = presentDateKeys.length > 0 ? presentDateKeys[0] : null;

      const items = itemBasics.map((item) => {
        const issueType: 'ok' | 'outdated' | 'missing-date' = !item.currentCostDate
          ? 'missing-date'
          : latestCostDate && item.currentCostDate !== latestCostDate
          ? 'outdated'
          : 'ok';
        return {
          ...item,
          issueType,
          daysBehind: issueType === 'outdated' ? diffDays(item.currentCostDate, latestCostDate) : null,
        };
      });

      const missingCostDateCount = items.filter((item) => item.issueType === 'missing-date').length;
      const outdatedCount = items.filter((item) => item.issueType !== 'ok').length;
      const rowStatus: 'problem' | 'ok' =
        missingCostDateCount > 0 || presentDateKeys.length > 1 ? 'problem' : 'ok';
      const dateGroupMap = new Map<string, { date: string | null; count: number; productCodes: string[] }>();
      itemBasics.forEach((item) => {
        const key = item.currentCostDate || '__missing__';
        const group = dateGroupMap.get(key) || {
          date: item.currentCostDate,
          count: 0,
          productCodes: [],
        };
        group.count += 1;
        if (group.productCodes.length < 12) group.productCodes.push(item.productCode);
        dateGroupMap.set(key, group);
      });

      const familyLogs = (logsByFamilyId.get(family.id) || []).map((log) => ({
        id: log.id,
        productCode: log.productCode,
        productName: log.productName || null,
        previousCost: log.previousCost ?? null,
        newCost: Number(log.newCost || 0),
        previousCostDate: log.previousCostDate ? dateToKey(log.previousCostDate) : null,
        newCostDate: dateToKey(log.newCostDate) || formatDateKeyInTimeZone(log.newCostDate, reportTimeZone),
        updatePriceLists: log.updatePriceLists,
        userId: log.userId || null,
        createdAt: log.createdAt.toISOString(),
      }));

      return {
        id: family.id,
        name: family.name,
        code: family.code || null,
        note: family.note || null,
        active: family.active,
        status: rowStatus,
        itemCount: items.length,
        outdatedCount,
        missingCostDateCount,
        latestCostDate,
        oldestCostDate,
        dateGroups: Array.from(dateGroupMap.values()).sort((a, b) => {
          if (a.date === b.date) return 0;
          if (!a.date) return -1;
          if (!b.date) return 1;
          return b.date.localeCompare(a.date);
        }),
        items: items.sort((a, b) => {
          const rank = { 'missing-date': 0, outdated: 1, ok: 2 } as const;
          if (rank[a.issueType] !== rank[b.issueType]) return rank[a.issueType] - rank[b.issueType];
          return a.productCode.localeCompare(b.productCode);
        }),
        recentLogs: familyLogs,
      };
    });

    const searchedRows = searchTokens.length
      ? allRows.filter((family) => {
          const haystack = normalizeSearchText(
            [
              family.name,
              family.code || '',
              family.note || '',
              family.items.map((item) => `${item.productCode} ${item.productName || ''}`).join(' '),
            ].join(' ')
          );
          return matchesSearchTokens(haystack, searchTokens);
        })
      : allRows;

    const filteredRows = searchedRows
      .filter((family) => (status === 'all' ? true : family.status === status))
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'problem' ? -1 : 1;
        if (b.missingCostDateCount !== a.missingCostDateCount) return b.missingCostDateCount - a.missingCostDateCount;
        if (b.outdatedCount !== a.outdatedCount) return b.outdatedCount - a.outdatedCount;
        return a.name.localeCompare(b.name, 'tr');
      });

    return {
      families: filteredRows,
      summary: {
        totalFamilies: allRows.length,
        problemFamilies: allRows.filter((family) => family.status === 'problem').length,
        okFamilies: allRows.filter((family) => family.status === 'ok').length,
        inactiveFamilies: allRows.filter((family) => !family.active).length,
        productCount: allRows.reduce((sum, family) => sum + family.itemCount, 0),
        outdatedProductCount: allRows.reduce((sum, family) => sum + family.outdatedCount, 0),
        missingCostDateCount: allRows.reduce((sum, family) => sum + family.missingCostDateCount, 0),
      },
    };
  }

  async updatePriceFamilyProductCost(input: {
    familyId: string;
    productCode: string;
    cost?: number;
    costP?: number;
    costT?: number;
    updatePriceLists?: boolean;
    userId?: string | null;
  }) {
    const familyId = String(input.familyId || '').trim();
    const productCode = String(input.productCode || '').trim().toUpperCase();
    if (!familyId || !productCode) {
      throw new AppError('Fiyat ailesi ve stok kodu zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }

    const item = await prisma.priceFamilyItem.findFirst({
      where: {
        familyId,
        productCode,
        active: true,
      },
      include: {
        family: { select: { id: true, name: true, active: true } },
      },
    });
    if (!item || !item.family) {
      throw new AppError('Stok bu fiyat ailesinde bulunamadi.', 404, ErrorCode.NOT_FOUND);
    }
    if (!item.family.active) {
      throw new AppError('Pasif fiyat ailesinde maliyet guncellenemez.', 400, ErrorCode.BAD_REQUEST);
    }

    return this.updateUcarerProductCost({
      productCode,
      cost: input.cost,
      costP: input.costP,
      costT: input.costT,
      updatePriceLists: input.updatePriceLists,
      source: 'PRICE_FAMILY',
      priceFamilyId: familyId,
      userId: input.userId || null,
    });
  }

  async createSupplierOrdersFromFamilyAllocations(input: {
    depot: 'MERKEZ' | 'TOPCA';
    supplierConfigs?: Record<
      string,
      {
        series?: string;
        applyVAT?: boolean;
        deliveryType?: string;
        deliveryDate?: string | null;
      }
    >;
    allocations: Array<{
      familyId?: string | null;
      productCode: string;
      quantity: number;
      unitPriceOverride?: number | null;
      supplierCodeOverride?: string | null;
      persistSupplierOverride?: boolean;
    }>;
    userId?: string | null;
  }): Promise<{
    createdOrders: Array<{
      supplierCode: string;
      supplierName: string | null;
      orderNumber: string;
      itemCount: number;
      totalQuantity: number;
      warning?: string | null;
    }>;
    failedOrders: Array<{ supplierCode: string; supplierName: string | null; error: string }>;
    missingSupplierProducts: Array<{ productCode: string; quantity: number }>;
    skippedInvalid: Array<{ familyId: string | null; productCode: string; quantity: number }>;
  }> {
    const depot = input.depot === 'TOPCA' ? 'TOPCA' : 'MERKEZ';
    const warehouseNo = depot === 'TOPCA' ? 6 : 1;
    const supplierConfigs = input.supplierConfigs || {};
    const rawRows = Array.isArray(input.allocations) ? input.allocations : [];

    const normalizedRows = rawRows
      .map((row) => ({
        familyId: String(row.familyId || '').trim() || null,
        productCode: String(row.productCode || '').trim().toUpperCase(),
        quantity: Math.max(0, Math.trunc(Number(row.quantity || 0))),
        unitPriceOverride: Number.isFinite(Number(row.unitPriceOverride))
          ? Math.max(0, Number(row.unitPriceOverride))
          : null,
        supplierCodeOverride: String(row.supplierCodeOverride || '').trim().toUpperCase() || null,
        persistSupplierOverride: Boolean(row.persistSupplierOverride),
      }))
      .filter((row) => row.productCode && row.quantity > 0);

    if (normalizedRows.length === 0) {
      throw new AppError('Dagitimda siparis olusturulacak miktar yok.', 400, ErrorCode.BAD_REQUEST);
    }

    const families = await prisma.productFamily.findMany({
      where: { id: { in: Array.from(new Set(normalizedRows.map((row) => row.familyId).filter(Boolean))) as string[] } },
      include: { items: true },
    });
    const familyItemSet = new Map<string, Set<string>>();
    families.forEach((family) => {
      familyItemSet.set(
        family.id,
        new Set(family.items.map((item) => String(item.productCode || '').trim().toUpperCase()))
      );
    });

    const skippedInvalid: Array<{ familyId: string | null; productCode: string; quantity: number }> = [];
    const productQtyMap = new Map<string, number>();
    const unitPriceOverrideByProduct = new Map<string, number>();
    const supplierOverrideByProduct = new Map<string, string>();
    const persistOverrideByProduct = new Map<string, boolean>();
    normalizedRows.forEach((row) => {
      if (row.unitPriceOverride !== null && row.unitPriceOverride > 0) {
        unitPriceOverrideByProduct.set(row.productCode, row.unitPriceOverride);
      }
      if (row.supplierCodeOverride) {
        supplierOverrideByProduct.set(row.productCode, row.supplierCodeOverride);
        if (row.persistSupplierOverride) {
          persistOverrideByProduct.set(row.productCode, true);
        }
      }
      if (!row.familyId) {
        productQtyMap.set(row.productCode, (productQtyMap.get(row.productCode) || 0) + row.quantity);
        return;
      }
      const allowedCodes = familyItemSet.get(row.familyId);
      if (!allowedCodes || !allowedCodes.has(row.productCode)) {
        skippedInvalid.push(row);
        return;
      }
      productQtyMap.set(row.productCode, (productQtyMap.get(row.productCode) || 0) + row.quantity);
    });

    if (productQtyMap.size === 0) {
      throw new AppError('Gecerli aile dagitimi bulunamadi.', 400, ErrorCode.BAD_REQUEST);
    }

    const productCodes = Array.from(productQtyMap.keys());
    const inClause = productCodes.map((code) => `'${code.replace(/'/g, "''")}'`).join(',');
    const supplierRows = await mikroService.executeQuery(`
      SELECT
        sto_kod AS productCode,
        LTRIM(RTRIM(ISNULL(sto_sat_cari_kod, ''))) AS supplierCode
      FROM STOKLAR
      WHERE sto_kod IN (${inClause})
    `);

    const supplierCodeByProduct = new Map<string, string>();
    (supplierRows || []).forEach((row: any) => {
      const productCode = String(row?.productCode || '').trim().toUpperCase();
      const supplierCode = String(row?.supplierCode || '').trim();
      if (productCode && supplierCode) {
      supplierCodeByProduct.set(productCode, supplierCode);
      }
    });

    const allSupplierCodes = new Set<string>();
    supplierCodeByProduct.forEach((code) => {
      if (code) allSupplierCodes.add(code);
    });
    supplierOverrideByProduct.forEach((code) => {
      if (code) allSupplierCodes.add(code);
    });
    const supplierNameMap = new Map<string, string>();
    if (allSupplierCodes.size > 0) {
      const supplierIn = Array.from(allSupplierCodes)
        .map((code) => `'${code.replace(/'/g, "''")}'`)
        .join(',');
      const supplierNameRows = await mikroService.executeQuery(`
        SELECT cari_kod AS supplierCode, cari_unvan1 AS supplierName
        FROM CARI_HESAPLAR
        WHERE cari_kod IN (${supplierIn})
      `);
      (supplierNameRows || []).forEach((row: any) => {
        const code = String(row?.supplierCode || '').trim();
        const name = String(row?.supplierName || '').trim();
        if (code) supplierNameMap.set(code, name || code);
      });
    }

    const missingSupplierProducts: Array<{ productCode: string; quantity: number }> = [];
    const supplierItems = new Map<string, Array<{ productCode: string; quantity: number }>>();
    const invalidOverrideProducts: string[] = [];
    productQtyMap.forEach((quantity, productCode) => {
      const overriddenSupplierCode = supplierOverrideByProduct.get(productCode);
      const supplierCode = overriddenSupplierCode || supplierCodeByProduct.get(productCode);
      if (overriddenSupplierCode && !supplierNameMap.has(overriddenSupplierCode)) {
        invalidOverrideProducts.push(productCode);
        return;
      }
      if (!supplierCode) {
        missingSupplierProducts.push({ productCode, quantity });
        return;
      }
      const list = supplierItems.get(supplierCode) || [];
      list.push({ productCode, quantity });
      supplierItems.set(supplierCode, list);
    });

    if (invalidOverrideProducts.length > 0) {
      throw new AppError(
        `Gecersiz saglayici secimi var: ${invalidOverrideProducts.slice(0, 10).join(', ')}`,
        400,
        ErrorCode.BAD_REQUEST
      );
    }

    if (missingSupplierProducts.length > 0) {
      throw new AppError(
        `Ana saglayicisi tanimli olmayan stoklar var: ${missingSupplierProducts
          .slice(0, 10)
          .map((row) => row.productCode)
          .join(', ')}`,
        400,
        ErrorCode.BAD_REQUEST
      );
    }

    const costRows = await prisma.product.findMany({
      where: { mikroCode: { in: productCodes } },
      select: { mikroCode: true, currentCost: true, vatRate: true },
    });
    const productCostMap = new Map<string, { unitPrice: number; vatRate: number }>();
    (costRows || []).forEach((row) => {
      const code = String(row?.mikroCode || '').trim().toUpperCase();
      const dbUnitPrice = Number(row?.currentCost || 0);
      const overrideUnitPrice = unitPriceOverrideByProduct.get(code);
      const unitPrice = overrideUnitPrice && overrideUnitPrice > 0 ? overrideUnitPrice : dbUnitPrice;
      const vatRate = Number(row?.vatRate || 0);
      if (!code) return;
      productCostMap.set(code, {
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
        vatRate: Number.isFinite(vatRate) ? vatRate : 0,
      });
    });
    // Prisma'da kaydi olmayan ama ekranda manuel maliyet girilen urunleri de dahil et.
    productCodes.forEach((code) => {
      if (productCostMap.has(code)) return;
      const overrideUnitPrice = unitPriceOverrideByProduct.get(code);
      if (Number.isFinite(overrideUnitPrice) && Number(overrideUnitPrice) > 0) {
        productCostMap.set(code, {
          unitPrice: Number(overrideUnitPrice),
          vatRate: 0,
        });
      }
    });

    // Cost/VAT Prisma tarafinda 0 veya eksikse Mikro STOKLAR'dan fallback tamamla.
    const fallbackCandidateCodes = productCodes.filter((code) => {
      const entry = productCostMap.get(code);
      const unitPrice = Number(entry?.unitPrice || 0);
      const vatRate = Number(entry?.vatRate || 0);
      return !entry || unitPrice <= 0 || vatRate <= 0;
    });
    if (fallbackCandidateCodes.length > 0) {
      const fallbackInClause = fallbackCandidateCodes
        .map((code) => `'${code.replace(/'/g, "''")}'`)
        .join(',');
      const fallbackQueries = [
        `
          SELECT
            sto_kod AS productCode,
            ISNULL(sto_standartmaliyet, 0) AS currentCost,
            dbo.fn_VergiYuzde(ISNULL(sto_toptan_vergi, 0)) AS vatPercent
          FROM STOKLAR
          WHERE sto_kod IN (${fallbackInClause})
        `,
        `
          SELECT
            sto_kod AS productCode,
            ISNULL(sto_standartmaliyet, 0) AS currentCost,
            dbo.fn_VergiYuzde(ISNULL(sto_perakende_vergi, 0)) AS vatPercent
          FROM STOKLAR
          WHERE sto_kod IN (${fallbackInClause})
        `,
        `
          SELECT
            sto_kod AS productCode,
            ISNULL(sto_standartmaliyet, 0) AS currentCost,
            dbo.fn_VergiYuzde(ISNULL(sto_oivvergipntr, 0)) AS vatPercent
          FROM STOKLAR
          WHERE sto_kod IN (${fallbackInClause})
        `,
        `
          SELECT
            sto_kod AS productCode,
            ISNULL(sto_standartmaliyet, 0) AS currentCost,
            0 AS vatPercent
          FROM STOKLAR
          WHERE sto_kod IN (${fallbackInClause})
        `,
      ];

      let fallbackRows: any[] = [];
      for (const query of fallbackQueries) {
        try {
          fallbackRows = await mikroService.executeQuery(query);
          break;
        } catch (error: any) {
          const message = String(error?.message || '').toLowerCase();
          if (!message.includes('invalid column name')) {
            throw error;
          }
        }
      }

      (fallbackRows || []).forEach((row: any) => {
        const code = String(row?.productCode || '').trim().toUpperCase();
        if (!code) return;
        const existing = productCostMap.get(code);
        const overrideUnitPrice = Number(unitPriceOverrideByProduct.get(code) || 0);
        const existingUnitPrice = Number(existing?.unitPrice || 0);
        const existingVatRate = Number(existing?.vatRate || 0);
        const fallbackUnitPrice = Number(row?.currentCost || 0);
        const fallbackVatPercent = Number(row?.vatPercent || 0);
        const fallbackVatRate =
          Number.isFinite(fallbackVatPercent) && fallbackVatPercent > 1
            ? fallbackVatPercent / 100
            : fallbackVatPercent;

        const resolvedUnitPrice =
          Number.isFinite(overrideUnitPrice) && overrideUnitPrice > 0
            ? overrideUnitPrice
            : Number.isFinite(existingUnitPrice) && existingUnitPrice > 0
            ? existingUnitPrice
            : Number.isFinite(fallbackUnitPrice) && fallbackUnitPrice > 0
            ? fallbackUnitPrice
            : 0;
        const resolvedVatRate =
          Number.isFinite(existingVatRate) && existingVatRate > 0
            ? existingVatRate
            : Number.isFinite(fallbackVatRate) && fallbackVatRate > 0
            ? fallbackVatRate
            : 0;

        productCostMap.set(code, {
          unitPrice: resolvedUnitPrice,
          vatRate: resolvedVatRate,
        });
      });
    }

    const missingCostCodes = productCodes.filter((code) => {
      const cost = productCostMap.get(code)?.unitPrice || 0;
      return !Number.isFinite(cost) || cost <= 0;
    });
    if (missingCostCodes.length > 0) {
      throw new AppError(
        `Guncel maliyeti bos/0 olan stoklar var: ${missingCostCodes.slice(0, 10).join(', ')}`,
        400,
        ErrorCode.BAD_REQUEST
      );
    }

    const persistUpdates = Array.from(persistOverrideByProduct.entries()).filter(
      ([productCode, persist]) => persist && Boolean(supplierOverrideByProduct.get(productCode))
    );
    for (const [productCode] of persistUpdates) {
      const newSupplierCode = supplierOverrideByProduct.get(productCode);
      if (!newSupplierCode) continue;
      await mikroService.executeQuery(`
        UPDATE STOKLAR
        SET sto_sat_cari_kod = '${newSupplierCode.replace(/'/g, "''")}'
        WHERE sto_kod = '${productCode.replace(/'/g, "''")}'
      `);
    }

    // KRITIK: Mikro'ya evrak yazmaya baslamadan ONCE tum tedarikcilerin seri konfigurasyonu
    // topluca dogrulanir. Eski akista seri kontrolu dongu icindeydi; 1. tedarikcinin evragi
    // yazildiktan sonra 2. tedarikcide seri hatasi olusunca kismi basari kayboluyor ve tekrar
    // deneme CIFT evrak uretiyordu.
    const missingSeriesSuppliers: string[] = [];
    for (const supplierCode of supplierItems.keys()) {
      const cfg = supplierConfigs[supplierCode] || {};
      if (!String(cfg.series || '').trim()) {
        missingSeriesSuppliers.push(supplierCode);
      }
    }
    if (missingSeriesSuppliers.length > 0) {
      throw new AppError(
        `Siparis serisi zorunludur: ${missingSeriesSuppliers.slice(0, 10).join(', ')}`,
        400,
        ErrorCode.BAD_REQUEST
      );
    }

    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const createdOrders: Array<{
      supplierCode: string;
      supplierName: string | null;
      orderNumber: string;
      itemCount: number;
      totalQuantity: number;
      warning?: string | null;
    }> = [];
    const failedOrders: Array<{ supplierCode: string; supplierName: string | null; error: string }> = [];

    for (const [supplierCode, items] of supplierItems.entries()) {
      const cfg = supplierConfigs[supplierCode] || {};
      const series = String(cfg.series || '').trim().toUpperCase();
      const applyVAT = Boolean(cfg.applyVAT);
      const deliveryType = String(cfg.deliveryType || '').trim().slice(0, 25);
      const deliveryDate = cfg.deliveryDate ? String(cfg.deliveryDate) : null;
      const totalQuantity = items.reduce((sum, row) => sum + row.quantity, 0);
      const supplierName = supplierNameMap.get(supplierCode) || null;

      let orderNumber = '';
      try {
        orderNumber = await mikroService.writeOrder({
          cariCode: supplierCode,
          items: items.map((item) => ({
            productCode: item.productCode,
            quantity: item.quantity,
            unitPrice: productCostMap.get(item.productCode)?.unitPrice || 0,
            vatRate: productCostMap.get(item.productCode)?.vatRate || 0,
            lineDescription: `Ucarer aile dagitimi ${depot}`,
          })),
          applyVAT,
          description: `Ucarer Aile Dagitimi ${depot}`,
          documentDescription: `Ucarer aile dagitimi ${depot} ${day}.${month}.${year}`,
          evrakSeri: series,
          warehouseNo,
          deliveryType,
          deliveryDate,
          buyerCode: '195.01.069',
        });
      } catch (error: any) {
        // Kismi basari: kalan tedarikcilerle devam et, hatayi failedOrders'a yaz.
        failedOrders.push({
          supplierCode,
          supplierName,
          error: String(error?.message || 'Siparis Mikro tarafina yazilamadi'),
        });
        continue;
      }

      const createdOrder = {
        supplierCode,
        supplierName,
        orderNumber,
        itemCount: items.length,
        totalQuantity,
        warning: null as string | null,
      };
      createdOrders.push(createdOrder);

      // Basarili her evragi ANINDA kalici logla; sonraki tedarikcide hata olsa bile
      // hangi evraklarin OLUSTUGU islem gecmisinden gorulebilsin.
      await this.logUcarerOperation({
        operationType: 'SUPPLIER_ORDER_CREATE',
        title: 'Ucarer tedarikci siparisi olusturuldu',
        depot,
        supplierCode,
        supplierName,
        orderNumbers: [orderNumber],
        newValues: { order: { ...createdOrder }, items },
        userId: input.userId || null,
      });

      try {
        const match = String(orderNumber).match(/^(.*)-(\d+)$/);
        if (match) {
          const seri = match[1];
          const sira = Number(match[2]);
          if (seri && Number.isFinite(sira)) {
            const fallbackApproverRaw = Number(process.env.MIKRO_USER_NO || process.env.MIKRO_USERNO || 1);
            const fallbackApprover =
              Number.isFinite(fallbackApproverRaw) && fallbackApproverRaw > 0
                ? Math.trunc(fallbackApproverRaw)
                : 1;
            const approverRows = await mikroService.executeQuery(`
              SELECT TOP 1 ISNULL(sip_OnaylayanKulNo, 0) AS approverNo
              FROM SIPARISLER WITH (NOLOCK)
              WHERE sip_evrakno_seri = '${seri.replace(/'/g, "''")}'
                AND ISNULL(sip_OnaylayanKulNo, 0) > 0
              ORDER BY sip_lastup_date DESC, sip_create_date DESC
            `);
            let approverNoRaw = Number(approverRows?.[0]?.approverNo || 0);
            if (!Number.isFinite(approverNoRaw) || approverNoRaw <= 0) {
              const globalApproverRows = await mikroService.executeQuery(`
                SELECT TOP 1 ISNULL(sip_OnaylayanKulNo, 0) AS approverNo
                FROM SIPARISLER WITH (NOLOCK)
                WHERE sip_tip = 1
                  AND ISNULL(sip_OnaylayanKulNo, 0) > 0
                ORDER BY sip_lastup_date DESC, sip_create_date DESC
              `);
              approverNoRaw = Number(globalApproverRows?.[0]?.approverNo || 0);
            }
            const approverNo =
              Number.isFinite(approverNoRaw) && approverNoRaw > 0
                ? Math.trunc(approverNoRaw)
                : fallbackApprover;
            await mikroService.executeQuery(`
              UPDATE SIPARISLER
              SET
                sip_tip = 1,
                sip_OnaylayanKulNo = CASE
                  WHEN ISNULL(sip_OnaylayanKulNo, 0) = 0 THEN ${approverNo}
                  ELSE sip_OnaylayanKulNo
                END,
                sip_lastup_user = CASE
                  WHEN ISNULL(sip_lastup_user, 0) = 0 THEN ${approverNo}
                  ELSE sip_lastup_user
                END,
                sip_lastup_date = GETDATE()
              WHERE sip_evrakno_seri = '${seri.replace(/'/g, "''")}'
                AND sip_evrakno_sira = ${sira}
            `);
            const verify = await mikroService.executeQuery(`
              SELECT COUNT(*) AS cnt
              FROM SIPARISLER
              WHERE sip_evrakno_seri = '${seri.replace(/'/g, "''")}'
                AND sip_evrakno_sira = ${sira}
                AND sip_tip = 1
            `);
            const confirmedCount = Number(verify?.[0]?.cnt || 0);
            if (!Number.isFinite(confirmedCount) || confirmedCount <= 0) {
              throw new AppError(
                `Verilen siparis fisi formati dogrulanamadi (${seri}-${sira}).`,
                500,
                ErrorCode.INTERNAL_SERVER_ERROR
              );
            }
          }
        }
      } catch (error: any) {
        // Evrak Mikro'da OLUSTU; sadece verilen-siparis formati dogrulanamadi.
        // Tekrar deneme cift evrak uretecegi icin hata firlatmak yerine uyari donuyoruz.
        createdOrder.warning = `Evrak olustu (${orderNumber}) ancak verilen siparis formati dogrulanamadi: ${String(
          error?.message || error
        )}`;
      }
    }

    if (createdOrders.length === 0) {
      const detail = failedOrders
        .slice(0, 5)
        .map((row) => `${row.supplierCode}: ${row.error}`)
        .join(' | ');
      throw new AppError(
        `Hicbir tedarikci siparisi olusturulamadi. ${detail}`.trim(),
        500,
        ErrorCode.INTERNAL_SERVER_ERROR
      );
    }

    await this.logUcarerOperation({
      operationType: 'SUPPLIER_ORDER_CREATE',
      title:
        failedOrders.length > 0
          ? 'Ucarer tedarikci siparisleri KISMEN olusturuldu'
          : 'Ucarer tedarikci siparisleri olusturuldu',
      depot,
      orderNumbers: createdOrders.map((order) => order.orderNumber),
      newValues: {
        createdOrders,
      },
      metadata: {
        allocationCount: normalizedRows.length,
        supplierCount: createdOrders.length,
        productCount: productCodes.length,
        failedOrders,
        skippedInvalid,
        persistSupplierOverrides: Array.from(persistOverrideByProduct.entries())
          .filter(([, persist]) => persist)
          .map(([productCode]) => ({
            productCode,
            supplierCode: supplierOverrideByProduct.get(productCode) || null,
          })),
      },
      userId: input.userId || null,
    });

    return {
      createdOrders,
      failedOrders,
      missingSupplierProducts: [],
      skippedInvalid,
    };
  }

  async createDepotTransferOrder(input: {
    depot: 'MERKEZ' | 'TOPCA';
    allocations: Array<{ productCode: string; quantity: number }>;
    series?: string;
    userId?: string | null;
  }): Promise<{
    orderNumber: string;
    itemCount: number;
    totalQuantity: number;
  }> {
    const depot = input.depot === 'TOPCA' ? 'TOPCA' : 'MERKEZ';
    const targetWarehouseNo = depot === 'TOPCA' ? 6 : 1;
    const sourceWarehouseNo = depot === 'TOPCA' ? 1 : 6;
    const series = String(input.series || 'DSV').trim().toUpperCase() || 'DSV';
    const rows = (Array.isArray(input.allocations) ? input.allocations : [])
      .map((row) => ({
        productCode: String(row.productCode || '').trim().toUpperCase(),
        quantity: Math.max(0, Math.trunc(Number(row.quantity || 0))),
      }))
      .filter((row) => row.productCode && row.quantity > 0);

    if (rows.length === 0) {
      throw new AppError('Depolar arasi siparis icin secili miktar yok.', 400, ErrorCode.BAD_REQUEST);
    }

    const escapedSeries = series.replace(/'/g, "''");
    const templateSeqRaw = Number(process.env.MIKRO_DEPOT_TRANSFER_TEMPLATE_SEQ || 1225);
    const templateSeq = Number.isFinite(templateSeqRaw) && templateSeqRaw > 0 ? Math.trunc(templateSeqRaw) : 1225;
    const templateRows = await mikroService.executeQuery(`
      SELECT TOP 1 *
      FROM (
        SELECT 1 AS prio, * FROM DEPOLAR_ARASI_SIPARISLER
        WHERE ssip_evrakno_seri = '${escapedSeries}' AND ssip_evrakno_sira = ${templateSeq}
        UNION ALL
        SELECT 2 AS prio, * FROM DEPOLAR_ARASI_SIPARISLER
        WHERE ssip_evrakno_seri = '${escapedSeries}' AND ssip_evrakno_sira = 1225
        UNION ALL
        SELECT 3 AS prio, * FROM DEPOLAR_ARASI_SIPARISLER
        WHERE ssip_evrakno_seri = '${escapedSeries}' AND ssip_evrakno_sira = 1222
        UNION ALL
        SELECT 4 AS prio, * FROM DEPOLAR_ARASI_SIPARISLER
        WHERE ssip_evrakno_seri = '${escapedSeries}'
      ) t
      ORDER BY t.prio ASC, t.ssip_evrakno_sira DESC, t.ssip_satirno DESC
    `);
    const templateRow = templateRows?.[0];
    if (!templateRow) {
      throw new AppError(`Depolar arasi siparis template kaydi bulunamadi (seri: ${series}).`, 400, ErrorCode.BAD_REQUEST);
    }

    const nextRows = await mikroService.executeQuery(`
      SELECT ISNULL(MAX(ssip_evrakno_sira), 0) + 1 AS nextSira
      FROM DEPOLAR_ARASI_SIPARISLER
      WHERE ssip_evrakno_seri = '${escapedSeries}'
    `);
    const nextSira = Number(nextRows?.[0]?.nextSira || 1);
    const orderNumber = `${series}-${nextSira}`;

    const insertableColumnsRows = await mikroService.executeQuery(`
      SELECT c.name AS colName
      FROM sys.columns c
      INNER JOIN sys.tables t ON c.object_id = t.object_id
      WHERE t.name = 'DEPOLAR_ARASI_SIPARISLER'
        AND c.is_identity = 0
        AND c.is_computed = 0
        AND c.system_type_id <> 189
      ORDER BY c.column_id
    `);
    const insertableColumns = (insertableColumnsRows || [])
      .map((r: any) => String(r.colName || '').trim())
      .filter(Boolean);
    if (!insertableColumns.length) {
      throw new AppError('DEPOLAR_ARASI_SIPARISLER kolonlari okunamadi.', 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }

    const zeroGuid = '00000000-0000-0000-0000-000000000000';
    const toSqlLiteral = (value: unknown): string => {
      if (value === null || value === undefined) return 'NULL';
      if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
      if (typeof value === 'boolean') return value ? '1' : '0';
      if (value instanceof Date) {
        const iso = value.toISOString().slice(0, 23).replace('T', ' ');
        return `'${iso}'`;
      }
      const text = String(value).replace(/'/g, "''");
      return `N'${text}'`;
    };

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const lineData: Record<string, unknown> = { ...templateRow };
      const now = new Date();

      lineData.ssip_Guid = randomUUID();
      lineData.ssip_iptal = 0;
      lineData.ssip_degisti = 0;
      lineData.ssip_create_date = now;
      lineData.ssip_lastup_date = now;
      lineData.ssip_tarih = now;
      lineData.ssip_teslim_tarih = now;
      lineData.ssip_belge_tarih = now;
      lineData.ssip_evrakno_seri = series;
      lineData.ssip_evrakno_sira = nextSira;
      lineData.ssip_satirno = index;
      lineData.ssip_stok_kod = row.productCode;
      lineData.ssip_miktar = row.quantity;
      lineData.ssip_tutar = 0;
      lineData.ssip_b_fiyat = 0;
      lineData.ssip_teslim_miktar = 0;
      lineData.ssip_kapat_fl = 0;
      lineData.ssip_girdepo = targetWarehouseNo;
      lineData.ssip_cikdepo = sourceWarehouseNo;
      lineData.ssip_stal_uid = zeroGuid;
      lineData.ssip_birim_pntr = Number(lineData.ssip_birim_pntr || 1) || 1;

      const colsSql = insertableColumns.map((col) => `[${col}]`).join(', ');
      const valsSql = insertableColumns.map((col) => toSqlLiteral(lineData[col])).join(', ');
      await mikroService.executeQuery(`
        INSERT INTO DEPOLAR_ARASI_SIPARISLER (${colsSql})
        VALUES (${valsSql})
      `);
    }

    const result = {
      orderNumber,
      itemCount: rows.length,
      totalQuantity: rows.reduce((sum, row) => sum + row.quantity, 0),
    };

    await this.logUcarerOperation({
      operationType: 'DEPOT_TRANSFER_CREATE',
      title: 'Depolar arasi siparis olusturuldu',
      depot,
      documentNo: orderNumber,
      orderNumbers: [orderNumber],
      newValues: result,
      metadata: {
        sourceWarehouseNo,
        targetWarehouseNo,
        allocations: rows,
      },
      userId: input.userId || null,
    });

    return result;
  }

  async updateUcarerProductCost(input: {
    productCode: string;
    cost?: number;
    costP?: number;
    costT?: number;
    updatePriceLists?: boolean;
    source?: 'UCARER_DEPO' | 'PRICE_FAMILY' | 'SUPPLIER_COST';
    priceFamilyId?: string | null;
    userId?: string | null;
  }): Promise<{
    productCode: string;
    currentCost: number;
    costP: number;
    costT: number;
    priceListsUpdated: boolean;
    updatedLists: Array<{
      listNo: number;
      value: number;
      actualValue: number;
      affected: number;
      verified: boolean;
    }>;
    missingLists: number[];
    verificationStatus: 'NOT_REQUESTED' | 'VERIFIED';
    verifiedListCount: number;
  }> {
    const productCode = String(input.productCode || '').trim().toUpperCase();
    const legacyCost = Number(input.cost || 0);
    const costP = Number(input.costP ?? legacyCost ?? 0);
    const costT = Number(input.costT ?? input.costP ?? legacyCost ?? 0);
    const updatePriceLists = Boolean(input.updatePriceLists);
    const escapedCode = productCode.replace(/'/g, "''");

    if (!productCode) {
      throw new AppError('Stok kodu zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }
    if (!Number.isFinite(costP) || costP <= 0) {
      throw new AppError('Gecerli bir Maliyet P girin.', 400, ErrorCode.BAD_REQUEST);
    }
    if (!Number.isFinite(costT) || costT <= 0) {
      throw new AppError('Gecerli bir Maliyet T girin.', 400, ErrorCode.BAD_REQUEST);
    }
    // Marj_6 dahil gerekli custom alanlar canli metadata ile yazmadan once
    // dogrulanir. Eksik semada maliyet yazip fiyatlari yarim birakmayiz.
    await this.assertStandardPriceUserColumns();

    const expectedPriceSqlValues = STANDARD_PRICE_LIST_DEFINITIONS
      .map((definition) => {
        const costVariable = definition.costBasis === 'MALIYET_T' ? '@costT' : '@costP';
        return `(${definition.listNo}, ROUND(${costVariable} * @margin${definition.marginSlot}, 6))`;
      })
      .join(',\n              ');
    const standardPriceListCount = STANDARD_PRICE_LIST_NOS.length;
    const retailStandardListNos = STANDARD_PRICE_LIST_DEFINITIONS
      .filter((definition) => definition.plane === 'RETAIL')
      .map((definition) => definition.listNo)
      .join(', ');
    const invoicedStandardListNos = STANDARD_PRICE_LIST_DEFINITIONS
      .filter((definition) => definition.plane === 'INVOICED')
      .map((definition) => definition.listNo)
      .join(', ');

    const shouldAuditPriceFamily = input.source === 'PRICE_FAMILY' || Boolean(input.priceFamilyId);
    const previousProduct = await prisma.product.findFirst({
      where: { mikroCode: productCode },
      select: { name: true, currentCost: true, currentCostDate: true },
    });
    const priceFamilyContext = shouldAuditPriceFamily
      ? input.priceFamilyId
        ? await prisma.priceFamily.findUnique({
            where: { id: input.priceFamilyId },
            select: { id: true, name: true },
          })
        : await prisma.priceFamilyItem
            .findUnique({
              where: { productCode },
              include: { family: { select: { id: true, name: true } } },
            })
            .then((row) => row?.family || null)
      : null;
    const newCostDate = new Date();

    let priceWriteRows: any[] = [];
    try {
      // Maliyet ve fiyatlar tek SQL transaction'inda yazilir. Boylece fiyat
      // yaziminin herhangi bir adimi basarisizsa maliyet de geri alinir.
      // A reconnect-level retry must not replay a write after an uncertain
      // COMMIT. The caller can read back the same product and retry safely.
      priceWriteRows = await mikroService.executeQueryOnce(`
        SET XACT_ABORT ON;

        BEGIN TRY
          BEGIN TRANSACTION;

          DECLARE @productCode nvarchar(50) = N'${escapedCode}';
          DECLARE @costP decimal(19,6) = ${costP};
          DECLARE @costT decimal(19,6) = ${costT};
          DECLARE @updatePriceLists bit = ${updatePriceLists ? 1 : 0};
          DECLARE @uid uniqueidentifier;
          DECLARE @hasUserRow bit = 0;
          DECLARE @todayText nvarchar(20) = CONVERT(nvarchar(10), GETDATE(), 104);
          DECLARE @margin1 decimal(19,6);
          DECLARE @margin2 decimal(19,6);
          DECLARE @margin3 decimal(19,6);
          DECLARE @margin4 decimal(19,6);
          DECLARE @margin5 decimal(19,6);
          DECLARE @margin6 decimal(19,6);
          DECLARE @retailPriceUnitPointer tinyint = 0;
          DECLARE @invoicedPriceUnitPointer tinyint = 0;
          DECLARE @expectedPrices TABLE (
            listNo int NOT NULL PRIMARY KEY,
            expectedPrice decimal(19,6) NOT NULL
          );

          SELECT @uid = sto_guid
          FROM STOKLAR WITH (UPDLOCK, HOLDLOCK)
          WHERE RTRIM(sto_kod) = @productCode;

          IF @uid IS NULL
            THROW 51000, 'Stok karti Mikroda bulunamadi.', 1;

          IF EXISTS (
            SELECT 1
            FROM STOKLAR_USER WITH (UPDLOCK, HOLDLOCK)
            WHERE Record_uid = @uid
          )
            SET @hasUserRow = 1;

          IF @updatePriceLists = 1 AND @hasUserRow = 0
            THROW 51001, 'Standart fiyat listeleri guncellenemedi: stok kartinda Marj_1-Marj_6 kaydi yok.', 1;

          IF @hasUserRow = 0
          BEGIN
            INSERT INTO STOKLAR_USER
              (Record_uid, Maliyet_Tar, GUNCEL_MALIYET_TARIHI, TOPCA_MIN, TOPCA_MAX, Marj_1, Marj_2, Marj_3, Marj_4, Marj_5, Marj_6, MaliyetP, MaliyetT, MaliyetTarihi, FiyatDegisimTarihi, Yatan_Stok, Birim_1_Desi)
            VALUES
              (@uid, GETDATE(), 0, 0, 0, '1', '1', '1', '1', '1', '1', @costP, @costT, @todayText, @todayText, '', 0);
          END

          IF @updatePriceLists = 1
          BEGIN
            SELECT
              @margin1 = TRY_CONVERT(decimal(19,6), REPLACE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), Marj_1))), ''), ',', '.')),
              @margin2 = TRY_CONVERT(decimal(19,6), REPLACE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), Marj_2))), ''), ',', '.')),
              @margin3 = TRY_CONVERT(decimal(19,6), REPLACE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), Marj_3))), ''), ',', '.')),
              @margin4 = TRY_CONVERT(decimal(19,6), REPLACE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), Marj_4))), ''), ',', '.')),
              @margin5 = TRY_CONVERT(decimal(19,6), REPLACE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), Marj_5))), ''), ',', '.')),
              @margin6 = TRY_CONVERT(decimal(19,6), REPLACE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), Marj_6))), ''), ',', '.'))
            FROM STOKLAR_USER WITH (UPDLOCK, HOLDLOCK)
            WHERE Record_uid = @uid;

            IF @margin1 IS NULL OR @margin1 <= 0
              OR @margin2 IS NULL OR @margin2 <= 0
              OR @margin3 IS NULL OR @margin3 <= 0
              OR @margin4 IS NULL OR @margin4 <= 0
              OR @margin5 IS NULL OR @margin5 <= 0
              OR @margin6 IS NULL OR @margin6 <= 0
              THROW 51001, 'Standart fiyat listeleri guncellenemedi: Marj_1-Marj_6 alanlarinin tumu sifirdan buyuk ve sayisal olmali.', 1;

            INSERT INTO @expectedPrices (listNo, expectedPrice)
            VALUES
              ${expectedPriceSqlValues};

            IF (SELECT COUNT(*) FROM @expectedPrices WHERE expectedPrice > 0) <> ${standardPriceListCount}
              THROW 51001, 'Standart fiyat listeleri guncellenemedi: hesaplanan fiyatlardan biri gecersiz.', 1;
          END

          UPDATE STOKLAR
          SET
            sto_standartmaliyet = @costP,
            sto_resim_url = @todayText
          WHERE sto_guid = @uid;

          UPDATE STOKLAR_USER
          SET
            MaliyetP = @costP,
            MaliyetT = @costT,
            MaliyetTarihi = @todayText,
            FiyatDegisimTarihi = @todayText
          WHERE Record_uid = @uid;

          IF @updatePriceLists = 1
          BEGIN
            IF EXISTS (
              SELECT pricePlane
              FROM (
                SELECT
                  CASE
                    WHEN target.sfiyat_listesirano IN (${retailStandardListNos})
                      THEN N'RETAIL'
                    ELSE N'INVOICED'
                  END AS pricePlane,
                  target.sfiyat_birim_pntr
                FROM STOK_SATIS_FIYAT_LISTELERI target
                INNER JOIN @expectedPrices expected
                  ON target.sfiyat_listesirano = expected.listNo
                WHERE RTRIM(target.sfiyat_stokkod) = @productCode
                  AND target.sfiyat_deposirano = 0
                  AND target.sfiyat_doviz = 0
                  AND target.sfiyat_odemeplan = 0
                  AND target.sfiyat_iptal = 0
                  AND ISNULL(target.sfiyat_hidden, 0) = 0
              ) unit_candidates
              GROUP BY pricePlane
              HAVING COUNT(DISTINCT sfiyat_birim_pntr) > 1
            )
              THROW 51002, 'Stok fiyat listelerinde ayni duzlem icin birim pointer belirsiz.', 1;

            SELECT TOP 1 @retailPriceUnitPointer = sfiyat_birim_pntr
            FROM STOK_SATIS_FIYAT_LISTELERI
            WHERE RTRIM(sfiyat_stokkod) = @productCode
              AND sfiyat_listesirano IN (${retailStandardListNos})
              AND sfiyat_deposirano = 0
              AND sfiyat_doviz = 0
              AND sfiyat_odemeplan = 0
              AND sfiyat_iptal = 0
              AND ISNULL(sfiyat_hidden, 0) = 0
            ORDER BY sfiyat_listesirano;

            SELECT TOP 1 @invoicedPriceUnitPointer = sfiyat_birim_pntr
            FROM STOK_SATIS_FIYAT_LISTELERI
            WHERE RTRIM(sfiyat_stokkod) = @productCode
              AND sfiyat_listesirano IN (${invoicedStandardListNos})
              AND sfiyat_deposirano = 0
              AND sfiyat_doviz = 0
              AND sfiyat_odemeplan = 0
              AND sfiyat_iptal = 0
              AND ISNULL(sfiyat_hidden, 0) = 0
            ORDER BY sfiyat_listesirano;

            IF EXISTS (
              SELECT target.sfiyat_listesirano
              FROM STOK_SATIS_FIYAT_LISTELERI target
              INNER JOIN @expectedPrices expected
                ON target.sfiyat_listesirano = expected.listNo
              WHERE RTRIM(target.sfiyat_stokkod) = @productCode
                AND target.sfiyat_deposirano = 0
                AND target.sfiyat_doviz = 0
                AND target.sfiyat_odemeplan = 0
                AND target.sfiyat_iptal = 0
                AND ISNULL(target.sfiyat_hidden, 0) = 0
              GROUP BY target.sfiyat_listesirano
              HAVING COUNT(*) > 1
            )
              THROW 51002, 'Standart fiyat listesinde birden fazla aktif canonical satir var.', 1;

            UPDATE target
            SET
              target.sfiyat_fiyati = expected.expectedPrice,
              target.sfiyat_degisti = 1,
              target.sfiyat_lastup_user = 1,
              target.sfiyat_lastup_date = GETDATE()
            FROM STOK_SATIS_FIYAT_LISTELERI target
            INNER JOIN @expectedPrices expected
              ON target.sfiyat_listesirano = expected.listNo
            WHERE RTRIM(target.sfiyat_stokkod) = @productCode
              AND target.sfiyat_deposirano = 0
              AND target.sfiyat_doviz = 0
              AND target.sfiyat_odemeplan = 0
              AND target.sfiyat_iptal = 0
              AND ISNULL(target.sfiyat_hidden, 0) = 0;

            INSERT INTO STOK_SATIS_FIYAT_LISTELERI
              (sfiyat_Guid, sfiyat_DBCno, sfiyat_SpecRECno, sfiyat_iptal, sfiyat_fileid, sfiyat_hidden, sfiyat_kilitli, sfiyat_degisti, sfiyat_checksum, sfiyat_create_user, sfiyat_create_date,
               sfiyat_lastup_user, sfiyat_lastup_date, sfiyat_special1, sfiyat_special2, sfiyat_special3, sfiyat_stokkod, sfiyat_listesirano, sfiyat_deposirano, sfiyat_odemeplan, sfiyat_birim_pntr,
               sfiyat_fiyati, sfiyat_doviz, sfiyat_iskontokod, sfiyat_deg_nedeni, sfiyat_primyuzdesi, sfiyat_kampanyakod, sfiyat_doviz_kuru)
            SELECT
              NEWID(), 0, 0, 0, 0, 0, 0, 1, 0, 1, GETDATE(), 1, GETDATE(), '', '', '', @productCode, expected.listNo, 0, 0,
              CASE
                WHEN expected.listNo IN (${retailStandardListNos})
                  THEN @retailPriceUnitPointer
                ELSE @invoicedPriceUnitPointer
              END,
              expected.expectedPrice, 0, '', 0, 0, '', 0
            FROM @expectedPrices expected
            WHERE NOT EXISTS (
              SELECT 1
              FROM STOK_SATIS_FIYAT_LISTELERI existing WITH (UPDLOCK, HOLDLOCK)
              WHERE RTRIM(existing.sfiyat_stokkod) = @productCode
                AND existing.sfiyat_listesirano = expected.listNo
                AND existing.sfiyat_deposirano = 0
                AND existing.sfiyat_doviz = 0
                AND existing.sfiyat_odemeplan = 0
                AND existing.sfiyat_iptal = 0
                AND ISNULL(existing.sfiyat_hidden, 0) = 0
            );

            IF EXISTS (
              SELECT 1
              FROM @expectedPrices expected
              WHERE NOT EXISTS (
                SELECT 1
                FROM STOK_SATIS_FIYAT_LISTELERI actual
                WHERE RTRIM(actual.sfiyat_stokkod) = @productCode
                  AND actual.sfiyat_listesirano = expected.listNo
                  AND actual.sfiyat_deposirano = 0
                  AND actual.sfiyat_doviz = 0
                  AND actual.sfiyat_odemeplan = 0
                  AND actual.sfiyat_iptal = 0
                  AND ISNULL(actual.sfiyat_hidden, 0) = 0
                  AND ABS(CAST(actual.sfiyat_fiyati AS float) - CAST(expected.expectedPrice AS float)) <= 0.005
              )
            )
              THROW 51002, 'Mikro fiyat dogrulamasi basarisiz: standart listelerin tamami yazilamadi.', 1;
          END

          COMMIT TRANSACTION;

          SELECT
            expected.listNo,
            CAST(expected.expectedPrice AS float) AS value,
            CAST(actual.actualValue AS float) AS actualValue,
            CAST(1 AS int) AS affected,
            CAST(CASE WHEN ABS(CAST(actual.actualValue AS float) - CAST(expected.expectedPrice AS float)) <= 0.005 THEN 1 ELSE 0 END AS bit) AS verified
          FROM @expectedPrices expected
          OUTER APPLY (
            SELECT TOP 1 sfiyat_fiyati AS actualValue
            FROM STOK_SATIS_FIYAT_LISTELERI
            WHERE RTRIM(sfiyat_stokkod) = @productCode
              AND sfiyat_listesirano = expected.listNo
              AND sfiyat_deposirano = 0
              AND sfiyat_doviz = 0
              AND sfiyat_odemeplan = 0
              AND sfiyat_iptal = 0
              AND ISNULL(sfiyat_hidden, 0) = 0
            ORDER BY sfiyat_lastup_date DESC, sfiyat_create_date DESC
          ) actual
          ORDER BY expected.listNo;
        END TRY
        BEGIN CATCH
          IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;
          THROW;
        END CATCH;
      `);
    } catch (error: any) {
      const message = this.normalizeMikroErrorMessage(
        error,
        'Mikro maliyet/fiyat guncellemesi tamamlanamadi.'
      );
      const errorNumber = Number(error?.number || error?.originalError?.info?.number || 0);
      await this.logUcarerOperation({
        operationType: 'COST_UPDATE_FAILED',
        title: 'Stok maliyeti/fiyat listesi guncellenemedi',
        productCode,
        productName: previousProduct?.name || null,
        previousValues: {
          currentCost: previousProduct?.currentCost ?? null,
          currentCostDate: previousProduct?.currentCostDate || null,
        },
        newValues: { costP, costT },
        metadata: { updatePriceLists, errorNumber, error: message },
        userId: input.userId || null,
      });

      if (errorNumber === 51000) {
        throw new AppError(message, 404, ErrorCode.PRODUCT_NOT_FOUND);
      }
      if (errorNumber === 51001) {
        throw new AppError(message, 400, ErrorCode.INVALID_PROFIT_MARGIN);
      }
      if (errorNumber === 51002) {
        throw new AppError(message, 409, ErrorCode.INVALID_PRICE);
      }
      throw new AppError(message, 502, ErrorCode.MIKRO_CONNECTION_ERROR);
    }

    const updatedLists = priceWriteRows
      .map((row: any) => ({
        listNo: Number(row?.listNo || 0),
        value: Number(row?.value || 0),
        actualValue: Number(row?.actualValue || 0),
        affected: Number(row?.affected || 0),
        verified: Boolean(row?.verified),
      }))
      .filter((row) => STANDARD_PRICE_LIST_NOS.includes(row.listNo as any));
    const verifiedListNos = new Set(
      updatedLists.filter((row) => row.verified).map((row) => row.listNo)
    );
    const missingLists = updatePriceLists
      ? STANDARD_PRICE_LIST_NOS.filter((listNo) => !verifiedListNos.has(listNo))
      : [];

    if (
      updatePriceLists &&
      (updatedLists.length !== STANDARD_PRICE_LIST_NOS.length || missingLists.length > 0)
    ) {
      await this.logUcarerOperation({
        operationType: 'COST_UPDATE_FAILED',
        title: 'Mikro fiyat listesi sonucu dogrulanamadi',
        productCode,
        productName: previousProduct?.name || null,
        previousValues: {
          currentCost: previousProduct?.currentCost ?? null,
          currentCostDate: previousProduct?.currentCostDate || null,
        },
        newValues: { costP, costT },
        metadata: { updatePriceLists, updatedLists, missingLists },
        userId: input.userId || null,
      });
      throw new AppError(
        `Mikro fiyat dogrulamasi basarisiz. Dogrulanamayan listeler: ${missingLists.join(', ') || 'bilinmiyor'}`,
        409,
        ErrorCode.INVALID_PRICE
      );
    }

    const postgresSyncOperations: Prisma.PrismaPromise<any>[] = [
      prisma.product.updateMany({
        where: { mikroCode: productCode },
        data: {
          currentCost: costP,
          currentCostDate: newCostDate,
        },
      }),
    ];
    if (updatePriceLists) {
      for (const row of updatedLists) {
        const definition = getPriceListDefinition(row.listNo);
        if (!definition || definition.kind !== 'STANDARD' || !row.verified) continue;
        const baseCost = definition.costBasis === 'MALIYET_T' ? costT : costP;
        const currentMargin =
          row.actualValue > 0 && baseCost > 0
            ? Math.round(((row.actualValue - baseCost) / row.actualValue) * 100 * 10000) / 10000
            : null;
        postgresSyncOperations.push(
          prisma.productPriceListCurrent.upsert({
            where: {
              productCode_priceListNo: {
                productCode,
                priceListNo: row.listNo,
              },
            },
            create: {
              productCode,
              priceListNo: row.listNo,
              currentPrice: row.actualValue,
              currentCost: baseCost,
              currentMargin,
              syncedAt: newCostDate,
            },
            update: {
              currentPrice: row.actualValue,
              currentCost: baseCost,
              currentMargin,
              syncedAt: newCostDate,
            },
          })
        );
      }
    }
    await prisma.$transaction(postgresSyncOperations);

    const response = {
      productCode,
      currentCost: costP,
      costP,
      costT,
      priceListsUpdated:
        updatePriceLists &&
        missingLists.length === 0 &&
        updatedLists.length === STANDARD_PRICE_LIST_NOS.length,
      updatedLists,
      missingLists,
      verificationStatus: updatePriceLists ? 'VERIFIED' as const : 'NOT_REQUESTED' as const,
      verifiedListCount: verifiedListNos.size,
    };

    if (shouldAuditPriceFamily) {
      await prisma.priceFamilyCostUpdateLog.create({
        data: {
          familyId: priceFamilyContext?.id || input.priceFamilyId || null,
          familyName: priceFamilyContext?.name || null,
          productCode,
          productName: previousProduct?.name || null,
          previousCost: previousProduct?.currentCost ?? null,
          newCost: costP,
          previousCostDate: previousProduct?.currentCostDate || null,
          newCostDate,
          updatePriceLists,
          updatedLists: updatedLists as unknown as Prisma.InputJsonValue,
          missingLists: missingLists as unknown as Prisma.InputJsonValue,
          userId: input.userId || null,
        },
      });
    }

    if (!input.source || input.source === 'UCARER_DEPO') {
      await this.logUcarerOperation({
        operationType: 'COST_UPDATE',
        title: updatePriceLists ? 'Stok maliyeti ve fiyat listeleri guncellendi' : 'Stok maliyeti guncellendi',
        productCode,
        productName: previousProduct?.name || null,
        previousValues: {
          currentCost: previousProduct?.currentCost ?? null,
          currentCostDate: previousProduct?.currentCostDate || null,
        },
        newValues: {
          currentCost: costP,
          costP,
          costT,
          currentCostDate: newCostDate,
        },
        metadata: {
          updatePriceLists,
          updatedLists,
          missingLists,
          verificationStatus: response.verificationStatus,
          verifiedListCount: response.verifiedListCount,
        },
        userId: input.userId || null,
      });
    }

    return response;
  }

  /**
   * Tedarikci toplu maliyet uygulamasi icin ONIZLEME (SADECE OKUMA, Mikro YAZMA YOK).
   * updateUcarerProductCost ile AYNI formul: newCostP = newCostT * (1 + vat/200),
   * standart liste fiziksel numara/maliyet/marj eslemesi merkezi registry'den gelir.
   */
  async computeSupplierApplyPreview(
    items: Array<{ productCode: string; newCostT: number }>
  ): Promise<{
    products: Array<{
      productCode: string;
      name: string | null;
      currentCostT: number | null;
      newCostT: number;
      costIncreasePct: number | null;
      newCostP: number;
      vatRate: number;
      priceLists: Array<{ listNo: number; oldPrice: number | null; newPrice: number; increasePct: number | null }>;
      outlier: boolean;
      outlierReason: string | null;
    }>;
    summary: { count: number; avgCostIncreasePct: number | null; outlierCount: number };
  }> {
    // 1) Girdiyi normalize et (kod upper/trim, gecerli newCostT)
    const normalized: Array<{ productCode: string; newCostT: number }> = [];
    const seen = new Set<string>();
    for (const raw of items || []) {
      const productCode = String(raw?.productCode || '').trim().toUpperCase();
      const newCostT = Number(raw?.newCostT);
      if (!productCode || !Number.isFinite(newCostT) || newCostT <= 0) continue;
      if (seen.has(productCode)) continue;
      seen.add(productCode);
      normalized.push({ productCode, newCostT });
    }

    const codes = normalized.map((it) => it.productCode);
    if (codes.length > 0) {
      await this.assertStandardPriceUserColumns();
    }

    // 2) Prisma: name + vatRate (yuzde olarak; vatRate fraction (0.20) ise *100, default 20)
    const nameMap = new Map<string, string | null>();
    const vatPctMap = new Map<string, number>();
    if (codes.length) {
      const products = await prisma.product.findMany({
        where: { mikroCode: { in: codes } },
        select: { mikroCode: true, name: true, vatRate: true },
      });
      for (const p of products) {
        const code = String(p.mikroCode || '').trim().toUpperCase();
        nameMap.set(code, p.name ?? null);
        const rawVat = Number(p.vatRate);
        let vatPct = Number.isFinite(rawVat) && rawVat > 0 ? (rawVat <= 1 ? rawVat * 100 : rawVat) : 20;
        if (!Number.isFinite(vatPct) || vatPct <= 0) vatPct = 20;
        vatPctMap.set(code, vatPct);
      }
    }

    // 3) Mikro BATCH oku: STOKLAR + STOKLAR_USER (MaliyetT/MaliyetP/Marj_1..6)
    const parseMargin = (value: unknown) => {
      const raw = String(value ?? '').trim().replace(',', '.');
      const num = Number(raw);
      return Number.isFinite(num) ? num : 0;
    };
    const parseNum = (value: unknown) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    };

    const currentCostTMap = new Map<string, number | null>();
    const currentCostPMap = new Map<string, number | null>();
    const marginsMap = new Map<string, number[]>();
    // listePrice map: code -> { listNo -> fiyat }
    const listPriceMap = new Map<string, Map<number, number>>();

    for (const chunk of chunkArray(codes, 200)) {
      if (!chunk.length) continue;
      const inClause = chunk.map((code) => `'${escapeSqlLiteral(code)}'`).join(', ');

      const stockRows = await mikroService.executeQuery(`
        SELECT
          RTRIM(s.sto_kod) AS sto_kod,
          u.MaliyetT,
          u.MaliyetP,
          u.Marj_1,
          u.Marj_2,
          u.Marj_3,
          u.Marj_4,
          u.Marj_5,
          u.Marj_6
        FROM STOKLAR s WITH (NOLOCK)
        LEFT JOIN STOKLAR_USER u ON s.sto_Guid = u.Record_uid
        WHERE RTRIM(s.sto_kod) IN (${inClause})
      `);
      for (const row of stockRows || []) {
        const code = String(row?.sto_kod || '').trim().toUpperCase();
        if (!code) continue;
        currentCostTMap.set(code, parseNum(row?.MaliyetT));
        currentCostPMap.set(code, parseNum(row?.MaliyetP));
        marginsMap.set(code, [
          parseMargin(row?.Marj_1),
          parseMargin(row?.Marj_2),
          parseMargin(row?.Marj_3),
          parseMargin(row?.Marj_4),
          parseMargin(row?.Marj_5),
          parseMargin(row?.Marj_6),
        ]);
      }

      const priceRows = await mikroService.executeQuery(`
        SELECT
          RTRIM(sfiyat_stokkod) AS sfiyat_stokkod,
          sfiyat_listesirano,
          sfiyat_fiyati,
          COUNT(*) OVER (
            PARTITION BY RTRIM(sfiyat_stokkod), sfiyat_listesirano
          ) AS candidateCount
        FROM STOK_SATIS_FIYAT_LISTELERI WITH (NOLOCK)
        WHERE RTRIM(sfiyat_stokkod) IN (${inClause})
          AND sfiyat_listesirano IN (${STANDARD_PRICE_LIST_NOS.join(', ')})
          AND sfiyat_deposirano = 0
          AND sfiyat_doviz = 0
          AND sfiyat_odemeplan = 0
          AND sfiyat_iptal = 0
          AND ISNULL(sfiyat_hidden, 0) = 0
      `);
      for (const row of priceRows || []) {
        const code = String(row?.sfiyat_stokkod || '').trim().toUpperCase();
        if (!code) continue;
        const listNo = Number(row?.sfiyat_listesirano);
        const price = parseNum(row?.sfiyat_fiyati);
        if (!Number.isFinite(listNo) || price === null) continue;
        if (Number(row?.candidateCount || 0) > 1) {
          throw new AppError(
            `${code} stokunun ${listNo} numarali fiyat listesinde birden ` +
              'fazla aktif canonical satir var; onizleme durduruldu.',
            409,
            ErrorCode.INVALID_PRICE
          );
        }
        if (!listPriceMap.has(code)) listPriceMap.set(code, new Map<number, number>());
        listPriceMap.get(code)!.set(listNo, price);
      }
    }

    // 4) Her urun icin onizleme satiri uret (updateUcarerProductCost ile AYNI formul)
    const products = normalized.map((it) => {
      const code = it.productCode;
      const vatPct = vatPctMap.get(code) ?? 20;
      // DOGRU T/P: tedarikci secilen maliyet = NET (KDV haric).
      // Mikro MaliyetP = net (-> listeler 6-10 / faturali), MaliyetT = net*(1+yariKDV) (-> listeler 1-5 / perakende).
      const supplierNet = it.newCostT;
      const mikroCostP = supplierNet;
      const mikroCostT = supplierNet * (1 + vatPct / 200);
      // Karsilastirma NET bazinda: mevcut MaliyetP (net) vs tedarikci net.
      const currentCostT = currentCostPMap.has(code) ? currentCostPMap.get(code)! : null;
      const margins = marginsMap.get(code) || [0, 0, 0, 0, 0, 0];
      const currentLists = listPriceMap.get(code) || new Map<number, number>();
      const invalidMarginIndex = margins.findIndex(
        (margin) => !Number.isFinite(margin) || margin <= 0
      );
      if (invalidMarginIndex >= 0) {
        throw new AppError(
          `${code} icin Marj_${invalidMarginIndex + 1} eksik veya gecersiz; fiyat onizlemesi olusturulmadi.`,
          400,
          ErrorCode.INVALID_PROFIT_MARGIN
        );
      }

      const costIncreasePct =
        currentCostT !== null && currentCostT > 0
          ? ((supplierNet - currentCostT) / currentCostT) * 100
          : null;

      const priceLists: Array<{ listNo: number; oldPrice: number | null; newPrice: number; increasePct: number | null }> = [];
      for (const definition of STANDARD_PRICE_LIST_DEFINITIONS) {
        const margin = margins[Number(definition.marginSlot) - 1];
        const listNo = definition.listNo;
        const baseCost = definition.costBasis === 'MALIYET_T' ? mikroCostT : mikroCostP;
        const newPrice = baseCost * margin;
        const oldPrice = currentLists.has(listNo) ? currentLists.get(listNo)! : null;
        priceLists.push({
          listNo,
          oldPrice,
          newPrice,
          increasePct:
            oldPrice !== null && oldPrice > 0
              ? ((newPrice - oldPrice) / oldPrice) * 100
              : null,
        });
      }
      priceLists.sort((a, b) => a.listNo - b.listNo);

      return {
        productCode: code,
        name: nameMap.has(code) ? nameMap.get(code)! : null,
        currentCostT,            // mevcut NET maliyet (Mikro MaliyetP)
        newCostT: supplierNet,   // yeni NET maliyet (tedarikci, KDV haric)
        costIncreasePct,
        newCostP: mikroCostT,    // KDV-dahil (yari-KDV eklenmis) maliyet
        vatRate: vatPct,
        priceLists,
        // outlier alanlari asagidaki ikinci gecişte doldurulur
        outlier: false as boolean,
        outlierReason: null as string | null,
      };
    });

    // 5) AYKIRI tespiti: gecerli costIncreasePct lerin ortalama + std sapmasi
    const validPcts = products
      .map((p) => p.costIncreasePct)
      .filter((x): x is number => x !== null && Number.isFinite(x));
    const count = validPcts.length;
    const mean = count > 0 ? validPcts.reduce((s, x) => s + x, 0) / count : 0;
    const variance = count > 0 ? validPcts.reduce((s, x) => s + (x - mean) * (x - mean), 0) / count : 0;
    const std = Math.sqrt(variance);

    let outlierCount = 0;
    for (const p of products) {
      const reasons: string[] = [];
      if (p.currentCostT === null) {
        reasons.push('Referans maliyet (net) yok');
      } else if (p.costIncreasePct !== null && p.costIncreasePct < 0) {
        reasons.push('Maliyet dusmus (negatif degisim)');
      }
      if (
        p.costIncreasePct !== null &&
        Number.isFinite(p.costIncreasePct) &&
        std > 0 &&
        Math.abs(p.costIncreasePct - mean) > 2 * std
      ) {
        reasons.push('Ortalamadan 2 standart sapma uzakta');
      }
      if (reasons.length) {
        p.outlier = true;
        p.outlierReason = reasons.join('; ');
        outlierCount += 1;
      }
    }

    const avgCostIncreasePct = count > 0 ? mean : null;

    return {
      products,
      summary: { count: products.length, avgCostIncreasePct, outlierCount },
    };
  }

  /**
   * Tedarikci toplu maliyet UYGULAMA (MIKRO YAZAR — her item icin updateUcarerProductCost).
   * Onizleme ile AYNI formul: costP = newCostT * (1 + vat/200), updatePriceLists:true.
   */
  async applySupplierCostBulk(
    items: Array<{ productCode: string; newCostT: number }>,
    userId?: string | null
  ): Promise<{
    results: Array<{ productCode: string; ok: boolean; error?: string }>;
    okCount: number;
    failCount: number;
  }> {
    // vatRate okumak icin onizleme ile ayni normalize + map
    const normalized: Array<{ productCode: string; newCostT: number }> = [];
    const seen = new Set<string>();
    for (const raw of items || []) {
      const productCode = String(raw?.productCode || '').trim().toUpperCase();
      const newCostT = Number(raw?.newCostT);
      if (!productCode || !Number.isFinite(newCostT) || newCostT <= 0) continue;
      if (seen.has(productCode)) continue;
      seen.add(productCode);
      normalized.push({ productCode, newCostT });
    }

    const codes = normalized.map((it) => it.productCode);
    const vatPctMap = new Map<string, number>();
    if (codes.length) {
      const products = await prisma.product.findMany({
        where: { mikroCode: { in: codes } },
        select: { mikroCode: true, vatRate: true },
      });
      for (const p of products) {
        const code = String(p.mikroCode || '').trim().toUpperCase();
        const rawVat = Number(p.vatRate);
        let vatPct = Number.isFinite(rawVat) && rawVat > 0 ? (rawVat <= 1 ? rawVat * 100 : rawVat) : 20;
        if (!Number.isFinite(vatPct) || vatPct <= 0) vatPct = 20;
        vatPctMap.set(code, vatPct);
      }
    }

    const results: Array<{ productCode: string; ok: boolean; error?: string }> = [];
    let okCount = 0;
    let failCount = 0;

    for (const it of normalized) {
      const code = it.productCode;
      try {
        const vatPct = vatPctMap.get(code) ?? 20;
        // DOGRU T/P: tedarikci maliyeti = NET (KDV haric). MaliyetP = net, MaliyetT = net*(1+yariKDV).
        const costP = it.newCostT;
        const costT = it.newCostT * (1 + vatPct / 200);
        await this.updateUcarerProductCost({
          productCode: code,
          costP,
          costT,
          updatePriceLists: true,
          source: 'SUPPLIER_COST',
          userId: userId || null,
        });
        results.push({ productCode: code, ok: true });
        okCount += 1;
      } catch (error: any) {
        results.push({ productCode: code, ok: false, error: error?.message || 'Bilinmeyen hata' });
        failCount += 1;
      }
    }

    return { results, okCount, failCount };
  }

  async updateUcarerMainSupplier(input: {
    productCode: string;
    supplierCode: string;
    userId?: string | null;
  }): Promise<{
    productCode: string;
    supplierCode: string;
    supplierName: string | null;
  }> {
    const productCode = String(input.productCode || '').trim().toUpperCase();
    const supplierCode = String(input.supplierCode || '').trim().toUpperCase();

    if (!productCode) {
      throw new AppError('Stok kodu zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }
    if (!supplierCode) {
      throw new AppError('Saglayici kodu zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }

    const escapedProductCode = productCode.replace(/'/g, "''");
    const escapedSupplierCode = supplierCode.replace(/'/g, "''");
    const previousRows = await mikroService.executeQuery(`
      SELECT TOP 1
        LTRIM(RTRIM(ISNULL(s.sto_isim, ''))) AS productName,
        LTRIM(RTRIM(ISNULL(s.sto_sat_cari_kod, ''))) AS previousSupplierCode,
        LTRIM(RTRIM(ISNULL(c.cari_unvan1, ''))) AS previousSupplierName
      FROM STOKLAR s
      LEFT JOIN CARI_HESAPLAR c ON c.cari_kod = LTRIM(RTRIM(ISNULL(s.sto_sat_cari_kod, '')))
      WHERE s.sto_kod = '${escapedProductCode}'
    `);
    const previousRow = previousRows?.[0] || {};
    await mikroService.executeQuery(`
      UPDATE STOKLAR
      SET sto_sat_cari_kod = '${escapedSupplierCode}'
      WHERE sto_kod = '${escapedProductCode}'
    `);

    const supplierRows = await mikroService.executeQuery(`
      SELECT TOP 1 LTRIM(RTRIM(ISNULL(cari_unvan1, ''))) AS supplierName
      FROM CARI_HESAPLAR
      WHERE cari_kod = '${escapedSupplierCode}'
    `);
    const supplierName = String(supplierRows?.[0]?.supplierName || '').trim() || null;

    const result = {
      productCode,
      supplierCode,
      supplierName,
    };

    await this.logUcarerOperation({
      operationType: 'MAIN_SUPPLIER_UPDATE',
      title: 'Ana saglayici guncellendi',
      productCode,
      productName: String(previousRow?.productName || '').trim() || null,
      supplierCode,
      supplierName,
      previousValues: {
        supplierCode: String(previousRow?.previousSupplierCode || '').trim().toUpperCase() || null,
        supplierName: String(previousRow?.previousSupplierName || '').trim() || null,
      },
      newValues: {
        supplierCode,
        supplierName,
      },
      userId: input.userId || null,
    });

    return result;
  }

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

    // WHERE koÅŸullarÄ±
    const whereConditions = [
      'sth_cins = 0',  // SatÄ±ÅŸ hareketleri
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

    // MÃ¼ÅŸteri detaylarÄ±nÄ± Ã§ek
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

    // Kar ve kar marjÄ±nÄ± hesapla
    const customers = rawData.map((row: any) => ({
      customerCode: row.customerCode,
      customerName: row.customerName || 'Bilinmeyen MÃ¼ÅŸteri',
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

  /**
   * GET /admin/reports/discount-below-entry-cost
   *
   * İndirimli (özel/OZEL faturalı, KDV hariç) fiyatı son giriş maliyetinin
   * (lastEntryPrice) ALTINDA kalan, indirimli havuzdaki ürünleri listeler.
   * Amaç: güncel maliyeti hatalı/eski kalmış ürünleri periyodik olarak yakalamak.
   *
   * Kural (hepsi sağlanmalı):
   *  - active = true, hiddenFromCustomers = false
   *  - excessStock > 0 (indirimli/fazla stok havuzunda)
   *  - lastEntryPrice IS NOT NULL AND > 0
   *  - discountedInvoiced < lastEntryPrice
   *    discountedInvoiced = (prices -> 'OZEL' ->> 'INVOICED')::float
   */
  async getDiscountBelowEntryCostReport(): Promise<{
    items: Array<{
      mikroCode: string;
      name: string;
      discountedInvoiced: number;
      lastEntryPrice: number;
      currentCost: number | null;
      calculatedCost: number | null;
      excessStock: number;
      vatRate: number;
      gap: number;
      lossPct: number;
    }>;
    totalCount: number;
    totalRiskTL: number;
  }> {
    const rows = await prisma.$queryRaw<
      Array<{
        mikroCode: string;
        name: string;
        discountedInvoiced: number;
        lastEntryPrice: number;
        currentCost: number | null;
        calculatedCost: number | null;
        excessStock: number;
        vatRate: number;
        gap: number;
      }>
    >(Prisma.sql`
      SELECT
        "mikroCode",
        "name",
        ("prices" -> 'OZEL' ->> 'INVOICED')::float8 AS "discountedInvoiced",
        "lastEntryPrice",
        "currentCost",
        "calculatedCost",
        "excessStock",
        "vatRate",
        ("lastEntryPrice" - ("prices" -> 'OZEL' ->> 'INVOICED')::float8) AS "gap"
      FROM "Product"
      WHERE "active" = true
        AND "hiddenFromCustomers" = false
        AND "excessStock" > 0
        AND "lastEntryPrice" IS NOT NULL
        AND "lastEntryPrice" > 0
        AND ("prices" -> 'OZEL' ->> 'INVOICED') IS NOT NULL
        AND ("prices" -> 'OZEL' ->> 'INVOICED')::float8 < "lastEntryPrice"
      ORDER BY "gap" DESC
    `);

    const items = rows.map((row) => {
      const gap = Number(row.gap) || 0;
      const lastEntryPrice = Number(row.lastEntryPrice) || 0;
      return {
        mikroCode: row.mikroCode,
        name: row.name,
        discountedInvoiced: Number(row.discountedInvoiced) || 0,
        lastEntryPrice,
        currentCost: row.currentCost !== null ? Number(row.currentCost) : null,
        calculatedCost: row.calculatedCost !== null ? Number(row.calculatedCost) : null,
        excessStock: Number(row.excessStock) || 0,
        vatRate: Number(row.vatRate) || 0,
        gap,
        lossPct: lastEntryPrice > 0 ? (gap / lastEntryPrice) * 100 : 0,
      };
    });

    const totalRiskTL = items.reduce((sum, it) => sum + it.gap * it.excessStock, 0);

    return {
      items,
      totalCount: items.length,
      totalRiskTL,
    };
  }
}

export default new ReportsService();







