'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { Copy, Search } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';

/**
 * Yeni Stok Acma ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir.
 *
 * Tipler ve module-level yardimci bilesenler (LookupField/CopyButton/CopyableInput) ile
 * sabitler/fonksiyonlar buradan export edilir; Classic/New JSX'leri bunlari tuketir.
 */

export type LookupType = 'supplier' | 'brand' | 'category' | 'package' | 'template';
export type FactorDirection = 'larger' | 'smaller';

export type LookupItem = {
  code: string;
  name: string;
};

export type ExtraUnit = {
  index: number;
  name: string;
  factor: string;
  factorDirection: FactorDirection;
  weightKg: string;
  widthCm: string;
  lengthCm: string;
  heightCm: string;
};

export type StockForm = {
  templateCode: string;
  name: string;
  foreignName: string;
  shortName: string;
  vatRatePercent: string;
  supplierCode: string;
  brandCode: string;
  brandName: string;
  categoryCode: string;
  packageCode: string;
  packageName: string;
  shelfCode: string;
  currentCost: string;
  costT: string;
  costP: string;
  mainUnit: string;
  mainUnitWeightKg: string;
  mainUnitWidthCm: string;
  mainUnitLengthCm: string;
  mainUnitHeightCm: string;
  margins: string[];
  barcode: string;
  notes: string;
  extraUnits: ExtraUnit[];
};

export type TemplateStock = StockForm & {
  stockCode?: string;
  supplierName?: string;
  brandName: string;
  categoryName?: string;
  packageName: string;
  shelfName?: string;
};

export type PreviewRow = {
  rowNo: number;
  previewCode: string;
  status: 'valid' | 'warning' | 'error';
  errors: string[];
  warnings: string[];
  item: StockForm & Record<string, any>;
  refs?: Record<string, LookupItem | null>;
};

export type CreationLog = {
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

const DRAFT_KEY = 'stock-create:draft:v2';
// 10.3: Backend ile ayni tek seferlik satir limiti; toplu yuklemede sessiz kayip olmasin.
export const MAX_BULK_ITEMS = 200;
export const textInputClass = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100';
export const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500';

export const emptyExtraUnit = (index: number): ExtraUnit => ({
  index,
  name: '',
  factor: '',
  factorDirection: 'larger',
  weightKg: '',
  widthCm: '',
  lengthCm: '',
  heightCm: '',
});

export const defaultForm = (templateCode = 'B108423'): StockForm => ({
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
  mainUnit: '',
  mainUnitWeightKg: '',
  mainUnitWidthCm: '',
  mainUnitLengthCm: '',
  mainUnitHeightCm: '',
  margins: ['', '', '', '', ''],
  barcode: '',
  notes: '',
  extraUnits: [],
});

export const normalizeNumberText = (value: unknown) => String(value ?? '').trim().replace('.', ',');
export const parseNumberText = (value: unknown) => {
  const parsed = Number(String(value ?? '').trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};
export const formatNumberText = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '';
  return String(Math.round(value * 10000) / 10000).replace('.', ',');
};
export const costPFromCostT = (costT: string, vatRatePercent: string) => {
  const parsedCostT = parseNumberText(costT);
  const parsedVat = parseNumberText(vatRatePercent || '20');
  if (parsedCostT <= 0) return '';
  return formatNumberText(parsedCostT * (1 + parsedVat / 200));
};

export const statusStyle = {
  valid: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
};

export const logStatusStyle = (status: string) => {
  if (status === 'CREATED') return 'bg-emerald-50 text-emerald-700';
  if (status === 'UPDATED') return 'bg-blue-50 text-blue-700';
  return 'bg-rose-50 text-rose-700';
};

export function formatDateTime(value: string) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function mapExcelRow(row: Record<string, any>, index: number, templateCode: string): StockForm {
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
    brandName: get('Marka Adi', 'Yeni Marka Adi'),
    categoryCode: get('Kategori Kodu', 'Kategori'),
    packageCode: get('Ambalaj Kodu', 'Ambalaj'),
    packageName: get('Ambalaj Adi', 'Yeni Ambalaj Adi'),
    shelfCode: get('Raf Kodu', 'Reyon Kodu'),
    costT: normalizeNumberText(get('Maliyet T', 'Toptan Maliyet', 'Guncel Maliyet T', 'Güncel Maliyet T', 'Guncel Maliyet', 'Güncel Maliyet')),
    costP: normalizeNumberText(get('Maliyet P', 'Perakende Maliyet', 'Guncel Maliyet P', 'Güncel Maliyet P')),
    currentCost: normalizeNumberText(get('Maliyet T', 'Toptan Maliyet', 'Guncel Maliyet T', 'Güncel Maliyet T', 'Guncel Maliyet', 'Güncel Maliyet')),
    mainUnit: get('Ana Birim', 'Birim 1', '1. Birim') || 'ADET',
    mainUnitWeightKg: normalizeNumberText(get('Ana Birim Kg', '1. Birim Kg', 'Birim 1 Kg')),
    mainUnitWidthCm: normalizeNumberText(get('Ana Birim En cm', '1. Birim En cm', 'Birim 1 En cm')),
    mainUnitLengthCm: normalizeNumberText(get('Ana Birim Boy cm', '1. Birim Boy cm', 'Birim 1 Boy cm')),
    mainUnitHeightCm: normalizeNumberText(get('Ana Birim Yukseklik cm', '1. Birim Yukseklik cm')),
    margins: [1, 2, 3, 4, 5].map((marginIndex) => normalizeNumberText(get(`Marj ${marginIndex}`, `Marj${marginIndex}`))),
    barcode: get('Barkod', 'Barcode'),
    notes: get('Not', 'Aciklama', 'Açıklama'),
    extraUnits,
  };
}

