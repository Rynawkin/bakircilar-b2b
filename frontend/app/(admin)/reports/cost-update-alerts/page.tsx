'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
} from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

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

export default function CostUpdateAlertsPage() {
  const [data, setData] = useState<CostUpdateAlert[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
        sortBy: 'riskAmount',
        sortOrder: 'desc',
      });

      if (dayDiffFilter) params.append('dayDiff', dayDiffFilter);
      if (percentDiffFilter) params.append('percentDiff', percentDiffFilter);

      const response = await fetch(`/api/admin/reports/cost-update-alerts?${params}`);

      if (!response.ok) {
        throw new Error('Rapor yüklenemedi');
      }

      const result = await response.json();

      if (result.success) {
        setData(result.data.products);
        setSummary(result.data.summary);
        setTotalPages(result.data.pagination.totalPages);
      } else {
        throw new Error(result.error || 'Bir hata oluştu');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, dayDiffFilter, percentDiffFilter]);

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
          <p className="text-muted-foreground">
            Son giriş maliyeti güncel maliyetten yüksek olan ürünler (KDV Hariç)
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Yenile
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Excel
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
              <Select value={dayDiffFilter} onValueChange={setDayDiffFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tümü" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Tümü</SelectItem>
                  <SelectItem value="7">7 gün+</SelectItem>
                  <SelectItem value="15">15 gün+</SelectItem>
                  <SelectItem value="30">30 gün+</SelectItem>
                  <SelectItem value="60">60 gün+</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Minimum % Fark</label>
              <Select value={percentDiffFilter} onValueChange={setPercentDiffFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tümü" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Tümü</SelectItem>
                  <SelectItem value="5">%5+</SelectItem>
                  <SelectItem value="10">%10+</SelectItem>
                  <SelectItem value="20">%20+</SelectItem>
                  <SelectItem value="50">%50+</SelectItem>
                </SelectContent>
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
  );
}
