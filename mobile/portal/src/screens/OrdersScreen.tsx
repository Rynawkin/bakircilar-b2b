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
  View,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { adminApi, type AdminOrderSourceFilter, type AdminOrderStatusFilter, type OrdersPagination } from '../api/admin';
import { Order } from '../types';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { hapticLight, hapticSuccess } from '../utils/haptics';

type OrderStatusFilter = AdminOrderStatusFilter;
type OrderSourceFilter = AdminOrderSourceFilter;

const STATUS_FILTERS: Array<{ key: OrderStatusFilter; label: string }> = [
  { key: 'ALL', label: 'Tumu' },
  { key: 'PENDING', label: 'Bekleyen' },
  { key: 'APPROVED', label: 'Onaylanan' },
  { key: 'REJECTED', label: 'Reddedilen' },
];

const SOURCE_FILTERS: Array<{ key: OrderSourceFilter; label: string }> = [
  { key: 'ALL', label: 'Tum Kaynaklar' },
  { key: 'CUSTOMER', label: 'Musteri' },
  { key: 'B2B', label: 'B2B' },
];

const ORDERS_PAGE_SIZE = 25;

const STATUS_META: Record<string, { label: string; bg: string; border: string; text: string }> = {
  PENDING: { label: 'Bekliyor', bg: colors.warningSoft, border: 'rgba(245,158,11,0.32)', text: colors.warning },
  APPROVED: { label: 'Onaylandi', bg: colors.successSoft, border: 'rgba(52,211,153,0.30)', text: colors.success },
  REJECTED: { label: 'Reddedildi', bg: colors.dangerSoft, border: 'rgba(248,113,113,0.30)', text: colors.danger },
};

const SOURCE_META = {
  CUSTOMER: { label: 'Musteri', bg: colors.primaryMuted, border: colors.borderStrong, text: colors.primarySoft },
  REQUEST: { label: 'Talep', bg: colors.purpleSoft, border: 'rgba(183,148,255,0.30)', text: colors.purple },
  B2B: { label: 'B2B', bg: colors.successSoft, border: 'rgba(52,211,153,0.30)', text: colors.success },
} as const;

const getStatusMeta = (status?: string | null) =>
  STATUS_META[String(status || '')] || {
    label: status || 'Bilinmiyor',
    bg: colors.surfaceAlt,
    border: colors.border,
    text: colors.textSoft,
  };

const getSourceMeta = (order: Order) => {
  if (order.customerRequest) return SOURCE_META.REQUEST;
  if (order.requestedBy || order.sourceQuote) return SOURCE_META.B2B;
  return SOURCE_META.CUSTOMER;
};

const getCustomerDisplayName = (order: Order) =>
  order.user?.displayName || order.user?.mikroName || order.user?.name || 'Cari yok';

const getApiErrorMessage = (err: any, fallback: string) => {
  const candidate = err?.response?.data?.error || err?.response?.data?.message || err?.message;
  if (typeof candidate === 'string') return candidate;
  if (candidate && typeof candidate === 'object') return candidate.message || candidate.code || fallback;
  return fallback;
};

