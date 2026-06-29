'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api/admin';
import toast from 'react-hot-toast';
// 13.3: xlsx statik degil; export aninda dinamik import edilir.

export interface PriceListChange {
  listNo: number;
  listName: string;
  oldPrice: number;
  newPrice: number;
  changeAmount: number;
  changePercent: number;
}

export interface PriceChange {
  productCode: string;
  productName: string;
  category: string;
  changeDate: string;
  priceChanges: PriceListChange[];
  isConsistent: boolean;
  updatedListsCount: number;
  missingLists: number[];
  avgChangePercent: number;
  changeDirection: 'increase' | 'decrease' | 'mixed';
}

export interface Summary {
  totalChanges: number;
  consistentChanges: number;
  inconsistentChanges: number;
  inconsistencyRate: number;
  avgIncreasePercent: number;
  avgDecreasePercent: number;
  topIncreases: Array<{ product: string; percent: number }>;
  topDecreases: Array<{ product: string; percent: number }>;
  last30DaysChanges: number;
  last7DaysChanges: number;
}

export const priceListNames: { [key: number]: string } = {
  1: 'Perakende 1',
  2: 'Perakende 2',
  3: 'Perakende 3',
  4: 'Perakende 4',
  5: 'Perakende 5',
  6: 'Faturalı 1',
  7: 'Faturalı 2',
  8: 'Faturalı 3',
  9: 'Faturalı 4',
  10: 'Faturalı 5',
};

/**
 * Fiyat Gecmisi raporunun TUM is mantigi.
 * Klasik ve yeni gorunum bu hook'u tuketir; logic birebir korunmustur.
 * (Onceki PriceHistoryPage component'inin `return (` oncesindeki her sey aynen tasinmistir.)
 */
export function useFiyatGecmisi() {
  const [data, setData] = useState<PriceChange[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [consistencyFilter, setConsistencyFilter] = useState<string>('all');
  const [directionFilter, setDirectionFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await adminApi.getPriceHistory({
        page,
        limit: 50,
        sortBy: 'changeDate',
        sortOrder: 'desc',
        productName: searchQuery || undefined,
        category: categoryFilter || undefined,
        consistencyStatus: consistencyFilter as any,
        changeDirection: directionFilter as any,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });

      if (result.success) {
        setData(result.data.changes);
        setSummary(result.data.summary);
        setTotalPages(result.data.pagination.totalPages);
      }
    } catch (err: any) {
      console.error('Veri yüklenirken hata:', err);
      setError(err.response?.data?.error || 'Veri yüklenirken bir hata oluştu');
      toast.error('Veri yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, consistencyFilter, directionFilter]);

  const handleSearch = () => {
    setPage(1);
    fetchData();
  };

  const toggleRow = (index: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  const exportToExcel = async () => {
    const exportData = data.map((change) => ({
      'Tarih': new Date(change.changeDate).toLocaleDateString('tr-TR'),
      'Ürün Kodu': change.productCode,
      'Ürün Adı': change.productName,
      'Kategori': change.category,
      'Güncellenen Liste Sayısı': change.updatedListsCount,
      'Tutarlı': change.isConsistent ? 'Evet' : 'Hayır',
      'Ort. Değişim %': change.avgChangePercent.toFixed(2),
      'Yön': change.changeDirection === 'increase' ? 'Artış' : change.changeDirection === 'decrease' ? 'Azalış' : 'Karışık',
      'Eksik Listeler': change.missingLists.join(', ') || 'Yok',
    }));

    // 13.3: xlsx sadece burada (export aninda) dinamik yuklenir.
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fiyat Geçmişi');
    XLSX.writeFile(wb, `fiyat-gecmisi-${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Excel dosyası indirildi');
  };

  return {
    // state
    data,
    summary,
    loading,
    error,
    expandedRows,
    // filters
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    consistencyFilter,
    setConsistencyFilter,
    directionFilter,
    setDirectionFilter,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    page,
    setPage,
    totalPages,
    // handlers
    fetchData,
    handleSearch,
    toggleRow,
    exportToExcel,
  };
}

export default useFiyatGecmisi;
