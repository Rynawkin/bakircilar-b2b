import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
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
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { hapticSuccess } from '../utils/haptics';

type TabKey = 'product' | 'reports' | 'requests' | 'tenders';

const emptyCostForm = {
  productCode: '',
  supplierCode: '',
  supplierName: '',
  supplierProductCode: '',
  costP: '',
  costT: '',
  currency: 'TRY',
  exchangeRate: '',
  vatIncluded: false,
  vatRate: '',
  unit: '',
  unitFactor: '1',
  minOrderQuantity: '',
  leadTimeDays: '',
  validUntil: '',
  quoteDate: new Date().toISOString().slice(0, 10),
  sourceType: 'MANUAL',
  note: '',
  attachmentUrl: '',
};

const emptyOfferForm = {
  supplierSearch: '',
  supplierCode: '',
  supplierName: '',
  supplierProductCode: '',
  costP: '',
  costT: '',
  currency: 'TRY',
  exchangeRate: '',
  vatIncluded: false,
  vatRate: '',
  unit: '',
  unitFactor: '1',
  minOrderQuantity: '',
  leadTimeDays: '',
  validUntil: '',
  quoteDate: new Date().toISOString().slice(0, 10),
  note: '',
  attachmentUrl: '',
  applyToSystem: false,
  updatePriceLists: true,
};

const emptyTenderOfferForm = {
  supplierSearch: '',
  supplierCode: '',
  supplierName: '',
  supplierProductCode: '',
  costP: '',
  costT: '',
  freightCost: '',
  currency: 'TRY',
  exchangeRate: '',
  vatIncluded: false,
  vatRate: '20',
  unit: '',
  unitFactor: '1',
  leadTimeDays: '',
  validUntil: '',
  quoteDate: new Date().toISOString().slice(0, 10),
  note: '',
  attachmentUrl: '',
};

const reportSections = [
  { key: 'currentAboveBest', title: 'Mikro maliyeti en iyi tedarikciden yuksek' },
  { key: 'currentBelowSupplier', title: 'Mikro maliyeti dusuk / zarar riski' },
  { key: 'staleCosts', title: 'Uzun suredir guncellenmeyen maliyet' },
  { key: 'singleSupplier', title: 'Tek tedarikciye bagli urun' },
  { key: 'highSpread', title: 'Tedarikciler arasi fark yuksek' },
  { key: 'expiredCosts', title: 'Gecerliligi dolan maliyet' },
  { key: 'betterAfterApplied', title: 'Son uygulamadan sonra daha iyi fiyat' },
  { key: 'mainSupplierAboveMarket', title: 'Ana saglayici piyasanin ustunde' },
];

const n = (value: unknown, fallback = 0) => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatInputNumber = (value: number) => (Number.isFinite(value) ? value.toFixed(4).replace(/\.?0+$/, '') : '');

const resolveVatPercent = (value: unknown, fallback = 20) => {
  const parsed = n(value, Number.NaN);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed <= 1 ? parsed * 100 : parsed;
};

const costPFromCostT = (costT: string, vatPercent: number) => {
  const parsed = n(costT, Number.NaN);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return formatInputNumber(parsed * (1 + Math.max(vatPercent, 0) / 200));
};

const money = (value: unknown) =>
  Number.isFinite(Number(value))
    ? `${Number(value).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} TL`
    : '-';

const dateText = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toLocaleDateString('tr-TR');
};

const productCode = (row: any) => String(row?.mikroCode || row?.productCode || row?.code || '').trim();
const productName = (row: any) => String(row?.name || row?.productName || row?.sto_isim || productCode(row) || '-').trim();
const supplierName = (row: any) => String(row?.supplierName || row?.name || row?.supplierCode || row?.code || '-').trim();

const errorMessage = (err: any, fallback: string) => {
  const data = err?.response?.data;
  if (typeof data?.error === 'string') return data.error;
  if (typeof data?.message === 'string') return data.message;
  if (Array.isArray(data?.details) && data.details.length) return data.details.join(', ');
  return fallback;
};

