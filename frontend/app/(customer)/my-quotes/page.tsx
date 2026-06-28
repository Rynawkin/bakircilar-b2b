'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  ChevronRight,
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container-custom py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-primary-100">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="page-title">Tekliflerim</h1>
            <p className="page-subtitle">Size sunulan tekliflerin durumu ve detayları.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600"></div>
          </div>
        ) : quotes.length === 0 ? (
          <div className="card card-pad text-center">
            <div className="py-10">
              <FileText className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p className="mb-4 text-sm text-gray-500">Henüz teklifiniz bulunmuyor.</p>
              <Button onClick={() => router.push('/products')}>Ürünleri İncele</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {quotes.map((quote) => (
              <button
                key={quote.id}
                onClick={() => router.push(`/my-quotes/${quote.id}`)}
                className="card card-hover w-full text-left"
              >
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2.5">
                      <h3 className="text-base font-semibold text-gray-900">
                        Teklif #{quote.quoteNumber}
                      </h3>
                      {getStatusBadge(quote.status)}
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

                  <div className="flex items-center gap-4 sm:flex-shrink-0">
                    <div className="text-right">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                        Toplam Tutar
                      </p>
                      <p className="text-2xl font-bold text-gray-900">
                        {formatCurrency(quote.grandTotal)}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 flex-shrink-0 text-gray-300" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
