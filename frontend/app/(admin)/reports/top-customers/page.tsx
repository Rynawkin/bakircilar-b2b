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
  ArrowLeft,
  Download,
  RefreshCw,
  TrendingUp,
  Users,
  DollarSign,
  ShoppingCart,
  Calendar,
} from 'lucide-react';
import Link from 'next/link';
import { adminApi } from '@/lib/api/admin';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

interface TopCustomer {
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

interface Summary {
  totalRevenue: number;
  totalProfit: number;
  avgProfitMargin: number;
  totalCustomers: number;
}

export default function TopCustomersPage() {
  const [data, setData] = useState<TopCustomer[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sector, setSector] = useState('');
  const [sortBy, setSortBy] = useState<'revenue' | 'profit' | 'margin' | 'orderCount'>('revenue');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

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

  const handleExportExcel = () => {
    if (data.length === 0) {
      toast.error('Dışa aktarılacak veri yok');
      return;
    }

    const excelData = data.map((item) => ({
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

    if (summary) {
      excelData.push({} as any);
      excelData.push({
        'Müşteri Kodu': 'TOPLAM',
        'Müşteri Adı': `${summary.totalCustomers} müşteri`,
        'Sektör': '',
        'Sipariş Sayısı': '',
        'Ciro (TL)': parseFloat(summary.totalRevenue.toFixed(2)),
        'Maliyet (TL)': '',
        'Kar (TL)': parseFloat(summary.totalProfit.toFixed(2)),
        'Kar Marjı (%)': parseFloat(summary.avgProfitMargin.toFixed(2)),
        'Ort. Sipariş (TL)': '',
        'En Çok Aldığı Kategori': '',
        'Son Sipariş': '',
      } as any);
    }

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

    toast.success(`${data.length} kayıt Excel'e aktarıldı`);
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

  return (
    <>
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
              <Users className="h-8 w-8 text-blue-500" />
              En İyi Müşteriler
            </h1>
            <p className="text-sm text-muted-foreground">
              {getSortLabel()} bazında sıralanmış müşteriler
            </p>
          </div>

          <div className="flex gap-2">
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
                <CardDescription>Toplam Müşteri</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-500" />
                  <span className="text-2xl font-bold">{summary.totalCustomers}</span>
                  <span className="text-muted-foreground">müşteri</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Toplam Ciro</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-green-500" />
                  <span className="text-2xl font-bold">
                    {formatCurrency(summary.totalRevenue)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Toplam Kar</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-purple-500" />
                  <span className="text-2xl font-bold">
                    {formatCurrency(summary.totalProfit)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Ortalama Kar Marjı</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-orange-500" />
                  <span className="text-2xl font-bold">
                    %{summary.avgProfitMargin.toFixed(2)}
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
                <label className="text-sm font-medium">Başlangıç Tarihi</label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Bitiş Tarihi</label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Sektör</label>
                <Input
                  placeholder="Sektör kodu..."
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Sıralama</label>
                <Select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                >
                  <option value="revenue">Ciro (Yüksek → Düşük)</option>
                  <option value="profit">Kar (Yüksek → Düşük)</option>
                  <option value="margin">Kar Marjı (Yüksek → Düşük)</option>
                  <option value="orderCount">Sipariş Sayısı (Yüksek → Düşük)</option>
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
                <Users className="h-8 w-8 mx-auto mb-4 text-red-500" />
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
                      <TableHead>Sıra</TableHead>
                      <TableHead>Müşteri Kodu</TableHead>
                      <TableHead>Müşteri Adı</TableHead>
                      <TableHead>Sektör</TableHead>
                      <TableHead className="text-right">Sipariş</TableHead>
                      <TableHead className="text-right">Ciro</TableHead>
                      <TableHead className="text-right">Maliyet</TableHead>
                      <TableHead className="text-right">Kar</TableHead>
                      <TableHead className="text-right">Kar Marjı</TableHead>
                      <TableHead className="text-right">Ort. Sipariş</TableHead>
                      <TableHead>En Çok Aldığı</TableHead>
                      <TableHead className="text-right">Son Sipariş</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={12} className="text-center py-12">
                          <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                          <p className="text-muted-foreground">Veri bulunamadı</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.map((item, index) => (
                        <TableRow key={item.customerCode}>
                          <TableCell className="font-medium">
                            {(page - 1) * 50 + index + 1}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{item.customerCode}</TableCell>
                          <TableCell className="max-w-xs truncate font-medium">
                            {item.customerName}
                          </TableCell>
                          <TableCell className="text-sm">{item.sector || '-'}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{item.orderCount}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium text-green-600">
                            {formatCurrency(item.revenue)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {formatCurrency(item.cost)}
                          </TableCell>
                          <TableCell className="text-right font-bold text-purple-600">
                            {formatCurrency(item.profit)}
                          </TableCell>
                          <TableCell className="text-right font-bold">
                            <span className={item.profitMargin >= 20 ? 'text-green-600' : item.profitMargin >= 10 ? 'text-orange-600' : 'text-red-600'}>
                              %{item.profitMargin.toFixed(2)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(item.avgOrderAmount)}
                          </TableCell>
                          <TableCell className="text-sm truncate max-w-xs">
                            {item.topCategory || '-'}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            <div className="flex items-center justify-end gap-1">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <span>{formatDate(item.lastOrderDate)}</span>
                            </div>
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
