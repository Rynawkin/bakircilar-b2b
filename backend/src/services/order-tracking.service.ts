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
  warehouseStocks?: {
    merkez: number;
    topca: number;
  };
  fulfillment?: {
    preferredWarehouseCode: string | null;
    preferredWarehouseName: string;
    merkezCanFulfill: boolean;
    topcaCanFulfill: boolean;
    preferredCanFulfill: boolean;
    merkezTotalDemand: number;
    topcaTotalDemand: number;
    preferredTotalDemand: number;
    merkezAfterTotalDemand: number;
    topcaAfterTotalDemand: number;
    preferredAfterTotalDemand: number;
    hasAggregateRisk: boolean;
  };
  stockStatus?: {
    code: 'full' | 'partial' | 'none';
    label: string;
    color: 'green' | 'yellow' | 'red';
    totalStock: number;
  };
  estimatedStockEntryDate?: Date | string | null;
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

type StaffScope = {
  role?: string | null;
  assignedSectorCodes?: string[] | null;
};

type CloseOrderType = 'customer' | 'supplier';

type CloseRemainingInput = {
  mikroOrderNumber: string;
  orderType?: CloseOrderType;
  lineNumbers?: number[];
  scope?: StaffScope;
};

type CloseRemainingResult = {
  success: boolean;
  mikroOrderNumber: string;
  orderType: CloseOrderType;
  closedLineCount: number;
  message: string;
};

type UpdateLineQuantityInput = {
  mikroOrderNumber: string;
  orderType?: CloseOrderType;
  lineNumber: number;
  quantity: number;
  scope?: StaffScope;
};

type UpdateLineQuantityResult = {
  success: boolean;
  mikroOrderNumber: string;
  orderType: CloseOrderType;
  lineNumber: number;
  previousQuantity: number;
  newQuantity: number;
  deliveredQty: number;
  remainingQty: number;
  message: string;
};

const toNumber = (value: unknown): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const normalizeCode = (value: unknown): string => String(value || '').trim();

