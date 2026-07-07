import { useEffect, useState } from 'react';
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
import * as Sharing from 'expo-sharing';

import { customerApi, CustomerInvoiceDocument } from '../api/customer';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

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
  const [documents, setDocuments] = useState<CustomerInvoiceDocument[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const loadDocuments = async (page = 1) => {
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
      setDocuments(response.documents || []);
      setPagination(response.pagination || { page, limit: pagination.limit, total: 0, totalPages: 1 });
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Faturalar yuklenemedi.');
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shareInvoice = async (document: CustomerInvoiceDocument) => {
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
      Alert.alert('Fatura indirilemedi', err?.response?.data?.error || err?.message || 'PDF dosyasi alinamadi.');
    } finally {
      setDownloadingId(null);
    }
  };

  const canPrev = pagination.page > 1;
  const canNext = pagination.page < pagination.totalPages;

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Faturalarim</Text>
            <Text style={styles.subtitle}>E-faturalarinizi listeleyin ve PDF olarak acin.</Text>
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
            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>Toplam: {pagination.total}</Text>
              <Text style={styles.summaryText}>Sayfa: {pagination.page}/{pagination.totalPages}</Text>
            </View>
            {error && <Text style={styles.error}>{error}</Text>}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.cardTitleBlock}>
                <Text style={styles.cardTitle}>{item.invoiceNo}</Text>
                <Text style={styles.cardMeta}>Tarih: {formatDate(item.issueDate || item.sentAt || item.createdAt)}</Text>
              </View>
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>{statusLabel(item.matchStatus)}</Text>
              </View>
            </View>
            <Text style={styles.cardMeta}>Tutar: {formatAmount(item.totalAmount, item.currency)}</Text>
            <Text style={styles.cardMeta}>Dosya: {item.fileName || item.originalName || '-'}</Text>
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
              <Text style={styles.emptyText}>Fatura bulunamadi.</Text>
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
  header: {
    gap: spacing.sm,
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
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  summaryText: {
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
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  pageButton: {
    flex: 1,
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
