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

import { AdminBundle, AdminBundleItem, BundleInputPayload, adminApi } from '../api/admin';
import { CategoryWithPriceRules, Product } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
import { normalizeSearchText } from '../utils/search';

type BundleImage = { uri: string; name: string; type: string; size?: number };

type FormState = {
  id: string;
  title: string;
  imageUrl: string;
  image: BundleImage | null;
  secondaryCategoryId: string;
  discountPercent: string;
  active: boolean;
  items: AdminBundleItem[];
};

const emptyForm: FormState = {
  id: '',
  title: '',
  imageUrl: '',
  image: null,
  secondaryCategoryId: '',
  discountPercent: '0',
  active: true,
  items: [],
};

const PUBLIC_BASE_URL = String(
  process.env.EXPO_PUBLIC_WEB_BASE_URL ||
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    'https://www.bakircilarkampanya.com'
).replace(/\/api\/?$/, '').replace(/\/$/, '');

const resolvePublicUrl = (value?: string | null) => {
  const url = String(value || '').trim();
  if (!url) return null;
  if (/^(https?:|data:|file:)/i.test(url)) return url;
  return `${PUBLIC_BASE_URL}${url.startsWith('/') ? url : `/${url}`}`;
};

const countMissingItems = (bundle: AdminBundle) => (bundle.items || []).filter((item) => item.missing).length;
const countDiscountItems = (bundle: AdminBundle) => (bundle.items || []).filter((item) => item.useDiscountedPrice).length;

