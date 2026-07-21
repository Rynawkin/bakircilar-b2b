'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Copy, Search } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { adminApi } from '@/lib/api/admin';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';

/**
 * Yeni Stok Acma ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * SADECE tekli, gorsel-zorunlu stok acma akisi vardir (toplu/Excel akisi kaldirildi).
 *
 * Tipler ve module-level yardimci bilesenler (LookupField/CopyButton/CopyableInput) ile
 * sabitler/fonksiyonlar buradan export edilir; StokAcmaNew JSX'i bunlari tuketir.
 */

export type FamilyMember = { productCode: string; productName: string };

export type FamilyOption = {
  id: string;
  name: string;
  code?: string | null;
  /** Ailedeki urunler — "icindekiler" modalinda dogru aileye ekledigini teyit icin */
  members: FamilyMember[];
};

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
  // Uçarer min-max hesabina girsin mi (Mikro sto_model_kodu). Zorunlu secim, varsayilan true.
  calculateMinMax: boolean;
  // Stok ailesi (coklu) ve fiyat ailesi (tekli) atamalari. Opsiyonel.
  stockFamilyIds: string[];
  priceFamilyId: string | null;
  // Zorunlu urun gorseli (yalniz CREATE) + onizleme URL'i. Drafta serialize edilmez.
  image: File | null;
  imagePreviewUrl: string | null;
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

