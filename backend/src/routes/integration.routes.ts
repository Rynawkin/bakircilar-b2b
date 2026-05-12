import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { requireYolpilotIntegrationKey } from '../middleware/integration-auth.middleware';

const router = Router();

type OpenOrdersRequest = {
  customerCodes?: string[];
  includeAll?: boolean;
};

const normalizeCustomerCode = (value: unknown): string => String(value || '').trim();

router.post('/yolpilot/open-orders', requireYolpilotIntegrationKey, async (req, res, next) => {
  try {
    const body = (req.body || {}) as OpenOrdersRequest;
    const customerCodes = Array.from(
      new Set((body.customerCodes || []).map(normalizeCustomerCode).filter(Boolean))
    );
    const includeAll = body.includeAll === true;

    if (customerCodes.length === 0 && !includeAll) {
      res.json([]);
      return;
    }

    const orders = await prisma.pendingMikroOrder.findMany({
      where: {
        ...(includeAll ? {} : { customerCode: { in: customerCodes } }),
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
        mikroOrderNumber: true,
        orderSeries: true,
        orderSequence: true,
        customerCode: true,
        customerName: true,
        customerEmail: true,
        sectorCode: true,
        orderDate: true,
        deliveryDate: true,
        itemCount: true,
        totalAmount: true,
        totalVAT: true,
        grandTotal: true,
        syncedAt: true,
      },
      orderBy: [{ customerCode: 'asc' }, { orderDate: 'desc' }, { mikroOrderNumber: 'asc' }],
    });

    const grouped = new Map<string, any>();

    for (const order of orders) {
      const code = normalizeCustomerCode(order.customerCode);
      if (!grouped.has(code)) {
        grouped.set(code, {
          customerCode: code,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          sectorCode: order.sectorCode,
          ordersCount: 0,
          itemCount: 0,
          totalAmount: 0,
          totalVAT: 0,
          grandTotal: 0,
          latestSyncedAt: order.syncedAt,
          orders: [],
        });
      }

      const summary = grouped.get(code);
      summary.ordersCount += 1;
      summary.itemCount += order.itemCount || 0;
      summary.totalAmount += Number(order.totalAmount || 0);
      summary.totalVAT += Number(order.totalVAT || 0);
      summary.grandTotal += Number(order.grandTotal || 0);

      if (order.syncedAt > summary.latestSyncedAt) {
        summary.latestSyncedAt = order.syncedAt;
      }

      summary.orders.push({
        mikroOrderNumber: order.mikroOrderNumber,
        orderSeries: order.orderSeries,
        orderSequence: order.orderSequence,
        orderDate: order.orderDate,
        deliveryDate: order.deliveryDate,
        itemCount: order.itemCount,
        totalAmount: order.totalAmount,
        totalVAT: order.totalVAT,
        grandTotal: order.grandTotal,
      });
    }

    res.json(Array.from(grouped.values()));
  } catch (error) {
    next(error);
  }
});

export default router;