export function BundlesScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 840;
  const [bundles, setBundles] = useState<AdminBundle[]>([]);
  const [categories, setCategories] = useState<CategoryWithPriceRules[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedBundleId, setExpandedBundleId] = useState<string | null>(null);
  const savingRef = useRef(false);
  const mutatingIdRef = useRef<string | null>(null);

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

  const bundleSummary = useMemo(() => {
    const totalItems = bundles.reduce((sum, bundle) => sum + (bundle.items?.length || 0), 0);
    return {
      total: bundles.length,
      active: bundles.filter((bundle) => bundle.active && !bundle.hiddenFromCustomers).length,
      passive: bundles.filter((bundle) => !bundle.active || bundle.hiddenFromCustomers).length,
      incomplete: bundles.filter((bundle) => !bundle.items?.length || countMissingItems(bundle) > 0).length,
      discounted: bundles.filter((bundle) => Number(bundle.discountPercent || 0) > 0 || countDiscountItems(bundle) > 0).length,
      avgItems: bundles.length ? Math.round((totalItems / bundles.length) * 10) / 10 : 0,
    };
  }, [bundles]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [bundleResponse, categoryResponse] = await Promise.all([
        adminApi.listBundles(),
        adminApi.getCategories().catch(() => ({ categories: [] as CategoryWithPriceRules[] })),
      ]);
      setBundles(bundleResponse.bundles || []);
      setCategories((categoryResponse.categories || []).filter((category) => normalizeSearchText(category.name) !== 'paketler'));
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Paketler yuklenemedi.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const handle = setTimeout(async () => {
      if (productSearch.trim().length < 2) {
        setProductResults([]);
        return;
      }
      setProductLoading(true);
      try {
        const response = await adminApi.getProducts({ search: productSearch.trim(), page: 1, limit: 30 });
        setProductResults(response.products || []);
      } catch {
        setProductResults([]);
      } finally {
        setProductLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [productSearch]);

  const closeForm = () => {
    setFormOpen(false);
    setForm(emptyForm);
    setProductSearch('');
    setProductResults([]);
  };

  const startCreate = () => {
    setForm(emptyForm);
    setFormOpen(true);
  };

  const startEdit = (bundle: AdminBundle) => {
    setForm({
      id: bundle.id,
      title: bundle.title || '',
      imageUrl: bundle.imageUrl || '',
      image: null,
      secondaryCategoryId: bundle.secondaryCategoryId || '',
      discountPercent: String(bundle.discountPercent ?? 0),
      active: bundle.active,
      items: (bundle.items || []).map((item) => ({
        id: item.id,
        productId: item.productId,
        quantity: Number(item.quantity || 1),
        useDiscountedPrice: Boolean(item.useDiscountedPrice),
        productName: item.productName,
        productCode: item.productCode,
        imageUrl: item.imageUrl,
        missing: item.missing,
      })),
    });
    setProductSearch('');
    setProductResults([]);
    setFormOpen(true);
  };

  const pickImage = async () => {
    if (saving) return;
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
    setForm((prev) => ({
      ...prev,
      image: {
        uri: asset.uri,
        name: asset.name || 'bundle.jpg',
        type: asset.mimeType || 'image/jpeg',
        size: asset.size,
      },
    }));
  };

  const addProduct = (product: Product) => {
    setForm((prev) => {
      const existing = prev.items.find((item) => item.productId === product.id);
      if (existing) {
        return {
          ...prev,
          items: prev.items.map((item) => item.productId === product.id
            ? { ...item, quantity: Number(item.quantity || 1) + 1 }
            : item),
        };
      }
      return {
        ...prev,
        items: [
          ...prev.items,
          {
            productId: product.id,
            quantity: 1,
            useDiscountedPrice: false,
            productName: product.name,
            productCode: product.mikroCode,
            imageUrl: product.imageUrl,
          },
        ],
      };
    });
  };

  const updateQuantity = (productId: string, value: string) => {
    const quantity = Math.max(1, Math.trunc(Number(value) || 1));
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item) => item.productId === productId ? { ...item, quantity } : item),
    }));
  };

  const toggleDiscounted = (productId: string) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item) => item.productId === productId
        ? { ...item, useDiscountedPrice: !item.useDiscountedPrice }
        : item),
    }));
  };

  const removeItem = (productId: string) => {
    setForm((prev) => ({ ...prev, items: prev.items.filter((item) => item.productId !== productId) }));
  };

  const buildPayload = (): BundleInputPayload => {
    const rawDiscount = Number(form.discountPercent);
    const discountPercent = Number.isFinite(rawDiscount) ? Math.min(100, Math.max(0, rawDiscount)) : 0;
    return {
      title: form.title.trim(),
      secondaryCategoryId: form.secondaryCategoryId || null,
      discountPercent,
      active: form.active,
      items: form.items.map((item) => ({
        productId: item.productId,
        quantity: Math.max(1, Math.trunc(Number(item.quantity)) || 1),
        useDiscountedPrice: Boolean(item.useDiscountedPrice),
      })),
    };
  };

  const saveBundle = async () => {
    if (savingRef.current) return;
    if (!form.title.trim()) {
      Alert.alert('Eksik Bilgi', 'Paket basligi gerekli.');
      return;
    }
    if (form.items.length === 0) {
      Alert.alert('Eksik Bilgi', 'En az bir bilesen urun ekleyin.');
      return;
    }
    if (!form.id && !form.image) {
      Alert.alert('Eksik Bilgi', 'Yeni paket icin gorsel zorunlu.');
      return;
    }
    if (!beginSaving()) return;
    try {
      const payload = buildPayload();
      if (form.id) {
        await adminApi.updateBundle(form.id, payload, form.image);
      } else if (form.image) {
        await adminApi.createBundle(payload, form.image);
      }
      closeForm();
      await fetchData();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Paket kaydedilemedi.'));
    } finally {
      endSaving();
    }
  };

  const deleteBundle = (bundle: AdminBundle) => {
    if (mutatingIdRef.current) return;
    Alert.alert('Paket Sil', `"${bundle.title}" silinsin mi?`, [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          if (!beginMutating(bundle.id)) return;
          try {
            await adminApi.deleteBundle(bundle.id);
            setBundles((prev) => prev.filter((item) => item.id !== bundle.id));
          } catch (err: any) {
            Alert.alert('Hata', getApiErrorMessage(err, 'Paket silinemedi.'));
          } finally {
            endMutating();
          }
        },
      },
    ]);
  };

  const renderImage = (uri?: string | null) => {
    if (!uri) {
      return (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Gorsel yok</Text>
        </View>
      );
    }
    return <Image source={{ uri: resolvePublicUrl(uri) || uri }} style={styles.image} resizeMode="contain" />;
  };

  const currentImageUri = form.image?.uri || form.imageUrl;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Katalog Operasyonu</Text>
          <Text style={styles.title}>Paketler</Text>
          <Text style={styles.subtitle}>Bilesen urunlerden olusan paketleri mobilde olusturun ve yonetin.</Text>
          <View style={styles.heroMetricRow}>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{bundleSummary.total}</Text>
              <Text style={styles.heroMetricLabel}>Toplam</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={[styles.heroMetricValue, styles.heroMetricGood]}>{bundleSummary.active}</Text>
              <Text style={styles.heroMetricLabel}>Aktif</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={[styles.heroMetricValue, bundleSummary.incomplete > 0 && styles.heroMetricDanger]}>{bundleSummary.incomplete}</Text>
              <Text style={styles.heroMetricLabel}>Riskli</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{bundleSummary.avgItems}</Text>
              <Text style={styles.heroMetricLabel}>Ort. Bilesen</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={[styles.secondaryButton, loading && styles.buttonDisabled]} onPress={fetchData} disabled={loading}>
              <Text style={styles.secondaryButtonText}>{loading ? 'Yukleniyor' : 'Yenile'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.primaryButton, saving && styles.buttonDisabled]} onPress={startCreate} disabled={saving}>
              <Text style={styles.primaryButtonText}>Yeni Paket</Text>
            </TouchableOpacity>
          </View>
        </View>

        {formOpen && (
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>{form.id ? 'Paket Duzenle' : 'Yeni Paket'}</Text>
            <TextInput style={styles.input} value={form.title} onChangeText={(value) => setForm((prev) => ({ ...prev, title: value }))} placeholder="Paket basligi" placeholderTextColor={colors.textMuted} />

            <View style={styles.imagePicker}>
              {renderImage(currentImageUri)}
              <View style={styles.imageText}>
                <Text style={styles.label}>Paket gorseli {form.id ? '(opsiyonel)' : '*'}</Text>
                <Text style={styles.helper}>{form.id ? 'Yeni gorsel secmezseniz mevcut gorsel korunur.' : 'Yeni paket icin gorsel zorunlu. Maksimum 5MB.'}</Text>
                <TouchableOpacity style={[styles.outlineButton, saving && styles.buttonDisabled]} onPress={pickImage} disabled={saving}>
                  <Text style={styles.outlineButtonText}>{form.image ? 'Gorsel degistir' : 'Gorsel sec'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.fieldRow}>
              <TextInput style={[styles.input, styles.flex]} value={form.discountPercent} onChangeText={(value) => setForm((prev) => ({ ...prev, discountPercent: value }))} placeholder="Iskonto %" keyboardType="decimal-pad" placeholderTextColor={colors.textMuted} />
              <TouchableOpacity style={[styles.activeToggle, form.active && styles.activeToggleOn]} onPress={() => setForm((prev) => ({ ...prev, active: !prev.active }))}>
                <Text style={form.active ? styles.activeToggleTextOn : styles.activeToggleText}>{form.active ? 'Aktif' : 'Pasif'}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Ikinci kategori</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
              <TouchableOpacity style={[styles.categoryChip, !form.secondaryCategoryId && styles.categoryChipActive]} onPress={() => setForm((prev) => ({ ...prev, secondaryCategoryId: '' }))}>
                <Text style={!form.secondaryCategoryId ? styles.categoryChipTextActive : styles.categoryChipText}>Yok</Text>
              </TouchableOpacity>
              {categories.map((category) => (
                <TouchableOpacity key={category.id} style={[styles.categoryChip, form.secondaryCategoryId === category.id && styles.categoryChipActive]} onPress={() => setForm((prev) => ({ ...prev, secondaryCategoryId: category.id }))}>
                  <Text style={form.secondaryCategoryId === category.id ? styles.categoryChipTextActive : styles.categoryChipText}>{category.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.label}>Paket icerigi</Text>
            {form.items.length === 0 ? <Text style={styles.emptyText}>Bilesen urun yok.</Text> : null}
            {form.items.map((item) => (
              <View key={item.productId} style={styles.itemRow}>
                <View style={styles.productThumb}>{item.imageUrl ? <Image source={{ uri: resolvePublicUrl(item.imageUrl) || item.imageUrl }} style={styles.thumbImage} /> : null}</View>
                <View style={styles.itemText}>
                  <Text style={styles.itemTitle} numberOfLines={2} ellipsizeMode="tail">{item.productName || item.productCode || item.productId}</Text>
                  <Text style={styles.itemMeta} numberOfLines={1} ellipsizeMode="middle">{item.productCode || item.productId}</Text>
                  {item.missing ? <Text style={styles.missingText}>Urun bulunamadi</Text> : null}
                </View>
                <TextInput style={styles.qtyInput} value={String(item.quantity || 1)} onChangeText={(value) => updateQuantity(item.productId, value)} keyboardType="number-pad" />
                <TouchableOpacity style={[styles.discountChip, item.useDiscountedPrice && styles.discountChipActive]} onPress={() => toggleDiscounted(item.productId)}>
                  <Text style={item.useDiscountedPrice ? styles.discountTextActive : styles.discountText}>Ind.</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.removeButton} onPress={() => removeItem(item.productId)}>
                  <Text style={styles.removeButtonText}>Sil</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TextInput style={styles.input} value={productSearch} onChangeText={setProductSearch} placeholder="Bilesen urun ara" placeholderTextColor={colors.textMuted} />
            {productLoading ? <ActivityIndicator color={colors.primary} /> : null}
            {productResults.slice(0, 10).map((product) => (
              <TouchableOpacity key={product.id} style={styles.productResult} onPress={() => addProduct(product)}>
                <View style={styles.productThumb}>{product.imageUrl ? <Image source={{ uri: resolvePublicUrl(product.imageUrl) || product.imageUrl }} style={styles.thumbImage} /> : null}</View>
                <View style={styles.itemText}>
                  <Text style={styles.productTitle} numberOfLines={2} ellipsizeMode="tail">{product.name}</Text>
                  <Text style={styles.productMeta} numberOfLines={1} ellipsizeMode="middle">{product.mikroCode}</Text>
                </View>
              </TouchableOpacity>
            ))}

            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.outlineButtonWide} onPress={closeForm} disabled={saving}>
                <Text style={styles.outlineButtonText}>Vazgec</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryButtonWide, saving && styles.buttonDisabled]} onPress={saveBundle} disabled={saving}>
                <Text style={styles.primaryButtonText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
        ) : bundles.length === 0 ? (
          <Text style={styles.emptyText}>Paket yok.</Text>
        ) : (
          <View style={isWide ? styles.bundleGrid : undefined}>
            {bundles.map((bundle) => {
              const missingCount = countMissingItems(bundle);
              const discountedCount = countDiscountItems(bundle);
              const itemCount = bundle.items?.length || 0;
              const isExpanded = expandedBundleId === bundle.id;
              const isRisky = missingCount > 0 || itemCount === 0 || !bundle.active || bundle.hiddenFromCustomers;
              const isMutating = mutatingId === bundle.id;

              return (
                <View key={bundle.id} style={[styles.bundleCard, isWide && styles.bundleGridItem, isRisky && styles.bundleCardRisk]}>
                  <View style={styles.bundleImage}>{renderImage(bundle.imageUrl)}</View>
                  <View style={styles.bundleTop}>
                    <View style={styles.bundleText}>
                      <Text style={styles.bundleTitle} numberOfLines={2} ellipsizeMode="tail">{bundle.title}</Text>
                      <Text style={styles.bundleMeta} numberOfLines={1} ellipsizeMode="middle">Kod: {bundle.code} - {itemCount} bilesen</Text>
                      {bundle.discountPercent > 0 ? <Text style={styles.bundleMeta}>Paket iskontosu: %{bundle.discountPercent}</Text> : null}
                    </View>
                    <Text style={[styles.statusPill, bundle.active && !bundle.hiddenFromCustomers ? styles.statusActive : styles.statusPassive]}>
                      {bundle.active && !bundle.hiddenFromCustomers ? 'Aktif' : 'Pasif'}
                    </Text>
                  </View>
                  <View style={styles.healthRow}>
                    <View style={styles.healthCell}>
                      <Text style={styles.healthLabel}>Bilesen</Text>
                      <Text style={styles.healthValue}>{itemCount}</Text>
                    </View>
                    <View style={styles.healthCell}>
                      <Text style={styles.healthLabel}>Eksik</Text>
                      <Text style={[styles.healthValue, missingCount > 0 && styles.dangerText]}>{missingCount}</Text>
                    </View>
                    <View style={styles.healthCell}>
                      <Text style={styles.healthLabel}>Indirimli</Text>
                      <Text style={styles.healthValue}>{discountedCount}</Text>
                    </View>
                  </View>
                  {isRisky ? (
                    <Text style={styles.riskHint}>
                      {missingCount > 0
                        ? 'Eksik bilesen var; musteriye sorunlu paket gitmeden duzeltin.'
                        : !bundle.active || bundle.hiddenFromCustomers
                          ? 'Paket musteri gorunumunde kapali.'
                          : 'Paket icerigi bos.'}
                    </Text>
                  ) : null}
                  <View style={styles.cardActions}>
                    <TouchableOpacity style={styles.smallButton} onPress={() => setExpandedBundleId(isExpanded ? null : bundle.id)}>
                      <Text style={styles.smallButtonText}>{isExpanded ? 'Detayi Kapat' : 'Icerik/Saglik'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.smallButton, isMutating && styles.buttonDisabled]} onPress={() => startEdit(bundle)} disabled={isMutating}>
                      <Text style={styles.smallButtonText}>Duzenle</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.smallDangerButton, isMutating && styles.buttonDisabled]} onPress={() => deleteBundle(bundle)} disabled={isMutating}>
                      <Text style={styles.smallDangerText}>{isMutating ? 'Isleniyor' : 'Sil'}</Text>
                    </TouchableOpacity>
                  </View>
                  {isExpanded && (
                    <View style={styles.bundleDetailPanel}>
                      <Text style={styles.detailTitle}>Paket Icerigi</Text>
                      {bundle.items?.length ? bundle.items.map((item) => (
                        <View key={item.id || item.productId} style={styles.bundleItemLine}>
                          <View style={styles.productThumb}>{item.imageUrl ? <Image source={{ uri: resolvePublicUrl(item.imageUrl) || item.imageUrl }} style={styles.thumbImage} /> : null}</View>
                          <View style={styles.itemText}>
                            <Text style={styles.itemTitle} numberOfLines={2} ellipsizeMode="tail">{item.productName || item.productCode || item.productId}</Text>
                            <Text style={styles.itemMeta} numberOfLines={2} ellipsizeMode="tail">
                              {item.productCode || item.productId} - {Number(item.quantity || 1)} adet
                              {item.useDiscountedPrice ? ' - indirimli bilesen fiyati' : ''}
                            </Text>
                            {item.missing ? <Text style={styles.missingText}>Bilesen urun eksik/pasif</Text> : null}
                          </View>
                        </View>
                      )) : <Text style={styles.emptyText}>Bu pakette bilesen yok.</Text>}
                    </View>
                  )}
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
  header: {
    paddingVertical: spacing.xs,
    gap: spacing.md,
  },
  kicker: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#9EC5FF',
    textTransform: 'uppercase',
  },
  title: { fontFamily: fonts.bold, fontSize: fontSizes.xxl, color: '#FFFFFF' },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSizes.md, color: '#DDE8FF', lineHeight: 22 },
  heroMetricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  heroMetric: {
    flexGrow: 1,
    minWidth: 96,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(221,232,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: spacing.sm,
  },
  heroMetricValue: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: '#FFFFFF' },
  heroMetricGood: { color: '#BBF7D0' },
  heroMetricDanger: { color: '#FECACA' },
  heroMetricLabel: { marginTop: 2, fontFamily: fonts.medium, fontSize: fontSizes.xs, color: '#BFD7FF' },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  primaryButton: { backgroundColor: colors.primarySoft, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  primaryButtonText: { fontFamily: fonts.bold, color: '#FFFFFF' },
  secondaryButton: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  secondaryButtonText: { fontFamily: fonts.semibold, color: colors.primarySoft },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  summaryCard: { flexGrow: 1, minWidth: 142, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  summaryLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  summaryValue: { fontFamily: fonts.bold, fontSize: fontSizes.xl, color: colors.text, marginTop: spacing.xs },
  successText: { color: colors.success },
  dangerText: { color: colors.danger },
  formCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border, fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.text },
  fieldRow: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  label: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.textMuted },
  helper: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted, lineHeight: 18 },
  imagePicker: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  imageText: { flex: 1, gap: spacing.xs },
  image: { width: '100%', height: '100%' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  placeholderText: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  outlineButton: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: 'center', paddingVertical: spacing.sm, backgroundColor: colors.surface },
  outlineButtonText: { fontFamily: fonts.semibold, color: colors.text },
  activeToggle: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  activeToggleOn: { backgroundColor: colors.successSoft, borderColor: '#86EFAC' },
  activeToggleText: { fontFamily: fonts.semibold, color: colors.textMuted },
  activeToggleTextOn: { fontFamily: fonts.semibold, color: colors.success },
  categoryRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  categoryChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  categoryChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryChipText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.textMuted },
  categoryChipTextActive: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: '#FFFFFF' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.surfaceMuted },
  productThumb: { width: 38, height: 38, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  thumbImage: { width: '100%', height: '100%' },
  itemText: { flex: 1, minWidth: 0 },
  itemTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  itemMeta: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  missingText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.danger },
  qtyInput: { width: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs, textAlign: 'center', fontFamily: fonts.semibold, color: colors.text },
  discountChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: colors.surface },
  discountChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  discountText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.textMuted },
  discountTextActive: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: '#FFFFFF' },
  removeButton: { borderRadius: radius.sm, backgroundColor: colors.dangerSoft, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  removeButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.danger },
  productResult: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surface },
  productTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  productMeta: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  outlineButtonWide: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: 'center', paddingVertical: spacing.md, backgroundColor: colors.surface },
  primaryButtonWide: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: 'center', paddingVertical: spacing.md },
  buttonDisabled: { opacity: 0.6 },
  error: { fontFamily: fonts.medium, color: colors.danger },
  loading: { alignItems: 'center', padding: spacing.xl },
  emptyText: { fontFamily: fonts.regular, color: colors.textMuted },
  bundleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  bundleGridItem: { width: '48.5%' },
  bundleCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  bundleCardRisk: { borderColor: '#FCA5A5', backgroundColor: colors.dangerSoft },
  bundleImage: { width: '100%', height: 132, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  bundleTop: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  bundleText: { flex: 1, minWidth: 0 },
  bundleTitle: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: colors.text },
  bundleMeta: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  healthRow: { flexDirection: 'row', gap: spacing.sm },
  healthCell: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.sm },
  healthLabel: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  healthValue: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: colors.text, marginTop: 2 },
  riskHint: { borderRadius: radius.md, backgroundColor: colors.dangerSoft, padding: spacing.sm, fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.danger, lineHeight: 18 },
  bundleDetailPanel: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.sm, gap: spacing.sm },
  detailTitle: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.text },
  bundleItemLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, padding: spacing.sm },
  statusPill: { overflow: 'hidden', borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, fontFamily: fonts.bold, fontSize: fontSizes.xs },
  statusActive: { backgroundColor: colors.successSoft, color: colors.success },
  statusPassive: { backgroundColor: colors.surfaceMuted, color: colors.textMuted },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  smallButton: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  smallButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.text },
  smallDangerButton: { borderWidth: 1, borderColor: 'rgba(248,113,113,0.30)', borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.dangerSoft },
  smallDangerText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.danger },
});
