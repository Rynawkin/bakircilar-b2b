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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { customerApi } from '../api/customer';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Task } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
import { includesSearch } from '../utils/search';

type TaskView = 'KANBAN' | 'LIST';

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Yeni',
  TRIAGE: 'Inceleme',
  IN_PROGRESS: 'Islemde',
  REVIEW: 'Kontrol',
  DONE: 'Tamamlandi',
  CANCELLED: 'Iptal',
};

const STATUS_ORDER = ['NEW', 'TRIAGE', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED'];

const normalizeStatus = (status: string) => (status === 'WAITING' ? 'IN_PROGRESS' : status);

const PRIORITY_LABELS: Record<string, string> = {
  NONE: 'Normal',
  LOW: 'Dusuk',
  MEDIUM: 'Orta',
  HIGH: 'Yuksek',
  URGENT: 'Acil',
};

const TYPE_LABELS: Record<string, string> = {
  OTHER: 'Diger',
  PAYMENT: 'Odeme',
  DELIVERY: 'Teslimat',
  PRICE: 'Fiyat',
  PRODUCT: 'Urun',
  ORDER: 'Siparis',
  INVOICE: 'Fatura',
};

const TYPE_OPTIONS = Object.keys(TYPE_LABELS);
const PRIORITY_OPTIONS = Object.keys(PRIORITY_LABELS);

export function CustomerTasksScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width } = useWindowDimensions();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<TaskView>('LIST');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('OTHER');
  const [priority, setPriority] = useState('NONE');
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const tasksSeqRef = useRef(0);
  const isWide = width >= 820;

  const fetchPreferences = async () => {
    try {
      const { preferences } = await customerApi.getTaskPreferences();
      if (preferences?.defaultView) {
        setView(preferences.defaultView);
      }
    } catch {
      // ignore
    }
  };

  const fetchTasks = async () => {
    const requestSeq = ++tasksSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const params: any = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const response = await customerApi.getTasks(params);
      if (requestSeq !== tasksSeqRef.current) return;
      setTasks(response.tasks || []);
    } catch (err: any) {
      if (requestSeq !== tasksSeqRef.current) return;
      setError(getApiErrorMessage(err, 'Talepler yuklenemedi.'));
    } finally {
      if (requestSeq === tasksSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchPreferences();
    fetchTasks();
  }, []);

  const handleCreate = async () => {
    if (!title.trim() || creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      await customerApi.createTask({
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        priority,
      });
      setTitle('');
      setDescription('');
      setType('OTHER');
      setPriority('NONE');
      await fetchTasks();
    } catch (err: any) {
      Alert.alert('Talep gonderilemedi', getApiErrorMessage(err, 'Talep gonderilemedi.'));
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  const handleViewChange = async (next: TaskView) => {
    setView(next);
    try {
      await customerApi.updateTaskPreferences({ defaultView: next });
    } catch {
      // ignore
    }
  };

  const visibleTasks = useMemo(() => {
    return tasks.filter((task) => {
      const normalized = normalizeStatus(task.status || 'NEW');
      const matchesStatus = !statusFilter || normalized === statusFilter;
      const haystack = [
        task.title,
        task.type,
        task.priority,
        STATUS_LABELS[normalized],
        task.customer?.name,
        task.customer?.mikroCariCode,
        task.assignedTo?.name,
      ].join(' ');
      return matchesStatus && includesSearch(haystack, search);
    });
  }, [tasks, search, statusFilter]);

  const summary = useMemo(() => {
    const open = visibleTasks.filter((task) => !['DONE', 'CANCELLED'].includes(normalizeStatus(task.status || 'NEW'))).length;
    const urgent = visibleTasks.filter((task) => ['HIGH', 'URGENT'].includes(task.priority || '')).length;
    return {
      total: tasks.length,
      filtered: visibleTasks.length,
      open,
      urgent,
    };
  }, [tasks.length, visibleTasks]);

  const groupedTasks = useMemo(() => {
    const grouped: Record<string, Task[]> = {};
    STATUS_ORDER.forEach((status) => {
      grouped[status] = [];
    });
    visibleTasks.forEach((task) => {
      const status = normalizeStatus(task.status || 'NEW');
      if (!grouped[status]) grouped[status] = [];
      grouped[status].push(task);
    });
    return grouped;
  }, [visibleTasks]);

  const renderTask = (task: Task) => (
    <TouchableOpacity
      style={styles.taskCard}
      onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}
    >
      <Text style={styles.taskTitle}>{task.title}</Text>
      <View style={styles.taskBadgeRow}>
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>{STATUS_LABELS[normalizeStatus(task.status)] || normalizeStatus(task.status)}</Text>
        </View>
        <View style={[styles.priorityPill, ['HIGH', 'URGENT'].includes(task.priority || '') && styles.priorityHigh]}>
          <Text style={[styles.priorityPillText, ['HIGH', 'URGENT'].includes(task.priority || '') && styles.priorityHighText]}>
            {PRIORITY_LABELS[task.priority || 'NONE']}
          </Text>
        </View>
      </View>
      <Text style={styles.taskMeta}>
        Tip: {TYPE_LABELS[task.type || 'OTHER'] || task.type || 'Diger'}
      </Text>
      {task.assignedTo?.name && <Text style={styles.taskMeta}>Atanan: {task.assignedTo.name}</Text>}
      {task.createdAt && <Text style={styles.taskMeta}>Tarih: {task.createdAt.slice(0, 10)}</Text>}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          key={isWide && view === 'LIST' ? 'tasks-wide' : 'tasks-phone'}
          data={view === 'LIST' ? visibleTasks : []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          numColumns={isWide && view === 'LIST' ? 2 : 1}
          columnWrapperStyle={isWide && view === 'LIST' ? styles.columnWrapper : undefined}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.hero}>
                <Text style={styles.heroKicker}>Musteri Destek</Text>
                <Text style={styles.heroTitle}>Taleplerim</Text>
                <Text style={styles.heroSubtitle}>Siparis, teslimat, fiyat ve urun taleplerini tek listede takip edin.</Text>
                <View style={styles.heroMetricRow}>
                  <View style={styles.heroMetric}>
                    <Text style={styles.heroMetricValue}>{summary.total}</Text>
                    <Text style={styles.heroMetricLabel}>Toplam</Text>
                  </View>
                  <View style={styles.heroMetric}>
                    <Text style={styles.heroMetricValue}>{summary.open}</Text>
                    <Text style={styles.heroMetricLabel}>Acik</Text>
                  </View>
                  <View style={styles.heroMetric}>
                    <Text style={summary.urgent > 0 ? styles.heroMetricDanger : styles.heroMetricValue}>{summary.urgent}</Text>
                    <Text style={styles.heroMetricLabel}>Yuksek</Text>
                  </View>
                </View>
              </View>

              <View style={styles.summaryGrid}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Toplam</Text>
                  <Text style={styles.summaryValue}>{summary.total}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Filtre</Text>
                  <Text style={styles.summaryValue}>{summary.filtered}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Acik</Text>
                  <Text style={styles.summaryValue}>{summary.open}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Yuksek</Text>
                  <Text style={styles.summaryValue}>{summary.urgent}</Text>
                </View>
              </View>

              <View style={styles.segment}>
                {(['KANBAN', 'LIST'] as TaskView[]).map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[styles.segmentButton, view === option && styles.segmentActive]}
                    onPress={() => handleViewChange(option)}
                  >
                    <Text
                      style={view === option ? styles.segmentTextActive : styles.segmentText}
                    >
                      {option === 'KANBAN' ? 'Kanban' : 'Liste'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.formCard}>
                <Text style={styles.sectionTitle}>Yeni Talep</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Baslik"
                  placeholderTextColor={colors.textMuted}
                  value={title}
                  onChangeText={setTitle}
                />
                <TextInput
                  style={[styles.input, styles.multiline]}
                  placeholder="Aciklama"
                  placeholderTextColor={colors.textMuted}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                />
                <View style={styles.choiceBlock}>
                  <Text style={styles.choiceLabel}>Talep Tipi</Text>
                  <View style={styles.statusFilterWrap}>
                    {TYPE_OPTIONS.map((option) => {
                      const selected = type === option;
                      return (
                        <TouchableOpacity
                          key={option}
                          style={[styles.filterChip, selected && styles.filterChipActive]}
                          onPress={() => setType(option)}
                        >
                          <Text style={selected ? styles.filterTextActive : styles.filterText}>
                            {TYPE_LABELS[option]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
                <View style={styles.choiceBlock}>
                  <Text style={styles.choiceLabel}>Oncelik</Text>
                  <View style={styles.statusFilterWrap}>
                    {PRIORITY_OPTIONS.map((option) => {
                      const selected = priority === option;
                      return (
                        <TouchableOpacity
                          key={option}
                          style={[styles.filterChip, selected && styles.filterChipActive, ['HIGH', 'URGENT'].includes(option) && !selected && styles.filterChipDangerHint]}
                          onPress={() => setPriority(option)}
                        >
                          <Text style={selected ? styles.filterTextActive : styles.filterText}>
                            {PRIORITY_LABELS[option]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
                <TouchableOpacity style={[styles.primaryButton, creating && styles.buttonDisabled]} onPress={handleCreate} disabled={creating}>
                  <Text style={styles.primaryButtonText}>{creating ? 'Gonderiliyor...' : 'Talep Gonder'}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.filterRow}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Baslik, tip, cari veya atanan kisi ara"
                  placeholderTextColor={colors.textMuted}
                  value={search}
                  onChangeText={setSearch}
                />
              </View>
              <View style={styles.statusFilterWrap}>
                <TouchableOpacity
                  style={[styles.filterChip, !statusFilter && styles.filterChipActive]}
                  onPress={() => setStatusFilter('')}
                >
                  <Text style={!statusFilter ? styles.filterTextActive : styles.filterText}>Tum</Text>
                </TouchableOpacity>
                {STATUS_ORDER.map((status) => (
                  <TouchableOpacity
                    key={status}
                    style={[styles.filterChip, statusFilter === status && styles.filterChipActive]}
                    onPress={() => setStatusFilter(status)}
                  >
                    <Text style={statusFilter === status ? styles.filterTextActive : styles.filterText}>
                      {STATUS_LABELS[status] || status}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.secondaryButton} onPress={fetchTasks}>
                <Text style={styles.secondaryButtonText}>Listeyi Yenile</Text>
              </TouchableOpacity>

              {error && <Text style={styles.error}>{error}</Text>}
            </View>
          }
          renderItem={({ item }) => renderTask(item)}
          ListEmptyComponent={
            view === 'KANBAN' ? (
              <View style={styles.kanbanWrap}>
                {STATUS_ORDER.map((status) => (
                  <View key={status} style={[styles.kanbanColumn, isWide && styles.kanbanColumnWide]}>
                    <Text style={styles.columnTitle}>{STATUS_LABELS[status] || status} ({(groupedTasks[status] || []).length})</Text>
                    {(groupedTasks[status] || []).map((task) => (
                      <View key={task.id} style={styles.taskCard}>
                        <Text style={styles.taskTitle}>{task.title}</Text>
                        <Text style={styles.taskMeta}>Oncelik: {PRIORITY_LABELS[task.priority || 'NONE']}</Text>
                        <TouchableOpacity
                          style={styles.linkButton}
                          onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}
                        >
                          <Text style={styles.linkButtonText}>Detay</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>Talep bulunamadi.</Text>
              </View>
            )
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
  heroMetricDanger: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: '#FCA5A5',
  },
  heroMetricLabel: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFD7FF',
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
    flex: 1,
    minWidth: 96,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  segmentTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: '#FFFFFF',
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  summaryCard: {
    flexGrow: 1,
    minWidth: 112,
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
  sectionTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  input: {
    flex: 1,
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
  multiline: {
    height: 80,
    textAlignVertical: 'top',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    minWidth: 180,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  statusFilterWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  choiceBlock: {
    gap: spacing.xs,
  },
  choiceLabel: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipDangerHint: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  filterText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  filterTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: '#FFFFFF',
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
  buttonDisabled: {
    opacity: 0.55,
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
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
  },
  taskCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  taskTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  taskBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  statusPill: {
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statusPillText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.primary,
  },
  priorityPill: {
    borderRadius: radius.sm,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  priorityHigh: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  priorityPillText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  priorityHighText: {
    color: colors.danger,
  },
  taskMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  kanbanWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  kanbanColumn: {
    width: '100%',
    gap: spacing.sm,
  },
  kanbanColumnWide: {
    width: '48%',
    flexGrow: 1,
  },
  columnTitle: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  linkButton: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  linkButtonText: {
    fontFamily: fonts.semibold,
    color: colors.primary,
  },
  empty: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
});
