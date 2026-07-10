'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { adminApi } from '@/lib/api/admin';
import { getPriceListVerificationError } from '@/lib/utils/costPriceUpdate';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '@/lib/utils/search';

export type SortDirection = 'asc' | 'desc';
export type ColumnId =
  | 'productCode'
  | 'productName'
  | 'mainSupplier'
  | 'category'
  | 'stock'
  | 'currentCost'
  | 'lastEntryPrice'
  | 'lastEntryDate'
  | 'list1'
  | 'list2'
  | 'list3'
  | 'list4'
  | 'list5'
  | 'list6'
  | 'list7'
  | 'list8'
  | 'list9'
  | 'list10';

export const PAGE_SIZE = 200;
export const VISIBLE_COLUMNS_KEY = 'cost-update-all-products-visible-columns-v1';
export const STICKY_CODE_WIDTH = 170;
export const STICKY_NAME_WIDTH = 340;

export const COLUMN_DEFS: Array<{ id: ColumnId; label: string }> = [
  { id: 'productCode', label: 'Urun Kodu' },
  { id: 'productName', label: 'Urun Adi' },
  { id: 'mainSupplier', label: 'Ana Saglayici' },
  { id: 'category', label: 'Kategori' },
  { id: 'stock', label: 'Toplam Stok' },
  { id: 'currentCost', label: 'Guncel Maliyet' },
  { id: 'lastEntryPrice', label: 'Son Giris Maliyeti' },
  { id: 'lastEntryDate', label: 'Son Giris Tarihi' },
  { id: 'list1', label: 'Liste 1' },
  { id: 'list2', label: 'Liste 2' },
  { id: 'list3', label: 'Liste 3' },
  { id: 'list4', label: 'Liste 4' },
  { id: 'list5', label: 'Liste 5' },
  { id: 'list6', label: 'Liste 6' },
  { id: 'list7', label: 'Liste 7' },
  { id: 'list8', label: 'Liste 8' },
  { id: 'list9', label: 'Liste 9' },
  { id: 'list10', label: 'Liste 10' },
];

export const DEFAULT_COLUMNS: ColumnId[] = [
  'productCode',
  'productName',
  'mainSupplier',
  'category',
  'stock',
  'currentCost',
  'lastEntryPrice',
  'lastEntryDate',
  'list1',
  'list2',
  'list3',
  'list4',
  'list5',
  'list6',
  'list7',
  'list8',
  'list9',
  'list10',
];

export const toMoney = (value: unknown) => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '-';
  return num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const toDate = (value: unknown) => {
  if (!value) return '-';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('tr-TR');
};

/**
 * Tum Urunler Maliyet ve Fiyat Guncelleme ekraninin TUM is mantigi.
 * Klasik ve yeni gorunum bu hook'u tuketir; logic birebir korunmustur.
 * (Onceki CostUpdateAllProductsPage component'inin `return (` oncesindeki her sey aynen tasinmistir.)
 *
 * KRITIK: Mikro'ya maliyet + 10 fiyat listesi YAZAN handler'lar
 * (executeCostUpdate -> adminApi.updateUcarerProductCost) ve onlarin
 * onay/dogrulama akisi (updateCost + pendingUpdate modal mantigi) TEK SATIR
 * DEGISTIRILMEDEN buraya tasinmistir.
 */
