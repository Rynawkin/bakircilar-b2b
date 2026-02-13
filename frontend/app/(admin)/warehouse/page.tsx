'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';
import adminApi from '@/lib/api/admin';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';

type WorkflowStatus =
  | 'PENDING'
  | 'PICKING'
  | 'READY_FOR_LOADING'
  | 'PARTIALLY_LOADED'
  | 'LOADED'
  | 'DISPATCHED';

type WorkflowItemStatus = 'PENDING' | 'PICKED' | 'PARTIAL' | 'MISSING' | 'EXTRA';

type CoverageStatus = 'FULL' | 'PARTIAL' | 'NONE';
type OrderCoverageStatus = 'FULL' | 'PARTIAL' | 'NONE';

interface WarehouseSeriesRow {
  series: string;
  total: number;
  pending: number;
  picking: number;
  ready: number;
  loaded: number;
  dispatched: number;
}

interface WarehouseOrderRow {
  mikroOrderNumber: string;
  orderSeries: string;
  orderSequence: number;
  customerCode: string;
  customerName: string;
  warehouseCode: string | null;
  orderDate: string;
  deliveryDate: string | null;
  itemCount: number;
  grandTotal: number;
  workflowStatus: WorkflowStatus;
  assignedPickerUserId: string | null;
  startedAt: string | null;
  loadedAt: string | null;
  dispatchedAt: string | null;
  coverage: {
    fullLines: number;
    partialLines: number;
    missingLines: number;
    coveredPercent: number;
  };
  coverageStatus: OrderCoverageStatus;
}

interface WarehouseOrderDetail {
  order: {
    mikroOrderNumber: string;
    orderSeries: string;
    orderSequence: number;
    customerCode: string;
    customerName: string;
    warehouseCode: string | null;
    orderDate: string;
    deliveryDate: string | null;
    itemCount: number;
    grandTotal: number;
  };
  workflow: {
    id: string;
    status: WorkflowStatus;
    assignedPickerUserId: string | null;
    startedAt: string | null;
    loadingStartedAt: string | null;
    loadedAt: string | null;
    dispatchedAt: string | null;
    lastActionAt: string | null;
  } | null;
  coverage: {
    fullLines: number;
    partialLines: number;
    missingLines: number;
    coveredPercent: number;
  };
  coverageStatus: OrderCoverageStatus;
  lines: Array<{
    lineKey: string;
    rowNumber: number;
    productCode: string;
    productName: string;
    unit: string;
    requestedQty: number;
    deliveredQty: number;
    remainingQty: number;
    pickedQty: number;
    extraQty: number;
    shortageQty: number;
    unitPrice: number;
    lineTotal: number;
    vat: number;
    stockAvailable: number;
    warehouseStocks: {
      merkez: number;
      topca: number;
    };
    stockCoverageStatus: CoverageStatus;
    imageUrl: string | null;
    shelfCode: string | null;
    reservedQty: number;
    hasOwnReservation: boolean;
    hasOtherReservation: boolean;
    reservations: Array<{
      mikroOrderNumber: string;
      customerCode: string;
      customerName: string;
      orderDate: string;
      reservedQty: number;
      rowNumber: number | null;
      isCurrentOrder: boolean;
      matchesCurrentLine: boolean;
    }>;
    status: WorkflowItemStatus;
  }>;
}

