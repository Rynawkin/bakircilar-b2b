/**
 * Email Service - Brevo (SendinBlue) Integration
 *
 * Bekleyen siparişleri müşterilere mail ile gönderir.
 */

import { prisma } from '../utils/prisma';
import * as brevo from '@sendinblue/client';

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
      remainingQty: number;
      unitPrice: number;
      lineTotal: number;
    }>;
    totalAmount: number;
    totalVAT: number;
    grandTotal: number;
  }>;
  totalOrdersAmount: number;
}

class EmailService {
  private apiInstance: brevo.TransactionalEmailsApi;
  private senderEmail: string;
  private senderName: string;

  constructor() {
    // Brevo API client oluştur
    const apiKey = brevo.ApiClient.instance.authentications['api-key'];
    apiKey.apiKey = process.env.BREVO_API_KEY || '';

    this.apiInstance = new brevo.TransactionalEmailsApi();
    this.senderEmail = process.env.BREVO_SENDER_EMAIL || 'noreply@bakircilar.com';
    this.senderName = process.env.BREVO_SENDER_NAME || 'Bakırcılar B2B';
  }

  /**
   * Tüm müşterilere bekleyen siparişlerini mail ile gönder
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
          await this.sendOrderEmail(customer);
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
  async sendOrderEmail(data: OrderEmailData): Promise<void> {
    const htmlContent = this.generateEmailHTML(data);

    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.sender = { email: this.senderEmail, name: this.senderName };
    sendSmtpEmail.to = [{ email: data.customerEmail, name: data.customerName }];
    sendSmtpEmail.subject = 'Bekleyen Siparişleriniz';
    sendSmtpEmail.htmlContent = htmlContent;

    const response = await this.apiInstance.sendTransacEmail(sendSmtpEmail);

    // Log'a kaydet
    await prisma.emailLog.create({
      data: {
        recipientEmail: data.customerEmail,
        recipientName: data.customerName,
        customerCode: data.customerCode,
        subject: 'Bekleyen Siparişleriniz',
        ordersCount: data.orders.length,
        totalAmount: data.totalOrdersAmount,
        success: true,
        brevoMessageId: response.messageId || null,
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
        // Müşterinin email adresini User tablosundan al
        const user = await prisma.user.findFirst({
          where: { mikroCariCode: order.customerCode },
        });

        if (!user || !user.email) {
          console.warn(`⚠️ Müşteri email bulunamadı: ${order.customerCode}`);
          continue;
        }

        customerMap.set(order.customerCode, {
          customerCode: order.customerCode,
          customerName: order.customerName,
          customerEmail: user.email,
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
        itemsHTML += `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.productName}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.remainingQty} ${item.unit}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item.unitPrice)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item.lineTotal)}</td>
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
                <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Miktar</th>
                <th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd;">Birim Fiyat</th>
                <th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd;">Tutar</th>
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
            <h1 style="margin: 0; font-size: 28px;">📋 Bekleyen Siparişleriniz</h1>
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
              Sorularınız için: <a href="mailto:info@bakircilar.com" style="color: white; text-decoration: none;">info@bakircilar.com</a>
            </p>
            <p style="margin: 10px 0 0 0; font-size: 12px; opacity: 0.6;">
              © ${new Date().getFullYear()} Bakırcılar. Tüm hakları saklıdır.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
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
              productName: 'Test Ürün 1',
              unit: 'ADET',
              remainingQty: 10,
              unitPrice: 100,
              lineTotal: 1000,
            },
            {
              productName: 'Test Ürün 2',
              unit: 'KG',
              remainingQty: 5,
              unitPrice: 200,
              lineTotal: 1000,
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
}

export default new EmailService();
