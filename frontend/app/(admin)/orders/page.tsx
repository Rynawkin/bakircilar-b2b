'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { PendingOrderForAdmin } from '@/types';
import adminApi from '@/lib/api/admin';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { OrderCardSkeleton } from '@/components/ui/Skeleton';
import { CustomerInfoCard } from '@/components/ui/CustomerInfoCard';
import { formatCurrency, formatDate, formatDateShort } from '@/lib/utils/format';
import * as XLSX from 'xlsx';

type OrderStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
type OrderSource = 'ALL' | 'CUSTOMER' | 'B2B';


type EditableOrderItem = {
  id: string;
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  priceType: 'INVOICED' | 'WHITE';
  lineNote?: string | null;
  responsibilityCenter?: string | null;
};

export default function AdminOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<PendingOrderForAdmin[]>([]);
  const [allOrders, setAllOrders] = useState<PendingOrderForAdmin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<OrderStatus>('PENDING');
  const [sourceTab, setSourceTab] = useState<OrderSource>('ALL');

  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [editOrder, setEditOrder] = useState<PendingOrderForAdmin | null>(null);
  const [editItems, setEditItems] = useState<EditableOrderItem[]>([]);
  const [editCustomerOrderNumber, setEditCustomerOrderNumber] = useState('');
  const [editDeliveryLocation, setEditDeliveryLocation] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, []);

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

  const openEdit = (order: PendingOrderForAdmin) => {
    setEditOrder(order);
    setEditCustomerOrderNumber(order.customerOrderNumber || '');
    setEditDeliveryLocation(order.deliveryLocation || '');
    setEditItems((order.items || []).map((item) => ({
      id: item.id,
      productCode: item.mikroCode,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      priceType: item.priceType === 'WHITE' ? 'WHITE' : 'INVOICED',
      lineNote: item.lineNote || '',
      responsibilityCenter: item.responsibilityCenter || '',
    })));
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditOrder(null);
    setEditItems([]);
  };

  const updateEditItem = (id: string, patch: Partial<EditableOrderItem>) => {
    setEditItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeEditItem = (id: string) => {
    setEditItems((prev) => prev.filter((item) => item.id !== id));
  };

  const editTotal = useMemo(() => {
    return editItems.reduce((sum, item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unitPrice) || 0;
      return sum + qty * price;
    }, 0);
  }, [editItems]);

  const handleSaveEdit = async () => {
    if (!editOrder) return;
    if (editItems.length === 0) {
      toast.error('En az bir kalem olmali.');
      return;
    }
    for (let i = 0; i < editItems.length; i += 1) {
      const item = editItems[i];
      if (!item.productCode) {
        toast.error(`Urun kodu eksik (Satir ${i + 1}).`);
        return;
      }
      if (!item.productName) {
        toast.error(`Urun adi eksik (Satir ${i + 1}).`);
        return;
      }
      if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) {
        toast.error(`Miktar gecersiz (Satir ${i + 1}).`);
        return;
      }
      if (!Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0) {
        toast.error(`Birim fiyat gecersiz (Satir ${i + 1}).`);
        return;
      }
    }

    setEditSaving(true);
    try {
      await adminApi.updateOrder(editOrder.id, {
        customerOrderNumber: editCustomerOrderNumber.trim() || undefined,
        deliveryLocation: editDeliveryLocation.trim() || undefined,
        items: editItems.map((item) => ({
          productCode: item.productCode,
          productName: item.productName,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          priceType: item.priceType === 'WHITE' ? 'WHITE' : 'INVOICED',
          lineNote: item.lineNote?.trim() || undefined,
          responsibilityCenter: item.responsibilityCenter?.trim() || undefined,
        })),
      });
      toast.success('Siparis guncellendi.');
      closeEdit();
      fetchOrders();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Siparis guncellenemedi.');
    } finally {
      setEditSaving(false);
    }
  };


  const cleanPdfText = (text: string | number | null | undefined) => {
    const value = String(text ?? '');
    return value
      .replace(/\r?\n/g, ' ')
      .replace(/\u20BA/g, 'TL')
      .replace(/\u0130/g, 'I')
      .replace(/\u0131/g, 'i')
      .replace(/\u015E/g, 'S')
      .replace(/\u015F/g, 's')
      .replace(/\u011E/g, 'G')
      .replace(/\u011F/g, 'g')
      .replace(/\u00DC/g, 'U')
      .replace(/\u00FC/g, 'u')
      .replace(/\u00D6/g, 'O')
      .replace(/\u00F6/g, 'o')
      .replace(/\u00C7/g, 'C')
      .replace(/\u00E7/g, 'c');
  };

  const buildOrderPdf = async (order: PendingOrderForAdmin) => {
    const { default: jsPDF } = await import('jspdf');
    const autoTableModule = await import('jspdf-autotable');
    const autoTable = (autoTableModule as any).default || (autoTableModule as any).autoTable;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
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

    const endY = (doc as any).lastAutoTable?.finalY || tableStartY + 10;
    doc.setFontSize(10);
    doc.text(cleanPdfText(`Toplam: ${formatCurrency(order.totalAmount)}`), pageWidth - marginX, endY + 8, { align: 'right' });

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

      const rows = [...headerRows, [], tableHeader, ...itemRows];
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
      let invoicedSeries = 'B2BF';
      let whiteSeries = 'B2BB';

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="warning">⏳ Bekliyor</Badge>;
      case 'APPROVED':
        return <Badge variant="success">✅ Onaylandı</Badge>;
      case 'REJECTED':
        return <Badge variant="danger">❌ Reddedildi</Badge>;
      default:
        return null;
    }
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
  const pageHeader = (
    <div className="container-custom py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Siparisler</h1>
          <p className="text-sm text-gray-600">Tum musteri siparisleri</p>
        </div>
        <Button variant="primary" onClick={() => router.push('/quotes/new?mode=order')}>
          Yeni Siparis
        </Button>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        {pageHeader}
        <div className="container-custom pb-8 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <OrderCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {pageHeader}

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container-custom">
          <div className="flex gap-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab('PENDING')}
              className={`px-6 py-4 font-semibold text-sm whitespace-nowrap transition-colors relative ${
                activeTab === 'PENDING'
                  ? 'text-primary-600 border-b-2 border-primary-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              ⏳ Bekleyen
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'PENDING' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {counts.pending}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('APPROVED')}
              className={`px-6 py-4 font-semibold text-sm whitespace-nowrap transition-colors relative ${
                activeTab === 'APPROVED'
                  ? 'text-green-600 border-b-2 border-green-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              ✅ Onaylanan
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {counts.approved}
              </span>
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
              }`}>
                {counts.rejected}
              </span>
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
              }`}>
                {counts.all}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border-b border-gray-200">
        <div className="container-custom">
          <div className="flex gap-2 overflow-x-auto py-3">
            <button
              onClick={() => setSourceTab('ALL')}
              className={`px-4 py-2 text-sm font-semibold rounded-full border transition-colors ${
                sourceTab === 'ALL'
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:text-gray-900'
              }`}
            >
              Tum Siparisler
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                sourceTab === 'ALL' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
              }`}>
                {sourceCounts.all}
              </span>
            </button>
            <button
              onClick={() => setSourceTab('CUSTOMER')}
              className={`px-4 py-2 text-sm font-semibold rounded-full border transition-colors ${
                sourceTab === 'CUSTOMER'
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:text-gray-900'
              }`}
            >
              Musteri Siparisleri
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                sourceTab === 'CUSTOMER' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
              }`}>
                {sourceCounts.customer}
              </span>
            </button>
            <button
              onClick={() => setSourceTab('B2B')}
              className={`px-4 py-2 text-sm font-semibold rounded-full border transition-colors ${
                sourceTab === 'B2B'
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:text-gray-900'
              }`}
            >
              B2B Siparisleri
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                sourceTab === 'B2B' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
              }`}>
                {sourceCounts.b2b}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="container-custom py-8">
        {orders.length === 0 ? (
          <Card>
            <p className="text-center text-gray-600 py-8">
              {activeTab === 'PENDING' && '⏳ Bekleyen sipariş yok'}
              {activeTab === 'APPROVED' && '✅ Onaylanmış sipariş yok'}
              {activeTab === 'REJECTED' && '❌ Reddedilmiş sipariş yok'}
              {activeTab === 'ALL' && '📋 Henüz hiç sipariş yok'}
            </p>
          </Card>
        ) : (
          <div className="space-y-6">
            {orders.map((order) => {
              const isExpanded = expandedOrders.has(order.id);
              const customerName =
                order.user?.displayName ||
                order.user?.mikroName ||
                order.user?.name ||
                '-';
              const creatorLabel = order.requestedBy?.name
                ? `${order.requestedBy.name} (B2B)`
                : order.customerRequest?.requestedBy?.name
                  ? `${order.customerRequest.requestedBy.name} (Talep)`
                  : `${customerName} (Musteri)`;

              return (

              <Card key={order.id} className="overflow-hidden">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-xs text-gray-500">Cari</div>
                    <div className="font-semibold text-gray-900">{customerName}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Kod: {order.user?.mikroCariCode || '-'} - Siparis #{order.orderNumber} - {formatDate(order.createdAt)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Olusturan: {creatorLabel}</div>
                    {order.customerOrderNumber && (
                      <div className="text-xs text-gray-500 mt-1">Belge No: {order.customerOrderNumber}</div>
                    )}
                    {order.deliveryLocation && (
                      <div className="text-xs text-gray-500 mt-1">Teslimat: {order.deliveryLocation}</div>
                    )}

                    {order.mikroOrderIds && order.mikroOrderIds.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {order.mikroOrderIds.map((mikroId, idx) => (
                          <div key={idx} className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                            <span className="text-xs font-medium text-blue-700">Mikro ID:</span>
                            <span className="text-xs font-mono font-bold text-blue-900">{mikroId}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {order.adminNote && (
                      <div className="mt-2 bg-gray-50 border border-gray-200 rounded px-3 py-2">
                        <p className="text-xs font-medium text-gray-600">Admin Notu:</p>
                        <p className="text-sm text-gray-800 mt-1">{order.adminNote}</p>
                      </div>
                    )}

                    {order.sourceQuote && (
                      <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
                        <p className="text-xs font-medium text-emerald-700">Teklif Kaynagi</p>
                        <p className="text-xs text-emerald-700 mt-1">
                          Teklif No: {order.sourceQuote.quoteNumber}
                          {order.sourceQuote.createdAt ? ` - ${formatDate(order.sourceQuote.createdAt)}` : ''}
                        </p>
                        <div className="mt-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => router.push(`/quotes?history=${order.sourceQuote?.id}`)}
                          >
                            Teklif Gecmisi
                          </Button>
                        </div>
                      </div>
                    )}

                    {order.customerRequest && (
                      <div className="mt-2 bg-indigo-50 border border-indigo-200 rounded px-3 py-2">
                        <p className="text-xs font-medium text-indigo-700">Talep Kaynagi</p>
                        <p className="text-xs text-indigo-700 mt-1">Talep ID: {order.customerRequest.id.slice(0, 8)}</p>
                        {order.customerRequest.requestedBy && (
                          <p className="text-xs text-indigo-700 mt-1">
                            Talep eden: {order.customerRequest.requestedBy.name}
                            {order.customerRequest.requestedBy.email ? ` (${order.customerRequest.requestedBy.email})` : ''}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    {getStatusBadge(order.status)}
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Toplam</div>
                      <div className="text-lg font-bold text-primary-600">{formatCurrency(order.totalAmount)}</div>
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900"
                      onClick={() => toggleExpanded(order.id)}
                    >
                      {isExpanded ? 'Detayi Gizle' : 'Detayi Goster'}
                      <span className={`inline-block transition-transform ${isExpanded ? 'rotate-90' : ''}`}>{'>'}</span>
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => handleOrderPdfExport(order)}>
                    Siparis Proforma PDF
                  </Button>
                  <Button variant="secondary" onClick={() => handleOrderExcelExport(order)}>
                    Siparis Proforma Excel
                  </Button>
                  {order.status === 'PENDING' && (
                    <Button variant="secondary" onClick={() => openEdit(order)}>
                      Duzenle
                    </Button>
                  )}
                  {order.status === 'PENDING' && (
                    <>
                      <Button variant="primary" onClick={() => handleApprove(order.id)}>
                        Onayla ve Mikro'ya Gonder
                      </Button>
                      <Button variant="danger" onClick={() => handleReject(order.id)}>
                        Reddet
                      </Button>
                    </>
                  )}
                </div>

                {isExpanded && (
                  <>
                    <div className="mt-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Musteri Bilgileri</h4>
                      <CustomerInfoCard customer={order.user} />
                    </div>

                    <div className="border-t pt-4 mt-4">
                      <p className="text-sm font-semibold text-gray-700 mb-3">Siparis Kalemleri ({order.items.length} urun)</p>
                      <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                        {order.items.map((item) => (
                          <div key={item.id} className="flex justify-between items-center text-sm py-2 px-3 bg-white rounded border border-gray-100">
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">{item.productName}</p>
                              <div className="flex gap-2 mt-1">
                                <span className="text-xs text-gray-500">{item.mikroCode}</span>
                                <Badge variant={item.priceType === 'INVOICED' ? 'info' : 'default'} className="text-xs">
                                  {item.priceType === 'INVOICED' ? 'Faturali' : 'Beyaz'}
                                </Badge>
                              </div>
                              {item.lineNote && (
                                <p className="text-xs text-gray-500 mt-1">Not: {item.lineNote}</p>
                              )}
                              {item.responsibilityCenter && (
                                <p className="text-xs text-gray-500 mt-1">Sorumluluk: {item.responsibilityCenter}</p>
                              )}
                            </div>
                            <div className="text-right ml-4">
                              <p className="text-gray-600">{item.quantity} x {formatCurrency(item.unitPrice)}</p>
                              <p className="font-semibold text-gray-900">{formatCurrency(item.totalPrice)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {order.status === 'APPROVED' && order.approvedAt && (
                      <div className="pt-4 border-t border-gray-200 text-center">
                        <p className="text-sm text-green-700">
                          Onaylandi: {formatDate(order.approvedAt)}
                        </p>
                      </div>
                    )}
                    {order.status === 'REJECTED' && order.rejectedAt && (
                      <div className="pt-4 border-t border-gray-200 text-center">
                        <p className="text-sm text-red-700">
                          Reddedildi: {formatDate(order.rejectedAt)}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </Card>
            );
            })}
          </div>
        )}

      <Modal
        isOpen={editOpen}
        onClose={closeEdit}
        title={editOrder ? `Siparis Duzenle - ${editOrder.orderNumber}` : 'Siparis Duzenle'}
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={closeEdit} disabled={editSaving}>
              Iptal
            </Button>
            <Button variant="primary" onClick={handleSaveEdit} isLoading={editSaving}>
              Kaydet
            </Button>
          </>
        }
      >
        {!editOrder ? (
          <p className="text-sm text-gray-500">Siparis secilmedi.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Belge No (Musteri Siparis No)"
                value={editCustomerOrderNumber}
                onChange={(e) => setEditCustomerOrderNumber(e.target.value)}
                placeholder="Orn: HENDEK-8915"
              />
              <Input
                label="Teslimat"
                value={editDeliveryLocation}
                onChange={(e) => setEditDeliveryLocation(e.target.value)}
                placeholder="Teslimat yeri"
              />
            </div>

            <div className="space-y-3">
              {editItems.map((item) => (
                <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{item.productName}</div>
                      <div className="text-xs text-gray-500">{item.productCode}</div>
                    </div>
                    <Button variant="danger" size="sm" onClick={() => removeEditItem(item.id)}>
                      Sil
                    </Button>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Miktar</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={item.quantity}
                        onChange={(e) => updateEditItem(item.id, { quantity: Number(e.target.value) })}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Birim Fiyat</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={item.unitPrice}
                        onChange={(e) => updateEditItem(item.id, { unitPrice: Number(e.target.value) })}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Fiyat Tipi</label>
                      <select
                        value={item.priceType}
                        onChange={(e) => updateEditItem(item.id, { priceType: e.target.value === 'WHITE' ? 'WHITE' : 'INVOICED' })}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm"
                      >
                        <option value="INVOICED">Faturali</option>
                        <option value="WHITE">Beyaz</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Sorumluluk</label>
                      <input
                        type="text"
                        value={item.responsibilityCenter || ''}
                        onChange={(e) => updateEditItem(item.id, { responsibilityCenter: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm"
                      />
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Not</label>
                    <input
                      type="text"
                      value={item.lineNote || ''}
                      onChange={(e) => updateEditItem(item.id, { lineNote: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end text-sm font-semibold text-gray-900">
              Toplam: {formatCurrency(editTotal)}
            </div>
          </div>
        )}
      </Modal>
      </div>
    </div>
  );
}
