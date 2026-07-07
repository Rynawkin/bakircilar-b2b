'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { Quote, QuoteHistory, QuoteStatus } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';
import { formatCurrency, formatDate, formatDateShort } from '@/lib/utils/format';
import { getApiErrorMessage } from '@/lib/utils/apiError';
import * as XLSX from 'xlsx';

// Re-export tipler (Classic/New JSX'lerin ihtiyaci icin)
export type { Quote, QuoteHistory, QuoteStatus } from '@/types';

export type QuoteStatusFilter = QuoteStatus | 'ALL';

export const DEFAULT_WHATSAPP_TEMPLATE =
  'Merhaba {{customerName}}, teklifiniz hazır. Teklif No: {{quoteNumber}}. Link: {{quoteLink}}. Geçerlilik: {{validUntil}}.';

export const normalizeTurkishText = (text: string) => {
  return text
    .replace(/Ã‡/g, 'Ç')
    .replace(/Ã§/g, 'ç')
    .replace(/Ä°/g, 'İ')
    .replace(/Ä±/g, 'ı')
    .replace(/Ã–/g, 'Ö')
    .replace(/Ã¶/g, 'ö')
    .replace(/Ãœ/g, 'Ü')
    .replace(/Ã¼/g, 'ü')
    .replace(/Ä/g, 'Ğ')
    .replace(/ÄŸ/g, 'ğ')
    .replace(/Å/g, 'Ş')
    .replace(/ÅŸ/g, 'ş');
};

