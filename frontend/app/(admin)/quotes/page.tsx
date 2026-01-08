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
import { formatCurrency, formatDate, formatDateShort } from '@/lib/utils/format';

type QuoteStatusFilter = QuoteStatus | 'ALL';

const DEFAULT_WHATSAPP_TEMPLATE =
  'Merhaba {{customerName}}, teklifiniz hazır. Teklif No: {{quoteNumber}}. Link: {{quoteLink}}. Geçerlilik: {{validUntil}}.';

const normalizeTurkishText = (text: string) => {
  return text
    .replace(/Ã‡/g, 'Ç')
    .replace(/Ã§/g, 'ç')
    .replace(/Ä°/g, 'İ')
    .replace(/Ä±/g, 'ı')
    .replace(/Ã–/g, 'Ö')
    .replace(/Ã¶/g, 'ö')
    .replace(/Ãœ/g, 'Ü')
    .replace(/Ã¼/g, 'ü')
    .replace(/Ä/g, 'Ğ')
    .replace(/ÄŸ/g, 'ğ')
    .replace(/Å/g, 'Ş')
    .replace(/ÅŸ/g, 'ş');
};

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
  const safeTemplate = normalizeTurkishText(template || DEFAULT_WHATSAPP_TEMPLATE);
  const safeCustomerName = normalizeTurkishText(customerName || '');
  return safeTemplate
    .replace(/{{customerName}}/g, safeCustomerName)
    .replace(/{{quoteNumber}}/g, quote.quoteNumber)
    .replace(/{{quoteLink}}/g, link)
    .replace(/{{validUntil}}/g, formatDate(quote.validityDate));
};

