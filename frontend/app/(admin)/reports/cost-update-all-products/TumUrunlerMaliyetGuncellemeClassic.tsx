'use client';

import Link from 'next/link';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  useTumUrunlerMaliyetGuncelleme,
  COLUMN_DEFS,
  STICKY_CODE_WIDTH,
  STICKY_NAME_WIDTH,
  toMoney,
  toDate,
} from './useTumUrunlerMaliyetGuncelleme';

/**
 * Klasik gorunum: Tum Urunler Maliyet ve Fiyat Guncelleme.
 * MEVCUT JSX BIREBIR korunmustur; tum mantik hook'tan gelir.
 */
export default function TumUrunlerMaliyetGuncellemeClassic() {
  const {
    loading,
    refreshing,
    search,
    setSearch,
    page,
    setPage,
    totalRecords,
    visibleColumns,
    mainSupplierByCode,
    costPInputByCode,
    setCostPInputByCode,
    costTInputByCode,
    setCostTInputByCode,
    manualCostPOverrideByCode,
    setManualCostPOverrideByCode,
    vatRateByCode,
    setUpdatePriceListsByCode,
    updatingByCode,
    currentCostOverrideByCode,
    priceListOverrideByCode,
    confirmModalOpen,
    setConfirmModalOpen,
    pendingUpdate,
    setPendingUpdate,
    filteredAndSortedRows,
    totalPages,
    pagedRows,
    loadData,
    toggleSort,
    sortIndicator,
    toggleColumn,
    shouldUpdatePriceLists,
    executeCostUpdate,
    updateCost,
  } = useTumUrunlerMaliyetGuncelleme();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/reports">
            <Button variant="ghost" size="sm" className="mb-2">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Raporlara Don
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Tum Urunler Maliyet ve Fiyat Guncelleme</h1>
          <p className="text-sm text-gray-600">Tum aktif urunleri gor, kolonlarini sec, sirala ve maliyet + 10 liste guncelle.</p>
        </div>
        <Button variant="outline" onClick={() => loadData(false)} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Yenile
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtre ve Kolonlar</CardTitle>
          <CardDescription>Kolon secimini kaydeder, tekrar girdiginde ayni gorunur.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Urun adi, kod, kategori, ana saglayici..."
          />
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
            {COLUMN_DEFS.map((column) => (
              <label key={column.id} className="inline-flex items-center gap-2 rounded border px-2 py-1 text-xs">
                <input
                  type="checkbox"
                  checked={visibleColumns.includes(column.id)}
                  onChange={() => toggleColumn(column.id)}
                  disabled={column.id === 'productCode' || column.id === 'productName'}
                />
                {column.label}
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-600">
            Toplam urun: <strong>{totalRecords.toLocaleString('tr-TR')}</strong> | Filtre sonucu: <strong>{filteredAndSortedRows.length.toLocaleString('tr-TR')}</strong> | Bu sayfa: <strong>{pagedRows.length.toLocaleString('tr-TR')}</strong>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-600">Yukleniyor...</div>
          ) : (
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-max min-w-[2400px] text-xs">
                <thead className="sticky top-0 z-10 bg-gray-100">
                  <tr>
                    {visibleColumns.map((column) => (
                      <th
                        key={column}
                        className={`cursor-pointer whitespace-nowrap border-b px-2 py-2 text-left ${
                          column === 'productCode'
                            ? 'sticky left-0 z-30 bg-gray-100 shadow-[2px_0_0_0_rgba(229,231,235,1)]'
                            : column === 'productName'
                            ? 'sticky z-30 bg-gray-100 shadow-[2px_0_0_0_rgba(229,231,235,1)]'
                            : ''
                        }`}
                        onClick={() => toggleSort(column)}
                        style={
                          column === 'productCode'
                            ? { minWidth: `${STICKY_CODE_WIDTH}px`, width: `${STICKY_CODE_WIDTH}px` }
                            : column === 'productName'
                            ? { left: `${STICKY_CODE_WIDTH}px`, minWidth: `${STICKY_NAME_WIDTH}px`, width: `${STICKY_NAME_WIDTH}px` }
                            : undefined
                        }
                      >
                        {COLUMN_DEFS.find((c) => c.id === column)?.label}{sortIndicator(column)}
                      </th>
                    ))}
                    <th className="whitespace-nowrap border-b px-2 py-2 text-left">Maliyet Guncelle</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((item) => {
                    const code = String(item?.mikroCode || '').trim().toUpperCase();
                    const supplier = mainSupplierByCode[code];
                    const mikroPriceLists = item?.mikroPriceLists || {};
                    const overriddenLists = priceListOverrideByCode[code] || {};
                    const currentCost = Number(currentCostOverrideByCode[code] ?? item?.currentCost ?? 0);
                    const vatRate = Number(vatRateByCode[code] ?? item?.vatRate ?? 0);
                    return (
                      <tr key={code} className="border-b">
                        {visibleColumns.map((column) => {
                          let value: React.ReactNode = '-';
                          if (column === 'productCode') value = code;
                          else if (column === 'productName') value = item?.name || '-';
                          else if (column === 'mainSupplier') value = supplier ? `${supplier.code} - ${supplier.name}` : '-';
                          else if (column === 'category') value = item?.category?.name || '-';
                          else if (column === 'stock') value = Number(item?.totalStock ?? 0).toLocaleString('tr-TR');
                          else if (column === 'currentCost') value = toMoney(currentCost);
                          else if (column === 'lastEntryPrice') value = toMoney(item?.lastEntryPrice ?? 0);
                          else if (column === 'lastEntryDate') value = toDate(item?.lastEntryDate);
                          else if (column.startsWith('list')) {
                            const listNo = Number(column.replace('list', ''));
                            value = toMoney(overriddenLists[listNo] ?? mikroPriceLists[listNo] ?? 0);
                          }
                          return (
                            <td
                              key={`${code}-${column}`}
                              className={`whitespace-nowrap px-2 py-2 ${
                                column === 'productCode'
                                  ? 'sticky left-0 z-20 bg-white font-mono shadow-[2px_0_0_0_rgba(229,231,235,1)]'
                                  : column === 'productName'
                                  ? 'sticky z-20 bg-white shadow-[2px_0_0_0_rgba(229,231,235,1)]'
                                  : ''
                              }`}
                              style={
                                column === 'productCode'
                                  ? { minWidth: `${STICKY_CODE_WIDTH}px`, width: `${STICKY_CODE_WIDTH}px` }
                                  : column === 'productName'
                                  ? { left: `${STICKY_CODE_WIDTH}px`, minWidth: `${STICKY_NAME_WIDTH}px`, width: `${STICKY_NAME_WIDTH}px` }
                                  : undefined
                              }
                            >
                              {value}
                            </td>
                          );
                        })}
                        <td className="whitespace-nowrap px-2 py-2">
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={costPInputByCode[code] ?? ''}
                              onChange={(e) => {
                                const raw = e.target.value;
                                setCostPInputByCode((prev) => ({ ...prev, [code]: raw }));
                                if (manualCostPOverrideByCode[code]) return;
                                const parsed = Number(String(raw || '').replace(',', '.'));
                                if (!Number.isFinite(parsed)) return;
                                const vatPercent = vatRate <= 1 ? vatRate * 100 : vatRate;
                                const autoCostT = parsed * (1 + vatPercent / 200);
                                setCostTInputByCode((prev) => ({
                                  ...prev,
                                  [code]: Number.isFinite(autoCostT) ? autoCostT.toFixed(4).replace(/\.?0+$/, '') : prev[code] || '',
                                }));
                              }}
                              className="h-8 w-20 text-right"
                              placeholder="T"
                            />
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={costTInputByCode[code] ?? ''}
                              onChange={(e) => {
                                setManualCostPOverrideByCode((prev) => ({ ...prev, [code]: true }));
                                setCostTInputByCode((prev) => ({ ...prev, [code]: e.target.value }));
                              }}
                              className="h-8 w-20 text-right"
                              placeholder="P"
                            />
                            <label className="inline-flex items-center gap-1 text-[10px] text-gray-600">
                              <input
                                type="checkbox"
                                checked={shouldUpdatePriceLists(code)}
                                onChange={(e) => setUpdatePriceListsByCode((prev) => ({ ...prev, [code]: e.target.checked }))}
                              />
                              10 liste
                            </label>
                            <Button size="sm" variant="outline" onClick={() => updateCost(item)} disabled={Boolean(updatingByCode[code])}>
                              {updatingByCode[code] ? '...' : 'Guncelle'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t p-3">
              <p className="text-xs text-gray-600">Sayfa {page} / {totalPages}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page <= 1}>
                  Onceki
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={page >= totalPages}>
                  Sonraki
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {confirmModalOpen && pendingUpdate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
            <p className="text-base font-semibold text-gray-900">Maliyet Artis Onayi</p>
            <div className="mt-3 space-y-1 text-sm text-gray-700">
              <p><strong>Urun:</strong> {pendingUpdate.code}</p>
              <p><strong>Eski Maliyet:</strong> {toMoney(pendingUpdate.oldCost)}</p>
              <p><strong>Yeni Maliyet:</strong> {toMoney(pendingUpdate.costP)}</p>
              <p>
                <strong>Artis:</strong>{' '}
                {pendingUpdate.oldCost > 0
                  ? `%${(((pendingUpdate.costP - pendingUpdate.oldCost) / pendingUpdate.oldCost) * 100).toLocaleString('tr-TR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`
                  : 'Hesaplanamadi'}
              </p>
              <p className="text-xs text-gray-600">10 fiyat listesi de bu maliyete gore guncellenecek.</p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setConfirmModalOpen(false);
                  setPendingUpdate(null);
                }}
              >
                Vazgec
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  const payload = pendingUpdate;
                  setConfirmModalOpen(false);
                  setPendingUpdate(null);
                  await executeCostUpdate(payload.code, payload.costP, payload.costT);
                }}
              >
                Onayla ve Guncelle
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
