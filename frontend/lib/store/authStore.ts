/**
 * Auth Store (Zustand)
 * Manual localStorage persistence for better Next.js 15 compatibility
 */

import { create } from 'zustand';
import { User, LoginRequest } from '@/types';
import authApi from '../api/auth';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  lastActivity: number;

  // Actions
  login: (data: LoginRequest) => Promise<void>;
  logout: () => void;
  loadUserFromStorage: () => void;
  clearError: () => void;
  updateActivity: () => void;
}

// Helper functions for localStorage
const STORAGE_KEY = 'b2b-auth';

const saveToStorage = (state: Partial<AuthState>) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      user: state.user,
      token: state.token,
      isAuthenticated: state.isAuthenticated,
      lastActivity: state.lastActivity || Date.now(),
    }));
  } catch (error) {
    console.error('Failed to save to localStorage:', error);
  }
};

const loadFromStorage = (): Partial<AuthState> | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Failed to load from localStorage:', error);
  }
  return null;
};

const clearStorage = () => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    // Clean up old keys too
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('b2b-auth-storage');
  } catch (error) {
    console.error('Failed to clear storage:', error);
  }
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  lastActivity: Date.now(),

  login: async (data: LoginRequest) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.login(data);

      const newState = {
        user: response.user,
        token: response.token,
        isAuthenticated: true,
        isLoading: false,
        lastActivity: Date.now(),
      };

      set(newState);
      saveToStorage(newState);
    } catch (error: any) {
      set({
        error: error.response?.data?.error || 'Login failed',
        isLoading: false,
      });
      throw error;
    }
  },

  logout: () => {
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      lastActivity: 0,
    });
    clearStorage();
  },

  loadUserFromStorage: () => {
    const stored = loadFromStorage();
    if (stored && stored.token && stored.user) {
      set({
        user: stored.user,
        token: stored.token,
        isAuthenticated: true,
        lastActivity: stored.lastActivity || Date.now(),
      });
      console.log('✅ Session restored from storage');
    }
  },

  updateActivity: () => {
    const state = get();
    const newState = { ...state, lastActivity: Date.now() };
    set(newState);
    saveToStorage(newState);
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
