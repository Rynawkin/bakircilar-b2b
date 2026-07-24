'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { DashboardStats } from '@/types';
import adminApi, { OrderProductChangeRequest } from '@/lib/api/admin';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';

// Re-export tipler (Classic/New JSX'lerin ihtiyaci icin)
export type { OrderProductChangeRequest } from '@/lib/api/admin';
export type { DashboardStats } from '@/types';

export type DashboardFilterPeriod = 'daily' | 'weekly' | 'monthly' | 'custom';

export const toDateInputValue = (value: Date) => {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });

const buildFallbackDashboardStats = (
  period: DashboardFilterPeriod,
  startDate: string,
  endDate: string
): DashboardStats => {
  const now = new Date();
  const safeStart = startDate ? new Date(startDate) : now;
  const safeEnd = endDate ? new Date(endDate) : now;
  return {
    period,
    periodRange: {
      startAt: Number.isNaN(safeStart.getTime()) ? now.toISOString() : safeStart.toISOString(),
      endAt: Number.isNaN(safeEnd.getTime()) ? now.toISOString() : safeEnd.toISOString(),
    },
    sectorScope: { mode: 'all', codes: [] },
    summary: {
      sales: { count: 0, amount: 0 },
      orders: { count: 0, amount: 0 },
      quotes: { count: 0, amount: 0 },
    },
    orders: {
      pendingCount: 0,
      approvedToday: 0,
      totalAmount: 0,
    },
    customerCount: 0,
    excessProductCount: 0,
  };
};

/**
 * Dashboard ekraninin TUM mantigi (state/ref/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 */
