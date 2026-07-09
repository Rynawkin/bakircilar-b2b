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

import {
  PassiveStockItem,
  StockCreateExtraUnit,
  StockCreateInput,
  StockCreateLookupItem,
  StockCreateLookupType,
  StockCreateMetadata,
  StockCreatePreviewRow,
  adminApi,
} from '../api/admin';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
import { hapticSuccess } from '../utils/haptics';
import { normalizeSearchText } from '../utils/search';

type FormMode = 'idle' | 'create' | 'activate';

type FamilyOption = {
  id: string;
  name: string;
  code?: string | null;
  members: Array<{ productCode: string; productName: string }>;
};

type LookupState = Record<StockCreateLookupType, {
  search: string;
  items: StockCreateLookupItem[];
  loading: boolean;
  error: string | null;
}>;

const lookupTypes: StockCreateLookupType[] = ['template', 'supplier', 'brand', 'category', 'package'];

const emptyLookupState = (): LookupState =>
  lookupTypes.reduce((acc, type) => {
    acc[type] = { search: '', items: [], loading: false, error: null };
    return acc;
  }, {} as LookupState);

const lookupTitle: Record<StockCreateLookupType, string> = {
  template: 'Sablon sec',
  supplier: 'Ana saglayici sec',
  brand: 'Marka sec',
  category: 'Kategori sec',
  package: 'Ambalaj sec',
};

const lookupPlaceholder: Record<StockCreateLookupType, string> = {
  template: 'Sablon kodu veya adi',
  supplier: 'Saglayici kodu veya unvani',
  brand: 'Marka kodu veya adi',
  category: 'Kategori kodu veya adi',
  package: 'Ambalaj kodu veya adi',
};

