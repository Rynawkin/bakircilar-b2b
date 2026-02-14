import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';

import { Quote } from '../types';

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://www.bakircilarkampanya.com/api';

const BASE_URL = API_BASE.replace(/\/api\/?$/, '');

type RecommendedPdfProduct = {
  mikroCode?: string | null;
  name?: string | null;
  imageUrl?: string | null;
  recommendationNote?: string | null;
};

export interface QuotePdfOptions {
  recommendedProducts?: RecommendedPdfProduct[];
}

const escapeHtml = (value: string | number | null | undefined) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const formatDate = (value?: string | null) => (value ? value.slice(0, 10) : '-');

const formatMoney = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return Number(value).toFixed(2);
};

const resolveImageUrl = (url?: string | null) => {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `${BASE_URL}${url}`;
  return `${BASE_URL}/${url}`;
};

export const buildQuoteHtml = (quote: Quote, options?: QuotePdfOptions) => {
  const customerName = quote.customer?.name || quote.customer?.displayName || quote.customer?.mikroName || '-';
  const items = quote.items || [];
  const recommendedProducts = options?.recommendedProducts || [];
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

  const recommendedCards = recommendedProducts
    .map((product) => {
      const productName = product.name?.trim() || '-';
      const productCode = product.mikroCode?.trim() || '-';
      const recommendationNote = product.recommendationNote?.trim() || '';
      const imageUrl = resolveImageUrl(product.imageUrl);
      const imageContent = imageUrl
        ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(productName)}" />`
        : `<div class="recommended-placeholder">${escapeHtml(productName.slice(0, 1).toUpperCase() || '?')}</div>`;

      return `
        <div class="recommended-card">
          <div class="recommended-image">${imageContent}</div>
          <div class="recommended-name">${escapeHtml(productName)}</div>
          <div class="recommended-code">${escapeHtml(productCode)}</div>
          ${recommendationNote ? `<div class="recommended-note">${escapeHtml(recommendationNote)}</div>` : ''}
        </div>
      `;
    })
    .join('');

  const recommendedSection =
    recommendedProducts.length > 0
      ? `
        <div class="recommended">
          <h2>Onerilen Urunler</h2>
          <div class="recommended-grid">
            ${recommendedCards}
          </div>
        </div>
      `
      : '';

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
          .recommended { margin-top: 20px; }
          .recommended h2 { font-size: 16px; margin: 0 0 10px 0; }
          .recommended-grid { display: flex; flex-wrap: wrap; gap: 10px; }
          .recommended-card {
            width: 155px;
            border: 1px solid #E5E7EB;
            border-radius: 8px;
            padding: 8px;
            box-sizing: border-box;
          }
          .recommended-image {
            width: 100%;
            height: 88px;
            border-radius: 6px;
            overflow: hidden;
            background: #F3F4F6;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 8px;
          }
          .recommended-image img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .recommended-placeholder {
            font-size: 22px;
            font-weight: 700;
            color: #9CA3AF;
          }
          .recommended-name {
            font-size: 12px;
            font-weight: 600;
            line-height: 1.3;
            margin-bottom: 4px;
          }
          .recommended-code { font-size: 11px; color: #6B7280; margin-bottom: 4px; }
          .recommended-note { font-size: 10px; color: #4B5563; line-height: 1.3; }
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
              <th>Birim Fiyat</th>
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
        ${recommendedSection}
      </body>
    </html>
  `;
};

export const shareQuotePdf = async (quote: Quote, options?: QuotePdfOptions) => {
  const html = buildQuoteHtml(quote, options);
  const { uri } = await Print.printToFileAsync({ html });
  const canShare = await Sharing.isAvailableAsync();
  const hasRecommended = Boolean(options?.recommendedProducts && options.recommendedProducts.length > 0);
  const dialogTitle = hasRecommended
    ? `Teklif ${quote.quoteNumber} (Onerili)`
    : `Teklif ${quote.quoteNumber}`;
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle,
    });
  } else {
    await Linking.openURL(uri);
  }
};
