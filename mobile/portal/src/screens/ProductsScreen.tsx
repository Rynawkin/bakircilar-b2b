import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { RouteProp, useRoute } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';

import { ProductImageDto, adminApi } from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { Product } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
import { normalizeSearchText } from '../utils/search';

type QualityFilter = 'ALL' | 'BAD' | 'WARN' | 'NO_IMAGE' | 'GALLERY_MISSING';
type ProductDetailTab = 'SUMMARY' | 'PRICES' | 'STOCK' | 'IMAGE';
const PRODUCT_PAGE_SIZE = 40;

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

const getPositiveNumber = (value?: number | null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const getNumber = (value?: number | null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toLocaleDateString('tr-TR');
};

const formatBytes = (value?: number | null) => {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} KB`;
  return `${(size / (1024 * 1024)).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} MB`;
};

const getPriceListRows = (product: Product) =>
  Object.entries(product.mikroPriceLists || {})
    .map(([listNo, value]) => ({ listNo, value: getNumber(value) }))
    .filter((row) => row.value > 0)
    .sort((a, b) => Number(a.listNo) - Number(b.listNo));

const getWarehouseRows = (stocks?: Record<string, number>) =>
  Object.entries(stocks || {})
    .map(([warehouse, value]) => ({ warehouse, value: getNumber(value) }))
    .sort((a, b) => a.warehouse.localeCompare(b.warehouse, 'tr'));

const getCatalogQuality = (product: Product, gallery?: ProductImageDto[]) => {
  const list1 = getPositiveNumber(product.mikroPriceLists?.['1']);
  const list6 = getPositiveNumber(product.mikroPriceLists?.['6']);
  const hasGalleryDepth = gallery ? gallery.length >= 2 : Boolean(product.imageUrl);
  const checks = [
    { label: 'Ana gorsel', ok: Boolean(product.imageUrl), action: 'Gorsel yukle veya galeriden ana gorsel sec.' },
    { label: 'Galeri derinligi', ok: hasGalleryDepth, action: 'En az iki gorsel ekle.' },
    { label: 'Birim', ok: Boolean(product.unit), action: 'Urun olcu/raf ekranindan birim bilgisini kontrol et.' },
    { label: 'Liste 1 fiyat', ok: list1 > 0, action: 'Fiyat listesini Mikro/B2B fiyat senkronunda kontrol et.' },
    { label: 'Liste 6 fiyat', ok: list6 > 0, action: 'Toptan fiyat listesini kontrol et.' },
    { label: 'Maliyet', ok: getPositiveNumber(product.currentCost) > 0 || getPositiveNumber(product.lastEntryPrice) > 0, action: 'Tedarik maliyetini kontrol et.' },
    { label: 'Stok verisi', ok: getPositiveNumber(product.totalStock) > 0 || product.totalStock === 0, action: 'Stok senkronunu kontrol et.' },
  ];
  const passed = checks.filter((check) => check.ok).length;
  const score = Math.round((passed / checks.length) * 100);
  return {
    score,
    checks,
    missing: checks.filter((check) => !check.ok),
    tone: score >= 85 ? 'good' : score >= 60 ? 'warn' : 'bad',
  };
};

export function ProductsScreen() {
  const route = useRoute<RouteProp<PortalStackParamList, 'Products'>>();
  const { width } = useWindowDimensions();
  const isDiverseyScoped = route.params?.scope === 'DIVERSEY';
  const initialSearch = isDiverseyScoped ? '' : route.params?.search || '';
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pagination, setPagination] = useState<{ page: number; limit: number; total: number; totalPages: number } | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(initialSearch);
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>(route.params?.qualityFilter || 'ALL');
  const [stats, setStats] = useState<{ total?: number; withImage?: number; withoutImage?: number } | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedGalleryId, setExpandedGalleryId] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<Record<string, ProductImageDto[]>>({});
  const [galleryLoadingId, setGalleryLoadingId] = useState<string | null>(null);
  const [galleryBusyId, setGalleryBusyId] = useState<string | null>(null);
  const [expandedQualityId, setExpandedQualityId] = useState<string | null>(null);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [productDetailTab, setProductDetailTab] = useState<ProductDetailTab>('SUMMARY');
  const imageBusyIdRef = useRef<string | null>(null);
  const galleryBusyIdRef = useRef<string | null>(null);
  const productRequestSeqRef = useRef(0);
  const galleryRequestSeqRef = useRef<Record<string, number>>({});
  const autoOpenKeyRef = useRef<string | null>(null);

  const beginImageBusy = (id: string, kind: 'upload' | 'delete' | 'sync') => {
    if (imageBusyIdRef.current) return false;
    imageBusyIdRef.current = id;
    if (kind === 'upload') setUploadingId(id);
    if (kind === 'delete') setDeletingId(id);
    if (kind === 'sync') setSyncingId(id);
    return true;
  };

  const endImageBusy = () => {
    imageBusyIdRef.current = null;
    setUploadingId(null);
    setDeletingId(null);
    setSyncingId(null);
  };

  const beginGalleryBusy = (id: string) => {
    if (galleryBusyIdRef.current) return false;
    galleryBusyIdRef.current = id;
    setGalleryBusyId(id);
    return true;
  };

  const endGalleryBusy = () => {
    galleryBusyIdRef.current = null;
    setGalleryBusyId(null);
  };

  const fetchProducts = async (searchOverride?: string, append = false, qualityFilterOverride?: QualityFilter) => {
    const requestSeq = ++productRequestSeqRef.current;
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const effectiveSearch = searchOverride ?? search;
      const requestSearch = isDiverseyScoped ? 'diversey' : effectiveSearch;
      const filterForRequest = qualityFilterOverride || qualityFilter;
      const nextPage = append ? (pagination?.page || Math.max(1, Math.ceil(products.length / PRODUCT_PAGE_SIZE))) + 1 : 1;
      const response = await adminApi.getProducts({
        ...(requestSearch ? { search: requestSearch } : {}),
        page: nextPage,
        limit: PRODUCT_PAGE_SIZE,
        ...(filterForRequest === 'NO_IMAGE' ? { hasImage: false } : {}),
      });
      if (requestSeq !== productRequestSeqRef.current) return;
      const nextProducts = response.products || [];
      const nextPagination = response.pagination || {
        page: nextPage,
        limit: PRODUCT_PAGE_SIZE,
        total: nextProducts.length,
        totalPages: nextProducts.length >= PRODUCT_PAGE_SIZE ? nextPage + 1 : nextPage,
      };
      setPagination(nextPagination);
      setHasMore(response.pagination ? nextPagination.page < nextPagination.totalPages : nextProducts.length >= PRODUCT_PAGE_SIZE);
      setProducts((current) => {
        if (!append) return nextProducts;
        const byId = new Map<string, Product>();
        current.forEach((product) => byId.set(product.id, product));
        nextProducts.forEach((product) => byId.set(product.id, product));
        return Array.from(byId.values());
      });
      setStats(response.stats || null);
    } catch (err: any) {
      if (requestSeq !== productRequestSeqRef.current) return;
      setError(getApiErrorMessage(err, 'Urunler yuklenemedi.'));
    } finally {
      if (requestSeq === productRequestSeqRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  useEffect(() => {
    const nextSearch = route.params?.scope === 'DIVERSEY' ? '' : route.params?.search || '';
    const nextQualityFilter = route.params?.qualityFilter || 'ALL';
    setSearch(nextSearch);
    setQualityFilter(nextQualityFilter);
    fetchProducts(nextSearch, false, nextQualityFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.search, route.params?.qualityFilter, route.params?.scope]);

  const displayTotals = useMemo(() => {
    if (!stats) return null;
    return {
      total: stats.total ?? 0,
      withImage: stats.withImage ?? 0,
      withoutImage: stats.withoutImage ?? 0,
    };
  }, [stats]);

  const loadedTotalLabel = pagination
    ? `${products.length.toLocaleString('tr-TR')} / ${pagination.total.toLocaleString('tr-TR')}`
    : products.length.toLocaleString('tr-TR');

  const loadMoreProducts = () => {
    if (loading || loadingMore || !hasMore) return;
    fetchProducts(search, true);
  };

  const applyQualityFilter = (nextFilter: QualityFilter) => {
    setQualityFilter(nextFilter);
    if (nextFilter === 'NO_IMAGE' || qualityFilter === 'NO_IMAGE') {
      fetchProducts(search, false, nextFilter);
    }
  };

  const productsWithQuality = useMemo(() => {
    return products.map((product) => ({
      product,
      quality: getCatalogQuality(product, galleryImages[product.id]),
    }));
  }, [products, galleryImages]);

  const qualitySummary = useMemo(() => {
    return productsWithQuality.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.quality.tone === 'bad') acc.bad += 1;
        if (row.quality.tone === 'warn') acc.warn += 1;
        if (!row.product.imageUrl) acc.noImage += 1;
        if (row.quality.missing.some((missing) => missing.label === 'Galeri derinligi')) {
          acc.galleryMissing += 1;
        }
        return acc;
      },
      { total: 0, bad: 0, warn: 0, noImage: 0, galleryMissing: 0 }
    );
  }, [productsWithQuality]);

  const filteredProducts = useMemo(() => {
    const localSearchTerm = normalizeSearchText(search);
    return productsWithQuality
      .filter(({ product, quality }) => {
        const haystack = normalizeSearchText(
          `${product.name || ''} ${product.mikroCode || ''} ${product.category?.name || ''} ${product.category?.mikroCode || ''}`
        );
        if (isDiverseyScoped && !normalizeSearchText(product.name || '').includes('diversey')) return false;
        if (isDiverseyScoped && localSearchTerm && !haystack.includes(localSearchTerm)) return false;
        if (qualityFilter === 'BAD') return quality.tone === 'bad';
        if (qualityFilter === 'WARN') return quality.tone === 'warn';
        if (qualityFilter === 'NO_IMAGE') return !product.imageUrl;
        if (qualityFilter === 'GALLERY_MISSING') {
          return quality.missing.some((missing) => missing.label === 'Galeri derinligi');
        }
        return true;
      })
      .map((row) => row.product);
  }, [isDiverseyScoped, productsWithQuality, qualityFilter, search]);

  const filterOptions: Array<{ key: QualityFilter; label: string; count: number }> = [
    { key: 'ALL', label: 'Tumu', count: qualitySummary.total },
    { key: 'BAD', label: 'Kritik', count: qualitySummary.bad },
    { key: 'WARN', label: 'Orta', count: qualitySummary.warn },
    { key: 'NO_IMAGE', label: 'Gorselsiz', count: qualitySummary.noImage },
    { key: 'GALLERY_MISSING', label: 'Galeri eksik', count: qualitySummary.galleryMissing },
  ];
  const productColumns = width >= 920 ? 2 : 1;

  const formatNumber = (value?: number | null) => {
    if (value === null || value === undefined) return '-';
    return value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const uploadImage = async (product: Product) => {
    if (imageBusyIdRef.current) return;
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    const formData = new FormData();
    formData.append('image', {
      uri: asset.uri,
      name: asset.name || `${product.mikroCode}.png`,
      type: asset.mimeType || 'image/jpeg',
    } as any);

    if (!beginImageBusy(product.id, 'upload')) return;
    try {
      await adminApi.uploadProductImage(product.id, formData);
      await fetchProducts();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Gorsel yuklenemedi.'));
    } finally {
      endImageBusy();
    }
  };

  const deleteImage = async (product: Product) => {
    if (imageBusyIdRef.current) return;
    if (!product.imageUrl) return;
    Alert.alert('Gorsel Sil', 'Gorseli silmek istiyor musunuz?', [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          if (!beginImageBusy(product.id, 'delete')) return;
          try {
            await adminApi.deleteProductImage(product.id);
            await fetchProducts();
          } catch (err: any) {
            Alert.alert('Hata', getApiErrorMessage(err, 'Gorsel silinemedi.'));
          } finally {
            endImageBusy();
          }
        },
      },
    ]);
  };

  const syncImage = async (product: Product) => {
    if (!beginImageBusy(product.id, 'sync')) return;
    try {
      await adminApi.triggerSelectedImageSync([product.id]);
      await fetchProducts();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Gorsel senkronu basarisiz.'));
    } finally {
      endImageBusy();
    }
  };

  const loadGallery = async (product: Product) => {
    const requestSeq = (galleryRequestSeqRef.current[product.id] || 0) + 1;
    galleryRequestSeqRef.current[product.id] = requestSeq;
    setGalleryLoadingId(product.id);
    try {
      const response = await adminApi.listProductImages(product.id);
      if (requestSeq !== galleryRequestSeqRef.current[product.id]) return;
      setGalleryImages((prev) => ({
        ...prev,
        [product.id]: [...(response.images || [])].sort((a, b) => a.sortOrder - b.sortOrder),
      }));
    } catch (err: any) {
      if (requestSeq !== galleryRequestSeqRef.current[product.id]) return;
      Alert.alert('Hata', getApiErrorMessage(err, 'Galeri yuklenemedi.'));
    } finally {
      if (requestSeq === galleryRequestSeqRef.current[product.id]) setGalleryLoadingId(null);
    }
  };

  const toggleGallery = async (product: Product) => {
    if (galleryLoadingId || galleryBusyIdRef.current) return;
    if (expandedGalleryId === product.id) {
      setExpandedGalleryId(null);
      return;
    }
    setExpandedGalleryId(product.id);
    if (!galleryImages[product.id]) {
      await loadGallery(product);
    }
  };

  useEffect(() => {
    if (!route.params?.autoOpenFirst || loading || filteredProducts.length === 0) return;
    const target = filteredProducts[0];
    const detailTab = route.params.detailTab || 'SUMMARY';
    const autoOpenKey = [
      route.params.search || '',
      route.params.qualityFilter || '',
      detailTab,
      target.id,
    ].join('|');

    if (autoOpenKeyRef.current === autoOpenKey) return;
    autoOpenKeyRef.current = autoOpenKey;
    setExpandedProductId(target.id);
    setExpandedQualityId(target.id);
    setProductDetailTab(detailTab);

    if (detailTab === 'IMAGE') {
      setExpandedGalleryId(target.id);
      if (!galleryImages[target.id]) {
        void loadGallery(target);
      }
    }
  }, [
    expandedGalleryId,
    filteredProducts,
    galleryImages,
    loading,
    route.params?.autoOpenFirst,
    route.params?.detailTab,
    route.params?.qualityFilter,
    route.params?.search,
  ]);

  const addGalleryImage = async (product: Product) => {
    if (galleryBusyIdRef.current) return;
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
      name: asset.name || `${product.mikroCode}.jpg`,
      type: asset.mimeType || 'image/jpeg',
    } as any);

    if (!beginGalleryBusy(product.id)) return;
    try {
      const response = await adminApi.addProductImage(product.id, formData);
      setGalleryImages((prev) => ({
        ...prev,
        [product.id]: [...(response.images || [])].sort((a, b) => a.sortOrder - b.sortOrder),
      }));
      await fetchProducts();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Galeri gorseli eklenemedi.'));
    } finally {
      endGalleryBusy();
    }
  };

  const makePrimaryGalleryImage = async (product: Product, image: ProductImageDto) => {
    if (!beginGalleryBusy(product.id)) return;
    try {
      const response = await adminApi.setPrimaryProductImage(product.id, image.id);
      setGalleryImages((prev) => ({
        ...prev,
        [product.id]: [...(response.images || [])].sort((a, b) => a.sortOrder - b.sortOrder),
      }));
      await fetchProducts();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Ana gorsel yapilamadi.'));
    } finally {
      endGalleryBusy();
    }
  };

  const removeGalleryImage = (product: Product, image: ProductImageDto) => {
    if (galleryBusyIdRef.current) return;
    Alert.alert('Galeri Gorseli Sil', image.isPrimary ? 'Bu ana gorsel silinsin mi?' : 'Bu gorsel silinsin mi?', [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          if (!beginGalleryBusy(product.id)) return;
          try {
            const response = await adminApi.deleteProductGalleryImage(product.id, image.id);
            setGalleryImages((prev) => ({
              ...prev,
              [product.id]: [...(response.images || [])].sort((a, b) => a.sortOrder - b.sortOrder),
            }));
            await fetchProducts();
          } catch (err: any) {
            Alert.alert('Hata', getApiErrorMessage(err, 'Galeri gorseli silinemedi.'));
          } finally {
            endGalleryBusy();
          }
        },
      },
    ]);
  };

  const toggleProductDetail = (product: Product) => {
    if (expandedProductId === product.id) {
      setExpandedProductId(null);
      return;
    }
    setExpandedProductId(product.id);
    setProductDetailTab('SUMMARY');
  };

  const renderInfoRow = (label: string, value?: string | number | null) => (
    <View key={label} style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value === null || value === undefined || value === '' ? '-' : value}</Text>
    </View>
  );

  const renderProductDetail = (product: Product, quality: ReturnType<typeof getCatalogQuality>) => {
    const priceRows = getPriceListRows(product);
    const warehouseRows = getWarehouseRows(product.warehouseStocks);
    const excessRows = getWarehouseRows(product.warehouseExcessStocks);
    const pendingRows = getWarehouseRows(product.pendingCustomerOrdersByWarehouse);
    const activeGallery = galleryImages[product.id] || [];

    return (
      <View style={styles.detailPanel}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.detailTabRow}>
          {[
            { key: 'SUMMARY', label: 'Ozet' },
            { key: 'PRICES', label: 'Fiyatlar' },
            { key: 'STOCK', label: 'Depolar' },
            { key: 'IMAGE', label: 'Gorsel' },
          ].map((tab) => {
            const active = productDetailTab === tab.key;
            return (
              <TouchableOpacity key={tab.key} style={[styles.detailTab, active && styles.detailTabActive]} onPress={() => setProductDetailTab(tab.key as ProductDetailTab)}>
                <Text style={[styles.detailTabText, active && styles.detailTabTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {productDetailTab === 'SUMMARY' && (
          <View style={styles.infoGrid}>
            {renderInfoRow('Kategori', product.category?.name || product.category?.mikroCode)}
            {renderInfoRow('Birim', product.unit || '-')}
            {renderInfoRow('2. Birim', product.unit2 ? `${product.unit2} x ${product.unit2Factor || '-'}` : '-')}
            {renderInfoRow('KDV', product.vatRate !== null && product.vatRate !== undefined ? `%${formatNumber((product.vatRate || 0) * 100)}` : '-')}
            {renderInfoRow('Musteri gorunumu', product.hiddenFromCustomers ? 'Gizli' : 'Acik')}
            {renderInfoRow('Kalite skoru', `${quality.score}/100`)}
            {renderInfoRow('Guncel maliyet', `${formatNumber(product.currentCost)} TL`)}
            {renderInfoRow('Maliyet tarihi', formatDate(product.currentCostDate))}
            {renderInfoRow('Son giris', `${formatNumber(product.lastEntryPrice)} TL`)}
            {renderInfoRow('Son giris tarihi', formatDate(product.lastEntryDate))}
            {renderInfoRow('Hesaplanan maliyet', `${formatNumber(product.calculatedCost)} TL`)}
            {renderInfoRow('Fazla stok', formatNumber(product.excessStock))}
          </View>
        )}

        {productDetailTab === 'PRICES' && (
          <View style={styles.detailList}>
            {priceRows.length ? priceRows.map((row) => (
              <View key={row.listNo} style={styles.detailListRow}>
                <Text style={styles.detailListLabel}>Liste {row.listNo}</Text>
                <Text style={styles.detailListValue}>{formatNumber(row.value)} TL</Text>
              </View>
            )) : <Text style={styles.emptyGalleryText}>Aktif fiyat listesi yok.</Text>}
          </View>
        )}

        {productDetailTab === 'STOCK' && (
          <View style={styles.detailList}>
            <Text style={styles.detailGroupTitle}>Satilabilir stok</Text>
            {warehouseRows.length ? warehouseRows.map((row) => (
              <View key={row.warehouse} style={styles.detailListRow}>
                <Text style={styles.detailListLabel}>Depo {row.warehouse}</Text>
                <Text style={styles.detailListValue}>{formatNumber(row.value)}</Text>
              </View>
            )) : <Text style={styles.emptyGalleryText}>Depo stogu yok.</Text>}
            <Text style={styles.detailGroupTitle}>Bekleyen musteri siparisi</Text>
            {pendingRows.length ? pendingRows.map((row) => (
              <View key={row.warehouse} style={styles.detailListRow}>
                <Text style={styles.detailListLabel}>Depo {row.warehouse}</Text>
                <Text style={styles.detailListValue}>{formatNumber(row.value)}</Text>
              </View>
            )) : <Text style={styles.emptyGalleryText}>Bekleyen siparis dagilimi yok.</Text>}
            <Text style={styles.detailGroupTitle}>Fazla stok dagilimi</Text>
            {excessRows.length ? excessRows.map((row) => (
              <View key={row.warehouse} style={styles.detailListRow}>
                <Text style={styles.detailListLabel}>Depo {row.warehouse}</Text>
                <Text style={styles.detailListValue}>{formatNumber(row.value)}</Text>
              </View>
            )) : <Text style={styles.emptyGalleryText}>Fazla stok dagilimi yok.</Text>}
          </View>
        )}

        {productDetailTab === 'IMAGE' && (
          <View style={styles.infoGrid}>
            {renderInfoRow('Ana gorsel', product.imageUrl ? 'Var' : 'Yok')}
            {renderInfoRow('Galeri sayisi', activeGallery.length || '-')}
            {renderInfoRow('Senkron durumu', product.imageSyncStatus || '-')}
            {renderInfoRow('Hata tipi', product.imageSyncErrorType || '-')}
            {renderInfoRow('Hata mesaji', product.imageSyncErrorMessage || '-')}
            {renderInfoRow('Checksum', product.imageChecksum || '-')}
            {renderInfoRow('Dosya boyutu', formatBytes(product.imageSizeBytes))}
            {renderInfoRow('Yukleyen', product.imageUploadedByName || '-')}
            {renderInfoRow('Yukleme tarihi', formatDate(product.imageUploadedAt))}
            {renderInfoRow('Sync tarihi', formatDate(product.imageSyncUpdatedAt))}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          key={`products-${productColumns}`}
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          numColumns={productColumns}
          columnWrapperStyle={productColumns > 1 ? styles.productColumnWrapper : undefined}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.hero}>
                <Text style={styles.heroKicker}>{isDiverseyScoped ? 'Diversey' : 'Katalog'}</Text>
                <Text style={styles.heroTitle}>{isDiverseyScoped ? 'Diversey Stok' : 'Urunler'}</Text>
                <Text style={styles.heroSubtitle}>
                  {isDiverseyScoped ? 'Diversey urunleri, stok ve katalog kalite aksiyonlari.' : 'Stok, fiyat, kalite ve gorsel aksiyonlarini tek listede takip edin.'}
                </Text>
                <View style={styles.heroMetricRow}>
                  <View style={styles.heroMetric}>
                    <Text style={styles.heroMetricValue}>{loadedTotalLabel}</Text>
                    <Text style={styles.heroMetricLabel}>Yuklenen</Text>
                  </View>
                  <View style={styles.heroMetric}>
                    <Text style={qualitySummary.bad > 0 ? styles.heroMetricDanger : styles.heroMetricValue}>{qualitySummary.bad}</Text>
                    <Text style={styles.heroMetricLabel}>Kritik</Text>
                  </View>
                  <View style={styles.heroMetric}>
                    <Text style={qualitySummary.noImage > 0 ? styles.heroMetricDanger : styles.heroMetricValue}>{qualitySummary.noImage}</Text>
                    <Text style={styles.heroMetricLabel}>Gorselsiz</Text>
                  </View>
                  <View style={styles.heroMetric}>
                    <Text style={qualitySummary.galleryMissing > 0 ? styles.heroMetricWarn : styles.heroMetricValue}>{qualitySummary.galleryMissing}</Text>
                    <Text style={styles.heroMetricLabel}>Galeri</Text>
                  </View>
                </View>
              </View>
              <View style={styles.searchRow}>
                <TextInput
                  style={styles.search}
                  placeholder={isDiverseyScoped ? 'Diversey urunu ara...' : 'Urun ara...'}
                  placeholderTextColor={colors.textMuted}
                  value={search}
                  onChangeText={setSearch}
                  onSubmitEditing={() => fetchProducts()}
                  returnKeyType="search"
                />
                <TouchableOpacity
                  style={[styles.searchButton, width < 420 && styles.searchButtonCompact, loading && styles.buttonDisabled]}
                  onPress={() => fetchProducts()}
                  disabled={loading}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.searchButtonText}>{loading ? 'Araniyor' : 'Ara'}</Text>
                </TouchableOpacity>
              </View>
              {displayTotals && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryText}>Toplam: {displayTotals.total}</Text>
                  <Text style={styles.summaryText}>Gorselli: {displayTotals.withImage}</Text>
                  <Text style={styles.summaryText}>Gorselsiz: {displayTotals.withoutImage}</Text>
                  {pagination && <Text style={styles.summaryText}>Yuklenen: {loadedTotalLabel}</Text>}
                </View>
              )}
              <View style={styles.qualityDashboard}>
                <View style={styles.qualityMetricCard}>
                  <Text style={styles.metricLabel}>Kritik kalite</Text>
                  <Text style={styles.metricValue}>{qualitySummary.bad}</Text>
                </View>
                <View style={styles.qualityMetricCard}>
                  <Text style={styles.metricLabel}>Gorselsiz</Text>
                  <Text style={styles.metricValue}>{qualitySummary.noImage}</Text>
                </View>
                <View style={styles.qualityMetricCard}>
                  <Text style={styles.metricLabel}>Galeri eksik</Text>
                  <Text style={styles.metricValue}>{qualitySummary.galleryMissing}</Text>
                </View>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterRail}
              >
                {filterOptions.map((option) => {
                  const active = qualityFilter === option.key;
                  return (
                    <TouchableOpacity
                      key={option.key}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => applyQualityFilter(option.key)}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                        {option.label} ({option.count})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {qualityFilter !== 'ALL' && (
                <Text style={styles.filteredCount}>
                  {filteredProducts.length} urun aksiyon listesinde.
                </Text>
              )}
              {error && <Text style={styles.error}>{error}</Text>}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Urun bulunamadi</Text>
              <Text style={styles.emptyText}>Arama veya kalite filtresini degistirin.</Text>
            </View>
          }
          ListFooterComponent={
            filteredProducts.length ? (
              <View style={styles.footer}>
                {loadingMore ? (
                  <ActivityIndicator color={colors.primary} />
                ) : hasMore ? (
                  <TouchableOpacity style={styles.loadMoreButton} onPress={loadMoreProducts} disabled={loadingMore}>
                    <Text style={styles.loadMoreText}>Daha Fazla Yukle</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.endText}>Listenin sonu</Text>
                )}
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const list1 = item.mikroPriceLists?.['1'];
            const list6 = item.mikroPriceLists?.['6'];
            const galleryOpen = expandedGalleryId === item.id;
            const gallery = galleryImages[item.id] || [];
            const galleryBusy = galleryBusyId === item.id;
            const galleryLocked = Boolean(galleryLoadingId || galleryBusyId);
            const imageLocked = Boolean(uploadingId || deletingId || syncingId);
            const qualityOpen = expandedQualityId === item.id;
            const quality = getCatalogQuality(item, galleryImages[item.id]);
            const imageUri = resolvePublicUrl(item.imageUrl);

            return (
              <View style={[styles.card, productColumns > 1 && styles.cardGridItem]}>
                <Text style={styles.cardTitle} numberOfLines={3} ellipsizeMode="tail">{item.name}</Text>
                <Text style={styles.cardMeta} numberOfLines={1} ellipsizeMode="middle">Kod: {item.mikroCode}</Text>
                <View style={styles.qualityRow}>
                  <View style={[styles.qualityBadge, quality.tone === 'good' && styles.qualityGood, quality.tone === 'warn' && styles.qualityWarn, quality.tone === 'bad' && styles.qualityBad]}>
                    <Text style={styles.qualityScore}>{quality.score}</Text>
                    <Text style={styles.qualitySuffix}>/100</Text>
                  </View>
                  <View style={styles.qualityTextBlock}>
                    <Text style={styles.qualityTitle}>Katalog Kalitesi</Text>
                    <Text style={styles.qualityMeta}>
                      {quality.missing.length === 0 ? 'Eksik gorunmuyor' : `${quality.missing.length} eksik aksiyon`}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.qualityToggle}
                    onPress={() => setExpandedQualityId(qualityOpen ? null : item.id)}
                  >
                    <Text style={styles.qualityToggleText}>{qualityOpen ? 'Kapat' : 'Detay'}</Text>
                  </TouchableOpacity>
                </View>
                {qualityOpen && (
                  <View style={styles.qualityPanel}>
                    {quality.checks.map((check) => (
                      <View key={check.label} style={styles.qualityCheckRow}>
                        <Text style={[styles.qualityCheckMark, check.ok ? styles.qualityCheckOk : styles.qualityCheckMissing]}>
                          {check.ok ? 'OK' : '!'}
                        </Text>
                        <View style={styles.qualityCheckBody}>
                          <Text style={styles.qualityCheckLabel}>{check.label}</Text>
                          {!check.ok ? <Text style={styles.qualityCheckAction}>{check.action}</Text> : null}
                        </View>
                      </View>
                    ))}
                    <View style={styles.qualityActionRow}>
                      <TouchableOpacity style={[styles.secondaryButton, imageLocked && styles.buttonDisabled]} onPress={() => uploadImage(item)} disabled={imageLocked}>
                        <Text style={styles.secondaryButtonText}>Ana Gorsel Yukle</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.secondaryButton, galleryLocked && styles.buttonDisabled]} onPress={() => toggleGallery(item)} disabled={galleryLocked}>
                        <Text style={styles.secondaryButtonText}>Galeri Ac</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                <TouchableOpacity style={styles.detailToggleButton} onPress={() => toggleProductDetail(item)}>
                  <Text style={styles.detailToggleText}>{expandedProductId === item.id ? 'Detayli Kunye Kapat' : 'Detayli Kunye'}</Text>
                </TouchableOpacity>
                {expandedProductId === item.id ? renderProductDetail(item, quality) : null}
                <Text style={styles.cardMeta}>Toplam Stok: {formatNumber(item.totalStock)}</Text>
                <Text style={styles.cardMeta}>Guncel Maliyet: {formatNumber(item.currentCost)} TL</Text>
                <Text style={styles.cardMeta}>Son Giris: {formatNumber(item.lastEntryPrice)} TL</Text>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Liste 1:</Text>
                <Text style={styles.priceValue}>{formatNumber(list1)} TL</Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Liste 6:</Text>
                <Text style={styles.priceValue}>{formatNumber(list6)} TL</Text>
              </View>
              <View style={styles.imageRow}>
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={styles.image} />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Text style={styles.imagePlaceholderText}>Gorsel yok</Text>
                  </View>
                )}
                <View style={styles.imageActions}>
                  <TouchableOpacity
                    style={[styles.secondaryButton, imageLocked && styles.buttonDisabled]}
                    onPress={() => uploadImage(item)}
                    disabled={imageLocked}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {uploadingId === item.id ? 'Yukleniyor' : 'Yukle'}
                    </Text>
                  </TouchableOpacity>
                  {item.imageUrl && (
                    <TouchableOpacity
                      style={[styles.secondaryButton, imageLocked && styles.buttonDisabled]}
                      onPress={() => deleteImage(item)}
                      disabled={imageLocked}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {deletingId === item.id ? 'Siliniyor' : 'Sil'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.secondaryButton, imageLocked && styles.buttonDisabled]}
                    onPress={() => syncImage(item)}
                    disabled={imageLocked}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {syncingId === item.id ? 'Sync' : 'Senkron'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.secondaryButton, galleryLocked && styles.buttonDisabled]}
                    onPress={() => toggleGallery(item)}
                    disabled={galleryLocked}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {galleryOpen ? 'Galeriyi Kapat' : 'Galeri'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              {galleryOpen && (
                <View style={styles.galleryPanel}>
                  <View style={styles.galleryHeader}>
                    <View>
                      <Text style={styles.galleryTitle}>Urun Galerisi</Text>
                      <Text style={styles.galleryMeta}>Ana gorsel Mikro'ya yazilir; digerleri B2B galeride kalir.</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.galleryAddButton, galleryLocked && styles.buttonDisabled]}
                      onPress={() => addGalleryImage(item)}
                      disabled={galleryLocked}
                    >
                      <Text style={styles.galleryAddText}>{galleryBusy ? 'Isleniyor' : 'Ekle'}</Text>
                    </TouchableOpacity>
                  </View>
                  {galleryLoadingId === item.id ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : gallery.length === 0 ? (
                    <Text style={styles.emptyGalleryText}>Galeride gorsel yok.</Text>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryList}>
                      {gallery.map((image) => (
                        <View key={image.id} style={styles.galleryItem}>
                          <Image source={{ uri: resolvePublicUrl(image.url) || image.url }} style={styles.galleryImage} resizeMode="cover" />
                          <Text style={[styles.primaryBadge, image.isPrimary && styles.primaryBadgeOn]}>
                            {image.isPrimary ? 'Ana' : `Sira ${image.sortOrder}`}
                          </Text>
                          <View style={styles.galleryActions}>
                            {!image.isPrimary && (
                              <TouchableOpacity style={[styles.galleryActionButton, galleryLocked && styles.buttonDisabled]} onPress={() => makePrimaryGalleryImage(item, image)} disabled={galleryLocked}>
                                <Text style={styles.galleryActionText}>Ana yap</Text>
                              </TouchableOpacity>
                            )}
                            <TouchableOpacity style={[styles.galleryDangerButton, galleryLocked && styles.buttonDisabled]} onPress={() => removeGalleryImage(item, image)} disabled={galleryLocked}>
                              <Text style={styles.galleryDangerText}>Sil</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                </View>
              )}
              {item.imageSyncStatus && (
                <Text style={styles.cardMeta}>Gorsel Durum: {item.imageSyncStatus}</Text>
              )}
              {item.imageSyncErrorType && (
                <Text style={styles.cardMeta}>Hata: {item.imageSyncErrorType}</Text>
              )}
            </View>
          );
        }}
      />
    )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  productColumnWrapper: {
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
    marginTop: spacing.xs,
  },
  heroSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    lineHeight: fontSizes.sm + 5,
    color: '#DDE8FF',
    marginTop: spacing.xs,
  },
  heroMetricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  heroMetric: {
    flexGrow: 1,
    flexBasis: 86,
    minWidth: 82,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(221,232,255,0.22)',
    padding: spacing.sm,
  },
  heroMetricValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: '#FFFFFF',
  },
  heroMetricDanger: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: '#FCA5A5',
  },
  heroMetricWarn: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: '#FCD34D',
  },
  heroMetricLabel: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFD7FF',
  },
  searchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  search: {
    flex: 1,
    minWidth: 180,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: fonts.regular,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  searchButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 44,
  },
  searchButtonCompact: {
    width: '100%',
  },
  searchButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
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
  qualityDashboard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  qualityMetricCard: {
    flex: 1,
    minWidth: 96,
    minHeight: 74,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    justifyContent: 'space-between',
  },
  metricLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  metricValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: colors.text,
  },
  filterRail: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  filterChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  filterChipText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  filteredCount: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.primarySoft,
  },
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
  },
  emptyState: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  emptyTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  footer: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadMoreButton: {
    minWidth: 180,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  loadMoreText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.sm,
    color: '#FFFFFF',
  },
  endText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  cardGridItem: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.lg,
    lineHeight: fontSizes.lg + 5,
    color: colors.text,
    flexShrink: 1,
    minWidth: 0,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    flexShrink: 1,
    minWidth: 0,
  },
  qualityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  qualityBadge: {
    minWidth: 58,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
  },
  qualityGood: { backgroundColor: colors.successSoft },
  qualityWarn: { backgroundColor: colors.warningSoft },
  qualityBad: { backgroundColor: colors.dangerSoft },
  qualityScore: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text },
  qualitySuffix: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 5 },
  qualityTextBlock: { flex: 1, minWidth: 0 },
  qualityTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  qualityMeta: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
  qualityToggle: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  qualityToggleText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.primarySoft },
  qualityPanel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  qualityCheckRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  qualityCheckMark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    textAlign: 'center',
    textAlignVertical: 'center',
    overflow: 'hidden',
    fontFamily: fonts.bold,
    fontSize: fontSizes.xs,
  },
  qualityCheckOk: { backgroundColor: colors.successSoft, color: colors.success },
  qualityCheckMissing: { backgroundColor: colors.dangerSoft, color: colors.danger },
  qualityCheckBody: { flex: 1, minWidth: 0 },
  qualityCheckLabel: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  qualityCheckAction: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted, lineHeight: 18 },
  qualityActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  detailToggleButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    marginTop: spacing.xs,
  },
  detailToggleText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.sm,
    color: colors.primarySoft,
  },
  detailPanel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  detailTabRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  detailTab: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  detailTabActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  detailTabText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  detailTabTextActive: {
    color: '#FFFFFF',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  infoRow: {
    flexGrow: 1,
    minWidth: 132,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.sm,
  },
  infoLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  infoValue: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
    marginTop: 2,
  },
  detailList: {
    gap: spacing.xs,
  },
  detailGroupTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xs,
    color: colors.text,
    marginTop: spacing.xs,
  },
  detailListRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  detailListLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  detailListValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  priceLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  priceValue: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  imageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  image: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  imagePlaceholder: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderText: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
  imageActions: {
    flex: 1,
    gap: spacing.xs,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.text,
  },
  galleryPanel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  galleryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  galleryTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  galleryMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  galleryAddButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  galleryAddText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xs,
    color: '#FFFFFF',
  },
  galleryList: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  galleryItem: {
    width: 138,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  galleryImage: {
    width: '100%',
    height: 92,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  primaryBadge: {
    overflow: 'hidden',
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  primaryBadgeOn: {
    backgroundColor: colors.successSoft,
    color: colors.success,
  },
  galleryActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  galleryActionButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  galleryActionText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.text,
  },
  galleryDangerButton: {
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.30)',
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  galleryDangerText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.danger,
  },
  emptyGalleryText: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
