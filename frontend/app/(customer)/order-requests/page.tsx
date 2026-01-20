'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import customerApi from '@/lib/api/customer';
import { OrderRequest } from '@/types';
import { useAuthStore } from '@/lib/store/authStore';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import { getAllowedPriceTypes, getDefaultPriceType } from '@/lib/utils/priceVisibility';

export default function OrderRequestsPage() {
  const { user, loadUserFromStorage } = useAuthStore();
  const [requests, setRequests] = useState<OrderRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [noteByRequestId, setNoteByRequestId] = useState<Record<string, string>>({});
  const [customerOrderNumberByRequestId, setCustomerOrderNumberByRequestId] = useState<Record<string, string>>({});
  const [deliveryLocationByRequestId, setDeliveryLocationByRequestId] = useState<Record<string, string>>({});
  const [selectedPriceTypes, setSelectedPriceTypes] = useState<Record<string, 'INVOICED' | 'WHITE'>>({});
  const [selectedItemsByRequest, setSelectedItemsByRequest] = useState<Record<string, Record<string, boolean>>>({});
  const [adjustedQuantities, setAdjustedQuantities] = useState<Record<string, number>>({});

  const isSubUser = Boolean(user?.parentCustomerId);
  const effectiveVisibility = isSubUser
    ? (user?.priceVisibility === 'WHITE_ONLY' ? 'WHITE_ONLY' : 'INVOICED_ONLY')
    : user?.priceVisibility;
  const allowedPriceTypes = useMemo(() => getAllowedPriceTypes(effectiveVisibility), [effectiveVisibility]);
  const defaultPriceType = getDefaultPriceType(effectiveVisibility);
  const canSelectPriceType = !isSubUser && effectiveVisibility === 'BOTH';

  useEffect(() => {
    loadUserFromStorage();
    fetchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!canSelectPriceType) return;
    setSelectedPriceTypes((prev) => {
      const next = { ...prev };
      requests.forEach((request) => {
        request.items.forEach((item) => {
          if (!next[item.id]) {
            next[item.id] = defaultPriceType;
          }
        });
      });
      return next;
    });
  }, [requests, canSelectPriceType, defaultPriceType]);

  useEffect(() => {
    setSelectedItemsByRequest((prev) => {
      const next = { ...prev };
      requests.forEach((request) => {
        const requestSelection = { ...(next[request.id] || {}) };
        request.items.forEach((item) => {
          if (requestSelection[item.id] === undefined || item.status !== 'PENDING') {
            requestSelection[item.id] = false;
          }
        });
        next[request.id] = requestSelection;
      });
      return next;
    });
  }, [requests]);

  useEffect(() => {
    setAdjustedQuantities((prev) => {
      const next = { ...prev };
      requests.forEach((request) => {
        request.items.forEach((item) => {
          if (next[item.id] === undefined) {
            next[item.id] = item.approvedQuantity ?? item.quantity;
          }
        });
      });
      return next;
    });
  }, [requests]);

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const { requests } = await customerApi.getOrderRequests();
      setRequests(requests);
    } catch (error) {
      console.error('Order requests not loaded:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const applyPriceTypeToRequest = (request: OrderRequest, priceType: 'INVOICED' | 'WHITE') => {
    const next = { ...selectedPriceTypes };
    request.items.forEach((item) => {
      next[item.id] = priceType;
    });
    setSelectedPriceTypes(next);
  };

  const handleConvert = async (request: OrderRequest, selectedIds?: string[]) => {
    if (convertingId) return;
    if (request.status === 'REJECTED') return;

    const pendingItems = request.items.filter((item) => item.status === 'PENDING');
    if (pendingItems.length === 0) {
      toast.error('Onaylanabilecek satir kalmadi.');
      return;
    }

    const selectionSet = selectedIds && selectedIds.length > 0 ? new Set(selectedIds) : null;
    if (selectedIds && selectedIds.length === 0) {
      toast.error('Once en az bir satir secin.');
      return;
    }

    let items: Array<{ id: string; priceType?: 'INVOICED' | 'WHITE'; quantity?: number }> | undefined;
    const sourceItems = selectionSet
      ? pendingItems.filter((item) => selectionSet.has(item.id))
      : pendingItems;

    const resolveQuantity = (item: OrderRequest['items'][number]) => {
      const raw = adjustedQuantities[item.id];
      if (raw === undefined || raw === null) return item.quantity;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
      return parsed;
    };

    if (!isSubUser || selectionSet || canSelectPriceType) {
      items = sourceItems.map((item) => ({
        id: item.id,
        priceType: canSelectPriceType ? (selectedPriceTypes[item.id] || defaultPriceType) : undefined,
        quantity: !isSubUser ? resolveQuantity(item) || undefined : undefined,
      }));

      if (!isSubUser) {
        const invalidQuantity = items.some((entry) => !entry.quantity);
        if (invalidQuantity) {
          toast.error('Miktar gecerli olmali.');
          return;
        }
      }

      if (canSelectPriceType) {
        const missing = items.some((entry) => !entry.priceType);
        if (missing) {
          toast.error('Fiyat tipi secimi gerekli.');
          return;
        }
      }
    }
    setConvertingId(request.id);
    try {
      const note = noteByRequestId[request.id]?.trim();
      const customerOrderNumber = customerOrderNumberByRequestId[request.id]?.trim();
      const deliveryLocation = deliveryLocationByRequestId[request.id]?.trim();
      await customerApi.convertOrderRequest(request.id, {
        items,
        note: note || undefined,
        customerOrderNumber: customerOrderNumber || undefined,
        deliveryLocation: deliveryLocation || undefined,
      });
      toast.success('Talep siparise cevrildi.');
      fetchRequests();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Talep cevrilemedi.');
    } finally {
      setConvertingId(null);
    }
  };

  const handleReject = async (request: OrderRequest) => {
    if (convertingId) return;
    if (request.status !== 'PENDING') return;

    setConvertingId(request.id);
    try {
      const note = noteByRequestId[request.id]?.trim();
      await customerApi.rejectOrderRequest(request.id, note || undefined);
      toast.success('Talep reddedildi.');
      fetchRequests();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Talep reddedilemedi.');
    } finally {
      setConvertingId(null);
    }
  };

  return (
    <div className="container-custom py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Siparis Talepleri</h1>
        <p className="text-sm text-gray-600">
          {isSubUser
            ? 'Sepetten gonderdiginiz talepleri burada takip edebilirsiniz.'
            : 'Alt kullanicilardan gelen talepleri buradan siparise cevirebilirsiniz.'}
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : requests.length === 0 ? (
        <Card>
          <div className="text-center py-10 text-sm text-gray-600">
            Henuz talep bulunmuyor.
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => {
            const selectionMap = selectedItemsByRequest[request.id] || {};
            const selectedIds = Object.keys(selectionMap).filter((id) => {
              if (!selectionMap[id]) return false;
              return request.items.some((item) => item.id === id && item.status === 'PENDING');
            });
            const selectedCount = selectedIds.length;

            return (
              <Card key={request.id} className="border-2 border-gray-100">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <div className="text-sm text-gray-500">Talep ID</div>
                  <div className="font-semibold text-gray-900">{request.id.slice(0, 8)}</div>
                  <div className="text-xs text-gray-500 mt-1">Olusturma: {formatDateShort(request.createdAt)}</div>
                  {request.requestedBy && (
                    <div className="text-xs text-gray-500 mt-1">
                      Talep eden: {request.requestedBy.name}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {request.status === 'PENDING' && <Badge variant="warning">Bekliyor</Badge>}
                  {request.status === 'CONVERTED' && <Badge variant="success">Siparise cevildi</Badge>}
                  {request.status === 'REJECTED' && <Badge variant="danger">Reddedildi</Badge>}
                </div>
              </div>

              <div className="space-y-3">
                {request.items.map((item) => {
                  const resolvedPriceType = item.selectedPriceType
                    || (canSelectPriceType ? selectedPriceTypes[item.id] || defaultPriceType : defaultPriceType);
                  const rawAdjustedQuantity = adjustedQuantities[item.id];
                  const parsedAdjustedQuantity = Number(rawAdjustedQuantity);
                  const normalizedAdjustedQuantity = Number.isFinite(parsedAdjustedQuantity) && parsedAdjustedQuantity > 0
                    ? Math.round(parsedAdjustedQuantity)
                    : item.quantity;
                  const approvedQuantity = item.approvedQuantity ?? null;
                  const effectiveQuantity = !isSubUser && item.status === 'PENDING'
                    ? normalizedAdjustedQuantity
                    : (approvedQuantity ?? item.quantity);
                  const quantityDiff = approvedQuantity !== null ? approvedQuantity - item.quantity : 0;
                  const showQuantityDiff = isSubUser && item.status === 'CONVERTED'
                    && approvedQuantity !== null && approvedQuantity !== item.quantity;
                  const customerProductCode = item.customerProductCode ? item.customerProductCode.trim() : '';
                  const unitLabel = item.product.unit || '';
                  const previewTotal = resolvedPriceType === 'WHITE'
                    ? (item.previewUnitPriceWhite ?? 0) * effectiveQuantity
                    : (item.previewUnitPriceInvoiced ?? 0) * effectiveQuantity;
                  const displayTotal = item.selectedTotalPrice ?? previewTotal;
                  const displayType = item.selectedPriceType || resolvedPriceType;
                  const selectionMap = selectedItemsByRequest[request.id] || {};
                  const isSelected = Boolean(selectionMap[item.id]);
                  const canSelectRows = !isSubUser && request.status !== 'REJECTED';
                  const canSelectItem = canSelectRows && item.status === 'PENDING';

                  return (
                    <div key={item.id} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-gray-900">{item.product.name}</div>
                          <div className="text-xs text-gray-500 font-mono">Kod: {item.product.mikroCode}</div>
                          {!isSubUser && customerProductCode && (
                            <div className="mt-1 inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                              Musteri Kodu: {customerProductCode}
                            </div>
                          )}
                          {!isSubUser && item.status === 'PENDING' ? (
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                              <span>Talep: {item.quantity} {unitLabel}</span>
                              <label className="inline-flex items-center gap-2">
                                <span className="text-gray-500">Onay:</span>
                                <input
                                  type="number"
                                  min={1}
                                  className="w-20 rounded-md border border-gray-200 px-2 py-1 text-xs"
                                  value={adjustedQuantities[item.id] ?? item.quantity}
                                  onChange={(e) => {
                                    const value = Number(e.target.value);
                                    const normalized = Number.isFinite(value)
                                      ? Math.max(1, Math.round(value))
                                      : item.quantity;
                                    setAdjustedQuantities((prev) => ({
                                      ...prev,
                                      [item.id]: normalized,
                                    }));
                                  }}
                                />
                              </label>
                            </div>
                          ) : showQuantityDiff ? (
                            <>
                              <div className="text-xs text-gray-500 mt-1">Talep: {item.quantity} {unitLabel}</div>
                              <div className="text-xs text-amber-600 mt-1">
                                Onaylanan: {approvedQuantity} {unitLabel} (Fark: {quantityDiff > 0 ? `+${quantityDiff}` : quantityDiff})
                              </div>
                            </>
                          ) : (
                            <div className="text-xs text-gray-500 mt-1">Miktar: {effectiveQuantity} {unitLabel}</div>
                          )}
                          {item.lineNote && (
                            <div className="text-xs text-gray-500 mt-1">Not: {item.lineNote}</div>
                          )}
                          <div className="text-xs text-gray-500 mt-1">
                            Tip: {item.priceMode === 'EXCESS' ? 'Fazla Stok' : 'Liste'}
                          </div>
                          {item.status !== 'PENDING' && (
                            <div className="mt-2">
                              <Badge variant={item.status === 'CONVERTED' ? 'success' : 'danger'}>
                                {item.status === 'CONVERTED' ? 'Siparise Cevrildi' : 'Reddedildi'}
                              </Badge>
                            </div>
                          )}
                        </div>
                        <div className="text-right text-xs text-gray-600 space-y-2">
                          {displayTotal !== undefined ? (
                            <>
                              <div className="font-semibold text-gray-900">{formatCurrency(displayTotal)}</div>
                              {displayType && (
                                <div>{displayType === 'INVOICED' ? 'Faturali' : 'Beyaz'}</div>
                              )}
                            </>
                          ) : (
                            <div className="text-xs text-gray-400">Fiyat bulunamadi</div>
                          )}
                          {canSelectItem && (
                            <label className="inline-flex items-center gap-2 text-xs text-gray-600">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setSelectedItemsByRequest((prev) => {
                                    const next = { ...prev };
                                    const requestSelection = { ...(next[request.id] || {}) };
                                    requestSelection[item.id] = checked;
                                    next[request.id] = requestSelection;
                                    return next;
                                  });
                                }}
                              />
                              Sec
                            </label>
                          )}
                        </div>
                      </div>

                      {canSelectPriceType && request.status !== 'REJECTED' && item.status === 'PENDING' && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {allowedPriceTypes.includes('INVOICED') && (
                            <button
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                                (selectedPriceTypes[item.id] || defaultPriceType) === 'INVOICED'
                                  ? 'bg-primary-600 text-white border-primary-600'
                                  : 'bg-white text-gray-700 border-gray-300'
                              }`}
                              onClick={() => setSelectedPriceTypes({ ...selectedPriceTypes, [item.id]: 'INVOICED' })}
                            >
                              Faturali
                            </button>
                          )}
                          {allowedPriceTypes.includes('WHITE') && (
                            <button
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                                (selectedPriceTypes[item.id] || defaultPriceType) === 'WHITE'
                                  ? 'bg-gray-700 text-white border-gray-700'
                                  : 'bg-white text-gray-700 border-gray-300'
                              }`}
                              onClick={() => setSelectedPriceTypes({ ...selectedPriceTypes, [item.id]: 'WHITE' })}
                            >
                              Beyaz
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {!isSubUser && request.status === 'PENDING' && (
                <div className="mt-4 space-y-3">
                  {canSelectPriceType && (
                    <div className="flex flex-wrap gap-2">
                      {allowedPriceTypes.includes('INVOICED') && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => applyPriceTypeToRequest(request, 'INVOICED')}
                        >
                          Tumunu Faturali Yap
                        </Button>
                      )}
                      {allowedPriceTypes.includes('WHITE') && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => applyPriceTypeToRequest(request, 'WHITE')}
                        >
                          Tumunu Beyaz Yap
                        </Button>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                    <button
                      type="button"
                      className="px-2 py-1 rounded-md border border-gray-200 hover:bg-gray-50"
                      onClick={() => {
                        setSelectedItemsByRequest((prev) => {
                          const next = { ...prev };
                          const requestSelection = { ...(next[request.id] || {}) };
                          request.items.forEach((item) => {
                            requestSelection[item.id] = item.status === 'PENDING';
                          });
                          next[request.id] = requestSelection;
                          return next;
                        });
                      }}
                    >
                      Tumunu Sec
                    </button>
                    <button
                      type="button"
                      className="px-2 py-1 rounded-md border border-gray-200 hover:bg-gray-50"
                      onClick={() => {
                        setSelectedItemsByRequest((prev) => {
                          const next = { ...prev };
                          const requestSelection = { ...(next[request.id] || {}) };
                          request.items.forEach((item) => {
                            requestSelection[item.id] = false;
                          });
                          next[request.id] = requestSelection;
                          return next;
                        });
                      }}
                    >
                      Secimi Temizle
                    </button>
                    <span className="text-gray-400">Secili: {selectedCount}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Input
                      label="Teslimat Birimi / Bolge (opsiyonel)"
                      value={deliveryLocationByRequestId[request.id] || ''}
                      onChange={(e) => setDeliveryLocationByRequestId({
                        ...deliveryLocationByRequestId,
                        [request.id]: e.target.value,
                      })}
                    />
                    <Input
                      label="Musteri Siparis No (opsiyonel)"
                      value={customerOrderNumberByRequestId[request.id] || ''}
                      onChange={(e) => setCustomerOrderNumberByRequestId({
                        ...customerOrderNumberByRequestId,
                        [request.id]: e.target.value,
                      })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Not (opsiyonel)</label>
                    <textarea
                      value={noteByRequestId[request.id] || ''}
                      onChange={(e) => setNoteByRequestId({ ...noteByRequestId, [request.id]: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg p-2 text-sm"
                      rows={2}
                      placeholder="Onay notu..."
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Button
                      onClick={() => handleConvert(request, selectedIds)}
                      isLoading={convertingId === request.id}
                      disabled={selectedCount === 0}
                      className="w-full bg-primary-600 hover:bg-primary-700 text-white"
                    >
                      Secilenleri Siparise Cevir
                    </Button>
                    <Button
                      onClick={() => handleConvert(request)}
                      isLoading={convertingId === request.id}
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                    >
                      Tumunu Siparise Cevir
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => handleReject(request)}
                      isLoading={convertingId === request.id}
                      className="w-full"
                    >
                      Reddet
                    </Button>
                  </div>
                </div>
              )}
            </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}


