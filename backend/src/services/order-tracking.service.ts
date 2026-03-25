/**
 * Order Tracking Service
 *
 * Mikro'dan bekleyen mÃ¼ÅŸteri sipariÅŸlerini Ã§eker,
 * PostgreSQL'e kaydeder ve mÃ¼ÅŸterilere mail gÃ¶nderir.
 */

import { prisma } from '../utils/prisma';
import mikroService from './mikroFactory.service';
import { MIKRO_TABLES } from '../config/mikro-tables';
import warehouseWorkflowService from './warehouse-workflow.service';

interface PendingOrderItem {
  productCode: string;
  productName: string;
  unit: string;
  warehouseCode?: string | null;
  quantity: number;
  deliveredQty: number;
  remainingQty: number;
  reservedQty?: number;
  reservedDeliveredQty?: number;
  unitPrice: number;
  lineTotal: number;
  vat: number;
  rowNumber?: number;
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
  warehouseStatus?: string;
  warehouseStatusUpdatedAt?: Date | null;
}

class OrderTrackingService {
  private async reconcileDeliveredQuantitiesFromMikro(): Promise<void> {
    await mikroService.executeQuery(`
      WITH DeliveryAgg AS (
        SELECT
          sth_sip_uid as sip_guid,
          SUM(ISNULL(sth_miktar, 0)) as delivered_qty
        FROM STOK_HAREKETLERI WITH (NOLOCK)
        WHERE ISNULL(sth_iptal, 0) = 0
          AND ISNULL(sth_tip, 1) = 1
          AND ISNULL(sth_cins, 0) = 0
          AND ISNULL(sth_evraktip, 0) = 1
          AND sth_sip_uid IS NOT NULL
          AND sth_sip_uid <> '00000000-0000-0000-0000-000000000000'
        GROUP BY sth_sip_uid
      ),
      Recalculated AS (
        SELECT
          s.sip_Guid as sip_guid,
          CASE
            WHEN ISNULL(d.delivered_qty, 0) > ISNULL(s.sip_miktar, 0) THEN ISNULL(s.sip_miktar, 0)
            ELSE ISNULL(d.delivered_qty, 0)
          END as next_delivered_qty,
          CASE
            WHEN ISNULL(s.sip_rezervasyon_miktari, 0) <= 0 THEN ISNULL(s.sip_rezerveden_teslim_edilen, 0)
            WHEN ISNULL(d.delivered_qty, 0) > ISNULL(s.sip_rezervasyon_miktari, 0) THEN ISNULL(s.sip_rezervasyon_miktari, 0)
            ELSE ISNULL(d.delivered_qty, 0)
          END as next_reserved_delivered_qty
        FROM SIPARISLER s
        LEFT JOIN DeliveryAgg d
          ON d.sip_guid = s.sip_Guid
        WHERE ISNULL(s.sip_iptal, 0) = 0
          AND ISNULL(s.sip_tip, 0) = 0
          AND (
            ISNULL(s.sip_teslim_miktar, 0) > 0
            OR EXISTS (
              SELECT 1
              FROM STOK_HAREKETLERI h WITH (NOLOCK)
              WHERE h.sth_sip_uid = s.sip_Guid
                AND ISNULL(h.sth_tip, 1) = 1
                AND ISNULL(h.sth_cins, 0) = 0
                AND ISNULL(h.sth_evraktip, 0) = 1
            )
          )
      )
      UPDATE s
      SET
        sip_teslim_miktar = r.next_delivered_qty,
        sip_rezerveden_teslim_edilen = r.next_reserved_delivered_qty,
        sip_kapat_fl = CASE
          WHEN ISNULL(s.sip_miktar, 0) <= r.next_delivered_qty THEN 1
          ELSE 0
        END,
        sip_lastup_date = GETDATE()
      FROM SIPARISLER s
      INNER JOIN Recalculated r
        ON r.sip_guid = s.sip_Guid
      WHERE
        ISNULL(s.sip_teslim_miktar, 0) <> r.next_delivered_qty
        OR ISNULL(s.sip_rezerveden_teslim_edilen, 0) <> r.next_reserved_delivered_qty
        OR ISNULL(s.sip_kapat_fl, 0) <> CASE
          WHEN ISNULL(s.sip_miktar, 0) <= r.next_delivered_qty THEN 1
          ELSE 0
        END
    `);
  }

