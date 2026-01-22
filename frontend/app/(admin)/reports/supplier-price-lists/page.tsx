'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { adminApi } from '@/lib/api/admin';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import { Download, RefreshCw, Upload, FileText } from 'lucide-react';

interface Supplier {
  id: string;
  name: string;
}

interface UploadItem {
  id: string;
  createdAt: string;
  status: string;
  supplier?: Supplier;
  totalItems: number;
  matchedItems: number;
  unmatchedItems: number;
  multiMatchItems: number;
}

interface PreviewExcel {
  sheetNames: string[];
  sheetName: string;
  headerRow: number | null;
  headers: string[];
  detected: {
    code: string | null;
    name: string | null;
    price: string | null;
  };
  samples: Array<{ code?: string | null; name?: string | null; price?: number | null }>;
}

interface PreviewPdf {
  priceIndex: number | null;
  codePattern: string | null;
  samples: Array<{
    supplierCode: string;
    prices: number[];
    selectedPrice: number | null;
    rawLine: string;
  }>;
}

interface PreviewData {
  excel?: PreviewExcel | null;
  pdf?: PreviewPdf | null;
}

interface MappingState {
  excelSheetName: string;
  excelHeaderRow: string;
  excelCodeHeader: string;
  excelNameHeader: string;
  excelPriceHeader: string;
  pdfPriceIndex: string;
  pdfCodePattern: string;
}

type ExcelColumnRole = '' | 'code' | 'name' | 'price';

const STATUS_TABS = [
  { key: 'matched', label: 'Eslesenler' },
  { key: 'unmatched', label: 'Esmeyenler' },
  { key: 'multiple', label: 'Coklu Eslesenler' },
] as const;

type StatusKey = typeof STATUS_TABS[number]['key'];

const EMPTY_MAPPING: MappingState = {
  excelSheetName: '',
  excelHeaderRow: '',
  excelCodeHeader: '',
  excelNameHeader: '',
  excelPriceHeader: '',
  pdfPriceIndex: '',
  pdfCodePattern: '',
};

const parseOptionalInt = (value: string) => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const formatPercent = (value: number) => {
  const formatted = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `${formatted}%`;
};

