'use client';

import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
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
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import { getUnitConversionLabel } from '@/lib/utils/unit';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '@/lib/utils/search';
import type { CustomerContact, Quote, QuoteItem } from '@/types';

interface LastSale {
  saleDate: string;
  quantity: number;
  unitPrice: number;
  vatRate?: number;
  vatZeroed?: boolean;
}

interface QuoteProduct {
  id: string;
  name: string;
  mikroCode: string;
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
}

interface QuoteItemForm {
  id: string;
  productId?: string;
  productCode: string;
  productName: string;
  unit?: string;
  unit2?: string | null;
  unit2Factor?: number | null;
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
  responsibilityCenter?: string;
  lastSales?: LastSale[];
  selectedSaleIndex?: number;
  lastEntryPrice?: number | null;
  lastEntryDate?: string | null;
  currentCost?: number | null;
  currentCostDate?: string | null;
  mikroPriceLists?: Record<number, number> | Record<string, number>;
}

type PoolSortOption = 'default' | 'stock1_desc' | 'stock6_desc' | 'price_asc' | 'price_desc';

type PoolColorRule = {
  id: string;
  enabled: boolean;
  warehouse: '1' | '6';
  operator: '>' | '>=' | '<' | '<=' | '=';
  threshold: number;
  color: 'green' | 'yellow' | 'blue' | 'red' | 'slate';
};

const createPoolColorRule = (overrides?: Partial<PoolColorRule>): PoolColorRule => ({
  id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  enabled: false,
  warehouse: '1',
  operator: '>',
  threshold: 0,
  color: 'green',
  ...overrides,
});

