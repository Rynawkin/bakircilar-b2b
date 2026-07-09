import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import { CustomerRecoveryAction, adminApi } from '../api/admin';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';

type Draft = { status: string; outcome: string; followUpDate: string };

const statusOptions = [
  { value: 'OPEN', label: 'Acik' },
  { value: 'IN_PROGRESS', label: 'Surecte' },
  { value: 'DONE', label: 'Tamamlanan' },
  { value: 'ALL', label: 'Tumu' },
];

const outcomeTemplates = ['Arandi, ulasilamadi', 'Tekrar aranacak', 'Siparis sozu alindi', 'Ihtiyac yok', 'Rakipten aliyor'];
const followUpShortcuts = [
  { label: 'Bugun', days: 0 },
  { label: 'Yarin', days: 1 },
  { label: '3 gun', days: 3 },
  { label: '1 hafta', days: 7 },
];

const toDateInput = (value?: string | null) => value ? value.slice(0, 10) : '';
const safeDate = (value?: string | null) => {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleDateString('tr-TR');
  } catch {
    return value.slice(0, 10);
  }
};

const addDaysInput = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const dueTone = (value?: string | null) => {
  if (!value) return 'none';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'none';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  if (date < today) return 'overdue';
  if (date.getTime() === today.getTime()) return 'today';
  return 'future';
};

