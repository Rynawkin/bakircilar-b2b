import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';

import { adminApi } from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { CostUpdateAlert, CostUpdateSummary, MarginComplianceRow, PriceHistoryChange } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';

type ReportType =
  | 'cost'
  | 'margin'
  | 'profit'
  | 'price'
  | 'priceNew'
  | 'topProducts'
  | 'topCustomers'
  | 'productCustomers'
  | 'complementMissing'
  | 'customerActivity'
  | 'customerCarts'
  | 'actionRadar';

type ActionRadarItem = {
  id: string;
  group: string;
  title: string;
  subtitle?: string;
  meta: string[];
  tone?: 'default' | 'red' | 'amber' | 'green';
  actionLabel?: string;
  action:
    | { type: 'quoteDetail'; quoteId: string }
    | { type: 'quotes' }
    | { type: 'cartReport'; search?: string }
    | { type: 'productSearch'; productCode?: string }
    | {
        type: 'products';
        search?: string;
        qualityFilter?: 'ALL' | 'BAD' | 'WARN' | 'NO_IMAGE' | 'GALLERY_MISSING';
        detailTab?: 'SUMMARY' | 'PRICES' | 'STOCK' | 'IMAGE';
        autoOpenFirst?: boolean;
      }
    | { type: 'customerDetail'; customerId?: string }
    | { type: 'fieldSales'; customerIdOrCode?: string }
    | { type: 'orderTracking' }
    | { type: 'complementManagement' }
    | { type: 'bundles' }
    | { type: 'none' };
};

const formatMoney = (value: any) => `${Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL`;

const reportTitles: Record<ReportType, string> = {
  cost: 'Maliyet Guncelleme',
  margin: 'Kar Marji',
  profit: 'Kar Analizi',
  price: 'Fiyat Degisimleri',
  priceNew: 'Fiyat Degisimi Yeni',
  topProducts: 'Top Urunler',
  topCustomers: 'Top Cariler',
  productCustomers: 'Urun Musterileri',
  complementMissing: 'Tamamlayici Eksikler',
  customerActivity: 'Musteri Aktivitesi',
  customerCarts: 'Musteri Sepetleri',
  actionRadar: 'Aksiyon Radari',
};

