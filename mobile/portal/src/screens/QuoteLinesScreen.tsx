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

import { adminApi } from '../api/admin';
import { QuoteLineItem } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';

const STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Acik' },
  { value: 'CLOSED', label: 'Kapali' },
  { value: 'CONVERTED', label: 'Siparise Cevrildi' },
  { value: 'ALL', label: 'Tum' },
] as const;

const CLOSE_REASONS = [
  'Stok yok',
  'Fiyat kabul edilmedi',
  'Musteri vazgecti',
  'Teklif suresi doldu',
  'Hata/duzeltme',
  'Diger',
];

export function QuoteLinesScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 820;
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]['value']>('OPEN');
  const [search, setSearch] = useState('');
  const [closeReasonFilter, setCloseReasonFilter] = useState('');
  const [lines, setLines] = useState<QuoteLineItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkReason, setBulkReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const linesRequestSeqRef = useRef(0);
  const operationBusyRef = useRef<string | null>(null);

  const beginLineOperation = (operationKey: string) => {
    if (operationBusyRef.current) return false;
    operationBusyRef.current = operationKey;
    if (operationKey === 'bulk') setBulkBusy(true);
    else setBusyId(operationKey);
    return true;
  };

  const endLineOperation = () => {
    operationBusyRef.current = null;
    setBusyId(null);
    setBulkBusy(false);
  };

  const fetchLines = async () => {
    const requestSeq = linesRequestSeqRef.current + 1;
    linesRequestSeqRef.current = requestSeq;
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getQuoteLineItems({
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        search: search.trim() || undefined,
        closeReason: closeReasonFilter || undefined,
        limit: 100,
        offset: 0,
      });
      if (requestSeq === linesRequestSeqRef.current) {
        setLines(response.items || []);
        setSelectedIds(new Set());
      }
    } catch (err: any) {
      if (requestSeq === linesRequestSeqRef.current) {
        setError(getApiErrorMessage(err, 'Teklif kalemleri yuklenemedi.'));
      }
    } finally {
      if (requestSeq === linesRequestSeqRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const handle = setTimeout(() => {
      fetchLines();
    }, 300);
    return () => clearTimeout(handle);
  }, [statusFilter, search, closeReasonFilter]);

  const openIds = useMemo(
    () => lines.filter((line) => (line.status || 'OPEN') === 'OPEN').map((line) => line.id),
    [lines]
  );

  const selectedOpenIds = useMemo(() => {
    const openSet = new Set(openIds);
    return Array.from(selectedIds).filter((id) => openSet.has(id));
  }, [selectedIds, openIds]);

  const lineCounts = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        const status = line.status || 'OPEN';
        acc.total += 1;
        if (status === 'OPEN') acc.open += 1;
        else if (status === 'CLOSED') acc.closed += 1;
        else if (status === 'CONVERTED') acc.converted += 1;
        return acc;
      },
      { total: 0, open: 0, closed: 0, converted: 0 }
    );
  }, [lines]);

  const totalLineAmount = useMemo(
    () => lines.reduce((sum, line) => sum + Number(line.totalPrice || 0), 0),
    [lines]
  );

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const closeSingle = async (line: QuoteLineItem) => {
    if (operationBusyRef.current) return;
    if (!bulkReason) {
      Alert.alert('Bilgi', 'Kapatma nedeni secin.');
      return;
    }
    if (!beginLineOperation(line.id)) return;
    try {
      await adminApi.closeQuoteLineItems([{ id: line.id, reason: bulkReason }]);
      await fetchLines();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Kalem kapatilamadi.'));
    } finally {
      endLineOperation();
    }
  };

  const reopenSingle = async (line: QuoteLineItem) => {
    if (operationBusyRef.current) return;
    if (!beginLineOperation(line.id)) return;
    try {
      await adminApi.reopenQuoteLineItems([line.id]);
      await fetchLines();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Kalem acilamadi.'));
    } finally {
      endLineOperation();
    }
  };

  const closeBulk = async () => {
    if (operationBusyRef.current) return;
    if (!bulkReason) {
      Alert.alert('Bilgi', 'Kapatma nedeni secin.');
      return;
    }
    if (selectedOpenIds.length === 0) {
      Alert.alert('Bilgi', 'Kapatmak icin acik kalem secin.');
      return;
    }
    if (!beginLineOperation('bulk')) return;
    try {
      await adminApi.closeQuoteLineItems(
        selectedOpenIds.map((id) => ({ id, reason: bulkReason }))
      );
      await fetchLines();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Toplu kapatma basarisiz.'));
    } finally {
      endLineOperation();
    }
  };

  const formatCurrency = (value?: number | null) => {
    if (value === null || value === undefined) return '-';
    return value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getStatusStyle = (status?: string) => {
    if (status === 'CLOSED') return [styles.badge, styles.badgeDanger, styles.badgeTextDanger] as const;
    if (status === 'CONVERTED') return [styles.badge, styles.badgeInfo, styles.badgeTextInfo] as const;
    return [styles.badge, styles.badgeSuccess, styles.badgeTextSuccess] as const;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={lines}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, isTablet && styles.listContentTablet]}
          ListHeaderComponent={
            <View style={styles.headerWrap}>
              <View style={styles.header}>
                <Text style={styles.kicker}>Teklif Operasyonu</Text>
                <Text style={styles.title}>Teklif Kalemleri</Text>
                <Text style={styles.subtitle}>Acik satirlari kapatin, nedenleri standartlastirin ve mobilde hizli temizlik yapin.</Text>
                <View style={styles.metricRow}>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>Gorunen</Text>
                    <Text style={styles.metricValue}>{lineCounts.total}</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>Acik</Text>
                    <Text style={[styles.metricValue, lineCounts.open > 0 && styles.metricDanger]}>{lineCounts.open}</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>Kapali</Text>
                    <Text style={styles.metricValue}>{lineCounts.closed}</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>Tutar</Text>
                    <Text style={styles.metricValueSmall}>{formatCurrency(totalLineAmount)}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.controlCard}>
              <View style={styles.filterRow}>
                {STATUS_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.statusButton, statusFilter === option.value && styles.statusButtonActive]}
                    onPress={() => setStatusFilter(option.value)}
                  >
                    <Text
                      style={statusFilter === option.value ? styles.statusTextActive : styles.statusText}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={styles.input}
                placeholder="Urun/kod, cari/kod, teklif no"
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
              />

              <View style={styles.selectionInfo}>
                <Text style={styles.selectionText}>
                  {selectedOpenIds.length} acik kalem secili. Filtre: {STATUS_OPTIONS.find((option) => option.value === statusFilter)?.label || 'Tum'}
                </Text>
              </View>

              <View style={styles.reasonRow}>
                {CLOSE_REASONS.map((reason) => (
                  <TouchableOpacity
                    key={reason}
                    style={[styles.reasonChip, bulkReason === reason && styles.reasonChipActive]}
                    onPress={() => setBulkReason(reason)}
                  >
                    <Text style={bulkReason === reason ? styles.reasonChipTextActive : styles.reasonChipText}>
                      {reason}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, (bulkBusy || Boolean(busyId) || selectedOpenIds.length === 0) && styles.buttonDisabled]}
                onPress={closeBulk}
                disabled={bulkBusy || Boolean(busyId) || selectedOpenIds.length === 0}
              >
                <Text style={styles.primaryButtonText}>
                  {bulkBusy ? 'Kapatiliyor...' : `Secilileri Kapat (${selectedOpenIds.length})`}
                </Text>
              </TouchableOpacity>

              {error && <Text style={styles.error}>{error}</Text>}
              </View>
            </View>
          }
          renderItem={({ item }) => {
            const status = item.status || 'OPEN';
            const [badgeStyle, statusStyle, textStyle] = getStatusStyle(status);
            const isOpen = status === 'OPEN';
            const selected = selectedIds.has(item.id);

            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <TouchableOpacity
                    style={[styles.checkbox, selected && styles.checkboxActive, !isOpen && styles.checkboxDisabled]}
                    onPress={() => isOpen && toggleSelected(item.id)}
                    disabled={!isOpen}
                  >
                    {selected && <Text style={styles.checkboxMark}>X</Text>}
                  </TouchableOpacity>
                  <View style={styles.cardTitleWrap}>
                    <Text style={styles.cardTitle} numberOfLines={3}>{item.productName}</Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>{item.productCode}</Text>
                  </View>
                  <View style={[badgeStyle, statusStyle]}>
                    <Text style={textStyle}>
                      {status === 'CLOSED' ? 'Kapali' : status === 'CONVERTED' ? 'Siparis' : 'Acik'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardMeta} numberOfLines={1}>Teklif: {item.quote?.quoteNumber || '-'}</Text>
                <Text style={styles.cardMeta} numberOfLines={2}>
                  Cari: {item.quote?.customer?.displayName || item.quote?.customer?.name || '-'}
                </Text>
                <View style={styles.cardStats}>
                  <View style={styles.cardStat}>
                    <Text style={styles.cardStatLabel}>Bekleme</Text>
                    <Text style={styles.cardStatValue}>{item.waitingDays ?? '-'} gun</Text>
                  </View>
                  <View style={styles.cardStat}>
                    <Text style={styles.cardStatLabel}>Miktar</Text>
                    <Text style={styles.cardStatValue}>{item.quantity}</Text>
                  </View>
                  <View style={styles.cardStat}>
                    <Text style={styles.cardStatLabel}>Birim</Text>
                    <Text style={styles.cardStatValue}>{formatCurrency(item.unitPrice)}</Text>
                  </View>
                  <View style={styles.cardStat}>
                    <Text style={styles.cardStatLabel}>Toplam</Text>
                    <Text style={styles.cardStatValue}>{formatCurrency(item.totalPrice)}</Text>
                  </View>
                </View>
                {item.closeReason ? <Text style={styles.cardMeta} numberOfLines={2}>Neden: {item.closeReason}</Text> : null}

                {isOpen ? (
                  <TouchableOpacity
                    style={[styles.secondaryButton, (bulkBusy || Boolean(busyId)) && styles.buttonDisabled]}
                    onPress={() => closeSingle(item)}
                    disabled={bulkBusy || Boolean(busyId)}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {busyId === item.id ? 'Kapatiliyor...' : 'Kalemi Kapat'}
                    </Text>
                  </TouchableOpacity>
                ) : status === 'CLOSED' ? (
                  <TouchableOpacity
                    style={[styles.secondaryButton, (bulkBusy || Boolean(busyId)) && styles.buttonDisabled]}
                    onPress={() => reopenSingle(item)}
                    disabled={bulkBusy || Boolean(busyId)}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {busyId === item.id ? 'Aciliyor...' : 'Kalemi Ac'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Kayit bulunamadi.</Text>
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
  listContentTablet: {
    maxWidth: 1180,
    alignSelf: 'center',
    width: '100%',
  },
  headerWrap: {
    gap: spacing.md,
  },
  header: {
    paddingVertical: spacing.xs,
    gap: spacing.md,
  },
  kicker: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFD7FF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: '#FFFFFF',
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: '#DDE8FF',
    lineHeight: 20,
  },
  metricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metric: {
    flex: 1,
    minWidth: 120,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 3,
  },
  metricLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#C9D8F2',
  },
  metricValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: '#FFFFFF',
  },
  metricValueSmall: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: '#FFFFFF',
  },
  metricDanger: {
    color: '#FCA5A5',
  },
  controlCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  statusButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  statusButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  statusText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  statusTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#FFFFFF',
  },
  input: {
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
  selectionInfo: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  selectionText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  reasonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  reasonChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.surface,
  },
  reasonChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primarySoft,
  },
  reasonChipText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  reasonChipTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.primarySoft,
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
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  buttonDisabled: {
    opacity: 0.6,
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
    gap: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxDisabled: {
    opacity: 0.35,
  },
  checkboxMark: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xs,
    color: '#FFFFFF',
  },
  cardTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  cardStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  cardStat: {
    flex: 1,
    minWidth: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: 2,
  },
  cardStatLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  cardStatValue: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.text,
  },
  badge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
  },
  badgeSuccess: {
    backgroundColor: colors.successSoft,
    borderColor: '#86EFAC',
  },
  badgeInfo: {
    backgroundColor: colors.primaryMuted,
    borderColor: '#93C5FD',
  },
  badgeDanger: {
    backgroundColor: colors.dangerSoft,
    borderColor: '#FCA5A5',
  },
  badgeTextSuccess: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.success,
  },
  badgeTextInfo: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#1E3A8A',
  },
  badgeTextDanger: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.danger,
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
