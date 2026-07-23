'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { adminApi } from '@/lib/api/admin';
import { getPriceListVerificationError } from '@/lib/utils/costPriceUpdate';
import { isStandardPriceListNo } from '@/lib/utils/priceLists';
import type {
  PriceMarginConsistencyReport,
  PriceMarginConsistencyRow,
  PriceMarginListCheck,
  PriceMarginListStatus,
} from '@/types';

export type IssueFilter = 'ALL' | 'PROBLEM' | Exclude<PriceMarginListStatus, 'OK'>;

const EMPTY_REPORT: PriceMarginConsistencyReport = {
  rows: [],
  summary: {
    totalProducts: 0,
    compliantProducts: 0,
    problemProducts: 0,
    priceMismatchProducts: 0,
    missingMarginProducts: 0,
    missingPriceProducts: 0,
    missingCostProducts: 0,
    duplicatePriceProducts: 0,
    filteredProducts: 0,
  },
  pagination: { page: 1, limit: 50, totalRecords: 0, totalPages: 1 },
  options: { categories: [], brands: [], suppliers: [] },
  metadata: {
    generatedAt: '',
    stale: false,
    staleReason: null,
    cacheTtlSeconds: 300,
    tolerance: 0.005,
    source: 'MIKRO_LIVE',
  },
};

export const ISSUE_LABELS: Record<PriceMarginListStatus, string> = {
  OK: 'Uyumlu',
  MISSING_COST: 'Maliyet eksik',
  MISSING_MARGIN: 'Marj eksik/bozuk',
  MISSING_PRICE: 'Fiyat satiri eksik',
  PRICE_MISMATCH: 'Fiyat uyumsuz',
  DUPLICATE_PRICE: 'Cift fiyat uyumsuz',
};

