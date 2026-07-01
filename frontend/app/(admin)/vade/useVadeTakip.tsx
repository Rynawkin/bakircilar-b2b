'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import { VadeBalance } from '@/types';
import * as XLSX from 'xlsx';

// Re-export tipler (Classic/New JSX'lerin ihtiyaci icin)
export type { VadeBalance } from '@/types';

export type Pagination = { page: number; limit: number; total: number; totalPages: number };

/**
 * Vade Takip ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir.
 */
export function useVadeTakip() {
  const router = useRouter();
  const [balances, setBalances] = useState<VadeBalance[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const [sectorCode, setSectorCode] = useState('');
  const [groupCode, setGroupCode] = useState('');
  const [minBalance, setMinBalance] = useState('');
  const [maxBalance, setMaxBalance] = useState('');
  const [hasNotes, setHasNotes] = useState(false);
  const [notesKeyword, setNotesKeyword] = useState('');
  const [sortBy, setSortBy] = useState('pastDueBalance');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [summary, setSummary] = useState<{
    count: number;
    overdue: number;
    upcoming: number;
    total: number;
    aging?: Record<'d0_30' | 'd31_60' | 'd61_90' | 'd91_180' | 'd181_365' | 'd365plus', { amount: number; count: number }>;
    concentration?: { overdueCount: number; top10: number; top20: number; top50: number };
  }>({ count: 0, overdue: 0, upcoming: 0, total: 0 });
  const [filterOptions, setFilterOptions] = useState<{ sectorCodes: string[]; groupCodes: string[] }>({
    sectorCodes: [],
    groupCodes: [],
  });
  const [filtersOpen, setFiltersOpen] = useState(false);

  const fetchBalances = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminApi.getVadeBalances({
        search: search.trim() || undefined,
        page: pagination.page,
        limit: pagination.limit,
        overdueOnly,
        upcomingOnly,
        sectorCode: sectorCode || undefined,
        groupCode: groupCode || undefined,
        minBalance: minBalance !== '' ? Number(minBalance) : undefined,
        maxBalance: maxBalance !== '' ? Number(maxBalance) : undefined,
        hasNotes: hasNotes || undefined,
        notesKeyword: notesKeyword.trim() || undefined,
        sortBy,
        sortDirection,
      });
      setBalances(response.balances || []);
      setPagination(response.pagination);
      setSummary({
        count: response.pagination.total || 0,
        overdue: response.summary?.overdue || 0,
        upcoming: response.summary?.upcoming || 0,
        total: response.summary?.total || 0,
        aging: response.summary?.aging,
        concentration: response.summary?.concentration,
      });
    } catch (error) {
      console.error('Vade balances not loaded:', error);
      toast.error('Vade listesi yuklenemedi');
    } finally {
      setLoading(false);
    }
  }, [
    search,
    pagination.page,
    pagination.limit,
    overdueOnly,
    upcomingOnly,
    sectorCode,
    groupCode,
    minBalance,
    maxBalance,
    hasNotes,
    notesKeyword,
    sortBy,
    sortDirection,
  ]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  useEffect(() => {
    let mounted = true;
    adminApi.getVadeFilters()
      .then((data) => {
        if (!mounted) return;
        setFilterOptions({
          sectorCodes: data.sectorCodes || [],
          groupCodes: data.groupCodes || [],
        });
      })
      .catch((error) => {
        console.error('Vade filtreleri yuklenemedi:', error);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const totals = useMemo(() => summary, [summary]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await adminApi.triggerVadeSync();
      if (result.success) {
        toast.success('Vade senkronizasyonu basladi');
      } else {
        toast.error(result.error || 'Vade senkronizasyonu baslatilamadi');
      }
    } catch (error) {
      console.error('Vade sync error:', error);
      toast.error('Vade senkronizasyonu baslatilamadi');
    } finally {
      setSyncing(false);
    }
  };

  const handleSort = (key: string) => {
    setPagination((prev) => ({ ...prev, page: 1 }));
    if (sortBy === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(key);
    if (['customerName', 'mikroCariCode', 'sectorCode', 'groupCode', 'lastNoteAt'].includes(key)) {
      setSortDirection('asc');
    } else {
      setSortDirection('desc');
    }
  };

  const getSortIndicator = (key: string) => {
    if (sortBy !== key) return '';
    return sortDirection === 'asc' ? ' ^' : ' v';
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await adminApi.getVadeBalances({
        search: search.trim() || undefined,
        overdueOnly,
        upcomingOnly,
        sectorCode: sectorCode || undefined,
        groupCode: groupCode || undefined,
        minBalance: minBalance !== '' ? Number(minBalance) : undefined,
        maxBalance: maxBalance !== '' ? Number(maxBalance) : undefined,
        hasNotes: hasNotes || undefined,
        notesKeyword: notesKeyword.trim() || undefined,
        sortBy,
        sortDirection,
        export: true,
      });
      const rows = response.balances || [];
      if (rows.length === 0) {
        toast.error('Indirilecek kayit yok');
        return;
      }

      const exportRows = rows.map((balance) => ({
        'Cari Kodu': balance.user.mikroCariCode || '',
        'Cari Adi': balance.user.displayName || balance.user.mikroName || balance.user.name || '',
        Sektor: balance.user.sectorCode || '',
        Grup: balance.user.groupCode || '',
        'Vadesi Gecen': balance.pastDueBalance || 0,
        'Vadesi Gecen Vade': balance.pastDueDate ? formatDateShort(balance.pastDueDate) : '',
        Valor: balance.valor || 0,
        'Vadesi Gelmemis': balance.notDueBalance || 0,
        'Vadesi Gelmemis Vade': balance.notDueDate ? formatDateShort(balance.notDueDate) : '',
        Toplam: balance.totalBalance || 0,
        'Odeme Plani': balance.paymentTermLabel || balance.user.paymentPlanName || '',
        'Son Not Tarihi': balance.lastNoteAt ? formatDateShort(balance.lastNoteAt) : '',
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Vade Takip');
      const filename = `vade-takip-${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(workbook, filename);
      toast.success('Excel indirildi');
    } catch (error) {
      console.error('Vade export error:', error);
      toast.error('Excel indirilemedi');
    } finally {
      setExporting(false);
    }
  };

  return {
    // router
    router,
    // veri / yuklenme
    balances,
    loading,
    // sayfalama
    pagination,
    setPagination,
    // arama / toggle filtreler
    search,
    setSearch,
    overdueOnly,
    setOverdueOnly,
    upcomingOnly,
    setUpcomingOnly,
    hasNotes,
    setHasNotes,
    filtersOpen,
    setFiltersOpen,
    // genisletilmis filtreler
    sectorCode,
    setSectorCode,
    groupCode,
    setGroupCode,
    minBalance,
    setMinBalance,
    maxBalance,
    setMaxBalance,
    notesKeyword,
    setNotesKeyword,
    // siralama
    sortBy,
    setSortBy,
    sortDirection,
    setSortDirection,
    handleSort,
    getSortIndicator,
    // ozet
    totals,
    summary,
    // filtre secenekleri
    filterOptions,
    // durumlar
    syncing,
    exporting,
    // aksiyonlar
    fetchBalances,
    handleSync,
    handleExport,
  };
}

export default useVadeTakip;
