/**
 * Admin API
 */

import apiClient from './client';
import {
  Settings,
  SyncResponse,
  SyncStatus,
  Customer,
  CreateCustomerRequest,
  PendingOrderForAdmin,
  CategoryWithPriceRules,
  SetPriceRuleRequest,
  DashboardStats,
} from '@/types';

export const adminApi = {
  // Settings
  getSettings: async (): Promise<Settings> => {
    const response = await apiClient.get('/admin/settings');
    return response.data;
  },

  updateSettings: async (data: Partial<Settings>): Promise<{ message: string; settings: Settings }> => {
    const response = await apiClient.put('/admin/settings', data);
    return response.data;
  },

  // Sync
  triggerSync: async (): Promise<SyncResponse> => {
    const response = await apiClient.post('/admin/sync');
    return response.data;
  },

  getSyncStatus: async (syncLogId: string): Promise<SyncStatus> => {
    const response = await apiClient.get(`/admin/sync/status/${syncLogId}`);
    return response.data;
  },

  triggerImageSync: async (): Promise<SyncResponse> => {
    const response = await apiClient.post('/admin/sync/images');
    return response.data;
  },

  triggerCariSync: async (): Promise<{ message: string; syncId: string }> => {
    const response = await apiClient.post('/admin/sync/cari');
    return response.data;
  },

  // Cari List
  getCariList: async (): Promise<{ cariList: Array<{
    code: string;
    name: string;
    city?: string;
    district?: string;
    phone?: string;
    isLocked: boolean;
    groupCode?: string;
    sectorCode?: string;
    paymentTerm?: number;
    hasEInvoice: boolean;
    balance: number;
  }> }> => {
    const response = await apiClient.get('/admin/cari-list');
    return response.data;
  },

  // Bulk User Creation
  getAvailableCaris: async (): Promise<{
    caris: Array<{
      code: string;
      name: string;
      city?: string;
      district?: string;
      phone?: string;
      isLocked: boolean;
      groupCode?: string;
      sectorCode?: string;
      paymentTerm?: number;
      hasEInvoice: boolean;
      balance: number;
    }>;
    totalAvailable: number;
    totalExisting: number;
  }> => {
    const response = await apiClient.get('/admin/caris/available');
    return response.data;
  },

  bulkCreateUsers: async (cariCodes: string[]): Promise<{
    success: boolean;
    message: string;
    results: {
      created: string[];
      skipped: string[];
      errors: Array<{ code: string; error: string }>;
    };
  }> => {
    const response = await apiClient.post('/admin/users/bulk-create', { cariCodes });
    return response.data;
  },

  // Products
  getProducts: async (params?: {
    search?: string;
    hasImage?: 'true' | 'false';
    categoryId?: string;
    sortBy?: 'name' | 'mikroCode' | 'excessStock' | 'lastEntryDate' | 'currentCost';
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ products: any[] }> => {
    const response = await apiClient.get('/admin/products', { params });
    return response.data;
  },

  // Customers
  getCustomers: async (): Promise<{ customers: Customer[] }> => {
    const response = await apiClient.get('/admin/customers');
    return response.data;
  },

  createCustomer: async (data: CreateCustomerRequest): Promise<{ message: string; customer: Customer }> => {
    const response = await apiClient.post('/admin/customers', data);
    return response.data;
  },

  updateCustomer: async (id: string, data: {
    email?: string;
    customerType?: string;
    active?: boolean;
  }): Promise<{ message: string; customer: Customer }> => {
    const response = await apiClient.put(`/admin/customers/${id}`, data);
    return response.data;
  },

  // Orders
  getAllOrders: async (status?: string): Promise<{ orders: PendingOrderForAdmin[] }> => {
    const params = status ? { status } : {};
    const response = await apiClient.get('/admin/orders', { params });
    return response.data;
  },

  getPendingOrders: async (): Promise<{ orders: PendingOrderForAdmin[] }> => {
    const response = await apiClient.get('/admin/orders/pending');
    return response.data;
  },

  approveOrder: async (id: string, adminNote?: string): Promise<{ message: string; mikroOrderIds: string[] }> => {
    const response = await apiClient.post(`/admin/orders/${id}/approve`, { adminNote });
    return response.data;
  },

  rejectOrder: async (id: string, adminNote: string): Promise<{ message: string }> => {
    const response = await apiClient.post(`/admin/orders/${id}/reject`, { adminNote });
    return response.data;
  },

  // Categories & Pricing
  getCategories: async (): Promise<{ categories: CategoryWithPriceRules[] }> => {
    const response = await apiClient.get('/admin/categories');
    return response.data;
  },

  setCategoryPriceRule: async (data: SetPriceRuleRequest): Promise<{ message: string }> => {
    const response = await apiClient.post('/admin/categories/price-rule', data);
    return response.data;
  },

  setBulkCategoryPriceRules: async (rules: Array<{
    categoryId: string;
    customerType: string;
    profitMargin: number;
  }>): Promise<{
    message: string;
    updatedRules: number;
    totalRules: number;
    affectedCategories: number;
    pricesUpdated: number;
    errors: string[];
  }> => {
    const response = await apiClient.post('/admin/categories/bulk-price-rules', { rules });
    return response.data;
  },

  setProductPriceOverride: async (data: {
    productId: string;
    customerType: string;
    profitMargin: number;
  }): Promise<{ message: string }> => {
    const response = await apiClient.post('/admin/products/price-override', data);
    return response.data;
  },

  // Dashboard
  getDashboardStats: async (): Promise<DashboardStats> => {
    const response = await apiClient.get('/admin/dashboard/stats');
    return response.data;
  },

  // Product Images
  uploadProductImage: async (productId: string, formData: FormData): Promise<{ success: boolean; imageUrl: string; message: string }> => {
    const response = await apiClient.post(`/admin/products/${productId}/image`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  deleteProductImage: async (productId: string): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.delete(`/admin/products/${productId}/image`);
    return response.data;
  },

  // Staff Management
  getSectorCodes: async (): Promise<{ sectorCodes: string[] }> => {
    const response = await apiClient.get('/admin/sector-codes');
    return response.data;
  },

  getStaffMembers: async (): Promise<{ staff: Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    assignedSectorCodes: string[];
    active: boolean;
    createdAt: string;
  }> }> => {
    const response = await apiClient.get('/admin/staff');
    return response.data;
  },

  createStaffMember: async (data: {
    email: string;
    password: string;
    name: string;
    role: 'SALES_REP' | 'MANAGER';
    assignedSectorCodes?: string[];
  }): Promise<{ message: string; staff: any }> => {
    const response = await apiClient.post('/admin/staff', data);
    return response.data;
  },

  updateStaffMember: async (id: string, data: {
    email?: string;
    name?: string;
    active?: boolean;
    assignedSectorCodes?: string[];
  }): Promise<{ message: string; staff: any }> => {
    const response = await apiClient.put(`/admin/staff/${id}`, data);
    return response.data;
  },

  // Reports
  getCostUpdateAlerts: async (params: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    dayDiff?: string;
    percentDiff?: string;
  }): Promise<{
    success: boolean;
    data: {
      products: any[];
      summary: any;
      pagination: any;
      metadata: {
        lastSyncAt: string | null;
        syncType: string | null;
      };
    };
  }> => {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);
    if (params.dayDiff) queryParams.append('dayDiff', params.dayDiff);
    if (params.percentDiff) queryParams.append('percentDiff', params.percentDiff);

    const response = await apiClient.get(`/admin/reports/cost-update-alerts?${queryParams.toString()}`);
    return response.data;
  },

  getReportCategories: async (): Promise<{ success: boolean; data: { categories: string[] } }> => {
    const response = await apiClient.get('/admin/reports/categories');
    return response.data;
  },

  getMarginComplianceReport: async (params: {
    customerType?: string;
    category?: string;
    status?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    success: boolean;
    data: {
      alerts: any[];
      summary: {
        totalProducts: number;
        compliantCount: number;
        highDeviationCount: number;
        lowDeviationCount: number;
        avgDeviation: number;
      };
      pagination: any;
      metadata: {
        lastSyncAt: string | null;
        syncType: string | null;
      };
    };
  }> => {
    const queryParams = new URLSearchParams();
    if (params.customerType) queryParams.append('customerType', params.customerType);
    if (params.category) queryParams.append('category', params.category);
    if (params.status) queryParams.append('status', params.status);
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);

    const response = await apiClient.get(`/admin/reports/margin-compliance?${queryParams.toString()}`);
    return response.data;
  },

  getPriceHistory: async (params: {
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
  }): Promise<{
    success: boolean;
    data: {
      changes: Array<{
        productCode: string;
        productName: string;
        category: string;
        changeDate: string;
        priceChanges: Array<{
          listNo: number;
          listName: string;
          oldPrice: number;
          newPrice: number;
          changeAmount: number;
          changePercent: number;
        }>;
        isConsistent: boolean;
        updatedListsCount: number;
        missingLists: number[];
        avgChangePercent: number;
        changeDirection: 'increase' | 'decrease' | 'mixed';
      }>;
      summary: {
        totalChanges: number;
        consistentChanges: number;
        inconsistentChanges: number;
        inconsistencyRate: number;
        avgIncreasePercent: number;
        avgDecreasePercent: number;
        topIncreases: Array<{ product: string; percent: number }>;
        topDecreases: Array<{ product: string; percent: number }>;
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
    };
  }> => {
    const queryParams = new URLSearchParams();
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.productCode) queryParams.append('productCode', params.productCode);
    if (params.productName) queryParams.append('productName', params.productName);
    if (params.category) queryParams.append('category', params.category);
    if (params.priceListNo) queryParams.append('priceListNo', params.priceListNo.toString());
    if (params.consistencyStatus) queryParams.append('consistencyStatus', params.consistencyStatus);
    if (params.changeDirection) queryParams.append('changeDirection', params.changeDirection);
    if (params.minChangePercent !== undefined) queryParams.append('minChangePercent', params.minChangePercent.toString());
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);

    const response = await apiClient.get(`/admin/reports/price-history?${queryParams.toString()}`);
    return response.data;
  },

  getTopProducts: async (params?: {
    startDate?: string;
    endDate?: string;
    brand?: string;
    category?: string;
    minQuantity?: number;
    sortBy?: 'revenue' | 'profit' | 'margin' | 'quantity';
    page?: number;
    limit?: number;
  }): Promise<{
    success: boolean;
    data: {
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
    };
  }> => {
    const response = await apiClient.get('/admin/reports/top-products', { params });
    return response.data;
  },

  getTopCustomers: async (params?: {
    startDate?: string;
    endDate?: string;
    sector?: string;
    minOrderAmount?: number;
    sortBy?: 'revenue' | 'profit' | 'margin' | 'orderCount';
    page?: number;
    limit?: number;
  }): Promise<{
    success: boolean;
    data: {
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
        lastOrderDate: string;
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
    };
  }> => {
    const response = await apiClient.get('/admin/reports/top-customers', { params });
    return response.data;
  },

  getProductCustomers: async (params: {
    productCode: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    success: boolean;
    data: {
      customers: Array<{
        customerCode: string;
        customerName: string;
        sectorCode: string;
        orderCount: number;
        totalQuantity: number;
        totalRevenue: number;
        totalCost: number;
        totalProfit: number;
        profitMargin: number;
        lastOrderDate: string;
      }>;
      summary: {
        totalCustomers: number;
        totalQuantity: number;
        totalRevenue: number;
        totalProfit: number;
        avgProfitMargin: number;
      };
      pagination: {
        page: number;
        limit: number;
        totalPages: number;
        totalRecords: number;
      };
    };
  }> => {
    const { productCode, ...rest } = params;
    const response = await apiClient.get(`/admin/reports/product-customers/${productCode}`, { params: rest });
    return response.data;
  },

  // Exclusions
  getExclusions: async (activeOnly?: boolean): Promise<{
    success: boolean;
    data: Array<{
      id: string;
      type: 'PRODUCT_CODE' | 'CUSTOMER_CODE' | 'CUSTOMER_NAME' | 'PRODUCT_NAME' | 'SECTOR_CODE';
      value: string;
      description?: string;
      active: boolean;
      createdAt: string;
    }>;
  }> => {
    const response = await apiClient.get('/admin/exclusions', {
      params: activeOnly !== undefined ? { activeOnly } : undefined
    });
    return response.data;
  },

  createExclusion: async (data: {
    type: 'PRODUCT_CODE' | 'CUSTOMER_CODE' | 'CUSTOMER_NAME' | 'PRODUCT_NAME' | 'SECTOR_CODE';
    value: string;
    description?: string;
  }): Promise<{
    success: boolean;
    message: string;
    data: any;
  }> => {
    const response = await apiClient.post('/admin/exclusions', data);
    return response.data;
  },

  updateExclusion: async (id: string, data: {
    value?: string;
    description?: string;
    active?: boolean;
  }): Promise<{
    success: boolean;
    message: string;
    data: any;
  }> => {
    const response = await apiClient.put(`/admin/exclusions/${id}`, data);
    return response.data;
  },

  deleteExclusion: async (id: string): Promise<{
    success: boolean;
    message: string;
  }> => {
    const response = await apiClient.delete(`/admin/exclusions/${id}`);
    return response.data;
  },
};

export default adminApi;
