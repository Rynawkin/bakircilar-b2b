import { prisma } from '../utils/prisma';
import mikroService from './mikroFactory.service';
import { MIKRO_TABLES } from '../config/mikro-tables';
import { randomUUID } from 'crypto';

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
  warehouseCode?: string | null;
  quantity: number;
  deliveredQty: number;
  remainingQty: number;
  reservedQty?: number;
  reservedDeliveredQty?: number;
  unitPrice: number;
  lineTotal: number;
  vat: number;
  rowNumber?: number;
}

interface ProductReservationEntry {
  mikroOrderNumber: string;
  customerCode: string;
  customerName: string;
  orderDate: Date;
  reservedQty: number;
  rowNumber: number | null;
}

interface CoverageSummary {
  fullLines: number;
  partialLines: number;
  missingLines: number;
  coveredPercent: number;
}

type CoverageStatus = 'FULL' | 'PARTIAL' | 'NONE';
type ImageIssueStatus = 'OPEN' | 'REVIEWED' | 'FIXED';
type SqlRawValue = { raw: string };

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeCode = (value: unknown): string => String(value ?? '').trim();
const normalizeProductCode = (value: unknown): string => normalizeCode(value).toUpperCase();
const parseMikroOrderNumber = (value: string): { series: string; sequence: number } | null => {
  const normalized = normalizeCode(value);
  const lastDash = normalized.lastIndexOf('-');
  if (lastDash <= 0 || lastDash >= normalized.length - 1) return null;
  const series = normalized.slice(0, lastDash);
  const sequence = Number(normalized.slice(lastDash + 1));
  if (!series || !Number.isFinite(sequence) || sequence <= 0) return null;
  return { series, sequence };
};

const normalizeLineKey = (productCode: string, rowNumber?: number, index = 0): string => {
  const code = normalizeCode(productCode) || `UNKNOWN-${index + 1}`;
  const row = Number.isFinite(Number(rowNumber)) ? Number(rowNumber) : index + 1;
  return `${code}#${row}`;
};

const resolveWarehouseStockValue = (warehouseStocks: unknown, warehouseCode: string): number | null => {
  const target = normalizeCode(warehouseCode);
  if (!target) return null;
  if (!warehouseStocks || typeof warehouseStocks !== 'object' || Array.isArray(warehouseStocks)) {
    return null;
  }

  const record = warehouseStocks as Record<string, unknown>;
  for (const [rawKey, rawValue] of Object.entries(record)) {
    const key = normalizeCode(rawKey);
    if (!key) continue;
    if (key === target) return Math.max(toNumber(rawValue), 0);
    const keyDigits = key.match(/\d+/)?.[0];
    if (keyDigits && keyDigits === target) return Math.max(toNumber(rawValue), 0);
  }

  return null;
};

const sumWarehouseStocks = (warehouseStocks: unknown): number => {
  if (!warehouseStocks || typeof warehouseStocks !== 'object' || Array.isArray(warehouseStocks)) {
    return 0;
  }

  const values = Object.values(warehouseStocks as Record<string, unknown>);
  return values.reduce<number>((sum, value) => sum + toNumber(value), 0);
};

const getStockByWarehouse = (warehouseStocks: unknown, warehouseCode?: string | null): number => {
  if (!warehouseCode) {
    return sumWarehouseStocks(warehouseStocks);
  }

  const directMatch = resolveWarehouseStockValue(warehouseStocks, warehouseCode);
  if (directMatch !== null) {
    return directMatch;
  }

  return sumWarehouseStocks(warehouseStocks);
};

const getWarehouseBreakdown = (warehouseStocks: unknown): { merkez: number; topca: number } => ({
  merkez: Math.max(resolveWarehouseStockValue(warehouseStocks, '1') || 0, 0),
  topca: Math.max(resolveWarehouseStockValue(warehouseStocks, '6') || 0, 0),
});