  /**
   * Mikro'dan bekleyen sipariÅŸleri Ã§ek ve PostgreSQL'e kaydet
   */
  async syncPendingOrders(): Promise<{
    success: boolean;
    ordersCount: number;
    customersCount: number;
    message: string;
  }> {
    try {
      console.log('ğŸ”„ Bekleyen sipariÅŸler sync baÅŸladÄ±...');

      // 1. Mikro'dan bekleyen sipariÅŸleri Ã§ek
      const pendingOrders = await this.fetchPendingOrdersFromMikro();
      console.log(`âœ… ${pendingOrders.length} adet bekleyen sipariÅŸ satÄ±rÄ± Ã§ekildi`);

      // 2. MÃ¼ÅŸteri bazÄ±nda grupla
      const groupedOrders = this.groupOrdersByCustomer(pendingOrders);
      console.log(`âœ… ${groupedOrders.length} mÃ¼ÅŸteri iÃ§in sipariÅŸ gruplanÄ±`);

      // 3. Mevcut kayÄ±tlarÄ±n emailSent durumunu sakla
      const existingOrders = await prisma.pendingMikroOrder.findMany({
        select: {
          mikroOrderNumber: true,
          emailSent: true,
          emailSentAt: true,
        },
      });
      const emailSentMap = new Map(
        existingOrders.map((o) => [o.mikroOrderNumber, { sent: o.emailSent, sentAt: o.emailSentAt }])
      );

      // 4. Mevcut cache'i temizle
      await prisma.pendingMikroOrder.deleteMany({});
      console.log('âœ… Eski cache temizlendi');

      // 5. Yeni verileri kaydet (emailSent durumunu koru) - upsert kullan (unique constraint iÃ§in)
      for (const order of groupedOrders) {
        const previousEmailStatus = emailSentMap.get(order.mikroOrderNumber);

        await prisma.pendingMikroOrder.upsert({
          where: {
            mikroOrderNumber: order.mikroOrderNumber,
          },
          create: {
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
            emailSent: previousEmailStatus?.sent || false,
            emailSentAt: previousEmailStatus?.sentAt || null,
          },
          update: {
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
            emailSent: previousEmailStatus?.sent || false,
            emailSentAt: previousEmailStatus?.sentAt || null,
          },
        });
      }

      // 6. Settings'e son sync zamanÄ±nÄ± kaydet
      const settings = await prisma.orderTrackingSettings.findFirst();
      if (settings) {
        await prisma.orderTrackingSettings.update({
          where: { id: settings.id },
          data: { lastSyncAt: new Date() },
        });
      }

      console.log('âœ… Bekleyen sipariÅŸler sync tamamlandÄ±');

      return {
        success: true,
        ordersCount: groupedOrders.length,
        customersCount: new Set(groupedOrders.map((o) => o.customerCode)).size,
        message: `${groupedOrders.length} sipariÅŸ, ${
          new Set(groupedOrders.map((o) => o.customerCode)).size
        } mÃ¼ÅŸteri sync edildi`,
      };
    } catch (error: any) {
      console.error('âŒ Sync hatasÄ±:', error);
      return {
        success: false,
        ordersCount: 0,
        customersCount: 0,
        message: error.message || 'Bilinmeyen hata',
      };
    }
  }

