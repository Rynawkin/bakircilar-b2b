'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { adminApi } from '@/lib/api/admin';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '@/lib/utils/search';
import { formatDateShort } from '@/lib/utils/format';
import toast from 'react-hot-toast';
// 13.3: xlsx statik degil; export aninda dinamik import edilir.

export interface CostUpdateAlert {
  productCode: string;
  productName: string;
  mainSupplierCode?: string | null;
  mainSupplierName?: string | null;
  category: string;
  currentCostDate: string | null;
  currentCost: number | null;
  lastEntryDate: string | null;
  lastEntryCost: number | null;
  diffAmount: number | null;
  diffPercent: number | null;
  dayDiff: number | null;
  stockQuantity: number | null;
  riskAmount: number | null;
  salePrice: number | null;
}

export interface Summary {
  totalAlerts: number;
  totalRiskAmount: number | null;
  totalStockValue: number | null;
  avgDiffPercent: number | null;
}

export interface Metadata {
  lastSyncAt: string | null;
  syncType: string | null;
}

export type SortDirection = 'asc' | 'desc';
export type SortKey =
  | 'productCode'
  | 'productName'
  | 'mainSupplierName'
  | 'currentCostDate'
  | 'currentCost'
  | 'lastEntryDate'
  | 'lastEntryCost'
  | 'diffAmount'
  | 'diffPercent'
  | 'dayDiff'
  | 'stockQuantity'
  | 'riskAmount';

export const PAGE_SIZE = 50;

/**
 * Maliyet Guncelleme Uyarilari raporunun TUM is mantigi.
 * Klasik ve yeni gorunum bu hook'u tuketir; logic birebir korunmustur.
 * (Onceki CostUpdateAlertsPage component'inin `return (` oncesindeki her sey aynen tasinmistir.)
 *
 * DIKKAT: updateProductCost -> adminApi.updateUcarerProductCost Mikro'ya maliyet/fiyat
 * YAZAR. Bu fonksiyonun ve handleManualSync (triggerSync) mantigi TEK SATIR degismemistir.
 */
