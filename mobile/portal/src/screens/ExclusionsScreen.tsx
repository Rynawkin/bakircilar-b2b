import { useEffect, useState } from 'react';
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

import { adminApi } from '../api/admin';
import { Exclusion } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

const EXCLUSION_TYPES: Exclusion['type'][] = [
  'PRODUCT_CODE',
  'CUSTOMER_CODE',
  'CUSTOMER_NAME',
  'PRODUCT_NAME',
  'SECTOR_CODE',
];

export function ExclusionsScreen() {
  const [exclusions, setExclusions] = useState<Exclusion[]>([]);
  const [type, setType] = useState<Exclusion['type']>('PRODUCT_CODE');
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');

  const fetchExclusions = async () => {
    try {
      const response = await adminApi.getExclusions();
      setExclusions(response.data || []);
    } catch (err) {
      Alert.alert('Hata', 'Exclusion listesi yuklenemedi.');
    }
  };

  useEffect(() => {
    fetchExclusions();
  }, []);

  const addExclusion = async () => {
    if (!value.trim()) {
      Alert.alert('Eksik Bilgi', 'Deger girin.');
      return;
    }
    try {
      await adminApi.createExclusion({ type, value: value.trim(), description: description.trim() || undefined });
      setValue('');
      setDescription('');
      await fetchExclusions();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Kayit basarisiz.');
    }
  };

  const toggleActive = async (item: Exclusion) => {
    try {
      await adminApi.updateExclusion(item.id, { active: !item.active });
      await fetchExclusions();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Guncelleme basarisiz.');
    }
  };

  const remove = async (id: string) => {
    try {
      await adminApi.deleteExclusion(id);
      await fetchExclusions();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Silme basarisiz.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Exclusions</Text>
        <Text style={styles.subtitle}>Stok ve cari dislama listesi.</Text>

        {exclusions.map((item) => (
          <View key={item.id} style={styles.card}>
            <Text style={styles.cardTitle}>{item.type}</Text>
            <Text style={styles.cardMeta}>{item.value}</Text>
            {item.description && <Text style={styles.cardMeta}>{item.description}</Text>}
            <View style={styles.row}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => toggleActive(item)}>
                <Text style={styles.secondaryButtonText}>{item.active ? 'Pasif Et' : 'Aktif Et'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => remove(item.id)}>
                <Text style={styles.secondaryButtonText}>Sil</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Yeni Exclusion</Text>
          <View style={styles.row}>
            {EXCLUSION_TYPES.map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.segmentButton, type === option && styles.segmentButtonActive]}
                onPress={() => setType(option)}
              >
                <Text style={type === option ? styles.segmentTextActive : styles.segmentText}>{option}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder="Deger"
            placeholderTextColor={colors.textMuted}
            value={value}
            onChangeText={setValue}
          />
          <TextInput
            style={styles.input}
            placeholder="Aciklama"
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
          />
          <TouchableOpacity style={styles.primaryButton} onPress={addExclusion}>
            <Text style={styles.primaryButtonText}>Ekle</Text>
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
    color: colors.text,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
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
});
