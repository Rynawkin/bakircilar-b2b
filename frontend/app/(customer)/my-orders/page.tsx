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

export default function OrdersPage() {
  const router = useRouter();
  const { user, loadUserFromStorage, logout } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUserFromStorage();
    fetchOrders();
  }, [loadUserFromStorage]);

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const { orders } = await customerApi.getOrders();
      setOrders(orders);
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-primary-700 to-primary-600 shadow-lg">
        <div className="container-custom py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-6">
              <LogoLink href="/products" variant="light" />
              <div>
                <h1 className="text-xl font-bold text-white">📦 Siparişlerim</h1>
                <p className="text-sm text-primary-100">
                  {isLoading ? 'Yükleniyor...' : orders.length > 0 ? `${orders.length} sipariş` : 'Henüz sipariş yok'}
                </p>
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
                onClick={() => router.push('/profile')}
                className="bg-white text-primary-700 hover:bg-primary-50"
              >
                👤 Profil
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
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : orders.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <p className="text-gray-600 mb-4">Henüz siparişiniz bulunmuyor</p>
              <Button onClick={() => router.push('/products')}>
                Ürünleri İncele
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <Card key={order.id}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-lg">Sipariş #{order.orderNumber}</h3>
                      {getStatusBadge(order.status)}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{formatDate(order.createdAt)}</p>
                    {order.approvedAt && (
                      <p className="text-xs text-green-600 mt-1">
                        Onaylandı: {formatDate(order.approvedAt)}
                      </p>
                    )}
                    {order.adminNote && (
                      <p className="text-xs text-gray-600 mt-1">
                        Not: {order.adminNote}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary-600">
                      {formatCurrency(order.totalAmount)}
                    </p>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-gray-700 mb-3">
                    Sipariş Detayları ({order.items.length} ürün)
                  </p>
                  <div className="space-y-2">
                    {order.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex justify-between items-center text-sm py-2 border-b last:border-0"
                      >
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{item.productName}</p>
                          <div className="flex gap-2 mt-1">
                            <span className="text-gray-500">{item.mikroCode}</span>
                            <Badge
                              variant={item.priceType === 'INVOICED' ? 'info' : 'default'}
                              className="text-xs"
                            >
                              {item.priceType === 'INVOICED' ? 'Faturalı' : 'Beyaz'}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-gray-600">
                            {item.quantity} x {formatCurrency(item.unitPrice)}
                          </p>
                          <p className="font-semibold text-gray-900">
                            {formatCurrency(item.totalPrice)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
