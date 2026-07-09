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

import { adminApi } from '../api/admin';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';

type UnitInfo = {
  index: number;
  name: string;
  factor: number;
  factorDirection: 'larger' | 'smaller';
  weightKg: number;
  widthCm: number;
  lengthCm: number;
  heightCm: number;
  enabled: boolean;
};

type DimensionProduct = {
  productCode: string;
  productName: string;
  shelfCode: string;
  shelfName: string;
  imageUrl?: string | null;
  stockQuantity?: number;
  hasStock?: boolean;
  units: UnitInfo[];
  missing?: string[];
};

type Shelf = { code: string; name: string };

const emptyUnits = (): UnitInfo[] =>
  [1, 2, 3, 4].map((index) => ({
    index,
    name: '',
    factor: index === 1 ? 1 : 0,
    factorDirection: 'larger',
    weightKg: 0,
    widthCm: 0,
    lengthCm: 0,
    heightCm: 0,
    enabled: index === 1,
  }));

const toNumber = (value: unknown) => {
  const num = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(num) ? num : 0;
};

const mmToCm = (value: unknown) => toNumber(value) / 10;
const cmToMm = (value: unknown) => Math.round(toNumber(value) * 10 * 1000) / 1000;
const calcDesi = (widthCm: number, lengthCm: number, heightCm: number) =>
  widthCm && lengthCm && heightCm ? (widthCm * lengthCm * heightCm) / 3000 : 0;

const mikroFactorToUi = (index: number, factor: unknown) => {
  const raw = toNumber(factor);
  if (index === 1) return { factor: raw || 1, factorDirection: 'larger' as const };
  if (raw < 0) return { factor: Math.abs(raw), factorDirection: 'larger' as const };
  return { factor: raw, factorDirection: 'smaller' as const };
};

const uiFactorToMikro = (unit: UnitInfo) => {
  const factor = Math.abs(toNumber(unit.factor));
  if (unit.index === 1) return factor || 1;
  return unit.factorDirection === 'smaller' ? factor : -factor;
};

const normalizeUnit = (unit: UnitInfo): UnitInfo => ({
  ...unit,
  name: String(unit.name || '').trim().toUpperCase(),
  factor: toNumber(unit.factor),
  weightKg: toNumber(unit.weightKg),
  widthCm: toNumber(unit.widthCm),
  lengthCm: toNumber(unit.lengthCm),
  heightCm: toNumber(unit.heightCm),
  factorDirection: unit.index === 1 ? 'larger' : unit.factorDirection || 'larger',
});

const isUnitEnabled = (unit?: UnitInfo) => Boolean(unit && (unit.index === 1 || unit.enabled || unit.name));

const apiProductToUi = (product: any): DimensionProduct => ({
  productCode: String(product?.productCode || ''),
  productName: String(product?.productName || ''),
  shelfCode: String(product?.shelfCode || ''),
  shelfName: String(product?.shelfName || ''),
  imageUrl: product?.imageUrl || null,
  stockQuantity: Number(product?.stockQuantity || 0),
  hasStock: Boolean(product?.hasStock),
  missing: Array.isArray(product?.missing) ? product.missing : [],
  units: (product?.units || emptyUnits()).map((unit: any) =>
    normalizeUnit({
      index: Number(unit.index),
      name: String(unit.name || ''),
      ...mikroFactorToUi(Number(unit.index), unit.factor),
      weightKg: toNumber(unit.weightKg),
      widthCm: mmToCm(unit.widthMm),
      lengthCm: mmToCm(unit.lengthMm),
      heightCm: mmToCm(unit.heightMm),
      enabled: Number(unit.index) === 1 || Boolean(String(unit.name || '').trim()),
    })
  ),
});

const formatNumber = (value: any, digits = 2) =>
  Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: digits });

