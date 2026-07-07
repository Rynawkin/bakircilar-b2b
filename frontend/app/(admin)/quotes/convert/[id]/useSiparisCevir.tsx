'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { Badge } from '@/components/ui/Badge';
import { getApiErrorMessage } from '@/lib/utils/apiError';
import type { Quote } from '@/types';

export const resolveWarehouseValue = (value: string) => {
  const normalized = String(value || '').toLowerCase();
  const digits = normalized.match(/\d+/);
  if (digits) return digits[0];
  if (normalized.includes('merkez')) return '1';
  if (normalized.includes('eregl')) return '2';
  if (normalized.includes('topca') || normalized.includes('top?a')) return '6';
  if (normalized.includes('dukkan') || normalized.includes('d?kkan')) return '7';
  return value;
};

export const CLOSE_REASONS = [
  'Stok yok',
  'Fiyat kabul edilmedi',
  'Musteri vazgecti',
  'Teklif suresi doldu',
  'Hata/duzeltme',
  'Diger',
];

export const resolveItemStatus = (item?: Quote['items'][number]) => item?.status || 'OPEN';

export const getStatusBadge = (status: string) => {
  if (status === 'CLOSED') return <Badge variant="danger">Kapali</Badge>;
  if (status === 'CONVERTED') return <Badge variant="info">Siparise cevrildi</Badge>;
  return <Badge variant="success">Acik</Badge>;
};

/**
 * Teklifi Siparise Cevir ekraninin TUM mantigi.
 * Onceki page.tsx icindeki `return (` oncesindeki her sey BIREBIR buraya tasinmistir.
 * Ozellikle Mikro SIPARISLER yazan handleSubmit (convertQuoteToOrder), seri-no (faturali/beyaz),
 * Ctrl+Q aciklamasi, birim/katsayi (resolveItemQuantity), rezerve ve kapatma mantigi DEGISMEMISTIR.
 */
