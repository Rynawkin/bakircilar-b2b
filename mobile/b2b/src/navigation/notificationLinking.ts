import { navigationRef } from './AppNavigator';

const cleanPath = (pathOnly: string) => {
  if (/^\/customer(\/|$)/i.test(pathOnly)) {
    return pathOnly.replace(/^\/customer(?=\/|$)/i, '') || '/home';
  }
  return pathOnly;
};

const normalizePath = (rawLink: string) => {
  const trimmed = String(rawLink || '').trim();
  if (!trimmed) return '';

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return cleanPath(url.pathname || '');
    } catch {
      return '';
    }
  }

  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const pathOnly = normalized.split(/[?#]/)[0] || '';
  return cleanPath(pathOnly);
};

const pathMatch = (path: string, regex: RegExp) => {
  const match = path.match(regex);
  return match || null;
};

export const navigateFromNotificationLink = (linkUrl?: string | null) => {
  if (!navigationRef.isReady()) return false;

  const path = normalizePath(linkUrl || '');
  if (!path) return false;

  const orderDetail = pathMatch(path, /^\/orders\/([^/]+)$/i) || pathMatch(path, /^\/my-orders\/([^/]+)$/i);
  if (orderDetail) {
    navigationRef.navigate('OrderDetail', { orderId: decodeURIComponent(orderDetail[1]) });
    return true;
  }

  const quoteDetail = pathMatch(path, /^\/quotes\/([^/]+)$/i) || pathMatch(path, /^\/my-quotes\/([^/]+)$/i);
  if (quoteDetail) {
    navigationRef.navigate('QuoteDetail', { quoteId: decodeURIComponent(quoteDetail[1]) });
    return true;
  }

  const requestDetail =
    pathMatch(path, /^\/order-requests\/([^/]+)$/i) ||
    pathMatch(path, /^\/my-requests\/([^/]+)$/i);
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

  const collectionDetail = pathMatch(path, /^\/collections\/([^/]+)$/i);
  if (collectionDetail) {
    navigationRef.navigate('CollectionDetail', { collectionId: decodeURIComponent(collectionDetail[1]) });
    return true;
  }

  if (/^\/cart\/?$/i.test(path)) {
    navigationRef.navigate('Tabs', { screen: 'Cart' });
    return true;
  }

  if (/^\/?$|^\/home\/?$/i.test(path)) {
    navigationRef.navigate('Tabs', { screen: 'Home' });
    return true;
  }

  if (/^\/discounted-products\/?$/i.test(path)) {
    navigationRef.navigate('Tabs', { screen: 'DiscountedProducts' });
    return true;
  }

  if (/^\/previously-purchased\/?$/i.test(path)) {
    navigationRef.navigate('Tabs', { screen: 'PurchasedProducts' });
    return true;
  }

  if (/^\/collections\/?$/i.test(path)) {
    navigationRef.navigate('Collections');
    return true;
  }

  if (/^\/agreements\/?$/i.test(path)) {
    navigationRef.navigate('Agreements');
    return true;
  }

  if (/^\/pending-orders\/?$/i.test(path)) {
    navigationRef.navigate('PendingOrders');
    return true;
  }

  if (/^\/invoices\/?$/i.test(path)) {
    navigationRef.navigate('Invoices');
    return true;
  }

  if (/^\/new-categories\/?$/i.test(path)) {
    navigationRef.navigate('NewCategories');
    return true;
  }

  if (/^\/preferences\/?$/i.test(path)) {
    navigationRef.navigate('Preferences');
    return true;
  }

  if (/^\/profile\/?$/i.test(path)) {
    navigationRef.navigate('Profile');
    return true;
  }

  if (/^\/notifications\/?$/i.test(path)) {
    navigationRef.navigate('Notifications');
    return true;
  }

  if (/^\/order-requests\/?$/i.test(path) || /^\/my-requests\/?$/i.test(path)) {
    navigationRef.navigate('Requests');
    return true;
  }

  if (/^\/tasks\/?$/i.test(path) || /^\/requests\/?$/i.test(path)) {
    navigationRef.navigate('Tasks');
    return true;
  }

  if (/^\/quotes\/?$/i.test(path) || /^\/my-quotes\/?$/i.test(path)) {
    navigationRef.navigate('Quotes');
    return true;
  }

  if (/^\/orders\/?$/i.test(path) || /^\/my-orders\/?$/i.test(path)) {
    navigationRef.navigate('Orders');
    return true;
  }

  if (/^\/products\/?$/i.test(path)) {
    navigationRef.navigate('Tabs', { screen: 'Products' });
    return true;
  }

  navigationRef.navigate('Tabs', { screen: 'More' });
  return true;
};
