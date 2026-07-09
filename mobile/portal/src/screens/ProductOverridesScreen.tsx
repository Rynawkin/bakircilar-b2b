import { useEffect, useMemo, useRef, useState } from 'react';
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
import { getApiErrorMessage } from '../utils/errors';

const CUSTOMER_TYPES = ['BAYI', 'PERAKENDE', 'VIP', 'OZEL'] as const;

export function ProductOverridesScreen() {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [customerType, setCustomerType] = useState<string>('BAYI');
  const [profitMargin, setProfitMargin] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

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
    if (savingRef.current) return;
    if (!selectedProduct) {
      Alert.alert('Eksik Bilgi', 'Urun secin.');
      return;
    }
    if (!profitMargin) {
      Alert.alert('Eksik Bilgi', 'Kar marji girin.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await adminApi.setProductPriceOverride({
        productId: selectedProduct.id,
        customerType,
        profitMargin: Number(profitMargin),
      });
      Alert.alert('Basarili', 'Override kaydedildi.');
      setProfitMargin('');
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Kayit basarisiz.'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const list = useMemo(() => products.slice(0, 10), [products]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Fiyat Kurali</Text>
          <Text style={styles.title}>Urun Override</Text>
          <Text style={styles.subtitle}>Urun bazli kar marji ayarini secili musteri tipine gore yapin.</Text>
          <View style={styles.heroMetrics}>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Sonuc</Text>
              <Text style={styles.heroMetricValue}>{list.length}</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Tip</Text>
              <Text style={styles.heroMetricValue}>{customerType}</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Secim</Text>
              <Text style={styles.heroMetricValue}>{selectedProduct ? 'Hazir' : 'Yok'}</Text>
            </View>
          </View>
        </View>

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
  hero: {
    paddingHorizontal: 1,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
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
    fontSize: fontSizes.md,
    color: '#FFFFFF',
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
