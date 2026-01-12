import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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

import { adminApi } from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { StaffMember, VadeAssignment, VadeBalance, VadeNote } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

type VadeView = 'balances' | 'notes' | 'assignments' | 'import' | 'calendar';

export function VadeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const [view, setView] = useState<VadeView>('balances');
  const [balances, setBalances] = useState<VadeBalance[]>([]);
  const [summary, setSummary] = useState<{ overdue: number; upcoming: number; total: number } | null>(null);
  const [notes, setNotes] = useState<VadeNote[]>([]);
  const [assignments, setAssignments] = useState<VadeAssignment[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [assignStaffId, setAssignStaffId] = useState('');
  const [assignCustomerIds, setAssignCustomerIds] = useState('');

  const [importCariCode, setImportCariCode] = useState('');
  const [importPastDue, setImportPastDue] = useState('');
  const [importNotDue, setImportNotDue] = useState('');

  const fetchBalances = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getVadeBalances(search ? { search } : undefined);
      setBalances(response.balances || []);
      setSummary(response.summary || null);
    } finally {
      setLoading(false);
    }
  };

  const fetchNotes = async (reminderOnly = false) => {
    setLoading(true);
    try {
      const response = await adminApi.getVadeNotes(reminderOnly ? { reminderOnly: true } : undefined);
      setNotes(response.notes || []);
    } finally {
      setLoading(false);
    }
  };

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getVadeAssignments();
      setAssignments(response.assignments || []);
    } finally {
      setLoading(false);
    }
  };

  const fetchStaff = async () => {
    try {
      const response = await adminApi.getStaffMembers();
      setStaff(response.staff || []);
    } catch (err) {
      setStaff([]);
    }
  };

  useEffect(() => {
    fetchBalances();
    fetchStaff();
  }, []);

  useEffect(() => {
    if (view === 'balances') {
      fetchBalances();
    } else if (view === 'notes') {
      fetchNotes(false);
    } else if (view === 'calendar') {
      fetchNotes(true);
    } else if (view === 'assignments') {
      fetchAssignments();
    }
  }, [view]);

  const assignCustomers = async () => {
    if (!assignStaffId.trim() || !assignCustomerIds.trim()) {
      return;
    }
    const ids = assignCustomerIds.split(',').map((id) => id.trim()).filter(Boolean);
    if (!ids.length) return;
    try {
      await adminApi.assignVadeCustomers({ staffId: assignStaffId.trim(), customerIds: ids });
      setAssignCustomerIds('');
      await fetchAssignments();
    } catch (err) {
      // ignore
    }
  };

  const importBalance = async () => {
    if (!importCariCode.trim()) return;
    try {
      await adminApi.importVadeBalances([
        {
          mikroCariCode: importCariCode.trim(),
          pastDueBalance: importPastDue ? Number(importPastDue) : undefined,
          notDueBalance: importNotDue ? Number(importNotDue) : undefined,
        },
      ]);
      setImportCariCode('');
      setImportPastDue('');
      setImportNotDue('');
    } catch (err) {
      // ignore
    }
  };

  const staffOptions = useMemo(() => staff, [staff]);

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Vade Takip</Text>
            <Text style={styles.subtitle}>Bakiye, not ve atama takibi.</Text>
            <View style={styles.segment}>
              {([
                { key: 'balances', label: 'Bakiyeler' },
                { key: 'notes', label: 'Notlar' },
                { key: 'assignments', label: 'Atamalar' },
                { key: 'import', label: 'Import' },
                { key: 'calendar', label: 'Takvim' },
              ] as const).map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.segmentButton, view === item.key && styles.segmentButtonActive]}
                  onPress={() => setView(item.key)}
                >
                  <Text style={view === item.key ? styles.segmentTextActive : styles.segmentText}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {view === 'balances' && (
            <>
              <TextInput
                style={styles.search}
                placeholder="Cari ara..."
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
                onSubmitEditing={fetchBalances}
                returnKeyType="search"
              />
              {summary && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryText}>Geciken: {summary.overdue.toFixed(2)} TL</Text>
                  <Text style={styles.summaryText}>Toplam: {summary.total.toFixed(2)} TL</Text>
                </View>
              )}
              {balances.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.card}
                  onPress={() => navigation.navigate('VadeCustomer', { customerId: item.user.id })}
                >
                  <Text style={styles.cardTitle}>{item.user?.name || 'Cari'}</Text>
                  <Text style={styles.cardMeta}>Kod: {item.user?.mikroCariCode || '-'}</Text>
                  <Text style={styles.cardMeta}>Toplam: {item.totalBalance?.toFixed(2)} TL</Text>
                  <Text style={styles.cardMeta}>Geciken: {item.pastDueBalance?.toFixed(2)} TL</Text>
                </TouchableOpacity>
              ))}
            </>
          )}

          {view === 'notes' && (
            <>
              {notes.map((note) => (
                <View key={note.id} style={styles.card}>
                  <Text style={styles.cardTitle}>{note.noteContent}</Text>
                  <Text style={styles.cardMeta}>Cari: {note.customerId}</Text>
                  <Text style={styles.cardMeta}>Tarih: {note.createdAt?.slice?.(0, 10) || '-'}</Text>
                </View>
              ))}
              {notes.length === 0 && <Text style={styles.emptyText}>Not yok.</Text>}
            </>
          )}

          {view === 'calendar' && (
            <>
              {notes.map((note) => (
                <View key={note.id} style={styles.card}>
                  <Text style={styles.cardTitle}>{note.noteContent}</Text>
                  <Text style={styles.cardMeta}>Hatirlatma: {note.reminderDate?.slice?.(0, 10) || '-'}</Text>
                </View>
              ))}
              {notes.length === 0 && <Text style={styles.emptyText}>Takvim kaydi yok.</Text>}
            </>
          )}

          {view === 'assignments' && (
            <>
              {assignments.map((assignment) => (
                <View key={assignment.id} style={styles.card}>
                  <Text style={styles.cardTitle}>{assignment.customer?.name || assignment.customerId}</Text>
                  <Text style={styles.cardMeta}>Personel: {assignment.staff?.name || assignment.staffId}</Text>
                </View>
              ))}
              {assignments.length === 0 && <Text style={styles.emptyText}>Atama yok.</Text>}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Atama Yap</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Personel ID"
                  placeholderTextColor={colors.textMuted}
                  value={assignStaffId}
                  onChangeText={setAssignStaffId}
                />
                <Text style={styles.helper}>Personel listesi: {staffOptions.map((item) => item.id).join(', ')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Cari ID (virgul)"
                  placeholderTextColor={colors.textMuted}
                  value={assignCustomerIds}
                  onChangeText={setAssignCustomerIds}
                />
                <TouchableOpacity style={styles.secondaryButton} onPress={assignCustomers}>
                  <Text style={styles.secondaryButtonText}>Ata</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {view === 'import' && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Import</Text>
              <TextInput
                style={styles.input}
                placeholder="Cari kod"
                placeholderTextColor={colors.textMuted}
                value={importCariCode}
                onChangeText={setImportCariCode}
              />
              <TextInput
                style={styles.input}
                placeholder="Geciken bakiye"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                value={importPastDue}
                onChangeText={setImportPastDue}
              />
              <TextInput
                style={styles.input}
                placeholder="Gelecek bakiye"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                value={importNotDue}
                onChangeText={setImportNotDue}
              />
              <TouchableOpacity style={styles.secondaryButton} onPress={importBalance}>
                <Text style={styles.secondaryButtonText}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
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
    fontSize: fontSizes.md,
    color: colors.textMuted,
  },
  segment: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  segmentButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  segmentButtonActive: {
    backgroundColor: colors.primary,
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
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  helper: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  emptyText: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
  },
});
