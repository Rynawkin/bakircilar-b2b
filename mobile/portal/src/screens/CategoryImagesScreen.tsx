import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

import { adminApi } from '../api/admin';
import { CategoryWithPriceRules } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
import { normalizeSearchText } from '../utils/search';

export function CategoryImagesScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 820;
  const [categories, setCategories] = useState<CategoryWithPriceRules[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyIdRef = useRef<string | null>(null);
  const fetchSeqRef = useRef(0);

  const beginBusy = (id: string) => {
    if (busyIdRef.current) return false;
    busyIdRef.current = id;
    setBusyId(id);
    return true;
  };

  const endBusy = () => {
    busyIdRef.current = null;
    setBusyId(null);
  };

  const fetchCategories = async () => {
    const requestSeq = ++fetchSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getCategories();
      if (requestSeq !== fetchSeqRef.current) return;
      const rows = [...(response.categories || [])].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      setCategories(rows);
    } catch (err: any) {
      if (requestSeq !== fetchSeqRef.current) return;
      setError(getApiErrorMessage(err, 'Kategoriler yuklenemedi.'));
    } finally {
      if (requestSeq === fetchSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const filtered = useMemo(() => {
    const term = normalizeSearchText(search);
    if (!term) return categories;
    return categories.filter((category) => {
      return normalizeSearchText(`${category.name} ${category.mikroCode || ''}`).includes(term);
    });
  }, [categories, search]);

  const summary = useMemo(() => {
    const withImage = categories.filter((category) => Boolean(category.imageUrl)).length;
    return {
      total: categories.length,
      withImage,
      missing: Math.max(categories.length - withImage, 0),
      shown: filtered.length,
    };
  }, [categories, filtered.length]);

  const applyImage = (id: string, imageUrl: string | null) => {
    setCategories((prev) => prev.map((item) => item.id === id ? { ...item, imageUrl } : item));
  };

  const uploadCategoryImage = async (category: CategoryWithPriceRules) => {
    if (busyIdRef.current) return;
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: 'image/*',
    });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    if (asset.mimeType && !asset.mimeType.startsWith('image/')) {
      Alert.alert('Dosya Tipi', 'Lutfen bir gorsel dosyasi secin.');
      return;
    }
    if (asset.size && asset.size > 5 * 1024 * 1024) {
      Alert.alert('Dosya Boyutu', 'Gorsel 5MB altinda olmali.');
      return;
    }

    const formData = new FormData();
    formData.append('image', {
      uri: asset.uri,
      name: asset.name || 'category.jpg',
      type: asset.mimeType || 'image/jpeg',
    } as any);

    if (!beginBusy(category.id)) return;
    try {
      const upload = await adminApi.uploadBannerImage(formData);
      await adminApi.setCategoryImage(category.id, upload.imageUrl);
      applyImage(category.id, upload.imageUrl);
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Gorsel yuklenemedi.'));
    } finally {
      endBusy();
    }
  };

  const removeImage = (category: CategoryWithPriceRules) => {
    if (busyIdRef.current) return;
    Alert.alert('Gorseli Kaldir', `"${category.name}" gorseli kaldirilsin mi?`, [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Kaldir',
        style: 'destructive',
        onPress: async () => {
          if (!beginBusy(category.id)) return;
          try {
            await adminApi.setCategoryImage(category.id, null);
            applyImage(category.id, null);
          } catch (err: any) {
            Alert.alert('Hata', getApiErrorMessage(err, 'Gorsel kaldirilamadi.'));
          } finally {
            endBusy();
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.heroTop}>
            <View style={styles.heroText}>
              <Text style={styles.kicker}>Kategori Vitrini</Text>
              <Text style={styles.title}>Kategori Gorselleri</Text>
              <Text style={styles.subtitle}>Musteri ana sayfasindaki kategori kesfi kartlarini mobilde eksiksiz ve tutarli yonetin.</Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity style={[styles.secondaryButton, loading && styles.buttonDisabled]} onPress={fetchCategories} disabled={loading}>
                <Text style={styles.secondaryButtonText}>{loading ? 'Yukleniyor' : 'Yenile'}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Toplam</Text>
              <Text style={styles.heroStatValue}>{summary.total}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Gorselli</Text>
              <Text style={styles.heroStatValue}>{summary.withImage}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Eksik</Text>
              <Text style={[styles.heroStatValue, summary.missing > 0 && styles.heroStatWarning]}>{summary.missing}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Gorunen</Text>
              <Text style={styles.heroStatValue}>{summary.shown}</Text>
            </View>
          </View>
        </View>

        <View style={styles.searchCard}>
          <TextInput
            style={styles.input}
            value={search}
            onChangeText={setSearch}
            placeholder="Kategori adi veya kodu ara"
            placeholderTextColor={colors.textMuted}
          />
          <Text style={styles.searchMeta}>{filtered.length} kategori</Text>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}
        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
        ) : filtered.length === 0 ? (
          <Text style={styles.emptyText}>Kategori bulunamadi.</Text>
        ) : (
          <View style={[styles.categoryGrid, isWide && styles.categoryGridWide]}>
            {filtered.map((category) => {
            const busy = busyId === category.id;
            return (
              <View key={category.id} style={[styles.categoryCard, isWide && styles.categoryCardWide]}>
                <View style={styles.imageShell}>
                  {category.imageUrl ? (
                    <Image source={{ uri: category.imageUrl }} style={styles.categoryImage} resizeMode="cover" />
                  ) : (
                    <View style={styles.placeholder}>
                      <Text style={styles.placeholderText}>Gorsel yok</Text>
                    </View>
                  )}
                  {busy && (
                    <View style={styles.busyOverlay}>
                      <ActivityIndicator color={colors.primary} />
                    </View>
                  )}
                </View>
                <View style={styles.categoryBody}>
                  <Text style={styles.categoryTitle} numberOfLines={2}>{category.name}</Text>
                  {!!category.mikroCode && <Text style={styles.categoryMeta} numberOfLines={1}>{category.mikroCode}</Text>}
                  <View style={styles.cardActions}>
                    <TouchableOpacity style={[styles.smallButton, (busy || Boolean(busyId)) && styles.buttonDisabled]} onPress={() => uploadCategoryImage(category)} disabled={busy || Boolean(busyId)}>
                      <Text style={styles.smallButtonText}>{busy ? 'Isleniyor...' : 'Yukle'}</Text>
                    </TouchableOpacity>
                    {!!category.imageUrl && (
                      <TouchableOpacity style={[styles.smallDangerButton, (busy || Boolean(busyId)) && styles.buttonDisabled]} onPress={() => removeImage(category)} disabled={busy || Boolean(busyId)}>
                        <Text style={styles.smallDangerText}>Kaldir</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { paddingVertical: spacing.xs, gap: spacing.md },
  heroTop: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.lg, alignItems: 'flex-start' },
  heroText: { flex: 1, minWidth: 240, gap: spacing.xs },
  kicker: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: '#93C5FD', textTransform: 'uppercase' },
  title: { fontFamily: fonts.bold, fontSize: fontSizes.xxl, color: '#FFFFFF' },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSizes.md, color: '#DDE8FF', lineHeight: 22 },
  heroStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  heroStat: { flex: 1, minWidth: 118, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', borderRadius: radius.lg, padding: spacing.md, backgroundColor: 'rgba(255,255,255,0.08)' },
  heroStatLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: '#BCD2F7' },
  heroStatValue: { fontFamily: fonts.bold, fontSize: fontSizes.xl, color: '#FFFFFF', marginTop: spacing.xs },
  heroStatWarning: { color: '#FCD34D' },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  secondaryButton: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignSelf: 'flex-start' },
  secondaryButtonText: { fontFamily: fonts.semibold, color: colors.primarySoft },
  searchCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border, fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.text },
  searchMeta: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  categoryGrid: { gap: spacing.md },
  categoryGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  categoryCard: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  categoryCardWide: { width: '48.7%' },
  imageShell: { width: 108, height: 108, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  categoryImage: { width: '100%', height: '100%' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  placeholderText: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  busyOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.72)' },
  categoryBody: { flex: 1, minWidth: 0, gap: spacing.xs },
  categoryTitle: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: colors.text },
  categoryMeta: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 'auto' },
  smallButton: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  smallButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.text },
  smallDangerButton: { borderWidth: 1, borderColor: 'rgba(248,113,113,0.30)', borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.dangerSoft },
  smallDangerText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.danger },
  buttonDisabled: { opacity: 0.6 },
  error: { fontFamily: fonts.medium, color: colors.danger },
  loading: { alignItems: 'center', padding: spacing.xl },
  emptyText: { fontFamily: fonts.regular, color: colors.textMuted },
});
