import { useEffect, useMemo, useState } from 'react';
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
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { customerApi } from '../api/customer';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../navigation/AppNavigator';
import { CartItem, Product, RecommendationGroup } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { resolveImageUrl } from '../utils/image';
import { trackCustomerActivity } from '../utils/activity';
import { getDisplayPrice, getVatLabel } from '../utils/vat';

type PriceType = 'INVOICED' | 'WHITE';

export function CartScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totals, setTotals] = useState({ subtotal: 0, totalVat: 0, total: 0 });
  const [recommendationGroups, setRecommendationGroups] = useState<RecommendationGroup[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [lineNotes, setLineNotes] = useState<Record<string, string>>({});
  const [savingLineNoteId, setSavingLineNoteId] = useState<string | null>(null);
  const [customerOrderNumber, setCustomerOrderNumber] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const vatPreference = user?.vatDisplayPreference || 'WITH_VAT';

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

  const defaultPriceType = allowedPriceTypes[0] ?? 'INVOICED';

  const fetchCart = async () => {
    setLoading(true);
    setError(null);
    try {
      const cart = await customerApi.getCart();
      const nextItems = cart.items || [];
      setItems(nextItems);
      setTotals({ subtotal: cart.subtotal, totalVat: cart.totalVat, total: cart.total });
      const notes: Record<string, string> = {};
      nextItems.forEach((item) => {
        notes[item.id] = item.lineNote || '';
      });
      setLineNotes(notes);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Sepet yuklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  const fetchRecommendations = async (cartItems: CartItem[]) => {
    if (!cartItems || cartItems.length === 0) {
      setRecommendationGroups([]);
      return;
    }
    setRecommendationsLoading(true);
    try {
      const response = await customerApi.getCartRecommendations();
      setRecommendationGroups(response.groups || []);
    } catch {
      setRecommendationGroups([]);
    } finally {
      setRecommendationsLoading(false);
    }
  };

  const updateQuantity = async (item: CartItem, nextQuantity: number) => {
    if (nextQuantity <= 0) {
      await removeItem(item);
      return;
    }
    try {
      await customerApi.updateCartItem(item.id, { quantity: nextQuantity });
      trackCustomerActivity({
        type: 'CART_UPDATE',
        cartItemId: item.id,
        productId: item.product.id,
        productCode: item.product.mikroCode,
        quantity: nextQuantity,
      });
      await fetchCart();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Guncelleme basarisiz.');
    }
  };

  const removeItem = async (item: CartItem) => {
    try {
      await customerApi.removeFromCart(item.id);
      trackCustomerActivity({
        type: 'CART_REMOVE',
        cartItemId: item.id,
        productId: item.product.id,
        productCode: item.product.mikroCode,
      });
      await fetchCart();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Urun silinemedi.');
    }
  };

  const saveLineNote = async (item: CartItem) => {
    const current = (item.lineNote || '').trim();
    const next = (lineNotes[item.id] || '').trim();
    if (current === next) return;

    setSavingLineNoteId(item.id);
    try {
      await customerApi.updateCartItem(item.id, { lineNote: next || null });
      trackCustomerActivity({
        type: 'CART_UPDATE',
        cartItemId: item.id,
        productId: item.product.id,
        productCode: item.product.mikroCode,
        meta: { field: 'lineNote' },
      });
      setItems((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, lineNote: next || null } : row))
      );
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Satir notu kaydedilemedi.');
      setLineNotes((prev) => ({ ...prev, [item.id]: item.lineNote || '' }));
    } finally {
      setSavingLineNoteId(null);
    }
  };

  const createOrder = async () => {
    if (items.length === 0) {
      Alert.alert('Bilgi', 'Sepet bos.');
      return;
    }
    setSubmittingOrder(true);
    try {
      const result = await customerApi.createOrder({
        customerOrderNumber: customerOrderNumber.trim() || undefined,
        deliveryLocation: deliveryLocation.trim() || undefined,
      });
      Alert.alert('Siparis Olustu', `Siparis No: ${result.orderNumber}`);
      setCustomerOrderNumber('');
      setDeliveryLocation('');
      await fetchCart();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Siparis olusturulamadi.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const createRequest = async () => {
    if (items.length === 0) {
      Alert.alert('Bilgi', 'Sepet bos.');
      return;
    }
    setSubmittingOrder(true);
    try {
      await customerApi.createOrderRequest();
      Alert.alert('Talep Gonderildi', 'Talebiniz yonetici onayina gonderildi.');
      await fetchCart();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Talep gonderilemedi.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleRecommendationAdd = async (product: Product) => {
    try {
      await customerApi.addToCart({
        productId: product.id,
        quantity: 1,
        priceType: defaultPriceType,
        priceMode: product.pricingMode === 'EXCESS' ? 'EXCESS' : 'LIST',
      });
      trackCustomerActivity({
        type: 'CART_ADD',
        productId: product.id,
        productCode: product.mikroCode,
        quantity: 1,
        meta: { source: 'cart-recommendations' },
      });
      Alert.alert('Sepete Eklendi', `${product.name} sepete eklendi.`);
      await fetchCart();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Sepete eklenemedi.');
    }
  };

  useEffect(() => {
    fetchCart();
  }, []);

  useEffect(() => {
    fetchRecommendations(items);
  }, [items]);

  const renderRecommendationPrices = (product: Product) => {
    const vatRate = typeof product.vatRate === 'number' ? product.vatRate : 0;
    const lines: Array<{ label: string; value: number; type: PriceType }> = [];
    if (allowedPriceTypes.includes('INVOICED')) {
      lines.push({
        label: 'Faturali',
        value: getDisplayPrice(product.prices.invoiced, vatRate, 'INVOICED', vatPreference),
        type: 'INVOICED',
      });
    }
    if (allowedPriceTypes.includes('WHITE')) {
      lines.push({
        label: 'Beyaz',
        value: getDisplayPrice(product.prices.white, vatRate, 'WHITE', vatPreference),
        type: 'WHITE',
      });
    }

    return (
      <View style={styles.recommendationPriceStack}>
        {lines.map((line) => (
          <Text key={line.label} style={styles.recommendationPriceLine}>
            {line.label}: {line.value.toFixed(2)} TL
          </Text>
        ))}
        {lines.length === 1 && (
          <Text style={styles.recommendationVat}>{getVatLabel(lines[0].type, vatPreference)}</Text>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.title}>Sepet</Text>
              <Text style={styles.subtitle}>Secili urunler burada.</Text>
              {error && <Text style={styles.error}>{error}</Text>}
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.product.name}</Text>
              <Text style={styles.cardMeta}>Kod: {item.product.mikroCode}</Text>
              <Text style={styles.cardMeta}>
                Birim: {getDisplayPrice(item.unitPrice, item.vatRate, item.priceType, vatPreference).toFixed(2)} TL
                {' '}
                ({getVatLabel(item.priceType, vatPreference)})
              </Text>

              <View style={styles.counterRow}>
                <TouchableOpacity
                  style={styles.counterButton}
                  onPress={() => updateQuantity(item, item.quantity - 1)}
                >
                  <Text style={styles.counterText}>-</Text>
                </TouchableOpacity>
                <Text style={styles.counterValue}>{item.quantity}</Text>
                <TouchableOpacity
                  style={styles.counterButton}
                  onPress={() => updateQuantity(item, item.quantity + 1)}
                >
                  <Text style={styles.counterText}>+</Text>
                </TouchableOpacity>
                <View style={styles.flex} />
                <Text style={styles.totalText}>
                  {getDisplayPrice(item.totalPrice, item.vatRate, item.priceType, vatPreference).toFixed(2)} TL
                </Text>
              </View>

              <Text style={styles.noteLabel}>Satir notu (opsiyonel)</Text>
              <TextInput
                style={styles.noteInput}
                multiline
                numberOfLines={2}
                value={lineNotes[item.id] ?? ''}
                onChangeText={(value) => setLineNotes((prev) => ({ ...prev, [item.id]: value }))}
                onEndEditing={() => saveLineNote(item)}
                placeholder="Marka, renk, teslimat notu..."
                placeholderTextColor={colors.textMuted}
              />
              {savingLineNoteId === item.id ? (
                <Text style={styles.noteSaving}>Kaydediliyor...</Text>
              ) : null}
            </View>
          )}
          ListFooterComponent={
            <View style={styles.footer}>
              {recommendationsLoading ? (
                <View style={styles.recommendationLoading}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : recommendationGroups.length > 0 ? (
                <View style={styles.recommendationBlock}>
                  <Text style={styles.recommendationTitle}>Tamamlayici Oneriler</Text>
                  {recommendationGroups.map((group) => (
                    <View key={group.baseProduct.id} style={styles.recommendationGroup}>
                      <Text style={styles.recommendationGroupTitle}>
                        {group.baseProduct.name} icin
                      </Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.recommendationRow}
                      >
                        {group.products.map((product) => (
                          <TouchableOpacity
                            key={product.id}
                            style={styles.recommendationCard}
                            onPress={() => navigation.navigate('ProductDetail', { productId: product.id })}
                            activeOpacity={0.9}
                          >
                            <View style={styles.recommendationImageWrap}>
                              {resolveImageUrl(product.imageUrl) ? (
                                <Image
                                  source={{ uri: resolveImageUrl(product.imageUrl) as string }}
                                  style={styles.recommendationImage}
                                  resizeMode="cover"
                                />
                              ) : (
                                <View style={styles.recommendationImagePlaceholder}>
                                  <Text style={styles.recommendationPlaceholderText}>
                                    {product.name?.trim()?.charAt(0)?.toUpperCase() || '?'}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.recommendationName} numberOfLines={2}>
                              {product.name}
                            </Text>
                            {renderRecommendationPrices(product)}
                            {product.recommendationNote && (
                              <Text style={styles.recommendationNote} numberOfLines={2}>
                                {product.recommendationNote}
                              </Text>
                            )}
                            <TouchableOpacity
                              style={styles.recommendationButton}
                              onPress={() => handleRecommendationAdd(product)}
                            >
                              <Text style={styles.recommendationButtonText}>Sepete Ekle</Text>
                            </TouchableOpacity>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.totalCard}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Ara Toplam</Text>
                  <Text style={styles.totalValue}>{totals.subtotal.toFixed(2)} TL</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>KDV</Text>
                  <Text style={styles.totalValue}>{totals.totalVat.toFixed(2)} TL</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Genel Toplam</Text>
                  <Text style={styles.totalValueStrong}>{totals.total.toFixed(2)} TL</Text>
                </View>
              </View>

              {!isSubUser && (
                <View style={styles.orderMetaCard}>
                  <Text style={styles.orderMetaTitle}>Siparis Bilgileri</Text>
                  <TextInput
                    style={styles.metaInput}
                    placeholder="Teslimat birimi / bolge (opsiyonel)"
                    placeholderTextColor={colors.textMuted}
                    value={deliveryLocation}
                    onChangeText={setDeliveryLocation}
                  />
                  <TextInput
                    style={styles.metaInput}
                    placeholder="Musteri siparis no (opsiyonel)"
                    placeholderTextColor={colors.textMuted}
                    value={customerOrderNumber}
                    onChangeText={setCustomerOrderNumber}
                  />
                </View>
              )}

              {isSubUser ? (
                <TouchableOpacity
                  style={[styles.primaryButton, submittingOrder && styles.primaryButtonDisabled]}
                  onPress={createRequest}
                  disabled={submittingOrder}
                >
                  <Text style={styles.primaryButtonText}>
                    {submittingOrder ? 'Gonderiliyor...' : 'Talep Gonder'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.primaryButton, submittingOrder && styles.primaryButtonDisabled]}
                  onPress={createOrder}
                  disabled={submittingOrder}
                >
                  <Text style={styles.primaryButtonText}>
                    {submittingOrder ? 'Olusturuluyor...' : 'Siparis Olustur'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
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
    padding: spacing.xl,
    gap: spacing.md,
  },
  header: {
    gap: spacing.sm,
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
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.lg,
    color: colors.text,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
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
  },
  flex: {
    flex: 1,
  },
  totalText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  noteLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  noteInput: {
    minHeight: 64,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    textAlignVertical: 'top',
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  noteSaving: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  footer: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  recommendationLoading: {
    paddingVertical: spacing.md,
  },
  recommendationBlock: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  recommendationTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.lg,
    color: colors.text,
  },
  recommendationGroup: {
    gap: spacing.sm,
  },
  recommendationGroupTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  recommendationRow: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  recommendationCard: {
    width: 170,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  recommendationImageWrap: {
    height: 90,
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
  recommendationPriceStack: {
    gap: 2,
  },
  recommendationPriceLine: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.text,
  },
  recommendationVat: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
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
    paddingVertical: 6,
    alignItems: 'center',
  },
  recommendationButtonText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#FFFFFF',
  },
  totalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
  },
  totalValue: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  totalValueStrong: {
    fontFamily: fonts.bold,
    color: colors.text,
  },
  orderMetaCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  orderMetaTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  metaInput: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  primaryButton: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
    fontSize: fontSizes.md,
  },
});
