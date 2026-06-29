'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api/admin';
import toast from 'react-hot-toast';
// 8.2 + 13.3: xlsx artik statik degil; sadece Excel'e basinca dinamik import edilir.

export interface TopProduct {
  productCode: string;
  productName: string;
  brand: string;
  category: string;
  quantity: number;
  revenue: number;
  cost: number;
  profit: number;
  profitMargin: number;
  avgPrice: number;
  customerCount: number;
}

export interface Summary {
  totalRevenue: number;
  totalProfit: number;
  avgProfitMargin: number;
  totalProducts: number;
}

/**
 * En Cok Satan Urunler raporunun TUM is mantigi.
 * Klasik ve yeni gorunum bu hook'u tuketir; logic birebir korunmustur.
 * (Onceki TopProductsPage component'inin `return (` oncesindeki her sey aynen tasinmistir.)
 */
export function useEnCokSatan() {
  const [data, setData] = useState<TopProduct[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [sortBy, setSortBy] = useState<'revenue' | 'profit' | 'margin' | 'quantity'>('revenue');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // 8.2: Excel indir tum veriyi cekerken buton kilitlensin.
  const [exportLoading, setExportLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await adminApi.getTopProducts({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        brand: brand || undefined,
        category: category || undefined,
        sortBy,
        page,
        limit: 50,
      });

      if (result.success) {
        setData(result.data.products);
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
  }, [page, sortBy, startDate, endDate, brand, category]);

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
      const allProducts: TopProduct[] = [];
      let currentPage = 1;
      let pagesTotal = 1;
      let exportSummary: Summary | null = summary;

      do {
        const result = await adminApi.getTopProducts({
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          brand: brand || undefined,
          category: category || undefined,
          sortBy,
          page: currentPage,
          limit: exportLimit,
        });

        if (!result.success) {
          throw new Error('Veri çekilemedi');
        }

        allProducts.push(...result.data.products);
        // Summary tum veri seti bazinda gelir; TOPLAM satiri ile satirlar tutarli olsun.
        exportSummary = result.data.summary;
        pagesTotal = result.data.pagination.totalPages || 1;
        currentPage += 1;
      } while (currentPage <= pagesTotal);

      if (allProducts.length === 0) {
        toast.error('Dışa aktarılacak veri yok');
        return;
      }

      const excelData: any[] = allProducts.map((item) => ({
        'Ürün Kodu': item.productCode,
        'Ürün Adı': item.productName,
        'Marka': item.brand || '-',
        'Kategori': item.category || '-',
        'Satış Miktarı': parseFloat(item.quantity.toFixed(2)),
        'Ciro (TL)': parseFloat(item.revenue.toFixed(2)),
        'Maliyet (TL)': parseFloat(item.cost.toFixed(2)),
        'Kar (TL)': parseFloat(item.profit.toFixed(2)),
        'Kar Marjı (%)': parseFloat(item.profitMargin.toFixed(2)),
        'Ort. Fiyat (TL)': parseFloat(item.avgPrice.toFixed(2)),
        'Müşteri Sayısı': item.customerCount,
      }));

      if (exportSummary) {
        excelData.push({} as any);
        excelData.push({
          'Ürün Kodu': 'TOPLAM',
          'Ürün Adı': `${exportSummary.totalProducts} ürün`,
          'Marka': '',
          'Kategori': '',
          'Satış Miktarı': '',
          'Ciro (TL)': parseFloat(exportSummary.totalRevenue.toFixed(2)),
          'Maliyet (TL)': '',
          'Kar (TL)': parseFloat(exportSummary.totalProfit.toFixed(2)),
          'Kar Marjı (%)': parseFloat(exportSummary.avgProfitMargin.toFixed(2)),
          'Ort. Fiyat (TL)': '',
          'Müşteri Sayısı': '',
        } as any);
      }

      // 13.3: xlsx sadece burada (export aninda) dinamik yuklenir.
      const XLSX = await import('xlsx');

      const ws = XLSX.utils.json_to_sheet(excelData);
      ws['!cols'] = [
        { wch: 15 },  // Ürün Kodu
        { wch: 50 },  // Ürün Adı
        { wch: 15 },  // Marka
        { wch: 20 },  // Kategori
        { wch: 15 },  // Satış Miktarı
        { wch: 15 },  // Ciro
        { wch: 15 },  // Maliyet
        { wch: 15 },  // Kar
        { wch: 15 },  // Kar Marjı
        { wch: 15 },  // Ort. Fiyat
        { wch: 15 },  // Müşteri Sayısı
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'En Çok Satan Ürünler');

      const fileName = `en-cok-satan-urunler-${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);

      toast.success(`${allProducts.length} kayıt Excel'e aktarıldı`);
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

  const getSortLabel = () => {
    switch (sortBy) {
      case 'revenue': return 'Ciro';
      case 'profit': return 'Kar';
      case 'margin': return 'Kar Marjı';
      case 'quantity': return 'Miktar';
      default: return 'Ciro';
    }
  };

  return {
    // state
    data,
    summary,
    loading,
    error,
    // filters
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    brand,
    setBrand,
    category,
    setCategory,
    sortBy,
    setSortBy,
    page,
    setPage,
    totalPages,
    exportLoading,
    // handlers
    fetchData,
    handleExportExcel,
    // helpers
    formatCurrency,
    getSortLabel,
  };
}

export default useEnCokSatan;
