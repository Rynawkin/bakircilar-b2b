import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
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

export function ProductDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<ProductDetailRoute>();
  const { user } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [recommendations, setRecommendations] = useState<Product[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [priceType, setPriceType] = useState<PriceType>('INVOICED');

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
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Urun bulunamadi.');
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
    if (!product) return;
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
        meta: { source: 'product-detail' },
      });
      Alert.alert('Sepete Eklendi', `${product.name} sepete eklendi.`);
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Sepete eklenemedi.');
    }
  };

  const addRecommendationToCart = async (item: Product) => {
    try {
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
      Alert.alert('Hata', err?.response?.data?.error || 'Sepete eklenemedi.');
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
  const imageUrl = resolveImageUrl(product.imageUrl);
  const description = product.description?.trim() || 'Aciklama bulunamadi.';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Geri Don</Text>
        </TouchableOpacity>

        <View style={styles.card}>
          <View style={styles.imageWrap}>
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
          <Text style={styles.title}>{product.name}</Text>
          <Text style={styles.meta}>Kod: {product.mikroCode}</Text>
          {product.category?.name && <Text style={styles.meta}>Kategori: {product.category.name}</Text>}
          {unitLabel && <Text style={styles.meta}>{unitLabel}</Text>}
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

          <TouchableOpacity style={styles.primaryButton} onPress={addToCart}>
            <Text style={styles.primaryButtonText}>Sepete Ekle</Text>
          </TouchableOpacity>
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
                  style={styles.recommendationCard}
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
                          <Text style={styles.recommendationName} numberOfLines={2}>
                            {item.name}
                          </Text>
                          <Text style={styles.recommendationCode}>{item.mikroCode}</Text>
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
                  <TouchableOpacity
                    style={styles.recommendationButton}
                    onPress={() => addRecommendationToCart(item)}
                  >
                    <Text style={styles.recommendationButtonText}>Sepete Ekle</Text>
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
  imageWrap: {
    position: 'relative',
    height: 220,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  image: {
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
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.xs,
    gap: spacing.xs,
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
  priceBlock: {
    alignItems: 'flex-start',
  },
  priceLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  priceValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: colors.text,
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
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
