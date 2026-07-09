import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import { Quote } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { shareQuotePdf } from '../utils/quotePdf';

const STATUS_LABELS: Record<string, string> = {
  PENDING_APPROVAL: 'Onay Bekliyor',
  SENT_TO_MIKRO: 'Mikroda',
  CONVERTED: 'Siparise Dondu',
  REJECTED: 'Reddedildi',
  APPROVED: 'Onaylandi',
  PENDING: 'Bekleyen',
};

const STATUS_META: Record<string, { bg: string; text: string }> = {
  PENDING_APPROVAL: { bg: '#FEF3C7', text: '#92400E' },
  SENT_TO_MIKRO: { bg: '#DBEAFE', text: '#1D4ED8' },
  CONVERTED: { bg: '#DCFCE7', text: '#166534' },
  APPROVED: { bg: '#DCFCE7', text: '#166534' },
  REJECTED: { bg: '#FEE2E2', text: '#991B1B' },
  PENDING: { bg: '#FEF3C7', text: '#92400E' },
};

const QUOTES_PAGE_SIZE = 20;
const STATUS_OPTIONS = ['', 'PENDING_APPROVAL', 'SENT_TO_MIKRO', 'CONVERTED', 'REJECTED', 'APPROVED', 'PENDING'];

const getStatusLabel = (status?: string | null) => STATUS_LABELS[String(status || '')] || status || 'Bilinmiyor';

const getApiErrorMessage = (err: any, fallback: string) => {
  const candidate = err?.response?.data?.error || err?.response?.data?.message || err?.message;
  if (typeof candidate === 'string') return candidate;
  if (candidate && typeof candidate === 'object') return candidate.message || candidate.code || fallback;
  return fallback;
};

const formatCurrency = (value?: number | null) =>
  `${Number(value || 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} TL`;

export function QuotesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width } = useWindowDimensions();
  const listColumns = width >= 820 ? 2 : 1;
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    pageSize: QUOTES_PAGE_SIZE,
    totalPages: 1,
  });
  const requestSeqRef = useRef(0);
  const firstFetchDoneRef = useRef(false);

  const fetchQuotes = async (nextPage = page) => {
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    if (firstFetchDoneRef.current) setFetching(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await customerApi.getQuotes({
        status,
        search: debouncedSearch,
        page: nextPage,
        pageSize: QUOTES_PAGE_SIZE,
      });
      if (requestSeq === requestSeqRef.current) {
        setQuotes(response.quotes || []);
        setPagination(
          response.pagination || {
            total: response.quotes?.length || 0,
            page: nextPage,
            pageSize: QUOTES_PAGE_SIZE,
            totalPages: 1,
          }
        );
      }
    } catch (err: any) {
      if (requestSeq === requestSeqRef.current) {
        setError(getApiErrorMessage(err, 'Teklifler yuklenemedi.'));
      }
    } finally {
      if (requestSeq === requestSeqRef.current) {
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
  }, [status, debouncedSearch]);

  useEffect(() => {
    fetchQuotes(page);
  }, [status, debouncedSearch, page]);

  const summary = useMemo(() => {
    return {
      total: pagination.total,
      filtered: quotes.length,
      amount: quotes.reduce((sum, quote) => sum + Number(quote.grandTotal ?? quote.totalAmount ?? 0), 0),
    };
  }, [quotes, pagination.total]);

  const goToPage = (nextPage: number) => {
    if (fetching || nextPage < 1 || nextPage > pagination.totalPages) return;
    setPage(nextPage);
  };

  const handlePdf = async (quoteId: string) => {
    setPdfLoadingId(quoteId);
    try {
      const response = await customerApi.getQuoteById(quoteId);
      await shareQuotePdf(response.quote);
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'PDF hazirlanamadi.'));
    } finally {
      setPdfLoadingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          key={`quotes-${listColumns}`}
          data={quotes}
          keyExtractor={(item) => item.id}
          numColumns={listColumns}
          columnWrapperStyle={listColumns > 1 ? styles.columnWrapper : undefined}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.hero}>
                <Text style={styles.heroKicker}>Hesap Takibi</Text>
                <Text style={styles.heroTitle} numberOfLines={1}>Teklifler</Text>
                <Text style={styles.heroSubtitle} numberOfLines={2}>Teklifleri inceleyin, PDF alin ve durumlarini takip edin.</Text>
              </View>
              <TextInput
                style={styles.search}
                placeholder="Teklif ara..."
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
              />
              <View style={styles.segmentRow}>
                {STATUS_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option || 'all'}
                    style={[styles.segmentButton, status === option && styles.segmentButtonActive]}
                    onPress={() => setStatus(option)}
                  >
                    <Text
                      style={status === option ? styles.segmentTextActive : styles.segmentText}
                      numberOfLines={1}
                    >
                      {option ? getStatusLabel(option) : 'Tumu'}
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
                  <Text style={styles.summaryLabel} numberOfLines={1}>Filtre</Text>
                  <Text style={styles.summaryValue} numberOfLines={1}>{summary.filtered}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel} numberOfLines={1}>Tutar</Text>
                  <Text style={styles.summaryValue} numberOfLines={1}>{summary.amount.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL</Text>
                </View>
              </View>
              {error && <Text style={styles.error} numberOfLines={3}>{error}</Text>}
              {fetching ? (
                <View style={styles.fetchingRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.fetchingText}>Liste guncelleniyor...</Text>
                </View>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTopRow}>
                <Text style={styles.cardTitle} numberOfLines={2} ellipsizeMode="middle">{item.quoteNumber}</Text>
                <Text
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: STATUS_META[item.status]?.bg || '#EAF2FF',
                      color: STATUS_META[item.status]?.text || colors.primary,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {getStatusLabel(item.status)}
                </Text>
              </View>
              <Text style={styles.cardMeta} numberOfLines={1}>Toplam: {formatCurrency(Number(item.grandTotal ?? item.totalAmount ?? 0))}</Text>
              {item.validityDate ? <Text style={styles.cardMeta} numberOfLines={1}>Gecerlilik: {item.validityDate.slice(0, 10)}</Text> : null}
              <Text style={styles.cardMeta} numberOfLines={1}>Tarih: {item.createdAt?.slice?.(0, 10) || '-'}</Text>
              {item.items?.length ? <Text style={styles.cardMeta} numberOfLines={1}>Kalem: {item.items.length}</Text> : null}
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => navigation.navigate('QuoteDetail', { quoteId: item.id })}
                >
                  <Text style={styles.secondaryButtonText}>Detay</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.secondaryButton, pdfLoadingId === item.id && styles.disabledButton]}
                  onPress={() => handlePdf(item.id)}
                  disabled={pdfLoadingId === item.id}
                >
                  <Text style={styles.secondaryButtonText}>
                    {pdfLoadingId === item.id ? 'PDF...' : 'PDF'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Teklif bulunamadi</Text>
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
  error: {
    fontFamily: fonts.medium,
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
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  secondaryButton: {
    flex: 1,
    minWidth: 96,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.55,
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
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
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
