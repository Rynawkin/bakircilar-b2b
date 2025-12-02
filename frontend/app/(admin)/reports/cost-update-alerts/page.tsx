'use client';

import { useState, useEffect } from 'react';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  RefreshCw,
  Search,
  TrendingUp,
  Calendar,
  Package,
  DollarSign,
  Database,
} from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { adminApi } from '@/lib/api/admin';
import { AdminNavigation } from '@/components/layout/AdminNavigation';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

interface CostUpdateAlert {
  productCode: string;
  productName: string;
  category: string;
  currentCostDate: string | null;
  currentCost: number;
  lastEntryDate: string | null;
  lastEntryCost: number;
  diffAmount: number;
  diffPercent: number;
  dayDiff: number;
  stockQuantity: number;
  riskAmount: number;
  salePrice: number;
}

interface Summary {
  totalAlerts: number;
  totalRiskAmount: number;
  totalStockValue: number;
  avgDiffPercent: number;
}

interface Metadata {
  lastSyncAt: string | null;
  syncType: string | null;
}

export default function CostUpdateAlertsPage() {
  const [data, setData] = useState<CostUpdateAlert[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [dayDiffFilter, setDayDiffFilter] = useState<string>('');
  const [percentDiffFilter, setPercentDiffFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await adminApi.getCostUpdateAlerts({
        page,
        limit: 50,
        sortBy: 'riskAmount',
        sortOrder: 'desc',
        dayDiff: dayDiffFilter || undefined,
        percentDiff: percentDiffFilter || undefined,
      });

      if (result.success) {
        setData(result.data.products);
        setSummary(result.data.summary);
        setMetadata(result.data.metadata);
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
  }, [page, dayDiffFilter, percentDiffFilter]);

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

  const handleExportExcel = () => {
    if (filteredData.length === 0) {
      toast.error('Dışa aktarılacak veri yok');
      return;
    }

    // Excel verisi hazırla - her satır bir obje
    const excelData = filteredData.map((item) => ({
      'Ürün Kodu': item.productCode,
      'Ürün Adı': item.productName,
      'Kategori': item.category,
      'Güncel Mal. Tarihi': formatDate(item.currentCostDate),
      'Güncel Maliyet (TL)': parseFloat(item.currentCost.toFixed(2)),
      'Son Giriş Tarihi': formatDate(item.lastEntryDate),
      'Son Giriş Mal. (TL)': parseFloat(item.lastEntryCost.toFixed(2)),
      'Fark (TL)': parseFloat(item.diffAmount.toFixed(2)),
      'Fark (%)': parseFloat(item.diffPercent.toFixed(1)),
      'Gün Farkı': item.dayDiff,
      'Eldeki Stok': parseFloat(item.stockQuantity.toFixed(0)),
      'Risk Tutarı (TL)': parseFloat(item.riskAmount.toFixed(2)),
      'Satış Fiyatı (TL)': parseFloat(item.salePrice.toFixed(2)),
    }));

    // Özet satırı ekle
    if (summary) {
      excelData.push({} as any); // Boş satır
      excelData.push({
        'Ürün Kodu': 'TOPLAM',
        'Ürün Adı': `${summary.totalAlerts} ürün`,
        'Kategori': '',
        'Güncel Mal. Tarihi': '',
        'Güncel Maliyet (TL)': '',
        'Son Giriş Tarihi': '',
        'Son Giriş Mal. (TL)': '',
        'Fark (TL)': '',
        'Fark (%)': `Ort: ${summary.avgDiffPercent.toFixed(1)}%`,
        'Gün Farkı': '',
        'Eldeki Stok': '',
        'Risk Tutarı (TL)': parseFloat(summary.totalRiskAmount.toFixed(2)),
        'Satış Fiyatı (TL)': '',
      } as any);
    }

    // Worksheet oluştur
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Sütun genişliklerini ayarla
    ws['!cols'] = [
      { wch: 15 },  // Ürün Kodu
      { wch: 50 },  // Ürün Adı
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

    toast.success(`${filteredData.length} kayıt Excel'e aktarıldı`);
  };

  const getRiskLevelColor = (percent: number) => {
    if (percent >= 20) return 'text-red-600 bg-red-50';
    if (percent >= 10) return 'text-orange-600 bg-orange-50';
    if (percent >= 5) return 'text-yellow-600 bg-yellow-50';
    return 'text-green-600 bg-green-50';
  };

  const getRiskLevelBadge = (percent: number) => {
    if (percent >= 20) return <Badge variant="destructive">Kritik</Badge>;
    if (percent >= 10) return <Badge className="bg-orange-500">Yüksek</Badge>;
    if (percent >= 5) return <Badge className="bg-yellow-500">Orta</Badge>;
    return <Badge className="bg-green-500">Düşük</Badge>;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('tr-TR');
  };

  const filteredData = data.filter((item) =>
    item.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.productCode.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <AdminNavigation />
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Link href="/reports">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Raporlara Dön
                </Button>
              </Link>
            </div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <AlertTriangle className="h-8 w-8 text-orange-500" />
              Maliyet Güncelleme Uyarıları
            </h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>Son giriş maliyeti güncel maliyetten yüksek olan ürünler (KDV Hariç)</span>
              {metadata?.lastSyncAt && (
                <div className="flex items-center gap-1">
                  <Database className="h-4 w-4" />
                  <span>
                    Son Senkronizasyon:{' '}
                    {new Date(metadata.lastSyncAt).toLocaleString('tr-TR')}
                    {metadata.syncType === 'AUTO' ? ' (Otomatik)' : ' (Manuel)'}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualSync}
              disabled={isSyncing}
            >
              <Database className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Senkronize Ediliyor...' : 'Tekrar Senkronize Et'}
            </Button>
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Yenile
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportExcel}>
              <Download className="h-4 w-4 mr-2" />
              Excel İndir
            </Button>
          </div>
        </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Toplam Uyarı</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                <span className="text-2xl font-bold">{summary.totalAlerts}</span>
                <span className="text-muted-foreground">ürün</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Toplam Risk Tutarı</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-red-500" />
                <span className="text-2xl font-bold">
                  {formatCurrency(summary.totalRiskAmount)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Etkilenen Stok Değeri</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-blue-500" />
                <span className="text-2xl font-bold">
                  {formatCurrency(summary.totalStockValue)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Ortalama Fark</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-purple-500" />
                <span className="text-2xl font-bold">
                  %{summary.avgDiffPercent.toFixed(1)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtreler</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Arama</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Ürün kodu veya adı..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Minimum Gün Farkı</label>
              <Select
                value={dayDiffFilter}
                onChange={(e) => setDayDiffFilter(e.target.value)}
              >
                <option value="">Tümü</option>
                <option value="7">7 gün+</option>
                <option value="15">15 gün+</option>
                <option value="30">30 gün+</option>
                <option value="60">60 gün+</option>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Minimum % Fark</label>
              <Select
                value={percentDiffFilter}
                onChange={(e) => setPercentDiffFilter(e.target.value)}
              >
                <option value="">Tümü</option>
                <option value="5">%5+</option>
                <option value="10">%10+</option>
                <option value="20">%20+</option>
                <option value="50">%50+</option>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Yükleniyor...</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <AlertTriangle className="h-8 w-8 mx-auto mb-4 text-red-500" />
              <p className="text-red-600">{error}</p>
              <Button variant="outline" onClick={fetchData} className="mt-4">
                Tekrar Dene
              </Button>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Risk</TableHead>
                    <TableHead>Ürün Kodu</TableHead>
                    <TableHead>Ürün Adı</TableHead>
                    <TableHead className="text-right">G. Mal. Tarihi</TableHead>
                    <TableHead className="text-right">Güncel Maliyet</TableHead>
                    <TableHead className="text-right">S. Giriş Tarihi</TableHead>
                    <TableHead className="text-right">S. Giriş Maliyeti</TableHead>
                    <TableHead className="text-right">Fark (TL)</TableHead>
                    <TableHead className="text-right">Fark (%)</TableHead>
                    <TableHead className="text-right">Gün Farkı</TableHead>
                    <TableHead className="text-right">Eldeki Stok</TableHead>
                    <TableHead className="text-right">Risk Tutarı</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-12">
                        <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-muted-foreground">Uyarı bulunamadı</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredData.map((item) => (
                      <TableRow key={item.productCode} className={getRiskLevelColor(item.diffPercent)}>
                        <TableCell>
                          {getRiskLevelBadge(item.diffPercent)}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{item.productCode}</TableCell>
                        <TableCell className="max-w-xs truncate">{item.productName}</TableCell>
                        <TableCell className="text-right text-sm">{formatDate(item.currentCostDate)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(item.currentCost)}
                        </TableCell>
                        <TableCell className="text-right text-sm text-green-600">
                          {formatDate(item.lastEntryDate)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-red-600">
                          {formatCurrency(item.lastEntryCost)}
                        </TableCell>
                        <TableCell className="text-right font-bold text-red-600">
                          {formatCurrency(item.diffAmount)}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          %{item.diffPercent.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline">{item.dayDiff} gün</Badge>
                        </TableCell>
                        <TableCell className="text-right">{item.stockQuantity.toFixed(0)}</TableCell>
                        <TableCell className="text-right font-bold text-red-700">
                          {formatCurrency(item.riskAmount)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Sayfa {page} / {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Önceki
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
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
    </>
  );
}
