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
import { CategoryWithPriceRules } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

const CUSTOMER_TYPES = ['BAYI', 'PERAKENDE', 'VIP', 'OZEL'] as const;

export function CategoriesScreen() {
  const [categories, setCategories] = useState<CategoryWithPriceRules[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<CategoryWithPriceRules | null>(null);
  const [customerType, setCustomerType] = useState<string>('BAYI');
  const [profitMargin, setProfitMargin] = useState('');

  const fetchCategories = async () => {
    try {
      const response = await adminApi.getCategories();
      setCategories(response.categories || []);
    } catch (err) {
      Alert.alert('Hata', 'Kategoriler yuklenemedi.');
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const saveRule = async () => {
    if (!selectedCategory) {
      Alert.alert('Eksik Bilgi', 'Kategori secin.');
      return;
    }
    if (!profitMargin) {
      Alert.alert('Eksik Bilgi', 'Kar marji girin.');
      return;
    }
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
      Alert.alert('Hata', err?.response?.data?.error || 'Kayit basarisiz.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Kategoriler</Text>
        <Text style={styles.subtitle}>Kategori bazli fiyat kurallari.</Text>

        {categories.map((category) => (
          <TouchableOpacity
            key={category.id}
            style={[styles.card, selectedCategory?.id === category.id && styles.cardActive]}
            onPress={() => setSelectedCategory(category)}
          >
            <Text style={styles.cardTitle}>{category.name}</Text>
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
          <TouchableOpacity style={styles.primaryButton} onPress={saveRule}>
            <Text style={styles.primaryButtonText}>Kaydet</Text>
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
});
