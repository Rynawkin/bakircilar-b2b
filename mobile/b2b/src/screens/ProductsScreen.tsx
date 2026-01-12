import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  SafeAreaView,
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
import { Product } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { resolveImageUrl } from '../utils/image';
import { getDisplayPrice } from '../utils/vat';

type PriceType = 'INVOICED' | 'WHITE';

export function ProductsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [priceType, setPriceType] = useState<PriceType>('INVOICED');
  const [quantities, setQuantities] = useState<Record<string, number>>({});

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
      const response = await customerApi.getProducts(search ? { search } : undefined);
      setProducts(response.products || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Urunler yuklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const updateQuantity = (productId: string, delta: number) => {
    setQuantities((prev) => {
      const current = prev[productId] || 1;
      const next = Math.max(1, current + delta);
      return { ...prev, [productId]: next };
    });
  };

  const addToCart = async (product: Product) => {
    const quantity = quantities[product.id] || 1;
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

  const listHeader = useMemo(() => {
    return (
      <View style={styles.header}>
        <Text style={styles.title}>Urunler</Text>
        <Text style={styles.subtitle}>Anlasmali fiyatlar otomatik uygulanir.</Text>
        <TextInput
          style={styles.search}
          placeholder="Urun ara..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={fetchProducts}
          returnKeyType="search"
        />
        {visibility === 'BOTH' && (
          <View style={styles.segment}>
            <TouchableOpacity
              style={[styles.segmentButton, priceType === 'INVOICED' && styles.segmentActive]}
              onPress={() => setPriceType('INVOICED')}
            >
              <Text
                style={[
                  styles.segmentText,
                  priceType === 'INVOICED' && styles.segmentTextActive,
                ]}
              >
                Faturali
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentButton, priceType === 'WHITE' && styles.segmentActive]}
              onPress={() => setPriceType('WHITE')}
            >
              <Text
                style={[styles.segmentText, priceType === 'WHITE' && styles.segmentTextActive]}
              >
                Beyaz
              </Text>
            </TouchableOpacity>
          </View>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }, [search, error, visibility, priceType]);

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={products}
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
                {typeof item.availableStock === 'number' && (
                  <Text style={styles.code}>Stok: {item.availableStock}</Text>
                )}
                {renderPrices(item)}
                <View style={styles.cartRow}>
                  <View style={styles.counterRow}>
                    <TouchableOpacity
                      style={styles.counterButton}
                      onPress={(event) => {
                        event.stopPropagation();
                        updateQuantity(item.id, -1);
                      }}
                    >
                      <Text style={styles.counterText}>-</Text>
                    </TouchableOpacity>
                    <Text style={styles.counterValue}>{quantities[item.id] || 1}</Text>
                    <TouchableOpacity
                      style={styles.counterButton}
                      onPress={(event) => {
                        event.stopPropagation();
                        updateQuantity(item.id, 1);
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
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 4,
    gap: 6,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  segmentTextActive: {
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
    marginBottom: spacing.md,
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
    flex: 1,
  },
  badge: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.primary,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  code: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  priceStack: {
    marginTop: spacing.md,
    gap: 4,
  },
  priceText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  priceActive: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: colors.primary,
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
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterText: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  counterValue: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.md,
    minWidth: 24,
    textAlign: 'center',
  },
  cartButton: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  cartButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
    fontSize: fontSizes.sm,
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
