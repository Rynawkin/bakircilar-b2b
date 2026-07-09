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
import { trackCustomerActivity } from '../utils/activity';
import { getDisplayPrice, getVatLabel } from '../utils/vat';
import { getUnitConversionLabel } from '../utils/unit';

type PriceType = 'INVOICED' | 'WHITE';

type ProductDetailRoute = RouteProp<RootStackParamList, 'ProductDetail'>;

const getApiErrorMessage = (err: any, fallback: string) => {
  const candidate = err?.response?.data?.error || err?.response?.data?.message || err?.message;
  if (typeof candidate === 'string') return candidate;
  if (candidate && typeof candidate === 'object') return candidate.message || candidate.code || fallback;
  return fallback;
};

export function ProductDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<ProductDetailRoute>();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [product, setProduct] = useState<Product | null>(null);
  const [recommendations, setRecommendations] = useState<Product[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [priceType, setPriceType] = useState<PriceType>('INVOICED');
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [addingToCart, setAddingToCart] = useState(false);
  const [addingRecommendationId, setAddingRecommendationId] = useState<string | null>(null);
  const addingToCartRef = useRef(false);
  const addingRecommendationIdRef = useRef<string | null>(null);
  const isTablet = width >= 840;
  const recommendationCardWidth = isTablet ? 220 : 185;

  const isSubUser = Boolean(user?.parentCustomerId);
  const effectiveVisibility = isSubUser
    ? user?.priceVisibility === 'WHITE_ONLY'
      ? 'WHITE_ONLY'
      : 'INVOICED_ONLY'
    : user?.priceVisibility || 'INVOICED_ONLY';

  const allowedPriceTypes = useMemo<PriceType[]>(() => {
    if (effectiveVisibility === 'WHITE_ONLY') return ['WHITE'];
    if (effectiveVisibility === 'BOTH') return ['INVOICED', 'WHITE'];
    return ['INVOICED'];
  }, [effectiveVisibility]);

  useEffect(() => {
    if (!allowedPriceTypes.includes(priceType)) {
      setPriceType(allowedPriceTypes[0]);
    }
  }, [allowedPriceTypes, priceType]);

  const fetchProduct = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await customerApi.getProductById(route.params.productId);
      setProduct(data);
      setActiveImageIndex(0);
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Urun bulunamadi.'));
    } finally {
      setLoading(false);
    }
  };

  const fetchRecommendations = async () => {
    setRecommendationsLoading(true);
    try {
      const response = await customerApi.getProductRecommendations(route.params.productId);
      setRecommendations(response.products || []);
    } catch {
      setRecommendations([]);
    } finally {
      setRecommendationsLoading(false);
    }
  };

  useEffect(() => {
    fetchProduct();
    fetchRecommendations();
  }, []);

  useEffect(() => {
    if (!product?.id) return;
    trackCustomerActivity({
      type: 'PRODUCT_VIEW',
      productId: product.id,
      productCode: product.mikroCode,
      pagePath: `ProductDetail?productId=${product.id}`,
      pageTitle: product.name,
      meta: { source: 'mobile' },
    });
  }, [product?.id]);

  const getWarehouseTotal = (item: Product) => {
    const warehouseStocks = item.warehouseStocks || {};
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
    const baseStock = typeof item.availableStock === 'number' ? item.availableStock : 0;
    const excessStock = item.excessStock ?? 0;
    return Math.max(totals, baseStock, excessStock);
  };

  const getMaxQuantity = (item: Product) => {
    const totalStock = getWarehouseTotal(item);
    const baseStock = item.pricingMode === 'EXCESS' ? item.excessStock ?? totalStock : totalStock;
    return item.maxOrderQuantity ?? baseStock;
  };

  const updateQuantity = (delta: number) => {
    if (!product) return;
    setQuantity((prev) => {
      const maxQty = getMaxQuantity(product);
      const next = Math.max(1, Math.min(maxQty, prev + delta));
      if (delta > 0 && prev >= maxQty) {
        Alert.alert('Stok Yetersiz', `Maksimum ${maxQty} adet siparis verebilirsiniz.`);
      }
      return next;
    });
  };

  const addToCart = async () => {
    if (!product || addingToCartRef.current) return;
    try {
      const maxQty = getMaxQuantity(product);
      if (maxQty <= 0) {
        Alert.alert('Stok Yetersiz', 'Bu urun stokta yok.');
        return;
      }
      addingToCartRef.current = true;
      setAddingToCart(true);
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
        meta: { source: 'product-detail' },
      });
      Alert.alert('Sepete Eklendi', `${product.name} sepete eklendi.`);
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Sepete eklenemedi.'));
    } finally {
      addingToCartRef.current = false;
      setAddingToCart(false);
    }
  };

  const addRecommendationToCart = async (item: Product) => {
    if (addingRecommendationIdRef.current) return;
    try {
      const maxQty = getMaxQuantity(item);
      if (maxQty <= 0) {
        Alert.alert('Stok Yetersiz', 'Bu urun stokta yok.');
        return;
      }
      addingRecommendationIdRef.current = item.id;
      setAddingRecommendationId(item.id);
      await customerApi.addToCart({
        productId: item.id,
        quantity: 1,
        priceType,
        priceMode: item.pricingMode === 'EXCESS' ? 'EXCESS' : 'LIST',
      });
      trackCustomerActivity({
        type: 'CART_ADD',
        productId: item.id,
        productCode: item.mikroCode,
        quantity: 1,
        meta: { source: 'product-recommendations' },
      });
      Alert.alert('Sepete Eklendi', `${item.name} sepete eklendi.`);
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Sepete eklenemedi.'));
    } finally {
      addingRecommendationIdRef.current = null;
      setAddingRecommendationId(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!product) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <Text style={styles.error}>{error || 'Urun bulunamadi.'}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.goBack()}>
            <Text style={styles.primaryButtonText}>Geri Don</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const selectedPrice = priceType === 'INVOICED' ? product.prices.invoiced : product.prices.white;
  const displayPrice = getDisplayPrice(
    selectedPrice,
    product.vatRate,
    priceType,
    user?.vatDisplayPreference
  );
  const displayTotal = getDisplayPrice(
    selectedPrice * quantity,
    product.vatRate,
    priceType,
    user?.vatDisplayPreference
  );
  const unitLabel = getUnitConversionLabel(product.unit, product.unit2, product.unit2Factor);
  const maxOrderQuantity = getMaxQuantity(product);
  const totalStock = getWarehouseTotal(product);
  const isDiscounted = product.pricingMode === 'EXCESS';
  const displayStock = isDiscounted ? product.excessStock ?? totalStock : totalStock;
  const stockLabel = isDiscounted ? 'Fazla Stok' : 'Stok';
  const gallery = ((product.images?.length ? product.images : product.imageUrl ? [product.imageUrl] : [])
    .map((item) => resolveImageUrl(item))
    .filter(Boolean)) as string[];
  const imageUrl = gallery[activeImageIndex] || gallery[0] || null;
  const description = product.description?.trim() || 'Aciklama bulunamadi.';
  const listPrice = priceType === 'INVOICED' ? product.listPrices?.invoiced : product.listPrices?.white;
  const activeRawPrice = selectedPrice;
  const sourceLabel = product.isBundle
    ? 'Paket fiyati'
    : product.agreement
      ? 'Musteri anlasmasi'
      : isDiscounted
        ? 'Fazla stok indirimi'
        : 'Cari fiyat listeniz';
  const hasListComparison = typeof listPrice === 'number' && listPrice > activeRawPrice;
  const priceTrustRows = [
    { label: 'Kaynak', value: sourceLabel },
    { label: 'Fiyat tipi', value: priceType === 'INVOICED' ? 'Faturali' : 'Beyaz' },
    { label: 'KDV gosterimi', value: getVatLabel(priceType, user?.vatDisplayPreference) },
    { label: 'Stok kontrolu', value: `${displayStock} ${product.unit || 'adet'} siparise uygun` },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={[styles.container, isTablet && styles.containerTablet]}>
        <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Geri Don</Text>
        </TouchableOpacity>

        <View style={[styles.card, isTablet && styles.cardTablet]}>
          <View style={[styles.mediaColumn, isTablet && styles.mediaColumnTablet]}>
          <View style={[styles.imageWrap, isTablet && styles.imageWrapTablet]}>
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="contain" />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Text style={styles.imagePlaceholderText}>
                  {product.name?.trim()?.charAt(0)?.toUpperCase() || '?'}
                </Text>
              </View>
            )}
            <View style={styles.stockBadge}>
              <Text style={styles.stockBadgeLabel}>{stockLabel}</Text>
              <Text style={styles.stockBadgeValue}>{displayStock}</Text>
            </View>
          </View>
          {gallery.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbnailRow}
            >
              {gallery.map((item, index) => (
                <TouchableOpacity
                  key={`${item}-${index}`}
                  style={[styles.thumbnailButton, activeImageIndex === index && styles.thumbnailActive]}
                  onPress={() => setActiveImageIndex(index)}
                >
                  <Image source={{ uri: item }} style={styles.thumbnailImage} resizeMode="contain" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          </View>
          <View style={styles.detailColumn}>
          <View style={styles.productHero}>
            <Text style={styles.kicker}>{sourceLabel}</Text>
            <Text style={styles.heroTitle} numberOfLines={4} ellipsizeMode="tail">{product.name}</Text>
            <Text style={styles.heroMeta} numberOfLines={1} ellipsizeMode="middle">Kod: {product.mikroCode}</Text>
            {product.category?.name && <Text style={styles.heroMeta} numberOfLines={2} ellipsizeMode="tail">Kategori: {product.category.name}</Text>}
            {unitLabel && <Text style={styles.heroMeta} numberOfLines={2} ellipsizeMode="tail">{unitLabel}</Text>}
            <View style={styles.heroMetrics}>
              <View style={styles.heroMetric}>
                <Text style={styles.heroMetricLabel} numberOfLines={1}>Fiyat</Text>
                <Text style={styles.heroMetricValue} numberOfLines={1}>{displayPrice.toFixed(2)} TL</Text>
              </View>
              <View style={styles.heroMetric}>
                <Text style={styles.heroMetricLabel} numberOfLines={1}>{stockLabel}</Text>
                <Text style={styles.heroMetricValue} numberOfLines={1}>{displayStock}</Text>
              </View>
              <View style={styles.heroMetric}>
                <Text style={styles.heroMetricLabel} numberOfLines={1}>Maks.</Text>
                <Text style={styles.heroMetricValue} numberOfLines={1}>{maxOrderQuantity}</Text>
              </View>
            </View>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoTitle}>Urun Aciklamasi</Text>
            <Text style={styles.infoText}>{description}</Text>
            <View style={styles.infoLine}>
              <Text style={styles.infoLineLabel}>Paketleme</Text>
              <Text style={styles.infoLineValue}>{unitLabel || '-'}</Text>
            </View>
          </View>

          {product.agreement && (
            <View style={styles.agreementBox}>
              <Text style={styles.agreementTitle}>Anlasma</Text>
              <Text style={styles.agreementMeta}>Min: {product.agreement.minQuantity}</Text>
            </View>
          )}

          {product.isBundle && product.bundleContents && product.bundleContents.length > 0 && (
            <View style={styles.bundleBox}>
              <Text style={styles.bundleTitle}>Set Icerigi</Text>
              {product.bundleContents.map((item, index) => (
                <View key={`${item.mikroCode}-${index}`} style={styles.bundleLine}>
                  <View style={styles.bundleLineText}>
                    <Text style={styles.bundleItemName} numberOfLines={2} ellipsizeMode="tail">{item.name}</Text>
                    <Text style={styles.bundleItemCode} numberOfLines={1} ellipsizeMode="middle">{item.mikroCode}</Text>
                  </View>
                  <Text style={styles.bundleQty}>
                    {item.quantity} {item.unit || 'adet'}
                  </Text>
                </View>
              ))}
              {!!product.bundleDiscountPercent && (
                <Text style={styles.bundleDiscount}>Sete ozel indirim: %{product.bundleDiscountPercent}</Text>
              )}
            </View>
          )}

          {allowedPriceTypes.length > 1 && (
            <View style={styles.segment}>
              {allowedPriceTypes.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.segmentButton, priceType === type && styles.segmentActive]}
                  onPress={() => setPriceType(type)}
                >
                  <Text
                    style={
                      priceType === type ? styles.segmentTextActive : styles.segmentText
                    }
                  >
                    {type === 'INVOICED' ? 'Faturali' : 'Beyaz'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.priceBlock}>
            <Text style={styles.priceLabel}>{getVatLabel(priceType, user?.vatDisplayPreference)}</Text>
            <Text style={styles.priceValue}>{displayPrice.toFixed(2)} TL</Text>
          </View>

          <View style={styles.trustBox}>
            <Text style={styles.trustTitle}>Fiyat Guven Karti</Text>
            {priceTrustRows.map((row) => (
              <View key={row.label} style={styles.infoLine}>
                <Text style={styles.infoLineLabel}>{row.label}</Text>
                <Text style={styles.infoLineValue}>{row.value}</Text>
              </View>
            ))}
            {hasListComparison && (
              <View style={styles.savingLine}>
                <Text style={styles.savingLabel}>Liste fiyatina gore avantaj</Text>
                <Text style={styles.savingValue}>
                  {getDisplayPrice(listPrice! - activeRawPrice, product.vatRate, priceType, user?.vatDisplayPreference).toFixed(2)} TL
                </Text>
              </View>
            )}
            {product.agreement && (
              <Text style={styles.trustNote}>
                Bu fiyat size tanimli anlasma kosullarindan gelir. Minimum miktar: {product.agreement.minQuantity}.
              </Text>
            )}
            {isDiscounted && !product.agreement && (
              <Text style={styles.trustNote}>Indirimli fiyat fazla stok miktariyla sinirlidir.</Text>
            )}
          </View>

          <View style={styles.counterRow}>
            <TouchableOpacity style={styles.counterButton} onPress={() => updateQuantity(-1)}>
              <Text style={styles.counterText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.counterValue}>{quantity}</Text>
            <TouchableOpacity style={styles.counterButton} onPress={() => updateQuantity(1)}>
              <Text style={styles.counterText}>+</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.meta}>Maksimum: {maxOrderQuantity}</Text>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Toplam</Text>
            <Text style={styles.totalValue}>{displayTotal.toFixed(2)} TL</Text>
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, (addingToCart || maxOrderQuantity <= 0) && styles.buttonDisabled]}
            disabled={addingToCart || maxOrderQuantity <= 0}
            onPress={addToCart}
          >
            <Text style={styles.primaryButtonText}>
              {addingToCart ? 'Ekleniyor...' : maxOrderQuantity <= 0 ? 'Stok Yok' : 'Sepete Ekle'}
            </Text>
          </TouchableOpacity>
          </View>
        </View>

        {recommendationsLoading ? (
          <View style={styles.recommendationLoading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : recommendations.length > 0 ? (
          <View style={styles.recommendationBlock}>
            <Text style={styles.recommendationTitle}>Tamamlayici Oneriler</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recommendationRow}>
              {recommendations.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.recommendationCard, { width: recommendationCardWidth }]}
                  activeOpacity={0.9}
                  onPress={() => navigation.push('ProductDetail', { productId: item.id })}
                >
                  <View style={styles.recommendationImageWrap}>
                    {resolveImageUrl(item.imageUrl) ? (
                      <Image
                        source={{ uri: resolveImageUrl(item.imageUrl) as string }}
                        style={styles.recommendationImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.recommendationImagePlaceholder}>
                        <Text style={styles.recommendationPlaceholderText}>
                          {item.name?.trim()?.charAt(0)?.toUpperCase() || '?'}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.recommendationContent}>
                    <Text style={styles.recommendationName} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={styles.recommendationCode} numberOfLines={1} ellipsizeMode="middle">{item.mikroCode}</Text>
                    {(() => {
                      const recommendationPrice = priceType === 'INVOICED'
                        ? item.prices.invoiced
                        : item.prices.white;
                      return (
                        <Text style={styles.recommendationPrice}>
                          {getDisplayPrice(
                            recommendationPrice,
                            item.vatRate,
                            priceType,
                            user?.vatDisplayPreference
                          ).toFixed(2)} TL
                        </Text>
                      );
                    })()}
                    {item.recommendationNote && (
                      <Text style={styles.recommendationNote} numberOfLines={2}>
                        {item.recommendationNote}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.recommendationButton,
                      (addingRecommendationId !== null || getMaxQuantity(item) <= 0) && styles.buttonDisabled,
                    ]}
                    disabled={addingRecommendationId !== null || getMaxQuantity(item) <= 0}
                    onPress={() => addRecommendationToCart(item)}
                  >
                    <Text style={styles.recommendationButtonText}>
                      {addingRecommendationId === item.id
                        ? 'Ekleniyor...'
                        : addingRecommendationId
                          ? 'Bekleyin'
                          : getMaxQuantity(item) <= 0
                            ? 'Stok Yok'
                            : 'Sepete Ekle'}
                    </Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}
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
    gap: spacing.lg,
  },
  containerTablet: {
    maxWidth: 1180,
    alignSelf: 'center',
    width: '100%',
    paddingBottom: spacing.xxl,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  backLink: {
    alignSelf: 'flex-start',
  },
  backText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.primary,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardTablet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  mediaColumn: {
    gap: spacing.sm,
  },
  mediaColumnTablet: {
    flex: 0.92,
    minWidth: 320,
  },
  detailColumn: {
    flex: 1,
    minWidth: 0,
    gap: spacing.sm,
  },
  productHero: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: '#173D78',
    shadowColor: '#071B3A',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  kicker: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#BFDBFE',
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: '#FFFFFF',
    lineHeight: 29,
  },
  heroMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: '#DCEAFE',
  },
  heroMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  heroMetric: {
    flexGrow: 1,
    minWidth: 92,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(221,232,255,0.18)',
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  heroMetricLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFDBFE',
  },
  heroMetricValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.sm,
    color: '#FFFFFF',
  },
  imageWrap: {
    position: 'relative',
    height: 220,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  imageWrapTablet: {
    height: 360,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  thumbnailRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  thumbnailButton: {
    width: 64,
    height: 64,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
    padding: 3,
  },
  thumbnailActive: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.display,
    color: colors.textMuted,
  },
  stockBadge: {
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stockBadgeLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  stockBadgeValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: colors.text,
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  infoBlock: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    backgroundColor: colors.surfaceAlt,
  },
  infoTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  infoText: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  infoLine: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  infoLineLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  infoLineValue: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.text,
    flex: 1,
    textAlign: 'right',
  },
  agreementBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  agreementTitle: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  agreementMeta: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
  },
  bundleBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: '#F8FAFC',
  },
  bundleTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  bundleLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  bundleLineText: {
    flex: 1,
    minWidth: 0,
  },
  bundleItemName: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
    lineHeight: 20,
  },
  bundleItemCode: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  bundleQty: {
    flexShrink: 0,
    fontFamily: fonts.bold,
    fontSize: fontSizes.sm,
    color: colors.primary,
  },
  bundleDiscount: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: '#059669',
  },
  segment: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.xs,
    gap: spacing.xs,
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
  priceBlock: {
    alignItems: 'flex-start',
    borderRadius: radius.lg,
    backgroundColor: colors.primaryDark,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#1D4ED8',
  },
  priceLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: '#BFDBFE',
  },
  priceValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: '#FFFFFF',
  },
  trustBox: {
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: '#EFF6FF',
    gap: spacing.xs,
  },
  trustTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: colors.primary,
  },
  trustNote: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    lineHeight: 18,
  },
  savingLine: {
    borderTopWidth: 1,
    borderTopColor: '#BFDBFE',
    paddingTop: spacing.xs,
    marginTop: spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  savingLabel: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.text,
  },
  savingValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xs,
    color: '#15803D',
    textAlign: 'right',
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
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
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
  },
  totalLabel: {
    fontFamily: fonts.medium,
    color: colors.textMuted,
  },
  totalValue: {
    fontFamily: fonts.bold,
    color: colors.text,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
  },
  recommendationLoading: {
    paddingVertical: spacing.md,
  },
  recommendationBlock: {
    gap: spacing.sm,
  },
  recommendationTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.lg,
    color: colors.text,
  },
  recommendationRow: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  recommendationCard: {
    width: 185,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    gap: spacing.xs,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  recommendationImageWrap: {
    height: 100,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  recommendationImage: {
    width: '100%',
    height: '100%',
  },
  recommendationImagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recommendationPlaceholderText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.lg,
    color: colors.textMuted,
  },
  recommendationName: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  recommendationContent: {
    gap: 2,
    minHeight: 84,
  },
  recommendationCode: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  recommendationPrice: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  recommendationNote: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  recommendationButton: {
    marginTop: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  recommendationButtonText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#FFFFFF',
  },
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
  },
});
