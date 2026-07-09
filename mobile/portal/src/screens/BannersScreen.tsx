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

import { AdminBanner, BannerInput, BannerPosition, adminApi } from '../api/admin';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';

const positions: Array<{ value: BannerPosition; label: string; hint: string }> = [
  { value: 'HERO', label: 'Hero', hint: 'Ana sayfa ust vitrin' },
  { value: 'STRIP', label: 'Serit', hint: 'Ince kampanya bandi' },
  { value: 'SIDE', label: 'Yan', hint: 'Dikey vitrin alani' },
  { value: 'GRID', label: 'Grid', hint: 'Urun listesi ici' },
];

const emptyForm: BannerInput = {
  title: '',
  subtitle: '',
  imageUrl: '',
  mobileImageUrl: '',
  linkUrl: '',
  productCode: '',
  buttonText: '',
  position: 'HERO',
  sortOrder: 0,
  active: true,
  startsAt: '',
  endsAt: '',
};

const toDateText = (value?: string | null) => {
  if (!value) return '';
  return value.split('T')[0] || '';
};

const toIsoOrNull = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const normalizeForm = (form: BannerInput): BannerInput => ({
  title: String(form.title || '').trim(),
  subtitle: form.subtitle ? String(form.subtitle).trim() : null,
  imageUrl: form.imageUrl ? String(form.imageUrl).trim() : null,
  mobileImageUrl: form.mobileImageUrl ? String(form.mobileImageUrl).trim() : null,
  linkUrl: form.linkUrl ? String(form.linkUrl).trim() : null,
  productCode: form.productCode ? String(form.productCode).trim() : null,
  buttonText: form.buttonText ? String(form.buttonText).trim() : null,
  position: form.position || 'HERO',
  sortOrder: Number.isFinite(Number(form.sortOrder)) ? Number(form.sortOrder) : 0,
  active: Boolean(form.active),
  startsAt: toIsoOrNull(form.startsAt),
  endsAt: toIsoOrNull(form.endsAt),
});

