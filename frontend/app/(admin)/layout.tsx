'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/store/authStore';
import { AdminNavigationNew } from '@/components/layout/AdminNavigationNew';
import { AdminFooterNew } from '@/components/layout/AdminFooterNew';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AdminAiAssistant } from '@/components/ai/AdminAiAssistant';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { loadUserFromStorage } = useAuthStore();

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[var(--surface-0)]">
        <AdminNavigationNew />
        <main>{children}</main>
        <AdminFooterNew />
        <AdminAiAssistant />
      </div>
    </ErrorBoundary>
  );
}
