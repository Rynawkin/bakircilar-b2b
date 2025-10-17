/**
 * Order Tracking Service
 *
 * Mikro'dan bekleyen müşteri siparişlerini çeker,
 * PostgreSQL'e kaydeder ve müşterilere mail gönderir.
 */

import { prisma } from '../utils/prisma';
import mikroService from './mikroFactory.service';
import { MIKRO_TABLES } from '../config/mikro-tables';

interface PendingOrderItem {
  productCode: string;
  productName: string;
  unit: string;
  quantity: number;
  deliveredQty: number;
  remainingQty: number;
  unitPrice: number;
  lineTotal: number;
  vat: number;
}

interface PendingOrder {
  mikroOrderNumber: string;
  orderSeries: string;
  orderSequence: number;
  customerCode: string;
  customerName: string;
  customerEmail?: string | null;
  sectorCode?: string | null;
  orderDate: Date;
  deliveryDate: Date | null;
  items: PendingOrderItem[];
  itemCount: number;
  totalAmount: number;
  totalVAT: number;
  grandTotal: number;
}

class OrderTrackingService {
  /**
   * Mikro'dan bekleyen siparişleri çek ve PostgreSQL'e kaydet
   */
  async syncPendingOrders(): Promise<{
    success: boolean;
    ordersCount: number;
    customersCount: number;
    message: string;
  }> {
    try {
      console.log('🔄 Bekleyen siparişler sync başladı...');

      // 1. Mikro'dan bekleyen siparişleri çek
      const pendingOrders = await this.fetchPendingOrdersFromMikro();
      console.log(`✅ ${pendingOrders.length} adet bekleyen sipariş satırı çekildi`);

      // 2. Müşteri bazında grupla
      const groupedOrders = this.groupOrdersByCustomer(pendingOrders);
      console.log(`✅ ${groupedOrders.length} müşteri için sipariş gruplanı`);

      // 3. Mevcut cache'i temizle
      await prisma.pendingMikroOrder.deleteMany({});
      console.log('✅ Eski cache temizlendi');

      // 4. Yeni verileri kaydet
      for (const order of groupedOrders) {
        await prisma.pendingMikroOrder.create({
          data: {
            mikroOrderNumber: order.mikroOrderNumber,
            orderSeries: order.orderSeries,
            orderSequence: order.orderSequence,
            customerCode: order.customerCode,
            customerName: order.customerName,
            customerEmail: order.customerEmail || null,
            sectorCode: order.sectorCode || null,
            orderDate: order.orderDate,
            deliveryDate: order.deliveryDate,
            items: order.items as any,
            itemCount: order.itemCount,
            totalAmount: order.totalAmount,
            totalVAT: order.totalVAT,
            grandTotal: order.grandTotal,
            emailSent: false,
          },
        });
      }

      // 5. Settings'e son sync zamanını kaydet
      const settings = await prisma.orderTrackingSettings.findFirst();
      if (settings) {
        await prisma.orderTrackingSettings.update({
          where: { id: settings.id },
          data: { lastSyncAt: new Date() },
        });
      }

      console.log('✅ Bekleyen siparişler sync tamamlandı');

      return {
        success: true,
        ordersCount: groupedOrders.length,
        customersCount: new Set(groupedOrders.map((o) => o.customerCode)).size,
        message: `${groupedOrders.length} sipariş, ${
          new Set(groupedOrders.map((o) => o.customerCode)).size
        } müşteri sync edildi`,
      };
    } catch (error: any) {
      console.error('❌ Sync hatası:', error);
      return {
        success: false,
        ordersCount: 0,
        customersCount: 0,
        message: error.message || 'Bilinmeyen hata',
      };
    }
  }

