import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { customerApi } from '../api/customer';
import { useAuth } from '../context/AuthContext';
import { CartItem } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getDisplayPrice, getVatLabel } from '../utils/vat';

export function CartScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totals, setTotals] = useState({ subtotal: 0, totalVat: 0, total: 0 });
  const vatPreference = user?.vatDisplayPreference || 'WITH_VAT';

  const fetchCart = async () => {
    setLoading(true);
    setError(null);
    try {
      const cart = await customerApi.getCart();
      setItems(cart.items || []);
      setTotals({ subtotal: cart.subtotal, totalVat: cart.totalVat, total: cart.total });
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Sepet yuklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  const updateQuantity = async (itemId: string, nextQuantity: number) => {
    if (nextQuantity <= 0) {
      await removeItem(itemId);
      return;
    }
    try {
      await customerApi.updateCartItem(itemId, nextQuantity);
      await fetchCart();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Guncelleme basarisiz.');
    }
  };

  const removeItem = async (itemId: string) => {
    try {
      await customerApi.removeFromCart(itemId);
      await fetchCart();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Urun silinemedi.');
    }
  };

  const createOrder = async () => {
    try {
      const result = await customerApi.createOrder();
      Alert.alert('Siparis Olustu', `Siparis No: ${result.orderNumber}`);
      await fetchCart();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Siparis olusturulamadi.');
    }
  };

  const createRequest = async () => {
    try {
      await customerApi.createOrderRequest();
      Alert.alert('Talep Gonderildi', 'Talebiniz yonetici onayina gonderildi.');
      await fetchCart();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Talep gonderilemedi.');
    }
  };

  useEffect(() => {
    fetchCart();
  }, []);

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
                  onPress={() => updateQuantity(item.id, item.quantity - 1)}
                >
                  <Text style={styles.counterText}>-</Text>
                </TouchableOpacity>
                <Text style={styles.counterValue}>{item.quantity}</Text>
                <TouchableOpacity
                  style={styles.counterButton}
                  onPress={() => updateQuantity(item.id, item.quantity + 1)}
                >
                  <Text style={styles.counterText}>+</Text>
                </TouchableOpacity>
                <View style={styles.flex} />
                <Text style={styles.totalText}>
                  {getDisplayPrice(item.totalPrice, item.vatRate, item.priceType, vatPreference).toFixed(2)} TL
                </Text>
              </View>
            </View>
          )}
          ListFooterComponent={
            <View style={styles.footer}>
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
                <Text style={styles.totalValue}>{totals.total.toFixed(2)} TL</Text>
              </View>
              {user?.parentCustomerId ? (
                <TouchableOpacity style={styles.primaryButton} onPress={createRequest}>
                  <Text style={styles.primaryButtonText}>Talep Gonder</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.primaryButton} onPress={createOrder}>
                  <Text style={styles.primaryButtonText}>Siparis Olustur</Text>
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
  footer: {
    marginTop: spacing.lg,
    gap: spacing.sm,
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
  primaryButton: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
    fontSize: fontSizes.md,
  },
});
