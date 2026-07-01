'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Order } from '@/types';
import customerApi from '@/lib/api/customer';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/authStore';
import { useCartStore } from '@/lib/store/cartStore';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import {
  ClipboardList,
  Package,
  CalendarDays,
  CheckCircle2,
  Clock,
  XCircle,
  ArrowRight,
  FileDown,
  RotateCcw,
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
  const { addToCart } = useCartStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [pendingWarehouseOrders, setPendingWarehouseOrders] = useState<PendingWarehouseOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

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

  // Aynisini sepete ekle: siparis kalemlerini mevcut sepet store'u ile tekrar ekler
  const handleReorder = async (order: Order) => {
    setReorderingId(order.id);
    try {
      let added = 0;
      const skipped: string[] = [];
      for (const item of order.items) {
        const productId = (item as any).product?.id as string | undefined;
        if (!productId) {
          skipped.push(item.productName || (item as any).product?.name || item.mikroCode || 'Ürün');
          continue;
        }
        await addToCart({
          productId,
          quantity: item.quantity,
          priceType: item.priceType,
          priceMode: (item as any).priceMode ?? 'LIST',
        });
        added += 1;
      }
      if (added > 0) {
        toast.success(`${added} ürün sepete eklendi`);
        if (skipped.length > 0) {
          toast.error(`Bazı kalemler eklenemedi:\n${skipped.join('\n')}`, { duration: 6000 });
        }
        router.push('/cart');
      } else {
        toast.error('Bu siparişteki ürünler sepete eklenemedi.');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Sepete eklenirken hata oluştu');
    } finally {
      setReorderingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--surface-0)]">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 lg:px-6">
        {/* Breadcrumb */}
        <nav className="mb-3.5 flex items-center gap-1.5 text-[12px] text-[var(--ink-3)]">
          <button
            type="button"
            onClick={() => router.push('/home')}
            className="text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
          >
            Ana Sayfa
          </button>
          <span className="text-gray-300">/</span>
          <span className="font-medium text-[var(--ink-2)]">Siparişlerim</span>
        </nav>

        {/* Sayfa basligi */}
        <div className="mb-[18px] flex items-center gap-3.5">
          <span className="flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-[13px] bg-primary-50 text-primary-600">
            <ClipboardList className="h-[22px] w-[22px]" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h1 className="text-[23px] font-bold tracking-tight text-[var(--ink-1)]">Siparişlerim</h1>
            <p className="mt-0.5 text-[13px] text-[var(--ink-3)]">
              Açık siparişlerin depo süreci ve geçmiş siparişleriniz
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <>
            {/* ── Bolum 1: Depo Surecindeki Acik Siparisler ───────────── */}
            {pendingWarehouseOrders.length > 0 && (
              <div className="mb-8">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-[15px] font-bold text-[var(--ink-1)]">
                    Depo Sürecindeki Açık Siparişler
                  </h2>
                  <button
                    type="button"
                    onClick={() => router.push('/pending-orders')}
                    className="inline-flex items-center gap-1 text-[13px] font-medium text-primary-700 transition-colors hover:text-primary-900"
                  >
                    Tümünü gör
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                  {pendingWarehouseOrders.slice(0, 6).map((order) => {
                    const status = warehouseStatusMeta[order.warehouseStatus || 'PENDING'];
                    return (
                      <div
                        key={order.mikroOrderNumber}
                        className="rounded-xl border border-[var(--line)] bg-white p-[15px] transition-shadow hover:shadow-md"
                      >
                        <div className="mb-2.5 flex items-center justify-between gap-2">
                          <span className="font-mono text-[12.5px] font-semibold text-[var(--ink-1)]">
                            {order.mikroOrderNumber}
                          </span>
                          <span className={status.badgeClass}>{status.label}</span>
                        </div>
                        <div className="mb-2.5 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-[var(--ink-3)]">
                          <span>{formatDate(order.orderDate)}</span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <Package className="h-3 w-3 text-[var(--ink-3)]" strokeWidth={2} />
                            {order.itemCount} kalem
                          </span>
                          <span>·</span>
                          <span>teslim {order.deliveryDate ? formatDate(order.deliveryDate) : '—'}</span>
                        </div>
                        <div className="text-[18px] font-semibold tracking-tight text-[var(--ink-1)]">
                          {formatCurrency(order.grandTotal)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Bolum 2: Tum Siparisler ──────────────────────────────── */}
            <h2 className="mb-3 text-[15px] font-bold text-[var(--ink-1)]">Tüm Siparişler</h2>

            {orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-6 py-16 text-center">
                <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 ring-1 ring-inset ring-primary-100">
                  <ClipboardList className="h-7 w-7" strokeWidth={1.7} />
                </span>
                <h3 className="mb-2 text-lg font-semibold text-[var(--ink-1)]">
                  Henüz siparişiniz bulunmuyor
                </h3>
                <p className="mb-6 max-w-sm text-[13.5px] leading-relaxed text-[var(--ink-3)]">
                  Ürünleri inceleyerek ilk siparişinizi oluşturabilirsiniz.
                </p>
                <Button onClick={() => router.push('/products')}>Ürünleri İncele</Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {orders.map((order) => {
                  // Depo statusu: ayni mikro siparis no ile eslesen acik depo kaydi
                  const wh = pendingWarehouseOrders.find((p) =>
                    (order.mikroOrderIds || []).includes(p.mikroOrderNumber)
                  );
                  const whMeta = wh ? warehouseStatusMeta[wh.warehouseStatus || 'PENDING'] : null;
                  const isReordering = reorderingId === order.id;
                  return (
                    <div
                      key={order.id}
                      className="rounded-xl border border-[var(--line)] bg-white px-[17px] py-[15px] transition-shadow hover:shadow-md"
                    >
                      {/* Ust satir: no + durum + tarih ── genel toplam */}
                      <div className="flex flex-wrap items-center justify-between gap-3.5">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-mono text-sm font-semibold text-[var(--ink-1)]">
                            #{order.orderNumber}
                          </span>
                          {getStatusBadge(order.status)}
                          <span className="text-[12.5px] text-[var(--ink-3)]">
                            {formatDate(order.createdAt)}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-[10.5px] text-[var(--ink-3)]">Genel toplam (KDV dahil)</div>
                          <div className="text-[17px] font-semibold text-[var(--ink-1)]">
                            {formatCurrency(order.totalAmount)}
                          </div>
                        </div>
                      </div>

                      {/* Alt satir: meta bilgiler + aksiyonlar */}
                      <div className="mt-[11px] flex flex-wrap items-center gap-x-[18px] gap-y-2 border-t border-[var(--line)] pt-[11px] text-[12px] text-[var(--ink-2)]">
                        <span>
                          Kalem:{' '}
                          <b className="font-semibold text-[var(--ink-1)]">{order.items.length}</b>
                        </span>
                        <span>
                          Teslimat:{' '}
                          <b className="font-semibold text-[var(--ink-1)]">
                            {order.deliveryLocation || '—'}
                          </b>
                        </span>
                        <span>
                          Müşteri sipariş no:{' '}
                          <b className="font-mono font-semibold text-[var(--ink-1)]">
                            {order.customerOrderNumber || '—'}
                          </b>
                        </span>
                        <span className="flex items-center gap-1.5">
                          Depo:{' '}
                          {whMeta ? (
                            <span className={whMeta.badgeClass}>{whMeta.label}</span>
                          ) : (
                            <span className="badge-neutral">—</span>
                          )}
                        </span>

                        <div className="ml-auto flex flex-wrap items-center gap-2.5">
                          {order.mikroOrderIds && order.mikroOrderIds.length > 0 && (
                            <a
                              href={`/api/order-tracking/customer/orders/${encodeURIComponent(
                                order.mikroOrderIds[0]
                              )}/pdf`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-white px-3.5 py-[7px] text-[12.5px] font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-0)]"
                            >
                              <FileDown className="h-3.5 w-3.5" strokeWidth={2} />
                              PDF indir
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => handleReorder(order)}
                            disabled={isReordering}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-primary-100 bg-primary-50 px-3.5 py-[7px] text-[12.5px] font-semibold text-primary-700 transition-colors hover:bg-primary-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
                            {isReordering ? 'Ekleniyor…' : 'Aynısını sepete ekle'}
                          </button>
                        </div>
                      </div>
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
