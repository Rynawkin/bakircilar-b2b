/**
 * Email Service - Brevo (SendinBlue) Integration
 *
 * Bekleyen sipariÅŸleri mÃ¼ÅŸterilere mail ile gÃ¶nderir.
 */

import { prisma } from '../utils/prisma';
import * as brevo from '@sendinblue/client';
import orderTrackingService from './order-tracking.service';

interface OrderEmailData {
  customerCode: string;
  customerName: string;
  customerEmail: string;
  orders: Array<{
    mikroOrderNumber: string;
    orderDate: Date;
    deliveryDate: Date | null;
    items: Array<{
      productCode?: string;
      productName: string;
      unit: string;
      quantity: number;          // Toplam sipariÅŸ miktarÄ±
      deliveredQty: number;      // Teslim edilen miktar
      remainingQty: number;      // Kalan miktar
      unitPrice: number;
      lineTotal: number;
      warehouseStocks?: {
        merkez: number;
        topca: number;
      };
      stockStatus?: {
        code: 'full' | 'partial' | 'none';
        label: string;
        color: 'green' | 'yellow' | 'red';
        totalStock: number;
      };
      estimatedStockEntryDate?: Date | string | null;
    }>;
    totalAmount: number;
    totalVAT: number;
    grandTotal: number;
  }>;
  totalOrdersAmount: number;
}

const fixMojibakeText = (value: unknown): string => {
  let text = String(value ?? '');
  const replacements: Array<[RegExp, string]> = [
    [/Ä±/g, 'ı'],
    [/Ä°/g, 'İ'],
    [/ÅŸ/g, 'ş'],
    [/Åž/g, 'Ş'],
    [/ÄŸ/g, 'ğ'],
    [/Äž/g, 'Ğ'],
    [/Ã¼/g, 'ü'],
    [/Ãœ/g, 'Ü'],
    [/Ã¶/g, 'ö'],
    [/Ã–/g, 'Ö'],
    [/Ã§/g, 'ç'],
    [/Ã‡/g, 'Ç'],
    [/âœ“/g, '✓'],
    [/Â©/g, '©'],
    [/â„¹ï¸/g, 'Bilgi:'],
    [/ğŸ“‹/g, ''],
    [/ğŸ“¦/g, ''],
  ];

  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }

  return text;
};

const escapeHtml = (value: unknown): string =>
  fixMojibakeText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

type MarginSummaryBucket = {
  totalRecords: number;
  totalDocuments: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  entryProfit: number;
  avgMargin: number;
  negativeLines: number;
  negativeDocuments: number;
  entryNegativeLines: number;
  entryNegativeDocuments: number;
  currentDataMissingLines: number;
  entryDataMissingLines: number;
};

type MarginAlertRow = {
  documentNo: string;
  documentType: string;
  customerCode: string;
  customerName: string;
  productCode: string;
  productName: string;
  quantity: number;
  unit: string;
  quantityLabel: string;
  unitPrice: number;
  unitCost: number;
  unitCostEntry: number;
  revenue: number;
  revenueNet: number;
  revenueGross: number;
  profit: number;
  entryProfit: number;
  avgMargin: number;
  currentMarkup: number;
  entryMargin: number;
  entrySourceMargin: number | null;
  currentDataAvailable: boolean;
  entryDataAvailable: boolean;
  sectorCode: string;
};

type MarginAlertSet = {
  negative: MarginAlertRow[];
  low: MarginAlertRow[];
  high: MarginAlertRow[];
  missing: MarginAlertRow[];
};

type MarginAlertSummary = {
  current: MarginAlertSet;
  entry: MarginAlertSet;
};

type MarginAlertGroups = {
  order: MarginAlertSummary;
  sales: MarginAlertSummary;
};

type MarginAggregateRow = {
  key: string;
  name: string;
  revenue: number;
  cost: number;
  profit: number;
  entryProfit: number;
  avgMargin: number;
  entryMargin: number;
  count: number;
};

type MarginTopBottom = {
  top: MarginAggregateRow[];
  bottom: MarginAggregateRow[];
};

type MarginTopBottomGroup = {
  products: MarginTopBottom;
  customers: MarginTopBottom;
  salespeople: MarginTopBottom;
};

type MarginTopBottomSummary = {
  orders: MarginTopBottomGroup;
  sales: MarginTopBottomGroup;
};

type MarginSevenDaySummary = {
  startDate: Date;
  endDate: Date;
  overall: MarginSummaryBucket;
  orders: MarginSummaryBucket;
  sales: MarginSummaryBucket;
  days: Array<{
    date: Date;
    status: 'SUCCESS' | 'FAILED' | 'MISSING';
    overall: MarginSummaryBucket | null;
    quality: Record<string, any> | null;
  }>;
};

type MarginComplianceEmailSummary = {
  totalRecords: number;
  totalDocuments: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  entryProfit: number;
  avgMargin: number;
  highMarginCount: number;
  lowMarginCount: number;
  negativeMarginCount: number;
  orderSummary: MarginSummaryBucket;
  salesSummary: MarginSummaryBucket;
  salespersonSummary: Array<{
    sectorCode: string;
    orderSummary: MarginSummaryBucket;
    salesSummary: MarginSummaryBucket;
  }>;
  alerts: MarginAlertGroups;
  topBottom: MarginTopBottomSummary;
  sevenDaySummary: MarginSevenDaySummary;
  thresholds: { low: number; high: number; worstLimit: number };
  previousDay: { status: 'SUCCESS' | 'FAILED' | 'MISSING'; summary: any | null };
  dayQuality: Record<string, any> | null;
  priorDayRefreshQuality: Record<string, any> | null;
  salespersonNamesBySector: Record<string, string[]>;
  violationStatsBySector: Record<string, { open: number; resolvedOnReportDate: number }>;
  productRepeatCounts: Record<string, number>;
  // Rapor sayfasindan yonetilen aktif marka/urun dislama kurali sayisi.
  activeExclusionCount?: number;
};

type MarginReportEmailParams = {
  recipients: string[];
  reportDate: Date;
  summary: MarginComplianceEmailSummary;
  subject?: string;
  attachment?: { name: string; content: string };
};

class EmailService {
  private apiInstance: brevo.TransactionalEmailsApi;
  private senderEmail: string;
  private senderName: string;

  constructor() {
    // Brevo API client oluÅŸtur
    this.apiInstance = new brevo.TransactionalEmailsApi();
    this.apiInstance.setApiKey(
      brevo.TransactionalEmailsApiApiKeys.apiKey,
      process.env.BREVO_API_KEY || ''
    );
    this.senderEmail = process.env.BREVO_SENDER_EMAIL || 'noreply@bakircilar.com';
    this.senderName = process.env.BREVO_SENDER_NAME || 'Bakırcılar B2B';
  }

  /**
   * TÃ¼m mÃ¼ÅŸterilere bekleyen sipariÅŸlerini mail ile gÃ¶nder (DEPRECATED - use sendPendingOrdersToCustomers)
   */
  async sendPendingOrdersToAllCustomers(): Promise<{
    success: boolean;
    sentCount: number;
    failedCount: number;
    message: string;
  }> {
    try {
      console.log('ğŸ“§ Mail gÃ¶nderimi baÅŸladÄ±...');

      // 1. Mail gÃ¶nderilecek mÃ¼ÅŸterileri bul
      const customers = await this.getCustomersWithPendingOrders();
      console.log(`âœ… ${customers.length} mÃ¼ÅŸteri bulundu`);

      let sentCount = 0;
      let failedCount = 0;

      // 2. Her mÃ¼ÅŸteriye mail gÃ¶nder
      for (const customer of customers) {
        try {
          await this.sendOrderEmail(customer, 'Bekleyen Siparişleriniz');
          sentCount++;

          // GÃ¶nderildi olarak iÅŸaretle
          await prisma.pendingMikroOrder.updateMany({
            where: { customerCode: customer.customerCode },
            data: {
              emailSent: true,
              emailSentAt: new Date(),
            },
          });
        } catch (error: any) {
          console.error(`âŒ Mail gÃ¶nderilemedi (${customer.customerEmail}):`, error.message);
          failedCount++;

          // Hata log'a
          await prisma.emailLog.create({
            data: {
              recipientEmail: customer.customerEmail,
              recipientName: customer.customerName,
              customerCode: customer.customerCode,
              subject: 'Bekleyen Siparişleriniz',
              ordersCount: customer.orders.length,
              totalAmount: customer.totalOrdersAmount,
              success: false,
              errorMessage: error.message,
            },
          });
        }
      }

      // 3. Settings'e son mail gÃ¶nderim zamanÄ±nÄ± kaydet
      const settings = await prisma.orderTrackingSettings.findFirst();
      if (settings) {
        await prisma.orderTrackingSettings.update({
          where: { id: settings.id },
          data: { lastEmailSentAt: new Date() },
        });
      }

      console.log(`âœ… Mail gÃ¶nderimi tamamlandÄ±: ${sentCount} baÅŸarÄ±lÄ±, ${failedCount} baÅŸarÄ±sÄ±z`);

      return {
        success: true,
        sentCount,
        failedCount,
        message: `${sentCount} baÅŸarÄ±lÄ±, ${failedCount} baÅŸarÄ±sÄ±z`,
      };
    } catch (error: any) {
      console.error('âŒ Toplu mail gÃ¶nderimi hatasÄ±:', error);
      return {
        success: false,
        sentCount: 0,
        failedCount: 0,
        message: error.message || 'Bilinmeyen hata',
      };
    }
  }

  /**
   * Tek bir mÃ¼ÅŸteriye mail gÃ¶nder
   */
  async sendOrderEmail(data: OrderEmailData, subject?: string): Promise<void> {
    const emailSubject = fixMojibakeText(subject || 'Bekleyen Siparişleriniz');
    const htmlContent = this.generateEmailHTML(data);

    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.sender = { email: this.senderEmail, name: fixMojibakeText(this.senderName) };
    sendSmtpEmail.to = [{ email: data.customerEmail, name: fixMojibakeText(data.customerName) }];
    sendSmtpEmail.subject = emailSubject;
    sendSmtpEmail.htmlContent = htmlContent;
    sendSmtpEmail.headers = {
      'Content-Type': 'text/html; charset=UTF-8',
    };

    const response = await this.apiInstance.sendTransacEmail(sendSmtpEmail);

    // Log'a kaydet
    await prisma.emailLog.create({
      data: {
        recipientEmail: data.customerEmail,
        recipientName: data.customerName,
        customerCode: data.customerCode,
        subject: emailSubject,
        ordersCount: data.orders.length,
        totalAmount: data.totalOrdersAmount,
        success: true,
        brevoMessageId: (response as any).body?.messageId || null,
      },
    });
  }

  private async enrichOrdersForCustomerEmail<T extends { items: any }>(orders: T[]): Promise<T[]> {
    if (!orders.length) {
      return orders;
    }

    const normalizedOrders = orders.map((order) => ({
      ...order,
      items: Array.isArray(order.items) ? order.items : [],
    }));

    return orderTrackingService.enrichOrdersWithWarehouseAvailability(normalizedOrders as any) as Promise<T[]>;
  }

