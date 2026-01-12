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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { adminApi } from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { Customer, Product } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

const buildDefaultValidityDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
};

type QuoteItemForm = {
  id: string;
  productId: string;
  productName: string;
  productCode: string;
  unit?: string | null;
  quantity: number;
  priceSource: 'PRICE_LIST' | 'MANUAL';
  priceListNo?: number;
  unitPrice: number;
  priceType: 'INVOICED' | 'WHITE';
  mikroPriceLists?: Record<string, number>;
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

const formatDateShort = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

export function QuoteCreateScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [poolPriceListNo, setPoolPriceListNo] = useState(1);
  const [poolSort, setPoolSort] = useState<PoolSortOption>('default');
  const [lastSalesCount, setLastSalesCount] = useState(1);
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

    const items = quoteItems.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      priceSource: item.priceSource,
      priceListNo: item.priceSource === 'PRICE_LIST' ? item.priceListNo : undefined,
      priceType: item.priceType,
    }));

    setSaving(true);
    try {
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
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Teklif olusturulamadi.');
    } finally {
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

        <Text style={styles.title}>Yeni Teklif</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cari Secimi</Text>
          <TextInput
            style={styles.input}
            placeholder="Cari ara"
            placeholderTextColor={colors.textMuted}
            value={customerSearch}
            onChangeText={setCustomerSearch}
            returnKeyType="search"
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
                  onPress={() => setSelectedCustomer(customer)}
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
          <Text style={styles.cardTitle}>Teklif Kalemleri ({quoteItems.length})</Text>
          {quoteItems.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemTitle}>{item.productName}</Text>
                <TouchableOpacity onPress={() => removeItem(item.id)}>
                  <Text style={styles.removeText}>Sil</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.itemMeta}>Kod: {item.productCode}</Text>
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
                  placeholder="Fiyat"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={String(item.unitPrice)}
                  editable={item.priceSource === 'MANUAL'}
                  onChangeText={(value) =>
                    updateItem(item.id, { unitPrice: Number(value) || 0 })
                  }
                />
                <TextInput
                  style={[styles.input, styles.smallInput]}
                  placeholder="Liste"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={String(item.priceListNo || '')}
                  editable={item.priceSource === 'PRICE_LIST'}
                  onChangeText={(value) =>
                    updateItem(item.id, { priceListNo: Number(value) || 1 })
                  }
                />
              </View>
              <View style={styles.row}>
                <TouchableOpacity
                  style={[
                    styles.segmentButton,
                    item.priceSource === 'PRICE_LIST' && styles.segmentButtonActive,
                  ]}
                  onPress={() => updateItem(item.id, { priceSource: 'PRICE_LIST' })}
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
                  onPress={() => updateItem(item.id, { priceSource: 'MANUAL' })}
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
            </View>
          ))}
          {quoteItems.length === 0 && (
            <Text style={styles.helper}>Urun eklenmedi.</Text>
          )}
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={handleCreate} disabled={saving}>
          <Text style={styles.primaryButtonText}>{saving ? 'Kaydediliyor...' : 'Teklif Olustur'}</Text>
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
  poolTabs: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
    gap: spacing.xs,
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
});
