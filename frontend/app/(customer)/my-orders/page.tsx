'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Order } from '@/types';
import customerApi, { type CustomerListPagination } from '@/lib/api/customer';
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
  Search,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';

const PAGE_SIZE = 10;
const DEFAULT_PAGINATION: CustomerListPagination = {
  total: 0,
  page: 1,
  pageSize: PAGE_SIZE,
  totalPages: 1,
};

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
  const [error, setError] = useState<string | null>(null);
  const [warehouseError, setWarehouseError] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Order['status'] | ''>('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<CustomerListPagination>(DEFAULT_PAGINATION);

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const ordersResponse = await customerApi.getOrders({
        status: status || undefined,
        search: search || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setOrders(ordersResponse.orders || []);
      setPagination(
        ordersResponse.pagination || {
          total: ordersResponse.orders?.length || 0,
          page,
          pageSize: PAGE_SIZE,
          totalPages: 1,
        }
      );
    } catch (error) {
      console.error('Siparisler yuklenemedi:', error);
      setError('Siparişleriniz yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.');
    } finally {
      setIsLoading(false);
    }
  }, [page, search, status]);

  const fetchPendingWarehouseOrders = useCallback(async () => {
    setWarehouseError(null);
    try {
      const pendingResponse = await apiClient.get('/order-tracking/customer/pending-orders');
      setPendingWarehouseOrders((pendingResponse.data || []) as PendingWarehouseOrder[]);
    } catch (error) {
      console.error('Depo surecindeki siparisler yuklenemedi:', error);
      setWarehouseError('Depo sürecindeki açık siparişler yüklenemedi.');
    }
  }, []);

  useEffect(() => {
    loadUserFromStorage();
    void fetchPendingWarehouseOrders();
  }, [fetchPendingWarehouseOrders, loadUserFromStorage]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

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

  // Aynisini sepete ekle: siparis kalemlerini mevcut sepet store'u ile tekrar ekler.
  // Urun kimligi once item.product.id'den, yoksa item.productId'den alinir; tek kalem
  // hatasi digerlerini durdurmaz, sonuc tek toastta ozetlenir.
  const handleReorder = async (order: Order) => {
    setReorderingId(order.id);
    let added = 0;
    const failed: string[] = [];
    try {
      for (const item of order.items) {
        const productId = ((item as any).product?.id ?? (item as any).productId) as string | undefined;
        const label = item.productName || (item as any).product?.name || item.mikroCode || 'Ürün';
        if (!productId) {
          failed.push(label);
          continue;
        }
        try {
          await addToCart({
            productId,
            quantity: item.quantity,
            priceType: item.priceType,
            priceMode: (item as any).priceMode ?? 'LIST',
          });
          added += 1;
        } catch {
          failed.push(label);
        }
      }
      if (added > 0 && failed.length === 0) {
        toast.success(`${added} ürün sepete eklendi`);
      } else if (added > 0) {
        toast.success(`${added} ürün sepete eklendi, ${failed.length} ürün eklenemedi`, { duration: 5000 });
        toast.error(`Eklenemeyenler:\n${failed.join('\n')}`, { duration: 6000 });
      } else {
        toast.error(
          failed.length > 0
            ? `Bu siparişteki ürünler sepete eklenemedi:\n${failed.join('\n')}`
            : 'Bu siparişteki ürünler sepete eklenemedi.',
          { duration: 6000 }
        );
      }
      if (added > 0) {
        router.push('/cart');
      }
    } finally {
      setReorderingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--surface-0)]">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 lg:px-6">
        {/* Breadcrumb */}
        <nav className="mb-3.5 flex items-center gap-1.5 text-[12px] text-[var(--ink-3)]">
          <Link
            href="/home"
            className="text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
          >
            Ana Sayfa
          </Link>
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

        <form
          className="mb-5 flex flex-col gap-2 rounded-xl border border-[var(--line)] bg-white p-3 shadow-sm sm:flex-row sm:items-center"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setSearch(searchInput.trim());
          }}
        >
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--line)] px-3 focus-within:border-primary-300 focus-within:ring-2 focus-within:ring-primary-100">
            <Search className="h-4 w-4 flex-shrink-0 text-[var(--ink-3)]" />
            <span className="sr-only">Siparişlerde ara</span>
            <input
              type="search"
              value={searchInput}
              disabled={isLoading}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Sipariş no, ürün veya teslimat ara…"
              className="min-w-0 flex-1 border-none bg-transparent text-sm text-[var(--ink-1)] outline-none placeholder:text-[var(--ink-3)] disabled:opacity-60"
            />
          </label>
          <select
            value={status}
            disabled={isLoading}
            onChange={(event) => {
              setStatus(event.target.value as Order['status'] | '');
              setPage(1);
            }}
            aria-label="Sipariş durumuna göre filtrele"
            className="h-10 rounded-lg border border-[var(--line)] bg-white px-3 text-sm font-medium text-[var(--ink-2)] outline-none focus:border-primary-300 disabled:opacity-60"
          >
            <option value="">Tüm durumlar</option>
            <option value="PENDING">Bekliyor</option>
            <option value="APPROVED">Onaylandı</option>
            <option value="REJECTED">Reddedildi</option>
          </select>
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Ara
          </button>
          {(search || status) && (
            <button
              type="button"
              disabled={isLoading}
              onClick={() => {
                setSearchInput('');
                setSearch('');
                setStatus('');
                setPage(1);
              }}
              className="h-10 rounded-lg px-3 text-sm font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--surface-0)] hover:text-[var(--ink-1)] disabled:opacity-60"
            >
              Temizle
            </button>
          )}
        </form>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600"></div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-red-100 bg-white px-6 py-14 text-center">
            <AlertTriangle className="mb-3 h-10 w-10 text-red-500" />
            <h2 className="text-lg font-semibold text-[var(--ink-1)]">Siparişler yüklenemedi</h2>
            <p className="mt-1 max-w-md text-sm text-[var(--ink-3)]">{error}</p>
            <Button className="mt-5" onClick={() => void fetchOrders()}>
              Tekrar Dene
            </Button>
          </div>
        ) : (
          <>
            {warehouseError && (
              <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1">{warehouseError}</span>
                <button
                  type="button"
                  onClick={() => void fetchPendingWarehouseOrders()}
                  className="font-semibold underline underline-offset-2"
                >
                  Tekrar dene
                </button>
              </div>
            )}
            {/* ── Bolum 1: Depo Surecindeki Acik Siparisler ───────────── */}
            {pendingWarehouseOrders.length > 0 && (
              <div className="mb-8">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-[15px] font-bold text-[var(--ink-1)]">
                    Depo Sürecindeki Açık Siparişler
                  </h2>
                  <Link
                    href="/pending-orders"
                    className="inline-flex items-center gap-1 text-[13px] font-medium text-primary-700 transition-colors hover:text-primary-900"
                  >
                    Tümünü gör
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} />
                  </Link>
                </div>

                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                  {pendingWarehouseOrders.slice(0, 6).map((order) => {
                    const status = warehouseStatusMeta[order.warehouseStatus || 'PENDING'];
                    return (
                      <Link
                        key={order.mikroOrderNumber}
                        href="/pending-orders"
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
                      </Link>
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
                  {search || status ? 'Aramanıza uygun sipariş bulunamadı' : 'Henüz siparişiniz bulunmuyor'}
                </h3>
                <p className="mb-6 max-w-sm text-[13.5px] leading-relaxed text-[var(--ink-3)]">
                  {search || status
                    ? 'Arama metnini veya durum filtresini değiştirip tekrar deneyin.'
                    : 'Ürünleri inceleyerek ilk siparişinizi oluşturabilirsiniz.'}
                </p>
                {search || status ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchInput('');
                      setSearch('');
                      setStatus('');
                      setPage(1);
                    }}
                  >
                    Filtreleri Temizle
                  </Button>
                ) : (
                  <Button onClick={() => router.push('/products')}>Ürünleri İncele</Button>
                )}
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
                    <article
                      key={order.id}
                      className="group relative rounded-xl border border-[var(--line)] bg-white px-[17px] py-[15px] transition-shadow hover:shadow-md"
                    >
                      <Link
                        href={`/my-orders/${order.id}`}
                        aria-label={`${order.orderNumber} numaralı siparişin detayını gör`}
                        className="absolute inset-0 z-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                      >
                        <span className="sr-only">Sipariş detayını gör</span>
                      </Link>
                      {/* Ust satir: no + durum + tarih ── genel toplam */}
                      <div className="pointer-events-none relative z-[1] flex flex-wrap items-center justify-between gap-3.5">
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
                      <div className="pointer-events-none relative z-[1] mt-[11px] flex flex-wrap items-center gap-x-[18px] gap-y-2 border-t border-[var(--line)] pt-[11px] text-[12px] text-[var(--ink-2)]">
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

                        <div className="pointer-events-auto relative z-10 ml-auto flex flex-wrap items-center gap-2.5">
                          <Link
                            href={`/my-orders/${order.id}`}
                            className="text-[12.5px] font-semibold text-primary-700 transition-colors hover:text-primary-900 hover:underline"
                          >
                            Detayı gör →
                          </Link>
                          {order.mikroOrderIds && order.mikroOrderIds.length > 0 && (
                            <button
                              type="button"
                              disabled
                              title="PDF şu an kullanılamıyor"
                              className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-[var(--line)] bg-gray-50 px-3.5 py-[7px] text-[12.5px] font-medium text-[var(--ink-3)] opacity-70"
                            >
                              <FileDown className="h-3.5 w-3.5" strokeWidth={2} />
                              PDF şu an kullanılamıyor
                            </button>
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
                    </article>
                  );
                })}
              </div>
            )}

            {orders.length > 0 && (
              <div className="mt-5 flex flex-col items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--ink-3)] sm:flex-row">
                <span>
                  Toplam {pagination.total} sipariş · Sayfa {pagination.page} / {pagination.totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pagination.page <= 1 || isLoading}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--line)] bg-white px-3 font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-0)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Önceki
                  </button>
                  <button
                    type="button"
                    disabled={pagination.page >= pagination.totalPages || isLoading}
                    onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--line)] bg-white px-3 font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-0)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Sonraki
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
