import type { PaymentAttempt } from '@/types';
import { BRAND_ASSETS } from '@/lib/brand';

// Online odeme dekontu (jsPDF, gomulu Turkce destekli font). Musteri /payments ve
// admin /payment-operations ekranlarindan cagrilir; banka + Mikro makbuz referanslarini icerir.

const toBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
};

const loadFont = async (path: string) => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Font yuklenemedi: ${path}`);
  return toBase64(await response.arrayBuffer());
};

const loadLogo = async (): Promise<string | null> => {
  try {
    const response = await fetch(BRAND_ASSETS.logos.horizontal.blue, { cache: 'force-cache' });
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
};

const money = (value: number) =>
  new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + ' TL';

const dateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

export async function generatePaymentReceiptPdf(payment: PaymentAttempt) {
  const [{ default: jsPDF }, regular, bold, mono, logo] = await Promise.all([
    import('jspdf'),
    loadFont('/fonts/HankenGrotesk-Regular.ttf'),
    loadFont('/fonts/HankenGrotesk-Bold.ttf'),
    loadFont('/fonts/IBMPlexMono-Regular.ttf'),
    loadLogo(),
  ]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('Hanken-Regular.ttf', regular);
  doc.addFont('Hanken-Regular.ttf', 'Hanken', 'normal');
  doc.addFileToVFS('Hanken-Bold.ttf', bold);
  doc.addFont('Hanken-Bold.ttf', 'Hanken', 'bold');
  doc.addFileToVFS('PlexMono.ttf', mono);
  doc.addFont('PlexMono.ttf', 'PlexMono', 'normal');

  const ink = '#14223b';
  const muted = '#64748b';
  const line = '#e2e8f0';
  const navy = '#15356b';
  const green = '#15803d';
  const width = doc.internal.pageSize.getWidth();
  const margin = 16;
  let y = 18;

  // Baslik
  if (logo) {
    doc.addImage(logo, 'PNG', margin, y - 6, 52, 13, undefined, 'FAST');
  } else {
    doc.setFont('Hanken', 'bold').setFontSize(18).setTextColor(navy);
    doc.text('BAKIRCILAR', margin, y + 3);
  }
  doc.setFont('Hanken', 'bold').setFontSize(15).setTextColor(ink);
  doc.text('ÖDEME DEKONTU', width - margin, y + 1, { align: 'right' });
  doc.setFont('Hanken', 'normal').setFontSize(9).setTextColor(muted);
  doc.text('Online Tahsilat / Kredi Kartı (PayByLink)', width - margin, y + 7, { align: 'right' });
  y += 16;
  doc.setDrawColor(line).setLineWidth(0.4);
  doc.line(margin, y, width - margin, y);
  y += 9;

  // Durum + tutar
  const succeeded = payment.status === 'SUCCEEDED';
  doc.setFont('Hanken', 'bold').setFontSize(11).setTextColor(succeeded ? green : muted);
  doc.text(succeeded ? 'İŞLEM BAŞARILI' : `DURUM: ${payment.status}`, margin, y);
  doc.setFont('Hanken', 'bold').setFontSize(20).setTextColor(ink);
  doc.text(money(payment.amount), width - margin, y + 1, { align: 'right' });
  y += 12;

  const row = (label: string, value?: string | null, monoValue = false) => {
    if (!value || value === '-') return;
    doc.setFont('Hanken', 'normal').setFontSize(9.5).setTextColor(muted);
    doc.text(label, margin, y);
    doc.setFont(monoValue ? 'PlexMono' : 'Hanken', monoValue ? 'normal' : 'bold').setFontSize(10).setTextColor(ink);
    doc.text(String(value), margin + 58, y);
    y += 7;
  };
  const section = (title: string) => {
    y += 3;
    doc.setDrawColor(line).setLineWidth(0.3);
    doc.line(margin, y - 1, width - margin, y - 1);
    y += 5;
    doc.setFont('Hanken', 'bold').setFontSize(10.5).setTextColor(navy);
    doc.text(title, margin, y);
    y += 7;
  };

  section('Müşteri Bilgileri');
  row('Ünvan', payment.customerName);
  row('Cari Kodu', payment.customerCode || undefined, true);

  section('Ödeme Bilgileri');
  row('Ödeme Tarihi', dateTime(payment.succeededAt || payment.createdAt));
  row('Tutar', money(payment.amount));
  row('Ödeme Yöntemi', `${payment.bankName} - Kredi Kartı (Güvenli Ödeme Sayfası)`);
  row('Sistem Referansı', payment.orderId, true);

  section('Banka İşlem Bilgileri');
  row('Banka Sipariş No', (payment as any).providerOrderId, true);
  row('Banka Onay Kodu', (payment as any).bankAuthCode, true);
  row('Banka İşlem No', (payment as any).bankTransactionId, true);

  const receiptNo = (payment as any).mikroReceiptNo as string | null | undefined;
  const receiptRef = (payment as any).mikroReceiptRef as string | null | undefined;
  if (payment.reconciledAt || receiptNo) {
    section('Muhasebe Kaydı');
    row('Mutabakat Tarihi', dateTime(payment.reconciledAt));
    row('Tahsilat Makbuz No', receiptNo || undefined, true);
    row('Makbuz Referans No', receiptRef || undefined, true);
  }

  y += 8;
  doc.setDrawColor(line).setLineWidth(0.4);
  doc.line(margin, y, width - margin, y);
  y += 6;
  doc.setFont('Hanken', 'normal').setFontSize(8.5).setTextColor(muted);
  doc.text(
    'Bu dekont bilgilendirme amaçlıdır; ödeme banka güvenli ödeme sayfası üzerinden alınmıştır.',
    margin, y,
  );
  y += 5;
  doc.text(`Oluşturulma: ${dateTime(new Date().toISOString())}  ·  www.bakircilarkampanya.com`, margin, y);

  // Dosya adi tarihi Istanbul gunune gore (UTC kesiti gece yarisinda bir gun geri kalabilir).
  const stampSource = new Date(payment.succeededAt || payment.createdAt || Date.now());
  const stamp = Number.isNaN(stampSource.getTime())
    ? 'dekont'
    : stampSource.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
  doc.save(`dekont-${payment.orderId}-${stamp}.pdf`);
}
