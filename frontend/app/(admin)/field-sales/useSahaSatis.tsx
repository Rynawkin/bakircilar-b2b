'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  BadgeCheck,
  Barcode,
  Briefcase,
  Camera,
  ClipboardList,
  DollarSign,
  Eye,
  EyeOff,
  FileText,
  History,
  Loader2,
  MapPin,
  Package,
  Plus,
  Search,
  Send,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Trash2,
  UserRound,
  Warehouse,
  X,
} from 'lucide-react';
import adminApi from '@/lib/api/admin';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import { getApiErrorMessage } from '@/lib/utils/apiError';
import { cn } from '@/lib/utils/cn';
import {
  convertPriceFromBaseUnit,
  convertPriceToBaseUnit,
  convertQuantityFromBaseUnit,
  convertQuantityToBaseUnit,
  getAvailableUnits,
  getUnitConversionLabel,
} from '@/lib/utils/unit';

// Re-export ikonlari (Classic/New JSX'lerin ihtiyaci icin tek noktadan)
export {
  BadgeCheck,
  Barcode,
  Briefcase,
  Camera,
  ClipboardList,
  DollarSign,
  Eye,
  EyeOff,
  FileText,
  History,
  Loader2,
  MapPin,
  Package,
  Plus,
  Search,
  Send,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Trash2,
  UserRound,
  Warehouse,
  X,
};
export { adminApi, Button, formatCurrency, formatDateShort, cn };
export {
  convertPriceFromBaseUnit,
  convertPriceToBaseUnit,
  convertQuantityFromBaseUnit,
  convertQuantityToBaseUnit,
  getAvailableUnits,
  getUnitConversionLabel,
};

export type TabKey = 'customer' | 'products' | 'draft' | 'history';
export type ProductMode = 'search' | 'purchased' | 'stock' | 'opportunity';
export type PriceType = 'INVOICED' | 'WHITE';

// 4.2: Carinin priceVisibility tercihine gore varsayilan fiyat tipini belirler.
// Sadece "varsayilan secim"i etkiler; fiyat hesabini degistirmez.
export const defaultPriceTypeForCustomer = (customer: any): PriceType =>
  customer?.priceVisibility === 'WHITE_ONLY' ? 'WHITE' : 'INVOICED';

export type DraftItem = {
  productId?: string | null;
  productCode: string;
  productName: string;
  imageUrl?: string | null;
  unit: string;
  unit2?: string | null;
  unit2Factor?: number | null;
  selectedUnit?: string | null;
  quantity: number;
  unitPrice: number;
  priceSource: 'LAST_SALE' | 'PRICE_LIST' | 'MANUAL';
  priceListNo?: number | null;
  selectedSaleIndex?: number | null;
  manualPriceInput?: string;
  vatZeroed?: boolean;
  priceType: 'INVOICED' | 'WHITE';
  priceLists?: Record<string, number> | Record<number, number>;
  lastSales?: any[];
  lastQuotes?: any[];
  categoryLastPurchase?: any | null;
  categoryLastPurchaseDate?: string | null;
  categoryMonthsSinceLastPurchase?: number | null;
  cost?: any | null;
};

const DRAFT_KEY = 'field-sales:draft';
const DRAFT_CUSTOMER_KEY = 'field-sales:draft-customer'; // 4.4: taslagi sahibi cari ile baglamak icin
const RECENT_CUSTOMERS_KEY = 'field-sales:recent-customers';
const RECENT_PRODUCTS_KEY = 'field-sales:recent-products';
const SAFE_MODE_KEY = 'field-sales:safe-mode';
const VISIT_PHOTO_MAX_INPUT_BYTES = 8 * 1024 * 1024;
const VISIT_PHOTO_MAX_DATA_URL_CHARS = 1_200_000;
const VISIT_PHOTO_RESIZE_STEPS = [
  { maxDimension: 1200, qualities: [0.72, 0.58, 0.45] },
  { maxDimension: 900, qualities: [0.68, 0.54, 0.42] },
  { maxDimension: 700, qualities: [0.62, 0.48, 0.36] },
];

export const tabs: Array<{ key: TabKey; label: string; icon: any }> = [
  { key: 'customer', label: 'Cari', icon: UserRound },
  { key: 'products', label: 'Urun', icon: Search },
  { key: 'draft', label: 'Taslak', icon: ShoppingCart },
  { key: 'history', label: 'Gecmis', icon: History },
];

export const money = (value: any) => formatCurrency(Number(value || 0));
export const n = (value: any, digits = 2) => Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: digits });
export const safeDate = (value?: string | null) => (value ? formatDateShort(String(value)) : '-');
const normalizeSearchText = (value: any) =>
  String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
const ACTIVE_WAREHOUSE_NOS = new Set([1, 6]);
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

export const getPriceListLabel = (listNo?: number | string | null) => {
  const parsed = Number(listNo || 0);
  return PRICE_LIST_LABELS[parsed] || `Liste ${listNo || '-'}`;
};

export const getActiveWarehouses = (product: any) =>
  (product?.warehouses || []).filter((row: any) => ACTIVE_WAREHOUSE_NOS.has(Number(row.no)));

export const getWarehouseByNo = (product: any, no: number) =>
  getActiveWarehouses(product).find((row: any) => Number(row.no) === no) || null;

export const activeSellable = (product: any) =>
  getActiveWarehouses(product).reduce((sum: number, row: any) => sum + Number(row.sellable || 0), 0);

export const roundUnitValue = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
};

