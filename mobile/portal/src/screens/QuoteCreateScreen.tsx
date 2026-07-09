import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { adminApi } from '../api/admin';
import { StockFamilySuggestion, StockFamilyRecommendation } from '../components/StockFamilySuggestion';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { Customer, CustomerContact, Product, LastSale, Quote, QuoteItem } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { normalizeSearchText } from '../utils/search';

const buildDefaultValidityDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
};

type QuoteItemForm = {
  id: string;
  productId?: string;
  productName: string;
  productCode: string;
  unit?: string | null;
  unit2?: string | null;
  unit2Factor?: number | null;
  vatRate?: number | null;
  warehouseStocks?: Record<string, number>;
  quantity: number;
  priceSource: 'PRICE_LIST' | 'MANUAL' | 'LAST_SALE';
  priceListNo?: number;
  unitPrice: number;
  priceType: 'INVOICED' | 'WHITE';
  mikroPriceLists?: Record<string, number>;
  lastSales?: LastSale[];
  selectedSaleIndex?: number;
  lastSale?: LastSale;
  vatZeroed?: boolean;
  manualVatRate?: number;
  isManualLine?: boolean;
  lineDescription?: string;
  manualPriceInput?: string;
  manualMarginEntry?: number;
  manualMarginCost?: number;
  lastEntryPrice?: number | null;
  currentCost?: number | null;
  lastEntryDate?: string | null;
};

type PoolSortOption = 'default' | 'stock1_desc' | 'stock6_desc' | 'price_asc' | 'price_desc';

type FamilyActionConfirm = {
  mode: 'swap' | 'split';
  item: QuoteItemForm;
  recommendation: StockFamilyRecommendation;
  alternateProduct: Product;
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

const POOL_SORT_OPTIONS: Array<{ value: PoolSortOption; label: string }> = [
  { value: 'default', label: 'Varsayilan' },
  { value: 'stock1_desc', label: 'Merkez Stok' },
  { value: 'stock6_desc', label: 'Topca Stok' },
  { value: 'price_asc', label: 'Fiyat Dusuk' },
  { value: 'price_desc', label: 'Fiyat Yuksek' },
];
const CUSTOMER_SEARCH_PAGE_SIZE = 40;

const PUBLIC_BASE_URL = String(
  process.env.EXPO_PUBLIC_WEB_BASE_URL ||
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    'https://www.bakircilarkampanya.com'
)
  .replace(/\/api\/?$/, '')
  .replace(/\/$/, '');

const resolvePublicUrl = (value?: string | null) => {
  const url = String(value || '').trim();
  if (!url) return null;
  if (/^(https?:|data:)/i.test(url)) return url;
  return `${PUBLIC_BASE_URL}${url.startsWith('/') ? url : `/${url}`}`;
};

const formatCurrency = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatStockValue = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return value.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
};

const normalizeUnit = (value?: string | null) => {
  if (!value) return '';
  return value.trim().toUpperCase();
};

const getUnitConversionLabel = (
  unit?: string | null,
  unit2?: string | null,
  unit2Factor?: number | null
) => {
  if (!unit || !unit2) return null;
  const factor = Number(unit2Factor);
  if (!Number.isFinite(factor) || factor === 0) return null;
  const absFactor = Math.abs(factor);
  if (absFactor === 0) return null;

  const normalizedUnit = normalizeUnit(unit);
  const normalizedUnit2 = normalizeUnit(unit2);
  const isKoli = normalizedUnit.includes('KOLI') || normalizedUnit2.includes('KOLI');
  const primaryUnit = factor > 0 ? unit : unit2;
  const secondaryUnit = factor > 0 ? unit2 : unit;

  if (isKoli) {
    const targetUnit = normalizedUnit.includes('KOLI') ? unit2 : unit;
    return `Koli ici: ${absFactor.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${targetUnit}`;
  }

  return `Birim orani: 1 ${primaryUnit} = ${absFactor.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${secondaryUnit}`;
};

