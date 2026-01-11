'use client';

import { useState, useEffect } from 'react';
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
  TrendingDown,
  ArrowLeft,
  Download,
  RefreshCw,
  Search,
  AlertCircle,
  Calendar,
  DollarSign,
  Package,
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

interface Summary {
  totalRecords: number;
  totalRevenue: number;
  totalProfit: number;
  avgMargin: number;
  highMarginCount: number;
  lowMarginCount: number;
  negativeMarginCount: number;
}

interface Metadata {
  reportDate: string;
  startDate: string;
  endDate: string;
  includeCompleted: number;
}

export default function MarginAnalysisPage() {
  const [data, setData] = useState<MarginAnalysisRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

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
      setError(err.response?.data?.error || err.message || 'Rapor yüklenemedi');
      toast.error('Rapor yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, statusFilter, sortOrder]);

  const handleSearch = () => {
    setPage(1);
    fetchData();
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

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('tr-TR');
    } catch {
      return dateStr;
    }
  };

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

  const exportToExcel = () => {
    if (data.length === 0) {
      toast.error('Dışa aktarılacak veri yok');
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(data);
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
            <Link href="/admin/reports">
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
          <div className="mb-6 grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Toplam Kayıt</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.totalRecords}</div>
                <p className="text-xs text-muted-foreground">İşlem sayısı</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Toplam Ciro</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(summary.totalRevenue)}</div>
                <p className="text-xs text-muted-foreground">KDV Dahil</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Toplam Kar</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(summary.totalProfit)}</div>
                <p className="text-xs text-muted-foreground">Ortalama maliyete göre</p>
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
                  Yüksek: {summary.highMarginCount} | Düşük: {summary.lowMarginCount} | Zarar: {summary.negativeMarginCount}
                </p>
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
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Evrak No</TableHead>
                        <TableHead>Tip</TableHead>
                        <TableHead>Evrak Tarihi</TableHead>
                        <TableHead>Cari</TableHead>
                        <TableHead>Stok Kodu</TableHead>
                        <TableHead>Ürün Adı</TableHead>
                        <TableHead className="text-right">Miktar</TableHead>
                        <TableHead className="text-right">Birim Satış</TableHead>
                        <TableHead className="text-right">Tutar (KDV)</TableHead>
                        <TableHead className="text-right">Ort. Maliyet</TableHead>
                        <TableHead className="text-right">Birim Kar</TableHead>
                        <TableHead className="text-right">Toplam Kar</TableHead>
                        <TableHead className="text-right">Kar %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredData.map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-sm">{row['Evrak No']}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{row.Tip}</Badge>
                          </TableCell>
                          <TableCell>{formatDate(row['Evrak Tarihi'])}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{row['Cari İsmi']}</TableCell>
                          <TableCell className="font-mono text-sm">{row['Stok Kodu']}</TableCell>
                          <TableCell className="max-w-[250px] truncate">{row['Stok İsmi']}</TableCell>
                          <TableCell className="text-right">{row.Miktar} {row.Birimi}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.BirimSatışKDV)}</TableCell>
                          <TableCell className="text-right font-semibold">{formatCurrency(row.TutarKDV)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.OrtalamaMaliyetKDVli)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.BirimKarOrtMalGöre)}</TableCell>
                          <TableCell className="text-right font-semibold">{formatCurrency(row.ToplamKarOrtMalGöre)}</TableCell>
                          <TableCell className="text-right">{getMarginBadge(row.OrtalamaKarYuzde)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

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
