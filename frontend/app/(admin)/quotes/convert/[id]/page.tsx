'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import type { Quote } from '@/types';

const resolveWarehouseValue = (value: string) => {
  const normalized = String(value || '').toLowerCase();
  const digits = normalized.match(/\d+/);
  if (digits) return digits[0];
  if (normalized.includes('merkez')) return '1';
  if (normalized.includes('eregl')) return '2';
  if (normalized.includes('topca') || normalized.includes('top?a')) return '6';
  if (normalized.includes('dukkan') || normalized.includes('d?kkan')) return '7';
  return value;
};

export default function QuoteConvertPage() {
  const params = useParams();
  const router = useRouter();
  const quoteId = params?.id as string | undefined;
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [closeReasons, setCloseReasons] = useState<Record<string, string>>({});
  const [includedWarehouses, setIncludedWarehouses] = useState<string[]>([]);
  const [warehouseNo, setWarehouseNo] = useState('');
  const [invoicedSeries, setInvoicedSeries] = useState('');
  const [whiteSeries, setWhiteSeries] = useState('');
  const [documentNo, setDocumentNo] = useState('');
  const [documentDescription, setDocumentDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>({});
  const [itemResponsibilityCenters, setItemResponsibilityCenters] = useState<Record<string, string>>({});
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
        const allIds = new Set((loadedQuote.items || []).map((item) => item.id));
        setSelectedIds(allIds);
        setCloseReasons({});

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

  const selectedItems = useMemo(() => {
    if (!quote) return [];
    return (quote.items || []).filter((item) => selectedIds.has(item.id));
  }, [quote, selectedIds]);

  const hasInvoiced = selectedItems.some((item) => item.priceType !== 'WHITE');
  const hasWhite = selectedItems.some((item) => item.priceType === 'WHITE');

  const toggleItem = (itemId: string) => {
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
    setSelectedIds(new Set((quote.items || []).map((item) => item.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const updateItemQuantity = (itemId: string, quantity: number) => {
    setItemQuantities((prev) => ({
      ...prev,
      [itemId]: Math.max(1, Math.floor(quantity || 0)),
    }));
  };

  const updateItemResponsibility = (itemId: string, value: string) => {
    setItemResponsibilityCenters((prev) => ({
      ...prev,
      [itemId]: value,
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

    const unselected = (quote.items || []).filter((item) => !selectedIds.has(item.id));
    const missingReason = unselected.find((item) => !String(closeReasons[item.id] || '').trim());
    if (missingReason) {
      toast.error('Secilmeyen kalemler icin kapatma nedeni yazin.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await adminApi.convertQuoteToOrder(quote.id, {
        documentNo: documentNo.trim() || undefined,
        documentDescription: documentDescription.trim() || undefined,
        selectedItemIds: Array.from(selectedIds),
        closeReasons,
        warehouseNo: Number(resolveWarehouseValue(warehouseNo)),
        invoicedSeries: invoicedSeries.trim() || undefined,
        whiteSeries: whiteSeries.trim() || undefined,
        itemUpdates: selectedItems.map((item) => ({
          id: item.id,
          quantity: resolveItemQuantity(item),
          responsibilityCenter: resolveItemResponsibility(item).trim() || undefined,
        })),
      });

      const orderLabel = result.orderNumber
        ? `${result.orderNumber} (${result.mikroOrderIds.join(', ')})`
        : result.mikroOrderIds.join(', ');
      toast.success(`Siparis olusturuldu: ${orderLabel}`);
      router.push('/quotes');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Siparis olusturulamadi.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-sm text-gray-600">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          Yukleniyor...
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-gray-500">Teklif bulunamadi.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container-custom max-w-[1400px] py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Teklifi Siparise Cevir</h1>
            <p className="text-sm text-gray-600">
              {quote.quoteNumber} · {quote.customer?.displayName || quote.customer?.name || '-'} ·
              {quote.createdAt ? ` ${formatDateShort(quote.createdAt)}` : ''}
            </p>
          </div>
          <Button variant="secondary" onClick={() => router.push('/quotes')}>
            Tekliflere Don
          </Button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-semibold">Kalemler</h2>
                  <p className="text-xs text-gray-500">Siparise cevrilecek kalemleri secin.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={selectAll}>
                    Tumunu Sec
                  </Button>
                  <Button variant="secondary" size="sm" onClick={deselectAll}>
                    Secimi Temizle
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-3">
                <input
                  value={bulkResponsibilityCenter}
                  onChange={(e) => setBulkResponsibilityCenter(e.target.value)}
                  placeholder="Sorumluluk merkezi (Toplu)"
                  className="w-56 rounded border border-slate-200 px-3 py-2 text-xs"
                />
                <Button variant="secondary" size="sm" onClick={applyResponsibilityToAll}>
                  Tum satirlara uygula
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-gray-500">
                    <tr>
                      <th className="py-2">Sec</th>
                      <th>Urun</th>
                      <th className="text-right">Miktar</th>
                      <th className="text-right">Birim</th>
                      <th className="text-right">Toplam</th>
                      <th>Tip</th>
                      <th>Sorumluluk</th>
                      <th>Kapatma Nedeni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(quote.items || []).map((item) => {
                      const isSelected = selectedIds.has(item.id);
                      const resolvedQuantity = resolveItemQuantity(item);
                      const lineTotal = (item.unitPrice || 0) * resolvedQuantity;
                      return (
                        <tr key={item.id} className="align-top">
                          <td className="py-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleItem(item.id)}
                              className="h-4 w-4 accent-primary-600"
                            />
                          </td>
                          <td className="py-3">
                            <div className="font-medium text-gray-900">{item.productName}</div>
                            <div className="text-xs text-gray-500">{item.productCode}</div>
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                className="h-6 w-6 rounded border border-slate-200 text-xs text-gray-600 hover:bg-slate-50 disabled:opacity-40"
                                onClick={() => updateItemQuantity(item.id, resolvedQuantity - 1)}
                                disabled={!isSelected || resolvedQuantity <= 1}
                              >
                                -
                              </button>
                              <input
                                type="number"
                                className="w-16 rounded border border-slate-200 px-2 py-1 text-right text-xs"
                                value={resolvedQuantity}
                                onChange={(e) => updateItemQuantity(item.id, Number(e.target.value))}
                                min={1}
                                disabled={!isSelected}
                              />
                              <button
                                type="button"
                                className="h-6 w-6 rounded border border-slate-200 text-xs text-gray-600 hover:bg-slate-50 disabled:opacity-40"
                                onClick={() => updateItemQuantity(item.id, resolvedQuantity + 1)}
                                disabled={!isSelected}
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="py-3 text-right">{formatCurrency(item.unitPrice)}</td>
                          <td className="py-3 text-right">{formatCurrency(lineTotal)}</td>
                          <td className="py-3">
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-gray-600">
                              {item.priceType === 'WHITE' ? 'Beyaz' : 'Faturali'}
                            </span>
                          </td>
                          <td className="py-3">
                            {isSelected ? (
                              <Input
                                value={resolveItemResponsibility(item)}
                                onChange={(e) => updateItemResponsibility(item.id, e.target.value)}
                                placeholder="Sorumluluk merkezi"
                              />
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          <td className="py-3">
                            {!isSelected && (
                              <Input
                                value={closeReasons[item.id] || ''}
                                onChange={(e) =>
                                  setCloseReasons((prev) => ({
                                    ...prev,
                                    [item.id]: e.target.value,
                                  }))
                                }
                                placeholder="Kapatma nedeni"
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">Siparis Bilgileri</h2>
                  <p className="text-xs text-gray-500">Depo ve evrak bilgilerini girin.</p>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Belge No</label>
                  <Input
                    value={documentNo}
                    onChange={(e) => setDocumentNo(e.target.value)}
                    placeholder="Musteri siparis no / belge no"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ctrl+Q Aciklama 1</label>
                  <Input
                    value={documentDescription}
                    onChange={(e) => setDocumentDescription(e.target.value)}
                    placeholder="Orn: test"
                  />
                </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Depo</label>
                  {includedWarehouses.length > 0 ? (
                    <select
                      value={warehouseNo}
                      onChange={(e) => setWarehouseNo(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                    >
                      {includedWarehouses.map((warehouse) => (
                        <option key={warehouse} value={resolveWarehouseValue(warehouse)}>
                          {warehouse}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      value={warehouseNo}
                      onChange={(e) => setWarehouseNo(e.target.value)}
                      placeholder="Depo"
                    />
                  )}
                </div>

                {hasInvoiced && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-gray-500">Faturali Siparis</p>
                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Seri</label>
                        <Input
                          value={invoicedSeries}
                          onChange={(e) => setInvoicedSeries(e.target.value)}
                          placeholder="Orn: HENDEK"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {hasWhite && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-gray-500">Beyaz Siparis</p>
                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Seri</label>
                        <Input
                          value={whiteSeries}
                          onChange={(e) => setWhiteSeries(e.target.value)}
                          placeholder="Orn: HENDEK"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-xs text-gray-600">
                  {selectedItems.length} kalem secili. Secilmeyen kalemler kapatilacak.
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex flex-col gap-4">
                <div className="text-sm text-gray-500">Toplam</div>
                <div className="text-2xl font-semibold text-gray-900">
                  {formatCurrency(selectedItems.reduce((sum, item) => sum + (item.unitPrice || 0) * resolveItemQuantity(item), 0))}
                </div>
                <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? 'Gonderiliyor...' : 'Siparise Cevir'}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
