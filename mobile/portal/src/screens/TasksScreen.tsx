import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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

import { adminApi } from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { Task, TaskStatus } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
import { normalizeSearchText } from '../utils/search';

const STATUS_ORDER: TaskStatus[] = ['NEW', 'IN_PROGRESS', 'DONE', 'CANCELLED'];

const normalizeStatus = (status: TaskStatus) => (status === 'WAITING' ? 'IN_PROGRESS' : status);

export function TasksScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const { width } = useWindowDimensions();
  const isTablet = width >= 820;
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
      setError(getApiErrorMessage(err, 'Talepler yuklenemedi.'));
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
    const term = normalizeSearchText(search);
    tasks
      .filter((task) => {
        if (!term) return true;
        return normalizeSearchText(
          `${task.title || ''} ${task.description || ''} ${task.customer?.name || ''} ${task.customer?.mikroCariCode || ''} ${task.priority || ''} ${task.status || ''}`
        ).includes(term);
      })
      .forEach((task) => {
      const rawStatus = task.status as TaskStatus;
      const normalized = normalizeStatus(rawStatus);
      const status = STATUS_ORDER.includes(normalized) ? normalized : 'NEW';
      map.get(status)?.push(task);
    });
    return map;
  }, [search, tasks]);

  const visibleTasks = useMemo(() => Array.from(grouped.values()).flat(), [grouped]);
  const statusCounts = useMemo(() => {
    const counts = STATUS_ORDER.reduce<Record<TaskStatus, number>>((acc, status) => {
      acc[status] = grouped.get(status)?.length || 0;
      return acc;
    }, {} as Record<TaskStatus, number>);
    return counts;
  }, [grouped]);

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.listContent, isTablet && styles.listContentTablet]}>
          <View style={styles.header}>
            <Text style={styles.kicker}>Talep Merkezi</Text>
            <Text style={styles.title}>Talepler</Text>
            <Text style={styles.subtitle}>Personel, cari ve operasyon isteklerini tek mobil panelde takip edin.</Text>
            <View style={styles.metricRow}>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{visibleTasks.length}</Text>
                <Text style={styles.metricLabel}>Gorunen</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{statusCounts.NEW || 0}</Text>
                <Text style={styles.metricLabel}>Yeni</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{statusCounts.IN_PROGRESS || 0}</Text>
                <Text style={styles.metricLabel}>Devam</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{statusCounts.DONE || 0}</Text>
                <Text style={styles.metricLabel}>Biten</Text>
              </View>
            </View>
            {error && <Text style={styles.error}>{error}</Text>}
          </View>

          <View style={styles.controlCard}>
            <TextInput
              style={styles.search}
              placeholder="Baslik, cari, oncelik veya durum ara..."
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
            <Text style={styles.resultText}>{visibleTasks.length} / {tasks.length} talep gosteriliyor</Text>
          </View>

          {view === 'LIST' ? (
            <View style={styles.listBlock}>
              {visibleTasks.map((task) => (
                <TouchableOpacity
                  key={task.id}
                  style={styles.card}
                  onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}
                >
                  <Text style={styles.cardTitle} numberOfLines={2} ellipsizeMode="tail">{task.title}</Text>
                  <Text style={styles.cardMeta}>Durum: {normalizeStatus(task.status as TaskStatus)}</Text>
                  {task.priority && <Text style={styles.cardMeta}>Oncelik: {task.priority}</Text>}
                  {task.customer?.name && <Text style={styles.cardMeta} numberOfLines={1} ellipsizeMode="tail">Cari: {task.customer.name}</Text>}
                </TouchableOpacity>
              ))}
              {visibleTasks.length === 0 && <Text style={styles.emptyText}>Kayit yok.</Text>}
            </View>
          ) : (
            <View style={[styles.kanbanGrid, isTablet && styles.kanbanGridTablet]}>
              {STATUS_ORDER.map((status) => (
                <View key={status} style={[styles.kanbanColumn, isTablet && styles.kanbanColumnTablet]}>
                  <View style={styles.kanbanHeader}>
                    <Text style={styles.kanbanTitle}>{status}</Text>
                    <Text style={styles.kanbanCount}>{grouped.get(status)?.length || 0}</Text>
                  </View>
                  {(grouped.get(status) || []).map((task) => (
                    <TouchableOpacity
                      key={task.id}
                      style={styles.kanbanCard}
                      onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}
                    >
                      <Text style={styles.cardTitle} numberOfLines={2} ellipsizeMode="tail">{task.title}</Text>
                      {task.customer?.name && <Text style={styles.cardMeta} numberOfLines={1} ellipsizeMode="tail">{task.customer.name}</Text>}
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
  listContentTablet: {
    maxWidth: 1180,
    alignSelf: 'center',
    width: '100%',
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
    lineHeight: fontSizes.sm + 6,
  },
  metricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metric: {
    minWidth: 86,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  metricValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.lg,
    color: '#FFFFFF',
  },
  metricLabel: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFD7FF',
  },
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
  },
  controlCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
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
    flexGrow: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
  },
  secondaryButton: {
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  listBlock: {
    gap: spacing.md,
  },
  resultText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
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
    lineHeight: fontSizes.md + 5,
    color: colors.text,
    flexShrink: 1,
    minWidth: 0,
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
  kanbanGridTablet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  kanbanColumn: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  kanbanColumnTablet: {
    flexBasis: '48%',
    flexGrow: 1,
  },
  kanbanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  kanbanTitle: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  kanbanCount: {
    minWidth: 28,
    textAlign: 'center',
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    fontFamily: fonts.bold,
    fontSize: fontSizes.xs,
    color: colors.primarySoft,
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
