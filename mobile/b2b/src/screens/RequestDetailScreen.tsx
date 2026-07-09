import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';

import { customerApi } from '../api/customer';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../navigation/AppNavigator';
import { OrderRequest, OrderRequestItem } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';

type PriceType = 'INVOICED' | 'WHITE';

type RequestDetailRoute = RouteProp<RootStackParamList, 'RequestDetail'>;

export function RequestDetailScreen() {
  const route = useRoute<RequestDetailRoute>();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const listColumns = width >= 820 ? 2 : 1;
  const [request, setRequest] = useState<OrderRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  const [priceSelections, setPriceSelections] = useState<Record<string, PriceType>>({});
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const actionLoadingRef = useRef(false);
  const requestSeqRef = useRef(0);

  const beginAction = () => {
    if (actionLoadingRef.current) return false;
    actionLoadingRef.current = true;
    setActionLoading(true);
    return true;
  };

  const endAction = () => {
    actionLoadingRef.current = false;
    setActionLoading(false);
  };

  const priceVisibility = user?.priceVisibility ?? 'INVOICED_ONLY';
  const isParent = !user?.parentCustomerId;

  const fetchRequest = async () => {
    const requestSeq = ++requestSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const response = await customerApi.getOrderRequests();
      if (requestSeq !== requestSeqRef.current) return;
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
      if (requestSeq !== requestSeqRef.current) return;
      setError(getApiErrorMessage(err, 'Talep yuklenemedi.'));
    } finally {
      if (requestSeq === requestSeqRef.current) setLoading(false);
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
    if (!request || actionLoadingRef.current) return;
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

    if (!beginAction()) return;
    try {
      await customerApi.convertOrderRequest(request.id, {
        items: itemsPayload,
        note: note.trim() || undefined,
      });
      Alert.alert('Basarili', 'Talep siparise cevrildi.');
      await fetchRequest();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Islem basarisiz.'));
    } finally {
      endAction();
    }
  };

  const handleReject = async () => {
    if (!request || actionLoadingRef.current || rejectConfirmOpen) return;
    setRejectConfirmOpen(true);
    Alert.alert('Talebi Reddet', 'Secili talepleri reddetmek istiyor musunuz?', [
      { text: 'Vazgec', style: 'cancel', onPress: () => setRejectConfirmOpen(false) },
      {
        text: 'Reddet',
        style: 'destructive',
        onPress: async () => {
          setRejectConfirmOpen(false);
          if (!beginAction()) return;
          try {
            await customerApi.rejectOrderRequest(request.id, note.trim() || undefined);
            Alert.alert('Basarili', 'Talep reddedildi.');
            await fetchRequest();
          } catch (err: any) {
            Alert.alert('Hata', getApiErrorMessage(err, 'Islem basarisiz.'));
          } finally {
            endAction();
          }
        },
      },
    ], { cancelable: true, onDismiss: () => setRejectConfirmOpen(false) });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          key={`request-detail-${listColumns}`}
          data={request?.items || []}
          keyExtractor={(item) => item.id}
          numColumns={listColumns}
          columnWrapperStyle={listColumns > 1 ? styles.columnWrapper : undefined}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Talep kaydi bulunamadi.</Text>
            </View>
          }
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.hero}>
                <Text style={styles.heroKicker}>Talep Ozeti</Text>
                <Text style={styles.heroTitle} numberOfLines={1}>Talep Detayi</Text>
                <Text style={styles.heroSubtitle} numberOfLines={1} ellipsizeMode="middle">
                  Talep #{request?.id?.slice(0, 8) || '-'}
                </Text>
                <View style={styles.heroMetricRow}>
                  <View style={styles.heroMetric}>
                    <Text style={styles.heroMetricValue}>{request?.status || '-'}</Text>
                    <Text style={styles.heroMetricLabel}>Durum</Text>
                  </View>
                  <View style={styles.heroMetric}>
                    <Text style={styles.heroMetricValue}>{request?.items?.length || 0}</Text>
                    <Text style={styles.heroMetricLabel}>Kalem</Text>
                  </View>
                  <View style={styles.heroMetric}>
                    <Text style={styles.heroMetricValue}>{selectedList.length}</Text>
                    <Text style={styles.heroMetricLabel}>Secili</Text>
                  </View>
                  {isParent ? (
                    <View style={styles.heroMetric}>
                      <Text style={styles.heroMetricValue}>{totalSelected.toFixed(2)} TL</Text>
                      <Text style={styles.heroMetricLabel}>Secili Toplam</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              {error && <Text style={styles.error} numberOfLines={3}>{error}</Text>}
              <TextInput
                style={styles.noteInput}
                placeholder="Not ekleyin..."
                placeholderTextColor={colors.textMuted}
                value={note}
                onChangeText={setNote}
                multiline
                numberOfLines={2}
              />
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <TouchableOpacity onPress={() => toggleItem(item)}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle} numberOfLines={3} ellipsizeMode="tail">{item.product.name}</Text>
                  <Text style={styles.cardBadge} numberOfLines={1}>{item.status}</Text>
                </View>
              <Text style={styles.cardMeta} numberOfLines={1} ellipsizeMode="middle">Kod: {item.product.mikroCode}</Text>
              <Text style={styles.cardMeta} numberOfLines={1}>Miktar: {item.quantity}</Text>
              <Text style={styles.cardMeta} numberOfLines={1}>Tip: {item.priceMode}</Text>
              {item.product.unit ? <Text style={styles.cardMeta} numberOfLines={1} ellipsizeMode="tail">Birim: {item.product.unit}</Text> : null}
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
                <Text style={styles.cardMeta} numberOfLines={1}>
                  Faturali: {item.previewUnitPriceInvoiced?.toFixed(2)} TL
                </Text>
              )}
              {item.previewUnitPriceWhite !== undefined && (
                <Text style={styles.cardMeta} numberOfLines={1}>
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
                <Text style={styles.totalValue} numberOfLines={1}>{totalSelected.toFixed(2)} TL</Text>
              </View>
              {isParent ? (
                <View style={styles.actions}>
                  <TouchableOpacity style={[styles.primaryButton, actionLoading && styles.buttonDisabled]} onPress={handleConvert} disabled={actionLoading}>
                    <Text style={styles.primaryButtonText}>{actionLoading ? 'Isleniyor...' : 'Secilileri Siparise Cevir'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.secondaryButton, (actionLoading || rejectConfirmOpen) && styles.buttonDisabled]} onPress={handleReject} disabled={actionLoading || rejectConfirmOpen}>
                    <Text style={styles.secondaryButtonText}>Reddet</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.hint} numberOfLines={2}>Yonetici onayi bekleniyor.</Text>
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
    marginBottom: spacing.sm,
  },
  hero: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 },
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
    lineHeight: fontSizes.xxl + 6,
    color: '#FFFFFF',
  },
  heroSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: '#DBEAFE',
  },
  heroMetricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
    fontSize: fontSizes.sm,
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
    lineHeight: fontSizes.xl + 6,
    color: colors.text,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.md,
    lineHeight: fontSizes.md + 5,
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
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.lg,
    lineHeight: fontSizes.lg + 6,
    color: colors.text,
    flex: 1,
    minWidth: 0,
  },
  cardBadge: {
    flexShrink: 0,
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
    lineHeight: fontSizes.sm + 5,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  segment: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 4,
    gap: 6,
    marginTop: spacing.sm,
  },
  segmentButton: {
    flex: 1,
    minWidth: 96,
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
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  totalLabel: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
    flex: 1,
  },
  totalValue: {
    fontFamily: fonts.semibold,
    color: colors.text,
    flexShrink: 0,
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
  buttonDisabled: {
    opacity: 0.55,
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
