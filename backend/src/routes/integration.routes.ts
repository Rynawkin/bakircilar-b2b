import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { requireYolpilotIntegrationKey } from '../middleware/integration-auth.middleware';
import mikroService from '../services/mikro.service';

const router = Router();

type OpenOrdersRequest = {
  customerCodes?: string[];
  includeAll?: boolean;
};

type MikroCustomerSearchRequest = {
  query?: string;
  limit?: number;
  openOrdersOnly?: boolean;
};

const normalizeCustomerCode = (value: unknown): string => String(value || '').trim();
const escapeSqlLike = (value: string): string => value.replace(/'/g, "''");
const clampLimit = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 25;
  }

  return Math.min(50, Math.max(1, Math.trunc(parsed)));
};

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

router.post('/yolpilot/mikro-customers/search', requireYolpilotIntegrationKey, async (req, res, next) => {
  try {
    const body = (req.body || {}) as MikroCustomerSearchRequest;
    const query = String(body.query || '').trim();
    const limit = clampLimit(body.limit);
    const escaped = escapeSqlLike(query);
    const openOrdersOnly = body.openOrdersOnly === true;

    if (openOrdersOnly) {
      const where: any = {
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
      };

      if (query) {
        where.AND = [
          {
            OR: [
              { customerCode: { contains: query, mode: 'insensitive' as const } },
              { customerName: { contains: query, mode: 'insensitive' as const } },
            ],
          },
        ];
      }

      const orders = await prisma.pendingMikroOrder.findMany({
        where,
        select: {
          customerCode: true,
          customerName: true,
          customerEmail: true,
          sectorCode: true,
          itemCount: true,
          grandTotal: true,
          syncedAt: true,
        },
        orderBy: [{ customerName: 'asc' }, { customerCode: 'asc' }],
      });

      const grouped = new Map<string, any>();
      for (const order of orders) {
        const code = normalizeCustomerCode(order.customerCode);
        if (!code) {
          continue;
        }

        if (!grouped.has(code)) {
          grouped.set(code, {
            customerCode: code,
            customerName: order.customerName || code,
            customerEmail: order.customerEmail,
            sectorCode: order.sectorCode,
            hasOpenOrders: true,
            openOrdersCount: 0,
            openOrdersTotal: 0,
            latestSyncedAt: order.syncedAt,
          });
        }

        const summary = grouped.get(code);
        summary.openOrdersCount += 1;
        summary.openOrdersTotal += Number(order.grandTotal || 0);
        if (order.syncedAt > summary.latestSyncedAt) {
          summary.latestSyncedAt = order.syncedAt;
        }
      }

      res.json(Array.from(grouped.values()).slice(0, limit));
      return;
    }

    const whereParts = [
      "cari_kod IS NOT NULL",
      "LTRIM(RTRIM(cari_kod)) <> ''",
      "(cari_sektor_kodu IS NULL OR cari_sektor_kodu NOT LIKE 'SATICI%')",
    ];

    if (query) {
      whereParts.push(`(
        cari_kod LIKE '%${escaped}%'
        OR cari_unvan1 LIKE '%${escaped}%'
        OR cari_unvan2 LIKE '%${escaped}%'
      )`);
    }

    const rows = await mikroService.executeQuery(`
      SELECT TOP (${limit})
        LTRIM(RTRIM(cari_kod)) AS customerCode,
        LTRIM(RTRIM(ISNULL(cari_unvan1, ''))) AS customerName,
        LTRIM(RTRIM(ISNULL(cari_unvan2, ''))) AS customerName2,
        LTRIM(RTRIM(ISNULL(cari_EMail, ''))) AS customerEmail,
        LTRIM(RTRIM(ISNULL(cari_sektor_kodu, ''))) AS sectorCode,
        LTRIM(RTRIM(ISNULL(cari_grup_kodu, ''))) AS groupCode,
        LTRIM(RTRIM(ISNULL(cari_CepTel, ''))) AS phone,
        (SELECT TOP 1 LTRIM(RTRIM(ISNULL(adr_il, '')))
         FROM CARI_HESAP_ADRESLERI WITH (NOLOCK)
         WHERE adr_adres_no = '1' AND adr_cari_kod = cari_kod) AS city,
        (SELECT TOP 1 LTRIM(RTRIM(ISNULL(adr_ilce, '')))
         FROM CARI_HESAP_ADRESLERI WITH (NOLOCK)
         WHERE adr_adres_no = '1' AND adr_cari_kod = cari_kod) AS district
      FROM CARI_HESAPLAR WITH (NOLOCK)
      WHERE ${whereParts.join('\n        AND ')}
      ORDER BY cari_unvan1, cari_kod
    `);

    const codes = rows.map((row: any) => normalizeCustomerCode(row.customerCode)).filter(Boolean);
    const orderSummaries = codes.length
      ? await prisma.pendingMikroOrder.groupBy({
          by: ['customerCode'],
          where: {
            customerCode: { in: codes },
            NOT: {
              sectorCode: {
                startsWith: 'SATICI',
              },
            },
          },
          _count: { _all: true },
          _sum: { grandTotal: true },
          _max: { syncedAt: true },
        })
      : [];
    const openOrderByCode = new Map(orderSummaries.map((summary) => [summary.customerCode, summary]));

    res.json(rows.map((row: any) => {
      const code = normalizeCustomerCode(row.customerCode);
      const summary = openOrderByCode.get(code);

      return {
        customerCode: code,
        customerName: String(row.customerName || row.customerName2 || code).trim(),
        customerEmail: String(row.customerEmail || '').trim() || null,
        sectorCode: String(row.sectorCode || '').trim() || null,
        groupCode: String(row.groupCode || '').trim() || null,
        phone: String(row.phone || '').trim() || null,
        city: String(row.city || '').trim() || null,
        district: String(row.district || '').trim() || null,
        hasOpenOrders: Boolean(summary),
        openOrdersCount: summary?._count?._all || 0,
        openOrdersTotal: Number(summary?._sum?.grandTotal || 0),
        latestSyncedAt: summary?._max?.syncedAt || null,
      };
    }));
  } catch (error) {
    next(error);
  }
});

export default router;
