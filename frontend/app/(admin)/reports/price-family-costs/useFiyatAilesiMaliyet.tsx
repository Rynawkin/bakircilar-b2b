'use client';

import { useEffect, useMemo, useState } from 'react';
// 13.3: xlsx statik degil; export aninda dinamik import edilir.
import toast from 'react-hot-toast';
import { adminApi } from '@/lib/api/admin';
import { formatDateShort } from '@/lib/utils/format';

/**
 * Fiyat Ailesi Maliyet Kontrolu raporunun TUM is mantigi.
 * Klasik ve yeni gorunum bu hook'u tuketir; logic birebir korunmustur.
 * (Onceki PriceFamilyCostsPage component'inin `return (` oncesindeki her sey
 * aynen tasinmistir: state/effect/turetilmis deger/handler + Mikro/DB yazan
 * updateProductCost/updateDirtyCosts mantigi TEK SATIR DEGISMEDEN.)
 */

export type FamilyStatus = 'all' | 'problem' | 'ok';
export type DetailColumnKey =
  | 'stock'
  | 'status'
  | 'currentCost'
  | 'currentCostDate'
  | 'lastEntryPrice'
  | 'lastEntryDate'
  | 'daysBehind'
  | 'newCost'
  | 'action';

export const DETAIL_COLUMN_STORAGE_KEY = 'price-family-costs.detail-column-widths.v1';
export const DEFAULT_DETAIL_COLUMN_WIDTHS: Record<DetailColumnKey, number> = {
  stock: 260,
  status: 120,
  currentCost: 140,
  currentCostDate: 150,
  lastEntryPrice: 140,
  lastEntryDate: 140,
  daysBehind: 100,
  newCost: 430,
  action: 110,
};
export const DETAIL_COLUMN_KEYS = Object.keys(DEFAULT_DETAIL_COLUMN_WIDTHS) as DetailColumnKey[];

export interface PriceFamilyReportItem {
  id: string;
  productCode: string;
  productName?: string | null;
  currentCost?: number | null;
  currentCostDate: string | null;
  lastEntryPrice?: number | null;
  lastEntryDate: string | null;
  vatRate: number;
  issueType: 'ok' | 'outdated' | 'missing-date';
  daysBehind: number | null;
}

export interface PriceFamilyReportRow {
  id: string;
  name: string;
  code?: string | null;
  note?: string | null;
  active: boolean;
  status: 'problem' | 'ok';
  itemCount: number;
  outdatedCount: number;
  missingCostDateCount: number;
  latestCostDate: string | null;
  oldestCostDate: string | null;
  dateGroups: Array<{ date: string | null; count: number; productCodes: string[] }>;
  items: PriceFamilyReportItem[];
  recentLogs: Array<{
    id: string;
    productCode: string;
    productName?: string | null;
    previousCost?: number | null;
    newCost: number;
    previousCostDate: string | null;
    newCostDate: string;
    updatePriceLists: boolean;
    userId?: string | null;
    createdAt: string;
  }>;
}

export interface PriceFamilyReportData {
  families: PriceFamilyReportRow[];
  summary: {
    totalFamilies: number;
    problemFamilies: number;
    okFamilies: number;
    inactiveFamilies: number;
    productCount: number;
    outdatedProductCount: number;
    missingCostDateCount: number;
  };
}

export const formatCurrency = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '-';

export const formatInputNumber = (value: number) =>
  Number.isFinite(value) && value > 0 ? value.toFixed(4).replace(/\.?0+$/, '') : '';

export const formatDate = (value?: string | null) => {
  if (!value) return '-';
  return formatDateShort(value);
};

export const getVatPercent = (vatRate: number) => {
  const raw = Number(vatRate || 0);
  return raw <= 1 ? raw * 100 : raw;
};

export const computeCostT = (costP: number, vatRate: number) => {
  const vatPercent = getVatPercent(vatRate);
  return costP * (1 + vatPercent / 200);
};

export const issueLabel = (issueType: PriceFamilyReportItem['issueType']) => {
  if (issueType === 'missing-date') return 'Tarih yok';
  if (issueType === 'outdated') return 'Eski tarih';
  return 'Guncel';
};

const loadSavedDetailColumnWidths = (): Record<DetailColumnKey, number> => {
  if (typeof window === 'undefined') return DEFAULT_DETAIL_COLUMN_WIDTHS;
  try {
    const raw = window.localStorage.getItem(DETAIL_COLUMN_STORAGE_KEY);
    if (!raw) return DEFAULT_DETAIL_COLUMN_WIDTHS;
    const parsed = JSON.parse(raw) as Partial<Record<DetailColumnKey, number>>;
    return DETAIL_COLUMN_KEYS.reduce((acc, key) => {
      const value = Number(parsed[key]);
      acc[key] = Number.isFinite(value) && value >= 70 ? value : DEFAULT_DETAIL_COLUMN_WIDTHS[key];
      return acc;
    }, {} as Record<DetailColumnKey, number>);
  } catch {
    return DEFAULT_DETAIL_COLUMN_WIDTHS;
  }
};

