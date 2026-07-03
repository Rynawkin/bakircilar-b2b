'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  adminApi,
  type MinMaxV2Override,
  type MinMaxV2PreviewResult,
  type MinMaxV2PreviewRow,
  type MinMaxV2Settings,
} from '@/lib/api/admin';

/**
 * Min-Max v2 paneli (B2B hesap motoru).
 *
 * Mevcut 'MinMax Calistir' (Mikro SP) butonuna dokunmaz; paralel calisan onizleme/kiyas
 * motorudur. Mikro'ya yazma SADECE kullanicinin secip onayladigi satirlar icin yapilir.
 * Hem klasik hem yeni gorunumden `<MinMaxV2Panel depot={depot} />` olarak kullanilir;
 * tum state kendi icindedir.
 */

type DepotType = 'MERKEZ' | 'TOPCA';
type PanelTab = 'preview' | 'rules';
type SortMode = 'diffPctDesc' | 'diffPctAsc' | 'code';

const SOURCE_LABELS: Record<MinMaxV2PreviewRow['overrideSource'], string> = {
  urun: 'Urun kurali',
  tedarikci: 'Tedarikci kurali',
  varsayilan: 'Varsayilan',
  haric: 'Haric',
  SIPARIS: 'Siparis-bazli',
};

const SOURCE_BADGE_CLASS: Record<MinMaxV2PreviewRow['overrideSource'], string> = {
  urun: 'bg-blue-100 text-blue-800',
  tedarikci: 'bg-purple-100 text-purple-800',
  varsayilan: 'bg-gray-100 text-gray-700',
  haric: 'bg-amber-100 text-amber-800',
  SIPARIS: 'bg-violet-100 text-violet-800',
};

const getErrorMessage = (error: any, fallback: string): string =>
  error?.response?.data?.error || error?.response?.data?.message || error?.message || fallback;

// Fark yuzdesi: mevcut max 0 iken yeni max > 0 ise sonsuz kabul edilir (siralamada en uste gelir)
const diffPercent = (row: MinMaxV2PreviewRow): number => {
  if (row.newMax === null) return 0;
  const diff = row.newMax - row.currentMax;
  if (row.currentMax > 0) return (diff / row.currentMax) * 100;
  return diff > 0 ? Number.POSITIVE_INFINITY : 0;
};

const formatNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return value.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
};

const formatShortDate = (value: string | null | undefined): string => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('tr-TR');
};

