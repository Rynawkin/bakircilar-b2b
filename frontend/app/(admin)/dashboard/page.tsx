'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { DashboardStats } from '@/types';
import adminApi from '@/lib/api/admin';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { AdminNavigation } from '@/components/layout/AdminNavigation';
import { EkstreModal } from '@/components/admin/EkstreModal';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user, loadUserFromStorage, logout } = useAuthStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isImageSyncing, setIsImageSyncing] = useState(false);
  const [isCariSyncing, setIsCariSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    categoriesCount?: number;
    productsCount?: number;
    imagesDownloaded?: number;
    imagesSkipped?: number;
    imagesFailed?: number;
    details?: {
      totalImages?: number;
      totalPricesToCalculate?: number;
      pricesCalculated?: number;
      totalStocksToCalculate?: number;
      stocksCalculated?: number;
    };
  } | null>(null);
  const [imageSyncProgress, setImageSyncProgress] = useState<{
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
  const [showEkstreModal, setShowEkstreModal] = useState(false);

  // Refs to store interval and timeout IDs for cleanup
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup function to clear polling
  const cleanupPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    loadUserFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      cleanupPolling();
    };
  }, []);

  useEffect(() => {
    // user null ise henüz yükleniyor, bekle
    if (user === null) {
      return;
    }

    // user yüklendikten sonra role kontrolü yap
    if (user.role !== 'ADMIN' && user.role !== 'MANAGER' && user.role !== 'HEAD_ADMIN' && user.role !== 'SALES_REP') {
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
    // Clean up any existing polling first
    cleanupPolling();

    pollIntervalRef.current = setInterval(async () => {
      try {
        const status = await adminApi.getSyncStatus(syncLogId);

        // Update progress
        setSyncProgress({
          categoriesCount: status.categoriesCount,
          productsCount: status.productsCount,
          imagesDownloaded: status.imagesDownloaded,
          imagesSkipped: status.imagesSkipped,
          imagesFailed: status.imagesFailed,
          details: status.details,
        });

        // Check if completed
        if (status.isCompleted) {
          cleanupPolling();
          setIsSyncing(false);
          // DON'T clear syncProgress - keep final stats visible!
          // setSyncProgress(null);

          // Update with final stats
          setSyncProgress({
            categoriesCount: status.categoriesCount,
            productsCount: status.productsCount,
            imagesDownloaded: status.imagesDownloaded,
            imagesSkipped: status.imagesSkipped,
            imagesFailed: status.imagesFailed,
            details: status.details,
          });

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
              duration: 10000, // 10 saniye göster
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
        if (process.env.NODE_ENV === 'development') {
          console.error('Sync status polling error:', error);
        }
        // DON'T clear interval on first error - backend might be busy
        // We'll let the timeout handle it
      }
    }, 3000); // Poll every 3 seconds (reduce server load)

    // Cleanup after 30 minutes (safety timeout - resimler uzun sürebilir)
    pollTimeoutRef.current = setTimeout(() => {
      cleanupPolling();
      if (isSyncing) {
        setIsSyncing(false);
        // Keep last known progress visible
        toast.error('⏰ Senkronizasyon çok uzun sürdü. Backend loglarını kontrol edin.');
      }
    }, 1800000); // 30 dakika
  };

  const handleCariSync = async () => {
    const confirmed = await new Promise((resolve) => {
      toast((t) => (
        <div className="flex flex-col gap-3">
          <p className="font-medium">Cari senkronizasyonu başlatılsın mı?</p>
          <p className="text-sm text-gray-600">Mikro ERP'deki cari bilgileri müşteri kayıtlarına aktarılacak.</p>
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

    setIsCariSyncing(true);

    try {
      await adminApi.triggerCariSync();
      toast.success('Cari senkronizasyonu başlatıldı! 🚀\n\nMüşteri bilgileri güncelleniyor...', { duration: 5000 });

      // Wait a bit then reload stats
      setTimeout(() => {
        setIsCariSyncing(false);
        toast.success('Cari senkronizasyonu tamamlandı! ✅');
        fetchStats();
      }, 3000);
    } catch (error: any) {
      setIsCariSyncing(false);
      toast.error(error.response?.data?.error || 'Cari senkronizasyonu başlatılamadı');
    }
  };

  const handleSync = async () => {
    const confirmed = await new Promise((resolve) => {
      toast((t) => (
        <div className="flex flex-col gap-3">
          <p className="font-medium">Mikro ERP ile senkronizasyon başlatılsın mı?</p>
          <p className="text-sm text-gray-600">Bu işlem birkaç dakika sürebilir. (Resimler hariç)</p>
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

  const pollImageSyncStatus = async (syncLogId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const status = await adminApi.getSyncStatus(syncLogId);

        // Update progress
        setImageSyncProgress({
          imagesDownloaded: status.imagesDownloaded,
          imagesSkipped: status.imagesSkipped,
          imagesFailed: status.imagesFailed,
        });

        // Check if completed
        if (status.isCompleted) {
          clearInterval(pollInterval);
          setIsImageSyncing(false);

          // Update with final stats
          setImageSyncProgress({
            imagesDownloaded: status.imagesDownloaded,
            imagesSkipped: status.imagesSkipped,
            imagesFailed: status.imagesFailed,
          });

          if (status.status === 'SUCCESS') {
            // Store warnings if any
            if (status.warnings && status.warnings.length > 0) {
              setSyncWarnings(status.warnings);
            }

            // Build success message
            let successMessage = `Resim senkronizasyonu tamamlandı! 🎉\n\n✅ İndirilen: ${status.imagesDownloaded || 0}\n⏭️ Atlanan: ${status.imagesSkipped || 0}\n❌ Hatalı: ${status.imagesFailed || 0}`;

            // Show warning if there are issues
            if (status.warnings && status.warnings.length > 0) {
              successMessage += `\n\n⚠️ ${status.warnings.length} uyarı var (detaylar aşağıda)`;
            }

            toast.success(successMessage, {
              duration: 10000, // 10 saniye göster
            });
          } else if (status.status === 'FAILED') {
            toast.error(`Resim senkronizasyonu başarısız: ${status.errorMessage || 'Bilinmeyen hata'}`);

            // Store warnings even on failure
            if (status.warnings && status.warnings.length > 0) {
              setSyncWarnings(status.warnings);
            }
          }
        }
      } catch (error) {
        console.error('Image sync status polling error:', error);
      }
    }, 3000); // Poll every 3 seconds

    // Cleanup after 30 minutes (safety timeout)
    setTimeout(() => {
      clearInterval(pollInterval);
      if (isImageSyncing) {
        setIsImageSyncing(false);
        toast.error('⏰ Resim senkronizasyonu çok uzun sürdü. Backend loglarını kontrol edin.');
      }
    }, 1800000); // 30 dakika
  };

  const handleImageSync = async () => {
    const confirmed = await new Promise((resolve) => {
      toast((t) => (
        <div className="flex flex-col gap-3">
          <p className="font-medium">Resim senkronizasyonu başlatılsın mı?</p>
          <p className="text-sm text-gray-600">Sadece resmi olmayan ürünler için resimler indirilecek.</p>
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
              className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700"
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

    setIsImageSyncing(true);
    setImageSyncProgress(null);

    try {
      const result = await adminApi.triggerImageSync();
      toast.success('Resim senkronizasyonu başlatıldı! 📸', { duration: 3000 });

      // Start polling for status
      pollImageSyncStatus(result.syncLogId);
    } catch (error: any) {
      setIsImageSyncing(false);
      toast.error(error.response?.data?.error || 'Resim senkronizasyonu başlatılamadı');
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
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50">
        {/* Navigation */}
        <AdminNavigation />

      {/* Main Content */}
      <div className="container-custom py-8">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {hasPermission('dashboard:orders') && (
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
            )}

            {hasPermission('dashboard:orders') && (
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
            )}

            {hasPermission('dashboard:customers') && (
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
            )}

            {hasPermission('dashboard:excess-stock') && (
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
            )}
          </div>
        )}

        {/* Hızlı Arama Widgetları */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
          {/* Stok Arama Widget */}
          {hasPermission('dashboard:stok-ara') && (
            <Card className="shadow-lg hover:shadow-xl transition-shadow">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-500 text-white rounded-lg w-12 h-12 flex items-center justify-center text-2xl">
                    📦
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">Stok Arama</h3>
                    <p className="text-sm text-gray-600">Mikro F10 entegrasyonu ile detaylı stok bilgileri</p>
                  </div>
                </div>
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                  onClick={() => router.push('/search/stocks')}
                >
                  Stok Ara →
                </Button>
              </div>
            </Card>
          )}

          {/* Cari Arama Widget */}
          {hasPermission('dashboard:cari-ara') && (
            <Card className="shadow-lg hover:shadow-xl transition-shadow">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="bg-purple-500 text-white rounded-lg w-12 h-12 flex items-center justify-center text-2xl">
                    👥
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">Cari Arama</h3>
                    <p className="text-sm text-gray-600">Mikro F10 entegrasyonu ile detaylı cari bilgileri</p>
                  </div>
                </div>
                <Button
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                  onClick={() => router.push('/search/customers')}
                >
                  Cari Ara →
                </Button>
              </div>
            </Card>
          )}

          {/* Cari Ekstre Widget */}
          {hasPermission('dashboard:ekstre') && (
            <Card className="shadow-lg hover:shadow-xl transition-shadow">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="bg-green-500 text-white rounded-lg w-12 h-12 flex items-center justify-center text-2xl">
                    📄
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">Ekstre Al</h3>
                    <p className="text-sm text-gray-600">Cari hareket föyü Excel/PDF export</p>
                  </div>
                </div>
                <Button
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold"
                  onClick={() => setShowEkstreModal(true)}
                >
                  Ekstre Al →
                </Button>
              </div>
            </Card>
          )}

          {/* Diversey Stok Widget */}
          {hasPermission('dashboard:diversey-stok') && (
            <Card className="shadow-lg hover:shadow-xl transition-shadow">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="bg-orange-500 text-white rounded-lg w-12 h-12 flex items-center justify-center text-2xl">
                    🏢
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">Diversey Stok</h3>
                    <p className="text-sm text-gray-600">Diversey markası ürün stokları</p>
                  </div>
                </div>
                <Button
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold"
                  onClick={() => router.push('/diversey/stok')}
                >
                  Diversey Stok →
                </Button>
              </div>
            </Card>
          )}

          {/* Rol İzinleri Widget - Sadece HEAD_ADMIN için */}
          {user?.role === 'HEAD_ADMIN' && (
            <Card className="shadow-lg hover:shadow-xl transition-shadow">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="bg-purple-500 text-white rounded-lg w-12 h-12 flex items-center justify-center text-2xl">
                    🔐
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">Rol İzinleri</h3>
                    <p className="text-sm text-gray-600">Kullanıcı rol izinlerini yönet</p>
                  </div>
                </div>
                <Button
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                  onClick={() => router.push('/role-permissions')}
                >
                  İzinleri Yönet →
                </Button>
              </div>
            </Card>
          )}
        </div>

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
              💡 Ürün, stok ve fiyat bilgilerini Mikro ERP'den güncelleyin. (Resimler hariç)
            </p>
            {stats?.lastSyncAt && (
              <div className="bg-gray-100 border border-gray-200 px-3 py-2 rounded mb-4 text-sm">
                <span className="text-gray-600">Son senkronizasyon:</span>{' '}
                <span className="font-semibold text-gray-900">{formatDate(stats.lastSyncAt)}</span>
              </div>
            )}
            {syncProgress && (
              <div className={`${isSyncing ? 'bg-blue-50 border-blue-200' : 'bg-green-50 border-green-200'} border px-3 py-2 rounded mb-3 text-sm`}>
                <div className="flex items-center gap-2 mb-2">
                  {isSyncing && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>}
                  {!isSyncing && <span className="text-green-600 text-lg">✅</span>}
                  <span className={`font-semibold ${isSyncing ? 'text-blue-900' : 'text-green-900'}`}>
                    {isSyncing ? 'Senkronizasyon devam ediyor...' : 'Son senkronizasyon:'}
                  </span>
                </div>
                {syncProgress.categoriesCount !== undefined && (
                  <div className="text-xs text-gray-700">
                    📁 Kategoriler: <strong>{syncProgress.categoriesCount}</strong>
                  </div>
                )}
                {syncProgress.productsCount !== undefined && (
                  <div className="text-xs text-gray-700">
                    📦 Ürünler: <strong>{syncProgress.productsCount}</strong>
                  </div>
                )}
                {syncProgress.details?.stocksCalculated !== undefined && (
                  <div className="text-xs text-gray-700">
                    📊 Fazla stok: <strong>{syncProgress.details.stocksCalculated}</strong>
                    {isSyncing && syncProgress.details.totalStocksToCalculate && ` / ${syncProgress.details.totalStocksToCalculate}`}
                  </div>
                )}
                {syncProgress.details?.pricesCalculated !== undefined && (
                  <div className="text-xs text-gray-700">
                    💰 Fiyat hesaplama: <strong>{syncProgress.details.pricesCalculated}</strong>
                    {isSyncing && syncProgress.details.totalPricesToCalculate && ` / ${syncProgress.details.totalPricesToCalculate}`}
                  </div>
                )}
                {(syncProgress.imagesDownloaded !== undefined ||
                  syncProgress.imagesSkipped !== undefined ||
                  syncProgress.imagesFailed !== undefined) && (
                  <div className="text-xs text-gray-700 mt-1 pt-1 border-t border-gray-300">
                    <div className="font-semibold mb-1">📸 Resimler:</div>
                    <div className="pl-4 space-y-0.5">
                      <div>✅ İndirilen: <strong className="text-green-700">{syncProgress.imagesDownloaded || 0}</strong></div>
                      <div>⏭️ Atlanan: <strong className="text-yellow-700">{syncProgress.imagesSkipped || 0}</strong></div>
                      <div>❌ Hatalı: <strong className="text-red-700">{syncProgress.imagesFailed || 0}</strong></div>
                      {syncProgress.details?.totalImages && (
                        <div className="pt-1 border-t border-gray-200 mt-1">
                          📊 Toplam: <strong>{syncProgress.details.totalImages}</strong>
                        </div>
                      )}
                    </div>
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
              <div className="bg-gradient-to-br from-orange-600 to-orange-700 text-white rounded-lg w-12 h-12 flex items-center justify-center text-2xl">
                👥
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900">Cari Senkronizasyonu</h3>
                <p className="text-xs text-gray-600">Müşteri bilgilerini güncelle</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4 bg-orange-50 border-l-4 border-orange-500 p-3 rounded">
              💡 Mikro ERP'deki cari bilgilerini müşteri kayıtlarına aktarın.
            </p>
            <Button
              onClick={handleCariSync}
              isLoading={isCariSyncing}
              disabled={isCariSyncing}
              className="w-full bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white font-bold py-3 shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isCariSyncing ? '👥 Cari Sync Ediliyor...' : '👥 Cari Sync Et'}
            </Button>
          </Card>

          <Card className="shadow-lg bg-gradient-to-br from-white to-gray-50">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-gradient-to-br from-purple-600 to-purple-700 text-white rounded-lg w-12 h-12 flex items-center justify-center text-2xl">
                📸
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900">Resim Senkronizasyonu</h3>
                <p className="text-xs text-gray-600">Ürün resimlerini indir</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4 bg-purple-50 border-l-4 border-purple-500 p-3 rounded">
              💡 Mikro ERP'den resmi olmayan ürünler için resimleri indirin.
            </p>
            {imageSyncProgress && (
              <div className={`${isImageSyncing ? 'bg-purple-50 border-purple-200' : 'bg-green-50 border-green-200'} border px-3 py-2 rounded mb-3 text-sm`}>
                <div className="flex items-center gap-2 mb-2">
                  {isImageSyncing && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>}
                  {!isImageSyncing && <span className="text-green-600 text-lg">✅</span>}
                  <span className={`font-semibold ${isImageSyncing ? 'text-purple-900' : 'text-green-900'}`}>
                    {isImageSyncing ? 'İndiriliyor...' : 'Son senkronizasyon:'}
                  </span>
                </div>
                <div className="space-y-0.5 text-xs">
                  <div>✅ İndirilen: <strong className="text-green-700">{imageSyncProgress.imagesDownloaded || 0}</strong></div>
                  <div>⏭️ Atlanan: <strong className="text-yellow-700">{imageSyncProgress.imagesSkipped || 0}</strong></div>
                  <div>❌ Hatalı: <strong className="text-red-700">{imageSyncProgress.imagesFailed || 0}</strong></div>
                </div>
              </div>
            )}
            <Button
              onClick={handleImageSync}
              isLoading={isImageSyncing}
              disabled={isImageSyncing}
              className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-bold py-3 shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isImageSyncing ? '📸 İndiriliyor...' : '📸 Resim Sync Et'}
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

        {/* Ekstre Modal */}
        <EkstreModal
          isOpen={showEkstreModal}
          onClose={() => setShowEkstreModal(false)}
        />
      </div>
    </div>
    </ErrorBoundary>
  );
}
