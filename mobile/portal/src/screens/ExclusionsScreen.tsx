import { useEffect, useMemo, useRef, useState } from 'react';
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
import { getApiErrorMessage } from '../utils/errors';

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
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const searchSeqRef = useRef(0);

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
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Exclusion listesi yuklenemedi.'));
    } finally {
      setLoading(false);
    }
  };

  const searchProducts = async (term: string) => {
    const requestSeq = ++searchSeqRef.current;
    setSearching(true);
    try {
      const response = await adminApi.searchStocks({
        searchTerm: term.trim() || undefined,
        limit: 20,
        offset: 0,
      });
      if (requestSeq === searchSeqRef.current) {
        setSearchResults(response.data || []);
      }
    } catch (_err) {
      if (requestSeq === searchSeqRef.current) {
        setSearchResults([]);
      }
    } finally {
      if (requestSeq === searchSeqRef.current) {
        setSearching(false);
      }
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
    if (savingRef.current) return;
    const rawValue = value.trim();
    if (!rawValue) {
      Alert.alert('Eksik Bilgi', 'Deger girin.');
      return;
    }
    const normalizedValue = type === 'PRODUCT_CODE' ? normalizeCode(rawValue) : rawValue;
    if (!beginSaving()) return;
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
      Alert.alert('Hata', getApiErrorMessage(err, 'Kayit basarisiz.'));
    } finally {
      endSaving();
    }
  };

  const toggleActive = async (item: Exclusion) => {
    if (!beginSaving()) return;
    try {
      await adminApi.updateExclusion(item.id, { active: !item.active });
      await fetchExclusions();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Guncelleme basarisiz.'));
    } finally {
      endSaving();
    }
  };

  const remove = async (id: string) => {
    if (!beginSaving()) return;
    try {
      await adminApi.deleteExclusion(id);
      await fetchExclusions();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Silme basarisiz.'));
    } finally {
      endSaving();
    }
  };

  const quickExclude = async (stock: any) => {
    if (savingRef.current) return;
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

    if (!beginSaving()) return;
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
      Alert.alert('Hata', getApiErrorMessage(err, 'Urun dislanamadi.'));
    } finally {
      endSaving();
    }
  };

  const quickUnexclude = async (code: string) => {
    if (savingRef.current) return;
    const normalized = normalizeCode(code);
    const existing = exclusionByCode.get(normalized) || [];
    const activeRule = existing.find((item) => item.active);
    if (!activeRule) {
      Alert.alert('Bilgi', `${normalized} aktif dislama listesinde degil.`);
      return;
    }

    if (!beginSaving()) return;
    try {
      await adminApi.updateExclusion(activeRule.id, { active: false });
      await fetchExclusions();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Guncelleme basarisiz.'));
    } finally {
      endSaving();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Katalog Kontrol</Text>
          <Text style={styles.title}>Exclusions</Text>
          <Text style={styles.subtitle}>Dislanan urunler musteri tarafinda ve raporlarda gizlenir.</Text>
          <View style={styles.heroMetricRow}>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{exclusions.length}</Text>
              <Text style={styles.heroMetricLabel}>Kural</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{activeProductExclusionCount}</Text>
              <Text style={styles.heroMetricLabel}>Aktif Urun</Text>
            </View>
          </View>
        </View>

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
              <Text style={styles.cardTitle} numberOfLines={1}>{item.type}</Text>
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
