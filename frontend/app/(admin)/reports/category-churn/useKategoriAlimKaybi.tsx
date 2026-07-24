'use client';

import { Fragment, useEffect, useState } from 'react';
import { adminApi } from '@/lib/api/admin';
import { formatCurrency } from '@/lib/utils/format';
import toast from 'react-hot-toast';

/**
 * Kategori Alim Kaybi raporunun TUM is mantigi.
 * Klasik ve yeni gorunum bu hook'u tuketir; logic birebir korunmustur.
 * (Onceki CategoryChurnReportPage component'inin `return (` oncesindeki her sey
 *  aynen tasinmistir; hicbir state/effect/handler/turetilmis deger degismedi.)
 *
 * NOT: Fragment re-export edilir; Classic JSX birebir korunabilsin diye.
 */

export type ReportMode = 'category' | 'customer';
export type SortDirection = 'asc' | 'desc';
export type SortBy =
  | 'customerCode'
  | 'customerName'
  | 'customerSectorCode'
  | 'customerLastSaleDate'
  | 'categoryCode'
  | 'categoryName'
  | 'lastPurchaseDate'
  | 'historicalDocumentCount'
  | 'historicalQuantity'
  | 'historicalAmount';

export interface CategoryChurnRow {
  customerCode?: string;
  customerName?: string;
  customerSectorCode?: string | null;
  customerLastSaleDate?: string | null;
  daysSinceCustomerLastSale: number | null;
  categoryCode?: string;
  categoryName?: string;
  lastPurchaseDate: string | null;
  daysSinceCategoryPurchase: number | null;
  customerActiveOutsideCategory: boolean;
  historicalDocumentCount: number;
  historicalQuantity: number;
  historicalAmount: number;
}

export interface CategoryOption {
  categoryCode: string;
  categoryName: string | null;
}

export interface CategoryChurnDetailItem {
  productCode: string;
  productName: string;
  firstPurchaseDate: string | null;
  lastPurchaseDate: string | null;
  documentCount: number;
  totalQuantity: number;
  totalAmount: number;
}

export interface CategoryChurnSummary {
  totalRows: number;
  affectedCustomers: number;
  affectedCategories: number;
  historicalRevenue: number;
  activeOutsideCategoryCustomers: number;
  averageInactiveDays: number | null;
}

export interface CategoryChurnMetadata {
  mode: ReportMode;
  inactiveMonths: number;
  inactiveStartDate: string;
  endDate: string;
  activeCustomerMonths: number | null;
  sectorCode: string | null;
  minHistoricalDocumentCount: number | null;
  minHistoricalAmount: number | null;
  category?: {
    categoryCode: string;
    categoryName: string | null;
  };
  customer?: {
    customerCode: string;
    customerName: string | null;
  };
}

export interface SubmittedParams {
  mode: ReportMode;
  categoryCode?: string;
  customerCode?: string;
  inactiveMonths: number;
  activeCustomerMonths?: number;
  sectorCode?: string;
  minHistoricalDocumentCount?: number;
  minHistoricalAmount?: number;
}

export { Fragment, formatCurrency };

