import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { customerApi } from '../api/customer';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Product } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { resolveImageUrl } from '../utils/image';
import { getDisplayPrice } from '../utils/vat';

type CollectionRoute = RouteProp<RootStackParamList, 'CollectionDetail'>;
type PriceType = 'INVOICED' | 'WHITE';

const getApiErrorMessage = (err: any, fallback: string) => {
  const candidate = err?.response?.data?.error || err?.response?.data?.message || err?.message;
  if (typeof candidate === 'string') return candidate;
  if (candidate && typeof candidate === 'object') return candidate.message || candidate.code || fallback;
  return fallback;
};

export function CollectionDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<CollectionRoute>();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= 820;
  const [title, setTitle] = useState('Koleksiyon');
  const [subtitle, setSubtitle] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const addingProductIdRef = useRef<string | null>(null);

  const priceType = useMemo<PriceType>(() => {
    if (user?.priceVisibility === 'WHITE_ONLY') return 'WHITE';
    return 'INVOICED';
  }, [user?.priceVisibility]);

  const loadCollection = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await customerApi.getCollection(route.params.collectionId);
      setTitle(result.collection?.title || 'Koleksiyon');
      setSubtitle(result.collection?.subtitle || null);
      setProducts(result.products || []);
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Koleksiyon yuklenemedi.'));
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCollection();
  }, [route.params.collectionId]);

  const getWarehouseTotal = (product: Product) => {
    const stockValues = product.warehouseStocks ? Object.values(product.warehouseStocks) : [];
    const warehouseTotal = stockValues.reduce((sum, value) => sum + (Number(value) || 0), 0);
    return Math.max(Number(product.availableStock) || 0, Number(product.excessStock) || 0, warehouseTotal);
  };

  const getMaxQuantity = (product: Product) => {
    const totalStock = getWarehouseTotal(product);
    const baseStock = product.pricingMode === 'EXCESS' ? product.excessStock ?? totalStock : totalStock;
    return product.maxOrderQuantity ?? baseStock;
  };

  const addToCart = async (product: Product) => {
    if (addingProductIdRef.current) return;
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
        quantity: 1,
        priceType,
        priceMode: product.pricingMode === 'EXCESS' ? 'EXCESS' : 'LIST',
      });
      Alert.alert('Sepete Eklendi', `${product.name} sepete eklendi.`);
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Sepete eklenemedi.'));
    } finally {
      addingProductIdRef.current = null;
      setAddingProductId(null);
    }
  };

  const productPrice = (product: Product) => {
    const base = product.agreement
      ? priceType === 'INVOICED'
        ? product.agreement.priceInvoiced
        : product.agreement.priceWhite
      : priceType === 'INVOICED'
        ? product.prices.invoiced
        : product.prices.white;
    return getDisplayPrice(base, product.vatRate, priceType, user?.vatDisplayPreference).toFixed(2);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Geri Don</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.kicker}>Koleksiyon Detayi</Text>
          <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">{title}</Text>
          {!!subtitle && <Text style={styles.subtitle} numberOfLines={3} ellipsizeMode="tail">{subtitle}</Text>}
          <View style={styles.heroMetricRow}>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue} numberOfLines={1}>{products.length}</Text>
              <Text style={styles.heroMetricLabel} numberOfLines={1}>Urun</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue} numberOfLines={1}>{priceType === 'WHITE' ? 'Beyaz' : 'Faturali'}</Text>
              <Text style={styles.heroMetricLabel} numberOfLines={1}>Fiyat</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue} numberOfLines={1}>{isWide ? 'Tablet' : 'Mobil'}</Text>
              <Text style={styles.heroMetricLabel} numberOfLines={1}>Gorunum</Text>
            </View>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : products.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Urun bulunamadi</Text>
            <Text style={styles.emptyText}>Bu koleksiyonda su an gosterilecek urun yok.</Text>
          </View>
        ) : (
          <View style={[styles.productGrid, isWide && styles.productGridWide]}>
          {products.map((product) => {
            const imageUrl = resolveImageUrl(product.imageUrl);
            return (
              <View key={product.id} style={[styles.productCard, isWide && styles.productCardWide]}>
                <TouchableOpacity
                  style={styles.productMain}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('ProductDetail', { productId: product.id })}
                >
                  {imageUrl ? (
                    <Image source={{ uri: imageUrl }} style={styles.productImage} resizeMode="contain" />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <Text style={styles.placeholderText}>{product.name?.charAt(0)?.toUpperCase() || '?'}</Text>
                    </View>
                  )}
                  <View style={styles.productText}>
                    <Text style={styles.productName} numberOfLines={3} ellipsizeMode="tail">{product.name}</Text>
                    <Text style={styles.productCode} numberOfLines={1} ellipsizeMode="middle">{product.mikroCode}</Text>
                    <View style={styles.badgeRow}>
                      {product.agreement ? <Text style={styles.badge}>Anlasmali</Text> : null}
                      {product.pricingMode === 'EXCESS' ? <Text style={[styles.badge, styles.badgeAmber]}>Fazla stok</Text> : null}
                      {product.isBundle ? <Text style={[styles.badge, styles.badgeBlue]}>Paket</Text> : null}
                    </View>
                    <Text style={styles.productMeta} numberOfLines={1}>Stok: {getWarehouseTotal(product)} {product.unit || ''}</Text>
                    {product.maxOrderQuantity ? <Text style={styles.productMeta} numberOfLines={1}>Maksimum: {product.maxOrderQuantity} {product.unit || ''}</Text> : null}
                    <Text style={styles.productPrice} numberOfLines={1}>{productPrice(product)} TL</Text>
                    {product.agreement ? (
                      <Text style={styles.priceHint} numberOfLines={2}>Min. {product.agreement.minQuantity} {product.unit || ''} - tanimli musteri fiyati</Text>
                    ) : product.pricingMode === 'EXCESS' ? (
                      <Text style={styles.priceHint} numberOfLines={1}>Fazla stok fiyat modu</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.addButton,
                    (addingProductId !== null || getMaxQuantity(product) <= 0) && styles.buttonDisabled,
                  ]}
                  disabled={addingProductId !== null || getMaxQuantity(product) <= 0}
                  onPress={() => addToCart(product)}
                >
                  <Text style={styles.addButtonText}>
                    {addingProductId === product.id
                      ? 'Ekleniyor...'
                      : addingProductId
                        ? 'Bekleyin'
                        : getMaxQuantity(product) <= 0
                          ? 'Stok Yok'
                          : 'Sepete Ekle'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.xl, gap: spacing.md },
  backButton: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  backText: { fontFamily: fonts.semibold, color: colors.primary },
  header: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.xs,
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
  title: { fontFamily: fonts.bold, fontSize: fontSizes.xl, lineHeight: fontSizes.xl + 5, color: '#FFFFFF' },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSizes.sm, lineHeight: fontSizes.sm + 5, color: '#DDE8FF' },
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
  productGrid: { gap: spacing.md },
  productGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  productCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  productCardWide: { flexGrow: 1, flexBasis: 330, maxWidth: '48%' },
  productMain: { flexDirection: 'row', gap: spacing.md },
  productImage: { width: 88, height: 88, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, flexShrink: 0 },
  imagePlaceholder: {
    width: 88,
    height: 88,
    flexShrink: 0,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: { fontFamily: fonts.bold, fontSize: fontSizes.xl, color: colors.textMuted },
  productText: { flex: 1, minWidth: 0, gap: 3 },
  productName: { fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.text, lineHeight: 22 },
  productCode: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  productMeta: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.textMuted },
  productPrice: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: colors.primary },
  priceHint: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  badge: {
    overflow: 'hidden',
    borderRadius: radius.sm,
    backgroundColor: '#DCFCE7',
    color: '#166534',
    fontFamily: fonts.bold,
    fontSize: fontSizes.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  badgeAmber: { backgroundColor: '#FEF3C7', color: '#92400E' },
  badgeBlue: { backgroundColor: '#DBEAFE', color: colors.primary },
  addButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center' },
  buttonDisabled: { opacity: 0.55 },
  addButtonText: { fontFamily: fonts.semibold, color: '#FFFFFF' },
  emptyCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.text },
  emptyText: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.textMuted, marginTop: spacing.xs },
  error: { fontFamily: fonts.medium, color: colors.danger },
});
