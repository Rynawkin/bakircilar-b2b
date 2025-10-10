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

  // Cari List
  getCariList: async (): Promise<{ cariList: Array<{ code: string; name: string; type: string }> }> => {
    const response = await apiClient.get('/admin/cari-list');
    return response.data;
  },

  // Products
  getProducts: async (params?: { search?: string }): Promise<{ products: any[] }> => {
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

  // Orders
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
};

export default adminApi;
