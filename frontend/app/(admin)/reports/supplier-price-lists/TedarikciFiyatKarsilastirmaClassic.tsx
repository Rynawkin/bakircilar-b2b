'use client';

import Link from 'next/link';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import { Download, RefreshCw, Upload, FileText } from 'lucide-react';
import {
  useTedarikciFiyatKarsilastirma,
  STATUS_TABS,
  formatPercent,
  type ExcelColumnRole,
  type PdfColumnRole,
} from './useTedarikciFiyatKarsilastirma';

/**
 * Klasik gorunum: Tedarikci Fiyat Karsilastirma raporu.
 * MEVCUT JSX BIREBIR korunmustur; tum mantik useTedarikciFiyatKarsilastirma
 * hook'undan gelir. Klasik hicbir sekilde degismez.
 */
export default function TedarikciFiyatKarsilastirmaClassic() {
  const {
    suppliers,
    uploads,
    selectedSupplierId,
    selectedFiles,
    preview,
    previewLoading,
    showAdvanced,
    setShowAdvanced,
    mapping,
    setMapping,
    activeUploadId,
    setActiveUploadId,
    activeUpload,
    activeStatus,
    setActiveStatus,
    items,
    pagination,
    loading,
    uploading,
    itemsLoading,
    excelHeaders,
    pdfColumns,
    pdfPreviewRows,
    columnCount,
    canPreview,
    uploadDisabled,
    pageSummary,
    parsePreviewNumber,
    getExcelRoleForHeader,
    handleExcelRoleChange,
    getPdfRoleForColumn,
    handlePdfColumnRoleChange,
    loadUploads,
    loadItems,
    handleSupplierChange,
    handleFileChange,
    handlePreview,
    handleUpload,
    handleDownload,
  } = useTedarikciFiyatKarsilastirma();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/reports" className="hover:text-primary-600">Raporlar</Link>
            <span>/</span>
            <span>Tedarikci Fiyat Listeleri</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Tedarikci Fiyat Karsilastirma</h1>
          <p className="text-muted-foreground">Excel veya PDF listelerini yukleyip eslesmeleri hizli goruntuleyin.</p>
        </div>
        <Button variant="outline" onClick={loadUploads} disabled={loading} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Yenile
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Yeni Liste Yukle</CardTitle>
          <CardDescription>Tedarikci secip dosyayi yukleyin (Excel veya PDF).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label="Tedarikci"
              value={selectedSupplierId}
              onChange={handleSupplierChange}
            >
              <option value="">Tedarikci secin</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </Select>
            <Input
              label="Dosyalar"
              type="file"
              multiple
              accept=".pdf,.xls,.xlsx"
              onChange={handleFileChange}
            />
            <div className="flex items-end gap-2">
              <Button
                variant="outline"
                onClick={handlePreview}
                isLoading={previewLoading}
                disabled={!canPreview}
                className="gap-2 flex-1"
              >
                <FileText className="h-4 w-4" />
                {preview ? 'Onizlemeyi Guncelle' : 'Onizleme Al'}
              </Button>
              <Button
                onClick={handleUpload}
                isLoading={uploading}
                disabled={uploadDisabled}
                className="gap-2 flex-1"
              >
                <Upload className="h-4 w-4" />
                Yukle
              </Button>
            </div>
          </div>

          {selectedFiles.length > 0 && (
            <div className="text-sm text-muted-foreground">
              {selectedFiles.length} dosya secildi.
            </div>
          )}

          {!preview && selectedFiles.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Yukleme icin once onizleme alin.
            </div>
          )}

          {preview && (
            <div className="border rounded-lg bg-gray-50 p-4 space-y-6">
              <div className="text-sm font-semibold">Onizleme</div>

              {preview.excel && (
                <div className="space-y-3">
                  <div className="text-sm font-medium">Excel Onizleme</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Select
                      label="Sheet"
                      value={mapping.excelSheetName}
                      onChange={(event) => setMapping((prev) => ({
                        ...prev,
                        excelSheetName: event.target.value,
                      }))}
                    >
                      <option value="">Sheet secin</option>
                      {preview.excel.sheetNames.map((sheet) => (
                        <option key={sheet} value={sheet}>{sheet}</option>
                      ))}
                    </Select>
                    <Input
                      label="Baslik Satiri"
                      type="number"
                      min={1}
                      value={mapping.excelHeaderRow}
                      onChange={(event) => setMapping((prev) => ({
                        ...prev,
                        excelHeaderRow: event.target.value,
                      }))}
                    />
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Kolon</TableHead>
                          <TableHead>Tip</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {excelHeaders.length ? (
                          excelHeaders.map((header) => (
                            <TableRow key={`excel-col-${header}`}>
                              <TableCell>{header || '-'}</TableCell>
                              <TableCell className="w-48">
                                <Select
                                  value={getExcelRoleForHeader(header)}
                                  onChange={(event) => handleExcelRoleChange(header, event.target.value as ExcelColumnRole)}
                                >
                                  <option value="">Yoksay</option>
                                  <option value="code">Urun Kodu</option>
                                  <option value="name">Urun Adi</option>
                                  <option value="price">Fiyat</option>
                                </Select>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={2} className="text-center text-sm text-muted-foreground">
                              Kolon bulunamadi.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Kolon tiplerini degistirirseniz onizlemeyi guncelleyin.
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Kod</TableHead>
                          <TableHead>Ad</TableHead>
                          <TableHead>Fiyat</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.excel.samples?.length ? (
                          preview.excel.samples.map((sample, index) => (
                            <TableRow key={`excel-sample-${index}`}>
                              <TableCell>{sample.code ?? '-'}</TableCell>
                              <TableCell>{sample.name ?? '-'}</TableCell>
                              <TableCell>
                                {typeof sample.price === 'number' ? formatCurrency(sample.price) : '-'}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                              Ornek bulunamadi.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {preview.pdf && (
                <div className="space-y-3">
                  <div className="text-sm font-medium">PDF Onizleme</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="text-xs text-muted-foreground">Kolonlari tiplerine gore eslestirin.</div>
                    <div className="text-xs text-muted-foreground">Kod / Ad / Fiyat secimi gerekli.</div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAdvanced((prev) => !prev)}
                        className="w-full"
                      >
                        {showAdvanced ? 'Gelismisi Gizle' : 'Gelismis Ayarlar'}
                      </Button>
                    </div>
                  </div>
                  {showAdvanced && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Input
                        label="Kod Filtresi (teknik)"
                        value={mapping.pdfCodePattern}
                        onChange={(event) => setMapping((prev) => ({
                          ...prev,
                          pdfCodePattern: event.target.value,
                        }))}
                        placeholder="Orn: [A-Z]{2}\\d+"
                      />
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    Kolon tiplerini degistirirseniz onizlemeyi guncelleyin.
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Kolon</TableHead>
                          <TableHead>Ornek Degerler</TableHead>
                          <TableHead>Tip</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pdfColumns.length ? (
                          pdfColumns.map((column) => (
                            <TableRow key={`pdf-col-${column.index}`}>
                              <TableCell>Kolon {column.index + 1}</TableCell>
                              <TableCell>
                                {column.samples.length ? column.samples.join(' | ') : '-'}
                              </TableCell>
                              <TableCell className="w-40">
                                <Select
                                  value={getPdfRoleForColumn(column.index)}
                                  onChange={(event) => handlePdfColumnRoleChange(column.index, event.target.value as PdfColumnRole)}
                                >
                                  <option value="">Yoksay</option>
                                  <option value="code">Urun Kodu</option>
                                  <option value="name">Urun Adi</option>
                                  <option value="price">Fiyat</option>
                                </Select>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                              Sayisal kolon bulunamadi.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Kod</TableHead>
                          <TableHead>Urun Adi</TableHead>
                          <TableHead>Fiyat</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pdfPreviewRows.length ? (
                          pdfPreviewRows.map((row, index) => {
                            const parsedPrice = parsePreviewNumber(row.price);
                            return (
                              <TableRow key={`pdf-sample-${index}`}>
                                <TableCell>{row.code || '-'}</TableCell>
                                <TableCell>{row.name || '-'}</TableCell>
                                <TableCell>
                                  {parsedPrice !== null ? formatCurrency(parsedPrice) : row.price || '-'}
                                </TableCell>
                              </TableRow>
                            );
                          })
                        ) : (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                              Ornek bulunamadi.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Gecmis Yuklemeler</CardTitle>
            <CardDescription>Son yuklenen raporlar.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Yukleniyor...</div>
            ) : uploads.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Kayit bulunamadi.</div>
            ) : (
              <div className="space-y-2">
                {uploads.map((upload) => (
                  <button
                    key={upload.id}
                    type="button"
                    onClick={() => setActiveUploadId(upload.id)}
                    className={`w-full text-left border rounded-lg px-3 py-2 transition ${
                      upload.id === activeUploadId
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-primary-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm">{upload.supplier?.name || 'Tedarikci'}</div>
                      <span className="text-xs text-muted-foreground">{formatDateShort(upload.createdAt)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {upload.totalItems} satir | Eslesen {upload.matchedItems} | Esmeyen {upload.unmatchedItems}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Rapor Detayi</CardTitle>
                <CardDescription>{activeUpload ? `Secili rapor: ${activeUpload.supplier?.name || '-'}` : 'Rapor secin'}</CardDescription>
              </div>
              <Button variant="outline" onClick={handleDownload} disabled={!activeUploadId} className="gap-2">
                <Download className="h-4 w-4" />
                Excel Indir
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {pageSummary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {pageSummary.map((item) => (
                  <div key={item.label} className="border rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">{item.label}</div>
                    <div className="text-lg font-semibold">{item.value}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {STATUS_TABS.map((tab) => (
                <Button
                  key={tab.key}
                  variant={activeStatus === tab.key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveStatus(tab.key)}
                >
                  {tab.label}
                </Button>
              ))}
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tedarikci Kod</TableHead>
                    <TableHead>Urun Adi</TableHead>
                    <TableHead>Liste Fiyat</TableHead>
                    <TableHead>Net Fiyat</TableHead>
                    {activeStatus === 'matched' && (
                      <>
                        <TableHead>Urun Kodu</TableHead>
                        <TableHead>Urun Adi (B2B)</TableHead>
                        <TableHead>Guncel Maliyet</TableHead>
                        <TableHead>Yeni Maliyet</TableHead>
                        <TableHead>Fark</TableHead>
                        <TableHead>Fark %</TableHead>
                      </>
                    )}
                    {activeStatus === 'multiple' && (
                      <TableHead>Eslesen Urunler</TableHead>
                    )}
                    {activeStatus === 'suspicious' && (
                      <TableHead>Eslesen Urunler</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemsLoading ? (
                    <TableRow>
                      <TableCell colSpan={columnCount} className="text-center text-sm text-muted-foreground">
                        Yukleniyor...
                      </TableCell>
                    </TableRow>
                  ) : items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={columnCount} className="text-center text-sm text-muted-foreground">
                        Kayit yok.
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((row, index) => (
                      <TableRow key={`${row.supplierCode}-${index}`}>
                        <TableCell>{row.supplierCode}</TableCell>
                        <TableCell>{row.supplierName || '-'}</TableCell>
                        <TableCell>{typeof row.sourcePrice === 'number' ? formatCurrency(row.sourcePrice) : '-'}</TableCell>
                        <TableCell>{typeof row.netPrice === 'number' ? formatCurrency(row.netPrice) : '-'}</TableCell>
                        {activeStatus === 'matched' && (
                          <>
                            <TableCell>{row.productCode}</TableCell>
                            <TableCell>{row.productName}</TableCell>
                            <TableCell>{typeof row.currentCost === 'number' ? formatCurrency(row.currentCost) : '-'}</TableCell>
                            <TableCell>{typeof row.newCost === 'number' ? formatCurrency(row.newCost) : '-'}</TableCell>
                            <TableCell>{typeof row.costDifference === 'number' ? formatCurrency(row.costDifference) : '-'}</TableCell>
                            <TableCell>{typeof row.percentDifference === 'number' ? formatPercent(row.percentDifference) : '-'}</TableCell>
                          </>
                        )}
                        {activeStatus === 'multiple' && (
                          <TableCell>{Array.isArray(row.matchedProductCodes) ? row.matchedProductCodes.join(', ') : '-'}</TableCell>
                        )}
                        {activeStatus === 'suspicious' && (
                          <TableCell>{Array.isArray(row.matchedProductCodes) ? row.matchedProductCodes.join(', ') : '-'}</TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                Toplam {pagination.total} kayit
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1 || itemsLoading}
                  onClick={() => activeUploadId && loadItems(activeUploadId, activeStatus, pagination.page - 1)}
                >
                  Onceki
                </Button>
                <span className="text-xs text-muted-foreground">
                  {pagination.page} / {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.totalPages || itemsLoading}
                  onClick={() => activeUploadId && loadItems(activeUploadId, activeStatus, pagination.page + 1)}
                >
                  Sonraki
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Notlar</CardTitle>
          <CardDescription>Iskonto ayarlari ve dosya eslestirme bilgilerini kontrol etmeyi unutmayin.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Eslesmeyen ve coklu eslesen urunler ayri listelenir. Iskonto ayarlarini tedarikci ekranindan guncelleyebilirsiniz.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
