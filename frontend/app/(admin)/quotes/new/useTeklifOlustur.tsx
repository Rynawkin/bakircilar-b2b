'use client';

import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, ChangeEvent, FocusEvent as ReactFocusEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { CustomerInfoCard } from '@/components/ui/CustomerInfoCard';
import { Modal } from '@/components/ui/Modal';
import { CariSelectModal } from '@/components/admin/CariSelectModal';
import { StockFamilySuggestion } from '@/components/admin/StockFamilySuggestion';
import { Sparkles, Loader2 } from 'lucide-react';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import {
  convertPriceFromBaseUnit,
  convertPriceToBaseUnit,
  convertQuantityFromBaseUnit,
  convertQuantityToBaseUnit,
  getAvailableUnits,
  getUnitConversionLabel,
} from '@/lib/utils/unit';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '@/lib/utils/search';
import type { CustomerContact, Quote, QuoteItem } from '@/types';

export interface LastSale {
  saleDate: string;
  quantity: number;
  unitPrice: number;
  documentNo?: string | null;
  vatRate?: number;
  vatZeroed?: boolean;
}

export interface LastQuote {
  quoteDate: string;
  quantity: number;
  unitPrice: number;
  priceType?: 'INVOICED' | 'WHITE';
  documentNo?: string | null;
  quoteNumber?: string | null;
}

export interface LastOrder {
  orderDate: string;
  quantity: number;
  unitPrice: number;
  priceType?: 'INVOICED' | 'WHITE';
  documentNo?: string | null;
  orderNumber?: string | null;
}

export interface CategoryLastPurchase {
  categoryCode?: string | null;
  categoryName?: string | null;
  lastPurchaseDate?: string | null;
  monthsSinceLastPurchase?: number | null;
}

export interface QuoteProduct {
  id: string;
  name: string;
  mikroCode: string;
  imageUrl?: string | null;
  unit?: string;
  unit2?: string | null;
  unit2Factor?: number | null;
  vatRate: number;
  lastEntryPrice?: number | null;
  lastEntryDate?: string | null;
  currentCost?: number | null;
  currentCostDate?: string | null;
  warehouseStocks?: Record<string, number>;
  category?: { id: string; name: string } | null;
  mikroPriceLists?: Record<number, number> | Record<string, number>;
  lastSales?: LastSale[];
  lastQuotes?: LastQuote[];
  categoryLastPurchase?: CategoryLastPurchase | null;
  categoryLastPurchaseDate?: string | null;
  categoryMonthsSinceLastPurchase?: number | null;
  recommendationNote?: string | null;
}

export interface QuoteItemForm {
  id: string;
  productId?: string;
  productCode: string;
  productName: string;
  unit?: string;
  unit2?: string | null;
  unit2Factor?: number | null;
  selectedUnit?: string | null;
  quantity: number;
  priceSource?: 'LAST_SALE' | 'PRICE_LIST' | 'MANUAL' | '';
  priceListNo?: number;
  unitPrice?: number;
  manualPriceInput?: string;
  vatRate: number;
  vatZeroed?: boolean;
  priceType?: 'INVOICED' | 'WHITE';
  isManualLine?: boolean;
  manualVatRate?: number;
  manualMarginEntry?: number;
  manualMarginCost?: number;
  lineDescription?: string;
  manualImageUrl?: string | null;
  responsibilityCenter?: string;
  reserveQty?: number;
  lastSales?: LastSale[];
  lastQuotes?: LastQuote[];
  lastOrders?: LastOrder[];
  categoryLastPurchase?: CategoryLastPurchase | null;
  categoryLastPurchaseDate?: string | null;
  categoryMonthsSinceLastPurchase?: number | null;
  selectedSaleIndex?: number;
  lastEntryPrice?: number | null;
  lastEntryDate?: string | null;
  currentCost?: number | null;
  currentCostDate?: string | null;
  mikroPriceLists?: Record<number, number> | Record<string, number>;
}

export type PoolSortOption = 'default' | 'stock1_desc' | 'stock6_desc' | 'price_asc' | 'price_desc';

export type PoolColorRule = {
  id: string;
  enabled: boolean;
  warehouse: '1' | '6';
  operator: '>' | '>=' | '<' | '<=' | '=';
  threshold: number;
  color: 'green' | 'yellow' | 'blue' | 'red' | 'slate';
};

export const createPoolColorRule = (overrides?: Partial<PoolColorRule>): PoolColorRule => ({
  id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  enabled: false,
  warehouse: '1',
  operator: '>',
  threshold: 0,
  color: 'green',
  ...overrides,
});

export const normalizePoolColorRule = (rule?: Partial<PoolColorRule> | null): PoolColorRule => {
  const validOperator = rule?.operator;
  const validColor = rule?.color;
  const validWarehouse = rule?.warehouse;
  return {
    id: typeof rule?.id === 'string' && rule.id ? rule.id : createPoolColorRule().id,
    enabled: Boolean(rule?.enabled),
    warehouse: validWarehouse === '6' ? '6' : '1',
    operator: validOperator && ['>', '>=', '<', '<=', '='].includes(validOperator) ? validOperator : '>',
    threshold: Number.isFinite(Number(rule?.threshold)) ? Number(rule?.threshold) : 0,
    color: validColor && ['green', 'yellow', 'blue', 'red', 'slate'].includes(validColor) ? validColor : 'green',
  };
};

export const POOL_SORT_OPTIONS: Array<{ value: PoolSortOption; label: string }> = [
  { value: 'default', label: 'Varsayilan Siralama' },
  { value: 'stock1_desc', label: 'Merkez Depo Stok (Yuksekten)' },
  { value: 'stock6_desc', label: 'Topca Depo Stok (Yuksekten)' },
  { value: 'price_asc', label: 'Fiyat (Dusukten)' },
  { value: 'price_desc', label: 'Fiyat (Yuksekten)' },
];

export const LINE_DESCRIPTION_KEY = '__line_description__';

export const createEmptyPriceRequestStockPayload = (name = '', unit = 'ADET') => ({
  templateCode: 'B108423',
  name,
  foreignName: '',
  shortName: '',
  vatRatePercent: '20',
  supplierCode: '',
  brandCode: '',
  brandName: '',
  categoryCode: '',
  packageCode: '',
  packageName: '',
  shelfCode: '',
  currentCost: '0',
  mainUnit: unit || 'ADET',
  mainUnitWeightKg: '',
  mainUnitWidthCm: '',
  mainUnitLengthCm: '',
  mainUnitHeightCm: '',
  margins: ['2', '1,5', '1,3', '1,2', '1,15'],
  barcode: '',
  notes: '',
  extraUnits: [],
});

export const BASE_COLUMN_WIDTHS: Record<string, number> = {
  rowNumber: 56,
  product: 320,
  quantity: 90,
  priceSource: 140,
  selection: 220,
  unitPrice: 110,
  lineTotal: 110,
  vat: 90,
  lineDescription: 200,
  actions: 44,
};

export const MIN_COLUMN_WIDTHS: Record<string, number> = {
  rowNumber: 44,
  product: 240,
  quantity: 80,
  priceSource: 110,
  selection: 180,
  unitPrice: 90,
  lineTotal: 90,
  vat: 80,
  lineDescription: 140,
  actions: 40,
  stock: 120,
};

export const DEFAULT_STOCK_COLUMN_WIDTH = 150;
export const MAX_COLUMN_WIDTH = 520;

export const getDefaultColumnWidth = (key: string) => {
  if (key.startsWith('stock:')) return DEFAULT_STOCK_COLUMN_WIDTH;
  return BASE_COLUMN_WIDTHS[key] ?? 140;
};

export const getMinColumnWidth = (key: string) => {
  if (key.startsWith('stock:')) return MIN_COLUMN_WIDTHS.stock;
  return MIN_COLUMN_WIDTHS[key] ?? 80;
};

export const clampColumnWidth = (key: string, value: number) => {
  const min = getMinColumnWidth(key);
  const max = MAX_COLUMN_WIDTH;
  return Math.min(max, Math.max(min, Math.round(value)));
};

export const buildColumnWidthMap = (
  savedWidths: Record<string, unknown> | null | undefined,
  selectedColumns: string[]
) => {
  const widths: Record<string, number> = {};

  Object.entries(BASE_COLUMN_WIDTHS).forEach(([key, value]) => {
    widths[key] = value;
  });

  selectedColumns.forEach((column) => {
    const key = `stock:${column}`;
    widths[key] = DEFAULT_STOCK_COLUMN_WIDTH;
  });

  if (savedWidths && typeof savedWidths === 'object') {
    Object.entries(savedWidths).forEach(([key, value]) => {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        widths[key] = clampColumnWidth(key, parsed);
      }
    });
  }

  return widths;
};

export const PRICE_LIST_LABELS: Record<number, string> = {
  1: 'Perakende Satis 1',
  2: 'Perakende Satis 2',
  3: 'Perakende Satis 3',
  4: 'Perakende Satis 4',
  5: 'Perakende Satis 5',
  6: 'Toptan Satis 1',
  7: 'Toptan Satis 2',
  8: 'Toptan Satis 3',
  9: 'Toptan Satis 4',
  10: 'Toptan Satis 5',
};

export const getColumnDisplayName = (column: string) => {
  const nameMap: Record<string, string> = {
    msg_S_0088: 'GUID',
    msg_S_0870: 'Urun Adi',
    msg_S_0078: 'Stok Kodu',
  };
  return nameMap[column] || column;
};

export const formatStockValue = (value: any) => {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'number') {
    return value.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  }
  return String(value);
};

export const getStockColumnValue = (column: string, row?: Record<string, any>) => {
  if (!row) return '-';
  if (column === 'Koli Ici') {
    const label = getUnitConversionLabel(row['Birim'], row['2. Birim'], row['2. Birim Katsayısı']);
    return label || '-';
  }
  return formatStockValue(row[column]);
};

export const formatManualPriceInput = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return value.toLocaleString('tr-TR', { useGrouping: false, maximumFractionDigits: 6 });
};

export const formatQuantityInput = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return value.toLocaleString('tr-TR', { useGrouping: false, maximumFractionDigits: 6 });
};

export const parseDecimalInput = (input: string) => {
  const raw = input.replace(/\s+/g, '');
  if (!raw) return { value: undefined };
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  let normalized = raw;

  if (lastComma !== -1 && lastDot !== -1) {
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    normalized = raw.replace(new RegExp(`\\${thousandsSeparator}`, 'g'), '');
    normalized = normalized.replace(decimalSeparator, '.');
  } else if (lastComma !== -1) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = raw.replace(/,/g, '');
  }

  const parsed = Number(normalized);
  return { value: Number.isFinite(parsed) ? parsed : undefined };
};

