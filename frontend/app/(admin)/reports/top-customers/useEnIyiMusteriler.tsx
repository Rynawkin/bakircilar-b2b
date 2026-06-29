'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api/admin';
import toast from 'react-hot-toast';
// 8.2 + 13.3: xlsx artik statik degil; sadece Excel'e basinca dinamik import edilir.

export interface TopCustomer {
  customerCode: string;
  customerName: string;
  sector: string;
  orderCount: number;
  revenue: number;
  cost: number;
  profit: number;
  profitMargin: number;
  avgOrderAmount: number;
  topCategory: string;
  lastOrderDate: string;
}

export interface Summary {
  totalRevenue: number;
  totalProfit: number;
  avgProfitMargin: number;
  totalCustomers: number;
}

export type TopCustomerSortBy = 'revenue' | 'profit' | 'margin' | 'orderCount';

/**
 * "En Iyi Musteriler" raporunun TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir.
 */
export function useEnIyiMusteriler() {
  const [data, setData] = useState<TopCustomer[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sector, setSector] = useState('');
  const [sortBy, setSortBy] = useState<TopCustomerSortBy>('revenue');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // 8.2: Excel indir tum veriyi cekerken buton kilitlensin.
  const [exportLoading, setExportLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await adminApi.getTopCustomers({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        sector: sector || undefined,
        sortBy,
        page,
        limit: 50,
      });

      if (result.success) {
        setData(result.data.customers);
        setSummary(result.data.summary);
        setTotalPages(result.data.pagination.totalPages);
      } else {
        throw new Error('Bir hata oluştu');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Rapor yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, sortBy, startDate, endDate, sector]);

  const handleExportExcel = async () => {
    if (exportLoading) return;
    if (data.length === 0) {
      toast.error('Dışa aktarılacak veri yok');
      return;
    }

    setExportLoading(true);
    try {
      // 8.2: Excel tum veriyi icermeli. Mevcut filtrelerle butun sayfalari cekip topla.
      const exportLimit = 500; // her istekte daha cok kayit cekip istek sayisini azalt
      const allCustomers: TopCustomer[] = [];
      let currentPage = 1;
      let pagesTotal = 1;
      let exportSummary: Summary | null = summary;

      do {
        const result = await adminApi.getTopCustomers({
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          sector: sector || undefined,
          sortBy,
          page: currentPage,
          limit: exportLimit,
        });

        if (!result.success) {
          throw new Error('Veri çekilemedi');
        }

        allCustomers.push(...result.data.customers);
        // Summary tum veri seti bazinda gelir; TOPLAM satiri ile satirlar tutarli olsun.
        exportSummary = result.data.summary;
        pagesTotal = result.data.pagination.totalPages || 1;
        currentPage += 1;
      } while (currentPage <= pagesTotal);

      if (allCustomers.length === 0) {
        toast.error('Dışa aktarılacak veri yok');
        return;
      }

      const excelData: any[] = allCustomers.map((item) => ({
        'Müşteri Kodu': item.customerCode,
        'Müşteri Adı': item.customerName,
        'Sektör': item.sector || '-',
        'Sipariş Sayısı': item.orderCount,
        'Ciro (TL)': parseFloat(item.revenue.toFixed(2)),
        'Maliyet (TL)': parseFloat(item.cost.toFixed(2)),
        'Kar (TL)': parseFloat(item.profit.toFixed(2)),
        'Kar Marjı (%)': parseFloat(item.profitMargin.toFixed(2)),
        'Ort. Sipariş (TL)': parseFloat(item.avgOrderAmount.toFixed(2)),
        'En Çok Aldığı Kategori': item.topCategory || '-',
        'Son Sipariş': formatDate(item.lastOrderDate),
      }));

      if (exportSummary) {
        excelData.push({} as any);
        excelData.push({
          'Müşteri Kodu': 'TOPLAM',
          'Müşteri Adı': `${exportSummary.totalCustomers} müşteri`,
          'Sektör': '',
          'Sipariş Sayısı': '',
          'Ciro (TL)': parseFloat(exportSummary.totalRevenue.toFixed(2)),
          'Maliyet (TL)': '',
          'Kar (TL)': parseFloat(exportSummary.totalProfit.toFixed(2)),
          'Kar Marjı (%)': parseFloat(exportSummary.avgProfitMargin.toFixed(2)),
          'Ort. Sipariş (TL)': '',
          'En Çok Aldığı Kategori': '',
          'Son Sipariş': '',
        } as any);
      }

      // 13.3: xlsx sadece burada (export aninda) dinamik yuklenir.
      const XLSX = await import('xlsx');

      const ws = XLSX.utils.json_to_sheet(excelData);
      ws['!cols'] = [
        { wch: 15 },  // Müşteri Kodu
        { wch: 40 },  // Müşteri Adı
        { wch: 15 },  // Sektör
        { wch: 15 },  // Sipariş Sayısı
        { wch: 15 },  // Ciro
        { wch: 15 },  // Maliyet
        { wch: 15 },  // Kar
        { wch: 15 },  // Kar Marjı
        { wch: 15 },  // Ort. Sipariş
        { wch: 25 },  // En Çok Aldığı Kategori
        { wch: 18 },  // Son Sipariş
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'En İyi Müşteriler');

      const fileName = `en-iyi-musteriler-${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);

      toast.success(`${allCustomers.length} kayıt Excel'e aktarıldı`);
    } catch (err: any) {
      toast.error(err?.message || 'Excel oluşturulamadı');
    } finally {
      setExportLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('tr-TR');
  };

  const getSortLabel = () => {
    switch (sortBy) {
      case 'revenue': return 'Ciro';
      case 'profit': return 'Kar';
      case 'margin': return 'Kar Marjı';
      case 'orderCount': return 'Sipariş Sayısı';
      default: return 'Ciro';
    }
  };

  return {
    // veri / durum
    data,
    summary,
    loading,
    error,
    // filtreler
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    sector,
    setSector,
    sortBy,
    setSortBy,
    // sayfalama
    page,
    setPage,
    totalPages,
    // export
    exportLoading,
    // aksiyonlar
    fetchData,
    handleExportExcel,
    // yardimci / formatlayicilar
    formatCurrency,
    formatDate,
    getSortLabel,
  };
}

export default useEnIyiMusteriler;
