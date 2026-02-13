'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Order } from '@/types';
import customerApi from '@/lib/api/customer';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/authStore';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate } from '@/lib/utils/format';

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

const warehouseStatusMeta: Record<WarehouseStatus, { label: string; variant: 'default' | 'info' | 'warning' | 'success' | 'danger' }> = {
  PENDING: { label: 'Beklemede', variant: 'default' },
  PICKING: { label: 'Toplaniyor', variant: 'warning' },
  READY_FOR_LOADING: { label: 'Yuklemeye Hazir', variant: 'info' },
  PARTIALLY_LOADED: { label: 'Kismi Yuklendi', variant: 'warning' },
  LOADED: { label: 'Yuklendi', variant: 'success' },
  DISPATCHED: { label: 'Sevk Edildi', variant: 'success' },
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="warning">Bekliyor</Badge>;
      case 'APPROVED':
        return <Badge variant="success">Onaylandi</Badge>;
      case 'REJECTED':
        return <Badge variant="danger">Reddedildi</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-purple-50 to-gray-100">
      <div className="container-custom py-8 space-y-6">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <>
            {pendingWarehouseOrders.length > 0 && (
              <Card className="border-2 border-cyan-100 bg-gradient-to-br from-cyan-50 to-white">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-xl font-black text-slate-900">Depo Surecindeki Acik Siparisler</h2>
                    <p className="text-sm text-slate-600">Toplama ve yukleme adimlarini buradan takip edebilirsiniz.</p>
                  </div>
                  <Button variant="secondary" onClick={() => router.push('/pending-orders')}>
                    Tumunu Gor
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {pendingWarehouseOrders.slice(0, 6).map((order) => {
                    const status = warehouseStatusMeta[order.warehouseStatus || 'PENDING'];
                    return (
                      <div key={order.mikroOrderNumber} className="rounded-xl border border-cyan-200 bg-white p-3">
                        <div className="flex justify-between items-center gap-2 mb-2">
                          <p className="font-black text-slate-900">{order.mikroOrderNumber}</p>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </div>
                        <p className="text-xs text-slate-600">{order.itemCount} kalem</p>
                        <p className="text-xs text-slate-600">Tarih: {formatDate(order.orderDate)}</p>
                        <p className="text-sm font-bold text-cyan-700 mt-1">{formatCurrency(order.grandTotal)}</p>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {orders.length === 0 ? (
              <Card>
                <div className="text-center py-12">
                  <p className="text-gray-600 mb-4">Henuz siparisiniz bulunmuyor</p>
                  <Button onClick={() => router.push('/products')}>Urunleri Incele</Button>
                </div>
              </Card>
            ) : (
              <div className="space-y-6">
                {orders.map((order) => (
                  <Card key={order.id} className="shadow-xl border-2 border-primary-100 bg-white hover:shadow-2xl transition-shadow">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6 pb-6 border-b-2 border-gray-100">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-2xl font-bold text-gray-900">Siparis #{order.orderNumber}</h3>
                          {getStatusBadge(order.status)}
                        </div>
                        <div className="text-sm text-gray-600 mb-2">{formatDate(order.createdAt)}</div>
                        {order.requestedBy && (
                          <div className="text-xs text-gray-600 mb-2">
                            Talep eden: {order.requestedBy.name}
                            {order.requestedBy.email ? ` (${order.requestedBy.email})` : ''}
                          </div>
                        )}
                        {order.customerOrderNumber && (
                          <div className="text-xs text-gray-600 mb-2">Musteri Siparis No: {order.customerOrderNumber}</div>
                        )}
                        {order.deliveryLocation && (
                          <div className="text-xs text-gray-600 mb-2">Teslimat: {order.deliveryLocation}</div>
                        )}
                        {order.approvedAt && (
                          <div className="bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-sm font-semibold inline-block">
                            Onaylandi: {formatDate(order.approvedAt)}
                          </div>
                        )}
                        {order.adminNote && (
                          <div className="mt-3 bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded-lg">
                            <p className="text-xs font-semibold text-yellow-800 mb-1">Admin Notu:</p>
                            <p className="text-sm text-yellow-700">{order.adminNote}</p>
                          </div>
                        )}
                      </div>
                      <div className="text-right bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl p-4 border-2 border-primary-200">
                        <p className="text-sm text-gray-600 mb-1">Toplam Tutar</p>
                        <p className="text-3xl font-bold text-primary-700">{formatCurrency(order.totalAmount)}</p>
                        <p className="text-xs text-gray-600 mt-1">{order.items.length} urun</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-lg font-bold text-gray-900 mb-4">Siparis Detaylari ({order.items.length} urun)</p>
                      <div className="space-y-3">
                        {order.items.map((item) => (
                          <div
                            key={item.id}
                            className="bg-gradient-to-r from-gray-50 to-white rounded-xl p-4 border-2 border-gray-200 hover:border-primary-300 hover:shadow-md transition-all"
                          >
                            <div className="flex justify-between items-start gap-4">
                              <div className="flex-1">
                                <p className="font-bold text-gray-900 text-lg mb-1">
                                  {item.productName || (item as any).product?.name || 'Urun'}
                                </p>
                                <div className="flex flex-wrap gap-2 items-center">
                                  <span className="text-sm text-gray-600 font-mono bg-gray-100 px-2 py-1 rounded">
                                    {item.mikroCode || (item as any).product?.mikroCode || '-'}
                                  </span>
                                  <Badge
                                    variant={item.priceType === 'INVOICED' ? 'info' : 'default'}
                                    className="text-xs font-semibold"
                                  >
                                    {item.priceType === 'INVOICED' ? 'Faturali' : 'Beyaz'}
                                  </Badge>
                                </div>
                                {item.lineNote && <p className="text-xs text-gray-500 mt-2">Not: {item.lineNote}</p>}
                              </div>
                              <div className="text-right">
                                <p className="text-sm text-gray-600 mb-1">
                                  {item.quantity} x {formatCurrency(item.unitPrice)}
                                </p>
                                <p className="text-xl font-bold text-primary-600">{formatCurrency(item.totalPrice)}</p>
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
          </>
        )}
      </div>
    </div>
  );
}