const formatDiff = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) return '-';
  if (value === 0) return '0';
  return `${value > 0 ? '+' : ''}${value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;
};

// Artis = daha cok stok baglama (kirmizi), azalis = stok cozulme (yesil)
const diffClass = (value: number | null): string => {
  if (value === null || value === 0) return 'text-gray-500';
  return value > 0 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold';
};

export default function MinMaxV2Panel({ depot: depotProp }: { depot: DepotType }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PanelTab>('preview');
  const [depot, setDepot] = useState<DepotType>(depotProp);

  // Varsayilan parametreler
  const [settings, setSettings] = useState<MinMaxV2Settings | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<{ lookbackDays: string; minDays: string; maxDays: string; salesScope: 'DEPOT' | 'COMPANY' }>({
    lookbackDays: '90',
    minDays: '15',
    maxDays: '45',
    salesScope: 'DEPOT',
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // Onizleme
  const [preview, setPreview] = useState<MinMaxV2PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [onlyChanged, setOnlyChanged] = useState(true);
  const [onlyMissingRecord, setOnlyMissingRecord] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('diffPctDesc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(300);

  // Uygulama (Mikro'ya yazma)
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Sicilsiz (STOK_DEPO_DETAYLARI kaydi olmayan) satirlar icin INSERT izni — her onay modalinda default KAPALI
  const [allowInsertMissing, setAllowInsertMissing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{
    updatedCount: number;
    skipped: Array<{ productCode: string; reason: string }>;
    inserted: string[];
  } | null>(null);

  // Kurallar
  const [overrides, setOverrides] = useState<MinMaxV2Override[]>([]);
  const [overridesLoading, setOverridesLoading] = useState(false);
  const [deletingOverrideId, setDeletingOverrideId] = useState<string | null>(null);
  const [ruleDraft, setRuleDraft] = useState<{
    scopeType: 'PRODUCT' | 'SUPPLIER';
    code: string;
    depot: '' | DepotType;
    lookbackDays: string;
    minDays: string;
    maxDays: string;
    note: string;
  }>({ scopeType: 'PRODUCT', code: '', depot: '', lookbackDays: '', minDays: '', maxDays: '', note: '' });
  const [creatingRule, setCreatingRule] = useState(false);

  useEffect(() => {
    setDepot(depotProp);
  }, [depotProp]);

  const loadSettings = async () => {
    try {
      const response = await adminApi.getMinMaxV2Settings();
      const data = response.data;
      setSettings(data);
      setSettingsDraft({
        lookbackDays: String(data.lookbackDays),
        minDays: String(data.minDays),
        maxDays: String(data.maxDays),
        salesScope: data.salesScope,
      });
    } catch (error: any) {
      toast.error(getErrorMessage(error, 'Min-Max v2 ayarlari yuklenemedi'));
    }
  };

  const loadOverrides = async () => {
    setOverridesLoading(true);
    try {
      const response = await adminApi.getMinMaxV2Overrides();
      setOverrides(response.data?.rows || []);
    } catch (error: any) {
      toast.error(getErrorMessage(error, 'Kurallar yuklenemedi'));
    } finally {
      setOverridesLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    loadSettings();
    loadOverrides();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const response = await adminApi.updateMinMaxV2Settings({
        lookbackDays: Number(settingsDraft.lookbackDays),
        minDays: Number(settingsDraft.minDays),
        maxDays: Number(settingsDraft.maxDays),
        salesScope: settingsDraft.salesScope,
      });
      setSettings(response.data);
      setSettingsDraft({
        lookbackDays: String(response.data.lookbackDays),
        minDays: String(response.data.minDays),
        maxDays: String(response.data.maxDays),
        salesScope: response.data.salesScope,
      });
      toast.success('Varsayilan parametreler kaydedildi. Yeni degerlerle tekrar onizleme alin.');
    } catch (error: any) {
      toast.error(getErrorMessage(error, 'Ayarlar kaydedilemedi'));
    } finally {
      setSavingSettings(false);
    }
  };

  const runPreview = async () => {
    setPreviewLoading(true);
    setApplyResult(null);
    setSelected(new Set());
    setVisibleCount(300);
    try {
      const response = await adminApi.getMinMaxV2Preview(depot);
      setPreview(response.data);
      toast.success(`Onizleme hazir: ${response.data.total.toLocaleString('tr-TR')} urun`);
    } catch (error: any) {
      toast.error(getErrorMessage(error, 'Onizleme alinamadi'));
    } finally {
      setPreviewLoading(false);
    }
  };

  const filteredRows = useMemo(() => {
    if (!preview) return [] as MinMaxV2PreviewRow[];
    const tokens = search.trim().toUpperCase().split(/\s+/).filter(Boolean);
    let rows = preview.rows;
    if (tokens.length > 0) {
      rows = rows.filter((row) => {
        const haystack = `${row.productCode} ${row.productName} ${row.supplierCode || ''} ${row.supplierName || ''}`.toUpperCase();
        return tokens.every((token) => haystack.includes(token));
      });
    }
    if (onlyChanged) {
      rows = rows.filter((row) => !row.excluded && ((row.diffMin ?? 0) !== 0 || (row.diffMax ?? 0) !== 0));
    }
    if (onlyMissingRecord) {
      rows = rows.filter((row) => !row.hasDepotRecord);
    }
    const sorted = [...rows];
    if (sortMode === 'code') {
      sorted.sort((a, b) => a.productCode.localeCompare(b.productCode));
    } else {
      const direction = sortMode === 'diffPctDesc' ? -1 : 1;
      sorted.sort((a, b) => {
        const pa = Math.abs(diffPercent(a));
        const pb = Math.abs(diffPercent(b));
        if (pa === pb) return a.productCode.localeCompare(b.productCode);
        if (!Number.isFinite(pa) && !Number.isFinite(pb)) return a.productCode.localeCompare(b.productCode);
        if (!Number.isFinite(pa)) return direction === -1 ? -1 : 1;
        if (!Number.isFinite(pb)) return direction === -1 ? 1 : -1;
        return direction * (pa - pb);
      });
    }
    return sorted;
  }, [preview, search, onlyChanged, onlyMissingRecord, sortMode]);

  const selectableFiltered = useMemo(
    () => filteredRows.filter((row) => !row.excluded && row.newMin !== null && row.newMax !== null),
    [filteredRows]
  );
  const allFilteredSelected =
    selectableFiltered.length > 0 && selectableFiltered.every((row) => selected.has(row.productCode));

  const toggleAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        selectableFiltered.forEach((row) => next.delete(row.productCode));
      } else {
        selectableFiltered.forEach((row) => next.add(row.productCode));
      }
      return next;
    });
  };

  const toggleRow = (row: MinMaxV2PreviewRow) => {
    if (row.excluded || row.newMin === null || row.newMax === null) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(row.productCode)) next.delete(row.productCode);
      else next.add(row.productCode);
      return next;
    });
  };

  const selectedRows = useMemo(() => {
    if (!preview) return [] as MinMaxV2PreviewRow[];
    return preview.rows.filter(
      (row) => selected.has(row.productCode) && !row.excluded && row.newMin !== null && row.newMax !== null
    );
  }, [preview, selected]);

  // Secili satirlar icinden sicilsiz (STOK_DEPO_DETAYLARI kaydi olmayan) olanlar — INSERT uyarisi icin
  const selectedMissingRows = useMemo(
    () => selectedRows.filter((row) => !row.hasDepotRecord),
    [selectedRows]
  );

  const applySelected = async () => {
    if (selectedRows.length === 0) return;
    setApplying(true);
    try {
      const response = await adminApi.applyMinMaxV2({
        depot,
        allowInsert: allowInsertMissing,
        items: selectedRows.map((row) => ({
          productCode: row.productCode,
          newMin: row.newMin as number,
          newMax: row.newMax as number,
        })),
      });
      const data = response.data;
      const inserted = data.inserted || [];
      setApplyResult({ updatedCount: data.updated.length, skipped: data.skipped, inserted });
      setConfirmOpen(false);
      // INSERT ile acilan kayitlar updated listesinde donmez; yazilan sayiya dahil edilir
      // (aksi halde tamami sicilsiz olan bir uygulamada '0 urun yazildi' gorunurdu).
      const writtenCount = data.updated.length + inserted.length;
      if (data.skipped.length > 0) {
        toast(`${writtenCount} urun yazildi, ${data.skipped.length} urun atlandi.`);
      } else {
        toast.success(`${writtenCount} urun Mikro'ya yazildi.`);
      }
      if (inserted.length > 0) {
        toast.success(
          `${inserted.length} urun icin STOK_DEPO_DETAYLARI kaydi ACILDI (INSERT): ${inserted.slice(0, 8).join(', ')}${inserted.length > 8 ? '...' : ''}`,
          { duration: 10000 }
        );
      }
      // Yazilan satirlarin 'mevcut' degerlerini guncelle ki tablo yeni durumu gostersin
      setPreview((prev) => {
        if (!prev) return prev;
        const updatedByCode = new Map(data.updated.map((item) => [item.productCode, item]));
        const insertedSet = new Set(inserted);
        return {
          ...prev,
          summary: {
            ...prev.summary,
            // INSERT'lenen kayitlar artik sicilli; sicilsiz sayaci dusurulur.
            missingDepotRecordCount: Math.max(0, prev.summary.missingDepotRecordCount - inserted.length),
          },
          rows: prev.rows.map((row) => {
            // INSERT ile acilan satirlar updated listesinde donmez; onizlemede sicilli
            // ve yazilmis (fark 0) olarak isaretlenir.
            if (insertedSet.has(row.productCode) && row.newMin !== null && row.newMax !== null) {
              return {
                ...row,
                hasDepotRecord: true,
                currentMin: row.newMin,
                currentMax: row.newMax,
                diffMin: 0,
                diffMax: 0,
              };
            }
            const hit = updatedByCode.get(row.productCode);
            if (!hit) return row;
            return {
              ...row,
              currentMin: hit.newMin,
              currentMax: hit.newMax,
              diffMin: row.newMin === null ? null : Math.round((row.newMin - hit.newMin) * 100) / 100,
              diffMax: row.newMax === null ? null : Math.round((row.newMax - hit.newMax) * 100) / 100,
            };
          }),
        };
      });
      setSelected(new Set());
    } catch (error: any) {
      toast.error(getErrorMessage(error, 'Mikro yazma islemi basarisiz'));
    } finally {
      setApplying(false);
    }
  };

  const createRule = async () => {
    setCreatingRule(true);
    try {
      await adminApi.createMinMaxV2Override({
        scopeType: ruleDraft.scopeType,
        productCode: ruleDraft.scopeType === 'PRODUCT' ? ruleDraft.code.trim() : null,
        supplierCode: ruleDraft.scopeType === 'SUPPLIER' ? ruleDraft.code.trim() : null,
        depot: ruleDraft.depot || null,
        lookbackDays: ruleDraft.lookbackDays.trim() === '' ? null : Number(ruleDraft.lookbackDays),
        minDays: ruleDraft.minDays.trim() === '' ? null : Number(ruleDraft.minDays),
        maxDays: ruleDraft.maxDays.trim() === '' ? null : Number(ruleDraft.maxDays),
        note: ruleDraft.note.trim() || null,
      });
      toast.success('Kural eklendi. Yeni onizlemede dikkate alinacak.');
      setRuleDraft({ scopeType: ruleDraft.scopeType, code: '', depot: '', lookbackDays: '', minDays: '', maxDays: '', note: '' });
      await loadOverrides();
    } catch (error: any) {
      toast.error(getErrorMessage(error, 'Kural eklenemedi'));
    } finally {
      setCreatingRule(false);
    }
  };

  const deleteRule = async (id: string) => {
    setDeletingOverrideId(id);
    try {
      await adminApi.deleteMinMaxV2Override(id);
      toast.success('Kural silindi.');
      setOverrides((prev) => prev.filter((row) => row.id !== id));
    } catch (error: any) {
      toast.error(getErrorMessage(error, 'Kural silinemedi'));
    } finally {
      setDeletingOverrideId(null);
    }
  };

  const inputClass =
    'h-9 rounded-md border border-gray-300 px-2 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-emerald-500';
  const btnPrimary =
    'inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-50';
  const btnGhost =
    'inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50';

  return (
    <>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-600 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-emerald-700 hover:bg-emerald-50"
        onClick={() => setOpen(true)}
        title="B2B tarafinda calisan yeni min-max hesap motoru: onizle, kiyasla, sectiklerini Mikro'ya yaz"
      >
        Min-Max v2
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 p-2 sm:p-4">
          <div className="flex w-full max-w-[1500px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            {/* Baslik */}
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div>
                <h2 className="text-[15px] font-bold text-gray-900">Min-Max v2 — B2B Hesap Motoru</h2>
                <p className="text-[11.5px] text-gray-500">
                  Gunluk satis = son pencere satisi / pencere gunu; min = gunluk satis x min gun, max = gunluk satis x max gun.
                  Mikro'ya yazma sadece sectiginiz satirlar icin, onayinizla yapilir.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-md border border-gray-300 p-0.5">
                  <button
                    type="button"
                    className={`rounded px-3 py-1 text-[12px] font-semibold ${tab === 'preview' ? 'bg-emerald-700 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                    onClick={() => setTab('preview')}
                  >
                    Onizleme
                  </button>
                  <button
                    type="button"
                    className={`rounded px-3 py-1 text-[12px] font-semibold ${tab === 'rules' ? 'bg-emerald-700 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                    onClick={() => setTab('rules')}
                  >
                    Kurallar ({overrides.length})
                  </button>
                </div>
                <button type="button" className={btnGhost} onClick={() => setOpen(false)}>
                  Kapat
                </button>
              </div>
            </div>

            {tab === 'preview' ? (
              <div className="flex min-h-0 flex-1 flex-col">
                {/* Varsayilan parametreler + onizle */}
                <div className="flex flex-wrap items-end gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
                  <label className="flex flex-col gap-1 text-[11.5px] font-medium text-gray-600">
                    Depo
                    <select className={inputClass} value={depot} onChange={(e) => setDepot(e.target.value as DepotType)}>
                      <option value="MERKEZ">Merkez (depo 1)</option>
                      <option value="TOPCA">Topca (depo 6)</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-[11.5px] font-medium text-gray-600">
                    Satis penceresi (gun)
                    <input
                      className={`${inputClass} w-28`}
                      type="number"
                      min={7}
                      max={365}
                      value={settingsDraft.lookbackDays}
                      onChange={(e) => setSettingsDraft((prev) => ({ ...prev, lookbackDays: e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11.5px] font-medium text-gray-600">
                    Min gun
                    <input
                      className={`${inputClass} w-20`}
                      type="number"
                      min={1}
                      max={365}
                      value={settingsDraft.minDays}
                      onChange={(e) => setSettingsDraft((prev) => ({ ...prev, minDays: e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11.5px] font-medium text-gray-600">
                    Max gun
                    <input
                      className={`${inputClass} w-20`}
                      type="number"
                      min={1}
                      max={365}
                      value={settingsDraft.maxDays}
                      onChange={(e) => setSettingsDraft((prev) => ({ ...prev, maxDays: e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11.5px] font-medium text-gray-600">
                    Satis kapsami
                    <select
                      className={inputClass}
                      value={settingsDraft.salesScope}
                      onChange={(e) => setSettingsDraft((prev) => ({ ...prev, salesScope: e.target.value as 'DEPOT' | 'COMPANY' }))}
                      title="DEPO: sadece secilen deponun cikislari sayilir. SIRKET: tum depolarin satisi sayilir (Topca'da rakamlari sisirebilir)."
                    >
                      <option value="DEPOT">Depo bazli</option>
                      <option value="COMPANY">Sirket geneli</option>
                    </select>
                  </label>
                  <button type="button" className={btnGhost} onClick={saveSettings} disabled={savingSettings}>
                    {savingSettings ? 'Kaydediliyor...' : 'Varsayilanlari Kaydet'}
                  </button>
                  <button type="button" className={btnPrimary} onClick={runPreview} disabled={previewLoading}>
                    {previewLoading ? 'Hesaplaniyor...' : 'Onizle'}
                  </button>
                  {settings && (
                    <span className="text-[11px] text-gray-500">
                      Kayitli varsayilan: {settings.lookbackDays}g pencere / min {settings.minDays}g / max {settings.maxDays}g /{' '}
                      {settings.salesScope === 'DEPOT' ? 'depo bazli' : 'sirket geneli'}
                    </span>
                  )}
                </div>

                {/* Ozet + filtreler */}
                {preview && (
                  <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 px-4 py-2">
                    <span className="text-[12px] text-gray-700">
                      Toplam: <strong>{preview.total.toLocaleString('tr-TR')}</strong> | Degisen:{' '}
                      <strong>{preview.summary.changedCount.toLocaleString('tr-TR')}</strong> | Haric (HAYIR):{' '}
                      <strong>{preview.summary.excludedCount.toLocaleString('tr-TR')}</strong> | Sicilsiz urun:{' '}
                      <strong>{preview.summary.missingDepotRecordCount.toLocaleString('tr-TR')}</strong>{' '}
                      <span title="STOK_DEPO_DETAYLARI kaydi olmayan urunlerden satisi olanlar ve bunlarin toplam gunluk satisi">
                        (satisi olan: {(preview.summary.missingWithSalesCount ?? 0).toLocaleString('tr-TR')}, gunluk ~
                        {(preview.summary.missingWithSalesDaily ?? 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })})
                      </span>
                    </span>
                    <input
                      className={`${inputClass} w-64`}
                      placeholder="Ara: kod / ad / tedarikci"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setVisibleCount(300);
                      }}
                    />
                    <label className="flex items-center gap-1.5 text-[12px] text-gray-700">
                      <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />
                      Sadece degisenler
                    </label>
                    <label
                      className="flex items-center gap-1.5 text-[12px] text-gray-700"
                      title="Sadece STOK_DEPO_DETAYLARI kaydi olmayan (kayit yok rozetli) satirlari goster"
                    >
                      <input
                        type="checkbox"
                        checked={onlyMissingRecord}
                        onChange={(e) => {
                          setOnlyMissingRecord(e.target.checked);
                          setVisibleCount(300);
                        }}
                      />
                      Sadece sicilsiz
                    </label>
                    <select className={inputClass} value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
                      <option value="diffPctDesc">Fark % (buyukten kucuge)</option>
                      <option value="diffPctAsc">Fark % (kucukten buyuge)</option>
                      <option value="code">Stok kodu</option>
                    </select>
                    <span className="ml-auto text-[12px] text-gray-600">
                      Secili: <strong>{selectedRows.length.toLocaleString('tr-TR')}</strong>
                    </span>
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={selectedRows.length === 0 || applying}
                      onClick={() => {
                        setAllowInsertMissing(false);
                        setConfirmOpen(true);
                      }}
                    >
                      Secilenleri Mikro'ya Yaz ({selectedRows.length})
                    </button>
                  </div>
                )}

                {/* Sonuc bildirimi */}
                {applyResult && (
                  <div className="border-b border-gray-200 bg-emerald-50 px-4 py-2 text-[12px] text-emerald-900">
                    <strong>{applyResult.updatedCount.toLocaleString('tr-TR')}</strong> urun Mikro'ya yazildi.
                    {applyResult.inserted.length > 0 && (
                      <span className="ml-2 text-violet-800">
                        Yeni acilan depo kaydi (INSERT): <strong>{applyResult.inserted.length.toLocaleString('tr-TR')}</strong>{' '}
                        — {applyResult.inserted.slice(0, 10).join(', ')}
                        {applyResult.inserted.length > 10 ? '...' : ''}
                      </span>
                    )}
                    {applyResult.skipped.length > 0 && (
                      <span className="ml-2 text-amber-800">
                        Atlanan {applyResult.skipped.length} urun:{' '}
                        {applyResult.skipped.slice(0, 10).map((item) => item.productCode).join(', ')}
                        {applyResult.skipped.length > 10 ? '...' : ''} (sebep: {applyResult.skipped[0]?.reason})
                      </span>
                    )}
                    <span className="ml-2 text-emerald-700">Islem gecmisine (Islemler sekmesi) kaydedildi.</span>
                  </div>
                )}

                {/* Tablo */}
                <div className="min-h-0 flex-1 overflow-auto px-4 py-2">
                  {!preview && !previewLoading && (
                    <p className="py-10 text-center text-[13px] text-gray-500">
                      Parametreleri kontrol edin ve <strong>Onizle</strong> ile hesap motorunu calistirin. Bu adim Mikro'ya yazmaz.
                    </p>
                  )}
                  {previewLoading && (
                    <p className="py-10 text-center text-[13px] text-gray-500">Satis gecmisi toplaniyor, hesap yapiliyor...</p>
                  )}
                  {preview && !previewLoading && (
                    <table className="w-full border-collapse text-[11.5px]">
                      <thead className="sticky top-0 bg-white shadow-sm">
                        <tr className="border-b border-gray-200 text-left text-gray-600">
                          <th className="px-2 py-2">
                            <input
                              type="checkbox"
                              checked={allFilteredSelected}
                              onChange={toggleAllFiltered}
                              title="Filtrelenen tum satirlari sec/birak"
                            />
                          </th>
                          <th className="px-2 py-2">Stok Kodu</th>
                          <th className="px-2 py-2">Urun</th>
                          <th className="px-2 py-2">Tedarikci</th>
                          <th className="px-2 py-2 text-right">Gunluk Satis</th>
                          <th className="px-2 py-2 text-right">Pencere</th>
                          <th className="px-2 py-2 text-right" title="Hesapta gercekten kullanilan gun sayisi (ilk satis tarihine gore kisalabilir)">
                            Efektif Gun
                          </th>
                          <th className="px-2 py-2 text-right">Min/Max Gun</th>
                          <th className="px-2 py-2 text-right">Mevcut Min</th>
                          <th className="px-2 py-2 text-right">Mevcut Max</th>
                          <th className="px-2 py-2 text-right">Yeni Min</th>
                          <th className="px-2 py-2 text-right">Yeni Max</th>
                          <th className="px-2 py-2 text-right">Fark Min</th>
                          <th className="px-2 py-2 text-right">Fark Max</th>
                          <th className="px-2 py-2 text-right">Fark %</th>
                          <th className="px-2 py-2">Kaynak</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.slice(0, visibleCount).map((row) => {
                          const pct = diffPercent(row);
                          const selectable = !row.excluded && row.newMin !== null && row.newMax !== null;
                          return (
                            <tr
                              key={row.productCode}
                              className={`border-b border-gray-100 hover:bg-gray-50 ${row.excluded ? 'opacity-60' : ''}`}
                            >
                              <td className="px-2 py-1.5">
                                <input
                                  type="checkbox"
                                  disabled={!selectable}
                                  checked={selected.has(row.productCode)}
                                  onChange={() => toggleRow(row)}
                                />
                              </td>
                              <td className="px-2 py-1.5 font-mono">{row.productCode}</td>
                              <td className="max-w-[260px] truncate px-2 py-1.5" title={row.productName}>
                                {row.productName || '-'}
                                {!row.hasDepotRecord && (
                                  <span
                                    className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800"
                                    title="STOK_DEPO_DETAYLARI kaydi yok; yazma sirasinda atlanir"
                                  >
                                    kayit yok
                                  </span>
                                )}
                              </td>
                              <td className="max-w-[160px] truncate px-2 py-1.5" title={`${row.supplierCode || ''} ${row.supplierName || ''}`}>
                                {row.supplierName || row.supplierCode || '-'}
                              </td>
                              <td className="px-2 py-1.5 text-right">{formatNumber(row.dailySales)}</td>
                              <td className="px-2 py-1.5 text-right">{row.lookbackUsed}g</td>
                              <td className="px-2 py-1.5 text-right whitespace-nowrap">
                                {formatNumber(row.effectiveDays)}g
                                {row.isShortWindow && (
                                  <span
                                    className="ml-1 inline-block rounded bg-amber-100 px-1 py-0.5 text-[9.5px] font-semibold text-amber-800"
                                    title={`Kisa pencere: satis gecmisi tam pencereyi doldurmuyor. Ilk satis: ${formatShortDate(row.firstSaleDate)}`}
                                  >
                                    kisa pencere — ilk satis {formatShortDate(row.firstSaleDate)}
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                {row.minDaysUsed}/{row.maxDaysUsed}
                              </td>
                              <td className="px-2 py-1.5 text-right">{formatNumber(row.currentMin)}</td>
                              <td className="px-2 py-1.5 text-right">{formatNumber(row.currentMax)}</td>
                              <td className="px-2 py-1.5 text-right font-semibold">{formatNumber(row.newMin)}</td>
                              <td className="px-2 py-1.5 text-right font-semibold">{formatNumber(row.newMax)}</td>
                              <td className={`px-2 py-1.5 text-right ${diffClass(row.diffMin)}`}>{formatDiff(row.diffMin)}</td>
                              <td className={`px-2 py-1.5 text-right ${diffClass(row.diffMax)}`}>{formatDiff(row.diffMax)}</td>
                              <td className={`px-2 py-1.5 text-right ${diffClass(row.diffMax)}`}>
                                {row.excluded ? '-' : Number.isFinite(pct) ? `${pct > 0 ? '+' : ''}${pct.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}%` : 'YENI'}
                              </td>
                              <td className="px-2 py-1.5">
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold whitespace-nowrap ${SOURCE_BADGE_CLASS[row.overrideSource]}`}
                                  title={
                                    row.overrideSource === 'SIPARIS'
                                      ? 'Satis gecmisi yok; min-max bekleyen musteri siparisine gore hesaplandi'
                                      : undefined
                                  }
                                >
                                  {row.overrideSource === 'SIPARIS'
                                    ? `Siparis-bazli (satis yok, ${(row.pendingOrderQty ?? 0).toLocaleString('tr-TR')} bekleyen)`
                                    : SOURCE_LABELS[row.overrideSource]}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                  {preview && !previewLoading && filteredRows.length > visibleCount && (
                    <div className="py-3 text-center">
                      <button type="button" className={btnGhost} onClick={() => setVisibleCount((prev) => prev + 500)}>
                        Devamini goster ({(filteredRows.length - visibleCount).toLocaleString('tr-TR')} satir daha)
                      </button>
                    </div>
                  )}
                  {preview && !previewLoading && filteredRows.length === 0 && (
                    <p className="py-10 text-center text-[13px] text-gray-500">Filtreye uyan satir yok.</p>
                  )}
                </div>
              </div>
            ) : (
              /* KURALLAR SEKMESI */
              <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
                <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <h3 className="mb-2 text-[13px] font-semibold text-gray-800">Yeni Kural Ekle</h3>
                  <p className="mb-3 text-[11.5px] text-gray-500">
                    Urun veya tedarikci bazinda gun parametrelerini degistirir (uzun terminli / uzun alis vadeli urunler icin).
                    Bos birakilan gun alanlari varsayilandan gelir. Urun kurali tedarikci kuralindan onceliklidir.
                  </p>
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1 text-[11.5px] font-medium text-gray-600">
                      Kapsam
                      <select
                        className={inputClass}
                        value={ruleDraft.scopeType}
                        onChange={(e) => setRuleDraft((prev) => ({ ...prev, scopeType: e.target.value as 'PRODUCT' | 'SUPPLIER' }))}
                      >
                        <option value="PRODUCT">Urun (stok kodu)</option>
                        <option value="SUPPLIER">Tedarikci (cari kodu)</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-[11.5px] font-medium text-gray-600">
                      {ruleDraft.scopeType === 'PRODUCT' ? 'Stok kodu' : 'Tedarikci cari kodu'}
                      <input
                        className={`${inputClass} w-44`}
                        value={ruleDraft.code}
                        onChange={(e) => setRuleDraft((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                        placeholder={ruleDraft.scopeType === 'PRODUCT' ? 'orn. B106430' : 'orn. 120.01.0001'}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[11.5px] font-medium text-gray-600">
                      Depo
                      <select
                        className={inputClass}
                        value={ruleDraft.depot}
                        onChange={(e) => setRuleDraft((prev) => ({ ...prev, depot: e.target.value as '' | DepotType }))}
                      >
                        <option value="">Her iki depo</option>
                        <option value="MERKEZ">Sadece Merkez</option>
                        <option value="TOPCA">Sadece Topca</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-[11.5px] font-medium text-gray-600">
                      Pencere (gun)
                      <input
                        className={`${inputClass} w-24`}
                        type="number"
                        min={7}
                        max={365}
                        placeholder="varsayilan"
                        value={ruleDraft.lookbackDays}
                        onChange={(e) => setRuleDraft((prev) => ({ ...prev, lookbackDays: e.target.value }))}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[11.5px] font-medium text-gray-600">
                      Min gun
                      <input
                        className={`${inputClass} w-20`}
                        type="number"
                        min={1}
                        max={365}
                        placeholder="varsayilan"
                        value={ruleDraft.minDays}
                        onChange={(e) => setRuleDraft((prev) => ({ ...prev, minDays: e.target.value }))}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[11.5px] font-medium text-gray-600">
                      Max gun
                      <input
                        className={`${inputClass} w-20`}
                        type="number"
                        min={1}
                        max={365}
                        placeholder="varsayilan"
                        value={ruleDraft.maxDays}
                        onChange={(e) => setRuleDraft((prev) => ({ ...prev, maxDays: e.target.value }))}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[11.5px] font-medium text-gray-600">
                      Not
                      <input
                        className={`${inputClass} w-56`}
                        value={ruleDraft.note}
                        onChange={(e) => setRuleDraft((prev) => ({ ...prev, note: e.target.value }))}
                        placeholder="orn. ithal urun, termin 60 gun"
                      />
                    </label>
                    <button
                      type="button"
                      className={btnPrimary}
                      onClick={createRule}
                      disabled={creatingRule || !ruleDraft.code.trim()}
                    >
                      {creatingRule ? 'Ekleniyor...' : 'Kural Ekle'}
                    </button>
                  </div>
                </div>

                {overridesLoading ? (
                  <p className="py-6 text-center text-[13px] text-gray-500">Kurallar yukleniyor...</p>
                ) : overrides.length === 0 ? (
                  <p className="py-6 text-center text-[13px] text-gray-500">Tanimli kural yok. Tum urunler varsayilan parametrelerle hesaplanir.</p>
                ) : (
                  <table className="w-full border-collapse text-[12px]">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-gray-600">
                        <th className="px-2 py-2">Kapsam</th>
                        <th className="px-2 py-2">Kod</th>
                        <th className="px-2 py-2">Ad</th>
                        <th className="px-2 py-2">Depo</th>
                        <th className="px-2 py-2 text-right">Pencere</th>
                        <th className="px-2 py-2 text-right">Min gun</th>
                        <th className="px-2 py-2 text-right">Max gun</th>
                        <th className="px-2 py-2">Not</th>
                        <th className="px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {overrides.map((rule) => (
                        <tr key={rule.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-2 py-1.5">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${rule.scopeType === 'PRODUCT' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}
                            >
                              {rule.scopeType === 'PRODUCT' ? 'Urun' : 'Tedarikci'}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 font-mono">{rule.productCode || rule.supplierCode || '-'}</td>
                          <td className="max-w-[280px] truncate px-2 py-1.5">{rule.productName || rule.supplierName || '-'}</td>
                          <td className="px-2 py-1.5">{rule.depot === null ? 'Her iki depo' : rule.depot === 'TOPCA' ? 'Topca' : 'Merkez'}</td>
                          <td className="px-2 py-1.5 text-right">{rule.lookbackDays !== null ? `${rule.lookbackDays}g` : '-'}</td>
                          <td className="px-2 py-1.5 text-right">{rule.minDays !== null ? `${rule.minDays}g` : '-'}</td>
                          <td className="px-2 py-1.5 text-right">{rule.maxDays !== null ? `${rule.maxDays}g` : '-'}</td>
                          <td className="max-w-[240px] truncate px-2 py-1.5" title={rule.note || ''}>{rule.note || '-'}</td>
                          <td className="px-2 py-1.5 text-right">
                            <button
                              type="button"
                              className="rounded border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                              onClick={() => deleteRule(rule.id)}
                              disabled={deletingOverrideId === rule.id}
                            >
                              {deletingOverrideId === rule.id ? 'Siliniyor...' : 'Sil'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          {/* ONAY MODALI */}
          {confirmOpen && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-xl rounded-xl bg-white p-5 shadow-2xl">
                <h3 className="text-[15px] font-bold text-gray-900">Mikro'ya Yazma Onayi</h3>
                <p className="mt-2 text-[13px] text-gray-700">
                  <strong>{selectedRows.length.toLocaleString('tr-TR')}</strong> urunun min-max degeri{' '}
                  <strong>{depot === 'TOPCA' ? 'Topca (depo 6)' : 'Merkez (depo 1)'}</strong> icin guncellenecek.
                </p>
                <div className="mt-3 max-h-48 overflow-auto rounded border border-gray-200">
                  <table className="w-full text-[11.5px]">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-600">
                        <th className="px-2 py-1.5">Stok Kodu</th>
                        <th className="px-2 py-1.5 text-right">Min (eski → yeni)</th>
                        <th className="px-2 py-1.5 text-right">Max (eski → yeni)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRows.slice(0, 5).map((row) => (
                        <tr key={row.productCode} className="border-b border-gray-100">
                          <td className="px-2 py-1.5 font-mono">{row.productCode}</td>
                          <td className="px-2 py-1.5 text-right">
                            {formatNumber(row.currentMin)} → <strong>{formatNumber(row.newMin)}</strong>
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            {formatNumber(row.currentMax)} → <strong>{formatNumber(row.newMax)}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {selectedRows.length > 5 && (
                    <p className="px-2 py-1.5 text-[11px] text-gray-500">... ve {selectedRows.length - 5} urun daha</p>
                  )}
                </div>
                {selectedMissingRows.length > 0 && (
                  <div className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                    <p className="font-semibold">
                      {selectedMissingRows.length.toLocaleString('tr-TR')} satirin STOK_DEPO_DETAYLARI kaydi yok. Kayit ACILSIN mi? (Mikro'ya INSERT)
                    </p>
                    <label className="mt-1.5 flex items-center gap-1.5 font-medium">
                      <input
                        type="checkbox"
                        checked={allowInsertMissing}
                        onChange={(e) => setAllowInsertMissing(e.target.checked)}
                      />
                      Evet, sicilsiz urunler icin depo kaydi ACILSIN (Mikro'ya INSERT)
                    </label>
                    <p className="mt-1 text-[11px]">
                      {allowInsertMissing
                        ? 'Bu satirlar icin Mikro STOK_DEPO_DETAYLARI kaydi olusturulacak ve min-max degerleri yazilacak.'
                        : 'Isaretlemezseniz bu satirlar eskisi gibi ATLANIR (yazilmaz) ve sonucta raporlanir.'}
                    </p>
                  </div>
                )}
                <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-900">
                  Bu islem Mikro STOK_DEPO_DETAYLARI tablosunu guncelleyecek.
                  {selectedMissingRows.length > 0 && allowInsertMissing
                    ? ' Sicilsiz satirlar icin yeni depo kaydi ACILACAK.'
                    : ' Depo kaydi olmayan urunler atlanir ve raporlanir.'}
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" className={btnGhost} onClick={() => setConfirmOpen(false)} disabled={applying}>
                    Vazgec
                  </button>
                  <button type="button" className={btnPrimary} onClick={applySelected} disabled={applying}>
                    {applying ? 'Yaziliyor...' : `Onayla ve Yaz (${selectedRows.length})`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
