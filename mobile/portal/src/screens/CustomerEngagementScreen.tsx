import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import {
  adminApi,
  ContactLogEntry,
  EngagementRow,
  EngagementStatus,
} from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { hapticSuccess } from '../utils/haptics';

const PAGE_SIZE = 40;

const statusOptions: Array<{ value: '' | EngagementStatus; label: string }> = [
  { value: '', label: 'Tumu' },
  { value: 'KAYITSIZ', label: 'Kayitsiz' },
  { value: 'HIC_GIRMEMIS', label: 'Hic girmemis' },
  { value: 'AKTIF', label: 'Aktif' },
  { value: 'YAVASLIYOR', label: 'Yavasliyor' },
  { value: 'KAYIP_RISKI', label: 'Kayip riski' },
];

const statusLabel: Record<EngagementStatus, string> = {
  KAYITSIZ: 'Kayitsiz',
  HIC_GIRMEMIS: 'Hic girmemis',
  AKTIF: 'Aktif',
  YAVASLIYOR: 'Yavasliyor',
  KAYIP_RISKI: 'Kayip riski',
};

const priorityColor = (priority?: string) => {
  if (priority === 'CRITICAL') return colors.danger;
  if (priority === 'HIGH' || priority === 'MEDIUM') return colors.warning;
  return '#059669';
};

const healthColor = (score?: number | null) => {
  const value = Number(score || 0);
  if (value >= 75) return '#059669';
  if (value >= 55) return colors.warning;
  return colors.danger;
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString('tr-TR');
};

const formatMoney = (value?: number | null) =>
  `${Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL`;

