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
import { Task, TaskStatus } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

const STATUS_ORDER: TaskStatus[] = ['NEW', 'IN_PROGRESS', 'DONE', 'CANCELLED'];

const normalizeStatus = (status: TaskStatus) => (status === 'WAITING' ? 'IN_PROGRESS' : status);

export function TasksScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'LIST' | 'KANBAN'>('KANBAN');
  const [search, setSearch] = useState('');

  const fetchTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getTasks(search ? { search } : undefined);
      setTasks(response.tasks || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Talepler yuklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<TaskStatus, Task[]>();
    STATUS_ORDER.forEach((status) => map.set(status, []));
    tasks.forEach((task) => {
      const rawStatus = task.status as TaskStatus;
      const normalized = normalizeStatus(rawStatus);
      const status = STATUS_ORDER.includes(normalized) ? normalized : 'NEW';
      map.get(status)?.push(task);
    });
    return map;
  }, [tasks]);

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Talepler</Text>
            <Text style={styles.subtitle}>Kanban ve liste gorunumu.</Text>
            {error && <Text style={styles.error}>{error}</Text>}
            <TextInput
              style={styles.search}
              placeholder="Ara..."
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={fetchTasks}
              returnKeyType="search"
            />
            <View style={styles.segment}>
              {(['KANBAN', 'LIST'] as const).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.segmentButton, view === mode && styles.segmentButtonActive]}
                  onPress={() => setView(mode)}
                >
                  <Text style={view === mode ? styles.segmentTextActive : styles.segmentText}>
                    {mode === 'KANBAN' ? 'Kanban' : 'Liste'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('TaskCreate')}>
                <Text style={styles.primaryButtonText}>Yeni Talep</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={fetchTasks}>
                <Text style={styles.secondaryButtonText}>Yenile</Text>
              </TouchableOpacity>
            </View>
          </View>

          {view === 'LIST' ? (
            <View style={styles.listBlock}>
              {tasks.map((task) => (
                <TouchableOpacity
                  key={task.id}
                  style={styles.card}
                  onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}
                >
                  <Text style={styles.cardTitle}>{task.title}</Text>
                  <Text style={styles.cardMeta}>Durum: {normalizeStatus(task.status as TaskStatus)}</Text>
                  {task.priority && <Text style={styles.cardMeta}>Oncelik: {task.priority}</Text>}
                  {task.customer?.name && <Text style={styles.cardMeta}>Cari: {task.customer.name}</Text>}
                </TouchableOpacity>
              ))}
              {tasks.length === 0 && <Text style={styles.emptyText}>Kayit yok.</Text>}
            </View>
          ) : (
            <View style={styles.kanbanGrid}>
              {STATUS_ORDER.map((status) => (
                <View key={status} style={styles.kanbanColumn}>
                  <Text style={styles.kanbanTitle}>{status}</Text>
                  {(grouped.get(status) || []).map((task) => (
                    <TouchableOpacity
                      key={task.id}
                      style={styles.kanbanCard}
                      onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}
                    >
                      <Text style={styles.cardTitle}>{task.title}</Text>
                      {task.customer?.name && <Text style={styles.cardMeta}>{task.customer.name}</Text>}
                    </TouchableOpacity>
                  ))}
                  {(grouped.get(status) || []).length === 0 && (
                    <Text style={styles.emptyText}>Kayit yok.</Text>
                  )}
                </View>
              ))}
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
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
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
  segmentButtonActive: {
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
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
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
    paddingHorizontal: spacing.md,
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  listBlock: {
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
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
    marginTop: spacing.xs,
  },
  kanbanGrid: {
    gap: spacing.md,
  },
  kanbanColumn: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  kanbanTitle: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  kanbanCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
});
