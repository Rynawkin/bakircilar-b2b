'use client';

import Link from 'next/link';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { ArrowLeft, Download, RefreshCw, AlertTriangle, Layers, Users } from 'lucide-react';
import { Fragment, formatCurrency, useKategoriAlimKaybi } from './useKategoriAlimKaybi';

/**
 * Klasik gorunum: Kategori Alim Kaybi Raporu.
 * MEVCUT JSX BIREBIR korunmustur; sadece `return (` oncesindeki mantik
 * useKategoriAlimKaybi hook'una tasinmistir. Hicbir oge degismedi.
 */
export default function KategoriAlimKaybiClassic() {
  const {
    mode,
    setMode,
    categorySearch,
    setCategorySearch,
    categoryCode,
    setCategoryCode,
    categoryName,
    setCategoryName,
    categoryOptions,
    categorySearching,
    customerSearch,
    setCustomerSearch,
    customerCode,
    setCustomerCode,
    customerName,
    setCustomerName,
    customerOptions,
    customerSearching,
    inactiveMonths,
    setInactiveMonths,
    activeFilterEnabled,
    setActiveFilterEnabled,
    activeCustomerMonths,
    setActiveCustomerMonths,
    submitted,
    rows,
    summary,
    metadata,
    loading,
    exporting,
    error,
    page,
    setPage,
    totalPages,
    sortBy,
    openDetailKey,
    detailLoadingKey,
    detailsByKey,
    tableMode,
    detailColSpan,
    parseCustomerOption,
    handleSelectCustomer,
    handleSelectCategory,
    runReport,
    fetchReport,
    handleSort,
    sortIndicator,
    handleExport,
    getRowKey,
    toggleDetail,
  } = useKategoriAlimKaybi();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Link href="/reports">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Raporlara Don
            </Button>
          </Link>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Layers className="h-8 w-8 text-primary-600" />
            Kategori Alim Kaybi Raporu
          </h1>
          <p className="text-sm text-muted-foreground">
            Musterinin daha once alip secili suredir almadigi kategorileri listeler
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!submitted || loading || exporting}>
            <Download className="h-4 w-4 mr-2" />
            {exporting ? 'Aktariliyor...' : "Excel'e Aktar"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => submitted && fetchReport(submitted, page)} disabled={!submitted}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Yenile
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtreler</CardTitle>
          <CardDescription>
            Kategori bazli veya cari bazli raporu secin
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Rapor Modu</label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={mode === 'category' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMode('category')}
                >
                  Kategori Bazli
                </Button>
                <Button
                  type="button"
                  variant={mode === 'customer' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMode('customer')}
                >
                  Cari Bazli
                </Button>
              </div>
            </div>

            {mode === 'category' ? (
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    label="Kategori Ara"
                    placeholder="Kategori kodu veya adi ile ara"
                    value={categorySearch}
                    onChange={(e) => {
                      setCategorySearch(e.target.value);
                      setCategoryCode('');
                      setCategoryName('');
                    }}
                  />
                  {categorySearching && (
                    <div className="absolute right-3 top-9 text-xs text-gray-500">Araniyor...</div>
                  )}
                  {!categoryCode && categoryOptions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                      {categoryOptions.map((item, index) => (
                        <button
                          type="button"
                          key={`${item.categoryCode}-${index}`}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50"
                          onClick={() => handleSelectCategory(item)}
                        >
                          <div className="text-sm font-semibold">{item.categoryCode}</div>
                          <div className="text-xs text-gray-500">{item.categoryName || '-'}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {categoryCode && (
                  <div className="text-xs text-gray-500">
                    Secilen kategori: {categoryCode} {categoryName ? `- ${categoryName}` : ''}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    label="Cari Ara"
                    placeholder="Kod veya isim ile ara"
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setCustomerCode('');
                      setCustomerName('');
                    }}
                  />
                  {customerSearching && (
                    <div className="absolute right-3 top-9 text-xs text-gray-500">Araniyor...</div>
                  )}
                  {!customerCode && customerOptions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                      {customerOptions.map((item, index) => {
                        const parsed = parseCustomerOption(item);
                        if (!parsed.code) return null;
                        return (
                          <button
                            type="button"
                            key={`${parsed.code}-${index}`}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50"
                            onClick={() => handleSelectCustomer(item)}
                          >
                            <div className="text-sm font-semibold">{parsed.code}</div>
                            <div className="text-xs text-gray-500">{parsed.name || '-'}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {customerName && (
                  <div className="text-xs text-gray-500">Secilen cari: {customerName}</div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Alim Yok Suresi (Ay)</label>
              <Select value={inactiveMonths} onChange={(e) => setInactiveMonths(e.target.value)}>
                <option value="2">Son 2 Ay</option>
                <option value="3">Son 3 Ay</option>
                <option value="4">Son 4 Ay</option>
                <option value="6">Son 6 Ay</option>
                <option value="12">Son 12 Ay</option>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Aktif Cari Filtresi</label>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={activeFilterEnabled}
                  onChange={(e) => setActiveFilterEnabled(e.target.checked)}
                  className="h-4 w-4 accent-primary-600"
                />
                <Input
                  type="number"
                  min="1"
                  value={activeCustomerMonths}
                  onChange={(e) => setActiveCustomerMonths(e.target.value)}
                  disabled={!activeFilterEnabled}
                  className="w-32"
                />
                <span className="text-xs text-muted-foreground">ayda satisi olanlar</span>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <Button onClick={runReport}>Raporu Getir</Button>
          </div>
        </CardContent>
      </Card>

      {metadata && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Mod</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold">
                {metadata.mode === 'category' ? 'Kategori Bazli' : 'Cari Bazli'}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Alim Kesilme Araligi</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-semibold">
                {metadata.inactiveStartDate} - {metadata.endDate}
              </div>
              <div className="text-xs text-muted-foreground">
                {metadata.inactiveMonths} aydir alim yok
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Secim</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-semibold">
                {metadata.category
                  ? `${metadata.category.categoryCode} - ${metadata.category.categoryName || '-'}`
                  : metadata.customer
                    ? `${metadata.customer.customerCode} - ${metadata.customer.customerName || '-'}`
                    : '-'}
              </div>
              <div className="text-xs text-muted-foreground">
                Aktif cari filtresi: {metadata.activeCustomerMonths ? `Son ${metadata.activeCustomerMonths} ay` : 'Yok'}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Toplam Kayit</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalRows}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Etkilenen Cari</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" />
                <span className="text-2xl font-bold">{summary.affectedCustomers}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Etkilenen Kategori</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.affectedCategories}</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Yukleniyor...</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <AlertTriangle className="h-8 w-8 mx-auto mb-4 text-red-500" />
              <p className="text-red-600">{error}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center">
              <Layers className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground">Veri bulunamadi</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    {tableMode === 'category' ? (
                      <>
                        <TableHead>
                          <button type="button" className="inline-flex items-center gap-1" onClick={() => handleSort('customerCode')}>
                            Cari Kodu <span className="text-[10px]">{sortIndicator('customerCode')}</span>
                          </button>
                        </TableHead>
                        <TableHead>
                          <button type="button" className="inline-flex items-center gap-1" onClick={() => handleSort('customerName')}>
                            Cari Adi <span className="text-[10px]">{sortIndicator('customerName')}</span>
                          </button>
                        </TableHead>
                        <TableHead>
                          <button type="button" className="inline-flex items-center gap-1" onClick={() => handleSort('customerSectorCode')}>
                            Sektor Kodu <span className="text-[10px]">{sortIndicator('customerSectorCode')}</span>
                          </button>
                        </TableHead>
                        <TableHead>
                          <button type="button" className="inline-flex items-center gap-1" onClick={() => handleSort('categoryCode')}>
                            Kategori <span className="text-[10px]">{sortIndicator('categoryCode')}</span>
                          </button>
                        </TableHead>
                      </>
                    ) : (
                      <>
                        <TableHead>
                          <button type="button" className="inline-flex items-center gap-1" onClick={() => handleSort('categoryCode')}>
                            Kategori Kodu <span className="text-[10px]">{sortIndicator('categoryCode')}</span>
                          </button>
                        </TableHead>
                        <TableHead>
                          <button type="button" className="inline-flex items-center gap-1" onClick={() => handleSort('categoryName')}>
                            Kategori Adi <span className="text-[10px]">{sortIndicator('categoryName')}</span>
                          </button>
                        </TableHead>
                        <TableHead>
                          <button type="button" className="inline-flex items-center gap-1" onClick={() => handleSort('customerSectorCode')}>
                            Sektor Kodu <span className="text-[10px]">{sortIndicator('customerSectorCode')}</span>
                          </button>
                        </TableHead>
                      </>
                    )}
                    <TableHead>
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => handleSort('lastPurchaseDate')}>
                        Son Alim Tarihi <span className="text-[10px]">{sortIndicator('lastPurchaseDate')}</span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => handleSort('customerLastSaleDate')}>
                        Cari Son Satis <span className="text-[10px]">{sortIndicator('customerLastSaleDate')}</span>
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button type="button" className="inline-flex items-center gap-1 justify-end w-full" onClick={() => handleSort('historicalDocumentCount')}>
                        Gecmis Evrak <span className="text-[10px]">{sortIndicator('historicalDocumentCount')}</span>
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button type="button" className="inline-flex items-center gap-1 justify-end w-full" onClick={() => handleSort('historicalQuantity')}>
                        Gecmis Miktar <span className="text-[10px]">{sortIndicator('historicalQuantity')}</span>
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button type="button" className="inline-flex items-center gap-1 justify-end w-full" onClick={() => handleSort('historicalAmount')}>
                        Gecmis Tutar <span className="text-[10px]">{sortIndicator('historicalAmount')}</span>
                      </button>
                    </TableHead>
                    <TableHead className="text-right">Detay</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => {
                    const rowKey = getRowKey(row, index);
                    const detailOpen = openDetailKey === rowKey;
                    const detailLoading = detailLoadingKey === rowKey;
                    const detailItems = detailsByKey[rowKey] || [];

                    return (
                      <Fragment key={rowKey}>
                        <TableRow key={`${rowKey}-main`}>
                          {tableMode === 'category' ? (
                            <>
                              <TableCell className="font-mono text-sm">{row.customerCode || '-'}</TableCell>
                              <TableCell>{row.customerName || '-'}</TableCell>
                              <TableCell className="font-mono text-sm">{row.customerSectorCode || '-'}</TableCell>
                              <TableCell className="font-mono text-sm">{row.categoryCode || '-'}</TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell className="font-mono text-sm">{row.categoryCode || '-'}</TableCell>
                              <TableCell>{row.categoryName || '-'}</TableCell>
                              <TableCell className="font-mono text-sm">{row.customerSectorCode || '-'}</TableCell>
                            </>
                          )}
                          <TableCell>{row.lastPurchaseDate || '-'}</TableCell>
                          <TableCell>{row.customerLastSaleDate || '-'}</TableCell>
                          <TableCell className="text-right">{row.historicalDocumentCount}</TableCell>
                          <TableCell className="text-right">
                            {Number(row.historicalQuantity || 0).toLocaleString('tr-TR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(Number(row.historicalAmount || 0))}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" onClick={() => toggleDetail(row, index)}>
                              {detailOpen ? 'Detayi Kapat' : 'Detay Ac'}
                            </Button>
                          </TableCell>
                        </TableRow>
                        {detailOpen && (
                          <TableRow key={`${rowKey}-detail`}>
                            <TableCell colSpan={detailColSpan} className="bg-slate-50">
                              {detailLoading ? (
                                <div className="py-3 text-sm text-slate-600">Detay yukleniyor...</div>
                              ) : detailItems.length === 0 ? (
                                <div className="py-3 text-sm text-slate-600">Bu satir icin detay bulunamadi.</div>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="min-w-full text-xs">
                                    <thead>
                                      <tr className="border-b border-slate-200 text-slate-600">
                                        <th className="text-left py-2 pr-3">Urun Kodu</th>
                                        <th className="text-left py-2 pr-3">Urun Adi</th>
                                        <th className="text-left py-2 pr-3">Ilk Alim</th>
                                        <th className="text-left py-2 pr-3">Son Alim</th>
                                        <th className="text-right py-2 pr-3">Evrak</th>
                                        <th className="text-right py-2 pr-3">Miktar</th>
                                        <th className="text-right py-2">Tutar</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {detailItems.map((item, detailIndex) => (
                                        <tr key={`${rowKey}-detail-${detailIndex}`} className="border-b border-slate-100">
                                          <td className="py-2 pr-3 font-mono">{item.productCode}</td>
                                          <td className="py-2 pr-3">{item.productName}</td>
                                          <td className="py-2 pr-3">{item.firstPurchaseDate || '-'}</td>
                                          <td className="py-2 pr-3">{item.lastPurchaseDate || '-'}</td>
                                          <td className="py-2 pr-3 text-right">{item.documentCount}</td>
                                          <td className="py-2 pr-3 text-right">
                                            {Number(item.totalQuantity || 0).toLocaleString('tr-TR', {
                                              minimumFractionDigits: 2,
                                              maximumFractionDigits: 2,
                                            })}
                                          </td>
                                          <td className="py-2 text-right font-semibold">
                                            {formatCurrency(Number(item.totalAmount || 0))}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Sayfa {page} / {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                      disabled={page === 1}
                    >
                      Onceki
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
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
  );
}