function KpiCard({ label, value, tone }: { label: string; value: string | number; tone?: 'red' | 'amber' | 'green' }) {
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text
        style={[
          styles.kpiValue,
          tone === 'red' && styles.textDanger,
          tone === 'amber' && styles.textWarning,
          tone === 'green' && styles.textSuccess,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

export function CustomerEngagementScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const [rows, setRows] = useState<EngagementRow[]>([]);
  const [kpis, setKpis] = useState<any>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [status, setStatus] = useState<'' | EngagementStatus>('');
  const [followUpDue, setFollowUpDue] = useState(false);
  const [tickingCode, setTickingCode] = useState<string | null>(null);

  const [modalRow, setModalRow] = useState<EngagementRow | null>(null);
  const [contacts, setContacts] = useState<ContactLogEntry[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [note, setNote] = useState('');
  const [channel, setChannel] = useState('Telefon');
  const [outcome, setOutcome] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.getCustomerEngagement({
        search: appliedSearch.trim() || undefined,
        status: status || undefined,
        sort: 'urgency',
        page,
        limit: PAGE_SIZE,
        followUpDue: followUpDue || undefined,
      });
      setRows(result.rows || []);
      setKpis(result.kpis || null);
      setTotal(result.total || 0);
    } catch (err: any) {
      setRows([]);
      setKpis(null);
      setTotal(0);
      setError(err?.response?.status === 403 ? 'Bu rapora erisim yetkiniz yok.' : err?.response?.data?.error || 'Cari aktivite raporu yuklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, status, page, followUpDue]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const summary = useMemo(() => {
    if (!kpis) return [];
    const healthTone: 'green' | 'amber' = Number(kpis.avgHealthScore || 0) >= 75 ? 'green' : 'amber';
    return [
      { label: 'Toplam cari', value: kpis.total || 0 },
      { label: 'B2B kayitli', value: `${kpis.registered || 0} (%${kpis.registeredPct || 0})`, tone: 'green' as const },
      { label: 'Hic girmemis', value: kpis.neverLoggedIn || 0, tone: 'red' as const },
      { label: 'Bugun aranacak', value: kpis.followUpDue || 0, tone: 'amber' as const },
      { label: 'Aksiyon', value: kpis.actionDue || 0, tone: 'red' as const },
      { label: 'Saglik', value: `${kpis.avgHealthScore || 0}/100`, tone: healthTone },
    ];
  }, [kpis]);

  const applySearch = () => {
    setPage(1);
    setAppliedSearch(search);
  };

  const quickReminder = async (row: EngagementRow) => {
    setTickingCode(row.customerCode);
    try {
      await adminApi.addCustomerEngagementContact(row.customerCode, { customerName: row.customerName });
      hapticSuccess();
      await fetchReport();
    } catch (err: any) {
      Alert.alert('Hatirlatma yazilamadi', err?.response?.data?.error || 'Islem tamamlanamadi.');
    } finally {
      setTickingCode(null);
    }
  };

  const openContactModal = async (row: EngagementRow) => {
    setModalRow(row);
    setContacts([]);
    setNote('');
    setChannel('Telefon');
    setOutcome('');
    setFollowUpDate('');
    setContactsLoading(true);
    try {
      const result = await adminApi.getCustomerEngagementContacts(row.customerCode);
      setContacts(result.contacts || []);
    } catch {
      setContacts([]);
    } finally {
      setContactsLoading(false);
    }
  };

  const saveContact = async () => {
    if (!modalRow) return;
    setSubmitting(true);
    try {
      await adminApi.addCustomerEngagementContact(modalRow.customerCode, {
        customerName: modalRow.customerName,
        note: note.trim() || undefined,
        channel: channel.trim() || 'Genel',
        outcome: outcome.trim() || undefined,
        followUpDate: followUpDate.trim() || null,
      });
      hapticSuccess();
      const result = await adminApi.getCustomerEngagementContacts(modalRow.customerCode);
      setContacts(result.contacts || []);
      setNote('');
      setOutcome('');
      setFollowUpDate('');
      await fetchReport();
    } catch (err: any) {
      Alert.alert('Temas kaydedilemedi', err?.response?.data?.error || 'Islem tamamlanamadi.');
    } finally {
      setSubmitting(false);
    }
  };

  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.customerCode}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Cari Aktivite</Text>
            <Text style={styles.subtitle}>B2B giris, siparis ve temas takip merkezi.</Text>
            <View style={styles.kpiGrid}>
              {summary.map((item) => (
                <KpiCard key={item.label} label={item.label} value={item.value} tone={item.tone} />
              ))}
            </View>
            <View style={styles.filterCard}>
              <TextInput
                style={styles.input}
                placeholder="Cari kodu veya unvan ara"
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
                onSubmitEditing={applySearch}
              />
              <TouchableOpacity style={styles.primaryButton} onPress={applySearch}>
                <Text style={styles.primaryButtonText}>Ara</Text>
              </TouchableOpacity>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusRow}>
                {statusOptions.map((item) => (
                  <TouchableOpacity
                    key={item.value || 'all'}
                    style={[styles.segmentButton, status === item.value && styles.segmentButtonActive]}
                    onPress={() => {
                      setStatus(item.value);
                      setPage(1);
                    }}
                  >
                    <Text style={status === item.value ? styles.segmentTextActive : styles.segmentText}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity
                style={[styles.followButton, followUpDue && styles.followButtonActive]}
                onPress={() => {
                  setFollowUpDue((value) => !value);
                  setPage(1);
                }}
              >
                <Text style={followUpDue ? styles.followButtonTextActive : styles.followButtonText}>Sadece bugun aranacaklar</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.summaryLine}>
              <Text style={styles.summaryText}>Toplam: {total}</Text>
              <Text style={styles.summaryText}>Sayfa: {page}/{totalPages}</Text>
            </View>
            {error && <Text style={styles.error}>{error}</Text>}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.titleBlock}>
                <Text style={styles.customerName}>{item.customerName}</Text>
                <Text style={styles.customerMeta}>
                  {item.customerCode} {item.sectorCode ? `- ${item.sectorCode}` : ''}
                </Text>
              </View>
              <View style={[styles.healthBadge, { borderColor: healthColor(item.healthScore) }]}>
                <Text style={[styles.healthText, { color: healthColor(item.healthScore) }]}>{item.healthScore || 0}/100</Text>
              </View>
            </View>

            <View style={styles.badgeRow}>
              <Text style={styles.statusBadge}>{statusLabel[item.status] || item.status}</Text>
              <Text style={[styles.priorityBadge, { color: priorityColor(item.actionPriority) }]}>{item.actionPriority}</Text>
              {!item.registered && <Text style={styles.warningBadge}>B2B hesabi yok</Text>}
            </View>

            <Text style={styles.cardMeta}>Oneri: {item.suggestedAction || '-'}</Text>
            {!!item.actionReason && <Text style={styles.cardMeta}>Neden: {item.actionReason}</Text>}
            <Text style={styles.cardMeta}>Son giris: {formatDate(item.lastLoginAt)} · Giris: {item.loginCount || 0}</Text>
            <Text style={styles.cardMeta}>Siparis: {item.orderCount || 0} · {formatMoney(item.orderTotal)} · Bakiye: {formatMoney(item.balance)}</Text>
            <Text style={styles.cardMeta}>Son temas: {formatDate(item.lastContactAt)} · Sonraki takip: {formatDate(item.nextFollowUpDate)}</Text>

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => navigation.navigate('Customer360', { customerIdOrCode: item.userId || item.customerCode })}
                >
                  <Text style={styles.secondaryButtonText}>360</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => openContactModal(item)}>
                  <Text style={styles.secondaryButtonText}>Temas / Not</Text>
                </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryButton, tickingCode === item.customerCode && styles.buttonDisabled]}
                disabled={tickingCode === item.customerCode}
                onPress={() => quickReminder(item)}
              >
                <Text style={styles.secondaryButtonText}>{tickingCode === item.customerCode ? 'Isleniyor' : 'Hatirlatildi'}</Text>
              </TouchableOpacity>
              {item.userId && (
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => navigation.navigate('CustomerDetail', { customerId: item.userId! })}
                >
                  <Text style={styles.secondaryButtonText}>Cari</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
        ListFooterComponent={
          <View style={styles.paginationRow}>
            <TouchableOpacity
              style={[styles.pageButton, !canPrev && styles.buttonDisabled]}
              disabled={!canPrev || loading}
              onPress={() => setPage((value) => Math.max(1, value - 1))}
            >
              <Text style={styles.pageButtonText}>Onceki</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pageButton, !canNext && styles.buttonDisabled]}
              disabled={!canNext || loading}
              onPress={() => setPage((value) => value + 1)}
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
              <Text style={styles.emptyText}>Cari bulunamadi.</Text>
            </View>
          )
        }
      />

      <Modal visible={Boolean(modalRow)} animationType="slide" transparent onRequestClose={() => setModalRow(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
              <Text style={styles.modalTitle}>{modalRow?.customerName}</Text>
              <Text style={styles.modalSubtitle}>{modalRow?.customerCode}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Gorusme notu"
                placeholderTextColor={colors.textMuted}
                multiline
                value={note}
                onChangeText={setNote}
              />
              <View style={styles.formRow}>
                <TextInput style={styles.input} placeholder="Kanal" placeholderTextColor={colors.textMuted} value={channel} onChangeText={setChannel} />
                <TextInput style={styles.input} placeholder="Sonuc" placeholderTextColor={colors.textMuted} value={outcome} onChangeText={setOutcome} />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Sonraki takip YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
                value={followUpDate}
                onChangeText={setFollowUpDate}
              />
              <TouchableOpacity style={[styles.primaryButton, submitting && styles.buttonDisabled]} disabled={submitting} onPress={saveContact}>
                <Text style={styles.primaryButtonText}>{submitting ? 'Kaydediliyor' : 'Temasi Kaydet'}</Text>
              </TouchableOpacity>

              <Text style={styles.historyTitle}>Gecmis Temaslar</Text>
              {contactsLoading ? (
                <ActivityIndicator color={colors.primary} />
              ) : contacts.length === 0 ? (
                <Text style={styles.emptyText}>Temas kaydi yok.</Text>
              ) : (
                contacts.map((contact) => (
                  <View key={contact.id} style={styles.contactCard}>
                    <Text style={styles.contactDate}>{formatDate(contact.contactedAt)} · {contact.channel || 'Genel'}</Text>
                    {!!contact.note && <Text style={styles.contactNote}>{contact.note}</Text>}
                    <Text style={styles.cardMeta}>
                      {contact.contactedByName || '-'} {contact.outcome ? `· ${contact.outcome}` : ''} {contact.followUpDate ? `· Takip ${formatDate(contact.followUpDate)}` : ''}
                    </Text>
                  </View>
                ))
              )}
              <TouchableOpacity style={styles.closeButton} onPress={() => setModalRow(null)}>
                <Text style={styles.closeButtonText}>Kapat</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.xl, gap: spacing.md },
  header: { gap: spacing.sm },
  title: { fontFamily: fonts.bold, fontSize: fontSizes.xl, color: colors.text },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSizes.md, color: colors.textMuted },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  kpiCard: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  kpiLabel: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.textMuted },
  kpiValue: { marginTop: 4, fontFamily: fonts.bold, fontSize: fontSizes.xl, color: colors.text },
  textDanger: { color: colors.danger },
  textWarning: { color: colors.warning },
  textSuccess: { color: '#059669' },
  filterCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
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
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center' },
  primaryButtonText: { fontFamily: fonts.semibold, color: '#FFFFFF', fontSize: fontSizes.sm },
  statusRow: { gap: spacing.xs },
  segmentButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  segmentButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.textMuted },
  segmentTextActive: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: '#FFFFFF' },
  followButton: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.sm, alignItems: 'center' },
  followButtonActive: { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' },
  followButtonText: { fontFamily: fonts.semibold, color: colors.textMuted },
  followButtonTextActive: { fontFamily: fonts.semibold, color: '#92400E' },
  summaryLine: { flexDirection: 'row', gap: spacing.md },
  summaryText: { fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.textMuted },
  error: { fontFamily: fonts.medium, color: colors.danger },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  titleBlock: { flex: 1, minWidth: 0 },
  customerName: { fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.text },
  customerMeta: { marginTop: 2, fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  healthBadge: { borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  healthText: { fontFamily: fonts.bold, fontSize: fontSizes.xs },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  statusBadge: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.primary, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4, overflow: 'hidden' },
  priorityBadge: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, backgroundColor: '#FFF7ED', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4, overflow: 'hidden' },
  warningBadge: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: '#92400E', backgroundColor: '#FEF3C7', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4, overflow: 'hidden' },
  cardMeta: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.textMuted, marginTop: 2 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  secondaryButton: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: '#F8FAFC' },
  secondaryButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.primary },
  pageButton: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.sm, alignItems: 'center' },
  pageButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.primary },
  paginationRow: { flexDirection: 'row', gap: spacing.sm },
  buttonDisabled: { opacity: 0.55 },
  loading: { paddingVertical: spacing.xl, alignItems: 'center' },
  empty: { paddingVertical: spacing.xl, alignItems: 'center' },
  emptyText: { fontFamily: fonts.regular, color: colors.textMuted },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(10, 26, 49, 0.35)', justifyContent: 'flex-end' },
  modalCard: { maxHeight: '88%', backgroundColor: colors.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  modalContent: { padding: spacing.xl, gap: spacing.sm },
  modalTitle: { fontFamily: fonts.bold, fontSize: fontSizes.xl, color: colors.text },
  modalSubtitle: { fontFamily: fonts.medium, color: colors.textMuted },
  formRow: { flexDirection: 'row', gap: spacing.sm },
  historyTitle: { marginTop: spacing.md, fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.text },
  contactCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 4 },
  contactDate: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.primary },
  contactNote: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.text },
  closeButton: { marginTop: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.sm, alignItems: 'center' },
  closeButtonText: { fontFamily: fonts.semibold, color: colors.text },
});
