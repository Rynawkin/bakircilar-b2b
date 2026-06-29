'use client';

import { ChevronRight, ShoppingCart, Minus, Plus } from 'lucide-react';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import {
  CLOSE_REASONS,
  resolveItemStatus,
  resolveWarehouseValue,
  useSiparisCevir,
} from './useSiparisCevir';

/**
 * Yeni gorunum — Teklifi Siparise Cevir. Mevcut TUM mantik useSiparisCevir'dan gelir; sadece gorsel yeni.
 * Hicbir handler/kolon/durum/kapatma-nedeni/seri-no/birim-katsayi/rezerve/Mikro-yazma dusurulmemistir.
 * Klasikte olan HER oge burada da mevcut (brief 4.2.3).
 */

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';

// Durum rozeti (klasik getStatusBadge ile ayni semantik): OPEN emerald, CLOSED red, CONVERTED info
function StatusBadge({ status }: { status: string }) {
  if (status === 'CLOSED') {
    return (
      <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
        Kapali
      </span>
    );
  }
  if (status === 'CONVERTED') {
    return (
      <span className="inline-flex items-center rounded-full bg-[#eef2fb] px-2 py-0.5 text-[11px] font-semibold text-[#15356b]">
        Siparise cevrildi
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
      Acik
    </span>
  );
}

const stepBtn =
  'flex h-7 w-7 items-center justify-center rounded-md border border-[#d8e0ec] text-[#51607a] hover:bg-[#f4f6fa] disabled:opacity-40 disabled:cursor-not-allowed';
const numInput =
  'h-7 w-14 rounded-md border border-[#d8e0ec] text-center text-xs text-[#14223b] outline-none focus:border-[#15356b]';

export default function SiparisCevirNew() {
  const {
    router,
    quote,
    loading,
    submitting,
    selectedIds,
    closeReasons,
    setCloseReasons,
    closeUnselected,
    setCloseUnselected,
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
    bulkResponsibilityCenter,
    setBulkResponsibilityCenter,
    selectedItems,
    openUnselectedItems,
    hasInvoiced,
    hasWhite,
    resolveItemQuantity,
    resolveItemResponsibility,
    resolveItemReserveQty,
    toggleItem,
    selectAll,
    deselectAll,
    updateItemQuantity,
    updateItemResponsibility,
    updateItemReserveQty,
    applyResponsibilityToAll,
    handleSubmit,
  } = useSiparisCevir();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f7f9fc]">
        <div className="flex flex-col items-center gap-3 text-sm text-[#51607a]">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#15356b] border-t-transparent" />
          Yukleniyor...
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f7f9fc]">
        <p className="text-sm text-[#8b97ac]">Teklif bulunamadi.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f9fc]">
      <div className="mx-auto max-w-[1400px] px-6 py-8">
        {/* Breadcrumb */}
        <div className="mb-3 flex items-center gap-2 text-[12.5px] text-[#8b97ac]">
          <button
            type="button"
            onClick={() => router.push('/quotes')}
            className="bg-transparent p-0 text-[#8b97ac] hover:text-[#15356b]"
          >
            Teklifler
          </button>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-medium text-[#51607a]">
            Siparise Cevir{quote.quoteNumber ? ` · ${quote.quoteNumber}` : ''}
          </span>
        </div>

        {/* Baslik + aksiyon */}
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="m-0 text-2xl font-semibold tracking-tight text-[#14223b]">
              Teklifi Siparise Cevir
            </h1>
            <div className="mt-1.5 text-[13px] text-[#8b97ac]">
              {quote.quoteNumber} · {quote.customer?.displayName || quote.customer?.name || '-'}
              {quote.createdAt ? ` · ${formatDateShort(quote.createdAt)}` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push('/quotes')}
            className="rounded-lg border border-[#d8e0ec] bg-white px-3.5 py-2 text-[12.5px] font-medium text-[#51607a] hover:bg-[#f4f6fa]"
          >
            Tekliflere Don
          </button>
        </div>

        <div className="grid grid-cols-1 items-start gap-[18px] xl:grid-cols-[1fr_340px]">
          {/* SOL: Kalemler karti */}
          <div className={`${CARD} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eef1f6] px-4 py-3">
              <div>
                <span className="text-sm font-semibold text-[#14223b]">Kalemler</span>
                <p className="mt-0.5 text-[11px] text-[#8b97ac]">
                  Siparise cevrilecek kalemleri secin.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="rounded-md border border-[#d8e0ec] bg-white px-2.5 py-1.5 text-[11.5px] font-medium text-[#51607a] hover:bg-[#f4f6fa]"
                >
                  Tumunu Sec
                </button>
                <button
                  type="button"
                  onClick={deselectAll}
                  className="rounded-md border border-[#d8e0ec] bg-white px-2.5 py-1.5 text-[11.5px] font-medium text-[#51607a] hover:bg-[#f4f6fa]"
                >
                  Secimi Temizle
                </button>
              </div>
            </div>

            {/* Toplu sorumluluk merkezi */}
            <div className="flex flex-wrap items-center gap-2 border-b border-[#eef1f6] px-4 py-3">
              <input
                value={bulkResponsibilityCenter}
                onChange={(e) => setBulkResponsibilityCenter(e.target.value)}
                placeholder="Sorumluluk merkezi (Toplu)"
                className="h-8 w-56 rounded-md border border-[#d8e0ec] px-3 text-xs text-[#14223b] outline-none focus:border-[#15356b]"
              />
              <button
                type="button"
                onClick={applyResponsibilityToAll}
                className="rounded-md border border-[#d8e0ec] bg-white px-2.5 py-1.5 text-[11.5px] font-medium text-[#51607a] hover:bg-[#f4f6fa]"
              >
                Tum satirlara uygula
              </button>
            </div>

            {/* Tablo */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] border-collapse text-sm">
                <thead>
                  <tr className="bg-[#fafbfd] text-left text-[10px] font-semibold uppercase tracking-wide text-[#8b97ac]">
                    <th className="px-4 py-2.5">Sec</th>
                    <th className="py-2.5">Urun</th>
                    <th className="py-2.5 text-center">Durum</th>
                    <th className="py-2.5 text-center">Miktar</th>
                    <th className="py-2.5 text-right">Birim</th>
                    <th className="py-2.5 text-right">Toplam</th>
                    <th className="py-2.5 text-center">Tip</th>
                    <th className="py-2.5 text-center">Rezerve</th>
                    <th className="py-2.5">Sorumluluk</th>
                    <th className="px-4 py-2.5">Kapatma Nedeni</th>
                  </tr>
                </thead>
                <tbody>
                  {(quote.items || []).map((item) => {
                    const status = resolveItemStatus(item);
                    const isSelectable = status === 'OPEN';
                    const isSelected = isSelectable && selectedIds.has(item.id);
                    const resolvedQuantity = resolveItemQuantity(item);
                    const lineTotal = (item.unitPrice || 0) * resolvedQuantity;
                    return (
                      <tr
                        key={item.id}
                        className={`border-t border-[#f1f4f9] align-top text-xs text-[#14223b] ${
                          !isSelectable ? 'bg-[#fafbfd] text-[#8b97ac]' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleItem(item.id)}
                            className="h-[15px] w-[15px] accent-[#15356b]"
                            disabled={!isSelectable}
                          />
                        </td>
                        <td className="py-3">
                          <div className="font-medium text-[#14223b]">{item.productName}</div>
                          <div className="font-mono text-[10px] text-[#8b97ac]">
                            {item.productCode}
                          </div>
                        </td>
                        <td className="py-3 text-center">
                          <StatusBadge status={status} />
                        </td>
                        <td className="py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              className={stepBtn}
                              onClick={() => updateItemQuantity(item.id, resolvedQuantity - 1)}
                              disabled={!isSelected || resolvedQuantity <= 1}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <input
                              type="number"
                              step="0.000001"
                              className={numInput}
                              value={resolvedQuantity}
                              onChange={(e) => updateItemQuantity(item.id, Number(e.target.value))}
                              min={0.000001}
                              disabled={!isSelected}
                            />
                            <button
                              type="button"
                              className={stepBtn}
                              onClick={() => updateItemQuantity(item.id, resolvedQuantity + 1)}
                              disabled={!isSelected}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="py-3 text-right">{formatCurrency(item.unitPrice)}</td>
                        <td className="py-3 text-right font-semibold text-[#14223b]">
                          {formatCurrency(lineTotal)}
                        </td>
                        <td className="py-3 text-center">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              item.priceType === 'WHITE'
                                ? 'bg-[#f1f4f9] text-[#51607a]'
                                : 'bg-[#eef2fb] text-[#15356b]'
                            }`}
                          >
                            {item.priceType === 'WHITE' ? 'Beyaz' : 'Faturali'}
                          </span>
                        </td>
                        <td className="py-3">
                          {isSelected ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                className={stepBtn}
                                onClick={() =>
                                  updateItemReserveQty(item.id, resolveItemReserveQty(item) - 1)
                                }
                                disabled={resolveItemReserveQty(item) <= 0}
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <input
                                type="number"
                                step="0.000001"
                                className={numInput}
                                value={resolveItemReserveQty(item)}
                                onChange={(e) =>
                                  updateItemReserveQty(item.id, Number(e.target.value))
                                }
                                min={0}
                              />
                              <button
                                type="button"
                                className={stepBtn}
                                onClick={() =>
                                  updateItemReserveQty(item.id, resolveItemReserveQty(item) + 1)
                                }
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="flex justify-center text-xs text-[#b6c0d0]">-</span>
                          )}
                        </td>
                        <td className="py-3">
                          {isSelected ? (
                            <input
                              value={resolveItemResponsibility(item)}
                              onChange={(e) =>
                                updateItemResponsibility(item.id, e.target.value)
                              }
                              placeholder="Sorumluluk merkezi"
                              className="h-8 w-full min-w-[140px] rounded-md border border-[#d8e0ec] px-2.5 text-xs text-[#14223b] outline-none focus:border-[#15356b]"
                            />
                          ) : (
                            <span className="text-xs text-[#b6c0d0]">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {status === 'CLOSED' && (
                            <span className="text-xs text-[#51607a]">
                              {item.closedReason || '-'}
                            </span>
                          )}
                          {status === 'CONVERTED' && (
                            <span className="text-xs text-[#b6c0d0]">-</span>
                          )}
                          {status === 'OPEN' && isSelected && (
                            <span className="text-xs text-[#b6c0d0]">-</span>
                          )}
                          {status === 'OPEN' && !isSelected && closeUnselected && (
                            <select
                              value={closeReasons[item.id] || ''}
                              onChange={(e) =>
                                setCloseReasons((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value,
                                }))
                              }
                              className="h-8 w-full min-w-[150px] rounded-md border border-[#d8e0ec] px-2 text-xs text-[#14223b] outline-none focus:border-[#15356b]"
                            >
                              <option value="">Kapatma nedeni secin</option>
                              {CLOSE_REASONS.map((reason) => (
                                <option key={reason} value={reason}>
                                  {reason}
                                </option>
                              ))}
                            </select>
                          )}
                          {status === 'OPEN' && !isSelected && !closeUnselected && (
                            <span className="text-xs text-[#b6c0d0]">Acik kalacak</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* SAG: Siparis Bilgileri + Toplam */}
          <div className="flex flex-col gap-[14px]">
            <div className={`${CARD} p-4`}>
              <div className="mb-3 text-[13px] font-semibold text-[#14223b]">Siparis Bilgileri</div>
              <p className="mb-3 text-[11px] text-[#8b97ac]">Depo ve evrak bilgilerini girin.</p>

              <div className="flex flex-col gap-2.5">
                <div>
                  <label className="mb-1.5 block text-[11px] text-[#8b97ac]">
                    Belge No (Musteri Siparis No)
                  </label>
                  <input
                    value={documentNo}
                    onChange={(e) => setDocumentNo(e.target.value)}
                    placeholder="Musteri siparis no / belge no"
                    className="h-[38px] w-full rounded-lg border border-[#e3e8f0] px-3 text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b]"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] text-[#8b97ac]">Ctrl+Q Aciklama 1</label>
                  <input
                    value={documentDescription}
                    onChange={(e) => setDocumentDescription(e.target.value)}
                    placeholder="Orn: test"
                    className="h-[38px] w-full rounded-lg border border-[#e3e8f0] px-3 text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b]"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] text-[#8b97ac]">Depo</label>
                  {includedWarehouses.length > 0 ? (
                    <select
                      value={warehouseNo}
                      onChange={(e) => setWarehouseNo(e.target.value)}
                      className="h-[38px] w-full cursor-pointer rounded-lg border border-[#e3e8f0] px-2.5 text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b]"
                    >
                      {includedWarehouses.map((warehouse) => (
                        <option key={warehouse} value={resolveWarehouseValue(warehouse)}>
                          {warehouse}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={warehouseNo}
                      onChange={(e) => setWarehouseNo(e.target.value)}
                      placeholder="Depo"
                      className="h-[38px] w-full rounded-lg border border-[#e3e8f0] px-3 text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b]"
                    />
                  )}
                </div>

                {hasInvoiced && (
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold text-[#8b97ac]">
                      Faturali Seri
                    </label>
                    <input
                      value={invoicedSeries}
                      onChange={(e) => setInvoicedSeries(e.target.value)}
                      placeholder="Orn: HENDEK"
                      className="h-[38px] w-full rounded-lg border border-[#e3e8f0] px-3 text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b]"
                    />
                  </div>
                )}

                {hasWhite && (
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold text-[#8b97ac]">
                      Beyaz Seri
                    </label>
                    <input
                      value={whiteSeries}
                      onChange={(e) => setWhiteSeries(e.target.value)}
                      placeholder="Orn: HENDEK"
                      className="h-[38px] w-full rounded-lg border border-[#e3e8f0] px-3 text-[12.5px] text-[#14223b] outline-none focus:border-[#15356b]"
                    />
                  </div>
                )}

                <label className="mt-0.5 flex cursor-pointer items-center gap-2 text-xs text-[#51607a]">
                  <input
                    type="checkbox"
                    checked={closeUnselected}
                    onChange={(e) => setCloseUnselected(e.target.checked)}
                    className="h-[15px] w-[15px] accent-[#15356b]"
                  />
                  <span>Secilmeyen acik kalemleri kapat</span>
                </label>

                <div className="rounded-lg border border-[#e7ebf2] bg-[#f8fafc] p-3 text-[11.5px] text-[#51607a]">
                  {selectedItems.length} kalem secili.{' '}
                  {closeUnselected
                    ? `${openUnselectedItems.length} acik kalem kapatilacak.`
                    : `${openUnselectedItems.length} acik kalem acik kalacak.`}
                </div>
              </div>
            </div>

            <div className={`${CARD} p-4`}>
              <div className="mb-3.5 flex items-baseline justify-between">
                <span className="text-sm font-semibold text-[#14223b]">Toplam</span>
                <span className="text-[22px] font-semibold tracking-tight text-[#14223b]">
                  {formatCurrency(
                    selectedItems.reduce(
                      (sum, item) => sum + (item.unitPrice || 0) * resolveItemQuantity(item),
                      0
                    )
                  )}
                </span>
              </div>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#15356b] px-3 py-3 text-sm font-semibold text-white hover:bg-[#1c4585] disabled:opacity-60"
              >
                <ShoppingCart className="h-4 w-4" />
                {submitting ? 'Gonderiliyor...' : 'Siparise Cevir'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
