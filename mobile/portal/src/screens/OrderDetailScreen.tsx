import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { adminApi } from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { Order, OrderItem } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

type OrderDetailRoute = { params: { orderId: string } };

const getItemStatus = (item: OrderItem) => item.status || 'PENDING';

export function OrderDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const route = useRoute() as OrderDetailRoute;
  const { orderId } = route.params;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchOrder = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getOrders();
      const found = response.orders.find((item: Order) => item.id === orderId) || null;
      setOrder(found);
      if (found?.items) {
        const nextSelected: Record<string, boolean> = {};
        found.items.forEach((item) => {
          if (getItemStatus(item) === 'PENDING') {
            nextSelected[item.id] = true;
          }
        });
        setSelectedItems(nextSelected);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Siparis yuklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  const pendingItems = useMemo(() => {
    return order?.items?.filter((item) => getItemStatus(item) === 'PENDING') || [];
  }, [order]);

  const selectedIds = useMemo(
    () => pendingItems.filter((item) => selectedItems[item.id]).map((item) => item.id),
    [pendingItems, selectedItems]
  );

  const toggleItem = (item: OrderItem) => {
    if (getItemStatus(item) !== 'PENDING') return;
    setSelectedItems((prev) => ({ ...prev, [item.id]: !prev[item.id] }));
  };

  const toggleAll = () => {
    if (selectedIds.length === pendingItems.length) {
      setSelectedItems({});
      return;
    }
    const next: Record<string, boolean> = {};
    pendingItems.forEach((item) => {
      next[item.id] = true;
    });
    setSelectedItems(next);
  };

  const approveAll = async () => {
    if (!order) return;
    setSaving(true);
    try {
      await adminApi.approveOrder(order.id, note.trim() || undefined);
      Alert.alert('Basarili', 'Siparis onaylandi.');
      await fetchOrder();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Onay basarisiz.');
    } finally {
      setSaving(false);
    }
  };

  const approveSelected = async () => {
    if (!order) return;
    if (selectedIds.length === 0) {
      Alert.alert('Uyari', 'Onay icin kalem secin.');
      return;
    }
    setSaving(true);
    try {
      await adminApi.approveOrderItems(order.id, {
        itemIds: selectedIds,
        adminNote: note.trim() || undefined,
      });
      Alert.alert('Basarili', 'Secili kalemler onaylandi.');
      await fetchOrder();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Onay basarisiz.');
    } finally {
      setSaving(false);
    }
  };

  const rejectAll = async () => {
    if (!order) return;
    if (!rejectReason.trim()) {
      Alert.alert('Uyari', 'Red nedeni girin.');
      return;
    }
    setSaving(true);
    try {
      await adminApi.rejectOrder(order.id, rejectReason.trim());
      Alert.alert('Basarili', 'Siparis reddedildi.');
      await fetchOrder();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Red basarisiz.');
    } finally {
      setSaving(false);
    }
  };

  const rejectSelected = async () => {
    if (!order) return;
    if (selectedIds.length === 0) {
      Alert.alert('Uyari', 'Red icin kalem secin.');
      return;
    }
    if (!rejectReason.trim()) {
      Alert.alert('Uyari', 'Red nedeni girin.');
      return;
    }
    setSaving(true);
    try {
      await adminApi.rejectOrderItems(order.id, {
        itemIds: selectedIds,
        rejectionReason: rejectReason.trim(),
      });
      Alert.alert('Basarili', 'Secili kalemler reddedildi.');
      await fetchOrder();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Red basarisiz.');
    } finally {
      setSaving(false);
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

  if (!order) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <Text style={styles.error}>{error || 'Siparis bulunamadi.'}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.goBack()}>
            <Text style={styles.primaryButtonText}>Geri Don</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Geri</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Siparis Detayi</Text>
        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{order.orderNumber}</Text>
          <Text style={styles.cardMeta}>Durum: {order.status}</Text>
          <Text style={styles.cardMeta}>Cari: {order.user?.name || '-'}</Text>
          <Text style={styles.cardMeta}>Kod: {order.user?.mikroCariCode || '-'}</Text>
          <Text style={styles.cardMeta}>Tarih: {order.createdAt?.slice?.(0, 10) || '-'}</Text>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Toplam</Text>
            <Text style={styles.totalValue}>{order.totalAmount.toFixed(2)} TL</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryText}>Kalem: {order.items?.length ?? 0}</Text>
            <Text style={styles.summaryText}>Bekleyen: {pendingItems.length}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Kalemler</Text>
          {order.items?.map((item) => (
            <TouchableOpacity key={item.id} style={styles.itemCard} onPress={() => toggleItem(item)}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemTitle}>{item.product?.name || item.productName}</Text>
                <Text style={styles.itemBadge}>{getItemStatus(item)}</Text>
              </View>
              <Text style={styles.itemMeta}>Kod: {item.product?.mikroCode || item.mikroCode}</Text>
              <Text style={styles.itemMeta}>Miktar: {item.quantity}</Text>
              <Text style={styles.itemMeta}>Tip: {item.priceType === 'WHITE' ? 'Beyaz' : 'Faturali'}</Text>
              <Text style={styles.itemMeta}>Birim: {item.unitPrice.toFixed(2)} TL</Text>
              <Text style={styles.itemMeta}>Toplam: {item.totalPrice.toFixed(2)} TL</Text>
              {item.rejectionReason && (
                <Text style={styles.itemMeta}>Red: {item.rejectionReason}</Text>
              )}
              {selectedItems[item.id] && getItemStatus(item) === 'PENDING' && (
                <Text style={styles.selected}>Secildi</Text>
              )}
            </TouchableOpacity>
          ))}
          {(order.items || []).length === 0 && <Text style={styles.emptyText}>Kalem yok.</Text>}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Not / Red Nedeni</Text>
          <TextInput
            style={styles.input}
            placeholder="Onay notu"
            placeholderTextColor={colors.textMuted}
            value={note}
            onChangeText={setNote}
          />
          <TextInput
            style={styles.input}
            placeholder="Red nedeni"
            placeholderTextColor={colors.textMuted}
            value={rejectReason}
            onChangeText={setRejectReason}
          />
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={toggleAll}>
            <Text style={styles.secondaryButtonText}>
              {selectedIds.length === pendingItems.length && pendingItems.length > 0
                ? 'Secimi Kaldir'
                : 'Tumunu Sec'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryButton} onPress={approveAll} disabled={saving}>
            <Text style={styles.primaryButtonText}>Tumunu Onayla</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryButton} onPress={approveSelected} disabled={saving}>
            <Text style={styles.primaryButtonText}>Secili Onayla</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={rejectSelected} disabled={saving}>
            <Text style={styles.secondaryButtonText}>Secili Reddet</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={rejectAll} disabled={saving}>
            <Text style={styles.secondaryButtonText}>Tumunu Reddet</Text>
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
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  container: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  backText: {
    fontFamily: fonts.medium,
    color: colors.primary,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: colors.text,
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
    fontSize: fontSizes.md,
    color: colors.text,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontFamily: fonts.medium,
    color: colors.textMuted,
  },
  totalValue: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  summaryText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  itemCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  itemTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
    flex: 1,
  },
  itemBadge: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.primary,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  itemMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  selected: {
    fontFamily: fonts.medium,
    color: colors.accent,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  actions: {
    gap: spacing.sm,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
});