  /**
   * Mikro'dan bekleyen sipariÅŸleri Ã§ek (ham veri)
   */
  private async fetchPendingOrdersFromMikro(): Promise<any[]> {
    // Ä°ki aÅŸamalÄ± yaklaÅŸÄ±m:
    // 1. Sadece en az 1 kalemi bekleyen SÄ°PARÄ°ÅLERÄ° bul (WITH kullanarak)
    // 2. O sipariÅŸlerin TÃœM satÄ±rlarÄ±nÄ± getir (hem delivered hem pending)
    const query = `
      WITH PendingOrderNumbers AS (
        SELECT DISTINCT
          ${MIKRO_TABLES.ORDERS_COLUMNS.ORDER_SERIES} as seri,
          ${MIKRO_TABLES.ORDERS_COLUMNS.ORDER_SEQUENCE} as sira
        FROM ${MIKRO_TABLES.ORDERS}
        WHERE ${MIKRO_TABLES.ORDERS_COLUMNS.CUSTOMER_CODE} IS NOT NULL
          AND ${MIKRO_TABLES.ORDERS_COLUMNS.TYPE} = 0
          AND ${MIKRO_TABLES.ORDERS_COLUMNS.CANCELLED} = 0
          AND ${MIKRO_TABLES.ORDERS_COLUMNS.CLOSED} = 0
          AND (${MIKRO_TABLES.ORDERS_COLUMNS.QUANTITY} - ISNULL(${MIKRO_TABLES.ORDERS_COLUMNS.DELIVERED_QUANTITY}, 0)) > 0
      )
      SELECT
        s.sip_evrakno_seri,
        s.sip_evrakno_sira,
        s.sip_satirno,
        s.sip_tarih,
        s.sip_teslim_tarih,
        s.sip_musteri_kod,
        s.${MIKRO_TABLES.ORDERS_COLUMNS.WAREHOUSE_NO} as depo_kodu,
        c.cari_unvan1 as musteri_adi,
        c.${MIKRO_TABLES.CARI_COLUMNS.EMAIL} as musteri_email,
        c.${MIKRO_TABLES.CARI_COLUMNS.SECTOR_CODE} as sektor_kodu,
        s.sip_stok_kod,
        st.sto_isim as urun_adi,
        st.sto_birim1_ad as birim,
        s.sip_miktar,
        ISNULL(s.sip_teslim_miktar, 0) as teslim_miktar,
        (s.sip_miktar - ISNULL(s.sip_teslim_miktar, 0)) as kalan_miktar,
        ISNULL(s.sip_rezervasyon_miktari, 0) as rezerve_miktar,
        ISNULL(s.sip_rezerveden_teslim_edilen, 0) as rezerve_teslim_miktar,
        s.sip_b_fiyat as birim_fiyat,
        s.sip_tutar as tutar,
        s.sip_vergi as kdv
      FROM ${MIKRO_TABLES.ORDERS} s
      INNER JOIN PendingOrderNumbers p
        ON s.${MIKRO_TABLES.ORDERS_COLUMNS.ORDER_SERIES} = p.seri
        AND s.${MIKRO_TABLES.ORDERS_COLUMNS.ORDER_SEQUENCE} = p.sira
      LEFT JOIN ${MIKRO_TABLES.PRODUCTS} st
        ON s.${MIKRO_TABLES.ORDERS_COLUMNS.PRODUCT_CODE} = st.${MIKRO_TABLES.PRODUCTS_COLUMNS.CODE}
      LEFT JOIN ${MIKRO_TABLES.CARI} c
        ON s.${MIKRO_TABLES.ORDERS_COLUMNS.CUSTOMER_CODE} = c.${MIKRO_TABLES.CARI_COLUMNS.CODE}
      WHERE s.${MIKRO_TABLES.ORDERS_COLUMNS.CUSTOMER_CODE} IS NOT NULL
        AND s.${MIKRO_TABLES.ORDERS_COLUMNS.TYPE} = 0
        AND s.${MIKRO_TABLES.ORDERS_COLUMNS.CANCELLED} = 0
        AND s.${MIKRO_TABLES.ORDERS_COLUMNS.CLOSED} = 0
        AND (
          c.${MIKRO_TABLES.CARI_COLUMNS.SECTOR_CODE} IS NULL
          OR c.${MIKRO_TABLES.CARI_COLUMNS.SECTOR_CODE} NOT LIKE 'SATICI%'
        )
      ORDER BY s.${MIKRO_TABLES.ORDERS_COLUMNS.DATE} DESC,
               s.${MIKRO_TABLES.ORDERS_COLUMNS.ORDER_SERIES},
               s.${MIKRO_TABLES.ORDERS_COLUMNS.ORDER_SEQUENCE}
    `;

    const result = await mikroService.executeQuery(query);
    return result;
  }