export const formatMoney = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(Number(value))
    ? '-'
    : Number(value).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export const formatPercent = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(Number(value))
    ? '-'
    : `${Number(value).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

// Operasyon ekranlarindaki adlandirma Mikro kolon adlarinin tersidir:
// Mikro MaliyetP ekranda T, Mikro MaliyetT ise ekranda P olarak gosterilir.
export const operationalCostType = (costType: 'T' | 'P'): 'T' | 'P' =>
  costType === 'P' ? 'T' : 'P';

export const canRepairRow = (row: PriceMarginConsistencyRow) =>
  Number(row.costP || 0) > 0 &&
  Number(row.costT || 0) > 0 &&
  row.margins.length === 6 &&
  row.margins.every((margin) => Number(margin || 0) > 0) &&
  row.problemListCount > 0;

export const getVisibleChecks = (row: PriceMarginConsistencyRow, listNo: number) =>
  isStandardPriceListNo(listNo)
    ? row.listChecks.filter((check) => check.listNo === listNo)
    : row.listChecks;

export function usePriceMarginConsistency() {
  const [report, setReport] = useState<PriceMarginConsistencyReport>(EMPTY_REPORT);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [issueType, setIssueType] = useState<IssueFilter>('PROBLEM');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [supplier, setSupplier] = useState('');
  const [listNo, setListNo] = useState(0);
  const [minDifferenceAmount, setMinDifferenceAmount] = useState('');
  const [minDifferencePercent, setMinDifferencePercent] = useState('');
  const [sortBy, setSortBy] = useState('maxDifferenceAmount');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [repairRows, setRepairRows] = useState<PriceMarginConsistencyRow[]>([]);
  const [repairing, setRepairing] = useState(false);
  const [repairProgress, setRepairProgress] = useState({ current: 0, total: 0 });
  const [exporting, setExporting] = useState(false);

  const requestParams = useMemo(() => ({
    search: search || undefined,
    issueType,
    category: category || undefined,
    brand: brand || undefined,
    supplier: supplier || undefined,
    listNo: listNo || undefined,
    minDifferenceAmount: minDifferenceAmount ? Number(minDifferenceAmount.replace(',', '.')) : undefined,
    minDifferencePercent: minDifferencePercent ? Number(minDifferencePercent.replace(',', '.')) : undefined,
    sortBy,
    sortOrder,
  }), [
    search,
    issueType,
    category,
    brand,
    supplier,
    listNo,
    minDifferenceAmount,
    minDifferencePercent,
    sortBy,
    sortOrder,
  ]);

  const loadReport = useCallback(async (options?: { refresh?: boolean; pageOverride?: number }) => {
    const refresh = Boolean(options?.refresh);
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await adminApi.getPriceMarginConsistencyReport({
        ...requestParams,
        page: options?.pageOverride || page,
        limit: 50,
        refresh,
      });
      setReport(response.data);
      setPage(response.data.pagination.page);
      setSelectedCodes((previous) => {
        const visible = new Set(response.data.rows.map((row) => row.productCode));
        return new Set(Array.from(previous).filter((code) => visible.has(code)));
      });
      if (response.data.metadata.stale) {
        toast.error('Canli Mikro yenilemesi basarisiz; son bilinen rapor gosteriliyor.');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.message || 'Marj uyum raporu alinamadi.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, requestParams]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const applyFilters = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setIssueType('PROBLEM');
    setCategory('');
    setBrand('');
    setSupplier('');
    setListNo(0);
    setMinDifferenceAmount('');
    setMinDifferencePercent('');
    setSortBy('maxDifferenceAmount');
    setSortOrder('desc');
    setPage(1);
  };

  const toggleExpanded = (productCode: string) => {
    setExpandedCodes((previous) => {
      const next = new Set(previous);
      if (next.has(productCode)) next.delete(productCode);
      else next.add(productCode);
      return next;
    });
  };

  const toggleSelected = (row: PriceMarginConsistencyRow) => {
    if (!canRepairRow(row)) return;
    setSelectedCodes((previous) => {
      const next = new Set(previous);
      if (next.has(row.productCode)) next.delete(row.productCode);
      else next.add(row.productCode);
      return next;
    });
  };

  const selectableRows = report.rows.filter(canRepairRow);
  const allSelectableSelected = selectableRows.length > 0 && selectableRows.every((row) => selectedCodes.has(row.productCode));

  const toggleAllVisible = () => {
    setSelectedCodes((previous) => {
      const next = new Set(previous);
      if (allSelectableSelected) selectableRows.forEach((row) => next.delete(row.productCode));
      else selectableRows.forEach((row) => next.add(row.productCode));
      return next;
    });
  };

  const openRepair = (rows: PriceMarginConsistencyRow[]) => {
    const repairable = rows.filter(canRepairRow);
    if (repairable.length === 0) {
      toast.error('Secilen urunlerde maliyet veya marj eksik; otomatik fiyat duzeltmesi yapilamaz.');
      return;
    }
    setRepairRows(repairable);
    setRepairProgress({ current: 0, total: repairable.length });
  };

  const openSelectedRepair = () => {
    openRepair(report.rows.filter((row) => selectedCodes.has(row.productCode)));
  };

  const closeRepair = () => {
    if (repairing) return;
    setRepairRows([]);
  };

  const confirmRepair = async () => {
    if (repairRows.length === 0 || repairing) return;
    setRepairing(true);
    setRepairProgress({ current: 0, total: repairRows.length });
    let successCount = 0;
    const failures: string[] = [];
    try {
      for (let index = 0; index < repairRows.length; index += 1) {
        const row = repairRows[index];
        setRepairProgress({ current: index + 1, total: repairRows.length });
        try {
          const response = await adminApi.updateUcarerProductCost({
            productCode: row.productCode,
            costP: Number(row.costP),
            costT: Number(row.costT),
            updatePriceLists: true,
          });
          const verificationError = getPriceListVerificationError(response.data, true);
          if (verificationError) throw new Error(verificationError);
          successCount += 1;
        } catch (error: any) {
          failures.push(`${row.productCode}: ${error?.response?.data?.error || error?.message || 'Guncellenemedi'}`);
        }
      }

      if (failures.length > 0) {
        toast.error(`${successCount} urun duzeltildi, ${failures.length} urun hata aldi. ${failures.slice(0, 2).join(' | ')}`);
      } else {
        toast.success(`${successCount} urunun 12 ana fiyat listesi dogrulanarak duzeltildi.`);
      }
      setRepairRows([]);
      setSelectedCodes(new Set());
      await loadReport({ refresh: true, pageOverride: page });
    } finally {
      setRepairing(false);
    }
  };

  const exportToExcel = async () => {
    if (exporting) return;
    setExporting(true);
    const toastId = toast.loading('Uyum raporu Excel icin hazirlaniyor...');
    try {
      const first = await adminApi.getPriceMarginConsistencyReport({
        ...requestParams,
        page: 1,
        limit: 1000,
      });
      const allRows = [...first.data.rows];
      for (let exportPage = 2; exportPage <= first.data.pagination.totalPages; exportPage += 1) {
        const next = await adminApi.getPriceMarginConsistencyReport({
          ...requestParams,
          page: exportPage,
          limit: 1000,
        });
        allRows.push(...next.data.rows);
      }

      const exportRows = allRows.flatMap((row) =>
        getVisibleChecks(row, listNo).map((check: PriceMarginListCheck) => ({
          'Urun Kodu': row.productCode,
          'Urun Adi': row.productName,
          'Kategori': row.categoryName || row.categoryCode || '',
          'Marka': row.brandCode || '',
          'Ana Saglayici': [row.mainSupplierCode, row.mainSupplierName].filter(Boolean).join(' - '),
          'Maliyet T': row.costP,
          'Maliyet P': row.costT,
          'Liste': check.listNo,
          'Maliyet Tipi': operationalCostType(check.costType),
          'Marj No': check.marginNo,
          'Marj': check.margin,
          'Beklenen Fiyat': check.expectedPrice,
          'Mevcut Fiyat': check.actualPrice,
          'Fark TL': check.differenceAmount,
          'Fark %': check.differencePercent,
          'Fiyat Satiri': check.priceRowCount,
          'Durum': ISSUE_LABELS[check.status],
        }))
      );

      const XLSX = await import('xlsx');
      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      worksheet['!cols'] = [14, 38, 22, 16, 30, 13, 13, 8, 12, 9, 10, 16, 16, 13, 12, 12, 22].map((wch) => ({ wch }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Marj Uyum');
      XLSX.writeFile(workbook, `liste-fiyati-marj-uyum-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`${allRows.length} urun Excel'e aktarildi.`, { id: toastId });
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.message || 'Excel olusturulamadi.', { id: toastId });
    } finally {
      setExporting(false);
    }
  };

  return {
    report,
    loading,
    refreshing,
    searchInput,
    setSearchInput,
    issueType,
    setIssueType,
    category,
    setCategory,
    brand,
    setBrand,
    supplier,
    setSupplier,
    listNo,
    setListNo,
    minDifferenceAmount,
    setMinDifferenceAmount,
    minDifferencePercent,
    setMinDifferencePercent,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    page,
    setPage,
    expandedCodes,
    selectedCodes,
    repairRows,
    repairing,
    repairProgress,
    exporting,
    allSelectableSelected,
    applyFilters,
    clearFilters,
    toggleExpanded,
    toggleSelected,
    toggleAllVisible,
    openRepair,
    openSelectedRepair,
    closeRepair,
    confirmRepair,
    exportToExcel,
    loadReport,
  };
}