  /**
   * Mail gÃ¶nderilecek mÃ¼ÅŸterileri ve sipariÅŸlerini getir
   */
  private async getCustomersWithPendingOrders(): Promise<OrderEmailData[]> {
    // 1. Bekleyen sipariÅŸleri Ã§ek
    const rawOrders = await prisma.pendingMikroOrder.findMany({
      where: { emailSent: false },
      orderBy: { orderDate: 'desc' },
    });
    const orders = await this.enrichOrdersForCustomerEmail(rawOrders as any[]);

    // 2. MÃ¼ÅŸteri bazÄ±nda grupla
    const customerMap = new Map<string, OrderEmailData>();

    for (const order of orders) {
      if (!customerMap.has(order.customerCode)) {
        // Email adresini belirle: Ã–nce order'daki email, yoksa User tablosundan
        let customerEmail = order.customerEmail;

        if (!customerEmail) {
          const user = await prisma.user.findFirst({
            where: { mikroCariCode: order.customerCode },
          });
          customerEmail = user?.email || null;
        }

        if (!customerEmail) {
          console.warn(`âš ï¸ MÃ¼ÅŸteri email bulunamadÄ±: ${order.customerCode}`);
          continue;
        }

        customerMap.set(order.customerCode, {
          customerCode: order.customerCode,
          customerName: order.customerName,
          customerEmail: customerEmail,
          orders: [],
          totalOrdersAmount: 0,
        });
      }

      const customer = customerMap.get(order.customerCode)!;
      customer.orders.push({
        mikroOrderNumber: order.mikroOrderNumber,
        orderDate: order.orderDate,
        deliveryDate: order.deliveryDate,
        items: order.items as any,
        totalAmount: order.totalAmount,
        totalVAT: order.totalVAT,
        grandTotal: order.grandTotal,
      });
      customer.totalOrdersAmount += order.grandTotal;
    }

    return Array.from(customerMap.values());
  }

