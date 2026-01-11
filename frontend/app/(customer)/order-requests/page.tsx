'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import customerApi from '@/lib/api/customer';
import { OrderRequest } from '@/types';
import { useAuthStore } from '@/lib/store/authStore';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import { getAllowedPriceTypes, getDefaultPriceType } from '@/lib/utils/priceVisibility';

export default function OrderRequestsPage() {
  const { user, loadUserFromStorage } = useAuthStore();
  const [requests, setRequests] = useState<OrderRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [noteByRequestId, setNoteByRequestId] = useState<Record<string, string>>({});
  const [selectedPriceTypes, setSelectedPriceTypes] = useState<Record<string, 'INVOICED' | 'WHITE'>>({});
  const [selectedItemsByRequest, setSelectedItemsByRequest] = useState<Record<string, Record<string, boolean>>>({});

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
          if (requestSelection[item.id] === undefined) {
            requestSelection[item.id] = false;
          }
        });
        next[request.id] = requestSelection;
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
    if (request.status !== 'PENDING') return;

    const selectionSet = selectedIds && selectedIds.length > 0 ? new Set(selectedIds) : null;
    if (selectedIds && selectedIds.length === 0) {
      toast.error('Once en az bir satir secin.');
      return;
    }

    let items: Array<{ id: string; priceType?: 'INVOICED' | 'WHITE' }> | undefined;
    const sourceItems = selectionSet
      ? request.items.filter((item) => selectionSet.has(item.id))
      : request.items;

    if (selectionSet || canSelectPriceType) {
      items = sourceItems.map((item) => ({
        id: item.id,
        priceType: canSelectPriceType ? (selectedPriceTypes[item.id] || defaultPriceType) : undefined,
      }));

      if (canSelectPriceType) {
        const missing = items.some((item) => !item.priceType);
        if (missing) {
          toast.error('Fiyat tipi secimi gerekli.');
          return;
        }
      }
    }

    setConvertingId(request.id);
    try {
      const note = noteByRequestId[request.id]?.trim();
      await customerApi.convertOrderRequest(request.id, { items, note: note || undefined });
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
            const selectedIds = Object.keys(selectionMap).filter((id) => selectionMap[id]);
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
                  const previewTotal = resolvedPriceType === 'WHITE'
                    ? item.previewTotalPriceWhite
                    : item.previewTotalPriceInvoiced;
                  const displayTotal = item.selectedTotalPrice ?? previewTotal;
                  const displayType = item.selectedPriceType || resolvedPriceType;
                  const selectionMap = selectedItemsByRequest[request.id] || {};
                  const isSelected = Boolean(selectionMap[item.id]);
                  const canSelectRows = !isSubUser && request.status === 'PENDING';

                  return (
                    <div key={item.id} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-gray-900">{item.product.name}</div>
                          <div className="text-xs text-gray-500 font-mono">Kod: {item.product.mikroCode}</div>
                          <div className="text-xs text-gray-500 mt-1">Miktar: {item.quantity} {item.product.unit || ''}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            Tip: {item.priceMode === 'EXCESS' ? 'Fazla Stok' : 'Liste'}
                          </div>
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
                          {canSelectRows && (
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

                      {canSelectPriceType && request.status === 'PENDING' && (
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
                            requestSelection[item.id] = true;
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
