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
import { getDisplayPrice } from '../utils/vat';

type CollectionRoute = RouteProp<RootStackParamList, 'CollectionDetail'>;
type PriceType = 'INVOICED' | 'WHITE';

export function CollectionDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<CollectionRoute>();
  const { user } = useAuth();
  const [title, setTitle] = useState('Koleksiyon');
  const [subtitle, setSubtitle] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      setError(err?.response?.data?.error || 'Koleksiyon yuklenemedi.');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCollection();
  }, [route.params.collectionId]);

  const addToCart = async (product: Product) => {
    try {
      await customerApi.addToCart({
        productId: product.id,
        quantity: 1,
        priceType,
        priceMode: product.pricingMode === 'EXCESS' ? 'EXCESS' : 'LIST',
      });
      Alert.alert('Sepete Eklendi', `${product.name} sepete eklendi.`);
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Sepete eklenemedi.');
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
          <Text style={styles.title}>{title}</Text>
          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
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
          products.map((product) => {
            const imageUrl = resolveImageUrl(product.imageUrl);
            return (
              <View key={product.id} style={styles.productCard}>
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
                    <Text style={styles.productName}>{product.name}</Text>
                    <Text style={styles.productCode}>{product.mikroCode}</Text>
                    <Text style={styles.productMeta}>Stok: {product.availableStock ?? product.excessStock ?? '-'}</Text>
                    <Text style={styles.productPrice}>{productPrice(product)} TL</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.addButton} onPress={() => addToCart(product)}>
                  <Text style={styles.addButtonText}>Sepete Ekle</Text>
                </TouchableOpacity>
              </View>
            );
          })
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
  header: { backgroundColor: colors.primary, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.xs },
  title: { fontFamily: fonts.bold, fontSize: fontSizes.xl, color: '#FFFFFF' },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: '#DDE8FF' },
  productCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  productMain: { flexDirection: 'row', gap: spacing.md },
  productImage: { width: 88, height: 88, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  imagePlaceholder: {
    width: 88,
    height: 88,
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
  addButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center' },
  addButtonText: { fontFamily: fonts.semibold, color: '#FFFFFF' },
  emptyCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.text },
  emptyText: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.textMuted, marginTop: spacing.xs },
  error: { fontFamily: fonts.medium, color: colors.danger },
});
