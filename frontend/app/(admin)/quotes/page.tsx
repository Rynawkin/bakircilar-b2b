'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { Quote, QuoteHistory, QuoteStatus } from '@/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { CustomerInfoCard } from '@/components/ui/CustomerInfoCard';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';
import { formatCurrency, formatDate, formatDateShort } from '@/lib/utils/format';
import * as XLSX from 'xlsx';

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

const TAB_PARAM_MAP: Record<string, QuoteStatusFilter> = {
  pending: 'PENDING_APPROVAL',
  sent: 'SENT_TO_MIKRO',
  rejected: 'REJECTED',
  accepted: 'CUSTOMER_ACCEPTED',
  all: 'ALL',
};

const resolveTabFilter = (value: string | null): QuoteStatusFilter | null => {
  if (!value) return null;
  const key = value.toLowerCase();
  return TAB_PARAM_MAP[key] || null;
};

const resolveTabParam = (value: QuoteStatusFilter): string => {
  switch (value) {
    case 'PENDING_APPROVAL':
      return 'pending';
    case 'SENT_TO_MIKRO':
      return 'sent';
    case 'REJECTED':
      return 'rejected';
    case 'CUSTOMER_ACCEPTED':
      return 'accepted';
    case 'ALL':
      return 'all';
    default:
      return 'pending';
  }
};

function AdminQuotesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const { hasPermission } = usePermissions();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [allQuotes, setAllQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingQuoteId, setSyncingQuoteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<QuoteStatusFilter>('PENDING_APPROVAL');
  const [whatsappTemplate, setWhatsappTemplate] = useState(DEFAULT_WHATSAPP_TEMPLATE);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedQuotes, setExpandedQuotes] = useState<Set<string>>(new Set());

  const [pendingDownloadId, setPendingDownloadId] = useState<string | null>(null);
  const [downloadPromptQuote, setDownloadPromptQuote] = useState<Quote | null>(null);
  const [downloadPromptOpen, setDownloadPromptOpen] = useState(false);
  const [downloadPromptLoading, setDownloadPromptLoading] = useState(false);
  const [downloadPromptRecommendedLoading, setDownloadPromptRecommendedLoading] = useState(false);
  const [stockPdfLoadingId, setStockPdfLoadingId] = useState<string | null>(null);
  const [recommendedPdfLoadingId, setRecommendedPdfLoadingId] = useState<string | null>(null);
  const handledDownloadRef = useRef<string | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyQuote, setHistoryQuote] = useState<Quote | null>(null);
  const [historyItems, setHistoryItems] = useState<QuoteHistory[]>([]);
  const [expandedHistoryEntries, setExpandedHistoryEntries] = useState<Set<string>>(new Set());
  const [pendingHistoryId, setPendingHistoryId] = useState<string | null>(null);
  const handledHistoryRef = useRef<string | null>(null);

  useEffect(() => {
    fetchQuotes();
    fetchPreferences();
  }, []);

  useEffect(() => {
    const tabParam = resolveTabFilter(searchParams.get('tab'));
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
    const downloadId = searchParams.get('download');
    if (downloadId !== pendingDownloadId) {
      setPendingDownloadId(downloadId);
    }
    const historyId = searchParams.get('history');
    if (historyId !== pendingHistoryId) {
      setPendingHistoryId(historyId);
    }
  }, [searchParams, activeTab, pendingDownloadId, pendingHistoryId]);

  useEffect(() => {
    if (!pendingDownloadId) return;
    if (handledDownloadRef.current === pendingDownloadId) return;
    const targetQuote = allQuotes.find((quote) => quote.id === pendingDownloadId);
    if (!targetQuote) return;
    handledDownloadRef.current = pendingDownloadId;
    setDownloadPromptQuote(targetQuote);
    setDownloadPromptOpen(true);
  }, [pendingDownloadId, allQuotes]);

  useEffect(() => {
    if (!pendingHistoryId) return;
    if (handledHistoryRef.current === pendingHistoryId) return;
    const targetQuote = allQuotes.find((quote) => quote.id === pendingHistoryId);
    if (!targetQuote) return;
    handledHistoryRef.current = pendingHistoryId;
    handleOpenHistory(targetQuote);
  }, [pendingHistoryId, allQuotes]);

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

  const parseStockNumber = (value: unknown) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    let raw = String(value).trim();
    if (/^-?\d{1,3}(?:\.\d{3})*(?:,\d+)?$/.test(raw)) {
      raw = raw.replace(/\./g, '').replace(',', '.');
    } else if (/^-?\d+,\d+$/.test(raw)) {
      raw = raw.replace(',', '.');
    } else if (/^-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$/.test(raw)) {
      raw = raw.replace(/,/g, '');
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const resolveStockValue = (row: Record<string, unknown> | null | undefined, keys: string[]) => {
    if (!row) return null;
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(row, key)) {
        const value = parseStockNumber((row as Record<string, unknown>)[key]);
        if (value !== null) return value;
      }
    }
    return null;
  };

  const getStockStatusLabel = (totalStock: number | null, quantity: number) => {
    if (!Number.isFinite(totalStock)) return 'Stok bilgisi yok';
    if ((totalStock ?? 0) <= 0) return 'Stok yok';
    if ((totalStock ?? 0) < quantity) return 'Kismi karsiliyor';
    return 'Stok karsiliyor';
  };

  const buildStockStatusMap = async (quote: Quote) => {
    const codes = Array.from(new Set(
      (quote.items || [])
        .map((item) => item.productCode)
        .filter((code) => typeof code === 'string' && code.trim().length > 0)
    ));
    if (codes.length === 0) return {} as Record<string, string>;

    try {
      const { data } = await adminApi.getStocksByCodes(codes);
      const stockByCode = new Map<string, number | null>();
      (data || []).forEach((row: Record<string, unknown>) => {
        const code = String(row?.['msg_S_0078'] ?? row?.['Stok Kodu'] ?? row?.['stok kod'] ?? '').trim();
        if (!code) return;
        const totalStock = resolveStockValue(row, [
          'Toplam Sat\u0131labilir',
          'Toplam Satilabilir',
          'Toplam Sat\u00C4\u00B1labilir',
          'Toplam Eldeki Miktar',
        ]);
        stockByCode.set(code, totalStock);
      });

      const statusMap: Record<string, string> = {};
      (quote.items || []).forEach((item) => {
        const code = String(item.productCode || '').trim();
        if (!code) return;
        const totalStock = stockByCode.has(code) ? stockByCode.get(code) ?? null : null;
        statusMap[code] = getStockStatusLabel(totalStock, Number(item.quantity) || 0);
      });
      return statusMap;
    } catch (error) {
      console.error('Stok bilgisi alinmadi:', error);
      const fallback: Record<string, string> = {};
      (quote.items || []).forEach((item) => {
        fallback[item.productCode] = 'Stok bilgisi yok';
      });
      return fallback;
    }
  };

  const buildQuotePdf = async (
    quote: Quote,
    options?: {
      includeStockStatus?: boolean;
      stockStatusMap?: Record<string, string>;
      recommendedProducts?: Array<{ mikroCode: string; name: string; imageUrl?: string | null }>;
    }
  ) => {
    const { default: jsPDF } = await import('jspdf');
    const autoTableModule = await import('jspdf-autotable');
    const autoTable = (autoTableModule as any).default || (autoTableModule as any).autoTable;
    if (typeof autoTable !== 'function') {
      throw new Error('autoTable is not available');
    }
    const includeStockStatus = options?.includeStockStatus === true;
    const stockStatusMap = options?.stockStatusMap || {};
    const recommendedProducts = options?.recommendedProducts || [];

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
      const imageCache = new Map<string, { dataUrl: string | null; dimensions: { width: number; height: number } | null }>();
      const imageDataByIndex = await Promise.all(
        items.map(async (item) => {
          const imageUrl = resolveImageUrl(item.manualImageUrl || item.product?.imageUrl || null);
          if (!imageUrl) return null;
          const cached = imageCache.get(imageUrl);
          if (cached) {
            return cached;
          }
          const dataUrl = await loadImageData(imageUrl);
          const dimensions = dataUrl ? await getImageDimensions(dataUrl) : null;
          const entry = { dataUrl, dimensions };
          imageCache.set(imageUrl, entry);
          return entry;
        })
      );
      const recommendedImageData = await Promise.all(
        recommendedProducts.map(async (product) => {
          const imageUrl = resolveImageUrl(product.imageUrl || null);
          if (!imageUrl) return null;
          const cached = imageCache.get(imageUrl);
          if (cached) {
            return cached;
          }
          const dataUrl = await loadImageData(imageUrl);
          const dimensions = dataUrl ? await getImageDimensions(dataUrl) : null;
          const entry = { dataUrl, dimensions };
          imageCache.set(imageUrl, entry);
          return entry;
        })
      );
      const imageMap = new Map<string, { dataUrl: string; dimensions: { width: number; height: number } | null }>();

      const stockFallbackLabel = 'Stok bilgisi yok';
      const emptyRowBase = [
        cleanPdfText('Urun yok'),
        '',
        '0',
        '-',
        '-',
        '-',
        '',
      ];
      const tableData = items.length > 0
        ? items.map((item, index) => {
          const imageEntry = imageDataByIndex[index];
          const imageKey = imageEntry?.dataUrl ? `img_${index}` : '';
          if (imageKey && imageEntry?.dataUrl) {
            imageMap.set(imageKey, { dataUrl: imageEntry.dataUrl, dimensions: imageEntry.dimensions });
          }
          const row = [
            cleanPdfText(item.productName || '-'),
            { content: '', imageKey },
            String(item.quantity ?? 0),
            cleanPdfText(item.unit || item.product?.unit || '-'),
            cleanPdfText(safeCurrency(item.unitPrice)),
            cleanPdfText(safeCurrency(item.totalPrice)),
            cleanPdfText(item.lineDescription || ''),
          ];
          if (includeStockStatus) {
            const statusKey = String(item.productCode || '').trim();
            const statusLabel = statusKey ? (stockStatusMap[statusKey] || stockFallbackLabel) : stockFallbackLabel;
            row.push(cleanPdfText(statusLabel));
          }
          return row;
        })
        : [includeStockStatus ? [...emptyRowBase, cleanPdfText(stockFallbackLabel)] : emptyRowBase];

      const tableHead = [
        'Urun Adi',
        'Gorsel',
        'Miktar',
        'Birim',
        'Birim Fiyat',
        'Toplam',
        'Aciklama',
      ];
      if (includeStockStatus) {
        tableHead.push('Stok Durumu');
      }

      const columnStyles = includeStockStatus
        ? {
          0: { cellWidth: 60 },
          1: { cellWidth: 16, halign: 'center' },
          2: { cellWidth: 12, halign: 'right' },
          3: { cellWidth: 14, halign: 'center' },
          4: { cellWidth: 24, halign: 'right' },
          5: { cellWidth: 24, halign: 'right' },
          6: { cellWidth: 18 },
          7: { cellWidth: 26, halign: 'center' },
        }
        : {
          0: { cellWidth: 68 },
          1: { cellWidth: 18, halign: 'center' },
          2: { cellWidth: 14, halign: 'right' },
          3: { cellWidth: 16, halign: 'center' },
          4: { cellWidth: 28, halign: 'right' },
          5: { cellWidth: 28, halign: 'right' },
          6: { cellWidth: 22 },
        };

      autoTable(doc, {
        startY: tableStartY,
        head: [tableHead],
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
        columnStyles,
        alternateRowStyles: {
          fillColor: [245, 247, 250],
        },
        margin: { left: 8, right: 8 },
        didDrawCell: (data: any) => {
          if (data.section !== 'body' || data.column.index !== 1) return;
          const raw = data.cell.raw as { imageKey?: string };
          const imageKey = raw?.imageKey;
          if (!imageKey) return;
          const imageEntry = imageMap.get(imageKey);
          if (!imageEntry?.dataUrl) return;
          const format = getImageFormat(imageEntry.dataUrl);
          const maxSize = Math.min(data.cell.width - 2, data.cell.height - 2);
          const fitted = imageEntry.dimensions
            ? fitWithin(imageEntry.dimensions.width, imageEntry.dimensions.height, maxSize, maxSize)
            : { width: maxSize, height: maxSize };
          const x = data.cell.x + (data.cell.width - fitted.width) / 2;
          const y = data.cell.y + (data.cell.height - fitted.height) / 2;
          doc.addImage(imageEntry.dataUrl, format, x, y, fitted.width, fitted.height);
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

      let contentBottomY = sectionY + sectionHeight;

      if (recommendedProducts.length > 0) {
        const columns = 2;
        const cardGap = 6;
        const cardWidth = (pageWidth - marginX * 2 - cardGap) / columns;
        const cardHeight = 18;
        const titleGap = 6;
        const rowGap = 4;
        const rowsNeeded = Math.ceil(recommendedProducts.length / columns);
        const sectionHeight = titleGap + rowsNeeded * (cardHeight + rowGap);
        let recommendedStartY = contentBottomY + 8;

        if (recommendedStartY + sectionHeight + footerHeight > pageHeight - 10) {
          doc.addPage();
          recommendedStartY = 20;
        }

        doc.setFontSize(9);
        doc.setTextColor(...colors.muted);
        doc.text(cleanPdfText('ONERILEN URUNLER'), marginX, recommendedStartY);

        const textStartY = recommendedStartY + titleGap;
        recommendedProducts.forEach((product, index) => {
          const columnIndex = index % columns;
          const rowIndex = Math.floor(index / columns);
          const x = marginX + columnIndex * (cardWidth + cardGap);
          const y = textStartY + rowIndex * (cardHeight + rowGap);
          const imageEntry = recommendedImageData[index];
          const imageSize = 12;
          const imageX = x + 3;
          const imageY = y + 3;
          const textX = imageX + imageSize + 3;
          const textWidth = cardWidth - (textX - x) - 3;

          doc.setDrawColor(...colors.border);
          doc.setFillColor(...colors.light);
          doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'F');

          if (imageEntry?.dataUrl) {
            const format = getImageFormat(imageEntry.dataUrl);
            const fitted = imageEntry.dimensions
              ? fitWithin(imageEntry.dimensions.width, imageEntry.dimensions.height, imageSize, imageSize)
              : { width: imageSize, height: imageSize };
            const imgX = imageX + (imageSize - fitted.width) / 2;
            const imgY = imageY + (imageSize - fitted.height) / 2;
            doc.addImage(imageEntry.dataUrl, format, imgX, imgY, fitted.width, fitted.height);
          } else {
            doc.setDrawColor(...colors.border);
            doc.rect(imageX, imageY, imageSize, imageSize);
          }

          doc.setFontSize(8);
          doc.setTextColor(...colors.dark);
          const nameLines = doc.splitTextToSize(cleanPdfText(product.name || '-'), textWidth) as string[];
          const nameLine = nameLines[0] || '-';
          doc.text(nameLine, textX, y + 7);
          if (product.mikroCode) {
            doc.setFontSize(7);
            doc.setTextColor(...colors.muted);
            doc.text(cleanPdfText(product.mikroCode), textX, y + 12);
          }
        });

        contentBottomY = recommendedStartY + sectionHeight;
      }

      const footerStartY = contentBottomY + 12;

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

  const handleStockPdfExport = async (quote: Quote) => {
    setStockPdfLoadingId(quote.id);
    try {
      const stockStatusMap = await buildStockStatusMap(quote);
      const { doc, fileName } = await buildQuotePdf(quote, { includeStockStatus: true, stockStatusMap });
      const stockFileName = fileName.replace(/\.pdf$/i, '_stok.pdf');
      doc.save(stockFileName);
    } catch (error) {
      console.error('Stoklu PDF olusturma hatasi:', error);
      toast.error('Stoklu PDF olusturulamadi');
    } finally {
      setStockPdfLoadingId(null);
    }
  };

  const handleRecommendedPdfExport = async (quote: Quote) => {
    setRecommendedPdfLoadingId(quote.id);
    try {
      const itemCodes = Array.from(
        new Set(
          (quote.items || [])
            .map((item) => String(item.productCode || '').trim())
            .filter(Boolean)
        )
      );

      if (itemCodes.length === 0) {
        toast.error('Teklifte urun yok');
        return;
      }

      const recommendationResult = await adminApi.getComplementRecommendations({
        productCodes: itemCodes,
        excludeCodes: itemCodes,
        limit: 10,
      });
      const recommendedProducts = recommendationResult.products || [];
      const { doc, fileName } = await buildQuotePdf(quote, { recommendedProducts });
      const recommendedFileName = fileName.replace(/\.pdf$/i, '_onerili.pdf');
      doc.save(recommendedFileName);
    } catch (error) {
      console.error('Onerili PDF olusturma hatasi:', error);
      toast.error('Onerili PDF olusturulamadi');
    } finally {
      setRecommendedPdfLoadingId(null);
    }
  };


  const handleExcelExport = (quote: Quote) => {
    try {
      const customerName =
        quote.customer?.displayName ||
        quote.customer?.mikroName ||
        quote.customer?.name ||
        '';
      const safeCustomer = customerName ? customerName.replace(/[^a-zA-Z0-9-_]+/g, '_') : 'Teklif';
      const headerRows = [
        ['Teklif No', quote.quoteNumber],
        ['Cari', customerName || '-'],
        ['Cari Kodu', quote.customer?.mikroCariCode || '-'],
        ['Tarih', quote.createdAt ? formatDateShort(quote.createdAt) : '-'],
        ['Gecerlilik', quote.validityDate ? formatDateShort(quote.validityDate) : '-'],
      ];
      const tableHeader = ['Urun Kodu', 'Urun Adi', 'Miktar', 'Birim', 'Birim Fiyat', 'Toplam', 'Tip', 'Aciklama'];
      const itemRows = (quote.items || []).map((item) => ([
        item.productCode,
        item.productName,
        item.quantity,
        item.unit || item.product?.unit || '',
        item.unitPrice,
        item.totalPrice,
        item.priceType === 'WHITE' ? 'Beyaz' : 'Faturali',
        item.lineDescription || '',
      ]));
      const rows = [...headerRows, [], tableHeader, ...itemRows];
      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Teklif');
      XLSX.writeFile(workbook, `${quote.quoteNumber}_${safeCustomer}.xlsx`);
    } catch (error) {
      console.error('Excel olusturma hatasi:', error);
      toast.error('Excel olusturulamadi');
    }
  };

  const clearDownloadParam = () => {
    const resolvedTab = resolveTabFilter(searchParams.get('tab')) || activeTab;
    const query = `?tab=${resolveTabParam(resolvedTab)}`;
    router.replace(`/quotes${query}`);
    setPendingDownloadId(null);
  };

  const handleDownloadPromptClose = () => {
    setDownloadPromptOpen(false);
    setDownloadPromptQuote(null);
    clearDownloadParam();
  };

  const handleDownloadPromptConfirm = async () => {
    if (!downloadPromptQuote) {
      handleDownloadPromptClose();
      return;
    }
    setDownloadPromptLoading(true);
    try {
      await handlePdfExport(downloadPromptQuote);
    } finally {
      setDownloadPromptLoading(false);
      handleDownloadPromptClose();
    }
  };

  const handleDownloadPromptRecommended = async () => {
    if (!downloadPromptQuote) {
      handleDownloadPromptClose();
      return;
    }
    setDownloadPromptRecommendedLoading(true);
    try {
      await handleRecommendedPdfExport(downloadPromptQuote);
    } finally {
      setDownloadPromptRecommendedLoading(false);
      handleDownloadPromptClose();
    }
  };

  const clearHistoryParam = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('history');
    if (!params.get('tab')) {
      params.set('tab', resolveTabParam(activeTab));
    }
    const query = params.toString();
    router.replace(query ? `/quotes?${query}` : '/quotes');
    setPendingHistoryId(null);
  };

  const handleHistoryClose = () => {
    setHistoryOpen(false);
    setHistoryQuote(null);
    setHistoryItems([]);
    setExpandedHistoryEntries(new Set());
    clearHistoryParam();
  };

  const handleOpenHistory = async (quote: Quote) => {
    setHistoryQuote(quote);
    setHistoryItems([]);
    setExpandedHistoryEntries(new Set());
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const { history } = await adminApi.getQuoteHistory(quote.id);
      setHistoryItems(history || []);
    } catch (error) {
      console.error('Teklif gecmisi yuklenemedi:', error);
      toast.error('Teklif gecmisi yuklenemedi.');
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  };


  const toggleHistoryEntry = (entryId: string) => {
    setExpandedHistoryEntries((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  };

  const resolveHistoryLabel = (action: QuoteHistory['action']) => {
    switch (action) {
      case 'CREATED':
        return 'Olusturuldu';
      case 'UPDATED':
        return 'Guncellendi';
      case 'STATUS_CHANGED':
        return 'Durum degisti';
      case 'CONVERTED':
        return 'Siparise cevrildi';
      default:
        return 'Islem';
    }
  };

  const buildHistoryDetails = (entry: QuoteHistory) => {
    const payload = entry.payload as any;
    const summaryLines: string[] = [];
    const changeLines: string[] = [];

    if (!payload || typeof payload !== 'object') {
      return { summaryLines, changeLines };
    }

    if (payload.status) summaryLines.push(`Durum: ${payload.status}`);
    if (payload.orderNumber) summaryLines.push(`Siparis: ${payload.orderNumber}`);
    if (Array.isArray(payload.mikroOrderIds) && payload.mikroOrderIds.length > 0) {
      summaryLines.push(`Mikro: ${payload.mikroOrderIds.join(', ')}`);
    }
    if (payload.itemCount) summaryLines.push(`Kalem: ${payload.itemCount}`);
    if (payload.totalAmount) summaryLines.push(`Tutar: ${formatCurrency(payload.totalAmount)}`);

    const changes = payload.changes || {};
    const added = Array.isArray(changes.added) ? changes.added : [];
    const removed = Array.isArray(changes.removed) ? changes.removed : [];
    const updated = Array.isArray(changes.updated) ? changes.updated : [];

    added.forEach((item: any) => {
      if (!item?.productCode) return;
      changeLines.push(`Eklendi: ${item.productCode} - ${item.productName || ''} (${item.quantity ?? '-'} adet)`);
    });
    removed.forEach((item: any) => {
      if (!item?.productCode) return;
      changeLines.push(`Silindi: ${item.productCode} - ${item.productName || ''}`);
    });
    updated.forEach((item: any) => {
      const parts: string[] = [];
      const changesMap = item?.changes || {};
      if (changesMap.quantity) {
        parts.push(`Miktar ${changesMap.quantity.from} -> ${changesMap.quantity.to}`);
      }
      if (changesMap.unitPrice) {
        parts.push(`Fiyat ${formatCurrency(changesMap.unitPrice.from)} -> ${formatCurrency(changesMap.unitPrice.to)}`);
      }
      if (changesMap.priceType) {
        parts.push(`Tip ${changesMap.priceType.from} -> ${changesMap.priceType.to}`);
      }
      if (changesMap.lineDescription) {
        parts.push('Aciklama guncellendi');
      }
      if (parts.length > 0) {
        changeLines.push(`${item.productCode} - ${item.productName || ''}: ${parts.join(', ')}`);
      }
    });

    return { summaryLines, changeLines };
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

  const updateTabParam = (tab: QuoteStatusFilter) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', resolveTabParam(tab));
    params.delete('history');
    params.delete('download');
    const query = params.toString();
    router.replace(query ? `/quotes?${query}` : '/quotes');
  };

  const handleTabChange = (tab: QuoteStatusFilter) => {
    setActiveTab(tab);
    updateTabParam(tab);
  };

  const toggleExpanded = (quoteId: string) => {
    setExpandedQuotes((prev) => {
      const next = new Set(prev);
      if (next.has(quoteId)) {
        next.delete(quoteId);
      } else {
        next.add(quoteId);
      }
      return next;
    });
  };

  const getConversionBadge = (quote: Quote) => {
    const hasOrders = Array.isArray(quote.orders) && quote.orders.length > 0;
    if (!quote.convertedAt && !hasOrders) return null;
    const source = quote.convertedSource || (hasOrders ? 'B2B' : undefined);
    const sourceLabel = source === 'MIKRO' ? 'Mikro' : 'B2B';
    return <Badge variant="info">Siparis ({sourceLabel})</Badge>;
  };

  const counts = {
    pending: allQuotes.filter((q) => q.status === 'PENDING_APPROVAL').length,
    sent: allQuotes.filter((q) => q.status === 'SENT_TO_MIKRO').length,
    rejected: allQuotes.filter((q) => q.status === 'REJECTED').length,
    accepted: allQuotes.filter((q) => q.status === 'CUSTOMER_ACCEPTED').length,
    all: allQuotes.length,
  };

  const filteredQuotes = useMemo(() => {
    const term = searchTerm.trim();
    if (!term) return quotes;
    const normalizedTerm = normalizeTurkishText(term).toLowerCase();

    return quotes.filter((quote) => {
      const customerName =
        quote.customer?.displayName ||
        quote.customer?.mikroName ||
        quote.customer?.name ||
        '';

      const haystack = [
        quote.quoteNumber,
        quote.documentNo,
        quote.mikroNumber,
        quote.customer?.mikroCariCode,
        customerName,
        quote.createdBy?.name,
      ]
        .filter(Boolean)
        .join(' ');

      return normalizeTurkishText(haystack).toLowerCase().includes(normalizedTerm);
    });
  }, [quotes, searchTerm]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const isAdmin = hasPermission('admin:quotes');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container-custom py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Teklifler</h1>
            <p className="text-sm text-gray-600">Musteri teklif yonetimi</p>
          </div>
          <Button variant="secondary" onClick={() => router.push('/quotes/new')}>
            + Yeni Teklif
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container-custom">
          <div className="flex gap-2 overflow-x-auto">
            <button
              onClick={() => handleTabChange('PENDING_APPROVAL')}
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
              onClick={() => handleTabChange('SENT_TO_MIKRO')}
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
              onClick={() => handleTabChange('REJECTED')}
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
              onClick={() => handleTabChange('CUSTOMER_ACCEPTED')}
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
              onClick={() => handleTabChange('ALL')}
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

      <div className="container-custom py-6 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari adı, teklif no, belge no veya müşteri kodu ara..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
            />
          </div>
          {searchTerm && (
            <Button variant="secondary" onClick={() => setSearchTerm('')}>
              Temizle
            </Button>
          )}
        </div>

        {filteredQuotes.length === 0 ? (
          <Card>
            <p className="text-center text-gray-600 py-8">
              Seçili filtrede teklif bulunamadı.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredQuotes.map((quote) => {
              const isExpanded = expandedQuotes.has(quote.id);
              const customerName =
                quote.customer?.displayName ||
                quote.customer?.mikroName ||
                quote.customer?.name ||
                '-';
              const customerCode = quote.customer?.mikroCariCode || '-';
              const canEdit = quote.status === 'PENDING_APPROVAL' || quote.status === 'SENT_TO_MIKRO';
              const createdAtText = quote.createdAt ? formatDate(quote.createdAt) : '-';
              const updatedAtText = quote.updatedAt ? formatDate(quote.updatedAt) : '-';
              const createdByName = quote.createdBy?.name || '-';
              const updatedByName = quote.updatedBy?.name || createdByName || '-';

              return (
                <Card key={quote.id} className="overflow-hidden">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-xs text-gray-500">Cari</div>
                      <div className="font-semibold text-gray-900">{customerName}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Kod: {customerCode} - Teklif #{quote.quoteNumber} - {createdAtText}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">Olusturan: {createdByName}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Guncelleme: {updatedAtText} - {updatedByName}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Geçerlilik: {formatDateShort(quote.validityDate)}
                      </div>
                      {quote.mikroNumber && (
                        <div className="mt-2 inline-flex items-center gap-2 rounded border border-blue-200 bg-blue-50 px-2 py-1">
                          <span className="text-xs font-medium text-blue-700">Mikro No:</span>
                          <span className="text-xs font-mono font-bold text-blue-900">{quote.mikroNumber}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                      {getStatusBadge(quote.status)}
                      {getConversionBadge(quote)}
                      <div className="text-right">
                        <div className="text-xs text-gray-500">Toplam</div>
                        <div className="text-lg font-bold text-primary-600">{formatCurrency(quote.grandTotal)}</div>
                      </div>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900"
                        onClick={() => toggleExpanded(quote.id)}
                      >
                        {isExpanded ? 'Detayı Gizle' : 'Detayı Göster'}
                        <span className={`inline-block transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => handlePdfExport(quote)}>
                      PDF İndir
                    </Button>
                    <Button variant="secondary" onClick={() => handleExcelExport(quote)}>
                      Excel Indir
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => handleStockPdfExport(quote)}
                      isLoading={stockPdfLoadingId === quote.id}
                      disabled={stockPdfLoadingId === quote.id}
                    >
                      Stoklu PDF Indir
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => handleRecommendedPdfExport(quote)}
                      isLoading={recommendedPdfLoadingId === quote.id}
                      disabled={recommendedPdfLoadingId === quote.id}
                    >
                      Onerili PDF Indir
                    </Button>
                    <Button variant="secondary" onClick={() => handleWhatsappShare(quote)}>
                      WhatsApp Paylaş
                    </Button>
                    <Button variant="secondary" onClick={() => handleOpenHistory(quote)}>
                      Gecmis
                    </Button>
                    {canEdit && (
                      <Button variant="secondary" onClick={() => router.push(`/quotes/new?edit=${quote.id}`)}>
                        Duzenle
                      </Button>
                    )}
                    {quote.mikroNumber && quote.status !== 'REJECTED' && (
                      <Button variant="primary" onClick={() => router.push(`/quotes/convert/${quote.id}`)}>
                        Siparise Cevir
                      </Button>
                    )}
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

                  {isExpanded && (
                    <>
                      {quote.adminNote && (
                        <div className="mt-4 bg-gray-50 border border-gray-200 rounded px-3 py-2">
                          <p className="text-xs font-medium text-gray-600">Admin Notu:</p>
                          <p className="text-sm text-gray-800 mt-1">{quote.adminNote}</p>
                        </div>
                      )}
                      {quote.createdBy && (
                        <div className="mt-2 text-xs text-gray-500">
                          Oluşturan: {quote.createdBy.name}
                        </div>
                      )}

                      {quote.customer && (
                        <div className="mt-4">
                          <h4 className="text-sm font-semibold text-gray-700 mb-3">Müşteri Bilgileri</h4>
                          <CustomerInfoCard customer={quote.customer} />
                        </div>
                      )}

                      <div className="border-t pt-4 mt-4">
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

                      <div className="pt-4 border-t border-gray-200" />
                    </>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
      <Modal
        isOpen={downloadPromptOpen}
        onClose={handleDownloadPromptClose}
        title="PDF İndir"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={handleDownloadPromptClose}
              disabled={downloadPromptLoading || downloadPromptRecommendedLoading}
            >
              Hayır
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadPromptConfirm}
              isLoading={downloadPromptLoading}
              disabled={downloadPromptRecommendedLoading}
            >
              PDF İndir
            </Button>
            <Button
              variant="primary"
              onClick={handleDownloadPromptRecommended}
              isLoading={downloadPromptRecommendedLoading}
              disabled={downloadPromptLoading}
            >
              Önerili PDF İndir
            </Button>
          </>
        }
      >
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100">
            <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="mt-4 text-gray-600">
            {downloadPromptQuote
              ? `${downloadPromptQuote.quoteNumber} numaralı teklifin PDF'ini indirmek ister misiniz?`
              : "Teklifin PDF'ini indirmek ister misiniz?"}
          </p>
        </div>
      </Modal>

      <Modal
        isOpen={historyOpen}
        onClose={handleHistoryClose}
        title={historyQuote ? `Teklif Gecmisi - ${historyQuote.quoteNumber}` : 'Teklif Gecmisi'}
        size="lg"
        footer={
          <Button variant="secondary" onClick={handleHistoryClose}>
            Kapat
          </Button>
        }
      >
        {historyLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          </div>
        ) : historyItems.length === 0 ? (
          <p className="text-sm text-gray-500">Kayit bulunamadi.</p>
        ) : (
          <div className="space-y-3">
            {historyItems.map((entry) => {
              const { summaryLines, changeLines } = buildHistoryDetails(entry);
              const actorName = entry.actor?.name || 'Sistem';
              const isExpanded = expandedHistoryEntries.has(entry.id);
              return (
                <div key={entry.id} className="rounded-lg border border-gray-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-gray-900">
                      {entry.summary || resolveHistoryLabel(entry.action)}
                    </div>
                    <Badge variant="outline">{resolveHistoryLabel(entry.action)}</Badge>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {formatDate(entry.createdAt)} - {actorName}
                  </div>
                  {summaryLines.length > 0 && (
                    <div className="text-xs text-gray-600 mt-2">{summaryLines.join(' - ')}</div>
                  )}
                  {changeLines.length > 0 && (
                    <div className="mt-2">
                      <button
                        type="button"
                        className="text-xs font-semibold text-primary-600 hover:text-primary-700"
                        onClick={() => toggleHistoryEntry(entry.id)}
                      >
                        {isExpanded ? 'Detayi Gizle' : 'Detayi Goster'}
                      </button>
                      {isExpanded && (
                        <ul className="mt-2 space-y-1 text-xs text-gray-600">
                          {changeLines.map((line, index) => (
                            <li key={`${entry.id}-change-${index}`}>- {line}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Modal>

    </div>
  );
}

export default function AdminQuotesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      }
    >
      <AdminQuotesPageContent />
    </Suspense>
  );
}
