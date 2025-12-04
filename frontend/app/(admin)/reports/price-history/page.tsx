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
  History,
  ArrowLeft,
  Download,
  RefreshCw,
  Search,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Calendar,
  Package,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { adminApi } from '@/lib/api/admin';
import { AdminNavigation } from '@/components/layout/AdminNavigation';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

interface PriceListChange {
  listNo: number;
  listName: string;
  oldPrice: number;
  newPrice: number;
  changeAmount: number;
  changePercent: number;
}

interface PriceChange {
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

interface Summary {
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

export default function PriceHistoryPage() {
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

  const exportToExcel = () => {
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

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fiyat Geçmişi');
    XLSX.writeFile(wb, `fiyat-gecmisi-${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Excel dosyası indirildi');
  };

  const getDirectionIcon = (direction: string) => {
    if (direction === 'increase') return <TrendingUp className="h-4 w-4 text-red-500" />;
    if (direction === 'decrease') return <TrendingDown className="h-4 w-4 text-green-500" />;
    return <span className="h-4 w-4">•</span>;
  };

  const getDirectionBadge = (direction: string) => {
    if (direction === 'increase') {
      return <Badge variant="destructive">Artış</Badge>;
    }
    if (direction === 'decrease') {
      return <Badge variant="default" className="bg-green-600">Azalış</Badge>;
    }
    return <Badge variant="outline">Karışık</Badge>;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNavigation />

      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/reports">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Raporlara Dön
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                <History className="h-8 w-8" />
                Fiyat Geçmişi Raporu
              </h1>
              <p className="text-gray-500 mt-1">
                Mikro ERP fiyat değişiklikleri ve tutarlılık kontrolü
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={fetchData} variant="outline" disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
            <Button onClick={exportToExcel} variant="outline" disabled={data.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Excel İndir
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Toplam Değişiklik</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.totalChanges}</div>
                <p className="text-xs text-gray-500 mt-1">
                  Son 7 gün: {summary.last7DaysChanges} | 30 gün: {summary.last30DaysChanges}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Tutarlılık Oranı</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {summary.inconsistencyRate < 5 ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  )}
                  <div className="text-2xl font-bold">
                    {(100 - summary.inconsistencyRate).toFixed(1)}%
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Tutarlı: {summary.consistentChanges} | Tutarsız: {summary.inconsistentChanges}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Ortalama Artış</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-red-500" />
                  <div className="text-2xl font-bold text-red-600">
                    {summary.avgIncreasePercent > 0 ? '+' : ''}{summary.avgIncreasePercent.toFixed(2)}%
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Ortalama Azalış</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-green-500" />
                  <div className="text-2xl font-bold text-green-600">
                    {summary.avgDecreasePercent.toFixed(2)}%
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filtreler</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ürün Ara
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Ürün kodu veya adı..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    className="pl-9"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kategori
                </label>
                <Input
                  placeholder="Kategori..."
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tutarlılık
                </label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  value={consistencyFilter}
                  onChange={(e) => {setConsistencyFilter(e.target.value)}
                >
                  <option value="all">Tümü</option>
                  <option value="consistent">Tutarlı (10 liste)</option>
                  <option value="inconsistent">Tutarsız (&lt;10 liste)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Değişim Yönü
                </label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  value={directionFilter}
                  onChange={(e) => {setDirectionFilter(e.target.value)}
                >
                  <option value="all">Tümü</option>
                  <option value="increase">Artış</option>
                  <option value="decrease">Azalış</option>
                  <option value="mixed">Karışık</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Başlangıç Tarihi
                </label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bitiş Tarihi
                </label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSearch} disabled={loading}>
                <Search className="h-4 w-4 mr-2" />
                Filtrele
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery('');
                  setCategoryFilter('');
                  setConsistencyFilter('all');
                  setDirectionFilter('all');
                  setStartDate('');
                  setEndDate('');
                  setPage(1);
                }}
              >
                Temizle
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardHeader>
            <CardTitle>Fiyat Değişiklikleri</CardTitle>
            <CardDescription>
              {data.length} değişiklik bulundu (Sayfa {page} / {totalPages})
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-gray-400" />
                <p className="text-gray-500 mt-4">Yükleniyor...</p>
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <AlertCircle className="h-8 w-8 mx-auto text-red-500" />
                <p className="text-red-600 mt-4">{error}</p>
              </div>
            ) : data.length === 0 ? (
              <div className="text-center py-12">
                <Package className="h-8 w-8 mx-auto text-gray-400" />
                <p className="text-gray-500 mt-4">Sonuç bulunamadı</p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.map((change, index) => (
                  <div key={index} className="border rounded-lg overflow-hidden">
                    <div
                      className="p-4 bg-white hover:bg-gray-50 cursor-pointer flex items-center justify-between"
                      onClick={() => toggleRow(index)}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="flex-shrink-0">
                          {getDirectionIcon(change.changeDirection)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">
                              {change.productCode}
                            </span>
                            <span className="text-gray-600">-</span>
                            <span className="text-gray-700 truncate">
                              {change.productName}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(change.changeDate).toLocaleDateString('tr-TR')}
                            </span>
                            <span>{change.category}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-sm font-medium">
                              {change.avgChangePercent > 0 ? '+' : ''}
                              {change.avgChangePercent.toFixed(2)}%
                            </div>
                            <div className="text-xs text-gray-500">
                              Ortalama değişim
                            </div>
                          </div>
                          {getDirectionBadge(change.changeDirection)}
                          {change.isConsistent ? (
                            <Badge variant="default" className="bg-green-600">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Tutarlı
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              {change.updatedListsCount}/10 Liste
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {expandedRows.has(index) && (
                      <div className="border-t bg-gray-50 p-4">
                        <div className="space-y-3">
                          <div className="text-sm font-medium text-gray-700 mb-2">
                            Fiyat Listesi Değişiklikleri:
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {change.priceChanges.map((priceChange) => (
                              <div
                                key={priceChange.listNo}
                                className="flex items-center justify-between p-3 bg-white rounded border"
                              >
                                <div>
                                  <div className="font-medium text-sm">
                                    {priceChange.listName}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {priceChange.oldPrice.toFixed(2)} TL → {priceChange.newPrice.toFixed(2)} TL
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div
                                    className={`text-sm font-medium ${
                                      priceChange.changePercent > 0
                                        ? 'text-red-600'
                                        : priceChange.changePercent < 0
                                        ? 'text-green-600'
                                        : 'text-gray-600'
                                    }`}
                                  >
                                    {priceChange.changePercent > 0 ? '+' : ''}
                                    {priceChange.changePercent.toFixed(2)}%
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {priceChange.changeAmount > 0 ? '+' : ''}
                                    {priceChange.changeAmount.toFixed(2)} TL
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                          {!change.isConsistent && change.missingLists.length > 0 && (
                            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                              <div className="flex items-start gap-2">
                                <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                                <div>
                                  <div className="text-sm font-medium text-yellow-800">
                                    Eksik Listeler
                                  </div>
                                  <div className="text-sm text-yellow-700">
                                    Bu değişiklikte {change.missingLists.length} liste güncellenmedi:{' '}
                                    {change.missingLists.map(n => priceListNames[n] || `Liste ${n}`).join(', ')}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t">
                <div className="text-sm text-gray-600">
                  Sayfa {page} / {totalPages}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1 || loading}
                  >
                    Önceki
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages || loading}
                  >
                    Sonraki
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const priceListNames: { [key: number]: string } = {
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
