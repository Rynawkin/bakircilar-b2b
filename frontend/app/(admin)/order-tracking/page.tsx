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

interface OrderDetail {
  id: string;
  mikroOrderNumber: string;
  orderDate: string;
  deliveryDate: string | null;
  itemCount: number;
  grandTotal: number;
  items: OrderItem[];
}

interface CustomerSummary {
  customerCode: string;
  customerName: string;
  customerEmail: string | null;
  sectorCode: string | null;
  ordersCount: number;
  totalAmount: number;
  emailSent: boolean;
  orders: OrderDetail[];
}

interface Settings {
  syncEnabled: boolean;
  syncSchedule: string;
  customerSyncSchedule: string;
  supplierSyncSchedule: string;
  emailEnabled: boolean;
  customerEmailEnabled: boolean;
  supplierEmailEnabled: boolean;
  emailSubject: string;
  customerEmailSubject: string;
  supplierEmailSubject: string;
  lastSyncAt: string | null;
  lastEmailSentAt: string | null;
  lastCustomerEmailSentAt: string | null;
  lastSupplierEmailSentAt: string | null;
}

export default function OrderTrackingPage() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [customerSummary, setCustomerSummary] = useState<CustomerSummary[]>([]);
  const [supplierSummary, setSupplierSummary] = useState<CustomerSummary[]>([]);
  const [activeTab, setActiveTab] = useState<'customers' | 'suppliers'>('customers');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSendingEmails, setIsSendingEmails] = useState(false);
  const [sendingToCustomer, setSendingToCustomer] = useState<string | null>(null);
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
  const [emailOverrides, setEmailOverrides] = useState<Record<string, string>>({});

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
      const [settingsRes, ordersRes, summaryRes, supplierRes] = await Promise.all([
        apiClient.get('/order-tracking/admin/settings'),
        apiClient.get('/order-tracking/admin/pending-orders'),
        apiClient.get('/order-tracking/admin/summary'),
        apiClient.get('/order-tracking/admin/supplier-summary'),
      ]);

      setSettings(settingsRes.data);
      setOrders(ordersRes.data);
      setCustomerSummary(summaryRes.data);
      setSupplierSummary(supplierRes.data);
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

  const handleSendCustomerEmails = async () => {
    const confirmed = confirm('Tüm müşterilere mail gönderilsin mi?');
    if (!confirmed) return;

    setIsSendingEmails(true);
    try {
      const res = await apiClient.post('/order-tracking/admin/send-customer-emails');
      toast.success(`${res.data.sentCount} müşteriye mail gönderildi!`);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Mail gönderilemedi');
    } finally {
      setIsSendingEmails(false);
    }
  };

  const handleSendSupplierEmails = async () => {
    const confirmed = confirm('Tüm tedarikçilere mail gönderilsin mi?');
    if (!confirmed) return;

    setIsSendingEmails(true);
    try {
      const res = await apiClient.post('/order-tracking/admin/send-supplier-emails');
      toast.success(`${res.data.sentCount} tedarikçiye mail gönderildi!`);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Mail gönderilemedi');
    } finally {
      setIsSendingEmails(false);
    }
  };

  const handleSyncAndSend = async () => {
    const confirmed = confirm('Sync + Tüm mailleri gönder (müşteri + tedarikçi)?');
    if (!confirmed) return;

    setIsSyncing(true);
    setIsSendingEmails(true);
    try {
      // 1. Sync
      await apiClient.post('/order-tracking/admin/sync');

      // 2. Müşterilere mail gönder
      const customerRes = await apiClient.post('/order-tracking/admin/send-customer-emails');

      // 3. Tedarikçilere mail gönder
      const supplierRes = await apiClient.post('/order-tracking/admin/send-supplier-emails');

      toast.success(
        `Sync tamamlandı! ${customerRes.data.sentCount} müşteri + ${supplierRes.data.sentCount} tedarikçi = ${
          customerRes.data.sentCount + supplierRes.data.sentCount
        } mail gönderildi`
      );
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İşlem başarısız');
    } finally {
      setIsSyncing(false);
      setIsSendingEmails(false);
    }
  };

  const handleSendToCustomer = async (customerCode: string) => {
    const emailOverride = emailOverrides[customerCode]?.trim();

    const message = emailOverride
      ? `${customerCode} kodlu müşterinin siparişleri ${emailOverride} adresine gönderilsin mi?`
      : `${customerCode} kodlu müşteriye mail gönderilsin mi?`;

    const confirmed = confirm(message);
    if (!confirmed) return;

    setSendingToCustomer(customerCode);
    try {
      const res = await apiClient.post(`/order-tracking/admin/send-email/${customerCode}`, {
        emailOverride: emailOverride || undefined,
      });
      toast.success(res.data.message);
      // Email override'ı temizle
      if (emailOverride) {
        setEmailOverrides((prev) => {
          const updated = { ...prev };
          delete updated[customerCode];
          return updated;
        });
      }
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Mail gönderilemedi');
    } finally {
      setSendingToCustomer(null);
    }
  };

  const toggleCustomerExpanded = (customerCode: string) => {
    const newExpanded = new Set(expandedCustomers);
    if (newExpanded.has(customerCode)) {
      newExpanded.delete(customerCode);
    } else {
      newExpanded.add(customerCode);
    }
    setExpandedCustomers(newExpanded);
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

  const customerAmount = customerSummary.reduce((sum, c) => sum + c.totalAmount, 0);
  const supplierAmount = supplierSummary.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalAmount = customerAmount + supplierAmount;

  const currentSummary = activeTab === 'customers' ? customerSummary : supplierSummary;
  const currentAmount = activeTab === 'customers' ? customerAmount : supplierAmount;

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNavigation />

      <div className="container-custom py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">📋 Sipariş Takip</h1>
          <p className="text-gray-600">Bekleyen müşteri ve tedarikçi siparişlerini takip edin ve mail gönderin</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <p className="text-sm font-medium text-blue-800 mb-2">👥 Müşteri Siparişleri</p>
            <p className="text-3xl font-bold text-blue-600">{customerSummary.length}</p>
            <p className="text-lg font-semibold text-blue-700 mt-1">{formatCurrency(customerAmount)}</p>
          </Card>

          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <p className="text-sm font-medium text-orange-800 mb-2">🏭 Tedarikçi Siparişleri</p>
            <p className="text-3xl font-bold text-orange-600">{supplierSummary.length}</p>
            <p className="text-lg font-semibold text-orange-700 mt-1">{formatCurrency(supplierAmount)}</p>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <p className="text-sm font-medium text-green-800 mb-2">💰 Genel Toplam</p>
            <p className="text-3xl font-bold text-green-600">{formatCurrency(totalAmount)}</p>
            <p className="text-xs text-green-700 mt-1">{customerSummary.length + supplierSummary.length} sipariş</p>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <p className="text-sm font-medium text-purple-800 mb-2">📧 Son Maillar</p>
            <div className="text-xs text-purple-700">
              <div>Müşteri: {settings?.lastCustomerEmailSentAt ? formatDate(settings.lastCustomerEmailSentAt) : '-'}</div>
              <div className="mt-1">Tedarikçi: {settings?.lastSupplierEmailSentAt ? formatDate(settings.lastSupplierEmailSentAt) : '-'}</div>
            </div>
            <p className="text-xs text-purple-600 mt-2">
              Son sync: {settings?.lastSyncAt ? formatDate(settings.lastSyncAt) : '-'}
            </p>
          </Card>
        </div>

        {/* Actions */}
        <Card className="mb-8">
          <h2 className="text-xl font-bold mb-4">⚡ Hızlı İşlemler</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Button
                onClick={handleSync}
                isLoading={isSyncing}
                disabled={isSyncing}
                className="bg-blue-600 hover:bg-blue-700 text-white w-full"
              >
                🔄 Siparişleri Sync Et
              </Button>
              <p className="text-xs text-gray-500 mt-2">
                Mikro ERP'den bekleyen siparişleri çeker ve veritabanına kaydeder
              </p>
            </div>

            <div>
              <Button
                onClick={activeTab === 'customers' ? handleSendCustomerEmails : handleSendSupplierEmails}
                isLoading={isSendingEmails}
                disabled={isSendingEmails}
                className="bg-green-600 hover:bg-green-700 text-white w-full"
              >
                📧 {activeTab === 'customers' ? 'Müşterilere' : 'Tedarikçilere'} Mail Gönder
              </Button>
              <p className="text-xs text-gray-500 mt-2">
                Seçili sekmedeki tüm {activeTab === 'customers' ? 'müşterilere' : 'tedarikçilere'} sipariş bilgilerini mail ile gönderir
              </p>
            </div>

            <div>
              <Button
                onClick={handleSyncAndSend}
                isLoading={isSyncing || isSendingEmails}
                disabled={isSyncing || isSendingEmails}
                className="bg-purple-600 hover:bg-purple-700 text-white w-full"
              >
                ⚡ Sync + Tüm Mailleri Gönder
              </Button>
              <p className="text-xs text-gray-500 mt-2">
                Önce sync yapar, ardından hem müşterilere hem tedarikçilere mail gönderir
              </p>
            </div>
          </div>
        </Card>

        {/* Settings */}
        {settings && (
          <Card className="mb-8">
            <h2 className="text-xl font-bold mb-4">⚙️ Ayarlar</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Müşteri Ayarları */}
              <div className="border-l-4 border-blue-500 pl-4">
                <h3 className="font-bold text-blue-700 mb-3">👥 Müşteri Mail Ayarları</h3>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">Otomatik Mail:</span>{' '}
                    <span className={settings.customerEmailEnabled ? 'text-green-600' : 'text-red-600'}>
                      {settings.customerEmailEnabled ? '✅ Aktif' : '❌ Pasif'}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Zamanlama:</span>{' '}
                    <span className="text-gray-900 font-mono text-xs">{settings.customerSyncSchedule}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Email Konusu:</span>{' '}
                    <span className="text-gray-900">{settings.customerEmailSubject}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Son Gönderim:</span>{' '}
                    <span className="text-gray-900">
                      {settings.lastCustomerEmailSentAt ? formatDate(settings.lastCustomerEmailSentAt) : 'Henüz gönderilmedi'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tedarikçi Ayarları */}
              <div className="border-l-4 border-orange-500 pl-4">
                <h3 className="font-bold text-orange-700 mb-3">🏭 Tedarikçi Mail Ayarları</h3>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">Otomatik Mail:</span>{' '}
                    <span className={settings.supplierEmailEnabled ? 'text-green-600' : 'text-red-600'}>
                      {settings.supplierEmailEnabled ? '✅ Aktif' : '❌ Pasif'}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Zamanlama:</span>{' '}
                    <span className="text-gray-900 font-mono text-xs">{settings.supplierSyncSchedule}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Email Konusu:</span>{' '}
                    <span className="text-gray-900">{settings.supplierEmailSubject}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Son Gönderim:</span>{' '}
                    <span className="text-gray-900">
                      {settings.lastSupplierEmailSentAt ? formatDate(settings.lastSupplierEmailSentAt) : 'Henüz gönderilmedi'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t text-sm text-gray-600">
              <p>
                <strong>Cron Format Açıklaması:</strong> <code className="bg-gray-100 px-2 py-1 rounded">0 8 * * 2,5</code> = Her Salı ve Cuma saat 08:00'de
              </p>
            </div>
          </Card>
        )}

        {/* Tabs */}
        <Card className="mb-8">
          <div className="flex gap-2 border-b pb-4">
            <Button
              onClick={() => setActiveTab('customers')}
              className={
                activeTab === 'customers'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }
            >
              👥 Müşteriler ({customerSummary.length})
            </Button>
            <Button
              onClick={() => setActiveTab('suppliers')}
              className={
                activeTab === 'suppliers'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }
            >
              🏭 Tedarikçiler ({supplierSummary.length})
            </Button>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">
                {activeTab === 'customers' ? '👥 Müşteriler' : '🏭 Tedarikçiler'} ({currentSummary.length})
              </h2>
              <div className="text-right">
                <div className="text-sm text-gray-600">Toplam Tutar</div>
                <div className="text-2xl font-bold text-primary-600">{formatCurrency(currentAmount)}</div>
              </div>
            </div>

            {currentSummary.length === 0 ? (
              <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg">
                <p className="text-lg mb-2">✅ Bekleyen sipariş yok</p>
                <p className="text-sm">Yeni siparişler sync edildiğinde burada görünecek.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {currentSummary.map((customer) => {
                  const isExpanded = expandedCustomers.has(customer.customerCode);
                  return (
                    <div key={customer.customerCode} className="border rounded-lg overflow-hidden">
                      {/* Customer Header */}
                      <div className={`p-4 border-b ${activeTab === 'customers' ? 'bg-gradient-to-r from-blue-50 to-blue-100' : 'bg-gradient-to-r from-orange-50 to-orange-100'}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <h3 className="text-lg font-bold text-gray-900 mb-1">{customer.customerName}</h3>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                              <span>📋 Kod: {customer.customerCode}</span>
                              <span>
                                📧 Email:{' '}
                                {customer.customerEmail ? (
                                  <span className="font-medium text-blue-600">{customer.customerEmail}</span>
                                ) : (
                                  <span className="text-red-600">Kayıtlı değil</span>
                                )}
                              </span>
                              {customer.sectorCode && (
                                <span className="text-xs bg-gray-200 px-2 py-0.5 rounded">
                                  {customer.sectorCode}
                                </span>
                              )}
                              <span>📦 {customer.ordersCount} sipariş</span>
                              <span className="font-semibold text-primary-600">
                                💰 {formatCurrency(customer.totalAmount)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {customer.emailSent ? (
                              <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                ✅ Gönderildi
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                ⏳ Bekliyor
                              </span>
                            )}
                            <Button
                              onClick={() => toggleCustomerExpanded(customer.customerCode)}
                              className="bg-gray-200 text-gray-700 hover:bg-gray-300 text-sm py-1 px-3"
                            >
                              {isExpanded ? '▲ Gizle' : '▼ Detay'}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Email Override & Send */}
                      <div className="p-4 bg-gray-50 border-b">
                        <div className="flex flex-col sm:flex-row gap-3">
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              📧 Email Override (opsiyonel - tek seferlik)
                            </label>
                            <input
                              type="email"
                              placeholder={customer.customerEmail || 'email@example.com'}
                              value={emailOverrides[customer.customerCode] || ''}
                              onChange={(e) =>
                                setEmailOverrides((prev) => ({
                                  ...prev,
                                  [customer.customerCode]: e.target.value,
                                }))
                              }
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              {emailOverrides[customer.customerCode]
                                ? `Mail ${emailOverrides[customer.customerCode]} adresine gönderilecek`
                                : `Varsayılan: ${customer.customerEmail || 'Email bulunamadı'}`}
                            </p>
                          </div>
                          <div className="flex items-end">
                            <Button
                              onClick={() => handleSendToCustomer(customer.customerCode)}
                              isLoading={sendingToCustomer === customer.customerCode}
                              disabled={sendingToCustomer === customer.customerCode}
                              className="bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap px-6"
                            >
                              📧 Mail Gönder
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Order Details (Expandable) */}
                      {isExpanded && (
                        <div className="p-4 bg-white">
                          <h4 className="font-bold text-gray-900 mb-3">📋 Siparişler ({customer.orders.length})</h4>
                          <div className="space-y-4">
                            {customer.orders.map((order) => (
                              <div key={order.id} className="border rounded-lg p-4 bg-gray-50">
                                <div className="flex justify-between items-start mb-3">
                                  <div>
                                    <h5 className="font-bold text-primary-600">
                                      Sipariş No: {order.mikroOrderNumber}
                                    </h5>
                                    <div className="text-sm text-gray-600 mt-1">
                                      <span>📅 Tarih: {formatDate(order.orderDate)}</span>
                                      <span className="ml-4">🚚 Teslimat: {formatDate(order.deliveryDate)}</span>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-sm text-gray-600">{order.itemCount} kalem</div>
                                    <div className="text-lg font-bold text-primary-600">
                                      {formatCurrency(order.grandTotal)}
                                    </div>
                                  </div>
                                </div>

                                {/* Order Items */}
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead className="bg-white">
                                      <tr>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">Ürün</th>
                                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-600">
                                          Miktar
                                        </th>
                                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-600">
                                          Birim Fiyat
                                        </th>
                                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-600">
                                          Tutar
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                      {order.items.map((item, idx) => (
                                        <tr key={idx}>
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
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
