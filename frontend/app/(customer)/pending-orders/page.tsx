'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/lib/store/authStore';
import { apiClient } from '@/lib/api/client';
import { LoadErrorState } from '@/components/ui/LoadErrorState';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import {
  Hourglass,
  Package,
  Wallet,
  CalendarDays,
  Truck,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface OrderItem {
  productId?: string | null;
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
  const [loadError, setLoadError] = useState(false);
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
    setLoadError(false);
    try {
      const res = await apiClient.get('/order-tracking/customer/pending-orders');
      setOrders(res.data);
    } catch (error: any) {
      console.error('Siparişler yüklenemedi:', error);
      toast.error('Siparişler yüklenemedi');
      setLoadError(true);
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

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return formatDateShort(date);
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
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-0)]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const totalAmount = orders.reduce((sum, order) => sum + order.grandTotal, 0);

  return (
    <div className="min-h-screen bg-[var(--surface-0)]">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 lg:px-6">
        {/* Breadcrumb */}
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-[var(--ink-3)]">
          <Link
            href="/my-orders"
            className="transition-colors hover:text-primary-700"
          >
            Siparişlerim
          </Link>
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
          <span className="font-medium text-[var(--ink-2)]">Bekleyen Siparişler</span>
        </nav>

        {/* Sayfa basligi */}
        <div className="mb-5 flex items-start gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 ring-1 ring-inset ring-primary-100">
            <Hourglass className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--ink-1)] sm:text-2xl">
              Bekleyen Siparişler
            </h1>
            <p className="mt-1 text-sm text-[var(--ink-3)]">
              Depo sürecindeki tüm açık siparişler ve statüleri
            </p>
          </div>
        </div>

        {loadError ? (
          <LoadErrorState
            title="Bekleyen siparişler yüklenemedi"
            description="Depo süreci şu anda getirilemedi. Sipariş kayıtlarınız silinmedi."
            onRetry={fetchOrders}
          />
        ) : (
          <>
        {/* Ozet kartlari */}
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-white p-4">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 ring-1 ring-inset ring-primary-100">
              <Package className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <p className="text-xs font-medium text-[var(--ink-3)]">Bekleyen Sipariş</p>
              <p className="text-2xl font-bold text-[var(--ink-1)]">{orders.length}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-white p-4">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-100">
              <Wallet className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <p className="text-xs font-medium text-[var(--ink-3)]">Toplam Tutar</p>
              <p className="text-2xl font-bold text-[var(--ink-1)]">{formatCurrency(totalAmount)}</p>
            </div>
          </div>
        </div>

        {/* Siparisler */}
        {orders.length === 0 ? (
          <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-100">
                <CheckCircle2 className="h-6 w-6" strokeWidth={2} />
              </span>
              <h2 className="mb-1 text-base font-semibold text-[var(--ink-1)]">Bekleyen Sipariş Yok</h2>
              <p className="text-sm text-[var(--ink-3)]">Şu anda açık sipariş bakiyeniz bulunmamaktadır.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_1px_2px_rgba(20,34,59,0.04)]">
            {/* Tablo basligi (desktop) */}
            <div className="hidden grid-cols-[1.3fr_1fr_1fr_0.8fr_1.1fr_1.3fr] gap-2.5 border-b border-[var(--line)] bg-[var(--surface-1)] px-5 py-3 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--ink-3)] md:grid">
              <span>Sipariş No</span>
              <span>Tarih</span>
              <span>Teslim</span>
              <span className="text-center">Kalem</span>
              <span className="text-right">Tutar</span>
              <span className="text-right">Depo Statüsü</span>
            </div>

            {orders.map((order, orderIndex) => {
              const isExpanded = expandedOrders.has(order.mikroOrderNumber);
              const statusMeta = getWarehouseStatusMeta(order.warehouseStatus);
              const detailId = `pending-order-details-${orderIndex}`;
              return (
                <div key={order.mikroOrderNumber} className="border-t border-[var(--line)] first:border-t-0 md:first:border-t">
                  {/* ====== Desktop satiri ====== */}
                  <button
                    type="button"
                    onClick={() => toggleOrder(order.mikroOrderNumber)}
                    aria-expanded={isExpanded}
                    aria-controls={detailId}
                    className="hidden w-full grid-cols-[1.3fr_1fr_1fr_0.8fr_1.1fr_1.3fr] items-center gap-2.5 px-5 py-3.5 text-left text-[13px] transition-colors hover:bg-[var(--surface-1)] md:grid"
                  >
                    <span className="inline-flex items-center gap-2 font-mono font-semibold text-[var(--ink-1)]">
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5 text-[var(--ink-3)]" strokeWidth={2.5} />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-[var(--ink-3)]" strokeWidth={2.5} />
                      )}
                      {order.mikroOrderNumber}
                    </span>
                    <span className="text-[var(--ink-2)]">{formatDate(order.orderDate)}</span>
                    <span className="text-[var(--ink-2)]">{formatDate(order.deliveryDate)}</span>
                    <span className="text-center text-[var(--ink-2)]">{order.itemCount}</span>
                    <span className="text-right font-semibold text-[var(--ink-1)]">
                      {formatCurrency(order.grandTotal)}
                    </span>
                    <span className="text-right">
                      <span className={statusMeta.badgeClass}>{statusMeta.label}</span>
                    </span>
                  </button>

                  {/* ====== Mobil kart ====== */}
                  <button
                    type="button"
                    onClick={() => toggleOrder(order.mikroOrderNumber)}
                    aria-expanded={isExpanded}
                    aria-controls={detailId}
                    className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-[var(--surface-1)] md:hidden"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-[var(--ink-1)]">
                          {order.mikroOrderNumber}
                        </span>
                        <span className={statusMeta.badgeClass}>{statusMeta.label}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ink-3)]">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" strokeWidth={2} />
                          {formatDate(order.orderDate)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Truck className="h-3.5 w-3.5" strokeWidth={2} />
                          {formatDate(order.deliveryDate)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Package className="h-3.5 w-3.5" strokeWidth={2} />
                          {order.itemCount} kalem
                        </span>
                      </div>
                    </div>
                    <div className="ml-2 flex-shrink-0 text-right">
                      <div className="text-base font-bold text-[var(--ink-1)]">
                        {formatCurrency(order.grandTotal)}
                      </div>
                      <div className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-[var(--ink-3)]">
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

                  {/* ====== Detaylar (acilir) ====== */}
                  {isExpanded && (
                    <div
                      id={detailId}
                      role="region"
                      aria-label={`${order.mikroOrderNumber} sipariş detayları`}
                      className="border-t border-[var(--line)] bg-[var(--surface-1)] p-4"
                    >
                      <div className="overflow-x-auto rounded-lg border border-[var(--line)] bg-white">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-[var(--line)]">
                              <th className="px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                                Ürün
                              </th>
                              <th className="px-3 py-2 text-center text-[10.5px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                                Sipariş
                              </th>
                              <th className="px-3 py-2 text-center text-[10.5px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                                Teslim
                              </th>
                              <th className="px-3 py-2 text-center text-[10.5px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                                Kalan
                              </th>
                              <th className="px-3 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                                Birim Fiyat
                              </th>
                              <th className="px-3 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                                Tutar
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--line)]">
                            {order.items.map((item, index) => (
                              <tr key={index}>
                                <td className="px-3 py-2.5">
                                  {item.productId ? (
                                    <Link
                                      href={`/products/${item.productId}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      aria-label={`${item.productName} ürün detayını yeni sekmede aç`}
                                      className="font-medium text-[var(--ink-1)] transition-colors hover:text-primary-700 hover:underline"
                                    >
                                      {item.productName}
                                    </Link>
                                  ) : (
                                    <div className="font-medium text-[var(--ink-1)]">{item.productName}</div>
                                  )}
                                  <div className="font-mono text-[11px] text-[var(--ink-3)]">{item.productCode}</div>
                                </td>
                                <td className="px-3 py-2.5 text-center text-[var(--ink-2)]">
                                  {item.quantity} {item.unit}
                                </td>
                                <td className="px-3 py-2.5 text-center text-[var(--ink-2)]">
                                  {item.deliveredQty} {item.unit}
                                </td>
                                <td className="px-3 py-2.5 text-center text-[var(--ink-2)]">
                                  {item.remainingQty} {item.unit}
                                </td>
                                <td className="px-3 py-2.5 text-right text-[var(--ink-2)]">
                                  {formatCurrency(item.unitPrice)}
                                </td>
                                <td className="px-3 py-2.5 text-right font-semibold text-[var(--ink-1)]">
                                  {formatCurrency(item.lineTotal)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Toplamlar */}
                      <div className="mt-4 border-t border-[var(--line)] pt-4">
                        <div className="ml-auto max-w-xs space-y-1.5 text-sm">
                          <div className="flex justify-between">
                            <span className="text-[var(--ink-3)]">Ara Toplam</span>
                            <span className="font-medium text-[var(--ink-1)]">{formatCurrency(order.totalAmount)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[var(--ink-3)]">KDV</span>
                            <span className="font-medium text-[var(--ink-1)]">{formatCurrency(order.totalVAT)}</span>
                          </div>
                          <div className="mt-1 flex justify-between border-t border-[var(--line)] pt-2">
                            <span className="font-semibold text-[var(--ink-1)]">TOPLAM</span>
                            <span className="text-base font-bold text-[var(--ink-1)]">
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
          </>
        )}
      </div>
    </div>
  );
}