const escapeSqlString = (value: unknown): string => String(value || '').replace(/'/g, "''");

const parseMikroOrderNumber = (mikroOrderNumber: string): { series: string; sequence: number } => {
  const value = normalizeCode(mikroOrderNumber);
  const match = value.match(/^(.*)-(\d+)$/);
  if (!match) {
    throw new Error('Siparis numarasi gecersiz.');
  }

  const series = match[1].trim();
  const sequence = Number(match[2]);
  if (!series || !Number.isFinite(sequence)) {
    throw new Error('Siparis numarasi gecersiz.');
  }

  return { series, sequence };
};

const normalizeLineNumbers = (lineNumbers?: number[]): number[] => {
  if (!Array.isArray(lineNumbers)) return [];
  return Array.from(
    new Set(
      lineNumbers
        .map((line) => Number(line))
        .filter((line) => Number.isInteger(line) && line >= 0)
    )
  );
};

const httpError = (message: string, statusCode: number) => {
  const error: any = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const resolveWarehouseStockValue = (warehouseStocks: unknown, warehouseCode: string): number => {
  const target = normalizeCode(warehouseCode);
  if (!target || !warehouseStocks || typeof warehouseStocks !== 'object' || Array.isArray(warehouseStocks)) {
    return 0;
  }

  for (const [rawKey, rawValue] of Object.entries(warehouseStocks as Record<string, unknown>)) {
    const key = normalizeCode(rawKey);
    if (!key) continue;
    if (key === target) return Math.max(toNumber(rawValue), 0);
    const keyDigits = key.match(/\d+/)?.[0];
    if (keyDigits && keyDigits === target) return Math.max(toNumber(rawValue), 0);
  }

  return 0;
};

const getWarehouseName = (warehouseCode?: string | null): string => {
  const code = normalizeCode(warehouseCode);
  if (code === '1') return 'Merkez';
  if (code === '6') return 'Topca';
  return code || '-';
};

const resolveStockStatus = (
  remainingQty: number,
  stocks: { merkez: number; topca: number }
): NonNullable<PendingOrderItem['stockStatus']> => {
  const totalStock = Math.max(toNumber(stocks.merkez), 0) + Math.max(toNumber(stocks.topca), 0);

  if (remainingQty <= 0 || totalStock >= remainingQty) {
    return { code: 'full', label: 'Stok var', color: 'green', totalStock };
  }

  if (totalStock > 0) {
    return { code: 'partial', label: 'Kısmi stok mevcut', color: 'yellow', totalStock };
  }

  return { code: 'none', label: 'Stok yok', color: 'red', totalStock };
};

class OrderTrackingService {
  private buildSalesRepOrderWhere(scope?: StaffScope): { where?: any; denyAll: boolean } {
    if (scope?.role !== 'SALES_REP') {
      return { denyAll: false };
    }
    const sectorCodes = (scope.assignedSectorCodes || [])
      .map((code) => String(code || '').trim())
      .filter(Boolean);
    if (sectorCodes.length === 0) {
      return { denyAll: true };
    }
    return {
      denyAll: false,
      where: {
        sectorCode: { in: sectorCodes },
      },
    };
  }

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
        WHERE s.${MIKRO_TABLES.ORDERS_COLUMNS.CUSTOMER_CODE} IS NOT NULL
          AND s.${MIKRO_TABLES.ORDERS_COLUMNS.TYPE} = 1
          AND s.${MIKRO_TABLES.ORDERS_COLUMNS.CANCELLED} = 0
          AND s.${MIKRO_TABLES.ORDERS_COLUMNS.CLOSED} = 0
          AND ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.WAREHOUSE_NO}, 0) IN (1, 6)
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
        AND ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.WAREHOUSE_NO}, 0) IN (1, 6)
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

  async enrichOrdersWithWarehouseAvailability<T extends { items: any }>(
    orders: T[]
  ): Promise<T[]> {
    const productCodes = Array.from(
      new Set(
        orders.flatMap((order) =>
          Array.isArray(order.items)
            ? order.items.map((item: any) => normalizeCode(item?.productCode)).filter(Boolean)
            : []
        )
      )
    );

    if (productCodes.length === 0) {
      return orders;
    }

    const products = await prisma.product.findMany({
      where: { mikroCode: { in: productCodes } },
      select: {
        mikroCode: true,
        warehouseStocks: true,
      },
    });
    const stockByProductCode = new Map<string, { merkez: number; topca: number }>();
    products.forEach((product) => {
      stockByProductCode.set(product.mikroCode, {
        merkez: resolveWarehouseStockValue(product.warehouseStocks, '1'),
        topca: resolveWarehouseStockValue(product.warehouseStocks, '6'),
      });
    });

    const purchaseEtaByProductCode = await this.getEarliestPendingPurchaseDeliveryByProduct(productCodes);

    const demandByProductAndWarehouse = new Map<string, number>();
    orders.forEach((order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach((item: any) => {
        const productCode = normalizeCode(item?.productCode);
        if (!productCode) return;
        const warehouseCode = normalizeCode(item?.warehouseCode);
        if (warehouseCode !== '1' && warehouseCode !== '6') return;
        const key = `${productCode}||${warehouseCode}`;
        demandByProductAndWarehouse.set(
          key,
          (demandByProductAndWarehouse.get(key) || 0) + Math.max(toNumber(item?.remainingQty), 0)
        );
      });
    });

    return orders.map((order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      return {
        ...order,
        items: items.map((item: any) => {
          const productCode = normalizeCode(item?.productCode);
          const warehouseCode = normalizeCode(item?.warehouseCode) || null;
          const remainingQty = Math.max(toNumber(item?.remainingQty), 0);
          const stocks = stockByProductCode.get(productCode) || { merkez: 0, topca: 0 };
          const merkezTotalDemand = demandByProductAndWarehouse.get(`${productCode}||1`) || 0;
          const topcaTotalDemand = demandByProductAndWarehouse.get(`${productCode}||6`) || 0;
          const preferredStock = warehouseCode === '6' ? stocks.topca : stocks.merkez;
          const preferredTotalDemand = warehouseCode === '6' ? topcaTotalDemand : merkezTotalDemand;
          const preferredAfterTotalDemand = preferredStock - preferredTotalDemand;
          const stockStatus = resolveStockStatus(remainingQty, stocks);

          return {
            ...item,
            warehouseStocks: stocks,
            stockStatus,
            estimatedStockEntryDate:
              stockStatus.code === 'full'
                ? null
                : purchaseEtaByProductCode.get(productCode) || null,
            fulfillment: {
              preferredWarehouseCode: warehouseCode,
              preferredWarehouseName: getWarehouseName(warehouseCode),
              merkezCanFulfill: stocks.merkez >= remainingQty,
              topcaCanFulfill: stocks.topca >= remainingQty,
              preferredCanFulfill: preferredStock >= remainingQty,
              merkezTotalDemand,
              topcaTotalDemand,
              preferredTotalDemand,
              merkezAfterTotalDemand: stocks.merkez - merkezTotalDemand,
              topcaAfterTotalDemand: stocks.topca - topcaTotalDemand,
              preferredAfterTotalDemand,
              hasAggregateRisk: preferredAfterTotalDemand < 0,
            },
          };
        }),
      };
    });
  }

  private async getEarliestPendingPurchaseDeliveryByProduct(productCodes: string[]): Promise<Map<string, Date | string>> {
    const result = new Map<string, Date | string>();
    const normalizedCodes = Array.from(new Set(productCodes.map(normalizeCode).filter(Boolean)));

    if (normalizedCodes.length === 0) {
      return result;
    }

    const chunkSize = 800;

    for (let i = 0; i < normalizedCodes.length; i += chunkSize) {
      const chunk = normalizedCodes.slice(i, i + chunkSize);
      const inClause = chunk.map((code) => `'${code.replace(/'/g, "''")}'`).join(', ');

      try {
        const rows = await mikroService.executeQuery(`
          SELECT
            LTRIM(RTRIM(ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.PRODUCT_CODE}, ''))) as productCode,
            MIN(CASE
              WHEN s.${MIKRO_TABLES.ORDERS_COLUMNS.DELIVERY_DATE} IS NOT NULL
                AND s.${MIKRO_TABLES.ORDERS_COLUMNS.DELIVERY_DATE} >= '2000-01-01'
              THEN s.${MIKRO_TABLES.ORDERS_COLUMNS.DELIVERY_DATE}
              ELSE NULL
            END) as estimatedStockEntryDate
          FROM ${MIKRO_TABLES.ORDERS} s WITH (NOLOCK)
          WHERE s.${MIKRO_TABLES.ORDERS_COLUMNS.PRODUCT_CODE} IN (${inClause})
            AND s.${MIKRO_TABLES.ORDERS_COLUMNS.TYPE} = 1
            AND ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.CANCELLED}, 0) = 0
            AND ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.CLOSED}, 0) = 0
            AND ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.WAREHOUSE_NO}, 0) IN (1, 6)
            AND (ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.QUANTITY}, 0) - ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.DELIVERED_QUANTITY}, 0)) > 0
          GROUP BY LTRIM(RTRIM(ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.PRODUCT_CODE}, '')))
        `);

        for (const row of rows || []) {
          const productCode = normalizeCode(row.productCode);
          const eta = row.estimatedStockEntryDate;
          if (productCode && eta) {
            result.set(productCode, eta);
          }
        }
      } catch (error: any) {
        console.warn('Pending purchase delivery date lookup failed:', error?.message || error);
      }
    }

    return result;
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

    const mappedOrders = orders.map((order) => ({
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

    return this.enrichOrdersWithWarehouseAvailability(mappedOrders);
  }

  /**
   * TÃ¼m bekleyen sipariÅŸleri getir (admin iÃ§in)
   */
  async getAllPendingOrders(scope?: StaffScope): Promise<PendingOrder[]> {
    const scoped = this.buildSalesRepOrderWhere(scope);
    if (scoped.denyAll) return [];

    const orders = await prisma.pendingMikroOrder.findMany({
      where: scoped.where,
      orderBy: [{ orderDate: 'desc' }, { mikroOrderNumber: 'asc' }],
    });

    const workflowMap = await warehouseWorkflowService.getWorkflowStatusMap(
      orders.map((order) => order.mikroOrderNumber)
    );

    const mappedOrders = orders.map((order) => ({
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

    return this.enrichOrdersWithWarehouseAvailability(mappedOrders);
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
          emailSubject: 'Bekleyen Siparişleriniz',
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
  async getCustomerSummary(scope?: StaffScope) {
    const scoped = this.buildSalesRepOrderWhere(scope);
    if (scoped.denyAll) return [];

    const orders = await prisma.pendingMikroOrder.findMany({
      where: {
        ...(scoped.where || {}),
        // SektÃ¶r kodu "SATICI" olanlarÄ± hariÃ§ tut (SATICI, SATICI BARTIR vb.)
        AND: [{
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
        }],
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

    const enrichedOrders = await this.enrichOrdersWithWarehouseAvailability(
      orders.map((order) => ({
        ...order,
        items: order.items as any,
      }))
    );

    for (const order of enrichedOrders) {
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
  async getSupplierSummary(scope?: StaffScope) {
    if (scope?.role === 'SALES_REP') {
      return [];
    }

    const rawOrders = await this.fetchSupplierOrdersFromMikro();
    const orders = this.groupOrdersByCustomer(rawOrders);
    const supplierCodes = Array.from(
      new Set(
        orders
          .map((order) => String(order.customerCode || '').trim())
          .filter((code) => code.length > 0)
      )
    );

    const cityBySupplierCode = new Map<string, string | null>();
    if (supplierCodes.length > 0) {
      const inClause = supplierCodes
        .map((code) => `'${code.replace(/'/g, "''")}'`)
        .join(', ');

      const supplierCityRows = await mikroService.executeQuery(`
        SELECT
          adr_cari_kod as cari_kod,
          MAX(NULLIF(LTRIM(RTRIM(adr_il)), '')) as sehir
        FROM CARI_HESAP_ADRESLERI WITH (NOLOCK)
        WHERE adr_adres_no = '1'
          AND adr_cari_kod IN (${inClause})
        GROUP BY adr_cari_kod
      `);

      for (const row of supplierCityRows || []) {
        const code = String(row.cari_kod || '').trim();
        if (!code) continue;
        const city = row.sehir ? String(row.sehir).trim() : null;
        cityBySupplierCode.set(code, city || null);
      }
    }

    const transmissionBySupplierCode = new Map<
      string,
      { transmittedAt: Date; transmittedByName: string | null }
    >();
    if (supplierCodes.length > 0) {
      const transmissionRows = await prisma.supplierTransmissionLog.findMany({
        where: { customerCode: { in: supplierCodes } },
        orderBy: [{ customerCode: 'asc' }, { transmittedAt: 'desc' }],
        select: {
          customerCode: true,
          transmittedAt: true,
          transmittedByName: true,
        },
      });

      for (const row of transmissionRows) {
        const code = String(row.customerCode || '').trim();
        if (!code || transmissionBySupplierCode.has(code)) continue;
        transmissionBySupplierCode.set(code, {
          transmittedAt: row.transmittedAt,
          transmittedByName: row.transmittedByName || null,
        });
      }
    }

    // SatÄ±cÄ± bazÄ±nda grupla
    const summary = new Map<
      string,
      {
        customerCode: string;
        customerName: string;
        customerEmail: string | null;
        sectorCode: string | null;
        city: string | null;
        ordersCount: number;
        totalAmount: number;
        emailSent: boolean;
        lastTransmittedAt: Date | null;
        lastTransmittedByName: string | null;
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
          city: cityBySupplierCode.get(String(order.customerCode || '').trim()) || null,
          ordersCount: 0,
          totalAmount: 0,
          emailSent: false,
          lastTransmittedAt:
            transmissionBySupplierCode.get(String(order.customerCode || '').trim())?.transmittedAt || null,
          lastTransmittedByName:
            transmissionBySupplierCode.get(String(order.customerCode || '').trim())?.transmittedByName || null,
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

  async closeRemainingLines(input: CloseRemainingInput): Promise<CloseRemainingResult> {
    const mikroOrderNumber = normalizeCode(input.mikroOrderNumber);
    if (!mikroOrderNumber) {
      throw httpError('Siparis numarasi gerekli.', 400);
    }

    const orderType: CloseOrderType = input.orderType === 'supplier' ? 'supplier' : 'customer';
    const requestedLineNumbers = normalizeLineNumbers(input.lineNumbers);
    const orderTypeNo = orderType === 'supplier' ? 1 : 0;

    if (orderType === 'supplier' && input.scope?.role === 'SALES_REP') {
      throw httpError('Satis temsilcileri tedarikci siparislerini kapatamaz.', 403);
    }

    let series: string;
    let sequence: number;
    let cacheOrder:
      | {
          id: string;
          orderSeries: string;
          orderSequence: number;
          sectorCode: string | null;
          items: any;
        }
      | null = null;

    if (orderType === 'customer') {
      cacheOrder = await prisma.pendingMikroOrder.findUnique({
        where: { mikroOrderNumber },
        select: {
          id: true,
          orderSeries: true,
          orderSequence: true,
          sectorCode: true,
          items: true,
        },
      });

      if (!cacheOrder) {
        throw httpError('Bekleyen siparis bulunamadi. Once listeyi sync edin.', 404);
      }

      if (input.scope?.role === 'SALES_REP') {
        const assigned = (input.scope.assignedSectorCodes || [])
          .map((code) => normalizeCode(code).toLocaleUpperCase('tr-TR'))
          .filter(Boolean);
        const orderSector = normalizeCode(cacheOrder.sectorCode).toLocaleUpperCase('tr-TR');
        if (!orderSector || !assigned.includes(orderSector)) {
          throw httpError('Bu siparisi kapatma yetkiniz yok.', 403);
        }
      }

      series = cacheOrder.orderSeries;
      sequence = cacheOrder.orderSequence;
    } else {
      const parsed = parseMikroOrderNumber(mikroOrderNumber);
      series = parsed.series;
      sequence = parsed.sequence;
    }

    const safeSeries = escapeSqlString(series);
    const requestedLineCondition = requestedLineNumbers.length
      ? `AND s.${MIKRO_TABLES.ORDERS_COLUMNS.LINE_NO} IN (${requestedLineNumbers.join(',')})`
      : '';

    const targetRows = await mikroService.executeQuery(`
      SELECT
        s.${MIKRO_TABLES.ORDERS_COLUMNS.LINE_NO} as rowNumber,
        s.${MIKRO_TABLES.ORDERS_COLUMNS.PRODUCT_CODE} as productCode,
        ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.QUANTITY}, 0) as quantity,
        ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.DELIVERED_QUANTITY}, 0) as deliveredQty,
        (ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.QUANTITY}, 0) - ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.DELIVERED_QUANTITY}, 0)) as remainingQty
      FROM ${MIKRO_TABLES.ORDERS} s WITH (NOLOCK)
      WHERE s.${MIKRO_TABLES.ORDERS_COLUMNS.ORDER_SERIES} = '${safeSeries}'
        AND s.${MIKRO_TABLES.ORDERS_COLUMNS.ORDER_SEQUENCE} = ${sequence}
        AND s.${MIKRO_TABLES.ORDERS_COLUMNS.TYPE} = ${orderTypeNo}
        AND ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.CANCELLED}, 0) = 0
        AND ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.CLOSED}, 0) = 0
        AND (ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.QUANTITY}, 0) - ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.DELIVERED_QUANTITY}, 0)) > 0
        ${requestedLineCondition}
      ORDER BY s.${MIKRO_TABLES.ORDERS_COLUMNS.LINE_NO}
    `);

    const targetLineNumbers = Array.from(
      new Set((targetRows || []).map((row) => Number(row.rowNumber)).filter((row) => Number.isInteger(row) && row >= 0))
    );

    if (targetLineNumbers.length === 0) {
      throw httpError('Kapatilacak acik satir bulunamadi.', 400);
    }

    if (requestedLineNumbers.length > 0 && targetLineNumbers.length !== requestedLineNumbers.length) {
      throw httpError('Secilen satirlardan bazilari acik degil veya bulunamadi.', 400);
    }

    const updateRows = await mikroService.executeQuery(`
      UPDATE s
      SET
        s.${MIKRO_TABLES.ORDERS_COLUMNS.CLOSED} = 1,
        s.sip_lastup_date = GETDATE()
      FROM ${MIKRO_TABLES.ORDERS} s
      WHERE s.${MIKRO_TABLES.ORDERS_COLUMNS.ORDER_SERIES} = '${safeSeries}'
        AND s.${MIKRO_TABLES.ORDERS_COLUMNS.ORDER_SEQUENCE} = ${sequence}
        AND s.${MIKRO_TABLES.ORDERS_COLUMNS.TYPE} = ${orderTypeNo}
        AND ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.CANCELLED}, 0) = 0
        AND ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.CLOSED}, 0) = 0
        AND (ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.QUANTITY}, 0) - ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.DELIVERED_QUANTITY}, 0)) > 0
        AND s.${MIKRO_TABLES.ORDERS_COLUMNS.LINE_NO} IN (${targetLineNumbers.join(',')});

      SELECT @@ROWCOUNT as affected;
    `);

    const affected = Number(updateRows?.[0]?.affected || 0);
    if (affected !== targetLineNumbers.length) {
      throw httpError('Mikro kapatma islemi dogrulanamadi. Listeyi yenileyip tekrar deneyin.', 500);
    }

    if (orderType === 'customer' && cacheOrder) {
      const closedSet = new Set(targetLineNumbers);
      const existingItems = Array.isArray(cacheOrder.items) ? (cacheOrder.items as any[]) : [];
      const remainingItems = existingItems.filter((item) => !closedSet.has(Number(item?.rowNumber)));

      if (remainingItems.length === 0) {
        await prisma.pendingMikroOrder.delete({ where: { id: cacheOrder.id } });
      } else {
        const totalAmount = remainingItems.reduce((sum, item) => sum + Math.max(toNumber(item?.lineTotal), 0), 0);
        const totalVAT = remainingItems.reduce((sum, item) => sum + Math.max(toNumber(item?.vat), 0), 0);
        await prisma.pendingMikroOrder.update({
          where: { id: cacheOrder.id },
          data: {
            items: remainingItems as any,
            itemCount: remainingItems.length,
            totalAmount,
            totalVAT,
            grandTotal: totalAmount + totalVAT,
            syncedAt: new Date(),
          },
        });
      }
    }

    return {
      success: true,
      mikroOrderNumber,
      orderType,
      closedLineCount: targetLineNumbers.length,
      message:
        targetLineNumbers.length === 1
          ? 'Siparis satirinin kalan miktari kapatildi.'
          : `${targetLineNumbers.length} siparis satirinin kalan miktari kapatildi.`,
    };
  }

  async updateLineQuantity(input: UpdateLineQuantityInput): Promise<UpdateLineQuantityResult> {
    const mikroOrderNumber = normalizeCode(input.mikroOrderNumber);
    if (!mikroOrderNumber) {
      throw httpError('Siparis numarasi gerekli.', 400);
    }

    const lineNumber = Number(input.lineNumber);
    if (!Number.isInteger(lineNumber) || lineNumber < 0) {
      throw httpError('Gecerli satir numarasi gerekli.', 400);
    }

    const nextQuantity = Number(input.quantity);
    if (!Number.isFinite(nextQuantity) || nextQuantity < 0) {
      throw httpError('Gecerli miktar girin.', 400);
    }

    const orderType: CloseOrderType = input.orderType === 'supplier' ? 'supplier' : 'customer';
    const orderTypeNo = orderType === 'supplier' ? 1 : 0;

    if (orderType === 'supplier' && input.scope?.role === 'SALES_REP') {
      throw httpError('Satis temsilcileri tedarikci siparislerini duzenleyemez.', 403);
    }

    let series: string;
    let sequence: number;
    let cacheOrder:
      | {
          id: string;
          orderSeries: string;
          orderSequence: number;
          sectorCode: string | null;
          items: any;
        }
      | null = null;

    if (orderType === 'customer') {
      cacheOrder = await prisma.pendingMikroOrder.findUnique({
        where: { mikroOrderNumber },
        select: {
          id: true,
          orderSeries: true,
          orderSequence: true,
          sectorCode: true,
          items: true,
        },
      });

      if (!cacheOrder) {
        throw httpError('Bekleyen siparis bulunamadi. Once listeyi sync edin.', 404);
      }

      if (input.scope?.role === 'SALES_REP') {
        const assigned = (input.scope.assignedSectorCodes || [])
          .map((code) => normalizeCode(code).toLocaleUpperCase('tr-TR'))
          .filter(Boolean);
        const orderSector = normalizeCode(cacheOrder.sectorCode).toLocaleUpperCase('tr-TR');
        if (!orderSector || !assigned.includes(orderSector)) {
          throw httpError('Bu siparisi duzenleme yetkiniz yok.', 403);
        }
      }

      series = cacheOrder.orderSeries;
      sequence = cacheOrder.orderSequence;
    } else {
      const parsed = parseMikroOrderNumber(mikroOrderNumber);
      series = parsed.series;
      sequence = parsed.sequence;
    }

    const safeSeries = escapeSqlString(series);
    const rows = await mikroService.executeQuery(`
      SELECT TOP 1
        s.${MIKRO_TABLES.ORDERS_COLUMNS.LINE_NO} as rowNumber,
        s.${MIKRO_TABLES.ORDERS_COLUMNS.PRODUCT_CODE} as productCode,
        ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.QUANTITY}, 0) as quantity,
        ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.DELIVERED_QUANTITY}, 0) as deliveredQty,
        ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.UNIT_PRICE}, 0) as unitPrice,
        ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.LINE_TOTAL}, 0) as lineTotal,
        ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.VAT}, 0) as vat
      FROM ${MIKRO_TABLES.ORDERS} s WITH (NOLOCK)
      WHERE s.${MIKRO_TABLES.ORDERS_COLUMNS.ORDER_SERIES} = '${safeSeries}'
        AND s.${MIKRO_TABLES.ORDERS_COLUMNS.ORDER_SEQUENCE} = ${sequence}
        AND s.${MIKRO_TABLES.ORDERS_COLUMNS.TYPE} = ${orderTypeNo}
        AND s.${MIKRO_TABLES.ORDERS_COLUMNS.LINE_NO} = ${lineNumber}
        AND ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.CANCELLED}, 0) = 0
    `);

    const row = rows?.[0];
    if (!row) {
      throw httpError('Siparis satiri bulunamadi.', 404);
    }

    const previousQuantity = toNumber(row.quantity);
    const deliveredQty = toNumber(row.deliveredQty);
    const unitPrice = toNumber(row.unitPrice);
    const currentLineTotal = toNumber(row.lineTotal);
    const currentVat = toNumber(row.vat);
    const nextLineTotal = unitPrice > 0 ? round2(nextQuantity * unitPrice) : currentLineTotal;
    const vatRatio = currentLineTotal > 0 ? currentVat / currentLineTotal : 0;
    const nextVat = round2(nextLineTotal * vatRatio);
    if (nextQuantity < deliveredQty) {
      throw httpError(`Yeni miktar teslim edilen miktardan (${deliveredQty}) dusuk olamaz.`, 400);
    }

    const isClosed = nextQuantity <= deliveredQty ? 1 : 0;
    const updateRows = await mikroService.executeQuery(`
      UPDATE s
      SET
        s.${MIKRO_TABLES.ORDERS_COLUMNS.QUANTITY} = ${nextQuantity},
        s.${MIKRO_TABLES.ORDERS_COLUMNS.LINE_TOTAL} = ${nextLineTotal},
        s.${MIKRO_TABLES.ORDERS_COLUMNS.VAT} = ${nextVat},
        s.${MIKRO_TABLES.ORDERS_COLUMNS.CLOSED} = ${isClosed},
        s.sip_lastup_date = GETDATE()
      FROM ${MIKRO_TABLES.ORDERS} s
      WHERE s.${MIKRO_TABLES.ORDERS_COLUMNS.ORDER_SERIES} = '${safeSeries}'
        AND s.${MIKRO_TABLES.ORDERS_COLUMNS.ORDER_SEQUENCE} = ${sequence}
        AND s.${MIKRO_TABLES.ORDERS_COLUMNS.TYPE} = ${orderTypeNo}
        AND s.${MIKRO_TABLES.ORDERS_COLUMNS.LINE_NO} = ${lineNumber}
        AND ISNULL(s.${MIKRO_TABLES.ORDERS_COLUMNS.CANCELLED}, 0) = 0;

      SELECT @@ROWCOUNT as affected;
    `);

    const affected = Number(updateRows?.[0]?.affected || 0);
    if (affected !== 1) {
      throw httpError('Mikro miktar guncelleme islemi dogrulanamadi. Listeyi yenileyip tekrar deneyin.', 500);
    }

    const remainingQty = Math.max(nextQuantity - deliveredQty, 0);

    if (orderType === 'customer' && cacheOrder) {
      const existingItems = Array.isArray(cacheOrder.items) ? (cacheOrder.items as any[]) : [];
      const updatedItems = existingItems
        .map((item) => {
          if (Number(item?.rowNumber) !== lineNumber) return item;
          const unitPrice = toNumber(item?.unitPrice);
          return {
            ...item,
            quantity: nextQuantity,
            deliveredQty,
            remainingQty,
            unitPrice: unitPrice || row.unitPrice || 0,
            lineTotal: nextLineTotal,
            vat: nextVat,
          };
        })
        .filter((item) => Math.max(toNumber(item?.remainingQty), 0) > 0);

      if (updatedItems.length === 0) {
        await prisma.pendingMikroOrder.delete({ where: { id: cacheOrder.id } });
      } else {
        const totalAmount = updatedItems.reduce((sum, item) => sum + Math.max(toNumber(item?.lineTotal), 0), 0);
        const totalVAT = updatedItems.reduce((sum, item) => sum + Math.max(toNumber(item?.vat), 0), 0);
        await prisma.pendingMikroOrder.update({
          where: { id: cacheOrder.id },
          data: {
            items: updatedItems as any,
            itemCount: updatedItems.length,
            totalAmount,
            totalVAT,
            grandTotal: totalAmount + totalVAT,
            syncedAt: new Date(),
          },
        });
      }
    }

    return {
      success: true,
      mikroOrderNumber,
      orderType,
      lineNumber,
      previousQuantity,
      newQuantity: nextQuantity,
      deliveredQty,
      remainingQty,
      message: 'Siparis satir miktari guncellendi.',
    };
  }

  async markSupplierTransmitted(params: {
    customerCode: string;
    customerName?: string;
    transmittedByUserId?: string;
  }) {
    const customerCode = String(params.customerCode || '').trim();
    if (!customerCode) {
      throw new Error('Supplier code is required');
    }

    const customerName = params.customerName ? String(params.customerName).trim() : null;
    const transmittedByUserId = params.transmittedByUserId
      ? String(params.transmittedByUserId).trim()
      : null;

    let transmittedByName: string | null = null;
    if (transmittedByUserId) {
      const user = await prisma.user.findUnique({
        where: { id: transmittedByUserId },
        select: { name: true },
      });
      transmittedByName = user?.name ? String(user.name).trim() : null;
    }

    const log = await prisma.supplierTransmissionLog.create({
      data: {
        customerCode,
        customerName,
        transmittedByUserId,
        transmittedByName,
      },
      select: {
        customerCode: true,
        transmittedAt: true,
        transmittedByName: true,
      },
    });

    return log;
  }
}

export default new OrderTrackingService();
