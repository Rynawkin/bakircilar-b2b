'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { PendingOrderForAdmin } from '@/types';
import adminApi from '@/lib/api/admin';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { OrderCardSkeleton } from '@/components/ui/Skeleton';
import { CustomerInfoCard } from '@/components/ui/CustomerInfoCard';
import { formatCurrency, formatDate } from '@/lib/utils/format';

type OrderStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<PendingOrderForAdmin[]>([]);
  const [allOrders, setAllOrders] = useState<PendingOrderForAdmin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<OrderStatus>('PENDING');

  useEffect(() => {
    fetchOrders();
  }, []);

  useEffect(() => {
    // Filter orders based on active tab
    if (activeTab === 'ALL') {
      setOrders(allOrders);
    } else {
      setOrders(allOrders.filter(order => order.status === activeTab));
    }
  }, [activeTab, allOrders]);

  const fetchOrders = async () => {
    try {
      const { orders } = await adminApi.getAllOrders();
      setAllOrders(orders);
      // Initial display is pending orders
      setOrders(orders.filter(order => order.status === 'PENDING'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (orderId: string) => {
    const order = allOrders.find((item) => item.id === orderId);
    if (!order) {
      toast.error('Sipariş bulunamadı');
      return;
    }

    const hasInvoiced = order.items.some((item) => item.priceType === 'INVOICED');
    const hasWhite = order.items.some((item) => item.priceType === 'WHITE');

    const result = await new Promise<{
      note: string;
      invoicedSeries?: string;
      whiteSeries?: string;
    } | null>((resolve) => {
      let noteValue = '';
      let invoicedSeries = 'B2BF';
      let whiteSeries = 'B2BB';

      toast((t) => (
        <div className="flex flex-col gap-3 min-w-[320px]">
          <p className="font-medium">Onay notu (opsiyonel):</p>
          <input
            type="text"
            className="border rounded px-3 py-2 text-sm"
            placeholder="Not ekleyin..."
            onChange={(e) => noteValue = e.target.value}
          />

          {hasInvoiced && (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Faturalı evrak seri:</p>
              <input
                type="text"
                className="border rounded px-3 py-2 text-sm"
                defaultValue={invoicedSeries}
                onChange={(e) => invoicedSeries = e.target.value}
              />
            </div>
          )}

          {hasWhite && (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Beyaz evrak seri:</p>
              <input
                type="text"
                className="border rounded px-3 py-2 text-sm"
                defaultValue={whiteSeries}
                onChange={(e) => whiteSeries = e.target.value}
              />
            </div>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <button
              className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
              onClick={() => {
                toast.dismiss(t.id);
                resolve(null);
              }}
            >
              İptal
            </button>
            <button
              className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
              onClick={() => {
                const trimmedInvoiced = invoicedSeries.trim();
                const trimmedWhite = whiteSeries.trim();

                if (hasInvoiced && !trimmedInvoiced) {
                  toast.error('Faturalı evrak serisi gerekli');
                  return;
                }
                if (hasWhite && !trimmedWhite) {
                  toast.error('Beyaz evrak serisi gerekli');
                  return;
                }

                toast.dismiss(t.id);
                resolve({
                  note: noteValue,
                  invoicedSeries: hasInvoiced ? trimmedInvoiced.slice(0, 20) : undefined,
                  whiteSeries: hasWhite ? trimmedWhite.slice(0, 20) : undefined,
                });
              }}
            >
              Onayla
            </button>
          </div>
        </div>
      ), {
        duration: Infinity,
      });
    });

    if (!result) return;

    try {
      await adminApi.approveOrder(orderId, {
        adminNote: result.note.trim() || undefined,
        invoicedSeries: result.invoicedSeries,
        whiteSeries: result.whiteSeries,
      });
      toast.success('Sipariş onaylandı ve Mikro\'ya gönderildi! ✅');
      fetchOrders();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Onaylama başarısız');
    }
  };

  const handleReject = async (orderId: string) => {
    const note = await new Promise<string>((resolve) => {
      let inputValue = '';
      toast((t) => (
        <div className="flex flex-col gap-3 min-w-[300px]">
          <p className="font-medium text-red-700">Red sebebi (zorunlu):</p>
          <textarea
            className="border rounded px-3 py-2 text-sm resize-none"
            rows={3}
            placeholder="Red sebebini yazın..."
            onChange={(e) => inputValue = e.target.value}
          />
          <div className="flex gap-2 justify-end">
            <button
              className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
              onClick={() => {
                toast.dismiss(t.id);
                resolve('__CANCEL__');
              }}
            >
              İptal
            </button>
            <button
              className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
              onClick={() => {
                toast.dismiss(t.id);
                if (!inputValue.trim()) {
                  toast.error('Red sebebi girilmelidir');
                  resolve('__CANCEL__');
                } else {
                  resolve(inputValue);
                }
              }}
            >
              Reddet
            </button>
          </div>
        </div>
      ), {
        duration: Infinity,
      });
    });

    if (note === '__CANCEL__') return;

    try {
      await adminApi.rejectOrder(orderId, note);
      toast.success('Sipariş reddedildi');
      fetchOrders();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Reddetme başarısız');
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
        return null;
    }
  };

  const getOrderCounts = () => {
    return {
      pending: allOrders.filter(o => o.status === 'PENDING').length,
      approved: allOrders.filter(o => o.status === 'APPROVED').length,
      rejected: allOrders.filter(o => o.status === 'REJECTED').length,
      all: allOrders.length,
    };
  };

  const counts = getOrderCounts();
  const pageHeader = (
    <div className="container-custom py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Siparisler</h1>
          <p className="text-sm text-gray-600">Tum musteri siparisleri</p>
        </div>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        {pageHeader}
        <div className="container-custom pb-8 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <OrderCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {pageHeader}

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container-custom">
          <div className="flex gap-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab('PENDING')}
              className={`px-6 py-4 font-semibold text-sm whitespace-nowrap transition-colors relative ${
                activeTab === 'PENDING'
                  ? 'text-primary-600 border-b-2 border-primary-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              ⏳ Bekleyen
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'PENDING' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {counts.pending}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('APPROVED')}
              className={`px-6 py-4 font-semibold text-sm whitespace-nowrap transition-colors relative ${
                activeTab === 'APPROVED'
                  ? 'text-green-600 border-b-2 border-green-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              ✅ Onaylanan
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {counts.approved}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('REJECTED')}
              className={`px-6 py-4 font-semibold text-sm whitespace-nowrap transition-colors relative ${
                activeTab === 'REJECTED'
                  ? 'text-red-600 border-b-2 border-red-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              ❌ Reddedilen
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {counts.rejected}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-6 py-4 font-semibold text-sm whitespace-nowrap transition-colors relative ${
                activeTab === 'ALL'
                  ? 'text-gray-900 border-b-2 border-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              📋 Tümü
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'ALL' ? 'bg-gray-200 text-gray-900' : 'bg-gray-100 text-gray-600'
              }`}>
                {counts.all}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="container-custom py-8">
        {orders.length === 0 ? (
          <Card>
            <p className="text-center text-gray-600 py-8">
              {activeTab === 'PENDING' && '⏳ Bekleyen sipariş yok'}
              {activeTab === 'APPROVED' && '✅ Onaylanmış sipariş yok'}
              {activeTab === 'REJECTED' && '❌ Reddedilmiş sipariş yok'}
              {activeTab === 'ALL' && '📋 Henüz hiç sipariş yok'}
            </p>
          </Card>
        ) : (
          <div className="space-y-6">
            {orders.map((order) => (
              <Card key={order.id} className="overflow-hidden">
                {/* Order Header */}
                <div className="flex justify-between items-start mb-4 pb-4 border-b border-gray-200">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="font-bold text-xl text-gray-900">#{order.orderNumber}</h3>
                      {getStatusBadge(order.status)}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{formatDate(order.createdAt)}</p>

                    {/* Mikro Order IDs */}
                    {order.mikroOrderIds && order.mikroOrderIds.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {order.mikroOrderIds.map((mikroId, idx) => (
                          <div key={idx} className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                            <span className="text-xs font-medium text-blue-700">🔗 Mikro ID:</span>
                            <span className="text-xs font-mono font-bold text-blue-900">{mikroId}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Admin Note */}
                    {order.adminNote && (
                      <div className="mt-2 bg-gray-50 border border-gray-200 rounded px-3 py-2">
                        <p className="text-xs font-medium text-gray-600">?? Admin Notu:</p>
                        <p className="text-sm text-gray-800 mt-1">{order.adminNote}</p>
                      </div>
                    )}

                    

                    {(order.customerOrderNumber || order.deliveryLocation) && (
                      <div className="mt-2 bg-gray-50 border border-gray-200 rounded px-3 py-2">
                        <p className="text-xs font-medium text-gray-600">Siparis Ek Bilgileri:</p>
                        {order.customerOrderNumber && (
                          <p className="text-xs text-gray-700 mt-1">Belge No: {order.customerOrderNumber}</p>
                        )}
                        {order.deliveryLocation && (
                          <p className="text-xs text-gray-700 mt-1">Teslimat: {order.deliveryLocation}</p>
                        )}
                      </div>
                    )}

                    {order.customerRequest && (
                      <div className="mt-2 bg-indigo-50 border border-indigo-200 rounded px-3 py-2">
                        <p className="text-xs font-medium text-indigo-700">Talep Kaynagi</p>
                        <p className="text-xs text-indigo-700 mt-1">Talep ID: {order.customerRequest.id.slice(0, 8)}</p>
                        {order.customerRequest.requestedBy && (
                          <p className="text-xs text-indigo-700 mt-1">
                            Talep eden: {order.customerRequest.requestedBy.name}
                            {order.customerRequest.requestedBy.email ? ` (${order.customerRequest.requestedBy.email})` : ''}
                          </p>
                        )}
                      </div>
                    )}

                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500 mb-1">Toplam Tutar</p>
                    <p className="text-2xl font-bold text-primary-600">{formatCurrency(order.totalAmount)}</p>
                  </div>
                </div>

                {/* Customer Information */}
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Musteri Bilgileri</h4>
                  <CustomerInfoCard customer={order.user} />
                </div>

                {/* Order Items */}
                <div className="border-t pt-4 mb-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3">Siparis Kalemleri ({order.items.length} urun)</p>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    {order.items.map((item) => (
                      <div key={item.id} className="flex justify-between items-center text-sm py-2 px-3 bg-white rounded border border-gray-100">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{item.productName}</p>
                          <div className="flex gap-2 mt-1">
                            <span className="text-xs text-gray-500">{item.mikroCode}</span>
                            <Badge variant={item.priceType === 'INVOICED' ? 'info' : 'default'} className="text-xs">
                              {item.priceType === 'INVOICED' ? 'Faturali' : 'Beyaz'}
                            </Badge>
                          </div>
                          {item.lineNote && (
                            <p className="text-xs text-gray-500 mt-1">Not: {item.lineNote}</p>
                          )}
                        </div>
                        <div className="text-right ml-4">
                          <p className="text-gray-600">{item.quantity} x {formatCurrency(item.unitPrice)}</p>
                          <p className="font-semibold text-gray-900">{formatCurrency(item.totalPrice)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Buttons - Only show for PENDING orders */}
                {order.status === 'PENDING' && (
                  <div className="flex gap-3 pt-4 border-t border-gray-200">
                    <Button variant="primary" onClick={() => handleApprove(order.id)} className="flex-1">
                      Onayla ve Mikro'ya Gonder
                    </Button>
                    <Button variant="danger" onClick={() => handleReject(order.id)} className="flex-1">
                      Reddet
                    </Button>
                  </div>
                )}

                {/* Status Info for Approved/Rejected */}
                {order.status === 'APPROVED' && order.approvedAt && (
                  <div className="pt-4 border-t border-gray-200 text-center">
                    <p className="text-sm text-green-700">
                      ✅ Onaylandı: {formatDate(order.approvedAt)}
                    </p>
                  </div>
                )}
                {order.status === 'REJECTED' && order.rejectedAt && (
                  <div className="pt-4 border-t border-gray-200 text-center">
                    <p className="text-sm text-red-700">
                      ❌ Reddedildi: {formatDate(order.rejectedAt)}
                    </p>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