export const getStatusBadge = (status: QuoteStatus) => {
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

export const buildWhatsappMessage = (template: string, quote: Quote, link: string, customerName: string) => {
  const safeTemplate = normalizeTurkishText(template || DEFAULT_WHATSAPP_TEMPLATE);
  const safeCustomerName = normalizeTurkishText(customerName || '');
  return safeTemplate
    .replace(/{{customerName}}/g, safeCustomerName)
    .replace(/{{quoteNumber}}/g, quote.quoteNumber)
    .replace(/{{quoteLink}}/g, link)
    .replace(/{{validUntil}}/g, formatDate(quote.validityDate));
};

export const cleanPdfText = (text: string | number | null | undefined) => {
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

export const TAB_PARAM_MAP: Record<string, QuoteStatusFilter> = {
  pending: 'PENDING_APPROVAL',
  sent: 'SENT_TO_MIKRO',
  rejected: 'REJECTED',
  accepted: 'CUSTOMER_ACCEPTED',
  all: 'ALL',
};

export const resolveTabFilter = (value: string | null): QuoteStatusFilter | null => {
  if (!value) return null;
  const key = value.toLowerCase();
  return TAB_PARAM_MAP[key] || null;
};

export const resolveTabParam = (value: QuoteStatusFilter): string => {
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

export const toFiniteNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatProfitPercent = (value?: number | null) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `%${value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const getProfitTone = (value?: number | null) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'text-gray-600';
  if (value < 0) return 'text-red-700';
  if (value < 5) return 'text-amber-700';
  return 'text-emerald-700';
};

export const calculateQuoteProfitSummary = (quote: Quote) => {
  return (quote.items || []).reduce(
    (acc, item) => {
      const quantity = Math.max(0, toFiniteNumber(item.quantity));
      const lineTotal = Math.max(0, toFiniteNumber(item.totalPrice) || quantity * toFiniteNumber(item.unitPrice));
      acc.salesTotal += lineTotal;

      if (item.isManualLine) {
        acc.manualLines += 1;
        return acc;
      }

      const entryCost = Math.max(0, toFiniteNumber(item.product?.lastEntryPrice));
      const currentCost = Math.max(0, toFiniteNumber(item.product?.currentCost));

      if (entryCost > 0) {
        acc.entrySalesTotal += lineTotal;
        acc.entryCostTotal += entryCost * quantity;
      } else {
        acc.entryMissingLines += 1;
      }

      if (currentCost > 0) {
        acc.currentSalesTotal += lineTotal;
        acc.currentCostTotal += currentCost * quantity;
      } else {
        acc.currentMissingLines += 1;
      }

      return acc;
    },
    {
      salesTotal: 0,
      entrySalesTotal: 0,
      currentSalesTotal: 0,
      entryCostTotal: 0,
      currentCostTotal: 0,
      entryMissingLines: 0,
      currentMissingLines: 0,
      manualLines: 0,
    }
  );
};

export const completeQuoteProfitSummary = (summary: ReturnType<typeof calculateQuoteProfitSummary>) => {
  const entryProfit = summary.entrySalesTotal - summary.entryCostTotal;
  const currentProfit = summary.currentSalesTotal - summary.currentCostTotal;
  return {
    ...summary,
    entryProfit,
    currentProfit,
    entryProfitPercent: summary.entryCostTotal > 0 ? (entryProfit / summary.entryCostTotal) * 100 : null,
    currentProfitPercent: summary.currentCostTotal > 0 ? (currentProfit / summary.currentCostTotal) * 100 : null,
  };
};

/**
 * Teklifler ekraninin TUM mantigi (state/ref/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 */
const QUOTES_PAGE_SIZE = 25;

export function useTeklifler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const { hasPermission } = usePermissions();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  // Yalnizca ilk yukleme icin tam-ekran spinner; sonraki sayfa/arama yuklemelerinde
  // liste-ici loading gosterilir (arama inputu odagi kaybolmasin).
  const [initialLoading, setInitialLoading] = useState(true);
  const [syncingQuoteId, setSyncingQuoteId] = useState<string | null>(null);
  const [markingCustomerPdfSentId, setMarkingCustomerPdfSentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<QuoteStatusFilter>('ALL');
  const [whatsappTemplate, setWhatsappTemplate] = useState(DEFAULT_WHATSAPP_TEMPLATE);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<{ total: number; page: number; pageSize: number; totalPages: number }>({
    total: 0,
    page: 1,
    pageSize: QUOTES_PAGE_SIZE,
    totalPages: 1,
  });
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
    fetchPreferences();
  }, []);

  // Arama icin 350ms debounce; debounce degisince sayfa 1'e doner.
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 350);
    return () => clearTimeout(handle);
  }, [searchTerm]);

  // Sekme veya arama degisince ilk sayfaya don.
  useEffect(() => {
    setPage(1);
  }, [activeTab, debouncedSearch]);

  // Sunucu-tarafli veri cekme: filtre/arama/sayfa degisince yeniden cek.
  useEffect(() => {
    fetchQuotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, debouncedSearch, page]);

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

  // DERIN LINK: ?download=<id> ile gelen teklif bu sayfada olmayabilir; tek basina cek.
  useEffect(() => {
    if (!pendingDownloadId) return;
    if (handledDownloadRef.current === pendingDownloadId) return;
    handledDownloadRef.current = pendingDownloadId;
    (async () => {
      const inList = quotes.find((quote) => quote.id === pendingDownloadId);
      let targetQuote = inList || null;
      if (!targetQuote) {
        try {
          const { quote } = await adminApi.getQuoteById(pendingDownloadId);
          targetQuote = quote || null;
        } catch (error) {
          console.error('Teklif (download) yuklenemedi:', error);
        }
      }
      if (!targetQuote) {
        handledDownloadRef.current = null;
        return;
      }
      setDownloadPromptQuote(targetQuote);
      setDownloadPromptOpen(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDownloadId]);

  // DERIN LINK: ?history=<id> ile gelen teklif bu sayfada olmayabilir; tek basina cek.
  useEffect(() => {
    if (!pendingHistoryId) return;
    if (handledHistoryRef.current === pendingHistoryId) return;
    handledHistoryRef.current = pendingHistoryId;
    (async () => {
      const inList = quotes.find((quote) => quote.id === pendingHistoryId);
      let targetQuote = inList || null;
      if (!targetQuote) {
        try {
          const { quote } = await adminApi.getQuoteById(pendingHistoryId);
          targetQuote = quote || null;
        } catch (error) {
          console.error('Teklif (history) yuklenemedi:', error);
        }
      }
      if (!targetQuote) {
        handledHistoryRef.current = null;
        return;
      }
      handleOpenHistory(targetQuote);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingHistoryId]);

  const fetchQuotes = async () => {
    setLoading(true);
    try {
      const { quotes: pageQuotes, pagination: meta } = await adminApi.getQuotes({
        status: activeTab,
        search: debouncedSearch || undefined,
        page,
        pageSize: QUOTES_PAGE_SIZE,
      });
      setQuotes(pageQuotes || []);
      if (meta) {
        setPagination(meta);
      } else {
        // Sunucu pagination donmezse: gelen sayfanin uzunlugundan turet (sahte toplam gosterme).
        setPagination({
          total: (pageQuotes || []).length,
          page,
          pageSize: QUOTES_PAGE_SIZE,
          totalPages: 1,
        });
      }
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  };

  const goPrev = () => {
    setPage((prev) => Math.max(1, prev - 1));
  };

  const goNext = () => {
    setPage((prev) => (prev < pagination.totalPages ? prev + 1 : prev));
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
      toast.error(getApiErrorMessage(error, 'Onaylama basarisiz'));
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
      toast.error(getApiErrorMessage(error, 'Reddetme basarisiz'));
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
          'Toplam Satılabilir',
          'Toplam Satilabilir',
          'Toplam SatÄ±labilir',
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
    const includeStockStatus = options?.includeStockStatus === true;
    const stockStatusMap = options?.stockStatusMap || {};
    const recommendedProducts = options?.recommendedProducts || [];

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const PAGE_W = doc.internal.pageSize.getWidth();
    const PAGE_H = doc.internal.pageSize.getHeight();
    const MX = 12; // sol/sag kenar bosluk
    const CW = PAGE_W - MX * 2; // icerik genisligi
    const BOTTOM_SAFE = PAGE_H - 40; // footer + sayfa isaretleri icin ayrilan alt alan
    const TOP_CONT = 26; // devam sayfalarinda ust devam basligi icin ayrilan alan

    // ---- Renkler (design tokens) ----
    const C = {
      navy: [21, 53, 107] as [number, number, number],
      navyDark: [16, 42, 85] as [number, number, number],
      blue: [31, 90, 168] as [number, number, number],
      cyan: [19, 153, 214] as [number, number, number],
      ink: [28, 40, 64] as [number, number, number],
      ink2: [22, 36, 61] as [number, number, number],
      muted: [93, 107, 132] as [number, number, number],
      soft: [63, 79, 107] as [number, number, number],
      faint: [147, 160, 181] as [number, number, number],
      faint2: [174, 184, 200] as [number, number, number],
      hair: [233, 237, 243] as [number, number, number],
      hair2: [238, 241, 246] as [number, number, number],
      panel: [246, 248, 251] as [number, number, number],
      panel2: [241, 245, 249] as [number, number, number],
      amberBg: [253, 249, 241] as [number, number, number],
      amberBorder: [240, 220, 192] as [number, number, number],
      amberInk: [185, 121, 31] as [number, number, number],
      amberSoft: [154, 123, 69] as [number, number, number],
      red: [180, 40, 59] as [number, number, number],
      green: [15, 122, 77] as [number, number, number],
      greenBg: [234, 244, 238] as [number, number, number],
      greenBorder: [207, 231, 216] as [number, number, number],
      white: [255, 255, 255] as [number, number, number],
    };

    // ---- Font gomme (tam Turkce: Hanken Grotesk + IBM Plex Mono) ----
    const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
      }
      return btoa(binary);
    };
    const tryAddFont = async (path: string, vfsName: string, family: string, style: string) => {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`font fetch failed: ${path}`);
      const b64 = arrayBufferToBase64(await res.arrayBuffer());
      doc.addFileToVFS(vfsName, b64);
      doc.addFont(vfsName, family, style);
    };
    let SANS = 'helvetica';
    let MONO = 'courier';
    try {
      await tryAddFont('/fonts/HankenGrotesk-Regular.ttf', 'HankenGrotesk-Regular.ttf', 'Hanken', 'normal');
      await tryAddFont('/fonts/HankenGrotesk-Bold.ttf', 'HankenGrotesk-Bold.ttf', 'Hanken', 'bold');
      await tryAddFont('/fonts/IBMPlexMono-Regular.ttf', 'IBMPlexMono-Regular.ttf', 'PlexMono', 'normal');
      SANS = 'Hanken';
      MONO = 'PlexMono';
    } catch (e) {
      console.error('PDF font gomulemedi, helvetica fallback:', e);
    }
    const embedded = SANS === 'Hanken';
    // Font gomulemezse Turkce karakterleri sadelestir (yalniz fallback durumunda)
    const T = (text: string | number | null | undefined): string => {
      const s = text === null || text === undefined ? '' : String(text);
      if (embedded) return s;
      return s
        .replace(/ı/g, 'i').replace(/İ/g, 'I')
        .replace(/ş/g, 's').replace(/Ş/g, 'S')
        .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
        .replace(/ç/g, 'c').replace(/Ç/g, 'C')
        .replace(/ö/g, 'o').replace(/Ö/g, 'O')
        .replace(/ü/g, 'u').replace(/Ü/g, 'U');
    };

    // ---- kisa yardimcilar ----
    const setFill = (c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
    const setDraw = (c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);
    const setText = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
    const font = (style: 'normal' | 'bold', size: number, color: [number, number, number]) => {
      doc.setFont(SANS, style);
      doc.setFontSize(size);
      setText(color);
    };
    const monoFont = (size: number, color: [number, number, number]) => {
      doc.setFont(MONO, 'normal');
      doc.setFontSize(size);
      setText(color);
    };

    const formatCurrencyTL = (value?: number | null) => {
      const amount = Number.isFinite(value) ? (value as number) : 0;
      return `${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
    };
    const formatNumber = (value?: number | null, frac = 2) => {
      const amount = Number.isFinite(value) ? (value as number) : 0;
      return amount.toLocaleString('tr-TR', { minimumFractionDigits: frac, maximumFractionDigits: frac });
    };
    const formatQty = (value?: number | null) => {
      const n = Number.isFinite(value) ? (value as number) : 0;
      return Number.isInteger(n) ? n.toLocaleString('tr-TR') : n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
    };
    const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const dateLong = (value?: string | Date | null) => {
      if (!value) return '-';
      const d = new Date(value);
      if (isNaN(d.getTime())) return '-';
      return `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    };
    const dateShort = (value?: string | Date | null) => {
      if (!value) return '-';
      const d = new Date(value);
      if (isNaN(d.getTime())) return '-';
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${dd}.${mm}.${d.getFullYear()}`;
    };
    const dayDiff = (a?: string | Date | null, b?: string | Date | null) => {
      if (!a || !b) return null;
      const da = new Date(a).getTime();
      const db = new Date(b).getTime();
      if (isNaN(da) || isNaN(db)) return null;
      return Math.round((db - da) / 86400000);
    };

    // ---- gorsel yardimcilari ----
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
      } catch {
        return null;
      }
    };
    const getImageFormat = (dataUrl: string) => (dataUrl.includes('image/png') ? 'PNG' : 'JPEG');
    const getImageDimensions = (dataUrl: string): Promise<{ width: number; height: number } | null> =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const width = img.naturalWidth || img.width;
          const height = img.naturalHeight || img.height;
          if (!width || !height) { resolve(null); return; }
          resolve({ width, height });
        };
        img.onerror = () => resolve(null);
        img.src = dataUrl;
      });
    const fitWithin = (w: number, h: number, maxW: number, maxH: number) => {
      if (!w || !h) return { width: maxW, height: maxH };
      const ratio = w / h;
      let fw = maxW;
      let fh = fw / ratio;
      if (fh > maxH) { fh = maxH; fw = fh * ratio; }
      return { width: fw, height: fh };
    };
    type Img = { data: string; format: 'PNG' | 'JPEG'; w: number; h: number } | null;
    const loadImg = async (path?: string | null): Promise<Img> => {
      const url = resolveImageUrl(path);
      if (!url) return null;
      const data = await loadImageData(url);
      if (!data) return null;
      const dim = await getImageDimensions(data);
      return { data, format: getImageFormat(data) as 'PNG' | 'JPEG', w: dim?.width || 1, h: dim?.height || 1 };
    };

    // ---- veri ----
    const items = quote.items || [];
    const companyName = quote.customer?.mikroName || quote.customer?.displayName || quote.customer?.name || '-';
    const contactName = quote.contactName || quote.customer?.displayName || quote.customer?.name || '-';
    const customerPhone = quote.contactPhone || quote.customer?.phone || '-';
    const customerEmail = quote.contactEmail || quote.customer?.email || '-';
    const createdByName = quote.createdBy?.name || '-';
    const createdByEmail = quote.createdBy?.email || '-';
    const createdByPhone = quote.createdBy?.phone || '-';
    const validityDays = dayDiff(quote.createdAt, quote.validityDate);
    const paymentLabel = quote.customer?.paymentPlanName || quote.customer?.paymentPlanCode || '-';
    const totalQty = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);

    // KDV kirilimi (kalem bazinda vatRate)
    const isWhole = (quote as any).vatZeroed === true;
    let subTotal = 0;
    const vatGroups = new Map<number, number>(); // rate(%) -> matrah
    items.forEach((it) => {
      const lineTotal = Number(it.totalPrice) || 0;
      subTotal += lineTotal;
      const rawRate = isWhole || (it as any).vatZeroed ? 0 : Number(it.vatRate) || 0;
      const pct = rawRate <= 1 ? Math.round(rawRate * 100) : Math.round(rawRate);
      vatGroups.set(pct, (vatGroups.get(pct) || 0) + lineTotal);
    });
    const vatLines = Array.from(vatGroups.entries())
      .filter(([pct]) => pct > 0)
      .map(([pct, matrah]) => ({ pct, matrah, kdv: matrah * (pct / 100) }))
      .sort((a, b) => b.pct - a.pct);
    const totalVat = vatLines.reduce((s, v) => s + v.kdv, 0);
    const grandTotal = subTotal + totalVat;

    // USD kuru
    let usdRate: number | null = null;
    try {
      const usdResult = await adminApi.getUsdSellingRate();
      const parsed = Number(usdResult?.rate);
      usdRate = Number.isFinite(parsed) ? parsed : null;
    } catch (e) {
      console.error('USD kur alinamadi:', e);
    }

    // Cari hesap durumu (vade senkronu: toplam bakiye + vadesi gecen)
    let cari: { total: number; pastDue: number } | null = null;
    try {
      const cariCode = quote.customer?.mikroCariCode || '';
      const search = cariCode || companyName;
      if (search && search !== '-') {
        const res = await adminApi.getVadeBalances({ search, limit: 20 });
        const list = res?.balances || [];
        const match =
          list.find((b: any) => b.user?.id && quote.customer?.id && b.user.id === quote.customer.id) ||
          list.find((b: any) => cariCode && b.user?.mikroCariCode === cariCode) ||
          (list.length === 1 ? list[0] : null);
        if (match) cari = { total: Number(match.totalBalance) || 0, pastDue: Number(match.pastDueBalance) || 0 };
      }
    } catch (e) {
      console.error('Cari bakiye alinamadi:', e);
    }

    // Gorseller (logo, maskotlar, kalem gorselleri, oneri gorselleri)
    const [logo, mascotPoint, mascotThumb] = await Promise.all([
      loadImg('/quote-logo.png'),
      loadImg('/bakir-point.png'),
      loadImg('/bakir-thumb.png'),
    ]);
    const itemImages: Img[] = await Promise.all(
      items.map((it) => loadImg((it as any).manualImageUrl || (it as any).product?.imageUrl || null))
    );

    // ================= CIZIM =================
    const IBANS = [
      { bank: 'Ziraat Bankası', branch: 'Hendek', iban: 'TR42 0001 0000 2053 9031 7150 01' },
      { bank: 'Yapı Kredi', branch: 'Erenler', iban: 'TR90 0006 7010 0000 0083 9998 96' },
    ];
    const COMPANY = {
      name: 'BAKIRCILAR AMBALAJ END. - TEM VE KIRTASİYE',
      l1: 'Merkez: Rasimpaşa Mah. Atatürk Blv. No:69/A Hendek / Sakarya',
      l2: 'Şube: Topça Toptancılar Çarşısı A Blok No:20 - Erenler / Sakarya',
      l3: 'Tel: 0264 614 67 77 · Faks: 0264 614 66 60 · info@bakircilarambalaj.com · www.bakircilargrup.com',
      payName: 'Bakırcılar Ambalaj End. Tem. ve Kırt.',
    };

    const drawImageBox = (img: Img, x: number, y: number, boxW: number, boxH: number, radius: number) => {
      setFill(C.panel2);
      doc.roundedRect(x, y, boxW, boxH, radius, radius, 'F');
      if (img) {
        const pad = 1.5;
        const fit = fitWithin(img.w, img.h, boxW - pad * 2, boxH - pad * 2);
        doc.addImage(img.data, img.format, x + (boxW - fit.width) / 2, y + (boxH - fit.height) / 2, fit.width, fit.height);
      }
    };

    // sayfa arka plani: filigran + sol serit (her sayfada)
    const drawBackground = () => {
      // filigran
      if (logo) {
        try {
          (doc as any).saveGraphicsState?.();
          (doc as any).setGState?.(new (doc as any).GState({ opacity: 0.05 }));
          const wmW = 150;
          const wmH = (logo.h / logo.w) * wmW;
          doc.addImage(logo.data, logo.format, (PAGE_W - wmW) / 2, (PAGE_H - wmH) / 2, wmW, wmH);
          (doc as any).restoreGraphicsState?.();
        } catch { /* opacity desteklenmiyorsa filigrani atla */ }
      }
      // sol dikey serit (navy -> cyan gradyan, bantlarla)
      const bands = 60;
      for (let i = 0; i < bands; i++) {
        const t = i / (bands - 1);
        const r = Math.round(C.navy[0] + (C.cyan[0] - C.navy[0]) * t);
        const g = Math.round(C.navy[1] + (C.cyan[1] - C.navy[1]) * t);
        const b = Math.round(C.navy[2] + (C.cyan[2] - C.navy[2]) * t);
        doc.setFillColor(r, g, b);
        doc.rect(0, (PAGE_H / bands) * i, 2, PAGE_H / bands + 0.3, 'F');
      }
    };

    let pageIndex = 0;
    let y = 0;

    const newPage = () => {
      doc.addPage();
      pageIndex += 1;
      drawBackground();
      y = TOP_CONT; // devam basligi 2. gecişte cizilecek
    };
    const ensureSpace = (h: number) => {
      if (y + h > BOTTOM_SAFE) newPage();
    };

    // ---- SAYFA 1: arka plan + masthead ----
    drawBackground();

    // masthead (navy gradyan)
    const mastH = 30;
    // gradyan bantlari (yatay 120deg yaklasimi -> soldan saga navyDark->blue)
    const segs = 40;
    for (let i = 0; i < segs; i++) {
      const t = i / (segs - 1);
      const r = Math.round(C.navyDark[0] + (C.blue[0] - C.navyDark[0]) * t);
      const g = Math.round(C.navyDark[1] + (C.blue[1] - C.navyDark[1]) * t);
      const b = Math.round(C.navyDark[2] + (C.blue[2] - C.navyDark[2]) * t);
      doc.setFillColor(r, g, b);
      doc.rect((PAGE_W / segs) * i, 0, PAGE_W / segs + 0.3, mastH, 'F');
    }
    // beyaz logo cipi
    if (logo) {
      const chipH = 16;
      const logoW = 40;
      const logoH = (logo.h / logo.w) * logoW;
      const chipW = logoW + 10;
      const chipX = MX;
      const chipY = (mastH - chipH) / 2;
      setFill(C.white);
      doc.roundedRect(chipX, chipY, chipW, chipH, 2.5, 2.5, 'F');
      doc.addImage(logo.data, logo.format, chipX + 5, chipY + (chipH - logoH) / 2, logoW, logoH);
    }
    font('bold', 17, C.white);
    doc.text('FİYAT TEKLİFİ', PAGE_W - MX, 13, { align: 'right' });
    monoFont(9.5, [170, 195, 230]);
    doc.text(`${quote.quoteNumber || '-'}${quote.documentNo ? ' · ' + quote.documentNo : ''}`, PAGE_W - MX, 19.5, { align: 'right' });

    // ---- hizli bilgiler seridi ----
    const factsY = mastH;
    const factsH = 14;
    setFill(C.panel);
    doc.rect(0, factsY, PAGE_W, factsH, 'F');
    setDraw(C.hair);
    doc.line(0, factsY + factsH, PAGE_W, factsY + factsH);
    const facts: Array<[string, string]> = [
      ['TEKLİF TARİHİ', dateLong(quote.createdAt)],
      ['GEÇERLİLİK', `${dateShort(quote.validityDate)}${validityDays != null ? ' · ' + validityDays + ' gün' : ''}`],
      ['VADE', paymentLabel],
      ['KAPSAM', `${items.length} kalem · ${formatQty(totalQty)} adet`],
    ];
    {
      const colW = CW / facts.length;
      facts.forEach((f, i) => {
        const fx = MX + colW * i;
        font('bold', 7, C.faint);
        doc.text(f[0], fx, factsY + 5.5);
        font('bold', 9.5, C.ink2);
        doc.text(T(f[1]), fx, factsY + 10.5);
        if (i > 0) { setDraw([225, 231, 240]); doc.line(fx - 3, factsY + 3, fx - 3, factsY + 11); }
      });
    }

    // ---- taraflar ----
    y = factsY + factsH + 8;
    const halfW = CW / 2;
    font('bold', 8, C.navy);
    doc.text('MÜŞTERİ', MX, y);
    doc.text('HAZIRLAYAN', MX + halfW + 6, y);
    setDraw(C.hair2);
    doc.line(MX + halfW, y - 4, MX + halfW, y + 16);
    y += 6;
    font('bold', 12, C.ink2);
    doc.text(T(companyName), MX, y, { maxWidth: halfW - 8 });
    doc.text(T(createdByName), MX + halfW + 6, y, { maxWidth: halfW - 8 });
    y += 5.5;
    font('normal', 9, C.muted);
    doc.text(T(`İlgili: ${contactName}`), MX, y, { maxWidth: halfW - 8 });
    doc.text(T('Bakırcılar Ambalaj · Satış'), MX + halfW + 6, y, { maxWidth: halfW - 8 });
    y += 4.5;
    doc.text(T(`${customerPhone} · ${customerEmail}`), MX, y, { maxWidth: halfW - 8 });
    doc.text(T(`${createdByPhone} · ${createdByEmail}`), MX + halfW + 6, y, { maxWidth: halfW - 8 });
    y += 8;

    // ---- urun tablosu (manuel, otomatik sayfalama) ----
    // kolonlar (mm): # / urun / gorsel / miktar / birim fiyat / toplam
    const col = {
      no: MX,
      noW: 8,
      name: MX + 8,
      nameW: 70,
      img: MX + 78,
      imgW: 20,
      qty: MX + 98,
      qtyW: 26,
      price: MX + 124,
      priceW: 28,
      total: MX + 152,
      totalW: 34,
    };
    const drawTableHeader = (continued: boolean) => {
      font('bold', 7.5, C.navy);
      doc.text('#', col.no + col.noW / 2, y, { align: 'center' });
      doc.text(continued ? T('ÜRÜN (DEVAM)') : 'ÜRÜN', col.name, y);
      doc.text('GÖRSEL', col.img + col.imgW / 2, y, { align: 'center' });
      doc.text('MİKTAR', col.qty + col.qtyW, y, { align: 'right' });
      doc.text('BİRİM FİYAT', col.price + col.priceW, y, { align: 'right' });
      doc.text('TOPLAM', col.total + col.totalW, y, { align: 'right' });
      y += 2.5;
      setDraw(C.navy);
      doc.setLineWidth(0.6);
      doc.line(MX, y, MX + CW, y);
      doc.setLineWidth(0.2);
      y += 4.5;
    };
    drawTableHeader(false);

    items.forEach((it, idx) => {
      const img = itemImages[idx];
      const nameStr = T(it.productName || (it as any).product?.name || '-');
      const codeBits: string[] = [];
      if (it.productCode) codeBits.push(String(it.productCode));
      const lineDesc = (it as any).lineDescription;
      if (lineDesc) codeBits.push(String(lineDesc));
      if (includeStockStatus) {
        const st = stockStatusMap[String(it.productCode || '')];
        if (st) codeBits.push(st);
      }
      font('normal', 11, C.ink2);
      const nameLines = doc.splitTextToSize(nameStr, col.nameW) as string[];
      const nameBlockH = nameLines.length * 4.2 + (codeBits.length ? 3.4 : 0);
      const rowH = Math.max(nameBlockH + 5, 20);
      ensureSpace(rowH);
      if (y === TOP_CONT) drawTableHeader(true); // yeni sayfada baslik

      const rowTop = y;
      const midY = rowTop + rowH / 2;
      // #
      monoFont(10, C.faint2);
      doc.text(String(idx + 1), col.no + col.noW / 2, midY + 1, { align: 'center' });
      // urun adi + kod
      font('bold', 11, C.ink2);
      let ny = rowTop + (rowH - nameBlockH) / 2 + 3.2;
      nameLines.forEach((ln) => { doc.text(ln, col.name, ny); ny += 4.2; });
      if (codeBits.length) {
        monoFont(8, C.faint);
        doc.text(T(codeBits.join(' · ')), col.name, ny, { maxWidth: col.nameW });
      }
      // gorsel
      drawImageBox(img, col.img + (col.imgW - 16) / 2, midY - 8, 16, 16, 2.2);
      // miktar (+birim)
      font('normal', 10.5, C.soft);
      const qtyStr = formatQty(it.quantity);
      doc.text(qtyStr, col.qty + col.qtyW, midY + 1, { align: 'right' });
      const unitStr = T(it.unit || (it as any).product?.unit || '');
      if (unitStr) {
        const qtyW = doc.getTextWidth(qtyStr);
        font('normal', 8.5, C.faint);
        doc.text(unitStr, col.qty + col.qtyW - qtyW - 1.5, midY + 1, { align: 'right' });
      }
      // birim fiyat
      font('normal', 10.5, C.ink2);
      doc.text(formatNumber(it.unitPrice), col.price + col.priceW, midY + 1, { align: 'right' });
      // toplam
      font('bold', 10.5, C.ink2);
      doc.text(formatNumber(it.totalPrice), col.total + col.totalW, midY + 1, { align: 'right' });
      // satir ayraci
      setDraw(C.hair2);
      doc.line(MX, rowTop + rowH, MX + CW, rowTop + rowH);
      y = rowTop + rowH;
    });
    if (items.length === 0) {
      font('normal', 10, C.muted);
      ensureSpace(12);
      doc.text(T('Teklifte ürün bulunmuyor.'), MX, y + 6);
      y += 12;
    }
    y += 8;

    // ---- sartlar + toplamlar ----
    const totalsW = 76;
    const termsW = CW - totalsW - 8;
    const totalsX = MX + termsW + 8;
    // toplamlar kutusu yuksekligi
    const totalsRows = 1 + Math.max(vatLines.length, 1);
    const totalsBoxH = 14 + totalsRows * 6 + 14;
    ensureSpace(totalsBoxH + 4);
    const blockTop = y;
    // sartlar (sol)
    font('bold', 8, C.navy);
    doc.text('TEKLİF ŞARTLARI', MX, blockTop + 2);
    font('normal', 9, C.muted);
    const usdText = usdRate ? ` (USD satış kuru: ${formatNumber(usdRate, 4)})` : '';
    const termsStr = T(
      `Fiyatlarımıza KDV dahil değildir. Dövizli işlemlerde TCMB USD satış kuru baz alınır${usdText}. ` +
      `Teklif ${validityDays != null ? validityDays + ' gün' : ''} geçerlidir; ödeme ${paymentLabel} planına tabidir.`
    );
    const termsLines = doc.splitTextToSize(termsStr, termsW) as string[];
    let ty = blockTop + 8;
    termsLines.forEach((ln) => { doc.text(ln, MX, ty); ty += 4.6; });
    // toplamlar (sag, panel)
    setFill(C.panel);
    setDraw(C.hair);
    doc.roundedRect(totalsX, blockTop, totalsW, totalsBoxH, 3, 3, 'FD');
    let sy = blockTop + 7;
    const totalRow = (label: string, value: string, sub?: string) => {
      font('normal', 9, C.muted);
      doc.text(T(label), totalsX + 4, sy);
      if (sub) {
        const lw = doc.getTextWidth(T(label));
        font('normal', 7, C.faint2);
        doc.text(T(sub), totalsX + 4 + lw + 2, sy);
      }
      font('bold', 9, C.ink2);
      doc.text(value, totalsX + totalsW - 4, sy, { align: 'right' });
      sy += 6;
    };
    totalRow('Ara Toplam', formatCurrencyTL(subTotal));
    if (vatLines.length === 0) {
      totalRow('KDV', formatCurrencyTL(0));
    } else {
      vatLines.forEach((v) => totalRow(`KDV %${v.pct}`, formatCurrencyTL(v.kdv), `· Matrah ${formatNumber(v.matrah)}`));
    }
    sy += 1;
    setDraw(C.hair);
    doc.line(totalsX + 4, sy - 3, totalsX + totalsW - 4, sy - 3);
    font('bold', 9, C.navy);
    doc.text('GENEL TOPLAM', totalsX + 4, sy + 4);
    font('bold', 15, C.navy);
    doc.text(formatCurrencyTL(grandTotal), totalsX + totalsW - 4, sy + 4.5, { align: 'right' });
    y = Math.max(ty, blockTop + totalsBoxH) + 8;

    // ---- cari hesap durumu + odeme bilgileri ----
    const showCari = !!(cari && cari.pastDue > 0);
    const payH = 8 + IBANS.length * 9 + 4;
    const cariH = showCari ? 34 : 0;
    const rowH2 = Math.max(payH, cariH);
    ensureSpace(rowH2 + 4);
    const r2Top = y;
    const colGap = 8;
    const c2W = (CW - colGap) / 2;
    if (showCari) {
      setFill(C.amberBg);
      setDraw(C.amberBorder);
      doc.roundedRect(MX, r2Top, c2W, rowH2, 3, 3, 'FD');
      font('bold', 8, C.amberInk);
      doc.text('CARİ HESAP DURUMU', MX + 5, r2Top + 6);
      font('normal', 8, C.faint);
      doc.text('Toplam Bakiye', MX + 5, r2Top + 14);
      font('bold', 14, C.ink2);
      doc.text(formatCurrencyTL(cari!.total), MX + 5, r2Top + 21);
      font('bold', 8, C.red);
      doc.text('Vadesi Geçen', MX + c2W / 2 + 4, r2Top + 14);
      font('bold', 14, C.red);
      doc.text(formatCurrencyTL(cari!.pastDue), MX + c2W / 2 + 4, r2Top + 21);
      font('normal', 8, C.amberSoft);
      doc.text(T('Vadesi geçen bakiyeniz bulunmaktadır; en kısa sürede ödenmesini rica ederiz.'), MX + 5, r2Top + 28, { maxWidth: c2W - 10 });
    }
    // odeme bilgileri (cari yoksa tam genislik)
    const payX = showCari ? MX + c2W + colGap : MX;
    const payW = showCari ? c2W : CW;
    setFill(C.panel);
    setDraw(C.hair);
    doc.roundedRect(payX, r2Top, payW, rowH2, 3, 3, 'FD');
    font('bold', 8, C.navy);
    doc.text('ÖDEME BİLGİLERİ', payX + 5, r2Top + 6);
    font('normal', 8, C.faint);
    doc.text(T(`Hesap: ${COMPANY.payName}`), payX + 5, r2Top + 11.5);
    let py = r2Top + 16;
    IBANS.forEach((b) => {
      setDraw(C.hair);
      doc.line(payX + 5, py - 2.5, payX + payW - 5, py - 2.5);
      font('bold', 9, C.ink2);
      doc.text(T(`${b.bank} · ${b.branch}`), payX + 5, py + 1.5);
      monoFont(8.5, C.soft);
      doc.text(b.iban, payX + 5, py + 6);
      py += 9;
    });
    y = r2Top + rowH2 + 8;

    // ---- tamamlayici urunler ----
    if (recommendedProducts.length > 0) {
      const recImgs = await Promise.all(recommendedProducts.slice(0, 8).map((p) => loadImg(p.imageUrl || null)));
      const recs = recommendedProducts.slice(0, 8);
      ensureSpace(14);
      font('bold', 11, C.ink2);
      doc.text(T('Tamamlayıcı Ürünler'), MX, y);
      const titleW = doc.getTextWidth(T('Tamamlayıcı Ürünler'));
      font('normal', 8.5, C.faint);
      doc.text(T('Siparişinizle birlikte sıkça tercih edilenler'), MX + titleW + 3, y);
      y += 5;
      const cardGap = 6;
      const cardW = (CW - cardGap) / 2;
      const cardH = 16;
      for (let i = 0; i < recs.length; i += 2) {
        ensureSpace(cardH + 3);
        for (let j = 0; j < 2; j++) {
          const p = recs[i + j];
          if (!p) continue;
          const cx = MX + (cardW + cardGap) * j;
          setFill(C.white);
          setDraw([230, 236, 243]);
          doc.roundedRect(cx, y, cardW, cardH, 2.5, 2.5, 'FD');
          drawImageBox(recImgs[i + j], cx + 3, y + 2.5, 11, 11, 2);
          font('bold', 9.5, C.ink2);
          const pn = doc.splitTextToSize(T(p.name || '-'), cardW - 20) as string[];
          doc.text(pn[0] || '-', cx + 17, y + 7);
          monoFont(7.5, C.faint);
          doc.text(T(p.mikroCode || ''), cx + 17, y + 11.5);
        }
        y += cardH + 3;
      }
      y += 4;
    }

    // ---- tesekkur + imza/onay ----
    ensureSpace(34);
    font('normal', 9.5, C.muted);
    doc.text(T('Teklifimizi değerlendirdiğiniz için teşekkür ederiz.'), MX, y);
    y += 6;
    const sigGap = 8;
    const sigW = (CW - sigGap) / 2;
    const sigH = 22;
    const drawSig = (x: number, label: string, value: string) => {
      setDraw(C.hair);
      doc.roundedRect(x, y, sigW, sigH, 2.5, 2.5, 'D');
      font('bold', 7.5, C.faint);
      doc.text(T(label), x + 5, y + 6);
      font('bold', 9.5, C.ink2);
      doc.text(T(value), x + 5, y + sigH - 5, { maxWidth: sigW - 10 });
    };
    drawSig(MX, 'TEKLİFİ VEREN', `${createdByName} · Bakırcılar Ambalaj`);
    drawSig(MX + sigW + sigGap, 'ONAYLAYAN · KAŞE & İMZA', companyName);
    y += sigH + 6;

    // ---- teklif sonu (son sayfada, akis ici) ----
    ensureSpace(28);
    {
      const badgeW = 42;
      const badgeH = 11;
      const bx = (PAGE_W - badgeW) / 2;
      let mascotShift = 0;
      if (mascotThumb) {
        const mh = 24;
        const mw = (mascotThumb.w / mascotThumb.h) * mh;
        doc.addImage(mascotThumb.data, mascotThumb.format, bx - mw - 4, y, mw, mh);
        mascotShift = 0;
      }
      setFill(C.greenBg);
      setDraw(C.greenBorder);
      doc.roundedRect(bx + mascotShift, y + 4, badgeW, badgeH, 3, 3, 'FD');
      font('bold', 11, C.green);
      doc.text(T('✓ Teklif Sonu'), bx + mascotShift + badgeW / 2, y + 11.2, { align: 'center' });
      y += 30;
    }

    // ================= 2. GECİS: footer + sayfa isaretleri + devam basligi =================
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      const isLast = p === totalPages;

      // devam sayfasi ust basligi (sayfa >= 2)
      if (p >= 2) {
        if (logo) {
          const lw = 28;
          const lh = (logo.h / logo.w) * lw;
          doc.addImage(logo.data, logo.format, MX, 9, lw, lh);
        }
        font('normal', 8.5, C.faint);
        doc.text(T('Fiyat Teklifi · '), MX + 30, 13.5);
        const pre = doc.getTextWidth(T('Fiyat Teklifi · '));
        monoFont(8.5, C.soft);
        doc.text(quote.quoteNumber || '-', MX + 30 + pre, 13.5);
        font('bold', 8.5, C.navy);
        doc.text(T(`Önceki sayfadan devam · Sayfa ${p} / ${totalPages}`), PAGE_W - MX, 13.5, { align: 'right' });
        setDraw(C.hair);
        doc.line(MX, 17, PAGE_W - MX, 17);
      }

      // "Devami var" seridi (son sayfa haric)
      if (!isLast) {
        const stripH = 13;
        const stripY = PAGE_H - 38;
        // gradyan serit
        const sg = 30;
        for (let i = 0; i < sg; i++) {
          const t = i / (sg - 1);
          const r = Math.round(C.navy[0] + (C.blue[0] - C.navy[0]) * t);
          const g = Math.round(C.navy[1] + (C.blue[1] - C.navy[1]) * t);
          const b = Math.round(C.navy[2] + (C.blue[2] - C.navy[2]) * t);
          doc.setFillColor(r, g, b);
          doc.rect(MX + ((CW) / sg) * i, stripY, CW / sg + 0.3, stripH, 'F');
        }
        // kose yuvarlatma izlenimi icin ince ust/alt
        font('bold', 10.5, C.white);
        doc.text(T('Devamı var'), MX + 6, stripY + 6);
        font('normal', 8, [188, 210, 239]);
        doc.text(T('Teklif sonraki sayfada devam ediyor'), MX + 6, stripY + 10.5);
        monoFont(9, [207, 224, 245]);
        doc.text(`Sayfa ${p} / ${totalPages}`, MX + CW - 4, stripY + 8, { align: 'right' });
        // maskot (asagi gosteren)
        if (mascotPoint) {
          const mh = 22;
          const mw = (mascotPoint.w / mascotPoint.h) * mh;
          doc.addImage(mascotPoint.data, mascotPoint.format, MX + CW - 44, stripY - mh + stripH, mw, mh);
        }
      }

      // footer bandi (her sayfa, en altta)
      const fY = PAGE_H - 20;
      setFill(C.navy);
      doc.rect(0, fY, PAGE_W, 20, 'F');
      font('bold', 8, C.white);
      doc.text(T(COMPANY.name), PAGE_W / 2, fY + 5.5, { align: 'center' });
      font('normal', 6.6, [205, 221, 242]);
      doc.text(T(`${COMPANY.l1} · ${COMPANY.l2}`), PAGE_W / 2, fY + 10.5, { align: 'center' });
      doc.text(T(COMPANY.l3), PAGE_W / 2, fY + 15, { align: 'center' });
    }

    const fileName = `${quote.quoteNumber}_${T(companyName || 'Teklif').replace(/[^\w.-]+/g, '_')}.pdf`;
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
    if (payload.customerPdfSentAt) summaryLines.push(`PDF gonderim: ${formatDate(payload.customerPdfSentAt)}`);
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
      toast.error(getApiErrorMessage(error, 'Mikro guncelleme basarisiz'));
    } finally {
      setSyncingQuoteId(null);
    }
  };

  const handleMarkCustomerPdfSent = async (quoteId: string) => {
    setMarkingCustomerPdfSentId(quoteId);
    try {
      const { quote: updatedQuote } = await adminApi.markQuoteCustomerPdfSent(quoteId);
      setQuotes((prev) => prev.map((quote) => (quote.id === quoteId ? updatedQuote : quote)));
      toast.success("PDF musteriye gonderildi olarak isaretlendi.");
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'PDF gonderim bilgisi kaydedilemedi'));
    } finally {
      setMarkingCustomerPdfSentId(null);
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

  // Sekme bazli toplam sayim artik sunucuda yok. Sahte sayi gostermemek icin
  // sadece AKTIF sekmenin toplamini (pagination.total) veriyoruz; digerleri null
  // (UI bos/gizli birakir, 0 yazmaz).
  const counts: Record<'pending' | 'sent' | 'rejected' | 'accepted' | 'all', number | null> = {
    pending: activeTab === 'PENDING_APPROVAL' ? pagination.total : null,
    sent: activeTab === 'SENT_TO_MIKRO' ? pagination.total : null,
    rejected: activeTab === 'REJECTED' ? pagination.total : null,
    accepted: activeTab === 'CUSTOMER_ACCEPTED' ? pagination.total : null,
    all: activeTab === 'ALL' ? pagination.total : null,
  };

  // Liste artik sunucu sayfasidir; client-side yeniden filtreleme YAPMA.
  // (Eski filteredQuotes useMemo'su no-op'a indirildi; cift-filtre ile sonuc gizlenmez.)
  const filteredQuotes = quotes;

  const isAdmin = hasPermission('admin:quotes');

  return {
    // router / user / permissions
    router,
    user,
    hasPermission,
    isAdmin,
    // veri / liste
    quotes,
    loading,
    initialLoading,
    filteredQuotes,
    counts,
    // sunucu-tarafli sayfalama
    page,
    setPage,
    goPrev,
    goNext,
    pagination,
    // tab
    activeTab,
    handleTabChange,
    // arama
    searchTerm,
    setSearchTerm,
    // detay genisletme
    expandedQuotes,
    toggleExpanded,
    // whatsapp sablonu
    whatsappTemplate,
    // satir-aksiyon loading state'leri
    syncingQuoteId,
    markingCustomerPdfSentId,
    stockPdfLoadingId,
    recommendedPdfLoadingId,
    // handler'lar
    handleApprove,
    handleReject,
    handleWhatsappShare,
    handlePdfExport,
    handleStockPdfExport,
    handleRecommendedPdfExport,
    handleExcelExport,
    handleSync,
    handleMarkCustomerPdfSent,
    handleOpenHistory,
    // PDF indir prompt modal
    downloadPromptQuote,
    downloadPromptOpen,
    downloadPromptLoading,
    downloadPromptRecommendedLoading,
    handleDownloadPromptClose,
    handleDownloadPromptConfirm,
    handleDownloadPromptRecommended,
    // gecmis modal
    historyOpen,
    historyLoading,
    historyQuote,
    historyItems,
    expandedHistoryEntries,
    handleHistoryClose,
    toggleHistoryEntry,
    resolveHistoryLabel,
    buildHistoryDetails,
    // turetilmis yardimcilar
    getConversionBadge,
  };
}

export default useTeklifler;
