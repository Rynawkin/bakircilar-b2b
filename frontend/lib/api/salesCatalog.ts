import apiClient from './client';

export type SalesCatalogStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type SalesCatalogPriceBasis = 'CURRENT_COST' | 'LAST_ENTRY' | 'MAX_COST' | 'BETWEEN_COSTS' | 'PRICE_LIST';
export type SalesCatalogAdjustment = 'MARKUP' | 'GROSS_MARGIN' | 'LOSS' | 'NONE';
export type SalesCatalogVatMode = 'EXCLUDED' | 'INCLUDED';
export type SalesCatalogRounding = 'NONE' | 'NEAREST_0_50' | 'NEAREST_1' | 'NEAREST_5' | 'END_90' | 'END_99';
export type SalesCatalogGuard = 'NONE' | 'CURRENT_COST' | 'MAX_COST';
export type SalesCatalogDisplayDensity = 'STANDARD' | 'COMPACT';

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
    const response = await apiClient.get('/admin/sales-catalogs/product-filters');
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
    const response = await apiClient.get('/admin/sales-catalogs/product-options', { params });
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
  getPublic: async (token: string): Promise<SalesCatalogPresentation> => {
    const response = await apiClient.get(`/sales-catalogs/public/${encodeURIComponent(token)}`);
    return response.data;
  },
  recordPdfDownload: async (token: string): Promise<void> => {
    await apiClient.post(`/sales-catalogs/public/${encodeURIComponent(token)}/pdf-download`);
  },
};

export default salesCatalogApi;
