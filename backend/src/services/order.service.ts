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
import stockService from './stock.service';
import mikroService from './mikroFactory.service';

class OrderService {
  /**
   * Sepetten sipariş oluştur
   */
  async createOrderFromCart(userId: string): Promise<{
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

    // 2. Anlık stok kontrolü
    const stockCheck = await stockService.checkRealtimeStockBatch(
      cart.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      }))
    );

    if (!stockCheck.allAvailable) {
      const insufficientItems = stockCheck.details.filter((d) => !d.sufficient);
      const errorDetails = insufficientItems.map(
        (item) => `${item.productName}: requested ${item.requested}, available ${item.available}`
      );

      throw new Error(
        JSON.stringify({
          error: 'INSUFFICIENT_STOCK',
          details: errorDetails,
        })
      );
    }

    // 3. Sipariş numarası üret
    const lastOrder = await prisma.order.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { orderNumber: true },
    });

    const orderNumber = generateOrderNumber(lastOrder?.orderNumber);

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
        items: {
          create: cart.items.map((item) => ({
            productId: item.productId,
            productName: item.product.name,
            mikroCode: item.product.mikroCode,
            quantity: item.quantity,
            priceType: item.priceType,
            unitPrice: item.unitPrice,
            totalPrice: item.quantity * item.unitPrice,
          })),
        },
      },
    });

    // 6. Sepeti temizle
    await prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
    };
  }

  /**
   * Kullanıcının siparişlerini getir
   */
  async getUserOrders(userId: string): Promise<any[]> {
    const orders = await prisma.order.findMany({
      where: { userId },
      include: {
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
   */
  async getPendingOrders(): Promise<any[]> {
    const orders = await prisma.order.findMany({
      where: { status: 'PENDING' },
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
            hasEInvoice: true,
            balance: true,
            isLocked: true,
          },
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
    adminNote?: string
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

    try {
      // 1. Faturalı sipariş (varsa)
      if (invoicedItems.length > 0) {
        const invoicedOrderId = await mikroService.writeOrder({
          cariCode: order.user.mikroCariCode,
          items: invoicedItems.map((item: any) => ({
            productCode: item.mikroCode,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            vatRate: item.product?.vatRate || 0.18,
          })),
          applyVAT: true,
          description: `B2B Sipariş ${order.orderNumber} - Faturalı${adminNote ? ` | ${adminNote}` : ''}`,
        });

        mikroOrderIds.push(invoicedOrderId);
      }

      // 2. Beyaz sipariş (varsa)
      if (whiteItems.length > 0) {
        const whiteOrderId = await mikroService.writeOrder({
          cariCode: order.user.mikroCariCode,
          items: whiteItems.map((item: any) => ({
            productCode: item.mikroCode,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            vatRate: 0, // Beyaz için KDV=0
          })),
          applyVAT: false,
          description: `B2B Sipariş ${order.orderNumber} - Beyaz${adminNote ? ` | ${adminNote}` : ''}`,
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
   * Siparişi reddet
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