export const parseDecimalInput = (input: string) => {
  const raw = String(input || '').replace(/\s+/g, '');
  if (!raw) return undefined;
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  let normalized = raw;
  if (lastComma !== -1 && lastDot !== -1) {
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    normalized = raw.replace(new RegExp(`\\${thousandsSeparator}`, 'g'), '').replace(decimalSeparator, '.');
  } else if (lastComma !== -1) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = raw.replace(/,/g, '');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const formatDecimalInput = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return value.toLocaleString('tr-TR', { useGrouping: false, maximumFractionDigits: 6 });
};

export const getMikroListPrice = (priceLists: any, listNo: number) => {
  if (!priceLists) return 0;
  const byNumber = priceLists[listNo];
  if (typeof byNumber === 'number') return byNumber;
  const byString = priceLists[String(listNo)];
  return typeof byString === 'number' ? byString : 0;
};

export const getSelectedUnit = (item: Pick<DraftItem, 'unit' | 'selectedUnit'>) =>
  item.selectedUnit || item.unit || 'ADET';

export const getDisplayQuantity = (item: DraftItem) =>
  roundUnitValue(convertQuantityFromBaseUnit(item.quantity || 0, getSelectedUnit(item), item.unit, item.unit2, item.unit2Factor));

export const getDisplayUnitPrice = (item: DraftItem) =>
  convertPriceFromBaseUnit(item.unitPrice || 0, getSelectedUnit(item), item.unit, item.unit2, item.unit2Factor);

export const getCategoryLastPurchaseInfo = (source: any) => {
  if (!source) return null;
  const info = source.categoryLastPurchase || null;
  const lastPurchaseDate = info?.lastPurchaseDate || source.lastPurchaseDate || source.categoryLastPurchaseDate || null;
  if (!lastPurchaseDate) return null;
  const months = info?.monthsSinceLastPurchase ?? source.monthsSinceLastPurchase ?? source.categoryMonthsSinceLastPurchase ?? monthsSinceDate(lastPurchaseDate);
  return {
    categoryCode: info?.categoryCode || source.categoryCode || null,
    categoryName: info?.categoryName || source.categoryName || null,
    lastPurchaseDate,
    monthsSinceLastPurchase: months,
  };
};

export const monthsSinceDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diffDays = Math.max(0, (Date.now() - date.getTime()) / 86_400_000);
  return Math.round((diffDays / 30.4375) * 10) / 10;
};

export const getMatchingPriceListLabel = (priceLists: any, unitPrice?: number | null) => {
  if (!priceLists || !Number.isFinite(Number(unitPrice))) return null;
  const target = Math.round((Number(unitPrice) + Number.EPSILON) * 100) / 100;
  for (const [key, value] of Object.entries(priceLists)) {
    const listNo = Number(key);
    const price = Number(value);
    if (!Number.isFinite(listNo) || !Number.isFinite(price) || price <= 0) continue;
    if (Math.round((price + Number.EPSILON) * 100) / 100 === target) {
      return getPriceListLabel(listNo);
    }
  }
  return null;
};

const loadJson = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const saveJson = (key: string, value: unknown) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

// 4.4: Cari icin sabit anahtar (id varsa id, yoksa mikro kod).
const customerKey = (customer: any) => String(customer?.id || customer?.mikroCariCode || '');

const upsertRecent = (key: string, item: any, idGetter: (row: any) => string) => {
  const id = idGetter(item);
  if (!id) return;
  const current = loadJson<any[]>(key, []);
  const next = [item, ...current.filter((row) => idGetter(row) !== id)].slice(0, 12);
  saveJson(key, next);
};