  /**
   * Mikro'dan tedarikçilere verilen (satın alma) açık siparişleri çek
   * sip_tip = 1
   */
  private async fetchSupplierOrdersFromMikro(): Promise<any[]> {
    const query = `
      WITH PendingSupplierOrderNumbers AS (
        SELECT DISTINCT
          ${MIKRO_TABLES.ORDERS_COLUMNS.ORDER_SERIES} as seri,
          ${MIKRO_TABLES.ORDERS_COLUMNS.ORDER_SEQUENCE} as sira
        FROM ${MIKRO_TABLES.ORDERS} s
        LEFT JOIN ${MIKRO_TABLES.CARI} c
          ON s.${MIKRO_TABLES.ORDERS_COLUMNS.CUSTOMER_CODE} = c.${MIKRO_TABLES.CARI_COLUMNS.CODE}
        WHERE s.${MIKRO_TABLES.ORDERS_COLUMNS.CUSTOMER_CODE} IS NOT NULL
          AND s.${MIKRO_TABLES.ORDERS_COLUMNS.TYPE} = 1
          AND s.${MIKRO_TABLES.ORDERS_COLUMNS.CANCELLED} = 0
          AND s.${MIKRO_TABLES.ORDERS_COLUMNS.CLOSED} = 0
          AND (${MIKRO_TABLES.ORDERS_COLUMNS.QUANTITY} - ISNULL(${MIKRO_TABLES.ORDERS_COLUMNS.DELIVERED_QUANTITY}, 0)) > 0
          AND c.${MIKRO_TABLES.CARI_COLUMNS.SECTOR_CODE} LIKE 'SATICI%'
      )
      SELECT
        s.sip_evrakno_seri,
        s.sip_evrakno_sira,
        s.sip_satirno,
        s.sip_tarih,
        s.sip_teslim_tarih,
        s.sip_musteri_kod,
        s.${MIKRO_TABLES.ORDERS_COLUMNS.WAREHOUSE_NO} as depo_kodu,
        c.cari_unvan1 as musteri_adi,
        c.${MIKRO_TABLES.CARI_COLUMNS.EMAIL} as musteri_email,
        c.${MIKRO_TABLES.CARI_COLUMNS.SECTOR_CODE} as sektor_kodu,
        s.sip_stok_kod,
        st.sto_isim as urun_adi,
        st.sto_birim1_ad as birim,
        s.sip_miktar,
        ISNULL(s.sip_teslim_miktar, 0) as teslim_miktar,
        (s.sip_miktar - ISNULL(s.sip_teslim_miktar, 0)) as kalan_miktar,
        ISNULL(s.sip_rezervasyon_miktari, 0) as rezerve_miktar,
        ISNULL(s.sip_rezerveden_teslim_edilen, 0) as rezerve_teslim_miktar,
        s.sip_b_fiyat as birim_fiyat,
        s.sip_tutar as tutar,
        s.sip_vergi as kdv
      FROM ${MIKRO_TABLES.ORDERS} s
      INNER JOIN PendingSupplierOrderNumbers p
        ON s.${MIKRO_TABLES.ORDERS_COLUMNS.ORDER_SERIES} = p.seri
        AND s.${MIKRO_TABLES.ORDERS_COLUMNS.ORDER_SEQUENCE} = p.sira
      LEFT JOIN ${MIKRO_TABLES.PRODUCTS} st
        ON s.${MIKRO_TABLES.ORDERS_COLUMNS.PRODUCT_CODE} = st.${MIKRO_TABLES.PRODUCTS_COLUMNS.CODE}
      LEFT JOIN ${MIKRO_TABLES.CARI} c
        ON s.${MIKRO_TABLES.ORDERS_COLUMNS.CUSTOMER_CODE} = c.${MIKRO_TABLES.CARI_COLUMNS.CODE}
      WHERE s.${MIKRO_TABLES.ORDERS_COLUMNS.CUSTOMER_CODE} IS NOT NULL
        AND s.${MIKRO_TABLES.ORDERS_COLUMNS.TYPE} = 1
        AND s.${MIKRO_TABLES.ORDERS_COLUMNS.CANCELLED} = 0
        AND s.${MIKRO_TABLES.ORDERS_COLUMNS.CLOSED} = 0
        AND c.${MIKRO_TABLES.CARI_COLUMNS.SECTOR_CODE} LIKE 'SATICI%'
      ORDER BY s.${MIKRO_TABLES.ORDERS_COLUMNS.DATE} DESC,
               s.${MIKRO_TABLES.ORDERS_COLUMNS.ORDER_SERIES},
               s.${MIKRO_TABLES.ORDERS_COLUMNS.ORDER_SEQUENCE}
    `;

    const result = await mikroService.executeQuery(query);
    return result;
  }

