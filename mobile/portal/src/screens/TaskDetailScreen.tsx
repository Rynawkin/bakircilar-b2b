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
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';

import { adminApi } from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { TaskDetail, TaskPriority, TaskStatus, TaskVisibility } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

const STATUS_OPTIONS: TaskStatus[] = ['NEW', 'IN_PROGRESS', 'DONE', 'CANCELLED'];
const PRIORITY_OPTIONS: TaskPriority[] = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const normalizeStatus = (status: TaskStatus) => (status === 'WAITING' ? 'IN_PROGRESS' : status);

export function TaskDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const route = useRoute() as { params: { taskId: string } };
  const { taskId } = route.params;

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentVisibility, setCommentVisibility] = useState<TaskVisibility>('PUBLIC');
  const [attachmentVisibility, setAttachmentVisibility] = useState<TaskVisibility>('PUBLIC');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('NEW');
  const [priority, setPriority] = useState<TaskPriority>('NONE');

  const fetchTask = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getTaskById(taskId);
      setTask(response.task);
      setTitle(response.task.title || '');
      setDescription(response.task.description || '');
      setStatus(normalizeStatus(response.task.status));
      setPriority(response.task.priority);
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Talep yuklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTask();
  }, [taskId]);

  const saveTask = async () => {
    if (!task) return;
    if (!title.trim()) {
      Alert.alert('Eksik Bilgi', 'Baslik gerekli.');
      return;
    }
    setSaving(true);
    try {
      const response = await adminApi.updateTask(task.id, {
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
      });
      setTask(response.task);
      Alert.alert('Basarili', 'Talep guncellendi.');
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Guncelleme basarisiz.');
    } finally {
      setSaving(false);
    }
  };

  const addComment = async () => {
    if (!task) return;
    if (!commentText.trim()) {
      Alert.alert('Eksik Bilgi', 'Yorum girin.');
      return;
    }
    try {
      const response = await adminApi.addTaskComment(task.id, {
        body: commentText.trim(),
        visibility: commentVisibility,
      });
      setTask((prev) =>
        prev
          ? {
              ...prev,
              comments: [...prev.comments, response.comment],
              _count: prev._count
                ? { ...prev._count, comments: prev._count.comments + 1 }
                : prev._count,
            }
          : prev
      );
      setCommentText('');
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Yorum eklenemedi.');
    }
  };

  const uploadAttachment = async () => {
    if (!task) return;
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    const formData = new FormData();
    formData.append('file', {
      uri: asset.uri,
      name: asset.name || 'attachment',
      type: asset.mimeType || 'application/octet-stream',
    } as any);
    formData.append('visibility', attachmentVisibility);

    try {
      const response = await adminApi.addTaskAttachment(task.id, formData);
      setTask((prev) =>
        prev
          ? {
              ...prev,
              attachments: [...prev.attachments, response.attachment],
              _count: prev._count
                ? { ...prev._count, attachments: prev._count.attachments + 1 }
                : prev._count,
            }
          : prev
      );
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Dosya yuklenemedi.');
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Geri</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Talep Detayi</Text>

        {task ? (
          <View style={styles.card}>
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
            <View style={styles.row}>
              {STATUS_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[styles.segmentButton, status === option && styles.segmentButtonActive]}
                  onPress={() => setStatus(option)}
                >
                  <Text style={status === option ? styles.segmentTextActive : styles.segmentText}>{option}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.row}>
              {PRIORITY_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[styles.segmentButton, priority === option && styles.segmentButtonActive]}
                  onPress={() => setPriority(option)}
                >
                  <Text style={priority === option ? styles.segmentTextActive : styles.segmentText}>{option}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.primaryButton} onPress={saveTask} disabled={saving}>
              <Text style={styles.primaryButtonText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
            </TouchableOpacity>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Yorumlar</Text>
              {(task.comments || []).map((comment) => (
                <View key={comment.id} style={styles.itemCard}>
                  <Text style={styles.itemTitle}>{comment.author?.name || 'Kullanici'}</Text>
                  <Text style={styles.itemMeta}>{comment.createdAt?.slice?.(0, 16) || '-'}</Text>
                  <Text style={styles.itemBody}>{comment.body}</Text>
                  <Text style={styles.itemMeta}>{comment.visibility}</Text>
                </View>
              ))}
              {(task.comments || []).length === 0 && (
                <Text style={styles.helper}>Yorum yok.</Text>
              )}
              <TextInput
                style={[styles.input, styles.multiline]}
                placeholder="Yorum yaz"
                placeholderTextColor={colors.textMuted}
                value={commentText}
                onChangeText={setCommentText}
                multiline
              />
              <View style={styles.row}
              >
                {(['PUBLIC', 'INTERNAL'] as TaskVisibility[]).map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[styles.segmentButton, commentVisibility === option && styles.segmentButtonActive]}
                    onPress={() => setCommentVisibility(option)}
                  >
                    <Text style={commentVisibility === option ? styles.segmentTextActive : styles.segmentText}>{option}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.secondaryButton} onPress={addComment}>
                <Text style={styles.secondaryButtonText}>Yorum Ekle</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Dosyalar</Text>
              {(task.attachments || []).map((attachment) => (
                <TouchableOpacity
                  key={attachment.id}
                  style={styles.itemCard}
                  onPress={() => Linking.openURL(attachment.url)}
                >
                  <Text style={styles.itemTitle}>{attachment.originalName || attachment.fileName}</Text>
                  <Text style={styles.itemMeta}>{Math.round((attachment.size || 0) / 1024)} KB</Text>
                </TouchableOpacity>
              ))}
              {(task.attachments || []).length === 0 && (
                <Text style={styles.helper}>Dosya yok.</Text>
              )}
              <View style={styles.row}>
                {(['PUBLIC', 'INTERNAL'] as TaskVisibility[]).map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[styles.segmentButton, attachmentVisibility === option && styles.segmentButtonActive]}
                    onPress={() => setAttachmentVisibility(option)}
                  >
                    <Text style={attachmentVisibility === option ? styles.segmentTextActive : styles.segmentText}>{option}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.secondaryButton} onPress={uploadAttachment}>
                <Text style={styles.secondaryButtonText}>Dosya Yukle</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <Text style={styles.helper}>Talep bulunamadi.</Text>
        )}
      </ScrollView>
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
  container: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  backText: {
    fontFamily: fonts.medium,
    color: colors.primary,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
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
    minHeight: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  segmentButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
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
  section: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  sectionTitle: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  itemCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  itemTitle: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  itemMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  itemBody: {
    fontFamily: fonts.regular,
    color: colors.text,
  },
  helper: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
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
});
