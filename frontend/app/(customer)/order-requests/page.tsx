'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import customerApi from '@/lib/api/customer';
import { OrderRequest } from '@/types';
import { useAuthStore } from '@/lib/store/authStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import { getAllowedPriceTypes, getDefaultPriceType } from '@/lib/utils/priceVisibility';
import { ClipboardList, Clock, CheckCircle2, XCircle, User2, Hash, ShoppingCart } from 'lucide-react';

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
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div>
          <h1 className="page-title">Siparis Talepleri</h1>
          <p className="page-subtitle">
            {isSubUser
              ? 'Sepetten gonderdiginiz talepleri burada takip edebilirsiniz.'
              : 'Alt kullanicilardan gelen talepleri buradan siparise cevirebilirsiniz.'}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : requests.length === 0 ? (
        <div className="card card-pad">
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 text-gray-400">
              <ClipboardList className="h-6 w-6" />
            </div>
            <p className="text-sm text-gray-500">Henuz talep bulunmuyor.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => {
            const selectionMap = selectedItemsByRequest[request.id] || {};
            const selectedIds = Object.keys(selectionMap).filter((id) => {
              if (!selectionMap[id]) return false;
              return request.items.some((item) => item.id === id && item.status === 'PENDING');
            });
            const selectedCount = selectedIds.length;

            const itemCount = request.items.length;

            return (
              <div key={request.id} className="card overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] bg-[var(--surface-1)] px-5 py-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="chip font-mono">
                      <Hash className="h-3 w-3" />
                      {request.id.slice(0, 8)}
                    </span>
                    <span className="text-[11px] text-gray-400">{itemCount} kalem</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3 text-gray-400" />
                      {formatDateShort(request.createdAt)}
                    </span>
                    {request.requestedBy && (
                      <span className="inline-flex items-center gap-1">
                        <User2 className="h-3 w-3 text-gray-400" />
                        {request.requestedBy.name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {request.status === 'PENDING' && (
                    <span className="badge-warning"><Clock className="h-3 w-3" />Bekliyor</span>
                  )}
                  {request.status === 'CONVERTED' && (
                    <span className="badge-success"><CheckCircle2 className="h-3 w-3" />Siparise cevrildi</span>
                  )}
                  {request.status === 'REJECTED' && (
                    <span className="badge-danger"><XCircle className="h-3 w-3" />Reddedildi</span>
                  )}
                </div>
              </div>

              <div className="space-y-2.5 p-5">
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
                    <div
                      key={item.id}
                      className={`surface p-3.5 transition-colors ${isSelected ? 'ring-1 ring-inset ring-primary-200 border-primary-200' : ''}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex items-start gap-2">
                            {canSelectItem && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                className="mt-1 h-4 w-4 flex-shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
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
                            )}
                            <div className="min-w-0">
                              <div className="font-semibold leading-snug text-gray-900">{item.product.name}</div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span className="chip font-mono">{item.product.mikroCode}</span>
                                {!isSubUser && customerProductCode && (
                                  <span className="badge-success">Musteri Kodu: {customerProductCode}</span>
                                )}
                                <span className={item.priceMode === 'EXCESS' ? 'badge-warning' : 'badge-neutral'}>
                                  {item.priceMode === 'EXCESS' ? 'Fazla Stok' : 'Liste'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {!isSubUser && item.status === 'PENDING' ? (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-500">
                              <span>Talep: <span className="font-medium text-gray-700">{item.quantity}</span> {unitLabel}</span>
                              <label className="inline-flex items-center gap-1.5">
                                <span className="text-gray-500">Onay:</span>
                                <input
                                  type="number"
                                  min={1}
                                  className="input w-20 px-2 py-1 text-xs"
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
                                <span className="text-gray-400">{unitLabel}</span>
                              </label>
                            </div>
                          ) : showQuantityDiff ? (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                              <span className="text-gray-500">Talep: {item.quantity} {unitLabel}</span>
                              <span className="text-amber-600">
                                Onaylanan: <span className="font-medium">{approvedQuantity} {unitLabel}</span> (Fark: {quantityDiff > 0 ? `+${quantityDiff}` : quantityDiff})
                              </span>
                            </div>
                          ) : (
                            <div className="text-xs text-gray-500">
                              Miktar: <span className="font-medium text-gray-700">{effectiveQuantity}</span> {unitLabel}
                            </div>
                          )}

                          {item.lineNote && (
                            <div className="text-xs text-gray-500">Not: {item.lineNote}</div>
                          )}

                          {item.status !== 'PENDING' && (
                            <div>
                              {item.status === 'CONVERTED' ? (
                                <span className="badge-success"><CheckCircle2 className="h-3 w-3" />Siparise Cevrildi</span>
                              ) : (
                                <span className="badge-danger"><XCircle className="h-3 w-3" />Reddedildi</span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex-shrink-0 text-right">
                          {displayTotal !== undefined ? (
                            <>
                              <div className="text-base font-bold text-gray-900">{formatCurrency(displayTotal)}</div>
                              {displayType && (
                                <div className="mt-0.5 text-[11px] text-gray-400">
                                  {displayType === 'INVOICED' ? 'Faturali' : 'Beyaz'}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="text-xs text-gray-400">Fiyat bulunamadi</div>
                          )}
                        </div>
                      </div>

                      {canSelectPriceType && request.status !== 'REJECTED' && item.status === 'PENDING' && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {allowedPriceTypes.includes('INVOICED') && (
                            <button
                              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                                (selectedPriceTypes[item.id] || defaultPriceType) === 'INVOICED'
                                  ? 'border-primary-600 bg-primary-600 text-white'
                                  : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300 hover:bg-primary-50'
                              }`}
                              onClick={() => setSelectedPriceTypes({ ...selectedPriceTypes, [item.id]: 'INVOICED' })}
                            >
                              Faturali
                            </button>
                          )}
                          {allowedPriceTypes.includes('WHITE') && (
                            <button
                              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                                (selectedPriceTypes[item.id] || defaultPriceType) === 'WHITE'
                                  ? 'border-gray-800 bg-gray-800 text-white'
                                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
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
                <div className="space-y-3 border-t border-[var(--line)] bg-[var(--surface-1)] px-5 py-4">
                  {canSelectPriceType && (
                    <div className="flex flex-wrap gap-2">
                      {allowedPriceTypes.includes('INVOICED') && (
                        <button
                          type="button"
                          className="btn-secondary text-xs px-3 py-1.5"
                          onClick={() => applyPriceTypeToRequest(request, 'INVOICED')}
                        >
                          Tumunu Faturali Yap
                        </button>
                      )}
                      {allowedPriceTypes.includes('WHITE') && (
                        <button
                          type="button"
                          className="btn-secondary text-xs px-3 py-1.5"
                          onClick={() => applyPriceTypeToRequest(request, 'WHITE')}
                        >
                          Tumunu Beyaz Yap
                        </button>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                    <button
                      type="button"
                      className="btn-ghost px-2.5 py-1 text-xs"
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
                      className="btn-ghost px-2.5 py-1 text-xs"
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
                    <span className="chip">Secili: {selectedCount}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    <label className="field-label">Not (opsiyonel)</label>
                    <textarea
                      value={noteByRequestId[request.id] || ''}
                      onChange={(e) => setNoteByRequestId({ ...noteByRequestId, [request.id]: e.target.value })}
                      className="input"
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
                      <ShoppingCart className="mr-1.5 h-4 w-4" />
                      Secilenleri Siparise Cevir
                    </Button>
                    <Button
                      onClick={() => handleConvert(request)}
                      isLoading={convertingId === request.id}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <CheckCircle2 className="mr-1.5 h-4 w-4" />
                      Tumunu Siparise Cevir
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => handleReject(request)}
                      isLoading={convertingId === request.id}
                      className="w-full"
                    >
                      <XCircle className="mr-1.5 h-4 w-4" />
                      Reddet
                    </Button>
                  </div>
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