  /**
   * Mikro'dan bekleyen siparişleri çek (ham veri)
   */
  private async fetchPendingOrdersFromMikro(): Promise<any[]> {
    const query = `
      SELECT
        s.sip_evrakno_seri,
        s.sip_evrakno_sira,
        s.sip_satirno,
        s.sip_tarih,
        s.sip_teslim_tarih,
        s.sip_musteri_kod,
        c.cari_unvan1 as musteri_adi,
        c.${MIKRO_TABLES.CARI_COLUMNS.EMAIL} as musteri_email,
        c.${MIKRO_TABLES.CARI_COLUMNS.SECTOR_CODE} as sektor_kodu,
        s.sip_stok_kod,
        st.sto_isim as urun_adi,
        st.sto_birim1_ad as birim,
        s.sip_miktar,
        ISNULL(s.sip_teslim_miktar, 0) as teslim_miktar,
        (s.sip_miktar - ISNULL(s.sip_teslim_miktar, 0)) as kalan_miktar,
        s.sip_b_fiyat as birim_fiyat,
        s.sip_tutar as tutar,
        s.sip_vergi as kdv
      FROM ${MIKRO_TABLES.ORDERS} s
      LEFT JOIN ${MIKRO_TABLES.PRODUCTS} st
        ON s.${MIKRO_TABLES.ORDERS_COLUMNS.PRODUCT_CODE} = st.${MIKRO_TABLES.PRODUCTS_COLUMNS.CODE}
      LEFT JOIN ${MIKRO_TABLES.CARI} c
        ON s.${MIKRO_TABLES.ORDERS_COLUMNS.CUSTOMER_CODE} = c.${MIKRO_TABLES.CARI_COLUMNS.CODE}
      WHERE s.${MIKRO_TABLES.ORDERS_COLUMNS.CUSTOMER_CODE} IS NOT NULL
        AND s.${MIKRO_TABLES.ORDERS_COLUMNS.CANCELLED} = 0
        AND s.${MIKRO_TABLES.ORDERS_COLUMNS.CLOSED} = 0
        AND (s.${MIKRO_TABLES.ORDERS_COLUMNS.QUANTITY} - ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.DELIVERED_QUANTITY}, 0)) > 0
      ORDER BY s.${MIKRO_TABLES.ORDERS_COLUMNS.DATE} DESC,
               s.${MIKRO_TABLES.ORDERS_COLUMNS.ORDER_SERIES},
               s.${MIKRO_TABLES.ORDERS_COLUMNS.ORDER_SEQUENCE}
    `;

    const result = await mikroService.executeQuery(query);
    return result;
  }

  /**
   * Siparişleri müşteri bazında grupla
   *
   * Her müşteri için siparişler tek bir kayıtta birleştirilir.
   * Aynı sipariş numarasındaki satırlar items array'ine eklenir.
   */
  private groupOrdersByCustomer(rawOrders: any[]): PendingOrder[] {
    const orderMap = new Map<string, PendingOrder>();

    for (const row of rawOrders) {
      const orderNumber = `${row.sip_evrakno_seri}-${row.sip_evrakno_sira}`;

      // Bu sipariş daha önce işlendi mi?
      let order = orderMap.get(orderNumber);

      if (!order) {
        // Yeni sipariş oluştur
        order = {
          mikroOrderNumber: orderNumber,
          orderSeries: row.sip_evrakno_seri,
          orderSequence: row.sip_evrakno_sira,
          customerCode: row.sip_musteri_kod,
          customerName: row.musteri_adi || 'Bilinmeyen Müşteri',
          customerEmail: row.musteri_email || null,
          sectorCode: row.sektor_kodu || null,
          orderDate: new Date(row.sip_tarih),
          deliveryDate: row.sip_teslim_tarih ? new Date(row.sip_teslim_tarih) : null,
          items: [],
          itemCount: 0,
          totalAmount: 0,
          totalVAT: 0,
          grandTotal: 0,
        };
        orderMap.set(orderNumber, order);
      }

      // Satır detayını ekle
      const item: PendingOrderItem = {
        productCode: row.sip_stok_kod,
        productName: row.urun_adi || row.sip_stok_kod,
        unit: row.birim || 'ADET',
        quantity: row.sip_miktar,
        deliveredQty: row.teslim_miktar,
        remainingQty: row.kalan_miktar,
        unitPrice: row.birim_fiyat,
        lineTotal: row.tutar,
        vat: row.kdv,
      };

      order.items.push(item);
      order.itemCount++;
      order.totalAmount += row.tutar;
      order.totalVAT += row.kdv;
      order.grandTotal = order.totalAmount + order.totalVAT;
    }

    return Array.from(orderMap.values());
  }

