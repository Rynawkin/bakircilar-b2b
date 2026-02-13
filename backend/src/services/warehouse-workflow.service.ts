import { prisma } from '../utils/prisma';

type WorkflowStatus =
  | 'PENDING'
  | 'PICKING'
  | 'READY_FOR_LOADING'
  | 'PARTIALLY_LOADED'
  | 'LOADED'
  | 'DISPATCHED';

type WorkflowItemStatus = 'PENDING' | 'PICKED' | 'PARTIAL' | 'MISSING' | 'EXTRA';

interface PendingOrderItemRow {
  productCode: string;
  productName: string;
  unit: string;
  quantity: number;
  deliveredQty: number;
  remainingQty: number;
  unitPrice: number;
  lineTotal: number;
  vat: number;
  rowNumber?: number;
}

interface CoverageSummary {
  fullLines: number;
  partialLines: number;
  missingLines: number;
  coveredPercent: number;
}

interface WorkflowCoverageItem {
  lineKey: string;
  remainingQty: number;
  pickedQty: number;
  shortageQty: number;
  extraQty: number;
}

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeCode = (value: unknown): string => String(value ?? '').trim();

const normalizeLineKey = (productCode: string, rowNumber?: number, index = 0): string => {
  const code = normalizeCode(productCode) || `UNKNOWN-${index + 1}`;
  const row = Number.isFinite(Number(rowNumber)) ? Number(rowNumber) : index + 1;
  return `${code}#${row}`;
};

const sumWarehouseStocks = (warehouseStocks: unknown): number => {
  if (!warehouseStocks || typeof warehouseStocks !== 'object' || Array.isArray(warehouseStocks)) {
    return 0;
  }

  const values = Object.values(warehouseStocks as Record<string, unknown>);
  return values.reduce<number>((sum, value) => sum + toNumber(value), 0);
};

const parsePendingItems = (itemsJson: unknown): PendingOrderItemRow[] => {
  if (!Array.isArray(itemsJson)) return [];

  return itemsJson.map((raw: any, index) => ({
    productCode: normalizeCode(raw?.productCode) || `UNKNOWN-${index + 1}`,
    productName: normalizeCode(raw?.productName) || normalizeCode(raw?.productCode) || 'Bilinmeyen Urun',
    unit: normalizeCode(raw?.unit) || 'ADET',
    quantity: toNumber(raw?.quantity),
    deliveredQty: toNumber(raw?.deliveredQty),
    remainingQty: toNumber(raw?.remainingQty),
    unitPrice: toNumber(raw?.unitPrice),
    lineTotal: toNumber(raw?.lineTotal),
    vat: toNumber(raw?.vat),
    rowNumber: Number.isFinite(Number(raw?.rowNumber)) ? Number(raw?.rowNumber) : undefined,
  }));
};

const toItemStatus = (
  pickedQty: number,
  extraQty: number,
  shortageQty: number,
  remainingQty: number
): WorkflowItemStatus => {
  const safeRemaining = Math.max(remainingQty, 0);
  const safePicked = Math.max(pickedQty, 0);
  const safeExtra = Math.max(extraQty, 0);
  const safeShortage = Math.max(shortageQty, Math.max(safeRemaining - safePicked, 0));

  if (safeExtra > 0) return 'EXTRA';
  if (safeRemaining <= 0) return 'PICKED';
  if (safePicked <= 0 && safeShortage > 0) return 'MISSING';
  if (safeShortage <= 0 && safePicked > 0) return 'PICKED';
  if (safePicked > 0 && safeShortage > 0) return 'PARTIAL';
  return 'PENDING';
};

