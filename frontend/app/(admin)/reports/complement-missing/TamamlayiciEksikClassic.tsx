'use client';

import Link from 'next/link';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { ArrowLeft, RefreshCw, Package, Users, AlertTriangle } from 'lucide-react';
import { useTamamlayiciEksik, type ComplementMissingItem } from './useTamamlayiciEksik';

/**
 * Klasik gorunum: Tamamlayici Urun Eksikleri raporu.
 * MEVCUT JSX birebir korunmustur; tum mantik useTamamlayiciEksik hook'undan gelir.
 */
export default function TamamlayiciEksikClassic() {
  const {
    mode,
    setMode,
    matchMode,
    setMatchMode,
    productSearch,
    setProductSearch,
    productCode,
    setProductCode,
    productName,
    setProductName,
    productOptions,
    productSearching,
    customerSearch,
    setCustomerSearch,
    customerCode,
    setCustomerCode,
    customerName,
    setCustomerName,
    customerOptions,
    customerSearching,
    periodMonths,
    setPeriodMonths,
    sectorCode,
    setSectorCode,
    sectorOptions,
    salesRepId,
    setSalesRepId,
    salesRepOptions,
    minDocumentEnabled,
    setMinDocumentEnabled,
    minDocumentCount,
    setMinDocumentCount,
    submitted,
    rows,
    summary,
    metadata,
    loading,
    error,
    page,
    setPage,
    totalPages,
    exporting,
    actionRow,
    actionType,
    actionNote,
    setActionNote,
    actionSaving,
    matchModeLabel,
    showProductMode,
    showProductTable,
    parseProductOption,
    parseCustomerOption,
    formatMoney,
    formatQuantity,
    handleSelectProduct,
    handleSelectCustomer,
    handleRunReport,
    fetchReport,
    handleExport,
    openActionModal,
    closeActionModal,
    handleActionSubmit,
    handleCreateQuote,
  } = useTamamlayiciEksik();

  const renderMissingList = (items: ComplementMissingItem[]) => {
    if (items.length === 0) return '-';

    return (
      <div className="space-y-2">
        {items.map((item) => {
          const hasEstimate =
            Number.isFinite(item.estimatedQuantity) ||
            Number.isFinite(item.unitPrice) ||
            Number.isFinite(item.estimatedRevenue);

          return (
            <div key={`${item.productCode}-${item.productName}`} className="text-xs">
              <div>
                <span className="font-mono">{item.productCode}</span>
                <span className="text-gray-600"> - {item.productName}</span>
              </div>
              {hasEstimate && (
                <div className="text-[11px] text-gray-500">
                  {formatQuantity(item.estimatedQuantity)} x {formatMoney(item.unitPrice)} = {formatMoney(item.estimatedRevenue)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

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
            <Package className="h-8 w-8 text-primary-600" />
            Tamamlayici Urun Eksikleri
          </h1>
          <p className="text-sm text-muted-foreground">
            Fatura ve irsaliye hareketlerine gore eksik tamamlayici urunleri listeler
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={!submitted || exporting}
            isLoading={exporting}
          >
            Excel Indir
          </Button>
          <Button variant="outline" size="sm" onClick={() => submitted && fetchReport(submitted, page)}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Yenile
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtreler</CardTitle>
          <CardDescription>
            Rapor modu, temel kod ve tarih araligi secin
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Rapor Modu</label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={mode === 'product' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMode('product')}
                >
                  Urun Bazli
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

            <div className="space-y-2">
              <label className="text-sm font-medium">Eslesme Tipi</label>
              <Select
                value={matchMode}
                onChange={(e) => setMatchMode(e.target.value as 'product' | 'category' | 'group')}
              >
                <option value="product">Urun Bazli</option>
                <option value="category">Kategori Bazli</option>
                <option value="group">Grup Bazli</option>
              </Select>
            </div>

            {showProductMode ? (
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    label="Urun Ara"
                    placeholder="Kod veya isim ile ara"
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setProductCode('');
                      setProductName('');
                    }}
                  />
                  {productSearching && (
                    <div className="absolute right-3 top-9 text-xs text-gray-500">Araniyor...</div>
                  )}
                  {!productCode && productOptions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                      {productOptions.map((item, index) => {
                        const parsed = parseProductOption(item);
                        if (!parsed.code) return null;
                        return (
                          <button
                            type="button"
                            key={`${parsed.code}-${index}`}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50"
                            onClick={() => handleSelectProduct(item)}
                          >
                            <div className="text-sm font-semibold">{parsed.code}</div>
                            <div className="text-xs text-gray-500">{parsed.name || '-'} </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {productName && (
                  <div className="text-xs text-gray-500">Secilen urun: {productName}</div>
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
                            <div className="text-xs text-gray-500">{parsed.name || '-'} </div>
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
              <label className="text-sm font-medium">Tarih Araligi</label>
              <Select value={String(periodMonths)} onChange={(e) => setPeriodMonths(Number(e.target.value) as 6 | 12)}>
                <option value="6">Son 6 Ay</option>
                <option value="12">Son 12 Ay</option>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Sektor</label>
              <Select value={sectorCode} onChange={(e) => setSectorCode(e.target.value)}>
                <option value="">Tum sektorler</option>
                {sectorOptions.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Satis Temsilcisi</label>
              <Select value={salesRepId} onChange={(e) => setSalesRepId(e.target.value)}>
                <option value="">Tum temsilciler</option>
                {salesRepOptions.map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.name || rep.email || rep.id}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Minimum Evrak</label>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={minDocumentEnabled}
                  onChange={(e) => setMinDocumentEnabled(e.target.checked)}
                  className="h-4 w-4 accent-primary-600"
                />
                <Input
                  type="number"
                  min="1"
                  value={minDocumentCount}
                  onChange={(e) => setMinDocumentCount(e.target.value)}
                  disabled={!minDocumentEnabled}
                  className="w-32"
                />
              </div>
            </div>
          </div>

          <div className="mt-4">
            <Button onClick={handleRunReport}>
              Raporu Getir
            </Button>
          </div>
        </CardContent>
      </Card>

      {metadata && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Rapor Modu</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold">
                {metadata.mode === 'product' ? 'Urun' : 'Cari'}
              </div>
              <div className="text-sm text-muted-foreground">
                Eslesme: {matchModeLabel}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Temel Kayit</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-semibold">
                {metadata.baseProduct
                  ? `${metadata.baseProduct.productCode} - ${metadata.baseProduct.productName}`
                  : metadata.customer
                    ? `${metadata.customer.customerCode} - ${metadata.customer.customerName || '-'}`
                    : '-'}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Aralik</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-semibold">
                {metadata.periodMonths} Ay ( {metadata.startDate} - {metadata.endDate} )
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Segment</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-semibold">
                Sektor: {metadata.sectorCode || '-'}
              </div>
              <div className="text-xs text-muted-foreground">
                Temsilci: {metadata.salesRep?.name || metadata.salesRep?.email || '-'}
              </div>
              <div className="text-xs text-muted-foreground">
                Min evrak: {metadata.minDocumentCount ?? '-'}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Toplam Kayit</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" />
                <span className="text-2xl font-bold">{summary.totalRows}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Eksik Tamamlayici</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                <span className="text-2xl font-bold">{summary.totalMissing}</span>
              </div>
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
              <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground">Veri bulunamadi</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    {showProductTable ? (
                      <>
                        <TableHead>Cari Kodu</TableHead>
                        <TableHead>Cari Adi</TableHead>
                      </>
                    ) : (
                      <>
                        <TableHead>Urun Kodu</TableHead>
                        <TableHead>Urun Adi</TableHead>
                      </>
                    )}
                    <TableHead className="text-right">Evrak</TableHead>
                    <TableHead>Eksik Tamamlayicilar</TableHead>
                    <TableHead className="text-right">Potansiyel Aylik Gelir</TableHead>
                    <TableHead className="text-right">Adet</TableHead>
                    <TableHead className="text-right">Aksiyon</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => {
                    const customerCodeValue = showProductTable ? row.customerCode : metadata?.customer?.customerCode;
                    const canCreateQuote = Boolean(customerCodeValue) && row.missingComplements.length > 0;
                    const hasRevenue = row.missingComplements.some((item) => Number.isFinite(item.estimatedRevenue));
                    const rowPotentialRevenue = hasRevenue
                      ? row.missingComplements.reduce((sum, item) => sum + (item.estimatedRevenue || 0), 0)
                      : null;

                    return (
                      <TableRow key={`${row.customerCode || row.productCode}-${index}`}>
                        {showProductTable ? (
                          <>
                            <TableCell className="font-mono text-sm">{row.customerCode}</TableCell>
                            <TableCell>{row.customerName || '-'}</TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="font-mono text-sm">{row.productCode}</TableCell>
                            <TableCell>{row.productName || '-'}</TableCell>
                          </>
                        )}
                        <TableCell className="text-right">{row.documentCount ?? '-'}</TableCell>
                        <TableCell>{renderMissingList(row.missingComplements)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatMoney(rowPotentialRevenue)}</TableCell>
                        <TableCell className="text-right font-semibold">{row.missingCount}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => openActionModal(row, 'note')}>
                              Not Ekle
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => openActionModal(row, 'campaign')}>
                              Kampanya Oner
                            </Button>
                            <Button variant="primary" size="sm" onClick={() => handleCreateQuote(row)} disabled={!canCreateQuote}>
                              Teklif Olustur
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
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

      <Modal
        isOpen={Boolean(actionType)}
        onClose={closeActionModal}
        title={actionType === 'campaign' ? 'Kampanya Onerisi' : 'Not Ekle'}
        footer={
          <>
            <Button variant="outline" onClick={closeActionModal}>
              Iptal
            </Button>
            <Button variant="primary" onClick={handleActionSubmit} isLoading={actionSaving} disabled={actionSaving}>
              Kaydet
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          {actionRow && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-xs text-gray-500">Hedef</div>
              <div className="font-semibold">
                {showProductTable
                  ? `${actionRow.customerCode || '-'} - ${actionRow.customerName || ''}`
                  : `${actionRow.productCode || '-'} - ${actionRow.productName || ''}`}
              </div>
              <div className="mt-2 text-xs text-gray-500">Eksikler</div>
              {renderMissingList(actionRow.missingComplements)}
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Not</label>
            <textarea
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
              rows={4}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="Notunuzu yazin"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
