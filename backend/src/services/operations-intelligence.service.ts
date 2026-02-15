import { CustomerActivityType, OrderStatus, WarehouseWorkflowStatus } from '@prisma/client';
import { prisma } from '../utils/prisma';

type CoverageStatus = 'FULL' | 'PARTIAL' | 'NONE';
type IntentSegment = 'HOT' | 'WARM' | 'COLD';
type RiskDecision = 'AUTO_APPROVE' | 'MANUAL_REVIEW' | 'BLOCK';
type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

type PendingLine = {
  lineKey: string;
  rowNumber: number;
  productCode: string;
  productName: string;
  unit: string;
  remainingQty: number;
  reservedQty: number;
  reservedDeliveredQty: number;
  warehouseCode: string | null;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalize = (value: unknown): string => String(value ?? '').trim();

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const sumStocks = (warehouseStocks: unknown): number => {
  if (!warehouseStocks || typeof warehouseStocks !== 'object' || Array.isArray(warehouseStocks)) return 0;
  return Object.values(warehouseStocks as Record<string, unknown>).reduce<number>(
    (sum, value) => sum + Math.max(toNumber(value), 0),
    0
  );
};

const getStockByWarehouse = (warehouseStocks: unknown, warehouseCode: string | null): number => {
  if (!warehouseCode) return sumStocks(warehouseStocks);
  if (!warehouseStocks || typeof warehouseStocks !== 'object' || Array.isArray(warehouseStocks)) return 0;

  const target = normalize(warehouseCode);
  for (const [key, value] of Object.entries(warehouseStocks as Record<string, unknown>)) {
    const normalizedKey = normalize(key);
    if (!normalizedKey) continue;
    if (normalizedKey === target) return Math.max(toNumber(value), 0);
    const keyDigits = normalizedKey.match(/\d+/)?.[0];
    if (keyDigits && keyDigits === target) return Math.max(toNumber(value), 0);
  }
  return sumStocks(warehouseStocks);
};

const toCoverageStatus = (remainingQty: number, coverableQty: number): CoverageStatus => {
  if (remainingQty <= 0 || coverableQty >= remainingQty) return 'FULL';
  if (coverableQty <= 0) return 'NONE';
  return 'PARTIAL';
};

class OperationsIntelligenceService {
  private parsePendingItems(items: unknown, includeDone = false): PendingLine[] {
    if (!Array.isArray(items)) return [];

    const parsed = items.map((raw: any, index) => {
      const productCode = normalize(raw?.productCode) || `UNKNOWN-${index + 1}`;
      const rowNumber = Number.isFinite(Number(raw?.rowNumber)) ? Number(raw.rowNumber) : index + 1;
      return {
        lineKey: `${productCode}#${rowNumber}`,
        rowNumber,
        productCode,
        productName: normalize(raw?.productName) || productCode,
        unit: normalize(raw?.unit) || 'ADET',
        remainingQty: Math.max(toNumber(raw?.remainingQty), 0),
        reservedQty: Math.max(toNumber(raw?.reservedQty), 0),
        reservedDeliveredQty: Math.max(toNumber(raw?.reservedDeliveredQty), 0),
        warehouseCode: normalize(raw?.warehouseCode) || null,
      };
    });

    if (includeDone) return parsed;
    return parsed.filter((line) => line.remainingQty > 0);
  }

  async getAtpSnapshot(options?: { series?: string[]; orderLimit?: number }) {
    const selectedSeries = (options?.series || []).map((item) => normalize(item)).filter(Boolean);
    const orderLimit = clamp(toNumber(options?.orderLimit || 150), 20, 300);
    const where = selectedSeries.length > 0 ? { orderSeries: { in: selectedSeries } } : undefined;

    const [selectedOrders, allPendingOrders] = await Promise.all([
      prisma.pendingMikroOrder.findMany({
        where,
        orderBy: [{ orderDate: 'asc' }, { mikroOrderNumber: 'asc' }],
        take: orderLimit,
        select: {
          mikroOrderNumber: true,
          orderSeries: true,
          orderSequence: true,
          customerCode: true,
          customerName: true,
          orderDate: true,
          deliveryDate: true,
          items: true,
        },
      }),
      prisma.pendingMikroOrder.findMany({
        select: {
          mikroOrderNumber: true,
          items: true,
        },
      }),
    ]);

    const linesByOrder = new Map<string, PendingLine[]>();
    const productCodes = new Set<string>();
    selectedOrders.forEach((order) => {
      const lines = this.parsePendingItems(order.items);
      linesByOrder.set(order.mikroOrderNumber, lines);
      lines.forEach((line) => productCodes.add(line.productCode));
    });

    const [products, workflows] = await Promise.all([
      productCodes.size > 0
        ? prisma.product.findMany({
            where: { mikroCode: { in: Array.from(productCodes) } },
            select: {
              mikroCode: true,
              categoryId: true,
              brandCode: true,
              category: { select: { name: true } },
              warehouseStocks: true,
            },
          })
        : Promise.resolve([]),
      selectedOrders.length > 0
        ? prisma.warehouseOrderWorkflow.findMany({
            where: { mikroOrderNumber: { in: selectedOrders.map((order) => order.mikroOrderNumber) } },
            select: {
              mikroOrderNumber: true,
              status: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const productMap = new Map(
      products.map((product) => [
        normalize(product.mikroCode),
        {
          categoryId: product.categoryId || null,
          categoryName: product.category?.name || null,
          brandCode: product.brandCode || null,
          warehouseStocks: product.warehouseStocks,
        },
      ])
    );

    const workflowMap = new Map(
      workflows.map((workflow) => [workflow.mikroOrderNumber, workflow.status as WarehouseWorkflowStatus])
    );

    const reservedByCode = new Map<string, number>();
    allPendingOrders.forEach((order) => {
      this.parsePendingItems(order.items, true).forEach((line) => {
        const activeReserved = Math.max(line.reservedQty - line.reservedDeliveredQty, 0);
        if (activeReserved <= 0) return;
        reservedByCode.set(line.productCode, (reservedByCode.get(line.productCode) || 0) + activeReserved);
      });
    });

    const now = Date.now();
    const orders = selectedOrders.map((order) => {
      const lines = linesByOrder.get(order.mikroOrderNumber) || [];
      const enriched = lines.map((line) => {
        const product = productMap.get(line.productCode);
        const ownReservedQty = Math.max(line.reservedQty - line.reservedDeliveredQty, 0);
        const reservedByOthersQty = Math.max((reservedByCode.get(line.productCode) || 0) - ownReservedQty, 0);
        const stockQty = getStockByWarehouse(product?.warehouseStocks, line.warehouseCode);
        const atpQty = Math.max(stockQty - reservedByOthersQty, 0);
        const coverableQty = Math.min(atpQty, line.remainingQty);
        const shortageQty = Math.max(line.remainingQty - coverableQty, 0);

        return {
          lineKey: line.lineKey,
          rowNumber: line.rowNumber,
          productCode: line.productCode,
          productName: line.productName,
          unit: line.unit,
          categoryId: product?.categoryId || null,
          categoryName: product?.categoryName || null,
          brandCode: product?.brandCode || null,
          remainingQty: line.remainingQty,
          stockQty,
          ownReservedQty,
          reservedByOthersQty,
          atpQty,
          coverableQty,
          shortageQty,
          coverageStatus: toCoverageStatus(line.remainingQty, coverableQty),
        };
      });

      const remainingQty = enriched.reduce((sum, line) => sum + line.remainingQty, 0);
      const coverableQty = enriched.reduce((sum, line) => sum + line.coverableQty, 0);
      const shortageQty = enriched.reduce((sum, line) => sum + line.shortageQty, 0);
      const coveredPercent = remainingQty > 0 ? Math.round((coverableQty / remainingQty) * 100) : 100;
      const coverageStatus: CoverageStatus =
        enriched.every((line) => line.coverageStatus === 'FULL')
          ? 'FULL'
          : enriched.every((line) => line.coverageStatus === 'NONE')
            ? 'NONE'
            : 'PARTIAL';
      const ageHours = Math.max((now - new Date(order.orderDate).getTime()) / HOUR_MS, 0);
      const priorityScore = Math.round(
        (coverageStatus === 'NONE' ? 25 : coverageStatus === 'PARTIAL' ? 12 : 0) +
          Math.min(ageHours / 6, 20) +
          Math.min(shortageQty, 40)
      );

      return {
        mikroOrderNumber: order.mikroOrderNumber,
        orderSeries: order.orderSeries,
        orderSequence: order.orderSequence,
        customerCode: order.customerCode,
        customerName: order.customerName,
        orderDate: order.orderDate,
        deliveryDate: order.deliveryDate || null,
        workflowStatus: workflowMap.get(order.mikroOrderNumber) || 'PENDING',
        lineCount: enriched.length,
        remainingQty,
        coverableQty,
        shortageQty,
        coveredPercent,
        coverageStatus,
        priorityScore,
        lines: enriched,
      };
    });

    orders.sort((a, b) => b.priorityScore - a.priorityScore);

    const totalRemainingQty = orders.reduce((sum, order) => sum + order.remainingQty, 0);
    const totalCoverableQty = orders.reduce((sum, order) => sum + order.coverableQty, 0);
    const totalShortageQty = orders.reduce((sum, order) => sum + order.shortageQty, 0);

    return {
      summary: {
        totalOrders: orders.length,
        fullOrders: orders.filter((order) => order.coverageStatus === 'FULL').length,
        partialOrders: orders.filter((order) => order.coverageStatus === 'PARTIAL').length,
        noneOrders: orders.filter((order) => order.coverageStatus === 'NONE').length,
        totalRemainingQty,
        totalCoverableQty,
        totalShortageQty,
        coveredPercent: totalRemainingQty > 0 ? Math.round((totalCoverableQty / totalRemainingQty) * 100) : 100,
      },
      orders,
    };
  }

  async getOrchestrationSnapshot(
    options?: { series?: string[]; orderLimit?: number },
    atpSnapshot?: Awaited<ReturnType<OperationsIntelligenceService['getAtpSnapshot']>>
  ) {
    const atp = atpSnapshot || (await this.getAtpSnapshot(options));
    const orderNumbers = atp.orders.map((order) => order.mikroOrderNumber);

    const workflows = orderNumbers.length
      ? await prisma.warehouseOrderWorkflow.findMany({
          where: { mikroOrderNumber: { in: orderNumbers } },
          select: {
            mikroOrderNumber: true,
            status: true,
            assignedPickerUserId: true,
            lastActionAt: true,
            items: {
              select: {
                remainingQty: true,
                pickedQty: true,
              },
            },
          },
        })
      : [];

    const pickerIds = Array.from(
      new Set(workflows.map((workflow) => normalize(workflow.assignedPickerUserId)).filter(Boolean))
    );
    const pickers = pickerIds.length
      ? await prisma.user.findMany({
          where: { id: { in: pickerIds } },
          select: {
            id: true,
            displayName: true,
            mikroName: true,
            name: true,
            email: true,
          },
        })
      : [];
    const pickerNameMap = new Map(
      pickers.map((picker) => [
        picker.id,
        normalize(picker.displayName) || normalize(picker.mikroName) || normalize(picker.name) || normalize(picker.email) || picker.id,
      ])
    );

    const queueByStatus = Object.values(WarehouseWorkflowStatus).map((status) => ({
      status,
      count: atp.orders.filter((order) => {
        const workflow = workflows.find((row) => row.mikroOrderNumber === order.mikroOrderNumber);
        return (workflow?.status || order.workflowStatus) === status;
      }).length,
    }));

    const workloadMap = new Map<
      string,
      {
        pickerUserId: string | null;
        pickerName: string;
        activeOrders: number;
        openLines: number;
        remainingQty: number;
        lastActionAt: Date | null;
      }
    >();

    workflows.forEach((workflow) => {
      if (workflow.status === 'PENDING' || workflow.status === 'DISPATCHED') return;
      const pickerId = normalize(workflow.assignedPickerUserId) || 'UNASSIGNED';
      const pickerUserId = pickerId === 'UNASSIGNED' ? null : pickerId;
      const current = workloadMap.get(pickerId) || {
        pickerUserId,
        pickerName: pickerUserId ? pickerNameMap.get(pickerUserId) || pickerUserId : 'Atanmadi',
        activeOrders: 0,
        openLines: 0,
        remainingQty: 0,
        lastActionAt: null as Date | null,
      };

      const openLines = workflow.items.filter((item) => Math.max(item.remainingQty - item.pickedQty, 0) > 0);
      current.activeOrders += 1;
      current.openLines += openLines.length;
      current.remainingQty += openLines.reduce(
        (sum, line) => sum + Math.max(toNumber(line.remainingQty) - toNumber(line.pickedQty), 0),
        0
      );
      if (!current.lastActionAt || (workflow.lastActionAt && workflow.lastActionAt > current.lastActionAt)) {
        current.lastActionAt = workflow.lastActionAt || current.lastActionAt;
      }
      workloadMap.set(pickerId, current);
    });

    const pickerWorkload = Array.from(workloadMap.values()).sort((a, b) => {
      if (b.activeOrders !== a.activeOrders) return b.activeOrders - a.activeOrders;
      return b.openLines - a.openLines;
    });

    const waves: Array<{
      waveId: string;
      orderSeries: string;
      orderCount: number;
      lineCount: number;
      totalRemainingQty: number;
      shortageQty: number;
      estimatedMinutes: number;
      recommendedPickerCount: number;
      orders: Array<{
        mikroOrderNumber: string;
        customerCode: string;
        customerName: string;
        lineCount: number;
        remainingQty: number;
        shortageQty: number;
        coverageStatus: CoverageStatus;
        priorityScore: number;
      }>;
    }> = [];

    const groups = new Map<string, typeof atp.orders>();
    atp.orders
      .filter((order) => order.workflowStatus !== 'DISPATCHED')
      .forEach((order) => {
        const key = normalize(order.orderSeries) || 'DIGER';
        const list = groups.get(key) || [];
        list.push(order);
        groups.set(key, list);
      });

    Array.from(groups.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'tr'))
      .forEach(([series, orders]) => {
        const sorted = [...orders].sort((a, b) => {
          const aCov = a.coverageStatus === 'FULL' ? 3 : a.coverageStatus === 'PARTIAL' ? 2 : 1;
          const bCov = b.coverageStatus === 'FULL' ? 3 : b.coverageStatus === 'PARTIAL' ? 2 : 1;
          if (bCov !== aCov) return bCov - aCov;
          return b.priorityScore - a.priorityScore;
        });

        let waveIndex = 1;
        let bucket: typeof atp.orders = [];
        let lineTotal = 0;
        const flush = () => {
          if (bucket.length === 0) return;
          const lineCount = bucket.reduce((sum, row) => sum + row.lineCount, 0);
          const totalRemainingQty = bucket.reduce((sum, row) => sum + row.remainingQty, 0);
          const shortageQty = bucket.reduce((sum, row) => sum + row.shortageQty, 0);
          waves.push({
            waveId: `${series}-${waveIndex}`,
            orderSeries: series,
            orderCount: bucket.length,
            lineCount,
            totalRemainingQty,
            shortageQty,
            estimatedMinutes: Math.max(10, Math.round(lineCount * 1.25 + shortageQty * 0.35)),
            recommendedPickerCount: clamp(Math.ceil(lineCount / 35), 1, 4),
            orders: bucket.map((row) => ({
              mikroOrderNumber: row.mikroOrderNumber,
              customerCode: row.customerCode,
              customerName: row.customerName,
              lineCount: row.lineCount,
              remainingQty: row.remainingQty,
              shortageQty: row.shortageQty,
              coverageStatus: row.coverageStatus,
              priorityScore: row.priorityScore,
            })),
          });
          waveIndex += 1;
          bucket = [];
          lineTotal = 0;
        };

        sorted.forEach((row) => {
          if (bucket.length >= 8 || lineTotal + row.lineCount > 70) flush();
          bucket.push(row);
          lineTotal += row.lineCount;
        });
        flush();
      });

    return {
      summary: {
        openOrders: atp.summary.totalOrders,
        backlogLines: atp.orders.reduce((sum, row) => sum + row.lineCount, 0),
        backlogQty: atp.orders.reduce((sum, row) => sum + row.remainingQty, 0),
        shortageOrders: atp.orders.filter((row) => row.shortageQty > 0).length,
        activePickers: pickerWorkload.filter((row) => row.pickerUserId).length,
      },
      queueByStatus,
      pickerWorkload,
      waves,
    };
  }

  async getCustomerIntentSnapshot(options?: { customerLimit?: number }) {
    const customerLimit = clamp(toNumber(options?.customerLimit || 80), 20, 300);
    const now = Date.now();
    const from14 = new Date(now - 14 * DAY_MS);
    const from30 = new Date(now - 30 * DAY_MS);

    const [customers, eventCounts, activePingSums, latestEvents, carts, orders] = await Promise.all([
      prisma.user.findMany({
        where: { role: 'CUSTOMER', parentCustomerId: null, active: true },
        select: {
          id: true,
          mikroCariCode: true,
          displayName: true,
          name: true,
          sectorCode: true,
        },
      }),
      prisma.customerActivityEvent.groupBy({
        by: ['customerId', 'type'],
        where: {
          customerId: { not: null },
          createdAt: { gte: from14 },
        },
        _count: { id: true },
      }),
      prisma.customerActivityEvent.groupBy({
        by: ['customerId'],
        where: {
          customerId: { not: null },
          createdAt: { gte: from14 },
          type: 'ACTIVE_PING',
        },
        _sum: { durationSeconds: true, clickCount: true },
      }),
      prisma.customerActivityEvent.groupBy({
        by: ['customerId'],
        where: { customerId: { not: null } },
        _max: { createdAt: true },
      }),
      prisma.cart.findMany({
        where: { user: { role: 'CUSTOMER' } },
        select: {
          userId: true,
          user: { select: { parentCustomerId: true } },
          items: { select: { quantity: true, unitPrice: true } },
        },
      }),
      prisma.order.findMany({
        where: {
          createdAt: { gte: from30 },
          status: { in: [OrderStatus.APPROVED, OrderStatus.PENDING] },
        },
        select: {
          userId: true,
          totalAmount: true,
          user: { select: { parentCustomerId: true } },
        },
      }),
    ]);

    const getCount = (customerId: string, type: CustomerActivityType) => {
      const row = eventCounts.find(
        (entry) => normalize(entry.customerId) === customerId && entry.type === type
      );
      return row?._count.id || 0;
    };

    const pingMap = new Map(
      activePingSums.map((row) => [
        normalize(row.customerId),
        {
          durationSeconds: toNumber(row._sum.durationSeconds),
          clickCount: toNumber(row._sum.clickCount),
        },
      ])
    );
    const lastEventMap = new Map(
      latestEvents.map((row) => [normalize(row.customerId), row._max.createdAt || null])
    );

    const cartMap = new Map<string, { cartItems: number; cartAmount: number }>();
    carts.forEach((cart) => {
      const customerId = normalize(cart.user.parentCustomerId || cart.userId);
      if (!customerId) return;
      const current = cartMap.get(customerId) || { cartItems: 0, cartAmount: 0 };
      cart.items.forEach((item) => {
        current.cartItems += Math.max(toNumber(item.quantity), 0);
        current.cartAmount += Math.max(toNumber(item.quantity), 0) * Math.max(toNumber(item.unitPrice), 0);
      });
      cartMap.set(customerId, current);
    });

    const orderMap = new Map<string, { orderCount30d: number; orderAmount30d: number }>();
    orders.forEach((order) => {
      const customerId = normalize(order.user.parentCustomerId || order.userId);
      if (!customerId) return;
      const current = orderMap.get(customerId) || { orderCount30d: 0, orderAmount30d: 0 };
      current.orderCount30d += 1;
      current.orderAmount30d += Math.max(toNumber(order.totalAmount), 0);
      orderMap.set(customerId, current);
    });

    const rows = customers.map((customer) => {
      const customerId = customer.id;
      const pageViews = getCount(customerId, CustomerActivityType.PAGE_VIEW);
      const productViews = getCount(customerId, CustomerActivityType.PRODUCT_VIEW);
      const cartAdds = getCount(customerId, CustomerActivityType.CART_ADD);
      const searches = getCount(customerId, CustomerActivityType.SEARCH);
      const cartUpdates = getCount(customerId, CustomerActivityType.CART_UPDATE);
      const active = pingMap.get(customerId) || { durationSeconds: 0, clickCount: 0 };
      const activeMinutes = Math.round(active.durationSeconds / 60);
      const cart = cartMap.get(customerId) || { cartItems: 0, cartAmount: 0 };
      const orderStats = orderMap.get(customerId) || { orderCount30d: 0, orderAmount30d: 0 };
      const lastEvent = lastEventMap.get(customerId) || null;
      const recencyDays = lastEvent ? Math.max(Math.round((now - new Date(lastEvent).getTime()) / DAY_MS), 0) : null;

      const engagementScore =
        pageViews * 0.8 +
        productViews * 1.4 +
        cartAdds * 4 +
        cartUpdates * 2 +
        searches * 2 +
        activeMinutes * 0.6 +
        active.clickCount * 0.04;
      const commerceScore = orderStats.orderCount30d * 7 + orderStats.orderAmount30d / 5000 + (cart.cartAmount > 0 ? 12 : 0);
      const recencyScore =
        recencyDays === null
          ? -10
          : recencyDays <= 1
            ? 18
            : recencyDays <= 3
              ? 10
              : recencyDays <= 7
                ? 4
                : recencyDays <= 14
                  ? 0
                  : -12;
      const intentScore = clamp(Math.round(engagementScore + commerceScore + recencyScore), 0, 100);
      const intentSegment: IntentSegment = intentScore >= 70 ? 'HOT' : intentScore >= 40 ? 'WARM' : 'COLD';
      const churnRisk =
        recencyDays !== null && recencyDays > 21 && orderStats.orderCount30d === 0
          ? 'HIGH'
          : recencyDays !== null && recencyDays > 14
            ? 'MEDIUM'
            : 'LOW';

      let nextBestAction = 'Standart takip';
      if (intentSegment === 'HOT' && cart.cartAmount > 0) nextBestAction = 'Sepete odakli hizli teklif gonder';
      else if (intentSegment === 'HOT') nextBestAction = 'Ayni gun satis temsilcisi geri donusu planla';
      else if (intentSegment === 'WARM') nextBestAction = 'Ikame ve tamamlayici urun onerisi cikar';
      else if (churnRisk === 'HIGH') nextBestAction = 'Geri kazanma kampanyasi planla';

      return {
        customerId,
        customerCode: customer.mikroCariCode || customer.id,
        customerName: customer.displayName || customer.name || customer.mikroCariCode || customer.id,
        sectorCode: customer.sectorCode || null,
        intentScore,
        intentSegment,
        churnRisk,
        recencyDays,
        pageViews,
        productViews,
        cartAdds,
        searches,
        activeMinutes,
        cartItems: cart.cartItems,
        cartAmount: Number(cart.cartAmount.toFixed(2)),
        orderCount30d: orderStats.orderCount30d,
        orderAmount30d: Number(orderStats.orderAmount30d.toFixed(2)),
        nextBestAction,
      };
    });

    rows.sort((a, b) => {
      if (b.intentScore !== a.intentScore) return b.intentScore - a.intentScore;
      return b.cartAmount - a.cartAmount;
    });

    return {
      summary: {
        totalCustomers: customers.length,
        hotCustomers: rows.filter((row) => row.intentSegment === 'HOT').length,
        warmCustomers: rows.filter((row) => row.intentSegment === 'WARM').length,
        coldCustomers: rows.filter((row) => row.intentSegment === 'COLD').length,
        highChurnRiskCustomers: rows.filter((row) => row.churnRisk === 'HIGH').length,
      },
      customers: rows.slice(0, customerLimit),
    };
  }

  async getRiskSnapshot(options?: { orderLimit?: number }) {
    const orderLimit = clamp(toNumber(options?.orderLimit || 120), 20, 300);
    const now = Date.now();

    const pendingOrders = await prisma.order.findMany({
      where: { status: 'PENDING' },
      orderBy: [{ createdAt: 'asc' }, { orderNumber: 'asc' }],
      take: orderLimit,
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        totalAmount: true,
        items: { select: { id: true } },
        user: {
          select: {
            id: true,
            mikroCariCode: true,
            displayName: true,
            name: true,
            vadeBalance: {
              select: {
                pastDueBalance: true,
                notDueBalance: true,
                totalBalance: true,
              },
            },
            vadeClassification: {
              select: {
                classification: true,
                riskScore: true,
              },
            },
          },
        },
      },
    });

    const decide = (score: number, pastDueBalance: number, orderAmount: number): RiskDecision => {
      if (score >= 80 || pastDueBalance >= Math.max(orderAmount * 1.2, 7500)) return 'BLOCK';
      if (score >= 50 || pastDueBalance >= 1000) return 'MANUAL_REVIEW';
      return 'AUTO_APPROVE';
    };

    const rows = pendingOrders.map((order) => {
      const orderAmount = Math.max(toNumber(order.totalAmount), 0);
      const pastDueBalance = Math.max(toNumber(order.user.vadeBalance?.pastDueBalance), 0);
      const notDueBalance = Math.max(toNumber(order.user.vadeBalance?.notDueBalance), 0);
      const totalBalance = Math.max(
        toNumber(order.user.vadeBalance?.totalBalance || pastDueBalance + notDueBalance),
        0
      );
      const pendingDays = Math.max(Math.round((now - new Date(order.createdAt).getTime()) / DAY_MS), 0);
      const classification = normalize(order.user.vadeClassification?.classification) || null;
      const classificationUpper = classification ? classification.toUpperCase() : '';
      const manualRiskScore = order.user.vadeClassification?.riskScore ?? null;

      let riskScore = 0;
      riskScore += pastDueBalance > 0 ? Math.min(45, (pastDueBalance / Math.max(orderAmount, 1)) * 25 + 10) : 0;
      riskScore += totalBalance > 0 ? Math.min(20, (totalBalance / Math.max(orderAmount, 1)) * 6) : 0;
      riskScore += notDueBalance > 0 ? Math.min(10, (notDueBalance / Math.max(orderAmount, 1)) * 3) : 0;
      riskScore += order.user.vadeBalance ? 0 : 12;
      riskScore += pendingDays > 2 ? Math.min(10, pendingDays) : 0;
      if (classificationUpper.includes('BLOCK') || classificationUpper.includes('BLOK') || classificationUpper.includes('STOP')) {
        riskScore += 40;
      } else if (classificationUpper.includes('RISK') || classificationUpper.includes('KRITIK') || classificationUpper.includes('TAKIP')) {
        riskScore += 20;
      }
      if (manualRiskScore !== null && Number.isFinite(manualRiskScore)) {
        riskScore = Math.max(riskScore, manualRiskScore);
      }
      riskScore = clamp(Math.round(riskScore), 0, 100);

      const decision = decide(riskScore, pastDueBalance, orderAmount);
      const reasons: string[] = [];
      if (pastDueBalance > 0) reasons.push(`Vadesi gecmis bakiye: ${pastDueBalance.toFixed(2)} TL`);
      if (!order.user.vadeBalance) reasons.push('Vade bakiyesi yok, manuel kontrol gerekir');
      if (classification) reasons.push(`Siniflandirma: ${classification}`);
      if (pendingDays > 2) reasons.push(`Bekleme suresi: ${pendingDays} gun`);
      if (reasons.length === 0) reasons.push('Risk sinyali dusuk');

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        pendingDays,
        customerId: order.user.id,
        customerCode: order.user.mikroCariCode || order.user.id,
        customerName: order.user.displayName || order.user.name || order.user.mikroCariCode || order.user.id,
        orderAmount: Number(orderAmount.toFixed(2)),
        itemCount: order.items.length,
        pastDueBalance: Number(pastDueBalance.toFixed(2)),
        notDueBalance: Number(notDueBalance.toFixed(2)),
        totalBalance: Number(totalBalance.toFixed(2)),
        classification,
        manualRiskScore,
        riskScore,
        decision,
        reasons,
      };
    });

    rows.sort((a, b) => {
      if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    return {
      summary: {
        totalPendingOrders: rows.length,
        totalPendingAmount: Number(rows.reduce((sum, row) => sum + row.orderAmount, 0).toFixed(2)),
        autoApproveCount: rows.filter((row) => row.decision === 'AUTO_APPROVE').length,
        manualReviewCount: rows.filter((row) => row.decision === 'MANUAL_REVIEW').length,
        blockCount: rows.filter((row) => row.decision === 'BLOCK').length,
      },
      orders: rows,
    };
  }

  async getSubstitutionSnapshot(
    options?: { series?: string[]; orderLimit?: number },
    atpSnapshot?: Awaited<ReturnType<OperationsIntelligenceService['getAtpSnapshot']>>
  ) {
    const atp = atpSnapshot || (await this.getAtpSnapshot(options));

    const shortageLines = atp.orders.flatMap((order) =>
      order.lines
        .filter((line) => line.shortageQty > 0)
        .map((line) => ({
          mikroOrderNumber: order.mikroOrderNumber,
          customerCode: order.customerCode,
          customerName: order.customerName,
          lineKey: line.lineKey,
          sourceProductCode: line.productCode,
          sourceProductName: line.productName,
          categoryId: line.categoryId,
          categoryName: line.categoryName,
          brandCode: line.brandCode,
          neededQty: line.remainingQty,
          shortageQty: line.shortageQty,
        }))
    );

    const limitedLines = shortageLines.slice(0, 80);
    if (limitedLines.length === 0) {
      return {
        summary: {
          linesNeedingSubstitution: 0,
          linesWithSuggestion: 0,
          unresolvedLines: 0,
        },
        suggestions: [],
      };
    }

    const sourceCodes = Array.from(
      new Set(limitedLines.map((line) => normalize(line.sourceProductCode)).filter(Boolean))
    );
    const categoryIds = Array.from(
      new Set(limitedLines.map((line) => normalize(line.categoryId)).filter(Boolean))
    );

    const [sourceProducts, candidates] = await Promise.all([
      sourceCodes.length > 0
        ? prisma.product.findMany({
            where: { mikroCode: { in: sourceCodes } },
            select: {
              mikroCode: true,
              name: true,
              brandCode: true,
            },
          })
        : Promise.resolve([]),
      categoryIds.length > 0
        ? prisma.product.findMany({
            where: {
              active: true,
              categoryId: { in: categoryIds },
            },
            select: {
              mikroCode: true,
              name: true,
              unit: true,
              brandCode: true,
              categoryId: true,
              category: { select: { name: true } },
              imageUrl: true,
              warehouseStocks: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const sourceMap = new Map(sourceProducts.map((product) => [normalize(product.mikroCode), product]));
    const candidatesByCategory = new Map<string, typeof candidates>();
    candidates.forEach((candidate) => {
      const key = normalize(candidate.categoryId);
      const list = candidatesByCategory.get(key) || [];
      list.push(candidate);
      candidatesByCategory.set(key, list);
    });

    const tokenize = (text: string) => normalize(text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const similarity = (a: string, b: string) => {
      const aTokens = new Set(tokenize(a));
      const bTokens = new Set(tokenize(b));
      if (aTokens.size === 0 || bTokens.size === 0) return 0;
      let overlap = 0;
      aTokens.forEach((token) => {
        if (bTokens.has(token)) overlap += 1;
      });
      return Math.round((overlap / Math.max(aTokens.size, 1)) * 100);
    };

    const suggestions = limitedLines.map((line) => {
      const source = sourceMap.get(normalize(line.sourceProductCode));
      const sourceName = source?.name || line.sourceProductName;
      const sourceBrand = normalize(source?.brandCode || line.brandCode);
      const categoryKey = normalize(line.categoryId);

      const ranked = (candidatesByCategory.get(categoryKey) || [])
        .filter((candidate) => normalize(candidate.mikroCode) !== normalize(line.sourceProductCode))
        .map((candidate) => {
          const stockQty = sumStocks(candidate.warehouseStocks);
          const sameBrand = sourceBrand && normalize(candidate.brandCode) === sourceBrand;
          const textSimilarity = similarity(sourceName, candidate.name);
          const score =
            (sameBrand ? 35 : 0) +
            Math.min(stockQty, 200) / 2 +
            textSimilarity * 0.2 +
            (candidate.imageUrl ? 5 : 0);

          const reasonParts = [
            sameBrand ? 'Ayni marka' : null,
            textSimilarity >= 50 ? `Isim benzerligi ${textSimilarity}%` : null,
            `Stok ${Math.round(stockQty)} ${candidate.unit || 'ADET'}`,
          ].filter(Boolean);

          return {
            productCode: candidate.mikroCode,
            productName: candidate.name,
            unit: candidate.unit || 'ADET',
            categoryName: candidate.category?.name || null,
            stockQty: Number(stockQty.toFixed(2)),
            score: Number(score.toFixed(1)),
            reason: reasonParts.join(' | '),
            imageUrl: candidate.imageUrl || null,
          };
        })
        .filter((candidate) => candidate.stockQty > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);

      return {
        mikroOrderNumber: line.mikroOrderNumber,
        customerCode: line.customerCode,
        customerName: line.customerName,
        lineKey: line.lineKey,
        sourceProductCode: line.sourceProductCode,
        sourceProductName: line.sourceProductName,
        categoryName: line.categoryName,
        neededQty: line.neededQty,
        shortageQty: line.shortageQty,
        candidates: ranked,
      };
    });

    return {
      summary: {
        linesNeedingSubstitution: suggestions.length,
        linesWithSuggestion: suggestions.filter((row) => row.candidates.length > 0).length,
        unresolvedLines: suggestions.filter((row) => row.candidates.length === 0).length,
      },
      suggestions,
    };
  }

  async getDataQualitySnapshot() {
    const [products, shelves, pendingOrders] = await Promise.all([
      prisma.product.findMany({
        where: { active: true },
        select: {
          mikroCode: true,
          name: true,
          unit: true,
          unit2: true,
          unit2Factor: true,
          vatRate: true,
          imageUrl: true,
          warehouseStocks: true,
        },
      }),
      prisma.warehouseShelfLocation.findMany({
        select: {
          productCode: true,
          shelfCode: true,
        },
      }),
      prisma.pendingMikroOrder.findMany({
        select: {
          mikroOrderNumber: true,
          items: true,
        },
      }),
    ]);

    const shelfSet = new Set(shelves.map((shelf) => normalize(shelf.productCode)).filter(Boolean));
    const productSet = new Set(products.map((product) => normalize(product.mikroCode)));

    const missingImages = products.filter((product) => !normalize(product.imageUrl));
    const invalidVat = products.filter((product) => {
      const vat = toNumber(product.vatRate);
      return vat <= 0 || vat > 0.3;
    });
    const invalidUnit2 = products.filter(
      (product) => normalize(product.unit2) && toNumber(product.unit2Factor) <= 0
    );
    const missingUnit = products.filter((product) => !normalize(product.unit));
    const missingShelf = products.filter((product) => {
      const stock = sumStocks(product.warehouseStocks);
      return stock > 0 && !shelfSet.has(normalize(product.mikroCode));
    });
    const suspiciousNames = products.filter((product) => {
      const name = normalize(product.name);
      if (!name) return true;
      if (name.length < 4) return true;
      if (/^[0-9\s\-_.]+$/.test(name)) return true;
      return false;
    });

    const unknownProducts: Array<{ code: string; name: string; detail: string }> = [];
    const reserveMismatch: Array<{ code: string; name: string; detail: string }> = [];
    pendingOrders.forEach((order) => {
      this.parsePendingItems(order.items, true).forEach((line) => {
        if (!productSet.has(normalize(line.productCode)) && unknownProducts.length < 20) {
          unknownProducts.push({
            code: line.productCode,
            name: line.productName,
            detail: `Siparis: ${order.mikroOrderNumber}`,
          });
        }
        const activeReserve = Math.max(line.reservedQty - line.reservedDeliveredQty, 0);
        if (activeReserve > line.remainingQty + 0.0001 && reserveMismatch.length < 20) {
          reserveMismatch.push({
            code: line.productCode,
            name: line.productName,
            detail: `Siparis: ${order.mikroOrderNumber} | Rezerve ${activeReserve} > Kalan ${line.remainingQty}`,
          });
        }
      });
    });

    const pickSamples = (
      rows: Array<{ mikroCode: string; name: string }>,
      detailFactory: (row: { mikroCode: string; name: string }) => string
    ) => rows.slice(0, 8).map((row) => ({ code: row.mikroCode, name: row.name, detail: detailFactory(row) }));

    const checks: Array<{
      code: string;
      title: string;
      severity: Severity;
      count: number;
      blocked: boolean;
      description: string;
      sample: Array<{ code: string; name: string; detail: string }>;
    }> = [
      {
        code: 'MISSING_IMAGE',
        title: 'Eksik urun gorseli',
        severity: 'MEDIUM',
        count: missingImages.length,
        blocked: false,
        description: 'Urun kartinda gorsel yok.',
        sample: pickSamples(missingImages, () => 'Urun gorseli tanimli degil'),
      },
      {
        code: 'INVALID_VAT_RATE',
        title: 'Gecersiz KDV orani',
        severity: 'CRITICAL',
        count: invalidVat.length,
        blocked: invalidVat.length > 0,
        description: 'KDV oranlari belge/fiyat hesaplarini bozar.',
        sample: pickSamples(invalidVat, (row) => {
          const vat = toNumber(products.find((item) => item.mikroCode === row.mikroCode)?.vatRate);
          return `KDV: ${vat.toFixed(4)}`;
        }),
      },
      {
        code: 'INVALID_UNIT2_FACTOR',
        title: '2. birim katsayisi gecersiz',
        severity: 'HIGH',
        count: invalidUnit2.length,
        blocked: invalidUnit2.length > 0,
        description: 'Koli ici adet/katsayi verisi eksik.',
        sample: pickSamples(invalidUnit2, (row) => {
          const unit2Factor = toNumber(products.find((item) => item.mikroCode === row.mikroCode)?.unit2Factor);
          return `Katsayi: ${unit2Factor}`;
        }),
      },
      {
        code: 'MISSING_PRIMARY_UNIT',
        title: 'Ana birim eksik',
        severity: 'HIGH',
        count: missingUnit.length,
        blocked: missingUnit.length > 0,
        description: 'Urun ana birimi bos.',
        sample: pickSamples(missingUnit, () => 'Birim bos'),
      },
      {
        code: 'MISSING_SHELF_WITH_STOCK',
        title: 'Stoklu urunde raf kodu eksik',
        severity: 'MEDIUM',
        count: missingShelf.length,
        blocked: false,
        description: 'Depo toplama hizi duser.',
        sample: pickSamples(missingShelf, (row) => {
          const stock = sumStocks(products.find((item) => item.mikroCode === row.mikroCode)?.warehouseStocks);
          return `Stok: ${stock.toFixed(2)}`;
        }),
      },
      {
        code: 'UNKNOWN_PENDING_PRODUCT',
        title: 'Bekleyen sipariste urun karti yok',
        severity: 'CRITICAL',
        count: unknownProducts.length,
        blocked: unknownProducts.length > 0,
        description: 'Pending sipariste urun eslesmesi yok.',
        sample: unknownProducts.slice(0, 8),
      },
      {
        code: 'RESERVE_MISMATCH',
        title: 'Rezerve miktari kalan siparisten fazla',
        severity: 'HIGH',
        count: reserveMismatch.length,
        blocked: reserveMismatch.length > 0,
        description: 'Rezerve muhasebesinde sapma var.',
        sample: reserveMismatch.slice(0, 8),
      },
      {
        code: 'SUSPICIOUS_PRODUCT_NAME',
        title: 'Supheli urun adi',
        severity: 'LOW',
        count: suspiciousNames.length,
        blocked: false,
        description: 'Cok kisa ya da anlamsiz urun adi.',
        sample: pickSamples(suspiciousNames, () => 'Master data duzenleme onerilir'),
      },
    ];

    const totalIssues = checks.reduce((sum, check) => sum + check.count, 0);
    const blockedChecks = checks.filter((check) => check.blocked).length;
    const penalty = checks.reduce((sum, check) => {
      const weight = check.severity === 'CRITICAL' ? 3 : check.severity === 'HIGH' ? 2 : check.severity === 'MEDIUM' ? 1 : 0.5;
      return sum + Math.min(check.count, 30) * weight;
    }, 0);

    return {
      summary: {
        totalIssues,
        blockedChecks,
        healthScore: clamp(Math.round(100 - penalty / 2), 0, 100),
      },
      checks,
    };
  }

  async getCommandCenterSnapshot(options?: {
    series?: string[];
    orderLimit?: number;
    customerLimit?: number;
  }) {
    const atp = await this.getAtpSnapshot({
      series: options?.series,
      orderLimit: options?.orderLimit,
    });

    const [orchestration, customerIntent, risk, substitution, dataQuality] = await Promise.all([
      this.getOrchestrationSnapshot(
        { series: options?.series, orderLimit: options?.orderLimit },
        atp
      ),
      this.getCustomerIntentSnapshot({ customerLimit: options?.customerLimit }),
      this.getRiskSnapshot({ orderLimit: options?.orderLimit }),
      this.getSubstitutionSnapshot(
        { series: options?.series, orderLimit: options?.orderLimit },
        atp
      ),
      this.getDataQualitySnapshot(),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        openOrderCount: atp.summary.totalOrders,
        lowCoverageOrderCount: atp.summary.partialOrders + atp.summary.noneOrders,
        shortageQty: atp.summary.totalShortageQty,
        activePickerCount: orchestration.summary.activePickers,
        hotCustomerCount: customerIntent.summary.hotCustomers,
        highRiskOrderCount: risk.summary.blockCount + risk.summary.manualReviewCount,
        substitutionNeedCount: substitution.summary.linesNeedingSubstitution,
        blockedDataChecks: dataQuality.summary.blockedChecks,
      },
      atp,
      orchestration,
      customerIntent,
      risk,
      substitution,
      dataQuality,
    };
  }
}

export default new OperationsIntelligenceService();