export function ProductDimensionsScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 840;
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<DimensionProduct[]>([]);
  const [missingSearch, setMissingSearch] = useState('');
  const [missingProducts, setMissingProducts] = useState<DimensionProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<DimensionProduct | null>(null);
  const [originalProduct, setOriginalProduct] = useState<DimensionProduct | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [shelfSearch, setShelfSearch] = useState('');
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [unitNames, setUnitNames] = useState<string[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingMissing, setLoadingMissing] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.getProductDimensionUnitNames()
      .then((response) => setUnitNames(response.units || []))
      .catch(() => setUnitNames([]));
    loadMissingProducts();
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (search.trim().length < 2) {
        setResults([]);
        return;
      }
      searchProducts();
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    const handle = setTimeout(() => {
      searchShelves();
    }, 250);
    return () => clearTimeout(handle);
  }, [shelfSearch]);

  const changedFields = useMemo(() => {
    if (!selectedProduct || !originalProduct) return [];
    const changes: string[] = [];
    if ((selectedProduct.shelfCode || '') !== (originalProduct.shelfCode || '')) {
      changes.push(`Raf: ${originalProduct.shelfCode || '-'} -> ${selectedProduct.shelfCode || '-'}`);
    }
    selectedProduct.units.forEach((unit, index) => {
      const oldUnit = originalProduct.units[index] || emptyUnits()[index];
      if (!isUnitEnabled(unit) && !isUnitEnabled(oldUnit)) return;
      const fields: Array<[keyof UnitInfo, string]> = [
        ['name', 'Ad'],
        ['factor', 'Katsayi'],
        ['factorDirection', 'Yon'],
        ['weightKg', 'Kg'],
        ['widthCm', 'En'],
        ['lengthCm', 'Boy'],
        ['heightCm', 'Yukseklik'],
      ];
      fields.forEach(([field, label]) => {
        if (String(unit[field] ?? '') !== String(oldUnit[field] ?? '')) {
          changes.push(`${unit.index}. birim ${label}`);
        }
      });
    });
    return changes;
  }, [selectedProduct, originalProduct]);

  const searchProducts = async () => {
    if (loadingSearch) return;
    setLoadingSearch(true);
    setError(null);
    try {
      const response = await adminApi.searchProductDimensions({ search: search.trim(), limit: 40 });
      setResults((response.products || []).map(apiProductToUi));
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Urun aranamadi.'));
    } finally {
      setLoadingSearch(false);
    }
  };

  const loadProduct = async (productCode: string) => {
    if (loadingProduct) return;
    setLoadingProduct(true);
    setError(null);
    try {
      const response = await adminApi.getProductDimensions(productCode);
      const product = apiProductToUi(response.product);
      setSelectedProduct(product);
      setOriginalProduct(JSON.parse(JSON.stringify(product)));
      setHistory(response.history || []);
      setShelfSearch(product.shelfCode || '');
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Urun yuklenemedi.'));
    } finally {
      setLoadingProduct(false);
    }
  };

  const loadMissingProducts = async () => {
    if (loadingMissing) return;
    setLoadingMissing(true);
    setError(null);
    try {
      const response = await adminApi.getMissingProductDimensions({
        search: missingSearch.trim() || undefined,
        limit: 80,
      });
      setMissingProducts((response.products || []).map(apiProductToUi));
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Eksik olcu listesi alinamadi.'));
    } finally {
      setLoadingMissing(false);
    }
  };

  const searchShelves = async () => {
    try {
      const response = await adminApi.searchProductShelves({
        search: shelfSearch.trim() || undefined,
        limit: 25,
      });
      setShelves(response.shelves || []);
    } catch {
      setShelves([]);
    }
  };

  const updateUnit = (index: number, patch: Partial<UnitInfo>) => {
    setSelectedProduct((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        units: prev.units.map((unit) =>
          unit.index === index ? normalizeUnit({ ...unit, ...patch, enabled: patch.enabled ?? unit.enabled }) : unit
        ),
      };
    });
  };

  const selectShelf = (shelf: Shelf) => {
    setSelectedProduct((prev) =>
      prev ? { ...prev, shelfCode: shelf.code, shelfName: shelf.name } : prev
    );
    setShelfSearch(`${shelf.code} - ${shelf.name}`);
  };

  const validate = () => {
    if (!selectedProduct) return false;
    for (const unit of selectedProduct.units) {
      if (!isUnitEnabled(unit)) continue;
      if (!unit.name) {
        Alert.alert('Eksik Bilgi', `${unit.index}. birim adi gerekli.`);
        return false;
      }
      if (unit.name.length > 10) {
        Alert.alert('Eksik Bilgi', `${unit.index}. birim adi 10 karakterden uzun olamaz.`);
        return false;
      }
      if (unit.factor === 0) {
        Alert.alert('Eksik Bilgi', `${unit.index}. birim katsayisi 0 olamaz.`);
        return false;
      }
      if ([unit.weightKg, unit.widthCm, unit.lengthCm, unit.heightCm].some((value) => value < 0)) {
        Alert.alert('Eksik Bilgi', `${unit.index}. birimde negatif deger olamaz.`);
        return false;
      }
      const dimensionCount = [unit.widthCm, unit.lengthCm, unit.heightCm].filter((value) => value > 0).length;
      if (dimensionCount > 0 && dimensionCount < 3) {
        Alert.alert('Eksik Bilgi', `${unit.index}. birim icin en, boy ve yukseklik birlikte girilmeli.`);
        return false;
      }
    }
    return true;
  };

  const saveProduct = () => {
    if (savingRef.current || saveConfirmOpen) return;
    if (!selectedProduct || !validate()) return;
    if (changedFields.length === 0) {
      Alert.alert('Bilgi', 'Degisen alan yok.');
      return;
    }

    setSaveConfirmOpen(true);
    Alert.alert(
      'Mikro Stok Karti Guncellenecek',
      `Olculer cm girildi, Mikroya mm yazilacak.\n\nDegisenler:\n${changedFields.slice(0, 10).join('\n')}`,
      [
        { text: 'Vazgec', style: 'cancel', onPress: () => setSaveConfirmOpen(false) },
        {
          text: 'Kaydet',
          onPress: async () => {
            setSaveConfirmOpen(false);
            if (savingRef.current) return;
            savingRef.current = true;
            setSaving(true);
            setError(null);
            try {
              const response = await adminApi.updateProductDimensions(selectedProduct.productCode, {
                shelfCode: selectedProduct.shelfCode || '',
                units: selectedProduct.units.filter(isUnitEnabled).map((unit) => ({
                  index: unit.index,
                  name: unit.name || '',
                  factor: uiFactorToMikro(unit),
                  weightKg: unit.weightKg || 0,
                  widthMm: cmToMm(unit.widthCm),
                  lengthMm: cmToMm(unit.lengthCm),
                  heightMm: cmToMm(unit.heightCm),
                })),
              });
              const product = apiProductToUi(response.product);
              setSelectedProduct(product);
              setOriginalProduct(JSON.parse(JSON.stringify(product)));
              setHistory(response.history || []);
              await loadMissingProducts();
              Alert.alert('Kaydedildi', 'Mikro stok karti guncellendi.');
            } catch (err: any) {
              Alert.alert('Hata', getApiErrorMessage(err, 'Kayit yapilamadi.'));
            } finally {
              savingRef.current = false;
              setSaving(false);
            }
          },
        },
      ],
      { cancelable: true, onDismiss: () => setSaveConfirmOpen(false) }
    );
  };

  const renderUnit = (unit: UnitInfo) => {
    const enabled = isUnitEnabled(unit);
    return (
      <View key={unit.index} style={[styles.unitCard, !enabled && styles.unitDisabled]}>
        <View style={styles.unitHeader}>
          <Text style={styles.unitTitle}>{unit.index}. Birim</Text>
          {unit.index > 1 && (
            <TouchableOpacity
              style={[styles.smallPill, enabled && styles.smallPillActive]}
              onPress={() => updateUnit(unit.index, { enabled: !unit.enabled })}
            >
              <Text style={enabled ? styles.smallPillTextActive : styles.smallPillText}>
                {enabled ? 'Aktif' : 'Pasif'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {enabled && (
          <>
            <View style={styles.fieldRow}>
              <View style={styles.fieldHalf}>
                <Text style={styles.label}>Birim Adi</Text>
                <TextInput
                  style={styles.input}
                  value={unit.name}
                  onChangeText={(value) => updateUnit(unit.index, { name: value })}
                  placeholder={unitNames.slice(0, 3).join(' / ') || 'ADET'}
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                />
              </View>
              <View style={styles.fieldHalf}>
                <Text style={styles.label}>Katsayi</Text>
                <TextInput
                  style={styles.input}
                  value={String(unit.factor || '')}
                  onChangeText={(value) => updateUnit(unit.index, { factor: toNumber(value) })}
                  placeholder="1"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            {unit.index > 1 && (
              <View style={styles.segment}>
                <TouchableOpacity
                  style={[styles.segmentButton, unit.factorDirection === 'larger' && styles.segmentButtonActive]}
                  onPress={() => updateUnit(unit.index, { factorDirection: 'larger' })}
                >
                  <Text style={unit.factorDirection === 'larger' ? styles.segmentTextActive : styles.segmentText}>
                    Buyuk birim
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segmentButton, unit.factorDirection === 'smaller' && styles.segmentButtonActive]}
                  onPress={() => updateUnit(unit.index, { factorDirection: 'smaller' })}
                >
                  <Text style={unit.factorDirection === 'smaller' ? styles.segmentTextActive : styles.segmentText}>
                    Kucuk birim
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.fieldRow}>
              <View style={styles.fieldHalf}>
                <Text style={styles.label}>Kg</Text>
                <TextInput
                  style={styles.input}
                  value={String(unit.weightKg || '')}
                  onChangeText={(value) => updateUnit(unit.index, { weightKg: toNumber(value) })}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.fieldHalf}>
                <Text style={styles.label}>Desi</Text>
                <Text style={styles.readonlyValue}>
                  {formatNumber(calcDesi(unit.widthCm, unit.lengthCm, unit.heightCm), 3)}
                </Text>
              </View>
            </View>

            <View style={styles.fieldRow}>
              <View style={styles.fieldThird}>
                <Text style={styles.label}>En cm</Text>
                <TextInput
                  style={styles.input}
                  value={String(unit.widthCm || '')}
                  onChangeText={(value) => updateUnit(unit.index, { widthCm: toNumber(value) })}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={styles.fieldThird}>
                <Text style={styles.label}>Boy cm</Text>
                <TextInput
                  style={styles.input}
                  value={String(unit.lengthCm || '')}
                  onChangeText={(value) => updateUnit(unit.index, { lengthCm: toNumber(value) })}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={styles.fieldThird}>
                <Text style={styles.label}>Yuk. cm</Text>
                <TextInput
                  style={styles.input}
                  value={String(unit.heightCm || '')}
                  onChangeText={(value) => updateUnit(unit.index, { heightCm: toNumber(value) })}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>
          </>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.heroText}>
            <Text style={styles.kicker}>Stok Karti Kalitesi</Text>
            <Text style={styles.title}>Urun Olcu ve Raf</Text>
            <Text style={styles.subtitle}>Mikro stok kartindaki birim, kg, olcu ve reyon bilgilerini mobilde yonetin.</Text>
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Eksik</Text>
              <Text style={[styles.heroStatValue, missingProducts.length > 0 && styles.heroStatWarning]}>{missingProducts.length}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Arama</Text>
              <Text style={styles.heroStatValue}>{results.length}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Secim</Text>
              <Text style={styles.heroStatValue}>{selectedProduct ? 'Hazir' : '-'}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Degisim</Text>
              <Text style={styles.heroStatValue}>{changedFields.length}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Eksik Veri Listesi</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={[styles.input, styles.flex]}
              value={missingSearch}
              onChangeText={setMissingSearch}
              placeholder="Eksiklerde ara"
              placeholderTextColor={colors.textMuted}
              returnKeyType="search"
              onSubmitEditing={loadMissingProducts}
            />
            <TouchableOpacity style={styles.primaryButton} onPress={loadMissingProducts} disabled={loadingMissing}>
              <Text style={styles.primaryButtonText}>{loadingMissing ? '...' : 'Getir'}</Text>
            </TouchableOpacity>
          </View>
          {loadingMissing ? <ActivityIndicator color={colors.primary} /> : null}
          <View style={[styles.resultGrid, isWide && styles.resultGridWide]}>
            {missingProducts.slice(0, 8).map((item) => (
              <TouchableOpacity key={`missing-${item.productCode}`} style={[styles.resultCard, isWide && styles.resultCardWide]} onPress={() => loadProduct(item.productCode)}>
                <Text style={styles.resultTitle} numberOfLines={2}>{item.productName}</Text>
                <Text style={styles.resultMeta} numberOfLines={1}>{item.productCode}</Text>
                {!!item.missing?.length && <Text style={styles.missingText} numberOfLines={2}>{item.missing.join(' | ')}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Urun Ara</Text>
          <TextInput
            style={styles.input}
            value={search}
            onChangeText={setSearch}
            placeholder="Stok kodu veya urun adi"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            onSubmitEditing={searchProducts}
          />
          {loadingSearch ? <ActivityIndicator color={colors.primary} /> : null}
          <View style={[styles.resultGrid, isWide && styles.resultGridWide]}>
            {results.slice(0, 10).map((item) => (
              <TouchableOpacity key={`search-${item.productCode}`} style={[styles.resultCard, isWide && styles.resultCardWide]} onPress={() => loadProduct(item.productCode)}>
                <Text style={styles.resultTitle} numberOfLines={2}>{item.productName}</Text>
                <Text style={styles.resultMeta} numberOfLines={1}>{item.productCode} - Stok: {formatNumber(item.stockQuantity, 0)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {loadingProduct ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : selectedProduct ? (
          <View style={styles.section}>
            <View style={styles.productHeader}>
              {selectedProduct.imageUrl ? (
                <Image source={{ uri: selectedProduct.imageUrl }} style={styles.productImage} />
              ) : (
                <View style={styles.productImagePlaceholder}>
                  <Text style={styles.productImageText}>Gorsel yok</Text>
                </View>
              )}
              <View style={styles.productText}>
                <Text style={styles.productTitle} numberOfLines={2}>{selectedProduct.productName}</Text>
                <Text style={styles.resultMeta} numberOfLines={1}>{selectedProduct.productCode}</Text>
                <Text style={styles.resultMeta} numberOfLines={1}>Stok: {formatNumber(selectedProduct.stockQuantity, 0)}</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Raf / Reyon</Text>
            <TextInput
              style={styles.input}
              value={shelfSearch}
              onChangeText={setShelfSearch}
              placeholder="Raf kodu veya adi ara"
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.shelfWrap}>
              {shelves.slice(0, 12).map((shelf) => (
                <TouchableOpacity
                  key={shelf.code}
                  style={[styles.shelfChip, selectedProduct.shelfCode === shelf.code && styles.shelfChipActive]}
                  onPress={() => selectShelf(shelf)}
                >
                  <Text style={selectedProduct.shelfCode === shelf.code ? styles.shelfTextActive : styles.shelfText}>
                    {shelf.code} - {shelf.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.selectedShelf}>
              Secili: {selectedProduct.shelfCode || '-'} {selectedProduct.shelfName ? `- ${selectedProduct.shelfName}` : ''}
            </Text>

            {selectedProduct.units.map(renderUnit)}

            {changedFields.length > 0 && (
              <View style={styles.changeBox}>
                <Text style={styles.changeTitle}>Degisen Alanlar</Text>
                <Text style={styles.changeText}>{changedFields.join(', ')}</Text>
              </View>
            )}

            <TouchableOpacity style={[styles.saveButton, (saving || saveConfirmOpen) && styles.buttonDisabled]} onPress={saveProduct} disabled={saving || saveConfirmOpen}>
              <Text style={styles.saveButtonText}>{saving ? 'Kaydediliyor...' : 'Mikroya Kaydet'}</Text>
            </TouchableOpacity>

            {history.length > 0 && (
              <View style={styles.historyBox}>
                <Text style={styles.sectionTitle}>Son Degisiklikler</Text>
                {history.slice(0, 5).map((item) => (
                  <Text key={item.id} style={styles.historyText}>
                    {String(item.createdAt || '').slice(0, 10)} - {item.changedByName || 'Kullanici'}
                  </Text>
                ))}
              </View>
            )}
          </View>
        ) : null}
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
  heroText: { gap: spacing.xs },
  kicker: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: '#93C5FD', textTransform: 'uppercase' },
  title: { fontFamily: fonts.bold, fontSize: fontSizes.xxl, color: '#FFFFFF' },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSizes.md, color: '#DDE8FF', lineHeight: 22 },
  heroStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  heroStat: { flex: 1, minWidth: 118, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', borderRadius: radius.lg, padding: spacing.md, backgroundColor: 'rgba(255,255,255,0.08)' },
  heroStatLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: '#BCD2F7' },
  heroStatValue: { fontFamily: fonts.bold, fontSize: fontSizes.xl, color: '#FFFFFF', marginTop: spacing.xs },
  heroStatWarning: { color: '#FCD34D' },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text },
  searchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flex: 1, minWidth: 180 },
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
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  primaryButtonText: { fontFamily: fonts.semibold, color: '#FFFFFF' },
  resultGrid: { gap: spacing.sm },
  resultGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  resultCard: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 3,
  },
  resultCardWide: { width: '48.7%' },
  resultTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  resultMeta: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  missingText: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.danger, lineHeight: 18 },
  error: { fontFamily: fonts.medium, color: colors.danger },
  loading: { alignItems: 'center', padding: spacing.lg },
  productHeader: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  productImage: { width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  productImagePlaceholder: {
    width: 76,
    height: 76,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productImageText: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  productText: { flex: 1, minWidth: 0 },
  productTitle: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text },
  shelfWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  shelfChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceMuted,
  },
  shelfChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  shelfText: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.text },
  shelfTextActive: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: '#FFFFFF' },
  selectedShelf: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  unitCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  unitDisabled: { opacity: 0.72 },
  unitHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  unitTitle: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: colors.text },
  smallPill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  smallPillActive: { backgroundColor: colors.successSoft, borderColor: '#86EFAC' },
  smallPillText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.textMuted },
  smallPillTextActive: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.success },
  fieldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  fieldHalf: { flex: 1, minWidth: 140 },
  fieldThird: { flex: 1, minWidth: 98 },
  label: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.textMuted, marginBottom: 4 },
  readonlyValue: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.bold,
    color: colors.text,
  },
  segment: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  segmentButton: { flex: 1, minWidth: 96, alignItems: 'center', borderRadius: radius.sm, paddingVertical: spacing.sm },
  segmentButtonActive: { backgroundColor: colors.primary },
  segmentText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.textMuted },
  segmentTextActive: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: '#FFFFFF' },
  changeBox: {
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: spacing.md,
  },
  changeTitle: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.warning },
  changeText: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.warning, marginTop: spacing.xs, lineHeight: 20 },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  saveButtonText: { fontFamily: fonts.bold, color: '#FFFFFF', fontSize: fontSizes.md },
  buttonDisabled: { opacity: 0.6 },
  historyBox: { gap: spacing.xs },
  historyText: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
});