export const getStockNumber = (product: QuoteProduct, warehouse: '1' | '6') => {
  const value = product.warehouseStocks?.[warehouse];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getProductSortPrice = (product: QuoteProduct) => {
  const lastSalePrice = product.lastSales?.[0]?.unitPrice;
  if (Number.isFinite(lastSalePrice)) return Number(lastSalePrice);
  const listValues = product.mikroPriceLists
    ? Object.values(product.mikroPriceLists)
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    : [];
  if (listValues.length > 0) {
    return Math.min(...listValues);
  }
  return 0;
};

export const getMikroListPrice = (
  mikroPriceLists: QuoteItemForm['mikroPriceLists'],
  listNo: number
) => {
  if (!mikroPriceLists) return 0;
  const byNumber = (mikroPriceLists as Record<number, number>)[listNo];
  if (typeof byNumber === 'number') return byNumber;
  const byString = (mikroPriceLists as Record<string, number>)[String(listNo)];
  return typeof byString === 'number' ? byString : 0;
};

export const getPoolPriceLabel = (listNo: number) => {
  return PRICE_LIST_LABELS[listNo] || `Liste ${listNo}`;
};

export const getMatchingPriceListLabel = (
  mikroPriceLists: QuoteItemForm['mikroPriceLists'],
  unitPrice?: number | null
) => {
  if (!mikroPriceLists || !Number.isFinite(unitPrice as number)) return null;
  const roundTo2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const target = roundTo2(Number(unitPrice));
  for (const [key, value] of Object.entries(mikroPriceLists)) {
    const listNo = Number(key);
    if (!Number.isFinite(listNo)) continue;
    const listPrice = Number(value);
    if (!Number.isFinite(listPrice) || listPrice <= 0) continue;
    if (roundTo2(listPrice) === target) {
      return PRICE_LIST_LABELS[listNo] || `Liste ${listNo}`;
    }
  }
  return null;
};

export const formatPercent = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(1)}%`;
};

export const formatQuotePriceType = (priceType?: 'INVOICED' | 'WHITE') => (
  priceType === 'WHITE' ? 'Beyaz' : 'Fatural?'
);

export const monthsSinceDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diffDays = Math.max(0, (Date.now() - date.getTime()) / 86_400_000);
  return Math.round((diffDays / 30.4375) * 10) / 10;
};

export const getCategoryLastPurchaseInfo = (source?: any | null) => {
  if (!source) return null;
  const info = source.categoryLastPurchase || null;
  const lastPurchaseDate = info?.lastPurchaseDate || (source as any).lastPurchaseDate || source.categoryLastPurchaseDate || null;
  if (!lastPurchaseDate) return null;
  return {
    categoryCode: info?.categoryCode || (source as any).categoryCode || null,
    categoryName: info?.categoryName || (source as any).categoryName || null,
    lastPurchaseDate,
    monthsSinceLastPurchase:
      info?.monthsSinceLastPurchase ?? (source as any).monthsSinceLastPurchase ?? source.categoryMonthsSinceLastPurchase ?? monthsSinceDate(lastPurchaseDate),
  };
};

export const getQuoteDocumentLabel = (quote?: LastQuote) => {
  if (!quote?.documentNo) return '-';
  return quote.documentNo;
};

export const getOrderDocumentLabel = (order?: LastOrder) => {
  if (!order?.documentNo) return '-';
  return order.documentNo;
};

export const roundUp2 = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.ceil((value + Number.EPSILON) * 100) / 100;
};

export const roundUnitValue = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
};

export const getSelectedUnit = (item: Pick<QuoteItemForm, 'unit' | 'selectedUnit'>) =>
  item.selectedUnit || item.unit || 'ADET';

export const getDisplayQuantity = (item: QuoteItemForm) =>
  roundUnitValue(
    convertQuantityFromBaseUnit(
      item.quantity || 0,
      getSelectedUnit(item),
      item.unit,
      item.unit2,
      item.unit2Factor
    )
  );

export const getDisplayUnitPrice = (item: QuoteItemForm) =>
  convertPriceFromBaseUnit(
    item.unitPrice || 0,
    getSelectedUnit(item),
    item.unit,
    item.unit2,
    item.unit2Factor
  );

export const buildUnitPayload = (item: QuoteItemForm) => ({
  unit: item.unit,
  unit2: item.unit2 || undefined,
  unit2Factor: Number.isFinite(Number(item.unit2Factor)) ? Number(item.unit2Factor) : undefined,
  selectedUnit: getSelectedUnit(item),
});

export const getPercentTone = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'text-gray-500';
  }
  return value >= 0 ? 'text-emerald-700' : 'text-red-600';
};

export const resolveWarehouseValue = (value: string) => {
  const normalized = String(value || '').toLowerCase();
  const digits = normalized.match(/\d+/);
  if (digits) {
    return digits[0];
  }
  if (normalized.includes('merkez')) return '1';
  if (normalized.includes('eregl')) return '2';
  if (normalized.includes('topca') || normalized.includes('top?a')) return '6';
  if (normalized.includes('dukkan') || normalized.includes('d?kkan')) return '7';
  return value;
};

export const parseMikroOrderNumber = (value?: string | null) => {
  const raw = String(value || '').trim();
  const lastDash = raw.lastIndexOf('-');
  if (lastDash <= 0 || lastDash >= raw.length - 1) {
    return { series: raw, sira: '' };
  }
  return {
    series: raw.slice(0, lastDash).trim(),
    sira: raw.slice(lastDash + 1).trim(),
  };
};


export function useTeklifOlustur() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editQuoteId = searchParams.get('edit');
  const isOrderMode = searchParams.get('mode') === 'order';
  const editOrderId = isOrderMode ? searchParams.get('orderId') : null;
  const isOrderEditMode = isOrderMode && Boolean(editOrderId);
  const isEditMode = Boolean(editQuoteId) && !isOrderMode;
  const editInitializedRef = useRef(false);
  const editOrderInitializedRef = useRef(false);
  const prefillInitializedRef = useRef(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [editingOrderCustomerCode, setEditingOrderCustomerCode] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [hasManualCustomerChange, setHasManualCustomerChange] = useState(false);
  const [customerContacts, setCustomerContacts] = useState<CustomerContact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [contactsLoading, setContactsLoading] = useState(false);
  const [showCariModal, setShowCariModal] = useState(false);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showProductPoolModal, setShowProductPoolModal] = useState(false);
  const [purchasedProducts, setPurchasedProducts] = useState<QuoteProduct[]>([]);
  const [selectedPurchasedCodes, setSelectedPurchasedCodes] = useState<Set<string>>(new Set());
  const [selectedSearchCodes, setSelectedSearchCodes] = useState<Set<string>>(new Set());
  const [poolQuantityInputs, setPoolQuantityInputs] = useState<Record<string, string>>({});
  const [purchasedSearch, setPurchasedSearch] = useState('');
  const [productTab, setProductTab] = useState<'purchased' | 'search'>('purchased');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<QuoteProduct[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [quoteItems, setQuoteItems] = useState<QuoteItemForm[]>([]);
  // ===== AI ile teklif analizi =====
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiRequestText, setAiRequestText] = useState('');
  const [aiImage, setAiImage] = useState<{ base64: string; mediaType: string; name: string } | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<any | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiModels, setAiModels] = useState<{ id: string; label: string }[]>([]);
  const [aiModel, setAiModel] = useState<string>('');

  const buildAiQuotePayload = () => ({
    mode: isOrderMode ? 'order' : 'quote',
    customer: selectedCustomer
      ? {
          code: selectedCustomer.mikroCariCode,
          name: selectedCustomer.name,
          sectorCode: selectedCustomer.sectorCode,
          balance: selectedCustomer.balance,
        }
      : null,
    items: quoteItems.map((it) => {
      const mi = getMarginInfo(it);
      const ls = it.lastSales && it.lastSales[0];
      return {
        productCode: it.productCode,
        productName: it.productName,
        quantity: it.quantity,
        unit: it.selectedUnit || it.unit,
        unit2: it.unit2,
        unit2Factor: it.unit2Factor,
        unitPrice: it.unitPrice,
        priceType: it.priceType,
        priceSource: it.priceSource,
        vatRate: it.vatRate,
        vatZeroed: !!(vatZeroed || it.vatZeroed),
        lineTotal: (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
        currentCost: it.currentCost ?? null,
        lastEntryPrice: it.lastEntryPrice ?? null,
        marginBlocked: mi ? mi.blocked : null,
        lineDescription: it.lineDescription || null,
        lastSale: ls ? { date: (ls as any).date, price: (ls as any).price, quantity: (ls as any).quantity } : null,
      };
    }),
    totals,
    profit: profitTotals,
  });

  const onAiImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Gorsel 5MB altinda olmali.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.split(',')[1] || '';
      setAiImage({ base64, mediaType: file.type || 'image/jpeg', name: file.name });
    };
    reader.readAsDataURL(file);
  };

  const openAiAnalysis = () => {
    if (quoteItems.length === 0) {
      toast.error('Once teklife urun ekleyin.');
      return;
    }
    setAiResult(null);
    setAiError(null);
    setShowAiModal(true);
    if (aiModels.length === 0) {
      adminApi
        .aiModels()
        .then((m) => {
          setAiModels(m.models || []);
          const saved = typeof window !== 'undefined' ? localStorage.getItem('ai-analysis-model') : null;
          const valid = saved && (m.models || []).some((x) => x.id === saved);
          setAiModel(valid ? (saved as string) : m.defaultAnalysis);
        })
        .catch(() => {});
    }
  };

  const onAiModelChange = (id: string) => {
    setAiModel(id);
    if (typeof window !== 'undefined') localStorage.setItem('ai-analysis-model', id);
  };

  const runAiAnalysis = async () => {
    setAiAnalyzing(true);
    setAiError(null);
    setAiResult(null);
    try {
      const res = await adminApi.aiAnalyzeQuote({
        quote: buildAiQuotePayload(),
        requestText: aiRequestText || undefined,
        requestImageBase64: aiImage?.base64,
        requestImageMediaType: aiImage?.mediaType,
        model: aiModel || undefined,
      });
      setAiResult(res.analysis);
    } catch (err: any) {
      setAiError(err?.response?.data?.error || 'Analiz yapilamadi. (AI yapilandirilmamis veya baglanti hatasi olabilir.)');
    } finally {
      setAiAnalyzing(false);
    }
  };

  const [validityDate, setValidityDate] = useState('');
  const [note, setNote] = useState('');
  const [vatZeroed, setVatZeroed] = useState(false);
  const [lastSalesCount, setLastSalesCount] = useState(1);
  const [showLastQuoteInfo, setShowLastQuoteInfo] = useState(false);
  const [showLastOrderInfo, setShowLastOrderInfo] = useState(false);
  const [expandedQuoteHistory, setExpandedQuoteHistory] = useState<Record<string, boolean>>({});
  const [lastQuoteMap, setLastQuoteMap] = useState<Record<string, LastQuote[]>>({});
  const [lastOrderMap, setLastOrderMap] = useState<Record<string, LastOrder[]>>({});
  const [categoryLastPurchaseMap, setCategoryLastPurchaseMap] = useState<Record<string, CategoryLastPurchase>>({});
  const [manualImageUploading, setManualImageUploading] = useState<Record<string, boolean>>({});
  const [priceRequestTarget, setPriceRequestTarget] = useState<QuoteItemForm | null>(null);
  const [priceRequestPriority, setPriceRequestPriority] = useState('NORMAL');
  const [priceRequestNote, setPriceRequestNote] = useState('');
  const [priceRequestStockPayload, setPriceRequestStockPayload] = useState<any>(createEmptyPriceRequestStockPayload());
  const [priceRequestSaving, setPriceRequestSaving] = useState(false);
  const [whatsappTemplate, setWhatsappTemplate] = useState('');
  const [responsibles, setResponsibles] = useState<Array<{ code: string; name: string; surname: string }>>([]);
  const [selectedResponsibleCode, setSelectedResponsibleCode] = useState('');
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [lineDescriptionIndex, setLineDescriptionIndex] = useState<number | null>(null);
  const [stockUnits, setStockUnits] = useState<string[]>([]);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() =>
    buildColumnWidthMap(undefined, [])
  );
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [savingColumns, setSavingColumns] = useState(false);
  const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [isQuoteTableFullscreen, setIsQuoteTableFullscreen] = useState(false);
  const resizeRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const tableScrollBarRef = useRef<HTMLDivElement | null>(null);
  const scrollSyncRef = useRef(false);
  const [tableScrollMetrics, setTableScrollMetrics] = useState({ scrollWidth: 0, clientWidth: 0 });
  const [stockDataMap, setStockDataMap] = useState<Record<string, any>>({});
  const [bulkPriceListNo, setBulkPriceListNo] = useState<number | ''>('');
  const [poolSort, setPoolSort] = useState<PoolSortOption>('default');
  const [poolPriceListNo, setPoolPriceListNo] = useState<number | ''>('');
  const [showPoolColorOptions, setShowPoolColorOptions] = useState(false);
  const [poolColorRules, setPoolColorRules] = useState<PoolColorRule[]>(() => [createPoolColorRule()]);
  const [savingPoolPreferences, setSavingPoolPreferences] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [includedWarehouses, setIncludedWarehouses] = useState<string[]>([]);
  const [orderWarehouse, setOrderWarehouse] = useState('');
  const [orderInvoicedSeries, setOrderInvoicedSeries] = useState('');
  const [orderInvoicedSira, setOrderInvoicedSira] = useState('');
  const [orderWhiteSeries, setOrderWhiteSeries] = useState('');
  const [orderWhiteSira, setOrderWhiteSira] = useState('');
  const [originalOrderInvoicedNumber, setOriginalOrderInvoicedNumber] = useState({ series: '', sira: '' });
  const [originalOrderWhiteNumber, setOriginalOrderWhiteNumber] = useState({ series: '', sira: '' });
  const [orderCustomerOrderNumber, setOrderCustomerOrderNumber] = useState('');
  const [orderDocumentDescription, setOrderDocumentDescription] = useState('');
  const [bulkResponsibilityCenter, setBulkResponsibilityCenter] = useState('');
  const [recommendations, setRecommendations] = useState<QuoteProduct[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);

  useEffect(() => {
    const defaultDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    setValidityDate(defaultDate.toISOString().slice(0, 10));
    loadInitialData();
  }, []);

  useEffect(() => {
    if (!editQuoteId || isOrderMode || editInitializedRef.current) return;
    editInitializedRef.current = true;
    loadQuoteForEdit(editQuoteId);
  }, [editQuoteId]);

  useEffect(() => {
    if (!isOrderEditMode || !editOrderId || editOrderInitializedRef.current) return;
    editOrderInitializedRef.current = true;
    loadOrderForEdit(editOrderId);
  }, [isOrderEditMode, editOrderId]);

  useEffect(() => {
    if (prefillInitializedRef.current) return;
    if (isOrderMode || isEditMode) {
      prefillInitializedRef.current = true;
      return;
    }

    const customerParam = searchParams.get('customerCode')?.trim() || '';
    const productParam = searchParams.get('productCodes') || searchParams.get('productCode') || '';
    const productCodes = productParam
      .split(',')
      .map((code) => code.trim())
      .filter(Boolean);

    if (!customerParam && productCodes.length === 0) {
      prefillInitializedRef.current = true;
      return;
    }

    if (customerParam && customers.length === 0) {
      return;
    }

    prefillInitializedRef.current = true;

    if (customerParam && customers.length > 0) {
      const matched = customers.find(
        (customer) => String(customer?.mikroCariCode || '').trim() === customerParam
      );
      if (matched) {
        setSelectedCustomer(matched);
        setHasManualCustomerChange(true);
      } else {
        toast.error('Cari bulunamadi');
      }
    }

    if (productCodes.length > 0) {
      adminApi
        .getProductsByCodes(productCodes)
        .then((result) => {
          if (result.products?.length) {
            addProductsToQuote(result.products);
          } else {
            toast.error('Urun bulunamadi');
          }
        })
        .catch((error) => {
          console.error('Urunler alinmadi:', error);
          toast.error('Urunler yuklenemedi');
        });
    }
  }, [customers, searchParams, isEditMode, isOrderMode]);

  useEffect(() => {
    if (!isQuoteTableFullscreen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isQuoteTableFullscreen]);

  useEffect(() => {
    if (!isQuoteTableFullscreen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsQuoteTableFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isQuoteTableFullscreen]);

  useEffect(() => {
    if (!showLastQuoteInfo && !showLastOrderInfo) {
      setExpandedQuoteHistory({});
    }
  }, [showLastQuoteInfo, showLastOrderInfo]);

  useEffect(() => {
    if (isOrderMode) {
      setShowLastQuoteInfo(false);
      setLastQuoteMap({});
      return;
    }
    setShowLastOrderInfo(false);
    setLastOrderMap({});
  }, [isOrderMode]);

  useEffect(() => {
    setSelectedPurchasedCodes(new Set());
    if (!selectedCustomer) return;
    fetchPurchasedProducts(selectedCustomer.id, lastSalesCount);
  }, [selectedCustomer, lastSalesCount]);

  useEffect(() => {
    setCustomerContacts([]);
    setSelectedContactId('');
    if (!selectedCustomer) return;
    fetchCustomerContacts(selectedCustomer.id);
  }, [selectedCustomer]);

  useEffect(() => {
    if (productTab !== 'search') return;

    if (!searchTerm.trim()) {
      fetchSearchResults('');
      return;
    }

    const timer = setTimeout(() => {
      fetchSearchResults(searchTerm.trim());
    }, 350);

    return () => clearTimeout(timer);
  }, [searchTerm, productTab, selectedCustomer?.id]);

  useEffect(() => {
    if (!selectedCustomer) return;
    setSelectedSearchCodes(new Set());
  }, [selectedCustomer]);

  useEffect(() => {
    if (!editingQuote || customers.length === 0 || hasManualCustomerChange) return;
    const matched = customers.find((item) => item.id === editingQuote.customer?.id);
    if (matched && matched.id !== selectedCustomer?.id) {
      setSelectedCustomer(matched);
    }
  }, [customers, editingQuote, hasManualCustomerChange, selectedCustomer?.id]);

  useEffect(() => {
    if (!isOrderEditMode || !editingOrderCustomerCode || customers.length === 0) return;
    const matched = customers.find(
      (item) => String(item?.mikroCariCode || '').trim() === editingOrderCustomerCode
    );
    if (matched && matched.id !== selectedCustomer?.id) {
      setSelectedCustomer(matched);
      setHasManualCustomerChange(true);
    }
  }, [isOrderEditMode, editingOrderCustomerCode, customers, selectedCustomer?.id]);

  useEffect(() => {
    if (selectedColumns.length === 0) return;
    setColumnWidths((prev) => {
      let changed = false;
      const next = { ...prev };
      selectedColumns.forEach((column) => {
        const key = `stock:${column}`;
        if (!Number.isFinite(next[key])) {
          next[key] = DEFAULT_STOCK_COLUMN_WIDTH;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [selectedColumns]);

  useEffect(() => {
    const container = tableScrollRef.current;
    if (!container) return;

    const updateMetrics = () => {
      setTableScrollMetrics({
        scrollWidth: container.scrollWidth,
        clientWidth: container.clientWidth,
      });
    };

    updateMetrics();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => updateMetrics());
      observer.observe(container);
      return () => observer.disconnect();
    }

    const handleResize = () => updateMetrics();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [selectedColumns, columnWidths, quoteItems.length, isQuoteTableFullscreen]);

  useEffect(() => {
    const codes = Array.from(new Set(
      quoteItems
        .filter((item) => !item.isManualLine)
        .map((item) => item.productCode)
        .filter(Boolean)
    ));

    if (codes.length === 0) {
      setStockDataMap({});
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const { data } = await adminApi.getStocksByCodes(codes);
        const nextMap: Record<string, any> = {};
        data.forEach((row: any) => {
          if (row?.msg_S_0078) {
            nextMap[row.msg_S_0078] = row;
          }
        });
        setStockDataMap(nextMap);
      } catch (error) {
        console.error('Stok kolonlari alinmadi:', error);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [quoteItems]);

  const quoteProductCodes = useMemo(() => {
    return Array.from(new Set(
      quoteItems
        .filter((item) => !item.isManualLine)
        .map((item) => item.productCode)
        .filter(Boolean)
    ));
  }, [quoteItems]);

  const quoteProductCodeSet = useMemo(() => new Set(quoteProductCodes), [quoteProductCodes]);

  useEffect(() => {
    if (!selectedCustomer?.id || quoteProductCodes.length === 0) {
      setCategoryLastPurchaseMap({});
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const result = await adminApi.getCustomerCategoryLastPurchases({
          customerId: selectedCustomer.id,
          productCodes: quoteProductCodes,
        });
        setCategoryLastPurchaseMap(result.categoryLastPurchases || {});
      } catch (error) {
        console.error('Kategori son alim bilgisi alinamadi:', error);
        setCategoryLastPurchaseMap({});
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [selectedCustomer?.id, quoteProductCodes.join('|')]);

  useEffect(() => {
    if (isOrderMode) {
      setLastQuoteMap({});
      return;
    }

    if (!showLastQuoteInfo) {
      setLastQuoteMap({});
      return;
    }

    if (!selectedCustomer || quoteProductCodes.length === 0) {
      setLastQuoteMap({});
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const result = await adminApi.getLastQuoteItems({
          customerId: selectedCustomer.id,
          productCodes: quoteProductCodes,
          limit: Math.max(5, lastSalesCount || 1),
          excludeQuoteId: editingQuote?.id,
        });
        setLastQuoteMap(result.lastQuotes || {});
      } catch (error) {
        console.error('Son teklifler alinmadi:', error);
        setLastQuoteMap({});
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [showLastQuoteInfo, selectedCustomer?.id, quoteProductCodes.join('|'), lastSalesCount, editingQuote?.id, isOrderMode]);

  useEffect(() => {
    if (!isOrderMode) {
      setLastOrderMap({});
      return;
    }

    if (!showLastOrderInfo) {
      setLastOrderMap({});
      return;
    }

    const resolvedCustomerCode = String(
      selectedCustomer?.mikroCariCode || editingOrderCustomerCode || ''
    ).trim();
    if (!resolvedCustomerCode || quoteProductCodes.length === 0) {
      setLastOrderMap({});
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const result = await adminApi.getLastOrderItems({
          customerId: selectedCustomer?.id || undefined,
          customerCode: resolvedCustomerCode,
          productCodes: quoteProductCodes,
          limit: Math.max(5, lastSalesCount || 1),
          excludeOrderId: isOrderEditMode ? editOrderId || undefined : undefined,
        });
        setLastOrderMap(result.lastOrders || {});
      } catch (error) {
        console.error('Son siparisler alinmadi:', error);
        setLastOrderMap({});
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [isOrderMode, showLastOrderInfo, selectedCustomer?.id, selectedCustomer?.mikroCariCode, editingOrderCustomerCode, quoteProductCodes.join('|'), lastSalesCount, isOrderEditMode, editOrderId]);

  useEffect(() => {
    if (quoteProductCodes.length === 0) {
      setRecommendations([]);
      setRecommendationsLoading(false);
      return;
    }

    let active = true;
    setRecommendationsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const result = await adminApi.getComplementRecommendations({
          productCodes: quoteProductCodes,
          excludeCodes: quoteProductCodes,
          limit: 10,
        });
        if (!active) return;
        setRecommendations(result.products || []);
      } catch (error) {
        console.error('Tamamlayici oneriler alinmadi:', error);
        if (active) {
          setRecommendations([]);
        }
      } finally {
        if (active) {
          setRecommendationsLoading(false);
        }
      }
    }, 400);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [quoteProductCodes.join('|')]);

  const loadInitialData = async () => {
    const results = await Promise.allSettled([
      adminApi.getCustomers(),
      adminApi.getQuotePreferences(),
      adminApi.getSearchPreferences(),
      adminApi.getStockColumns(),
      adminApi.getStockUnits(),
      adminApi.getQuoteResponsibles(),
      adminApi.getSettings(),
    ]);

    const [
      customersResult,
      quotePrefsResult,
      searchPrefsResult,
      columnResult,
      unitsResult,
      responsiblesResult,
      settingsResult,
    ] = results;
    let initialSelectedColumns: string[] = [];

    if (customersResult.status === 'fulfilled') {
      setCustomers(customersResult.value.customers || []);
    } else {
      console.error('Musteri listesi yuklenemedi:', customersResult.reason);
      toast.error('Musteri listesi yuklenemedi.');
    }

    if (quotePrefsResult.status === 'fulfilled' && quotePrefsResult.value?.preferences) {
      setLastSalesCount(quotePrefsResult.value.preferences.lastSalesCount || 1);
      setWhatsappTemplate(quotePrefsResult.value.preferences.whatsappTemplate || '');
      setSelectedResponsibleCode(quotePrefsResult.value.preferences.responsibleCode || '');
      const savedPoolSort = quotePrefsResult.value.preferences.poolSort;
      if (POOL_SORT_OPTIONS.some((option) => option.value === savedPoolSort)) {
        setPoolSort(savedPoolSort as PoolSortOption);
      }
      const savedPoolPriceListNo = Number(quotePrefsResult.value.preferences.poolPriceListNo);
      if (Number.isFinite(savedPoolPriceListNo) && savedPoolPriceListNo >= 1 && savedPoolPriceListNo <= 10) {
        setPoolPriceListNo(savedPoolPriceListNo);
      } else {
        setPoolPriceListNo('');
      }
      const savedRules = quotePrefsResult.value.preferences.poolColorRules;
      if (Array.isArray(savedRules) && savedRules.length > 0) {
        setPoolColorRules(savedRules.map((rule: any) => normalizePoolColorRule(rule)));
      } else {
        setPoolColorRules([createPoolColorRule()]);
      }
    } else if (quotePrefsResult.status === 'rejected') {
      console.error('Teklif tercihleri yuklenemedi:', quotePrefsResult.reason);
    }

    if (searchPrefsResult.status === 'fulfilled' && searchPrefsResult.value?.preferences?.stockColumns?.length) {
      initialSelectedColumns = searchPrefsResult.value.preferences.stockColumns;
      setSelectedColumns(initialSelectedColumns);
    } else if (searchPrefsResult.status === 'rejected') {
      console.error('Arama tercihleri yuklenemedi:', searchPrefsResult.reason);
    }

    if (initialSelectedColumns.length === 0) {
      initialSelectedColumns = selectedColumns;
    }

    const savedWidths =
      quotePrefsResult.status === 'fulfilled'
        ? quotePrefsResult.value?.preferences?.columnWidths
        : null;
    setColumnWidths(buildColumnWidthMap(savedWidths, initialSelectedColumns));

    if (columnResult.status === 'fulfilled' && columnResult.value?.columns?.length) {
      const nextColumns = columnResult.value.columns.includes('Koli Ici')
        ? columnResult.value.columns
        : [...columnResult.value.columns, 'Koli Ici'];
      setAvailableColumns(nextColumns);
    } else if (columnResult.status === 'rejected') {
      console.error('Stok kolonlari yuklenemedi:', columnResult.reason);
    }

    if (unitsResult.status === 'fulfilled' && unitsResult.value?.units?.length) {
      setStockUnits(unitsResult.value.units);
    } else if (unitsResult.status === 'rejected') {
      console.error('Stok birimleri yuklenemedi:', unitsResult.reason);
    }

    if (responsiblesResult.status === 'fulfilled') {
      setResponsibles(responsiblesResult.value.responsibles || []);
    } else if (responsiblesResult.status === 'rejected') {
      console.error('Sorumlu listesi yuklenemedi:', responsiblesResult.reason);
    }

    if (settingsResult.status === 'fulfilled') {
      const warehouses = settingsResult.value?.includedWarehouses || [];
      setIncludedWarehouses(warehouses);
      if (!orderWarehouse && warehouses.length > 0) {
        setOrderWarehouse(resolveWarehouseValue(String(warehouses[0])));
      }
    } else if (settingsResult.status === 'rejected') {
      console.error('Settings yuklenemedi:', settingsResult.reason);
    }
  };

  const fetchPurchasedProducts = async (customerId: string, limit: number) => {
    try {
      const { products } = await adminApi.getCustomerPurchasedProducts(customerId, limit);
      setPurchasedProducts(products || []);
      setSelectedPurchasedCodes(new Set());
    } catch (error) {
      console.error('Daha once alinan urunler alinmadi:', error);
      toast.error('Daha once alinan urunler alinmadi.');
      setPurchasedProducts([]);
      setSelectedPurchasedCodes(new Set());
    }
  };

  const fetchCustomerContacts = async (customerId: string) => {
    setContactsLoading(true);
    try {
      const { contacts } = await adminApi.getCustomerContacts(customerId);
      setCustomerContacts(contacts || []);
      if (contacts && contacts.length > 0) {
        setSelectedContactId(contacts[0].id);
      }
    } catch (error) {
      console.error('İletişim kişileri yüklenemedi:', error);
      setCustomerContacts([]);
      setSelectedContactId('');
    } finally {
      setContactsLoading(false);
    }
  };

  const fetchSearchResults = async (term?: string) => {
    const trimmedTerm = term?.trim();
    setSearchLoading(true);
    try {
      const result = await adminApi.getProducts({
        search: trimmedTerm || undefined,
        limit: 50,
        sortBy: 'name',
        sortOrder: 'asc',
        customerId: selectedCustomer?.id || undefined,
      });
      setSearchResults(result.products || []);
    } catch (error) {
      console.error('Urun aramasi basarisiz:', error);
      toast.error('Urun aramasi basarisiz.');
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const customerOptions = useMemo(() => {
    return customers
      .filter((customer) => customer.mikroCariCode)
      .map((customer) => ({
        userId: customer.id,
        code: customer.mikroCariCode,
        name: customer.displayName || customer.name,
        city: customer.city,
        district: customer.district,
        phone: customer.phone,
        isLocked: customer.isLocked || false,
        groupCode: customer.groupCode,
        sectorCode: customer.sectorCode,
        paymentTerm: customer.paymentTerm,
        paymentPlanNo: customer.paymentPlanNo ?? null,
        paymentPlanCode: customer.paymentPlanCode ?? null,
        paymentPlanName: customer.paymentPlanName ?? null,
        hasEInvoice: customer.hasEInvoice || false,
        balance: customer.balance || 0,
      }));
  }, [customers]);

  const filteredPurchasedProducts = useMemo(() => {
    const tokens = buildSearchTokens(purchasedSearch);
    if (tokens.length === 0) return purchasedProducts;
    return purchasedProducts.filter((product) => {
      const haystack = normalizeSearchText(`${product.mikroCode || ''} ${product.name || ''}`);
      return matchesSearchTokens(haystack, tokens);
    });
  }, [purchasedProducts, purchasedSearch]);

  const filteredSearchResults = useMemo(() => {
    const tokens = buildSearchTokens(searchTerm);
    if (tokens.length === 0) return searchResults;
    return searchResults.filter((product) => {
      const haystack = normalizeSearchText(`${product.mikroCode || ''} ${product.name || ''}`);
      return matchesSearchTokens(haystack, tokens);
    });
  }, [searchResults, searchTerm]);

  const sortPoolProducts = (items: QuoteProduct[]) => {
    if (poolSort === 'default') return items;
    const sorted = [...items];
    switch (poolSort) {
      case 'stock1_desc':
        sorted.sort((a, b) => getStockNumber(b, '1') - getStockNumber(a, '1'));
        break;
      case 'stock6_desc':
        sorted.sort((a, b) => getStockNumber(b, '6') - getStockNumber(a, '6'));
        break;
      case 'price_asc':
        sorted.sort((a, b) => getProductSortPrice(a) - getProductSortPrice(b));
        break;
      case 'price_desc':
        sorted.sort((a, b) => getProductSortPrice(b) - getProductSortPrice(a));
        break;
      default:
        break;
    }
    return sorted;
  };

  const sortedPurchasedProducts = useMemo(
    () => sortPoolProducts(filteredPurchasedProducts),
    [filteredPurchasedProducts, poolSort]
  );

  const sortedSearchResults = useMemo(
    () => sortPoolProducts(filteredSearchResults),
    [filteredSearchResults, poolSort]
  );

  const updatePoolColorRule = (id: string, patch: Partial<PoolColorRule>) => {
    setPoolColorRules((prev) => prev.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  };

  const addPoolColorRule = () => {
    setPoolColorRules((prev) => [...prev, createPoolColorRule({ enabled: true })]);
  };

  const removePoolColorRule = (id: string) => {
    setPoolColorRules((prev) => prev.filter((rule) => rule.id !== id));
  };

  const getPoolColorClass = (product: QuoteProduct) => {
    if (poolColorRules.length === 0) return '';
    const colorMap: Record<PoolColorRule['color'], string> = {
      green: 'bg-emerald-50 border-emerald-200',
      yellow: 'bg-amber-50 border-amber-200',
      blue: 'bg-blue-50 border-blue-200',
      red: 'bg-rose-50 border-rose-200',
      slate: 'bg-slate-50 border-slate-200',
    };
    for (const rule of poolColorRules) {
      if (!rule.enabled) continue;
      const value = getStockNumber(product, rule.warehouse);
      const threshold = Number(rule.threshold) || 0;
      let matches = false;
      switch (rule.operator) {
        case '>':
          matches = value > threshold;
          break;
        case '>=':
          matches = value >= threshold;
          break;
        case '<':
          matches = value < threshold;
          break;
        case '<=':
          matches = value <= threshold;
          break;
        case '=':
          matches = value === threshold;
          break;
        default:
          matches = false;
          break;
      }
      if (matches) {
        return colorMap[rule.color] || '';
      }
    }
    return '';
  };

  const selectedPurchasedCount = selectedPurchasedCodes.size;
  const selectedSearchCount = selectedSearchCodes.size;

  const getPoolQuantityInputValue = (productCode: string) => {
    const code = String(productCode || '').trim().toUpperCase();
    if (!code) return '1';
    const saved = poolQuantityInputs[code];
    return saved !== undefined ? saved : '1';
  };

  const getPoolQuantityValue = (productCode: string) => {
    const raw = getPoolQuantityInputValue(productCode).trim();
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  };

  const setPoolQuantityInputValue = (productCode: string, value: string) => {
    const code = String(productCode || '').trim().toUpperCase();
    if (!code) return;
    const digitsOnly = String(value || '').replace(/[^\d]/g, '');
    setPoolQuantityInputs((prev) => ({ ...prev, [code]: digitsOnly }));
  };

  const normalizePoolQuantityInputValue = (productCode: string) => {
    const code = String(productCode || '').trim().toUpperCase();
    if (!code) return;
    setPoolQuantityInputs((prev) => ({
      ...prev,
      [code]: String(getPoolQuantityValue(code)),
    }));
  };

  const selectPoolQuantityInput = (event: ReactFocusEvent<HTMLInputElement> | ReactMouseEvent<HTMLInputElement>) => {
    event.stopPropagation();
    event.currentTarget.select();
  };

  const togglePurchasedSelection = (code: string) => {
    setSelectedPurchasedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const selectAllPurchased = () => {
    const codes = filteredPurchasedProducts.map((product) => product.mikroCode);
    setSelectedPurchasedCodes(new Set(codes));
  };

  const clearPurchasedSelection = () => {
    setSelectedPurchasedCodes(new Set());
  };

  const addSelectedPurchasedToQuote = () => {
    if (selectedPurchasedCount === 0) {
      toast.error('Secili urun yok.');
      return;
    }
    const selectedProducts = purchasedProducts.filter((product) =>
      selectedPurchasedCodes.has(product.mikroCode)
    );
    const quantityByCode = Object.fromEntries(
      selectedProducts.map((product) => [product.mikroCode, getPoolQuantityValue(product.mikroCode)])
    );
    addProductsToQuote(selectedProducts, quantityByCode);
    setSelectedPurchasedCodes(new Set());
  };

  const loadQuoteForEdit = async (quoteId: string) => {
    setLoadingQuote(true);
    try {
      const { quote } = await adminApi.getQuoteById(quoteId);
      setEditingQuote(quote);

      const matchedCustomer = customers.find((item) => item.id === quote.customer?.id);
      setSelectedCustomer(matchedCustomer || quote.customer || null);
      setHasManualCustomerChange(false);
      setSelectedContactId(quote.contactId || '');
      setValidityDate(quote.validityDate ? quote.validityDate.slice(0, 10) : '');
      setNote(quote.note || quote.documentNo || '');
      setVatZeroed(Boolean(quote.vatZeroed));
      setSelectedResponsibleCode(quote.responsibleCode || '');

      const mappedItems = (quote.items || []).map(buildQuoteItemFromExisting);
      setQuoteItems(mappedItems);
    } catch (error) {
      console.error('Teklif yuklenemedi:', error);
      toast.error('Teklif yuklenemedi');
    } finally {
      setLoadingQuote(false);
    }
  };

  const loadOrderForEdit = async (orderId: string) => {
    setLoadingOrder(true);
    try {
      const { order } = await adminApi.getOrderById(orderId);
      setEditingOrderCustomerCode(String(order.user?.mikroCariCode || '').trim());
      setOrderCustomerOrderNumber(order.customerOrderNumber || '');
      setOrderDocumentDescription(order.deliveryLocation || order.adminNote || '');
      setNote(order.adminNote || '');

      const orderItems = order.items || [];
      const invoicedOrderNumber =
        orderItems.find((item) => item.priceType !== 'WHITE' && item.mikroOrderId)?.mikroOrderId ||
        order.mikroOrderIds?.[0] ||
        '';
      const whiteOrderNumber =
        orderItems.find((item) => item.priceType === 'WHITE' && item.mikroOrderId)?.mikroOrderId ||
        order.mikroOrderIds?.find((id) => id !== invoicedOrderNumber) ||
        '';
      const parsedInvoicedOrder = parseMikroOrderNumber(invoicedOrderNumber);
      const parsedWhiteOrder = parseMikroOrderNumber(whiteOrderNumber);
      setOrderInvoicedSeries(parsedInvoicedOrder.series);
      setOrderInvoicedSira(parsedInvoicedOrder.sira);
      setOrderWhiteSeries(parsedWhiteOrder.series);
      setOrderWhiteSira(parsedWhiteOrder.sira);
      setOriginalOrderInvoicedNumber(parsedInvoicedOrder);
      setOriginalOrderWhiteNumber(parsedWhiteOrder);

      const productCodes = Array.from(
        new Set(orderItems.map((item) => String(item.mikroCode || '').trim()).filter(Boolean))
      );
      const productMap = new Map<string, any>();
      if (productCodes.length > 0) {
        const productResult = await adminApi.getProductsByCodes(productCodes);
        (productResult.products || []).forEach((product: any) => {
          const code = String(product?.mikroCode || '').trim();
          if (code) {
            productMap.set(code, product);
          }
        });
      }

      const mappedItems: QuoteItemForm[] = orderItems.map((item) => {
        const product = productMap.get(String(item.mikroCode || '').trim());
        const priceType = item.priceType === 'WHITE' ? 'WHITE' : 'INVOICED';
        const vatRate = priceType === 'WHITE'
          ? 0
          : Number(product?.vatRate ?? 0.2);

        return {
          id: item.id,
          productId: product?.id,
          productCode: item.mikroCode,
          productName: item.productName || product?.name || item.mikroCode,
          unit: product?.unit || 'ADET',
          unit2: item.unit2 || product?.unit2 || null,
          unit2Factor: item.unit2Factor ?? product?.unit2Factor ?? null,
          selectedUnit: item.selectedUnit || item.unit || product?.unit || 'ADET',
          quantity: Number(item.quantity) || 1,
          priceSource: 'MANUAL',
          unitPrice: Number(item.unitPrice) || 0,
          manualPriceInput: undefined,
          vatRate,
          vatZeroed: priceType === 'WHITE',
          priceType,
          isManualLine: false,
          manualVatRate: undefined,
          lineDescription: item.lineNote || '',
          manualImageUrl: null,
          responsibilityCenter: item.responsibilityCenter || '',
          reserveQty: 0,
          lastSales: product?.lastSales || [],
          lastQuotes: product?.lastQuotes || [],
          selectedSaleIndex: undefined,
          lastEntryPrice: product?.lastEntryPrice ?? null,
          lastEntryDate: product?.lastEntryDate ?? null,
          currentCost: product?.currentCost ?? null,
          currentCostDate: product?.currentCostDate ?? null,
          mikroPriceLists: product?.mikroPriceLists,
        };
      });

      setQuoteItems(mappedItems);
      setVatZeroed(mappedItems.length > 0 && mappedItems.every((item) => item.vatRate <= 0));
    } catch (error) {
      console.error('Siparis yuklenemedi:', error);
      toast.error('Siparis yuklenemedi');
    } finally {
      setLoadingOrder(false);
    }
  };

  const toggleSearchSelection = (code: string) => {
    setSelectedSearchCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const selectAllSearch = () => {
    const codes = sortedSearchResults.map((product) => product.mikroCode);
    setSelectedSearchCodes(new Set(codes));
  };

  const clearSearchSelection = () => {
    setSelectedSearchCodes(new Set());
  };

  const addSelectedSearchToQuote = () => {
    if (selectedSearchCount === 0) {
      toast.error('Secili urun yok.');
      return;
    }
    const selectedProducts = searchResults.filter((product) =>
      selectedSearchCodes.has(product.mikroCode)
    );
    const quantityByCode = Object.fromEntries(
      selectedProducts.map((product) => [product.mikroCode, getPoolQuantityValue(product.mikroCode)])
    );
    addProductsToQuote(selectedProducts, quantityByCode);
    setSelectedSearchCodes(new Set());
  };

  const buildQuoteItem = (product: QuoteProduct, quantity = 1): QuoteItemForm => {
    const purchasedMatch = purchasedProducts.find((item) => item.mikroCode === product.mikroCode);
    const sourceProduct = purchasedMatch || product;

    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      productId: sourceProduct.id,
      productCode: sourceProduct.mikroCode,
      productName: sourceProduct.name,
      unit: sourceProduct.unit,
      unit2: sourceProduct.unit2 || null,
      unit2Factor: sourceProduct.unit2Factor ?? null,
      selectedUnit: sourceProduct.unit || 'ADET',
      quantity,
      priceSource: '',
      unitPrice: undefined,
      vatRate: sourceProduct.vatRate || 0,
      vatZeroed: false,
      priceType: 'INVOICED',
      isManualLine: false,
      reserveQty: 0,
      manualImageUrl: null,
      lastSales: sourceProduct.lastSales || [],
      lastQuotes: sourceProduct.lastQuotes || [],
      categoryLastPurchase: getCategoryLastPurchaseInfo(sourceProduct),
      categoryLastPurchaseDate: sourceProduct.categoryLastPurchaseDate ?? null,
      categoryMonthsSinceLastPurchase: sourceProduct.categoryMonthsSinceLastPurchase ?? null,
      lastEntryPrice: sourceProduct.lastEntryPrice ?? null,
      lastEntryDate: sourceProduct.lastEntryDate ?? null,
      currentCost: sourceProduct.currentCost ?? null,
      currentCostDate: sourceProduct.currentCostDate ?? null,
      mikroPriceLists: sourceProduct.mikroPriceLists,
    };
  };

  const buildQuoteItemFromExisting = (item: QuoteItem): QuoteItemForm => {
    const isManualLine = item.isManualLine;
    const fallbackSale =
      item.priceSource === 'LAST_SALE'
        ? {
            saleDate: item.sourceSaleDate || new Date().toISOString(),
            unitPrice: item.sourceSalePrice ?? item.unitPrice,
            quantity: item.sourceSaleQuantity ?? item.quantity,
            vatZeroed: item.sourceSaleVatZeroed ?? item.vatZeroed,
          }
        : undefined;

    const normalizePrice = (value?: number) =>
      Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
    const normalizeDateKey = (value?: string) => {
      if (!value) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      return date.toISOString().slice(0, 10);
    };

    let lastSales = !isManualLine && Array.isArray(item.lastSales) ? [...item.lastSales] : [];
    let selectedSaleIndex: number | undefined;

    if (fallbackSale) {
      const fallbackDateKey = normalizeDateKey(fallbackSale.saleDate);
      const fallbackPrice = normalizePrice(fallbackSale.unitPrice);
      const matchIndex = lastSales.findIndex((sale) => (
        normalizeDateKey(sale.saleDate) === fallbackDateKey
        && normalizePrice(sale.unitPrice) === fallbackPrice
      ));

      if (matchIndex >= 0) {
        selectedSaleIndex = matchIndex;
      } else {
        lastSales = [fallbackSale, ...lastSales];
        selectedSaleIndex = 0;
      }
    }

    const priceListNo = item.priceListNo ?? undefined;
    const mikroPriceLists = !isManualLine && item.mikroPriceLists
      ? item.mikroPriceLists
      : priceListNo
        ? { [priceListNo]: item.unitPrice }
        : undefined;

    return {
      id: item.id,
      productId: (item as any).productId,
      productCode: item.productCode,
      productName: item.productName,
      unit: item.unit || item.product?.unit || 'ADET',
      unit2: item.unit2 || item.product?.unit2 || null,
      unit2Factor: item.unit2Factor ?? item.product?.unit2Factor ?? null,
      selectedUnit: item.selectedUnit || item.unit || item.product?.unit || 'ADET',
      quantity: item.quantity,
      priceSource: item.priceSource,
      priceListNo,
      unitPrice: item.unitPrice,
      manualPriceInput: undefined,
      vatRate: item.vatRate,
      vatZeroed: item.vatZeroed,
      priceType: item.priceType === 'WHITE' ? 'WHITE' : 'INVOICED',
      isManualLine,
      manualVatRate: isManualLine ? item.vatRate : undefined,
      lineDescription: item.lineDescription || '',
      reserveQty: 0,
      manualImageUrl: item.manualImageUrl ?? null,
      lastSales,
      lastQuotes: item.lastQuotes || [],
      selectedSaleIndex,
      lastEntryPrice: item.product?.lastEntryPrice ?? null,
      lastEntryDate: item.product?.lastEntryDate ?? null,
      currentCost: item.product?.currentCost ?? null,
      currentCostDate: item.product?.currentCostDate ?? null,
      mikroPriceLists,
    };
  };

  const addProductsToQuote = (productsToAdd: QuoteProduct[], quantityByCode?: Record<string, number>) => {
    const validProducts = productsToAdd.filter((product) => product?.mikroCode);
    if (validProducts.length === 0) {
      toast.error('Urun bulunamadi.');
      return;
    }

    setQuoteItems((prev) => [
      ...prev,
      ...validProducts.map((product) => buildQuoteItem(product, quantityByCode?.[product.mikroCode] ?? 1)),
    ]);
    toast.success(`${validProducts.length} urun eklendi.`);
  };

  const addProductToQuote = (product: QuoteProduct, quantity?: number) => {
    addProductsToQuote([product], quantity ? { [product.mikroCode]: quantity } : undefined);
  };

  // ===== Stok ailesi yonlendirme: kalemi alternatifle DEGISTIR =====
  const applyFamilySwap = async (
    item: QuoteItemForm,
    rec: { productCode: string; productName?: string }
  ) => {
    try {
      const { products } = await adminApi.getProductsByCodes([rec.productCode]);
      const alt = products && products[0];
      if (!alt) {
        toast.error('Onerilen urun bulunamadi.');
        return;
      }
      const newItem = buildQuoteItem(alt as QuoteProduct, item.quantity);
      setQuoteItems((prev) => prev.map((it) => (it.id === item.id ? { ...newItem, id: it.id } : it)));
      toast.success(`Kalem "${alt.name}" ile degistirildi.`);
    } catch {
      toast.error('Degistirme basarisiz.');
    }
  };

  // ===== Stok ailesi yonlendirme: SPLIT (mevcudu azalt + alternatifi yeni kalem ekle) =====
  const applyFamilySplit = async (
    item: QuoteItemForm,
    rec: { productCode: string; fromAlt?: number; fromEntered?: number }
  ) => {
    const fromAlt = Number(rec.fromAlt) || 0;
    const fromEntered = Number(rec.fromEntered) || 0;
    if (fromAlt <= 0) {
      toast.error('Aktarilacak miktar yok.');
      return;
    }
    try {
      const { products } = await adminApi.getProductsByCodes([rec.productCode]);
      const alt = products && products[0];
      if (!alt) {
        toast.error('Onerilen urun bulunamadi.');
        return;
      }
      const altItem = buildQuoteItem(alt as QuoteProduct, fromAlt);
      setQuoteItems((prev) => {
        const next: QuoteItemForm[] = [];
        for (const it of prev) {
          if (it.id === item.id) {
            if (fromEntered > 0) {
              next.push({ ...it, quantity: Math.max(0, roundUnitValue(fromEntered)) });
            }
            next.push(altItem); // alternatifi hemen ardina koy
          } else {
            next.push(it);
          }
        }
        return next;
      });
      toast.success(`${fromAlt} adet yatan stoktan "${alt.name}" eklendi.`);
    } catch {
      toast.error('Bolme basarisiz.');
    }
  };

  const handleRecommendationAdd = (product: QuoteProduct) => {
    if (quoteProductCodeSet.has(product.mikroCode)) {
      toast.error('Urun zaten ekli');
      return;
    }
    addProductToQuote(product);
  };

  const addManualLine = () => {
    const fallbackUnit = stockUnits[0] || 'ADET';
    const newItem: QuoteItemForm = {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      productCode: 'B101071',
      productName: '',
      unit: fallbackUnit,
      unit2: null,
      unit2Factor: null,
      selectedUnit: fallbackUnit,
      quantity: 1,
      priceSource: 'MANUAL',
      unitPrice: undefined,
      manualPriceInput: '',
      vatRate: 0.2,
      vatZeroed: false,
      priceType: 'INVOICED',
      isManualLine: true,
      manualVatRate: 0.2,
      lineDescription: '',
      reserveQty: 0,
      manualImageUrl: null,
    };

    setQuoteItems((prev) => [...prev, newItem]);
  };

  const toggleQuoteHistory = (id: string) => {
    setExpandedQuoteHistory((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const removeItem = (id: string) => {
    setQuoteItems((prev) => prev.filter((item) => item.id !== id));
  };

  const openPriceRequestModal = (item: QuoteItemForm) => {
    setPriceRequestTarget(item);
    setPriceRequestPriority('NORMAL');
    setPriceRequestNote('');
    setPriceRequestStockPayload(createEmptyPriceRequestStockPayload(item.productName || '', getSelectedUnit(item)));
  };

  const updatePriceRequestStockPayload = (patch: Record<string, any>) => {
    setPriceRequestStockPayload((current: any) => ({ ...current, ...patch }));
  };

  const updatePriceRequestMargin = (index: number, value: string) => {
    setPriceRequestStockPayload((current: any) => {
      const margins = [...(current.margins || [])];
      margins[index] = value;
      return { ...current, margins };
    });
  };

  const submitPriceVerificationRequest = async () => {
    if (!priceRequestTarget) return;
    setPriceRequestSaving(true);
    try {
      const isNewStock = Boolean(priceRequestTarget.isManualLine);
      await adminApi.createPriceVerificationRequest({
        type: isNewStock ? 'NEW_STOCK' : 'EXISTING_PRODUCT',
        priority: priceRequestPriority,
        productCode: isNewStock ? undefined : priceRequestTarget.productCode,
        productName: isNewStock ? priceRequestStockPayload.name : priceRequestTarget.productName,
        unit: isNewStock ? priceRequestStockPayload.mainUnit : getSelectedUnit(priceRequestTarget),
        quantity: getDisplayQuantity(priceRequestTarget),
        customerId: selectedCustomer?.id || undefined,
        customerCode: selectedCustomer?.mikroCariCode || editingOrderCustomerCode || undefined,
        customerName: selectedCustomer?.displayName || selectedCustomer?.mikroName || selectedCustomer?.name || undefined,
        sourceType: isOrderMode ? 'ORDER' : 'QUOTE',
        sourceRef: editOrderId || editingQuote?.quoteNumber || (isOrderMode ? 'ORDER_DRAFT' : 'QUOTE_DRAFT'),
        sourceUrl: typeof window !== 'undefined' ? window.location.pathname + window.location.search : undefined,
        currentUnitPrice: getDisplayUnitPrice(priceRequestTarget) || undefined,
        salesNote: priceRequestNote || undefined,
        stockCreatePayload: isNewStock ? priceRequestStockPayload : undefined,
      });
      toast.success('Fiyat teyit talebi satin almaya gonderildi');
      setPriceRequestTarget(null);
    } catch (error: any) {
      const details = error.response?.data?.details;
      toast.error(Array.isArray(details) && details.length ? details.join(', ') : (error.response?.data?.error || 'Fiyat teyit talebi olusturulamadi'));
    } finally {
      setPriceRequestSaving(false);
    }
  };

  const updateItem = (id: string, patch: Partial<QuoteItemForm>) => {
    setQuoteItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const handleOrderSeriesChange = (
    priceType: 'INVOICED' | 'WHITE',
    value: string
  ) => {
    if (priceType === 'INVOICED') {
      setOrderInvoicedSeries(value);
      if (
        isOrderEditMode
        && value.trim() !== originalOrderInvoicedNumber.series
        && orderInvoicedSira.trim() === originalOrderInvoicedNumber.sira
      ) {
        setOrderInvoicedSira('');
      }
      return;
    }

    setOrderWhiteSeries(value);
    if (
      isOrderEditMode
      && value.trim() !== originalOrderWhiteNumber.series
      && orderWhiteSira.trim() === originalOrderWhiteNumber.sira
    ) {
      setOrderWhiteSira('');
    }
  };

  const handleManualImageUpload = async (item: QuoteItemForm, file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Lutfen sadece resim dosyasi yukleyin');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Dosya boyutu 5MB altinda olmali');
      return;
    }

    setManualImageUploading((prev) => ({ ...prev, [item.id]: true }));
    const formData = new FormData();
    formData.append('image', file);

    try {
      const result = await adminApi.uploadQuoteItemImage(formData);
      updateItem(item.id, { manualImageUrl: result.imageUrl });
      toast.success('Gorsel yuklendi');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Gorsel yuklenemedi');
    } finally {
      setManualImageUploading((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }
  };

  const handleManualImageFileChange = (item: QuoteItemForm, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;
    handleManualImageUpload(item, file);
  };

  const removeManualImage = (itemId: string) => {
    updateItem(itemId, { manualImageUrl: null });
  };

  const handlePriceSourceChange = (item: QuoteItemForm, value: string) => {
    if (item.isManualLine) return;
    const nextSource = value as QuoteItemForm['priceSource'];
    updateItem(item.id, {
      priceSource: nextSource,
      priceListNo: undefined,
      unitPrice: nextSource === 'MANUAL' ? item.unitPrice : undefined,
      manualPriceInput: nextSource === 'MANUAL' ? formatManualPriceInput(getDisplayUnitPrice(item)) : undefined,
      selectedSaleIndex: undefined,
      manualMarginEntry: undefined,
      manualMarginCost: undefined,
    });
  };

  const handlePriceListChange = (item: QuoteItemForm, value: string) => {
    if (!value) {
      updateItem(item.id, { priceListNo: undefined, unitPrice: undefined });
      return;
    }
    const listNo = Number(value);
    const listPrice = getMikroListPrice(item.mikroPriceLists, listNo);
    updateItem(item.id, {
      priceListNo: listNo,
      unitPrice: listPrice || undefined,
      manualPriceInput: undefined,
    });
  };

  const handleLastSaleChange = (item: QuoteItemForm, value: string) => {
    if (!value) {
      updateItem(item.id, {
        selectedSaleIndex: undefined,
        unitPrice: undefined,
        vatZeroed: false,
      });
      return;
    }
    const saleIndex = Number(value);
    const sale = item.lastSales?.[saleIndex];
    updateItem(item.id, {
      selectedSaleIndex: saleIndex,
      unitPrice: sale?.unitPrice || undefined,
      vatZeroed: sale?.vatZeroed || false,
      manualPriceInput: undefined,
    });
  };

  const handleManualPriceChange = (item: QuoteItemForm, value: string) => {
    const trimmed = value.trim();
    const parsed = trimmed.length > 0 ? parseDecimalInput(trimmed).value : undefined;
    const nextPrice = trimmed.length === 0 || parsed === undefined
      ? undefined
      : convertPriceToBaseUnit(parsed, getSelectedUnit(item), item.unit, item.unit2, item.unit2Factor);
    updateItem(item.id, {
      unitPrice: nextPrice,
      manualPriceInput: value,
      manualMarginEntry: undefined,
      manualMarginCost: undefined,
    });
  };

  const handleQuantityChange = (item: QuoteItemForm, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      updateItem(item.id, { quantity: 0 });
      return;
    }
    const parsed = parseDecimalInput(trimmed).value;
    const baseQuantity = parsed !== undefined
      ? convertQuantityToBaseUnit(parsed, getSelectedUnit(item), item.unit, item.unit2, item.unit2Factor)
      : item.quantity;
    updateItem(item.id, {
      quantity: Math.max(0, roundUnitValue(baseQuantity)),
    });
  };

  const handleSelectedUnitChange = (item: QuoteItemForm, value: string) => {
    updateItem(item.id, {
      selectedUnit: value || item.unit || 'ADET',
      manualPriceInput: undefined,
    });
  };

  const handleReserveQuantityChange = (item: QuoteItemForm, value: string) => {
    const parsed = parseDecimalInput(value).value;
    const displayReserve = parsed !== undefined ? Math.max(0, parsed) : 0;
    const reserveQty = convertQuantityToBaseUnit(
      displayReserve,
      getSelectedUnit(item),
      item.unit,
      item.unit2,
      item.unit2Factor
    );
    updateItem(item.id, { reserveQty: Math.max(0, roundUnitValue(reserveQty)) });
  };

  const handleManualMarginChange = (
    item: QuoteItemForm,
    source: 'entry' | 'cost',
    value: string
  ) => {
    const trimmed = value.trim();
    const parsed = trimmed.length > 0 ? Number(trimmed) : undefined;
    const margin = Number.isFinite(parsed as number) ? (parsed as number) : undefined;
    const base = source === 'entry' ? (item.lastEntryPrice || 0) : (item.currentCost || 0);
    const nextPrice = base > 0 && margin !== undefined
      ? base * (1 + margin / 100)
      : undefined;

    updateItem(item.id, {
      unitPrice: nextPrice ?? item.unitPrice,
      manualPriceInput: undefined,
      manualMarginEntry: source === 'entry' ? margin : undefined,
      manualMarginCost: source === 'cost' ? margin : undefined,
    });
  };

  const handleManualVatChange = (item: QuoteItemForm, value: string) => {
    const rate = value === '0.01' ? 0.01 : value === '0.1' ? 0.1 : 0.2;
    const code = rate === 0.01 ? 'B110365' : rate === 0.1 ? 'B101070' : 'B101071';
    updateItem(item.id, {
      manualVatRate: rate,
      vatRate: rate,
      productCode: code,
    });
  };

  const applyPriceListToAll = () => {
    if (!bulkPriceListNo) {
      toast.error('Fiyat listesi secin.');
      return;
    }

    const listNo = Number(bulkPriceListNo);
    setQuoteItems((prev) =>
      prev.map((item) => {
        if (item.isManualLine) return item;
        const listPrice = getMikroListPrice(item.mikroPriceLists, listNo);
        return {
          ...item,
          priceSource: 'PRICE_LIST',
          priceListNo: listNo,
          unitPrice: listPrice || undefined,
          manualPriceInput: undefined,
          selectedSaleIndex: undefined,
          manualMarginEntry: undefined,
          manualMarginCost: undefined,
        };
      })
    );
  };


  const applyResponsibilityCenterToAll = () => {
    const value = bulkResponsibilityCenter.trim();
    if (!value) {
      toast.error('Sorumluluk merkezi girin.');
      return;
    }
    setQuoteItems((prev) => prev.map((item) => ({ ...item, responsibilityCenter: value })));
  };

  const applyLastSaleToAll = () => {
    let applied = 0;
    let missing = 0;

    setQuoteItems((prev) =>
      prev.map((item) => {
        if (item.isManualLine) return item;
        const sale = item.lastSales?.[0];
        if (!sale) {
          missing += 1;
          return item;
        }
        applied += 1;
        return {
          ...item,
          priceSource: 'LAST_SALE',
          selectedSaleIndex: 0,
          unitPrice: sale.unitPrice || undefined,
          vatZeroed: sale.vatZeroed || false,
          priceListNo: undefined,
          manualPriceInput: undefined,
          manualMarginEntry: undefined,
          manualMarginCost: undefined,
        };
      })
    );

    if (applied === 0) {
      toast.error('Son satis bulunamadi.');
      return;
    }

    if (missing > 0) {
      toast.success(`${applied} satira uygulandi. ${missing} satirda satis yok.`);
      return;
    }

    toast.success('Son satis tum satirlara uygulandi.');
  };

  const handleGlobalVatZeroChange = (value: boolean) => {
    setVatZeroed(value);
    setQuoteItems((prev) => prev.map((item) => ({ ...item, vatZeroed: value })));
  };

  const saveQuotePreferences = async () => {
    try {
      await adminApi.updateQuotePreferences({
        lastSalesCount,
        whatsappTemplate,
        responsibleCode: selectedResponsibleCode || null,
      });
      toast.success('Tercihler kaydedildi.');
    } catch (error) {
      toast.error('Tercihler kaydedilemedi.');
    }
  };

  const savePoolPreferences = async () => {
    setSavingPoolPreferences(true);
    try {
      await adminApi.updateQuotePreferences({
        poolSort,
        poolPriceListNo: poolPriceListNo === '' ? null : Number(poolPriceListNo),
        poolColorRules,
      });
      toast.success('Urun havuzu gorunumu kaydedildi.');
    } catch (error) {
      console.error('Urun havuzu tercihleri kaydedilemedi:', error);
      toast.error('Urun havuzu tercihleri kaydedilemedi.');
    } finally {
      setSavingPoolPreferences(false);
    }
  };

  const handleLastSalesCountChange = async (value: number) => {
    const nextValue = Math.max(1, Math.min(10, value));
    setLastSalesCount(nextValue);
    try {
      await adminApi.updateQuotePreferences({ lastSalesCount: nextValue });
    } catch (error) {
      console.error('Son satis adedi guncellenemedi:', error);
    }
  };

  const saveColumnPreferences = async () => {
    setSavingColumns(true);
    try {
      const widthKeys = new Set([
        ...Object.keys(BASE_COLUMN_WIDTHS),
        ...selectedColumns.map((column) => `stock:${column}`),
      ]);
      const columnWidthsPayload: Record<string, number> = {};
      widthKeys.forEach((key) => {
        const width = columnWidths[key];
        if (Number.isFinite(width)) {
          columnWidthsPayload[key] = clampColumnWidth(key, width);
        }
      });

      await Promise.all([
        adminApi.updateSearchPreferences({ stockColumns: selectedColumns }),
        adminApi.updateQuotePreferences({ columnWidths: columnWidthsPayload }),
      ]);
      setShowColumnSelector(false);
      toast.success('Gorunum kaydedildi.');
    } catch (error) {
      console.error('Kolon tercihleri kaydedilemedi:', error);
      toast.error('Gorunum kaydedilemedi.');
    } finally {
      setSavingColumns(false);
    }
  };

  const selectAllColumns = () => {
    setSelectedColumns(availableColumns);
  };

  const clearAllColumns = () => {
    setSelectedColumns([]);
  };

  const handleColumnDragStart = (column: string) => (event: DragEvent<HTMLDivElement>) => {
    setDraggingColumn(column);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', column);
  };

  const handleColumnDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleColumnDrop = (targetColumn: string) => (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const sourceColumn = draggingColumn || event.dataTransfer.getData('text/plain');
    if (!sourceColumn || sourceColumn === targetColumn) {
      setDraggingColumn(null);
      return;
    }
    const currentOrder = reorderableColumns;
    const sourceIndex = currentOrder.indexOf(sourceColumn);
    const targetIndex = currentOrder.indexOf(targetColumn);
    if (sourceIndex === -1 || targetIndex === -1) {
      setDraggingColumn(null);
      return;
    }
    const nextOrder = [...currentOrder];
    const [moved] = nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(targetIndex, 0, moved);
    setSelectedColumns(nextOrder.filter((column) => column !== LINE_DESCRIPTION_KEY));
    setLineDescriptionIndex(nextOrder.indexOf(LINE_DESCRIPTION_KEY));

    setDraggingColumn(null);
  };

  const handleColumnDragEnd = () => {
    setDraggingColumn(null);
  };

  const handleRowDragStart = (itemId: string) => (event: DragEvent<HTMLButtonElement>) => {
    setDraggingItemId(itemId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', itemId);
  };

  const handleRowDragOver = (event: DragEvent<HTMLTableRowElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    autoScrollForDrag(event.clientY);
  };

  const handleRowDrop = (targetId: string) => (event: DragEvent<HTMLTableRowElement>) => {
    event.preventDefault();
    const sourceId = draggingItemId || event.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === targetId) {
      setDraggingItemId(null);
      return;
    }

    setQuoteItems((prev) => {
      const next = [...prev];
      const sourceIndex = next.findIndex((item) => item.id === sourceId);
      const targetIndex = next.findIndex((item) => item.id === targetId);
      if (sourceIndex === -1 || targetIndex === -1) return prev;
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });

    setDraggingItemId(null);
  };

  const handleRowDragEnd = () => {
    setDraggingItemId(null);
  };

  const handleTableScroll = () => {
    if (scrollSyncRef.current) return;
    const container = tableScrollRef.current;
    if (!container || !tableScrollBarRef.current) return;
    scrollSyncRef.current = true;
    tableScrollBarRef.current.scrollLeft = container.scrollLeft;
    requestAnimationFrame(() => {
      scrollSyncRef.current = false;
    });
  };

  const handleScrollBarScroll = () => {
    if (scrollSyncRef.current) return;
    const bar = tableScrollBarRef.current;
    if (!bar || !tableScrollRef.current) return;
    scrollSyncRef.current = true;
    tableScrollRef.current.scrollLeft = bar.scrollLeft;
    requestAnimationFrame(() => {
      scrollSyncRef.current = false;
    });
  };

  const handleTableDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    autoScrollForDrag(event.clientY);
  };

  useEffect(() => {
    if (!draggingItemId) return undefined;
    const handleWindowDragOver = (event: globalThis.DragEvent) => {
      event.preventDefault();
      autoScrollForDrag(event.clientY);
    };
    window.addEventListener('dragover', handleWindowDragOver);
    return () => window.removeEventListener('dragover', handleWindowDragOver);
  }, [draggingItemId]);

  const autoScrollForDrag = (clientY: number) => {
    if (!draggingItemId) return;
    const threshold = 80;
    const maxStep = 22;
    const container = tableScrollRef.current;

    if (container) {
      const rect = container.getBoundingClientRect();
      const canScroll = container.scrollHeight > container.clientHeight;
      if (canScroll && clientY >= rect.top && clientY <= rect.bottom) {
        if (clientY < rect.top + threshold) {
          const ratio = (rect.top + threshold - clientY) / threshold;
          container.scrollTop -= Math.ceil(maxStep * ratio);
          return;
        }
        if (clientY > rect.bottom - threshold) {
          const ratio = (clientY - (rect.bottom - threshold)) / threshold;
          container.scrollTop += Math.ceil(maxStep * ratio);
          return;
        }
      }
    }

    const viewportHeight = window.innerHeight;
    if (clientY < threshold) {
      const ratio = (threshold - clientY) / threshold;
      window.scrollBy({ top: -Math.ceil(maxStep * ratio), left: 0, behavior: 'auto' });
    } else if (clientY > viewportHeight - threshold) {
      const ratio = (clientY - (viewportHeight - threshold)) / threshold;
      window.scrollBy({ top: Math.ceil(maxStep * ratio), left: 0, behavior: 'auto' });
    }
  };

  const resolvedLineDescriptionIndex = useMemo(() => {
    const maxIndex = selectedColumns.length;
    if (lineDescriptionIndex === null || !Number.isFinite(lineDescriptionIndex)) {
      return maxIndex;
    }
    return Math.min(Math.max(lineDescriptionIndex, 0), maxIndex);
  }, [lineDescriptionIndex, selectedColumns.length]);

  const trailingColumnKeys = useMemo(() => {
    const keys = selectedColumns.map((column) => `stock:${column}`);
    keys.splice(resolvedLineDescriptionIndex, 0, 'lineDescription');
    return keys;
  }, [selectedColumns, resolvedLineDescriptionIndex]);

  const reorderableColumns = useMemo(() => {
    const keys = [...selectedColumns];
    keys.splice(resolvedLineDescriptionIndex, 0, LINE_DESCRIPTION_KEY);
    return keys;
  }, [selectedColumns, resolvedLineDescriptionIndex]);

  const tableColumnKeys = useMemo(
    () => [
      'rowNumber',
      'product',
      'quantity',
      'priceSource',
      'selection',
      'unitPrice',
      'lineTotal',
      'vat',
      ...trailingColumnKeys,
      'actions',
    ],
    [trailingColumnKeys]
  );

  const getColumnWidth = (key: string) => {
    const value = columnWidths[key];
    if (Number.isFinite(value)) return value;
    return getDefaultColumnWidth(key);
  };

  const startColumnResize = (key: string) => (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = {
      key,
      startX: event.clientX,
      startWidth: getColumnWidth(key),
    };
    setIsResizing(true);
  };

  const renderResizeHandle = (key: string) => (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={startColumnResize(key)}
      onClick={(event) => event.stopPropagation()}
      className="absolute right-0 top-0 h-full w-2 cursor-col-resize"
    >
      <span className="absolute right-0 top-0 h-full w-px bg-slate-200" aria-hidden />
    </div>
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (event: MouseEvent) => {
      if (!resizeRef.current) return;
      const { key, startX, startWidth } = resizeRef.current;
      const delta = event.clientX - startX;
      const nextWidth = clampColumnWidth(key, startWidth + delta);
      setColumnWidths((prev) => ({ ...prev, [key]: nextWidth }));
    };

    const handleMouseUp = () => {
      resizeRef.current = null;
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const getMarginInfo = (item: QuoteItemForm) => {
    if (item.isManualLine) return null;
    const unitPrice = roundUp2(item.unitPrice || 0);
    const lastEntry = item.lastEntryPrice || 0;
    const currentCost = item.currentCost || 0;
    if (!unitPrice || (lastEntry <= 0 && currentCost <= 0)) {
      return null;
    }

    const lastEntryDiff = lastEntry > 0
      ? ((unitPrice - lastEntry) / lastEntry) * 100
      : null;
    const currentCostDiff = currentCost > 0
      ? ((unitPrice - currentCost) / currentCost) * 100
      : null;
    const baseCost = lastEntry > 0 ? lastEntry : currentCost;
    const blocked = baseCost > 0 && unitPrice < baseCost * 1.05;
    const vatRate = item.vatRate || 0;
    const lastEntryWithVat = lastEntry > 0 ? lastEntry * (1 + vatRate) : null;
    const openPurchase = lastEntry > 0 && lastEntryWithVat !== null && Math.abs(lastEntryWithVat - lastEntry) < 0.01;

    return {
      blocked,
      lastEntry,
      currentCost,
      lastEntryDiff,
      currentCostDiff,
      openPurchase,
    };
  };

  const totals = useMemo(() => {
    return quoteItems.reduce(
      (acc, item) => {
        const quantity = item.quantity || 0;
        const unitPrice = roundUp2(item.unitPrice || 0);
        const lineTotal = quantity * unitPrice;
        const vatRate = item.vatRate || 0;
        const vatZeroedLine = vatZeroed || item.vatZeroed;
        const vatAmount = vatZeroedLine ? 0 : lineTotal * vatRate;
        acc.totalAmount += lineTotal;
        acc.totalVat += vatAmount;
        acc.grandTotal += lineTotal + vatAmount;
        return acc;
      },
      { totalAmount: 0, totalVat: 0, grandTotal: 0 }
    );
  }, [quoteItems, vatZeroed]);

  const profitTotals = useMemo(() => {
    const summary = quoteItems.reduce(
      (acc, item) => {
        const quantity = Math.max(0, item.quantity || 0);
        const unitPrice = roundUp2(item.unitPrice || 0);
        const lineTotal = quantity * unitPrice;
        acc.salesTotal += lineTotal;

        if (item.isManualLine) {
          acc.manualLines += 1;
          return acc;
        }

        const entryCost = Math.max(0, item.lastEntryPrice || 0);
        const currentCost = Math.max(0, item.currentCost || 0);

        if (entryCost > 0) {
          acc.entrySalesTotal += lineTotal;
          acc.entryCostTotal += entryCost * quantity;
        } else {
          acc.entryMissingLines += 1;
        }

        if (currentCost > 0) {
          acc.currentSalesTotal += lineTotal;
          acc.currentCostTotal += currentCost * quantity;
        } else {
          acc.currentMissingLines += 1;
        }

        return acc;
      },
      {
        salesTotal: 0,
        entrySalesTotal: 0,
        currentSalesTotal: 0,
        entryCostTotal: 0,
        currentCostTotal: 0,
        entryMissingLines: 0,
        currentMissingLines: 0,
        manualLines: 0,
      }
    );
    const entryProfit = summary.entrySalesTotal - summary.entryCostTotal;
    const currentProfit = summary.currentSalesTotal - summary.currentCostTotal;
    return {
      ...summary,
      entryProfit,
      currentProfit,
      entryProfitPercent: summary.entryCostTotal > 0 ? (entryProfit / summary.entryCostTotal) * 100 : null,
      currentProfitPercent: summary.currentCostTotal > 0 ? (currentProfit / summary.currentCostTotal) * 100 : null,
    };
  }, [quoteItems]);

  const hasBlockedPreview = useMemo(() => {
    return quoteItems.some((item) => getMarginInfo(item)?.blocked);
  }, [quoteItems]);

  const orderHasInvoiced = useMemo(() => {
    return quoteItems.some((item) => (item.priceType || 'INVOICED') !== 'WHITE');
  }, [quoteItems]);

  const orderHasWhite = useMemo(() => {
    return quoteItems.some((item) => item.priceType === 'WHITE');
  }, [quoteItems]);

  const showOrderInvoicedFields = isOrderMode && (
    !isOrderEditMode || orderHasInvoiced || Boolean(orderInvoicedSeries || orderInvoicedSira)
  );

  const showOrderWhiteFields = isOrderMode && (
    !isOrderEditMode || orderHasWhite || Boolean(orderWhiteSeries || orderWhiteSira)
  );

  const buildOrderNumberPayload = (
    enabled: boolean,
    series: string,
    sira: string,
    original: { series: string; sira: string }
  ) => {
    if (!enabled) {
      return { series: undefined, sira: undefined };
    }

    const normalizedSeries = series.trim();
    const normalizedSira = sira.trim();
    const seriesChanged = normalizedSeries !== original.series;
    const siraChanged = normalizedSira !== original.sira;

    return {
      series: normalizedSeries || undefined,
      sira: normalizedSira && (!seriesChanged || siraChanged) ? Number(normalizedSira) : undefined,
    };
  };

  const validateQuote = () => {
    if (!selectedCustomer?.id) {
      toast.error('Musteri secmelisiniz.');
      return false;
    }

    if (!isOrderMode && !validityDate) {
      toast.error('Gecerlilik tarihi gerekli.');
      return false;
    }

    if (isOrderMode && !isOrderEditMode) {
      const resolvedWarehouse = Number(resolveWarehouseValue(orderWarehouse));
      if (!Number.isFinite(resolvedWarehouse) || resolvedWarehouse <= 0) {
        toast.error('Depo secmelisiniz.');
        return false;
      }
      if (orderHasInvoiced) {
        if (!orderInvoicedSeries.trim()) {
          toast.error('Faturali seri gerekli.');
          return false;
        }
      }
      if (orderHasWhite) {
        if (!orderWhiteSeries.trim()) {
          toast.error('Beyaz seri gerekli.');
          return false;
        }
      }
    }

    if (isOrderMode && isOrderEditMode) {
      if (orderHasInvoiced && orderInvoicedSira.trim() && !Number.isFinite(Number(orderInvoicedSira))) {
        toast.error('Faturali sira sayi olmali.');
        return false;
      }
      if (orderHasWhite && orderWhiteSira.trim() && !Number.isFinite(Number(orderWhiteSira))) {
        toast.error('Beyaz sira sayi olmali.');
        return false;
      }
    }

    if (quoteItems.length === 0) {
      toast.error('Teklife en az bir urun ekleyin.');
      return false;
    }

    for (let i = 0; i < quoteItems.length; i++) {
      const item = quoteItems[i];
      if (!item.quantity || item.quantity <= 0) {
        toast.error(`Miktar girilmeli (Satir ${i + 1}).`);
        return false;
      }
      if (isOrderMode && Number(item.reserveQty || 0) > Number(item.quantity || 0)) {
        toast.error(`Rezerve miktar, satir miktarini gecemez (Satir ${i + 1}).`);
        return false;
      }
      if (item.isManualLine) {
        if (isOrderMode) {
          toast.error(`Siparis icin manuel satir kullanilamaz (Satir ${i + 1}).`);
          return false;
        }
        if (!item.productName?.trim()) {
          toast.error(`Manuel satir urun adi gerekli (Satir ${i + 1}).`);
          return false;
        }
        if (!item.unitPrice || item.unitPrice <= 0) {
          toast.error(`Manuel satir fiyat girilmeli (Satir ${i + 1}).`);
          return false;
        }
        if (!item.manualVatRate || ![0.01, 0.1, 0.2].includes(item.manualVatRate)) {
          toast.error(`Manuel satir KDV secimi gerekli (Satir ${i + 1}).`);
          return false;
        }
        continue;
      }

      if (!item.priceSource) {
        toast.error(`Fiyat kaynagi secilmeli (Satir ${i + 1}).`);
        return false;
      }

      if (item.priceSource === 'PRICE_LIST' && !item.priceListNo) {
        toast.error(`Fiyat listesi secilmeli (Satir ${i + 1}).`);
        return false;
      }

      if (item.priceSource === 'LAST_SALE' && item.selectedSaleIndex === undefined) {
        toast.error(`Son satis secilmeli (Satir ${i + 1}).`);
        return false;
      }

      if (item.priceSource === 'MANUAL' && (!item.unitPrice || item.unitPrice <= 0)) {
        toast.error(`Manuel fiyat girilmeli (Satir ${i + 1}).`);
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateQuote()) return;

    setSubmitting(true);
    try {
      if (isOrderMode) {
        if (isOrderEditMode && editOrderId) {
          const invoicedNumberPayload = buildOrderNumberPayload(
            orderHasInvoiced,
            orderInvoicedSeries,
            orderInvoicedSira,
            originalOrderInvoicedNumber
          );
          const whiteNumberPayload = buildOrderNumberPayload(
            orderHasWhite,
            orderWhiteSeries,
            orderWhiteSira,
            originalOrderWhiteNumber
          );
          await adminApi.updateOrder(editOrderId, {
            customerOrderNumber: orderCustomerOrderNumber.trim() || undefined,
            deliveryLocation: orderDocumentDescription.trim() || undefined,
            invoicedSeries: invoicedNumberPayload.series,
            invoicedSira: invoicedNumberPayload.sira,
            whiteSeries: whiteNumberPayload.series,
            whiteSira: whiteNumberPayload.sira,
            items: quoteItems.map((item) => ({
              productId: item.isManualLine ? undefined : item.productId,
              productCode: item.productCode,
              productName: item.productName,
              ...buildUnitPayload(item),
              quantity: item.quantity,
              unitPrice: roundUp2(item.unitPrice || 0),
              priceType: item.priceType === 'WHITE' ? 'WHITE' : 'INVOICED',
              lineNote: item.lineDescription || undefined,
              responsibilityCenter: item.responsibilityCenter || undefined,
            })),
          });
          toast.success('Siparis guncellendi.');
          router.push('/orders');
          return;
        }

        const orderPayload: Parameters<typeof adminApi.createManualOrder>[0] = {
          customerId: selectedCustomer.id,
          warehouseNo: Number(resolveWarehouseValue(orderWarehouse)),
          description: note,
          documentDescription: orderDocumentDescription.trim() || undefined,
          documentNo: orderCustomerOrderNumber.trim() || undefined,
          invoicedSeries: orderHasInvoiced ? orderInvoicedSeries.trim() : undefined,
          whiteSeries: orderHasWhite ? orderWhiteSeries.trim() : undefined,
          items: quoteItems.map((item) => ({
            productId: item.isManualLine ? undefined : item.productId,
            productCode: item.productCode,
            productName: item.productName,
            ...buildUnitPayload(item),
            quantity: item.quantity,
            unitPrice: roundUp2(item.unitPrice || 0),
            priceType: item.priceType === 'WHITE' ? 'WHITE' : 'INVOICED',
            vatZeroed: vatZeroed || item.vatZeroed,
            manualVatRate: item.isManualLine ? item.manualVatRate : undefined,
            lineDescription: item.lineDescription || undefined,
            responsibilityCenter: item.responsibilityCenter || undefined,
            reserveQty: Math.max(Number(item.reserveQty || 0), 0),
          })),
        };

        const result = await adminApi.createManualOrder(orderPayload);
        const orderLabel = result.orderNumber
          ? `${result.orderNumber} (${result.mikroOrderIds.join(', ')})`
          : result.mikroOrderIds.join(', ');
        toast.success(`Siparis olusturuldu: ${orderLabel}`);
        router.push('/orders');
        return;
      }

      const payload = {
        customerId: selectedCustomer.id,
        validityDate,
        note,
        documentNo: note,
        responsibleCode: selectedResponsibleCode || undefined,
        contactId: selectedContactId || undefined,
        vatZeroed,
        items: quoteItems.map((item) => {
          const sale = item.priceSource === 'LAST_SALE' && item.selectedSaleIndex !== undefined
            ? item.lastSales?.[item.selectedSaleIndex]
            : undefined;

          return {
            productId: item.isManualLine ? undefined : item.productId,
            productCode: item.productCode,
            productName: item.productName,
            ...buildUnitPayload(item),
            quantity: item.quantity,
            unitPrice: roundUp2(item.unitPrice || 0),
            priceSource: item.priceSource,
            priceListNo: item.priceListNo,
            priceType: 'INVOICED',
            vatZeroed: vatZeroed || item.vatZeroed,
            manualLine: item.isManualLine,
            manualVatRate: item.isManualLine ? item.manualVatRate : undefined,
            manualImageUrl: item.isManualLine ? (item.manualImageUrl || undefined) : undefined,
            lineDescription: item.lineDescription || undefined,
            responsibilityCenter: item.responsibilityCenter || undefined,
            lastSale: sale
              ? {
                  saleDate: sale.saleDate,
                  unitPrice: sale.unitPrice,
                  quantity: sale.quantity,
                  vatZeroed: sale.vatZeroed,
                }
              : undefined,
          };
        }),
      };

      let savedQuote: Quote | null = null;
      if (isEditMode && editQuoteId) {
        const result = await adminApi.updateQuote(editQuoteId, payload);
        savedQuote = result.quote;
        toast.success('Teklif guncellendi.');
      } else {
        const result = await adminApi.createQuote(payload);
        savedQuote = result.quote;
        toast.success('Teklif olusturuldu.');
      }
      const downloadParam = savedQuote?.id ? `&download=${savedQuote.id}` : '';
      router.push(`/quotes?tab=sent${downloadParam}`);
    } catch (error: any) {
      const fallback = isOrderMode
        ? (isOrderEditMode ? 'Siparis guncellenemedi.' : 'Siparis olusturulamadi.')
        : 'Teklif olusturulamadi.';
      toast.error(error.response?.data?.error || fallback);
    } finally {
      setSubmitting(false);
    }
  };

  const columnsCount = tableColumnKeys.length;
  const cardShell = 'rounded-2xl border border-slate-200/80 bg-white/95 shadow-[0_10px_30px_rgba(15,23,42,0.08)]';
  const showTableScrollBar = tableScrollMetrics.scrollWidth > tableScrollMetrics.clientWidth + 4;
  const tableCardClass = `${cardShell}${isQuoteTableFullscreen ? ' fixed inset-4 z-50 flex flex-col overflow-hidden' : ''}`;
  const tableContainerClass = `rounded-2xl border border-slate-200/80 bg-white ${
    isQuoteTableFullscreen ? 'flex-1 min-h-0 overflow-auto' : 'max-h-[70vh] overflow-auto'
  }`;
  const scrollBarWrapperClass = isQuoteTableFullscreen
    ? 'sticky bottom-0 z-20 bg-white/90 backdrop-blur'
    : '';

  return {
    addManualLine,
    addPoolColorRule,
    addProductToQuote,
    addProductsToQuote,
    addSelectedPurchasedToQuote,
    addSelectedSearchToQuote,
    aiAnalyzing,
    aiError,
    aiImage,
    aiModel,
    aiModels,
    aiRequestText,
    aiResult,
    applyFamilySplit,
    applyFamilySwap,
    applyLastSaleToAll,
    applyPriceListToAll,
    applyResponsibilityCenterToAll,
    autoScrollForDrag,
    availableColumns,
    buildAiQuotePayload,
    buildOrderNumberPayload,
    buildQuoteItem,
    buildQuoteItemFromExisting,
    bulkPriceListNo,
    bulkResponsibilityCenter,
    cardShell,
    categoryLastPurchaseMap,
    clearAllColumns,
    clearPurchasedSelection,
    clearSearchSelection,
    columnWidths,
    columnsCount,
    contactsLoading,
    customerContacts,
    customerOptions,
    customers,
    draggingColumn,
    draggingItemId,
    editInitializedRef,
    editOrderId,
    editOrderInitializedRef,
    editQuoteId,
    editingOrderCustomerCode,
    editingQuote,
    expandedQuoteHistory,
    fetchCustomerContacts,
    fetchPurchasedProducts,
    fetchSearchResults,
    filteredPurchasedProducts,
    filteredSearchResults,
    getColumnWidth,
    getMarginInfo,
    getPoolColorClass,
    getPoolQuantityInputValue,
    getPoolQuantityValue,
    handleColumnDragEnd,
    handleColumnDragOver,
    handleColumnDragStart,
    handleColumnDrop,
    handleGlobalVatZeroChange,
    handleLastSaleChange,
    handleLastSalesCountChange,
    handleManualImageFileChange,
    handleManualImageUpload,
    handleManualMarginChange,
    handleManualPriceChange,
    handleManualVatChange,
    handleOrderSeriesChange,
    handlePriceListChange,
    handlePriceSourceChange,
    handleQuantityChange,
    handleRecommendationAdd,
    handleReserveQuantityChange,
    handleRowDragEnd,
    handleRowDragOver,
    handleRowDragStart,
    handleRowDrop,
    handleScrollBarScroll,
    handleSelectedUnitChange,
    handleSubmit,
    handleTableDragOver,
    handleTableScroll,
    hasBlockedPreview,
    hasManualCustomerChange,
    includedWarehouses,
    isEditMode,
    isOrderEditMode,
    isOrderMode,
    isQuoteTableFullscreen,
    isResizing,
    lastOrderMap,
    lastQuoteMap,
    lastSalesCount,
    lineDescriptionIndex,
    loadInitialData,
    loadOrderForEdit,
    loadQuoteForEdit,
    loadingOrder,
    loadingQuote,
    manualImageUploading,
    normalizePoolQuantityInputValue,
    note,
    onAiImageChange,
    onAiModelChange,
    openAiAnalysis,
    openPriceRequestModal,
    orderCustomerOrderNumber,
    orderDocumentDescription,
    orderHasInvoiced,
    orderHasWhite,
    orderInvoicedSeries,
    orderInvoicedSira,
    orderWarehouse,
    orderWhiteSeries,
    orderWhiteSira,
    originalOrderInvoicedNumber,
    originalOrderWhiteNumber,
    poolColorRules,
    poolPriceListNo,
    poolQuantityInputs,
    poolSort,
    prefillInitializedRef,
    priceRequestNote,
    priceRequestPriority,
    priceRequestSaving,
    priceRequestStockPayload,
    priceRequestTarget,
    productTab,
    profitTotals,
    purchasedProducts,
    purchasedSearch,
    quoteItems,
    quoteProductCodeSet,
    quoteProductCodes,
    recommendations,
    recommendationsLoading,
    removeItem,
    removeManualImage,
    removePoolColorRule,
    renderResizeHandle,
    reorderableColumns,
    resizeRef,
    resolvedLineDescriptionIndex,
    responsibles,
    router,
    runAiAnalysis,
    saveColumnPreferences,
    savePoolPreferences,
    saveQuotePreferences,
    savingColumns,
    savingPoolPreferences,
    scrollBarWrapperClass,
    scrollSyncRef,
    searchLoading,
    searchParams,
    searchResults,
    searchTerm,
    selectAllColumns,
    selectAllPurchased,
    selectAllSearch,
    selectPoolQuantityInput,
    selectedColumns,
    selectedContactId,
    selectedCustomer,
    selectedPurchasedCodes,
    selectedPurchasedCount,
    selectedResponsibleCode,
    selectedSearchCodes,
    selectedSearchCount,
    setAiAnalyzing,
    setAiError,
    setAiImage,
    setAiModel,
    setAiModels,
    setAiRequestText,
    setAiResult,
    setAvailableColumns,
    setBulkPriceListNo,
    setBulkResponsibilityCenter,
    setCategoryLastPurchaseMap,
    setColumnWidths,
    setContactsLoading,
    setCustomerContacts,
    setCustomers,
    setDraggingColumn,
    setDraggingItemId,
    setEditingOrderCustomerCode,
    setEditingQuote,
    setExpandedQuoteHistory,
    setHasManualCustomerChange,
    setIncludedWarehouses,
    setIsQuoteTableFullscreen,
    setIsResizing,
    setLastOrderMap,
    setLastQuoteMap,
    setLastSalesCount,
    setLineDescriptionIndex,
    setLoadingOrder,
    setLoadingQuote,
    setManualImageUploading,
    setNote,
    setOrderCustomerOrderNumber,
    setOrderDocumentDescription,
    setOrderInvoicedSeries,
    setOrderInvoicedSira,
    setOrderWarehouse,
    setOrderWhiteSeries,
    setOrderWhiteSira,
    setOriginalOrderInvoicedNumber,
    setOriginalOrderWhiteNumber,
    setPoolColorRules,
    setPoolPriceListNo,
    setPoolQuantityInputValue,
    setPoolQuantityInputs,
    setPoolSort,
    setPriceRequestNote,
    setPriceRequestPriority,
    setPriceRequestSaving,
    setPriceRequestStockPayload,
    setPriceRequestTarget,
    setProductTab,
    setPurchasedProducts,
    setPurchasedSearch,
    setQuoteItems,
    setRecommendations,
    setRecommendationsLoading,
    setResponsibles,
    setSavingColumns,
    setSavingPoolPreferences,
    setSearchLoading,
    setSearchResults,
    setSearchTerm,
    setSelectedColumns,
    setSelectedContactId,
    setSelectedCustomer,
    setSelectedPurchasedCodes,
    setSelectedResponsibleCode,
    setSelectedSearchCodes,
    setShowAiModal,
    setShowCariModal,
    setShowColumnSelector,
    setShowLastOrderInfo,
    setShowLastQuoteInfo,
    setShowLeftPanel,
    setShowPoolColorOptions,
    setShowProductPoolModal,
    setStockDataMap,
    setStockUnits,
    setSubmitting,
    setTableScrollMetrics,
    setValidityDate,
    setVatZeroed,
    setWhatsappTemplate,
    showAiModal,
    showCariModal,
    showColumnSelector,
    showLastOrderInfo,
    showLastQuoteInfo,
    showLeftPanel,
    showOrderInvoicedFields,
    showOrderWhiteFields,
    showPoolColorOptions,
    showProductPoolModal,
    showTableScrollBar,
    sortPoolProducts,
    sortedPurchasedProducts,
    sortedSearchResults,
    startColumnResize,
    stockDataMap,
    stockUnits,
    submitPriceVerificationRequest,
    submitting,
    tableCardClass,
    tableColumnKeys,
    tableContainerClass,
    tableScrollBarRef,
    tableScrollMetrics,
    tableScrollRef,
    togglePurchasedSelection,
    toggleQuoteHistory,
    toggleSearchSelection,
    totals,
    trailingColumnKeys,
    updateItem,
    updatePoolColorRule,
    updatePriceRequestMargin,
    updatePriceRequestStockPayload,
    validateQuote,
    validityDate,
    vatZeroed,
    whatsappTemplate,
  };
}

export function CategoryLastPurchaseBadge({ info }: { info?: CategoryLastPurchase | null }) {
  if (!info?.lastPurchaseDate) return null;
  const months = info.monthsSinceLastPurchase ?? monthsSinceDate(info.lastPurchaseDate);
  const monthsText = months === null ? null : `${months.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ay once`;
  return (
    <div className="mt-1 inline-flex max-w-full items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
      Kategori son alim: {monthsText || formatDateShort(info.lastPurchaseDate)}
      <span className="ml-1 text-amber-700/70">({formatDateShort(info.lastPurchaseDate)})</span>
    </div>
  );
}
