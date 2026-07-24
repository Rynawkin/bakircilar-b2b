import {
  Agreement,
  Campaign,
  CategoryWithPriceRules,
  CostUpdateAlert,
  CustomerType,
  Customer,
  CustomerContact,
  CustomerSubUser,
  DashboardStats,
  EInvoiceDocument,
  Exclusion,
  HotSaleCartItem,
  HotSaleClosureAction,
  HotSaleCustomer,
  HotSaleDailyReport,
  HotSaleDashboard,
  HotSaleInventoryItem,
  HotSaleOpenOrder,
  HotSalePaymentType,
  HotSaleProduct,
  HotSaleSession,
  HotSaleTransaction,
  HotSaleTransactionType,
  HotSaleVehicle,
  MarginComplianceRow,
  Notification,
  NotificationPreference,
  PriceHistoryChange,
  Product,
  Quote,
  QuoteLineItem,
  Order,
  SetPriceRuleRequest,
  Settings,
  StaffMember,
  SyncStatus,
  Task,
  TaskAttachment,
  TaskComment,
  TaskDetail,
  TaskLink,
  TaskTemplate,
  TaskView,
  VadeAssignment,
  VadeAnalytics,
  VadeBalance,
  VadeClassification,
  VadeDashboard,
  VadeManagement,
  VadeNote,
  VadeSyncLog,
} from '../types';
import { apiClient } from './client';
import { buildSearchVariants, normalizeSearchText } from '../utils/search';

export type AdminOrderStatusFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type AdminOrderSourceFilter = 'ALL' | 'CUSTOMER' | 'B2B';

export type GetOrdersParams = {
  status?: AdminOrderStatusFilter;
  source?: AdminOrderSourceFilter;
  search?: string;
  page?: number;
  pageSize?: number;
};

