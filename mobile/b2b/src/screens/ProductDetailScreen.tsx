import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';

import { customerApi } from '../api/customer';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Product } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getDisplayPrice, getVatLabel } from '../utils/vat';
import { getUnitConversionLabel } from '../utils/unit';

type PriceType = 'INVOICED' | 'WHITE';

type ProductDetailRoute = RouteProp<RootStackParamList, 'ProductDetail'>;

export function ProductDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<ProductDetailRoute>();
  const { user } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
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

  useEffect(() => {
    fetchProduct();
  }, []);

  const updateQuantity = (delta: number) => {
    setQuantity((prev) => Math.max(1, prev + delta));
  };

  const addToCart = async () => {
    if (!product) return;
    try {
      await customerApi.addToCart({
        productId: product.id,
        quantity,
        priceType,
        priceMode: product.pricingMode === 'EXCESS' ? 'EXCESS' : 'LIST',
      });
      Alert.alert('Sepete Eklendi', `${product.name} sepete eklendi.`);
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
  const maxOrderQuantity = product.maxOrderQuantity ?? product.availableStock ?? product.excessStock ?? 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Geri Don</Text>
        </TouchableOpacity>

        <View style={styles.card}>
          <Text style={styles.title}>{product.name}</Text>
          <Text style={styles.meta}>Kod: {product.mikroCode}</Text>
          {product.category?.name && <Text style={styles.meta}>Kategori: {product.category.name}</Text>}
          {unitLabel && <Text style={styles.meta}>{unitLabel}</Text>}

          <View style={styles.stockRow}>
            <Text style={styles.stockLabel}>Stok</Text>
            <Text style={styles.stockValue}>{product.availableStock ?? product.excessStock ?? 0}</Text>
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
  stockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  stockLabel: {
    fontFamily: fonts.medium,
    color: colors.textMuted,
  },
  stockValue: {
    fontFamily: fonts.bold,
    color: colors.text,
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
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
  },
});
