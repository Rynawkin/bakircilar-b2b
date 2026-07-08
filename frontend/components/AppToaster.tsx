'use client';

import { useEffect, useRef, useState } from 'react';
import toast, { Toaster, useToasterStore } from 'react-hot-toast';

const MOBILE_TOAST_DURATION_MS = 1000;

export function AppToaster() {
  const [isMobile, setIsMobile] = useState(false);
  const { toasts } = useToasterStore();
  const dismissTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const dismissTimers = dismissTimersRef.current;

    const clearTimer = (id: string) => {
      if (dismissTimers[id]) {
        clearTimeout(dismissTimers[id]);
        delete dismissTimers[id];
      }
    };

    if (!isMobile) {
      Object.keys(dismissTimers).forEach(clearTimer);
      return;
    }

    const activeIds = new Set(toasts.map((item) => item.id));
    Object.keys(dismissTimers).forEach((id) => {
      if (!activeIds.has(id)) clearTimer(id);
    });

    toasts.forEach((item) => {
      if (
        dismissTimers[item.id] ||
        item.dismissed ||
        !item.visible ||
        item.type === 'loading' ||
        item.duration === Infinity
      ) {
        return;
      }

      const age = Date.now() - item.createdAt;
      dismissTimers[item.id] = setTimeout(() => {
        toast.dismiss(item.id);
        delete dismissTimers[item.id];
      }, Math.max(MOBILE_TOAST_DURATION_MS - age, 0));
    });
  }, [isMobile, toasts]);

  useEffect(() => {
    return () => {
      Object.values(dismissTimersRef.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return (
    <Toaster
      key={isMobile ? 'mobile' : 'default'}
      position="top-right"
      toastOptions={{
        duration: isMobile ? 1000 : 3000,
        style: {
          background: '#fff',
          color: '#363636',
          padding: isMobile ? '10px 12px' : '16px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          maxWidth: isMobile ? '280px' : '360px',
          fontSize: isMobile ? '12px' : '14px',
        },
        success: {
          iconTheme: {
            primary: '#10b981',
            secondary: '#fff',
          },
        },
        error: {
          iconTheme: {
            primary: '#ef4444',
            secondary: '#fff',
          },
        },
      }}
    />
  );
}