  /**
   * SipariÅŸleri mÃ¼ÅŸteri bazÄ±nda grupla
   *
   * Her mÃ¼ÅŸteri iÃ§in sipariÅŸler tek bir kayÄ±tta birleÅŸtirilir.
   * AynÄ± sipariÅŸ numarasÄ±ndaki satÄ±rlar items array'ine eklenir.
   */
  private groupOrdersByCustomer(rawOrders: any[]): PendingOrder[] {
    const orderMap = new Map<string, PendingOrder>();

    for (const row of rawOrders) {
      const orderNumber = `${row.sip_evrakno_seri}-${row.sip_evrakno_sira}`;

      // Bu sipariÅŸ daha Ã¶nce iÅŸlendi mi?
      let order = orderMap.get(orderNumber);

      if (!order) {
        // Yeni sipariÅŸ oluÅŸtur
        order = {
          mikroOrderNumber: orderNumber,
          orderSeries: row.sip_evrakno_seri,
          orderSequence: row.sip_evrakno_sira,
          customerCode: row.sip_musteri_kod,
          customerName: row.musteri_adi || 'Bilinmeyen MÃ¼ÅŸteri',
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

      const remainingQty = Number(row.kalan_miktar) || 0;
      if (remainingQty <= 0) {
        continue;
      }

      // AynÄ± satÄ±r numarasÄ± daha Ã¶nce eklendi mi? (Duplicate kontrolÃ¼)
      const isDuplicate = order.items.some(
        (item) => item.productCode === row.sip_stok_kod &&
                  (item as any).rowNumber === row.sip_satirno
      );

      if (isDuplicate) {
        console.warn(`âš ï¸ Duplicate satÄ±r atlandÄ±: SipariÅŸ ${orderNumber}, SatÄ±r ${row.sip_satirno}, ÃœrÃ¼n ${row.sip_stok_kod}`);
        continue;
      }

      // Kalan sipariÅŸ tutarÄ±nÄ± hesapla (kalan_miktar Ã— birim_fiyat)
      const remainingTotal = remainingQty * row.birim_fiyat;

      // Kalan KDV'yi oransal olarak hesapla
      const kdvRate = row.tutar > 0 ? row.kdv / row.tutar : 0;
      const remainingVat = remainingTotal * kdvRate;
      const reserveQty = Math.max(Number(row.rezerve_miktar || 0), 0);
      const reserveDeliveredQty = Math.max(Number(row.rezerve_teslim_miktar || 0), 0);
      const activeReserveQty = Math.max(reserveQty - reserveDeliveredQty, 0);

      // SatÄ±r detayÄ±nÄ± ekle
      const item: any = {
        productCode: row.sip_stok_kod,
        productName: row.urun_adi || row.sip_stok_kod,
        unit: row.birim || 'ADET',
        warehouseCode: row.depo_kodu !== undefined && row.depo_kodu !== null ? String(row.depo_kodu) : null,
        quantity: row.sip_miktar,
        deliveredQty: row.teslim_miktar,
        remainingQty,
        reservedQty: activeReserveQty,
        reservedDeliveredQty: reserveDeliveredQty,
        unitPrice: row.birim_fiyat,
        lineTotal: remainingTotal,  // KALAN TUTAR
        vat: remainingVat,  // KALAN KDV
        rowNumber: row.sip_satirno,  // SatÄ±r numarasÄ±nÄ± sakla (duplicate kontrolÃ¼ iÃ§in)
      };

      order.items.push(item);
      order.itemCount++;
      order.totalAmount += remainingTotal;  // KALAN TUTARI TOPLA
      order.totalVAT += remainingVat;  // KALAN KDV'YÄ° TOPLA
      order.grandTotal = order.totalAmount + order.totalVAT;
    }

    return Array.from(orderMap.values()).filter((order) => order.itemCount > 0);
  }

  /**
   * Belirli bir mÃ¼ÅŸterinin bekleyen sipariÅŸlerini getir
   */
  async getCustomerPendingOrders(customerCode: string): Promise<PendingOrder[]> {
    const orders = await prisma.pendingMikroOrder.findMany({
      where: { customerCode },
      orderBy: { orderDate: 'desc' },
    });

    const workflowMap = await warehouseWorkflowService.getWorkflowStatusMap(
      orders.map((order) => order.mikroOrderNumber)
    );

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
      warehouseStatus: workflowMap.get(order.mikroOrderNumber)?.status || 'PENDING',
      warehouseStatusUpdatedAt: workflowMap.get(order.mikroOrderNumber)?.updatedAt || null,
    }));
  }

  /**
   * TÃ¼m bekleyen sipariÅŸleri getir (admin iÃ§in)
   */
  async getAllPendingOrders(): Promise<PendingOrder[]> {
    const orders = await prisma.pendingMikroOrder.findMany({
      orderBy: [{ orderDate: 'desc' }, { mikroOrderNumber: 'asc' }],
    });

    const workflowMap = await warehouseWorkflowService.getWorkflowStatusMap(
      orders.map((order) => order.mikroOrderNumber)
    );

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
      warehouseStatus: workflowMap.get(order.mikroOrderNumber)?.status || 'PENDING',
      warehouseStatusUpdatedAt: workflowMap.get(order.mikroOrderNumber)?.updatedAt || null,
    }));
  }

  /**
   * SipariÅŸ takip ayarlarÄ±nÄ± getir
   */
  async getSettings() {
    let settings = await prisma.orderTrackingSettings.findFirst();

    // Ayar yoksa oluÅŸtur
    if (!settings) {
      settings = await prisma.orderTrackingSettings.create({
        data: {
          syncEnabled: true,
          syncSchedule: '0 8 * * 2,5', // SalÄ± + Cuma, 08:00
          emailEnabled: true,
          emailSubject: 'Bekleyen SipariÅŸleriniz',
          emailTemplate: 'default',
        },
      });
    }

    return settings;
  }

  /**
   * SipariÅŸ takip ayarlarÄ±nÄ± gÃ¼ncelle
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
   * MÃ¼ÅŸteri bazÄ±nda sipariÅŸ Ã¶zetini getir
   * SektÃ¶r kodu "satÄ±cÄ±" olanlarÄ± filtreler (bunlar tedarikÃ§i/satÄ±cÄ± sipariÅŸleridir)
   */
  async getCustomerSummary() {
    const orders = await prisma.pendingMikroOrder.findMany({
      where: {
        // SektÃ¶r kodu "SATICI" olanlarÄ± hariÃ§ tut (SATICI, SATICI BARTIR vb.)
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

    // MÃ¼ÅŸteri bazÄ±nda grupla
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
   * Tedarikçilere verilen açık satın alma siparişlerini getir (sip_tip=1)
   */
  async getSupplierSummary() {
    const rawOrders = await this.fetchSupplierOrdersFromMikro();
    const orders = this.groupOrdersByCustomer(rawOrders);

    // SatÄ±cÄ± bazÄ±nda grupla
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
          items: PendingOrderItem[];
        }>;
      }
    >();

    for (const order of orders) {
      if (!summary.has(order.customerCode)) {
        summary.set(order.customerCode, {
          customerCode: order.customerCode,
          customerName: order.customerName,
          customerEmail: order.customerEmail || null,
          sectorCode: order.sectorCode || null,
          ordersCount: 0,
          totalAmount: 0,
          emailSent: false,
          orders: [],
        });
      }

      const customerSummary = summary.get(order.customerCode)!;
      customerSummary.ordersCount++;
      customerSummary.totalAmount += order.grandTotal;
      customerSummary.orders.push({
        id: order.mikroOrderNumber,
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
