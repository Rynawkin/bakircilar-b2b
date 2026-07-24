'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { PendingOrderForAdmin } from '@/types';
import adminApi, { CommercialListFilterOptions } from '@/lib/api/admin';
import { formatCurrency, formatDate, formatDateShort } from '@/lib/utils/format';
import { getApiErrorMessage } from '@/lib/utils/apiError';
import { BRAND_ASSETS } from '@/lib/brand';
import {
  EMPTY_COMMERCIAL_LIST_FILTERS,
  type CommercialListFilterValues,
} from '@/components/admin/CommercialListFilters';
import * as XLSX from 'xlsx';

// Re-export tipler (Classic/New JSX'lerin ihtiyaci icin)
export type { PendingOrderForAdmin } from '@/types';

export type OrderStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
export type OrderSource = 'ALL' | 'CUSTOMER' | 'B2B';

// Sunucu-tarafli sayfalama sayfa boyutu
const ORDERS_PAGE_SIZE = 25;
const EMPTY_FILTER_OPTIONS: CommercialListFilterOptions = {
  sectors: [],
  creators: [],
  categories: [],
  brands: [],
};

const localDayBoundaryIso = (value: string, endOfDay = false) => {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date.toISOString();
};

/**
 * Siparisler ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 *
 * Sunucu-tarafli sayfalama: liste artik getAllOrders({ status, source, search, page, pageSize })
 * ile sunucudan sayfa sayfa cekilir. Eski client-side (allOrders) filtreleme/arama kaldirildi.
 */
