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

import { adminApi, type QuotesPagination } from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { Quote } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { shareQuotePdf } from '../utils/quotePdf';
import { hapticLight, hapticSuccess } from '../utils/haptics';

type QuoteStatusFilter = 'ALL' | 'PENDING_APPROVAL' | 'SENT_TO_MIKRO' | 'CONVERTED' | 'REJECTED';

const STATUS_FILTERS: Array<{ key: QuoteStatusFilter; label: string }> = [
  { key: 'ALL', label: 'Tumu' },
  { key: 'PENDING_APPROVAL', label: 'Onay' },
  { key: 'SENT_TO_MIKRO', label: 'Mikroda' },
  { key: 'CONVERTED', label: 'Siparis' },
  { key: 'REJECTED', label: 'Red' },
];

const QUOTES_PAGE_SIZE = 25;

const STATUS_META: Record<string, { label: string; bg: string; border: string; text: string }> = {
  PENDING_APPROVAL: { label: 'Onay Bekliyor', bg: colors.warningSoft, border: 'rgba(245,158,11,0.32)', text: colors.warning },
  SENT_TO_MIKRO: { label: 'Mikroda', bg: colors.primaryMuted, border: colors.borderStrong, text: colors.primarySoft },
  CONVERTED: { label: 'Siparise Dondu', bg: colors.successSoft, border: 'rgba(52,211,153,0.30)', text: colors.success },
  REJECTED: { label: 'Reddedildi', bg: colors.dangerSoft, border: 'rgba(248,113,113,0.30)', text: colors.danger },
};

const getStatusMeta = (status?: string | null) =>
  STATUS_META[String(status || '')] || {
    label: status || 'Bilinmiyor',
    bg: colors.surfaceAlt,
    border: colors.border,
    text: colors.textSoft,
  };

