/**
 * Cart Store (Zustand)
 */

import { create } from 'zustand';
import { Cart, AddToCartRequest } from '@/types';
import customerApi from '../api/customer';

interface CartState {
  cart: Cart | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchCart: () => Promise<void>;
  addToCart: (data: AddToCartRequest) => Promise<void>;
  // quantity BAZ (ana) birim; 2. birim satirlarinda cagiran cevirir. selectedUnit iletilir.
  updateQuantity: (itemId: string, quantity: number, selectedUnit?: string | null) => Promise<void>;
  updateItemNote: (itemId: string, lineNote?: string | null) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  clearCart: () => void;
}

export const useCartStore = create<CartState>((set, get) => ({
  cart: null,
  isLoading: false,
  error: null,

  fetchCart: async () => {
    set({ isLoading: true, error: null });
    try {
      const cart = await customerApi.getCart();
      set({ cart, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.error || 'Failed to fetch cart',
        isLoading: false,
      });
    }
  },

  addToCart: async (data: AddToCartRequest) => {
    set({ error: null });
    try {
      await customerApi.addToCart(data);
      // Cart'ı yeniden yükle
      await get().fetchCart();
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to add to cart' });
      throw error;
    }
  },

  updateQuantity: async (itemId: string, quantity: number, selectedUnit?: string | null) => {
    set({ error: null });
    try {
      await customerApi.updateCartItem(
        itemId,
        selectedUnit === undefined ? { quantity } : { quantity, selectedUnit }
      );
      await get().fetchCart();
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to update quantity' });
      throw error;
    }
  },

  updateItemNote: async (itemId: string, lineNote?: string | null) => {
    set({ error: null });
    try {
      await customerApi.updateCartItem(itemId, { lineNote });
      await get().fetchCart();
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to update note' });
      throw error;
    }
  },

  removeItem: async (itemId: string) => {
    set({ error: null });
    try {
      await customerApi.removeFromCart(itemId);
      await get().fetchCart();
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to remove item' });
      throw error;
    }
  },

  clearCart: () => {
    set({ cart: null });
  },
}));

export default useCartStore;
