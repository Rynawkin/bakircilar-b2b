'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import customerApi, { type CustomerListPagination } from '@/lib/api/customer';
import { Quote, QuoteStatus } from '@/types';
import { useAuthStore } from '@/lib/store/authStore';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Send,
  Calendar,
  Package,
  Check,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

const PAGE_SIZE = 10;
const DEFAULT_PAGINATION: CustomerListPagination = {
  total: 0,
  page: 1,
  pageSize: PAGE_SIZE,
  totalPages: 1,
};

const isQuoteExpired = (validityDate: string) => {
  const datePart = validityDate.slice(0, 10);
  const [year, month, day] = datePart.split('-').map(Number);
  if (![year, month, day].every(Number.isFinite)) return false;
  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime() < Date.now();
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'PENDING_APPROVAL':
      return (
        <span className="badge-warning">
          <Clock className="h-3 w-3" />
          Onay Bekliyor
        </span>
      );
    case 'SENT_TO_MIKRO':
      return (
        <span className="badge-info">
          <Send className="h-3 w-3" />
          Gönderildi
        </span>
      );
    case 'REJECTED':
      return (
        <span className="badge-danger">
          <XCircle className="h-3 w-3" />
          Reddedildi
        </span>
      );
    case 'CUSTOMER_ACCEPTED':
      return (
        <span className="badge-success">
          <CheckCircle2 className="h-3 w-3" />
          Kabul Edildi
        </span>
      );
    case 'CUSTOMER_REJECTED':
      return (
        <span className="badge-danger">
          <XCircle className="h-3 w-3" />
          Red Edildi
        </span>
      );
    default:
      return <span className="badge-neutral">{status}</span>;
  }
};

