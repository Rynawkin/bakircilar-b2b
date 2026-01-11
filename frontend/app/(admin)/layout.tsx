'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/store/authStore';
import { AdminNavigation } from '@/components/layout/AdminNavigation';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { loadUserFromStorage } = useAuthStore();

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50">
        <AdminNavigation />
        <main>{children}</main>
      </div>
    </ErrorBoundary>
  );
}
