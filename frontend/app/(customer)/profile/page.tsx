'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Order } from '@/types';
import customerApi, { CustomerFinancials } from '@/lib/api/customer';
import { useAuthStore } from '@/lib/store/authStore';
import { Card } from '@/components/ui/Card';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { getCustomerTypeName } from '@/lib/utils/customerTypes';
import {
  Settings,
  Package,
  ShoppingBag,
  Calendar,
  CheckCircle2,
  Clock,
  XCircle,
  StickyNote,
  ArrowRight,
  Mail,
  CreditCard,
  Wallet,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';

export default function ProfilePage() {
  const { user, loadUserFromStorage } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [financials, setFinancials] = useState<CustomerFinancials | null>(null);
  const [financialsError, setFinancialsError] = useState<string | null>(null);

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (user) {
      fetchOrders();
      fetchFinancials();
    }
  }, [user]);

  const fetchOrders = async () => {
    setIsLoading(true);
    setOrdersError(null);
    try {
      const { orders } = await customerApi.getOrders({ page: 1, pageSize: 5 });
      setOrders(orders);
    } catch (error) {
      console.error('Siparişler yüklenemedi:', error);
      setOrdersError('Son siparişleriniz yüklenemedi.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFinancials = async () => {
    setFinancialsError(null);
    try {
      const { financials } = await customerApi.getFinancials();
      setFinancials(financials);
    } catch (error) {
      console.error('Cari bakiye yüklenemedi:', error);
      setFinancials(null);
      setFinancialsError('Cari bakiye ve vade bilgileri şu anda yüklenemedi.');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <span className="badge-warning"><Clock className="w-3 h-3" /> Bekliyor</span>;
      case 'APPROVED':
        return <span className="badge-success"><CheckCircle2 className="w-3 h-3" /> Onaylandı</span>;
      case 'REJECTED':
        return <span className="badge-danger"><XCircle className="w-3 h-3" /> Reddedildi</span>;
      default:
        return <span className="badge-neutral">{status}</span>;
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const paymentPlanLabel = user.paymentPlanName || financials?.paymentTermLabel || null;
  const initials = user.name.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-[var(--surface-0)]">
      <div className="mx-auto w-full max-w-[860px] px-4 py-6 lg:px-6">
        {/* Breadcrumb */}
        <div className="mb-3 flex items-center gap-1.5 text-xs text-[var(--ink-3)]">
          <Link href="/home" className="hover:text-primary-700">Ana Sayfa</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-medium text-[var(--ink-2)]">Profilim</span>
        </div>

        {/* Header */}
        <div className="mb-4">
          <h1 className="text-[23px] font-extrabold tracking-[-0.02em] text-[var(--ink-1)]">Profil</h1>
          <p className="mt-0.5 text-[13px] text-[var(--ink-3)]">
            Hesabınızda kayıtlı cari ve iletişim bilgileri bu ekranda salt okunurdur.
          </p>
        </div>

        {/* Profile card */}
        <Card className="overflow-hidden border border-[var(--line)] bg-white p-0 transition-shadow hover:shadow-md">
          {/* Top strip */}
          <div className="flex flex-wrap items-center gap-4 border-b border-[var(--line)] bg-[#f7f9fc] px-5 py-5">
            <span className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-[14px] bg-primary-50 text-lg font-extrabold text-primary-600">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-[17px] font-semibold text-[var(--ink-1)]">{user.name}</span>
                <span className="badge-info">{getCustomerTypeName(user.customerType || '')}</span>
              </div>
              {user.mikroCariCode && (
                <div className="mt-1 font-mono text-[12.5px] text-[var(--ink-3)]">
                  {user.mikroCariCode}
                </div>
              )}
            </div>
            <Link
              href="/preferences"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-4 py-2 text-sm font-medium text-primary-700 transition-colors hover:bg-[var(--surface-0)]"
            >
              <Settings className="h-4 w-4" />
              Tercihler ve Şifre
            </Link>
          </div>

          {/* Field grid */}
          <div className="grid grid-cols-1 gap-px bg-[var(--line)] sm:grid-cols-2">
            {/* E-posta */}
            <div className="bg-white px-5 py-4">
              <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-3)]">
                <Mail className="h-3.5 w-3.5" />
                E-posta
              </div>
              <div className="mt-1 break-all text-sm text-[var(--ink-1)]">{user.email}</div>
            </div>

            {/* Ödeme planı */}
            {paymentPlanLabel && (
              <div className="bg-white px-5 py-4">
                <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-3)]">
                  <CreditCard className="h-3.5 w-3.5" />
                  Ödeme planı
                </div>
                <div className="mt-1 text-sm text-[var(--ink-1)]">{paymentPlanLabel}</div>
              </div>
            )}

            {/* Hesap durumu */}
            <div className="bg-white px-5 py-4">
              <div className="text-[11.5px] text-[var(--ink-3)]">Hesap durumu</div>
              <div className="mt-1.5">
                {user.active ? (
                  <span className="badge-success"><CheckCircle2 className="w-3 h-3" /> Aktif</span>
                ) : (
                  <span className="badge-danger"><XCircle className="w-3 h-3" /> Pasif</span>
                )}
              </div>
            </div>

            {/* Cari bakiye */}
            {financials && (
              <div className="bg-white px-5 py-4">
                <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-3)]">
                  <Wallet className="h-3.5 w-3.5" />
                  Cari bakiye
                </div>
                <div className="mt-1 text-sm font-semibold text-[var(--ink-1)]">
                  {formatCurrency(financials.totalBalance)}
                </div>
                {financials.referenceDate && (
                  <div className="mt-0.5 text-[11px] text-[var(--ink-3)]">
                    {formatDate(financials.referenceDate)} itibarıyla
                  </div>
                )}
              </div>
            )}

            {/* Vadesi gelen */}
            {financials && (
              <div className="bg-white px-5 py-4">
                <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-3)]">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Vadesi gelen
                </div>
                <div
                  className={`mt-1 text-sm font-semibold ${
                    financials.pastDueBalance > 0 ? 'text-amber-600' : 'text-[var(--ink-1)]'
                  }`}
                >
                  {formatCurrency(financials.pastDueBalance)}
                </div>
                {financials.pastDueDate && (
                  <div className="mt-0.5 text-[11px] text-[var(--ink-3)]">
                    Vade: {formatDate(financials.pastDueDate)}
                  </div>
                )}
              </div>
            )}
          </div>

          {financialsError && (
            <div role="alert" className="flex flex-col gap-3 border-t border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                {financialsError} Kayıtlarınız silinmedi.
              </span>
              <button
                type="button"
                onClick={() => void fetchFinancials()}
                className="inline-flex min-h-9 flex-none items-center justify-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-900 transition-colors hover:bg-amber-100"
              >
                Tekrar Dene
              </button>
            </div>
          )}
        </Card>

        {/* Orders Section */}
        <Card className="mt-4 border border-[var(--line)] bg-white transition-shadow hover:shadow-md">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--ink-1)]">
              <Package className="h-5 w-5 text-[var(--ink-3)]" />
              Son Siparişlerim
            </h3>
            <Link
              href="/my-orders"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-50"
            >
              Tümünü Gör
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
          ) : ordersError ? (
            <div className="rounded-xl border border-red-100 bg-red-50/50 px-5 py-10 text-center">
              <p className="font-medium text-red-700">{ordersError}</p>
              <button
                type="button"
                onClick={() => void fetchOrders()}
                className="mt-3 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50"
              >
                Tekrar Dene
              </button>
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-0)] py-12 text-center">
              <Package className="mx-auto mb-3 h-14 w-14 text-[var(--ink-3)]" strokeWidth={1.5} />
              <p className="mb-4 font-medium text-[var(--ink-2)]">Henüz siparişiniz bulunmuyor</p>
              <Link
                href="/products"
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
              >
                <ShoppingBag className="h-4 w-4" />
                Ürünleri İncele
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => (
                <article
                  key={order.id}
                  className="group relative rounded-xl border border-[var(--line)] bg-white p-4 transition-shadow hover:shadow-sm"
                >
                  <Link
                    href={`/my-orders/${order.id}`}
                    aria-label={`${order.orderNumber} numaralı siparişin detayını gör`}
                    className="absolute inset-0 z-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                  >
                    <span className="sr-only">Sipariş detayını gör</span>
                  </Link>
                  <div className="pointer-events-none relative z-[1] mb-3 flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <h4 className="font-mono font-semibold text-[var(--ink-1)]">
                          #{order.orderNumber}
                        </h4>
                        {getStatusBadge(order.status)}
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--ink-3)]">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(order.createdAt)}
                      </p>
                      {order.approvedAt && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-600">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Onaylandı: {formatDate(order.approvedAt)}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-[var(--ink-1)]">
                        {formatCurrency(order.totalAmount)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--ink-3)]">{order.items.length} ürün</p>
                    </div>
                  </div>

                  <div className="pointer-events-none relative z-[1] border-t border-[var(--line)] pt-3">
                    <div className="flex flex-wrap gap-2">
                      {order.items.slice(0, 3).map((item) =>
                        item.product?.id ? (
                          <Link
                            key={item.id}
                            href={`/products/${item.product.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`${item.productName} ürün detayını yeni sekmede aç`}
                            className="chip pointer-events-auto relative z-10 transition-colors hover:border-primary-200 hover:text-primary-700"
                          >
                            {item.productName} ({item.quantity})
                          </Link>
                        ) : (
                          <span key={item.id} className="chip">
                            {item.productName} ({item.quantity})
                          </span>
                        )
                      )}
                      {order.items.length > 3 && (
                        <span className="badge-info">+{order.items.length - 3} daha</span>
                      )}
                    </div>
                  </div>

                  {order.adminNote && (
                    <div className="pointer-events-none relative z-[1] mt-3 rounded-lg border border-amber-100 bg-amber-50 p-3">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                        <StickyNote className="h-3.5 w-3.5" />
                        Yönetici Notu
                      </p>
                      <p className="mt-1 text-xs text-amber-700">{order.adminNote}</p>
                    </div>
                  )}
                </article>
              ))}

              {orders.length >= 5 && (
                <Link
                  href="/my-orders"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--ink-1)] transition-colors hover:bg-[var(--surface-0)]"
                >
                  <Package className="h-4 w-4" />
                  Tüm Siparişleri Gör
                </Link>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
