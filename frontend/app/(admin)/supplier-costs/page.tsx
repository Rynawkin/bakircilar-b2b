'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  FileUp,
  HandCoins,
  History,
  MessageSquare,
  Package,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  UploadCloud,
  X,
} from 'lucide-react';
import adminApi from '@/lib/api/admin';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { cn } from '@/lib/utils/cn';
import { formatDateShort } from '@/lib/utils/format';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';

type TabKey = 'dashboard' | 'entry' | 'reports' | 'history' | 'requests' | 'tenders';

type FormState = {
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

const emptyForm: FormState = {
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

const reportSections = [
  { key: 'currentAboveBest', title: 'Mikro maliyeti en iyi tedarikciden yuksek', icon: TrendingDown, tone: 'emerald' },
  { key: 'currentBelowSupplier', title: 'Mikro maliyeti dusuk / zarar riski', icon: ShieldAlert, tone: 'red' },
  { key: 'staleCosts', title: 'Maliyeti uzun suredir guncellenmeyenler', icon: History, tone: 'amber' },
  { key: 'singleSupplier', title: 'Tek tedarikciye bagli urunler', icon: AlertTriangle, tone: 'orange' },
  { key: 'highSpread', title: 'Tedarikciler arasi fiyat farki yuksek', icon: TrendingUp, tone: 'blue' },
  { key: 'expiredCosts', title: 'Gecerliligi dolan maliyetler', icon: X, tone: 'slate' },
  { key: 'betterAfterApplied', title: 'Son uygulamadan sonra daha iyi fiyat gelenler', icon: CheckCircle2, tone: 'emerald' },
  { key: 'mainSupplierAboveMarket', title: 'Ana saglayici piyasanin ustunde', icon: HandCoins, tone: 'red' },
];

const money = (value: any) =>
  Number.isFinite(Number(value))
    ? Number(value).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    : '-';
const dateText = (value: any) => (value ? formatDateShort(String(value)) : '-');
const percent = (value: any) => (Number.isFinite(Number(value)) ? `${Number(value).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}%` : '-');
const parseNumberText = (value: string) => Number(String(value || '').replace(',', '.'));
const formatInputNumber = (value: number) => (Number.isFinite(value) ? value.toFixed(4).replace(/\.?0+$/, '') : '');
const resolveVatPercent = (value: any, fallback = 20) => {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const parsed = parseNumberText(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed <= 1 ? parsed * 100 : parsed;
};
const costPFromCostT = (costT: string, vatPercent: number) => {
  const parsedCostT = parseNumberText(costT);
  if (!Number.isFinite(parsedCostT) || parsedCostT <= 0) return '';
  return formatInputNumber(parsedCostT * (1 + Math.max(vatPercent, 0) / 200));
};

export default function SupplierCostsPage() {
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
  const [applyAfterSave, setApplyAfterSave] = useState(false);
  const [applyAfterSaveLists, setApplyAfterSaveLists] = useState(true);
  const [applyNote, setApplyNote] = useState('');
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
      if (applyAfterSave && savedCost?.id) {
        await adminApi.applySupplierCost(savedCost.id, {
          updatePriceLists: applyAfterSaveLists,
          note: `${savedCost.productCode || form.productCode} maliyet girisinden uygulandi.`,
        });
        toast.success(applyAfterSaveLists ? 'Maliyet ve 10 liste Mikroya uygulandi' : 'Maliyet Mikroya uygulandi');
      }
      await loadProduct(form.productCode);
      await loadHistory();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Kayit yapilamadi');
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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fef3c7,transparent_30%),linear-gradient(135deg,#f8fafc,#eef2ff_45%,#f8fafc)]">
      <div className="mx-auto max-w-[1800px] space-y-6 px-4 py-6 lg:px-8">
        <header className="overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-950 text-white shadow-xl">
          <div className="grid gap-6 p-6 lg:grid-cols-[1.3fr_0.7fr] lg:p-8">
            <div>
              <Link href="/reports" className="mb-4 inline-flex items-center text-sm font-bold text-amber-200 hover:text-white">
                <ArrowLeft className="mr-2 h-4 w-4" /> Raporlara don
              </Link>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-amber-400 p-3 text-slate-950">
                  <HandCoins className="h-7 w-7" />
                </div>
                <div>
                  <h1 className="text-3xl font-black tracking-tight lg:text-4xl">Tedarikci Maliyet Havuzu</h1>
                  <p className="mt-2 max-w-3xl text-sm text-slate-300 lg:text-base">
                    Ayni urun icin farkli firmalardan gelen maliyetleri sakla, karsilastir, raporla ve secilen maliyeti mevcut Mikro fiyat motoruyla uygula.
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <HeroMetric label="Maliyet kaydi" value={reports?.summary?.costCount || 0} />
              <HeroMetric label="Riskli urun" value={(reports?.summary?.currentBelowSupplier || 0) + (reports?.summary?.expiredCosts || 0)} tone="red" />
              <HeroMetric label="Firsat" value={(reports?.summary?.currentAboveBest || 0) + (reports?.summary?.betterAfterApplied || 0)} tone="emerald" />
              <HeroMetric label="Tek tedarikci" value={reports?.summary?.singleSupplier || 0} tone="amber" />
            </div>
          </div>
        </header>

        <div className="flex flex-wrap gap-2">
          {visibleTabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key as TabKey)}
              className={cn(
                'rounded-full px-5 py-2 text-sm font-black transition',
                activeTab === key ? 'bg-slate-950 text-white shadow-lg' : 'bg-white text-slate-600 shadow-sm hover:bg-slate-100'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'requests' && (
          <PriceRequestsPanel canManage={canManageSupplierCosts} initialRequestId={initialRequestId} />
        )}

        {activeTab === 'dashboard' && (
          <SupplierCostDashboard
            canManage={canManageSupplierCosts}
            reports={reports}
            onOpenRequests={() => setActiveTab('requests')}
            onOpenTenders={() => setActiveTab('tenders')}
            onOpenEntry={() => setActiveTab(canManageSupplierCosts ? 'entry' : 'requests')}
          />
        )}

        {activeTab === 'tenders' && (
          <TenderRequestsPanel canManage={canManageSupplierCosts} />
        )}

        {activeTab === 'entry' && (
          <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
            <Card className="rounded-[2rem]">
              <CardHeader>
                <CardTitle className="text-xl">Urun sec</CardTitle>
                <CardDescription>Stok kodu, isim veya marka ile arayin.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && searchProducts()}
                    placeholder="B108423, havlu, focus..."
                    className="h-12 rounded-2xl"
                  />
                  <Button onClick={searchProducts} isLoading={loading} className="h-12 rounded-2xl">
                    <Search className="mr-2 h-4 w-4" /> Ara
                  </Button>
                </div>
                <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
                  {productResults.map((product) => (
                    <button
                      key={product.mikroCode}
                      type="button"
                      onClick={() => loadProduct(product.mikroCode)}
                      className={cn(
                        'flex w-full gap-3 rounded-2xl border p-3 text-left transition hover:border-amber-300 hover:bg-amber-50',
                        selectedProduct?.mikroCode === product.mikroCode ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'
                      )}
                    >
                      <ProductThumb product={product} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-950">{product.name}</p>
                        <p className="text-xs font-bold text-slate-500">{product.mikroCode} - {product.unit}</p>
                        <p className="mt-1 text-xs text-slate-500">Maliyet: {money(product.currentCost)} | Son giris: {money(product.lastEntryPrice)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              {selectedProduct ? (
                <>
                  <ProductSummary product={selectedProduct} metrics={metrics} />
                  <Card className="rounded-[2rem]">
                    <CardHeader>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-xl">{editingCostId ? 'Maliyet kaydini duzenle' : 'Yeni tedarikci maliyeti'}</CardTitle>
                          <CardDescription>Mikroya yazilacak deger Ucarer Depo ile ayni Maliyet T/P mantigiyla hesaplanir.</CardDescription>
                        </div>
                        {editingCostId && (
                          <Button variant="outline" onClick={() => { setEditingCostId(null); setManualCostPOverride(false); setForm({ ...emptyForm, productCode: selectedProduct.mikroCode, unit: selectedProduct.unit || '', vatRate: String(Number(selectedProduct.vatRate || 0) * 100) }); }}>
                            Yeni kayit
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                        <Input value={supplierSearch} onChange={(event) => setSupplierSearch(event.target.value)} placeholder="Tedarikci kodu veya adi ara..." className="h-12 rounded-2xl" />
                        <Button variant="secondary" onClick={searchSuppliers} className="h-12 rounded-2xl">Tedarikci ara</Button>
                      </div>
                      {supplierResults.length > 0 && (
                        <div className="flex max-h-32 flex-wrap gap-2 overflow-auto rounded-2xl bg-slate-50 p-3">
                          {supplierResults.map((supplier) => (
                            <button
                              key={supplier.code}
                              type="button"
                              onClick={() => {
                                updateForm({ supplierCode: supplier.code, supplierName: supplier.name });
                                setSupplierResults([]);
                                setSupplierSearch(`${supplier.code} ${supplier.name}`);
                              }}
                              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-amber-300"
                            >
                              {supplier.code} - {supplier.name}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <Input label="Tedarikci kodu" value={form.supplierCode} onChange={(e) => updateForm({ supplierCode: e.target.value })} />
                        <Input label="Tedarikci adi" value={form.supplierName} onChange={(e) => updateForm({ supplierName: e.target.value })} />
                        <Input label="Tedarikci urun kodu" value={form.supplierProductCode} onChange={(e) => updateForm({ supplierProductCode: e.target.value })} />
                        <SelectBox label="Kaynak" value={form.sourceType} onChange={(value) => updateForm({ sourceType: value })} options={['MANUAL', 'PRICE_LIST', 'QUOTE', 'INVOICE', 'PHONE', 'EMAIL']} />
                        <Input label="Maliyet T (KDV haric)" value={form.costT} onChange={(e) => updateMainCostT(e.target.value)} inputMode="decimal" />
                        <Input label="Maliyet P (yarim KDV otomatik)" value={form.costP} onChange={(e) => updateMainCostP(e.target.value)} inputMode="decimal" />
                        <SelectBox label="Para birimi" value={form.currency} onChange={(value) => updateForm({ currency: value })} options={['TRY', 'USD', 'EUR']} />
                        <Input label="Kur" value={form.exchangeRate} onChange={(e) => updateForm({ exchangeRate: e.target.value })} inputMode="decimal" disabled={form.currency === 'TRY'} />
                        <Input label="Birim" value={form.unit} onChange={(e) => updateForm({ unit: e.target.value })} />
                        <Input label="Birim katsayisi" value={form.unitFactor} onChange={(e) => updateForm({ unitFactor: e.target.value })} inputMode="decimal" />
                        <Input label="KDV %" value={form.vatRate} onChange={(e) => updateMainVatRate(e.target.value)} inputMode="decimal" />
                        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
                          <input type="checkbox" checked={form.vatIncluded} onChange={(e) => updateForm({ vatIncluded: e.target.checked })} />
                          Girilen fiyat KDV dahil
                        </label>
                        <Input label="Min. siparis miktari" value={form.minOrderQuantity} onChange={(e) => updateForm({ minOrderQuantity: e.target.value })} inputMode="decimal" />
                        <Input label="Teslim suresi gun" value={form.leadTimeDays} onChange={(e) => updateForm({ leadTimeDays: e.target.value })} inputMode="numeric" />
                        <Input label="Gecerlilik tarihi" type="date" value={form.validUntil} onChange={(e) => updateForm({ validUntil: e.target.value })} />
                        <Input label="Teklif tarihi" type="date" value={form.quoteDate} onChange={(e) => updateForm({ quoteDate: e.target.value })} />
                      </div>

                      <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
                        <label className="block">
                          <span className="mb-1 block text-sm font-medium text-gray-700">Not</span>
                          <textarea
                            value={form.note}
                            onChange={(e) => updateForm({ note: e.target.value })}
                            rows={4}
                            className="w-full rounded-2xl border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500"
                            placeholder="Telefon gorusmesi, teklif kosullari, iskonto notu..."
                          />
                        </label>
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
                          <p className="mb-2 text-sm font-black text-slate-800">Teklif dosyasi</p>
                          <label className="flex cursor-pointer items-center justify-center rounded-2xl bg-white px-4 py-5 text-sm font-bold text-slate-600 shadow-sm hover:bg-amber-50">
                            <UploadCloud className="mr-2 h-5 w-5" />
                            {uploading ? 'Yukleniyor...' : 'PDF/Excel/Gorsel yukle'}
                            <input type="file" className="hidden" onChange={(event) => uploadAttachment(event.target.files?.[0])} />
                          </label>
                          {form.attachmentUrl && (
                            <a href={form.attachmentUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-bold text-primary-700 hover:underline">
                              <FileUp className="mr-1 h-4 w-4" /> Ek dosyayi ac
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-3 rounded-[1.5rem] bg-slate-950 p-4 text-white md:grid-cols-3">
                        <MiniMetric label="Normalize Maliyet T" value={normalizedPreview ? money(normalizedPreview.costT) : '-'} />
                        <MiniMetric label="Normalize Maliyet P" value={normalizedPreview ? money(normalizedPreview.costP) : '-'} />
                        <MiniMetric label="Mevcut Mikro maliyet" value={money(selectedProduct.currentCost)} />
                      </div>

                      <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4">
                        <label className="flex items-start gap-3 text-sm font-black text-amber-950">
                          <input
                            type="checkbox"
                            checked={applyAfterSave}
                            onChange={(event) => setApplyAfterSave(event.target.checked)}
                            className="mt-1"
                          />
                          <span>
                            Kaydederken Mikro maliyetini de guncelle
                            <span className="block text-xs font-semibold text-amber-800">
                              Secilirse Maliyet T/P Ucarer Depo mantigiyla Mikroya yazilir.
                            </span>
                          </span>
                        </label>
                        <label className="mt-3 flex items-center gap-2 text-sm font-bold text-amber-900">
                          <input
                            type="checkbox"
                            checked={applyAfterSaveLists}
                            onChange={(event) => setApplyAfterSaveLists(event.target.checked)}
                            disabled={!applyAfterSave}
                          />
                          10 listeyi mevcut marjlara gore guncelle
                        </label>
                      </div>

                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="outline" onClick={() => { setManualCostPOverride(false); setForm({ ...emptyForm, productCode: selectedProduct.mikroCode, unit: selectedProduct.unit || '', vatRate: String(Number(selectedProduct.vatRate || 0) * 100) }); }}>
                          Temizle
                        </Button>
                        <Button onClick={saveCost} isLoading={saving} className="rounded-xl">
                          {applyAfterSave ? 'Kaydet ve Mikroya uygula' : editingCostId ? 'Guncelle' : 'Maliyet kaydet'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <CostTable costs={costs} onEdit={editCost} onArchive={archiveCost} onApply={(cost: any) => { setApplyTarget(cost); setApplyUpdateLists(true); }} applying={applying} />
                  <ApplicationHistory applications={applications} />
                </>
              ) : (
                <Card className="rounded-[2rem]">
                  <CardContent className="flex min-h-[360px] flex-col items-center justify-center text-center">
                    <Package className="mb-4 h-16 w-16 text-slate-300" />
                    <p className="text-lg font-black text-slate-900">Once urun secin</p>
                    <p className="mt-2 max-w-md text-sm text-slate-500">Urun secildikten sonra farkli firmalardan gelen maliyetleri girip gecmise atabilir ve istediginizi Mikroya uygulayabilirsiniz.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="space-y-6">
            <Card className="rounded-[2rem]">
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl">Maliyet raporlari</CardTitle>
                    <CardDescription>Firsat, risk, guncellik ve tedarik bagimliligi ayni veri havuzundan hesaplanir.</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={importMatches}>
                      <FileUp className="mr-2 h-4 w-4" /> Fiyat listelerinden aktar
                    </Button>
                    <Button onClick={loadReports}>
                      <RefreshCw className="mr-2 h-4 w-4" /> Raporu yenile
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-4">
                  <Input label="Arama" value={reportSearch} onChange={(e) => setReportSearch(e.target.value)} placeholder="Urun, tedarikci..." />
                  <Input label="Eski maliyet gun" value={String(staleDays)} onChange={(e) => setStaleDays(Number(e.target.value || 60))} inputMode="numeric" />
                  <Input label="Fark toleransi %" value={String(tolerancePercent)} onChange={(e) => setTolerancePercent(Number(e.target.value || 10))} inputMode="numeric" />
                  <Input label="Yuksek fark %" value={String(spreadPercent)} onChange={(e) => setSpreadPercent(Number(e.target.value || 15))} inputMode="numeric" />
                </div>
                {reports?.summary && (
                  <div className="mt-4 grid gap-3 md:grid-cols-4 xl:grid-cols-8">
                    {reportSections.map((section) => (
                      <MiniMetric key={section.key} label={section.title} value={reports.summary[section.key] || 0} light />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-5 xl:grid-cols-2">
              {reportSections.map((section) => (
                <ReportSection
                  key={section.key}
                  title={section.title}
                  icon={section.icon}
                  rows={reports?.sections?.[section.key] || []}
                  tone={section.tone}
                  onOpenProduct={(code: string) => {
                    setActiveTab('entry');
                    void loadProduct(code);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <Card className="rounded-[2rem]">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-xl">Maliyet gecmisi</CardTitle>
                  <CardDescription>Son girilen ve uygulanan tedarikci maliyetleri.</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} placeholder="Urun/tedarikci ara..." className="h-10 w-72 rounded-xl" />
                  <Button onClick={loadHistory} variant="outline">Ara</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <CostTable costs={historyRows} onEdit={(cost: any) => { setActiveTab('entry'); void loadProduct(cost.productCode).then(() => editCost(cost)); }} onArchive={archiveCost} onApply={(cost: any) => { setApplyTarget(cost); setApplyUpdateLists(true); }} applying={applying} />
            </CardContent>
          </Card>
        )}
      </div>

      {applyTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-2xl rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-950">Maliyeti Mikroya uygula</h2>
                <p className="mt-1 text-sm text-slate-500">{applyTarget.productCode} - {applyTarget.productName}</p>
              </div>
              <button onClick={() => setApplyTarget(null)} className="rounded-full bg-slate-100 p-2 hover:bg-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <MiniMetric label="Mevcut Mikro maliyet" value={money(applyTarget.currentCost)} light />
              <MiniMetric label="Yeni Maliyet T" value={money(applyTarget.normalizedCostT)} light />
              <MiniMetric label="Yeni Maliyet P" value={money(applyTarget.normalizedCostP)} light />
            </div>
            <label className="mt-4 flex items-center gap-2 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-900">
              <input type="checkbox" checked={applyUpdateLists} onChange={(event) => setApplyUpdateLists(event.target.checked)} />
              Liste 1-10 satis fiyatlarini mevcut marjlara gore guncelle
            </label>
            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Uygulama notu</span>
              <textarea value={applyNote} onChange={(e) => setApplyNote(e.target.value)} rows={3} className="w-full rounded-2xl border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setApplyTarget(null)}>Vazgec</Button>
              <Button onClick={applyCost} isLoading={applying === applyTarget.id}>Mikroya uygula</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SupplierCostDashboard({
  canManage,
  reports,
  onOpenRequests,
  onOpenTenders,
  onOpenEntry,
}: {
  canManage: boolean;
  reports: any;
  onOpenRequests: () => void;
  onOpenTenders: () => void;
  onOpenEntry: () => void;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Card className="overflow-hidden rounded-[2rem] border-0 bg-slate-950 text-white shadow-xl">
        <CardContent className="p-6 lg:p-8">
          <div className="max-w-3xl">
            <p className="text-sm font-black uppercase tracking-[0.3em] text-amber-300">Satin alma kontrol merkezi</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight lg:text-4xl">Fiyat teyidi, tedarik maliyeti ve ihale talepleri tek akista.</h2>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              Bekleyen talepleri fiyatlandir, gerekiyorsa satis onayina gonder, secilen maliyeti Ucarer Depo ile ayni Maliyet T/P ve 10 liste mantigiyla Mikroya uygula.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={onOpenRequests} className="rounded-2xl bg-amber-400 px-5 py-3 font-black text-slate-950 hover:bg-amber-300">
              Fiyat teyit talepleri
            </Button>
            <Button onClick={onOpenTenders} className="rounded-2xl bg-white px-5 py-3 font-black text-slate-950 hover:bg-slate-100">
              Ihale maliyet talepleri
            </Button>
            {canManage && (
              <Button onClick={onOpenEntry} className="rounded-2xl bg-emerald-500 px-5 py-3 font-black text-white hover:bg-emerald-400">
                Maliyet gir / uygula
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <MiniMetric label="Maliyet kaydi" value={reports?.summary?.costCount || 0} light />
        <MiniMetric label="Firsat" value={(reports?.summary?.currentAboveBest || 0) + (reports?.summary?.betterAfterApplied || 0)} light />
        <MiniMetric label="Riskli maliyet" value={(reports?.summary?.currentBelowSupplier || 0) + (reports?.summary?.expiredCosts || 0)} light />
        <MiniMetric label="Tek tedarikci" value={reports?.summary?.singleSupplier || 0} light />
      </div>

      <Card className="rounded-[2rem] xl:col-span-2">
        <CardHeader>
          <CardTitle className="text-xl">Yeni sade akis</CardTitle>
          <CardDescription>Bu ekranda operasyonu uc ana is uzerinden yurutun.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-5">
            <p className="text-lg font-black text-amber-950">1. Fiyat teyidi</p>
            <p className="mt-2 text-sm text-amber-800">Satis talep acar; satin alma fiyat girer, guncelse tek tikla satis tarafina bilgi verir veya satis onayina yollar.</p>
          </div>
          <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-lg font-black text-emerald-950">2. Maliyet uygulama</p>
            <p className="mt-2 text-sm text-emerald-800">Maliyet T/P ve 10 liste secimi Ucarer Depo ile ayni backend fiyat motoruna baglidir.</p>
          </div>
          <div className="rounded-[1.5rem] border border-sky-200 bg-sky-50 p-5">
            <p className="text-lg font-black text-sky-950">3. Ihale maliyeti</p>
            <p className="mt-2 text-sm text-sky-800">Ihale evraki, kalemler, termin, nakliye ve tedarikci teklifleri ihale bazinda takip edilir.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const emptyRequestForm = {
  type: 'EXISTING_PRODUCT',
  priority: 'NORMAL',
  productSearch: '',
  productCode: '',
  productName: '',
  unit: '',
  quantity: '',
  customerCode: '',
  customerName: '',
  salesNote: '',
  attachments: [],
  stockCreatePayload: {
    templateCode: 'B108423',
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
    currentCost: '0',
    mainUnit: 'ADET',
    mainUnitWeightKg: '',
    mainUnitWidthCm: '',
    mainUnitLengthCm: '',
    mainUnitHeightCm: '',
    margins: ['2', '1,5', '1,3', '1,2', '1,15'],
    barcode: '',
    notes: '',
    extraUnits: [],
  },
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

function PriceRequestsPanel({ canManage, initialRequestId }: { canManage: boolean; initialRequestId?: string | null }) {
  const { user } = useAuthStore();
  const [requests, setRequests] = useState<any[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [editableStockPayload, setEditableStockPayload] = useState<any | null>(null);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [requestSearch, setRequestSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [mineOnly, setMineOnly] = useState(!canManage);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [requestForm, setRequestForm] = useState<any>(emptyRequestForm);
  const [productResults, setProductResults] = useState<any[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [offerForm, setOfferForm] = useState<any>(emptyOfferForm);
  const [supplierResults, setSupplierResults] = useState<Array<{ code: string; name: string }>>([]);
  const [selectedOfferId, setSelectedOfferId] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [noteText, setNoteText] = useState('');
  const [savingAction, setSavingAction] = useState<string | null>(null);
  const [manualOfferCostPOverride, setManualOfferCostPOverride] = useState(false);
  const [uploadingRequestAttachment, setUploadingRequestAttachment] = useState(false);
  const [uploadingOfferAttachment, setUploadingOfferAttachment] = useState(false);
  const offerSupplierSearchRef = useRef<HTMLDivElement | null>(null);

  const requestVatPercent = (request: any) =>
    resolveVatPercent(request?.vatRatePercent ?? request?.vatRate ?? request?.stockCreatePayload?.vatRatePercent, 20);
  const offerDefaultsForRequest = (request: any) => ({
    ...emptyOfferForm,
    unit: request?.unit || request?.stockCreatePayload?.mainUnit || '',
    unitFactor: '1',
    vatRate: String(requestVatPercent(request)),
  });

  const selectRequest = (request: any) => {
    setSelectedRequest(request);
    setSelectedOfferId(request?.selectedOfferId || request?.bestOffer?.id || '');
    setEditableStockPayload(request?.stockCreatePayload ? { ...request.stockCreatePayload } : null);
    setOfferForm(offerDefaultsForRequest(request));
    setSupplierResults([]);
    setManualOfferCostPOverride(false);
  };

  const loadRequests = async () => {
    setLoading(true);
    try {
      const result = await adminApi.getPriceVerificationRequests({
        search: requestSearch || undefined,
        status: statusFilter,
        type: typeFilter,
        mine: mineOnly,
        page: 1,
        limit: 60,
      });
      setRequests(result.items || []);
      setSummary(result.summary || {});
      if (selectedRequest) {
        const fresh = (result.items || []).find((item: any) => item.id === selectedRequest.id);
        if (fresh) selectRequest(fresh);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Fiyat teyit talepleri alinamadi');
    } finally {
      setLoading(false);
    }
  };

  const loadRequestDetail = async (id: string) => {
    try {
      const result = await adminApi.getPriceVerificationRequest(id);
      selectRequest(result.request);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Talep detayi alinamadi');
    }
  };

  useEffect(() => {
    void loadRequests();
  }, [statusFilter, typeFilter, mineOnly]);

  useEffect(() => {
    if (initialRequestId) void loadRequestDetail(initialRequestId);
  }, [initialRequestId]);

  useEffect(() => {
    if (supplierResults.length === 0) return undefined;
    const closeOnOutside = (event: MouseEvent) => {
      if (!offerSupplierSearchRef.current?.contains(event.target as Node)) {
        setSupplierResults([]);
      }
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [supplierResults.length]);

  const updateRequestForm = (patch: any) => setRequestForm((current: any) => ({ ...current, ...patch }));
  const updateStockPayload = (patch: any) =>
    setRequestForm((current: any) => ({
      ...current,
      stockCreatePayload: { ...current.stockCreatePayload, ...patch },
    }));
  const updateMargin = (index: number, value: string) =>
    setRequestForm((current: any) => {
      const margins = [...(current.stockCreatePayload.margins || [])];
      margins[index] = value;
      return { ...current, stockCreatePayload: { ...current.stockCreatePayload, margins } };
    });
  const updateOfferForm = (patch: any) => setOfferForm((current: any) => ({ ...current, ...patch }));
  const uploadPriceAttachment = async (file: File | null | undefined, target: 'request' | 'offer') => {
    if (!file) return;
    target === 'request' ? setUploadingRequestAttachment(true) : setUploadingOfferAttachment(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const uploaded = await adminApi.uploadPriceVerificationAttachment(formData);
      const attachment = {
        url: uploaded.url || uploaded.attachmentUrl,
        name: uploaded.originalName || file.name,
        size: uploaded.size,
        type: uploaded.type || file.type || null,
      };
      if (target === 'request') {
        setRequestForm((current: any) => ({
          ...current,
          attachments: [...(current.attachments || []), attachment],
        }));
      } else {
        updateOfferForm({ attachmentUrl: attachment.url });
      }
      toast.success('Dosya eklendi');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Dosya yuklenemedi');
    } finally {
      target === 'request' ? setUploadingRequestAttachment(false) : setUploadingOfferAttachment(false);
    }
  };
  const updateOfferCostT = (value: string) => {
    setOfferForm((current: any) => {
      const patch: any = { costT: value };
      if (!manualOfferCostPOverride) {
        patch.costP = costPFromCostT(value, resolveVatPercent(current.vatRate || selectedRequest?.vatRatePercent || selectedRequest?.vatRate, 20));
      }
      return { ...current, ...patch };
    });
  };
  const updateOfferCostP = (value: string) => {
    setManualOfferCostPOverride(true);
    updateOfferForm({ costP: value });
  };
  const updateOfferVatRate = (value: string) => {
    setOfferForm((current: any) => {
      const patch: any = { vatRate: value };
      if (!manualOfferCostPOverride && current.costT) {
        patch.costP = costPFromCostT(current.costT, resolveVatPercent(value, 20));
      }
      return { ...current, ...patch };
    });
  };

  const searchProductsForRequest = async () => {
    if (!requestForm.productSearch.trim()) return toast.error('Urun aramasi girin');
    try {
      const result = await adminApi.searchPriceVerificationProducts({ search: requestForm.productSearch, limit: 25 });
      setProductResults(result.products || []);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Urun aramasi yapilamadi');
    }
  };

  const searchSuppliersForOffer = async () => {
    try {
      const result = await adminApi.searchPriceVerificationSuppliers({ search: offerForm.supplierSearch, limit: 30 });
      setSupplierResults(result.suppliers || []);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Tedarikci aramasi yapilamadi');
    }
  };

  const createRequest = async () => {
    setCreating(true);
    try {
      const isNewStock = requestForm.type === 'NEW_STOCK';
      const payload = {
        type: requestForm.type,
        priority: requestForm.priority,
        productCode: isNewStock ? undefined : requestForm.productCode,
        productName: isNewStock ? requestForm.stockCreatePayload.name : requestForm.productName,
        unit: isNewStock ? requestForm.stockCreatePayload.mainUnit : requestForm.unit,
        quantity: requestForm.quantity || undefined,
        customerId: requestForm.customerId || undefined,
        customerCode: requestForm.customerCode || undefined,
        customerName: requestForm.customerName || undefined,
        sourceType: 'SUPPLIER_COSTS',
        salesNote: requestForm.salesNote || undefined,
        attachments: requestForm.attachments || [],
        stockCreatePayload: isNewStock ? requestForm.stockCreatePayload : undefined,
      };
      const result = await adminApi.createPriceVerificationRequest(payload);
      toast.success('Fiyat teyit talebi olusturuldu');
      setRequestForm(emptyRequestForm);
      setCustomerSearch('');
      setProductResults([]);
      await loadRequests();
      selectRequest(result.request);
    } catch (error: any) {
      const details = error.response?.data?.details;
      toast.error(Array.isArray(details) && details.length ? details.join(', ') : (error.response?.data?.error || 'Talep olusturulamadi'));
    } finally {
      setCreating(false);
    }
  };

  const addOffer = async () => {
    if (!selectedRequest) return;
    const costT = parseNumberText(offerForm.costT);
    const costP = parseNumberText(offerForm.costP);
    if (!Number.isFinite(costT) || costT <= 0) return toast.error('Maliyet T zorunlu');
    if (!Number.isFinite(costP) || costP <= 0) return toast.error('Maliyet P zorunlu');
    setSavingAction('offer');
    try {
      const result = await adminApi.addPriceVerificationOffer(selectedRequest.id, {
        ...offerForm,
        costP,
        costT,
        exchangeRate: offerForm.currency === 'TRY' ? undefined : parseNumberText(offerForm.exchangeRate),
        vatRate: offerForm.vatRate ? parseNumberText(offerForm.vatRate) : undefined,
        unitFactor: parseNumberText(offerForm.unitFactor) || 1,
        minOrderQuantity: offerForm.minOrderQuantity ? parseNumberText(offerForm.minOrderQuantity) : undefined,
        leadTimeDays: offerForm.leadTimeDays ? parseNumberText(offerForm.leadTimeDays) : undefined,
        applyToSystem: Boolean(offerForm.applyToSystem),
        updatePriceLists: offerForm.updatePriceLists !== false,
      });
      toast.success('Fiyat alternatifi eklendi');
      setOfferForm(offerDefaultsForRequest(selectedRequest));
      setSupplierResults([]);
      selectRequest(result.request);
      await loadRequests();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Fiyat eklenemedi');
    } finally {
      setSavingAction(null);
    }
  };

  const submitToSales = async () => {
    if (!selectedRequest) return;
    setSavingAction('submit');
    try {
      const result = await adminApi.submitPriceVerificationToSales(selectedRequest.id, { note: actionNote || undefined });
      toast.success('Talep satis onayina gonderildi');
      selectRequest(result.request);
      setActionNote('');
      await loadRequests();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Talep gonderilemedi');
    } finally {
      setSavingAction(null);
    }
  };

  const decide = async (approved: boolean) => {
    if (!selectedRequest) return;
    setSavingAction(approved ? 'approve' : 'reject');
    try {
      const result = await adminApi.decidePriceVerification(selectedRequest.id, {
        approved,
        selectedOfferId: approved ? selectedOfferId : undefined,
        note: actionNote || undefined,
      });
      toast.success(approved ? 'Fiyat secimi onaylandi' : 'Talep reddedildi');
      selectRequest(result.request);
      setActionNote('');
      await loadRequests();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Karar kaydedilemedi');
    } finally {
      setSavingAction(null);
    }
  };

  const complete = async () => {
    if (!selectedRequest) return;
    setSavingAction('complete');
    try {
      const result = await adminApi.completePriceVerification(selectedRequest.id, {
        updatePriceLists: true,
        note: actionNote || undefined,
        stockCreatePayload: selectedRequest.type === 'NEW_STOCK' ? editableStockPayload : undefined,
      });
      toast.success('Talep tamamlandi ve Mikroya uygulandi');
      selectRequest(result.request);
      setActionNote('');
      await loadRequests();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Talep tamamlanamadi');
    } finally {
      setSavingAction(null);
    }
  };

  const markCurrent = async () => {
    if (!selectedRequest || !window.confirm('Fiyat guncel diye satis tarafina bilgi gonderilsin mi? Mikroda maliyet veya tarih degismeyecek.')) return;
    setSavingAction('current');
    try {
      const result = await adminApi.markPriceVerificationCurrent(selectedRequest.id, { note: actionNote || undefined });
      toast.success('Fiyat guncel bilgisi satis tarafina gonderildi');
      selectRequest(result.request);
      setActionNote('');
      await loadRequests();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Guncel teyidi yapilamadi');
    } finally {
      setSavingAction(null);
    }
  };

  const cancel = async () => {
    if (!selectedRequest || !window.confirm('Talep iptal edilsin mi?')) return;
    setSavingAction('cancel');
    try {
      const result = await adminApi.cancelPriceVerification(selectedRequest.id, { note: actionNote || undefined });
      toast.success('Talep iptal edildi');
      selectRequest(result.request);
      setActionNote('');
      await loadRequests();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Talep iptal edilemedi');
    } finally {
      setSavingAction(null);
    }
  };

  const addNote = async () => {
    if (!selectedRequest || !noteText.trim()) return;
    try {
      await adminApi.addPriceVerificationNote(selectedRequest.id, { body: noteText.trim() });
      setNoteText('');
      await loadRequestDetail(selectedRequest.id);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Not eklenemedi');
    }
  };

  const canSalesDecide =
    Boolean(selectedRequest)
    && selectedRequest.status === 'SENT_TO_SALES'
    && selectedRequest.createdById === user?.id;
  const sourceLabel = selectedRequest ? getPriceRequestSourceLabel(selectedRequest) : '-';
  const requestedQuantityText = selectedRequest
    ? `${selectedRequest.quantity || '-'}${selectedRequest.unit ? ` ${selectedRequest.unit}` : ''}`
    : '-';
  const updateEditableStockPayload = (patch: any) => {
    setEditableStockPayload((current: any) => ({ ...(current || {}), ...patch }));
  };
  const updateEditableMargin = (index: number, value: string) => {
    setEditableStockPayload((current: any) => {
      const next = { ...(current || {}) };
      const margins = [...(next.margins || ['', '', '', '', ''])];
      margins[index] = value;
      return { ...next, margins };
    });
  };
  const panelGridClass = canManage
    ? 'grid gap-6 2xl:grid-cols-[minmax(640px,0.95fr)_minmax(0,1.35fr)]'
    : 'grid gap-6 2xl:grid-cols-[minmax(520px,0.85fr)_minmax(0,1.25fr)]';

  return (
    <div className={panelGridClass}>
      <div className="space-y-6">
        {!canManage && (
        <Card className="rounded-[2rem]">
          <CardHeader>
            <CardTitle className="text-xl">Fiyat teyit talebi olustur</CardTitle>
            <CardDescription>Stoklu urun icin fiyat guncelligi sor veya yeni stok icin elindeki bilgilerle satin almaya talep ac. Eksikler satin alma tarafinda tamamlanabilir.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectBox label="Talep tipi" value={requestForm.type} onChange={(value) => updateRequestForm({ type: value })} options={['EXISTING_PRODUCT', 'NEW_STOCK']} />
              <SelectBox label="Oncelik" value={requestForm.priority} onChange={(value) => updateRequestForm({ priority: value })} options={['LOW', 'NORMAL', 'HIGH', 'URGENT']} />
            </div>

            {requestForm.type === 'EXISTING_PRODUCT' ? (
              <div className="space-y-3 rounded-2xl bg-slate-50 p-3">
                <div className="flex gap-2">
                  <Input
                    value={requestForm.productSearch}
                    onChange={(event) => updateRequestForm({ productSearch: event.target.value })}
                    onKeyDown={(event) => event.key === 'Enter' && searchProductsForRequest()}
                    placeholder="Stok kodu veya urun adi"
                    className="h-11 rounded-xl"
                  />
                  <Button onClick={searchProductsForRequest} variant="secondary" className="h-11 rounded-xl">
                    <Search className="mr-2 h-4 w-4" /> Ara
                  </Button>
                </div>
                {productResults.length > 0 && (
                  <div className="max-h-56 space-y-2 overflow-auto">
                    {productResults.map((product) => (
                      <button
                        type="button"
                        key={product.mikroCode}
                        onClick={() => {
                          updateRequestForm({
                            productCode: product.mikroCode,
                            productName: product.name,
                            unit: product.unit,
                            productSearch: `${product.mikroCode} ${product.name}`,
                          });
                          setProductResults([]);
                        }}
                        className="flex w-full gap-3 rounded-xl border border-slate-200 bg-white p-2 text-left hover:border-amber-300"
                      >
                        <ProductThumb product={product} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-900">{product.name}</p>
                          <p className="text-xs text-slate-500">{product.mikroCode} | Maliyet: {money(product.currentCost)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {requestForm.productCode && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
                    <p className="font-black text-emerald-900">{requestForm.productCode}</p>
                    <p className="text-emerald-800">{requestForm.productName}</p>
                  </div>
                )}
              </div>
            ) : (
              <NewStockRequestFields payload={requestForm.stockCreatePayload} updatePayload={updateStockPayload} updateMargin={updateMargin} />
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Miktar / hedef adet" value={requestForm.quantity} onChange={(e) => updateRequestForm({ quantity: e.target.value })} inputMode="decimal" />
              <CustomerLookupInput
                label="Cari ara"
                value={customerSearch}
                onChange={(value) => {
                  setCustomerSearch(value);
                  updateRequestForm({ customerCode: value });
                }}
                onSelect={(customer) => {
                  setCustomerSearch(`${customer.code || customer.mikroCariCode} ${customer.title || customer.name || ''}`.trim());
                  updateRequestForm({
                    customerId: customer.id,
                    customerCode: customer.code || customer.mikroCariCode,
                    customerName: customer.title || customer.displayName || customer.mikroName || customer.name,
                  });
                }}
              />
              <Input label="Cari kodu" value={requestForm.customerCode} onChange={(e) => updateRequestForm({ customerCode: e.target.value })} />
              <Input label="Cari adi" value={requestForm.customerName} onChange={(e) => updateRequestForm({ customerName: e.target.value })} />
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Satis notu</span>
              <textarea
                value={requestForm.salesNote}
                onChange={(e) => updateRequestForm({ salesNote: e.target.value })}
                rows={3}
                className="w-full rounded-2xl border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Musteri hedef fiyati, aciliyet, marka alternatifi..."
              />
            </label>
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
              <p className="mb-2 text-sm font-black text-slate-800">Talep ekleri</p>
              <label className="flex cursor-pointer items-center justify-center rounded-2xl bg-white px-4 py-4 text-sm font-bold text-slate-600 shadow-sm hover:bg-amber-50">
                <UploadCloud className="mr-2 h-5 w-5" />
                {uploadingRequestAttachment ? 'Yukleniyor...' : 'PDF / Excel / gorsel ekle'}
                <input type="file" className="hidden" onChange={(event) => uploadPriceAttachment(event.target.files?.[0], 'request')} />
              </label>
              {(requestForm.attachments || []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(requestForm.attachments || []).map((attachment: any, index: number) => (
                    <a key={`${attachment.url}-${index}`} href={attachment.url} target="_blank" rel="noreferrer" className="rounded-full bg-white px-3 py-1 text-xs font-bold text-primary-700">
                      {attachment.name || `Ek ${index + 1}`}
                    </a>
                  ))}
                </div>
              )}
            </div>
            <Button onClick={createRequest} isLoading={creating} className="w-full rounded-2xl">
              <Plus className="mr-2 h-4 w-4" /> Talep olustur
            </Button>
          </CardContent>
        </Card>
        )}

        <Card className="rounded-[2rem] border-0 shadow-xl">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-xl">Fiyat teyit talepleri</CardTitle>
                <CardDescription>{canManage ? 'Satin alma icin bekleyen ve tamamlanan tum talepler.' : 'Sadece sizin actiginiz talepler.'}</CardDescription>
              </div>
              {canManage && <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">Talep olusturma satis tarafinda</span>}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-3">
              <div className="grid gap-2">
                <Input value={requestSearch} onChange={(e) => setRequestSearch(e.target.value)} placeholder="Talep no, urun, cari veya not ara..." className="h-11 rounded-xl bg-white" />
                <div className="grid gap-2 sm:grid-cols-3">
                <SelectBox label="Durum" value={statusFilter} onChange={setStatusFilter} options={['ALL', 'REQUESTED', 'IN_REVIEW', 'SENT_TO_SALES', 'SALES_APPROVED', 'SALES_REJECTED', 'COMPLETED', 'CANCELLED']} />
                <SelectBox label="Tip" value={typeFilter} onChange={setTypeFilter} options={['ALL', 'EXISTING_PRODUCT', 'NEW_STOCK']} />
                {canManage && (
                  <label className="mt-6 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
                    <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
                    Sadece benimkiler
                  </label>
                )}
                </div>
                <Button variant="outline" onClick={loadRequests} isLoading={loading} className="h-10 rounded-xl">Ara / Yenile</Button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <MiniMetric label="Bekleyen" value={(summary.REQUESTED || 0) + (summary.IN_REVIEW || 0)} light />
              <MiniMetric label="Satis onayi" value={summary.SENT_TO_SALES || 0} light />
              <MiniMetric label="Tamamlanan" value={summary.COMPLETED || 0} light />
            </div>
            <div className={cn('space-y-3 overflow-auto pr-1', canManage ? 'max-h-[760px]' : 'max-h-[620px]')}>
              {requests.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-500">Talep yok.</p>
              ) : requests.map((request) => (
                <PriceRequestListCard
                  key={request.id}
                  request={request}
                  selected={selectedRequest?.id === request.id}
                  onSelect={() => selectRequest(request)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        {!selectedRequest ? (
          <Card className="rounded-[2rem]">
            <CardContent className="flex min-h-[420px] flex-col items-center justify-center text-center">
              <MessageSquare className="mb-4 h-16 w-16 text-slate-300" />
              <p className="text-lg font-black text-slate-900">Talep secin</p>
              <p className="mt-2 max-w-md text-sm text-slate-500">Fiyat alternatifleri, satis onayi, notlar ve Mikro uygulama adimlari burada takip edilir.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="overflow-hidden rounded-[2rem]">
              <CardHeader className="bg-slate-950 text-white">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-2xl">{selectedRequest.requestNo}</CardTitle>
                    <CardDescription className="text-slate-300">{selectedRequest.productCode || 'Yeni stok'} - {selectedRequest.productName}</CardDescription>
                  </div>
                  <StatusPill status={selectedRequest.status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-5">
                <div className="grid gap-3 md:grid-cols-4">
                  <MiniMetric label="Tip" value={selectedRequest.type === 'NEW_STOCK' ? 'Yeni stok' : 'Stoklu urun'} light />
                  <MiniMetric label="Oncelik" value={selectedRequest.priority} light />
                  <MiniMetric label="Talep eden" value={selectedRequest.createdByName || '-'} light />
                  <MiniMetric label="Tarih" value={dateText(selectedRequest.createdAt)} light />
                  <MiniMetric label="Cari" value={selectedRequest.customerName || selectedRequest.customerCode || '-'} light />
                  <MiniMetric label="Talep miktari" value={requestedQuantityText} light />
                  <MiniMetric label="Kaynak" value={sourceLabel} light />
                  <MiniMetric label="Satirdaki fiyat" value={selectedRequest.currentUnitPrice ? money(selectedRequest.currentUnitPrice) : '-'} light />
                  <MiniMetric label="Mevcut maliyet" value={money(selectedRequest.currentCost)} light />
                  <MiniMetric label="En iyi teklif" value={selectedRequest.bestOffer ? money(selectedRequest.bestOffer.normalizedCostP) : '-'} light />
                </div>
                {selectedRequest.salesNote && <p className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700"><b>Satis notu:</b> {selectedRequest.salesNote}</p>}
                {selectedRequest.procurementNote && <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900"><b>Satin alma notu:</b> {selectedRequest.procurementNote}</p>}
                {selectedRequest.salesDecisionNote && <p className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-900"><b>Satis karar notu:</b> {selectedRequest.salesDecisionNote}</p>}
                {(selectedRequest.attachments || []).length > 0 && (
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                    <p className="mb-2 text-sm font-black text-slate-900">Talep ekleri</p>
                    <div className="flex flex-wrap gap-2">
                      {(selectedRequest.attachments || []).map((attachment: any, index: number) => (
                        <a key={`${attachment.url}-${index}`} href={attachment.url} target="_blank" rel="noreferrer" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-primary-700 hover:bg-amber-50">
                          {attachment.name || `Ek ${index + 1}`}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {selectedRequest.type === 'NEW_STOCK' && canManage && (
                  <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4">
                    <div className="mb-3">
                      <p className="text-sm font-black text-amber-950">Yeni stok kart bilgilerini tamamla</p>
                      <p className="text-xs text-amber-800">Satis talebi eksik gelebilir; Mikroda stok acmadan once bu alanlari burada tamamlayin.</p>
                    </div>
                    <NewStockRequestFields
                      payload={editableStockPayload || {}}
                      updatePayload={updateEditableStockPayload}
                      updateMargin={updateEditableMargin}
                    />
                  </div>
                )}
                {selectedRequest.type === 'NEW_STOCK' && !canManage && selectedRequest.stockCreatePayload && (
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                    <p className="mb-3 text-sm font-black text-slate-900">Yeni stok kart bilgileri</p>
                    <div className="grid gap-2 text-xs md:grid-cols-3">
                      <InfoLine label="Sablon" value={selectedRequest.stockCreatePayload.templateCode} />
                      <InfoLine label="Ana birim" value={selectedRequest.stockCreatePayload.mainUnit} />
                      <InfoLine label="KDV" value={`%${selectedRequest.stockCreatePayload.vatRatePercent || 20}`} />
                      <InfoLine label="Ana saglayici" value={selectedRequest.stockCreatePayload.supplierCode} />
                      <InfoLine label="Marka" value={`${selectedRequest.stockCreatePayload.brandCode || '-'} ${selectedRequest.stockCreatePayload.brandName || ''}`} />
                      <InfoLine label="Kategori" value={selectedRequest.stockCreatePayload.categoryCode} />
                      <InfoLine label="Ambalaj" value={`${selectedRequest.stockCreatePayload.packageCode || '-'} ${selectedRequest.stockCreatePayload.packageName || ''}`} />
                      <InfoLine label="Raf" value={selectedRequest.stockCreatePayload.shelfCode || '-'} />
                      <InfoLine label="Marjlar" value={(selectedRequest.stockCreatePayload.margins || []).join(' / ')} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-[2rem]">
              <CardHeader>
                <CardTitle className="text-xl">Fiyat alternatifleri</CardTitle>
                <CardDescription>Satis kullanicisi kendi talebindeki girilen fiyatlari burada gorur ve secer.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[780px] text-sm">
                    <thead>
                      <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-3">Sec</th>
                        <th className="px-3 py-3">Tedarikci</th>
                        <th className="px-3 py-3">Giris T/P</th>
                        <th className="px-3 py-3">Normalize T/P</th>
                        <th className="px-3 py-3">Kosullar</th>
                        <th className="px-3 py-3">Tarih</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedRequest.offers || []).length === 0 ? (
                        <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Henuz fiyat girilmedi.</td></tr>
                      ) : selectedRequest.offers.map((offer: any) => (
                        <tr key={offer.id} className={cn('border-b hover:bg-slate-50', selectedOfferId === offer.id && 'bg-emerald-50')}>
                          <td className="px-3 py-3">
                            <input type="radio" checked={selectedOfferId === offer.id} onChange={() => setSelectedOfferId(offer.id)} disabled={!canSalesDecide && !canManage} />
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-black text-slate-900">{offer.supplierName}</p>
                            <p className="text-xs text-slate-500">{offer.supplierCode || '-'} {offer.supplierProductCode ? `| ${offer.supplierProductCode}` : ''}</p>
                            {offer.attachmentUrl && (
                              <a href={offer.attachmentUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex text-xs font-bold text-primary-700 hover:underline">
                                Teklif dosyasi
                              </a>
                            )}
                          </td>
                          <td className="px-3 py-3">{money(offer.costT)} / {money(offer.costP)}<p className="text-xs text-slate-500">{offer.currency} {offer.vatIncluded ? 'KDV dahil' : 'Net'}</p></td>
                          <td className="px-3 py-3 font-black text-emerald-700">{money(offer.normalizedCostT)} / {money(offer.normalizedCostP)}</td>
                          <td className="px-3 py-3 text-xs text-slate-600">Min: {offer.minOrderQuantity || '-'} | Teslim: {offer.leadTimeDays ? `${offer.leadTimeDays} gun` : '-'}</td>
                          <td className="px-3 py-3 text-xs text-slate-500">{dateText(offer.quoteDate || offer.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {canManage && selectedRequest.availableActions?.canAddOffer && (
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                    <h3 className="mb-3 font-black text-slate-900">Satin alma fiyat girisi</h3>
                    <div ref={offerSupplierSearchRef} className="relative">
                    <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                      <Input value={offerForm.supplierSearch} onChange={(event) => updateOfferForm({ supplierSearch: event.target.value })} placeholder="Tedarikci kodu veya adi ara..." />
                      <Button variant="secondary" onClick={searchSuppliersForOffer}>Tedarikci ara</Button>
                    </div>
                    {supplierResults.length > 0 && (
                      <div className="mt-3 flex max-h-32 flex-wrap gap-2 overflow-auto rounded-2xl bg-white p-3">
                        {supplierResults.map((supplier) => (
                          <button
                            key={supplier.code}
                            type="button"
                            onClick={() => {
                              updateOfferForm({ supplierCode: supplier.code, supplierName: supplier.name, supplierSearch: `${supplier.code} ${supplier.name}` });
                              setSupplierResults([]);
                            }}
                            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-amber-300"
                          >
                            {supplier.code} - {supplier.name}
                          </button>
                        ))}
                      </div>
                    )}
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <SupplierLookupInput
                        label="Tedarikci kodu"
                        value={offerForm.supplierCode}
                        onChange={(value) => updateOfferForm({ supplierCode: value })}
                        onSelect={(supplier) => updateOfferForm({
                          supplierCode: supplier.code,
                          supplierName: supplier.name,
                          supplierSearch: `${supplier.code} ${supplier.name}`,
                        })}
                      />
                      <Input label="Tedarikci adi" value={offerForm.supplierName} onChange={(e) => updateOfferForm({ supplierName: e.target.value })} />
                      <Input label="Tedarikci urun kodu" value={offerForm.supplierProductCode} onChange={(e) => updateOfferForm({ supplierProductCode: e.target.value })} />
                      <Input label="Maliyet T (KDV haric)" value={offerForm.costT} onChange={(e) => updateOfferCostT(e.target.value)} inputMode="decimal" />
                      <Input label="Maliyet P (yarim KDV otomatik)" value={offerForm.costP} onChange={(e) => updateOfferCostP(e.target.value)} inputMode="decimal" />
                      <SelectBox label="Para birimi" value={offerForm.currency} onChange={(value) => updateOfferForm({ currency: value })} options={['TRY', 'USD', 'EUR']} />
                      <Input label="Kur" value={offerForm.exchangeRate} onChange={(e) => updateOfferForm({ exchangeRate: e.target.value })} inputMode="decimal" disabled={offerForm.currency === 'TRY'} />
                      <Input label="Birim" value={offerForm.unit} onChange={(e) => updateOfferForm({ unit: e.target.value })} />
                      <Input label="Birim katsayisi" value={offerForm.unitFactor} onChange={(e) => updateOfferForm({ unitFactor: e.target.value })} inputMode="decimal" />
                      <Input label="KDV %" value={offerForm.vatRate} onChange={(e) => updateOfferVatRate(e.target.value)} inputMode="decimal" />
                      <Input label="Min siparis" value={offerForm.minOrderQuantity} onChange={(e) => updateOfferForm({ minOrderQuantity: e.target.value })} inputMode="decimal" />
                      <Input label="Teslim gun" value={offerForm.leadTimeDays} onChange={(e) => updateOfferForm({ leadTimeDays: e.target.value })} inputMode="numeric" />
                      <Input label="Gecerlilik" type="date" value={offerForm.validUntil} onChange={(e) => updateOfferForm({ validUntil: e.target.value })} />
                      <Input label="Teklif tarihi" type="date" value={offerForm.quoteDate} onChange={(e) => updateOfferForm({ quoteDate: e.target.value })} />
                      <label className="mt-6 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
                        <input type="checkbox" checked={offerForm.vatIncluded} onChange={(e) => updateOfferForm({ vatIncluded: e.target.checked })} />
                        KDV dahil
                      </label>
                    </div>
                    <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr]">
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4">
                        <p className="mb-2 text-sm font-black text-slate-800">Tedarikci teklif dosyasi</p>
                        <label className="flex cursor-pointer items-center justify-center rounded-2xl bg-slate-50 px-4 py-4 text-sm font-bold text-slate-600 hover:bg-amber-50">
                          <UploadCloud className="mr-2 h-5 w-5" />
                          {uploadingOfferAttachment ? 'Yukleniyor...' : 'PDF / Excel / gorsel yukle'}
                          <input type="file" className="hidden" onChange={(event) => uploadPriceAttachment(event.target.files?.[0], 'offer')} />
                        </label>
                        {offerForm.attachmentUrl && (
                          <a href={offerForm.attachmentUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-bold text-primary-700 hover:underline">
                            Ek dosyayi ac
                          </a>
                        )}
                      </div>
                      {selectedRequest.type === 'EXISTING_PRODUCT' && (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                          <label className="flex items-start gap-3 text-sm font-black text-emerald-950">
                            <input
                              type="checkbox"
                              checked={Boolean(offerForm.applyToSystem)}
                              onChange={(event) => updateOfferForm({ applyToSystem: event.target.checked })}
                              className="mt-1"
                            />
                            <span>
                              Fiyati eklerken Mikro maliyetini de guncelle
                              <span className="block text-xs font-semibold text-emerald-800">
                                Maliyet T/P Ucarer Depo ile ayni fiyat motoruna yazilir.
                              </span>
                            </span>
                          </label>
                          <label className="mt-3 flex items-center gap-2 text-sm font-bold text-emerald-900">
                            <input
                              type="checkbox"
                              checked={offerForm.updatePriceLists !== false}
                              onChange={(event) => updateOfferForm({ updatePriceLists: event.target.checked })}
                              disabled={!offerForm.applyToSystem}
                            />
                            10 listeyi mevcut marjlara gore guncelle
                          </label>
                        </div>
                      )}
                    </div>
                    <textarea value={offerForm.note} onChange={(e) => updateOfferForm({ note: e.target.value })} rows={2} className="mt-3 w-full rounded-2xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500" placeholder="Fiyat notu..." />
                    <div className="mt-3 flex justify-end">
                      <Button onClick={addOffer} isLoading={savingAction === 'offer'}>
                        {offerForm.applyToSystem ? 'Fiyat ekle ve Mikroya uygula' : 'Fiyat ekle'}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-[2rem]">
              <CardHeader>
                <CardTitle className="text-xl">Aksiyonlar ve notlar</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <textarea value={actionNote} onChange={(e) => setActionNote(e.target.value)} rows={2} className="w-full rounded-2xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500" placeholder="Aksiyon notu..." />
                <div className="flex flex-wrap gap-2">
                  {canManage && selectedRequest.type === 'EXISTING_PRODUCT' && !['COMPLETED', 'CANCELLED'].includes(selectedRequest.status) && (
                    <Button variant="secondary" onClick={markCurrent} isLoading={savingAction === 'current'}>
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Fiyat guncel, satisi bilgilendir
                    </Button>
                  )}
                  {canManage && selectedRequest.availableActions?.canSendToSales && (
                    <Button onClick={submitToSales} isLoading={savingAction === 'submit'}>
                      <Send className="mr-2 h-4 w-4" /> Satis onayina gonder
                    </Button>
                  )}
                  {canSalesDecide && (
                    <>
                      <Button onClick={() => decide(true)} isLoading={savingAction === 'approve'} disabled={!selectedOfferId}>
                        <CheckCircle2 className="mr-2 h-4 w-4" /> Secili fiyati onayla
                      </Button>
                      <Button variant="danger" onClick={() => decide(false)} isLoading={savingAction === 'reject'}>
                        <Ban className="mr-2 h-4 w-4" /> Reddet
                      </Button>
                    </>
                  )}
                  {canManage && selectedRequest.availableActions?.canComplete && (
                    <Button onClick={complete} isLoading={savingAction === 'complete'}>
                      Mikroya uygula ve tamamla
                    </Button>
                  )}
                  {selectedRequest.availableActions?.canCancel && (
                    <Button variant="outline" onClick={cancel} isLoading={savingAction === 'cancel'}>Iptal et</Button>
                  )}
                </div>

                <div className="rounded-[1.5rem] bg-slate-50 p-4">
                  <div className="flex gap-2">
                    <Input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Talep notu ekle..." />
                    <Button variant="secondary" onClick={addNote}>Not ekle</Button>
                  </div>
                  <div className="mt-4 max-h-72 space-y-2 overflow-auto">
                    {(selectedRequest.notes || []).length === 0 ? (
                      <p className="text-sm text-slate-500">Not yok.</p>
                    ) : selectedRequest.notes.map((note: any) => (
                      <div key={note.id} className="rounded-2xl border border-slate-200 bg-white p-3 text-sm">
                        <div className="flex flex-wrap justify-between gap-2">
                          <p className="font-black text-slate-900">{note.authorName || 'Sistem'}</p>
                          <p className="text-xs text-slate-500">{dateText(note.createdAt)}</p>
                        </div>
                        <p className="mt-1 text-slate-700">{note.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function PriceRequestListCard({ request, selected, onSelect }: { request: any; selected: boolean; onSelect: () => void }) {
  const isNewStock = request.type === 'NEW_STOCK';
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-[1.5rem] border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50/70 hover:shadow-md',
        selected ? 'border-amber-400 bg-amber-50 shadow-md' : 'border-slate-200 bg-white'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-xs font-black text-slate-500">{request.requestNo}</p>
            <span className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-black',
              isNewStock ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-800'
            )}>
              {isNewStock ? 'Yeni stok' : 'Stoklu'}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{request.priority}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm font-black text-slate-950">
            {request.productCode || 'Yeni stok'} - {request.productName}
          </p>
          <p className="mt-1 truncate text-xs font-semibold text-slate-500">
            {request.customerName || request.customerCode || 'Cari yok'} | Talep eden: {request.createdByName || '-'}
          </p>
        </div>
        <StatusPill status={request.status} />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <MiniMetric label="Miktar" value={request.quantity || '-'} light />
        <MiniMetric label="Mevcut maliyet" value={money(request.currentCost)} light />
        <MiniMetric label="En iyi teklif" value={request.bestOffer ? money(request.bestOffer.normalizedCostP) : '-'} light />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
        <span>{dateText(request.createdAt)}</span>
        {request.sourceType && <span>Kaynak: {getPriceRequestSourceLabel(request)}</span>}
        {(request.attachments || []).length > 0 && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-700">Ek: {(request.attachments || []).length}</span>}
      </div>
    </button>
  );
}

const emptyTenderForm = {
  title: '',
  priority: 'NORMAL',
  customerCode: '',
  customerName: '',
  deadline: '',
  deliveryLocation: '',
  salesNote: '',
  attachments: [],
  items: [
    { productSearch: '', productCode: '', productName: '', unit: '', quantity: '', targetPrice: '', note: '', attachments: [] },
  ],
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

function TenderRequestsPanel({ canManage }: { canManage: boolean }) {
  const [requests, setRequests] = useState<any[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [mineOnly, setMineOnly] = useState(!canManage);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<any>(emptyTenderForm);
  const [offerForms, setOfferForms] = useState<Record<string, any>>({});
  const [supplierResultsByItem, setSupplierResultsByItem] = useState<Record<string, Array<{ code: string; name: string }>>>({});
  const [productResultsByItemIndex, setProductResultsByItemIndex] = useState<Record<number, any[]>>({});
  const [savingAction, setSavingAction] = useState<string | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  const updateForm = (patch: any) => setForm((current: any) => ({ ...current, ...patch }));
  const updateItem = (index: number, patch: any) => {
    setForm((current: any) => {
      const items = [...(current.items || [])];
      items[index] = { ...items[index], ...patch };
      return { ...current, items };
    });
  };
  const addItem = () => setForm((current: any) => ({
    ...current,
    items: [...(current.items || []), { productSearch: '', productCode: '', productName: '', unit: '', quantity: '', targetPrice: '', note: '', attachments: [] }],
  }));
  const removeItem = (index: number) => {
    setForm((current: any) => ({
      ...current,
      items: (current.items || []).filter((_: any, itemIndex: number) => itemIndex !== index),
    }));
  };

  const loadRequests = async () => {
    setLoading(true);
    try {
      const result = await adminApi.getTenderCostRequests({
        search: search || undefined,
        status: statusFilter,
        mine: mineOnly,
        page: 1,
        limit: 60,
      });
      setRequests(result.items || []);
      setSummary(result.summary || {});
      if (selectedRequest) {
        const fresh = (result.items || []).find((item: any) => item.id === selectedRequest.id);
        if (fresh) setSelectedRequest(fresh);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ihale talepleri alinamadi');
    } finally {
      setLoading(false);
    }
  };

  const loadRequestDetail = async (id: string) => {
    try {
      const result = await adminApi.getTenderCostRequest(id);
      setSelectedRequest(result.request);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ihale detayi alinamadi');
    }
  };

  useEffect(() => {
    void loadRequests();
  }, [statusFilter, mineOnly]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const tenderId = new URLSearchParams(window.location.search).get('tenderId');
    if (tenderId) void loadRequestDetail(tenderId);
  }, []);

  useEffect(() => {
    const hasSupplierResults = Object.values(supplierResultsByItem).some((items) => items.length > 0);
    const hasProductResults = Object.values(productResultsByItemIndex).some((items) => items.length > 0);
    if (!hasSupplierResults && !hasProductResults) return undefined;
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('[data-tender-supplier-search]') || target?.closest('[data-tender-product-search]')) return;
      setSupplierResultsByItem({});
      setProductResultsByItemIndex({});
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [supplierResultsByItem, productResultsByItemIndex]);

  const uploadTenderAttachment = async (file: File | null | undefined, target: { type: 'request' | 'item' | 'offer'; index?: number; itemId?: string }) => {
    if (!file) return;
    const key = `${target.type}-${target.index ?? target.itemId ?? 'main'}`;
    setUploadingKey(key);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const uploaded = await adminApi.uploadPriceVerificationAttachment(formData);
      const attachment = {
        url: uploaded.url || uploaded.attachmentUrl,
        name: uploaded.originalName || file.name,
        size: uploaded.size,
        type: uploaded.type || file.type || null,
      };
      if (target.type === 'request') {
        setForm((current: any) => ({ ...current, attachments: [...(current.attachments || []), attachment] }));
      } else if (target.type === 'item' && typeof target.index === 'number') {
        setForm((current: any) => {
          const items = [...(current.items || [])];
          items[target.index as number] = {
            ...items[target.index as number],
            attachments: [...(items[target.index as number]?.attachments || []), attachment],
          };
          return { ...current, items };
        });
      } else if (target.type === 'offer' && target.itemId) {
        setOfferForms((current) => ({
          ...current,
          [target.itemId as string]: { ...(current[target.itemId as string] || emptyTenderOfferForm), attachmentUrl: attachment.url },
        }));
      }
      toast.success('Dosya eklendi');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Dosya yuklenemedi');
    } finally {
      setUploadingKey(null);
    }
  };

  const createTender = async () => {
    if (!form.title.trim()) return toast.error('Ihale adi zorunlu');
    setCreating(true);
    try {
      const payload = {
        ...form,
        items: (form.items || []).map((item: any) => ({
          ...item,
          quantity: item.quantity ? parseNumberText(item.quantity) : undefined,
          targetPrice: item.targetPrice ? parseNumberText(item.targetPrice) : undefined,
        })),
      };
      const result = await adminApi.createTenderCostRequest(payload);
      toast.success('Ihale maliyet talebi olusturuldu');
      setForm(emptyTenderForm);
      await loadRequests();
      setSelectedRequest(result.request);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ihale talebi olusturulamadi');
    } finally {
      setCreating(false);
    }
  };

  const updateOfferForm = (itemId: string, patch: any) => {
    setOfferForms((current) => ({
      ...current,
      [itemId]: { ...(current[itemId] || emptyTenderOfferForm), ...patch },
    }));
  };
  const updateOfferCostT = (itemId: string, value: string) => {
    setOfferForms((current) => {
      const currentForm = current[itemId] || emptyTenderOfferForm;
      return {
        ...current,
        [itemId]: {
          ...currentForm,
          costT: value,
          costP: currentForm.costP ? currentForm.costP : costPFromCostT(value, resolveVatPercent(currentForm.vatRate, 20)),
        },
      };
    });
  };

  const searchSuppliers = async (itemId: string) => {
    const itemForm = offerForms[itemId] || emptyTenderOfferForm;
    try {
      const result = await adminApi.searchPriceVerificationSuppliers({ search: itemForm.supplierSearch, limit: 25 });
      setSupplierResultsByItem((current) => ({ ...current, [itemId]: result.suppliers || [] }));
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Tedarikci aramasi yapilamadi');
    }
  };

  const searchTenderProducts = async (index: number) => {
    const item = (form.items || [])[index] || {};
    const term = String(item.productSearch || item.productCode || item.productName || '').trim();
    if (term.length < 2) return toast.error('Stok kodu veya urun adi girin');
    try {
      const result = await adminApi.searchPriceVerificationProducts({ search: term, limit: 20 });
      setProductResultsByItemIndex((current) => ({ ...current, [index]: result.products || [] }));
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Urun aramasi yapilamadi');
    }
  };

  const addOffer = async (item: any) => {
    if (!selectedRequest) return;
    const itemForm = offerForms[item.id] || emptyTenderOfferForm;
    const costT = parseNumberText(itemForm.costT);
    const costP = parseNumberText(itemForm.costP);
    if (!Number.isFinite(costT) || costT <= 0) return toast.error('Maliyet T zorunlu');
    if (!Number.isFinite(costP) || costP <= 0) return toast.error('Maliyet P zorunlu');
    setSavingAction(`offer-${item.id}`);
    try {
      const result = await adminApi.addTenderCostOffer(selectedRequest.id, item.id, {
        ...itemForm,
        costP,
        costT,
        freightCost: itemForm.freightCost ? parseNumberText(itemForm.freightCost) : undefined,
        exchangeRate: itemForm.currency === 'TRY' ? undefined : parseNumberText(itemForm.exchangeRate),
        vatRate: itemForm.vatRate ? parseNumberText(itemForm.vatRate) : undefined,
        unitFactor: parseNumberText(itemForm.unitFactor) || 1,
        leadTimeDays: itemForm.leadTimeDays ? parseNumberText(itemForm.leadTimeDays) : undefined,
      });
      toast.success('Ihale kalemine fiyat eklendi');
      setOfferForms((current) => ({ ...current, [item.id]: emptyTenderOfferForm }));
      setSupplierResultsByItem((current) => ({ ...current, [item.id]: [] }));
      setSelectedRequest(result.request);
      await loadRequests();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ihale fiyati eklenemedi');
    } finally {
      setSavingAction(null);
    }
  };

  const completeTender = async () => {
    if (!selectedRequest) return;
    setSavingAction('complete');
    try {
      const result = await adminApi.completeTenderCostRequest(selectedRequest.id, { note: noteText || undefined });
      toast.success('Ihale talebi tamamlandi');
      setNoteText('');
      setSelectedRequest(result.request);
      await loadRequests();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ihale tamamlanamadi');
    } finally {
      setSavingAction(null);
    }
  };

  const cancelTender = async () => {
    if (!selectedRequest || !window.confirm('Ihale maliyet talebi iptal edilsin mi?')) return;
    setSavingAction('cancel');
    try {
      const result = await adminApi.cancelTenderCostRequest(selectedRequest.id, { note: noteText || undefined });
      toast.success('Ihale talebi iptal edildi');
      setNoteText('');
      setSelectedRequest(result.request);
      await loadRequests();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ihale iptal edilemedi');
    } finally {
      setSavingAction(null);
    }
  };

  const addNote = async () => {
    if (!selectedRequest || !noteText.trim()) return;
    try {
      await adminApi.addTenderCostNote(selectedRequest.id, { body: noteText.trim() });
      setNoteText('');
      await loadRequestDetail(selectedRequest.id);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Not eklenemedi');
    }
  };
  const panelGridClass = canManage
    ? 'grid gap-6 2xl:grid-cols-[minmax(640px,0.95fr)_minmax(0,1.35fr)]'
    : 'grid gap-6 2xl:grid-cols-[minmax(540px,0.85fr)_minmax(0,1.25fr)]';

  return (
    <div className={panelGridClass}>
      <div className="space-y-6">
        {!canManage && (
        <Card className="rounded-[2rem]">
          <CardHeader>
            <CardTitle className="text-xl">Yeni ihale maliyet talebi</CardTitle>
            <CardDescription>Ihale evragi, gorsel, Excel ve kalemleri tek talepte toplayin.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input label="Ihale adi" value={form.title} onChange={(e) => updateForm({ title: e.target.value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectBox label="Oncelik" value={form.priority} onChange={(value) => updateForm({ priority: value })} options={['LOW', 'NORMAL', 'HIGH', 'URGENT']} />
              <Input label="Son teklif tarihi" type="date" value={form.deadline} onChange={(e) => updateForm({ deadline: e.target.value })} />
              <Input label="Cari kodu" value={form.customerCode} onChange={(e) => updateForm({ customerCode: e.target.value })} />
              <Input label="Cari adi" value={form.customerName} onChange={(e) => updateForm({ customerName: e.target.value })} />
            </div>
            <Input label="Teslim yeri / lokasyon" value={form.deliveryLocation} onChange={(e) => updateForm({ deliveryLocation: e.target.value })} />
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Talep notu</span>
              <textarea value={form.salesNote} onChange={(e) => updateForm({ salesNote: e.target.value })} rows={3} className="w-full rounded-2xl border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500" />
            </label>
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
              <label className="flex cursor-pointer items-center justify-center rounded-2xl bg-white px-4 py-4 text-sm font-bold text-slate-600 shadow-sm hover:bg-sky-50">
                <UploadCloud className="mr-2 h-5 w-5" />
                {uploadingKey === 'request-main' ? 'Yukleniyor...' : 'Ihale evraki / gorsel ekle'}
                <input type="file" className="hidden" onChange={(event) => uploadTenderAttachment(event.target.files?.[0], { type: 'request' })} />
              </label>
              {(form.attachments || []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(form.attachments || []).map((attachment: any, index: number) => (
                    <a key={`${attachment.url}-${index}`} href={attachment.url} target="_blank" rel="noreferrer" className="rounded-full bg-white px-3 py-1 text-xs font-bold text-primary-700">{attachment.name || `Ek ${index + 1}`}</a>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-slate-900">Ihale kalemleri</p>
                <Button variant="outline" size="sm" onClick={addItem}>Kalem ekle</Button>
              </div>
              {(form.items || []).map((item: any, index: number) => (
                <div key={index} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div data-tender-product-search className="relative mb-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3">
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <Input
                        label="Mevcut stok ara"
                        value={item.productSearch || ''}
                        onChange={(e) => updateItem(index, { productSearch: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && searchTenderProducts(index)}
                        placeholder="Stok kodu veya urun adi ile ara, yoksa alttan manuel gir"
                        className="bg-white"
                      />
                      <Button variant="secondary" onClick={() => searchTenderProducts(index)} className="mt-6">Stok ara</Button>
                    </div>
                    {(productResultsByItemIndex[index] || []).length > 0 && (
                      <div className="absolute left-3 right-3 top-full z-30 mt-2 max-h-72 overflow-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
                        {(productResultsByItemIndex[index] || []).map((product: any) => (
                          <button
                            key={product.mikroCode || product.code}
                            type="button"
                            onClick={() => {
                              updateItem(index, {
                                productSearch: `${product.mikroCode || product.code} ${product.name || ''}`.trim(),
                                productCode: product.mikroCode || product.code || '',
                                productName: product.name || '',
                                unit: product.mainUnit || product.unit || '',
                              });
                              setProductResultsByItemIndex((current) => ({ ...current, [index]: [] }));
                            }}
                            className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-sky-50"
                          >
                            <ProductThumb product={product} />
                            <div className="min-w-0">
                              <p className="font-mono text-xs font-black text-slate-500">{product.mikroCode || product.code}</p>
                              <p className="line-clamp-2 text-sm font-black text-slate-900">{product.name}</p>
                              <p className="text-xs text-slate-500">{product.category?.name || product.brandCode || product.mainUnit || '-'}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input label="Stok kodu" value={item.productCode} onChange={(e) => updateItem(index, { productCode: e.target.value })} />
                    <Input label="Urun / kalem adi" value={item.productName} onChange={(e) => updateItem(index, { productName: e.target.value })} />
                    <Input label="Birim" value={item.unit} onChange={(e) => updateItem(index, { unit: e.target.value })} />
                    <Input label="Miktar" value={item.quantity} onChange={(e) => updateItem(index, { quantity: e.target.value })} inputMode="decimal" />
                    <Input label="Hedef fiyat" value={item.targetPrice} onChange={(e) => updateItem(index, { targetPrice: e.target.value })} inputMode="decimal" />
                    <Input label="Not" value={item.note} onChange={(e) => updateItem(index, { note: e.target.value })} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label className="cursor-pointer rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-200">
                      {uploadingKey === `item-${index}` ? 'Yukleniyor...' : 'Kaleme ek dosya'}
                      <input type="file" className="hidden" onChange={(event) => uploadTenderAttachment(event.target.files?.[0], { type: 'item', index })} />
                    </label>
                    {index > 0 && <button type="button" onClick={() => removeItem(index)} className="text-xs font-bold text-rose-600">Kalemi sil</button>}
                    {(item.attachments || []).map((attachment: any, attachmentIndex: number) => (
                      <a key={`${attachment.url}-${attachmentIndex}`} href={attachment.url} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary-700">{attachment.name || `Ek ${attachmentIndex + 1}`}</a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <Button onClick={createTender} isLoading={creating} className="w-full rounded-2xl">
              <Plus className="mr-2 h-4 w-4" /> Ihale talebi olustur
            </Button>
          </CardContent>
        </Card>
        )}

        <Card className="rounded-[2rem] border-0 shadow-xl">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-xl">Ihale maliyet talepleri</CardTitle>
                <CardDescription>{canManage ? 'Satin alma icin bekleyen ihale maliyet talepleri.' : 'Sadece sizin actiginiz ihale talepleri.'}</CardDescription>
              </div>
              {canManage && <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">Talep olusturma satis tarafinda</span>}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-3">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ihale, cari, urun veya stok ara..." className="h-11 rounded-xl bg-white" />
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <SelectBox label="Durum" value={statusFilter} onChange={setStatusFilter} options={['ALL', 'REQUESTED', 'IN_REVIEW', 'COMPLETED', 'CANCELLED']} />
              {canManage && (
                <label className="mt-6 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
                  <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
                  Sadece benimkiler
                </label>
              )}
            </div>
            <Button variant="outline" onClick={loadRequests} isLoading={loading} className="mt-2 h-10 rounded-xl">Ara / Yenile</Button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <MiniMetric label="Bekleyen" value={(summary.REQUESTED || 0) + (summary.IN_REVIEW || 0)} light />
              <MiniMetric label="Tamamlanan" value={summary.COMPLETED || 0} light />
              <MiniMetric label="Iptal" value={summary.CANCELLED || 0} light />
            </div>
            <div className={cn('space-y-3 overflow-auto pr-1', canManage ? 'max-h-[760px]' : 'max-h-[620px]')}>
              {requests.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-500">Ihale talebi yok.</p>
              ) : requests.map((request) => (
                <TenderRequestListCard
                  key={request.id}
                  request={request}
                  selected={selectedRequest?.id === request.id}
                  onSelect={() => setSelectedRequest(request)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        {!selectedRequest ? (
          <Card className="rounded-[2rem]">
            <CardContent className="flex min-h-[520px] flex-col items-center justify-center text-center">
              <FileUp className="mb-4 h-16 w-16 text-slate-300" />
              <p className="text-lg font-black text-slate-900">Ihale talebi secin</p>
              <p className="mt-2 max-w-md text-sm text-slate-500">Evraklar, kalemler, termin, nakliye ve tedarikci fiyatlari burada takip edilir.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="overflow-hidden rounded-[2rem]">
              <CardHeader className="bg-slate-950 text-white">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-2xl">{selectedRequest.requestNo}</CardTitle>
                    <CardDescription className="text-slate-300">{selectedRequest.title}</CardDescription>
                  </div>
                  <StatusPill status={selectedRequest.status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-5">
                <div className="grid gap-3 md:grid-cols-4">
                  <MiniMetric label="Cari" value={selectedRequest.customerName || selectedRequest.customerCode || '-'} light />
                  <MiniMetric label="Son teklif" value={dateText(selectedRequest.deadline)} light />
                  <MiniMetric label="Kalem" value={selectedRequest.itemCount || 0} light />
                  <MiniMetric label="En iyi toplam" value={selectedRequest.bestTotal ? money(selectedRequest.bestTotal) : '-'} light />
                </div>
                {selectedRequest.salesNote && <p className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700"><b>Talep notu:</b> {selectedRequest.salesNote}</p>}
                {(selectedRequest.attachments || []).length > 0 && (
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                    <p className="mb-2 text-sm font-black text-slate-900">Ihale evraklari</p>
                    <div className="flex flex-wrap gap-2">
                      {(selectedRequest.attachments || []).map((attachment: any, index: number) => (
                        <a key={`${attachment.url}-${index}`} href={attachment.url} target="_blank" rel="noreferrer" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-primary-700 hover:bg-sky-50">{attachment.name || `Ek ${index + 1}`}</a>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {(selectedRequest.items || []).map((item: any) => {
              const itemForm = offerForms[item.id] || emptyTenderOfferForm;
              const supplierResults = supplierResultsByItem[item.id] || [];
              return (
                <Card key={item.id} className="rounded-[2rem]">
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-xl">#{item.lineNo} {item.productName}</CardTitle>
                        <CardDescription>{item.productCode || 'Stok disi'} | {item.quantity || '-'} {item.unit || ''} | Hedef: {item.targetPrice ? money(item.targetPrice) : '-'}</CardDescription>
                      </div>
                      {item.bestOffer && <MiniMetric label="En iyi toplam birim" value={money(item.bestOffer.totalUnitCostP)} light />}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(item.attachments || []).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {(item.attachments || []).map((attachment: any, index: number) => (
                          <a key={`${attachment.url}-${index}`} href={attachment.url} target="_blank" rel="noreferrer" className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-primary-700">{attachment.name || `Kalem eki ${index + 1}`}</a>
                        ))}
                      </div>
                    )}
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] text-sm">
                        <thead>
                          <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                            <th className="px-3 py-3">Tedarikci</th>
                            <th className="px-3 py-3">Maliyet T/P</th>
                            <th className="px-3 py-3">Nakliye</th>
                            <th className="px-3 py-3">Toplam</th>
                            <th className="px-3 py-3">Termin</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(item.offers || []).length === 0 ? (
                            <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Bu kaleme henuz fiyat girilmedi.</td></tr>
                          ) : item.offers.map((offer: any) => (
                            <tr key={offer.id} className="border-b hover:bg-slate-50">
                              <td className="px-3 py-3">
                                <p className="font-black text-slate-900">{offer.supplierName}</p>
                                <p className="text-xs text-slate-500">{offer.supplierCode || '-'}</p>
                                {offer.attachmentUrl && <a href={offer.attachmentUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary-700">Dosya</a>}
                              </td>
                              <td className="px-3 py-3">{money(offer.normalizedCostT)} / {money(offer.normalizedCostP)}</td>
                              <td className="px-3 py-3">{offer.freightCost ? money(offer.freightCost) : '-'}</td>
                              <td className="px-3 py-3 font-black text-emerald-700">{money(offer.totalUnitCostP)}<p className="text-xs text-slate-500">Satir: {offer.totalLineCostP ? money(offer.totalLineCostP) : '-'}</p></td>
                              <td className="px-3 py-3">{offer.leadTimeDays ? `${offer.leadTimeDays} gun` : '-'}<p className="text-xs text-slate-500">{dateText(offer.quoteDate || offer.createdAt)}</p></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {canManage && !['COMPLETED', 'CANCELLED'].includes(selectedRequest.status) && (
                      <div className="rounded-[1.5rem] border border-sky-200 bg-sky-50 p-4">
                        <p className="mb-3 text-sm font-black text-sky-950">Bu kaleme satin alma fiyati gir</p>
                        <div data-tender-supplier-search className="relative">
                          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                            <Input value={itemForm.supplierSearch} onChange={(event) => updateOfferForm(item.id, { supplierSearch: event.target.value })} placeholder="Tedarikci kodu veya adi ara..." />
                            <Button variant="secondary" onClick={() => searchSuppliers(item.id)}>Tedarikci ara</Button>
                          </div>
                          {supplierResults.length > 0 && (
                            <div className="mt-3 flex max-h-32 flex-wrap gap-2 overflow-auto rounded-2xl bg-white p-3">
                              {supplierResults.map((supplier) => (
                                <button
                                  key={supplier.code}
                                  type="button"
                                  onClick={() => {
                                    updateOfferForm(item.id, { supplierCode: supplier.code, supplierName: supplier.name, supplierSearch: `${supplier.code} ${supplier.name}` });
                                    setSupplierResultsByItem((current) => ({ ...current, [item.id]: [] }));
                                  }}
                                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-sky-300"
                                >
                                  {supplier.code} - {supplier.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <Input label="Tedarikci kodu" value={itemForm.supplierCode} onChange={(e) => updateOfferForm(item.id, { supplierCode: e.target.value })} />
                          <Input label="Tedarikci adi" value={itemForm.supplierName} onChange={(e) => updateOfferForm(item.id, { supplierName: e.target.value })} />
                          <Input label="Maliyet T" value={itemForm.costT} onChange={(e) => updateOfferCostT(item.id, e.target.value)} inputMode="decimal" />
                          <Input label="Maliyet P" value={itemForm.costP} onChange={(e) => updateOfferForm(item.id, { costP: e.target.value })} inputMode="decimal" />
                          <Input label="Nakliye maliyeti" value={itemForm.freightCost} onChange={(e) => updateOfferForm(item.id, { freightCost: e.target.value })} inputMode="decimal" />
                          <Input label="Termin gun" value={itemForm.leadTimeDays} onChange={(e) => updateOfferForm(item.id, { leadTimeDays: e.target.value })} inputMode="numeric" />
                          <SelectBox label="Para birimi" value={itemForm.currency} onChange={(value) => updateOfferForm(item.id, { currency: value })} options={['TRY', 'USD', 'EUR']} />
                          <Input label="Kur" value={itemForm.exchangeRate} onChange={(e) => updateOfferForm(item.id, { exchangeRate: e.target.value })} inputMode="decimal" disabled={itemForm.currency === 'TRY'} />
                          <Input label="Birim" value={itemForm.unit} onChange={(e) => updateOfferForm(item.id, { unit: e.target.value })} />
                          <Input label="Birim katsayisi" value={itemForm.unitFactor} onChange={(e) => updateOfferForm(item.id, { unitFactor: e.target.value })} inputMode="decimal" />
                          <Input label="KDV %" value={itemForm.vatRate} onChange={(e) => updateOfferForm(item.id, { vatRate: e.target.value })} inputMode="decimal" />
                          <Input label="Gecerlilik" type="date" value={itemForm.validUntil} onChange={(e) => updateOfferForm(item.id, { validUntil: e.target.value })} />
                        </div>
                        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
                          <Input label="Not" value={itemForm.note} onChange={(e) => updateOfferForm(item.id, { note: e.target.value })} />
                          <label className="mt-6 flex cursor-pointer items-center justify-center rounded-2xl bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm hover:bg-sky-100">
                            {uploadingKey === `offer-${item.id}` ? 'Yukleniyor...' : 'Teklif dosyasi'}
                            <input type="file" className="hidden" onChange={(event) => uploadTenderAttachment(event.target.files?.[0], { type: 'offer', itemId: item.id })} />
                          </label>
                        </div>
                        {itemForm.attachmentUrl && <a href={itemForm.attachmentUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-bold text-primary-700">Ek dosyayi ac</a>}
                        <div className="mt-3 flex justify-end">
                          <Button onClick={() => addOffer(item)} isLoading={savingAction === `offer-${item.id}`}>Fiyat ekle</Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            <Card className="rounded-[2rem]">
              <CardHeader>
                <CardTitle className="text-xl">Aksiyonlar ve notlar</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={2} className="w-full rounded-2xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500" placeholder="Ihale notu..." />
                <div className="flex flex-wrap gap-2">
                  {canManage && !['COMPLETED', 'CANCELLED'].includes(selectedRequest.status) && (
                    <Button onClick={completeTender} isLoading={savingAction === 'complete'}>Tamamla</Button>
                  )}
                  {!['COMPLETED', 'CANCELLED'].includes(selectedRequest.status) && (
                    <Button variant="outline" onClick={cancelTender} isLoading={savingAction === 'cancel'}>Iptal et</Button>
                  )}
                  <Button variant="secondary" onClick={addNote}>Not ekle</Button>
                </div>
                <div className="max-h-72 space-y-2 overflow-auto rounded-[1.5rem] bg-slate-50 p-4">
                  {(selectedRequest.notes || []).length === 0 ? (
                    <p className="text-sm text-slate-500">Not yok.</p>
                  ) : selectedRequest.notes.map((note: any) => (
                    <div key={note.id} className="rounded-2xl border border-slate-200 bg-white p-3 text-sm">
                      <div className="flex flex-wrap justify-between gap-2">
                        <p className="font-black text-slate-900">{note.authorName || 'Sistem'}</p>
                        <p className="text-xs text-slate-500">{dateText(note.createdAt)}</p>
                      </div>
                      <p className="mt-1 text-slate-700">{note.body}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function TenderRequestListCard({ request, selected, onSelect }: { request: any; selected: boolean; onSelect: () => void }) {
  const itemCount = Number(request.itemCount || request.items?.length || 0);
  const unpricedLines = Number(request.unpricedLines || 0);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-[1.5rem] border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50/70 hover:shadow-md',
        selected ? 'border-sky-400 bg-sky-50 shadow-md' : 'border-slate-200 bg-white'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-xs font-black text-slate-500">{request.requestNo}</p>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{request.priority || 'NORMAL'}</span>
            {request.deadline && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-700">Son: {dateText(request.deadline)}</span>}
          </div>
          <p className="mt-1 line-clamp-2 text-sm font-black text-slate-950">{request.title || 'Ihale talebi'}</p>
          <p className="mt-1 truncate text-xs font-semibold text-slate-500">
            {request.customerName || request.customerCode || 'Cari yok'} | Talep eden: {request.createdByName || '-'}
          </p>
        </div>
        <StatusPill status={request.status} />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <MiniMetric label="Kalem" value={itemCount} light />
        <MiniMetric label="Fiyatsiz" value={unpricedLines} light />
        <MiniMetric label="En iyi toplam" value={request.bestTotal ? money(request.bestTotal) : '-'} light />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
        <span>{dateText(request.createdAt)}</span>
        {(request.attachments || []).length > 0 && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-700">Ana ek: {(request.attachments || []).length}</span>}
        {unpricedLines > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">Fiyat bekliyor</span>}
      </div>
    </button>
  );
}

type LookupItem = { code: string; name: string };

function NewStockRequestFields({
  payload,
  updatePayload,
  updateMargin,
}: {
  payload: any;
  updatePayload: (patch: any) => void;
  updateMargin: (index: number, value: string) => void;
}) {
  return (
    <div className="space-y-4 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <SimpleLookupInput label="Sablon stok" type="template" value={payload.templateCode} onSelect={(item) => updatePayload({ templateCode: item.code })} onChange={(value) => updatePayload({ templateCode: value })} />
        <Input label="Stok adi" value={payload.name} onChange={(e) => updatePayload({ name: e.target.value })} />
        <Input label="Tedarikci urun kodu" value={payload.foreignName} onChange={(e) => updatePayload({ foreignName: e.target.value })} />
        <Input label="Ana birim" value={payload.mainUnit} onChange={(e) => updatePayload({ mainUnit: e.target.value })} />
        <Input label="KDV %" value={payload.vatRatePercent} onChange={(e) => updatePayload({ vatRatePercent: e.target.value })} inputMode="decimal" />
        <SimpleLookupInput label="Ana saglayici" type="supplier" value={payload.supplierCode} onSelect={(item) => updatePayload({ supplierCode: item.code })} onChange={(value) => updatePayload({ supplierCode: value })} />
        <SimpleLookupInput label="Marka kodu" type="brand" value={payload.brandCode} onSelect={(item) => updatePayload({ brandCode: item.code, brandName: item.name })} onChange={(value) => updatePayload({ brandCode: value })} />
        <Input label="Yeni marka adi" value={payload.brandName} onChange={(e) => updatePayload({ brandName: e.target.value })} />
        <SimpleLookupInput label="Kategori" type="category" value={payload.categoryCode} onSelect={(item) => updatePayload({ categoryCode: item.code })} onChange={(value) => updatePayload({ categoryCode: value })} />
        <SimpleLookupInput label="Ambalaj kodu" type="package" value={payload.packageCode} onSelect={(item) => updatePayload({ packageCode: item.code, packageName: item.name })} onChange={(value) => updatePayload({ packageCode: value })} />
        <Input label="Yeni ambalaj adi" value={payload.packageName} onChange={(e) => updatePayload({ packageName: e.target.value })} />
        <Input label="Raf / reyon kodu" value={payload.shelfCode} onChange={(e) => updatePayload({ shelfCode: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-5">
        {[0, 1, 2, 3, 4].map((index) => (
          <Input key={index} label={`Marj ${index + 1}`} value={payload.margins?.[index] || ''} onChange={(e) => updateMargin(index, e.target.value)} inputMode="decimal" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Input label="Kg" value={payload.mainUnitWeightKg} onChange={(e) => updatePayload({ mainUnitWeightKg: e.target.value })} inputMode="decimal" />
        <Input label="En cm" value={payload.mainUnitWidthCm} onChange={(e) => updatePayload({ mainUnitWidthCm: e.target.value })} inputMode="decimal" />
        <Input label="Boy cm" value={payload.mainUnitLengthCm} onChange={(e) => updatePayload({ mainUnitLengthCm: e.target.value })} inputMode="decimal" />
        <Input label="Yukseklik cm" value={payload.mainUnitHeightCm} onChange={(e) => updatePayload({ mainUnitHeightCm: e.target.value })} inputMode="decimal" />
      </div>
    </div>
  );
}

function SimpleLookupInput({
  label,
  type,
  value,
  onChange,
  onSelect,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (item: LookupItem) => void;
}) {
  const [search, setSearch] = useState(value || '');
  const [items, setItems] = useState<LookupItem[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSearch(value || '');
  }, [value]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [open]);

  const runSearch = async () => {
    try {
      const result = await adminApi.searchPriceVerificationStockLookups(type, { search, limit: 20 });
      setItems(result.items || []);
      setOpen(true);
    } catch {
      setItems([]);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <Input
        label={label}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          onChange(e.target.value);
        }}
        onFocus={() => runSearch()}
        onKeyDown={(e) => e.key === 'Enter' && runSearch()}
      />
      <button type="button" onClick={runSearch} className="absolute right-2 top-8 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600 hover:bg-slate-200">
        Ara
      </button>
      {open && items.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {items.map((item) => (
            <button
              key={`${type}-${item.code}`}
              type="button"
              onClick={() => {
                setSearch(item.code);
                onSelect(item);
                setOpen(false);
              }}
              className="w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-amber-50"
            >
              <span className="font-black text-slate-900">{item.code}</span> <span className="text-slate-500">{item.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomerLookupInput({
  label,
  value,
  onChange,
  onSelect,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (customer: any) => void;
}) {
  const [search, setSearch] = useState(value || '');
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSearch(value || '');
  }, [value]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [open]);

  const runSearch = async () => {
    const term = search.trim();
    if (term.length < 2) {
      setItems([]);
      setOpen(false);
      return;
    }
    try {
      const result = await adminApi.searchPriceVerificationCustomers({ search: term, limit: 25 });
      setItems(result.customers || []);
      setOpen(true);
    } catch {
      setItems([]);
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <Input
        label={label}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          onChange(e.target.value);
        }}
        onFocus={() => runSearch()}
        onKeyDown={(e) => e.key === 'Enter' && runSearch()}
        placeholder="Cari kodu veya unvan ara..."
      />
      <button type="button" onClick={runSearch} className="absolute right-2 top-8 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600 hover:bg-slate-200">
        Ara
      </button>
      {open && items.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {items.map((customer) => (
            <button
              key={customer.id || customer.code}
              type="button"
              onClick={() => {
                onSelect(customer);
                setOpen(false);
              }}
              className="w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-amber-50"
            >
              <span className="font-black text-slate-900">{customer.code || customer.mikroCariCode}</span>{' '}
              <span className="text-slate-600">{customer.title || customer.displayName || customer.mikroName || customer.name}</span>
              {(customer.city || customer.district) && <span className="block text-[11px] text-slate-400">{customer.city || '-'} / {customer.district || '-'}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SupplierLookupInput({
  label,
  value,
  onChange,
  onSelect,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (supplier: LookupItem) => void;
}) {
  const [search, setSearch] = useState(value || '');
  const [items, setItems] = useState<LookupItem[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSearch(value || '');
  }, [value]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [open]);

  const runSearch = async () => {
    try {
      const result = await adminApi.searchPriceVerificationSuppliers({ search, limit: 25 });
      setItems(result.suppliers || []);
      setOpen(true);
    } catch {
      setItems([]);
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <Input
        label={label}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          onChange(e.target.value);
        }}
        onFocus={() => runSearch()}
        onKeyDown={(e) => e.key === 'Enter' && runSearch()}
      />
      <button type="button" onClick={runSearch} className="absolute right-2 top-8 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600 hover:bg-slate-200">
        Ara
      </button>
      {open && items.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {items.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() => {
                onSelect(item);
                setOpen(false);
              }}
              className="w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-amber-50"
            >
              <span className="font-black text-slate-900">{item.code}</span> <span className="text-slate-500">{item.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
    status === 'CANCELLED' || status === 'SALES_REJECTED' ? 'bg-red-100 text-red-800' :
    status === 'SENT_TO_SALES' || status === 'SALES_APPROVED' ? 'bg-blue-100 text-blue-800' :
    'bg-amber-100 text-amber-800';
  const labelMap: Record<string, string> = {
    REQUESTED: 'Talep',
    IN_REVIEW: 'Incelemede',
    SENT_TO_SALES: 'Satis onayi',
    SALES_APPROVED: 'Satis onayladi',
    SALES_REJECTED: 'Satis reddetti',
    COMPLETED: 'Tamamlandi',
    CANCELLED: 'Iptal',
  };
  return <span className={cn('rounded-full px-2.5 py-1 text-xs font-black', tone)}>{labelMap[status] || status}</span>;
}

function getPriceRequestSourceLabel(request: any) {
  const type = String(request?.sourceType || '').toUpperCase();
  const ref = request?.sourceRef && !['QUOTE_DRAFT', 'ORDER_DRAFT'].includes(request.sourceRef) ? ` (${request.sourceRef})` : '';
  if (type === 'QUOTE') return `Tekliften geldi${ref}`;
  if (type === 'ORDER') return `Siparisten geldi${ref}`;
  if (type === 'FIELD_SALES') return `Saha satistan geldi${ref}`;
  if (type === 'SUPPLIER_COSTS') return 'Tedarik maliyetlerinden';
  return type || '-';
}

function ProductSummary({ product, metrics }: { product: any; metrics: any }) {
  const stocks = product?.warehouseStocks || {};
  return (
    <Card className="overflow-hidden rounded-[2rem]">
      <CardContent className="p-0">
        <div className="grid gap-0 lg:grid-cols-[220px_1fr]">
          <div className="flex items-center justify-center bg-slate-100 p-6">
            <ProductThumb product={product} large />
          </div>
          <div className="space-y-4 p-6">
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-amber-600">{product.mikroCode}</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">{product.name}</h2>
              <p className="mt-1 text-sm text-slate-500">{product.category?.name || '-'} | {product.brandCode || '-'}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <MiniMetric label="Guncel maliyet" value={money(product.currentCost)} light />
              <MiniMetric label="Maliyet tarihi" value={dateText(product.currentCostDate)} light />
              <MiniMetric label="En iyi tedarik" value={money(metrics?.bestCost)} light />
              <MiniMetric label="Tedarikci sayisi" value={metrics?.supplierCount || 0} light />
              <MiniMetric label="Son giris" value={money(product.lastEntryPrice)} light />
              <MiniMetric label="Son giris tarihi" value={dateText(product.lastEntryDate)} light />
              <MiniMetric label="Ana saglayici" value={product.mainSupplier?.name || product.mainSupplier?.code || '-'} light />
              <MiniMetric label="Stok" value={`M:${stocks.MERKEZ ?? stocks['1'] ?? '-'} T:${stocks.TOPCA ?? stocks['6'] ?? '-'}`} light />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CostTable({ costs, onEdit, onArchive, onApply, applying }: any) {
  return (
    <Card className="rounded-[2rem]">
      <CardHeader>
        <CardTitle className="text-xl">Tedarikci maliyetleri</CardTitle>
        <CardDescription>Uygula butonu secilen maliyeti Mikro guncel maliyet alanina ve istege bagli fiyat listelerine yazar.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-3">Urun</th>
              <th className="px-3 py-3">Tedarikci</th>
              <th className="px-3 py-3">Giris T/P</th>
              <th className="px-3 py-3">Normalize T/P</th>
              <th className="px-3 py-3">Mikro fark</th>
              <th className="px-3 py-3">Kosullar</th>
              <th className="px-3 py-3">Durum</th>
              <th className="px-3 py-3 text-right">Islem</th>
            </tr>
          </thead>
          <tbody>
            {costs.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">Kayit yok.</td></tr>
            ) : costs.map((cost: any) => (
              <tr key={cost.id} className={cn('border-b align-top hover:bg-slate-50', cost.isExpired && 'bg-rose-50/70')}>
                <td className="px-3 py-3">
                  <p className="font-black text-slate-900">{cost.productCode}</p>
                  <p className="max-w-xs truncate text-xs text-slate-500">{cost.productName}</p>
                </td>
                <td className="px-3 py-3">
                  <p className="font-bold text-slate-900">{cost.supplierName}</p>
                  <p className="text-xs text-slate-500">{cost.supplierCode || '-'} {cost.supplierProductCode ? `| ${cost.supplierProductCode}` : ''}</p>
                </td>
                <td className="px-3 py-3">
                  <p className="font-black">{money(cost.costT)} / {money(cost.costP)}</p>
                  <p className="text-xs text-slate-500">{cost.currency} {cost.vatIncluded ? 'KDV dahil' : 'Net'}</p>
                </td>
                <td className="px-3 py-3">
                  <p className="font-black text-emerald-700">{money(cost.normalizedCostT)} / {money(cost.normalizedCostP)}</p>
                  <p className="text-xs text-slate-500">{cost.unit || '-'} x {cost.unitFactor || 1}</p>
                </td>
                <td className="px-3 py-3">
                  <p className={cn('font-black', Number(cost.diffFromCurrent || 0) > 0 ? 'text-red-700' : 'text-emerald-700')}>{money(cost.diffFromCurrent)}</p>
                  <p className="text-xs text-slate-500">{percent(cost.diffFromCurrentPercent)}</p>
                </td>
                <td className="px-3 py-3 text-xs text-slate-600">
                  <p>Min: {cost.minOrderQuantity || '-'}</p>
                  <p>Teslim: {cost.leadTimeDays ? `${cost.leadTimeDays} gun` : '-'}</p>
                  <p>Gecerlilik: {dateText(cost.validUntil)}</p>
                  {cost.attachmentUrl && <a href={cost.attachmentUrl} target="_blank" rel="noreferrer" className="font-bold text-primary-700">Dosya</a>}
                </td>
                <td className="px-3 py-3">
                  <span className={cn('rounded-full px-2 py-1 text-xs font-black', cost.status === 'APPLIED' ? 'bg-emerald-100 text-emerald-800' : cost.isExpired ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700')}>
                    {cost.isExpired ? 'EXPIRED' : cost.status}
                  </span>
                  <p className="mt-1 text-xs text-slate-500">{dateText(cost.createdAt)}</p>
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => onEdit(cost)}>Duzenle</Button>
                    <Button size="sm" onClick={() => onApply(cost)} isLoading={applying === cost.id}>Uygula</Button>
                    <Button size="sm" variant="danger" onClick={() => onArchive(cost)}>Arsiv</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function ApplicationHistory({ applications }: { applications: any[] }) {
  if (!applications.length) return null;
  return (
    <Card className="rounded-[2rem]">
      <CardHeader>
        <CardTitle className="text-xl">Mikro uygulama gecmisi</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {applications.map((row) => (
          <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
            <p className="font-black text-slate-900">{money(row.previousCost)} {'->'} {money(row.newCostT)} / {money(row.newCostP)}</p>
              <p className="text-xs font-bold text-slate-500">{dateText(row.createdAt)} | {row.userName || '-'}</p>
            </div>
            <p className="mt-1 text-xs text-slate-500">{row.supplierName || '-'} {row.updatePriceLists ? '| Liste fiyatlari guncellendi' : '| Sadece maliyet'}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ReportSection({ title, icon: Icon, rows, tone, onOpenProduct }: any) {
  return (
    <Card className="rounded-[2rem]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className={cn('rounded-2xl p-2', toneClass(tone))}>
              <Icon className="h-5 w-5" />
            </div>
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{rows.length}</span>
        </div>
      </CardHeader>
      <CardContent className="max-h-[430px] overflow-auto">
        {rows.length === 0 ? (
          <p className="rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-500">Bu raporda sonuc yok.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((row: any) => (
              <button key={`${title}-${row.productCode}`} type="button" onClick={() => onOpenProduct(row.productCode)} className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-amber-300 hover:bg-amber-50">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-black text-slate-950">{row.productCode} - {row.productName}</p>
                    <p className="mt-1 text-xs text-slate-500">{row.reason}</p>
                  </div>
                  <div className="text-right text-xs font-black text-slate-700">
                    <p>Mikro: {money(row.currentCost)}</p>
                    <p>En iyi: {money(row.bestCost)}</p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-slate-600">
                  <span className="rounded-full bg-slate-100 px-2 py-1">Tedarikci: {row.supplierCount || 0}</span>
                  {row.diffPercent !== undefined && <span className="rounded-full bg-red-100 px-2 py-1 text-red-700">Fark: {percent(row.diffPercent)}</span>}
                  {row.spreadPercent !== undefined && <span className="rounded-full bg-blue-100 px-2 py-1 text-blue-700">Spread: {percent(row.spreadPercent)}</span>}
                  {row.bestSupplier?.name && <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">En iyi: {row.bestSupplier.name}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProductThumb({ product, large = false }: { product: any; large?: boolean }) {
  return (
    <div className={cn('shrink-0 overflow-hidden rounded-2xl bg-white shadow-sm', large ? 'h-44 w-44' : 'h-16 w-16')}>
      {product?.imageUrl ? (
        <img src={product.imageUrl} alt={product.name || product.mikroCode} className="h-full w-full object-contain p-2" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-slate-300">
          <Package className={large ? 'h-16 w-16' : 'h-8 w-8'} />
        </div>
      )}
    </div>
  );
}

function HeroMetric({ label, value, tone = 'slate' }: { label: string; value: any; tone?: string }) {
  return (
    <div className={cn('rounded-3xl border p-4', tone === 'red' ? 'border-red-400/40 bg-red-500/10' : tone === 'emerald' ? 'border-emerald-400/40 bg-emerald-500/10' : tone === 'amber' ? 'border-amber-400/40 bg-amber-500/10' : 'border-white/10 bg-white/10')}>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-300">{label}</p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
    </div>
  );
}

function MiniMetric({ label, value, light = false }: { label: string; value: any; light?: boolean }) {
  return (
    <div className={cn('rounded-2xl p-3', light ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200' : 'bg-white/10 text-white')}>
      <p className={cn('text-[11px] font-bold uppercase tracking-wide', light ? 'text-slate-400' : 'text-slate-300')}>{label}</p>
      <p className="mt-1 truncate text-base font-black">{String(value ?? '-')}</p>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 truncate font-black text-slate-800">{String(value || '-')}</p>
    </div>
  );
}

function SelectBox({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function toneClass(tone: string) {
  if (tone === 'red') return 'bg-red-100 text-red-700';
  if (tone === 'emerald') return 'bg-emerald-100 text-emerald-700';
  if (tone === 'amber') return 'bg-amber-100 text-amber-700';
  if (tone === 'orange') return 'bg-orange-100 text-orange-700';
  if (tone === 'blue') return 'bg-blue-100 text-blue-700';
  return 'bg-slate-100 text-slate-700';
}
