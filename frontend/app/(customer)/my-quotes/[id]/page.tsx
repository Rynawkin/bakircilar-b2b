'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
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
  ArrowLeft,
  Info,
  AlertTriangle,
} from 'lucide-react';

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

export default function QuoteDetailPage() {
  const params = useParams();
  const { user, loadUserFromStorage } = useAuthStore();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<'accept' | 'reject' | null>(null);
  const quoteId = params?.id as string;

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  const fetchQuote = useCallback(async () => {
    if (!quoteId) return;
    setIsLoading(true);
    setError(null);
    try {
      const { quote } = await customerApi.getQuoteById(quoteId);
      setQuote(quote);
    } catch (error) {
      console.error('Teklif detayi alinmadi:', error);
      setQuote(null);
      setError('Teklif detayı yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.');
    } finally {
      setIsLoading(false);
    }
  }, [quoteId]);

  useEffect(() => {
    void fetchQuote();
  }, [fetchQuote]);

  const handleAccept = async () => {
    if (!quote || action) return;
    if (isQuoteExpired(quote.validityDate)) {
      toast.error('Süresi dolmuş teklif üzerinde işlem yapılamaz.');
      return;
    }
    if (!confirm('Teklifi kabul etmek istiyor musunuz?')) return;

    setAction('accept');
    try {
      await customerApi.acceptQuote(quote.id);
      toast.success('Teklif kabul edildi.');
      await fetchQuote();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'İşlem başarısız.');
    } finally {
      setAction(null);
    }
  };

  const handleReject = async () => {
    if (!quote || action) return;
    if (isQuoteExpired(quote.validityDate)) {
      toast.error('Süresi dolmuş teklif üzerinde işlem yapılamaz.');
      return;
    }
    if (!confirm('Teklifi reddetmek istiyor musunuz?')) return;

    setAction('reject');
    try {
      await customerApi.rejectQuote(quote.id);
      toast.success('Teklif reddedildi.');
      await fetchQuote();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'İşlem başarısız.');
    } finally {
      setAction(null);
    }
  };

  const expired = quote ? isQuoteExpired(quote.validityDate) : false;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container-custom py-8">
        <Link
          href="/my-quotes"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-primary-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Tekliflerime Dön
        </Link>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600"></div>
          </div>
        ) : error ? (
          <div className="card card-pad text-center">
            <div className="flex flex-col items-center py-10">
              <AlertTriangle className="mb-3 h-12 w-12 text-red-500" />
              <h2 className="text-lg font-semibold text-gray-900">Teklif yüklenemedi</h2>
              <p className="mt-1 max-w-md text-sm text-gray-500">{error}</p>
              <Button className="mt-5" onClick={() => void fetchQuote()}>
                Tekrar Dene
              </Button>
            </div>
          </div>
        ) : !quote ? (
          <div className="card card-pad text-center">
            <div className="py-10">
              <FileText className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p className="text-sm text-gray-500">Teklif bulunamadı.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Ozet basligi */}
            <div className="card overflow-hidden">
              <div className="flex flex-col gap-4 border-b border-[var(--line)] p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2.5">
                    <h2 className="text-xl font-bold text-gray-900">Teklif #{quote.quoteNumber}</h2>
                    {getStatusBadge(quote.status)}
                    {expired && <span className="badge-danger">Süresi Doldu</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-gray-400" />
                      Oluşturma: {formatDate(quote.createdAt)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-gray-400" />
                      Geçerlilik: {formatDate(quote.validityDate)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5 text-gray-400" />
                      {quote.items.length} ürün
                    </span>
                    {quote.mikroNumber && (
                      <span className="chip font-mono">Mikro No: {quote.mikroNumber}</span>
                    )}
                  </div>
                </div>

                <div className="rounded-xl bg-primary-50 px-5 py-3 text-right ring-1 ring-primary-100 sm:flex-shrink-0">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-primary-700/70">
                    Toplam Tutar
                  </p>
                  <p className="text-2xl font-bold text-primary-700">
                    {formatCurrency(quote.grandTotal)}
                  </p>
                </div>
              </div>

              {quote.adminNote && (
                <div className="border-b border-[var(--line)] px-5 py-4">
                  <div className="flex gap-2.5 rounded-lg bg-amber-50 px-3.5 py-3 ring-1 ring-inset ring-amber-100">
                    <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                    <div>
                      <p className="mb-0.5 text-xs font-semibold text-amber-800">Yetkili Notu</p>
                      <p className="text-sm text-amber-700">{quote.adminNote}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Teklif satirlari */}
              <div className="divide-y divide-[var(--line)]">
                {quote.items.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      {item.productId ? (
                        <Link
                          href={`/products/${item.productId}`}
                          className="font-semibold text-gray-900 break-words transition-colors hover:text-primary-700 hover:underline"
                        >
                          {item.productName}
                        </Link>
                      ) : (
                        <p className="font-semibold text-gray-900 break-words">{item.productName}</p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono text-gray-400">{item.productCode}</span>
                        {item.selectedUnit && (
                          <span className="chip">{item.selectedUnit}</span>
                        )}
                      </div>
                      {item.lineDescription && (
                        <p className="mt-1.5 text-xs text-gray-500">{item.lineDescription}</p>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="mb-0.5 text-xs text-gray-500">
                        {item.quantity} × {formatCurrency(item.unitPrice)}
                      </p>
                      <p className="text-lg font-bold text-gray-900">
                        {formatCurrency(item.totalPrice)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {quote.status === 'SENT_TO_MIKRO' && (
                <div className="border-t border-[var(--line)] bg-gray-50/60 px-5 py-4">
                  {expired && (
                    <p className="mb-3 text-right text-sm font-medium text-red-700">
                      Teklifin geçerlilik süresi dolduğu için kabul veya ret işlemi yapılamaz.
                    </p>
                  )}
                  <div className="flex flex-wrap justify-end gap-3">
                  <Button
                    variant="danger"
                    onClick={handleReject}
                    isLoading={action === 'reject'}
                    disabled={Boolean(action) || expired}
                    title={expired ? 'Teklifin süresi dolduğu için işlem yapılamaz' : undefined}
                  >
                    <XCircle className="mr-1.5 h-4 w-4" />
                    Teklifi Reddet
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleAccept}
                    isLoading={action === 'accept'}
                    disabled={Boolean(action) || expired}
                    title={expired ? 'Teklifin süresi dolduğu için işlem yapılamaz' : undefined}
                  >
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    Teklifi Kabul Et
                  </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