const parsePendingItems = (
  itemsJson: unknown,
  options?: {
    includeNonRemaining?: boolean;
  }
): PendingOrderItemRow[] => {
  if (!Array.isArray(itemsJson)) return [];

  const parsed = itemsJson
    .map((raw: any, index) => ({
      productCode: normalizeCode(raw?.productCode) || `UNKNOWN-${index + 1}`,
      productName: normalizeCode(raw?.productName) || normalizeCode(raw?.productCode) || 'Bilinmeyen Urun',
      unit: normalizeCode(raw?.unit) || 'ADET',
      warehouseCode: normalizeCode(raw?.warehouseCode) || null,
      quantity: toNumber(raw?.quantity),
      deliveredQty: toNumber(raw?.deliveredQty),
      remainingQty: toNumber(raw?.remainingQty),
      reservedQty: Math.max(toNumber(raw?.reservedQty), 0),
      reservedDeliveredQty: Math.max(toNumber(raw?.reservedDeliveredQty), 0),
      unitPrice: toNumber(raw?.unitPrice),
      lineTotal: toNumber(raw?.lineTotal),
      vat: toNumber(raw?.vat),
      rowNumber: Number.isFinite(Number(raw?.rowNumber)) ? Number(raw?.rowNumber) : undefined,
    }));

  if (options?.includeNonRemaining) {
    return parsed;
  }

  return parsed.filter((item) => item.remainingQty > 0);
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
  private async resolveUserLabel(userId?: string | null): Promise<string | null> {
    const normalizedUserId = normalizeCode(userId);
    if (!normalizedUserId) return null;

    const user = await prisma.user.findUnique({
      where: { id: normalizedUserId },
      select: {
        displayName: true,
        mikroName: true,
        name: true,
        email: true,
      },
    });

    return (
      normalizeCode(user?.displayName) ||
      normalizeCode(user?.mikroName) ||
      normalizeCode(user?.name) ||
      normalizeCode(user?.email) ||
      null
    );
  }

  private normalizeImageIssueStatus(value?: string | null): ImageIssueStatus | null {
    const normalized = normalizeCode(value).toUpperCase();
    if (!normalized) return null;
    if (normalized === 'OPEN' || normalized === 'REVIEWED' || normalized === 'FIXED') {
      return normalized;
    }
    return null;
  }

  private async getProductAndShelfMaps(productCodes: string[], warehouseCode?: string | null) {
    const uniqueCodes = Array.from(new Set(productCodes.map((code) => normalizeCode(code)).filter(Boolean)));

    if (uniqueCodes.length === 0) {
      return {
        stockMap: new Map<string, number>(),
        warehouseBreakdownMap: new Map<string, { merkez: number; topca: number }>(),
        imageMap: new Map<string, string | null>(),
        shelfMap: new Map<string, string | null>(),
        unitInfoMap: new Map<string, { unit2: string | null; unit2Factor: number | null }>(),
      };
    }

    const [products, shelfLocations] = await Promise.all([
      prisma.product.findMany({
        where: { mikroCode: { in: uniqueCodes } },
        select: {
          mikroCode: true,
          imageUrl: true,
          warehouseStocks: true,
          unit2: true,
          unit2Factor: true,
        },
      }),
      prisma.warehouseShelfLocation.findMany({
        where: { productCode: { in: uniqueCodes } },
        select: { productCode: true, shelfCode: true },
      }),
    ]);

    const stockMap = new Map<string, number>();
    const warehouseBreakdownMap = new Map<string, { merkez: number; topca: number }>();
    const imageMap = new Map<string, string | null>();
    const shelfMap = new Map<string, string | null>();
    const unitInfoMap = new Map<string, { unit2: string | null; unit2Factor: number | null }>();

    for (const product of products) {
      const code = normalizeCode(product.mikroCode);
      stockMap.set(code, getStockByWarehouse(product.warehouseStocks, warehouseCode));
      warehouseBreakdownMap.set(code, getWarehouseBreakdown(product.warehouseStocks));
      imageMap.set(code, product.imageUrl || null);
      unitInfoMap.set(code, {
        unit2: normalizeCode(product.unit2) || null,
        unit2Factor:
          Number.isFinite(Number(product.unit2Factor)) && Number(product.unit2Factor) !== 0
            ? Number(product.unit2Factor)
            : null,
      });
    }

    for (const shelfLocation of shelfLocations) {
      shelfMap.set(normalizeCode(shelfLocation.productCode), normalizeCode(shelfLocation.shelfCode) || null);
    }

    return { stockMap, warehouseBreakdownMap, imageMap, shelfMap, unitInfoMap };
  }

  private computeCoverageForPendingItems(
    pendingItems: PendingOrderItemRow[],
    stockMap: Map<string, number>
  ): CoverageSummary {
    let fullLines = 0;
    let partialLines = 0;
    let missingLines = 0;
    let totalRemaining = 0;
    let totalCovered = 0;

    const remainingStockByCode = new Map<string, number>();

    pendingItems.forEach((item) => {
      const remaining = Math.max(item.remainingQty, 0);
      totalRemaining += remaining;

      if (remaining <= 0) {
        fullLines += 1;
        return;
      }

      const code = normalizeCode(item.productCode);
      if (!remainingStockByCode.has(code)) {
        remainingStockByCode.set(code, Math.max(stockMap.get(code) || 0, 0));
      }

      const available = Math.max(remainingStockByCode.get(code) || 0, 0);
      const covered = Math.min(available, remaining);
      remainingStockByCode.set(code, Math.max(available - covered, 0));

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

  private resolveOrderWarehouseCode(pendingItems: PendingOrderItemRow[]): string | null {
    const candidates = pendingItems
      .map((item) => normalizeCode(item.warehouseCode))
      .filter((code): code is string => Boolean(code));
    return candidates[0] || null;
  }

  private resolveCoverageStatus(coverage: CoverageSummary): CoverageStatus {
    if (coverage.partialLines === 0 && coverage.missingLines === 0) return 'FULL';
    if (coverage.fullLines === 0 && coverage.partialLines === 0) return 'NONE';
    return 'PARTIAL';
  }

  private async getActiveReservationsByProductFromPendingCache(productCodes: string[]) {
    const targetCodes = new Set(productCodes.map((code) => normalizeProductCode(code)).filter(Boolean));
    const reservationsByCode = new Map<string, ProductReservationEntry[]>();

    if (targetCodes.size === 0) {
      return reservationsByCode;
    }

    const pendingOrders = await prisma.pendingMikroOrder.findMany({
      select: {
        mikroOrderNumber: true,
        customerCode: true,
        customerName: true,
        orderDate: true,
        items: true,
      },
    });

    for (const order of pendingOrders) {
      const orderItems = parsePendingItems(order.items, { includeNonRemaining: true });
      for (const item of orderItems) {
        const code = normalizeProductCode(item.productCode);
        if (!targetCodes.has(code)) continue;

        const reservedQty = Math.max(toNumber(item.reservedQty), 0);
        if (reservedQty <= 0) continue;

        const list = reservationsByCode.get(code) || [];
        list.push({
          mikroOrderNumber: order.mikroOrderNumber,
          customerCode: order.customerCode,
          customerName: order.customerName,
          orderDate: order.orderDate,
          reservedQty,
          rowNumber: Number.isFinite(Number(item.rowNumber)) ? Number(item.rowNumber) : null,
        });
        reservationsByCode.set(code, list);
      }
    }

    return reservationsByCode;
  }

  private async getActiveReservationsByProduct(productCodes: string[]) {
    const targetCodes = Array.from(new Set(productCodes.map((code) => normalizeProductCode(code)).filter(Boolean)));
    const targetCodeSet = new Set(targetCodes);
    const reservationsByCode = new Map<string, ProductReservationEntry[]>();

    if (targetCodes.length === 0) {
      return reservationsByCode;
    }

    try {
      const inClause = targetCodes.map((code) => `'${code.replace(/'/g, "''")}'`).join(', ');
      const rows = await mikroService.executeQuery(`
        SELECT
          s.${MIKRO_TABLES.ORDERS_COLUMNS.ORDER_SERIES} as order_series,
          s.${MIKRO_TABLES.ORDERS_COLUMNS.ORDER_SEQUENCE} as order_sequence,
          s.${MIKRO_TABLES.ORDERS_COLUMNS.LINE_NO} as row_number,
          s.${MIKRO_TABLES.ORDERS_COLUMNS.PRODUCT_CODE} as product_code,
          s.${MIKRO_TABLES.ORDERS_COLUMNS.CUSTOMER_CODE} as customer_code,
          c.${MIKRO_TABLES.CARI_COLUMNS.NAME} as customer_name,
          s.${MIKRO_TABLES.ORDERS_COLUMNS.DATE} as order_date,
          ISNULL(s.sip_rezervasyon_miktari, 0) as reserve_qty,
          ISNULL(s.sip_rezerveden_teslim_edilen, 0) as reserve_delivered_qty
        FROM ${MIKRO_TABLES.ORDERS} s
        LEFT JOIN ${MIKRO_TABLES.CARI} c
          ON s.${MIKRO_TABLES.ORDERS_COLUMNS.CUSTOMER_CODE} = c.${MIKRO_TABLES.CARI_COLUMNS.CODE}
        WHERE s.${MIKRO_TABLES.ORDERS_COLUMNS.TYPE} = 0
          AND s.${MIKRO_TABLES.ORDERS_COLUMNS.CANCELLED} = 0
          AND s.${MIKRO_TABLES.ORDERS_COLUMNS.CLOSED} = 0
          AND UPPER(LTRIM(RTRIM(s.${MIKRO_TABLES.ORDERS_COLUMNS.PRODUCT_CODE}))) IN (${inClause})
          AND ISNULL(s.sip_rezervasyon_miktari, 0) > ISNULL(s.sip_rezerveden_teslim_edilen, 0)
          AND (
            c.${MIKRO_TABLES.CARI_COLUMNS.SECTOR_CODE} IS NULL
            OR c.${MIKRO_TABLES.CARI_COLUMNS.SECTOR_CODE} NOT LIKE 'SATICI%'
          )
      `);

      for (const row of rows as any[]) {
        const code = normalizeProductCode(row.product_code);
        if (!code || !targetCodeSet.has(code)) continue;

        const reserveQty = Math.max(
          toNumber(row.reserve_qty) - toNumber(row.reserve_delivered_qty),
          0
        );
        if (reserveQty <= 0) continue;

        const orderSeries = normalizeCode(row.order_series);
        const orderSequence = Number.isFinite(Number(row.order_sequence)) ? Number(row.order_sequence) : null;
        if (!orderSeries || orderSequence === null) continue;

        const list = reservationsByCode.get(code) || [];
        list.push({
          mikroOrderNumber: `${orderSeries}-${orderSequence}`,
          customerCode: normalizeCode(row.customer_code),
          customerName: normalizeCode(row.customer_name) || normalizeCode(row.customer_code) || 'Bilinmeyen Musteri',
          orderDate: row.order_date ? new Date(row.order_date) : new Date(),
          reservedQty: reserveQty,
          rowNumber: Number.isFinite(Number(row.row_number)) ? Number(row.row_number) : null,
        });
        reservationsByCode.set(code, list);
      }

      return reservationsByCode;
    } catch (error) {
      console.error('Mikro rezerve sorgu hatasi, cache fallback kullaniliyor:', error);
      return this.getActiveReservationsByProductFromPendingCache(targetCodes);
    }
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
        Math.max(item.pickedQty, 0) > 0 || Math.max(item.extraQty, 0) > 0
    );
    const hasAnyShortage = items.some((item) => {
      const remaining = Math.max(item.remainingQty, 0);
      const picked = Math.max(item.pickedQty, 0);
      return picked < remaining;
    });
    const allLinesFullyPicked = items.every((item) => {
      const remaining = Math.max(item.remainingQty, 0);
      const picked = Math.max(item.pickedQty, 0);
      return picked >= remaining;
    });

    if (!hasAnyProgress) return 'PICKING';
    if (!hasAnyShortage && allLinesFullyPicked) return 'LOADED';
    return 'PICKING';
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
    const orderWarehouseCode = this.resolveOrderWarehouseCode(pendingItems);
    const productCodes = pendingItems.map((item) => item.productCode);
    const { stockMap, imageMap, shelfMap } = await this.getProductAndShelfMaps(productCodes, orderWarehouseCode);

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
      const deliveredQtyBase = existingItem
        ? Math.max(toNumber(existingItem.deliveredQty), toNumber(item.deliveredQty), 0)
        : Math.max(toNumber(item.deliveredQty), 0);
      const remainingQtyBase = existingItem
        ? Math.min(Math.max(toNumber(existingItem.remainingQty), 0), Math.max(toNumber(item.remainingQty), 0))
        : Math.max(toNumber(item.remainingQty), 0);
      const shortageQty = Math.max(remainingQtyBase - pickedQty, 0);

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
          deliveredQty: deliveredQtyBase,
          remainingQty: remainingQtyBase,
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
          deliveredQty: deliveredQtyBase,
          remainingQty: remainingQtyBase,
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
    series?: string | string[];
    search?: string;
    status?: WorkflowStatus | 'ALL';
  }) {
    const search = normalizeCode(params?.search).toLowerCase();
    const statusFilter = params?.status && params.status !== 'ALL' ? params.status : null;
    const seriesFilterValues = Array.isArray(params?.series)
      ? params?.series
      : typeof params?.series === 'string'
      ? params.series.split(',')
      : [];
    const selectedSeries = new Set(
      seriesFilterValues.map((value) => normalizeCode(value)).filter((value): value is string => Boolean(value))
    );

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
    const parsedOrders = pendingOrders.map((order) => {
      const pendingItems = parsePendingItems(order.items);
      const warehouseCode = this.resolveOrderWarehouseCode(pendingItems);
      return {
        order,
        pendingItems,
        warehouseCode,
      };
    });
    const allProductCodes = parsedOrders.flatMap((entry) => entry.pendingItems.map((item) => item.productCode));
    const warehouseKeys = Array.from(
      new Set(parsedOrders.map((entry) => entry.warehouseCode || '__ALL__'))
    );
    const stockMapByWarehouse = new Map<string, Map<string, number>>();
    await Promise.all(
      warehouseKeys.map(async (warehouseKey) => {
        const { stockMap } = await this.getProductAndShelfMaps(
          allProductCodes,
          warehouseKey === '__ALL__' ? null : warehouseKey
        );
        stockMapByWarehouse.set(warehouseKey, stockMap);
      })
    );

    const preFilteredRows = parsedOrders
      .map(({ order, pendingItems, warehouseCode }) => {
        const workflow = workflowMap.get(order.mikroOrderNumber);
        const stockMap = stockMapByWarehouse.get(warehouseCode || '__ALL__') || new Map<string, number>();
        const coverage = this.computeCoverageForPendingItems(pendingItems, stockMap);
        const coverageStatus = this.resolveCoverageStatus(coverage);
        const workflowStatus = (workflow?.status as WorkflowStatus) || 'PENDING';
        return {
          mikroOrderNumber: order.mikroOrderNumber,
          orderSeries: order.orderSeries,
          orderSequence: order.orderSequence,
          customerCode: order.customerCode,
          customerName: order.customerName,
          orderDate: order.orderDate,
          deliveryDate: order.deliveryDate,
          itemCount: pendingItems.length,
          grandTotal: pendingItems.reduce((sum, item) => sum + Math.max(item.lineTotal + item.vat, 0), 0),
          workflowStatus,
          assignedPickerUserId: workflow?.assignedPickerUserId || null,
          startedAt: workflow?.startedAt || null,
          loadedAt: workflow?.loadedAt || null,
          dispatchedAt: workflow?.dispatchedAt || null,
          mikroDeliveryNoteNo: workflow?.mikroDeliveryNoteNo || null,
          warehouseCode,
          coverage,
          coverageStatus,
        };
      })
      .filter((row) => {
        if (statusFilter && row.workflowStatus !== statusFilter) return false;
        if (!search) return true;
        const text = `${row.mikroOrderNumber} ${row.customerCode} ${row.customerName}`.toLowerCase();
        return text.includes(search);
      });

    const orderRows = preFilteredRows.filter((row) => {
      if (selectedSeries.size === 0) return true;
      return selectedSeries.has(row.orderSeries);
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
    const orderWarehouseCode = this.resolveOrderWarehouseCode(pendingItems);
    const lineKeys = pendingItems.map((item, index) => normalizeLineKey(item.productCode, item.rowNumber, index));
    const workflowItemMap = new Map((workflow?.items || []).map((item) => [item.lineKey, item]));

    const productCodes = pendingItems.map((item) => item.productCode);
    const { stockMap, warehouseBreakdownMap, imageMap, shelfMap, unitInfoMap } = await this.getProductAndShelfMaps(
      productCodes,
      orderWarehouseCode
    );
    const coverage = this.computeCoverageForPendingItems(pendingItems, stockMap);
    const coverageStatus = this.resolveCoverageStatus(coverage);
    const activeReservationsByProduct = await this.getActiveReservationsByProduct(productCodes);

    const lines = pendingItems.map((item, index) => {
      const lineKey = lineKeys[index];
      const workflowItem = workflowItemMap.get(lineKey);
      const effectiveDeliveredQty = Math.max(workflowItem?.deliveredQty ?? item.deliveredQty, 0);
      const effectiveRemainingQty = Math.max(workflowItem?.remainingQty ?? item.remainingQty, 0);
      const pickedQty = Math.max(workflowItem?.pickedQty ?? 0, 0);
      const extraQty = Math.max(workflowItem?.extraQty ?? 0, 0);
      const shortageQty = Math.max(workflowItem?.shortageQty ?? Math.max(effectiveRemainingQty - pickedQty, 0), 0);
      const status =
        (workflowItem?.status as WorkflowItemStatus) ||
        toItemStatus(pickedQty, extraQty, shortageQty, effectiveRemainingQty);
      const normalizedCode = normalizeCode(item.productCode);
      const stockAvailable = stockMap.get(normalizedCode) || 0;
      const shelfCode = workflowItem?.shelfCode || shelfMap.get(normalizedCode) || null;
      const unitInfo = unitInfoMap.get(normalizedCode) || { unit2: null, unit2Factor: null };
      const warehouseStocks = warehouseBreakdownMap.get(normalizedCode) || { merkez: 0, topca: 0 };
      const reservationsForProduct = activeReservationsByProduct.get(normalizeProductCode(normalizedCode)) || [];
      const lineRowNumber = Number.isFinite(Number(item.rowNumber)) ? Number(item.rowNumber) : null;
      const reservationDetails = reservationsForProduct.map((reservation) => {
        const isCurrentOrder = reservation.mikroOrderNumber === pendingOrder.mikroOrderNumber;
        const matchesCurrentLine =
          isCurrentOrder &&
          lineRowNumber !== null &&
          reservation.rowNumber !== null &&
          lineRowNumber === reservation.rowNumber;
        return {
          mikroOrderNumber: reservation.mikroOrderNumber,
          customerCode: reservation.customerCode,
          customerName: reservation.customerName,
          orderDate: reservation.orderDate,
          reservedQty: reservation.reservedQty,
          rowNumber: reservation.rowNumber,
          isCurrentOrder,
          matchesCurrentLine,
        };
      });
      const hasOwnReservation = reservationDetails.some((reservation) => reservation.isCurrentOrder);
      const hasOtherReservation = reservationDetails.some((reservation) => !reservation.isCurrentOrder);

      const stockCoverageStatus =
        stockAvailable >= effectiveRemainingQty ? 'FULL' : stockAvailable > 0 ? 'PARTIAL' : 'NONE';

      return {
        lineKey,
        rowNumber: item.rowNumber || index + 1,
        productCode: item.productCode,
        productName: item.productName,
        unit: item.unit,
        unit2: unitInfo.unit2,
        unit2Factor: unitInfo.unit2Factor,
        requestedQty: item.quantity,
        deliveredQty: effectiveDeliveredQty,
        remainingQty: effectiveRemainingQty,
        pickedQty,
        extraQty,
        shortageQty,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        vat: item.vat,
        stockAvailable,
        warehouseStocks,
        stockCoverageStatus,
        imageUrl: workflowItem?.imageUrl || imageMap.get(normalizedCode) || null,
        shelfCode,
        reservedQty: Math.max(toNumber(item.reservedQty), 0),
        hasOwnReservation,
        hasOtherReservation,
        reservations: reservationDetails,
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
        warehouseCode: orderWarehouseCode,
        orderDate: pendingOrder.orderDate,
        deliveryDate: pendingOrder.deliveryDate,
        itemCount: pendingItems.length,
        grandTotal: pendingItems.reduce((sum, item) => sum + Math.max(item.lineTotal + item.vat, 0), 0),
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
            mikroDeliveryNoteNo: workflow.mikroDeliveryNoteNo || null,
            lastActionAt: workflow.lastActionAt,
          }
        : null,
      coverage,
      coverageStatus,
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

  async reportImageIssue(
    mikroOrderNumber: string,
    lineKey: string,
    payload: { userId?: string; note?: string }
  ) {
    const orderNo = normalizeCode(mikroOrderNumber);
    const normalizedLineKey = normalizeCode(lineKey);
    const normalizedUserId = normalizeCode(payload.userId);
    const normalizedNote = normalizeCode(payload.note) || null;

    if (!orderNo || !normalizedLineKey) {
      throw new Error('Siparis numarasi ve satir anahtari gerekli');
    }

    const pendingOrder = await prisma.pendingMikroOrder.findUnique({
      where: { mikroOrderNumber: orderNo },
    });

    if (!pendingOrder) {
      throw new Error('Siparis bulunamadi');
    }

    const workflow = await this.upsertWorkflowFromPendingOrder(pendingOrder, normalizedUserId || undefined);
    const item = workflow.items.find((entry) => entry.lineKey === normalizedLineKey);
    if (!item) {
      throw new Error('Satir bulunamadi');
    }

    const existingOpenReport = await prisma.warehouseImageIssueReport.findFirst({
      where: {
        mikroOrderNumber: orderNo,
        lineKey: normalizedLineKey,
        status: 'OPEN',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingOpenReport) {
      return {
        report: existingOpenReport,
        alreadyReported: true,
      };
    }

    const reporterName = await this.resolveUserLabel(normalizedUserId || null);

    const created = await prisma.warehouseImageIssueReport.create({
      data: {
        mikroOrderNumber: orderNo,
        orderSeries: pendingOrder.orderSeries,
        customerCode: pendingOrder.customerCode,
        customerName: pendingOrder.customerName,
        lineKey: normalizedLineKey,
        rowNumber: item.rowNumber,
        productCode: item.productCode,
        productName: item.productName,
        imageUrl: item.imageUrl || null,
        note: normalizedNote,
        status: 'OPEN',
        reporterUserId: normalizedUserId || null,
        reporterName,
      },
    });

    return {
      report: created,
      alreadyReported: false,
    };
  }

  async getImageIssueReports(params?: {
    status?: ImageIssueStatus | 'ALL';
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const status = this.normalizeImageIssueStatus(params?.status || null);
    const search = normalizeCode(params?.search);
    const pageRaw = Math.trunc(toNumber(params?.page || 1));
    const limitRaw = Math.trunc(toNumber(params?.limit || 30));
    const page = pageRaw > 0 ? pageRaw : 1;
    const limit = limitRaw > 0 ? Math.min(limitRaw, 200) : 30;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { mikroOrderNumber: { contains: search, mode: 'insensitive' } },
        { productCode: { contains: search, mode: 'insensitive' } },
        { productName: { contains: search, mode: 'insensitive' } },
        { customerCode: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { reporterName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, reports, openCount, reviewedCount, fixedCount] = await Promise.all([
      prisma.warehouseImageIssueReport.count({ where }),
      prisma.warehouseImageIssueReport.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.warehouseImageIssueReport.count({ where: { status: 'OPEN' } }),
      prisma.warehouseImageIssueReport.count({ where: { status: 'REVIEWED' } }),
      prisma.warehouseImageIssueReport.count({ where: { status: 'FIXED' } }),
    ]);

    const productCodes = Array.from(new Set(reports.map((report) => normalizeCode(report.productCode)).filter(Boolean)));
    const products = productCodes.length
      ? await prisma.product.findMany({
          where: { mikroCode: { in: productCodes } },
          select: { id: true, mikroCode: true, imageUrl: true },
        })
      : [];
    const productMap = new Map(
      products.map((product) => [normalizeCode(product.mikroCode), { id: product.id, imageUrl: product.imageUrl || null }])
    );
    const reportsWithProduct = reports.map((report) => {
      const product = productMap.get(normalizeCode(report.productCode));
      return {
        ...report,
        productId: product?.id || null,
        currentProductImageUrl: product?.imageUrl || null,
      };
    });

    return {
      reports: reportsWithProduct,
      summary: {
        total,
        open: openCount,
        reviewed: reviewedCount,
        fixed: fixedCount,
      },
      pagination: {
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        totalRecords: total,
      },
    };
  }

  async updateImageIssueReportStatus(
    reportId: string,
    payload: { status: ImageIssueStatus; note?: string; userId?: string }
  ) {
    const normalizedReportId = normalizeCode(reportId);
    if (!normalizedReportId) {
      throw new Error('Talep kimligi gerekli');
    }

    const nextStatus = this.normalizeImageIssueStatus(payload.status);
    if (!nextStatus) {
      throw new Error('Gecersiz durum');
    }

    const normalizedUserId = normalizeCode(payload.userId);
    const normalizedNote = normalizeCode(payload.note) || null;
    const reviewerName = nextStatus === 'OPEN' ? null : await this.resolveUserLabel(normalizedUserId || null);

    const existing = await prisma.warehouseImageIssueReport.findUnique({
      where: { id: normalizedReportId },
      select: { id: true },
    });

    if (!existing) {
      throw new Error('Talep bulunamadi');
    }

    return prisma.warehouseImageIssueReport.update({
      where: { id: normalizedReportId },
      data: {
        status: nextStatus,
        reviewNote: normalizedNote,
        reviewedByUserId: nextStatus === 'OPEN' ? null : normalizedUserId || null,
        reviewedByName: nextStatus === 'OPEN' ? null : reviewerName,
        reviewedAt: nextStatus === 'OPEN' ? null : new Date(),
      },
    });
  }

  async markLoaded(mikroOrderNumber: string) {
    throw new Error('Durum manuel guncellenemez');
  }

  async markDispatched(mikroOrderNumber: string) {
    throw new Error('Sevk icin irsaliye serisi ile irsaliyelestirme adimini kullanin');
  }

  private raw(value: string): SqlRawValue {
    return { raw: value };
  }

  private toSqlLiteral(value: unknown): string {
    if (value && typeof value === 'object' && 'raw' in (value as Record<string, unknown>)) {
      return String((value as SqlRawValue).raw);
    }
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
    if (typeof value === 'boolean') return value ? '1' : '0';
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  private vatCodeToRate(vatCode: number): number {
    const vatMap: Record<number, number> = {
      0: 0,
      1: 0,
      2: 0.01,
      4: 0,
      5: 0.2,
      7: 0.1,
    };
    return vatMap[vatCode] ?? 0.2;
  }

  private vatRateToCode(vatRate: number): number {
    const normalized = Math.max(Number(vatRate) || 0, 0);
    if (normalized <= 0.0001) return 0;
    if (normalized <= 0.011) return 2;
    if (normalized <= 0.11) return 7;
    if (normalized <= 0.205) return 5;
    return 5;
  }

  private async getTableColumns(tableName: string): Promise<Set<string>> {
    const rows = await mikroService.executeQuery(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = '${String(tableName).replace(/'/g, "''")}'
    `);
    return new Set((rows as any[]).map((row) => String(row.COLUMN_NAME || row.column_name || '').trim()));
  }

  private buildInsertSql(tableName: string, values: Record<string, unknown>, allowedColumns: Set<string>) {
    const entries = Object.entries(values).filter(([column, value]) => allowedColumns.has(column) && value !== undefined);
    if (entries.length === 0) {
      throw new Error(`${tableName} insert kolonlari olusturulamadi`);
    }
    const columnSql = entries.map(([column]) => column).join(', ');
    const valueSql = entries.map(([, value]) => this.toSqlLiteral(value)).join(', ');
    return `INSERT INTO ${tableName} (${columnSql}) VALUES (${valueSql})`;
  }

  private async createMikroDeliveryNote(params: {
    orderNo: string;
    orderSeries: string;
    orderSequence: number;
    customerCode: string;
    deliverySeries: string;
    lines: Array<{ rowNumber: number | null; productCode: string; deliverQty: number }>;
  }): Promise<{ deliveryNoteNo: string; deliverySequence: number }> {
    const deliverySeries = normalizeCode(params.deliverySeries);
    if (!deliverySeries) {
      throw new Error('Irsaliye serisi gerekli');
    }

    let templateRows = await mikroService.executeQuery(`
      SELECT TOP 1 *
      FROM STOK_HAREKETLERI
      WHERE sth_evrakno_seri = '${deliverySeries.replace(/'/g, "''")}'
        AND ISNULL(sth_tip, 1) = 1
        AND ISNULL(sth_cins, 0) = 0
        AND ISNULL(sth_evraktip, 0) = 1
      ORDER BY sth_evrakno_sira DESC, sth_satirno DESC
    `);
    let templateRow = (templateRows as any[])[0];
    if (!templateRow) {
      templateRows = await mikroService.executeQuery(`
        SELECT TOP 1 *
        FROM STOK_HAREKETLERI
        WHERE ISNULL(sth_tip, 1) = 1
          AND ISNULL(sth_cins, 0) = 0
          AND ISNULL(sth_evraktip, 0) = 1
        ORDER BY sth_tarih DESC, sth_evrakno_sira DESC, sth_satirno DESC
      `);
      templateRow = (templateRows as any[])[0];
    }
    if (!templateRow) {
      throw new Error('Irsaliye olusturma icin Mikroda uygun ornek kayit bulunamadi');
    }
    const templateDocType = 1;

    const nextRows = await mikroService.executeQuery(`
      SELECT ISNULL(MAX(sth_evrakno_sira), 0) + 1 as next_sira
      FROM STOK_HAREKETLERI
      WHERE sth_evrakno_seri = '${deliverySeries.replace(/'/g, "''")}'
    `);
    const deliverySequence = Number((nextRows as any[])?.[0]?.next_sira || 0);
    if (!Number.isFinite(deliverySequence) || deliverySequence <= 0) {
      throw new Error('Irsaliye sira numarasi alinamadi');
    }

    const sthColumns = await this.getTableColumns('STOK_HAREKETLERI');
    const sipColumns = await this.getTableColumns('SIPARISLER');
    const belgeNoColumn = sipColumns.has('sip_belge_no') ? 'sip_belge_no' : sipColumns.has('sip_belgeno') ? 'sip_belgeno' : null;
    const hasBelgeTarih = sipColumns.has('sip_belge_tarih');
    const zeroGuid = '00000000-0000-0000-0000-000000000000';
    const mikroUserNoRaw = Number(process.env.MIKRO_USER_NO || process.env.MIKRO_USERNO || 1);
    const mikroUserNo = Number.isFinite(mikroUserNoRaw) && mikroUserNoRaw > 0 ? Math.trunc(mikroUserNoRaw) : 1;
    const defaultSorMerkez = String(process.env.MIKRO_SORMERK || 'HENDEK').trim().slice(0, 25);
    const docGuid = randomUUID();
    const deliveryNoteNo = `${deliverySeries}-${deliverySequence}`;

    for (let index = 0; index < params.lines.length; index += 1) {
      const line = params.lines[index];
      const safeProductCode = normalizeCode(line.productCode);
      const rowFilter =
        line.rowNumber !== null && Number.isFinite(Number(line.rowNumber))
          ? ` AND sip_satirno = ${Number(line.rowNumber)}`
          : '';

      const sipRows = await mikroService.executeQuery(`
        SELECT TOP 1
          sip_Guid as sip_guid,
          sip_stok_kod as stok_kod,
          ISNULL(sip_b_fiyat, 0) as unit_price,
          ISNULL(sip_vergi_pntr, 0) as vat_code,
          ISNULL(sip_vergi, 0) as vat_amount,
          ISNULL(sip_tutar, 0) as line_total,
          ISNULL(sip_depono, 1) as depo_no,
          ISNULL(sip_stok_sormerk, '') as stok_sormerk,
          ISNULL(sip_cari_sormerk, '') as cari_sormerk,
          ISNULL(sip_projekodu, '') as proje_kodu
        FROM SIPARISLER
        WHERE sip_evrakno_seri = '${params.orderSeries.replace(/'/g, "''")}'
          AND sip_evrakno_sira = ${params.orderSequence}
          AND sip_stok_kod = '${safeProductCode.replace(/'/g, "''")}'
          ${rowFilter}
          AND ISNULL(sip_iptal, 0) = 0
      `);
      const sipRow = (sipRows as any[])[0];
      if (!sipRow) {
        throw new Error(`Siparis satiri bulunamadi: ${safeProductCode}`);
      }

      const unitPrice = Math.max(toNumber(sipRow.unit_price), 0);
      let vatCode = Math.max(Math.trunc(toNumber(sipRow.vat_code)), 0);
      let vatRate = this.vatCodeToRate(vatCode);
      const sipVatAmount = Math.max(toNumber(sipRow.vat_amount), 0);
      const sipLineTotal = Math.max(toNumber(sipRow.line_total), 0);
      if (vatRate <= 0 && sipVatAmount > 0 && sipLineTotal > 0) {
        const derivedRate = sipVatAmount / sipLineTotal;
        if (Number.isFinite(derivedRate) && derivedRate > 0) {
          vatRate = derivedRate;
          vatCode = this.vatRateToCode(derivedRate);
        }
      }
      if (vatRate <= 0) {
        try {
          const stockVatRows = await mikroService.executeQuery(`
            SELECT TOP 1 ISNULL(sto_toptan_vergi, 0) as stock_vat_code
            FROM STOKLAR
            WHERE sto_kod = '${safeProductCode.replace(/'/g, "''")}'
          `);
          const stockVatCode = Math.max(Math.trunc(toNumber((stockVatRows as any[])?.[0]?.stock_vat_code)), 0);
          if (stockVatCode > 0) {
            vatCode = stockVatCode;
            vatRate = this.vatCodeToRate(vatCode);
          }
        } catch (error) {
          console.warn('Stok vergi kodu fallback okunamadi:', { productCode: safeProductCode, error });
        }
      }
      const lineTotal = Math.max(unitPrice * line.deliverQty, 0);
      const vatAmount = Math.max(lineTotal * vatRate, 0);
      const depoNo = Math.max(Math.trunc(toNumber(sipRow.depo_no || 1)), 1);
      const sipGuid = normalizeCode(sipRow.sip_guid) || zeroGuid;
      const stokSormerk = normalizeCode(sipRow.stok_sormerk) || defaultSorMerkez;
      const cariSormerk = normalizeCode(sipRow.cari_sormerk) || stokSormerk;
      const projeKodu = normalizeCode(sipRow.proje_kodu) || '';

      const rowGuid = randomUUID();
      const values: Record<string, unknown> = {
        sth_Guid: this.raw(`CAST('${rowGuid}' as uniqueidentifier)`),
        sth_DBCno: toNumber(templateRow.sth_DBCno) || 0,
        sth_SpecRECno: toNumber(templateRow.sth_SpecRECno) || 0,
        sth_iptal: 0,
        sth_fileid: Math.max(Math.trunc(toNumber(templateRow.sth_fileid)), 0),
        sth_hidden: toNumber(templateRow.sth_hidden) ? 1 : 0,
        sth_kilitli: toNumber(templateRow.sth_kilitli) ? 1 : 0,
        sth_degisti: 0,
        sth_checksum: toNumber(templateRow.sth_checksum) || 0,
        sth_create_user: Math.max(Math.trunc(toNumber(templateRow.sth_create_user)), mikroUserNo),
        sth_create_date: this.raw('GETDATE()'),
        sth_lastup_user: Math.max(Math.trunc(toNumber(templateRow.sth_lastup_user)), mikroUserNo),
        sth_lastup_date: this.raw('GETDATE()'),
        sth_special1: normalizeCode(templateRow.sth_special1 || ''),
        sth_special2: normalizeCode(templateRow.sth_special2 || ''),
        sth_special3: normalizeCode(templateRow.sth_special3 || ''),
        sth_firmano: toNumber(templateRow.sth_firmano) || 0,
        sth_subeno: toNumber(templateRow.sth_subeno) || 0,
        sth_tarih: this.raw('GETDATE()'),
        sth_tip: Math.max(Math.trunc(toNumber(templateRow.sth_tip)), 0),
        sth_cins: Math.max(Math.trunc(toNumber(templateRow.sth_cins)), 0),
        sth_normal_iade: Math.max(Math.trunc(toNumber(templateRow.sth_normal_iade)), 0),
        sth_evraktip: templateDocType,
        sth_evrakno_seri: deliverySeries,
        sth_evrakno_sira: deliverySequence,
        sth_satirno: index,
        sth_belge_no: deliveryNoteNo,
        sth_belge_tarih: this.raw('GETDATE()'),
        sth_stok_kod: safeProductCode,
        sth_miktar: line.deliverQty,
        sth_miktar2: 0,
        sth_birim_pntr: Math.max(Math.trunc(toNumber(templateRow.sth_birim_pntr)), 1),
        sth_cari_kodu: params.customerCode,
        sth_cari_cinsi: Math.max(Math.trunc(toNumber(templateRow.sth_cari_cinsi)), 0),
        sth_cari_grup_no: Math.max(Math.trunc(toNumber(templateRow.sth_cari_grup_no)), 0),
        sth_plasiyer_kodu: normalizeCode(templateRow.sth_plasiyer_kodu || ''),
        sth_har_doviz_cinsi: Math.max(Math.trunc(toNumber(templateRow.sth_har_doviz_cinsi)), 0),
        sth_har_doviz_kuru: toNumber(templateRow.sth_har_doviz_kuru) || 1,
        sth_alt_doviz_kuru: toNumber(templateRow.sth_alt_doviz_kuru) || 1,
        sth_stok_doviz_cinsi: Math.max(Math.trunc(toNumber(templateRow.sth_stok_doviz_cinsi)), 0),
        sth_stok_doviz_kuru: toNumber(templateRow.sth_stok_doviz_kuru) || 1,
        sth_iskonto1: 0,
        sth_iskonto2: 0,
        sth_iskonto3: 0,
        sth_iskonto4: 0,
        sth_iskonto5: 0,
        sth_iskonto6: 0,
        sth_masraf1: 0,
        sth_masraf2: 0,
        sth_masraf3: 0,
        sth_masraf4: 0,
        sth_tutar: lineTotal,
        sth_vergi: vatAmount,
        sth_vergi_pntr: vatCode,
        sth_masraf_vergi_pntr: Math.max(Math.trunc(toNumber(templateRow.sth_masraf_vergi_pntr)), 0),
        sth_masraf_vergi: 0,
        sth_odeme_op: Math.max(Math.trunc(toNumber(templateRow.sth_odeme_op)), 1),
        sth_adres_no: Math.max(Math.trunc(toNumber(templateRow.sth_adres_no)), 1),
        sth_giris_depo_no: depoNo,
        sth_cikis_depo_no: depoNo,
        sth_malkbl_sevk_tarihi: this.raw('GETDATE()'),
        sth_cari_srm_merkezi: cariSormerk,
        sth_stok_srm_merkezi: stokSormerk,
        sth_fis_tarihi: this.raw(`CAST('1899-12-30' as datetime)`),
        sth_fis_sirano: Math.max(Math.trunc(toNumber(templateRow.sth_fis_sirano)), 0),
        sth_vergisiz_fl: vatCode > 0 ? 0 : 1,
        sth_proje_kodu: projeKodu,
        sth_otv_pntr: Math.max(Math.trunc(toNumber(templateRow.sth_otv_pntr)), 0),
        sth_otv_vergi: 0,
        sth_otvtutari: 0,
        sth_oiv_pntr: Math.max(Math.trunc(toNumber(templateRow.sth_oiv_pntr)), 0),
        sth_oiv_vergi: 0,
        sth_oivtutari: 0,
        sth_fiyat_liste_no: Math.max(Math.trunc(toNumber(templateRow.sth_fiyat_liste_no)), 0),
        sth_Tevkifat_turu: Math.max(Math.trunc(toNumber(templateRow.sth_Tevkifat_turu)), 0),
        sth_nakliyedeposu: Math.max(Math.trunc(toNumber(templateRow.sth_nakliyedeposu)), 0),
        sth_nakliyedurumu: Math.max(Math.trunc(toNumber(templateRow.sth_nakliyedurumu)), 0),
        sth_sip_uid: this.raw(`CAST('${sipGuid}' as uniqueidentifier)`),
        sth_fat_uid: this.raw(`CAST('${zeroGuid}' as uniqueidentifier)`),
        sth_har_uid: this.raw(`CAST('${zeroGuid}' as uniqueidentifier)`),
        sth_evrakuid: this.raw(`CAST('${docGuid}' as uniqueidentifier)`),
        sth_irs_tes_uid: this.raw(`CAST('${zeroGuid}' as uniqueidentifier)`),
        sth_kons_uid: this.raw(`CAST('${zeroGuid}' as uniqueidentifier)`),
        sth_yetkili_uid: this.raw(`CAST('${zeroGuid}' as uniqueidentifier)`),
        sth_eirs_senaryo: Math.max(Math.trunc(toNumber(templateRow.sth_eirs_senaryo)), 0),
        sth_eirs_tipi: Math.max(Math.trunc(toNumber(templateRow.sth_eirs_tipi)), 0),
        sth_teslim_tarihi: this.raw('GETDATE()'),
        sth_matbu_fl: toNumber(templateRow.sth_matbu_fl) ? 1 : 0,
        sth_satis_fiyat_doviz_cinsi: Math.max(Math.trunc(toNumber(templateRow.sth_satis_fiyat_doviz_cinsi)), 0),
        sth_satis_fiyat_doviz_kuru: toNumber(templateRow.sth_satis_fiyat_doviz_kuru) || 0,
        sth_tevkifat_sifirlandi_fl: toNumber(templateRow.sth_tevkifat_sifirlandi_fl) ? 1 : 0,
      };

      const insertSql = this.buildInsertSql('STOK_HAREKETLERI', values, sthColumns);
      await mikroService.executeQuery(insertSql);
    }

    const setBelgeNo = belgeNoColumn ? `${belgeNoColumn} = '${deliveryNoteNo.replace(/'/g, "''")}',` : '';
    const setBelgeTarih = hasBelgeTarih ? 'sip_belge_tarih = GETDATE(),' : '';
    await mikroService.executeQuery(`
      UPDATE SIPARISLER
      SET
        ${setBelgeNo}
        ${setBelgeTarih}
        sip_lastup_date = GETDATE()
      WHERE sip_evrakno_seri = '${params.orderSeries.replace(/'/g, "''")}'
        AND sip_evrakno_sira = ${params.orderSequence}
        AND ISNULL(sip_iptal, 0) = 0
    `);

    return {
      deliveryNoteNo,
      deliverySequence,
    };
  }

  async dispatchOrderWithDeliveryNote(
    mikroOrderNumber: string,
    payload: {
      deliverySeries: string;
      userId?: string;
    }
  ) {
    const orderNo = normalizeCode(mikroOrderNumber);
    if (!orderNo) {
      throw new Error('Siparis numarasi gerekli');
    }

    const deliverySeries = normalizeCode(payload.deliverySeries);
    if (!deliverySeries) {
      throw new Error('Irsaliye serisi gerekli');
    }

    const parsedOrder = parseMikroOrderNumber(orderNo);
    if (!parsedOrder) {
      throw new Error('Gecersiz siparis numarasi');
    }

    const pendingOrder = await prisma.pendingMikroOrder.findUnique({
      where: { mikroOrderNumber: orderNo },
      select: {
        mikroOrderNumber: true,
        orderSeries: true,
        orderSequence: true,
        customerCode: true,
        customerName: true,
        items: true,
      },
    });

    if (!pendingOrder) {
      throw new Error('Bekleyen siparis bulunamadi');
    }

    const workflow = await this.upsertWorkflowFromPendingOrder(pendingOrder);
    if (!workflow.startedAt || workflow.status === 'PENDING') {
      throw new Error('Toplama baslatilmadan irsaliyelestirme yapilamaz');
    }
    const workflowItems = await prisma.warehouseOrderWorkflowItem.findMany({
      where: { workflowId: workflow.id },
      select: {
        id: true,
        rowNumber: true,
        lineKey: true,
        productCode: true,
        unit: true,
        remainingQty: true,
        pickedQty: true,
        deliveredQty: true,
        extraQty: true,
      },
    });

    const linesToDispatch = workflowItems
      .map((item) => {
        const remainingQty = Math.max(toNumber(item.remainingQty), 0);
        const pickedQty = Math.max(toNumber(item.pickedQty), 0);
        const deliverQty = Math.min(remainingQty, pickedQty);
        return {
          ...item,
          deliverQty,
        };
      })
      .filter((item) => item.deliverQty > 0);

    if (linesToDispatch.length === 0) {
      throw new Error('Irsaliyelestirme icin toplanan miktar bulunamadi');
    }

    const createdDelivery = await this.createMikroDeliveryNote({
      orderNo,
      orderSeries: parsedOrder.series,
      orderSequence: parsedOrder.sequence,
      customerCode: pendingOrder.customerCode,
      deliverySeries,
      lines: linesToDispatch.map((line) => ({
        rowNumber: Number.isFinite(Number(line.rowNumber)) ? Number(line.rowNumber) : null,
        productCode: line.productCode,
        deliverQty: line.deliverQty,
      })),
    });
    const deliveryNoteNo = createdDelivery.deliveryNoteNo;

    await Promise.all(
      linesToDispatch.map((line) => {
        const safeProductCode = normalizeCode(line.productCode).replace(/'/g, "''");
        const rowClause = Number.isFinite(Number(line.rowNumber))
          ? ` AND sip_satirno = ${Number(line.rowNumber)}`
          : '';

        const sqlQuery = `
          UPDATE SIPARISLER
          SET
            sip_teslim_miktar = CASE
              WHEN ISNULL(sip_teslim_miktar, 0) + ${line.deliverQty} > ISNULL(sip_miktar, 0) THEN ISNULL(sip_miktar, 0)
              ELSE ISNULL(sip_teslim_miktar, 0) + ${line.deliverQty}
            END,
            sip_rezerveden_teslim_edilen = CASE
              WHEN ISNULL(sip_rezervasyon_miktari, 0) <= 0 THEN ISNULL(sip_rezerveden_teslim_edilen, 0)
              WHEN ISNULL(sip_rezerveden_teslim_edilen, 0) + ${line.deliverQty} > ISNULL(sip_rezervasyon_miktari, 0)
                THEN ISNULL(sip_rezervasyon_miktari, 0)
              ELSE ISNULL(sip_rezerveden_teslim_edilen, 0) + ${line.deliverQty}
            END,
            sip_kapat_fl = CASE
              WHEN CASE
                WHEN ISNULL(sip_teslim_miktar, 0) + ${line.deliverQty} > ISNULL(sip_miktar, 0) THEN ISNULL(sip_miktar, 0)
                ELSE ISNULL(sip_teslim_miktar, 0) + ${line.deliverQty}
              END >= ISNULL(sip_miktar, 0)
                THEN 1
              ELSE ISNULL(sip_kapat_fl, 0)
            END,
            sip_lastup_date = GETDATE()
          WHERE sip_evrakno_seri = '${parsedOrder.series.replace(/'/g, "''")}'
            AND sip_evrakno_sira = ${parsedOrder.sequence}
            AND sip_stok_kod = '${safeProductCode}'
            ${rowClause}
            AND ISNULL(sip_iptal, 0) = 0
        `;
        return mikroService.executeQuery(sqlQuery);
      })
    );

    await mikroService.executeQuery(`
      UPDATE SIPARISLER
      SET sip_kapat_fl = CASE
        WHEN ISNULL(sip_miktar, 0) <= ISNULL(sip_teslim_miktar, 0) THEN 1
        ELSE ISNULL(sip_kapat_fl, 0)
      END
      WHERE sip_evrakno_seri = '${parsedOrder.series.replace(/'/g, "''")}'
        AND sip_evrakno_sira = ${parsedOrder.sequence}
        AND ISNULL(sip_iptal, 0) = 0
    `);

    const now = new Date();
    const lineUpdates = linesToDispatch.map((line) => {
      const nextDelivered = Math.max(toNumber(line.deliveredQty), 0) + line.deliverQty;
      const nextRemaining = Math.max(toNumber(line.remainingQty) - line.deliverQty, 0);
      const nextPicked = Math.max(toNumber(line.pickedQty) - line.deliverQty, 0);
      const nextShortage = Math.max(nextRemaining - nextPicked, 0);
      return {
        id: line.id,
        nextDelivered,
        nextRemaining,
        nextPicked,
        nextShortage,
        extraQty: Math.max(toNumber(line.extraQty), 0),
      };
    });
    const hasRemainingAfterDispatch = lineUpdates.some((line) => line.nextRemaining > 0);
    const nextWorkflowStatus: WorkflowStatus = hasRemainingAfterDispatch ? 'PARTIALLY_LOADED' : 'DISPATCHED';

    await prisma.$transaction([
      ...lineUpdates.map((line) => {
        return prisma.warehouseOrderWorkflowItem.update({
          where: { id: line.id },
          data: {
            deliveredQty: line.nextDelivered,
            remainingQty: line.nextRemaining,
            pickedQty: line.nextPicked,
            shortageQty: line.nextShortage,
            status: toItemStatus(line.nextPicked, line.extraQty, line.nextShortage, line.nextRemaining),
          },
        });
      }),
      prisma.warehouseOrderWorkflow.update({
        where: { id: workflow.id },
        data: {
          status: nextWorkflowStatus,
          loadedAt: workflow.loadedAt || now,
          dispatchedAt: now,
          dispatchedByUserId: normalizeCode(payload.userId) || null,
          mikroDeliveryNoteNo: deliveryNoteNo,
          lastActionAt: now,
        },
      }),
    ]);

    return this.getOrderDetail(orderNo, false);
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
