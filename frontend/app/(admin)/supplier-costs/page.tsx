'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileUp,
  HandCoins,
  History,
  Package,
  RefreshCw,
  Search,
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

type TabKey = 'entry' | 'reports' | 'history';

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

export default function SupplierCostsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('entry');
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
  const [applyNote, setApplyNote] = useState('');
  const [reports, setReports] = useState<any | null>(null);
  const [reportSearch, setReportSearch] = useState('');
  const [staleDays, setStaleDays] = useState(60);
  const [tolerancePercent, setTolerancePercent] = useState(10);
  const [spreadPercent, setSpreadPercent] = useState(15);
  const [historySearch, setHistorySearch] = useState('');
  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

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
    if (!parseNumberText(form.costP)) return toast.error('Maliyet P zorunlu');
    if (!parseNumberText(form.costT || form.costP)) return toast.error('Maliyet T zorunlu');

    setSaving(true);
    try {
      const payload = {
        ...form,
        costP: parseNumberText(form.costP),
        costT: parseNumberText(form.costT || form.costP),
        exchangeRate: form.currency === 'TRY' ? undefined : parseNumberText(form.exchangeRate),
        vatRate: form.vatRate ? parseNumberText(form.vatRate) : undefined,
        unitFactor: parseNumberText(form.unitFactor) || 1,
        minOrderQuantity: form.minOrderQuantity ? parseNumberText(form.minOrderQuantity) : undefined,
        leadTimeDays: form.leadTimeDays ? parseNumberText(form.leadTimeDays) : undefined,
      };
      if (editingCostId) {
        await adminApi.updateSupplierCost(editingCostId, payload);
        toast.success('Maliyet kaydi guncellendi');
      } else {
        await adminApi.createSupplierCost(payload);
        toast.success('Maliyet kaydi eklendi');
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
    void loadReports();
    void loadHistory();
  }, []);

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
          {[
            ['entry', 'Maliyet gir / uygula'],
            ['reports', 'Raporlar'],
            ['history', 'Gecmis'],
          ].map(([key, label]) => (
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
                          <CardDescription>Mikroya yazilacak deger normalize Maliyet P/T olarak hesaplanir.</CardDescription>
                        </div>
                        {editingCostId && (
                          <Button variant="outline" onClick={() => { setEditingCostId(null); setForm({ ...emptyForm, productCode: selectedProduct.mikroCode, unit: selectedProduct.unit || '', vatRate: String(Number(selectedProduct.vatRate || 0) * 100) }); }}>
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
                        <Input label="Maliyet P" value={form.costP} onChange={(e) => updateForm({ costP: e.target.value })} inputMode="decimal" />
                        <Input label="Maliyet T" value={form.costT} onChange={(e) => updateForm({ costT: e.target.value })} inputMode="decimal" />
                        <SelectBox label="Para birimi" value={form.currency} onChange={(value) => updateForm({ currency: value })} options={['TRY', 'USD', 'EUR']} />
                        <Input label="Kur" value={form.exchangeRate} onChange={(e) => updateForm({ exchangeRate: e.target.value })} inputMode="decimal" disabled={form.currency === 'TRY'} />
                        <Input label="Birim" value={form.unit} onChange={(e) => updateForm({ unit: e.target.value })} />
                        <Input label="Birim katsayisi" value={form.unitFactor} onChange={(e) => updateForm({ unitFactor: e.target.value })} inputMode="decimal" />
                        <Input label="KDV %" value={form.vatRate} onChange={(e) => updateForm({ vatRate: e.target.value })} inputMode="decimal" />
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
                        <MiniMetric label="Normalize Maliyet P" value={normalizedPreview ? money(normalizedPreview.costP) : '-'} />
                        <MiniMetric label="Normalize Maliyet T" value={normalizedPreview ? money(normalizedPreview.costT) : '-'} />
                        <MiniMetric label="Mevcut Mikro maliyet" value={money(selectedProduct.currentCost)} />
                      </div>

                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="outline" onClick={() => setForm({ ...emptyForm, productCode: selectedProduct.mikroCode, unit: selectedProduct.unit || '', vatRate: String(Number(selectedProduct.vatRate || 0) * 100) })}>
                          Temizle
                        </Button>
                        <Button onClick={saveCost} isLoading={saving} className="rounded-xl">
                          {editingCostId ? 'Guncelle' : 'Maliyet kaydet'}
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
              <MiniMetric label="Yeni Maliyet P" value={money(applyTarget.normalizedCostP)} light />
              <MiniMetric label="Yeni Maliyet T" value={money(applyTarget.normalizedCostT)} light />
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
              <th className="px-3 py-3">Giris P/T</th>
              <th className="px-3 py-3">Normalize P/T</th>
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
                  <p className="font-black">{money(cost.costP)} / {money(cost.costT)}</p>
                  <p className="text-xs text-slate-500">{cost.currency} {cost.vatIncluded ? 'KDV dahil' : 'Net'}</p>
                </td>
                <td className="px-3 py-3">
                  <p className="font-black text-emerald-700">{money(cost.normalizedCostP)} / {money(cost.normalizedCostT)}</p>
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
            <p className="font-black text-slate-900">{money(row.previousCost)} {'->'} {money(row.newCostP)} / {money(row.newCostT)}</p>
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