export function RecoveryActionsScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 860;
  const [actions, setActions] = useState<CustomerRecoveryAction[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [status, setStatus] = useState('OPEN');
  const [search, setSearch] = useState('');
  const [dueOnly, setDueOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, totalPages: 0, totalRecords: 0 });
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadActions = async (requestedPage = page) => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getAssignedCustomerRecoveryActions({
        status: status === 'ALL' ? undefined : status,
        search: search.trim() || undefined,
        dueOnly: dueOnly || undefined,
        page: requestedPage,
        limit: 50,
      });
      const nextActions = response.data.actions || [];
      setActions(nextActions);
      setPagination(response.data.pagination || { page: requestedPage, limit: 50, totalPages: 0, totalRecords: 0 });
      setDrafts(Object.fromEntries(nextActions.map((action) => [
        action.id,
        {
          status: action.status || 'OPEN',
          outcome: action.outcome || '',
          followUpDate: toDateInput(action.followUpDate),
        },
      ])));
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Atanan aksiyonlar alinamadi.'));
      setActions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActions(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const runSearch = () => {
    setPage(1);
    loadActions(1);
  };

  const updateDraft = (actionId: string, patch: Partial<Draft>) => {
    setDrafts((prev) => ({
      ...prev,
      [actionId]: {
        status: prev[actionId]?.status || 'OPEN',
        outcome: prev[actionId]?.outcome || '',
        followUpDate: prev[actionId]?.followUpDate || '',
        ...patch,
      },
    }));
  };

  const saveAction = async (action: CustomerRecoveryAction, forceDone = false) => {
    const draft = drafts[action.id];
    if (!draft) return;
    setSavingId(action.id);
    try {
      await adminApi.updateCustomerRecoveryAction(action.id, {
        status: forceDone ? 'DONE' : draft.status,
        outcome: draft.outcome.trim() || (forceDone ? 'Tamamlandi' : null),
        followUpDate: draft.followUpDate || null,
      });
      await loadActions(page);
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Aksiyon guncellenemedi.'));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.heroTop}>
            <View style={styles.heroText}>
              <Text style={styles.kicker}>Aksiyon Takibi</Text>
              <Text style={styles.title}>Geri Kazanim Aksiyonlari</Text>
              <Text style={styles.subtitle}>Size atanan kaybedilen veya hareketi dusen cari takiplerini kapatin.</Text>
            </View>
            <TouchableOpacity style={[styles.refreshButton, loading && styles.buttonDisabled]} onPress={() => loadActions(page)} disabled={loading}>
              <Text style={styles.refreshText}>{loading ? 'Yukleniyor' : 'Yenile'}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Gorunen</Text>
              <Text style={styles.heroStatValue}>{actions.length}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Geciken/Bugun</Text>
              <Text style={styles.heroStatValue}>{actions.filter((item) => ['overdue', 'today'].includes(dueTone(item.followUpDate))).length}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Sayfa</Text>
              <Text style={styles.heroStatValue}>{page}/{pagination.totalPages || 1}</Text>
            </View>
          </View>
        </View>

        <View style={styles.filterCard}>
          <TextInput
            style={styles.input}
            value={search}
            onChangeText={setSearch}
            placeholder="Cari kodu, unvan veya not ara"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            onSubmitEditing={runSearch}
          />
          <View style={styles.segment}>
            {statusOptions.map((option) => (
              <TouchableOpacity key={option.value} style={[styles.segmentButton, status === option.value && styles.segmentButtonActive]} onPress={() => setStatus(option.value)}>
                <Text style={status === option.value ? styles.segmentTextActive : styles.segmentText}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={[styles.dueToggle, dueOnly && styles.dueToggleOn]} onPress={() => setDueOnly((prev) => !prev)}>
            <Text style={dueOnly ? styles.dueToggleTextOn : styles.dueToggleText}>Vadesi gelen takipler</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.primaryButton, loading && styles.buttonDisabled]} onPress={runSearch} disabled={loading}>
            <Text style={styles.primaryButtonText}>{loading ? 'Yukleniyor' : 'Filtrele'}</Text>
          </TouchableOpacity>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}
        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
        ) : actions.length === 0 ? (
          <Text style={styles.emptyText}>Aksiyon bulunamadi.</Text>
        ) : (
          <View style={[styles.cardGrid, isWide && styles.cardGridWide]}>
            {actions.map((action) => {
            const draft = drafts[action.id] || { status: action.status || 'OPEN', outcome: action.outcome || '', followUpDate: toDateInput(action.followUpDate) };
            const saving = savingId === action.id;
            const followTone = dueTone(action.followUpDate);
            return (
              <View
                key={action.id}
                style={[
                  styles.card,
                  isWide && styles.cardGridItem,
                  followTone === 'overdue' && styles.cardOverdue,
                  followTone === 'today' && styles.cardToday,
                ]}
              >
                <View style={styles.cardTop}>
                  <View style={styles.flexText}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{action.customerName || action.customerCode}</Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>{action.customerCode} - {action.actionType}</Text>
                  </View>
                  <Text style={[styles.priorityPill, action.priority === 'HIGH' && styles.priorityHigh]}>{action.priority || '-'}</Text>
                </View>
                {followTone !== 'none' && (
                  <Text style={[styles.followPill, followTone === 'overdue' && styles.followOverdue, followTone === 'today' && styles.followToday]}>
                    {followTone === 'overdue' ? 'Takip gecikti' : followTone === 'today' ? 'Bugun takip' : `Takip: ${safeDate(action.followUpDate)}`}
                  </Text>
                )}
                <Text style={styles.note} numberOfLines={4}>{action.note}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>Durum: {action.status} - Takip: {safeDate(action.followUpDate)} - Olusturma: {safeDate(action.createdAt)}</Text>

                <View style={styles.segment}>
                  {['OPEN', 'IN_PROGRESS', 'DONE'].map((value) => (
                    <TouchableOpacity key={value} style={[styles.segmentButton, draft.status === value && styles.segmentButtonActive]} onPress={() => updateDraft(action.id, { status: value })}>
                      <Text style={draft.status === value ? styles.segmentTextActive : styles.segmentText}>{value}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={[styles.input, styles.multiline]}
                  value={draft.outcome}
                  onChangeText={(value) => updateDraft(action.id, { outcome: value })}
                  placeholder="Sonuc / not"
                  placeholderTextColor={colors.textMuted}
                  multiline
                />
                <View style={styles.quickRow}>
                  {outcomeTemplates.map((template) => (
                    <TouchableOpacity key={template} style={styles.quickChip} onPress={() => updateDraft(action.id, { outcome: template })}>
                      <Text style={styles.quickChipText}>{template}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.input}
                  value={draft.followUpDate}
                  onChangeText={(value) => updateDraft(action.id, { followUpDate: value })}
                  placeholder="Sonraki takip YYYY-MM-DD"
                  placeholderTextColor={colors.textMuted}
                />
                <View style={styles.quickRow}>
                  {followUpShortcuts.map((shortcut) => (
                    <TouchableOpacity key={shortcut.label} style={styles.quickChip} onPress={() => updateDraft(action.id, { followUpDate: addDaysInput(shortcut.days) })}>
                      <Text style={styles.quickChipText}>{shortcut.label}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={styles.quickChip} onPress={() => updateDraft(action.id, { followUpDate: '' })}>
                    <Text style={styles.quickChipText}>Tarih yok</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity style={[styles.smallButton, saving && styles.buttonDisabled]} onPress={() => saveAction(action)} disabled={saving}>
                    <Text style={styles.smallButtonText}>{saving ? 'Kaydediliyor' : 'Kaydet'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.doneButton, saving && styles.buttonDisabled]} onPress={() => saveAction(action, true)} disabled={saving}>
                    <Text style={styles.doneButtonText}>Tamamla</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
            })}
          </View>
        )}

        {pagination.totalPages > 1 && (
          <View style={styles.pagination}>
            <TouchableOpacity style={styles.pageButton} onPress={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page <= 1}>
              <Text style={styles.pageButtonText}>Onceki</Text>
            </TouchableOpacity>
            <Text style={styles.pageText}>{page}/{pagination.totalPages}</Text>
            <TouchableOpacity style={styles.pageButton} onPress={() => setPage((prev) => Math.min(pagination.totalPages, prev + 1))} disabled={page >= pagination.totalPages}>
              <Text style={styles.pageButtonText}>Sonraki</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { paddingVertical: spacing.xs, gap: spacing.md },
  heroTop: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.lg, alignItems: 'flex-start' },
  heroText: { flex: 1, minWidth: 240, gap: spacing.xs },
  kicker: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: '#93C5FD', textTransform: 'uppercase' },
  title: { fontFamily: fonts.bold, fontSize: fontSizes.xxl, color: '#FFFFFF' },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSizes.md, color: '#DDE8FF', lineHeight: 22 },
  refreshButton: { alignSelf: 'flex-start', backgroundColor: colors.primarySoft, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  refreshText: { fontFamily: fonts.bold, color: '#FFFFFF' },
  heroStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  heroStat: { flex: 1, minWidth: 118, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', borderRadius: radius.lg, padding: spacing.md, backgroundColor: 'rgba(255,255,255,0.08)' },
  heroStatLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: '#BCD2F7' },
  heroStatValue: { fontFamily: fonts.bold, fontSize: fontSizes.xl, color: '#FFFFFF', marginTop: spacing.xs },
  filterCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border, fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.text },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  segment: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  segmentButton: { flexGrow: 1, alignItems: 'center', borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  segmentButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.textMuted },
  segmentTextActive: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: '#FFFFFF' },
  dueToggle: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: 'center', paddingVertical: spacing.sm, backgroundColor: colors.surface },
  dueToggleOn: { backgroundColor: colors.warningSoft, borderColor: '#FBBF24' },
  dueToggleText: { fontFamily: fonts.semibold, color: colors.textMuted },
  dueToggleTextOn: { fontFamily: fonts.semibold, color: colors.warning },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radius.md, alignItems: 'center', paddingVertical: spacing.sm },
  primaryButtonText: { fontFamily: fonts.bold, color: '#FFFFFF' },
  loading: { alignItems: 'center', padding: spacing.xl },
  error: { fontFamily: fonts.medium, color: colors.danger },
  emptyText: { fontFamily: fonts.regular, color: colors.textMuted },
  cardGrid: { gap: spacing.md },
  cardGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  cardGridItem: { width: '48%', minWidth: 360 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  cardOverdue: { borderColor: '#FCA5A5', backgroundColor: colors.dangerSoft },
  cardToday: { borderColor: '#FBBF24', backgroundColor: colors.warningSoft },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flexText: { flex: 1, minWidth: 0 },
  cardTitle: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: colors.text },
  cardMeta: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  priorityPill: { overflow: 'hidden', borderRadius: 999, backgroundColor: colors.primaryMuted, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, fontFamily: fonts.bold, fontSize: fontSizes.xs, color: colors.primarySoft },
  priorityHigh: { backgroundColor: colors.dangerSoft, color: colors.danger },
  followPill: { alignSelf: 'flex-start', overflow: 'hidden', borderRadius: 999, backgroundColor: colors.primaryMuted, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, fontFamily: fonts.bold, fontSize: fontSizes.xs, color: colors.primarySoft },
  followOverdue: { backgroundColor: colors.dangerSoft, color: colors.danger },
  followToday: { backgroundColor: colors.warningSoft, color: colors.warning },
  note: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.text, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.sm },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  quickChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  quickChipText: { fontFamily: fonts.semibold, color: colors.textMuted, fontSize: fontSizes.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  smallButton: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: 'center', paddingVertical: spacing.sm, backgroundColor: colors.surface },
  smallButtonText: { fontFamily: fonts.semibold, color: colors.text },
  doneButton: { flex: 1, backgroundColor: '#047857', borderRadius: radius.md, alignItems: 'center', paddingVertical: spacing.sm },
  doneButtonText: { fontFamily: fonts.bold, color: '#FFFFFF' },
  buttonDisabled: { opacity: 0.6 },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  pageButton: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  pageButtonText: { fontFamily: fonts.semibold, color: colors.text },
  pageText: { fontFamily: fonts.semibold, color: colors.textMuted },
});