export function useTumUrunlerMaliyetGuncelleme() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [rows, setRows] = useState<any[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<ColumnId[]>(DEFAULT_COLUMNS);
  const [sortKey, setSortKey] = useState<ColumnId>('productCode');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [mainSupplierByCode, setMainSupplierByCode] = useState<Record<string, { code: string; name: string }>>({});
  const [costPInputByCode, setCostPInputByCode] = useState<Record<string, string>>({});
  const [costTInputByCode, setCostTInputByCode] = useState<Record<string, string>>({});
  const [manualCostPOverrideByCode, setManualCostPOverrideByCode] = useState<Record<string, boolean>>({});
  const [vatRateByCode, setVatRateByCode] = useState<Record<string, number>>({});
  const [updatePriceListsByCode, setUpdatePriceListsByCode] = useState<Record<string, boolean>>({});
  const [updatingByCode, setUpdatingByCode] = useState<Record<string, boolean>>({});
  const [currentCostOverrideByCode, setCurrentCostOverrideByCode] = useState<Record<string, number>>({});
  const [priceListOverrideByCode, setPriceListOverrideByCode] = useState<Record<string, Record<number, number>>>({});
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<{ code: string; costP: number; costT: number; oldCost: number } | null>(null);

  const loadData = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    try {
      const response = await adminApi.getProducts({
        limit: 10000,
        sortBy: 'name',
        sortOrder: 'asc',
      });
      const products = response.products || [];
      setRows(products);
      setTotalRecords(Number(response?.pagination?.total || products.length || 0));

      const supplierMap: Record<string, { code: string; name: string }> = {};
      const vatMap: Record<string, number> = {};
      const codes = products
        .map((item: any) => String(item?.mikroCode || '').trim().toUpperCase())
        .filter(Boolean);
      const chunks: string[][] = [];
      for (let i = 0; i < codes.length; i += 200) chunks.push(codes.slice(i, i + 200));
      const detailResponses = await Promise.all(chunks.map((chunk) => adminApi.getProductsByCodes(chunk)));
      detailResponses.forEach((detail) => {
        (detail.products || []).forEach((product: any) => {
          const code = String(product?.mikroCode || '').trim().toUpperCase();
          const supplierCode = String(product?.mainSupplierCode || '').trim().toUpperCase();
          const supplierName = String(product?.mainSupplierName || '').trim();
          const vatRate = Number(product?.vatRate ?? 0);
          if (code && supplierCode) supplierMap[code] = { code: supplierCode, name: supplierName || supplierCode };
          if (code && Number.isFinite(vatRate)) vatMap[code] = vatRate;
        });
      });
      setMainSupplierByCode(supplierMap);
      setVatRateByCode(vatMap);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Rapor yuklenemedi');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(VISIBLE_COLUMNS_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as ColumnId[];
      const valid = parsed.filter((id) => COLUMN_DEFS.some((column) => column.id === id));
      if (valid.length > 0) setVisibleColumns(valid);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(VISIBLE_COLUMNS_KEY, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const toggleSort = (key: ColumnId) => {
    setSortKey((prev) => {
      if (prev !== key) {
        setSortDirection('asc');
        return key;
      }
      setSortDirection((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return prev;
    });
  };

  const sortIndicator = (key: ColumnId) => (sortKey === key ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : '');

  const getColumnValue = (item: any, key: ColumnId): string | number => {
    const code = String(item?.mikroCode || '').trim().toUpperCase();
    const overridePriceList = priceListOverrideByCode[code] || {};
    const mikroPriceLists = item?.mikroPriceLists || {};
    if (key === 'productCode') return code;
    if (key === 'productName') return String(item?.name || '');
    if (key === 'mainSupplier') return `${mainSupplierByCode[code]?.code || ''} ${mainSupplierByCode[code]?.name || ''}`.trim();
    if (key === 'category') return String(item?.category?.name || '');
    if (key === 'stock') return Number(item?.totalStock ?? 0);
    if (key === 'currentCost') return Number(currentCostOverrideByCode[code] ?? item?.currentCost ?? 0);
    if (key === 'lastEntryPrice') return Number(item?.lastEntryPrice ?? 0);
    if (key === 'lastEntryDate') return item?.lastEntryDate ? new Date(item.lastEntryDate).getTime() : 0;
    const listNo = Number(key.replace('list', ''));
    if (listNo >= 1 && listNo <= 10) return Number(overridePriceList[listNo] ?? mikroPriceLists[listNo] ?? 0);
    return '';
  };

  const filteredAndSortedRows = useMemo(() => {
    const tokens = buildSearchTokens(search);
    const filtered = rows.filter((item) => {
      if (tokens.length === 0) return true;
      const code = String(item?.mikroCode || '').trim().toUpperCase();
      const supplier = mainSupplierByCode[code];
      const haystack = normalizeSearchText(
        `${item?.name || ''} ${code} ${item?.category?.name || ''} ${supplier?.code || ''} ${supplier?.name || ''}`
      );
      return matchesSearchTokens(haystack, tokens);
    });
    filtered.sort((a, b) => {
      const av = getColumnValue(a, sortKey);
      const bv = getColumnValue(b, sortKey);
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDirection === 'asc' ? av - bv : bv - av;
      }
      const cmp = String(av || '').localeCompare(String(bv || ''), 'tr', { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return filtered;
  }, [rows, search, sortKey, sortDirection, mainSupplierByCode, currentCostOverrideByCode, priceListOverrideByCode]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredAndSortedRows.length / PAGE_SIZE)), [filteredAndSortedRows.length]);

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredAndSortedRows.slice(start, start + PAGE_SIZE);
  }, [filteredAndSortedRows, page]);

  const toggleColumn = (column: ColumnId) => {
    if (column === 'productCode' || column === 'productName') return;
    setVisibleColumns((prev) => {
      if (prev.includes(column)) {
        if (prev.length <= 1) return prev;
        return prev.filter((id) => id !== column);
      }
      return [...prev, column];
    });
  };

  const shouldUpdatePriceLists = (code: string) => updatePriceListsByCode[code] !== false;

  const executeCostUpdate = async (code: string, costP: number, costT: number) => {
    setUpdatingByCode((prev) => ({ ...prev, [code]: true }));
    try {
      const updatePriceLists = shouldUpdatePriceLists(code);
      const result = await adminApi.updateUcarerProductCost({
        productCode: code,
        costP,
        costT,
        updatePriceLists,
      });
      const verificationError = getPriceListVerificationError(result.data, updatePriceLists);
      if (verificationError) throw new Error(verificationError);
      const nextCost = Number(result?.data?.currentCost ?? costP);
      setCurrentCostOverrideByCode((prev) => ({ ...prev, [code]: nextCost }));

      const updatedLists: Array<{ listNo: number; value: number }> = result?.data?.updatedLists || [];
      if (updatedLists.length > 0) {
        setPriceListOverrideByCode((prev) => {
          const base = { ...(prev[code] || {}) };
          updatedLists.forEach((entry) => {
            if (Number.isFinite(Number(entry.listNo))) {
              base[Number(entry.listNo)] = Number(entry.value ?? 0);
            }
          });
          return { ...prev, [code]: base };
        });
      }

      if (updatePriceLists) toast.success('Maliyet ve 10 fiyat listesi dogrulanarak guncellendi.');
      else toast.success('Guncel maliyet guncellendi.');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.message || 'Guncelleme basarisiz');
    } finally {
      setUpdatingByCode((prev) => ({ ...prev, [code]: false }));
    }
  };

  const updateCost = async (item: any) => {
    const code = String(item?.mikroCode || '').trim().toUpperCase();
    const costP = Number(String(costPInputByCode[code] || '').replace(',', '.'));
    const costT = Number(String(costTInputByCode[code] || '').replace(',', '.'));
    if (!Number.isFinite(costP) || costP <= 0) return toast.error('Gecerli bir Maliyet P girin.');
    if (!Number.isFinite(costT) || costT <= 0) return toast.error('Gecerli bir Maliyet T girin.');

    if (shouldUpdatePriceLists(code)) {
      const oldCost = Number(currentCostOverrideByCode[code] ?? item?.currentCost ?? 0);
      setPendingUpdate({ code, costP, costT, oldCost });
      setConfirmModalOpen(true);
      return;
    }

    await executeCostUpdate(code, costP, costT);
  };

  return {
    // state
    loading,
    refreshing,
    search,
    setSearch,
    page,
    setPage,
    totalRecords,
    rows,
    visibleColumns,
    sortKey,
    sortDirection,
    mainSupplierByCode,
    costPInputByCode,
    setCostPInputByCode,
    costTInputByCode,
    setCostTInputByCode,
    manualCostPOverrideByCode,
    setManualCostPOverrideByCode,
    vatRateByCode,
    updatePriceListsByCode,
    setUpdatePriceListsByCode,
    updatingByCode,
    currentCostOverrideByCode,
    priceListOverrideByCode,
    confirmModalOpen,
    setConfirmModalOpen,
    pendingUpdate,
    setPendingUpdate,
    // derived
    filteredAndSortedRows,
    totalPages,
    pagedRows,
    // handlers
    loadData,
    toggleSort,
    sortIndicator,
    getColumnValue,
    toggleColumn,
    shouldUpdatePriceLists,
    executeCostUpdate,
    updateCost,
  };
}

export default useTumUrunlerMaliyetGuncelleme;
