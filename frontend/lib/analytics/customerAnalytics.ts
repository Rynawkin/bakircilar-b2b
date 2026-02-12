import apiClient from '@/lib/api/client';

export type CustomerActivityType =
  | 'PAGE_VIEW'
  | 'PRODUCT_VIEW'
  | 'CART_ADD'
  | 'CART_REMOVE'
  | 'CART_UPDATE'
  | 'ACTIVE_PING'
  | 'CLICK'
  | 'SEARCH';

export interface CustomerActivityPayload {
  type: CustomerActivityType;
  pagePath?: string;
  pageTitle?: string;
  referrer?: string;
  productId?: string;
  productCode?: string;
  cartItemId?: string;
  quantity?: number;
  durationSeconds?: number;
  clickCount?: number;
  meta?: Record<string, any>;
  sessionId?: string;
}

const isCustomerSession = () => {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem('b2b-auth');
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return parsed?.user?.role === 'CUSTOMER';
  } catch {
    return false;
  }
};

export const trackCustomerActivity = (payload: CustomerActivityPayload) => {
  if (!payload?.type) return;
  if (!isCustomerSession()) return;

  apiClient.post('/analytics/events', payload).catch(() => {
    // avoid noisy logs for tracking calls
  });
};
