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
} from '@/types';

export const customerApi = {
  // Products
  getProducts: async (params?: { categoryId?: string; search?: string; warehouse?: string }): Promise<{ products: Product[] }> => {
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
};

export default customerApi;
