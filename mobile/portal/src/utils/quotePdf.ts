import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';

import { Quote } from '../types';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const formatDate = (value?: string | null) => (value ? value.slice(0, 10) : '-');

const formatMoney = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return Number(value).toFixed(2);
};

export const buildQuoteHtml = (quote: Quote) => {
  const customerName = quote.customer?.name || quote.customer?.displayName || quote.customer?.mikroName || '-';
  const items = quote.items || [];
  const itemRows = items
    .map((item, index) => {
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.productName || '-')}</td>
          <td>${escapeHtml(item.productCode || '-')}</td>
          <td>${item.quantity}</td>
          <td>${formatMoney(item.unitPrice)} TL</td>
          <td>${formatMoney(item.totalPrice)} TL</td>
        </tr>
      `;
    })
    .join('');

  return `
    <html>
      <head>
        <style>
          body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #111827; }
          h1 { font-size: 22px; margin-bottom: 8px; }
          .meta { margin-bottom: 16px; font-size: 12px; color: #4B5563; }
          .meta div { margin-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #E5E7EB; padding: 8px; text-align: left; }
          th { background-color: #F3F4F6; }
          .totals { margin-top: 16px; font-size: 13px; }
          .totals div { display: flex; justify-content: space-between; margin-bottom: 6px; }
        </style>
      </head>
      <body>
        <h1>Teklif ${escapeHtml(quote.quoteNumber)}</h1>
        <div class="meta">
          <div><strong>Cari:</strong> ${escapeHtml(customerName)}</div>
          <div><strong>Durum:</strong> ${escapeHtml(quote.status || '-')}</div>
          <div><strong>Tarih:</strong> ${formatDate(quote.createdAt)}</div>
          <div><strong>Gecerlilik:</strong> ${formatDate(quote.validityDate)}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Urun</th>
              <th>Kod</th>
              <th>Miktar</th>
              <th>Birim</th>
              <th>Toplam</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows || '<tr><td colspan="6">Kalem bulunamadi.</td></tr>'}
          </tbody>
        </table>
        <div class="totals">
          <div><span>Ara Toplam</span><span>${formatMoney(quote.totalAmount)} TL</span></div>
          <div><span>KDV</span><span>${formatMoney(quote.totalVat ?? 0)} TL</span></div>
          <div><strong>Genel Toplam</strong><strong>${formatMoney(quote.grandTotal ?? quote.totalAmount)} TL</strong></div>
        </div>
      </body>
    </html>
  `;
};

export const shareQuotePdf = async (quote: Quote) => {
  const html = buildQuoteHtml(quote);
  const { uri } = await Print.printToFileAsync({ html });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Teklif ${quote.quoteNumber}`,
    });
  } else {
    await Linking.openURL(uri);
  }
};