export default function MyQuotesPage() {
  const router = useRouter();
  const { loadUserFromStorage } = useAuthStore();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<QuoteStatus | ''>('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<CustomerListPagination>(DEFAULT_PAGINATION);
  const [actionByQuoteId, setActionByQuoteId] = useState<Record<string, 'accept' | 'reject'>>({});

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  const fetchQuotes = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await customerApi.getQuotes({
        status: status || undefined,
        search: search || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setQuotes(response.quotes || []);
      setPagination(
        response.pagination || {
          total: response.quotes?.length || 0,
          page,
          pageSize: PAGE_SIZE,
          totalPages: 1,
        }
      );
    } catch (error) {
      console.error('Teklifler alinmadi:', error);
      setError('Teklifleriniz yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.');
    } finally {
      setIsLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    void fetchQuotes();
  }, [fetchQuotes]);

  const handleAccept = async (quote: Quote) => {
    if (actionByQuoteId[quote.id]) return;
    if (isQuoteExpired(quote.validityDate)) {
      toast.error('Süresi dolmuş teklif üzerinde işlem yapılamaz.');
      return;
    }
    if (!confirm('Teklifi kabul etmek istiyor musunuz?')) return;
    setActionByQuoteId((current) => ({ ...current, [quote.id]: 'accept' }));
    try {
      await customerApi.acceptQuote(quote.id);
      toast.success('Teklif kabul edildi.');
      await fetchQuotes();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'İşlem başarısız.');
    } finally {
      setActionByQuoteId((current) => {
        const next = { ...current };
        delete next[quote.id];
        return next;
      });
    }
  };

  const handleReject = async (quote: Quote) => {
    if (actionByQuoteId[quote.id]) return;
    if (isQuoteExpired(quote.validityDate)) {
      toast.error('Süresi dolmuş teklif üzerinde işlem yapılamaz.');
      return;
    }
    if (!confirm('Teklifi reddetmek istiyor musunuz?')) return;
    setActionByQuoteId((current) => ({ ...current, [quote.id]: 'reject' }));
    try {
      await customerApi.rejectQuote(quote.id);
      toast.success('Teklif reddedildi.');
      await fetchQuotes();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'İşlem başarısız.');
    } finally {
      setActionByQuoteId((current) => {
        const next = { ...current };
        delete next[quote.id];
        return next;
      });
    }
  };

  return (
    <div className="min-h-screen bg-[var(--surface-0)]">
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6 lg:px-6">
        {/* Breadcrumb */}
        <nav className="mb-3.5 flex items-center gap-1.5 text-[12px] text-[var(--ink-3)]">
          <Link
            href="/home"
            className="text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
          >
            Ana Sayfa
          </Link>
          <span className="text-gray-300">/</span>
          <span className="font-medium text-[var(--ink-2)]">Tekliflerim</span>
        </nav>

        {/* Sayfa basligi */}
        <div className="mb-[18px] flex items-center gap-3.5">
          <span className="flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-[13px] bg-primary-50 text-primary-600">
            <FileText className="h-[22px] w-[22px]" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h1 className="text-[23px] font-bold tracking-tight text-[var(--ink-1)]">Tekliflerim</h1>
            <p className="mt-0.5 text-[13px] text-[var(--ink-3)]">
              Teklif durumu, geçerlilik ve kabul/ret işlemleri
            </p>
          </div>
        </div>

        <form
          className="mb-5 flex flex-col gap-2 rounded-xl border border-[var(--line)] bg-white p-3 shadow-sm sm:flex-row sm:items-center"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setSearch(searchInput.trim());
          }}
        >
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--line)] px-3 focus-within:border-primary-300 focus-within:ring-2 focus-within:ring-primary-100">
            <Search className="h-4 w-4 flex-shrink-0 text-[var(--ink-3)]" />
            <span className="sr-only">Tekliflerde ara</span>
            <input
              type="search"
              value={searchInput}
              disabled={isLoading}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Teklif no, ürün veya not ara…"
              className="min-w-0 flex-1 border-none bg-transparent text-sm text-[var(--ink-1)] outline-none placeholder:text-[var(--ink-3)] disabled:opacity-60"
            />
          </label>
          <select
            value={status}
            disabled={isLoading}
            onChange={(event) => {
              setStatus(event.target.value as QuoteStatus | '');
              setPage(1);
            }}
            aria-label="Teklif durumuna göre filtrele"
            className="h-10 rounded-lg border border-[var(--line)] bg-white px-3 text-sm font-medium text-[var(--ink-2)] outline-none focus:border-primary-300 disabled:opacity-60"
          >
            <option value="">Tüm durumlar</option>
            <option value="PENDING_APPROVAL">Onay bekliyor</option>
            <option value="SENT_TO_MIKRO">Gönderildi</option>
            <option value="CUSTOMER_ACCEPTED">Kabul edildi</option>
            <option value="CUSTOMER_REJECTED">Müşteri reddetti</option>
            <option value="REJECTED">Reddedildi</option>
          </select>
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Ara
          </button>
          {(search || status) && (
            <button
              type="button"
              disabled={isLoading}
              onClick={() => {
                setSearchInput('');
                setSearch('');
                setStatus('');
                setPage(1);
              }}
              className="h-10 rounded-lg px-3 text-sm font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--surface-0)] hover:text-[var(--ink-1)] disabled:opacity-60"
            >
              Temizle
            </button>
          )}
        </form>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600"></div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-red-100 bg-white px-6 py-14 text-center">
            <AlertTriangle className="mb-3 h-10 w-10 text-red-500" />
            <h2 className="text-lg font-semibold text-[var(--ink-1)]">Teklifler yüklenemedi</h2>
            <p className="mt-1 max-w-md text-sm text-[var(--ink-3)]">{error}</p>
            <Button className="mt-5" onClick={() => void fetchQuotes()}>
              Tekrar Dene
            </Button>
          </div>
        ) : quotes.length === 0 ? (
          <div className="rounded-2xl border border-[var(--line)] bg-white p-10 text-center">
            <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-[var(--ink-3)]">
              <FileText className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <p className="mb-4 text-sm text-[var(--ink-2)]">
              {search || status ? 'Aramanıza uygun teklif bulunamadı.' : 'Henüz teklifiniz bulunmuyor.'}
            </p>
            {search || status ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSearchInput('');
                  setSearch('');
                  setStatus('');
                  setPage(1);
                }}
              >
                Filtreleri Temizle
              </Button>
            ) : (
              <Button onClick={() => router.push('/products')}>Ürünleri İncele</Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {quotes.map((quote) => {
              const canAct = quote.status === 'SENT_TO_MIKRO';
              const expired = isQuoteExpired(quote.validityDate);
              const action = actionByQuoteId[quote.id];
              return (
                <article
                  key={quote.id}
                  className="group relative rounded-xl border border-[var(--line)] bg-white px-4 py-4 shadow-sm transition-shadow hover:shadow-md sm:px-5"
                >
                  <Link
                    href={`/my-quotes/${quote.id}`}
                    aria-label={`${quote.quoteNumber} numaralı teklifin detayını gör`}
                    className="absolute inset-0 z-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                  >
                    <span className="sr-only">Teklif detayını gör</span>
                  </Link>
                  {/* Ust satir: no + durum + toplam */}
                  <div className="pointer-events-none relative z-[1] flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-3">
                      <span className="font-mono text-sm font-semibold text-[var(--ink-1)]">
                        Teklif #{quote.quoteNumber}
                      </span>
                      {getStatusBadge(quote.status)}
                      {expired && <span className="badge-danger">Süresi Doldu</span>}
                      {quote.mikroNumber && (
                        <span className="chip font-mono">Mikro No: {quote.mikroNumber}</span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--ink-3)]">
                        Toplam
                      </div>
                      <div className="text-[17px] font-semibold text-[var(--ink-1)]">
                        {formatCurrency(quote.grandTotal)}
                      </div>
                    </div>
                  </div>

                  {/* Alt satir: tarih bilgileri + aksiyonlar */}
                  <div className="pointer-events-none relative z-[1] mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--line)] pt-3 text-xs text-[var(--ink-2)]">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-[var(--ink-3)]" strokeWidth={2} />
                      Teklif tarihi:{' '}
                      <b className="font-semibold text-[var(--ink-1)]">{formatDate(quote.createdAt)}</b>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-[var(--ink-3)]" strokeWidth={2} />
                      Geçerlilik:{' '}
                      <b className="font-semibold text-[var(--ink-1)]">{formatDate(quote.validityDate)}</b>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5 text-[var(--ink-3)]" strokeWidth={2} />
                      {quote.items.length} ürün
                    </span>

                    <div className="pointer-events-auto relative z-10 ml-auto flex flex-wrap items-center gap-2.5">
                      <Link
                        href={`/my-quotes/${quote.id}`}
                        className="text-[12.5px] font-medium text-primary-700 transition-colors hover:text-primary-900 hover:underline"
                      >
                        Detayı gör →
                      </Link>
                      {canAct && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleReject(quote)}
                            disabled={Boolean(action) || expired}
                            title={expired ? 'Teklifin süresi dolduğu için işlem yapılamaz' : undefined}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {action === 'reject' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            Reddet
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAccept(quote)}
                            disabled={Boolean(action) || expired}
                            title={expired ? 'Teklifin süresi dolduğu için işlem yapılamaz' : undefined}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {action === 'accept' ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
                            )}
                            Kabul Et
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
            <div className="mt-2 flex flex-col items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--ink-3)] sm:flex-row">
              <span>
                Toplam {pagination.total} teklif · Sayfa {pagination.page} / {pagination.totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pagination.page <= 1 || isLoading}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--line)] bg-white px-3 font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-0)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Önceki
                </button>
                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages || isLoading}
                  onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--line)] bg-white px-3 font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-0)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Sonraki
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
