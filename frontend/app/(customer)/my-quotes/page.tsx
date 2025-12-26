'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import customerApi from '@/lib/api/customer';
import { Quote } from '@/types';
import { useAuthStore } from '@/lib/store/authStore';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LogoLink } from '@/components/ui/Logo';
import { MobileMenu } from '@/components/ui/MobileMenu';
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

export default function MyQuotesPage() {
  const router = useRouter();
  const { user, loadUserFromStorage, logout } = useAuthStore();
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-purple-50 to-gray-100">
      <header className="bg-gradient-to-r from-primary-700 via-primary-600 to-primary-700 shadow-xl border-b-4 border-primary-800">
        <div className="container-custom py-5">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-6">
              <LogoLink href="/products" variant="light" />
              <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                  <span className="text-3xl">📄</span>
                  Tekliflerim
                </h1>
                <p className="text-sm text-primary-100 font-medium">
                  {isLoading ? 'Yukleniyor...' : quotes.length > 0 ? `${quotes.length} teklif` : 'Henuz teklif yok'}
                </p>
              </div>
            </div>
            <div className="hidden lg:flex gap-3">
              <Button
                variant="secondary"
                onClick={() => router.push('/products')}
                className="bg-white text-primary-700 hover:bg-primary-50 border-0 shadow-md font-semibold"
              >
                Urunler
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.push('/cart')}
                className="bg-white text-primary-700 hover:bg-primary-50 border-0 shadow-md font-semibold"
              >
                Sepet
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.push('/profile')}
                className="bg-white text-primary-700 hover:bg-primary-50 border-0 shadow-md font-semibold"
              >
                Profil
              </Button>
              <Button
                variant="ghost"
                onClick={() => { logout(); router.push('/login'); }}
                className="text-white hover:bg-primary-800 border border-white/30"
              >
                Cikis
              </Button>
            </div>
            <MobileMenu
              items={[
                { label: 'Urunler', href: '/products', icon: '🛍️' },
                { label: 'Sepetim', href: '/cart', icon: '🛒' },
                { label: 'Tekliflerim', href: '/my-quotes', icon: '📄' },
                { label: 'Profilim', href: '/profile', icon: '👤' },
                { label: 'Tercihler', href: '/preferences', icon: '⚙️' },
              ]}
              user={user}
              onLogout={() => { logout(); router.push('/login'); }}
            />
          </div>
        </div>
      </header>

      <div className="container-custom py-8">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : quotes.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <p className="text-gray-600 mb-4">Henuz teklifiniz bulunmuyor</p>
              <Button onClick={() => router.push('/products')}>
                Urunleri Incele
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-6">
            {quotes.map((quote) => (
              <Card key={quote.id} className="shadow-xl border-2 border-primary-100 bg-white">
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6 pb-6 border-b-2 border-gray-100">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-2xl font-bold text-gray-900">Teklif #{quote.quoteNumber}</h3>
                      {getStatusBadge(quote.status)}
                    </div>
                    <div className="text-sm text-gray-600">
                      Olusturma: {formatDate(quote.createdAt)}
                    </div>
                    <div className="text-sm text-gray-600">
                      Gecerlilik: {formatDate(quote.validityDate)}
                    </div>
                    {quote.mikroNumber && (
                      <div className="mt-2 text-xs text-blue-700">
                        Mikro No: {quote.mikroNumber}
                      </div>
                    )}
                  </div>
                  <div className="text-right bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl p-4 border-2 border-primary-200">
                    <p className="text-sm text-gray-600 mb-1">Toplam Tutar</p>
                    <p className="text-3xl font-bold text-primary-700">
                      {formatCurrency(quote.grandTotal)}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">{quote.items.length} urun</p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button variant="secondary" onClick={() => router.push(`/my-quotes/${quote.id}`)}>
                    Detay
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
