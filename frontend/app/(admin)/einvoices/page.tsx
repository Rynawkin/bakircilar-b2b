'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AdminNavigation } from '@/components/layout/AdminNavigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { CariSelectModal } from '@/components/admin/CariSelectModal';
import adminApi from '@/lib/api/admin';
import { EInvoiceDocument } from '@/types';
import { formatDateShort } from '@/lib/utils/format';

type MikroCari = {
  userId?: string;
  code: string;
  name: string;
  city?: string;
  district?: string;
  phone?: string;
  isLocked: boolean;
  groupCode?: string;
  sectorCode?: string;
  paymentTerm?: number;
  paymentPlanNo?: number | null;
  paymentPlanCode?: string | null;
  paymentPlanName?: string | null;
  hasEInvoice: boolean;
  balance: number;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const formatAmount = (value?: number | null, currency?: string) => {
  if (value === null || value === undefined) return '-';
  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: currency || 'TRY',
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${currency || ''}`.trim();
  }
};

const matchBadge = (status: string) => {
  if (status === 'MATCHED') return <Badge variant="success">Eslesmis</Badge>;
  if (status === 'PARTIAL') return <Badge variant="warning">Eksik</Badge>;
  return <Badge variant="danger">Bulunamadi</Badge>;
};

export default function EInvoicesPage() {
  const [documents, setDocuments] = useState<EInvoiceDocument[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);

  const [cariList, setCariList] = useState<MikroCari[]>([]);
  const [cariModalOpen, setCariModalOpen] = useState(false);
  const [selectedCari, setSelectedCari] = useState<MikroCari | null>(null);

  const [search, setSearch] = useState('');
  const [invoicePrefix, setInvoicePrefix] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    uploaded: number;
    updated: number;
    failed: number;
    results: Array<{ invoiceNo: string; status: string; message?: string }>;
  } | null>(null);

  const loadCariList = async () => {
    try {
      const { cariList: data } = await adminApi.getCariList();
      setCariList(data || []);
    } catch (error) {
      console.error('Cari list not loaded', error);
    }
  };

  const loadDocuments = async (page = 1) => {
    setLoading(true);
    try {
      const response = await adminApi.getEInvoices({
        search: search || undefined,
        invoicePrefix: invoicePrefix || undefined,
        customerCode: selectedCari?.code || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        page,
        limit: pagination.limit,
      });
      setDocuments(response.documents || []);
      setPagination(response.pagination || { page, limit: pagination.limit, total: 0, totalPages: 1 });
    } catch (error) {
      console.error('Invoice list not loaded', error);
      toast.error('Fatura listesi alinamadi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCariList();
    loadDocuments(1);
  }, []);

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      toast.error('PDF secmeniz gerekiyor');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      selectedFiles.forEach((file) => formData.append('files', file));
      const result = await adminApi.uploadEInvoices(formData);
      setUploadResult(result);
      setSelectedFiles([]);
      toast.success('PDF yukleme tamamlandi');
      await loadDocuments(1);
    } catch (error) {
      console.error('Upload failed', error);
      toast.error('PDF yukleme basarisiz');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: EInvoiceDocument) => {
    try {
      const blob = await adminApi.downloadEInvoice(doc.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${doc.invoiceNo}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed', error);
      toast.error('PDF indirilemedi');
    }
  };

  return (
    <>
      <AdminNavigation />
      <div className="container-custom space-y-6 py-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Faturalar</h1>
          <p className="text-sm text-gray-600">E-fatura PDF arsivi ve indirme</p>
        </div>

        <Card title="PDF Yukleme" subtitle="Gun sonunda indirilen e-fatura/e-arsiv PDF'lerini yukleyin.">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2">
              <input
                type="file"
                accept="application/pdf"
                multiple
                onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))}
                className="text-sm"
              />
              <p className="text-xs text-gray-500">
                {selectedFiles.length > 0 ? `${selectedFiles.length} dosya secildi` : 'PDF dosyasi secin'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setSelectedFiles([])}
                disabled={selectedFiles.length === 0 || uploading}
              >
                Temizle
              </Button>
              <Button onClick={handleUpload} isLoading={uploading} disabled={selectedFiles.length === 0}>
                PDF Yukle
              </Button>
            </div>
          </div>

          {uploadResult && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              <div className="flex flex-wrap gap-4">
                <span>Yeni: <strong>{uploadResult.uploaded}</strong></span>
                <span>Guncel: <strong>{uploadResult.updated}</strong></span>
                <span>Hata: <strong>{uploadResult.failed}</strong></span>
              </div>
              {uploadResult.results.length > 0 && (
                <div className="mt-3 space-y-2">
                  {uploadResult.results.slice(0, 6).map((item) => (
                    <div key={item.invoiceNo} className="flex items-center justify-between gap-3">
                      <span className="font-mono text-xs">{item.invoiceNo}</span>
                      <div className="flex items-center gap-2">
                        {matchBadge(item.status)}
                        {item.message && <span className="text-xs text-gray-500">{item.message}</span>}
                      </div>
                    </div>
                  ))}
                  {uploadResult.results.length > 6 && (
                    <div className="text-xs text-gray-500">+{uploadResult.results.length - 6} satir daha</div>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>

        <Card title="Fatura Listesi" subtitle="Cari ve fatura numarasina gore filtreleyin.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600">Arama</label>
              <Input
                placeholder="Fatura no veya cari"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600">Fatura Prefix</label>
              <Input
                placeholder="DEF2026"
                value={invoicePrefix}
                onChange={(event) => setInvoicePrefix(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600">Baslangic Tarihi</label>
              <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600">Bitis Tarihi</label>
              <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2">
              <div className="text-xs font-semibold text-gray-600">Cari</div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => setCariModalOpen(true)}>
                  Cari Sec
                </Button>
                {selectedCari && (
                  <>
                    <span className="text-sm font-medium">{selectedCari.code}</span>
                    <span className="text-sm text-gray-600">{selectedCari.name}</span>
                    <Button variant="ghost" onClick={() => setSelectedCari(null)}>
                      Temizle
                    </Button>
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('');
                  setInvoicePrefix('');
                  setFromDate('');
                  setToDate('');
                  setSelectedCari(null);
                  loadDocuments(1);
                }}
              >
                Filtre Temizle
              </Button>
              <Button onClick={() => loadDocuments(1)} isLoading={loading}>
                Listele
              </Button>
            </div>
          </div>

          <div className="mt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fatura No</TableHead>
                  <TableHead>Cari</TableHead>
                  <TableHead>Tarih</TableHead>
                  <TableHead className="text-right">Ara Toplam</TableHead>
                  <TableHead className="text-right">Genel Toplam</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="text-right">PDF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-6 text-center text-sm text-gray-500">
                      Kayit bulunamadi.
                    </TableCell>
                  </TableRow>
                )}
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-mono text-xs">{doc.invoiceNo}</TableCell>
                    <TableCell>
                      <div className="text-sm font-medium text-gray-900">{doc.customerName || '-'}</div>
                      <div className="text-xs text-gray-500">{doc.customerCode || '-'}</div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {doc.issueDate ? formatDateShort(doc.issueDate) : '-'}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {formatAmount(doc.subtotalAmount, doc.currency)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold">
                      {formatAmount(doc.totalAmount, doc.currency)}
                    </TableCell>
                    <TableCell>{matchBadge(doc.matchStatus)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(doc)}
                        disabled={!doc.fileName}
                      >
                        PDF
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {loading && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-6 text-center text-sm text-gray-500">
                      Yukleniyor...
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
            <span>
              {pagination.total} kayit
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => loadDocuments(pagination.page - 1)}
              >
                Geri
              </Button>
              <span>{pagination.page} / {pagination.totalPages}</span>
              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => loadDocuments(pagination.page + 1)}
              >
                Ileri
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <CariSelectModal
        isOpen={cariModalOpen}
        onClose={() => setCariModalOpen(false)}
        onSelect={(cari) => setSelectedCari(cari)}
        cariList={cariList}
      />
    </>
  );
}