const formatCurrency = (value?: number | null) =>
  new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export function OrdersScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const { width } = useWindowDimensions();
  const listColumns = width >= 900 ? 2 : 1;
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('ALL');
  const [sourceFilter, setSourceFilter] = useState<OrderSourceFilter>('ALL');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<OrdersPagination>({
    total: 0,
    page: 1,
    pageSize: ORDERS_PAGE_SIZE,
    totalPages: 1,
  });
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const ordersRequestSeqRef = useRef(0);
  const actionBusyRef = useRef<string | null>(null);
  const firstFetchDoneRef = useRef(false);

  const beginAction = (actionKey: string) => {
    if (actionBusyRef.current) return false;
    actionBusyRef.current = actionKey;
    setActionBusyId(actionKey);
    return true;
  };

  const endAction = () => {
    actionBusyRef.current = null;
    setActionBusyId(null);
  };

  const fetchOrders = async (nextPage = page) => {
    const requestSeq = ordersRequestSeqRef.current + 1;
    ordersRequestSeqRef.current = requestSeq;
    if (firstFetchDoneRef.current) {
      setFetching(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const response = await adminApi.getOrders({
        status: statusFilter,
        source: sourceFilter,
        search: debouncedSearch,
        page: nextPage,
        pageSize: ORDERS_PAGE_SIZE,
      });
      if (requestSeq === ordersRequestSeqRef.current) {
        setOrders(response.orders || []);
        setPagination(
          response.pagination || {
            total: response.orders?.length || 0,
            page: nextPage,
            pageSize: ORDERS_PAGE_SIZE,
            totalPages: 1,
          }
        );
        setSelectedOrderIds(new Set());
      }
    } catch (err: any) {
      if (requestSeq === ordersRequestSeqRef.current) {
        setError(getApiErrorMessage(err, 'Siparisler yuklenemedi.'));
      }
    } finally {
      if (requestSeq === ordersRequestSeqRef.current) {
        setLoading(false);
        setFetching(false);
        firstFetchDoneRef.current = true;
      }
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, sourceFilter, debouncedSearch]);

  useEffect(() => {
    fetchOrders(page);
  }, [statusFilter, sourceFilter, debouncedSearch, page]);

  const summary = useMemo(() => {
    const totalAmount = orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
    const pendingLines = orders.reduce(
      (sum, order) => sum + (order.items || []).filter((line) => (line.status || 'PENDING') === 'PENDING').length,
      0
    );
    return {
      visible: orders.length,
      total: pagination.total,
      totalAmount,
      pendingLines,
    };
  }, [orders, pagination.total]);

  const pendingOrdersOnPage = useMemo(() => orders.filter((order) => order.status === 'PENDING'), [orders]);
  const selectedCount = selectedOrderIds.size;
  const allPendingSelected =
    pendingOrdersOnPage.length > 0 && pendingOrdersOnPage.every((order) => selectedOrderIds.has(order.id));

  const approve = async (orderId: string) => {
    const actionKey = `approve:${orderId}`;
    if (!beginAction(actionKey)) return;
    try {
      await adminApi.approveOrder(orderId);
      hapticSuccess();
      await fetchOrders();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Onay basarisiz.'));
    } finally {
      endAction();
    }
  };

  const reject = async (orderId: string) => {
    if (actionBusyRef.current) return;
    Alert.alert('Siparisi Reddet', 'Siparisi reddetmek istiyor musunuz?', [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Reddet',
        style: 'destructive',
        onPress: async () => {
          const actionKey = `reject:${orderId}`;
          if (!beginAction(actionKey)) return;
          try {
            await adminApi.rejectOrder(orderId, 'Mobil reddedildi');
            hapticSuccess();
            await fetchOrders();
          } catch (err: any) {
            Alert.alert('Hata', getApiErrorMessage(err, 'Red basarisiz.'));
          } finally {
            endAction();
          }
        },
      },
    ]);
  };

  const toggleOrderSelection = (orderId: string) => {
    hapticLight();
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const toggleSelectAllPending = () => {
    hapticLight();
    setSelectedOrderIds((prev) => {
      if (allPendingSelected) return new Set();
      const next = new Set(prev);
      pendingOrdersOnPage.forEach((order) => next.add(order.id));
      return next;
    });
  };

  const bulkApprove = () => {
    if (!selectedCount || actionBusyRef.current) return;
    Alert.alert('Toplu Onay', `${selectedCount} bekleyen siparis onaylansin mi?`, [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Onayla',
        onPress: async () => {
          if (!beginAction('bulk:approve')) return;
          const ids = Array.from(selectedOrderIds);
          let failed = 0;
          try {
            for (const id of ids) {
              try {
                await adminApi.approveOrder(id, 'Mobil toplu onay');
              } catch {
                failed += 1;
              }
            }
            hapticSuccess();
            if (failed) Alert.alert('Kismi Basari', `${ids.length - failed} siparis onaylandi, ${failed} siparis hata verdi.`);
            await fetchOrders(page);
          } finally {
            endAction();
          }
        },
      },
    ]);
  };

  const bulkReject = () => {
    if (!selectedCount || actionBusyRef.current) return;
    Alert.alert('Toplu Red', `${selectedCount} bekleyen siparis reddedilsin mi?`, [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Reddet',
        style: 'destructive',
        onPress: async () => {
          if (!beginAction('bulk:reject')) return;
          const ids = Array.from(selectedOrderIds);
          let failed = 0;
          try {
            for (const id of ids) {
              try {
                await adminApi.rejectOrder(id, 'Mobil toplu reddedildi');
              } catch {
                failed += 1;
              }
            }
            hapticSuccess();
            if (failed) Alert.alert('Kismi Basari', `${ids.length - failed} siparis reddedildi, ${failed} siparis hata verdi.`);
            await fetchOrders(page);
          } finally {
            endAction();
          }
        },
      },
    ]);
  };

  const goToPage = (nextPage: number) => {
    if (fetching || nextPage < 1 || nextPage > pagination.totalPages) return;
    hapticLight();
    setPage(nextPage);
  };

  const renderOrder = ({ item }: { item: Order }) => {
    const statusMeta = getStatusMeta(item.status);
    const sourceMeta = getSourceMeta(item);
    const pendingCount = (item.items || []).filter((line) => (line.status || 'PENDING') === 'PENDING').length;
    const approvedCount = (item.items || []).filter((line) => line.status === 'APPROVED').length;
    const rejectedCount = (item.items || []).filter((line) => line.status === 'REJECTED').length;
    const approveKey = `approve:${item.id}`;
    const rejectKey = `reject:${item.id}`;
    const actionDisabled = Boolean(actionBusyId);
    const isSelected = selectedOrderIds.has(item.id);
    const isPending = item.status === 'PENDING';

    return (
      <View style={[styles.card, listColumns > 1 ? styles.cardGridItem : null]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleBlock}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.orderNumber || 'Siparis'}
            </Text>
            <Text style={styles.customerName} numberOfLines={3}>
              {getCustomerDisplayName(item)}
            </Text>
            {item.user?.mikroCariCode ? <Text style={styles.customerCode}>{item.user.mikroCariCode}</Text> : null}
          </View>
          <View style={styles.cardBadgeStack}>
            {isPending ? (
              <TouchableOpacity
                style={[styles.selectBadge, isSelected ? styles.selectBadgeActive : null]}
                onPress={() => toggleOrderSelection(item.id)}
                disabled={actionDisabled}
              >
                <Text style={[styles.selectBadgeText, isSelected ? styles.selectBadgeTextActive : null]}>
                  {isSelected ? 'Secildi' : 'Sec'}
                </Text>
              </TouchableOpacity>
            ) : null}
            <View style={[styles.statusBadge, { backgroundColor: sourceMeta.bg, borderColor: sourceMeta.border }]}>
              <Text style={[styles.statusText, { color: sourceMeta.text }]}>{sourceMeta.label}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg, borderColor: statusMeta.border }]}>
              <Text style={[styles.statusText, { color: statusMeta.text }]}>{statusMeta.label}</Text>
            </View>
          </View>
        </View>

        <View style={styles.amountRow}>
          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>Toplam</Text>
            <Text style={styles.amountValue} numberOfLines={1} adjustsFontSizeToFit>
              {formatCurrency(item.totalAmount)}
            </Text>
          </View>
          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>Tarih</Text>
            <Text style={styles.amountValueSmall}>{formatDate(item.createdAt)}</Text>
          </View>
        </View>

        <View style={styles.metaGrid}>
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>Kalem</Text>
            <Text style={styles.metaValue}>{item.items?.length || '-'}</Text>
          </View>
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>Bekleyen</Text>
            <Text style={styles.metaValue}>{pendingCount}</Text>
          </View>
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>Onay</Text>
            <Text style={styles.metaValue}>{approvedCount}</Text>
          </View>
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>Red</Text>
            <Text style={styles.metaValue}>{rejectedCount}</Text>
          </View>
        </View>

        {isPending && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.approveButton, actionDisabled ? styles.buttonDisabled : null]}
              onPress={() => approve(item.id)}
              disabled={actionDisabled}
            >
              <Text style={styles.primaryButtonText}>
                {actionBusyId === approveKey ? 'Onaylaniyor...' : 'Onayla'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dangerButton, actionDisabled ? styles.buttonDisabled : null]}
              onPress={() => reject(item.id)}
              disabled={actionDisabled}
            >
              <Text style={styles.dangerButtonText}>{actionBusyId === rejectKey ? 'Reddediliyor...' : 'Reddet'}</Text>
            </TouchableOpacity>
          </View>
        )}
        <TouchableOpacity
          style={styles.fullSecondaryButton}
          onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
        >
          <Text style={styles.secondaryButtonText}>Detay</Text>
        </TouchableOpacity>
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
          key={`orders-${listColumns}`}
          data={orders}
          numColumns={listColumns}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={listColumns > 1 ? styles.columnWrapper : undefined}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.hero}>
                <Text style={styles.heroKicker}>Satis Operasyonu</Text>
                <Text style={styles.heroTitle}>Siparisler</Text>
                <Text style={styles.heroSubtitle}>Onay sureci, cari ve kalem durumlarini hizli takip edin.</Text>
              </View>
              <View style={styles.summaryGrid}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Gosterilen</Text>
                  <Text style={styles.summaryValue}>{summary.visible}</Text>
                  <Text style={styles.summaryHint}>Filtre toplam {summary.total}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Tutar</Text>
                  <Text style={styles.summaryValueSmall} numberOfLines={1} adjustsFontSizeToFit>
                    {formatCurrency(summary.totalAmount)}
                  </Text>
                  <Text style={styles.summaryHint}>Bu sayfa</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Bekleyen Kalem</Text>
                  <Text style={styles.summaryValue}>{summary.pendingLines}</Text>
                  <Text style={styles.summaryHint}>Bu sayfa</Text>
                </View>
              </View>
              <TextInput
                style={styles.search}
                placeholder="Siparis, cari, kod veya urun ara..."
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
              />
              <View style={styles.filterWrap}>
                {STATUS_FILTERS.map((filter) => {
                  const active = statusFilter === filter.key;
                  return (
                    <TouchableOpacity
                      key={filter.key}
                      style={[styles.filterChip, active ? styles.filterChipActive : null]}
                      onPress={() => {
                        hapticLight();
                        setStatusFilter(filter.key);
                      }}
                    >
                      <Text style={[styles.filterText, active ? styles.filterTextActive : null]}>{filter.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.filterWrap}>
                {SOURCE_FILTERS.map((filter) => {
                  const active = sourceFilter === filter.key;
                  return (
                    <TouchableOpacity
                      key={filter.key}
                      style={[styles.sourceChip, active ? styles.sourceChipActive : null]}
                      onPress={() => {
                        hapticLight();
                        setSourceFilter(filter.key);
                      }}
                    >
                      <Text style={[styles.sourceChipText, active ? styles.sourceChipTextActive : null]}>
                        {filter.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {pendingOrdersOnPage.length > 0 ? (
                <View style={styles.bulkBar}>
                  <View style={styles.bulkTextBlock}>
                    <Text style={styles.bulkTitle}>Toplu islem</Text>
                    <Text style={styles.bulkHint}>
                      {selectedCount ? `${selectedCount} siparis secildi` : `${pendingOrdersOnPage.length} bekleyen siparis`}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.bulkSelectButton} onPress={toggleSelectAllPending} disabled={Boolean(actionBusyId)}>
                    <Text style={styles.bulkSelectText}>{allPendingSelected ? 'Secimi temizle' : 'Bekleyenleri sec'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.bulkApproveButton, !selectedCount || actionBusyId ? styles.buttonDisabled : null]}
                    onPress={bulkApprove}
                    disabled={!selectedCount || Boolean(actionBusyId)}
                  >
                    <Text style={styles.bulkApproveText}>
                      {actionBusyId === 'bulk:approve' ? 'Onaylaniyor...' : 'Toplu onay'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.bulkRejectButton, !selectedCount || actionBusyId ? styles.buttonDisabled : null]}
                    onPress={bulkReject}
                    disabled={!selectedCount || Boolean(actionBusyId)}
                  >
                    <Text style={styles.bulkRejectText}>
                      {actionBusyId === 'bulk:reject' ? 'Reddediliyor...' : 'Toplu red'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => {
                    hapticLight();
                    navigation.navigate('OrderCreate');
                  }}
                >
                  <Text style={styles.primaryButtonText}>Manuel Siparis</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => fetchOrders(page)} disabled={fetching}>
                  <Text style={styles.secondaryButtonText}>Yenile</Text>
                </TouchableOpacity>
              </View>
              {fetching ? (
                <View style={styles.fetchingRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.fetchingText}>Liste guncelleniyor...</Text>
                </View>
              ) : null}
              {error && <Text style={styles.error}>{error}</Text>}
            </View>
          }
          renderItem={renderOrder}
          ListFooterComponent={
            pagination.totalPages > 1 ? (
              <View style={styles.pagination}>
                <TouchableOpacity
                  style={[styles.pageButton, page <= 1 || fetching ? styles.pageButtonDisabled : null]}
                  onPress={() => goToPage(page - 1)}
                  disabled={page <= 1 || fetching}
                >
                  <Text style={styles.pageButtonText}>Onceki</Text>
                </TouchableOpacity>
                <Text style={styles.pageText}>
                  Sayfa {pagination.page} / {pagination.totalPages}
                </Text>
                <TouchableOpacity
                  style={[styles.pageButton, page >= pagination.totalPages || fetching ? styles.pageButtonDisabled : null]}
                  onPress={() => goToPage(page + 1)}
                  disabled={page >= pagination.totalPages || fetching}
                >
                  <Text style={styles.pageButtonText}>Sonraki</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Siparis bulunamadi</Text>
              <Text style={styles.emptyText}>Arama veya durum filtresini degistirerek tekrar deneyin.</Text>
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
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
    paddingHorizontal: 1,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  heroKicker: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#BFDBFE',
    letterSpacing: 0,
  },
  heroTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: '#FFFFFF',
  },
  heroSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: '#DBEAFE',
    lineHeight: 20,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
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
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  summaryCard: {
    flexGrow: 1,
    flexBasis: 110,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  summaryValue: {
    fontFamily: fonts.monoSemibold,
    fontSize: fontSizes.lg,
    color: colors.text,
    marginTop: spacing.xs,
  },
  summaryValueSmall: {
    fontFamily: fonts.monoSemibold,
    fontSize: fontSizes.md,
    color: colors.text,
    marginTop: spacing.xs,
  },
  summaryHint: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  search: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  filterWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  sourceChip: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    backgroundColor: colors.primaryMuted,
  },
  sourceChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  filterTextActive: {
    color: '#0B1F3F',
  },
  sourceChipText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.primarySoft,
  },
  sourceChipTextActive: {
    color: '#FFFFFF',
  },
  bulkBar: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  bulkTextBlock: {
    flexGrow: 1,
    flexBasis: 160,
  },
  bulkTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  bulkHint: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  bulkSelectButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  bulkSelectText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  bulkApproveButton: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
  },
  bulkApproveText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: '#FFFFFF',
  },
  bulkRejectButton: {
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.dangerSoft,
  },
  bulkRejectText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.danger,
  },
  fetchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  fetchingText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
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
    shadowColor: '#020713',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  cardGridItem: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cardTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  cardBadgeStack: {
    alignItems: 'flex-end',
    gap: spacing.xs,
    maxWidth: 132,
  },
  cardTitle: {
    fontFamily: fonts.monoSemibold,
    fontSize: fontSizes.sm,
    color: colors.primarySoft,
  },
  customerName: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
    marginTop: spacing.xs,
  },
  customerCode: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    maxWidth: 124,
  },
  statusText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    textAlign: 'center',
  },
  selectBadge: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    minWidth: 76,
    alignItems: 'center',
  },
  selectBadgeActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  selectBadgeText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.text,
  },
  selectBadgeTextActive: {
    color: '#FFFFFF',
  },
  amountRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  amountBox: {
    flex: 1,
    minWidth: 130,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  amountLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  amountValue: {
    fontFamily: fonts.monoSemibold,
    fontSize: fontSizes.lg,
    color: colors.text,
    marginTop: spacing.xs,
  },
  amountValueSmall: {
    fontFamily: fonts.monoMedium,
    fontSize: fontSizes.md,
    color: colors.text,
    marginTop: spacing.xs,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  metaPill: {
    flexGrow: 1,
    flexBasis: 88,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  metaLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  metaValue: {
    fontFamily: fonts.monoMedium,
    fontSize: fontSizes.sm,
    color: colors.text,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    flexWrap: 'wrap',
  },
  primaryButton: {
    flex: 1,
    minWidth: 120,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  approveButton: {
    flex: 1,
    minWidth: 120,
    backgroundColor: '#0F9D68',
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  dangerButton: {
    flex: 1,
    minWidth: 120,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  dangerButtonText: {
    fontFamily: fonts.semibold,
    color: colors.danger,
    textAlign: 'center',
  },
  secondaryButton: {
    flex: 1,
    minWidth: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  fullSecondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginTop: spacing.md,
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
    textAlign: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  pageButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  pageButtonDisabled: {
    opacity: 0.45,
  },
  pageButtonText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  pageText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  emptyState: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  emptyTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.lg,
    color: colors.text,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
