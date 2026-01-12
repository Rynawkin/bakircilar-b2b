import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { customerApi } from '../api/customer';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Task } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

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

export function CustomerTasksScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
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
    setLoading(true);
    setError(null);
    try {
      const params: any = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const response = await customerApi.getTasks(params);
      setTasks(response.tasks || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Talepler yuklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPreferences();
    fetchTasks();
  }, []);

  const handleCreate = async () => {
    if (!title.trim()) return;
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
    } finally {
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

  const groupedTasks = useMemo(() => {
    const grouped: Record<string, Task[]> = {};
    STATUS_ORDER.forEach((status) => {
      grouped[status] = [];
    });
    tasks.forEach((task) => {
      const status = normalizeStatus(task.status || 'NEW');
      if (!grouped[status]) grouped[status] = [];
      grouped[status].push(task);
    });
    return grouped;
  }, [tasks]);

  const renderTask = (task: Task) => (
    <TouchableOpacity
      style={styles.taskCard}
      onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}
    >
      <Text style={styles.taskTitle}>{task.title}</Text>
      <Text style={styles.taskMeta}>
        Durum: {STATUS_LABELS[normalizeStatus(task.status)] || normalizeStatus(task.status)}
      </Text>
      <Text style={styles.taskMeta}>Oncelik: {PRIORITY_LABELS[task.priority || 'NONE']}</Text>
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
          data={view === 'LIST' ? tasks : []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.title}>Taleplerim</Text>
              <Text style={styles.subtitle}>Musteri talepleri ve takip.</Text>

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
                <View style={styles.filterRow}>
                  <TextInput
                    style={styles.input}
                    placeholder="Tip (OTHER, ORDER...)"
                    placeholderTextColor={colors.textMuted}
                    value={type}
                    onChangeText={setType}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Oncelik (NONE, LOW...)"
                    placeholderTextColor={colors.textMuted}
                    value={priority}
                    onChangeText={setPriority}
                  />
                </View>
                <TouchableOpacity style={styles.primaryButton} onPress={handleCreate}>
                  <Text style={styles.primaryButtonText}>{creating ? 'Gonderiliyor...' : 'Talep Gonder'}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.filterRow}>
                <TextInput
                  style={styles.input}
                  placeholder="Arama"
                  placeholderTextColor={colors.textMuted}
                  value={search}
                  onChangeText={setSearch}
                  onSubmitEditing={fetchTasks}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Durum kodu"
                  placeholderTextColor={colors.textMuted}
                  value={statusFilter}
                  onChangeText={setStatusFilter}
                  onSubmitEditing={fetchTasks}
                />
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
                  <View key={status} style={styles.kanbanColumn}>
                    <Text style={styles.columnTitle}>{STATUS_LABELS[status] || status}</Text>
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
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  segmentButton: {
    flex: 1,
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
    gap: spacing.sm,
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
  taskMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  kanbanWrap: {
    gap: spacing.md,
  },
  kanbanColumn: {
    gap: spacing.sm,
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
