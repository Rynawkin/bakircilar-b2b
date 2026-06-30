'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { adminApi } from '@/lib/api/admin';
import toast from 'react-hot-toast';

/**
 * Musteri Aktivite Takibi raporunun TUM is mantigi.
 * Klasik ve yeni gorunum bu hook'u tuketir; logic birebir korunmustur.
 * (Onceki CustomerActivityReportPageInner component'inin `return (` oncesindeki her sey
 *  aynen tasinmistir. useSearchParams kullandigi icin hook bu dosyada kalir.)
 */

export type ActivityType =
  | 'PAGE_VIEW'
  | 'PRODUCT_VIEW'
  | 'CART_ADD'
  | 'CART_REMOVE'
  | 'CART_UPDATE'
  | 'ACTIVE_PING'
  | 'CLICK'
  | 'SEARCH';

export interface ActivityDailyCount {
  date: string;
  count: number;
}

export interface ActivitySummary {
  totalEvents: number;
  uniqueUsers: number;
  pageViews: number;
  productViews: number;
  cartAdds: number;
  cartRemoves: number;
  cartUpdates: number;
  activeSeconds: number;
  clickCount: number;
  searchCount: number;
  dailyCounts?: ActivityDailyCount[];
}

export interface TopPage {
  pagePath: string;
  count: number;
}

export interface TopClickPage {
  pagePath: string;
  clickCount: number;
  eventCount: number;
}

export interface TopProduct {
  productId?: string | null;
  productCode?: string | null;
  productName?: string | null;
  count: number;
}

export interface TopUser {
  userId: string;
  userName?: string | null;
  customerCode?: string | null;
  customerName?: string | null;
  eventCount: number;
  activeSeconds: number;
  clickCount: number;
  searchCount: number;
}

export interface ActivityEventRow {
  id: string;
  type: ActivityType;
  createdAt: string;
  pagePath?: string | null;
  pageTitle?: string | null;
  productCode?: string | null;
  productName?: string | null;
  quantity?: number | null;
  durationSeconds?: number | null;
  clickCount?: number | null;
  meta?: any;
  userId: string;
  userName?: string | null;
  customerCode?: string | null;
  customerName?: string | null;
}

export interface ActivityMetadata {
  startDate: string;
  endDate: string;
  customer?: {
    id: string;
    code: string;
    name: string | null;
  } | null;
  userId?: string | null;
}

export interface ActivityResponse {
  summary: ActivitySummary;
  topPages: TopPage[];
  topClickPages: TopClickPage[];
  topProducts: TopProduct[];
  topUsers: TopUser[];
  events: ActivityEventRow[];
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    totalRecords: number;
  };
  metadata: ActivityMetadata;
}

export interface ActivityParams {
  startDate: string;
  endDate: string;
  customerCode?: string;
  userId?: string;
}

const toDateInput = (date: Date) => date.toISOString().slice(0, 10);

const buildDefaultDates = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 6);
  return {
    start: toDateInput(start),
    end: toDateInput(end),
  };
};

