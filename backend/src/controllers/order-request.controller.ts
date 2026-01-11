/**
 * Order Request Controller (Customer)
 */

import { Request, Response, NextFunction } from 'express';
import type { PriceType } from '@prisma/client';
import { prisma } from '../utils/prisma';
import pricingService from '../services/pricing.service';
import priceListService from '../services/price-list.service';
import stockService from '../services/stock.service';
import { resolveCustomerPriceLists } from '../utils/customerPricing';
import { isAgreementApplicable } from '../utils/agreements';
import { ProductPrices } from '../types';
import { generateOrderNumber } from '../utils/orderNumber';

const resolvePriceType = (
  visibility: string | null | undefined,
  requested?: PriceType
): PriceType | undefined => {
  if (visibility === 'WHITE_ONLY') return 'WHITE';
  if (visibility === 'BOTH') return requested;
  return 'INVOICED';
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
          priceVisibility: true,
          invoicedPriceListNo: true,
          whitePriceListNo: true,
          parentCustomer: {
            select: {
              id: true,
              customerType: true,
              priceVisibility: true,
              invoicedPriceListNo: true,
              whitePriceListNo: true,
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
                  unit: true,
                  imageUrl: true,
                  prices: true,
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

      const settings = await prisma.settings.findFirst({
        select: { customerPriceLists: true },
      });
      const priceListPair = resolveCustomerPriceLists(pricingCustomer, settings);
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
          minQuantity: true,
          validFrom: true,
          validTo: true,
        },
      });
      const agreementMap = new Map(agreementRows.map((row) => [row.productId, row]));
      const priceStatsMap = await priceListService.getPriceStatsMap(productCodes);

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
            const listInvoiced = priceListService.getListPrice(priceStats, priceListPair.invoiced);
            const listWhite = priceListService.getListPrice(priceStats, priceListPair.white);
            unitInvoiced = listInvoiced > 0 ? listInvoiced : customerPrices.invoiced;
            unitWhite = listWhite > 0 ? listWhite : customerPrices.white;
          }

          const agreement = agreementMap.get(item.productId);
          if (agreement && isAgreementApplicable(agreement, now, item.quantity)) {
            unitInvoiced = agreement.priceInvoiced;
            unitWhite = agreement.priceWhite;
          }

          return {
            ...item,
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
      const { items, note } = req.body || {};

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

      if (request.status !== 'PENDING') {
        return res.status(400).json({ error: 'Request is already processed' });
      }

      const priceListPair = resolveCustomerPriceLists(user, await prisma.settings.findFirst({
        select: { customerPriceLists: true },
      }));

      const now = new Date();
      const itemSelections: Record<string, PriceType> = {};
      const selectedItemIds: string[] = [];
      if (Array.isArray(items)) {
        for (const entry of items) {
          if (entry?.id) {
            selectedItemIds.push(String(entry.id));
          }
          if (entry?.id && entry?.priceType) {
            itemSelections[String(entry.id)] = entry.priceType as PriceType;
          }
        }
      }
      const selectedItemSet = selectedItemIds.length > 0 ? new Set(selectedItemIds) : null;
      const itemsToConvert = selectedItemSet
        ? request.items.filter((item) => selectedItemSet.has(item.id))
        : request.items;

      if (itemsToConvert.length === 0) {
        return res.status(400).json({ error: 'No items selected for conversion' });
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
      }> = [];
      for (const item of itemsToConvert) {
        const priceType = resolvePriceType(user.priceVisibility, itemSelections[item.id]);
        if (!priceType || (user.priceVisibility === 'BOTH' && !itemSelections[item.id])) {
          return res.status(400).json({ error: 'Price type selection required' });
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
          const listInvoiced = priceListService.getListPrice(priceStats, priceListPair.invoiced);
          const listWhite = priceListService.getListPrice(priceStats, priceListPair.white);
          const listPrices = {
            invoiced: listInvoiced > 0 ? listInvoiced : customerPrices.invoiced,
            white: listWhite > 0 ? listWhite : customerPrices.white,
          };
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

        if (agreement && isAgreementApplicable(agreement, now, item.quantity)) {
          unitPrice = priceType === 'INVOICED' ? agreement.priceInvoiced : agreement.priceWhite;
        }

        orderItems.push({
          requestItemId: item.id,
          productId: item.productId,
          productName: item.product.name,
          mikroCode: item.product.mikroCode,
          quantity: item.quantity,
          priceType,
          unitPrice,
          totalPrice: unitPrice * item.quantity,
        });
      }

      // Stock check
      const stockCheck = await stockService.checkRealtimeStockBatch(
        orderItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        }))
      );

      if (!stockCheck.allAvailable) {
        const insufficientItems = stockCheck.details.filter((d) => !d.sufficient);
        const errorDetails = insufficientItems.map(
          (item) => `${item.productName}: requested ${item.requested}, available ${item.available}`
        );
        return res.status(400).json({
          error: 'INSUFFICIENT_STOCK',
          details: errorDetails,
        });
      }

      const lastOrder = await prisma.order.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { orderNumber: true },
      });
      const orderNumber = generateOrderNumber(lastOrder?.orderNumber);
      const totalAmount = orderItems.reduce((sum, item) => sum + item.totalPrice, 0);

      const order = await prisma.order.create({
        data: {
          orderNumber,
          userId: user.id,
          requestedById: request.requestedById,
          status: 'PENDING',
          totalAmount,
          items: {
            create: orderItems.map((item) => ({
              productId: item.productId,
              productName: item.productName,
              mikroCode: item.mikroCode,
              quantity: item.quantity,
              priceType: item.priceType,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
            })),
          },
        },
      });

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
          },
        });
      }

      if (selectedItemSet) {
        const rejectedIds = request.items
          .filter((item) => !selectedItemSet.has(item.id))
          .map((item) => item.id);
        if (rejectedIds.length > 0) {
          await prisma.customerRequestItem.updateMany({
            where: { id: { in: rejectedIds } },
            data: { status: 'REJECTED' },
          });
        }
      }

      await prisma.customerRequest.update({
        where: { id: request.id },
        data: {
          status: 'CONVERTED',
          orderId: order.id,
          convertedById: user.id,
          convertedAt: new Date(),
          note: note ? String(note).trim() : request.note,
        },
      });

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
        select: { id: true, parentCustomerId: true, status: true },
      });

      if (!request || request.parentCustomerId !== user.id) {
        return res.status(404).json({ error: 'Request not found' });
      }

      if (request.status !== 'PENDING') {
        return res.status(400).json({ error: 'Request is already processed' });
      }

      await prisma.customerRequestItem.updateMany({
        where: { requestId: request.id },
        data: { status: 'REJECTED' },
      });

      await prisma.customerRequest.update({
        where: { id: request.id },
        data: {
          status: 'REJECTED',
          convertedById: user.id,
          convertedAt: new Date(),
          note: note ? String(note).trim() : undefined,
        },
      });

      res.json({ status: 'REJECTED' });
    } catch (error) {
      next(error);
    }
  }
}

export default new OrderRequestController();
