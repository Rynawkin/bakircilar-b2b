'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import {
  useTeklifKalemleri,
  STATUS_OPTIONS,
  CLOSE_REASONS,
  getStatusBadge,
} from './useTeklifKalemleri';

export default function TeklifKalemleriClassic() {
  const {
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
    page,
    setPage,
    total,
    totalPages,
    items,
    sortedItems,
    loading,
    actionId,
    closeReasonMap,
    setCloseReasonMap,
    selectedOpenIds,
    openItemIds,
    allSelected,
    selectAllRef,
    bulkReason,
    setBulkReason,
    bulkClosing,
    loadItems,
    handleCloseItem,
    toggleSelectAll,
    toggleSelectItem,
    handleBulkClose,
    handleReopenItem,
    setSelectedIds,
  } = useTeklifKalemleri();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container-custom max-w-[1400px] py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Teklif Kalemleri</h1>
            <p className="text-sm text-gray-600">
              Acik ve kapali kalemleri filtreleyip yonetin.
            </p>
          </div>
          <Button variant="secondary" onClick={loadItems} disabled={loading}>
            Yenile
          </Button>
        </div>

        <Card>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Durum</label>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Arama</label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Urun/kod, cari/kod, teklif/belge no"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Kapatma Nedeni</label>
              <Select
                value={closeReasonFilter}
                onChange={(e) => setCloseReasonFilter(e.target.value)}
              >
                <option value="">Tum nedenler</option>
                {CLOSE_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Min Gun</label>
              <Input
                type="number"
                min={0}
                value={minDays}
                onChange={(e) => setMinDays(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Max Gun</label>
              <Input
                type="number"
                min={0}
                value={maxDays}
                onChange={(e) => setMaxDays(e.target.value)}
                placeholder="999"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Siralama</label>
              <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="created_desc">Yeni teklif ustte</option>
                <option value="created_asc">Eski teklif ustte</option>
                <option value="waiting_desc">Bekleme suresi (cok-az)</option>
                <option value="waiting_asc">Bekleme suresi (az-cok)</option>
                <option value="total_desc">Tutar (buyuk-kucuk)</option>
                <option value="total_asc">Tutar (kucuk-buyuk)</option>
              </Select>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
            <div className="text-sm text-gray-600">
              Secili: <span className="font-medium text-gray-900">{selectedOpenIds.length}</span>
            </div>
            <div className="min-w-[220px]">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Toplu kapatma nedeni
              </label>
              <Select value={bulkReason} onChange={(e) => setBulkReason(e.target.value)}>
                <option value="">Kapatma nedeni secin</option>
                {CLOSE_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="danger"
                onClick={handleBulkClose}
                disabled={!bulkReason || selectedOpenIds.length === 0 || bulkClosing}
              >
                {bulkClosing ? 'Kapatiliyor...' : 'Secilileri Kapat'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setSelectedIds([])}
                disabled={selectedOpenIds.length === 0 || bulkClosing}
              >
                Secimi Temizle
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-gray-500">Yukleniyor...</div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">Kayit bulunamadi.</div>
          ) : (
            <Table containerClassName="max-h-[70vh]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <div className="flex items-center justify-center">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        className="h-4 w-4 accent-slate-600"
                        checked={allSelected}
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                        disabled={openItemIds.length === 0}
                        aria-label="Tum acik kalemleri sec"
                      />
                    </div>
                  </TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Bekleme</TableHead>
                  <TableHead>Teklif</TableHead>
                  <TableHead>Musteri</TableHead>
                  <TableHead>Urun</TableHead>
                  <TableHead className="text-right">Adet</TableHead>
                  <TableHead className="text-right">Birim</TableHead>
                  <TableHead className="text-right">Toplam</TableHead>
                  <TableHead>Islem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedItems.map((item) => {
                  const status = item.status || 'OPEN';
                  const quoteNumber = item.quote?.quoteNumber || '-';
                  const documentNo = item.quote?.documentNo || '-';
                  const customerName =
                    item.quote?.customer?.displayName ||
                    item.quote?.customer?.name ||
                    '-';
                  const customerCode = item.quote?.customer?.mikroCariCode;
                  const waiting = item.waitingDays ?? '-';
                  const isSelected = selectedOpenIds.includes(item.id);
                  return (
                    <TableRow key={item.id} className={isSelected ? 'bg-slate-50' : undefined}>
                      <TableCell className="w-10">
                        {status === 'OPEN' ? (
                          <div className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-slate-600"
                              checked={isSelected}
                              onChange={(e) => toggleSelectItem(item.id, e.target.checked)}
                              aria-label="Kalem sec"
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">-</span>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(status)}</TableCell>
                      <TableCell className="text-xs text-gray-600">
                        {waiting !== '-' ? `${waiting} gun` : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-gray-900">{quoteNumber}</div>
                        <div className="text-xs text-gray-500">Belge: {documentNo}</div>
                        {item.quote?.createdAt && (
                          <div className="text-xs text-gray-400">
                            {formatDateShort(item.quote.createdAt)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-gray-900">{customerName}</div>
                        {customerCode && (
                          <div className="text-xs text-gray-500">{customerCode}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-gray-900">{item.productName}</div>
                        <div className="text-xs text-gray-500">{item.productCode}</div>
                      </TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(item.unitPrice)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(item.totalPrice)}
                      </TableCell>
                      <TableCell>
                        {status === 'OPEN' && (
                          <div className="flex flex-col gap-2">
                            <Select
                              value={closeReasonMap[item.id] || ''}
                              onChange={(e) =>
                                setCloseReasonMap((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value,
                                }))
                              }
                            >
                              <option value="">Kapatma nedeni secin</option>
                              {CLOSE_REASONS.map((reason) => (
                                <option key={reason} value={reason}>
                                  {reason}
                                </option>
                              ))}
                            </Select>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => handleCloseItem(item)}
                              disabled={!closeReasonMap[item.id] || actionId === item.id}
                            >
                              {actionId === item.id ? 'Kapatiliyor...' : 'Kapat'}
                            </Button>
                          </div>
                        )}
                        {status === 'CLOSED' && (
                          <div className="flex flex-col gap-2">
                            <span className="text-xs text-gray-500">
                              {item.closedReason || '-'}
                            </span>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleReopenItem(item)}
                              disabled={actionId === item.id}
                            >
                              {actionId === item.id ? 'Aciliyor...' : 'Ac'}
                            </Button>
                          </div>
                        )}
                        {status === 'CONVERTED' && (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
            <div>Toplam {total} kayit</div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page <= 1 || loading}
                >
                  Onceki
                </Button>
                <span>
                  Sayfa {page} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page >= totalPages || loading}
                >
                  Sonraki
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
