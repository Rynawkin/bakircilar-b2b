/**
 * Order Request Controller (Customer)
 */

import { Request, Response, NextFunction } from 'express';
import type { PriceType } from '@prisma/client';
import { prisma } from '../utils/prisma';
import pricingService from '../services/pricing.service';
import priceListService from '../services/price-list.service';
import notificationService from '../services/notification.service';
import mikroService from '../services/mikroFactory.service';
import { resolveCustomerPriceLists, resolveCustomerPriceListsForProduct } from '../utils/customerPricing';
import { isAgreementActive, isAgreementApplicable, resolveAgreementPrice } from '../utils/agreements';
import { MikroCustomerSaleMovement, ProductPrices } from '../types';
import { generateOrderNumber } from '../utils/orderNumber';
import { resolveLastPriceOverride } from '../utils/lastPrice';

const getLastPriceGuardPrices = (
  priceStats: any,
  guardInvoicedListNo?: number | null,
  guardWhiteListNo?: number | null
): { invoiced: number; white: number } | undefined => {
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


const resolvePriceType = (
  visibility: string | null | undefined,
  requested?: PriceType
): PriceType | undefined => {
  if (visibility === 'WHITE_ONLY') return 'WHITE';
  if (visibility === 'BOTH') return requested;
  return 'INVOICED';
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

export class OrderRequestController {
  /**
   * GET /api/order-requests
   */
  async getOrderRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: {
          id: true,
          parentCustomerId: true,
          customerType: true,
          mikroCariCode: true,
          priceVisibility: true,
          invoicedPriceListNo: true,
          whitePriceListNo: true,
          useLastPrices: true,
          lastPriceGuardType: true,
          lastPriceGuardInvoicedListNo: true,
          lastPriceGuardWhiteListNo: true,
          lastPriceCostBasis: true,
          lastPriceMinCostPercent: true,
          parentCustomer: {
            select: {
              id: true,
              customerType: true,
              mikroCariCode: true,
              priceVisibility: true,
              invoicedPriceListNo: true,
              whitePriceListNo: true,
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

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const where = user.parentCustomerId
        ? { requestedById: user.id }
        : { parentCustomerId: user.id };

      const requests = await prisma.customerRequest.findMany({
        where,
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  mikroCode: true,
                  brandCode: true,
                  categoryId: true,
                  unit: true,
                  imageUrl: true,
                  prices: true,
                  currentCost: true,
                  lastEntryPrice: true,
                },
              },
            },
          },
          requestedBy: { select: { id: true, name: true, email: true } },
          convertedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      const pricingCustomer = user.parentCustomerId ? user.parentCustomer : user;
      if (!pricingCustomer || !pricingCustomer.customerType) {
        return res.json({ requests });
      }

      const [settings, priceListRules] = await Promise.all([
        prisma.settings.findFirst({
          select: { customerPriceLists: true },
        }),
        prisma.customerPriceListRule.findMany({
          where: { customerId: pricingCustomer.id },
        }),
      ]);
      const basePriceListPair = resolveCustomerPriceLists(pricingCustomer, settings);
      const effectiveVisibility = user.parentCustomerId
        ? (pricingCustomer.priceVisibility === 'WHITE_ONLY' ? 'WHITE_ONLY' : 'INVOICED_ONLY')
        : pricingCustomer.priceVisibility;
      const now = new Date();

      const productIds = Array.from(
        new Set(
          requests.flatMap((request) => request.items.map((item) => item.productId))
        )
      );
      const productCodes = Array.from(
        new Set(
          requests.flatMap((request) => request.items.map((item) => item.product.mikroCode))
        )
      );

      const agreementRows = await prisma.customerPriceAgreement.findMany({
        where: {
          customerId: pricingCustomer.id,
          productId: { in: productIds },
        },
        select: {
          productId: true,
          priceInvoiced: true,
          priceWhite: true,
          customerProductCode: true,
          minQuantity: true,
          validFrom: true,
          validTo: true,
        },
      });
      const agreementMap = new Map(agreementRows.map((row) => [row.productId, row]));
      const priceStatsMap = await priceListService.getPriceStatsMap(productCodes);

      const shouldUseLastPrices =
        Boolean(pricingCustomer.useLastPrices && pricingCustomer.mikroCariCode);
      let lastSalesMap = new Map<string, number>();
      if (shouldUseLastPrices) {
        try {
          const sales = await mikroService.getCustomerSalesMovements(
            pricingCustomer.mikroCariCode as string,
            productCodes,
            1
          );
          lastSalesMap = buildLastSalesMap(sales);
        } catch (error) {
          console.error('Customer last prices failed', { customerId: pricingCustomer.id, error });
        }
      }

      const requestsWithPreview = requests.map((request) => ({
        ...request,
        items: request.items.map((item) => {
          const prices = item.product.prices as unknown as ProductPrices;
          const customerPrices = pricingService.getPriceForCustomer(
            prices,
            pricingCustomer.customerType as any
          );

          let unitInvoiced = 0;
          let unitWhite = 0;

          if (item.priceMode === 'EXCESS') {
            unitInvoiced = customerPrices.invoiced;
            unitWhite = customerPrices.white;
          } else {
            const priceStats = priceStatsMap.get(item.product.mikroCode) || null;
            const productPriceListPair = resolveCustomerPriceListsForProduct(
              basePriceListPair,
              priceListRules,
              {
                brandCode: item.product.brandCode,
                categoryId: item.product.categoryId,
              }
            );
            const listInvoiced = priceListService.getListPrice(
              priceStats,
              productPriceListPair.invoiced
            );
            const listWhite = priceListService.getListPrice(
              priceStats,
              productPriceListPair.white
            );
            const listPricesBase = {
              invoiced: listInvoiced > 0 ? listInvoiced : customerPrices.invoiced,
              white: listWhite > 0 ? listWhite : customerPrices.white,
            };
            const guardPrices = getLastPriceGuardPrices(
              priceStats,
              pricingCustomer.lastPriceGuardInvoicedListNo,
              pricingCustomer.lastPriceGuardWhiteListNo
            );
            const lastSalePrice = lastSalesMap.get(item.product.mikroCode);
            const lastPriceResult = resolveLastPriceOverride({
              config: pricingCustomer,
              lastSalePrice,
              listPrices: listPricesBase,
            guardPrices,
              product: {
                currentCost: item.product.currentCost,
                lastEntryPrice: item.product.lastEntryPrice,
              },
              priceVisibility: effectiveVisibility,
            });
            unitInvoiced = lastPriceResult.prices.invoiced;
            unitWhite = lastPriceResult.prices.white;
          }

          const agreement = agreementMap.get(item.productId);
          const agreementActive = agreement ? isAgreementActive(agreement, now) : false;
          const customerProductCode = agreement && agreementActive ? (agreement.customerProductCode || null) : null;
          if (agreement && isAgreementApplicable(agreement, now, item.quantity)) {
            unitInvoiced = resolveAgreementPrice(agreement, 'INVOICED', unitInvoiced);
            unitWhite = resolveAgreementPrice(agreement, 'WHITE', unitWhite);
          }

          return {
            ...item,
            approvedQuantity: item.approvedQuantity ?? null,
            customerProductCode,
            previewUnitPriceInvoiced: unitInvoiced,
            previewUnitPriceWhite: unitWhite,
            previewTotalPriceInvoiced: unitInvoiced * item.quantity,
            previewTotalPriceWhite: unitWhite * item.quantity,
          };
        }),
      }));

      res.json({ requests: requestsWithPreview });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/order-requests/pending-count
   */
  async getPendingCount(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: {
          id: true,
          parentCustomerId: true,
        },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (user.parentCustomerId) {
        return res.json({ count: 0 });
      }

      const count = await prisma.customerRequest.count({
        where: { parentCustomerId: user.id, status: 'PENDING' },
      });

      res.json({ count });
    } catch (error) {
      next(error);
    }
  }
  /**
   * POST /api/order-requests
   * Create request from sub-user cart
   */
  async createOrderRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const { note } = req.body || {};
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: {
          id: true,
          name: true,
          parentCustomerId: true,
        },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (!user.parentCustomerId) {
        return res.status(403).json({ error: 'Only sub users can create order requests' });
      }

      const cart = await prisma.cart.findUnique({
        where: { userId: user.id },
        include: {
          items: true,
        },
      });

      if (!cart || cart.items.length === 0) {
        return res.status(400).json({ error: 'Cart is empty' });
      }

      const request = await prisma.customerRequest.create({
        data: {
          parentCustomerId: user.parentCustomerId,
          requestedById: user.id,
          note: note ? String(note).trim() : undefined,
          items: {
            create: cart.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              priceMode: item.priceMode,
              lineNote: item.lineNote ? String(item.lineNote).trim() : undefined,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      await prisma.cartItem.deleteMany({
        where: { cartId: cart.id },
      });

      const requesterName = user.name ? String(user.name).trim() : 'Alt kullanici';
      await notificationService.createForUsers([user.parentCustomerId], {
        title: 'Yeni siparis talebi',
        body: `${requesterName} yeni bir talep gonderdi.`,
        linkUrl: '/order-requests',
      });

      res.status(201).json({ request });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/order-requests/:id/convert
   * Convert request into order (parent customer)
   */
  async convertOrderRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { items, note, customerOrderNumber, deliveryLocation } = req.body || {};

      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: {
          id: true,
          parentCustomerId: true,
          customerType: true,
          mikroCariCode: true,
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
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (user.parentCustomerId) {
        return res.status(403).json({ error: 'Sub users cannot convert requests' });
      }

      if (!user.customerType) {
        return res.status(400).json({ error: 'Customer type missing' });
      }

      const request = await prisma.customerRequest.findUnique({
        where: { id },
        include: {
          items: {
            include: {
              product: true,
            },
          },
          requestedBy: { select: { id: true, name: true } },
        },
      });

      if (!request || request.parentCustomerId !== user.id) {
        return res.status(404).json({ error: 'Request not found' });
      }

      const [settings, priceListRules] = await Promise.all([
        prisma.settings.findFirst({
          select: { customerPriceLists: true },
        }),
        prisma.customerPriceListRule.findMany({
          where: { customerId: user.id },
        }),
      ]);
      const basePriceListPair = resolveCustomerPriceLists(user, settings);
      const effectiveVisibility = user.priceVisibility;

      const now = new Date();
      const itemSelections: Record<string, PriceType> = {};
      const itemQuantities: Record<string, number> = {};
      const selectedItemIds: string[] = [];
      if (Array.isArray(items)) {
        for (const entry of items) {
          if (!entry?.id) {
            continue;
          }
          const itemId = String(entry.id);
          selectedItemIds.push(itemId);
          if (entry?.priceType) {
            itemSelections[itemId] = entry.priceType as PriceType;
          }
          if (entry?.quantity !== undefined) {
            itemQuantities[itemId] = Number(entry.quantity);
          }
        }
      }
      const selectedItemSet = selectedItemIds.length > 0 ? new Set(selectedItemIds) : null;
      const pendingItems = request.items.filter((item) => item.status === 'PENDING');

      if (pendingItems.length === 0 || request.status === 'REJECTED') {
        return res.status(400).json({ error: 'Request is already processed' });
      }

      const itemsToConvert = selectedItemSet
        ? pendingItems.filter((item) => selectedItemSet.has(item.id))
        : pendingItems;

      if (itemsToConvert.length === 0) {
        return res.status(400).json({ error: 'No pending items selected for conversion' });
      }

      let lastSalesMap = new Map<string, number>();
      if (user.useLastPrices && user.mikroCariCode) {
        try {
          const codes = itemsToConvert.map((item) => item.product.mikroCode);
          const sales = await mikroService.getCustomerSalesMovements(
            user.mikroCariCode as string,
            codes,
            1
          );
          lastSalesMap = buildLastSalesMap(sales);
        } catch (error) {
          console.error('Customer last prices failed', { customerId: user.id, error });
        }
      }

      const orderItems: Array<{
        requestItemId: string;
        productId: string;
        productName: string;
        mikroCode: string;
        quantity: number;
        priceType: PriceType;
        unitPrice: number;
        totalPrice: number;
        lineNote?: string | null;
      }> = [];
      for (const item of itemsToConvert) {
        const priceType = resolvePriceType(user.priceVisibility, itemSelections[item.id]);
        if (!priceType || (user.priceVisibility === 'BOTH' && !itemSelections[item.id])) {
          return res.status(400).json({ error: 'Price type selection required' });
        }

        const hasCustomQuantity = Object.prototype.hasOwnProperty.call(itemQuantities, item.id);
        const quantityValue = hasCustomQuantity ? itemQuantities[item.id] : item.quantity;
        const quantity = Number(quantityValue);
        if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0) {
          return res.status(400).json({ error: 'Gecersiz miktar.' });
        }

        const prices = item.product.prices as unknown as ProductPrices;
        const customerPrices = pricingService.getPriceForCustomer(
          prices,
          user.customerType as any
        );

        let unitPrice = 0;
        if (item.priceMode === 'EXCESS') {
          unitPrice = priceType === 'INVOICED' ? customerPrices.invoiced : customerPrices.white;
        } else {
          const priceStats = await priceListService.getPriceStats(item.product.mikroCode);
          const productPriceListPair = resolveCustomerPriceListsForProduct(
            basePriceListPair,
            priceListRules,
            {
              brandCode: item.product.brandCode,
              categoryId: item.product.categoryId,
            }
          );
          const listInvoiced = priceListService.getListPrice(
            priceStats,
            productPriceListPair.invoiced
          );
          const listWhite = priceListService.getListPrice(
            priceStats,
            productPriceListPair.white
          );
          const listPricesBase = {
            invoiced: listInvoiced > 0 ? listInvoiced : customerPrices.invoiced,
            white: listWhite > 0 ? listWhite : customerPrices.white,
          };
          const guardPrices = getLastPriceGuardPrices(
            priceStats,
            user.lastPriceGuardInvoicedListNo,
            user.lastPriceGuardWhiteListNo
          );
          const lastSalePrice = lastSalesMap.get(item.product.mikroCode);
          const lastPriceResult = resolveLastPriceOverride({
            config: user,
            lastSalePrice,
            listPrices: listPricesBase,
            guardPrices,
            product: {
              currentCost: item.product.currentCost,
              lastEntryPrice: item.product.lastEntryPrice,
            },
            priceVisibility: effectiveVisibility,
          });
          const listPrices = lastPriceResult.prices;
          unitPrice = priceType === 'INVOICED' ? listPrices.invoiced : listPrices.white;
        }

        const agreement = await prisma.customerPriceAgreement.findFirst({
          where: {
            customerId: user.id,
            productId: item.productId,
          },
          select: {
            priceInvoiced: true,
            priceWhite: true,
            minQuantity: true,
            validFrom: true,
            validTo: true,
          },
        });

        if (agreement && isAgreementApplicable(agreement, now, quantity)) {
          unitPrice = resolveAgreementPrice(agreement, priceType, unitPrice);
        }

        orderItems.push({
          requestItemId: item.id,
          productId: item.productId,
          productName: item.product.name,
          mikroCode: item.product.mikroCode,
          quantity: quantity,
          priceType,
          unitPrice,
          totalPrice: unitPrice * quantity,
          lineNote: item.lineNote ? String(item.lineNote).trim() : null,
        });
      }

      let order = request.orderId
        ? await prisma.order.findUnique({
            where: { id: request.orderId },
            select: { id: true, orderNumber: true, totalAmount: true, customerOrderNumber: true, deliveryLocation: true },
          })
        : null;

      const orderItemsTotal = orderItems.reduce((sum, item) => sum + item.totalPrice, 0);
      const normalizedCustomerOrderNumber = customerOrderNumber ? String(customerOrderNumber).trim() : '';
      const normalizedDeliveryLocation = deliveryLocation ? String(deliveryLocation).trim() : '';
      const orderExtras: { customerOrderNumber?: string; deliveryLocation?: string } = {};
      if (normalizedCustomerOrderNumber) {
        orderExtras.customerOrderNumber = normalizedCustomerOrderNumber;
      }
      if (normalizedDeliveryLocation) {
        orderExtras.deliveryLocation = normalizedDeliveryLocation;
      }

      if (!order) {
        const lastOrder = await prisma.order.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { orderNumber: true },
        });
        const orderNumber = generateOrderNumber(lastOrder?.orderNumber);

        order = await prisma.order.create({
          data: {
            orderNumber,
            userId: user.id,
            requestedById: request.requestedById,
            status: 'PENDING',
            totalAmount: orderItemsTotal,
            ...orderExtras,
            items: {
              create: orderItems.map((item) => ({
                productId: item.productId,
                productName: item.productName,
                mikroCode: item.mikroCode,
                quantity: item.quantity,
                priceType: item.priceType,
                unitPrice: item.unitPrice,
                totalPrice: item.totalPrice,
                lineNote: item.lineNote || undefined,
              })),
            },
          },
          select: { id: true, orderNumber: true, totalAmount: true, customerOrderNumber: true, deliveryLocation: true },
        });

        await prisma.customerRequest.update({
          where: { id: request.id },
          data: { orderId: order.id },
        });
      } else {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            totalAmount: (order.totalAmount || 0) + orderItemsTotal,
            ...orderExtras,
            items: {
              create: orderItems.map((item) => ({
                productId: item.productId,
                productName: item.productName,
                mikroCode: item.mikroCode,
                quantity: item.quantity,
                priceType: item.priceType,
                unitPrice: item.unitPrice,
                totalPrice: item.totalPrice,
                lineNote: item.lineNote || undefined,
              })),
            },
          },
        });
      }

      if (!order) {
        return res.status(500).json({ error: 'Order could not be created' });
      }

      await prisma.customerRequestItem.updateMany({
        where: {
          requestId: request.id,
          id: { in: itemsToConvert.map((item) => item.id) },
        },
        data: { status: 'CONVERTED' },
      });

      for (const item of orderItems) {
        await prisma.customerRequestItem.update({
          where: { id: item.requestItemId },
          data: {
            selectedPriceType: item.priceType as any,
            selectedUnitPrice: item.unitPrice,
            selectedTotalPrice: item.totalPrice,
            approvedQuantity: item.quantity,
          },
        });
      }

      const remainingPending = await prisma.customerRequestItem.count({
        where: { requestId: request.id, status: 'PENDING' },
      });

      if (remainingPending === 0) {
        const convertedCount = await prisma.customerRequestItem.count({
          where: { requestId: request.id, status: 'CONVERTED' },
        });

        await prisma.customerRequest.update({
          where: { id: request.id },
          data: {
            status: convertedCount > 0 ? 'CONVERTED' : 'REJECTED',
            convertedById: user.id,
            convertedAt: new Date(),
            note: note ? String(note).trim() : request.note,
          },
        });
      } else if (note && note.trim()) {
        await prisma.customerRequest.update({
          where: { id: request.id },
          data: { note: String(note).trim() },
        });
      }

      const requesterId = request.requestedBy?.id;
      if (requesterId) {
        const approvedCount = itemsToConvert.length;
        const pendingCount = remainingPending;
        const title = pendingCount > 0
          ? 'Talebiniz kismen onaylandi'
          : 'Talebiniz onaylandi';
        const body = pendingCount > 0
          ? `${approvedCount} kalem onaylandi, ${pendingCount} kalem bekliyor.`
          : `Talebiniz siparise cevrildi. Siparis No: ${order.orderNumber}.`;
        await notificationService.createForUsers([requesterId], {
          title,
          body,
          linkUrl: '/order-requests',
        });
      }

      res.json({ orderId: order.id, orderNumber: order.orderNumber });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/order-requests/:id/reject
   * Reject request (parent customer)
   */
  async rejectOrderRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { note } = req.body || {};

      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: {
          id: true,
          name: true,
          parentCustomerId: true,
        },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (user.parentCustomerId) {
        return res.status(403).json({ error: 'Sub users cannot reject requests' });
      }

      const request = await prisma.customerRequest.findUnique({
        where: { id },
        select: {
          id: true,
          parentCustomerId: true,
          requestedById: true,
          status: true,
          orderId: true,
          items: { select: { id: true, status: true } },
        },
      });

      if (!request || request.parentCustomerId !== user.id) {
        return res.status(404).json({ error: 'Request not found' });
      }

      if (request.status === 'REJECTED') {
        return res.status(400).json({ error: 'Request is already processed' });
      }

      const pendingIds = request.items
        .filter((item) => item.status === 'PENDING')
        .map((item) => item.id);

      if (pendingIds.length === 0) {
        return res.status(400).json({ error: 'Request is already processed' });
      }

      await prisma.customerRequestItem.updateMany({
        where: { id: { in: pendingIds } },
        data: { status: 'REJECTED' },
      });

      const hasConverted = request.items.some((item) => item.status === 'CONVERTED');
      const nextStatus = hasConverted ? 'CONVERTED' : 'REJECTED';

      await prisma.customerRequest.update({
        where: { id: request.id },
        data: {
          status: nextStatus,
          convertedById: user.id,
          convertedAt: new Date(),
          note: note ? String(note).trim() : undefined,
        },
      });

      if (request.requestedById) {
        const rejectedCount = pendingIds.length;
        const title = nextStatus === 'CONVERTED'
          ? 'Talebiniz kismen reddedildi'
          : 'Talebiniz reddedildi';
        const body = nextStatus === 'CONVERTED'
          ? `${rejectedCount} kalem reddedildi.`
          : 'Talebiniz reddedildi.';
        await notificationService.createForUsers([request.requestedById], {
          title,
          body,
          linkUrl: '/order-requests',
        });
      }

      res.json({ status: nextStatus });
    } catch (error) {
      next(error);
    }
  }
}

export default new OrderRequestController();


















