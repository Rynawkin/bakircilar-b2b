import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { adminApi } from '../api/admin';
import { Customer } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';

type StatusFilter = 'all' | 'active' | 'inactive';
const PORTFOLIO_PAGE_SIZE = 50;

export function PortfolioScreen() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pagination, setPagination] = useState<{ total: number; page: number; pageSize: number; totalPages: number } | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [error, setError] = useState<string | null>(null);
  const requestSeqRef = useRef(0);

  const fetchCustomers = async (append = false, searchOverride?: string, statusOverride?: StatusFilter) => {
    if (append && loadingMore) return;
    const requestSeq = ++requestSeqRef.current;
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const activeFilter = statusOverride || statusFilter;
      const nextPage = append ? (pagination?.page || Math.max(1, Math.ceil(customers.length / PORTFOLIO_PAGE_SIZE))) + 1 : 1;
      const response = await adminApi.getCustomers({
        search: (searchOverride ?? search).trim() || undefined,
        active: activeFilter,
        page: nextPage,
        pageSize: PORTFOLIO_PAGE_SIZE,
      });
      if (requestSeq !== requestSeqRef.current) return;
      const nextCustomers = response.customers || [];
      const nextPagination = response.pagination || {
        total: nextCustomers.length,
        page: nextPage,
        pageSize: PORTFOLIO_PAGE_SIZE,
        totalPages: nextCustomers.length >= PORTFOLIO_PAGE_SIZE ? nextPage + 1 : nextPage,
      };
      setPagination(nextPagination);
      setHasMore(response.pagination ? nextPagination.page < nextPagination.totalPages : nextCustomers.length >= PORTFOLIO_PAGE_SIZE);
      setCustomers((current) => {
        if (!append) return nextCustomers;
        const byId = new Map<string, Customer>();
        current.forEach((customer) => byId.set(customer.id, customer));
        nextCustomers.forEach((customer) => byId.set(customer.id, customer));
        return Array.from(byId.values());
      });
    } catch (err: any) {
      if (requestSeq !== requestSeqRef.current) return;
      setError(getApiErrorMessage(err, 'Portfoy yuklenemedi.'));
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCustomers(false, search, statusFilter);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, statusFilter]);

  const counts = useMemo(() => {
    const active = customers.filter((customer) => customer.active).length;
    return {
      total: pagination?.total ?? customers.length,
      loaded: customers.length,
      active,
      inactive: customers.length - active,
    };
  }, [customers, pagination?.total]);

  const loadMore = () => {
    if (loading || loadingMore || !hasMore) return;
    fetchCustomers(true, search, statusFilter);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.hero}>
                <Text style={styles.heroKicker}>Satis Portfoyu</Text>
                <Text style={styles.heroTitle}>Musteri Portfoyum</Text>
                <Text style={styles.heroSubtitle}>Atanan musterilerinizi, aktiflik durumunu ve arama filtrelerini tek mobil ekranda takip edin.</Text>
                <View style={styles.heroMetricRow}>
                  <View style={styles.heroMetric}>
                    <Text style={styles.heroMetricValue}>{counts.total}</Text>
                    <Text style={styles.heroMetricLabel}>Toplam</Text>
                  </View>
                  <View style={styles.heroMetric}>
                    <Text style={styles.heroMetricValue}>{counts.loaded}</Text>
                    <Text style={styles.heroMetricLabel}>Yuklu</Text>
                  </View>
                  <View style={styles.heroMetric}>
                    <Text style={styles.heroMetricValue}>{counts.active}</Text>
                    <Text style={styles.heroMetricLabel}>Aktif</Text>
                  </View>
                  <View style={styles.heroMetric}>
                    <Text style={counts.inactive > 0 ? styles.heroMetricWarn : styles.heroMetricValue}>{counts.inactive}</Text>
                    <Text style={styles.heroMetricLabel}>Pasif</Text>
                  </View>
                </View>
              </View>

              <View style={styles.summaryRow}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Toplam</Text>
                  <Text style={styles.summaryValue}>{counts.total}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Aktif</Text>
                  <Text style={styles.summaryValue}>{counts.active}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Pasif</Text>
                  <Text style={styles.summaryValue}>{counts.inactive}</Text>
                </View>
              </View>

              <TextInput
                style={styles.search}
                placeholder="Cari kodu, isim, sehir, telefon..."
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
                onSubmitEditing={() => fetchCustomers(false, search, statusFilter)}
                returnKeyType="search"
              />

              <View style={styles.filterRow}>
                {(
                  [
                    { id: 'all', label: 'Hepsi' },
                    { id: 'active', label: 'Aktif' },
                    { id: 'inactive', label: 'Pasif' },
                  ] as const
                ).map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.filterButton, statusFilter === item.id && styles.filterButtonActive]}
                    onPress={() => setStatusFilter(item.id)}
                  >
                    <Text
                      style={statusFilter === item.id ? styles.filterTextActive : styles.filterText}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {error && <Text style={styles.error}>{error}</Text>}
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={2} ellipsizeMode="tail">{item.name}</Text>
                <View style={[styles.badge, item.active ? styles.badgeActive : styles.badgeInactive]}>
                  <Text style={item.active ? styles.badgeTextActive : styles.badgeTextInactive}>
                    {item.active ? 'Aktif' : 'Pasif'}
                  </Text>
                </View>
              </View>
              <Text style={styles.cardMeta} numberOfLines={1} ellipsizeMode="middle">Cari: {item.mikroCariCode || '-'}</Text>
              <Text style={styles.cardMeta} numberOfLines={1} ellipsizeMode="middle">E-posta: {item.email || '-'}</Text>
              <Text style={styles.cardMeta} numberOfLines={1}>Sehir: {item.city || '-'}</Text>
              <Text style={styles.cardMeta} numberOfLines={1}>Ilce: {item.district || '-'}</Text>
              <Text style={styles.cardMeta} numberOfLines={1}>Telefon: {item.phone || '-'}</Text>
              <Text style={styles.cardMeta} numberOfLines={1}>Sektor: {item.sectorCode || '-'}</Text>
              <Text style={styles.cardMeta} numberOfLines={1}>Grup: {item.groupCode || '-'}</Text>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Kayit bulunamadi.</Text>
            </View>
          }
          ListFooterComponent={
            customers.length ? (
              <View style={styles.footer}>
                {loadingMore ? (
                  <ActivityIndicator color={colors.primary} />
                ) : hasMore ? (
                  <TouchableOpacity style={styles.loadMoreButton} onPress={loadMore} disabled={loadingMore}>
                    <Text style={styles.loadMoreText}>Daha Fazla Yukle</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.endText}>Listenin sonu</Text>
                )}
              </View>
            ) : null
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
  hero: {
    paddingHorizontal: 1,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
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
    flexBasis: 78,
    minWidth: 74,
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
  heroMetricWarn: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: '#FCD34D',
  },
  heroMetricLabel: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFD7FF',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  summaryLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  summaryValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.lg,
    color: colors.text,
  },
  search: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  filterButton: {
    flex: 1,
    minWidth: 104,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  filterTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#FFFFFF',
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
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    lineHeight: fontSizes.md + 5,
    color: colors.text,
  },
  badge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
  },
  badgeActive: {
    backgroundColor: colors.successSoft,
    borderColor: '#86EFAC',
  },
  badgeInactive: {
    backgroundColor: colors.dangerSoft,
    borderColor: '#FCA5A5',
  },
  badgeTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.success,
  },
  badgeTextInactive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.danger,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  footer: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadMoreButton: {
    minWidth: 180,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  loadMoreText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.sm,
    color: '#FFFFFF',
  },
  endText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
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
