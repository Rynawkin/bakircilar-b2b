'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import {
  CLOSE_REASONS,
  getStatusBadge,
  resolveItemStatus,
  resolveWarehouseValue,
  useSiparisCevir,
} from './useSiparisCevir';

/**
 * Klasik gorunum — mevcut JSX BIREBIR korunmustur. Tum mantik useSiparisCevir'dan gelir.
 */
export default function SiparisCevirClassic() {
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
                      <th>Durum</th>
                      <th className="text-right">Miktar</th>
                      <th className="text-right">Birim</th>
                      <th className="text-right">Toplam</th>
                      <th>Tip</th>
                      <th className="text-right">Rezerve</th>
                      <th>Sorumluluk</th>
                      <th>Kapatma Nedeni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(quote.items || []).map((item) => {
                      const status = resolveItemStatus(item);
                      const isSelectable = status === 'OPEN';
                      const isSelected = isSelectable && selectedIds.has(item.id);
                      const resolvedQuantity = resolveItemQuantity(item);
                      const lineTotal = (item.unitPrice || 0) * resolvedQuantity;
                      return (
                        <tr
                          key={item.id}
                          className={`align-top ${!isSelectable ? 'bg-slate-50 text-gray-500' : ''}`}
                        >
                          <td className="py-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleItem(item.id)}
                              className="h-4 w-4 accent-primary-600"
                              disabled={!isSelectable}
                            />
                          </td>
                          <td className="py-3">
                            <div className="font-medium text-gray-900">{item.productName}</div>
                            <div className="text-xs text-gray-500">{item.productCode}</div>
                          </td>
                          <td className="py-3">{getStatusBadge(status)}</td>
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
                                step="0.000001"
                                className="w-16 rounded border border-slate-200 px-2 py-1 text-right text-xs"
                                value={resolvedQuantity}
                                onChange={(e) => updateItemQuantity(item.id, Number(e.target.value))}
                                min={0.000001}
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
                          <td className="py-3 text-right">
                            {isSelected ? (
                              <div className="inline-flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  className="h-6 w-6 rounded border border-slate-200 text-xs text-gray-600 hover:bg-slate-50 disabled:opacity-40"
                                  onClick={() => updateItemReserveQty(item.id, resolveItemReserveQty(item) - 1)}
                                  disabled={resolveItemReserveQty(item) <= 0}
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  step="0.000001"
                                  className="w-16 rounded border border-slate-200 px-2 py-1 text-right text-xs"
                                  value={resolveItemReserveQty(item)}
                                  onChange={(e) => updateItemReserveQty(item.id, Number(e.target.value))}
                                  min={0}
                                />
                                <button
                                  type="button"
                                  className="h-6 w-6 rounded border border-slate-200 text-xs text-gray-600 hover:bg-slate-50"
                                  onClick={() => updateItemReserveQty(item.id, resolveItemReserveQty(item) + 1)}
                                >
                                  +
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
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
                            {status === 'CLOSED' && (
                              <span className="text-xs text-gray-600">
                                {item.closedReason || '-'}
                              </span>
                            )}
                            {status === 'CONVERTED' && (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                            {status === 'OPEN' && isSelected && (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                            {status === 'OPEN' && !isSelected && closeUnselected && (
                              <Select
                                value={closeReasons[item.id] || ''}
                                onChange={(e) =>
                                  setCloseReasons((prev) => ({
                                    ...prev,
                                    [item.id]: e.target.value,
                                  }))
                                }
                                className="text-xs"
                              >
                                <option value="">Kapatma nedeni secin</option>
                                {CLOSE_REASONS.map((reason) => (
                                  <option key={reason} value={reason}>
                                    {reason}
                                  </option>
                                ))}
                              </Select>
                            )}
                            {status === 'OPEN' && !isSelected && !closeUnselected && (
                              <span className="text-xs text-gray-400">Acik kalacak</span>
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

                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={closeUnselected}
                    onChange={(e) => setCloseUnselected(e.target.checked)}
                    className="h-4 w-4 accent-primary-600"
                  />
                  <span>Secilmeyen acik kalemleri kapat</span>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-xs text-gray-600">
                  {selectedItems.length} kalem secili.{' '}
                  {closeUnselected
                    ? `${openUnselectedItems.length} acik kalem kapatilacak.`
                    : `${openUnselectedItems.length} acik kalem acik kalacak.`}
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
