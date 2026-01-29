/**
 * Order Service
 *
 * Sipariş yönetimi:
 * - Sepetten sipariş oluşturma
 * - Stok kontrolü
 * - Admin onayı
 * - Mikro'ya sipariş yazma (2 ayrı sipariş mantığı ile)
 */

import { prisma } from '../utils/prisma';
import { generateOrderNumber } from '../utils/orderNumber';
import mikroService from './mikroFactory.service';

class OrderService {
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
    }>;
    warehouseNo: number;
    description?: string;
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

      const priceType = item.priceType === 'WHITE' ? 'WHITE' : 'INVOICED';
      const manualVatRate = Number(item.manualVatRate);
      const vatRate =
        priceType === 'WHITE' || item.vatZeroed
          ? 0
          : Number.isFinite(manualVatRate)
            ? manualVatRate
            : Number(product.vatRate || 0.18);

      const lineDescription =
        item.lineDescription?.trim() ||
        item.productName?.trim() ||
        product.name ||
        '';

      return {
        productId: product.id,
        productName: item.productName?.trim() || product.name,
        productCode: product.mikroCode,
        quantity,
        unitPrice,
        vatRate,
        priceType,
        lineDescription,
      };
    });

    const invoicedItems = normalizedItems.filter((item) => item.priceType === 'INVOICED');
    const whiteItems = normalizedItems.filter((item) => item.priceType === 'WHITE');

    const mikroOrderIds: string[] = [];
    let invoicedOrderId: string | null = null;
    let whiteOrderId: string | null = null;

    if (invoicedItems.length > 0) {
      if (!invoicedSeries || !Number.isFinite(Number(invoicedSira))) {
        throw new Error('Invoiced order series and number are required');
      }
      invoicedOrderId = await mikroService.writeOrder({
        cariCode: customer.mikroCariCode,
        items: invoicedItems.map((item) => ({
          productCode: item.productCode,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          vatRate: item.vatRate,
          lineDescription: item.lineDescription || undefined,
        })),
        applyVAT: true,
        description: description?.trim() || 'B2B Manuel Siparis',
        documentNo: documentNo?.trim() || undefined,
        evrakSeri: String(invoicedSeries).trim(),
        evrakSira: Number(invoicedSira),
        warehouseNo: warehouseValue,
      });
      if (invoicedOrderId) {
        mikroOrderIds.push(invoicedOrderId);
      }
    }

    if (whiteItems.length > 0) {
      if (!whiteSeries || !Number.isFinite(Number(whiteSira))) {
        throw new Error('White order series and number are required');
      }
      whiteOrderId = await mikroService.writeOrder({
        cariCode: customer.mikroCariCode,
        items: whiteItems.map((item) => ({
          productCode: item.productCode,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          vatRate: 0,
          lineDescription: item.lineDescription || undefined,
        })),
        applyVAT: false,
        description: description?.trim() || 'B2B Manuel Siparis',
        documentNo: documentNo?.trim() || undefined,
        evrakSeri: String(whiteSeries).trim(),
        evrakSira: Number(whiteSira),
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
            vatRate: item.product?.vatRate || 0.18,
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
            vatRate: item.product?.vatRate || 0.18,
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
  async getOrderStats(): Promise<{
    pendingCount: number;
    approvedToday: number;
    totalAmount: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [pendingCount, approvedToday, totalAmountResult] = await Promise.all([
      prisma.order.count({
        where: { status: 'PENDING' },
      }),
      prisma.order.count({
        where: {
          status: 'APPROVED',
          approvedAt: {
            gte: today,
          },
        },
      }),
      prisma.order.aggregate({
        where: {
          status: 'APPROVED',
          approvedAt: {
            gte: today,
          },
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