export default function SupplierPriceListsPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [mapping, setMapping] = useState<MappingState>(EMPTY_MAPPING);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [activeUpload, setActiveUpload] = useState<UploadItem | null>(null);
  const [activeStatus, setActiveStatus] = useState<StatusKey>('matched');
  const [items, setItems] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);

  const excelHeaders = useMemo(() => {
    if (!preview?.excel?.headers?.length) return [];
    return preview.excel.headers.filter((header) => header && header.trim());
  }, [preview]);

  const pdfColumnCandidates = useMemo(() => {
    if (!preview?.pdf?.samples?.length) return [];
    const maxCount = Math.max(...preview.pdf.samples.map((sample) => sample.prices.length));
    if (!Number.isFinite(maxCount) || maxCount <= 0) return [];
    return Array.from({ length: maxCount }, (_, index) => {
      const samples = preview.pdf.samples
        .map((sample) => sample.prices[index])
        .filter((value): value is number => typeof value === 'number')
        .slice(0, 3);
      return { index: index + 1, samples };
    });
  }, [preview]);

  const getExcelRoleForHeader = (header: string): ExcelColumnRole => {
    if (mapping.excelCodeHeader === header) return 'code';
    if (mapping.excelNameHeader === header) return 'name';
    if (mapping.excelPriceHeader === header) return 'price';
    return '';
  };

  const handleExcelRoleChange = (header: string, role: ExcelColumnRole) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (next.excelCodeHeader === header) next.excelCodeHeader = '';
      if (next.excelNameHeader === header) next.excelNameHeader = '';
      if (next.excelPriceHeader === header) next.excelPriceHeader = '';
      if (role === 'code') next.excelCodeHeader = header;
      if (role === 'name') next.excelNameHeader = header;
      if (role === 'price') next.excelPriceHeader = header;
      return next;
    });
  };

  const handlePdfColumnRoleChange = (index: number, role: string) => {
    setMapping((prev) => {
      const selected = String(index);
      if (role === 'price') {
        return { ...prev, pdfPriceIndex: selected };
      }
      if (prev.pdfPriceIndex === selected) {
        return { ...prev, pdfPriceIndex: '' };
      }
      return prev;
    });
  };

  const resetPreview = () => {
    setPreview(null);
    setMapping(EMPTY_MAPPING);
    setShowAdvanced(false);
  };

  const buildOverrides = () => ({
    excelSheetName: mapping.excelSheetName || null,
    excelHeaderRow: parseOptionalInt(mapping.excelHeaderRow),
    excelCodeHeader: mapping.excelCodeHeader || null,
    excelNameHeader: mapping.excelNameHeader || null,
    excelPriceHeader: mapping.excelPriceHeader || null,
    pdfPriceIndex: parseOptionalInt(mapping.pdfPriceIndex),
    pdfCodePattern: showAdvanced ? (mapping.pdfCodePattern || null) : null,
  });

  const getPdfSelectedPrice = (sample: PreviewPdf['samples'][number]) => {
    const index = parseOptionalInt(mapping.pdfPriceIndex);
    if (!index) return sample.selectedPrice;
    return sample.prices[index - 1] ?? sample.selectedPrice;
  };

  const loadSuppliers = async () => {
    try {
      const result = await adminApi.getSupplierPriceListSuppliers();
      setSuppliers(result.suppliers || []);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Tedarikciler yuklenemedi');
    }
  };

  const loadUploads = async () => {
    setLoading(true);
    try {
      const result = await adminApi.getSupplierPriceListUploads({ page: 1, limit: 20 });
      setUploads(result.uploads || []);
      if (!activeUploadId && result.uploads?.length) {
        setActiveUploadId(result.uploads[0].id);
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Gecmis yuklemeler alinmadi');
    } finally {
      setLoading(false);
    }
  };

  const loadUploadDetail = async (uploadId: string) => {
    try {
      const result = await adminApi.getSupplierPriceListUpload(uploadId);
      setActiveUpload(result.upload);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Rapor detayi alinmadi');
    }
  };

  const loadItems = async (uploadId: string, status: StatusKey, page = 1) => {
    setItemsLoading(true);
    try {
      const result = await adminApi.getSupplierPriceListItems({
        uploadId,
        status,
        page,
        limit: pagination.limit,
      });
      setItems(result.items || []);
      setPagination((prev) => ({
        ...prev,
        page: result.pagination?.page ?? page,
        totalPages: result.pagination?.totalPages ?? 1,
        total: result.pagination?.total ?? 0,
      }));
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Liste alinmadi');
    } finally {
      setItemsLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
    loadUploads();
  }, []);

  useEffect(() => {
    if (!activeUploadId) return;
    loadUploadDetail(activeUploadId);
    loadItems(activeUploadId, activeStatus, 1);
  }, [activeUploadId, activeStatus]);

  const handleSupplierChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedSupplierId(event.target.value);
    resetPreview();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setSelectedFiles(files);
    resetPreview();
  };

  const handlePreview = async () => {
    if (!selectedSupplierId) {
      toast.error('Tedarikci secin');
      return;
    }
    if (selectedFiles.length === 0) {
      toast.error('Dosya secin');
      return;
    }

    try {
      setPreviewLoading(true);
      const result = await adminApi.previewSupplierPriceLists({
        supplierId: selectedSupplierId,
        files: selectedFiles,
        overrides: buildOverrides(),
      });
      setPreview(result);
      setMapping((prev) => ({
        excelSheetName: result.excel ? result.excel.sheetName || '' : prev.excelSheetName,
        excelHeaderRow: result.excel ? (result.excel.headerRow ? String(result.excel.headerRow) : '') : prev.excelHeaderRow,
        excelCodeHeader: result.excel ? result.excel.detected?.code || '' : prev.excelCodeHeader,
        excelNameHeader: result.excel ? result.excel.detected?.name || '' : prev.excelNameHeader,
        excelPriceHeader: result.excel ? result.excel.detected?.price || '' : prev.excelPriceHeader,
        pdfPriceIndex: result.pdf ? (result.pdf.priceIndex ? String(result.pdf.priceIndex) : '') : prev.pdfPriceIndex,
        pdfCodePattern: result.pdf ? result.pdf.codePattern || '' : prev.pdfCodePattern,
      }));
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Onizleme basarisiz');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedSupplierId) {
      toast.error('Tedarikci secin');
      return;
    }
    if (selectedFiles.length === 0) {
      toast.error('Dosya secin');
      return;
    }
    if (!preview) {
      toast.error('Once onizleme alin');
      return;
    }

    try {
      setUploading(true);
      const result = await adminApi.uploadSupplierPriceLists({
        supplierId: selectedSupplierId,
        files: selectedFiles,
        overrides: buildOverrides(),
      });
      toast.success('Dosyalar yuklendi');
      setSelectedFiles([]);
      resetPreview();
      await loadUploads();
      if (result.uploadId) {
        setActiveUploadId(result.uploadId);
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Yukleme basarisiz');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async () => {
    if (!activeUploadId) return;
    try {
      const blob = await adminApi.downloadSupplierPriceListExport(activeUploadId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `supplier-price-list-${activeUploadId}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Excel indirilemedi');
    }
  };

  const columnCount = activeStatus === 'matched' ? 10 : activeStatus === 'multiple' ? 5 : 4;
  const canPreview = Boolean(selectedSupplierId) && selectedFiles.length > 0 && !previewLoading && !uploading;
  const uploadDisabled = !preview || uploading || previewLoading;

  const pageSummary = useMemo(() => {
    if (!activeUpload) return null;
    return [
      { label: 'Toplam', value: activeUpload.totalItems },
      { label: 'Eslesen', value: activeUpload.matchedItems },
      { label: 'Esmeyen', value: activeUpload.unmatchedItems },
      { label: 'Coklu', value: activeUpload.multiMatchItems },
    ];
  }, [activeUpload]);

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
                    <div className="text-xs text-muted-foreground">Kod kolonu: Otomatik</div>
                    <div className="text-xs text-muted-foreground">Urun adi: Otomatik</div>
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
                    Sayisal kolonlardan sadece biri fiyat olmali. Secmezseniz otomatik secilir.
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
                        {pdfColumnCandidates.length ? (
                          pdfColumnCandidates.map((column) => (
                            <TableRow key={`pdf-col-${column.index}`}>
                              <TableCell>Sayisal Kolon {column.index}</TableCell>
                              <TableCell>
                                {column.samples.length
                                  ? column.samples.map((value) => formatCurrency(value)).join(', ')
                                  : '-'}
                              </TableCell>
                              <TableCell className="w-40">
                                <Select
                                  value={mapping.pdfPriceIndex === String(column.index) ? 'price' : ''}
                                  onChange={(event) => handlePdfColumnRoleChange(column.index, event.target.value)}
                                >
                                  <option value="">Yoksay</option>
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
                          <TableHead>Satirdaki Fiyatlar</TableHead>
                          <TableHead>Secilen Fiyat</TableHead>
                          <TableHead>Satir</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.pdf.samples?.length ? (
                          preview.pdf.samples.map((sample, index) => (
                            <TableRow key={`pdf-sample-${index}`}>
                              <TableCell>{sample.supplierCode}</TableCell>
                              <TableCell>
                                {sample.prices.length
                                  ? sample.prices.map((price, idx) => `${idx + 1}. ${formatCurrency(price)}`).join(' | ')
                                  : '-'}
                              </TableCell>
                              <TableCell>
                                {typeof getPdfSelectedPrice(sample) === 'number'
                                  ? formatCurrency(getPdfSelectedPrice(sample) as number)
                                  : '-'}
                              </TableCell>
                              <TableCell className="max-w-[320px] truncate">
                                {sample.rawLine}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
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


