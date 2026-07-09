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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { customerApi } from '../api/customer';
import { OrderRequest } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { includesSearch } from '../utils/search';

const statusOptions: Array<{ value: '' | OrderRequest['status']; label: string }> = [
  { value: '', label: 'Tumu' },
  { value: 'PENDING', label: 'Bekleyen' },
  { value: 'CONVERTED', label: 'Siparise donen' },
  { value: 'REJECTED', label: 'Reddedilen' },
];

const statusLabel: Record<OrderRequest['status'], string> = {
  PENDING: 'Bekleyen',
  CONVERTED: 'Siparise donen',
  REJECTED: 'Reddedilen',
};

const statusMeta: Record<OrderRequest['status'], { bg: string; text: string }> = {
  PENDING: { bg: '#FEF3C7', text: '#92400E' },
  CONVERTED: { bg: '#DCFCE7', text: '#166534' },
  REJECTED: { bg: '#FEE2E2', text: '#991B1B' },
};

const getApiErrorMessage = (err: any, fallback: string) => {
  const candidate = err?.response?.data?.error || err?.response?.data?.message || err?.message;
  if (typeof candidate === 'string') return candidate;
  if (candidate && typeof candidate === 'object') return candidate.message || candidate.code || fallback;
  return fallback;
};

export function RequestsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width } = useWindowDimensions();
  const listColumns = width >= 820 ? 2 : 1;
  const [requests, setRequests] = useState<OrderRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | OrderRequest['status']>('');

  const fetchRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await customerApi.getOrderRequests();
      setRequests(response.requests || []);
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Talepler yuklenemedi.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const filteredRequests = useMemo(() => {
    const term = search.trim();
    return requests.filter((request) => {
      if (status && request.status !== status) return false;
      if (!term) return true;
      const productText = (request.items || [])
        .map((item) => `${item.product?.name || ''} ${item.product?.mikroCode || ''}`)
        .join(' ');
      return includesSearch(
        `${request.id} ${request.status} ${request.note || ''} ${request.requestedBy?.name || ''} ${request.requestedBy?.email || ''} ${productText}`,
        term
      );
    });
  }, [requests, search, status]);

  const summary = useMemo(() => ({
    total: requests.length,
    pending: requests.filter((request) => request.status === 'PENDING').length,
    converted: requests.filter((request) => request.status === 'CONVERTED').length,
    filtered: filteredRequests.length,
  }), [filteredRequests.length, requests]);

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          key={`requests-${listColumns}`}
          data={filteredRequests}
          keyExtractor={(item) => item.id}
          numColumns={listColumns}
          columnWrapperStyle={listColumns > 1 ? styles.columnWrapper : undefined}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.hero}>
                <Text style={styles.heroKicker}>Onay Akisi</Text>
                <Text style={styles.heroTitle} numberOfLines={1}>Talepler</Text>
                <Text style={styles.heroSubtitle} numberOfLines={2}>Alt kullanici taleplerini, notlarini ve siparise donus durumunu takip edin.</Text>
              </View>
              <TextInput
                style={styles.search}
                placeholder="Talep, not, urun veya kullanici ara..."
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
              />
              <View style={styles.segmentRow}>
                {statusOptions.map((option) => (
                  <TouchableOpacity
                    key={option.value || 'all'}
                    style={[styles.segmentButton, status === option.value && styles.segmentButtonActive]}
                    onPress={() => setStatus(option.value)}
                  >
                    <Text
                      style={status === option.value ? styles.segmentTextActive : styles.segmentText}
                      numberOfLines={1}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.summaryRow}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel} numberOfLines={1}>Toplam</Text>
                  <Text style={styles.summaryValue} numberOfLines={1}>{summary.total}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel} numberOfLines={1}>Bekleyen</Text>
                  <Text style={styles.summaryValue} numberOfLines={1}>{summary.pending}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel} numberOfLines={1}>Siparise Donen</Text>
                  <Text style={styles.summaryValue} numberOfLines={1}>{summary.converted}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel} numberOfLines={1}>Filtre</Text>
                  <Text style={styles.summaryValue} numberOfLines={1}>{summary.filtered}</Text>
                </View>
              </View>
              {error && <Text style={styles.error} numberOfLines={3}>{error}</Text>}
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('RequestDetail', { requestId: item.id })}
            >
              <View style={styles.cardTopRow}>
                <Text style={styles.cardTitle} numberOfLines={2} ellipsizeMode="middle">Talep #{item.id.slice(0, 6)}</Text>
                <Text
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: statusMeta[item.status]?.bg || '#EAF2FF',
                      color: statusMeta[item.status]?.text || colors.primary,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {statusLabel[item.status] || item.status}
                </Text>
              </View>
              {item.requestedBy?.name ? <Text style={styles.cardMeta} numberOfLines={1} ellipsizeMode="tail">Kullanici: {item.requestedBy.name}</Text> : null}
              {item.note && <Text style={styles.cardMeta} numberOfLines={2} ellipsizeMode="tail">Not: {item.note}</Text>}
              {item.items && (
                <Text style={styles.cardMeta} numberOfLines={1}>Kalem: {item.items.length}</Text>
              )}
              <Text style={styles.cardMeta} numberOfLines={1}>Tarih: {item.createdAt?.slice?.(0, 10) || '-'}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Talep bulunamadi</Text>
              <Text style={styles.emptyText}>Arama veya durum filtresini degistirerek tekrar deneyin.</Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => {
                  setSearch('');
                  setStatus('');
                }}
              >
                <Text style={styles.emptyButtonText}>Filtreleri Temizle</Text>
              </TouchableOpacity>
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
    gap: spacing.xs,
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
    lineHeight: fontSizes.sm + 5,
    color: '#DBEAFE',
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
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
  },
  search: {
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
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  segmentButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  segmentButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  segmentTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#FFFFFF',
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  summaryCard: {
    flexGrow: 1,
    minWidth: 135,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  summaryLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  summaryValue: {
    marginTop: 3,
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    lineHeight: fontSizes.md + 5,
    color: colors.text,
  },
  card: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.semibold,
    fontSize: fontSizes.lg,
    lineHeight: fontSizes.lg + 6,
    color: colors.text,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    lineHeight: fontSizes.sm + 5,
    color: colors.textMuted,
  },
  statusPill: {
    flexShrink: 0,
    alignSelf: 'flex-start',
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#EAF2FF',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontFamily: fonts.bold,
    fontSize: fontSizes.xs,
    color: colors.primary,
  },
  empty: {
    padding: spacing.xl,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.lg,
    color: colors.text,
  },
  emptyText: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  emptyButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
  },
});
