'use client';

import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import {
  TrendingUp,
  ArrowLeft,
  Download,
  RefreshCw,
  Search,
  AlertCircle,
  DollarSign,
  Package,
  FileText,
  Percent,
} from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { adminApi } from '@/lib/api/admin';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '@/lib/utils/search';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

// 019703 Raporu veri yapısı
interface MarginAnalysisRow {
  [key: string]: any;
  msg_S_0089: string; // Evrak No
  msg_S_0001: string; // Stok Kodu
  Tip: string; // Bekleyen Sipariş / Fatura
  GrupKodu: string; // Kategori/Grup
  SektorKodu: string; // Sektör
  'Cari Kodu': string;
  'Cari İsmi': string;
  'Evrak Tarihi': string;
  'Evrak No': string;
  'Belge No': string;
  'Stok Kodu': string;
  'Stok İsmi': string;
  Miktar: number;
  Birimi: string;
  BirimSatış: number;
  BirimSatışKDV: number;
  Tutar: number;
  TutarKDV: number;
  'SÖ-BirimMaliyet': number; // Son giriş maliyeti
  'Sö-BirimMaliyetKdv': number;
  'SÖ-BirimKar': number;
  'SÖ-ToplamKar': number;
  'SÖ-KarYuzde': number; // Son giriş maliyetine göre kar %
  OrtalamaMaliyet: number;
  OrtalamaMaliyetKDVli: number;
  BirimKarOrtMalGöre: number;
  ToplamKarOrtMalGöre: number;
  OrtalamaKarYuzde: number; // Ortalama maliyete göre kar %
  'Satıcı Kodu': string;
  'Satıcı İsmi': string;
}

interface SummaryBucket {
  totalRecords: number;
  totalDocuments: number;
  totalRevenue: number;
  totalProfit: number;
  entryProfit: number;
  avgMargin: number;
  negativeLines: number;
  negativeDocuments: number;
}

interface Summary {
  totalRecords: number;
  totalDocuments: number;
  totalRevenue: number;
  totalProfit: number;
  entryProfit: number;
  avgMargin: number;
  highMarginCount: number;
  lowMarginCount: number;
  negativeMarginCount: number;
  orderSummary: SummaryBucket;
  salesSummary: SummaryBucket;
  salespersonSummary: Array<{
    sectorCode: string;
    orderSummary: SummaryBucket;
    salesSummary: SummaryBucket;
  }>;
}


interface Metadata {
  reportDate: string;
  startDate: string;
  endDate: string;
  includeCompleted: number;
}

type ColumnId = string;

interface ColumnConfig {
  id: ColumnId;
  label: string;
  headerClassName?: string;
  cellClassName?: string;
  render: (row: MarginAnalysisRow) => ReactNode;
  exportValue: (row: MarginAnalysisRow) => string | number | null;
}

const DEFAULT_COLUMN_IDS: ColumnId[] = [
  'documentNo',
  'documentType',
  'documentDate',
  'customerName',
  'stockCode',
  'stockName',
  'quantity',
  'unitPrice',
  'totalAmount',
  'avgCost',
  'unitProfit',
  'totalProfit',
  'margin',
];

const BASE_DATA_KEYS = new Set([
  'Evrak No',
  'Tip',
  'Evrak Tarihi',
  'Cari İsmi',
  'Stok Kodu',
  'Stok İsmi',
  'Miktar',
  'Birimi',
  'BirimSatışKDV',
  'TutarKDV',
  'OrtalamaMaliyetKDVli',
  'BirimKarOrtMalGöre',
  'ToplamKarOrtMalGöre',
  'OrtalamaKarYuzde',
]);

const COLUMN_STORAGE_KEY = 'margin-analysis-columns';

const getDefaultDateValue = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toLocaleDateString('en-CA');
};

