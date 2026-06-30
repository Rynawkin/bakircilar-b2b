/**
 * Customer API
 */

import apiClient from './client';
import {
  Product,
  Category,
  Cart,
  AddToCartRequest,
  Order,
  OrderRequest,
  Quote,
  Task,
  TaskDetail,
  TaskView,
  TaskComment,
  TaskAttachment,
  Notification,
  EInvoiceDocument,
} from '@/types';

export type BannerPosition = 'HERO' | 'STRIP' | 'SIDE';

export interface Banner {
  id: string;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  productCode?: string | null;
  buttonText?: string | null;
  position: BannerPosition;
  sortOrder?: number;
  active?: boolean;
}

export interface CustomerFinancials {
  totalBalance: number;
  pastDueBalance: number;
  pastDueDate?: string | null;
  notDueBalance: number;
  notDueDate?: string | null;
  paymentTermLabel?: string | null;
  referenceDate?: string | null;
}

export const customerApi = {
  // Banners (musteri - yalniz aktif)
  getBanners: async (position?: BannerPosition): Promise<{ banners: Banner[] }> => {
    const response = await apiClient.get('/banners', {
      params: position ? { position } : undefined,
    });
    return response.data;
  },

  // Cari bakiye + vadesi gecen ozeti (kayit yoksa financials: null)
  getFinancials: async (): Promise<{ financials: CustomerFinancials | null }> => {
    const response = await apiClient.get('/financials');
    return response.data;
  },

  // Products
  getProducts: async (params?: {
    categoryId?: string;
    categoryIds?: string[];
    search?: string;
    warehouse?: string;
    mode?: 'all' | 'discounted' | 'excess' | 'purchased' | 'agreements';
    sort?: 'bestsellerValue' | 'lastPurchasedDesc' | 'nameAsc';
    featured?: boolean;
    limit?: number;
    offset?: number;
  }, options?: { signal?: AbortSignal }): Promise<{ products: Product[]; total?: number }> => {
    const response = await apiClient.get('/products', {
      params: {
        ...params,
        categoryIds: params?.categoryIds?.length ? params.categoryIds.join(',') : undefined,
      },
      signal: options?.signal,
    });
    return response.data;
  },

  // 0-sonuc arama kurtarma: tipo/es-anlam fuzzy oneri (trigram). SearchMiss da kaydeder.
  searchFallback: async (
    q: string,
    categoryId?: string
  ): Promise<{
    term: string;
    suggestions: Array<{
      id: string;
      name: string;
      mikroCode: string;
      imageUrl: string | null;
      categoryId: string | null;
      categoryName: string | null;
    }>;
  }> => {
    const response = await apiClient.get('/products/search-fallback', {
      params: { q, categoryId: categoryId || undefined },
    });
    return response.data;
  },

  getProductById: async (id: string): Promise<Product> => {
    const response = await apiClient.get(`/products/${id}`);
    return response.data;
  },
  getProductRecommendations: async (id: string): Promise<{ products: Product[] }> => {
    const response = await apiClient.get(`/products/${id}/recommendations`);
    return response.data;
  },
  reportProductImageIssue: async (
    id: string,
    data?: { note?: string }
  ): Promise<{
    report: {
      id: string;
      productCode: string;
      productName: string;
      status: 'OPEN' | 'REVIEWED' | 'FIXED';
      createdAt: string;
    };
    alreadyReported: boolean;
  }> => {
    const response = await apiClient.post(`/products/${id}/report-image-issue`, data || {});
    return response.data;
  },

  getCartRecommendations: async (): Promise<{ groups: Array<{ baseProduct: { id: string; name: string; mikroCode: string }; products: Product[] }> }> => {
    const response = await apiClient.get('/recommendations/cart');
    return response.data;
  },

  // Categories
  getCategories: async (): Promise<{ categories: Category[] }> => {
    const response = await apiClient.get('/categories');
    return response.data;
  },

  // Warehouses
  getWarehouses: async (): Promise<{ warehouses: string[] }> => {
    const response = await apiClient.get('/warehouses');
    return response.data;
  },

  // Cart
  getCart: async (): Promise<Cart> => {
    const response = await apiClient.get('/cart');
    return response.data;
  },

  addToCart: async (data: AddToCartRequest): Promise<{ message: string }> => {
    const response = await apiClient.post('/cart', data);
    return response.data;
  },

  updateCartItem: async (
    itemId: string,
    data: { quantity?: number; lineNote?: string | null }
  ): Promise<{ message: string }> => {
    const response = await apiClient.put(`/cart/${itemId}`, data);
    return response.data;
  },

  removeFromCart: async (itemId: string): Promise<{ message: string }> => {
    const response = await apiClient.delete(`/cart/${itemId}`);
    return response.data;
  },

  // Orders
  createOrder: async (data?: {
    customerOrderNumber?: string;
    deliveryLocation?: string;
  }): Promise<{ orderId: string; orderNumber: string; message: string; skippedItems?: string[] }> => {
    const response = await apiClient.post('/orders', data);
    return response.data;
  },

  getOrders: async (): Promise<{ orders: Order[] }> => {
    const response = await apiClient.get('/orders');
    return response.data;
  },

  getOrderById: async (id: string): Promise<Order> => {
    const response = await apiClient.get(`/orders/${id}`);
    return response.data;
  },

  // Order Requests
  getOrderRequestPendingCount: async (): Promise<{ count: number }> => {
    const response = await apiClient.get('/order-requests/pending-count');
    return response.data;
  },
  // Anlasmali urunler menusunu sadece aktif anlasma varsa gostermek icin
  getAgreementsAvailability: async (): Promise<{ available: boolean }> => {
    const response = await apiClient.get('/agreements/available');
    return response.data;
  },
  getOrderRequests: async (): Promise<{ requests: OrderRequest[] }> => {
    const response = await apiClient.get('/order-requests');
    return response.data;
  },

  createOrderRequest: async (note?: string): Promise<{ request: OrderRequest }> => {
    const response = await apiClient.post('/order-requests', note ? { note } : undefined);
    return response.data;
  },

  convertOrderRequest: async (
    id: string,
    data: {
      items?: Array<{ id: string; priceType?: 'INVOICED' | 'WHITE'; quantity?: number }>;
      note?: string;
      customerOrderNumber?: string;
      deliveryLocation?: string;
    }
  ): Promise<{ orderId: string; orderNumber: string }> => {
    const response = await apiClient.post(`/order-requests/${id}/convert`, data);
    return response.data;
  },

  rejectOrderRequest: async (id: string, note?: string): Promise<{ status: string }> => {
    const response = await apiClient.post(`/order-requests/${id}/reject`, note ? { note } : undefined);
    return response.data;
  },

  // Quotes
  getQuotes: async (): Promise<{ quotes: Quote[] }> => {
    const response = await apiClient.get('/quotes');
    return response.data;
  },

  getQuoteById: async (id: string): Promise<{ quote: Quote }> => {
    const response = await apiClient.get(`/quotes/${id}`);
    return response.data;
  },

  acceptQuote: async (id: string): Promise<{ quote: Quote }> => {
    const response = await apiClient.post(`/quotes/${id}/accept`);
    return response.data;
  },

  rejectQuote: async (id: string): Promise<{ quote: Quote }> => {
    const response = await apiClient.post(`/quotes/${id}/reject`);
    return response.data;
  },

  // Tasks (customer)
  getTaskPreferences: async (): Promise<{ preferences: { defaultView: TaskView; colorRules?: any[] | null } }> => {
    const response = await apiClient.get('/tasks/preferences');
    return response.data;
  },

  updateTaskPreferences: async (data: { defaultView?: TaskView; colorRules?: any[] | null }): Promise<{ preferences: { defaultView: TaskView; colorRules?: any[] | null } }> => {
    const response = await apiClient.put('/tasks/preferences', data);
    return response.data;
  },

  getTasks: async (params?: {
    status?: string | string[];
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ tasks: Task[] }> => {
    const response = await apiClient.get('/tasks', { params });
    return response.data;
  },

  getTaskById: async (id: string): Promise<{ task: TaskDetail }> => {
    const response = await apiClient.get(`/tasks/${id}`);
    return response.data;
  },

  createTask: async (data: {
    title: string;
    description?: string | null;
    type?: string;
    priority?: string;
  }): Promise<{ task: TaskDetail }> => {
    const response = await apiClient.post('/tasks', data);
    return response.data;
  },

  addTaskComment: async (id: string, data: { body: string }): Promise<{ comment: TaskComment }> => {
    const response = await apiClient.post(`/tasks/${id}/comments`, data);
    return response.data;
  },

  addTaskAttachment: async (id: string, formData: FormData): Promise<{ attachment: TaskAttachment }> => {
    const response = await apiClient.post(`/tasks/${id}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Notifications
  getNotifications: async (params?: { unreadOnly?: boolean; limit?: number; offset?: number }): Promise<{ notifications: Notification[]; unreadCount: number }> => {
    const response = await apiClient.get('/notifications', { params });
    return response.data;
  },

  markNotificationsRead: async (ids: string[]): Promise<{ updated: number }> => {
    const response = await apiClient.post('/notifications/read', { ids });
    return response.data;
  },

  markNotificationsReadAll: async (): Promise<{ updated: number }> => {
    const response = await apiClient.post('/notifications/read-all');
    return response.data;
  },

  // E-Invoices (customer)
  getInvoices: async (params?: {
    search?: string;
    invoicePrefix?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    documents: EInvoiceDocument[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> => {
    const response = await apiClient.get('/invoices', { params });
    return response.data;
  },

  downloadInvoice: async (id: string): Promise<Blob> => {
    const response = await apiClient.get(`/invoices/${id}/download`, {
      responseType: 'blob',
    });
    return response.data;
  },
};

export default customerApi;