export function useFiyatAilesiMaliyet() {
  const [data, setData] = useState<PriceFamilyReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<FamilyStatus>('problem');
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
  const [detailSearch, setDetailSearch] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(true);
  const [costPInputByCode, setCostPInputByCode] = useState<Record<string, string>>({});
  const [costTInputByCode, setCostTInputByCode] = useState<Record<string, string>>({});
  const [manualCostTByCode, setManualCostTByCode] = useState<Record<string, boolean>>({});
  const [updatePriceListsByCode, setUpdatePriceListsByCode] = useState<Record<string, boolean>>({});
  const [updatingCostByCode, setUpdatingCostByCode] = useState<Record<string, boolean>>({});
  const [dirtyCostByCode, setDirtyCostByCode] = useState<Record<string, boolean>>({});
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [detailColumnWidths, setDetailColumnWidths] = useState<Record<DetailColumnKey, number>>(loadSavedDetailColumnWidths);

  const families = data?.families || [];
  const selectedFamily = useMemo(
    () => families.find((family) => family.id === selectedFamilyId) || null,
    [families, selectedFamilyId]
  );
  const detailTableWidth = useMemo(
    () => DETAIL_COLUMN_KEYS.reduce((sum, key) => sum + detailColumnWidths[key], 0),
    [detailColumnWidths]
  );

  const loadReport = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getPriceFamilyCostReport({
        status,
        search: search.trim(),
        includeInactive,
      });
      setData(response.data);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Fiyat ailesi raporu alinamadi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadReport();
    }, 250);
    return () => clearTimeout(timeout);
  }, [status, search, includeInactive]);

  useEffect(() => {
    if (!selectedFamily) return;
    const nextCostP: Record<string, string> = {};
    const nextCostT: Record<string, string> = {};
    const nextUpdatePriceLists: Record<string, boolean> = {};
    selectedFamily.items.forEach((item) => {
      const code = item.productCode;
      const costP = Number(item.currentCost || 0);
      nextCostP[code] = formatInputNumber(costP);
      nextCostT[code] = formatInputNumber(computeCostT(costP, item.vatRate));
      nextUpdatePriceLists[code] = true;
    });
    setCostPInputByCode(nextCostP);
    setCostTInputByCode(nextCostT);
    setManualCostTByCode({});
    setUpdatePriceListsByCode(nextUpdatePriceLists);
    setDirtyCostByCode({});
  }, [selectedFamily]);

  const filteredDetailItems = useMemo(() => {
    if (!selectedFamily) return [];
    const q = detailSearch.trim().toLocaleLowerCase('tr-TR');
    return selectedFamily.items.filter((item) => {
      if (onlyIssues && item.issueType === 'ok') return false;
      if (!q) return true;
      return `${item.productCode} ${item.productName || ''}`.toLocaleLowerCase('tr-TR').includes(q);
    });
  }, [selectedFamily, detailSearch, onlyIssues]);

  const markCostDirty = (productCode: string) => {
    setDirtyCostByCode((prev) => ({ ...prev, [productCode]: true }));
  };

  const applyCurrentCostToInputs = (item: PriceFamilyReportItem) => {
    const code = item.productCode;
    const currentCost = Number(item.currentCost || 0);
    if (!Number.isFinite(currentCost) || currentCost <= 0) {
      toast.error('Bu satirda aktarilacak guncel maliyet yok.');
      return;
    }
    setCostPInputByCode((prev) => ({ ...prev, [code]: formatInputNumber(currentCost) }));
    setCostTInputByCode((prev) => ({ ...prev, [code]: formatInputNumber(computeCostT(currentCost, item.vatRate)) }));
    setManualCostTByCode((prev) => ({ ...prev, [code]: false }));
    markCostDirty(code);
  };

  const parseCostInputs = (code: string) => {
    const parsedCostP = Number(String(costPInputByCode[code] || '').replace(',', '.'));
    const parsedCostT = Number(String(costTInputByCode[code] || '').replace(',', '.'));
    return { parsedCostP, parsedCostT };
  };

  const updateProductCost = async (item: PriceFamilyReportItem, options?: { silent?: boolean; reload?: boolean }) => {
    if (!selectedFamily) return;
    const code = item.productCode;
    const { parsedCostP, parsedCostT } = parseCostInputs(code);
    if (!Number.isFinite(parsedCostP) || parsedCostP <= 0) {
      if (!options?.silent) toast.error('Gecerli bir Maliyet P girin.');
      return false;
    }
    if (!Number.isFinite(parsedCostT) || parsedCostT <= 0) {
      if (!options?.silent) toast.error('Gecerli bir Maliyet T girin.');
      return false;
    }

    setUpdatingCostByCode((prev) => ({ ...prev, [code]: true }));
    try {
      const result = await adminApi.updatePriceFamilyProductCost({
        familyId: selectedFamily.id,
        productCode: code,
        costP: parsedCostP,
        costT: parsedCostT,
        updatePriceLists: updatePriceListsByCode[code] !== false,
      });
      const missing = result.data?.missingLists || [];
      if (!options?.silent && updatePriceListsByCode[code] !== false) {
        toast.success(
          missing.length > 0
            ? `Maliyet guncellendi. Eksik liste satiri: ${missing.join(', ')}`
            : 'Maliyet ve 10 fiyat listesi guncellendi.'
        );
      } else if (!options?.silent) {
        toast.success('Guncel maliyet guncellendi.');
      }
      setDirtyCostByCode((prev) => ({ ...prev, [code]: false }));
      if (options?.reload !== false) await loadReport();
      return true;
    } catch (error: any) {
      if (!options?.silent) toast.error(error?.response?.data?.error || 'Maliyet guncellenemedi');
      return false;
    } finally {
      setUpdatingCostByCode((prev) => ({ ...prev, [code]: false }));
    }
  };

  const updateDirtyCosts = async () => {
    if (!selectedFamily) return;
    const itemsToUpdate = selectedFamily.items.filter((item) => {
      const code = item.productCode;
      const { parsedCostP, parsedCostT } = parseCostInputs(code);
      return Boolean(dirtyCostByCode[code]) && parsedCostP > 0 && parsedCostT > 0;
    });
    if (itemsToUpdate.length === 0) {
      toast.error('Guncellenecek fiyat girisi yok.');
      return;
    }

    setBulkUpdating(true);
    let successCount = 0;
    let failCount = 0;
    const toastId = toast.loading(`${itemsToUpdate.length} satir guncelleniyor...`);
    try {
      for (const item of itemsToUpdate) {
        // Mikro fiyat guncellemelerini ayni anda bindirmemek icin sirali ilerliyoruz.
        const ok = await updateProductCost(item, { silent: true, reload: false });
        if (ok) successCount += 1;
        else failCount += 1;
      }
      await loadReport();
      toast.success(`${successCount} satir guncellendi${failCount ? `, ${failCount} satir hata aldi` : ''}.`, { id: toastId });
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Toplu guncelleme tamamlanamadi', { id: toastId });
    } finally {
      setBulkUpdating(false);
    }
  };

  const startColumnResize = (event: React.MouseEvent<HTMLSpanElement>, key: DetailColumnKey) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = detailColumnWidths[key];
    const onMouseMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.max(70, Math.min(900, startWidth + moveEvent.clientX - startX));
      setDetailColumnWidths((prev) => ({ ...prev, [key]: nextWidth }));
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const saveDetailColumnWidths = () => {
    window.localStorage.setItem(DETAIL_COLUMN_STORAGE_KEY, JSON.stringify(detailColumnWidths));
    toast.success('Kolon gorunumu kaydedildi.');
  };

  const resetDetailColumnWidths = () => {
    setDetailColumnWidths(DEFAULT_DETAIL_COLUMN_WIDTHS);
    window.localStorage.removeItem(DETAIL_COLUMN_STORAGE_KEY);
    toast.success('Kolon genislikleri sifirlandi.');
  };

  const exportToExcel = async () => {
    const rows = families.flatMap((family) =>
      family.items.map((item) => ({
        'Aile': family.name,
        'Aile Kodu': family.code || '',
        'Aile Durumu': family.status === 'problem' ? 'Sorunlu' : 'Kapali',
        'Stok Kodu': item.productCode,
        'Stok Adi': item.productName || '',
        'Satir Durumu': issueLabel(item.issueType),
        'Guncel Maliyet Tarihi': formatDate(item.currentCostDate),
        'Son Giris': item.lastEntryPrice ?? '',
        'Son Giris Tarihi': formatDate(item.lastEntryDate),
        'Aile En Yeni Tarih': formatDate(family.latestCostDate),
        'Gun Farki': item.daysBehind ?? '',
        'Guncel Maliyet': item.currentCost ?? '',
      }))
    );
    if (rows.length === 0) {
      toast.error('Aktarilacak veri yok');
      return;
    }
    // 13.3: xlsx sadece burada (export aninda) dinamik yuklenir.
    const XLSX = await import('xlsx');
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Fiyat Aileleri');
    XLSX.writeFile(workbook, `fiyat-ailesi-maliyet-kontrol-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return {
    // state
    data,
    loading,
    status,
    setStatus,
    search,
    setSearch,
    includeInactive,
    setIncludeInactive,
    selectedFamilyId,
    setSelectedFamilyId,
    detailSearch,
    setDetailSearch,
    onlyIssues,
    setOnlyIssues,
    costPInputByCode,
    setCostPInputByCode,
    costTInputByCode,
    setCostTInputByCode,
    manualCostTByCode,
    setManualCostTByCode,
    updatePriceListsByCode,
    setUpdatePriceListsByCode,
    updatingCostByCode,
    dirtyCostByCode,
    bulkUpdating,
    detailColumnWidths,
    // derived
    families,
    selectedFamily,
    detailTableWidth,
    filteredDetailItems,
    // handlers
    loadReport,
    markCostDirty,
    applyCurrentCostToInputs,
    updateProductCost,
    updateDirtyCosts,
    startColumnResize,
    saveDetailColumnWidths,
    resetDetailColumnWidths,
    exportToExcel,
  };
}

export default useFiyatAilesiMaliyet;
