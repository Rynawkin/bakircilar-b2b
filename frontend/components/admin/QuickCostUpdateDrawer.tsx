'use client';

import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeDollarSign,
  CheckCircle2,
  Loader2,
  PackageSearch,
  Search,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { usePermissions } from '@/hooks/usePermissions';
import { getPriceListVerificationError } from '@/lib/utils/costPriceUpdate';
import {
  INVOICED_PRICE_LISTS,
  RETAIL_PRICE_LISTS,
} from '@/lib/utils/priceLists';
import { formatCurrency } from '@/lib/utils/format';

type PriceListMap = Record<string | number, number>;

type QuickCostProduct = {
  id?: string | null;
  mikroCode: string;
  name: string;
  unit?: string | null;
  totalStock?: number | null;
  currentCost?: number | null;
  currentCostDate?: string | null;
  lastEntryPrice?: number | null;
  lastEntryDate?: string | null;
  vatRate?: number | null;
  mikroPriceLists?: PriceListMap | null;
  mainSupplierCode?: string | null;
  mainSupplierName?: string | null;
  category?: {
    id?: string | null;
    mikroCode?: string | null;
    name?: string | null;
  } | null;
};

type PendingUpdate = {
  costP: number;
  costT: number;
  oldCost: number;
  updatePriceLists: boolean;
};

type UpdateReceipt = {
  productCode: string;
  currentCost: number;
  verifiedListCount: number;
  priceListsUpdated: boolean;
  updatedAt: string;
};

const normalizeProduct = (value: any): QuickCostProduct => ({
  ...value,
  mikroCode: String(value?.mikroCode || '').trim().toUpperCase(),
  name: String(value?.name || value?.mikroCode || '').trim(),
});

const parseCost = (value: string) => Number(String(value || '').replace(',', '.'));

const formatDate = (value: unknown) => {
  if (!value) return '-';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('tr-TR');
};

const formatNumber = (value: unknown) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toLocaleString('tr-TR') : '-';
};