  /**
   * Email HTML template oluÅŸtur
   */
  private generateEmailHTML(data: OrderEmailData): string {
    type EmailItem = OrderEmailData['orders'][number]['items'][number];
    type EmailStockStatus = NonNullable<EmailItem['stockStatus']>;

    const formatCurrency = (value: number) => {
      return new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: 'TRY',
        minimumFractionDigits: 2,
      }).format(Number(value) || 0);
    };

    const formatDate = (date: Date | string | null | undefined) => {
      if (!date) return '-';
      const parsedDate = new Date(date);
      if (Number.isNaN(parsedDate.getTime()) || parsedDate.getFullYear() < 2000) return '-';

      return new Intl.DateTimeFormat('tr-TR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(parsedDate);
    };

    const statusLabelByCode: Record<EmailStockStatus['code'], string> = {
      full: 'Stok var',
      partial: 'Kısmi stok mevcut',
      none: 'Stok yok',
    };

    const statusColorByCode: Record<EmailStockStatus['code'], EmailStockStatus['color']> = {
      full: 'green',
      partial: 'yellow',
      none: 'red',
    };

    const statusStyleByCode: Record<EmailStockStatus['code'], string> = {
      full: 'display: inline-block; min-width: 92px; text-align: center; background: #dcfce7; color: #166534; border: 1px solid #86efac; padding: 4px 8px; border-radius: 999px; font-weight: 700; font-size: 12px;',
      partial: 'display: inline-block; min-width: 120px; text-align: center; background: #fef9c3; color: #854d0e; border: 1px solid #fde68a; padding: 4px 8px; border-radius: 999px; font-weight: 700; font-size: 12px;',
      none: 'display: inline-block; min-width: 92px; text-align: center; background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; padding: 4px 8px; border-radius: 999px; font-weight: 700; font-size: 12px;',
    };

    const isValidStatusCode = (code: unknown): code is EmailStockStatus['code'] =>
      code === 'full' || code === 'partial' || code === 'none';

    const resolveItemStockStatus = (item: EmailItem): EmailStockStatus | null => {
      if (isValidStatusCode(item.stockStatus?.code)) {
        return {
          code: item.stockStatus.code,
          label: statusLabelByCode[item.stockStatus.code],
          color: statusColorByCode[item.stockStatus.code],
          totalStock: Number(item.stockStatus.totalStock) || 0,
        };
      }

      if (!item.warehouseStocks) {
        return null;
      }

      const merkez = Math.max(Number(item.warehouseStocks.merkez) || 0, 0);
      const topca = Math.max(Number(item.warehouseStocks.topca) || 0, 0);
      const totalStock = merkez + topca;
      const remainingQty = Math.max(Number(item.remainingQty) || 0, 0);
      const code: EmailStockStatus['code'] =
        remainingQty <= 0 || totalStock >= remainingQty
          ? 'full'
          : totalStock > 0
            ? 'partial'
            : 'none';

      return {
        code,
        label: statusLabelByCode[code],
        color: statusColorByCode[code],
        totalStock,
      };
    };

    let ordersHTML = '';

    for (const order of data.orders) {
      const orderItems = Array.isArray(order.items) ? order.items : [];
      const orderHasStockStatus = orderItems.some((item) => Boolean(resolveItemStockStatus(item)));
      const orderNeedsEtaColumn = orderHasStockStatus
        && orderItems.some((item) => {
          const status = resolveItemStockStatus(item);
          return Boolean(status && status.code !== 'full');
        });

      let itemsHTML = '';
      for (const item of orderItems) {
        const isFullyDelivered = Number(item.remainingQty) === 0;
        const status = resolveItemStockStatus(item);

        const rowStyle = isFullyDelivered
          ? 'padding: 8px; border-bottom: 1px solid #eee; background-color: #f3f4f6; opacity: 0.7;'
          : 'padding: 8px; border-bottom: 1px solid #eee;';

        const productNameStyle = isFullyDelivered
          ? 'text-decoration: line-through; color: #6b7280;'
          : '';

        const deliveryBadge = isFullyDelivered
          ? '<span style="display: inline-block; background-color: #d1fae5; color: #065f46; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-left: 8px;">TESLİM EDİLDİ</span>'
          : '';

        const stockStatusCell = orderHasStockStatus
          ? `
            <td style="${rowStyle} text-align: center; white-space: nowrap;">
              ${status
                ? `<span style="${statusStyleByCode[status.code]}">${escapeHtml(status.label)}</span>`
                : '-'
              }
            </td>
          `
          : '';

        const etaCell = orderNeedsEtaColumn
          ? `
            <td style="${rowStyle} text-align: center; white-space: nowrap;">
              ${status && status.code !== 'full' ? formatDate(item.estimatedStockEntryDate) : '-'}
            </td>
          `
          : '';

        itemsHTML += `
          <tr>
            <td style="${rowStyle}">
              <span style="${productNameStyle}">${escapeHtml(item.productName)}</span>${deliveryBadge}
            </td>
            <td style="${rowStyle} text-align: center; white-space: nowrap;">
              ${isFullyDelivered
                ? `<span style="color: #6b7280;">${Number(item.quantity) || 0} ${escapeHtml(item.unit)}</span>`
                : `${Number(item.remainingQty) || 0} ${escapeHtml(item.unit)}`
              }
            </td>
            <td style="${rowStyle} text-align: right; white-space: nowrap;">${formatCurrency(item.unitPrice)}</td>
            <td style="${rowStyle} text-align: right; white-space: nowrap;">${formatCurrency(item.lineTotal)}</td>
            ${stockStatusCell}
            ${etaCell}
          </tr>
        `;
      }

      ordersHTML += `
        <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h3 style="color: #2563eb; margin-top: 0;">Sipariş No: ${escapeHtml(order.mikroOrderNumber)}</h3>
          <p style="margin: 8px 0; color: #666;">
            <strong>Sipariş Tarihi:</strong> ${formatDate(order.orderDate)}<br>
            <strong>Planlanan Teslimat:</strong> ${formatDate(order.deliveryDate)}
          </p>

          <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <thead>
              <tr style="background: #f3f4f6;">
                <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Ürün</th>
                <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Kalan Miktar</th>
                <th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd;">Birim Fiyat</th>
                <th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd;">Kalan Tutar</th>
                ${orderHasStockStatus ? '<th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Stok Durumu</th>' : ''}
                ${orderNeedsEtaColumn ? '<th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Tahmini Stok Giriş Tarihi</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${itemsHTML}
            </tbody>
          </table>

          <div style="text-align: right; padding-top: 15px; border-top: 2px solid #ddd; margin-top: 15px;">
            <p style="margin: 5px 0;"><strong>Ara Toplam:</strong> ${formatCurrency(order.totalAmount)}</p>
            <p style="margin: 5px 0;"><strong>KDV:</strong> ${formatCurrency(order.totalVAT)}</p>
            <p style="margin: 5px 0; font-size: 18px; color: #2563eb;"><strong>GENEL TOPLAM:</strong> ${formatCurrency(order.grandTotal)}</p>
          </div>
        </div>
      `;
    }

    const frontendUrl = escapeHtml(process.env.FRONTEND_URL || 'https://www.bakircilarkampanya.com');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
        <div style="max-width: 960px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">Bakırcılar Ambalaj Sipariş Bakiyesi</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Sayın ${escapeHtml(data.customerName)},</p>
          </div>

          <div style="background: #f9fafb; padding: 20px;">
            <p style="color: #374151; font-size: 16px; line-height: 1.6;">
              Aşağıda bekleyen sipariş bakiyelerinizi bulabilirsiniz:
            </p>

            ${ordersHTML}

            <div style="background: white; border-radius: 8px; padding: 20px; margin-top: 20px; text-align: center; border: 2px dashed #2563eb;">
              <p style="margin: 0; font-size: 20px; color: #2563eb;"><strong>TOPLAM BAKİYE</strong></p>
              <p style="margin: 10px 0 0 0; font-size: 32px; color: #1e40af; font-weight: bold;">${formatCurrency(data.totalOrdersAmount)}</p>
            </div>

            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin-top: 20px; border-radius: 4px;">
              <p style="margin: 0; color: #92400e; font-size: 14px;">
                Bilgi: Sipariş detayları ve güncel durumunuz için <a href="${frontendUrl}" style="color: #2563eb; text-decoration: none;"><strong>B2B Portalımızı</strong></a> ziyaret edebilirsiniz.
              </p>
            </div>
          </div>

          <div style="background: #374151; color: white; padding: 20px; border-radius: 0 0 8px 8px; text-align: center;">
            <p style="margin: 0; font-size: 14px; opacity: 0.8;">
              Sorularınız için: <a href="mailto:info@bakircilarambalaj.com" style="color: white; text-decoration: none;">info@bakircilarambalaj.com</a>
            </p>
            <p style="margin: 10px 0 0 0; font-size: 12px; opacity: 0.6;">
              © ${new Date().getFullYear()} Bakırcılar Ambalaj. Tüm hakları saklıdır.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Belirli bir mÃ¼ÅŸteriye bekleyen sipariÅŸlerini mail ile gÃ¶nder
   * @param customerCode MÃ¼ÅŸteri kodu
   * @param emailOverride Opsiyonel email override (tek seferlik farklÄ± bir adrese gÃ¶nder)
   */
  async sendPendingOrdersToCustomer(
    customerCode: string,
    emailOverride?: string
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      console.log(`Mail gonderimi basladi: ${customerCode}${emailOverride ? ` (override: ${emailOverride})` : ''}`);

      const settings = await prisma.orderTrackingSettings.findFirst();
      const customerSubject = fixMojibakeText(settings?.customerEmailSubject || 'Bekleyen Siparişleriniz');
      const supplierSubject = fixMojibakeText(settings?.supplierEmailSubject || 'Bekleyen Tedarikçi Siparişleri');

      const rawOrders = await prisma.pendingMikroOrder.findMany({
        where: { customerCode },
        orderBy: { orderDate: 'desc' },
      });
      const orders = await this.enrichOrdersForCustomerEmail(rawOrders as any[]);

      let customerName = orders[0]?.customerName || customerCode;
      let sourceEmail = orders[0]?.customerEmail || '';
      let subject = customerSubject;
      let shouldMarkPendingAsSent = false;
      let uniqueOrders: OrderEmailData['orders'] = [];

      if (orders.length > 0) {
        const uniqueOrdersMap = new Map<string, any>();
        for (const order of orders) {
          if (!uniqueOrdersMap.has(order.mikroOrderNumber)) {
            uniqueOrdersMap.set(order.mikroOrderNumber, {
              mikroOrderNumber: order.mikroOrderNumber,
              orderDate: order.orderDate,
              deliveryDate: order.deliveryDate,
              items: order.items as any,
              totalAmount: order.totalAmount,
              totalVAT: order.totalVAT,
              grandTotal: order.grandTotal,
            });
          } else {
            console.warn(`Duplicate order removed from email: ${order.mikroOrderNumber} for customer ${customerCode}`);
          }
        }

        uniqueOrders = Array.from(uniqueOrdersMap.values());
        shouldMarkPendingAsSent = true;
      } else {
        const supplierSummary = await orderTrackingService.getSupplierSummary();
        const supplier = supplierSummary.find((item) => item.customerCode === customerCode);

        if (supplier && Array.isArray(supplier.orders) && supplier.orders.length > 0) {
          customerName = supplier.customerName || customerCode;
          sourceEmail = supplier.customerEmail || sourceEmail;
          subject = supplierSubject;

          uniqueOrders = supplier.orders
            .filter((order: any) => order?.mikroOrderNumber)
            .map((order: any) => {
              const items = Array.isArray(order.items) ? order.items : [];
              const totalAmount =
                Number(order.totalAmount) ||
                items.reduce((sum: number, item: any) => sum + (Number(item?.lineTotal) || 0), 0);
              const totalVAT =
                Number(order.totalVAT) ||
                items.reduce((sum: number, item: any) => sum + (Number(item?.vat) || 0), 0);
              const grandTotal = Number(order.grandTotal) || totalAmount + totalVAT;

              return {
                mikroOrderNumber: String(order.mikroOrderNumber),
                orderDate: order.orderDate ? new Date(order.orderDate) : new Date(),
                deliveryDate: order.deliveryDate ? new Date(order.deliveryDate) : null,
                items,
                totalAmount,
                totalVAT,
                grandTotal,
              };
            });
        }
      }

      if (uniqueOrders.length === 0) {
        return {
          success: false,
          message: 'Bu musterinin bekleyen siparisi yok',
        };
      }

      let targetEmail = emailOverride || '';
      if (!targetEmail) {
        targetEmail = sourceEmail || '';

        if (!targetEmail) {
          const user = await prisma.user.findFirst({
            where: { mikroCariCode: customerCode },
            select: { email: true },
          });
          targetEmail = user?.email || '';
        }

        if (!targetEmail) {
          return {
            success: false,
            message: 'Musteri email adresi bulunamadi (ne Mikro CARI\'da ne de User tablosunda)',
          };
        }
      }

      const customerData: OrderEmailData = {
        customerCode,
        customerName,
        customerEmail: targetEmail,
        orders: uniqueOrders,
        totalOrdersAmount: uniqueOrders.reduce((sum, o) => sum + o.grandTotal, 0),
      };

      await this.sendOrderEmail(customerData, subject);

      if (!emailOverride && shouldMarkPendingAsSent) {
        await prisma.pendingMikroOrder.updateMany({
          where: { customerCode },
          data: {
            emailSent: true,
            emailSentAt: new Date(),
          },
        });
      }

      console.log(`Mail gonderildi: ${targetEmail}`);

      return {
        success: true,
        message: `${targetEmail} adresine ${uniqueOrders.length} siparis bilgisi gonderildi`,
      };
    } catch (error: any) {
      console.error(`Mail gonderilemedi (${customerCode}):`, error.message);
      return {
        success: false,
        message: error.message || 'Bilinmeyen hata',
      };
    }
  }

  /**
   * Test email gÃ¶nder (development iÃ§in)
   */
  async sendTestEmail(toEmail: string): Promise<void> {
    const testData: OrderEmailData = {
      customerCode: 'TEST001',
      customerName: 'Test Müşteri',
      customerEmail: toEmail,
      orders: [
        {
          mikroOrderNumber: 'TEST-001',
          orderDate: new Date(),
          deliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          items: [
            {
              productName: 'Test Ürün 1 (Kısmi Teslim)',
              unit: 'ADET',
              quantity: 20,
              deliveredQty: 10,
              remainingQty: 10,
              unitPrice: 100,
              lineTotal: 1000,
            },
            {
              productName: 'Test Ürün 2 (Bekliyor)',
              unit: 'KG',
              quantity: 5,
              deliveredQty: 0,
              remainingQty: 5,
              unitPrice: 200,
              lineTotal: 1000,
            },
            {
              productName: 'Test Ürün 3 (Teslim Edildi)',
              unit: 'ADET',
              quantity: 15,
              deliveredQty: 15,
              remainingQty: 0,
              unitPrice: 50,
              lineTotal: 0,
            },
          ],
          totalAmount: 2000,
          totalVAT: 360,
          grandTotal: 2360,
        },
      ],
      totalOrdersAmount: 2360,
    };

    await this.sendOrderEmail(testData);
  }

  /**
   * Sadece mÃ¼ÅŸterilere (SATICI olmayanlar) bekleyen sipariÅŸlerini mail ile gÃ¶nder
   */
  async sendPendingOrdersToCustomers(): Promise<{
    success: boolean;
    sentCount: number;
    failedCount: number;
    message: string;
  }> {
    try {
      console.log('ğŸ“§ MÃ¼ÅŸterilere mail gÃ¶nderimi baÅŸladÄ±...');

      // AyarlarÄ± al
      const settings = await prisma.orderTrackingSettings.findFirst();
      const emailSubject = fixMojibakeText(settings?.customerEmailSubject || 'Bekleyen Siparişleriniz');

      // 1. MÃ¼ÅŸterilerin bekleyen sipariÅŸlerini al (SATICI olmayanlar)
      const rawOrders = await prisma.pendingMikroOrder.findMany({
        where: {
          emailSent: false,
          OR: [
            { sectorCode: null },
            {
              NOT: {
                sectorCode: {
                  startsWith: 'SATICI',
                },
              },
            },
          ],
        },
        orderBy: { orderDate: 'desc' },
      });
      const orders = await this.enrichOrdersForCustomerEmail(rawOrders as any[]);

      console.log(`âœ… ${orders.length} mÃ¼ÅŸteri sipariÅŸi bulundu`);

      // 2. MÃ¼ÅŸteri bazÄ±nda grupla
      const customerMap = await this.groupOrdersByCustomer(orders);
      const customers = Array.from(customerMap.values());

      let sentCount = 0;
      let failedCount = 0;

      // 3. Her mÃ¼ÅŸteriye mail gÃ¶nder
      for (const customer of customers) {
        try {
          await this.sendOrderEmail(customer, emailSubject);
          sentCount++;

          // GÃ¶nderildi olarak iÅŸaretle
          await prisma.pendingMikroOrder.updateMany({
            where: { customerCode: customer.customerCode },
            data: {
              emailSent: true,
              emailSentAt: new Date(),
            },
          });
        } catch (error: any) {
          console.error(`âŒ MÃ¼ÅŸteriye mail gÃ¶nderilemedi (${customer.customerEmail}):`, error.message);
          failedCount++;

          await prisma.emailLog.create({
            data: {
              recipientEmail: customer.customerEmail,
              recipientName: customer.customerName,
              customerCode: customer.customerCode,
              subject: emailSubject,
              ordersCount: customer.orders.length,
              totalAmount: customer.totalOrdersAmount,
              success: false,
              errorMessage: error.message,
            },
          });
        }
      }

      // 4. Son mail gÃ¶nderim zamanÄ±nÄ± kaydet
      if (settings) {
        await prisma.orderTrackingSettings.update({
          where: { id: settings.id },
          data: { lastCustomerEmailSentAt: new Date() },
        });
      }

      console.log(`âœ… MÃ¼ÅŸterilere mail gÃ¶nderimi tamamlandÄ±: ${sentCount} baÅŸarÄ±lÄ±, ${failedCount} baÅŸarÄ±sÄ±z`);

      return {
        success: true,
        sentCount,
        failedCount,
        message: `${sentCount} baÅŸarÄ±lÄ±, ${failedCount} baÅŸarÄ±sÄ±z`,
      };
    } catch (error: any) {
      console.error('âŒ MÃ¼ÅŸterilere toplu mail gÃ¶nderimi hatasÄ±:', error);
      return {
        success: false,
        sentCount: 0,
        failedCount: 0,
        message: error.message || 'Bilinmeyen hata',
      };
    }
  }

  /**
   * Sadece tedarikÃ§ilere (SATICI sektÃ¶r kodlu) bekleyen sipariÅŸlerini mail ile gÃ¶nder
   */
  async sendPendingOrdersToSuppliers(): Promise<{
    success: boolean;
    sentCount: number;
    failedCount: number;
    message: string;
  }> {
    try {
      console.log('Tedarikcilere mail gonderimi basladi...');

      const settings = await prisma.orderTrackingSettings.findFirst();
      const emailSubject = fixMojibakeText(settings?.supplierEmailSubject || 'Bekleyen Tedarikçi Siparişleri');
      const supplierSummaries = await orderTrackingService.getSupplierSummary();

      console.log(`${supplierSummaries.length} tedarikci kaydi bulundu`);

      let sentCount = 0;
      let failedCount = 0;

      for (const supplier of supplierSummaries) {
        let recipientEmail = String(supplier.customerEmail || '').trim();

        try {
          if (!Array.isArray(supplier.orders) || supplier.orders.length === 0) {
            continue;
          }

          if (!recipientEmail) {
            const user = await prisma.user.findFirst({
              where: { mikroCariCode: supplier.customerCode },
              select: { email: true },
            });
            recipientEmail = String(user?.email || '').trim();
          }

          if (!recipientEmail) {
            console.warn(`Tedarikci email bulunamadi: ${supplier.customerCode}`);
            continue;
          }

          const normalizedOrders = supplier.orders
            .filter((order: any) => order?.mikroOrderNumber)
            .map((order: any) => {
              const items = Array.isArray(order.items) ? order.items : [];
              const totalAmount =
                Number(order.totalAmount) ||
                items.reduce((sum: number, item: any) => sum + (Number(item?.lineTotal) || 0), 0);
              const totalVAT =
                Number(order.totalVAT) ||
                items.reduce((sum: number, item: any) => sum + (Number(item?.vat) || 0), 0);
              const grandTotal = Number(order.grandTotal) || totalAmount + totalVAT;

              return {
                mikroOrderNumber: String(order.mikroOrderNumber),
                orderDate: order.orderDate ? new Date(order.orderDate) : new Date(),
                deliveryDate: order.deliveryDate ? new Date(order.deliveryDate) : null,
                items,
                totalAmount,
                totalVAT,
                grandTotal,
              };
            });

          if (normalizedOrders.length === 0) {
            continue;
          }

          const supplierEmailData: OrderEmailData = {
            customerCode: supplier.customerCode,
            customerName: supplier.customerName || supplier.customerCode,
            customerEmail: recipientEmail,
            orders: normalizedOrders,
            totalOrdersAmount: normalizedOrders.reduce((sum, order) => sum + order.grandTotal, 0),
          };

          await this.sendOrderEmail(supplierEmailData, emailSubject);
          sentCount++;
        } catch (error: any) {
          console.error(`Tedarikciye mail gonderilemedi (${supplier.customerCode}):`, error.message);
          failedCount++;

          await prisma.emailLog.create({
            data: {
              recipientEmail,
              recipientName: supplier.customerName,
              customerCode: supplier.customerCode,
              subject: emailSubject,
              ordersCount: Array.isArray(supplier.orders) ? supplier.orders.length : 0,
              totalAmount: Number(supplier.totalAmount) || 0,
              success: false,
              errorMessage: error.message,
            },
          });
        }
      }

      if (settings) {
        await prisma.orderTrackingSettings.update({
          where: { id: settings.id },
          data: { lastSupplierEmailSentAt: new Date() },
        });
      }

      console.log(`Tedarikcilere mail gonderimi tamamlandi: ${sentCount} basarili, ${failedCount} basarisiz`);

      return {
        success: true,
        sentCount,
        failedCount,
        message: `${sentCount} basarili, ${failedCount} basarisiz`,
      };
    } catch (error: any) {
      console.error('Tedarikcilere toplu mail gonderimi hatasi:', error);
      return {
        success: false,
        sentCount: 0,
        failedCount: 0,
        message: error.message || 'Bilinmeyen hata',
      };
    }
  }

  /**
   * SipariÅŸleri mÃ¼ÅŸteri/tedarikÃ§i bazÄ±nda grupla (helper metod)
   */
  private async groupOrdersByCustomer(orders: any[]): Promise<Map<string, OrderEmailData>> {
    const customerMap = new Map<string, OrderEmailData>();

    for (const order of orders) {
      if (!customerMap.has(order.customerCode)) {
        // Email adresini belirle
        let customerEmail = order.customerEmail;

        if (!customerEmail) {
          const user = await prisma.user.findFirst({
            where: { mikroCariCode: order.customerCode },
          });
          customerEmail = user?.email || null;
        }

        if (!customerEmail) {
          console.warn(`âš ï¸ Email bulunamadÄ±: ${order.customerCode}`);
          continue;
        }

        customerMap.set(order.customerCode, {
          customerCode: order.customerCode,
          customerName: order.customerName,
          customerEmail: customerEmail,
          orders: [],
          totalOrdersAmount: 0,
        });
      }

      const customer = customerMap.get(order.customerCode)!;
      customer.orders.push({
        mikroOrderNumber: order.mikroOrderNumber,
        orderDate: order.orderDate,
        deliveryDate: order.deliveryDate,
        items: order.items as any,
        totalAmount: order.totalAmount,
        totalVAT: order.totalVAT,
        grandTotal: order.grandTotal,
      });
      customer.totalOrdersAmount += order.grandTotal;
    }

    return customerMap;
  }

  async sendMarginComplianceReportSummary(params: MarginReportEmailParams): Promise<void> {
    const recipients = (params.recipients || []).map((email) => String(email || '').trim()).filter(Boolean);
    if (!recipients.length) return;

    const summary = params.summary;
    const thresholds = summary.thresholds || { low: 5, high: 70, worstLimit: 15 };
    const formatMoney = (value: number, digits = 0) => new Intl.NumberFormat('tr-TR', {
      style: 'currency', currency: 'TRY', minimumFractionDigits: digits, maximumFractionDigits: digits,
    }).format(Number(value) || 0);
    const formatPercent = (value: number) => `%${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(value) || 0)}`;
    const formatCount = (value: number) => new Intl.NumberFormat('tr-TR').format(Number(value) || 0);
    const formatDate = (date: Date) => new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(date));
    const formatShortDate = (date: Date) => new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(new Date(date));
    const frontendUrl = (process.env.FRONTEND_URL || 'https://www.bakircilarkampanya.com').replace(/\/$/, '');
    const panelUrl = `${frontendUrl}/reports/margin-compliance`;
    const actionUrl = `${frontendUrl}/margin-violations`;
    const logoUrl = `${frontendUrl}/brand/bakircilar-v2-white.png`;
    const font = 'font-family:Arial,Helvetica,sans-serif;';

    type TaggedRow = MarginAlertRow & { source: string };
    const tag = (rows: MarginAlertRow[], source: string): TaggedRow[] => (rows || []).map((row) => ({ ...row, source }));
    const currentNegative = [...tag(summary.alerts.sales.current.negative, 'Satış'), ...tag(summary.alerts.order.current.negative, 'Sipariş')].sort((a, b) => a.profit - b.profit);
    const entryNegative = [...tag(summary.alerts.sales.entry.negative, 'Satış'), ...tag(summary.alerts.order.entry.negative, 'Sipariş')].sort((a, b) => a.entryProfit - b.entryProfit);
    const lowRows = [...tag(summary.alerts.sales.current.low, 'Satış'), ...tag(summary.alerts.order.current.low, 'Sipariş')];
    const highRows = [...tag(summary.alerts.sales.current.high, 'Satış'), ...tag(summary.alerts.order.current.high, 'Sipariş')].sort((a, b) => b.avgMargin - a.avgMargin);
    const missingEntryRows = [...tag(summary.alerts.sales.entry.missing, 'Satış'), ...tag(summary.alerts.order.entry.missing, 'Sipariş')];
    const currentLoss = Math.abs(currentNegative.reduce((sum, row) => sum + Math.min(0, row.profit), 0));
    const entryLoss = Math.abs(entryNegative.reduce((sum, row) => sum + Math.min(0, row.entryProfit), 0));
    const cleanDay = currentNegative.length === 0 && entryNegative.length === 0;
    const lossShare = summary.totalProfit !== 0 ? currentLoss / Math.abs(summary.totalProfit) * 100 : null;
    const rowIdentity = (row: MarginAlertRow) => [row.documentNo, row.productCode, row.customerCode, row.quantity].join('|');
    const entryIds = new Set(entryNegative.map(rowIdentity));
    const intersectionCount = currentNegative.filter((row) => entryIds.has(rowIdentity(row))).length;
    const reportMargin = summary.salesSummary.avgMargin;
    const baseSubject = String(params.subject || 'Kar Marji Raporu').trim();
    const subjectState = cleanDay
      ? 'Temiz gun - iki tabanda da maliyet alti yok'
      : `Guncel ${formatCount(currentNegative.length)} / ${formatMoney(currentLoss)} | Son Giris ${formatCount(entryNegative.length)} / ${formatMoney(entryLoss)}`;
    const subject = `${baseSubject} ${formatShortDate(params.reportDate)} | ${subjectState} | Marj ${formatPercent(reportMargin)}`;
    const preheader = cleanDay
      ? `${formatDate(params.reportDate)} temiz gun. Gunluk marj ${formatPercent(reportMargin)}.`
      : `${currentNegative.length} guncel, ${entryNegative.length} son giris maliyet alti satir. Aksiyon merkezini acin.`;

    const delta = (current: number, previous: number | null | undefined, money = false) => {
      if (previous === null || previous === undefined || !Number.isFinite(previous)) return '<span style="color:#94a3b8;">Önceki gün verisi yok</span>';
      if (previous === 0) return '<span style="color:#64748b;">Önceki gün 0</span>';
      const pct = ((current - previous) / Math.abs(previous)) * 100;
      const good = money ? current >= previous : current <= previous;
      const color = good ? '#15803d' : '#b91c1c';
      return `<span style="color:${color};">${pct >= 0 ? '▲' : '▼'} ${formatPercent(Math.abs(pct))}</span>`;
    };
    const previousSales = summary.previousDay.summary?.salesSummary || null;
    const previousSummary = summary.previousDay.summary;
    const previousCurrentNegative = previousSummary
      ? Number(previousSummary.orderSummary?.negativeLines || 0) + Number(previousSummary.salesSummary?.negativeLines || 0)
      : null;
    const previousEntryNegative = previousSummary
      ? Number(previousSummary.orderSummary?.entryNegativeLines || 0) + Number(previousSummary.salesSummary?.entryNegativeLines || 0)
      : null;

    const repLabel = (sectorCode: string) => {
      const normalized = String(sectorCode || '').trim().toLocaleUpperCase('tr-TR');
      const names = summary.salespersonNamesBySector?.[normalized] || [];
      return names.length ? `${sectorCode || 'TANIMSIZ'} - ${names.join(', ')}` : `${sectorCode || 'TANIMSIZ'} (atanmamış)`;
    };
    const linkForRow = (row: MarginAlertRow, status = 'NEGATIVE') => `${panelUrl}?date=${encodeURIComponent(params.reportDate.toISOString().slice(0, 10))}&search=${encodeURIComponent(row.productCode)}&status=${status}`;
    const repeatBadge = (row: MarginAlertRow) => {
      const count = summary.productRepeatCounts?.[String(row.productCode || '').trim().toLocaleUpperCase('tr-TR')] || 0;
      return count > 1 ? `<span style="display:inline-block;margin-top:4px;padding:2px 6px;border-radius:4px;background:#fee2e2;color:#991b1b;font-size:10px;">Son 7 günde ${count} gün tekrar</span>` : '';
    };
    const alertTable = (rows: TaggedRow[], basis: 'CURRENT' | 'ENTRY', totalCount: number) => {
      if (!rows.length) return '<div style="padding:10px 0;color:#15803d;font-size:13px;">Bu tabanda maliyet altı satır yok.</div>';
      const shown = rows.slice(0, thresholds.worstLimit);
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="responsive-table" style="border-collapse:collapse;font-size:11px;">
        <thead><tr style="background:#f8fafc;color:#64748b;"><th align="left" style="padding:8px 6px;">Ürün / Müşteri</th><th align="left" style="padding:8px 6px;">Sorumlu</th><th align="left" style="padding:8px 6px;">Evrak</th><th align="right" style="padding:8px 6px;">Miktar</th><th align="right" style="padding:8px 6px;">Satış / Maliyet</th><th align="right" style="padding:8px 6px;">Zarar / Marj</th></tr></thead>
        <tbody>${shown.map((row) => {
          const cost = basis === 'CURRENT' ? row.unitCost : row.unitCostEntry;
          const profit = basis === 'CURRENT' ? row.profit : row.entryProfit;
          const margin = basis === 'CURRENT' ? row.avgMargin : row.entryMargin;
          const otherText = basis === 'CURRENT'
            ? `Son giriş: ${formatMoney(row.entryProfit)} / ${formatPercent(row.entryMargin)}`
            : `Güncel: ${formatMoney(row.profit)} / ${formatPercent(row.avgMargin)}`;
          return `<tr style="background:#fff;border-bottom:1px solid #e2e8f0;">
            <td style="padding:9px 6px;"><a href="${linkForRow(row)}" style="color:#15356b;font-weight:700;text-decoration:none;">${escapeHtml(row.productCode)} - ${escapeHtml(row.productName || '-')}</a><div style="color:#64748b;margin-top:2px;">${escapeHtml(row.customerName || '-')}</div>${repeatBadge(row)}</td>
            <td style="padding:9px 6px;color:#334155;">${escapeHtml(repLabel(row.sectorCode))}</td>
            <td style="padding:9px 6px;color:#334155;">${escapeHtml(row.source)}<div style="color:#64748b;">${escapeHtml(row.documentNo || '-')}</div></td>
            <td align="right" style="padding:9px 6px;white-space:nowrap;">${escapeHtml(row.quantityLabel || '-')}</td>
            <td align="right" style="padding:9px 6px;white-space:nowrap;">${formatMoney(row.unitPrice, 2)}<div style="color:#64748b;">Maliyet ${formatMoney(cost, 2)}</div></td>
            <td align="right" style="padding:9px 6px;color:#b91c1c;font-weight:700;white-space:nowrap;">${formatMoney(profit, 2)} / ${formatPercent(margin)}<div style="font-weight:400;color:#64748b;">${otherText}</div></td>
          </tr>`;
        }).join('')}</tbody></table>${totalCount > shown.length ? `<div style="padding-top:7px;color:#64748b;font-size:11px;">${totalCount} satırın ilk ${shown.length} kaydı gösteriliyor. Tam liste Excel ekinde.</div>` : ''}`;
    };

    const aggregateLoss = (rows: TaggedRow[], key: (row: TaggedRow) => string, name: (row: TaggedRow) => string) => {
      const map = new Map<string, { name: string; loss: number; count: number }>();
      rows.forEach((row) => {
        const id = key(row);
        if (!id) return;
        const current = map.get(id) || { name: name(row) || id, loss: 0, count: 0 };
        current.loss += Math.abs(Math.min(row.profit, 0));
        current.count += 1;
        map.set(id, current);
      });
      return Array.from(map.values()).sort((a, b) => b.loss - a.loss).slice(0, 5);
    };
    const topLossProducts = aggregateLoss(currentNegative, (row) => row.productCode, (row) => `${row.productCode} - ${row.productName}`);
    const topLossCustomers = aggregateLoss(currentNegative, (row) => row.customerCode || row.customerName, (row) => row.customerName);
    const lossList = (title: string, rows: Array<{ name: string; loss: number; count: number }>) => `<td class="stack-cell" width="50%" valign="top" style="padding:6px;"><div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;"><div style="font-weight:700;color:#17233d;margin-bottom:8px;">${title}</div>${rows.length ? rows.map((row) => `<div style="padding:6px 0;border-top:1px solid #f1f5f9;"><strong>${escapeHtml(row.name)}</strong><span style="float:right;color:#b91c1c;">${formatMoney(row.loss)} · ${row.count} satır</span></div>`).join('') : '<span style="color:#64748b;">Kayıt yok</span>'}</div></td>`;

    const trendRows = summary.sevenDaySummary.days.map((day) => {
      if (day.status !== 'SUCCESS' || !day.overall) return `<tr><td style="padding:7px;border-bottom:1px solid #e2e8f0;">${formatDate(day.date)}</td><td colspan="4" style="padding:7px;color:#b45309;border-bottom:1px solid #e2e8f0;">${day.status === 'FAILED' ? 'Veri alınamadı' : 'Veri yok'}</td></tr>`;
      return `<tr><td style="padding:7px;border-bottom:1px solid #e2e8f0;">${formatDate(day.date)}</td><td align="right" style="padding:7px;border-bottom:1px solid #e2e8f0;">${formatMoney(day.overall.totalRevenue)}</td><td align="right" style="padding:7px;border-bottom:1px solid #e2e8f0;">${formatMoney(day.overall.totalProfit)}</td><td align="right" style="padding:7px;border-bottom:1px solid #e2e8f0;">${formatPercent(day.overall.avgMargin)}</td><td align="right" style="padding:7px;border-bottom:1px solid #e2e8f0;color:${day.overall.negativeLines ? '#b91c1c' : '#15803d'};font-weight:700;">${day.overall.negativeLines}</td></tr>`;
    }).join('');

    const currentBySector = new Map<string, number>();
    const entryBySector = new Map<string, number>();
    currentNegative.forEach((row) => {
      const key = String(row.sectorCode || '').trim();
      currentBySector.set(key, (currentBySector.get(key) || 0) + 1);
    });
    entryNegative.forEach((row) => {
      const key = String(row.sectorCode || '').trim();
      entryBySector.set(key, (entryBySector.get(key) || 0) + 1);
    });
    const salespersonRows = summary.salespersonSummary.map((entry) => {
      const normalizedSector = String(entry.sectorCode || '').trim().toLocaleUpperCase('tr-TR');
      const violationStats = summary.violationStatsBySector?.[normalizedSector] || { open: 0, resolvedOnReportDate: 0 };
      return `<tr><td style="padding:7px;border-bottom:1px solid #e2e8f0;font-weight:700;">${escapeHtml(repLabel(entry.sectorCode))}</td><td align="right" style="padding:7px;border-bottom:1px solid #e2e8f0;">${formatMoney(entry.salesSummary.totalRevenue)}</td><td align="right" style="padding:7px;border-bottom:1px solid #e2e8f0;">${formatMoney(entry.salesSummary.totalProfit)} / ${formatPercent(entry.salesSummary.avgMargin)}</td><td align="right" style="padding:7px;border-bottom:1px solid #e2e8f0;">${formatMoney(entry.salesSummary.entryProfit)}</td><td align="right" style="padding:7px;border-bottom:1px solid #e2e8f0;color:#b91c1c;font-weight:700;">${currentBySector.get(entry.sectorCode) || 0}</td><td align="right" style="padding:7px;border-bottom:1px solid #e2e8f0;color:#b91c1c;font-weight:700;">${entryBySector.get(entry.sectorCode) || 0}</td><td align="right" style="padding:7px;border-bottom:1px solid #e2e8f0;font-weight:700;">${violationStats.open}</td><td align="right" style="padding:7px;border-bottom:1px solid #e2e8f0;color:#15803d;font-weight:700;">${violationStats.resolvedOnReportDate}</td></tr>`;
    }).join('');

    const quality = summary.dayQuality || {};
    const qualityItems: string[] = [];
    if (Number(quality.invalidDateCount) > 0) qualityItems.push(`${quality.invalidDateCount} satır tarih hatası nedeniyle elendi`);
    if (Number(quality.missingEntryDataCount) > 0) qualityItems.push(`${quality.missingEntryDataCount} satırda son giriş maliyet/kâr verisi eksik`);
    if (Number(quality.missingEntrySourceMarginCount) > 0) qualityItems.push(`${quality.missingEntrySourceMarginCount} satırda Mikro SÖ yüzdesi yok; ortak kâr/ciro hesabı kullanıldı`);
    if (Number(quality.missingCurrentCostCount) > 0) qualityItems.push(`${quality.missingCurrentCostCount} satırda güncel maliyet eksik`);
    if (Number(quality.grossFallbackCount) > 0) qualityItems.push(`${quality.grossFallbackCount} satırda net ciro yok; brüt tutar fallback kullanıldı`);
    if (quality.sectorFilterWarning) qualityItems.push(String(quality.sectorFilterWarning));
    const qualityBox = qualityItems.length ? `<div style="margin:14px 24px;padding:12px 14px;background:#fffbeb;border:1px solid #f59e0b;border-radius:8px;color:#92400e;"><strong>Veri Kalitesi</strong><ul style="margin:6px 0 0 18px;padding:0;">${qualityItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : '';
    const priorRefreshQuality = summary.priorDayRefreshQuality || {};
    const lateItems = Array.isArray(priorRefreshQuality.lateAddedItems) ? priorRefreshQuality.lateAddedItems : [];
    const lateSection = Number(priorRefreshQuality.lateAddedCount) > 0 ? `<div style="margin:14px 24px;padding:12px 14px;background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;color:#1e3a8a;"><strong>Önceki rapora sonradan eklenenler: ${priorRefreshQuality.lateAddedCount}</strong>${lateItems.slice(0, 10).map((item: any) => `<div style="margin-top:5px;">${escapeHtml(item.productCode)} - ${escapeHtml(item.productName)} · ${escapeHtml(item.documentNo || '-')}</div>`).join('')}</div>` : '';

    const statusBand = cleanDay
      ? `<div style="margin:18px 24px;padding:16px;background:#ecfdf5;border-left:5px solid #16a34a;color:#065f46;"><strong>Temiz gün</strong> — iki maliyet tabanında da maliyet altı satır yok.</div>`
      : `<div style="margin:18px 24px;padding:16px;background:#fef2f2;border-left:5px solid #dc2626;color:#7f1d1d;"><strong>Aksiyon gerekli:</strong> Güncel tabanda ${currentNegative.length} satır, ${formatMoney(currentLoss)} kayıp${lossShare === null ? '' : `; rapordaki toplam kârın ${formatPercent(lossShare)}'i`}. Son giriş tabanında ${entryNegative.length} satır, ${formatMoney(entryLoss)} kayıp. <strong>İki taban kesişimi: ${intersectionCount} satır.</strong></div>`;
    const card = (label: string, value: string, sub: string) => `<td class="stack-cell" width="50%" valign="top" style="padding:6px;"><div style="border:1px solid #e2e8f0;border-radius:8px;padding:13px;background:#fff;"><div style="font-size:10px;color:#64748b;text-transform:uppercase;font-weight:700;">${label}</div><div style="font-size:20px;font-weight:800;color:#17233d;margin-top:5px;">${value}</div><div style="font-size:11px;color:#64748b;margin-top:5px;">${sub}</div></div></td>`;
    const cards = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:0 18px;"><tr>${card('Satış Cirosu', formatMoney(summary.salesSummary.totalRevenue), delta(summary.salesSummary.totalRevenue, previousSales?.totalRevenue, true))}${card('Güncel Kâr / Marj', `${formatMoney(summary.salesSummary.totalProfit)} · ${formatPercent(summary.salesSummary.avgMargin)}`, `${delta(summary.salesSummary.totalProfit, previousSales?.totalProfit, true)} · Marj ${delta(summary.salesSummary.avgMargin, previousSales?.avgMargin, true)}`)}</tr><tr>${card('Son Giriş Kârı', formatMoney(summary.salesSummary.entryProfit), previousSales ? delta(summary.salesSummary.entryProfit, previousSales.entryProfit, true) : 'Önceki gün verisi yok')}${card('Maliyet Altı', `Güncel ${currentNegative.length} · SÖ ${entryNegative.length}`, `Güncel ${delta(currentNegative.length, previousCurrentNegative)} · SÖ ${delta(entryNegative.length, previousEntryNegative)} · ${intersectionCount} ortak`)}</tr></table>`;

    const detailedSections = cleanDay ? '' : `
      <div class="section"><h2>Güncel Maliyet Tabanı</h2>${alertTable(currentNegative, 'CURRENT', currentNegative.length)}</div>
      <div class="section"><h2>Son Giriş Maliyet Tabanı</h2>${alertTable(entryNegative, 'ENTRY', entryNegative.length)}</div>
      <div class="section"><div style="padding:10px 12px;background:#fff7ed;border:1px solid #fdba74;border-radius:8px;color:#9a3412;"><strong>${formatPercent(thresholds.low)} altı marj:</strong> ${lowRows.length} satır, ${formatMoney(lowRows.reduce((sum, row) => sum + row.revenue, 0))} ciro, ${formatMoney(lowRows.reduce((sum, row) => sum + row.profit, 0))} kâr. ${missingEntryRows.length ? `${missingEntryRows.length} satırda son giriş tabanı eksik.` : ''}</div></div>
      <div class="section"><h2>En Çok Zarar Ettirenler (Güncel Maliyet)</h2><table role="presentation" width="100%"><tr>${lossList('5 Ürün', topLossProducts)}${lossList('5 Müşteri', topLossCustomers)}</tr></table></div>
      <div class="section"><h2>Şüpheli Yüksek Marjlar (${formatPercent(thresholds.high)} üzeri)</h2>${highRows.length ? highRows.slice(0, 5).map((row) => `<div style="padding:8px 0;border-bottom:1px solid #e2e8f0;"><a href="${frontendUrl}/reports/cost-update-all-products?search=${encodeURIComponent(row.productCode)}" style="color:#15356b;font-weight:700;">${escapeHtml(row.productCode)} - ${escapeHtml(row.productName)}</a><span style="float:right;color:#15803d;">${formatPercent(row.avgMargin)}</span></div>`).join('') : '<div style="color:#64748b;">Kayıt yok.</div>'}</div>
      <div class="section"><h2>Personel Özeti</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="responsive-table"><thead><tr style="background:#f8fafc;"><th align="left" style="padding:7px;">Personel / Sektör</th><th align="right" style="padding:7px;">Ciro</th><th align="right" style="padding:7px;">Güncel Kâr / Marj</th><th align="right" style="padding:7px;">SÖ Kâr</th><th align="right" style="padding:7px;">Güncel Zarar</th><th align="right" style="padding:7px;">SÖ Zarar</th><th align="right" style="padding:7px;">Açık İhlal</th><th align="right" style="padding:7px;">Dün Kapatılan</th></tr></thead><tbody>${salespersonRows}</tbody></table></div>`;
    const trendSection = `<div class="section"><h2>Son 7 Gün</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><thead><tr style="background:#f8fafc;"><th align="left" style="padding:7px;">Tarih</th><th align="right" style="padding:7px;">Ciro</th><th align="right" style="padding:7px;">Kâr</th><th align="right" style="padding:7px;">Marj</th><th align="right" style="padding:7px;">Zararlı</th></tr></thead><tbody>${trendRows}</tbody></table></div>`;

    const attachmentLine = params.attachment ? `<div style="padding:10px 24px;color:#475569;font-size:12px;">Ekte: <strong>${escapeHtml(params.attachment.name)}</strong> — tüm satırlar, iki maliyet tabanının ayrı kolonlarıyla.</div>` : '';
    const htmlContent = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escapeHtml(subject)}</title><style>@media(max-width:620px){.stack-cell{display:block!important;width:100%!important}.section{padding:14px 10px!important}.responsive-table{font-size:9px!important}.responsive-table th,.responsive-table td{padding:5px 3px!important}}@media(prefers-color-scheme:dark){.mail-shell{background:#ffffff!important;color:#0f172a!important}.section{background:#ffffff!important}}</style></head><body style="margin:0;background:#e9eef5;${font}"><div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 6px;"><table role="presentation" width="760" cellpadding="0" cellspacing="0" class="mail-shell" style="max-width:760px;width:100%;background:#fff;border:1px solid #dbe3ef;border-radius:10px;overflow:hidden;color:#0f172a;"><tr><td style="background:#14223b;padding:18px 24px;"><img src="${logoUrl}" width="185" alt="Bakırcılar" style="display:block;max-width:185px;height:auto;"><div style="color:#cbd5e1;font-size:12px;margin-top:8px;">Kâr Marjı Günlük Yönetici Özeti · ${formatDate(params.reportDate)}</div></td></tr><tr><td>${statusBand}${cards}${qualityBox}${lateSection}${detailedSections}${trendSection}${attachmentLine}<div style="padding:12px 24px 20px;"><a href="${actionUrl}" style="display:inline-block;background:#15356b;color:#fff;text-decoration:none;padding:11px 16px;border-radius:6px;font-weight:700;">Marj İhlali Aksiyon Merkezini Aç</a><a href="${panelUrl}" style="display:inline-block;margin-left:8px;color:#15356b;text-decoration:none;padding:10px 4px;font-weight:700;">Tüm raporu incele</a><div style="margin-top:14px;color:#64748b;font-size:11px;line-height:1.5;">Marj tüm ekranlarda kâr/ciro olarak hesaplanır. Güncel maliyet ve son giriş maliyeti ayrı tutulur. Mikro SÖ yüzdesi yalnız bilgi alanıdır. Eşikler: düşük &lt; ${formatPercent(thresholds.low)}, yüksek &gt; ${formatPercent(thresholds.high)}.</div></div></td></tr></table><div style="font-size:10px;color:#94a3b8;margin-top:8px;">Bakırcılar B2B otomatik raporu</div></td></tr></table></body></html>`;
    const textContent = [
      `KAR MARJI GUNLUK RAPORU - ${formatDate(params.reportDate)}`,
      cleanDay ? 'Temiz gun: iki tabanda da maliyet alti satir yok.' : `Guncel taban: ${currentNegative.length} satir, ${formatMoney(currentLoss)} kayip. Son giris: ${entryNegative.length} satir, ${formatMoney(entryLoss)} kayip.`,
      `Gunluk satis cirosu: ${formatMoney(summary.salesSummary.totalRevenue)}`,
      `Gunluk kar/marj: ${formatMoney(summary.salesSummary.totalProfit)} / ${formatPercent(summary.salesSummary.avgMargin)}`,
      `Iki taban kesisimi: ${intersectionCount} satir.`,
      `Aksiyon merkezi: ${actionUrl}`,
      params.attachment ? `Ek: ${params.attachment.name}` : '',
    ].filter(Boolean).join('\n');

    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.sender = { email: this.senderEmail, name: this.senderName };
    sendSmtpEmail.to = recipients.map((email) => ({ email }));
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = htmlContent;
    sendSmtpEmail.textContent = textContent;
    sendSmtpEmail.headers = { 'Content-Type': 'text/html; charset=UTF-8' };
    if (params.attachment) sendSmtpEmail.attachment = [params.attachment];
    await this.apiInstance.sendTransacEmail(sendSmtpEmail);
  }

  async sendMarginComplianceFailureAlert(params: { recipients: string[]; reportDate: Date; error: string }) {
    const recipients = params.recipients.map((email) => String(email || '').trim()).filter(Boolean);
    if (!recipients.length) return;
    const date = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeZone: 'UTC' }).format(params.reportDate);
    const message = `Marj raporu ${date} verisi alınamadı. Normal/sıfır değerli rapor gönderilmedi. Hata: ${params.error}`;
    const mail = new brevo.SendSmtpEmail();
    mail.sender = { email: this.senderEmail, name: this.senderName };
    mail.to = recipients.map((email) => ({ email }));
    mail.subject = `Marj Raporu VERI HATASI - ${date}`;
    mail.htmlContent = `<div style="font-family:Arial;padding:20px;background:#fef2f2;border-left:5px solid #dc2626;color:#7f1d1d;"><h2>Bugünkü veri alınamadı</h2><p>${escapeHtml(message)}</p><p>Sıfırlarla dolu normal rapor özellikle gönderilmedi.</p></div>`;
    mail.textContent = message;
    await this.apiInstance.sendTransacEmail(mail);
  }

  async sendMarginViolationPersonalDigests(reportDate: Date) {
    const assignments = await prisma.marginViolationAssignee.findMany({
      where: { violation: { reportDate, status: { in: ['OPEN', 'IN_REVIEW', 'REOPENED'] } }, user: { email: { not: null }, active: true } },
      include: { user: { select: { email: true, name: true, displayName: true, mikroName: true } }, violation: { include: { bases: true } } },
    });
    const byUser = new Map<string, typeof assignments>();
    assignments.forEach((assignment) => {
      const list = byUser.get(assignment.userId) || [];
      list.push(assignment);
      byUser.set(assignment.userId, list);
    });
    const frontendUrl = (process.env.FRONTEND_URL || 'https://www.bakircilarkampanya.com').replace(/\/$/, '');
    for (const rows of byUser.values()) {
      const user = rows[0]?.user;
      if (!user?.email) continue;
      const name = user.displayName || user.mikroName || user.name;
      const bodyRows = rows.slice(0, 20).map(({ violation }) => `<tr><td style="padding:7px;border-bottom:1px solid #e2e8f0;">${escapeHtml(violation.productCode)} - ${escapeHtml(violation.productName || '')}</td><td style="padding:7px;border-bottom:1px solid #e2e8f0;">${escapeHtml(violation.customerName || '-')}</td><td align="right" style="padding:7px;border-bottom:1px solid #e2e8f0;color:#b91c1c;">${violation.bases.map((basis) => `${basis.basis}: ${Number(basis.profit || 0).toLocaleString('tr-TR')} TL`).join('<br>')}</td></tr>`).join('');
      const link = `${frontendUrl}/margin-violations?assignee=me&status=OPEN`;
      const mail = new brevo.SendSmtpEmail();
      mail.sender = { email: this.senderEmail, name: this.senderName };
      mail.to = [{ email: user.email, name }];
      mail.subject = `${rows.length} açık marj ihlalin var`;
      mail.htmlContent = `<div style="font-family:Arial;max-width:680px;margin:auto;"><h2>${escapeHtml(name)}, açık marj ihlallerin</h2><table width="100%" cellspacing="0" cellpadding="0"><thead><tr><th align="left">Ürün</th><th align="left">Müşteri</th><th align="right">Zarar</th></tr></thead><tbody>${bodyRows}</tbody></table><p><a href="${link}" style="background:#15356b;color:#fff;padding:10px 14px;text-decoration:none;border-radius:6px;">İhlalleri incele</a></p></div>`;
      mail.textContent = `${name}, ${rows.length} açık marj ihlalin var. ${link}`;
      try {
        await this.apiInstance.sendTransacEmail(mail);
      } catch (error) {
        console.error('Margin violation personal digest could not be sent', {
          userId: rows[0]?.userId,
          error: error instanceof Error ? error.message : 'Unknown email error',
        });
      }
    }
  }

  private async sendMarginComplianceReportSummaryLegacy(params: MarginReportEmailParams): Promise<void> {
    const recipients = (params.recipients || [])
      .map((email) => (typeof email === 'string' ? email.trim() : ''))
      .filter(Boolean);

    if (recipients.length === 0) {
      console.log('Margin compliance report email skipped: no recipients.');
      return;
    }

    const summary = params.summary;

    // ---- Formatlayicilar (tr-TR) ----
    const formatMoney = (value: number, fractionDigits = 2) =>
      new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: 'TRY',
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(value || 0);

    const formatMoneyShort = (value: number) => formatMoney(value, 0);

    const formatPercent = (value: number) =>
      `%${new Intl.NumberFormat('tr-TR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(value || 0)}`;

    const formatCount = (value: number) => new Intl.NumberFormat('tr-TR').format(value || 0);

    const formatFullDate = (date: Date) =>
      new Intl.DateTimeFormat('tr-TR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        weekday: 'long',
        timeZone: 'UTC',
      }).format(date);

    const formatShortDate = (date: Date) =>
      new Intl.DateTimeFormat('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'UTC',
      }).format(date);

    const formatRangeDate = (date: Date) =>
      new Intl.DateTimeFormat('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(date));

    // Son giris marji (agregat): kar / ciro — guncel taban ile ayni tanim.
    const entryMarginOf = (bucket: { totalRevenue: number; entryProfit: number }) => {
      return bucket.totalRevenue > 0 ? (bucket.entryProfit / bucket.totalRevenue) * 100 : 0;
    };

    // ---- Veri hazirligi: iki maliyet tabani AYRI AYRI ----
    type TaggedRow = MarginAlertRow & { source: string };

    const tagRows = (rows: MarginAlertRow[], source: string): TaggedRow[] =>
      (rows || []).map((row) => ({ ...row, source }));

    // Guncel maliyet tabani: maliyet alti satirlar (satis + siparis birlesik)
    const currentNegativeRows = [
      ...tagRows(summary.alerts.sales.current.negative, 'Satış'),
      ...tagRows(summary.alerts.order.current.negative, 'Sipariş'),
    ].sort((a, b) => a.profit - b.profit);

    // Son giris maliyet tabani: maliyet alti satirlar (Mikro SO kolonlarina gore)
    const entryNegativeRows = [
      ...tagRows(summary.alerts.sales.entry.negative, 'Satış'),
      ...tagRows(summary.alerts.order.entry.negative, 'Sipariş'),
    ].sort((a, b) => a.entryProfit - b.entryProfit);

    // %5 alti (dusuk marj) satirlar sadece not olarak gecer — guncel taban.
    const currentLowRows = [
      ...tagRows(summary.alerts.sales.current.low, 'Satış'),
      ...tagRows(summary.alerts.order.current.low, 'Sipariş'),
    ];

    // Supheli yuksek marjlar (%70 ustu) — guncel taban.
    const currentHighRows = [
      ...tagRows(summary.alerts.sales.current.high, 'Satış'),
      ...tagRows(summary.alerts.order.current.high, 'Sipariş'),
    ].sort((a, b) => b.avgMargin - a.avgMargin);

    const currentLoss = Math.abs(currentNegativeRows.reduce((acc, row) => acc + Math.min(row.profit, 0), 0));
    const entryLoss = Math.abs(entryNegativeRows.reduce((acc, row) => acc + Math.min(row.entryProfit, 0), 0));

    const WORST_LIMIT = 15;
    const worstCurrentRows = currentNegativeRows.slice(0, WORST_LIMIT);
    const worstEntryRows = entryNegativeRows.slice(0, WORST_LIMIT);
    const highlightRows = currentHighRows.slice(0, 5);

    const activeExclusionCount = summary.activeExclusionCount || 0;

    // ---- Konu satiri: iki tabanin durumu tek bakista ----
    const baseSubject = (params.subject || '').trim() || 'Marj Raporu';
    const subjectDetail = currentNegativeRows.length === 0 && entryNegativeRows.length === 0
      ? 'iki tabanda da maliyet altı satır yok — temiz gün'
      : `Güncel: ${formatCount(currentNegativeRows.length)} zarar satırı ${formatMoneyShort(currentLoss)} | Son Giriş: ${formatCount(entryNegativeRows.length)} satır ${formatMoneyShort(entryLoss)}`;
    const subject = `${baseSubject} ${formatShortDate(params.reportDate)} — ${subjectDetail}`;

    // ---- HTML parcalari (e-posta uyumlu: tablo bazli + inline stil) ----
    const font = 'font-family: Arial, Helvetica, sans-serif;';

    const thStyle = (align: 'left' | 'right' | 'center' = 'left') =>
      `${font} padding: 8px 6px; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 2px solid #e5e7eb; text-align: ${align}; white-space: nowrap;`;

    const tdStyle = (align: 'left' | 'right' | 'center' = 'left', extra = '') =>
      `${font} padding: 7px 6px; font-size: 12px; color: #111827; border-bottom: 1px solid #f3f4f6; text-align: ${align}; ${extra}`;

    const sectionTitle = (title: string, subtitle?: string) => `
      <tr>
        <td style="padding: 24px 24px 8px 24px;">
          <div style="${font} font-size: 15px; font-weight: 700; color: #111827;">${title}</div>
          ${subtitle ? `<div style="${font} font-size: 12px; color: #6b7280; padding-top: 2px;">${subtitle}</div>` : ''}
        </td>
      </tr>
    `;

    const card = (label: string, value: string, sub: string, valueColor: string) => `
      <td width="50%" valign="top" style="padding: 6px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px;">
          <tr>
            <td style="padding: 14px 16px;">
              <div style="${font} font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">${label}</div>
              <div style="${font} font-size: 22px; font-weight: 700; color: ${valueColor}; padding-top: 6px;">${value}</div>
              <div style="${font} font-size: 12px; color: #6b7280; padding-top: 6px;">${sub}</div>
            </td>
          </tr>
        </table>
      </td>
    `;

    // ---- Ozet kartlari: ciro + iki tabanin kar/marji ayri ayri + maliyet alti sayaci ----
    const salesBucket = summary.salesSummary;
    const orderBucket = summary.orderSummary;
    const negLineColor = (count: number) => (count > 0 ? '#b91c1c' : '#16a34a');

    const summaryCards = `
      <tr>
        <td style="padding: 12px 18px 0 18px; background: #f9fafb;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              ${card(
                'Satış Cirosu (KDV Hariç)',
                formatMoneyShort(salesBucket.totalRevenue),
                `Bekleyen sipariş tutarı: ${formatMoneyShort(orderBucket.totalRevenue)}`,
                '#111827'
              )}
              ${card(
                'Kâr & Marj — Güncel Maliyet',
                `${formatMoneyShort(salesBucket.totalProfit)} · ${formatPercent(salesBucket.avgMargin)}`,
                `Marj = kâr / ciro · Sipariş kârı: ${formatMoneyShort(orderBucket.totalProfit)} (${formatPercent(orderBucket.avgMargin)})`,
                salesBucket.totalProfit < 0 ? '#b91c1c' : '#111827'
              )}
            </tr>
            <tr>
              ${card(
                'Kâr & Marj — Son Giriş Maliyeti',
                `${formatMoneyShort(salesBucket.entryProfit)} · ${formatPercent(entryMarginOf(salesBucket))}`,
                `Mikro SÖ toplamları · Sipariş kârı: ${formatMoneyShort(orderBucket.entryProfit)} (${formatPercent(entryMarginOf(orderBucket))})`,
                salesBucket.entryProfit < 0 ? '#b91c1c' : '#111827'
              )}
              ${card(
                'Maliyet Altı Satırlar',
                `<div style="font-size: 15px; color: ${negLineColor(currentNegativeRows.length)};">Güncel: ${formatCount(currentNegativeRows.length)} satır / ${formatMoneyShort(currentLoss)}</div>
                 <div style="font-size: 15px; color: ${negLineColor(entryNegativeRows.length)}; padding-top: 4px;">Son Giriş: ${formatCount(entryNegativeRows.length)} satır / ${formatMoneyShort(entryLoss)}</div>`,
                'Aynı satır iki tabanda birden görünebilir',
                '#111827'
              )}
            </tr>
          </table>
        </td>
      </tr>
    `;

    // ---- Maliyet alti tablolari: iki tabanda ayni kolon seti, vurgu tabana gore ----
    // Vurgulanan tabanin kolonlari renkli/kalin, diger tabanin kolonlari soluk gosterilir.
    const fadedCell = 'white-space: nowrap; color: #9ca3af;';
    const strongCell = (color: string) => `white-space: nowrap; font-weight: 700; color: ${color};`;

    const dualAlertHeader = (basis: 'current' | 'entry') => `
      <tr>
        <th style="${thStyle('left')}">Ürün</th>
        <th style="${thStyle('left')}">Müşteri</th>
        <th style="${thStyle('left')}">Tür / Evrak</th>
        <th style="${thStyle('right')}">Miktar</th>
        <th style="${thStyle('right')}">Birim Satış</th>
        <th style="${thStyle('right')}">${basis === 'current' ? 'Birim Maliyet (Güncel)' : 'Birim Maliyet (Son Giriş)'}</th>
        <th style="${thStyle('right')}">Kâr (Güncel)</th>
        <th style="${thStyle('right')}">Marj (Güncel)</th>
        <th style="${thStyle('right')}">Kâr (Son Giriş)</th>
        <th style="${thStyle('right')}">Marj (Son Giriş)</th>
      </tr>
    `;

    const renderDualAlertRow = (row: TaggedRow, basis: 'current' | 'entry', accent: string, bg: string) => {
      const currentCellStyle = basis === 'current' ? strongCell(accent) : fadedCell;
      const entryCellStyle = basis === 'entry' ? strongCell(accent) : fadedCell;
      const unitCostValue = basis === 'current' ? row.unitCost : row.unitCostEntry;
      return `
        <tr style="background: ${bg};">
          <td style="${tdStyle('left')}">
            <div style="font-weight: 600;">${escapeHtml(row.productName || '-')}</div>
            <div style="${font} font-size: 10px; color: #6b7280;">${escapeHtml(row.productCode || '')}</div>
          </td>
          <td style="${tdStyle('left')}">${escapeHtml(row.customerName || '-')}</td>
          <td style="${tdStyle('left')}">
            ${escapeHtml(row.source)}
            <div style="${font} font-size: 10px; color: #6b7280;">${escapeHtml(row.documentNo || '')}</div>
          </td>
          <td style="${tdStyle('right', 'white-space: nowrap;')}">${escapeHtml(row.quantityLabel || '')}</td>
          <td style="${tdStyle('right', 'white-space: nowrap;')}">${formatMoney(row.unitPrice)}</td>
          <td style="${tdStyle('right', 'white-space: nowrap;')}">${formatMoney(unitCostValue)}</td>
          <td style="${tdStyle('right', currentCellStyle)}">${formatMoney(row.profit)}</td>
          <td style="${tdStyle('right', currentCellStyle)}">${formatPercent(row.avgMargin)}</td>
          <td style="${tdStyle('right', entryCellStyle)}">${formatMoney(row.entryProfit)}</td>
          <td style="${tdStyle('right', entryCellStyle)}">${formatPercent(row.entryMargin)}</td>
        </tr>
      `;
    };

    const dualAlertTable = (
      rows: TaggedRow[],
      basis: 'current' | 'entry',
      accent: string,
      bg: string,
      totalCount: number,
      emptyText: string
    ) =>
      rows.length === 0
        ? `<div style="${font} font-size: 13px; color: #16a34a; padding: 4px 0 8px 0;">${emptyText}</div>`
        : `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
            <thead>${dualAlertHeader(basis)}</thead>
            <tbody>
              ${rows.map((row) => renderDualAlertRow(row, basis, accent, bg)).join('')}
            </tbody>
          </table>
          ${totalCount > rows.length
            ? `<div style="${font} font-size: 11px; color: #6b7280; padding-top: 6px;">Toplam ${formatCount(totalCount)} satırın en kötü ${formatCount(rows.length)} tanesi gösteriliyor; tam liste ekteki Excel dosyasındadır.</div>`
            : ''}
        `;

    const worstCurrentTable = dualAlertTable(
      worstCurrentRows,
      'current',
      '#b91c1c',
      '#fef2f2',
      currentNegativeRows.length,
      'Güncel maliyet tabanında maliyet altı satır yok.'
    );

    const lowRowsNote = currentLowRows.length > 0
      ? `<div style="${font} font-size: 11px; color: #b45309; padding-top: 6px;">Ayrıca güncel tabanda %5 altı marjlı ${formatCount(currentLowRows.length)} satır var; tam liste ekteki Excel dosyasındadır.</div>`
      : '';

    const worstEntryTable = dualAlertTable(
      worstEntryRows,
      'entry',
      '#b91c1c',
      '#fff7ed',
      entryNegativeRows.length,
      'Son giriş maliyet tabanında maliyet altı satır yok.'
    );

    const highTable = highlightRows.length === 0
      ? `<div style="${font} font-size: 13px; color: #6b7280; padding: 4px 0 8px 0;">%70 üzeri marjlı satır yok.</div>`
      : dualAlertTable(highlightRows, 'current', '#15803d', '#f0fdf4', currentHighRows.length, '');

    const salespersonRows = (summary.salespersonSummary || [])
      .filter((entry) => entry.salesSummary.totalRecords > 0 || entry.orderSummary.totalRecords > 0)
      .map((entry) => {
        const negativeTotal = entry.salesSummary.negativeLines + entry.orderSummary.negativeLines;
        return `
          <tr>
            <td style="${tdStyle('left', 'font-weight: 600;')}">${escapeHtml(entry.sectorCode)}</td>
            <td style="${tdStyle('right')}">${formatMoneyShort(entry.salesSummary.totalRevenue)}</td>
            <td style="${tdStyle('right')}">${formatMoneyShort(entry.salesSummary.totalProfit)}</td>
            <td style="${tdStyle('right')}">${formatPercent(entry.salesSummary.avgMargin)}</td>
            <td style="${tdStyle('right')}">${formatMoneyShort(entry.salesSummary.entryProfit)}</td>
            <td style="${tdStyle('right')}">${formatPercent(entryMarginOf(entry.salesSummary))}</td>
            <td style="${tdStyle('right')}">${formatMoneyShort(entry.orderSummary.totalRevenue)}</td>
            <td style="${tdStyle('right')}">${formatPercent(entry.orderSummary.avgMargin)}</td>
            <td style="${tdStyle('right', negativeTotal > 0 ? 'color: #b91c1c; font-weight: 700;' : '')}">${formatCount(negativeTotal)}</td>
          </tr>
        `;
      })
      .join('');

    const salespersonTable = salespersonRows
      ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
          <thead>
            <tr>
              <th style="${thStyle('left')}">Personel</th>
              <th style="${thStyle('right')}">Satış Ciro</th>
              <th style="${thStyle('right')}">Kâr (Güncel)</th>
              <th style="${thStyle('right')}">Marj (Güncel)</th>
              <th style="${thStyle('right')}">Kâr (Son Giriş)</th>
              <th style="${thStyle('right')}">Marj (Son Giriş)</th>
              <th style="${thStyle('right')}">Sipariş Ciro</th>
              <th style="${thStyle('right')}">Sipariş Marj</th>
              <th style="${thStyle('right')}">Zararlı Satır</th>
            </tr>
          </thead>
          <tbody>${salespersonRows}</tbody>
        </table>
      `
      : `<div style="${font} font-size: 13px; color: #6b7280;">Satış personeli özeti için kayıt yok.</div>`;

    const seven = summary.sevenDaySummary;
    const sevenRow = (label: string, bucket: MarginSummaryBucket) => `
      <tr>
        <td style="${tdStyle('left', 'font-weight: 600;')}">${label}</td>
        <td style="${tdStyle('right')}">${formatMoneyShort(bucket.totalRevenue)}</td>
        <td style="${tdStyle('right')}">${formatMoneyShort(bucket.totalProfit)}</td>
        <td style="${tdStyle('right')}">${formatPercent(bucket.avgMargin)}</td>
        <td style="${tdStyle('right')}">${formatMoneyShort(bucket.entryProfit)}</td>
        <td style="${tdStyle('right')}">${formatPercent(entryMarginOf(bucket))}</td>
        <td style="${tdStyle('right', bucket.negativeLines > 0 ? 'color: #b91c1c; font-weight: 700;' : '')}">${formatCount(bucket.negativeLines)}</td>
      </tr>
    `;

    const sevenDayTable = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
        <thead>
          <tr>
            <th style="${thStyle('left')}">&nbsp;</th>
            <th style="${thStyle('right')}">Ciro</th>
            <th style="${thStyle('right')}">Kâr (Güncel)</th>
            <th style="${thStyle('right')}">Marj (Güncel)</th>
            <th style="${thStyle('right')}">Kâr (Son Giriş)</th>
            <th style="${thStyle('right')}">Marj (Son Giriş)</th>
            <th style="${thStyle('right')}">Zararlı Satır</th>
          </tr>
        </thead>
        <tbody>
          ${sevenRow('Genel', seven.overall)}
          ${sevenRow('Satış', seven.sales)}
          ${sevenRow('Sipariş', seven.orders)}
        </tbody>
      </table>
    `;

    const footnotes = `
      <tr>
        <td style="padding: 20px 24px 8px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px;">
            <tr>
              <td style="padding: 14px 16px;">
                <div style="${font} font-size: 12px; font-weight: 700; color: #374151; padding-bottom: 6px;">Bu rapor nasıl hesaplanır?</div>
                <ul style="${font} font-size: 11px; color: #6b7280; line-height: 1.7; margin: 0; padding-left: 16px;">
                  <li><strong>İki maliyet tabanı ayrı ayrı gösterilir, birleştirilmez:</strong> güncel maliyet tabanı ve son giriş maliyet tabanı.</li>
                  <li><strong>Güncel maliyet tabanı:</strong> A.Teklif maliyeti satışın KDV düzlemine çevrilerek B2B tarafında hesaplanır (beyaz/vergisiz satışta yarım KDV yüklü maliyet, faturalı satışta net maliyet).</li>
                  <li><strong>Son giriş tabanı:</strong> Mikro'nun SÖ kolonları esas alınır (Mikro'nun kendi hesabı: açık satış açık maliyetten, faturalı satış faturalı maliyetten).</li>
                  <li><strong>Marj %:</strong> Özetlerde ve tablolarda kâr / ciro oranıdır. Satır rozetlerinde (maliyet altı / %5 altı / %70 üstü) güncel taban kâr / maliyet ile, son giriş tabanı Mikro'nun SÖ marjı ile değerlendirilir.</li>
                  <li><strong>Kapsam:</strong> Yalnızca evrak tarihi ${formatRangeDate(params.reportDate)} olan satırlar dahildir; eski tarihli veya geriye dönük girilen satırlar bu rapora girmez.</li>
                  <li><strong>Hariç tutulanlar:</strong> İade/iptal satırları, negatif miktarlı satırlar, "Fiyat Farkı" tipi özel kodlar (B100963, B100964, B105959, MUHTELİF vb.), TOPLU sorumluluk merkezi satırları ve rapor sayfasından yönetilen marka/ürün dışlamaları${activeExclusionCount > 0 ? ` (şu an ${formatCount(activeExclusionCount)} aktif kural)` : ' (şu an aktif kural yok)'}.</li>
                  <li><strong>Satış / Sipariş:</strong> "Satış" kesilen fatura ve irsaliyeleri, "Sipariş" henüz faturalaşmamış bekleyen siparişleri ifade eder.</li>
                  <li>Satır bazında tam liste (iki tabanın kolonlarıyla birlikte) ekteki Excel dosyasındadır.</li>
                </ul>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `;

    const panelUrl = `${(process.env.FRONTEND_URL || '').replace(/\/$/, '')}/reports/margin-compliance`;

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="tr">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${escapeHtml(subject)}</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f3f4f6;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6;">
          <tr>
            <td align="center" style="padding: 24px 8px;">
              <table role="presentation" width="680" cellpadding="0" cellspacing="0" style="max-width: 680px; width: 100%; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
                <tr>
                  <td style="background: #111c3f; padding: 22px 24px;">
                    <div style="${font} font-size: 20px; font-weight: 700; color: #ffffff;">Kâr Marjı Günlük Raporu</div>
                    <div style="${font} font-size: 13px; color: #c7d2fe; padding-top: 6px;">${formatFullDate(params.reportDate)} — ${formatCount(summary.totalRecords)} satır · ${formatCount(summary.totalDocuments)} evrak — günün satışları ve bekleyen siparişleri</div>
                  </td>
                </tr>
                ${summaryCards}
                ${sectionTitle('Maliyet Altı Satırlar — Güncel Maliyet Tabanı', 'B2B hesabı: güncel maliyet, satışın KDV düzlemine çevrilir — en yüksek zarardan sıralı')}
                <tr>
                  <td style="padding: 0 24px;">
                    ${worstCurrentTable}
                    ${lowRowsNote}
                  </td>
                </tr>
                ${sectionTitle('Maliyet Altı Satırlar — Son Giriş Tabanı', 'Mikro SÖ kolonlarına göre — en yüksek zarardan sıralı')}
                <tr>
                  <td style="padding: 0 24px;">
                    ${worstEntryTable}
                  </td>
                </tr>
                ${sectionTitle('Şüpheli Yüksek Marjlar (%70 üstü)', 'Güncel maliyet tabanına göre; çoğu zaman eski veya eksik maliyet bilgisine işaret eder — maliyet kartını kontrol edin')}
                <tr>
                  <td style="padding: 0 24px;">
                    ${highTable}
                  </td>
                </tr>
                ${sectionTitle('Satış Personeli Özeti', 'Sektör koduna göre; ciro ve kâr KDV hariç')}
                <tr>
                  <td style="padding: 0 24px;">
                    ${salespersonTable}
                  </td>
                </tr>
                ${sectionTitle('Son 7 Gün', `${formatRangeDate(seven.startDate)} – ${formatRangeDate(seven.endDate)}`)}
                <tr>
                  <td style="padding: 0 24px;">
                    ${sevenDayTable}
                  </td>
                </tr>
                ${footnotes}
                <tr>
                  <td style="padding: 12px 24px 22px 24px;">
                    <div style="${font} font-size: 12px; color: #6b7280;">
                      Detaylı inceleme için <a href="${panelUrl}" style="color: #2563eb; text-decoration: none; font-weight: 600;">B2B panelindeki Kâr Marjı raporunu</a> açabilirsiniz.
                    </div>
                  </td>
                </tr>
              </table>
              <div style="${font} font-size: 11px; color: #9ca3af; padding-top: 12px;">Bakırcılar B2B otomatik raporu</div>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.sender = { email: this.senderEmail, name: this.senderName };
    sendSmtpEmail.to = recipients.map((email) => ({ email }));
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = htmlContent;
    sendSmtpEmail.headers = {
      'Content-Type': 'text/html; charset=UTF-8',
    };
    if (params.attachment) {
      sendSmtpEmail.attachment = [params.attachment];
    }

    await this.apiInstance.sendTransacEmail(sendSmtpEmail);
  }

}

export default new EmailService();



