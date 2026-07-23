import { useCallback, useEffect, useMemo, useState } from 'react';
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
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';

import { adminApi } from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
import { hapticSuccess } from '../utils/haptics';
import { getStandardPriceListDefinition } from '../utils/priceLists';
import { buildSearchVariants } from '../utils/search';

const formatMoney = (value: any) =>
  `${Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL`;

const formatNumber = (value: any) =>
  Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 });

const toFiniteNumber = (value: any): number | null => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const parseMoneyInput = (value: string): number | null => {
  const raw = String(value || '').replace(/\s+/g, '');
  if (!raw) return null;
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  let normalized = raw;
  if (lastComma !== -1 && lastDot !== -1) {
    const decimal = lastComma > lastDot ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    normalized = raw.replace(new RegExp(`\\${thousands}`, 'g'), '').replace(decimal, '.');
  } else if (lastComma !== -1) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = raw.replace(/,/g, '');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : null;
};

const formatPercent = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return '-';
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}%`;
};

const calculateMargin = (unitPrice?: number | null, cost?: number | null) => {
  const price = Number(unitPrice || 0);
  const base = Number(cost || 0);
  if (!Number.isFinite(price) || !Number.isFinite(base) || base <= 0) return null;
  return ((price / base) - 1) * 100;
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString('tr-TR');
};

const productCode = (product: any) => String(product?.mikroCode || product?.productCode || '').trim();

type DraftQuoteLine = {
  productCode: string;
  productName: string;
  quantity: number;
  unit?: string | null;
  unitPrice?: number | null;
  priceType?: 'INVOICED' | 'WHITE';
  priceSource: 'PRICE_LIST' | 'MANUAL';
  priceListNo?: number | null;
  invoicedPriceListNo?: number | null;
  whitePriceListNo?: number | null;
  customerPriceSource?: 'AGREEMENT' | 'PRICE_LIST';
  invoicedPrice?: number | null;
  whitePrice?: number | null;
  lastSalePrice?: number | null;
  cost?: number | null;
  costLabel?: string | null;
};

const parseCoordinate = (value: string) => {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const PUBLIC_BASE_URL = String(
  process.env.EXPO_PUBLIC_WEB_BASE_URL ||
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    'https://www.bakircilarkampanya.com'
).replace(/\/api\/?$/, '').replace(/\/$/, '');

const resolvePublicUrl = (value?: string | null) => {
  const url = String(value || '').trim();
  if (!url) return null;
  if (/^(https?:|data:)/i.test(url)) return url;
  return `${PUBLIC_BASE_URL}${url.startsWith('/') ? url : `/${url}`}`;
};

function MiniMetric({ label, value, tone }: { label: string; value: string | number; tone?: 'red' | 'amber' | 'green' }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text
        style={[
          styles.metricValue,
          tone === 'red' && styles.textDanger,
          tone === 'amber' && styles.textWarning,
          tone === 'green' && styles.textSuccess,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

export function FieldSalesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const route = useRoute() as { params?: { customerIdOrCode?: string } };
  const { width } = useWindowDimensions();
  const isCompactPhone = width < 390;

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [snapshot, setSnapshot] = useState<any | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  const [productSearch, setProductSearch] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [safeMode, setSafeMode] = useState(true);
  const [quoteDraft, setQuoteDraft] = useState<DraftQuoteLine[]>([]);

  const [note, setNote] = useState('');
  const [demand, setDemand] = useState('');
  const [competitorInfo, setCompetitorInfo] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [latitudeText, setLatitudeText] = useState('');
  const [longitudeText, setLongitudeText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [visitName, setVisitName] = useState('');
  const [visitPhone, setVisitPhone] = useState('');
  const [visitNote, setVisitNote] = useState('');
  const [visitDemand, setVisitDemand] = useState('');
  const [visitCompetitor, setVisitCompetitor] = useState('');
  const [visitPhotoUrl, setVisitPhotoUrl] = useState<string | null>(null);
  const [visitLatitudeText, setVisitLatitudeText] = useState('');
  const [visitLongitudeText, setVisitLongitudeText] = useState('');
  const [visitSaving, setVisitSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState<'note' | 'visit' | null>(null);
  const [locationLoading, setLocationLoading] = useState<'note' | 'visit' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const customerKey = selectedCustomer?.id || selectedCustomer?.mikroCariCode || snapshot?.customer?.id || snapshot?.customer?.mikroCariCode || '';

  const snapshotMetrics = useMemo(() => {
    const summary = snapshot?.summary || {};
    return [
      { label: 'Bakiye', value: formatMoney(summary.balance), tone: Number(summary.balance || 0) > 0 ? ('amber' as const) : undefined },
      { label: 'Acik Siparis', value: summary.openOrderCount || 0 },
      { label: 'Acik Teklif', value: summary.openQuoteCount || 0 },
      { label: 'Sepet', value: summary.cartItemCount || 0, tone: Number(summary.cartItemCount || 0) > 0 ? ('green' as const) : undefined },
    ];
  }, [snapshot]);

  const searchCustomers = useCallback(async () => {
    if (customerLoading) return;
    const term = customerSearch.trim();
    setCustomerLoading(true);
    setError(null);
    try {
      const result = await adminApi.searchFieldSalesCustomers({ search: term || undefined, limit: 25 });
      setCustomerResults(result.customers || []);
    } catch (err: any) {
      setCustomerResults([]);
      setError(getApiErrorMessage(err, 'Cari aramasi yapilamadi.'));
    } finally {
      setCustomerLoading(false);
    }
  }, [customerLoading, customerSearch]);

  const loadCustomerSnapshot = useCallback(async (customerIdOrCode: string) => {
    if (snapshotLoading) return;
    const key = String(customerIdOrCode || '').trim();
    if (!key) return;
    setSnapshotLoading(true);
    setError(null);
    try {
      const result = await adminApi.getFieldSalesCustomer(key);
      setSnapshot(result.data || null);
      setSelectedCustomer(result.data?.customer || selectedCustomer);
    } catch (err: any) {
      setSnapshot(null);
      setError(getApiErrorMessage(err, 'Cari bilgileri alinamadi.'));
    } finally {
      setSnapshotLoading(false);
    }
  }, [selectedCustomer, snapshotLoading]);

  const selectCustomer = (customer: any) => {
    setSelectedCustomer(customer);
    setCustomerSearch(customer.displayTitle || customer.mikroCariCode || '');
    setCustomerResults([]);
    loadCustomerSnapshot(customer.id || customer.mikroCariCode);
  };

  const searchProducts = useCallback(async () => {
    if (productsLoading) return;
    const term = productSearch.trim();
    if (term.length < 2) {
      Alert.alert('Arama', 'En az 2 karakter yazin.');
      return;
    }
    setProductsLoading(true);
    setError(null);
    try {
      const result = await adminApi.searchFieldSalesProducts({
        search: term,
        customerId: customerKey || undefined,
        limit: 40,
        safeMode,
      });
      const byKey = new Map<string, any>();
      (result.products || []).forEach((product: any) => {
        const key = productCode(product) || String(product?.id || product?.name || byKey.size);
        byKey.set(key, product);
      });

      if (term.length >= 3 && byKey.size < 5) {
        const variants = buildSearchVariants(term, 5).filter((variant) => variant !== term);
        for (const variant of variants) {
          const retry = await adminApi.searchFieldSalesProducts({
            search: variant,
            customerId: customerKey || undefined,
            limit: 40,
            safeMode,
          });
          (retry.products || []).forEach((product: any) => {
            const key = productCode(product) || String(product?.id || product?.name || byKey.size);
            byKey.set(key, product);
          });
          if (byKey.size >= 20) break;
        }
      }

      setProducts(Array.from(byKey.values()));
    } catch (err: any) {
      setProducts([]);
      setError(getApiErrorMessage(err, 'Urun aramasi yapilamadi.'));
    } finally {
      setProductsLoading(false);
    }
  }, [customerKey, productSearch, productsLoading, safeMode]);

  const loadProductDetail = async (product: any) => {
    const code = productCode(product);
    if (!code) return;
    setSelectedProduct(product);
    try {
      const result = await adminApi.getFieldSalesProduct(code, {
        customerId: customerKey || undefined,
        safeMode,
      });
      setSelectedProduct(result.data?.product || product);
    } catch {
      setSelectedProduct(product);
    }
  };

  const buildDraftLine = (product: any): DraftQuoteLine | null => {
    const code = productCode(product);
    if (!code) return null;
    const productName = product.name || product.productName || code;
    const customerPrice = product.customerPrice || {};
    const lastSales = customerPrice.lastSales || product.lastSales || [];
    const invoicedPrice = toFiniteNumber(customerPrice.invoiced);
    const whitePrice = toFiniteNumber(customerPrice.white);
    const invoicedPriceListNo = toFiniteNumber(customerPrice.priceListNo);
    const whitePriceListNo = toFiniteNumber(customerPrice.whitePriceListNo);
    const lastSalePrice = toFiniteNumber(lastSales?.[0]?.unitPrice);
    const costInfo = product.cost || {};
    const cost =
      toFiniteNumber(costInfo.currentCostVatIncluded) ??
      toFiniteNumber(costInfo.currentCost) ??
      toFiniteNumber(costInfo.lastEntryCostVatIncluded) ??
      toFiniteNumber(costInfo.lastEntryCost) ??
      null;
    const unitPrice = invoicedPrice && invoicedPrice > 0
      ? invoicedPrice
      : whitePrice && whitePrice > 0
        ? whitePrice
        : lastSalePrice && lastSalePrice > 0
          ? lastSalePrice
          : null;
    const priceType: 'INVOICED' | 'WHITE' =
      invoicedPrice && invoicedPrice > 0
        ? 'INVOICED'
        : whitePrice && whitePrice > 0
          ? 'WHITE'
          : 'INVOICED';
    const selectedListNo =
      priceType === 'WHITE' ? whitePriceListNo : invoicedPriceListNo;
    const selectedDefinition = getStandardPriceListDefinition(selectedListNo);
    const isAgreement = customerPrice.source === 'AGREEMENT';
    const isValidListPrice =
      !isAgreement &&
      selectedDefinition?.type ===
        (priceType === 'WHITE' ? 'RETAIL' : 'INVOICED');

    return {
      productCode: code,
      productName,
      quantity: 1,
      unit: product.unit,
      unitPrice,
      priceType,
      priceSource: isValidListPrice ? 'PRICE_LIST' : 'MANUAL',
      priceListNo: isValidListPrice ? selectedListNo : null,
      invoicedPriceListNo,
      whitePriceListNo,
      customerPriceSource:
        customerPrice.source === 'AGREEMENT' ? 'AGREEMENT' : 'PRICE_LIST',
      invoicedPrice,
      whitePrice,
      lastSalePrice,
      cost,
      costLabel: costInfo.currentCostVatIncluded || costInfo.currentCost ? 'Guncel maliyet' : cost ? 'Son giris' : null,
    };
  };

  const addProductToDraft = (product: any) => {
    const draftLine = buildDraftLine(product);
    if (!draftLine) {
      Alert.alert('Urun kodu yok', 'Bu urun teklif havuzuna eklenemedi.');
      return;
    }
    setQuoteDraft((current) => {
      const existing = current.find((line) => line.productCode === draftLine.productCode);
      if (existing) {
        return current.map((line) => (
          line.productCode === draftLine.productCode ? { ...line, quantity: Math.round((line.quantity + 1) * 100) / 100 } : line
        ));
      }
      return [...current, draftLine];
    });
    hapticSuccess();
  };

  const updateDraftQuantity = (code: string, nextQuantity: number) => {
    const safeQuantity = Number.isFinite(nextQuantity) && nextQuantity > 0 ? Math.round(nextQuantity * 100) / 100 : 1;
    setQuoteDraft((current) => current.map((line) => (line.productCode === code ? { ...line, quantity: safeQuantity } : line)));
  };

  const removeDraftLine = (code: string) => {
    setQuoteDraft((current) => current.filter((line) => line.productCode !== code));
  };

  const updateDraftPrice = (code: string, value: string) => {
    const nextPrice = parseMoneyInput(value);
    setQuoteDraft((current) => current.map((line) => (
      line.productCode === code
        ? {
            ...line,
            unitPrice: nextPrice ?? 0,
            priceType: line.priceType || 'INVOICED',
            priceSource: 'MANUAL',
            priceListNo: null,
          }
        : line
    )));
  };

  const applyDraftPrice = (code: string, priceType: 'INVOICED' | 'WHITE' | 'LAST_SALE') => {
    setQuoteDraft((current) => current.map((line) => {
      if (line.productCode !== code) return line;
      const nextPrice =
        priceType === 'WHITE'
          ? line.whitePrice
          : priceType === 'LAST_SALE'
            ? line.lastSalePrice
            : line.invoicedPrice;
      if (!nextPrice || nextPrice <= 0) return line;
      const nextPriceType = priceType === 'WHITE' ? 'WHITE' : 'INVOICED';
      const nextListNo =
        nextPriceType === 'WHITE'
          ? line.whitePriceListNo
          : line.invoicedPriceListNo;
      const listDefinition = getStandardPriceListDefinition(nextListNo);
      const isListPrice =
        priceType !== 'LAST_SALE' &&
        line.customerPriceSource !== 'AGREEMENT' &&
        listDefinition?.type ===
          (nextPriceType === 'WHITE' ? 'RETAIL' : 'INVOICED');
      return {
        ...line,
        unitPrice: nextPrice,
        priceType: nextPriceType,
        priceSource: isListPrice ? 'PRICE_LIST' : 'MANUAL',
        priceListNo: isListPrice ? nextListNo : null,
      };
    }));
  };

  const openQuoteWithDraft = () => {
    if (!customerKey) {
      Alert.alert('Cari secin', 'Teklif icin once cari secin.');
      return;
    }
    if (quoteDraft.length === 0) {
      Alert.alert('Teklif havuzu', 'Teklife aktarilacak urun yok.');
      return;
    }
    navigation.navigate('QuoteCreate', {
      customerIdOrCode: customerKey,
      productPrefills: quoteDraft.map((line) => ({
        productCode: line.productCode,
        productName: line.productName,
        quantity: line.quantity,
        unitPrice: line.unitPrice || undefined,
        priceType: line.priceType,
        priceSource: line.priceSource,
        priceListNo:
          line.priceSource === 'PRICE_LIST'
            ? line.priceListNo || undefined
            : undefined,
      })),
    });
  };

  const pickVisitPhoto = async (target: 'note' | 'visit') => {
    if (photoUploading) return;
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: 'image/*',
    });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    if (asset.mimeType && !asset.mimeType.startsWith('image/')) {
      Alert.alert('Dosya Tipi', 'Lutfen bir gorsel dosyasi secin.');
      return;
    }
    if (asset.size && asset.size > 5 * 1024 * 1024) {
      Alert.alert('Dosya Boyutu', 'Gorsel 5MB altinda olmali.');
      return;
    }

    const formData = new FormData();
    formData.append('image', {
      uri: asset.uri,
      name: asset.name || 'field-sales-visit.jpg',
      type: asset.mimeType || 'image/jpeg',
    } as any);

    setPhotoUploading(target);
    try {
      const response = await adminApi.uploadFieldSalesVisitPhoto(formData);
      if (target === 'note') {
        setPhotoUrl(response.imageUrl);
      } else {
        setVisitPhotoUrl(response.imageUrl);
      }
    } catch (err: any) {
      Alert.alert('Foto Yuklenemedi', getApiErrorMessage(err, 'Gorsel yuklenemedi.'));
    } finally {
      setPhotoUploading(null);
    }
  };

  const fillCurrentLocation = async (target: 'note' | 'visit') => {
    if (locationLoading) return;
    setLocationLoading(target);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        Alert.alert('Konum izni', 'Konum eklemek icin cihaz konum iznini acmalisiniz.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const latitude = position.coords.latitude.toFixed(6);
      const longitude = position.coords.longitude.toFixed(6);
      if (target === 'note') {
        setLatitudeText(latitude);
        setLongitudeText(longitude);
      } else {
        setVisitLatitudeText(latitude);
        setVisitLongitudeText(longitude);
      }
      hapticSuccess();
    } catch (err: any) {
      Alert.alert('Konum alinamadi', getApiErrorMessage(err, 'Cihaz konumu okunamadi.'));
    } finally {
      setLocationLoading(null);
    }
  };

  const saveVisitNote = async () => {
    if (noteSaving) return;
    if (!customerKey) {
      Alert.alert('Cari secin', 'Ziyaret notu icin once cari secilmeli.');
      return;
    }
    if (!note.trim()) {
      Alert.alert('Not gerekli', 'Ziyaret notu bos olamaz.');
      return;
    }
    setNoteSaving(true);
    try {
      await adminApi.createFieldSalesVisitNote(customerKey, {
        note: note.trim(),
        demand: demand.trim() || null,
        competitorInfo: competitorInfo.trim() || null,
        photoUrl,
        latitude: parseCoordinate(latitudeText),
        longitude: parseCoordinate(longitudeText),
      });
      setNote('');
      setDemand('');
      setCompetitorInfo('');
      setPhotoUrl(null);
      setLatitudeText('');
      setLongitudeText('');
      hapticSuccess();
      await loadCustomerSnapshot(customerKey);
    } catch (err: any) {
      Alert.alert('Not kaydedilemedi', getApiErrorMessage(err, 'Islem tamamlanamadi.'));
    } finally {
      setNoteSaving(false);
    }
  };

  const createVisitCustomer = async () => {
    if (visitSaving) return;
    if (!visitName.trim()) {
      Alert.alert('Cari adi gerekli', 'Yeni ziyaret carisi icin unvan girin.');
      return;
    }
    setVisitSaving(true);
    try {
      const result = await adminApi.createFieldSalesVisitCustomer({
        customerName: visitName.trim(),
        phone: visitPhone.trim() || null,
        note: visitNote.trim() || null,
        demand: visitDemand.trim() || null,
        competitorInfo: visitCompetitor.trim() || null,
        photoUrl: visitPhotoUrl,
        latitude: parseCoordinate(visitLatitudeText),
        longitude: parseCoordinate(visitLongitudeText),
      });
      const customer = result.data?.customer;
      setVisitName('');
      setVisitPhone('');
      setVisitNote('');
      setVisitDemand('');
      setVisitCompetitor('');
      setVisitPhotoUrl(null);
      setVisitLatitudeText('');
      setVisitLongitudeText('');
      hapticSuccess();
      if (customer?.id || customer?.mikroCariCode) {
        await loadCustomerSnapshot(customer.id || customer.mikroCariCode);
      }
    } catch (err: any) {
      Alert.alert('Ziyaret carisi', getApiErrorMessage(err, 'Ziyaret carisi acilamadi.'));
    } finally {
      setVisitSaving(false);
    }
  };

  useEffect(() => {
    if (route.params?.customerIdOrCode) {
      loadCustomerSnapshot(route.params.customerIdOrCode);
    } else {
      searchCustomers();
    }
  }, []);

  const renderProduct = (product: any) => {
    const customerPrice = product.customerPrice || {};
    const warehouses = product.warehouses || [];
    const code = productCode(product);
    const lastSales = customerPrice.lastSales || product.lastSales || [];
    const productName = product.name || product.productName || '-';
    const imageUri = resolvePublicUrl(product.imageUrl);

    return (
      <TouchableOpacity
        key={code || product.name}
        style={[styles.productCard, isCompactPhone && styles.productCardCompact]}
        onPress={() => loadProductDetail(product)}
      >
        <View style={styles.productHeaderRow}>
          <View style={[styles.productThumb, isCompactPhone && styles.productThumbCompact]}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.productThumbImage} resizeMode="contain" />
            ) : (
              <Text style={styles.productThumbText}>IMG</Text>
            )}
          </View>
          <View style={styles.productTitleBlock}>
            <Text
              style={[styles.productTitle, isCompactPhone && styles.productTitleCompact]}
              numberOfLines={isCompactPhone ? 4 : 5}
              ellipsizeMode="tail"
            >
              {productName}
            </Text>
            <Text style={styles.productCode} numberOfLines={1} ellipsizeMode="middle">{code || '-'}</Text>
          </View>
        </View>
        <View style={styles.productMetaGrid}>
          <Text style={styles.metaPill} numberOfLines={1}>Stok {formatNumber(product.totalSellable ?? product.totalStock)}</Text>
          <Text style={styles.metaPill} numberOfLines={1}>Birim {product.unit || '-'}</Text>
          {!!product.categoryName && <Text style={styles.metaPill} numberOfLines={1} ellipsizeMode="tail">{product.categoryName}</Text>}
        </View>
        <View style={[styles.priceRow, isCompactPhone && styles.priceRowCompact]}>
          <View style={styles.priceBox}>
            <Text style={styles.priceLabel}>Faturali</Text>
            <Text style={styles.priceValue}>{formatMoney(customerPrice.invoiced)}</Text>
          </View>
          <View style={styles.priceBox}>
            <Text style={styles.priceLabel}>Beyaz</Text>
            <Text style={styles.priceValue}>{formatMoney(customerPrice.white)}</Text>
          </View>
        </View>
        {warehouses.length > 0 && (
          <View style={styles.warehouseRow}>
            {warehouses.slice(0, 4).map((warehouse: any) => (
              <Text key={warehouse.key || warehouse.no} style={styles.warehousePill} numberOfLines={1} ellipsizeMode="tail">
                {warehouse.label}: {formatNumber(warehouse.sellable ?? warehouse.stock)}
              </Text>
            ))}
          </View>
        )}
        {lastSales.length > 0 && (
          <View style={styles.lastSalesBox}>
            <Text style={styles.subsectionTitle}>Son satis</Text>
            {lastSales.slice(0, 3).map((sale: any) => (
              <Text key={`${sale.documentNo}-${sale.saleDate}`} style={styles.smallText} numberOfLines={1} ellipsizeMode="tail">
                {formatDate(sale.saleDate)} - {formatNumber(sale.quantity)} {product.unit || ''} - {formatMoney(sale.unitPrice)}
              </Text>
            ))}
          </View>
        )}
        {customerKey ? (
          <View style={styles.productActionRow}>
            <TouchableOpacity
              style={[styles.productDraftButton, isCompactPhone && styles.productActionButtonCompact]}
              onPress={(event) => {
                event.stopPropagation();
                addProductToDraft(product);
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={styles.productDraftButtonText}>Havuza Ekle</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.productQuoteButton, isCompactPhone && styles.productActionButtonCompact]}
              onPress={(event) => {
                event.stopPropagation();
                const draftLine = buildDraftLine(product);
                navigation.navigate('QuoteCreate', {
                  customerIdOrCode: customerKey,
                  productPrefills: code
                    ? [{
                        productCode: code,
                        productName,
                        quantity: 1,
                        unitPrice: draftLine?.unitPrice || undefined,
                        priceType: draftLine?.priceType,
                        priceSource: draftLine?.priceSource,
                        priceListNo:
                          draftLine?.priceSource === 'PRICE_LIST'
                            ? draftLine.priceListNo || undefined
                            : undefined,
                      }]
                    : undefined,
                });
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={styles.productQuoteButtonText}>Teklife Ekle</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderQuoteDraft = () => {
    if (!customerKey || quoteDraft.length === 0) return null;
    const totalAmount = quoteDraft.reduce(
      (sum, line) => sum + Number(line.unitPrice || 0) * Number(line.quantity || 0),
      0
    );
    const marginRows = quoteDraft
      .map((line) => ({
        profit: line.cost && line.cost > 0 ? (Number(line.unitPrice || 0) - line.cost) * Number(line.quantity || 0) : null,
        margin: calculateMargin(line.unitPrice, line.cost),
      }))
      .filter((row) => row.profit !== null && row.margin !== null);
    const grossProfit = marginRows.reduce((sum, row) => sum + Number(row.profit || 0), 0);
    const avgMargin = marginRows.length
      ? marginRows.reduce((sum, row) => sum + Number(row.margin || 0), 0) / marginRows.length
      : null;

    return (
      <View style={styles.quoteDraftBox}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.flex}>
            <Text style={styles.subsectionTitle}>Teklif Havuzu</Text>
            <Text style={styles.smallText}>{quoteDraft.length} urun secildi; miktarlari buradan duzenleyip tek seferde teklif ekranina aktar.</Text>
          </View>
          <TouchableOpacity style={styles.ghostButton} onPress={() => setQuoteDraft([])}>
            <Text style={styles.ghostButtonText}>Temizle</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.draftSummaryRow}>
          <View style={styles.draftSummaryBox}>
            <Text style={styles.priceLabel}>Tahmini Toplam</Text>
            <Text style={styles.priceValue}>{formatMoney(totalAmount)}</Text>
          </View>
          {!safeMode && (
            <View style={styles.draftSummaryBox}>
              <Text style={styles.priceLabel}>Kar / Marj</Text>
              <Text style={styles.priceValue}>{formatMoney(grossProfit)} / {formatPercent(avgMargin)}</Text>
            </View>
          )}
        </View>
        {quoteDraft.map((line) => (
          <View key={line.productCode} style={styles.draftLine}>
            <View style={styles.flex}>
              <Text style={styles.draftTitle} numberOfLines={2} ellipsizeMode="tail">{line.productName}</Text>
              <Text style={styles.smallText} numberOfLines={1} ellipsizeMode="middle">{line.productCode} {line.unit ? `- ${line.unit}` : ''}</Text>
              <View style={styles.draftPriceChips}>
                {!!line.invoicedPrice && line.invoicedPrice > 0 && (
                  <TouchableOpacity style={styles.priceChip} onPress={() => applyDraftPrice(line.productCode, 'INVOICED')}>
                    <Text style={styles.priceChipText}>Faturali {formatMoney(line.invoicedPrice)}</Text>
                  </TouchableOpacity>
                )}
                {!!line.whitePrice && line.whitePrice > 0 && (
                  <TouchableOpacity style={styles.priceChip} onPress={() => applyDraftPrice(line.productCode, 'WHITE')}>
                    <Text style={styles.priceChipText}>Beyaz {formatMoney(line.whitePrice)}</Text>
                  </TouchableOpacity>
                )}
                {!!line.lastSalePrice && line.lastSalePrice > 0 && (
                  <TouchableOpacity style={styles.priceChip} onPress={() => applyDraftPrice(line.productCode, 'LAST_SALE')}>
                    <Text style={styles.priceChipText}>Son satis {formatMoney(line.lastSalePrice)}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <View style={styles.draftEditGrid}>
              <View style={styles.draftEditCell}>
                <Text style={styles.priceLabel}>Birim fiyat</Text>
                <TextInput
                  style={styles.priceInput}
                  value={line.unitPrice ? String(line.unitPrice) : ''}
                  onChangeText={(value) => updateDraftPrice(line.productCode, value)}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={styles.draftEditCell}>
                <Text style={styles.priceLabel}>Satir toplam</Text>
                <Text style={styles.draftTotalText}>{formatMoney(Number(line.unitPrice || 0) * Number(line.quantity || 0))}</Text>
              </View>
            </View>
            {!safeMode && line.cost && line.cost > 0 && (
              <Text style={styles.marginText}>
                {line.costLabel || 'Maliyet'} {formatMoney(line.cost)} - Marj {formatPercent(calculateMargin(line.unitPrice, line.cost))}
              </Text>
            )}
            <View style={styles.quantityControl}>
              <TouchableOpacity style={styles.quantityButton} onPress={() => updateDraftQuantity(line.productCode, line.quantity - 1)}>
                <Text style={styles.quantityButtonText}>-</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.quantityInput}
                value={String(line.quantity)}
                onChangeText={(value) => updateDraftQuantity(line.productCode, Number(value.replace(',', '.')))}
                keyboardType="decimal-pad"
              />
              <TouchableOpacity style={styles.quantityButton} onPress={() => updateDraftQuantity(line.productCode, line.quantity + 1)}>
                <Text style={styles.quantityButtonText}>+</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.ghostButton} onPress={() => removeDraftLine(line.productCode)}>
              <Text style={styles.ghostButtonText}>Sil</Text>
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={styles.primaryButton} onPress={openQuoteWithDraft}>
          <Text style={styles.primaryButtonText}>Havuzu Teklife Aktar</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>Saha Operasyonu</Text>
          <Text style={styles.heroTitle}>Saha Satis</Text>
          <Text style={styles.heroSubtitle}>Cari odakli urun arama, fiyat/stok kontrolu, ziyaret notu ve teklif havuzu.</Text>
          <View style={styles.heroMetricRow}>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{selectedCustomer ? 'Secili' : 'Yok'}</Text>
              <Text style={styles.heroMetricLabel}>Cari</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{products.length}</Text>
              <Text style={styles.heroMetricLabel}>Urun</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{quoteDraft.length}</Text>
              <Text style={styles.heroMetricLabel}>Teklif</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cari Secimi</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.input}
              placeholder="Cari kodu, unvan, sehir"
              placeholderTextColor={colors.textMuted}
              value={customerSearch}
              onChangeText={setCustomerSearch}
              onSubmitEditing={searchCustomers}
            />
            <TouchableOpacity
              style={[styles.searchButton, isCompactPhone && styles.searchButtonCompact, customerLoading && styles.buttonDisabled]}
              onPress={searchCustomers}
              disabled={customerLoading}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={styles.searchButtonText}>{customerLoading ? '...' : 'Ara'}</Text>
            </TouchableOpacity>
          </View>
          {customerResults.map((customer) => (
            <TouchableOpacity key={customer.id || customer.mikroCariCode} style={styles.customerResult} onPress={() => selectCustomer(customer)}>
              <Text style={styles.customerTitle} numberOfLines={2} ellipsizeMode="tail">
                {customer.displayTitle || customer.displayName || customer.mikroName || customer.name}
              </Text>
              <Text style={styles.smallText} numberOfLines={1} ellipsizeMode="middle">
                {customer.mikroCariCode || '-'} {customer.sectorCode ? `- ${customer.sectorCode}` : ''} {customer.city ? `- ${customer.city}` : ''}
              </Text>
            </TouchableOpacity>
          ))}
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.visitCreateBox}>
            <Text style={styles.subsectionTitle}>Yeni Ziyaret Carisi</Text>
            <TextInput
              style={styles.input}
              placeholder="Unvan"
              placeholderTextColor={colors.textMuted}
              value={visitName}
              onChangeText={setVisitName}
            />
            <TextInput
              style={styles.input}
              placeholder="Telefon"
              placeholderTextColor={colors.textMuted}
              value={visitPhone}
              onChangeText={setVisitPhone}
              keyboardType="phone-pad"
            />
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Not"
              placeholderTextColor={colors.textMuted}
              value={visitNote}
              onChangeText={setVisitNote}
              multiline
            />
            <TextInput
              style={styles.input}
              placeholder="Talep"
              placeholderTextColor={colors.textMuted}
              value={visitDemand}
              onChangeText={setVisitDemand}
            />
            <TextInput
              style={styles.input}
              placeholder="Rakip / mevcut kullandigi urun"
              placeholderTextColor={colors.textMuted}
              value={visitCompetitor}
              onChangeText={setVisitCompetitor}
            />
            <View style={styles.inlineActionRow}>
              <TouchableOpacity
                style={[styles.secondaryButton, Boolean(photoUploading) && styles.buttonDisabled]}
                onPress={() => pickVisitPhoto('visit')}
                disabled={Boolean(photoUploading)}
              >
                <Text style={styles.secondaryButtonText}>
                  {photoUploading === 'visit' ? 'Yukleniyor...' : visitPhotoUrl ? 'Foto Degistir' : 'Foto Ekle'}
                </Text>
              </TouchableOpacity>
              {visitPhotoUrl ? (
                <TouchableOpacity style={styles.ghostButton} onPress={() => setVisitPhotoUrl(null)}>
                  <Text style={styles.ghostButtonText}>Kaldir</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {visitPhotoUrl ? <Text style={styles.successText}>Foto eklendi</Text> : null}
            <View style={styles.searchRow}>
              <TextInput
                style={styles.input}
                placeholder="Enlem"
                placeholderTextColor={colors.textMuted}
                value={visitLatitudeText}
                onChangeText={setVisitLatitudeText}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={styles.input}
                placeholder="Boylam"
                placeholderTextColor={colors.textMuted}
                value={visitLongitudeText}
                onChangeText={setVisitLongitudeText}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inlineActionRow}>
              <TouchableOpacity
                style={[styles.secondaryButton, Boolean(locationLoading) && styles.buttonDisabled]}
                onPress={() => fillCurrentLocation('visit')}
                disabled={Boolean(locationLoading)}
              >
                <Text style={styles.secondaryButtonText}>
                  {locationLoading === 'visit' ? 'Konum aliniyor...' : 'Mevcut Konumu Al'}
                </Text>
              </TouchableOpacity>
              {(visitLatitudeText || visitLongitudeText) ? (
                <TouchableOpacity
                  style={styles.ghostButton}
                  onPress={() => {
                    setVisitLatitudeText('');
                    setVisitLongitudeText('');
                  }}
                >
                  <Text style={styles.ghostButtonText}>Konumu Temizle</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity
              style={[styles.primaryButton, visitSaving && styles.buttonDisabled]}
              onPress={createVisitCustomer}
              disabled={visitSaving}
            >
              <Text style={styles.primaryButtonText}>{visitSaving ? 'Aciliyor...' : 'Ziyaret Carisi Ac'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {snapshotLoading && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {snapshot?.customer && (
          <View style={styles.customerCard}>
            <Text style={styles.customerName} numberOfLines={2} ellipsizeMode="tail">{snapshot.customer.displayTitle || snapshot.customer.mikroCariCode}</Text>
            <Text style={styles.customerMeta} numberOfLines={1} ellipsizeMode="middle">
              {snapshot.customer.mikroCariCode || '-'} {snapshot.customer.sectorCode ? `- ${snapshot.customer.sectorCode}` : ''}
            </Text>
            <View style={styles.metricGrid}>
              {snapshotMetrics.map((metric) => (
                <MiniMetric key={metric.label} label={metric.label} value={metric.value} tone={metric.tone} />
              ))}
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('QuoteCreate', { customerIdOrCode: customerKey })}>
                <Text style={styles.secondaryButtonText}>Teklif Ac</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('Customer360', { customerIdOrCode: customerKey })}>
                <Text style={styles.secondaryButtonText}>Cari 360</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('CustomerDetail', { customerId: snapshot.customer.id })}>
                <Text style={styles.secondaryButtonText}>Cari Detay</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Urun Arama</Text>
            <TouchableOpacity
              style={[styles.modeChip, !safeMode && styles.modeChipActive]}
              onPress={() => setSafeMode((value) => !value)}
            >
              <Text style={!safeMode ? styles.modeChipTextActive : styles.modeChipText}>
                {safeMode ? 'Maliyet gizli' : 'Maliyet acik'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.input}
              placeholder="Stok kodu veya urun adi"
              placeholderTextColor={colors.textMuted}
              value={productSearch}
              onChangeText={setProductSearch}
              onSubmitEditing={searchProducts}
            />
            <TouchableOpacity
              style={[styles.searchButton, isCompactPhone && styles.searchButtonCompact, productsLoading && styles.buttonDisabled]}
              onPress={searchProducts}
              disabled={productsLoading}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={styles.searchButtonText}>{productsLoading ? '...' : 'Ara'}</Text>
            </TouchableOpacity>
          </View>
          {renderQuoteDraft()}
          {productsLoading ? <ActivityIndicator color={colors.primary} /> : products.map(renderProduct)}
        </View>

        {selectedProduct && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Secili Urun</Text>
            {renderProduct(selectedProduct)}
          </View>
        )}

        {snapshot?.customer && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Firsatlar ve Ziyaret Notu</Text>
            {(snapshot.opportunities?.stalePurchased || []).slice(0, 4).map((item: any) => (
              <View key={`stale-${item.productCode}`} style={styles.opportunityCard}>
                <Text style={styles.opportunityTitle} numberOfLines={2} ellipsizeMode="tail">{item.productName || item.productCode}</Text>
                <Text style={styles.smallText}>{item.reason || 'Tekrar takip edilebilir.'}</Text>
              </View>
            ))}
            {(snapshot.opportunities?.similarSector || []).slice(0, 4).map((item: any) => (
              <View key={`similar-${item.productCode}`} style={styles.opportunityCard}>
                <Text style={styles.opportunityTitle} numberOfLines={2} ellipsizeMode="tail">{item.productName || item.productCode}</Text>
                <Text style={styles.smallText}>{item.reason || 'Benzer cariler aliyor.'}</Text>
              </View>
            ))}
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Ziyaret notu"
              placeholderTextColor={colors.textMuted}
              value={note}
              onChangeText={setNote}
              multiline
            />
            <TextInput
              style={styles.input}
              placeholder="Talep / ihtiyac"
              placeholderTextColor={colors.textMuted}
              value={demand}
              onChangeText={setDemand}
            />
            <TextInput
              style={styles.input}
              placeholder="Rakip / piyasa bilgisi"
              placeholderTextColor={colors.textMuted}
              value={competitorInfo}
              onChangeText={setCompetitorInfo}
            />
            <View style={styles.inlineActionRow}>
              <TouchableOpacity
                style={[styles.secondaryButton, Boolean(photoUploading) && styles.buttonDisabled]}
                onPress={() => pickVisitPhoto('note')}
                disabled={Boolean(photoUploading)}
              >
                <Text style={styles.secondaryButtonText}>
                  {photoUploading === 'note' ? 'Yukleniyor...' : photoUrl ? 'Foto Degistir' : 'Foto Ekle'}
                </Text>
              </TouchableOpacity>
              {photoUrl ? (
                <TouchableOpacity style={styles.ghostButton} onPress={() => setPhotoUrl(null)}>
                  <Text style={styles.ghostButtonText}>Kaldir</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {photoUrl ? <Text style={styles.successText}>Foto eklendi</Text> : null}
            <View style={styles.searchRow}>
              <TextInput
                style={styles.input}
                placeholder="Enlem"
                placeholderTextColor={colors.textMuted}
                value={latitudeText}
                onChangeText={setLatitudeText}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={styles.input}
                placeholder="Boylam"
                placeholderTextColor={colors.textMuted}
                value={longitudeText}
                onChangeText={setLongitudeText}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inlineActionRow}>
              <TouchableOpacity
                style={[styles.secondaryButton, Boolean(locationLoading) && styles.buttonDisabled]}
                onPress={() => fillCurrentLocation('note')}
                disabled={Boolean(locationLoading)}
              >
                <Text style={styles.secondaryButtonText}>
                  {locationLoading === 'note' ? 'Konum aliniyor...' : 'Mevcut Konumu Al'}
                </Text>
              </TouchableOpacity>
              {(latitudeText || longitudeText) ? (
                <TouchableOpacity
                  style={styles.ghostButton}
                  onPress={() => {
                    setLatitudeText('');
                    setLongitudeText('');
                  }}
                >
                  <Text style={styles.ghostButtonText}>Konumu Temizle</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity
              style={[styles.primaryButton, noteSaving && styles.buttonDisabled]}
              onPress={saveVisitNote}
              disabled={noteSaving}
            >
              <Text style={styles.primaryButtonText}>{noteSaving ? 'Kaydediliyor' : 'Notu Kaydet'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.xl, gap: spacing.md },
  flex: { flex: 1 },
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
  heroTitle: { fontFamily: fonts.bold, fontSize: fontSizes.xxl, color: '#FFFFFF', marginTop: spacing.xs },
  heroSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    lineHeight: fontSizes.sm + 5,
    color: '#DDE8FF',
    marginTop: spacing.xs,
  },
  heroMetricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  heroMetric: {
    flexGrow: 1,
    flexBasis: 96,
    minWidth: 92,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(221,232,255,0.22)',
    padding: spacing.sm,
  },
  heroMetricValue: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: '#FFFFFF' },
  heroMetricLabel: { marginTop: 2, fontFamily: fonts.medium, fontSize: fontSizes.xs, color: '#BFD7FF' },
  section: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, alignItems: 'center' },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text },
  subsectionTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  searchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  input: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.regular,
    color: colors.text,
  },
  textArea: { minHeight: 96, textAlignVertical: 'top' },
  searchButton: {
    flexShrink: 0,
    minHeight: 44,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonCompact: {
    width: '100%',
    minHeight: 48,
  },
  searchButtonText: { fontFamily: fonts.semibold, color: '#FFFFFF' },
  customerResult: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  visitCreateBox: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  customerTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.md, lineHeight: fontSizes.md + 5, color: colors.text },
  customerCard: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.xl,
    gap: spacing.md,
    shadowColor: '#071B3A',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  customerName: { fontFamily: fonts.bold, fontSize: fontSizes.xl, lineHeight: fontSizes.xl + 5, color: '#FFFFFF' },
  customerMeta: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: '#DCE8FA' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metricCard: { width: '48%', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  metricLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  metricValue: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text, marginTop: spacing.xs },
  productCard: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    overflow: 'hidden',
  },
  productCardCompact: {
    padding: spacing.sm,
    gap: spacing.xs,
  },
  productHeaderRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', minWidth: 0 },
  productThumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  productThumbCompact: {
    width: 48,
    height: 48,
  },
  productThumbImage: { width: '100%', height: '100%' },
  productThumbText: { fontFamily: fonts.bold, fontSize: fontSizes.xs, color: colors.textMuted },
  productTitleBlock: { flex: 1, flexGrow: 1, flexShrink: 1, minWidth: 0, gap: 2 },
  productTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: colors.text,
    lineHeight: 22,
    flexShrink: 1,
    minWidth: 0,
    flexWrap: 'wrap',
  },
  productTitleCompact: {
    fontSize: fontSizes.sm,
    lineHeight: 18,
  },
  productCode: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.primarySoft, flexShrink: 1, minWidth: 0 },
  productMetaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  metaPill: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.text,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
  },
  priceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  priceRowCompact: { flexDirection: 'column' },
  priceBox: { flex: 1, minWidth: 130, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm },
  priceLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  priceValue: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: colors.text },
  warehouseRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  warehousePill: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.primarySoft,
    flexShrink: 1,
    maxWidth: '100%',
  },
  lastSalesBox: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm, gap: 4 },
  productActionRow: { flexDirection: 'row', justifyContent: 'flex-start', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  productDraftButton: {
    flexGrow: 1,
    minWidth: 132,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productDraftButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.primarySoft },
  productQuoteButton: {
    flexGrow: 1,
    minWidth: 132,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productActionButtonCompact: {
    width: '100%',
  },
  productQuoteButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: '#FFFFFF' },
  quoteDraftBox: {
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  draftLine: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  draftTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text, lineHeight: 20 },
  draftSummaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  draftSummaryBox: {
    flex: 1,
    minWidth: 150,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.sm,
  },
  draftPriceChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  priceChip: {
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  priceChipText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.primarySoft },
  draftEditGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  draftEditCell: { flex: 1, minWidth: 130, gap: 4 },
  priceInput: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    color: colors.text,
    fontFamily: fonts.semibold,
  },
  draftTotalText: {
    minHeight: 40,
    textAlignVertical: 'center',
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  marginText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.success,
    lineHeight: 20,
  },
  quantityControl: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  quantityButton: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityButtonText: { fontFamily: fonts.bold, color: '#FFFFFF', fontSize: fontSizes.md },
  quantityInput: {
    width: 76,
    minHeight: 38,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fonts.semibold,
    textAlign: 'center',
  },
  smallText: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.textMuted, lineHeight: 20 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  inlineActionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  secondaryButton: { backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  secondaryButtonText: { fontFamily: fonts.semibold, color: colors.primarySoft },
  ghostButton: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  ghostButtonText: { fontFamily: fonts.semibold, color: colors.textMuted, fontSize: fontSizes.sm },
  modeChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  modeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeChipText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.text },
  modeChipTextActive: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: '#FFFFFF' },
  opportunityCard: { backgroundColor: colors.primaryMuted, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  opportunityTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  primaryButtonText: { fontFamily: fonts.semibold, color: '#FFFFFF' },
  buttonDisabled: { opacity: 0.55 },
  loading: { padding: spacing.lg, alignItems: 'center' },
  error: { fontFamily: fonts.medium, color: colors.danger },
  successText: { fontFamily: fonts.semibold, color: '#059669', fontSize: fontSizes.sm },
  textDanger: { color: colors.danger },
  textWarning: { color: colors.warning },
  textSuccess: { color: '#059669' },
});