const formatCost = (value?: number) => {
  if (value == null || !Number.isFinite(value) || value <= 0) return '-';
  return `${value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
};

const defaultForm = (templateCode = 'B108423'): StockCreateInput => ({
  templateCode,
  name: '',
  foreignName: '',
  shortName: '',
  vatRatePercent: '20',
  supplierCode: '',
  brandCode: '',
  brandName: '',
  categoryCode: '',
  packageCode: '',
  packageName: '',
  shelfCode: '',
  currentCost: '',
  costT: '',
  costP: '',
  mainUnit: 'ADET',
  mainUnitWeightKg: '',
  mainUnitWidthCm: '',
  mainUnitLengthCm: '',
  mainUnitHeightCm: '',
  margins: ['', '', '', '', ''],
  barcode: '',
  notes: '',
  extraUnits: [],
  calculateMinMax: true,
});

const emptyExtraUnit = (index: number): StockCreateExtraUnit => ({
  index,
  name: '',
  factor: '',
  factorDirection: 'larger',
  weightKg: '',
  widthCm: '',
  lengthCm: '',
  heightCm: '',
});

const asText = (value: unknown) => String(value ?? '');

const parseNumber = (value: unknown) => {
  const parsed = Number(String(value ?? '').trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const costPFromCostT = (costT: unknown, vat: unknown) => {
  const cost = parseNumber(costT);
  const vatRate = parseNumber(vat || 20);
  if (cost <= 0) return '';
  return String(Math.round(cost * (1 + vatRate / 200) * 10000) / 10000).replace('.', ',');
};

const mapFamilyOptions = (list: any[]): FamilyOption[] =>
  (list || []).map((family) => ({
    id: String(family.id),
    name: family.name || family.code || String(family.id),
    code: family.code ?? null,
    members: (family.items || [])
      .filter((item: any) => item && item.active !== false)
      .map((item: any) => ({
        productCode: String(item.productCode || ''),
        productName: String(item.productName || item.productCode || ''),
      })),
  }));

const familyMatches = (family: FamilyOption, search: string) => {
  const term = normalizeSearchText(search);
  if (!term) return true;
  return normalizeSearchText(`${family.name} ${family.code || ''} ${family.members.map((item) => `${item.productCode} ${item.productName}`).join(' ')}`).includes(term);
};

export function PassiveStocksScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 840;
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<PassiveStockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const [metadata, setMetadata] = useState<StockCreateMetadata | null>(null);
  const [stockFamilyOptions, setStockFamilyOptions] = useState<FamilyOption[]>([]);
  const [priceFamilyOptions, setPriceFamilyOptions] = useState<FamilyOption[]>([]);
  const [stockFamilySearch, setStockFamilySearch] = useState('');
  const [priceFamilySearch, setPriceFamilySearch] = useState('');
  const [selectedStockFamilyIds, setSelectedStockFamilyIds] = useState<string[]>([]);
  const [selectedPriceFamilyId, setSelectedPriceFamilyId] = useState<string | null>(null);
  const [lookups, setLookups] = useState<LookupState>(emptyLookupState);
  const [mode, setMode] = useState<FormMode>('idle');
  const [selectedPassive, setSelectedPassive] = useState<PassiveStockItem | null>(null);
  const [form, setForm] = useState<StockCreateInput>(defaultForm());
  const [imageAsset, setImageAsset] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [previewRows, setPreviewRows] = useState<StockCreatePreviewRow[]>([]);
  const [formLoading, setFormLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);

  useEffect(() => {
    adminApi.getStockCreateMetadata()
      .then((response) => {
        setMetadata(response);
        setForm((prev) => ({ ...prev, templateCode: prev.templateCode || response.defaultTemplateCode || 'B108423' }));
      })
      .catch(() => undefined);
    loadFamilies();
  }, []);

  const loadFamilies = async () => {
    try {
      const [stockRes, priceRes] = await Promise.all([
        adminApi.getProductFamilies(),
        adminApi.getPriceFamilies(),
      ]);
      setStockFamilyOptions(mapFamilyOptions(stockRes.data || []));
      setPriceFamilyOptions(mapFamilyOptions(priceRes.data || []));
    } catch {
      setStockFamilyOptions([]);
      setPriceFamilyOptions([]);
    }
  };

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) {
      setItems([]);
      setSearched(false);
      setLoading(false);
      setError(null);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    const handle = setTimeout(async () => {
      try {
        const response = await adminApi.listPassiveStocks(term, 50);
        if (requestIdRef.current !== requestId) return;
        setItems(response.items || []);
        setSearched(true);
      } catch (err: any) {
        if (requestIdRef.current !== requestId) return;
        setItems([]);
        setSearched(true);
        setError(getApiErrorMessage(err, 'Pasif stoklar alinamadi.'));
      } finally {
        if (requestIdRef.current === requestId) setLoading(false);
      }
    }, 350);

    return () => clearTimeout(handle);
  }, [search]);

  const previewStatus = useMemo(() => {
    const row = previewRows[0];
    if (!row) return null;
    return {
      status: row.status,
      text: row.status === 'error' ? `${row.errors.length} hata` : row.status === 'warning' ? `${row.warnings.length} uyari` : 'Kayda hazir',
    };
  }, [previewRows]);

  const patchForm = (patch: Partial<StockCreateInput>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setPreviewRows([]);
  };

  const patchLookup = (type: StockCreateLookupType, patch: Partial<LookupState[StockCreateLookupType]>) => {
    setLookups((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        ...patch,
      },
    }));
  };

  const loadLookup = async (type: StockCreateLookupType) => {
    if (lookups[type].loading) return;
    const term = lookups[type].search.trim();
    patchLookup(type, { loading: true, error: null });
    try {
      const response = await adminApi.getStockCreateLookups(type, { search: term || undefined, limit: 12 });
      patchLookup(type, { items: response.items || [], loading: false, error: null });
    } catch (err: any) {
      patchLookup(type, {
        items: [],
        loading: false,
        error: getApiErrorMessage(err, 'Arama yapilamadi.'),
      });
    }
  };

  const clearLookup = (type: StockCreateLookupType) => {
    patchLookup(type, { search: '', items: [], loading: false, error: null });
  };

  const applyLookup = (type: StockCreateLookupType, item: StockCreateLookupItem) => {
    const code = String(item.code || '').trim();
    const name = String(item.name || '').trim();
    if (!code) return;

    if (type === 'template') {
      patchForm({ templateCode: code });
    } else if (type === 'supplier') {
      patchForm({ supplierCode: code });
    } else if (type === 'brand') {
      patchForm({ brandCode: code, brandName: name || form.brandName });
    } else if (type === 'category') {
      patchForm({ categoryCode: code });
    } else if (type === 'package') {
      patchForm({ packageCode: code, packageName: name || form.packageName });
    }

    patchLookup(type, {
      search: name ? `${code} ${name}` : code,
      items: [],
      loading: false,
      error: null,
    });
  };

  const patchMargin = (index: number, value: string) => {
    const margins = [...(form.margins || ['', '', '', '', ''])];
    margins[index] = value;
    patchForm({ margins });
  };

  const loadPassiveForActivate = async (item: PassiveStockItem) => {
    if (formLoading || submitting) return;
    setFormLoading(true);
    setMode('activate');
    setSelectedPassive(item);
    setImageAsset(null);
    setPreviewRows([]);
    setSelectedStockFamilyIds([]);
    setSelectedPriceFamilyId(null);
    setLookups(emptyLookupState());
    try {
      const response = await adminApi.getStockCreateStock(item.code);
      const stock = response.stock || {};
      setForm({
        ...defaultForm(stock.templateCode || item.code),
        ...stock,
        templateCode: stock.templateCode || item.code,
        stockCode: item.code,
      });
    } catch (err: any) {
      setForm({
        ...defaultForm(metadata?.defaultTemplateCode || item.code),
        stockCode: item.code,
        templateCode: item.code,
        name: item.name,
        supplierCode: item.supplierCode || '',
        categoryCode: item.categoryCode || '',
        currentCost: item.currentCost ? String(item.currentCost) : '',
        costT: item.currentCost ? String(item.currentCost) : '',
      });
      Alert.alert('Pasif stok', getApiErrorMessage(err, 'Stok detaylari alinamadi; liste bilgisinden form acildi.'));
    } finally {
      setFormLoading(false);
    }
  };

  const openCreateForm = () => {
    if (formLoading || submitting) return;
    setMode('create');
    setSelectedPassive(null);
    setImageAsset(null);
    setPreviewRows([]);
    setSelectedStockFamilyIds([]);
    setSelectedPriceFamilyId(null);
    setLookups(emptyLookupState());
    setForm(defaultForm(metadata?.defaultTemplateCode || 'B108423'));
  };

  const pickImage = async () => {
    if (submitting) return;
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: 'image/*',
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    if (asset.mimeType && !asset.mimeType.startsWith('image/')) {
      Alert.alert('Dosya tipi', 'Lutfen gorsel dosyasi secin.');
      return;
    }
    if (asset.size && asset.size > 5 * 1024 * 1024) {
      Alert.alert('Dosya boyutu', 'Gorsel 5MB altinda olmali.');
      return;
    }
    setImageAsset(asset);
  };

  const buildItem = (): StockCreateInput => ({
    ...form,
    stockCode: mode === 'activate' ? selectedPassive?.code || form.stockCode : undefined,
    templateCode: form.templateCode || metadata?.defaultTemplateCode || 'B108423',
    margins: form.margins || ['', '', '', '', ''],
    calculateMinMax: form.calculateMinMax !== false,
  });

  const toggleStockFamily = (familyId: string) => {
    setSelectedStockFamilyIds((prev) =>
      prev.includes(familyId) ? prev.filter((id) => id !== familyId) : [...prev, familyId]
    );
  };

  const addExtraUnit = () => {
    const units = Array.isArray(form.extraUnits) ? form.extraUnits : [];
    const used = new Set(units.map((unit) => Number(unit.index)));
    const nextIndex = [2, 3, 4].find((index) => !used.has(index));
    if (!nextIndex) return;
    patchForm({ extraUnits: [...units, emptyExtraUnit(nextIndex)] });
  };

  const updateExtraUnit = (index: number, patch: Partial<StockCreateExtraUnit>) => {
    const units = Array.isArray(form.extraUnits) ? form.extraUnits : [];
    patchForm({
      extraUnits: units.map((unit) => (Number(unit.index) === index ? { ...unit, ...patch } : unit)),
    });
  };

  const removeExtraUnit = (index: number) => {
    const units = Array.isArray(form.extraUnits) ? form.extraUnits : [];
    patchForm({ extraUnits: units.filter((unit) => Number(unit.index) !== index) });
  };

  const renderExtraUnit = (unit: StockCreateExtraUnit) => {
    const index = Number(unit.index);
    return (
      <View key={`extra-unit-${index}`} style={styles.unitCard}>
        <View style={styles.unitHeader}>
          <Text style={styles.unitTitle}>{index}. Birim</Text>
          <TouchableOpacity style={styles.smallDangerButton} onPress={() => removeExtraUnit(index)}>
            <Text style={styles.smallDangerText}>Kaldir</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex]}
            value={asText(unit.name)}
            onChangeText={(value) => updateExtraUnit(index, { name: value.toUpperCase() })}
            placeholder="Birim adi"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
          />
          <TextInput
            style={[styles.input, styles.flex]}
            value={asText(unit.factor)}
            onChangeText={(value) => updateExtraUnit(index, { factor: value })}
            placeholder="Katsayi"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.segment}>
          <TouchableOpacity
            style={[styles.segmentButton, unit.factorDirection !== 'smaller' && styles.segmentButtonActive]}
            onPress={() => updateExtraUnit(index, { factorDirection: 'larger' })}
          >
            <Text style={unit.factorDirection !== 'smaller' ? styles.segmentTextActive : styles.segmentText}>Buyuk birim</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentButton, unit.factorDirection === 'smaller' && styles.segmentButtonActive]}
            onPress={() => updateExtraUnit(index, { factorDirection: 'smaller' })}
          >
            <Text style={unit.factorDirection === 'smaller' ? styles.segmentTextActive : styles.segmentText}>Ters katsayi</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.helper}>
          Buyuk birim: 1 {asText(unit.name) || 'birim'} = X {asText(form.mainUnit) || 'ana birim'}.
        </Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex]}
            value={asText(unit.weightKg)}
            onChangeText={(value) => updateExtraUnit(index, { weightKg: value })}
            placeholder="Kg"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={[styles.input, styles.flex]}
            value={asText(unit.widthCm)}
            onChangeText={(value) => updateExtraUnit(index, { widthCm: value })}
            placeholder="En cm"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex]}
            value={asText(unit.lengthCm)}
            onChangeText={(value) => updateExtraUnit(index, { lengthCm: value })}
            placeholder="Boy cm"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={[styles.input, styles.flex]}
            value={asText(unit.heightCm)}
            onChangeText={(value) => updateExtraUnit(index, { heightCm: value })}
            placeholder="Yuk. cm"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
          />
        </View>
      </View>
    );
  };

  const renderLookup = (type: StockCreateLookupType, activeCode?: unknown, activeName?: unknown) => {
    const state = lookups[type];
    const code = asText(activeCode).trim();
    const name = asText(activeName).trim();
    return (
      <View style={styles.lookupPanel}>
        <View style={styles.lookupHeader}>
          <View style={styles.flex}>
            <Text style={styles.lookupTitle}>{lookupTitle[type]}</Text>
            <Text style={styles.helper} numberOfLines={1}>
              {code ? `Secili: ${code}${name ? ` - ${name}` : ''}` : 'Opsiyonel hizli secim'}
            </Text>
          </View>
          <TouchableOpacity style={styles.smallGhostButton} onPress={() => clearLookup(type)} disabled={state.loading}>
            <Text style={styles.smallGhostText}>Temizle</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.lookupSearchRow}>
          <TextInput
            style={[styles.input, styles.flex]}
            value={state.search}
            onChangeText={(value) => patchLookup(type, { search: value })}
            onSubmitEditing={() => loadLookup(type)}
            placeholder={lookupPlaceholder[type]}
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            autoCapitalize={type === 'brand' || type === 'package' ? 'words' : 'characters'}
          />
          <TouchableOpacity style={[styles.lookupButton, state.loading && styles.disabledButton]} onPress={() => loadLookup(type)} disabled={state.loading}>
            <Text style={styles.lookupButtonText}>{state.loading ? '...' : 'Ara'}</Text>
          </TouchableOpacity>
        </View>
        {state.error ? <Text style={styles.error}>{state.error}</Text> : null}
        {state.items.length ? (
          <ScrollView style={styles.lookupResultList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {state.items.map((item) => (
              <TouchableOpacity key={`${type}-${item.code}`} style={styles.lookupResultRow} onPress={() => applyLookup(type, item)}>
                <View style={styles.flex}>
                  <Text style={styles.lookupResultCode}>{item.code}</Text>
                  <Text style={styles.lookupResultName} numberOfLines={2}>{item.name || '-'}</Text>
                </View>
                <Text style={styles.familyAction}>Sec</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}
      </View>
    );
  };

  const runPreview = async () => {
    if (formLoading || submitting) return;
    setFormLoading(true);
    try {
      const response = await adminApi.previewStockCreate([buildItem()]);
      setPreviewRows(response.results || []);
      const row = response.results?.[0];
      if (row?.status === 'error') {
        Alert.alert('On kontrol', row.errors.join('\n') || 'Hata var.');
      } else if (row?.status === 'warning') {
        Alert.alert('On kontrol', row.warnings.join('\n') || 'Uyari var.');
      }
    } catch (err: any) {
      setPreviewRows([]);
      Alert.alert('On kontrol', getApiErrorMessage(err, 'On kontrol yapilamadi.'));
    } finally {
      setFormLoading(false);
    }
  };

  const submitStock = () => {
    if (formLoading || submitting || submitConfirmOpen) return;
    const row = previewRows[0];
    if (!row) {
      Alert.alert('On kontrol gerekli', 'Mikro islemi oncesi on kontrol calistirin.');
      return;
    }
    if (row.status === 'error') {
      Alert.alert('Hata var', 'Hatali stok Mikroya yazilamaz.');
      return;
    }
    if (!imageAsset) {
      Alert.alert('Gorsel zorunlu', 'Stok acma ve pasif aktiflestirme icin gorsel secin.');
      return;
    }

    const title = mode === 'activate' ? 'Pasif stok aktiflestirilsin mi?' : 'Yeni stok karti acilsin mi?';
    const message = mode === 'activate'
      ? `${selectedPassive?.code || form.stockCode} Mikroda aktif hale getirilecek.`
      : 'Yeni stok karti Mikroda olusturulacak.';
    setSubmitConfirmOpen(true);
    Alert.alert(title, message, [
      { text: 'Vazgec', style: 'cancel', onPress: () => setSubmitConfirmOpen(false) },
      {
        text: mode === 'activate' ? 'Aktiflestir' : 'Olustur',
        style: mode === 'activate' ? 'destructive' : 'default',
        onPress: async () => {
          setSubmitConfirmOpen(false);
          if (submitting) return;
          setSubmitting(true);
          try {
            const formData = new FormData();
            formData.append('image', {
              uri: imageAsset.uri,
              name: imageAsset.name || `${selectedPassive?.code || 'stock'}.jpg`,
              type: imageAsset.mimeType || 'image/jpeg',
            } as any);
            formData.append(
              'payload',
              JSON.stringify({
                item: buildItem(),
                stockFamilyIds: selectedStockFamilyIds,
                priceFamilyId: selectedPriceFamilyId,
              })
            );
            const response = mode === 'activate'
              ? await adminApi.activateStock(formData)
              : await adminApi.createStock(formData);
            hapticSuccess();
            Alert.alert('Tamamlandi', response.stockCode ? `${response.stockCode} islendi.` : 'Islem tamamlandi.');
            setMode('idle');
            setSelectedPassive(null);
            setImageAsset(null);
            setPreviewRows([]);
            if (mode === 'activate' && search.trim().length >= 2) {
              const refreshed = await adminApi.listPassiveStocks(search.trim(), 50);
              setItems(refreshed.items || []);
            }
          } catch (err: any) {
            Alert.alert('Islem tamamlanamadi', getApiErrorMessage(err, 'Mikro islemi basarisiz.'));
          } finally {
            setSubmitting(false);
          }
        },
      },
    ], { cancelable: true, onDismiss: () => setSubmitConfirmOpen(false) });
  };

  const renderForm = () => {
    if (mode === 'idle') return null;
    const margins = form.margins || ['', '', '', '', ''];
    const extraUnits = Array.isArray(form.extraUnits) ? form.extraUnits : [];
    const visibleStockFamilies = stockFamilyOptions.filter((family) => familyMatches(family, stockFamilySearch)).slice(0, 16);
    const visiblePriceFamilies = priceFamilyOptions.filter((family) => familyMatches(family, priceFamilySearch)).slice(0, 16);
    const selectedPriceFamily = selectedPriceFamilyId ? priceFamilyOptions.find((family) => family.id === selectedPriceFamilyId) : null;
    return (
      <View style={styles.formCard}>
        <View style={styles.formHeader}>
          <View style={styles.flex}>
            <Text style={styles.formTitle}>{mode === 'activate' ? 'Pasif Stok Aktiflestir' : 'Yeni Stok Ac'}</Text>
            <Text style={styles.formSubtitle}>
              {mode === 'activate'
                ? `${selectedPassive?.code || form.stockCode || '-'} - gorsel ve zorunlu alanlar gerekir.`
                : `Sablon: ${form.templateCode || metadata?.defaultTemplateCode || '-'} - gorsel zorunlu.`}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setMode('idle')} disabled={submitting}>
            <Text style={styles.closeText}>Kapat</Text>
          </TouchableOpacity>
        </View>

        {formLoading ? <ActivityIndicator color={colors.primary} /> : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Temel bilgiler</Text>
          <TextInput style={styles.input} value={asText(form.templateCode)} onChangeText={(value) => patchForm({ templateCode: value })} placeholder="Sablon stok kodu" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
          {renderLookup('template', form.templateCode)}
          {mode === 'activate' && <TextInput style={[styles.input, styles.disabledInput]} value={selectedPassive?.code || asText(form.stockCode)} editable={false} />}
          <TextInput style={styles.input} value={asText(form.name)} onChangeText={(value) => patchForm({ name: value })} placeholder="Stok adi" placeholderTextColor={colors.textMuted} />
          <TextInput style={styles.input} value={asText(form.foreignName)} onChangeText={(value) => patchForm({ foreignName: value })} placeholder="Tedarikci urun kodu / yabanci isim" placeholderTextColor={colors.textMuted} />
          <View style={styles.row}>
            <TextInput style={[styles.input, styles.flex]} value={asText(form.vatRatePercent)} onChangeText={(value) => patchForm({ vatRatePercent: value, costP: costPFromCostT(form.costT, value) })} placeholder="KDV %" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
            <TextInput style={[styles.input, styles.flex]} value={asText(form.mainUnit)} onChangeText={(value) => patchForm({ mainUnit: value })} placeholder="Ana birim" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Kodlar</Text>
          <TextInput style={styles.input} value={asText(form.supplierCode)} onChangeText={(value) => patchForm({ supplierCode: value })} placeholder="Ana saglayici kodu (320...)" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
          {renderLookup('supplier', form.supplierCode)}
          <View style={styles.row}>
            <TextInput style={[styles.input, styles.flex]} value={asText(form.brandCode)} onChangeText={(value) => patchForm({ brandCode: value })} placeholder="Marka kodu" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
            <TextInput style={[styles.input, styles.flex]} value={asText(form.brandName)} onChangeText={(value) => patchForm({ brandName: value })} placeholder="Marka adi" placeholderTextColor={colors.textMuted} />
          </View>
          {renderLookup('brand', form.brandCode, form.brandName)}
          <TextInput style={styles.input} value={asText(form.categoryCode)} onChangeText={(value) => patchForm({ categoryCode: value })} placeholder="En alt kategori kodu (orn. 1.09.04)" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
          {renderLookup('category', form.categoryCode)}
          <View style={styles.row}>
            <TextInput style={[styles.input, styles.flex]} value={asText(form.packageCode)} onChangeText={(value) => patchForm({ packageCode: value })} placeholder="Ambalaj kodu" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
            <TextInput style={[styles.input, styles.flex]} value={asText(form.packageName)} onChangeText={(value) => patchForm({ packageName: value })} placeholder="Ambalaj adi" placeholderTextColor={colors.textMuted} />
          </View>
          {renderLookup('package', form.packageCode, form.packageName)}
          <TextInput style={styles.input} value={asText(form.shelfCode)} onChangeText={(value) => patchForm({ shelfCode: value })} placeholder="Raf/Reyon kodu" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Maliyet, marj ve olcu</Text>
          <View style={styles.row}>
            <TextInput style={[styles.input, styles.flex]} value={asText(form.costT)} onChangeText={(value) => patchForm({ costT: value, currentCost: value, costP: costPFromCostT(value, form.vatRatePercent) })} placeholder="Maliyet T" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
            <TextInput style={[styles.input, styles.flex]} value={asText(form.costP)} onChangeText={(value) => patchForm({ costP: value })} placeholder="Maliyet P" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
          </View>
          <View style={styles.marginGrid}>
            {margins.map((margin, index) => (
              <TextInput key={index} style={styles.marginInput} value={asText(margin)} onChangeText={(value) => patchMargin(index, value)} placeholder={`M${index + 1}`} placeholderTextColor={colors.textMuted} keyboardType="numeric" />
            ))}
          </View>
          <View style={styles.row}>
            <TextInput style={[styles.input, styles.flex]} value={asText(form.mainUnitWeightKg)} onChangeText={(value) => patchForm({ mainUnitWeightKg: value })} placeholder="Kg" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
            <TextInput style={[styles.input, styles.flex]} value={asText(form.mainUnitWidthCm)} onChangeText={(value) => patchForm({ mainUnitWidthCm: value })} placeholder="En cm" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
            <TextInput style={[styles.input, styles.flex]} value={asText(form.mainUnitLengthCm)} onChangeText={(value) => patchForm({ mainUnitLengthCm: value })} placeholder="Boy cm" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
            <TextInput style={[styles.input, styles.flex]} value={asText(form.mainUnitHeightCm)} onChangeText={(value) => patchForm({ mainUnitHeightCm: value })} placeholder="Yuk. cm" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
          </View>

          <View style={styles.extraUnitPanel}>
            <View style={styles.familyHeader}>
              <View style={styles.flex}>
                <Text style={styles.familyTitle}>Ek birimler</Text>
                <Text style={styles.helper}>2-4. birimler opsiyonel; en fazla 3 satir.</Text>
              </View>
              <TouchableOpacity style={[styles.smallGhostButton, extraUnits.length >= 3 && styles.disabledButton]} onPress={addExtraUnit} disabled={extraUnits.length >= 3}>
                <Text style={styles.smallGhostText}>Birim Ekle</Text>
              </TouchableOpacity>
            </View>
            {extraUnits.length ? extraUnits.map(renderExtraUnit) : (
              <Text style={styles.emptyText}>Ek birim yok. Koli/paket gibi farkli birim gerekiyorsa ekleyin.</Text>
            )}
          </View>

          <TextInput style={styles.input} value={asText(form.barcode)} onChangeText={(value) => patchForm({ barcode: value })} placeholder="Barkod" placeholderTextColor={colors.textMuted} />
          <TextInput style={styles.input} value={asText(form.notes)} onChangeText={(value) => patchForm({ notes: value })} placeholder="Islem notu" placeholderTextColor={colors.textMuted} />
          <View style={styles.switchRow}>
            <TouchableOpacity style={[styles.switchButton, form.calculateMinMax !== false && styles.switchActive]} onPress={() => patchForm({ calculateMinMax: true })}>
              <Text style={form.calculateMinMax !== false ? styles.switchTextActive : styles.switchText}>Min-max hesaplansin</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.switchButton, form.calculateMinMax === false && styles.switchActive]} onPress={() => patchForm({ calculateMinMax: false })}>
              <Text style={form.calculateMinMax === false ? styles.switchTextActive : styles.switchText}>Haric tut</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Aile atamalari</Text>
          <Text style={styles.helper}>Opsiyonel. Stok acildiktan/aktiflestikten sonra urun secilen stok ailelerine ve tek fiyat ailesine eklenir.</Text>
          <View style={styles.familyPanel}>
            <View style={styles.familyHeader}>
              <View style={styles.flex}>
                <Text style={styles.familyTitle}>Stok aileleri</Text>
                <Text style={styles.helper}>{selectedStockFamilyIds.length} aile secili</Text>
              </View>
              <TouchableOpacity style={styles.smallGhostButton} onPress={() => setSelectedStockFamilyIds([])}>
                <Text style={styles.smallGhostText}>Temizle</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              value={stockFamilySearch}
              onChangeText={setStockFamilySearch}
              placeholder="Aile adi, kodu veya icindeki urun"
              placeholderTextColor={colors.textMuted}
            />
            {visibleStockFamilies.length ? visibleStockFamilies.map((family) => {
              const selected = selectedStockFamilyIds.includes(family.id);
              const preview = family.members.slice(0, 3).map((item) => item.productCode).filter(Boolean).join(', ');
              return (
                <TouchableOpacity key={family.id} style={[styles.familyRow, selected && styles.familyRowSelected]} onPress={() => toggleStockFamily(family.id)}>
                  <View style={styles.flex}>
                    <Text style={styles.familyName}>{family.name}</Text>
                    <Text style={styles.familyMeta}>
                      {family.code || '-'} · {family.members.length} urun{preview ? ` · ${preview}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.familyAction, selected && styles.familyActionSelected]}>{selected ? 'Secildi' : 'Sec'}</Text>
                </TouchableOpacity>
              );
            }) : (
              <Text style={styles.emptyText}>Stok ailesi bulunamadi.</Text>
            )}
          </View>

          <View style={styles.familyPanel}>
            <View style={styles.familyHeader}>
              <View style={styles.flex}>
                <Text style={styles.familyTitle}>Fiyat ailesi</Text>
                <Text style={styles.helper}>{selectedPriceFamily ? selectedPriceFamily.name : 'Secili fiyat ailesi yok'}</Text>
              </View>
              <TouchableOpacity style={styles.smallGhostButton} onPress={() => setSelectedPriceFamilyId(null)}>
                <Text style={styles.smallGhostText}>Yok</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              value={priceFamilySearch}
              onChangeText={setPriceFamilySearch}
              placeholder="Fiyat ailesi adi, kodu veya urun"
              placeholderTextColor={colors.textMuted}
            />
            {visiblePriceFamilies.length ? visiblePriceFamilies.map((family) => {
              const selected = selectedPriceFamilyId === family.id;
              const preview = family.members.slice(0, 3).map((item) => item.productCode).filter(Boolean).join(', ');
              return (
                <TouchableOpacity key={family.id} style={[styles.familyRow, selected && styles.familyRowSelected]} onPress={() => setSelectedPriceFamilyId(selected ? null : family.id)}>
                  <View style={styles.flex}>
                    <Text style={styles.familyName}>{family.name}</Text>
                    <Text style={styles.familyMeta}>
                      {family.code || '-'} · {family.members.length} urun{preview ? ` · ${preview}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.familyAction, selected && styles.familyActionSelected]}>{selected ? 'Secili' : 'Sec'}</Text>
                </TouchableOpacity>
              );
            }) : (
              <Text style={styles.emptyText}>Fiyat ailesi bulunamadi.</Text>
            )}
          </View>
        </View>

        <View style={styles.imageBox}>
          {imageAsset?.uri ? <Image source={{ uri: imageAsset.uri }} style={styles.previewImage} resizeMode="cover" /> : <Text style={styles.emptyText}>Gorsel secilmedi.</Text>}
          <TouchableOpacity style={[styles.secondaryButton, submitting && styles.disabledButton]} onPress={pickImage} disabled={submitting}>
            <Text style={styles.secondaryButtonText}>{imageAsset ? 'Gorseli Degistir' : 'Gorsel Sec'}</Text>
          </TouchableOpacity>
        </View>

        {previewStatus && (
          <View style={[styles.previewBox, previewStatus.status === 'error' && styles.previewError, previewStatus.status === 'warning' && styles.previewWarning]}>
            <Text style={styles.previewTitle}>{previewRows[0]?.previewCode || selectedPassive?.code || 'On kontrol'}</Text>
            <Text style={styles.previewText}>{previewStatus.text}</Text>
            {previewRows[0]?.errors.map((err) => <Text key={err} style={styles.previewText}>- {err}</Text>)}
            {previewRows[0]?.warnings.map((warning) => <Text key={warning} style={styles.previewText}>- {warning}</Text>)}
          </View>
        )}

        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.secondaryButton, (formLoading || submitting) && styles.disabledButton]} onPress={runPreview} disabled={formLoading || submitting}>
            <Text style={styles.secondaryButtonText}>{formLoading ? 'Kontrol...' : 'On Kontrol'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.primaryButton, (formLoading || submitting || submitConfirmOpen) && styles.disabledButton]} onPress={submitStock} disabled={formLoading || submitting || submitConfirmOpen}>
            <Text style={styles.primaryButtonText}>{submitting ? 'Isleniyor...' : mode === 'activate' ? 'Aktiflestir' : 'Stok Ac'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.kicker}>Stok Karti Operasyonu</Text>
          <Text style={styles.title}>Pasif Stoklar</Text>
          <Text style={styles.subtitle}>Mikroda pasif olan stok kartlarini bulun, gorsel ve zorunlu alanlarla aktiflestirin veya yeni stok acin.</Text>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Sonuc</Text>
              <Text style={styles.heroStatValue}>{items.length}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Stok Ailesi</Text>
              <Text style={styles.heroStatValue}>{selectedStockFamilyIds.length}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Fiyat Ailesi</Text>
              <Text style={styles.heroStatValue}>{selectedPriceFamilyId ? 'Secili' : '-'}</Text>
            </View>
          </View>
          <TouchableOpacity style={[styles.headerButton, (formLoading || submitting) && styles.disabledButton]} onPress={openCreateForm} disabled={formLoading || submitting}>
            <Text style={styles.headerButtonText}>Yeni Stok Ac</Text>
          </TouchableOpacity>
        </View>

        {renderForm()}

        <View style={styles.searchCard}>
          <Text style={styles.label}>Pasif stok ara</Text>
          <TextInput
            style={styles.input}
            value={search}
            onChangeText={setSearch}
            placeholder="Kod veya stok adi, en az 2 karakter"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
          />
          <Text style={styles.helper}>Aktiflestirme formu pasif stoktan otomatik dolar; on kontrol ve gorsel zorunludur.</Text>
        </View>

        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : search.trim().length < 2 ? (
          <Text style={styles.emptyText}>Listelemek icin en az 2 karakter yazin.</Text>
        ) : searched && items.length === 0 ? (
          <Text style={styles.emptyText}>Pasif stok bulunamadi.</Text>
        ) : (
          <>
            {items.length > 0 && <Text style={styles.resultCount}>{items.length} kayit</Text>}
            <View style={styles.resultGrid}>
              {items.map((item) => (
                <View key={item.code} style={isWide ? styles.resultGridItem : undefined}>
                  <View style={styles.card}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{item.name || '-'}</Text>
                    <Text style={styles.cardCode} numberOfLines={1}>{item.code}</Text>
                    <View style={styles.metaGrid}>
                      <View style={styles.metaBox}>
                        <Text style={styles.metaLabel}>Kategori</Text>
                        <Text style={styles.metaValue} numberOfLines={1}>{item.categoryCode || '-'}</Text>
                      </View>
                      <View style={styles.metaBox}>
                        <Text style={styles.metaLabel}>Saglayici</Text>
                        <Text style={styles.metaValue} numberOfLines={1}>{item.supplierCode || '-'}</Text>
                      </View>
                      <View style={styles.metaBox}>
                        <Text style={styles.metaLabel}>Maliyet</Text>
                        <Text style={styles.metaValue} numberOfLines={1}>{formatCost(item.currentCost)}</Text>
                      </View>
                    </View>
                    <TouchableOpacity style={[styles.primaryButton, (formLoading || submitting) && styles.disabledButton]} onPress={() => loadPassiveForActivate(item)} disabled={formLoading || submitting}>
                      <Text style={styles.primaryButtonText}>Aktiflestirme Formunu Ac</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { paddingVertical: spacing.xs, gap: spacing.md },
  kicker: { fontFamily: fonts.bold, fontSize: fontSizes.xs, color: '#93C5FD', letterSpacing: 0.4, textTransform: 'uppercase' },
  title: { fontFamily: fonts.bold, fontSize: fontSizes.xxl, color: '#FFFFFF' },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSizes.md, color: '#DDE8FF', lineHeight: 22 },
  heroStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  heroStat: { flex: 1, minWidth: 96, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', borderRadius: radius.lg, padding: spacing.md },
  heroStatLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: '#BCD2F7' },
  heroStatValue: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: '#FFFFFF', marginTop: 4 },
  headerButton: { backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center', marginTop: spacing.sm },
  headerButtonText: { fontFamily: fonts.bold, color: colors.primarySoft },
  formCard: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  formHeader: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  flex: { flex: 1 },
  formTitle: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text },
  formSubtitle: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.textMuted, lineHeight: 20, marginTop: 2 },
  closeText: { fontFamily: fonts.bold, color: colors.danger },
  fieldGroup: { gap: spacing.sm },
  searchCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  label: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.textMuted },
  input: { minHeight: 46, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border, fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.text },
  disabledInput: { backgroundColor: colors.surfaceMuted, color: colors.textMuted },
  helper: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted, lineHeight: 18 },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  marginGrid: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  marginInput: { width: 74, minHeight: 46, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, color: colors.text, fontFamily: fonts.regular },
  switchRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  switchButton: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  switchActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  switchText: { fontFamily: fonts.semibold, color: colors.textMuted, fontSize: fontSizes.sm },
  switchTextActive: { fontFamily: fonts.bold, color: '#FFFFFF', fontSize: fontSizes.sm },
  lookupPanel: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  lookupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lookupTitle: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.text },
  lookupSearchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  lookupButton: {
    minHeight: 46,
    minWidth: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
  },
  lookupButtonText: { fontFamily: fonts.bold, color: '#FFFFFF', fontSize: fontSizes.sm },
  lookupResultList: { maxHeight: 220 },
  lookupResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  lookupResultCode: { fontFamily: fonts.bold, color: colors.primarySoft, fontSize: fontSizes.sm },
  lookupResultName: { fontFamily: fonts.regular, color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 18, marginTop: 2 },
  extraUnitPanel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
    gap: spacing.sm,
  },
  unitCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  unitHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  unitTitle: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.text },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  segmentButton: { flex: 1, alignItems: 'center', borderRadius: radius.sm, paddingVertical: spacing.sm },
  segmentButtonActive: { backgroundColor: colors.primary },
  segmentText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.textMuted },
  segmentTextActive: { fontFamily: fonts.bold, fontSize: fontSizes.xs, color: '#FFFFFF' },
  smallDangerButton: {
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  smallDangerText: { fontFamily: fonts.bold, fontSize: fontSizes.xs, color: colors.danger },
  disabledButton: { opacity: 0.5 },
  familyPanel: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  familyHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  familyTitle: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: colors.text },
  familyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  familyRowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  familyName: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  familyMeta: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
  familyAction: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.textMuted },
  familyActionSelected: { color: colors.primarySoft },
  smallGhostButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  smallGhostText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.textMuted },
  imageBox: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, alignItems: 'center', backgroundColor: colors.surfaceMuted },
  previewImage: { width: '100%', height: 180, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  primaryButton: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: 'center', paddingVertical: spacing.sm, marginTop: spacing.xs },
  primaryButtonText: { fontFamily: fonts.bold, color: '#FFFFFF' },
  secondaryButton: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, alignItems: 'center', paddingVertical: spacing.sm },
  secondaryButtonText: { fontFamily: fonts.bold, color: colors.primarySoft },
  previewBox: { borderRadius: radius.md, borderWidth: 1, borderColor: '#BBF7D0', backgroundColor: colors.successSoft, padding: spacing.md, gap: 4 },
  previewWarning: { borderColor: '#FDE68A', backgroundColor: colors.warningSoft },
  previewError: { borderColor: '#FCA5A5', backgroundColor: colors.dangerSoft },
  previewTitle: { fontFamily: fonts.bold, color: colors.text, fontSize: fontSizes.sm },
  previewText: { fontFamily: fonts.regular, color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 18 },
  loading: { alignItems: 'center', padding: spacing.xl },
  error: { fontFamily: fonts.medium, color: colors.danger },
  emptyText: { fontFamily: fonts.regular, color: colors.textMuted },
  resultCount: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.textMuted },
  resultGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  resultGridItem: { flexBasis: '48%', flexGrow: 1, minWidth: 300 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  cardTitle: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: colors.text, lineHeight: 22 },
  cardCode: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.primarySoft },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metaBox: { flexGrow: 1, minWidth: 104, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm },
  metaLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  metaValue: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text, marginTop: 2 },
});