export function BannersScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 840;
  const [banners, setBanners] = useState<AdminBanner[]>([]);
  const [clicks, setClicks] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<'imageUrl' | 'mobileImageUrl' | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminBanner | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<BannerInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const uploadingFieldRef = useRef<'imageUrl' | 'mobileImageUrl' | null>(null);
  const mutatingIdRef = useRef<string | null>(null);
  const fetchSeqRef = useRef(0);

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

  const beginUpload = (field: 'imageUrl' | 'mobileImageUrl') => {
    if (uploadingFieldRef.current) return false;
    uploadingFieldRef.current = field;
    setUploadingField(field);
    return true;
  };

  const endUpload = () => {
    uploadingFieldRef.current = null;
    setUploadingField(null);
  };

  const beginMutating = (id: string) => {
    if (mutatingIdRef.current) return false;
    mutatingIdRef.current = id;
    setMutatingId(id);
    return true;
  };

  const endMutating = () => {
    mutatingIdRef.current = null;
    setMutatingId(null);
  };

  const fetchBanners = async () => {
    const requestSeq = ++fetchSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const [bannerResponse, statResponse] = await Promise.all([
        adminApi.getBanners(),
        adminApi.getBannerStats(30).catch(() => ({ stats: [] as Array<{ bannerId: string; clicks: number }> })),
      ]);
      if (requestSeq !== fetchSeqRef.current) return;
      setBanners((bannerResponse.banners || []).sort((a, b) => {
        if (a.position !== b.position) return a.position.localeCompare(b.position);
        return Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
      }));
      const nextClicks: Record<string, number> = {};
      (statResponse.stats || []).forEach((item) => {
        if (item.bannerId) nextClicks[item.bannerId] = Number(item.clicks || 0);
      });
      setClicks(nextClicks);
    } catch (err: any) {
      if (requestSeq === fetchSeqRef.current) {
        setError(getApiErrorMessage(err, 'Bannerlar yuklenemedi.'));
      }
    } finally {
      if (requestSeq === fetchSeqRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchBanners();
  }, []);

  const grouped = useMemo(() => {
    return positions.map((position) => ({
      ...position,
      rows: banners.filter((banner) => banner.position === position.value),
    }));
  }, [banners]);

  const summary = useMemo(() => {
    const active = banners.filter((banner) => banner.active).length;
    const mobileReady = banners.filter((banner) => Boolean(banner.mobileImageUrl)).length;
    const totalClicks = banners.reduce((sum, banner) => sum + (clicks[banner.id] || 0), 0);
    return { total: banners.length, active, mobileReady, totalClicks };
  }, [banners, clicks]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (banner: AdminBanner) => {
    setEditing(banner);
    setForm({
      title: banner.title || '',
      subtitle: banner.subtitle || '',
      imageUrl: banner.imageUrl || '',
      mobileImageUrl: banner.mobileImageUrl || '',
      linkUrl: banner.linkUrl || '',
      productCode: banner.productCode || '',
      buttonText: banner.buttonText || '',
      position: banner.position || 'HERO',
      sortOrder: banner.sortOrder || 0,
      active: banner.active,
      startsAt: toDateText(banner.startsAt),
      endsAt: toDateText(banner.endsAt),
    });
    setFormOpen(true);
  };

  const uploadImage = async (field: 'imageUrl' | 'mobileImageUrl') => {
    if (!beginUpload(field)) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: 'image/*',
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const formData = new FormData();
      formData.append('image', {
        uri: asset.uri,
        name: asset.name || 'banner.jpg',
        type: asset.mimeType || 'image/jpeg',
      } as any);

      const response = await adminApi.uploadBannerImage(formData);
      setForm((prev) => ({ ...prev, [field]: response.imageUrl }));
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Gorsel yuklenemedi.'));
    } finally {
      endUpload();
    }
  };

  const saveBanner = async () => {
    if (!beginSaving()) return;
    const payload = normalizeForm(form);
    if (!payload.title) {
      endSaving();
      Alert.alert('Eksik Bilgi', 'Banner basligi gerekli.');
      return;
    }
    setError(null);
    try {
      if (editing) {
        await adminApi.updateBanner(editing.id, payload);
      } else {
        await adminApi.createBanner(payload);
      }
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await fetchBanners();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Banner kaydedilemedi.'));
    } finally {
      endSaving();
    }
  };

  const toggleActive = async (banner: AdminBanner) => {
    if (!beginMutating(banner.id)) return;
    try {
      await adminApi.updateBanner(banner.id, { title: banner.title, active: !banner.active });
      setBanners((prev) => prev.map((item) => (item.id === banner.id ? { ...item, active: !item.active } : item)));
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Durum guncellenemedi.'));
    } finally {
      endMutating();
    }
  };

  const deleteBanner = (banner: AdminBanner) => {
    if (mutatingIdRef.current) return;
    Alert.alert('Banner Sil', `"${banner.title}" silinsin mi?`, [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          if (!beginMutating(banner.id)) return;
          try {
            await adminApi.deleteBanner(banner.id);
            setBanners((prev) => prev.filter((item) => item.id !== banner.id));
          } catch (err: any) {
            Alert.alert('Hata', getApiErrorMessage(err, 'Banner silinemedi.'));
          } finally {
            endMutating();
          }
        },
      },
    ]);
  };

  const renderImagePreview = (url?: string | null) => {
    if (!url) {
      return (
        <View style={styles.imagePlaceholder}>
          <Text style={styles.imagePlaceholderText}>Gorsel yok</Text>
        </View>
      );
    }
    return <Image source={{ uri: url }} style={styles.previewImage} />;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.heroTop}>
            <View style={styles.heroText}>
              <Text style={styles.kicker}>Vitrin Operasyonu</Text>
              <Text style={styles.title}>Banner Yonetimi</Text>
              <Text style={styles.subtitle}>Musteri ana sayfasi vitrin gorsellerini web ile ayni hiyerarsiyle yonetin.</Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity style={[styles.secondaryButton, loading && styles.buttonDisabled]} onPress={fetchBanners} disabled={loading}>
                <Text style={styles.secondaryButtonText}>{loading ? 'Yukleniyor' : 'Yenile'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryButton, saving && styles.buttonDisabled]} onPress={openCreate} disabled={saving}>
                <Text style={styles.primaryButtonText}>Yeni Banner</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Toplam</Text>
              <Text style={styles.heroStatValue}>{summary.total}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Aktif</Text>
              <Text style={styles.heroStatValue}>{summary.active}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Mobil Hazir</Text>
              <Text style={styles.heroStatValue}>{summary.mobileReady}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>30 Gun Tik</Text>
              <Text style={styles.heroStatValue}>{summary.totalClicks}</Text>
            </View>
          </View>
        </View>

        {formOpen && (
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>{editing ? 'Banner Duzenle' : 'Yeni Banner'}</Text>
            <TextInput
              style={styles.input}
              value={String(form.title || '')}
              onChangeText={(value) => setForm((prev) => ({ ...prev, title: value }))}
              placeholder="Baslik"
              placeholderTextColor={colors.textMuted}
            />
            <TextInput
              style={[styles.input, styles.multiline]}
              value={String(form.subtitle || '')}
              onChangeText={(value) => setForm((prev) => ({ ...prev, subtitle: value }))}
              placeholder="Alt metin"
              placeholderTextColor={colors.textMuted}
              multiline
            />

            <View style={styles.segment}>
              {positions.map((position) => (
                <TouchableOpacity
                  key={position.value}
                  style={[styles.segmentButton, form.position === position.value && styles.segmentButtonActive]}
                  onPress={() => setForm((prev) => ({ ...prev, position: position.value }))}
                >
                  <Text style={form.position === position.value ? styles.segmentTextActive : styles.segmentText}>
                    {position.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.imageFormRow}>
              <View style={styles.imageFormBlock}>
                <Text style={styles.label}>Genis Gorsel</Text>
                {renderImagePreview(form.imageUrl)}
                <TouchableOpacity
                  style={[styles.outlineButton, Boolean(uploadingField) && styles.buttonDisabled]}
                  onPress={() => uploadImage('imageUrl')}
                  disabled={Boolean(uploadingField)}
                >
                  <Text style={styles.outlineButtonText}>{uploadingField === 'imageUrl' ? 'Yukleniyor...' : 'Yukle'}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.imageFormBlock}>
                <Text style={styles.label}>Mobil Gorsel</Text>
                {renderImagePreview(form.mobileImageUrl)}
                <TouchableOpacity
                  style={[styles.outlineButton, Boolean(uploadingField) && styles.buttonDisabled]}
                  onPress={() => uploadImage('mobileImageUrl')}
                  disabled={Boolean(uploadingField)}
                >
                  <Text style={styles.outlineButtonText}>{uploadingField === 'mobileImageUrl' ? 'Yukleniyor...' : 'Yukle'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TextInput
              style={styles.input}
              value={String(form.linkUrl || '')}
              onChangeText={(value) => setForm((prev) => ({ ...prev, linkUrl: value }))}
              placeholder="/products veya /discounted-products"
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.fieldRow}>
              <TextInput
                style={[styles.input, styles.flex]}
                value={String(form.productCode || '')}
                onChangeText={(value) => setForm((prev) => ({ ...prev, productCode: value }))}
                placeholder="Urun kodu"
                placeholderTextColor={colors.textMuted}
              />
              <TextInput
                style={[styles.input, styles.flex]}
                value={String(form.buttonText || '')}
                onChangeText={(value) => setForm((prev) => ({ ...prev, buttonText: value }))}
                placeholder="Buton metni"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={styles.fieldRow}>
              <TextInput
                style={[styles.input, styles.flex]}
                value={String(form.sortOrder ?? 0)}
                onChangeText={(value) => setForm((prev) => ({ ...prev, sortOrder: Number(value) || 0 }))}
                placeholder="Sira"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
              />
              <TouchableOpacity
                style={[styles.activeToggle, form.active && styles.activeToggleOn]}
                onPress={() => setForm((prev) => ({ ...prev, active: !prev.active }))}
              >
                <Text style={form.active ? styles.activeToggleTextOn : styles.activeToggleText}>
                  {form.active ? 'Aktif' : 'Pasif'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.fieldRow}>
              <TextInput
                style={[styles.input, styles.flex]}
                value={String(form.startsAt || '')}
                onChangeText={(value) => setForm((prev) => ({ ...prev, startsAt: value }))}
                placeholder="Baslangic YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
              />
              <TextInput
                style={[styles.input, styles.flex]}
                value={String(form.endsAt || '')}
                onChangeText={(value) => setForm((prev) => ({ ...prev, endsAt: value }))}
                placeholder="Bitis YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.headerActions}>
              <TouchableOpacity style={[styles.outlineButtonWide, saving && styles.buttonDisabled]} onPress={() => setFormOpen(false)} disabled={saving}>
                <Text style={styles.outlineButtonText}>Vazgec</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryButtonWide, (saving || Boolean(uploadingField)) && styles.buttonDisabled]} onPress={saveBanner} disabled={saving || Boolean(uploadingField)}>
                <Text style={styles.primaryButtonText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          grouped.map((group) => (
            <View key={group.value} style={styles.section}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>{group.label}</Text>
                  <Text style={styles.sectionHint}>{group.hint}</Text>
                </View>
                <Text style={styles.countPill}>{group.rows.length}</Text>
              </View>
              {group.rows.length === 0 ? (
                <Text style={styles.emptyText}>Bu pozisyonda banner yok.</Text>
              ) : (
                <View style={[styles.cardGrid, isWide && styles.cardGridWide]}>
                  {group.rows.map((banner) => (
                  <View key={banner.id} style={[styles.bannerCard, isWide && styles.gridCard]}>
                    {renderImagePreview(banner.mobileImageUrl || banner.imageUrl)}
                    <View style={styles.bannerText}>
                      <View style={styles.bannerTop}>
                        <Text style={styles.bannerTitle} numberOfLines={2}>{banner.title || '-'}</Text>
                        <Text style={[styles.statusPill, banner.active ? styles.statusActive : styles.statusPassive]}>
                          {banner.active ? 'Aktif' : 'Pasif'}
                        </Text>
                      </View>
                      {!!banner.subtitle && <Text style={styles.bannerSubtitle} numberOfLines={3}>{banner.subtitle}</Text>}
                      <Text style={styles.bannerMeta} numberOfLines={1}>
                        Sira: {banner.sortOrder ?? 0} - Tik: {clicks[banner.id] || 0}
                      </Text>
                      <Text style={styles.bannerMeta} numberOfLines={1}>
                        {banner.linkUrl || banner.productCode || 'Link yok'}
                      </Text>
                      <View style={styles.cardActions}>
                        <TouchableOpacity style={[styles.smallButton, mutatingId === banner.id && styles.buttonDisabled]} onPress={() => openEdit(banner)} disabled={mutatingId === banner.id}>
                          <Text style={styles.smallButtonText}>Duzenle</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.smallButton, mutatingId === banner.id && styles.buttonDisabled]} onPress={() => toggleActive(banner)} disabled={mutatingId === banner.id}>
                          <Text style={styles.smallButtonText}>{mutatingId === banner.id ? 'Isleniyor' : banner.active ? 'Pasif' : 'Aktif'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.smallDangerButton, mutatingId === banner.id && styles.buttonDisabled]} onPress={() => deleteBanner(banner)} disabled={mutatingId === banner.id}>
                          <Text style={styles.smallDangerText}>Sil</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                  ))}
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  header: {
    paddingVertical: spacing.xs,
    gap: spacing.md,
  },
  heroTop: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.lg, alignItems: 'flex-start' },
  heroText: { flex: 1, minWidth: 240, gap: spacing.xs },
  kicker: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: '#93C5FD', textTransform: 'uppercase' },
  title: { fontFamily: fonts.bold, fontSize: fontSizes.xxl, color: '#FFFFFF' },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSizes.md, color: '#DDE8FF', lineHeight: 22 },
  heroStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  heroStat: { flex: 1, minWidth: 118, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', borderRadius: radius.lg, padding: spacing.md, backgroundColor: 'rgba(255,255,255,0.08)' },
  heroStatLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: '#BCD2F7' },
  heroStatValue: { fontFamily: fonts.bold, fontSize: fontSizes.xl, color: '#FFFFFF', marginTop: spacing.xs },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  primaryButton: { backgroundColor: colors.primarySoft, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  primaryButtonText: { fontFamily: fonts.bold, color: '#FFFFFF' },
  secondaryButton: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  secondaryButtonText: { fontFamily: fonts.semibold, color: colors.primarySoft },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, alignItems: 'center' },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text },
  sectionHint: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
  countPill: {
    minWidth: 34,
    textAlign: 'center',
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontFamily: fonts.bold,
    color: colors.primarySoft,
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
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  segment: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  segmentButton: { flexGrow: 1, alignItems: 'center', borderRadius: radius.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  segmentButtonActive: { backgroundColor: colors.primary },
  segmentText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.textMuted },
  segmentTextActive: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: '#FFFFFF' },
  imageFormRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  imageFormBlock: { flex: 1, minWidth: 190, gap: spacing.xs },
  label: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.textMuted },
  previewImage: { width: '100%', height: 110, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  imagePlaceholder: {
    width: '100%',
    height: 110,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderText: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  outlineButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  outlineButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  fieldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flex: 1, minWidth: 150 },
  activeToggle: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  activeToggleOn: { backgroundColor: colors.successSoft, borderColor: '#86EFAC' },
  activeToggleText: { fontFamily: fonts.semibold, color: colors.textMuted },
  activeToggleTextOn: { fontFamily: fonts.semibold, color: colors.success },
  outlineButtonWide: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  primaryButtonWide: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  buttonDisabled: { opacity: 0.6 },
  error: { fontFamily: fonts.medium, color: colors.danger },
  loading: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { fontFamily: fonts.regular, color: colors.textMuted },
  cardGrid: { gap: spacing.md },
  cardGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  bannerCard: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  gridCard: { width: '48.7%' },
  bannerText: { gap: spacing.xs },
  bannerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  bannerTitle: { flex: 1, fontFamily: fonts.bold, fontSize: fontSizes.md, color: colors.text },
  bannerSubtitle: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.textMuted, lineHeight: 20 },
  bannerMeta: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  statusPill: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontFamily: fonts.bold,
    fontSize: fontSizes.xs,
  },
  statusActive: { backgroundColor: colors.successSoft, color: colors.success },
  statusPassive: { backgroundColor: colors.surfaceMuted, color: colors.textMuted },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  smallButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  smallButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.text },
  smallDangerButton: {
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.30)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.dangerSoft,
  },
  smallDangerText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.danger },
});