export function useSiparisCevir() {
  const params = useParams();
  const router = useRouter();
  const quoteId = params?.id as string | undefined;
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [closeReasons, setCloseReasons] = useState<Record<string, string>>({});
  const [closeUnselected, setCloseUnselected] = useState(false);
  const [includedWarehouses, setIncludedWarehouses] = useState<string[]>([]);
  const [warehouseNo, setWarehouseNo] = useState('');
  const [invoicedSeries, setInvoicedSeries] = useState('');
  const [whiteSeries, setWhiteSeries] = useState('');
  const [documentNo, setDocumentNo] = useState('');
  const [documentDescription, setDocumentDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>({});
  const [itemResponsibilityCenters, setItemResponsibilityCenters] = useState<Record<string, string>>({});
  const [itemReserveQuantities, setItemReserveQuantities] = useState<Record<string, number>>({});
  const [bulkResponsibilityCenter, setBulkResponsibilityCenter] = useState('');

  useEffect(() => {
    if (!quoteId) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const quoteResult = await adminApi.getQuoteById(quoteId);
        const loadedQuote = quoteResult.quote;
        setDocumentNo(loadedQuote.documentNo || '');
        setQuote(loadedQuote);
        const openIds = new Set(
          (loadedQuote.items || [])
            .filter((item) => resolveItemStatus(item) === 'OPEN')
            .map((item) => item.id)
        );
        setSelectedIds(openIds);
        setCloseReasons({});
        setItemReserveQuantities({});

        let warehouses: string[] = [];
        try {
          const settingsResult = await adminApi.getSettings();
          warehouses = settingsResult?.includedWarehouses || [];
        } catch (settingsError) {
          console.warn('Ayarlar yuklenemedi, depo listesi alinmadi.', settingsError);
        }

        setIncludedWarehouses(warehouses);
        if (!warehouseNo && warehouses.length > 0) {
          setWarehouseNo(resolveWarehouseValue(String(warehouses[0])));
        }
      } catch (error: any) {
        console.error('Teklif yuklenemedi:', error);
        toast.error('Teklif yuklenemedi.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [quoteId]);

  const resolveItemQuantity = (item: Quote['items'][number]) => {
    const raw = itemQuantities[item.id];
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return Number(item.quantity) || 0;
  };

  const resolveItemResponsibility = (item: Quote['items'][number]) => {
    return itemResponsibilityCenters[item.id] || '';
  };

  const resolveItemReserveQty = (item: Quote['items'][number]) => {
    const raw = itemReserveQuantities[item.id];
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.max(0, parsed);
    }
    return 0;
  };

  const selectedItems = useMemo(() => {
    if (!quote) return [];
    return (quote.items || []).filter(
      (item) => selectedIds.has(item.id) && resolveItemStatus(item) === 'OPEN'
    );
  }, [quote, selectedIds]);

  const openItems = useMemo(() => {
    if (!quote) return [];
    return (quote.items || []).filter((item) => resolveItemStatus(item) === 'OPEN');
  }, [quote]);

  const openUnselectedItems = useMemo(() => {
    return openItems.filter((item) => !selectedIds.has(item.id));
  }, [openItems, selectedIds]);

  const hasInvoiced = selectedItems.some((item) => item.priceType !== 'WHITE');
  const hasWhite = selectedItems.some((item) => item.priceType === 'WHITE');

  const toggleItem = (itemId: string) => {
    const target = quote?.items?.find((item) => item.id === itemId);
    if (target && resolveItemStatus(target) !== 'OPEN') {
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (!quote) return;
    const ids = (quote.items || [])
      .filter((item) => resolveItemStatus(item) === 'OPEN')
      .map((item) => item.id);
    setSelectedIds(new Set(ids));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const updateItemQuantity = (itemId: string, quantity: number) => {
    setItemQuantities((prev) => ({
      ...prev,
      [itemId]: Math.max(0.000001, quantity || 0),
    }));
  };

  const updateItemResponsibility = (itemId: string, value: string) => {
    setItemResponsibilityCenters((prev) => ({
      ...prev,
      [itemId]: value,
    }));
  };

  const updateItemReserveQty = (itemId: string, reserveQty: number) => {
    setItemReserveQuantities((prev) => ({
      ...prev,
      [itemId]: Math.max(0, reserveQty || 0),
    }));
  };

  const applyResponsibilityToAll = () => {
    if (!quote) return;
    const value = bulkResponsibilityCenter.trim();
    const next: Record<string, string> = {};
    (quote.items || []).forEach((item) => {
      next[item.id] = value;
    });
    setItemResponsibilityCenters(next);
  };

  const handleSubmit = async () => {
    if (!quote) return;

    if (selectedItems.length === 0) {
      toast.error('En az bir kalem secmelisiniz.');
      return;
    }

    const resolvedWarehouse = Number(resolveWarehouseValue(warehouseNo));
    if (!Number.isFinite(resolvedWarehouse) || resolvedWarehouse <= 0) {
      toast.error('Depo secmelisiniz.');
      return;
    }

    if (hasInvoiced) {
      if (!invoicedSeries.trim()) {
        toast.error('Faturali seri gerekli.');
        return;
      }
    }

    if (hasWhite) {
      if (!whiteSeries.trim()) {
        toast.error('Beyaz seri gerekli.');
        return;
      }
    }

    if (closeUnselected && openUnselectedItems.length > 0) {
      const missingReason = openUnselectedItems.find(
        (item) => !String(closeReasons[item.id] || '').trim()
      );
      if (missingReason) {
        toast.error('Secilmeyen kalemler icin kapatma nedeni secin.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const result = await adminApi.convertQuoteToOrder(quote.id, {
        documentNo: documentNo.trim() || undefined,
        documentDescription: documentDescription.trim() || undefined,
        selectedItemIds: selectedItems.map((item) => item.id),
        closeReasons,
        closeUnselected,
        warehouseNo: Number(resolveWarehouseValue(warehouseNo)),
        invoicedSeries: invoicedSeries.trim() || undefined,
        whiteSeries: whiteSeries.trim() || undefined,
        itemUpdates: selectedItems.map((item) => ({
          id: item.id,
          quantity: resolveItemQuantity(item),
          responsibilityCenter: resolveItemResponsibility(item).trim() || undefined,
          reserveQty: resolveItemReserveQty(item),
        })),
      });

      const orderLabel = result.orderNumber
        ? `${result.orderNumber} (${result.mikroOrderIds.join(', ')})`
        : result.mikroOrderIds.join(', ');
      toast.success(`Siparis olusturuldu: ${orderLabel}`);
      router.push('/quotes');
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'Siparis olusturulamadi.'));
    } finally {
      setSubmitting(false);
    }
  };

  return {
    // router / nav
    router,
    // temel durum
    quote,
    loading,
    submitting,
    // secim
    selectedIds,
    setSelectedIds,
    // kapatma
    closeReasons,
    setCloseReasons,
    closeUnselected,
    setCloseUnselected,
    // depo / evrak
    includedWarehouses,
    warehouseNo,
    setWarehouseNo,
    invoicedSeries,
    setInvoicedSeries,
    whiteSeries,
    setWhiteSeries,
    documentNo,
    setDocumentNo,
    documentDescription,
    setDocumentDescription,
    // toplu sorumluluk
    bulkResponsibilityCenter,
    setBulkResponsibilityCenter,
    // turetilmis degerler
    selectedItems,
    openItems,
    openUnselectedItems,
    hasInvoiced,
    hasWhite,
    // cozumleyiciler
    resolveItemQuantity,
    resolveItemResponsibility,
    resolveItemReserveQty,
    // aksiyonlar
    toggleItem,
    selectAll,
    deselectAll,
    updateItemQuantity,
    updateItemResponsibility,
    updateItemReserveQty,
    applyResponsibilityToAll,
    handleSubmit,
  };
}
