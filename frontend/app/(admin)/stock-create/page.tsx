'use client';

import { ChangeEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  History,
  PackagePlus,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

type LookupType = 'supplier' | 'brand' | 'category' | 'package' | 'template';
type FactorDirection = 'larger' | 'smaller';

type LookupItem = {
  code: string;
  name: string;
};

type ExtraUnit = {
  index: number;
  name: string;
  factor: string;
  factorDirection: FactorDirection;
  weightKg: string;
  widthCm: string;
  lengthCm: string;
  heightCm: string;
};

type StockForm = {
  templateCode: string;
  name: string;
  foreignName: string;
  shortName: string;
  vatRatePercent: string;
  supplierCode: string;
  brandCode: string;
  categoryCode: string;
  packageCode: string;
  shelfCode: string;
  currentCost: string;
  mainUnit: string;
  margins: string[];
  barcode: string;
  notes: string;
  extraUnits: ExtraUnit[];
};

type PreviewRow = {
  rowNo: number;
  previewCode: string;
  status: 'valid' | 'warning' | 'error';
  errors: string[];
  warnings: string[];
  item: StockForm & Record<string, any>;
  refs?: Record<string, LookupItem | null>;
};

type CreationLog = {
  id: string;
  batchId: string;
  mode: string;
  status: string;
  rowNo?: number | null;
  stockCode?: string | null;
  stockName: string;
  createdByName?: string | null;
  createdAt: string;
};

const DRAFT_KEY = 'stock-create:draft';
const textInputClass = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100';
const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500';

const emptyExtraUnit = (index: number): ExtraUnit => ({
  index,
  name: '',
  factor: '',
  factorDirection: 'larger',
  weightKg: '',
  widthCm: '',
  lengthCm: '',
  heightCm: '',
});

const defaultForm = (templateCode = 'B108423'): StockForm => ({
  templateCode,
  name: '',
  foreignName: '',
  shortName: '',
  vatRatePercent: '20',
  supplierCode: '',
  brandCode: '',
  categoryCode: '',
  packageCode: '',
  shelfCode: '',
  currentCost: '',
  mainUnit: 'ADET',
  margins: ['2', '1,5', '1,3', '1,2', '1,15'],
  barcode: '',
  notes: '',
  extraUnits: [],
});

const normalizeNumberText = (value: unknown) => String(value ?? '').trim().replace('.', ',');

const statusStyle = {
  valid: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
};

function formatDateTime(value: string) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function mapExcelRow(row: Record<string, any>, index: number, templateCode: string): StockForm {
  const get = (...keys: string[]) => {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null) return String(row[key]).trim();
    }
    return '';
  };

  const extraUnits: ExtraUnit[] = [];
  [2, 3, 4].forEach((unitIndex) => {
    const name = get(`${unitIndex}. Birim`, `${unitIndex}.Birim`, `${unitIndex} Birim`, `Birim ${unitIndex}`);
    const factor = get(`${unitIndex}. Katsayi`, `${unitIndex}.Katsayi`, `${unitIndex} Katsayi`, `Katsayi ${unitIndex}`);
    if (!name && !factor) return;
    extraUnits.push({
      index: unitIndex,
      name,
      factor,
      factorDirection: get(`${unitIndex}. Yon`, `${unitIndex}.Yön`, `Yon ${unitIndex}`).toLowerCase().includes('pozitif') ? 'smaller' : 'larger',
      weightKg: get(`${unitIndex}. Kg`, `Kg ${unitIndex}`),
      widthCm: get(`${unitIndex}. En cm`, `En cm ${unitIndex}`),
      lengthCm: get(`${unitIndex}. Boy cm`, `Boy cm ${unitIndex}`),
      heightCm: get(`${unitIndex}. Yukseklik cm`, `${unitIndex}. Yükseklik cm`, `Yukseklik cm ${unitIndex}`),
    });
  });

  return {
    templateCode: get('Sablon Stok', 'Şablon Stok', 'Template') || templateCode,
    name: get('Stok Adi', 'Stok Adı', 'Urun Adi', 'Ürün Adı', 'name'),
    foreignName: get('Tedarikci Urun Kodu', 'Tedarikçi Ürün Kodu', 'Yabanci Isim', 'Yabancı İsim'),
    shortName: get('Kisa Isim', 'Kısa İsim'),
    vatRatePercent: normalizeNumberText(get('KDV', 'KDV %', 'Kdv')),
    supplierCode: get('Ana Saglayici Kodu', 'Ana Sağlayıcı Kodu', 'Tedarikci Kodu', 'Tedarikçi Kodu'),
    brandCode: get('Marka Kodu', 'Marka'),
    categoryCode: get('Kategori Kodu', 'Kategori'),
    packageCode: get('Ambalaj Kodu', 'Ambalaj'),
    shelfCode: get('Raf Kodu', 'Reyon Kodu'),
    currentCost: normalizeNumberText(get('Guncel Maliyet', 'Güncel Maliyet')),
    mainUnit: get('Ana Birim', 'Birim 1', '1. Birim') || 'ADET',
    margins: [1, 2, 3, 4, 5].map((marginIndex) => normalizeNumberText(get(`Marj ${marginIndex}`, `Marj${marginIndex}`))),
    barcode: get('Barkod', 'Barcode'),
    notes: get('Not', 'Aciklama', 'Açıklama'),
    extraUnits,
  };
}

