'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/store/authStore';

/**
 * AuthInitializer - Persist middleware'i initialize eder
 * Root layout'ta kullanılır, sayfa yüklendiğinde localStorage'dan session'ı yükler
 */
export function AuthInitializer() {
  useEffect(() => {
    // Persist middleware otomatik çalışır, bu component sadece mount trigger'ı
    // Store zaten persist middleware ile initialize edilecek

    // Debug için
    if (process.env.NODE_ENV === 'development') {
      const state = useAuthStore.getState();
      console.log('Auth initialized:', {
        isAuthenticated: state.isAuthenticated,
        user: state.user?.email,
        hasToken: !!state.token,
      });
    }
  }, []);

  // Bu component UI render etmez
  return null;
}

export default AuthInitializer;
