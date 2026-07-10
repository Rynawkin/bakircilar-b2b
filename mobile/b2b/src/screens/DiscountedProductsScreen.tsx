import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { customerApi } from '../api/customer';
import { CustomerAppHeader } from '../components/CustomerAppHeader';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Category, Product } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { trackCustomerActivity } from '../utils/activity';
import { resolveImageUrl } from '../utils/image';
import { compareSearchText } from '../utils/search';
import { getDisplayPrice } from '../utils/vat';

type PriceType = 'INVOICED' | 'WHITE';
const PRODUCT_PAGE_SIZE = 40;

const getApiErrorMessage = (err: any, fallback: string) => {
  const candidate = err?.response?.data?.error || err?.response?.data?.message || err?.message;
  if (typeof candidate === 'string') return candidate;
  if (candidate && typeof candidate === 'object') return candidate.message || candidate.code || fallback;
  return fallback;
};

export function DiscountedProductsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [products, setProducts] = useState<Product[]>([]);
  const [productTotal, setProductTotal] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [priceType, setPriceType] = useState<PriceType>('INVOICED');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'price-asc' | 'price-desc' | 'stock-desc' | 'stock-asc'>('name-asc');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const addingProductIdRef = useRef<string | null>(null);
  const productRequestSeqRef = useRef(0);
  const lastSearchRef = useRef('');

  const visibility = user?.priceVisibility ?? 'INVOICED_ONLY';
  const listColumns = width >= 920 ? 3 : width >= 560 ? 2 : 1;

  useEffect(() => {
    if (visibility === 'WHITE_ONLY') {
      setPriceType('WHITE');
    }
  }, [visibility]);

  const fetchProducts = async (append = false) => {
    const requestSeq = productRequestSeqRef.current + 1;
    productRequestSeqRef.current = requestSeq;
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const offset = append ? products.length : 0;
      const response = await customerApi.getProducts({
        search: search || undefined,
        categoryId: selectedCategory || undefined,
        warehouse: selectedWarehouse || undefined,
        mode: 'discounted',
        limit: PRODUCT_PAGE_SIZE,
        offset,
      });
      if (requestSeq !== productRequestSeqRef.current) return;
      const nextProducts = response.products || [];
      setProductTotal(typeof response.total === 'number' ? response.total : null);
      setHasMore(nextProducts.length >= PRODUCT_PAGE_SIZE);
      setProducts((current) => {
        if (!append) return nextProducts;
        const byId = new Map<string, Product>();
        current.forEach((product) => byId.set(product.id, product));
        nextProducts.forEach((product) => byId.set(product.id, product));
        return Array.from(byId.values());
      });
    } catch (err: any) {
      if (requestSeq !== productRequestSeqRef.current) return;
      setError(getApiErrorMessage(err, 'Indirimli urunler yuklenemedi.'));
    } finally {
      if (requestSeq === productRequestSeqRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  const loadFilters = async () => {
    try {
      const [categoriesResponse, warehousesResponse] = await Promise.all([
        customerApi.getCategories(),
        customerApi.getWarehouses(),
      ]);
      setCategories(categoriesResponse.categories || []);
      setWarehouses(warehousesResponse.warehouses || []);
    } catch {
      setCategories([]);
      setWarehouses([]);
    }
  };

  useEffect(() => {
    loadFilters();
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchProducts(false);
    }, 300);
    return () => clearTimeout(handler);
  }, [search, selectedCategory, selectedWarehouse]);

  const loadMoreProducts = () => {
    if (loading || loadingMore || !hasMore) return;
    fetchProducts(true);
  };

  useEffect(() => {
    const term = search.trim();
    if (!term || term === lastSearchRef.current) return;
    lastSearchRef.current = term;
    trackCustomerActivity({
      type: 'SEARCH',
      pagePath: 'DiscountedProducts',
      pageTitle: 'Indirimli Urunler',
      meta: { query: term, source: 'discounted-products' },
    });
  }, [search]);

  const getWarehouseTotal = (product: Product) => {
    const warehouseStocks = product.warehouseStocks || {};
    const keyTotal = (key: string) => {
      const value = warehouseStocks[key];
      return typeof value === 'number' ? value : Number(value) || 0;
    };
    const hasPrimaryKeys = Object.prototype.hasOwnProperty.call(warehouseStocks, '1')
      || Object.prototype.hasOwnProperty.call(warehouseStocks, '6');
    const totals = hasPrimaryKeys
      ? keyTotal('1') + keyTotal('6')
      : Object.values(warehouseStocks).reduce((sum, value) => {
          const numeric = typeof value === 'number' ? value : Number(value) || 0;
          return sum + numeric;
        }, 0);
    const baseStock = typeof product.availableStock === 'number' ? product.availableStock : 0;
    const excessStock = product.excessStock ?? 0;
    return Math.max(totals, baseStock, excessStock);
  };

  const getMaxQuantity = (product: Product) => {
    const totalStock = getWarehouseTotal(product);
    const baseStock =
      product.pricingMode === 'EXCESS' ? product.excessStock ?? totalStock : totalStock;
    return product.maxOrderQuantity ?? baseStock;
  };

  const getSortPrice = (product: Product) => {
    const agreed = product.agreement;
    const base = agreed
      ? { invoiced: agreed.priceInvoiced, white: agreed.priceWhite }
      : product.prices;
    return priceType === 'INVOICED' ? base.invoiced : base.white;
  };

  const sortedProducts = useMemo(() => {
    const list = [...products];
    switch (sortBy) {
      case 'name-desc':
        return list.sort((a, b) => compareSearchText(b.name, a.name));
      case 'price-asc':
        return list.sort((a, b) => getSortPrice(a) - getSortPrice(b));
      case 'price-desc':
        return list.sort((a, b) => getSortPrice(b) - getSortPrice(a));
      case 'stock-asc':
        return list.sort((a, b) => getWarehouseTotal(a) - getWarehouseTotal(b));
      case 'stock-desc':
        return list.sort((a, b) => getWarehouseTotal(b) - getWarehouseTotal(a));
      default:
        return list.sort((a, b) => compareSearchText(a.name, b.name));
    }
  }, [products, sortBy, priceType]);

  const updateQuantity = (product: Product, delta: number) => {
    setQuantities((prev) => {
      const current = prev[product.id] || 1;
      const maxQty = getMaxQuantity(product);
      const next = Math.max(1, Math.min(maxQty, current + delta));
      if (delta > 0 && current >= maxQty) {
        Alert.alert('Stok Yetersiz', `Maksimum ${maxQty} adet siparis verebilirsiniz.`);
      }
      return { ...prev, [product.id]: next };
    });
  };

  const addToCart = async (product: Product) => {
    if (addingProductIdRef.current) return;
    const quantity = quantities[product.id] || 1;
    try {
      const maxQty = getMaxQuantity(product);
      if (maxQty <= 0) {
        Alert.alert('Stok Yetersiz', 'Bu urun stokta yok.');
        return;
      }
      addingProductIdRef.current = product.id;
      setAddingProductId(product.id);
      await customerApi.addToCart({
        productId: product.id,
        quantity,
        priceType,
        priceMode: product.pricingMode === 'EXCESS' ? 'EXCESS' : 'LIST',
      });
      trackCustomerActivity({
        type: 'CART_ADD',
        productId: product.id,
        productCode: product.mikroCode,
        quantity,
        meta: { source: 'discounted-products-grid' },
      });
      Alert.alert('Sepete Eklendi', `${product.name} sepete eklendi.`);
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Sepete eklenemedi.'));
    } finally {
      addingProductIdRef.current = null;
      setAddingProductId(null);
    }
  };

  const renderPrices = (product: Product) => {
    const agreed = product.agreement;
    const baseInvoiced = agreed
      ? agreed.priceInvoiced
      : product.listPrices?.invoiced ?? product.prices.invoiced;
    const baseWhite = agreed
      ? agreed.priceWhite
      : product.listPrices?.white ?? product.prices.white;
    const rawSaleInvoiced = product.excessPrices?.invoiced ?? product.prices.invoiced;
    const rawSaleWhite = product.excessPrices?.white ?? product.prices.white;
    const saleInvoiced = !agreed && rawSaleInvoiced < baseInvoiced ? rawSaleInvoiced : baseInvoiced;
    const saleWhite = !agreed && rawSaleWhite < baseWhite ? rawSaleWhite : baseWhite;
    const displayInvoiced = getDisplayPrice(
      saleInvoiced,
      product.vatRate,
      'INVOICED',
      user?.vatDisplayPreference
    );
    const displayWhite = getDisplayPrice(
      saleWhite,
      product.vatRate,
      'WHITE',
      user?.vatDisplayPreference
    );
    const displayBaseInvoiced = getDisplayPrice(
      baseInvoiced,
      product.vatRate,
      'INVOICED',
      user?.vatDisplayPreference
    );
    const displayBaseWhite = getDisplayPrice(
      baseWhite,
      product.vatRate,
      'WHITE',
      user?.vatDisplayPreference
    );
    const getDiscountPercent = (base: number, sale: number) => {
      if (!Number.isFinite(base) || !Number.isFinite(sale) || base <= 0 || sale >= base) return null;
      const percent = Math.round(((base - sale) / base) * 100);
      return percent > 0 ? percent : null;
    };
    const discountInvoiced = agreed ? null : getDiscountPercent(displayBaseInvoiced, displayInvoiced);
    const discountWhite = agreed ? null : getDiscountPercent(displayBaseWhite, displayWhite);

    const lines: Array<{
      label: string;
      value: number;
      baseValue?: number;
      discount?: number | null;
      active: boolean;
    }> = [];
    if (visibility === 'INVOICED_ONLY' || visibility === 'BOTH') {
      lines.push({
        label: 'Faturali',
        value: displayInvoiced,
        baseValue: discountInvoiced ? displayBaseInvoiced : undefined,
        discount: discountInvoiced,
        active: priceType === 'INVOICED',
      });
    }
    if (visibility === 'WHITE_ONLY' || visibility === 'BOTH') {
      lines.push({
        label: 'Beyaz',
        value: displayWhite,
        baseValue: discountWhite ? displayBaseWhite : undefined,
        discount: discountWhite,
        active: priceType === 'WHITE',
      });
    }

    return (
      <View style={styles.priceStack}>
        {lines.map((line) => (
          <View key={line.label}>
            <Text style={line.active ? styles.priceActive : styles.priceText}>
              {line.label}: {line.value.toFixed(2)} TL
            </Text>
            {line.baseValue !== undefined && line.discount ? (
              <Text style={styles.priceNote}>
                Normal: {line.baseValue.toFixed(2)} TL (-%{line.discount})
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    );
  };

  const sortOptions: Array<{ id: typeof sortBy; label: string }> = useMemo(
    () => [
      { id: 'name-asc', label: 'Isim (A-Z)' },
      { id: 'name-desc', label: 'Isim (Z-A)' },
      { id: 'price-asc', label: 'Fiyat (Dusuk-Yuksek)' },
      { id: 'price-desc', label: 'Fiyat (Yuksek-Dusuk)' },
      { id: 'stock-desc', label: 'Stok (Yuksek-Dusuk)' },
      { id: 'stock-asc', label: 'Stok (Dusuk-Yuksek)' },
    ],
    []
  );

  const selectedCategoryLabel = useMemo(() => {
    if (!selectedCategory) return 'Tum Kategoriler';
    return categories.find((cat) => cat.id === selectedCategory)?.name || 'Tum Kategoriler';
  }, [categories, selectedCategory]);

  const listHeader = useMemo(() => {
    return (
      <View style={styles.header}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>Firsatlar</Text>
          <Text style={styles.heroTitle}>Indirimli Urunler</Text>
          <Text style={styles.heroSubtitle}>Fazla stok ve kampanya fiyatlarini stok durumuyla birlikte inceleyin.</Text>
          <View style={styles.heroMetricRow}>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{sortedProducts.length}</Text>
              <Text style={styles.heroMetricLabel}>Urun</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{priceType === 'WHITE' ? 'Beyaz' : 'Faturali'}</Text>
              <Text style={styles.heroMetricLabel}>Fiyat</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue} numberOfLines={1}>{selectedWarehouse || 'Tum'}</Text>
              <Text style={styles.heroMetricLabel}>Depo</Text>
            </View>
          </View>
        </View>
        <TextInput
          style={styles.search}
          placeholder="Urun ara..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => fetchProducts(false)}
          returnKeyType="search"
        />
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setFiltersOpen(true)}
          >
            <Text style={styles.filterButtonText}>Filtreler</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => {
              setSearch('');
              setSelectedCategory('');
              setSelectedWarehouse('');
              setSortBy('name-asc');
              setProductTotal(null);
            }}
          >
            <Text style={styles.clearButtonText}>Temizle</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.filterSummary}>
          <Text style={styles.filterChip}>{selectedCategoryLabel}</Text>
          <Text style={styles.filterChip}>
            {selectedWarehouse ? `Depo: ${selectedWarehouse}` : 'Tum Depolar'}
          </Text>
          <Text style={styles.filterChip}>
            {sortOptions.find((option) => option.id === sortBy)?.label}
          </Text>
        </View>
        <View style={styles.resultSummary}>
          <Text style={styles.resultText} numberOfLines={1}>
            {productTotal ? `${sortedProducts.length}/${productTotal}` : `${sortedProducts.length}`} sonuc
          </Text>
          {search.trim() ? <Text style={styles.resultText} numberOfLines={1} ellipsizeMode="tail">Arama: {search.trim()}</Text> : null}
        </View>
        {visibility === 'BOTH' && (
          <View style={styles.segment}>
            <TouchableOpacity
              style={[styles.segmentButton, priceType === 'INVOICED' && styles.segmentActive]}
              onPress={() => setPriceType('INVOICED')}
            >
              <Text
                style={
                  priceType === 'INVOICED'
                    ? styles.segmentTextActive
                    : styles.segmentText
                }
              >
                Faturali
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentButton, priceType === 'WHITE' && styles.segmentActive]}
              onPress={() => setPriceType('WHITE')}
            >
              <Text
                style={
                  priceType === 'WHITE'
                    ? styles.segmentTextActive
                    : styles.segmentText
                }
              >
                Beyaz
              </Text>
            </TouchableOpacity>
          </View>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }, [search, error, visibility, priceType, selectedCategoryLabel, selectedWarehouse, sortBy, sortedProducts.length, productTotal]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <CustomerAppHeader />
      <Modal visible={filtersOpen} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setFiltersOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.modalTitle}>Filtreler</Text>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>Kategori</Text>
                <View style={styles.optionList}>
                  <TouchableOpacity
                    style={[
                      styles.optionItem,
                      selectedCategory === '' && styles.optionItemActive,
                    ]}
                    onPress={() => setSelectedCategory('')}
                  >
                    <Text
                      style={
                        selectedCategory === '' ? styles.optionTextActive : styles.optionText
                      }
                    >
                      Tum Kategoriler
                    </Text>
                  </TouchableOpacity>
                  {categories.map((category) => (
                    <TouchableOpacity
                      key={category.id}
                      style={[
                        styles.optionItem,
                        selectedCategory === category.id && styles.optionItemActive,
                      ]}
                      onPress={() => setSelectedCategory(category.id)}
                    >
                      <Text
                        style={
                          selectedCategory === category.id
                            ? styles.optionTextActive
                            : styles.optionText
                        }
                      >
                        {category.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>Depo</Text>
                <View style={styles.optionList}>
                  <TouchableOpacity
                    style={[
                      styles.optionItem,
                      selectedWarehouse === '' && styles.optionItemActive,
                    ]}
                    onPress={() => setSelectedWarehouse('')}
                  >
                    <Text
                      style={
                        selectedWarehouse === '' ? styles.optionTextActive : styles.optionText
                      }
                    >
                      Tum Depolar
                    </Text>
                  </TouchableOpacity>
                  {warehouses.map((warehouse) => (
                    <TouchableOpacity
                      key={warehouse}
                      style={[
                        styles.optionItem,
                        selectedWarehouse === warehouse && styles.optionItemActive,
                      ]}
                      onPress={() => setSelectedWarehouse(warehouse)}
                    >
                      <Text
                        style={
                          selectedWarehouse === warehouse
                            ? styles.optionTextActive
                            : styles.optionText
                        }
                      >
                        {warehouse}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>Siralama</Text>
                <View style={styles.optionList}>
                  {sortOptions.map((option) => (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.optionItem,
                        sortBy === option.id && styles.optionItemActive,
                      ]}
                      onPress={() => setSortBy(option.id)}
                    >
                      <Text style={sortBy === option.id ? styles.optionTextActive : styles.optionText}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setFiltersOpen(false)}>
              <Text style={styles.modalCloseText}>Tamam</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          key={`discounted-${listColumns}`}
          data={sortedProducts}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={listHeader}
          ListHeaderComponentStyle={styles.listHeader}
          contentContainerStyle={styles.listContent}
          numColumns={listColumns}
          columnWrapperStyle={listColumns > 1 ? styles.columnRow : undefined}
          renderItem={({ item }) => (
            <View style={styles.columnItem}>
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.9}
                onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
              >
                <View style={styles.imageWrap}>
                  {resolveImageUrl(item.imageUrl) ? (
                    <Image
                      source={{ uri: resolveImageUrl(item.imageUrl) as string }}
                      style={styles.image}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <Text style={styles.imagePlaceholderText}>
                        {item.name?.trim()?.charAt(0)?.toUpperCase() || '?'}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle} numberOfLines={5}>
                    {item.name}
                  </Text>
                  <View style={styles.badgeWrap}>
                    {item.agreement && <Text style={styles.badge} numberOfLines={1}>Anlasmali</Text>}
                    {item.isBundle && <Text style={styles.bundleBadge} numberOfLines={1}>Paket</Text>}
                    {item.pricingMode === 'EXCESS' && <Text style={styles.excessBadge} numberOfLines={1}>Fazla Stok</Text>}
                  </View>
                </View>
                <Text style={styles.code} numberOfLines={1} ellipsizeMode="middle">Kod: {item.mikroCode}</Text>
                <Text style={styles.code} numberOfLines={1}>
                  Fazla Stok: {item.excessStock ?? getWarehouseTotal(item)}
                </Text>
                {renderPrices(item)}
                <View style={styles.cartRow}>
                  <View style={styles.counterRow}>
                    <TouchableOpacity
                      style={styles.counterButton}
                      onPress={(event) => {
                        event.stopPropagation();
                        updateQuantity(item, -1);
                      }}
                    >
                      <Text style={styles.counterText}>-</Text>
                    </TouchableOpacity>
                    <Text style={styles.counterValue}>{quantities[item.id] || 1}</Text>
                    <TouchableOpacity
                      style={styles.counterButton}
                      onPress={(event) => {
                        event.stopPropagation();
                        updateQuantity(item, 1);
                      }}
                    >
                      <Text style={styles.counterText}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.cartButton,
                      (addingProductId !== null || getMaxQuantity(item) <= 0) && styles.cartButtonDisabled,
                    ]}
                    disabled={addingProductId !== null || getMaxQuantity(item) <= 0}
                    onPress={(event) => {
                      event.stopPropagation();
                      addToCart(item);
                    }}
                  >
                    <Text style={styles.cartButtonText}>
                      {addingProductId === item.id
                        ? 'Ekleniyor...'
                        : addingProductId
                          ? 'Bekleyin'
                          : getMaxQuantity(item) <= 0
                            ? 'Stok Yok'
                            : 'Sepete Ekle'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Indirimli urun bulunamadi</Text>
              <Text style={styles.emptyText}>
                Arama metnini, kategori veya depo filtresini degistirerek tekrar deneyin.
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => {
                  setSearch('');
                  setSelectedCategory('');
                  setSelectedWarehouse('');
                  setSortBy('name-asc');
                  setProductTotal(null);
                }}
              >
                <Text style={styles.emptyButtonText}>Filtreleri Temizle</Text>
              </TouchableOpacity>
            </View>
          }
          ListFooterComponent={
            sortedProducts.length > 0 ? (
              <View style={styles.listFooter}>
                {loadingMore ? (
                  <ActivityIndicator color={colors.primary} />
                ) : hasMore ? (
                  <TouchableOpacity style={styles.loadMoreButton} onPress={loadMoreProducts}>
                    <Text style={styles.loadMoreButtonText}>Daha Fazla Yukle</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.footerText}>Listenin sonu</Text>
                )}
              </View>
            ) : null
          }
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
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  listHeader: {
    marginBottom: spacing.md,
  },
  columnRow: {
    gap: spacing.md,
  },
  columnItem: {
    flex: 1,
  },
  header: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  hero: {
    backgroundColor: colors.background,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  heroKicker: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.danger,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xxl,
    color: colors.textStrong,
  },
  heroSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    lineHeight: fontSizes.sm + 6,
    color: colors.textMuted,
  },
  heroMetricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  heroMetric: {
    minWidth: 86,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  heroMetricValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.lg,
    color: colors.textStrong,
  },
  heroMetricLabel: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  search: {
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
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  filterButton: {
    flex: 1,
    minWidth: 120,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterButtonText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  clearButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  clearButtonText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  filterSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  filterChip: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  segment: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '85%',
  },
  modalTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.lg,
    color: colors.text,
    marginBottom: spacing.md,
  },
  modalContent: {
    gap: spacing.lg,
    paddingBottom: spacing.lg,
  },
  modalSection: {
    gap: spacing.sm,
  },
  modalLabel: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  optionList: {
    gap: spacing.xs,
  },
  optionItem: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionItemActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  optionText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  optionTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.primary,
  },
  modalCloseButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  modalCloseText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
    fontSize: fontSizes.md,
  },
  segmentButton: {
    flex: 1,
    minWidth: 96,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  segmentTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: '#FFFFFF',
  },
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
  },
  resultSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  resultText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    marginBottom: spacing.md,
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
    flex: 1,
  },
  badge: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.primary,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeWrap: {
    alignItems: 'flex-end',
    gap: 4,
    maxWidth: 112,
  },
  bundleBadge: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#7C2D12',
    backgroundColor: '#FFEDD5',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  excessBadge: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#166534',
    backgroundColor: '#DCFCE7',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  code: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  priceStack: {
    gap: spacing.xs,
  },
  priceText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  priceActive: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  priceNote: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.accent,
  },
  cartRow: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  counterButton: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  counterText: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  counterValue: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  cartButton: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  cartButtonDisabled: {
    opacity: 0.55,
  },
  cartButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
  },
  imageWrap: {
    height: 120,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    marginBottom: spacing.sm,
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: '#FFFFFF',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  imagePlaceholderText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: colors.textMuted,
  },
  emptyState: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.lg,
    color: colors.text,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  emptyButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  emptyButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
  },
  listFooter: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  loadMoreButton: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadMoreButtonText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.primary,
  },
  footerText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
});
