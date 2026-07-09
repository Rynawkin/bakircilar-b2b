import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';

import {
  adminApi,
  ContactLogEntry,
  EngagementRow,
  EngagementStatus,
} from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
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

const sortOptions = [
  { value: 'urgency', label: 'Oncelik' },
  { value: 'orderTotalDesc', label: 'En cok siparis' },
  { value: 'lastLoginAsc', label: 'En eski giris' },
  { value: 'lastLoginDesc', label: 'En yeni giris' },
  { value: 'lastContactAsc', label: 'En eski temas' },
  { value: 'nameAsc', label: 'Isim' },
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
  const { width } = useWindowDimensions();
  const listColumns = width >= 900 ? 2 : 1;
  const [rows, setRows] = useState<EngagementRow[]>([]);
  const [kpis, setKpis] = useState<any>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [status, setStatus] = useState<'' | EngagementStatus>('');
  const [sort, setSort] = useState('urgency');
  const [followUpDue, setFollowUpDue] = useState(false);
  const [tickingCode, setTickingCode] = useState<string | null>(null);
  const [repBreakdown, setRepBreakdown] = useState<any[]>([]);
  const [exporting, setExporting] = useState(false);

  const [modalRow, setModalRow] = useState<EngagementRow | null>(null);
  const [contacts, setContacts] = useState<ContactLogEntry[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [note, setNote] = useState('');
  const [channel, setChannel] = useState('Telefon');
  const [outcome, setOutcome] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.getCustomerEngagement({
        search: appliedSearch.trim() || undefined,
        status: status || undefined,
        sort,
        page,
        limit: PAGE_SIZE,
        followUpDue: followUpDue || undefined,
      });
      setRows(result.rows || []);
      setKpis(result.kpis || null);
      setTotal(result.total || 0);
      setRepBreakdown(result.repBreakdown || []);
    } catch (err: any) {
      setRows([]);
      setKpis(null);
      setTotal(0);
      setRepBreakdown([]);
      setError(err?.response?.status === 403 ? 'Bu rapora erisim yetkiniz yok.' : getApiErrorMessage(err, 'Cari aktivite raporu yuklenemedi.'));
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, status, sort, page, followUpDue]);

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
    if (tickingCode) return;
    setTickingCode(row.customerCode);
    try {
      await adminApi.addCustomerEngagementContact(row.customerCode, { customerName: row.customerName });
      hapticSuccess();
      await fetchReport();
    } catch (err: any) {
      Alert.alert('Hatirlatma yazilamadi', getApiErrorMessage(err, 'Islem tamamlanamadi.'));
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
    if (!modalRow || submittingRef.current) return;
    submittingRef.current = true;
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
      Alert.alert('Temas kaydedilemedi', getApiErrorMessage(err, 'Islem tamamlanamadi.'));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const canPrev = page > 1;
  const canNext = page < totalPages;

  const exportExcel = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const limit = 500;
      let exportPage = 1;
      let expectedTotal = total || 0;
      const allRows: EngagementRow[] = [];

      while (exportPage <= 30) {
        const result = await adminApi.getCustomerEngagement({
          search: appliedSearch.trim() || undefined,
          status: status || undefined,
          sort,
          page: exportPage,
          limit,
          followUpDue: followUpDue || undefined,
        });
        const batch = result.rows || [];
        expectedTotal = result.total || expectedTotal;
        allRows.push(...batch);
        if (batch.length < limit || allRows.length >= expectedTotal) break;
        exportPage += 1;
      }

      if (!allRows.length) {
        Alert.alert('Bilgi', 'Disa aktarilacak cari bulunamadi.');
        return;
      }

      const rows = [
        ['Cari Kodu', 'Cari Adi', 'Sektor', 'Il', 'Telefon', 'Durum', 'Saglik Skoru', 'Oncelik', 'Oneri', 'Neden', 'B2B Kayitli', 'Son Giris', 'Giris Sayisi', 'Ortalama Giris Siklik Gun', 'Siparis Sayisi', 'Siparis Toplami', 'Siparis Ortalamasi', 'Son Siparis', 'Bakiye', 'Son Temas', 'Son Temas Eden', 'Temas Sayisi', 'Sonraki Takip', 'Temsilci'],
        ...allRows.map((row) => [
          row.customerCode || '',
          row.customerName || '',
          row.sectorCode || '',
          row.city || '',
          row.phone || '',
          statusLabel[row.status] || row.status || '',
          Number(row.healthScore || 0),
          row.actionPriority || '',
          row.suggestedAction || '',
          row.actionReason || '',
          row.registered ? 'Evet' : 'Hayir',
          row.lastLoginAt ? formatDate(row.lastLoginAt) : '',
          Number(row.loginCount || 0),
          row.loginFrequencyDays ?? '',
          Number(row.orderCount || 0),
          Number(row.orderTotal || 0),
          Number(row.orderAvg || 0),
          row.lastOrderAt ? formatDate(row.lastOrderAt) : '',
          Number(row.balance || 0),
          row.lastContactAt ? formatDate(row.lastContactAt) : '',
          row.lastContactByName || '',
          Number(row.contactCount || 0),
          row.nextFollowUpDate ? formatDate(row.nextFollowUpDate) : '',
          row.assignedSalesRepName || '',
        ]),
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = rows[0].map((header) => ({ wch: Math.min(Math.max(String(header).length + 4, 12), 34) }));
      XLSX.utils.book_append_sheet(wb, ws, 'Cari Aktivite');

      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
      const dir = `${FileSystem.documentDirectory}reports/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const target = `${dir}cari-aktivite-${stamp}.xlsx`;
      await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(target, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Cari Aktivite Excel',
        });
      } else {
        Alert.alert('Excel olusturuldu', target);
      }
    } catch (err: any) {
      Alert.alert('Excel olusturulamadi', getApiErrorMessage(err, 'Islem tamamlanamadi.'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        key={`engagement-${listColumns}`}
        data={rows}
        keyExtractor={(item) => item.customerCode}
        numColumns={listColumns}
        columnWrapperStyle={listColumns > 1 ? styles.columnWrapper : undefined}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.hero}>
              <Text style={styles.heroKicker}>Aksiyon Merkezi</Text>
              <Text style={styles.heroTitle}>Cari Aktivite</Text>
              <Text style={styles.heroSubtitle}>B2B giris, siparis, sepet ve temas sinyallerini satis aksiyonuna cevirin.</Text>
              <View style={styles.heroMetricRow}>
                <View style={styles.heroMetric}>
                  <Text style={styles.heroMetricValue}>{rows.length}</Text>
                  <Text style={styles.heroMetricLabel}>Cari</Text>
                </View>
                {summary.slice(0, 3).map((item) => (
                  <View key={item.label} style={styles.heroMetric}>
                    <Text style={[
                      styles.heroMetricValue,
                      item.tone === 'red' && styles.heroMetricDanger,
                      item.tone === 'amber' && styles.heroMetricWarn,
                      item.tone === 'green' && styles.heroMetricGood,
                    ]}>{item.value}</Text>
                    <Text style={styles.heroMetricLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </View>
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
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusRow}>
                {sortOptions.map((item) => (
                  <TouchableOpacity
                    key={item.value}
                    style={[styles.segmentButton, sort === item.value && styles.segmentButtonActive]}
                    onPress={() => {
                      setSort(item.value);
                      setPage(1);
                    }}
                  >
                    <Text style={sort === item.value ? styles.segmentTextActive : styles.segmentText}>{item.label}</Text>
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
              <TouchableOpacity
                style={[styles.exportButton, exporting && styles.buttonDisabled]}
                disabled={exporting}
                onPress={exportExcel}
              >
                <Text style={styles.exportButtonText}>{exporting ? 'Excel hazirlaniyor' : 'Excel Paylas'}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.summaryLine}>
              <Text style={styles.summaryText}>Toplam: {total}</Text>
              <Text style={styles.summaryText}>Sayfa: {page}/{totalPages}</Text>
            </View>
            {repBreakdown.length ? (
              <View style={styles.repCard}>
                <Text style={styles.repTitle}>Satici Kirilimi</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.repRow}>
                  {repBreakdown.map((rep, index) => (
                    <View key={`${rep.rep || index}`} style={styles.repItem}>
                      <Text style={styles.repName}>{rep.rep || 'Atanmamis'}</Text>
                      <Text style={styles.repMeta}>{rep.total || 0} cari</Text>
                      <Text style={styles.repMeta}>Aktif: {rep.active || 0} - Risk: {rep.risk || 0}</Text>
                      <Text style={styles.repMeta}>Bugun: {rep.followUpDue || 0}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : null}
            {error && (
              <TouchableOpacity style={styles.errorCard} onPress={fetchReport}>
                <Text style={styles.error}>{error}</Text>
                <Text style={styles.retryText}>Tekrar dene</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.titleBlock}>
                <Text style={styles.customerName} numberOfLines={2} ellipsizeMode="tail">
                  {item.customerName}
                </Text>
                <Text style={styles.customerMeta} numberOfLines={1} ellipsizeMode="middle">
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

            <Text style={styles.cardMeta} numberOfLines={2}>Oneri: {item.suggestedAction || '-'}</Text>
            {!!item.actionReason && <Text style={styles.cardMeta} numberOfLines={2}>Neden: {item.actionReason}</Text>}
            <Text style={styles.cardMeta} numberOfLines={1}>Son giris: {formatDate(item.lastLoginAt)} · Giris: {item.loginCount || 0}</Text>
            <Text style={styles.cardMeta} numberOfLines={1}>Siparis: {item.orderCount || 0} · {formatMoney(item.orderTotal)} · Bakiye: {formatMoney(item.balance)}</Text>
            <Text style={styles.cardMeta} numberOfLines={1}>Son temas: {formatDate(item.lastContactAt)} · Sonraki takip: {formatDate(item.nextFollowUpDate)}</Text>

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
  columnWrapper: { gap: spacing.md },
  header: { gap: spacing.sm },
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
  heroTitle: { fontFamily: fonts.bold, fontSize: fontSizes.xxl, color: '#FFFFFF', marginTop: spacing.xs },
  heroSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    lineHeight: fontSizes.sm + 5,
    color: '#DDE8FF',
    marginTop: spacing.xs,
  },
  heroMetricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  heroMetric: {
    flexGrow: 1,
    flexBasis: 86,
    minWidth: 82,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(221,232,255,0.22)',
    padding: spacing.sm,
  },
  heroMetricValue: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: '#FFFFFF' },
  heroMetricDanger: { color: '#FCA5A5' },
  heroMetricWarn: { color: '#FCD34D' },
  heroMetricGood: { color: '#86EFAC' },
  heroMetricLabel: { marginTop: 2, fontFamily: fonts.medium, fontSize: fontSizes.xs, color: '#BFD7FF' },
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
  followButtonActive: { backgroundColor: colors.warningSoft, borderColor: '#FCD34D' },
  followButtonText: { fontFamily: fonts.semibold, color: colors.textMuted },
  followButtonTextActive: { fontFamily: fonts.semibold, color: colors.warning },
  exportButton: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, paddingVertical: spacing.sm, alignItems: 'center', backgroundColor: colors.primaryMuted },
  exportButtonText: { fontFamily: fonts.semibold, color: colors.primarySoft, fontSize: fontSizes.sm },
  summaryLine: { flexDirection: 'row', gap: spacing.md },
  summaryText: { fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.textMuted },
  repCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  repTitle: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: colors.text },
  repRow: { gap: spacing.sm },
  repItem: {
    width: 160,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  repName: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.text },
  repMeta: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
  errorCard: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.30)',
    padding: spacing.md,
    gap: 4,
  },
  error: { fontFamily: fonts.medium, color: colors.danger },
  retryText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.primarySoft },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  titleBlock: { flex: 1, minWidth: 0 },
  customerName: { fontFamily: fonts.semibold, fontSize: fontSizes.md, lineHeight: fontSizes.md + 5, color: colors.text },
  customerMeta: { marginTop: 2, fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  healthBadge: { flexShrink: 0, borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  healthText: { fontFamily: fonts.bold, fontSize: fontSizes.xs },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  statusBadge: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.primarySoft, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4, overflow: 'hidden' },
  priorityBadge: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, backgroundColor: colors.warningSoft, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4, overflow: 'hidden' },
  warningBadge: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.warning, backgroundColor: colors.warningSoft, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4, overflow: 'hidden' },
  cardMeta: { fontFamily: fonts.regular, fontSize: fontSizes.sm, lineHeight: fontSizes.sm + 5, color: colors.textMuted, marginTop: 2 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  secondaryButton: { flexShrink: 0, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.surfaceMuted },
  secondaryButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.primarySoft, textAlign: 'center' },
  pageButton: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.sm, alignItems: 'center' },
  pageButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.primarySoft },
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
  contactDate: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.primarySoft },
  contactNote: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.text },
  closeButton: { marginTop: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.sm, alignItems: 'center' },
  closeButtonText: { fontFamily: fonts.semibold, color: colors.text },
});
