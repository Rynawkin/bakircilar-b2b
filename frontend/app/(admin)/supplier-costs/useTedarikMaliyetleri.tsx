'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  CheckCircle2,
  HandCoins,
  History,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import adminApi from '@/lib/api/admin';
import { formatDateShort } from '@/lib/utils/format';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';

/**
 * Tedarikci Maliyet Havuzu ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'teki SupplierCostsPage'in `return (` oncesindeki mantigin
 * BIRE BIR tasinmis halidir. AI/stok-ailesi yoktur; Mikro yazan handler'lar (applySupplierCost,
 * confirmSaveApply, applyCost, complete, markCurrent vb.) AYNEN korunmustur.
 * mark-current SADECE satis tarafina bilgi verir; Mikro maliyet tarihini OTOMATIK GUNCELLEMEZ.
 */

export type TabKey = 'dashboard' | 'entry' | 'reports' | 'history' | 'requests' | 'tenders';

export type FormState = {
  productCode: string;
  supplierCode: string;
  supplierName: string;
  supplierProductCode: string;
  costP: string;
  costT: string;
  currency: string;
  exchangeRate: string;
  vatIncluded: boolean;
  vatRate: string;
  unit: string;
  unitFactor: string;
  minOrderQuantity: string;
  leadTimeDays: string;
  validUntil: string;
  quoteDate: string;
  sourceType: string;
  note: string;
  attachmentUrl: string;
};

