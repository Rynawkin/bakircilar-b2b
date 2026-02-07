'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import { useDebounce } from '@/lib/hooks/useDebounce';
import type { QuoteLineItem } from '@/types';

const STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Acik' },
  { value: 'CLOSED', label: 'Kapali' },
  { value: 'CONVERTED', label: 'Siparise cevrildi' },
  { value: 'ALL', label: 'Tum' },
];

const CLOSE_REASONS = [
  'Stok yok',
  'Fiyat kabul edilmedi',
  'Musteri vazgecti',
  'Teklif suresi doldu',
  'Hata/duzeltme',
  'Diger',
];

const getStatusBadge = (status?: string) => {
  if (status === 'CLOSED') return <Badge variant="danger">Kapali</Badge>;
  if (status === 'CONVERTED') return <Badge variant="info">Siparise cevrildi</Badge>;
  return <Badge variant="success">Acik</Badge>;
};

export default function QuoteLineItemsPage() {
  const [statusFilter, setStatusFilter] = useState('OPEN');
  const [search, setSearch] = useState('');
  const [closeReasonFilter, setCloseReasonFilter] = useState('');
  const [minDays, setMinDays] = useState('');
  const [maxDays, setMaxDays] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [items, setItems] = useState<QuoteLineItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [closeReasonMap, setCloseReasonMap] = useState<Record<string, string>>({});

  const debouncedSearch = useDebounce(search, 300);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const minDaysValue = minDays ? Number(minDays) : undefined;
      const maxDaysValue = maxDays ? Number(maxDays) : undefined;

      const result = await adminApi.getQuoteLineItems({
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        search: debouncedSearch.trim() || undefined,
        closeReason: closeReasonFilter || undefined,
        minDays: Number.isFinite(minDaysValue) ? minDaysValue : undefined,
        maxDays: Number.isFinite(maxDaysValue) ? maxDaysValue : undefined,
        limit,
        offset: (page - 1) * limit,
      });
      setItems(result.items || []);
      setTotal(result.total || 0);
    } catch (error) {
      console.error('Teklif kalemleri yuklenemedi:', error);
      toast.error('Teklif kalemleri yuklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [
    statusFilter,
    debouncedSearch,
    closeReasonFilter,
    minDays,
    maxDays,
    limit,
    page,
  ]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch, closeReasonFilter, minDays, maxDays]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleCloseItem = async (item: QuoteLineItem) => {
    const reason = closeReasonMap[item.id];
    if (!reason) {
      toast.error('Kapatma nedeni secin.');
      return;
    }

    setActionId(item.id);
    try {
      await adminApi.closeQuoteLineItems([{ id: item.id, reason }]);
      toast.success('Kalem kapatildi.');
      setCloseReasonMap((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      await loadItems();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Kalem kapatilamadi.');
    } finally {
      setActionId(null);
    }
  };

  const handleReopenItem = async (item: QuoteLineItem) => {
    setActionId(item.id);
    try {
      await adminApi.reopenQuoteLineItems([item.id]);
      toast.success('Kalem acildi.');
      await loadItems();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Kalem acilamadi.');
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container-custom max-w-[1400px] py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Teklif Kalemleri</h1>
            <p className="text-sm text-gray-600">
              Acik ve kapali kalemleri filtreleyip yonetin.
            </p>
          </div>
          <Button variant="secondary" onClick={loadItems} disabled={loading}>
            Yenile
          </Button>
        </div>

        <Card>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Durum</label>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Arama</label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Urun, musteri, teklif no"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Kapatma Nedeni</label>
              <Select
                value={closeReasonFilter}
                onChange={(e) => setCloseReasonFilter(e.target.value)}
              >
                <option value="">Tum nedenler</option>
                {CLOSE_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Min Gun</label>
              <Input
                type="number"
                min={0}
                value={minDays}
                onChange={(e) => setMinDays(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Max Gun</label>
              <Input
                type="number"
                min={0}
                value={maxDays}
                onChange={(e) => setMaxDays(e.target.value)}
                placeholder="999"
              />
            </div>
          </div>
        </Card>

        <Card>
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-500">Yukleniyor...</div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">Kayit bulunamadi.</div>
          ) : (
            <Table containerClassName="max-h-[70vh]">
              <TableHeader>
                <TableRow>
                  <TableHead>Durum</TableHead>
                  <TableHead>Bekleme</TableHead>
                  <TableHead>Teklif</TableHead>
                  <TableHead>Musteri</TableHead>
                  <TableHead>Urun</TableHead>
                  <TableHead className="text-right">Adet</TableHead>
                  <TableHead className="text-right">Birim</TableHead>
                  <TableHead className="text-right">Toplam</TableHead>
                  <TableHead>Islem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const status = item.status || 'OPEN';
                  const quoteNumber = item.quote?.quoteNumber || '-';
                  const documentNo = item.quote?.documentNo || '-';
                  const customerName =
                    item.quote?.customer?.displayName ||
                    item.quote?.customer?.name ||
                    '-';
                  const customerCode = item.quote?.customer?.mikroCariCode;
                  const waiting = item.waitingDays ?? '-';
                  return (
                    <TableRow key={item.id}>
                      <TableCell>{getStatusBadge(status)}</TableCell>
                      <TableCell className="text-xs text-gray-600">
                        {waiting !== '-' ? `${waiting} gun` : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-gray-900">{quoteNumber}</div>
                        <div className="text-xs text-gray-500">Belge: {documentNo}</div>
                        {item.quote?.createdAt && (
                          <div className="text-xs text-gray-400">
                            {formatDateShort(item.quote.createdAt)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-gray-900">{customerName}</div>
                        {customerCode && (
                          <div className="text-xs text-gray-500">{customerCode}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-gray-900">{item.productName}</div>
                        <div className="text-xs text-gray-500">{item.productCode}</div>
                      </TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(item.unitPrice)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(item.totalPrice)}
                      </TableCell>
                      <TableCell>
                        {status === 'OPEN' && (
                          <div className="flex flex-col gap-2">
                            <Select
                              value={closeReasonMap[item.id] || ''}
                              onChange={(e) =>
                                setCloseReasonMap((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value,
                                }))
                              }
                            >
                              <option value="">Kapatma nedeni secin</option>
                              {CLOSE_REASONS.map((reason) => (
                                <option key={reason} value={reason}>
                                  {reason}
                                </option>
                              ))}
                            </Select>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleCloseItem(item)}
                              disabled={!closeReasonMap[item.id] || actionId === item.id}
                            >
                              {actionId === item.id ? 'Kapatiliyor...' : 'Kapat'}
                            </Button>
                          </div>
                        )}
                        {status === 'CLOSED' && (
                          <div className="flex flex-col gap-2">
                            <span className="text-xs text-gray-500">
                              {item.closedReason || '-'}
                            </span>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleReopenItem(item)}
                              disabled={actionId === item.id}
                            >
                              {actionId === item.id ? 'Aciliyor...' : 'Ac'}
                            </Button>
                          </div>
                        )}
                        {status === 'CONVERTED' && (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
            <div>Toplam {total} kayit</div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page <= 1 || loading}
                >
                  Onceki
                </Button>
                <span>
                  Sayfa {page} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page >= totalPages || loading}
                >
                  Sonraki
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
