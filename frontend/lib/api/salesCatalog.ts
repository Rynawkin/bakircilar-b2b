import apiClient from './client';

export type SalesCatalogStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type SalesCatalogPriceBasis = 'CURRENT_COST' | 'LAST_ENTRY' | 'MAX_COST' | 'BETWEEN_COSTS' | 'PRICE_LIST';
export type SalesCatalogAdjustment = 'MARKUP' | 'GROSS_MARGIN' | 'LOSS' | 'NONE';
export type SalesCatalogVatMode = 'EXCLUDED' | 'INCLUDED';
export type SalesCatalogRounding = 'NONE' | 'NEAREST_0_50' | 'NEAREST_1' | 'NEAREST_5' | 'END_90' | 'END_99';
export type SalesCatalogGuard = 'NONE' | 'CURRENT_COST' | 'MAX_COST';
export type SalesCatalogDisplayDensity = 'STANDARD' | 'COMPACT';
export type SalesCatalogShareLinkStatus = 'ACTIVE' | 'PAUSED' | 'REVOKED';
export type SalesCatalogShareLinkEffectiveStatus = SalesCatalogShareLinkStatus | 'EXPIRED' | 'VIEW_LIMIT_REACHED';

export interface SalesCatalogProductRef {
  id: string;
  mikroCode: string;
  name: string;
  imageUrl?: string | null;
  currentCost?: number | null;
  currentCostDate?: string | null;
  lastEntryPrice?: number | null;
  category?: { id: string; name: string; mikroCode?: string | null } | null;
}

export interface SalesCatalogProductOption extends SalesCatalogProductRef {
  brandCode?: string | null;
  unit?: string | null;
}

export interface SalesCatalogProductFilters {
  categories: Array<{ id: string; mikroCode: string; name: string }>;
  brands: Array<{ code: string; name: string }>;
  suppliers: Array<{ code: string; name: string; productCount: number }>;
}

export interface SalesCatalogItemInput {
  productId: string;
  sortOrder?: number;
  fixedPrice?: number | null;
}

export interface SalesCatalogSectionInput {
  title: string;
  categoryId?: string | null;
  categoryName?: string | null;
  sortOrder?: number;
  items: SalesCatalogItemInput[];
}

export interface SalesCatalogInput {
  name?: string;
  title?: string;
  subtitle?: string | null;
  coverImageUrl?: string | null;
  accentColor?: string;
  status?: SalesCatalogStatus;
  priceBasis?: SalesCatalogPriceBasis;
  adjustmentType?: SalesCatalogAdjustment;
  adjustmentValue?: number;
  betweenPercent?: number;
  priceListNo?: number | null;
  vatMode?: SalesCatalogVatMode;
  roundingMode?: SalesCatalogRounding;
  minimumPriceGuardType?: SalesCatalogGuard;
  minimumPriceGuardPercent?: number;
  excludeStaleCosts?: boolean;
  minCurrentCostDate?: string | null;
  hideOutOfStock?: boolean;
  hideMissingImage?: boolean;
  showStockStatus?: boolean;
  showProductCode?: boolean;
  showUnit?: boolean;
  displayDensity?: SalesCatalogDisplayDensity;
  validFrom?: string | null;
  validTo?: string | null;
  sections?: SalesCatalogSectionInput[];
}

export interface SalesCatalogAdminItem {
  id: string;
  productId: string;
  sortOrder: number;
  fixedPrice?: number | null;
  product: SalesCatalogProductRef;
}

export interface SalesCatalogAdminSection {
  id: string;
  title: string;
  categoryId?: string | null;
  categoryName?: string | null;
  sortOrder: number;
  items: SalesCatalogAdminItem[];
}

export interface SalesCatalogAdmin {
  id: string;
  name: string;
  title: string;
  subtitle?: string | null;
  coverImageUrl?: string | null;
  accentColor: string;
  shareToken: string;
  publicPath: string;
  status: SalesCatalogStatus;
  priceBasis: SalesCatalogPriceBasis;
  adjustmentType: SalesCatalogAdjustment;
  adjustmentValue: number;
  betweenPercent: number;
  priceListNo?: number | null;
  vatMode: SalesCatalogVatMode;
  roundingMode: SalesCatalogRounding;
  minimumPriceGuardType: SalesCatalogGuard;
  minimumPriceGuardPercent: number;
  excludeStaleCosts: boolean;
  minCurrentCostDate?: string | null;
  hideOutOfStock: boolean;
  hideMissingImage: boolean;
  showStockStatus: boolean;
  showProductCode: boolean;
  showUnit: boolean;
  displayDensity: SalesCatalogDisplayDensity;
  validFrom?: string | null;
  validTo?: string | null;
  publishedAt?: string | null;
  revision: number;
  viewCount: number;
  pdfDownloadCount: number;
  lastViewedAt?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
  createdAt: string;
  updatedAt: string;
  sectionCount?: number;
  itemCount?: number;
  sections?: SalesCatalogAdminSection[];
}

