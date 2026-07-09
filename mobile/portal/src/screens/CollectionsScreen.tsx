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

import {
  AdminCollection,
  CollectionRuleType,
  CollectionSourceType,
  GiftCampaignTargetType,
  adminApi,
} from '../api/admin';
import { CategoryWithPriceRules, Product } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
import { normalizeSearchText } from '../utils/search';

type PickedProduct = {
  productId: string;
  name?: string;
  mikroCode?: string;
  imageUrl?: string | null;
};

type FormState = {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  color: string;
  sortOrder: string;
  sourceType: CollectionSourceType;
  ruleType: CollectionRuleType;
  categoryId: string;
  products: PickedProduct[];
  targetType: GiftCampaignTargetType;
  targetSectorCodes: string;
  targetUserIds: string;
  active: boolean;
  validFrom: string;
  validTo: string;
};

const sourceOptions: Array<{ value: CollectionSourceType; label: string }> = [
  { value: 'RULE', label: 'Kurala gore' },
  { value: 'MANUAL', label: 'Elle urun sec' },
];

const ruleOptions: Array<{ value: CollectionRuleType; label: string }> = [
  { value: 'category', label: 'Kategori' },
  { value: 'bestseller', label: 'Cok satanlar' },
  { value: 'discounted', label: 'Indirimli' },
  { value: 'new', label: 'Yeni urunler' },
];

const targetOptions: Array<{ value: GiftCampaignTargetType; label: string }> = [
  { value: 'all', label: 'Herkes' },
  { value: 'segment', label: 'Sektor' },
  { value: 'account', label: 'Cari' },
];

const colorPresets = [
  { label: 'Yesil', value: 'linear-gradient(150deg,#047857,#0a9d6b)' },
  { label: 'Lacivert', value: 'linear-gradient(150deg,#15356b,#1c4a8f)' },
  { label: 'Mor', value: 'linear-gradient(150deg,#7c3aed,#9560f0)' },
  { label: 'Turuncu', value: 'linear-gradient(150deg,#b45309,#e07b12)' },
  { label: 'Gri', value: 'linear-gradient(150deg,#334155,#64748b)' },
];

const emptyForm: FormState = {
  id: '',
  title: '',
  subtitle: '',
  imageUrl: '',
  color: '',
  sortOrder: '0',
  sourceType: 'RULE',
  ruleType: 'category',
  categoryId: '',
  products: [],
  targetType: 'all',
  targetSectorCodes: '',
  targetUserIds: '',
  active: true,
  validFrom: '',
  validTo: '',
};