export default function MarginAnalysisPage() {
  const [data, setData] = useState<MarginAnalysisRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [startDate, setStartDate] = useState(() => getDefaultDateValue());
  const [endDate, setEndDate] = useState(() => getDefaultDateValue());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [visibleColumns, setVisibleColumns] = useState<ColumnId[]>(DEFAULT_COLUMN_IDS);
  const hasInitializedColumns = useRef(false);
  const [emailColumnIds, setEmailColumnIds] = useState<ColumnId[]>([]);
  const [savingEmailColumns, setSavingEmailColumns] = useState(false);
  const [syncingReport, setSyncingReport] = useState(false);
  const [sendingReportEmail, setSendingReportEmail] = useState(false);

  const isSingleDate = startDate === endDate;

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await adminApi.getMarginComplianceReport({
        startDate: startDate.replace(/-/g, ''),
        endDate: endDate.replace(/-/g, ''),
        includeCompleted: 1,
        page,
        limit: 100,
        sortBy: 'OrtalamaKarYuzde',
        sortOrder: sortOrder,
        status: statusFilter || undefined,
      });

      if (result.success) {
        setData(result.data.data);
        setSummary(result.data.summary);
        setMetadata(result.data.metadata);
        setTotalPages(result.data.pagination.totalPages);
      } else {
        throw new Error('Bir hata oluştu');
      }
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Rapor yüklenemedi';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, statusFilter, sortOrder]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settings = await adminApi.getSettings();
        if (Array.isArray(settings.marginReportEmailColumns)) {
          setEmailColumnIds(settings.marginReportEmailColumns);
        }
      } catch (err) {
        console.error('Margin report email settings not loaded:', err);
      }
    };

    fetchSettings();
  }, []);

  useEffect(() => {
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const handleSearch = () => {
    setPage(1);
    fetchData();
  };
  const toggleColumn = (columnId: ColumnId) => {
    setVisibleColumns((prev) => {
      if (prev.includes(columnId)) {
        return prev.length === 1 ? prev : prev.filter((id) => id !== columnId);
      }
      return [...prev, columnId];
    });
  };


  const getSelectedReportDate = () => {
    if (!isSingleDate) {
      toast.error('Tek bir gun secin');
      return null;
    }
    return startDate.replace(/-/g, '');
  };

  const handleResyncReport = async () => {
    const reportDate = getSelectedReportDate();
    if (!reportDate) return;
    setSyncingReport(true);
    try {
      const result = await adminApi.syncMarginComplianceReport({ reportDate });
      if (result.success) {
        toast.success('Rapor yeniden cekildi');
        fetchData();
      } else {
        throw new Error(result.error || 'Rapor yenilenemedi');
      }
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Rapor yenilenemedi';
      toast.error(message);
    } finally {
      setSyncingReport(false);
    }
  };

  const handleSendReportEmail = async () => {
    const reportDate = getSelectedReportDate();
    if (!reportDate) return;
    setSendingReportEmail(true);
    try {
      const result = await adminApi.sendMarginComplianceReportEmail({ reportDate });
      if (result.success) {
        toast.success('Mail gonderildi');
      } else {
        throw new Error(result.error || 'Mail gonderilemedi');
      }
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Mail gonderilemedi';
      toast.error(message);
    } finally {
      setSendingReportEmail(false);
    }
  };

  const handleSaveEmailColumns = async () => {
    const selected = visibleColumns.filter((id) => columnDefs.some((column) => column.id === id));
    if (selected.length === 0) {
      toast.error('Mail icin en az bir kolon secin');
      return;
    }
    setSavingEmailColumns(true);
    try {
      await adminApi.updateSettings({ marginReportEmailColumns: selected });
      setEmailColumnIds(selected);
      toast.success('Mail excel kolonlari kaydedildi');
    } catch (err) {
      console.error('Margin report email columns update error:', err);
      toast.error('Mail kolonlari kaydedilemedi');
    } finally {
      setSavingEmailColumns(false);
    }
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '₺0.00';
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
    }).format(value);
  };

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '0%';
    return `${value.toFixed(2)}%`;
  };

  const formatCount = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '0';
    return new Intl.NumberFormat('tr-TR').format(value);
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('tr-TR');
    } catch {
      return dateStr;
    }
  };

  const formatCellValue = (value: unknown) => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'number') return value.toLocaleString('tr-TR');
    if (typeof value === 'boolean') return value ? 'Evet' : 'Hayir';
    return String(value);
  };

  const formatExportValue = (value: unknown) => {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') return JSON.stringify(value);
    return value as string | number;
  };

  const renderSummaryBucket = (title: string, bucket: SummaryBucket) => (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>KDV haric degerler</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Toplam Evrak</span>
            <span className="font-semibold">{formatCount(bucket.totalDocuments)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Toplam Satir</span>
            <span className="font-semibold">{formatCount(bucket.totalRecords)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Ciro (KDV Haric)</span>
            <span className="font-semibold">{formatCurrency(bucket.totalRevenue)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Kar (KDV Haric)</span>
            <span className="font-semibold">{formatCurrency(bucket.totalProfit)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Kar (Son Giris)</span>
            <span className="font-semibold">{formatCurrency(bucket.entryProfit)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Ortalama Kar %</span>
            <span className="font-semibold">{formatPercent(bucket.avgMargin)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Zararli Evrak</span>
            <span className="font-semibold">{formatCount(bucket.negativeDocuments)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Zararli Satir</span>
            <span className="font-semibold">{formatCount(bucket.negativeLines)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const getMarginBadge = (margin: number) => {
    if (margin < 0) {
      return <Badge variant="destructive">Zarar: {formatPercent(margin)}</Badge>;
    } else if (margin < 10) {
      return <Badge variant="destructive">Düşük: {formatPercent(margin)}</Badge>;
    } else if (margin <= 30) {
      return <Badge variant="default">Normal: {formatPercent(margin)}</Badge>;
    } else {
      return <Badge variant="success">Yüksek: {formatPercent(margin)}</Badge>;
    }
  };

  const baseColumnDefs: ColumnConfig[] = [
    {
      id: 'documentNo',
      label: 'Evrak No',
      headerClassName: 'whitespace-nowrap',
      cellClassName: 'font-mono text-sm whitespace-nowrap',
      render: (row: MarginAnalysisRow) => row['Evrak No'],
      exportValue: (row: MarginAnalysisRow) => row['Evrak No'],
    },
    {
      id: 'documentType',
      label: 'Tip',
      headerClassName: 'whitespace-nowrap',
      cellClassName: 'whitespace-nowrap',
      render: (row: MarginAnalysisRow) => <Badge variant="outline">{row.Tip}</Badge>,
      exportValue: (row: MarginAnalysisRow) => row.Tip,
    },
    {
      id: 'documentDate',
      label: 'Evrak Tarihi',
      headerClassName: 'whitespace-nowrap',
      cellClassName: 'whitespace-nowrap',
      render: (row: MarginAnalysisRow) => formatDate(row['Evrak Tarihi']),
      exportValue: (row: MarginAnalysisRow) => row['Evrak Tarihi'],
    },
    {
      id: 'customerName',
      label: 'Cari',
      headerClassName: 'whitespace-nowrap',
      cellClassName: 'max-w-[200px] truncate',
      render: (row: MarginAnalysisRow) => row['Cari İsmi'],
      exportValue: (row: MarginAnalysisRow) => row['Cari İsmi'],
    },
    {
      id: 'stockCode',
      label: 'Stok Kodu',
      headerClassName: 'whitespace-nowrap',
      cellClassName: 'font-mono text-sm whitespace-nowrap',
      render: (row: MarginAnalysisRow) => row['Stok Kodu'],
      exportValue: (row: MarginAnalysisRow) => row['Stok Kodu'],
    },
    {
      id: 'stockName',
      label: 'Ürün Adı',
      headerClassName: 'whitespace-nowrap',
      cellClassName: 'max-w-[250px] truncate',
      render: (row: MarginAnalysisRow) => row['Stok İsmi'],
      exportValue: (row: MarginAnalysisRow) => row['Stok İsmi'],
    },
    {
      id: 'quantity',
      label: 'Miktar',
      headerClassName: 'text-right whitespace-nowrap',
      cellClassName: 'text-right whitespace-nowrap',
      render: (row: MarginAnalysisRow) => `${row.Miktar} ${row.Birimi}`,
      exportValue: (row: MarginAnalysisRow) => `${row.Miktar} ${row.Birimi}`,
    },
    {
      id: 'unitPrice',
      label: 'Birim Satış',
      headerClassName: 'text-right whitespace-nowrap',
      cellClassName: 'text-right whitespace-nowrap',
      render: (row: MarginAnalysisRow) => formatCurrency(row['BirimSatışKDV']),
      exportValue: (row: MarginAnalysisRow) => row['BirimSatışKDV'],
    },
    {
      id: 'totalAmount',
      label: 'Tutar (KDV)',
      headerClassName: 'text-right whitespace-nowrap',
      cellClassName: 'text-right font-semibold whitespace-nowrap',
      render: (row: MarginAnalysisRow) => formatCurrency(row.TutarKDV),
      exportValue: (row: MarginAnalysisRow) => row.TutarKDV,
    },
    {
      id: 'avgCost',
      label: 'Ort. Maliyet',
      headerClassName: 'text-right whitespace-nowrap',
      cellClassName: 'text-right whitespace-nowrap',
      render: (row: MarginAnalysisRow) => formatCurrency(row.OrtalamaMaliyetKDVli),
      exportValue: (row: MarginAnalysisRow) => row.OrtalamaMaliyetKDVli,
    },
    {
      id: 'unitProfit',
      label: 'Birim Kar',
      headerClassName: 'text-right whitespace-nowrap',
      cellClassName: 'text-right whitespace-nowrap',
      render: (row: MarginAnalysisRow) => formatCurrency(row['BirimKarOrtMalGöre']),
      exportValue: (row: MarginAnalysisRow) => row['BirimKarOrtMalGöre'],
    },
    {
      id: 'totalProfit',
      label: 'Toplam Kar',
      headerClassName: 'text-right whitespace-nowrap',
      cellClassName: 'text-right font-semibold whitespace-nowrap',
      render: (row: MarginAnalysisRow) => formatCurrency(row['ToplamKarOrtMalGöre']),
      exportValue: (row: MarginAnalysisRow) => row['ToplamKarOrtMalGöre'],
    },
    {
      id: 'margin',
      label: 'Kar %',
      headerClassName: 'text-right whitespace-nowrap',
      cellClassName: 'text-right whitespace-nowrap',
      render: (row: MarginAnalysisRow) => getMarginBadge(row.OrtalamaKarYuzde),
      exportValue: (row: MarginAnalysisRow) => row.OrtalamaKarYuzde,
    },
  ];

  const extraColumnDefs: ColumnConfig[] = [];
  if (data.length > 0) {
    const rowKeys = Object.keys(data[0]);
    const remainingKeys = rowKeys.filter((key) => !BASE_DATA_KEYS.has(key));
    remainingKeys.sort((a, b) => a.localeCompare(b, 'tr'));
    extraColumnDefs.push(
      ...remainingKeys.map((key) => ({
        id: key,
        label: key,
        headerClassName: 'whitespace-nowrap',
        cellClassName: 'whitespace-nowrap',
        render: (row: MarginAnalysisRow) => formatCellValue(row[key]),
        exportValue: (row: MarginAnalysisRow) => formatExportValue(row[key]),
      }))
    );
  }

  const columnDefs = [...baseColumnDefs, ...extraColumnDefs];
  const columnIdSignature = columnDefs.map((column) => column.id).join('|');

  useEffect(() => {
    if (hasInitializedColumns.current) return;
    if (data.length === 0) return;
    const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((id) => columnDefs.some((column) => column.id === id));
          if (valid.length > 0) {
            const isDefaultSelection =
              valid.length === DEFAULT_COLUMN_IDS.length &&
              DEFAULT_COLUMN_IDS.every((id) => valid.includes(id));
            if (isDefaultSelection && columnDefs.length > DEFAULT_COLUMN_IDS.length) {
              setVisibleColumns(columnDefs.map((column) => column.id));
            } else {
              setVisibleColumns(valid);
            }
            hasInitializedColumns.current = true;
            return;
          }
        }
      } catch {
        // Ignore invalid storage content.
      }
    }
    setVisibleColumns(columnDefs.map((column) => column.id));
    hasInitializedColumns.current = true;
  }, [columnIdSignature, data.length]);


  const visibleColumnDefs = columnDefs.filter((column) => visibleColumns.includes(column.id));

  const exportToExcel = () => {
    if (filteredData.length === 0) {
      toast.error('Dışa aktarılacak veri yok');
      return;
    }

    const exportRows = filteredData.map((row) => {
      const record: Record<string, string | number | null> = {};
      visibleColumnDefs.forEach((column) => {
        record[column.label] = column.exportValue(row);
      });
      return record;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Kar Marjı Analizi');
    XLSX.writeFile(workbook, `kar-marji-analizi-${startDate}-${endDate}.xlsx`);
    toast.success('Excel dosyası indirildi');
  };

  // Search filtering
  const filteredData = Array.isArray(data) ? data.filter((row) => {
    const tokens = buildSearchTokens(searchQuery);
    if (tokens.length === 0) return true;
    const haystack = normalizeSearchText([
      row['Stok Kodu'],
      row['Stok İsmi'],
      row['Evrak No'],
      row['Cari İsmi'],
    ].filter(Boolean).join(' '));
    return matchesSearchTokens(haystack, tokens);
  }) : [];

  return (
    <div className="min-h-screen bg-gray-50">

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/reports">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Raporlar
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Kar Marjı Analizi</h1>
              <p className="text-sm text-gray-600 mt-1">
                Bekleyen siparişler ve faturaların kar marjı detayları (019703 Raporu)
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={exportToExcel} variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Excel İndir
            </Button>
            <Button onClick={fetchData} variant="outline" size="sm" disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="mb-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Toplam Satir</CardTitle>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCount(summary.totalRecords)}</div>
                  <p className="text-xs text-muted-foreground">Satir sayisi</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Toplam Evrak</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCount(summary.totalDocuments)}</div>
                  <p className="text-xs text-muted-foreground">Evrak sayisi</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Toplam Ciro</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(summary.totalRevenue)}</div>
                  <p className="text-xs text-muted-foreground">KDV Haric</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Toplam Kar</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(summary.totalProfit)}</div>
                  <p className="text-xs text-muted-foreground">KDV Haric</p>
                </CardContent>
              </Card>


              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Son Giris Kar</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(summary.entryProfit)}</div>
                  <p className="text-xs text-muted-foreground">Son giris maliyeti</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Ortalama Kar %</CardTitle>
                  <Percent className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatPercent(summary.avgMargin)}</div>
                  <p className="text-xs text-muted-foreground">
                    Yuksek: {formatCount(summary.highMarginCount)} | Dusuk: {formatCount(summary.lowMarginCount)} | Zarar: {formatCount(summary.negativeMarginCount)}
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {renderSummaryBucket('Siparis Ozeti', summary.orderSummary)}
              {renderSummaryBucket('Satis Ozeti', summary.salesSummary)}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Satis Personeli Ozeti</CardTitle>
                <CardDescription>Gunluk siparis ve satis performansi (KDV haric)</CardDescription>
              </CardHeader>
              <CardContent>
                {summary.salespersonSummary.length === 0 ? (
                  <p className="text-sm text-gray-500">Kayit bulunamadi.</p>
                ) : (
                  <Table containerClassName="max-h-[60vh]" className="min-w-[960px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead rowSpan={2} className="whitespace-nowrap">Satis Personeli</TableHead>
                        <TableHead colSpan={5} className="text-center whitespace-nowrap">Siparis</TableHead>
                        <TableHead colSpan={5} className="text-center whitespace-nowrap">Satis</TableHead>
                      </TableRow>
                      <TableRow>
                        <TableHead className="text-right whitespace-nowrap">Ciro</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Kar</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Kar %</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Zararli Evrak</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Zararli Satir</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Ciro</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Kar</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Kar %</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Zararli Evrak</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Zararli Satir</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.salespersonSummary.map((entry) => (
                        <TableRow key={entry.sectorCode}>
                          <TableCell className="font-medium whitespace-nowrap">{entry.sectorCode}</TableCell>
                          <TableCell className="text-right">{formatCurrency(entry.orderSummary.totalRevenue)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(entry.orderSummary.totalProfit)}</TableCell>
                          <TableCell className="text-right">{formatPercent(entry.orderSummary.avgMargin)}</TableCell>
                          <TableCell className="text-right">{formatCount(entry.orderSummary.negativeDocuments)}</TableCell>
                          <TableCell className="text-right">{formatCount(entry.orderSummary.negativeLines)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(entry.salesSummary.totalRevenue)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(entry.salesSummary.totalProfit)}</TableCell>
                          <TableCell className="text-right">{formatPercent(entry.salesSummary.avgMargin)}</TableCell>
                          <TableCell className="text-right">{formatCount(entry.salesSummary.negativeDocuments)}</TableCell>
                          <TableCell className="text-right">{formatCount(entry.salesSummary.negativeLines)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filtreler</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-5">
              <div>
                <label className="text-sm font-medium mb-2 block">Başlangıç Tarihi</label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Bitiş Tarihi</label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Kar Durumu</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Tümü</option>
                  <option value="HIGH">Yüksek Kar (&gt;30%)</option>
                  <option value="OK">Normal Kar (10-30%)</option>
                  <option value="LOW">Düşük Kar (&lt;10%)</option>
                  <option value="NEGATIVE">Zarar (&lt;0%)</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Sıralama</label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="desc">Kar % Azalan</option>
                  <option value="asc">Kar % Artan</option>
                </select>
              </div>

              <div className="flex items-end">
                <Button onClick={handleSearch} className="w-full">
                  <Search className="mr-2 h-4 w-4" />
                  Ara
                </Button>
              </div>
            </div>

            <div className="mt-4">
              <Input
                placeholder="Stok kodu, ürün adı, evrak no veya cari ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleResyncReport}
                isLoading={syncingReport}
                disabled={!isSingleDate || syncingReport}
              >
                Secili Gunu Yeniden Cek
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSendReportEmail}
                isLoading={sendingReportEmail}
                disabled={!isSingleDate || sendingReportEmail}
              >
                Mail Gonder
              </Button>
              <span className="text-xs text-gray-500">Tek gun secili olmali.</span>
            </div>

            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-gray-700">
                Kolonlar ({visibleColumns.length}/{columnDefs.length})
              </summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {columnDefs.map((column) => (
                  <label key={column.id} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={visibleColumns.includes(column.id)}
                      onChange={() => toggleColumn(column.id)}
                    />
                    {column.label}
                  </label>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveEmailColumns}
                  isLoading={savingEmailColumns}
                  disabled={savingEmailColumns}
                >
                  Mail Excel Kolonlarini Kaydet
                </Button>
                <span className="text-xs text-gray-500">
                  Kayitli mail kolonlari: {emailColumnIds.length > 0 ? emailColumnIds.length : 'Varsayilan'}
                </span>
              </div>
              <p className="mt-2 text-xs text-gray-500">En az bir kolon seçili olmalı.</p>
            </details>
          </CardContent>
        </Card>

        {/* Data Table */}
        <Card>
          <CardHeader>
            <CardTitle>Kar Marjı Detayları</CardTitle>
            <CardDescription>
              {metadata && `Rapor Tarihi: ${formatDate(metadata.reportDate)} | Tarih Aralığı: ${metadata.startDate} - ${metadata.endDate}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
                <p className="text-red-600 font-medium">{error}</p>
              </div>
            ) : filteredData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Package className="h-12 w-12 text-gray-400 mb-4" />
                <p className="text-gray-600">Veri bulunamadı</p>
              </div>
            ) : (
              <>
                <Table containerClassName="max-h-[70vh]" className="min-w-max">
                  <TableHeader>
                    <TableRow>
                      {visibleColumnDefs.map((column) => (
                        <TableHead key={column.id} className={column.headerClassName}>
                          {column.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.map((row, idx) => (
                      <TableRow key={`${row.msg_S_0089}-${row.msg_S_0001}-${idx}`}>
                        {visibleColumnDefs.map((column) => (
                          <TableCell key={column.id} className={column.cellClassName}>
                            {column.render(row)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-sm text-gray-600">
                      Sayfa {page} / {totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        variant="outline"
                        size="sm"
                      >
                        Önceki
                      </Button>
                      <Button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        variant="outline"
                        size="sm"
                      >
                        Sonraki
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