function LookupField({
  label,
  type,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type: LookupType;
  value: string;
  onChange: (value: string, item?: LookupItem) => void;
  placeholder?: string;
}) {
  const [search, setSearch] = useState(value);
  const [items, setItems] = useState<LookupItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSearch(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiClient.get(`/admin/stock-create/lookups/${type}`, {
          params: { search, limit: 40 },
        });
        setItems(res.data.items || []);
      } catch (error) {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [search, type, open]);

  return (
    <div className="relative">
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
        <input
          value={search}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            const next = event.target.value;
            setSearch(next);
            onChange(next);
            setOpen(true);
          }}
          placeholder={placeholder || 'Kod veya ad ara'}
          className={`${textInputClass} pl-10`}
        />
      </div>
      {open && (
        <div className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
          {loading && <div className="px-3 py-2 text-sm text-slate-500">Araniyor...</div>}
          {!loading && items.length === 0 && <div className="px-3 py-2 text-sm text-slate-500">Sonuc yok</div>}
          {!loading && items.map((item) => (
            <button
              key={`${type}-${item.code}`}
              type="button"
              onClick={() => {
                onChange(item.code, item);
                setSearch(item.code);
                setOpen(false);
              }}
              className="w-full rounded-xl px-3 py-2 text-left hover:bg-emerald-50"
            >
              <div className="text-sm font-bold text-slate-900">{item.code}</div>
              <div className="line-clamp-1 text-xs text-slate-500">{item.name || '-'}</div>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-1 w-full rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600"
          >
            Kapat
          </button>
        </div>
      )}
    </div>
  );
}

export default function StockCreatePage() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');
  const [nextCode, setNextCode] = useState('');
  const [defaultTemplateCode, setDefaultTemplateCode] = useState('B108423');
  const [unitNames, setUnitNames] = useState<string[]>([]);
  const [form, setForm] = useState<StockForm>(defaultForm());
  const [bulkItems, setBulkItems] = useState<StockForm[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [historyRows, setHistoryRows] = useState<CreationLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (user === null || permissionsLoading) return;
    if (!hasPermission('admin:stock-create')) {
      router.push('/dashboard');
    }
  }, [user, permissionsLoading, hasPermission, router]);

  useEffect(() => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(DRAFT_KEY) : null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.form) setForm(parsed.form);
        if (Array.isArray(parsed.bulkItems)) setBulkItems(parsed.bulkItems);
      } catch {
        // ignore broken local draft
      }
    }
    void loadMetadata();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, bulkItems }));
  }, [form, bulkItems]);

  const loadMetadata = async () => {
    setLoading(true);
    try {
      const [metadataRes, historyRes] = await Promise.all([
        apiClient.get('/admin/stock-create/metadata'),
        apiClient.get('/admin/stock-create/history', { params: { limit: 30 } }),
      ]);
      setNextCode(metadataRes.data.nextCode || '');
      setDefaultTemplateCode(metadataRes.data.defaultTemplateCode || 'B108423');
      setUnitNames(metadataRes.data.unitNames || []);
      setHistoryRows(historyRes.data.logs || []);
      setForm((prev) => ({ ...prev, templateCode: prev.templateCode || metadataRes.data.defaultTemplateCode || 'B108423' }));
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Stok acma bilgileri alinamadi');
    } finally {
      setLoading(false);
    }
  };

  const updateForm = (patch: Partial<StockForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setPreviewRows([]);
  };

  const updateMargin = (index: number, value: string) => {
    setForm((prev) => ({
      ...prev,
      margins: prev.margins.map((margin, marginIndex) => (marginIndex === index ? value : margin)),
    }));
    setPreviewRows([]);
  };

  const addExtraUnit = () => {
    setForm((prev) => {
      const used = new Set(prev.extraUnits.map((unit) => unit.index));
      const nextIndex = [2, 3, 4].find((index) => !used.has(index));
      if (!nextIndex) return prev;
      return { ...prev, extraUnits: [...prev.extraUnits, emptyExtraUnit(nextIndex)] };
    });
    setPreviewRows([]);
  };

  const updateExtraUnit = (index: number, patch: Partial<ExtraUnit>) => {
    setForm((prev) => ({
      ...prev,
      extraUnits: prev.extraUnits.map((unit) => (unit.index === index ? { ...unit, ...patch } : unit)),
    }));
    setPreviewRows([]);
  };

  const removeExtraUnit = (index: number) => {
    setForm((prev) => ({ ...prev, extraUnits: prev.extraUnits.filter((unit) => unit.index !== index) }));
    setPreviewRows([]);
  };

  const activeItems = activeTab === 'single' ? [form] : bulkItems;
  const hasErrors = previewRows.some((row) => row.status === 'error');
  const hasWarnings = previewRows.some((row) => row.status === 'warning');

  const preview = async () => {
    if (activeItems.length === 0) {
      toast.error('On kontrol icin satir yok');
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.post('/admin/stock-create/preview', { items: activeItems });
      setPreviewRows(res.data.results || []);
      const summary = res.data.summary;
      if (summary?.error > 0) toast.error(`${summary.error} satir hatali`);
      else if (summary?.warning > 0) toast(`${summary.warning} satir uyarili, yine de kaydedilebilir`);
      else toast.success('Tum satirlar kayda hazir');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'On kontrol yapilamadi');
    } finally {
      setLoading(false);
    }
  };

  const createStocks = async () => {
    if (activeItems.length === 0) return;
    if (!previewRows.length) {
      toast.error('Once on kontrol calistirin');
      return;
    }
    if (hasErrors) {
      toast.error('Hatali satirlar varken Mikroya yazilamaz');
      return;
    }
    const confirmed = window.confirm(`${activeItems.length} stok karti Mikroda olusturulacak.${hasWarnings ? '\n\nUyarili satirlar var; devam etmek istiyor musunuz?' : ''}`);
    if (!confirmed) return;

    setCreating(true);
    try {
      const res = await apiClient.post('/admin/stock-create/create', { items: activeItems });
      toast.success(`${res.data.created?.length || 0} stok karti olusturuldu`);
      setPreviewRows([]);
      await loadMetadata();
      if (activeTab === 'single') setForm(defaultForm(defaultTemplateCode));
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Stok karti olusturulamadi');
    } finally {
      setCreating(false);
    }
  };

  const downloadTemplate = () => {
    const rows = [
      {
        'Sablon Stok': defaultTemplateCode,
        'Stok Adi': "Focus Extra 21 cm Hareketli Kagit Havlu 130 mt 6'li Koli - 6 kg 50003071",
        'Tedarikci Urun Kodu': '50003071',
        'KDV': 20,
        'Ana Saglayici Kodu': '320.01.211',
        'Marka Kodu': 'FOCUS',
        'Kategori Kodu': '8.04.03',
        'Ambalaj Kodu': '6',
        'Ana Birim': 'KOLI',
        '2. Birim': 'ADET',
        '2. Katsayi': 6,
        '2. Yon': 'Buyuk birim',
        'Marj 1': 2,
        'Marj 2': 1.5,
        'Marj 3': 1.3,
        'Marj 4': 1.2,
        'Marj 5': 1.15,
        'Guncel Maliyet': '',
        'Raf Kodu': '',
        'Barkod': '',
        'Not': '',
      },
    ];
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Stok Acma');
    XLSX.writeFile(workbook, `stok-acma-sablonu-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
      const mapped = rows.map((row, index) => mapExcelRow(row, index + 1, defaultTemplateCode)).filter((item) => item.name.trim());
      setBulkItems(mapped);
      setActiveTab('bulk');
      setPreviewRows([]);
      toast.success(`${mapped.length} satir yuklendi`);
    } catch (error) {
      toast.error('Excel okunamadi');
    } finally {
      event.target.value = '';
    }
  };

  if (!user || permissionsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#ecfdf5_0,#f8fafc_32%,#eef2ff_100%)]">
      <datalist id="stock-create-unit-names">
        {unitNames.map((unitName) => (
          <option key={unitName} value={unitName} />
        ))}
      </datalist>

      <div className="mx-auto max-w-[1840px] px-4 py-8 sm:px-6 2xl:px-10">
        <div className="mb-7 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-[2rem] border border-white/70 bg-slate-950 p-6 text-white shadow-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-200">
              <PackagePlus className="h-4 w-4" />
              Mikro Stok Karti Olusturma
            </div>
            <h1 className="text-3xl font-black tracking-tight md:text-4xl">Yeni Stok Acma</h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300">
              Tekli veya Excel ile toplu stok karti acin. Sistem once Mikro referanslarini kontrol eder, sonra siradaki B kodunu transaction icinde kilitleyerek olusturur.
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-xs font-bold">
              <span className="rounded-full bg-white/10 px-3 py-1.5">Siradaki kod: {nextCode || '-'}</span>
              <span className="rounded-full bg-white/10 px-3 py-1.5">Varsayilan sablon: {defaultTemplateCode}</span>
              <span className="rounded-full bg-white/10 px-3 py-1.5">Ana birim zorunlu, ek birimler opsiyonel</span>
            </div>
          </div>

          <Card className="rounded-[2rem] border-0 bg-white/80 p-5 shadow-xl backdrop-blur">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-black text-slate-900">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              Guvenli Yazim
            </h2>
            <div className="space-y-2 text-sm text-slate-600">
              <div>1. Sablon stok karti kopyalanir.</div>
              <div>2. Zorunlu alanlar ve referanslar dogrulanir.</div>
              <div>3. Kod transaction kilidiyle uretilir.</div>
              <div>4. Mikro + B2B urun kaydi + islem gecmisi yazilir.</div>
            </div>
          </Card>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setActiveTab('single');
              setPreviewRows([]);
            }}
            className={`rounded-2xl px-5 py-3 text-sm font-black transition ${activeTab === 'single' ? 'bg-slate-950 text-white shadow-lg' : 'bg-white text-slate-700 shadow-sm hover:bg-slate-100'}`}
          >
            Tekli Stok Ac
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('bulk');
              setPreviewRows([]);
            }}
            className={`rounded-2xl px-5 py-3 text-sm font-black transition ${activeTab === 'bulk' ? 'bg-slate-950 text-white shadow-lg' : 'bg-white text-slate-700 shadow-sm hover:bg-slate-100'}`}
          >
            Toplu Excel
          </button>
          <Button onClick={loadMetadata} isLoading={loading} className="bg-white text-slate-700 shadow-sm hover:bg-slate-100">
            <RefreshCw className="mr-2 h-4 w-4" />
            Yenile
          </Button>
          <Button onClick={downloadTemplate} className="bg-white text-slate-700 shadow-sm hover:bg-slate-100">
            <Download className="mr-2 h-4 w-4" />
            Excel Sablonu
          </Button>
          <label className="inline-flex cursor-pointer items-center rounded-lg bg-emerald-600 px-4 py-2 text-base font-medium text-white transition hover:bg-emerald-700">
            <Upload className="mr-2 h-4 w-4" />
            Excel Yukle
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_430px]">
          <div className="space-y-6">
            {activeTab === 'single' ? (
              <Card className="rounded-[2rem] border-0 p-6 shadow-xl">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-black text-slate-950">Tekli Stok Bilgileri</h2>
                    <p className="mt-1 text-sm text-slate-500">Zorunlu alanlari doldurun, once on kontrol calistirin.</p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-right">
                    <div className="text-xs font-bold uppercase text-emerald-700">Olusacak Kod</div>
                    <div className="text-2xl font-black text-emerald-900">{previewRows[0]?.previewCode || nextCode || '-'}</div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="lg:col-span-2">
                    <label className={labelClass}>Stok Adi *</label>
                    <input value={form.name} onChange={(event) => updateForm({ name: event.target.value })} className={textInputClass} placeholder="Urun adi" />
                  </div>
                  <div>
                    <label className={labelClass}>Sablon Stok</label>
                    <input value={form.templateCode} onChange={(event) => updateForm({ templateCode: event.target.value.toUpperCase() })} className={textInputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Tedarikci Urun Kodu</label>
                    <input value={form.foreignName} onChange={(event) => updateForm({ foreignName: event.target.value })} className={textInputClass} placeholder="Orn. 50003071" />
                  </div>
                  <div>
                    <label className={labelClass}>Kisa Isim</label>
                    <input value={form.shortName} onChange={(event) => updateForm({ shortName: event.target.value })} className={textInputClass} placeholder="Opsiyonel" />
                  </div>
                  <div>
                    <label className={labelClass}>KDV % *</label>
                    <select value={form.vatRatePercent} onChange={(event) => updateForm({ vatRatePercent: event.target.value })} className={textInputClass}>
                      <option value="20">%20</option>
                      <option value="10">%10</option>
                      <option value="1">%1</option>
                      <option value="0">%0</option>
                    </select>
                  </div>
                  <LookupField label="Ana Saglayici *" type="supplier" value={form.supplierCode} onChange={(supplierCode) => updateForm({ supplierCode })} />
                  <LookupField label="Marka *" type="brand" value={form.brandCode} onChange={(brandCode) => updateForm({ brandCode: brandCode.toUpperCase() })} />
                  <LookupField label="Kategori *" type="category" value={form.categoryCode} onChange={(categoryCode) => updateForm({ categoryCode })} />
                  <LookupField label="Ambalaj *" type="package" value={form.packageCode} onChange={(packageCode) => updateForm({ packageCode })} />
                  <div>
                    <label className={labelClass}>Ana Birim *</label>
                    <input list="stock-create-unit-names" value={form.mainUnit} onChange={(event) => updateForm({ mainUnit: event.target.value.toUpperCase() })} className={textInputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Guncel Maliyet</label>
                    <input value={form.currentCost} onChange={(event) => updateForm({ currentCost: event.target.value })} className={textInputClass} placeholder="Opsiyonel" />
                  </div>
                  <div>
                    <label className={labelClass}>Raf / Reyon Kodu</label>
                    <input value={form.shelfCode} onChange={(event) => updateForm({ shelfCode: event.target.value.toUpperCase() })} className={textInputClass} placeholder="Opsiyonel" />
                  </div>
                </div>

                <div className="mt-6 rounded-3xl bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-black text-slate-900">Marjlar *</h3>
                    <span className="text-xs font-semibold text-slate-500">Virgul veya nokta kabul edilir</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-5">
                    {form.margins.map((margin, index) => (
                      <div key={index}>
                        <label className={labelClass}>Marj {index + 1}</label>
                        <input value={margin} onChange={(event) => updateMargin(index, event.target.value)} className={textInputClass} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6 rounded-3xl bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-black text-slate-900">Ek Birimler</h3>
                      <p className="text-xs text-slate-500">Ana birim zorunlu. 2-4. birimler istege bagli olarak katsayilariyla yazilir.</p>
                    </div>
                    <Button onClick={addExtraUnit} disabled={form.extraUnits.length >= 3} className="bg-slate-950 text-white">
                      <Plus className="mr-2 h-4 w-4" />
                      Birim Ekle
                    </Button>
                  </div>
                  <div className="space-y-4">
                    {form.extraUnits.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">Ek birim yok. Ihtiyac varsa "Birim Ekle" ile tanimlayin.</div>}
                    {form.extraUnits.map((unit) => (
                      <div key={unit.index} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <div className="font-black text-slate-900">{unit.index}. Birim</div>
                          <button type="button" onClick={() => removeExtraUnit(unit.index)} className="rounded-xl p-2 text-rose-600 hover:bg-rose-50">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="grid gap-3 lg:grid-cols-4">
                          <div>
                            <label className={labelClass}>Birim Adi</label>
                            <input list="stock-create-unit-names" value={unit.name} onChange={(event) => updateExtraUnit(unit.index, { name: event.target.value.toUpperCase() })} className={textInputClass} />
                          </div>
                          <div>
                            <label className={labelClass}>Katsayi</label>
                            <input value={unit.factor} onChange={(event) => updateExtraUnit(unit.index, { factor: event.target.value })} className={textInputClass} placeholder="Orn. 6" />
                          </div>
                          <div className="lg:col-span-2">
                            <label className={labelClass}>Katsayi Yonu</label>
                            <select value={unit.factorDirection} onChange={(event) => updateExtraUnit(unit.index, { factorDirection: event.target.value as FactorDirection })} className={textInputClass}>
                              <option value="larger">Buyuk birim: 1 {unit.name || 'birim'} = X {form.mainUnit || 'ana birim'} (Mikro negatif)</option>
                              <option value="smaller">Mikro pozitif / ters katsayi</option>
                            </select>
                          </div>
                          <input value={unit.weightKg} onChange={(event) => updateExtraUnit(unit.index, { weightKg: event.target.value })} className={textInputClass} placeholder="Kg" />
                          <input value={unit.widthCm} onChange={(event) => updateExtraUnit(unit.index, { widthCm: event.target.value })} className={textInputClass} placeholder="En cm" />
                          <input value={unit.lengthCm} onChange={(event) => updateExtraUnit(unit.index, { lengthCm: event.target.value })} className={textInputClass} placeholder="Boy cm" />
                          <input value={unit.heightCm} onChange={(event) => updateExtraUnit(unit.index, { heightCm: event.target.value })} className={textInputClass} placeholder="Yukseklik cm" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  <div>
                    <label className={labelClass}>Barkod</label>
                    <input value={form.barcode} onChange={(event) => updateForm({ barcode: event.target.value })} className={textInputClass} placeholder="Opsiyonel, Mikro barkod tanimina yazilir" />
                  </div>
                  <div>
                    <label className={labelClass}>Not</label>
                    <input value={form.notes} onChange={(event) => updateForm({ notes: event.target.value })} className={textInputClass} placeholder="Opsiyonel islem notu" />
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="rounded-[2rem] border-0 p-6 shadow-xl">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-black text-slate-950">Toplu Stok Acma</h2>
                    <p className="mt-1 text-sm text-slate-500">Excel satirlari on kontrolden gecer; kodlar Mikroya yazim aninda kesinlesir.</p>
                  </div>
                  <div className="rounded-2xl bg-slate-100 px-4 py-3 text-right">
                    <div className="text-xs font-bold uppercase text-slate-500">Yuklenen Satir</div>
                    <div className="text-2xl font-black text-slate-900">{bulkItems.length}</div>
                  </div>
                </div>
                {bulkItems.length === 0 ? (
                  <div className="flex min-h-[360px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 text-center">
                    <FileSpreadsheet className="h-16 w-16 text-slate-300" />
                    <h3 className="mt-4 text-xl font-black text-slate-900">Excel yukleyin</h3>
                    <p className="mt-2 max-w-md text-sm text-slate-500">Sablonu indirip doldurun. Zorunlu alanlar eksikse sistem satir satir gosterecek.</p>
                  </div>
                ) : (
                  <div className="overflow-auto rounded-2xl border border-slate-200">
                    <table className="min-w-[1100px] w-full text-left text-sm">
                      <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-3 py-3">#</th>
                          <th className="px-3 py-3">Stok Adi</th>
                          <th className="px-3 py-3">Tedarikci</th>
                          <th className="px-3 py-3">Marka</th>
                          <th className="px-3 py-3">Kategori</th>
                          <th className="px-3 py-3">Ambalaj</th>
                          <th className="px-3 py-3">Ana Birim</th>
                          <th className="px-3 py-3">Marjlar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {bulkItems.slice(0, 80).map((item, index) => (
                          <tr key={`${item.name}-${index}`}>
                            <td className="px-3 py-3 font-bold text-slate-500">{index + 1}</td>
                            <td className="max-w-[360px] px-3 py-3 font-semibold text-slate-900">{item.name}</td>
                            <td className="px-3 py-3">{item.supplierCode}</td>
                            <td className="px-3 py-3">{item.brandCode}</td>
                            <td className="px-3 py-3">{item.categoryCode}</td>
                            <td className="px-3 py-3">{item.packageCode}</td>
                            <td className="px-3 py-3">{item.mainUnit}</td>
                            <td className="px-3 py-3">{item.margins.join(' / ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {bulkItems.length > 80 && <div className="bg-slate-50 px-4 py-3 text-sm text-slate-500">Ilk 80 satir gosteriliyor.</div>}
                  </div>
                )}
              </Card>
            )}

            <Card className="rounded-[2rem] border-0 p-6 shadow-xl">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-slate-950">On Kontrol Sonuclari</h2>
                  <p className="text-sm text-slate-500">Kolonlar ve referanslar Mikroya yazmadan once kontrol edilir.</p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={preview} isLoading={loading} className="bg-slate-950 text-white">
                    <Search className="mr-2 h-4 w-4" />
                    On Kontrol
                  </Button>
                  <Button onClick={createStocks} isLoading={creating} disabled={!previewRows.length || hasErrors} className="bg-emerald-600 text-white hover:bg-emerald-700">
                    <Save className="mr-2 h-4 w-4" />
                    Mikroya Yaz
                  </Button>
                </div>
              </div>

              {previewRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">On kontrol henuz calistirilmadi.</div>
              ) : (
                <div className="space-y-3">
                  {previewRows.map((row) => (
                    <div key={row.rowNo} className={`rounded-2xl border p-4 ${statusStyle[row.status]}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-black">
                            {row.status === 'valid' && <CheckCircle2 className="h-5 w-5" />}
                            {row.status === 'warning' && <AlertTriangle className="h-5 w-5" />}
                            {row.status === 'error' && <XCircle className="h-5 w-5" />}
                            Satir {row.rowNo} - {row.previewCode}
                          </div>
                          <div className="mt-1 text-sm font-semibold">{row.item.name}</div>
                        </div>
                        <div className="text-xs font-bold uppercase">{row.status === 'valid' ? 'Kayda hazir' : row.status === 'warning' ? 'Uyarili' : 'Hatali'}</div>
                      </div>
                      {(row.errors.length > 0 || row.warnings.length > 0) && (
                        <div className="mt-3 space-y-1 text-sm">
                          {row.errors.map((error) => <div key={error}>Hata: {error}</div>)}
                          {row.warnings.map((warning) => <div key={warning}>Uyari: {warning}</div>)}
                        </div>
                      )}
                      {row.refs && (
                        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
                          <span>Marka: {row.refs.brand?.name || '-'}</span>
                          <span>Kategori: {row.refs.category?.name || '-'}</span>
                          <span>Ambalaj: {row.refs.package?.name || '-'}</span>
                          <span>Saglayici: {row.refs.supplier?.name || '-'}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="rounded-[2rem] border-0 p-5 shadow-xl">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-black text-slate-900">
                <History className="h-5 w-5 text-slate-500" />
                Son Acilan Stoklar
              </h2>
              <div className="space-y-3">
                {historyRows.length === 0 && <div className="text-sm text-slate-500">Kayit yok</div>}
                {historyRows.map((log) => (
                  <div key={log.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-black text-slate-900">{log.stockCode || '-'}</div>
                        <div className="line-clamp-2 text-sm text-slate-600">{log.stockName}</div>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-black ${log.status === 'CREATED' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{log.status}</span>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">{formatDateTime(log.createdAt)} {log.createdByName ? `- ${log.createdByName}` : ''}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="rounded-[2rem] border-0 bg-slate-950 p-5 text-white shadow-xl">
              <h2 className="mb-3 text-lg font-black">Excel Kolonlari</h2>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                {['Stok Adi', 'Ana Saglayici Kodu', 'Marka Kodu', 'Kategori Kodu', 'Ambalaj Kodu', 'Ana Birim', 'KDV', 'Marj 1-5', '2. Birim', '2. Katsayi', 'Guncel Maliyet', 'Raf Kodu'].map((item) => (
                  <div key={item} className="rounded-xl bg-white/10 px-3 py-2">{item}</div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