  /**
   * Belirli bir müşterinin bekleyen siparişlerini getir
   */
  async getCustomerPendingOrders(customerCode: string): Promise<PendingOrder[]> {
    const orders = await prisma.pendingMikroOrder.findMany({
      where: { customerCode },
      orderBy: { orderDate: 'desc' },
    });

    return orders.map((order) => ({
      mikroOrderNumber: order.mikroOrderNumber,
      orderSeries: order.orderSeries,
      orderSequence: order.orderSequence,
      customerCode: order.customerCode,
      customerName: order.customerName,
      orderDate: order.orderDate,
      deliveryDate: order.deliveryDate,
      items: order.items as any as PendingOrderItem[],
      itemCount: order.itemCount,
      totalAmount: order.totalAmount,
      totalVAT: order.totalVAT,
      grandTotal: order.grandTotal,
    }));
  }

  /**
   * Tüm bekleyen siparişleri getir (admin için)
   */
  async getAllPendingOrders(): Promise<PendingOrder[]> {
    const orders = await prisma.pendingMikroOrder.findMany({
      orderBy: [{ orderDate: 'desc' }, { mikroOrderNumber: 'asc' }],
    });

    return orders.map((order) => ({
      mikroOrderNumber: order.mikroOrderNumber,
      orderSeries: order.orderSeries,
      orderSequence: order.orderSequence,
      customerCode: order.customerCode,
      customerName: order.customerName,
      orderDate: order.orderDate,
      deliveryDate: order.deliveryDate,
      items: order.items as any as PendingOrderItem[],
      itemCount: order.itemCount,
      totalAmount: order.totalAmount,
      totalVAT: order.totalVAT,
      grandTotal: order.grandTotal,
    }));
  }

  /**
   * Sipariş takip ayarlarını getir
   */
  async getSettings() {
    let settings = await prisma.orderTrackingSettings.findFirst();

    // Ayar yoksa oluştur
    if (!settings) {
      settings = await prisma.orderTrackingSettings.create({
        data: {
          syncEnabled: true,
          syncSchedule: '0 8 * * 2,5', // Salı + Cuma, 08:00
          emailEnabled: true,
          emailSubject: 'Bekleyen Siparişleriniz',
          emailTemplate: 'default',
        },
      });
    }

    return settings;
  }

  /**
   * Sipariş takip ayarlarını güncelle
   */
  async updateSettings(data: {
    syncEnabled?: boolean;
    syncSchedule?: string;
    emailEnabled?: boolean;
    emailSubject?: string;
    emailTemplate?: string;
  }) {
    let settings = await prisma.orderTrackingSettings.findFirst();

    if (!settings) {
      settings = await prisma.orderTrackingSettings.create({ data: {} });
    }

    return await prisma.orderTrackingSettings.update({
      where: { id: settings.id },
      data,
    });
  }

