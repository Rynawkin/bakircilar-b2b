'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import customerApi from '@/lib/api/customer';
import { EInvoiceDocument } from '@/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { formatDateShort } from '@/lib/utils/format';

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
      toast.error('Faturalar yuklenemedi');
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-gray-100">
      <div className="container-custom py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Faturalarim</h1>
          <p className="text-sm text-gray-600">Sadece size ait yuklenen e-fatura PDF kayitlari.</p>
        </div>

        <Card title="Filtreler" subtitle="Fatura no veya tarih ile filtreleyin.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600">Arama</label>
              <Input
                placeholder="Fatura no"
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

          <div className="mt-4 flex flex-wrap gap-2">
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
            <Button onClick={() => loadDocuments(1)} isLoading={loading}>
              Listele
            </Button>
          </div>
        </Card>

        <Card title="Fatura Listesi" subtitle={`${pagination.total} kayit`}>
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary-600" />
            </div>
          ) : documents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-600">
              Bu filtreye uygun fatura bulunamadi.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fatura No</TableHead>
                      <TableHead>Tarih</TableHead>
                      <TableHead>Tutar</TableHead>
                      <TableHead>Durum</TableHead>
                      <TableHead>Islem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-mono text-xs">{doc.invoiceNo}</TableCell>
                        <TableCell>{doc.issueDate ? formatDateShort(doc.issueDate) : '-'}</TableCell>
                        <TableCell>{formatAmount(doc.totalAmount, doc.currency)}</TableCell>
                        <TableCell>{matchBadge(doc.matchStatus)}</TableCell>
                        <TableCell>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleDownload(doc)}
                            disabled={downloadingId === doc.id}
                          >
                            {downloadingId === doc.id ? 'Indiriliyor...' : 'PDF Indir'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
                <span>
                  Sayfa {pagination.page} / {pagination.totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    disabled={pagination.page <= 1 || loading}
                    onClick={() => loadDocuments(pagination.page - 1)}
                  >
                    Onceki
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={pagination.page >= pagination.totalPages || loading}
                    onClick={() => loadDocuments(pagination.page + 1)}
                  >
                    Sonraki
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

