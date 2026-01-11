'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Order } from '@/types';
import customerApi from '@/lib/api/customer';
import { useAuthStore } from '@/lib/store/authStore';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate } from '@/lib/utils/format';

export default function OrdersPage() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-purple-50 to-gray-100">


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
          <div className="space-y-6">
            {orders.map((order) => (
              <Card key={order.id} className="shadow-xl border-2 border-primary-100 bg-white hover:shadow-2xl transition-shadow">
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6 pb-6 border-b-2 border-gray-100">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-2xl font-bold text-gray-900">Sipariş #{order.orderNumber}</h3>
                      {getStatusBadge(order.status)}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {formatDate(order.createdAt)}
                    </div>
                    {order.requestedBy && (
                      <div className="text-xs text-gray-600 mb-2">
                        Talep eden: {order.requestedBy.name}{order.requestedBy.email ? ` (${order.requestedBy.email})` : ''}
                      </div>
                    )}
                    {order.approvedAt && (
                      <div className="flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-sm font-semibold inline-block">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Onaylandı: {formatDate(order.approvedAt)}
                      </div>
                    )}
                    {order.adminNote && (
                      <div className="mt-3 bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded-lg">
                        <p className="text-xs font-semibold text-yellow-800 mb-1">📝 Admin Notu:</p>
                        <p className="text-sm text-yellow-700">{order.adminNote}</p>
                      </div>
                    )}
                  </div>
                  <div className="text-right bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl p-4 border-2 border-primary-200">
                    <p className="text-sm text-gray-600 mb-1">Toplam Tutar</p>
                    <p className="text-3xl font-bold text-primary-700">
                      {formatCurrency(order.totalAmount)}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">{order.items.length} ürün</p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <p className="text-lg font-bold text-gray-900">
                      Sipariş Detayları ({order.items.length} ürün)
                    </p>
                  </div>
                  <div className="space-y-3">
                    {order.items.map((item) => (
                      <div
                        key={item.id}
                        className="bg-gradient-to-r from-gray-50 to-white rounded-xl p-4 border-2 border-gray-200 hover:border-primary-300 hover:shadow-md transition-all"
                      >
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1">
                            <p className="font-bold text-gray-900 text-lg mb-1">
                              {item.productName || (item as any).product?.name || 'Ürün'}
                            </p>
                            <div className="flex flex-wrap gap-2 items-center">
                              <span className="text-sm text-gray-600 font-mono bg-gray-100 px-2 py-1 rounded">
                                {item.mikroCode || (item as any).product?.mikroCode || '-'}
                              </span>
                              <Badge
                                variant={item.priceType === 'INVOICED' ? 'info' : 'default'}
                                className="text-xs font-semibold"
                              >
                                {item.priceType === 'INVOICED' ? '📄 Faturalı' : '⚪ Beyaz'}
                              </Badge>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-600 mb-1">
                              {item.quantity} x {formatCurrency(item.unitPrice)}
                            </p>
                            <p className="text-xl font-bold text-primary-600">
                              {formatCurrency(item.totalPrice)}
                            </p>
                          </div>
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
