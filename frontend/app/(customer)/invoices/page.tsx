'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import customerApi from '@/lib/api/customer';
import { EInvoiceDocument } from '@/types';
import { formatDateShort } from '@/lib/utils/format';
import {
  FileText,
  Download,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';

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
        <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} />
        Eşleşmiş
      </span>
    );
  }
  if (status === 'PARTIAL') {
    return (
      <span className="badge-warning">
        <AlertTriangle className="h-3 w-3" strokeWidth={2.5} />
        Eksik
      </span>
    );
  }
  return (
    <span className="badge-danger">
      <XCircle className="h-3 w-3" strokeWidth={2.5} />
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

  const clearFilters = () => {
    setSearch('');
    setInvoicePrefix('');
    setFromDate('');
    setToDate('');
    loadDocuments(1);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--surface-0)]">
      <div className="mx-auto w-full max-w-[1200px] px-3 py-5 sm:px-4 sm:py-6 lg:px-6">
        {/* Breadcrumb */}
        <nav className="mb-3.5 flex items-center gap-1.5 text-[12px] text-[var(--ink-3)]">
          <Link href="/home" className="text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]">
            Ana Sayfa
          </Link>
          <span className="text-gray-300">/</span>
          <span className="font-medium text-[var(--ink-2)]">Faturalarım</span>
        </nav>

        {/* Baslik */}
        <div className="mb-[18px] flex items-center gap-3.5">
          <span className="flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-[13px] bg-primary-50 text-primary-600">
            <FileText className="h-[22px] w-[22px]" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h1 className="text-[23px] font-bold tracking-tight text-[var(--ink-1)]">Faturalarım</h1>
            <p className="mt-0.5 text-[13px] text-[var(--ink-3)]">
              E-faturalarınız · PDF / e-fatura zarfı indirme
            </p>
          </div>
        </div>

        {/* Filtre bari */}
        <div className="mb-[18px] flex flex-wrap items-center gap-2.5 rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 shadow-sm sm:px-3.5">
          {/* Fatura no ara */}
          <div className="flex h-[38px] w-full min-w-0 flex-1 items-center gap-2 rounded-[9px] border border-[var(--line)] px-3 focus-within:border-primary-300 focus-within:ring-2 focus-within:ring-primary-100 sm:w-auto sm:min-w-[220px]">
            <Search className="h-[15px] w-[15px] flex-shrink-0 text-[var(--ink-3)]" strokeWidth={2} />
            <input
              placeholder="Fatura no ara…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') loadDocuments(1);
              }}
              className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-[var(--ink-1)] outline-none placeholder:text-[var(--ink-3)]"
            />
          </div>

          {/* On ek (prefix) */}
          <label className="flex h-[38px] items-center gap-2 rounded-[9px] border border-[var(--line)] px-3">
            <span className="text-xs text-[var(--ink-3)]">Ön ek</span>
            <select
              value={invoicePrefix}
              onChange={(event) => setInvoicePrefix(event.target.value)}
              className="cursor-pointer border-none bg-transparent text-[13px] font-medium text-[var(--ink-1)] outline-none"
            >
              <option value="">Tümü</option>
              <option value="IRS2026">IRS2026</option>
              <option value="IRS2025">IRS2025</option>
              <option value="DEF2026">DEF2026</option>
            </select>
          </label>

          {/* Tarih araligi (baslangic/bitis korundu) */}
          <label className="flex h-[38px] flex-1 items-center gap-2 rounded-[9px] border border-[var(--line)] px-3 sm:flex-none">
            <span className="text-xs text-[var(--ink-3)]">Başlangıç</span>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="min-w-0 flex-1 cursor-pointer border-none bg-transparent text-[13px] font-medium text-[var(--ink-1)] outline-none sm:flex-none"
            />
          </label>
          <label className="flex h-[38px] flex-1 items-center gap-2 rounded-[9px] border border-[var(--line)] px-3 sm:flex-none">
            <span className="text-xs text-[var(--ink-3)]">Bitiş</span>
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="min-w-0 flex-1 cursor-pointer border-none bg-transparent text-[13px] font-medium text-[var(--ink-1)] outline-none sm:flex-none"
            />
          </label>

          {/* Aksiyonlar */}
          <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
            <button
              type="button"
              onClick={() => loadDocuments(1)}
              disabled={loading}
              className="inline-flex h-[38px] flex-1 items-center justify-center gap-1.5 rounded-[9px] bg-primary-600 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-60 sm:flex-none"
            >
              <Search className="h-4 w-4" strokeWidth={2} />
              Listele
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-[38px] flex-1 items-center justify-center rounded-[9px] border border-[var(--line)] bg-white px-4 text-[13px] font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-0)] sm:flex-none"
            >
              Temizle
            </button>
          </div>
        </div>

        {/* Tablo karti */}
        <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-[18px] py-3.5">
            <h2 className="text-sm font-semibold text-[var(--ink-1)]">Fatura Listesi</h2>
            <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
              {pagination.total} kayıt
            </span>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary-600" />
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-[18px] py-14 text-center">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-0)] text-[var(--ink-3)]">
                <FileText className="h-6 w-6" strokeWidth={1.75} />
              </span>
              <p className="text-sm text-[var(--ink-2)]">Bu filtreye uygun fatura bulunamadı.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <div className="min-w-[560px]">
              {/* Tablo basligi */}
              <div className="grid grid-cols-[1fr_1.6fr_1.2fr_1fr_1fr] gap-2.5 bg-[var(--surface-0)] px-[18px] py-3 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-[var(--ink-3)]">
                <span>Tarih</span>
                <span>Fatura No</span>
                <span className="text-right">Tutar</span>
                <span className="text-center">Durum</span>
                <span className="text-right">İndir</span>
              </div>

              {/* Satirlar */}
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="grid grid-cols-[1fr_1.6fr_1.2fr_1fr_1fr] items-center gap-2.5 border-t border-[var(--line)] px-[18px] py-3 text-[13px] text-[var(--ink-1)] transition-colors hover:bg-[var(--surface-0)]"
                >
                  <span className="text-[var(--ink-2)]">
                    {doc.issueDate ? formatDateShort(doc.issueDate) : '-'}
                  </span>
                  <span className="truncate font-mono font-semibold text-[var(--ink-1)]">{doc.invoiceNo}</span>
                  <span className="text-right font-semibold">{formatAmount(doc.totalAmount, doc.currency)}</span>
                  <span className="flex justify-center">{matchBadge(doc.matchStatus)}</span>
                  <span className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleDownload(doc)}
                      disabled={downloadingId === doc.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium text-primary-700 transition-colors hover:bg-[var(--surface-0)] disabled:opacity-60"
                    >
                      <Download className="h-[13px] w-[13px]" strokeWidth={2} />
                      {downloadingId === doc.id ? 'İndiriliyor…' : 'PDF'}
                    </button>
                  </span>
                </div>
              ))}
                </div>
              </div>

              {/* Sayfalama */}
              <div className="flex items-center justify-between border-t border-[var(--line)] px-[18px] py-3 text-[13px] text-[var(--ink-3)]">
                <span>
                  Sayfa {pagination.page} / {pagination.totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pagination.page <= 1 || loading}
                    onClick={() => loadDocuments(pagination.page - 1)}
                    className="inline-flex items-center rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-0)] disabled:opacity-50"
                  >
                    Önceki
                  </button>
                  <button
                    type="button"
                    disabled={pagination.page >= pagination.totalPages || loading}
                    onClick={() => loadDocuments(pagination.page + 1)}
                    className="inline-flex items-center rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-0)] disabled:opacity-50"
                  >
                    Sonraki
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
