'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { PendingOrderForAdmin } from '@/types';
import adminApi from '@/lib/api/admin';
import { formatCurrency, formatDate, formatDateShort } from '@/lib/utils/format';
import { normalizeSearchText } from '@/lib/utils/search';
import * as XLSX from 'xlsx';

// Re-export tipler (Classic/New JSX'lerin ihtiyaci icin)
export type { PendingOrderForAdmin } from '@/types';

export type OrderStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
export type OrderSource = 'ALL' | 'CUSTOMER' | 'B2B';

/**
 * Siparisler ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir.
 */
export function useSiparisler() {
  const router = useRouter();
  const [orders, setOrders] = useState<PendingOrderForAdmin[]>([]);
  const [allOrders, setAllOrders] = useState<PendingOrderForAdmin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<OrderStatus>('PENDING');
  const [sourceTab, setSourceTab] = useState<OrderSource>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  // 3.9: Coklu secim ve toplu onay/red icin secili siparis id'leri
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, []);

  // 3.9: Sik kullanilan evrak serileri localStorage'da hatirlanir; onay diyaloglarinda otomatik doldurulur.
  const INVOICED_SERIES_KEY = 'orders.lastInvoicedSeries';
  const WHITE_SERIES_KEY = 'orders.lastWhiteSeries';

  const readStoredSeries = (key: string, fallback: string) => {
    if (typeof window === 'undefined') return fallback;
    try {
      const stored = window.localStorage.getItem(key);
      return stored && stored.trim() ? stored : fallback;
    } catch {
      return fallback;
    }
  };

  const writeStoredSeries = (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    try {
      const trimmed = value.trim();
      if (trimmed) window.localStorage.setItem(key, trimmed);
    } catch {
      // localStorage erisimi yoksa sessizce gec
    }
  };

  const isCustomerOrder = (order: PendingOrderForAdmin) => {
    return Boolean(order.customerRequest) || (!order.requestedBy && !order.sourceQuote);
  };

  useEffect(() => {
    let filtered = allOrders;
    if (activeTab !== 'ALL') {
      filtered = filtered.filter(order => order.status === activeTab);
    }
    if (sourceTab === 'CUSTOMER') {
      filtered = filtered.filter(isCustomerOrder);
    } else if (sourceTab === 'B2B') {
      filtered = filtered.filter(order => !isCustomerOrder(order));
    }
    setOrders(filtered);
  }, [activeTab, sourceTab, allOrders]);

  const fetchOrders = async () => {
    try {
      const { orders } = await adminApi.getAllOrders();
      setAllOrders(orders);
      // Initial display is pending orders
      setOrders(orders.filter(order => order.status === 'PENDING'));
    } finally {
      setIsLoading(false);
    }
  };

  const filteredOrders = useMemo(() => {
    const normalizedTerm = normalizeSearchText(searchTerm);
    if (!normalizedTerm) return orders;

    return orders.filter((order) => {
      const customerName =
        order.user?.displayName ||
        order.user?.mikroName ||
        order.user?.name ||
        '';
      const creatorName =
        order.requestedBy?.name ||
        order.customerRequest?.requestedBy?.name ||
        '';
      const orderItemSearchText = (order.items || [])
        .map((item) => `${item.mikroCode || ''} ${item.productName || ''} ${item.lineNote || ''}`)
        .join(' ');

      const haystack = [
        order.orderNumber,
        order.customerOrderNumber,
        order.user?.mikroCariCode,
        customerName,
        creatorName,
        order.adminNote,
        order.deliveryLocation,
        order.sourceQuote?.quoteNumber,
        order.mikroOrderIds?.join(' '),
        orderItemSearchText,
      ]
        .filter(Boolean)
        .join(' ');

      return normalizeSearchText(haystack).includes(normalizedTerm);
    });
  }, [orders, searchTerm]);

  const toggleExpanded = (orderId: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const goToEdit = (order: PendingOrderForAdmin) => {
    router.push(`/quotes/new?mode=order&orderId=${encodeURIComponent(order.id)}`);
  };

  // 3.7: Onayli (APPROVED) siparis duzenlemesi gercek Mikro siparisini guncelledigi icin
  // duzenlemeye gecmeden once acik bir onay diyalogu goster. Bekleyen (PENDING) siparislerde
  // bu uyari cikmaz, dogrudan duzenlemeye gecilir.
  const openEdit = (order: PendingOrderForAdmin) => {
    if (order.status !== 'APPROVED') {
      goToEdit(order);
      return;
    }

    toast((t) => (
      <div className="flex flex-col gap-3 min-w-[320px]">
        <p className="font-semibold text-amber-700">Onayli siparis duzenleniyor</p>
        <p className="text-sm text-gray-700">
          Bu degisiklik Mikro&apos;daki gercek siparisi guncelleyecektir. Devam edilsin mi?
        </p>
        <div className="flex gap-2 justify-end pt-1">
          <button
            className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
            onClick={() => toast.dismiss(t.id)}
          >
            Vazgec
          </button>
          <button
            className="px-3 py-1 text-sm bg-amber-600 text-white rounded hover:bg-amber-700"
            onClick={() => {
              toast.dismiss(t.id);
              goToEdit(order);
            }}
          >
            Devam Et
          </button>
        </div>
      </div>
    ), {
      duration: Infinity,
    });
  };


  const cleanPdfText = (text: string | number | null | undefined) => {
    const value = String(text ?? '');
    return value
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

  const calculateOrderTotals = (order: PendingOrderForAdmin) => {
    const subtotal = (order.items || []).reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0);
    const totalVat = (order.items || []).reduce((sum, item) => {
      if (item.priceType !== 'INVOICED') return sum;
      const rawVatRate = Number((item as any)?.product?.vatRate);
      const vatRate = Number.isFinite(rawVatRate) && rawVatRate > 0 ? rawVatRate : 0.2;
      return sum + (Number(item.totalPrice) || 0) * vatRate;
    }, 0);
    const totalWithVat = subtotal + totalVat;
    return { subtotal, totalVat, totalWithVat };
  };

  const buildOrderPdf = async (order: PendingOrderForAdmin) => {
    const { default: jsPDF } = await import('jspdf');
    const autoTableModule = await import('jspdf-autotable');
    const autoTable = (autoTableModule as any).default || (autoTableModule as any).autoTable;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 14;

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

    const getImageFormat = (dataUrl: string) => (dataUrl.includes('image/png') ? 'PNG' : 'JPEG');

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

    const customerName =
      order.user?.displayName ||
      order.user?.mikroName ||
      order.user?.name ||
      '-';
    const customerCode = order.user?.mikroCariCode || '-';
    const creatorName = order.requestedBy?.name
      ? order.requestedBy.name
      : order.customerRequest?.requestedBy?.name
        ? order.customerRequest.requestedBy.name
        : customerName;

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
    const boxHeight = 48;
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
        `Firma: ${customerName}`,
        `Cari Kodu: ${customerCode}`,
        `Mail: ${order.user?.email || '-'}`,
      ],
      marginX + 4,
      infoY + 12,
      boxWidth - 8
    );

    doc.setTextColor(...colors.muted);
    doc.text(cleanPdfText('SIPARIS BILGILERI'), rightBoxX + 4, infoY + 6);
    doc.setTextColor(...colors.dark);
    writeLines(
      [
        `Tarih: ${order.createdAt ? formatDateShort(order.createdAt) : '-'}`,
        `Siparis No: ${order.orderNumber}`,
        `Belge No: ${order.customerOrderNumber || '-'}`,
        `Olusturan: ${creatorName}`,
        order.mikroOrderIds && order.mikroOrderIds.length > 0 ? `Mikro: ${order.mikroOrderIds.join(', ')}` : 'Mikro: -',
      ],
      rightBoxX + 4,
      infoY + 12,
      boxWidth - 8
    );

    const tableStartY = infoY + boxHeight + 10;
    const tableHead = [['Urun Kodu', 'Urun Adi', 'Miktar', 'Birim Fiyat', 'Toplam', 'Tip', 'Not']];
    const tableBody = (order.items || []).map((item) => ([
      cleanPdfText(item.mikroCode),
      cleanPdfText(item.productName),
      cleanPdfText(item.quantity),
      cleanPdfText(formatCurrency(item.unitPrice)),
      cleanPdfText(formatCurrency(item.totalPrice)),
      cleanPdfText(item.priceType === 'WHITE' ? 'Beyaz' : 'Faturali'),
      cleanPdfText(item.lineNote || ''),
    ]));

    autoTable(doc, {
      startY: tableStartY,
      head: tableHead,
      body: tableBody,
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: colors.primary, textColor: [255, 255, 255] },
      margin: { left: marginX, right: marginX },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 60 },
        2: { halign: 'right', cellWidth: 16 },
        3: { halign: 'right', cellWidth: 22 },
        4: { halign: 'right', cellWidth: 22 },
        5: { halign: 'center', cellWidth: 16 },
        6: { cellWidth: 24 },
      },
    });

    const totals = calculateOrderTotals(order);
    const endY = (doc as any).lastAutoTable?.finalY || tableStartY + 10;
    let summaryY = endY + 8;
    if (summaryY + 14 > pageHeight - 10) {
      doc.addPage();
      summaryY = 20;
    }

    doc.setFontSize(9);
    doc.text(cleanPdfText(`KDV Haric Dip Toplam: ${formatCurrency(totals.subtotal)}`), pageWidth - marginX, summaryY, { align: 'right' });
    doc.text(cleanPdfText(`KDV Tutari: ${formatCurrency(totals.totalVat)}`), pageWidth - marginX, summaryY + 5, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(cleanPdfText(`KDV Dahil Dip Toplam: ${formatCurrency(totals.totalWithVat)}`), pageWidth - marginX, summaryY + 10, { align: 'right' });
    doc.setFont('helvetica', 'normal');

    const fileName = `siparis-proforma-${order.orderNumber}.pdf`;
    return { doc, fileName };
  };

  const handleOrderPdfExport = async (order: PendingOrderForAdmin) => {
    try {
      const { doc, fileName } = await buildOrderPdf(order);
      doc.save(fileName);
    } catch (error) {
      console.error('Siparis PDF olusturma hatasi:', error);
      toast.error('Siparis PDF olusturulamadi');
    }
  };

  const handleOrderExcelExport = (order: PendingOrderForAdmin) => {
    try {
      const customerName =
        order.user?.displayName ||
        order.user?.mikroName ||
        order.user?.name ||
        '';
      const safeCustomer = customerName ? customerName.replace(/[^a-zA-Z0-9-_]+/g, '_') : 'Siparis';
      const headerRows = [
        ['Siparis No', order.orderNumber],
        ['Cari', customerName || '-'],
        ['Cari Kodu', order.user?.mikroCariCode || '-'],
        ['Tarih', order.createdAt ? formatDateShort(order.createdAt) : '-'],
      ];
      if (order.customerOrderNumber) {
        headerRows.push(['Musteri Siparis No', order.customerOrderNumber]);
      }
      if (order.mikroOrderIds && order.mikroOrderIds.length > 0) {
        headerRows.push(['Mikro', order.mikroOrderIds.join(', ')]);
      }

      const tableHeader = ['Urun Kodu', 'Urun Adi', 'Miktar', 'Birim Fiyat', 'Toplam', 'Tip', 'Not'];
      const itemRows = (order.items || []).map((item) => ([
        item.mikroCode,
        item.productName,
        item.quantity,
        item.unitPrice,
        item.totalPrice,
        item.priceType === 'WHITE' ? 'Beyaz' : 'Faturali',
        item.lineNote || '',
      ]));

      const totals = calculateOrderTotals(order);
      const summaryRows = [
        [],
        ['KDV Haric Dip Toplam', '', '', '', totals.subtotal, '', ''],
        ['KDV Tutari', '', '', '', totals.totalVat, '', ''],
        ['KDV Dahil Dip Toplam', '', '', '', totals.totalWithVat, '', ''],
      ];

      const rows = [...headerRows, [], tableHeader, ...itemRows, ...summaryRows];
      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Siparis');
      XLSX.writeFile(workbook, `siparis-proforma-${order.orderNumber}_${safeCustomer}.xlsx`);
    } catch (error) {
      console.error('Siparis Excel olusturma hatasi:', error);
      toast.error('Siparis Excel olusturulamadi');
    }
  };

  const handleApprove = async (orderId: string) => {
    const order = allOrders.find((item) => item.id === orderId);
    if (!order) {
      toast.error('Sipariş bulunamadı');
      return;
    }

    const hasInvoiced = order.items.some((item) => item.priceType === 'INVOICED');
    const hasWhite = order.items.some((item) => item.priceType === 'WHITE');

    const result = await new Promise<{
      note: string;
      invoicedSeries?: string;
      whiteSeries?: string;
    } | null>((resolve) => {
      let noteValue = '';
      // 3.9: Son kullanilan evrak serilerini varsayilan olarak getir
      let invoicedSeries = readStoredSeries(INVOICED_SERIES_KEY, 'B2BF');
      let whiteSeries = readStoredSeries(WHITE_SERIES_KEY, 'B2BB');

      toast((t) => (
        <div className="flex flex-col gap-3 min-w-[320px]">
          <p className="font-medium">Onay notu (opsiyonel):</p>
          <input
            type="text"
            className="border rounded px-3 py-2 text-sm"
            placeholder="Not ekleyin..."
            onChange={(e) => noteValue = e.target.value}
          />

          {hasInvoiced && (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Faturalı evrak seri:</p>
              <input
                type="text"
                className="border rounded px-3 py-2 text-sm"
                defaultValue={invoicedSeries}
                onChange={(e) => invoicedSeries = e.target.value}
              />
            </div>
          )}

          {hasWhite && (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Beyaz evrak seri:</p>
              <input
                type="text"
                className="border rounded px-3 py-2 text-sm"
                defaultValue={whiteSeries}
                onChange={(e) => whiteSeries = e.target.value}
              />
            </div>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <button
              className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
              onClick={() => {
                toast.dismiss(t.id);
                resolve(null);
              }}
            >
              İptal
            </button>
            <button
              className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
              onClick={() => {
                const trimmedInvoiced = invoicedSeries.trim();
                const trimmedWhite = whiteSeries.trim();

                if (hasInvoiced && !trimmedInvoiced) {
                  toast.error('Faturalı evrak serisi gerekli');
                  return;
                }
                if (hasWhite && !trimmedWhite) {
                  toast.error('Beyaz evrak serisi gerekli');
                  return;
                }

                toast.dismiss(t.id);
                resolve({
                  note: noteValue,
                  invoicedSeries: hasInvoiced ? trimmedInvoiced.slice(0, 20) : undefined,
                  whiteSeries: hasWhite ? trimmedWhite.slice(0, 20) : undefined,
                });
              }}
            >
              Onayla
            </button>
          </div>
        </div>
      ), {
        duration: Infinity,
      });
    });

    if (!result) return;

    try {
      await adminApi.approveOrder(orderId, {
        adminNote: result.note.trim() || undefined,
        invoicedSeries: result.invoicedSeries,
        whiteSeries: result.whiteSeries,
      });
      // 3.9: Kullanilan serileri bir sonraki onay icin hatirla
      if (result.invoicedSeries) writeStoredSeries(INVOICED_SERIES_KEY, result.invoicedSeries);
      if (result.whiteSeries) writeStoredSeries(WHITE_SERIES_KEY, result.whiteSeries);
      toast.success('Sipariş onaylandı ve Mikro\'ya gönderildi! ✅');
      fetchOrders();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Onaylama başarısız');
    }
  };

  const handleReject = async (orderId: string) => {
    const note = await new Promise<string>((resolve) => {
      let inputValue = '';
      toast((t) => (
        <div className="flex flex-col gap-3 min-w-[300px]">
          <p className="font-medium text-red-700">Red sebebi (zorunlu):</p>
          <textarea
            className="border rounded px-3 py-2 text-sm resize-none"
            rows={3}
            placeholder="Red sebebini yazın..."
            onChange={(e) => inputValue = e.target.value}
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
      ), {
        duration: Infinity,
      });
    });

    if (note === '__CANCEL__') return;

    try {
      await adminApi.rejectOrder(orderId, note);
      toast.success('Sipariş reddedildi');
      fetchOrders();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Reddetme başarısız');
    }
  };

  // 3.9: Sadece bekleyen (PENDING) siparisler toplu onay/red icin secilebilir
  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  // 3.9: Mevcut listede gorunen secilebilir (bekleyen) siparisler
  const selectablePendingOrders = useMemo(
    () => filteredOrders.filter((order) => order.status === 'PENDING'),
    [filteredOrders]
  );
  const selectedCount = selectedOrderIds.size;
  const allPendingSelected =
    selectablePendingOrders.length > 0 &&
    selectablePendingOrders.every((order) => selectedOrderIds.has(order.id));

  const toggleSelectAllPending = () => {
    if (allPendingSelected) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(selectablePendingOrders.map((order) => order.id)));
    }
  };

  // 3.9: Liste/sekme/arama degisince gecersiz secimleri temizle (sadece gorunen bekleyenler secili kalsin)
  useEffect(() => {
    setSelectedOrderIds((prev) => {
      if (prev.size === 0) return prev;
      const visibleIds = new Set(selectablePendingOrders.map((order) => order.id));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (visibleIds.has(id)) next.add(id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [selectablePendingOrders]);

  // 3.9: Toplu onay - tek seferde seri sorulur, secili tum bekleyen siparislere uygulanir.
  // Fiyat/seri mantigi tek onay ile bire bir ayni; sadece tekrarli giris ortadan kalkar.
  const handleBulkApprove = async () => {
    const targets = allOrders.filter(
      (order) => selectedOrderIds.has(order.id) && order.status === 'PENDING'
    );
    if (targets.length === 0) {
      toast.error('Onaylanacak bekleyen siparis secilmedi');
      return;
    }

    const anyInvoiced = targets.some((order) =>
      order.items.some((item) => item.priceType === 'INVOICED')
    );
    const anyWhite = targets.some((order) =>
      order.items.some((item) => item.priceType === 'WHITE')
    );

    const result = await new Promise<{
      note: string;
      invoicedSeries?: string;
      whiteSeries?: string;
    } | null>((resolve) => {
      let noteValue = '';
      let invoicedSeries = readStoredSeries(INVOICED_SERIES_KEY, 'B2BF');
      let whiteSeries = readStoredSeries(WHITE_SERIES_KEY, 'B2BB');

      toast((t) => (
        <div className="flex flex-col gap-3 min-w-[320px]">
          <p className="font-semibold">{targets.length} siparis toplu onaylanacak</p>
          <p className="text-xs text-gray-600">
            Secili siparisler onaylanip Mikro&apos;ya gonderilecek. Seriler son kullanilan degerlerle dolduruldu.
          </p>
          <p className="font-medium text-sm">Onay notu (opsiyonel):</p>
          <input
            type="text"
            className="border rounded px-3 py-2 text-sm"
            placeholder="Not ekleyin..."
            onChange={(e) => noteValue = e.target.value}
          />

          {anyInvoiced && (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Faturalı evrak seri:</p>
              <input
                type="text"
                className="border rounded px-3 py-2 text-sm"
                defaultValue={invoicedSeries}
                onChange={(e) => invoicedSeries = e.target.value}
              />
            </div>
          )}

          {anyWhite && (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Beyaz evrak seri:</p>
              <input
                type="text"
                className="border rounded px-3 py-2 text-sm"
                defaultValue={whiteSeries}
                onChange={(e) => whiteSeries = e.target.value}
              />
            </div>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <button
              className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
              onClick={() => {
                toast.dismiss(t.id);
                resolve(null);
              }}
            >
              İptal
            </button>
            <button
              className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
              onClick={() => {
                const trimmedInvoiced = invoicedSeries.trim();
                const trimmedWhite = whiteSeries.trim();

                if (anyInvoiced && !trimmedInvoiced) {
                  toast.error('Faturalı evrak serisi gerekli');
                  return;
                }
                if (anyWhite && !trimmedWhite) {
                  toast.error('Beyaz evrak serisi gerekli');
                  return;
                }

                toast.dismiss(t.id);
                resolve({
                  note: noteValue,
                  invoicedSeries: anyInvoiced ? trimmedInvoiced.slice(0, 20) : undefined,
                  whiteSeries: anyWhite ? trimmedWhite.slice(0, 20) : undefined,
                });
              }}
            >
              {targets.length} Siparisi Onayla
            </button>
          </div>
        </div>
      ), {
        duration: Infinity,
      });
    });

    if (!result) return;

    // 3.9: Kullanilan serileri hatirla
    if (result.invoicedSeries) writeStoredSeries(INVOICED_SERIES_KEY, result.invoicedSeries);
    if (result.whiteSeries) writeStoredSeries(WHITE_SERIES_KEY, result.whiteSeries);

    setIsBulkProcessing(true);
    let success = 0;
    let failed = 0;
    // 3.9: Mikro yazma islemi oldugu icin siparisler sirayla gonderilir (paralel degil)
    for (const order of targets) {
      // Her siparise sadece kendi kalemlerinde gecen tipe ait seriyi gonder
      const orderHasInvoiced = order.items.some((item) => item.priceType === 'INVOICED');
      const orderHasWhite = order.items.some((item) => item.priceType === 'WHITE');
      try {
        await adminApi.approveOrder(order.id, {
          adminNote: result.note.trim() || undefined,
          invoicedSeries: orderHasInvoiced ? result.invoicedSeries : undefined,
          whiteSeries: orderHasWhite ? result.whiteSeries : undefined,
        });
        success += 1;
      } catch (error: any) {
        failed += 1;
        const reason = error.response?.data?.error || 'bilinmeyen hata';
        toast.error(`#${order.orderNumber} onaylanamadi: ${reason}`);
      }
    }
    setIsBulkProcessing(false);

    if (success > 0) {
      toast.success(`${success} siparis onaylandi ve Mikro'ya gonderildi`);
    }
    if (failed === 0) {
      setSelectedOrderIds(new Set());
    }
    fetchOrders();
  };

  // 3.9: Toplu red - tek red sebebi alinir, secili tum bekleyen siparislere uygulanir.
  const handleBulkReject = async () => {
    const targets = allOrders.filter(
      (order) => selectedOrderIds.has(order.id) && order.status === 'PENDING'
    );
    if (targets.length === 0) {
      toast.error('Reddedilecek bekleyen siparis secilmedi');
      return;
    }

    const note = await new Promise<string>((resolve) => {
      let inputValue = '';
      toast((t) => (
        <div className="flex flex-col gap-3 min-w-[300px]">
          <p className="font-medium text-red-700">{targets.length} siparis icin red sebebi (zorunlu):</p>
          <textarea
            className="border rounded px-3 py-2 text-sm resize-none"
            rows={3}
            placeholder="Red sebebini yazın..."
            onChange={(e) => inputValue = e.target.value}
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
              {targets.length} Siparisi Reddet
            </button>
          </div>
        </div>
      ), {
        duration: Infinity,
      });
    });

    if (note === '__CANCEL__') return;

    setIsBulkProcessing(true);
    let success = 0;
    let failed = 0;
    for (const order of targets) {
      try {
        await adminApi.rejectOrder(order.id, note);
        success += 1;
      } catch (error: any) {
        failed += 1;
        const reason = error.response?.data?.error || 'bilinmeyen hata';
        toast.error(`#${order.orderNumber} reddedilemedi: ${reason}`);
      }
    }
    setIsBulkProcessing(false);

    if (success > 0) {
      toast.success(`${success} siparis reddedildi`);
    }
    if (failed === 0) {
      setSelectedOrderIds(new Set());
    }
    fetchOrders();
  };

  const getOrderCounts = () => {
    return {
      pending: allOrders.filter(o => o.status === 'PENDING').length,
      approved: allOrders.filter(o => o.status === 'APPROVED').length,
      rejected: allOrders.filter(o => o.status === 'REJECTED').length,
      all: allOrders.length,
    };
  };

  const counts = getOrderCounts();
  const sourceCounts = {
    all: allOrders.length,
    customer: allOrders.filter(isCustomerOrder).length,
    b2b: allOrders.filter((order) => !isCustomerOrder(order)).length,
  };
  const emptyStateMessage = searchTerm.trim()
    ? 'Arama ile eslesen siparis bulunamadi.'
    : activeTab === 'PENDING'
      ? 'Bekleyen siparis yok'
      : activeTab === 'APPROVED'
        ? 'Onaylanmis siparis yok'
        : activeTab === 'REJECTED'
          ? 'Reddedilmis siparis yok'
          : 'Henuz hic siparis yok';

  return {
    // router
    router,
    // tablar / kaynak / arama
    activeTab,
    setActiveTab,
    sourceTab,
    setSourceTab,
    searchTerm,
    setSearchTerm,
    // veri / yuklenme
    isLoading,
    orders,
    allOrders,
    filteredOrders,
    // sayaclar
    counts,
    sourceCounts,
    emptyStateMessage,
    // genisletme
    expandedOrders,
    toggleExpanded,
    // secim / toplu islem
    selectedOrderIds,
    isBulkProcessing,
    toggleOrderSelection,
    selectablePendingOrders,
    selectedCount,
    allPendingSelected,
    toggleSelectAllPending,
    setSelectedOrderIds,
    // siparis aksiyonlari
    openEdit,
    handleApprove,
    handleReject,
    handleBulkApprove,
    handleBulkReject,
    handleOrderPdfExport,
    handleOrderExcelExport,
    // yardimci
    isCustomerOrder,
  };
}

export default useSiparisler;