  /**
   * Müşteri bazında sipariş özetini getir
   * Sektör kodu "satıcı" olanları filtreler (bunlar tedarikçi/satıcı siparişleridir)
   */
  async getCustomerSummary() {
    const orders = await prisma.pendingMikroOrder.findMany({
      where: {
        // Sektör kodu "satıcı" olanları hariç tut (büyük/küçük harf duyarsız)
        OR: [
          { sectorCode: null },
          {
            NOT: {
              sectorCode: {
                equals: 'satıcı',
                mode: 'insensitive',
              },
            },
          },
        ],
      },
      select: {
        id: true,
        mikroOrderNumber: true,
        customerCode: true,
        customerName: true,
        customerEmail: true,
        sectorCode: true,
        orderDate: true,
        deliveryDate: true,
        items: true,
        itemCount: true,
        totalAmount: true,
        totalVAT: true,
        grandTotal: true,
        emailSent: true,
      },
      orderBy: [{ customerCode: 'asc' }, { orderDate: 'desc' }],
    });

    // Müşteri bazında grupla
    const summary = new Map<
      string,
      {
        customerCode: string;
        customerName: string;
        customerEmail: string | null;
        sectorCode: string | null;
        ordersCount: number;
        totalAmount: number;
        emailSent: boolean;
        orders: Array<{
          id: string;
          mikroOrderNumber: string;
          orderDate: Date;
          deliveryDate: Date | null;
          itemCount: number;
          grandTotal: number;
          items: any;
        }>;
      }
    >();

    for (const order of orders) {
      if (!summary.has(order.customerCode)) {
        summary.set(order.customerCode, {
          customerCode: order.customerCode,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          sectorCode: order.sectorCode,
          ordersCount: 0,
          totalAmount: 0,
          emailSent: order.emailSent,
          orders: [],
        });
      }

      const customerSummary = summary.get(order.customerCode)!;
      customerSummary.ordersCount++;
      customerSummary.totalAmount += order.grandTotal;
      customerSummary.orders.push({
        id: order.id,
        mikroOrderNumber: order.mikroOrderNumber,
        orderDate: order.orderDate,
        deliveryDate: order.deliveryDate,
        itemCount: order.itemCount,
        grandTotal: order.grandTotal,
        items: order.items,
      });
    }

    return Array.from(summary.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }

  /**
   * Satıcı/tedarikçi siparişlerini getir (sektör kodu "satıcı" olanlar)
   */
  async getSupplierSummary() {
    const orders = await prisma.pendingMikroOrder.findMany({
      where: {
        sectorCode: {
          equals: 'satıcı',
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        mikroOrderNumber: true,
        customerCode: true,
        customerName: true,
        customerEmail: true,
        sectorCode: true,
        orderDate: true,
        deliveryDate: true,
        items: true,
        itemCount: true,
        totalAmount: true,
        totalVAT: true,
        grandTotal: true,
        emailSent: true,
      },
      orderBy: [{ customerCode: 'asc' }, { orderDate: 'desc' }],
    });

    // Satıcı bazında grupla
    const summary = new Map<
      string,
      {
        customerCode: string;
        customerName: string;
        customerEmail: string | null;
        sectorCode: string | null;
        ordersCount: number;
        totalAmount: number;
        emailSent: boolean;
        orders: Array<{
          id: string;
          mikroOrderNumber: string;
          orderDate: Date;
          deliveryDate: Date | null;
          itemCount: number;
          grandTotal: number;
          items: any;
        }>;
      }
    >();

    for (const order of orders) {
      if (!summary.has(order.customerCode)) {
        summary.set(order.customerCode, {
          customerCode: order.customerCode,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          sectorCode: order.sectorCode,
          ordersCount: 0,
          totalAmount: 0,
          emailSent: order.emailSent,
          orders: [],
        });
      }

      const customerSummary = summary.get(order.customerCode)!;
      customerSummary.ordersCount++;
      customerSummary.totalAmount += order.grandTotal;
      customerSummary.orders.push({
        id: order.id,
        mikroOrderNumber: order.mikroOrderNumber,
        orderDate: order.orderDate,
        deliveryDate: order.deliveryDate,
        itemCount: order.itemCount,
        grandTotal: order.grandTotal,
        items: order.items,
      });
    }

    return Array.from(summary.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }
}

export default new OrderTrackingService();
