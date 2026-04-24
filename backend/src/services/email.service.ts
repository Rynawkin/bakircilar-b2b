/**
 * Email Service - Brevo (SendinBlue) Integration
 *
 * Bekleyen siparişleri müşterilere mail ile gönderir.
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
      productName: string;
      unit: string;
      quantity: number;          // Toplam sipariş miktarı
      deliveredQty: number;      // Teslim edilen miktar
      remainingQty: number;      // Kalan miktar
      unitPrice: number;
      lineTotal: number;
    }>;
    totalAmount: number;
    totalVAT: number;
    grandTotal: number;
  }>;
  totalOrdersAmount: number;
}

type MarginSummaryBucket = {
  totalRecords: number;
  totalDocuments: number;
  totalRevenue: number;
  totalProfit: number;
  entryProfit: number;
  avgMargin: number;
  negativeLines: number;
  negativeDocuments: number;
};

type MarginAlertRow = {
  documentNo: string;
  documentType: string;
  customerName: string;
  productCode: string;
  productName: string;
  quantity: number;
  unit: string;
  quantityLabel: string;
  unitPrice: number;
  revenue: number;
  profit: number;
  entryProfit: number;
  avgMargin: number;
  entryMargin: number;
};

type MarginAlertSet = {
  negative: MarginAlertRow[];
  low: MarginAlertRow[];
  high: MarginAlertRow[];
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
};

type MarginComplianceEmailSummary = {
  totalRecords: number;
  totalDocuments: number;
  totalRevenue: number;
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
};

class EmailService {
  private apiInstance: brevo.TransactionalEmailsApi;
  private senderEmail: string;
  private senderName: string;

  constructor() {
    // Brevo API client oluştur
    this.apiInstance = new brevo.TransactionalEmailsApi();
    this.apiInstance.setApiKey(
      brevo.TransactionalEmailsApiApiKeys.apiKey,
      process.env.BREVO_API_KEY || ''
    );
    this.senderEmail = process.env.BREVO_SENDER_EMAIL || 'noreply@bakircilar.com';
    this.senderName = process.env.BREVO_SENDER_NAME || 'Bakırcılar B2B';
  }

  /**
   * Tüm müşterilere bekleyen siparişlerini mail ile gönder (DEPRECATED - use sendPendingOrdersToCustomers)
   */
  async sendPendingOrdersToAllCustomers(): Promise<{
    success: boolean;
    sentCount: number;
    failedCount: number;
    message: string;
  }> {
    try {
      console.log('📧 Mail gönderimi başladı...');

      // 1. Mail gönderilecek müşterileri bul
      const customers = await this.getCustomersWithPendingOrders();
      console.log(`✅ ${customers.length} müşteri bulundu`);

      let sentCount = 0;
      let failedCount = 0;

      // 2. Her müşteriye mail gönder
      for (const customer of customers) {
        try {
          await this.sendOrderEmail(customer, 'Bekleyen Siparişleriniz');
          sentCount++;

          // Gönderildi olarak işaretle
          await prisma.pendingMikroOrder.updateMany({
            where: { customerCode: customer.customerCode },
            data: {
              emailSent: true,
              emailSentAt: new Date(),
            },
          });
        } catch (error: any) {
          console.error(`❌ Mail gönderilemedi (${customer.customerEmail}):`, error.message);
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

      // 3. Settings'e son mail gönderim zamanını kaydet
      const settings = await prisma.orderTrackingSettings.findFirst();
      if (settings) {
        await prisma.orderTrackingSettings.update({
          where: { id: settings.id },
          data: { lastEmailSentAt: new Date() },
        });
      }

      console.log(`✅ Mail gönderimi tamamlandı: ${sentCount} başarılı, ${failedCount} başarısız`);

      return {
        success: true,
        sentCount,
        failedCount,
        message: `${sentCount} başarılı, ${failedCount} başarısız`,
      };
    } catch (error: any) {
      console.error('❌ Toplu mail gönderimi hatası:', error);
      return {
        success: false,
        sentCount: 0,
        failedCount: 0,
        message: error.message || 'Bilinmeyen hata',
      };
    }
  }

  /**
   * Tek bir müşteriye mail gönder
   */
  async sendOrderEmail(data: OrderEmailData, subject?: string): Promise<void> {
    const emailSubject = subject || 'Bekleyen Siparişleriniz';
    const htmlContent = this.generateEmailHTML(data);

    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.sender = { email: this.senderEmail, name: this.senderName };
    sendSmtpEmail.to = [{ email: data.customerEmail, name: data.customerName }];
    sendSmtpEmail.subject = emailSubject;
    sendSmtpEmail.htmlContent = htmlContent;

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

  /**
   * Mail gönderilecek müşterileri ve siparişlerini getir
   */
  private async getCustomersWithPendingOrders(): Promise<OrderEmailData[]> {
    // 1. Bekleyen siparişleri çek
    const orders = await prisma.pendingMikroOrder.findMany({
      where: { emailSent: false },
      orderBy: { orderDate: 'desc' },
    });

    // 2. Müşteri bazında grupla
    const customerMap = new Map<string, OrderEmailData>();

    for (const order of orders) {
      if (!customerMap.has(order.customerCode)) {
        // Email adresini belirle: Önce order'daki email, yoksa User tablosundan
        let customerEmail = order.customerEmail;

        if (!customerEmail) {
          const user = await prisma.user.findFirst({
            where: { mikroCariCode: order.customerCode },
          });
          customerEmail = user?.email || null;
        }

        if (!customerEmail) {
          console.warn(`⚠️ Müşteri email bulunamadı: ${order.customerCode}`);
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
   * Email HTML template oluştur
   */
  private generateEmailHTML(data: OrderEmailData): string {
    const formatCurrency = (value: number) => {
      return new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: 'TRY',
        minimumFractionDigits: 2,
      }).format(value);
    };

    const formatDate = (date: Date | null) => {
      if (!date) return '-';
      return new Intl.DateTimeFormat('tr-TR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(new Date(date));
    };

    let ordersHTML = '';

    for (const order of data.orders) {
      let itemsHTML = '';
      for (const item of order.items) {
        const isFullyDelivered = item.remainingQty === 0;

        // Tamamı teslim edilmiş ürünler için farklı stil
        const rowStyle = isFullyDelivered
          ? 'padding: 8px; border-bottom: 1px solid #eee; background-color: #f3f4f6; opacity: 0.7;'
          : 'padding: 8px; border-bottom: 1px solid #eee;';

        const productNameStyle = isFullyDelivered
          ? 'text-decoration: line-through; color: #6b7280;'
          : '';

        const deliveryBadge = isFullyDelivered
          ? '<span style="display: inline-block; background-color: #d1fae5; color: #065f46; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-left: 8px;">✓ TESLİM EDİLDİ</span>'
          : '';

        itemsHTML += `
          <tr>
            <td style="${rowStyle}">
              <span style="${productNameStyle}">${item.productName}</span>${deliveryBadge}
            </td>
            <td style="${rowStyle} text-align: center;">
              ${isFullyDelivered
                ? `<span style="color: #6b7280;">${item.quantity} ${item.unit}</span>`
                : `${item.remainingQty} ${item.unit}`
              }
            </td>
            <td style="${rowStyle} text-align: right;">${formatCurrency(item.unitPrice)}</td>
            <td style="${rowStyle} text-align: right;">${formatCurrency(item.lineTotal)}</td>
          </tr>
        `;
      }

      ordersHTML += `
        <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h3 style="color: #2563eb; margin-top: 0;">📦 Sipariş No: ${order.mikroOrderNumber}</h3>
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

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
        <div style="max-width: 800px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">📋 Bakırcılar Ambalaj Sipariş Bakiyesi</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Sayın ${data.customerName},</p>
          </div>

          <div style="background: #f9fafb; padding: 20px;">
            <p style="color: #374151; font-size: 16px; line-height: 1.6;">
              Aşağıda bekleyen sipariş bakiyelerinizi bulabilirsiniz:
            </p>

            ${ordersHTML}

            <div style="background: white; border-radius: 8px; padding: 20px; margin-top: 20px; text-align: center; border: 2px dashed #2563eb;">
              <p style="margin: 0; font-size: 20px; color: #2563eb;"><strong>TOPLAM BAKIYE</strong></p>
              <p style="margin: 10px 0 0 0; font-size: 32px; color: #1e40af; font-weight: bold;">${formatCurrency(data.totalOrdersAmount)}</p>
            </div>

            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin-top: 20px; border-radius: 4px;">
              <p style="margin: 0; color: #92400e; font-size: 14px;">
                ℹ️ Sipariş detayları ve güncel durumunuz için <a href="${process.env.FRONTEND_URL}" style="color: #2563eb; text-decoration: none;"><strong>B2B Portalımızı</strong></a> ziyaret edebilirsiniz.
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
   * Belirli bir müşteriye bekleyen siparişlerini mail ile gönder
   * @param customerCode Müşteri kodu
   * @param emailOverride Opsiyonel email override (tek seferlik farklı bir adrese gönder)
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
      const customerSubject = settings?.customerEmailSubject || 'Bekleyen Siparisleriniz';
      const supplierSubject = settings?.supplierEmailSubject || 'Bekleyen Tedarikci Siparisleri';

      const orders = await prisma.pendingMikroOrder.findMany({
        where: { customerCode },
        orderBy: { orderDate: 'desc' },
      });

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
   * Test email gönder (development için)
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
   * Sadece müşterilere (SATICI olmayanlar) bekleyen siparişlerini mail ile gönder
   */
  async sendPendingOrdersToCustomers(): Promise<{
    success: boolean;
    sentCount: number;
    failedCount: number;
    message: string;
  }> {
    try {
      console.log('📧 Müşterilere mail gönderimi başladı...');

      // Ayarları al
      const settings = await prisma.orderTrackingSettings.findFirst();
      const emailSubject = settings?.customerEmailSubject || 'Bekleyen Siparişleriniz';

      // 1. Müşterilerin bekleyen siparişlerini al (SATICI olmayanlar)
      const orders = await prisma.pendingMikroOrder.findMany({
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

      console.log(`✅ ${orders.length} müşteri siparişi bulundu`);

      // 2. Müşteri bazında grupla
      const customerMap = await this.groupOrdersByCustomer(orders);
      const customers = Array.from(customerMap.values());

      let sentCount = 0;
      let failedCount = 0;

      // 3. Her müşteriye mail gönder
      for (const customer of customers) {
        try {
          await this.sendOrderEmail(customer, emailSubject);
          sentCount++;

          // Gönderildi olarak işaretle
          await prisma.pendingMikroOrder.updateMany({
            where: { customerCode: customer.customerCode },
            data: {
              emailSent: true,
              emailSentAt: new Date(),
            },
          });
        } catch (error: any) {
          console.error(`❌ Müşteriye mail gönderilemedi (${customer.customerEmail}):`, error.message);
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

      // 4. Son mail gönderim zamanını kaydet
      if (settings) {
        await prisma.orderTrackingSettings.update({
          where: { id: settings.id },
          data: { lastCustomerEmailSentAt: new Date() },
        });
      }

      console.log(`✅ Müşterilere mail gönderimi tamamlandı: ${sentCount} başarılı, ${failedCount} başarısız`);

      return {
        success: true,
        sentCount,
        failedCount,
        message: `${sentCount} başarılı, ${failedCount} başarısız`,
      };
    } catch (error: any) {
      console.error('❌ Müşterilere toplu mail gönderimi hatası:', error);
      return {
        success: false,
        sentCount: 0,
        failedCount: 0,
        message: error.message || 'Bilinmeyen hata',
      };
    }
  }

  /**
   * Sadece tedarikçilere (SATICI sektör kodlu) bekleyen siparişlerini mail ile gönder
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
      const emailSubject = settings?.supplierEmailSubject || 'Bekleyen Tedarikci Siparisleri';
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
   * Siparişleri müşteri/tedarikçi bazında grupla (helper metod)
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
          console.warn(`⚠️ Email bulunamadı: ${order.customerCode}`);
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

  async sendMarginComplianceReportSummary(params: {
    recipients: string[];
    reportDate: Date;
    summary: MarginComplianceEmailSummary;
    subject?: string;
    attachment?: {
      name: string;
      content: string;
    };
  }): Promise<void> {
    const recipients = (params.recipients || [])
      .map((email) => (typeof email === 'string' ? email.trim() : ''))
      .filter(Boolean);

    if (recipients.length === 0) {
      console.log('Margin compliance report email skipped: no recipients.');
      return;
    }

    const formatCurrency = (value: number) =>
      new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: 'TRY',
      }).format(value || 0);

    const formatPercent = (value: number) => `${(value || 0).toFixed(2)}%`;

    const formatCount = (value: number) =>
      new Intl.NumberFormat('tr-TR').format(value || 0);

    const formatDate = (date: Date) =>
      new Intl.DateTimeFormat('tr-TR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(date);

    const calcEntryMargin = (bucket: { totalRevenue: number; entryProfit: number }) =>
      bucket.totalRevenue > 0 ? (bucket.entryProfit / bucket.totalRevenue) * 100 : 0;

    const renderBucketRow = (label: string, value: string) => `
      <tr>
        <td style="padding: 6px 0; color: #6b7280;">${label}</td>
        <td style="padding: 6px 0; text-align: right; font-weight: 600;">${value}</td>
      </tr>
    `;

    const renderBucket = (title: string, bucket: {
      totalRecords: number;
      totalDocuments: number;
      totalRevenue: number;
      totalProfit: number;
      entryProfit: number;
      avgMargin: number;
      negativeLines: number;
      negativeDocuments: number;
    }) => `
      <div style="margin-top: 16px;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #111827;">${title}</h3>
        <table style="width: 100%; border-collapse: collapse;">
          ${renderBucketRow('Toplam Satir', formatCount(bucket.totalRecords))}
          ${renderBucketRow('Toplam Evrak', formatCount(bucket.totalDocuments))}
          ${renderBucketRow('Ciro (KDV Haric)', formatCurrency(bucket.totalRevenue))}
          ${renderBucketRow('Kar (KDV Haric)', formatCurrency(bucket.totalProfit))}
          ${renderBucketRow('Kar (Son Giris)', formatCurrency(bucket.entryProfit))}
          ${renderBucketRow('Ortalama Kar %', formatPercent(bucket.avgMargin))}
          ${renderBucketRow('Ortalama Kar % (Son Giris)', formatPercent(calcEntryMargin(bucket)))}
          ${renderBucketRow('Zararli Evrak', formatCount(bucket.negativeDocuments))}
          ${renderBucketRow('Zararli Satir', formatCount(bucket.negativeLines))}
        </table>
      </div>
    `;

    const renderAlertTable = (rows: MarginAlertRow[], options: { useEntry: boolean }) => {
      if (!rows || rows.length === 0) {
        return '<p style="margin: 0; font-size: 12px; color: #6b7280;">Kayit yok.</p>';
      }

      const body = rows
        .map((row) => {
          const profitValue = options.useEntry ? row.entryProfit : row.profit;
          const marginValue = options.useEntry ? row.entryMargin : row.avgMargin;
          return `
            <tr>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb;">${row.documentNo}</td>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb;">${row.documentType}</td>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb;">${row.customerName}</td>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb;">${row.productCode}</td>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb;">${row.productName}</td>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb; text-align: right;">${row.quantityLabel}</td>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb; text-align: right;">${formatCurrency(row.unitPrice)}</td>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb; text-align: right;">${formatCurrency(row.revenue)}</td>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb; text-align: right;">${formatCurrency(profitValue)}</td>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb; text-align: right;">${formatPercent(marginValue)}</td>
            </tr>
          `;
        })
        .join('');

      return `
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr>
              <th style="text-align: left; padding: 6px; border-bottom: 1px solid #e5e7eb;">Evrak</th>
              <th style="text-align: left; padding: 6px; border-bottom: 1px solid #e5e7eb;">Tip</th>
              <th style="text-align: left; padding: 6px; border-bottom: 1px solid #e5e7eb;">Cari</th>
              <th style="text-align: left; padding: 6px; border-bottom: 1px solid #e5e7eb;">Stok</th>
              <th style="text-align: left; padding: 6px; border-bottom: 1px solid #e5e7eb;">Urun</th>
              <th style="text-align: right; padding: 6px; border-bottom: 1px solid #e5e7eb;">Miktar</th>
              <th style="text-align: right; padding: 6px; border-bottom: 1px solid #e5e7eb;">Birim Fiyat</th>
              <th style="text-align: right; padding: 6px; border-bottom: 1px solid #e5e7eb;">Tutar</th>
              <th style="text-align: right; padding: 6px; border-bottom: 1px solid #e5e7eb;">Kar</th>
              <th style="text-align: right; padding: 6px; border-bottom: 1px solid #e5e7eb;">Kar %</th>
            </tr>
          </thead>
          <tbody>
            ${body}
          </tbody>
        </table>
      `;
    };

    const renderAlertSection = (title: string, set: MarginAlertSet, options: { useEntry: boolean }) => `
      <div style="margin-top: 12px;">
        <h4 style="margin: 0 0 6px 0; font-size: 13px; color: #111827;">${title}</h4>
        <div style="margin-bottom: 10px;">
          <h5 style="margin: 0 0 4px 0; font-size: 12px; color: #b91c1c;">Zararli Satirlar</h5>
          ${renderAlertTable(set.negative, options)}
        </div>
        <div style="margin-bottom: 10px;">
          <h5 style="margin: 0 0 4px 0; font-size: 12px; color: #f97316;">%5 Altı Kar Satirlar</h5>
          ${renderAlertTable(set.low, options)}
        </div>
        <div>
          <h5 style="margin: 0 0 4px 0; font-size: 12px; color: #16a34a;">%70 Ustu Kar Satirlar</h5>
          ${renderAlertTable(set.high, options)}
        </div>
      </div>
    `;

    const renderTopBottomTable = (rows: MarginAggregateRow[]) => {
      if (!rows || rows.length === 0) {
        return '<p style="margin: 0; font-size: 12px; color: #6b7280;">Kayit yok.</p>';
      }
      const body = rows
        .map((row) => `
          <tr>
            <td style="padding: 6px; border-top: 1px solid #e5e7eb;">${row.name}</td>
            <td style="padding: 6px; border-top: 1px solid #e5e7eb; text-align: right;">${formatCurrency(row.revenue)}</td>
            <td style="padding: 6px; border-top: 1px solid #e5e7eb; text-align: right;">${formatCurrency(row.profit)}</td>
            <td style="padding: 6px; border-top: 1px solid #e5e7eb; text-align: right;">${formatPercent(row.avgMargin)}</td>
            <td style="padding: 6px; border-top: 1px solid #e5e7eb; text-align: right;">${formatCurrency(row.entryProfit)}</td>
            <td style="padding: 6px; border-top: 1px solid #e5e7eb; text-align: right;">${formatPercent(row.entryMargin)}</td>
            <td style="padding: 6px; border-top: 1px solid #e5e7eb; text-align: right;">${formatCount(row.count)}</td>
          </tr>
        `)
        .join('');

      return `
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr>
              <th style="text-align: left; padding: 6px; border-bottom: 1px solid #e5e7eb;">Ad</th>
              <th style="text-align: right; padding: 6px; border-bottom: 1px solid #e5e7eb;">Ciro</th>
              <th style="text-align: right; padding: 6px; border-bottom: 1px solid #e5e7eb;">Kar</th>
              <th style="text-align: right; padding: 6px; border-bottom: 1px solid #e5e7eb;">Kar %</th>
              <th style="text-align: right; padding: 6px; border-bottom: 1px solid #e5e7eb;">Kar (Son Giris)</th>
              <th style="text-align: right; padding: 6px; border-bottom: 1px solid #e5e7eb;">Kar % (Son Giris)</th>
              <th style="text-align: right; padding: 6px; border-bottom: 1px solid #e5e7eb;">Satir</th>
            </tr>
          </thead>
          <tbody>
            ${body}
          </tbody>
        </table>
      `;
    };

    const renderTopBottomSection = (title: string, group: MarginTopBottomGroup) => `
      <div style="margin-top: 12px;">
        <h4 style="margin: 0 0 6px 0; font-size: 13px; color: #111827;">${title}</h4>
        <div style="margin-bottom: 12px;">
          <h5 style="margin: 0 0 4px 0; font-size: 12px;">En Karlı Urunler</h5>
          ${renderTopBottomTable(group.products.top)}
        </div>
        <div style="margin-bottom: 12px;">
          <h5 style="margin: 0 0 4px 0; font-size: 12px;">En Dusuk Marjlı Urunler</h5>
          ${renderTopBottomTable(group.products.bottom)}
        </div>
        <div style="margin-bottom: 12px;">
          <h5 style="margin: 0 0 4px 0; font-size: 12px;">En Karlı Musteriler</h5>
          ${renderTopBottomTable(group.customers.top)}
        </div>
        <div style="margin-bottom: 12px;">
          <h5 style="margin: 0 0 4px 0; font-size: 12px;">En Dusuk Marjlı Musteriler</h5>
          ${renderTopBottomTable(group.customers.bottom)}
        </div>
        <div style="margin-bottom: 12px;">
          <h5 style="margin: 0 0 4px 0; font-size: 12px;">En Karlı Satis Personeli</h5>
          ${renderTopBottomTable(group.salespeople.top)}
        </div>
        <div>
          <h5 style="margin: 0 0 4px 0; font-size: 12px;">En Dusuk Marjlı Satis Personeli</h5>
          ${renderTopBottomTable(group.salespeople.bottom)}
        </div>
      </div>
    `;

    const renderSevenDaySummary = (summary: MarginSevenDaySummary) => {
      const overallEntryMargin = calcEntryMargin(summary.overall);
      const orderEntryMargin = calcEntryMargin(summary.orders);
      const salesEntryMargin = calcEntryMargin(summary.sales);
      return `
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr>
              <th style="text-align: left; padding: 6px; border-bottom: 1px solid #e5e7eb;">Metrik</th>
              <th style="text-align: right; padding: 6px; border-bottom: 1px solid #e5e7eb;">Genel</th>
              <th style="text-align: right; padding: 6px; border-bottom: 1px solid #e5e7eb;">Siparis</th>
              <th style="text-align: right; padding: 6px; border-bottom: 1px solid #e5e7eb;">Satis</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb;">Ciro (KDV Haric)</td>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb; text-align: right;">${formatCurrency(summary.overall.totalRevenue)}</td>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb; text-align: right;">${formatCurrency(summary.orders.totalRevenue)}</td>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb; text-align: right;">${formatCurrency(summary.sales.totalRevenue)}</td>
            </tr>
            <tr>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb;">Kar (KDV Haric)</td>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb; text-align: right;">${formatCurrency(summary.overall.totalProfit)}</td>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb; text-align: right;">${formatCurrency(summary.orders.totalProfit)}</td>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb; text-align: right;">${formatCurrency(summary.sales.totalProfit)}</td>
            </tr>
            <tr>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb;">Kar (Son Giris)</td>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb; text-align: right;">${formatCurrency(summary.overall.entryProfit)}</td>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb; text-align: right;">${formatCurrency(summary.orders.entryProfit)}</td>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb; text-align: right;">${formatCurrency(summary.sales.entryProfit)}</td>
            </tr>
            <tr>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb;">Ortalama Kar %</td>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb; text-align: right;">${formatPercent(summary.overall.avgMargin)}</td>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb; text-align: right;">${formatPercent(summary.orders.avgMargin)}</td>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb; text-align: right;">${formatPercent(summary.sales.avgMargin)}</td>
            </tr>
            <tr>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb;">Ortalama Kar % (Son Giris)</td>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb; text-align: right;">${formatPercent(overallEntryMargin)}</td>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb; text-align: right;">${formatPercent(orderEntryMargin)}</td>
              <td style="padding: 6px; border-top: 1px solid #e5e7eb; text-align: right;">${formatPercent(salesEntryMargin)}</td>
            </tr>
          </tbody>
        </table>
      `;
    };
    const subject = params.subject || 'Kar Marji Raporu';

    const salespersonRows = (params.summary.salespersonSummary || []).map((entry) => `
      <tr>
        <td style="padding: 8px; border-top: 1px solid #e5e7eb; font-weight: 600;">${entry.sectorCode}</td>
        <td style="padding: 8px; border-top: 1px solid #e5e7eb; text-align: right;">${formatCurrency(entry.orderSummary.totalRevenue)}</td>
        <td style="padding: 8px; border-top: 1px solid #e5e7eb; text-align: right;">${formatCurrency(entry.orderSummary.totalProfit)}</td>
        <td style="padding: 8px; border-top: 1px solid #e5e7eb; text-align: right;">${formatPercent(entry.orderSummary.avgMargin)}</td>
        <td style="padding: 8px; border-top: 1px solid #e5e7eb; text-align: right;">${formatCount(entry.orderSummary.negativeDocuments)}</td>
        <td style="padding: 8px; border-top: 1px solid #e5e7eb; text-align: right;">${formatCount(entry.orderSummary.negativeLines)}</td>
        <td style="padding: 8px; border-top: 1px solid #e5e7eb; text-align: right;">${formatCurrency(entry.salesSummary.totalRevenue)}</td>
        <td style="padding: 8px; border-top: 1px solid #e5e7eb; text-align: right;">${formatCurrency(entry.salesSummary.totalProfit)}</td>
        <td style="padding: 8px; border-top: 1px solid #e5e7eb; text-align: right;">${formatPercent(entry.salesSummary.avgMargin)}</td>
        <td style="padding: 8px; border-top: 1px solid #e5e7eb; text-align: right;">${formatCount(entry.salesSummary.negativeDocuments)}</td>
        <td style="padding: 8px; border-top: 1px solid #e5e7eb; text-align: right;">${formatCount(entry.salesSummary.negativeLines)}</td>
      </tr>
    `).join('');

    const salespersonTable = salespersonRows.length > 0
      ? `
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr>
              <th rowspan="2" style="text-align: left; padding: 8px; border-bottom: 1px solid #e5e7eb;">Satis Personeli</th>
              <th colspan="5" style="text-align: center; padding: 8px; border-bottom: 1px solid #e5e7eb;">Siparis</th>
              <th colspan="5" style="text-align: center; padding: 8px; border-bottom: 1px solid #e5e7eb;">Satis</th>
            </tr>
            <tr>
              <th style="padding: 6px; text-align: right;">Ciro</th>
              <th style="padding: 6px; text-align: right;">Kar</th>
              <th style="padding: 6px; text-align: right;">Kar %</th>
              <th style="padding: 6px; text-align: right;">Zararli Evrak</th>
              <th style="padding: 6px; text-align: right;">Zararli Satir</th>
              <th style="padding: 6px; text-align: right;">Ciro</th>
              <th style="padding: 6px; text-align: right;">Kar</th>
              <th style="padding: 6px; text-align: right;">Kar %</th>
              <th style="padding: 6px; text-align: right;">Zararli Evrak</th>
              <th style="padding: 6px; text-align: right;">Zararli Satir</th>
            </tr>
          </thead>
          <tbody>
            ${salespersonRows}
          </tbody>
        </table>
      `
      : '<p style="margin: 0; font-size: 13px; color: #6b7280;">Satis personeli ozeti icin kayit yok.</p>';

    const alertsHtml = `
      <div style="margin-top: 12px;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #111827;">Siparis Uyarilari</h3>
        ${renderAlertSection('Guncel Maliyet', params.summary.alerts.order.current, { useEntry: false })}
        ${renderAlertSection('Son Giris', params.summary.alerts.order.entry, { useEntry: true })}
      </div>
      <div style="margin-top: 16px;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #111827;">Satis Uyarilari</h3>
        ${renderAlertSection('Guncel Maliyet', params.summary.alerts.sales.current, { useEntry: false })}
        ${renderAlertSection('Son Giris', params.summary.alerts.sales.entry, { useEntry: true })}
      </div>
    `;

    const topBottomHtml = `
      <div style="margin-top: 12px;">
        ${renderTopBottomSection('Siparis Top / Bottom', params.summary.topBottom.orders)}
      </div>
      <div style="margin-top: 16px;">
        ${renderTopBottomSection('Satis Top / Bottom', params.summary.topBottom.sales)}
      </div>
    `;

    const sevenDayHtml = `
      <div style="margin-top: 12px;">
        <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280;">
          ${formatDate(params.summary.sevenDaySummary.startDate)} - ${formatDate(params.summary.sevenDaySummary.endDate)}
        </p>
        ${renderSevenDaySummary(params.summary.sevenDaySummary)}
      </div>
    `;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
        <div style="max-width: 720px; margin: 0 auto; padding: 24px;">
          <div style="background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 22px;">Kar Marji Raporu</h1>
            <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">Rapor Tarihi: ${formatDate(params.reportDate)}</p>
          </div>

          <div style="background: white; padding: 20px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.08);">
            <h2 style="margin-top: 0; font-size: 16px; color: #111827;">Genel Ozet</h2>
            <table style="width: 100%; border-collapse: collapse;">
              ${renderBucketRow('Toplam Satir', formatCount(params.summary.totalRecords))}
              ${renderBucketRow('Toplam Evrak', formatCount(params.summary.totalDocuments))}
              ${renderBucketRow('Satis Cirosu (KDV Haric)', formatCurrency(params.summary.salesSummary.totalRevenue))}
              ${renderBucketRow('Bekleyen Siparis Tutari (KDV Haric)', formatCurrency(params.summary.orderSummary.totalRevenue))}
              ${renderBucketRow('Toplam Kar (KDV Haric)', formatCurrency(params.summary.totalProfit))}
              ${renderBucketRow('Toplam Kar (Son Giris)', formatCurrency(params.summary.entryProfit))}
              ${renderBucketRow('Ortalama Kar %', formatPercent(params.summary.avgMargin))}
              ${renderBucketRow('Ortalama Kar % (Son Giris)', formatPercent(calcEntryMargin(params.summary)))}
            </table>

            <div style="margin-top: 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px;">
              <p style="margin: 0; font-size: 13px; color: #374151;">
                Yuksek: <strong>${formatCount(params.summary.highMarginCount)}</strong> | Dusuk: <strong>${formatCount(params.summary.lowMarginCount)}</strong> | Zarar: <strong>${formatCount(params.summary.negativeMarginCount)}</strong>
              </p>
            </div>

            ${renderBucket('Siparis Ozeti', params.summary.orderSummary)}
            ${renderBucket('Satis Ozeti', params.summary.salesSummary)}

            <div style="margin-top: 18px;">
              <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #111827;">Satis Personeli Ozeti</h3>
              ${salespersonTable}
            </div>

            <div style="margin-top: 20px;">
              <h2 style="margin: 0 0 8px 0; font-size: 15px; color: #111827;">Uyari Listeleri</h2>
              ${alertsHtml}
            </div>

            <div style="margin-top: 20px;">
              <h2 style="margin: 0 0 8px 0; font-size: 15px; color: #111827;">Top / Bottom Ozetler</h2>
              ${topBottomHtml}
            </div>

            <div style="margin-top: 20px;">
              <h2 style="margin: 0 0 8px 0; font-size: 15px; color: #111827;">Son 7 Gun Mini Ozet</h2>
              ${sevenDayHtml}
            </div>

            <div style="margin-top: 18px; font-size: 13px; color: #6b7280;">
              Detaylara erismek icin B2B panelinden raporu acabilirsiniz.
              <a href="${process.env.FRONTEND_URL || '#'}" style="color: #2563eb; text-decoration: none;">Panel</a>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.sender = { email: this.senderEmail, name: this.senderName };
    sendSmtpEmail.to = recipients.map((email) => ({ email }));
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = htmlContent;
    if (params.attachment) {
      sendSmtpEmail.attachment = [params.attachment];
    }

    await this.apiInstance.sendTransacEmail(sendSmtpEmail);
  }

}

export default new EmailService();
