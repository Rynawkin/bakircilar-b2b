import { navigationRef, type PortalStackParamList } from './AppNavigator';

type ReportLinkType = NonNullable<PortalStackParamList['Reports']>['initialReport'];
type DecisionSupportLinkType = NonNullable<PortalStackParamList['DecisionSupport']>['initialView'];
type FamilyReportLinkType = NonNullable<PortalStackParamList['FamilyReports']>['initialView'];

const cleanPath = (pathOnly: string) => {
  if (/^\/admin(\/|$)/i.test(pathOnly)) {
    return pathOnly.replace(/^\/admin(?=\/|$)/i, '') || '/dashboard';
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

  const openReport = (initialReport: ReportLinkType) => {
    navigationRef.navigate('Reports', { initialReport });
    return true;
  };

  const openDecisionSupport = (initialView: DecisionSupportLinkType) => {
    navigationRef.navigate('DecisionSupport', { initialView });
    return true;
  };

  const openFamilyReports = (initialView: FamilyReportLinkType) => {
    navigationRef.navigate('FamilyReports', { initialView });
    return true;
  };

  const taskDetail = pathMatch(path, /^\/requests\/([^/]+)$/i) || pathMatch(path, /^\/tasks\/([^/]+)$/i);
  if (taskDetail) {
    navigationRef.navigate('TaskDetail', { taskId: decodeURIComponent(taskDetail[1]) });
    return true;
  }

  if (/^\/orders\/(new|manual)\/?$/i.test(path)) {
    navigationRef.navigate('OrderCreate');
    return true;
  }

  const orderDetail = pathMatch(path, /^\/orders\/([^/]+)$/i);
  if (orderDetail && !/^(new|manual|pending)$/i.test(orderDetail[1])) {
    navigationRef.navigate('OrderDetail', { orderId: decodeURIComponent(orderDetail[1]) });
    return true;
  }

  if (/^\/orders\/pending\/?$/i.test(path)) {
    navigationRef.navigate('Tabs', { screen: 'Orders' });
    return true;
  }

  const quoteConvert = pathMatch(path, /^\/quotes\/convert\/([^/]+)$/i);
  if (quoteConvert) {
    navigationRef.navigate('QuoteConvert', { quoteId: decodeURIComponent(quoteConvert[1]) });
    return true;
  }

  if (/^\/quotes\/new\/?$/i.test(path)) {
    navigationRef.navigate('QuoteCreate');
    return true;
  }

  if (/^\/quotes\/lines\/?$/i.test(path)) {
    navigationRef.navigate('QuoteLines');
    return true;
  }

  const quoteDetail = pathMatch(path, /^\/quotes\/([^/]+)$/i);
  if (quoteDetail && !/^(new|lines|convert)$/i.test(quoteDetail[1])) {
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

  if (/^\/dashboard\/?$/i.test(path)) {
    navigationRef.navigate('Tabs', { screen: 'Dashboard' });
    return true;
  }

  if (/^\/customers\/?$/i.test(path)) {
    navigationRef.navigate('Customers');
    return true;
  }

  if (/^\/customer-agreements\/?$/i.test(path)) {
    navigationRef.navigate('CustomerAgreements');
    return true;
  }

  if (/^\/customer-360\/?$/i.test(path)) {
    navigationRef.navigate('Customer360');
    return true;
  }

  const customer360Detail = pathMatch(path, /^\/customer-360\/([^/]+)$/i);
  if (customer360Detail) {
    navigationRef.navigate('Customer360', { customerIdOrCode: decodeURIComponent(customer360Detail[1]) });
    return true;
  }

  if (/^\/field-sales\/visits\/?$/i.test(path)) {
    navigationRef.navigate('FieldSalesVisits');
    return true;
  }

  if (/^\/field-sales\/?$/i.test(path)) {
    navigationRef.navigate('FieldSales');
    return true;
  }

  if (/^\/portfolio\/?$/i.test(path)) {
    navigationRef.navigate('Portfolio');
    return true;
  }

  if (/^\/hot-sales\/?$/i.test(path)) {
    navigationRef.navigate('HotSales');
    return true;
  }

  if (/^\/warehouse\/image-issues\/?$/i.test(path)) {
    navigationRef.navigate('ImageIssues');
    return true;
  }

  if (/^\/warehouse\/retail\/?$/i.test(path)) {
    navigationRef.navigate('Warehouse');
    return true;
  }

  if (/^\/warehouse\/?$/i.test(path)) {
    navigationRef.navigate('Warehouse');
    return true;
  }

  if (/^\/order-tracking\/?$/i.test(path)) {
    navigationRef.navigate('OrderTracking');
    return true;
  }

  if (/^\/einvoices\/?$/i.test(path)) {
    navigationRef.navigate('EInvoices');
    return true;
  }

  if (/^\/vade\/dashboard\/?$/i.test(path)) {
    navigationRef.navigate('VadeDashboard');
    return true;
  }

  if (/^\/vade\/analytics\/?$/i.test(path)) {
    navigationRef.navigate('VadeAnalytics');
    return true;
  }

  if (/^\/vade\/management\/?$/i.test(path)) {
    navigationRef.navigate('VadeManagement');
    return true;
  }

  if (/^\/vade\/(notes|calendar|assignments|import)\/?$/i.test(path)) {
    navigationRef.navigate('Vade');
    return true;
  }

  if (/^\/vade\/?$/i.test(path)) {
    navigationRef.navigate('Vade');
    return true;
  }

  if (/^\/products\/bundles\/?$/i.test(path) || /^\/bundles\/?$/i.test(path)) {
    navigationRef.navigate('Bundles');
    return true;
  }

  const productDetail = pathMatch(path, /^\/products\/([^/]+)$/i);
  if (productDetail) {
    navigationRef.navigate('Products', { search: decodeURIComponent(productDetail[1]) });
    return true;
  }

  if (/^\/products\/?$/i.test(path)) {
    navigationRef.navigate('Products');
    return true;
  }

  if (/^\/admin-products\/?$/i.test(path)) {
    navigationRef.navigate('Products');
    return true;
  }

  if (/^\/product-dimensions\/?$/i.test(path)) {
    navigationRef.navigate('ProductDimensions');
    return true;
  }

  if (/^\/product-overrides\/?$/i.test(path)) {
    navigationRef.navigate('ProductOverrides');
    return true;
  }

  if (/^\/passive-stocks\/?$/i.test(path) || /^\/stock-create\/?$/i.test(path)) {
    navigationRef.navigate('PassiveStocks');
    return true;
  }

  if (/^\/reports\/customer-engagement\/?$/i.test(path)) {
    navigationRef.navigate('CustomerEngagement');
    return true;
  }

  if (/^\/reports\/customer-recovery\/actions\/?$/i.test(path)) {
    navigationRef.navigate('RecoveryActions');
    return true;
  }

  if (/^\/reports\/customer-recovery\/?$/i.test(path)) {
    navigationRef.navigate('CustomerRecoveryReport');
    return true;
  }

  if (/^\/reports\/action-radar\/?$/i.test(path)) return openReport('actionRadar');
  if (/^\/reports\/customer-carts\/?$/i.test(path)) return openReport('customerCarts');
  if (/^\/reports\/customer-activity\/?$/i.test(path)) return openReport('customerActivity');
  if (/^\/reports\/complement-missing\/?$/i.test(path)) return openReport('complementMissing');
  if (/^\/reports\/top-products\/?$/i.test(path)) return openReport('topProducts');
  if (/^\/reports\/top-customers\/?$/i.test(path)) return openReport('topCustomers');
  if (/^\/reports\/product-customers\/[^/]+\/?$/i.test(path) || /^\/reports\/product-customers\/?$/i.test(path)) {
    return openReport('productCustomers');
  }
  if (/^\/reports\/cost-update-alerts\/?$/i.test(path) || /^\/reports\/cost-update-all-products\/?$/i.test(path)) return openReport('cost');
  if (/^\/reports\/margin-compliance\/?$/i.test(path)) return openReport('margin');
  if (/^\/reports\/profit-analysis\/?$/i.test(path)) return openReport('profit');
  if (/^\/reports\/price-history\/?$/i.test(path)) return openReport('price');

  if (/^\/reports\/barter-radar\/?$/i.test(path)) return openDecisionSupport('barter');
  if (/^\/reports\/sticky-discounts\/?$/i.test(path)) return openDecisionSupport('sticky');
  if (/^\/reports\/discount-below-entry-cost\/?$/i.test(path)) return openDecisionSupport('belowCost');
  if (/^\/reports\/demand-pattern\/?$/i.test(path)) return openDecisionSupport('demand');
  if (/^\/reports\/category-churn\/?$/i.test(path)) return openDecisionSupport('churn');
  if (/^\/reports\/category-opportunity\/?$/i.test(path)) return openDecisionSupport('opportunity');

  if (/^\/reports\/ucarer-depo\/?$/i.test(path) || /^\/ucarer-depo\/?$/i.test(path)) {
    navigationRef.navigate('UcarerDepot');
    return true;
  }

  if (/^\/reports\/ucarer-minmax-exclusions\/?$/i.test(path)) {
    navigationRef.navigate('UcarerDepot');
    return true;
  }

  if (/^\/reports\/family-management\/?$/i.test(path) || /^\/family-reports\/?$/i.test(path)) return openFamilyReports('suggestions');
  if (/^\/reports\/product-families\/?$/i.test(path)) return openFamilyReports('stockFamilies');
  if (/^\/reports\/price-families\/?$/i.test(path)) return openFamilyReports('priceFamilies');
  if (/^\/reports\/price-family-costs\/?$/i.test(path)) return openFamilyReports('priceCosts');

  if (/^\/reports\/decision-support\/?$/i.test(path) || /^\/decision-support\/?$/i.test(path)) {
    navigationRef.navigate('DecisionSupport');
    return true;
  }

  if (/^\/reports\/audit\/?$/i.test(path) || /^\/audit-reports\/?$/i.test(path) || /^\/reports\/staff-activity\/?$/i.test(path) || /^\/reports\/toplu-audit\/?$/i.test(path)) {
    navigationRef.navigate('AuditReports');
    return true;
  }

  if (/^\/reports\/field-sales-visits\/?$/i.test(path)) {
    navigationRef.navigate('FieldSalesVisits');
    return true;
  }

  if (/^\/reports\/supplier-price-lists\/?$/i.test(path)) {
    navigationRef.navigate('SupplierPriceLists');
    return true;
  }

  if (/^\/reports\/?$/i.test(path)) {
    navigationRef.navigate('Reports');
    return true;
  }

  if (/^\/operations\/?$/i.test(path)) {
    navigationRef.navigate('Operations');
    return true;
  }

  if (/^\/supplier-costs\/?$/i.test(path)) {
    navigationRef.navigate('SupplierCosts');
    return true;
  }

  if (/^\/supplier-price-lists\/settings\/?$/i.test(path) || /^\/supplier-price-list-settings\/?$/i.test(path)) {
    navigationRef.navigate('SupplierPriceListSettings');
    return true;
  }

  if (/^\/supplier-price-lists\/?$/i.test(path)) {
    navigationRef.navigate('SupplierPriceLists');
    return true;
  }

  if (/^\/banners\/?$/i.test(path)) {
    navigationRef.navigate('Banners');
    return true;
  }

  if (/^\/gift-campaigns\/?$/i.test(path)) {
    navigationRef.navigate('GiftCampaigns');
    return true;
  }

  if (/^\/collections\/?$/i.test(path)) {
    navigationRef.navigate('Collections');
    return true;
  }

  if (/^\/category-images\/?$/i.test(path)) {
    navigationRef.navigate('CategoryImages');
    return true;
  }

  if (/^\/categories\/?$/i.test(path)) {
    navigationRef.navigate('Categories');
    return true;
  }

  if (/^\/campaigns\/?$/i.test(path)) {
    navigationRef.navigate('Campaigns');
    return true;
  }

  if (/^\/exclusions\/?$/i.test(path)) {
    navigationRef.navigate('Exclusions');
    return true;
  }

  if (/^\/role-permissions\/?$/i.test(path)) {
    navigationRef.navigate('RolePermissions');
    return true;
  }

  if (/^\/search-management\/?$/i.test(path)) {
    navigationRef.navigate('SearchManagement');
    return true;
  }

  if (/^\/search\/stocks\/?$/i.test(path)) {
    navigationRef.navigate('Search', { mode: 'stocks', autoRun: false });
    return true;
  }

  if (/^\/search\/customers\/?$/i.test(path)) {
    navigationRef.navigate('Search', { mode: 'customers', autoRun: false });
    return true;
  }

  if (/^\/notifications\/?$/i.test(path)) {
    navigationRef.navigate('Notifications');
    return true;
  }

  if (/^\/settings\/?$/i.test(path)) {
    navigationRef.navigate('Settings');
    return true;
  }

  if (/^\/sync\/?$/i.test(path)) {
    navigationRef.navigate('Sync');
    return true;
  }

  if (/^\/staff\/?$/i.test(path)) {
    navigationRef.navigate('Staff');
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
