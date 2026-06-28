'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Order } from '@/types';
import customerApi from '@/lib/api/customer';
import { useAuthStore } from '@/lib/store/authStore';
import { Card } from '@/components/ui/Card';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { getCustomerTypeName } from '@/lib/utils/customerTypes';
import { Settings, Package, ShoppingBag, Calendar, CheckCircle2, Clock, XCircle, StickyNote, ArrowRight } from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (user) {
      fetchOrders();
    }
  }, [user]);

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const { orders } = await customerApi.getOrders();
      setOrders(orders.slice(0, 5)); // Son 5 sipariş
    } catch (error) {
      console.error('Siparişler yüklenemedi:', error);
    } finally {
      setIsLoading(false);
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container-custom py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="page-title">Profilim</h1>
          <p className="page-subtitle">Hesap bilgileriniz ve son siparişleriniz</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* User Info */}
          <div className="lg:col-span-1">
            <Card className="bg-white">
              <div className="text-center">
                <div className="bg-gradient-to-br from-primary-600 to-primary-700 text-white rounded-full w-20 h-20 flex items-center justify-center text-3xl font-semibold mx-auto mb-4">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <h2 className="text-lg font-semibold text-gray-900">{user.name}</h2>
                <p className="text-sm text-gray-500 mt-1">{user.email}</p>
                <div className="mt-3">
                  <span className="badge-info">
                    {getCustomerTypeName(user.customerType || '')}
                  </span>
                </div>
              </div>

              <div className="border-t border-[var(--line)] mt-6 pt-6 space-y-4">
                <div className="surface p-4">
                  <p className="field-label mb-1">Mikro Cari Kodu</p>
                  <p className="text-sm font-mono font-semibold text-gray-900">{user.mikroCariCode}</p>
                </div>

                <div className="surface p-4">
                  <p className="field-label mb-1">Hesap Durumu</p>
                  {user.active ? (
                    <span className="badge-success"><CheckCircle2 className="w-3 h-3" /> Aktif</span>
                  ) : (
                    <span className="badge-danger"><XCircle className="w-3 h-3" /> Pasif</span>
                  )}
                </div>

                <button
                  className="btn-secondary w-full"
                  onClick={() => router.push('/preferences')}
                >
                  <Settings className="w-4 h-4" />
                  Tercihleri Düzenle
                </button>
              </div>
            </Card>
          </div>

          {/* Orders Section */}
          <div className="lg:col-span-2">
            <Card className="bg-white">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <Package className="w-5 h-5 text-gray-400" />
                  Son Siparişlerim
                </h3>
                <button
                  onClick={() => router.push('/my-orders')}
                  className="btn-ghost text-primary-700 hover:bg-primary-50 text-sm"
                >
                  Tümünü Gör
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {isLoading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
                </div>
              ) : orders.length === 0 ? (
                <div className="text-center py-12 surface">
                  <Package className="w-14 h-14 mx-auto text-gray-300 mb-3" strokeWidth={1.5} />
                  <p className="text-gray-600 mb-4 font-medium">Henüz siparişiniz bulunmuyor</p>
                  <button onClick={() => router.push('/products')} className="btn-primary">
                    <ShoppingBag className="w-4 h-4" />
                    Ürünleri İncele
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="card card-hover p-4"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center gap-3">
                            <h4 className="font-semibold text-gray-900">Sipariş #{order.orderNumber}</h4>
                            {getStatusBadge(order.status)}
                          </div>
                          <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-gray-400" />
                            {formatDate(order.createdAt)}
                          </p>
                          {order.approvedAt && (
                            <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Onaylandı: {formatDate(order.approvedAt)}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-gray-900">
                            {formatCurrency(order.totalAmount)}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {order.items.length} ürün
                          </p>
                        </div>
                      </div>

                      <div className="border-t border-[var(--line)] pt-3">
                        <div className="flex flex-wrap gap-2">
                          {order.items.slice(0, 3).map((item) => (
                            <span
                              key={item.id}
                              className="chip"
                            >
                              {item.productName} ({item.quantity})
                            </span>
                          ))}
                          {order.items.length > 3 && (
                            <span className="badge-info">
                              +{order.items.length - 3} daha
                            </span>
                          )}
                        </div>
                      </div>

                      {order.adminNote && (
                        <div className="mt-3 bg-amber-50 border border-amber-100 p-3 rounded-lg">
                          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                            <StickyNote className="w-3.5 h-3.5" />
                            Yönetici Notu
                          </p>
                          <p className="text-xs text-amber-700 mt-1">{order.adminNote}</p>
                        </div>
                      )}
                    </div>
                  ))}

                  {orders.length >= 5 && (
                    <button
                      className="btn-secondary w-full"
                      onClick={() => router.push('/my-orders')}
                    >
                      <Package className="w-4 h-4" />
                      Tüm Siparişleri Gör
                    </button>
                  )}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
