import {
  Category,
  Banner,
  BannerPosition,
  Cart,
  CollectionCard,
  CollectionDetail,
  ActiveGiftCampaign,
  Notification,
  NotificationPreference,
  Order,
  OrderRequest,
  Product,
  Quote,
  RecommendationGroup,
  UnboughtCategory,
} from '../types';
import { apiClient } from './client';
import * as FileSystem from 'expo-file-system/legacy';
import { getAuthToken } from '../storage/auth';
import { buildSearchVariants } from '../utils/search';

export type CustomerInvoiceDocument = {
  id: string;
  invoiceNo: string;
  issueDate?: string | null;
  sentAt?: string | null;
  subtotalAmount?: number | null;
  totalAmount?: number | null;
  currency?: string | null;
  fileName?: string | null;
  originalName?: string | null;
  mimeType?: string | null;
  size?: number | null;
  matchStatus?: 'MATCHED' | 'PARTIAL' | 'NOT_FOUND' | string;
  matchError?: string | null;
  createdAt?: string;
};

export type CustomerListPagination = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type CustomerOrderListParams = {
  status?: '' | Order['status'];
  search?: string;
  page?: number;
  pageSize?: number;
};

export type CustomerQuoteListParams = {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

const safeFileName = (value: string) =>
  String(value || 'fatura')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80);

