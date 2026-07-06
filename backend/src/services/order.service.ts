/**
 * Order Service
 *
 * Sipariş yönetimi:
 * - Sepetten sipariş oluşturma
 * - Stok kontrolü
 * - Admin onayı
 * - Mikro'ya sipariş yazma (2 ayrı sipariş mantığı ile)
 */

import { PriceType } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { generateOrderNumber } from '../utils/orderNumber';
import mikroService from './mikroFactory.service';
import pricingService from './pricing.service';
import priceListService from './price-list.service';
import cartPricingService, { loadCartCustomerContext, CartPriceType } from './cart-pricing.service';
import bundlePricingService, { BundleComponentSnapshot } from './bundle-pricing.service';
import giftCampaignService from './gift-campaign.service';
import { ProductPrices, MikroCustomerSaleMovement } from '../types';
import { resolveCustomerPriceLists, resolveCustomerPriceListsForProduct } from '../utils/customerPricing';
import { isAgreementApplicable, resolveAgreementPrice } from '../utils/agreements';
import { resolveLastPriceOverride } from '../utils/lastPrice';

type PriceVisibilityValue = 'INVOICED_ONLY' | 'WHITE_ONLY' | 'BOTH';

type PricePair = {
  invoiced: number;
  white: number;
};

type RepricedCartItem = {
  productId: string;
  productName: string;
  mikroCode: string;
  quantity: number;
  priceType: PriceType;
  unitPrice: number;
  totalPrice: number;
  lineNote?: string | null;
  // Birim snapshot'lari (siparise tasinir): ana birim, 2. birim + katsayi ve
  // musterinin sectigi birim (alt birim secildiyse dolu; null = ana birim).
  unit?: string | null;
  unit2?: string | null;
  unit2Factor?: number | null;
  selectedUnit?: string | null;
  // Paket (bundle) satiri: musteri tek satir gorur; Mikro'ya bilesenlere patlatilir.
  // Snapshot = paket BASINA bilesen dokumu (iskonto gomulu birim fiyatlar).
  bundleComponents?: BundleComponentSnapshot[] | null;
};

type LinkedMikroOrderRow = {
  orderNumber: string;
  productCode: string;
};

const isPriceTypeAllowed = (
  visibility: PriceVisibilityValue | null | undefined,
  priceType: PriceType
): boolean => {
  if (visibility === 'WHITE_ONLY') return priceType === 'WHITE';
  if (visibility === 'BOTH') return true;
  return priceType === 'INVOICED';
};

const buildLastSalesMap = (sales: MikroCustomerSaleMovement[]) => {
  const map = new Map<string, number>();
  sales.forEach((sale) => {
    const code = String(sale.productCode || '').trim();
    if (!code || map.has(code)) return;
    const price = Number(sale.unitPrice);
    if (Number.isFinite(price) && price > 0) {
      map.set(code, price);
    }
  });
  return map;
};

const getLastPriceGuardPrices = (
  priceStats: any,
  guardInvoicedListNo?: number | null,
  guardWhiteListNo?: number | null
): PricePair | undefined => {
  if (!guardInvoicedListNo && !guardWhiteListNo) return undefined;
  return {
    invoiced: guardInvoicedListNo
      ? priceListService.getListPrice(priceStats, guardInvoicedListNo)
      : 0,
    white: guardWhiteListNo
      ? priceListService.getListPrice(priceStats, guardWhiteListNo)
      : 0,
  };
};