const toDateText = (value?: string | null) => value ? value.split('T')[0] || '' : '';
const toIsoOrNull = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const splitCodes = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);
const previewColor = (value?: string | null) => value?.match(/#[0-9a-fA-F]{6}/)?.[0] || colors.primary;

export function CollectionsScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 840;
  const [collections, setCollections] = useState<AdminCollection[]>([]);
  const [categories, setCategories] = useState<CategoryWithPriceRules[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [categorySearch, setCategorySearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const mutatingIdRef = useRef<string | null>(null);
  const fetchSeqRef = useRef(0);
  const productSearchSeqRef = useRef(0);

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

  const fetchCollections = async () => {
    const requestSeq = ++fetchSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const [collectionResponse, categoryResponse] = await Promise.all([
        adminApi.getCollections(),
        adminApi.getCategories().catch(() => ({ categories: [] as CategoryWithPriceRules[] })),
      ]);
      if (requestSeq !== fetchSeqRef.current) return;
      setCollections(collectionResponse.collections || []);
      setCategories(categoryResponse.categories || []);
    } catch (err: any) {
      if (requestSeq === fetchSeqRef.current) {
        setError(getApiErrorMessage(err, 'Koleksiyonlar yuklenemedi.'));
      }
    } finally {
      if (requestSeq === fetchSeqRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchCollections();
  }, []);

  useEffect(() => {
    const handle = setTimeout(async () => {
      if (productSearch.trim().length < 2) {
        productSearchSeqRef.current += 1;
        setProductResults([]);
        setProductLoading(false);
        return;
      }
      const term = productSearch.trim();
      const requestSeq = ++productSearchSeqRef.current;
      setProductLoading(true);
      try {
        const response = await adminApi.getProducts({ search: term, page: 1, limit: 30 });
        if (requestSeq === productSearchSeqRef.current) {
          setProductResults(response.products || []);
        }
      } catch {
        if (requestSeq === productSearchSeqRef.current) {
          setProductResults([]);
        }
      } finally {
        if (requestSeq === productSearchSeqRef.current) {
          setProductLoading(false);
        }
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [productSearch]);

  const activeCount = useMemo(() => collections.filter((item) => item.active).length, [collections]);
  const manualCount = useMemo(() => collections.filter((item) => item.sourceType === 'MANUAL').length, [collections]);
  const productCount = useMemo(
    () => collections.reduce((sum, item) => sum + (item.productIds?.length || 0), 0),
    [collections]
  );

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === form.categoryId),
    [categories, form.categoryId]
  );

  const categoryResults = useMemo(() => {
    const term = normalizeSearchText(categorySearch);
    if (!term) return categories.slice(0, 8);
    return categories
      .filter((category) => normalizeSearchText(`${category.name} ${category.mikroCode || ''}`).includes(term))
      .slice(0, 12);
  }, [categories, categorySearch]);

  const startCreate = () => {
    setForm(emptyForm);
    setCategorySearch('');
    setProductSearch('');
    setProductResults([]);
    setFormOpen(true);
  };

  const startEdit = (collection: AdminCollection) => {
    setForm({
      id: collection.id,
      title: collection.title || '',
      subtitle: collection.subtitle || '',
      imageUrl: collection.imageUrl || '',
      color: collection.color || '',
      sortOrder: String(collection.sortOrder || 0),
      sourceType: collection.sourceType || 'RULE',
      ruleType: collection.ruleType || 'category',
      categoryId: collection.categoryId || '',
      products: (collection.productIds || []).map((productId) => ({ productId })),
      targetType: collection.targetType || 'all',
      targetSectorCodes: (collection.targetSectorCodes || []).join(', '),
      targetUserIds: (collection.targetUserIds || []).join(', '),
      active: collection.active,
      validFrom: toDateText(collection.validFrom),
      validTo: toDateText(collection.validTo),
    });
    setCategorySearch('');
    setProductSearch('');
    setProductResults([]);
    setFormOpen(true);
  };

  const addProduct = (product: Product) => {
    const item: PickedProduct = {
      productId: product.id,
      name: product.name,
      mikroCode: product.mikroCode,
      imageUrl: product.imageUrl,
    };
    setForm((prev) => prev.products.some((picked) => picked.productId === product.id)
      ? prev
      : { ...prev, products: [...prev.products, item] });
  };

  const removeProduct = (productId: string) => {
    setForm((prev) => ({ ...prev, products: prev.products.filter((item) => item.productId !== productId) }));
  };

  const buildPayload = () => ({
    title: form.title.trim(),
    subtitle: form.subtitle.trim() || null,
    imageUrl: form.imageUrl.trim() || null,
    color: form.color.trim() || null,
    sortOrder: Number.isFinite(Number(form.sortOrder)) ? Math.trunc(Number(form.sortOrder)) : 0,
    sourceType: form.sourceType,
    ruleType: form.sourceType === 'RULE' ? form.ruleType : null,
    categoryId: form.sourceType === 'RULE' && form.ruleType === 'category' ? form.categoryId || null : null,
    productIds: form.sourceType === 'MANUAL' ? form.products.map((item) => item.productId) : [],
    targetType: form.targetType,
    targetSectorCodes: form.targetType === 'segment' ? splitCodes(form.targetSectorCodes) : [],
    targetUserIds: form.targetType === 'account' ? splitCodes(form.targetUserIds) : [],
    active: form.active,
    validFrom: toIsoOrNull(form.validFrom),
    validTo: toIsoOrNull(form.validTo),
  });

  const saveCollection = async () => {
    if (savingRef.current) return;
    if (!form.title.trim()) {
      Alert.alert('Eksik Bilgi', 'Koleksiyon basligi gerekli.');
      return;
    }
    if (form.sourceType === 'RULE' && form.ruleType === 'category' && !form.categoryId) {
      Alert.alert('Eksik Bilgi', 'Kategori kurali icin kategori secin.');
      return;
    }
    if (form.sourceType === 'MANUAL' && form.products.length === 0) {
      Alert.alert('Eksik Bilgi', 'Elle secilen koleksiyon icin en az bir urun ekleyin.');
      return;
    }
    if (!beginSaving()) return;
    try {
      const payload = buildPayload();
      if (form.id) {
        await adminApi.updateCollection(form.id, payload);
      } else {
        await adminApi.createCollection(payload);
      }
      setFormOpen(false);
      setForm(emptyForm);
      await fetchCollections();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Koleksiyon kaydedilemedi.'));
    } finally {
      endSaving();
    }
  };

  const toggleActive = async (collection: AdminCollection) => {
    if (!beginMutating(collection.id)) return;
    try {
      await adminApi.updateCollection(collection.id, { title: collection.title, active: !collection.active });
      setCollections((prev) => prev.map((item) => item.id === collection.id ? { ...item, active: !item.active } : item));
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Durum degistirilemedi.'));
    } finally {
      endMutating();
    }
  };

  const deleteCollection = (collection: AdminCollection) => {
    if (mutatingIdRef.current) return;
    Alert.alert('Koleksiyon Sil', `"${collection.title}" silinsin mi?`, [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          if (!beginMutating(collection.id)) return;
          try {
            await adminApi.deleteCollection(collection.id);
            setCollections((prev) => prev.filter((item) => item.id !== collection.id));
          } catch (err: any) {
            Alert.alert('Hata', getApiErrorMessage(err, 'Koleksiyon silinemedi.'));
          } finally {
            endMutating();
          }
        },
      },
    ]);
  };

  const renderPickedProducts = () => (
    <View style={styles.pickedList}>
      {form.products.length === 0 ? <Text style={styles.emptyText}>Urun secilmedi.</Text> : null}
      {form.products.map((item) => (
        <View key={item.productId} style={styles.pickedRow}>
          <View style={styles.productThumb}>
            {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.productImage} /> : null}
          </View>
          <View style={styles.pickedText}>
            <Text style={styles.pickedTitle} numberOfLines={2}>{item.name || item.productId}</Text>
            <Text style={styles.pickedMeta} numberOfLines={1}>{item.mikroCode || item.productId}</Text>
          </View>
          <TouchableOpacity style={styles.removeButton} onPress={() => removeProduct(item.productId)}>
            <Text style={styles.removeButtonText}>Sil</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.heroTop}>
            <View style={styles.heroText}>
              <Text style={styles.kicker}>Katalog Vitrini</Text>
              <Text style={styles.title}>Koleksiyonlar</Text>
              <Text style={styles.subtitle}>Musteri ana sayfasindaki Sizin icin koleksiyonlar alanini mobilde web kalitesinde yonetin.</Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity style={[styles.secondaryButton, loading && styles.buttonDisabled]} onPress={fetchCollections} disabled={loading}>
                <Text style={styles.secondaryButtonText}>{loading ? 'Yukleniyor' : 'Yenile'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryButton, saving && styles.buttonDisabled]} onPress={startCreate} disabled={saving}>
                <Text style={styles.primaryButtonText}>Yeni Koleksiyon</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Toplam</Text>
              <Text style={styles.heroStatValue}>{collections.length}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Aktif</Text>
              <Text style={styles.heroStatValue}>{activeCount}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Elle Secim</Text>
              <Text style={styles.heroStatValue}>{manualCount}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Urun</Text>
              <Text style={styles.heroStatValue}>{productCount}</Text>
            </View>
          </View>
        </View>

        {formOpen && (
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>{form.id ? 'Koleksiyon Duzenle' : 'Yeni Koleksiyon'}</Text>
            <TextInput style={styles.input} value={form.title} onChangeText={(value) => setForm((prev) => ({ ...prev, title: value }))} placeholder="Baslik" placeholderTextColor={colors.textMuted} />
            <TextInput style={[styles.input, styles.multiline]} value={form.subtitle} onChangeText={(value) => setForm((prev) => ({ ...prev, subtitle: value }))} placeholder="Alt metin" placeholderTextColor={colors.textMuted} multiline />

            <Text style={styles.label}>Kaynak</Text>
            <View style={styles.segment}>
              {sourceOptions.map((option) => (
                <TouchableOpacity key={option.value} style={[styles.segmentButton, form.sourceType === option.value && styles.segmentButtonActive]} onPress={() => setForm((prev) => ({ ...prev, sourceType: option.value }))}>
                  <Text style={form.sourceType === option.value ? styles.segmentTextActive : styles.segmentText}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {form.sourceType === 'RULE' && (
              <>
                <Text style={styles.label}>Kural</Text>
                <View style={styles.segment}>
                  {ruleOptions.map((option) => (
                    <TouchableOpacity key={option.value} style={[styles.segmentButton, form.ruleType === option.value && styles.segmentButtonActive]} onPress={() => setForm((prev) => ({ ...prev, ruleType: option.value }))}>
                      <Text style={form.ruleType === option.value ? styles.segmentTextActive : styles.segmentText}>{option.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {form.sourceType === 'RULE' && form.ruleType === 'category' && (
              <View style={styles.subSection}>
                <Text style={styles.label}>Kategori</Text>
                {selectedCategory ? <Text style={styles.selectedText}>Secili: {selectedCategory.name}</Text> : null}
                <TextInput style={styles.input} value={categorySearch} onChangeText={setCategorySearch} placeholder="Kategori ara" placeholderTextColor={colors.textMuted} />
                {categoryResults.map((category) => (
                  <TouchableOpacity key={category.id} style={[styles.resultRow, form.categoryId === category.id && styles.resultRowActive]} onPress={() => setForm((prev) => ({ ...prev, categoryId: category.id }))}>
                    <Text style={styles.resultTitle} numberOfLines={2}>{category.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {form.sourceType === 'MANUAL' && (
              <View style={styles.subSection}>
                <Text style={styles.label}>Koleksiyon Urunleri</Text>
                {renderPickedProducts()}
                <TextInput style={styles.input} value={productSearch} onChangeText={setProductSearch} placeholder="Urun ara" placeholderTextColor={colors.textMuted} />
                {productLoading ? <ActivityIndicator color={colors.primary} /> : null}
                {productResults.slice(0, 10).map((product) => (
                  <TouchableOpacity key={product.id} style={styles.productResult} onPress={() => addProduct(product)}>
                    <View style={styles.productThumb}>
                      {product.imageUrl ? <Image source={{ uri: product.imageUrl }} style={styles.productImage} /> : null}
                    </View>
                    <View style={styles.pickedText}>
                      <Text style={styles.productTitle} numberOfLines={2}>{product.name}</Text>
                      <Text style={styles.productMeta} numberOfLines={1}>{product.mikroCode}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.label}>Hedefleme</Text>
            <View style={styles.segment}>
              {targetOptions.map((option) => (
                <TouchableOpacity key={option.value} style={[styles.segmentButton, form.targetType === option.value && styles.segmentButtonActive]} onPress={() => setForm((prev) => ({ ...prev, targetType: option.value }))}>
                  <Text style={form.targetType === option.value ? styles.segmentTextActive : styles.segmentText}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {form.targetType === 'segment' && (
              <TextInput style={styles.input} value={form.targetSectorCodes} onChangeText={(value) => setForm((prev) => ({ ...prev, targetSectorCodes: value }))} placeholder="Sektor kodlari, virgulle" placeholderTextColor={colors.textMuted} />
            )}
            {form.targetType === 'account' && (
              <TextInput style={styles.input} value={form.targetUserIds} onChangeText={(value) => setForm((prev) => ({ ...prev, targetUserIds: value }))} placeholder="Musteri user ID'leri, virgulle" placeholderTextColor={colors.textMuted} />
            )}

            <View style={styles.fieldRow}>
              <TextInput style={[styles.input, styles.flex]} value={form.sortOrder} onChangeText={(value) => setForm((prev) => ({ ...prev, sortOrder: value }))} placeholder="Sira" keyboardType="number-pad" placeholderTextColor={colors.textMuted} />
              <TextInput style={[styles.input, styles.flex]} value={form.validFrom} onChangeText={(value) => setForm((prev) => ({ ...prev, validFrom: value }))} placeholder="Baslangic YYYY-MM-DD" placeholderTextColor={colors.textMuted} />
            </View>
            <TextInput style={styles.input} value={form.validTo} onChangeText={(value) => setForm((prev) => ({ ...prev, validTo: value }))} placeholder="Bitis YYYY-MM-DD" placeholderTextColor={colors.textMuted} />

            <TextInput style={styles.input} value={form.imageUrl} onChangeText={(value) => setForm((prev) => ({ ...prev, imageUrl: value }))} placeholder="Gorsel URL" placeholderTextColor={colors.textMuted} />
            {form.imageUrl ? <Image source={{ uri: form.imageUrl }} style={styles.previewImage} resizeMode="cover" /> : null}
            <Text style={styles.label}>Gorsel yoksa renk</Text>
            <View style={styles.colorRow}>
              <TouchableOpacity style={[styles.colorDot, !form.color && styles.colorDotActive, { backgroundColor: '#FFFFFF' }]} onPress={() => setForm((prev) => ({ ...prev, color: '' }))}>
                <Text style={styles.colorDash}>-</Text>
              </TouchableOpacity>
              {colorPresets.map((preset) => (
                <TouchableOpacity key={preset.value} style={[styles.colorDot, form.color === preset.value && styles.colorDotActive, { backgroundColor: previewColor(preset.value) }]} onPress={() => setForm((prev) => ({ ...prev, color: preset.value }))} />
              ))}
            </View>

            <TouchableOpacity style={[styles.activeToggle, form.active && styles.activeToggleOn]} onPress={() => setForm((prev) => ({ ...prev, active: !prev.active }))}>
              <Text style={form.active ? styles.activeToggleTextOn : styles.activeToggleText}>{form.active ? 'Aktif' : 'Pasif'}</Text>
            </TouchableOpacity>

            <View style={styles.headerActions}>
              <TouchableOpacity style={[styles.outlineButtonWide, saving && styles.buttonDisabled]} onPress={() => setFormOpen(false)} disabled={saving}>
                <Text style={styles.outlineButtonText}>Vazgec</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryButtonWide, saving && styles.buttonDisabled]} onPress={saveCollection} disabled={saving}>
                <Text style={styles.primaryButtonText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
        ) : collections.length === 0 ? (
          <Text style={styles.emptyText}>Koleksiyon yok.</Text>
        ) : (
          <View style={[styles.collectionGrid, isWide && styles.collectionGridWide]}>
            {collections.map((collection) => (
            <View key={collection.id} style={[styles.collectionCard, isWide && styles.collectionCardWide]}>
              <View style={[styles.collectionVisual, !collection.imageUrl && { backgroundColor: previewColor(collection.color) }]}>
                {collection.imageUrl ? <Image source={{ uri: collection.imageUrl }} style={styles.collectionImage} resizeMode="cover" /> : null}
              </View>
              <View style={styles.collectionTop}>
                <View style={styles.flexText}>
                  <Text style={styles.collectionTitle} numberOfLines={2}>{collection.title}</Text>
                  <Text style={styles.collectionMeta} numberOfLines={2}>
                    Sira {collection.sortOrder || 0} - {collection.sourceType === 'MANUAL' ? `${collection.productIds?.length || 0} urun` : collection.ruleType || 'rule'} - {collection.targetType}
                  </Text>
                </View>
                <Text style={[styles.statusPill, collection.active ? styles.statusActive : styles.statusPassive]}>{collection.active ? 'Aktif' : 'Pasif'}</Text>
              </View>
              {!!collection.subtitle && <Text style={styles.collectionSubtitle} numberOfLines={3}>{collection.subtitle}</Text>}
              <View style={styles.cardActions}>
                <TouchableOpacity style={[styles.smallButton, mutatingId === collection.id && styles.buttonDisabled]} onPress={() => startEdit(collection)} disabled={mutatingId === collection.id}>
                  <Text style={styles.smallButtonText}>Duzenle</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.smallButton, mutatingId === collection.id && styles.buttonDisabled]} onPress={() => toggleActive(collection)} disabled={mutatingId === collection.id}>
                  <Text style={styles.smallButtonText}>{mutatingId === collection.id ? 'Isleniyor' : collection.active ? 'Pasif' : 'Aktif'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.smallDangerButton, mutatingId === collection.id && styles.buttonDisabled]} onPress={() => deleteCollection(collection)} disabled={mutatingId === collection.id}>
                  <Text style={styles.smallDangerText}>Sil</Text>
                </TouchableOpacity>
              </View>
            </View>
            ))}
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
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  primaryButton: { backgroundColor: colors.primarySoft, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  primaryButtonText: { fontFamily: fonts.bold, color: '#FFFFFF' },
  secondaryButton: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  secondaryButtonText: { fontFamily: fonts.semibold, color: colors.primarySoft },
  formCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border, fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.text },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  fieldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flex: 1, minWidth: 150 },
  label: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.textMuted },
  segment: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.surfaceMuted, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.xs, gap: spacing.xs },
  segmentButton: { flexGrow: 1, alignItems: 'center', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  segmentButtonActive: { backgroundColor: colors.primary },
  segmentText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.textMuted },
  segmentTextActive: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: '#FFFFFF' },
  subSection: { gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surfaceMuted },
  selectedText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.primarySoft },
  resultRow: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surface },
  resultRowActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  resultTitle: { fontFamily: fonts.semibold, color: colors.text },
  pickedList: { gap: spacing.xs },
  pickedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.surface },
  pickedText: { flex: 1, minWidth: 0 },
  pickedTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  pickedMeta: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  productThumb: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  productImage: { width: '100%', height: '100%' },
  removeButton: { borderRadius: radius.sm, backgroundColor: colors.dangerSoft, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  removeButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.danger },
  productResult: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surface },
  productTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  productMeta: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  previewImage: { width: '100%', height: 128, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  colorDot: { width: 36, height: 36, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  colorDotActive: { borderWidth: 3, borderColor: colors.primarySoft },
  colorDash: { fontFamily: fonts.bold, color: colors.textMuted },
  activeToggle: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: 'center', paddingVertical: spacing.sm, backgroundColor: colors.surface },
  activeToggleOn: { backgroundColor: colors.successSoft, borderColor: '#86EFAC' },
  activeToggleText: { fontFamily: fonts.semibold, color: colors.textMuted },
  activeToggleTextOn: { fontFamily: fonts.semibold, color: colors.success },
  outlineButtonWide: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: 'center', paddingVertical: spacing.md, backgroundColor: colors.surface },
  outlineButtonText: { fontFamily: fonts.semibold, color: colors.text },
  primaryButtonWide: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: 'center', paddingVertical: spacing.md },
  buttonDisabled: { opacity: 0.6 },
  error: { fontFamily: fonts.medium, color: colors.danger },
  loading: { alignItems: 'center', padding: spacing.xl },
  emptyText: { fontFamily: fonts.regular, color: colors.textMuted },
  collectionGrid: { gap: spacing.md },
  collectionGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  collectionCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  collectionCardWide: { width: '48.7%' },
  collectionVisual: { width: '100%', height: 118, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  collectionImage: { width: '100%', height: '100%' },
  collectionTop: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  flexText: { flex: 1, minWidth: 0 },
  collectionTitle: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: colors.text },
  collectionSubtitle: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.textMuted, lineHeight: 20 },
  collectionMeta: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  statusPill: { overflow: 'hidden', borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, fontFamily: fonts.bold, fontSize: fontSizes.xs },
  statusActive: { backgroundColor: colors.successSoft, color: colors.success },
  statusPassive: { backgroundColor: colors.surfaceMuted, color: colors.textMuted },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  smallButton: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  smallButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.text },
  smallDangerButton: { borderWidth: 1, borderColor: 'rgba(248,113,113,0.30)', borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.dangerSoft },
  smallDangerText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.danger },
});
