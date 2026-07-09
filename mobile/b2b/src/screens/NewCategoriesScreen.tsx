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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { customerApi } from '../api/customer';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Product, UnboughtCategory } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { trackCustomerActivity } from '../utils/activity';
import { resolveImageUrl } from '../utils/image';
import { compareSearchText, includesSearch } from '../utils/search';
import { getDisplayPrice, getVatLabel } from '../utils/vat';

type PriceType = 'INVOICED' | 'WHITE';
type SortMode = 'bestsellerValue' | 'nameAsc';

const PAGE_SIZE = 40;

const formatCurrency = (value: number) => `${(Number(value) || 0).toFixed(2)} TL`;

const getApiErrorMessage = (err: any, fallback: string) => {
  const candidate = err?.response?.data?.error || err?.response?.data?.message || err?.message;
  if (typeof candidate === 'string') return candidate;
  if (candidate && typeof candidate === 'object') return candidate.message || candidate.code || fallback;
  return fallback;
};

export function NewCategoriesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<UnboughtCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('bestsellerValue');
  const [priceType, setPriceType] = useState<PriceType>('INVOICED');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [totalCount, setTotalCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const addingProductIdRef = useRef<string | null>(null);
  const productRequestSeqRef = useRef(0);
  const lastSearchRef = useRef('');

  const visibility = user?.priceVisibility ?? 'INVOICED_ONLY';
  const canShowInvoiced = visibility === 'INVOICED_ONLY' || visibility === 'BOTH';
  const canShowWhite = visibility === 'WHITE_ONLY' || visibility === 'BOTH';
  const listColumns = width >= 920 ? 2 : 1;
  const availableWidth = Math.max(320, width - spacing.lg * 2);
  const productCardWidth =
    listColumns > 1 ? Math.floor((availableWidth - spacing.md * (listColumns - 1)) / listColumns) : undefined;

  useEffect(() => {
    if (visibility === 'WHITE_ONLY') setPriceType('WHITE');
    if (visibility === 'INVOICED_ONLY') setPriceType('INVOICED');
  }, [visibility]);

  const loadProducts = async (reset: boolean) => {
    const requestSeq = reset ? productRequestSeqRef.current + 1 : productRequestSeqRef.current;
    if (reset) {
      productRequestSeqRef.current = requestSeq;
    }
    if (reset) {
      setLoading(true);
      setLoadingMore(false);
      setError(null);
    } else {
      setLoadingMore(true);
    }

    const nextOffset = reset ? 0 : offset;
    try {
      const response = await customerApi.getUnboughtCategoryProducts({
        categoryId: selectedCategory || undefined,
        sort,
        offset: nextOffset,
        limit: PAGE_SIZE,
      });
      const nextProducts = response.products || [];
      if (requestSeq !== productRequestSeqRef.current) return;
      setProducts((prev) => (reset ? nextProducts : [...prev, ...nextProducts]));
      setCategories(response.categories || []);
      setTotalCount(response.totalCount || 0);
      setOffset(nextOffset + nextProducts.length);
      setHasMore(nextProducts.length === PAGE_SIZE && nextOffset + nextProducts.length < (response.totalCount || 0));
    } catch (err: any) {
      if (requestSeq !== productRequestSeqRef.current) return;
      setError(getApiErrorMessage(err, 'Yeni kategoriler yuklenemedi.'));
      if (reset) {
        setProducts([]);
        setCategories([]);
        setTotalCount(0);
        setHasMore(false);
      }
    } finally {
      if (requestSeq === productRequestSeqRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  useEffect(() => {
    loadProducts(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, sort]);

  useEffect(() => {
    const term = search.trim();
    if (!term || term === lastSearchRef.current) return;
    lastSearchRef.current = term;
    trackCustomerActivity({
      type: 'SEARCH',
      pagePath: 'NewCategories',
      pageTitle: 'Yeni Kategoriler',
      meta: { query: term, source: 'new-categories' },
    });
  }, [search]);

  const filteredProducts = useMemo(() => {
    const term = search.trim();
    const base = term
      ? products.filter((product) => {
          return includesSearch(`${product.name || ''} ${product.mikroCode || ''}`, term);
        })
      : products;

    if (sort === 'nameAsc') {
      return [...base].sort((a, b) => compareSearchText(a.name, b.name));
    }
    return base;
  }, [products, search, sort]);

  const getWarehouseTotal = (product: Product) => {
    const stockValues = product.warehouseStocks ? Object.values(product.warehouseStocks) : [];
    const warehouseTotal = stockValues.reduce((sum, value) => sum + (Number(value) || 0), 0);
    return Math.max(Number(product.availableStock) || 0, Number(product.excessStock) || 0, warehouseTotal);
  };

  const getMaxQuantity = (product: Product) => product.maxOrderQuantity ?? getWarehouseTotal(product);

  const updateQuantity = (product: Product, delta: number) => {
    setQuantities((prev) => {
      const current = prev[product.id] || 1;
      const maxQty = Math.max(0, getMaxQuantity(product));
      const next = Math.max(1, Math.min(maxQty || 1, current + delta));
      if (delta > 0 && maxQty > 0 && current >= maxQty) {
        Alert.alert('Stok Yetersiz', `Maksimum ${maxQty} adet siparis verebilirsiniz.`);
      }
      return { ...prev, [product.id]: next };
    });
  };

  const addToCart = async (product: Product) => {
    if (addingProductIdRef.current) return;
    const quantity = quantities[product.id] || 1;
    const maxQty = getMaxQuantity(product);
    if (maxQty <= 0) {
      Alert.alert('Stok Yetersiz', 'Bu urun stokta yok.');
      return;
    }

    try {
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
        meta: { source: 'new-categories' },
      });
      Alert.alert('Sepete Eklendi', `${product.name} sepete eklendi.`);
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Sepete eklenemedi.'));
    } finally {
      addingProductIdRef.current = null;
      setAddingProductId(null);
    }
  };

  const renderPrice = (product: Product) => {
    const agreement = product.agreement;
    const base = agreement
      ? {
          invoiced: agreement.priceInvoiced,
          white: agreement.priceWhite,
        }
      : product.prices;
    const raw = priceType === 'INVOICED' ? base.invoiced : base.white;
    const value = getDisplayPrice(raw, product.vatRate, priceType, user?.vatDisplayPreference);

    return (
      <View style={styles.priceBlock}>
        <Text style={styles.priceLabel}>{priceType === 'INVOICED' ? 'Faturali' : 'Beyaz'} - {getVatLabel(priceType, user?.vatDisplayPreference)}</Text>
        <Text style={styles.price}>{formatCurrency(value)}</Text>
      </View>
    );
  };

  const renderProduct = ({ item }: { item: Product }) => {
    const imageUrl = resolveImageUrl(item.imageUrl);
    const quantity = quantities[item.id] || 1;
    const stock = getWarehouseTotal(item);

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        style={[styles.productCard, productCardWidth ? { width: productCardWidth } : null]}
        onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
      >
        <View style={styles.imageFrame}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.productImage} resizeMode="contain" />
          ) : (
            <Text style={styles.noImage}>Gorsel yok</Text>
          )}
        </View>
        <View style={styles.productBody}>
          <View style={styles.productHeader}>
            <Text style={styles.productName} numberOfLines={3}>{item.name}</Text>
            {!!item.category?.name && <Text style={styles.categoryText} numberOfLines={1}>{item.category.name}</Text>}
            <Text style={styles.codeText}>{item.mikroCode}</Text>
          </View>

          <View style={styles.badgeRow}>
            <Text style={[styles.badge, stock > 0 ? styles.stockBadge : styles.noStockBadge]}>
              Stok {stock.toFixed(0)}
            </Text>
            {item.agreement && <Text style={[styles.badge, styles.agreementBadge]}>Anlasma</Text>}
            {item.pricingMode === 'EXCESS' && <Text style={[styles.badge, styles.discountBadge]}>Indirim</Text>}
          </View>

          {renderPrice(item)}

          <View style={styles.bottomRow}>
            <View style={styles.quantityControl}>
              <TouchableOpacity style={styles.quantityButton} onPress={() => updateQuantity(item, -1)}>
                <Text style={styles.quantityButtonText}>-</Text>
              </TouchableOpacity>
              <Text style={styles.quantityText}>{quantity}</Text>
              <TouchableOpacity style={styles.quantityButton} onPress={() => updateQuantity(item, 1)}>
                <Text style={styles.quantityButtonText}>+</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.addButton, (addingProductId !== null || stock <= 0) && styles.addButtonDisabled]}
              disabled={addingProductId !== null || stock <= 0}
              onPress={() => addToCart(item)}
            >
              <Text style={styles.addButtonText}>
                {addingProductId === item.id
                  ? 'Ekleniyor...'
                  : addingProductId
                    ? 'Bekleyin'
                    : stock <= 0
                      ? 'Stok Yok'
                      : 'Sepete Ekle'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const header = (
    <View style={styles.headerWrap}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Kategori kesfi</Text>
        <Text style={styles.title}>Yeni Kategoriler</Text>
        <Text style={styles.subtitle}>Daha once hic almadigin kategorilerdeki uygun urunleri kesfet.</Text>
        <View style={styles.heroMetricRow}>
          <View style={styles.heroMetric}>
            <Text style={styles.heroMetricValue}>{categories.length}</Text>
            <Text style={styles.heroMetricLabel}>Kategori</Text>
          </View>
          <View style={styles.heroMetric}>
            <Text style={styles.heroMetricValue}>{totalCount}</Text>
            <Text style={styles.heroMetricLabel}>Urun</Text>
          </View>
          <View style={styles.heroMetric}>
            <Text style={styles.heroMetricValue}>{priceType === 'WHITE' ? 'Beyaz' : 'Faturali'}</Text>
            <Text style={styles.heroMetricLabel}>Fiyat</Text>
          </View>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Kategori</Text>
          <Text style={styles.summaryValue}>{categories.length}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Urun</Text>
          <Text style={styles.summaryValue}>{totalCount}</Text>
        </View>
      </View>

      <View style={styles.controlCard}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Urun adi veya kodu ara"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <TouchableOpacity
            style={[styles.chip, selectedCategory === '' && styles.chipActive]}
            onPress={() => setSelectedCategory('')}
          >
            <Text style={[styles.chipText, selectedCategory === '' && styles.chipTextActive]}>Tumu</Text>
          </TouchableOpacity>
          {categories.map((category) => (
            <TouchableOpacity
              key={category.id}
              style={[styles.chip, selectedCategory === category.id && styles.chipActive]}
              onPress={() => setSelectedCategory(category.id)}
            >
              <Text style={[styles.chipText, selectedCategory === category.id && styles.chipTextActive]} numberOfLines={1}>
                {category.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.segmentRow}>
          <TouchableOpacity
            style={[styles.segment, sort === 'bestsellerValue' && styles.segmentActive]}
            onPress={() => setSort('bestsellerValue')}
          >
            <Text style={[styles.segmentText, sort === 'bestsellerValue' && styles.segmentTextActive]}>Cok Satan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segment, sort === 'nameAsc' && styles.segmentActive]}
            onPress={() => setSort('nameAsc')}
          >
            <Text style={[styles.segmentText, sort === 'nameAsc' && styles.segmentTextActive]}>A-Z</Text>
          </TouchableOpacity>
        </View>

        {visibility === 'BOTH' && (
          <View style={styles.segmentRow}>
            <TouchableOpacity
              style={[styles.segment, priceType === 'INVOICED' && styles.segmentActive]}
              onPress={() => setPriceType('INVOICED')}
            >
              <Text style={[styles.segmentText, priceType === 'INVOICED' && styles.segmentTextActive]}>Faturali</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segment, priceType === 'WHITE' && styles.segmentActive]}
              onPress={() => setPriceType('WHITE')}
            >
              <Text style={[styles.segmentText, priceType === 'WHITE' && styles.segmentTextActive]}>Beyaz</Text>
            </TouchableOpacity>
          </View>
        )}
        {!canShowInvoiced && canShowWhite && <Text style={styles.visibilityNote}>Bu hesapta yalniz beyaz fiyat gosteriliyor.</Text>}
      </View>

      {error && (
        <TouchableOpacity style={styles.errorCard} onPress={() => loadProducts(true)}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.retryText}>Tekrar dene</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Yeni kategoriler yukleniyor...</Text>
        </View>
      ) : (
        <FlatList
          key={`new-categories-${listColumns}`}
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          renderItem={renderProduct}
          numColumns={listColumns}
          columnWrapperStyle={listColumns > 1 ? styles.columnRow : undefined}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{categories.length ? 'Urun bulunamadi' : 'Tum kategoriler denenmis'}</Text>
              <Text style={styles.emptyText}>
                {categories.length
                  ? 'Arama veya kategori filtresini degistir.'
                  : 'Yeni kategori firsatlari olustugunda burada gorunecek.'}
              </Text>
            </View>
          }
          ListFooterComponent={
            hasMore ? (
              <TouchableOpacity style={styles.loadMoreButton} onPress={() => loadProducts(false)} disabled={loadingMore}>
                {loadingMore ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.loadMoreText}>Daha Fazla Yukle</Text>
                )}
              </TouchableOpacity>
            ) : (
              <View style={styles.footerGap} />
            )
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  columnRow: { gap: spacing.md },
  headerWrap: { gap: spacing.md },
  hero: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#173D78',
    shadowColor: '#071B3A',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  kicker: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFD7FF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: { fontFamily: fonts.bold, fontSize: fontSizes.xxl, color: '#FFFFFF', marginTop: spacing.xs },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSizes.sm, lineHeight: fontSizes.sm + 5, color: '#DDE8FF', marginTop: spacing.xs },
  heroMetricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
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
  heroMetricValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: '#FFFFFF',
  },
  heroMetricLabel: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFD7FF',
  },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  summaryCard: {
    flex: 1,
    minWidth: 130,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  summaryLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  summaryValue: { fontFamily: fonts.bold, fontSize: fontSizes.xl, color: colors.text, marginTop: spacing.xs },
  controlCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  searchInput: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
    backgroundColor: '#F8FBFF',
  },
  chipRow: { gap: spacing.sm, paddingRight: spacing.md },
  chip: {
    maxWidth: 190,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F8FBFF',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.textMuted },
  chipTextActive: { color: '#FFFFFF' },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F8FBFF',
    overflow: 'hidden',
  },
  segment: { flex: 1, minWidth: 96, alignItems: 'center', paddingVertical: spacing.sm },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.textMuted },
  segmentTextActive: { color: '#FFFFFF' },
  visibilityNote: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  productCard: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  imageFrame: {
    width: 104,
    minHeight: 132,
    borderRadius: radius.md,
    backgroundColor: '#F8FBFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DCE8FF',
    overflow: 'hidden',
  },
  productImage: { width: '100%', height: '100%' },
  noImage: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted, textAlign: 'center' },
  productBody: { flex: 1, minWidth: 0, gap: spacing.sm },
  productHeader: { gap: 3 },
  productName: { fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.text, lineHeight: 21 },
  categoryText: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.primarySoft },
  codeText: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  badge: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    fontFamily: fonts.semibold,
    fontSize: 10,
    overflow: 'hidden',
  },
  stockBadge: { backgroundColor: '#E8F7EF', color: '#047857' },
  noStockBadge: { backgroundColor: '#FEE2E2', color: colors.danger },
  agreementBadge: { backgroundColor: '#EAF1FF', color: colors.primary },
  discountBadge: { backgroundColor: '#FFF4DF', color: '#B45309' },
  priceBlock: { backgroundColor: '#F8FBFF', borderRadius: radius.md, padding: spacing.sm },
  priceLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  price: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text, marginTop: 2 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  quantityButton: { width: 30, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FBFF' },
  quantityButtonText: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: colors.primary },
  quantityText: { minWidth: 34, textAlign: 'center', fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  addButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  addButtonDisabled: {
    opacity: 0.55,
  },
  addButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: '#FFFFFF' },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  loadingText: { fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.textMuted },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.text },
  emptyText: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.textMuted, marginTop: spacing.xs },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: spacing.md,
  },
  errorText: { fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.danger },
  retryText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.danger, marginTop: spacing.xs },
  loadMoreButton: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: '#FFFFFF' },
  footerGap: { height: spacing.md },
});
