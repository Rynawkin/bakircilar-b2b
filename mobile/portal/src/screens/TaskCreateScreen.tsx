import { useRef, useState } from 'react';
import {
  Alert,
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
import { TaskPriority, TaskStatus, TaskType } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';

const STATUS_OPTIONS: TaskStatus[] = ['NEW', 'IN_PROGRESS', 'DONE', 'CANCELLED'];
const PRIORITY_OPTIONS: TaskPriority[] = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const TYPE_OPTIONS: TaskType[] = ['CALL', 'FOLLOW_UP', 'COLLECTION', 'MEETING', 'VISIT', 'SUPPORT', 'QUOTE', 'ORDER', 'CUSTOMER', 'INTERNAL', 'DOCUMENT', 'REPORT', 'DATA_SYNC', 'ACCESS', 'DESIGN_UX', 'OTHER'];

export function TaskCreateScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('NEW');
  const [priority, setPriority] = useState<TaskPriority>('NONE');
  const [type, setType] = useState<TaskType>('OTHER');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const handleCreate = async () => {
    if (savingRef.current) return;
    if (!title.trim()) {
      Alert.alert('Eksik Bilgi', 'Baslik girin.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await adminApi.createTask({
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        type,
      });
      Alert.alert('Basarili', 'Talep olusturuldu.');
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Talep olusturulamadi.'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <TouchableOpacity style={styles.heroBackButton} onPress={() => navigation.goBack()}>
            <Text style={styles.heroBackText}>Geri</Text>
          </TouchableOpacity>
          <Text style={styles.kicker}>Talep Merkezi</Text>
          <Text style={styles.title}>Yeni Talep</Text>
          <Text style={styles.subtitle}>Konu, oncelik ve is tipini secerek ekibe takip edilebilir bir is acin.</Text>
          <View style={styles.heroMetrics}>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Durum</Text>
              <Text style={styles.heroMetricValue}>{status}</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Oncelik</Text>
              <Text style={styles.heroMetricValue}>{priority}</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Tur</Text>
              <Text style={styles.heroMetricValue}>{type}</Text>
            </View>
          </View>
        </View>

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
          <Text style={styles.sectionTitle}>Durum</Text>
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
          <Text style={styles.sectionTitle}>Oncelik</Text>
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
          <Text style={styles.sectionTitle}>Tur</Text>
          <View style={styles.row}>
            {TYPE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.segmentButton, type === option && styles.segmentButtonActive]}
                onPress={() => setType(option)}
              >
                <Text style={type === option ? styles.segmentTextActive : styles.segmentText}>{option}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={handleCreate} disabled={saving}>
          <Text style={styles.primaryButtonText}>{saving ? 'Kaydediliyor...' : 'Talep Olustur'}</Text>
        </TouchableOpacity>
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
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  backText: {
    fontFamily: fonts.medium,
    color: colors.primarySoft,
  },
  hero: {
    paddingHorizontal: 1,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  heroBackButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  heroBackText: {
    fontFamily: fonts.semibold,
    color: '#BFDBFE',
  },
  kicker: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#BFDBFE',
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: '#FFFFFF',
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.md,
    color: '#DCEAFE',
    lineHeight: 22,
  },
  heroMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  heroMetric: {
    flexGrow: 1,
    minWidth: 92,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  heroMetricLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFDBFE',
  },
  heroMetricValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.sm,
    color: '#FFFFFF',
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
  sectionTitle: {
    fontFamily: fonts.semibold,
    color: colors.text,
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
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
  },
});
