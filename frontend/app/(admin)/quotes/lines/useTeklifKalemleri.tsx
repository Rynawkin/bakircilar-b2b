'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { Badge } from '@/components/ui/Badge';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { getApiErrorMessage } from '@/lib/utils/apiError';
import type { QuoteLineItem } from '@/types';

// Re-export tip (Classic/New JSX'lerin ihtiyaci icin)
export type { QuoteLineItem } from '@/types';

export const STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Acik' },
  { value: 'CLOSED', label: 'Kapali' },
  { value: 'CONVERTED', label: 'Siparise cevrildi' },
  { value: 'ALL', label: 'Tum' },
];

export const CLOSE_REASONS = [
  'Stok yok',
  'Fiyat kabul edilmedi',
  'Musteri vazgecti',
  'Teklif suresi doldu',
  'Hata/duzeltme',
  'Diger',
];

export const getStatusBadge = (status?: string) => {
  if (status === 'CLOSED') return <Badge variant="danger">Kapali</Badge>;
  if (status === 'CONVERTED') return <Badge variant="info">Siparise cevrildi</Badge>;
  return <Badge variant="success">Acik</Badge>;
};

/**
 * Teklif Kalemleri ekraninin TUM mantigi (state/ref/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 */
export function useTeklifKalemleri() {
  const [statusFilter, setStatusFilter] = useState('OPEN');
  const [search, setSearch] = useState('');
  const [closeReasonFilter, setCloseReasonFilter] = useState('');
  const [minDays, setMinDays] = useState('');
  const [maxDays, setMaxDays] = useState('');
  const [sortBy, setSortBy] = useState('created_desc');
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [items, setItems] = useState<QuoteLineItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [closeReasonMap, setCloseReasonMap] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkReason, setBulkReason] = useState('');
  const [bulkClosing, setBulkClosing] = useState(false);
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  const debouncedSearch = useDebounce(search, 300);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const openItemIds = useMemo(
    () => items.filter((item) => (item.status || 'OPEN') === 'OPEN').map((item) => item.id),
    [items]
  );
  const selectedOpenIds = useMemo(() => {
    const openSet = new Set(openItemIds);
    return selectedIds.filter((id) => openSet.has(id));
  }, [selectedIds, openItemIds]);
  const allSelected = openItemIds.length > 0 && selectedOpenIds.length === openItemIds.length;
  const sortedItems = useMemo(() => {
    const next = [...items];
    const getQuoteCreatedAt = (item: QuoteLineItem) => {
      const value = item.quote?.createdAt ? new Date(item.quote.createdAt).getTime() : 0;
      return Number.isFinite(value) ? value : 0;
    };
    switch (sortBy) {
      case 'created_asc':
        next.sort((a, b) => getQuoteCreatedAt(a) - getQuoteCreatedAt(b));
        break;
      case 'waiting_desc':
        next.sort((a, b) => (b.waitingDays || 0) - (a.waitingDays || 0));
        break;
      case 'waiting_asc':
        next.sort((a, b) => (a.waitingDays || 0) - (b.waitingDays || 0));
        break;
      case 'total_desc':
        next.sort((a, b) => (b.totalPrice || 0) - (a.totalPrice || 0));
        break;
      case 'total_asc':
        next.sort((a, b) => (a.totalPrice || 0) - (b.totalPrice || 0));
        break;
      case 'created_desc':
      default:
        next.sort((a, b) => getQuoteCreatedAt(b) - getQuoteCreatedAt(a));
        break;
    }
    return next;
  }, [items, sortBy]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const minDaysValue = minDays ? Number(minDays) : undefined;
      const maxDaysValue = maxDays ? Number(maxDays) : undefined;

      const result = await adminApi.getQuoteLineItems({
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        search: debouncedSearch.trim() || undefined,
        closeReason: closeReasonFilter || undefined,
        minDays: Number.isFinite(minDaysValue) ? minDaysValue : undefined,
        maxDays: Number.isFinite(maxDaysValue) ? maxDaysValue : undefined,
        limit,
        offset: (page - 1) * limit,
      });
      setItems(result.items || []);
      setTotal(result.total || 0);
    } catch (error) {
      console.error('Teklif kalemleri yuklenemedi:', error);
      toast.error('Teklif kalemleri yuklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [
    statusFilter,
    debouncedSearch,
    closeReasonFilter,
    minDays,
    maxDays,
    limit,
    page,
  ]);

  useEffect(() => {
    setPage(1);
    setSelectedIds([]);
    setBulkReason('');
  }, [statusFilter, debouncedSearch, closeReasonFilter, minDays, maxDays]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (openItemIds.length === 0) {
      setSelectedIds([]);
      return;
    }
    const openSet = new Set(openItemIds);
    setSelectedIds((prev) => prev.filter((id) => openSet.has(id)));
  }, [openItemIds]);

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate =
      selectedOpenIds.length > 0 && selectedOpenIds.length < openItemIds.length;
  }, [selectedOpenIds.length, openItemIds.length]);

  const handleCloseItem = async (item: QuoteLineItem) => {
    const reason = closeReasonMap[item.id];
    if (!reason) {
      toast.error('Kapatma nedeni secin.');
      return;
    }

    setActionId(item.id);
    try {
      await adminApi.closeQuoteLineItems([{ id: item.id, reason }]);
      toast.success('Kalem kapatildi.');
      setCloseReasonMap((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      setSelectedIds((prev) => prev.filter((id) => id !== item.id));
      await loadItems();
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'Kalem kapatilamadi.'));
    } finally {
      setActionId(null);
    }
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(openItemIds);
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelectItem = (itemId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) {
        return Array.from(new Set([...prev, itemId]));
      }
      return prev.filter((id) => id !== itemId);
    });
  };

  const handleBulkClose = async () => {
    if (selectedOpenIds.length === 0) {
      toast.error('Kapatilacak kalem secin.');
      return;
    }
    if (!bulkReason) {
      toast.error('Kapatma nedeni secin.');
      return;
    }

    setBulkClosing(true);
    try {
      await adminApi.closeQuoteLineItems(
        selectedOpenIds.map((id) => ({ id, reason: bulkReason }))
      );
      toast.success('Secili kalemler kapatildi.');
      setSelectedIds([]);
      setBulkReason('');
      setCloseReasonMap((prev) => {
        const next = { ...prev };
        selectedOpenIds.forEach((id) => {
          delete next[id];
        });
        return next;
      });
      await loadItems();
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'Kalemler kapatilamadi.'));
    } finally {
      setBulkClosing(false);
    }
  };

  const handleReopenItem = async (item: QuoteLineItem) => {
    setActionId(item.id);
    try {
      await adminApi.reopenQuoteLineItems([item.id]);
      toast.success('Kalem acildi.');
      await loadItems();
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'Kalem acilamadi.'));
    } finally {
      setActionId(null);
    }
  };

  return {
    // filtre state
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
    closeReasonFilter,
    setCloseReasonFilter,
    minDays,
    setMinDays,
    maxDays,
    setMaxDays,
    sortBy,
    setSortBy,
    // sayfalama
    page,
    setPage,
    limit,
    total,
    totalPages,
    // veri
    items,
    sortedItems,
    loading,
    // satir aksiyon durumu
    actionId,
    closeReasonMap,
    setCloseReasonMap,
    // toplu secim
    selectedIds,
    setSelectedIds,
    selectedOpenIds,
    openItemIds,
    allSelected,
    selectAllRef,
    bulkReason,
    setBulkReason,
    bulkClosing,
    // handlers
    loadItems,
    handleCloseItem,
    toggleSelectAll,
    toggleSelectItem,
    handleBulkClose,
    handleReopenItem,
  };
}

export default useTeklifKalemleri;