export const emptyForm: FormState = {
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

export const reportSections = [
  { key: 'currentAboveBest', title: 'Mikro maliyeti en iyi tedarikciden yuksek', icon: TrendingDown, tone: 'emerald' },
  { key: 'currentBelowSupplier', title: 'Mikro maliyeti dusuk / zarar riski', icon: ShieldAlert, tone: 'red' },
  { key: 'staleCosts', title: 'Maliyeti uzun suredir guncellenmeyenler', icon: History, tone: 'amber' },
  { key: 'singleSupplier', title: 'Tek tedarikciye bagli urunler', icon: AlertTriangle, tone: 'orange' },
  { key: 'highSpread', title: 'Tedarikciler arasi fiyat farki yuksek', icon: TrendingUp, tone: 'blue' },
  { key: 'expiredCosts', title: 'Gecerliligi dolan maliyetler', icon: X, tone: 'slate' },
  { key: 'betterAfterApplied', title: 'Son uygulamadan sonra daha iyi fiyat gelenler', icon: CheckCircle2, tone: 'emerald' },
  { key: 'mainSupplierAboveMarket', title: 'Ana saglayici piyasanin ustunde', icon: HandCoins, tone: 'red' },
];

export const money = (value: any) =>
  Number.isFinite(Number(value))
    ? Number(value).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    : '-';
export const dateText = (value: any) => (value ? formatDateShort(String(value)) : '-');
export const dateTimeText = (value: any) =>
  value
    ? new Date(value).toLocaleString('tr-TR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';
export const percent = (value: any) => (Number.isFinite(Number(value)) ? `${Number(value).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}%` : '-');
export const parseNumberText = (value: string) => Number(String(value || '').replace(',', '.'));
export const formatInputNumber = (value: number) => (Number.isFinite(value) ? value.toFixed(4).replace(/\.?0+$/, '') : '');
export const resolveVatPercent = (value: any, fallback = 20) => {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const parsed = parseNumberText(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed <= 1 ? parsed * 100 : parsed;
};
export const costPFromCostT = (costT: string, vatPercent: number) => {
  const parsedCostT = parseNumberText(costT);
  if (!Number.isFinite(parsedCostT) || parsedCostT <= 0) return '';
  return formatInputNumber(parsedCostT * (1 + Math.max(vatPercent, 0) / 200));
};

// 6.1: Maliyet Mikroya yazilmadan once degisim ozeti gosterilir. Bu esigin uzeri
// degisimlerde (parmak hatasi, or. 1.250 yerine 12.500) ek/ikinci onay istenir.
export const BIG_COST_CHANGE_PERCENT = 30;
// 6.1: Mevcut maliyet -> yeni maliyet yuzde degisimini hesaplar (yon bilgisiyle birlikte).
export const computeCostChange = (currentCost: any, newCost: any) => {
  const current = Number(currentCost);
  const next = Number(newCost);
  const hasCurrent = Number.isFinite(current) && current > 0;
  const hasNext = Number.isFinite(next) && next > 0;
  if (!hasNext) return { percent: null as number | null, isBig: false, hasCurrent, direction: 'same' as 'up' | 'down' | 'same' };
  if (!hasCurrent) {
    // Mevcut maliyet yoksa yuzde hesaplanamaz; yine de yeni deger gosterilir, esik tetiklenmez.
    return { percent: null as number | null, isBig: false, hasCurrent, direction: 'same' as 'up' | 'down' | 'same' };
  }
  const pct = ((next - current) / current) * 100;
  return {
    percent: pct,
    isBig: Math.abs(pct) >= BIG_COST_CHANGE_PERCENT,
    hasCurrent,
    direction: pct > 0 ? ('up' as const) : pct < 0 ? ('down' as const) : ('same' as const),
  };
};

export function useTedarikMaliyetleri() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [initialUrlTab, setInitialUrlTab] = useState<string | null>(null);
  const [initialRequestId, setInitialRequestId] = useState<string | null>(null);
  const { loadUserFromStorage } = useAuthStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const canManageSupplierCosts = hasPermission('admin:supplier-costs');
  const canUsePriceRequests =
    canManageSupplierCosts ||
    hasPermission('admin:quotes') ||
    hasPermission('admin:orders') ||
    hasPermission('admin:field-sales');
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [costs, setCosts] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingCostId, setEditingCostId] = useState<string | null>(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierResults, setSupplierResults] = useState<Array<{ code: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [applyTarget, setApplyTarget] = useState<any | null>(null);
  const [applyUpdateLists, setApplyUpdateLists] = useState(true);
  // 6.1: Buyuk degisimde uygula modalinda istenen ek/ikinci onay.
  const [applyBigChangeAck, setApplyBigChangeAck] = useState(false);
  const [applyAfterSave, setApplyAfterSave] = useState(false);
  const [applyAfterSaveLists, setApplyAfterSaveLists] = useState(true);
  const [applyNote, setApplyNote] = useState('');
  // 6.1: "Kaydet ve Mikroya uygula" akisinda, Mikroya yazmadan once gosterilen onay/ozet diyalogu.
  const [saveApplyConfirm, setSaveApplyConfirm] = useState<{
    payload: any;
    currentCost: number;
    newCostT: number | null;
    newCostP: number | null;
    updateLists: boolean;
  } | null>(null);
  const [saveApplyBigChangeAck, setSaveApplyBigChangeAck] = useState(false);
  const [reports, setReports] = useState<any | null>(null);
  const [reportSearch, setReportSearch] = useState('');
  const [staleDays, setStaleDays] = useState(60);
  const [tolerancePercent, setTolerancePercent] = useState(10);
  const [spreadPercent, setSpreadPercent] = useState(15);
  const [historySearch, setHistorySearch] = useState('');
  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [manualCostPOverride, setManualCostPOverride] = useState(false);

  const normalizedPreview = useMemo(() => {
    const costP = parseNumberText(form.costP);
    const costT = parseNumberText(form.costT || form.costP);
    const factor = Math.max(parseNumberText(form.unitFactor) || 1, 0.0001);
    const fx = form.currency === 'TRY' ? 1 : parseNumberText(form.exchangeRate);
    const vatRaw = form.vatRate ? parseNumberText(form.vatRate) : Number(selectedProduct?.vatRate || 0);
    const vatRate = vatRaw > 1 ? vatRaw / 100 : vatRaw;
    const divider = form.vatIncluded ? 1 + vatRate : 1;
    if (!Number.isFinite(costP) || costP <= 0 || !Number.isFinite(costT) || costT <= 0 || !Number.isFinite(fx) || fx <= 0) {
      return null;
    }
    return {
      costP: (costP * fx) / factor / divider,
      costT: (costT * fx) / factor / divider,
    };
  }, [form, selectedProduct]);

  const updateForm = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));
  const updateMainCostT = (value: string) => {
    setForm((current) => {
      const patch: Partial<FormState> = { costT: value };
      if (!manualCostPOverride) {
        patch.costP = costPFromCostT(value, resolveVatPercent(current.vatRate || selectedProduct?.vatRate, 20));
      }
      return { ...current, ...patch };
    });
  };
  const updateMainCostP = (value: string) => {
    setManualCostPOverride(true);
    updateForm({ costP: value });
  };
  const updateMainVatRate = (value: string) => {
    setForm((current) => {
      const patch: Partial<FormState> = { vatRate: value };
      if (!manualCostPOverride && current.costT) {
        patch.costP = costPFromCostT(current.costT, resolveVatPercent(value, 20));
      }
      return { ...current, ...patch };
    });
  };

  const searchProducts = async () => {
    if (!productSearch.trim()) return toast.error('Urun aramasi girin');
    setLoading(true);
    try {
      const result = await adminApi.searchSupplierCostProducts({ search: productSearch, limit: 30 });
      setProductResults(result.products || []);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Urun aramasi yapilamadi');
    } finally {
      setLoading(false);
    }
  };

  const loadProduct = async (productCode: string) => {
    setLoading(true);
    try {
      const detail = await adminApi.getSupplierCostProduct(productCode);
      setSelectedProduct(detail.product);
      setCosts(detail.costs || []);
      setApplications(detail.applications || []);
      setMetrics(detail.metrics || null);
      setForm({
        ...emptyForm,
        productCode: detail.product?.mikroCode || productCode,
        vatRate: String(Number(detail.product?.vatRate || 0) > 1 ? detail.product?.vatRate : Number(detail.product?.vatRate || 0) * 100),
        unit: detail.product?.unit || '',
        unitFactor: '1',
      });
      setManualCostPOverride(false);
      setEditingCostId(null);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Urun detayi alinamadi');
    } finally {
      setLoading(false);
    }
  };

  const searchSuppliers = async () => {
    setSupplierResults([]);
    try {
      const result = await adminApi.searchSupplierCostSuppliers({ search: supplierSearch, limit: 30 });
      setSupplierResults(result.suppliers || []);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Tedarikci aramasi yapilamadi');
    }
  };

  const saveCost = async () => {
    if (!form.productCode) return toast.error('Once urun secin');
    if (!form.supplierCode && !form.supplierName) return toast.error('Tedarikci girin');
    const costT = parseNumberText(form.costT);
    const costP = parseNumberText(form.costP);
    if (!Number.isFinite(costT) || costT <= 0) return toast.error('Maliyet T zorunlu');
    if (!Number.isFinite(costP) || costP <= 0) return toast.error('Maliyet P zorunlu');

    setSaving(true);
    try {
      const payload = {
        ...form,
        costP,
        costT,
        exchangeRate: form.currency === 'TRY' ? undefined : parseNumberText(form.exchangeRate),
        vatRate: form.vatRate ? parseNumberText(form.vatRate) : undefined,
        unitFactor: parseNumberText(form.unitFactor) || 1,
        minOrderQuantity: form.minOrderQuantity ? parseNumberText(form.minOrderQuantity) : undefined,
        leadTimeDays: form.leadTimeDays ? parseNumberText(form.leadTimeDays) : undefined,
      };
      let savedCost: any = null;
      if (editingCostId) {
        const result = await adminApi.updateSupplierCost(editingCostId, payload);
        savedCost = result.cost;
        toast.success('Maliyet kaydi guncellendi');
      } else {
        const result = await adminApi.createSupplierCost(payload);
        savedCost = result.cost;
        toast.success('Maliyet kaydi eklendi');
      }
      // 6.1: Mikroya yazmadan ONCE onay/ozet diyalogu ac. Kayit (PostgreSQL) yapildi;
      // Mikro maliyet yazimi sadece kullanici ozeti onayladiktan sonra calisir.
      if (applyAfterSave && savedCost?.id) {
        const newCostT = Number.isFinite(Number(savedCost?.normalizedCostT))
          ? Number(savedCost.normalizedCostT)
          : (normalizedPreview ? normalizedPreview.costT : null);
        const newCostP = Number.isFinite(Number(savedCost?.normalizedCostP))
          ? Number(savedCost.normalizedCostP)
          : (normalizedPreview ? normalizedPreview.costP : null);
        setSaveApplyBigChangeAck(false);
        setSaveApplyConfirm({
          payload: {
            id: savedCost.id,
            productCode: savedCost.productCode || form.productCode,
            updatePriceLists: applyAfterSaveLists,
            note: `${savedCost.productCode || form.productCode} maliyet girisinden uygulandi.`,
          },
          currentCost: Number(selectedProduct?.currentCost),
          newCostT,
          newCostP,
          updateLists: applyAfterSaveLists,
        });
        // Diyalog acildiktan sonra liste tazelensin; Mikro yazimi confirm handler'da.
        await loadProduct(form.productCode);
        await loadHistory();
        return;
      }
      await loadProduct(form.productCode);
      await loadHistory();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Kayit yapilamadi');
    } finally {
      setSaving(false);
    }
  };

  // 6.1: "Kaydet ve Mikroya uygula" ozeti onaylandiktan sonra Mikro maliyet yazimini calistirir.
  const confirmSaveApply = async () => {
    if (!saveApplyConfirm) return;
    setSaving(true);
    try {
      await adminApi.applySupplierCost(saveApplyConfirm.payload.id, {
        updatePriceLists: saveApplyConfirm.payload.updatePriceLists,
        note: saveApplyConfirm.payload.note,
      });
      toast.success(saveApplyConfirm.payload.updatePriceLists ? 'Maliyet ve 10 liste Mikroya uygulandi' : 'Maliyet Mikroya uygulandi');
      setSaveApplyConfirm(null);
      setSaveApplyBigChangeAck(false);
      if (saveApplyConfirm.payload.productCode) await loadProduct(saveApplyConfirm.payload.productCode);
      await loadHistory();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Maliyet uygulanamadi');
    } finally {
      setSaving(false);
    }
  };

  const editCost = (cost: any) => {
    setEditingCostId(cost.id);
    setForm({
      productCode: cost.productCode || '',
      supplierCode: cost.supplierCode || '',
      supplierName: cost.supplierName || '',
      supplierProductCode: cost.supplierProductCode || '',
      costP: String(cost.costP || ''),
      costT: String(cost.costT || ''),
      currency: cost.currency || 'TRY',
      exchangeRate: cost.exchangeRate ? String(cost.exchangeRate) : '',
      vatIncluded: Boolean(cost.vatIncluded),
      vatRate: cost.vatRate !== null && cost.vatRate !== undefined ? String(Number(cost.vatRate) > 1 ? cost.vatRate : Number(cost.vatRate) * 100) : '',
      unit: cost.unit || '',
      unitFactor: cost.unitFactor ? String(cost.unitFactor) : '1',
      minOrderQuantity: cost.minOrderQuantity ? String(cost.minOrderQuantity) : '',
      leadTimeDays: cost.leadTimeDays ? String(cost.leadTimeDays) : '',
      validUntil: cost.validUntil ? String(cost.validUntil).slice(0, 10) : '',
      quoteDate: cost.quoteDate ? String(cost.quoteDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
      sourceType: cost.sourceType || 'MANUAL',
      note: cost.note || '',
      attachmentUrl: cost.attachmentUrl || '',
    });
    setManualCostPOverride(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const archiveCost = async (cost: any) => {
    if (!window.confirm(`${cost.productCode} - ${cost.supplierName} maliyet kaydi arsivlensin mi?`)) return;
    try {
      await adminApi.archiveSupplierCost(cost.id);
      toast.success('Kayit arsivlendi');
      if (selectedProduct?.mikroCode) await loadProduct(selectedProduct.mikroCode);
      await loadHistory();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Kayit arsivlenemedi');
    }
  };

  const applyCost = async () => {
    if (!applyTarget) return;
    setApplying(applyTarget.id);
    try {
      await adminApi.applySupplierCost(applyTarget.id, {
        updatePriceLists: applyUpdateLists,
        note: applyNote || null,
      });
      toast.success(applyUpdateLists ? 'Maliyet ve fiyat listeleri guncellendi' : 'Maliyet guncellendi');
      setApplyTarget(null);
      setApplyNote('');
      setApplyBigChangeAck(false); // 6.1: ek onay isaretini sifirla
      if (applyTarget.productCode) await loadProduct(applyTarget.productCode);
      await Promise.all([loadReports(), loadHistory()]);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Maliyet uygulanamadi');
    } finally {
      setApplying(null);
    }
  };

  const loadReports = async () => {
    try {
      const result = await adminApi.getSupplierCostReports({
        staleDays,
        tolerancePercent,
        spreadPercent,
        search: reportSearch || undefined,
        limit: 300,
      });
      setReports(result);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Raporlar alinamadi');
    }
  };

  const loadHistory = async () => {
    try {
      const result = await adminApi.getSupplierCosts({
        search: historySearch || undefined,
        status: 'ALL',
        page: 1,
        limit: 80,
      });
      setHistoryRows(result.items || []);
    } catch {
      setHistoryRows([]);
    }
  };

  const uploadAttachment = async (file?: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const data = new FormData();
      data.append('file', file);
      const result = await adminApi.uploadSupplierCostAttachment(data);
      updateForm({ attachmentUrl: result.attachmentUrl });
      toast.success('Dosya eklendi');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Dosya yuklenemedi');
    } finally {
      setUploading(false);
    }
  };

  const importMatches = async () => {
    if (!window.confirm('Son tedarikci fiyat listesi eslesmelerinden aday maliyet kaydi olusturulsun mu?')) return;
    try {
      const result = await adminApi.importSupplierCostPriceListMatches({ limit: 1000 });
      toast.success(`${result.created} kayit aktarildi, ${result.skipped} atlandi`);
      await Promise.all([loadReports(), loadHistory()]);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Aktarim yapilamadi');
    }
  };

  useEffect(() => {
    loadUserFromStorage();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setInitialUrlTab(params.get('tab'));
      setInitialRequestId(params.get('requestId'));
    }
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (permissionsLoading) return;
    if (initialUrlTab === 'requests' || initialUrlTab === 'tenders') {
      setActiveTab(initialUrlTab as TabKey);
    } else if (!canManageSupplierCosts) {
      setActiveTab('requests');
    }
  }, [permissionsLoading, initialUrlTab, canManageSupplierCosts]);

  useEffect(() => {
    if (permissionsLoading || !canManageSupplierCosts) return;
    void loadReports();
    void loadHistory();
  }, [permissionsLoading, canManageSupplierCosts]);

  const visibleTabs = useMemo(() => {
    const tabs: Array<[TabKey, string]> = [];
    tabs.push(['dashboard', 'Ozet']);
    if (canManageSupplierCosts) {
      tabs.push(['entry', 'Maliyet gir / uygula'], ['reports', 'Raporlar'], ['history', 'Gecmis']);
    }
    if (canUsePriceRequests) tabs.push(['requests', 'Fiyat teyit talepleri']);
    if (canUsePriceRequests) tabs.push(['tenders', 'Ihale maliyet talepleri']);
    return tabs;
  }, [canManageSupplierCosts, canUsePriceRequests]);

  return {
    // izin / sekme
    canManageSupplierCosts,
    canUsePriceRequests,
    activeTab,
    setActiveTab,
    visibleTabs,
    initialRequestId,
    // urun arama / secim
    productSearch,
    setProductSearch,
    productResults,
    selectedProduct,
    searchProducts,
    loadProduct,
    // maliyet kayitlari / metrikler
    costs,
    applications,
    metrics,
    // form
    form,
    updateForm,
    updateMainCostT,
    updateMainCostP,
    updateMainVatRate,
    editingCostId,
    setEditingCostId,
    setForm,
    setManualCostPOverride,
    normalizedPreview,
    // tedarikci arama
    supplierSearch,
    setSupplierSearch,
    supplierResults,
    setSupplierResults,
    searchSuppliers,
    // durum bayraklari
    loading,
    saving,
    applying,
    uploading,
    // maliyet kaydet / uygula
    saveCost,
    editCost,
    archiveCost,
    // uygula modal state
    applyTarget,
    setApplyTarget,
    applyUpdateLists,
    setApplyUpdateLists,
    applyBigChangeAck,
    setApplyBigChangeAck,
    applyAfterSave,
    setApplyAfterSave,
    applyAfterSaveLists,
    setApplyAfterSaveLists,
    applyNote,
    setApplyNote,
    applyCost,
    // kaydet+uygula onay diyalogu
    saveApplyConfirm,
    setSaveApplyConfirm,
    saveApplyBigChangeAck,
    setSaveApplyBigChangeAck,
    confirmSaveApply,
    // raporlar
    reports,
    reportSearch,
    setReportSearch,
    staleDays,
    setStaleDays,
    tolerancePercent,
    setTolerancePercent,
    spreadPercent,
    setSpreadPercent,
    loadReports,
    importMatches,
    // gecmis
    historySearch,
    setHistorySearch,
    historyRows,
    loadHistory,
    // dosya yukleme
    uploadAttachment,
  };
}

export type UseTedarikMaliyetleriReturn = ReturnType<typeof useTedarikMaliyetleri>;