const normalizePoolColorRule = (rule?: Partial<PoolColorRule> | null): PoolColorRule => {
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

const POOL_SORT_OPTIONS: Array<{ value: PoolSortOption; label: string }> = [
  { value: 'default', label: 'Varsayilan Siralama' },
  { value: 'stock1_desc', label: 'Merkez Depo Stok (Yuksekten)' },
  { value: 'stock6_desc', label: 'Topca Depo Stok (Yuksekten)' },
  { value: 'price_asc', label: 'Fiyat (Dusukten)' },
  { value: 'price_desc', label: 'Fiyat (Yuksekten)' },
];

const LINE_DESCRIPTION_KEY = '__line_description__';

const BASE_COLUMN_WIDTHS: Record<string, number> = {
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

const MIN_COLUMN_WIDTHS: Record<string, number> = {
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

const DEFAULT_STOCK_COLUMN_WIDTH = 150;
const MAX_COLUMN_WIDTH = 520;

const getDefaultColumnWidth = (key: string) => {
  if (key.startsWith('stock:')) return DEFAULT_STOCK_COLUMN_WIDTH;
  return BASE_COLUMN_WIDTHS[key] ?? 140;
};

const getMinColumnWidth = (key: string) => {
  if (key.startsWith('stock:')) return MIN_COLUMN_WIDTHS.stock;
  return MIN_COLUMN_WIDTHS[key] ?? 80;
};

const clampColumnWidth = (key: string, value: number) => {
  const min = getMinColumnWidth(key);
  const max = MAX_COLUMN_WIDTH;
  return Math.min(max, Math.max(min, Math.round(value)));
};

const buildColumnWidthMap = (
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

const PRICE_LIST_LABELS: Record<number, string> = {
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

const getColumnDisplayName = (column: string) => {
  const nameMap: Record<string, string> = {
    msg_S_0088: 'GUID',
    msg_S_0870: 'Urun Adi',
    msg_S_0078: 'Stok Kodu',
  };
  return nameMap[column] || column;
};

const formatStockValue = (value: any) => {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'number') {
    return value.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  }
  return String(value);
};

const getStockColumnValue = (column: string, row?: Record<string, any>) => {
  if (!row) return '-';
  if (column === 'Koli Ici') {
    const label = getUnitConversionLabel(row['Birim'], row['2. Birim'], row['2. Birim Katsayısı']);
    return label || '-';
  }
  return formatStockValue(row[column]);
};

const formatManualPriceInput = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return value.toLocaleString('tr-TR', { useGrouping: false, maximumFractionDigits: 6 });
};

const parseDecimalInput = (input: string) => {
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

const getStockNumber = (product: QuoteProduct, warehouse: '1' | '6') => {
  const value = product.warehouseStocks?.[warehouse];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getProductSortPrice = (product: QuoteProduct) => {
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

const getMikroListPrice = (
  mikroPriceLists: QuoteItemForm['mikroPriceLists'],
  listNo: number
) => {
  if (!mikroPriceLists) return 0;
  const byNumber = (mikroPriceLists as Record<number, number>)[listNo];
  if (typeof byNumber === 'number') return byNumber;
  const byString = (mikroPriceLists as Record<string, number>)[String(listNo)];
  return typeof byString === 'number' ? byString : 0;
};

const getPoolPriceLabel = (listNo: number) => {
  return PRICE_LIST_LABELS[listNo] || `Liste ${listNo}`;
};

const getMatchingPriceListLabel = (
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

const formatPercent = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(1)}%`;
};

const roundUp2 = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.ceil((value + Number.EPSILON) * 100) / 100;
};

const getPercentTone = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'text-gray-500';
  }
  return value >= 0 ? 'text-emerald-700' : 'text-red-600';
};

const resolveWarehouseValue = (value: string) => {
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

function AdminQuoteNewPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editQuoteId = searchParams.get('edit');
  const isOrderMode = searchParams.get('mode') === 'order';
  const isEditMode = Boolean(editQuoteId) && !isOrderMode;
  const editInitializedRef = useRef(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
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
  const [purchasedSearch, setPurchasedSearch] = useState('');
  const [productTab, setProductTab] = useState<'purchased' | 'search'>('purchased');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<QuoteProduct[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [quoteItems, setQuoteItems] = useState<QuoteItemForm[]>([]);
  const [validityDate, setValidityDate] = useState('');
  const [note, setNote] = useState('');
  const [vatZeroed, setVatZeroed] = useState(false);
  const [lastSalesCount, setLastSalesCount] = useState(1);
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
  const [orderWhiteSeries, setOrderWhiteSeries] = useState('');
  const [orderCustomerOrderNumber, setOrderCustomerOrderNumber] = useState('');
  const [bulkResponsibilityCenter, setBulkResponsibilityCenter] = useState('');

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
  }, [searchTerm, productTab]);

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
    addProductsToQuote(selectedProducts);
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
    addProductsToQuote(selectedProducts);
    setSelectedSearchCodes(new Set());
  };

  const buildQuoteItem = (product: QuoteProduct): QuoteItemForm => {
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
      quantity: 1,
      priceSource: '',
      unitPrice: undefined,
      vatRate: sourceProduct.vatRate || 0,
      vatZeroed: false,
      priceType: 'INVOICED',
      isManualLine: false,
      lastSales: sourceProduct.lastSales || [],
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
      unit2: null,
      unit2Factor: null,
      quantity: item.quantity,
      priceSource: item.priceSource,
      priceListNo,
      unitPrice: item.unitPrice,
      manualPriceInput: isManualLine ? formatManualPriceInput(item.unitPrice) : undefined,
      vatRate: item.vatRate,
      vatZeroed: item.vatZeroed,
      priceType: item.priceType === 'WHITE' ? 'WHITE' : 'INVOICED',
      isManualLine,
      manualVatRate: isManualLine ? item.vatRate : undefined,
      lineDescription: item.lineDescription || '',
      lastSales,
      selectedSaleIndex,
      lastEntryPrice: item.product?.lastEntryPrice ?? null,
      lastEntryDate: item.product?.lastEntryDate ?? null,
      currentCost: item.product?.currentCost ?? null,
      currentCostDate: item.product?.currentCostDate ?? null,
      mikroPriceLists,
    };
  };

  const addProductsToQuote = (productsToAdd: QuoteProduct[]) => {
    const validProducts = productsToAdd.filter((product) => product?.mikroCode);
    if (validProducts.length === 0) {
      toast.error('Urun bulunamadi.');
      return;
    }

    setQuoteItems((prev) => [...prev, ...validProducts.map(buildQuoteItem)]);
    toast.success(`${validProducts.length} urun eklendi.`);
  };

  const addProductToQuote = (product: QuoteProduct) => {
    addProductsToQuote([product]);
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
    };

    setQuoteItems((prev) => [...prev, newItem]);
  };

  const removeItem = (id: string) => {
    setQuoteItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateItem = (id: string, patch: Partial<QuoteItemForm>) => {
    setQuoteItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const handlePriceSourceChange = (item: QuoteItemForm, value: string) => {
    if (item.isManualLine) return;
    const nextSource = value as QuoteItemForm['priceSource'];
    updateItem(item.id, {
      priceSource: nextSource,
      priceListNo: undefined,
      unitPrice: nextSource === 'MANUAL' ? item.unitPrice : undefined,
      manualPriceInput: nextSource === 'MANUAL' ? formatManualPriceInput(item.unitPrice) : undefined,
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
    const nextPrice = trimmed.length === 0 ? undefined : parsed;
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
    updateItem(item.id, {
      quantity: parsed !== undefined ? Math.max(0, parsed) : item.quantity,
    });
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

  const hasBlockedPreview = useMemo(() => {
    return quoteItems.some((item) => getMarginInfo(item)?.blocked);
  }, [quoteItems]);

  const orderHasInvoiced = useMemo(() => {
    return quoteItems.some((item) => (item.priceType || 'INVOICED') !== 'WHITE');
  }, [quoteItems]);

  const orderHasWhite = useMemo(() => {
    return quoteItems.some((item) => item.priceType === 'WHITE');
  }, [quoteItems]);

  const validateQuote = () => {
    if (!selectedCustomer?.id) {
      toast.error('Musteri secmelisiniz.');
      return false;
    }

    if (!isOrderMode && !validityDate) {
      toast.error('Gecerlilik tarihi gerekli.');
      return false;
    }

    if (isOrderMode) {
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
        const orderPayload: Parameters<typeof adminApi.createManualOrder>[0] = {
          customerId: selectedCustomer.id,
          warehouseNo: Number(resolveWarehouseValue(orderWarehouse)),
          description: note,
          documentNo: orderCustomerOrderNumber.trim() || undefined,
          invoicedSeries: orderHasInvoiced ? orderInvoicedSeries.trim() : undefined,
          whiteSeries: orderHasWhite ? orderWhiteSeries.trim() : undefined,
          items: quoteItems.map((item) => ({
            productId: item.isManualLine ? undefined : item.productId,
            productCode: item.productCode,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: roundUp2(item.unitPrice || 0),
            priceType: item.priceType === 'WHITE' ? 'WHITE' : 'INVOICED',
            vatZeroed: vatZeroed || item.vatZeroed,
            manualVatRate: item.isManualLine ? item.manualVatRate : undefined,
            lineDescription: item.lineDescription || undefined,
            responsibilityCenter: item.responsibilityCenter || undefined,
          })),
        };

        const result = await adminApi.createManualOrder(orderPayload);
        const orderLabel = result.orderNumber
          ? `${result.orderNumber} (${result.mikroOrderIds.join(', ')})`
          : result.mikroOrderIds.join(', ');
        toast.success(`Siparis olusturuldu: ${orderLabel}`);
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
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: roundUp2(item.unitPrice || 0),
            priceSource: item.priceSource,
            priceListNo: item.priceListNo,
            priceType: 'INVOICED',
            vatZeroed: vatZeroed || item.vatZeroed,
            manualLine: item.isManualLine,
            manualVatRate: item.isManualLine ? item.manualVatRate : undefined,
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
      const fallback = isOrderMode ? 'Siparis olusturulamadi.' : 'Teklif olusturulamadi.';
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

  if (isEditMode && loadingQuote) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-sm text-gray-600">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          Teklif yukleniyor...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-x-hidden overflow-y-visible">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 right-[-140px] h-72 w-72 rounded-full bg-primary-200/40 blur-3xl" />
        <div className="absolute top-1/3 -left-24 h-80 w-80 rounded-full bg-slate-200/70 blur-3xl" />
      </div>

      <div className="relative z-10 container-custom max-w-[1600px] py-8 2xl:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isOrderMode ? 'Siparis Olustur' : isEditMode ? 'Teklif Duzenle' : 'Teklif Olustur'}
            </h1>
            <p className="text-sm text-gray-600">
              {isOrderMode ? 'Mikro satis siparisi yazilir' : isEditMode ? 'Mikro teklif guncellenir' : 'Mikro teklif fisine aktarilir'}
            </p>
          </div>
          <Button variant="secondary" onClick={() => router.push(isOrderMode ? '/orders' : '/quotes')}>
            {isOrderMode ? 'Siparisler' : 'Teklifler'}
          </Button>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {showLeftPanel && (
          <div className="xl:col-span-5 space-y-6">
        <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
          <div>
            <p className="text-sm font-semibold text-gray-900">Sol Panel</p>
            <p className="text-xs text-gray-500">Musteri ve urun secimi.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowLeftPanel(false)}
            className="rounded-full border-slate-200 bg-white text-gray-700 hover:bg-slate-50"
          >
            Sol Paneli Gizle
          </Button>
        </div>
        <Card className={cardShell}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold">Musteri</h2>
              <p className="text-xs text-gray-500">{isOrderMode ? 'Siparis icin cari secin.' : 'Teklif icin cari secin.'}</p>
            </div>
            <Button variant="secondary" onClick={() => setShowCariModal(true)}>
              {isEditMode ? 'Musteri Degistir' : 'Musteri Sec'}
            </Button>
          </div>
          {selectedCustomer ? (
            <CustomerInfoCard customer={selectedCustomer} />
          ) : (
            <div className="text-sm text-gray-500">{isOrderMode ? 'Siparis icin musteri secin.' : 'Teklif icin musteri secin.'}</div>
          )}
        </Card>
        <Card className={cardShell}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Teklif Ayarlari</h2>
                <p className="text-xs text-gray-500">Son satis ve mesaj tercihleriniz.</p>
              </div>
              <Button variant="secondary" onClick={saveQuotePreferences}>
                Tercihleri Kaydet
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{'\u0130lgili Ki\u015fi'}</label>
                <select
                  value={lastSalesCount}
                  onChange={(e) => handleLastSalesCountChange(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                >
                  {Array.from({ length: 10 }).map((_, idx) => (
                    <option key={idx + 1} value={idx + 1}>
                      {idx + 1}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">{'Bu m\u00fc\u015fteri i\u00e7in kay\u0131tl\u0131 ki\u015fi yok.'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp Sablonu</label>
                <textarea
                  value={whatsappTemplate}
                  onChange={(e) => setWhatsappTemplate(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                  placeholder="{{customerName}} {{quoteNumber}}"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Sorumlu</label>
                <select
                  value={selectedResponsibleCode}
                  onChange={(e) => setSelectedResponsibleCode(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                >
                  <option value="">{'\u0130lgili se\u00e7in'}</option>
                  {responsibles.map((person) => (
                    <option key={person.code} value={person.code}>
                      {person.code} - {person.name} {person.surname}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Secilen sorumlu Mikro teklifinde kullanilir. Kaydetmek icin "Tercihleri Kaydet" deyin.
                </p>
              </div>
            </div>
          </div>
        </Card>
        <Card className={cardShell}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Urun Havuzu</h2>
              <p className="text-xs text-gray-500">Son {lastSalesCount} satis gosteriliyor.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                onClick={() => setShowProductPoolModal(true)}
                size="sm"
                className="rounded-full"
              >
                Urun Havuzunu Ac
              </Button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span>Secili urun: {selectedPurchasedCount}</span>
            <span>Toplam urun: {purchasedProducts.length}</span>
            <span>Mod: {productTab === 'purchased' ? 'Daha Once Alinanlar' : 'Tum Urunler'}</span>
          </div>
        </Card>
          </div>
          )}
          <div className={`${showLeftPanel ? 'xl:col-span-7' : 'xl:col-span-12'} space-y-6`}>
            {!showLeftPanel && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/80 px-4 py-3 text-sm shadow-sm">
                <span className="text-gray-500">Sol panel gizli.</span>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowLeftPanel(true)}
                  className="rounded-full px-4"
                >
                  Sol Paneli Goster
                </Button>
              </div>
            )}
            <Card className={cardShell}>
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-lg font-semibold">{isOrderMode ? 'Siparis Bilgileri' : 'Teklif Bilgileri'}</h2>
                  <p className="text-xs text-gray-500">{isOrderMode ? 'Depo ve evrak bilgileri.' : 'Gecerlilik, not ve KDV ayarlari.'}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {!isOrderMode && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Gecerlilik Tarihi</label>
                        <input
                          type="date"
                          value={validityDate}
                          onChange={(e) => setValidityDate(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">İlgili Kişi</label>
                        <select
                          value={selectedContactId}
                          onChange={(e) => setSelectedContactId(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                          disabled={!selectedCustomer || contactsLoading}
                        >
                          <option value="">İlgili seçin</option>
                          {customerContacts.map((contact) => (
                            <option key={contact.id} value={contact.id}>
                              {contact.name}
                              {contact.phone ? ` - ${contact.phone}` : ""}
                              {contact.email ? ` (${contact.email})` : ""}
                            </option>
                          ))}
                        </select>
                        {!contactsLoading && selectedCustomer && customerContacts.length === 0 && (
                          <p className="mt-1 text-xs text-gray-500">Bu müşteri için kayıtlı kişi yok.</p>
                        )}
                      </div>                    </>
                  )}
                  {isOrderMode && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Depo</label>
                        {includedWarehouses.length > 0 ? (
                          <select
                            value={orderWarehouse}
                            onChange={(e) => setOrderWarehouse(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                          >
                            {includedWarehouses.map((warehouse) => (
                              <option key={warehouse} value={resolveWarehouseValue(warehouse)}>
                                {warehouse}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            value={orderWarehouse}
                            onChange={(e) => setOrderWarehouse(e.target.value)}
                            placeholder="Depo"
                          />
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Belge No (Musteri Siparis No)</label>
                        <Input
                          value={orderCustomerOrderNumber}
                          onChange={(e) => setOrderCustomerOrderNumber(e.target.value)}
                          placeholder="Orn: HENDEK-8915"
                        />
                      </div>
                      <div>
                        {orderHasInvoiced && (
                          <>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Faturali Seri</label>
                              <Input
                                value={orderInvoicedSeries}
                                onChange={(e) => setOrderInvoicedSeries(e.target.value)}
                                placeholder="Orn: HENDEK"
                              />
                            </div>
                          </>
                        )}
                        {orderHasWhite && (
                          <>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Beyaz Seri</label>
                              <Input
                                value={orderWhiteSeries}
                                onChange={(e) => setOrderWhiteSeries(e.target.value)}
                                placeholder="Orn: HENDEK"
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                  <div className="md:col-span-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={vatZeroed}
                      onChange={(e) => handleGlobalVatZeroChange(e.target.checked)}
                      className="h-4 w-4 accent-primary-600"
                    />
                    <span className="text-gray-700">Tum satirlarda KDV sifirla</span>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Not</label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                      placeholder="Teklif notu"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      {isOrderMode
                        ? "Not, Mikro'da aciklama alanina yazilir."
                        : "Not, Mikro'da belge no alanina da yazilir."}
                    </p>
                  </div>
                </div>
              </div>
            </Card>
        {isQuoteTableFullscreen && (
          <div
            className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm"
            onClick={() => setIsQuoteTableFullscreen(false)}
          />
        )}
        <Card
          className={tableCardClass}
          onClick={(event) => {
            if (isQuoteTableFullscreen) {
              event.stopPropagation();
            }
          }}
        >
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">{isOrderMode ? 'Siparis Kalemleri' : 'Teklif Kalemleri'} ({quoteItems.length})</h2>
              <p className="text-xs text-gray-500">{isOrderMode ? 'Siparis satirlarini duzenleyin.' : 'Fiyat kaynagini secip satirlari duzenleyin.'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
              <select
                value={bulkPriceListNo}
                onChange={(e) => setBulkPriceListNo(e.target.value ? Number(e.target.value) : '')}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm"
              >
                <option value="">Liste Sec</option>
                {Object.keys(PRICE_LIST_LABELS).map((key) => (
                  <option key={key} value={key}>
                    {PRICE_LIST_LABELS[Number(key)]}
                  </option>
                ))}
              </select>
              <Button variant="secondary" size="sm" onClick={applyPriceListToAll} className="rounded-full">
                Tum Satirlara Uygula
              </Button>
              <Button variant="secondary" size="sm" onClick={applyLastSaleToAll} className="rounded-full">
                Son Satisi Uygula
              </Button>
              {isOrderMode && (
                <>
                  <input
                    value={bulkResponsibilityCenter}
                    onChange={(e) => setBulkResponsibilityCenter(e.target.value)}
                    placeholder="Sorumluluk merkezi"
                    className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm"
                  />
                  <Button variant="secondary" size="sm" onClick={applyResponsibilityCenterToAll} className="rounded-full">
                    Sorumluluk Uygula
                  </Button>
                </>
              )}

              <Button variant="secondary" size="sm" onClick={() => setShowColumnSelector(true)} className="rounded-full">
                Kolonlari Sec
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={saveColumnPreferences}
                disabled={savingColumns}
                className="rounded-full"
              >
                {savingColumns ? 'Kaydediliyor...' : 'Gorunusu Kaydet'}
              </Button>
              <Button variant="secondary" size="sm" onClick={addManualLine} className="rounded-full">
                Manuel Satir Ekle
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsQuoteTableFullscreen((prev) => !prev)}
                className="rounded-full"
              >
                {isQuoteTableFullscreen ? 'Tam Ekrandan Cik' : 'Tam Ekran'}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowProductPoolModal(true)}
                className="rounded-full"
              >
                Urun Havuzunu Ac
              </Button>
            </div>
          </div>

          {hasBlockedPreview && (
            <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
              Bazi satirlarda giris maliyetine gore kar %5 altinda. Bu teklif admin onayina gidecek.
            </div>
          )}

          {quoteItems.length === 0 ? (
            <div className="text-sm text-gray-500">Teklife urun eklenmedi.</div>
          ) : (
            <div
              ref={tableScrollRef}
              className={tableContainerClass}
              onDragOver={handleTableDragOver}
              onScroll={handleTableScroll}
            >
              <table className="w-full min-w-[1100px] table-fixed text-sm">
                <colgroup>
                  {tableColumnKeys.map((key) => (
                    <col key={key} style={{ width: `${getColumnWidth(key)}px` }} />
                  ))}
                </colgroup>
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-gray-600">
                  <tr>
                    <th className="relative select-none px-3 py-2 text-left bg-slate-50">
                      #
                      {renderResizeHandle('rowNumber')}
                    </th>
                    <th className="relative select-none px-3 py-2 text-left bg-slate-50">
                      Urun
                      {renderResizeHandle('product')}
                    </th>
                    <th className="relative select-none px-3 py-2 text-left bg-slate-50">
                      Miktar
                      {renderResizeHandle('quantity')}
                    </th>
                    <th className="relative select-none px-3 py-2 text-left bg-slate-50">
                      {isOrderMode ? 'Fiyat Tipi / Kaynagi' : 'Fiyat Kaynagi'}
                      {renderResizeHandle('priceSource')}
                    </th>
                    <th className="relative select-none px-3 py-2 text-left bg-slate-50">
                      Secim
                      {renderResizeHandle('selection')}
                    </th>
                    <th className="relative select-none px-3 py-2 text-right bg-slate-50">
                      Birim Fiyat
                      {renderResizeHandle('unitPrice')}
                    </th>
                    <th className="relative select-none px-3 py-2 text-right bg-slate-50">
                      Toplam
                      {renderResizeHandle('lineTotal')}
                    </th>
                    <th className="relative select-none px-3 py-2 text-left bg-slate-50">
                      KDV
                      {renderResizeHandle('vat')}
                    </th>
                    {trailingColumnKeys.map((columnKey) => {
                      if (columnKey === 'lineDescription') {
                        return (
                          <th key={columnKey} className="relative select-none px-3 py-2 text-left bg-slate-50">
                            Aciklama
                            {renderResizeHandle('lineDescription')}
                          </th>
                        );
                      }
                      const column = columnKey.replace('stock:', '');
                      return (
                        <th
                          key={columnKey}
                          className="relative select-none px-3 py-2 text-left whitespace-nowrap bg-slate-50"
                        >
                          {getColumnDisplayName(column)}
                          {renderResizeHandle(columnKey)}
                        </th>
                      );
                    })}
                    <th className="px-3 py-2 bg-slate-50"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {quoteItems.map((item, index) => {
                    const marginInfo = getMarginInfo(item);
                    const roundedUnitPrice = roundUp2(item.unitPrice || 0);
                    const lineTotal = roundedUnitPrice * (item.quantity || 0);

                    return (
                      <Fragment key={item.id}>
                        <tr
                          className={`bg-white ${draggingItemId === item.id ? 'opacity-70' : ''}`}
                          onDragOver={handleRowDragOver}
                          onDrop={handleRowDrop(item.id)}
                        >
                          <td className="px-3 py-2 text-right text-xs font-semibold text-gray-500">
                            {index + 1}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-start gap-2">
                              <button
                                type="button"
                                draggable
                                onDragStart={handleRowDragStart(item.id)}
                                onDragEnd={handleRowDragEnd}
                                className="mt-1 cursor-grab text-gray-400 hover:text-gray-600"
                                aria-label="Satiri tasimak icin surukle"
                                title="Satiri tasimak icin surukle"
                              >
                                ::
                              </button>
                              <div className="min-w-0 flex-1">
                                {item.isManualLine ? (
                                  <div className="space-y-1">
                                    <Input
                                      placeholder="Manuel urun adi"
                                      value={item.productName}
                                      onChange={(e) => updateItem(item.id, { productName: e.target.value })}
                                      lang="tr"
                                      autoCorrect="off"
                                      spellCheck={false}
                                      className="w-full min-w-[220px]"
                                    />
                                    <div className="text-xs text-gray-500">Kod: {item.productCode}</div>
                                    <Badge variant="warning" className="text-xs">Manuel</Badge>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="font-medium text-gray-900">{item.productName}</div>
                                    <div className="text-xs text-gray-500">{item.productCode}</div>
                                    {getUnitConversionLabel(item.unit, item.unit2, item.unit2Factor) && (
                                      <div className="text-xs text-gray-500">
                                        {getUnitConversionLabel(item.unit, item.unit2, item.unit2Factor)}
                                      </div>
                                    )}
                                    {marginInfo?.blocked && (
                                      <Badge variant="danger" className="text-xs mt-1">Blok</Badge>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col gap-1">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={item.quantity === 0 ? '' : item.quantity}
                                onChange={(e) => handleQuantityChange(item, e.target.value)}
                                className="w-20 rounded-lg border border-gray-300 px-2 py-1"
                              />
                              {item.isManualLine ? (
                                <select
                                  value={item.unit || ''}
                                  onChange={(e) => updateItem(item.id, { unit: e.target.value })}
                                  className="w-24 rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs"
                                >
                                  {(stockUnits.length > 0 ? stockUnits : ['ADET']).map((unit) => (
                                    <option key={unit} value={unit}>
                                      {unit}
                                    </option>
                                  ))}
                                </select>
                              ) : item.unit ? (
                                <span className="text-[11px] text-gray-500">{item.unit}</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            {isOrderMode && (
                              <select
                                value={item.priceType === 'WHITE' ? 'WHITE' : 'INVOICED'}
                                onChange={(e) => updateItem(item.id, { priceType: e.target.value === 'WHITE' ? 'WHITE' : 'INVOICED' })}
                                className="mb-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs"
                              >
                                <option value="INVOICED">Fatural?</option>
                                <option value="WHITE">Beyaz</option>
                              </select>
                            )}
                            {item.isManualLine ? (
                              <span className="text-xs text-gray-600">Manuel</span>
                            ) : (
                              <select
                                value={item.priceSource || ''}
                                onChange={(e) => handlePriceSourceChange(item, e.target.value)}
                                className="rounded-lg border border-gray-300 bg-white px-2 py-1"
                              >
                                <option value="">Secin</option>
                                <option value="LAST_SALE">Son Satis</option>
                                <option value="PRICE_LIST">Fiyat Listesi</option>
                                <option value="MANUAL">Manuel</option>
                              </select>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {item.isManualLine ? (
                              <Input
                                placeholder="Birim fiyat"
                                value={item.manualPriceInput ?? formatManualPriceInput(item.unitPrice)}
                                onChange={(e) => handleManualPriceChange(item, e.target.value)}
                                inputMode="decimal"
                                type="text"
                                className="w-full"
                              />
                            ) : item.priceSource === 'PRICE_LIST' ? (
                              <select
                                value={item.priceListNo || ''}
                                onChange={(e) => handlePriceListChange(item, e.target.value)}
                                className="rounded-lg border border-gray-300 bg-white px-2 py-1"
                              >
                                <option value="">Liste sec</option>
                                {Object.keys(PRICE_LIST_LABELS).map((key) => {
                                  const listNo = Number(key);
                                  const listPrice = getMikroListPrice(item.mikroPriceLists, listNo);
                                  return (
                                    <option key={key} value={key}>
                                      {PRICE_LIST_LABELS[listNo]} ({listPrice ? formatCurrency(listPrice) : 'Fiyat yok'})
                                    </option>
                                  );
                                })}
                              </select>
                            ) : item.priceSource === 'LAST_SALE' ? (
                              item.lastSales?.length ? (
                                <div className="space-y-1">
                                  <select
                                    value={item.selectedSaleIndex ?? ''}
                                    onChange={(e) => handleLastSaleChange(item, e.target.value)}
                                    className="rounded-lg border border-gray-300 bg-white px-2 py-1"
                                  >
                                    <option value="">Satis sec</option>
                                    {item.lastSales.map((sale, idx) => {
                                      const listLabel = getMatchingPriceListLabel(item.mikroPriceLists, sale.unitPrice);
                                      return (
                                        <option key={idx} value={idx}>
                                          {formatDateShort(sale.saleDate)} - {formatCurrency(sale.unitPrice)} ({sale.quantity})
                                          {listLabel ? ` (${listLabel})` : ''}
                                        </option>
                                      );
                                    })}
                                  </select>
                                  {item.selectedSaleIndex !== undefined && item.lastSales[item.selectedSaleIndex] && (
                                    (() => {
                                      const selectedSale = item.lastSales?.[item.selectedSaleIndex];
                                      const listLabel = getMatchingPriceListLabel(item.mikroPriceLists, selectedSale?.unitPrice);
                                      return listLabel ? (
                                        <span className="inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                                          {listLabel}
                                        </span>
                                      ) : null;
                                    })()
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-500">Satis yok</span>
                              )
                            ) : item.priceSource === 'MANUAL' ? (
                              <div className="space-y-2">
                                <Input
                                  placeholder="Birim fiyat"
                                  value={item.manualPriceInput ?? formatManualPriceInput(item.unitPrice)}
                                  onChange={(e) => handleManualPriceChange(item, e.target.value)}
                                  inputMode="decimal"
                                  type="text"
                                  className="min-w-[180px]"
                                />
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  <div>
                                    <label className="block text-[11px] font-medium text-gray-500 leading-tight">
                                      Son giris kar (%)
                                    </label>
                                    <input
                                      type="number"
                                      value={item.manualMarginEntry ?? ''}
                                      onChange={(e) => handleManualMarginChange(item, 'entry', e.target.value)}
                                      className="mt-1 w-full min-w-[150px] rounded-lg border border-gray-300 px-2 py-1 text-xs"
                                      placeholder="Orn: 5"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-medium text-gray-500 leading-tight">
                                      Guncel maliyet kar (%)
                                    </label>
                                    <input
                                      type="number"
                                      value={item.manualMarginCost ?? ''}
                                      onChange={(e) => handleManualMarginChange(item, 'cost', e.target.value)}
                                      className="mt-1 w-full min-w-[150px] rounded-lg border border-gray-300 px-2 py-1 text-xs"
                                      placeholder="Orn: 8"
                                    />
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">Secim bekleniyor</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {roundedUnitPrice ? formatCurrency(roundedUnitPrice) : '-'}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {roundedUnitPrice ? formatCurrency(lineTotal) : '-'}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col gap-1">
                              {item.isManualLine ? (
                                <select
                                  value={item.manualVatRate === 0.01 ? '0.01' : item.manualVatRate === 0.1 ? '0.1' : '0.2'}
                                  onChange={(e) => handleManualVatChange(item, e.target.value)}
                                  className="rounded-lg border border-gray-300 bg-white px-2 py-1"
                                >
                                  <option value="0.01">%1</option>
                                  <option value="0.1">%10</option>
                                  <option value="0.2">%20</option>
                                </select>
                              ) : (
                                <span className="text-xs text-gray-600">%{Math.round(item.vatRate * 100)}</span>
                              )}
                              {!vatZeroed && (
                                <label className="flex items-center gap-1 text-xs text-gray-600">
                                  <input
                                    type="checkbox"
                                    checked={item.vatZeroed || false}
                                    onChange={(e) => updateItem(item.id, { vatZeroed: e.target.checked })}
                                  />
                                  KDV 0
                                </label>
                              )}
                              {vatZeroed && <span className="text-xs text-green-600">KDV 0</span>}
                            </div>
                          </td>
                          {trailingColumnKeys.map((columnKey) => {
                            if (columnKey === 'lineDescription') {
                              return (
                                <td key={columnKey} className="px-3 py-2">
                                  <Input
                                    placeholder="Satir aciklama"
                                    value={item.lineDescription || ''}
                                    onChange={(e) => updateItem(item.id, { lineDescription: e.target.value })}
                                    maxLength={40}
                                    className="w-full"
                                  />
                                  {isOrderMode && (
                                    <Input
                                      placeholder="Sorumluluk merkezi"
                                      value={item.responsibilityCenter || ''}
                                      onChange={(e) => updateItem(item.id, { responsibilityCenter: e.target.value })}
                                      maxLength={25}
                                      className="w-full mt-1"
                                    />
                                  )}
                                </td>
                              );
                            }
                            const column = columnKey.replace('stock:', '');
                            return (
                              <td key={columnKey} className="px-3 py-2 whitespace-nowrap">
                                {item.isManualLine ? '-' : getStockColumnValue(column, stockDataMap[item.productCode])}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 text-right">
                            <Button variant="danger" size="sm" onClick={() => removeItem(item.id)}>
                              Sil
                            </Button>
                          </td>
                        </tr>
                        {marginInfo && (
                          <tr
                            className="bg-yellow-50"
                            onDragOver={handleRowDragOver}
                            onDrop={handleRowDrop(item.id)}
                          >
                            <td colSpan={columnsCount} className="px-3 py-2">
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="rounded-full bg-yellow-200/70 px-2 py-1 font-semibold text-yellow-900">
                                  Fiyat analizi
                                </span>
                                <span className="rounded-full border border-yellow-200 bg-white px-2 py-1 text-gray-700">
                                  Son giris (KDV haric): <span className="font-semibold text-gray-900">{formatCurrency(marginInfo.lastEntry)}</span>
                                  {item.lastEntryDate && (
                                    <span className="ml-1 text-[11px] text-gray-500">({formatDateShort(item.lastEntryDate)})</span>
                                  )}
                                  <span className={`ml-1 font-semibold ${getPercentTone(marginInfo.lastEntryDiff)}`}>
                                    Kar {formatPercent(marginInfo.lastEntryDiff)}
                                  </span>
                                </span>
                                <span className="rounded-full border border-yellow-200 bg-white px-2 py-1 text-gray-700">
                                  Guncel maliyet (KDV haric): <span className="font-semibold text-gray-900">{formatCurrency(marginInfo.currentCost)}</span>
                                  {item.currentCostDate && (
                                    <span className="ml-1 text-[11px] text-gray-500">({formatDateShort(item.currentCostDate)})</span>
                                  )}
                                  <span className={`ml-1 font-semibold ${getPercentTone(marginInfo.currentCostDiff)}`}>
                                    Kar {formatPercent(marginInfo.currentCostDiff)}
                                  </span>
                                </span>
                                {marginInfo.openPurchase && (
                                  <span className="rounded-full bg-blue-100 px-2 py-1 font-semibold text-blue-700">
                                    Acik alis (KDV dahil = haric)
                                  </span>
                                )}
                                {marginInfo.blocked && (
                                  <span className="rounded-full bg-red-100 px-2 py-1 font-semibold text-red-700">
                                    Blok: %5 altinda
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {showTableScrollBar && (
            <div className={`mt-3 rounded-full border border-slate-200 px-2 py-1 ${scrollBarWrapperClass}`}>
              <div
                ref={tableScrollBarRef}
                className="h-3 overflow-x-auto overflow-y-hidden"
                onScroll={handleScrollBarScroll}
              >
                <div style={{ width: `${tableScrollMetrics.scrollWidth}px` }} className="h-3" />
              </div>
            </div>
          )}
        </Card>

        <Card className={`${cardShell} border-primary-100 bg-gradient-to-br from-white via-white to-primary-50/60 lg:sticky lg:top-6`}>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-500">Ara Toplam</p>
                <p className="text-xl font-semibold">{formatCurrency(totals.totalAmount)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">KDV</p>
                <p className="text-xl font-semibold">{formatCurrency(totals.totalVat)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Genel Toplam</p>
                <p className="text-2xl font-bold text-primary-600">{formatCurrency(totals.grandTotal)}</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-xs text-gray-500">{quoteItems.length} kalem secili</p>
              <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Gonderiliyor...' : isOrderMode ? 'Siparis Olustur' : isEditMode ? 'Teklifi Guncelle' : 'Teklif Olustur'}
              </Button>
            </div>
          </div>
        </Card>
          </div>
        </div>
      </div>

      <CariSelectModal
        isOpen={showCariModal}
        onClose={() => setShowCariModal(false)}
        cariList={customerOptions}
        onSelect={(cari) => {
          const match = customers.find((customer) => customer.id === cari.userId);
          if (match) {
            setSelectedCustomer(match);
            setHasManualCustomerChange(true);
          }
        }}
      />

      <Modal
        isOpen={showProductPoolModal}
        onClose={() => setShowProductPoolModal(false)}
        title="Urun Havuzu"
        size="full"
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-full bg-slate-100 p-1">
                <Button
                  variant="ghost"
                  onClick={() => setProductTab('purchased')}
                  size="sm"
                  className={`rounded-full px-4 ${productTab === 'purchased' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                >
                  Daha Once Alinanlar
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setProductTab('search')}
                  size="sm"
                  className={`rounded-full px-4 ${productTab === 'search' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                >
                  Tum Urunler
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span>Son {lastSalesCount} satis gosteriliyor.</span>
              <select
                value={poolSort}
                onChange={(e) => setPoolSort(e.target.value as PoolSortOption)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
              >
                {POOL_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={poolPriceListNo}
                onChange={(e) => {
                  const value = e.target.value;
                  setPoolPriceListNo(value ? Number(value) : '');
                }}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
              >
                <option value="">Liste fiyati secin</option>
                {Object.entries(PRICE_LIST_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <Button
                variant={showPoolColorOptions ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setShowPoolColorOptions((prev) => !prev)}
                className="rounded-full"
              >
                Renklendirme
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={savePoolPreferences}
                disabled={savingPoolPreferences}
                className="rounded-full"
              >
                {savingPoolPreferences ? 'Kaydediliyor...' : 'Gorunusu Kaydet'}
              </Button>
            </div>
          </div>
          {showPoolColorOptions && (
            <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-xs text-gray-600 space-y-3">
              {poolColorRules.length === 0 ? (
                <div className="text-xs text-slate-400">Renklendirme kurali yok.</div>
              ) : (
                <div className="space-y-3">
                  {poolColorRules.map((rule, index) => (
                    <div key={rule.id} className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500">
                        Kural {index + 1}
                      </span>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(e) => updatePoolColorRule(rule.id, { enabled: e.target.checked })}
                          className="h-4 w-4 accent-primary-600"
                        />
                        Aktif
                      </label>
                      <select
                        value={rule.warehouse}
                        onChange={(e) => updatePoolColorRule(rule.id, { warehouse: e.target.value as '1' | '6' })}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs"
                      >
                        <option value="1">Merkez</option>
                        <option value="6">Topca</option>
                      </select>
                      <select
                        value={rule.operator}
                        onChange={(e) =>
                          updatePoolColorRule(rule.id, { operator: e.target.value as PoolColorRule['operator'] })
                        }
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs"
                      >
                        <option value=">">Buyuk</option>
                        <option value=">=">Buyuk Esit</option>
                        <option value="<">Kucuk</option>
                        <option value="<=">Kucuk Esit</option>
                        <option value="=">Esit</option>
                      </select>
                      <input
                        type="number"
                        value={rule.threshold}
                        onChange={(e) => updatePoolColorRule(rule.id, { threshold: Number(e.target.value) })}
                        className="w-20 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs"
                      />
                      <select
                        value={rule.color}
                        onChange={(e) =>
                          updatePoolColorRule(rule.id, { color: e.target.value as PoolColorRule['color'] })
                        }
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs"
                      >
                        <option value="green">Yesil</option>
                        <option value="yellow">Sari</option>
                        <option value="blue">Mavi</option>
                        <option value="red">Kirmizi</option>
                        <option value="slate">Gri</option>
                      </select>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removePoolColorRule(rule.id)}
                        className="rounded-full text-red-600"
                      >
                        Sil
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" size="sm" onClick={addPoolColorRule} className="rounded-full">
                  Kural Ekle
                </Button>
                <span className="text-[11px] text-slate-400">
                  Ornek: Merkez buyuk 0 = yesil
                </span>
              </div>
            </div>
          )}

          {productTab === 'purchased' && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <Input
                  placeholder="Urun ara..."
                  value={purchasedSearch}
                  onChange={(e) => setPurchasedSearch(e.target.value)}
                  className="lg:max-w-xs"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-500">
                    {selectedPurchasedCount} secili / {filteredPurchasedProducts.length} urun
                  </span>
                  <Button variant="ghost" size="sm" onClick={clearPurchasedSelection}>
                    Secimi Temizle
                  </Button>
                  <Button variant="secondary" size="sm" onClick={selectAllPurchased} className="rounded-full">
                    Tumunu Sec
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={addSelectedPurchasedToQuote}
                    disabled={selectedPurchasedCount === 0}
                    className="rounded-full"
                  >
                    Secilileri Ekle
                  </Button>
                </div>
              </div>
              {sortedPurchasedProducts.length === 0 ? (
                <div className="text-sm text-gray-500">Urun bulunamadi.</div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3 max-h-[60vh] overflow-y-auto pr-2">
                  {sortedPurchasedProducts.map((product) => {
                    const isSelected = selectedPurchasedCodes.has(product.mikroCode);
                    const colorClass = getPoolColorClass(product);
                    const unitLabel = getUnitConversionLabel(product.unit, product.unit2, product.unit2Factor);
                    const poolPriceListValue = poolPriceListNo
                      ? getMikroListPrice(product.mikroPriceLists, Number(poolPriceListNo))
                      : 0;
                    const poolPriceLabel = poolPriceListNo ? getPoolPriceLabel(Number(poolPriceListNo)) : null;
                    const poolPriceDisplay = poolPriceLabel
                      ? poolPriceListValue > 0
                        ? formatCurrency(poolPriceListValue)
                        : '-'
                      : null;
                    return (
                      <div
                        key={product.mikroCode}
                        role="button"
                        tabIndex={0}
                        onClick={() => togglePurchasedSelection(product.mikroCode)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            togglePurchasedSelection(product.mikroCode);
                          }
                        }}
                        className={`rounded-xl border p-4 transition ${
                          isSelected
                            ? 'border-primary-200 bg-primary-50/70'
                            : colorClass
                              ? `${colorClass} hover:border-primary-200`
                              : 'border-gray-200 bg-white/90 hover:border-primary-200'
                        } cursor-pointer`}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => togglePurchasedSelection(product.mikroCode)}
                              onClick={(event) => event.stopPropagation()}
                              className="mt-1 h-4 w-4 accent-primary-600"
                            />
                            <div className="text-left">
                              <p className="font-semibold text-gray-900">{product.name}</p>
                              <p className="text-xs text-gray-500">
                                {product.mikroCode}
                                {product.unit ? ` - ${product.unit}` : ''}
                              </p>
                              <div className="mt-1 text-xs text-slate-500">
                                <span className="font-medium text-slate-600">Merkez</span>{' '}
                                {formatStockValue(product.warehouseStocks?.['1'])}
                                <span className="mx-2 text-slate-300">|</span>
                                <span className="font-medium text-slate-600">Topca</span>{' '}
                                {formatStockValue(product.warehouseStocks?.['6'])}
                              </div>
                              {unitLabel && (
                                <div className="mt-1 text-xs text-slate-500">{unitLabel}</div>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-start sm:items-end">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                addProductToQuote(product);
                              }}
                            >
                              {isOrderMode ? 'Siparise Ekle' : 'Teklife Ekle'}
                            </Button>
                            {poolPriceLabel && (
                              <div className="mt-2 text-[11px] font-semibold text-slate-700">
                                {poolPriceLabel}:{' '}
                                <span className="font-bold text-slate-900">{poolPriceDisplay}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        {product.lastSales?.length ? (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {product.lastSales.map((sale, idx) => {
                              const listLabel = getMatchingPriceListLabel(product.mikroPriceLists, sale.unitPrice);
                              return (
                              <div
                                key={idx}
                                className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs"
                              >
                                <span className="font-medium text-gray-700">{formatDateShort(sale.saleDate)}</span>
                                <span className="text-gray-500">{sale.quantity} adet</span>
                                <span className="font-semibold text-gray-900">{formatCurrency(sale.unitPrice)}</span>
                                {listLabel && (
                                  <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                                    {listLabel}
                                  </span>
                                )}
                                {sale.vatZeroed && <Badge variant="info" className="text-[10px]">KDV 0</Badge>}
                              </div>
                            );
                            })}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-gray-400">Satis yok</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {productTab === 'search' && (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <Input
                  placeholder="Urun adi veya kodu"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="lg:max-w-xs"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-500">
                    {selectedSearchCount} secili / {sortedSearchResults.length} urun
                  </span>
                  <Button variant="ghost" size="sm" onClick={clearSearchSelection}>
                    Secimi Temizle
                  </Button>
                  <Button variant="secondary" size="sm" onClick={selectAllSearch} className="rounded-full">
                    Tumunu Sec
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={addSelectedSearchToQuote}
                    disabled={selectedSearchCount === 0}
                    className="rounded-full"
                  >
                    Secilileri Ekle
                  </Button>
                </div>
              </div>
              {searchLoading ? (
                <div className="text-sm text-gray-500">Araniyor...</div>
              ) : sortedSearchResults.length === 0 ? (
                <div className="text-sm text-gray-500">Arama sonucu yok.</div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 max-h-[60vh] overflow-y-auto pr-2">
                  {sortedSearchResults.map((product) => {
                    const colorClass = getPoolColorClass(product);
                    const unitLabel = getUnitConversionLabel(product.unit, product.unit2, product.unit2Factor);
                    const isSelected = selectedSearchCodes.has(product.mikroCode);
                    const poolPriceListValue = poolPriceListNo
                      ? getMikroListPrice(product.mikroPriceLists, Number(poolPriceListNo))
                      : 0;
                    const poolPriceLabel = poolPriceListNo ? getPoolPriceLabel(Number(poolPriceListNo)) : null;
                    const poolPriceDisplay = poolPriceLabel
                      ? poolPriceListValue > 0
                        ? formatCurrency(poolPriceListValue)
                        : '-'
                      : null;
                    return (
                    <div
                      key={product.mikroCode}
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleSearchSelection(product.mikroCode)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          toggleSearchSelection(product.mikroCode);
                        }
                      }}
                      className={`rounded-xl border p-4 transition ${
                        isSelected
                          ? 'border-primary-200 bg-primary-50/70'
                          : colorClass
                            ? `${colorClass} hover:border-primary-200`
                            : 'border-gray-200 bg-white/90 hover:border-primary-200'
                      } cursor-pointer`}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSearchSelection(product.mikroCode)}
                              onClick={(event) => event.stopPropagation()}
                              className="mt-1 h-4 w-4 accent-primary-600"
                            />
                            <div>
                              <p className="font-semibold text-gray-900">{product.name}</p>
                              <p className="text-xs text-gray-500">{product.mikroCode}</p>
                              <div className="mt-1 text-xs text-slate-500">
                                <span className="font-medium text-slate-600">Merkez</span>{' '}
                                {formatStockValue(product.warehouseStocks?.['1'])}
                                <span className="mx-2 text-slate-300">|</span>
                                <span className="font-medium text-slate-600">Topca</span>{' '}
                                {formatStockValue(product.warehouseStocks?.['6'])}
                              </div>
                              {unitLabel && (
                                <div className="mt-1 text-xs text-slate-500">{unitLabel}</div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-start sm:items-end">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              addProductToQuote(product);
                            }}
                          >
                            {isOrderMode ? 'Siparise Ekle' : 'Teklife Ekle'}
                          </Button>
                          {poolPriceLabel && (
                            <div className="mt-2 text-[11px] font-semibold text-slate-700">
                              {poolPriceLabel}:{' '}
                              <span className="font-bold text-slate-900">{poolPriceDisplay}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {showColumnSelector && (
        <Modal
          isOpen={showColumnSelector}
          onClose={() => setShowColumnSelector(false)}
          title="Goruntulenecek Kolonlar"
          size="xl"
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowColumnSelector(false)}>
                Iptal
              </Button>
              <Button variant="primary" onClick={saveColumnPreferences} disabled={savingColumns}>
                {savingColumns ? 'Kaydediliyor...' : 'Gorunusu Kaydet'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
              <p className="text-xs text-gray-500">Kolonlari secin ve siralamayi surukleyin.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={selectAllColumns} className="rounded-full">
                  Tumunu Sec
                </Button>
                <Button variant="ghost" size="sm" onClick={clearAllColumns} className="rounded-full">
                  Tumunu Kaldir
                </Button>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-gray-700 mb-2">Secili Kolonlar (surukle birak)</div>
              <div className="flex flex-wrap gap-2">
                {reorderableColumns.map((column) => {
                  const isLineDescription = column === LINE_DESCRIPTION_KEY;
                  const label = isLineDescription ? 'Aciklama' : getColumnDisplayName(column);
                  return (
                    <div
                      key={column}
                      role="button"
                      tabIndex={0}
                      draggable
                      onDragStart={handleColumnDragStart(column)}
                      onDragOver={handleColumnDragOver}
                      onDrop={handleColumnDrop(column)}
                      onDragEnd={handleColumnDragEnd}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                        draggingColumn === column
                          ? 'border-primary-200 bg-primary-50 text-primary-700'
                          : 'border-gray-200 bg-white text-gray-700'
                      }`}
                      title="Surukleyerek sirala"
                    >
                      <span className="text-gray-400">::</span>
                      {label}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {availableColumns.map((column) => (
                <label key={column} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedColumns.includes(column)}
                    onChange={() => {
                      setSelectedColumns((prev) =>
                        prev.includes(column)
                          ? prev.filter((item) => item !== column)
                          : [...prev, column]
                      );
                    }}
                  />
                  {getColumnDisplayName(column)}
                </label>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function AdminQuoteNewPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Yukleniyor...</div>}>
      <AdminQuoteNewPageContent />
    </Suspense>
  );
}
