'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
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
  RefreshCw,
  Users,
  DollarSign,
  TrendingUp,
  Package,
  ShoppingCart,
  Calendar,
} from 'lucide-react';
import Link from 'next/link';
import { adminApi } from '@/lib/api/admin';

interface Customer {
  customerCode: string;
  customerName: string;
  sectorCode: string;
  orderCount: number;
  totalQuantity: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  profitMargin: number;
  lastOrderDate: string;
}

interface Summary {
  totalCustomers: number;
  totalQuantity: number;
  totalRevenue: number;
  totalProfit: number;
  avgProfitMargin: number;
}

export default function ProductCustomersPage() {
  const params = useParams();
  const productCode = params.productCode as string;

  const [data, setData] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await adminApi.getProductCustomers({
        productCode,
        limit: 100,
      });

      if (result.success) {
        setData(result.data.customers);
        setSummary(result.data.summary);
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
  }, [productCode]);

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

  return (
    <>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Link href="/reports/top-products">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Geri Dön
                </Button>
              </Link>
            </div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Package className="h-8 w-8 text-green-500" />
              Ürün Müşteri Detayı
            </h1>
            <p className="text-sm text-muted-foreground">
              Ürün Kodu: <span className="font-mono font-bold">{productCode}</span>
            </p>
          </div>

          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Yenile
          </Button>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Toplam Müşteri</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-500" />
                  <span className="text-2xl font-bold">{summary.totalCustomers}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Toplam Miktar</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-purple-500" />
                  <span className="text-2xl font-bold">{summary.totalQuantity.toFixed(2)}</span>
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sıra</TableHead>
                    <TableHead>Müşteri Kodu</TableHead>
                    <TableHead>Müşteri Adı</TableHead>
                    <TableHead>Sektör</TableHead>
                    <TableHead className="text-right">Sipariş</TableHead>
                    <TableHead className="text-right">Miktar</TableHead>
                    <TableHead className="text-right">Ciro</TableHead>
                    <TableHead className="text-right">Kar</TableHead>
                    <TableHead className="text-right">Kar Marjı</TableHead>
                    <TableHead className="text-right">Son Sipariş</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-12">
                        <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-muted-foreground">Müşteri bulunamadı</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((item, index) => (
                      <TableRow key={item.customerCode}>
                        <TableCell className="font-medium">
                          {index + 1}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{item.customerCode}</TableCell>
                        <TableCell className="max-w-xs truncate font-medium">
                          {item.customerName}
                        </TableCell>
                        <TableCell className="text-sm">{item.sectorCode || '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{item.orderCount}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {item.totalQuantity.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-green-600">
                          {formatCurrency(item.totalRevenue)}
                        </TableCell>
                        <TableCell className="text-right font-bold text-purple-600">
                          {formatCurrency(item.totalProfit)}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          <span className={item.profitMargin >= 20 ? 'text-green-600' : item.profitMargin >= 10 ? 'text-orange-600' : 'text-red-600'}>
                            %{item.profitMargin.toFixed(2)}
                          </span>
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
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
