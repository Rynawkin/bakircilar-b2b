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

  const taskDetail = pathMatch(path, /^\/requests\/([^/]+)$/i) || pathMatch(path, /^\/tasks\/([^/]+)$/i);
  if (taskDetail) {
    navigationRef.navigate('TaskDetail', { taskId: decodeURIComponent(taskDetail[1]) });
    return true;
  }

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

  const customerDetail = pathMatch(path, /^\/customers\/([^/]+)$/i);
  if (customerDetail) {
    navigationRef.navigate('CustomerDetail', { customerId: decodeURIComponent(customerDetail[1]) });
    return true;
  }

  const vadeCustomer = pathMatch(path, /^\/vade\/customers\/([^/]+)$/i);
  if (vadeCustomer) {
    navigationRef.navigate('VadeCustomer', { customerId: decodeURIComponent(vadeCustomer[1]) });
    return true;
  }

  if (/^\/einvoices\/?$/i.test(path)) {
    navigationRef.navigate('EInvoices');
    return true;
  }

  if (/^\/vade\/?$/i.test(path)) {
    navigationRef.navigate('Vade');
    return true;
  }

  if (/^\/requests\/?$/i.test(path) || /^\/tasks\/?$/i.test(path)) {
    navigationRef.navigate('Tabs', { screen: 'Tasks' });
    return true;
  }

  if (/^\/order-requests\/?$/i.test(path) || /^\/orders\/?$/i.test(path)) {
    navigationRef.navigate('Tabs', { screen: 'Orders' });
    return true;
  }

  if (/^\/quotes\/?$/i.test(path)) {
    navigationRef.navigate('Tabs', { screen: 'Quotes' });
    return true;
  }

  navigationRef.navigate('Tabs', { screen: 'Dashboard' });
  return true;
};