const cleanPdfText = (text: string | number | null | undefined) => {
  const value = text ?? '';
  return String(value)
    .replace(/\r?\n/g, ' ')
    .replace(/₺/g, 'TL')
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
        setWhatsappTemplate(normalizeTurkishText(preferences.whatsappTemplate));
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

  const handleWhatsappShare = async (quote: Quote) => {
    const customerName = quote.customer?.displayName || quote.customer?.name || '';
    const redirectPath = `/my-quotes/${quote.id}`;
    const quoteLink = `${window.location.origin}/login?redirect=${encodeURIComponent(redirectPath)}`;
    const message = buildWhatsappMessage(whatsappTemplate, quote, quoteLink, customerName);

    const canShareFile = typeof navigator !== 'undefined' && !!navigator.share && !!navigator.canShare;
    if (canShareFile) {
      try {
        const { doc, fileName } = await buildQuotePdf(quote);
        const blob = doc.output('blob');
        const file = new File([blob], fileName, { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text: message, title: fileName });
          return;
        }
      } catch (error) {
        console.error('PDF paylaşımı başarısız:', error);
      }
    }

    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const buildQuotePdf = async (quote: Quote) => {
    const { default: jsPDF } = await import('jspdf');
    const autoTableModule = await import('jspdf-autotable');
    const autoTable = (autoTableModule as any).default || (autoTableModule as any).autoTable;
    if (typeof autoTable !== 'function') {
      throw new Error('autoTable is not available');
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 14;
    const formatCurrencyTL = (value?: number | null) => {
      const amount = Number.isFinite(value) ? (value as number) : 0;
      return `${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
    };

      const formatRate = (value?: number | null) => {
        if (!Number.isFinite(value)) return '-';
        return Number(value).toLocaleString('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
      };

      const safeCurrency = (value?: number | null) => formatCurrencyTL(value);

      const colors = {
        primary: [37, 99, 235] as const,
        dark: [15, 23, 42] as const,
        muted: [100, 116, 139] as const,
        light: [248, 250, 252] as const,
        border: [226, 232, 240] as const,
      };

      const resolveImageUrl = (url?: string | null) => {
        if (!url) return null;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        if (url.startsWith('/')) return `${window.location.origin}${url}`;
        return `${window.location.origin}/${url}`;
      };

      const loadImageData = async (url: string): Promise<string | null> => {
        try {
          const response = await fetch(url);
          if (!response.ok) return null;
          const blob = await response.blob();
          return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          });
        } catch (error) {
          return null;
        }
      };

      const getImageFormat = (dataUrl: string) =>
        dataUrl.includes('image/png') ? 'PNG' : 'JPEG';

      const getImageDimensions = (dataUrl: string): Promise<{ width: number; height: number } | null> =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const width = img.naturalWidth || img.width;
            const height = img.naturalHeight || img.height;
            if (!width || !height) {
              resolve(null);
              return;
            }
            resolve({ width, height });
          };
          img.onerror = () => resolve(null);
          img.src = dataUrl;
        });

      const fitWithin = (width: number, height: number, maxWidth: number, maxHeight: number) => {
        if (!width || !height) {
          return { width: maxWidth, height: maxHeight };
        }
        const ratio = width / height;
        let fittedWidth = maxWidth;
        let fittedHeight = fittedWidth / ratio;
        if (fittedHeight > maxHeight) {
          fittedHeight = maxHeight;
          fittedWidth = fittedHeight * ratio;
        }
        return { width: fittedWidth, height: fittedHeight };
      };

      const logoPath = '/quote-logo.png';
      const logoUrl = resolveImageUrl(logoPath);
      const logoData = logoUrl ? await loadImageData(logoUrl) : null;
      const logoDimensions = logoData ? await getImageDimensions(logoData) : null;
      const logoMaxWidth = 70;
      const logoMaxHeight = 20;
      const logoSize = logoData
        ? logoDimensions
          ? fitWithin(logoDimensions.width, logoDimensions.height, logoMaxWidth, logoMaxHeight)
          : { width: logoMaxWidth, height: logoMaxHeight }
        : null;

      let usdRate: number | null = null;
      try {
        const usdResult = await adminApi.getUsdSellingRate();
        const parsed = Number(usdResult?.rate);
        usdRate = Number.isFinite(parsed) ? parsed : null;
      } catch (error) {
        console.error('USD kur alinamadi:', error);
      }

      const companyName =
        quote.customer?.mikroName ||
        quote.customer?.displayName ||
        quote.customer?.name ||
        '-';
      const contactName =
        quote.contactName ||
        quote.customer?.displayName ||
        quote.customer?.name ||
        '-';
      const customerPhone = quote.contactPhone || quote.customer?.phone || '-';
      const customerEmail = quote.contactEmail || quote.customer?.email || '-';
      const quoteDate = quote.createdAt ? formatDateShort(quote.createdAt) : '-';
      const validityText = quote.validityDate ? formatDateShort(quote.validityDate) : '-';
      const documentNo = quote.documentNo || '-';
      const createdByName = quote.createdBy?.name || '-';
      const createdByEmail = quote.createdBy?.email || '-';
      const createdByPhone = quote.createdBy?.phone || '-';

      const headerHeight = 28;
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageWidth, headerHeight, 'F');

      if (logoData && logoSize) {
        const logoFormat = getImageFormat(logoData);
        const logoY = (headerHeight - logoSize.height) / 2;
        const logoX = (pageWidth - logoSize.width) / 2;
        doc.addImage(logoData, logoFormat, logoX, logoY, logoSize.width, logoSize.height);
      }

      const infoY = 28;
      const boxHeight = 52;
      const boxGap = 6;
      const boxWidth = (pageWidth - marginX * 2 - boxGap) / 2;
      const rightBoxX = marginX + boxWidth + boxGap;
      const lineGap = 4.5;

      doc.setFillColor(...colors.light);
      doc.setDrawColor(...colors.border);
      doc.roundedRect(marginX, infoY, boxWidth, boxHeight, 2, 2, 'F');
      doc.roundedRect(rightBoxX, infoY, boxWidth, boxHeight, 2, 2, 'F');

      const writeLines = (lines: string[], x: number, startY: number, width: number) => {
        let currentY = startY;
        lines.forEach((line) => {
          const wrapped = doc.splitTextToSize(cleanPdfText(line), width) as string[];
          wrapped.forEach((chunk) => {
            doc.text(chunk, x, currentY);
            currentY += lineGap;
          });
        });
      };

      doc.setFontSize(9);
      doc.setTextColor(...colors.muted);
      doc.text(cleanPdfText('FIRMA BILGILERI'), marginX + 4, infoY + 6);
      doc.setTextColor(...colors.dark);
      writeLines(
        [
          `Firma: ${companyName}`,
          `Ilgili: ${contactName}`,
          `Tel: ${customerPhone}`,
          `Mail: ${customerEmail}`,
        ],
        marginX + 4,
        infoY + 12,
        boxWidth - 8
      );

      doc.setTextColor(...colors.muted);
      doc.text(cleanPdfText('TEKLIF BILGILERI'), rightBoxX + 4, infoY + 6);
      doc.setTextColor(...colors.dark);
      writeLines(
        [
          `Tarih: ${quoteDate}`,
          `Teklif No: ${quote.quoteNumber || '-'}`,
          `Belge No: ${documentNo}`,
          `Gecerlilik: ${validityText}`,
          `Teklifi Veren: ${createdByName}`,
          `Mail: ${createdByEmail}`,
          `Tel: ${createdByPhone}`,
        ],
        rightBoxX + 4,
        infoY + 12,
        boxWidth - 8
      );

      const tableStartY = infoY + boxHeight + 10;
      const items = Array.isArray(quote.items) ? quote.items : [];
      const imageCache = new Map<string, string | null>();
      const imageDataByIndex = await Promise.all(
        items.map(async (item) => {
          const imageUrl = resolveImageUrl(item.product?.imageUrl || null);
          if (!imageUrl) return null;
          if (imageCache.has(imageUrl)) {
            return imageCache.get(imageUrl) || null;
          }
          const dataUrl = await loadImageData(imageUrl);
          imageCache.set(imageUrl, dataUrl);
          return dataUrl;
        })
      );
      const imageMap = new Map<string, string>();

      const tableData = items.length > 0
        ? items.map((item, index) => {
          const imageKey = imageDataByIndex[index] ? `img_${index}` : '';
          if (imageKey && imageDataByIndex[index]) {
            imageMap.set(imageKey, imageDataByIndex[index] as string);
          }
          return [
            cleanPdfText(item.productName),
            { content: '', imageKey },
            String(item.quantity ?? 0),
            cleanPdfText(item.unit || item.product?.unit || '-'),
            cleanPdfText(safeCurrency(item.unitPrice)),
            cleanPdfText(safeCurrency(item.totalPrice)),
          ];
        })
        : [[
          cleanPdfText('Urun yok'),
          '',
          '0',
          '-',
          '-',
          '-',
        ]];

      autoTable(doc, {
        startY: tableStartY,
        head: [[
          'Urun Adi',
          'Gorsel',
          'Miktar',
          'Birim',
          'Birim Fiyat',
          'Toplam',
        ]],
        body: tableData,
        styles: {
          fontSize: 9,
          cellPadding: 2,
          minCellHeight: 18,
          overflow: 'linebreak',
          halign: 'left',
          font: 'helvetica',
          textColor: colors.dark,
          lineColor: colors.border,
          lineWidth: 0.1,
        },
        headStyles: {
          fillColor: colors.primary,
          textColor: 255,
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 10,
        },
        columnStyles: {
          0: { cellWidth: 68 },
          1: { cellWidth: 18, halign: 'center' },
          2: { cellWidth: 14, halign: 'right' },
          3: { cellWidth: 16, halign: 'center' },
          4: { cellWidth: 28, halign: 'right' },
          5: { cellWidth: 28, halign: 'right' },
        },
        alternateRowStyles: {
          fillColor: [245, 247, 250],
        },
        margin: { left: marginX, right: marginX },
        didDrawCell: (data: any) => {
          if (data.section !== 'body' || data.column.index !== 1) return;
          const raw = data.cell.raw as { imageKey?: string };
          const imageKey = raw?.imageKey;
          if (!imageKey) return;
          const imageData = imageMap.get(imageKey);
          if (!imageData) return;
          const format = getImageFormat(imageData);
          const size = Math.min(data.cell.width - 2, data.cell.height - 2);
          const x = data.cell.x + (data.cell.width - size) / 2;
          const y = data.cell.y + (data.cell.height - size) / 2;
          doc.addImage(imageData, format, x, y, size, size);
        },
      });

      const finalY = (doc as any).lastAutoTable?.finalY || tableStartY;
      const summaryWidth = 74;
      const summaryX = pageWidth - marginX - summaryWidth;

      const toDateOnly = (value?: string | Date | null) => {
        if (!value) return null;
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        date.setHours(0, 0, 0, 0);
        return date;
      };

      const createdDate = toDateOnly(quote.createdAt);
      const validDate = toDateOnly(quote.validityDate);
      const validityDays =
        createdDate && validDate
          ? Math.max(0, Math.round((validDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)))
          : 0;
      const paymentTerm = quote.customer?.paymentTerm;
      const paymentPlanLabel = quote.customer?.paymentPlanName || quote.customer?.paymentPlanCode
        ? [quote.customer?.paymentPlanCode, quote.customer?.paymentPlanName].filter(Boolean).join(' - ')
        : paymentTerm !== undefined && paymentTerm !== null
          ? `${paymentTerm} gun`
          : '-';

      const terms = [
        `Teklif gecerlilik suresi: ${validityDays} gun`,
        `Vade: ${paymentPlanLabel}`,
        'Fiyatlarimiza KDV dahil degildir.',
        'Dovizli islemlerde TCMB USD satis kuru baz alinir.',
        `USD satis kuru: ${usdRate ? formatRate(usdRate) : '-'}`,
      ];

      const summaryRows = [
        { label: 'Ara Toplam', value: safeCurrency(quote.totalAmount) },
        { label: 'Iskonto', value: safeCurrency(0) },
        { label: 'KDV', value: safeCurrency(quote.totalVat) },
        { label: 'Genel Toplam', value: safeCurrency(quote.grandTotal), highlight: true },
      ];

      const termLineGap = 4.2;
      const termPadding = 5;
      const termTitle = 'TEKLIF SARTLARI';
      const termTitleOffset = 6;
      const termBoxWidth = pageWidth - marginX * 2 - summaryWidth - 8;
      const wrappedTerms = terms.flatMap((line) =>
        doc.splitTextToSize(cleanPdfText(line), termBoxWidth - 8) as string[]
      );
      const termBoxHeight = Math.max(
        wrappedTerms.length * termLineGap + termPadding * 2 + termTitleOffset,
        26
      );

      const summaryLineGap = 5;
      const summaryHeight = Math.max(summaryRows.length * summaryLineGap + 6, 26);

      const footerLineGap = 4.2;
      const footerLines = [
        'BAKIRCILAR AMBALAJ END.-TEM VE KIRTASIYE',
        'MERKEZ: RASIMPASA MAH. ATATURK BLV. NO:69/A HENDEK/SAKARYA',
        'SUBE 1: TOPCA TOPTANCILAR CARSISI A BLOK NO: 20 - ERENLER/SAKARYA',
        'TEL: 0264 614 67 77  FAX: 0264 614 66 60 - info@bakircilarambalaj.com',
        'www.bakircilargrup.com',
      ];
      const footerHeight = footerLines.length * footerLineGap + 4;

      let sectionY = finalY + 8;
      const sectionHeight = Math.max(termBoxHeight, summaryHeight);

      if (sectionY + sectionHeight + footerHeight > pageHeight - 10) {
        doc.addPage();
        sectionY = 20;
      }

      doc.setFillColor(...colors.light);
      doc.roundedRect(marginX, sectionY, termBoxWidth, termBoxHeight, 2, 2, 'F');
      doc.setFontSize(8);
      doc.setTextColor(...colors.muted);
      doc.text(cleanPdfText(termTitle), marginX + 4, sectionY + 4);
      doc.setFontSize(9);
      doc.setTextColor(...colors.dark);
      let termY = sectionY + termPadding + termTitleOffset;
      wrappedTerms.forEach((line) => {
        doc.text(line, marginX + 4, termY);
        termY += termLineGap;
      });

      doc.setFillColor(...colors.light);
      doc.roundedRect(summaryX, sectionY, summaryWidth, summaryHeight, 2, 2, 'F');
      const summaryStartY = sectionY + 6;
      summaryRows.forEach((row, index) => {
        const y = summaryStartY + index * summaryLineGap;
        const labelSize = row.highlight ? 10 : 9;
        const valueSize = row.highlight ? 10 : 9;
        doc.setFontSize(labelSize);
        doc.setTextColor(...colors.muted);
        doc.text(cleanPdfText(row.label), summaryX + 4, y);
        doc.setFontSize(valueSize);
        doc.setTextColor(...colors.dark);
        doc.text(cleanPdfText(row.value), summaryX + summaryWidth - 4, y, { align: 'right' });
      });

      const footerStartY = sectionY + sectionHeight + 12;

      if (footerStartY + footerHeight > pageHeight - 8) {
        doc.addPage();
        doc.setFontSize(8);
        doc.setTextColor(...colors.muted);
        let footerY = 20;
        footerLines.forEach((line) => {
          doc.text(cleanPdfText(line), pageWidth / 2, footerY, { align: 'center' });
          footerY += footerLineGap;
        });
      } else {
        doc.setDrawColor(...colors.border);
        doc.line(marginX, footerStartY - 6, pageWidth - marginX, footerStartY - 6);
        doc.setFontSize(8);
        doc.setTextColor(...colors.muted);
        let footerY = footerStartY;
        footerLines.forEach((line) => {
          doc.text(cleanPdfText(line), pageWidth / 2, footerY, { align: 'center' });
          footerY += footerLineGap;
        });
      }

    const fileName = `${quote.quoteNumber}_${cleanPdfText(companyName || 'Teklif')}.pdf`;
    return { doc, fileName };
  };

  const handlePdfExport = async (quote: Quote) => {
    try {
      const { doc, fileName } = await buildQuotePdf(quote);
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
