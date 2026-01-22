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

const STATUS_TABS = [
  { key: 'matched', label: 'Eslesenler' },
  { key: 'unmatched', label: 'Esmeyenler' },
  { key: 'multiple', label: 'Coklu Eslesenler' },
] as const;

type StatusKey = typeof STATUS_TABS[number]['key'];

export default function SupplierPriceListsPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [activeUpload, setActiveUpload] = useState<UploadItem | null>(null);
  const [activeStatus, setActiveStatus] = useState<StatusKey>('matched');
  const [items, setItems] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);

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

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setSelectedFiles(files);
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

    try {
      setUploading(true);
      const result = await adminApi.uploadSupplierPriceLists({
        supplierId: selectedSupplierId,
        files: selectedFiles,
      });
      toast.success('Dosyalar yuklendi');
      setSelectedFiles([]);
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

  const columnCount = activeStatus === 'matched' ? 9 : activeStatus === 'multiple' ? 5 : 4;

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
              onChange={(e) => setSelectedSupplierId(e.target.value)}
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
            <div className="flex items-end">
              <Button onClick={handleUpload} isLoading={uploading} className="gap-2 w-full">
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