const statusBadge: Record<WorkflowStatus, { label: string; className: string }> = {
  PENDING: { label: 'Beklemede', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  PICKING: { label: 'Toplaniyor', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  READY_FOR_LOADING: { label: 'Yuklemeye Hazir', className: 'bg-sky-100 text-sky-700 border-sky-200' },
  PARTIALLY_LOADED: { label: 'Kismi Yuklendi', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  LOADED: { label: 'Yuklendi', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  DISPATCHED: { label: 'Sevk Edildi', className: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
};

const stockStatusClass: Record<CoverageStatus, string> = {
  FULL: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PARTIAL: 'bg-amber-50 text-amber-700 border-amber-200',
  NONE: 'bg-rose-50 text-rose-700 border-rose-200',
};

const orderCoverageBadge: Record<OrderCoverageStatus, { label: string; className: string; cardClass: string }> = {
  FULL: {
    label: 'Depodan Tam',
    className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    cardClass: 'border-emerald-200',
  },
  PARTIAL: {
    label: 'Depodan Kismi',
    className: 'bg-amber-100 text-amber-700 border-amber-200',
    cardClass: 'border-amber-200',
  },
  NONE: {
    label: 'Depodan Yok',
    className: 'bg-rose-100 text-rose-700 border-rose-200',
    cardClass: 'border-rose-200',
  },
};

const getRemainingQtyClass = (line: WarehouseOrderDetail['lines'][number]) => {
  if (line.stockCoverageStatus === 'FULL') return 'bg-emerald-100 text-emerald-800 border-emerald-300';
  if (line.stockCoverageStatus === 'PARTIAL') return 'bg-amber-100 text-amber-800 border-amber-300';
  return 'bg-rose-100 text-rose-800 border-rose-300';
};

export default function WarehousePage() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();

  const [series, setSeries] = useState<WarehouseSeriesRow[]>([]);
  const [orders, setOrders] = useState<WarehouseOrderRow[]>([]);
  const [detailByOrder, setDetailByOrder] = useState<Record<string, WarehouseOrderDetail>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [detailLoadingOrder, setDetailLoadingOrder] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [lineSavingKey, setLineSavingKey] = useState<string | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | WorkflowStatus>('ALL');
  const [searchText, setSearchText] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [openOrderNumbers, setOpenOrderNumbers] = useState<string[]>([]);
  const [activeOrderNumber, setActiveOrderNumber] = useState<string | null>(null);
  const [shelfDrafts, setShelfDrafts] = useState<Record<string, string>>({});
  const [isPortrait, setIsPortrait] = useState(false);
  const [isDetailFullscreen, setIsDetailFullscreen] = useState(false);
  const [showAllOpenOrders, setShowAllOpenOrders] = useState(false);
  const [openReservationKey, setOpenReservationKey] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
  const [reportingImageKey, setReportingImageKey] = useState<string | null>(null);
  const [reportedImageKeys, setReportedImageKeys] = useState<Record<string, boolean>>({});
  const detailContainerRef = useRef<HTMLDivElement | null>(null);

  const layoutClass = isPortrait
    ? 'grid grid-cols-1 gap-4'
    : 'grid grid-cols-1 xl:grid-cols-[560px_minmax(0,1fr)] gap-4';

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(orientation: portrait)');
    const apply = () => setIsPortrait(media.matches);
    apply();

    if (media.addEventListener) {
      media.addEventListener('change', apply);
      return () => media.removeEventListener('change', apply);
    }

    media.addListener(apply);
    return () => media.removeListener(apply);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const syncFullscreenState = () => {
      setIsDetailFullscreen(document.fullscreenElement === detailContainerRef.current);
    };
    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearchDebounced(searchText.trim());
    }, 250);
    return () => clearTimeout(timeout);
  }, [searchText]);

  const selectedSeriesKey = useMemo(() => selectedSeries.slice().sort().join(','), [selectedSeries]);

  useEffect(() => {
    if (user === null || permissionsLoading) return;
    if (!hasPermission('admin:order-tracking')) {
      router.push('/dashboard');
      return;
    }

    fetchOverview(true);
    const interval = setInterval(() => fetchOverview(false), 15000);
    return () => clearInterval(interval);
  }, [user, permissionsLoading, selectedSeriesKey, selectedStatus, searchDebounced]);

  const totalOrdersCount = useMemo(() => orders.length, [orders]);
  const detail = activeOrderNumber ? detailByOrder[activeOrderNumber] || null : null;
  const isDetailLoading = Boolean(activeOrderNumber && detailLoadingOrder === activeOrderNumber);
  const visibleOrderNumbers = useMemo(() => {
    if (showAllOpenOrders) return openOrderNumbers;
    return activeOrderNumber ? [activeOrderNumber] : [];
  }, [showAllOpenOrders, openOrderNumbers, activeOrderNumber]);

  const fetchOverview = async (showLoader: boolean) => {
    if (showLoader) setIsLoading(true);
    try {
      const response = await adminApi.getWarehouseOverview({
        series: selectedSeries.length > 0 ? selectedSeries.join(',') : undefined,
        search: searchDebounced || undefined,
        status: selectedStatus,
      });
      setSeries(response.series || []);
      setOrders(response.orders || []);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Depo listesi yuklenemedi');
    } finally {
      if (showLoader) setIsLoading(false);
    }
  };

  const getShelfDraftKey = (mikroOrderNumber: string, lineKey: string) => `${mikroOrderNumber}::${lineKey}`;

  const loadOrderDetail = async (mikroOrderNumber: string) => {
    setActiveOrderNumber(mikroOrderNumber);
    setOpenReservationKey(null);
    setPreviewImage(null);
    setDetailLoadingOrder(mikroOrderNumber);
    setOpenOrderNumbers((prev) => (prev.includes(mikroOrderNumber) ? prev : [...prev, mikroOrderNumber]));
    try {
      const response = await adminApi.getWarehouseOrderDetail(mikroOrderNumber);
      setDetailByOrder((prev) => ({ ...prev, [mikroOrderNumber]: response }));
      setShelfDrafts((prev) => {
        const next = { ...prev };
        for (const line of response.lines) {
          next[getShelfDraftKey(mikroOrderNumber, line.lineKey)] = line.shelfCode || '';
        }
        return next;
      });
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Siparis detayi yuklenemedi');
    } finally {
      setDetailLoadingOrder((prev) => (prev === mikroOrderNumber ? null : prev));
    }
  };

  const refreshOrderDetail = async (mikroOrderNumber: string) => {
    await loadOrderDetail(mikroOrderNumber);
    await fetchOverview(false);
  };

  const withAction = async (fn: () => Promise<void>) => {
    try {
      setActionLoading(true);
      await fn();
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartPicking = async (mikroOrderNumber?: string) => {
    const targetOrderNumber = mikroOrderNumber || activeOrderNumber;
    if (!targetOrderNumber) return;
    await withAction(async () => {
      await adminApi.startWarehousePicking(targetOrderNumber);
      await refreshOrderDetail(targetOrderNumber);
      toast.success('Toplama baslatildi');
    });
  };

  const updateLine = async (
    mikroOrderNumber: string,
    line: WarehouseOrderDetail['lines'][number],
    payload: { pickedQty?: number; extraQty?: number; shelfCode?: string | null },
    successText?: string
  ) => {
    const actionKey = getShelfDraftKey(mikroOrderNumber, line.lineKey);
    setLineSavingKey(actionKey);
    try {
      await adminApi.updateWarehouseItem(mikroOrderNumber, line.lineKey, payload);
      await refreshOrderDetail(mikroOrderNumber);
      if (successText) toast.success(successText);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Satir guncellenemedi');
    } finally {
      setLineSavingKey(null);
    }
  };

  const changePicked = async (
    mikroOrderNumber: string,
    line: WarehouseOrderDetail['lines'][number],
    diff: number
  ) => {
    const next = Math.max(0, line.pickedQty + diff);
    await updateLine(mikroOrderNumber, line, { pickedQty: next });
  };

  const changeExtra = async (
    mikroOrderNumber: string,
    line: WarehouseOrderDetail['lines'][number],
    diff: number
  ) => {
    const next = Math.max(0, line.extraQty + diff);
    await updateLine(mikroOrderNumber, line, { extraQty: next });
  };

  const saveShelf = async (mikroOrderNumber: string, line: WarehouseOrderDetail['lines'][number]) => {
    const draftKey = getShelfDraftKey(mikroOrderNumber, line.lineKey);
    const draft = (shelfDrafts[draftKey] || '').trim();
    const current = (line.shelfCode || '').trim();
    if (draft === current) return;
    await updateLine(mikroOrderNumber, line, { shelfCode: draft || null }, 'Raf kodu guncellendi');
  };

  const reportImageIssue = async (
    mikroOrderNumber: string,
    line: WarehouseOrderDetail['lines'][number]
  ) => {
    const actionKey = getShelfDraftKey(mikroOrderNumber, line.lineKey);
    setReportingImageKey(actionKey);
    try {
      const result = await adminApi.reportWarehouseImageIssue(mikroOrderNumber, line.lineKey);
      setReportedImageKeys((prev) => ({ ...prev, [actionKey]: true }));
      if (result.alreadyReported) {
        toast.success('Bu satir icin acik resim hatasi talebi zaten var');
      } else {
        toast.success('Resim hatasi bildirildi');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Resim hatasi bildirilemedi');
    } finally {
      setReportingImageKey((prev) => (prev === actionKey ? null : prev));
    }
  };

  const toggleSeriesSelection = (seriesCode: string) => {
    setSelectedSeries((prev) =>
      prev.includes(seriesCode) ? prev.filter((value) => value !== seriesCode) : [...prev, seriesCode]
    );
  };

  const closeOrderTab = (mikroOrderNumber: string) => {
    setOpenReservationKey(null);
    setPreviewImage(null);
    setOpenOrderNumbers((prev) => {
      const next = prev.filter((value) => value !== mikroOrderNumber);
      setActiveOrderNumber((current) => (current === mikroOrderNumber ? next[0] || null : current));
      if (next.length <= 1) {
        setShowAllOpenOrders(false);
      }
      return next;
    });
    setDetailByOrder((prev) => {
      const next = { ...prev };
      delete next[mikroOrderNumber];
      return next;
    });
    setShelfDrafts((prev) => {
      const next: Record<string, string> = {};
      const prefix = `${mikroOrderNumber}::`;
      for (const [key, value] of Object.entries(prev)) {
        if (!key.startsWith(prefix)) {
          next[key] = value;
        }
      }
      return next;
    });
    setReportedImageKeys((prev) => {
      const next: Record<string, boolean> = {};
      const prefix = `${mikroOrderNumber}::`;
      for (const [key, value] of Object.entries(prev)) {
        if (!key.startsWith(prefix)) {
          next[key] = value;
        }
      }
      return next;
    });
  };

  const toggleDetailFullscreen = async () => {
    if (!detailContainerRef.current || typeof document === 'undefined') return;
    try {
      if (document.fullscreenElement === detailContainerRef.current) {
        await document.exitFullscreen();
      } else {
        await detailContainerRef.current.requestFullscreen();
      }
    } catch {
      toast.error('Tam ekran acilamadi');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50 to-slate-100">
      <div className="w-full px-2 md:px-4 xl:px-6 py-5 space-y-4">
        <Card className="border border-cyan-200 bg-white/90 backdrop-blur">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Depo Kiosk</h1>
                <p className="text-sm text-slate-600">
                  Dokunmatik toplama ve yukleme akisi ({isPortrait ? 'Dikey' : 'Yatay'} mod)
                </p>
              </div>
              <div className="text-xs md:text-sm text-slate-600 bg-slate-100 rounded-lg px-3 py-2 inline-flex">
                Gorunen siparis: <strong className="ml-1">{totalOrdersCount}</strong>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Siparis no, cari kod veya musteri ara..."
                className="h-12 text-base"
              />
              <select
                value={selectedStatus}
                onChange={(event) => setSelectedStatus(event.target.value as any)}
                className="h-12 rounded-xl border border-slate-300 bg-white px-4 text-base font-semibold text-slate-700"
              >
                <option value="ALL">Tum Durumlar</option>
                <option value="PENDING">Beklemede</option>
                <option value="PICKING">Toplaniyor</option>
                <option value="READY_FOR_LOADING">Yuklemeye Hazir</option>
                <option value="PARTIALLY_LOADED">Kismi Yuklendi</option>
                <option value="LOADED">Yuklendi</option>
                <option value="DISPATCHED">Sevk Edildi</option>
              </select>
              <Button variant="secondary" onClick={() => fetchOverview(true)} className="h-12 text-base">
                Yenile
              </Button>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setSelectedSeries([])}
                className={`px-4 h-11 rounded-xl border text-sm font-bold whitespace-nowrap ${
                  selectedSeries.length === 0
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                Tum Seriler
              </button>
              {series.map((item) => (
                <button
                  key={item.series}
                  onClick={() => toggleSeriesSelection(item.series)}
                  className={`px-4 h-11 rounded-xl border text-sm font-bold whitespace-nowrap ${
                    selectedSeries.includes(item.series)
                      ? 'bg-cyan-600 text-white border-cyan-600'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  {item.series} ({item.total})
                </button>
              ))}
            </div>
          </div>
        </Card>

        <div className={layoutClass}>
          <Card className="border border-slate-200 bg-white/90">
            <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
              {isLoading ? (
                <div className="py-16 text-center text-slate-500 font-semibold">Yukleniyor...</div>
              ) : orders.length === 0 ? (
                <div className="py-16 text-center text-slate-500 font-semibold">Filtreye uygun siparis bulunamadi</div>
              ) : (
                orders.map((order) => {
                  const active = activeOrderNumber === order.mikroOrderNumber;
                  const isOpen = openOrderNumbers.includes(order.mikroOrderNumber);
                  const badge = statusBadge[order.workflowStatus];
                  const coverageBadge = orderCoverageBadge[order.coverageStatus];
                  return (
                    <button
                      key={order.mikroOrderNumber}
                      onClick={() => loadOrderDetail(order.mikroOrderNumber)}
                      className={`w-full text-left rounded-2xl border p-4 transition-all ${
                        active
                          ? 'border-cyan-500 bg-cyan-50 shadow-md'
                          : `${coverageBadge.cardClass} bg-white hover:border-cyan-300 hover:bg-cyan-50/40`
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="text-base font-black text-slate-900">
                            {order.mikroOrderNumber}
                            {isOpen ? ' *' : ''}
                          </p>
                          <p className="text-xs text-slate-600">{order.customerCode}</p>
                        </div>
                        <span className={`text-[11px] px-2 py-1 rounded-lg border font-bold ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className={`text-[11px] px-2 py-1 rounded-lg border font-bold ${coverageBadge.className}`}>
                          {coverageBadge.label}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-600">
                          Depo: {order.warehouseCode || 'Tum Depolar'}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800 line-clamp-1 mb-2">{order.customerName}</p>
                      <div className="flex justify-between text-xs text-slate-600 mb-2">
                        <span>{formatDateShort(order.orderDate)}</span>
                        <span>{formatCurrency(order.grandTotal)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500"
                          style={{ width: `${order.coverage.coveredPercent}%` }}
                        />
                      </div>
                      <div className="mt-2 text-[11px] text-slate-600 flex justify-between">
                        <span>Karsilama %{order.coverage.coveredPercent}</span>
                        <span>
                          {order.coverage.fullLines} tam / {order.coverage.partialLines} kismi / {order.coverage.missingLines} eksik
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </Card>

          <div
            ref={detailContainerRef}
            className={isDetailFullscreen ? 'h-full w-full overflow-y-auto bg-slate-100 p-4' : ''}
          >
            <Card className="border border-slate-200 bg-white/95">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {openOrderNumbers.length > 0 && (
                  <div className="flex flex-1 gap-2 overflow-x-auto pb-1">
                    {openOrderNumbers.map((orderNumber) => {
                      const tabDetail = detailByOrder[orderNumber];
                      const active = activeOrderNumber === orderNumber;
                      return (
                        <div
                          key={orderNumber}
                          className={`inline-flex items-center rounded-xl border ${
                            active ? 'border-cyan-500 bg-cyan-50' : 'border-slate-200 bg-slate-50'
                          }`}
                        >
                          <button
                            onClick={() => setActiveOrderNumber(orderNumber)}
                            className={`px-3 py-2 text-xs font-bold whitespace-nowrap ${
                              active ? 'text-cyan-700' : 'text-slate-700'
                            }`}
                          >
                            {orderNumber}
                            {tabDetail ? '' : ' (Yukleniyor)'}
                          </button>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              closeOrderTab(orderNumber);
                            }}
                            className="px-2 py-2 text-xs font-black text-slate-500 hover:text-rose-600"
                          >
                            X
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {openOrderNumbers.length > 1 && (
                  <Button
                    variant={showAllOpenOrders ? 'primary' : 'secondary'}
                    onClick={() => setShowAllOpenOrders((prev) => !prev)}
                    className="h-10 text-xs font-bold whitespace-nowrap"
                  >
                    {showAllOpenOrders ? 'Tek Siparis Gorunumu' : 'Tum Acik Siparisleri Goster'}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={toggleDetailFullscreen}
                  disabled={actionLoading}
                  className="h-10 text-xs font-bold whitespace-nowrap"
                >
                  {isDetailFullscreen ? 'Tam Ekrandan Cik' : 'Tam Ekran'}
                </Button>
              </div>

              {isDetailLoading && !detail ? (
                <div className="py-20 text-center text-slate-500 font-semibold">Siparis detayi yukleniyor...</div>
              ) : visibleOrderNumbers.length === 0 ? (
                <div className="py-20 text-center text-slate-500 font-semibold">
                  Sol listeden bir siparis secin
                </div>
              ) : (
                <div
                  className={
                    showAllOpenOrders
                      ? 'grid grid-cols-1 2xl:grid-cols-2 gap-4'
                      : 'space-y-4'
                  }
                >
                  {visibleOrderNumbers.map((orderNumber) => {
                    const panelDetail = detailByOrder[orderNumber];
                    if (!panelDetail) {
                      return (
                        <div key={orderNumber} className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
                          <p className="text-sm text-slate-600 font-semibold">Siparis detayi yukleniyor...</p>
                        </div>
                      );
                    }

                    const panelWorkflowStatus: WorkflowStatus = panelDetail.workflow?.status || 'PENDING';
                    const panelHasStarted =
                      Boolean(panelDetail.workflow?.startedAt) || panelWorkflowStatus !== 'PENDING';
                    const panelCanEditLines = panelHasStarted && panelWorkflowStatus !== 'DISPATCHED';
                    const panelIsActive = activeOrderNumber === orderNumber;
                    const panelCoverageBadge = orderCoverageBadge[panelDetail.coverageStatus];
                    const panelLineAreaClass = isDetailFullscreen
                      ? 'space-y-3 max-h-[calc(100vh-400px)] overflow-y-auto pr-1'
                      : 'space-y-3 max-h-[58vh] overflow-y-auto pr-1';

                    return (
                      <div
                        key={orderNumber}
                        className={`space-y-4 rounded-2xl border p-3 ${
                          panelIsActive ? 'border-cyan-300 bg-cyan-50/30' : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div>
                              <h2 className="text-2xl font-black text-slate-900">{panelDetail.order.mikroOrderNumber}</h2>
                              <p className="text-sm text-slate-700 font-semibold">{panelDetail.order.customerName}</p>
                              <p className="text-xs text-slate-500 mt-1">
                                {panelDetail.order.customerCode} | Depo: {panelDetail.order.warehouseCode || 'Tum Depolar'} | {panelDetail.order.itemCount} kalem
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span className={`text-sm px-3 py-2 rounded-xl border font-bold ${statusBadge[panelWorkflowStatus].className}`}>
                                {statusBadge[panelWorkflowStatus].label}
                              </span>
                              <span className={`text-sm px-3 py-2 rounded-xl border font-bold ${panelCoverageBadge.className}`}>
                                {panelCoverageBadge.label}
                              </span>
                            </div>
                          </div>
                          <div className="mt-3 h-2.5 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500"
                              style={{ width: `${panelDetail.coverage.coveredPercent}%` }}
                            />
                          </div>
                          <p className="text-xs text-slate-600 mt-2">
                            Toplam karsilama: %{panelDetail.coverage.coveredPercent} ({panelDetail.coverage.fullLines} tam / {panelDetail.coverage.partialLines} kismi / {panelDetail.coverage.missingLines} eksik)
                          </p>
                        </div>

                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                          <Button
                            onClick={() => handleStartPicking(orderNumber)}
                            disabled={actionLoading || panelHasStarted}
                            className="h-12 text-sm font-bold"
                          >
                            {panelHasStarted ? 'Toplama Basladi' : 'Toplamaya Basla'}
                          </Button>
                          <Button
                            variant={panelIsActive ? 'primary' : 'secondary'}
                            onClick={() => setActiveOrderNumber(orderNumber)}
                            className="h-12 text-sm font-bold"
                          >
                            {panelIsActive ? 'Aktif Siparis' : 'Aktif Et'}
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => refreshOrderDetail(orderNumber)}
                            disabled={actionLoading}
                            className="h-12 text-sm font-bold"
                          >
                            Detay Yenile
                          </Button>
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 flex items-center">
                            {panelCanEditLines
                              ? 'Toplama aktif. Satirlarda miktar/raf islemleri yapabilirsiniz.'
                              : 'Satir islemleri icin once Toplamaya Basla adimini tamamlayin.'}
                          </div>
                        </div>

                        <div className={panelLineAreaClass}>
                          {panelDetail.lines.map((line) => {
                            const draftKey = getShelfDraftKey(orderNumber, line.lineKey);
                            const saving = lineSavingKey === draftKey;
                            const remainingQtyClass = getRemainingQtyClass(line);
                            const reservationKey = `${orderNumber}::${line.lineKey}`;
                            const reservationOpen = openReservationKey === reservationKey;
                            const imageIssueKey = `${orderNumber}::${line.lineKey}`;
                            const imageIssueReported = Boolean(reportedImageKeys[imageIssueKey]);
                            const imageIssueReporting = reportingImageKey === imageIssueKey;
                            return (
                              <div
                                key={line.lineKey}
                                className={`rounded-2xl border bg-white p-3 md:p-4 shadow-sm ${
                                  line.stockCoverageStatus === 'NONE'
                                    ? 'border-rose-200'
                                    : line.stockCoverageStatus === 'PARTIAL'
                                    ? 'border-amber-200'
                                    : 'border-emerald-200'
                                }`}
                              >
                                <div className="flex gap-3">
                                  <div className="w-24 h-24 md:w-28 md:h-28 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                                    {line.imageUrl ? (
                                      <button
                                        type="button"
                                        onClick={() => setPreviewImage({ url: line.imageUrl as string, name: line.productName })}
                                        className="block w-full h-full"
                                      >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={line.imageUrl} alt={line.productName} className="w-full h-full object-cover" />
                                      </button>
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-slate-500">RESIM</div>
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="text-sm md:text-base font-black text-slate-900 line-clamp-2">{line.productName}</p>
                                        <p className="text-xs text-slate-600">
                                          Satir #{line.rowNumber} | {line.productCode} | Birim: {line.unit}
                                        </p>
                                      </div>
                                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                                        <span className="text-[11px] px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 font-semibold text-slate-700">
                                          Birim: {line.unit}
                                        </span>
                                        <span className={`text-[11px] px-2 py-1 rounded-lg border font-bold ${stockStatusClass[line.stockCoverageStatus]}`}>
                                          Siparis Depo Stok: {line.stockAvailable} {line.unit}
                                        </span>
                                        <span className="text-[11px] px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 font-semibold text-slate-700">
                                          Merkez: {line.warehouseStocks.merkez}
                                        </span>
                                        <span className="text-[11px] px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 font-semibold text-slate-700">
                                          Topca: {line.warehouseStocks.topca}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                      <div className={`rounded-xl border px-3 py-2 ${remainingQtyClass}`}>
                                        <p className="text-[10px] font-black uppercase tracking-wide">Kalan Siparis</p>
                                        <p className="text-2xl leading-none font-black mt-1">{line.remainingQty}</p>
                                      </div>
                                      <div className="rounded-xl border border-slate-200 bg-sky-50 px-3 py-2">
                                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-600">Toplanan</p>
                                        <p className="text-lg leading-none font-black mt-1 text-slate-900">{line.pickedQty}</p>
                                      </div>
                                      <div className="rounded-xl border border-slate-200 bg-violet-50 px-3 py-2">
                                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-600">Siparissiz Ek</p>
                                        <p className="text-lg leading-none font-black mt-1 text-slate-900">{line.extraQty}</p>
                                      </div>
                                      <div className="rounded-xl border border-slate-200 bg-amber-50 px-3 py-2">
                                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-600">Eksik</p>
                                        <p className="text-lg leading-none font-black mt-1 text-slate-900">{line.shortageQty}</p>
                                      </div>
                                    </div>

                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                      <button
                                        onClick={() => reportImageIssue(orderNumber, line)}
                                        disabled={imageIssueReported || imageIssueReporting}
                                        className={`text-[11px] px-2 py-1 rounded-lg border font-bold disabled:opacity-60 ${
                                          imageIssueReported
                                            ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                                            : 'border-rose-300 bg-rose-100 text-rose-800'
                                        }`}
                                      >
                                        {imageIssueReporting
                                          ? 'Bildiriliyor...'
                                          : imageIssueReported
                                          ? 'Resim Hatasi Bildirildi'
                                          : 'Resim Hatasi Bildir'}
                                      </button>
                                      {line.reservedQty > 0 && (
                                        <span className="text-[11px] px-2 py-1 rounded-lg border border-emerald-300 bg-emerald-100 text-emerald-800 font-bold">
                                          Satir Rezerve: {line.reservedQty} {line.unit}
                                        </span>
                                      )}
                                      {line.hasOwnReservation && (
                                        <button
                                          onClick={() =>
                                            setOpenReservationKey((prev) => (prev === reservationKey ? null : reservationKey))
                                          }
                                          className="text-[11px] px-2 py-1 rounded-lg border border-emerald-300 bg-emerald-100 text-emerald-800 font-bold"
                                        >
                                          Rezerve Siparis
                                        </button>
                                      )}
                                      {line.hasOtherReservation && (
                                        <button
                                          onClick={() =>
                                            setOpenReservationKey((prev) => (prev === reservationKey ? null : reservationKey))
                                          }
                                          className="text-[11px] px-2 py-1 rounded-lg border border-rose-300 bg-rose-100 text-rose-800 font-bold"
                                        >
                                          Baska Sipariste Rezerve
                                        </button>
                                      )}
                                    </div>

                                    {reservationOpen && line.reservations.length > 0 && (
                                      <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                                        <div className="flex items-center justify-between">
                                          <p className="text-xs font-black text-slate-700">Rezerve Detaylari</p>
                                          <button
                                            onClick={() => setOpenReservationKey(null)}
                                            className="text-[11px] font-bold text-slate-500 hover:text-slate-800"
                                          >
                                            Kapat
                                          </button>
                                        </div>
                                        <div className="mt-2 max-h-40 overflow-y-auto space-y-1.5 pr-1">
                                          {line.reservations.map((reservation, index) => (
                                            <div
                                              key={`${reservation.mikroOrderNumber}-${reservation.rowNumber || 'x'}-${index}`}
                                              className={`rounded-lg border px-2 py-1.5 ${
                                                reservation.isCurrentOrder
                                                  ? 'border-emerald-200 bg-emerald-50'
                                                  : 'border-rose-200 bg-rose-50'
                                              }`}
                                            >
                                              <p className="text-[11px] font-bold text-slate-800">
                                                {reservation.mikroOrderNumber}
                                                {reservation.rowNumber ? ` (Satir #${reservation.rowNumber})` : ''}
                                              </p>
                                              <p className="text-[11px] text-slate-700">
                                                {reservation.customerCode} | {reservation.customerName}
                                              </p>
                                              <p className="text-[11px] text-slate-700">
                                                {formatDateShort(reservation.orderDate)} | Rezerve: {reservation.reservedQty} {line.unit}
                                              </p>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div className="rounded-xl border border-slate-200 p-2">
                                    <p className="text-[11px] font-bold text-slate-600 mb-1">Toplanan Miktar</p>
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => changePicked(orderNumber, line, -1)}
                                        disabled={saving || !panelCanEditLines}
                                        className="h-9 w-9 rounded-lg border border-slate-300 text-base font-black text-slate-700 disabled:opacity-50"
                                      >
                                        -
                                      </button>
                                      <div className="h-9 flex-1 rounded-lg bg-slate-100 flex items-center justify-center text-base font-black text-slate-900">
                                        {line.pickedQty}
                                      </div>
                                      <button
                                        onClick={() => changePicked(orderNumber, line, 1)}
                                        disabled={saving || !panelCanEditLines}
                                        className="h-9 w-9 rounded-lg border border-slate-300 text-base font-black text-slate-700 disabled:opacity-50"
                                      >
                                        +
                                      </button>
                                      <button
                                        onClick={() => updateLine(orderNumber, line, { pickedQty: line.remainingQty })}
                                        disabled={saving || !panelCanEditLines}
                                        className="h-9 px-3 rounded-lg bg-emerald-600 text-white text-[11px] font-bold disabled:opacity-50"
                                      >
                                        Tamami Toplandi
                                      </button>
                                    </div>
                                  </div>

                                  <div className="rounded-xl border border-slate-200 p-2">
                                    <p className="text-[11px] font-bold text-slate-600 mb-1">Siparissiz Ek Miktar</p>
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => changeExtra(orderNumber, line, -1)}
                                        disabled={saving || !panelCanEditLines}
                                        className="h-9 w-9 rounded-lg border border-slate-300 text-base font-black text-slate-700 disabled:opacity-50"
                                      >
                                        -
                                      </button>
                                      <div className="h-9 flex-1 rounded-lg bg-slate-100 flex items-center justify-center text-base font-black text-slate-900">
                                        {line.extraQty}
                                      </div>
                                      <button
                                        onClick={() => changeExtra(orderNumber, line, 1)}
                                        disabled={saving || !panelCanEditLines}
                                        className="h-9 w-9 rounded-lg border border-slate-300 text-base font-black text-slate-700 disabled:opacity-50"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div className="rounded-xl border border-slate-200 p-2">
                                    <p className="text-[11px] font-bold text-slate-600 mb-1">Mevcut Raf Kodu</p>
                                    <p className="h-9 rounded-lg bg-slate-100 px-3 flex items-center text-sm font-bold text-slate-800">
                                      {line.shelfCode || '-'}
                                    </p>
                                  </div>
                                  <div className="rounded-xl border border-slate-200 p-2">
                                    <p className="text-[11px] font-bold text-slate-600 mb-1">Raf Kodu Guncelle</p>
                                    <div className="grid grid-cols-[1fr_auto] gap-2">
                                      <Input
                                        value={shelfDrafts[draftKey] || ''}
                                        onChange={(event) =>
                                          setShelfDrafts((prev) => ({ ...prev, [draftKey]: event.target.value }))
                                        }
                                        onBlur={() => {
                                          if (panelCanEditLines) saveShelf(orderNumber, line);
                                        }}
                                        placeholder="Raf kodu (ornek: A-03-12)"
                                        className="h-9"
                                        disabled={!panelCanEditLines}
                                      />
                                      <Button
                                        variant="secondary"
                                        onClick={() => saveShelf(orderNumber, line)}
                                        disabled={saving || !panelCanEditLines}
                                        className="h-9 px-4"
                                      >
                                        Kaydet
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
      {previewImage && (
        <div
          className="fixed inset-0 z-[100] bg-slate-900/85 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-6xl w-full max-h-[90vh] flex items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-2 right-2 z-10 h-9 w-9 rounded-full bg-white/90 text-slate-900 font-black"
            >
              X
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage.url}
              alt={previewImage.name}
              className="max-w-full max-h-[88vh] rounded-2xl border-2 border-white/50 object-contain bg-slate-950/40"
            />
          </div>
        </div>
      )}
    </div>
  );
}