export function useKategoriAlimKaybi() {
  const [mode, setMode] = useState<ReportMode>('category');
  const [categorySearch, setCategorySearch] = useState('');
  const [categoryCode, setCategoryCode] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [categorySearching, setCategorySearching] = useState(false);

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerCode, setCustomerCode] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerOptions, setCustomerOptions] = useState<any[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);

  const [inactiveMonths, setInactiveMonths] = useState('4');
  const [activeFilterEnabled, setActiveFilterEnabled] = useState(true);
  const [activeCustomerMonths, setActiveCustomerMonths] = useState('4');
  const [sectorCode, setSectorCode] = useState('');
  const [sectorOptions, setSectorOptions] = useState<string[]>([]);
  const [minHistoricalDocumentCount, setMinHistoricalDocumentCount] = useState('2');
  const [minHistoricalAmount, setMinHistoricalAmount] = useState('0');

  const [submitted, setSubmitted] = useState<SubmittedParams | null>(null);
  const [rows, setRows] = useState<CategoryChurnRow[]>([]);
  const [summary, setSummary] = useState<CategoryChurnSummary | null>(null);
  const [metadata, setMetadata] = useState<CategoryChurnMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState<SortBy>('historicalDocumentCount');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [openDetailKey, setOpenDetailKey] = useState<string | null>(null);
  const [detailLoadingKey, setDetailLoadingKey] = useState<string | null>(null);
  const [detailsByKey, setDetailsByKey] = useState<Record<string, CategoryChurnDetailItem[]>>({});

  useEffect(() => {
    let active = true;
    adminApi
      .getSectorCodes()
      .then((result) => {
        if (active) setSectorOptions(result.sectorCodes || []);
      })
      .catch(() => {
        if (active) setSectorOptions([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (mode !== 'category') return;
    const handle = setTimeout(async () => {
      setCategorySearching(true);
      try {
        const result = await adminApi.getCategoryOptions({
          search: categorySearch.trim() || undefined,
          limit: 20,
        });
        setCategoryOptions(result?.data?.categories || []);
      } catch (_err) {
        setCategoryOptions([]);
      } finally {
        setCategorySearching(false);
      }
    }, 250);

    return () => clearTimeout(handle);
  }, [mode, categorySearch]);

  useEffect(() => {
    if (mode !== 'customer') return;
    const term = customerSearch.trim();
    if (term.length < 2) {
      setCustomerOptions([]);
      return;
    }

    const handle = setTimeout(async () => {
      setCustomerSearching(true);
      try {
        const result = await adminApi.searchCustomers({ searchTerm: term, limit: 12, offset: 0 });
        setCustomerOptions(result.data || []);
      } catch (_err) {
        setCustomerOptions([]);
      } finally {
        setCustomerSearching(false);
      }
    }, 300);

    return () => clearTimeout(handle);
  }, [customerSearch, mode]);

  const parseCustomerOption = (item: any) => {
    const code = String(item?.['msg_S_1032'] ?? item?.customerCode ?? '').trim();
    const name = String(item?.['msg_S_1033'] ?? item?.customerName ?? '').trim();
    const label = [code, name].filter(Boolean).join(' - ');
    return { code, name, label };
  };

  const handleSelectCustomer = (item: any) => {
    const parsed = parseCustomerOption(item);
    if (!parsed.code) return;
    setCustomerCode(parsed.code);
    setCustomerName(parsed.name);
    setCustomerSearch(parsed.label || parsed.code);
    setCustomerOptions([]);
  };

  const handleSelectCategory = (item: CategoryOption) => {
    setCategoryCode(item.categoryCode);
    setCategoryName(item.categoryName || '');
    setCategorySearch(`${item.categoryCode} - ${item.categoryName || '-'}`);
    setCategoryOptions([]);
  };

  const runReport = () => {
    const inactive = Number(inactiveMonths);
    if (!Number.isFinite(inactive) || inactive <= 0) {
      toast.error('Almama suresi (ay) gecersiz');
      return;
    }

    let activeMonthsValue: number | undefined;
    if (activeFilterEnabled) {
      const parsedActive = Number(activeCustomerMonths);
      if (!Number.isFinite(parsedActive) || parsedActive <= 0) {
        toast.error('Aktif cari suresi (ay) gecersiz');
        return;
      }
      activeMonthsValue = Math.floor(parsedActive);
    }

    const parsedMinDocuments = Number(minHistoricalDocumentCount);
    if (!Number.isFinite(parsedMinDocuments) || parsedMinDocuments < 1) {
      toast.error('Minimum geçmiş evrak sayısı en az 1 olmalı');
      return;
    }
    const parsedMinAmount = Number(minHistoricalAmount);
    if (!Number.isFinite(parsedMinAmount) || parsedMinAmount < 0) {
      toast.error('Minimum geçmiş ciro geçersiz');
      return;
    }
    const sharedFilters = {
      sectorCode: sectorCode.trim() || undefined,
      minHistoricalDocumentCount: Math.floor(parsedMinDocuments),
      minHistoricalAmount: parsedMinAmount > 0 ? parsedMinAmount : undefined,
    };

    if (mode === 'category') {
      let normalizedCategory = categoryCode.trim().toUpperCase();
      if (!normalizedCategory && categorySearch.trim()) {
        const term = categorySearch.trim().toLowerCase();
        const matched = categoryOptions.find((item) => {
          const code = item.categoryCode.toLowerCase();
          const name = (item.categoryName || '').toLowerCase();
          return code === term || name === term;
        });
        if (matched) {
          normalizedCategory = matched.categoryCode.toUpperCase();
          setCategoryCode(matched.categoryCode);
          setCategoryName(matched.categoryName || '');
          setCategorySearch(`${matched.categoryCode} - ${matched.categoryName || '-'}`);
        }
      }
      if (!normalizedCategory) {
        toast.error('Kategori secin');
        return;
      }
      setPage(1);
      setSubmitted({
        mode,
        categoryCode: normalizedCategory,
        inactiveMonths: Math.floor(inactive),
        activeCustomerMonths: activeMonthsValue,
        ...sharedFilters,
      });
      return;
    }

    const normalizedCustomer = (customerCode.trim() || customerSearch.trim()).toUpperCase();
    if (!normalizedCustomer) {
      toast.error('Cari secin');
      return;
    }

    setPage(1);
    setSubmitted({
      mode,
      customerCode: normalizedCustomer,
      inactiveMonths: Math.floor(inactive),
      activeCustomerMonths: activeMonthsValue,
      ...sharedFilters,
    });
  };

  const fetchReport = async (params: SubmittedParams, currentPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.getCategoryChurnReport({
        mode: params.mode,
        categoryCode: params.categoryCode,
        customerCode: params.customerCode,
        inactiveMonths: params.inactiveMonths,
        activeCustomerMonths: params.activeCustomerMonths,
        sectorCode: params.sectorCode,
        minHistoricalDocumentCount: params.minHistoricalDocumentCount,
        minHistoricalAmount: params.minHistoricalAmount,
        page: currentPage,
        limit: 50,
        sortBy,
        sortDirection,
      });

      if (!result.success) {
        throw new Error('Rapor yuklenemedi');
      }

      setRows(result.data.rows || []);
      setSummary(result.data.summary || null);
      setMetadata(result.data.metadata || null);
      setTotalPages(result.data.pagination?.totalPages || 1);
      setOpenDetailKey(null);
      setDetailLoadingKey(null);
      setDetailsByKey({});
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Rapor yuklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!submitted) return;
    fetchReport(submitted, page);
  }, [submitted, page, sortBy, sortDirection]);

  const tableMode = metadata?.mode || mode;
  const detailColSpan = tableMode === 'category' ? 10 : 9;

  const handleSort = (field: SortBy) => {
    setPage(1);
    if (sortBy === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(field);
    setSortDirection('asc');
  };

  const sortIndicator = (field: SortBy) => {
    if (sortBy !== field) return '-';
    return sortDirection === 'asc' ? '^' : 'v';
  };

  const handleExport = async () => {
    if (!submitted) {
      toast.error('Önce raporu çalıştırın');
      return;
    }

    setExporting(true);
    try {
      const blob = await adminApi.downloadCategoryChurnExport({
        mode: submitted.mode,
        categoryCode: submitted.categoryCode,
        customerCode: submitted.customerCode,
        inactiveMonths: submitted.inactiveMonths,
        activeCustomerMonths: submitted.activeCustomerMonths,
        sectorCode: submitted.sectorCode,
        minHistoricalDocumentCount: submitted.minHistoricalDocumentCount,
        minHistoricalAmount: submitted.minHistoricalAmount,
        sortBy,
        sortDirection,
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kategori-cari-alim-kesintileri-${submitted.mode}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Excel export başarısız');
    } finally {
      setExporting(false);
    }
  };

  const getRowKey = (row: CategoryChurnRow, index: number) => {
    const customerKey = row.customerCode || metadata?.customer?.customerCode || '-';
    const categoryKey = row.categoryCode || metadata?.category?.categoryCode || '-';
    return `${tableMode}:${customerKey}:${categoryKey}:${index}`;
  };

  const toggleDetail = async (row: CategoryChurnRow, index: number) => {
    const rowKey = getRowKey(row, index);
    if (openDetailKey === rowKey) {
      setOpenDetailKey(null);
      return;
    }

    setOpenDetailKey(rowKey);
    if (detailsByKey[rowKey]) return;

    const detailCategoryCode = row.categoryCode || metadata?.category?.categoryCode || '';
    const detailCustomerCode =
      tableMode === 'category'
        ? row.customerCode || ''
        : metadata?.customer?.customerCode || row.customerCode || '';

    if (!detailCategoryCode || !detailCustomerCode) {
      toast.error('Detay icin cari veya kategori bilgisi eksik');
      return;
    }

    setDetailLoadingKey(rowKey);
    try {
      const result = await adminApi.getCategoryChurnDetail({
        mode: tableMode,
        categoryCode: detailCategoryCode,
        customerCode: detailCustomerCode,
        inactiveMonths: metadata?.inactiveMonths || submitted?.inactiveMonths,
      });
      if (!result.success) {
        throw new Error('Detay yuklenemedi');
      }
      setDetailsByKey((prev) => ({
        ...prev,
        [rowKey]: result.data.items || [],
      }));
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Detay yuklenemedi');
      setOpenDetailKey(null);
    } finally {
      setDetailLoadingKey(null);
    }
  };

  return {
    // mode + filters
    mode,
    setMode,
    categorySearch,
    setCategorySearch,
    categoryCode,
    setCategoryCode,
    categoryName,
    setCategoryName,
    categoryOptions,
    categorySearching,
    customerSearch,
    setCustomerSearch,
    customerCode,
    setCustomerCode,
    customerName,
    setCustomerName,
    customerOptions,
    customerSearching,
    inactiveMonths,
    setInactiveMonths,
    activeFilterEnabled,
    setActiveFilterEnabled,
    activeCustomerMonths,
    setActiveCustomerMonths,
    sectorCode,
    setSectorCode,
    sectorOptions,
    minHistoricalDocumentCount,
    setMinHistoricalDocumentCount,
    minHistoricalAmount,
    setMinHistoricalAmount,
    // report state
    submitted,
    rows,
    summary,
    metadata,
    loading,
    exporting,
    error,
    page,
    setPage,
    totalPages,
    sortBy,
    sortDirection,
    openDetailKey,
    detailLoadingKey,
    detailsByKey,
    // derived
    tableMode,
    detailColSpan,
    // handlers / helpers
    parseCustomerOption,
    handleSelectCustomer,
    handleSelectCategory,
    runReport,
    fetchReport,
    handleSort,
    sortIndicator,
    handleExport,
    getRowKey,
    toggleDetail,
  };
}

export default useKategoriAlimKaybi;
