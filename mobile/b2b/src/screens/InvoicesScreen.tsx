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
import * as Sharing from 'expo-sharing';

import { customerApi, CustomerInvoiceDocument } from '../api/customer';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
import { includesSearch } from '../utils/search';

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString('tr-TR');
};

const formatAmount = (value?: number | null, currency?: string | null) => {
  if (value === null || value === undefined) return '-';
  return `${Number(value || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || 'TRY'}`;
};

const statusLabel = (status?: string | null) => {
  if (status === 'MATCHED') return 'Eslesmis';
  if (status === 'PARTIAL') return 'Eksik';
  if (status === 'NOT_FOUND') return 'Bulunamadi';
  return status || '-';
};

export function InvoicesScreen() {
  const { width } = useWindowDimensions();
  const [documents, setDocuments] = useState<CustomerInvoiceDocument[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'MATCHED' | 'PARTIAL' | 'NOT_FOUND'>('ALL');
  const downloadingIdRef = useRef<string | null>(null);
  const documentsSeqRef = useRef(0);
  const isWide = width >= 820;

  const loadDocuments = async (page = 1) => {
    const requestSeq = ++documentsSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const response = await customerApi.getInvoices({
        search: search.trim() || undefined,
        fromDate: fromDate.trim() || undefined,
        toDate: toDate.trim() || undefined,
        page,
        limit: pagination.limit,
      });
      if (requestSeq !== documentsSeqRef.current) return;
      setDocuments(response.documents || []);
      setPagination(response.pagination || { page, limit: pagination.limit, total: 0, totalPages: 1 });
    } catch (err: any) {
      if (requestSeq === documentsSeqRef.current) {
        setError(getApiErrorMessage(err, 'Faturalar yuklenemedi.'));
        setDocuments([]);
      }
    } finally {
      if (requestSeq === documentsSeqRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadDocuments(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shareInvoice = async (document: CustomerInvoiceDocument) => {
    if (downloadingIdRef.current) return;
    downloadingIdRef.current = document.id;
    setDownloadingId(document.id);
    try {
      const uri = await customerApi.downloadInvoiceToFile(document);
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Fatura indirildi', uri);
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: document.mimeType || 'application/pdf',
        dialogTitle: `${document.invoiceNo} faturasini ac`,
      });
    } catch (err: any) {
      Alert.alert('Fatura indirilemedi', getApiErrorMessage(err, 'PDF dosyasi alinamadi.'));
    } finally {
      downloadingIdRef.current = null;
      setDownloadingId(null);
    }
  };

  const canPrev = pagination.page > 1;
  const canNext = pagination.page < pagination.totalPages;

  const filteredDocuments = useMemo(() => {
    return documents.filter((document) => {
      const status = String(document.matchStatus || '').toUpperCase();
      const matchesStatus = statusFilter === 'ALL' || status === statusFilter;
      const haystack = [
        document.invoiceNo,
        document.fileName,
        document.originalName,
        document.currency,
        document.matchStatus,
        document.matchError,
        document.issueDate,
        document.sentAt,
      ].join(' ');
      return matchesStatus && includesSearch(haystack, search);
    });
  }, [documents, search, statusFilter]);

  const summary = useMemo(() => ({
    total: pagination.total,
    pageCount: documents.length,
    filtered: filteredDocuments.length,
    amount: filteredDocuments.reduce((sum, document) => sum + Number(document.totalAmount || 0), 0),
  }), [documents.length, filteredDocuments, pagination.total]);

  const statusOptions: Array<{ key: typeof statusFilter; label: string }> = [
    { key: 'ALL', label: 'Tum' },
    { key: 'MATCHED', label: 'Eslesmis' },
    { key: 'PARTIAL', label: 'Eksik' },
    { key: 'NOT_FOUND', label: 'Bulunamadi' },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        key={isWide ? 'invoices-wide' : 'invoices-phone'}
        data={filteredDocuments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        numColumns={isWide ? 2 : 1}
        columnWrapperStyle={isWide ? styles.columnWrapper : undefined}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.hero}>
              <Text style={styles.heroKicker}>E-Fatura Arsivi</Text>
              <Text style={styles.heroTitle} numberOfLines={1}>Faturalarim</Text>
              <Text style={styles.heroSubtitle} numberOfLines={2}>Fatura no, tarih ve durum filtresiyle PDF dosyalarina hizli erisin.</Text>
              <View style={styles.heroMetricRow}>
                <View style={styles.heroMetric}>
                  <Text style={styles.heroMetricValue} numberOfLines={1}>{summary.total}</Text>
                  <Text style={styles.heroMetricLabel} numberOfLines={1}>Toplam</Text>
                </View>
                <View style={styles.heroMetric}>
                  <Text style={styles.heroMetricValue} numberOfLines={1}>{summary.filtered}</Text>
                  <Text style={styles.heroMetricLabel} numberOfLines={1}>Filtre</Text>
                </View>
                <View style={styles.heroMetric}>
                  <Text style={styles.heroMetricValue} numberOfLines={1}>{pagination.page}/{pagination.totalPages}</Text>
                  <Text style={styles.heroMetricLabel} numberOfLines={1}>Sayfa</Text>
                </View>
              </View>
            </View>
            <View style={styles.filterCard}>
              <TextInput
                style={styles.input}
                placeholder="Fatura no ara"
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
                onSubmitEditing={() => loadDocuments(1)}
              />
              <View style={styles.filterRow}>
                <TextInput
                  style={styles.input}
                  placeholder="Baslangic YYYY-MM-DD"
                  placeholderTextColor={colors.textMuted}
                  value={fromDate}
                  onChangeText={setFromDate}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Bitis YYYY-MM-DD"
                  placeholderTextColor={colors.textMuted}
                  value={toDate}
                  onChangeText={setToDate}
                />
              </View>
              <TouchableOpacity style={styles.primaryButton} onPress={() => loadDocuments(1)}>
                <Text style={styles.primaryButtonText}>Faturalari Getir</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.statusRow}>
              {statusOptions.map((option) => (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.statusChip, statusFilter === option.key && styles.statusChipActive]}
                  onPress={() => setStatusFilter(option.key)}
                >
                  <Text style={statusFilter === option.key ? styles.statusChipTextActive : styles.statusChipText}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Toplam</Text>
                <Text style={styles.summaryValue}>{summary.total}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Bu sayfa</Text>
                <Text style={styles.summaryValue}>{summary.pageCount}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Filtre</Text>
                <Text style={styles.summaryValue}>{summary.filtered}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Tutar</Text>
                <Text style={styles.summaryValueSmall}>{formatAmount(summary.amount, 'TRY')}</Text>
              </View>
            </View>
            <Text style={styles.pageMeta}>Sayfa: {pagination.page}/{pagination.totalPages}</Text>
            {error && <Text style={styles.error}>{error}</Text>}
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.card, isWide && styles.gridItem]}>
            <View style={styles.cardTop}>
              <View style={styles.cardTitleBlock}>
                <Text style={styles.cardTitle} numberOfLines={2} ellipsizeMode="middle">{item.invoiceNo}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>Tarih: {formatDate(item.issueDate || item.sentAt || item.createdAt)}</Text>
              </View>
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>{statusLabel(item.matchStatus)}</Text>
              </View>
            </View>
            <Text style={styles.cardMeta} numberOfLines={1}>Tutar: {formatAmount(item.totalAmount, item.currency)}</Text>
            <Text style={styles.cardMeta} numberOfLines={2} ellipsizeMode="middle">Dosya: {item.fileName || item.originalName || '-'}</Text>
            <TouchableOpacity
              style={[styles.downloadButton, downloadingId === item.id && styles.buttonDisabled]}
              disabled={downloadingId === item.id}
              onPress={() => shareInvoice(item)}
            >
              <Text style={styles.downloadButtonText}>
                {downloadingId === item.id ? 'Aciliyor...' : 'PDF Ac / Paylas'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        ListFooterComponent={
          <View style={styles.paginationRow}>
            <TouchableOpacity
              style={[styles.pageButton, !canPrev && styles.buttonDisabled]}
              disabled={!canPrev || loading}
              onPress={() => loadDocuments(pagination.page - 1)}
            >
              <Text style={styles.pageButtonText}>Onceki</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pageButton, !canNext && styles.buttonDisabled]}
              disabled={!canNext || loading}
              onPress={() => loadDocuments(pagination.page + 1)}
            >
              <Text style={styles.pageButtonText}>Sonraki</Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Bu filtreye uygun fatura bulunamadi.</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
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
  heroMetricLabel: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFD7FF',
  },
  filterCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
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
    fontSize: fontSizes.sm,
  },
  statusRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  statusChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  statusChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  statusChipText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  statusChipTextActive: {
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
    minWidth: 118,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
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
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  pageMeta: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
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
    gap: spacing.xs,
  },
  gridItem: {
    flex: 1,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cardTitleBlock: {
    flex: 1,
    minWidth: 0,
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
  statusBadge: {
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statusText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.primary,
  },
  downloadButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  downloadButtonText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: '#FFFFFF',
  },
  paginationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  pageButton: {
    flex: 1,
    minWidth: 120,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  pageButtonText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.primary,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  loading: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
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
