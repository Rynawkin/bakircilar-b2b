'use client';

import { useEffect, useMemo, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';
import { useCartStore } from '@/lib/store/cartStore';
import { CustomerNavigation } from '@/components/layout/CustomerNavigation';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { trackCustomerActivity } from '@/lib/analytics/customerAnalytics';

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loadUserFromStorage } = useAuthStore();
  const { cart, fetchCart } = useCartStore();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activityPathRef = useRef<string>('');
  const lastActivityRef = useRef<number>(Date.now());
  const activeStartRef = useRef<number | null>(null);
  const clickCountRef = useRef<number>(0);

  useEffect(() => {
    loadUserFromStorage();
    fetchCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentPath = useMemo(() => {
    const query = searchParams?.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
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

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-gray-100">
        <CustomerNavigation cartItemCount={cartItemCount} />
        <main>{children}</main>
      </div>
    </ErrorBoundary>
  );
}
