'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/store/authStore';
import { useUiThemeStore } from '@/lib/store/uiThemeStore';
import { AdminNavigation } from '@/components/layout/AdminNavigation';
import { AdminNavigationNew } from '@/components/layout/AdminNavigationNew';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AdminAiAssistant } from '@/components/ai/AdminAiAssistant';
import { AdminThemeIntro } from '@/components/admin/AdminThemeIntro';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { loadUserFromStorage } = useAuthStore();
  const { theme, hydrate } = useUiThemeStore();

  useEffect(() => {
    loadUserFromStorage();
    hydrate();
  }, [loadUserFromStorage, hydrate]);

  const isNew = theme === 'new';

  return (
    <ErrorBoundary>
      <div className={`min-h-screen ${isNew ? 'bg-[var(--surface-0)]' : 'bg-gray-50'}`}>
        {isNew ? <AdminNavigationNew /> : <AdminNavigation />}
        <main>{children}</main>
        <AdminAiAssistant />
        <AdminThemeIntro />
      </div>
    </ErrorBoundary>
  );
}
