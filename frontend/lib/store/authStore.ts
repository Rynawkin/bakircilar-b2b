/**
 * Auth Store (Zustand)
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { User, LoginRequest } from '@/types';
import authApi from '../api/auth';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  lastActivity: number; // Unix timestamp

  // Actions
  login: (data: LoginRequest) => Promise<void>;
  logout: () => void;
  loadUserFromStorage: () => void;
  clearError: () => void;
  updateActivity: () => void;
}

// Migration: Eski localStorage formatını yeni formata çevir
if (typeof window !== 'undefined') {
  const oldToken = localStorage.getItem('token');
  const oldUser = localStorage.getItem('user');
  const newStorage = localStorage.getItem('b2b-auth-storage');

  if (oldToken && oldUser && !newStorage) {
    try {
      const user = JSON.parse(oldUser);
      const migratedState = {
        state: {
          user,
          token: oldToken,
          isAuthenticated: true,
          lastActivity: Date.now(),
        },
        version: 0,
      };
      localStorage.setItem('b2b-auth-storage', JSON.stringify(migratedState));
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      console.log('✅ Auth storage migrated to new format');
    } catch (error) {
      console.error('Migration error:', error);
    }
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
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

          set({
            user: response.user,
            token: response.token,
            isAuthenticated: true,
            isLoading: false,
            lastActivity: Date.now(),
          });
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
      },

      loadUserFromStorage: () => {
        // Persist middleware handles this automatically
        // This is kept for backward compatibility
      },

      updateActivity: () => {
        set({ lastActivity: Date.now() });
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'b2b-auth-storage', // localStorage key
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        lastActivity: state.lastActivity,
      }),
      skipHydration: false, // Otomatik hydration aktif
    }
  )
);

export default useAuthStore;
