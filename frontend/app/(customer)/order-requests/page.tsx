'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import customerApi from '@/lib/api/customer';
import { OrderRequest } from '@/types';
import { useAuthStore } from '@/lib/store/authStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadErrorState } from '@/components/ui/LoadErrorState';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import { getAllowedPriceTypes, getDefaultPriceType } from '@/lib/utils/priceVisibility';
import Link from 'next/link';
import { ClipboardList, Clock, CheckCircle2, XCircle, User2, Hash, ShoppingCart, CalendarDays, Package, ChevronRight } from 'lucide-react';

export default function OrderRequestsPage() {
  const { user, loadUserFromStorage } = useAuthStore();
  const [requests, setRequests] = useState<OrderRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    requestId: string;
    type: 'selected' | 'all' | 'reject';
  } | null>(null);
  const actionLockRef = useRef(false);
  const [noteByRequestId, setNoteByRequestId] = useState<Record<string, string>>({});
  const [customerOrderNumberByRequestId, setCustomerOrderNumberByRequestId] = useState<Record<string, string>>({});
  const [deliveryLocationByRequestId, setDeliveryLocationByRequestId] = useState<Record<string, string>>({});
  const [selectedPriceTypes, setSelectedPriceTypes] = useState<Record<string, 'INVOICED' | 'WHITE'>>({});
  const [selectedItemsByRequest, setSelectedItemsByRequest] = useState<Record<string, Record<string, boolean>>>({});
  const [adjustedQuantities, setAdjustedQuantities] = useState<Record<string, number>>({});
  const [convertedOrderByRequest, setConvertedOrderByRequest] = useState<
    Record<string, { orderId: string; orderNumber: string }>
  >({});

  const isSubUser = Boolean(user?.parentCustomerId);
  const effectiveVisibility = isSubUser
    ? (user?.priceVisibility === 'WHITE_ONLY' ? 'WHITE_ONLY' : 'INVOICED_ONLY')
    : user?.priceVisibility;
  const allowedPriceTypes = useMemo(() => getAllowedPriceTypes(effectiveVisibility), [effectiveVisibility]);
  const defaultPriceType = getDefaultPriceType(effectiveVisibility);
  const canSelectPriceType = !isSubUser && effectiveVisibility === 'BOTH';

  const pendingCount = useMemo(
    () => requests.filter((request) => request.status === 'PENDING').length,
    [requests]
  );

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
    setLoadError(null);
    try {
      const { requests } = await customerApi.getOrderRequests();
      setRequests(requests);
    } catch (error) {
      console.error('Order requests not loaded:', error);
      setRequests([]);
      setLoadError('Sipariş talepleri şu anda yüklenemedi. Kayıtlarınız silinmedi.');
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

  const handleConvert = async (
    request: OrderRequest,
    actionType: 'selected' | 'all',
    selectedIds?: string[]
  ) => {
    if (actionLockRef.current) return;
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
    actionLockRef.current = true;
    setPendingAction({ requestId: request.id, type: actionType });
    try {
      const note = noteByRequestId[request.id]?.trim();
      const customerOrderNumber = customerOrderNumberByRequestId[request.id]?.trim();
      const deliveryLocation = deliveryLocationByRequestId[request.id]?.trim();
      const result = await customerApi.convertOrderRequest(request.id, {
        items,
        note: note || undefined,
        customerOrderNumber: customerOrderNumber || undefined,
        deliveryLocation: deliveryLocation || undefined,
      });
      setConvertedOrderByRequest((prev) => ({
        ...prev,
        [request.id]: { orderId: result.orderId, orderNumber: result.orderNumber },
      }));
      toast.success(`Talep siparişe çevrildi. Sipariş No: ${result.orderNumber}`, { duration: 6000 });
      await fetchRequests();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Talep cevrilemedi.');
    } finally {
      actionLockRef.current = false;
      setPendingAction(null);
    }
  };

  const handleReject = async (request: OrderRequest) => {
    if (actionLockRef.current) return;
    if (request.status !== 'PENDING') return;
    const pendingItemCount = request.items.filter((item) => item.status === 'PENDING').length;
    if (!window.confirm(`Bu talepteki ${pendingItemCount} bekleyen kalemi reddetmek istediğinizden emin misiniz?`)) {
      return;
    }

    actionLockRef.current = true;
    setPendingAction({ requestId: request.id, type: 'reject' });
    try {
      const note = noteByRequestId[request.id]?.trim();
      await customerApi.rejectOrderRequest(request.id, note || undefined);
      toast.success('Talep reddedildi.');
      await fetchRequests();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Talep reddedilemedi.');
    } finally {
      actionLockRef.current = false;
      setPendingAction(null);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--surface-0)]">
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6 lg:px-6 space-y-5">
        {/* Breadcrumb */}
        <div className="-mb-1 flex items-center gap-1.5 text-xs text-[var(--ink-3)]">
          <Link href="/home" className="hover:text-primary-700">Ana Sayfa</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-medium text-[var(--ink-2)]">Sipariş Talepleri</span>
        </div>

        {/* Sayfa basligi + bekleyen rozeti */}
        <div className="flex items-center gap-3.5">
          <span className="flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-[13px] bg-primary-50 text-primary-600">
            <ClipboardList className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[23px] font-extrabold tracking-[-0.02em] text-[var(--ink-1)]">Sipariş Talepleri</h1>
              {pendingCount > 0 && (
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-amber-700">
                  {pendingCount} bekleyen
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[13px] text-[var(--ink-3)]">
              {isSubUser
                ? 'Sepetten gönderdiğiniz talepleri burada takip edebilirsiniz.'
                : 'Alt kullanıcıların oluşturduğu, ana cari onayı bekleyen talepler.'}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : loadError ? (
          <LoadErrorState
            title="Sipariş talepleri yüklenemedi"
            description={loadError}
            onRetry={() => void fetchRequests()}
          />
        ) : requests.length === 0 ? (
          <div className="rounded-2xl border border-[var(--line)] bg-white">
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                <ClipboardList className="h-6 w-6" strokeWidth={1.75} />
              </span>
              <p className="text-sm text-[var(--ink-2)]">Henüz talep bulunmuyor.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => {
              const selectionMap = selectedItemsByRequest[request.id] || {};
              const selectedIds = Object.keys(selectionMap).filter((id) => {
                if (!selectionMap[id]) return false;
                return request.items.some((item) => item.id === id && item.status === 'PENDING');
              });
              const selectedCount = selectedIds.length;

              const itemCount = request.items.length;
              const convertedOrder =
                convertedOrderByRequest[request.id] ||
                (request.order ? { orderId: request.order.id, orderNumber: request.order.orderNumber } : null);

              // Tahmini toplam: secili fiyat tipi/onay miktarina gore satir bazli onizleme
              const estimatedTotal = request.items.reduce((sum, item) => {
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
                const previewTotal = resolvedPriceType === 'WHITE'
                  ? (item.previewUnitPriceWhite ?? 0) * effectiveQuantity
                  : (item.previewUnitPriceInvoiced ?? 0) * effectiveQuantity;
                return sum + (item.selectedTotalPrice ?? previewTotal ?? 0);
              }, 0);

              return (
                <div key={request.id} className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm transition-shadow hover:shadow-md">
                  {/* Talep kart basligi: no(mono) + durum / Tahmini toplam */}
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] bg-[var(--surface-1)] px-5 py-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-1 font-mono text-sm font-semibold text-[var(--ink-1)]">
                        <Hash className="h-3.5 w-3.5 text-[var(--ink-3)]" />
                        {request.id.slice(0, 8)}
                      </span>
                      {request.status === 'PENDING' && (
                        <span className="badge-warning"><Clock className="h-3 w-3" />Bekliyor</span>
                      )}
                      {request.status === 'CONVERTED' && (
                        <span className="badge-success"><CheckCircle2 className="h-3 w-3" />Siparişe çevrildi</span>
                      )}
                      {convertedOrder && (
                        <Link
                          href={`/my-orders/${convertedOrder.orderId}`}
                          className="chip font-mono transition-colors hover:border-primary-200 hover:text-primary-700"
                        >
                          Sipariş No: {convertedOrder.orderNumber}
                          <span aria-hidden="true">→</span>
                        </Link>
                      )}
                      {request.status === 'REJECTED' && (
                        <span className="badge-danger"><XCircle className="h-3 w-3" />Reddedildi</span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-[10.5px] text-[var(--ink-3)]">Tahmini toplam</div>
                      <div className="text-[17px] font-semibold text-[var(--ink-1)]">{formatCurrency(estimatedTotal)}</div>
                    </div>
                  </div>

                  {/* Meta satiri: Olusturan / Tarih / Kalem */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-[var(--line)] px-5 py-3 text-[12px] text-[var(--ink-2)]">
                    {request.requestedBy && (
                      <span className="inline-flex items-center gap-1.5">
                        <User2 className="h-3.5 w-3.5 text-[var(--ink-3)]" />
                        Oluşturan: <b className="font-semibold text-[var(--ink-1)]">{request.requestedBy.name}</b>
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5 text-[var(--ink-3)]" />
                      Tarih: <b className="font-semibold text-[var(--ink-1)]">{formatDateShort(request.createdAt)}</b>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5 text-[var(--ink-3)]" />
                      Kalem: <b className="font-semibold text-[var(--ink-1)]">{itemCount}</b>
                    </span>
                  </div>

                  {/* Talep satirlari */}
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
                          className={`rounded-xl border bg-[var(--surface-1)] p-3.5 transition-colors ${isSelected ? 'border-primary-200 ring-1 ring-inset ring-primary-200' : 'border-[var(--line)]'}`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <div className="flex items-start gap-2">
                                {canSelectItem && (
                                  <input
                                    type="checkbox"
                                    aria-label={`${item.product.name} ürününü seç`}
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
                                <Link
                                  href={`/products/${item.product.id}`}
                                  aria-label={`${item.product.name} ürün detayını aç`}
                                  className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--line)] bg-white transition-colors hover:border-primary-300"
                                >
                                  {item.product.imageUrl ? (
                                    <img src={item.product.imageUrl} alt={item.product.name} className="h-full w-full object-contain" />
                                  ) : (
                                    <Package className="h-5 w-5 text-[var(--ink-3)]" />
                                  )}
                                </Link>
                                <div className="min-w-0">
                                  <Link
                                    href={`/products/${item.product.id}`}
                                    className="font-semibold leading-snug text-[var(--ink-1)] break-words transition-colors hover:text-primary-700 hover:underline"
                                  >
                                    {item.product.name}
                                  </Link>
                                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                    <Link href={`/products/${item.product.id}`} className="chip font-mono hover:text-primary-700 hover:underline">
                                      {item.product.mikroCode}
                                    </Link>
                                    {!isSubUser && customerProductCode && (
                                      <span className="badge-success">Müşteri Kodu: {customerProductCode}</span>
                                    )}
                                    <span className={item.priceMode === 'EXCESS' ? 'badge-warning' : 'badge-neutral'}>
                                      {item.priceMode === 'EXCESS' ? 'Fazla Stok' : 'Liste'}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {!isSubUser && item.status === 'PENDING' ? (
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[var(--ink-2)]">
                                  <span>Talep: <span className="font-medium text-[var(--ink-1)]">{item.quantity}</span> {unitLabel}</span>
                                  <label className="inline-flex items-center gap-1.5">
                                    <span className="text-[var(--ink-2)]">Onay:</span>
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
                                    <span className="text-[var(--ink-3)]">{unitLabel}</span>
                                  </label>
                                </div>
                              ) : showQuantityDiff ? (
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                  <span className="text-[var(--ink-2)]">Talep: {item.quantity} {unitLabel}</span>
                                  <span className="text-amber-600">
                                    Onaylanan: <span className="font-medium">{approvedQuantity} {unitLabel}</span> (Fark: {quantityDiff > 0 ? `+${quantityDiff}` : quantityDiff})
                                  </span>
                                </div>
                              ) : (
                                <div className="text-xs text-[var(--ink-2)]">
                                  Miktar: <span className="font-medium text-[var(--ink-1)]">{effectiveQuantity}</span> {unitLabel}
                                </div>
                              )}

                              {item.lineNote && (
                                <div className="text-xs text-[var(--ink-2)]">Not: {item.lineNote}</div>
                              )}

                              {item.status !== 'PENDING' && (
                                <div>
                                  {item.status === 'CONVERTED' ? (
                                    <span className="badge-success"><CheckCircle2 className="h-3 w-3" />Siparişe Çevrildi</span>
                                  ) : (
                                    <span className="badge-danger"><XCircle className="h-3 w-3" />Reddedildi</span>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="flex-shrink-0 text-right">
                              {displayTotal !== undefined ? (
                                <>
                                  <div className="text-base font-bold text-[var(--ink-1)]">{formatCurrency(displayTotal)}</div>
                                  {displayType && (
                                    <div className="mt-0.5 text-[11px] text-[var(--ink-3)]">
                                      {displayType === 'INVOICED' ? 'Faturalı' : 'Beyaz'}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div className="text-xs text-[var(--ink-3)]">Fiyat bulunamadı</div>
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
                                      : 'border-gray-200 bg-white text-[var(--ink-2)] hover:border-primary-300 hover:bg-primary-50'
                                  }`}
                                  onClick={() => setSelectedPriceTypes({ ...selectedPriceTypes, [item.id]: 'INVOICED' })}
                                >
                                  Faturalı
                                </button>
                              )}
                              {allowedPriceTypes.includes('WHITE') && (
                                <button
                                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                                    (selectedPriceTypes[item.id] || defaultPriceType) === 'WHITE'
                                      ? 'border-gray-800 bg-gray-800 text-white'
                                      : 'border-gray-200 bg-white text-[var(--ink-2)] hover:border-gray-400 hover:bg-gray-50'
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
                              Tümünü Faturalı Yap
                            </button>
                          )}
                          {allowedPriceTypes.includes('WHITE') && (
                            <button
                              type="button"
                              className="btn-secondary text-xs px-3 py-1.5"
                              onClick={() => applyPriceTypeToRequest(request, 'WHITE')}
                            >
                              Tümünü Beyaz Yap
                            </button>
                          )}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ink-2)]">
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
                          Tümünü Seç
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
                          Seçimi Temizle
                        </button>
                        <span className="chip">Seçili: {selectedCount}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Input
                          label="Teslimat Birimi / Bölge (opsiyonel)"
                          value={deliveryLocationByRequestId[request.id] || ''}
                          onChange={(e) => setDeliveryLocationByRequestId({
                            ...deliveryLocationByRequestId,
                            [request.id]: e.target.value,
                          })}
                        />
                        <Input
                          label="Müşteri Sipariş No (opsiyonel)"
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
                          onClick={() => handleConvert(request, 'selected', selectedIds)}
                          isLoading={pendingAction?.requestId === request.id && pendingAction.type === 'selected'}
                          disabled={selectedCount === 0 || Boolean(pendingAction)}
                          className="w-full bg-primary-600 hover:bg-primary-700 text-white"
                        >
                          <ShoppingCart className="mr-1.5 h-4 w-4" />
                          Seçilenleri Siparişe Çevir
                        </Button>
                        <Button
                          onClick={() => handleConvert(request, 'all')}
                          isLoading={pendingAction?.requestId === request.id && pendingAction.type === 'all'}
                          disabled={Boolean(pendingAction)}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          <CheckCircle2 className="mr-1.5 h-4 w-4" />
                          Tümünü Siparişe Çevir
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => handleReject(request)}
                          isLoading={pendingAction?.requestId === request.id && pendingAction.type === 'reject'}
                          disabled={Boolean(pendingAction)}
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
    </div>
  );
}