function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: 'red' | 'green' | 'amber' }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel} numberOfLines={1}>{label}</Text>
      <Text style={[styles.metricValue, tone === 'red' && styles.textDanger, tone === 'green' && styles.textSuccess, tone === 'amber' && styles.textWarning]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function ToggleLine({ label, value, onPress, hint }: { label: string; value: boolean; onPress: () => void; hint?: string }) {
  return (
    <TouchableOpacity style={styles.toggleLine} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.toggleDot, value && styles.toggleDotActive]} />
      <View style={styles.flex}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {hint ? <Text style={styles.metaText}>{hint}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

export function SupplierCostsScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 840;
  const [tab, setTab] = useState<TabKey>('product');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [costs, setCosts] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any | null>(null);
  const [costForm, setCostForm] = useState(emptyCostForm);
  const [editingCostId, setEditingCostId] = useState<string | null>(null);

  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierResults, setSupplierResults] = useState<Array<{ code: string; name: string }>>([]);

  const [reportSearch, setReportSearch] = useState('');
  const [reports, setReports] = useState<any | null>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [requestStatus, setRequestStatus] = useState('');
  const [requestSearch, setRequestSearch] = useState('');
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  const [offerForm, setOfferForm] = useState(emptyOfferForm);
  const [offerSupplierResults, setOfferSupplierResults] = useState<Array<{ code: string; name: string }>>([]);
  const [manualOfferCostP, setManualOfferCostP] = useState(false);
  const [selectedOfferIds, setSelectedOfferIds] = useState<Record<string, string>>({});
  const [requestNotes, setRequestNotes] = useState<Record<string, string>>({});
  const [stockPayloadDrafts, setStockPayloadDrafts] = useState<Record<string, any>>({});
  const [tenders, setTenders] = useState<any[]>([]);
  const [tenderStatus, setTenderStatus] = useState('');
  const [expandedTenderId, setExpandedTenderId] = useState<string | null>(null);
  const [tenderOfferForms, setTenderOfferForms] = useState<Record<string, typeof emptyTenderOfferForm>>({});
  const [tenderSupplierResults, setTenderSupplierResults] = useState<Record<string, Array<{ code: string; name: string }>>>({});
  const loadingCountRef = useRef(0);
  const submittingRef = useRef(false);
  const uploadingRef = useRef<string | null>(null);
  const productSearchSeqRef = useRef(0);
  const productDetailSeqRef = useRef(0);
  const supplierSearchSeqRef = useRef(0);
  const reportSeqRef = useRef(0);
  const requestSeqRef = useRef(0);
  const offerSupplierSeqRef = useRef(0);
  const tenderSeqRef = useRef(0);
  const tenderSupplierSeqRef = useRef<Record<string, number>>({});

  const beginLoading = () => {
    loadingCountRef.current += 1;
    setLoading(true);
  };

  const endLoading = () => {
    loadingCountRef.current = Math.max(0, loadingCountRef.current - 1);
    if (loadingCountRef.current === 0) setLoading(false);
  };

  const beginSubmitting = () => {
    if (submittingRef.current) return false;
    submittingRef.current = true;
    setSubmitting(true);
    return true;
  };

  const endSubmitting = () => {
    submittingRef.current = false;
    setSubmitting(false);
  };

  const beginUpload = (key: string) => {
    if (uploadingRef.current) return false;
    uploadingRef.current = key;
    setUploadingKey(key);
    return true;
  };

  const endUpload = () => {
    uploadingRef.current = null;
    setUploadingKey(null);
  };

  const normalizedPreview = useMemo(() => {
    const factor = Math.max(n(costForm.unitFactor, 1), 0.0001);
    const fx = costForm.currency === 'TRY' ? 1 : n(costForm.exchangeRate);
    const vatRateRaw = costForm.vatRate ? n(costForm.vatRate) : n(selectedProduct?.vatRate);
    const vatRate = vatRateRaw > 1 ? vatRateRaw / 100 : vatRateRaw;
    const divider = costForm.vatIncluded ? 1 + vatRate : 1;
    const costT = n(costForm.costT || costForm.costP);
    const costP = n(costForm.costP || costForm.costT);
    if (!costP || !costT || !fx) return null;
    return {
      costP: (costP * fx) / factor / divider,
      costT: (costT * fx) / factor / divider,
    };
  }, [costForm, selectedProduct]);

  const patchCostForm = (patch: Partial<typeof emptyCostForm>) => setCostForm((prev) => ({ ...prev, ...patch }));
  const patchOfferForm = (patch: Partial<typeof emptyOfferForm>) => setOfferForm((prev) => ({ ...prev, ...patch }));

  const offerDefaultsForRequest = (request: any) => ({
    ...emptyOfferForm,
    unit: request?.unit || request?.stockCreatePayload?.mainUnit || '',
    vatRate: String(resolveVatPercent(request?.vatRatePercent ?? request?.vatRate ?? request?.stockCreatePayload?.vatRatePercent, 20)),
  });

  const toggleRequestDetail = (request: any) => {
    if (expandedRequestId === request.id) {
      setExpandedRequestId(null);
      setOfferSupplierResults([]);
      return;
    }
    const preferredOfferId = request.selectedOfferId || request.approvedOfferId || request.bestOffer?.id || request.offers?.[0]?.id || '';
    setExpandedRequestId(request.id);
    setOfferForm(offerDefaultsForRequest(request));
    setOfferSupplierResults([]);
    setManualOfferCostP(false);
    setSelectedOfferIds((current) => ({ ...current, [request.id]: preferredOfferId }));
    setRequestNotes((current) => ({ ...current, [request.id]: current[request.id] || '' }));
    if (request.stockCreatePayload) {
      setStockPayloadDrafts((current) => ({
        ...current,
        [request.id]: current[request.id] || {
          ...request.stockCreatePayload,
          margins: [...(request.stockCreatePayload.margins || [])],
        },
      }));
    }
  };

  const updateStockPayload = (requestId: string, patch: Record<string, any>) => {
    setStockPayloadDrafts((current) => ({
      ...current,
      [requestId]: { ...(current[requestId] || {}), ...patch },
    }));
  };

  const updateStockMargin = (requestId: string, index: number, value: string) => {
    setStockPayloadDrafts((current) => {
      const payload = current[requestId] || {};
      const margins = [...(payload.margins || [])];
      margins[index] = value;
      return { ...current, [requestId]: { ...payload, margins } };
    });
  };

  const patchTenderOfferForm = (itemId: string, patch: Partial<typeof emptyTenderOfferForm>) => {
    setTenderOfferForms((current) => ({
      ...current,
      [itemId]: { ...(current[itemId] || emptyTenderOfferForm), ...patch },
    }));
  };

  const openUrl = async (url?: string | null) => {
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Dosya acilamadi', url);
    }
  };

  const pickAttachment = async (target: 'cost' | 'priceOffer' | 'tenderOffer', itemId?: string) => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ['image/*', 'application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
    });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    if (asset.size && asset.size > 15 * 1024 * 1024) {
      Alert.alert('Dosya Boyutu', 'Dosya 15MB altinda olmali.');
      return;
    }

    const key = `${target}-${itemId || 'main'}`;
    if (!beginUpload(key)) return;
    const formData = new FormData();
    formData.append('file', {
      uri: asset.uri,
      name: asset.name || 'attachment',
      type: asset.mimeType || 'application/octet-stream',
    } as any);

    try {
      const uploaded = target === 'cost'
        ? await adminApi.uploadSupplierCostAttachment(formData)
        : await adminApi.uploadPriceVerificationAttachment(formData);
      const url = uploaded.attachmentUrl || (uploaded as any).url;
      if (!url) throw new Error('Dosya URL bilgisi donmedi.');
      if (target === 'cost') {
        patchCostForm({ attachmentUrl: url });
      } else if (target === 'priceOffer') {
        patchOfferForm({ attachmentUrl: url });
      } else if (itemId) {
        patchTenderOfferForm(itemId, { attachmentUrl: url });
      }
      hapticSuccess();
    } catch (err: any) {
      Alert.alert('Dosya yuklenemedi', errorMessage(err, 'Dosya yuklenemedi.'));
    } finally {
      endUpload();
    }
  };

  const updateOfferCostT = (value: string) => {
    setOfferForm((current) => {
      const patch: Partial<typeof emptyOfferForm> = { costT: value };
      if (!manualOfferCostP) patch.costP = costPFromCostT(value, resolveVatPercent(current.vatRate, 20));
      return { ...current, ...patch };
    });
  };

  const updateOfferCostP = (value: string) => {
    setManualOfferCostP(true);
    patchOfferForm({ costP: value });
  };

  const updateOfferVatRate = (value: string) => {
    setOfferForm((current) => {
      const patch: Partial<typeof emptyOfferForm> = { vatRate: value };
      if (!manualOfferCostP && current.costT) patch.costP = costPFromCostT(current.costT, resolveVatPercent(value, 20));
      return { ...current, ...patch };
    });
  };

  const updateTenderOfferCostT = (itemId: string, value: string) => {
    setTenderOfferForms((current) => {
      const form = current[itemId] || emptyTenderOfferForm;
      return {
        ...current,
        [itemId]: {
          ...form,
          costT: value,
          costP: form.costP ? form.costP : costPFromCostT(value, resolveVatPercent(form.vatRate, 20)),
        },
      };
    });
  };

  const searchProducts = async () => {
    if (!productSearch.trim()) {
      Alert.alert('Urun arama', 'Urun adi veya kodu girin.');
      return;
    }
    const requestSeq = ++productSearchSeqRef.current;
    beginLoading();
    try {
      const result = await adminApi.searchSupplierCostProducts({ search: productSearch.trim(), limit: 30 });
      if (requestSeq !== productSearchSeqRef.current) return;
      setProductResults(result.products || []);
    } catch (err: any) {
      if (requestSeq !== productSearchSeqRef.current) return;
      Alert.alert('Urun arama', errorMessage(err, 'Urun aramasi yapilamadi.'));
    } finally {
      endLoading();
    }
  };

  const loadProduct = async (code: string) => {
    if (!code) return;
    const requestSeq = ++productDetailSeqRef.current;
    beginLoading();
    try {
      const result = await adminApi.getSupplierCostProduct(code);
      if (requestSeq !== productDetailSeqRef.current) return;
      setSelectedProduct(result.product);
      setCosts(result.costs || []);
      setApplications(result.applications || []);
      setMetrics(result.metrics || null);
      setProductResults([]);
      setProductSearch(code);
      setEditingCostId(null);
      setCostForm({
        ...emptyCostForm,
        productCode: result.product?.mikroCode || code,
        vatRate: String(Number(result.product?.vatRate || 0) > 1 ? result.product?.vatRate : Number(result.product?.vatRate || 0) * 100),
        unit: result.product?.unit || '',
      });
    } catch (err: any) {
      if (requestSeq !== productDetailSeqRef.current) return;
      Alert.alert('Urun detayi', errorMessage(err, 'Urun detayi alinamadi.'));
    } finally {
      endLoading();
    }
  };

  const searchSuppliers = async () => {
    if (!supplierSearch.trim()) return;
    const requestSeq = ++supplierSearchSeqRef.current;
    try {
      const result = await adminApi.searchSupplierCostSuppliers({ search: supplierSearch.trim(), limit: 20 });
      if (requestSeq !== supplierSearchSeqRef.current) return;
      setSupplierResults(result.suppliers || []);
    } catch (err: any) {
      if (requestSeq !== supplierSearchSeqRef.current) return;
      Alert.alert('Tedarikci arama', errorMessage(err, 'Tedarikci aramasi yapilamadi.'));
    }
  };

  const selectSupplier = (supplier: { code: string; name: string }) => {
    setSupplierSearch(`${supplier.code} - ${supplier.name}`);
    setSupplierResults([]);
    patchCostForm({ supplierCode: supplier.code, supplierName: supplier.name });
  };

  const editCost = (cost: any) => {
    setEditingCostId(cost.id);
    setCostForm({
      ...emptyCostForm,
      productCode: cost.productCode || selectedProduct?.mikroCode || '',
      supplierCode: cost.supplierCode || '',
      supplierName: cost.supplierName || '',
      supplierProductCode: cost.supplierProductCode || '',
      costP: String(cost.costP ?? cost.cost ?? ''),
      costT: String(cost.costT ?? cost.normalizedCost ?? ''),
      currency: cost.currency || 'TRY',
      exchangeRate: cost.exchangeRate ? String(cost.exchangeRate) : '',
      vatIncluded: Boolean(cost.vatIncluded),
      vatRate: cost.vatRate != null ? String(Number(cost.vatRate) > 1 ? cost.vatRate : Number(cost.vatRate) * 100) : '',
      unit: cost.unit || '',
      unitFactor: String(cost.unitFactor || 1),
      minOrderQuantity: cost.minOrderQuantity ? String(cost.minOrderQuantity) : '',
      leadTimeDays: cost.leadTimeDays ? String(cost.leadTimeDays) : '',
      validUntil: cost.validUntil ? String(cost.validUntil).slice(0, 10) : '',
      quoteDate: cost.quoteDate ? String(cost.quoteDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
      sourceType: cost.sourceType || 'MANUAL',
      note: cost.note || '',
      attachmentUrl: cost.attachmentUrl || '',
    });
  };

  const saveCost = async () => {
    if (!costForm.productCode.trim() || !costForm.supplierCode.trim() || !costForm.costP.trim()) {
      Alert.alert('Eksik bilgi', 'Urun, tedarikci ve maliyet zorunlu.');
      return;
    }
    if (!beginSubmitting()) return;
    try {
      const payload = {
        ...costForm,
        costP: n(costForm.costP),
        costT: costForm.costT ? n(costForm.costT) : undefined,
        exchangeRate: costForm.exchangeRate ? n(costForm.exchangeRate) : undefined,
        vatRate: costForm.vatRate ? n(costForm.vatRate) / 100 : undefined,
        unitFactor: n(costForm.unitFactor, 1),
        minOrderQuantity: costForm.minOrderQuantity ? n(costForm.minOrderQuantity) : undefined,
        leadTimeDays: costForm.leadTimeDays ? n(costForm.leadTimeDays) : undefined,
      };
      const result = editingCostId
        ? await adminApi.updateSupplierCost(editingCostId, payload)
        : await adminApi.createSupplierCost(payload);
      setEditingCostId(null);
      hapticSuccess();
      if (selectedProduct?.mikroCode || costForm.productCode) await loadProduct(costForm.productCode || selectedProduct?.mikroCode);
      Alert.alert('Kaydedildi', result.cost?.supplierName || 'Tedarikci maliyeti kaydedildi.');
    } catch (err: any) {
      Alert.alert('Kaydedilemedi', errorMessage(err, 'Islem tamamlanamadi.'));
    } finally {
      endSubmitting();
    }
  };

  const applyCost = (cost: any) => {
    Alert.alert('Maliyeti Mikroya uygula?', `${cost.productCode || selectedProduct?.mikroCode} icin ${money(cost.normalizedCost || cost.costT || cost.costP)} uygulanacak.`, [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Uygula',
        style: 'destructive',
        onPress: async () => {
          if (!beginSubmitting()) return;
          try {
            await adminApi.applySupplierCost(cost.id, { updatePriceLists: true, note: 'Mobil portal uygulama' });
            hapticSuccess();
            await loadProduct(cost.productCode || selectedProduct?.mikroCode);
          } catch (err: any) {
            Alert.alert('Uygulanamadi', errorMessage(err, 'Mikro islemi tamamlanamadi.'));
          } finally {
            endSubmitting();
          }
        },
      },
    ]);
  };

  const fetchReports = async () => {
    const requestSeq = ++reportSeqRef.current;
    beginLoading();
    try {
      const result = await adminApi.getSupplierCostReports({
        search: reportSearch.trim() || undefined,
        limit: 30,
      });
      if (requestSeq !== reportSeqRef.current) return;
      setReports(result);
    } catch (err: any) {
      if (requestSeq !== reportSeqRef.current) return;
      Alert.alert('Rapor', errorMessage(err, 'Rapor alinamadi.'));
    } finally {
      endLoading();
    }
  };

  const fetchRequests = async () => {
    const requestSeq = ++requestSeqRef.current;
    beginLoading();
    try {
      const result = await adminApi.getPriceVerificationRequests({
        search: requestSearch.trim() || undefined,
        status: requestStatus || undefined,
        limit: 40,
      });
      if (requestSeq !== requestSeqRef.current) return;
      setRequests(result.items || []);
    } catch (err: any) {
      if (requestSeq !== requestSeqRef.current) return;
      Alert.alert('Fiyat teyit', errorMessage(err, 'Talepler alinamadi.'));
    } finally {
      endLoading();
    }
  };

  const searchSuppliersForOffer = async () => {
    if (!offerForm.supplierSearch.trim()) {
      Alert.alert('Tedarikci arama', 'Tedarikci kodu veya adi girin.');
      return;
    }
    const requestSeq = ++offerSupplierSeqRef.current;
    try {
      const result = await adminApi.searchSupplierCostSuppliers({ search: offerForm.supplierSearch.trim(), limit: 25 });
      if (requestSeq !== offerSupplierSeqRef.current) return;
      setOfferSupplierResults(result.suppliers || []);
    } catch (err: any) {
      if (requestSeq !== offerSupplierSeqRef.current) return;
      Alert.alert('Tedarikci arama', errorMessage(err, 'Tedarikci aramasi yapilamadi.'));
    }
  };

  const selectOfferSupplier = (supplier: { code: string; name: string }) => {
    patchOfferForm({ supplierSearch: `${supplier.code} - ${supplier.name}`, supplierCode: supplier.code, supplierName: supplier.name });
    setOfferSupplierResults([]);
  };

  const submitOffer = async (request: any) => {
    const costT = n(offerForm.costT, Number.NaN);
    const costP = n(offerForm.costP, Number.NaN);
    if (!offerForm.supplierCode.trim() || !offerForm.supplierName.trim()) {
      Alert.alert('Eksik bilgi', 'Tedarikci kodu ve adi zorunlu.');
      return;
    }
    if (!Number.isFinite(costT) || costT <= 0 || !Number.isFinite(costP) || costP <= 0) {
      Alert.alert('Eksik bilgi', 'Maliyet T ve Maliyet P zorunlu.');
      return;
    }
    const run = async () => {
      if (!beginSubmitting()) return;
      try {
        const result = await adminApi.addPriceVerificationOffer(request.id, {
          ...offerForm,
          costT,
          costP,
          exchangeRate: offerForm.currency === 'TRY' ? undefined : n(offerForm.exchangeRate),
          vatRate: offerForm.vatRate ? n(offerForm.vatRate) : undefined,
          unitFactor: n(offerForm.unitFactor, 1),
          minOrderQuantity: offerForm.minOrderQuantity ? n(offerForm.minOrderQuantity) : undefined,
          leadTimeDays: offerForm.leadTimeDays ? n(offerForm.leadTimeDays) : undefined,
          applyToSystem: Boolean(offerForm.applyToSystem),
          updatePriceLists: offerForm.updatePriceLists !== false,
        });
        setOfferForm(offerDefaultsForRequest(result.request || request));
        setManualOfferCostP(false);
        setOfferSupplierResults([]);
        await fetchRequests();
        hapticSuccess();
        Alert.alert('Kaydedildi', offerForm.applyToSystem ? 'Fiyat eklendi ve sistem uygulamasi tetiklendi.' : 'Fiyat alternatifi eklendi.');
      } catch (err: any) {
        Alert.alert('Fiyat eklenemedi', errorMessage(err, 'Fiyat alternatifi kaydedilemedi.'));
      } finally {
        endSubmitting();
      }
    };

    if (offerForm.applyToSystem) {
      Alert.alert(
        'Mikroya uygula?',
        offerForm.updatePriceLists
          ? 'Bu fiyat eklenecek, Mikro maliyeti ve fiyat listeleri guncellenecek.'
          : 'Bu fiyat eklenecek ve sadece Mikro maliyeti guncellenecek.',
        [
          { text: 'Vazgec', style: 'cancel' },
          { text: 'Uygula', style: 'destructive', onPress: run },
        ],
      );
      return;
    }
    await run();
  };

  const quickRequestAction = (request: any, action: 'markCurrent' | 'submit' | 'complete' | 'cancel') => {
    const labels = {
      markCurrent: 'Guncel isaretle',
      submit: 'Satis onayina gonder',
      complete: 'Tamamla',
      cancel: 'Iptal et',
    };
    Alert.alert(labels[action], `${request.productCode || request.product?.mikroCode || 'Talep'} icin islem yapilsin mi?`, [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: labels[action],
        onPress: async () => {
          if (!beginSubmitting()) return;
          try {
            if (action === 'markCurrent') await adminApi.markPriceVerificationCurrent(request.id, { note: 'Mobil portal' });
            if (action === 'submit') await adminApi.submitPriceVerificationToSales(request.id, { note: 'Mobil portal' });
            if (action === 'complete') await adminApi.completePriceVerification(request.id, { updatePriceLists: false, note: 'Mobil portal' });
            if (action === 'cancel') await adminApi.cancelPriceVerification(request.id, { note: 'Mobil portal iptal' });
            await fetchRequests();
            hapticSuccess();
          } catch (err: any) {
            Alert.alert('Islem olmadi', errorMessage(err, 'Islem tamamlanamadi.'));
          } finally {
            endSubmitting();
          }
        },
      },
    ]);
  };

  const decideRequest = (request: any, approved: boolean) => {
    const selectedOfferId = selectedOfferIds[request.id] || request.selectedOfferId || request.approvedOfferId || request.bestOffer?.id || '';
    if (approved && !selectedOfferId) {
      Alert.alert('Fiyat secin', 'Onaylamak icin once bir tedarikci fiyatini secin.');
      return;
    }
    Alert.alert(
      approved ? 'Secili fiyat onaylansin mi?' : 'Talep reddedilsin mi?',
      approved
        ? 'Secili tedarikci fiyati satis karari olarak kaydedilecek.'
        : 'Talep reddedilecek ve satis tarafina bilgi dusecek.',
      [
        { text: 'Vazgec', style: 'cancel' },
        {
          text: approved ? 'Onayla' : 'Reddet',
          style: approved ? 'default' : 'destructive',
          onPress: async () => {
            if (!beginSubmitting()) return;
            try {
              await adminApi.decidePriceVerification(request.id, {
                approved,
                selectedOfferId: approved ? selectedOfferId : undefined,
                note: requestNotes[request.id]?.trim() || undefined,
              });
              setRequestNotes((current) => ({ ...current, [request.id]: '' }));
              await fetchRequests();
              hapticSuccess();
            } catch (err: any) {
              Alert.alert('Karar kaydedilemedi', errorMessage(err, 'Satis karari kaydedilemedi.'));
            } finally {
              endSubmitting();
            }
          },
        },
      ],
    );
  };

  const completeRequest = (request: any) => {
    Alert.alert(
      'Mikroya uygula ve tamamla?',
      request.type === 'NEW_STOCK'
        ? 'Yeni stok karti taslagi ve secili fiyat ile talep tamamlanacak.'
        : 'Secili fiyat Mikro maliyetine ve fiyat listelerine uygulanacak.',
      [
        { text: 'Vazgec', style: 'cancel' },
        {
          text: 'Tamamla',
          style: 'destructive',
          onPress: async () => {
            if (!beginSubmitting()) return;
            try {
              await adminApi.completePriceVerification(request.id, {
                updatePriceLists: true,
                note: requestNotes[request.id]?.trim() || undefined,
                stockCreatePayload: request.type === 'NEW_STOCK'
                  ? stockPayloadDrafts[request.id] || request.stockCreatePayload
                  : undefined,
              });
              setRequestNotes((current) => ({ ...current, [request.id]: '' }));
              await fetchRequests();
              hapticSuccess();
            } catch (err: any) {
              Alert.alert('Talep tamamlanamadi', errorMessage(err, 'Talep tamamlanamadi.'));
            } finally {
              endSubmitting();
            }
          },
        },
      ],
    );
  };

  const addRequestNote = async (request: any) => {
    const body = requestNotes[request.id]?.trim();
    if (!body) {
      Alert.alert('Not bos', 'Eklemek icin not yazin.');
      return;
    }
    if (!beginSubmitting()) return;
    try {
      await adminApi.addPriceVerificationNote(request.id, { body });
      setRequestNotes((current) => ({ ...current, [request.id]: '' }));
      await fetchRequests();
      hapticSuccess();
    } catch (err: any) {
      Alert.alert('Not eklenemedi', errorMessage(err, 'Talep notu eklenemedi.'));
    } finally {
      endSubmitting();
    }
  };

  const fetchTenders = async () => {
    const requestSeq = ++tenderSeqRef.current;
    beginLoading();
    try {
      const result = await adminApi.getTenderCostRequests({
        status: tenderStatus || undefined,
        sort: 'deadlineSoon',
        limit: 40,
      });
      if (requestSeq !== tenderSeqRef.current) return;
      setTenders(result.items || []);
    } catch (err: any) {
      if (requestSeq !== tenderSeqRef.current) return;
      Alert.alert('Ihale maliyet', errorMessage(err, 'Ihale talepleri alinamadi.'));
    } finally {
      endLoading();
    }
  };

  const searchSuppliersForTenderItem = async (itemId: string) => {
    const form = tenderOfferForms[itemId] || emptyTenderOfferForm;
    if (!form.supplierSearch.trim()) {
      Alert.alert('Tedarikci arama', 'Tedarikci kodu veya adi girin.');
      return;
    }
    const requestSeq = (tenderSupplierSeqRef.current[itemId] || 0) + 1;
    tenderSupplierSeqRef.current[itemId] = requestSeq;
    try {
      const result = await adminApi.searchSupplierCostSuppliers({ search: form.supplierSearch.trim(), limit: 25 });
      if (requestSeq !== tenderSupplierSeqRef.current[itemId]) return;
      setTenderSupplierResults((current) => ({ ...current, [itemId]: result.suppliers || [] }));
    } catch (err: any) {
      if (requestSeq !== tenderSupplierSeqRef.current[itemId]) return;
      Alert.alert('Tedarikci arama', errorMessage(err, 'Tedarikci aramasi yapilamadi.'));
    }
  };

  const selectTenderSupplier = (itemId: string, supplier: { code: string; name: string }) => {
    patchTenderOfferForm(itemId, { supplierSearch: `${supplier.code} - ${supplier.name}`, supplierCode: supplier.code, supplierName: supplier.name });
    setTenderSupplierResults((current) => ({ ...current, [itemId]: [] }));
  };

  const submitTenderOffer = async (request: any, item: any) => {
    const form = tenderOfferForms[item.id] || emptyTenderOfferForm;
    const costT = n(form.costT, Number.NaN);
    const costP = n(form.costP, Number.NaN);
    if (!form.supplierCode.trim() || !form.supplierName.trim()) {
      Alert.alert('Eksik bilgi', 'Tedarikci kodu ve adi zorunlu.');
      return;
    }
    if (!Number.isFinite(costT) || costT <= 0 || !Number.isFinite(costP) || costP <= 0) {
      Alert.alert('Eksik bilgi', 'Maliyet T ve Maliyet P zorunlu.');
      return;
    }
    if (!beginSubmitting()) return;
    try {
      await adminApi.addTenderCostOffer(request.id, item.id, {
        ...form,
        costT,
        costP,
        freightCost: form.freightCost ? n(form.freightCost) : undefined,
        exchangeRate: form.currency === 'TRY' ? undefined : n(form.exchangeRate),
        vatRate: form.vatRate ? n(form.vatRate) : undefined,
        unitFactor: n(form.unitFactor, 1),
        leadTimeDays: form.leadTimeDays ? n(form.leadTimeDays) : undefined,
      });
      setTenderOfferForms((current) => ({ ...current, [item.id]: emptyTenderOfferForm }));
      setTenderSupplierResults((current) => ({ ...current, [item.id]: [] }));
      await fetchTenders();
      hapticSuccess();
      Alert.alert('Kaydedildi', 'Ihale kalemine fiyat eklendi.');
    } catch (err: any) {
      Alert.alert('Fiyat eklenemedi', errorMessage(err, 'Ihale fiyati kaydedilemedi.'));
    } finally {
      endSubmitting();
    }
  };

  const quickTenderAction = (request: any, action: 'complete' | 'cancel') => {
    Alert.alert(action === 'complete' ? 'Ihale tamamla' : 'Ihale iptal', `${request.title || request.id} icin islem yapilsin mi?`, [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: action === 'complete' ? 'Tamamla' : 'Iptal',
        onPress: async () => {
          if (!beginSubmitting()) return;
          try {
            if (action === 'complete') await adminApi.completeTenderCostRequest(request.id, { note: 'Mobil portal' });
            if (action === 'cancel') await adminApi.cancelTenderCostRequest(request.id, { note: 'Mobil portal iptal' });
            await fetchTenders();
            hapticSuccess();
          } catch (err: any) {
            Alert.alert('Islem olmadi', errorMessage(err, 'Islem tamamlanamadi.'));
          } finally {
            endSubmitting();
          }
        },
      },
    ]);
  };

  useEffect(() => {
    fetchReports();
    fetchRequests();
    fetchTenders();
  }, []);

  const renderHeader = () => {
    const sectionRows = Object.values((reports?.sections || {}) as Record<string, unknown>).reduce<number>(
      (sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0),
      0
    );
    return (
      <View style={styles.header}>
        <Text style={styles.kicker}>Satin Alma Operasyonu</Text>
        <Text style={styles.title}>Tedarik Maliyetleri</Text>
        <Text style={styles.subtitle}>Urun bazli maliyet havuzu, fiyat teyitleri, ihale talepleri ve risk raporlari.</Text>
        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatLabel}>Sekme</Text>
            <Text style={styles.heroStatValue}>{tab === 'product' ? 'Urun' : tab === 'reports' ? 'Rapor' : tab === 'requests' ? 'Teyit' : 'Ihale'}</Text>
          </View>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatLabel}>Urun Sonucu</Text>
            <Text style={styles.heroStatValue}>{productResults.length}</Text>
          </View>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatLabel}>Risk Satiri</Text>
            <Text style={styles.heroStatValue}>{sectionRows}</Text>
          </View>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatLabel}>Teyit / Ihale</Text>
            <Text style={styles.heroStatValue}>{requests.length}/{tenders.length}</Text>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          <Chip label="Urun" active={tab === 'product'} onPress={() => setTab('product')} />
          <Chip label="Rapor" active={tab === 'reports'} onPress={() => setTab('reports')} />
          <Chip label="Fiyat Teyit" active={tab === 'requests'} onPress={() => setTab('requests')} />
          <Chip label="Ihale" active={tab === 'tenders'} onPress={() => setTab('tenders')} />
        </ScrollView>
      </View>
    );
  };

  const renderProductTab = () => (
    <View style={styles.section}>
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Urun ara</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex]}
            value={productSearch}
            onChangeText={setProductSearch}
            onSubmitEditing={searchProducts}
            placeholder="Stok kodu veya urun adi"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
          />
          <TouchableOpacity style={styles.smallButton} onPress={searchProducts}>
            <Text style={styles.smallButtonText}>Ara</Text>
          </TouchableOpacity>
        </View>
        {productResults.map((product) => (
          <TouchableOpacity key={productCode(product)} style={styles.resultRow} onPress={() => loadProduct(productCode(product))}>
            <Text style={styles.rowTitle} numberOfLines={2}>{productName(product)}</Text>
            <Text style={styles.metaText} numberOfLines={1}>{productCode(product)} - Maliyet {money(product.currentCost)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {selectedProduct && (
        <>
          <View style={styles.metricGrid}>
            <Metric label="Guncel Maliyet" value={money(selectedProduct.currentCost)} />
            <Metric label="En Iyi Tedarik" value={money(metrics?.bestCost || metrics?.bestSupplierCost)} tone="green" />
            <Metric label="Tedarikci" value={metrics?.supplierCount || costs.length} />
            <Metric label="Son Uygulama" value={dateText(applications?.[0]?.createdAt)} />
          </View>
          <View style={styles.productHero}>
            <Text style={styles.productTitle} numberOfLines={2}>{productName(selectedProduct)}</Text>
            <Text style={styles.metaText} numberOfLines={1}>{selectedProduct.mikroCode || selectedProduct.productCode} - {selectedProduct.unit || '-'}</Text>
          </View>
        </>
      )}

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>{editingCostId ? 'Maliyet Duzenle' : 'Yeni tedarikci maliyeti'}</Text>
        <TextInput style={styles.input} value={costForm.productCode} onChangeText={(value) => patchCostForm({ productCode: value })} placeholder="Urun kodu" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
        <View style={styles.row}>
          <TextInput style={[styles.input, styles.flex]} value={supplierSearch} onChangeText={setSupplierSearch} onSubmitEditing={searchSuppliers} placeholder="Tedarikci ara" placeholderTextColor={colors.textMuted} returnKeyType="search" />
          <TouchableOpacity style={styles.smallButton} onPress={searchSuppliers}>
            <Text style={styles.smallButtonText}>Ara</Text>
          </TouchableOpacity>
        </View>
        {supplierResults.map((supplier) => (
          <TouchableOpacity key={supplier.code} style={styles.resultRow} onPress={() => selectSupplier(supplier)}>
            <Text style={styles.rowTitle} numberOfLines={2}>{supplier.name}</Text>
            <Text style={styles.metaText} numberOfLines={1}>{supplier.code}</Text>
          </TouchableOpacity>
        ))}
        <View style={styles.row}>
          <TextInput style={[styles.input, styles.flex]} value={costForm.supplierCode} onChangeText={(value) => patchCostForm({ supplierCode: value })} placeholder="Tedarikci kodu" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
          <TextInput style={[styles.input, styles.flex]} value={costForm.supplierName} onChangeText={(value) => patchCostForm({ supplierName: value })} placeholder="Tedarikci adi" placeholderTextColor={colors.textMuted} />
        </View>
        <View style={styles.row}>
          <TextInput style={[styles.input, styles.flex]} value={costForm.costT} onChangeText={(value) => patchCostForm({ costT: value })} placeholder="Maliyet T" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
          <TextInput style={[styles.input, styles.flex]} value={costForm.costP} onChangeText={(value) => patchCostForm({ costP: value })} placeholder="Maliyet P" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
        </View>
        <View style={styles.row}>
          <TextInput style={[styles.input, styles.flex]} value={costForm.unit} onChangeText={(value) => patchCostForm({ unit: value })} placeholder="Birim" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
          <TextInput style={[styles.input, styles.flex]} value={costForm.unitFactor} onChangeText={(value) => patchCostForm({ unitFactor: value })} placeholder="Birim carpan" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
        </View>
        <TextInput style={styles.input} value={costForm.note} onChangeText={(value) => patchCostForm({ note: value })} placeholder="Not" placeholderTextColor={colors.textMuted} />
        <TextInput style={styles.input} value={costForm.attachmentUrl} onChangeText={(value) => patchCostForm({ attachmentUrl: value })} placeholder="Teklif/dosya linki" placeholderTextColor={colors.textMuted} autoCapitalize="none" />
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => pickAttachment('cost')} disabled={uploadingKey === 'cost-main'}>
            <Text style={styles.secondaryButtonText}>{uploadingKey === 'cost-main' ? 'Yukleniyor...' : 'Dosya Sec'}</Text>
          </TouchableOpacity>
          {costForm.attachmentUrl ? (
            <>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => openUrl(costForm.attachmentUrl)}>
                <Text style={styles.secondaryButtonText}>Dosyayi Ac</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => patchCostForm({ attachmentUrl: '' })}>
                <Text style={styles.secondaryButtonText}>Temizle</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
        {normalizedPreview && (
          <Text style={styles.previewText}>Normalize: T {money(normalizedPreview.costT)} / P {money(normalizedPreview.costP)}</Text>
        )}
        <TouchableOpacity style={styles.primaryButton} onPress={saveCost} disabled={submitting}>
          <Text style={styles.primaryButtonText}>{submitting ? 'Kaydediliyor...' : editingCostId ? 'Guncelle' : 'Kaydet'}</Text>
        </TouchableOpacity>
      </View>

      {costs.map((cost) => (
        <View key={cost.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle} numberOfLines={2}>{supplierName(cost)}</Text>
            <Text style={styles.badge}>{cost.status || 'ACTIVE'}</Text>
          </View>
          <Text style={styles.metaText} numberOfLines={1}>{cost.supplierCode || '-'} - T {money(cost.costT || cost.normalizedCost)} / P {money(cost.costP)}</Text>
          <Text style={styles.metaText} numberOfLines={1}>Gecerli: {dateText(cost.validUntil)} - Kaynak: {cost.sourceType || '-'}</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => editCost(cost)}>
              <Text style={styles.secondaryButtonText}>Duzenle</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dangerButton} onPress={() => applyCost(cost)} disabled={submitting}>
              <Text style={styles.dangerButtonText}>Mikroya Uygula</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );

  const renderReportsTab = () => (
    <View style={styles.section}>
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Maliyet risk raporu</Text>
        <View style={styles.row}>
          <TextInput style={[styles.input, styles.flex]} value={reportSearch} onChangeText={setReportSearch} onSubmitEditing={fetchReports} placeholder="Urun/tedarikci ara" placeholderTextColor={colors.textMuted} />
          <TouchableOpacity style={styles.smallButton} onPress={fetchReports}>
            <Text style={styles.smallButtonText}>Getir</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.metricGrid}>
        <Metric label="Urun" value={reports?.summary?.totalProducts || reports?.summary?.products || 0} />
        <Metric label="Risk" value={reports?.summary?.riskCount || reports?.summary?.totalRisks || 0} tone="amber" />
        <Metric label="Guncel" value={dateText(reports?.generatedAt)} />
        <Metric label="Bolum" value={Object.keys(reports?.sections || {}).length} />
      </View>
      {reportSections.map((section) => {
        const rows = reports?.sections?.[section.key] || [];
        return (
          <View key={section.key} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={2}>{section.title}</Text>
              <Text style={styles.badge}>{rows.length}</Text>
            </View>
            {rows.slice(0, 8).map((row: any, index: number) => (
              <TouchableOpacity key={`${section.key}-${index}`} style={styles.resultRow} onPress={() => loadProduct(row.productCode || row.mikroCode || row.code)}>
                <Text style={styles.rowTitle} numberOfLines={2}>{row.productName || row.name || row.productCode}</Text>
                <Text style={styles.metaText} numberOfLines={1}>{row.productCode || row.mikroCode || '-'} - {row.supplierName || row.supplierCode || ''}</Text>
              </TouchableOpacity>
            ))}
          </View>
        );
      })}
    </View>
  );

  const renderStockPayloadEditor = (request: any) => {
    if (request.type !== 'NEW_STOCK' || !request.stockCreatePayload) return null;
    const payload = stockPayloadDrafts[request.id] || request.stockCreatePayload;
    return (
      <View style={styles.subPanel}>
        <Text style={styles.subTitle}>Yeni stok karti taslagi</Text>
        <View style={[styles.formGrid, isWide && styles.formGridWide]}>
          <TextInput style={[styles.input, styles.formField]} value={payload.templateCode || ''} onChangeText={(value) => updateStockPayload(request.id, { templateCode: value })} placeholder="Sablon stok" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
          <TextInput style={[styles.input, styles.formField]} value={payload.name || ''} onChangeText={(value) => updateStockPayload(request.id, { name: value })} placeholder="Stok adi" placeholderTextColor={colors.textMuted} />
          <TextInput style={[styles.input, styles.formField]} value={payload.foreignName || ''} onChangeText={(value) => updateStockPayload(request.id, { foreignName: value })} placeholder="Tedarikci urun kodu" placeholderTextColor={colors.textMuted} />
          <TextInput style={[styles.input, styles.formField]} value={payload.mainUnit || ''} onChangeText={(value) => updateStockPayload(request.id, { mainUnit: value })} placeholder="Ana birim" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
          <TextInput style={[styles.input, styles.formField]} value={String(payload.vatRatePercent ?? '')} onChangeText={(value) => updateStockPayload(request.id, { vatRatePercent: value })} placeholder="KDV %" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
          <TextInput style={[styles.input, styles.formField]} value={payload.supplierCode || ''} onChangeText={(value) => updateStockPayload(request.id, { supplierCode: value })} placeholder="Ana saglayici" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
          <TextInput style={[styles.input, styles.formField]} value={payload.brandCode || ''} onChangeText={(value) => updateStockPayload(request.id, { brandCode: value })} placeholder="Marka kodu" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
          <TextInput style={[styles.input, styles.formField]} value={payload.brandName || ''} onChangeText={(value) => updateStockPayload(request.id, { brandName: value })} placeholder="Yeni marka adi" placeholderTextColor={colors.textMuted} />
          <TextInput style={[styles.input, styles.formField]} value={payload.categoryCode || ''} onChangeText={(value) => updateStockPayload(request.id, { categoryCode: value })} placeholder="Kategori" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
          <TextInput style={[styles.input, styles.formField]} value={payload.packageCode || ''} onChangeText={(value) => updateStockPayload(request.id, { packageCode: value })} placeholder="Ambalaj kodu" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
          <TextInput style={[styles.input, styles.formField]} value={payload.packageName || ''} onChangeText={(value) => updateStockPayload(request.id, { packageName: value })} placeholder="Yeni ambalaj adi" placeholderTextColor={colors.textMuted} />
          <TextInput style={[styles.input, styles.formField]} value={payload.shelfCode || ''} onChangeText={(value) => updateStockPayload(request.id, { shelfCode: value })} placeholder="Raf / reyon" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
        </View>
        <View style={styles.formGrid}>
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <TextInput
              key={index}
              style={[styles.input, styles.marginField]}
              value={payload.margins?.[index] || ''}
              onChangeText={(value) => updateStockMargin(request.id, index, value)}
              placeholder={`Marj ${index + 1}`}
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
            />
          ))}
        </View>
        <View style={[styles.formGrid, isWide && styles.formGridWide]}>
          <TextInput style={[styles.input, styles.formField]} value={payload.mainUnitWeightKg || ''} onChangeText={(value) => updateStockPayload(request.id, { mainUnitWeightKg: value })} placeholder="Kg" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
          <TextInput style={[styles.input, styles.formField]} value={payload.mainUnitWidthCm || ''} onChangeText={(value) => updateStockPayload(request.id, { mainUnitWidthCm: value })} placeholder="En cm" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
          <TextInput style={[styles.input, styles.formField]} value={payload.mainUnitLengthCm || ''} onChangeText={(value) => updateStockPayload(request.id, { mainUnitLengthCm: value })} placeholder="Boy cm" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
          <TextInput style={[styles.input, styles.formField]} value={payload.mainUnitHeightCm || ''} onChangeText={(value) => updateStockPayload(request.id, { mainUnitHeightCm: value })} placeholder="Yukseklik cm" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
        </View>
      </View>
    );
  };

  const renderRequestsTab = () => (
    <View style={styles.section}>
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Fiyat teyit talepleri</Text>
        <View style={styles.row}>
          <TextInput style={[styles.input, styles.flex]} value={requestSearch} onChangeText={setRequestSearch} onSubmitEditing={fetchRequests} placeholder="Talep/urun/cari ara" placeholderTextColor={colors.textMuted} />
          <TouchableOpacity style={styles.smallButton} onPress={fetchRequests}>
            <Text style={styles.smallButtonText}>Getir</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {['', 'OPEN', 'WAITING_PURCHASE', 'WAITING_SALES', 'COMPLETED', 'CANCELLED'].map((status) => (
            <Chip key={status || 'ALL'} label={status || 'Tum'} active={requestStatus === status} onPress={() => setRequestStatus(status)} />
          ))}
        </ScrollView>
      </View>
      {requests.map((request) => (
        <View key={request.id} style={styles.card}>
          {(() => {
            const selectedOfferId = selectedOfferIds[request.id] || request.selectedOfferId || request.approvedOfferId || request.bestOffer?.id || '';
            return (
              <>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle} numberOfLines={2}>{request.productName || request.product?.name || request.productCode || '-'}</Text>
            <Text style={styles.badge}>{request.status || '-'}</Text>
          </View>
          <Text style={styles.metaText}>{request.productCode || request.product?.mikroCode || '-'} - Talep: {request.requestedByName || request.createdBy?.name || '-'}</Text>
          <Text style={styles.metaText}>Musteri: {request.customerName || request.customerCode || '-'} - Termin: {dateText(request.deadlineAt || request.deadline)}</Text>
          {(request.offers || []).length > 0 && (
            <View style={styles.subPanel}>
              <Text style={styles.subTitle}>Alternatif fiyatlar</Text>
              {(request.offers || []).slice(0, 5).map((offer: any) => (
                <TouchableOpacity
                  key={offer.id || `${offer.supplierCode}-${offer.createdAt}`}
                  style={[styles.compactRow, selectedOfferId === offer.id && styles.selectedRow]}
                  onPress={() => setSelectedOfferIds((current) => ({ ...current, [request.id]: offer.id }))}
                  activeOpacity={0.85}
                >
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{offer.supplierName || offer.supplierCode || '-'}</Text>
                    <Text style={styles.metaText} numberOfLines={1}>T {money(offer.normalizedCostT || offer.costT)} / P {money(offer.normalizedCostP || offer.costP)} - {offer.leadTimeDays ? `${offer.leadTimeDays} gun` : 'termin yok'}</Text>
                    <Text style={styles.metaText}>Min: {offer.minOrderQuantity || '-'} - {offer.quoteDate ? dateText(offer.quoteDate) : dateText(offer.createdAt)}</Text>
                  </View>
                  {selectedOfferId === offer.id ? <Text style={styles.selectedPill}>Secili</Text> : null}
                  {offer.attachmentUrl ? (
                    <TouchableOpacity style={styles.linkButton} onPress={() => openUrl(offer.attachmentUrl)}>
                      <Text style={styles.linkButtonText}>Dosya</Text>
                    </TouchableOpacity>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          )}
          {expandedRequestId === request.id && (
            <View style={styles.actionPanel}>
              {renderStockPayloadEditor(request)}
              <Text style={styles.subTitle}>Tedarikci fiyat alternatifi gir</Text>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.flex]}
                  value={offerForm.supplierSearch}
                  onChangeText={(value) => patchOfferForm({ supplierSearch: value })}
                  onSubmitEditing={searchSuppliersForOffer}
                  placeholder="Tedarikci kodu veya adi"
                  placeholderTextColor={colors.textMuted}
                />
                <TouchableOpacity style={styles.smallButton} onPress={searchSuppliersForOffer}>
                  <Text style={styles.smallButtonText}>Ara</Text>
                </TouchableOpacity>
              </View>
              {offerSupplierResults.map((supplier) => (
                <TouchableOpacity key={supplier.code} style={styles.resultRow} onPress={() => selectOfferSupplier(supplier)}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{supplier.name}</Text>
                  <Text style={styles.metaText} numberOfLines={1}>{supplier.code}</Text>
                </TouchableOpacity>
              ))}
              <View style={styles.row}>
                <TextInput style={[styles.input, styles.flex]} value={offerForm.supplierCode} onChangeText={(value) => patchOfferForm({ supplierCode: value })} placeholder="Tedarikci kodu" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
                <TextInput style={[styles.input, styles.flex]} value={offerForm.supplierName} onChangeText={(value) => patchOfferForm({ supplierName: value })} placeholder="Tedarikci adi" placeholderTextColor={colors.textMuted} />
              </View>
              <View style={styles.row}>
                <TextInput style={[styles.input, styles.flex]} value={offerForm.costT} onChangeText={updateOfferCostT} placeholder="Maliyet T" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
                <TextInput style={[styles.input, styles.flex]} value={offerForm.costP} onChangeText={updateOfferCostP} placeholder="Maliyet P" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
              </View>
              <View style={styles.row}>
                <TextInput style={[styles.input, styles.flex]} value={offerForm.currency} onChangeText={(value) => patchOfferForm({ currency: value.toUpperCase() })} placeholder="TRY/USD/EUR" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
                <TextInput style={[styles.input, styles.flex]} value={offerForm.exchangeRate} onChangeText={(value) => patchOfferForm({ exchangeRate: value })} placeholder="Kur" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
              </View>
              <View style={styles.row}>
                <TextInput style={[styles.input, styles.flex]} value={offerForm.unit} onChangeText={(value) => patchOfferForm({ unit: value })} placeholder="Birim" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
                <TextInput style={[styles.input, styles.flex]} value={offerForm.unitFactor} onChangeText={(value) => patchOfferForm({ unitFactor: value })} placeholder="Birim katsayisi" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
              </View>
              <View style={styles.row}>
                <TextInput style={[styles.input, styles.flex]} value={offerForm.vatRate} onChangeText={updateOfferVatRate} placeholder="KDV %" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
                <TextInput style={[styles.input, styles.flex]} value={offerForm.leadTimeDays} onChangeText={(value) => patchOfferForm({ leadTimeDays: value })} placeholder="Termin gun" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
              </View>
              <View style={styles.row}>
                <TextInput style={[styles.input, styles.flex]} value={offerForm.minOrderQuantity} onChangeText={(value) => patchOfferForm({ minOrderQuantity: value })} placeholder="Min siparis" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
                <TextInput style={[styles.input, styles.flex]} value={offerForm.validUntil} onChangeText={(value) => patchOfferForm({ validUntil: value })} placeholder="Gecerlilik yyyy-aa-gg" placeholderTextColor={colors.textMuted} />
              </View>
              <TextInput style={styles.input} value={offerForm.supplierProductCode} onChangeText={(value) => patchOfferForm({ supplierProductCode: value })} placeholder="Tedarikci urun kodu" placeholderTextColor={colors.textMuted} />
              <TextInput style={styles.input} value={offerForm.attachmentUrl} onChangeText={(value) => patchOfferForm({ attachmentUrl: value })} placeholder="Ek dosya linki" placeholderTextColor={colors.textMuted} autoCapitalize="none" />
              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => pickAttachment('priceOffer')} disabled={uploadingKey === 'priceOffer-main'}>
                  <Text style={styles.secondaryButtonText}>{uploadingKey === 'priceOffer-main' ? 'Yukleniyor...' : 'Teklif Dosyasi Sec'}</Text>
                </TouchableOpacity>
                {offerForm.attachmentUrl ? (
                  <>
                    <TouchableOpacity style={styles.secondaryButton} onPress={() => openUrl(offerForm.attachmentUrl)}>
                      <Text style={styles.secondaryButtonText}>Dosyayi Ac</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.secondaryButton} onPress={() => patchOfferForm({ attachmentUrl: '' })}>
                      <Text style={styles.secondaryButtonText}>Temizle</Text>
                    </TouchableOpacity>
                  </>
                ) : null}
              </View>
              <TextInput style={styles.input} value={offerForm.note} onChangeText={(value) => patchOfferForm({ note: value })} placeholder="Fiyat notu" placeholderTextColor={colors.textMuted} />
              <ToggleLine label="Fiyati eklerken Mikro maliyetine uygula" value={offerForm.applyToSystem} onPress={() => patchOfferForm({ applyToSystem: !offerForm.applyToSystem })} hint="Kapaliysa sadece alternatif fiyat kaydedilir." />
              <ToggleLine label="Fiyat listelerini de guncelle" value={offerForm.updatePriceLists !== false} onPress={() => patchOfferForm({ updatePriceLists: offerForm.updatePriceLists === false })} hint="Sadece Mikro maliyeti yazilacaksa kapatin." />
              <TouchableOpacity style={styles.primaryButton} onPress={() => submitOffer(request)} disabled={submitting}>
                <Text style={styles.primaryButtonText}>{submitting ? 'Kaydediliyor...' : offerForm.applyToSystem ? 'Fiyat ekle ve uygula' : 'Fiyat ekle'}</Text>
              </TouchableOpacity>
              <View style={styles.subPanel}>
                <Text style={styles.subTitle}>Talep notu ve satis karari</Text>
                <TextInput
                  style={[styles.input, styles.noteInput]}
                  value={requestNotes[request.id] || ''}
                  onChangeText={(value) => setRequestNotes((current) => ({ ...current, [request.id]: value }))}
                  placeholder="Aksiyon notu veya talep notu"
                  placeholderTextColor={colors.textMuted}
                  multiline
                />
                <View style={styles.buttonRow}>
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => addRequestNote(request)} disabled={submitting}>
                    <Text style={styles.secondaryButtonText}>Not Ekle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.primaryButtonFlex} onPress={() => decideRequest(request, true)} disabled={submitting || !(request.offers || []).length}>
                    <Text style={styles.primaryButtonText}>Secili Onayla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dangerButton} onPress={() => decideRequest(request, false)} disabled={submitting}>
                    <Text style={styles.dangerButtonText}>Reddet</Text>
                  </TouchableOpacity>
                </View>
                {(request.notes || []).slice(0, 4).map((note: any) => (
                  <View key={note.id || `${note.createdAt}-${note.body}`} style={styles.noteRow}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{note.authorName || 'Sistem'}</Text>
                      <Text style={styles.metaText}>{dateText(note.createdAt)}</Text>
                    </View>
                    <Text style={styles.metaText} numberOfLines={3}>{note.body || note.note || '-'}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => toggleRequestDetail(request)}>
              <Text style={styles.secondaryButtonText}>{expandedRequestId === request.id ? 'Kapat' : 'Detay / Fiyat'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondaryButton, submitting && styles.disabledButton]} onPress={() => quickRequestAction(request, 'markCurrent')} disabled={submitting}>
              <Text style={styles.secondaryButtonText}>Guncel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondaryButton, submitting && styles.disabledButton]} onPress={() => quickRequestAction(request, 'submit')} disabled={submitting}>
              <Text style={styles.secondaryButtonText}>Satis</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondaryButton, submitting && styles.disabledButton]} onPress={() => completeRequest(request)} disabled={submitting}>
              <Text style={styles.secondaryButtonText}>Tamamla</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.dangerButton, submitting && styles.disabledButton]} onPress={() => quickRequestAction(request, 'cancel')} disabled={submitting}>
              <Text style={styles.dangerButtonText}>Iptal</Text>
            </TouchableOpacity>
          </View>
              </>
            );
          })()}
        </View>
      ))}
      {!requests.length && <Text style={styles.emptyText}>Talep listesi bos.</Text>}
    </View>
  );

  const renderTendersTab = () => (
    <View style={styles.section}>
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Ihale maliyet talepleri</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {['', 'OPEN', 'COMPLETED', 'CANCELLED'].map((status) => (
            <Chip key={status || 'ALL'} label={status || 'Tum'} active={tenderStatus === status} onPress={() => setTenderStatus(status)} />
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.secondaryButton} onPress={fetchTenders}>
          <Text style={styles.secondaryButtonText}>Yenile</Text>
        </TouchableOpacity>
      </View>
      {tenders.map((request) => (
        <View key={request.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle} numberOfLines={2}>{request.title || request.customerName || request.id}</Text>
            <Text style={styles.badge}>{request.status || '-'}</Text>
          </View>
          <Text style={styles.metaText}>Kalem: {request.items?.length || request.itemCount || 0} - Son tarih: {dateText(request.deadlineAt || request.deadline)}</Text>
          {(request.items || []).slice(0, 4).map((item: any) => (
            <Text key={item.id || item.productCode} style={styles.metaText} numberOfLines={1}>- {item.productCode || item.product?.mikroCode} {item.productName || item.product?.name || ''}</Text>
          ))}
          {expandedTenderId === request.id && (
            <View style={styles.actionPanel}>
              <Text style={styles.subTitle}>Ihale kalemleri ve fiyat girisi</Text>
              {(request.attachments || []).length > 0 && (
                <View style={styles.buttonRow}>
                  {(request.attachments || []).map((attachment: any, index: number) => (
                    <TouchableOpacity key={`${attachment.url}-${index}`} style={styles.linkButton} onPress={() => openUrl(attachment.url)}>
                      <Text style={styles.linkButtonText}>{attachment.name || `Ana ek ${index + 1}`}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {(request.items || []).map((item: any) => {
                const form = tenderOfferForms[item.id] || emptyTenderOfferForm;
                const supplierResults = tenderSupplierResults[item.id] || [];
                return (
                  <View key={item.id || item.productCode} style={styles.itemPanel}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle} numberOfLines={2}>{item.productName || item.product?.name || item.productCode || '-'}</Text>
                      <Text style={styles.badge}>{item.quantity || '-'} {item.unit || ''}</Text>
                    </View>
                    <Text style={styles.metaText}>{item.productCode || item.product?.mikroCode || 'Stok disi'} - Hedef: {item.targetPrice ? money(item.targetPrice) : '-'}</Text>
                    {item.bestOffer && <Text style={styles.previewText}>En iyi toplam birim: {money(item.bestOffer.totalUnitCostP || item.bestOffer.normalizedCostP)}</Text>}
                    {(item.attachments || []).length > 0 && (
                      <View style={styles.buttonRow}>
                        {(item.attachments || []).map((attachment: any, index: number) => (
                          <TouchableOpacity key={`${attachment.url}-${index}`} style={styles.linkButton} onPress={() => openUrl(attachment.url)}>
                            <Text style={styles.linkButtonText}>{attachment.name || `Kalem eki ${index + 1}`}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                    {(item.offers || []).length > 0 && (
                      <View style={styles.subPanel}>
                        <Text style={styles.subTitle}>Girilen fiyatlar</Text>
                        {(item.offers || []).slice(0, 5).map((offer: any) => (
                          <View key={offer.id || `${offer.supplierCode}-${offer.createdAt}`} style={styles.compactRow}>
                            <View style={styles.flex}>
                              <Text style={styles.rowTitle} numberOfLines={1}>{offer.supplierName || offer.supplierCode || '-'}</Text>
                              <Text style={styles.metaText} numberOfLines={1}>T/P {money(offer.normalizedCostT || offer.costT)} / {money(offer.normalizedCostP || offer.costP)} - Nakliye {offer.freightCost ? money(offer.freightCost) : '-'}</Text>
                              <Text style={styles.metaText} numberOfLines={1}>Toplam birim: {money(offer.totalUnitCostP || offer.normalizedCostP)} - Termin {offer.leadTimeDays ? `${offer.leadTimeDays} gun` : '-'}</Text>
                            </View>
                            {offer.attachmentUrl ? (
                              <TouchableOpacity style={styles.linkButton} onPress={() => openUrl(offer.attachmentUrl)}>
                                <Text style={styles.linkButtonText}>Dosya</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        ))}
                      </View>
                    )}
                    <View style={styles.subPanel}>
                      <Text style={styles.subTitle}>Bu kaleme fiyat gir</Text>
                      <View style={styles.row}>
                        <TextInput
                          style={[styles.input, styles.flex]}
                          value={form.supplierSearch}
                          onChangeText={(value) => patchTenderOfferForm(item.id, { supplierSearch: value })}
                          onSubmitEditing={() => searchSuppliersForTenderItem(item.id)}
                          placeholder="Tedarikci kodu veya adi"
                          placeholderTextColor={colors.textMuted}
                        />
                        <TouchableOpacity style={styles.smallButton} onPress={() => searchSuppliersForTenderItem(item.id)}>
                          <Text style={styles.smallButtonText}>Ara</Text>
                        </TouchableOpacity>
                      </View>
                      {supplierResults.map((supplier) => (
                        <TouchableOpacity key={supplier.code} style={styles.resultRow} onPress={() => selectTenderSupplier(item.id, supplier)}>
                          <Text style={styles.rowTitle} numberOfLines={1}>{supplier.name}</Text>
                          <Text style={styles.metaText} numberOfLines={1}>{supplier.code}</Text>
                        </TouchableOpacity>
                      ))}
                      <View style={styles.row}>
                        <TextInput style={[styles.input, styles.flex]} value={form.supplierCode} onChangeText={(value) => patchTenderOfferForm(item.id, { supplierCode: value })} placeholder="Tedarikci kodu" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
                        <TextInput style={[styles.input, styles.flex]} value={form.supplierName} onChangeText={(value) => patchTenderOfferForm(item.id, { supplierName: value })} placeholder="Tedarikci adi" placeholderTextColor={colors.textMuted} />
                      </View>
                      <View style={styles.row}>
                        <TextInput style={[styles.input, styles.flex]} value={form.costT} onChangeText={(value) => updateTenderOfferCostT(item.id, value)} placeholder="Maliyet T" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
                        <TextInput style={[styles.input, styles.flex]} value={form.costP} onChangeText={(value) => patchTenderOfferForm(item.id, { costP: value })} placeholder="Maliyet P" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
                      </View>
                      <View style={styles.row}>
                        <TextInput style={[styles.input, styles.flex]} value={form.freightCost} onChangeText={(value) => patchTenderOfferForm(item.id, { freightCost: value })} placeholder="Nakliye maliyeti" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
                        <TextInput style={[styles.input, styles.flex]} value={form.leadTimeDays} onChangeText={(value) => patchTenderOfferForm(item.id, { leadTimeDays: value })} placeholder="Termin gun" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
                      </View>
                      <View style={styles.row}>
                        <TextInput style={[styles.input, styles.flex]} value={form.currency} onChangeText={(value) => patchTenderOfferForm(item.id, { currency: value.toUpperCase() })} placeholder="TRY/USD/EUR" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
                        <TextInput style={[styles.input, styles.flex]} value={form.exchangeRate} onChangeText={(value) => patchTenderOfferForm(item.id, { exchangeRate: value })} placeholder="Kur" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
                      </View>
                      <View style={styles.row}>
                        <TextInput style={[styles.input, styles.flex]} value={form.unit} onChangeText={(value) => patchTenderOfferForm(item.id, { unit: value })} placeholder="Birim" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
                        <TextInput style={[styles.input, styles.flex]} value={form.unitFactor} onChangeText={(value) => patchTenderOfferForm(item.id, { unitFactor: value })} placeholder="Birim katsayisi" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
                      </View>
                      <View style={styles.row}>
                        <TextInput style={[styles.input, styles.flex]} value={form.vatRate} onChangeText={(value) => patchTenderOfferForm(item.id, { vatRate: value })} placeholder="KDV %" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
                        <TextInput style={[styles.input, styles.flex]} value={form.validUntil} onChangeText={(value) => patchTenderOfferForm(item.id, { validUntil: value })} placeholder="Gecerlilik yyyy-aa-gg" placeholderTextColor={colors.textMuted} />
                      </View>
                      <TextInput style={styles.input} value={form.supplierProductCode} onChangeText={(value) => patchTenderOfferForm(item.id, { supplierProductCode: value })} placeholder="Tedarikci urun kodu" placeholderTextColor={colors.textMuted} />
                      <TextInput style={styles.input} value={form.attachmentUrl} onChangeText={(value) => patchTenderOfferForm(item.id, { attachmentUrl: value })} placeholder="Ek dosya linki" placeholderTextColor={colors.textMuted} autoCapitalize="none" />
                      <View style={styles.buttonRow}>
                        <TouchableOpacity style={styles.secondaryButton} onPress={() => pickAttachment('tenderOffer', item.id)} disabled={uploadingKey === `tenderOffer-${item.id}`}>
                          <Text style={styles.secondaryButtonText}>{uploadingKey === `tenderOffer-${item.id}` ? 'Yukleniyor...' : 'Teklif Dosyasi Sec'}</Text>
                        </TouchableOpacity>
                        {form.attachmentUrl ? (
                          <>
                            <TouchableOpacity style={styles.secondaryButton} onPress={() => openUrl(form.attachmentUrl)}>
                              <Text style={styles.secondaryButtonText}>Dosyayi Ac</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.secondaryButton} onPress={() => patchTenderOfferForm(item.id, { attachmentUrl: '' })}>
                              <Text style={styles.secondaryButtonText}>Temizle</Text>
                            </TouchableOpacity>
                          </>
                        ) : null}
                      </View>
                      <TextInput style={styles.input} value={form.note} onChangeText={(value) => patchTenderOfferForm(item.id, { note: value })} placeholder="Teklif notu" placeholderTextColor={colors.textMuted} />
                      <TouchableOpacity style={styles.primaryButton} onPress={() => submitTenderOffer(request, item)} disabled={submitting}>
                        <Text style={styles.primaryButtonText}>{submitting ? 'Kaydediliyor...' : 'Kaleme fiyat ekle'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setExpandedTenderId(expandedTenderId === request.id ? null : request.id)}>
              <Text style={styles.secondaryButtonText}>{expandedTenderId === request.id ? 'Kapat' : 'Kalem / Fiyat'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondaryButton, submitting && styles.disabledButton]} onPress={() => quickTenderAction(request, 'complete')} disabled={submitting}>
              <Text style={styles.secondaryButtonText}>Tamamla</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.dangerButton, submitting && styles.disabledButton]} onPress={() => quickTenderAction(request, 'cancel')} disabled={submitting}>
              <Text style={styles.dangerButtonText}>Iptal</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      {!tenders.length && <Text style={styles.emptyText}>Ihale talebi yok.</Text>}
    </View>
  );

  const content = () => {
    if (tab === 'product') return renderProductTab();
    if (tab === 'reports') return renderReportsTab();
    if (tab === 'requests') return renderRequestsTab();
    return renderTendersTab();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {renderHeader()}
        {loading && <ActivityIndicator color={colors.primary} />}
        {content()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { paddingVertical: spacing.xs, gap: spacing.md },
  kicker: { fontFamily: fonts.bold, fontSize: fontSizes.xs, color: '#93C5FD', letterSpacing: 0.4, textTransform: 'uppercase' },
  title: { fontFamily: fonts.bold, fontSize: fontSizes.xxl, color: '#FFFFFF' },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: '#DDE8FF', lineHeight: 20 },
  heroStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  heroStat: { flex: 1, minWidth: 94, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', borderRadius: radius.lg, padding: spacing.md },
  heroStatLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: '#BCD2F7' },
  heroStatValue: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: '#FFFFFF', marginTop: 4 },
  tabs: { gap: spacing.sm, paddingRight: spacing.xl },
  chip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  chipText: { fontFamily: fonts.semibold, color: colors.textMuted, fontSize: fontSizes.sm },
  chipTextActive: { color: '#FFFFFF' },
  section: { gap: spacing.md },
  panel: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.md },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  flex: { flex: 1 },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: colors.text, backgroundColor: colors.surface, fontFamily: fonts.regular, fontSize: fontSizes.sm },
  noteInput: { minHeight: 76, paddingTop: spacing.sm, textAlignVertical: 'top' },
  formGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  formGridWide: { gap: spacing.md },
  formField: { flexGrow: 1, flexBasis: 220, minWidth: 180 },
  marginField: { flexGrow: 1, flexBasis: 96, minWidth: 92 },
  smallButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 46, justifyContent: 'center' },
  smallButtonText: { fontFamily: fonts.bold, color: '#FFFFFF', fontSize: fontSizes.sm },
  resultRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, gap: 2 },
  rowTitle: { minWidth: 0, fontFamily: fonts.semibold, color: colors.text, fontSize: fontSizes.sm, lineHeight: 20 },
  metaText: { minWidth: 0, fontFamily: fonts.regular, color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 18 },
  subTitle: { fontFamily: fonts.bold, color: colors.text, fontSize: fontSizes.sm },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: { flexGrow: 1, flexBasis: '45%', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  metricLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  metricValue: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: colors.text, marginTop: spacing.xs },
  textDanger: { color: colors.danger },
  textSuccess: { color: colors.success },
  textWarning: { color: colors.warning },
  productHero: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs },
  productTitle: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text, lineHeight: 24 },
  previewText: { fontFamily: fonts.semibold, color: colors.primarySoft, fontSize: fontSizes.sm },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radius.md, alignItems: 'center', paddingVertical: spacing.sm },
  primaryButtonFlex: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  primaryButtonText: { fontFamily: fonts.bold, color: '#FFFFFF' },
  secondaryButton: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  secondaryButtonText: { fontFamily: fonts.bold, color: colors.primarySoft, fontSize: fontSizes.sm },
  dangerButton: { flex: 1, backgroundColor: colors.danger, borderRadius: radius.md, alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  dangerButtonText: { fontFamily: fonts.bold, color: '#FFFFFF', fontSize: fontSizes.sm },
  disabledButton: { opacity: 0.55 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { flex: 1, minWidth: 0, fontFamily: fonts.bold, fontSize: fontSizes.md, color: colors.text, lineHeight: 22 },
  badge: { fontFamily: fonts.bold, fontSize: fontSizes.xs, color: colors.primarySoft, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  buttonRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  subPanel: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, gap: spacing.sm },
  actionPanel: { backgroundColor: colors.surfaceMuted, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  itemPanel: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, gap: spacing.sm },
  compactRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  selectedRow: { backgroundColor: colors.successSoft, borderColor: '#A7F3D0', borderWidth: 1, borderRadius: radius.md, padding: spacing.sm },
  selectedPill: { fontFamily: fonts.bold, color: colors.success, backgroundColor: colors.successSoft, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4, fontSize: fontSizes.xs },
  noteRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, gap: spacing.xs },
  linkButton: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.primarySoft, backgroundColor: colors.surface, paddingHorizontal: spacing.sm, paddingVertical: 7 },
  linkButtonText: { fontFamily: fonts.bold, color: colors.primarySoft, fontSize: fontSizes.xs },
  toggleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.sm },
  toggleDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  toggleDotActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  toggleLabel: { fontFamily: fonts.bold, color: colors.text, fontSize: fontSizes.sm },
  emptyText: { fontFamily: fonts.regular, color: colors.textMuted, textAlign: 'center', padding: spacing.lg },
});
