'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import customerApi from '@/lib/api/customer';
import { Quote } from '@/types';
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
} from 'lucide-react';

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
  const { user, loadUserFromStorage } = useAuthStore();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUserFromStorage();
    fetchQuotes();
  }, [loadUserFromStorage]);

  const fetchQuotes = async () => {
    setIsLoading(true);
    try {
      const { quotes } = await customerApi.getQuotes();
      setQuotes(quotes || []);
    } catch (error) {
      console.error('Teklifler alinmadi:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccept = async (quote: Quote) => {
    if (!confirm('Teklifi kabul etmek istiyor musunuz?')) return;
    try {
      await customerApi.acceptQuote(quote.id);
      toast.success('Teklif kabul edildi.');
      fetchQuotes();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'İşlem başarısız.');
    }
  };

  const handleReject = async (quote: Quote) => {
    if (!confirm('Teklifi reddetmek istiyor musunuz?')) return;
    try {
      await customerApi.rejectQuote(quote.id);
      toast.success('Teklif reddedildi.');
      fetchQuotes();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'İşlem başarısız.');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--surface-0)]">
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6 lg:px-6">
        {/* Sayfa basligi */}
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 ring-1 ring-inset ring-primary-100">
            <FileText className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink-1)]">Tekliflerim</h1>
            <p className="mt-1 text-sm text-[var(--ink-3)]">
              Teklif durumu, geçerlilik ve kabul/ret işlemleri
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600"></div>
          </div>
        ) : quotes.length === 0 ? (
          <div className="rounded-2xl border border-[var(--line)] bg-white p-10 text-center">
            <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-[var(--ink-3)]">
              <FileText className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <p className="mb-4 text-sm text-[var(--ink-2)]">Henüz teklifiniz bulunmuyor.</p>
            <Button onClick={() => router.push('/products')}>Ürünleri İncele</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {quotes.map((quote) => {
              const canAct = quote.status === 'SENT_TO_MIKRO';
              return (
                <div
                  key={quote.id}
                  className="rounded-xl border border-[var(--line)] bg-white px-4 py-4 shadow-sm transition-shadow hover:shadow-md sm:px-5"
                >
                  {/* Ust satir: no + durum + toplam */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-3">
                      <span className="font-mono text-sm font-semibold text-[var(--ink-1)]">
                        Teklif #{quote.quoteNumber}
                      </span>
                      {getStatusBadge(quote.status)}
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
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--line)] pt-3 text-xs text-[var(--ink-2)]">
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

                    <div className="ml-auto flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => router.push(`/my-quotes/${quote.id}`)}
                        className="text-[12.5px] font-medium text-primary-700 transition-colors hover:text-primary-900 hover:underline"
                      >
                        Detayı gör →
                      </button>
                      {canAct && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleReject(quote)}
                            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-red-700 transition-colors hover:bg-red-50"
                          >
                            Reddet
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAccept(quote)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-emerald-700"
                          >
                            <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
                            Kabul Et
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