export const customerApi = {
  getBanners: async (position?: BannerPosition) => {
    const response = await apiClient.get<{ banners: Banner[]; heroIntervalMs?: number }>('/banners', {
      params: position ? { position } : undefined,
    });
    return response.data;
  },
  getProducts: async (params?: {
    categoryId?: string;
    search?: string;
    warehouse?: string;
    mode?: 'all' | 'discounted' | 'excess' | 'purchased' | 'agreements';
    limit?: number;
    offset?: number;
  }) => {
    const response = await apiClient.get<{ products: Product[]; total?: number }>('/products', { params });
    const term = String(params?.search || '').trim();
    const firstProducts = response.data.products || [];
    if (term.length < 3 || firstProducts.length >= 5) {
      return response.data;
    }

    const variants = buildSearchVariants(term, 5).filter((variant) => variant !== term);
    if (variants.length === 0) return response.data;

    const byId = new Map<string, Product>();
    firstProducts.forEach((product) => byId.set(product.id, product));

    for (const variant of variants) {
      try {
        const retry = await apiClient.get<{ products: Product[]; total?: number }>('/products', {
          params: { ...params, search: variant },
        });
        (retry.data.products || []).forEach((product) => byId.set(product.id, product));
      } catch {
        // Preserve the original successful result if a fallback variant fails.
      }
      if (byId.size >= 20) break;
    }

    return { ...response.data, products: Array.from(byId.values()) };
  },
  getCategories: async () => {
    const response = await apiClient.get<{ categories: Category[] }>('/categories');
    return response.data;
  },
  getUnboughtCategories: async () => {
    const response = await apiClient.get<{ categories: UnboughtCategory[] }>('/unbought-categories');
    return response.data;
  },
  getUnboughtCategoryProducts: async (params?: {
    categoryId?: string;
    sort?: 'bestsellerValue' | 'nameAsc';
    offset?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get<{
      products: Product[];
      totalCount: number;
      categories: UnboughtCategory[];
    }>('/unbought-category-products', { params });
    return response.data;
  },
  getWarehouses: async () => {
    const response = await apiClient.get<{ warehouses: string[] }>('/warehouses');
    return response.data;
  },
  getActiveCollections: async () => {
    const response = await apiClient.get<{ collections: CollectionCard[] }>('/collections/active');
    return response.data;
  },
  getCollection: async (id: string) => {
    const response = await apiClient.get<CollectionDetail>(`/collections/${encodeURIComponent(id)}`);
    return response.data;
  },
  getProductById: async (id: string, params?: { mode?: 'discounted' | 'excess' }) => {
    const response = await apiClient.get<Product>(`/products/${id}`, { params });
    return response.data;
  },
  getProductRecommendations: async (id: string) => {
    const response = await apiClient.get<{ products: Product[] }>(`/products/${id}/recommendations`);
    return response.data;
  },
  getCartRecommendations: async () => {
    const response = await apiClient.get<{ groups: RecommendationGroup[] }>('/recommendations/cart');
    return response.data;
  },
  getActiveGiftCampaign: async () => {
    const response = await apiClient.get<ActiveGiftCampaign>('/gift-campaign/active');
    return response.data;
  },
  setGiftCampaignSelection: async (data: { campaignId: string | null; productIds: string[] }) => {
    const response = await apiClient.put('/gift-campaign/cart-selection', data);
    return response.data as { success: boolean; error?: string };
  },
  getCart: async () => {
    const response = await apiClient.get<Cart>('/cart');
    return response.data;
  },
  addToCart: async (data: { productId: string; quantity: number; priceType: 'INVOICED' | 'WHITE'; priceMode?: 'LIST' | 'EXCESS' }) => {
    const response = await apiClient.post('/cart', data);
    return response.data;
  },
  updateCartItem: async (itemId: string, data: { quantity?: number; lineNote?: string | null }) => {
    const response = await apiClient.put(`/cart/${itemId}`, data);
    return response.data;
  },
  removeFromCart: async (itemId: string) => {
    const response = await apiClient.delete(`/cart/${itemId}`);
    return response.data;
  },
  createOrder: async (data?: { customerOrderNumber?: string; deliveryLocation?: string }) => {
    const response = await apiClient.post('/orders', data);
    return response.data;
  },
  getOrderById: async (id: string) => {
    const response = await apiClient.get(`/orders/${id}`);
    return response.data;
  },
  createOrderRequest: async (note?: string) => {
    const response = await apiClient.post('/order-requests', note ? { note } : undefined);
    return response.data;
  },
  getOrders: async (params?: CustomerOrderListParams) => {
    const query = {
      ...(params?.status ? { status: params.status } : {}),
      ...(params?.search?.trim() ? { search: params.search.trim() } : {}),
      ...(params?.page ? { page: params.page } : {}),
      ...(params?.pageSize ? { pageSize: params.pageSize } : {}),
    };
    const response = await apiClient.get<{ orders: Order[]; pagination?: CustomerListPagination }>('/orders', {
      params: Object.keys(query).length ? query : undefined,
    });
    return response.data;
  },
  getPendingOrders: async () => {
    const response = await apiClient.get<any[]>('/order-tracking/customer/pending-orders');
    return response.data;
  },
  getOrderRequests: async () => {
    const response = await apiClient.get<{ requests: OrderRequest[] }>('/order-requests');
    return response.data;
  },
  convertOrderRequest: async (
    id: string,
    data: {
      items: Array<{ id: string; priceType?: 'INVOICED' | 'WHITE'; quantity?: number }>;
      note?: string;
      customerOrderNumber?: string;
      deliveryLocation?: string;
    }
  ) => {
    const response = await apiClient.post(`/order-requests/${id}/convert`, data);
    return response.data;
  },
  rejectOrderRequest: async (id: string, note?: string) => {
    const response = await apiClient.post(`/order-requests/${id}/reject`, note ? { note } : undefined);
    return response.data;
  },
  getQuotes: async (params?: CustomerQuoteListParams) => {
    const query = {
      ...(params?.status ? { status: params.status } : {}),
      ...(params?.search?.trim() ? { search: params.search.trim() } : {}),
      ...(params?.page ? { page: params.page } : {}),
      ...(params?.pageSize ? { pageSize: params.pageSize } : {}),
    };
    const response = await apiClient.get<{ quotes: Quote[]; pagination?: CustomerListPagination }>('/quotes', {
      params: Object.keys(query).length ? query : undefined,
    });
    return response.data;
  },
  getQuoteById: async (id: string) => {
    const response = await apiClient.get<{ quote: Quote }>(`/quotes/${id}`);
    return response.data;
  },
  acceptQuote: async (id: string) => {
    const response = await apiClient.post(`/quotes/${id}/accept`);
    return response.data;
  },
  rejectQuote: async (id: string) => {
    const response = await apiClient.post(`/quotes/${id}/reject`);
    return response.data;
  },
  getNotifications: async () => {
    const response = await apiClient.get<{ notifications: Notification[]; unreadCount: number }>('/notifications');
    return response.data;
  },
  getNotificationPreferences: async () => {
    const response = await apiClient.get<{ categories: NotificationPreference[] }>('/notifications/preferences');
    return response.data;
  },
  updateNotificationPreferences: async (preferences: Array<{ category: string; enabled: boolean }>) => {
    const response = await apiClient.put<{ categories: NotificationPreference[] }>('/notifications/preferences', {
      preferences,
    });
    return response.data;
  },
  markNotificationsReadAll: async () => {
    const response = await apiClient.post('/notifications/read-all');
    return response.data;
  },
  markNotificationsRead: async (ids: string[]) => {
    const response = await apiClient.post('/notifications/read', { ids });
    return response.data as { updated: number };
  },
  registerPushToken: async (data: { token: string; platform?: string; appName?: string; deviceName?: string }) => {
    const response = await apiClient.post('/notifications/push/register', data);
    return response.data as { success: boolean };
  },
  unregisterPushToken: async (token: string) => {
    const response = await apiClient.post('/notifications/push/unregister', { token });
    return response.data as { success: boolean };
  },
  sendTestPush: async (data?: { title?: string; body?: string; linkUrl?: string }) => {
    const response = await apiClient.post('/notifications/push/test', data || {});
    return response.data as { success: boolean };
  },
  updateSettings: async (data: { vatDisplayPreference: 'WITH_VAT' | 'WITHOUT_VAT' }) => {
    const response = await apiClient.put('/customer/settings', data);
    return response.data;
  },
  getTaskPreferences: async () => {
    const response = await apiClient.get('/tasks/preferences');
    return response.data;
  },
  updateTaskPreferences: async (data: { defaultView?: 'KANBAN' | 'LIST' }) => {
    const response = await apiClient.put('/tasks/preferences', data);
    return response.data;
  },
  getTasks: async (params?: { status?: string; search?: string }) => {
    const response = await apiClient.get<{ tasks: any[] }>('/tasks', { params });
    return response.data;
  },
  createTask: async (data: { title: string; description?: string | null; type?: string; priority?: string }) => {
    const response = await apiClient.post('/tasks', data);
    return response.data;
  },
  getTaskById: async (id: string) => {
    const response = await apiClient.get<{ task: any }>(`/tasks/${id}`);
    return response.data;
  },
  addTaskComment: async (id: string, data: { body: string }) => {
    const response = await apiClient.post(`/tasks/${id}/comments`, data);
    return response.data;
  },
  addTaskAttachment: async (id: string, formData: FormData) => {
    const response = await apiClient.post(`/tasks/${id}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  getInvoices: async (params?: {
    search?: string;
    invoicePrefix?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get<{
      documents: CustomerInvoiceDocument[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>('/invoices', { params });
    return response.data;
  },
  downloadInvoiceToFile: async (document: Pick<CustomerInvoiceDocument, 'id' | 'invoiceNo'>) => {
    if (!FileSystem.documentDirectory) {
      throw new Error('Dosya sistemi kullanilamiyor.');
    }
    const token = await getAuthToken();
    const baseUrl = String(apiClient.defaults.baseURL || '').replace(/\/$/, '');
    const targetUri = `${FileSystem.documentDirectory}${safeFileName(document.invoiceNo)}.pdf`;
    const result = await FileSystem.downloadAsync(
      `${baseUrl}/invoices/${encodeURIComponent(document.id)}/download`,
      targetUri,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }
    );
    return result.uri;
  },
};
