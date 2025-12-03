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
  TrendingDown,
  ArrowLeft,
  Download,
  RefreshCw,
  Search,
  AlertCircle,
  CheckCircle,
  XCircle,
  Database,
  DollarSign,
  Package,
} from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { adminApi } from '@/lib/api/admin';
import { AdminNavigation } from '@/components/layout/AdminNavigation';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

interface MarginComplianceAlert {
  productCode: string;
  productName: string;
  category: string;
  currentCost: number;
  customerType: string;
  expectedMargin: number;
  expectedPrice: number;
  actualPrice: number;
  deviation: number;
  deviationAmount: number;
  status: 'OK' | 'HIGH' | 'LOW';
  priceSource: 'CATEGORY_RULE' | 'PRODUCT_OVERRIDE';
}

interface Summary {
  totalProducts: number;
  compliantCount: number;
  highDeviationCount: number;
  lowDeviationCount: number;
  avgDeviation: number;
}

interface Metadata {
  lastSyncAt: string | null;
  syncType: string | null;
}

export default function MarginCompliancePage() {
  const [data, setData] = useState<MarginComplianceAlert[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [customerTypeFilter, setCustomerTypeFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchCategories = async () => {
    try {
      const result = await adminApi.getReportCategories();
      if (result.success) {
        setCategories(result.data.categories);
      }
    } catch (err) {
      console.error('Kategoriler yüklenemedi:', err);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await adminApi.getMarginComplianceReport({
        page,
        limit: 50,
        sortBy: 'deviation',
        sortOrder: 'desc',
        customerType: customerTypeFilter || undefined,
        category: categoryFilter || undefined,
        status: statusFilter || undefined,
      });

      if (result.success) {
        setData(result.data.alerts);
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
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchData();
  }, [page, customerTypeFilter, categoryFilter, statusFilter]);

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

    const excelData = filteredData.map((item) => ({
      'Durum': item.status === 'OK' ? 'Uyumlu' : item.status === 'HIGH' ? 'Yüksek' : 'Düşük',
      'Ürün Kodu': item.productCode,
      'Ürün Adı': item.productName,
      'Kategori': item.category,
      'Müşteri Tipi': item.customerType,
      'Güncel Maliyet (TL)': parseFloat(item.currentCost.toFixed(2)),
      'Beklenen Marj (%)': parseFloat(item.expectedMargin.toFixed(1)),
      'Beklenen Fiyat (TL)': parseFloat(item.expectedPrice.toFixed(2)),
      'Gerçek Fiyat (TL)': parseFloat(item.actualPrice.toFixed(2)),
      'Sapma (%)': parseFloat(item.deviation.toFixed(2)),
      'Sapma Tutarı (TL)': parseFloat(item.deviationAmount.toFixed(2)),
      'Kaynak': item.priceSource === 'PRODUCT_OVERRIDE' ? 'Ürün Özel' : 'Kategori',
    }));

    // Özet satırı ekle
    if (summary) {
      excelData.push({} as any);
      excelData.push({
        'Durum': 'TOPLAM',
        'Ürün Kodu': `${summary.totalProducts} ürün`,
        'Ürün Adı': `Uyumlu: ${summary.compliantCount}`,
        'Kategori': `Yüksek: ${summary.highDeviationCount}`,
        'Müşteri Tipi': `Düşük: ${summary.lowDeviationCount}`,
        'Güncel Maliyet (TL)': '',
        'Beklenen Marj (%)': '',
        'Beklenen Fiyat (TL)': '',
        'Gerçek Fiyat (TL)': '',
        'Sapma (%)': `Ort: ${summary.avgDeviation.toFixed(2)}%`,
        'Sapma Tutarı (TL)': '',
        'Kaynak': '',
      } as any);
    }

    const ws = XLSX.utils.json_to_sheet(excelData);

    ws['!cols'] = [
      { wch: 10 },  // Durum
      { wch: 15 },  // Ürün Kodu
      { wch: 50 },  // Ürün Adı
      { wch: 20 },  // Kategori
      { wch: 15 },  // Müşteri Tipi
      { wch: 18 },  // Güncel Maliyet
      { wch: 15 },  // Beklenen Marj
      { wch: 18 },  // Beklenen Fiyat
      { wch: 18 },  // Gerçek Fiyat
      { wch: 12 },  // Sapma (%)
      { wch: 18 },  // Sapma Tutarı
      { wch: 15 },  // Kaynak
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Marj Uyumsuzluğu');

    const fileName = `marj-uyumsuzlugu-raporu-${new Date().toISOString().split('T')[0]}.xlsx`;

    XLSX.writeFile(wb, fileName);

    toast.success(`${filteredData.length} kayıt Excel'e aktarıldı`);
  };

  const getStatusBadge = (status: string) => {
    if (status === 'OK') return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Uyumlu</Badge>;
    if (status === 'HIGH') return <Badge className="bg-orange-500"><AlertCircle className="h-3 w-3 mr-1" />Yüksek</Badge>;
    return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Düşük</Badge>;
  };

  const getStatusColor = (status: string) => {
    if (status === 'OK') return 'text-green-600 bg-green-50';
    if (status === 'HIGH') return 'text-orange-600 bg-orange-50';
    return 'text-red-600 bg-red-50';
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const filteredData = data.filter((item) =>
    item.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.productCode.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const customerTypeLabels: Record<string, string> = {
    'BAYI': 'Bayi',
    'PERAKENDE': 'Perakende',
    'VIP': 'VIP',
    'OZEL': 'Özel',
  };

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
              <TrendingDown className="h-8 w-8 text-purple-500" />
              Marj Uyumsuzluğu Raporu
            </h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>Tanımlı kar marjlarına uymayan fiyatlar (Tolerans: ±2%)</span>
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
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Toplam Ürün</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-blue-500" />
                  <span className="text-2xl font-bold">{summary.totalProducts}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Uyumlu (±2%)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="text-2xl font-bold text-green-600">{summary.compliantCount}</span>
                  <span className="text-sm text-muted-foreground">
                    ({((summary.compliantCount / summary.totalProducts) * 100).toFixed(0)}%)
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Yüksek Fiyat (+2%)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-orange-500" />
                  <span className="text-2xl font-bold text-orange-600">{summary.highDeviationCount}</span>
                  <span className="text-sm text-muted-foreground">
                    ({((summary.highDeviationCount / summary.totalProducts) * 100).toFixed(0)}%)
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Düşük Fiyat (-2%)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-500" />
                  <span className="text-2xl font-bold text-red-600">{summary.lowDeviationCount}</span>
                  <span className="text-sm text-muted-foreground">
                    ({((summary.lowDeviationCount / summary.totalProducts) * 100).toFixed(0)}%)
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Ortalama Sapma</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-purple-500" />
                  <span className="text-2xl font-bold">
                    {summary.avgDeviation.toFixed(2)}%
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                <label className="text-sm font-medium">Müşteri Tipi</label>
                <Select
                  value={customerTypeFilter}
                  onChange={(e) => setCustomerTypeFilter(e.target.value)}
                >
                  <option value="">Tümü</option>
                  <option value="BAYI">Bayi</option>
                  <option value="PERAKENDE">Perakende</option>
                  <option value="VIP">VIP</option>
                  <option value="OZEL">Özel</option>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Kategori</label>
                <Select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="">Tümü</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Durum</label>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">Tümü</option>
                  <option value="OK">Uyumlu (±2%)</option>
                  <option value="HIGH">Yüksek Fiyat (+2%)</option>
                  <option value="LOW">Düşük Fiyat (-2%)</option>
                  <option value="NON_COMPLIANT">Uyumsuz Tümü</option>
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
                <AlertCircle className="h-8 w-8 mx-auto mb-4 text-red-500" />
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
                      <TableHead>Durum</TableHead>
                      <TableHead>Ürün Kodu</TableHead>
                      <TableHead>Ürün Adı</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead>Müşteri Tipi</TableHead>
                      <TableHead className="text-right">Güncel Maliyet</TableHead>
                      <TableHead className="text-right">Beklenen Marj</TableHead>
                      <TableHead className="text-right">Beklenen Fiyat</TableHead>
                      <TableHead className="text-right">Gerçek Fiyat</TableHead>
                      <TableHead className="text-right">Sapma (%)</TableHead>
                      <TableHead className="text-right">Sapma (TL)</TableHead>
                      <TableHead>Kaynak</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={12} className="text-center py-12">
                          <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                          <p className="text-muted-foreground">Veri bulunamadı</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredData.map((item, idx) => (
                        <TableRow key={`${item.productCode}-${item.customerType}-${idx}`} className={getStatusColor(item.status)}>
                          <TableCell>
                            {getStatusBadge(item.status)}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{item.productCode}</TableCell>
                          <TableCell className="max-w-xs truncate">{item.productName}</TableCell>
                          <TableCell className="text-sm">{item.category}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{customerTypeLabels[item.customerType]}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(item.currentCost)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            %{item.expectedMargin.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-right font-medium text-blue-600">
                            {formatCurrency(item.expectedPrice)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(item.actualPrice)}
                          </TableCell>
                          <TableCell className={`text-right font-bold ${
                            item.status === 'HIGH' ? 'text-orange-600' :
                            item.status === 'LOW' ? 'text-red-600' :
                            'text-green-600'
                          }`}>
                            {item.deviation > 0 ? '+' : ''}{item.deviation.toFixed(2)}%
                          </TableCell>
                          <TableCell className={`text-right font-medium ${
                            item.status === 'HIGH' ? 'text-orange-600' :
                            item.status === 'LOW' ? 'text-red-600' :
                            'text-green-600'
                          }`}>
                            {item.deviationAmount > 0 ? '+' : ''}{formatCurrency(item.deviationAmount)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={item.priceSource === 'PRODUCT_OVERRIDE' ? 'default' : 'secondary'}>
                              {item.priceSource === 'PRODUCT_OVERRIDE' ? 'Ürün' : 'Kategori'}
                            </Badge>
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
