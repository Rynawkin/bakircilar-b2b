'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Order } from '@/types';
import customerApi from '@/lib/api/customer';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/authStore';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import {
  ClipboardList,
  Package,
  Warehouse,
  CalendarDays,
  MapPin,
  CheckCircle2,
  Clock,
  XCircle,
  StickyNote,
  ArrowRight,
} from 'lucide-react';

type WarehouseStatus =
  | 'PENDING'
  | 'PICKING'
  | 'READY_FOR_LOADING'
  | 'PARTIALLY_LOADED'
  | 'LOADED'
  | 'DISPATCHED';

interface PendingWarehouseOrder {
  mikroOrderNumber: string;
  orderDate: string;
  deliveryDate: string | null;
  itemCount: number;
  grandTotal: number;
  warehouseStatus?: WarehouseStatus;
}

// Tek dil: depo durumlari .badge-* sinifina eslenir
const warehouseStatusMeta: Record<WarehouseStatus, { label: string; badgeClass: string }> = {
  PENDING: { label: 'Beklemede', badgeClass: 'badge-neutral' },
  PICKING: { label: 'Toplanıyor', badgeClass: 'badge-warning' },
  READY_FOR_LOADING: { label: 'Yüklemeye Hazır', badgeClass: 'badge-info' },
  PARTIALLY_LOADED: { label: 'Kısmi Yüklendi', badgeClass: 'badge-warning' },
  LOADED: { label: 'Yüklendi', badgeClass: 'badge-success' },
  DISPATCHED: { label: 'Sevk Edildi', badgeClass: 'badge-success' },
};

