import {
  Category,
  Cart,
  Notification,
  Order,
  OrderRequest,
  Product,
  Quote,
  RecommendationGroup,
} from '../types';
import { apiClient } from './client';

export const customerApi = {
  getProducts: async (params?: {
    categoryId?: string;
    search?: string;
    warehouse?: string;
    mode?: 'all' | 'discounted' | 'excess' | 'purchased' | 'agreements';
  }) => {
    const response = await apiClient.get<{ products: Product[] }>('/products', { params });
    return response.data;
  },
  getCategories: async () => {
    const response = await apiClient.get<{ categories: Category[] }>('/categories');
    return response.data;
  },
  getWarehouses: async () => {
    const response = await apiClient.get<{ warehouses: string[] }>('/warehouses');
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
  getOrders: async () => {
    const response = await apiClient.get<{ orders: Order[] }>('/orders');
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
  getQuotes: async () => {
    const response = await apiClient.get<{ quotes: Quote[] }>('/quotes');
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
  markNotificationsReadAll: async () => {
    const response = await apiClient.post('/notifications/read-all');
    return response.data;
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
};
