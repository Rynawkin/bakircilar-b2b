import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
const listDirs = (relativePath) =>
  fs
    .readdirSync(path.join(repoRoot, relativePath), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'tr'));

const walkFiles = (relativePath, predicate = () => true) => {
  const root = path.join(repoRoot, relativePath);
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (predicate(fullPath)) {
        files.push(fullPath);
      }
    }
  };
  walk(root);
  return files;
};

const portalNavigator = read('mobile/portal/src/navigation/AppNavigator.tsx');
const portalTabs = read('mobile/portal/src/navigation/PortalTabs.tsx');
const portalModules = read('mobile/portal/src/navigation/portalModules.ts');
const customerNavigator = read('mobile/b2b/src/navigation/AppNavigator.tsx');
const customerTabs = read('mobile/b2b/src/navigation/CustomerTabs.tsx');
const customerMore = read('mobile/b2b/src/screens/MoreScreen.tsx');

const collectSingleQuotedValues = (source, pattern) => {
  const values = new Set();
  for (const match of source.matchAll(pattern)) {
    values.add(match[1]);
  }
  return values;
};

const portalStackRoutes = collectSingleQuotedValues(portalNavigator, /Stack\.Screen\s+name="([^"]+)"/g);
const portalTabRoutes = collectSingleQuotedValues(portalTabs, /Tab\.Screen\s+name="([^"]+)"/g);
const portalModuleRoutes = collectSingleQuotedValues(portalModules, /route:\s*'([^']+)'/g);
const portalReachableRoutes = new Set([...portalStackRoutes, ...portalTabRoutes, ...portalModuleRoutes]);

const customerStackRoutes = collectSingleQuotedValues(customerNavigator, /Stack\.Screen\s+name="([^"]+)"/g);
const customerTabRoutes = collectSingleQuotedValues(customerTabs, /Tab\.Screen\s+name="([^"]+)"/g);
const customerMoreRoutes = collectSingleQuotedValues(customerMore, /route:\s*'([^']+)'/g);
const customerReachableRoutes = new Set([...customerStackRoutes, ...customerTabRoutes, ...customerMoreRoutes]);

const adminRouteMap = {
  'admin-products': ['Products'],
  banners: ['Banners'],
  bundles: ['Bundles'],
  campaigns: ['Campaigns'],
  categories: ['Categories'],
  'category-images': ['CategoryImages'],
  collections: ['Collections'],
  'customer-360': ['Customer360'],
  'customer-agreements': ['CustomerAgreements'],
  customers: ['Customers'],
  dashboard: ['Tabs', 'Dashboard'],
  einvoices: ['EInvoices'],
  'field-sales': ['FieldSales'],
  'gift-campaigns': ['GiftCampaigns'],
  'hot-sales': ['HotSales'],
  operations: ['Operations'],
  orders: ['Tabs', 'Orders', 'OrderDetail', 'OrderCreate'],
  'order-tracking': ['OrderTracking'],
  'passive-stocks': ['PassiveStocks'],
  portfolio: ['Portfolio'],
  'product-dimensions': ['ProductDimensions'],
  'product-overrides': ['ProductOverrides'],
  quotes: ['Tabs', 'Quotes', 'QuoteDetail', 'QuoteCreate', 'QuoteConvert', 'QuoteLines'],
  reports: ['Reports', 'DecisionSupport', 'FamilyReports', 'CustomerRecoveryReport', 'RecoveryActions', 'AuditReports'],
  requests: ['Tabs', 'Tasks', 'TaskDetail', 'TaskCreate'],
  'role-permissions': ['RolePermissions'],
  search: ['Search'],
  'search-management': ['SearchManagement'],
  settings: ['Settings'],
  staff: ['Staff'],
  'stock-create': ['PassiveStocks'],
  'supplier-costs': ['SupplierCosts'],
  'supplier-price-list-settings': ['SupplierPriceListSettings', 'SupplierPriceLists'],
  vade: ['Vade', 'VadeDashboard', 'VadeAnalytics', 'VadeManagement', 'VadeCustomer'],
  warehouse: ['Warehouse'],
};