export function useSiparisler() {
  const router = useRouter();
  const [orders, setOrders] = useState<PendingOrderForAdmin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // isLoading = sadece ILK yukleme (tam-ekran skeleton); isFetching = sonraki cekisler
  // (arama/sekme/sayfa). Boylece arama inputu unmount olmaz, odak kaybolmaz.
  const [isFetching, setIsFetching] = useState(false);
  const hasLoadedOnceRef = useRef(false);
  // 1) Varsayilan status artik 'ALL' (Tumu) — ilk fetch'te pending filtre yok
  const [activeTab, setActiveTab] = useState<OrderStatus>('ALL');
  const [sourceTab, setSourceTab] = useState<OrderSource>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState<CommercialListFilterValues>({
    ...EMPTY_COMMERCIAL_LIST_FILTERS,
  });
  const [debouncedFilters, setDebouncedFilters] = useState<CommercialListFilterValues>({
    ...EMPTY_COMMERCIAL_LIST_FILTERS,
  });
  const [filterOptions, setFilterOptions] = useState<CommercialListFilterOptions>(EMPTY_FILTER_OPTIONS);
  const [filterOptionsLoading, setFilterOptionsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const fetchRequestIdRef = useRef(0);

  // 3) Sunucu sayfalama state'i
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<{
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>({ total: 0, page: 1, pageSize: ORDERS_PAGE_SIZE, totalPages: 1 });

  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  // 3.9: Coklu secim ve toplu onay/red icin secili siparis id'leri
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  // Arama 350ms debounce; arama degisince page=1
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setDebouncedFilters(filters);
    }, 350);
    return () => clearTimeout(timer);
  }, [filters, searchTerm]);

  useEffect(() => {
    let active = true;
    setFilterOptionsLoading(true);
    adminApi.getOrderFilterOptions()
      .then((result) => {
        if (active) setFilterOptions(result);
      })
      .catch((error) => {
        console.error('Siparis filtre secenekleri yuklenemedi:', error);
      })
      .finally(() => {
        if (active) setFilterOptionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Arama/sekme/filtre degisince ilk sayfaya don
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(1);
  }, [
    activeTab,
    sourceTab,
    debouncedSearch,
    debouncedFilters.sectorCode,
    debouncedFilters.createdById,
    debouncedFilters.categoryId,
    debouncedFilters.brandCode,
    debouncedFilters.dateFrom,
    debouncedFilters.dateTo,
  ]);

  // status/source/arama/page degisince sunucudan yeniden cek
  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeTab,
    sourceTab,
    debouncedSearch,
    debouncedFilters.sectorCode,
    debouncedFilters.createdById,
    debouncedFilters.categoryId,
    debouncedFilters.brandCode,
    debouncedFilters.dateFrom,
    debouncedFilters.dateTo,
    page,
  ]);

  // 3.9: Sik kullanilan evrak serileri localStorage'da hatirlanir; onay diyaloglarinda otomatik doldurulur.
  const INVOICED_SERIES_KEY = 'orders.lastInvoicedSeries';
  const WHITE_SERIES_KEY = 'orders.lastWhiteSeries';

  const readStoredSeries = (key: string, fallback: string) => {
    if (typeof window === 'undefined') return fallback;
    try {
      const stored = window.localStorage.getItem(key);
      return stored && stored.trim() ? stored : fallback;
    } catch {
      return fallback;
    }
  };

  const writeStoredSeries = (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    try {
      const trimmed = value.trim();
      if (trimmed) window.localStorage.setItem(key, trimmed);
    } catch {
      // localStorage erisimi yoksa sessizce gec
    }
  };

  // Kaynak rozeti / yardimci icin korunur (backend ayni mantigi source param ile uygular)
  const isCustomerOrder = (order: PendingOrderForAdmin) => {
    return Boolean(order.customerRequest) || (!order.requestedBy && !order.sourceQuote);
  };

  // 2) Sunucu-tarafli veri cekme. status/source/arama/page sunucuya gonderilir;
  //    gosterilen liste = sunucu `orders`. Client-side filtreleme/arama YOK.
  const fetchOrders = async () => {
    const requestId = ++fetchRequestIdRef.current;
    const firstLoad = !hasLoadedOnceRef.current;
    if (firstLoad) setIsLoading(true);
    else setIsFetching(true);
    setLoadError('');
    try {
      const { orders: serverOrders, pagination: serverPagination } = await adminApi.getAllOrders({
        status: activeTab,
        source: sourceTab,
        search: debouncedSearch || undefined,
        sectorCode: debouncedFilters.sectorCode || undefined,
        createdById: debouncedFilters.createdById || undefined,
        categoryId: debouncedFilters.categoryId || undefined,
        brandCode: debouncedFilters.brandCode || undefined,
        dateFrom: localDayBoundaryIso(debouncedFilters.dateFrom),
        dateTo: localDayBoundaryIso(debouncedFilters.dateTo, true),
        page,
        pageSize: ORDERS_PAGE_SIZE,
      });
      if (requestId !== fetchRequestIdRef.current) return;
      setOrders(serverOrders);
      if (serverPagination) {
        setPagination(serverPagination);
      } else {
        // Sunucu pagination dondurmezse (beklenmeyen) en azindan gelen liste boyutuyla tek sayfa goster
        setPagination({
          total: serverOrders.length,
          page: 1,
          pageSize: ORDERS_PAGE_SIZE,
          totalPages: 1,
        });
      }
    } catch (error: any) {
      if (requestId !== fetchRequestIdRef.current) return;
      setLoadError(getApiErrorMessage(error, 'Siparisler yuklenemedi'));
      toast.error(getApiErrorMessage(error, 'Siparisler yuklenemedi'));
    } finally {
      if (requestId !== fetchRequestIdRef.current) return;
      hasLoadedOnceRef.current = true;
      setIsLoading(false);
      setIsFetching(false);
    }
  };

  // Liste artik dogrudan sunucu sayfasidir; client-side filtre/arama no-op (cift-filtre yok).
  const filteredOrders = orders;

  const toggleExpanded = (orderId: string) => {
    setExpandedOrders((prev) => {
      if (prev.has(orderId)) return new Set();
      return new Set([orderId]);
    });
  };

  const updateFilter = (key: keyof CommercialListFilterValues, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({ ...EMPTY_COMMERCIAL_LIST_FILTERS });
    setDebouncedFilters({ ...EMPTY_COMMERCIAL_LIST_FILTERS });
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const goToEdit = (order: PendingOrderForAdmin) => {
    router.push(`/quotes/new?mode=order&orderId=${encodeURIComponent(order.id)}`);
  };

  // 3.7: Onayli (APPROVED) siparis duzenlemesi gercek Mikro siparisini guncelledigi icin
  // duzenlemeye gecmeden once acik bir onay diyalogu goster. Bekleyen (PENDING) siparislerde
  // bu uyari cikmaz, dogrudan duzenlemeye gecilir.
  const openEdit = (order: PendingOrderForAdmin) => {
    if (order.status !== 'APPROVED') {
      goToEdit(order);
      return;
    }

    toast((t) => (
      <div className="flex flex-col gap-3 min-w-[320px]">
        <p className="font-semibold text-amber-700">Onayli siparis duzenleniyor</p>
        <p className="text-sm text-gray-700">
          Bu degisiklik Mikro&apos;daki gercek siparisi guncelleyecektir. Devam edilsin mi?
        </p>
        <div className="flex gap-2 justify-end pt-1">
          <button
            className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
            onClick={() => toast.dismiss(t.id)}
          >
            Vazgec
          </button>
          <button
            className="px-3 py-1 text-sm bg-amber-600 text-white rounded hover:bg-amber-700"
            onClick={() => {
              toast.dismiss(t.id);
              goToEdit(order);
            }}
          >
            Devam Et
          </button>
        </div>
      </div>
    ), {
      duration: Infinity,
    });
  };


  const calculateOrderTotals = (order: PendingOrderForAdmin) => {
    const subtotal = (order.items || []).reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0);
    const totalVat = (order.items || []).reduce((sum, item) => {
      if (item.priceType !== 'INVOICED' || item.vatZeroed === true) return sum;
      const hasItemVatRate =
        item.vatRate !== null && item.vatRate !== undefined && Number.isFinite(Number(item.vatRate));
      const hasProductVatRate =
        item.product?.vatRate !== null &&
        item.product?.vatRate !== undefined &&
        Number.isFinite(Number(item.product.vatRate));
      const rawVatRate = hasItemVatRate
        ? Number(item.vatRate)
        : hasProductVatRate
          ? Number(item.product?.vatRate)
          : 0.2;
      const vatRate = rawVatRate > 1 ? rawVatRate / 100 : Math.max(rawVatRate, 0);
      return sum + (Number(item.totalPrice) || 0) * vatRate;
    }, 0);
    const totalWithVat = subtotal + totalVat;
    return { subtotal, totalVat, totalWithVat };
  };

  const buildOrderPdf = async (order: PendingOrderForAdmin) => {
    const { default: jsPDF } = await import('jspdf');

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const PAGE_W = doc.internal.pageSize.getWidth();
    const PAGE_H = doc.internal.pageSize.getHeight();
    const MX = 12;
    const CW = PAGE_W - MX * 2;
    const BOTTOM_SAFE = PAGE_H - 40;
    const TOP_CONT = 26;

    const C = {
      navy: [21, 53, 107] as [number, number, number],
      navyDark: [16, 42, 85] as [number, number, number],
      blue: [31, 90, 168] as [number, number, number],
      cyan: [19, 153, 214] as [number, number, number],
      ink2: [22, 36, 61] as [number, number, number],
      muted: [93, 107, 132] as [number, number, number],
      soft: [63, 79, 107] as [number, number, number],
      faint: [147, 160, 181] as [number, number, number],
      faint2: [174, 184, 200] as [number, number, number],
      hair: [233, 237, 243] as [number, number, number],
      hair2: [238, 241, 246] as [number, number, number],
      panel: [246, 248, 251] as [number, number, number],
      panel2: [241, 245, 249] as [number, number, number],
      amberBg: [253, 249, 241] as [number, number, number],
      amberBorder: [240, 220, 192] as [number, number, number],
      amberInk: [185, 121, 31] as [number, number, number],
      amberSoft: [154, 123, 69] as [number, number, number],
      red: [180, 40, 59] as [number, number, number],
      green: [15, 122, 77] as [number, number, number],
      greenBg: [234, 244, 238] as [number, number, number],
      greenBorder: [207, 231, 216] as [number, number, number],
      white: [255, 255, 255] as [number, number, number],
    };

    const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
      }
      return btoa(binary);
    };
    const tryAddFont = async (path: string, vfsName: string, family: string, style: string) => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`font fetch failed: ${path}`);
      doc.addFileToVFS(vfsName, arrayBufferToBase64(await response.arrayBuffer()));
      doc.addFont(vfsName, family, style);
    };
    let SANS = 'helvetica';
    let MONO = 'courier';
    try {
      await tryAddFont('/fonts/HankenGrotesk-Regular.ttf', 'HankenGrotesk-Regular.ttf', 'Hanken', 'normal');
      await tryAddFont('/fonts/HankenGrotesk-Bold.ttf', 'HankenGrotesk-Bold.ttf', 'Hanken', 'bold');
      await tryAddFont('/fonts/IBMPlexMono-Regular.ttf', 'IBMPlexMono-Regular.ttf', 'PlexMono', 'normal');
      SANS = 'Hanken';
      MONO = 'PlexMono';
    } catch (error) {
      console.error('Sipariş PDF fontları gömülemedi, Helvetica kullanılacak:', error);
    }
    const embedded = SANS === 'Hanken';
    const T = (text: string | number | null | undefined) => {
      const value = String(text ?? '').replace(/\r?\n/g, ' ');
      if (embedded) return value;
      return value
        .replace(/ı/g, 'i').replace(/İ/g, 'I')
        .replace(/ş/g, 's').replace(/Ş/g, 'S')
        .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
        .replace(/ç/g, 'c').replace(/Ç/g, 'C')
        .replace(/ö/g, 'o').replace(/Ö/g, 'O')
        .replace(/ü/g, 'u').replace(/Ü/g, 'U');
    };
    const setFill = (color: [number, number, number]) => doc.setFillColor(...color);
    const setDraw = (color: [number, number, number]) => doc.setDrawColor(...color);
    const setText = (color: [number, number, number]) => doc.setTextColor(...color);
    const font = (style: 'normal' | 'bold', size: number, color: [number, number, number]) => {
      doc.setFont(SANS, style);
      doc.setFontSize(size);
      setText(color);
    };
    const monoFont = (size: number, color: [number, number, number]) => {
      doc.setFont(MONO, 'normal');
      doc.setFontSize(size);
      setText(color);
    };
    const formatCurrencyTL = (value?: number | null) => {
      const amount = Number.isFinite(value) ? Number(value) : 0;
      return `${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
    };
    const formatNumber = (value?: number | null) => {
      const amount = Number.isFinite(value) ? Number(value) : 0;
      return amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };
    const formatUnitPrice = (
      value: number,
      quantity: number,
      lineTotal: number,
      useDetailedPrecision: boolean
    ) => {
      const amount = Number.isFinite(value) ? value : 0;
      const targetTotal = Math.round((Number.isFinite(lineTotal) ? lineTotal : 0) * 100) / 100;
      const minimumDecimals = useDetailedPrecision ? 4 : 2;
      let decimals = minimumDecimals;
      while (decimals < 6) {
        const roundedPrice = Number(amount.toFixed(decimals));
        const displayedTotal = Math.round(roundedPrice * quantity * 100) / 100;
        if (Math.abs(displayedTotal - targetTotal) < 0.005) break;
        decimals += 1;
      }
      return amount.toLocaleString('tr-TR', {
        minimumFractionDigits: minimumDecimals,
        maximumFractionDigits: decimals,
      });
    };
    const formatQty = (value?: number | null) => {
      const amount = Number.isFinite(value) ? Number(value) : 0;
      return Number.isInteger(amount)
        ? amount.toLocaleString('tr-TR')
        : amount.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
    };
    const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const dateLong = (value?: string | Date | null) => {
      if (!value) return '-';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '-';
      return `${date.getDate()} ${TR_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
    };
    const dateShort = (value?: string | Date | null) => {
      if (!value) return '-';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '-';
      return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
    };

    const resolveImageUrl = (url?: string | null) => {
      if (!url) return null;
      if (url.startsWith('http://') || url.startsWith('https://')) return url;
      if (url.startsWith('/')) return `${window.location.origin}${url}`;
      return `${window.location.origin}/${url}`;
    };

    const loadImageData = async (url: string): Promise<string | null> => {
      try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const blob = await response.blob();
        return await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } catch (error) {
        return null;
      }
    };

    const getImageFormat = (dataUrl: string) => (dataUrl.includes('image/png') ? 'PNG' : 'JPEG');

    const getImageDimensions = (dataUrl: string): Promise<{ width: number; height: number } | null> =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const width = img.naturalWidth || img.width;
          const height = img.naturalHeight || img.height;
          if (!width || !height) {
            resolve(null);
            return;
          }
          resolve({ width, height });
        };
        img.onerror = () => resolve(null);
        img.src = dataUrl;
      });

    const fitWithin = (width: number, height: number, maxWidth: number, maxHeight: number) => {
      if (!width || !height) {
        return { width: maxWidth, height: maxHeight };
      }
      const ratio = width / height;
      let fittedWidth = maxWidth;
      let fittedHeight = fittedWidth / ratio;
      if (fittedHeight > maxHeight) {
        fittedHeight = maxHeight;
        fittedWidth = fittedHeight * ratio;
      }
      return { width: fittedWidth, height: fittedHeight };
    };

    type PdfImage = { data: string; format: 'PNG' | 'JPEG'; w: number; h: number } | null;
    type PdfOrderItem = PendingOrderForAdmin['items'][number] & {
      product?: { name?: string | null; imageUrl?: string | null; vatRate?: number | null; unit?: string | null } | null;
      isGift?: boolean;
      status?: 'PENDING' | 'APPROVED' | 'REJECTED';
      approvedQuantity?: number | null;
      rejectionReason?: string | null;
      vatRate?: number | null;
      vatZeroed?: boolean;
    };
    type ItemRecord = {
      item: PdfOrderItem;
      no: number;
      quantity: number;
      lineTotal: number;
      isGift: boolean;
      isRejected: boolean;
    };
    const loadImg = async (path?: string | null): Promise<PdfImage> => {
      const url = resolveImageUrl(path);
      if (!url) return null;
      const data = await loadImageData(url);
      if (!data) return null;
      const dimensions = await getImageDimensions(data);
      return {
        data,
        format: getImageFormat(data) as 'PNG' | 'JPEG',
        w: dimensions?.width || 1,
        h: dimensions?.height || 1,
      };
    };

    const rawItems = (order.items || []) as PdfOrderItem[];
    const invoicedItems = rawItems.filter((item) => item.priceType === 'INVOICED');
    const whiteItems = rawItems.filter((item) => item.priceType === 'WHITE');
    const isMixed = invoicedItems.length > 0 && whiteItems.length > 0;
    const orderedItems = isMixed ? [...invoicedItems, ...whiteItems] : rawItems;
    const records: ItemRecord[] = orderedItems.map((item, index) => {
      const sourceQuantity = Number(item.quantity) || 0;
      const hasApprovedQuantity =
        item.approvedQuantity !== null &&
        item.approvedQuantity !== undefined &&
        Number.isFinite(Number(item.approvedQuantity));
      const approvedQuantity = hasApprovedQuantity ? Number(item.approvedQuantity) : Number.NaN;
      const quantity =
        item.status === 'APPROVED' && hasApprovedQuantity && approvedQuantity >= 0
          ? approvedQuantity
          : sourceQuantity;
      const sourceTotal = Number(item.totalPrice);
      const lineTotal =
        Number.isFinite(sourceTotal) && sourceQuantity > 0
          ? sourceTotal * (quantity / sourceQuantity)
          : (Number(item.unitPrice) || 0) * quantity;
      return {
        item,
        no: index + 1,
        quantity,
        lineTotal,
        isGift: item.isGift === true,
        isRejected: item.status === 'REJECTED',
      };
    });
    const invoicedRecords = records.filter((record) => record.item.priceType === 'INVOICED');
    const whiteRecords = records.filter((record) => record.item.priceType === 'WHITE');
    const billableTotal = (list: ItemRecord[]) => list.reduce(
      (sum, record) => sum + (record.isGift || record.isRejected ? 0 : record.lineTotal),
      0
    );
    const invoicedSubtotal = billableTotal(invoicedRecords);
    const whiteSubtotal = billableTotal(whiteRecords);
    const subtotal = invoicedSubtotal + whiteSubtotal;

    const vatGroups = new Map<number, { base: number; vat: number }>();
    invoicedRecords.forEach((record) => {
      if (record.isGift || record.isRejected || record.item.vatZeroed === true) return;
      const itemVat = record.item.vatRate;
      const productVat = record.item.product?.vatRate;
      const rawRate = typeof itemVat === 'number' && Number.isFinite(itemVat)
        ? itemVat
        : typeof productVat === 'number' && Number.isFinite(productVat)
          ? productVat
          : 0.2;
      const normalizedRate = rawRate > 1 ? rawRate / 100 : Math.max(rawRate, 0);
      const percent = Math.round(normalizedRate * 100);
      if (percent <= 0) return;
      const current = vatGroups.get(percent) || { base: 0, vat: 0 };
      current.base += record.lineTotal;
      current.vat += record.lineTotal * normalizedRate;
      vatGroups.set(percent, current);
    });
    const vatLines = Array.from(vatGroups.entries())
      .map(([percent, value]) => ({ percent, ...value }))
      .sort((a, b) => b.percent - a.percent);
    const totalVat = vatLines.reduce((sum, line) => sum + line.vat, 0);
    const grandTotal = subtotal + totalVat;
    const customerName = order.user?.mikroName || order.user?.displayName || order.user?.name || '-';
    const customerCode = order.user?.mikroCariCode || '-';
    const customerType = order.user?.customerType || '';
    const contactName = order.customerRequest?.requestedBy?.name || order.user?.displayName || order.user?.name || '-';
    const preparedByName = order.requestedBy?.name || 'Bakırcılar Ambalaj Sipariş Ekibi';
    const preparedByEmail = order.requestedBy?.email || 'info@bakircilarambalaj.com';
    let customerPhone = order.user?.phone || '-';
    const hasPaymentTerm =
      order.user?.paymentTerm !== null &&
      order.user?.paymentTerm !== undefined &&
      Number.isFinite(Number(order.user.paymentTerm));
    const paymentTerm = hasPaymentTerm ? Number(order.user?.paymentTerm) : Number.NaN;
    let paymentLabel =
      order.user?.paymentPlanName ||
      order.user?.paymentPlanCode ||
      (hasPaymentTerm && paymentTerm >= 0 ? `${paymentTerm} GÜN VADE` : '-');
    const snapshotBalance = order.user?.balance;
    let cari: { total: number; pastDue: number | null } | null =
      snapshotBalance !== null && snapshotBalance !== undefined && Number.isFinite(Number(snapshotBalance))
        ? { total: Number(snapshotBalance) || 0, pastDue: null }
        : null;
    try {
      const search = customerCode !== '-' ? customerCode : customerName;
      if (search && search !== '-') {
        const response = await adminApi.getVadeBalances({ search, limit: 20 });
        const matches = response?.balances || [];
        const userId = String(order.user?.id || '');
        const match =
          matches.find((entry) => userId && entry.user?.id === userId) ||
          matches.find((entry) => customerCode !== '-' && entry.user?.mikroCariCode === customerCode) ||
          (matches.length === 1 ? matches[0] : null);
        if (match) {
          cari = { total: Number(match.totalBalance) || 0, pastDue: Number(match.pastDueBalance) || 0 };
          customerPhone = match.user?.phone || customerPhone;
          paymentLabel =
            match.paymentTermLabel ||
            match.user?.paymentPlanName ||
            match.user?.paymentPlanCode ||
            paymentLabel;
        }
      }
    } catch (error) {
      console.error('Sipariş PDF cari/vade bilgisi alınamadı:', error);
    }

    let recommendations: Array<{ mikroCode: string; name: string; imageUrl?: string | null }> = [];
    try {
      const productCodes = Array.from(new Set(
        records
          .filter((record) => !record.isGift && !record.isRejected)
          .map((record) => String(record.item.mikroCode || '').trim())
          .filter(Boolean)
      ));
      if (productCodes.length > 0) {
        const response = await adminApi.getComplementRecommendations({
          productCodes,
          excludeCodes: productCodes,
          limit: 8,
        });
        recommendations = (response?.products || []).slice(0, 8).map((product: any) => ({
          mikroCode: String(product.mikroCode || product.productCode || ''),
          name: String(product.name || product.productName || '-'),
          imageUrl: product.imageUrl || null,
        }));
      }
    } catch (error) {
      console.error('Sipariş PDF tamamlayıcı ürünleri alınamadı:', error);
    }

    const [logo, mascotPoint, mascotThumb, itemImages, recommendationImages] = await Promise.all([
      loadImg(BRAND_ASSETS.logos.horizontal.blue),
      loadImg(BRAND_ASSETS.mascot.pointing),
      loadImg(BRAND_ASSETS.mascot.thumbsUp),
      Promise.all(records.map((record) => loadImg(record.item.product?.imageUrl || null))),
      Promise.all(recommendations.map((product) => loadImg(product.imageUrl || null))),
    ]);

    const IBANS = [
      { bank: 'Ziraat Bankası', branch: 'Hendek', iban: 'TR42 0001 0000 2053 9031 7150 01' },
      { bank: 'Yapı Kredi', branch: 'Erenler', iban: 'TR90 0006 7010 0000 0083 9998 96' },
    ];
    const COMPANY = {
      name: 'BAKIRCILAR AMBALAJ END. - TEM VE KIRTASİYE',
      line1: 'Merkez: Rasimpaşa Mah. Atatürk Blv. No:69/A Hendek / Sakarya',
      line2: 'Şube: Topça Toptancılar Çarşısı A Blok No:20 - Erenler / Sakarya',
      line3: 'Tel: 0264 614 67 77 · Faks: 0264 614 66 60 · info@bakircilarambalaj.com · www.bakircilargrup.com',
      paymentName: 'Bakırcılar Ambalaj End. Tem. ve Kırt.',
    };

    const drawHorizontalGradient = (
      x: number,
      top: number,
      width: number,
      height: number,
      start: [number, number, number],
      end: [number, number, number],
      segments = 40
    ) => {
      for (let i = 0; i < segments; i++) {
        const ratio = i / (segments - 1);
        doc.setFillColor(
          Math.round(start[0] + (end[0] - start[0]) * ratio),
          Math.round(start[1] + (end[1] - start[1]) * ratio),
          Math.round(start[2] + (end[2] - start[2]) * ratio)
        );
        doc.rect(x + (width / segments) * i, top, width / segments + 0.3, height, 'F');
      }
    };
    const drawImageBox = (image: PdfImage, x: number, top: number, width: number, height: number, radius: number) => {
      setFill(C.panel2);
      doc.roundedRect(x, top, width, height, radius, radius, 'F');
      if (!image) return;
      const padding = 1.5;
      const fitted = fitWithin(image.w, image.h, width - padding * 2, height - padding * 2);
      doc.addImage(
        image.data,
        image.format,
        x + (width - fitted.width) / 2,
        top + (height - fitted.height) / 2,
        fitted.width,
        fitted.height
      );
    };
    const drawBackground = () => {
      if (logo) {
        try {
          (doc as any).saveGraphicsState?.();
          (doc as any).setGState?.(new (doc as any).GState({ opacity: 0.05 }));
          const watermarkWidth = 150;
          const watermarkHeight = (logo.h / logo.w) * watermarkWidth;
          doc.addImage(
            logo.data,
            logo.format,
            (PAGE_W - watermarkWidth) / 2,
            (PAGE_H - watermarkHeight) / 2,
            watermarkWidth,
            watermarkHeight
          );
          (doc as any).restoreGraphicsState?.();
        } catch {
          // Eski jsPDF sürümlerinde opacity desteği yoksa filigran atlanır.
        }
      }
      const bands = 60;
      for (let i = 0; i < bands; i++) {
        const ratio = i / (bands - 1);
        doc.setFillColor(
          Math.round(C.navy[0] + (C.cyan[0] - C.navy[0]) * ratio),
          Math.round(C.navy[1] + (C.cyan[1] - C.navy[1]) * ratio),
          Math.round(C.navy[2] + (C.cyan[2] - C.navy[2]) * ratio)
        );
        doc.rect(0, (PAGE_H / bands) * i, 2, PAGE_H / bands + 0.3, 'F');
      }
    };

    let y = 0;
    const newPage = () => {
      doc.addPage();
      drawBackground();
      y = TOP_CONT;
    };
    const ensureSpace = (height: number) => {
      if (y + height <= BOTTOM_SAFE) return false;
      newPage();
      return true;
    };

    drawBackground();
    const mastheadHeight = 30;
    drawHorizontalGradient(0, 0, PAGE_W, mastheadHeight, C.navyDark, C.blue);
    if (logo) {
      const logoBoxX = MX;
      const logoBoxY = 6;
      const logoBoxW = 54;
      const logoBoxH = 18;
      setFill(C.white);
      doc.roundedRect(logoBoxX, logoBoxY, logoBoxW, logoBoxH, 3, 3, 'F');
      const logoSize = fitWithin(logo.w, logo.h, logoBoxW - 8, logoBoxH - 7);
      doc.addImage(
        logo.data,
        logo.format,
        logoBoxX + (logoBoxW - logoSize.width) / 2,
        logoBoxY + (logoBoxH - logoSize.height) / 2,
        logoSize.width,
        logoSize.height
      );
    }
    font('bold', 17, C.white);
    doc.text(T('SİPARİŞ PROFORMA'), PAGE_W - MX, 13, { align: 'right' });
    monoFont(9.5, [174, 199, 232]);
    doc.text(T(order.orderNumber || '-'), PAGE_W - MX, 20, { align: 'right' });

    const factsTop = mastheadHeight;
    const factsHeight = 14;
    setFill(C.panel);
    doc.rect(0, factsTop, PAGE_W, factsHeight, 'F');
    setDraw(C.hair);
    doc.line(0, factsTop + factsHeight, PAGE_W, factsTop + factsHeight);
    const facts: Array<[string, string]> = [
      ['SİPARİŞ TARİHİ', dateLong(order.createdAt)],
      ['BELGE NO (PO)', order.customerOrderNumber || '-'],
      ['VADE', paymentLabel],
      ['KAPSAM', `${records.length} kalem`],
    ];
    const factWidth = CW / facts.length;
    facts.forEach(([label, value], index) => {
      const x = MX + factWidth * index;
      font('bold', 7, C.faint);
      doc.text(T(label), x, factsTop + 5.5);
      font('bold', 9.2, C.ink2);
      doc.text(T(value), x, factsTop + 10.5, { maxWidth: factWidth - 5 });
      if (index > 0) {
        setDraw([225, 231, 240]);
        doc.line(x - 3, factsTop + 3, x - 3, factsTop + 11);
      }
    });

    y = factsTop + factsHeight + 8;
    const halfWidth = CW / 2;
    font('bold', 8, C.navy);
    doc.text(T('MÜŞTERİ'), MX, y);
    doc.text(T('HAZIRLAYAN'), MX + halfWidth + 6, y);
    setDraw(C.hair2);
    doc.line(MX + halfWidth, y - 4, MX + halfWidth, y + 23);
    y += 6;
    font('bold', 11.5, C.ink2);
    doc.text(T(customerName), MX, y, { maxWidth: halfWidth - 8 });
    doc.text(T(preparedByName), MX + halfWidth + 6, y, { maxWidth: halfWidth - 8 });
    y += 5;
    font('normal', 8.5, C.muted);
    const contactSuffix = customerType ? ` · ${customerType}` : '';
    doc.text(T(`İlgili: ${contactName}${contactSuffix}`), MX, y, { maxWidth: halfWidth - 8 });
    doc.text(T('Bakırcılar Ambalaj · Satış'), MX + halfWidth + 6, y, { maxWidth: halfWidth - 8 });
    y += 4.2;
    doc.text(T(`${customerPhone} · ${order.user?.email || '-'}`), MX, y, { maxWidth: halfWidth - 8 });
    doc.text(T(`${order.requestedBy?.phone || '0264 614 67 77'} · ${preparedByEmail}`), MX + halfWidth + 6, y, { maxWidth: halfWidth - 8 });
    y += 4.2;
    monoFont(7.5, C.faint);
    doc.text(T(`Cari: ${customerCode}`), MX, y, { maxWidth: halfWidth - 8 });
    y += 7;

    const approvalText = order.approvedAt
      ? `Onaylandı · ${dateShort(order.approvedAt)}`
      : order.status === 'REJECTED'
        ? `Reddedildi${order.rejectedAt ? ` · ${dateShort(order.rejectedAt)}` : ''}`
        : 'Onay bekliyor';
    const metaFields: Array<[string, string, boolean]> = [
      ['TESLİMAT', order.deliveryLocation || '-', false],
      ...(order.sourceQuote?.quoteNumber
        ? [['KAYNAK TEKLİF', order.sourceQuote.quoteNumber, true] as [string, string, boolean]]
        : []),
      ['ONAY', approvalText, false],
    ];
    const metaHeight = 17;
    setFill(C.panel);
    setDraw(C.hair);
    doc.roundedRect(MX, y, CW, metaHeight, 3, 3, 'FD');
    const metaWidth = CW / metaFields.length;
    metaFields.forEach(([label, value, useMono], index) => {
      const x = MX + metaWidth * index;
      if (index > 0) {
        setDraw([229, 233, 240]);
        doc.line(x, y + 3, x, y + metaHeight - 3);
      }
      font('bold', 6.8, C.faint);
      doc.text(T(label), x + 4, y + 5.5);
      if (useMono) monoFont(8.4, C.ink2);
      else font('bold', 8.5, C.ink2);
      doc.text(T(value), x + 4, y + 11.5, { maxWidth: metaWidth - 8 });
    });
    y += metaHeight + 8;

    const columns = {
      no: MX,
      noW: 8,
      name: MX + 8,
      nameW: 70,
      image: MX + 78,
      imageW: 20,
      quantity: MX + 98,
      quantityW: 26,
      price: MX + 124,
      priceW: 28,
      total: MX + 152,
      totalW: 34,
    };
    type OrderGroup = {
      title: string;
      records: ItemRecord[];
      subtotal: number;
      mikroId: string;
      tone: 'navy' | 'slate';
      descriptor: string;
      subtotalLabel: string;
    };
    const collectMikroIds = (list: ItemRecord[], useOrderFallback = false) => {
      const itemIds = list
        .map((record) => String(record.item.mikroOrderId || '').trim())
        .filter(Boolean);
      const fallbackIds = useOrderFallback
        ? (order.mikroOrderIds || []).map((value) => String(value || '').trim()).filter(Boolean)
        : [];
      return Array.from(new Set(itemIds.length > 0 ? itemIds : fallbackIds));
    };
    const summarizeMikroIds = (ids: string[]) => {
      if (ids.length === 0) return 'Bekliyor';
      if (ids.length <= 2) return ids.join(' / ');
      return `${ids.slice(0, 2).join(' / ')} +${ids.length - 2}`;
    };
    const invoicedMikroIds = collectMikroIds(invoicedRecords);
    const whiteMikroIds = collectMikroIds(whiteRecords);
    const bothMixedGroupsWritten = invoicedMikroIds.length > 0 && whiteMikroIds.length > 0;
    const groups: OrderGroup[] = isMixed
      ? [
          {
            title: 'FATURALI SİPARİŞ',
            records: invoicedRecords,
            subtotal: invoicedSubtotal,
            mikroId: summarizeMikroIds(invoicedMikroIds),
            tone: 'navy',
            descriptor: `KDV'li · ${invoicedRecords.length} kalem`,
            subtotalLabel: 'Faturalı ara toplam',
          },
          {
            title: 'BEYAZ SİPARİŞ',
            records: whiteRecords,
            subtotal: whiteSubtotal,
            mikroId: summarizeMikroIds(whiteMikroIds),
            tone: 'slate',
            descriptor: `KDV'siz · ${whiteRecords.length} kalem`,
            subtotalLabel: 'Beyaz ara toplam',
          },
        ]
      : [
          {
            title: 'SİPARİŞ KALEMLERİ',
            records,
            subtotal,
            mikroId: summarizeMikroIds(collectMikroIds(records, true)),
            tone: 'navy',
            descriptor: `${records.length} kalem`,
            subtotalLabel: 'Ara toplam',
          },
        ];

    const drawGroupHeader = (group: OrderGroup, continued = false) => {
      const startColor = group.tone === 'slate' ? C.soft : C.navyDark;
      const endColor = group.tone === 'slate' ? C.muted : C.blue;
      drawHorizontalGradient(MX, y, CW, 9.5, startColor, endColor, 36);
      font('bold', 8.8, C.white);
      const groupTitle = `${group.title}${continued ? ' · DEVAM' : ''}`;
      doc.text(T(groupTitle), MX + 4, y + 6);
      const titleWidth = doc.getTextWidth(T(groupTitle));
      monoFont(7.4, group.tone === 'slate' ? [215, 222, 232] : [174, 199, 232]);
      doc.text(T(`Mikro: ${group.mikroId}`), MX + 6 + titleWidth, y + 6, { maxWidth: 56 });
      font('normal', 7.3, group.tone === 'slate' ? [215, 222, 232] : [174, 199, 232]);
      doc.text(T(group.descriptor), MX + CW - 43, y + 5.8, { align: 'right' });
      font('bold', 9.2, C.white);
      doc.text(formatCurrencyTL(group.subtotal), MX + CW - 4, y + 6, { align: 'right' });
      y += 14;
      const headerColor = group.tone === 'slate' ? C.muted : C.navy;
      font('bold', 7.2, headerColor);
      doc.text('#', columns.no + columns.noW / 2, y, { align: 'center' });
      doc.text(T('ÜRÜN'), columns.name, y);
      doc.text(T('GÖRSEL'), columns.image + columns.imageW / 2, y, { align: 'center' });
      doc.text(T('MİKTAR'), columns.quantity + columns.quantityW, y, { align: 'right' });
      doc.text(T('BİRİM FİYAT'), columns.price + columns.priceW, y, { align: 'right' });
      doc.text(T('TOPLAM'), columns.total + columns.totalW, y, { align: 'right' });
      y += 2.5;
      setDraw(headerColor);
      doc.setLineWidth(0.55);
      doc.line(MX, y, MX + CW, y);
      doc.setLineWidth(0.2);
      y += 4;
    };
    const displayAmounts = (record: ItemRecord) => {
      const item = record.item;
      const mainUnit = String(item.unit || item.product?.unit || '').trim();
      const selectedUnit = String(item.selectedUnit || mainUnit).trim();
      const factor = Number(item.unit2Factor);
      const usesSubUnit =
        selectedUnit &&
        mainUnit &&
        selectedUnit.toLocaleUpperCase('tr-TR') !== mainUnit.toLocaleUpperCase('tr-TR') &&
        Number.isFinite(factor) &&
        factor > 0;
      return {
        quantity: usesSubUnit ? record.quantity * factor : record.quantity,
        unit: selectedUnit || mainUnit,
        unitPrice: usesSubUnit ? (Number(item.unitPrice) || 0) / factor : Number(item.unitPrice) || 0,
        usesSubUnit,
      };
    };

    groups.forEach((group, groupIndex) => {
      ensureSpace(43);
      drawGroupHeader(group);
      group.records.forEach((record) => {
        const item = record.item;
        const nameLines = doc.splitTextToSize(T(item.productName || item.product?.name || '-'), columns.nameW) as string[];
        const metaBits = [String(item.mikroCode || '').trim()];
        if (item.lineNote) metaBits.push(String(item.lineNote).trim());
        if (record.isGift) metaBits.push('KAMPANYA HEDİYESİ');
        if (record.isRejected) metaBits.push(`REDDEDİLDİ${item.rejectionReason ? `: ${item.rejectionReason}` : ''}`);
        else if (order.status === 'PENDING' && item.status === 'APPROVED') {
          const sourceQuantity = Number(item.quantity);
          const approvedQuantity = Number(item.approvedQuantity);
          const isPartialApproval =
            item.approvedQuantity !== null &&
            item.approvedQuantity !== undefined &&
            Number.isFinite(sourceQuantity) &&
            Number.isFinite(approvedQuantity) &&
            approvedQuantity < sourceQuantity;
          metaBits.push(isPartialApproval ? 'KISMİ ONAY' : 'ONAYLANDI');
        }
        else if (order.status === 'PENDING' && item.status === 'PENDING') metaBits.push('ONAY BEKLİYOR');
        const metaText = T(metaBits.filter(Boolean).join(' · '));
        monoFont(7.2, C.faint);
        const metaLines = metaText ? (doc.splitTextToSize(metaText, columns.nameW) as string[]) : [];
        const nameHeight = nameLines.length * 4 + metaLines.length * 3.2;
        const rowHeight = Math.max(nameHeight + 5, 20);
        if (y + rowHeight > BOTTOM_SAFE) {
          newPage();
          drawGroupHeader(group, true);
        }
        const rowTop = y;
        const centerY = rowTop + rowHeight / 2;
        monoFont(9.5, C.faint2);
        doc.text(String(record.no), columns.no + columns.noW / 2, centerY + 1, { align: 'center' });
        font('bold', 10.2, record.isRejected ? C.red : C.ink2);
        let textY = rowTop + (rowHeight - nameHeight) / 2 + 3;
        nameLines.forEach((line) => {
          doc.text(line, columns.name, textY);
          textY += 4;
        });
        monoFont(7.2, record.isRejected ? C.red : C.faint);
        metaLines.forEach((line) => {
          doc.text(line, columns.name, textY);
          textY += 3.2;
        });
        drawImageBox(itemImages[record.no - 1], columns.image + 2, centerY - 8, 16, 16, 2.2);
        const amounts = displayAmounts(record);
        const quantityText = formatQty(amounts.quantity);
        if (amounts.unit) {
          font('normal', 7.5, C.faint);
          const unitText = T(amounts.unit);
          doc.text(unitText, columns.quantity + columns.quantityW, centerY + 1, { align: 'right' });
          const unitWidth = doc.getTextWidth(unitText);
          font('normal', 9.8, C.soft);
          doc.text(quantityText, columns.quantity + columns.quantityW - unitWidth - 1.2, centerY + 1, { align: 'right' });
        } else {
          font('normal', 9.8, C.soft);
          doc.text(quantityText, columns.quantity + columns.quantityW, centerY + 1, { align: 'right' });
        }
        if (record.isGift) {
          font('bold', 8.8, C.green);
          doc.text(T('HEDİYE'), columns.total + columns.totalW, centerY + 1, { align: 'right' });
        } else if (record.isRejected) {
          font('bold', 8.2, C.red);
          doc.text(T('REDDEDİLDİ'), columns.total + columns.totalW, centerY + 1, { align: 'right' });
        } else {
          font('normal', 9.5, C.ink2);
          doc.text(
            formatUnitPrice(amounts.unitPrice, amounts.quantity, record.lineTotal, Boolean(amounts.usesSubUnit)),
            columns.price + columns.priceW,
            centerY + 1,
            { align: 'right' }
          );
          font('bold', 9.5, C.ink2);
          doc.text(formatNumber(record.lineTotal), columns.total + columns.totalW, centerY + 1, { align: 'right' });
        }
        setDraw(C.hair2);
        doc.line(MX, rowTop + rowHeight, MX + CW, rowTop + rowHeight);
        y = rowTop + rowHeight;
      });
      if (group.records.length === 0) {
        font('normal', 9, C.muted);
        doc.text(T('Bu bölümde sipariş kalemi bulunmuyor.'), MX, y + 5);
        y += 10;
      }
      if (y + 9 > BOTTOM_SAFE) {
        newPage();
        drawGroupHeader(group, true);
      }
      font('normal', 8, C.muted);
      doc.text(T(group.subtotalLabel), MX + CW - 43, y + 5, { align: 'right' });
      font('bold', 9.5, C.ink2);
      doc.text(formatCurrencyTL(group.subtotal), MX + CW, y + 5, { align: 'right' });
      y += groupIndex === groups.length - 1 ? 11 : 14;
    });

    const totalRowCount = 1 + vatLines.length + (isMixed ? 1 : 0);
    const totalsWidth = 76;
    const termsWidth = CW - totalsWidth - 8;
    const totalsX = MX + termsWidth + 8;
    const totalsBoxHeight = 13 + totalRowCount * 6 + 14;
    ensureSpace(totalsBoxHeight + 6);
    const totalsTop = y;
    font('bold', 8, C.navy);
    doc.text(T('SİPARİŞ ŞARTLARI'), MX, totalsTop + 2);
    font('normal', 8.7, C.muted);
    const mixedProcessingText = bothMixedGroupsWritten
      ? 'iki ayrı Mikro siparişine işlenmiştir'
      : 'ayrı gruplandırılmıştır; Mikro kayıt durumu bölüm başlıklarında gösterilir';
    const terms = isMixed
      ? `Bu proforma bilgilendirme amaçlıdır; resmî fatura sipariş teslimatında düzenlenir. Faturalı kalemler kendi KDV oranlarıyla, beyaz kalemler KDV'siz olarak ${mixedProcessingText}. Dövizli işlemlerde TCMB USD satış kuru baz alınır. Ödeme ${paymentLabel} planına tabidir.`
      : `Bu proforma bilgilendirme amaçlıdır; resmî fatura sipariş teslimatında düzenlenir. Dövizli işlemlerde TCMB USD satış kuru baz alınır. Ödeme ${paymentLabel} planına tabidir.`;
    const termLines = doc.splitTextToSize(T(terms), termsWidth) as string[];
    let termsY = totalsTop + 8;
    termLines.forEach((line) => {
      doc.text(line, MX, termsY);
      termsY += 4.3;
    });
    setFill(C.panel);
    setDraw(C.hair);
    doc.roundedRect(totalsX, totalsTop, totalsWidth, totalsBoxHeight, 3, 3, 'FD');
    let totalY = totalsTop + 7;
    const drawTotalRow = (label: string, value: string, detail?: string) => {
      font('normal', 8.5, C.muted);
      doc.text(T(label), totalsX + 4, totalY);
      if (detail) {
        const labelWidth = doc.getTextWidth(T(label));
        font('normal', 6.5, C.faint2);
        doc.text(T(detail), totalsX + 5 + labelWidth, totalY, { maxWidth: 31 });
      }
      font('bold', 8.8, C.ink2);
      doc.text(value, totalsX + totalsWidth - 4, totalY, { align: 'right' });
      totalY += 6;
    };
    drawTotalRow('Ara Toplam', formatCurrencyTL(subtotal));
    vatLines.forEach((line) => {
      drawTotalRow(`KDV %${line.percent}`, formatCurrencyTL(line.vat), `· Matrah ${formatNumber(line.base)}`);
    });
    if (isMixed) drawTotalRow("Beyaz kalem KDV'si", formatCurrencyTL(0));
    setDraw(C.hair);
    doc.line(totalsX + 4, totalY - 2.5, totalsX + totalsWidth - 4, totalY - 2.5);
    font('bold', 8.8, C.navy);
    doc.text(T('GENEL TOPLAM'), totalsX + 4, totalY + 4);
    font('bold', 14.5, C.navy);
    doc.text(formatCurrencyTL(grandTotal), totalsX + totalsWidth - 4, totalY + 4.5, { align: 'right' });
    y = Math.max(termsY, totalsTop + totalsBoxHeight) + 8;

    const showCari = cari !== null;
    const paymentHeight = 30;
    const cariHeight = showCari ? 34 : 0;
    const accountRowHeight = Math.max(paymentHeight, cariHeight);
    ensureSpace(accountRowHeight + 4);
    const accountTop = y;
    const accountGap = 8;
    const accountColumnWidth = (CW - accountGap) / 2;
    if (showCari) {
      setFill(C.amberBg);
      setDraw(C.amberBorder);
      doc.roundedRect(MX, accountTop, accountColumnWidth, accountRowHeight, 3, 3, 'FD');
      font('bold', 8, C.amberInk);
      doc.text(T('CARİ HESAP DURUMU'), MX + 5, accountTop + 6);
      font('normal', 7.5, C.faint);
      doc.text(T('Toplam Bakiye'), MX + 5, accountTop + 14);
      font('bold', 12.5, C.ink2);
      doc.text(formatCurrencyTL(cari!.total), MX + 5, accountTop + 21);
      const hasVerifiedPastDue = cari!.pastDue !== null;
      const pastDue = hasVerifiedPastDue ? Number(cari!.pastDue) : null;
      font('bold', 7.5, hasVerifiedPastDue ? C.red : C.faint);
      doc.text(T('Vadesi Geçen'), MX + accountColumnWidth / 2 + 4, accountTop + 14);
      font('bold', 12.5, hasVerifiedPastDue ? C.red : C.faint);
      doc.text(
        hasVerifiedPastDue ? formatCurrencyTL(pastDue) : T('Doğrulanamadı'),
        MX + accountColumnWidth / 2 + 4,
        accountTop + 21
      );
      font('normal', 7.3, !hasVerifiedPastDue ? C.amberSoft : pastDue! > 0 ? C.amberSoft : C.green);
      const balanceNote = !hasVerifiedPastDue
        ? 'Vadesi geçen bakiye güncel servis üzerinden doğrulanamadı.'
        : pastDue! > 0
          ? 'Vadesi geçen bakiyeniz bulunmaktadır; en kısa sürede ödenmesini rica ederiz.'
          : 'Vadesi geçmiş bakiye bulunmamaktadır.';
      doc.text(T(balanceNote), MX + 5, accountTop + 28, { maxWidth: accountColumnWidth - 10 });
    }
    const paymentX = showCari ? MX + accountColumnWidth + accountGap : MX;
    const paymentWidth = showCari ? accountColumnWidth : CW;
    setFill(C.panel);
    setDraw(C.hair);
    doc.roundedRect(paymentX, accountTop, paymentWidth, accountRowHeight, 3, 3, 'FD');
    font('bold', 8, C.navy);
    doc.text(T('ÖDEME BİLGİLERİ'), paymentX + 5, accountTop + 6);
    font('normal', 7.5, C.faint);
    doc.text(T(`Hesap: ${COMPANY.paymentName}`), paymentX + 5, accountTop + 11.5);
    let bankY = accountTop + 16;
    IBANS.forEach((bank) => {
      setDraw(C.hair);
      doc.line(paymentX + 5, bankY - 2.5, paymentX + paymentWidth - 5, bankY - 2.5);
      font('bold', 8.2, C.ink2);
      doc.text(T(`${bank.bank} · ${bank.branch}`), paymentX + 5, bankY + 1.5);
      monoFont(7.7, C.soft);
      doc.text(bank.iban, paymentX + 5, bankY + 5.5);
      bankY += 9;
    });
    y = accountTop + accountRowHeight + 8;

    if (recommendations.length > 0) {
      ensureSpace(14);
      font('bold', 10.5, C.ink2);
      doc.text(T('Tamamlayıcı Ürünler'), MX, y);
      const recommendationTitleWidth = doc.getTextWidth(T('Tamamlayıcı Ürünler'));
      font('normal', 8, C.faint);
      doc.text(T('Siparişinizle birlikte sıkça tercih edilenler'), MX + recommendationTitleWidth + 3, y);
      y += 5;
      const cardGap = 6;
      const cardWidth = (CW - cardGap) / 2;
      const cardHeight = 16;
      for (let index = 0; index < recommendations.length; index += 2) {
        ensureSpace(cardHeight + 3);
        for (let columnIndex = 0; columnIndex < 2; columnIndex++) {
          const product = recommendations[index + columnIndex];
          if (!product) continue;
          const cardX = MX + (cardWidth + cardGap) * columnIndex;
          setFill(C.white);
          setDraw([230, 236, 243]);
          doc.roundedRect(cardX, y, cardWidth, cardHeight, 2.5, 2.5, 'FD');
          drawImageBox(recommendationImages[index + columnIndex], cardX + 3, y + 2.5, 11, 11, 2);
          font('bold', 9, C.ink2);
          const productLines = doc.splitTextToSize(T(product.name || '-'), cardWidth - 21) as string[];
          doc.text(productLines[0] || '-', cardX + 17, y + 7);
          monoFont(7.2, C.faint);
          doc.text(T(product.mikroCode || ''), cardX + 17, y + 11.5);
        }
        y += cardHeight + 3;
      }
      y += 4;
    }

    ensureSpace(34);
    font('normal', 9, C.muted);
    doc.text(T('Siparişiniz için teşekkür ederiz. Bu proforma sipariş kaydınızın özetidir.'), MX, y);
    y += 6;
    const signatureGap = 8;
    const signatureWidth = (CW - signatureGap) / 2;
    const signatureHeight = 22;
    const drawSignature = (x: number, label: string, value: string) => {
      setDraw(C.hair);
      doc.roundedRect(x, y, signatureWidth, signatureHeight, 2.5, 2.5, 'D');
      font('bold', 7.2, C.faint);
      doc.text(T(label), x + 5, y + 6);
      font('bold', 9, C.ink2);
      doc.text(T(value), x + 5, y + signatureHeight - 5, { maxWidth: signatureWidth - 10 });
    };
    drawSignature(MX, 'SİPARİŞİ ALAN', `${preparedByName} · Bakırcılar Ambalaj`);
    drawSignature(MX + signatureWidth + signatureGap, 'ONAYLAYAN · KAŞE & İMZA', customerName);
    y += signatureHeight + 6;

    ensureSpace(24);
    const badgeWidth = 44;
    const badgeHeight = 11;
    const badgeX = (PAGE_W - badgeWidth) / 2;
    if (mascotThumb) {
      const mascotHeight = 24;
      const mascotWidth = (mascotThumb.w / mascotThumb.h) * mascotHeight;
      doc.addImage(mascotThumb.data, mascotThumb.format, badgeX - mascotWidth - 4, y, mascotWidth, mascotHeight);
    }
    setFill(C.greenBg);
    setDraw(C.greenBorder);
    doc.roundedRect(badgeX, y + 4, badgeWidth, badgeHeight, 3, 3, 'FD');
    font('bold', 10.5, C.green);
    doc.text(T('✓ Sipariş Sonu'), badgeX + badgeWidth / 2, y + 11.2, { align: 'center' });

    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page++) {
      doc.setPage(page);
      const isLastPage = page === totalPages;
      if (page >= 2) {
        if (logo) {
          const continuationLogoWidth = 28;
          const continuationLogoHeight = (logo.h / logo.w) * continuationLogoWidth;
          doc.addImage(logo.data, logo.format, MX, 9, continuationLogoWidth, continuationLogoHeight);
        }
        font('normal', 8.2, C.faint);
        const continuationPrefix = T('Sipariş Proforma · ');
        doc.text(continuationPrefix, MX + 30, 13.5);
        const prefixWidth = doc.getTextWidth(continuationPrefix);
        monoFont(8.2, C.soft);
        doc.text(T(order.orderNumber || '-'), MX + 30 + prefixWidth, 13.5);
        font('bold', 8.2, C.navy);
        doc.text(T(`Önceki sayfadan devam · Sayfa ${page} / ${totalPages}`), PAGE_W - MX, 13.5, { align: 'right' });
        setDraw(C.hair);
        doc.line(MX, 17, PAGE_W - MX, 17);
      }
      if (!isLastPage) {
        const stripHeight = 13;
        const stripY = PAGE_H - 38;
        drawHorizontalGradient(MX, stripY, CW, stripHeight, C.navy, C.blue, 30);
        font('bold', 10.5, C.white);
        doc.text(T('Devamı var'), MX + 6, stripY + 6);
        font('normal', 8, [188, 210, 239]);
        doc.text(T('Sipariş sonraki sayfada devam ediyor'), MX + 6, stripY + 10.5);
        monoFont(9, [207, 224, 245]);
        doc.text(`Sayfa ${page} / ${totalPages}`, MX + CW - 4, stripY + 8, { align: 'right' });
        if (mascotPoint) {
          const mascotHeight = 22;
          const mascotWidth = (mascotPoint.w / mascotPoint.h) * mascotHeight;
          doc.addImage(
            mascotPoint.data,
            mascotPoint.format,
            MX + CW - 44,
            stripY - mascotHeight + stripHeight,
            mascotWidth,
            mascotHeight
          );
        }
      }
      const footerY = PAGE_H - 20;
      setFill(C.navy);
      doc.rect(0, footerY, PAGE_W, 20, 'F');
      font('bold', 8, C.white);
      doc.text(T(COMPANY.name), PAGE_W / 2, footerY + 5.5, { align: 'center' });
      font('normal', 6.6, [205, 221, 242]);
      doc.text(T(`${COMPANY.line1} · ${COMPANY.line2}`), PAGE_W / 2, footerY + 10.5, { align: 'center' });
      doc.text(T(COMPANY.line3), PAGE_W / 2, footerY + 15, { align: 'center' });
    }

    const safeCustomer = T(customerName || 'Musteri').replace(/[^a-zA-Z0-9_.-]+/g, '_');
    const safeOrderNumber = T(order.orderNumber || 'Siparis').replace(/[^a-zA-Z0-9_.-]+/g, '_');
    const fileName = `Proforma_${safeOrderNumber}_${safeCustomer}.pdf`;
    return { doc, fileName };
  };

  const handleOrderPdfExport = async (order: PendingOrderForAdmin) => {
    try {
      const { doc, fileName } = await buildOrderPdf(order);
      doc.save(fileName);
    } catch (error) {
      console.error('Siparis PDF olusturma hatasi:', error);
      toast.error('Siparis PDF olusturulamadi');
    }
  };

  const handleOrderExcelExport = (order: PendingOrderForAdmin) => {
    try {
      const customerName =
        order.user?.displayName ||
        order.user?.mikroName ||
        order.user?.name ||
        '';
      const safeCustomer = customerName ? customerName.replace(/[^a-zA-Z0-9-_]+/g, '_') : 'Siparis';
      const headerRows = [
        ['Siparis No', order.orderNumber],
        ['Cari', customerName || '-'],
        ['Cari Kodu', order.user?.mikroCariCode || '-'],
        ['Tarih', order.createdAt ? formatDateShort(order.createdAt) : '-'],
      ];
      if (order.customerOrderNumber) {
        headerRows.push(['Musteri Siparis No', order.customerOrderNumber]);
      }
      if (order.mikroOrderIds && order.mikroOrderIds.length > 0) {
        headerRows.push(['Mikro', order.mikroOrderIds.join(', ')]);
      }

      const tableHeader = ['Urun Kodu', 'Urun Adi', 'Miktar', 'Birim Fiyat', 'Toplam', 'Tip', 'Not'];
      const itemRows = (order.items || []).map((item) => ([
        item.mikroCode,
        item.productName,
        item.quantity,
        item.unitPrice,
        item.totalPrice,
        item.priceType === 'WHITE' ? 'Beyaz' : 'Faturali',
        item.lineNote || '',
      ]));

      const totals = calculateOrderTotals(order);
      const summaryRows = [
        [],
        ['KDV Haric Dip Toplam', '', '', '', totals.subtotal, '', ''],
        ['KDV Tutari', '', '', '', totals.totalVat, '', ''],
        ['KDV Dahil Dip Toplam', '', '', '', totals.totalWithVat, '', ''],
      ];

      const rows = [...headerRows, [], tableHeader, ...itemRows, ...summaryRows];
      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Siparis');
      XLSX.writeFile(workbook, `siparis-proforma-${order.orderNumber}_${safeCustomer}.xlsx`);
    } catch (error) {
      console.error('Siparis Excel olusturma hatasi:', error);
      toast.error('Siparis Excel olusturulamadi');
    }
  };

  const handleApprove = async (orderId: string) => {
    const order = orders.find((item) => item.id === orderId);
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
      // 3.9: Son kullanilan evrak serilerini varsayilan olarak getir
      let invoicedSeries = readStoredSeries(INVOICED_SERIES_KEY, 'B2BF');
      let whiteSeries = readStoredSeries(WHITE_SERIES_KEY, 'B2BB');

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
      // 3.9: Kullanilan serileri bir sonraki onay icin hatirla
      if (result.invoicedSeries) writeStoredSeries(INVOICED_SERIES_KEY, result.invoicedSeries);
      if (result.whiteSeries) writeStoredSeries(WHITE_SERIES_KEY, result.whiteSeries);
      toast.success('Sipariş onaylandı ve Mikro\'ya gönderildi! ✅');
      fetchOrders();
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'Onaylama basarisiz'));
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
      toast.error(getApiErrorMessage(error, 'Reddetme basarisiz'));
    }
  };

  // 3.9: Sadece bekleyen (PENDING) siparisler toplu onay/red icin secilebilir
  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  // 3.9: Mevcut listede gorunen secilebilir (bekleyen) siparisler
  const selectablePendingOrders = useMemo(
    () => filteredOrders.filter((order) => order.status === 'PENDING'),
    [filteredOrders]
  );
  const selectedCount = selectedOrderIds.size;
  const allPendingSelected =
    selectablePendingOrders.length > 0 &&
    selectablePendingOrders.every((order) => selectedOrderIds.has(order.id));

  const toggleSelectAllPending = () => {
    if (allPendingSelected) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(selectablePendingOrders.map((order) => order.id)));
    }
  };

  // 3.9: Liste/sekme/arama degisince gecersiz secimleri temizle (sadece gorunen bekleyenler secili kalsin)
  useEffect(() => {
    setSelectedOrderIds((prev) => {
      if (prev.size === 0) return prev;
      const visibleIds = new Set(selectablePendingOrders.map((order) => order.id));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (visibleIds.has(id)) next.add(id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [selectablePendingOrders]);

  // 3.9: Toplu onay - tek seferde seri sorulur, secili tum bekleyen siparislere uygulanir.
  // Fiyat/seri mantigi tek onay ile bire bir ayni; sadece tekrarli giris ortadan kalkar.
  const handleBulkApprove = async () => {
    // 4) Toplu islem sadece mevcut sayfadaki secili bekleyen siparislere uygulanir
    const targets = orders.filter(
      (order) => selectedOrderIds.has(order.id) && order.status === 'PENDING'
    );
    if (targets.length === 0) {
      toast.error('Onaylanacak bekleyen siparis secilmedi');
      return;
    }

    const anyInvoiced = targets.some((order) =>
      order.items.some((item) => item.priceType === 'INVOICED')
    );
    const anyWhite = targets.some((order) =>
      order.items.some((item) => item.priceType === 'WHITE')
    );

    const result = await new Promise<{
      note: string;
      invoicedSeries?: string;
      whiteSeries?: string;
    } | null>((resolve) => {
      let noteValue = '';
      let invoicedSeries = readStoredSeries(INVOICED_SERIES_KEY, 'B2BF');
      let whiteSeries = readStoredSeries(WHITE_SERIES_KEY, 'B2BB');

      toast((t) => (
        <div className="flex flex-col gap-3 min-w-[320px]">
          <p className="font-semibold">{targets.length} siparis toplu onaylanacak</p>
          <p className="text-xs text-gray-600">
            Secili siparisler onaylanip Mikro&apos;ya gonderilecek. Seriler son kullanilan degerlerle dolduruldu.
          </p>
          <p className="font-medium text-sm">Onay notu (opsiyonel):</p>
          <input
            type="text"
            className="border rounded px-3 py-2 text-sm"
            placeholder="Not ekleyin..."
            onChange={(e) => noteValue = e.target.value}
          />

          {anyInvoiced && (
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

          {anyWhite && (
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

                if (anyInvoiced && !trimmedInvoiced) {
                  toast.error('Faturalı evrak serisi gerekli');
                  return;
                }
                if (anyWhite && !trimmedWhite) {
                  toast.error('Beyaz evrak serisi gerekli');
                  return;
                }

                toast.dismiss(t.id);
                resolve({
                  note: noteValue,
                  invoicedSeries: anyInvoiced ? trimmedInvoiced.slice(0, 20) : undefined,
                  whiteSeries: anyWhite ? trimmedWhite.slice(0, 20) : undefined,
                });
              }}
            >
              {targets.length} Siparisi Onayla
            </button>
          </div>
        </div>
      ), {
        duration: Infinity,
      });
    });

    if (!result) return;

    // 3.9: Kullanilan serileri hatirla
    if (result.invoicedSeries) writeStoredSeries(INVOICED_SERIES_KEY, result.invoicedSeries);
    if (result.whiteSeries) writeStoredSeries(WHITE_SERIES_KEY, result.whiteSeries);

    setIsBulkProcessing(true);
    let success = 0;
    let failed = 0;
    // 3.9: Mikro yazma islemi oldugu icin siparisler sirayla gonderilir (paralel degil)
    for (const order of targets) {
      // Her siparise sadece kendi kalemlerinde gecen tipe ait seriyi gonder
      const orderHasInvoiced = order.items.some((item) => item.priceType === 'INVOICED');
      const orderHasWhite = order.items.some((item) => item.priceType === 'WHITE');
      try {
        await adminApi.approveOrder(order.id, {
          adminNote: result.note.trim() || undefined,
          invoicedSeries: orderHasInvoiced ? result.invoicedSeries : undefined,
          whiteSeries: orderHasWhite ? result.whiteSeries : undefined,
        });
        success += 1;
      } catch (error: any) {
        failed += 1;
        const reason = error.response?.data?.error || 'bilinmeyen hata';
        toast.error(`#${order.orderNumber} onaylanamadi: ${reason}`);
      }
    }
    setIsBulkProcessing(false);

    if (success > 0) {
      toast.success(`${success} siparis onaylandi ve Mikro'ya gonderildi`);
    }
    if (failed === 0) {
      setSelectedOrderIds(new Set());
    }
    fetchOrders();
  };

  // 3.9: Toplu red - tek red sebebi alinir, secili tum bekleyen siparislere uygulanir.
  const handleBulkReject = async () => {
    // 4) Toplu islem sadece mevcut sayfadaki secili bekleyen siparislere uygulanir
    const targets = orders.filter(
      (order) => selectedOrderIds.has(order.id) && order.status === 'PENDING'
    );
    if (targets.length === 0) {
      toast.error('Reddedilecek bekleyen siparis secilmedi');
      return;
    }

    const note = await new Promise<string>((resolve) => {
      let inputValue = '';
      toast((t) => (
        <div className="flex flex-col gap-3 min-w-[300px]">
          <p className="font-medium text-red-700">{targets.length} siparis icin red sebebi (zorunlu):</p>
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
              {targets.length} Siparisi Reddet
            </button>
          </div>
        </div>
      ), {
        duration: Infinity,
      });
    });

    if (note === '__CANCEL__') return;

    setIsBulkProcessing(true);
    let success = 0;
    let failed = 0;
    for (const order of targets) {
      try {
        await adminApi.rejectOrder(order.id, note);
        success += 1;
      } catch (error: any) {
        failed += 1;
        const reason = error.response?.data?.error || 'bilinmeyen hata';
        toast.error(`#${order.orderNumber} reddedilemedi: ${reason}`);
      }
    }
    setIsBulkProcessing(false);

    if (success > 0) {
      toast.success(`${success} siparis reddedildi`);
    }
    if (failed === 0) {
      setSelectedOrderIds(new Set());
    }
    fetchOrders();
  };

  // Sunucu-tarafli sayfalama nedeniyle tum veri seti client'ta yok.
  // Sadece AKTIF filtre kombinasyonunun toplami (pagination.total) bilinir;
  // diger sekme/kaynak sayaclari bilinmedigi icin null (sahte sayi gosterme).
  // counts: aktif status sekmesinin toplami pagination.total'dan gelir.
  const counts: { pending: number | null; approved: number | null; rejected: number | null; all: number | null } = {
    pending: activeTab === 'PENDING' ? pagination.total : null,
    approved: activeTab === 'APPROVED' ? pagination.total : null,
    rejected: activeTab === 'REJECTED' ? pagination.total : null,
    all: activeTab === 'ALL' ? pagination.total : null,
  };
  // sourceCounts: aktif kaynak sekmesinin toplami pagination.total'dan gelir.
  const sourceCounts: { all: number | null; customer: number | null; b2b: number | null } = {
    all: sourceTab === 'ALL' ? pagination.total : null,
    customer: sourceTab === 'CUSTOMER' ? pagination.total : null,
    b2b: sourceTab === 'B2B' ? pagination.total : null,
  };
  const emptyStateMessage = debouncedSearch || activeFilterCount > 0
    ? 'Arama ve filtrelerle eslesen siparis bulunamadi.'
    : activeTab === 'PENDING'
      ? 'Bekleyen siparis yok'
      : activeTab === 'APPROVED'
        ? 'Onaylanmis siparis yok'
        : activeTab === 'REJECTED'
          ? 'Reddedilmis siparis yok'
          : 'Henuz hic siparis yok';

  // Sayfalama yardimcilari (HEM New HEM Classic kullanir)
  const totalPages = pagination.totalPages || 1;
  const canPrev = page > 1;
  const canNext = page < totalPages;
  const goPrev = () => {
    if (canPrev) setPage((p) => Math.max(1, p - 1));
  };
  const goNext = () => {
    if (canNext) setPage((p) => p + 1);
  };

  return {
    // router
    router,
    // tablar / kaynak / arama
    activeTab,
    setActiveTab,
    sourceTab,
    setSourceTab,
    searchTerm,
    setSearchTerm,
    filters,
    updateFilter,
    clearFilters,
    activeFilterCount,
    filterOptions,
    filterOptionsLoading,
    // veri / yuklenme
    isLoading,
    isFetching,
    loadError,
    retryFetch: fetchOrders,
    orders,
    filteredOrders,
    // sayaclar
    counts,
    sourceCounts,
    emptyStateMessage,
    // sunucu-tarafli sayfalama
    page,
    setPage,
    pagination,
    totalPages,
    canPrev,
    canNext,
    goPrev,
    goNext,
    // genisletme
    expandedOrders,
    toggleExpanded,
    // secim / toplu islem
    selectedOrderIds,
    isBulkProcessing,
    toggleOrderSelection,
    selectablePendingOrders,
    selectedCount,
    allPendingSelected,
    toggleSelectAllPending,
    setSelectedOrderIds,
    // siparis aksiyonlari
    openEdit,
    handleApprove,
    handleReject,
    handleBulkApprove,
    handleBulkReject,
    handleOrderPdfExport,
    handleOrderExcelExport,
    // yardimci
    isCustomerOrder,
  };
}

export default useSiparisler;
