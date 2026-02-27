/**
 * Reports Service
 *
 * Raporları PostgreSQL'den (senkronize edilmiş verilerden) üretir.
 * Mikro'ya her seferinde bağlanmaya gerek yok, sabah sync'te çekilen veriler kullanılır.
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
import * as XLSX from 'xlsx';

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
  expectedMargin: number; // % kar marjÄ± (e.g., 60 for 1.6x multiplier)
  expectedPrice: number;
  actualPrice: number;
  deviation: number; // % deviation
  deviationAmount: number; // TL deviation
  status: 'OK' | 'HIGH' | 'LOW'; // OK: Â±2%, HIGH: >2%, LOW: <-2%
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
  missingComplements: ComplementMissingItem[];
  missingCount: number;
}

interface ComplementMissingReportResponse {
  rows: ComplementMissingRow[];
  summary: {
    totalRows: number;
    totalMissing: number;
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
  };
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

const STAFF_ACTIVITY_HIDDEN_ROUTE_TOKENS = ['/notifications'];

const UCARER_MERKEZ_DEPO_SQL = `
SELECT
DMD.[STOK KODU],
DMD.[STOK ADI],
DMD.[Merkez Depo] AS [Merkez Depo Miktarı],
DMD.[Alınan Siparişte Bekleyen],
DMD.[Alınan Siparis Tarihi] AS [Alınan Sipariş İlk Tarihi],
DMD.[SIPARIS SONRASI DEPODAKI MIKTAR] AS [Alınan Sipariş Sonrası Depo İhtiaç Durumu 1.SORUN],
ISNULL((SELECT KALAN FROM DEPOLAR_ARASI_SIPARIS_PORTO WHERE SKOD=DMD.[STOK KODU] AND DEPO='1'),0) AS [Diğer Depolardan Gelecek Dsv Toplamları],
(DMD.[SIPARIS SONRASI DEPODAKI MIKTAR])+(ISNULL((SELECT KALAN FROM DEPOLAR_ARASI_SIPARIS_PORTO WHERE SKOD=DMD.[STOK KODU] AND DEPO='1'),0)) AS [Gelecek Dsv Sonrası İhtiyaç Durumu 2. SORUN],
DMD.[Verilen Siparişte Bekleyen],
CASE
WHEN DMD.[Verilen Tarihi]='01.01.1900' THEN ''
WHEN DMD.[Verilen Tarihi]NOT LIKE '01.01.1900' THEN DMD.[Verilen Tarihi] END AS [Verilen Sipariş Son Tarihi],
DMD.[DEPO + VERILEN SIPARIS MIKTARI],
DMD.[REEL MIKTAR] AS [Satınalma Siparişi Sonrası İhtiyaç Durumu 3.SORUN],
DMD.[Merkez Minimum Miktar],
DMD.[Merkez Maximum Miktar],
CASE
WHEN DMD.[REEL MIKTAR]<DMD.[Merkez Minimum Miktar] THEN ((DMD.[Merkez Maximum Miktar])-(DMD.[REEL MIKTAR]))
WHEN DMD.[REEL MIKTAR]>DMD.[Merkez Minimum Miktar] AND DMD.[Merkez Minimum Miktar]='0' THEN ((DMD.[Merkez Maximum Miktar])-(DMD.[REEL MIKTAR]))
WHEN DMD.[REEL MIKTAR]>DMD.[Merkez Minimum Miktar] AND DMD.[REEL MIKTAR]>DMD.[Merkez Maximum Miktar] THEN ((DMD.[Merkez Maximum Miktar])-(DMD.[REEL MIKTAR]))
WHEN DMD.[REEL MIKTAR]>DMD.[Merkez Minimum Miktar] THEN '0'
WHEN DMD.[REEL MIKTAR]=DMD.[Merkez Minimum Miktar] THEN '0'
END AS [Eksiltilecek İlve Verilecek İşlem Yapılmayacak Miktar Durumu 4. SORUN],
dbo.fn_DepodakiMiktar(DMD.[STOK KODU],7,0) as [Dükkan Depo],
dbo.fn_DepodakiMiktar(DMD.[STOK KODU],1,0) as [Merkez Depo],
dbo.fn_DepodakiMiktar(DMD.[STOK KODU],2,0) as [Ereğli Depo],
dbo.fn_DepodakiMiktar(DMD.[STOK KODU],6,0) as [Topca Depo],
(dbo.fn_DepodakiMiktar(DMD.[STOK KODU],6,0))+(dbo.fn_DepodakiMiktar(DMD.[STOK KODU],2,0))+(dbo.fn_DepodakiMiktar(DMD.[STOK KODU],1,0))+(dbo.fn_DepodakiMiktar(DMD.[STOK KODU],7,0)) AS [4 Depo Toplam Miktarı]
FROM DEPO_MERKEZ_DURUM DMD
`;

const UCARER_TOPCA_DEPO_SQL = `
SELECT
DTD.[STOK KODU],
DTD.[STOK ADI],
DTD.[Topca Depo] AS [Topca Depo Miktarı],
DTD.[Alınan Siparişte Bekleyen],
DTD.[Alınan Siparis Tarihi] AS [Alınan Sipariş İlk Tarihi],
DTD.[SIPARIS SONRASI DEPODAKI MIKTAR] AS [Alınan Sipariş Sonrası Depo İhtiaç Durumu 1.SORUN],
ISNULL((SELECT KALAN FROM DEPOLAR_ARASI_SIPARIS_PORTO WHERE SKOD=DTD.[STOK KODU] AND DEPO='6'),0) AS [Diğer Depolardan Gelecek Dsv Toplamları],
(DTD.[SIPARIS SONRASI DEPODAKI MIKTAR])+(ISNULL((SELECT KALAN FROM DEPOLAR_ARASI_SIPARIS_PORTO WHERE SKOD=DTD.[STOK KODU] AND DEPO='6'),0)) AS [Gelecek Dsv Sonrası İhtiyaç Durumu 2. SORUN],
DTD.[Verilen Siparişte Bekleyen],
CASE
WHEN DTD.[Verilen Tarihi]='01.01.1900' THEN ''
WHEN DTD.[Verilen Tarihi]NOT LIKE '01.01.1900' THEN DTD.[Verilen Tarihi] END AS [Verilen Sipariş Son Tarihi],
DTD.[DEPO + VERILEN SIPARIS MIKTARI],
DTD.[REEL MIKTAR] AS [Satınalma Siparişi Sonrası İhtiyaç Durumu 3.SORUN],
DTD.[Merkez Minimum Miktar],
DTD.[Merkez Maximum Miktar],
CASE
WHEN DTD.[REEL MIKTAR]<DTD.[Merkez Minimum Miktar] THEN ((DTD.[Merkez Maximum Miktar])-(DTD.[REEL MIKTAR]))
WHEN DTD.[REEL MIKTAR]>DTD.[Merkez Minimum Miktar] AND DTD.[Merkez Minimum Miktar]='0' THEN ((DTD.[Merkez Maximum Miktar])-(DTD.[REEL MIKTAR]))
WHEN DTD.[REEL MIKTAR]>DTD.[Merkez Minimum Miktar] AND DTD.[REEL MIKTAR]>DTD.[Merkez Maximum Miktar] THEN ((DTD.[Merkez Maximum Miktar])-(DTD.[REEL MIKTAR]))
WHEN DTD.[REEL MIKTAR]>DTD.[Merkez Minimum Miktar] THEN '0'
WHEN DTD.[REEL MIKTAR]=DTD.[Merkez Minimum Miktar] THEN '0'
END AS [Eksiltilecek İlve Verilecek İşlem Yapılmayacak Miktar Durumu 4. SORUN],
dbo.fn_DepodakiMiktar(DTD.[STOK KODU],7,0) as [Dükkan Depo],
dbo.fn_DepodakiMiktar(DTD.[STOK KODU],1,0) as [Merkez Depo],
dbo.fn_DepodakiMiktar(DTD.[STOK KODU],2,0) as [Ereğli Depo],
dbo.fn_DepodakiMiktar(DTD.[STOK KODU],6,0) as [Topça Depo],
(dbo.fn_DepodakiMiktar(DTD.[STOK KODU],6,0))+(dbo.fn_DepodakiMiktar(DTD.[STOK KODU],2,0))+(dbo.fn_DepodakiMiktar(DTD.[STOK KODU],1,0))+(dbo.fn_DepodakiMiktar(DTD.[STOK KODU],7,0)) AS [4 Depo Toplam Miktarı]
FROM DEPO_TOPCA_DURUM DTD
`;

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
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/Ä±/g, 'i')
    .replace(/Å/g, 's')
    .replace(/Ä/g, 'g')
    .replace(/Ã¼/g, 'u')
    .replace(/Ã¶/g, 'o')
    .replace(/Ã§/g, 'c')
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
  const direct = pickValueByKeys(data, ['BirimKarOrtMalGore']);
  if (direct !== null && direct !== undefined) {
    return toNumber(direct);
  }
  const fallback = findValueByToken(data, 'birimkarortmal');
  return toNumber(fallback);
};

const pickAvgMargin = (data: Record<string, any>): number => {
  const direct = pickValueByKeys(data, ['OrtalamaKarYuzde']);
  if (direct !== null && direct !== undefined) {
    return toNumber(direct);
  }
  const fallback = findValueByToken(data, 'ortalamakaryuzde');
  return toNumber(fallback);
};

const pickEntryProfit = (data: Record<string, any>): number => {
  const direct = pickValueByKeys(data, ['SÖ-ToplamKar']);
  if (direct !== null && direct !== undefined) {
    return toNumber(direct);
  }
  const fallback = findValueByNormalizedToken(data, 'sotoplamkar');
  return toNumber(fallback);
};


const pickStockName = (data: Record<string, any>): string => {
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
  const direct = pickValueByKeys(data, [
    'Cari Ismi',
    'Cari Ä°smi',
    'Cari Ã„Â°smi',
    'Cari Ãƒâ€Ã‚Â°smi',
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

const pickRevenue = (data: Record<string, any>): number => {
  const direct = pickValueByKeys(data, ['Tutar']);
  if (direct !== null && direct !== undefined) {
    return toNumber(direct);
  }
  const fallback = pickValueByKeys(data, ['TutarKDV', 'Tutar KDV', 'Tutar KDVli']);
  return toNumber(fallback);
};

const pickUnitPrice = (data: Record<string, any>): number => {
  const direct = pickValueByKeys(data, [
    'BirimFiyat',
    'Birim Fiyat',
    'BirimSatis',
    'BirimSatÄ±ÅŸ',
    'BirimSatisKDV',
    'BirimSatÄ±ÅŸKDV',
    'BirimSatÄ±ÅŸKDVli',
  ]);
  if (direct !== null && direct !== undefined) {
    return toNumber(direct);
  }
  const revenue = pickRevenue(data);
  const quantity = pickQuantity(data);
  return quantity > 0 ? revenue / quantity : 0;
};

const buildMarginAlertRow = (
  row: { avgMargin?: number | null; data?: unknown }
): MarginAlertRow => {
  const data = getRowData(row);
  const revenue = pickRevenue(data);
  const profit = pickTotalProfit(data);
  const entryProfit = pickEntryProfit(data);
  const avgMargin = Number.isFinite(row.avgMargin) ? Number(row.avgMargin) : pickAvgMargin(data);
  const entryMargin = revenue > 0 ? (entryProfit / revenue) * 100 : 0;
  const quantity = pickQuantity(data);
  const unit = pickUnit(data);

  return {
    documentNo: resolveDocumentKey(data) || '',
    documentType: pickDocumentType(data),
    customerName: pickCustomerName(data),
    productCode: pickStockCode(data),
    productName: pickStockName(data),
    quantity,
    unit,
    quantityLabel: unit ? `${quantity} ${unit}` : `${quantity}`,
    unitPrice: pickUnitPrice(data),
    revenue,
    profit,
    entryProfit,
    avgMargin,
    entryMargin,
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
  rows: Array<{ avgMargin?: number | null; data?: unknown }>,
  field: 'avgMargin' | 'entryMargin'
): MarginAlertSet => {
  const negative: MarginAlertRow[] = [];
  const low: MarginAlertRow[] = [];
  const high: MarginAlertRow[] = [];

  rows.forEach((row) => {
    const alertRow = buildMarginAlertRow(row);
    const marginValue = Number.isFinite(alertRow[field]) ? alertRow[field] : 0;
    if (marginValue < 0) {
      negative.push(alertRow);
    } else if (marginValue < 5) {
      low.push(alertRow);
    }
    if (marginValue > 70) {
      high.push(alertRow);
    }
  });

  sortAlertRows(negative, 'asc', field);
  sortAlertRows(low, 'asc', field);
  sortAlertRows(high, 'desc', field);

  return { negative, low, high };
};

const buildAlertSummary = (
  rows: Array<{ avgMargin?: number | null; data?: unknown }>
): MarginAlertSummary => ({
  current: buildAlertSet(rows, 'avgMargin'),
  entry: buildAlertSet(rows, 'entryMargin'),
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
    const profit = pickTotalProfit(data);
    const entryProfit = pickEntryProfit(data);
    const current = map.get(key) || {
      key,
      name,
      revenue: 0,
      profit: 0,
      entryProfit: 0,
      avgMargin: 0,
      entryMargin: 0,
      count: 0,
    };
    current.revenue += revenue;
    current.profit += profit;
    current.entryProfit += entryProfit;
    current.count += 1;
    map.set(key, current);
  });

  const results = Array.from(map.values()).map((entry) => {
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
  const bottom = [...aggregates].sort((a, b) => a.avgMargin - b.avgMargin).slice(0, limit);
  return { top, bottom };
};

const shouldExcludeMarginRow = (data: Record<string, any>): boolean => {
  const stockName = pickStockName(data);
  if (!stockName) return false;
  return normalizeKeyToken(stockName).includes('diversey');
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
  'totalAmount',
  'avgCost',
  'unitProfit',
  'totalProfit',
  'margin',
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
    resolve: (data) => resolveDataValueByCandidates(data, ['Cari Ä°smi', 'Cari Ã„Â°smi', 'Cari Ismi', 'Cari İsmi'], 'cariismi'),
  },
  stockCode: {
    label: 'Stok Kodu',
    resolve: (data) => resolveDataValueByCandidates(data, ['Stok Kodu'], 'stokkodu'),
  },
  stockName: {
    label: 'ÃœrÃ¼n AdÄ±',
    resolve: (data) => resolveDataValueByCandidates(data, ['Stok Ä°smi', 'Stok Ã„Â°smi', 'Stok Ismi', 'Stok İsmi'], 'stokismi'),
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
    label: 'Birim SatÄ±ÅŸ',
    resolve: (data) => resolveDataValueByCandidates(data, ['BirimSatÄ±ÅŸKDV', 'BirimSatÃ„Â±Ã…Å¾KDV', 'BirimSatisKDV', 'BirimSatışKDV'], 'birimsatiskdv'),
  },
  totalAmount: {
    label: 'Tutar (KDV)',
    resolve: (data) => resolveDataValueByCandidates(data, ['TutarKDV'], 'tutarkdv'),
  },
  avgCost: {
    label: 'Ort. Maliyet',
    resolve: (data) => resolveDataValueByCandidates(data, ['OrtalamaMaliyetKDVli'], 'ortalamamaliyetkdvli'),
  },
  unitProfit: {
    label: 'Birim Kar',
    resolve: (data) => pickUnitProfit(data),
  },
  totalProfit: {
    label: 'Toplam Kar',
    resolve: (data) => pickTotalProfit(data),
  },
  margin: {
    label: 'Kar %',
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
  totalProfit: number;
  entryProfit: number;
  avgMargin: number;
  negativeLines: number;
  negativeDocuments: number;
};

type MarginComplianceSummary = {
  totalRecords: number;
  totalDocuments: number;
  totalRevenue: number;
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
  customerName: string;
  productCode: string;
  productName: string;
  quantity: number;
  unit: string;
  quantityLabel: string;
  unitPrice: number;
  revenue: number;
  profit: number;
  entryProfit: number;
  avgMargin: number;
  entryMargin: number;
};

type MarginAlertSet = {
  negative: MarginAlertRow[];
  low: MarginAlertRow[];
  high: MarginAlertRow[];
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
};

type MarginComplianceEmailSummary = MarginComplianceSummary & {
  alerts: MarginAlertGroups;
  topBottom: MarginTopBottomSummary;
  sevenDaySummary: MarginSevenDaySummary;
};

const normalizeReportText = (value: unknown): string => {
  const raw = String(value || '').toLowerCase();
  return raw
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
};

const resolveReportType = (data: Record<string, any>): 'order' | 'sale' => {
  const tip = normalizeReportText(pickValueByKeys(data, ['Tip']));
  if (tip.includes('siparis')) return 'order';
  if (tip.includes('irsaliye') || tip.includes('fatura')) return 'sale';
  return 'sale';
};

const resolveDocumentKey = (data: Record<string, any>): string | null => {
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
  const docMap = new Map<string, { profit: number; revenue: number }>();
  let totalRevenue = 0;
  let totalProfit = 0;
  let entryProfit = 0;
  let negativeLines = 0;

  rows.forEach((row) => {
    const data = getRowData(row);
    const revenue = toNumber(pickValueByKeys(data, ['Tutar']));
    const profit = pickTotalProfit(data);
    const entryProfitValue = pickEntryProfit(data);
    totalRevenue += revenue;
    totalProfit += profit;
    entryProfit += entryProfitValue;
    if (profit < 0) {
      negativeLines += 1;
    }

    const docKey = resolveDocumentKey(data);
    if (docKey) {
      const prefix = useTypePrefix ? `${resolveReportType(data)}:` : '';
      const key = `${prefix}${docKey}`;
      const entry = docMap.get(key) || { profit: 0, revenue: 0 };
      entry.profit += profit;
      entry.revenue += revenue;
      docMap.set(key, entry);
    }
  });

  let negativeDocuments = 0;
  for (const entry of docMap.values()) {
    if (entry.profit < 0) {
      negativeDocuments += 1;
    }
  }

  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  return {
    totalRecords: rows.length,
    totalDocuments: docMap.size,
    totalRevenue,
    totalProfit,
    entryProfit,
    avgMargin,
    negativeLines,
    negativeDocuments,
  };
};

const buildMarginComplianceSummary = (
  rows: Array<{ avgMargin?: number | null; data?: unknown; sectorCode?: string | null }>
): MarginComplianceSummary => {
  const orderRows: Array<{ avgMargin?: number | null; data?: unknown; sectorCode?: string | null }> = [];
  const salesRows: Array<{ avgMargin?: number | null; data?: unknown; sectorCode?: string | null }> = [];
  const salespeople = new Map<string, { orderRows: Array<{ avgMargin?: number | null; data?: unknown; sectorCode?: string | null }>; salesRows: Array<{ avgMargin?: number | null; data?: unknown; sectorCode?: string | null }> }>();

  let highMarginCount = 0;
  let lowMarginCount = 0;
  let negativeMarginCount = 0;

  rows.forEach((row) => {
    const data = getRowData(row);
    const marginValue = Number.isFinite(row.avgMargin) ? Number(row.avgMargin) : pickAvgMargin(data);

    if (marginValue > 30) {
      highMarginCount += 1;
    } else if (marginValue < 0) {
      negativeMarginCount += 1;
    } else if (marginValue < 10) {
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

    const filteredRows = allRows.filter((row) => !shouldExcludeMarginRow(getRowData(row)));
    const summary = buildMarginComplianceSummary(filteredRows);
    const totalRecords = summary.totalRecords;

    const sortedRows = filteredRows.slice().sort((a, b) => {
      const aValue =
        sortField === 'totalRevenue'
          ? toNumber(a.totalRevenue)
          : sortField === 'totalProfit'
          ? toNumber(a.totalProfit)
          : toNumber(a.avgMargin);
      const bValue =
        sortField === 'totalRevenue'
          ? toNumber(b.totalRevenue)
          : sortField === 'totalProfit'
          ? toNumber(b.totalProfit)
          : toNumber(b.avgMargin);
      return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
    });

    const pageRows = sortedRows.slice(offset, offset + limitValue);

    return {
      data: pageRows.map((row) => row.data),
      summary,
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
      const filteredRows = sanitizedRows.filter((row: any) => !shouldExcludeMarginRow(row));
      const rowData = filteredRows.map((row: any) => ({
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

  private async buildMarginSevenDaySummary(reportDate: Date): Promise<MarginSevenDaySummary> {
    const startDate = addDaysUtc(reportDate, -6);
    const rows = await prisma.marginComplianceReportRow.findMany({
      where: {
        reportDate: { gte: startDate, lte: reportDate },
      },
    });
    const filteredRows = rows.filter((row) => !shouldExcludeMarginRow(getRowData(row)));
    const { orderRows, salesRows } = splitRowsByType(filteredRows);

    return {
      startDate,
      endDate: reportDate,
      overall: buildMarginSummaryBucket(filteredRows, { useTypePrefix: true }),
      orders: buildMarginSummaryBucket(orderRows),
      sales: buildMarginSummaryBucket(salesRows),
    };
  }



  async buildMarginComplianceEmailPayload(reportDate: Date, columnIds: string[] = []) {
    const rows = await prisma.marginComplianceReportRow.findMany({ where: { reportDate } });
    const filteredRows = rows.filter((row) => !shouldExcludeMarginRow(getRowData(row)));
    const summary = buildMarginComplianceSummary(filteredRows);
    const { orderRows, salesRows } = splitRowsByType(filteredRows);
    const alerts: MarginAlertGroups = {
      order: buildAlertSummary(orderRows),
      sales: buildAlertSummary(salesRows),
    };
    const topBottom = this.buildMarginTopBottomSummary(orderRows, salesRows);
    const sevenDaySummary = await this.buildMarginSevenDaySummary(reportDate);
    const emailSummary: MarginComplianceEmailSummary = {
      ...summary,
      alerts,
      topBottom,
      sevenDaySummary,
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
        sector: c.sector || 'Belirtilmemiş',
        sectorCode: c.sectorCode || '',
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
  }): Promise<ComplementMissingReportResponse> {
    const { mode, productCode, customerCode, sectorCode, salesRepId } = options;
    if (mode !== 'product' && mode !== 'customer') {
      throw new AppError('Rapor modu gecersiz.', 400, ErrorCode.BAD_REQUEST);
    }

    const periodMonths = options.periodMonths === 12 ? 12 : 6;
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? options.limit : 50;
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
    let salesRepMeta: ComplementMissingReportResponse['metadata']['salesRep'] = undefined;
    let salesRepSectorCodes: string[] = [];

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

    let allowedSectorCodes: string[] = normalizedSectorCode ? [normalizedSectorCode] : [];
    if (salesRepSectorCodes.length > 0) {
      allowedSectorCodes = allowedSectorCodes.length > 0
        ? allowedSectorCodes.filter((code) => salesRepSectorCodes.includes(code))
        : salesRepSectorCodes;
    }
    const sectorFilterRequested = Boolean(normalizedSectorCode) || Boolean(salesRepId);
    const sectorFilterImpossible = sectorFilterRequested && allowedSectorCodes.length === 0;
    const allowedSectorSet = allowedSectorCodes.length > 0 ? new Set(allowedSectorCodes) : null;

    const metadata: ComplementMissingReportResponse['metadata'] = {
      mode,
      matchMode,
      periodMonths,
      startDate,
      endDate,
      sectorCode: normalizedSectorCode || null,
      salesRep: salesRepMeta,
      minDocumentCount,
    };

    const buildResponse = (rows: ComplementMissingRow[]): ComplementMissingReportResponse => {
      const totalRows = rows.length;
      const totalMissing = rows.reduce((sum, row) => sum + row.missingCount, 0);
      const totalPages = totalRows > 0 ? Math.ceil(totalRows / limit) : 0;
      const offset = (page - 1) * limit;
      const paginatedRows = rows.slice(offset, offset + limit);

      return {
        rows: paginatedRows,
        summary: {
          totalRows,
          totalMissing,
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
                COUNT(DISTINCT sth.sth_evrakno_seri + CAST(sth.sth_evrakno_sira AS VARCHAR)) as documentCount,
                SUM(sth.sth_miktar) as totalQuantity
              FROM STOK_HAREKETLERI sth
              LEFT JOIN CARI_HESAPLAR c ON sth.sth_cari_kodu = c.cari_kod
              LEFT JOIN STOKLAR st ON sth.sth_stok_kod = st.sto_kod
              WHERE ${[...averageConditions, ...exclusionConditions, `RTRIM(sth.sth_stok_kod) IN (${inClause})`].join(' AND ')}
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
            COUNT(DISTINCT sth.sth_evrakno_seri + CAST(sth.sth_evrakno_sira AS VARCHAR)) as documentCount,
            SUM(sth.sth_miktar) as totalQuantity
          FROM STOK_HAREKETLERI sth
          LEFT JOIN CARI_HESAPLAR c ON sth.sth_cari_kodu = c.cari_kod
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
          customerMap.set(customer, {
            customerCode: rawCode,
            customerName: row.customerName || null,
            sectorCode: sectorValue || null,
            documentCount: documentCountValue,
            totalQuantity: totalQuantityValue,
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
          ];
          const purchaseClause = purchaseConditions.join(' AND ');

          const purchaseQuery = `
            SELECT
              RTRIM(sth.sth_cari_kodu) as customerCode,
              RTRIM(sth.sth_stok_kod) as productCode
            FROM STOK_HAREKETLERI sth
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
            const ratio = baseDocCount > 0 ? pairCount / baseDocCount : 0;
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

          rows.push({
            customerCode: customerInfo.customerCode,
            customerName: customerInfo.customerName || '-',
            documentCount: customerInfo.documentCount,
            missingComplements,
            missingCount: missingComplements.length,
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
          COUNT(DISTINCT sth.sth_evrakno_seri + CAST(sth.sth_evrakno_sira AS VARCHAR)) as documentCount,
          SUM(sth.sth_miktar) as totalQuantity
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
      const purchasedCodes = rawData
        .map((row: any) => {
          const normalized = normalizeReportCode(row.productCode);
          if (!normalized) return '';
          const docCount = Number(row.documentCount) || 0;
          const totalQuantity = toNumber(row.totalQuantity);
          documentCountMap.set(normalized, docCount);
          quantityMap.set(normalized, totalQuantity);
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
              COUNT(DISTINCT sth.sth_evrakno_seri + CAST(sth.sth_evrakno_sira AS VARCHAR)) as documentCount,
              SUM(sth.sth_miktar) as totalQuantity
            FROM STOK_HAREKETLERI sth
            LEFT JOIN CARI_HESAPLAR c ON sth.sth_cari_kodu = c.cari_kod
            LEFT JOIN STOKLAR st ON sth.sth_stok_kod = st.sto_kod
            WHERE ${[...averageGlobalConditions, ...exclusionConditions, `RTRIM(sth.sth_stok_kod) IN (${inClause})`].join(' AND ')}
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
              const ratio = baseDocCount > 0 ? pairCount / baseDocCount : 0;
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

        rows.push({
          productCode: product.mikroCode,
          productName: product.name,
          documentCount,
          missingComplements,
          missingCount: missingComplements.length,
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

  async exportComplementMissingReport(options: {
    mode: 'product' | 'customer';
    matchMode?: ComplementMatchMode;
    productCode?: string;
    customerCode?: string;
    sectorCode?: string;
    salesRepId?: string;
    periodMonths?: number;
    minDocumentCount?: number;
  }): Promise<{ buffer: Buffer; fileName: string }> {
    const data = await this.getComplementMissingReport({
      ...options,
      page: 1,
      limit: 100000,
    });

    const formatNumber = (value: number | null | undefined) =>
      Number.isFinite(value) ? Number(value).toFixed(2) : '-';
    const round2Local = (value: number): number =>
      Number.isFinite(value) ? Math.round((value + Number.EPSILON) * 100) / 100 : 0;

    const header = data.metadata.mode === 'product'
      ? ['Cari Kodu', 'Cari Adi', 'Evrak Sayisi', 'Eksik Tamamlayicilar', 'Eksik Sayisi', 'Potansiyel Aylik Gelir']
      : ['Urun Kodu', 'Urun Adi', 'Evrak Sayisi', 'Eksik Tamamlayicilar', 'Eksik Sayisi', 'Potansiyel Aylik Gelir'];

    const rows = data.rows.map((row) => {
      const missingList = row.missingComplements
        .map((item) => {
          const qty = formatNumber(item.estimatedQuantity);
          const unitPrice = formatNumber(item.unitPrice);
          const revenue = formatNumber(item.estimatedRevenue);
          return `${item.productCode} - ${item.productName} (${qty} x ${unitPrice} = ${revenue})`;
        })
        .join(', ');
      const potentialRevenue = round2Local(
        row.missingComplements.reduce((sum, item) => sum + (item.estimatedRevenue || 0), 0)
      );
      return data.metadata.mode === 'product'
        ? [
            row.customerCode || '',
            row.customerName || '',
            row.documentCount || 0,
            missingList,
            row.missingCount,
            potentialRevenue,
          ]
        : [
            row.productCode || '',
            row.productName || '',
            row.documentCount || 0,
            missingList,
            row.missingCount,
            potentialRevenue,
          ];
    });

    const sheetData = [header, ...rows];
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Tamamlayici Eksikleri');

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
    const fileName = `tamamlayici-urun-eksikleri-${data.metadata.mode}-${data.metadata.startDate}-${data.metadata.endDate}.xlsx`;

    return { buffer, fileName };
  }

  async getCustomerActivityReport(options: {
    startDate?: string;
    endDate?: string;
    customerCode?: string;
    userId?: string;
    page?: number;
    limit?: number;
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

    let customer: { id: string; code: string; name: string | null } | null = null;
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
        },
      });

      if (!customerUser) {
        throw new AppError('Customer not found.', 404, ErrorCode.NOT_FOUND);
      }

      customer = {
        id: customerUser.id,
        code: customerUser.mikroCariCode || options.customerCode,
        name: customerUser.displayName || customerUser.name || null,
      };
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

    const [totalRecords, uniqueUserRows, typeCounts, activeAgg] = await Promise.all([
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
    ]);

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
  }): Promise<CustomerCartsReportResponse> {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? options.limit : 20;
    const searchTerm = options.search ? options.search.trim() : '';

    const where: Prisma.CartWhereInput = {
      user: { role: 'CUSTOMER' },
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

  async runUcarerMinMaxReport(): Promise<{
    rows: Record<string, any>[];
    columns: string[];
    total: number;
  }> {
    const rows = await mikroService.executeQuery('exec [FEBG_MinMaxHesaplaRES]');
    const normalizedRows = Array.isArray(rows) ? rows : [];
    const columns = normalizedRows.length > 0 ? Object.keys(normalizedRows[0] || {}) : [];

    return {
      rows: normalizedRows,
      columns,
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

    return { id: familyId };
  }

  async deleteProductFamily(id: string): Promise<void> {
    await prisma.productFamily.delete({
      where: { id },
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
  }): Promise<{
    createdOrders: Array<{
      supplierCode: string;
      supplierName: string | null;
      orderNumber: string;
      itemCount: number;
      totalQuantity: number;
    }>;
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
    }> = [];

    for (const [supplierCode, items] of supplierItems.entries()) {
      const cfg = supplierConfigs[supplierCode] || {};
      const series = String(cfg.series || '').trim().toUpperCase();
      if (!series) {
        throw new AppError(`Siparis serisi zorunludur (${supplierCode}).`, 400, ErrorCode.BAD_REQUEST);
      }
      const applyVAT = Boolean(cfg.applyVAT);
      const deliveryType = String(cfg.deliveryType || '').trim().slice(0, 25);
      const deliveryDate = cfg.deliveryDate ? String(cfg.deliveryDate) : null;
      const totalQuantity = items.reduce((sum, row) => sum + row.quantity, 0);
      const orderNumber = await mikroService.writeOrder({
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

      const match = String(orderNumber).match(/^(.*)-(\d+)$/);
      if (match) {
        const seri = match[1];
        const sira = Number(match[2]);
        if (seri && Number.isFinite(sira)) {
          await mikroService.executeQuery(`
            UPDATE SIPARISLER
            SET sip_tip = 1
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

      createdOrders.push({
        supplierCode,
        supplierName: supplierNameMap.get(supplierCode) || null,
        orderNumber,
        itemCount: items.length,
        totalQuantity,
      });
    }

    return {
      createdOrders,
      missingSupplierProducts: [],
      skippedInvalid,
    };
  }

  async createDepotTransferOrder(input: {
    depot: 'MERKEZ' | 'TOPCA';
    allocations: Array<{ productCode: string; quantity: number }>;
    series?: string;
  }): Promise<{
    orderNumber: string;
    itemCount: number;
    totalQuantity: number;
  }> {
    const depot = input.depot === 'TOPCA' ? 'TOPCA' : 'MERKEZ';
    const targetWarehouseNo = depot === 'TOPCA' ? 6 : 1;
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

    const inClause = rows.map((row) => `'${row.productCode.replace(/'/g, "''")}'`).join(',');
    const costRows = await prisma.product.findMany({
      where: { mikroCode: { in: rows.map((row) => row.productCode) } },
      select: { mikroCode: true, currentCost: true },
    });
    const unitPriceByCode = new Map<string, number>();
    costRows.forEach((row) => {
      const code = String(row?.mikroCode || '').trim().toUpperCase();
      const cost = Number(row?.currentCost || 0);
      if (code) unitPriceByCode.set(code, Number.isFinite(cost) && cost > 0 ? cost : 1);
    });
    rows.forEach((row) => {
      if (!unitPriceByCode.has(row.productCode)) unitPriceByCode.set(row.productCode, 1);
    });

    const escapedSeries = series.replace(/'/g, "''");
    const envCariByDepot = String(
      depot === 'TOPCA'
        ? process.env.MIKRO_DEPOT_TRANSFER_CARI_TOPCA || ''
        : process.env.MIKRO_DEPOT_TRANSFER_CARI_MERKEZ || '',
    )
      .trim()
      .toUpperCase();
    const envCariGlobal = String(process.env.MIKRO_DEPOT_TRANSFER_CARI || '').trim().toUpperCase();

    const templateRows = await mikroService.executeQuery(`
      SELECT TOP 1 sip_musteri_kod AS cariCode
      FROM SIPARISLER
      WHERE sip_evrakno_seri = '${escapedSeries}'
        AND sip_depono = ${targetWarehouseNo}
        AND ISNULL(sip_musteri_kod, '') <> ''
      ORDER BY sip_evrakno_sira DESC, sip_satirno DESC
    `);
    const fallbackSeriesRows = await mikroService.executeQuery(`
      SELECT TOP 1 sip_musteri_kod AS cariCode
      FROM SIPARISLER
      WHERE sip_evrakno_seri = '${escapedSeries}'
        AND ISNULL(sip_musteri_kod, '') <> ''
      ORDER BY sip_evrakno_sira DESC, sip_satirno DESC
    `);
    const fallbackAnyRows = await mikroService.executeQuery(`
      SELECT TOP 1 sip_musteri_kod AS cariCode
      FROM SIPARISLER
      WHERE sip_tip = 1
        AND sip_depono = ${targetWarehouseNo}
        AND ISNULL(sip_musteri_kod, '') <> ''
      ORDER BY sip_create_date DESC, sip_evrakno_sira DESC, sip_satirno DESC
    `);
    const sourceKeyword = depot === 'TOPCA' ? 'MERKEZ' : 'TOPCA';
    const fallbackCariFromUnvanRows = await mikroService.executeQuery(`
      SELECT TOP 1 cari_kod AS cariCode
      FROM CARI_HESAPLAR
      WHERE ISNULL(cari_kod, '') <> ''
        AND (
          UPPER(ISNULL(cari_unvan1, '')) COLLATE Turkish_CI_AI LIKE '%${sourceKeyword}%'
          OR UPPER(ISNULL(cari_unvan2, '')) COLLATE Turkish_CI_AI LIKE '%${sourceKeyword}%'
        )
      ORDER BY cari_kod
    `);

    const cariCode = String(
      envCariByDepot ||
        envCariGlobal ||
        templateRows?.[0]?.cariCode ||
        fallbackSeriesRows?.[0]?.cariCode ||
        fallbackAnyRows?.[0]?.cariCode ||
        fallbackCariFromUnvanRows?.[0]?.cariCode ||
        '',
    )
      .trim()
      .toUpperCase();
    if (!cariCode) {
      throw new AppError(
        `Depolar arasi siparis icin cari kodu bulunamadi. Lutfen ortam degiskeni tanimlayin: ${
          depot === 'TOPCA' ? 'MIKRO_DEPOT_TRANSFER_CARI_TOPCA' : 'MIKRO_DEPOT_TRANSFER_CARI_MERKEZ'
        } (veya MIKRO_DEPOT_TRANSFER_CARI).`,
        400,
        ErrorCode.BAD_REQUEST,
      );
    }

    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const orderNumber = await mikroService.writeOrder({
      cariCode,
      items: rows.map((row) => ({
        productCode: row.productCode,
        quantity: row.quantity,
        unitPrice: unitPriceByCode.get(row.productCode) || 1,
        vatRate: 0,
        lineDescription: `Depolar arasi sevk ${depot}`,
      })),
      applyVAT: false,
      description: `Depolar Arasi Sevk ${depot}`,
      documentDescription: `Depolar arasi sevk ${depot} ${day}.${month}.${year}`,
      evrakSeri: series,
      warehouseNo: targetWarehouseNo,
      buyerCode: '195.01.069',
    });

    return {
      orderNumber,
      itemCount: rows.length,
      totalQuantity: rows.reduce((sum, row) => sum + row.quantity, 0),
    };
  }

  async updateUcarerProductCost(input: {
    productCode: string;
    cost?: number;
    costP?: number;
    costT?: number;
    updatePriceLists?: boolean;
  }): Promise<{
    productCode: string;
    currentCost: number;
    costP: number;
    costT: number;
    priceListsUpdated: boolean;
    updatedLists: Array<{ listNo: number; value: number; affected: number }>;
    missingLists: number[];
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

    await mikroService.executeQuery(`
      UPDATE STOKLAR
      SET
        sto_standartmaliyet = ${costP},
        sto_resim_url = CAST(DATEPART(day, GETDATE()) AS nvarchar(10))+'.'+CAST(DATEPART(MONTH, GETDATE()) AS nvarchar(10))+'.'+CAST(DATEPART(year, GETDATE()) AS nvarchar(10))
      WHERE sto_kod = '${escapedCode}'
    `);

    await mikroService.executeQuery(`
      DECLARE @uid uniqueidentifier;
      SELECT @uid = sto_guid FROM STOKLAR WHERE sto_kod='${escapedCode}';
      IF @uid IS NOT NULL
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM STOKLAR_USER WHERE Record_uid=@uid)
        BEGIN
          INSERT INTO STOKLAR_USER
            (Record_uid, Maliyet_Tar, GUNCEL_MALIYET_TARIHI, TOPCA_MIN, TOPCA_MAX, Marj_1, Marj_2, Marj_3, Marj_4, Marj_5, MaliyetP, MaliyetT, MaliyetTarihi, FiyatDegisimTarihi, Yatan_Stok, Birim_1_Desi)
          VALUES
            (@uid, GETDATE(), 0, 0, 0, '1', '1', '1', '1', '1', ${costP}, ${costT},
             CAST(DATEPART(day, GETDATE()) AS nvarchar(10))+'.'+CAST(DATEPART(MONTH, GETDATE()) AS nvarchar(10))+'.'+CAST(DATEPART(year, GETDATE()) AS nvarchar(10)),
             CAST(DATEPART(day, GETDATE()) AS nvarchar(10))+'.'+CAST(DATEPART(MONTH, GETDATE()) AS nvarchar(10))+'.'+CAST(DATEPART(year, GETDATE()) AS nvarchar(10)),
             '', 0);
        END
        ELSE
        BEGIN
          UPDATE STOKLAR_USER
          SET
            MaliyetP = ${costP},
            MaliyetT = ${costT},
            MaliyetTarihi = CAST(DATEPART(day, GETDATE()) AS nvarchar(10))+'.'+CAST(DATEPART(MONTH, GETDATE()) AS nvarchar(10))+'.'+CAST(DATEPART(year, GETDATE()) AS nvarchar(10)),
            FiyatDegisimTarihi = CAST(DATEPART(day, GETDATE()) AS nvarchar(10))+'.'+CAST(DATEPART(MONTH, GETDATE()) AS nvarchar(10))+'.'+CAST(DATEPART(year, GETDATE()) AS nvarchar(10))
          WHERE Record_uid=@uid;
        END
      END
    `);

    await prisma.product.updateMany({
      where: { mikroCode: productCode },
      data: {
        currentCost: costP,
        currentCostDate: new Date(),
      },
    });

    const updatedLists: Array<{ listNo: number; value: number; affected: number }> = [];
    const missingLists: number[] = [];
    if (updatePriceLists) {
      const stockRows = await mikroService.executeQuery(`
        SELECT
          u.Marj_1,
          u.Marj_2,
          u.Marj_3,
          u.Marj_4,
          u.Marj_5
        FROM STOKLAR s
        LEFT JOIN STOKLAR_USER u ON s.sto_Guid = u.Record_uid
        WHERE s.sto_kod = '${escapedCode}'
      `);
      const row = stockRows?.[0];
      const parseMargin = (value: unknown) => {
        const raw = String(value ?? '').trim().replace(',', '.');
        const num = Number(raw);
        return Number.isFinite(num) ? num : 0;
      };
      const margins = [
        parseMargin(row?.Marj_1),
        parseMargin(row?.Marj_2),
        parseMargin(row?.Marj_3),
        parseMargin(row?.Marj_4),
        parseMargin(row?.Marj_5),
      ];

      const upsertPriceList = async (listNo: number, value: number) => {
        if (!Number.isFinite(value) || value <= 0) {
          return;
        }
        const rows = await mikroService.executeQuery(`
          UPDATE STOK_SATIS_FIYAT_LISTELERI
          SET sfiyat_fiyati = ${value}
          WHERE sfiyat_stokkod = '${escapedCode}'
            AND sfiyat_listesirano = ${listNo};
          SELECT @@ROWCOUNT AS affected;
        `);
        let affected = Number(rows?.[0]?.affected || 0);
        if (affected <= 0) {
          await mikroService.executeQuery(`
            INSERT INTO STOK_SATIS_FIYAT_LISTELERI
              (sfiyat_Guid, sfiyat_DBCno, sfiyat_SpecRECno, sfiyat_iptal, sfiyat_fileid, sfiyat_hidden, sfiyat_kilitli, sfiyat_degisti, sfiyat_checksum, sfiyat_create_user, sfiyat_create_date,
               sfiyat_lastup_user, sfiyat_lastup_date, sfiyat_special1, sfiyat_special2, sfiyat_special3, sfiyat_stokkod, sfiyat_listesirano, sfiyat_deposirano, sfiyat_odemeplan, sfiyat_birim_pntr,
               sfiyat_fiyati, sfiyat_doviz, sfiyat_iskontokod, sfiyat_deg_nedeni, sfiyat_primyuzdesi, sfiyat_kampanyakod, sfiyat_doviz_kuru)
            VALUES
              (NEWID(), 0, 0, 0, 0, 0, 0, 0, 0, 1, GETDATE(), 1, GETDATE(), '', '', '', '${escapedCode}', ${listNo}, 0, 0, 0,
               ${value}, 0, '', 0, 0, '', 0);
          `);
          affected = 1;
        }
        updatedLists.push({ listNo, value, affected });
        if (affected <= 0) missingLists.push(listNo);
      };

      for (let idx = 0; idx < 5; idx += 1) {
        const margin = margins[idx];
        await upsertPriceList(6 + idx, costP * margin);
        await upsertPriceList(1 + idx, costT * margin);
      }
    }

    return {
      productCode,
      currentCost: costP,
      costP,
      costT,
      priceListsUpdated: updatePriceLists,
      updatedLists,
      missingLists,
    };
  }

  async updateUcarerMainSupplier(input: {
    productCode: string;
    supplierCode: string;
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

    return {
      productCode,
      supplierCode,
      supplierName,
    };
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





