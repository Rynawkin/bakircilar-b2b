import { useEffect, useMemo, useState } from 'react';
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

import { adminApi } from '../api/admin';
import { QuoteLineItem } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

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

  const fetchLines = async () => {
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
      setLines(response.items || []);
      setSelectedIds(new Set());
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Teklif kalemleri yuklenemedi.');
    } finally {
      setLoading(false);
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

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const closeSingle = async (line: QuoteLineItem) => {
    if (!bulkReason) {
      Alert.alert('Bilgi', 'Kapatma nedeni secin.');
      return;
    }
    setBusyId(line.id);
    try {
      await adminApi.closeQuoteLineItems([{ id: line.id, reason: bulkReason }]);
      await fetchLines();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Kalem kapatilamadi.');
    } finally {
      setBusyId(null);
    }
  };

  const reopenSingle = async (line: QuoteLineItem) => {
    setBusyId(line.id);
    try {
      await adminApi.reopenQuoteLineItems([line.id]);
      await fetchLines();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Kalem acilamadi.');
    } finally {
      setBusyId(null);
    }
  };

  const closeBulk = async () => {
    if (!bulkReason) {
      Alert.alert('Bilgi', 'Kapatma nedeni secin.');
      return;
    }
    if (selectedOpenIds.length === 0) {
      Alert.alert('Bilgi', 'Kapatmak icin acik kalem secin.');
      return;
    }
    setBulkBusy(true);
    try {
      await adminApi.closeQuoteLineItems(
        selectedOpenIds.map((id) => ({ id, reason: bulkReason }))
      );
      await fetchLines();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Toplu kapatma basarisiz.');
    } finally {
      setBulkBusy(false);
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
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.title}>Teklif Kalemleri</Text>
              <Text style={styles.subtitle}>Acik/kapali satirlari mobilde yonetin.</Text>

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
                style={[styles.primaryButton, (bulkBusy || selectedOpenIds.length === 0) && styles.buttonDisabled]}
                onPress={closeBulk}
                disabled={bulkBusy || selectedOpenIds.length === 0}
              >
                <Text style={styles.primaryButtonText}>
                  {bulkBusy ? 'Kapatiliyor...' : `Secilileri Kapat (${selectedOpenIds.length})`}
                </Text>
              </TouchableOpacity>

              {error && <Text style={styles.error}>{error}</Text>}
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
                    <Text style={styles.cardTitle}>{item.productName}</Text>
                    <Text style={styles.cardMeta}>{item.productCode}</Text>
                  </View>
                  <View style={[badgeStyle, statusStyle]}>
                    <Text style={textStyle}>
                      {status === 'CLOSED' ? 'Kapali' : status === 'CONVERTED' ? 'Siparis' : 'Acik'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardMeta}>Teklif: {item.quote?.quoteNumber || '-'}</Text>
                <Text style={styles.cardMeta}>
                  Cari: {item.quote?.customer?.displayName || item.quote?.customer?.name || '-'}
                </Text>
                <Text style={styles.cardMeta}>Bekleme: {item.waitingDays ?? '-'} gun</Text>
                <Text style={styles.cardMeta}>
                  {item.quantity} x {formatCurrency(item.unitPrice)} = {formatCurrency(item.totalPrice)}
                </Text>
                {item.closeReason ? <Text style={styles.cardMeta}>Neden: {item.closeReason}</Text> : null}

                {isOpen ? (
                  <TouchableOpacity
                    style={[styles.secondaryButton, busyId === item.id && styles.buttonDisabled]}
                    onPress={() => closeSingle(item)}
                    disabled={busyId === item.id}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {busyId === item.id ? 'Kapatiliyor...' : 'Kalemi Kapat'}
                    </Text>
                  </TouchableOpacity>
                ) : status === 'CLOSED' ? (
                  <TouchableOpacity
                    style={[styles.secondaryButton, busyId === item.id && styles.buttonDisabled]}
                    onPress={() => reopenSingle(item)}
                    disabled={busyId === item.id}
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
    fontSize: fontSizes.sm,
    color: colors.textMuted,
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
    color: colors.primary,
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
  badge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
  },
  badgeSuccess: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  badgeInfo: {
    backgroundColor: '#DBEAFE',
    borderColor: '#93C5FD',
  },
  badgeDanger: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  badgeTextSuccess: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#166534',
  },
  badgeTextInfo: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#1E3A8A',
  },
  badgeTextDanger: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#991B1B',
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