class WarehouseWorkflowService {
  private async getProductAndShelfMaps(productCodes: string[]) {
    const uniqueCodes = Array.from(new Set(productCodes.map((code) => normalizeCode(code)).filter(Boolean)));

    if (uniqueCodes.length === 0) {
      return {
        stockMap: new Map<string, number>(),
        imageMap: new Map<string, string | null>(),
        shelfMap: new Map<string, string | null>(),
      };
    }

    const [products, shelfLocations] = await Promise.all([
      prisma.product.findMany({
        where: { mikroCode: { in: uniqueCodes } },
        select: {
          mikroCode: true,
          imageUrl: true,
          warehouseStocks: true,
        },
      }),
      prisma.warehouseShelfLocation.findMany({
        where: { productCode: { in: uniqueCodes } },
        select: { productCode: true, shelfCode: true },
      }),
    ]);

    const stockMap = new Map<string, number>();
    const imageMap = new Map<string, string | null>();
    const shelfMap = new Map<string, string | null>();

    for (const product of products) {
      const code = normalizeCode(product.mikroCode);
      stockMap.set(code, sumWarehouseStocks(product.warehouseStocks));
      imageMap.set(code, product.imageUrl || null);
    }

    for (const shelfLocation of shelfLocations) {
      shelfMap.set(normalizeCode(shelfLocation.productCode), normalizeCode(shelfLocation.shelfCode) || null);
    }

    return { stockMap, imageMap, shelfMap };
  }

  private computeCoverageForPendingItems(
    pendingItems: PendingOrderItemRow[],
    stockMap: Map<string, number>,
    workflowItems?: WorkflowCoverageItem[]
  ): CoverageSummary {
    let fullLines = 0;
    let partialLines = 0;
    let missingLines = 0;
    let totalRemaining = 0;
    let totalCovered = 0;

    const workflowByLine = new Map<string, WorkflowCoverageItem>();
    if (workflowItems?.length) {
      for (const item of workflowItems) {
        workflowByLine.set(item.lineKey, item);
      }
    }

    const remainingStockByCode = new Map<string, number>();

    pendingItems.forEach((item, index) => {
      const lineKey = normalizeLineKey(item.productCode, item.rowNumber, index);
      const remaining = Math.max(item.remainingQty, 0);
      totalRemaining += remaining;

      const workflowItem = workflowByLine.get(lineKey);

      if (workflowItem) {
        const covered = Math.min(Math.max(workflowItem.pickedQty, 0), remaining);
        const shortage = Math.max(workflowItem.shortageQty, Math.max(remaining - covered, 0));
        totalCovered += Math.max(covered, 0);

        if (shortage <= 0) {
          fullLines += 1;
        } else if (covered > 0) {
          partialLines += 1;
        } else {
          missingLines += 1;
        }
        return;
      }

      const code = normalizeCode(item.productCode);
      if (!remainingStockByCode.has(code)) {
        remainingStockByCode.set(code, Math.max(stockMap.get(code) || 0, 0));
      }

      const available = Math.max(remainingStockByCode.get(code) || 0, 0);
      const covered = Math.min(available, remaining);
      remainingStockByCode.set(code, Math.max(available - remaining, 0));

      totalCovered += covered;
      if (covered >= remaining) {
        fullLines += 1;
      } else if (covered > 0) {
        partialLines += 1;
      } else {
        missingLines += 1;
      }
    });

    const coveredPercent = totalRemaining > 0 ? Math.round((Math.max(totalCovered, 0) / totalRemaining) * 100) : 100;

    return {
      fullLines,
      partialLines,
      missingLines,
      coveredPercent: Math.max(0, Math.min(100, coveredPercent)),
    };
  }

  private determineWorkflowStatusFromItems(
    currentStatus: WorkflowStatus,
    items: Array<{ pickedQty: number; shortageQty: number; remainingQty: number; extraQty: number }>,
    hasStarted: boolean
  ): WorkflowStatus {
    if (currentStatus === 'DISPATCHED') {
      return currentStatus;
    }

    if (!hasStarted) return 'PENDING';
    if (items.length === 0) return 'PICKING';

    const hasAnyProgress = items.some(
      (item) =>
        Math.max(item.pickedQty, 0) > 0 ||
        Math.max(item.extraQty, 0) > 0 ||
        Math.max(item.shortageQty, 0) > 0
    );
    const hasAnyShortage = items.some((item) => Math.max(item.shortageQty, 0) > 0);
    const allLinesHandled = items.every((item) => {
      const remaining = Math.max(item.remainingQty, 0);
      const handled = Math.max(item.pickedQty, 0) + Math.max(item.shortageQty, 0);
      return handled >= remaining;
    });

    if (!hasAnyProgress || !allLinesHandled) return 'PICKING';
    return hasAnyShortage ? 'PARTIALLY_LOADED' : 'LOADED';
  }