export const formatDuration = (value?: number | null) => {
  if (!Number.isFinite(value)) return '-';
  const totalSeconds = Math.max(0, Math.round(value as number));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}s ${minutes}dk`;
  if (minutes > 0) return `${minutes}dk ${seconds}sn`;
  return `${seconds}sn`;
};

export const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('tr-TR');
};

export const typeLabels: Record<ActivityType, { label: string; variant: 'default' | 'info' | 'success' | 'warning' | 'danger' }> = {
  PAGE_VIEW: { label: 'Sayfa', variant: 'info' },
  PRODUCT_VIEW: { label: 'Ürün', variant: 'success' },
  CART_ADD: { label: 'Sepet +', variant: 'success' },
  CART_REMOVE: { label: 'Sepet −', variant: 'danger' },
  CART_UPDATE: { label: 'Sepet Güncelleme', variant: 'warning' },
  ACTIVE_PING: { label: 'Aktiflik', variant: 'default' },
  CLICK: { label: 'Tıklama', variant: 'default' },
  SEARCH: { label: 'Arama', variant: 'info' },
};

export function useMusteriAktivite() {
  const searchParams = useSearchParams();
  const appliedQueryRef = useRef(false);
  const defaults = useMemo(buildDefaultDates, []);
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerCode, setCustomerCode] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerOptions, setCustomerOptions] = useState<any[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [userId, setUserId] = useState('');
  const [submitted, setSubmitted] = useState<ActivityParams | null>(null);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [topPages, setTopPages] = useState<TopPage[]>([]);
  const [topClickPages, setTopClickPages] = useState<TopClickPage[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [events, setEvents] = useState<ActivityEventRow[]>([]);
  const [eventTypeFilter, setEventTypeFilter] = useState<ActivityType | 'ALL'>('ALL');
  const [showActivePings, setShowActivePings] = useState(false);
  const [eventSearch, setEventSearch] = useState('');
  const [metadata, setMetadata] = useState<ActivityMetadata | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseCustomerOption = (item: any) => {
    const code = String(item?.['msg_S_1032'] ?? item?.customerCode ?? '').trim();
    const name = String(item?.['msg_S_1033'] ?? item?.customerName ?? '').trim();
    const label = [code, name].filter(Boolean).join(' - ');
    return { code, name, label };
  };

  const handleSelectCustomer = (item: any) => {
    const parsed = parseCustomerOption(item);
    if (!parsed.code) return;
    setCustomerCode(parsed.code);
    setCustomerName(parsed.name);
    setCustomerSearch(parsed.label || parsed.code);
    setCustomerOptions([]);
  };

  useEffect(() => {
    if (appliedQueryRef.current) return;
    const queryCustomerCode = String(searchParams.get('customerCode') || '').trim();
    if (!queryCustomerCode) return;

    appliedQueryRef.current = true;
    setCustomerCode(queryCustomerCode);
    setCustomerName('');
    setCustomerSearch(queryCustomerCode);
    setCustomerOptions([]);
    setPage(1);
    setSubmitted({
      startDate,
      endDate,
      customerCode: queryCustomerCode,
      userId: undefined,
    });
  }, [searchParams, startDate, endDate]);

  useEffect(() => {
    const term = customerSearch.trim();
    if (term.length < 2 || customerCode) {
      setCustomerOptions([]);
      return;
    }

    const handle = window.setTimeout(async () => {
      setCustomerSearching(true);
      try {
        const result = await adminApi.searchCustomers({ searchTerm: term, limit: 12, offset: 0 });
        setCustomerOptions(result.data || []);
      } catch {
        setCustomerOptions([]);
      } finally {
        setCustomerSearching(false);
      }
    }, 300);

    return () => window.clearTimeout(handle);
  }, [customerSearch, customerCode]);

  const handleRunReport = () => {
    if (!startDate || !endDate) {
      toast.error('Tarih araligi secin');
      return;
    }

    const normalizedCustomerCode = (customerCode || customerSearch).trim();
    const normalizedUserId = userId.trim();

    setPage(1);
    setSubmitted({
      startDate,
      endDate,
      customerCode: normalizedCustomerCode || undefined,
      userId: normalizedUserId || undefined,
    });
  };

  const fetchReport = async (params: ActivityParams, currentPage: number) => {
    setLoading(true);
    setError(null);

    try {
      const result = await adminApi.getCustomerActivityReport({
        ...params,
        page: currentPage,
        limit: 50,
      });

      if (!result?.success) {
        throw new Error('Rapor yuklenemedi');
      }

      const data = result.data as ActivityResponse;
      setSummary(data.summary);
      setTopPages(data.topPages || []);
      setTopClickPages(data.topClickPages || []);
      setTopProducts(data.topProducts || []);
      setTopUsers(data.topUsers || []);
      setEvents(data.events || []);
      setMetadata(data.metadata || null);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Rapor yuklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!submitted) return;
    fetchReport(submitted, page);
  }, [submitted, page]);

  const filteredEvents = useMemo(() => {
    const term = eventSearch.trim().toLowerCase();
    return events.filter((event) => {
      if (eventTypeFilter !== 'ALL' && event.type !== eventTypeFilter) return false;
      if (eventTypeFilter === 'ALL' && !showActivePings && event.type === 'ACTIVE_PING') return false;
      if (!term) return true;
      const metaQuery = typeof event.meta === 'object' && event.meta ? (event.meta as any).query : '';
      const haystack = [
        event.pagePath,
        event.pageTitle,
        event.productCode,
        event.productName,
        event.userName,
        event.customerName,
        event.customerCode,
        metaQuery,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [events, eventSearch, eventTypeFilter]);

  return {
    // search params destekli filtre state
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    customerSearch,
    setCustomerSearch,
    customerCode,
    setCustomerCode,
    customerName,
    setCustomerName,
    customerOptions,
    customerSearching,
    userId,
    setUserId,
    // submit / sonuc state
    submitted,
    summary,
    topPages,
    topClickPages,
    topProducts,
    topUsers,
    events,
    // detayli olay listesi ic filtreleri
    eventTypeFilter,
    setEventTypeFilter,
    showActivePings,
    setShowActivePings,
    eventSearch,
    setEventSearch,
    metadata,
    page,
    setPage,
    totalPages,
    loading,
    error,
    // turetilmis
    filteredEvents,
    // handlers / helpers
    parseCustomerOption,
    handleSelectCustomer,
    handleRunReport,
    fetchReport,
  };
}

export default useMusteriAktivite;
