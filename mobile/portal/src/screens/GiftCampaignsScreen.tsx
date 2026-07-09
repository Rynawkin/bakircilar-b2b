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
  AdminGiftCampaign,
  GiftCampaignScopeType,
  GiftCampaignTargetType,
  adminApi,
} from '../api/admin';
import { Product } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';

type GiftItem = { productId: string; name?: string; mikroCode?: string; imageUrl?: string | null; giftQuantity?: number };
type ProductPickMode = 'gifts' | 'scope';

const scopeOptions: Array<{ value: GiftCampaignScopeType; label: string }> = [
  { value: 'missingCategories', label: 'Eksik kategori' },
  { value: 'all', label: 'Tum sepet' },
  { value: 'productIds', label: 'Urunler' },
  { value: 'categoryIds', label: 'Kategoriler' },
];

const targetOptions: Array<{ value: GiftCampaignTargetType; label: string }> = [
  { value: 'all', label: 'Herkes' },
  { value: 'segment', label: 'Sektor' },
  { value: 'account', label: 'Cari' },
];

const emptyForm = {
  id: '',
  title: '',
  subtitle: '',
  bannerImageUrl: '',
  mobileBannerImageUrl: '',
  buttonText: '',
  threshold: '0',
  thresholdPriceType: 'invoiced' as 'invoiced' | 'white',
  thresholdVatIncluded: true,
  scopeType: 'missingCategories' as GiftCampaignScopeType,
  scopeCategoryIds: '',
  scopeProductIds: [] as GiftItem[],
  giftPickCount: '1',
  targetType: 'all' as GiftCampaignTargetType,
  targetSectorCodes: '',
  targetUserIds: '',
  active: true,
  validFrom: '',
  validTo: '',
  gifts: [] as GiftItem[],
};

const toDateText = (value?: string | null) => value ? value.split('T')[0] || '' : '';
const toIsoOrNull = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const splitCodes = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);
const money = (value: any) => `${Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL`;