const customerRouteMap = {
  agreements: ['Agreements'],
  cart: ['Tabs', 'Cart'],
  collections: ['Collections', 'CollectionDetail'],
  'discounted-products': ['Tabs', 'DiscountedProducts'],
  home: ['Tabs', 'Home'],
  invoices: ['Invoices'],
  'my-orders': ['Orders', 'OrderDetail'],
  'my-quotes': ['Quotes', 'QuoteDetail'],
  'my-requests': ['Requests', 'RequestDetail', 'Tasks', 'TaskDetail'],
  'new-categories': ['NewCategories'],
  'order-requests': ['Requests', 'RequestDetail'],
  'pending-orders': ['PendingOrders'],
  preferences: ['Preferences'],
  'previously-purchased': ['Tabs', 'PurchasedProducts'],
  products: ['Tabs', 'Products', 'ProductDetail'],
  profile: ['Profile'],
};

const failures = [];
const warnings = [];

const checkMappedRoutes = ({ label, sourceDirs, routeMap, reachableRoutes }) => {
  for (const routeDir of sourceDirs) {
    const expectedRoutes = routeMap[routeDir];
    if (!expectedRoutes) {
      failures.push(`${label}: web route "${routeDir}" icin mobil karsilik tanimli degil.`);
      continue;
    }
    const missing = expectedRoutes.filter((route) => !reachableRoutes.has(route));
    if (missing.length > 0) {
      failures.push(`${label}: web route "${routeDir}" icin mobil route eksik: ${missing.join(', ')}`);
    }
  }

  const extraMappings = Object.keys(routeMap).filter((routeDir) => !sourceDirs.includes(routeDir));
  if (extraMappings.length > 0) {
    warnings.push(`${label}: web klasorunde bulunmayan ama map'te kalan route(lar): ${extraMappings.join(', ')}`);
  }
};

checkMappedRoutes({
  label: 'admin',
  sourceDirs: listDirs('frontend/app/(admin)'),
  routeMap: adminRouteMap,
  reachableRoutes: portalReachableRoutes,
});

checkMappedRoutes({
  label: 'customer',
  sourceDirs: listDirs('frontend/app/(customer)'),
  routeMap: customerRouteMap,
  reachableRoutes: customerReachableRoutes,
});

const sourceFiles = walkFiles('mobile', (fullPath) => /\.(tsx|ts)$/.test(fullPath));
const placeholderPattern = /\b(TODO|FIXME|coming soon|not implemented|yakinda|mock data|dummy|stub)\b/i;
for (const file of sourceFiles) {
  const relative = path.relative(repoRoot, file).replaceAll(path.sep, '/');
  if (relative.includes('/node_modules/')) continue;
  const contents = fs.readFileSync(file, 'utf8');
  if (placeholderPattern.test(contents)) {
    failures.push(`placeholder kalibi bulundu: ${relative}`);
  }
}

const unboundedDynamicTitlePattern =
  /<Text\s+style=\{styles\.(cardTitle|rowTitle|productTitle|fileTitle|customerName|lineTitle)\}>\{[^}]+\}<\/Text>/g;
