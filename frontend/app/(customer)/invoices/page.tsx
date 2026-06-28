'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import customerApi from '@/lib/api/customer';
import { EInvoiceDocument } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { formatDateShort } from '@/lib/utils/format';
import { FileText, Download, Search, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

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
  if (status === 'MATCHED') {
    return (
      <span className="badge-success">
        <CheckCircle2 className="h-3 w-3" />
        Eşleşmiş
      </span>
    );
  }
  if (status === 'PARTIAL') {
    return (
      <span className="badge-warning">
        <AlertTriangle className="h-3 w-3" />
        Eksik
      </span>
    );
  }
  return (
    <span className="badge-danger">
      <XCircle className="h-3 w-3" />
      Bulunamadı
    </span>
  );
};

export default function CustomerInvoicesPage() {
  const [documents, setDocuments] = useState<EInvoiceDocument[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [invoicePrefix, setInvoicePrefix] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const loadDocuments = async (page = 1) => {
    setLoading(true);
    try {
      const result = await customerApi.getInvoices({
        search: search || undefined,
        invoicePrefix: invoicePrefix || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        page,
        limit: pagination.limit,
      });
      setDocuments(result.documents || []);
      setPagination(result.pagination || { page, limit: pagination.limit, total: 0, totalPages: 1 });
    } catch (error) {
      console.error('Faturalar yuklenemedi:', error);
      toast.error('Faturalar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownload = async (doc: EInvoiceDocument) => {
    setDownloadingId(doc.id);
    try {
      const blob = await customerApi.downloadInvoice(doc.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${doc.invoiceNo}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Fatura indirilemedi:', error);
      toast.error('Fatura indirilemedi');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container-custom py-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-primary-100">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="page-title">Faturalarım</h1>
            <p className="page-subtitle">Size ait yüklenen e-fatura PDF kayıtları.</p>
          </div>
        </div>

        <div className="card card-pad">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="field-label">Arama</label>
              <Input
                placeholder="Fatura no"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Fatura Prefix</label>
              <Input
                placeholder="DEF2026"
                value={invoicePrefix}
                onChange={(event) => setInvoicePrefix(event.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Başlangıç Tarihi</label>
              <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            </div>
            <div>
              <label className="field-label">Bitiş Tarihi</label>
              <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => loadDocuments(1)} isLoading={loading}>
              <Search className="mr-1.5 h-4 w-4" />
              Listele
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setSearch('');
                setInvoicePrefix('');
                setFromDate('');
                setToDate('');
                loadDocuments(1);
              }}
            >
              Filtre Temizle
            </Button>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3.5">
            <h2 className="text-sm font-semibold text-gray-800">Fatura Listesi</h2>
            <span className="chip">{pagination.total} kayıt</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary-600" />
            </div>
          ) : documents.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <FileText className="mx-auto mb-3 h-10 w-10 text-gray-300" />
              <p className="text-sm text-gray-500">Bu filtreye uygun fatura bulunamadı.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fatura No</TableHead>
                      <TableHead>Tarih</TableHead>
                      <TableHead className="text-right">Tutar</TableHead>
                      <TableHead>Durum</TableHead>
                      <TableHead className="text-right">İşlem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => (
                      <TableRow key={doc.id} className="hover:bg-gray-50/60">
                        <TableCell className="font-mono text-xs text-gray-700">{doc.invoiceNo}</TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {doc.issueDate ? formatDateShort(doc.issueDate) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-gray-900">
                          {formatAmount(doc.totalAmount, doc.currency)}
                        </TableCell>
                        <TableCell>{matchBadge(doc.matchStatus)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleDownload(doc)}
                            disabled={downloadingId === doc.id}
                          >
                            <Download className="mr-1.5 h-3.5 w-3.5" />
                            {downloadingId === doc.id ? 'İndiriliyor...' : 'PDF İndir'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between border-t border-[var(--line)] px-5 py-3 text-sm text-gray-500">
                <span>
                  Sayfa {pagination.page} / {pagination.totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={pagination.page <= 1 || loading}
                    onClick={() => loadDocuments(pagination.page - 1)}
                  >
                    Önceki
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={pagination.page >= pagination.totalPages || loading}
                    onClick={() => loadDocuments(pagination.page + 1)}
                  >
                    Sonraki
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
