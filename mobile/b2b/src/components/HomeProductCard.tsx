import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { Product, User } from '../types';
import { colors, fonts, radius, spacing } from '../theme';
import {
  CustomerPriceType,
  getProductListPrice,
  getProductRawPrice,
  getProductStock,
  hasVisibleDiscount,
} from '../utils/product';
import { resolveImageUrl } from '../utils/image';
import { getDisplayPrice, getVatLabel } from '../utils/vat';

type Props = {
  product: Product;
  user?: User | null;
  width?: number;
  adding?: boolean;
  onPress: () => void;
  onAdd: () => void;
};

const formatPrice = (value: number) =>
  `${value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;

export function HomeProductCard({ product, user, width = 188, adding, onPress, onAdd }: Props) {
  const visibility = user?.priceVisibility || 'INVOICED_ONLY';
  const priceType: CustomerPriceType = visibility === 'WHITE_ONLY' ? 'WHITE' : 'INVOICED';
  const rawPrice = getProductRawPrice(product, priceType);
  const displayPrice = getDisplayPrice(rawPrice, product.vatRate, priceType, user?.vatDisplayPreference);
  const listRawPrice = getProductListPrice(product, priceType);
  const displayListPrice = getDisplayPrice(
    listRawPrice,
    product.vatRate,
    priceType,
    user?.vatDisplayPreference
  );
  const discounted = hasVisibleDiscount(product, priceType);
  const stock = getProductStock(product);
  const imageUrl = resolveImageUrl(product.imageUrl || product.images?.[0]);

  return (
    <TouchableOpacity activeOpacity={0.9} style={[styles.card, { width }]} onPress={onPress}>
      <View style={styles.imageShell}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="contain" />
        ) : (
          <View style={styles.imageFallback}>
            <Ionicons name="cube-outline" size={34} color={colors.textMuted} />
          </View>
        )}
        {discounted ? (
          <View style={styles.discountBadge}>
            <Text style={styles.discountBadgeText}>AVANTAJLI</Text>
          </View>
        ) : product.agreement ? (
          <View style={[styles.discountBadge, styles.agreementBadge]}>
            <Text style={styles.discountBadgeText}>ANLASMALI</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text style={styles.code} numberOfLines={1}>{product.mikroCode}</Text>
        <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
        <Text style={styles.stock} numberOfLines={1}>
          {stock > 0 ? `${stock.toLocaleString('tr-TR')} ${product.unit || 'adet'} stokta` : 'Stokta yok'}
        </Text>
        <View style={styles.priceRow}>
          <View style={styles.priceCopy}>
            {discounted ? <Text style={styles.listPrice}>{formatPrice(displayListPrice)}</Text> : null}
            <Text style={styles.price}>{formatPrice(displayPrice)}</Text>
            <Text style={styles.priceMeta}>{getVatLabel(priceType, user?.vatDisplayPreference)}</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`${product.name} sepete ekle`}
            disabled={adding || stock <= 0}
            style={[styles.addButton, (adding || stock <= 0) && styles.addButtonDisabled]}
            onPress={(event) => {
              event.stopPropagation();
              onAdd();
            }}
          >
            {adding ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="add" size={21} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  imageShell: {
    position: 'relative',
    height: 150,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  image: { width: '100%', height: '100%' },
  imageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  discountBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.danger,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  agreementBadge: { backgroundColor: colors.accent },
  discountBadgeText: { fontFamily: fonts.bold, fontSize: 8, color: '#FFFFFF' },
  body: { minHeight: 144, padding: spacing.md },
  code: { fontFamily: fonts.mono, fontSize: 9, color: colors.textMuted },
  name: {
    minHeight: 40,
    marginTop: 4,
    fontFamily: fonts.semibold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textStrong,
  },
  stock: {
    marginTop: 4,
    fontFamily: fonts.medium,
    fontSize: 10,
    color: colors.accent,
  },
  priceRow: {
    minHeight: 48,
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  priceCopy: { minWidth: 0, flex: 1 },
  listPrice: {
    fontFamily: fonts.medium,
    fontSize: 10,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  price: { fontFamily: fonts.bold, fontSize: 15, color: colors.primaryDark },
  priceMeta: { fontFamily: fonts.medium, fontSize: 8, color: colors.textMuted },
  addButton: {
    width: 38,
    height: 38,
    flexShrink: 0,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  addButtonDisabled: { backgroundColor: colors.borderStrong },
});
