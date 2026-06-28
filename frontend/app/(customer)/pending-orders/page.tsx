'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/lib/store/authStore';
import { apiClient } from '@/lib/api/client';
import {
  Hourglass,
  Package,
  Wallet,
  CalendarDays,
  Truck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface OrderItem {
  productCode: string;
  productName: string;
  unit: string;
  quantity: number;
  deliveredQty: number;
  remainingQty: number;
  unitPrice: number;
  lineTotal: number;
  vat: number;
}

interface PendingOrder {
  mikroOrderNumber: string;
  orderDate: string;
  deliveryDate: string | null;
  items: OrderItem[];
  itemCount: number;
  totalAmount: number;
  totalVAT: number;
  grandTotal: number;
  warehouseStatus?: 'PENDING' | 'PICKING' | 'READY_FOR_LOADING' | 'PARTIALLY_LOADED' | 'LOADED' | 'DISPATCHED';
  warehouseStatusUpdatedAt?: string | null;
}

export default function CustomerPendingOrdersPage() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (user === null) return;
    if (user.role !== 'CUSTOMER') {
      router.push('/login');
      return;
    }
    fetchOrders();
  }, [user, router]);

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get('/order-tracking/customer/pending-orders');
      setOrders(res.data);
    } catch (error: any) {
      console.error('Siparişler yüklenemedi:', error);
      toast.error('Siparişler yüklenemedi');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleOrder = (orderNumber: string) => {
    const newExpanded = new Set(expandedOrders);
    if (newExpanded.has(orderNumber)) {
      newExpanded.delete(orderNumber);
    } else {
      newExpanded.add(orderNumber);
    }
    setExpandedOrders(newExpanded);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(value);
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(new Date(date));
  };

  // Tek dil: depo durumu metni + .badge-* sinifi
  const getWarehouseStatusMeta = (status?: PendingOrder['warehouseStatus']) => {
    const current = status || 'PENDING';
    if (current === 'PICKING') return { label: 'Toplanıyor', badgeClass: 'badge-warning' };
    if (current === 'READY_FOR_LOADING') return { label: 'Yüklemeye Hazır', badgeClass: 'badge-info' };
    if (current === 'PARTIALLY_LOADED') return { label: 'Kısmi Yüklendi', badgeClass: 'badge-warning' };
    if (current === 'LOADED') return { label: 'Yüklendi', badgeClass: 'badge-success' };
    if (current === 'DISPATCHED') return { label: 'Sevk Edildi', badgeClass: 'badge-success' };
    return { label: 'Beklemede', badgeClass: 'badge-neutral' };
  };

  if (!user || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const totalAmount = orders.reduce((sum, order) => sum + order.grandTotal, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container-custom py-8">
        {/* Sayfa basligi */}
        <div className="flex items-start gap-3 mb-6">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 ring-1 ring-inset ring-primary-100">
            <Hourglass className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h1 className="page-title">Bekleyen Siparişlerim</h1>
            <p className="page-subtitle">Açık sipariş bakiyelerinizi görüntüleyin.</p>
          </div>
        </div>

        {/* Ozet */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="card card-pad flex items-center gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 ring-1 ring-inset ring-primary-100">
              <Package className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <p className="text-xs font-medium text-gray-500">Bekleyen Sipariş</p>
              <p className="text-2xl font-bold text-gray-900">{orders.length}</p>
            </div>
          </div>

          <div className="card card-pad flex items-center gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-100">
              <Wallet className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <p className="text-xs font-medium text-gray-500">Toplam Tutar</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalAmount)}</p>
            </div>
          </div>
        </div>

        {/* Siparisler */}
        {orders.length === 0 ? (
          <div className="card card-pad">
            <div className="flex flex-col items-center justify-center text-center py-12">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-100 mb-4">
                <CheckCircle2 className="h-6 w-6" strokeWidth={2} />
              </span>
              <h2 className="text-base font-semibold text-gray-900 mb-1">Bekleyen Sipariş Yok</h2>
              <p className="text-sm text-gray-500">Şu anda açık sipariş bakiyeniz bulunmamaktadır.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const isExpanded = expandedOrders.has(order.mikroOrderNumber);
              const statusMeta = getWarehouseStatusMeta(order.warehouseStatus);
              return (
                <div key={order.mikroOrderNumber} className="card overflow-hidden">
                  {/* Baslik */}
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-gray-50"
                    onClick={() => toggleOrder(order.mikroOrderNumber)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <Package className="h-4 w-4 text-gray-400 flex-shrink-0" strokeWidth={2} />
                        <h3 className="text-base font-semibold text-gray-900">
                          Sipariş No: {order.mikroOrderNumber}
                        </h3>
                        <span className={statusMeta.badgeClass}>{statusMeta.label}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5 text-gray-400" strokeWidth={2} />
                          Tarih: {formatDate(order.orderDate)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Truck className="h-3.5 w-3.5 text-gray-400" strokeWidth={2} />
                          Teslimat: {formatDate(order.deliveryDate)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Package className="h-3.5 w-3.5 text-gray-400" strokeWidth={2} />
                          {order.itemCount} kalem
                        </span>
                      </div>
                    </div>
                    <div className="text-right ml-2 flex-shrink-0">
                      <div className="text-lg font-bold text-gray-900">
                        {formatCurrency(order.grandTotal)}
                      </div>
                      <div className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 mt-0.5">
                        {isExpanded ? (
                          <>
                            <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.5} />
                            Gizle
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.5} />
                            Detay
                          </>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Detaylar */}
                  {isExpanded && (
                    <div className="border-t border-[var(--line)] p-4">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-[var(--line)]">
                              <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                                Ürün
                              </th>
                              <th className="px-3 py-2 text-center text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                                Miktar
                              </th>
                              <th className="px-3 py-2 text-right text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                                Birim Fiyat
                              </th>
                              <th className="px-3 py-2 text-right text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                                Tutar
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--line)]">
                            {order.items.map((item, index) => (
                              <tr key={index}>
                                <td className="px-3 py-2.5">
                                  <div className="font-medium text-gray-900">{item.productName}</div>
                                  <div className="text-[11px] text-gray-400 font-mono">{item.productCode}</div>
                                </td>
                                <td className="px-3 py-2.5 text-center text-gray-700">
                                  {item.remainingQty} {item.unit}
                                </td>
                                <td className="px-3 py-2.5 text-right text-gray-700">
                                  {formatCurrency(item.unitPrice)}
                                </td>
                                <td className="px-3 py-2.5 text-right font-semibold text-gray-900">
                                  {formatCurrency(item.lineTotal)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Toplamlar */}
                      <div className="mt-4 pt-4 border-t border-[var(--line)]">
                        <div className="max-w-xs ml-auto space-y-1.5 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Ara Toplam</span>
                            <span className="font-medium text-gray-900">{formatCurrency(order.totalAmount)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">KDV</span>
                            <span className="font-medium text-gray-900">{formatCurrency(order.totalVAT)}</span>
                          </div>
                          <div className="flex justify-between border-t border-[var(--line)] pt-2 mt-1">
                            <span className="font-semibold text-gray-900">TOPLAM</span>
                            <span className="text-base font-bold text-gray-900">
                              {formatCurrency(order.grandTotal)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
