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
};

export default adminApi;
