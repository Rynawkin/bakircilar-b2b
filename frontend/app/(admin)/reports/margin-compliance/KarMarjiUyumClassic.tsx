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
import { Badge } from '@/components/ui/Badge';
import {
  useKarMarjiUyum,
  MARGIN_EXCLUSION_TYPE_LABELS,
  GENERAL_EXCLUSION_TYPE_LABELS,
} from './useKarMarjiUyum';
import type { MarginExclusionType, GeneralExclusionType } from './useKarMarjiUyum';

/**
 * Klasik gorunum: Kar Marji Analizi (019703) raporu.
 * Mevcut tasarim BIREBIR korunmustur; tum mantik useKarMarjiUyum hook'undan gelir.
 */
export default function KarMarjiUyumClassic() {
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
    activeExclusions,
    excludedByUserRules,
    exclusionType,
    setExclusionType,
    exclusionSearch,
    setExclusionSearch,
    exclusionOptions,
    exclusionOptionsLoading,
    exclusionNameInput,
    setExclusionNameInput,
    savingExclusion,
    deletingExclusionId,
    handleAddExclusionOption,
    handleAddNameExclusion,
    handleDeleteExclusion,
    exclusionsPanelOpen,
    setExclusionsPanelOpen,
    exclusionsTab,
    setExclusionsTab,
    generalExclusions,
    activeGeneralExclusions,
    generalExclusionsLoading,
    generalExclusionsForbidden,
    generalFormType,
    setGeneralFormType,
    generalFormValue,
    setGeneralFormValue,
    generalFormDescription,
    setGeneralFormDescription,
    savingGeneralExclusion,
    deletingGeneralExclusionId,
    handleAddGeneralExclusion,
    handleDeleteGeneralExclusion,
    syncingReport,
    sendingReportEmail,
    isSingleDate,
    columnDefs,
    visibleColumnDefs,
    filteredData,
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
    renderSummaryBucket,
  } = useKarMarjiUyum();

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
                  <CardTitle className="text-sm font-medium">Kar % (Kar/Ciro)</CardTitle>
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
                        <TableHead className="text-right whitespace-nowrap">Kar</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Kar %</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Zararli Evrak</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Zararli Satir</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Ciro</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Kar</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Kar %</TableHead>
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
              <button
                type="button"
                onClick={() => setExclusionsPanelOpen(!exclusionsPanelOpen)}
                className={`inline-flex items-center gap-1 rounded-md border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-700 transition-colors ${
                  exclusionsPanelOpen ? 'bg-red-100' : 'bg-red-50 hover:bg-red-100'
                }`}
              >
                🚫 Dislamalar ({activeExclusions.length + activeGeneralExclusions.length})
              </button>
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

            {/* Dislamalar paneli — butonla acilir, iki sekme: Marj / Genel */}
            {exclusionsPanelOpen && (
              <div className="mt-4 rounded-lg border border-gray-200 overflow-hidden">
                <div className="flex border-b border-gray-200 bg-gray-50">
                  {[
                    ['MARGIN', `Marj Raporu Dislamalari (${activeExclusions.length})`],
                    ['GENERAL', `Genel Rapor Dislamalari (${activeGeneralExclusions.length})`],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setExclusionsTab(key as 'MARGIN' | 'GENERAL')}
                      className={`px-4 py-2.5 text-sm font-semibold border-b-2 ${
                        exclusionsTab === key
                          ? 'border-primary-600 bg-white text-primary-700'
                          : 'border-transparent text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {exclusionsTab === 'MARGIN' ? (
                  <div className="p-4">
                    <p className="text-xs text-gray-500 mb-3">Sadece marj raporunu etkiler.</p>

                    <div className="space-y-2">
                      {activeExclusions.length === 0 ? (
                        <p className="text-xs text-gray-500">Aktif dislama kurali yok.</p>
                      ) : (
                        activeExclusions.map((exclusion) => (
                          <div key={exclusion.id} className="flex items-center gap-2 text-sm text-gray-700">
                            <Badge variant="outline">{MARGIN_EXCLUSION_TYPE_LABELS[exclusion.type]}</Badge>
                            <span className="font-medium truncate">
                              {exclusion.value}
                              {exclusion.label && exclusion.label !== exclusion.value ? ` — ${exclusion.label}` : ''}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteExclusion(exclusion)}
                              disabled={deletingExclusionId === exclusion.id}
                            >
                              Sil
                            </Button>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <select
                        value={exclusionType}
                        onChange={(e) => setExclusionType(e.target.value as MarginExclusionType)}
                        className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                      >
                        <option value="BRAND">Marka</option>
                        <option value="PRODUCT_CODE">Urun Kodu</option>
                        <option value="PRODUCT_NAME">Urun Adi (metin)</option>
                      </select>
                      {exclusionType === 'PRODUCT_NAME' ? (
                        <>
                          <Input
                            value={exclusionNameInput}
                            onChange={(e) => setExclusionNameInput(e.target.value)}
                            placeholder="Urun adinda gecen ifade..."
                            className="flex-1 min-w-[220px]"
                          />
                          <Button
                            size="sm"
                            onClick={handleAddNameExclusion}
                            isLoading={savingExclusion}
                            disabled={savingExclusion}
                          >
                            Ekle
                          </Button>
                        </>
                      ) : (
                        <Input
                          value={exclusionSearch}
                          onChange={(e) => setExclusionSearch(e.target.value)}
                          placeholder={exclusionType === 'BRAND' ? 'Marka ara...' : 'Urun kodu veya adi ara...'}
                          className="flex-1 min-w-[220px]"
                        />
                      )}
                    </div>

                    {exclusionType === 'PRODUCT_NAME' ? (
                      <p className="mt-2 text-xs text-gray-500">Urun adinda gecen ifadeyle eslesir (kismi eslesme).</p>
                    ) : (
                      <div className="mt-2 max-h-52 overflow-y-auto rounded-md border border-gray-200">
                        {exclusionOptionsLoading ? (
                          <p className="p-3 text-xs text-gray-500">Yukleniyor...</p>
                        ) : exclusionOptions.length === 0 ? (
                          <p className="p-3 text-xs text-gray-500">Sonuc bulunamadi.</p>
                        ) : (
                          exclusionOptions.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => handleAddExclusionOption(option)}
                              disabled={savingExclusion}
                              className="flex w-full items-center justify-between gap-2 border-b border-gray-100 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                            >
                              <span className="truncate">
                                {exclusionType === 'BRAND' ? option.label : `${option.value} — ${option.label}`}
                              </span>
                              {typeof option.productCount === 'number' && (
                                <span className="whitespace-nowrap text-xs text-gray-400">{option.productCount} urun</span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                    <p className="mt-2 text-xs text-gray-500">
                      Dislama eklenince/silinince rapor otomatik yenilenir; gecmis veri silinmez, kural silinince satirlar geri gelir.
                    </p>
                  </div>
                ) : (
                  <div className="p-4">
                    <p className="text-xs text-gray-500 mb-3">
                      Ucarer satis gecmisi, MinMax v2, top urunler, musteri kurtarma gibi satis-istatistigi raporlarini etkiler.
                    </p>

                    {generalExclusionsForbidden ? (
                      <p className="text-xs font-semibold text-amber-700">
                        Bu bolumu goruntuleme yetkiniz yok (admin:exclusions).
                      </p>
                    ) : (
                      <>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={generalFormType}
                        onChange={(e) => setGeneralFormType(e.target.value as GeneralExclusionType)}
                        className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                      >
                        {Object.entries(GENERAL_EXCLUSION_TYPE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <Input
                        value={generalFormValue}
                        onChange={(e) => setGeneralFormValue(e.target.value)}
                        placeholder={generalFormType === 'PRODUCT_CODE' ? 'Orn: B106430' : 'Deger girin'}
                        className="flex-1 min-w-[180px]"
                      />
                      <Input
                        value={generalFormDescription}
                        onChange={(e) => setGeneralFormDescription(e.target.value)}
                        placeholder="Aciklama (opsiyonel)"
                        className="flex-1 min-w-[180px]"
                      />
                      <Button
                        size="sm"
                        onClick={handleAddGeneralExclusion}
                        isLoading={savingGeneralExclusion}
                        disabled={savingGeneralExclusion}
                      >
                        Ekle
                      </Button>
                    </div>

                    <div className="mt-3 space-y-2">
                      {generalExclusionsLoading ? (
                        <p className="text-xs text-gray-500">Yukleniyor...</p>
                      ) : generalExclusions.length === 0 ? (
                        <p className="text-xs text-gray-500">Genel dislama kurali yok.</p>
                      ) : (
                        generalExclusions.map((exclusion) => (
                          <div key={exclusion.id} className="flex items-center gap-2 text-sm text-gray-700">
                            <Badge variant="outline">{GENERAL_EXCLUSION_TYPE_LABELS[exclusion.type]}</Badge>
                            <span className="font-medium truncate">
                              {exclusion.value}
                              {exclusion.description ? ` — ${exclusion.description}` : ''}
                            </span>
                            {!exclusion.active && (
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
                                Pasif
                              </span>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteGeneralExclusion(exclusion)}
                              disabled={deletingGeneralExclusionId === exclusion.id}
                            >
                              Sil
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

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
              {excludedByUserRules > 0 && (
                <span className="mt-1 block text-amber-600">
                  Dislama kurallariniz bu aralikta {formatCount(excludedByUserRules)} satiri rapordan dusurdu.
                </span>
              )}
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
