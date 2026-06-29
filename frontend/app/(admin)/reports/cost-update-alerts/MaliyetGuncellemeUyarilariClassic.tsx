'use client';

import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  RefreshCw,
  Search,
  TrendingUp,
  Package,
  DollarSign,
  Database,
} from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { useMaliyetGuncellemeUyarilari } from './useMaliyetGuncellemeUyarilari';

/**
 * Klasik gorunum: Maliyet Guncelleme Uyarilari raporu.
 * Tum mantik useMaliyetGuncellemeUyarilari hook'undan gelir; bu component'in JSX'i
 * onceki CostUpdateAlertsPage'in `return (...)` blogu ile BIREBIR aynidir.
 *
 * getRiskLevelBadge JSX dondurur (Badge UI bilesenini kullanir) -> view'da kalmistir;
 * esikler hook'taki getRiskLevelColor ile ayni mantiktadir, degismemistir.
 */
export default function MaliyetGuncellemeUyarilariClassic() {
  const {
    data,
    summary,
    metadata,
    loading,
    error,
    isSyncing,
    isExporting,
    searchQuery,
    setSearchQuery,
    dayDiffFilter,
    setDayDiffFilter,
    percentDiffFilter,
    setPercentDiffFilter,
    page,
    setPage,
    currentCostByCode,
    vatRateByCode,
    mainSupplierByCode,
    costPInputByCode,
    setCostPInputByCode,
    costTInputByCode,
    setCostTInputByCode,
    manualCostPOverrideByCode,
    setManualCostPOverrideByCode,
    updatePriceListsByCode,
    setUpdatePriceListsByCode,
    updatingCostByCode,
    toggleSort,
    sortIndicator,
    tableScrollRef,
    bottomScrollRef,
    bottomScrollbarWidth,
    syncFromMainScroll,
    syncFromBottomScroll,
    totalPages,
    pagedData,
    stickyCodeWidth,
    stickyNameWidth,
    isFiniteNumber,
    toFixedSafe,
    formatCurrency,
    formatDate,
    getRiskLevelColor,
    fetchData,
    handleManualSync,
    handleExportExcel,
    updateProductCost,
  } = useMaliyetGuncellemeUyarilari();

  const getRiskLevelBadge = (percent: number | null | undefined) => {
    if (!isFiniteNumber(percent)) return <Badge variant="outline">-</Badge>;
    if (percent >= 20) return <Badge variant="destructive">Kritik</Badge>;
    if (percent >= 10) return <Badge className="bg-orange-500">Yüksek</Badge>;
    if (percent >= 5) return <Badge className="bg-yellow-500">Orta</Badge>;
    return <Badge className="bg-green-500">Düşük</Badge>;
  };

  return (
    <>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Link href="/reports">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Raporlara Dön
                </Button>
              </Link>
            </div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <AlertTriangle className="h-8 w-8 text-orange-500" />
              Maliyet Güncelleme Uyarıları
            </h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>Son giriş maliyeti güncel maliyetten yüksek olan ürünler (KDV Hariç)</span>
              {metadata?.lastSyncAt && (
                <div className="flex items-center gap-1">
                  <Database className="h-4 w-4" />
                  <span>
                    Son Senkronizasyon:{' '}
                    {new Date(metadata.lastSyncAt).toLocaleString('tr-TR')}
                    {metadata.syncType === 'AUTO' ? ' (Otomatik)' : ' (Manuel)'}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualSync}
              disabled={isSyncing}
            >
              <Database className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Senkronize Ediliyor...' : 'Tekrar Senkronize Et'}
            </Button>
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Yenile
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={isExporting}>
              <Download className="h-4 w-4 mr-2" />
              Excel İndir
            </Button>
          </div>
        </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Toplam Uyarı</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                <span className="text-2xl font-bold">{summary.totalAlerts}</span>
                <span className="text-muted-foreground">ürün</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Toplam Risk Tutarı</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-red-500" />
                <span className="text-2xl font-bold">
                  {formatCurrency(summary.totalRiskAmount)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Etkilenen Stok Değeri</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-blue-500" />
                <span className="text-2xl font-bold">
                  {formatCurrency(summary.totalStockValue)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Ortalama Fark</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-purple-500" />
                <span className="text-2xl font-bold">
                  %{toFixedSafe(summary.avgDiffPercent, 1)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtreler</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Arama</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Ürün kodu veya adı..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Minimum Gün Farkı</label>
              <Select
                value={dayDiffFilter}
                onChange={(e) => {
                  setDayDiffFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Tümü</option>
                <option value="7">7 gün+</option>
                <option value="15">15 gün+</option>
                <option value="30">30 gün+</option>
                <option value="60">60 gün+</option>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Minimum % Fark</label>
              <Select
                value={percentDiffFilter}
                onChange={(e) => {
                  setPercentDiffFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Tümü</option>
                <option value="5">%5+</option>
                <option value="10">%10+</option>
                <option value="20">%20+</option>
                <option value="50">%50+</option>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Yükleniyor...</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <AlertTriangle className="h-8 w-8 mx-auto mb-4 text-red-500" />
              <p className="text-red-600">{error}</p>
              <Button variant="outline" onClick={fetchData} className="mt-4">
                Tekrar Dene
              </Button>
            </div>
          ) : (
            <>
              <div
                ref={tableScrollRef}
                className="max-h-[68vh] overflow-y-auto overflow-x-scroll"
                onScroll={syncFromMainScroll}
              >
              <Table className="min-w-[2400px]" containerClassName="overflow-visible">
                <TableHeader className="sticky top-0 z-30 bg-white">
                  <TableRow>
                    <TableHead>Risk</TableHead>
                    <TableHead
                      className="sticky left-0 z-20 bg-white cursor-pointer"
                      onClick={() => toggleSort('productCode')}
                      title="Sırala"
                      style={{ minWidth: `${stickyCodeWidth}px`, width: `${stickyCodeWidth}px` }}
                    >
                      Ürün Kodu{sortIndicator('productCode')}
                    </TableHead>
                    <TableHead
                      className="sticky z-20 bg-white cursor-pointer"
                      onClick={() => toggleSort('productName')}
                      title="Sırala"
                      style={{ left: `${stickyCodeWidth}px`, minWidth: `${stickyNameWidth}px`, width: `${stickyNameWidth}px` }}
                    >
                      Ürün Adı{sortIndicator('productName')}
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('mainSupplierName')} title="Sırala">
                      Ana Sağlayıcı{sortIndicator('mainSupplierName')}
                    </TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort('currentCostDate')} title="Sırala">G. Mal. Tarihi{sortIndicator('currentCostDate')}</TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort('currentCost')} title="Sırala">Güncel Maliyet{sortIndicator('currentCost')}</TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort('lastEntryDate')} title="Sırala">S. Giriş Tarihi{sortIndicator('lastEntryDate')}</TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort('lastEntryCost')} title="Sırala">S. Giriş Maliyeti{sortIndicator('lastEntryCost')}</TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort('diffAmount')} title="Sırala">Fark (TL){sortIndicator('diffAmount')}</TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort('diffPercent')} title="Sırala">Fark (%){sortIndicator('diffPercent')}</TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort('dayDiff')} title="Sırala">Gün Farkı{sortIndicator('dayDiff')}</TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort('stockQuantity')} title="Sırala">Eldeki Stok{sortIndicator('stockQuantity')}</TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort('riskAmount')} title="Sırala">Risk Tutarı{sortIndicator('riskAmount')}</TableHead>
                    <TableHead className="text-right">Maliyet Guncelle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={14} className="text-center py-12">
                        <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-muted-foreground">Uyarı bulunamadı</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedData.map((item) => (
                      <TableRow key={item.productCode} className={getRiskLevelColor(item.diffPercent)}>
                        <TableCell>
                          {getRiskLevelBadge(item.diffPercent)}
                        </TableCell>
                        <TableCell
                          className="sticky left-0 z-10 bg-inherit font-mono text-sm"
                          style={{ minWidth: `${stickyCodeWidth}px`, width: `${stickyCodeWidth}px` }}
                        >
                          {item.productCode}
                        </TableCell>
                        <TableCell
                          className="sticky z-10 bg-inherit max-w-xs truncate"
                          style={{ left: `${stickyCodeWidth}px`, minWidth: `${stickyNameWidth}px`, width: `${stickyNameWidth}px` }}
                        >
                          {item.productName}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {(() => {
                            const supplier = mainSupplierByCode[String(item.productCode || '').trim().toUpperCase()];
                            if (!supplier) return '-';
                            return `${supplier.code}${supplier.name ? ` - ${supplier.name}` : ''}`;
                          })()}
                        </TableCell>
                        <TableCell className="text-right text-sm">{formatDate(item.currentCostDate)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(currentCostByCode[String(item.productCode || '').trim().toUpperCase()] ?? item.currentCost)}
                        </TableCell>
                        <TableCell className="text-right text-sm text-green-600">
                          {formatDate(item.lastEntryDate)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-red-600">
                          {formatCurrency(item.lastEntryCost)}
                        </TableCell>
                        <TableCell className="text-right font-bold text-red-600">
                          {formatCurrency(item.diffAmount)}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          %{toFixedSafe(item.diffPercent, 1)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline">
                            {isFiniteNumber(item.dayDiff) ? `${item.dayDiff} gün` : '-'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{toFixedSafe(item.stockQuantity, 0)}</TableCell>
                        <TableCell className="text-right font-bold text-red-700">
                          {formatCurrency(item.riskAmount)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={costPInputByCode[String(item.productCode || '').trim().toUpperCase()] ?? ''}
                              onChange={(e) => {
                                const code = String(item.productCode || '').trim().toUpperCase();
                                const rawValue = e.target.value;
                                setCostPInputByCode((prev) => ({ ...prev, [code]: rawValue }));
                                if (manualCostPOverrideByCode[code]) return;
                                const parsed = Number(String(rawValue || '').replace(',', '.'));
                                if (!Number.isFinite(parsed)) return;
                                const vatRate = Number(vatRateByCode[code] ?? 0);
                                const vatPercent = vatRate <= 1 ? vatRate * 100 : vatRate;
                                const autoCostP = parsed * (1 + vatPercent / 200);
                                setCostTInputByCode((prev) => ({
                                  ...prev,
                                  [code]: Number.isFinite(autoCostP) ? autoCostP.toFixed(4).replace(/\.?0+$/, '') : prev[code] || '',
                                }));
                              }}
                              className="h-8 w-20 text-right"
                              title="Maliyet T"
                              placeholder="T"
                            />
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={costTInputByCode[String(item.productCode || '').trim().toUpperCase()] ?? ''}
                              onChange={(e) => {
                                const code = String(item.productCode || '').trim().toUpperCase();
                                setManualCostPOverrideByCode((prev) => ({ ...prev, [code]: true }));
                                setCostTInputByCode((prev) => ({ ...prev, [code]: e.target.value }));
                              }}
                              className="h-8 w-20 text-right"
                              title="Maliyet P"
                              placeholder="P"
                            />
                            <label className="inline-flex items-center gap-1 text-[10px] text-gray-600">
                              <input
                                type="checkbox"
                                checked={Boolean(updatePriceListsByCode[String(item.productCode || '').trim().toUpperCase()])}
                                onChange={(e) => {
                                  const code = String(item.productCode || '').trim().toUpperCase();
                                  setUpdatePriceListsByCode((prev) => ({ ...prev, [code]: e.target.checked }));
                                }}
                              />
                              10 liste
                            </label>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateProductCost(item.productCode)}
                              disabled={Boolean(updatingCostByCode[String(item.productCode || '').trim().toUpperCase()])}
                            >
                              {updatingCostByCode[String(item.productCode || '').trim().toUpperCase()] ? '...' : 'Guncelle'}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              </div>
              <div
                ref={bottomScrollRef}
                className="h-4 overflow-x-scroll overflow-y-hidden border-t bg-gray-50"
                onScroll={syncFromBottomScroll}
              >
                <div style={{ width: `${bottomScrollbarWidth}px`, height: '1px' }} />
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Sayfa {page} / {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Önceki
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      Sonraki
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      </div>
    </>
  );
}