  private async upsertWorkflowFromPendingOrder(
    pendingOrder: {
      mikroOrderNumber: string;
      orderSeries: string;
      orderSequence: number;
      customerCode: string;
      customerName: string;
      items: unknown;
    },
    assignedPickerUserId?: string
  ) {
    const pendingItems = parsePendingItems(pendingOrder.items);
    const productCodes = pendingItems.map((item) => item.productCode);
    const { stockMap, imageMap, shelfMap } = await this.getProductAndShelfMaps(productCodes);

    const existingWorkflow = await prisma.warehouseOrderWorkflow.findUnique({
      where: { mikroOrderNumber: pendingOrder.mikroOrderNumber },
      include: { items: true },
    });

    const now = new Date();

    if (!existingWorkflow) {
      const workflow = await prisma.warehouseOrderWorkflow.create({
        data: {
          mikroOrderNumber: pendingOrder.mikroOrderNumber,
          orderSeries: pendingOrder.orderSeries,
          orderSequence: pendingOrder.orderSequence,
          customerCode: pendingOrder.customerCode,
          customerName: pendingOrder.customerName,
          status: assignedPickerUserId ? 'PICKING' : 'PENDING',
          assignedPickerUserId: assignedPickerUserId || null,
          startedAt: assignedPickerUserId ? now : null,
          lastActionAt: now,
          items: {
            create: pendingItems.map((item, index) => {
              const lineKey = normalizeLineKey(item.productCode, item.rowNumber, index);
              const pickedQty = 0;
              const extraQty = 0;
              const shortageQty = Math.max(item.remainingQty - pickedQty, 0);
              return {
                lineKey,
                rowNumber: item.rowNumber,
                productCode: item.productCode,
                productName: item.productName,
                unit: item.unit,
                requestedQty: item.quantity,
                deliveredQty: item.deliveredQty,
                remainingQty: item.remainingQty,
                pickedQty,
                extraQty,
                shortageQty,
                unitPrice: item.unitPrice,
                vat: item.vat,
                stockSnapshot: stockMap.get(item.productCode) || 0,
                imageUrl: imageMap.get(item.productCode) || null,
                shelfCode: shelfMap.get(item.productCode) || null,
                status: toItemStatus(pickedQty, extraQty, shortageQty, item.remainingQty),
              };
            }),
          },
        },
        include: { items: true },
      });

      return workflow;
    }

    const existingItemMap = new Map(existingWorkflow.items.map((item) => [item.lineKey, item]));
    const incomingLineKeys = new Set<string>();

    const itemUpserts = pendingItems.map((item, index) => {
      const lineKey = normalizeLineKey(item.productCode, item.rowNumber, index);
      incomingLineKeys.add(lineKey);

      const existingItem = existingItemMap.get(lineKey);
      const pickedQty = Math.max(existingItem?.pickedQty ?? 0, 0);
      const extraQty = Math.max(existingItem?.extraQty ?? 0, 0);
      const shortageQty = Math.max(item.remainingQty - pickedQty, 0);

      return prisma.warehouseOrderWorkflowItem.upsert({
        where: {
          workflowId_lineKey: {
            workflowId: existingWorkflow.id,
            lineKey,
          },
        },
        create: {
          workflowId: existingWorkflow.id,
          lineKey,
          rowNumber: item.rowNumber,
          productCode: item.productCode,
          productName: item.productName,
          unit: item.unit,
          requestedQty: item.quantity,
          deliveredQty: item.deliveredQty,
          remainingQty: item.remainingQty,
          pickedQty,
          extraQty,
          shortageQty,
          unitPrice: item.unitPrice,
          vat: item.vat,
          stockSnapshot: stockMap.get(item.productCode) || 0,
          imageUrl: imageMap.get(item.productCode) || null,
          shelfCode: shelfMap.get(item.productCode) || null,
          status: toItemStatus(pickedQty, extraQty, shortageQty, item.remainingQty),
        },
        update: {
          rowNumber: item.rowNumber,
          productCode: item.productCode,
          productName: item.productName,
          unit: item.unit,
          requestedQty: item.quantity,
          deliveredQty: item.deliveredQty,
          remainingQty: item.remainingQty,
          shortageQty,
          unitPrice: item.unitPrice,
          vat: item.vat,
          stockSnapshot: stockMap.get(item.productCode) || 0,
          imageUrl: imageMap.get(item.productCode) || null,
          shelfCode: shelfMap.get(item.productCode) || existingItem?.shelfCode || null,
          status: toItemStatus(pickedQty, extraQty, shortageQty, item.remainingQty),
        },
      });
    });

    await prisma.$transaction(itemUpserts);

    await prisma.warehouseOrderWorkflowItem.deleteMany({
      where: {
        workflowId: existingWorkflow.id,
        lineKey: { notIn: Array.from(incomingLineKeys) },
      },
    });

    const refreshedItems = await prisma.warehouseOrderWorkflowItem.findMany({
      where: { workflowId: existingWorkflow.id },
      select: {
        pickedQty: true,
        shortageQty: true,
        remainingQty: true,
        extraQty: true,
      },
    });

    const nextStatus = this.determineWorkflowStatusFromItems(
      existingWorkflow.status as WorkflowStatus,
      refreshedItems,
      Boolean(existingWorkflow.startedAt || assignedPickerUserId)
    );

    return prisma.warehouseOrderWorkflow.update({
      where: { id: existingWorkflow.id },
      data: {
        orderSeries: pendingOrder.orderSeries,
        orderSequence: pendingOrder.orderSequence,
        customerCode: pendingOrder.customerCode,
        customerName: pendingOrder.customerName,
        status: nextStatus,
        assignedPickerUserId: assignedPickerUserId || existingWorkflow.assignedPickerUserId || null,
        startedAt: assignedPickerUserId ? existingWorkflow.startedAt || now : existingWorkflow.startedAt,
        lastActionAt: now,
      },
      include: { items: true },
    });
  }

