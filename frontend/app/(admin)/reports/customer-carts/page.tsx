'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronUp, RefreshCw, Search, ShoppingCart } from 'lucide-react';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { adminApi } from '@/lib/api/admin';
import { formatCurrency } from '@/lib/utils/format';
import { useDebounce } from '@/lib/hooks/useDebounce';
import toast from 'react-hot-toast';

type PriceType = 'INVOICED' | 'WHITE' | string | null | undefined;

interface CustomerCartItem {
  id: string;
  productId?: string | null;
  productCode?: string | null;
  productName?: string | null;
  quantity: number;
  priceType?: PriceType;
  priceMode?: string | null;
  unitPrice?: number | null;
  totalPrice?: number | null;
  updatedAt: string;
}

interface CustomerCartRow {
  cartId: string;
  userId: string;
  userName?: string | null;
  customerCode?: string | null;
  customerName?: string | null;
  isSubUser?: boolean;
  updatedAt: string;
  lastItemAt?: string | null;
  itemCount: number;
  totalQuantity: number;
  totalAmount: number;
  items: CustomerCartItem[];
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('tr-TR');
};

const formatCurrencySafe = (value?: number | null) => {
  if (!Number.isFinite(value)) return '-';
  return formatCurrency(Number(value));
};

const priceTypeLabel = (value?: PriceType) => {
  if (value === 'WHITE') return 'Beyaz';
  if (value === 'INVOICED') return 'Faturali';
  return value ? String(value) : '-';
};

export default function CustomerCartsReportPage() {
  const [search, setSearch] = useState('');
  const [includeEmpty, setIncludeEmpty] = useState(false);
  const [carts, setCarts] = useState<CustomerCartRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);

  const debouncedSearch = useDebounce(search, 400);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, includeEmpty]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.getCustomerCartsReport({
        search: debouncedSearch.trim() || undefined,
        includeEmpty,
        page,
        limit: 20,
      });

      if (!result.success) {
        throw new Error('Rapor yuklenemedi');
      }

      const rows = result.data?.carts || [];
      setCarts(rows);
      setExpanded(new Set());
      setTotalPages(result.data?.pagination?.totalPages || 1);
      setTotalRecords(result.data?.pagination?.totalRecords || 0);
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || 'Rapor yuklenemedi';
      setError(message);
      setCarts([]);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, includeEmpty, page]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport, refreshKey]);

  const toggleExpanded = (cartId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cartId)) {
        next.delete(cartId);
      } else {
        next.add(cartId);
      }
      return next;
    });
  };

  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-primary-500" />
            <h1 className="text-2xl font-bold">Musteri Sepetleri</h1>
          </div>
          <p className="text-muted-foreground">Musterilerin sepetlerinde bekleyen urunleri takip edin.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/reports">
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Raporlara Don
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setRefreshKey((prev) => prev + 1)}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtreler</CardTitle>
          <CardDescription>Cari, kullanici ya da e-posta ile arayin.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Ara (cari, kullanici, email)"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <input
                id="include-empty"
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={includeEmpty}
                onChange={(event) => setIncludeEmpty(event.target.checked)}
              />
              <label htmlFor="include-empty" className="text-gray-700">
                Bos sepetleri de goster
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Sepet Listesi</CardTitle>
            <CardDescription>Toplam {totalRecords} sepet bulundu.</CardDescription>
          </div>
          {error && <Badge variant="danger">{error}</Badge>}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cari</TableHead>
                  <TableHead>Kullanici</TableHead>
                  <TableHead>Kalem</TableHead>
                  <TableHead>Miktar</TableHead>
                  <TableHead>Tutar</TableHead>
                  <TableHead>Son Guncelleme</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-6">
                      Yukleniyor...
                    </TableCell>
                  </TableRow>
                )}
                {!loading && carts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-6">
                      Kayit bulunamadi.
                    </TableCell>
                  </TableRow>
                )}
                {!loading && carts.map((cart) => {
                  const isExpanded = expanded.has(cart.cartId);
                  const detailDate = cart.lastItemAt || cart.updatedAt;
                  return (
                    <Fragment key={cart.cartId}>
                      <TableRow>
                        <TableCell>
                          <div className="font-medium">{cart.customerCode || '-'}</div>
                          <div className="text-xs text-muted-foreground">{cart.customerName || '-'}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{cart.userName || '-'}</div>
                          {cart.isSubUser && (
                            <Badge variant="outline" className="mt-1">Alt Kullanici</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{cart.itemCount}</span>
                            {cart.itemCount === 0 && <Badge variant="outline">Bos</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>{cart.totalQuantity}</TableCell>
                        <TableCell>{formatCurrencySafe(cart.totalAmount)}</TableCell>
                        <TableCell>{formatDateTime(detailDate)}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            onClick={() => toggleExpanded(cart.cartId)}
                          >
                            {isExpanded ? (
                              <>
                                Gizle
                                <ChevronUp className="h-4 w-4" />
                              </>
                            ) : (
                              <>
                                Kalemler
                                <ChevronDown className="h-4 w-4" />
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={7} className="bg-gray-50">
                            {cart.items.length === 0 ? (
                              <div className="text-sm text-muted-foreground">Sepet bos.</div>
                            ) : (
                              <div className="overflow-x-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Urun Kodu</TableHead>
                                      <TableHead>Urun</TableHead>
                                      <TableHead>Miktar</TableHead>
                                      <TableHead>Birim Fiyat</TableHead>
                                      <TableHead>Toplam</TableHead>
                                      <TableHead>Fiyat Tipi</TableHead>
                                      <TableHead>Guncelleme</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {cart.items.map((item) => (
                                      <TableRow key={item.id}>
                                        <TableCell>{item.productCode || '-'}</TableCell>
                                        <TableCell>{item.productName || '-'}</TableCell>
                                        <TableCell>{item.quantity}</TableCell>
                                        <TableCell>{formatCurrencySafe(item.unitPrice)}</TableCell>
                                        <TableCell>{formatCurrencySafe(item.totalPrice)}</TableCell>
                                        <TableCell>
                                          <div className="text-sm">{priceTypeLabel(item.priceType)}</div>
                                          {item.priceMode && (
                                            <div className="text-xs text-muted-foreground">{item.priceMode}</div>
                                          )}
                                        </TableCell>
                                        <TableCell>{formatDateTime(item.updatedAt)}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-muted-foreground">
              Sayfa {page} / {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={!canPrev || loading}
              >
                Onceki
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((prev) => prev + 1)}
                disabled={!canNext || loading}
              >
                Sonraki
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