const getApiErrorMessage = (err: any, fallback: string) => {
  const candidate = err?.response?.data?.error || err?.response?.data?.message || err?.message;
  if (typeof candidate === 'string') return candidate;
  if (candidate && typeof candidate === 'object') {
    return candidate.message || candidate.code || fallback;
  }
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

export function QuotesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const { width } = useWindowDimensions();
  const listColumns = width >= 900 ? 2 : 1;
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<QuoteStatusFilter>('ALL');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<QuotesPagination>({
    total: 0,
    page: 1,
    pageSize: QUOTES_PAGE_SIZE,
    totalPages: 1,
  });
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const [recommendedPdfLoadingId, setRecommendedPdfLoadingId] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const quotesRequestSeqRef = useRef(0);
  const actionBusyRef = useRef<string | null>(null);
  const pdfLoadingIdRef = useRef<string | null>(null);
  const recommendedPdfLoadingIdRef = useRef<string | null>(null);
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

  const fetchQuotes = async (nextPage = page) => {
    const requestSeq = quotesRequestSeqRef.current + 1;
    quotesRequestSeqRef.current = requestSeq;
    if (firstFetchDoneRef.current) {
      setFetching(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const response = await adminApi.getQuotes({
        status: statusFilter,
        search: debouncedSearch,
        page: nextPage,
        pageSize: QUOTES_PAGE_SIZE,
      });
      if (requestSeq === quotesRequestSeqRef.current) {
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
      if (requestSeq === quotesRequestSeqRef.current) {
        setError(getApiErrorMessage(err, 'Teklifler yuklenemedi.'));
      }
    } finally {
      if (requestSeq === quotesRequestSeqRef.current) {
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
  }, [statusFilter, debouncedSearch]);

  useEffect(() => {
    fetchQuotes(page);
  }, [statusFilter, debouncedSearch, page]);

  const summary = useMemo(() => {
    const totalAmount = quotes.reduce(
      (sum, quote) => sum + Number(quote.grandTotal ?? quote.totalAmount ?? 0),
      0
    );
    const mikroReady = quotes.filter((quote) => Boolean(quote.mikroNumber)).length;
    return {
      visible: quotes.length,
      total: pagination.total,
      totalAmount,
      mikroReady,
    };
  }, [quotes, pagination.total]);

  const goToPage = (nextPage: number) => {
    if (fetching || nextPage < 1 || nextPage > pagination.totalPages) return;
    hapticLight();
    setPage(nextPage);
  };

  const approve = async (quoteId: string) => {
    const actionKey = `approve:${quoteId}`;
    if (!beginAction(actionKey)) return;
    try {
      await adminApi.approveQuote(quoteId);
      hapticSuccess();
      await fetchQuotes();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Onay basarisiz.'));
    } finally {
      endAction();
    }
  };

  const reject = async (quoteId: string) => {
    if (actionBusyRef.current) return;
    Alert.alert('Teklifi Reddet', 'Teklifi reddetmek istiyor musunuz?', [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Reddet',
        style: 'destructive',
        onPress: async () => {
          const actionKey = `reject:${quoteId}`;
          if (!beginAction(actionKey)) return;
          try {
            await adminApi.rejectQuote(quoteId, 'Mobil reddedildi');
            hapticSuccess();
            await fetchQuotes();
          } catch (err: any) {
            Alert.alert('Hata', getApiErrorMessage(err, 'Red basarisiz.'));
          } finally {
            endAction();
          }
        },
      },
    ]);
  };

  const handlePdf = async (quoteId: string) => {
    if (pdfLoadingIdRef.current) return;
    pdfLoadingIdRef.current = quoteId;
    setPdfLoadingId(quoteId);
    try {
      const response = await adminApi.getQuoteById(quoteId);
      await shareQuotePdf(response.quote);
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'PDF hazirlanamadi.'));
    } finally {
      pdfLoadingIdRef.current = null;
      setPdfLoadingId(null);
    }
  };

  const handleRecommendedPdf = async (quoteId: string) => {
    if (recommendedPdfLoadingIdRef.current) return;
    recommendedPdfLoadingIdRef.current = quoteId;
    setRecommendedPdfLoadingId(quoteId);
    try {
      const response = await adminApi.getQuoteById(quoteId);
      const quote = response.quote;
      const productCodes = Array.from(
        new Set(
          (quote.items || [])
            .map((item) => item.productCode?.trim())
            .filter((code): code is string => Boolean(code))
        )
      );

      if (productCodes.length === 0) {
        Alert.alert('Bilgi', 'Teklifte urun kodu olmadigi icin onerili PDF olusturulamadi.');
        return;
      }

      const recommendationResult = await adminApi.getComplementRecommendations({
        productCodes,
        excludeCodes: productCodes,
        limit: 20,
      });

      await shareQuotePdf(quote, {
        recommendedProducts: recommendationResult.products || [],
      });
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Onerili PDF hazirlanamadi.'));
    } finally {
      recommendedPdfLoadingIdRef.current = null;
      setRecommendedPdfLoadingId(null);
    }
  };

  const renderQuote = ({ item }: { item: Quote }) => {
    const canEdit = ['PENDING_APPROVAL', 'SENT_TO_MIKRO'].includes(item.status);
    const canConvert = Boolean(item.mikroNumber) && item.status !== 'REJECTED';
    const statusMeta = getStatusMeta(item.status);
    const total = Number(item.grandTotal ?? item.totalAmount ?? 0);
    const itemCount = item.items?.length || 0;
    const approveKey = `approve:${item.id}`;
    const rejectKey = `reject:${item.id}`;
    const actionDisabled = Boolean(actionBusyId);
    const pdfDisabled = Boolean(pdfLoadingId);
    const recommendedPdfDisabled = Boolean(recommendedPdfLoadingId);

    return (
      <View style={[styles.card, listColumns > 1 ? styles.cardGridItem : null]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleBlock}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.quoteNumber || 'Teklif'}
            </Text>
            <Text style={styles.customerName} numberOfLines={3}>
              {item.customer?.displayName || item.customer?.name || item.customer?.mikroName || 'Cari yok'}
            </Text>
            {item.customer?.mikroCariCode ? (
              <Text style={styles.customerCode}>{item.customer.mikroCariCode}</Text>
            ) : null}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg, borderColor: statusMeta.border }]}>
            <Text style={[styles.statusText, { color: statusMeta.text }]}>{statusMeta.label}</Text>
          </View>
        </View>

        <View style={styles.amountRow}>
          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>Toplam</Text>
            <Text style={styles.amountValue} numberOfLines={1} adjustsFontSizeToFit>
              {formatCurrency(total)}
            </Text>
          </View>
          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>Mikro</Text>
            <Text style={styles.amountValueSmall} numberOfLines={1} adjustsFontSizeToFit>
              {item.mikroNumber || '-'}
            </Text>
          </View>
        </View>

        <View style={styles.metaGrid}>
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>Tarih</Text>
            <Text style={styles.metaValue}>{formatDate(item.createdAt)}</Text>
          </View>
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>Gecerlilik</Text>
            <Text style={styles.metaValue}>{formatDate(item.validityDate)}</Text>
          </View>
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>Kalem</Text>
            <Text style={styles.metaValue}>{itemCount || '-'}</Text>
          </View>
          {item.documentNo ? (
            <View style={styles.metaPill}>
              <Text style={styles.metaLabel}>Evrak</Text>
              <Text style={styles.metaValue} numberOfLines={1}>
                {item.documentNo}
              </Text>
            </View>
          ) : null}
        </View>

        {item.status === 'PENDING_APPROVAL' && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.approveButton, actionDisabled ? styles.disabledButton : null]}
              onPress={() => approve(item.id)}
              disabled={actionDisabled}
            >
              <Text style={styles.primaryButtonText}>
                {actionBusyId === approveKey ? 'Onaylaniyor...' : 'Onayla'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dangerButton, actionDisabled ? styles.disabledButton : null]}
              onPress={() => reject(item.id)}
              disabled={actionDisabled}
            >
              <Text style={styles.dangerButtonText}>{actionBusyId === rejectKey ? 'Reddediliyor...' : 'Reddet'}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('QuoteDetail', { quoteId: item.id })}
          >
            <Text style={styles.secondaryButtonText}>Detay</Text>
          </TouchableOpacity>
          {canEdit && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => navigation.navigate('QuoteCreate', { quoteId: item.id })}
            >
              <Text style={styles.secondaryButtonText}>Duzenle</Text>
            </TouchableOpacity>
          )}
        </View>

        {canConvert && (
          <TouchableOpacity
            style={styles.fullPrimaryButton}
            onPress={() => {
              hapticLight();
              navigation.navigate('QuoteConvert', { quoteId: item.id });
            }}
          >
            <Text style={styles.primaryButtonText}>Siparise Cevir</Text>
          </TouchableOpacity>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.secondaryButton, pdfDisabled ? styles.disabledButton : null]}
            onPress={() => handlePdf(item.id)}
            disabled={pdfDisabled}
          >
            <Text style={styles.secondaryButtonText}>
              {pdfLoadingId === item.id ? 'PDF...' : pdfDisabled ? 'Bekleyin' : 'PDF'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryButton, recommendedPdfDisabled ? styles.disabledButton : null]}
            onPress={() => handleRecommendedPdf(item.id)}
            disabled={recommendedPdfDisabled}
          >
            <Text style={styles.secondaryButtonText}>
              {recommendedPdfLoadingId === item.id ? 'Onerili...' : recommendedPdfDisabled ? 'Bekleyin' : 'Onerili PDF'}
            </Text>
          </TouchableOpacity>
        </View>
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
          key={`quotes-${listColumns}`}
          data={quotes}
          numColumns={listColumns}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={listColumns > 1 ? styles.columnWrapper : undefined}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.hero}>
                <Text style={styles.heroKicker}>Teklif Operasyonu</Text>
                <Text style={styles.heroTitle}>Teklifler</Text>
                <Text style={styles.heroSubtitle}>Onay, Mikro, siparis ve red durumlarini tek listede takip edin.</Text>
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
                  <Text style={styles.summaryLabel}>Mikro No</Text>
                  <Text style={styles.summaryValue}>{summary.mikroReady}</Text>
                  <Text style={styles.summaryHint}>Bu sayfa</Text>
                </View>
              </View>
              <TextInput
                style={styles.search}
                placeholder="Teklif, cari, kod, durum veya Mikro no ara..."
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
              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => {
                    hapticLight();
                    navigation.navigate('QuoteCreate');
                  }}
                >
                  <Text style={styles.primaryButtonText}>Yeni Teklif</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => fetchQuotes(page)} disabled={fetching}>
                  <Text style={styles.secondaryButtonText}>Yenile</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => {
                    hapticLight();
                    navigation.navigate('QuoteLines');
                  }}
                >
                  <Text style={styles.secondaryButtonText}>Kalemler</Text>
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
          renderItem={renderQuote}
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
              <Text style={styles.emptyTitle}>Teklif bulunamadi</Text>
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
  filterText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  filterTextActive: {
    color: '#0B1F3F',
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
    maxWidth: 138,
  },
  statusText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    textAlign: 'center',
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
    flexBasis: 120,
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
    minWidth: 110,
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
  fullPrimaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  dangerButton: {
    flex: 1,
    minWidth: 110,
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
    minWidth: 110,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
    textAlign: 'center',
  },
  disabledButton: {
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
