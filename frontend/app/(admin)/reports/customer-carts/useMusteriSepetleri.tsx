'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '@/lib/api/admin';
import { formatCurrency } from '@/lib/utils/format';
import { useDebounce } from '@/lib/hooks/useDebounce';
import toast from 'react-hot-toast';

export type PriceType = 'INVOICED' | 'WHITE' | string | null | undefined;

export interface CustomerCartItem {
  id: string;
  productId?: string | null;
  productCode?: string | null;
  productName?: string | null;
  quantity: number;
  priceType?: PriceType;
  priceMode?: string | null;
  unitPrice?: number | null;
  totalPrice?: number | null;
  updatedAt: string;
}

export interface CustomerCartRow {
  cartId: string;
  userId: string;
  userName?: string | null;
  customerCode?: string | null;
  customerName?: string | null;
  isSubUser?: boolean;
  updatedAt: string;
  lastItemAt?: string | null;
  itemCount: number;
  totalQuantity: number;
  totalAmount: number;
  items: CustomerCartItem[];
}

export const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('tr-TR');
};

export const formatCurrencySafe = (value?: number | null) => {
  if (!Number.isFinite(value)) return '-';
  return formatCurrency(Number(value));
};

export const priceTypeLabel = (value?: PriceType) => {
  if (value === 'WHITE') return 'Beyaz';
  if (value === 'INVOICED') return 'Faturali';
  return value ? String(value) : '-';
};

/**
 * Musteri Sepetleri raporunun TUM is mantigi.
 * Klasik ve yeni gorunum bu hook'u tuketir; logic birebir korunmustur.
 * (Onceki CustomerCartsReportPage component'inin `return (` oncesindeki her sey aynen tasinmistir.)
 */
export function useMusteriSepetleri() {
  const [search, setSearch] = useState('');
  const [includeEmpty, setIncludeEmpty] = useState(false);
  const [carts, setCarts] = useState<CustomerCartRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);

  const debouncedSearch = useDebounce(search, 400);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, includeEmpty]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.getCustomerCartsReport({
        search: debouncedSearch.trim() || undefined,
        includeEmpty,
        page,
        limit: 20,
      });

      if (!result.success) {
        throw new Error('Rapor yuklenemedi');
      }

      const rows = result.data?.carts || [];
      setCarts(rows);
      setExpanded(new Set());
      setTotalPages(result.data?.pagination?.totalPages || 1);
      setTotalRecords(result.data?.pagination?.totalRecords || 0);
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || 'Rapor yuklenemedi';
      setError(message);
      setCarts([]);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, includeEmpty, page]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport, refreshKey]);

  const toggleExpanded = (cartId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cartId)) {
        next.delete(cartId);
      } else {
        next.add(cartId);
      }
      return next;
    });
  };

  const canPrev = page > 1;
  const canNext = page < totalPages;

  return {
    // state
    search,
    setSearch,
    includeEmpty,
    setIncludeEmpty,
    carts,
    page,
    setPage,
    totalPages,
    totalRecords,
    loading,
    error,
    expanded,
    refreshKey,
    setRefreshKey,
    // derived
    canPrev,
    canNext,
    // handlers
    fetchReport,
    toggleExpanded,
    // helpers
    formatDateTime,
    formatCurrencySafe,
    priceTypeLabel,
  };
}

export default useMusteriSepetleri;