export function useDashboard() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [selectedPeriod, setSelectedPeriod] = useState<DashboardFilterPeriod>('daily');
  const [customStartDate, setCustomStartDate] = useState<string>(toDateInputValue(new Date()));
  const [customEndDate, setCustomEndDate] = useState<string>(toDateInputValue(new Date()));
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
  const [orderProductChangeRequests, setOrderProductChangeRequests] = useState<OrderProductChangeRequest[]>([]);
  const [orderProductChangePendingCount, setOrderProductChangePendingCount] = useState(0);
  const [orderProductChangeLoading, setOrderProductChangeLoading] = useState(false);
  const [orderProductChangeActingId, setOrderProductChangeActingId] = useState<string>('');
  const [orderProductChangeRefreshError, setOrderProductChangeRefreshError] = useState('');
  const [orderProductChangeLiveValidationAvailable, setOrderProductChangeLiveValidationAvailable] = useState(true);

  // Refs to store interval and timeout IDs for cleanup
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const statsRequestSeqRef = useRef(0);
  const orderProductChangeRequestSeqRef = useRef(0);
  const orderProductChangeFetchInFlightRef = useRef(false);
  const orderProductChangeResolvedIdsRef = useRef(new Set<string>());

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

    if (selectedPeriod === 'custom' && (!customStartDate || !customEndDate)) {
      return;
    }

    fetchStats();
  }, [user?.id, user?.role, router, selectedPeriod, customStartDate, customEndDate]);

  const fetchStats = async () => {
    const requestSeq = statsRequestSeqRef.current + 1;
    statsRequestSeqRef.current = requestSeq;
    setIsLoading((prev) => (stats ? false : prev || true));
    try {
      const data = await withTimeout(
        adminApi.getDashboardStats(
          selectedPeriod === 'custom'
            ? {
                period: 'custom',
                startDate: customStartDate,
                endDate: customEndDate,
              }
            : { period: selectedPeriod }
        ),
        8000,
        'dashboard stats'
      );
      if (statsRequestSeqRef.current === requestSeq) {
        setStats(data);
      }
    } catch (error) {
      if (statsRequestSeqRef.current === requestSeq) {
        setStats((previous) => previous || buildFallbackDashboardStats(selectedPeriod, customStartDate, customEndDate));
      }
      console.error('Stats yüklenemedi:', error);
    } finally {
      if (statsRequestSeqRef.current === requestSeq) {
        setIsLoading(false);
      }
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

  const fetchOrderProductChangeRequests = useCallback(async (silent = false) => {
    if (orderProductChangeFetchInFlightRef.current) return;
    orderProductChangeFetchInFlightRef.current = true;
    const requestSeq = orderProductChangeRequestSeqRef.current + 1;
    orderProductChangeRequestSeqRef.current = requestSeq;
    if (!silent) setOrderProductChangeLoading(true);
    try {
      const result = await withTimeout(
        adminApi.getOrderProductChangeRequests({ status: 'PENDING', limit: 12 }),
        8000,
        'order product change requests'
      );
      if (orderProductChangeRequestSeqRef.current !== requestSeq) return;
      const receivedRequests = result.data?.requests || [];
      const visibleRequests = receivedRequests.filter(
        (request) => !orderProductChangeResolvedIdsRef.current.has(request.id)
      );
      const locallyResolvedInResponse = receivedRequests.length - visibleRequests.length;
      setOrderProductChangeRequests(visibleRequests);
      setOrderProductChangePendingCount(
        Math.max(0, Number(result.data?.pendingCount || 0) - locallyResolvedInResponse)
      );
      setOrderProductChangeLiveValidationAvailable(result.data?.liveValidationAvailable !== false);
      setOrderProductChangeRefreshError('');
    } catch (error) {
      if (orderProductChangeRequestSeqRef.current !== requestSeq) return;
      console.error('Urun degisiklik onerileri yenilenemedi:', error);
      // Gecici ag/Mikro hatasinda son dogru listeyi koru; bos liste gostererek
      // bekleyen islemleri yanlislikla gizleme.
      setOrderProductChangeRefreshError('Öneriler şu anda yenilenemedi; son alınan liste gösteriliyor.');
    } finally {
      if (orderProductChangeRequestSeqRef.current === requestSeq) {
        setOrderProductChangeLoading(false);
      }
      orderProductChangeFetchInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!['HEAD_ADMIN', 'ADMIN', 'MANAGER', 'SALES_REP'].includes(user.role)) return;
    void fetchOrderProductChangeRequests();

    const refresh = () => void fetchOrderProductChangeRequests(true);
    const intervalId = window.setInterval(refresh, 25_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchOrderProductChangeRequests, user?.id, user?.role]);

  const formatPercent = (value?: number | null) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return '-';
    return `%${parsed.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
  };

  const getMarginTone = (value?: number | null) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 'text-slate-500';
    if (parsed < 0) return 'text-red-700';
    if (parsed < 5) return 'text-amber-700';
    return 'text-emerald-700';
  };

  const approveOrderProductChange = async (id: string) => {
    setOrderProductChangeActingId(id);
    try {
      await adminApi.approveOrderProductChangeRequest(id);
      toast.success('Urun degisimi onaylandi ve Mikro siparis satiri guncellendi.');
      orderProductChangeResolvedIdsRef.current.add(id);
      setOrderProductChangeRequests((current) => current.filter((request) => request.id !== id));
      setOrderProductChangePendingCount((current) => Math.max(0, current - 1));
      await fetchOrderProductChangeRequests(true);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Urun degisimi onaylanamadi');
    } finally {
      setOrderProductChangeActingId('');
    }
  };

  const rejectOrderProductChange = async (id: string) => {
    const reason = window.prompt('Red nedeni (opsiyonel)') || '';
    setOrderProductChangeActingId(id);
    try {
      await adminApi.rejectOrderProductChangeRequest(id, reason);
      toast.success('Urun degisimi reddedildi.');
      orderProductChangeResolvedIdsRef.current.add(id);
      setOrderProductChangeRequests((current) => current.filter((request) => request.id !== id));
      setOrderProductChangePendingCount((current) => Math.max(0, current - 1));
      await fetchOrderProductChangeRequests(true);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Urun degisimi reddedilemedi');
    } finally {
      setOrderProductChangeActingId('');
    }
  };

  const summaryPeriodLabel =
    stats?.period === 'daily'
      ? 'Gunluk'
      : stats?.period === 'weekly'
        ? 'Haftalik'
        : stats?.period === 'monthly'
          ? 'Aylik'
          : stats?.period === 'custom'
            ? 'Tarih Araligi'
          : null;

  return {
    // router / user / permissions
    router,
    user,
    hasPermission,
    permissionsLoading,
    // period filter
    selectedPeriod,
    setSelectedPeriod,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    // stats
    stats,
    isLoading,
    summaryPeriodLabel,
    fetchStats,
    // sync (urun/stok/fiyat)
    isSyncing,
    syncProgress,
    handleSync,
    // cari sync
    isCariSyncing,
    handleCariSync,
    // resim sync
    isImageSyncing,
    imageSyncProgress,
    handleImageSync,
    // sync uyarilari
    syncWarnings,
    setSyncWarnings,
    // ekstre modal
    showEkstreModal,
    setShowEkstreModal,
    // order product change requests
    orderProductChangeRequests,
    orderProductChangePendingCount,
    orderProductChangeLoading,
    orderProductChangeActingId,
    orderProductChangeRefreshError,
    orderProductChangeLiveValidationAvailable,
    approveOrderProductChange,
    rejectOrderProductChange,
    // helpers
    formatPercent,
    getMarginTone,
  };
}

export default useDashboard;
