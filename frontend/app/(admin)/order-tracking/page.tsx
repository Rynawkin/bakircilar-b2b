'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/lib/store/authStore';
import { AdminNavigation } from '@/components/layout/AdminNavigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/api/client';

interface PendingOrder {
  mikroOrderNumber: string;
  customerName: string;
  customerCode: string;
  orderDate: string;
  deliveryDate: string | null;
  itemCount: number;
  grandTotal: number;
}

interface CustomerSummary {
  customerCode: string;
  customerName: string;
  ordersCount: number;
  totalAmount: number;
  emailSent: boolean;
}

interface Settings {
  syncEnabled: boolean;
  syncSchedule: string;
  emailEnabled: boolean;
  emailSubject: string;
  lastSyncAt: string | null;
  lastEmailSentAt: string | null;
}

export default function OrderTrackingPage() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [customerSummary, setCustomerSummary] = useState<CustomerSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSendingEmails, setIsSendingEmails] = useState(false);
  const [sendingToCustomer, setSendingToCustomer] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'orders' | 'customers'>('customers');

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (user === null) return;
    if (user.role !== 'ADMIN') {
      router.push('/login');
      return;
    }
    fetchData();
  }, [user, router]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [settingsRes, ordersRes, summaryRes] = await Promise.all([
        apiClient.get('/order-tracking/admin/settings'),
        apiClient.get('/order-tracking/admin/pending-orders'),
        apiClient.get('/order-tracking/admin/summary'),
      ]);

      setSettings(settingsRes.data);
      setOrders(ordersRes.data);
      setCustomerSummary(summaryRes.data);
    } catch (error: any) {
      console.error('Veri yükleme hatası:', error);
      toast.error('Veriler yüklenemedi');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await apiClient.post('/order-tracking/admin/sync');
      toast.success('Sipariş sync başlatıldı!');
      setTimeout(fetchData, 3000);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Sync başarısız');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSendEmails = async () => {
    const confirmed = confirm('Tüm müşterilere mail gönderilsin mi?');
    if (!confirmed) return;

    setIsSendingEmails(true);
    try {
      const res = await apiClient.post('/order-tracking/admin/send-emails');
      toast.success(`${res.data.sentCount} mail gönderildi!`);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Mail gönderilemedi');
    } finally {
      setIsSendingEmails(false);
    }
  };

  const handleSyncAndSend = async () => {
    const confirmed = confirm('Sync + Mail gönderilsin mi?');
    if (!confirmed) return;

    setIsSyncing(true);
    setIsSendingEmails(true);
    try {
      const res = await apiClient.post('/order-tracking/admin/sync-and-send');
      toast.success(res.data.message);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İşlem başarısız');
    } finally {
      setIsSyncing(false);
      setIsSendingEmails(false);
    }
  };

  const handleSendToCustomer = async (customerCode: string) => {
    const confirmed = confirm(`${customerCode} kodlu müşteriye mail gönderilsin mi?`);
    if (!confirmed) return;

    setSendingToCustomer(customerCode);
    try {
      const res = await apiClient.post(`/order-tracking/admin/send-email/${customerCode}`);
      toast.success(res.data.message);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Mail gönderilemedi');
    } finally {
      setSendingToCustomer(null);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(value);
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Intl.DateTimeFormat('tr-TR').format(new Date(date));
  };

  if (!user || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const totalAmount = orders.reduce((sum, order) => sum + order.grandTotal, 0);
  const totalCustomers = new Set(orders.map((o) => o.customerCode)).size;

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNavigation />

      <div className="container-custom py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">📋 Sipariş Takip</h1>
          <p className="text-gray-600">Bekleyen müşteri siparişlerini takip edin ve mail gönderin</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <p className="text-sm font-medium text-blue-800 mb-2">📦 Bekleyen Sipariş</p>
            <p className="text-4xl font-bold text-blue-600">{orders.length}</p>
            <p className="text-xs text-blue-700 mt-1">{totalCustomers} müşteri</p>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <p className="text-sm font-medium text-green-800 mb-2">💰 Toplam Tutar</p>
            <p className="text-3xl font-bold text-green-600">{formatCurrency(totalAmount)}</p>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <p className="text-sm font-medium text-purple-800 mb-2">📧 Son Mail</p>
            <p className="text-lg font-bold text-purple-600">
              {settings?.lastEmailSentAt ? formatDate(settings.lastEmailSentAt) : 'Henüz gönderilmedi'}
            </p>
            <p className="text-xs text-purple-700 mt-1">
              Son sync: {settings?.lastSyncAt ? formatDate(settings.lastSyncAt) : '-'}
            </p>
          </Card>
        </div>

        {/* Actions */}
        <Card className="mb-8">
          <h2 className="text-xl font-bold mb-4">⚡ Hızlı İşlemler</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              onClick={handleSync}
              isLoading={isSyncing}
              disabled={isSyncing}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              🔄 Siparişleri Sync Et
            </Button>
            <Button
              onClick={handleSendEmails}
              isLoading={isSendingEmails}
              disabled={isSendingEmails}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              📧 Mail Gönder
            </Button>
            <Button
              onClick={handleSyncAndSend}
              isLoading={isSyncing || isSendingEmails}
              disabled={isSyncing || isSendingEmails}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              ⚡ Sync + Mail
            </Button>
          </div>
        </Card>

        {/* Settings */}
        {settings && (
          <Card className="mb-8">
            <h2 className="text-xl font-bold mb-4">⚙️ Ayarlar</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-700">Otomatik Sync:</span>{' '}
                <span className={settings.syncEnabled ? 'text-green-600' : 'text-red-600'}>
                  {settings.syncEnabled ? '✅ Aktif' : '❌ Pasif'}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Zamanlama:</span>{' '}
                <span className="text-gray-900">{settings.syncSchedule}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Email:</span>{' '}
                <span className={settings.emailEnabled ? 'text-green-600' : 'text-red-600'}>
                  {settings.emailEnabled ? '✅ Aktif' : '❌ Pasif'}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Email Konusu:</span>{' '}
                <span className="text-gray-900">{settings.emailSubject}</span>
              </div>
            </div>
          </Card>
        )}

        {/* View Toggle */}
        <Card className="mb-8">
          <div className="flex gap-2">
            <Button
              onClick={() => setViewMode('customers')}
              className={viewMode === 'customers' ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-700'}
            >
              👥 Müşteri Bazlı ({customerSummary.length})
            </Button>
            <Button
              onClick={() => setViewMode('orders')}
              className={viewMode === 'orders' ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-700'}
            >
              📋 Sipariş Bazlı ({orders.length})
            </Button>
          </div>
        </Card>

        {/* Customer Summary View */}
        {viewMode === 'customers' && (
          <Card>
            <h2 className="text-xl font-bold mb-4">👥 Müşteri Bazlı Görünüm ({customerSummary.length})</h2>
            {customerSummary.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg mb-2">✅ Bekleyen sipariş yok</p>
                <p className="text-sm">Yeni siparişler sync edildiğinde burada görünecek.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                        Müşteri
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">
                        Sipariş Sayısı
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">
                        Toplam Tutar
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">
                        Mail Durumu
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">
                        İşlem
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {customerSummary.map((customer) => (
                      <tr key={customer.customerCode} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-700">
                          <div className="font-medium text-gray-900">{customer.customerName}</div>
                          <div className="text-xs text-gray-500">{customer.customerCode}</div>
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                          {customer.ordersCount} sipariş
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-primary-600">
                          {formatCurrency(customer.totalAmount)}
                        </td>
                        <td className="px-4 py-3 text-center text-sm">
                          {customer.emailSent ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              ✅ Gönderildi
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              ⏳ Bekliyor
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button
                            onClick={() => handleSendToCustomer(customer.customerCode)}
                            isLoading={sendingToCustomer === customer.customerCode}
                            disabled={sendingToCustomer === customer.customerCode}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-sm py-1 px-3"
                          >
                            📧 Mail Gönder
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* Orders List View */}
        {viewMode === 'orders' && (
          <Card>
            <h2 className="text-xl font-bold mb-4">📋 Bekleyen Siparişler ({orders.length})</h2>
          {orders.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg mb-2">✅ Bekleyen sipariş yok</p>
              <p className="text-sm">Yeni siparişler sync edildiğinde burada görünecek.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                      Sipariş No
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                      Müşteri
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                      Tarih
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                      Teslimat
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">
                      Kalem
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">
                      Tutar
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {orders.map((order) => (
                    <tr key={order.mikroOrderNumber} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-sm text-gray-900">
                        {order.mikroOrderNumber}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <div>{order.customerName}</div>
                        <div className="text-xs text-gray-500">{order.customerCode}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {formatDate(order.orderDate)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {formatDate(order.deliveryDate)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700">
                        {order.itemCount}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                        {formatCurrency(order.grandTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </Card>
        )}
      </div>
    </div>
  );
}
