import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';

import { customerApi } from '../api/customer';
import { RootStackParamList } from '../navigation/AppNavigator';
import { TaskDetail } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Yeni',
  TRIAGE: 'Inceleme',
  IN_PROGRESS: 'Islemde',
  REVIEW: 'Kontrol',
  DONE: 'Tamamlandi',
  CANCELLED: 'Iptal',
};

const normalizeStatus = (status: string) => (status === 'WAITING' ? 'IN_PROGRESS' : status);

const PRIORITY_LABELS: Record<string, string> = {
  NONE: 'Normal',
  LOW: 'Dusuk',
  MEDIUM: 'Orta',
  HIGH: 'Yuksek',
  URGENT: 'Acil',
};

type TaskDetailRoute = RouteProp<RootStackParamList, 'TaskDetail'>;

export function CustomerTaskDetailScreen() {
  const route = useRoute<TaskDetailRoute>();
  const { width } = useWindowDimensions();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const taskRequestSeqRef = useRef(0);

  const beginSaving = () => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    return true;
  };

  const endSaving = () => {
    savingRef.current = false;
    setSaving(false);
  };

  const fetchTask = async () => {
    const requestSeq = ++taskRequestSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const response = await customerApi.getTaskById(route.params.taskId);
      if (requestSeq !== taskRequestSeqRef.current) return;
      setTask(response.task);
    } catch (err: any) {
      if (requestSeq !== taskRequestSeqRef.current) return;
      setTask(null);
      setError(getApiErrorMessage(err, 'Talep yuklenemedi.'));
    } finally {
      if (requestSeq === taskRequestSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchTask();
  }, []);

  const addComment = async () => {
    if (!comment.trim() || !beginSaving()) return;
    try {
      await customerApi.addTaskComment(route.params.taskId, { body: comment.trim() });
      setComment('');
      await fetchTask();
    } catch (err: any) {
      Alert.alert('Yorum eklenemedi', getApiErrorMessage(err, 'Yorum eklenemedi.'));
    } finally {
      endSaving();
    }
  };

  const addAttachment = async () => {
    if (savingRef.current) return;
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled) return;

    const file = result.assets[0];
    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      name: file.name || 'attachment',
      type: file.mimeType || 'application/octet-stream',
    } as any);

    if (!beginSaving()) return;
    try {
      await customerApi.addTaskAttachment(route.params.taskId, formData);
      await fetchTask();
    } catch (err: any) {
      Alert.alert('Dosya yuklenemedi', getApiErrorMessage(err, 'Dosya yuklenemedi.'));
    } finally {
      endSaving();
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!task) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.emptyState}>
          <Text style={styles.errorTitle}>Talep acilamadi</Text>
          <Text style={styles.error}>{error || 'Talep yuklenemedi.'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchTask}>
            <Text style={styles.retryButtonText}>Tekrar dene</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isWide = width >= 820;
  const status = normalizeStatus(task.status || 'NEW');
  const isHighPriority = ['HIGH', 'URGENT'].includes(task.priority || '');
  const formatDate = (value?: string | null) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return date.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>Talep Detayi</Text>
          <Text style={styles.heroTitle} numberOfLines={3} ellipsizeMode="tail">{task.title}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>{STATUS_LABELS[status] || status}</Text>
            </View>
            <View style={[styles.priorityBadge, isHighPriority && styles.priorityBadgeHigh]}>
              <Text style={[styles.priorityBadgeText, isHighPriority && styles.priorityBadgeTextHigh]}>
                {PRIORITY_LABELS[task.priority || 'NONE']}
              </Text>
            </View>
          </View>
          <View style={styles.metaGrid}>
            <View style={styles.metaBox}>
              <Text style={styles.metaLabel}>Cari</Text>
              <Text style={styles.metaValue} numberOfLines={2} ellipsizeMode="tail">{task.customer?.name || '-'}</Text>
              {task.customer?.mikroCariCode ? <Text style={styles.metaSub} numberOfLines={1} ellipsizeMode="middle">{task.customer.mikroCariCode}</Text> : null}
            </View>
            <View style={styles.metaBox}>
              <Text style={styles.metaLabel}>Atanan</Text>
              <Text style={styles.metaValue} numberOfLines={2} ellipsizeMode="tail">{task.assignedTo?.name || '-'}</Text>
            </View>
            <View style={styles.metaBox}>
              <Text style={styles.metaLabel}>Olusturma</Text>
              <Text style={styles.metaValue} numberOfLines={2}>{formatDate(task.createdAt)}</Text>
            </View>
            <View style={styles.metaBox}>
              <Text style={styles.metaLabel}>Guncelleme</Text>
              <Text style={styles.metaValue} numberOfLines={2}>{formatDate(task.updatedAt)}</Text>
            </View>
          </View>
          {task.description ? <Text style={styles.heroBody} numberOfLines={5} ellipsizeMode="tail">{task.description}</Text> : null}
        </View>

        <View style={[styles.contentGrid, isWide && styles.contentGridWide]}>
          <View style={[styles.card, isWide && styles.contentPane]}>
            <Text style={styles.sectionTitle}>Yorumlar</Text>
            {(task.comments || []).length === 0 ? (
              <Text style={styles.emptyText}>Henuz yorum yok.</Text>
            ) : (
              (task.comments || []).map((item) => (
                <View key={item.id} style={styles.commentRow}>
                  <View style={styles.commentTop}>
                    <Text style={styles.commentAuthor} numberOfLines={1}>{item.createdBy?.name || 'Kullanici'}</Text>
                    <Text style={styles.commentDate} numberOfLines={1}>{formatDate(item.createdAt)}</Text>
                  </View>
                  <Text style={styles.commentBody}>{item.body}</Text>
                </View>
              ))
            )}
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="Yorum yazin..."
              placeholderTextColor={colors.textMuted}
              value={comment}
              onChangeText={setComment}
              multiline
            />
            <TouchableOpacity style={[styles.primaryButton, saving && styles.buttonDisabled]} onPress={addComment} disabled={saving}>
              <Text style={styles.primaryButtonText}>{saving ? 'Kaydediliyor...' : 'Yorum Gonder'}</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.card, isWide && styles.contentPane]}>
            <Text style={styles.sectionTitle}>Ekler ve Linkler</Text>
            {(task.attachments || []).length === 0 && (task.links || []).length === 0 ? (
              <Text style={styles.emptyText}>Ek veya baglanti yok.</Text>
            ) : null}
            {(task.attachments || []).map((item) => (
              <TouchableOpacity key={item.id} style={styles.linkRow} onPress={() => Linking.openURL(item.url)}>
                <Text style={styles.linkText} numberOfLines={2} ellipsizeMode="middle">{item.filename}</Text>
                <Text style={styles.metaSub} numberOfLines={1}>{formatDate(item.createdAt)}</Text>
              </TouchableOpacity>
            ))}
            {(task.links || []).map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.linkRow}
                disabled={!item.referenceUrl}
                onPress={() => item.referenceUrl && Linking.openURL(item.referenceUrl)}
              >
                <Text style={styles.linkText} numberOfLines={2} ellipsizeMode="tail">{item.label || item.referenceCode || item.type}</Text>
                <Text style={styles.metaSub} numberOfLines={1}>{item.type}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.secondaryButton, saving && styles.buttonDisabled]} onPress={addAttachment} disabled={saving}>
              <Text style={styles.secondaryButtonText}>{saving ? 'Yukleniyor...' : 'Dosya Yukle'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  errorTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.lg,
    color: colors.text,
  },
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
  },
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  hero: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: '#173D78',
    padding: spacing.lg,
    gap: spacing.sm,
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
    fontSize: fontSizes.xl,
    color: '#FFFFFF',
  },
  heroBody: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.md,
    lineHeight: fontSizes.md + 6,
    color: '#DDE8FF',
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.lg,
    color: colors.text,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statusBadge: {
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.primary,
  },
  priorityBadge: {
    borderRadius: radius.sm,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  priorityBadgeHigh: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  priorityBadgeText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  priorityBadgeTextHigh: {
    color: colors.danger,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metaBox: {
    flexGrow: 1,
    minWidth: 140,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F8FAFC',
    padding: spacing.md,
  },
  metaLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  metaValue: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
    marginTop: 2,
  },
  metaSub: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  sectionTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  contentGrid: {
    gap: spacing.md,
  },
  contentGridWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  contentPane: {
    flex: 1,
  },
  commentRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  commentTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  commentAuthor: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  commentDate: {
    flexShrink: 0,
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  commentBody: {
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
  multiline: {
    height: 90,
    textAlignVertical: 'top',
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
  linkRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: 2,
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  linkText: {
    fontFamily: fonts.semibold,
    color: colors.primary,
    lineHeight: fontSizes.sm + 5,
  },
  emptyText: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
  },
});
