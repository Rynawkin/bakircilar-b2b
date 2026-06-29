'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';
import adminApi from '@/lib/api/admin';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import { getUnitConversionLabel } from '@/lib/utils/unit';

// Re-export edilen yardimcilar (Classic/New JSX'lerin ihtiyaci icin)
export { formatCurrency, formatDateShort } from '@/lib/utils/format';
export { getUnitConversionLabel } from '@/lib/utils/unit';

export type WorkflowStatus =
  | 'PENDING'
  | 'PICKING'
  | 'READY_FOR_LOADING'
  | 'PARTIALLY_LOADED'
  | 'LOADED'
  | 'DISPATCHED';

export type WorkflowItemStatus = 'PENDING' | 'PICKED' | 'PARTIAL' | 'MISSING' | 'EXTRA';

export type CoverageStatus = 'FULL' | 'PARTIAL' | 'NONE';
export type OrderCoverageStatus = 'FULL' | 'PARTIAL' | 'NONE';
export type OrderSortField = 'orderDate' | 'customerName' | 'grandTotal' | 'coveredPercent';
export type OrderSortDirection = 'asc' | 'desc';
export type OrderViewMode = 'order' | 'customer';
export type KeyboardTarget =
  | { type: 'search' }
  | { type: 'delivery'; orderNumber: string }
  | { type: 'shelf'; orderNumber: string; lineKey: string };

export interface WarehouseSeriesRow {
  series: string;
  total: number;
  pending: number;
  picking: number;
  ready: number;
  loaded: number;
  dispatched: number;
}

export interface WarehouseOrderRow {
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
  mikroDeliveryNoteNo: string | null;
  coverage: {
    fullLines: number;
    partialLines: number;
    missingLines: number;
    coveredPercent: number;
  };
  coverageStatus: OrderCoverageStatus;
}

