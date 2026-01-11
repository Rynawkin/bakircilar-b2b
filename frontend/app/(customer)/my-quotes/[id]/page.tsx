'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import customerApi from '@/lib/api/customer';
import { Quote } from '@/types';
import { useAuthStore } from '@/lib/store/authStore';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate } from '@/lib/utils/format';

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'PENDING_APPROVAL':
      return <Badge variant="warning">Onay Bekliyor</Badge>;
    case 'SENT_TO_MIKRO':
      return <Badge variant="success">Gonderildi</Badge>;
    case 'REJECTED':
      return <Badge variant="danger">Reddedildi</Badge>;
    case 'CUSTOMER_ACCEPTED':
      return <Badge variant="success">Kabul Edildi</Badge>;
    case 'CUSTOMER_REJECTED':
      return <Badge variant="danger">Red Edildi</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
};

export default function QuoteDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { user, loadUserFromStorage } = useAuthStore();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const quoteId = params?.id as string;

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (!quoteId) return;
    fetchQuote();
  }, [quoteId]);

  const fetchQuote = async () => {
    setIsLoading(true);
    try {
      const { quote } = await customerApi.getQuoteById(quoteId);
      setQuote(quote);
    } catch (error) {
      console.error('Teklif detayi alinmadi:', error);
      toast.error('Teklif bulunamadi.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!quote) return;
    if (!confirm('Teklifi kabul etmek istiyor musunuz?')) return;

    try {
      await customerApi.acceptQuote(quote.id);
      toast.success('Teklif kabul edildi.');
      fetchQuote();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Islem basarisiz.');
    }
  };

  const handleReject = async () => {
    if (!quote) return;
    if (!confirm('Teklifi reddetmek istiyor musunuz?')) return;

    try {
      await customerApi.rejectQuote(quote.id);
      toast.success('Teklif reddedildi.');
      fetchQuote();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Islem basarisiz.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-purple-50 to-gray-100">


      <div className="container-custom py-8">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : !quote ? (
          <Card>
            <div className="text-center py-12">
              <p className="text-gray-600">Teklif bulunamadi.</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card>
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6 pb-6 border-b-2 border-gray-100">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-2xl font-bold text-gray-900">Teklif #{quote.quoteNumber}</h2>
                    {getStatusBadge(quote.status)}
                  </div>
                  <div className="text-sm text-gray-600">Olusturma: {formatDate(quote.createdAt)}</div>
                  <div className="text-sm text-gray-600">Gecerlilik: {formatDate(quote.validityDate)}</div>
                  {quote.mikroNumber && (
                    <div className="mt-2 text-xs text-blue-700">Mikro No: {quote.mikroNumber}</div>
                  )}
                  {quote.adminNote && (
                    <div className="mt-3 bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded-lg">
                      <p className="text-xs font-semibold text-yellow-800 mb-1">Admin Notu</p>
                      <p className="text-sm text-yellow-700">{quote.adminNote}</p>
                    </div>
                  )}
                </div>
                <div className="text-right bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl p-4 border-2 border-primary-200">
                  <p className="text-sm text-gray-600 mb-1">Toplam Tutar</p>
                  <p className="text-3xl font-bold text-primary-700">
                    {formatCurrency(quote.grandTotal)}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {quote.items.map((item) => (
                  <div key={item.id} className="bg-gradient-to-r from-gray-50 to-white rounded-xl p-4 border-2 border-gray-200">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <p className="font-bold text-gray-900 text-lg mb-1">{item.productName}</p>
                        <div className="text-xs text-gray-500">{item.productCode}</div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600 mb-1">
                          {item.quantity} x {formatCurrency(item.unitPrice)}
                        </p>
                        <p className="text-xl font-bold text-primary-600">
                          {formatCurrency(item.totalPrice)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {quote.status === 'SENT_TO_MIKRO' && (
                <div className="flex flex-wrap gap-3 justify-end mt-6">
                  <Button variant="primary" onClick={handleAccept}>
                    Teklifi Kabul Et
                  </Button>
                  <Button variant="danger" onClick={handleReject}>
                    Teklifi Reddet
                  </Button>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
