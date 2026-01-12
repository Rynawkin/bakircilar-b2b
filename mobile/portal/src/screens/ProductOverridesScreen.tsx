import { useEffect, useMemo, useState } from 'react';
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
import { Product } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

const CUSTOMER_TYPES = ['BAYI', 'PERAKENDE', 'VIP', 'OZEL'] as const;

export function ProductOverridesScreen() {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [customerType, setCustomerType] = useState<string>('BAYI');
  const [profitMargin, setProfitMargin] = useState('');

  useEffect(() => {
    let active = true;
    const run = async () => {
      const term = search.trim();
      if (!term) {
        setProducts([]);
        return;
      }
      try {
        const response = await adminApi.getProducts({ search: term, page: 1, limit: 10 });
        if (active) {
          setProducts(response.products || []);
        }
      } catch (err) {
        if (active) {
          setProducts([]);
        }
      }
    };
    run();
    return () => {
      active = false;
    };
  }, [search]);

  const applyOverride = async () => {
    if (!selectedProduct) {
      Alert.alert('Eksik Bilgi', 'Urun secin.');
      return;
    }
    if (!profitMargin) {
      Alert.alert('Eksik Bilgi', 'Kar marji girin.');
      return;
    }
    try {
      await adminApi.setProductPriceOverride({
        productId: selectedProduct.id,
        customerType,
        profitMargin: Number(profitMargin),
      });
      Alert.alert('Basarili', 'Override kaydedildi.');
      setProfitMargin('');
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Kayit basarisiz.');
    }
  };

  const list = useMemo(() => products.slice(0, 10), [products]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Urun Override</Text>
        <Text style={styles.subtitle}>Urun bazli kar marji ayari.</Text>

        <TextInput
          style={styles.input}
          placeholder="Urun ara"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {list.map((product) => (
          <TouchableOpacity
            key={product.id}
            style={[styles.listItem, selectedProduct?.id === product.id && styles.listItemActive]}
            onPress={() => setSelectedProduct(product)}
          >
            <Text style={styles.listItemTitle}>{product.name}</Text>
            <Text style={styles.listItemMeta}>{product.mikroCode}</Text>
          </TouchableOpacity>
        ))}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Override</Text>
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
          <TouchableOpacity style={styles.primaryButton} onPress={applyOverride}>
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
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  listItem: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listItemActive: {
    borderColor: colors.primary,
  },
  listItemTitle: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  listItemMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
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
});