export function useMaliyetGuncellemeUyarilari() {
  const [data, setData] = useState<CostUpdateAlert[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [dayDiffFilter, setDayDiffFilter] = useState<string>('');
  const [percentDiffFilter, setPercentDiffFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [currentCostByCode, setCurrentCostByCode] = useState<Record<string, number>>({});
  const [vatRateByCode, setVatRateByCode] = useState<Record<string, number>>({});
  const [mainSupplierByCode, setMainSupplierByCode] = useState<Record<string, { code: string; name: string }>>({});
  const [costPInputByCode, setCostPInputByCode] = useState<Record<string, string>>({});
  const [costTInputByCode, setCostTInputByCode] = useState<Record<string, string>>({});
  const [manualCostPOverrideByCode, setManualCostPOverrideByCode] = useState<Record<string, boolean>>({});
  const [updatePriceListsByCode, setUpdatePriceListsByCode] = useState<Record<string, boolean>>({});
  const [updatingCostByCode, setUpdatingCostByCode] = useState<Record<string, boolean>>({});
  const [sortKey, setSortKey] = useState<SortKey>('riskAmount');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const bottomScrollRef = useRef<HTMLDivElement | null>(null);
  const syncingScrollRef = useRef(false);
  const [bottomScrollbarWidth, setBottomScrollbarWidth] = useState(2400);

  const isFiniteNumber = (value: any): value is number => Number.isFinite(value);
  const toFixedSafe = (value: number | null | undefined, digits: number) =>
    isFiniteNumber(value) ? value.toFixed(digits) : '-';
  const toNumberFixed = (value: number | null | undefined, digits: number) =>
    isFiniteNumber(value) ? Number(value.toFixed(digits)) : '';

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await adminApi.getCostUpdateAlerts({
        page: 1,
        limit: 0,
        sortBy: 'riskAmount',
        sortOrder: 'desc',
        dayDiff: dayDiffFilter || undefined,
        percentDiff: percentDiffFilter || undefined,
      });

      if (result.success) {
        setData(result.data.products);
        setSummary(result.data.summary);
        setMetadata(result.data.metadata);
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
  }, [dayDiffFilter, percentDiffFilter]);

  useEffect(() => {
    const codeList = Array.from(
      new Set(
        (data || [])
          .map((item) => String(item?.productCode || '').trim().toUpperCase())
          .filter(Boolean)
      )
    );
    if (codeList.length === 0) {
      setCurrentCostByCode({});
      setVatRateByCode({});
      return;
    }

    let active = true;
    (async () => {
      try {
        const nextCost: Record<string, number> = {};
        const nextVat: Record<string, number> = {};
        const nextSupplier: Record<string, { code: string; name: string }> = {};
        for (let i = 0; i < codeList.length; i += 200) {
          const chunk = codeList.slice(i, i + 200);
          const response = await adminApi.getProductsByCodes(chunk);
          (response.products || []).forEach((product: any) => {
            const code = String(product?.mikroCode || '').trim().toUpperCase();
            const costValue = Number(product?.currentCost ?? 0);
            const vatValue = Number(product?.vatRate ?? 0);
            const supplierCode = String(product?.mainSupplierCode || '').trim().toUpperCase();
            const supplierName = String(product?.mainSupplierName || '').trim();
            if (code && Number.isFinite(costValue)) nextCost[code] = costValue;
            if (code && Number.isFinite(vatValue)) nextVat[code] = vatValue;
            if (code && supplierCode) nextSupplier[code] = { code: supplierCode, name: supplierName || supplierCode };
          });
        }
        if (!active) return;
        setCurrentCostByCode((prev) => ({ ...prev, ...nextCost }));
        setVatRateByCode((prev) => ({ ...prev, ...nextVat }));
        setMainSupplierByCode((prev) => ({ ...prev, ...nextSupplier }));
      } catch {
        if (!active) return;
      }
    })();

    return () => {
      active = false;
    };
  }, [data]);

  const handleManualSync = async () => {
    if (isSyncing) return;

    setIsSyncing(true);
    const syncToast = toast.loading('Senkronizasyon başlatılıyor...');

    try {
      const result = await adminApi.triggerSync();

      if (result.syncLogId) {
        toast.loading('Senkronizasyon devam ediyor...', { id: syncToast });

        // Sync tamamlanana kadar bekle
        let attempts = 0;
        const maxAttempts = 60; // 1 dakika

        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 saniye bekle

          const status = await adminApi.getSyncStatus(result.syncLogId);

          if (status.status === 'SUCCESS') {
            toast.success('Senkronizasyon tamamlandı!', { id: syncToast });
            // Raporu yenile
            await fetchData();
            break;
          } else if (status.status === 'FAILED') {
            toast.error('Senkronizasyon başarısız oldu', { id: syncToast });
            break;
          }

          attempts++;
        }

        if (attempts >= maxAttempts) {
          toast.dismiss(syncToast);
          toast('Senkronizasyon hala devam ediyor. Sayfa otomatik yenilenecek.', {
            icon: '⏳',
          });
          // Raporu yenile
          await fetchData();
        }
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Senkronizasyon başlatılamadı', {
        id: syncToast,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportExcel = async () => {
    if (isExporting) return;

    setIsExporting(true);
    const exportToast = toast.loading('Excel hazırlanıyor...');

    try {
      const result = await adminApi.getCostUpdateAlerts({
        page: 1,
        limit: 0,
        sortBy: 'riskAmount',
        sortOrder: 'desc',
        dayDiff: dayDiffFilter || undefined,
        percentDiff: percentDiffFilter || undefined,
      });

      if (!result.success) {
        throw new Error('Bir hata oluştu');
      }

      const exportBase = result.data.products as CostUpdateAlert[];
      const tokens = buildSearchTokens(searchQuery);
      const exportData = tokens.length > 0
        ? exportBase.filter((item) => {
            const haystack = normalizeSearchText(`${item.productName} ${item.productCode}`);
            return matchesSearchTokens(haystack, tokens);
          })
        : exportBase;

      if (exportData.length === 0) {
        toast.error('Dışa aktarılacak veri yok', { id: exportToast });
        return;
      }

      const exportSummary = result.data.summary;

      // Excel verisi hazırla - her satır bir obje
      const excelData = exportData.map((item) => ({
        'Ürün Kodu': item.productCode,
        'Ürün Adı': item.productName,
        'Ana Sağlayıcı Kodu': mainSupplierByCode[String(item.productCode || '').trim().toUpperCase()]?.code || '',
        'Ana Sağlayıcı Adı': mainSupplierByCode[String(item.productCode || '').trim().toUpperCase()]?.name || '',
        'Kategori': item.category,
        'Güncel Mal. Tarihi': formatDate(item.currentCostDate),
        'Güncel Maliyet (TL)': toNumberFixed(item.currentCost, 2),
        'Son Giriş Tarihi': formatDate(item.lastEntryDate),
        'Son Giriş Mal. (TL)': toNumberFixed(item.lastEntryCost, 2),
        'Fark (TL)': toNumberFixed(item.diffAmount, 2),
        'Fark (%)': toNumberFixed(item.diffPercent, 1),
        'Gün Farkı': isFiniteNumber(item.dayDiff) ? item.dayDiff : '',
        'Eldeki Stok': toNumberFixed(item.stockQuantity, 0),
        'Risk Tutarı (TL)': toNumberFixed(item.riskAmount, 2),
        'Satış Fiyatı (TL)': toNumberFixed(item.salePrice, 2),
      }));

      // Özet satırı ekle
      if (exportSummary) {
        excelData.push({} as any); // Boş satır
        excelData.push({
          'Ürün Kodu': 'TOPLAM',
          'Ürün Adı': `${exportSummary.totalAlerts} ürün`,
          'Kategori': '',
          'Güncel Mal. Tarihi': '',
          'Güncel Maliyet (TL)': '',
          'Son Giriş Tarihi': '',
          'Son Giriş Mal. (TL)': '',
          'Fark (TL)': '',
          'Fark (%)': `Ort: ${toFixedSafe(exportSummary.avgDiffPercent, 1)}%`,
          'Gün Farkı': '',
          'Eldeki Stok': '',
          'Risk Tutarı (TL)': toNumberFixed(exportSummary.totalRiskAmount, 2),
          'Satış Fiyatı (TL)': '',
        } as any);
      }

      // 13.3: xlsx sadece burada (export aninda) dinamik yuklenir.
      const XLSX = await import('xlsx');

      // Worksheet oluştur
      const ws = XLSX.utils.json_to_sheet(excelData);

      // Sütun genişliklerini ayarla
      ws['!cols'] = [
        { wch: 15 },  // Ürün Kodu
        { wch: 50 },  // Ürün Adı
        { wch: 20 },  // Ana Sağlayıcı Kodu
        { wch: 35 },  // Ana Sağlayıcı Adı
        { wch: 20 },  // Kategori
        { wch: 18 },  // Güncel Mal. Tarihi
        { wch: 18 },  // Güncel Maliyet
        { wch: 18 },  // Son Giriş Tarihi
        { wch: 18 },  // Son Giriş Mal.
        { wch: 12 },  // Fark (TL)
        { wch: 12 },  // Fark (%)
        { wch: 12 },  // Gün Farkı
        { wch: 15 },  // Eldeki Stok
        { wch: 18 },  // Risk Tutarı
        { wch: 18 },  // Satış Fiyatı
      ];

      // Workbook oluştur
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Maliyet Uyarıları');

      // Dosya adı
      const fileName = `maliyet-guncelleme-uyarilari-${new Date().toISOString().split('T')[0]}.xlsx`;

      // İndir
      XLSX.writeFile(wb, fileName);

      toast.success(`${exportData.length} kayıt Excel'e aktarıldı`, { id: exportToast });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message || 'Excel oluşturulamadı', {
        id: exportToast,
      });
    } finally {
      setIsExporting(false);
    }
  };

  const getRiskLevelColor = (percent: number | null | undefined) => {
    if (!isFiniteNumber(percent)) return 'text-slate-500 bg-slate-50';
    if (percent >= 20) return 'text-red-600 bg-red-50';
    if (percent >= 10) return 'text-orange-600 bg-orange-50';
    if (percent >= 5) return 'text-yellow-600 bg-yellow-50';
    return 'text-green-600 bg-green-50';
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (!isFiniteNumber(value)) return '-';
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return formatDateShort(dateStr);
  };

  const toggleSort = (key: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey !== key) {
        setSortDirection('asc');
        return key;
      }
      setSortDirection((prevDir) => (prevDir === 'asc' ? 'desc' : 'asc'));
      return prevKey;
    });
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  const getSortValue = (item: CostUpdateAlert, key: SortKey): string | number => {
    const code = String(item.productCode || '').trim().toUpperCase();
    if (key === 'mainSupplierName') return mainSupplierByCode[code]?.name || '';
    if (key === 'currentCostDate') return item.currentCostDate ? new Date(item.currentCostDate).getTime() : 0;
    if (key === 'lastEntryDate') return item.lastEntryDate ? new Date(item.lastEntryDate).getTime() : 0;
    if (key === 'currentCost') return currentCostByCode[code] ?? item.currentCost ?? 0;
    return (item as any)[key] ?? '';
  };

  const filteredDataBase = useMemo(() => {
    const tokens = buildSearchTokens(searchQuery);
    return data.filter((item) => {
      if (tokens.length === 0) return true;
      const code = String(item.productCode || '').trim().toUpperCase();
      const supplier = mainSupplierByCode[code];
      const haystack = normalizeSearchText(
        `${item.productName} ${item.productCode} ${supplier?.code || ''} ${supplier?.name || ''}`
      );
      return matchesSearchTokens(haystack, tokens);
    });
  }, [data, searchQuery, mainSupplierByCode]);
  const filteredData = useMemo(() => {
    const next = [...filteredDataBase];
    next.sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDirection === 'asc' ? av - bv : bv - av;
      }
      const compare = String(av || '').localeCompare(String(bv || ''), 'tr', { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? compare : -compare;
    });
    return next;
  }, [filteredDataBase, sortKey, sortDirection, mainSupplierByCode, currentCostByCode]);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE)), [filteredData.length]);
  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);
  const pagedData = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredData.slice(start, start + PAGE_SIZE);
  }, [filteredData, page]);
  const stickyCodeWidth = 150;
  const stickyNameWidth = 300;

  const codeSetInView = useMemo(
    () =>
      new Set(
        filteredData
          .map((item) => String(item.productCode || '').trim().toUpperCase())
          .filter(Boolean)
      ),
    [filteredData]
  );

  useEffect(() => {
    setCostPInputByCode((prev) => {
      const next: Record<string, string> = {};
      Object.entries(prev).forEach(([code, value]) => {
        if (codeSetInView.has(code)) next[code] = value;
      });
      return next;
    });
    setCostTInputByCode((prev) => {
      const next: Record<string, string> = {};
      Object.entries(prev).forEach(([code, value]) => {
        if (codeSetInView.has(code)) next[code] = value;
      });
      return next;
    });
    setManualCostPOverrideByCode((prev) => {
      const next: Record<string, boolean> = {};
      Object.entries(prev).forEach(([code, value]) => {
        if (codeSetInView.has(code)) next[code] = value;
      });
      return next;
    });
    setUpdatePriceListsByCode((prev) => {
      const next: Record<string, boolean> = {};
      Object.entries(prev).forEach(([code, value]) => {
        if (codeSetInView.has(code)) next[code] = value;
      });
      return next;
    });
    setUpdatingCostByCode((prev) => {
      const next: Record<string, boolean> = {};
      Object.entries(prev).forEach(([code, value]) => {
        if (codeSetInView.has(code)) next[code] = value;
      });
      return next;
    });
  }, [codeSetInView]);

  const updateProductCost = async (productCode: string) => {
    const code = String(productCode || '').trim().toUpperCase();
    const parsedCostP = Number(String(costPInputByCode[code] || '').replace(',', '.'));
    const parsedCostT = Number(String(costTInputByCode[code] || '').replace(',', '.'));
    if (!Number.isFinite(parsedCostP) || parsedCostP <= 0) {
      toast.error('Gecerli bir Maliyet P girin.');
      return;
    }
    if (!Number.isFinite(parsedCostT) || parsedCostT <= 0) {
      toast.error('Gecerli bir Maliyet T girin.');
      return;
    }

    setUpdatingCostByCode((prev) => ({ ...prev, [code]: true }));
    try {
      const result = await adminApi.updateUcarerProductCost({
        productCode: code,
        costP: parsedCostP,
        costT: parsedCostT,
        updatePriceLists: Boolean(updatePriceListsByCode[code]),
      });
      const newCostP = Number(result.data?.costP || parsedCostP);
      const newCostT = Number(result.data?.costT || parsedCostT);
      const newCost = Number(result.data?.currentCost || newCostP);
      setCurrentCostByCode((prev) => ({ ...prev, [code]: newCost }));
      setCostPInputByCode((prev) => ({ ...prev, [code]: String(newCostP) }));
      setCostTInputByCode((prev) => ({ ...prev, [code]: String(newCostT) }));
      const missing = result.data?.missingLists || [];
      if (Boolean(updatePriceListsByCode[code])) {
        if (missing.length > 0) {
          toast.success(`Maliyet guncellendi. Eksik liste satiri: ${missing.join(', ')}`);
        } else {
          toast.success('Maliyet ve 10 fiyat listesi guncellendi.');
        }
      } else {
        toast.success('Guncel maliyet guncellendi.');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Maliyet guncellenemedi');
    } finally {
      setUpdatingCostByCode((prev) => ({ ...prev, [code]: false }));
    }
  };

  useEffect(() => {
    const container = tableScrollRef.current;
    if (!container) return;
    const updateWidth = () => {
      const tableEl = container.querySelector('table') as HTMLElement | null;
      const width = tableEl?.scrollWidth || container.scrollWidth || 2400;
      setBottomScrollbarWidth(width);
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [filteredData.length, loading, error]);

  const syncFromMainScroll = () => {
    if (syncingScrollRef.current) return;
    const main = tableScrollRef.current;
    const bottom = bottomScrollRef.current;
    if (!main || !bottom) return;
    syncingScrollRef.current = true;
    bottom.scrollLeft = main.scrollLeft;
    syncingScrollRef.current = false;
  };
  const syncFromBottomScroll = () => {
    if (syncingScrollRef.current) return;
    const main = tableScrollRef.current;
    const bottom = bottomScrollRef.current;
    if (!main || !bottom) return;
    syncingScrollRef.current = true;
    main.scrollLeft = bottom.scrollLeft;
    syncingScrollRef.current = false;
  };

  return {
    // state
    data,
    summary,
    metadata,
    loading,
    error,
    isSyncing,
    isExporting,
    // filters
    searchQuery,
    setSearchQuery,
    dayDiffFilter,
    setDayDiffFilter,
    percentDiffFilter,
    setPercentDiffFilter,
    page,
    setPage,
    // per-code maps
    currentCostByCode,
    vatRateByCode,
    mainSupplierByCode,
    costPInputByCode,
    setCostPInputByCode,
    costTInputByCode,
    setCostTInputByCode,
    manualCostPOverrideByCode,
    setManualCostPOverrideByCode,
    updatePriceListsByCode,
    setUpdatePriceListsByCode,
    updatingCostByCode,
    // sort
    sortKey,
    sortDirection,
    toggleSort,
    sortIndicator,
    // refs / scroll sync
    tableScrollRef,
    bottomScrollRef,
    bottomScrollbarWidth,
    syncFromMainScroll,
    syncFromBottomScroll,
    // derived
    filteredData,
    totalPages,
    pagedData,
    stickyCodeWidth,
    stickyNameWidth,
    // helpers
    isFiniteNumber,
    toFixedSafe,
    toNumberFixed,
    formatCurrency,
    formatDate,
    getRiskLevelColor,
    // handlers
    fetchData,
    handleManualSync,
    handleExportExcel,
    updateProductCost,
  };
}

export default useMaliyetGuncellemeUyarilari;
