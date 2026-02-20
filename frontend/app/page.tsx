'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, user, loadUserFromStorage } = useAuthStore();

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (isAuthenticated && user) {
      if (user.role === 'DEPOCU') {
        router.push('/warehouse');
      } else if (user.role === 'ADMIN' || user.role === 'HEAD_ADMIN' || user.role === 'MANAGER' || user.role === 'SALES_REP') {
        router.push('/dashboard');
      } else {
        router.push('/products');
      }
    } else {
      router.push('/login');
    }
  }, [isAuthenticated, user, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>
  );
}