const cell = (value: any) => {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayir';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'object' && item ? JSON.stringify(item) : String(item ?? '')))
      .join(' | ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const genericRows = (rows: any[]) => {
  const keys = Array.from(
    rows.reduce((set: Set<string>, row) => {
      Object.keys(row || {}).forEach((key) => set.add(key));
      return set;
    }, new Set<string>())
  ).slice(0, 40);
  return [keys, ...rows.map((row) => keys.map((key) => cell(row?.[key])))];
};

const buildReportSheetRows = (reportType: ReportType, rows: any[]) => {
  if (reportType === 'cost') {
    return [
      ['Urun Kodu', 'Urun Adi', 'Gun Farki', 'Fark %', 'Risk Tutar', 'Mevcut Maliyet', 'Yeni Maliyet'],
      ...rows.map((row) => [
        cell(row.productCode),
        cell(row.productName),
        cell(row.dayDiff),
        cell(row.diffPercent),
        cell(row.riskAmount),
        cell(row.currentCost ?? row.oldCost),
        cell(row.newCost ?? row.latestCost),
      ]),
    ];
  }

  if (reportType === 'price') {
    return [
      ['Urun Kodu', 'Urun Adi', 'Ortalama Degisim %', 'Guncellenen Liste', 'Tutarlilik', 'Son Degisim'],
      ...rows.map((row) => [
        cell(row.productCode),
        cell(row.productName),
        cell(row.avgChangePercent),
        cell(row.updatedListsCount),
        cell(row.isConsistent),
        cell(row.lastChangeDate || row.updatedAt),
      ]),
    ];
  }

  if (reportType === 'priceNew') {
    return [
      ['Urun Kodu', 'Urun Adi', 'Degisim Sayisi', 'Stok', 'Son Degisim'],
      ...rows.map((row) => [
        cell(row.productCode),
        cell(row.productName),
        cell(row.totalChanges),
        cell(row.currentStock),
        cell(row.lastChangeDate || row.updatedAt),
      ]),
    ];
  }

  if (reportType === 'topProducts') {
    return [
      ['Urun Kodu', 'Urun Adi', 'Miktar', 'Ciro', 'Kar', 'Kar %'],
      ...rows.map((row) => [
        cell(row.productCode),
        cell(row.productName),
        cell(row.quantity ?? row.totalQuantity),
        cell(row.revenue),
        cell(row.profit),
        cell(row.marginPercent ?? row.profitMargin),
      ]),
    ];
  }

  if (reportType === 'topCustomers' || reportType === 'productCustomers') {
    return [
      ['Cari Kodu', 'Cari Adi', 'Sektor', 'Miktar', 'Ciro', 'Kar', 'Kar %'],
      ...rows.map((row) => [
        cell(row.customerCode),
        cell(row.customerName),
        cell(row.sector || row.sectorCode),
        cell(row.quantity ?? row.totalQuantity),
        cell(row.revenue ?? row.totalRevenue),
        cell(row.profit),
        cell(row.marginPercent ?? row.profitMargin),
      ]),
    ];
  }

  if (reportType === 'complementMissing') {
    return [
      ['Cari/Urun Kodu', 'Cari/Urun Adi', 'Evrak', 'Eksik Sayisi', 'Eksik Tamamlayicilar'],
      ...rows.map((row) => [
        cell(row.customerCode || row.productCode),
        cell(row.customerName || row.productName),
        cell(row.documentCount),
        cell(row.missingCount),
        cell((row.missingComplements || []).map((item: any) => `${item.productCode || item.code || ''} ${item.productName || item.name || ''}`)),
      ]),
    ];
  }

  if (reportType === 'customerActivity') {
    return [
      ['Tip', 'Kullanici', 'Cari Kodu', 'Cari Adi', 'Sayfa', 'Urun Kodu', 'Arama', 'Tiklama', 'Tarih'],
      ...rows.map((row) => [
        cell(row.type),
        cell(row.userName || row.userId),
        cell(row.customerCode),
        cell(row.customerName),
        cell(row.pagePath),
        cell(row.productCode),
        cell(row.searchTerm),
        cell(row.clickCount),
        cell(row.createdAt || row.lastActivityAt),
      ]),
    ];
  }

  if (reportType === 'customerCarts') {
    const out: any[][] = [['Cari Kodu', 'Cari Adi', 'Kullanici', 'Kalem Sayisi', 'Sepet Tutar', 'Urun Kodu', 'Urun Adi', 'Miktar', 'Birim Fiyat', 'Satir Tutar']];
    rows.forEach((row) => {
      const items = Array.isArray(row.items) && row.items.length ? row.items : [null];
      items.forEach((item: any) => {
        out.push([
          cell(row.customerCode),
          cell(row.customerName),
          cell(row.userName),
          cell(row.itemCount),
          cell(row.totalAmount),
          cell(item?.productCode),
          cell(item?.productName),
          cell(item?.quantity),
          cell(item?.unitPrice),
          cell(item?.totalPrice),
        ]);
      });
    });
    return out;
  }

  if (reportType === 'actionRadar') {
    return [
      ['Grup', 'Baslik', 'Alt Baslik', 'Detay', 'Aksiyon'],
      ...rows.map((row: ActionRadarItem) => [
        cell(row.group),
        cell(row.title),
        cell(row.subtitle),
        cell(row.meta),
        cell(row.actionLabel),
      ]),
    ];
  }

  return genericRows(rows);
};

const flattenActionRadar = (snapshot: any): ActionRadarItem[] => {
  if (!snapshot) return [];
  const rows: ActionRadarItem[] = [];

  for (const quote of snapshot.quoteHealth?.rows || []) {
    rows.push({
      id: `quote-${quote.id}`,
      group: 'Teklif Saglik',
      title: quote.quoteNumber || 'Teklif',
      subtitle: quote.customerName || quote.customerCode || undefined,
      meta: [quote.issue || 'Kontrol gerekli', `Tutar: ${formatMoney(quote.grandTotal)}`, `Kalem: ${quote.itemCount ?? '-'}`],
      tone: quote.issue?.toLowerCase?.().includes('gecmis') ? 'red' : 'amber',
      actionLabel: 'Teklifi ac',
      action: quote.id ? { type: 'quoteDetail', quoteId: quote.id } : { type: 'none' },
    });
  }

  for (const cart of snapshot.abandonedCarts?.rows || []) {
    rows.push({
      id: `cart-${cart.cartId}`,
      group: 'Terk Sepet',
      title: cart.customerName || cart.customerCode || 'Cari',
      subtitle: cart.customerCode || undefined,
      meta: [`Bekleme: ${cart.daysIdle ?? 0} gun`, `Kalem: ${cart.itemCount ?? 0}`, `Tutar: ${formatMoney(cart.totalAmount)}`],
      tone: Number(cart.daysIdle || 0) >= 7 ? 'red' : 'amber',
      actionLabel: 'Sepet raporu',
      action: { type: 'cartReport', search: cart.customerCode || cart.customerName },
    });
  }

  const missingImageProducts = [
    ...(snapshot.imageQuality?.missingImageProducts || []),
    ...(snapshot.catalogScore?.samples?.missingImages || []),
  ].filter((product, index, source) => {
    const key = product?.id || product?.mikroCode || product?.productCode || product?.name;
    if (!key) return index === source.indexOf(product);
    return source.findIndex((row) => (row?.id || row?.mikroCode || row?.productCode || row?.name) === key) === index;
  });

  for (const product of missingImageProducts) {
    rows.push({
      id: `image-${product.id || product.mikroCode || product.productCode}`,
      group: 'Gorsel Kalite',
      title: product.name || product.productName || product.mikroCode || product.productCode || 'Urun',
      subtitle: product.mikroCode || product.productCode || undefined,
      meta: [`Populerlik: ${Number(product.popularSalesValue || 0).toLocaleString('tr-TR')}`, 'Eksik gorsel'],
      tone: 'amber',
      actionLabel: 'Gorsel yukle',
      action: {
        type: 'products',
        search: product.mikroCode || product.productCode,
        qualityFilter: 'NO_IMAGE',
        detailTab: 'IMAGE',
        autoOpenFirst: true,
      },
    });
  }

  const missingImageTotal = Number(snapshot.catalogScore?.summary?.missingImageCount ?? snapshot.imageQuality?.summary?.missingImageCount ?? 0);
  if (missingImageTotal > missingImageProducts.length) {
    rows.push({
      id: 'image-more',
      group: 'Gorsel Kalite',
      title: `${missingImageTotal - missingImageProducts.length} ek eksik gorselli urun`,
      subtitle: 'Tum liste icin filtreli urun ekranina gecin',
      meta: [`Toplam: ${missingImageTotal}`, `Ornek: ${missingImageProducts.length}`],
      tone: 'amber',
      actionLabel: 'Tumunu ac',
      action: { type: 'products', qualityFilter: 'NO_IMAGE', detailTab: 'IMAGE' },
    });
  }

  const missingCategoryProducts = snapshot.catalogScore?.samples?.missingCategories || [];
  for (const product of missingCategoryProducts) {
    rows.push({
      id: `catalog-category-${product.id || product.mikroCode}`,
      group: 'Katalog Skoru',
      title: product.name || product.mikroCode || 'Urun',
      subtitle: product.mikroCode || undefined,
      meta: ['Kategori eksik', `Skor: ${snapshot.catalogScore?.summary?.score ?? '-'}/100`],
      tone: 'amber',
      actionLabel: 'Urun karti',
      action: { type: 'products', search: product.mikroCode, qualityFilter: 'BAD', autoOpenFirst: true },
    });
  }

  const missingCategoryTotal = Number(snapshot.catalogScore?.summary?.missingCategoryCount || 0);
  if (missingCategoryTotal > missingCategoryProducts.length) {
    rows.push({
      id: 'catalog-category-more',
      group: 'Katalog Skoru',
      title: `${missingCategoryTotal - missingCategoryProducts.length} ek kategori eksigi`,
      subtitle: 'Filtreli urun listesinde toplu kontrol edin',
      meta: [`Toplam: ${missingCategoryTotal}`, `Ornek: ${missingCategoryProducts.length}`],
      tone: 'amber',
      actionLabel: 'Urunler',
      action: { type: 'products', qualityFilter: 'BAD' },
    });
  }

  const invalidUnitProducts = snapshot.catalogScore?.samples?.invalidUnits || [];
  for (const product of invalidUnitProducts) {
    rows.push({
      id: `catalog-unit-${product.id || product.mikroCode}`,
      group: 'Katalog Skoru',
      title: product.name || product.mikroCode || 'Urun',
      subtitle: product.mikroCode || undefined,
      meta: ['Birim kontrolu', `Skor: ${snapshot.catalogScore?.summary?.score ?? '-'}/100`],
      tone: 'red',
      actionLabel: 'Urun karti',
      action: { type: 'products', search: product.mikroCode, qualityFilter: 'BAD', detailTab: 'STOCK', autoOpenFirst: true },
    });
  }

  const invalidUnitTotal = Number(snapshot.catalogScore?.summary?.invalidUnitCount || 0);
  if (invalidUnitTotal > invalidUnitProducts.length) {
    rows.push({
      id: 'catalog-unit-more',
      group: 'Katalog Skoru',
      title: `${invalidUnitTotal - invalidUnitProducts.length} ek birim kontrolu`,
      subtitle: 'Urun kartlarinda birim/katsayi kontrolu yapin',
      meta: [`Toplam: ${invalidUnitTotal}`, `Ornek: ${invalidUnitProducts.length}`],
      tone: 'red',
      actionLabel: 'Urunler',
      action: { type: 'products', qualityFilter: 'BAD' },
    });
  }

  const invalidVatProducts = snapshot.catalogScore?.samples?.invalidVat || [];
  for (const product of invalidVatProducts) {
    rows.push({
      id: `catalog-vat-${product.id || product.mikroCode}`,
      group: 'Katalog Skoru',
      title: product.name || product.mikroCode || 'Urun',
      subtitle: product.mikroCode || undefined,
      meta: ['KDV kontrolu', `Skor: ${snapshot.catalogScore?.summary?.score ?? '-'}/100`],
      tone: 'red',
      actionLabel: 'Urun karti',
      action: { type: 'products', search: product.mikroCode, qualityFilter: 'BAD', autoOpenFirst: true },
    });
  }

  const invalidVatTotal = Number(snapshot.catalogScore?.summary?.invalidVatCount || 0);
  if (invalidVatTotal > invalidVatProducts.length) {
    rows.push({
      id: 'catalog-vat-more',
      group: 'Katalog Skoru',
      title: `${invalidVatTotal - invalidVatProducts.length} ek KDV kontrolu`,
      subtitle: 'Urun kartlarinda KDV verisini kontrol edin',
      meta: [`Toplam: ${invalidVatTotal}`, `Ornek: ${invalidVatProducts.length}`],
      tone: 'red',
      actionLabel: 'Urunler',
      action: { type: 'products', qualityFilter: 'BAD' },
    });
  }

  for (const visit of snapshot.fieldVisitPlanner?.rows || []) {
    rows.push({
      id: `visit-${visit.customerId}`,
      group: 'Saha Ziyaret',
      title: visit.customerName || visit.customerCode || 'Cari',
      subtitle: visit.customerCode || undefined,
      meta: [
        `Skor: ${visit.priorityScore ?? 0}`,
        visit.suggestedAction || 'Ziyaret planla',
        `Vade: ${formatMoney(visit.pastDueBalance)}`,
        `Sepet: ${formatMoney(visit.cartAmount)}`,
      ],
      tone: Number(visit.priorityScore || 0) >= 60 ? 'red' : 'amber',
      actionLabel: 'Saha ac',
      action: visit.customerCode ? { type: 'fieldSales', customerIdOrCode: visit.customerCode } : { type: 'none' },
    });
  }

  for (const bundle of snapshot.bundlePerformance?.rows || []) {
    rows.push({
      id: `bundle-performance-${bundle.bundleName}`,
      group: 'Paket Performans',
      title: bundle.bundleName || 'Paket',
      subtitle: 'Son 90 gun paket satisi',
      meta: [`Satir: ${bundle.lineCount ?? 0}`, `Miktar: ${bundle.quantity ?? 0}`, `Tutar: ${formatMoney(bundle.amount)}`],
      tone: Number(bundle.lineCount || 0) > 0 ? 'green' : 'default',
      actionLabel: 'Paketler',
      action: { type: 'bundles' },
    });
  }

  for (const bundle of snapshot.bundleSuggestions?.rows || []) {
    rows.push({
      id: `bundle-${bundle.title}`,
      group: 'Paket Onerici',
      title: bundle.title || 'Paket onerisi',
      subtitle: bundle.reason || undefined,
      meta: [`Skor: ${bundle.score ?? 0}`],
      tone: 'green',
      actionLabel: 'Paketler',
      action: { type: 'bundles' },
    });
  }

  const complementSummary = snapshot.complementHealth?.summary;
  if (complementSummary && Number(complementSummary.productsWithoutComplements || 0) > 0) {
    rows.push({
      id: 'complement-coverage',
      group: 'Tamamlayici Motor',
      title: 'Tamamlayicisi olmayan urunler',
      subtitle: `Kapsama: ${complementSummary.coveragePct ?? 0}%`,
      meta: [
        `Bos kalan: ${complementSummary.productsWithoutComplements ?? 0}`,
        `Oto: ${complementSummary.autoRecommendations ?? 0}`,
        `Manuel: ${complementSummary.manualRecommendations ?? 0}`,
      ],
      tone: Number(complementSummary.coveragePct || 0) >= 80 ? 'green' : 'amber',
      actionLabel: 'Yonet',
      action: { type: 'complementManagement' },
    });
  }

  const anomaly = snapshot.anomalyRadar?.summary;
  if (anomaly) {
    const anomalyRows = [
      {
        key: 'expired-quotes',
        count: anomaly.expiredOpenQuotes,
        title: 'Suresi gecen acik teklifler',
        actionLabel: 'Teklifler',
        action: { type: 'quotes' } as ActionRadarItem['action'],
        tone: 'red' as const,
      },
      {
        key: 'stale-orders',
        count: anomaly.stalePendingOrders,
        title: 'Bekleyen siparis anomalisi',
        actionLabel: 'Siparis takip',
        action: { type: 'orderTracking' } as ActionRadarItem['action'],
        tone: 'amber' as const,
      },
      {
        key: 'stale-carts',
        count: anomaly.staleCarts,
        title: 'Eski sepetler',
        actionLabel: 'Sepet raporu',
        action: { type: 'cartReport' } as ActionRadarItem['action'],
        tone: 'amber' as const,
      },
      {
        key: 'catalog-blocked',
        count: anomaly.catalogBlockedChecks,
        title: 'Kritik katalog kontrolu',
        actionLabel: 'Urunler',
        action: { type: 'products', qualityFilter: 'BAD' } as ActionRadarItem['action'],
        tone: 'red' as const,
      },
    ];
    for (const item of anomalyRows) {
      if (Number(item.count || 0) <= 0) continue;
      rows.push({
        id: `anomaly-${item.key}`,
        group: 'Anomali Radar',
        title: item.title,
        subtitle: `${item.count} kayit kontrol bekliyor`,
        meta: [`Adet: ${item.count}`],
        tone: item.tone,
        actionLabel: item.actionLabel,
        action: item.action,
      });
    }
  }

  return rows;
};

export function ReportsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const route = useRoute<RouteProp<PortalStackParamList, 'Reports'>>();
  const { width } = useWindowDimensions();
  const listColumns = width >= 900 ? 2 : 1;
  const [reportType, setReportType] = useState<ReportType>(route.params?.initialReport || 'cost');

  const [costData, setCostData] = useState<CostUpdateAlert[]>([]);
  const [costSummary, setCostSummary] = useState<CostUpdateSummary | null>(null);
  const [costLoading, setCostLoading] = useState(false);
  const [costError, setCostError] = useState<string | null>(null);
  const [dayDiff, setDayDiff] = useState('');
  const [percentDiff, setPercentDiff] = useState('');

  const [marginData, setMarginData] = useState<MarginComplianceRow[]>([]);
  const [marginSummary, setMarginSummary] = useState<any>(null);
  const [marginLoading, setMarginLoading] = useState(false);
  const [marginError, setMarginError] = useState<string | null>(null);
  const [marginStatus, setMarginStatus] = useState('');
  const [marginStartDate, setMarginStartDate] = useState('');
  const [marginEndDate, setMarginEndDate] = useState('');

  const [priceData, setPriceData] = useState<PriceHistoryChange[]>([]);
  const [priceSummary, setPriceSummary] = useState<any>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [priceSearch, setPriceSearch] = useState('');
  const [priceStartDate, setPriceStartDate] = useState('');
  const [priceEndDate, setPriceEndDate] = useState('');

  const [priceNewData, setPriceNewData] = useState<any[]>([]);
  const [priceNewSummary, setPriceNewSummary] = useState<any>(null);
  const [priceNewLoading, setPriceNewLoading] = useState(false);
  const [priceNewError, setPriceNewError] = useState<string | null>(null);
  const [priceNewSearch, setPriceNewSearch] = useState('');

  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [topProductsSummary, setTopProductsSummary] = useState<any>(null);
  const [topProductsLoading, setTopProductsLoading] = useState(false);
  const [topProductsError, setTopProductsError] = useState<string | null>(null);
  const [topProductsStartDate, setTopProductsStartDate] = useState('');
  const [topProductsEndDate, setTopProductsEndDate] = useState('');

  const [topCustomers, setTopCustomers] = useState<any[]>([]);
  const [topCustomersSummary, setTopCustomersSummary] = useState<any>(null);
  const [topCustomersLoading, setTopCustomersLoading] = useState(false);
  const [topCustomersError, setTopCustomersError] = useState<string | null>(null);
  const [topCustomersStartDate, setTopCustomersStartDate] = useState('');
  const [topCustomersEndDate, setTopCustomersEndDate] = useState('');

  const [productCustomers, setProductCustomers] = useState<any[]>([]);
  const [productCustomersSummary, setProductCustomersSummary] = useState<any>(null);
  const [productCustomersLoading, setProductCustomersLoading] = useState(false);
  const [productCustomersError, setProductCustomersError] = useState<string | null>(null);
  const [productCustomerCode, setProductCustomerCode] = useState('');

  const [complementRows, setComplementRows] = useState<any[]>([]);
  const [complementSummary, setComplementSummary] = useState<any>(null);
  const [complementLoading, setComplementLoading] = useState(false);
  const [complementError, setComplementError] = useState<string | null>(null);
  const [complementMode, setComplementMode] = useState<'product' | 'customer'>('product');
  const [complementMatchMode, setComplementMatchMode] = useState<'product' | 'category' | 'group'>('product');
  const [complementProductCode, setComplementProductCode] = useState('');
  const [complementCustomerCode, setComplementCustomerCode] = useState('');

  const [activityRows, setActivityRows] = useState<any[]>([]);
  const [activitySummary, setActivitySummary] = useState<any>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityStartDate, setActivityStartDate] = useState('');
  const [activityEndDate, setActivityEndDate] = useState('');
  const [activityCustomerCode, setActivityCustomerCode] = useState('');
  const [activityUserId, setActivityUserId] = useState('');

  const [cartRows, setCartRows] = useState<any[]>([]);
  const [cartSummary, setCartSummary] = useState<any>(null);
  const [cartLoading, setCartLoading] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);
  const [cartSearch, setCartSearch] = useState('');
  const [cartIncludeEmpty, setCartIncludeEmpty] = useState(false);
  const [expandedCartId, setExpandedCartId] = useState<string | null>(null);
  const [clearingCartId, setClearingCartId] = useState<string | null>(null);

  const [actionRadarData, setActionRadarData] = useState<any | null>(null);
  const [actionRadarRows, setActionRadarRows] = useState<ActionRadarItem[]>([]);
  const [actionRadarGroup, setActionRadarGroup] = useState('ALL');
  const [actionRadarLoading, setActionRadarLoading] = useState(false);
  const [actionRadarError, setActionRadarError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const cartRequestSeqRef = useRef(0);
  const actionRadarRequestSeqRef = useRef(0);
  const clearingCartRef = useRef<string | null>(null);

  const fetchCost = async () => {
    setCostLoading(true);
    setCostError(null);
    try {
      const response = await adminApi.getCostUpdateAlerts({
        dayDiff: dayDiff ? Number(dayDiff) : undefined,
        percentDiff: percentDiff ? Number(percentDiff) : undefined,
        page: 1,
        limit: 50,
      });
      if (response.success) {
        setCostData(response.data.products || []);
        setCostSummary(response.data.summary || null);
      }
    } catch (err: any) {
      setCostError(getApiErrorMessage(err, 'Rapor yuklenemedi.'));
    } finally {
      setCostLoading(false);
    }
  };

  const fetchMargin = async () => {
    setMarginLoading(true);
    setMarginError(null);
    try {
      const response = await adminApi.getMarginComplianceReport({
        startDate: marginStartDate ? marginStartDate.replace(/-/g, '') : undefined,
        endDate: marginEndDate ? marginEndDate.replace(/-/g, '') : undefined,
        includeCompleted: 1,
        page: 1,
        limit: 50,
        sortBy: 'OrtalamaKarYuzde',
        sortOrder: 'desc',
        status: marginStatus || undefined,
      });
      if (response.success) {
        setMarginData(response.data.data || []);
        setMarginSummary(response.data.summary || null);
      }
    } catch (err: any) {
      setMarginError(getApiErrorMessage(err, 'Rapor yuklenemedi.'));
    } finally {
      setMarginLoading(false);
    }
  };

  const fetchPrice = async () => {
    setPriceLoading(true);
    setPriceError(null);
    try {
      const response = await adminApi.getPriceHistory({
        page: 1,
        limit: 50,
        sortBy: 'changeDate',
        sortOrder: 'desc',
        productName: priceSearch || undefined,
        startDate: priceStartDate || undefined,
        endDate: priceEndDate || undefined,
      });
      if (response.success) {
        setPriceData(response.data.changes || []);
        setPriceSummary(response.data.summary || null);
      }
    } catch (err: any) {
      setPriceError(getApiErrorMessage(err, 'Rapor yuklenemedi.'));
    } finally {
      setPriceLoading(false);
    }
  };

  const fetchPriceNew = async () => {
    setPriceNewLoading(true);
    setPriceNewError(null);
    try {
      const response = await adminApi.getPriceHistoryNew({
        productName: priceNewSearch || undefined,
        page: 1,
        limit: 50,
      });
      if (response.success) {
        setPriceNewData(response.data.products || []);
      }
      const summary = await adminApi.getPriceSummaryStats();
      if (summary.success) {
        setPriceNewSummary(summary.data || null);
      }
    } catch (err: any) {
      setPriceNewError(getApiErrorMessage(err, 'Rapor yuklenemedi.'));
    } finally {
      setPriceNewLoading(false);
    }
  };

  const fetchTopProducts = async () => {
    setTopProductsLoading(true);
    setTopProductsError(null);
    try {
      const response = await adminApi.getTopProducts({
        startDate: topProductsStartDate || undefined,
        endDate: topProductsEndDate || undefined,
        page: 1,
        limit: 50,
      });
      if (response.success) {
        setTopProducts(response.data.products || []);
        setTopProductsSummary(response.data.summary || null);
      }
    } catch (err: any) {
      setTopProductsError(getApiErrorMessage(err, 'Rapor yuklenemedi.'));
    } finally {
      setTopProductsLoading(false);
    }
  };

  const fetchTopCustomers = async () => {
    setTopCustomersLoading(true);
    setTopCustomersError(null);
    try {
      const response = await adminApi.getTopCustomers({
        startDate: topCustomersStartDate || undefined,
        endDate: topCustomersEndDate || undefined,
        page: 1,
        limit: 50,
      });
      if (response.success) {
        setTopCustomers(response.data.customers || []);
        setTopCustomersSummary(response.data.summary || null);
      }
    } catch (err: any) {
      setTopCustomersError(getApiErrorMessage(err, 'Rapor yuklenemedi.'));
    } finally {
      setTopCustomersLoading(false);
    }
  };

  const fetchProductCustomers = async () => {
    if (!productCustomerCode.trim()) return;
    setProductCustomersLoading(true);
    setProductCustomersError(null);
    try {
      const response = await adminApi.getProductCustomers({
        productCode: productCustomerCode.trim(),
        page: 1,
        limit: 50,
      });
      if (response.success) {
        setProductCustomers(response.data.customers || []);
        setProductCustomersSummary(response.data.summary || null);
      }
    } catch (err: any) {
      setProductCustomersError(getApiErrorMessage(err, 'Rapor yuklenemedi.'));
    } finally {
      setProductCustomersLoading(false);
    }
  };

  const fetchComplementMissing = async () => {
    setComplementLoading(true);
    setComplementError(null);
    try {
      const response = await adminApi.getComplementMissingReport({
        mode: complementMode,
        matchMode: complementMatchMode,
        productCode: complementMode === 'product' ? complementProductCode.trim() || undefined : undefined,
        customerCode: complementMode === 'customer' ? complementCustomerCode.trim() || undefined : undefined,
        periodMonths: 6,
        page: 1,
        limit: 50,
      });
      if (response.success) {
        setComplementRows(response.data.rows || []);
        setComplementSummary(response.data.summary || null);
      }
    } catch (err: any) {
      setComplementError(getApiErrorMessage(err, 'Rapor yuklenemedi.'));
    } finally {
      setComplementLoading(false);
    }
  };

  const fetchCustomerActivity = async () => {
    setActivityLoading(true);
    setActivityError(null);
    try {
      const response = await adminApi.getCustomerActivityReport({
        startDate: activityStartDate || undefined,
        endDate: activityEndDate || undefined,
        customerCode: activityCustomerCode.trim() || undefined,
        userId: activityUserId.trim() || undefined,
        page: 1,
        limit: 50,
      });
      if (response.success) {
        setActivityRows(response.data.events || []);
        setActivitySummary(response.data.summary || null);
      }
    } catch (err: any) {
      setActivityError(getApiErrorMessage(err, 'Rapor yuklenemedi.'));
    } finally {
      setActivityLoading(false);
    }
  };

  const fetchCustomerCarts = async (override?: { search?: string }) => {
    const requestSeq = cartRequestSeqRef.current + 1;
    cartRequestSeqRef.current = requestSeq;
    setCartLoading(true);
    setCartError(null);
    try {
      const effectiveSearch = override?.search ?? cartSearch;
      const response = await adminApi.getCustomerCartsReport({
        search: effectiveSearch.trim() || undefined,
        includeEmpty: cartIncludeEmpty,
        page: 1,
        limit: 50,
      });
      if (response.success) {
        const carts = response.data?.carts || [];
        if (requestSeq === cartRequestSeqRef.current) {
          setCartRows(carts);
          setCartSummary({
            total: response.data?.pagination?.totalRecords ?? carts.length,
          });
        }
      }
    } catch (err: any) {
      if (requestSeq === cartRequestSeqRef.current) {
        setCartError(getApiErrorMessage(err, 'Rapor yuklenemedi.'));
      }
    } finally {
      if (requestSeq === cartRequestSeqRef.current) {
        setCartLoading(false);
      }
    }
  };

  const fetchActionRadar = async () => {
    const requestSeq = actionRadarRequestSeqRef.current + 1;
    actionRadarRequestSeqRef.current = requestSeq;
    setActionRadarLoading(true);
    setActionRadarError(null);
    try {
      const response = await adminApi.getActionRadar();
      if (response.success) {
        const snapshot = response.data || null;
        const rows = flattenActionRadar(snapshot);
        if (requestSeq === actionRadarRequestSeqRef.current) {
          setActionRadarData(snapshot);
          setActionRadarRows(rows);
          setActionRadarGroup((current) => {
            if (current === 'ALL') return current;
            return rows.some((row) => row.group === current) ? current : 'ALL';
          });
        }
      }
    } catch (err: any) {
      if (requestSeq === actionRadarRequestSeqRef.current) {
        setActionRadarError(getApiErrorMessage(err, 'Aksiyon radari yuklenemedi.'));
        setActionRadarRows([]);
      }
    } finally {
      if (requestSeq === actionRadarRequestSeqRef.current) {
        setActionRadarLoading(false);
      }
    }
  };

  const clearCustomerCart = (cart: any) => {
    if (clearingCartRef.current) return;
    if (!cart?.cartId || Number(cart.itemCount || 0) <= 0) return;
    Alert.alert(
      'Sepeti temizle',
      `${cart.customerName || cart.customerCode || 'Cari'} sepetindeki ${cart.itemCount || 0} kalem silinsin mi?`,
      [
        { text: 'Vazgec', style: 'cancel' },
        {
          text: 'Temizle',
          style: 'destructive',
          onPress: async () => {
            if (clearingCartRef.current) return;
            clearingCartRef.current = cart.cartId;
            setClearingCartId(cart.cartId);
            try {
              await adminApi.clearCustomerCart(cart.cartId);
              setCartRows((rows) =>
                rows.map((row) =>
                  row.cartId === cart.cartId
                    ? { ...row, itemCount: 0, totalQuantity: 0, totalAmount: 0, items: [] }
                    : row
                )
              );
              setExpandedCartId(null);
            } catch (err: any) {
              Alert.alert('Sepet temizlenemedi', getApiErrorMessage(err, 'Islem tamamlanamadi.'));
            } finally {
              clearingCartRef.current = null;
              setClearingCartId(null);
            }
          },
        },
      ]
    );
  };

  const openActionRadarItem = (item: ActionRadarItem) => {
    if (item.action.type === 'quoteDetail' && item.action.quoteId) {
      navigation.navigate('QuoteDetail', { quoteId: item.action.quoteId });
      return;
    }
    if (item.action.type === 'quotes') {
      navigation.navigate('Tabs', { screen: 'Quotes' });
      return;
    }
    if (item.action.type === 'cartReport') {
      const search = item.action.search || '';
      setCartSearch(search);
      setReportType('customerCarts');
      fetchCustomerCarts({ search });
      return;
    }
    if (item.action.type === 'productSearch' && item.action.productCode) {
      navigation.navigate('Search', { mode: 'stocks', term: item.action.productCode, autoRun: true });
      return;
    }
    if (item.action.type === 'products') {
      navigation.navigate('Products', {
        search: item.action.search,
        qualityFilter: item.action.qualityFilter,
        detailTab: item.action.detailTab,
        autoOpenFirst: item.action.autoOpenFirst,
      });
      return;
    }
    if (item.action.type === 'customerDetail' && item.action.customerId) {
      navigation.navigate('Customer360', { customerIdOrCode: item.action.customerId });
      return;
    }
    if (item.action.type === 'fieldSales') {
      navigation.navigate('FieldSales', { customerIdOrCode: item.action.customerIdOrCode });
      return;
    }
    if (item.action.type === 'orderTracking') {
      navigation.navigate('OrderTracking');
      return;
    }
    if (item.action.type === 'complementManagement') {
      navigation.navigate('ComplementManagement');
      return;
    }
    if (item.action.type === 'bundles') {
      navigation.navigate('Bundles');
    }
  };

  useEffect(() => {
    const nextReportType = route.params?.initialReport;
    if (nextReportType && nextReportType !== reportType) {
      setReportType(nextReportType);
    }
  }, [reportType, route.params?.initialReport]);

  useEffect(() => {
    if (reportType === 'cost' && costData.length === 0 && !costLoading) {
      fetchCost();
    }
    if ((reportType === 'margin' || reportType === 'profit') && marginData.length === 0 && !marginLoading) {
      fetchMargin();
    }
    if (reportType === 'price' && priceData.length === 0 && !priceLoading) {
      fetchPrice();
    }
    if (reportType === 'priceNew' && priceNewData.length === 0 && !priceNewLoading) {
      fetchPriceNew();
    }
    if (reportType === 'topProducts' && topProducts.length === 0 && !topProductsLoading) {
      fetchTopProducts();
    }
    if (reportType === 'topCustomers' && topCustomers.length === 0 && !topCustomersLoading) {
      fetchTopCustomers();
    }
    if (reportType === 'complementMissing' && complementRows.length === 0 && !complementLoading) {
      fetchComplementMissing();
    }
    if (reportType === 'customerActivity' && activityRows.length === 0 && !activityLoading) {
      fetchCustomerActivity();
    }
    if (reportType === 'customerCarts' && cartRows.length === 0 && !cartLoading) {
      fetchCustomerCarts();
    }
    if (reportType === 'actionRadar' && actionRadarRows.length === 0 && !actionRadarLoading) {
      fetchActionRadar();
    }
  }, [reportType]);

  const actionRadarGroupCounts = useMemo(() => {
    const counts = actionRadarRows.reduce((acc: Record<string, number>, row) => {
      acc[row.group] = (acc[row.group] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [actionRadarRows]);

  const filteredActionRadarRows = useMemo(() => {
    if (actionRadarGroup === 'ALL') return actionRadarRows;
    return actionRadarRows.filter((row) => row.group === actionRadarGroup);
  }, [actionRadarGroup, actionRadarRows]);

  const data =
    reportType === 'cost'
      ? costData
      : reportType === 'margin' || reportType === 'profit'
        ? marginData
        : reportType === 'price'
          ? priceData
          : reportType === 'priceNew'
            ? priceNewData
          : reportType === 'topProducts'
            ? topProducts
            : reportType === 'topCustomers'
              ? topCustomers
              : reportType === 'productCustomers'
                ? productCustomers
                : reportType === 'complementMissing'
                  ? complementRows
                  : reportType === 'customerActivity'
                  ? activityRows
                    : reportType === 'customerCarts'
                      ? cartRows
                      : filteredActionRadarRows;

  const exportCurrentReport = async () => {
    if (exporting) return;
    const currentRows = data as any[];
    if (!currentRows.length) {
      Alert.alert('Bilgi', 'Disa aktarilacak rapor satiri yok.');
      return;
    }

    setExporting(true);
    try {
      const sheetRows = buildReportSheetRows(reportType, currentRows);
      if (!sheetRows.length || !sheetRows[0]?.length) {
        Alert.alert('Bilgi', 'Bu rapor icin Excel satiri olusturulamadi.');
        return;
      }

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(sheetRows);
      ws['!cols'] = sheetRows[0].map((title: any) => ({
        wch: Math.min(Math.max(String(title || '').length + 5, 12), 42),
      }));
      XLSX.utils.book_append_sheet(wb, ws, reportTitles[reportType].slice(0, 31));

      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
      const fileName = `${reportType}-${stamp}.xlsx`;
      const dir = `${FileSystem.documentDirectory}reports/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const target = `${dir}${fileName}`;
      await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(target, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: `${reportTitles[reportType]} Excel`,
        });
      } else {
        Alert.alert('Excel olusturuldu', target);
      }
    } catch (err: any) {
      Alert.alert('Excel olusturulamadi', getApiErrorMessage(err, 'Islem tamamlanamadi.'));
    } finally {
      setExporting(false);
    }
  };

  const headerContent = useMemo(() => {
    if (reportType === 'cost') {
      return (
        <View style={styles.headerSection}>
          <Text style={styles.sectionTitle}>Maliyet Guncelleme</Text>
          <Text style={styles.sectionSubtitle}>Maliyeti geriden gelen urunler.</Text>
          <View style={styles.filterRow}>
            <TextInput
              style={styles.input}
              placeholder="Gun farki"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              value={dayDiff}
              onChangeText={setDayDiff}
            />
            <TextInput
              style={styles.input}
              placeholder="Yuzde farki"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              value={percentDiff}
              onChangeText={setPercentDiff}
            />
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={fetchCost}>
            <Text style={styles.primaryButtonText}>Raporu Yenile</Text>
          </TouchableOpacity>
          {costSummary && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>Kayit: {costSummary.totalAlerts}</Text>
              <Text style={styles.summaryText}>Risk: {costSummary.totalRiskAmount.toFixed(2)} TL</Text>
              <Text style={styles.summaryText}>Ortalama: {costSummary.avgDiffPercent.toFixed(2)}%</Text>
            </View>
          )}
          {costError && <Text style={styles.error}>{costError}</Text>}
        </View>
      );
    }

    if (reportType === 'margin' || reportType === 'profit') {
      return (
        <View style={styles.headerSection}>
          <Text style={styles.sectionTitle}>Kar Marji Analizi</Text>
          <Text style={styles.sectionSubtitle}>Siparis ve fatura marj kontrolu.</Text>
          <View style={styles.filterRow}>
            <TextInput
              style={styles.input}
              placeholder="Baslangic (YYYY-MM-DD)"
              placeholderTextColor={colors.textMuted}
              value={marginStartDate}
              onChangeText={setMarginStartDate}
            />
            <TextInput
              style={styles.input}
              placeholder="Bitis (YYYY-MM-DD)"
              placeholderTextColor={colors.textMuted}
              value={marginEndDate}
              onChangeText={setMarginEndDate}
            />
          </View>
          <View style={styles.filterRow}>
            <TextInput
              style={styles.input}
              placeholder="Durum (HIGH/LOW/NEGATIVE/OK)"
              placeholderTextColor={colors.textMuted}
              value={marginStatus}
              onChangeText={setMarginStatus}
            />
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={fetchMargin}>
            <Text style={styles.primaryButtonText}>Raporu Yenile</Text>
          </TouchableOpacity>
          {marginSummary && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>Kayit: {marginSummary.totalRecords}</Text>
              <Text style={styles.summaryText}>Ortalama: {marginSummary.avgMargin?.toFixed?.(2) ?? '-'}%</Text>
            </View>
          )}
          {marginError && <Text style={styles.error}>{marginError}</Text>}
        </View>
      );
    }

    if (reportType === 'price') {
      return (
        <View style={styles.headerSection}>
          <Text style={styles.sectionTitle}>Fiyat Degisimleri</Text>
          <Text style={styles.sectionSubtitle}>Liste bazli degisim raporu.</Text>
          <View style={styles.filterRow}>
            <TextInput
              style={styles.input}
              placeholder="Urun adi"
              placeholderTextColor={colors.textMuted}
              value={priceSearch}
              onChangeText={setPriceSearch}
            />
          </View>
          <View style={styles.filterRow}>
            <TextInput
              style={styles.input}
              placeholder="Baslangic (YYYY-MM-DD)"
              placeholderTextColor={colors.textMuted}
              value={priceStartDate}
              onChangeText={setPriceStartDate}
            />
            <TextInput
              style={styles.input}
              placeholder="Bitis (YYYY-MM-DD)"
              placeholderTextColor={colors.textMuted}
              value={priceEndDate}
              onChangeText={setPriceEndDate}
            />
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={fetchPrice}>
            <Text style={styles.primaryButtonText}>Raporu Yenile</Text>
          </TouchableOpacity>
          {priceSummary && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>Degisim: {priceSummary.totalChanges}</Text>
              <Text style={styles.summaryText}>Tutarlilik: {priceSummary.consistencyRate?.toFixed?.(1) ?? '-'}%</Text>
            </View>
          )}
          {priceError && <Text style={styles.error}>{priceError}</Text>}
        </View>
      );
    }

    if (reportType === 'priceNew') {
      return (
        <View style={styles.headerSection}>
          <Text style={styles.sectionTitle}>Fiyat Degisimi (Yeni)</Text>
          <Text style={styles.sectionSubtitle}>PostgreSQL fiyat listesi.</Text>
          <TextInput
            style={styles.input}
            placeholder="Urun adi"
            placeholderTextColor={colors.textMuted}
            value={priceNewSearch}
            onChangeText={setPriceNewSearch}
          />
          <TouchableOpacity style={styles.primaryButton} onPress={fetchPriceNew}>
            <Text style={styles.primaryButtonText}>Raporu Yenile</Text>
          </TouchableOpacity>
          {priceNewSummary && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>Urun: {priceNewSummary.totalProducts}</Text>
              <Text style={styles.summaryText}>Degisim: {priceNewSummary.totalChanges}</Text>
            </View>
          )}
          {priceNewError && <Text style={styles.error}>{priceNewError}</Text>}
        </View>
      );
    }

    if (reportType === 'topProducts') {
      return (
        <View style={styles.headerSection}>
          <Text style={styles.sectionTitle}>Top Urunler</Text>
          <Text style={styles.sectionSubtitle}>Ciro ve kar listesi.</Text>
          <View style={styles.filterRow}>
            <TextInput
              style={styles.input}
              placeholder="Baslangic (YYYY-MM-DD)"
              placeholderTextColor={colors.textMuted}
              value={topProductsStartDate}
              onChangeText={setTopProductsStartDate}
            />
            <TextInput
              style={styles.input}
              placeholder="Bitis (YYYY-MM-DD)"
              placeholderTextColor={colors.textMuted}
              value={topProductsEndDate}
              onChangeText={setTopProductsEndDate}
            />
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={fetchTopProducts}>
            <Text style={styles.primaryButtonText}>Raporu Yenile</Text>
          </TouchableOpacity>
          {topProductsSummary && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>Urun: {topProductsSummary.totalProducts}</Text>
              <Text style={styles.summaryText}>Ciro: {topProductsSummary.totalRevenue?.toFixed?.(2) ?? '-'}</Text>
            </View>
          )}
          {topProductsError && <Text style={styles.error}>{topProductsError}</Text>}
        </View>
      );
    }

    if (reportType === 'topCustomers') {
      return (
        <View style={styles.headerSection}>
          <Text style={styles.sectionTitle}>Top Cariler</Text>
          <Text style={styles.sectionSubtitle}>Ciro ve kar listesi.</Text>
          <View style={styles.filterRow}>
            <TextInput
              style={styles.input}
              placeholder="Baslangic (YYYY-MM-DD)"
              placeholderTextColor={colors.textMuted}
              value={topCustomersStartDate}
              onChangeText={setTopCustomersStartDate}
            />
            <TextInput
              style={styles.input}
              placeholder="Bitis (YYYY-MM-DD)"
              placeholderTextColor={colors.textMuted}
              value={topCustomersEndDate}
              onChangeText={setTopCustomersEndDate}
            />
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={fetchTopCustomers}>
            <Text style={styles.primaryButtonText}>Raporu Yenile</Text>
          </TouchableOpacity>
          {topCustomersSummary && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>Cari: {topCustomersSummary.totalCustomers}</Text>
              <Text style={styles.summaryText}>Ciro: {topCustomersSummary.totalRevenue?.toFixed?.(2) ?? '-'}</Text>
            </View>
          )}
          {topCustomersError && <Text style={styles.error}>{topCustomersError}</Text>}
        </View>
      );
    }

    if (reportType === 'complementMissing') {
      return (
        <View style={styles.headerSection}>
          <Text style={styles.sectionTitle}>Tamamlayici Eksikler</Text>
          <Text style={styles.sectionSubtitle}>Eksik tamamlayici urun analizi.</Text>
          <View style={styles.filterRow}>
            <TouchableOpacity
              style={[styles.segmentButton, complementMode === 'product' && styles.segmentButtonActive]}
              onPress={() => setComplementMode('product')}
            >
              <Text style={complementMode === 'product' ? styles.segmentTextActive : styles.segmentText}>
                Urun
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentButton, complementMode === 'customer' && styles.segmentButtonActive]}
              onPress={() => setComplementMode('customer')}
            >
              <Text style={complementMode === 'customer' ? styles.segmentTextActive : styles.segmentText}>
                Cari
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.filterRow}>
            <TextInput
              style={styles.input}
              placeholder={complementMode === 'product' ? 'Urun kodu' : 'Cari kodu'}
              placeholderTextColor={colors.textMuted}
              value={complementMode === 'product' ? complementProductCode : complementCustomerCode}
              onChangeText={complementMode === 'product' ? setComplementProductCode : setComplementCustomerCode}
            />
            <TextInput
              style={styles.input}
              placeholder="Eslesme (product/category/group)"
              placeholderTextColor={colors.textMuted}
              value={complementMatchMode}
              onChangeText={(value) => {
                if (value === 'product' || value === 'category' || value === 'group') {
                  setComplementMatchMode(value);
                }
              }}
            />
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={fetchComplementMissing}>
            <Text style={styles.primaryButtonText}>Raporu Yenile</Text>
          </TouchableOpacity>
          {complementSummary && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>Kayit: {complementSummary.totalRows}</Text>
              <Text style={styles.summaryText}>Eksik: {complementSummary.totalMissing}</Text>
            </View>
          )}
          {complementError && <Text style={styles.error}>{complementError}</Text>}
        </View>
      );
    }

    if (reportType === 'customerActivity') {
      return (
        <View style={styles.headerSection}>
          <Text style={styles.sectionTitle}>Musteri Aktivitesi</Text>
          <Text style={styles.sectionSubtitle}>Sayfa/urun/sepet davranislari.</Text>
          <View style={styles.filterRow}>
            <TextInput
              style={styles.input}
              placeholder="Baslangic (YYYY-MM-DD)"
              placeholderTextColor={colors.textMuted}
              value={activityStartDate}
              onChangeText={setActivityStartDate}
            />
            <TextInput
              style={styles.input}
              placeholder="Bitis (YYYY-MM-DD)"
              placeholderTextColor={colors.textMuted}
              value={activityEndDate}
              onChangeText={setActivityEndDate}
            />
          </View>
          <View style={styles.filterRow}>
            <TextInput
              style={styles.input}
              placeholder="Cari kodu (opsiyonel)"
              placeholderTextColor={colors.textMuted}
              value={activityCustomerCode}
              onChangeText={setActivityCustomerCode}
            />
            <TextInput
              style={styles.input}
              placeholder="Kullanici ID (opsiyonel)"
              placeholderTextColor={colors.textMuted}
              value={activityUserId}
              onChangeText={setActivityUserId}
            />
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={fetchCustomerActivity}>
            <Text style={styles.primaryButtonText}>Raporu Yenile</Text>
          </TouchableOpacity>
          {activitySummary && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>Olay: {activitySummary.totalEvents}</Text>
              <Text style={styles.summaryText}>Tekil: {activitySummary.uniqueUsers}</Text>
              <Text style={styles.summaryText}>Arama: {activitySummary.searchCount}</Text>
            </View>
          )}
          {activityError && <Text style={styles.error}>{activityError}</Text>}
        </View>
      );
    }

    if (reportType === 'customerCarts') {
      return (
        <View style={styles.headerSection}>
          <Text style={styles.sectionTitle}>Musteri Sepetleri</Text>
          <Text style={styles.sectionSubtitle}>Sepette bekleyen urunleri inceleyin.</Text>
          <TextInput
            style={styles.input}
            placeholder="Cari/kullanici ara"
            placeholderTextColor={colors.textMuted}
            value={cartSearch}
            onChangeText={setCartSearch}
          />
          <View style={styles.filterRow}>
            <TouchableOpacity
              style={[styles.segmentButton, !cartIncludeEmpty && styles.segmentButtonActive]}
              onPress={() => setCartIncludeEmpty(false)}
            >
              <Text style={!cartIncludeEmpty ? styles.segmentTextActive : styles.segmentText}>Boslari Gizle</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentButton, cartIncludeEmpty && styles.segmentButtonActive]}
              onPress={() => setCartIncludeEmpty(true)}
            >
              <Text style={cartIncludeEmpty ? styles.segmentTextActive : styles.segmentText}>Boslari Goster</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={() => fetchCustomerCarts()}>
            <Text style={styles.primaryButtonText}>Raporu Yenile</Text>
          </TouchableOpacity>
          {cartSummary && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>Toplam Sepet: {cartSummary.total}</Text>
            </View>
          )}
          {cartError && <Text style={styles.error}>{cartError}</Text>}
        </View>
      );
    }

    if (reportType === 'actionRadar') {
      const anomalyTotal = Object.values(actionRadarData?.anomalyRadar?.summary || {}).reduce(
        (sum: number, value: any) => sum + Number(value || 0),
        0
      );
      return (
        <View style={styles.headerSection}>
          <Text style={styles.sectionTitle}>Aksiyon Radari</Text>
          <Text style={styles.sectionSubtitle}>
            Teklif, terk sepet, katalog, paket, saha ziyareti ve anomali sinyalleri.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={fetchActionRadar}>
            <Text style={styles.primaryButtonText}>Radari Yenile</Text>
          </TouchableOpacity>
          {actionRadarData && (
            <View style={styles.metricGrid}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Teklif Riski</Text>
                <Text style={styles.metricValue}>{actionRadarData.quoteHealth?.summary?.expiringOrExpired || 0}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Terk Sepet</Text>
                <Text style={styles.metricValue}>{actionRadarData.abandonedCarts?.summary?.total || 0}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Katalog Skoru</Text>
                <Text style={styles.metricValue}>{actionRadarData.catalogScore?.summary?.score || 0}/100</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Anomali</Text>
                <Text style={[styles.metricValue, anomalyTotal > 0 && styles.metricValueDanger]}>{anomalyTotal}</Text>
              </View>
            </View>
          )}
          {actionRadarData?.scope?.mode === 'assigned-sectors' && (
            <Text style={styles.scopeText}>
              Satisci kapsami: {(actionRadarData.scope.sectorCodes || []).join(', ') || 'atanmis sektor yok'}
            </Text>
          )}
          {actionRadarRows.length > 0 && (
            <>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryText}>Gosterilen: {filteredActionRadarRows.length}</Text>
                <Text style={styles.summaryText}>Toplam: {actionRadarRows.length}</Text>
              </View>
              <View style={styles.radarGroupWrap}>
                <TouchableOpacity
                  style={[styles.radarGroupChip, actionRadarGroup === 'ALL' && styles.radarGroupChipActive]}
                  onPress={() => setActionRadarGroup('ALL')}
                >
                  <Text style={actionRadarGroup === 'ALL' ? styles.radarGroupTextActive : styles.radarGroupText}>
                    Tumu ({actionRadarRows.length})
                  </Text>
                </TouchableOpacity>
                {actionRadarGroupCounts.map(([group, count]) => (
                  <TouchableOpacity
                    key={group}
                    style={[styles.radarGroupChip, actionRadarGroup === group && styles.radarGroupChipActive]}
                    onPress={() => setActionRadarGroup(group)}
                  >
                    <Text style={actionRadarGroup === group ? styles.radarGroupTextActive : styles.radarGroupText}>
                      {group} ({count})
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
          {actionRadarError && <Text style={styles.error}>{actionRadarError}</Text>}
        </View>
      );
    }

    return (
      <View style={styles.headerSection}>
        <Text style={styles.sectionTitle}>Urun Musterileri</Text>
        <Text style={styles.sectionSubtitle}>Urun bazli cari listesi.</Text>
        <TextInput
          style={styles.input}
          placeholder="Urun kodu"
          placeholderTextColor={colors.textMuted}
          value={productCustomerCode}
          onChangeText={setProductCustomerCode}
        />
        <TouchableOpacity style={styles.primaryButton} onPress={fetchProductCustomers}>
          <Text style={styles.primaryButtonText}>Raporu Yenile</Text>
        </TouchableOpacity>
        {productCustomersSummary && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryText}>Cari: {productCustomersSummary.totalCustomers}</Text>
            <Text style={styles.summaryText}>Ciro: {productCustomersSummary.totalRevenue?.toFixed?.(2) ?? '-'}</Text>
          </View>
        )}
        {productCustomersError && <Text style={styles.error}>{productCustomersError}</Text>}
      </View>
    );
  }, [
    reportType,
    dayDiff,
    percentDiff,
    costSummary,
    costError,
    marginStartDate,
    marginEndDate,
    marginStatus,
    marginSummary,
    marginError,
    priceSearch,
    priceStartDate,
    priceEndDate,
    priceSummary,
    priceError,
    priceNewSearch,
    priceNewSummary,
    priceNewError,
    topProductsStartDate,
    topProductsEndDate,
    topProductsSummary,
    topProductsError,
    topCustomersStartDate,
    topCustomersEndDate,
    topCustomersSummary,
    topCustomersError,
    productCustomerCode,
    productCustomersSummary,
    productCustomersError,
    complementMode,
    complementMatchMode,
    complementProductCode,
    complementCustomerCode,
    complementSummary,
    complementError,
    activityStartDate,
    activityEndDate,
    activityCustomerCode,
    activityUserId,
    activitySummary,
    activityError,
    cartSearch,
    cartIncludeEmpty,
    cartSummary,
    cartError,
    actionRadarData,
    actionRadarRows,
    filteredActionRadarRows,
    actionRadarGroup,
    actionRadarGroupCounts,
    actionRadarError,
  ]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={data}
        key={`${reportType}-${listColumns}`}
        keyExtractor={(item: any, index) => `${reportType}-${item?.id || index}`}
        numColumns={listColumns}
        columnWrapperStyle={listColumns > 1 ? styles.columnWrapper : undefined}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.hero}>
              <Text style={styles.heroKicker}>Rapor Merkezi</Text>
              <Text style={styles.heroTitle}>{reportTitles[reportType]}</Text>
              <Text style={styles.heroSubtitle}>Guncel analizler, kontrol listeleri ve aksiyon alinabilir operasyon sinyalleri.</Text>
              <View style={styles.heroMetricRow}>
                <View style={styles.heroMetric}>
                  <Text style={styles.heroMetricValue}>{data.length}</Text>
                  <Text style={styles.heroMetricLabel}>Satir</Text>
                </View>
                <View style={styles.heroMetric}>
                  <Text style={styles.heroMetricValue}>{listColumns}</Text>
                  <Text style={styles.heroMetricLabel}>Kolon</Text>
                </View>
                <View style={styles.heroMetric}>
                  <Text style={styles.heroMetricValue}>{exporting ? 'Hazirlaniyor' : 'Hazir'}</Text>
                  <Text style={styles.heroMetricLabel}>Excel</Text>
                </View>
              </View>
            </View>

            <View style={styles.segmentWrap}>
              {(
                [
                  { key: 'cost', label: 'Maliyet' },
                  { key: 'margin', label: 'Kar' },
                  { key: 'profit', label: 'Kar+' },
                  { key: 'price', label: 'Fiyat' },
                  { key: 'priceNew', label: 'FiyatYeni' },
                  { key: 'topProducts', label: 'TopUrun' },
                  { key: 'topCustomers', label: 'TopCari' },
                  { key: 'productCustomers', label: 'UrunCari' },
                  { key: 'complementMissing', label: 'Tamamlayici' },
                  { key: 'customerActivity', label: 'Aktivite' },
                  { key: 'customerCarts', label: 'Sepetler' },
                  { key: 'actionRadar', label: 'Radar' },
                ] as const
              ).map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.segmentButton, reportType === item.key && styles.segmentButtonActive]}
                  onPress={() => setReportType(item.key)}
                >
                  <Text style={reportType === item.key ? styles.segmentTextActive : styles.segmentText}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {headerContent}
            <TouchableOpacity
              style={[styles.exportButton, exporting && styles.disabledButton]}
              onPress={exportCurrentReport}
              disabled={exporting || data.length === 0}
            >
              <Text style={styles.exportButtonText}>{exporting ? 'Excel hazirlaniyor' : 'Ekrandaki Raporu Excel Paylas'}</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => {
          if (reportType === 'cost') {
            const row = item as CostUpdateAlert;
            return (
              <View style={styles.card}>
                <Text style={styles.cardTitle} numberOfLines={2}>{row.productName}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>Kod: {row.productCode}</Text>
                <Text style={styles.cardMeta}>Fark: {row.diffPercent.toFixed(2)}%</Text>
                <Text style={styles.cardMeta}>Gun: {row.dayDiff}</Text>
                <Text style={styles.cardMeta}>Risk: {row.riskAmount.toFixed(2)} TL</Text>
              </View>
            );
          }

          if (reportType === 'margin' || reportType === 'profit') {
            const row = item as MarginComplianceRow;
            const cariName = row['Cari Ismi'] || row['Cari ismi'] || row['Cari Ismi'] || '-';
            const stokName = row['Stok Ismi'] || row['Stok Ismi'] || '-';
            const amount = row.TutarKDV ?? row.Tutar ?? 0;
            const margin = row.OrtalamaKarYuzde ?? row['SO-KarYuzde'] ?? 0;
            return (
              <View style={styles.card}>
                <Text style={styles.cardTitle} numberOfLines={2}>{stokName}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>Cari: {cariName}</Text>
                <Text style={styles.cardMeta}>Tutar: {Number(amount).toFixed(2)} TL</Text>
                <Text style={styles.cardMeta}>Kar: {Number(margin).toFixed(2)}%</Text>
              </View>
            );
          }

          if (reportType === 'price') {
            const row = item as PriceHistoryChange;
            return (
              <View style={styles.card}>
                <Text style={styles.cardTitle} numberOfLines={2}>{row.productName}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>Kod: {row.productCode}</Text>
                <Text style={styles.cardMeta}>Degisim: {row.avgChangePercent.toFixed(2)}%</Text>
                <Text style={styles.cardMeta}>Liste: {row.updatedListsCount}</Text>
                <Text style={styles.cardMeta}>Tutarlilik: {row.isConsistent ? 'Evet' : 'Hayir'}</Text>
              </View>
            );
          }

          if (reportType === 'priceNew') {
            return (
              <View style={styles.card}>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.productName}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>Kod: {item.productCode}</Text>
                <Text style={styles.cardMeta}>Degisim: {item.totalChanges}</Text>
                <Text style={styles.cardMeta}>Stok: {item.currentStock}</Text>
              </View>
            );
          }

          if (reportType === 'topProducts') {
            return (
              <View style={styles.card}>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.productName}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>Kod: {item.productCode}</Text>
                <Text style={styles.cardMeta}>Ciro: {Number(item.revenue).toFixed(2)} TL</Text>
                <Text style={styles.cardMeta}>Kar: {Number(item.profit).toFixed(2)} TL</Text>
              </View>
            );
          }

          if (reportType === 'topCustomers') {
            return (
              <View style={styles.card}>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.customerName}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>Kod: {item.customerCode}</Text>
                <Text style={styles.cardMeta}>Ciro: {Number(item.revenue).toFixed(2)} TL</Text>
                <Text style={styles.cardMeta}>Kar: {Number(item.profit).toFixed(2)} TL</Text>
              </View>
            );
          }

          if (reportType === 'complementMissing') {
            const missingComplements = Array.isArray(item.missingComplements) ? item.missingComplements : [];
            const productCode = item.productCode || item.code;
            const customerCode = item.customerCode || item.mikroCariCode;
            const quotePrefills = missingComplements
              .map((missing: any) => ({
                productCode: String(missing.productCode || missing.code || missing.mikroCode || '').trim(),
                productName: missing.productName || missing.name,
                quantity: Number(missing.suggestedQuantity || missing.quantity || 1) || 1,
              }))
              .filter((missing: any) => missing.productCode)
              .slice(0, 8);
            return (
              <View style={styles.card}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {(item.customerCode || item.productCode || '-').toString()}
                </Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {item.customerName || item.productName || '-'}
                </Text>
                <Text style={styles.cardMeta}>Evrak: {item.documentCount ?? '-'}</Text>
                <Text style={styles.cardMeta}>Eksik: {item.missingCount ?? '-'}</Text>
                {missingComplements.length > 0 && (
                  <View style={styles.metaWrap}>
                    {missingComplements.slice(0, 6).map((missing: any, index: number) => (
                      <Text key={`${item.customerCode || item.productCode || 'missing'}-${index}`} style={styles.metaPill} numberOfLines={1}>
                        {missing.productCode || missing.code || missing.mikroCode || missing.productName || missing.name || 'Eksik urun'}
                      </Text>
                    ))}
                  </View>
                )}
                <View style={styles.cardActionRow}>
                  {customerCode ? (
                    <TouchableOpacity
                      style={styles.smallButton}
                      onPress={() => navigation.navigate('Customer360', { customerIdOrCode: customerCode })}
                    >
                      <Text style={styles.smallButtonText}>Cari 360</Text>
                    </TouchableOpacity>
                  ) : null}
                  {customerCode && quotePrefills.length > 0 ? (
                    <TouchableOpacity
                      style={styles.smallButton}
                      onPress={() =>
                        navigation.navigate('QuoteCreate', {
                          customerIdOrCode: customerCode,
                          productPrefills: quotePrefills,
                        })
                      }
                    >
                      <Text style={styles.smallButtonText}>Teklif Taslagi</Text>
                    </TouchableOpacity>
                  ) : null}
                  {productCode ? (
                    <TouchableOpacity
                      style={styles.smallButton}
                      onPress={() => navigation.navigate('ComplementManagement', { initialSearch: productCode, autoSelect: true })}
                    >
                      <Text style={styles.smallButtonText}>Tamamlayici</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          }

          if (reportType === 'customerActivity') {
            return (
              <View style={styles.card}>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.type || '-'}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>Kullanici: {item.userName || item.userId || '-'}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  Cari: {item.customerCode || '-'} {item.customerName ? `- ${item.customerName}` : ''}
                </Text>
                <Text style={styles.cardMeta} numberOfLines={1}>Sayfa: {item.pagePath || '-'}</Text>
                <Text style={styles.cardMeta}>Urun: {item.productCode || '-'}</Text>
                <Text style={styles.cardMeta}>Tiklama: {item.clickCount ?? '-'}</Text>
              </View>
            );
          }

          if (reportType === 'customerCarts') {
            const expanded = expandedCartId === item.cartId;
            const canClear = Number(item.itemCount || 0) > 0 && clearingCartId !== item.cartId;
            return (
              <View style={styles.card}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.customerCode || '-'}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>{item.customerName || '-'}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>Kullanici: {item.userName || '-'}</Text>
                <Text style={styles.cardMeta}>Kalem: {item.itemCount ?? 0}</Text>
                <Text style={styles.cardMeta}>Miktar: {item.totalQuantity ?? 0}</Text>
                <Text style={styles.cardMeta}>Tutar: {Number(item.totalAmount || 0).toFixed(2)} TL</Text>
                <View style={styles.cardActionRow}>
                  <TouchableOpacity
                    style={styles.smallButton}
                    onPress={() => setExpandedCartId(expanded ? null : item.cartId)}
                  >
                    <Text style={styles.smallButtonText}>{expanded ? 'Gizle' : 'Detay'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.smallButton, styles.dangerButton, !canClear && styles.disabledButton]}
                    disabled={!canClear}
                    onPress={() => clearCustomerCart(item)}
                  >
                    <Text style={styles.smallButtonText}>
                      {clearingCartId === item.cartId ? 'Siliniyor' : 'Temizle'}
                    </Text>
                  </TouchableOpacity>
                </View>
                {expanded && (
                  <View style={styles.cartItems}>
                    {(item.items || []).length === 0 ? (
                      <Text style={styles.cardMeta}>Sepette kalem yok.</Text>
                    ) : (
                      item.items.map((cartItem: any) => (
                        <View key={cartItem.id} style={styles.cartItemCard}>
                          <Text style={styles.cartItemTitle} numberOfLines={2}>{cartItem.productName || cartItem.productCode || '-'}</Text>
                          <Text style={styles.cardMeta}>
                            {cartItem.productCode || '-'} - {Number(cartItem.quantity || 0).toLocaleString('tr-TR')} adet
                          </Text>
                          <Text style={styles.cardMeta}>
                            Birim: {Number(cartItem.unitPrice || 0).toFixed(2)} TL - Toplam: {Number(cartItem.totalPrice || 0).toFixed(2)} TL
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                )}
              </View>
            );
          }

          if (reportType === 'actionRadar') {
            const row = item as ActionRadarItem;
            return (
              <View style={[styles.card, row.tone === 'red' && styles.cardDanger, row.tone === 'amber' && styles.cardWarning]}>
                <View style={styles.cardHeaderRow}>
                  <View style={styles.cardTitleBlock}>
                    <Text style={styles.groupLabel}>{row.group}</Text>
                    <Text style={styles.cardTitle} numberOfLines={2}>{row.title}</Text>
                    {!!row.subtitle && <Text style={styles.cardMeta} numberOfLines={2}>{row.subtitle}</Text>}
                  </View>
                  {row.action.type !== 'none' && (
                    <TouchableOpacity style={styles.smallButton} onPress={() => openActionRadarItem(row)}>
                      <Text style={styles.smallButtonText}>{row.actionLabel || 'Ac'}</Text>
                    </TouchableOpacity>
                  )}
                  {row.action.type === 'none' && (
                    <View style={styles.passiveActionBadge}>
                      <Text style={styles.passiveActionText}>Bilgi</Text>
                    </View>
                  )}
                </View>
                <View style={styles.metaWrap}>
                  {row.meta.map((meta, index) => (
                    <Text key={`${row.id}-${index}-${meta}`} style={styles.metaPill} numberOfLines={1}>{meta}</Text>
                  ))}
                </View>
              </View>
            );
          }

          return (
            <View style={styles.card}>
              <Text style={styles.cardTitle} numberOfLines={2}>{item.customerName}</Text>
              <Text style={styles.cardMeta} numberOfLines={1}>Kod: {item.customerCode}</Text>
              <Text style={styles.cardMeta}>Ciro: {Number(item.totalRevenue).toFixed(2)} TL</Text>
            </View>
          );
        }}
        ListEmptyComponent={
          costLoading ||
          marginLoading ||
          priceLoading ||
          priceNewLoading ||
          topProductsLoading ||
          topCustomersLoading ||
          productCustomersLoading ||
          complementLoading ||
          activityLoading ||
          cartLoading ||
          actionRadarLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Liste bos.</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  columnWrapper: {
    gap: spacing.md,
  },
  header: {
    gap: spacing.sm,
  },
  hero: {
    paddingHorizontal: 1,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  heroKicker: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFD7FF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xxl,
    color: '#FFFFFF',
  },
  heroSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    lineHeight: fontSizes.sm + 6,
    color: '#DDE8FF',
  },
  heroMetricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  heroMetric: {
    minWidth: 92,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  heroMetricValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.lg,
    color: '#FFFFFF',
  },
  heroMetricLabel: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFD7FF',
  },
  segmentWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  segmentButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  segmentButtonActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  segmentTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#FFFFFF',
  },
  headerSection: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  sectionTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.lg,
    color: colors.text,
  },
  sectionSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    minWidth: 180,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
    fontSize: fontSizes.sm,
  },
  exportButton: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  exportButtonText: {
    fontFamily: fonts.semibold,
    color: colors.primarySoft,
    fontSize: fontSizes.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  summaryText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  metricLabel: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  metricValue: {
    marginTop: spacing.xs,
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: colors.text,
  },
  metricValueDanger: {
    color: colors.danger,
  },
  scopeText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  radarGroupWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  radarGroupChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  radarGroupChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  radarGroupText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  radarGroupTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#FFFFFF',
  },
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
  },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  cardDanger: {
    borderColor: '#FCA5A5',
  },
  cardWarning: {
    borderColor: '#FCD34D',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cardTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  groupLabel: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.primarySoft,
    overflow: 'hidden',
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
    minWidth: 0,
    lineHeight: 22,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    minWidth: 0,
    lineHeight: 19,
  },
  cardActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cartItems: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cartItemCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 3,
  },
  cartItemTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
    minWidth: 0,
    lineHeight: 20,
  },
  metaWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  metaPill: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  smallButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  passiveActionBadge: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surfaceMuted,
  },
  passiveActionText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  dangerButton: {
    backgroundColor: colors.danger,
  },
  disabledButton: {
    opacity: 0.55,
  },
  smallButtonText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#FFFFFF',
  },
  loading: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  empty: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
});
