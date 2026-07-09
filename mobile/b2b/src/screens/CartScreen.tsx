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
import { ActiveGiftCampaign, CartItem, GiftCampaignGift, Product, RecommendationGroup } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { resolveImageUrl } from '../utils/image';
import { trackCustomerActivity } from '../utils/activity';
import { getDisplayPrice, getVatLabel } from '../utils/vat';

type PriceType = 'INVOICED' | 'WHITE';

const getApiErrorMessage = (err: any, fallback: string) => {
  const candidate = err?.response?.data?.error || err?.response?.data?.message || err?.message;
  if (typeof candidate === 'string') return candidate;
  if (candidate && typeof candidate === 'object') return candidate.message || candidate.code || fallback;
  return fallback;
};

export function CartScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totals, setTotals] = useState({ subtotal: 0, totalVat: 0, total: 0 });
  const [recommendationGroups, setRecommendationGroups] = useState<RecommendationGroup[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [giftCampaign, setGiftCampaign] = useState<ActiveGiftCampaign | null>(null);
  const [giftLoading, setGiftLoading] = useState(false);
  const [selectedGiftProductIds, setSelectedGiftProductIds] = useState<string[]>([]);
  const [savingGift, setSavingGift] = useState(false);
  const [lineNotes, setLineNotes] = useState<Record<string, string>>({});
  const [savingLineNoteId, setSavingLineNoteId] = useState<string | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [addingRecommendationId, setAddingRecommendationId] = useState<string | null>(null);
  const [customerOrderNumber, setCustomerOrderNumber] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [showRecommendationGroups, setShowRecommendationGroups] = useState(false);
  const updatingItemIdRef = useRef<string | null>(null);
  const savingGiftRef = useRef(false);
  const savingLineNoteIdRef = useRef<string | null>(null);
  const addingRecommendationIdRef = useRef<string | null>(null);
  const submittingOrderRef = useRef(false);
  const cartFetchSeqRef = useRef(0);
  const recommendationsSeqRef = useRef(0);
  const giftFetchSeqRef = useRef(0);
  const vatPreference = user?.vatDisplayPreference || 'WITH_VAT';
  const listColumns = width >= 900 ? 2 : 1;

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

  const cartSummary = useMemo(() => {
    const quantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const invoicedLines = items.filter((item) => item.priceType === 'INVOICED').length;
    const whiteLines = items.filter((item) => item.priceType === 'WHITE').length;
    return { quantity, invoicedLines, whiteLines };
  }, [items]);

  const mergedRecommendations = useMemo(() => {
    const map = new Map<string, Product & { baseProductName?: string; baseProductCode?: string }>();
    recommendationGroups.forEach((group) => {
      group.products.forEach((product) => {
        if (map.has(product.id)) return;
        map.set(product.id, {
          ...product,
          baseProductName: group.baseProduct.name,
          baseProductCode: group.baseProduct.mikroCode,
        });
      });
    });
    return Array.from(map.values()).slice(0, 16);
  }, [recommendationGroups]);

  const fetchCart = async () => {
    const requestSeq = ++cartFetchSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const cart = await customerApi.getCart();
      if (requestSeq !== cartFetchSeqRef.current) return;
      const nextItems = cart.items || [];
      setItems(nextItems);
      setTotals({ subtotal: cart.subtotal, totalVat: cart.totalVat, total: cart.total });
      const notes: Record<string, string> = {};
      nextItems.forEach((item) => {
        notes[item.id] = item.lineNote || '';
      });
      setLineNotes(notes);
    } catch (err: any) {
      if (requestSeq === cartFetchSeqRef.current) {
        setError(getApiErrorMessage(err, 'Sepet yuklenemedi.'));
      }
    } finally {
      if (requestSeq === cartFetchSeqRef.current) {
        setLoading(false);
      }
    }
  };

  const fetchRecommendations = async (cartItems: CartItem[]) => {
    if (!cartItems || cartItems.length === 0) {
      recommendationsSeqRef.current += 1;
      setRecommendationGroups([]);
      setRecommendationsLoading(false);
      return;
    }
    const requestSeq = ++recommendationsSeqRef.current;
    setRecommendationsLoading(true);
    try {
      const response = await customerApi.getCartRecommendations();
      if (requestSeq === recommendationsSeqRef.current) {
        setRecommendationGroups(response.groups || []);
      }
    } catch {
      if (requestSeq === recommendationsSeqRef.current) {
        setRecommendationGroups([]);
      }
    } finally {
      if (requestSeq === recommendationsSeqRef.current) {
        setRecommendationsLoading(false);
      }
    }
  };

  const fetchGiftCampaign = async () => {
    const requestSeq = ++giftFetchSeqRef.current;
    setGiftLoading(true);
    try {
      const response = await customerApi.getActiveGiftCampaign();
      if (requestSeq !== giftFetchSeqRef.current) return;
      setGiftCampaign(response?.active ? response : null);
      setSelectedGiftProductIds(response?.active ? response.selectedGiftProductIds || [] : []);
    } catch {
      if (requestSeq === giftFetchSeqRef.current) {
        setGiftCampaign(null);
        setSelectedGiftProductIds([]);
      }
    } finally {
      if (requestSeq === giftFetchSeqRef.current) {
        setGiftLoading(false);
      }
    }
  };

  const updateQuantity = async (item: CartItem, nextQuantity: number) => {
    if (updatingItemIdRef.current) return;
    if (nextQuantity <= 0) {
      await removeItem(item);
      return;
    }
    updatingItemIdRef.current = item.id;
    setUpdatingItemId(item.id);
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
      Alert.alert('Hata', getApiErrorMessage(err, 'Guncelleme basarisiz.'));
    } finally {
      updatingItemIdRef.current = null;
      setUpdatingItemId(null);
    }
  };

  const removeItem = async (item: CartItem) => {
    if (updatingItemIdRef.current) return;
    updatingItemIdRef.current = item.id;
    setUpdatingItemId(item.id);
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
      Alert.alert('Hata', getApiErrorMessage(err, 'Urun silinemedi.'));
    } finally {
      updatingItemIdRef.current = null;
      setUpdatingItemId(null);
    }
  };

  const saveLineNote = async (item: CartItem) => {
    const current = (item.lineNote || '').trim();
    const next = (lineNotes[item.id] || '').trim();
    if (current === next || savingLineNoteIdRef.current) return;

    savingLineNoteIdRef.current = item.id;
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
      Alert.alert('Hata', getApiErrorMessage(err, 'Satir notu kaydedilemedi.'));
      setLineNotes((prev) => ({ ...prev, [item.id]: item.lineNote || '' }));
    } finally {
      savingLineNoteIdRef.current = null;
      setSavingLineNoteId(null);
    }
  };

  const createOrder = async () => {
    if (submittingOrderRef.current) return;
    if (items.length === 0) {
      Alert.alert('Bilgi', 'Sepet bos.');
      return;
    }
    submittingOrderRef.current = true;
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
      await fetchGiftCampaign();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Siparis olusturulamadi.'));
    } finally {
      submittingOrderRef.current = false;
      setSubmittingOrder(false);
    }
  };

  const createRequest = async () => {
    if (submittingOrderRef.current) return;
    if (items.length === 0) {
      Alert.alert('Bilgi', 'Sepet bos.');
      return;
    }
    submittingOrderRef.current = true;
    setSubmittingOrder(true);
    try {
      await customerApi.createOrderRequest();
      Alert.alert('Talep Gonderildi', 'Talebiniz yonetici onayina gonderildi.');
      await fetchCart();
      await fetchGiftCampaign();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Talep gonderilemedi.'));
    } finally {
      submittingOrderRef.current = false;
      setSubmittingOrder(false);
    }
  };

  const handleRecommendationAdd = async (product: Product) => {
    if (addingRecommendationIdRef.current) return;
    addingRecommendationIdRef.current = product.id;
    setAddingRecommendationId(product.id);
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
      await fetchGiftCampaign();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Sepete eklenemedi.'));
    } finally {
      addingRecommendationIdRef.current = null;
      setAddingRecommendationId(null);
    }
  };

  useEffect(() => {
    fetchCart();
    fetchGiftCampaign();
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

  const toggleGift = async (gift: GiftCampaignGift) => {
    if (!giftCampaign?.id || !giftCampaign.qualified || savingGiftRef.current) return;
    const pickCount = Math.max(1, Number(giftCampaign.giftPickCount || 1));
    const exists = selectedGiftProductIds.includes(gift.productId);
    let next = exists
      ? selectedGiftProductIds.filter((id) => id !== gift.productId)
      : [...selectedGiftProductIds, gift.productId];
    if (next.length > pickCount) {
      next = next.slice(next.length - pickCount);
    }
    setSelectedGiftProductIds(next);
    savingGiftRef.current = true;
    setSavingGift(true);
    try {
      await customerApi.setGiftCampaignSelection({
        campaignId: next.length > 0 ? giftCampaign.id : null,
        productIds: next,
      });
      trackCustomerActivity({
        type: 'CART_UPDATE',
        meta: { field: 'giftCampaign', campaignId: giftCampaign.id, productIds: next },
      });
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Hediye secimi kaydedilemedi.'));
      setSelectedGiftProductIds(giftCampaign.selectedGiftProductIds || []);
    } finally {
      savingGiftRef.current = false;
      setSavingGift(false);
    }
  };

  const renderGiftCampaign = () => {
    if (giftLoading) {
      return (
        <View style={styles.giftCard}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }
    if (!giftCampaign?.active) return null;
    const gifts = giftCampaign.gifts || [];
    const qualified = Boolean(giftCampaign.qualified);
    const pickCount = Math.max(1, Number(giftCampaign.giftPickCount || 1));

    return (
      <View style={styles.giftCard}>
        {(giftCampaign.mobileBannerImageUrl || giftCampaign.bannerImageUrl) ? (
          <Image
            source={{ uri: resolveImageUrl(giftCampaign.mobileBannerImageUrl || giftCampaign.bannerImageUrl) as string }}
            style={styles.giftBanner}
            resizeMode="cover"
          />
        ) : null}
        <View style={styles.giftHeader}>
          <Text style={styles.giftTitle} numberOfLines={2}>{giftCampaign.title || 'Hediyeli Kampanya'}</Text>
          <Text style={qualified ? styles.giftStatusReady : styles.giftStatusPending} numberOfLines={1}>
            {qualified ? 'Hak kazandiniz' : `${Number(giftCampaign.remaining || 0).toFixed(2)} TL kaldi`}
          </Text>
        </View>
        {!!giftCampaign.subtitle && <Text style={styles.giftSubtitle} numberOfLines={2}>{giftCampaign.subtitle}</Text>}
        <Text style={styles.giftMeta} numberOfLines={2}>
          Baraj: {Number(giftCampaign.threshold || 0).toFixed(2)} TL - Kapsam tutari: {Number(giftCampaign.qualifyingTotal || 0).toFixed(2)} TL
        </Text>
        {qualified ? (
          <>
            <Text style={styles.giftPickText} numberOfLines={2}>
              {pickCount} hediye secin. Secim siparise kampanya hediyesi olarak aktarilir.
            </Text>
            {savingGift && <Text style={styles.noteSaving}>Hediye secimi kaydediliyor...</Text>}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.giftRow}>
              {gifts.map((gift) => {
                const selected = selectedGiftProductIds.includes(gift.productId);
                return (
                  <TouchableOpacity
                    key={gift.productId}
                    style={[
                      styles.giftOption,
                      selected && styles.giftOptionSelected,
                      savingGift && styles.disabledControl,
                    ]}
                    disabled={savingGift}
                    onPress={() => toggleGift(gift)}
                    activeOpacity={0.88}
                  >
                    <View style={styles.giftImageWrap}>
                      {resolveImageUrl(gift.imageUrl) ? (
                        <Image source={{ uri: resolveImageUrl(gift.imageUrl) as string }} style={styles.giftImage} resizeMode="cover" />
                      ) : (
                        <View style={styles.giftImagePlaceholder}>
                          <Text style={styles.recommendationPlaceholderText}>
                            {gift.name?.trim()?.charAt(0)?.toUpperCase() || '?'}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.giftName} numberOfLines={2}>{gift.name}</Text>
                    <Text style={styles.giftCode} numberOfLines={1} ellipsizeMode="middle">{gift.mikroCode}</Text>
                    <Text style={styles.giftValue} numberOfLines={2}>
                      {gift.giftQuantity || 1} {gift.unit || 'adet'} - {Number(gift.normalPrice || gift.value || 0).toFixed(2)} TL
                    </Text>
                    <Text style={selected ? styles.giftSelectedText : styles.giftSelectText} numberOfLines={1}>
                      {selected ? 'Secildi' : 'Sec'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        ) : (
          <Text style={styles.giftPickText} numberOfLines={2}>
            Sepette kampanya kapsamindaki urun tutari baraji gecince hediye secimi acilir.
          </Text>
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
          key={listColumns > 1 ? 'cart-wide' : 'cart-phone'}
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          numColumns={listColumns}
          columnWrapperStyle={listColumns > 1 ? styles.columnWrapper : undefined}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.hero}>
                <Text style={styles.heroKicker}>B2B Sepet</Text>
                <Text style={styles.heroTitle} numberOfLines={1}>Sepet</Text>
                <Text style={styles.heroSubtitle} numberOfLines={2}>Urunleri, fiyat tiplerini, satir notlarini ve hediye secimini siparisten once kontrol edin.</Text>
                <View style={styles.heroMetricRow}>
                  <View style={styles.heroMetric}>
                    <Text style={styles.heroMetricValue}>{items.length}</Text>
                    <Text style={styles.heroMetricLabel}>Kalem</Text>
                  </View>
                  <View style={styles.heroMetric}>
                    <Text style={styles.heroMetricValue}>{cartSummary.quantity.toLocaleString('tr-TR')}</Text>
                    <Text style={styles.heroMetricLabel}>Miktar</Text>
                  </View>
                  <View style={styles.heroMetric}>
                    <Text style={styles.heroMetricValue}>{totals.total.toFixed(2)} TL</Text>
                    <Text style={styles.heroMetricLabel}>Toplam</Text>
                  </View>
                </View>
              </View>
              <View style={styles.trustSummary}>
                <Text style={styles.trustTitle} numberOfLines={1}>Sepet Guven Ozeti</Text>
                <Text style={styles.trustText} numberOfLines={2}>
                  {items.length} kalem - KDV tercihi: {vatPreference === 'WITHOUT_VAT' ? 'KDV haric' : 'KDV dahil'} - Fiyat tipi: {allowedPriceTypes.length > 1 ? 'Faturali/Beyaz' : defaultPriceType === 'WHITE' ? 'Beyaz' : 'Faturali'}
                </Text>
                <Text style={styles.trustText} numberOfLines={2}>
                  Toplam miktar: {cartSummary.quantity.toLocaleString('tr-TR')} - Faturali satir: {cartSummary.invoicedLines} - Beyaz satir: {cartSummary.whiteLines}
                </Text>
                {giftCampaign?.active ? (
                  <Text style={styles.trustText} numberOfLines={2}>
                    Hediye kampanyasi: {giftCampaign.qualified ? 'hak kazanildi' : `${Number(giftCampaign.remaining || 0).toFixed(2)} TL kaldi`}
                  </Text>
                ) : null}
              </View>
              {error && <Text style={styles.error} numberOfLines={3}>{error}</Text>}
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, listColumns > 1 && styles.gridItem]}>
              <View style={styles.cartItemHeader}>
                <View style={styles.cartImageWrap}>
                  {resolveImageUrl(item.product.imageUrl) ? (
                    <Image source={{ uri: resolveImageUrl(item.product.imageUrl) as string }} style={styles.cartImage} resizeMode="cover" />
                  ) : (
                    <View style={styles.cartImagePlaceholder}>
                      <Text style={styles.cartImagePlaceholderText}>{item.product.name?.trim()?.charAt(0)?.toUpperCase() || '?'}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.cartItemInfo}>
                  <Text style={styles.cardTitle} numberOfLines={3} ellipsizeMode="tail">{item.product.name}</Text>
                  <Text style={styles.cardMeta} numberOfLines={1} ellipsizeMode="middle">Kod: {item.product.mikroCode}</Text>
                  <View style={styles.priceBadge}>
                    <Text style={styles.priceBadgeText} numberOfLines={1}>{item.priceType === 'INVOICED' ? 'Faturali fiyat' : 'Beyaz fiyat'}</Text>
                  </View>
                </View>
              </View>
              <Text style={styles.cardMeta} numberOfLines={2}>
                Birim: {getDisplayPrice(item.unitPrice, item.vatRate, item.priceType, vatPreference).toFixed(2)} TL
                {' '}
                ({getVatLabel(item.priceType, vatPreference)})
              </Text>

              <View style={styles.counterRow}>
                <TouchableOpacity
                  style={[styles.counterButton, updatingItemId !== null && styles.disabledControl]}
                  disabled={updatingItemId !== null}
                  onPress={() => updateQuantity(item, item.quantity - 1)}
                >
                  <Text style={styles.counterText}>-</Text>
                </TouchableOpacity>
                <Text style={styles.counterValue}>
                  {updatingItemId === item.id ? '...' : item.quantity}
                </Text>
                <TouchableOpacity
                  style={[styles.counterButton, updatingItemId !== null && styles.disabledControl]}
                  disabled={updatingItemId !== null}
                  onPress={() => updateQuantity(item, item.quantity + 1)}
                >
                  <Text style={styles.counterText}>+</Text>
                </TouchableOpacity>
                <View style={styles.flex} />
                <Text style={styles.totalText} numberOfLines={1}>
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
              <TouchableOpacity
                style={[styles.removeButton, updatingItemId !== null && styles.disabledControl]}
                disabled={updatingItemId !== null}
                onPress={() => removeItem(item)}
              >
                <Text style={styles.removeButtonText}>Sepetten Sil</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyCart}>
              <Text style={styles.emptyTitle}>Sepetiniz bos</Text>
              <Text style={styles.emptyText}>Urun eklediginizde burada miktar, fiyat tipi, not ve kampanya bilgileri gorunur.</Text>
              <TouchableOpacity style={styles.secondaryButtonWide} onPress={() => navigation.navigate('Tabs', { screen: 'Products' })}>
                <Text style={styles.secondaryButtonWideText}>Urunlere Git</Text>
              </TouchableOpacity>
            </View>
          }
          ListFooterComponent={
            <View style={styles.footer}>
              {renderGiftCampaign()}

              {recommendationsLoading ? (
                <View style={styles.recommendationLoading}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : recommendationGroups.length > 0 ? (
                <View style={styles.recommendationBlock}>
                  <Text style={styles.recommendationTitle}>Tamamlayici Oneriler</Text>
                  <Text style={styles.recommendationIntro}>
                    Sepetteki urunlerden gelen oneriler tek listede birlestirildi; ayni urun tekrar gosterilmez.
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.recommendationRow}
                  >
                    {mergedRecommendations.map((product) => (
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
                        <Text style={styles.recommendationBase} numberOfLines={1} ellipsizeMode="tail">
                          {product.baseProductName ? `${product.baseProductName} ile` : 'Sepet onerisi'}
                        </Text>
                        {renderRecommendationPrices(product)}
                        {product.recommendationNote && (
                          <Text style={styles.recommendationNote} numberOfLines={2}>
                            {product.recommendationNote}
                          </Text>
                        )}
                        <TouchableOpacity
                          style={[
                            styles.recommendationButton,
                            addingRecommendationId !== null && styles.disabledControl,
                          ]}
                          disabled={addingRecommendationId !== null}
                          onPress={() => handleRecommendationAdd(product)}
                        >
                          <Text style={styles.recommendationButtonText}>
                            {addingRecommendationId === product.id
                              ? 'Ekleniyor...'
                              : addingRecommendationId
                                ? 'Bekleyin'
                                : 'Sepete Ekle'}
                          </Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  {recommendationGroups.length > 1 && (
                    <TouchableOpacity
                      style={styles.recommendationGroupToggle}
                      onPress={() => setShowRecommendationGroups((value) => !value)}
                    >
                      <Text style={styles.recommendationGroupToggleText}>
                        {showRecommendationGroups ? 'Baz urun kirilimini gizle' : 'Baz urun kirilimini goster'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {showRecommendationGroups && recommendationGroups.map((group) => (
                    <View key={group.baseProduct.id} style={styles.recommendationGroup}>
                      <Text style={styles.recommendationGroupTitle} numberOfLines={2} ellipsizeMode="tail">
                        {group.baseProduct.name} icin
                      </Text>
                      <View style={styles.recommendationGroupPills}>
                        {group.products.slice(0, 8).map((product) => (
                          <Text key={product.id} style={styles.recommendationGroupPill} numberOfLines={1} ellipsizeMode="tail">
                            {product.mikroCode || product.name}
                          </Text>
                        ))}
                      </View>
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
  columnWrapper: {
    gap: spacing.md,
  },
  header: {
    gap: spacing.sm,
  },
  hero: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  heroKicker: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#BFDBFE',
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xxl,
    color: '#FFFFFF',
  },
  heroSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: '#DBEAFE',
    lineHeight: 20,
  },
  heroMetricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  heroMetric: {
    flexGrow: 1,
    minWidth: 92,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    padding: spacing.sm,
  },
  heroMetricValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: '#FFFFFF',
  },
  heroMetricLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: '#BFDBFE',
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
  trustSummary: {
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
  trustText: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    lineHeight: 18,
  },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cartItemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cartImageWrap: {
    width: 76,
    height: 76,
    flexShrink: 0,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cartImage: {
    width: '100%',
    height: '100%',
  },
  cartImagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartImagePlaceholderText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.lg,
    color: colors.textMuted,
  },
  cartItemInfo: {
    flex: 1,
    minWidth: 0,
  },
  gridItem: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.lg,
    color: colors.text,
    minWidth: 0,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  priceBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginTop: spacing.xs,
  },
  priceBadgeText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.primary,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    flexWrap: 'wrap',
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
  disabledControl: {
    opacity: 0.55,
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
    minWidth: 0,
  },
  totalText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
    textAlign: 'right',
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
  removeButton: {
    alignSelf: 'flex-start',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  removeButtonText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.danger,
  },
  footer: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  emptyCart: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.lg,
    color: colors.text,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  secondaryButtonWide: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceAlt,
  },
  secondaryButtonWideText: {
    fontFamily: fonts.semibold,
    color: colors.primary,
  },
  giftCard: {
    backgroundColor: '#FFF7ED',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#FDBA74',
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  giftBanner: {
    width: '100%',
    height: 128,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  giftHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  giftTitle: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: fontSizes.lg,
    color: colors.text,
  },
  giftStatusReady: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontFamily: fonts.bold,
    fontSize: fontSizes.xs,
    color: '#166534',
  },
  giftStatusPending: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontFamily: fonts.bold,
    fontSize: fontSizes.xs,
    color: '#92400E',
  },
  giftSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
    lineHeight: 20,
  },
  giftMeta: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  giftPickText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: '#9A3412',
    lineHeight: 20,
  },
  giftRow: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  giftOption: {
    width: 168,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#FED7AA',
    padding: spacing.sm,
    gap: spacing.xs,
  },
  giftOptionSelected: {
    borderColor: '#16A34A',
    backgroundColor: '#F0FDF4',
  },
  giftImageWrap: {
    height: 88,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  giftImage: {
    width: '100%',
    height: '100%',
  },
  giftImagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftName: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  giftCode: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  giftValue: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.text,
  },
  giftSelectText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xs,
    color: colors.primary,
  },
  giftSelectedText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xs,
    color: '#16A34A',
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
  recommendationIntro: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    lineHeight: 18,
  },
  recommendationGroup: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.sm,
  },
  recommendationGroupTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  recommendationGroupPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  recommendationGroupPill: {
    maxWidth: 160,
    borderRadius: 999,
    backgroundColor: '#E8EEF8',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.primary,
    overflow: 'hidden',
  },
  recommendationGroupToggle: {
    alignSelf: 'flex-start',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: '#F8FBFF',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  recommendationGroupToggleText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xs,
    color: colors.primary,
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
  recommendationBase: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
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
    flexWrap: 'wrap',
    gap: spacing.xs,
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
