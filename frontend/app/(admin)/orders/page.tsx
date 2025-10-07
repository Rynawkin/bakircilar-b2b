'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { PendingOrderForAdmin } from '@/types';
import adminApi from '@/lib/api/admin';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LogoLink } from '@/components/ui/Logo';
import { OrderCardSkeleton } from '@/components/ui/Skeleton';
import { formatCurrency, formatDate } from '@/lib/utils/format';

export default function AdminOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<PendingOrderForAdmin[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const { orders } = await adminApi.getPendingOrders();
      setOrders(orders);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (orderId: string) => {
    const note = await new Promise<string>((resolve) => {
      let inputValue = '';
      toast((t) => (
        <div className="flex flex-col gap-3 min-w-[300px]">
          <p className="font-medium">Onay notu (opsiyonel):</p>
          <input
            type="text"
            className="border rounded px-3 py-2 text-sm"
            placeholder="Not ekleyin..."
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
              className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
              onClick={() => {
                toast.dismiss(t.id);
                resolve(inputValue);
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

    if (note === '__CANCEL__') return;

    try {
      await adminApi.approveOrder(orderId, note || undefined);
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-gradient-to-r from-primary-700 to-primary-600 shadow-lg">
          <div className="container-custom py-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-6">
                <LogoLink href="/dashboard" variant="light" />
                <div>
                  <h1 className="text-xl font-bold text-white">📦 Bekleyen Siparişler</h1>
                  <p className="text-sm text-primary-100">Yükleniyor...</p>
                </div>
              </div>
            </div>
          </div>
        </header>
        <div className="container-custom py-8 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <OrderCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-primary-700 to-primary-600 shadow-lg">
        <div className="container-custom py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-6">
              <LogoLink href="/dashboard" variant="light" />
              <div>
                <h1 className="text-xl font-bold text-white">📦 Bekleyen Siparişler ({orders.length})</h1>
                <p className="text-sm text-primary-100">Onay bekleyen müşteri siparişleri</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => router.push('/dashboard')}
                className="bg-white text-primary-700 hover:bg-primary-50"
              >
                ← Dashboard
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container-custom py-8">
        {orders.length === 0 ? (
          <Card><p className="text-center text-gray-600 py-8">Bekleyen sipariş yok</p></Card>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <Card key={order.id}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-lg">#{order.orderNumber}</h3>
                    <p className="text-sm text-gray-600 mt-1">{formatDate(order.createdAt)}</p>
                    <div className="mt-2 space-y-1">
                      <p className="text-sm"><strong>Müşteri:</strong> {order.user.name}</p>
                      <p className="text-sm"><strong>Email:</strong> {order.user.email}</p>
                      <p className="text-sm"><strong>Mikro Cari:</strong> {order.user.mikroCariCode}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary-600">{formatCurrency(order.totalAmount)}</p>
                  </div>
                </div>

                <div className="border-t pt-4 mb-4">
                  <p className="text-sm font-medium mb-2">Ürünler:</p>
                  {order.items.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm py-1">
                      <div>
                        <span>{item.productName}</span>
                        <Badge variant={item.priceType === 'INVOICED' ? 'info' : 'default'} className="ml-2 text-xs">
                          {item.priceType === 'INVOICED' ? 'Faturalı' : 'Beyaz'}
                        </Badge>
                      </div>
                      <span>{item.quantity} x {formatCurrency(item.unitPrice)}</span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button variant="primary" onClick={() => handleApprove(order.id)} className="flex-1">
                    Onayla ve Mikro'ya Gönder
                  </Button>
                  <Button variant="danger" onClick={() => handleReject(order.id)} className="flex-1">
                    Reddet
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