export type OrdersPagination = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type GetQuotesParams = {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

export type QuotesPagination = OrdersPagination;

export type VadeImportMode = 'SNAPSHOT' | 'PATCH';

export type VadeImportRowInput = {
  mikroCariCode: string;
  customerName?: string | null;
  sectorCode?: string | null;
  groupCode?: string | null;
  regionCode?: string | null;
  sourceRowNumber?: number;
  pastDueBalance?: number;
  pastDueDate?: string | null;
  notDueBalance?: number;
  notDueDate?: string | null;
  totalBalance?: number;
  valor?: number;
  paymentTermLabel?: string | null;
  referenceDate?: string | null;
};

export type VadeImportOptions = {
  mode: VadeImportMode;
  createMissingCustomers: boolean;
};

export type VadeImportResult = {
  imported: number;
  skipped: number;
  createdCustomers: number;
  staleRemoved: number;
  skipReasons: {
    customerNotFound: number;
    excludedSector: number;
    duplicateCode: number;
  };
  skippedRows: Array<{
    sourceRowNumber?: number;
    mikroCariCode: string;
    reason: string;
  }>;
};

type SupplierPriceListOverrides = {
  excelSheetName?: string | null;
  excelHeaderRow?: number | null;
  excelCodeHeader?: string | null;
  excelNameHeader?: string | null;
  excelPriceHeader?: string | null;
  pdfPriceIndex?: number | null;
  pdfCodePattern?: string | null;
  pdfColumnRoles?: Record<string, string> | null;
};

export type BannerPosition = 'HERO' | 'STRIP' | 'SIDE' | 'GRID';

export interface AdminBanner {
  id: string;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  mobileImageUrl?: string | null;
  linkUrl?: string | null;
  productCode?: string | null;
  buttonText?: string | null;
  position: BannerPosition;
  sortOrder: number;
  active: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BannerInput = {
  title?: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  mobileImageUrl?: string | null;
  linkUrl?: string | null;
  productCode?: string | null;
  buttonText?: string | null;
  position?: BannerPosition;
  sortOrder?: number;
  active?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
};

export type GiftCampaignScopeType = 'missingCategories' | 'categoryIds' | 'productIds' | 'all';
export type GiftCampaignTargetType = 'all' | 'segment' | 'account';

export interface AdminGiftCampaign {
  id: string;
  title: string;
  subtitle?: string | null;
  bannerImageUrl?: string | null;
  mobileBannerImageUrl?: string | null;
  buttonText?: string | null;
  threshold: number;
  thresholdPriceType: 'white' | 'invoiced';
  thresholdVatIncluded: boolean;
  scopeType: GiftCampaignScopeType;
  scopeCategoryIds: string[];
  scopeProductIds: string[];
  giftPickCount: number;
  targetType: GiftCampaignTargetType;
  targetSectorCodes: string[];
  targetUserIds: string[];
  active: boolean;
  validFrom?: string | null;
  validTo?: string | null;
  gifts: Array<{
    id?: string;
    productId: string;
    name?: string;
    mikroCode?: string;
    imageUrl?: string | null;
    unit?: string | null;
    value?: number;
    giftQuantity?: number;
    normalPrice?: number;
  }>;
  createdAt: string;
  updatedAt: string;
}

export type GiftCampaignInput = Partial<Omit<AdminGiftCampaign, 'id' | 'createdAt' | 'updatedAt' | 'gifts'>> & {
  gifts?: Array<{ productId: string; sortOrder?: number; giftQuantity?: number }>;
};

export interface AdminBundleItem {
  id?: string;
  productId: string;
  quantity: number;
  useDiscountedPrice: boolean;
  productName?: string;
  productCode?: string;
  imageUrl?: string | null;
  missing?: boolean;
}

export interface AdminBundle {
  id: string;
  title: string;
  code: string;
  imageUrl: string | null;
  active: boolean;
  hiddenFromCustomers: boolean;
  discountPercent: number;
  secondaryCategoryId: string | null;
  createdAt: string;
  items: AdminBundleItem[];
}

export interface ProductImageDto {
  id: string;
  url: string;
  sortOrder: number;
  isPrimary: boolean;
  sizeBytes?: number | null;
  uploadedAt?: string | null;
  uploadedByName?: string | null;
}

export interface PassiveStockItem {
  code: string;
  name: string;
  categoryCode?: string;
  supplierCode?: string;
  currentCost?: number;
  guid?: string;
}

export type StockCreateLookupType = 'supplier' | 'brand' | 'category' | 'package' | 'template';

export interface StockCreateLookupItem {
  code: string;
  name: string;
}

export interface StockCreateExtraUnit {
  index: number;
  name?: string | null;
  factor?: string | number | null;
  factorDirection?: 'larger' | 'smaller' | null;
  weightKg?: string | number | null;
  widthCm?: string | number | null;
  lengthCm?: string | number | null;
  heightCm?: string | number | null;
}

export interface StockCreateInput {
  templateCode?: string | null;
  stockCode?: string | null;
  name?: string | null;
  foreignName?: string | null;
  shortName?: string | null;
  vatRatePercent?: string | number | null;
  supplierCode?: string | null;
  brandCode?: string | null;
  brandName?: string | null;
  categoryCode?: string | null;
  packageCode?: string | null;
  packageName?: string | null;
  shelfCode?: string | null;
  currentCost?: string | number | null;
  costT?: string | number | null;
  costP?: string | number | null;
  mainUnit?: string | null;
  mainUnitWeightKg?: string | number | null;
  mainUnitWidthCm?: string | number | null;
  mainUnitLengthCm?: string | number | null;
  mainUnitHeightCm?: string | number | null;
  margins?: Array<string | number | null> | null;
  barcode?: string | null;
  notes?: string | null;
  extraUnits?: StockCreateExtraUnit[] | null;
  calculateMinMax?: boolean | null;
}

export interface StockCreatePreviewRow {
  rowNo: number;
  previewCode: string;
  status: 'valid' | 'warning' | 'error';
  errors: string[];
  warnings: string[];
  item: StockCreateInput & Record<string, any>;
  refs?: Record<string, StockCreateLookupItem | null>;
}

export interface StockCreateMetadata {
  nextCode: string;
  defaultTemplateCode: string;
  vatOptions: Array<{ label: string; value: number; mikroCode: number }>;
  unitNames: string[];
  recentCreations: any[];
}

export type SearchMissStatus = 'all' | 'open' | 'resolved';

export interface SearchMissItem {
  id: string;
  normalizedTerm: string;
  sampleTerm: string | null;
  count: number;
  resolved: boolean;
  lastSearchedAt: string | null;
}

export interface ProductAliasItem {
  id: string;
  name: string;
  mikroCode: string;
  categoryName: string | null;
  searchAliases: string | null;
}

export interface MobilePaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type ImageIssueStatus = 'OPEN' | 'REVIEWED' | 'FIXED';

export interface ImageIssueReport {
  id: string;
  mikroOrderNumber: string;
  orderSeries?: string | null;
  customerCode?: string | null;
  customerName?: string | null;
  lineKey: string;
  rowNumber?: number | null;
  productCode: string;
  productName: string;
  productId?: string | null;
  currentProductImageUrl?: string | null;
  imageUrl?: string | null;
  note?: string | null;
  status: ImageIssueStatus;
  reporterName?: string | null;
  reviewedByName?: string | null;
  reviewNote?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

export type WarehouseWorkflowStatus =
  | 'PENDING'
  | 'PICKING'
  | 'READY_FOR_LOADING'
  | 'PARTIALLY_LOADED'
  | 'LOADED'
  | 'DISPATCHED';

export type WarehouseLineStatus = 'PENDING' | 'PICKED' | 'PARTIAL' | 'MISSING' | 'EXTRA';
export type WarehouseCoverageStatus = 'FULL' | 'PARTIAL' | 'NONE';

export interface WarehouseOverviewOrder {
  mikroOrderNumber: string;
  orderSeries: string;
  orderSequence: number;
  customerCode: string;
  customerName: string;
  warehouseCode: string | null;
  orderDate: string;
  deliveryDate: string | null;
  itemCount: number;
  grandTotal: number;
  workflowStatus: WarehouseWorkflowStatus;
  assignedPickerUserId: string | null;
  startedAt: string | null;
  loadedAt: string | null;
  dispatchedAt: string | null;
  mikroDeliveryNoteNo: string | null;
  coverage: {
    fullLines: number;
    partialLines: number;
    missingLines: number;
    coveredPercent: number;
  };
  coverageStatus: WarehouseCoverageStatus;
}

export interface WarehouseOrderDetail {
  order: {
    mikroOrderNumber: string;
    orderSeries: string;
    orderSequence: number;
    customerCode: string;
    customerName: string;
    documentNo?: string | null;
    orderNote?: string | null;
    warehouseCode: string | null;
    orderDate: string;
    deliveryDate: string | null;
    itemCount: number;
    grandTotal: number;
  };
  workflow: {
    id: string;
    status: WarehouseWorkflowStatus;
    assignedPickerUserId: string | null;
    startedAt: string | null;
    loadingStartedAt: string | null;
    loadedAt: string | null;
    dispatchedAt: string | null;
    mikroDeliveryNoteNo: string | null;
    lastActionAt: string | null;
  } | null;
  coverage: WarehouseOverviewOrder['coverage'];
  coverageStatus: WarehouseCoverageStatus;
  lines: Array<{
    lineKey: string;
    rowNumber: number;
    productCode: string;
    productName: string;
    unit: string;
    unit2: string | null;
    unit2Factor: number | null;
    requestedQty: number;
    deliveredQty: number;
    remainingQty: number;
    pickedQty: number;
    extraQty: number;
    shortageQty: number;
    unitPrice: number;
    lineTotal: number;
    vat: number;
    stockAvailable: number;
    warehouseStocks: { merkez: number; topca: number };
    stockCoverageStatus: WarehouseCoverageStatus;
    imageUrl: string | null;
    shelfCode: string | null;
    reservedQty: number;
    hasOwnReservation: boolean;
    hasOtherReservation: boolean;
    reservations: Array<{
      mikroOrderNumber: string;
      customerCode: string;
      customerName: string;
      orderDate: string;
      reservedQty: number;
      rowNumber: number | null;
      isCurrentOrder: boolean;
      matchesCurrentLine: boolean;
    }>;
    status: WarehouseLineStatus;
  }>;
}

export interface WarehouseDispatchCatalog {
  drivers: Array<{ id: string; firstName: string; lastName: string; tcNo: string; note?: string | null; active: boolean }>;
  vehicles: Array<{ id: string; name: string; plate: string; note?: string | null; active: boolean }>;
}

export interface WarehouseRetailProduct {
  productCode: string;
  productName: string;
  unit: string;
  stockMerkez: number;
  stockTopca: number;
  stockTotal: number;
  stockSelected: number;
  perakende1: number;
  perakende2: number;
  perakende3: number;
  perakende4: number;
  perakende5: number;
  perakende6: number;
  imageUrl: string | null;
}

export interface CustomerRecoveryAction {
  id: string;
  customerCode: string;
  customerName?: string | null;
  actionType: string;
  note: string;
  status: string;
  priority: string;
  outcome?: string | null;
  followUpDate?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  author?: { id: string; name: string | null; email?: string | null } | null;
  assignedTo?: { id: string; name: string | null; email?: string | null } | null;
}

export interface CustomerRecoveryActionInput {
  customerName?: string | null;
  actionType?: string;
  note?: string;
  status?: string;
  priority?: string;
  outcome?: string | null;
  followUpDate?: string | null;
  assignedToId?: string | null;
  snapshot?: unknown;
  postSnapshot?: unknown;
}

export interface BundleInputPayload {
  title: string;
  secondaryCategoryId?: string | null;
  discountPercent?: number;
  active?: boolean;
  items: Array<{ productId: string; quantity: number; useDiscountedPrice: boolean }>;
}

export type CollectionSourceType = 'RULE' | 'MANUAL';
export type CollectionRuleType = 'category' | 'bestseller' | 'discounted' | 'new';

export interface AdminCollection {
  id: string;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  color?: string | null;
  sortOrder: number;
  sourceType: CollectionSourceType;
  ruleType?: CollectionRuleType | null;
  categoryId?: string | null;
  productIds: string[];
  targetType: GiftCampaignTargetType;
  targetSectorCodes: string[];
  targetUserIds: string[];
  active: boolean;
  validFrom?: string | null;
  validTo?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CollectionInput = {
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  color?: string | null;
  sortOrder?: number;
  sourceType?: CollectionSourceType;
  ruleType?: CollectionRuleType | null;
  categoryId?: string | null;
  productIds?: string[];
  targetType?: GiftCampaignTargetType;
  targetSectorCodes?: string[];
  targetUserIds?: string[];
  active?: boolean;
  validFrom?: string | null;
  validTo?: string | null;
};

export type EngagementStatus = 'KAYITSIZ' | 'HIC_GIRMEMIS' | 'AKTIF' | 'YAVASLIYOR' | 'KAYIP_RISKI';
export type EngagementActionPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface EngagementRow {
  customerCode: string;
  customerName: string;
  sectorCode: string | null;
  city: string | null;
  phone: string | null;
  balance: number;
  registered: boolean;
  userId: string | null;
  lastLoginAt: string | null;
  firstLoginAt: string | null;
  loginCount: number;
  loginFrequencyDays: number | null;
  daysSinceLastLogin: number | null;
  orderCount: number;
  orderTotal: number;
  orderAvg: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  status: EngagementStatus;
  lastContactAt: string | null;
  lastContactByName: string | null;
  contactCount: number;
  hasNotes: boolean;
  nextFollowUpDate: string | null;
  assignedSalesRepName: string | null;
  healthScore: number;
  actionPriority: EngagementActionPriority;
  actionReason: string;
  suggestedAction: string;
}

export interface EngagementKpis {
  total: number;
  registered: number;
  registeredPct: number;
  unregistered: number;
  neverLoggedIn: number;
  active30: number;
  atRisk: number;
  followUpDue: number;
  neverContacted: number;
  actionDue?: number;
  avgHealthScore?: number;
}

export interface EngagementReport {
  rows: EngagementRow[];
  total: number;
  page: number;
  limit: number;
  kpis: EngagementKpis;
  repBreakdown: Array<{
    rep: string;
    total: number;
    registered: number;
    unregistered: number;
    neverLoggedIn: number;
    atRisk: number;
    actionDue?: number;
    avgHealthScore?: number;
  }>;
}

export interface ContactLogEntry {
  id: string;
  customerCode: string;
  customerName: string | null;
  contactedAt: string;
  contactedByName: string | null;
  channel: string | null;
  note: string | null;
  outcome: string | null;
  followUpDate: string | null;
}

export interface ContactInput {
  customerName?: string;
  note?: string;
  channel?: string;
  outcome?: string;
  followUpDate?: string | null;
}

const appendSupplierPriceListOverrides = (formData: FormData, overrides?: SupplierPriceListOverrides) => {
  if (!overrides) return;
  const appendValue = (key: string, value?: string | number | null) => {
    if (value === undefined || value === null || value === '') return;
    formData.append(key, String(value));
  };

  appendValue('excelSheetName', overrides.excelSheetName);
  appendValue('excelHeaderRow', overrides.excelHeaderRow);
  appendValue('excelCodeHeader', overrides.excelCodeHeader);
  appendValue('excelNameHeader', overrides.excelNameHeader);
  appendValue('excelPriceHeader', overrides.excelPriceHeader);
  appendValue('pdfPriceIndex', overrides.pdfPriceIndex);
  appendValue('pdfCodePattern', overrides.pdfCodePattern);
  if (overrides.pdfColumnRoles && Object.keys(overrides.pdfColumnRoles).length > 0) {
    formData.append('pdfColumnRoles', JSON.stringify(overrides.pdfColumnRoles));
  }
};

const rowIdentity = (row: any) =>
  normalizeSearchText(row?.id || row?.mikroCode || row?.productCode || row?.code || row?.mikroCariCode || row?.name || row?.supplierName);

const getWithSearchFallback = async (path: string, params: any, rowsKey: string) => {
  const response = await apiClient.get(path, { params });
  const data = response.data as any;
  const term = String(params?.search || '').trim();
  const firstRows = Array.isArray(data?.[rowsKey]) ? data[rowsKey] : [];
  if (term.length < 3 || firstRows.length >= 5) return data;

  const variants = buildSearchVariants(term, 5).filter((variant) => variant !== term);
  if (variants.length === 0) return data;

  const byKey = new Map<string, any>();
  firstRows.forEach((row: any) => byKey.set(rowIdentity(row), row));

  for (const variant of variants) {
    try {
      const retry = await apiClient.get(path, { params: { ...params, search: variant } });
      const rows = Array.isArray((retry.data as any)?.[rowsKey]) ? (retry.data as any)[rowsKey] : [];
      rows.forEach((row: any) => byKey.set(rowIdentity(row), row));
    } catch {
      // Preserve the original successful result if a fallback variant fails.
    }
    if (byKey.size >= 30) break;
  }

  return { ...data, [rowsKey]: Array.from(byKey.values()) };
};

export const adminApi = {
  // Settings
  getSettings: async () => {
    const response = await apiClient.get<Settings>('/admin/settings');
    return response.data;
  },
  updateSettings: async (data: Partial<Settings>) => {
    const response = await apiClient.put('/admin/settings', data);
    return response.data as { message: string; settings: Settings };
  },

  // Banners
  getBanners: async () => {
    const response = await apiClient.get('/admin/banners');
    return response.data as { banners: AdminBanner[] };
  },
  getBannerStats: async (days = 30) => {
    const response = await apiClient.get('/admin/banners/stats', { params: { days } });
    return response.data as { stats: Array<{ bannerId: string; clicks: number }> };
  },
  uploadBannerImage: async (formData: FormData) => {
    const response = await apiClient.post('/admin/banners/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data as { imageUrl: string };
  },
  createBanner: async (data: BannerInput) => {
    const response = await apiClient.post('/admin/banners', data);
    return response.data as { banner: AdminBanner };
  },
  updateBanner: async (id: string, data: BannerInput) => {
    const response = await apiClient.put(`/admin/banners/${id}`, data);
    return response.data as { banner: AdminBanner };
  },
  deleteBanner: async (id: string) => {
    const response = await apiClient.delete(`/admin/banners/${id}`);
    return response.data as { success?: boolean; message?: string };
  },
  getGiftCampaigns: async () => {
    const response = await apiClient.get('/admin/gift-campaigns');
    return response.data as { campaigns: AdminGiftCampaign[] };
  },
  getGiftCampaign: async (id: string) => {
    const response = await apiClient.get(`/admin/gift-campaigns/${id}`);
    return response.data as { campaign: AdminGiftCampaign };
  },
  createGiftCampaign: async (data: GiftCampaignInput) => {
    const response = await apiClient.post('/admin/gift-campaigns', data);
    return response.data as { campaign: AdminGiftCampaign };
  },
  updateGiftCampaign: async (id: string, data: GiftCampaignInput) => {
    const response = await apiClient.put(`/admin/gift-campaigns/${id}`, data);
    return response.data as { campaign: AdminGiftCampaign };
  },
  deleteGiftCampaign: async (id: string) => {
    const response = await apiClient.delete(`/admin/gift-campaigns/${id}`);
    return response.data as { success: boolean };
  },
  listBundles: async () => {
    const response = await apiClient.get('/admin/bundles');
    return response.data as { bundles: AdminBundle[] };
  },
  createBundle: async (payload: BundleInputPayload, image: { uri: string; name: string; type: string }) => {
    const formData = new FormData();
    formData.append('payload', JSON.stringify(payload));
    formData.append('image', image as any);
    const response = await apiClient.post('/admin/bundles', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data as { success: boolean; id: string };
  },
  updateBundle: async (id: string, payload: BundleInputPayload, image?: { uri: string; name: string; type: string } | null) => {
    const formData = new FormData();
    formData.append('payload', JSON.stringify(payload));
    if (image) formData.append('image', image as any);
    const response = await apiClient.put(`/admin/bundles/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data as { success: boolean; id: string };
  },
  deleteBundle: async (id: string) => {
    const response = await apiClient.delete(`/admin/bundles/${id}`);
    return response.data as { success: boolean };
  },
  getCollections: async () => {
    const response = await apiClient.get('/admin/collections');
    return response.data as { collections: AdminCollection[] };
  },
  getCollection: async (id: string) => {
    const response = await apiClient.get(`/admin/collections/${id}`);
    return response.data as { collection: AdminCollection };
  },
  createCollection: async (data: CollectionInput) => {
    const response = await apiClient.post('/admin/collections', data);
    return response.data as { collection: AdminCollection };
  },
  updateCollection: async (id: string, data: CollectionInput) => {
    const response = await apiClient.put(`/admin/collections/${id}`, data);
    return response.data as { collection: AdminCollection };
  },
  deleteCollection: async (id: string) => {
    const response = await apiClient.delete(`/admin/collections/${id}`);
    return response.data as { success: boolean };
  },

  // Dashboard
  getDashboardStats: async (params?: { period?: 'daily' | 'weekly' | 'monthly' }) => {
    const response = await apiClient.get<DashboardStats>('/admin/dashboard/stats', { params });
    return response.data;
  },
  getOperationsCommandCenter: async (params?: { series?: string[]; orderLimit?: number; customerLimit?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.series && params.series.length > 0) queryParams.append('series', params.series.join(','));
    if (params?.orderLimit) queryParams.append('orderLimit', String(params.orderLimit));
    if (params?.customerLimit) queryParams.append('customerLimit', String(params.customerLimit));
    const path = queryParams.toString()
      ? `/admin/operations/command-center?${queryParams.toString()}`
      : '/admin/operations/command-center';
    const response = await apiClient.get(path);
    return response.data as { success: boolean; data: any };
  },

  // Quotes
  getQuotes: async (statusOrParams?: string | GetQuotesParams) => {
    const params =
      typeof statusOrParams === 'string'
        ? { status: statusOrParams }
        : {
            ...(statusOrParams?.status && statusOrParams.status !== 'ALL' ? { status: statusOrParams.status } : {}),
            ...(statusOrParams?.search?.trim() ? { search: statusOrParams.search.trim() } : {}),
            ...(statusOrParams?.page ? { page: statusOrParams.page } : {}),
            ...(statusOrParams?.pageSize ? { pageSize: statusOrParams.pageSize } : {}),
          };
    const response = await apiClient.get<{ quotes: Quote[]; pagination?: QuotesPagination }>('/admin/quotes', {
      params: params && Object.keys(params).length ? params : undefined,
    });
    return response.data;
  },
  getQuoteById: async (id: string) => {
    const response = await apiClient.get<{ quote: Quote }>(`/admin/quotes/${id}`);
    return response.data;
  },
  createQuote: async (data: any) => {
    const response = await apiClient.post('/admin/quotes', data);
    return response.data as { quote: Quote };
  },
  updateQuote: async (id: string, data: any) => {
    const response = await apiClient.put(`/admin/quotes/${id}`, data);
    return response.data as { quote: Quote };
  },
  syncQuote: async (id: string) => {
    const response = await apiClient.post(`/admin/quotes/${id}/sync`);
    return response.data as { quote: Quote; updated: boolean };
  },
  approveQuote: async (id: string, adminNote?: string) => {
    const response = await apiClient.post(`/admin/quotes/${id}/approve`, { adminNote });
    return response.data;
  },
  rejectQuote: async (id: string, adminNote: string) => {
    const response = await apiClient.post(`/admin/quotes/${id}/reject`, { adminNote });
    return response.data;
  },
  convertQuoteToOrder: async (
    id: string,
    payload: {
      selectedItemIds: string[];
      closeReasons?: Record<string, string>;
      closeUnselected?: boolean;
      warehouseNo: number;
      invoicedSeries?: string;
      invoicedSira?: number;
      whiteSeries?: string;
      whiteSira?: number;
      itemUpdates?: Array<{ id: string; quantity?: number; responsibilityCenter?: string; reserveQty?: number }>;
      documentNo?: string;
      documentDescription?: string;
    }
  ) => {
    const response = await apiClient.post(`/admin/quotes/${id}/convert-to-order`, payload);
    return response.data as { mikroOrderIds: string[]; closedCount: number; orderId: string; orderNumber: string };
  },
  getQuoteLineItems: async (params?: {
    status?: string;
    search?: string;
    closeReason?: string;
    minDays?: number;
    maxDays?: number;
    limit?: number;
    offset?: number;
  }) => {
    const response = await apiClient.get('/admin/quotes/line-items', { params });
    return response.data as { items: QuoteLineItem[]; total: number };
  },
  closeQuoteLineItems: async (items: Array<{ id: string; reason: string }>) => {
    const response = await apiClient.post('/admin/quotes/line-items/close', { items });
    return response.data as { closedCount: number; mikroClosedCount: number };
  },
  reopenQuoteLineItems: async (itemIds: string[]) => {
    const response = await apiClient.post('/admin/quotes/line-items/reopen', { itemIds });
    return response.data as { reopenedCount: number; mikroReopenCount: number };
  },
  getQuotePreferences: async () => {
    const response = await apiClient.get('/admin/quotes/preferences');
    return response.data as {
      preferences: {
        lastSalesCount: number;
        whatsappTemplate: string;
        responsibleCode?: string | null;
        columnWidths?: Record<string, number> | null;
        poolSort?: string | null;
        poolPriceListNo?: number | null;
        poolColorRules?: any[] | null;
      };
    };
  },
  updateQuotePreferences: async (data: {
    lastSalesCount?: number;
    whatsappTemplate?: string;
    responsibleCode?: string | null;
    columnWidths?: Record<string, number>;
    poolSort?: string | null;
    poolPriceListNo?: number | null;
    poolColorRules?: any[] | null;
  }) => {
    const response = await apiClient.put('/admin/quotes/preferences', data);
    return response.data as {
      preferences: {
        lastSalesCount: number;
        whatsappTemplate: string;
        responsibleCode?: string | null;
        columnWidths?: Record<string, number> | null;
        poolSort?: string | null;
        poolPriceListNo?: number | null;
        poolColorRules?: any[] | null;
      };
    };
  },
  getQuoteResponsibles: async () => {
    const response = await apiClient.get('/admin/quotes/responsibles');
    return response.data as { responsibles: Array<{ code: string; name: string; surname: string }> };
  },
  getCustomerPurchasedProducts: async (customerId: string, limit?: number) => {
    const response = await apiClient.get(`/admin/quotes/customer/${customerId}/purchased-products`, {
      params: limit ? { limit } : undefined,
    });
    return response.data as { customer: any; products: any[] };
  },
  getUsdSellingRate: async () => {
    const response = await apiClient.get('/admin/exchange/usd');
    return response.data as { currency: string; rate: number; fetchedAt: string; source: string };
  },

  // Orders
  getOrders: async (params?: GetOrdersParams) => {
    const query = {
      ...(params?.status && params.status !== 'ALL' ? { status: params.status } : {}),
      ...(params?.source && params.source !== 'ALL' ? { source: params.source } : {}),
      ...(params?.search?.trim() ? { search: params.search.trim() } : {}),
      ...(params?.page ? { page: params.page } : {}),
      ...(params?.pageSize ? { pageSize: params.pageSize } : {}),
    };
    const response = await apiClient.get<{ orders: any[]; pagination?: OrdersPagination }>('/admin/orders', {
      params: Object.keys(query).length ? query : undefined,
    });
    return response.data;
  },
  getOrderById: async (id: string) => {
    const response = await apiClient.get<{ order: Order }>(`/admin/orders/${id}`);
    return response.data;
  },
  getPendingOrders: async () => {
    const response = await apiClient.get<{ orders: any[] }>('/admin/orders/pending');
    return response.data;
  },
  createManualOrder: async (payload: {
    customerId: string;
    items: Array<{
      productId?: string;
      productCode?: string;
      productName?: string;
      unit?: string;
      unit2?: string | null;
      unit2Factor?: number | null;
      selectedUnit?: string | null;
      quantity: number;
      unitPrice: number;
      priceType?: 'INVOICED' | 'WHITE';
      priceListNo?: number;
      vatZeroed?: boolean;
      manualVatRate?: number;
      lineDescription?: string;
      responsibilityCenter?: string;
      reserveQty?: number;
    }>;
    warehouseNo: number;
    description?: string;
    documentDescription?: string;
    documentNo?: string;
    invoicedSeries?: string;
    invoicedSira?: number;
    whiteSeries?: string;
    whiteSira?: number;
  }) => {
    const response = await apiClient.post('/admin/orders/manual', payload);
    return response.data as { message: string; mikroOrderIds: string[]; orderId: string; orderNumber: string };
  },
  approveOrder: async (id: string, adminNote?: string) => {
    const response = await apiClient.post(`/admin/orders/${id}/approve`, { adminNote });
    return response.data;
  },
  rejectOrder: async (id: string, adminNote: string) => {
    const response = await apiClient.post(`/admin/orders/${id}/reject`, { adminNote });
    return response.data;
  },
  approveOrderItems: async (id: string, data: { itemIds: string[]; adminNote?: string }) => {
    const response = await apiClient.post(`/admin/orders/${id}/approve-items`, data);
    return response.data as { message: string; mikroOrderIds: string[]; approvedCount: number };
  },
  rejectOrderItems: async (id: string, data: { itemIds: string[]; rejectionReason: string }) => {
    const response = await apiClient.post(`/admin/orders/${id}/reject-items`, data);
    return response.data as { message: string; rejectedCount: number };
  },

  // Order tracking
  getOrderTrackingSettings: async () => {
    const response = await apiClient.get('/order-tracking/admin/settings');
    return response.data as any;
  },
  updateOrderTrackingSettings: async (data: any) => {
    const response = await apiClient.put('/order-tracking/admin/settings', data);
    return response.data as any;
  },
  syncOrderTracking: async () => {
    const response = await apiClient.post('/order-tracking/admin/sync');
    return response.data as any;
  },
  sendOrderTrackingEmails: async () => {
    const response = await apiClient.post('/order-tracking/admin/send-emails');
    return response.data as any;
  },
  syncAndSendOrderTracking: async () => {
    const response = await apiClient.post('/order-tracking/admin/sync-and-send');
    return response.data as any;
  },
  getOrderTrackingPendingOrders: async () => {
    const response = await apiClient.get('/order-tracking/admin/pending-orders');
    return response.data as any[];
  },
  getOrderTrackingSummary: async () => {
    const response = await apiClient.get('/order-tracking/admin/summary');
    return response.data as any[];
  },
  getOrderTrackingSupplierSummary: async () => {
    const response = await apiClient.get('/order-tracking/admin/supplier-summary');
    return response.data as any[];
  },
  getOrderTrackingEmailLogs: async () => {
    const response = await apiClient.get('/order-tracking/admin/email-logs');
    return response.data as any[];
  },
  closeOrderTrackingRemaining: async (
    mikroOrderNumber: string,
    payload: { orderType: 'customer' | 'supplier'; lineNumbers?: number[] }
  ) => {
    const response = await apiClient.post(
      `/order-tracking/admin/orders/${encodeURIComponent(mikroOrderNumber)}/close-remaining`,
      payload
    );
    return response.data as { success: boolean; closedLineCount: number; message: string };
  },
  updateOrderTrackingLineQuantity: async (
    mikroOrderNumber: string,
    payload: { orderType: 'customer' | 'supplier'; lineNumber: number; quantity: number }
  ) => {
    const response = await apiClient.patch(
      `/order-tracking/admin/orders/${encodeURIComponent(mikroOrderNumber)}/line-quantity`,
      payload
    );
    return response.data as {
      success: boolean;
      previousQuantity: number;
      newQuantity: number;
      deliveredQty: number;
      remainingQty: number;
      message: string;
    };
  },
  markOrderTrackingSupplierTransmitted: async (customerCode: string, customerName?: string) => {
    const response = await apiClient.post(
      `/order-tracking/admin/supplier-transmissions/${encodeURIComponent(customerCode)}`,
      { customerName }
    );
    return response.data as { success: boolean; transmittedAt: string; transmittedByName?: string | null };
  },
  getWarehouseImageIssues: async (params?: {
    status?: 'ALL' | ImageIssueStatus;
    search?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get('/order-tracking/admin/warehouse/image-issues', { params });
    return response.data as {
      reports: ImageIssueReport[];
      summary: { total: number; open: number; reviewed: number; fixed: number };
      pagination: { page: number; limit: number; totalPages: number; totalRecords: number };
    };
  },
  updateWarehouseImageIssue: async (reportId: string, payload: { status?: ImageIssueStatus; note?: string }) => {
    const response = await apiClient.patch(`/order-tracking/admin/warehouse/image-issues/${encodeURIComponent(reportId)}`, payload);
    return response.data as { success: boolean; report?: ImageIssueReport };
  },
  getWarehouseOverview: async (params?: {
    series?: string | string[];
    search?: string;
    status?: 'ALL' | WarehouseWorkflowStatus;
  }) => {
    const response = await apiClient.get('/order-tracking/admin/warehouse/overview', { params });
    return response.data as {
      series: Array<{
        series: string;
        total: number;
        pending: number;
        picking: number;
        ready: number;
        loaded: number;
        dispatched: number;
      }>;
      orders: WarehouseOverviewOrder[];
    };
  },
  syncWarehouseOrders: async () => {
    const response = await apiClient.post('/order-tracking/admin/warehouse/sync');
    return response.data as { success: boolean; ordersCount: number; customersCount: number; message: string };
  },
  getWarehouseDispatchCatalog: async () => {
    const response = await apiClient.get('/order-tracking/admin/warehouse/dispatch-catalog');
    return response.data as WarehouseDispatchCatalog;
  },
  getWarehouseOrderDetail: async (mikroOrderNumber: string) => {
    const response = await apiClient.get(
      `/order-tracking/admin/warehouse/orders/${encodeURIComponent(mikroOrderNumber)}`
    );
    return response.data as WarehouseOrderDetail;
  },
  startWarehousePicking: async (mikroOrderNumber: string) => {
    const response = await apiClient.post(
      `/order-tracking/admin/warehouse/orders/${encodeURIComponent(mikroOrderNumber)}/start`
    );
    return response.data as { success?: boolean; workflow?: unknown };
  },
  updateWarehouseItem: async (
    mikroOrderNumber: string,
    lineKey: string,
    payload: { pickedQty?: number; extraQty?: number; shelfCode?: string | null }
  ) => {
    const response = await apiClient.patch(
      `/order-tracking/admin/warehouse/orders/${encodeURIComponent(mikroOrderNumber)}/items/${encodeURIComponent(lineKey)}`,
      payload
    );
    return response.data as { success?: boolean; line?: unknown };
  },
  reportWarehouseImageIssue: async (
    mikroOrderNumber: string,
    lineKey: string,
    payload?: { note?: string }
  ) => {
    const response = await apiClient.post(
      `/order-tracking/admin/warehouse/orders/${encodeURIComponent(mikroOrderNumber)}/items/${encodeURIComponent(lineKey)}/report-image-issue`,
      payload || {}
    );
    return response.data as {
      report: {
        id: string;
        mikroOrderNumber: string;
        lineKey: string;
        productCode: string;
        productName: string;
        status: ImageIssueStatus;
        createdAt: string;
      };
      alreadyReported: boolean;
    };
  },
  markWarehouseLoaded: async (mikroOrderNumber: string) => {
    const response = await apiClient.post(
      `/order-tracking/admin/warehouse/orders/${encodeURIComponent(mikroOrderNumber)}/loaded`
    );
    return response.data as { success?: boolean; workflow?: unknown };
  },
  markWarehouseDispatched: async (
    mikroOrderNumber: string,
    payload: {
      deliverySeries: string;
      transport: {
        driverFirstName: string;
        driverLastName: string;
        driverTcNo: string;
        vehicleName: string;
        vehiclePlate: string;
      };
    }
  ) => {
    const response = await apiClient.post(
      `/order-tracking/admin/warehouse/orders/${encodeURIComponent(mikroOrderNumber)}/dispatched`,
      payload
    );
    return response.data as {
      workflow?: { mikroDeliveryNoteNo?: string | null };
      mikroDeliveryNoteNo?: string | null;
    };
  },
  getWarehouseRetailProducts: async (params?: {
    search?: string;
    limit?: number;
    warehouseNo?: 1 | 6 | 0;
    onlyInStock?: boolean;
  }) => {
    const response = await apiClient.get('/order-tracking/admin/warehouse/retail/products', { params });
    return response.data as { products: WarehouseRetailProduct[] };
  },
  createWarehouseRetailSale: async (payload: {
    paymentType: 'CASH' | 'CARD';
    priceLevel: 1 | 2 | 3 | 4 | 5 | 6;
    items: Array<{
      productCode: string;
      quantity: number;
      unitPrice?: number;
      priceLevel?: 1 | 2 | 3 | 4 | 5 | 6;
    }>;
  }) => {
    const response = await apiClient.post('/order-tracking/admin/warehouse/retail/sales', payload);
    return response.data as {
      invoiceNo: string;
      paymentType: 'CASH' | 'CARD';
      paymentLabel: string;
      customerCode: string;
      priceLevel: 1 | 2 | 3 | 4 | 5 | 6;
      priceListNo: number;
      totalAmount: number;
      lineCount: number;
      lines: Array<{
        productCode: string;
        productName: string;
        quantity: number;
        unitPrice: number;
        lineTotal: number;
        unit: string;
        priceLevel: 1 | 2 | 3 | 4 | 5 | 6;
        priceListNo: number;
      }>;
    };
  },

  // Ucarer depot / min-max
  getUcarerDepotReport: async (params?: {
    depot?: 'MERKEZ' | 'TOPCA';
    limit?: number;
    all?: boolean;
  }) => {
    const response = await apiClient.get('/admin/reports/ucarer-depo', { params });
    return response.data as {
      success: boolean;
      data: { depot: 'MERKEZ' | 'TOPCA'; rows: any[]; columns: string[]; total: number; limited: boolean };
    };
  },
  getUcarerDepotMinMax: async (codes: string[]) => {
    const response = await apiClient.get('/admin/reports/ucarer-depot-minmax', {
      params: { codes: codes.join(',') },
    });
    return response.data as {
      success: boolean;
      data: Record<string, { '1': { min: number; max: number }; '6': { min: number; max: number } }>;
    };
  },
  getUcarerOperationLogs: async (params?: {
    page?: number;
    limit?: number;
    operationType?: string;
    productCode?: string;
    familyId?: string;
    search?: string;
  }) => {
    const response = await apiClient.get('/admin/reports/ucarer-depo/operation-logs', { params });
    return response.data as {
      success: boolean;
      data: {
        rows: any[];
        pagination: { page: number; limit: number; totalPages: number; totalRecords: number };
      };
    };
  },
  runUcarerMinMaxReport: async () => {
    const response = await apiClient.post('/admin/reports/ucarer-minmax/run');
    return response.data as {
      success: boolean;
      data: {
        id: string;
        status: 'RUNNING' | 'COMPLETED' | 'FAILED';
        startedAt: string;
        finishedAt?: string | null;
        data?: { rows: any[]; columns: string[]; total: number } | null;
        error?: string | null;
      };
    };
  },
  getUcarerMinMaxJobStatus: async (jobId: string) => {
    const response = await apiClient.get('/admin/reports/ucarer-minmax/status', { params: { jobId } });
    return response.data as {
      success: boolean;
      data: {
        id: string;
        status: 'RUNNING' | 'COMPLETED' | 'FAILED';
        startedAt: string;
        finishedAt?: string | null;
        data?: { rows: any[]; columns: string[]; total: number } | null;
        error?: string | null;
      };
    };
  },
  getUcarerMinMaxExcludedProductsReport: async () => {
    const response = await apiClient.get('/admin/reports/ucarer-minmax-excluded');
    return response.data as {
      success: boolean;
      data: {
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
      };
    };
  },
  setUcarerMinMaxExclusion: async (payload: {
    productCode: string;
    exclude: boolean;
    resetMinMaxValues?: boolean;
    depot?: 'MERKEZ' | 'TOPCA';
  }) => {
    const response = await apiClient.post('/admin/reports/ucarer-minmax-exclusion', payload);
    return response.data as {
      success: boolean;
      data: { productCode: string; excluded: boolean; stoModelKodu: string | null };
    };
  },
  createSupplierOrdersFromFamilyAllocations: async (payload: {
    depot: 'MERKEZ' | 'TOPCA';
    supplierConfigs: Record<
      string,
      {
        series: string;
        applyVAT: boolean;
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
  }) => {
    const response = await apiClient.post('/admin/reports/product-families/create-supplier-orders', payload);
    return response.data as {
      success: boolean;
      data: {
        createdOrders: Array<{
          supplierCode: string;
          supplierName: string | null;
          orderNumber: string;
          itemCount: number;
          totalQuantity: number;
          warning?: string | null;
        }>;
        failedOrders?: Array<{ supplierCode: string; supplierName: string | null; error: string }>;
        missingSupplierProducts: Array<{ productCode: string; quantity: number }>;
        skippedInvalid: Array<{ familyId: string | null; productCode: string; quantity: number }>;
      };
    };
  },
  createDepotTransferOrder: async (payload: {
    depot: 'MERKEZ' | 'TOPCA';
    series?: string;
    allocations: Array<{ productCode: string; quantity: number }>;
  }) => {
    const response = await apiClient.post('/admin/reports/product-families/create-depot-transfer-order', payload);
    return response.data as {
      success: boolean;
      data: { orderNumber: string; itemCount: number; totalQuantity: number };
    };
  },
  updateUcarerProductCost: async (payload: {
    productCode: string;
    cost?: number;
    costP?: number;
    costT?: number;
    updatePriceLists?: boolean;
  }) => {
    const response = await apiClient.post('/admin/reports/ucarer-depo/update-cost', payload);
    return response.data as {
      success: boolean;
      data: {
        productCode: string;
        currentCost: number;
        costP: number;
        costT: number;
        priceListsUpdated: boolean;
        updatedLists: Array<{ listNo: number; value: number; affected: number }>;
        missingLists: number[];
      };
    };
  },
  updateUcarerMainSupplier: async (payload: { productCode: string; supplierCode: string }) => {
    const response = await apiClient.post('/admin/reports/ucarer-depo/update-main-supplier', payload);
    return response.data as {
      success: boolean;
      data: { productCode: string; supplierCode: string; supplierName: string | null };
    };
  },

  // Staff and TOPLU audit reports
  getStaffActivityReport: async (params?: {
    startDate?: string;
    endDate?: string;
    role?: string;
    userId?: string;
    route?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get('/admin/reports/staff-activity', { params });
    return response.data as { success: boolean; data: any };
  },
  getTopluAudit: async (params?: { months?: number; minRepeatMonths?: number }) => {
    const response = await apiClient.get('/admin/reports/toplu-audit', { params });
    return response.data as { success: boolean; data: any };
  },
  unmarkTopluGroup: async (payload: {
    cariCode: string;
    productCode: string;
    fromDate: string;
    toDate: string;
  }) => {
    const response = await apiClient.post('/admin/reports/toplu-audit/unmark', payload);
    return response.data as {
      success: boolean;
      data: { affected: number; cariCode: string; productCode: string; fromDate: string; toDate: string };
    };
  },
  getTopluCandidates: async (params?: {
    months?: number;
    spikeFactor?: number;
    minQty?: number;
  }) => {
    const response = await apiClient.get('/admin/reports/toplu-candidates', { params });
    return response.data as { success: boolean; data: any };
  },
  markTopluCandidateLines: async (
    lines: Array<{
      productCode: string;
      lineGuid: string;
      documentSeries: string;
      documentSequence: number;
      documentLineNo: number;
    }>
  ) => {
    const response = await apiClient.post('/admin/reports/toplu-candidates/mark', { lines });
    return response.data as {
      success: boolean;
      data: { marked: number; failed: Array<{ lineGuid: string; reason: string }> };
    };
  },

  // Decision support reports
  getBarterRadar: async (params?: { minPastDue?: number; minPayable?: number }) => {
    const response = await apiClient.get('/admin/reports/barter-radar', { params });
    return response.data as { success: boolean; data: any };
  },
  getStickyDiscounts: async (params?: { lookbackDays?: number; minPremiumNowPercent?: number }) => {
    const response = await apiClient.get('/admin/reports/sticky-discounts', { params });
    return response.data as { success: boolean; data: any };
  },
  getDiscountBelowEntryCost: async () => {
    const response = await apiClient.get('/admin/reports/discount-below-entry-cost');
    return response.data as { success: boolean; data: any };
  },
  getDemandPattern: async (params: { depot: 'MERKEZ' | 'TOPCA'; lookbackWeeks?: number }) => {
    const response = await apiClient.get('/admin/reports/demand-pattern', { params });
    return response.data as { success: boolean; data: any };
  },
  applyDemandPatternOrderToOrder: async (payload: { depot: 'MERKEZ' | 'TOPCA'; productCodes: string[] }) => {
    const response = await apiClient.post('/admin/reports/demand-pattern/apply-order-to-order', payload);
    return response.data as { success: boolean; data: { applied: string[]; skipped: Array<{ productCode: string; reason: string }> } };
  },
  getCategoryChurnReport: async (params: {
    mode: 'category' | 'customer';
    categoryCode?: string;
    customerCode?: string;
    inactiveMonths?: number;
    activeCustomerMonths?: number;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortDirection?: 'asc' | 'desc';
  }) => {
    const response = await apiClient.get('/admin/reports/category-churn', { params });
    return response.data as { success: boolean; data: any };
  },
  getCategoryOpportunityReport: async (params: {
    categoryCode: string;
    customerCode?: string;
    lookbackMonths?: number;
    minPairCount?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get('/admin/reports/category-opportunity', { params });
    return response.data as { success: boolean; data: any };
  },

  // Family management reports
  getFamilySuggestionsReport: async (params?: { limit?: number; offset?: number }) => {
    const response = await apiClient.get('/admin/reports/family-management/suggestions', { params });
    return response.data as { success: boolean; data: { rows: any[]; total: number } };
  },
  getFamilyClustersReport: async (params?: { limit?: number }) => {
    const response = await apiClient.get('/admin/reports/family-management/clusters', { params });
    return response.data as { success: boolean; data: { clusters: any[] } };
  },
  getFamilyOutliersReport: async () => {
    const response = await apiClient.get('/admin/reports/family-management/outliers');
    return response.data as { success: boolean; data: { rows: any[] } };
  },
  getFamilyUnitMismatch: async () => {
    const response = await apiClient.get('/admin/reports/family-unit-mismatch');
    return response.data as { success: boolean; data: { families: any[] } };
  },
  removeProductFromFamily: async (familyId: string, productCode: string) => {
    const response = await apiClient.post(
      `/admin/stock-family/${encodeURIComponent(familyId)}/remove-product`,
      { productCode }
    );
    return response.data as { success: boolean; data: { removed: boolean } };
  },
  setFamilyItemUnitFactor: async (itemId: string, factor: number | null) => {
    const response = await apiClient.put(
      `/admin/stock-family/items/${encodeURIComponent(itemId)}/unit-factor`,
      { factor }
    );
    return response.data as { success: boolean; data: { item: { itemId: string; unitFactorOverride: number | null } } };
  },
  getProductFamilies: async () => {
    const response = await apiClient.get('/admin/reports/product-families');
    return response.data as { success: boolean; data: any[] };
  },
  saveProductFamily: async (payload: {
    id?: string;
    name: string;
    code?: string | null;
    note?: string | null;
    active?: boolean;
    productCodes?: string[];
  }) => {
    const body = {
      name: payload.name,
      code: payload.code,
      note: payload.note,
      active: payload.active,
      productCodes: payload.productCodes || [],
    };
    const response = payload.id
      ? await apiClient.put(`/admin/reports/product-families/${encodeURIComponent(payload.id)}`, body)
      : await apiClient.post('/admin/reports/product-families', body);
    return response.data as { success: boolean; data: any };
  },
  deleteProductFamily: async (familyId: string) => {
    const response = await apiClient.delete(`/admin/reports/product-families/${encodeURIComponent(familyId)}`);
    return response.data as { success: boolean; message?: string };
  },
  getPriceFamilies: async () => {
    const response = await apiClient.get('/admin/reports/price-families');
    return response.data as { success: boolean; data: any[] };
  },
  savePriceFamily: async (payload: {
    id?: string;
    name: string;
    code?: string | null;
    note?: string | null;
    active?: boolean;
    productCodes?: string[];
  }) => {
    const body = {
      name: payload.name,
      code: payload.code,
      note: payload.note,
      active: payload.active,
      productCodes: payload.productCodes || [],
    };
    const response = payload.id
      ? await apiClient.put(`/admin/reports/price-families/${encodeURIComponent(payload.id)}`, body)
      : await apiClient.post('/admin/reports/price-families', body);
    return response.data as { success: boolean; data: any };
  },
  deletePriceFamily: async (familyId: string) => {
    const response = await apiClient.delete(`/admin/reports/price-families/${encodeURIComponent(familyId)}`);
    return response.data as { success: boolean; message?: string };
  },
  getPriceFamilyCostReport: async (params?: {
    status?: 'all' | 'problem' | 'ok';
    search?: string;
    includeInactive?: boolean;
  }) => {
    const response = await apiClient.get('/admin/reports/price-family-costs', { params });
    return response.data as { success: boolean; data: any };
  },
  updatePriceFamilyProductCost: async (payload: {
    familyId: string;
    productCode: string;
    costP?: number;
    costT?: number;
    cost?: number;
    updatePriceLists?: boolean;
  }) => {
    const response = await apiClient.post('/admin/reports/price-family-costs/update-cost', payload);
    return response.data as { success: boolean; data: any };
  },
  sendOrderTrackingEmailToCustomer: async (customerCode: string, emailOverride?: string) => {
    const response = await apiClient.post(`/order-tracking/admin/send-email/${encodeURIComponent(customerCode)}`, {
      emailOverride,
    });
    return response.data as any;
  },
  sendOrderTrackingTestEmail: async (email: string) => {
    const response = await apiClient.post('/order-tracking/admin/test-email', { email });
    return response.data as any;
  },
  sendOrderTrackingCustomerEmails: async () => {
    const response = await apiClient.post('/order-tracking/admin/send-customer-emails');
    return response.data as any;
  },
  sendOrderTrackingSupplierEmails: async () => {
    const response = await apiClient.post('/order-tracking/admin/send-supplier-emails');
    return response.data as any;
  },

  // Tasks
  getTaskPreferences: async () => {
    const response = await apiClient.get('/admin/tasks/preferences');
    return response.data as { preferences: { defaultView: TaskView; colorRules?: any[] | null } };
  },
  updateTaskPreferences: async (data: { defaultView?: TaskView; colorRules?: any[] | null }) => {
    const response = await apiClient.put('/admin/tasks/preferences', data);
    return response.data as { preferences: { defaultView: TaskView; colorRules?: any[] | null } };
  },
  getTaskAssignees: async () => {
    const response = await apiClient.get('/admin/tasks/assignees');
    return response.data as { assignees: Array<{ id: string; name: string; email?: string; role?: string }> };
  },
  getTasks: async (params?: {
    status?: string | string[];
    type?: string;
    priority?: string;
    assignedToId?: string;
    createdById?: string;
    customerId?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    const response = await apiClient.get<{ tasks: Task[] }>('/admin/tasks', { params });
    return response.data;
  },
  getTaskById: async (id: string) => {
    const response = await apiClient.get<{ task: TaskDetail }>(`/admin/tasks/${id}`);
    return response.data;
  },
  createTask: async (data: {
    title?: string;
    description?: string | null;
    type?: string;
    status?: string;
    priority?: string;
    dueDate?: string | null;
    assignedToId?: string | null;
    customerId?: string | null;
    templateId?: string | null;
    links?: Array<{
      type: string;
      label?: string;
      referenceId?: string;
      referenceCode?: string;
      referenceUrl?: string;
    }>;
  }) => {
    const response = await apiClient.post('/admin/tasks', data);
    return response.data as { task: TaskDetail };
  },
  updateTask: async (id: string, data: {
    title?: string;
    description?: string | null;
    type?: string;
    status?: string;
    priority?: string;
    dueDate?: string | null;
    assignedToId?: string | null;
    customerId?: string | null;
  }) => {
    const response = await apiClient.put(`/admin/tasks/${id}`, data);
    return response.data as { task: TaskDetail };
  },
  addTaskComment: async (id: string, data: { body: string; visibility?: string }) => {
    const response = await apiClient.post(`/admin/tasks/${id}/comments`, data);
    return response.data as { comment: TaskComment };
  },
  addTaskAttachment: async (id: string, formData: FormData) => {
    const response = await apiClient.post(`/admin/tasks/${id}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data as { attachment: TaskAttachment };
  },
  addTaskLink: async (id: string, data: {
    type: string;
    label?: string;
    referenceId?: string;
    referenceCode?: string;
    referenceUrl?: string;
  }) => {
    const response = await apiClient.post(`/admin/tasks/${id}/links`, data);
    return response.data as { link: TaskLink };
  },
  deleteTaskLink: async (id: string, linkId: string) => {
    const response = await apiClient.delete(`/admin/tasks/${id}/links/${linkId}`);
    return response.data as { success: boolean };
  },
  getTaskTemplates: async (activeOnly = true) => {
    const response = await apiClient.get('/admin/tasks/templates', {
      params: { activeOnly },
    });
    return response.data as { templates: TaskTemplate[] };
  },
  createTaskTemplate: async (data: {
    title: string;
    description?: string | null;
    type: string;
    priority?: string;
    defaultStatus?: string;
    isActive?: boolean;
  }) => {
    const response = await apiClient.post('/admin/tasks/templates', data);
    return response.data as { template: TaskTemplate };
  },
  updateTaskTemplate: async (id: string, data: {
    title?: string;
    description?: string | null;
    type?: string;
    priority?: string;
    defaultStatus?: string;
    isActive?: boolean;
  }) => {
    const response = await apiClient.put(`/admin/tasks/templates/${id}`, data);
    return response.data as { template: TaskTemplate };
  },

  // Customers
  getCustomers: async (params?: { search?: string; page?: number; pageSize?: number; active?: 'all' | 'active' | 'inactive' }) => {
    const response = await apiClient.get<{ customers: Customer[]; pagination?: { total: number; page: number; pageSize: number; totalPages: number } }>('/admin/customers', { params });
    return response.data;
  },
  getCariList: async () => {
    const response = await apiClient.get('/admin/cari-list');
    return response.data as {
      cariList: Array<{
        code: string;
        name: string;
        city?: string;
        district?: string;
        phone?: string;
        isLocked?: boolean;
        groupCode?: string;
        sectorCode?: string;
        paymentTerm?: number;
        paymentPlanNo?: number | null;
        paymentPlanCode?: string | null;
        paymentPlanName?: string | null;
        hasEInvoice?: boolean;
        balance?: number;
      }>;
    };
  },
  createCustomer: async (data: {
    email: string;
    password: string;
    name: string;
    customerType: CustomerType;
    mikroCariCode: string;
    invoicedPriceListNo?: number | null;
    whitePriceListNo?: number | null;
    priceVisibility?: 'INVOICED_ONLY' | 'WHITE_ONLY' | 'BOTH';
  }) => {
    const response = await apiClient.post('/admin/customers', data);
    return response.data as { message: string; customer: Customer };
  },
  updateCustomer: async (id: string, data: {
    email?: string;
    customerType?: string;
    active?: boolean;
    invoicedPriceListNo?: number | null;
    whitePriceListNo?: number | null;
    priceVisibility?: 'INVOICED_ONLY' | 'WHITE_ONLY' | 'BOTH';
  }) => {
    const response = await apiClient.put(`/admin/customers/${id}`, data);
    return response.data as { message: string; customer: Customer };
  },
  getCustomerContacts: async (customerId: string) => {
    const response = await apiClient.get(`/admin/customers/${customerId}/contacts`);
    return response.data as { contacts: CustomerContact[] };
  },
  createCustomerContact: async (customerId: string, data: { name: string; phone?: string; email?: string }) => {
    const response = await apiClient.post(`/admin/customers/${customerId}/contacts`, data);
    return response.data as { contact: CustomerContact };
  },
  updateCustomerContact: async (customerId: string, contactId: string, data: { name?: string; phone?: string; email?: string }) => {
    const response = await apiClient.put(`/admin/customers/${customerId}/contacts/${contactId}`, data);
    return response.data as { contact: CustomerContact };
  },
  deleteCustomerContact: async (customerId: string, contactId: string) => {
    const response = await apiClient.delete(`/admin/customers/${customerId}/contacts/${contactId}`);
    return response.data as { message: string };
  },
  getCustomerSubUsers: async (customerId: string) => {
    const response = await apiClient.get(`/admin/customers/${customerId}/sub-users`);
    return response.data as { subUsers: CustomerSubUser[] };
  },
  createCustomerSubUser: async (
    customerId: string,
    data: { name: string; email?: string; password?: string; active?: boolean; autoCredentials?: boolean }
  ) => {
    const response = await apiClient.post(`/admin/customers/${customerId}/sub-users`, data);
    return response.data as { subUser: CustomerSubUser; credentials?: { username: string; password: string } | null };
  },
  updateCustomerSubUser: async (
    subUserId: string,
    data: { name?: string; email?: string; password?: string; active?: boolean }
  ) => {
    const response = await apiClient.put(`/admin/customers/sub-users/${subUserId}`, data);
    return response.data as { subUser: CustomerSubUser };
  },

  // Agreements
  getAgreements: async (customerId: string, search?: string) => {
    const response = await apiClient.get('/admin/agreements', { params: { customerId, search } });
    return response.data as { agreements: Agreement[] };
  },
  upsertAgreement: async (data: {
    customerId: string;
    productId: string;
    priceInvoiced: number;
    priceWhite: number;
    minQuantity?: number;
    validFrom?: string;
    validTo?: string | null;
  }) => {
    const response = await apiClient.post('/admin/agreements', data);
    return response.data as { agreement: Agreement };
  },
  deleteAgreement: async (agreementId: string) => {
    const response = await apiClient.delete(`/admin/agreements/${agreementId}`);
    return response.data as { message: string };
  },
  importAgreements: async (data: { customerId: string; rows: Array<{ mikroCode: string; priceInvoiced: number; priceWhite: number; minQuantity?: number; validFrom?: string | null; validTo?: string | null; }> }) => {
    const response = await apiClient.post('/admin/agreements/import', data);
    return response.data as { imported: number; failed: number; results: Array<{ mikroCode: string; status: string; reason?: string }> };
  },

  // Products
  getProducts: async (params?: { search?: string; page?: number; limit?: number; hasStock?: boolean; hasImage?: boolean }) => {
    return await getWithSearchFallback('/admin/products', params, 'products') as { products: Product[]; pagination: any; stats: any };
  },
  triggerSelectedImageSync: async (productIds: string[]) => {
    const response = await apiClient.post('/admin/products/image-sync', { productIds });
    return response.data as { message: string; syncLogId: string };
  },
  getProductComplements: async (productId: string) => {
    const response = await apiClient.get(`/admin/products/${productId}/complements`);
    return response.data as {
      mode: 'AUTO' | 'MANUAL';
      limit: number;
      complementGroupCode?: string | null;
      auto: Array<{
        productId: string;
        productCode: string;
        productName: string;
        imageUrl?: string | null;
        pairCount: number;
        rank: number;
      }>;
      manual: Array<{
        productId: string;
        productCode: string;
        productName: string;
        imageUrl?: string | null;
        sortOrder: number;
      }>;
    };
  },
  updateProductComplements: async (
    productId: string,
    data: {
      manualProductIds: string[];
      mode?: 'AUTO' | 'MANUAL';
      complementGroupCode?: string | null;
    }
  ) => {
    const response = await apiClient.put(`/admin/products/${productId}/complements`, data);
    return response.data as { mode: 'AUTO' | 'MANUAL'; manual: string[] };
  },
  syncProductComplements: async (params?: { months?: number; limit?: number }) => {
    const response = await apiClient.post('/admin/product-complements/sync', params || {});
    return response.data as { success: boolean; result: any };
  },
  getProductsByCodes: async (codes: string[]) => {
    const response = await apiClient.post('/admin/products/by-codes', { codes });
    return response.data as { products: any[]; total: number };
  },
  getComplementRecommendations: async (params: {
    productCodes: string[];
    excludeCodes?: string[];
    limit?: number;
  }) => {
    const response = await apiClient.post('/admin/recommendations/complements', params);
    return response.data as { success: boolean; products: any[]; total: number };
  },
  getStockFamilySuggestions: async (productCode: string, quantity: number, excludeCodes?: string[]) => {
    const response = await apiClient.post('/admin/stock-family/suggestions', {
      productCode,
      quantity,
      excludeCodes,
    });
    return response.data as {
      product: { code: string; name: string; unit: string; available: number; excess: number } | null;
      family: { id: string; name: string } | null;
      requested: number;
      enteredAvailable: number;
      shortfall: number;
      coversRequested: boolean;
      enteredExcess: number;
      alternatives: Array<{ productCode: string; productName: string; unit: string; available: number; excess: number }>;
      warnings: Array<{
        type: 'INSUFFICIENT' | 'OFFLOAD_EXCESS';
        message: string;
        recommended: {
          productCode: string;
          productName: string;
          unit?: string;
          available?: number;
          excess?: number;
          canCoverFull?: boolean;
          fromAlt?: number;
          fromEntered?: number;
        };
      }>;
    };
  },
  getStockCreateMetadata: async () => {
    const response = await apiClient.get('/admin/stock-create/metadata');
    return response.data as StockCreateMetadata;
  },
  getStockCreateLookups: async (type: StockCreateLookupType, params?: { search?: string; limit?: number }) => {
    const response = await apiClient.get(`/admin/stock-create/lookups/${type}`, { params });
    return response.data as { items: StockCreateLookupItem[] };
  },
  getStockCreateStock: async (stockCode: string) => {
    const response = await apiClient.get(`/admin/stock-create/stocks/${encodeURIComponent(stockCode)}`);
    return response.data as { stock: StockCreateInput & Record<string, any> };
  },
  previewStockCreate: async (items: StockCreateInput[]) => {
    const response = await apiClient.post('/admin/stock-create/preview', { items });
    return response.data as {
      results: StockCreatePreviewRow[];
      summary?: { valid?: number; warning?: number; error?: number; total?: number };
    };
  },
  previewPassiveStockActivation: async (stockCode: string) => {
    const response = await apiClient.post('/admin/stock-create/preview', { mode: 'activate', stockCode });
    return response.data as {
      results: StockCreatePreviewRow[];
      summary?: { valid?: number; warning?: number; error?: number; total?: number };
    };
  },
  createStock: async (formData: FormData) => {
    const response = await apiClient.post('/admin/stock-create/create', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data as { success: boolean; stockCode?: string; productId?: string; warnings?: string[]; error?: string };
  },
  activateStock: async (stockCode: string) => {
    const response = await apiClient.post('/admin/stock-create/activate', { stockCode });
    return response.data as { success: boolean; stockCode?: string; warnings?: string[]; error?: string };
  },
  listPassiveStocks: async (search: string, limit?: number) => {
    const response = await apiClient.get('/admin/stock-create/passive', {
      params: { search, ...(limit != null ? { limit } : {}) },
    });
    return response.data as { items: PassiveStockItem[] };
  },
  getSearchMisses: async (params?: {
    status?: SearchMissStatus;
    search?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const response = await apiClient.get('/admin/search-misses', { params });
    return response.data as { items: SearchMissItem[]; pagination: MobilePaginationMeta };
  },
  updateSearchMiss: async (id: string, resolved: boolean) => {
    const response = await apiClient.patch(`/admin/search-misses/${id}`, { resolved });
    return response.data as { ok: true };
  },
  getProductAliases: async (params?: {
    search?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const response = await apiClient.get('/admin/product-aliases', { params });
    return response.data as { items: ProductAliasItem[]; pagination: MobilePaginationMeta };
  },
  updateProductAliases: async (id: string, searchAliases: string) => {
    const response = await apiClient.put(`/admin/product-aliases/${id}`, { searchAliases });
    return response.data as { ok: true };
  },
  uploadProductImage: async (productId: string, formData: FormData) => {
    const response = await apiClient.post(`/admin/products/${productId}/image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data as { success: boolean; imageUrl: string; message: string };
  },
  deleteProductImage: async (productId: string) => {
    const response = await apiClient.delete(`/admin/products/${productId}/image`);
    return response.data as { success: boolean; message: string };
  },
  listProductImages: async (productId: string) => {
    const response = await apiClient.get(`/admin/products/${productId}/images`);
    return response.data as { images: ProductImageDto[] };
  },
  addProductImage: async (productId: string, formData: FormData) => {
    const response = await apiClient.post(`/admin/products/${productId}/images`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data as { success: boolean; image: ProductImageDto; images: ProductImageDto[] };
  },
  setPrimaryProductImage: async (productId: string, imageId: string) => {
    const response = await apiClient.patch(`/admin/products/${productId}/images/${imageId}/primary`);
    return response.data as { success: boolean; images: ProductImageDto[] };
  },
  deleteProductGalleryImage: async (productId: string, imageId: string) => {
    const response = await apiClient.delete(`/admin/products/${productId}/images/${imageId}`);
    return response.data as { success: boolean; images: ProductImageDto[] };
  },
  searchProductDimensions: async (params?: { search?: string; limit?: number }) => {
    const response = await apiClient.get('/admin/product-dimensions/products', { params });
    return response.data as { products: any[] };
  },
  getProductDimensions: async (productCode: string) => {
    const response = await apiClient.get(`/admin/product-dimensions/products/${encodeURIComponent(productCode)}`);
    return response.data as { product: any; history: any[] };
  },
  updateProductDimensions: async (
    productCode: string,
    data: {
      shelfCode?: string | null;
      units?: Array<{
        index: number;
        name?: string | null;
        factor?: number | null;
        weightKg?: number | null;
        widthMm?: number | null;
        lengthMm?: number | null;
        heightMm?: number | null;
      }>;
    }
  ) => {
    const response = await apiClient.put(`/admin/product-dimensions/products/${encodeURIComponent(productCode)}`, data);
    return response.data as { product: any; history: any[] };
  },
  searchProductShelves: async (params?: { search?: string; limit?: number }) => {
    const response = await apiClient.get('/admin/product-dimensions/shelves', { params });
    return response.data as { shelves: Array<{ code: string; name: string }> };
  },
  getProductDimensionUnitNames: async () => {
    const response = await apiClient.get('/admin/product-dimensions/unit-names');
    return response.data as { units: string[] };
  },
  getMissingProductDimensions: async (params?: { search?: string; limit?: number }) => {
    const response = await apiClient.get('/admin/product-dimensions/missing', { params });
    return response.data as { products: any[] };
  },

  // Categories & Pricing
  getCategories: async () => {
    const response = await apiClient.get('/admin/categories');
    return response.data as { categories: CategoryWithPriceRules[] };
  },
  setCategoryPriceRule: async (data: SetPriceRuleRequest) => {
    const response = await apiClient.post('/admin/categories/price-rule', data);
    return response.data as { message: string };
  },
  setCategoryImage: async (id: string, imageUrl: string | null) => {
    const response = await apiClient.patch(`/admin/categories/${id}/image`, { imageUrl });
    return response.data as { category: CategoryWithPriceRules };
  },
  setBulkCategoryPriceRules: async (rules: Array<{ categoryId: string; customerType: string; profitMargin: number }>) => {
    const response = await apiClient.post('/admin/categories/bulk-price-rules', { rules });
    return response.data as { message: string; updatedRules: number; totalRules: number; affectedCategories: number; pricesUpdated: number; errors: string[] };
  },
  setProductPriceOverride: async (data: { productId: string; customerType: string; profitMargin: number }) => {
    const response = await apiClient.post('/admin/products/price-override', data);
    return response.data as { message: string };
  },

  // Campaigns
  getCampaigns: async () => {
    const response = await apiClient.get<Campaign[]>('/campaigns');
    return response.data;
  },
  createCampaign: async (data: Partial<Campaign>) => {
    const response = await apiClient.post('/campaigns', data);
    return response.data as Campaign;
  },
  updateCampaign: async (id: string, data: Partial<Campaign>) => {
    const response = await apiClient.put(`/campaigns/${id}`, data);
    return response.data as Campaign;
  },
  deleteCampaign: async (id: string) => {
    const response = await apiClient.delete(`/campaigns/${id}`);
    return response.data as { success: boolean };
  },

  // Exclusions
  getExclusions: async (activeOnly?: boolean) => {
    const response = await apiClient.get('/admin/exclusions', {
      params: activeOnly !== undefined ? { activeOnly } : undefined,
    });
    return response.data as { success: boolean; data: Exclusion[] };
  },
  createExclusion: async (data: { type: Exclusion['type']; value: string; description?: string }) => {
    const response = await apiClient.post('/admin/exclusions', data);
    return response.data as { success: boolean; data: Exclusion; message: string };
  },
  updateExclusion: async (id: string, data: { value?: string; description?: string; active?: boolean }) => {
    const response = await apiClient.put(`/admin/exclusions/${id}`, data);
    return response.data as { success: boolean; data: Exclusion; message: string };
  },
  deleteExclusion: async (id: string) => {
    const response = await apiClient.delete(`/admin/exclusions/${id}`);
    return response.data as { success: boolean; message: string };
  },

  // Staff
  getSectorCodes: async () => {
    const response = await apiClient.get('/admin/sector-codes');
    return response.data as { sectorCodes: string[] };
  },
  getStaffMembers: async () => {
    const response = await apiClient.get('/admin/staff');
    return response.data as { staff: StaffMember[] };
  },
  createStaffMember: async (data: { email: string; password: string; name: string; role: 'SALES_REP' | 'MANAGER'; assignedSectorCodes?: string[] }) => {
    const response = await apiClient.post('/admin/staff', data);
    return response.data as { message: string; staff: StaffMember };
  },
  updateStaffMember: async (id: string, data: { email?: string; name?: string; active?: boolean; assignedSectorCodes?: string[] }) => {
    const response = await apiClient.put(`/admin/staff/${id}`, data);
    return response.data as { message: string; staff: StaffMember };
  },

  // Role permissions
  getAllRolePermissions: async () => {
    const response = await apiClient.get('/role-permissions/all');
    return response.data as { permissions: Record<string, Record<string, boolean>>; availablePermissions: Record<string, string>; permissionDescriptions: Record<string, string> };
  },
  setRolePermission: async (role: string, permission: string, enabled: boolean) => {
    const response = await apiClient.put(`/role-permissions/${role}/${permission}`, { enabled });
    return response.data as { message: string };
  },
  resetRolePermissions: async (role: string) => {
    const response = await apiClient.post(`/role-permissions/${role}/reset`);
    return response.data as { message: string; count: number };
  },
  getMyPermissions: async () => {
    const response = await apiClient.get('/role-permissions/my-permissions');
    return response.data as { role: string; permissions: Record<string, boolean> };
  },

  // Notifications
  getNotifications: async (params?: { unreadOnly?: boolean; limit?: number; offset?: number }) => {
    const response = await apiClient.get('/admin/notifications', { params });
    return response.data as { notifications: Notification[]; unreadCount: number };
  },
  getNotificationPreferences: async () => {
    const response = await apiClient.get('/admin/notifications/preferences');
    return response.data as { categories: NotificationPreference[] };
  },
  updateNotificationPreferences: async (preferences: Array<{ category: string; enabled: boolean }>) => {
    const response = await apiClient.put('/admin/notifications/preferences', { preferences });
    return response.data as { categories: NotificationPreference[] };
  },
  markNotificationsRead: async (ids: string[]) => {
    const response = await apiClient.post('/admin/notifications/read', { ids });
    return response.data as { updated: number };
  },
  markAllNotificationsRead: async () => {
    const response = await apiClient.post('/admin/notifications/read-all');
    return response.data as { updated: number };
  },
  registerPushToken: async (data: { token: string; platform?: string; appName?: string; deviceName?: string }) => {
    const response = await apiClient.post('/admin/notifications/push/register', data);
    return response.data as { success: boolean };
  },
  unregisterPushToken: async (token: string) => {
    const response = await apiClient.post('/admin/notifications/push/unregister', { token });
    return response.data as { success: boolean };
  },
  sendTestPush: async (data?: { title?: string; body?: string; linkUrl?: string }) => {
    const response = await apiClient.post('/admin/notifications/push/test', data || {});
    return response.data as { success: boolean };
  },

  // Search
  searchStocks: async (params: { searchTerm?: string; limit?: number; offset?: number }) => {
    const response = await apiClient.get('/search/stocks', { params });
    return response.data as { success: boolean; data: any[]; total: number };
  },
  getStocksByCodes: async (codes: string[]) => {
    const response = await apiClient.post('/search/stocks/by-codes', { codes });
    return response.data as { success: boolean; data: any[]; total: number };
  },
  getStockColumns: async () => {
    const response = await apiClient.get('/search/stocks/columns');
    return response.data as { columns: string[] };
  },
  getStockUnits: async () => {
    const response = await apiClient.get('/search/stocks/units');
    return response.data as { units: string[] };
  },
  searchCustomers: async (params: { searchTerm?: string; limit?: number; offset?: number }) => {
    const response = await apiClient.get('/search/customers', { params });
    return response.data as { success: boolean; data: any[]; total: number };
  },
  getCustomerColumns: async () => {
    const response = await apiClient.get('/search/customers/columns');
    return response.data as { columns: string[] };
  },
  getSearchPreferences: async () => {
    const response = await apiClient.get('/search/preferences');
    return response.data as { preferences: { id: string; userId: string; stockColumns: string[]; customerColumns: string[]; createdAt: string; updatedAt: string } };
  },
  updateSearchPreferences: async (data: { stockColumns?: string[]; customerColumns?: string[] }) => {
    const response = await apiClient.put('/search/preferences', data);
    return response.data as { success: boolean; preferences: any };
  },

  // Cari hareket / Ekstre
  searchCariForEkstre: async (params: { searchTerm: string; limit?: number }) => {
    const response = await apiClient.get('/cari-hareket/search', { params });
    return response.data as { data: any[]; total: number };
  },
  getCariHareketFoyu: async (params: { cariKod: string; startDate?: string; endDate?: string }) => {
    const response = await apiClient.get('/cari-hareket/foyu', { params });
    return response.data as { data: any[]; opening?: { borc?: number; alacak?: number; bakiye?: number } };
  },
  getCariInfo: async (cariKod: string) => {
    const response = await apiClient.get(`/cari-hareket/info/${cariKod}`);
    return response.data as { data: any };
  },

  // Vade tracking
  getVadeBalances: async (params?: { search?: string; overdueOnly?: boolean; upcomingOnly?: boolean; sectorCode?: string; groupCode?: string; page?: number; limit?: number }) => {
    const response = await apiClient.get('/admin/vade/balances', { params });
    return response.data as { balances: VadeBalance[]; pagination: any; summary: { overdue: number; upcoming: number; total: number } };
  },
  getVadeDashboard: async (params?: { sectorCode?: string; groupCode?: string }) => {
    const response = await apiClient.get('/admin/vade/dashboard', { params });
    return response.data as VadeDashboard;
  },
  getVadeAnalytics: async (params?: { days?: number }) => {
    const response = await apiClient.get('/admin/vade/analytics', { params });
    return response.data as VadeAnalytics;
  },
  getVadeManagement: async (params?: { days?: number }) => {
    const response = await apiClient.get('/admin/vade/management', { params });
    return response.data as VadeManagement;
  },
  getVadeFilters: async () => {
    const response = await apiClient.get('/admin/vade/filters');
    return response.data as { sectorCodes: string[]; groupCodes: string[] };
  },
  getVadeCustomer: async (customerId: string) => {
    const response = await apiClient.get(`/admin/vade/customers/${customerId}`);
    return response.data as { customer: any; notes: VadeNote[]; assignments: VadeAssignment[] };
  },
  getVadeNotes: async (params?: { customerId?: string; authorId?: string; tag?: string; startDate?: string; endDate?: string; reminderOnly?: boolean; reminderCompleted?: boolean; reminderFrom?: string; reminderTo?: string }) => {
    const response = await apiClient.get('/admin/vade/notes', { params });
    return response.data as { notes: VadeNote[] };
  },
  createVadeNote: async (data: { customerId: string; noteContent: string; promiseDate?: string | null; tags?: string[]; reminderDate?: string | null; reminderNote?: string | null; reminderCompleted?: boolean; balanceAtTime?: number | null }) => {
    const response = await apiClient.post('/admin/vade/notes', data);
    return response.data as { note: VadeNote };
  },
  updateVadeNote: async (noteId: string, data: { noteContent?: string; promiseDate?: string | null; tags?: string[]; reminderDate?: string | null; reminderNote?: string | null; reminderCompleted?: boolean; reminderSentAt?: string | null; balanceAtTime?: number | null }) => {
    const response = await apiClient.put(`/admin/vade/notes/${noteId}`, data);
    return response.data as { note: VadeNote };
  },
  upsertVadeClassification: async (data: { customerId: string; classification: string; customClassification?: string | null; riskScore?: number | null }) => {
    const response = await apiClient.post('/admin/vade/classification', data);
    return response.data as { classification: VadeClassification };
  },
  getVadeAssignments: async (params?: { staffId?: string; customerId?: string }) => {
    const response = await apiClient.get('/admin/vade/assignments', { params });
    return response.data as { assignments: VadeAssignment[] };
  },
  assignVadeCustomers: async (data: { staffId: string; customerIds: string[] }) => {
    const response = await apiClient.post('/admin/vade/assignments', data);
    return response.data as { created: number };
  },
  removeVadeAssignment: async (data: { staffId: string; customerId: string }) => {
    const response = await apiClient.delete('/admin/vade/assignments', { data });
    return response.data as { success: boolean };
  },
  importVadeBalances: async (rows: VadeImportRowInput[], options: VadeImportOptions) => {
    const response = await apiClient.post('/admin/vade/import', { rows, ...options });
    return response.data as VadeImportResult;
  },
  triggerVadeSync: async () => {
    const response = await apiClient.post('/admin/vade/sync');
    return response.data as { success: boolean; syncLogId: string; error?: string };
  },
  getVadeSyncStatus: async (syncLogId: string) => {
    const response = await apiClient.get(`/admin/vade/sync/status/${syncLogId}`);
    return response.data as { log: VadeSyncLog };
  },

  // E-invoices
  getEInvoices: async (params?: { search?: string; invoicePrefix?: string; customerId?: string; customerCode?: string; fromDate?: string; toDate?: string; page?: number; limit?: number }) => {
    const response = await apiClient.get('/admin/einvoices', { params });
    return response.data as { documents: EInvoiceDocument[]; pagination: { page: number; limit: number; total: number; totalPages: number } };
  },
  uploadEInvoices: async (formData: FormData) => {
    const response = await apiClient.post('/admin/einvoices/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data as { uploaded: number; updated: number; failed: number; results: Array<{ invoiceNo: string; documentId?: string; status: string; message?: string }> };
  },
  downloadEInvoice: async (id: string) => {
    const response = await apiClient.get(`/admin/einvoices/${id}/download`, { responseType: 'blob' });
    return response.data as Blob;
  },

  // Reports
  getCostUpdateAlerts: async (params?: { dayDiff?: number; percentDiff?: number; category?: string; page?: number; limit?: number }) => {
    const response = await apiClient.get('/admin/reports/cost-update-alerts', { params });
    return response.data as { success: boolean; data: { products: CostUpdateAlert[]; summary: any; pagination: any; metadata: any } };
  },
  getMarginComplianceReport: async (params?: Record<string, any>) => {
    const response = await apiClient.get('/admin/reports/margin-compliance', { params });
    return response.data as { success: boolean; data: { data: MarginComplianceRow[]; summary: any; pagination: any; metadata: any } };
  },
  getPriceHistory: async (params?: Record<string, any>) => {
    const response = await apiClient.get('/admin/reports/price-history', { params });
    return response.data as { success: boolean; data: { changes: PriceHistoryChange[]; summary: any; pagination: any } };
  },
  getTopProducts: async (params?: { startDate?: string; endDate?: string; brand?: string; category?: string; minQuantity?: number; sortBy?: 'revenue' | 'profit' | 'margin' | 'quantity'; page?: number; limit?: number }) => {
    const response = await apiClient.get('/admin/reports/top-products', { params });
    return response.data as { success: boolean; data: { products: any[]; summary: any; pagination: any } };
  },
  getTopCustomers: async (params?: { startDate?: string; endDate?: string; sector?: string; minOrderAmount?: number; sortBy?: 'revenue' | 'profit' | 'margin' | 'orderCount'; page?: number; limit?: number }) => {
    const response = await apiClient.get('/admin/reports/top-customers', { params });
    return response.data as { success: boolean; data: { customers: any[]; summary: any; pagination: any } };
  },
  getProductCustomers: async (params: { productCode: string; startDate?: string; endDate?: string; page?: number; limit?: number }) => {
    const { productCode, ...rest } = params;
    const response = await apiClient.get(`/admin/reports/product-customers/${productCode}`, { params: rest });
    return response.data as { success: boolean; data: { customers: any[]; summary: any; pagination: any } };
  },
  getPriceHistoryNew: async (params?: Record<string, any>) => {
    const response = await apiClient.get('/admin/reports/price-history-new', { params });
    return response.data as { success: boolean; data: any };
  },
  getProductPriceDetail: async (productCode: string) => {
    const response = await apiClient.get(`/admin/reports/product-price-detail/${productCode}`);
    return response.data as { success: boolean; data: any };
  },
  getPriceSummaryStats: async () => {
    const response = await apiClient.get('/admin/reports/price-summary-stats');
    return response.data as { success: boolean; data: any };
  },
  getComplementMissingReport: async (params: {
    mode: 'product' | 'customer';
    matchMode?: 'product' | 'category' | 'group';
    productCode?: string;
    customerCode?: string;
    sectorCode?: string;
    salesRepId?: string;
    periodMonths?: number;
    page?: number;
    limit?: number;
    minDocumentCount?: number;
  }) => {
    const queryParams = new URLSearchParams();
    queryParams.append('mode', params.mode);
    if (params.matchMode) queryParams.append('matchMode', params.matchMode);
    if (params.productCode) queryParams.append('productCode', params.productCode);
    if (params.customerCode) queryParams.append('customerCode', params.customerCode);
    if (params.sectorCode) queryParams.append('sectorCode', params.sectorCode);
    if (params.salesRepId) queryParams.append('salesRepId', params.salesRepId);
    if (params.periodMonths) queryParams.append('periodMonths', params.periodMonths.toString());
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.minDocumentCount) queryParams.append('minDocumentCount', params.minDocumentCount.toString());
    const response = await apiClient.get(`/admin/reports/complement-missing?${queryParams.toString()}`);
    return response.data as { success: boolean; data: any };
  },
  getCustomerActivityReport: async (params: {
    startDate?: string;
    endDate?: string;
    customerCode?: string;
    userId?: string;
    page?: number;
    limit?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.customerCode) queryParams.append('customerCode', params.customerCode);
    if (params.userId) queryParams.append('userId', params.userId);
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    const response = await apiClient.get(`/admin/reports/customer-activity?${queryParams.toString()}`);
    return response.data as { success: boolean; data: any };
  },
  getCustomerCartsReport: async (params: {
    search?: string;
    includeEmpty?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params.search) queryParams.append('search', params.search);
    if (params.includeEmpty) queryParams.append('includeEmpty', '1');
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    const response = await apiClient.get(`/admin/reports/customer-carts?${queryParams.toString()}`);
    return response.data as { success: boolean; data: any };
  },
  clearCustomerCart: async (cartId: string) => {
    const response = await apiClient.delete(`/admin/reports/customer-carts/${encodeURIComponent(cartId)}/items`);
    return response.data as { success: boolean; data: { cartId: string; deletedCount: number } };
  },
  getActionRadar: async () => {
    const response = await apiClient.get('/admin/reports/action-radar');
    return response.data as { success: boolean; data: any };
  },
  searchCustomer360: async (params?: { search?: string; limit?: number }) => {
    return await getWithSearchFallback('/admin/customer-360/search', params, 'customers') as { customers: any[] };
  },
  getCustomer360: async (customerIdOrCode: string) => {
    const response = await apiClient.get(`/admin/customer-360/${encodeURIComponent(customerIdOrCode)}`);
    return response.data as { success: boolean; data: any };
  },
  searchFieldSalesCustomers: async (params?: { search?: string; limit?: number }) => {
    return await getWithSearchFallback('/admin/field-sales/customers', params, 'customers') as { customers: any[] };
  },
  getFieldSalesCustomer: async (customerIdOrCode: string) => {
    const response = await apiClient.get(`/admin/field-sales/customers/${encodeURIComponent(customerIdOrCode)}`);
    return response.data as { success: boolean; data: any };
  },
  searchFieldSalesProducts: async (params?: {
    search?: string;
    customerId?: string;
    limit?: number;
    safeMode?: boolean;
  }) => {
    return await getWithSearchFallback('/admin/field-sales/products', params, 'products') as { products: any[] };
  },
  getFieldSalesProduct: async (
    productCode: string,
    params?: { customerId?: string; safeMode?: boolean }
  ) => {
    const response = await apiClient.get(`/admin/field-sales/products/${encodeURIComponent(productCode)}`, { params });
    return response.data as { success: boolean; data: any };
  },
  createFieldSalesVisitCustomer: async (payload: {
    customerName: string;
    phone?: string | null;
    email?: string | null;
    note?: string | null;
    demand?: string | null;
    competitorInfo?: string | null;
    photoUrl?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  }) => {
    const response = await apiClient.post('/admin/field-sales/visit-customers', payload);
    return response.data as { success: boolean; data: { customer: any; note: any } };
  },
  uploadFieldSalesVisitPhoto: async (formData: FormData) => {
    const response = await apiClient.post('/admin/field-sales/visit-photo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data as { success: boolean; imageUrl: string };
  },
  getFieldSalesVisits: async (params?: {
    search?: string;
    startDate?: string;
    endDate?: string;
    onlyVisitCustomers?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get('/admin/field-sales/visits', { params });
    return response.data as { success: boolean; data: { visits: any[]; summary: any; pagination: any } };
  },
  createFieldSalesVisitNote: async (
    customerIdOrCode: string,
    payload: {
      note: string;
      demand?: string | null;
      competitorInfo?: string | null;
      photoUrl?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    }
  ) => {
    const response = await apiClient.post(
      `/admin/field-sales/customers/${encodeURIComponent(customerIdOrCode)}/visit-notes`,
      payload
    );
    return response.data as { success: boolean; data: any };
  },
  getHotSalesDashboard: async () => {
    const response = await apiClient.get('/admin/hot-sales/dashboard');
    return response.data as HotSaleDashboard;
  },
  getHotSaleVehicles: async () => {
    const response = await apiClient.get('/admin/hot-sales/vehicles');
    return response.data as { vehicles: HotSaleVehicle[] };
  },
  saveHotSaleVehicle: async (payload: {
    id?: string;
    name: string;
    plate: string;
    active?: boolean;
    defaultSourceWarehouseNo?: number;
    note?: string | null;
  }) => {
    const response = await apiClient.post('/admin/hot-sales/vehicles', payload);
    return response.data as { vehicle: HotSaleVehicle };
  },
  searchHotSaleCustomers: async (params?: { search?: string; limit?: number }) => {
    const response = await apiClient.get('/admin/hot-sales/customers', { params });
    return response.data as { customers: HotSaleCustomer[] };
  },
  createHotSaleCustomer: async (payload: {
    customerName: string;
    phone: string;
    taxOffice: string;
    taxNumber: string;
    email?: string;
    city?: string;
    district?: string;
    address?: string;
  }) => {
    const response = await apiClient.post('/admin/hot-sales/customers', payload);
    return response.data as { customer: HotSaleCustomer; mikro: any };
  },
  searchHotSaleProducts: async (params?: {
    search?: string;
    limit?: number;
    vehicleId?: string;
    customerIdOrCode?: string;
  }) => {
    const response = await apiClient.get('/admin/hot-sales/products', { params });
    return response.data as { products: HotSaleProduct[] };
  },
  getHotSaleOpenOrders: async (params?: {
    search?: string;
    limit?: number;
    vehicleId?: string;
    customerIdOrCode?: string;
  }) => {
    const response = await apiClient.get('/admin/hot-sales/orders', { params });
    return response.data as { orders: HotSaleOpenOrder[] };
  },
  startHotSaleSession: async (payload: {
    vehicleId: string;
    sourceWarehouseNo?: number;
    openingCash?: number;
    startKm?: number;
    note?: string;
    loadItems?: Array<Pick<HotSaleCartItem, 'productCode' | 'quantity'>>;
  }) => {
    const response = await apiClient.post('/admin/hot-sales/sessions', payload);
    return response.data as { session: HotSaleSession };
  },
  getHotSaleSession: async (sessionId: string) => {
    const response = await apiClient.get(`/admin/hot-sales/sessions/${encodeURIComponent(sessionId)}`);
    return response.data as { session: HotSaleSession; inventory: HotSaleInventoryItem[] };
  },
  addHotSaleLoad: async (
    sessionId: string,
    payload: { sourceWarehouseNo?: number; items: Array<Pick<HotSaleCartItem, 'productCode' | 'quantity'>> }
  ) => {
    const response = await apiClient.post(`/admin/hot-sales/sessions/${encodeURIComponent(sessionId)}/load`, payload);
    return response.data as { documentNo?: string; [key: string]: any };
  },
  createHotSaleTransaction: async (
    sessionId: string,
    payload: {
      operationKey: string;
      type: HotSaleTransactionType;
      customerId?: string;
      customerCode?: string | null;
      customerName?: string | null;
      paymentType?: HotSalePaymentType;
      priceListNo?: number;
      note?: string;
      items: Array<Pick<HotSaleCartItem, 'productCode' | 'quantity' | 'unitPrice' | 'unit' | 'priceListNo'>>;
    }
  ) => {
    const response = await apiClient.post(`/admin/hot-sales/sessions/${encodeURIComponent(sessionId)}/transactions`, payload);
    return response.data as { transaction: HotSaleTransaction };
  },
  deliverHotSaleOrder: async (
    sessionId: string,
    payload: { orderNumber: string; items: Array<{ orderGuid: string; productCode: string; quantity: number }> }
  ) => {
    const response = await apiClient.post(`/admin/hot-sales/sessions/${encodeURIComponent(sessionId)}/order-delivery`, payload);
    return response.data as { transaction: HotSaleTransaction };
  },
  closeHotSaleSession: async (
    sessionId: string,
    payload: {
      closingCash?: number;
      endKm?: number;
      note?: string;
      counts: Array<{
        productCode: string;
        countedQty: number;
        action?: HotSaleClosureAction;
        note?: string;
      }>;
    }
  ) => {
    const response = await apiClient.post(`/admin/hot-sales/sessions/${encodeURIComponent(sessionId)}/close`, payload);
    return response.data as { session: HotSaleSession };
  },
  getHotSaleInventory: async (vehicleId: string) => {
    const response = await apiClient.get(`/admin/hot-sales/vehicles/${encodeURIComponent(vehicleId)}/inventory`);
    return response.data as { inventory: HotSaleInventoryItem[] };
  },
  getHotSaleReconciliation: async (params?: { limit?: number }) => {
    const response = await apiClient.get('/admin/hot-sales/reconciliation', { params });
    return response.data as any;
  },
  getHotSaleDailyReport: async (params?: {
    startDate?: string;
    endDate?: string;
    vehicleId?: string;
    userId?: string;
    limit?: number;
  }) => {
    const response = await apiClient.get('/admin/hot-sales/reports/daily', { params });
    return response.data as HotSaleDailyReport;
  },
  cancelHotSaleTransactionLocally: async (transactionId: string, payload?: { note?: string }) => {
    const response = await apiClient.post(`/admin/hot-sales/transactions/${encodeURIComponent(transactionId)}/cancel-local`, payload || {});
    return response.data as { transaction: HotSaleTransaction };
  },
  getCustomerEngagement: async (params?: {
    search?: string;
    status?: string;
    sort?: string;
    page?: number;
    limit?: number;
    followUpDue?: boolean;
  }) => {
    const response = await apiClient.get('/admin/reports/customer-engagement', { params });
    return response.data as EngagementReport;
  },
  addCustomerEngagementContact: async (code: string, payload?: ContactInput) => {
    const response = await apiClient.post(`/admin/reports/customer-engagement/${encodeURIComponent(code)}/contact`, payload || {});
    return response.data as { success: boolean; contact: ContactLogEntry };
  },
  getCustomerEngagementContacts: async (code: string) => {
    const response = await apiClient.get(`/admin/reports/customer-engagement/${encodeURIComponent(code)}/contacts`);
    return response.data as { contacts: ContactLogEntry[] };
  },
  searchSupplierCostProducts: async (params?: { search?: string; limit?: number }) => {
    return await getWithSearchFallback('/admin/supplier-costs/products/search', params, 'products') as { products: any[] };
  },
  searchSupplierCostSuppliers: async (params?: { search?: string; limit?: number }) => {
    return await getWithSearchFallback('/admin/supplier-costs/suppliers/search', params, 'suppliers') as { suppliers: Array<{ code: string; name: string }> };
  },
  getSupplierCostProduct: async (productCode: string) => {
    const response = await apiClient.get(`/admin/supplier-costs/products/${encodeURIComponent(productCode)}`);
    return response.data as { product: any; costs: any[]; applications: any[]; metrics: any };
  },
  getSupplierCosts: async (params?: {
    search?: string;
    productCode?: string;
    supplierCode?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get('/admin/supplier-costs', { params });
    return response.data as { items: any[]; pagination: any };
  },
  createSupplierCost: async (payload: any) => {
    const response = await apiClient.post('/admin/supplier-costs', payload);
    return response.data as { cost: any };
  },
  updateSupplierCost: async (id: string, payload: any) => {
    const response = await apiClient.put(`/admin/supplier-costs/${encodeURIComponent(id)}`, payload);
    return response.data as { cost: any };
  },
  archiveSupplierCost: async (id: string) => {
    const response = await apiClient.delete(`/admin/supplier-costs/${encodeURIComponent(id)}`);
    return response.data as { cost: any };
  },
  applySupplierCost: async (id: string, payload: { updatePriceLists?: boolean; note?: string | null }) => {
    const response = await apiClient.post(`/admin/supplier-costs/${encodeURIComponent(id)}/apply`, payload);
    return response.data as { result: any; cost: any; application: any };
  },
  getSupplierCostReports: async (params?: {
    staleDays?: number;
    tolerancePercent?: number;
    spreadPercent?: number;
    search?: string;
    limit?: number;
  }) => {
    const response = await apiClient.get('/admin/supplier-costs/reports', { params });
    return response.data as { generatedAt: string; params: any; summary: any; sections: Record<string, any[]> };
  },
  uploadSupplierCostAttachment: async (formData: FormData) => {
    const response = await apiClient.post('/admin/supplier-costs/attachments', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data as { attachmentUrl: string; originalName: string; size: number };
  },
  uploadPriceVerificationAttachment: async (formData: FormData) => {
    const response = await apiClient.post('/admin/price-verification/attachments', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data as { attachmentUrl: string; url?: string; originalName: string; size: number; type?: string | null };
  },
  getPriceVerificationRequests: async (params?: {
    search?: string;
    status?: string;
    type?: string;
    mine?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get('/admin/price-verification/requests', { params });
    return response.data as { items: any[]; pagination: any; summary: any; scope: { canManage: boolean } };
  },
  addPriceVerificationOffer: async (id: string, payload: any) => {
    const response = await apiClient.post(`/admin/price-verification/requests/${encodeURIComponent(id)}/offers`, payload);
    return response.data as { request: any };
  },
  submitPriceVerificationToSales: async (id: string, payload?: any) => {
    const response = await apiClient.post(`/admin/price-verification/requests/${encodeURIComponent(id)}/submit-to-sales`, payload || {});
    return response.data as { request: any };
  },
  decidePriceVerification: async (id: string, payload: { approved: boolean; selectedOfferId?: string; note?: string }) => {
    const response = await apiClient.post(`/admin/price-verification/requests/${encodeURIComponent(id)}/sales-decision`, payload);
    return response.data as { request: any };
  },
  markPriceVerificationCurrent: async (id: string, payload?: { note?: string }) => {
    const response = await apiClient.post(`/admin/price-verification/requests/${encodeURIComponent(id)}/mark-current`, payload || {});
    return response.data as { request: any; application: any | null };
  },
  completePriceVerification: async (id: string, payload?: { updatePriceLists?: boolean; note?: string; stockCreatePayload?: any }) => {
    const response = await apiClient.post(`/admin/price-verification/requests/${encodeURIComponent(id)}/complete`, payload || {});
    return response.data as { request: any; supplierCost: any; application: any };
  },
  cancelPriceVerification: async (id: string, payload?: { note?: string }) => {
    const response = await apiClient.post(`/admin/price-verification/requests/${encodeURIComponent(id)}/cancel`, payload || {});
    return response.data as { request: any };
  },
  addPriceVerificationNote: async (id: string, payload: { body: string; visibility?: string }) => {
    const response = await apiClient.post(`/admin/price-verification/requests/${encodeURIComponent(id)}/notes`, payload);
    return response.data as { note: any };
  },
  getTenderCostRequests: async (params?: {
    search?: string;
    status?: string;
    mine?: boolean;
    sort?: 'newest' | 'oldest' | 'deadlineSoon';
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get('/admin/tender-cost-requests', { params });
    return response.data as { items: any[]; pagination: any; summary: any; scope: { canManage: boolean } };
  },
  addTenderCostOffer: async (id: string, itemId: string, payload: any) => {
    const response = await apiClient.post(`/admin/tender-cost-requests/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}/offers`, payload);
    return response.data as { request: any };
  },
  completeTenderCostRequest: async (id: string, payload?: { note?: string }) => {
    const response = await apiClient.post(`/admin/tender-cost-requests/${encodeURIComponent(id)}/complete`, payload || {});
    return response.data as { request: any };
  },
  cancelTenderCostRequest: async (id: string, payload?: { note?: string }) => {
    const response = await apiClient.post(`/admin/tender-cost-requests/${encodeURIComponent(id)}/cancel`, payload || {});
    return response.data as { request: any };
  },
  getAssignedCustomerRecoveryActions: async (params?: {
    status?: string;
    search?: string;
    dueOnly?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get('/admin/reports/customer-recovery/actions/assigned', { params });
    return response.data as {
      success: boolean;
      data: {
        actions: CustomerRecoveryAction[];
        pagination: { page: number; limit: number; totalPages: number; totalRecords: number };
      };
    };
  },
  getCustomerRecoveryReport: async (params?: {
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
    riskTypes?: string[] | string;
    onlyWithOpenAction?: boolean;
    onlyDueFollowUp?: boolean;
    minLostPotential?: number;
    seasonalityMode?: 'include' | 'exclude' | 'only';
    purchasePattern?: 'ALL' | 'FREQUENT' | 'PERIODIC' | 'SPORADIC';
    page?: number;
    limit?: number;
    sortBy?: string;
    sortDirection?: 'asc' | 'desc';
  }) => {
    const response = await apiClient.get('/admin/reports/customer-recovery', { params });
    return response.data as { success: boolean; data: any };
  },
  getCustomerRecoveryHistoricalValueReport: async (params?: {
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
    sortBy?: string;
    sortDirection?: 'asc' | 'desc';
  }) => {
    const response = await apiClient.get('/admin/reports/customer-recovery/historical-value', { params });
    return response.data as { success: boolean; data: any };
  },
  createCustomerRecoveryAction: async (customerCode: string, payload: CustomerRecoveryActionInput) => {
    const response = await apiClient.post(
      `/admin/reports/customer-recovery/${encodeURIComponent(customerCode)}/actions`,
      payload
    );
    return response.data as { success: boolean; data: { action: CustomerRecoveryAction } };
  },
  bulkAssignCustomerRecovery: async (payload: {
    customerCodes: string[];
    customerNames?: Record<string, string | null>;
    assignedToId: string;
    note?: string;
    priority?: string;
    followUpDate?: string | null;
    snapshotByCustomer?: Record<string, unknown>;
  }) => {
    const response = await apiClient.post('/admin/reports/customer-recovery/bulk-assign', payload);
    return response.data as { success: boolean; data: { createdCount: number } };
  },
  updateCustomerRecoveryAction: async (actionId: string, payload: Partial<CustomerRecoveryActionInput>) => {
    const response = await apiClient.patch(`/admin/reports/customer-recovery/actions/${encodeURIComponent(actionId)}`, payload);
    return response.data as { success: boolean; data: { action: CustomerRecoveryAction } };
  },
  getSupplierPriceListSuppliers: async () => {
    const response = await apiClient.get('/admin/supplier-price-lists/suppliers');
    return response.data as { suppliers: any[] };
  },
  createSupplierPriceListSupplier: async (data: {
    name: string;
    active?: boolean;
    discount1?: number | null;
    discount2?: number | null;
    discount3?: number | null;
    discount4?: number | null;
    discount5?: number | null;
    priceIsNet?: boolean;
    priceIncludesVat?: boolean;
    priceByColor?: boolean;
    defaultVatRate?: number | null;
    excelSheetName?: string | null;
    excelHeaderRow?: number | null;
    excelCodeHeader?: string | null;
    excelNameHeader?: string | null;
    excelPriceHeader?: string | null;
    pdfPriceIndex?: number | null;
    pdfCodePattern?: string | null;
    discountRules?: Array<{ keywords: string[]; discounts: number[] }>;
  }) => {
    const response = await apiClient.post('/admin/supplier-price-lists/suppliers', data);
    return response.data as { supplier: any };
  },
  updateSupplierPriceListSupplier: async (id: string, data: {
    name?: string;
    active?: boolean;
    discount1?: number | null;
    discount2?: number | null;
    discount3?: number | null;
    discount4?: number | null;
    discount5?: number | null;
    priceIsNet?: boolean;
    priceIncludesVat?: boolean;
    priceByColor?: boolean;
    defaultVatRate?: number | null;
    excelSheetName?: string | null;
    excelHeaderRow?: number | null;
    excelCodeHeader?: string | null;
    excelNameHeader?: string | null;
    excelPriceHeader?: string | null;
    pdfPriceIndex?: number | null;
    pdfCodePattern?: string | null;
    discountRules?: Array<{ keywords: string[]; discounts: number[] }>;
  }) => {
    const response = await apiClient.put(`/admin/supplier-price-lists/suppliers/${id}`, data);
    return response.data as { supplier: any };
  },
  previewSupplierPriceLists: async (params: {
    supplierId: string;
    files: Array<{ uri: string; name?: string; mimeType?: string }>;
    overrides?: SupplierPriceListOverrides;
  }) => {
    const formData = new FormData();
    formData.append('supplierId', params.supplierId);
    params.files.forEach((file) => {
      formData.append('files', {
        uri: file.uri,
        name: file.name || 'price-list',
        type: file.mimeType || 'application/octet-stream',
      } as any);
    });
    appendSupplierPriceListOverrides(formData, params.overrides);

    const response = await apiClient.post('/admin/supplier-price-lists/preview', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data as { excel?: any; pdf?: any };
  },
  uploadSupplierPriceLists: async (params: {
    supplierId: string;
    files: Array<{ uri: string; name?: string; mimeType?: string }>;
    overrides?: SupplierPriceListOverrides;
  }) => {
    const formData = new FormData();
    formData.append('supplierId', params.supplierId);
    params.files.forEach((file) => {
      formData.append('files', {
        uri: file.uri,
        name: file.name || 'price-list',
        type: file.mimeType || 'application/octet-stream',
      } as any);
    });
    appendSupplierPriceListOverrides(formData, params.overrides);

    const response = await apiClient.post('/admin/supplier-price-lists/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data as { uploadId: string; summary: any };
  },
  getSupplierPriceListUploads: async (params: {
    supplierId?: string;
    page?: number;
    limit?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params.supplierId) queryParams.append('supplierId', params.supplierId);
    if (params.page !== undefined) queryParams.append('page', params.page.toString());
    if (params.limit !== undefined) queryParams.append('limit', params.limit.toString());
    const response = await apiClient.get(`/admin/supplier-price-lists?${queryParams.toString()}`);
    return response.data as { uploads: any[]; pagination: any };
  },
  getSupplierPriceListUpload: async (id: string) => {
    const response = await apiClient.get(`/admin/supplier-price-lists/${id}`);
    return response.data as { upload: any };
  },
  getSupplierPriceListItems: async (params: {
    uploadId: string;
    status?: 'matched' | 'unmatched' | 'multiple' | 'suspicious';
    page?: number;
    limit?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params.status) queryParams.append('status', params.status);
    if (params.page !== undefined) queryParams.append('page', params.page.toString());
    if (params.limit !== undefined) queryParams.append('limit', params.limit.toString());
    const response = await apiClient.get(`/admin/supplier-price-lists/${params.uploadId}/items?${queryParams.toString()}`);
    return response.data as { items: any[]; pagination: any };
  },

  // Sync
  triggerSync: async () => {
    const response = await apiClient.post('/admin/sync');
    return response.data as { syncLogId: string };
  },
  triggerImageSync: async () => {
    const response = await apiClient.post('/admin/sync/images');
    return response.data as { syncLogId: string };
  },
  getSyncStatus: async (id: string) => {
    const response = await apiClient.get(`/admin/sync/status/${id}`);
    return response.data as SyncStatus;
  },
  triggerCariSync: async () => {
    const response = await apiClient.post('/admin/sync/cari');
    return response.data as { syncId: string };
  },
  getCariSyncStatus: async (id: string) => {
    const response = await apiClient.get(`/admin/sync/cari/status/${id}`);
    return response.data as SyncStatus;
  },
  getLatestCariSync: async () => {
    const response = await apiClient.get('/admin/sync/cari/latest');
    return response.data as SyncStatus | { message?: string };
  },
  triggerPriceSync: async () => {
    const response = await apiClient.post('/admin/price-sync');
    return response.data as { success: boolean; syncType?: string; recordsSynced?: number; error?: string };
  },
  getPriceSyncStatus: async () => {
    const response = await apiClient.get('/admin/price-sync/status');
    return response.data as { success: boolean; status: any };
  },
};
