'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Order } from '@/types';
import customerApi from '@/lib/api/customer';
import { useAuthStore } from '@/lib/store/authStore';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LogoLink } from '@/components/ui/Logo';
import { MobileMenu } from '@/components/ui/MobileMenu';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { getCustomerTypeName } from '@/lib/utils/customerTypes';

export default function ProfilePage() {
  const router = useRouter();
  const { user, loadUserFromStorage, logout } = useAuthStore();
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
        return <Badge variant="warning">⏳ Bekliyor</Badge>;
      case 'APPROVED':
        return <Badge variant="success">✅ Onaylandı</Badge>;
      case 'REJECTED':
        return <Badge variant="danger">❌ Reddedildi</Badge>;
      default:
        return <Badge>{status}</Badge>;
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
      {/* Header */}
      <header className="bg-gradient-to-r from-primary-700 to-primary-600 shadow-lg">
        <div className="container-custom py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-6">
              <LogoLink href="/products" variant="light" />
              <div>
                <h1 className="text-xl font-bold text-white">👤 Profilim</h1>
                <p className="text-sm text-primary-100">Hesap bilgileriniz ve siparişleriniz</p>
              </div>
            </div>
            {/* Desktop Navigation */}
            <div className="hidden lg:flex gap-3">
              <Button
                variant="secondary"
                onClick={() => router.push('/products')}
                className="bg-white text-primary-700 hover:bg-primary-50"
              >
                🛍️ Ürünler
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.push('/cart')}
                className="bg-white text-primary-700 hover:bg-primary-50"
              >
                🛒 Sepet
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.push('/preferences')}
                className="bg-white text-primary-700 hover:bg-primary-50"
              >
                ⚙️ Tercihler
              </Button>
              <Button
                variant="ghost"
                onClick={() => { logout(); router.push('/login'); }}
                className="text-white hover:bg-primary-800"
              >
                Çıkış
              </Button>
            </div>

            {/* Mobile Navigation */}
            <MobileMenu
              items={[
                { label: 'Ürünler', href: '/products', icon: '🛍️' },
                { label: 'Sepetim', href: '/cart', icon: '🛒' },
                { label: 'Siparişlerim', href: '/my-orders', icon: '📦' },
                { label: 'Profilim', href: '/profile', icon: '👤' },
                { label: 'Tercihler', href: '/preferences', icon: '⚙️' },
              ]}
              user={user}
              onLogout={() => { logout(); router.push('/login'); }}
            />
          </div>
        </div>
      </header>

      <div className="container-custom py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* User Info */}
          <div className="lg:col-span-1">
            <Card className="shadow-lg bg-gradient-to-br from-white to-gray-50">
              <div className="text-center">
                <div className="bg-gradient-to-br from-primary-600 to-primary-700 text-white rounded-full w-24 h-24 flex items-center justify-center text-4xl mx-auto mb-4">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <h2 className="text-xl font-bold text-gray-900">{user.name}</h2>
                <p className="text-sm text-gray-600 mt-1">{user.email}</p>
                <div className="mt-3">
                  <Badge className="bg-primary-100 text-primary-700 font-semibold">
                    {getCustomerTypeName(user.customerType || '')}
                  </Badge>
                </div>
              </div>

              <div className="border-t mt-6 pt-6 space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Mikro Cari Kodu</p>
                  <p className="text-sm font-mono font-semibold text-gray-900">{user.mikroCariCode}</p>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Hesap Durumu</p>
                  <Badge variant={user.active ? 'success' : 'danger'}>
                    {user.active ? '✅ Aktif' : '❌ Pasif'}
                  </Badge>
                </div>

                <Button
                  variant="secondary"
                  className="w-full border border-primary-200 text-primary-700 hover:bg-primary-50 font-semibold"
                  onClick={() => router.push('/preferences')}
                >
                  ⚙️ Tercihleri Düzenle
                </Button>
              </div>
            </Card>
          </div>

          {/* Orders Section */}
          <div className="lg:col-span-2">
            <Card className="shadow-lg">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  📦 Son Siparişlerim
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push('/my-orders')}
                  className="text-primary-700 hover:bg-primary-50"
                >
                  Tümünü Gör →
                </Button>
              </div>

              {isLoading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
                </div>
              ) : orders.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                  <div className="text-gray-300 mb-3">
                    <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <p className="text-gray-600 mb-4 font-medium">Henüz siparişiniz bulunmuyor</p>
                  <Button onClick={() => router.push('/products')} className="bg-gradient-to-r from-primary-600 to-primary-700 text-white">
                    🛍️ Ürünleri İncele
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow bg-white"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center gap-3">
                            <h4 className="font-semibold text-gray-900">Sipariş #{order.orderNumber}</h4>
                            {getStatusBadge(order.status)}
                          </div>
                          <p className="text-sm text-gray-500 mt-1">📅 {formatDate(order.createdAt)}</p>
                          {order.approvedAt && (
                            <p className="text-xs text-green-600 mt-1">
                              ✅ Onaylandı: {formatDate(order.approvedAt)}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-primary-600">
                            {formatCurrency(order.totalAmount)}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {order.items.length} ürün
                          </p>
                        </div>
                      </div>

                      <div className="border-t pt-3">
                        <div className="flex flex-wrap gap-2">
                          {order.items.slice(0, 3).map((item) => (
                            <span
                              key={item.id}
                              className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded"
                            >
                              {item.productName} ({item.quantity})
                            </span>
                          ))}
                          {order.items.length > 3 && (
                            <span className="text-xs bg-primary-100 text-primary-700 px-2 py-1 rounded font-semibold">
                              +{order.items.length - 3} daha
                            </span>
                          )}
                        </div>
                      </div>

                      {order.adminNote && (
                        <div className="mt-3 bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded">
                          <p className="text-xs font-semibold text-yellow-800">📝 Admin Notu:</p>
                          <p className="text-xs text-yellow-700 mt-1">{order.adminNote}</p>
                        </div>
                      )}
                    </div>
                  ))}

                  {orders.length >= 5 && (
                    <Button
                      variant="secondary"
                      className="w-full border-2 border-primary-200 text-primary-700 hover:bg-primary-50 font-semibold"
                      onClick={() => router.push('/my-orders')}
                    >
                      📦 Tüm Siparişleri Gör
                    </Button>
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
