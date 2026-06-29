'use client';

import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import {
  TrendingUp,
  ArrowLeft,
  Download,
  RefreshCw,
  Search,
  AlertCircle,
  DollarSign,
  Package,
  FileText,
  Percent,
} from 'lucide-react';
import Link from 'next/link';
import { useKarAnalizi } from './useKarAnalizi';
import type { SummaryBucket } from './useKarAnalizi';

/**
 * Klasik gorunum: Kar Marji Analizi (019703) raporu.
 * MEVCUT JSX BIREBIR korunmustur; tum mantik useKarAnalizi hook'undan gelir.
 */
export default function KarAnaliziClassic() {
  const {
    data,
    summary,
    metadata,
    loading,
    error,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    sortOrder,
    setSortOrder,
    page,
    setPage,
    totalPages,
    visibleColumns,
    emailColumnIds,
    savingEmailColumns,
    includedSectorCodes,
    setIncludedSectorCodes,
    availableSectorCodes,
    savingSectorCodes,
    syncingReport,
    sendingReportEmail,
    isSingleDate,
    fetchData,
    handleSearch,
    toggleColumn,
    toggleIncludedSectorCode,
    handleResyncReport,
    handleSendReportEmail,
    handleSaveEmailColumns,
    handleSaveIncludedSectorCodes,
    exportToExcel,
    formatCurrency,
    formatPercent,
    formatCount,
    formatDate,
    columnDefs,
    visibleColumnDefs,
    filteredData,
  } = useKarAnalizi();

  const renderSummaryBucket = (title: string, bucket: SummaryBucket) => (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>KDV haric degerler</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Toplam Evrak</span>
            <span className="font-semibold">{formatCount(bucket.totalDocuments)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Toplam Satir</span>
            <span className="font-semibold">{formatCount(bucket.totalRecords)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Ciro (KDV Haric)</span>
            <span className="font-semibold">{formatCurrency(bucket.totalRevenue)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Kar (Guncel, KDV Haric)</span>
            <span className="font-semibold">{formatCurrency(bucket.totalProfit)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Kar (Son Giris)</span>
            <span className="font-semibold">{formatCurrency(bucket.entryProfit)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Kar % (Guncel)</span>
            <span className="font-semibold">{formatPercent(bucket.avgMargin)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Zararli Evrak</span>
            <span className="font-semibold">{formatCount(bucket.negativeDocuments)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Zararli Satir</span>
            <span className="font-semibold">{formatCount(bucket.negativeLines)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gray-50">

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/reports">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Raporlar
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Kar MarjÄ± Analizi</h1>
              <p className="text-sm text-gray-600 mt-1">
                Bekleyen sipariÅŸler ve faturalarÄ±n kar marjÄ± detaylarÄ± (019703 Raporu)
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={exportToExcel} variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Excel Ä°ndir
            </Button>
            <Button onClick={fetchData} variant="outline" size="sm" disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="mb-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Toplam Satir</CardTitle>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCount(summary.totalRecords)}</div>
                  <p className="text-xs text-muted-foreground">Satir sayisi</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Toplam Evrak</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCount(summary.totalDocuments)}</div>
                  <p className="text-xs text-muted-foreground">Evrak sayisi</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Satis Cirosu</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(summary.salesSummary.totalRevenue)}</div>
                  <p className="text-xs text-muted-foreground">Sadece satis, KDV Haric</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Toplam Kar (Guncel)</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(summary.totalProfit)}</div>
                  <p className="text-xs text-muted-foreground">Teklif kolonlari bazli, KDV Haric</p>
                </CardContent>
              </Card>


              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Toplam Kar (Son Giris)</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(summary.entryProfit)}</div>
                  <p className="text-xs text-muted-foreground">SÃ– kolonlari bazli</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Kar % (Guncel)</CardTitle>
                  <Percent className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatPercent(summary.avgMargin)}</div>
                  <p className="text-xs text-muted-foreground">
                    Yuksek: {formatCount(summary.highMarginCount)} | Dusuk: {formatCount(summary.lowMarginCount)} | Zarar: {formatCount(summary.negativeMarginCount)}
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {renderSummaryBucket('Siparis Ozeti', summary.orderSummary)}
              {renderSummaryBucket('Satis Ozeti', summary.salesSummary)}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Satis Personeli Ozeti</CardTitle>
                <CardDescription>Gunluk siparis ve satis performansi (KDV haric)</CardDescription>
              </CardHeader>
              <CardContent>
                {summary.salespersonSummary.length === 0 ? (
                  <p className="text-sm text-gray-500">Kayit bulunamadi.</p>
                ) : (
                  <Table containerClassName="max-h-[60vh]" className="min-w-[960px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead rowSpan={2} className="whitespace-nowrap">Satis Personeli</TableHead>
                        <TableHead colSpan={5} className="text-center whitespace-nowrap">Siparis</TableHead>
                        <TableHead colSpan={5} className="text-center whitespace-nowrap">Satis</TableHead>
                      </TableRow>
                      <TableRow>
                        <TableHead className="text-right whitespace-nowrap">Ciro</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Kar (Guncel)</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Kar % (Guncel)</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Zararli Evrak</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Zararli Satir</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Ciro</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Kar (Guncel)</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Kar % (Guncel)</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Zararli Evrak</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Zararli Satir</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.salespersonSummary.map((entry) => (
                        <TableRow key={entry.sectorCode}>
                          <TableCell className="font-medium whitespace-nowrap">{entry.sectorCode}</TableCell>
                          <TableCell className="text-right">{formatCurrency(entry.orderSummary.totalRevenue)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(entry.orderSummary.totalProfit)}</TableCell>
                          <TableCell className="text-right">{formatPercent(entry.orderSummary.avgMargin)}</TableCell>
                          <TableCell className="text-right">{formatCount(entry.orderSummary.negativeDocuments)}</TableCell>
                          <TableCell className="text-right">{formatCount(entry.orderSummary.negativeLines)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(entry.salesSummary.totalRevenue)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(entry.salesSummary.totalProfit)}</TableCell>
                          <TableCell className="text-right">{formatPercent(entry.salesSummary.avgMargin)}</TableCell>
                          <TableCell className="text-right">{formatCount(entry.salesSummary.negativeDocuments)}</TableCell>
                          <TableCell className="text-right">{formatCount(entry.salesSummary.negativeLines)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filtreler</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-5">
              <div>
                <label className="text-sm font-medium mb-2 block">BaÅŸlangÄ±Ã§ Tarihi</label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">BitiÅŸ Tarihi</label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Kar Durumu</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">TÃ¼mÃ¼</option>
                  <option value="HIGH">YÃ¼ksek Kar (&gt;30%)</option>
                  <option value="OK">Normal Kar (10-30%)</option>
                  <option value="LOW">DÃ¼ÅŸÃ¼k Kar (&lt;10%)</option>
                  <option value="NEGATIVE">Zarar (&lt;0%)</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">SÄ±ralama</label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="desc">Kar % Azalan</option>
                  <option value="asc">Kar % Artan</option>
                </select>
              </div>

              <div className="flex items-end">
                <Button onClick={handleSearch} className="w-full">
                  <Search className="mr-2 h-4 w-4" />
                  Ara
                </Button>
              </div>
            </div>

            <div className="mt-4">
              <Input
                placeholder="Stok kodu, Ã¼rÃ¼n adÄ±, evrak no veya cari ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleResyncReport}
                isLoading={syncingReport}
                disabled={!isSingleDate || syncingReport}
              >
                Secili Gunu Yeniden Cek
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSendReportEmail}
                isLoading={sendingReportEmail}
                disabled={!isSingleDate || sendingReportEmail}
              >
                Mail Gonder
              </Button>
              <span className="text-xs text-gray-500">Tek gun secili olmali.</span>
            </div>

            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-gray-700">
                Hesaplamaya Dahil Sektor Kodlari ({includedSectorCodes.length || 'Varsayilan'})
              </summary>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIncludedSectorCodes(availableSectorCodes)}
                  disabled={availableSectorCodes.length === 0}
                >
                  Tumunu Sec
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIncludedSectorCodes([])}
                >
                  Varsayilana Don
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveIncludedSectorCodes}
                  isLoading={savingSectorCodes}
                  disabled={savingSectorCodes}
                >
                  Sektor Kodlarini Kaydet
                </Button>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {availableSectorCodes.map((sectorCode) => (
                  <label key={sectorCode} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={includedSectorCodes.includes(sectorCode)}
                      onChange={() => toggleIncludedSectorCode(sectorCode)}
                    />
                    {sectorCode}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Secim kaydedilirse rapor o sektor kodlariyla hesaplanir. Bos birakilirsa varsayilan SATIS kodlari kullanilir.
              </p>
            </details>

            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-gray-700">
                Kolonlar ({visibleColumns.length}/{columnDefs.length})
              </summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {columnDefs.map((column) => (
                  <label key={column.id} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={visibleColumns.includes(column.id)}
                      onChange={() => toggleColumn(column.id)}
                    />
                    {column.label}
                  </label>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveEmailColumns}
                  isLoading={savingEmailColumns}
                  disabled={savingEmailColumns}
                >
                  Mail Excel Kolonlarini Kaydet
                </Button>
                <span className="text-xs text-gray-500">
                  Kayitli mail kolonlari: {emailColumnIds.length > 0 ? emailColumnIds.length : 'Varsayilan'}
                </span>
              </div>
              <p className="mt-2 text-xs text-gray-500">En az bir kolon seÃ§ili olmalÄ±.</p>
            </details>
          </CardContent>
        </Card>

        {/* Data Table */}
        <Card>
          <CardHeader>
            <CardTitle>Kar MarjÄ± DetaylarÄ±</CardTitle>
            <CardDescription>
              {metadata && `Rapor Tarihi: ${formatDate(metadata.reportDate)} | Tarih AralÄ±ÄŸÄ±: ${metadata.startDate} - ${metadata.endDate}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
                <p className="text-red-600 font-medium">{error}</p>
              </div>
            ) : filteredData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Package className="h-12 w-12 text-gray-400 mb-4" />
                <p className="text-gray-600">Veri bulunamadÄ±</p>
              </div>
            ) : (
              <>
                <Table containerClassName="max-h-[70vh]" className="min-w-max">
                  <TableHeader>
                    <TableRow>
                      {visibleColumnDefs.map((column) => (
                        <TableHead key={column.id} className={column.headerClassName}>
                          {column.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.map((row, idx) => (
                      <TableRow key={`${row.msg_S_0089}-${row.msg_S_0001}-${idx}`}>
                        {visibleColumnDefs.map((column) => (
                          <TableCell key={column.id} className={column.cellClassName}>
                            {column.render(row)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-sm text-gray-600">
                      Sayfa {page} / {totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        variant="outline"
                        size="sm"
                      >
                        Ã–nceki
                      </Button>
                      <Button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        variant="outline"
                        size="sm"
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
    </div>
  );
}
