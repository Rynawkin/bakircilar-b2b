'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { DashboardStats } from '@/types';
import adminApi from '@/lib/api/admin';
import { useAuthStore } from '@/lib/store/authStore';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { LogoLink } from '@/components/ui/Logo';

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user, loadUserFromStorage, logout } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    categoriesCount?: number;
    productsCount?: number;
    imagesDownloaded?: number;
    imagesSkipped?: number;
    imagesFailed?: number;
  } | null>(null);
  const [syncWarnings, setSyncWarnings] = useState<Array<{
    type: string;
    productCode: string;
    productName: string;
    message: string;
    size?: number;
  }> | null>(null);

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (user?.role !== 'ADMIN') {
      router.push('/login');
      return;
    }
    fetchStats();
  }, [user, router]);

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      const data = await adminApi.getDashboardStats();
      setStats(data);
    } catch (error) {
      console.error('Stats yüklenemedi:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const pollSyncStatus = async (syncLogId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const status = await adminApi.getSyncStatus(syncLogId);

        // Update progress
        setSyncProgress({
          categoriesCount: status.categoriesCount,
          productsCount: status.productsCount,
          imagesDownloaded: status.imagesDownloaded,
          imagesSkipped: status.imagesSkipped,
          imagesFailed: status.imagesFailed,
        });

        // Check if completed
        if (status.isCompleted) {
          clearInterval(pollInterval);
          setIsSyncing(false);
          setSyncProgress(null);

          if (status.status === 'SUCCESS') {
            // Store warnings if any
            if (status.warnings && status.warnings.length > 0) {
              setSyncWarnings(status.warnings);
            }

            // Build success message
            let successMessage = `Senkronizasyon tamamlandı! 🎉\n\nKategoriler: ${status.categoriesCount || 0}\nÜrünler: ${status.productsCount || 0}`;

            // Add image stats if available
            if (status.imagesDownloaded !== undefined || status.imagesSkipped !== undefined || status.imagesFailed !== undefined) {
              successMessage += `\n\nResimler:\n✅ İndirilen: ${status.imagesDownloaded || 0}\n⏭️ Atlanan: ${status.imagesSkipped || 0}\n❌ Hatalı: ${status.imagesFailed || 0}`;
            }

            // Show warning if there are issues
            if (status.warnings && status.warnings.length > 0) {
              successMessage += `\n\n⚠️ ${status.warnings.length} uyarı var (detaylar aşağıda)`;
            }

            toast.success(successMessage, {
              duration: 7000,
            });
            fetchStats();
          } else if (status.status === 'FAILED') {
            toast.error(`Senkronizasyon başarısız: ${status.errorMessage || 'Bilinmeyen hata'}`);

            // Store warnings even on failure
            if (status.warnings && status.warnings.length > 0) {
              setSyncWarnings(status.warnings);
            }
          }
        }
      } catch (error) {
        console.error('Sync status polling error:', error);
        clearInterval(pollInterval);
        setIsSyncing(false);
        setSyncProgress(null);
        toast.error('Senkronizasyon durumu alınamadı');
      }
    }, 2000); // Poll every 2 seconds

    // Cleanup after 10 minutes (safety timeout)
    setTimeout(() => {
      clearInterval(pollInterval);
      if (isSyncing) {
        setIsSyncing(false);
        setSyncProgress(null);
        toast.error('Senkronizasyon zaman aşımına uğradı');
      }
    }, 600000);
  };

  const handleSync = async () => {
    const confirmed = await new Promise((resolve) => {
      toast((t) => (
        <div className="flex flex-col gap-3">
          <p className="font-medium">Mikro ERP ile senkronizasyon başlatılsın mı?</p>
          <p className="text-sm text-gray-600">Bu işlem birkaç dakika sürebilir.</p>
          <div className="flex gap-2 justify-end">
            <button
              className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
              onClick={() => {
                toast.dismiss(t.id);
                resolve(false);
              }}
            >
              İptal
            </button>
            <button
              className="px-3 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
              onClick={() => {
                toast.dismiss(t.id);
                resolve(true);
              }}
            >
              Başlat
            </button>
          </div>
        </div>
      ), {
        duration: Infinity,
      });
    });

    if (!confirmed) return;

    setIsSyncing(true);
    setSyncProgress(null);
    setSyncWarnings(null); // Clear old warnings

    try {
      const result = await adminApi.triggerSync();
      toast.success('Senkronizasyon başlatıldı! 🚀', { duration: 3000 });

      // Start polling for status
      pollSyncStatus(result.syncLogId);
    } catch (error: any) {
      setIsSyncing(false);
      toast.error(error.response?.data?.error || 'Senkronizasyon başlatılamadı');
    }
  };

  if (!user || isLoading) {
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
              <LogoLink href="/dashboard" variant="light" />
              <div>
                <h1 className="text-xl font-bold text-white">🎯 Yönetim Paneli</h1>
                <p className="text-sm text-primary-100">Hoş geldiniz, {user.name}</p>
              </div>
            </div>
            <div className="flex gap-3 flex-wrap">
              <Button variant="secondary" onClick={() => router.push('/settings')} className="bg-white text-primary-700 hover:bg-primary-50">
                ⚙️ Ayarlar
              </Button>
              <Button variant="secondary" onClick={() => router.push('/customers')} className="bg-white text-primary-700 hover:bg-primary-50">
                👥 Müşteriler
              </Button>
              <Button variant="secondary" onClick={() => router.push('/orders')} className="bg-white text-primary-700 hover:bg-primary-50">
                📦 Siparişler
              </Button>
              <Button variant="secondary" onClick={() => router.push('/categories')} className="bg-white text-primary-700 hover:bg-primary-50">
                📁 Kategoriler
              </Button>
              <Button variant="secondary" onClick={() => router.push('/product-overrides')} className="bg-white text-primary-700 hover:bg-primary-50">
                🏷️ Ürün Override
              </Button>
              <Button variant="ghost" onClick={() => { logout(); router.push('/login'); }} className="text-white hover:bg-primary-800">
                Çıkış
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container-custom py-8">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200 shadow-lg hover:shadow-xl transition-shadow">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-yellow-800">⏳ Bekleyen Siparişler</p>
                  <div className="bg-yellow-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg">
                    📋
                  </div>
                </div>
                <p className="text-4xl font-bold text-yellow-600">{stats.orders.pendingCount}</p>
                <Button
                  size="sm"
                  className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-semibold"
                  onClick={() => router.push('/orders')}
                >
                  Siparişleri Gör →
                </Button>
              </div>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200 shadow-lg hover:shadow-xl transition-shadow">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-green-800">✅ Bugün Onaylanan</p>
                  <div className="bg-green-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg">
                    📦
                  </div>
                </div>
                <p className="text-4xl font-bold text-green-600">{stats.orders.approvedToday}</p>
                <p className="text-sm font-semibold text-green-700 bg-green-200 px-2 py-1 rounded">
                  💰 {formatCurrency(stats.orders.totalAmount)}
                </p>
              </div>
            </Card>

            <Card className="bg-gradient-to-br from-primary-50 to-primary-100 border-primary-200 shadow-lg hover:shadow-xl transition-shadow">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-primary-800">👥 Aktif Müşteriler</p>
                  <div className="bg-primary-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg">
                    🎯
                  </div>
                </div>
                <p className="text-4xl font-bold text-primary-600">{stats.customerCount}</p>
                <Button
                  size="sm"
                  className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold"
                  onClick={() => router.push('/customers')}
                >
                  Müşteri Ekle →
                </Button>
              </div>
            </Card>

            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 shadow-lg hover:shadow-xl transition-shadow">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-blue-800">📊 Fazla Stoklu Ürün</p>
                  <div className="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg">
                    📦
                  </div>
                </div>
                <p className="text-4xl font-bold text-blue-600">{stats.excessProductCount}</p>
                <p className="text-xs text-blue-700 bg-blue-200 px-2 py-1 rounded">
                  {stats.lastSyncAt ? `🔄 Son sync: ${formatDate(stats.lastSyncAt)}` : '⚠️ Henüz sync yapılmadı'}
                </p>
              </div>
            </Card>
          </div>
        )}

        {/* Sync Warnings */}
        {syncWarnings && syncWarnings.length > 0 && (
          <Card className="mb-6 shadow-lg border-yellow-300 bg-gradient-to-br from-yellow-50 to-orange-50">
            <div className="flex items-start gap-3 mb-4">
              <div className="bg-yellow-500 text-white rounded-lg w-12 h-12 flex items-center justify-center text-2xl flex-shrink-0">
                ⚠️
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-lg text-yellow-900">Senkronizasyon Uyarıları</h3>
                    <p className="text-sm text-yellow-700">
                      {syncWarnings.length} uyarı bulundu
                    </p>
                  </div>
                  <button
                    onClick={() => setSyncWarnings(null)}
                    className="text-yellow-700 hover:text-yellow-900 font-medium text-sm underline"
                  >
                    Kapat
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {syncWarnings.map((warning, index) => (
                <div
                  key={index}
                  className="bg-white border border-yellow-200 rounded-lg p-3 text-sm"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-yellow-600 flex-shrink-0 mt-0.5">
                      {warning.type === 'IMAGE_TOO_LARGE' ? '📏' : '❌'}
                    </span>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 mb-1">
                        {warning.productName}
                        <span className="text-gray-500 font-normal ml-2">({warning.productCode})</span>
                      </div>
                      <div className="text-gray-700">{warning.message}</div>
                      {warning.size && (
                        <div className="text-xs text-gray-500 mt-1">
                          Boyut: {(warning.size / 1024 / 1024).toFixed(2)} MB
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-yellow-200">
              <p className="text-xs text-yellow-800">
                💡 <strong>Not:</strong> Bu uyarılar bilgilendirme amaçlıdır. Senkronizasyon başarıyla tamamlanmıştır.
                Resim boyutu çok büyük olan ürünler için resimleri manuel olarak küçültüp tekrar yükleyebilirsiniz.
              </p>
            </div>
          </Card>
        )}

        {/* Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="shadow-lg bg-gradient-to-br from-white to-gray-50">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-gradient-to-br from-primary-600 to-primary-700 text-white rounded-lg w-12 h-12 flex items-center justify-center text-2xl">
                🔄
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900">Senkronizasyon</h3>
                <p className="text-xs text-gray-600">Mikro ERP ile senkronize et</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4 bg-blue-50 border-l-4 border-blue-500 p-3 rounded">
              💡 Ürün, stok ve fiyat bilgilerini Mikro ERP'den güncelleyin.
            </p>
            {stats?.lastSyncAt && (
              <div className="bg-gray-100 border border-gray-200 px-3 py-2 rounded mb-4 text-sm">
                <span className="text-gray-600">Son senkronizasyon:</span>{' '}
                <span className="font-semibold text-gray-900">{formatDate(stats.lastSyncAt)}</span>
              </div>
            )}
            {syncProgress && (
              <div className="bg-blue-50 border border-blue-200 px-3 py-2 rounded mb-3 text-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                  <span className="font-semibold text-blue-900">Senkronizasyon devam ediyor...</span>
                </div>
                {syncProgress.categoriesCount !== undefined && (
                  <div className="text-xs text-gray-700">
                    ✅ Kategoriler: {syncProgress.categoriesCount}
                  </div>
                )}
                {syncProgress.productsCount !== undefined && (
                  <div className="text-xs text-gray-700">
                    ✅ Ürünler: {syncProgress.productsCount}
                  </div>
                )}
                {(syncProgress.imagesDownloaded !== undefined ||
                  syncProgress.imagesSkipped !== undefined ||
                  syncProgress.imagesFailed !== undefined) && (
                  <div className="text-xs text-gray-700 mt-1 pt-1 border-t border-blue-200">
                    📸 Resimler: {syncProgress.imagesDownloaded || 0} indirildi
                    {(syncProgress.imagesSkipped || 0) + (syncProgress.imagesFailed || 0) > 0 &&
                      `, ${(syncProgress.imagesSkipped || 0) + (syncProgress.imagesFailed || 0)} atlandı`
                    }
                  </div>
                )}
              </div>
            )}
            <Button
              onClick={handleSync}
              isLoading={isSyncing}
              disabled={isSyncing}
              className="w-full bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-bold py-3 shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSyncing ? '🔄 Senkronize Ediliyor...' : '🔄 Şimdi Senkronize Et'}
            </Button>
          </Card>

          <Card className="shadow-lg bg-gradient-to-br from-white to-gray-50">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-gradient-to-br from-green-600 to-green-700 text-white rounded-lg w-12 h-12 flex items-center justify-center text-2xl">
                ⚡
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900">Hızlı İşlemler</h3>
                <p className="text-xs text-gray-600">Sık kullanılan işlemler</p>
              </div>
            </div>
            <div className="space-y-2">
              <Button
                variant="secondary"
                className="w-full bg-primary-50 text-primary-700 hover:bg-primary-100 border border-primary-200 font-semibold"
                onClick={() => router.push('/customers')}
              >
                👥 Yeni Müşteri Ekle
              </Button>
              <Button
                variant="secondary"
                className="w-full bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border border-yellow-200 font-semibold"
                onClick={() => router.push('/orders')}
              >
                📋 Bekleyen Siparişler ({stats?.orders.pendingCount || 0})
              </Button>
              <Button
                variant="secondary"
                className="w-full bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 font-semibold"
                onClick={() => router.push('/categories')}
              >
                💰 Fiyatlandırma Ayarları
              </Button>
              <Button
                variant="secondary"
                className="w-full bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 font-semibold"
                onClick={() => router.push('/settings')}
              >
                ⚙️ Sistem Ayarları
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
