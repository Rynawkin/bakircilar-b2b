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
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { customerApi } from '../api/customer';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Category, Product } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { trackCustomerActivity } from '../utils/activity';
import { resolveImageUrl } from '../utils/image';
import { getDisplayPrice } from '../utils/vat';

type PriceType = 'INVOICED' | 'WHITE';

export function PurchasedProductsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [priceType, setPriceType] = useState<PriceType>('INVOICED');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'price-asc' | 'price-desc' | 'stock-desc' | 'stock-asc'>('name-asc');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const lastSearchRef = useRef('');

  const visibility = user?.priceVisibility ?? 'INVOICED_ONLY';

  useEffect(() => {
    if (visibility === 'WHITE_ONLY') {
      setPriceType('WHITE');
    }
  }, [visibility]);

  const fetchProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await customerApi.getProducts({
        search: search || undefined,
        categoryId: selectedCategory || undefined,
        warehouse: selectedWarehouse || undefined,
        mode: 'purchased',
      });
      setProducts(response.products || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Daha once alinanlar yuklenemedi.');
    } finally {
      setLoading(false);
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
    } catch (err) {
      console.warn('Filtre verileri yuklenemedi.');
    }
  };

  useEffect(() => {
    loadFilters();
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchProducts();
    }, 300);
    return () => clearTimeout(handler);
  }, [search, selectedCategory, selectedWarehouse]);

  useEffect(() => {
    const term = search.trim();
    if (!term || term === lastSearchRef.current) return;
    lastSearchRef.current = term;
    trackCustomerActivity({
      type: 'SEARCH',
      pagePath: 'PurchasedProducts',
      pageTitle: 'Daha Once Aldiklarim',
      meta: { query: term, source: 'previously-purchased' },
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
        return list.sort((a, b) => b.name.localeCompare(a.name));
      case 'price-asc':
        return list.sort((a, b) => getSortPrice(a) - getSortPrice(b));
      case 'price-desc':
        return list.sort((a, b) => getSortPrice(b) - getSortPrice(a));
      case 'stock-asc':
        return list.sort((a, b) => getWarehouseTotal(a) - getWarehouseTotal(b));
      case 'stock-desc':
        return list.sort((a, b) => getWarehouseTotal(b) - getWarehouseTotal(a));
      default:
        return list.sort((a, b) => a.name.localeCompare(b.name));
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
    const quantity = quantities[product.id] || 1;
    try {
      const maxQty = getMaxQuantity(product);
      if (maxQty <= 0) {
        Alert.alert('Stok Yetersiz', 'Bu urun stokta yok.');
        return;
      }
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
        meta: { source: 'purchased-products-grid' },
      });
      Alert.alert('Sepete Eklendi', `${product.name} sepete eklendi.`);
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Sepete eklenemedi.');
    }
  };

  const renderPrices = (product: Product) => {
    const agreed = product.agreement;
    const base = agreed
      ? { invoiced: agreed.priceInvoiced, white: agreed.priceWhite }
      : product.prices;
    const displayInvoiced = getDisplayPrice(
      base.invoiced,
      product.vatRate,
      'INVOICED',
      user?.vatDisplayPreference
    );
    const displayWhite = getDisplayPrice(
      base.white,
      product.vatRate,
      'WHITE',
      user?.vatDisplayPreference
    );

    const lines: Array<{ label: string; value: number; active: boolean }> = [];
    if (visibility === 'INVOICED_ONLY' || visibility === 'BOTH') {
      lines.push({ label: 'Faturali', value: displayInvoiced, active: priceType === 'INVOICED' });
    }
    if (visibility === 'WHITE_ONLY' || visibility === 'BOTH') {
      lines.push({ label: 'Beyaz', value: displayWhite, active: priceType === 'WHITE' });
    }

    return (
      <View style={styles.priceStack}>
        {lines.map((line) => (
          <Text key={line.label} style={line.active ? styles.priceActive : styles.priceText}>
            {line.label}: {line.value.toFixed(2)} TL
          </Text>
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
        <Text style={styles.title}>Daha Once Aldiklarim</Text>
        <Text style={styles.subtitle}>Sadece satin alinmis urunler.</Text>
        <TextInput
          style={styles.search}
          placeholder="Urun ara..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={fetchProducts}
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
              setSelectedCategory('');
              setSelectedWarehouse('');
              setSortBy('name-asc');
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
  }, [search, error, visibility, priceType, selectedCategoryLabel, selectedWarehouse, sortBy]);

  return (
    <SafeAreaView style={styles.safeArea}>
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
          data={sortedProducts}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={listHeader}
          ListHeaderComponentStyle={styles.listHeader}
          contentContainerStyle={styles.listContent}
          numColumns={2}
          columnWrapperStyle={styles.columnRow}
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
                      resizeMode="cover"
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
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {item.agreement && <Text style={styles.badge}>Anlasmali</Text>}
                </View>
                <Text style={styles.code}>Kod: {item.mikroCode}</Text>
                <Text style={styles.code}>Stok: {getWarehouseTotal(item)}</Text>
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
                    style={styles.cartButton}
                    onPress={(event) => {
                      event.stopPropagation();
                      addToCart(item);
                    }}
                  >
                    <Text style={styles.cartButtonText}>Sepete Ekle</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </View>
          )}
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
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: colors.text,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.md,
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
    gap: spacing.sm,
    alignItems: 'center',
  },
  filterButton: {
    flex: 1,
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
    alignItems: 'center',
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
});