const formatPercent = (value: number) =>
  `%${value.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const getApiError = (error: any, fallback: string) =>
  error?.response?.data?.error || error?.message || fallback;

const inputClass =
  'h-11 w-full rounded-xl border border-[#d8e0ec] bg-white px-3 text-right text-[14px] font-semibold text-[#14223b] outline-none transition focus:border-[#15356b] focus:ring-2 focus:ring-[#dce6f5]';

export function QuickCostUpdateDrawer() {
  const { hasPermission, loading: permissionsLoading, role } = usePermissions();
  const allowedRole = role === 'HEAD_ADMIN' || role === 'ADMIN' || role === 'MANAGER';
  const allowed =
    allowedRole && hasPermission('reports:cost-update-all-products');

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<QuickCostProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selected, setSelected] = useState<QuickCostProduct | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailVerified, setDetailVerified] = useState(false);
  const [costPInput, setCostPInput] = useState('');
  const [costTInput, setCostTInput] = useState('');
  const [manualCostPOverride, setManualCostPOverride] = useState(false);
  const [updatePriceLists, setUpdatePriceLists] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate | null>(null);
  const [receipt, setReceipt] = useState<UpdateReceipt | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const detailRequestRef = useRef(0);
  const updateButtonRef = useRef<HTMLButtonElement>(null);
  const confirmCancelRef = useRef<HTMLButtonElement>(null);
  const confirmSubmitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || selected) return;
    const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, selected]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (pendingUpdate) {
        setPendingUpdate(null);
        return;
      }
      setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, pendingUpdate]);

  useEffect(() => {
    if (!pendingUpdate) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => confirmCancelRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      previousFocus?.focus();
    };
  }, [pendingUpdate]);

  useEffect(() => {
    if (!open || selected) return;
    const term = search.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      setSearchError('');
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError('');
      try {
        const response = await adminApi.getProducts({
          search: term,
          page: 1,
          limit: 20,
          sortBy: 'name',
          sortOrder: 'asc',
        });
        if (!active) return;
        setResults(
          (response.products || [])
            .map(normalizeProduct)
            .filter((product: QuickCostProduct) => Boolean(product.mikroCode))
        );
      } catch (error) {
        if (!active) return;
        setResults([]);
        setSearchError(getApiError(error, 'Ürün araması yapılamadı.'));
      } finally {
        if (active) setSearching(false);
      }
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, search, selected]);

  const vatPercent = useMemo(() => {
    const raw = Number(selected?.vatRate ?? 0);
    if (!Number.isFinite(raw)) return 0;
    return raw <= 1 ? raw * 100 : raw;
  }, [selected?.vatRate]);

  const resetEntry = () => {
    setDetailVerified(false);
    setCostPInput('');
    setCostTInput('');
    setManualCostPOverride(false);
    setUpdatePriceLists(true);
    setPendingUpdate(null);
    setReceipt(null);
  };

  const chooseProduct = async (product: QuickCostProduct) => {
    const productCode = product.mikroCode;
    const requestId = ++detailRequestRef.current;
    resetEntry();
    setSelected(product);
    setDetailLoading(true);
    try {
      const response = await adminApi.getProductsByCodes([productCode]);
      if (requestId !== detailRequestRef.current) return;
      const detail = (response.products || []).find(
        (candidate) =>
          String(candidate?.mikroCode || '').trim().toUpperCase() === productCode
      );
      if (!detail) throw new Error('Ürün detayları doğrulanamadı.');
      setSelected((current) =>
        current?.mikroCode === productCode ? normalizeProduct(detail) : current
      );
      setDetailVerified(true);
    } catch (error) {
      if (requestId !== detailRequestRef.current) return;
      toast.error(getApiError(error, 'Ürün detayları alınamadı.'));
      setSelected((current) =>
        current?.mikroCode === productCode ? null : current
      );
      setDetailVerified(false);
    } finally {
      if (requestId === detailRequestRef.current) setDetailLoading(false);
    }
  };

  const returnToSearch = () => {
    if (updating) return;
    detailRequestRef.current += 1;
    setDetailLoading(false);
    setSelected(null);
    resetEntry();
    setSearch('');
    setResults([]);
    setSearchError('');
  };

  const updateSelectedFromResult = (
    productCode: string,
    currentCost: number,
    updatedLists: Array<{ listNo: number; actualValue: number; value: number }>
  ) => {
    setSelected((current) => {
      if (!current || current.mikroCode !== productCode) return current;
      const nextLists: PriceListMap = { ...(current.mikroPriceLists || {}) };
      updatedLists.forEach((row) => {
        const listNo = Number(row.listNo);
        const actualValue = Number(row.actualValue ?? row.value ?? 0);
        if (Number.isFinite(listNo) && Number.isFinite(actualValue)) {
          nextLists[listNo] = actualValue;
        }
      });
      return {
        ...current,
        currentCost,
        currentCostDate: new Date().toISOString(),
        mikroPriceLists: nextLists,
      };
    });
  };

  const executeUpdate = async (payload: PendingUpdate) => {
    if (!selected || !detailVerified || updating) return;
    const productCode = selected.mikroCode;
    setUpdating(true);
    setReceipt(null);
    try {
      const response = await adminApi.quickUpdateProductCost({
        productCode,
        costP: payload.costP,
        costT: payload.costT,
        updatePriceLists: payload.updatePriceLists,
      });
      const verificationError = getPriceListVerificationError(
        response.data,
        payload.updatePriceLists
      );
      if (verificationError) throw new Error(verificationError);

      const nextCost = Number(response.data.currentCost ?? payload.costP);
      updateSelectedFromResult(
        productCode,
        nextCost,
        response.data.updatedLists || []
      );
      setReceipt({
        productCode,
        currentCost: nextCost,
        verifiedListCount: Number(response.data.verifiedListCount || 0),
        priceListsUpdated: Boolean(response.data.priceListsUpdated),
        updatedAt: new Date().toISOString(),
      });
      if (payload.updatePriceLists) {
        toast.success('Maliyet ve 12 ana fiyat listesi doğrulanarak güncellendi.');
      } else {
        toast.success('Güncel maliyet güncellendi.');
      }
    } catch (error) {
      toast.error(getApiError(error, 'Güncelleme başarısız.'));
    } finally {
      setUpdating(false);
      window.requestAnimationFrame(() => updateButtonRef.current?.focus());
    }
  };

  const requestUpdate = async () => {
    if (!selected || updating) return;
    if (!detailVerified) {
      toast.error('Ürün detayları doğrulanmadan güncelleme yapılamaz.');
      return;
    }
    const costP = parseCost(costPInput);
    const costT = parseCost(costTInput);
    if (!Number.isFinite(costP) || costP <= 0) {
      toast.error('Geçerli bir Maliyet P girin.');
      return;
    }
    if (!Number.isFinite(costT) || costT <= 0) {
      toast.error('Geçerli bir Maliyet T girin.');
      return;
    }

    const next: PendingUpdate = {
      costP,
      costT,
      oldCost: Number(selected.currentCost ?? 0),
      updatePriceLists,
    };
    if (updatePriceLists) {
      setPendingUpdate(next);
      return;
    }
    await executeUpdate(next);
  };

  const handleConfirmKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>
  ) => {
    if (event.key !== 'Tab') return;
    const first = confirmCancelRef.current;
    const last = confirmSubmitRef.current;
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (permissionsLoading || !allowed) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-0 top-[46%] z-[60] flex -translate-y-1/2 flex-col items-center gap-1 rounded-l-xl border border-r-0 border-[#c7d5e9] bg-[#15356b] px-2 py-3 text-white shadow-lg transition hover:bg-[#1e467f] focus:outline-none focus:ring-2 focus:ring-[#15356b]/30"
          aria-label="Hızlı fiyat güncelleme panelini aç"
        >
          <BadgeDollarSign className="h-5 w-5" />
          <span className="hidden text-[11px] font-semibold leading-none sm:[writing-mode:vertical-rl] sm:block sm:rotate-180">
            Hızlı Fiyat
          </span>
        </button>
      )}

      {open && (
        <aside
          role="dialog"
          aria-label="Hızlı fiyat güncelleme"
          className="fixed inset-y-0 right-0 z-[80] flex w-full max-w-[500px] flex-col border-l border-[#dfe5ef] bg-[#f7f9fc] shadow-2xl"
        >
          <div className="flex items-center justify-between bg-gradient-to-r from-[#15356b] to-[#1e467f] px-4 py-3 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                <BadgeDollarSign className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold leading-tight">Hızlı Fiyat Güncelle</h2>
                <p className="text-[11px] text-blue-100">Sayfadan ayrılmadan maliyet ve fiyat listeleri</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-2 transition hover:bg-white/15"
              aria-label="Paneli kapat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {!selected ? (
            <div className="flex min-h-0 flex-1 flex-col p-4">
              <label htmlFor="quick-cost-product-search" className="mb-2 text-[12px] font-semibold text-[#51607a]">
                Ürün adı veya kodu
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b97ac]" />
                <input
                  ref={searchInputRef}
                  id="quick-cost-product-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-11 w-full rounded-xl border border-[#d8e0ec] bg-white pl-10 pr-10 text-[14px] text-[#14223b] outline-none transition placeholder:text-[#9aa5b6] focus:border-[#15356b] focus:ring-2 focus:ring-[#dce6f5]"
                  placeholder="En az 2 karakter yazın..."
                  autoComplete="off"
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#15356b]" />
                )}
              </div>

              <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
                {searchError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
                    {searchError}
                  </div>
                )}

                {!searchError && search.trim().length < 2 && (
                  <div className="flex h-full min-h-[260px] flex-col items-center justify-center px-8 text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e9eef7] text-[#15356b]">
                      <PackageSearch className="h-6 w-6" />
                    </div>
                    <p className="text-[14px] font-semibold text-[#14223b]">Güncellenecek ürünü bulun</p>
                    <p className="mt-1 text-[12px] leading-5 text-[#6b7890]">
                      Ürün adının veya stok kodunun en az iki karakterini yazın.
                    </p>
                  </div>
                )}

                {!searching &&
                  !searchError &&
                  search.trim().length >= 2 &&
                  results.length === 0 && (
                    <div className="rounded-xl border border-[#dfe5ef] bg-white p-6 text-center text-[13px] text-[#6b7890]">
                      Eşleşen ürün bulunamadı.
                    </div>
                  )}

                {results.length > 0 && (
                  <div className="space-y-2">
                    {results.map((product) => (
                      <button
                        key={product.mikroCode}
                        type="button"
                        onClick={() => void chooseProduct(product)}
                        className="w-full rounded-xl border border-[#dfe5ef] bg-white p-3 text-left transition hover:border-[#aebed6] hover:bg-[#f9fbff] focus:outline-none focus:ring-2 focus:ring-[#dce6f5]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-[#14223b]">{product.name}</p>
                            <p className="mt-1 font-mono text-[11px] text-[#6b7890]">{product.mikroCode}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[11px] text-[#8b97ac]">Güncel maliyet</p>
                            <p className="mt-0.5 text-[12px] font-semibold text-[#15356b]">
                              {formatCurrency(Number(product.currentCost ?? 0))}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <button
                type="button"
                onClick={returnToSearch}
                disabled={updating}
                className="mb-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-[#15356b] transition hover:bg-[#e9eef7] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Başka ürün ara
              </button>

              <div className="rounded-2xl border border-[#dfe5ef] bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold leading-5 text-[#14223b]">{selected.name}</p>
                    <p className="mt-1 font-mono text-[11px] text-[#6b7890]">{selected.mikroCode}</p>
                    <p className="mt-1 text-[11px] text-[#8b97ac]">
                      {selected.category?.name || 'Kategori yok'} · {selected.unit || 'Birim yok'}
                    </p>
                  </div>
                  {detailLoading && <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#15356b]" />}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-[#f4f6fa] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8b97ac]">Güncel maliyet</p>
                    <p className="mt-1 text-[14px] font-bold text-[#14223b]">
                      {formatCurrency(Number(selected.currentCost ?? 0))}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[#8b97ac]">{formatDate(selected.currentCostDate)}</p>
                  </div>
                  <div className="rounded-xl bg-[#f4f6fa] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8b97ac]">Son giriş maliyeti</p>
                    <p className="mt-1 text-[14px] font-bold text-[#14223b]">
                      {formatCurrency(Number(selected.lastEntryPrice ?? 0))}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[#8b97ac]">{formatDate(selected.lastEntryDate)}</p>
                  </div>
                  <div className="rounded-xl bg-[#f4f6fa] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8b97ac]">Ana sağlayıcı</p>
                    <p className="mt-1 truncate text-[12px] font-semibold text-[#14223b]">
                      {selected.mainSupplierCode || '-'}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-[#8b97ac]">
                      {selected.mainSupplierName || 'Tanımlı değil'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#f4f6fa] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8b97ac]">Stok / KDV</p>
                    <p className="mt-1 text-[12px] font-semibold text-[#14223b]">
                      {formatNumber(selected.totalStock)} {selected.unit || ''}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[#8b97ac]">KDV %{formatNumber(vatPercent)}</p>
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-[#dfe5ef] bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-[13px] font-semibold text-[#14223b]">Yeni maliyetler</h3>
                    <p className="mt-0.5 text-[11px] text-[#8b97ac]">Mevcut ekranlardaki T / P akışıyla aynıdır.</p>
                  </div>
                  <span className="rounded-full bg-[#eef2fa] px-2 py-1 text-[10px] font-semibold text-[#15356b]">
                    KDV %{formatNumber(vatPercent)}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-semibold text-[#51607a]">Maliyet T</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      disabled={detailLoading || updating || !detailVerified}
                      value={costPInput}
                      onChange={(event) => {
                        const rawValue = event.target.value;
                        setCostPInput(rawValue);
                        setReceipt(null);
                        if (manualCostPOverride) return;
                        const parsed = parseCost(rawValue);
                        if (!Number.isFinite(parsed)) return;
                        const autoCostP = parsed * (1 + vatPercent / 200);
                        setCostTInput(
                          Number.isFinite(autoCostP)
                            ? autoCostP.toFixed(4).replace(/\.?0+$/, '')
                            : costTInput
                        );
                      }}
                      className={`${inputClass} disabled:cursor-not-allowed disabled:bg-[#f4f6fa] disabled:opacity-60`}
                      placeholder="T"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-semibold text-[#51607a]">Maliyet P</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      disabled={detailLoading || updating || !detailVerified}
                      value={costTInput}
                      onChange={(event) => {
                        setManualCostPOverride(true);
                        setCostTInput(event.target.value);
                        setReceipt(null);
                      }}
                      className={`${inputClass} disabled:cursor-not-allowed disabled:bg-[#f4f6fa] disabled:opacity-60`}
                      placeholder="P"
                    />
                  </label>
                </div>

                <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-xl border border-[#dfe5ef] bg-[#f9fbff] px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={updatePriceLists}
                    disabled={detailLoading || updating || !detailVerified}
                    onChange={(event) => {
                      setUpdatePriceLists(event.target.checked);
                      setReceipt(null);
                    }}
                    className="h-4 w-4 accent-[#15356b] disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <span className="text-[12px] font-semibold text-[#51607a]">12 standart listeyi güncelle</span>
                </label>

                <button
                  ref={updateButtonRef}
                  type="button"
                  onClick={() => void requestUpdate()}
                  disabled={updating || detailLoading || !detailVerified}
                  className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#15356b] px-4 text-[13px] font-semibold text-white transition hover:bg-[#1e467f] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {updating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Güncelleniyor...
                    </>
                  ) : (
                    <>
                      <BadgeDollarSign className="h-4 w-4" />
                      Güncelle
                    </>
                  )}
                </button>
              </div>

              {receipt && receipt.productCode === selected.mikroCode && (
                <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                    <div>
                      <p className="text-[13px] font-semibold text-emerald-900">Güncelleme tamamlandı</p>
                      <p className="mt-1 text-[11px] leading-5 text-emerald-800">
                        Yeni maliyet {formatCurrency(receipt.currentCost)}.
                        {receipt.priceListsUpdated
                          ? ` ${receipt.verifiedListCount}/12 standart liste doğrulandı.`
                          : ' Fiyat listeleri değiştirilmedi.'}
                      </p>
                      <p className="mt-0.5 text-[10px] text-emerald-700">{new Date(receipt.updatedAt).toLocaleString('tr-TR')}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-3 rounded-2xl border border-[#dfe5ef] bg-white p-4 shadow-sm">
                <h3 className="text-[12px] font-semibold text-[#14223b]">Mevcut standart fiyatlar</h3>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <PriceListGroup title="Perakende" lists={RETAIL_PRICE_LISTS} prices={selected.mikroPriceLists} />
                  <PriceListGroup title="Faturalı" lists={INVOICED_PRICE_LISTS} prices={selected.mikroPriceLists} />
                </div>
              </div>
            </div>
          )}
        </aside>
      )}

      {pendingUpdate && selected && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-cost-confirm-title"
          onKeyDown={handleConfirmKeyDown}
        >
          <div className="w-full max-w-[460px] rounded-2xl border border-[#dfe5ef] bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 id="quick-cost-confirm-title" className="text-[16px] font-semibold text-[#14223b]">Maliyet Artış Onayı</h3>
                <p className="mt-1 text-[12px] text-[#6b7890]">{selected.name}</p>
                <p className="mt-0.5 font-mono text-[10px] text-[#8b97ac]">{selected.mikroCode}</p>
              </div>
            </div>

            <div className="mt-4 space-y-2 rounded-xl bg-[#f4f6fa] p-3 text-[13px]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#6b7890]">Eski maliyet</span>
                <strong className="text-[#14223b]">{formatCurrency(pendingUpdate.oldCost)}</strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#6b7890]">Yeni maliyet</span>
                <strong className="text-[#14223b]">{formatCurrency(pendingUpdate.costP)}</strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#6b7890]">Değişim</span>
                <strong
                  className={
                    pendingUpdate.oldCost <= 0
                      ? 'text-[#8b97ac]'
                      : pendingUpdate.costP >= pendingUpdate.oldCost
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                  }
                >
                  {pendingUpdate.oldCost > 0
                    ? formatPercent(
                        ((pendingUpdate.costP - pendingUpdate.oldCost) /
                          pendingUpdate.oldCost) *
                          100
                      )
                    : 'Hesaplanamadı'}
                </strong>
              </div>
            </div>

            <p className="mt-3 text-[12px] leading-5 text-[#6b7890]">
              12 ana fiyat listesi de bu maliyete göre güncellenecek.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                ref={confirmCancelRef}
                type="button"
                onClick={() => setPendingUpdate(null)}
                className="h-10 rounded-xl border border-[#d8e0ec] bg-white px-4 text-[12px] font-semibold text-[#51607a] transition hover:bg-[#f4f6fa]"
              >
                Vazgeç
              </button>
              <button
                ref={confirmSubmitRef}
                type="button"
                onClick={() => {
                  const payload = pendingUpdate;
                  setPendingUpdate(null);
                  void executeUpdate(payload);
                }}
                disabled={updating}
                className="h-10 rounded-xl bg-[#15356b] px-4 text-[12px] font-semibold text-white transition hover:bg-[#1e467f] disabled:opacity-60"
              >
                Onayla ve Güncelle
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PriceListGroup({
  title,
  lists,
  prices,
}: {
  title: string;
  lists: ReadonlyArray<{ listNo: number; tier: number }>;
  prices?: PriceListMap | null;
}) {
  return (
    <div className="rounded-xl bg-[#f4f6fa] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8b97ac]">{title}</p>
      <div className="mt-2 space-y-1.5">
        {lists.map((list) => (
          <div key={list.listNo} className="flex items-center justify-between gap-2 text-[10.5px]">
            <span className="text-[#6b7890]">
              {list.tier} <span className="text-[#a0aabb]">(L{list.listNo})</span>
            </span>
            <strong className="text-[#14223b]">
              {formatCurrency(Number(prices?.[list.listNo] ?? 0))}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}