export const readCompressedVisitPhoto = async (file: File): Promise<string> => {
  if (!file.type.startsWith('image/')) {
    throw new Error('Sadece gorsel dosyasi secin.');
  }
  if (file.size > VISIT_PHOTO_MAX_INPUT_BYTES) {
    throw new Error('Foto cok buyuk. 8 MB altinda bir gorsel secin.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Foto okunamadi.'));
      img.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Foto islenemedi.');
    }

    for (const step of VISIT_PHOTO_RESIZE_STEPS) {
      const ratio = Math.min(1, step.maxDimension / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * ratio));
      canvas.height = Math.max(1, Math.round(image.height * ratio));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      for (const quality of step.qualities) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrl.length <= VISIT_PHOTO_MAX_DATA_URL_CHARS) {
          return dataUrl;
        }
      }
    }

    throw new Error('Foto otomatik kucultulemedi. Daha dusuk cozunurluklu bir foto secin.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

// 4.2: Faturali/Beyaz secimi. Fiyat hesabi DEGISMEZ; backend'in zaten dondurdugu
// customerPrice.invoiced / customerPrice.white degerlerinden dogru olani secilir.
export const getProductPrice = (product: any, priceType: PriceType = 'INVOICED') => {
  const customerPrice = product?.customerPrice;
  const isWhite = priceType === 'WHITE';
  const chosenValue = isWhite ? Number(customerPrice?.white) : Number(customerPrice?.invoiced);
  const chosenListNo = isWhite ? customerPrice?.whitePriceListNo : customerPrice?.priceListNo;
  if (chosenValue > 0) {
    return {
      value: chosenValue,
      source: customerPrice.source === 'AGREEMENT' ? 'Anlasma' : getPriceListLabel(chosenListNo),
      priceListNo: customerPrice.source === 'AGREEMENT' ? null : chosenListNo,
      priceSource: customerPrice.source === 'AGREEMENT' ? 'MANUAL' : 'PRICE_LIST',
      priceType,
    };
  }
  // Fallback: faturali icin Toptan 1 (6), beyaz icin Perakende 1 (1) listesi.
  const fallbackListNo = isWhite ? 1 : 6;
  const fallback = Number(product?.priceLists?.[String(fallbackListNo)] || product?.priceLists?.[fallbackListNo] || 0);
  return { value: fallback, source: getPriceListLabel(fallbackListNo), priceListNo: fallbackListNo, priceSource: 'PRICE_LIST', priceType };
};

export const getOpportunityRows = (opportunities: any) => [
  ...(opportunities?.stalePurchased || []),
  ...(opportunities?.agreementNoRecent || []),
  ...(opportunities?.similarSector || []),
];

export const normalizeProductLike = (rawProduct: any) => {
  if (!rawProduct) return {};
  return rawProduct.mikroCode
    ? rawProduct
    : {
        ...rawProduct,
        mikroCode: rawProduct.productCode,
        name: rawProduct.productName,
      };
};

export const matchesProductSearch = (product: any, search: string) => {
  const tokens = normalizeSearchText(search).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = normalizeSearchText([
    product.productCode,
    product.mikroCode,
    product.productName,
    product.name,
    product.categoryName,
    product.brandCode,
  ].filter(Boolean).join(' '));
  return tokens.every((token) => haystack.includes(token));
};

export const bumpDecimalText = (value: string, diff: number) => {
  const parsed = parseDecimalInput(value);
  const next = Math.max(0.0001, (parsed === undefined ? 0 : parsed) + diff);
  return formatDecimalInput(roundUnitValue(next));
};

export const getCostValue = (source: any) => {
  const cost = source?.cost || source;
  const value = Number(cost?.currentCostVatIncluded || cost?.currentCost || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

export const getProfitInfo = (unitPrice: number, source: any) => {
  const cost = getCostValue(source);
  const price = Number(unitPrice || 0);
  if (!cost || !price) return null;
  const profit = price - cost;
  const percent = (profit / cost) * 100;
  return {
    cost,
    profit,
    percent,
    tone: profit < 0 ? 'red' : percent < 5 ? 'amber' : 'emerald',
  };
};

export const buildWhatsappText = (customer: any, product: any, safeMode: boolean) => {
  const price = getProductPrice(product);
  const stockLine = getActiveWarehouses(product)
    .filter((row: any) => Number(row.sellable || row.stock || 0) !== 0)
    .map((row: any) => `${row.label}: ${n(row.sellable || row.stock)}`)
    .join(' | ');
  const lines = [
    customer ? `${customer.displayTitle || customer.name || customer.mikroCariCode}` : null,
    `${product.name} (${product.mikroCode})`,
    `Fiyat: ${money(price.value)} ${price.source}`,
    stockLine ? `Stok: ${stockLine}` : 'Stok: sorunuz',
    product.unit ? `Birim: ${product.unit}` : null,
    !safeMode && product.cost?.currentCostVatIncluded ? `Ic not maliyet: ${money(product.cost.currentCostVatIncluded)}` : null,
  ].filter(Boolean);
  return lines.join('\n');
};

/**
 * Saha Satis ekraninin TUM mantigi (state/effect/handler/turetilmis deger/ref).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir.
 */
export function useSahaSatis() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>('customer');
  const [safeMode, setSafeMode] = useState(true);
  const [priceType, setPriceType] = useState<PriceType>('INVOICED'); // 4.2: Faturali/Beyaz secimi
  const [isOnline, setIsOnline] = useState(true); // 4.5: cevrimici/cevrimdisi gostergesi
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  const [productSearch, setProductSearch] = useState('');
  const [productMode, setProductMode] = useState<ProductMode>('search');
  const [products, setProducts] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [productQuantities, setProductQuantities] = useState<Record<string, string>>({});
  const productSearchCacheRef = useRef<Map<string, any[]>>(new Map());
  const productDetailCacheRef = useRef<Map<string, any>>(new Map());

  const [draft, setDraft] = useState<DraftItem[]>([]);
  // 4.4: Taslagin hangi cariye ait oldugunu tutar (cihazdaki taslagi cari ile baglar).
  const [draftCustomer, setDraftCustomer] = useState<{ id?: string | null; mikroCariCode?: string | null; title?: string | null } | null>(null);
  const [quoteNote, setQuoteNote] = useState('Saha satis taslagi');
  const [validityDate, setValidityDate] = useState('');
  const [orderWarehouse, setOrderWarehouse] = useState('1');
  const [orderSeries, setOrderSeries] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [visitNote, setVisitNote] = useState('');
  const [visitDemand, setVisitDemand] = useState('');
  const [competitorInfo, setCompetitorInfo] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);

  const [newVisitOpen, setNewVisitOpen] = useState(false);
  const [newVisitName, setNewVisitName] = useState('');
  const [newVisitPhone, setNewVisitPhone] = useState('');
  const [newVisitNote, setNewVisitNote] = useState('');
  const [newVisitDemand, setNewVisitDemand] = useState('');
  const [newVisitCompetitorInfo, setNewVisitCompetitorInfo] = useState('');
  const [newVisitPhotoUrl, setNewVisitPhotoUrl] = useState<string | null>(null);
  const [newVisitLocation, setNewVisitLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [newVisitSaving, setNewVisitSaving] = useState(false);
  const [duplicateCandidates, setDuplicateCandidates] = useState<any[]>([]); // 4.6: benzer cari adaylari

  const [recentCustomers, setRecentCustomers] = useState<any[]>([]);
  const [recentProducts, setRecentProducts] = useState<any[]>([]);
  const [barcodeActive, setBarcodeActive] = useState(false);

  useEffect(() => {
    setDraft(loadJson<DraftItem[]>(DRAFT_KEY, []));
    setDraftCustomer(loadJson<any>(DRAFT_CUSTOMER_KEY, null)); // 4.4
    setRecentCustomers(loadJson<any[]>(RECENT_CUSTOMERS_KEY, []));
    setRecentProducts(loadJson<any[]>(RECENT_PRODUCTS_KEY, []));
    const savedSafeMode = loadJson<boolean | null>(SAFE_MODE_KEY, null);
    setSafeMode(savedSafeMode === null ? true : Boolean(savedSafeMode));
    const date = new Date();
    date.setDate(date.getDate() + 7);
    setValidityDate(date.toISOString().slice(0, 10));
    // 4.5: cevrimici/cevrimdisi durumu izle
    if (typeof navigator !== 'undefined') setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      stopBarcodeScanner();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    saveJson(DRAFT_KEY, draft);
  }, [draft]);

  useEffect(() => {
    saveJson(DRAFT_CUSTOMER_KEY, draftCustomer); // 4.4
  }, [draftCustomer]);

  useEffect(() => {
    saveJson(SAFE_MODE_KEY, safeMode);
  }, [safeMode]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void searchCustomers();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [customerSearch]);

  useEffect(() => {
    if (!selectedCustomer) return;
    void loadCustomerSnapshot(selectedCustomer.id || selectedCustomer.mikroCariCode);
    upsertRecent(RECENT_CUSTOMERS_KEY, selectedCustomer, (row) => String(row.id || row.mikroCariCode || ''));
    setRecentCustomers(loadJson<any[]>(RECENT_CUSTOMERS_KEY, []));

    // 4.2: cari degisince varsayilan fiyat tipini carinin tercihine gore ayarla.
    setPriceType(defaultPriceTypeForCustomer(selectedCustomer));

    // 4.3: cari degisince onceki carinin fiyat/detay onbellegini temizle (eski fiyat gosterme).
    productSearchCacheRef.current.clear();
    productDetailCacheRef.current.clear();
    setProducts([]);
    setSelectedProduct(null);

    // 4.4: taslakta urun varsa ve baska cariye aitse kullaniciyi uyar.
    const nextKey = customerKey(selectedCustomer);
    if (draft.length > 0 && draftCustomer && customerKey(draftCustomer) && customerKey(draftCustomer) !== nextKey) {
      toast(
        `Taslakta "${draftCustomer.title || draftCustomer.mikroCariCode}" carisine ait ${draft.length} kalem var. Yeni cari ile karismamasi icin once taslagi gonderin veya temizleyin.`,
        { icon: '⚠️', duration: 6000 }
      );
    } else if (draft.length === 0 || !draftCustomer) {
      // Taslak bos ya da sahipsizse yeni secili cariye baglanir.
      setDraftCustomer({
        id: selectedCustomer.id || null,
        mikroCariCode: selectedCustomer.mikroCariCode || null,
        title: selectedCustomer.displayTitle || selectedCustomer.name || selectedCustomer.mikroCariCode || null,
      });
    }
  }, [selectedCustomer?.id, selectedCustomer?.mikroCariCode]);

  useEffect(() => {
    if (productMode !== 'search' && productMode !== 'stock') return;
    if (!productSearch.trim() || productSearch.trim().length < 2) {
      setProducts([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchProducts();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [productSearch, selectedCustomer?.id, selectedCustomer?.mikroCariCode, safeMode, productMode]);

  const draftTotal = useMemo(
    () => draft.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0),
    [draft]
  );

  const customerIdForApi = selectedCustomer?.id || selectedCustomer?.mikroCariCode || '';

  const searchCustomers = async () => {
    const term = customerSearch.trim();
    if (term.length > 0 && term.length < 2) return;
    setCustomerLoading(true);
    try {
      const result = await adminApi.searchFieldSalesCustomers({ search: term, limit: 25 });
      setCustomers(result.customers || []);
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'Cari aramasi yapilamadi.'));
    } finally {
      setCustomerLoading(false);
    }
  };

  const loadCustomerSnapshot = async (customerIdOrCode: string) => {
    if (!customerIdOrCode) return;
    setSnapshotLoading(true);
    try {
      const result = await adminApi.getFieldSalesCustomer(customerIdOrCode);
      setSnapshot(result.data);
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'Cari bilgileri alinamadi.'));
    } finally {
      setSnapshotLoading(false);
    }
  };

  const searchProducts = async () => {
    const term = productSearch.trim();
    if (term.length < 2) return;
    const cacheKey = `${customerIdForApi || 'no-customer'}::${safeMode ? 'safe' : 'internal'}::${term.toLocaleLowerCase('tr-TR')}`;
    const cached = productSearchCacheRef.current.get(cacheKey);
    if (cached) {
      setProducts(cached);
      return;
    }
    setProductsLoading(true);
    try {
      const result = await adminApi.searchFieldSalesProducts({
        search: term,
        customerId: customerIdForApi || undefined,
        limit: 30,
        safeMode,
      });
      const nextProducts = result.products || [];
      productSearchCacheRef.current.set(cacheKey, nextProducts);
      setProducts(nextProducts);
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'Urun aramasi yapilamadi.'));
    } finally {
      setProductsLoading(false);
    }
  };

  const openProductDetail = async (product: any) => {
    const normalizedProduct = normalizeProductLike(product);
    const code = String(normalizedProduct?.mikroCode || '').trim();
    setSelectedProduct(normalizedProduct);
    upsertRecent(RECENT_PRODUCTS_KEY, normalizedProduct, (row) => String(row.mikroCode || ''));
    setRecentProducts(loadJson<any[]>(RECENT_PRODUCTS_KEY, []));
    if (!code) return;
    const cacheKey = `${customerIdForApi || 'no-customer'}::${safeMode ? 'safe' : 'internal'}::${code}`;
    const cached = productDetailCacheRef.current.get(cacheKey);
    if (cached) {
      setSelectedProduct(cached);
      return;
    }
    try {
      const result = await adminApi.getFieldSalesProduct(code, {
        customerId: customerIdForApi || undefined,
        safeMode,
      });
      const detail = result.data.product || normalizedProduct;
      productDetailCacheRef.current.set(cacheKey, detail);
      setSelectedProduct(detail);
    } catch {
      setSelectedProduct(normalizedProduct);
    }
  };

  const resolveProductForDraft = async (product: any) => {
    const code = String(product?.mikroCode || product?.productCode || '').trim();
    if (!code) return product;
    if (product?.priceLists || product?.customerPrice) return { ...product, mikroCode: code };
    const cacheKey = `${customerIdForApi || 'no-customer'}::${safeMode ? 'safe' : 'internal'}::${code}`;
    const cached = productDetailCacheRef.current.get(cacheKey);
    if (cached) return cached;
    try {
      const result = await adminApi.getFieldSalesProduct(code, {
        customerId: customerIdForApi || undefined,
        safeMode,
      });
      const detail = result.data.product || { ...product, mikroCode: code };
      productDetailCacheRef.current.set(cacheKey, detail);
      return detail;
    } catch {
      return { ...product, mikroCode: code };
    }
  };

  const addToDraft = async (
    product: any,
    options?: {
      priceSource?: DraftItem['priceSource'];
      priceListNo?: number;
      saleIndex?: number;
      unitPrice?: number;
      selectedUnit?: string;
      priceType?: PriceType; // 4.2: ozellikle bir tip istenirse (yoksa ekrandaki secim)
    }
  ) => {
    const resolvedProduct = await resolveProductForDraft(product);
    const code = String(resolvedProduct?.mikroCode || resolvedProduct?.productCode || '').trim();
    if (!code) {
      toast.error('Urun kodu bulunamadi.');
      return;
    }
    // 4.2: ekrandaki Faturali/Beyaz secimine gore dogru (backend'den gelen) fiyati sec.
    const effectivePriceType: PriceType = options?.priceType ?? priceType;
    const isWhite = effectivePriceType === 'WHITE';
    const price = getProductPrice(resolvedProduct, effectivePriceType);
    const selectedUnit = options?.selectedUnit || resolvedProduct.unit || 'ADET';
    const quantityInput = productQuantities[code] || productQuantities[resolvedProduct.mikroCode] || '1';
    const displayQuantity = Math.max(0.0001, parseDecimalInput(quantityInput) || 1);
    const quantity = convertQuantityToBaseUnit(displayQuantity, selectedUnit, resolvedProduct.unit, resolvedProduct.unit2, resolvedProduct.unit2Factor);
    const sale = options?.saleIndex !== undefined ? resolvedProduct.customerPrice?.lastSales?.[options.saleIndex] : undefined;
    const unitPrice = options?.unitPrice ?? sale?.unitPrice ?? Number(price.value || 0);
    const priceSource = options?.priceSource || (sale ? 'LAST_SALE' : price.priceSource);
    const item: DraftItem = {
      productId: resolvedProduct.id,
      productCode: code,
      productName: resolvedProduct.name || resolvedProduct.productName || code,
      imageUrl: resolvedProduct.imageUrl,
      unit: resolvedProduct.unit || 'ADET',
      unit2: resolvedProduct.unit2 || null,
      unit2Factor: resolvedProduct.unit2Factor || null,
      selectedUnit,
      quantity,
      unitPrice: Number(unitPrice || 0),
      priceSource: priceSource as DraftItem['priceSource'],
      priceListNo: options?.priceListNo ?? price.priceListNo ?? null,
      selectedSaleIndex: options?.saleIndex ?? null,
      // 4.2: Beyaz secimde KDV sifirlanir (siparis tarafindaki mevcut beyaz mantigi ile ayni).
      vatZeroed: isWhite ? true : Boolean(sale?.vatZeroed),
      priceType: effectivePriceType,
      priceLists: resolvedProduct.priceLists || {},
      lastSales: resolvedProduct.customerPrice?.lastSales || [],
      lastQuotes: resolvedProduct.lastQuotes || [],
      categoryLastPurchase: getCategoryLastPurchaseInfo(resolvedProduct),
      categoryLastPurchaseDate: resolvedProduct.categoryLastPurchaseDate || null,
      categoryMonthsSinceLastPurchase: resolvedProduct.categoryMonthsSinceLastPurchase ?? null,
      cost: resolvedProduct.cost || null,
    };

    // 4.4: taslaga ilk urun eklenirken sahibi cariyi sabitle.
    if (selectedCustomer && (draft.length === 0 || !draftCustomer)) {
      setDraftCustomer({
        id: selectedCustomer.id || null,
        mikroCariCode: selectedCustomer.mikroCariCode || null,
        title: selectedCustomer.displayTitle || selectedCustomer.name || selectedCustomer.mikroCariCode || null,
      });
    }

    // 4.8: ekleme kararini (birlestir / uyar / yeni satir) state guncellemesinden once belirle.
    const isExactRow = (row: DraftItem) =>
      row.productCode === item.productCode
      && row.unitPrice === item.unitPrice
      && getSelectedUnit(row) === getSelectedUnit(item)
      && row.priceSource === item.priceSource
      && row.priceType === item.priceType;
    const hasExact = draft.some(isExactRow);
    const hasSameProduct = draft.some((row) => row.productCode === item.productCode);

    setDraft((current) => {
      const exact = current.find(isExactRow);
      if (exact) {
        return current.map((row) =>
          row === exact ? { ...row, quantity: Number(row.quantity || 0) + quantity } : row
        );
      }
      return [...current, item];
    });

    if (hasExact) {
      toast.success('Ayni satir bulundu, miktar birlestirildi.');
    } else if (hasSameProduct) {
      // 4.8: ayni urun farkli kosulla zaten taslakta -> uyar, yine de ayri satir eklenir.
      toast('Bu urun taslakta zaten var; farkli kosulla yeni satir olarak eklendi.', { icon: '⚠️', duration: 5000 });
    } else {
      toast.success('Taslak sepete eklendi.');
    }
    setProductQuantities((current) => ({ ...current, [code]: '1' }));
  };

  const updateDraftItem = (index: number, changes: Partial<DraftItem>) => {
    setDraft((current) => current.map((item, i) => (i === index ? { ...item, ...changes } : item)));
  };

  const removeDraftItem = (index: number) => {
    setDraft((current) => current.filter((_, i) => i !== index));
  };

  const clearDraft = () => {
    setDraft([]);
    saveJson(DRAFT_KEY, []);
    setDraftCustomer(null); // 4.4: taslak temizlenince cari baglantisini da kaldir
  };

  // 4.4: Taslagin sahibi cari ile secili cari uyusmuyorsa gonderimi engelle.
  const ensureDraftCustomerMatches = () => {
    if (!draftCustomer || !customerKey(draftCustomer)) return true;
    if (customerKey(draftCustomer) === customerKey(selectedCustomer)) return true;
    toast.error(`Taslak "${draftCustomer.title || draftCustomer.mikroCariCode}" carisine ait. Once o cariyi secin veya taslagi temizleyin.`);
    return false;
  };

  const createQuote = async () => {
    if (submitting) return; // 4.5: mukerrer gonderim korumasi
    if (!selectedCustomer?.id) {
      toast.error('Once cari secin.');
      setActiveTab('customer');
      return;
    }
    if (draft.length === 0) {
      toast.error('Taslakta urun yok.');
      return;
    }
    if (!validityDate) {
      toast.error('Teklif gecerlilik tarihi gerekli.');
      return;
    }
    if (!ensureDraftCustomerMatches()) return; // 4.4
    if (!isOnline) { // 4.5: cevrimdisi uyarisi
      toast.error('Internet baglantisi yok. Baglanti gelince tekrar deneyin.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await adminApi.createQuote({
        customerId: selectedCustomer.id,
        validityDate,
        note: quoteNote,
        documentNo: quoteNote,
        vatZeroed: false,
        items: draft.map((item) => ({
          productId: item.productId || undefined,
          productCode: item.productCode,
          productName: item.productName,
          unit: item.unit,
          unit2: item.unit2 || undefined,
          unit2Factor: item.unit2Factor || undefined,
          selectedUnit: getSelectedUnit(item),
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unitPrice || 0),
          priceSource: item.priceSource,
          priceListNo: item.priceSource === 'PRICE_LIST' ? item.priceListNo : undefined,
          priceType: item.priceType === 'WHITE' ? 'WHITE' : 'INVOICED', // 4.2
          vatZeroed: item.vatZeroed || false,
          lastSale: item.priceSource === 'LAST_SALE' && item.selectedSaleIndex !== null && item.selectedSaleIndex !== undefined
            ? item.lastSales?.[item.selectedSaleIndex]
            : undefined,
        })),
      });
      toast.success('Teklif olusturuldu.');
      clearDraft();
      router.push(`/quotes?tab=sent${result.quote?.id ? `&download=${result.quote.id}` : ''}`);
    } catch (error: any) {
      // 4.5: baglanti hatasini ayri mesajla goster
      if (!error.response) {
        toast.error('Baglanti hatasi: Teklif gonderilemedi. Internet baglantinizi kontrol edip tekrar deneyin.');
      } else {
        toast.error(getApiErrorMessage(error, 'Teklif olusturulamadi.'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const createOrder = async () => {
    if (submitting) return; // 4.5: mukerrer gonderim korumasi
    if (!selectedCustomer?.id) {
      toast.error('Once cari secin.');
      return;
    }
    if (draft.length === 0) {
      toast.error('Taslakta urun yok.');
      return;
    }
    if (!orderSeries.trim()) {
      toast.error('Siparis seri no girin.');
      return;
    }
    if (!ensureDraftCustomerMatches()) return; // 4.4
    if (!isOnline) { // 4.5: cevrimdisi uyarisi
      toast.error('Internet baglantisi yok. Baglanti gelince tekrar deneyin.');
      return;
    }

    // 4.2: Faturali ve beyaz kalemler ayri Mikro evragina yazilir; seri her ikisine de uygulanir.
    const series = orderSeries.trim();
    const hasWhite = draft.some((item) => item.priceType === 'WHITE');
    const hasInvoiced = draft.some((item) => item.priceType !== 'WHITE');

    setSubmitting(true);
    try {
      const result = await adminApi.createManualOrder({
        customerId: selectedCustomer.id,
        warehouseNo: Number(orderWarehouse),
        description: quoteNote || 'Saha satis siparisi',
        documentDescription: quoteNote || undefined,
        invoicedSeries: hasInvoiced ? series : undefined,
        whiteSeries: hasWhite ? series : undefined,
        items: draft.map((item) => ({
          productId: item.productId || undefined,
          productCode: item.productCode,
          productName: item.productName,
          unit: item.unit,
          unit2: item.unit2 || undefined,
          unit2Factor: item.unit2Factor || undefined,
          selectedUnit: getSelectedUnit(item),
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unitPrice || 0),
          priceType: item.priceType === 'WHITE' ? 'WHITE' : 'INVOICED', // 4.2
          vatZeroed: item.vatZeroed || false,
          lineDescription: item.productName,
        })),
      });
      if (result.mikroPending) {
        toast.error(result.warning || `Siparis B2B'ye kaydedildi, Mikro beklemede: ${result.orderNumber}`, { duration: 9000 });
      } else {
        toast.success(`Siparis olusturuldu: ${result.orderNumber}`);
      }
      clearDraft();
      router.push('/orders');
    } catch (error: any) {
      // 4.5: baglanti hatasini ayri mesajla goster
      if (!error.response) {
        toast.error('Baglanti hatasi: Siparis gonderilemedi. Internet baglantinizi kontrol edip tekrar deneyin.');
      } else {
        toast.error(getApiErrorMessage(error, 'Siparis olusturulamadi.'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const shareProduct = (product: any) => {
    const text = buildWhatsappText(selectedCustomer, product, true);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const shareDraft = () => {
    if (draft.length === 0) return;
    const lines = [
      selectedCustomer ? `${selectedCustomer.displayTitle || selectedCustomer.mikroCariCode}` : 'Saha satis taslagi',
      ...draft.map((item) => {
        const selectedUnit = getSelectedUnit(item);
        const displayQuantity = getDisplayQuantity(item);
        const displayPrice = getDisplayUnitPrice(item);
        return `${item.productName} (${item.productCode}) - ${n(displayQuantity)} ${selectedUnit} x ${money(displayPrice)} = ${money(item.quantity * item.unitPrice)}`;
      }),
      `Toplam: ${money(draftTotal)}`,
    ];
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
  };

  const saveVisitNote = async () => {
    if (!selectedCustomer) {
      toast.error('Once cari secin.');
      return;
    }
    if (!visitNote.trim()) {
      toast.error('Not bos olamaz.');
      return;
    }
    setNoteSaving(true);
    try {
      await adminApi.createFieldSalesVisitNote(customerIdForApi, {
        note: visitNote.trim(),
        demand: visitDemand.trim() || null,
        competitorInfo: competitorInfo.trim() || null,
        photoUrl,
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
      });
      setVisitNote('');
      setVisitDemand('');
      setCompetitorInfo('');
      setPhotoUrl(null);
      setLocation(null);
      toast.success('Ziyaret notu kaydedildi.');
      await loadCustomerSnapshot(customerIdForApi);
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'Not kaydedilemedi.'));
    } finally {
      setNoteSaving(false);
    }
  };

  // 4.6: force=true ise benzer cari uyarisini bilerek gecip yine de yeni cari acar.
  const saveNewVisitCustomer = async (force = false) => {
    if (!newVisitName.trim()) {
      toast.error('Musteri adi zorunlu.');
      return;
    }
    if (!isOnline) { // 4.5: cevrimdisi uyarisi
      toast.error('Internet baglantisi yok. Baglanti gelince tekrar deneyin.');
      return;
    }
    setNewVisitSaving(true);
    try {
      const result = await adminApi.createFieldSalesVisitCustomer({
        customerName: newVisitName.trim(),
        phone: newVisitPhone.trim() || null,
        note: newVisitNote.trim() || 'Yeni musteri ziyareti',
        demand: newVisitDemand.trim() || null,
        competitorInfo: newVisitCompetitorInfo.trim() || null,
        photoUrl: newVisitPhotoUrl,
        latitude: newVisitLocation?.latitude || null,
        longitude: newVisitLocation?.longitude || null,
        ...(force ? { force: true } : {}),
      } as any);
      const customer = result.data.customer;
      setSelectedCustomer(customer);
      setCustomerSearch(customer.displayTitle || customer.mikroCariCode || '');
      setNewVisitOpen(false);
      setDuplicateCandidates([]);
      setNewVisitName('');
      setNewVisitPhone('');
      setNewVisitNote('');
      setNewVisitDemand('');
      setNewVisitCompetitorInfo('');
      setNewVisitPhotoUrl(null);
      setNewVisitLocation(null);
      toast.success(`Ziyaret carisi acildi: ${customer.mikroCariCode}`);
    } catch (error: any) {
      // 4.6: benzer cari bulundu -> aday listesini goster, kullanici karar versin.
      const details = error.response?.data?.details;
      if (error.response?.status === 409 && details?.kind === 'DUPLICATE_VISIT_CUSTOMER') {
        setDuplicateCandidates(Array.isArray(details.candidates) ? details.candidates : []);
        toast('Benzer cari(ler) bulundu. Mevcut cariyi secebilir veya yine de olusturabilirsiniz.', { icon: '⚠️', duration: 6000 });
      } else if (!error.response) {
        toast.error('Baglanti hatasi: Ziyaret carisi olusturulamadi. Internet baglantinizi kontrol edin.');
      } else {
        toast.error(getApiErrorMessage(error, 'Ziyaret carisi olusturulamadi.'));
      }
    } finally {
      setNewVisitSaving(false);
    }
  };

  // 4.6: Uyari ekranindan mevcut bir cariyi secip yeni cari acmaktan vazgecmek.
  const selectExistingDuplicate = (candidate: any) => {
    setSelectedCustomer(candidate);
    setCustomerSearch(candidate.displayTitle || candidate.mikroCariCode || '');
    setNewVisitOpen(false);
    setDuplicateCandidates([]);
    setNewVisitName('');
    setNewVisitPhone('');
    setNewVisitNote('');
    setNewVisitDemand('');
    setNewVisitCompetitorInfo('');
    setNewVisitPhotoUrl(null);
    setNewVisitLocation(null);
    toast.success(`Mevcut cari secildi: ${candidate.mikroCariCode || candidate.displayTitle}`);
  };

  const pickPhoto = async (file?: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await readCompressedVisitPhoto(file);
      setPhotoUrl(dataUrl);
    } catch (error: any) {
      toast.error(error.message || 'Foto eklenemedi.');
    }
  };

  const captureLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Konum destegi yok.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        toast.success('Konum eklendi.');
      },
      () => toast.error('Konum alinamadi.'),
      { enableHighAccuracy: false, timeout: 6000 }
    );
  };

  const captureNewVisitLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Konum destegi yok.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNewVisitLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        toast.success('Yeni ziyaret konumu eklendi.');
      },
      () => toast.error('Konum alinamadi.'),
      { enableHighAccuracy: false, timeout: 6000 }
    );
  };

  const stopBarcodeScanner = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setBarcodeActive(false);
  };

  const startBarcodeScanner = async () => {
    const BarcodeDetectorCtor = (window as any).BarcodeDetector;
    if (!BarcodeDetectorCtor || !navigator.mediaDevices?.getUserMedia) {
      toast.error('Bu tarayicida kamera barkod okuma yok. Kodu arama kutusuna okutabilirsiniz.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setBarcodeActive(true);
      window.setTimeout(async () => {
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new BarcodeDetectorCtor({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code'] });
        const scan = async () => {
          if (!videoRef.current || !streamRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes?.length > 0) {
              const value = String(codes[0].rawValue || '').trim();
              if (value) {
                setProductSearch(value);
                setActiveTab('products');
                stopBarcodeScanner();
                toast.success(`Okutuldu: ${value}`);
                return;
              }
            }
          } catch {
            // Continue scanning while camera is open.
          }
          requestAnimationFrame(scan);
        };
        requestAnimationFrame(scan);
      }, 100);
    } catch {
      toast.error('Kamera acilamadi.');
      stopBarcodeScanner();
    }
  };

  return {
    // router
    router,
    // refs (video / kamera stream)
    videoRef,
    streamRef,
    // genel modlar / durum
    activeTab,
    setActiveTab,
    safeMode,
    setSafeMode,
    priceType,
    setPriceType,
    isOnline,
    // cari
    selectedCustomer,
    setSelectedCustomer,
    customerSearch,
    setCustomerSearch,
    customers,
    customerLoading,
    snapshot,
    snapshotLoading,
    // urun
    productSearch,
    setProductSearch,
    productMode,
    setProductMode,
    products,
    productsLoading,
    selectedProduct,
    setSelectedProduct,
    productQuantities,
    setProductQuantities,
    // taslak
    draft,
    draftCustomer,
    quoteNote,
    setQuoteNote,
    validityDate,
    setValidityDate,
    orderWarehouse,
    setOrderWarehouse,
    orderSeries,
    setOrderSeries,
    submitting,
    draftTotal,
    customerIdForApi,
    // ziyaret notu
    visitNote,
    setVisitNote,
    visitDemand,
    setVisitDemand,
    competitorInfo,
    setCompetitorInfo,
    photoUrl,
    setPhotoUrl,
    location,
    setLocation,
    noteSaving,
    // yeni ziyaret carisi
    newVisitOpen,
    setNewVisitOpen,
    newVisitName,
    setNewVisitName,
    newVisitPhone,
    setNewVisitPhone,
    newVisitNote,
    setNewVisitNote,
    newVisitDemand,
    setNewVisitDemand,
    newVisitCompetitorInfo,
    setNewVisitCompetitorInfo,
    newVisitPhotoUrl,
    setNewVisitPhotoUrl,
    newVisitLocation,
    setNewVisitLocation,
    newVisitSaving,
    duplicateCandidates,
    setDuplicateCandidates,
    // gecmis
    recentCustomers,
    recentProducts,
    barcodeActive,
    // handler / aksiyonlar
    searchCustomers,
    loadCustomerSnapshot,
    searchProducts,
    openProductDetail,
    resolveProductForDraft,
    addToDraft,
    updateDraftItem,
    removeDraftItem,
    clearDraft,
    ensureDraftCustomerMatches,
    createQuote,
    createOrder,
    shareProduct,
    shareDraft,
    saveVisitNote,
    saveNewVisitCustomer,
    selectExistingDuplicate,
    pickPhoto,
    captureLocation,
    captureNewVisitLocation,
    stopBarcodeScanner,
    startBarcodeScanner,
  };
}

export default useSahaSatis;
