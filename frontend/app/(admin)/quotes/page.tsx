'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { Quote, QuoteStatus } from '@/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LogoLink } from '@/components/ui/Logo';
import { CustomerInfoCard } from '@/components/ui/CustomerInfoCard';
import { useAuthStore } from '@/lib/store/authStore';
import { formatCurrency, formatDate } from '@/lib/utils/format';

type QuoteStatusFilter = QuoteStatus | 'ALL';

const DEFAULT_WHATSAPP_TEMPLATE =
  'Merhaba {{customerName}}, teklifiniz hazır. Teklif No: {{quoteNumber}}. Link: {{quoteLink}}. Geçerlilik: {{validUntil}}.';

const getStatusBadge = (status: QuoteStatus) => {
  switch (status) {
    case 'PENDING_APPROVAL':
      return <Badge variant="warning">⏳ Onay Bekliyor</Badge>;
    case 'SENT_TO_MIKRO':
      return <Badge variant="success">✅ Mikro'ya Gönderildi</Badge>;
    case 'REJECTED':
      return <Badge variant="danger">❌ Reddedildi</Badge>;
    case 'CUSTOMER_ACCEPTED':
      return <Badge variant="success">🤝 Müşteri Kabul</Badge>;
    case 'CUSTOMER_REJECTED':
      return <Badge variant="danger">🚫 Müşteri Red</Badge>;
    default:
      return null;
  }
};

const buildWhatsappMessage = (template: string, quote: Quote, link: string, customerName: string) => {
  const safeTemplate = template || DEFAULT_WHATSAPP_TEMPLATE;
  return safeTemplate
    .replace(/{{customerName}}/g, customerName || '')
    .replace(/{{quoteNumber}}/g, quote.quoteNumber)
    .replace(/{{quoteLink}}/g, link)
    .replace(/{{validUntil}}/g, formatDate(quote.validityDate));
};

const cleanPdfText = (text: string) => {
  return text
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .replace(/Ş/g, 'S')
    .replace(/ş/g, 's')
    .replace(/Ğ/g, 'G')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'U')
    .replace(/ü/g, 'u')
    .replace(/Ö/g, 'O')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'C')
    .replace(/ç/g, 'c');
};

