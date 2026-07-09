import { useEffect, useRef, useState } from 'react';
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
import { CategoryWithPriceRules } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';

const CUSTOMER_TYPES = ['BAYI', 'PERAKENDE', 'VIP', 'OZEL'] as const;

export function CategoriesScreen() {
  const [categories, setCategories] = useState<CategoryWithPriceRules[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<CategoryWithPriceRules | null>(null);
  const [customerType, setCustomerType] = useState<string>('BAYI');
  const [profitMargin, setProfitMargin] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const fetchSeqRef = useRef(0);

  const fetchCategories = async () => {
    const requestSeq = ++fetchSeqRef.current;
    try {
      const response = await adminApi.getCategories();
      if (requestSeq === fetchSeqRef.current) {
        setCategories(response.categories || []);
      }
    } catch (err: any) {
      if (requestSeq === fetchSeqRef.current) {
        Alert.alert('Hata', getApiErrorMessage(err, 'Kategoriler yuklenemedi.'));
      }
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const saveRule = async () => {
    if (savingRef.current) return;
    if (!selectedCategory) {
      Alert.alert('Eksik Bilgi', 'Kategori secin.');
      return;
    }
    if (!profitMargin) {
      Alert.alert('Eksik Bilgi', 'Kar marji girin.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await adminApi.setCategoryPriceRule({
        categoryId: selectedCategory.id,
        customerType: customerType as any,
        profitMargin: Number(profitMargin),
      });
      Alert.alert('Basarili', 'Kategori kurali kaydedildi.');
      setProfitMargin('');
      await fetchCategories();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Kayit basarisiz.'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Fiyat Kurallari</Text>
          <Text style={styles.title}>Kategoriler</Text>
          <Text style={styles.subtitle}>Kategori bazli fiyat kurallari.</Text>
          <View style={styles.heroMetricRow}>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{categories.length}</Text>
              <Text style={styles.heroMetricLabel}>Kategori</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{categories.reduce((sum, item) => sum + (item.priceRules?.length || 0), 0)}</Text>
              <Text style={styles.heroMetricLabel}>Kural</Text>
            </View>
          </View>
        </View>

        {categories.map((category) => (
          <TouchableOpacity
            key={category.id}
            style={[styles.card, selectedCategory?.id === category.id && styles.cardActive]}
            onPress={() => setSelectedCategory(category)}
          >
            <Text style={styles.cardTitle} numberOfLines={2}>{category.name}</Text>
            {(category.priceRules || []).map((rule) => (
              <Text key={rule.id} style={styles.cardMeta}>
                {rule.customerType}: {rule.profitMargin}
              </Text>
            ))}
          </TouchableOpacity>
        ))}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Fiyat Kurali</Text>
          <View style={styles.row}>
            {CUSTOMER_TYPES.map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.segmentButton, customerType === type && styles.segmentButtonActive]}
                onPress={() => setCustomerType(type)}
              >
                <Text style={customerType === type ? styles.segmentTextActive : styles.segmentText}>{type}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder="Kar marji (0.15)"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            value={profitMargin}
            onChangeText={setProfitMargin}
          />
          <TouchableOpacity style={[styles.primaryButton, saving && styles.buttonDisabled]} onPress={saveRule} disabled={saving}>
            <Text style={styles.primaryButtonText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
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
  hero: {
    paddingHorizontal: 1,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  kicker: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#9EC5FF',
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
    color: '#DDE8FF',
    lineHeight: 22,
  },
  heroMetricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  heroMetric: {
    flexGrow: 1,
    minWidth: 118,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    padding: spacing.sm,
  },
  heroMetricValue: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: '#FFFFFF' },
  heroMetricLabel: { marginTop: 2, fontFamily: fonts.medium, fontSize: fontSizes.xs, color: '#DDE8FF' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  cardActive: {
    borderColor: colors.primary,
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
  buttonDisabled: {
    opacity: 0.6,
  },
});