export function LookupField({
  label,
  type,
  value,
  onChange,
  placeholder,
  copyValue,
  onCopy,
}: {
  label: string;
  type: LookupType;
  value: string;
  onChange: (value: string, item?: LookupItem) => void;
  placeholder?: string;
  copyValue?: string;
  onCopy?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
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
          className={`${textInputClass} pl-10 ${onCopy && copyValue ? 'pr-11' : ''}`}
        />
        {onCopy && copyValue && (
          <button
            type="button"
            title="Sablondan kopyala"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onCopy();
            }}
            className="absolute right-2 top-2 rounded-xl bg-slate-100 p-2 text-slate-500 hover:bg-emerald-100 hover:text-emerald-700"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
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

export function CopyButton({ value, onCopy }: { value?: string; onCopy?: () => void }) {
  if (!value || !onCopy) return null;
  return (
    <button
      type="button"
      title="Sablondan kopyala"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onCopy();
      }}
      className="absolute right-2 top-2 rounded-xl bg-slate-100 p-2 text-slate-500 hover:bg-emerald-100 hover:text-emerald-700"
    >
      <Copy className="h-3.5 w-3.5" />
    </button>
  );
}

export function CopyableInput({
  label,
  value,
  onChange,
  placeholder,
  list,
  copyValue,
  onCopy,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  list?: string;
  copyValue?: string;
  onCopy?: () => void;
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <input
          list={list}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${textInputClass} ${copyValue && onCopy ? 'pr-11' : ''}`}
          placeholder={placeholder}
        />
        <CopyButton value={copyValue} onCopy={onCopy} />
      </div>
    </div>
  );
}

export function useStokAcma() {
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
  const [templateStock, setTemplateStock] = useState<TemplateStock | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [editingStockCode, setEditingStockCode] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const appliedTemplateRef = useRef('');

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
        if (parsed.form) setForm({ ...defaultForm(parsed.form.templateCode || 'B108423'), ...parsed.form });
        if (Array.isArray(parsed.bulkItems)) setBulkItems(parsed.bulkItems);
      } catch {
        // ignore broken local draft
      }
    }
    void loadMetadata();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (editingStockCode) return;
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, bulkItems }));
  }, [form, bulkItems, editingStockCode]);

  useEffect(() => {
    if (editingStockCode) return;
    const code = form.templateCode.trim().toUpperCase();
    if (!code || code.length < 4) {
      setTemplateStock(null);
      return;
    }
    const timer = setTimeout(() => {
      void loadTemplate(code, true);
    }, 450);
    return () => clearTimeout(timer);
  }, [form.templateCode, editingStockCode]);

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

  const normalizeTemplateStock = (raw: any): TemplateStock => ({
    ...defaultForm(raw?.templateCode || raw?.stockCode || defaultTemplateCode),
    ...raw,
    stockCode: raw?.stockCode ? String(raw.stockCode) : undefined,
    templateCode: String(raw?.templateCode || raw?.stockCode || defaultTemplateCode),
    vatRatePercent: String(raw?.vatRatePercent || '20'),
    costT: String(raw?.costT || raw?.currentCost || ''),
    costP: String(raw?.costP || raw?.currentCost || ''),
    currentCost: String(raw?.costT || raw?.currentCost || ''),
    mainUnitWeightKg: String(raw?.mainUnitWeightKg || ''),
    mainUnitWidthCm: String(raw?.mainUnitWidthCm || ''),
    mainUnitLengthCm: String(raw?.mainUnitLengthCm || ''),
    mainUnitHeightCm: String(raw?.mainUnitHeightCm || ''),
    margins: Array.isArray(raw?.margins) && raw.margins.length === 5 ? raw.margins.map((value: unknown) => String(value ?? '')) : defaultForm().margins,
    extraUnits: Array.isArray(raw?.extraUnits) ? raw.extraUnits.map((unit: ExtraUnit) => ({ ...emptyExtraUnit(unit.index), ...unit })) : [],
  });

  const applyTemplateDefaults = (template: TemplateStock) => {
    setForm((prev) => ({
      ...prev,
      templateCode: template.templateCode,
      vatRatePercent: template.vatRatePercent || prev.vatRatePercent,
      categoryCode: template.categoryCode || prev.categoryCode,
      margins: template.margins?.some(Boolean) ? template.margins : prev.margins,
    }));
    setPreviewRows([]);
  };

  const loadTemplate = async (templateCode: string, applyDefaults = false) => {
    const code = templateCode.trim().toUpperCase();
    if (!code) return;
    setTemplateLoading(true);
    try {
      const res = await apiClient.get(`/admin/stock-create/templates/${encodeURIComponent(code)}`);
      const normalized = normalizeTemplateStock(res.data.template);
      setTemplateStock(normalized);
      if (applyDefaults && appliedTemplateRef.current !== normalized.templateCode) {
        appliedTemplateRef.current = normalized.templateCode;
        applyTemplateDefaults(normalized);
      }
    } catch (error: any) {
      setTemplateStock(null);
      if (applyDefaults && code.length >= 5) {
        toast.error(error.response?.data?.error || 'Sablon stok bulunamadi');
      }
    } finally {
      setTemplateLoading(false);
    }
  };

  const copyFromTemplate = (patch: Partial<StockForm>) => {
    updateForm(patch);
  };

  const updateTemplateCode = (templateCode: string) => {
    appliedTemplateRef.current = '';
    updateForm({ templateCode });
  };

  const updateForm = (patch: Partial<StockForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setPreviewRows([]);
  };

  const updateVatRatePercent = (vatRatePercent: string) => {
    setForm((prev) => {
      const costP = prev.costT ? costPFromCostT(prev.costT, vatRatePercent) : prev.costP;
      return { ...prev, vatRatePercent, costP, currentCost: prev.costT || prev.currentCost };
    });
    setPreviewRows([]);
  };

  const updateCostT = (costT: string) => {
    const costP = costPFromCostT(costT, form.vatRatePercent);
    updateForm({ costT, costP, currentCost: costT });
  };

  const updateCostP = (costP: string) => {
    setForm((prev) => ({ ...prev, costP, currentCost: prev.costT || prev.currentCost }));
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

  const cancelEditMode = () => {
    setEditingStockCode(null);
    setTemplateStock(null);
    appliedTemplateRef.current = '';
    setForm(defaultForm(defaultTemplateCode));
    setPreviewRows([]);
  };

  const loadStockForEdit = async (stockCode?: string | null) => {
    const code = String(stockCode || '').trim().toUpperCase();
    if (!code) return;
    setEditLoading(true);
    try {
      const res = await apiClient.get(`/admin/stock-create/stocks/${encodeURIComponent(code)}`);
      const normalized = normalizeTemplateStock(res.data.stock);
      setActiveTab('single');
      setEditingStockCode(code);
      setTemplateStock(null);
      appliedTemplateRef.current = code;
      setForm({ ...defaultForm(code), ...normalized, templateCode: code });
      setPreviewRows([]);
      toast.success(`${code} duzenleme moduna alindi`);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Stok bilgisi alinamadi');
    } finally {
      setEditLoading(false);
    }
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
      // 10.3: Limit asildiysa kullaniciyi acikca uyar (sessiz kayip olmasin).
      if (summary?.truncated) {
        toast.error(summary.truncationMessage || `Sadece ilk ${summary.maxItems} satir on kontrolden gecti.`, { duration: 8000 });
      }
      if (summary?.error > 0) toast.error(`${summary.error} satir hatali`);
      else if (summary?.warning > 0) toast(`${summary.warning} satir uyarili, yine de kaydedilebilir`);
      else if (!summary?.truncated) toast.success('Tum satirlar kayda hazir');
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

  const updateExistingStock = async () => {
    if (!editingStockCode) return;
    const confirmed = window.confirm(`${editingStockCode} stok karti Mikroda guncellenecek. Devam edilsin mi?`);
    if (!confirmed) return;

    setUpdating(true);
    try {
      const res = await apiClient.put(`/admin/stock-create/stocks/${encodeURIComponent(editingStockCode)}`, form);
      const normalized = normalizeTemplateStock(res.data.stock);
      setForm({ ...defaultForm(editingStockCode), ...normalized, templateCode: editingStockCode });
      setPreviewRows([]);
      await loadMetadata();
      toast.success(`${editingStockCode} guncellendi`);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Stok karti guncellenemedi');
    } finally {
      setUpdating(false);
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
        'Marka Adi': 'FOCUS',
        'Kategori Kodu': '8.04.03',
        'Ambalaj Kodu': '6',
        'Ambalaj Adi': '6 KG',
        'Ana Birim': 'KOLI',
        'Ana Birim Kg': 6,
        'Ana Birim En cm': '',
        'Ana Birim Boy cm': '',
        'Ana Birim Yukseklik cm': '',
        '2. Birim': 'ADET',
        '2. Katsayi': 6,
        '2. Yon': 'Buyuk birim',
        'Marj 1': 2,
        'Marj 2': 1.5,
        'Marj 3': 1.3,
        'Marj 4': 1.2,
        'Marj 5': 1.15,
        'Maliyet T': '',
        'Maliyet P': '',
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
      // 10.3: Limit asildiysa daha yukleme aninda acikca uyar.
      if (mapped.length > MAX_BULK_ITEMS) {
        toast.error(
          `${mapped.length} satir yuklendi ancak tek seferde en fazla ${MAX_BULK_ITEMS} satir islenebilir. Kalan ${mapped.length - MAX_BULK_ITEMS} satir icin ayri parti yukleyin.`,
          { duration: 9000 }
        );
      }
    } catch (error) {
      toast.error('Excel okunamadi');
    } finally {
      event.target.value = '';
    }
  };

  return {
    // router / auth / izin
    router,
    user,
    permissionsLoading,
    // sekme / kod / sablon
    activeTab,
    setActiveTab,
    nextCode,
    defaultTemplateCode,
    unitNames,
    // form / toplu / onizleme / gecmis
    form,
    bulkItems,
    previewRows,
    historyRows,
    templateStock,
    templateLoading,
    // duzenleme / yuklenme durumlari
    editingStockCode,
    editLoading,
    updating,
    loading,
    creating,
    // turetilmis
    activeItems,
    hasErrors,
    hasWarnings,
    // aksiyonlar
    loadMetadata,
    applyTemplateDefaults,
    loadTemplate,
    copyFromTemplate,
    updateTemplateCode,
    updateForm,
    updateVatRatePercent,
    updateCostT,
    updateCostP,
    updateMargin,
    addExtraUnit,
    updateExtraUnit,
    removeExtraUnit,
    cancelEditMode,
    loadStockForEdit,
    preview,
    createStocks,
    updateExistingStock,
    downloadTemplate,
    handleFileUpload,
    setPreviewRows,
  };
}

export default useStokAcma;
