import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
import { PortalStackParamList } from '../navigation/AppNavigator';
import { Customer, Product, LastSale, Quote, QuoteItem } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

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
};

type PoolSortOption = 'default' | 'stock1_desc' | 'stock6_desc' | 'price_asc' | 'price_desc';

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
  const route = useRoute() as { params?: { quoteId?: string } };
  const editQuoteId = route.params?.quoteId;
  const isEditMode = Boolean(editQuoteId);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [poolPriceListNo, setPoolPriceListNo] = useState(1);
  const [poolSort, setPoolSort] = useState<PoolSortOption>('default');
  const [lastSalesCount, setLastSalesCount] = useState(1);
  const [poolSettingsOpen, setPoolSettingsOpen] = useState(true);
  const [savingPool, setSavingPool] = useState(false);

  const [productTab, setProductTab] = useState<'purchased' | 'search'>('purchased');
  const [purchasedProducts, setPurchasedProducts] = useState<Product[]>([]);
  const [purchasedSearch, setPurchasedSearch] = useState('');
  const [loadingPurchased, setLoadingPurchased] = useState(false);
  const [selectedPurchasedCodes, setSelectedPurchasedCodes] = useState<Set<string>>(new Set());
  const [selectedSearchCodes, setSelectedSearchCodes] = useState<Set<string>>(new Set());

  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);

  const [quoteItems, setQuoteItems] = useState<QuoteItemForm[]>([]);
  const [validityDate, setValidityDate] = useState(buildDefaultValidityDate());
  const [note, setNote] = useState('');
  const [documentNo, setDocumentNo] = useState('');
  const [responsibleCode, setResponsibleCode] = useState('');
  const [vatZeroed, setVatZeroed] = useState(false);
  const [saving, setSaving] = useState(false);

  const priceListOptions = Array.from({ length: 10 }, (_, index) => index + 1);

  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const response = await adminApi.getCustomers();
        setCustomers(response.customers || []);
      } catch (err) {
        console.error('Customers fetch failed', err);
      }
    };
    loadCustomers();
  }, []);

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
        if (quote.validityDate) {
          setValidityDate(quote.validityDate.slice(0, 10));
        }
        setNote(quote.note || '');
        setDocumentNo(quote.documentNo || '');
        setResponsibleCode(quote.responsibleCode || '');
        setVatZeroed(Boolean(quote.vatZeroed));
        if (quote.items && quote.items.length > 0) {
          setQuoteItems(quote.items.map(buildQuoteItemFromExisting));
        }
      } catch (err) {
        if (active) {
          Alert.alert('Hata', 'Teklif yuklenemedi.');
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
      } catch (err) {
        console.error('Preferences fetch failed', err);
      }
    };
    loadPreferences();
  }, []);

  useEffect(() => {
    setSelectedPurchasedCodes(new Set());
    setSelectedSearchCodes(new Set());
    setPurchasedSearch('');
    if (selectedCustomer) {
      setProductTab('purchased');
    }
  }, [selectedCustomer?.id]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!selectedCustomer) {
        setPurchasedProducts([]);
        setLoadingPurchased(false);
        return;
      }
      setLoadingPurchased(true);
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
        return;
      }
      const term = productSearch.trim();
      if (!term) {
        setSearchResults([]);
        setSearchingProducts(false);
        return;
      }
      setSearchingProducts(true);
      try {
        const response = await adminApi.getProducts({ search: term, page: 1, limit: 20 });
        if (active) {
          setSearchResults(response.products || []);
        }
      } catch (err) {
        if (active) {
          setSearchResults([]);
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

  const filteredCustomers = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((customer) => {
      const haystack = `${customer.name} ${customer.mikroCariCode || ''} ${customer.email || ''}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [customerSearch, customers]);

  const displayedCustomers = useMemo(() => {
    const term = customerSearch.trim();
    const limit = term ? 60 : 20;
    return filteredCustomers.slice(0, limit);
  }, [customerSearch, filteredCustomers]);

  const filteredPurchasedProducts = useMemo(() => {
    const term = purchasedSearch.trim().toLowerCase();
    if (!term) return purchasedProducts;
    return purchasedProducts.filter((product) => {
      const haystack = `${product.mikroCode || ''} ${product.name || ''}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [purchasedProducts, purchasedSearch]);

  const filteredSearchResults = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) return searchResults;
    return searchResults.filter((product) => {
      const haystack = `${product.mikroCode || ''} ${product.name || ''}`.toLowerCase();
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
    setSavingPool(true);
    try {
      await adminApi.updateQuotePreferences({
        poolPriceListNo,
        poolSort,
        lastSalesCount,
      });
      Alert.alert('Basarili', 'Gorunus kaydedildi.');
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Gorunus kaydedilemedi.');
    } finally {
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

    setSaving(true);
    try {
      if (isEditMode && editQuoteId) {
        await adminApi.updateQuote(editQuoteId, {
          customerId: selectedCustomer.id,
          validityDate,
          note: note || undefined,
          documentNo: documentNo || undefined,
          responsibleCode: responsibleCode || undefined,
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
          vatZeroed,
          items,
        });
        Alert.alert('Basarili', 'Teklif olusturuldu.');
      }
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Teklif olusturulamadi.');
    } finally {
      setSaving(false);
    }
  };

  const poolPriceLabel = getPoolPriceLabel(poolPriceListNo);
  const customerLocked = isEditMode;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Geri</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{isEditMode ? 'Teklif Duzenle' : 'Yeni Teklif'}</Text>
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
            returnKeyType="search"
            editable={!customerLocked}
          />
          <View style={styles.listBlock}>
            <ScrollView style={styles.listScroll} nestedScrollEnabled>
              {displayedCustomers.map((customer) => (
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
                  <Text style={styles.listItemTitle}>{customer.name}</Text>
                  <Text style={styles.listItemMeta}>{customer.mikroCariCode || '-'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {customerSearch.trim().length === 0 && customers.length > displayedCustomers.length && (
              <Text style={styles.helper}>Daha fazla cari icin arama yapin.</Text>
            )}
            {customerSearch.trim().length > 0 && filteredCustomers.length === 0 && (
              <Text style={styles.helper}>Cari bulunamadi.</Text>
            )}
          </View>
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
                              <View style={styles.poolItemBody}>
                                <Text style={styles.listItemTitle}>{product.name}</Text>
                                <Text style={styles.listItemMeta}>Kod: {product.mikroCode}</Text>
                                <Text style={styles.poolStock}>
                                  Merkez: {formatStockValue(product.warehouseStocks?.['1'])} | Topca:{' '}
                                  {formatStockValue(product.warehouseStocks?.['6'])}
                                </Text>
                                {unitLabel && <Text style={styles.poolMeta}>{unitLabel}</Text>}
                              </View>
                              <TouchableOpacity style={styles.addButton} onPress={() => addProduct(product)}>
                                <Text style={styles.addButtonText}>Teklife Ekle</Text>
                              </TouchableOpacity>
                            </View>
                            <Text style={styles.poolPrice}>
                              {poolPriceLabel}: {listPrice ? `${formatCurrency(listPrice)} TL` : '-'}
                            </Text>
                            {sales && sales.length > 0 ? (
                              <View style={styles.poolSales}>
                                {sales.map((sale, index) => (
                                  <Text key={`${product.id}-sale-${index}`} style={styles.poolSaleText}>
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
                          <View style={styles.poolItemBody}>
                            <Text style={styles.listItemTitle}>{product.name}</Text>
                            <Text style={styles.listItemMeta}>Kod: {product.mikroCode}</Text>
                            <Text style={styles.poolStock}>
                              Merkez: {formatStockValue(product.warehouseStocks?.['1'])} | Topca:{' '}
                              {formatStockValue(product.warehouseStocks?.['6'])}
                            </Text>
                            {unitLabel && <Text style={styles.poolMeta}>{unitLabel}</Text>}
                          </View>
                          <TouchableOpacity style={styles.addButton} onPress={() => addProduct(product)}>
                            <Text style={styles.addButtonText}>Teklife Ekle</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.poolPrice}>
                          {poolPriceLabel}: {listPrice ? `${formatCurrency(listPrice)} TL` : '-'}
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>
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

        <View style={styles.card}>
          <View style={styles.itemsHeader}>
            <Text style={styles.cardTitle}>Teklif Kalemleri ({quoteItems.length})</Text>
            <TouchableOpacity style={styles.secondaryButton} onPress={addManualLine}>
              <Text style={styles.secondaryButtonText}>Manuel Satir Ekle</Text>
            </TouchableOpacity>
          </View>
          {quoteItems.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemTitle}>
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
                  <Text style={styles.itemMeta}>Kod: {item.productCode}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Birim"
                    placeholderTextColor={colors.textMuted}
                    value={item.unit || ''}
                    onChangeText={(value) => updateItem(item.id, { unit: value })}
                  />
                </View>
              ) : (
                <Text style={styles.itemMeta}>Kod: {item.productCode}</Text>
              )}

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
            </View>
          ))}
          {quoteItems.length === 0 && (
            <Text style={styles.helper}>Urun eklenmedi.</Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleCreate}
          disabled={saving || loadingEdit || !selectedCustomer}
        >
          <Text style={styles.primaryButtonText}>
            {saving ? 'Kaydediliyor...' : isEditMode ? 'Teklif Guncelle' : 'Teklif Olustur'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
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
    color: colors.primary,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: colors.text,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  itemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  poolTabs: {
    flexDirection: 'row',
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
    gap: spacing.sm,
  },
  inlineInput: {
    flex: 1,
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
  listItemTitle: {
    fontFamily: fonts.semibold,
    color: colors.text,
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
    backgroundColor: '#EEF4FF',
  },
  poolItemHeader: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  poolItemBody: {
    flex: 1,
    gap: spacing.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
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
  addButton: {
    marginTop: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
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
  toggleRow: {
    flexDirection: 'row',
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
  },
  manualRow: {
    gap: spacing.xs,
  },
  itemTitle: {
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
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
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
  },
  segmentButton: {
    flex: 1,
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
    gap: spacing.sm,
  },
  marginColumn: {
    flex: 1,
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
    gap: spacing.sm,
  },
  marginInfoText: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  marginPositive: {
    color: colors.primary,
    fontFamily: fonts.semibold,
  },
  marginNegative: {
    color: colors.danger,
    fontFamily: fonts.semibold,
  },
});
