import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';

import { customerApi } from '../api/customer';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../navigation/AppNavigator';
import { OrderRequest, OrderRequestItem } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

type PriceType = 'INVOICED' | 'WHITE';

type RequestDetailRoute = RouteProp<RootStackParamList, 'RequestDetail'>;

export function RequestDetailScreen() {
  const route = useRoute<RequestDetailRoute>();
  const { user } = useAuth();
  const [request, setRequest] = useState<OrderRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  const [priceSelections, setPriceSelections] = useState<Record<string, PriceType>>({});

  const priceVisibility = user?.priceVisibility ?? 'INVOICED_ONLY';
  const isParent = !user?.parentCustomerId;

  const fetchRequest = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await customerApi.getOrderRequests();
      const found = response.requests?.find((item) => item.id === route.params.requestId) || null;
      setRequest(found || null);
      if (found?.items) {
        const nextSelected: Record<string, boolean> = {};
        const nextPrices: Record<string, PriceType> = {};
        found.items.forEach((item) => {
          if (item.status === 'PENDING') {
            nextSelected[item.id] = true;
          }
          if (priceVisibility === 'WHITE_ONLY') {
            nextPrices[item.id] = 'WHITE';
          } else {
            nextPrices[item.id] = 'INVOICED';
          }
        });
        setSelectedItems(nextSelected);
        setPriceSelections(nextPrices);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Talep yuklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequest();
  }, [route.params.requestId]);

  const toggleItem = (item: OrderRequestItem) => {
    if (item.status !== 'PENDING') return;
    setSelectedItems((prev) => ({ ...prev, [item.id]: !prev[item.id] }));
  };

  const updatePriceType = (itemId: string, type: PriceType) => {
    setPriceSelections((prev) => ({ ...prev, [itemId]: type }));
  };

  const selectedList = useMemo(() => {
    return request?.items?.filter((item) => selectedItems[item.id]) || [];
  }, [request, selectedItems]);

  const totalSelected = useMemo(() => {
    return selectedList.reduce((sum, item) => {
      const type = priceSelections[item.id] || 'INVOICED';
      if (type === 'WHITE') {
        return sum + (item.previewTotalPriceWhite || 0);
      }
      return sum + (item.previewTotalPriceInvoiced || 0);
    }, 0);
  }, [selectedList, priceSelections]);

  const handleConvert = async () => {
    if (!request) return;
    if (selectedList.length === 0) {
      Alert.alert('Uyari', 'Onaylamak icin urun secin.');
      return;
    }

    const itemsPayload = selectedList.map((item) => ({
      id: item.id,
      priceType: priceVisibility === 'BOTH' ? priceSelections[item.id] : undefined,
    }));

    if (priceVisibility === 'BOTH') {
      const missing = itemsPayload.find((item) => !item.priceType);
      if (missing) {
        Alert.alert('Uyari', 'Tum secili urunler icin fiyat tipi secin.');
        return;
      }
    }

    try {
      await customerApi.convertOrderRequest(request.id, {
        items: itemsPayload,
        note: note.trim() || undefined,
      });
      Alert.alert('Basarili', 'Talep siparise cevrildi.');
      await fetchRequest();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Islem basarisiz.');
    }
  };

  const handleReject = async () => {
    if (!request) return;
    Alert.alert('Talebi Reddet', 'Secili talepleri reddetmek istiyor musunuz?', [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Reddet',
        style: 'destructive',
        onPress: async () => {
          try {
            await customerApi.rejectOrderRequest(request.id, note.trim() || undefined);
            Alert.alert('Basarili', 'Talep reddedildi.');
            await fetchRequest();
          } catch (err: any) {
            Alert.alert('Hata', err?.response?.data?.error || 'Islem basarisiz.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={request?.items || []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Talep kaydi bulunamadi.</Text>
            </View>
          }
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.title}>Talep Detayi</Text>
              <Text style={styles.subtitle}>Durum: {request?.status || '-'}</Text>
              {error && <Text style={styles.error}>{error}</Text>}
              <TextInput
                style={styles.noteInput}
                placeholder="Not ekleyin..."
                placeholderTextColor={colors.textMuted}
                value={note}
                onChangeText={setNote}
              />
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <TouchableOpacity onPress={() => toggleItem(item)}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{item.product.name}</Text>
                  <Text style={styles.cardBadge}>{item.status}</Text>
                </View>
                <Text style={styles.cardMeta}>Kod: {item.product.mikroCode}</Text>
                <Text style={styles.cardMeta}>Miktar: {item.quantity}</Text>
                <Text style={styles.cardMeta}>Tip: {item.priceMode}</Text>
              </TouchableOpacity>

              {priceVisibility === 'BOTH' && item.status === 'PENDING' && (
                <View style={styles.segment}>
                  <TouchableOpacity
                    style={[
                      styles.segmentButton,
                      priceSelections[item.id] === 'INVOICED' && styles.segmentActive,
                    ]}
                    onPress={() => updatePriceType(item.id, 'INVOICED')}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        priceSelections[item.id] === 'INVOICED' && styles.segmentTextActive,
                      ]}
                    >
                      Faturali
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.segmentButton,
                      priceSelections[item.id] === 'WHITE' && styles.segmentActive,
                    ]}
                    onPress={() => updatePriceType(item.id, 'WHITE')}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        priceSelections[item.id] === 'WHITE' && styles.segmentTextActive,
                      ]}
                    >
                      Beyaz
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {item.previewUnitPriceInvoiced !== undefined && (
                <Text style={styles.cardMeta}>
                  Faturali: {item.previewUnitPriceInvoiced?.toFixed(2)} TL
                </Text>
              )}
              {item.previewUnitPriceWhite !== undefined && (
                <Text style={styles.cardMeta}>
                  Beyaz: {item.previewUnitPriceWhite?.toFixed(2)} TL
                </Text>
              )}
              {selectedItems[item.id] && (
                <Text style={styles.selected}>Secildi</Text>
              )}
            </View>
          )}
          ListFooterComponent={
            <View style={styles.footer}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Secili Toplam</Text>
                <Text style={styles.totalValue}>{totalSelected.toFixed(2)} TL</Text>
              </View>
              {isParent ? (
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.primaryButton} onPress={handleConvert}>
                    <Text style={styles.primaryButtonText}>Secilileri Siparise Cevir</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryButton} onPress={handleReject}>
                    <Text style={styles.secondaryButtonText}>Reddet</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.hint}>Yonetici onayi bekleniyor.</Text>
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
  noteInput: {
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.lg,
    color: colors.text,
    flex: 1,
  },
  cardBadge: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.primary,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 4,
    gap: 6,
    marginTop: spacing.sm,
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
  selected: {
    marginTop: spacing.sm,
    fontFamily: fonts.medium,
    color: colors.accent,
  },
  footer: {
    gap: spacing.md,
    marginTop: spacing.md,
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
  actions: {
    gap: spacing.sm,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
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
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  hint: {
    fontFamily: fonts.medium,
    color: colors.textMuted,
  },
  empty: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: fonts.medium,
    color: colors.textMuted,
  },
});