export function GiftCampaignsScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 840;
  const [campaigns, setCampaigns] = useState<AdminGiftCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [searchMode, setSearchMode] = useState<ProductPickMode>('gifts');
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

  const fetchCampaigns = async () => {
    const requestSeq = ++fetchSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getGiftCampaigns();
      if (requestSeq !== fetchSeqRef.current) return;
      setCampaigns(response.campaigns || []);
    } catch (err: any) {
      if (requestSeq === fetchSeqRef.current) {
        setError(getApiErrorMessage(err, 'Hediyeli kampanyalar yuklenemedi.'));
      }
    } finally {
      if (requestSeq === fetchSeqRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (productSearch.trim().length < 2) {
        productSearchSeqRef.current += 1;
        setProductResults([]);
        setProductLoading(false);
        return;
      }
      searchProducts();
    }, 300);
    return () => clearTimeout(handle);
  }, [productSearch]);

  const activeCount = useMemo(() => campaigns.filter((item) => item.active).length, [campaigns]);
  const giftCount = useMemo(
    () => campaigns.reduce((sum, item) => sum + (item.gifts?.length || 0), 0),
    [campaigns]
  );
  const scopedCount = useMemo(
    () => campaigns.filter((item) => item.targetType !== 'all' || item.scopeType !== 'missingCategories').length,
    [campaigns]
  );

  const searchProducts = async () => {
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
  };

  const startCreate = () => {
    setForm(emptyForm);
    setFormOpen(true);
  };

  const startEdit = (campaign: AdminGiftCampaign) => {
    setForm({
      id: campaign.id,
      title: campaign.title || '',
      subtitle: campaign.subtitle || '',
      bannerImageUrl: campaign.bannerImageUrl || '',
      mobileBannerImageUrl: campaign.mobileBannerImageUrl || '',
      buttonText: campaign.buttonText || '',
      threshold: String(campaign.threshold || 0),
      thresholdPriceType: campaign.thresholdPriceType || 'invoiced',
      thresholdVatIncluded: Boolean(campaign.thresholdVatIncluded),
      scopeType: campaign.scopeType || 'missingCategories',
      scopeCategoryIds: (campaign.scopeCategoryIds || []).join(', '),
      scopeProductIds: (campaign.scopeProductIds || []).map((id) => ({ productId: id })),
      giftPickCount: String(campaign.giftPickCount || 1),
      targetType: campaign.targetType || 'all',
      targetSectorCodes: (campaign.targetSectorCodes || []).join(', '),
      targetUserIds: (campaign.targetUserIds || []).join(', '),
      active: campaign.active,
      validFrom: toDateText(campaign.validFrom),
      validTo: toDateText(campaign.validTo),
      gifts: (campaign.gifts || []).map((gift) => ({
        productId: gift.productId,
        name: gift.name,
        mikroCode: gift.mikroCode,
        imageUrl: gift.imageUrl,
        giftQuantity: gift.giftQuantity ?? 1,
      })),
    });
    setFormOpen(true);
  };

  const addProduct = (product: Product) => {
    const item: GiftItem = {
      productId: product.id,
      name: product.name,
      mikroCode: product.mikroCode,
      imageUrl: product.imageUrl,
      giftQuantity: 1,
    };
    if (searchMode === 'gifts') {
      setForm((prev) => prev.gifts.some((gift) => gift.productId === product.id)
        ? prev
        : { ...prev, gifts: [...prev.gifts, item] });
    } else {
      setForm((prev) => prev.scopeProductIds.some((scope) => scope.productId === product.id)
        ? prev
        : { ...prev, scopeProductIds: [...prev.scopeProductIds, item] });
    }
  };

  const removeGift = (productId: string) => {
    setForm((prev) => ({ ...prev, gifts: prev.gifts.filter((gift) => gift.productId !== productId) }));
  };

  const removeScopeProduct = (productId: string) => {
    setForm((prev) => ({ ...prev, scopeProductIds: prev.scopeProductIds.filter((item) => item.productId !== productId) }));
  };

  const updateGiftQuantity = (productId: string, value: string) => {
    const qty = Math.max(1, Math.trunc(Number(value) || 1));
    setForm((prev) => ({
      ...prev,
      gifts: prev.gifts.map((gift) => gift.productId === productId ? { ...gift, giftQuantity: qty } : gift),
    }));
  };

  const buildPayload = () => ({
    title: form.title.trim(),
    subtitle: form.subtitle.trim() || null,
    bannerImageUrl: form.bannerImageUrl.trim() || null,
    mobileBannerImageUrl: form.mobileBannerImageUrl.trim() || null,
    buttonText: form.buttonText.trim() || null,
    threshold: Number(form.threshold) || 0,
    thresholdPriceType: form.thresholdPriceType,
    thresholdVatIncluded: form.thresholdVatIncluded,
    scopeType: form.scopeType,
    scopeCategoryIds: splitCodes(form.scopeCategoryIds),
    scopeProductIds: form.scopeProductIds.map((item) => item.productId),
    giftPickCount: Math.max(1, Math.trunc(Number(form.giftPickCount) || 1)),
    targetType: form.targetType,
    targetSectorCodes: splitCodes(form.targetSectorCodes),
    targetUserIds: splitCodes(form.targetUserIds),
    active: form.active,
    validFrom: toIsoOrNull(form.validFrom),
    validTo: toIsoOrNull(form.validTo),
    gifts: form.gifts.map((gift, index) => ({
      productId: gift.productId,
      sortOrder: index,
      giftQuantity: Math.max(1, Math.trunc(Number(gift.giftQuantity || 1))),
    })),
  });

  const saveCampaign = async () => {
    if (savingRef.current) return;
    if (!form.title.trim()) {
      Alert.alert('Eksik Bilgi', 'Kampanya basligi gerekli.');
      return;
    }
    if (form.gifts.length === 0) {
      Alert.alert('Eksik Bilgi', 'En az bir hediye urun secin.');
      return;
    }
    if (!beginSaving()) return;
    try {
      const payload = buildPayload();
      if (form.id) {
        await adminApi.updateGiftCampaign(form.id, payload);
      } else {
        await adminApi.createGiftCampaign(payload);
      }
      setFormOpen(false);
      setForm(emptyForm);
      await fetchCampaigns();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Kampanya kaydedilemedi.'));
    } finally {
      endSaving();
    }
  };

  const toggleActive = async (campaign: AdminGiftCampaign) => {
    if (!beginMutating(campaign.id)) return;
    try {
      await adminApi.updateGiftCampaign(campaign.id, { title: campaign.title, active: !campaign.active });
      setCampaigns((prev) => prev.map((item) => item.id === campaign.id ? { ...item, active: !item.active } : item));
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Durum degistirilemedi.'));
    } finally {
      endMutating();
    }
  };

  const deleteCampaign = (campaign: AdminGiftCampaign) => {
    if (mutatingIdRef.current) return;
    Alert.alert('Kampanya Sil', `"${campaign.title}" silinsin mi?`, [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          if (!beginMutating(campaign.id)) return;
          try {
            await adminApi.deleteGiftCampaign(campaign.id);
            setCampaigns((prev) => prev.filter((item) => item.id !== campaign.id));
          } catch (err: any) {
            Alert.alert('Hata', getApiErrorMessage(err, 'Kampanya silinemedi.'));
          } finally {
            endMutating();
          }
        },
      },
    ]);
  };

  const renderPicked = (items: GiftItem[], onRemove: (productId: string) => void, withQty = false) => (
    <View style={styles.pickedList}>
      {items.length === 0 ? <Text style={styles.emptyText}>Urun secilmedi.</Text> : null}
      {items.map((item) => (
        <View key={item.productId} style={styles.pickedRow}>
          <View style={styles.pickedText}>
            <Text style={styles.pickedTitle} numberOfLines={2}>{item.name || item.productId}</Text>
            <Text style={styles.pickedMeta} numberOfLines={1}>{item.mikroCode || item.productId}</Text>
          </View>
          {withQty && (
            <TextInput
              style={styles.qtyInput}
              value={String(item.giftQuantity || 1)}
              onChangeText={(value) => updateGiftQuantity(item.productId, value)}
              keyboardType="number-pad"
            />
          )}
          <TouchableOpacity style={styles.removeButton} onPress={() => onRemove(item.productId)}>
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
              <Text style={styles.kicker}>Sepet Tesviki</Text>
              <Text style={styles.title}>Hediyeli Kampanyalar</Text>
              <Text style={styles.subtitle}>Sepette baraji gecen musterilere hediye urun secimini web kalitesinde yonetin.</Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity style={[styles.secondaryButton, loading && styles.buttonDisabled]} onPress={fetchCampaigns} disabled={loading}>
                <Text style={styles.secondaryButtonText}>{loading ? 'Yukleniyor' : 'Yenile'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryButton, saving && styles.buttonDisabled]} onPress={startCreate} disabled={saving}>
                <Text style={styles.primaryButtonText}>Yeni Kampanya</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Toplam</Text>
              <Text style={styles.heroStatValue}>{campaigns.length}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Aktif</Text>
              <Text style={styles.heroStatValue}>{activeCount}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Hediye</Text>
              <Text style={styles.heroStatValue}>{giftCount}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Hedefli</Text>
              <Text style={styles.heroStatValue}>{scopedCount}</Text>
            </View>
          </View>
        </View>

        {formOpen && (
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>{form.id ? 'Kampanya Duzenle' : 'Yeni Kampanya'}</Text>
            <TextInput style={styles.input} value={form.title} onChangeText={(value) => setForm((prev) => ({ ...prev, title: value }))} placeholder="Baslik" placeholderTextColor={colors.textMuted} />
            <TextInput style={[styles.input, styles.multiline]} value={form.subtitle} onChangeText={(value) => setForm((prev) => ({ ...prev, subtitle: value }))} placeholder="Alt metin" placeholderTextColor={colors.textMuted} multiline />
            <View style={styles.fieldRow}>
              <TextInput style={[styles.input, styles.flex]} value={form.threshold} onChangeText={(value) => setForm((prev) => ({ ...prev, threshold: value }))} placeholder="Baraj TL" keyboardType="decimal-pad" placeholderTextColor={colors.textMuted} />
              <TextInput style={[styles.input, styles.flex]} value={form.giftPickCount} onChangeText={(value) => setForm((prev) => ({ ...prev, giftPickCount: value }))} placeholder="Secim adedi" keyboardType="number-pad" placeholderTextColor={colors.textMuted} />
            </View>

            <Text style={styles.label}>Kapsam</Text>
            <View style={styles.segment}>
              {scopeOptions.map((option) => (
                <TouchableOpacity key={option.value} style={[styles.segmentButton, form.scopeType === option.value && styles.segmentButtonActive]} onPress={() => setForm((prev) => ({ ...prev, scopeType: option.value }))}>
                  <Text style={form.scopeType === option.value ? styles.segmentTextActive : styles.segmentText}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {form.scopeType === 'categoryIds' && (
              <TextInput style={styles.input} value={form.scopeCategoryIds} onChangeText={(value) => setForm((prev) => ({ ...prev, scopeCategoryIds: value }))} placeholder="Kategori ID'leri, virgulle" placeholderTextColor={colors.textMuted} />
            )}
            {form.scopeType === 'productIds' && renderPicked(form.scopeProductIds, removeScopeProduct)}

            <Text style={styles.label}>Hedef</Text>
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

            <Text style={styles.label}>Hediye Urunler</Text>
            {renderPicked(form.gifts, removeGift, true)}
            <View style={styles.searchModeRow}>
              <TouchableOpacity style={[styles.modeChip, searchMode === 'gifts' && styles.modeChipActive]} onPress={() => setSearchMode('gifts')}>
                <Text style={searchMode === 'gifts' ? styles.modeTextActive : styles.modeText}>Hediye ekle</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modeChip, searchMode === 'scope' && styles.modeChipActive]} onPress={() => setSearchMode('scope')}>
                <Text style={searchMode === 'scope' ? styles.modeTextActive : styles.modeText}>Kapsam urunu</Text>
              </TouchableOpacity>
            </View>
            <TextInput style={styles.input} value={productSearch} onChangeText={setProductSearch} placeholder="Urun ara" placeholderTextColor={colors.textMuted} />
            {productLoading ? <ActivityIndicator color={colors.primary} /> : null}
            {productResults.slice(0, 8).map((product) => (
              <TouchableOpacity key={product.id} style={styles.productResult} onPress={() => addProduct(product)}>
                <Text style={styles.productTitle} numberOfLines={2}>{product.name}</Text>
                <Text style={styles.productMeta} numberOfLines={1}>{product.mikroCode}</Text>
              </TouchableOpacity>
            ))}

            <View style={styles.fieldRow}>
              <TextInput style={[styles.input, styles.flex]} value={form.bannerImageUrl} onChangeText={(value) => setForm((prev) => ({ ...prev, bannerImageUrl: value }))} placeholder="Banner URL" placeholderTextColor={colors.textMuted} />
              <TextInput style={[styles.input, styles.flex]} value={form.mobileBannerImageUrl} onChangeText={(value) => setForm((prev) => ({ ...prev, mobileBannerImageUrl: value }))} placeholder="Mobil banner URL" placeholderTextColor={colors.textMuted} />
            </View>
            <View style={styles.fieldRow}>
              <TextInput style={[styles.input, styles.flex]} value={form.validFrom} onChangeText={(value) => setForm((prev) => ({ ...prev, validFrom: value }))} placeholder="Baslangic YYYY-MM-DD" placeholderTextColor={colors.textMuted} />
              <TextInput style={[styles.input, styles.flex]} value={form.validTo} onChangeText={(value) => setForm((prev) => ({ ...prev, validTo: value }))} placeholder="Bitis YYYY-MM-DD" placeholderTextColor={colors.textMuted} />
            </View>
            <TouchableOpacity style={[styles.activeToggle, form.active && styles.activeToggleOn]} onPress={() => setForm((prev) => ({ ...prev, active: !prev.active }))}>
              <Text style={form.active ? styles.activeToggleTextOn : styles.activeToggleText}>{form.active ? 'Aktif' : 'Pasif'}</Text>
            </TouchableOpacity>

            <View style={styles.headerActions}>
              <TouchableOpacity style={[styles.outlineButtonWide, saving && styles.buttonDisabled]} onPress={() => setFormOpen(false)} disabled={saving}>
                <Text style={styles.outlineButtonText}>Vazgec</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryButtonWide, saving && styles.buttonDisabled]} onPress={saveCampaign} disabled={saving}>
                <Text style={styles.primaryButtonText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
        ) : campaigns.length === 0 ? (
          <Text style={styles.emptyText}>Kampanya yok.</Text>
        ) : (
          <View style={[styles.campaignGrid, isWide && styles.campaignGridWide]}>
            {campaigns.map((campaign) => (
            <View key={campaign.id} style={[styles.campaignCard, isWide && styles.campaignCardWide]}>
              {(campaign.mobileBannerImageUrl || campaign.bannerImageUrl) ? (
                <Image source={{ uri: campaign.mobileBannerImageUrl || campaign.bannerImageUrl || '' }} style={styles.banner} resizeMode="cover" />
              ) : null}
              <View style={styles.campaignTop}>
                <View style={styles.flexText}>
                  <Text style={styles.campaignTitle} numberOfLines={2}>{campaign.title}</Text>
                  <Text style={styles.campaignMeta} numberOfLines={2}>
                    Baraj: {money(campaign.threshold)} - {campaign.scopeType} - {campaign.targetType}
                  </Text>
                </View>
                <Text style={[styles.statusPill, campaign.active ? styles.statusActive : styles.statusPassive]}>{campaign.active ? 'Aktif' : 'Pasif'}</Text>
              </View>
              {!!campaign.subtitle && <Text style={styles.campaignSubtitle} numberOfLines={3}>{campaign.subtitle}</Text>}
              <Text style={styles.campaignMeta} numberOfLines={1}>Hediye: {campaign.gifts?.length || 0} urun - Secim: {campaign.giftPickCount}</Text>
              <View style={styles.cardActions}>
                <TouchableOpacity style={[styles.smallButton, mutatingId === campaign.id && styles.buttonDisabled]} onPress={() => startEdit(campaign)} disabled={mutatingId === campaign.id}>
                  <Text style={styles.smallButtonText}>Duzenle</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.smallButton, mutatingId === campaign.id && styles.buttonDisabled]} onPress={() => toggleActive(campaign)} disabled={mutatingId === campaign.id}>
                  <Text style={styles.smallButtonText}>{mutatingId === campaign.id ? 'Isleniyor' : campaign.active ? 'Pasif' : 'Aktif'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.smallDangerButton, mutatingId === campaign.id && styles.buttonDisabled]} onPress={() => deleteCampaign(campaign)} disabled={mutatingId === campaign.id}>
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
  pickedList: { gap: spacing.xs },
  pickedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.surfaceMuted },
  pickedText: { flex: 1, minWidth: 0 },
  pickedTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  pickedMeta: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  qtyInput: { width: 54, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, fontFamily: fonts.semibold, color: colors.text },
  removeButton: { borderRadius: radius.sm, backgroundColor: colors.dangerSoft, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  removeButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.danger },
  searchModeRow: { flexDirection: 'row', gap: spacing.sm },
  modeChip: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: 'center', paddingVertical: spacing.sm, backgroundColor: colors.surface },
  modeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.textMuted },
  modeTextActive: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: '#FFFFFF' },
  productResult: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surfaceMuted },
  productTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  productMeta: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
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
  campaignGrid: { gap: spacing.md },
  campaignGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  campaignCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  campaignCardWide: { width: '48.7%' },
  banner: { width: '100%', height: 128, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  campaignTop: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  flexText: { flex: 1, minWidth: 0 },
  campaignTitle: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: colors.text },
  campaignSubtitle: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.textMuted, lineHeight: 20 },
  campaignMeta: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  statusPill: { overflow: 'hidden', borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, fontFamily: fonts.bold, fontSize: fontSizes.xs },
  statusActive: { backgroundColor: colors.successSoft, color: colors.success },
  statusPassive: { backgroundColor: colors.surfaceMuted, color: colors.textMuted },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  smallButton: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  smallButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.text },
  smallDangerButton: { borderWidth: 1, borderColor: 'rgba(248,113,113,0.30)', borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.dangerSoft },
  smallDangerText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.danger },
});