  async getOverview(params?: {
    series?: string;
    search?: string;
    status?: WorkflowStatus | 'ALL';
  }) {
    const search = normalizeCode(params?.search).toLowerCase();
    const statusFilter = params?.status && params.status !== 'ALL' ? params.status : null;
    const seriesFilter = normalizeCode(params?.series);

    const pendingOrders = await prisma.pendingMikroOrder.findMany({
      where: {
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
      orderBy: [{ orderSeries: 'asc' }, { orderDate: 'desc' }, { orderSequence: 'desc' }],
    });

    const orderNumbers = pendingOrders.map((order) => order.mikroOrderNumber);
    const workflows = orderNumbers.length
      ? await prisma.warehouseOrderWorkflow.findMany({
          where: { mikroOrderNumber: { in: orderNumbers } },
          include: {
            items: {
              select: {
                lineKey: true,
                remainingQty: true,
                pickedQty: true,
                shortageQty: true,
                extraQty: true,
              },
            },
          },
        })
      : [];

    const workflowMap = new Map(workflows.map((workflow) => [workflow.mikroOrderNumber, workflow]));
    const allProductCodes = pendingOrders.flatMap((order) =>
      parsePendingItems(order.items).map((item) => item.productCode)
    );
    const { stockMap } = await this.getProductAndShelfMaps(allProductCodes);

    const preFilteredRows = pendingOrders
      .map((order) => {
        const pendingItems = parsePendingItems(order.items);
        const workflow = workflowMap.get(order.mikroOrderNumber);
        const coverage = this.computeCoverageForPendingItems(
          pendingItems,
          stockMap,
          workflow?.items
        );
        const workflowStatus = (workflow?.status as WorkflowStatus) || 'PENDING';
        return {
          mikroOrderNumber: order.mikroOrderNumber,
          orderSeries: order.orderSeries,
          orderSequence: order.orderSequence,
          customerCode: order.customerCode,
          customerName: order.customerName,
          orderDate: order.orderDate,
          deliveryDate: order.deliveryDate,
          itemCount: order.itemCount,
          grandTotal: order.grandTotal,
          workflowStatus,
          assignedPickerUserId: workflow?.assignedPickerUserId || null,
          startedAt: workflow?.startedAt || null,
          loadedAt: workflow?.loadedAt || null,
          dispatchedAt: workflow?.dispatchedAt || null,
          coverage,
        };
      })
      .filter((row) => {
        if (statusFilter && row.workflowStatus !== statusFilter) return false;
        if (!search) return true;
        const text = `${row.mikroOrderNumber} ${row.customerCode} ${row.customerName}`.toLowerCase();
        return text.includes(search);
      });

    const orderRows = preFilteredRows.filter((row) => {
      if (!seriesFilter) return true;
      return row.orderSeries === seriesFilter;
    });

    const seriesMap = new Map<
      string,
      {
        series: string;
        total: number;
        pending: number;
        picking: number;
        ready: number;
        loaded: number;
        dispatched: number;
      }
    >();

    for (const row of preFilteredRows) {
      const key = row.orderSeries || 'DIGER';
      if (!seriesMap.has(key)) {
        seriesMap.set(key, {
          series: key,
          total: 0,
          pending: 0,
          picking: 0,
          ready: 0,
          loaded: 0,
          dispatched: 0,
        });
      }

      const bucket = seriesMap.get(key)!;
      bucket.total += 1;
      if (row.workflowStatus === 'PENDING') bucket.pending += 1;
      if (row.workflowStatus === 'PICKING') bucket.picking += 1;
      if (row.workflowStatus === 'READY_FOR_LOADING') bucket.ready += 1;
      if (row.workflowStatus === 'PARTIALLY_LOADED' || row.workflowStatus === 'LOADED') bucket.loaded += 1;
      if (row.workflowStatus === 'DISPATCHED') bucket.dispatched += 1;
    }

    return {
      series: Array.from(seriesMap.values()).sort((a, b) => a.series.localeCompare(b.series, 'tr')),
      orders: orderRows,
    };
  }

  async getOrderDetail(mikroOrderNumber: string, ensureWorkflow = false) {
    const orderNo = normalizeCode(mikroOrderNumber);
    if (!orderNo) {
      throw new Error('Siparis numarasi gerekli');
    }

    const pendingOrder = await prisma.pendingMikroOrder.findUnique({
      where: { mikroOrderNumber: orderNo },
    });

    if (!pendingOrder) {
      throw new Error('Siparis bulunamadi');
    }

    let workflow = await prisma.warehouseOrderWorkflow.findUnique({
      where: { mikroOrderNumber: orderNo },
      include: { items: true },
    });

    if (ensureWorkflow || !workflow) {
      workflow = await this.upsertWorkflowFromPendingOrder(pendingOrder);
    }

    const pendingItems = parsePendingItems(pendingOrder.items);
    const lineKeys = pendingItems.map((item, index) => normalizeLineKey(item.productCode, item.rowNumber, index));
    const workflowItemMap = new Map((workflow?.items || []).map((item) => [item.lineKey, item]));

    const productCodes = pendingItems.map((item) => item.productCode);
    const { stockMap, imageMap, shelfMap } = await this.getProductAndShelfMaps(productCodes);
    const coverage = this.computeCoverageForPendingItems(pendingItems, stockMap, workflow?.items);

    const lines = pendingItems.map((item, index) => {
      const lineKey = lineKeys[index];
      const workflowItem = workflowItemMap.get(lineKey);
      const pickedQty = Math.max(workflowItem?.pickedQty ?? 0, 0);
      const extraQty = Math.max(workflowItem?.extraQty ?? 0, 0);
      const shortageQty = Math.max(workflowItem?.shortageQty ?? Math.max(item.remainingQty - pickedQty, 0), 0);
      const status = (workflowItem?.status as WorkflowItemStatus) || toItemStatus(pickedQty, extraQty, shortageQty, item.remainingQty);
      const stockAvailable = stockMap.get(item.productCode) || 0;
      const shelfCode = workflowItem?.shelfCode || shelfMap.get(item.productCode) || null;

      const stockCoverageStatus =
        stockAvailable >= item.remainingQty ? 'FULL' : stockAvailable > 0 ? 'PARTIAL' : 'NONE';

      return {
        lineKey,
        rowNumber: item.rowNumber || index + 1,
        productCode: item.productCode,
        productName: item.productName,
        unit: item.unit,
        requestedQty: item.quantity,
        deliveredQty: item.deliveredQty,
        remainingQty: item.remainingQty,
        pickedQty,
        extraQty,
        shortageQty,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        vat: item.vat,
        stockAvailable,
        stockCoverageStatus,
        imageUrl: workflowItem?.imageUrl || imageMap.get(item.productCode) || null,
        shelfCode,
        status,
      };
    });

    return {
      order: {
        mikroOrderNumber: pendingOrder.mikroOrderNumber,
        orderSeries: pendingOrder.orderSeries,
        orderSequence: pendingOrder.orderSequence,
        customerCode: pendingOrder.customerCode,
        customerName: pendingOrder.customerName,
        orderDate: pendingOrder.orderDate,
        deliveryDate: pendingOrder.deliveryDate,
        itemCount: pendingOrder.itemCount,
        grandTotal: pendingOrder.grandTotal,
      },
      workflow: workflow
        ? {
            id: workflow.id,
            status: workflow.status,
            assignedPickerUserId: workflow.assignedPickerUserId,
            startedAt: workflow.startedAt,
            loadingStartedAt: workflow.loadingStartedAt,
            loadedAt: workflow.loadedAt,
            dispatchedAt: workflow.dispatchedAt,
            lastActionAt: workflow.lastActionAt,
          }
        : null,
      coverage,
      lines,
    };
  }

  async startPicking(mikroOrderNumber: string, userId: string) {
    const orderNo = normalizeCode(mikroOrderNumber);
    if (!orderNo) throw new Error('Siparis numarasi gerekli');

    const pendingOrder = await prisma.pendingMikroOrder.findUnique({
      where: { mikroOrderNumber: orderNo },
    });

    if (!pendingOrder) {
      throw new Error('Siparis bulunamadi');
    }

    const now = new Date();
    const workflow = await this.upsertWorkflowFromPendingOrder(pendingOrder, userId);

    await prisma.warehouseOrderWorkflow.update({
      where: { id: workflow.id },
      data: {
        status: workflow.status === 'PENDING' ? 'PICKING' : workflow.status,
        assignedPickerUserId: userId,
        startedAt: workflow.startedAt || now,
        lastActionAt: now,
      },
    });

    return this.getOrderDetail(orderNo, true);
  }

  async updateItem(
    mikroOrderNumber: string,
    lineKey: string,
    payload: { pickedQty?: number; extraQty?: number; shelfCode?: string | null; userId?: string }
  ) {
    const orderNo = normalizeCode(mikroOrderNumber);
    const normalizedLineKey = normalizeCode(lineKey);

    if (!orderNo || !normalizedLineKey) {
      throw new Error('Siparis numarasi ve satir anahtari gerekli');
    }

    const pendingOrder = await prisma.pendingMikroOrder.findUnique({
      where: { mikroOrderNumber: orderNo },
    });

    if (!pendingOrder) {
      throw new Error('Siparis bulunamadi');
    }

    const workflow = await this.upsertWorkflowFromPendingOrder(pendingOrder, payload.userId);

    if (!workflow.startedAt || workflow.status === 'PENDING') {
      throw new Error('Toplama baslatilmadan satir guncellenemez');
    }

    if (workflow.status === 'DISPATCHED') {
      throw new Error('Sevk edilen siparis degistirilemez');
    }

    const item = workflow.items.find((entry) => entry.lineKey === normalizedLineKey);

    if (!item) {
      throw new Error('Satir bulunamadi');
    }

    const nextPickedQty =
      payload.pickedQty === undefined ? item.pickedQty : Math.max(toNumber(payload.pickedQty), 0);
    const nextExtraQty =
      payload.extraQty === undefined ? item.extraQty : Math.max(toNumber(payload.extraQty), 0);
    const nextShortageQty = Math.max(item.remainingQty - nextPickedQty, 0);
    const nextStatus = toItemStatus(nextPickedQty, nextExtraQty, nextShortageQty, item.remainingQty);

    let nextShelfCode = item.shelfCode;
    if (payload.shelfCode !== undefined) {
      const trimmed = normalizeCode(payload.shelfCode);
      nextShelfCode = trimmed || null;

      if (trimmed) {
        await prisma.warehouseShelfLocation.upsert({
          where: { productCode: item.productCode },
          create: {
            productCode: item.productCode,
            shelfCode: trimmed,
            updatedBy: payload.userId || null,
          },
          update: {
            shelfCode: trimmed,
            updatedBy: payload.userId || null,
          },
        });
      } else {
        await prisma.warehouseShelfLocation.deleteMany({
          where: { productCode: item.productCode },
        });
      }
    }

    await prisma.warehouseOrderWorkflowItem.update({
      where: { id: item.id },
      data: {
        pickedQty: nextPickedQty,
        extraQty: nextExtraQty,
        shortageQty: nextShortageQty,
        shelfCode: nextShelfCode,
        status: nextStatus,
      },
    });

    const refreshed = await prisma.warehouseOrderWorkflow.findUnique({
      where: { id: workflow.id },
      include: {
        items: {
          select: {
            pickedQty: true,
            shortageQty: true,
            remainingQty: true,
            extraQty: true,
          },
        },
      },
    });

    const nextWorkflowStatus = this.determineWorkflowStatusFromItems(
      (workflow.status as WorkflowStatus) || 'PENDING',
      refreshed?.items || [],
      Boolean(workflow.startedAt || payload.userId)
    );

    await prisma.warehouseOrderWorkflow.update({
      where: { id: workflow.id },
      data: {
        status: nextWorkflowStatus,
        assignedPickerUserId: workflow.assignedPickerUserId || payload.userId || null,
        startedAt: workflow.startedAt || new Date(),
        lastActionAt: new Date(),
      },
    });

    return this.getOrderDetail(orderNo, false);
  }

  async markLoaded(mikroOrderNumber: string) {
    throw new Error('Durum manuel guncellenemez');
  }

  async markDispatched(mikroOrderNumber: string) {
    throw new Error('Durum manuel guncellenemez');
  }

  async getWorkflowStatusMap(mikroOrderNumbers: string[]) {
    const normalized = Array.from(new Set(mikroOrderNumbers.map((value) => normalizeCode(value)).filter(Boolean)));
    if (normalized.length === 0) return new Map<string, { status: WorkflowStatus; updatedAt: Date }>();

    const workflows = await prisma.warehouseOrderWorkflow.findMany({
      where: { mikroOrderNumber: { in: normalized } },
      select: {
        mikroOrderNumber: true,
        status: true,
        updatedAt: true,
      },
    });

    return new Map(
      workflows.map((workflow) => [
        workflow.mikroOrderNumber,
        {
          status: workflow.status as WorkflowStatus,
          updatedAt: workflow.updatedAt,
        },
      ])
    );
  }
}

export default new WarehouseWorkflowService();