export interface SalesCatalogPublicProduct {
  id: string;
  productCode: string;
  name: string;
  brandCode?: string | null;
  unit?: string | null;
  unit2?: string | null;
  unit2Factor?: number | null;
  imageUrl?: string | null;
  salePrice: number;
  stockStatus?: 'IN_STOCK' | 'OUT_OF_STOCK' | null;
  fixedPrice?: number | null;
  currentCost?: number | null;
  currentCostDate?: string | null;
  lastEntryPrice?: number | null;
  lastEntryDate?: string | null;
  totalStock?: number;
  pricing?: {
    price?: number;
    basePrice?: number;
    basisLabel?: string;
    isBelowCurrentCost?: boolean;
  };
}

export interface SalesCatalogPublicSection {
  id: string;
  title: string;
  categoryId?: string | null;
  categoryName?: string | null;
  sortOrder: number;
  products: SalesCatalogPublicProduct[];
}

export interface SalesCatalogPresentation {
  catalog: {
    id: string;
    name?: string;
    title: string;
    subtitle?: string | null;
    coverImageUrl?: string | null;
    accentColor: string;
    shareToken: string;
    publicPath: string;
    status: SalesCatalogStatus;
    vatMode: SalesCatalogVatMode;
    validFrom?: string | null;
    validTo?: string | null;
    revision: number;
    showStockStatus: boolean;
    showProductCode: boolean;
    showUnit: boolean;
    displayDensity: SalesCatalogDisplayDensity;
    generatedAt: string;
    shareLinkId?: string | null;
    shareLinkName?: string | null;
    recipientLabel?: string | null;
    linkedCustomerCode?: string | null;
    personalized?: boolean;
    watermarkText?: string | null;
    priceFingerprint?: string | null;
    priceSnapshotId?: string | null;
    priceBasis?: SalesCatalogPriceBasis;
    adjustmentType?: SalesCatalogAdjustment;
    adjustmentValue?: number;
    betweenPercent?: number;
    priceListNo?: number | null;
    roundingMode?: SalesCatalogRounding;
    minimumPriceGuardType?: SalesCatalogGuard;
    minimumPriceGuardPercent?: number;
    excludeStaleCosts?: boolean;
    minCurrentCostDate?: string | null;
  };
  sections: SalesCatalogPublicSection[];
  excluded?: Array<{
    productId: string;
    productCode: string;
    productName: string;
    currentCostDate?: string | null;
    reasons: string[];
  }>;
  summary?: {
    selectedProducts: number;
    includedProducts: number;
    excludedProducts: number;
  };
}

export interface SalesCatalogShareLinkInput {
  name?: string;
  recipientName?: string | null;
  linkedCustomerId?: string | null;
  status?: SalesCatalogShareLinkStatus;
  expiresAt?: string | null;
  maxDevices?: number | null;
  maxViews?: number | null;
  pin?: string | null;
  clearPin?: boolean;
  lockToFirstDevice?: boolean;
  resetDeviceBinding?: boolean;
  useCustomPricing?: boolean;
  adjustmentType?: SalesCatalogAdjustment | null;
  adjustmentValue?: number | null;
}

