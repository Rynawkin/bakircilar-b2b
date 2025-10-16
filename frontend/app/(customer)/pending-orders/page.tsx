'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/lib/store/authStore';
import { Card } from '@/components/ui/Card';
import { apiClient } from '@/lib/api/client';

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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">📋 Bekleyen Siparişlerim</h1>
          <p className="text-gray-600">Açık sipariş bakiyelerinizi görüntüleyin</p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <p className="text-sm font-medium text-blue-800 mb-2">📦 Bekleyen Sipariş</p>
            <p className="text-4xl font-bold text-blue-600">{orders.length}</p>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <p className="text-sm font-medium text-green-800 mb-2">💰 Toplam Tutar</p>
            <p className="text-3xl font-bold text-green-600">{formatCurrency(totalAmount)}</p>
          </Card>
        </div>

        {/* Orders */}
        {orders.length === 0 ? (
          <Card className="text-center py-12">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Bekleyen Sipariş Yok</h2>
            <p className="text-gray-600">Şu anda açık sipariş bakiyeniz bulunmamaktadır.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const isExpanded = expandedOrders.has(order.mikroOrderNumber);
              return (
                <Card key={order.mikroOrderNumber} className="overflow-hidden">
                  {/* Header */}
                  <div
                    className="flex items-center justify-between cursor-pointer hover:bg-gray-50 p-4 -m-4 mb-4"
                    onClick={() => toggleOrder(order.mikroOrderNumber)}
                  >
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-900 mb-1">
                        📦 Sipariş No: {order.mikroOrderNumber}
                      </h3>
                      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                        <span>📅 Tarih: {formatDate(order.orderDate)}</span>
                        <span>🚚 Teslimat: {formatDate(order.deliveryDate)}</span>
                        <span>📦 {order.itemCount} kalem</span>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <div className="text-2xl font-bold text-primary-600">
                        {formatCurrency(order.grandTotal)}
                      </div>
                      <div className="text-sm text-gray-500">
                        {isExpanded ? '▲ Gizle' : '▼ Detay'}
                      </div>
                    </div>
                  </div>

                  {/* Details */}
                  {isExpanded && (
                    <div className="border-t pt-4">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase">
                                Ürün
                              </th>
                              <th className="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase">
                                Miktar
                              </th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 uppercase">
                                Birim Fiyat
                              </th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 uppercase">
                                Tutar
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {order.items.map((item, index) => (
                              <tr key={index}>
                                <td className="px-3 py-2">
                                  <div className="font-medium text-gray-900">{item.productName}</div>
                                  <div className="text-xs text-gray-500">{item.productCode}</div>
                                </td>
                                <td className="px-3 py-2 text-center text-gray-700">
                                  {item.remainingQty} {item.unit}
                                </td>
                                <td className="px-3 py-2 text-right text-gray-700">
                                  {formatCurrency(item.unitPrice)}
                                </td>
                                <td className="px-3 py-2 text-right font-semibold text-gray-900">
                                  {formatCurrency(item.lineTotal)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Totals */}
                      <div className="mt-4 pt-4 border-t bg-gray-50 -mx-4 -mb-4 px-4 pb-4">
                        <div className="max-w-md ml-auto space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Ara Toplam:</span>
                            <span className="font-semibold">{formatCurrency(order.totalAmount)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">KDV:</span>
                            <span className="font-semibold">{formatCurrency(order.totalVAT)}</span>
                          </div>
                          <div className="flex justify-between text-lg border-t pt-2">
                            <span className="font-bold text-gray-900">TOPLAM:</span>
                            <span className="font-bold text-primary-600">
                              {formatCurrency(order.grandTotal)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
