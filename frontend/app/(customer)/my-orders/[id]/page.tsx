'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import customerApi from '@/lib/api/customer';
import { type Order } from '@/types';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileDown,
  MapPin,
  Package,
  StickyNote,
  XCircle,
} from 'lucide-react';

const getStatusBadge = (status: Order['status']) => {
  switch (status) {
    case 'PENDING':
      return (
        <span className="badge-warning">
          <Clock className="h-3 w-3" /> Bekliyor
        </span>
      );
    case 'APPROVED':
      return (
        <span className="badge-success">
          <CheckCircle2 className="h-3 w-3" /> Onaylandı
        </span>
      );
    case 'REJECTED':
      return (
        <span className="badge-danger">
          <XCircle className="h-3 w-3" /> Reddedildi
        </span>
      );
  }
};

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = String(params?.id || '');
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await customerApi.getOrderById(orderId);
      setOrder(response);
    } catch (requestError) {
      console.error('Siparis detayi yuklenemedi:', requestError);
      setOrder(null);
      setError('Sipariş detayı yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.');
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void fetchOrder();
  }, [fetchOrder]);

  return (
    <div className="min-h-screen bg-[var(--surface-0)]">
      <div className="mx-auto w-full max-w-[1000px] px-4 py-6 lg:px-6">
        <Link
          href="/my-orders"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ink-3)] transition-colors hover:text-primary-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Siparişlerime Dön
        </Link>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center rounded-2xl border border-red-100 bg-white px-6 py-14 text-center">
            <AlertTriangle className="mb-3 h-11 w-11 text-red-500" />
            <h1 className="text-lg font-semibold text-[var(--ink-1)]">Sipariş yüklenemedi</h1>
            <p className="mt-1 max-w-md text-sm text-[var(--ink-3)]">{error}</p>
            <Button className="mt-5" onClick={() => void fetchOrder()}>
              Tekrar Dene
            </Button>
          </div>
        ) : !order ? (
          <div className="rounded-2xl border border-[var(--line)] bg-white px-6 py-14 text-center">
            <Package className="mx-auto mb-3 h-11 w-11 text-[var(--ink-3)]" />
            <h1 className="text-lg font-semibold text-[var(--ink-1)]">Sipariş bulunamadı</h1>
          </div>
        ) : (
          <div className="space-y-4">
            <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm">
              <div className="flex flex-col gap-4 border-b border-[var(--line)] p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="font-mono text-xl font-bold text-[var(--ink-1)]">#{order.orderNumber}</h1>
                    {getStatusBadge(order.status)}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--ink-3)]">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatDate(order.createdAt)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5" />
                      {order.items.length} kalem
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      {order.deliveryLocation || 'Teslimat bilgisi yok'}
                    </span>
                  </div>
                  {order.customerOrderNumber && (
                    <p className="mt-2 text-xs text-[var(--ink-3)]">
                      Müşteri sipariş no: <b className="font-mono text-[var(--ink-1)]">{order.customerOrderNumber}</b>
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="rounded-xl bg-primary-50 px-5 py-3 text-right ring-1 ring-primary-100">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-primary-700/70">Genel Toplam</p>
                    <p className="text-2xl font-bold text-primary-700">{formatCurrency(order.totalAmount)}</p>
                  </div>
                  {order.mikroOrderIds && order.mikroOrderIds.length > 0 && (
                    <button
                      type="button"
                      disabled
                      title="PDF şu an kullanılamıyor"
                      className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-[var(--line)] bg-gray-50 px-3 py-2 text-xs font-medium text-[var(--ink-3)] opacity-70"
                    >
                      <FileDown className="h-3.5 w-3.5" />
                      PDF şu an kullanılamıyor
                    </button>
                  )}
                </div>
              </div>

              {order.adminNote && (
                <div className="border-b border-[var(--line)] px-5 py-4">
                  <div className="rounded-xl border border-amber-100 bg-amber-50 p-3.5 text-sm text-amber-800">
                    <p className="flex items-center gap-1.5 font-semibold">
                      <StickyNote className="h-4 w-4" /> Yönetici Notu
                    </p>
                    <p className="mt-1">{order.adminNote}</p>
                  </div>
                </div>
              )}

              <div className="divide-y divide-[var(--line)]">
                {order.items.length === 0 ? (
                  <div className="px-5 py-12 text-center text-sm text-[var(--ink-3)]">Bu siparişte kalem bulunmuyor.</div>
                ) : (
                  order.items.map((item) => (
                    <div key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        {item.product?.id ? (
                          <Link
                            href={`/products/${item.product.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`${item.productName} ürün detayını yeni sekmede aç`}
                            className="font-semibold text-[var(--ink-1)] transition-colors hover:text-primary-700 hover:underline"
                          >
                            {item.productName}
                          </Link>
                        ) : (
                          <p className="font-semibold text-[var(--ink-1)]">{item.productName}</p>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--ink-3)]">
                          <span className="font-mono">{item.mikroCode}</span>
                          <span className="chip">{item.priceType === 'INVOICED' ? 'Faturalı' : 'Beyaz'}</span>
                          {item.status && <span className="chip">{item.status}</span>}
                        </div>
                        {item.lineNote && <p className="mt-2 text-xs text-[var(--ink-3)]">Not: {item.lineNote}</p>}
                        {item.rejectionReason && (
                          <p className="mt-2 text-xs font-medium text-red-700">Ret nedeni: {item.rejectionReason}</p>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-left sm:text-right">
                        <p className="text-xs text-[var(--ink-3)]">
                          {item.quantity} {item.selectedUnit || item.unit || 'adet'} × {formatCurrency(item.unitPrice)}
                        </p>
                        <p className="mt-1 text-lg font-bold text-[var(--ink-1)]">{formatCurrency(item.totalPrice)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
