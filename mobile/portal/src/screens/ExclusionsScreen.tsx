import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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

const normalizeCode = (value: string | undefined | null) => String(value || '').trim().toUpperCase();

export function ExclusionsScreen() {
  const [exclusions, setExclusions] = useState<Exclusion[]>([]);
  const [type, setType] = useState<Exclusion['type']>('PRODUCT_CODE');
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);

  const exclusionByCode = useMemo(() => {
    const map = new Map<string, Exclusion[]>();
    exclusions
      .filter((item) => item.type === 'PRODUCT_CODE')
      .forEach((item) => {
        const key = normalizeCode(item.value);
        const list = map.get(key) || [];
        list.push(item);
        map.set(key, list);
      });
    return map;
  }, [exclusions]);

  const activeProductExclusionCount = useMemo(
    () => exclusions.filter((item) => item.type === 'PRODUCT_CODE' && item.active).length,
    [exclusions]
  );

  const fetchExclusions = async () => {
    try {
      const response = await adminApi.getExclusions();
      setExclusions(response.data || []);
    } catch (_err) {
      Alert.alert('Hata', 'Exclusion listesi yuklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  const searchProducts = async (term: string) => {
    setSearching(true);
    try {
      const response = await adminApi.searchStocks({
        searchTerm: term.trim() || undefined,
        limit: 20,
        offset: 0,
      });
      setSearchResults(response.data || []);
    } catch (_err) {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    fetchExclusions();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchProducts(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const addExclusion = async () => {
    const rawValue = value.trim();
    if (!rawValue) {
      Alert.alert('Eksik Bilgi', 'Deger girin.');
      return;
    }
    const normalizedValue = type === 'PRODUCT_CODE' ? normalizeCode(rawValue) : rawValue;
    try {
      await adminApi.createExclusion({
        type,
        value: normalizedValue,
        description: description.trim() || undefined,
      });
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

  const quickExclude = async (stock: any) => {
    const code = normalizeCode(stock?.code || stock?.stok_kod);
    if (!code) {
      return;
    }

    const existing = exclusionByCode.get(code) || [];
    const activeRule = existing.find((item) => item.active);
    if (activeRule) {
      Alert.alert('Bilgi', `${code} zaten dislama listesinde.`);
      return;
    }

    try {
      const inactiveRule = existing.find((item) => !item.active);
      if (inactiveRule) {
        await adminApi.updateExclusion(inactiveRule.id, { active: true });
      } else {
        await adminApi.createExclusion({
          type: 'PRODUCT_CODE',
          value: code,
          description: 'Mobil panelden urun dislama',
        });
      }
      await fetchExclusions();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Urun dislanamadi.');
    }
  };

  const quickUnexclude = async (code: string) => {
    const normalized = normalizeCode(code);
    const existing = exclusionByCode.get(normalized) || [];
    const activeRule = existing.find((item) => item.active);
    if (!activeRule) {
      Alert.alert('Bilgi', `${normalized} aktif dislama listesinde degil.`);
      return;
    }

    try {
      await adminApi.updateExclusion(activeRule.id, { active: false });
      await fetchExclusions();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Guncelleme basarisiz.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Exclusions</Text>
        <Text style={styles.subtitle}>Dislanan urunler musteri tarafinda ve raporlarda gizlenir.</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Hizli Urun Dislama</Text>
          <TextInput
            style={styles.input}
            placeholder="Urun ara (kod veya ad)"
            placeholderTextColor={colors.textMuted}
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
          <Text style={styles.cardMeta}>Aktif dislanan urun sayisi: {activeProductExclusionCount}</Text>
          {searching ? (
            <View style={styles.searchLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View style={styles.searchList}>
              {searchResults.map((item, index) => {
                const code = normalizeCode(item?.code || item?.stok_kod);
                const name = String(item?.name || item?.stok_adi || '-');
                const isExcluded = (exclusionByCode.get(code) || []).some((rule) => rule.active);

                return (
                  <View key={`${code}-${index}`} style={styles.searchItem}>
                    <View style={styles.searchItemContent}>
                      <Text style={styles.searchItemTitle} numberOfLines={2}>
                        {name}
                      </Text>
                      <Text style={styles.cardMeta}>{code || '-'}</Text>
                    </View>
                    {isExcluded ? (
                      <TouchableOpacity style={styles.secondaryButton} onPress={() => quickUnexclude(code)}>
                        <Text style={styles.secondaryButtonText}>Geri Al</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={styles.dangerButton} onPress={() => quickExclude(item)}>
                        <Text style={styles.dangerButtonText}>Disla</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {loading ? (
          <View style={styles.card}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          exclusions.map((item) => (
            <View key={item.id} style={styles.card}>
              <Text style={styles.cardTitle}>{item.type}</Text>
              <Text style={styles.cardMeta}>{item.value}</Text>
              {item.description ? <Text style={styles.cardMeta}>{item.description}</Text> : null}
              <View style={styles.row}>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => toggleActive(item)}>
                  <Text style={styles.secondaryButtonText}>{item.active ? 'Pasif Et' : 'Aktif Et'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => remove(item.id)}>
                  <Text style={styles.secondaryButtonText}>Sil</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

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
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  dangerButton: {
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    backgroundColor: '#8E1F1F',
  },
  dangerButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
  },
  searchLoading: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchList: {
    gap: spacing.sm,
  },
  searchItem: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  searchItemContent: {
    flex: 1,
    gap: spacing.xs,
  },
  searchItemTitle: {
    fontFamily: fonts.semibold,
    color: colors.text,
    fontSize: fontSizes.sm,
  },
});
