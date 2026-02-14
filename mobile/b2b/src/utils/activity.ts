import { apiClient } from '../api/client';
import type { User } from '../types';

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

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const IDLE_THRESHOLD_MS = 60 * 1000;
const MAX_ACTIVE_CHUNK_MS = 5 * 60 * 1000;

let cachedUser: User | null = null;
let sessionId: string | null = null;
let sessionLastSeen = 0;
let currentPagePath = '';
let currentPageTitle: string | undefined;
let lastInteractionAt = 0;
let activeStartAt: number | null = null;
let clickCount = 0;

const isCustomerSession = () => cachedUser?.role === 'CUSTOMER';

const generateSessionId = () => {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const getSessionId = () => {
  const now = Date.now();
  if (sessionId && now - sessionLastSeen <= SESSION_TIMEOUT_MS) {
    sessionLastSeen = now;
    return sessionId;
  }
  sessionId = generateSessionId();
  sessionLastSeen = now;
  return sessionId;
};

const markInteraction = (countClick: boolean) => {
  const now = Date.now();
  lastInteractionAt = now;
  if (activeStartAt === null) {
    activeStartAt = now;
  }
  if (countClick) {
    clickCount += 1;
  }
};

export const setActivityUser = (user: User | null) => {
  cachedUser = user;
};

export const setActivityPage = (pagePath: string, pageTitle?: string) => {
  currentPagePath = pagePath;
  currentPageTitle = pageTitle;
};

export const trackCustomerActivity = (payload: CustomerActivityPayload) => {
  if (!payload?.type) return;
  if (!isCustomerSession()) return;

  const eventPayload: CustomerActivityPayload = {
    ...payload,
    sessionId: payload.sessionId || getSessionId(),
    pagePath: payload.pagePath || currentPagePath,
    pageTitle: payload.pageTitle || currentPageTitle,
  };

  if (payload.type !== 'ACTIVE_PING') {
    const countClick =
      payload.type === 'PRODUCT_VIEW' ||
      payload.type === 'CART_ADD' ||
      payload.type === 'CART_REMOVE' ||
      payload.type === 'CART_UPDATE' ||
      payload.type === 'SEARCH' ||
      payload.type === 'CLICK';
    markInteraction(countClick);
  }

  apiClient.post('/analytics/events', eventPayload).catch(() => {
    // ignore tracking failures
  });
};

export const flushActivePing = (force = false) => {
  if (!isCustomerSession()) return;
  if (activeStartAt === null) {
    clickCount = 0;
    return;
  }

  const now = Date.now();
  const idleMs = now - (lastInteractionAt || activeStartAt);
  const activeMs = now - activeStartAt;
  const shouldFlush = force || idleMs >= IDLE_THRESHOLD_MS || activeMs >= MAX_ACTIVE_CHUNK_MS;
  if (!shouldFlush) return;

  const durationSeconds = Math.max(1, Math.round(activeMs / 1000));
  trackCustomerActivity({
    type: 'ACTIVE_PING',
    durationSeconds,
    clickCount,
  });

  clickCount = 0;
  activeStartAt = null;
};