export default function OrdersPage() {
  const router = useRouter();
  const { loadUserFromStorage } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [pendingWarehouseOrders, setPendingWarehouseOrders] = useState<PendingWarehouseOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUserFromStorage();
    fetchOrders();
  }, [loadUserFromStorage]);

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const [ordersResponse, pendingResponse] = await Promise.all([
        customerApi.getOrders(),
        apiClient.get('/order-tracking/customer/pending-orders'),
      ]);
      setOrders(ordersResponse.orders || []);
      setPendingWarehouseOrders((pendingResponse.data || []) as PendingWarehouseOrder[]);
    } catch (error) {
      console.error('Siparisler yuklenemedi:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Siparis durumu -> tek renk dili (.badge-*)
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="badge-warning">
            <Clock className="h-3 w-3" strokeWidth={2.5} />
            Bekliyor
          </span>
        );
      case 'APPROVED':
        return (
          <span className="badge-success">
            <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} />
            Onaylandı
          </span>
        );
      case 'REJECTED':
        return (
          <span className="badge-danger">
            <XCircle className="h-3 w-3" strokeWidth={2.5} />
            Reddedildi
          </span>
        );
      default:
        return <span className="badge-neutral">{status}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container-custom py-8 space-y-6">
        {/* Sayfa basligi */}
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 ring-1 ring-inset ring-primary-100">
            <ClipboardList className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h1 className="page-title">Siparişlerim</h1>
            <p className="page-subtitle">Siparişlerinizin durumunu ve detaylarını buradan takip edin.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <>
            {pendingWarehouseOrders.length > 0 && (
              <div className="card card-pad">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 ring-1 ring-inset ring-primary-100">
                      <Warehouse className="h-5 w-5" strokeWidth={2} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-gray-900">Depo Sürecindeki Açık Siparişler</h2>
                      <p className="page-subtitle">Toplama ve yükleme adımlarını buradan takip edebilirsiniz.</p>
                    </div>
                  </div>
                  <button
                    className="btn-secondary flex-shrink-0"
                    onClick={() => router.push('/pending-orders')}
                  >
                    Tümünü Gör
                    <ArrowRight className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {pendingWarehouseOrders.slice(0, 6).map((order) => {
                    const status = warehouseStatusMeta[order.warehouseStatus || 'PENDING'];
                    return (
                      <div key={order.mikroOrderNumber} className="surface p-3">
                        <div className="flex justify-between items-center gap-2 mb-2">
                          <p className="font-semibold text-gray-900 truncate">{order.mikroOrderNumber}</p>
                          <span className={status.badgeClass}>{status.label}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                          <span className="inline-flex items-center gap-1">
                            <Package className="h-3 w-3 text-gray-400" strokeWidth={2} />
                            {order.itemCount} kalem
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3 w-3 text-gray-400" strokeWidth={2} />
                            {formatDate(order.orderDate)}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-gray-900 mt-2">{formatCurrency(order.grandTotal)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {orders.length === 0 ? (
              <div className="card card-pad">
                <div className="flex flex-col items-center justify-center text-center py-12">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 mb-4">
                    <ClipboardList className="h-6 w-6" strokeWidth={1.75} />
                  </span>
                  <p className="text-gray-600 mb-4">Henüz siparişiniz bulunmuyor</p>
                  <Button onClick={() => router.push('/products')}>Ürünleri İncele</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {orders.map((order) => (
                  <div key={order.id} className="card card-hover overflow-hidden">
                    {/* Siparis basligi */}
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4 p-5 border-b border-[var(--line)]">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
                          <h3 className="text-lg font-semibold text-gray-900">Sipariş #{order.orderNumber}</h3>
                          {getStatusBadge(order.status)}
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-2">
                          <CalendarDays className="h-3.5 w-3.5 text-gray-400" strokeWidth={2} />
                          {formatDate(order.createdAt)}
                        </div>
                        <div className="space-y-1">
                          {order.requestedBy && (
                            <div className="text-xs text-gray-500">
                              Talep eden: {order.requestedBy.name}
                              {order.requestedBy.email ? ` (${order.requestedBy.email})` : ''}
                            </div>
                          )}
                          {order.customerOrderNumber && (
                            <div className="text-xs text-gray-500">Müşteri Sipariş No: {order.customerOrderNumber}</div>
                          )}
                          {order.deliveryLocation && (
                            <div className="flex items-center gap-1.5 text-xs text-gray-500">
                              <MapPin className="h-3.5 w-3.5 text-gray-400" strokeWidth={2} />
                              Teslimat: {order.deliveryLocation}
                            </div>
                          )}
                        </div>
                        {order.approvedAt && (
                          <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                            Onaylandı: {formatDate(order.approvedAt)}
                          </div>
                        )}
                        {order.adminNote && (
                          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5">
                            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 mb-1">
                              <StickyNote className="h-3.5 w-3.5" strokeWidth={2.5} />
                              Admin Notu
                            </p>
                            <p className="text-sm text-amber-700">{order.adminNote}</p>
                          </div>
                        )}
                      </div>
                      <div className="text-right sm:min-w-[180px]">
                        <p className="text-xs text-gray-500 mb-0.5">Toplam Tutar</p>
                        <p className="text-2xl font-bold text-gray-900">{formatCurrency(order.totalAmount)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{order.items.length} ürün</p>
                      </div>
                    </div>

                    {/* Siparis detaylari */}
                    <div className="p-5">
                      <p className="text-sm font-semibold text-gray-900 mb-3">
                        Sipariş Detayları ({order.items.length} ürün)
                      </p>
                      <div className="space-y-2">
                        {order.items.map((item) => (
                          <div
                            key={item.id}
                            className="surface px-4 py-3 transition-colors hover:border-primary-200"
                          >
                            <div className="flex justify-between items-start gap-4">
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-900 mb-1">
                                  {item.productName || (item as any).product?.name || 'Ürün'}
                                </p>
                                <div className="flex flex-wrap gap-1.5 items-center">
                                  <span className="text-[11px] text-gray-400 font-mono">
                                    {item.mikroCode || (item as any).product?.mikroCode || '-'}
                                  </span>
                                  <span className={item.priceType === 'INVOICED' ? 'badge-info' : 'badge-neutral'}>
                                    {item.priceType === 'INVOICED' ? 'Faturalı' : 'Beyaz'}
                                  </span>
                                </div>
                                {item.lineNote && (
                                  <p className="text-xs text-gray-400 mt-1.5">Not: {item.lineNote}</p>
                                )}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-xs text-gray-500 mb-0.5">
                                  {item.quantity} x {formatCurrency(item.unitPrice)}
                                </p>
                                <p className="text-base font-bold text-gray-900">{formatCurrency(item.totalPrice)}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
