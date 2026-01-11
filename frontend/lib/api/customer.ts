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
} from '@/types';

export const customerApi = {
  // Products
  getProducts: async (params?: {
    categoryId?: string;
    search?: string;
    warehouse?: string;
    mode?: 'all' | 'discounted' | 'excess' | 'purchased' | 'agreements';
  }): Promise<{ products: Product[] }> => {
    const response = await apiClient.get('/products', { params });
    return response.data;
  },

  getProductById: async (id: string): Promise<Product> => {
    const response = await apiClient.get(`/products/${id}`);
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

  updateCartItem: async (itemId: string, quantity: number): Promise<{ message: string }> => {
    const response = await apiClient.put(`/cart/${itemId}`, { quantity });
    return response.data;
  },

  removeFromCart: async (itemId: string): Promise<{ message: string }> => {
    const response = await apiClient.delete(`/cart/${itemId}`);
    return response.data;
  },

  // Orders
  createOrder: async (): Promise<{ orderId: string; orderNumber: string; message: string }> => {
    const response = await apiClient.post('/orders');
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
    data: { items?: Array<{ id: string; priceType?: 'INVOICED' | 'WHITE' }>; note?: string }
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
};

export default customerApi;
