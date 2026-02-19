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
  /**
   * Sepetten sipariş oluştur
   */
  async createOrderFromCart(
    userId: string,
    details?: { customerOrderNumber?: string; deliveryLocation?: string }
  ): Promise<{
    orderId: string;
    orderNumber: string;
  }> {
    // 1. Kullanıcının sepetini al
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
    const totalAmount = cart.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0
    );

    // 5. Sipariş oluştur
    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId,
        status: 'PENDING',
        totalAmount,
        customerOrderNumber: normalizedCustomerOrderNumber || undefined,
        deliveryLocation: normalizedDeliveryLocation || undefined,
        items: {
          create: cart.items.map((item) => ({
            productId: item.productId,
            productName: item.product.name,
            mikroCode: item.product.mikroCode,
            quantity: item.quantity,
            priceType: item.priceType,
            unitPrice: item.unitPrice,
            totalPrice: item.quantity * item.unitPrice,
            lineNote: item.lineNote ? String(item.lineNote).trim() : undefined,
          })),
        },
      },
    });

    // 5. Sepeti temizle
    await prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
    };
  }

  async createManualOrder(input: {
    customerId: string;
    items: Array<{
      productId?: string;
      productCode?: string;
      productName?: string;
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
        quantity,
        unitPrice,
        vatRate,
        priceType,
        lineDescription,
        responsibilityCenter: item.responsibilityCenter?.trim() || undefined,
        reserveQty,
      };
    });

    const invoicedItems = normalizedItems.filter((item) => item.priceType === 'INVOICED');
    const whiteItems = normalizedItems.filter((item) => item.priceType === 'WHITE');

    const mikroOrderIds: string[] = [];
    let invoicedOrderId: string | null = null;
    let whiteOrderId: string | null = null;

    if (invoicedItems.length > 0) {
      if (!invoicedSeries) {
        throw new Error('Invoiced order series is required');
      }
      invoicedOrderId = await mikroService.writeOrder({
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
      });
      if (invoicedOrderId) {
        mikroOrderIds.push(invoicedOrderId);
      }
    }

    if (whiteItems.length > 0) {
      if (!whiteSeries) {
        throw new Error('White order series is required');
      }
      whiteOrderId = await mikroService.writeOrder({
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
      });
      if (whiteOrderId) {
        mikroOrderIds.push(whiteOrderId);
      }
    }

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
        status: 'APPROVED',
        totalAmount,
        mikroOrderIds,
        approvedAt: new Date(),
        customerOrderNumber: documentNo?.trim() || undefined,
        adminNote: description?.trim() || undefined,
        items: {
          create: normalizedItems.map((item) => ({
            productId: item.productId,
            productName: item.productName || item.productCode,
            mikroCode: item.productCode,
            quantity: item.quantity,
            priceType: item.priceType,
            unitPrice: item.unitPrice,
            totalPrice: item.unitPrice * item.quantity,
            lineNote: item.lineDescription || undefined,
            responsibilityCenter: item.responsibilityCenter || undefined,
            status: 'APPROVED',
            approvedQuantity: item.quantity,
            mikroOrderId:
              item.priceType === 'WHITE'
                ? whiteOrderId || undefined
                : invoicedOrderId || undefined,
          })),
        },
      },
    });

    return { mikroOrderIds, orderId: order.id, orderNumber: order.orderNumber };
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
      items: Array<{
        productId?: string;
        productCode?: string;
        productName?: string;
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
        user: { select: { id: true } },
        items: { select: { id: true } },
      },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    if (!['PENDING', 'APPROVED'].includes(order.status)) {
      throw new Error('Only pending or approved orders can be updated');
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

      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(`Invalid quantity for line ${index + 1}`);
      }

      const unitPrice = Number(item.unitPrice);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error(`Invalid unit price for line ${index + 1}`);
      }

      const priceType: PriceType = item.priceType == 'WHITE' ? 'WHITE' : 'INVOICED';
      const lineNote = item.lineNote?.trim();
      const responsibilityCenter = item.responsibilityCenter?.trim();
      const productName = item.productName?.trim() || product.name;

      return {
        orderId,
        productId: product.id,
        productName,
        mikroCode: product.mikroCode,
        quantity,
        priceType,
        unitPrice,
        totalPrice: unitPrice * quantity,
        lineNote: lineNote || undefined,
        responsibilityCenter: responsibilityCenter || undefined,
        status: 'PENDING' as const,
      };
    });

    const shouldUpdateMikro = order.status === 'APPROVED' && (order.mikroOrderIds || []).length > 0;
    let existingItems: Array<any> = [];
    const mikroIdByProductId = new Map<string, string | null>();
    if (shouldUpdateMikro) {
      existingItems = await prisma.orderItem.findMany({
        where: { orderId },
        include: { product: { select: { vatRate: true } } },
      });

      const existingByProductId = new Map(existingItems.map((item) => [item.productId, item]));
      existingItems.forEach((item) => {
        if (item.productId) {
          mikroIdByProductId.set(item.productId, item.mikroOrderId || null);
        }
      });
      const mikroUpdates = new Map<string, Array<{
        productCode: string;
        quantity: number;
        unitPrice: number;
        vatRate: number;
        lineDescription?: string;
      }>>();

      const seenProductIds = new Set<string>();

      normalizedItems.forEach((item) => {
        const existing = existingByProductId.get(item.productId);
        if (!existing) {
          throw new Error('Cannot update approved order with new products');
        }
        seenProductIds.add(item.productId);
        const mikroOrderId = existing.mikroOrderId || (order.mikroOrderIds?.[0] || '');
        const vatRate =
          item.priceType === 'WHITE'
            ? 0
            : Number(existing.product?.vatRate || 0.2);
        const payload = {
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
        if (item.productId && !seenProductIds.has(item.productId)) {
          const mikroOrderId = item.mikroOrderId || (order.mikroOrderIds?.[0] || '');
          const vatRate =
            item.priceType === 'WHITE'
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
        });
      }
    }

    const totalAmount = normalizedItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    );

    const normalizedCustomerOrderNumber = input.customerOrderNumber
      ? String(input.customerOrderNumber).trim()
      : '';
    const normalizedDeliveryLocation = input.deliveryLocation
      ? String(input.deliveryLocation).trim()
      : '';

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
        },
      });

      await tx.orderItem.createMany({
        data: normalizedItems.map((item) => {
          const mikroOrderId = mikroIdByProductId.get(item.productId) || undefined;
          const approved = order.status === 'APPROVED';
          return {
            ...item,
            status: approved ? 'APPROVED' : 'PENDING',
            approvedQuantity: approved ? item.quantity : undefined,
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
  async approveOrderAndWriteToMikro(
    orderId: string,
    adminNote?: string,
    series?: { invoiced?: string; white?: string }
  ): Promise<{
    success: boolean;
    mikroOrderIds: string[];
  }> {
    const order = await this.getOrderById(orderId);

    if (order.status !== 'PENDING') {
      throw new Error('Order is not pending');
    }

    if (!order.user.mikroCariCode) {
      throw new Error('User does not have Mikro cari code');
    }

    // Siparişi faturalı ve beyaz olarak ayır
    const invoicedItems = order.items.filter((item: any) => item.priceType === 'INVOICED');
    const whiteItems = order.items.filter((item: any) => item.priceType === 'WHITE');

    const mikroOrderIds: string[] = [];
    let invoicedOrderId: string | null = null;
    let whiteOrderId: string | null = null;
    const normalizeSeries = (value: string | undefined, fallback: string) => {
      const trimmed = String(value || '').trim();
      return trimmed ? trimmed.slice(0, 20) : fallback;
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
          items: invoicedItems.map((item: any) => ({
            productCode: item.product.mikroCode,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            vatRate: item.product?.vatRate || 0.2,
            lineDescription: item.lineNote || undefined,
          })),
          documentNo: order.customerOrderNumber || undefined,
          applyVAT: true,
          description: `B2B Sipariş ${order.orderNumber} - Faturalı${adminNote ? ` | ${adminNote}` : ''}`,
          evrakSeri: invoicedSeries,
        });

        mikroOrderIds.push(invoicedOrderId);
      }
      // 2. Beyaz sipari? (varsa)
      if (whiteItems.length > 0) {
        const whiteSeries = normalizeSeries(series?.white, 'B2BB');
        const whiteOrderId = await mikroService.writeOrder({
          cariCode: order.user.mikroCariCode,
          items: whiteItems.map((item: any) => ({
            productCode: item.product.mikroCode,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            vatRate: 0, // Beyaz i?in KDV=0
            lineDescription: item.lineNote || undefined,
          })),
          documentNo: order.customerOrderNumber || undefined,
          applyVAT: false,
          description: `B2B Sipari? ${order.orderNumber} - Beyaz${adminNote ? ` | ${adminNote}` : ''}`,
          evrakSeri: whiteSeries,
        });

        mikroOrderIds.push(whiteOrderId);
      }

      // 3. Sipariş durumunu güncelle
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'APPROVED',
          mikroOrderIds,
          approvedAt: new Date(),
          adminNote,
        },
      });

      return {
        success: true,
        mikroOrderIds,
      };
    } catch (error: any) {
      console.error('❌ Mikro\'ya sipariş yazma hatası:', error);
      throw new Error(`Failed to write order to Mikro: ${error.message}`);
    }
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
    let invoicedOrderId: string | null = null;
    let whiteOrderId: string | null = null;
    const normalizeSeries = (value: string | undefined, fallback: string) => {
      const trimmed = String(value || '').trim();
      return trimmed ? trimmed.slice(0, 20) : fallback;
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
          items: invoicedItems.map((item: any) => ({
            productCode: item.product.mikroCode,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            vatRate: item.product?.vatRate || 0.2,
            lineDescription: item.lineNote || undefined,
          })),
          documentNo: order.customerOrderNumber || undefined,
          applyVAT: true,
          description: `B2B Sipariş ${order.orderNumber} - Faturalı (Kısmi)${adminNote ? ` | ${adminNote}` : ''}`,
          evrakSeri: invoicedSeries,
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
          items: whiteItems.map((item: any) => ({
            productCode: item.product.mikroCode,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            vatRate: 0,
            lineDescription: item.lineNote || undefined,
          })),
          documentNo: order.customerOrderNumber || undefined,
          applyVAT: false,
          description: `B2B Sipariş ${order.orderNumber} - Beyaz (Kısmi)${adminNote ? ` | ${adminNote}` : ''}`,
          evrakSeri: whiteSeries,
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