export default function AdminQuotesPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [allQuotes, setAllQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingQuoteId, setSyncingQuoteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<QuoteStatusFilter>('PENDING_APPROVAL');
  const [whatsappTemplate, setWhatsappTemplate] = useState(DEFAULT_WHATSAPP_TEMPLATE);

  useEffect(() => {
    fetchQuotes();
    fetchPreferences();
  }, []);

  useEffect(() => {
    if (activeTab === 'ALL') {
      setQuotes(allQuotes);
    } else {
      setQuotes(allQuotes.filter((quote) => quote.status === activeTab));
    }
  }, [activeTab, allQuotes]);

  const fetchQuotes = async () => {
    try {
      const { quotes } = await adminApi.getQuotes();
      setAllQuotes(quotes);
      setQuotes(quotes.filter((quote) => quote.status === 'PENDING_APPROVAL'));
    } finally {
      setLoading(false);
    }
  };

  const fetchPreferences = async () => {
    try {
      const { preferences } = await adminApi.getQuotePreferences();
      if (preferences?.whatsappTemplate) {
        setWhatsappTemplate(preferences.whatsappTemplate);
      }
    } catch (error) {
      console.error('Teklif tercihleri alınamadı:', error);
    }
  };

  const handleApprove = async (quoteId: string) => {
    const note = await new Promise<string>((resolve) => {
      let inputValue = '';
      toast(
        (t) => (
          <div className="flex flex-col gap-3 min-w-[300px]">
            <p className="font-medium">Onay notu (opsiyonel):</p>
            <input
              type="text"
              className="border rounded px-3 py-2 text-sm"
              placeholder="Not ekleyin..."
              onChange={(e) => (inputValue = e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <button
                className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                onClick={() => {
                  toast.dismiss(t.id);
                  resolve('__CANCEL__');
                }}
              >
                İptal
              </button>
              <button
                className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                onClick={() => {
                  toast.dismiss(t.id);
                  resolve(inputValue);
                }}
              >
                Onayla
              </button>
            </div>
          </div>
        ),
        { duration: Infinity }
      );
    });

    if (note === '__CANCEL__') return;

    try {
      await adminApi.approveQuote(quoteId, note || undefined);
      toast.success('Teklif onaylandı ve Mikro\'ya gönderildi');
      fetchQuotes();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Onaylama başarısız');
    }
  };

  const handleReject = async (quoteId: string) => {
    const note = await new Promise<string>((resolve) => {
      let inputValue = '';
      toast(
        (t) => (
          <div className="flex flex-col gap-3 min-w-[300px]">
            <p className="font-medium text-red-700">Red sebebi (zorunlu):</p>
            <textarea
              className="border rounded px-3 py-2 text-sm resize-none"
              rows={3}
              placeholder="Red sebebini yazın..."
              onChange={(e) => (inputValue = e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <button
                className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                onClick={() => {
                  toast.dismiss(t.id);
                  resolve('__CANCEL__');
                }}
              >
                İptal
              </button>
              <button
                className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                onClick={() => {
                  toast.dismiss(t.id);
                  if (!inputValue.trim()) {
                    toast.error('Red sebebi girilmelidir');
                    resolve('__CANCEL__');
                  } else {
                    resolve(inputValue);
                  }
                }}
              >
                Reddet
              </button>
            </div>
          </div>
        ),
        { duration: Infinity }
      );
    });

    if (note === '__CANCEL__') return;

    try {
      await adminApi.rejectQuote(quoteId, note);
      toast.success('Teklif reddedildi');
      fetchQuotes();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Reddetme başarısız');
    }
  };

  const handleWhatsappShare = (quote: Quote) => {
    const customerName = quote.customer?.displayName || quote.customer?.name || '';
    const quoteLink = `${window.location.origin}/my-quotes/${quote.id}`;
    const message = buildWhatsappMessage(whatsappTemplate, quote, quoteLink, customerName);
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const handlePdfExport = async (quote: Quote) => {
    try {
      const { default: jsPDF } = await import('jspdf');
      await import('jspdf-autotable');

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const customerName = quote.customer?.displayName || quote.customer?.name || '';

      doc.setFontSize(16);
      doc.text(cleanPdfText('TEKLİF FORMU'), 105, 15, { align: 'center' });

      doc.setFontSize(10);
      doc.text(cleanPdfText(`Teklif No: ${quote.quoteNumber}`), 14, 25);
      doc.text(cleanPdfText(`Müşteri: ${customerName}`), 14, 30);
      doc.text(cleanPdfText(`Geçerlilik: ${formatDate(quote.validityDate)}`), 14, 35);
      if (quote.mikroNumber) {
        doc.text(cleanPdfText(`Mikro No: ${quote.mikroNumber}`), 14, 40);
      }

      const tableData = quote.items.map((item) => [
        cleanPdfText(item.productCode),
        cleanPdfText(item.productName),
        item.quantity.toString(),
        formatCurrency(item.unitPrice),
        formatCurrency(item.totalPrice),
      ]);

      (doc as any).autoTable({
        startY: 46,
        head: [[
          'Stok Kodu',
          'Ürün',
          'Miktar',
          'Birim Fiyat',
          'Tutar',
        ]],
        body: tableData,
        styles: {
          fontSize: 9,
          cellPadding: 3,
          overflow: 'linebreak',
          halign: 'left',
          font: 'helvetica',
        },
        headStyles: {
          fillColor: [66, 139, 202],
          textColor: 255,
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 10,
        },
        columnStyles: {
          0: { cellWidth: 28 },
          1: { cellWidth: 60 },
          2: { cellWidth: 18, halign: 'right' },
          3: { cellWidth: 30, halign: 'right' },
          4: { cellWidth: 30, halign: 'right' },
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245],
        },
        margin: { top: 46, left: 14, right: 14 },
      });

      const finalY = (doc as any).lastAutoTable?.finalY || 60;
      doc.setFontSize(11);
      doc.text(cleanPdfText(`Ara Toplam: ${formatCurrency(quote.totalAmount)}`), 140, finalY + 8);
      doc.text(cleanPdfText(`KDV: ${formatCurrency(quote.totalVat)}`), 140, finalY + 14);
      doc.setFontSize(12);
      doc.text(cleanPdfText(`Genel Toplam: ${formatCurrency(quote.grandTotal)}`), 140, finalY + 22);

      const fileName = `${quote.quoteNumber}_${cleanPdfText(customerName || 'Teklif')}.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error('PDF oluşturma hatası:', error);
      toast.error('PDF oluşturulamadı');
    }
  };

  const handleSync = async (quoteId: string) => {
    setSyncingQuoteId(quoteId);
    try {
      const { updated } = await adminApi.syncQuote(quoteId);
      if (updated) {
        toast.success('Mikro guncellendi.');
      } else {
        toast.success('Mikroda degisiklik yok.');
      }
      fetchQuotes();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Mikro guncelleme basarisiz');
    } finally {
      setSyncingQuoteId(null);
    }
  };

  const counts = {
    pending: allQuotes.filter((q) => q.status === 'PENDING_APPROVAL').length,
    sent: allQuotes.filter((q) => q.status === 'SENT_TO_MIKRO').length,
    rejected: allQuotes.filter((q) => q.status === 'REJECTED').length,
    accepted: allQuotes.filter((q) => q.status === 'CUSTOMER_ACCEPTED').length,
    all: allQuotes.length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'HEAD_ADMIN';

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-primary-700 to-primary-600 shadow-lg">
        <div className="container-custom py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-6">
              <LogoLink href="/dashboard" variant="light" />
              <div>
                <h1 className="text-xl font-bold text-white">📄 Teklifler</h1>
                <p className="text-sm text-primary-100">Müşteri teklif yönetimi</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => router.push('/quotes/new')}
                className="bg-white text-primary-700 hover:bg-primary-50"
              >
                + Yeni Teklif
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.push('/dashboard')}
                className="bg-white text-primary-700 hover:bg-primary-50"
              >
                ← Dashboard
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container-custom">
          <div className="flex gap-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab('PENDING_APPROVAL')}
              className={`px-6 py-4 font-semibold text-sm whitespace-nowrap transition-colors relative ${
                activeTab === 'PENDING_APPROVAL'
                  ? 'text-primary-600 border-b-2 border-primary-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              ⏳ Onay Bekleyen
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'PENDING_APPROVAL' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'
              }`}>{counts.pending}</span>
            </button>
            <button
              onClick={() => setActiveTab('SENT_TO_MIKRO')}
              className={`px-6 py-4 font-semibold text-sm whitespace-nowrap transition-colors relative ${
                activeTab === 'SENT_TO_MIKRO'
                  ? 'text-green-600 border-b-2 border-green-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              ✅ Gönderilen
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'SENT_TO_MIKRO' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}>{counts.sent}</span>
            </button>
            <button
              onClick={() => setActiveTab('REJECTED')}
              className={`px-6 py-4 font-semibold text-sm whitespace-nowrap transition-colors relative ${
                activeTab === 'REJECTED'
                  ? 'text-red-600 border-b-2 border-red-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              ❌ Reddedilen
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
              }`}>{counts.rejected}</span>
            </button>
            <button
              onClick={() => setActiveTab('CUSTOMER_ACCEPTED')}
              className={`px-6 py-4 font-semibold text-sm whitespace-nowrap transition-colors relative ${
                activeTab === 'CUSTOMER_ACCEPTED'
                  ? 'text-green-700 border-b-2 border-green-700'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              🤝 Müşteri Kabul
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'CUSTOMER_ACCEPTED' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}>{counts.accepted}</span>
            </button>
            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-6 py-4 font-semibold text-sm whitespace-nowrap transition-colors relative ${
                activeTab === 'ALL'
                  ? 'text-gray-900 border-b-2 border-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              📋 Tümü
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'ALL' ? 'bg-gray-200 text-gray-900' : 'bg-gray-100 text-gray-600'
              }`}>{counts.all}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="container-custom py-8">
        {quotes.length === 0 ? (
          <Card>
            <p className="text-center text-gray-600 py-8">
              Seçili filtrede teklif bulunamadı.
            </p>
          </Card>
        ) : (
          <div className="space-y-6">
            {quotes.map((quote) => (
              <Card key={quote.id} className="overflow-hidden">
                <div className="flex justify-between items-start mb-4 pb-4 border-b border-gray-200">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="font-bold text-xl text-gray-900">#{quote.quoteNumber}</h3>
                      {getStatusBadge(quote.status)}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">Oluşturma: {formatDate(quote.createdAt)}</p>
                    <p className="text-sm text-gray-500">Geçerlilik: {formatDate(quote.validityDate)}</p>
                    {quote.mikroNumber && (
                      <div className="mt-2 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                        <span className="text-xs font-medium text-blue-700">Mikro No:</span>
                        <span className="text-xs font-mono font-bold text-blue-900">{quote.mikroNumber}</span>
                      </div>
                    )}
                    {quote.adminNote && (
                      <div className="mt-2 bg-gray-50 border border-gray-200 rounded px-3 py-2">
                        <p className="text-xs font-medium text-gray-600">Admin Notu:</p>
                        <p className="text-sm text-gray-800 mt-1">{quote.adminNote}</p>
                      </div>
                    )}
                    {quote.createdBy && (
                      <div className="mt-2 text-xs text-gray-500">
                        Oluşturan: {quote.createdBy.name}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500 mb-1">Toplam</p>
                    <p className="text-2xl font-bold text-primary-600">{formatCurrency(quote.grandTotal)}</p>
                  </div>
                </div>

                {quote.customer && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Müşteri Bilgileri</h4>
                    <CustomerInfoCard customer={quote.customer} />
                  </div>
                )}

                <div className="border-t pt-4 mb-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3">Teklif Kalemleri ({quote.items.length} ürün)</p>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    {quote.items.map((item) => (
                      <div key={item.id} className="flex justify-between items-center text-sm py-2 px-3 bg-white rounded border border-gray-100">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{item.productName}</p>
                          <div className="flex gap-2 mt-1 flex-wrap">
                            <span className="text-xs text-gray-500">{item.productCode}</span>
                            <Badge variant="default" className="text-xs">
                              {item.priceSource === 'PRICE_LIST' ? `Liste ${item.priceListNo}` :
                               item.priceSource === 'LAST_SALE' ? 'Son Satış' : 'Manuel'}
                            </Badge>
                            {item.isBlocked && <Badge variant="warning" className="text-xs">Blok</Badge>}
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <p className="text-gray-600">{item.quantity} x {formatCurrency(item.unitPrice)}</p>
                          <p className="font-semibold text-gray-900">{formatCurrency(item.totalPrice)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-200">
                  <Button variant="secondary" onClick={() => handlePdfExport(quote)}>
                    PDF İndir
                  </Button>
                  <Button variant="secondary" onClick={() => handleWhatsappShare(quote)}>
                    WhatsApp Paylaş
                  </Button>
                  {quote.mikroNumber && (
                    <Button
                      variant="secondary"
                      onClick={() => handleSync(quote.id)}
                      disabled={syncingQuoteId === quote.id}
                    >
                      {syncingQuoteId === quote.id ? 'Guncelleniyor...' : 'Mikrodan Guncelle'}
                    </Button>
                  )}
                  {quote.status === 'PENDING_APPROVAL' && isAdmin && (
                    <>
                      <Button variant="primary" onClick={() => handleApprove(quote.id)}>
                        Onayla ve Mikro'ya Gönder
                      </Button>
                      <Button variant="danger" onClick={() => handleReject(quote.id)}>
                        Reddet
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
