import { useEffect, useState } from 'react';
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
  View,
} from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';

import { customerApi } from '../api/customer';
import { RootStackParamList } from '../navigation/AppNavigator';
import { TaskDetail } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

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
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchTask = async () => {
    setLoading(true);
    try {
      const response = await customerApi.getTaskById(route.params.taskId);
      setTask(response.task);
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Talep yuklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTask();
  }, []);

  const addComment = async () => {
    if (!comment.trim()) return;
    setSaving(true);
    try {
      await customerApi.addTaskComment(route.params.taskId, { body: comment.trim() });
      setComment('');
      await fetchTask();
    } finally {
      setSaving(false);
    }
  };

  const addAttachment = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled) return;

    const file = result.assets[0];
    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      name: file.name || 'attachment',
      type: file.mimeType || 'application/octet-stream',
    } as any);

    setSaving(true);
    try {
      await customerApi.addTaskAttachment(route.params.taskId, formData);
      await fetchTask();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Dosya yuklenemedi.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !task) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>{task.title}</Text>
          <Text style={styles.meta}>
            Durum: {STATUS_LABELS[normalizeStatus(task.status)] || normalizeStatus(task.status)}
          </Text>
          <Text style={styles.meta}>Oncelik: {PRIORITY_LABELS[task.priority || 'NONE']}</Text>
          {task.description ? <Text style={styles.body}>{task.description}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Yorumlar</Text>
          {(task.comments || []).map((item) => (
            <View key={item.id} style={styles.commentRow}>
              <Text style={styles.commentAuthor}>{item.createdBy?.name || 'Kullanici'}</Text>
              <Text style={styles.commentBody}>{item.body}</Text>
            </View>
          ))}
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Yorum yazin..."
            placeholderTextColor={colors.textMuted}
            value={comment}
            onChangeText={setComment}
            multiline
          />
          <TouchableOpacity style={styles.primaryButton} onPress={addComment}>
            <Text style={styles.primaryButtonText}>{saving ? 'Kaydediliyor...' : 'Yorum Gonder'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Ekler</Text>
          {(task.attachments || []).map((item) => (
            <TouchableOpacity key={item.id} onPress={() => Linking.openURL(item.url)}>
              <Text style={styles.linkText}>{item.filename}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.secondaryButton} onPress={addAttachment}>
            <Text style={styles.secondaryButtonText}>Dosya Yukle</Text>
          </TouchableOpacity>
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.lg,
    color: colors.text,
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
  commentRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  commentAuthor: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
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
  linkText: {
    fontFamily: fonts.semibold,
    color: colors.primary,
  },
});
