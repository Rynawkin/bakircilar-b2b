import { navigationRef } from './AppNavigator';

const normalizePath = (rawLink: string) => {
  const trimmed = String(rawLink || '').trim();
  if (!trimmed) return '';

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return url.pathname || '';
    } catch {
      return '';
    }
  }

  if (trimmed.startsWith('/')) return trimmed;
  return `/${trimmed}`;
};

const pathMatch = (path: string, regex: RegExp) => {
  const match = path.match(regex);
  return match || null;
};

export const navigateFromNotificationLink = (linkUrl?: string | null) => {
  if (!navigationRef.isReady()) return false;

  const path = normalizePath(linkUrl || '');
  if (!path) return false;

  const orderDetail = pathMatch(path, /^\/orders\/([^/]+)$/i);
  if (orderDetail) {
    navigationRef.navigate('OrderDetail', { orderId: decodeURIComponent(orderDetail[1]) });
    return true;
  }

  const quoteDetail = pathMatch(path, /^\/quotes\/([^/]+)$/i);
  if (quoteDetail) {
    navigationRef.navigate('QuoteDetail', { quoteId: decodeURIComponent(quoteDetail[1]) });
    return true;
  }

  const requestDetail = pathMatch(path, /^\/order-requests\/([^/]+)$/i);
  if (requestDetail) {
    navigationRef.navigate('RequestDetail', { requestId: decodeURIComponent(requestDetail[1]) });
    return true;
  }

  const taskDetail = pathMatch(path, /^\/tasks\/([^/]+)$/i) || pathMatch(path, /^\/requests\/([^/]+)$/i);
  if (taskDetail) {
    navigationRef.navigate('TaskDetail', { taskId: decodeURIComponent(taskDetail[1]) });
    return true;
  }

  const productDetail = pathMatch(path, /^\/products\/([^/]+)$/i);
  if (productDetail) {
    navigationRef.navigate('ProductDetail', { productId: decodeURIComponent(productDetail[1]) });
    return true;
  }

  if (/^\/notifications\/?$/i.test(path)) {
    navigationRef.navigate('Notifications');
    return true;
  }

  if (/^\/order-requests\/?$/i.test(path)) {
    navigationRef.navigate('Requests');
    return true;
  }

  if (/^\/tasks\/?$/i.test(path) || /^\/requests\/?$/i.test(path)) {
    navigationRef.navigate('Tasks');
    return true;
  }

  if (/^\/quotes\/?$/i.test(path)) {
    navigationRef.navigate('Quotes');
    return true;
  }

  if (/^\/orders\/?$/i.test(path)) {
    navigationRef.navigate('Orders');
    return true;
  }

  navigationRef.navigate('Tabs', { screen: 'More' });
  return true;
};
