import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { adminApi } from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { Customer, Product } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { hapticLight, hapticSuccess } from '../utils/haptics';

type ManualOrderItem = {
  key: string;
  productId: string;
  productCode: string;
  productName: string;
  unit?: string | null;
  unit2?: string | null;
  unit2Factor?: number | null;
  vatRate?: number | null;
  warehouseStocks?: Record<string, number>;
  currentCost?: number | null;
  lastEntryPrice?: number | null;
  lastEntryDate?: string | null;
  lastSaleDate?: string | null;
  quantity: number;
  unitPrice: number;
  priceType: 'INVOICED' | 'WHITE';
  reserveQty: number;
  lineDescription: string;
  responsibilityCenter: string;
};

const CUSTOMER_SEARCH_PAGE_SIZE = 40;
const formatNumberInput = (value: string) => value.replace(',', '.');

const readPrice = (product: Product) => {
  const lists = product.mikroPriceLists || {};
  const candidate = Number((lists as Record<string, number>)['6'] || (lists as Record<string, number>)['1'] || 0);
  return Number.isFinite(candidate) && candidate > 0 ? candidate : 0;
};

const getApiErrorMessage = (err: any, fallback: string) => {
  const candidate = err?.response?.data?.error || err?.response?.data?.message || err?.message;
  if (typeof candidate === 'string') return candidate;
  if (candidate && typeof candidate === 'object') return candidate.message || candidate.code || fallback;
  return fallback;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

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

const formatStock = (value?: number | null) => {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '0';
  return amount.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
};

const marginPercent = (price?: number | null, cost?: number | null) => {
  const sale = Number(price);
  const base = Number(cost);
  if (!Number.isFinite(sale) || !Number.isFinite(base) || base <= 0) return null;
  return ((sale / base) - 1) * 100;
};

const formatPercent = (value?: number | null) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `%${value.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString('tr-TR');
};

const unitConversion = (item: Pick<ManualOrderItem, 'unit' | 'unit2' | 'unit2Factor'>) => {
  const factor = Math.abs(Number(item.unit2Factor));
  if (!item.unit || !item.unit2 || !Number.isFinite(factor) || factor <= 0) return item.unit || '-';
  return `1 ${item.unit} = ${factor.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${item.unit2}`;
};

const vatPercent = (value?: number | null) => {
  const rate = Number(value);
  if (!Number.isFinite(rate)) return '-';
  return `%${Math.round(rate <= 1 ? rate * 100 : rate)}`;
};

export function OrderCreateScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [customerPagination, setCustomerPagination] = useState<{ total: number; page: number; pageSize: number; totalPages: number } | null>(null);
  const [loadingMoreCustomers, setLoadingMoreCustomers] = useState(false);
  const [hasMoreCustomers, setHasMoreCustomers] = useState(false);
  const customerRequestSeqRef = useRef(0);

  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [productSearchError, setProductSearchError] = useState<string | null>(null);

  const [items, setItems] = useState<ManualOrderItem[]>([]);

  const [warehouseNo, setWarehouseNo] = useState('1');
  const [documentNo, setDocumentNo] = useState('');
  const [documentDescription, setDocumentDescription] = useState('');
  const [description, setDescription] = useState('B2B Manuel Siparis');
  const [invoicedSeries, setInvoicedSeries] = useState('');
  const [whiteSeries, setWhiteSeries] = useState('');

  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const loadCustomers = async (append = false, searchOverride?: string) => {
    const requestSeq = ++customerRequestSeqRef.current;
    if (append) {
      setLoadingMoreCustomers(true);
    } else {
      setLoadingCustomers(true);
    }
    setCustomerError(null);
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
      const message = getApiErrorMessage(err, 'Cariler yuklenemedi.');
      setCustomerError(message);
      Alert.alert('Hata', message);
    } finally {
      if (requestSeq === customerRequestSeqRef.current) {
        setLoadingCustomers(false);
        setLoadingMoreCustomers(false);
      }
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadCustomers(false, customerSearch);
    }, 250);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  useEffect(() => {
    const term = productSearch.trim();
    if (term.length < 2) {
      setProductResults([]);
      setSearchingProducts(false);
      setProductSearchError(null);
      return;
    }

    let cancelled = false;
    setSearchingProducts(true);
    const timer = setTimeout(async () => {
      try {
        const response = await adminApi.getProducts({ search: term, page: 1, limit: 25 });
        if (!cancelled) {
          setProductResults(response.products || []);
          setProductSearchError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setProductResults([]);
          setProductSearchError(getApiErrorMessage(err, 'Urun aramasi yapilamadi.'));
        }
      } finally {
        if (!cancelled) {
          setSearchingProducts(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [productSearch]);

  const selectCustomer = (customer: Customer) => {
    setSelectedCustomerId(customer.id);
    setSelectedCustomer(customer);
    hapticLight();
  };

  const hasInvoiced = useMemo(() => items.some((item) => item.priceType === 'INVOICED'), [items]);
  const hasWhite = useMemo(() => items.some((item) => item.priceType === 'WHITE'), [items]);
  const totalAmount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [items]
  );
  const invoicedTotal = useMemo(
    () =>
      items
        .filter((item) => item.priceType === 'INVOICED')
        .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [items]
  );
  const whiteTotal = useMemo(
    () =>
      items
        .filter((item) => item.priceType === 'WHITE')
        .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [items]
  );

  const addProduct = (product: Product) => {
    setItems((prev) => {
      const existing = prev.find((line) => line.productId === product.id);
      if (existing) {
        return prev.map((line) =>
          line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line
        );
      }

      return [
        ...prev,
        {
          key: `${product.id}-${Date.now()}`,
          productId: product.id,
          productCode: product.mikroCode,
          productName: product.name,
          unit: product.unit,
          unit2: product.unit2,
          unit2Factor: product.unit2Factor,
          vatRate: product.vatRate,
          warehouseStocks: product.warehouseStocks,
          currentCost: product.currentCost,
          lastEntryPrice: product.lastEntryPrice,
          lastEntryDate: product.lastEntryDate,
          lastSaleDate: product.lastSales?.[0]?.saleDate || null,
          quantity: 1,
          unitPrice: readPrice(product),
          priceType: 'INVOICED',
          reserveQty: 0,
          lineDescription: '',
          responsibilityCenter: '',
        },
      ];
    });
    setProductSearch('');
    setProductResults([]);
  };

  const updateItem = (key: string, data: Partial<ManualOrderItem>) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...data } : item)));
  };

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((item) => item.key !== key));
  };

  const createOrder = async () => {
    if (savingRef.current) return;
    if (!selectedCustomerId) {
      Alert.alert('Uyari', 'Cari seciniz.');
      return;
    }
    if (items.length === 0) {
      Alert.alert('Uyari', 'En az bir urun ekleyin.');
      return;
    }

    const warehouse = Number(warehouseNo);
    if (!Number.isFinite(warehouse) || warehouse <= 0) {
      Alert.alert('Uyari', 'Depo numarasi gecersiz.');
      return;
    }

    if (hasInvoiced && !invoicedSeries.trim()) {
      Alert.alert('Uyari', 'Faturali satirlar icin seri girin.');
      return;
    }
    if (hasWhite && !whiteSeries.trim()) {
      Alert.alert('Uyari', 'Beyaz satirlar icin seri girin.');
      return;
    }

    const invalidLine = items.find((line) => line.quantity <= 0 || line.unitPrice < 0);
    if (invalidLine) {
      Alert.alert('Uyari', 'Miktar/fiyat degerlerini kontrol edin.');
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      const result = await adminApi.createManualOrder({
        customerId: selectedCustomerId,
        warehouseNo: warehouse,
        documentNo: documentNo.trim() || undefined,
        documentDescription: documentDescription.trim() || undefined,
        description: description.trim() || undefined,
        invoicedSeries: invoicedSeries.trim() || undefined,
        whiteSeries: whiteSeries.trim() || undefined,
        items: items.map((line) => ({
          productId: line.productId,
          productCode: line.productCode,
          productName: line.productName,
          unit: line.unit || undefined,
          unit2: line.unit2 || undefined,
          unit2Factor: line.unit2Factor ?? undefined,
          selectedUnit: line.unit || undefined,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          priceType: line.priceType,
          reserveQty: line.reserveQty,
          lineDescription: line.lineDescription.trim() || undefined,
          responsibilityCenter: line.responsibilityCenter.trim() || undefined,
        })),
      });

      Alert.alert('Basarili', `Siparis olusturuldu: ${result.orderNumber}`, [
        {
          text: 'Siparisi Ac',
          onPress: () => navigation.replace('OrderDetail', { orderId: result.orderId }),
        },
        { text: 'Tamam' },
      ]);
      hapticSuccess();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Siparis olusturulamadi.'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Geri</Text>
        </TouchableOpacity>

        <View style={styles.hero}>
          <Text style={styles.kicker}>Satis Operasyonu</Text>
          <Text style={styles.title}>Manuel Siparis Gir</Text>
          <Text style={styles.subtitle}>Cari sec, urunleri ekle ve siparisi tek ekrandan olustur.</Text>
          <View style={styles.heroPillRow}>
            <Text style={styles.heroPill}>{items.length} kalem</Text>
            <Text style={styles.heroPill}>{formatCurrency(totalAmount)}</Text>
          </View>
        </View>

        <View style={[styles.sectionGrid, isWide && styles.sectionGridWide]}>
          <View style={[styles.card, isWide && styles.gridCard]}>
            <Text style={styles.cardTitle}>Cari Secimi</Text>
            <TextInput
              style={styles.input}
              placeholder="Cari adi veya kodu ara..."
              placeholderTextColor={colors.textMuted}
              value={customerSearch}
              onChangeText={setCustomerSearch}
              onSubmitEditing={() => loadCustomers(false, customerSearch)}
              autoCorrect={false}
              returnKeyType="search"
            />
            {customerError ? <Text style={styles.errorText}>{customerError}</Text> : null}
            {loadingCustomers ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <View style={styles.choiceList}>
                {customers.map((customer) => {
                  const active = customer.id === selectedCustomerId;
                  return (
                    <TouchableOpacity
                      key={customer.id}
                      style={[styles.choiceItem, active && styles.choiceItemActive]}
                      onPress={() => selectCustomer(customer)}
                    >
                      <Text style={styles.choiceTitle} numberOfLines={2} ellipsizeMode="tail">
                        {customer.name}
                      </Text>
                      <Text style={styles.choiceMeta} numberOfLines={1} ellipsizeMode="middle">
                        {customer.mikroCariCode || '-'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {customers.length === 0 && <Text style={styles.helper}>Cari bulunamadi.</Text>}
                {loadingMoreCustomers ? (
                  <ActivityIndicator color={colors.primary} />
                ) : hasMoreCustomers ? (
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
                ) : customers.length > 0 ? (
                  <Text style={styles.helper}>Gosterilen: {customers.length}{customerPagination ? ` / ${customerPagination.total}` : ''}</Text>
                ) : null}
              </View>
            )}
            {selectedCustomer && (
              <View style={styles.selectedCustomerCard}>
                <View style={styles.selectedCustomerCopy}>
                  <Text style={styles.selectedCustomerName} numberOfLines={2}>{selectedCustomer.name}</Text>
                  <Text style={styles.selectedCustomerCode}>{selectedCustomer.mikroCariCode || '-'}</Text>
                </View>
                <View style={styles.selectedBalanceBlock}>
                  <Text style={styles.insightLabel}>CARI BAKIYE</Text>
                  <Text style={styles.selectedBalance}>{formatCurrency(selectedCustomer.balance || 0)}</Text>
                </View>
              </View>
            )}
          </View>

          <View style={[styles.card, isWide && styles.gridCard]}>
            <Text style={styles.cardTitle}>Urun Ekle</Text>
            <TextInput
              style={styles.input}
              placeholder="Urun kodu veya adi ara..."
              placeholderTextColor={colors.textMuted}
              value={productSearch}
              onChangeText={setProductSearch}
              autoCorrect={false}
              returnKeyType="search"
            />
            {searchingProducts && <ActivityIndicator color={colors.primary} />}
            {productSearchError ? <Text style={styles.errorText}>{productSearchError}</Text> : null}
            <View style={styles.choiceList}>
              {productResults.map((product) => {
                const imageUri = resolvePublicUrl(product.imageUrl);
                const price = readPrice(product);
                return (
                  <TouchableOpacity
                    key={product.id}
                    style={[styles.choiceItem, styles.productChoiceItem]}
                    onPress={() => {
                      hapticLight();
                      addProduct(product);
                    }}
                  >
                    <View style={styles.choiceItemRow}>
                      <View style={styles.productImageWrap}>
                        {imageUri ? (
                          <Image source={{ uri: imageUri }} style={styles.productImage} resizeMode="cover" />
                        ) : (
                          <View style={styles.productImagePlaceholder}>
                            <Text style={styles.productImagePlaceholderText}>
                              {product.name?.trim()?.charAt(0)?.toUpperCase() || '?'}
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.choiceTextBlock}>
                        <Text style={styles.choiceTitle} numberOfLines={3} ellipsizeMode="tail">
                          {product.name}
                        </Text>
                        <Text style={styles.choiceMeta} numberOfLines={1} ellipsizeMode="middle">
                          {product.mikroCode}
                        </Text>
                        <Text style={styles.choiceMeta} numberOfLines={1}>
                          Merkez: {formatStock(product.warehouseStocks?.['1'])} | Topca:{' '}
                          {formatStock(product.warehouseStocks?.['6'])}
                        </Text>
                        <Text style={styles.productChoicePrice}>
                          {price > 0 ? formatCurrency(price) : 'Fiyat yok'}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
              {productSearch.trim().length >= 2 && !searchingProducts && productResults.length === 0 && !productSearchError ? (
                <Text style={styles.helper}>Urun bulunamadi.</Text>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Siparis Kalemleri ({items.length})</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryLabel}>Toplam</Text>
              <Text style={styles.summaryValue}>{formatCurrency(totalAmount)}</Text>
            </View>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryLabel}>Faturali</Text>
              <Text style={styles.summaryValue}>{formatCurrency(invoicedTotal)}</Text>
            </View>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryLabel}>Beyaz</Text>
              <Text style={styles.summaryValue}>{formatCurrency(whiteTotal)}</Text>
            </View>
          </View>
          {items.map((item) => (
            <View key={item.key} style={styles.lineCard}>
              <View style={styles.lineHeader}>
                <Text style={styles.lineTitle} numberOfLines={2} ellipsizeMode="tail">
                  {item.productName}
                </Text>
                <TouchableOpacity onPress={() => removeItem(item.key)}>
                  <Text style={styles.removeText}>Sil</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.lineMeta} numberOfLines={1} ellipsizeMode="middle">
                {item.productCode}
              </Text>

              <View style={styles.lineInsightGrid}>
                <View style={styles.lineInsight}>
                  <Text style={styles.insightLabel}>DEPO</Text>
                  <Text style={styles.insightValue} numberOfLines={1}>
                    Mrk {formatStock(item.warehouseStocks?.['1'])} | Top {formatStock(item.warehouseStocks?.['6'])} | Toplam {formatStock(Object.values(item.warehouseStocks || {}).reduce((sum, value) => sum + Number(value || 0), 0))}
                  </Text>
                </View>
                <View style={styles.lineInsight}>
                  <Text style={styles.insightLabel}>KAR GUNCEL / GIRIS</Text>
                  <Text style={styles.insightValue} numberOfLines={1}>
                    {formatPercent(marginPercent(item.unitPrice, item.currentCost))} / {formatPercent(marginPercent(item.unitPrice, item.lastEntryPrice))}
                  </Text>
                </View>
              </View>
              <Text style={styles.lineContext} numberOfLines={2}>
                Son giris {formatDate(item.lastEntryDate || item.lastSaleDate)} | {unitConversion(item)} | KDV {vatPercent(item.vatRate)}
              </Text>

              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.half]}
                  placeholder="Miktar"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={String(item.quantity)}
                  onChangeText={(value) => updateItem(item.key, { quantity: Math.max(1, Math.trunc(Number(value) || 0)) })}
                />
                <TextInput
                  style={[styles.input, styles.half]}
                  placeholder="Birim Fiyat"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={String(item.unitPrice)}
                  onChangeText={(value) => updateItem(item.key, { unitPrice: Math.max(0, Number(formatNumberInput(value)) || 0) })}
                />
              </View>

              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.half]}
                  placeholder="Rezerve"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={String(item.reserveQty)}
                  onChangeText={(value) => updateItem(item.key, { reserveQty: Math.max(0, Math.trunc(Number(value) || 0)) })}
                />
                <View style={[styles.priceTypeGroup, styles.half]}>
                  <TouchableOpacity
                    style={[styles.segmentButton, styles.priceTypeOption, item.priceType === 'INVOICED' && styles.segmentButtonActive]}
                    onPress={() => updateItem(item.key, { priceType: 'INVOICED' })}
                  >
                    <Text style={item.priceType === 'INVOICED' ? styles.segmentTextActive : styles.segmentText}>
                      Faturali
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.segmentButton, styles.priceTypeOption, item.priceType === 'WHITE' && styles.segmentButtonActive]}
                    onPress={() => updateItem(item.key, { priceType: 'WHITE' })}
                  >
                    <Text style={item.priceType === 'WHITE' ? styles.segmentTextActive : styles.segmentText}>
                      Beyaz
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TextInput
                style={styles.input}
                placeholder="Satir aciklamasi"
                placeholderTextColor={colors.textMuted}
                value={item.lineDescription}
                onChangeText={(value) => updateItem(item.key, { lineDescription: value })}
              />
              <TextInput
                style={styles.input}
                placeholder="Sorumluluk merkezi"
                placeholderTextColor={colors.textMuted}
                value={item.responsibilityCenter}
                onChangeText={(value) => updateItem(item.key, { responsibilityCenter: value })}
              />
            </View>
          ))}
          {items.length === 0 && <Text style={styles.helper}>Henuz urun eklenmedi.</Text>}
          <Text style={styles.totalText}>Toplam: {formatCurrency(totalAmount)}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Evrak Bilgileri</Text>
          <TextInput
            style={styles.input}
            placeholder="Depo No (or: 1)"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            value={warehouseNo}
            onChangeText={setWarehouseNo}
          />
          <TextInput
            style={styles.input}
            placeholder="Belge No"
            placeholderTextColor={colors.textMuted}
            value={documentNo}
            onChangeText={setDocumentNo}
          />
          <TextInput
            style={styles.input}
            placeholder="Belge Aciklamasi"
            placeholderTextColor={colors.textMuted}
            value={documentDescription}
            onChangeText={setDocumentDescription}
          />
          <TextInput
            style={styles.input}
            placeholder="Not"
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
          />
          {hasInvoiced && (
            <TextInput
              style={styles.input}
              placeholder="Faturali Seri"
              placeholderTextColor={colors.textMuted}
              value={invoicedSeries}
              onChangeText={setInvoicedSeries}
            />
          )}
          {hasWhite && (
            <TextInput
              style={styles.input}
              placeholder="Beyaz Seri"
              placeholderTextColor={colors.textMuted}
              value={whiteSeries}
              onChangeText={setWhiteSeries}
            />
          )}
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, saving && styles.disabledButton]}
          onPress={createOrder}
          disabled={saving}
        >
          <Text style={styles.primaryButtonText}>{saving ? 'Kaydediliyor...' : 'Siparis Olustur'}</Text>
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
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  selectedCustomerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.primaryMuted,
    padding: spacing.md,
  },
  selectedCustomerCopy: { flex: 1, minWidth: 0 },
  selectedCustomerName: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.textStrong },
  selectedCustomerCode: { marginTop: 2, fontFamily: fonts.mono, fontSize: fontSizes.xs, color: colors.primarySoft },
  selectedBalanceBlock: { maxWidth: '44%', alignItems: 'flex-end' },
  selectedBalance: { marginTop: 2, fontFamily: fonts.monoSemibold, fontSize: fontSizes.sm, color: colors.warning },
  lineInsightGrid: { flexDirection: 'row', gap: spacing.xs },
  lineInsight: { flex: 1, minWidth: 0, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted, padding: spacing.sm },
  insightLabel: { fontFamily: fonts.monoSemibold, fontSize: 8, color: colors.textMuted },
  insightValue: { marginTop: 3, fontFamily: fonts.monoMedium, fontSize: 9, color: colors.text },
  lineContext: { fontFamily: fonts.mono, fontSize: 9, lineHeight: 14, color: colors.textMuted },
  sectionGrid: {
    gap: spacing.md,
  },
  sectionGridWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  gridCard: {
    flex: 1,
    minWidth: 0,
  },
  choiceList: {
    gap: spacing.xs,
    maxHeight: 240,
  },
  choiceItem: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  productChoiceItem: {
    padding: spacing.xs,
  },
  choiceItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  choiceTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  productImageWrap: {
    width: 58,
    height: 58,
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  productImagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productImagePlaceholderText: {
    fontFamily: fonts.bold,
    color: colors.textMuted,
    fontSize: fontSizes.md,
  },
  choiceItemActive: {
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
  choiceTitle: {
    fontFamily: fonts.semibold,
    color: colors.text,
    fontSize: fontSizes.sm,
    minWidth: 0,
  },
  choiceMeta: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  productChoicePrice: {
    fontFamily: fonts.bold,
    color: colors.primarySoft,
    fontSize: fontSizes.sm,
    marginTop: spacing.xs,
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
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  summaryPill: {
    flexGrow: 1,
    flexBasis: 120,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  summaryLabel: {
    fontFamily: fonts.medium,
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  summaryValue: {
    fontFamily: fonts.bold,
    color: colors.text,
    fontSize: fontSizes.sm,
    marginTop: 2,
  },
  lineCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  lineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  lineTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.semibold,
    color: colors.text,
    fontSize: fontSizes.sm,
  },
  lineMeta: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  removeText: {
    fontFamily: fonts.medium,
    color: colors.danger,
    fontSize: fontSizes.xs,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  half: {
    flex: 1,
    minWidth: 130,
  },
  halfButton: {
    flex: 1,
    minWidth: 130,
    justifyContent: 'center',
  },
  priceTypeGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  priceTypeOption: {
    flex: 1,
    minWidth: 110,
  },
  segmentButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  segmentButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentText: {
    fontFamily: fonts.semibold,
    color: colors.text,
    fontSize: fontSizes.sm,
  },
  segmentTextActive: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
    fontSize: fontSizes.sm,
  },
  totalText: {
    fontFamily: fonts.bold,
    color: colors.text,
    fontSize: fontSizes.md,
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
    fontSize: fontSizes.md,
  },
});