export interface SalesCatalogShareLink {
  id: string;
  catalogId: string;
  name: string;
  recipientName?: string | null;
  linkedCustomerId?: string | null;
  linkedCustomerCode?: string | null;
  linkedCustomerName?: string | null;
  token: string;
  publicPath: string;
  isDefault: boolean;
  status: SalesCatalogShareLinkStatus;
  effectiveStatus: SalesCatalogShareLinkEffectiveStatus;
  expiresAt?: string | null;
  maxDevices?: number | null;
  maxViews?: number | null;
  hasPin: boolean;
  lockToFirstDevice: boolean;
  boundVisitorId?: string | null;
  useCustomPricing: boolean;
  adjustmentType?: SalesCatalogAdjustment | null;
  adjustmentValue?: number | null;
  viewCount: number;
  sessionCount: number;
  uniqueDevices: number;
  pdfDownloadCount: number;
  shareClickCount: number;
  lastViewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SalesCatalogShareVisitor {
  id: string;
  anonymousId: string;
  deviceType?: string | null;
  operatingSystem?: string | null;
  browser?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  viewCount: number;
  sessionCount: number;
  pdfDownloadCount: number;
  shareClickCount: number;
  catalogBlocked: boolean;
  globalBlocked: boolean;
  globalBlockedAt?: string | null;
}

export interface SalesCatalogShareAnalytics {
  link: SalesCatalogShareLink;
  visitors: SalesCatalogShareVisitor[];
  events: Array<{
    id: string;
    visitorId: string;
    eventType: string;
    metadata?: Record<string, unknown> | null;
    occurredAt: string;
    priceSnapshotId?: string | null;
  }>;
  snapshots: Array<{
    id: string;
    fingerprint: string;
    catalogRevision: number;
    adjustmentType: SalesCatalogAdjustment;
    adjustmentValue: number;
    productCount: number;
    generatedAt: string;
  }>;
}

export const salesCatalogApi = {
  list: async (): Promise<{ catalogs: SalesCatalogAdmin[] }> => {
    const response = await apiClient.get('/admin/sales-catalogs');
    return response.data;
  },
  get: async (id: string): Promise<{ catalog: SalesCatalogAdmin }> => {
    const response = await apiClient.get(`/admin/sales-catalogs/${id}`);
    return response.data;
  },
  getProductFilters: async (): Promise<SalesCatalogProductFilters> => {
    const response = await apiClient.get('/admin/products', { params: { catalogMode: 'filters' } });
    return response.data;
  },
  searchProducts: async (params: {
    search?: string;
    categoryId?: string;
    brandCode?: string;
    supplierCode?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    products: SalesCatalogProductOption[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> => {
    const response = await apiClient.get('/admin/products', {
      params: { ...params, catalogMode: 'options' },
    });
    return response.data;
  },
  create: async (data: SalesCatalogInput): Promise<{ catalog: SalesCatalogAdmin }> => {
    const response = await apiClient.post('/admin/sales-catalogs', data);
    return response.data;
  },
  update: async (id: string, data: SalesCatalogInput): Promise<{ catalog: SalesCatalogAdmin }> => {
    const response = await apiClient.put(`/admin/sales-catalogs/${id}`, data);
    return response.data;
  },
  remove: async (id: string): Promise<{ success: boolean }> => {
    const response = await apiClient.delete(`/admin/sales-catalogs/${id}`);
    return response.data;
  },
  preview: async (id: string): Promise<SalesCatalogPresentation> => {
    const response = await apiClient.get(`/admin/sales-catalogs/${id}/preview`);
    return response.data;
  },
  rotateToken: async (id: string): Promise<{ shareToken: string; publicPath: string }> => {
    const response = await apiClient.post(`/admin/sales-catalogs/${id}/rotate-token`);
    return response.data;
  },
  getPublic: async (token: string, accessToken?: string | null): Promise<SalesCatalogPresentation> => {
    const response = await apiClient.get(`/sales-catalogs/public/${encodeURIComponent(token)}`, {
      headers: accessToken ? { 'x-catalog-access-token': accessToken } : undefined,
    });
    return response.data;
  },
  authorizePin: async (token: string, pin: string): Promise<{ accessToken: string | null; protected: boolean }> => {
    const response = await apiClient.post(`/sales-catalogs/public/${encodeURIComponent(token)}/access`, { pin });
    return response.data;
  },
  recordEvent: async (
    token: string,
    eventType: 'VIEW' | 'PDF_DOWNLOAD' | 'SHARE_CLICK',
    payload?: { clientEventId?: string; priceSnapshotId?: string | null; metadata?: Record<string, unknown> },
    accessToken?: string | null
  ): Promise<{ success: boolean; sessionId?: string | null }> => {
    const response = await apiClient.post(
      `/sales-catalogs/public/${encodeURIComponent(token)}/events`,
      { eventType, ...(payload || {}) },
      { headers: accessToken ? { 'x-catalog-access-token': accessToken } : undefined }
    );
    return response.data;
  },
  recordPdfDownload: async (token: string, payload?: { clientEventId?: string; priceSnapshotId?: string | null }, accessToken?: string | null): Promise<void> => {
    await apiClient.post(
      `/sales-catalogs/public/${encodeURIComponent(token)}/pdf-download`,
      payload || {},
      { headers: accessToken ? { 'x-catalog-access-token': accessToken } : undefined }
    );
  },
  listShareLinks: async (catalogId: string): Promise<{ links: SalesCatalogShareLink[] }> => {
    const response = await apiClient.get(`/admin/sales-catalogs/${catalogId}/share-links`);
    return response.data;
  },
  createShareLink: async (catalogId: string, data: SalesCatalogShareLinkInput): Promise<{ link: SalesCatalogShareLink }> => {
    const response = await apiClient.post(`/admin/sales-catalogs/${catalogId}/share-links`, data);
    return response.data;
  },
  updateShareLink: async (catalogId: string, linkId: string, data: SalesCatalogShareLinkInput): Promise<{ link: SalesCatalogShareLink }> => {
    const response = await apiClient.patch(`/admin/sales-catalogs/${catalogId}/share-links/${linkId}`, data);
    return response.data;
  },
  rotateShareLinkToken: async (catalogId: string, linkId: string): Promise<{ link: SalesCatalogShareLink }> => {
    const response = await apiClient.post(`/admin/sales-catalogs/${catalogId}/share-links/${linkId}/rotate-token`);
    return response.data;
  },
  getShareLinkAnalytics: async (catalogId: string, linkId: string): Promise<SalesCatalogShareAnalytics> => {
    const response = await apiClient.get(`/admin/sales-catalogs/${catalogId}/share-links/${linkId}/analytics`);
    return response.data;
  },
  setVisitorBlock: async (catalogId: string, linkId: string, visitorId: string, data: { scope: 'CATALOG' | 'GLOBAL'; blocked: boolean; reason?: string | null }): Promise<{ success: boolean }> => {
    const response = await apiClient.post(`/admin/sales-catalogs/${catalogId}/share-links/${linkId}/visitors/${visitorId}/block`, data);
    return response.data;
  },
};

export default salesCatalogApi;