class OrderService {
  async getCustomerLastOrderItems(
    customerId: string,
    productCodes: string[],
    limit: number,
    excludeOrderId?: string,
    customerCodeOverride?: string
  ): Promise<Record<string, Array<{
    orderDate: string;
    quantity: number;
    unitPrice: number;
    priceType: 'INVOICED' | 'WHITE';
    documentNo?: string | null;
    orderNumber?: string | null;
  }>>> {
    const codes = productCodes.map((code) => String(code || '').trim()).filter(Boolean);
    if ((!customerId && !customerCodeOverride) || codes.length === 0 || limit <= 0) {
      return {};
    }

    let mikroCariCode = String(customerCodeOverride || '').trim();
    if (!mikroCariCode) {
      const customer = await prisma.user.findUnique({
        where: { id: customerId },
        select: { mikroCariCode: true },
      });
      mikroCariCode = String(customer?.mikroCariCode || '').trim();
    }
    if (!mikroCariCode) {
      return {};
    }

    const takeCount = Math.min(codes.length * limit * 6, 2500);
    const rows = await prisma.orderItem.findMany({
      where: {
        mikroCode: { in: codes },
        order: {
          user: { mikroCariCode },
          status: { not: 'REJECTED' },
          ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
        },
      },
      orderBy: [
        { order: { createdAt: 'desc' } },
        { createdAt: 'desc' },
      ],
      take: takeCount,
      select: {
        mikroCode: true,
        quantity: true,
        unitPrice: true,
        priceType: true,
        order: {
          select: {
            createdAt: true,
            customerOrderNumber: true,
            orderNumber: true,
          },
        },
      },
    });

    const result = new Map<string, Array<{
      orderDate: string;
      quantity: number;
      unitPrice: number;
      priceType: 'INVOICED' | 'WHITE';
      documentNo?: string | null;
      orderNumber?: string | null;
    }>>();
    const dedupe = new Map<string, Set<string>>();

    for (const row of rows) {
      const code = String(row.mikroCode || '').trim();
      if (!code) continue;
      const list = result.get(code) || [];
      if (list.length >= limit) continue;

      const entry = {
        orderDate: row.order?.createdAt
          ? row.order.createdAt.toISOString()
          : new Date().toISOString(),
        quantity: Number(row.quantity) || 0,
        unitPrice: Number(row.unitPrice) || 0,
        priceType: row.priceType === 'WHITE' ? 'WHITE' as const : 'INVOICED' as const,
        documentNo: row.order?.customerOrderNumber ?? null,
        orderNumber: row.order?.orderNumber ?? null,
      };

      const key = `${entry.orderNumber || ''}|${entry.documentNo || ''}|${entry.unitPrice}|${entry.quantity}|${entry.priceType}`;
      const keySet = dedupe.get(code) || new Set<string>();
      if (keySet.has(key)) continue;

      list.push(entry);
      keySet.add(key);
      result.set(code, list);
      dedupe.set(code, keySet);
    }

    const output: Record<string, Array<{
      orderDate: string;
      quantity: number;
      unitPrice: number;
      priceType: 'INVOICED' | 'WHITE';
      documentNo?: string | null;
      orderNumber?: string | null;
    }>> = {};

    for (const code of codes) {
      const list = result.get(code) || [];
      list.sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
      if (list.length > 0) {
        output[code] = list.slice(0, limit);
      }
    }

    const missingAfterB2b = codes.filter((code) => (output[code]?.length || 0) < limit);
    if (missingAfterB2b.length > 0) {
      try {
        const safeCari = mikroCariCode.replace(/'/g, "''");
        const sipBelgeColumns = typeof (mikroService as any).resolveSipBelgeColumns === 'function'
          ? await (mikroService as any).resolveSipBelgeColumns()
          : { no: null };
        const belgeSelectExpr = sipBelgeColumns.no
          ? `NULLIF(LTRIM(RTRIM(${sipBelgeColumns.no})), '')`
          : 'NULL';
        const safeCodes = missingAfterB2b
          .map((code) => String(code).trim())
          .filter(Boolean)
          .map((code) => `'${code.replace(/'/g, "''")}'`)
          .join(', ');

        if (safeCodes) {
          const query = `
            WITH RankedOrders AS (
              SELECT
                sip_stok_kod as productCode,
                sip_tarih as orderDate,
                sip_miktar as quantity,
                sip_b_fiyat as unitPrice,
                sip_vergi as vatAmount,
                sip_evrakno_seri as orderSeries,
                sip_evrakno_sira as orderSequence,
                ${belgeSelectExpr} as belgeNo,
                ROW_NUMBER() OVER (
                  PARTITION BY sip_stok_kod
                  ORDER BY sip_tarih DESC, sip_evrakno_sira DESC, sip_satirno DESC
                ) as rn
              FROM SIPARISLER WITH (NOLOCK)
              WHERE sip_musteri_kod = '${safeCari}'
                AND sip_stok_kod IN (${safeCodes})
            )
            SELECT
              productCode,
              orderDate,
              quantity,
              unitPrice,
              vatAmount,
              orderSeries,
              orderSequence,
              belgeNo
            FROM RankedOrders
            WHERE rn <= ${Math.max(3, limit)}
            ORDER BY productCode, orderDate DESC
          `;

          const rows = await mikroService.executeQuery(query);
          for (const row of rows || []) {
            const code = String(row.productCode || '').trim();
            if (!code || !missingAfterB2b.includes(code)) continue;
            const list = output[code] || [];
            if (list.length >= limit) continue;

            const sequence = Number(row.orderSequence);
            const orderNo =
              row.orderSeries && Number.isFinite(sequence)
                ? `${String(row.orderSeries).trim()}-${sequence}`
                : null;
            const belgeNo = String(row.belgeNo || '').trim() || orderNo;
            const entry = {
              orderDate: row.orderDate ? new Date(row.orderDate).toISOString() : new Date().toISOString(),
              quantity: Number(row.quantity) || 0,
              unitPrice: Number(row.unitPrice) || 0,
              priceType: Number(row.vatAmount || 0) === 0 ? 'WHITE' as const : 'INVOICED' as const,
              documentNo: belgeNo,
              orderNumber: orderNo,
            };

            const key = `${entry.orderNumber || ''}|${entry.documentNo || ''}|${entry.unitPrice}|${entry.quantity}|${entry.priceType}`;
            const existingKeys = new Set(
              list.map(
                (item) =>
                  `${item.orderNumber || ''}|${item.documentNo || ''}|${item.unitPrice}|${item.quantity}|${item.priceType}`
              )
            );
            if (!existingKeys.has(key)) {
              list.push(entry);
              output[code] = list.slice(0, limit);
            }
          }
        }
      } catch (error) {
        console.error('Mikro SIPARISLER history fallback failed', { customerId, mikroCariCode, error });
      }
    }

    const missingCodes = codes.filter((code) => (output[code]?.length || 0) < limit);
    if (missingCodes.length > 0) {
      const pendingRows = await prisma.pendingMikroOrder.findMany({
        where: { customerCode: mikroCariCode },
        orderBy: { orderDate: 'desc' },
        take: Math.max(200, limit * 60),
        select: {
          mikroOrderNumber: true,
          orderDate: true,
          items: true,
        },
      });

      const seenMap = new Map<string, Set<string>>();
      for (const code of codes) {
        const existing = output[code] || [];
        output[code] = existing;
        const seen = new Set<string>(
          existing.map(
            (entry) =>
              `${entry.orderNumber || ''}|${entry.documentNo || ''}|${entry.unitPrice}|${entry.quantity}|${entry.priceType}`
          )
        );
        seenMap.set(code, seen);
      }

      for (const order of pendingRows) {
        const items = Array.isArray(order.items) ? order.items : [];
        for (const raw of items) {
          const item = raw as any;
          const code = String(item?.productCode || '').trim();
          if (!code || !missingCodes.includes(code)) continue;
          const list = output[code] || [];
          if (list.length >= limit) continue;

          const entry = {
            orderDate: order.orderDate ? order.orderDate.toISOString() : new Date().toISOString(),
            quantity: Number(item?.quantity) || 0,
            unitPrice: Number(item?.unitPrice) || 0,
            priceType: 'INVOICED' as const,
            documentNo: order.mikroOrderNumber || null,
            orderNumber: order.mikroOrderNumber || null,
          };
          const key = `${entry.orderNumber || ''}|${entry.documentNo || ''}|${entry.unitPrice}|${entry.quantity}|${entry.priceType}`;
          const seen = seenMap.get(code) || new Set<string>();
          if (seen.has(key)) continue;
          list.push(entry);
          seen.add(key);
          output[code] = list;
          seenMap.set(code, seen);
        }

        if (missingCodes.every((code) => (output[code]?.length || 0) >= limit)) {
          break;
        }
      }
    }

    return output;
  }

  private parseMikroOrderNumber(orderNumberRaw: string): { series: string; sequence: number } | null {
    const orderNumber = String(orderNumberRaw || '').trim();
    const lastDash = orderNumber.lastIndexOf('-');
    if (lastDash <= 0 || lastDash >= orderNumber.length - 1) {
      return null;
    }

    const series = orderNumber.slice(0, lastDash).trim();
    const sequence = Number(orderNumber.slice(lastDash + 1));
    if (!series || !Number.isFinite(sequence) || sequence <= 0) {
      return null;
    }

    return { series, sequence: Math.trunc(sequence) };
  }

  private async getWarehouseNoFromMikroOrder(orderNumberRaw: string): Promise<number | null> {
    const parsed = this.parseMikroOrderNumber(orderNumberRaw);
    if (!parsed) {
      return null;
    }

    const safeSeries = parsed.series.replace(/'/g, "''");
    const rows = await mikroService.executeQuery(`
      SELECT TOP 1
        sip_depono as depo_no
      FROM SIPARISLER WITH (NOLOCK)
      WHERE sip_evrakno_seri = '${safeSeries}'
        AND sip_evrakno_sira = ${parsed.sequence}
      ORDER BY sip_satirno ASC
    `);

    const warehouseNo = Number(rows?.[0]?.depo_no);
    if (!Number.isFinite(warehouseNo) || warehouseNo <= 0) {
      return null;
    }
    return Math.trunc(warehouseNo);
  }

  private escapeSqlString(value: string): string {
    return String(value || '').replace(/'/g, "''");
  }

  private async getExistingMikroOrderNumbers(orderNumbers: string[]): Promise<Set<string>> {
    const parsedOrders = orderNumbers
      .map((orderNumber) => ({
        orderNumber: String(orderNumber || '').trim(),
        parsed: this.parseMikroOrderNumber(orderNumber),
      }))
      .filter((entry): entry is { orderNumber: string; parsed: { series: string; sequence: number } } => Boolean(entry.parsed));

    if (parsedOrders.length === 0) {
      return new Set();
    }

    const conditions = parsedOrders
      .map((entry) => {
        const series = this.escapeSqlString(entry.parsed.series);
        return `(sip_evrakno_seri = '${series}' AND sip_evrakno_sira = ${entry.parsed.sequence})`;
      })
      .join(' OR ');

    const rows = await mikroService.executeQuery(`
      SELECT DISTINCT
        LTRIM(RTRIM(sip_evrakno_seri)) AS series,
        sip_evrakno_sira AS sequence
      FROM SIPARISLER WITH (NOLOCK)
      WHERE ${conditions}
    `);

    return new Set(
      (rows || [])
        .map((row: any) => {
          const series = String(row.series || '').trim();
          const sequence = Number(row.sequence);
          return series && Number.isFinite(sequence) ? `${series}-${Math.trunc(sequence)}` : '';
        })
        .filter(Boolean)
    );
  }

  private async findMikroOrdersLinkedToQuote(
    quoteNumberRaw: string | null | undefined,
    productCodes: string[]
  ): Promise<LinkedMikroOrderRow[]> {
    const parsedQuote = this.parseMikroOrderNumber(String(quoteNumberRaw || '').trim());
    if (!parsedQuote) {
      return [];
    }

    const uniqueProductCodes = Array.from(
      new Set(productCodes.map((code) => String(code || '').trim()).filter(Boolean))
    );
    const productFilter = uniqueProductCodes.length > 0
      ? `AND s.sip_stok_kod IN (${uniqueProductCodes.map((code) => `'${this.escapeSqlString(code)}'`).join(', ')})`
      : '';

    const rows = await mikroService.executeQuery(`
      SELECT DISTINCT
        LTRIM(RTRIM(s.sip_evrakno_seri)) AS orderSeries,
        s.sip_evrakno_sira AS orderSequence,
        LTRIM(RTRIM(s.sip_stok_kod)) AS productCode
      FROM SIPARISLER s WITH (NOLOCK)
      INNER JOIN VERILEN_TEKLIFLER t WITH (NOLOCK)
        ON s.sip_teklif_uid = t.tkl_Guid
      WHERE t.tkl_evrakno_seri = '${this.escapeSqlString(parsedQuote.series)}'
        AND t.tkl_evrakno_sira = ${parsedQuote.sequence}
        AND ISNULL(s.sip_iptal, 0) = 0
        ${productFilter}
      ORDER BY orderSeries, orderSequence
    `);

    return (rows || [])
      .map((row: any) => {
        const series = String(row.orderSeries || '').trim();
        const sequence = Number(row.orderSequence);
        const productCode = String(row.productCode || '').trim();
        return series && Number.isFinite(sequence)
          ? { orderNumber: `${series}-${Math.trunc(sequence)}`, productCode }
          : null;
      })
      .filter((row: LinkedMikroOrderRow | null): row is LinkedMikroOrderRow => Boolean(row));
  }

  private async reconcileMikroOrderLinksFromQuote(order: {
    id: string;
    mikroOrderIds: string[];
    sourceQuote?: { quoteNumber: string | null } | null;
    items: Array<{ id: string; mikroCode: string; mikroOrderId?: string | null }>;
  }): Promise<string[]> {
    const currentOrderIds = Array.from(
      new Set((order.mikroOrderIds || []).map((id) => String(id || '').trim()).filter(Boolean))
    );
    if (currentOrderIds.length === 0) {
      return [];
    }

    const existing = await this.getExistingMikroOrderNumbers(currentOrderIds);
    if (currentOrderIds.every((id) => existing.has(id))) {
      return currentOrderIds;
    }

    const linkedRows = await this.findMikroOrdersLinkedToQuote(
      order.sourceQuote?.quoteNumber,
      order.items.map((item) => item.mikroCode)
    );
    const linkedOrderIds = Array.from(new Set(linkedRows.map((row) => row.orderNumber)));
    if (linkedOrderIds.length === 0) {
      return currentOrderIds;
    }

    const itemOrderByCode = new Map<string, string>();
    linkedRows.forEach((row) => {
      const code = String(row.productCode || '').trim().toUpperCase();
      if (code && !itemOrderByCode.has(code)) {
        itemOrderByCode.set(code, row.orderNumber);
      }
    });

    await prisma.$transaction([
      prisma.order.update({
        where: { id: order.id },
        data: { mikroOrderIds: linkedOrderIds },
      }),
      ...order.items.map((item) => {
        const resolvedOrderId =
          itemOrderByCode.get(String(item.mikroCode || '').trim().toUpperCase()) ||
          linkedOrderIds[0];
        return prisma.orderItem.update({
          where: { id: item.id },
          data: { mikroOrderId: resolvedOrderId },
        });
      }),
    ]);

    return linkedOrderIds;
  }

  private async renameMikroOrderNumber(
    currentOrderNumberRaw: string,
    targetSeriesRaw?: string,
    targetSequenceRaw?: number | string | null
  ): Promise<string> {
    const parsedCurrent = this.parseMikroOrderNumber(currentOrderNumberRaw);
    if (!parsedCurrent) {
      throw new Error('Invalid Mikro order number');
    }

    const targetSeries = String(targetSeriesRaw || parsedCurrent.series).trim().slice(0, 20);
    const parsedTargetSequence = Number(targetSequenceRaw);
    const hasExplicitTargetSequence =
      Number.isFinite(parsedTargetSequence) && parsedTargetSequence > 0;
    const targetSequence =
      hasExplicitTargetSequence
        ? Math.trunc(parsedTargetSequence)
        : parsedCurrent.sequence;
    const shouldAutoAssignSequence =
      !hasExplicitTargetSequence && targetSeries !== parsedCurrent.series;

    if (!targetSeries) {
      throw new Error('Target Mikro order series is required');
    }

    if (
      !shouldAutoAssignSequence
      && targetSeries === parsedCurrent.series
      && targetSequence === parsedCurrent.sequence
    ) {
      return `${parsedCurrent.series}-${parsedCurrent.sequence}`;
    }

    const currentSeriesSql = this.escapeSqlString(parsedCurrent.series);
    const targetSeriesSql = this.escapeSqlString(targetSeries);
    const mikroUserNoRaw = Number(process.env.MIKRO_USER_NO || process.env.MIKRO_USERNO || 1);
    const mikroUserNo =
      Number.isFinite(mikroUserNoRaw) && mikroUserNoRaw > 0
        ? Math.trunc(mikroUserNoRaw)
        : 1;

    const targetSequenceValue = shouldAutoAssignSequence ? 'NULL' : String(targetSequence);
    const rows = await mikroService.executeQuery(`
      BEGIN TRY
        BEGIN TRAN;
        DECLARE @targetSequence int = ${targetSequenceValue};

        IF NOT EXISTS (
          SELECT 1
          FROM SIPARISLER
          WHERE sip_evrakno_seri = '${currentSeriesSql}'
            AND sip_evrakno_sira = ${parsedCurrent.sequence}
        )
        BEGIN
          THROW 51000, 'Mikro order not found', 1;
        END;

        IF @targetSequence IS NULL
        BEGIN
          SELECT @targetSequence = ISNULL(MAX(sip_evrakno_sira), 0) + 1
          FROM SIPARISLER WITH (UPDLOCK, HOLDLOCK)
          WHERE sip_evrakno_seri = '${targetSeriesSql}';
        END;

        IF EXISTS (
          SELECT 1
          FROM SIPARISLER
          WHERE sip_evrakno_seri = '${targetSeriesSql}'
            AND sip_evrakno_sira = @targetSequence
        )
        BEGIN
          THROW 51001, 'Target Mikro order number already exists', 1;
        END;

        UPDATE SIPARISLER
        SET
          sip_evrakno_seri = '${targetSeriesSql}',
          sip_evrakno_sira = @targetSequence,
          sip_lastup_date = GETDATE(),
          sip_lastup_user = ${mikroUserNo}
        WHERE sip_evrakno_seri = '${currentSeriesSql}'
          AND sip_evrakno_sira = ${parsedCurrent.sequence};

        IF OBJECT_ID('EVRAK_ACIKLAMALARI', 'U') IS NOT NULL
        BEGIN
          UPDATE EVRAK_ACIKLAMALARI
          SET
            egk_evr_seri = '${targetSeriesSql}',
            egk_evr_sira = @targetSequence,
            egk_lastup_date = GETDATE(),
            egk_lastup_user = ${mikroUserNo}
          WHERE egk_evr_seri = '${currentSeriesSql}'
            AND egk_evr_sira = ${parsedCurrent.sequence};
        END;

        COMMIT;
        SELECT @targetSequence AS targetSequence;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
      END CATCH
    `);

    const resolvedSequence = Number(rows?.[0]?.targetSequence);
    if (!Number.isFinite(resolvedSequence) || resolvedSequence <= 0) {
      throw new Error('Target Mikro order sequence could not be resolved');
    }

    return `${targetSeries}-${Math.trunc(resolvedSequence)}`;
  }

  private async repriceCartItemsForOrder(userId: string, cart: { items: Array<any> }, skippedHidden?: string[]): Promise<RepricedCartItem[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        mikroCariCode: true,
        customerType: true,
        invoicedPriceListNo: true,
        whitePriceListNo: true,
        priceVisibility: true,
        useLastPrices: true,
        lastPriceGuardType: true,
        lastPriceGuardInvoicedListNo: true,
        lastPriceGuardWhiteListNo: true,
        lastPriceCostBasis: true,
        lastPriceMinCostPercent: true,
        parentCustomerId: true,
        parentCustomer: {
          select: {
            id: true,
            mikroCariCode: true,
            customerType: true,
            invoicedPriceListNo: true,
            whitePriceListNo: true,
            priceVisibility: true,
            useLastPrices: true,
            lastPriceGuardType: true,
            lastPriceGuardInvoicedListNo: true,
            lastPriceGuardWhiteListNo: true,
            lastPriceCostBasis: true,
            lastPriceMinCostPercent: true,
          },
        },
      },
    });

    const customer = user?.parentCustomer || user;
    if (!user || !customer || !customer.customerType) {
      throw new Error('User has no customer type');
    }

    const effectiveVisibility: PriceVisibilityValue | null | undefined = user.parentCustomerId
      ? (customer.priceVisibility === 'WHITE_ONLY' ? 'WHITE_ONLY' : 'INVOICED_ONLY')
      : (customer.priceVisibility as PriceVisibilityValue | null | undefined);

    // excludeFromDiscount: bayrakli urun sepette EXCESS satirda kalmis olsa bile
    // siparise DAIMA liste fiyatiyla yazilir (indirim bypass korumasi).
    const isExcessItem = (item: any) =>
      item.priceMode === 'EXCESS' && !item.product?.excludeFromDiscount;
    const listItems = cart.items.filter((item) => !isExcessItem(item));
    const productCodes = Array.from(
      new Set(listItems.map((item) => String(item.product?.mikroCode || '').trim()).filter(Boolean))
    );
    const productIds = Array.from(
      new Set(cart.items.map((item) => String(item.productId || '').trim()).filter(Boolean))
    );

    const [settings, priceListRules, priceStatsMap, agreementRows] = await Promise.all([
      prisma.settings.findFirst({
        select: { customerPriceLists: true },
      }),
      prisma.customerPriceListRule.findMany({
        where: { customerId: customer.id },
      }),
      priceListService.getPriceStatsMap(productCodes),
      prisma.customerPriceAgreement.findMany({
        where: {
          customerId: customer.id,
          productId: { in: productIds },
        },
        select: {
          productId: true,
          priceInvoiced: true,
          priceWhite: true,
          minQuantity: true,
          validFrom: true,
          validTo: true,
        },
      }),
    ]);

    const basePriceListPair = resolveCustomerPriceLists(customer, settings);
    const agreementMap = new Map(agreementRows.map((row) => [row.productId, row]));
    const now = new Date();

    let lastSalesMap = new Map<string, number>();
    if (customer.useLastPrices && customer.mikroCariCode && productCodes.length > 0) {
      try {
        const sales = await mikroService.getCustomerSalesMovements(
          customer.mikroCariCode as string,
          productCodes,
          1
        );
        lastSalesMap = buildLastSalesMap(sales);
      } catch (error) {
        console.error('Customer last prices failed while creating order', { customerId: customer.id, error });
      }
    }

    // Paket (bundle) satirlari: siparis aninda bilesen dokumunu (iskonto gomulu birim
    // fiyatlar) hesapla; Mikro'ya bu bilesenler yazilacak (paketin sentetik kodu DEGIL).
    const bundleResults = new Map<string, { unitPrice: number; components: BundleComponentSnapshot[] }>();
    const bundleCartItems = cart.items.filter((it: any) => it.product?.isBundle);
    if (bundleCartItems.length > 0) {
      const bundleCtx = await loadCartCustomerContext(userId);
      const includedWarehouses =
        (await prisma.settings.findFirst({ select: { includedWarehouses: true } }))?.includedWarehouses || [];
      for (const it of bundleCartItems) {
        const pType: CartPriceType = it.priceType === 'WHITE' ? 'WHITE' : 'INVOICED';
        try {
          const res = await bundlePricingService.buildOrderBundleComponents(
            bundleCtx,
            includedWarehouses,
            it.productId,
            pType
          );
          if (res && res.components.length > 0) bundleResults.set(it.id, res);
        } catch (error) {
          console.error('Bundle order pricing failed', { userId, productId: it.productId, error });
        }
      }
    }

    const repriced = cart.items.flatMap((item): RepricedCartItem[] => {
      const product = item.product;
      if (!product) {
        throw new Error('Product not found in cart');
      }
      if (!product.active || product.hiddenFromCustomers) {
        // 1.6: Gizlenen/pasif urun tum siparisi reddetmesin; bu satiri sessizce atla ve
        // hangi urunun cikarildigini bildirmek uzere listeye ekle.
        if (skippedHidden) {
          skippedHidden.push(product.name || product.mikroCode || 'Bilinmeyen urun');
        }
        return [];
      }

      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(`Invalid quantity for ${product.mikroCode || product.name}`);
      }

      const priceType: PriceType = item.priceType === 'WHITE' ? 'WHITE' : 'INVOICED';
      if (!isPriceTypeAllowed(effectiveVisibility, priceType)) {
        throw new Error(`Price type not allowed for ${product.mikroCode || product.name}`);
      }

      // Paket satiri: siparise BILESENLERINE AYRILARAK yazilir. Boylece B2B admin sipariste
      // her urunu ayri satir + urun-basi karlilik gorur; Mikro'ya da dogal olarak gercek
      // bilesen kodlariyla gider (sentetik paket kodu asla yazilmaz). Iskonto her bilesenin
      // birim fiyatina gomulu; lineNote'a "SET: <paket adi>" etiketi (gruplama gorunur).
      if (product.isBundle) {
        const br = bundleResults.get(item.id);
        if (!br) {
          // Paket fiyatlanamadi (bilesen pasif/gizli/eksik) -> satiri sessizce atla.
          if (skippedHidden) skippedHidden.push(product.name || product.mikroCode || 'Paket');
          return [];
        }
        const baseNote = item.lineNote ? String(item.lineNote).trim() : '';
        const setLabel = `SET: ${product.name}${baseNote ? ' | ' + baseNote : ''}`;
        return br.components.map((c) => ({
          productId: c.componentProductId,
          productName: c.name,
          mikroCode: c.mikroCode,
          quantity: c.quantity * quantity,
          priceType,
          unitPrice: c.unitPrice,
          totalPrice: c.quantity * quantity * c.unitPrice,
          lineNote: setLabel,
          unit: c.unit || 'ADET',
          unit2: null,
          unit2Factor: null,
          selectedUnit: null,
        })) as RepricedCartItem[];
      }

      const prices = product.prices as unknown as ProductPrices;
      const customerPrices = pricingService.getPriceForCustomer(
        prices,
        customer.customerType as any
      );

      let unitPrice = 0;
      if (isExcessItem(item)) {
        unitPrice = priceType === 'INVOICED' ? customerPrices.invoiced : customerPrices.white;
      } else {
        const priceStats = priceStatsMap.get(product.mikroCode) || null;
        const productPriceListPair = resolveCustomerPriceListsForProduct(
          basePriceListPair,
          priceListRules,
          {
            brandCode: product.brandCode,
            categoryId: product.categoryId,
          }
        );
        const listInvoiced = priceListService.getListPriceWithFallback(
          priceStats,
          productPriceListPair.invoiced
        );
        const listWhite = priceListService.getListPriceWithFallback(
          priceStats,
          productPriceListPair.white
        );
        const listPricesBase = {
          invoiced: listInvoiced > 0 ? listInvoiced : customerPrices.invoiced,
          white: listWhite > 0 ? listWhite : customerPrices.white,
        };
        const guardPrices = getLastPriceGuardPrices(
          priceStats,
          customer.lastPriceGuardInvoicedListNo,
          customer.lastPriceGuardWhiteListNo
        );
        const lastPriceResult = resolveLastPriceOverride({
          config: customer,
          lastSalePrice: lastSalesMap.get(product.mikroCode),
          listPrices: listPricesBase,
          guardPrices,
          product: {
            currentCost: product.currentCost,
            lastEntryPrice: product.lastEntryPrice,
          },
          priceVisibility: effectiveVisibility,
        });
        unitPrice = priceType === 'INVOICED' ? lastPriceResult.prices.invoiced : lastPriceResult.prices.white;
      }

      const agreement = agreementMap.get(item.productId);
      if (agreement && isAgreementApplicable(agreement, now, quantity)) {
        unitPrice = resolveAgreementPrice(agreement, priceType, unitPrice);
      }

      return [{
        productId: item.productId,
        productName: product.name,
        mikroCode: product.mikroCode,
        quantity,
        priceType,
        unitPrice,
        totalPrice: quantity * unitPrice,
        lineNote: item.lineNote ? String(item.lineNote).trim() : null,
        // Birim snapshot: urunden ana/2. birim + katsayi; secilen birim cart item'dan.
        unit: product.unit || 'ADET',
        unit2: product.unit2 || null,
        unit2Factor:
          Number.isFinite(Number(product.unit2Factor)) ? Number(product.unit2Factor) : null,
        selectedUnit: item.selectedUnit ? String(item.selectedUnit).trim() : null,
      }];
    });