export interface WarehouseOrderDetail {
  order: {
    mikroOrderNumber: string;
    orderSeries: string;
    orderSequence: number;
    customerCode: string;
    customerName: string;
    documentNo?: string | null;
    orderNote?: string | null;
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
      mikroDeliveryNoteNo: string | null;
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
    unit2: string | null;
    unit2Factor: number | null;
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

export const statusBadge: Record<WorkflowStatus, { label: string; className: string }> = {
  PENDING: { label: 'Beklemede', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  PICKING: { label: 'Toplaniyor', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  READY_FOR_LOADING: { label: 'Yuklemeye Hazir', className: 'bg-sky-100 text-sky-700 border-sky-200' },
  PARTIALLY_LOADED: { label: 'Kismi Yuklendi', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  LOADED: { label: 'Yuklendi', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  DISPATCHED: { label: 'Sevk Edildi', className: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
};

export const stockStatusClass: Record<CoverageStatus, string> = {
  FULL: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PARTIAL: 'bg-amber-50 text-amber-700 border-amber-200',
  NONE: 'bg-rose-50 text-rose-700 border-rose-200',
};

export const orderCoverageBadge: Record<OrderCoverageStatus, { label: string; className: string; cardClass: string }> = {
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

export const getRemainingQtyClass = (line: WarehouseOrderDetail['lines'][number]) => {
  if (line.stockCoverageStatus === 'FULL') return 'bg-emerald-100 text-emerald-800 border-emerald-300';
  if (line.stockCoverageStatus === 'PARTIAL') return 'bg-amber-100 text-amber-800 border-amber-300';
  return 'bg-rose-100 text-rose-800 border-rose-300';
};

export const KEYBOARD_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', '-'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '.', '*', '/'],
];

export const NUMPAD_NUMBER_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.'];

export type DriverOption = {
  id: string;
  firstName: string;
  lastName: string;
  tcNo: string;
  note?: string | null;
  active: boolean;
};

export type VehicleOption = {
  id: string;
  name: string;
  plate: string;
  note?: string | null;
  active: boolean;
};

/**
 * Depo Kiosk ekraninin TUM mantigi (state/effect/handler/turetilmis deger/ref).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir.
 * Ozellikle Mikro'ya yazan (irsaliye/dispatch), seri-no, birim/katsayi, optimistic+debounce
 * miktar kaydi ve raf-kodu handler'lari TEK SATIR DEGISMEDEN korunmustur.
 */
export function useDepoKiosk() {
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
  const [sortField, setSortField] = useState<OrderSortField>('orderDate');
  const [sortDirection, setSortDirection] = useState<OrderSortDirection>('desc');
  const [viewMode, setViewMode] = useState<OrderViewMode>('order');
  const [searchText, setSearchText] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [openOrderNumbers, setOpenOrderNumbers] = useState<string[]>([]);
  const [activeOrderNumber, setActiveOrderNumber] = useState<string | null>(null);
  const [shelfDrafts, setShelfDrafts] = useState<Record<string, string>>({});
  const [isPortrait, setIsPortrait] = useState(false);
  const [isKioskTouchMode, setIsKioskTouchMode] = useState(true);
  const [isBarcodeMode, setIsBarcodeMode] = useState(false);
  const [isDetailFullscreen, setIsDetailFullscreen] = useState(false);
  const [showAllOpenOrders, setShowAllOpenOrders] = useState(false);
  const [showCompletedLines, setShowCompletedLines] = useState(true);
  const [dispatchModalOrderNumber, setDispatchModalOrderNumber] = useState<string | null>(null);
  const [dispatchModalSeries, setDispatchModalSeries] = useState('');
  const [dispatchModalDriverId, setDispatchModalDriverId] = useState('');
  const [dispatchModalVehicleId, setDispatchModalVehicleId] = useState('');
  const [showTopControls, setShowTopControls] = useState(false);
  const [openReservationKey, setOpenReservationKey] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
  const [reportingImageKey, setReportingImageKey] = useState<string | null>(null);
  const [reportedImageKeys, setReportedImageKeys] = useState<Record<string, boolean>>({});
  const [deliveryNoteDrafts, setDeliveryNoteDrafts] = useState<Record<string, string>>({});
  const [dispatchDriverDrafts, setDispatchDriverDrafts] = useState<Record<string, string>>({});
  const [dispatchVehicleDrafts, setDispatchVehicleDrafts] = useState<Record<string, string>>({});
  const [confirmCompleteKeys, setConfirmCompleteKeys] = useState<Record<string, boolean>>({});
  const [dispatchDrivers, setDispatchDrivers] = useState<DriverOption[]>([]);
  const [dispatchVehicles, setDispatchVehicles] = useState<VehicleOption[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [newDriverFirstName, setNewDriverFirstName] = useState('');
  const [newDriverLastName, setNewDriverLastName] = useState('');
  const [newDriverTcNo, setNewDriverTcNo] = useState('');
  const [newVehicleName, setNewVehicleName] = useState('');
  const [newVehiclePlate, setNewVehiclePlate] = useState('');
  const [showDispatchCatalogAdmin, setShowDispatchCatalogAdmin] = useState(false);
  const [keyboardTarget, setKeyboardTarget] = useState<KeyboardTarget | null>(null);
  const [keyboardValue, setKeyboardValue] = useState('');
  const [qtyPadTarget, setQtyPadTarget] = useState<{
    type: 'picked' | 'extra';
    mikroOrderNumber: string;
    lineKey: string;
    value: string;
  } | null>(null);
  const detailContainerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const suggestedCustomerCodesRef = useRef<Set<string>>(new Set());
  // 5.5: Toplanan/ek miktar +/- icin debounce zamanlayicilari (her satir+alan icin ayri)
  const qtyDebounceTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // 5.5: Debounce ile kaydedilmeyi bekleyen son miktar degerleri (optimistic)
  const pendingQtyRef = useRef<Record<string, { mikroOrderNumber: string; lineKey: string; field: 'pickedQty' | 'extraQty'; value: number }>>({});
  // 5.6: Kullanici aktif olarak miktar/raf girerken otomatik yenilemeyi duraklatmak icin
  const isEditingRef = useRef(false);
  const [activeInputCount, setActiveInputCount] = useState(0);

  const layoutClass = isPortrait
    ? 'grid grid-cols-1 gap-3'
    : 'grid grid-cols-1 xl:grid-cols-[500px_minmax(0,1fr)] gap-3';
  const actionButtonClass = 'h-7 px-1.5 text-[10px] font-bold';
  const activeDrivers = useMemo(() => dispatchDrivers.filter((item) => item.active), [dispatchDrivers]);
  const activeVehicles = useMemo(() => dispatchVehicles.filter((item) => item.active), [dispatchVehicles]);

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

  useEffect(() => {
    if (!isBarcodeMode) return;
    setKeyboardTarget((prev) => (prev?.type === 'search' ? null : prev));
    const timer = setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [isBarcodeMode]);

  const selectedSeriesKey = useMemo(() => selectedSeries.slice().sort().join(','), [selectedSeries]);

  useEffect(() => {
    if (user === null || permissionsLoading) return;
    if (!hasPermission('admin:order-tracking') && !hasPermission('admin:warehouse-kiosk')) {
      router.push('/dashboard');
      return;
    }

    fetchOverview(true);
    fetchDispatchCatalog();
    // 5.6: Kullanici aktif olarak miktar/raf girerken (input odakli veya bekleyen kayit varken)
    // 15 sn'lik otomatik yenilemeyi atla; acik girdileri/optimistic degerleri koru.
    const interval = setInterval(() => {
      if (isEditingRef.current) return;
      fetchOverview(false);
    }, 15000);
    return () => clearInterval(interval);
  }, [user, permissionsLoading, selectedSeriesKey, selectedStatus, searchDebounced]);

  // 5.6: Odakli input sayisi veya bekleyen miktar kaydi oldukca duzenleme modunu acik tut
  useEffect(() => {
    isEditingRef.current = activeInputCount > 0;
  }, [activeInputCount]);

  // 5.5: Sayfa kapanirken bekleyen miktar kayitlarini gonder ve zamanlayicilari temizle.
  useEffect(() => {
    return () => {
      const timers = qtyDebounceTimersRef.current;
      const pendings = pendingQtyRef.current;
      for (const pendingKey of Object.keys(timers)) {
        clearTimeout(timers[pendingKey]);
      }
      for (const pendingKey of Object.keys(pendings)) {
        const pending = pendings[pendingKey];
        void adminApi
          .updateWarehouseItem(pending.mikroOrderNumber, pending.lineKey, { [pending.field]: pending.value })
          .catch(() => {});
      }
      qtyDebounceTimersRef.current = {};
      pendingQtyRef.current = {};
    };
  }, []);

  const sortedOrders = useMemo(() => {
    const sorted = [...orders];
    sorted.sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      if (sortField === 'orderDate') {
        aValue = new Date(a.orderDate).getTime();
        bValue = new Date(b.orderDate).getTime();
      } else if (sortField === 'customerName') {
        aValue = a.customerName || '';
        bValue = b.customerName || '';
      } else if (sortField === 'grandTotal') {
        aValue = Number(a.grandTotal) || 0;
        bValue = Number(b.grandTotal) || 0;
      } else {
        aValue = Number(a.coverage?.coveredPercent) || 0;
        bValue = Number(b.coverage?.coveredPercent) || 0;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const compare = aValue.localeCompare(bValue, 'tr');
        return sortDirection === 'asc' ? compare : -compare;
      }

      const compare = Number(aValue) - Number(bValue);
      return sortDirection === 'asc' ? compare : -compare;
    });
    return sorted;
  }, [orders, sortField, sortDirection]);

  const groupedCustomerOrders = useMemo(() => {
    const grouped = new Map<
      string,
      {
        customerCode: string;
        customerName: string;
        totalOrders: number;
        totalAmount: number;
        avgCoveredPercent: number;
        fullCount: number;
        partialCount: number;
        noneCount: number;
        orders: WarehouseOrderRow[];
      }
    >();

    for (const order of sortedOrders) {
      const key = order.customerCode || order.customerName;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          customerCode: order.customerCode,
          customerName: order.customerName,
          totalOrders: 1,
          totalAmount: Number(order.grandTotal) || 0,
          avgCoveredPercent: Number(order.coverage?.coveredPercent) || 0,
          fullCount: order.coverageStatus === 'FULL' ? 1 : 0,
          partialCount: order.coverageStatus === 'PARTIAL' ? 1 : 0,
          noneCount: order.coverageStatus === 'NONE' ? 1 : 0,
          orders: [order],
        });
      } else {
        existing.totalOrders += 1;
        existing.totalAmount += Number(order.grandTotal) || 0;
        existing.avgCoveredPercent += Number(order.coverage?.coveredPercent) || 0;
        existing.fullCount += order.coverageStatus === 'FULL' ? 1 : 0;
        existing.partialCount += order.coverageStatus === 'PARTIAL' ? 1 : 0;
        existing.noneCount += order.coverageStatus === 'NONE' ? 1 : 0;
        existing.orders.push(order);
      }
    }

    return Array.from(grouped.values()).map((group) => ({
      ...group,
      avgCoveredPercent:
        group.totalOrders > 0 ? Math.round(group.avgCoveredPercent / group.totalOrders) : 0,
    }));
  }, [sortedOrders]);

  const totalOrdersCount = useMemo(
    () => (viewMode === 'customer' ? groupedCustomerOrders.length : sortedOrders.length),
    [viewMode, groupedCustomerOrders, sortedOrders]
  );
  const detail = activeOrderNumber ? detailByOrder[activeOrderNumber] || null : null;
  const isDetailLoading = Boolean(activeOrderNumber && detailLoadingOrder === activeOrderNumber);
  const visibleOrderNumbers = useMemo(() => {
    if (showAllOpenOrders) return openOrderNumbers;
    return activeOrderNumber ? [activeOrderNumber] : [];
  }, [showAllOpenOrders, openOrderNumbers, activeOrderNumber]);

  const fetchDispatchCatalog = async () => {
    setCatalogLoading(true);
    try {
      try {
        const result = await adminApi.getWarehouseDispatchCatalogAdmin();
        setDispatchDrivers(result.drivers || []);
        setDispatchVehicles(result.vehicles || []);
      } catch (adminError: any) {
        const status = Number(adminError?.response?.status || 0);
        if (status === 401 || status === 403) {
          const result = await adminApi.getWarehouseDispatchCatalog();
          setDispatchDrivers(result.drivers || []);
          setDispatchVehicles(result.vehicles || []);
        } else {
          throw adminError;
        }
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Sofor/arac katalogu alinamadi');
    } finally {
      setCatalogLoading(false);
    }
  };

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
  const getDeliveryDraft = (mikroOrderNumber: string) => (deliveryNoteDrafts[mikroOrderNumber] || '').trim();
  const getDriverDraft = (mikroOrderNumber: string) => (dispatchDriverDrafts[mikroOrderNumber] || '').trim();
  const getVehicleDraft = (mikroOrderNumber: string) => (dispatchVehicleDrafts[mikroOrderNumber] || '').trim();

  const loadOrderDetail = async (
    mikroOrderNumber: string,
    options?: { makeActive?: boolean; silent?: boolean }
  ) => {
    const makeActive = options?.makeActive !== false;
    const silent = options?.silent === true;

    if (makeActive) {
      setActiveOrderNumber(mikroOrderNumber);
    }
    // 5.6: Sessiz reconcile/yenilemede acik rezerve veya resim onizlemesini kapatma
    // (toplama sirasinda ekrani sifirlamamak icin); sadece kullanici acikca siparis secince temizle.
    if (!silent) {
      setOpenReservationKey(null);
      setPreviewImage(null);
    }
    setDetailLoadingOrder(mikroOrderNumber);
    setOpenOrderNumbers((prev) => (prev.includes(mikroOrderNumber) ? prev : [...prev, mikroOrderNumber]));
    try {
      const response = await adminApi.getWarehouseOrderDetail(mikroOrderNumber);
      setDetailByOrder((prev) => ({ ...prev, [mikroOrderNumber]: response }));
      setDeliveryNoteDrafts((prev) => ({
        ...prev,
        [mikroOrderNumber]:
          prev[mikroOrderNumber] ??
          response.workflow?.mikroDeliveryNoteNo ??
          '',
      }));
      setShelfDrafts((prev) => {
        const next = { ...prev };
        for (const line of response.lines) {
          const draftKey = getShelfDraftKey(mikroOrderNumber, line.lineKey);
          // 5.6: Sessiz reconcile'da kullanicinin yazmakta oldugu raf taslagini ezme;
          // sadece henuz taslagi olmayan satirlar icin sunucu degerini yaz.
          if (silent && draftKey in next) continue;
          next[draftKey] = line.shelfCode || '';
        }
        return next;
      });
      const selectedOrder = orders.find((order) => order.mikroOrderNumber === mikroOrderNumber);
      if (selectedOrder && !suggestedCustomerCodesRef.current.has(selectedOrder.customerCode)) {
        const siblingOrders = orders.filter(
          (order) =>
            order.customerCode === selectedOrder.customerCode &&
            order.mikroOrderNumber !== mikroOrderNumber &&
            (order.coverageStatus === 'FULL' || order.coverageStatus === 'PARTIAL') &&
            order.workflowStatus !== 'DISPATCHED' &&
            !openOrderNumbers.includes(order.mikroOrderNumber)
        );

        if (siblingOrders.length > 0) {
          suggestedCustomerCodesRef.current.add(selectedOrder.customerCode);
          toast((t) => (
            <div className="flex flex-col gap-2">
              <p className="font-semibold text-sm">
                {selectedOrder.customerName} icin {siblingOrders.length} ek siparis daha var.
              </p>
              <p className="text-xs text-slate-600">
                Ayni noktaya tekrar gitmemek icin diger siparisleri de acmak ister misiniz?
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold"
                  onClick={() => toast.dismiss(t.id)}
                >
                  Simdilik Hayir
                </button>
                <button
                  className="px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-xs font-semibold"
                  onClick={async () => {
                    toast.dismiss(t.id);
                    for (const sibling of siblingOrders) {
                      await loadOrderDetail(sibling.mikroOrderNumber, { makeActive: false, silent: true });
                    }
                    toast.success('Ayni musteriye ait diger siparisler de acildi');
                  }}
                >
                  Hepsini Ac
                </button>
              </div>
            </div>
          ), { duration: 9000 });
        }
      }
    } catch (error: any) {
      if (!silent) {
        toast.error(error.response?.data?.error || 'Siparis detayi yuklenemedi');
      }
    } finally {
      setDetailLoadingOrder((prev) => (prev === mikroOrderNumber ? null : prev));
    }
  };

  const refreshWithSync = async () => {
    await withAction(async () => {
      const result = await adminApi.syncWarehouseOrders();
      await fetchOverview(true);
      if (activeOrderNumber) {
        await loadOrderDetail(activeOrderNumber, { makeActive: false, silent: true });
      }
      toast.success(`Senkron tamamlandi: ${result.ordersCount} siparis`);
    });
  };

  const createDriver = async () => {
    const firstName = newDriverFirstName.trim();
    const lastName = newDriverLastName.trim();
    const tcNo = newDriverTcNo.replace(/\D/g, '');
    if (!firstName || !lastName || tcNo.length !== 11) {
      toast.error('Sofor adi, soyadi ve 11 haneli TC gerekli');
      return;
    }
    await withAction(async () => {
      await adminApi.createWarehouseDriver({ firstName, lastName, tcNo, active: true });
      setNewDriverFirstName('');
      setNewDriverLastName('');
      setNewDriverTcNo('');
      await fetchDispatchCatalog();
      toast.success('Sofor eklendi');
    });
  };

  const toggleDriverActive = async (driver: DriverOption) => {
    await withAction(async () => {
      await adminApi.updateWarehouseDriver(driver.id, { active: !driver.active });
      await fetchDispatchCatalog();
      toast.success(driver.active ? 'Sofor pasife alindi' : 'Sofor aktive edildi');
    });
  };

  const removeDriver = async (driver: DriverOption) => {
    await withAction(async () => {
      await adminApi.deleteWarehouseDriver(driver.id);
      await fetchDispatchCatalog();
      toast.success('Sofor silindi');
    });
  };

  const createVehicle = async () => {
    const name = newVehicleName.trim();
    const plate = newVehiclePlate.trim().toUpperCase();
    if (!name || !plate) {
      toast.error('Arac adi ve plaka gerekli');
      return;
    }
    await withAction(async () => {
      await adminApi.createWarehouseVehicle({ name, plate, active: true });
      setNewVehicleName('');
      setNewVehiclePlate('');
      await fetchDispatchCatalog();
      toast.success('Arac eklendi');
    });
  };

  const toggleVehicleActive = async (vehicle: VehicleOption) => {
    await withAction(async () => {
      await adminApi.updateWarehouseVehicle(vehicle.id, { active: !vehicle.active });
      await fetchDispatchCatalog();
      toast.success(vehicle.active ? 'Arac pasife alindi' : 'Arac aktive edildi');
    });
  };

  const removeVehicle = async (vehicle: VehicleOption) => {
    await withAction(async () => {
      await adminApi.deleteWarehouseVehicle(vehicle.id);
      await fetchDispatchCatalog();
      toast.success('Arac silindi');
    });
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

  // 5.5: Toplanan/ek miktari UI'da aninda guncelle (Mikro'ya gitmeden optimistic).
  // Boylece her +/- tiklamasinda tum siparis detayi yeniden cekilmez.
  const applyOptimisticQty = (
    mikroOrderNumber: string,
    lineKey: string,
    field: 'pickedQty' | 'extraQty',
    value: number
  ) => {
    setDetailByOrder((prev) => {
      const current = prev[mikroOrderNumber];
      if (!current) return prev;
      const lines = current.lines.map((item) =>
        item.lineKey === lineKey ? { ...item, [field]: value } : item
      );
      return { ...prev, [mikroOrderNumber]: { ...current, lines } };
    });
  };

  // 5.5: Debounce'lanan miktari arka planda kaydet. Kayit sonrasi sadece bu satir icin
  // yeni bir bekleyen degisiklik yoksa detayi sessizce yenile (turetilmis alanlar guncellensin).
  const flushQtySave = async (
    mikroOrderNumber: string,
    lineKey: string,
    field: 'pickedQty' | 'extraQty',
    value: number
  ) => {
    const pendingKey = `${mikroOrderNumber}::${lineKey}::${field}`;
    delete pendingQtyRef.current[pendingKey];
    try {
      await adminApi.updateWarehouseItem(mikroOrderNumber, lineKey, { [field]: value });
      // Kayit bitti; bu siparis icin bekleyen baska bir miktar degisikligi yoksa
      // detayi sessizce reconcile et (reconcile tum satirlari degistirdiginden,
      // ayni sipariste bekleyen baska satir varsa optimistic deger korunsun diye atlanir).
      const orderPrefix = `${mikroOrderNumber}::`;
      const hasOtherPending =
        Object.keys(pendingQtyRef.current).some((key) => key.startsWith(orderPrefix)) ||
        Object.keys(qtyDebounceTimersRef.current).some((key) => key.startsWith(orderPrefix));
      if (!hasOtherPending) {
        await loadOrderDetail(mikroOrderNumber, { makeActive: false, silent: true });
        await fetchOverview(false);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Satir guncellenemedi');
      // Hata olursa optimistic deger gercek veriyle eslesmeyebilir; detayi geri al.
      await loadOrderDetail(mikroOrderNumber, { makeActive: false, silent: true });
    } finally {
      setActiveInputCount((count) => Math.max(0, count - 1));
    }
  };

  // 5.5: +/- tiklamalarini optimistic uygula + 600ms debounce ile tek seferde kaydet.
  const queueQtyChange = (
    mikroOrderNumber: string,
    line: WarehouseOrderDetail['lines'][number],
    field: 'pickedQty' | 'extraQty',
    value: number
  ) => {
    const pendingKey = `${mikroOrderNumber}::${line.lineKey}::${field}`;
    applyOptimisticQty(mikroOrderNumber, line.lineKey, field, value);
    // Yeni bekleyen degisiklik varsa: onceki debounce zamanlayicisini sifirla.
    const hadPending = Boolean(qtyDebounceTimersRef.current[pendingKey]);
    if (hadPending) {
      clearTimeout(qtyDebounceTimersRef.current[pendingKey]);
    } else {
      // Bekleyen kayit basladi -> otomatik yenilemeyi duraklat (5.6).
      setActiveInputCount((count) => count + 1);
    }
    pendingQtyRef.current[pendingKey] = { mikroOrderNumber, lineKey: line.lineKey, field, value };
    qtyDebounceTimersRef.current[pendingKey] = setTimeout(() => {
      delete qtyDebounceTimersRef.current[pendingKey];
      const latest = pendingQtyRef.current[pendingKey]?.value ?? value;
      void flushQtySave(mikroOrderNumber, line.lineKey, field, latest);
    }, 600);
  };

  // 5.5: Bekleyen +/- degisikligini iptal et (qtyPad/Tamami gibi mutlak deger yazan islemlerde,
  // debounce'lanan kaydin sonradan mutlak degeri ezmesini onlemek icin).
  const cancelPendingQty = (mikroOrderNumber: string, lineKey: string) => {
    for (const field of ['pickedQty', 'extraQty'] as const) {
      const pendingKey = `${mikroOrderNumber}::${lineKey}::${field}`;
      const timer = qtyDebounceTimersRef.current[pendingKey];
      if (timer) {
        clearTimeout(timer);
        delete qtyDebounceTimersRef.current[pendingKey];
      }
      if (pendingQtyRef.current[pendingKey]) {
        delete pendingQtyRef.current[pendingKey];
        // Bu satir icin bekleyen kaydi iptal ettik -> duraklatma sayacini dusur (5.6).
        setActiveInputCount((count) => Math.max(0, count - 1));
      }
    }
  };

  // 5.5: Hizli pespese tiklamalarda dogru toplam icin son optimistic/bekleyen degeri taban al.
  const getCurrentQty = (
    mikroOrderNumber: string,
    line: WarehouseOrderDetail['lines'][number],
    field: 'pickedQty' | 'extraQty'
  ) => {
    const pendingKey = `${mikroOrderNumber}::${line.lineKey}::${field}`;
    const pending = pendingQtyRef.current[pendingKey];
    if (pending) return pending.value;
    return field === 'pickedQty' ? line.pickedQty : line.extraQty;
  };

  const changePicked = (
    mikroOrderNumber: string,
    line: WarehouseOrderDetail['lines'][number],
    diff: number
  ) => {
    const next = Math.max(0, getCurrentQty(mikroOrderNumber, line, 'pickedQty') + diff);
    queueQtyChange(mikroOrderNumber, line, 'pickedQty', next);
  };

  const changeExtra = (
    mikroOrderNumber: string,
    line: WarehouseOrderDetail['lines'][number],
    diff: number
  ) => {
    const next = Math.max(0, getCurrentQty(mikroOrderNumber, line, 'extraQty') + diff);
    queueQtyChange(mikroOrderNumber, line, 'extraQty', next);
  };

  const saveShelf = async (mikroOrderNumber: string, line: WarehouseOrderDetail['lines'][number]) => {
    const draftKey = getShelfDraftKey(mikroOrderNumber, line.lineKey);
    const draft = (shelfDrafts[draftKey] || '').trim();
    const current = (line.shelfCode || '').trim();
    if (draft === current) return;
    await updateLine(mikroOrderNumber, line, { shelfCode: draft || null }, 'Raf kodu guncellendi');
  };

  const handleCompleteLine = async (mikroOrderNumber: string, line: WarehouseOrderDetail['lines'][number]) => {
    const actionKey = getShelfDraftKey(mikroOrderNumber, line.lineKey);
    if (!confirmCompleteKeys[actionKey]) {
      setConfirmCompleteKeys((prev) => ({ ...prev, [actionKey]: true }));
      toast('Satiri toplandi yapmak icin beyaz Tamamladim butonuna tekrar basin', { duration: 3500 });
      return;
    }

    setConfirmCompleteKeys((prev) => {
      const next = { ...prev };
      delete next[actionKey];
      return next;
    });
    // 5.5: Bekleyen +/- kaydini iptal et; "Tamami" mutlak deger yazdigindan debounce ezmesin.
    cancelPendingQty(mikroOrderNumber, line.lineKey);
    await updateLine(mikroOrderNumber, line, { pickedQty: line.remainingQty });
  };

  const handleDispatchWithDeliveryNote = async (
    mikroOrderNumber: string,
    options?: { deliverySeries?: string; driverId?: string; vehicleId?: string }
  ) => {
    const deliverySeries = (options?.deliverySeries || getDeliveryDraft(mikroOrderNumber)).trim();
    const selectedDriver = activeDrivers.find((item) => item.id === (options?.driverId || getDriverDraft(mikroOrderNumber)));
    const selectedVehicle = activeVehicles.find((item) => item.id === (options?.vehicleId || getVehicleDraft(mikroOrderNumber)));
    if (!deliverySeries) {
      toast.error('Irsaliye serisi gerekli');
      return;
    }
    if (!selectedDriver || !selectedVehicle) {
      toast.error('Sofor ve arac secimi zorunlu');
      return;
    }

    try {
      await withAction(async () => {
        const result = await adminApi.markWarehouseDispatched(mikroOrderNumber, {
          deliverySeries,
          transport: {
            driverFirstName: selectedDriver.firstName,
            driverLastName: selectedDriver.lastName,
            driverTcNo: selectedDriver.tcNo,
            vehicleName: selectedVehicle.name,
            vehiclePlate: selectedVehicle.plate,
          },
        });
        const resolvedNo =
          result?.workflow?.mikroDeliveryNoteNo ||
          result?.mikroDeliveryNoteNo ||
          '';
        await refreshOrderDetail(mikroOrderNumber);
        if (resolvedNo) {
          setDeliveryNoteDrafts((prev) => ({ ...prev, [mikroOrderNumber]: deliverySeries }));
          if (options?.driverId) {
            setDispatchDriverDrafts((prev) => ({ ...prev, [mikroOrderNumber]: options.driverId as string }));
          }
          if (options?.vehicleId) {
            setDispatchVehicleDrafts((prev) => ({ ...prev, [mikroOrderNumber]: options.vehicleId as string }));
          }
        }
        if (options) {
          setDispatchModalOrderNumber(null);
        }
        toast.success(`Irsaliyelestirildi: ${resolvedNo}`);
      });
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Irsaliyelestirme basarisiz');
    }
  };

  const openDispatchModal = (mikroOrderNumber: string) => {
    setDispatchModalOrderNumber(mikroOrderNumber);
    setDispatchModalSeries(getDeliveryDraft(mikroOrderNumber));
    setDispatchModalDriverId(getDriverDraft(mikroOrderNumber));
    setDispatchModalVehicleId(getVehicleDraft(mikroOrderNumber));
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
    // 5.5: Bu siparis icin bekleyen miktar kayitlarini sekme kapanmadan once gonder (kayip olmasin).
    const prefix = `${mikroOrderNumber}::`;
    for (const pendingKey of Object.keys(pendingQtyRef.current)) {
      if (!pendingKey.startsWith(prefix)) continue;
      const timer = qtyDebounceTimersRef.current[pendingKey];
      if (timer) {
        clearTimeout(timer);
        delete qtyDebounceTimersRef.current[pendingKey];
      }
      const pending = pendingQtyRef.current[pendingKey];
      delete pendingQtyRef.current[pendingKey];
      setActiveInputCount((count) => Math.max(0, count - 1));
      if (pending) {
        // Detay siliniyor; reconcile fetch yapmadan sadece kaydi gonder.
        void adminApi
          .updateWarehouseItem(pending.mikroOrderNumber, pending.lineKey, { [pending.field]: pending.value })
          .catch(() => {});
      }
    }
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
    setConfirmCompleteKeys((prev) => {
      const next: Record<string, boolean> = {};
      const prefix = `${mikroOrderNumber}::`;
      for (const [key, value] of Object.entries(prev)) {
        if (!key.startsWith(prefix)) {
          next[key] = value;
        }
      }
      return next;
    });
    setDeliveryNoteDrafts((prev) => {
      const next = { ...prev };
      delete next[mikroOrderNumber];
      return next;
    });
    setDispatchDriverDrafts((prev) => {
      const next = { ...prev };
      delete next[mikroOrderNumber];
      return next;
    });
    setDispatchVehicleDrafts((prev) => {
      const next = { ...prev };
      delete next[mikroOrderNumber];
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

  const openSearchKeyboard = () => {
    if (isBarcodeMode) return;
    setKeyboardTarget({ type: 'search' });
    setKeyboardValue(searchText);
  };

  const openDeliveryKeyboard = (mikroOrderNumber: string) => {
    setKeyboardTarget({ type: 'delivery', orderNumber: mikroOrderNumber });
    setKeyboardValue(deliveryNoteDrafts[mikroOrderNumber] || '');
  };

  const openShelfKeyboard = (mikroOrderNumber: string, line: WarehouseOrderDetail['lines'][number]) => {
    const draftKey = getShelfDraftKey(mikroOrderNumber, line.lineKey);
    setKeyboardTarget({ type: 'shelf', orderNumber: mikroOrderNumber, lineKey: line.lineKey });
    setKeyboardValue(shelfDrafts[draftKey] ?? line.shelfCode ?? '');
  };

  const applyKeyboard = async () => {
    if (!keyboardTarget) return;
    if (keyboardTarget.type === 'search') {
      setSearchText(keyboardValue.trim());
      setKeyboardTarget(null);
      return;
    }

    if (keyboardTarget.type === 'delivery') {
      setDeliveryNoteDrafts((prev) => ({
        ...prev,
        [keyboardTarget.orderNumber]: keyboardValue.trim(),
      }));
      setKeyboardTarget(null);
      return;
    }

    const detailForOrder = detailByOrder[keyboardTarget.orderNumber];
    const line = detailForOrder?.lines.find((item) => item.lineKey === keyboardTarget.lineKey);
    const draftKey = getShelfDraftKey(keyboardTarget.orderNumber, keyboardTarget.lineKey);
    const nextShelf = keyboardValue.trim();
    setShelfDrafts((prev) => ({ ...prev, [draftKey]: nextShelf }));
    setKeyboardTarget(null);
    if (line) {
      await updateLine(keyboardTarget.orderNumber, line, { shelfCode: nextShelf || null }, 'Raf kodu guncellendi');
    }
  };

  const openQtyPad = (
    type: 'picked' | 'extra',
    mikroOrderNumber: string,
    line: WarehouseOrderDetail['lines'][number]
  ) => {
    setQtyPadTarget({
      type,
      mikroOrderNumber,
      lineKey: line.lineKey,
      value: String(type === 'picked' ? line.pickedQty : line.extraQty),
    });
  };

  const applyQtyPad = async () => {
    if (!qtyPadTarget) return;
    const parsed = Number(qtyPadTarget.value.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error('Miktar gecersiz');
      return;
    }

    const detailForOrder = detailByOrder[qtyPadTarget.mikroOrderNumber];
    const line = detailForOrder?.lines.find((item) => item.lineKey === qtyPadTarget.lineKey);
    if (!line) {
      setQtyPadTarget(null);
      return;
    }

    // 5.5: Numpad mutlak deger yazar; bekleyen +/- kaydini iptal et ki sonradan ezmesin.
    cancelPendingQty(qtyPadTarget.mikroOrderNumber, qtyPadTarget.lineKey);
    await updateLine(
      qtyPadTarget.mikroOrderNumber,
      line,
      qtyPadTarget.type === 'picked' ? { pickedQty: parsed } : { extraQty: parsed }
    );
    setQtyPadTarget(null);
  };

  const handleBarcodeOrderSearch = async () => {
    const token = searchText.trim().toUpperCase();
    if (!token) return;

    const exact = sortedOrders.find((order) => order.mikroOrderNumber.toUpperCase() === token);
    const startsWith = sortedOrders.filter((order) => order.mikroOrderNumber.toUpperCase().startsWith(token));
    const found = exact || (startsWith.length === 1 ? startsWith[0] : null);
    if (!found) {
      toast.error('Barkoddan siparis bulunamadi');
      return;
    }

    await loadOrderDetail(found.mikroOrderNumber);
    setSearchText('');
    setSearchDebounced('');
    setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  return {
    // router / auth / izin
    router,
    user,
    hasPermission,
    permissionsLoading,
    // veri
    series,
    orders,
    detailByOrder,
    isLoading,
    detailLoadingOrder,
    actionLoading,
    lineSavingKey,
    // filtre / siralama / gorunum / arama
    selectedSeries,
    setSelectedSeries,
    selectedStatus,
    setSelectedStatus,
    sortField,
    setSortField,
    sortDirection,
    setSortDirection,
    viewMode,
    setViewMode,
    searchText,
    setSearchText,
    searchDebounced,
    setSearchDebounced,
    // acik siparis sekmeleri / aktif
    openOrderNumbers,
    setOpenOrderNumbers,
    activeOrderNumber,
    setActiveOrderNumber,
    // raf / mod / fullscreen / gorunurluk
    shelfDrafts,
    setShelfDrafts,
    isPortrait,
    isKioskTouchMode,
    setIsKioskTouchMode,
    isBarcodeMode,
    setIsBarcodeMode,
    isDetailFullscreen,
    showAllOpenOrders,
    setShowAllOpenOrders,
    showCompletedLines,
    setShowCompletedLines,
    // dispatch modal
    dispatchModalOrderNumber,
    setDispatchModalOrderNumber,
    dispatchModalSeries,
    setDispatchModalSeries,
    dispatchModalDriverId,
    setDispatchModalDriverId,
    dispatchModalVehicleId,
    setDispatchModalVehicleId,
    // ust kontroller / rezerve / onizleme / resim hatasi
    showTopControls,
    setShowTopControls,
    openReservationKey,
    setOpenReservationKey,
    previewImage,
    setPreviewImage,
    reportingImageKey,
    reportedImageKeys,
    // irsaliye / sofor / arac taslaklari + onay
    deliveryNoteDrafts,
    setDeliveryNoteDrafts,
    dispatchDriverDrafts,
    setDispatchDriverDrafts,
    dispatchVehicleDrafts,
    setDispatchVehicleDrafts,
    confirmCompleteKeys,
    setConfirmCompleteKeys,
    // sofor/arac katalogu
    dispatchDrivers,
    dispatchVehicles,
    catalogLoading,
    newDriverFirstName,
    setNewDriverFirstName,
    newDriverLastName,
    setNewDriverLastName,
    newDriverTcNo,
    setNewDriverTcNo,
    newVehicleName,
    setNewVehicleName,
    newVehiclePlate,
    setNewVehiclePlate,
    showDispatchCatalogAdmin,
    setShowDispatchCatalogAdmin,
    // klavye / numpad
    keyboardTarget,
    setKeyboardTarget,
    keyboardValue,
    setKeyboardValue,
    qtyPadTarget,
    setQtyPadTarget,
    // ref'ler
    detailContainerRef,
    searchInputRef,
    // 5.6 duzenleme modu
    activeInputCount,
    setActiveInputCount,
    // turetilmis stiller / degerler
    layoutClass,
    actionButtonClass,
    activeDrivers,
    activeVehicles,
    sortedOrders,
    groupedCustomerOrders,
    totalOrdersCount,
    detail,
    isDetailLoading,
    visibleOrderNumbers,
    // handler'lar
    fetchDispatchCatalog,
    fetchOverview,
    getShelfDraftKey,
    getDeliveryDraft,
    getDriverDraft,
    getVehicleDraft,
    loadOrderDetail,
    refreshWithSync,
    createDriver,
    toggleDriverActive,
    removeDriver,
    createVehicle,
    toggleVehicleActive,
    removeVehicle,
    refreshOrderDetail,
    withAction,
    handleStartPicking,
    updateLine,
    applyOptimisticQty,
    flushQtySave,
    queueQtyChange,
    cancelPendingQty,
    getCurrentQty,
    changePicked,
    changeExtra,
    saveShelf,
    handleCompleteLine,
    handleDispatchWithDeliveryNote,
    openDispatchModal,
    reportImageIssue,
    toggleSeriesSelection,
    closeOrderTab,
    toggleDetailFullscreen,
    openSearchKeyboard,
    openDeliveryKeyboard,
    openShelfKeyboard,
    applyKeyboard,
    openQtyPad,
    applyQtyPad,
    handleBarcodeOrderSearch,
  };
}

export default useDepoKiosk;
