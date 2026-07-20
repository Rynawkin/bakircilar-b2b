'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';
import { useCartStore } from '@/lib/store/cartStore';
import { CustomerNavigation } from '@/components/layout/CustomerNavigation';
import { CustomerFooter } from '@/components/layout/CustomerFooter';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { trackCustomerActivity } from '@/lib/analytics/customerAnalytics';

const CUSTOMER_MAINTENANCE_MODE = false;
const CUSTOMER_MAINTENANCE_MASCOT_SRC = '/maintenance/maskot.png';

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loadUserFromStorage } = useAuthStore();
  const { cart, fetchCart } = useCartStore();
  const [authHydrated, setAuthHydrated] = useState(false);
  const [mascotLoadError, setMascotLoadError] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activityPathRef = useRef<string>('');
  const lastActivityRef = useRef<number>(Date.now());
  const activeStartRef = useRef<number | null>(null);
  const clickCountRef = useRef<number>(0);

  useEffect(() => {
    loadUserFromStorage();
    setAuthHydrated(true);
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (!authHydrated) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    if (user.role === 'CUSTOMER') return;

    if (user.role === 'DEPOCU') {
      router.replace('/warehouse');
    } else if (user.role === 'DIVERSEY') {
      router.replace('/diversey/stok');
    } else if (['HEAD_ADMIN', 'ADMIN', 'MANAGER', 'SALES_REP'].includes(user.role)) {
      router.replace('/dashboard');
    } else {
      router.replace('/login');
    }
  }, [authHydrated, router, user]);

  useEffect(() => {
    if (!authHydrated || !user || user.role !== 'CUSTOMER' || CUSTOMER_MAINTENANCE_MODE) return;
    fetchCart();
  }, [authHydrated, fetchCart, user?.id, user?.role]);

  const currentPath = useMemo(() => {
    const query = searchParams?.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    if (CUSTOMER_MAINTENANCE_MODE) return;
    if (!user || user.role !== 'CUSTOMER') return;
    activityPathRef.current = currentPath;
    trackCustomerActivity({
      type: 'PAGE_VIEW',
      pagePath: currentPath,
      pageTitle: typeof document !== 'undefined' ? document.title : undefined,
      referrer: typeof document !== 'undefined' ? document.referrer : undefined,
    });
  }, [currentPath, user?.id, user?.role]);

  useEffect(() => {
    if (CUSTOMER_MAINTENANCE_MODE) return;
    if (!user || user.role !== 'CUSTOMER') return;

    const IDLE_THRESHOLD_MS = 60_000;
    const MAX_ACTIVE_CHUNK_MS = 5 * 60_000;

    const markActive = () => {
      const now = Date.now();
      lastActivityRef.current = now;
      if (activeStartRef.current === null) {
        activeStartRef.current = now;
      }
    };

    const handleClick = () => {
      markActive();
      clickCountRef.current += 1;
    };

    const flushPing = (force = false) => {
      const now = Date.now();
      if (activeStartRef.current === null) {
        clickCountRef.current = 0;
        return;
      }

      const idleMs = now - lastActivityRef.current;
      const activeMs = now - activeStartRef.current;
      const shouldFlush = force || idleMs >= IDLE_THRESHOLD_MS || activeMs >= MAX_ACTIVE_CHUNK_MS;
      if (!shouldFlush) return;

      const durationSeconds = Math.max(1, Math.round(activeMs / 1000));

      trackCustomerActivity({
        type: 'ACTIVE_PING',
        pagePath: activityPathRef.current,
        pageTitle: typeof document !== 'undefined' ? document.title : undefined,
        durationSeconds,
        clickCount: clickCountRef.current,
      });

      clickCountRef.current = 0;
      activeStartRef.current = null;
    };

    window.addEventListener('mousemove', markActive, { passive: true });
    window.addEventListener('keydown', markActive);
    window.addEventListener('scroll', markActive, { passive: true });
    window.addEventListener('touchstart', markActive, { passive: true });
    window.addEventListener('click', handleClick);

    const intervalId = window.setInterval(() => flushPing(false), 30000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPing(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('mousemove', markActive);
      window.removeEventListener('keydown', markActive);
      window.removeEventListener('scroll', markActive);
      window.removeEventListener('touchstart', markActive);
      window.removeEventListener('click', handleClick);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
      flushPing(true);
    };
  }, [user?.id, user?.role]);

  const cartItemCount = cart?.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

  if (!authHydrated || !user || user.role !== 'CUSTOMER') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-0)]" role="status" aria-label="Oturum kontrol ediliyor">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    );
  }

  if (CUSTOMER_MAINTENANCE_MODE) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-amber-50 flex items-center justify-center px-6">
        <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white/90 shadow-2xl p-8 md:p-10 text-center">
          {!mascotLoadError ? (
            <img
              src={CUSTOMER_MAINTENANCE_MASCOT_SRC}
              alt="Bakim maskotu"
              className="mx-auto h-56 w-auto object-contain"
              onError={() => setMascotLoadError(true)}
            />
          ) : (
            <div className="mx-auto h-44 w-44 rounded-full bg-amber-100 text-6xl flex items-center justify-center">
              BK
            </div>
          )}

          <h1 className="mt-6 text-3xl md:text-4xl font-black text-slate-900">Bakim Calismasi</h1>
          <p className="mt-3 text-base md:text-lg text-slate-600">En kisa surede sizlerleyiz.</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex min-h-screen flex-col bg-[var(--surface-0)]">
        <CustomerNavigation cartItemCount={cartItemCount} />
        <main className="flex-1">{children}</main>
        <CustomerFooter />
      </div>
    </ErrorBoundary>
  );
}