    // flatMap: paketler bilesenlerine acildi, atlananlar [] dondu -> ekstra filtre gerekmez.
    return repriced;
  }

  /**
   * Sepetten sipariş oluştur
   */
  async createOrderFromCart(
    userId: string,
    details?: { customerOrderNumber?: string; deliveryLocation?: string }
  ): Promise<{
    orderId: string;
    orderNumber: string;
    skippedItems?: string[];
  }> {
    // 1.8: Ayni musterinin sepetinden es zamanli/cift-tik ile BIRDEN COK siparis
    // olusmasini onlemek icin musteri bazli kilit. Kilit icinde sepet yeniden okunur;
    // ilk istek sepeti bosaltinca ikinci istek "sepet bos" hatasi alir.
    const releaseLock = await this.acquireKeyedLock(`cart:${userId}`);
    try {
      // 1. Kullanıcının sepetini al
      await cartPricingService.syncCartDiscountAllocations(userId);

      const cart = await prisma.cart.findUnique({
        where: { userId },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      if (!cart || cart.items.length === 0) {
        throw new Error('Cart is empty');
      }

      // 1.6: Gizli/pasif urunler tum siparisi reddetmesin; atla ve hangileri cikarildi bildir.
      const skippedItems: string[] = [];
      const orderItems = await this.repriceCartItemsForOrder(userId, cart, skippedItems);

      if (orderItems.length === 0) {
        throw new Error('Sepetinizdeki urunler artik satista degil. Lutfen sepeti guncelleyin.');
      }

      // GWP: dogrulanmis hediye satir(lar)i. Gecerli kampanya + baraj gecilmis + secili urun
      // havuzda ise eklenir; Mikro'ya 0,1 ₺ olarak yazilir (approveOrderAndWriteToMikro yolu).
      // Baraji SUNUCU yeniden hesaplar (client'a guvenmez). Musteri toplamina EKLENMEZ.
      const giftLines = await giftCampaignService.resolveGiftLineForOrder(userId);

      // 3. Sipariş numarası üret
      const lastOrder = await prisma.order.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { orderNumber: true },
      });

      const orderNumber = generateOrderNumber(lastOrder?.orderNumber);

      const normalizedCustomerOrderNumber = details?.customerOrderNumber
        ? String(details.customerOrderNumber).trim()
        : '';
      const normalizedDeliveryLocation = details?.deliveryLocation
        ? String(details.deliveryLocation).trim()
        : '';

      // 4. Toplam tutarı hesapla
      const totalAmount = orderItems.reduce(
        (sum, item) => sum + item.totalPrice,
        0
      );

      // 5. 1.8: Siparis olusturma + sepet temizleme TEK ATOMIK islemde.
      // Boylece yarida kalan / mukerrer durum olusmaz.
      const [order] = await prisma.$transaction([
        prisma.order.create({
          data: {
            orderNumber,
            userId,
            status: 'PENDING',
            totalAmount,
            customerOrderNumber: normalizedCustomerOrderNumber || undefined,
            deliveryLocation: normalizedDeliveryLocation || undefined,
            items: {
              create: [
                ...orderItems.map((item) => ({
                  productId: item.productId,
                  productName: item.productName,
                  mikroCode: item.mikroCode,
                  // Birim snapshot'lari (Mikro'ya yazimda alt birim aciklamasi icin gerekli).
                  unit: item.unit || undefined,
                  unit2: item.unit2 || undefined,
                  unit2Factor: item.unit2Factor ?? undefined,
                  selectedUnit: item.selectedUnit || undefined,
                  quantity: item.quantity,
                  priceType: item.priceType,
                  unitPrice: item.unitPrice,
                  totalPrice: item.totalPrice,
                  lineNote: item.lineNote ? String(item.lineNote).trim() : undefined,
                  isGift: false,
                  // Paket satiri ise bilesen dokumu (Mikro yazimda patlatilir).
                  bundleComponents: item.bundleComponents ? (item.bundleComponents as any) : undefined,
                })),
                // GWP hediye satir(lar)i — 0,1 ₺, isGift bayrakli, musteri toplamina dahil degil
                ...giftLines.map((gift) => ({
                  productId: gift.productId,
                  productName: gift.productName,
                  mikroCode: gift.mikroCode,
                  quantity: gift.quantity,
                  priceType: gift.priceType,
                  unitPrice: gift.unitPrice,
                  totalPrice: gift.unitPrice * gift.quantity,
                  lineNote: gift.lineNote,
                  isGift: true,
                })),
              ],
            },
          },
        }),
        prisma.cartItem.deleteMany({
          where: { cartId: cart.id },
        }),
        // Siparise gecen hediye secimini sepetten temizle
        prisma.cart.update({
          where: { id: cart.id },
          data: { giftCampaignId: null, giftProductIds: [] },
        }),
      ]);

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        skippedItems: skippedItems.length > 0 ? skippedItems : undefined,
      };
    } finally {
      releaseLock();
    }
  }

  async createManualOrder(input: {
    customerId: string;
    items: Array<{
      productId?: string;
      productCode?: string;
      productName?: string;
      unit?: string;
      unit2?: string | null;
      unit2Factor?: number | null;
      selectedUnit?: string | null;
      quantity: number;
      unitPrice: number;
      priceType?: 'INVOICED' | 'WHITE';
      vatZeroed?: boolean;
      manualVatRate?: number;
      lineDescription?: string;
      responsibilityCenter?: string;
      reserveQty?: number;
    }>;
    warehouseNo: number;
    description?: string;
    documentDescription?: string;
    documentNo?: string;
    invoicedSeries?: string;
    invoicedSira?: number;
    whiteSeries?: string;
    whiteSira?: number;
    requestedById?: string;
  }): Promise<{ mikroOrderIds: string[]; orderId: string; orderNumber: string }> {
    const {
      customerId,
      items,
      warehouseNo,
      description,
      documentDescription,
      documentNo,
      invoicedSeries,
      invoicedSira,
      whiteSeries,
      whiteSira,
      requestedById,
    } = input;

    if (!customerId) {
      throw new Error('Customer is required');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Order items are required');
    }

    const warehouseValueRaw = Number(warehouseNo);
    const warehouseValue =
      Number.isFinite(warehouseValueRaw) && warehouseValueRaw > 0
        ? Math.trunc(warehouseValueRaw)
        : null;
    if (!warehouseValue) {
      throw new Error('Warehouse is required');
    }

    const customer = await prisma.user.findUnique({
      where: { id: customerId },
      select: {
        mikroCariCode: true,
        paymentPlanNo: true,
        name: true,
        displayName: true,
        email: true,
        phone: true,
        city: true,
        district: true,
        hasEInvoice: true,
      },
    });

    if (!customer || !customer.mikroCariCode) {
      throw new Error('Customer not found or missing Mikro cari code');
    }

    await mikroService.ensureCariExists({
      cariCode: customer.mikroCariCode,
      unvan: customer.displayName || customer.name || customer.mikroCariCode,
      email: customer.email || undefined,
      phone: customer.phone || undefined,
      city: customer.city || undefined,
      district: customer.district || undefined,
      hasEInvoice: customer.hasEInvoice || false,
    });

    const productIds = items
      .map((item) => item.productId)
      .filter((id): id is string => Boolean(id));
    const productCodes = items
      .filter((item) => !item.productId && item.productCode)
      .map((item) => String(item.productCode));

    const products = await prisma.product.findMany({
      where: {
        OR: [
          ...(productIds.length > 0 ? [{ id: { in: productIds } }] : []),
          ...(productCodes.length > 0 ? [{ mikroCode: { in: productCodes } }] : []),
        ],
      },
    });

    const productById = new Map(products.map((product) => [product.id, product]));
    const productByCode = new Map(products.map((product) => [product.mikroCode, product]));

    const normalizedItems = items.map((item, index) => {
      const product = item.productId
        ? productById.get(item.productId)
        : item.productCode
          ? productByCode.get(item.productCode)
          : undefined;

      if (!product) {
        throw new Error(`Product not found for line ${index + 1}`);
      }

      // Paket (bundle) manuel/duzenleme yoluyla siparise eklenemez (bilesen patlatma bu yolda yok).
      if ((product as any).isBundle) {
        throw new Error(`Paket (${product.name}) bu yolla siparise eklenemez. Musteri sepetinden eklenmelidir.`);
      }

      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(`Invalid quantity for line ${index + 1}`);
      }

      const unitPrice = Number(item.unitPrice);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error(`Invalid unit price for line ${index + 1}`);
      }

      const priceType: PriceType = item.priceType === 'WHITE' ? 'WHITE' : 'INVOICED';
      const manualVatRate = Number(item.manualVatRate);
      const vatRate =
        priceType === 'WHITE' || item.vatZeroed
          ? 0
          : Number.isFinite(manualVatRate)
            ? manualVatRate
            : Number(product.vatRate || 0.2);

      const lineDescription =
        item.lineDescription?.trim() ||
        item.productName?.trim() ||
        product.name ||
        '';
      const reserveQtyRaw = Number(item.reserveQty);
      const reserveQty =
        Number.isFinite(reserveQtyRaw) && reserveQtyRaw > 0
          ? Math.min(reserveQtyRaw, quantity)
          : 0;

      return {
        productId: product.id,
        productName: item.productName?.trim() || product.name,
        productCode: product.mikroCode,
        unit: item.unit?.trim() || product.unit || 'ADET',
        unit2: item.unit2?.trim() || product.unit2 || null,
        unit2Factor:
          Number.isFinite(Number(item.unit2Factor ?? product.unit2Factor))
            ? Number(item.unit2Factor ?? product.unit2Factor)
            : null,
        selectedUnit: item.selectedUnit?.trim() || item.unit?.trim() || product.unit || 'ADET',
        quantity,
        unitPrice,
        vatRate,
        // Faturali satirda KDV=0 secildiyse kalici isaretle; guncellemede KDV geri gelmesin.
        vatZeroed: priceType !== 'WHITE' && vatRate === 0,
        priceType,
        lineDescription,
        responsibilityCenter: item.responsibilityCenter?.trim() || undefined,
        reserveQty,
      };
    });

    const invoicedItems = normalizedItems.filter((item) => item.priceType === 'INVOICED');
    const whiteItems = normalizedItems.filter((item) => item.priceType === 'WHITE');

    // Seri kontrolleri Mikro/DB yazimindan ONCE yapilir; hatali istek iz birakmaz.
    if (invoicedItems.length > 0 && !invoicedSeries) {
      throw new Error('Invoiced order series is required');
    }
    if (whiteItems.length > 0 && !whiteSeries) {
      throw new Error('White order series is required');
    }

    // MUKERRER EVRAK KORUMASI: B2B siparis kaydi Mikro yazimindan ONCE olusturulur
    // (status PENDING + bos mikroOrderIds). Her basarili writeOrder sonrasi
    // mikroOrderIds ve ilgili kalemler ANINDA guncellenir. Boylece beyaz yazim veya
    // DB kaydi patlarsa Mikro'daki evrak izsiz kalmaz; ayni siparis onay akisina
    // tekrar geldiginde yazilmis taraf atlanir (idempotent).
    const lastOrder = await prisma.order.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { orderNumber: true },
    });
    const orderNumber = generateOrderNumber(lastOrder?.orderNumber);

    const totalAmount = normalizedItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    );

    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: customerId,
        requestedById: requestedById || undefined,
        status: 'PENDING',
        totalAmount,
        mikroOrderIds: [],
        customerOrderNumber: documentNo?.trim() || undefined,
        adminNote: description?.trim() || undefined,
        items: {
          create: normalizedItems.map((item) => ({
            productId: item.productId,
            productName: item.productName || item.productCode,
            mikroCode: item.productCode,
            unit: item.unit,
            unit2: item.unit2 || undefined,
            unit2Factor: item.unit2Factor ?? undefined,
            selectedUnit: item.selectedUnit || item.unit,
            quantity: item.quantity,
            priceType: item.priceType,
            unitPrice: item.unitPrice,
            totalPrice: item.unitPrice * item.quantity,
            lineNote: item.lineDescription || undefined,
            responsibilityCenter: item.responsibilityCenter || undefined,
            status: 'PENDING',
            vatRate: item.vatRate,
            vatZeroed: item.vatZeroed,
          })),
        },
      },
      include: {
        items: { select: { id: true, priceType: true, quantity: true } },
      },
    });

    const mikroOrderIds: string[] = [];

    // Basarili Mikro yazimini ANINDA kaydet: order.mikroOrderIds + ilgili kalemler.
    const persistWrittenSide = async (priceType: PriceType, mikroOrderId: string) => {
      const sideItems = (order.items || []).filter((item) => item.priceType === priceType);
      await prisma.$transaction([
        prisma.order.update({
          where: { id: order.id },
          data: { mikroOrderIds: Array.from(new Set(mikroOrderIds)) },
        }),
        ...sideItems.map((item) =>
          prisma.orderItem.update({
            where: { id: item.id },
            data: { status: 'APPROVED', approvedQuantity: item.quantity, mikroOrderId },
          })
        ),
      ]);
    };

    try {
      if (invoicedItems.length > 0) {
        const invoicedOrderId = await mikroService.writeOrder({
          cariCode: customer.mikroCariCode,
          items: invoicedItems.map((item) => ({
            productCode: item.productCode,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            vatRate: item.vatRate,
            lineDescription: item.lineDescription || undefined,
            responsibilityCenter: item.responsibilityCenter || undefined,
            reserveQty: item.reserveQty || 0,
          })),
          applyVAT: true,
          description: description?.trim() || 'B2B Manuel Siparis',
          documentDescription: documentDescription?.trim() || undefined,
          documentNo: documentNo?.trim() || undefined,
          evrakSeri: String(invoicedSeries).trim(),
          evrakSira: Number.isFinite(Number(invoicedSira)) ? Number(invoicedSira) : undefined,
          warehouseNo: warehouseValue,
          paymentPlanNo: customer.paymentPlanNo ?? undefined,
        });
        if (invoicedOrderId) {
          mikroOrderIds.push(invoicedOrderId);
          await persistWrittenSide('INVOICED', invoicedOrderId);
        }
      }

      if (whiteItems.length > 0) {
        const whiteOrderId = await mikroService.writeOrder({
          cariCode: customer.mikroCariCode,
          items: whiteItems.map((item) => ({
            productCode: item.productCode,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            vatRate: 0,
            lineDescription: item.lineDescription || undefined,
            responsibilityCenter: item.responsibilityCenter || undefined,
            reserveQty: item.reserveQty || 0,
          })),
          applyVAT: false,
          description: description?.trim() || 'B2B Manuel Siparis',
          documentDescription: documentDescription?.trim() || undefined,
          documentNo: documentNo?.trim() || undefined,
          evrakSeri: String(whiteSeries).trim(),
          evrakSira: Number.isFinite(Number(whiteSira)) ? Number(whiteSira) : undefined,
          warehouseNo: warehouseValue,
          paymentPlanNo: customer.paymentPlanNo ?? undefined,
        });
        if (whiteOrderId) {
          mikroOrderIds.push(whiteOrderId);
          await persistWrittenSide('WHITE', whiteOrderId);
        }
      }

      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'APPROVED', approvedAt: new Date() },
      });

      return { mikroOrderIds, orderId: order.id, orderNumber: order.orderNumber };
    } catch (error: any) {
      console.error('Manuel siparis Mikro yazimi tamamlanamadi:', order.orderNumber, error);
      const partialInfo =
        mikroOrderIds.length > 0
          ? `MIKRO_PARTIAL: yazilan evrak(lar) ${mikroOrderIds.join(', ')}`
          : 'MIKRO_PARTIAL: Mikro evraki yazilamadi';
      try {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            adminNote: [description?.trim(), partialInfo].filter(Boolean).join(' | '),
          },
        });
      } catch (persistErr) {
        console.error('KRITIK: MIKRO_PARTIAL isareti kaydedilemedi:', order.id, persistErr);
      }

      if (mikroOrderIds.length > 0) {
        throw new Error(
          `Siparis Mikro'ya KISMEN yazildi (${mikroOrderIds.join(', ')}). ` +
          `B2B siparisi ${order.orderNumber} beklemede birakildi; siparis tekrar onaylandiginda ` +
          `yazilmis evraklar ATLANIR, cift evrak olusmaz. Detay: ${error.message}`
        );
      }
      throw new Error(
        `Siparis Mikro'ya yazilamadi. B2B siparisi ${order.orderNumber} beklemede; ` +
        `kontrol edip siparis onay ekranindan tekrar deneyebilirsiniz. Detay: ${error.message}`
      );
    }
  }

  /**
   * Kullanıcının siparişlerini getir
   */
  async getUserOrders(userId: string): Promise<any[]> {
    const orders = await prisma.order.findMany({
      where: { userId },
      include: {
        requestedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        customerRequest: {
          select: {
            id: true,
            createdAt: true,
            requestedBy: { select: { id: true, name: true, email: true } },
          },
        },
        sourceQuote: {
          select: { id: true, quoteNumber: true, createdAt: true },
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                mikroCode: true,
                imageUrl: true,
                vatRate: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return orders;
  }

  /**
   * Bekleyen siparişleri getir (Admin için)
   * ADMIN/MANAGER: Tüm bekleyen siparişler
   * SALES_REP: Sadece atanan sektör kodlarındaki müşterilerin bekleyen siparişleri
   */
  async getPendingOrders(sectorCodes?: string[]): Promise<any[]> {
    const where: any = { status: 'PENDING' };

    // Sektör filtresi varsa uygula
    if (sectorCodes && sectorCodes.length > 0) {
      where.user = {
        sectorCode: { in: sectorCodes }
      };
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        user: {
          select: {
            name: true,
            email: true,
            mikroCariCode: true,
            customerType: true,
            city: true,
            district: true,
            phone: true,
            groupCode: true,
            sectorCode: true,
            paymentTerm: true,
            paymentPlanNo: true,
            paymentPlanCode: true,
            paymentPlanName: true,
            hasEInvoice: true,
            balance: true,
            isLocked: true,
          },
        },
        requestedBy: {
          select: { id: true, name: true, email: true },
        },
        customerRequest: {
          select: {
            id: true,
            createdAt: true,
            requestedBy: { select: { id: true, name: true, email: true } },
          },
        },
        sourceQuote: {
          select: { id: true, quoteNumber: true, createdAt: true },
        },
        items: {
          include: {
            product: {
              select: {
                name: true,
                mikroCode: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return orders;
  }

  /**
   * Update pending order (admin)
   */
  async updateOrder(
    orderId: string,
    input: {
      customerOrderNumber?: string;
      deliveryLocation?: string;
      invoicedSeries?: string;
      invoicedSira?: number | string | null;
      whiteSeries?: string;
      whiteSira?: number | string | null;
      items: Array<{
        productId?: string;
        productCode?: string;
        productName?: string;
        unit?: string;
        unit2?: string | null;
        unit2Factor?: number | null;
        selectedUnit?: string | null;
        quantity: number;
        unitPrice: number;
        priceType?: 'INVOICED' | 'WHITE';
        lineNote?: string;
        responsibilityCenter?: string;
      }>;
    }
  ): Promise<any> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: {
          select: {
            id: true,
            mikroCariCode: true,
            paymentPlanNo: true,
          },
        },
        sourceQuote: { select: { quoteNumber: true } },
        items: {
          select: {
            id: true,
            mikroCode: true,
            priceType: true,
            mikroOrderId: true,
            bundleComponents: true,
          },
        },
      },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    if (!['PENDING', 'APPROVED'].includes(order.status)) {
      throw new Error('Only pending or approved orders can be updated');
    }

    // Paket (bundle) satirlari Mikro'ya bilesenlerine patlatilarak yazilir; duzenleme
    // yolunda bilesen bazli guncelleme/kapatma bu ilk surumde desteklenmiyor. Sessiz
    // Mikro bozulmasini onlemek icin paket iceren siparisin duzenlenmesi engellenir.
    if ((order.items as any[]).some((it) => it.bundleComponents != null)) {
      throw new Error('Paket iceren siparisler duzenlenemez. Siparisi reddedip yeniden olusturun.');
    }

    if (!input?.items || !Array.isArray(input.items) || input.items.length == 0) {
      throw new Error('Order items are required');
    }

    const productIds = input.items
      .map((item) => item.productId)
      .filter((id): id is string => Boolean(id));
    const productCodes = input.items
      .map((item) => item.productCode)
      .filter((code): code is string => Boolean(code))
      .map((code) => String(code));

    const products = await prisma.product.findMany({
      where: {
        OR: [
          ...(productIds.length > 0 ? [{ id: { in: productIds } }] : []),
          ...(productCodes.length > 0 ? [{ mikroCode: { in: productCodes } }] : []),
        ],
      },
    });

    const productById = new Map(products.map((product) => [product.id, product]));
    const productByCode = new Map(products.map((product) => [product.mikroCode, product]));

    const normalizedItems = input.items.map((item, index) => {
      const product = item.productId
        ? productById.get(item.productId)
        : item.productCode
          ? productByCode.get(item.productCode)
          : undefined;

      if (!product) {
        throw new Error(`Product not found for line ${index + 1}`);
      }

      // Paket (bundle) manuel/duzenleme yoluyla siparise eklenemez (bilesen patlatma bu yolda yok).
      if ((product as any).isBundle) {
        throw new Error(`Paket (${product.name}) bu yolla siparise eklenemez. Musteri sepetinden eklenmelidir.`);
      }

      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(`Invalid quantity for line ${index + 1}`);
      }

      const unitPrice = Number(item.unitPrice);
      // 3.6: Sifir/negatif fiyat neredeyse her zaman veri giris hatasidir ve dogrudan
      // gercek Mikro siparisine yazilmamali.
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        throw new Error(`Gecersiz birim fiyat (satir ${index + 1}): fiyat sifirdan buyuk olmali`);
      }

      const priceType: PriceType = item.priceType == 'WHITE' ? 'WHITE' : 'INVOICED';

      // 3.6: Maliyet alti / asiri dusuk fiyat uyarisi (islemi engellemez; operator log'da gorur,
      // kullanici-yuzu uyari onay ekraninda gosterilir).
      const lineCost = Number((product as any).currentCost) || 0;
      if (priceType === 'INVOICED' && lineCost > 0 && unitPrice < lineCost) {
        console.warn(
          `⚠️ 3.6 Maliyet alti fiyat (satir ${index + 1}, urun ${product.mikroCode}): ` +
          `fiyat ${unitPrice} < guncel maliyet ${lineCost}`
        );
      }
      const lineNote = item.lineNote?.trim();
      const responsibilityCenter = item.responsibilityCenter?.trim();
      const productName = item.productName?.trim() || product.name;
      const vatRate =
        priceType === 'WHITE'
          ? 0
          : Number(product.vatRate || 0.2);

      return {
        orderId,
        productId: product.id,
        productName,
        mikroCode: product.mikroCode,
        unit: item.unit?.trim() || product.unit || 'ADET',
        unit2: item.unit2?.trim() || product.unit2 || null,
        unit2Factor:
          Number.isFinite(Number(item.unit2Factor ?? product.unit2Factor))
            ? Number(item.unit2Factor ?? product.unit2Factor)
            : null,
        selectedUnit: item.selectedUnit?.trim() || item.unit?.trim() || product.unit || 'ADET',
        quantity,
        priceType,
        unitPrice,
        totalPrice: unitPrice * quantity,
        lineNote: lineNote || undefined,
        responsibilityCenter: responsibilityCenter || undefined,
        vatRate,
        status: 'PENDING' as const,
      };
    });

    const normalizedCustomerOrderNumber = input.customerOrderNumber
      ? String(input.customerOrderNumber).trim()
      : '';
    const normalizedDeliveryLocation = input.deliveryLocation
      ? String(input.deliveryLocation).trim()
      : '';

    let workingMikroOrderIds = Array.from(
      new Set((order.mikroOrderIds || []).map((id) => String(id || '').trim()).filter(Boolean))
    );
    if (order.status === 'APPROVED' && workingMikroOrderIds.length > 0) {
      workingMikroOrderIds = await this.reconcileMikroOrderLinksFromQuote({
        id: order.id,
        mikroOrderIds: workingMikroOrderIds,
        sourceQuote: order.sourceQuote,
        items: order.items.map((item) => ({
          id: item.id,
          mikroCode: item.mikroCode,
          mikroOrderId: item.mikroOrderId,
        })),
      });
    }

    const shouldUpdateMikro = order.status === 'APPROVED' && workingMikroOrderIds.length > 0;
    // Mevcut kalemler HER durumda okunur: kalem durumu (REJECTED/APPROVED), hediye (isGift),
    // KDV (vatZeroed/vatRate) ve Mikro eslesme bilgisi silinip yeniden yaratmada tasinir.
    const existingItems: Array<any> = await prisma.orderItem.findMany({
      where: { orderId },
      include: { product: { select: { vatRate: true } } },
    });

    // Yeni kalem listesi <-> mevcut kalem eslestirmesi (once productId, sonra mikroCode).
    const existingByProductId = new Map<string, Array<any>>();
    existingItems.forEach((item) => {
      if (!item.productId) return;
      const key = String(item.productId);
      const list = existingByProductId.get(key) || [];
      list.push(item);
      existingByProductId.set(key, list);
    });
    const existingByMikroCode = new Map<string, Array<any>>();
    existingItems.forEach((item) => {
      const code = String(item.mikroCode || '').trim();
      if (!code) return;
      const list = existingByMikroCode.get(code) || [];
      list.push(item);
      existingByMikroCode.set(code, list);
    });

    const seenExistingItemIds = new Set<string>();
    const matchedExistingByIndex = new Map<number, any>();
    normalizedItems.forEach((item, index) => {
      let existing: any | undefined;
      const byProduct = existingByProductId.get(item.productId) || [];
      existing = byProduct.find((candidate) => !seenExistingItemIds.has(candidate.id));
      if (!existing) {
        const byCode = existingByMikroCode.get(item.mikroCode) || [];
        existing = byCode.find((candidate) => !seenExistingItemIds.has(candidate.id));
      }
      // 3.1: ESKI KOR FALLBACK KALDIRILDI.
      // Onceden, urun/kod ile eslesemeyen kalem, ilgisiz HERHANGI bir mevcut satira
      // koru koruna eslestiriliyor ve o satirin uzerine yaziliyordu (yanlis urun/fiyat,
      // yanlis satir kapatma). Artik eslesmeyen kalemler extraItems'a dusup
      // Mikro'ya YENI satir olarak ekleniyor. Boylece gercek musteri siparisindeki
      // ilgisiz satirlar asla ezilmiyor.
      if (existing) {
        seenExistingItemIds.add(existing.id);
        matchedExistingByIndex.set(index, existing);
      }
    });

    // Mevcut kalemdeki kalici KDV bilgisi: vatZeroed=true ise KDV=0 KORUNUR (beyaz/KDV-sifir
    // satir guncellemede KDV'ye geri donmez); ozel vatRate girildiyse o da korunur.
    const resolveExistingVatRate = (existing: any, item: { priceType: PriceType; vatRate: number }): number => {
      if (item.priceType === 'WHITE' || existing?.vatZeroed === true) {
        return 0;
      }
      if (existing && typeof existing.vatRate === 'number' && Number.isFinite(existing.vatRate)) {
        return existing.vatRate;
      }
      return Number(existing?.product?.vatRate ?? item.vatRate ?? 0.2);
    };

    const mikroOrderIdByLineIndex = new Map<number, string | null>();
    const appendedMikroOrderIds: string[] = [];
    const renamedMikroOrderIds = new Map<string, string>();
    const resolveMikroOrderId = (value?: string | null) => {
      const orderIdValue = String(value || '').trim();
      return renamedMikroOrderIds.get(orderIdValue) || orderIdValue;
    };
    if (shouldUpdateMikro) {
      const pickCurrentMikroOrderId = (priceType: PriceType): string => {
        const fromItems = existingItems
          .map((item) => ({
            priceType: item.priceType === 'WHITE' ? 'WHITE' as PriceType : 'INVOICED' as PriceType,
            mikroOrderId: String(item.mikroOrderId || '').trim(),
          }))
          .find((item) => item.priceType === priceType && item.mikroOrderId);
        return fromItems?.mikroOrderId || workingMikroOrderIds[0] || '';
      };

      const renameByPriceType = async (
        priceType: PriceType,
        targetSeries?: string,
        targetSira?: number | string | null
      ) => {
        const trimmedTargetSeries = String(targetSeries || '').trim();
        const parsedTargetSira = Number(targetSira);
        const hasTargetSira = Number.isFinite(parsedTargetSira) && parsedTargetSira > 0;
        if (!trimmedTargetSeries && !hasTargetSira) {
          return;
        }

        const currentOrderNumber = resolveMikroOrderId(pickCurrentMikroOrderId(priceType));
        if (!currentOrderNumber) {
          throw new Error(`${priceType === 'WHITE' ? 'White' : 'Invoiced'} Mikro order number missing`);
        }

        const nextOrderNumber = await this.renameMikroOrderNumber(
          currentOrderNumber,
          trimmedTargetSeries || undefined,
          hasTargetSira ? parsedTargetSira : undefined
        );
        if (nextOrderNumber !== currentOrderNumber) {
          renamedMikroOrderIds.set(currentOrderNumber, nextOrderNumber);
          workingMikroOrderIds = workingMikroOrderIds.map((id) =>
            id === currentOrderNumber ? nextOrderNumber : id
          );
          existingItems.forEach((item) => {
            if (String(item.mikroOrderId || '').trim() === currentOrderNumber) {
              item.mikroOrderId = nextOrderNumber;
            }
          });
        }
      };

      await renameByPriceType('INVOICED', input.invoicedSeries, input.invoicedSira);
      await renameByPriceType('WHITE', input.whiteSeries, input.whiteSira);
      workingMikroOrderIds = Array.from(new Set(workingMikroOrderIds.map(resolveMikroOrderId).filter(Boolean)));

      const mikroUpdates = new Map<string, Array<{
        existingProductCode?: string;
        productCode: string;
        quantity: number;
        unitPrice: number;
        vatRate: number;
        lineDescription?: string;
      }>>();

      const extraItems: Array<{ index: number; item: (typeof normalizedItems)[number] }> = [];

      normalizedItems.forEach((item, index) => {
        const existing = matchedExistingByIndex.get(index);
        if (!existing) {
          extraItems.push({ index, item });
          return;
        }
        if (existing.status === 'REJECTED') {
          // Reddedilmis kalemin Mikro'da karsiligi yok; guncelleme gonderilmez ve
          // kalem asagida REJECTED olarak korunur (sessizce onaylanmaz).
          mikroOrderIdByLineIndex.set(index, null);
          return;
        }
        const matchedMikroOrderId = resolveMikroOrderId(existing.mikroOrderId);
        mikroOrderIdByLineIndex.set(index, matchedMikroOrderId || null);
        const mikroOrderId = matchedMikroOrderId || (workingMikroOrderIds[0] || '');
        const vatRate = resolveExistingVatRate(existing, item);
        const payload = {
          existingProductCode: String(existing.mikroCode || '').trim() || item.mikroCode,
          productCode: item.mikroCode,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          vatRate,
          lineDescription: item.lineNote || item.productName,
        };
        const list = mikroUpdates.get(mikroOrderId) || [];
        list.push(payload);
        mikroUpdates.set(mikroOrderId, list);
      });

      // Removed items -> close in Mikro
      existingItems.forEach((item) => {
        if (!seenExistingItemIds.has(item.id)) {
          if (item.status === 'REJECTED') {
            // Reddedilmis kalem Mikro'ya hic yazilmadi; kapatma satiri gonderilmez.
            return;
          }
          const mikroOrderId = resolveMikroOrderId(item.mikroOrderId) || (workingMikroOrderIds[0] || '');
          const vatRate =
            item.priceType === 'WHITE' || item.vatZeroed === true
              ? 0
              : Number(item.product?.vatRate || 0.2);
          const payload = {
            productCode: item.mikroCode,
            quantity: 0,
            unitPrice: item.unitPrice,
            vatRate,
            lineDescription: item.lineNote || item.productName,
          };
          const list = mikroUpdates.get(mikroOrderId) || [];
          list.push(payload);
          mikroUpdates.set(mikroOrderId, list);
        }
      });

      for (const [mikroOrderId, items] of mikroUpdates.entries()) {
        if (!mikroOrderId) continue;
        await mikroService.updateOrderLines({
          orderNumber: mikroOrderId,
          items,
          documentDescription: normalizedDeliveryLocation || undefined,
        });
      }

      if (extraItems.length > 0) {
        if (!order.user?.mikroCariCode) {
          throw new Error('Customer Mikro code missing for approved order update');
        }

        const fallbackMikroOrderId = String(workingMikroOrderIds[0] || '').trim();
        if (!fallbackMikroOrderId) {
          throw new Error('Existing Mikro order number missing for approved order update');
        }

        const baseMikroOrderByPriceType = new Map<PriceType, string>();
        existingItems.forEach((item) => {
          const priceType: PriceType = item.priceType === 'WHITE' ? 'WHITE' : 'INVOICED';
          const mikroOrderId = resolveMikroOrderId(item.mikroOrderId);
          if (mikroOrderId && !baseMikroOrderByPriceType.has(priceType)) {
            baseMikroOrderByPriceType.set(priceType, mikroOrderId);
          }
        });

        const extrasByPriceType = new Map<PriceType, Array<{ index: number; item: (typeof normalizedItems)[number] }>>();
        extraItems.forEach((entry) => {
          const list = extrasByPriceType.get(entry.item.priceType) || [];
          list.push(entry);
          extrasByPriceType.set(entry.item.priceType, list);
        });

        for (const [priceType, extras] of extrasByPriceType.entries()) {
          if (!extras.length) continue;

          const baseMikroOrderId = baseMikroOrderByPriceType.get(priceType) || fallbackMikroOrderId;
          const parsedBaseOrder = this.parseMikroOrderNumber(baseMikroOrderId);
          if (!parsedBaseOrder?.series) {
            throw new Error('Cannot determine Mikro order series for approved order update');
          }

          const warehouseNo = await this.getWarehouseNoFromMikroOrder(baseMikroOrderId);
          if (!warehouseNo) {
            throw new Error('Cannot determine warehouse for approved order update');
          }

          const newMikroOrderId = await mikroService.writeOrder({
            cariCode: order.user.mikroCariCode,
            items: extras.map(({ item }) => ({
              productCode: item.mikroCode,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              vatRate: item.priceType === 'WHITE' ? 0 : Number(item.vatRate || 0.2),
              lineDescription: item.lineNote || item.productName,
              responsibilityCenter: item.responsibilityCenter || undefined,
              reserveQty: 0,
            })),
            applyVAT: priceType === 'INVOICED',
            description: order.adminNote?.trim() || `B2B Siparis ${order.orderNumber} - Guncelleme`,
            documentDescription: normalizedDeliveryLocation || undefined,
            documentNo: normalizedCustomerOrderNumber || undefined,
            evrakSeri: parsedBaseOrder.series,
            warehouseNo,
            paymentPlanNo: order.user.paymentPlanNo ?? undefined,
          });

          if (newMikroOrderId) {
            appendedMikroOrderIds.push(newMikroOrderId);
            extras.forEach(({ index }) => {
              mikroOrderIdByLineIndex.set(index, newMikroOrderId);
            });
          }
        }
      }
    }

    // Hediye (isGift) satirlari siparis olusturmadaki kuralla ayni sekilde
    // musteri toplamina DAHIL EDILMEZ.
    const totalAmount = normalizedItems.reduce((sum, item, index) => {
      if (matchedExistingByIndex.get(index)?.isGift === true) {
        return sum;
      }
      return sum + item.unitPrice * item.quantity;
    }, 0);

    await prisma.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({
        where: { orderId },
      });

      await tx.order.update({
        where: { id: orderId },
        data: {
          totalAmount,
          customerOrderNumber: normalizedCustomerOrderNumber || null,
          deliveryLocation: normalizedDeliveryLocation || null,
          ...(shouldUpdateMikro
            ? {
                mikroOrderIds: Array.from(
                  new Set([...workingMikroOrderIds, ...appendedMikroOrderIds])
                ),
              }
            : {}),
        },
      });

      await tx.orderItem.createMany({
        data: normalizedItems.map((item, index) => {
          const existing = matchedExistingByIndex.get(index);
          const mikroOrderId = shouldUpdateMikro
            ? (mikroOrderIdByLineIndex.get(index) || undefined)
            : (existing?.mikroOrderId ? String(existing.mikroOrderId) : undefined);

          // Kalem durumu mevcut kalemden TASINIR:
          // - REJECTED kalem sessizce APPROVED olmaz (Mikro'da karsiligi yok).
          // - Kismi onayla APPROVED olmus kalem (siparis PENDING kalsa da) onayli kalir.
          // - Yeni eklenen kalem Mikro'ya yazilmadiysa PENDING dogar.
          // - Onayli siparisteki mevcut kalemler onayli kalir (tam onay yolunda
          //   kalem statusu PENDING kalmis olabilir; Mikro'da yazilidir).
          let status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING';
          if (existing?.status === 'REJECTED') {
            status = 'REJECTED';
          } else if (existing?.status === 'APPROVED') {
            status = 'APPROVED';
          } else if (order.status === 'APPROVED') {
            status = existing || mikroOrderId ? 'APPROVED' : 'PENDING';
          }

          const vatZeroed = existing?.vatZeroed === true;
          const vatRate = resolveExistingVatRate(existing, item);

          const { vatRate: _vatRate, status: _status, ...itemForCreate } = item as any;
          return {
            ...itemForCreate,
            status,
            approvedQuantity:
              status === 'APPROVED'
                ? (shouldUpdateMikro ? item.quantity : existing?.approvedQuantity ?? item.quantity)
                : undefined,
            rejectionReason: status === 'REJECTED' ? existing?.rejectionReason ?? undefined : undefined,
            isGift: existing?.isGift === true,
            vatRate,
            vatZeroed,
            mikroOrderId,
          };
        }),
      });
    });

    return this.getOrderById(orderId);
  }

  /**
   * Sipariş detayını getir
   */
  async getOrderById(orderId: string): Promise<any> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            customerType: true,
            mikroCariCode: true,
            paymentPlanNo: true,
          },
        },
        requestedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        customerRequest: {
          select: {
            id: true,
            createdAt: true,
            requestedBy: { select: { id: true, name: true, email: true } },
          },
        },
        sourceQuote: {
          select: { id: true, quoteNumber: true, createdAt: true },
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                mikroCode: true,
                imageUrl: true,
                vatRate: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    return order;
  }


  /**
   * Siparişi onayla ve Mikro'ya yaz
   *
   * KRİTİK: Faturalı ve beyaz ürünler için 2 AYRI sipariş yazılır!
   */
  // 3.4 / 1.8: Anahtar bazli (siparis/musteri) process-ici kilit. Cift-tik / es zamanli
  // istekleri serilestirip mukerrer Mikro evraki veya mukerrer siparis olusmasini onler.
  private keyedLockQueue = new Map<string, Promise<void>>();
  private async acquireKeyedLock(key: string): Promise<() => void> {
    const previous = this.keyedLockQueue.get(key) || Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = previous.then(() => gate);
    this.keyedLockQueue.set(key, chained);
    await previous;
    return () => {
      release();
      // Bu kilit kuyrugun sonuysa girdiyi temizle (bellek sizintisini onle)
      if (this.keyedLockQueue.get(key) === chained) {
        this.keyedLockQueue.delete(key);
      }
    };
  }

  async approveOrderAndWriteToMikro(
    orderId: string,
    adminNote?: string,
    series?: { invoiced?: string; white?: string }
  ): Promise<{
    success: boolean;
    mikroOrderIds: string[];
  }> {
    // 3.4: Es zamanli/cift-tik onaylari serilestir; kilit icinde durumu yeniden oku.
    const releaseLock = await this.acquireKeyedLock(`approve:${orderId}`);
    try {
    const order = await this.getOrderById(orderId);

    if (order.status !== 'PENDING') {
      throw new Error('Order is not pending');
    }

    if (!order.user.mikroCariCode) {
      throw new Error('User does not have Mikro cari code');
    }

    // IDEMPOTENTLIK: Daha once (yarim kalan onay / manuel giris) Mikro'ya yazilmis
    // kalemler (mikroOrderId dolu veya status APPROVED) TEKRAR YAZILMAZ; REJECTED
    // kalemler Mikro'ya hic gonderilmez. Sadece bekleyen kalemler yazilir.
    const writableItems = order.items.filter(
      (item: any) => item.status === 'PENDING' && !item.mikroOrderId
    );

    // Siparişi faturalı ve beyaz olarak ayır
    const invoicedItems = writableItems.filter((item: any) => item.priceType === 'INVOICED');
    const whiteItems = writableItems.filter((item: any) => item.priceType === 'WHITE');

    const mikroOrderIds: string[] = Array.from(
      new Set(
        (order.mikroOrderIds || [])
          .map((id: any) => String(id || '').trim())
          .filter(Boolean)
      )
    );

    if (writableItems.length === 0 && mikroOrderIds.length === 0) {
      throw new Error('Onaylanacak bekleyen kalem yok');
    }

    const newlyWrittenIds: string[] = [];
    const normalizeSeries = (value: string | undefined, fallback: string) => {
      const trimmed = String(value || '').trim();
      return trimmed ? trimmed.slice(0, 20) : fallback;
    };
    // Teslimat yeri Mikro evrakina belge aciklamasi olarak yazilir (duzenleme yolundaki gibi).
    const deliveryDescription = order.deliveryLocation
      ? String(order.deliveryLocation).trim()
      : '';

    // Basarili Mikro yazimini ANINDA kaydet; hata olursa yazilan taraf izli kalir
    // ve tekrar onaylamada atlanir.
    const persistWrittenSide = async (items: any[], mikroOrderId: string) => {
      await prisma.$transaction([
        prisma.order.update({
          where: { id: orderId },
          data: { mikroOrderIds: Array.from(new Set(mikroOrderIds)) },
        }),
        ...items.map((item: any) =>
          prisma.orderItem.update({
            where: { id: item.id },
            data: { status: 'APPROVED', approvedQuantity: item.quantity, mikroOrderId },
          })
        ),
      ]);
    };

    try {
      // 0. Cari hesap kontrolü ve oluşturma
      await mikroService.ensureCariExists({
        cariCode: order.user.mikroCariCode,
        unvan: order.user.displayName || order.user.name,
        email: order.user.email,
        phone: order.user.phone || undefined,
        city: order.user.city || undefined,
        district: order.user.district || undefined,
        hasEInvoice: order.user.hasEInvoice,
      });

      // 1. Faturalı sipariş (varsa)
      if (invoicedItems.length > 0) {
        const invoicedSeries = normalizeSeries(series?.invoiced, 'B2BF');
        const invoicedOrderId = await mikroService.writeOrder({
          cariCode: order.user.mikroCariCode,
          // Paket satirlari bilesenlerine patlatilir (buildMikroOrderLines).
          items: invoicedItems.flatMap((item: any) => this.buildMikroOrderLines(item, false)),
          documentNo: order.customerOrderNumber || undefined,
          applyVAT: true,
          description: `B2B Sipariş ${order.orderNumber} - Faturalı${adminNote ? ` | ${adminNote}` : ''}`,
          documentDescription: deliveryDescription || undefined,
          evrakSeri: invoicedSeries,
          paymentPlanNo: order.user.paymentPlanNo ?? undefined,
        });

        mikroOrderIds.push(invoicedOrderId);
        newlyWrittenIds.push(invoicedOrderId);
        await persistWrittenSide(invoicedItems, invoicedOrderId);
      }
      // 2. Beyaz sipariş (varsa)
      if (whiteItems.length > 0) {
        const whiteSeries = normalizeSeries(series?.white, 'B2BB');
        const whiteOrderId = await mikroService.writeOrder({
          cariCode: order.user.mikroCariCode,
          // Paket satirlari bilesenlerine patlatilir; beyazda KDV=0.
          items: whiteItems.flatMap((item: any) => this.buildMikroOrderLines(item, true)),
          documentNo: order.customerOrderNumber || undefined,
          applyVAT: false,
          description: `B2B Sipariş ${order.orderNumber} - Beyaz${adminNote ? ` | ${adminNote}` : ''}`,
          documentDescription: deliveryDescription || undefined,
          evrakSeri: whiteSeries,
          paymentPlanNo: order.user.paymentPlanNo ?? undefined,
        });

        mikroOrderIds.push(whiteOrderId);
        newlyWrittenIds.push(whiteOrderId);
        await persistWrittenSide(whiteItems, whiteOrderId);
      }

      // 3. Sipariş durumunu güncelle
      const uniqueMikroOrderIds = Array.from(new Set(mikroOrderIds));
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'APPROVED',
          mikroOrderIds: uniqueMikroOrderIds,
          approvedAt: new Date(),
          adminNote,
        },
      });

      return {
        success: true,
        mikroOrderIds: uniqueMikroOrderIds,
      };
    } catch (error: any) {
      console.error('❌ Mikro\'ya sipariş yazma hatası:', error);
      // Mikro'da evrak olustuysa: yazilan taraf kalem bazinda isaretlendi (mikroOrderId),
      // siparis PENDING kalir; tekrar onaylamada yazilmis taraf ATLANIR (idempotent).
      if (newlyWrittenIds.length > 0) {
        try {
          await prisma.order.update({
            where: { id: orderId },
            data: {
              adminNote: [
                adminNote?.trim(),
                `MIKRO_PARTIAL: yazilan evrak(lar) ${newlyWrittenIds.join(', ')}`,
              ]
                .filter(Boolean)
                .join(' | '),
            },
          });
        } catch (persistErr) {
          console.error('‼️ KRITIK: MIKRO_PARTIAL isareti kaydedilemedi:', newlyWrittenIds, persistErr);
        }
        throw new Error(
          `Mikro'ya kismi yazim yapildi (${newlyWrittenIds.join(', ')}) ancak islem tamamlanamadi. ` +
          `Siparis beklemede birakildi; tekrar onayladiginizda yazilmis evraklar ATLANIR. Detay: ${error.message}`
        );
      }
      throw new Error(`Siparis Mikro'ya yazilamadi: ${error.message}`);
    }
    } finally {
      releaseLock();
    }
  }

  /**
   * Bir OrderItem'i Mikro satir(lar)ina cevirir.
   * - Normal urun: tek satir (mevcut mantik; alt-birim aciklamasi + KDV kurali korunur).
   * - Paket (bundleComponents dolu): bilesenlere PATLATILIR. Paketin sentetik kodu Mikro'ya
   *   YAZILMAZ. Bilesen miktari = paketBasinaAdet × paketAdedi; birim fiyat iskonto gomulu.
   *   Beyaz tarafta KDV=0 zorlanir; faturalida bilesenin kendi KDV orani kullanilir.
   */
  private buildMikroOrderLines(
    item: any,
    whiteZeroVat: boolean
  ): Array<{ productCode: string; quantity: number; unitPrice: number; vatRate: number; lineDescription?: string }> {
    const comps = Array.isArray(item?.bundleComponents) ? item.bundleComponents : null;
    if (comps && comps.length > 0) {
      const bundleQty = Number(item.quantity) || 0;
      const baseNote = item?.lineNote && String(item.lineNote).trim() ? ` ${String(item.lineNote).trim()}` : '';
      const setLabel = `SET: ${String(item.productName || '').trim()}${baseNote}`.slice(0, 50);
      return comps
        .filter((c: any) => c && c.mikroCode && Number(c.quantity) > 0)
        .map((c: any) => ({
          productCode: String(c.mikroCode),
          quantity: (Number(c.quantity) || 0) * bundleQty,
          unitPrice: Number(c.unitPrice) || 0,
          vatRate: whiteZeroVat ? 0 : (Number(c.vatRate) || 0),
          lineDescription: setLabel,
        }));
    }
    return [{
      productCode: item.product.mikroCode,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      vatRate: whiteZeroVat ? 0 : this.resolveItemVatRate(item),
      lineDescription: this.buildMikroLineDescription(item),
    }];
  }

  /**
   * Mikro satir aciklamasi: alt birim secildiyse depoda okunabilir olmasi icin
   * "{altMiktar} {secilenBirim}" bilgisi mevcut nota EKLENIR (asla ezilmez).
   *
   * Kosul (SADECE alt birim durumu):
   * - item.selectedUnit dolu VE item.unit'ten farkli VE
   * - item.unit2Factor POZITIF bir sayi (ana birim buyuk, secilen birim kucuk).
   *   POZITIF katsayida 1 ana birim = factor alt birim; alt miktar = round(quantity * factor).
   *   NEGATIF/0/tanimsiz katsayida (ana birim = temel adet mantigi) DEGISIKLIK YOK.
   * Miktar/fiyat/birim pointer'a DOKUNULMAZ; sadece aciklamaya ekleme yapilir.
   */
  private buildMikroLineDescription(item: any): string | undefined {
    const baseNote =
      item?.lineNote && String(item.lineNote).trim()
        ? String(item.lineNote).trim()
        : undefined;

    const selectedUnit = item?.selectedUnit ? String(item.selectedUnit).trim() : '';
    const mainUnit = item?.unit ? String(item.unit).trim() : '';
    const factor = Number(item?.unit2Factor);
    const quantity = Number(item?.quantity);

    const isSubUnit =
      selectedUnit.length > 0 &&
      selectedUnit.toUpperCase() !== mainUnit.toUpperCase() &&
      Number.isFinite(factor) &&
      factor > 0 &&
      Number.isFinite(quantity);

    if (!isSubUnit) {
      return baseNote;
    }

    const subQty = Math.round(quantity * factor);
    const subText = `${subQty} ${selectedUnit}`;
    return baseNote ? `${baseNote} | ${subText}` : subText;
  }

  /**
   * Kalem KDV orani: vatZeroed isaretli satir KDV=0 kalir; kalici vatRate varsa o,
   * yoksa urunun guncel KDV orani (varsayilan 0.2) kullanilir.
   */
  private resolveItemVatRate(item: any): number {
    if (item?.vatZeroed === true) {
      return 0;
    }
    if (typeof item?.vatRate === 'number' && Number.isFinite(item.vatRate)) {
      return item.vatRate;
    }
    const productVat = Number(item?.product?.vatRate);
    return Number.isFinite(productVat) && productVat > 0 ? productVat : 0.2;
  }

  /**
   * Kısmi sipariş onayı - Seçili kalemleri onayla
   */
  async approveOrderItemsAndWriteToMikro(
    orderId: string,
    itemIds: string[],
    adminNote?: string,
    series?: { invoiced?: string; white?: string }
  ): Promise<{
    success: boolean;
    mikroOrderIds: string[];
    approvedCount: number;
  }> {
    const order = await this.getOrderById(orderId);

    if (order.status === 'REJECTED') {
      throw new Error('Cannot approve items from rejected order');
    }

    if (!order.user.mikroCariCode) {
      throw new Error('User does not have Mikro cari code');
    }

    // Onaylanacak kalemleri getir
    const itemsToApprove = order.items.filter((item: any) =>
      itemIds.includes(item.id) && item.status === 'PENDING'
    );

    if (itemsToApprove.length === 0) {
      throw new Error('No pending items selected for approval');
    }

    // Faturalı ve beyaz olarak ayır
    const invoicedItems = itemsToApprove.filter((item: any) => item.priceType === 'INVOICED');
    const whiteItems = itemsToApprove.filter((item: any) => item.priceType === 'WHITE');

    const mikroOrderIds: string[] = [];
    const normalizeSeries = (value: string | undefined, fallback: string) => {
      const trimmed = String(value || '').trim();
      return trimmed ? trimmed.slice(0, 20) : fallback;
    };
    // Teslimat yeri Mikro evrakina belge aciklamasi olarak yazilir.
    const deliveryDescription = order.deliveryLocation
      ? String(order.deliveryLocation).trim()
      : '';

    try {
      // 0. Cari hesap kontrolü ve oluşturma
      await mikroService.ensureCariExists({
        cariCode: order.user.mikroCariCode,
        unvan: order.user.displayName || order.user.name,
        email: order.user.email,
        phone: order.user.phone || undefined,
        city: order.user.city || undefined,
        district: order.user.district || undefined,
        hasEInvoice: order.user.hasEInvoice,
      });

      // 1. Faturalı sipariş (varsa)
      if (invoicedItems.length > 0) {
        const invoicedSeries = normalizeSeries(series?.invoiced, 'B2BF');
        const invoicedOrderId = await mikroService.writeOrder({
          cariCode: order.user.mikroCariCode,
          // Paket satirlari bilesenlerine patlatilir (buildMikroOrderLines).
          items: invoicedItems.flatMap((item: any) => this.buildMikroOrderLines(item, false)),
          documentNo: order.customerOrderNumber || undefined,
          applyVAT: true,
          description: `B2B Sipariş ${order.orderNumber} - Faturalı (Kısmi)${adminNote ? ` | ${adminNote}` : ''}`,
          documentDescription: deliveryDescription || undefined,
          evrakSeri: invoicedSeries,
          paymentPlanNo: order.user.paymentPlanNo ?? undefined,
        });

        mikroOrderIds.push(invoicedOrderId);

        // Update invoiced items
        for (const item of invoicedItems) {
          await prisma.orderItem.update({
            where: { id: item.id },
            data: {
              status: 'APPROVED',
              mikroOrderId: invoicedOrderId,
            },
          });
        }
      }

      // 2. Beyaz sipariş (varsa)
      if (whiteItems.length > 0) {
        const whiteSeries = normalizeSeries(series?.white, 'B2BB');
        const whiteOrderId = await mikroService.writeOrder({
          cariCode: order.user.mikroCariCode,
          // Paket satirlari bilesenlerine patlatilir; beyazda KDV=0.
          items: whiteItems.flatMap((item: any) => this.buildMikroOrderLines(item, true)),
          documentNo: order.customerOrderNumber || undefined,
          applyVAT: false,
          description: `B2B Sipariş ${order.orderNumber} - Beyaz (Kısmi)${adminNote ? ` | ${adminNote}` : ''}`,
          documentDescription: deliveryDescription || undefined,
          evrakSeri: whiteSeries,
          paymentPlanNo: order.user.paymentPlanNo ?? undefined,
        });

        mikroOrderIds.push(whiteOrderId);

        // Update white items
        for (const item of whiteItems) {
          await prisma.orderItem.update({
            where: { id: item.id },
            data: {
              status: 'APPROVED',
              mikroOrderId: whiteOrderId,
            },
          });
        }
      }

      // 3. Tüm kalemlerin durumunu kontrol et
      const updatedOrder = await prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      const allApproved = updatedOrder?.items.every(item => item.status === 'APPROVED');
      const allProcessed = updatedOrder?.items.every(item => item.status !== 'PENDING');

      // 4. Sipariş durumunu güncelle
      if (allApproved) {
        // Tüm kalemler onaylandı
        await prisma.order.update({
          where: { id: orderId },
          data: {
            status: 'APPROVED',
            approvedAt: new Date(),
            adminNote: adminNote || order.adminNote,
            mikroOrderIds: [...new Set([...(order.mikroOrderIds || []), ...mikroOrderIds])],
          },
        });
      } else if (allProcessed) {
        // Bazı kalemler reddedildi, bazıları onaylandı
        await prisma.order.update({
          where: { id: orderId },
          data: {
            status: 'APPROVED', // Partially approved but mark as approved
            approvedAt: new Date(),
            adminNote: `${adminNote || order.adminNote || ''} (Kısmi onay: ${itemsToApprove.length}/${order.items.length} kalem)`,
            mikroOrderIds: [...new Set([...(order.mikroOrderIds || []), ...mikroOrderIds])],
          },
        });
      } else {
        // Hala bekleyen kalemler var
        await prisma.order.update({
          where: { id: orderId },
          data: {
            adminNote: `${order.adminNote || ''} | Kısmi onay: ${itemsToApprove.length} kalem`,
            mikroOrderIds: [...new Set([...(order.mikroOrderIds || []), ...mikroOrderIds])],
          },
        });
      }

      return {
        success: true,
        mikroOrderIds,
        approvedCount: itemsToApprove.length,
      };
    } catch (error: any) {
      console.error('❌ Kısmi onay hatası:', error);
      throw new Error(`Failed to partially approve order: ${error.message}`);
    }
  }


  /**
   * Sipariş kalemlerini reddet
   */
  async rejectOrderItems(
    orderId: string,
    itemIds: string[],
    rejectionReason: string
  ): Promise<{ rejectedCount: number }> {
    const order = await this.getOrderById(orderId);

    if (order.status === 'REJECTED') {
      throw new Error('Order is already rejected');
    }

    // Reddedilecek kalemleri kontrol et
    const itemsToReject = order.items.filter((item: any) =>
      itemIds.includes(item.id) && item.status === 'PENDING'
    );

    if (itemsToReject.length === 0) {
      throw new Error('No pending items selected for rejection');
    }

    // Kalemleri reddet
    for (const item of itemsToReject) {
      await prisma.orderItem.update({
        where: { id: item.id },
        data: {
          status: 'REJECTED',
          rejectionReason,
        },
      });
    }

    // Tüm kalemlerin durumunu kontrol et
    const updatedOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    const allRejected = updatedOrder?.items.every(item => item.status === 'REJECTED');
    const allProcessed = updatedOrder?.items.every(item => item.status !== 'PENDING');

    // Sipariş durumunu güncelle
    if (allRejected) {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'REJECTED',
          rejectedAt: new Date(),
          adminNote: rejectionReason,
        },
      });
    } else if (allProcessed) {
      // Bazı kalemler onaylandı, bazıları reddedildi - partial approval durumu
      const approvedCount = updatedOrder?.items.filter(i => i.status === 'APPROVED').length || 0;
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          adminNote: `Kısmi onay: ${approvedCount} kalem onaylandı, ${itemsToReject.length} kalem reddedildi`,
        },
      });
    }

    return { rejectedCount: itemsToReject.length };
  }


  /**
   * Siparişi reddet (Tüm sipariş)
   */
  async rejectOrder(orderId: string, adminNote: string): Promise<void> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status !== 'PENDING') {
      throw new Error('Order is not pending');
    }

    // Tüm kalemleri reddet
    await prisma.orderItem.updateMany({
      where: { orderId },
      data: {
        status: 'REJECTED',
        rejectionReason: adminNote,
      },
    });

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'REJECTED',
        rejectedAt: new Date(),
        adminNote,
      },
    });
  }


  /**
   * Sipariş istatistikleri (Admin dashboard için)
   */
  async getOrderStats(sectorCodes?: string[]): Promise<{
    pendingCount: number;
    approvedToday: number;
    totalAmount: number;
  }> {
    if (sectorCodes && sectorCodes.length === 0) {
      return {
        pendingCount: 0,
        approvedToday: 0,
        totalAmount: 0,
      };
    }

    const sectorFilter =
      sectorCodes && sectorCodes.length > 0
        ? { user: { sectorCode: { in: sectorCodes } } }
        : {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [pendingCount, approvedToday, totalAmountResult] = await Promise.all([
      prisma.order.count({
        where: { status: 'PENDING', ...sectorFilter },
      }),
      prisma.order.count({
        where: {
          status: 'APPROVED',
          approvedAt: {
            gte: today,
          },
          ...sectorFilter,
        },
      }),
      prisma.order.aggregate({
        where: {
          status: 'APPROVED',
          approvedAt: {
            gte: today,
          },
          ...sectorFilter,
        },
        _sum: {
          totalAmount: true,
        },
      }),
    ]);

    return {
      pendingCount,
      approvedToday,
      totalAmount: totalAmountResult._sum.totalAmount || 0,
    };
  }
}

export default new OrderService();
