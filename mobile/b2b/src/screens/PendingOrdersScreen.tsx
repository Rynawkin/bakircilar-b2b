import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import { customerApi } from '../api/customer';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
import { includesSearch } from '../utils/search';

type PendingOrder = {
  mikroOrderNumber: string;
  orderDate: string;
  deliveryDate?: string | null;
  itemCount: number;
  totalAmount: number;
  totalVAT: number;
  grandTotal: number;
  items: Array<{
    productCode: string;
    productName: string;
    unit: string;
    quantity: number;
    deliveredQty: number;
    remainingQty: number;
    unitPrice: number;
    lineTotal: number;
    vat: number;
  }>;
};

export function PendingOrdersScreen() {
  const { width } = useWindowDimensions();
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'OVERDUE' | 'TODAY' | 'FUTURE'>('ALL');

  const isWide = width >= 820;

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await customerApi.getPendingOrders();
      setOrders(data || []);
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Bekleyen siparisler yuklenemedi.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const getDeliveryState = (value?: string | null): 'OVERDUE' | 'TODAY' | 'FUTURE' => {
    if (!value) return 'FUTURE';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'FUTURE';
    const key = date.toISOString().slice(0, 10);
    if (key < todayKey) return 'OVERDUE';
    if (key === todayKey) return 'TODAY';
    return 'FUTURE';
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesFilter = filter === 'ALL' || getDeliveryState(order.deliveryDate || order.orderDate) === filter;
      const haystack = [
        order.mikroOrderNumber,
        order.orderDate,
        order.deliveryDate,
        ...order.items.flatMap((line) => [line.productCode, line.productName, line.unit]),
      ].join(' ');
      return matchesFilter && includesSearch(haystack, search);
    });
  }, [orders, search, filter, todayKey]);

  const summary = useMemo(() => {
    const remainingQty = filteredOrders.reduce(
      (sum, order) => sum + order.items.reduce((lineSum, line) => lineSum + Number(line.remainingQty || 0), 0),
      0
    );
    return {
      count: filteredOrders.length,
      lines: filteredOrders.reduce((sum, order) => sum + Number(order.itemCount || order.items.length || 0), 0),
      amount: filteredOrders.reduce((sum, order) => sum + (order.grandTotal || 0), 0),
      remainingQty,
      overdue: orders.filter((order) => getDeliveryState(order.deliveryDate || order.orderDate) === 'OVERDUE').length,
    };
  }, [filteredOrders, orders, todayKey]);

  const formatDate = (value?: string | null) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('tr-TR');
  };

  const formatCurrency = (value?: number | null) =>
    Number(value || 0).toLocaleString('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      maximumFractionDigits: 2,
    });

  const filterOptions: Array<{ key: typeof filter; label: string }> = [
    { key: 'ALL', label: 'Tum' },
    { key: 'OVERDUE', label: 'Geciken' },
    { key: 'TODAY', label: 'Bugun' },
    { key: 'FUTURE', label: 'Gelecek' },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          key={isWide ? 'pending-wide' : 'pending-phone'}
          data={filteredOrders}
          keyExtractor={(item) => item.mikroOrderNumber}
          contentContainerStyle={styles.listContent}
          numColumns={isWide ? 2 : 1}
          columnWrapperStyle={isWide ? styles.columnWrapper : undefined}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.hero}>
                <Text style={styles.heroKicker}>Teslimat Takibi</Text>
                <Text style={styles.heroTitle} numberOfLines={1}>Bekleyen Siparisler</Text>
                <Text style={styles.heroSubtitle} numberOfLines={2}>Acik siparisleri, kalan miktarlari ve teslim durumlarini birlikte izleyin.</Text>
                <View style={styles.heroMetricRow}>
                  <View style={styles.heroMetric}>
                    <Text style={styles.heroMetricValue} numberOfLines={1}>{summary.count}</Text>
                    <Text style={styles.heroMetricLabel} numberOfLines={1}>Siparis</Text>
                  </View>
                  <View style={styles.heroMetric}>
                    <Text style={styles.heroMetricValue} numberOfLines={1}>{summary.remainingQty.toLocaleString('tr-TR')}</Text>
                    <Text style={styles.heroMetricLabel} numberOfLines={1}>Kalan</Text>
                  </View>
                  <View style={styles.heroMetric}>
                    <Text style={summary.overdue > 0 ? styles.heroMetricDanger : styles.heroMetricValue} numberOfLines={1}>{summary.overdue}</Text>
                    <Text style={styles.heroMetricLabel} numberOfLines={1}>Geciken</Text>
                  </View>
                </View>
              </View>

              <TextInput
                style={styles.searchInput}
                placeholder="Siparis no, urun adi veya kodu ara"
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
              />

              <View style={styles.filterWrap}>
                {filterOptions.map((option) => (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.filterChip, filter === option.key && styles.filterChipActive]}
                    onPress={() => setFilter(option.key)}
                  >
                    <Text style={filter === option.key ? styles.filterTextActive : styles.filterText}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.summaryGrid}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Siparis</Text>
                  <Text style={styles.summaryValue}>{summary.count}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Satir</Text>
                  <Text style={styles.summaryValue}>{summary.lines}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Kalan miktar</Text>
                  <Text style={styles.summaryValue}>{summary.remainingQty.toLocaleString('tr-TR')}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Toplam</Text>
                  <Text style={styles.summaryValueSmall}>{formatCurrency(summary.amount)}</Text>
                </View>
              </View>
              {summary.overdue > 0 && <Text style={styles.warningText}>{summary.overdue} teslim tarihi gecmis siparis var.</Text>}
              {error && <Text style={styles.error}>{error}</Text>}
            </View>
          }
          renderItem={({ item }) => {
            const isOpen = expanded[item.mikroOrderNumber];
            const deliveryState = getDeliveryState(item.deliveryDate || item.orderDate);
            const deliveryLabel =
              deliveryState === 'OVERDUE' ? 'Geciken' : deliveryState === 'TODAY' ? 'Bugun' : 'Acik';
            return (
              <View style={[styles.card, isWide && styles.gridItem]}>
                <TouchableOpacity
                  style={styles.cardHeader}
                  onPress={() =>
                    setExpanded((prev) => ({
                      ...prev,
                      [item.mikroOrderNumber]: !prev[item.mikroOrderNumber],
                    }))
                  }
                >
                  <View style={styles.cardHeaderLeft}>
                    <Text style={styles.cardTitle} numberOfLines={2} ellipsizeMode="middle">Siparis: {item.mikroOrderNumber}</Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>Tarih: {formatDate(item.orderDate)}</Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>Teslim: {formatDate(item.deliveryDate || null)}</Text>
                    <View style={[
                      styles.statePill,
                      deliveryState === 'OVERDUE' && styles.stateDanger,
                      deliveryState === 'TODAY' && styles.stateWarning,
                    ]}>
                      <Text style={[
                        styles.statePillText,
                        deliveryState === 'OVERDUE' && styles.stateDangerText,
                        deliveryState === 'TODAY' && styles.stateWarningText,
                      ]}>{deliveryLabel}</Text>
                    </View>
                  </View>
                  <View style={styles.cardHeaderRight}>
                    <Text style={styles.cardTotal} numberOfLines={1}>{formatCurrency(item.grandTotal)}</Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>{item.itemCount || item.items.length} satir</Text>
                    <Text style={styles.linkText}>{isOpen ? 'Gizle' : 'Detay'}</Text>
                  </View>
                </TouchableOpacity>

                {isOpen && (
                  <View style={styles.itemsBox}>
                    {item.items.map((line, index) => (
                      <View key={`${line.productCode}-${index}`} style={styles.itemRow}>
                        <View style={styles.itemLeft}>
                          <Text style={styles.itemTitle} numberOfLines={2} ellipsizeMode="tail">{line.productName}</Text>
                          <Text style={styles.itemMeta} numberOfLines={1} ellipsizeMode="middle">{line.productCode}</Text>
                        </View>
                        <View style={styles.itemRight}>
                          <Text style={styles.itemQty} numberOfLines={1}>{line.remainingQty} {line.unit}</Text>
                          <Text style={styles.itemMeta} numberOfLines={1}>{formatCurrency(line.lineTotal)}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Bu filtreye uygun bekleyen siparis yok.</Text>
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
    borderWidth: 1,
    borderColor: '#173D78',
    shadowColor: '#071B3A',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  heroKicker: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFD7FF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xxl,
    color: '#FFFFFF',
    marginTop: spacing.xs,
  },
  heroSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    lineHeight: fontSizes.sm + 5,
    color: '#DDE8FF',
    marginTop: spacing.xs,
  },
  heroMetricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  heroMetric: {
    flexGrow: 1,
    flexBasis: 96,
    minWidth: 92,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(221,232,255,0.22)',
    padding: spacing.sm,
  },
  heroMetricValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: '#FFFFFF',
  },
  heroMetricDanger: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: '#FCA5A5',
  },
  heroMetricLabel: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFD7FF',
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  filterTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: '#FFFFFF',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  summaryCard: {
    flexGrow: 1,
    minWidth: 132,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 2,
  },
  summaryLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  summaryValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.lg,
    color: colors.text,
  },
  summaryValueSmall: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  warningText: {
    fontFamily: fonts.semibold,
    color: colors.warning,
  },
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  gridItem: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  cardHeaderLeft: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  cardHeaderRight: {
    alignItems: 'flex-end',
    gap: spacing.xs,
    maxWidth: 132,
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
  cardTotal: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  linkText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.primary,
  },
  statePill: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.surfaceAlt,
  },
  stateDanger: {
    backgroundColor: '#FEE2E2',
  },
  stateWarning: {
    backgroundColor: '#FEF3C7',
  },
  statePillText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.primary,
  },
  stateDangerText: {
    color: colors.danger,
  },
  stateWarningText: {
    color: '#92400E',
  },
  itemsBox: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  itemLeft: {
    flex: 1,
    minWidth: 0,
  },
  itemRight: {
    alignItems: 'flex-end',
    maxWidth: 120,
  },
  itemTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  itemMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  itemQty: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  empty: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
  },
});