export const defaultForm = (templateCode = ''): StockForm => ({
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
  calculateMinMax: true,
  stockFamilyIds: [],
  priceFamilyId: null,
  image: null,
  imagePreviewUrl: null,
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
  const [lookupError, setLookupError] = useState('');
  const requestIdRef = useRef(0);

  useEffect(() => {
    setSearch(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const requestId = ++requestIdRef.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setLookupError('');
      try {
        const res = await apiClient.get(`/admin/stock-create/lookups/${type}`, {
          params: { search, limit: 40 },
        });
        if (requestId === requestIdRef.current) setItems(res.data.items || []);
      } catch (error: any) {
        if (requestId === requestIdRef.current) {
          setItems([]);
          setLookupError(error?.response?.data?.error || 'Arama gecici olarak yapilamadi');
        }
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      if (requestId === requestIdRef.current) requestIdRef.current += 1;
    };
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
          {!loading && lookupError && <div className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{lookupError}</div>}
          {!loading && !lookupError && items.length === 0 && <div className="px-3 py-2 text-sm text-slate-500">Sonuc yok</div>}
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
  const searchParams = useSearchParams();
  const { user, loadUserFromStorage } = useAuthStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [nextCode, setNextCode] = useState('');
  const [defaultTemplateCode, setDefaultTemplateCode] = useState('');
  const [unitNames, setUnitNames] = useState<string[]>([]);
  const [form, setForm] = useState<StockForm>(defaultForm());
  const [stockFamilyOptions, setStockFamilyOptions] = useState<FamilyOption[]>([]);
  const [priceFamilyOptions, setPriceFamilyOptions] = useState<FamilyOption[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [historyRows, setHistoryRows] = useState<CreationLog[]>([]);
  const [templateStock, setTemplateStock] = useState<TemplateStock | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [editingStockCode, setEditingStockCode] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  // Pasif stok aktiflestirme modu: ?activate=CODE ile acilir. Formdaki mevcut stok
  // bilgileri yalnizca referans icindir; Mikroda sadece pasiflik durumu degisir.
  const [activateMode, setActivateMode] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const appliedActivateRef = useRef('');
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
    let restoredTemplateCode = '';
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.form) {
          // Draft'ta File yoktur; gorseli her zaman bos yukle. Diger alanlar geri yuklenir.
          const { image: _img, imagePreviewUrl: _prev, ...draftForm } = parsed.form || {};
          const hasMeaningfulDraft = Boolean(
            draftForm.name || draftForm.foreignName || draftForm.supplierCode || draftForm.brandCode ||
            draftForm.categoryCode || draftForm.packageCode || draftForm.currentCost || draftForm.costT ||
            draftForm.costP || draftForm.barcode || draftForm.notes ||
            (Array.isArray(draftForm.stockFamilyIds) && draftForm.stockFamilyIds.length > 0) ||
            draftForm.priceFamilyId
          );
          restoredTemplateCode = hasMeaningfulDraft ? String(draftForm.templateCode || '').trim().toUpperCase() : '';
          setForm({
            ...defaultForm(restoredTemplateCode),
            ...draftForm,
            templateCode: restoredTemplateCode,
            image: null,
            imagePreviewUrl: null,
          });
        }
      } catch {
        // ignore broken local draft
      }
    }
    void loadMetadata(restoredTemplateCode);
    void loadFamilies();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Duzenleme ve aktiflestirme modunda taslak yazma; sadece yeni-stok akisi taslak tutar.
    if (editingStockCode || activateMode) return;
    // File objesini localStorage'a yazamayiz; drafttan haric tutulur.
    const { image: _img, imagePreviewUrl: _prev, ...draftForm } = form;
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ form: draftForm }));
  }, [form, editingStockCode, activateMode]);

  // Sekmedeyken olusturulan onizleme URL'lerini serbest birak (bellek sizintisini onle).
  useEffect(() => {
    return () => {
      if (form.imagePreviewUrl) URL.revokeObjectURL(form.imagePreviewUrl);
    };
  }, [form.imagePreviewUrl]);

  async function loadMetadata(preferredTemplateCode = '', resetFormToTemplate = false) {
    setLoading(true);
    try {
      const [metadataRes, historyRes] = await Promise.all([
        apiClient.get('/admin/stock-create/metadata'),
        apiClient.get('/admin/stock-create/history', { params: { limit: 30 } }),
      ]);
      const latestTemplateCode = String(metadataRes.data.defaultTemplateCode || '').trim().toUpperCase();
      const targetTemplateCode = String(
        preferredTemplateCode || (resetFormToTemplate ? '' : form.templateCode) || latestTemplateCode
      ).trim().toUpperCase();
      setNextCode(metadataRes.data.nextCode || '');
      setDefaultTemplateCode(latestTemplateCode);
      setUnitNames(metadataRes.data.unitNames || []);
      setHistoryRows(historyRes.data.logs || []);
      setForm((prev) => resetFormToTemplate
        ? defaultForm(targetTemplateCode)
        : { ...prev, templateCode: prev.templateCode || targetTemplateCode });
      if (targetTemplateCode) {
        await loadTemplate(targetTemplateCode, true);
      } else {
        setTemplateStock(null);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Stok acma bilgileri alinamadi');
    } finally {
      setLoading(false);
    }
  }

  // Stok ailesi (coklu) ve fiyat ailesi (tekli) atama secenekleri; ekran acilisinda bir kez cekilir.
  const loadFamilies = async () => {
    try {
      const [stockRes, priceRes] = await Promise.all([
        adminApi.getProductFamilies(),
        adminApi.getPriceFamilies(),
      ]);
      const mapFamilies = (list: any[]): FamilyOption[] =>
        (list || []).map((family) => ({
          id: String(family.id),
          name: family.name || family.code || String(family.id),
          code: family.code ?? null,
          members: (family.items || [])
            .filter((it: any) => it && it.active !== false)
            .map((it: any) => ({
              productCode: String(it.productCode || ''),
              productName: String(it.productName || it.productCode || ''),
            })),
        }));
      setStockFamilyOptions(mapFamilies(stockRes?.data));
      setPriceFamilyOptions(mapFamilies(priceRes?.data));
    } catch {
      // Aile atamalari opsiyoneldir; cekilemezse sessizce bos birak (stok acma engellenmez).
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

  async function loadTemplate(templateCode: string, applyDefaults = false) {
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
  }

  const copyFromTemplate = (patch: Partial<StockForm>) => {
    updateForm(patch);
  };

  const updateTemplateCode = (templateCode: string) => {
    appliedTemplateRef.current = '';
    setTemplateStock(null);
    updateForm({ templateCode });
  };

  const updateForm = (patch: Partial<StockForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setPreviewRows([]);
  };

  // Min-max secimi (Evet/Hayir). Onizlemeyi etkilemez, o yuzden preview'i sifirlamiyoruz.
  const setCalculateMinMax = (value: boolean) => {
    setForm((prev) => ({ ...prev, calculateMinMax: value }));
  };

  // Stok ailesi coklu secim toggle. Aile atamalari onizlemeyi etkilemez.
  const toggleStockFamily = (id: string) => {
    setForm((prev) => {
      const exists = prev.stockFamilyIds.includes(id);
      return {
        ...prev,
        stockFamilyIds: exists ? prev.stockFamilyIds.filter((x) => x !== id) : [...prev.stockFamilyIds, id],
      };
    });
  };

  // Fiyat ailesi tekli secim (bir urun yalniz bir fiyat ailesinde olabilir).
  const setPriceFamily = (id: string | null) => {
    setForm((prev) => ({ ...prev, priceFamilyId: id }));
  };

  // Zorunlu urun gorseli secimi + istemci tarafi dogrulama (image/*, < 5MB) + onizleme.
  const setImageFile = (file: File | null) => {
    setForm((prev) => {
      if (prev.imagePreviewUrl) URL.revokeObjectURL(prev.imagePreviewUrl);
      if (!file) return { ...prev, image: null, imagePreviewUrl: null };
      return { ...prev, image: file, imagePreviewUrl: URL.createObjectURL(file) };
    });
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Lutfen sadece resim dosyasi yukleyin');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Dosya boyutu 5MB altinda olmali');
      return;
    }
    setImageFile(file);
  };

  const clearImage = () => setImageFile(null);

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
    setActivateMode(null);
    appliedActivateRef.current = '';
    setTemplateStock(null);
    appliedTemplateRef.current = '';
    setImageFile(null);
    setForm(defaultForm(defaultTemplateCode));
    if (defaultTemplateCode) void loadTemplate(defaultTemplateCode, true);
    setPreviewRows([]);
  };

  const loadStockForEdit = async (stockCode?: string | null) => {
    const code = String(stockCode || '').trim().toUpperCase();
    if (!code) return;
    setEditLoading(true);
    try {
      const res = await apiClient.get(`/admin/stock-create/stocks/${encodeURIComponent(code)}`);
      const normalized = normalizeTemplateStock(res.data.stock);
      setEditingStockCode(code);
      // Duzenlemeye gecerken aktiflestirme modundan cik (ayni anda iki mod olmaz).
      setActivateMode(null);
      setTemplateStock(null);
      appliedTemplateRef.current = code;
      // Duzenlemede gorsel opsiyoneldir; her zaman bos baslar. calculateMinMax backend'ten gelirse alinir, gelmezse true.
      setForm({
        ...defaultForm(code),
        ...normalized,
        templateCode: code,
        calculateMinMax: typeof (res.data.stock as any)?.calculateMinMax === 'boolean' ? (res.data.stock as any).calculateMinMax : true,
        image: null,
        imagePreviewUrl: null,
      });
      setPreviewRows([]);
      toast.success(`${code} duzenleme moduna alindi`);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Stok bilgisi alinamadi');
    } finally {
      setEditLoading(false);
    }
  };

  // Pasif stogu aktiflestirme moduna al: mevcut kart salt-okunur ozet icin yuklenir.
  const loadStockForActivate = async (stockCode?: string | null) => {
    const code = String(stockCode || '').trim().toUpperCase();
    if (!code) return;
    setEditLoading(true);
    try {
      const res = await apiClient.get(`/admin/stock-create/stocks/${encodeURIComponent(code)}`);
      const normalized = normalizeTemplateStock(res.data.stock);
      setEditingStockCode(null);
      setActivateMode(code);
      setTemplateStock(null);
      appliedTemplateRef.current = code;
      // Aktivasyon stok karti alanlarini yazmaz; gorsel de kullanilmaz.
      setForm({
        ...defaultForm(code),
        ...normalized,
        templateCode: code,
        calculateMinMax: typeof (res.data.stock as any)?.calculateMinMax === 'boolean' ? (res.data.stock as any).calculateMinMax : true,
        image: null,
        imagePreviewUrl: null,
      });
      setPreviewRows([]);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Pasif stok bilgisi alinamadi');
    } finally {
      setEditLoading(false);
    }
  };

  // ?activate=CODE query paramini oku ve pasif stogu bir kez prefill et.
  useEffect(() => {
    if (user === null || permissionsLoading) return;
    const code = (searchParams?.get('activate') || '').trim().toUpperCase();
    if (!code) return;
    if (appliedActivateRef.current === code) return;
    appliedActivateRef.current = code;
    void loadStockForActivate(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user, permissionsLoading]);

  const hasErrors = previewRows.some((row) => row.status === 'error');
  const hasWarnings = previewRows.some((row) => row.status === 'warning');

  // Onizleme/olusturma'ya gonderilen tekil item: form alanlari + calculateMinMax.
  // image/imagePreviewUrl ile aile alanlari item icinde YER ALMAZ (aile bilgisi payload ust seviyesinde gider).
  const buildItem = () => {
    const { image, imagePreviewUrl, stockFamilyIds, priceFamilyId, ...rest } = form;
    return { ...rest };
  };

  const preview = async () => {
    setLoading(true);
    try {
      const payload = activateMode
        ? { mode: 'activate', stockCode: activateMode }
        : { items: [buildItem()] };
      const res = await apiClient.post('/admin/stock-create/preview', payload);
      setPreviewRows(res.data.results || []);
      const summary = res.data.summary;
      if (summary?.error > 0) toast.error(`${summary.error} satir hatali`);
      else if (summary?.warning > 0) toast(`${summary.warning} satir uyarili, yine de kaydedilebilir`);
      else toast.success('Kayda hazir');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'On kontrol yapilamadi');
    } finally {
      setLoading(false);
    }
  };

  const createStocks = async () => {
    if (!previewRows.length) {
      toast.error('Once on kontrol calistirin');
      return;
    }
    if (hasErrors) {
      toast.error('Hatali satirlar varken Mikroya yazilamaz');
      return;
    }
    // Gorsel ZORUNLU: gorselsiz stok acilmaz.
    if (!form.image) {
      toast.error('Urun gorseli zorunlu. Devam etmeden once gorsel secin.');
      return;
    }
    // Min-max secimi her zaman true/false olmali (undefined/null kabul edilmez).
    if (form.calculateMinMax !== true && form.calculateMinMax !== false) {
      toast.error('Min-max hesaplansin mi secimini yapin (Evet/Hayir).');
      return;
    }
    const confirmed = window.confirm(`Stok karti Mikroda olusturulacak.${hasWarnings ? '\n\nUyarili alanlar var; devam etmek istiyor musunuz?' : ''}`);
    if (!confirmed) return;

    setCreating(true);
    try {
      const formData = new FormData();
      formData.append('image', form.image);
      formData.append(
        'payload',
        JSON.stringify({
          item: buildItem(),
          stockFamilyIds: form.stockFamilyIds,
          priceFamilyId: form.priceFamilyId,
        })
      );
      const res = await adminApi.createStock(formData);
      if (res.warnings?.length) {
        // Aile/gorsel kismi hatalari olumcul degildir; kullaniciya bilgi olarak goster.
        res.warnings.forEach((warning) => toast(warning, { duration: 7000 }));
      }
      toast.success(res.stockCode ? `${res.stockCode} stok karti olusturuldu` : 'Stok karti olusturuldu');
      setPreviewRows([]);
      setImageFile(null);
      await loadMetadata(String(res.stockCode || ''), true);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Stok karti olusturulamadi');
    } finally {
      setCreating(false);
    }
  };

  // Pasif stok aktiflestirme: yeni kart acmaz ve mevcut kart alanlarini guncellemez;
  // backend'e yalnizca hedef stok kodu gider.
  const activateStock = async () => {
    if (!activateMode) return;
    if (!previewRows.length) {
      toast.error('Once on kontrol calistirin');
      return;
    }
    if (hasErrors) {
      toast.error('Hatali satirlar varken aktiflestirilemez');
      return;
    }
    const confirmed = window.confirm(
      `${activateMode} kodlu mevcut stok Mikroda aktif hale getirilecek.\n\n` +
      'Yalnizca pasiflik durumu degisecek; ad, fiyat, maliyet, birim, barkod ve diger stok bilgileri degismeyecek.'
    );
    if (!confirmed) return;

    setActivating(true);
    try {
      const res = await adminApi.activateStock(activateMode);
      if (res.warnings?.length) {
        res.warnings.forEach((warning) => toast(warning, { duration: 7000 }));
      }
      toast.success(res.stockCode ? `${res.stockCode} stok karti aktiflestirildi` : 'Stok karti aktiflestirildi');
      setPreviewRows([]);
      setImageFile(null);
      router.push('/passive-stocks');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Stok karti aktiflestirilemedi');
    } finally {
      setActivating(false);
    }
  };

  const updateExistingStock = async () => {
    if (!editingStockCode) return;
    const confirmed = window.confirm(`${editingStockCode} stok karti Mikroda guncellenecek. Devam edilsin mi?`);
    if (!confirmed) return;

    setUpdating(true);
    try {
      // Guncellemede gorsel/aile alanlari yer almaz; item + calculateMinMax gonderilir.
      const res = await apiClient.put(`/admin/stock-create/stocks/${encodeURIComponent(editingStockCode)}`, buildItem());
      const normalized = normalizeTemplateStock(res.data.stock);
      setForm({
        ...defaultForm(editingStockCode),
        ...normalized,
        templateCode: editingStockCode,
        calculateMinMax: typeof (res.data.stock as any)?.calculateMinMax === 'boolean' ? (res.data.stock as any).calculateMinMax : form.calculateMinMax,
        image: null,
        imagePreviewUrl: null,
      });
      setPreviewRows([]);
      await loadMetadata();
      toast.success(`${editingStockCode} guncellendi`);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Stok karti guncellenemedi');
    } finally {
      setUpdating(false);
    }
  };

  return {
    // router / auth / izin
    router,
    user,
    permissionsLoading,
    // kod / sablon
    nextCode,
    defaultTemplateCode,
    unitNames,
    // form / onizleme / gecmis
    form,
    previewRows,
    historyRows,
    templateStock,
    templateLoading,
    // aile secenekleri
    stockFamilyOptions,
    priceFamilyOptions,
    // duzenleme / yuklenme durumlari
    editingStockCode,
    editLoading,
    updating,
    loading,
    creating,
    // pasif stok aktiflestirme
    activateMode,
    activating,
    // turetilmis
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
    setCalculateMinMax,
    toggleStockFamily,
    setPriceFamily,
    handleImageChange,
    clearImage,
    cancelEditMode,
    loadStockForEdit,
    loadStockForActivate,
    preview,
    createStocks,
    activateStock,
    updateExistingStock,
    setPreviewRows,
  };
}

export default useStokAcma;