const oldHeroPattern =
  /(?:header|hero|customerCard|productHero):\s*\{\s*(?:\r?\n\s*)?backgroundColor:\s*colors\.primary,/m;
for (const file of sourceFiles) {
  const relative = path.relative(repoRoot, file).replaceAll(path.sep, '/');
  const contents = fs.readFileSync(file, 'utf8');
  if (unboundedDynamicTitlePattern.test(contents)) {
    failures.push(`satir limitsiz dinamik kart/header basligi bulundu: ${relative}`);
  }
  if (oldHeroPattern.test(contents)) {
    failures.push(`eski duz mavi header/hero kalibi olabilir: ${relative}`);
  }
}

const requiredFeatureContracts = [
  {
    file: 'mobile/portal/src/screens/QuoteCreateScreen.tsx',
    markers: [
      ['cari kontak secimi', 'getCustomerContacts'],
      ['kontak payload', 'contactId: selectedContactId'],
      ['dahil depo bilgisi', 'includedWarehouses'],
      ['sorumlu listesi', 'getQuoteResponsibles'],
      ['fiyat kaynagi', "priceSource: 'PRICE_LIST'"],
      ['son satis kaynagi', "'LAST_SALE'"],
      ['manuel fiyat', "'MANUAL'"],
      ['kalem KDV', 'vatZeroed'],
      ['kalem aciklamasi', 'lineDescription'],
      ['depo dagilimi', 'warehouseStocks'],
      ['iki maliyet kari', 'KAR GUNCEL / GIRIS'],
      ['tamamlayici oneriler', 'getComplementRecommendations'],
      ['stok ailesi onerisi', 'StockFamilySuggestion'],
      ['aile degistir', "requestFamilyAction('swap'"],
      ['aile bol', "requestFamilyAction('split'"],
      ['aile islemi onayi', 'confirmFamilyAction'],
    ],
  },
  {
    file: 'mobile/portal/src/screens/OrderCreateScreen.tsx',
    markers: [
      ['musteri siparis no', 'documentNo'],
      ['teslimat deposu', 'warehouseNo'],
      ['faturali seri', 'invoicedSeries'],
      ['beyaz seri', 'whiteSeries'],
      ['rezerve miktar', 'reserveQty'],
      ['sorumluluk merkezi', 'responsibilityCenter'],
      ['birim katsayisi', 'unit2Factor'],
      ['depo dagilimi', 'warehouseStocks'],
      ['iki maliyet kari', 'KAR GUNCEL / GIRIS'],
    ],
  },
  {
    file: 'mobile/portal/src/screens/OrderTrackingScreen.tsx',
    markers: [
      ['musteri tedarikci sekmeleri', "type TrackingTab = 'customers' | 'suppliers' | 'logs'"],
      ['tum kalan kapatma', 'closeOrderTrackingRemaining'],
      ['satir kalan kapatma', 'lineNumbers: [Number(rowNumber)]'],
      ['miktar revizyonu', 'updateOrderTrackingLineQuantity'],
      ['teslim alt siniri', 'deliveredQty'],
      ['mail loglari', "activeTab === 'logs'"],
      ['tedarikci iletildi', 'markOrderTrackingSupplierTransmitted'],
    ],
  },
  {
    file: 'mobile/portal/src/screens/EInvoicesScreen.tsx',
    markers: [
      ['VKN', 'customerTaxNo'],
      ['cari bakiye', 'customerBalance'],
      ['fatura oneki', 'invoicePrefix'],
      ['tarih araligi baslangic', 'fromDate'],
      ['tarih araligi bitis', 'toDate'],
      ['cari filtresi', 'selectedCari'],
      ['toplu secim', 'toggleAll'],
      ['toplu indirme', 'bulk-download'],
      ['PDF yukleme', 'uploadEInvoices'],
      ['sayfalama', 'totalPages'],
    ],
  },
  {
    file: 'mobile/portal/src/screens/UcarerDepotScreen.tsx',
    markers: [
      ['6 gorunum', "type ViewKey = 'report' | 'families' | 'orders' | 'minmax' | 'excluded' | 'logs'"],
      ['tedarikci siparis taslagi', 'orderDraftLines'],
      ['DSV transfer taslagi', 'transferDraftLines'],
      ['taslak kaliciligi', 'saveUcarerDraft'],
      ['MinMax isi', 'runUcarerMinMaxReport'],
      ['maliyet guncelleme', 'updateUcarerProductCost'],
      ['ana tedarikci', 'updateUcarerMainSupplier'],
      ['haric tutma', 'setUcarerMinMaxExclusion'],
    ],
  },
  {
    file: 'mobile/portal/src/screens/WarehouseScreen.tsx',
    markers: [
      ['toplama satiri', 'pickedQty'],
      ['raf kodu', 'shelfCode'],
      ['barkod hizli bul', 'focusLineSearch'],
      ['gorsel hata', 'reportWarehouseImageIssue'],
      ['yukleme', 'markWarehouseLoaded'],
      ['sofor', 'selectedDriver'],
      ['arac', 'selectedVehicle'],
      ['irsaliye', 'markWarehouseDispatched'],
      ['perakende', 'createWarehouseRetailSale'],
    ],
  },
  {
    file: 'mobile/portal/src/screens/HotSalesScreen.tsx',
    markers: [
      ['arac oturumu', 'startHotSaleSession'],
      ['arac yukleme', 'addHotSaleLoad'],
      ['satis', 'createHotSaleTransaction'],
      ['siparisten teslim', 'deliverHotSaleOrder'],
      ['gun sonu sayim', 'closeHotSaleSession'],
      ['nakit mutabakat', 'cash'],
      ['gunluk rapor', 'getHotSaleDailyReport'],
    ],
  },
  {
    file: 'mobile/portal/src/screens/VadeScreen.tsx',
    markers: [
      ['Excel import', 'importVadeBalances'],
      ['not ekleme', 'createVadeNote'],
      ['hatirlatma tamamlama', 'updateVadeNote'],
      ['atama', 'assignVadeCustomers'],
      ['atama kaldirma', 'removeVadeAssignment'],
      ['panel gecisi', "navigate('VadeDashboard')"],
      ['analiz gecisi', "navigate('VadeAnalytics')"],
      ['yonetim gecisi', "navigate('VadeManagement')"],
    ],
  },
  {
    file: 'mobile/portal/src/screens/SupplierCostsScreen.tsx',
    markers: [
      ['urun arama', 'searchSupplierCostProducts'],
      ['tedarikci arama', 'searchSupplierCostSuppliers'],
      ['maliyet kaydi', 'createSupplierCost'],
      ['Mikro maliyet uygulama', 'applySupplierCost'],
      ['fiyat teyit teklifi', 'addPriceVerificationOffer'],
      ['fiyat karari', 'decidePriceVerification'],
      ['ihale teklifi', 'addTenderCostOffer'],
      ['dosya ekleme', 'pickAttachment'],
      ['talep notu', 'addPriceVerificationNote'],
    ],
  },
  {
    file: 'mobile/portal/src/screens/NotificationsScreen.tsx',
    markers: [
      ['okunmamis filtresi', "'UNREAD'"],
      ['tumunu okundu', 'markAllNotificationsRead'],
      ['kategori tercihleri', 'updateNotificationPreferences'],
      ['push kaydi', 'registerPushToken'],
      ['push testi', 'sendTestPush'],
      ['bildirim deep link', 'navigateFromNotificationLink'],
    ],
  },
];

for (const contract of requiredFeatureContracts) {
  const contents = read(contract.file);
  for (const [label, marker] of contract.markers) {
    if (!contents.includes(marker)) {
      failures.push(`ozellik sozlesmesi eksik: ${contract.file} -> ${label} (${marker})`);
    }
  }
}

const adminApiContracts = [
  '/order-tracking/admin/summary',
  '/order-tracking/admin/supplier-summary',
  '/close-remaining',
  '/line-quantity',
  '/admin/stock-family/suggestions',
  '/order-tracking/admin/send-customer-emails',
  '/order-tracking/admin/send-supplier-emails',
  '/admin/einvoices',
];
const portalAdminApi = read('mobile/portal/src/api/admin.ts');
for (const endpoint of adminApiContracts) {
  if (!portalAdminApi.includes(endpoint)) {
    failures.push(`portal admin API sozlesmesi eksik: ${endpoint}`);
  }
}

const report = {
  adminWebRoutes: listDirs('frontend/app/(admin)').length,
  customerWebRoutes: listDirs('frontend/app/(customer)').length,
  portalReachableRoutes: portalReachableRoutes.size,
  customerReachableRoutes: customerReachableRoutes.size,
  warnings,
  failures,
};

console.log(JSON.stringify(report, null, 2));

if (failures.length > 0) {
  process.exit(1);
}
