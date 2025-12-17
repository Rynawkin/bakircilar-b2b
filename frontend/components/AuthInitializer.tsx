'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/store/authStore';

/**
 * AuthInitializer - localStorage'dan session'ı yükler
 * Root layout'ta kullanılır, sayfa yüklendiğinde otomatik restore eder
 */
export function AuthInitializer() {
  const loadUserFromStorage = useAuthStore((state) => state.loadUserFromStorage);

  useEffect(() => {
    // localStorage'dan session'ı yükle
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  // Bu component UI render etmez
  return null;
}

export default AuthInitializer;