const getStockNumber = (product: Product, warehouse: '1' | '6') => {
  const value = product.warehouseStocks?.[warehouse];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getProductSortPrice = (product: Product) => {
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

const getPriceListShortCode = (listNo: number) => {
  if (listNo >= 1 && listNo <= 5) return `P${listNo}`;
  if (listNo >= 6 && listNo <= 10) return `F${listNo - 5}`;
  return `L${listNo}`;
};

const formatDateShort = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const normalizeSearchKey = (value?: string | null) =>
  normalizeSearchText(value || '');

const getApiErrorMessage = (err: any, fallback: string) => {
  const candidate = err?.response?.data?.error || err?.response?.data?.message || err?.message;
  if (typeof candidate === 'string') return candidate;
  if (candidate && typeof candidate === 'object') return candidate.message || candidate.code || fallback;
  return fallback;
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

const formatPercent = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(1)}%`;
};

const getMarginPercent = (unitPrice?: number | null, cost?: number | null) => {
  if (!Number.isFinite(unitPrice as number) || !Number.isFinite(cost as number)) return null;
  const price = Number(unitPrice);
  const base = Number(cost);
  if (base <= 0) return null;
  return ((price / base) - 1) * 100;
};

export function QuoteCreateScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const route = useRoute() as {
    params?: {
      quoteId?: string;
      customerIdOrCode?: string;
      productCode?: string;
      productName?: string;
      productPrefills?: Array<{
        productCode: string;
        productName?: string;
        quantity?: number;
        unitPrice?: number;
        priceType?: 'INVOICED' | 'WHITE';
      }>;
      autoAddProduct?: boolean;
    };
  };
  const routeParams = route.params || {};
  const editQuoteId = routeParams.quoteId;
  const isEditMode = Boolean(editQuoteId);
  const prefillCustomerKey = String(routeParams.customerIdOrCode || '').trim();
  const prefillProductCode = String(routeParams.productCode || '').trim();
  const prefillProductName = String(routeParams.productName || '').trim();
  const productPrefills = Array.isArray(routeParams.productPrefills) ? routeParams.productPrefills : [];
  const productPrefillKey = productPrefills
    .map((item) => `${item.productCode}:${item.quantity || 1}:${item.unitPrice || ''}:${item.priceType || ''}`)
    .join('|');
  const prefillProductTerm = prefillProductCode || prefillProductName;
  const shouldAutoAddPrefillProduct = routeParams.autoAddProduct === true;
  const customerPrefillDoneRef = useRef(false);
  const productPrefillDoneRef = useRef(false);
  const productPrefillsDoneRef = useRef(false);
  const autoAddDoneRef = useRef(false);
  const customerLocked = isEditMode;
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState(isEditMode ? '' : prefillCustomerKey);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerLoadError, setCustomerLoadError] = useState<string | null>(null);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingMoreCustomers, setLoadingMoreCustomers] = useState(false);
  const [customerPagination, setCustomerPagination] = useState<{ total: number; page: number; pageSize: number; totalPages: number } | null>(null);
  const [hasMoreCustomers, setHasMoreCustomers] = useState(false);
  const customerRequestSeqRef = useRef(0);
  const [poolPriceListNo, setPoolPriceListNo] = useState(1);
  const [poolSort, setPoolSort] = useState<PoolSortOption>('default');
  const [lastSalesCount, setLastSalesCount] = useState(1);
  const [poolSettingsOpen, setPoolSettingsOpen] = useState(true);
  const [savingPool, setSavingPool] = useState(false);

  const [productTab, setProductTab] = useState<'purchased' | 'search'>('purchased');
  const [purchasedProducts, setPurchasedProducts] = useState<Product[]>([]);
  const [purchasedSearch, setPurchasedSearch] = useState('');
  const [loadingPurchased, setLoadingPurchased] = useState(false);
  const [purchasedError, setPurchasedError] = useState<string | null>(null);
  const [selectedPurchasedCodes, setSelectedPurchasedCodes] = useState<Set<string>>(new Set());
  const [selectedSearchCodes, setSelectedSearchCodes] = useState<Set<string>>(new Set());

  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [productSearchError, setProductSearchError] = useState<string | null>(null);

  const [quoteItems, setQuoteItems] = useState<QuoteItemForm[]>([]);
  const [suppressedFamilyLines, setSuppressedFamilyLines] = useState<Record<string, string>>({});
  const [familyActionConfirm, setFamilyActionConfirm] = useState<FamilyActionConfirm | null>(null);
  const [familyActionLoadingId, setFamilyActionLoadingId] = useState<string | null>(null);
  const [complementRecommendations, setComplementRecommendations] = useState<Product[]>([]);
  const [loadingComplementRecommendations, setLoadingComplementRecommendations] = useState(false);
  const [validityDate, setValidityDate] = useState(buildDefaultValidityDate());
  const [note, setNote] = useState('');
  const [documentNo, setDocumentNo] = useState('');
  const [responsibleCode, setResponsibleCode] = useState('');
  const [responsibles, setResponsibles] = useState<Array<{ code: string; name: string; surname: string }>>([]);
  const [includedWarehouses, setIncludedWarehouses] = useState<string[]>([]);
  const [customerContacts, setCustomerContacts] = useState<CustomerContact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [contactsLoading, setContactsLoading] = useState(false);
  const [vatZeroed, setVatZeroed] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const savingPoolRef = useRef(false);

  const priceListOptions = Array.from({ length: 10 }, (_, index) => index + 1);

  const loadCustomers = async (append = false, searchOverride?: string) => {
    if (customerLocked) return;
    const requestSeq = ++customerRequestSeqRef.current;
    if (append) {
      setLoadingMoreCustomers(true);
    } else {
      setLoadingCustomers(true);
    }
    setCustomerLoadError(null);
    try {
      const nextPage = append
        ? (customerPagination?.page || Math.max(1, Math.ceil(customers.length / CUSTOMER_SEARCH_PAGE_SIZE))) + 1
        : 1;
      const response = await adminApi.getCustomers({
        search: (searchOverride ?? customerSearch).trim() || undefined,
        page: nextPage,
        pageSize: CUSTOMER_SEARCH_PAGE_SIZE,
      });
      if (requestSeq !== customerRequestSeqRef.current) return;
      const nextCustomers = response.customers || [];
      const nextPagination = response.pagination || {
        total: nextCustomers.length,
        page: nextPage,
        pageSize: CUSTOMER_SEARCH_PAGE_SIZE,
        totalPages: nextCustomers.length >= CUSTOMER_SEARCH_PAGE_SIZE ? nextPage + 1 : nextPage,
      };
      setCustomerPagination(nextPagination);
      setHasMoreCustomers(response.pagination ? nextPagination.page < nextPagination.totalPages : nextCustomers.length >= CUSTOMER_SEARCH_PAGE_SIZE);
      setCustomers((current) => {
        if (!append) return nextCustomers;
        const byId = new Map<string, Customer>();
        current.forEach((customer) => byId.set(customer.id, customer));
        nextCustomers.forEach((customer) => byId.set(customer.id, customer));
        return Array.from(byId.values());
      });
    } catch (err: any) {
      if (requestSeq !== customerRequestSeqRef.current) return;
      setCustomerLoadError(getApiErrorMessage(err, 'Cariler yuklenemedi.'));
    } finally {
      if (requestSeq === customerRequestSeqRef.current) {
        setLoadingCustomers(false);
        setLoadingMoreCustomers(false);
      }
    }
  };

  useEffect(() => {
    if (customerLocked) return;
    const timer = setTimeout(() => {
      loadCustomers(false, customerSearch);
    }, 250);
    return () => clearTimeout(timer);
  }, [customerLocked, customerSearch]);

  useEffect(() => {
    if (!editQuoteId) return;
    let active = true;
    setLoadingEdit(true);
    const loadQuote = async () => {
      try {
        const response = await adminApi.getQuoteById(editQuoteId);
        if (!active) return;
        const quote = response.quote;
        setEditingQuote(quote);
        if (quote.customer) {
          setSelectedCustomer(quote.customer as Customer);
          setCustomerSearch(quote.customer.name || quote.customer.mikroCariCode || '');
        }
        if (quote.validityDate) {
          setValidityDate(quote.validityDate.slice(0, 10));
        }
        setNote(quote.note || '');
        setDocumentNo(quote.documentNo || '');
        setResponsibleCode(quote.responsibleCode || '');
        setSelectedContactId(quote.contactId || '');
        setVatZeroed(Boolean(quote.vatZeroed));
        if (quote.items && quote.items.length > 0) {
          setQuoteItems(quote.items.map(buildQuoteItemFromExisting));
        }
      } catch (err) {
        if (active) {
          Alert.alert('Hata', getApiErrorMessage(err, 'Teklif yuklenemedi.'));
        }
      } finally {
        if (active) {
          setLoadingEdit(false);
        }
      }
    };
    loadQuote();
    return () => {
      active = false;
    };
  }, [editQuoteId]);

  useEffect(() => {
    if (!editingQuote?.customer?.id || customers.length === 0) return;
    const matched = customers.find((customer) => customer.id === editingQuote.customer?.id);
    if (matched && matched.id !== selectedCustomer?.id) {
      setSelectedCustomer(matched);
    }
  }, [customers, editingQuote?.customer?.id, selectedCustomer?.id]);

  useEffect(() => {
    if (isEditMode || customerPrefillDoneRef.current || !prefillCustomerKey || customers.length === 0) return;
    const requested = normalizeSearchKey(prefillCustomerKey);
    const matched = customers.find((customer) => {
      const keys = [
        customer.id,
        customer.mikroCariCode,
        customer.email,
        customer.name,
      ].map(normalizeSearchKey);
      return keys.some((key) => key === requested || key.includes(requested));
    });

    if (matched) {
      setSelectedCustomer(matched);
      setCustomerSearch(matched.name || matched.mikroCariCode || prefillCustomerKey);
    } else {
      setCustomerSearch(prefillCustomerKey);
    }
    customerPrefillDoneRef.current = true;
  }, [customers, isEditMode, prefillCustomerKey]);

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const response = await adminApi.getQuotePreferences();
        if (response.preferences.poolPriceListNo) {
          setPoolPriceListNo(response.preferences.poolPriceListNo);
        }
        if (response.preferences.poolSort) {
          setPoolSort(response.preferences.poolSort as PoolSortOption);
        }
        if (response.preferences.lastSalesCount) {
          const parsed = Number(response.preferences.lastSalesCount);
          if (Number.isFinite(parsed)) {
            setLastSalesCount(Math.min(10, Math.max(1, Math.round(parsed))));
          }
        }
        if (response.preferences.responsibleCode) {
          setResponsibleCode(response.preferences.responsibleCode);
        }
      } catch {
        // Tercihler opsiyonel; teklif girisi varsayilan ayarlarla devam eder.
      }
    };
    loadPreferences();
  }, []);

  useEffect(() => {
    let active = true;
    Promise.allSettled([adminApi.getSettings(), adminApi.getQuoteResponsibles()]).then(([settingsResult, responsibleResult]) => {
      if (!active) return;
      if (settingsResult.status === 'fulfilled') {
        setIncludedWarehouses(settingsResult.value.includedWarehouses || []);
      }
      if (responsibleResult.status === 'fulfilled') {
        setResponsibles(responsibleResult.value.responsibles || []);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!selectedCustomer?.id) {
      setCustomerContacts([]);
      setSelectedContactId('');
      return () => {
        active = false;
      };
    }

    setContactsLoading(true);
    adminApi
      .getCustomerContacts(selectedCustomer.id)
      .then((response) => {
        if (!active) return;
        const contacts = response.contacts || [];
        setCustomerContacts(contacts);
        setSelectedContactId((current) => {
          if (current && contacts.some((contact) => contact.id === current)) return current;
          return contacts[0]?.id || '';
        });
      })
      .catch(() => {
        if (!active) return;
        setCustomerContacts([]);
        setSelectedContactId('');
      })
      .finally(() => {
        if (active) setContactsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedCustomer?.id]);

  useEffect(() => {
    setSelectedPurchasedCodes(new Set());
    if (!prefillProductTerm) {
      setSelectedSearchCodes(new Set());
    }
    setPurchasedSearch('');
    if (selectedCustomer && !prefillProductTerm) {
      setProductTab('purchased');
    }
  }, [prefillProductTerm, selectedCustomer?.id]);

  useEffect(() => {
    if (isEditMode || productPrefillDoneRef.current || !prefillProductTerm) return;
    setProductTab('search');
    setProductSearch(prefillProductTerm);
    if (prefillProductCode) {
      setSelectedSearchCodes(new Set([prefillProductCode]));
    }
    productPrefillDoneRef.current = true;
  }, [isEditMode, prefillProductCode, prefillProductTerm]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!selectedCustomer) {
        setPurchasedProducts([]);
        setLoadingPurchased(false);
        return;
      }
      setLoadingPurchased(true);
      setPurchasedError(null);
      try {
        const response = await adminApi.getCustomerPurchasedProducts(
          selectedCustomer.id,
          lastSalesCount
        );
        if (active) {
          setPurchasedProducts(response.products || []);
        }
      } catch (err) {
        if (active) {
          setPurchasedProducts([]);
          setPurchasedError(getApiErrorMessage(err, 'Daha once alinan urunler yuklenemedi.'));
        }
      } finally {
        if (active) {
          setLoadingPurchased(false);
        }
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [selectedCustomer?.id, lastSalesCount]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (productTab !== 'search') {
        setSearchingProducts(false);
        setProductSearchError(null);
        return;
      }
      const term = productSearch.trim();
      if (!term) {
        setSearchResults([]);
        setSearchingProducts(false);
        setProductSearchError(null);
        return;
      }
      setSearchingProducts(true);
      setProductSearchError(null);
      try {
        const response = await adminApi.getProducts({ search: term, page: 1, limit: 20 });
        if (active) {
          setSearchResults(response.products || []);
        }
      } catch (err: any) {
        if (active) {
          setSearchResults([]);
          setProductSearchError(getApiErrorMessage(err, 'Urun aramasi yapilamadi.'));
        }
      } finally {
        if (active) {
          setSearchingProducts(false);
        }
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [productSearch, productTab]);

  const filteredPurchasedProducts = useMemo(() => {
    const term = normalizeSearchKey(purchasedSearch);
    if (!term) return purchasedProducts;
    return purchasedProducts.filter((product) => {
      const haystack = normalizeSearchKey(`${product.mikroCode || ''} ${product.name || ''}`);
      return haystack.includes(term);
    });
  }, [purchasedProducts, purchasedSearch]);

  const filteredSearchResults = useMemo(() => {
    const term = normalizeSearchKey(productSearch);
    if (!term) return searchResults;
    return searchResults.filter((product) => {
      const haystack = normalizeSearchKey(`${product.mikroCode || ''} ${product.name || ''}`);
      return haystack.includes(term);
    });
  }, [searchResults, productSearch]);

  const sortPoolProducts = (items: Product[]) => {
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

  const quoteProductCodes = useMemo(() => {
    const unique = new Set<string>();
    quoteItems.forEach((item) => {
      const code = item.productCode?.trim();
      if (code) unique.add(code);
    });
    return Array.from(unique);
  }, [quoteItems]);

  const normalizeFamilyCode = (value?: string | null) => String(value || '').trim().toUpperCase();
  const familyExcludeCodesByLine = useMemo(() => {
    const result: Record<string, string[]> = {};
    quoteItems.forEach((item) => {
      if (item.isManualLine || !item.productCode) return;
      const ownCode = normalizeFamilyCode(item.productCode);
      result[item.id] = quoteProductCodes.filter((code) => normalizeFamilyCode(code) !== ownCode);
    });
    return result;
  }, [quoteItems, quoteProductCodes]);

  const isFamilySuggestionSuppressed = (item: QuoteItemForm) =>
    normalizeFamilyCode(suppressedFamilyLines[item.id]) === normalizeFamilyCode(item.productCode);

  useEffect(() => {
    if (quoteProductCodes.length === 0) {
      setComplementRecommendations([]);
      return;
    }

    let active = true;
    setLoadingComplementRecommendations(true);
    adminApi
      .getComplementRecommendations({
        productCodes: quoteProductCodes,
        excludeCodes: quoteProductCodes,
        limit: 20,
      })
      .then((response) => {
        if (!active) return;
        setComplementRecommendations((response?.products || []) as Product[]);
      })
      .catch(() => {
        if (!active) return;
        setComplementRecommendations([]);
      })
      .finally(() => {
        if (!active) return;
        setLoadingComplementRecommendations(false);
      });

    return () => {
      active = false;
    };
  }, [quoteProductCodes.join('|')]);

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
      Alert.alert('Bilgi', 'Secili urun yok.');
      return;
    }
    const selected = purchasedProducts.filter((product) =>
      selectedPurchasedCodes.has(product.mikroCode)
    );
    addProductsToQuote(selected);
    setSelectedPurchasedCodes(new Set());
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
      Alert.alert('Bilgi', 'Secili urun yok.');
      return;
    }
    const selected = searchResults.filter((product) =>
      selectedSearchCodes.has(product.mikroCode)
    );
    addProductsToQuote(selected);
    setSelectedSearchCodes(new Set());
  };

  const buildQuoteItem = (product: Product): QuoteItemForm => {
    const listNo = poolPriceListNo || 1;
    const listPrice = getMikroListPrice(product.mikroPriceLists || {}, listNo);
    return {
      id: `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      productId: product.id,
      productName: product.name,
      productCode: product.mikroCode,
      unit: product.unit,
      unit2: product.unit2,
      unit2Factor: product.unit2Factor,
      vatRate: product.vatRate,
      warehouseStocks: product.warehouseStocks,
      quantity: 1,
      priceSource: 'PRICE_LIST',
      priceListNo: listNo,
      unitPrice: listPrice || 0,
      priceType: 'INVOICED',
      mikroPriceLists: product.mikroPriceLists || {},
      lastSales: product.lastSales || [],
      selectedSaleIndex: undefined,
      vatZeroed: false,
      lineDescription: '',
      manualMarginEntry: undefined,
      manualMarginCost: undefined,
      lastEntryPrice: product.lastEntryPrice ?? null,
      currentCost: product.currentCost ?? null,
      lastEntryDate: product.lastEntryDate ?? null,
    };
  };

  const buildQuoteItemFromExisting = (item: QuoteItem, index: number): QuoteItemForm => {
    const priceSource = item.priceSource || (item.priceListNo ? 'PRICE_LIST' : 'MANUAL');
    const listNo = item.priceListNo ?? poolPriceListNo ?? 1;
    return {
      id: item.id || `edit-${index}-${Date.now()}`,
      productId: item.productId || '',
      productName: item.productName,
      productCode: item.productCode || '',
      unit: item.unit || 'ADET',
      unit2: item.unit2 || null,
      unit2Factor: item.unit2Factor ?? null,
      vatRate: item.vatRate ?? null,
      warehouseStocks: item.warehouseStocks || {},
      quantity: item.quantity || 1,
      priceSource,
      priceListNo: priceSource === 'PRICE_LIST' ? listNo : undefined,
      unitPrice: item.unitPrice || 0,
      priceType: item.priceType || 'INVOICED',
      mikroPriceLists: item.mikroPriceLists || {},
      lastSales: item.lastSales || [],
      selectedSaleIndex: priceSource === 'LAST_SALE' ? 0 : undefined,
      vatZeroed: item.vatZeroed || false,
      manualVatRate: item.manualVatRate ?? undefined,
      isManualLine: item.isManualLine || false,
      lineDescription: item.lineDescription || '',
      manualPriceInput: item.unitPrice ? item.unitPrice.toFixed(2) : '',
      manualMarginEntry: undefined,
      manualMarginCost: undefined,
      lastEntryPrice: item.lastEntryPrice ?? null,
      currentCost: item.currentCost ?? null,
      lastEntryDate: item.lastEntryDate ?? null,
    };
  };

  const addProductsToQuote = (productsToAdd: Product[]) => {
    const validProducts = productsToAdd.filter((product) => product?.mikroCode);
    if (validProducts.length === 0) {
      Alert.alert('Bilgi', 'Urun bulunamadi.');
      return;
    }
    setQuoteItems((prev) => [...prev, ...validProducts.map(buildQuoteItem)]);
  };

  const addProduct = (product: Product) => {
    addProductsToQuote([product]);
  };

  const addComplementProduct = (product: Product) => {
    addProductsToQuote([product]);
  };

  useEffect(() => {
    if (isEditMode || productPrefillsDoneRef.current || productPrefills.length === 0) return;
    const codes = Array.from(new Set(productPrefills.map((item) => String(item.productCode || '').trim()).filter(Boolean)));
    if (codes.length === 0) return;

    let active = true;
    const run = async () => {
      try {
        const response = await adminApi.getProductsByCodes(codes);
        if (!active) return;
        const products = response.products || [];
        const byCode = new Map(products.map((product: any) => [normalizeSearchKey(product.mikroCode || product.productCode), product as Product]));
        const nextItems: QuoteItemForm[] = [];
        productPrefills.forEach((prefill) => {
          const code = String(prefill.productCode || '').trim();
          const product = byCode.get(normalizeSearchKey(code));
          if (!product) return;
          const item = buildQuoteItem(product);
          const quantity = Number(prefill.quantity);
          item.quantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
          const unitPrice = Number(prefill.unitPrice);
          if (Number.isFinite(unitPrice) && unitPrice > 0) {
            item.unitPrice = unitPrice;
            item.priceSource = 'MANUAL';
            item.priceListNo = undefined;
            item.manualPriceInput = unitPrice.toFixed(2);
          }
          if (prefill.priceType === 'WHITE') {
            item.priceType = 'WHITE';
          } else if (prefill.priceType === 'INVOICED') {
            item.priceType = 'INVOICED';
          }
          nextItems.push(item);
        });
        if (nextItems.length > 0) {
          setQuoteItems((prev) => {
            const existing = new Set(prev.map((item) => normalizeSearchKey(item.productCode)));
            return [...prev, ...nextItems.filter((item) => !existing.has(normalizeSearchKey(item.productCode)))];
          });
        }
        productPrefillsDoneRef.current = true;
      } catch {
        productPrefillsDoneRef.current = true;
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [isEditMode, productPrefillKey]);

  useEffect(() => {
    if (
      isEditMode ||
      !shouldAutoAddPrefillProduct ||
      autoAddDoneRef.current ||
      !prefillProductCode ||
      searchResults.length === 0
    ) {
      return;
    }

    const requestedCode = normalizeSearchKey(prefillProductCode);
    const matched = searchResults.find(
      (product) => normalizeSearchKey(product.mikroCode) === requestedCode
    );

    if (!matched) return;

    const alreadyAdded = quoteItems.some(
      (item) => normalizeSearchKey(item.productCode) === requestedCode
    );
    if (!alreadyAdded) {
      addProductsToQuote([matched]);
    }
    setSelectedSearchCodes(new Set());
    autoAddDoneRef.current = true;
  }, [
    isEditMode,
    prefillProductCode,
    quoteItems,
    searchResults,
    shouldAutoAddPrefillProduct,
  ]);

  const addManualLine = () => {
    const entry: QuoteItemForm = {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      productId: '',
      productName: '',
      productCode: 'B101071',
      unit: 'ADET',
      quantity: 1,
      priceSource: 'MANUAL',
      unitPrice: 0,
      priceType: 'INVOICED',
      mikroPriceLists: {},
      lastSales: [],
      selectedSaleIndex: undefined,
      vatZeroed: false,
      manualVatRate: 0.2,
      isManualLine: true,
      lineDescription: '',
      manualPriceInput: '',
      manualMarginEntry: undefined,
      manualMarginCost: undefined,
      lastEntryPrice: null,
      currentCost: null,
    };
    setQuoteItems((prev) => [...prev, entry]);
  };

  const savePoolView = async () => {
    if (savingPoolRef.current) return;
    savingPoolRef.current = true;
    setSavingPool(true);
    try {
      await adminApi.updateQuotePreferences({
        poolPriceListNo,
        poolSort,
        lastSalesCount,
      });
      Alert.alert('Basarili', 'Gorunus kaydedildi.');
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Gorunus kaydedilemedi.'));
    } finally {
      savingPoolRef.current = false;
      setSavingPool(false);
    }
  };

  const updateItem = (id: string, updates: Partial<QuoteItemForm>) => {
    setQuoteItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...updates };
        if (updates.priceListNo && next.priceSource === 'PRICE_LIST') {
          const price = getMikroListPrice(next.mikroPriceLists, updates.priceListNo);
          next.unitPrice = price || 0;
        }
        return next;
      })
    );
  };

  const handlePriceSourceChange = (item: QuoteItemForm, value: QuoteItemForm['priceSource']) => {
    if (!value) return;
    if (value === 'PRICE_LIST') {
      const listNo = item.priceListNo || poolPriceListNo || 1;
      const price = getMikroListPrice(item.mikroPriceLists, listNo);
      updateItem(item.id, {
        priceSource: value,
        priceListNo: listNo,
        unitPrice: price || 0,
        selectedSaleIndex: undefined,
        lastSale: undefined,
        manualPriceInput: undefined,
        manualMarginEntry: undefined,
        manualMarginCost: undefined,
      });
      return;
    }
    if (value === 'LAST_SALE') {
      updateItem(item.id, {
        priceSource: value,
        priceListNo: undefined,
        unitPrice: 0,
        selectedSaleIndex: undefined,
        lastSale: undefined,
        manualPriceInput: undefined,
        manualMarginEntry: undefined,
        manualMarginCost: undefined,
      });
      return;
    }
    updateItem(item.id, {
      priceSource: value,
      priceListNo: undefined,
      unitPrice: item.unitPrice || 0,
      selectedSaleIndex: undefined,
      lastSale: undefined,
      manualMarginEntry: undefined,
      manualMarginCost: undefined,
    });
  };

  const handlePriceListChange = (item: QuoteItemForm, value: number) => {
    const listPrice = getMikroListPrice(item.mikroPriceLists, value);
    updateItem(item.id, {
      priceListNo: value,
      unitPrice: listPrice || 0,
    });
  };

  const handleLastSaleChange = (item: QuoteItemForm, index: number) => {
    const sale = item.lastSales?.[index];
    updateItem(item.id, {
      selectedSaleIndex: index,
      unitPrice: sale?.unitPrice || 0,
      lastSale: sale,
      vatZeroed: sale?.vatZeroed || false,
      manualPriceInput: undefined,
      manualMarginEntry: undefined,
      manualMarginCost: undefined,
    });
  };

  const handleManualPriceChange = (item: QuoteItemForm, value: string) => {
    const trimmed = value.trim();
    const parsed = trimmed.length > 0 ? parseDecimalInput(trimmed).value : undefined;
    const nextPrice = trimmed.length === 0 ? 0 : parsed || 0;
    updateItem(item.id, {
      unitPrice: nextPrice,
      manualPriceInput: value,
      manualMarginEntry: undefined,
      manualMarginCost: undefined,
    });
  };

  const handleManualVatChange = (item: QuoteItemForm, value: number) => {
    const code = value === 0.01 ? 'B110365' : value === 0.1 ? 'B101070' : 'B101071';
    updateItem(item.id, { manualVatRate: value, productCode: code });
  };

  const handleManualMarginChange = (item: QuoteItemForm, source: 'entry' | 'cost', value: string) => {
    const parsed = value.trim().length > 0 ? parseDecimalInput(value).value : undefined;
    const margin = Number.isFinite(parsed as number) ? (parsed as number) : undefined;
    const base = source === 'entry' ? Number(item.lastEntryPrice || 0) : Number(item.currentCost || 0);
    const nextPrice = base > 0 && margin !== undefined ? base * (1 + margin / 100) : undefined;

    updateItem(item.id, {
      unitPrice: nextPrice ?? item.unitPrice,
      manualPriceInput: undefined,
      manualMarginEntry: source === 'entry' ? margin : undefined,
      manualMarginCost: source === 'cost' ? margin : undefined,
    });
  };

  const removeItem = (id: string) => {
    setQuoteItems((prev) => prev.filter((item) => item.id !== id));
  };

  const requestFamilyAction = async (
    mode: 'swap' | 'split',
    item: QuoteItemForm,
    recommendation: StockFamilyRecommendation
  ) => {
    if (familyActionLoadingId) return;
    if (mode === 'split' && Number(recommendation.fromAlt || 0) <= 0) {
      Alert.alert('Aile onerisi', 'Aktarilacak miktar yok.');
      return;
    }
    setFamilyActionLoadingId(item.id);
    try {
      const response = await adminApi.getProductsByCodes([recommendation.productCode]);
      const alternateProduct = response.products?.[0] as Product | undefined;
      if (!alternateProduct) {
        Alert.alert('Aile onerisi', 'Onerilen urun bilgisi bulunamadi.');
        return;
      }
      setFamilyActionConfirm({ mode, item, recommendation, alternateProduct });
    } catch (err: any) {
      Alert.alert('Aile onerisi', getApiErrorMessage(err, 'Onerilen urun bilgisi alinamadi.'));
    } finally {
      setFamilyActionLoadingId(null);
    }
  };

  const carryFamilyLineSettings = (source: QuoteItemForm, target: QuoteItemForm): QuoteItemForm => {
    const hasPrice = Number.isFinite(source.unitPrice) && source.unitPrice > 0;
    return {
      ...target,
      unitPrice: hasPrice ? source.unitPrice : target.unitPrice,
      priceSource: hasPrice ? 'MANUAL' : target.priceSource,
      priceListNo: hasPrice ? undefined : target.priceListNo,
      manualPriceInput: hasPrice ? source.unitPrice.toFixed(2) : target.manualPriceInput,
      selectedSaleIndex: undefined,
      lastSale: undefined,
      priceType: source.priceType,
      vatZeroed: source.vatZeroed,
      lineDescription: source.lineDescription,
    };
  };

  const confirmFamilyAction = () => {
    if (!familyActionConfirm) return;
    const { mode, item, recommendation, alternateProduct } = familyActionConfirm;
    setFamilyActionConfirm(null);

    if (mode === 'swap') {
      const replacement = carryFamilyLineSettings(item, buildQuoteItem(alternateProduct));
      replacement.id = item.id;
      replacement.quantity = item.quantity;
      setQuoteItems((current) => current.map((line) => (line.id === item.id ? replacement : line)));
      setSuppressedFamilyLines((current) => ({
        ...current,
        [item.id]: alternateProduct.mikroCode,
      }));
      return;
    }

    const movedQuantity = Math.max(0, Number(recommendation.fromAlt || 0));
    const keptQuantity = Math.max(0, Number(recommendation.fromEntered || 0));
    const alternateLine = carryFamilyLineSettings(item, buildQuoteItem(alternateProduct));
    alternateLine.quantity = movedQuantity;
    setQuoteItems((current) => {
      const next: QuoteItemForm[] = [];
      current.forEach((line) => {
        if (line.id !== item.id) {
          next.push(line);
          return;
        }
        if (keptQuantity > 0) next.push({ ...line, quantity: keptQuantity });
        next.push(alternateLine);
      });
      return next;
    });
    setSuppressedFamilyLines((current) => ({
      ...current,
      [item.id]: item.productCode,
      [alternateLine.id]: alternateProduct.mikroCode,
    }));
  };

  const familyActionInfo = useMemo(() => {
    if (!familyActionConfirm) return null;
    const { mode, item, recommendation, alternateProduct } = familyActionConfirm;
    const movedQuantity = mode === 'swap' ? item.quantity : Number(recommendation.fromAlt || 0);
    const keptQuantity = mode === 'split' ? Number(recommendation.fromEntered || 0) : 0;
    return {
      mode,
      item,
      alternateProduct,
      movedQuantity,
      keptQuantity,
      currentMargin: getMarginPercent(item.unitPrice, item.currentCost),
      currentEntryMargin: getMarginPercent(item.unitPrice, item.lastEntryPrice),
      targetMargin: getMarginPercent(item.unitPrice, alternateProduct.currentCost),
      targetEntryMargin: getMarginPercent(item.unitPrice, alternateProduct.lastEntryPrice),
    };
  }, [familyActionConfirm]);

  const handleLastSalesCountChange = (value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      setLastSalesCount(1);
      return;
    }
    const next = Math.min(10, Math.max(1, Math.round(parsed)));
    setLastSalesCount(next);
  };

  const handleCreate = async () => {
    if (savingRef.current) return;
    if (!selectedCustomer) {
      Alert.alert('Eksik Bilgi', 'Cari secin.');
      return;
    }
    if (!validityDate) {
      Alert.alert('Eksik Bilgi', 'Gecerlilik tarihi girin.');
      return;
    }
    if (quoteItems.length === 0) {
      Alert.alert('Eksik Bilgi', 'En az bir urun ekleyin.');
      return;
    }

    const invalidManual = quoteItems.some(
      (item) =>
        item.isManualLine &&
        (!item.productName.trim() || !item.unit || !item.unit.trim())
    );
    if (invalidManual) {
      Alert.alert('Eksik Bilgi', 'Manuel satir adi ve birim girin.');
      return;
    }

    const missingPrice = quoteItems.some((item) => {
      if (item.priceSource === 'PRICE_LIST' && !item.priceListNo) return true;
      if (item.priceSource === 'LAST_SALE' && item.selectedSaleIndex === undefined) return true;
      return item.unitPrice <= 0;
    });
    if (missingPrice) {
      Alert.alert('Eksik Bilgi', 'Fiyat secimi eksik kalem var.');
      return;
    }

    const items = quoteItems.map((item) => {
      const sale =
        item.priceSource === 'LAST_SALE' && item.selectedSaleIndex !== undefined
          ? item.lastSales?.[item.selectedSaleIndex]
          : undefined;

      return {
        productId: item.isManualLine ? undefined : item.productId,
        productCode: item.productCode,
        productName: item.productName,
        unit: item.unit,
        unit2: item.unit2,
        unit2Factor: item.unit2Factor,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        priceSource: item.priceSource,
        priceListNo: item.priceSource === 'PRICE_LIST' ? item.priceListNo : undefined,
        priceType: item.priceType,
        vatZeroed: vatZeroed || item.vatZeroed,
        manualLine: item.isManualLine || false,
        manualVatRate: item.isManualLine ? item.manualVatRate : undefined,
        lineDescription: item.lineDescription || (item.isManualLine ? item.productName : undefined),
        lastSale: sale
          ? {
              saleDate: sale.saleDate,
              unitPrice: sale.unitPrice,
              quantity: sale.quantity,
              vatZeroed: sale.vatZeroed,
            }
          : undefined,
      };
    });

    savingRef.current = true;
    setSaving(true);
    try {
      if (isEditMode && editQuoteId) {
        await adminApi.updateQuote(editQuoteId, {
          customerId: selectedCustomer.id,
          validityDate,
          note: note || undefined,
          documentNo: documentNo || undefined,
          responsibleCode: responsibleCode || undefined,
          contactId: selectedContactId || undefined,
          vatZeroed,
          items,
        });
        Alert.alert('Basarili', 'Teklif guncellendi.');
      } else {
        await adminApi.createQuote({
          customerId: selectedCustomer.id,
          validityDate,
          note: note || undefined,
          documentNo: documentNo || undefined,
          responsibleCode: responsibleCode || undefined,
          contactId: selectedContactId || undefined,
          vatZeroed,
          items,
        });
        Alert.alert('Basarili', 'Teklif olusturuldu.');
      }
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Teklif olusturulamadi.'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const poolPriceLabel = getPoolPriceLabel(poolPriceListNo);
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Geri</Text>
        </TouchableOpacity>

        <View style={styles.hero}>
          <Text style={styles.kicker}>Teklif Operasyonu</Text>
          <Text style={styles.title}>{isEditMode ? 'Teklif Duzenle' : 'Yeni Teklif'}</Text>
          <Text style={styles.subtitle}>
            Cari sec, onceki alimlari kullan, tamamlayici onerileriyle teklif havuzunu hazirla.
          </Text>
          <View style={styles.heroPillRow}>
            <Text style={styles.heroPill}>{quoteItems.length} kalem</Text>
            <Text style={styles.heroPill}>{selectedCustomer ? selectedCustomer.name : 'Cari bekleniyor'}</Text>
          </View>
        </View>
        {loadingEdit && <Text style={styles.helper}>Teklif yukleniyor...</Text>}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cari Secimi</Text>
          {customerLocked && (
            <Text style={styles.helper}>Cari degistirilemez (duzenleme modu).</Text>
          )}
          <TextInput
            style={styles.input}
            placeholder="Cari ara"
            placeholderTextColor={colors.textMuted}
            value={customerSearch}
            onChangeText={setCustomerSearch}
            onSubmitEditing={() => loadCustomers(false, customerSearch)}
            returnKeyType="search"
            editable={!customerLocked}
          />
          {customerLoadError ? <Text style={styles.errorText}>{customerLoadError}</Text> : null}
          <View style={styles.listBlock}>
            {loadingCustomers ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <ScrollView style={styles.listScroll} nestedScrollEnabled>
                {customers.map((customer) => (
                  <TouchableOpacity
                    key={customer.id}
                    style={[
                      styles.listItem,
                      selectedCustomer?.id === customer.id && styles.listItemActive,
                    ]}
                    onPress={() => {
                      if (!customerLocked) {
                        setSelectedCustomer(customer);
                      }
                    }}
                  >
                    <Text style={styles.listItemTitle} numberOfLines={2} ellipsizeMode="tail">
                      {customer.name}
                    </Text>
                    <Text style={styles.listItemMeta} numberOfLines={1} ellipsizeMode="middle">
                      {customer.mikroCariCode || '-'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            {!customerLocked && !loadingCustomers && customers.length === 0 && (
              <Text style={styles.helper}>Cari bulunamadi.</Text>
            )}
            {!customerLocked && loadingMoreCustomers ? (
              <ActivityIndicator color={colors.primary} />
            ) : !customerLocked && hasMoreCustomers ? (
              <TouchableOpacity
                style={styles.loadMoreButton}
                onPress={() => loadCustomers(true, customerSearch)}
                disabled={loadingMoreCustomers}
              >
                <Text style={styles.loadMoreText}>
                  Daha Fazla Yukle
                  {customerPagination ? ` (${customers.length}/${customerPagination.total})` : ''}
                </Text>
              </TouchableOpacity>
            ) : !customerLocked && customers.length > 0 ? (
              <Text style={styles.helper}>Gosterilen: {customers.length}{customerPagination ? ` / ${customerPagination.total}` : ''}</Text>
            ) : null}
          </View>
          {selectedCustomer ? (
            <View style={styles.contactBlock}>
              <Text style={styles.poolLabel}>Ilgili Kisi</Text>
              {contactsLoading ? (
                <ActivityIndicator color={colors.primarySoft} />
              ) : customerContacts.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>
                  {customerContacts.map((contact) => {
                    const active = selectedContactId === contact.id;
                    return (
                      <TouchableOpacity
                        key={contact.id}
                        style={[styles.contactOption, active && styles.contactOptionActive]}
                        onPress={() => setSelectedContactId(contact.id)}
                      >
                        <Text style={active ? styles.contactNameActive : styles.contactName}>{contact.name}</Text>
                        <Text style={active ? styles.contactMetaActive : styles.contactMeta} numberOfLines={1}>
                          {contact.phone || contact.email || 'Iletisim bilgisi yok'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              ) : (
                <Text style={styles.helper}>Bu caride kayitli kontak yok.</Text>
              )}
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Teklif Bilgileri</Text>
          <TextInput
            style={styles.input}
            placeholder="Gecerlilik tarihi (YYYY-MM-DD)"
            placeholderTextColor={colors.textMuted}
            value={validityDate}
            onChangeText={setValidityDate}
          />
          <TextInput
            style={styles.input}
            placeholder="Belge no"
            placeholderTextColor={colors.textMuted}
            value={documentNo}
            onChangeText={setDocumentNo}
          />
          <TextInput
            style={styles.input}
            placeholder="Sorumlu kodu"
            placeholderTextColor={colors.textMuted}
            value={responsibleCode}
            onChangeText={setResponsibleCode}
          />
          {responsibles.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>
              {responsibles.map((responsible) => {
                const active = responsibleCode === responsible.code;
                return (
                  <TouchableOpacity
                    key={responsible.code}
                    style={[styles.responsibleOption, active && styles.responsibleOptionActive]}
                    onPress={() => setResponsibleCode(responsible.code)}
                  >
                    <Text style={active ? styles.responsibleTextActive : styles.responsibleText}>
                      {responsible.name} {responsible.surname}
                    </Text>
                    <Text style={active ? styles.responsibleCodeActive : styles.responsibleCode}>{responsible.code}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}
          <View style={styles.warehouseInfo}>
            <Text style={styles.warehouseInfoLabel}>Stok hesabina dahil depolar</Text>
            <Text style={styles.warehouseInfoValue} numberOfLines={2}>
              {includedWarehouses.length ? includedWarehouses.join(' | ') : 'Ayar bulunamadi'}
            </Text>
          </View>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Not"
            placeholderTextColor={colors.textMuted}
            value={note}
            onChangeText={setNote}
            multiline
          />
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleButton, vatZeroed && styles.toggleButtonActive]}
              onPress={() => setVatZeroed((prev) => !prev)}
            >
              <Text style={vatZeroed ? styles.toggleTextActive : styles.toggleText}>
                {vatZeroed ? 'KDV Sifirlandi' : 'KDV Normal'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Urun Havuzu</Text>
          <View style={styles.poolTabs}>
            <TouchableOpacity
              style={[styles.poolTabButton, productTab === 'purchased' && styles.poolTabButtonActive]}
              onPress={() => setProductTab('purchased')}
            >
              <Text style={productTab === 'purchased' ? styles.poolTabTextActive : styles.poolTabText}>
                Daha Once Alinanlar
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.poolTabButton, productTab === 'search' && styles.poolTabButtonActive]}
              onPress={() => setProductTab('search')}
            >
              <Text style={productTab === 'search' ? styles.poolTabTextActive : styles.poolTabText}>
                Tum Urunler
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.poolSettingsHeader}>
            <Text style={styles.poolLabel}>Havuz Ayarlari</Text>
            <TouchableOpacity
              style={styles.poolToggleButton}
              onPress={() => setPoolSettingsOpen((prev) => !prev)}
            >
              <Text style={styles.poolToggleText}>{poolSettingsOpen ? 'v' : '>'}</Text>
            </TouchableOpacity>
          </View>
          {poolSettingsOpen && (
            <View style={styles.poolHeader}>
              <Text style={styles.poolLabel}>Fiyat Listesi</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.optionRow}
              >
                {priceListOptions.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.segmentButton,
                      styles.optionButton,
                      poolPriceListNo === option && styles.segmentButtonActive,
                    ]}
                    onPress={() => setPoolPriceListNo(option)}
                  >
                    <Text
                      style={
                        poolPriceListNo === option ? styles.segmentTextActive : styles.segmentText
                      }
                    >
                      {option}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.poolHint}>{poolPriceLabel}</Text>
              <Text style={styles.poolLabel}>Siralama</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.optionRow}
              >
                {POOL_SORT_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.segmentButton,
                      styles.optionButton,
                      poolSort === option.value && styles.segmentButtonActive,
                    ]}
                    onPress={() => setPoolSort(option.value)}
                  >
                    <Text
                      style={poolSort === option.value ? styles.segmentTextActive : styles.segmentText}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={styles.inlineRow}>
                <Text style={styles.poolLabel}>Son Satis</Text>
                <TextInput
                  style={[styles.input, styles.inlineInput]}
                  placeholder="Adet"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={String(lastSalesCount)}
                  onChangeText={handleLastSalesCountChange}
                />
              </View>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={savePoolView}
                disabled={savingPool}
              >
                <Text style={styles.secondaryButtonText}>
                  {savingPool ? 'Kaydediliyor...' : 'Gorunusu Kaydet'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {productTab === 'purchased' ? (
            <>
              {!selectedCustomer ? (
                <Text style={styles.helper}>Once cari secin.</Text>
              ) : (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Urun ara"
                    placeholderTextColor={colors.textMuted}
                    value={purchasedSearch}
                    onChangeText={setPurchasedSearch}
                    returnKeyType="search"
                  />
                  <View style={styles.poolActions}>
                    <Text style={styles.helper}>
                      {selectedPurchasedCount} secili / {sortedPurchasedProducts.length} urun
                    </Text>
                    <View style={styles.actionRow}>
                      <TouchableOpacity style={styles.ghostButton} onPress={clearPurchasedSelection}>
                        <Text style={styles.ghostButtonText}>Secimi Temizle</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.secondaryAction} onPress={selectAllPurchased}>
                        <Text style={styles.secondaryActionText}>Tumunu Sec</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.primaryAction,
                          selectedPurchasedCount === 0 && styles.primaryActionDisabled,
                        ]}
                        onPress={addSelectedPurchasedToQuote}
                        disabled={selectedPurchasedCount === 0}
                      >
                        <Text style={styles.primaryActionText}>Secilileri Ekle</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.listBlock}>
                    <ScrollView style={styles.poolListScroll} nestedScrollEnabled>
                      {sortedPurchasedProducts.map((product) => {
                        const isSelected = selectedPurchasedCodes.has(product.mikroCode);
                        const listPrice = getMikroListPrice(
                          product.mikroPriceLists || {},
                          poolPriceListNo
                        );
                        const unitLabel = getUnitConversionLabel(
                          product.unit,
                          product.unit2,
                          product.unit2Factor
                        );
                        const sales = product.lastSales?.slice(
                          0,
                          Math.min(lastSalesCount, 3)
                        );
                        const imageUri = resolvePublicUrl(product.imageUrl);
                        return (
                          <View
                            key={product.id}
                            style={[
                              styles.poolItem,
                              isSelected && styles.poolItemSelected,
                            ]}
                          >
                            <View style={styles.poolItemHeader}>
                              <TouchableOpacity
                                style={[
                                  styles.checkbox,
                                  isSelected && styles.checkboxChecked,
                                ]}
                                onPress={() => togglePurchasedSelection(product.mikroCode)}
                              >
                                {isSelected && <Text style={styles.checkboxText}>X</Text>}
                              </TouchableOpacity>
                              <View style={styles.poolImageWrap}>
                                {imageUri ? (
                                  <Image source={{ uri: imageUri }} style={styles.poolImage} resizeMode="cover" />
                                ) : (
                                  <View style={styles.poolImagePlaceholder}>
                                    <Text style={styles.poolImagePlaceholderText}>
                                      {product.name?.trim()?.charAt(0)?.toUpperCase() || '?'}
                                    </Text>
                                  </View>
                                )}
                              </View>
                              <View style={styles.poolItemBody}>
                                <Text style={styles.listItemTitle} numberOfLines={2} ellipsizeMode="tail">
                                  {product.name}
                                </Text>
                                <Text style={styles.listItemMeta} numberOfLines={1} ellipsizeMode="middle">
                                  Kod: {product.mikroCode}
                                </Text>
                                <Text style={styles.poolStock} numberOfLines={1}>
                                  Merkez: {formatStockValue(product.warehouseStocks?.['1'])} | Topca:{' '}
                                  {formatStockValue(product.warehouseStocks?.['6'])}
                                </Text>
                                {unitLabel && (
                                  <Text style={styles.poolMeta} numberOfLines={2} ellipsizeMode="tail">
                                    {unitLabel}
                                  </Text>
                                )}
                                <TouchableOpacity style={styles.addButton} onPress={() => addProduct(product)}>
                                  <Text style={styles.addButtonText}>Teklife Ekle</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                            <Text style={styles.poolPrice}>
                              {poolPriceLabel}: {listPrice ? `${formatCurrency(listPrice)} TL` : '-'}
                            </Text>
                            {sales && sales.length > 0 ? (
                              <View style={styles.poolSales}>
                                {sales.map((sale, index) => (
                                  <Text
                                    key={`${product.id}-sale-${index}`}
                                    style={styles.poolSaleText}
                                    numberOfLines={1}
                                  >
                                    {formatDateShort(sale.saleDate)} - {sale.quantity} adet -{' '}
                                    {formatCurrency(sale.unitPrice)} TL
                                  </Text>
                                ))}
                                {product.lastSales && product.lastSales.length > sales.length && (
                                  <Text style={styles.poolSaleMore}>
                                    +{product.lastSales.length - sales.length} daha
                                  </Text>
                                )}
                              </View>
                            ) : (
                              <Text style={styles.poolSaleEmpty}>Satis yok</Text>
                            )}
                          </View>
                        );
                      })}
                    </ScrollView>
                    {purchasedError ? <Text style={styles.errorText}>{purchasedError}</Text> : null}
                    {loadingPurchased && <Text style={styles.helper}>Yukleniyor...</Text>}
                    {!loadingPurchased && sortedPurchasedProducts.length === 0 && (
                      <Text style={styles.helper}>Urun bulunamadi.</Text>
                    )}
                  </View>
                </>
              )}
            </>
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="Urun ara"
                placeholderTextColor={colors.textMuted}
                value={productSearch}
                onChangeText={setProductSearch}
                returnKeyType="search"
              />
              <View style={styles.poolActions}>
                <Text style={styles.helper}>
                  {selectedSearchCount} secili / {sortedSearchResults.length} urun
                </Text>
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.ghostButton} onPress={clearSearchSelection}>
                    <Text style={styles.ghostButtonText}>Secimi Temizle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryAction} onPress={selectAllSearch}>
                    <Text style={styles.secondaryActionText}>Tumunu Sec</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.primaryAction,
                      selectedSearchCount === 0 && styles.primaryActionDisabled,
                    ]}
                    onPress={addSelectedSearchToQuote}
                    disabled={selectedSearchCount === 0}
                  >
                    <Text style={styles.primaryActionText}>Secilileri Ekle</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.listBlock}>
                <ScrollView style={styles.poolListScroll} nestedScrollEnabled>
                  {sortedSearchResults.map((product) => {
                    const isSelected = selectedSearchCodes.has(product.mikroCode);
                    const listPrice = getMikroListPrice(
                      product.mikroPriceLists || {},
                      poolPriceListNo
                    );
                    const unitLabel = getUnitConversionLabel(
                      product.unit,
                      product.unit2,
                      product.unit2Factor
                    );
                    const imageUri = resolvePublicUrl(product.imageUrl);
                    return (
                      <View
                        key={product.id}
                        style={[styles.poolItem, isSelected && styles.poolItemSelected]}
                      >
                        <View style={styles.poolItemHeader}>
                          <TouchableOpacity
                            style={[styles.checkbox, isSelected && styles.checkboxChecked]}
                            onPress={() => toggleSearchSelection(product.mikroCode)}
                          >
                            {isSelected && <Text style={styles.checkboxText}>X</Text>}
                          </TouchableOpacity>
                          <View style={styles.poolImageWrap}>
                            {imageUri ? (
                              <Image source={{ uri: imageUri }} style={styles.poolImage} resizeMode="cover" />
                            ) : (
                              <View style={styles.poolImagePlaceholder}>
                                <Text style={styles.poolImagePlaceholderText}>
                                  {product.name?.trim()?.charAt(0)?.toUpperCase() || '?'}
                                </Text>
                              </View>
                            )}
                          </View>
                          <View style={styles.poolItemBody}>
                            <Text style={styles.listItemTitle} numberOfLines={2} ellipsizeMode="tail">
                              {product.name}
                            </Text>
                            <Text style={styles.listItemMeta} numberOfLines={1} ellipsizeMode="middle">
                              Kod: {product.mikroCode}
                            </Text>
                            <Text style={styles.poolStock} numberOfLines={1}>
                              Merkez: {formatStockValue(product.warehouseStocks?.['1'])} | Topca:{' '}
                              {formatStockValue(product.warehouseStocks?.['6'])}
                            </Text>
                            {unitLabel && (
                              <Text style={styles.poolMeta} numberOfLines={2} ellipsizeMode="tail">
                                {unitLabel}
                              </Text>
                            )}
                            <TouchableOpacity style={styles.addButton} onPress={() => addProduct(product)}>
                              <Text style={styles.addButtonText}>Teklife Ekle</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        <Text style={styles.poolPrice}>
                          {poolPriceLabel}: {listPrice ? `${formatCurrency(listPrice)} TL` : '-'}
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>
                {productSearchError ? <Text style={styles.errorText}>{productSearchError}</Text> : null}
                {searchingProducts && <Text style={styles.helper}>Araniyor...</Text>}
                {productSearch.trim().length === 0 && (
                  <Text style={styles.helper}>Urun aramak icin yazin.</Text>
                )}
                {productSearch.trim().length > 0 &&
                  sortedSearchResults.length === 0 &&
                  !searchingProducts && (
                    <Text style={styles.helper}>Urun bulunamadi.</Text>
                  )}
              </View>
            </>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.itemsHeader}>
            <Text style={styles.cardTitle}>Teklif Kalemleri ({quoteItems.length})</Text>
            <TouchableOpacity style={styles.secondaryButton} onPress={addManualLine}>
              <Text style={styles.secondaryButtonText}>Manuel Satir Ekle</Text>
            </TouchableOpacity>
          </View>
          {quoteItems.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemTitle} numberOfLines={2} ellipsizeMode="tail">
                  {item.isManualLine ? 'Manuel Satir' : item.productName}
                </Text>
                <TouchableOpacity onPress={() => removeItem(item.id)}>
                  <Text style={styles.removeText}>Sil</Text>
                </TouchableOpacity>
              </View>
              {item.isManualLine ? (
                <View style={styles.manualRow}>
                  <TextInput
                    style={styles.input}
                    placeholder="Urun adi"
                    placeholderTextColor={colors.textMuted}
                    value={item.productName}
                    onChangeText={(value) => updateItem(item.id, { productName: value })}
                  />
                  <Text style={styles.itemMeta} numberOfLines={1} ellipsizeMode="middle">
                    Kod: {item.productCode}
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Birim"
                    placeholderTextColor={colors.textMuted}
                    value={item.unit || ''}
                    onChangeText={(value) => updateItem(item.id, { unit: value })}
                  />
                </View>
              ) : (
                <Text style={styles.itemMeta} numberOfLines={1} ellipsizeMode="middle">
                  Kod: {item.productCode}
                </Text>
              )}

              {!item.isManualLine ? (
                <>
                  <View style={styles.itemInsightGrid}>
                    <View style={styles.itemInsight}>
                      <Text style={styles.itemInsightLabel}>DEPO</Text>
                      <Text style={styles.itemInsightValue} numberOfLines={1}>
                        Mrk {formatStockValue(item.warehouseStocks?.['1'])} | Top {formatStockValue(item.warehouseStocks?.['6'])} | Toplam {formatStockValue(Object.values(item.warehouseStocks || {}).reduce((sum, value) => sum + Number(value || 0), 0))}
                      </Text>
                    </View>
                    <View style={styles.itemInsight}>
                      <Text style={styles.itemInsightLabel}>KAR GUNCEL / GIRIS</Text>
                      <Text style={styles.itemInsightValue} numberOfLines={1}>
                        {formatPercent(getMarginPercent(item.unitPrice, item.currentCost))} / {formatPercent(getMarginPercent(item.unitPrice, item.lastEntryPrice))}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.itemContext} numberOfLines={2}>
                    Son giris {formatDateShort(item.lastEntryDate)} | {getUnitConversionLabel(item.unit, item.unit2, item.unit2Factor) || item.unit || '-'} | KDV %{Math.round(Number(item.vatRate || 0) <= 1 ? Number(item.vatRate || 0) * 100 : Number(item.vatRate || 0))}
                  </Text>
                </>
              ) : null}

              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.smallInput]}
                  placeholder="Miktar"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={String(item.quantity)}
                  onChangeText={(value) =>
                    updateItem(item.id, { quantity: Number(value) || 1 })
                  }
                />
                <TextInput
                  style={[styles.input, styles.smallInput]}
                  placeholder="Birim fiyat"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={
                    item.priceSource === 'MANUAL'
                      ? item.manualPriceInput ?? String(item.unitPrice || '')
                      : String(item.unitPrice || '')
                  }
                  editable={item.priceSource === 'MANUAL'}
                  onChangeText={(value) => handleManualPriceChange(item, value)}
                />
              </View>
              {item.isManualLine ? (
                <>
                  <Text style={styles.helper}>Fiyat kaynagi: Manuel</Text>
                  <View style={styles.row}>
                    <TouchableOpacity
                      style={[
                        styles.segmentButton,
                        item.priceType === 'INVOICED' && styles.segmentButtonActive,
                      ]}
                      onPress={() => updateItem(item.id, { priceType: 'INVOICED' })}
                    >
                      <Text
                        style={
                          item.priceType === 'INVOICED'
                            ? styles.segmentTextActive
                            : styles.segmentText
                        }
                      >
                        Faturali
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.segmentButton,
                        item.priceType === 'WHITE' && styles.segmentButtonActive,
                      ]}
                      onPress={() => updateItem(item.id, { priceType: 'WHITE' })}
                    >
                      <Text
                        style={
                          item.priceType === 'WHITE'
                            ? styles.segmentTextActive
                            : styles.segmentText
                        }
                      >
                        Beyaz
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <View style={styles.row}>
                  <TouchableOpacity
                    style={[
                      styles.segmentButton,
                      item.priceSource === 'LAST_SALE' && styles.segmentButtonActive,
                    ]}
                    onPress={() => handlePriceSourceChange(item, 'LAST_SALE')}
                  >
                    <Text
                      style={
                        item.priceSource === 'LAST_SALE'
                          ? styles.segmentTextActive
                          : styles.segmentText
                      }
                    >
                      Son Satis
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.segmentButton,
                      item.priceSource === 'PRICE_LIST' && styles.segmentButtonActive,
                    ]}
                    onPress={() => handlePriceSourceChange(item, 'PRICE_LIST')}
                  >
                    <Text
                      style={
                        item.priceSource === 'PRICE_LIST'
                          ? styles.segmentTextActive
                          : styles.segmentText
                      }
                    >
                      Liste
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.segmentButton,
                      item.priceSource === 'MANUAL' && styles.segmentButtonActive,
                    ]}
                    onPress={() => handlePriceSourceChange(item, 'MANUAL')}
                  >
                    <Text
                      style={
                        item.priceSource === 'MANUAL'
                          ? styles.segmentTextActive
                          : styles.segmentText
                      }
                    >
                      Manuel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.segmentButton,
                      item.priceType === 'INVOICED' && styles.segmentButtonActive,
                    ]}
                    onPress={() => updateItem(item.id, { priceType: 'INVOICED' })}
                  >
                    <Text
                      style={
                        item.priceType === 'INVOICED'
                          ? styles.segmentTextActive
                          : styles.segmentText
                      }
                    >
                      Faturali
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.segmentButton,
                      item.priceType === 'WHITE' && styles.segmentButtonActive,
                    ]}
                    onPress={() => updateItem(item.id, { priceType: 'WHITE' })}
                  >
                    <Text
                      style={
                        item.priceType === 'WHITE'
                          ? styles.segmentTextActive
                          : styles.segmentText
                      }
                    >
                      Beyaz
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {item.priceSource === 'PRICE_LIST' && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.optionRow}
                >
                  {priceListOptions.map((option) => {
                    const listPrice = getMikroListPrice(item.mikroPriceLists, option);
                    const isActive = item.priceListNo === option;
                    const shortCode = getPriceListShortCode(option);
                    return (
                      <TouchableOpacity
                        key={`${item.id}-list-${option}`}
                        style={[
                          styles.listOption,
                          isActive && styles.listOptionActive,
                        ]}
                        onPress={() => handlePriceListChange(item, option)}
                      >
                        <Text style={isActive ? styles.listOptionTextActive : styles.listOptionText}>
                          {shortCode}
                        </Text>
                        <Text
                          style={
                            isActive ? styles.listOptionPriceActive : styles.listOptionPrice
                          }
                        >
                          {listPrice ? formatCurrency(listPrice) : '-'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {item.priceSource === 'MANUAL' && !item.isManualLine && (
                <View style={styles.marginBlock}>
                  <Text style={styles.marginTitle}>Kar Yuzdesi</Text>
                  <View style={styles.marginRow}>
                    <View style={styles.marginColumn}>
                      <Text style={styles.marginLabel}>Son giris</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="%"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                        value={item.manualMarginEntry === undefined ? '' : String(item.manualMarginEntry)}
                        onChangeText={(value) => handleManualMarginChange(item, 'entry', value)}
                      />
                    </View>
                    <View style={styles.marginColumn}>
                      <Text style={styles.marginLabel}>Guncel maliyet</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="%"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                        value={item.manualMarginCost === undefined ? '' : String(item.manualMarginCost)}
                        onChangeText={(value) => handleManualMarginChange(item, 'cost', value)}
                      />
                    </View>
                  </View>
                  <View style={styles.marginInfoRow}>
                    <Text style={styles.marginInfoText}>
                      Son giris: {formatCurrency(item.lastEntryPrice ?? null)} TL
                    </Text>
                    <Text
                      style={[
                        styles.marginInfoText,
                        (getMarginPercent(item.unitPrice, item.lastEntryPrice) ?? 0) < 0
                          ? styles.marginNegative
                          : styles.marginPositive,
                      ]}
                    >
                      Kar {formatPercent(getMarginPercent(item.unitPrice, item.lastEntryPrice))}
                    </Text>
                  </View>
                  <View style={styles.marginInfoRow}>
                    <Text style={styles.marginInfoText}>
                      Guncel maliyet: {formatCurrency(item.currentCost ?? null)} TL
                    </Text>
                    <Text
                      style={[
                        styles.marginInfoText,
                        (getMarginPercent(item.unitPrice, item.currentCost) ?? 0) < 0
                          ? styles.marginNegative
                          : styles.marginPositive,
                      ]}
                    >
                      Kar {formatPercent(getMarginPercent(item.unitPrice, item.currentCost))}
                    </Text>
                  </View>
                </View>
              )}

              {item.priceSource === 'LAST_SALE' && (
                <View style={styles.salesBlock}>
                  {item.lastSales && item.lastSales.length > 0 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.optionRow}
                    >
                      {item.lastSales.map((sale, idx) => {
                        const isActive = item.selectedSaleIndex === idx;
                        return (
                          <TouchableOpacity
                            key={`${item.id}-sale-${idx}`}
                            style={[
                              styles.saleOption,
                              isActive && styles.saleOptionActive,
                            ]}
                            onPress={() => handleLastSaleChange(item, idx)}
                          >
                            <Text style={isActive ? styles.saleTextActive : styles.saleText}>
                              {formatDateShort(sale.saleDate)}
                            </Text>
                            <Text style={isActive ? styles.saleTextActive : styles.saleText}>
                              {sale.quantity} adet
                            </Text>
                            <Text style={isActive ? styles.saleTextActive : styles.saleText}>
                              {formatCurrency(sale.unitPrice)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  ) : (
                    <Text style={styles.helper}>Satis yok.</Text>
                  )}
                </View>
              )}

              <View style={styles.inlineRow}>
                <Text style={styles.helper}>KDV 0</Text>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    item.vatZeroed && styles.toggleButtonActive,
                  ]}
                  onPress={() => updateItem(item.id, { vatZeroed: !item.vatZeroed })}
                >
                  <Text style={item.vatZeroed ? styles.toggleTextActive : styles.toggleText}>
                    {item.vatZeroed ? 'Acik' : 'Kapali'}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.itemTotal}>
                  Toplam: {formatCurrency((item.unitPrice || 0) * (item.quantity || 0))} TL
                </Text>
              </View>

              {item.isManualLine && (
                <View style={styles.manualVatRow}>
                  {[0.01, 0.1, 0.2].map((rate) => (
                    <TouchableOpacity
                      key={`${item.id}-vat-${rate}`}
                      style={[
                        styles.segmentButton,
                        item.manualVatRate === rate && styles.segmentButtonActive,
                      ]}
                      onPress={() => handleManualVatChange(item, rate)}
                    >
                      <Text
                        style={
                          item.manualVatRate === rate
                            ? styles.segmentTextActive
                            : styles.segmentText
                        }
                      >
                        %{Math.round(rate * 100)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TextInput
                style={styles.input}
                placeholder="Satir aciklama"
                placeholderTextColor={colors.textMuted}
                value={item.lineDescription || ''}
                onChangeText={(value) => updateItem(item.id, { lineDescription: value })}
              />

              {!item.isManualLine && item.productCode ? (
                <StockFamilySuggestion
                  productCode={item.productCode}
                  baseQuantity={item.quantity}
                  excludeCodes={familyExcludeCodesByLine[item.id]}
                  suppressed={isFamilySuggestionSuppressed(item)}
                  onSwap={(recommendation) => void requestFamilyAction('swap', item, recommendation)}
                  onSplit={(recommendation) => void requestFamilyAction('split', item, recommendation)}
                />
              ) : null}
              {familyActionLoadingId === item.id ? (
                <View style={styles.familyLoadingRow}>
                  <ActivityIndicator size="small" color={colors.primarySoft} />
                  <Text style={styles.helper}>Alternatif urun bilgisi aliniyor</Text>
                </View>
              ) : null}
            </View>
          ))}
          {quoteItems.length === 0 && (
            <Text style={styles.helper}>Urun eklenmedi.</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.cardTitle}>Tamamlayici Oneriler</Text>
          {loadingComplementRecommendations ? (
            <ActivityIndicator color={colors.primary} />
          ) : complementRecommendations.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.complementRow}
            >
              {complementRecommendations.map((item) => (
                <View key={`complement-${item.id}`} style={styles.complementCard}>
                  <Text style={styles.complementName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={styles.complementCode} numberOfLines={1} ellipsizeMode="middle">
                    {item.mikroCode}
                  </Text>
                  <TouchableOpacity
                    style={styles.secondaryAction}
                    onPress={() => addComplementProduct(item)}
                  >
                    <Text style={styles.secondaryActionText}>Kaleme Ekle</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.helper}>Kalem secildikce tamamlayici oneriler burada listelenir.</Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, (saving || loadingEdit || !selectedCustomer) && styles.disabledButton]}
          onPress={handleCreate}
          disabled={saving || loadingEdit || !selectedCustomer}
        >
          <Text style={styles.primaryButtonText}>
            {saving ? 'Kaydediliyor...' : isEditMode ? 'Teklif Guncelle' : 'Teklif Olustur'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={Boolean(familyActionInfo)}
        transparent
        animationType="fade"
        onRequestClose={() => setFamilyActionConfirm(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.familyModal}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleWrap}>
                <Text style={styles.modalEyebrow}>STOK AILESI</Text>
                <Text style={styles.modalTitle} numberOfLines={2}>
                  {familyActionInfo?.mode === 'swap' ? 'Urun Degistir' : 'Miktari Bol'}
                </Text>
              </View>
              <TouchableOpacity style={styles.modalClose} onPress={() => setFamilyActionConfirm(null)}>
                <Text style={styles.modalCloseText}>Kapat</Text>
              </TouchableOpacity>
            </View>

            {familyActionInfo ? (
              <>
                <View style={styles.familyCompareCard}>
                  <Text style={styles.familyCompareLabel}>MEVCUT SATIR</Text>
                  <Text style={styles.familyCompareTitle} numberOfLines={2}>{familyActionInfo.item.productName}</Text>
                  <Text style={styles.familyCompareMeta} numberOfLines={2}>
                    {familyActionInfo.item.productCode} · {formatStockValue(familyActionInfo.item.quantity)} {familyActionInfo.item.unit || 'ADET'} · {formatCurrency(familyActionInfo.item.unitPrice)} TL
                  </Text>
                  <Text style={styles.familyCompareMargin}>
                    Kar guncel / giris: {formatPercent(familyActionInfo.currentMargin)} / {formatPercent(familyActionInfo.currentEntryMargin)}
                  </Text>
                </View>

                <View style={[styles.familyCompareCard, styles.familyTargetCard]}>
                  <Text style={[styles.familyCompareLabel, styles.familyTargetLabel]}>
                    {familyActionInfo.mode === 'swap' ? 'YENI SATIR' : 'BOLUNEN YENI SATIR'}
                  </Text>
                  <Text style={styles.familyCompareTitle} numberOfLines={2}>{familyActionInfo.alternateProduct.name}</Text>
                  <Text style={styles.familyCompareMeta} numberOfLines={2}>
                    {familyActionInfo.alternateProduct.mikroCode} · Tasinacak {formatStockValue(familyActionInfo.movedQuantity)} {familyActionInfo.alternateProduct.unit || 'ADET'}
                    {familyActionInfo.mode === 'split' ? ` · Kalan ${formatStockValue(familyActionInfo.keptQuantity)}` : ''}
                  </Text>
                  <Text style={styles.familyCompareMargin}>
                    Kar guncel / giris: {formatPercent(familyActionInfo.targetMargin)} / {formatPercent(familyActionInfo.targetEntryMargin)}
                  </Text>
                </View>

                <View style={styles.familyNotice}>
                  <Text style={styles.familyNoticeText}>
                    {familyActionInfo.item.unitPrice > 0
                      ? 'Birim fiyat mevcut satirdan manuel fiyat olarak tasinir; kaydetmeden once kontrol edin.'
                      : 'Mevcut fiyat yok. Alternatif urunun varsayilan liste fiyati kullanilir; kaydetmeden once kontrol edin.'}
                  </Text>
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalSecondaryButton} onPress={() => setFamilyActionConfirm(null)}>
                    <Text style={styles.modalSecondaryText}>Vazgec</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalPrimaryButton} onPress={confirmFamilyAction}>
                    <Text style={styles.modalPrimaryText}>Onayla ve Uygula</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  backText: {
    fontFamily: fonts.medium,
    color: colors.primarySoft,
  },
  hero: {
    paddingHorizontal: 1,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  kicker: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFD7FF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: '#FFFFFF',
  },
  subtitle: {
    fontFamily: fonts.regular,
    color: '#DDE8FF',
    fontSize: fontSizes.sm,
    lineHeight: fontSizes.sm + 5,
  },
  heroPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  heroPill: {
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#FFFFFF',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  contactBlock: {
    gap: spacing.xs,
  },
  contactOption: {
    width: 164,
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  contactOptionActive: {
    borderColor: colors.primarySoft,
    backgroundColor: colors.primaryMuted,
  },
  contactName: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  contactNameActive: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.textStrong },
  contactMeta: { marginTop: 2, fontFamily: fonts.mono, fontSize: fontSizes.xs, color: colors.textMuted },
  contactMetaActive: { marginTop: 2, fontFamily: fonts.mono, fontSize: fontSizes.xs, color: colors.primarySoft },
  responsibleOption: {
    minWidth: 118,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  responsibleOptionActive: { borderColor: colors.primarySoft, backgroundColor: colors.primaryMuted },
  responsibleText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.textSoft },
  responsibleTextActive: { fontFamily: fonts.bold, fontSize: fontSizes.xs, color: colors.textStrong },
  responsibleCode: { marginTop: 2, fontFamily: fonts.mono, fontSize: 9, color: colors.textMuted },
  responsibleCodeActive: { marginTop: 2, fontFamily: fonts.mono, fontSize: 9, color: colors.primarySoft },
  warehouseInfo: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.sm,
  },
  warehouseInfoLabel: { fontFamily: fonts.monoSemibold, fontSize: 9, color: colors.textMuted },
  warehouseInfoValue: { marginTop: 3, fontFamily: fonts.monoMedium, fontSize: fontSizes.xs, color: colors.primarySoft },
  itemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  poolTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  poolSettingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  poolToggleButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  poolToggleText: {
    fontFamily: fonts.semibold,
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
  poolTabButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  poolTabButtonActive: {
    backgroundColor: colors.primary,
  },
  poolTabText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  poolTabTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: '#FFFFFF',
  },
  poolHeader: {
    gap: spacing.sm,
  },
  poolLabel: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  poolHint: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  optionButton: {
    flex: 0,
    paddingHorizontal: spacing.sm,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  inlineInput: {
    flex: 1,
    minWidth: 130,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  listBlock: {
    gap: spacing.sm,
  },
  listScroll: {
    maxHeight: 240,
  },
  poolListScroll: {
    maxHeight: 420,
  },
  listItem: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  listItemActive: {
    borderColor: colors.primary,
  },
  loadMoreButton: {
    minHeight: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  loadMoreText: {
    fontFamily: fonts.bold,
    color: '#FFFFFF',
    fontSize: fontSizes.sm,
  },
  listItemTitle: {
    fontFamily: fonts.semibold,
    color: colors.text,
    minWidth: 0,
  },
  listItemMeta: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    marginTop: spacing.xs,
  },
  poolPrice: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  poolActions: {
    gap: spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  ghostButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  ghostButtonText: {
    fontFamily: fonts.semibold,
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  secondaryAction: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  secondaryActionText: {
    fontFamily: fonts.semibold,
    color: colors.text,
    fontSize: fontSizes.xs,
  },
  primaryAction: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  primaryActionDisabled: {
    opacity: 0.5,
  },
  primaryActionText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
    fontSize: fontSizes.xs,
  },
  poolItem: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  poolItemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  poolItemHeader: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  poolItemBody: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  poolImageWrap: {
    width: 52,
    height: 52,
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  poolImage: {
    width: '100%',
    height: '100%',
  },
  poolImagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  poolImagePlaceholderText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: colors.textMuted,
  },
  checkbox: {
    width: 22,
    height: 22,
    flexShrink: 0,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
    fontSize: fontSizes.xs,
  },
  poolStock: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  poolMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  poolSales: {
    gap: spacing.xs,
  },
  poolSaleText: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.text,
  },
  poolSaleMore: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  poolSaleEmpty: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  complementRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  complementCard: {
    width: 180,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  complementName: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  complementCode: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  addButton: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    minWidth: 104,
  },
  addButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
    fontSize: fontSizes.sm,
  },
  helper: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
  errorText: {
    fontFamily: fonts.medium,
    color: colors.danger,
    fontSize: fontSizes.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  toggleButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  toggleText: {
    fontFamily: fonts.medium,
    color: colors.text,
  },
  toggleTextActive: {
    fontFamily: fonts.medium,
    color: '#FFFFFF',
  },
  itemTotal: {
    fontFamily: fonts.semibold,
    color: colors.text,
    fontSize: fontSizes.sm,
  },
  itemCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  manualRow: {
    gap: spacing.xs,
  },
  itemTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  removeText: {
    fontFamily: fonts.medium,
    color: colors.danger,
  },
  itemMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  itemInsightGrid: { flexDirection: 'row', gap: spacing.xs },
  itemInsight: { flex: 1, minWidth: 0, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted, padding: spacing.sm },
  itemInsightLabel: { fontFamily: fonts.monoSemibold, fontSize: 8, color: colors.textMuted },
  itemInsightValue: { marginTop: 3, fontFamily: fonts.monoMedium, fontSize: 9, color: colors.text },
  itemContext: { fontFamily: fonts.mono, fontSize: 9, lineHeight: 14, color: colors.textMuted },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  manualVatRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  smallInput: {
    flex: 1,
    minWidth: 130,
  },
  segmentButton: {
    flex: 1,
    minWidth: 82,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  segmentButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
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
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
  },
  listOption: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    minWidth: 72,
  },
  listOptionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  listOptionText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  listOptionTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#FFFFFF',
  },
  listOptionPrice: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  listOptionPriceActive: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: '#FFFFFF',
  },
  salesBlock: {
    gap: spacing.xs,
  },
  saleOption: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
    minWidth: 110,
  },
  saleOptionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  saleText: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  saleTextActive: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: '#FFFFFF',
  },
  marginBlock: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  marginTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  marginRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  marginColumn: {
    flex: 1,
    minWidth: 150,
    gap: spacing.xs,
  },
  marginLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  marginInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  marginInfoText: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  marginPositive: {
    color: colors.primarySoft,
    fontFamily: fonts.semibold,
  },
  marginNegative: {
    color: colors.danger,
    fontFamily: fonts.semibold,
  },
  familyLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.overlay,
  },
  familyModal: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    alignSelf: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.backgroundRaised,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  modalTitleWrap: { flex: 1, minWidth: 0 },
  modalEyebrow: { fontFamily: fonts.monoSemibold, fontSize: 9, color: colors.primarySoft },
  modalTitle: { marginTop: 3, fontFamily: fonts.bold, fontSize: fontSizes.lg, lineHeight: 23, color: colors.textStrong },
  modalClose: { minHeight: 34, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  modalCloseText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.textSoft },
  familyCompareCard: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, padding: spacing.md, gap: 4 },
  familyTargetCard: { borderColor: colors.borderStrong, backgroundColor: colors.primaryMuted },
  familyCompareLabel: { fontFamily: fonts.monoSemibold, fontSize: 9, color: colors.textMuted },
  familyTargetLabel: { color: colors.primarySoft },
  familyCompareTitle: { fontFamily: fonts.bold, fontSize: fontSizes.sm, lineHeight: 18, color: colors.textStrong },
  familyCompareMeta: { fontFamily: fonts.mono, fontSize: fontSizes.xs, lineHeight: 16, color: colors.textSoft },
  familyCompareMargin: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  familyNotice: { borderRadius: radius.sm, borderWidth: 1, borderColor: 'rgba(251,191,36,0.30)', backgroundColor: colors.warningSoft, padding: spacing.sm },
  familyNoticeText: { fontFamily: fonts.medium, fontSize: fontSizes.xs, lineHeight: 16, color: colors.warning },
  modalActions: { flexDirection: 'row', gap: spacing.sm },
  modalSecondaryButton: { flex: 1, minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  modalSecondaryText: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.textSoft },
  modalPrimaryButton: { flex: 1.5, minHeight: 44, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  modalPrimaryText: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.textStrong, textAlign: 'center' },
});
