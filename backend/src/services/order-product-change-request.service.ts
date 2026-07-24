import { prisma } from '../utils/prisma';
import mikroService from './mikroFactory.service';
import notificationService from './notification.service';
import { AppError, ErrorCode } from '../types/errors';
import { config } from '../config';

type ActorContext = {
  userId?: string | null;
  role?: string | null;
};

type CreateRedirectRequestInput = {
  sourceProductCode: string;
  targetProductCode: string;
  depot?: string | null;
  familyId?: string | null;
  familyCode?: string | null;
  familyName?: string | null;
  note?: string | null;
  requestedById?: string | null;
};

type StockSnapshot = {
  merkez: number;
  topca: number;
  hot: number;
  total: number;
};

type ProductSnapshot = {
  productCode: string;
  productName: string | null;
  currentCost: number | null;
  lastEntryCost: number | null;
  vatRate: number | null;
  productId: string | null;
  stock: StockSnapshot | null;
};

const STAFF_ROLES = new Set(['HEAD_ADMIN', 'ADMIN', 'MANAGER', 'SALES_REP']);

const normalizeCode = (value: unknown) => String(value || '').trim().toUpperCase();
const escapeSql = (value: unknown) => String(value || '').replace(/'/g, "''");
const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const marginPercent = (unitPrice: number, cost?: number | null): number | null => {
  const price = Number(unitPrice);
  const base = Number(cost || 0);
  if (!Number.isFinite(price) || !Number.isFinite(base) || price <= 0 || base <= 0) return null;
  return ((price - base) / base) * 100;
};
const createStockSnapshot = (merkez: unknown, topca: unknown, hot: unknown): StockSnapshot => {
  const normalized = {
    merkez: toNumber(merkez),
    topca: toNumber(topca),
    hot: toNumber(hot),
  };
  return {
    ...normalized,
    total: normalized.merkez + normalized.topca + normalized.hot,
  };
};
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requestLineKey = (request: {
  orderSeries?: unknown;
  orderSequence?: unknown;
  orderLineNo?: unknown;
}) =>
  `${String(request.orderSeries || '').trim().toUpperCase()}|${Math.trunc(toNumber(request.orderSequence))}|${Math.trunc(toNumber(request.orderLineNo))}`;

class OrderProductChangeRequestService {
  private liveValidationCache = new Map<
    string,
    { expiresAt: number; actionableIds: Set<string>; liveValidationAvailable: boolean }
  >();
  private lastKnownLiveActionability = new Map<
    string,
    { updatedAtMs: number; actionable: boolean; checkedAt: number }
  >();

  private async getProductSnapshots(codesInput: string[]) {
    const codes = Array.from(new Set(codesInput.map(normalizeCode).filter(Boolean)));
    const map = new Map<string, ProductSnapshot>();
    if (codes.length === 0) return map;

    const localProducts = await prisma.product.findMany({
      where: { mikroCode: { in: codes } },
      select: {
        id: true,
        mikroCode: true,
        name: true,
        currentCost: true,
        lastEntryPrice: true,
        vatRate: true,
      },
    });

    localProducts.forEach((product) => {
      const code = normalizeCode(product.mikroCode);
      if (!code) return;
      map.set(code, {
        productCode: code,
        productName: product.name || null,
        currentCost: Number.isFinite(Number(product.currentCost)) ? Number(product.currentCost) : null,
        lastEntryCost: Number.isFinite(Number(product.lastEntryPrice)) ? Number(product.lastEntryPrice) : null,
        vatRate: Number.isFinite(Number(product.vatRate)) ? Number(product.vatRate) : null,
        productId: product.id,
        // Yerel senkron stok, "bu anda canli Mikro stogu" gibi kaydedilmez.
        stock: null,
      });
    });

    try {
      const inClause = codes.map((code) => `'${escapeSql(code)}'`).join(',');
      const mikroRows = await mikroService.executeQuery(`
        SELECT
          sto_kod AS productCode,
          LTRIM(RTRIM(ISNULL(sto_isim, ''))) AS productName,
          ISNULL(sto_standartmaliyet, 0) AS currentCost,
          dbo.fn_VergiYuzde(ISNULL(sto_toptan_vergi, 0)) AS vatPercent,
          CAST(ISNULL(dbo.fn_DepodakiMiktar(sto_kod, 1, 0), 0) AS float) AS stockMerkez,
          CAST(ISNULL(dbo.fn_DepodakiMiktar(sto_kod, 6, 0), 0) AS float) AS stockTopca,
          CAST(ISNULL(dbo.fn_DepodakiMiktar(sto_kod, 11, 0), 0) AS float) AS stockHot,
          (
            SELECT TOP 1
              dbo.fn_StokHareketNetDeger(
                sth_tutar,
                sth_iskonto1,
                sth_iskonto2,
                sth_iskonto3,
                sth_iskonto4,
                sth_iskonto5,
                sth_iskonto6,
                sth_masraf1,
                sth_masraf2,
                sth_masraf3,
                sth_masraf4,
                sth_otvtutari,
                sth_tip,
                0,
                0,
                sth_har_doviz_kuru,
                sth_alt_doviz_kuru,
                sth_stok_doviz_kuru
              ) / NULLIF(sth_miktar, 0)
            FROM STOK_HAREKETLERI WITH (NOLOCK)
            WHERE sth_stok_kod = sto_kod
              AND sth_tip = 0
              AND sth_evraktip IN (3, 13)
              AND sth_cins IN (0, 1)
              AND ISNULL(sth_normal_iade, 0) = 0
              AND sth_fat_uid != '00000000-0000-0000-0000-000000000000'
            ORDER BY sth_tarih DESC
          ) AS lastEntryCost
        FROM STOKLAR WITH (NOLOCK)
        WHERE sto_kod IN (${inClause})
      `);

      (mikroRows || []).forEach((row: any) => {
        const code = normalizeCode(row?.productCode);
        if (!code) return;
        const existing = map.get(code);
        const vatPercent = toNumber(row?.vatPercent);
        map.set(code, {
          productCode: code,
          productName: String(row?.productName || existing?.productName || code).trim(),
          currentCost: toNumber(row?.currentCost) || existing?.currentCost || null,
          lastEntryCost: toNumber(row?.lastEntryCost) || existing?.lastEntryCost || null,
          vatRate: vatPercent > 1 ? vatPercent / 100 : vatPercent || existing?.vatRate || null,
          productId: existing?.productId || null,
          stock: createStockSnapshot(row?.stockMerkez, row?.stockTopca, row?.stockHot),
        });
      });
    } catch (error) {
      console.warn('WARN: order product change cost snapshot fallback failed', error);
    }

    codes.forEach((code) => {
      if (map.has(code)) return;
      map.set(code, {
        productCode: code,
        productName: code,
        currentCost: null,
        lastEntryCost: null,
        vatRate: null,
        productId: null,
        stock: null,
      });
    });

    return map;
  }

  private async getOpenOrderLines(productCodeInput: string) {
    const productCode = normalizeCode(productCodeInput);
    if (!productCode) throw new AppError('Kaynak stok kodu zorunludur.', 400, ErrorCode.BAD_REQUEST);

    const rows = await mikroService.executeQuery(`
      SELECT TOP 750
        CONVERT(varchar(36), s.sip_Guid) AS lineGuid,
        LTRIM(RTRIM(ISNULL(s.sip_musteri_kod, ''))) AS customerCode,
        LTRIM(RTRIM(ISNULL(c.cari_unvan1, ''))) AS customerName,
        LTRIM(RTRIM(ISNULL(c.cari_sektor_kodu, ''))) AS sectorCode,
        LTRIM(RTRIM(ISNULL(s.sip_evrakno_seri, ''))) AS orderSeries,
        CAST(ISNULL(s.sip_evrakno_sira, 0) AS int) AS orderSequence,
        CAST(ISNULL(s.sip_satirno, 0) AS int) AS orderLineNo,
        s.sip_tarih AS orderDate,
        CAST(ISNULL(s.sip_miktar, 0) AS float) AS quantity,
        CAST(ISNULL(s.sip_teslim_miktar, 0) AS float) AS deliveredQuantity,
        CAST(ISNULL(s.sip_b_fiyat, 0) AS float) AS unitPrice,
        dbo.fn_VergiYuzde(ISNULL(s.sip_vergi_pntr, 0)) AS vatPercent
      FROM SIPARISLER s WITH (NOLOCK)
      LEFT JOIN CARI_HESAPLAR c WITH (NOLOCK)
        ON c.cari_kod = s.sip_musteri_kod
      WHERE s.sip_tip = 0
        AND ISNULL(s.sip_kapat_fl, 0) = 0
        AND ISNULL(s.sip_iptal, 0) = 0
        AND LTRIM(RTRIM(ISNULL(s.sip_stok_kod, ''))) = '${escapeSql(productCode)}'
        AND ISNULL(s.sip_miktar, 0) > ISNULL(s.sip_teslim_miktar, 0)
      ORDER BY s.sip_tarih DESC, s.sip_evrakno_sira DESC, s.sip_satirno ASC
    `);

    return (rows || [])
      .map((row: any) => {
        const quantity = Math.max(0, toNumber(row?.quantity));
        const deliveredQuantity = Math.max(0, toNumber(row?.deliveredQuantity));
        const remainingQuantity = Math.max(0, quantity - deliveredQuantity);
        const orderSeries = String(row?.orderSeries || '').trim().toUpperCase();
        const orderSequence = Math.trunc(toNumber(row?.orderSequence));
        const orderLineNo = Math.trunc(toNumber(row?.orderLineNo));
        const vatPercent = toNumber(row?.vatPercent);
        return {
          lineGuid: String(row?.lineGuid || '').trim(),
          customerCode: normalizeCode(row?.customerCode),
          customerName: String(row?.customerName || '').trim(),
          sectorCode: String(row?.sectorCode || '').trim(),
          orderSeries,
          orderSequence,
          orderLineNo,
          orderNumber: `${orderSeries}-${orderSequence}`,
          orderDate: toDate(row?.orderDate),
          quantity,
          deliveredQuantity,
          remainingQuantity,
          unitPrice: toNumber(row?.unitPrice),
          vatRate: vatPercent > 1 ? vatPercent / 100 : vatPercent,
        };
      })
      .filter((row) => row.orderSeries && row.orderSequence > 0 && row.remainingQuantity > 0);
  }

  private async findLocalOrder(orderNumber: string, productCode: string) {
    return prisma.order.findFirst({
      where: {
        OR: [
          { mikroOrderIds: { has: orderNumber } },
          { items: { some: { mikroOrderId: orderNumber, mikroCode: productCode } } },
        ],
      },
      include: {
        requestedBy: { select: { id: true, role: true, active: true } },
        user: { select: { id: true, role: true, sectorCode: true, mikroCariCode: true } },
      },
    });
  }

  private async resolveAssignee(input: { orderNumber: string; productCode: string; customerCode?: string; sectorCode?: string | null }) {
    const localOrder = await this.findLocalOrder(input.orderNumber, input.productCode);
    if (localOrder?.requestedBy?.role === 'SALES_REP' && localOrder.requestedBy.active) {
      return { assignedToId: localOrder.requestedBy.id, localOrder };
    }
    const fallbackStaffId =
      localOrder?.requestedBy && STAFF_ROLES.has(String(localOrder.requestedBy.role)) && localOrder.requestedBy.active
        ? localOrder.requestedBy.id
        : null;

    const customer =
      localOrder?.user ||
      (input.customerCode
        ? await prisma.user.findFirst({
            where: { mikroCariCode: input.customerCode, role: 'CUSTOMER' as any },
            select: { id: true, role: true, sectorCode: true, mikroCariCode: true },
          })
        : null);
    const sectorCode = String(customer?.sectorCode || input.sectorCode || '').trim();
    if (sectorCode) {
      const salesRep = await prisma.user.findFirst({
        where: {
          role: 'SALES_REP' as any,
          active: true,
          assignedSectorCodes: { has: sectorCode },
        },
        select: { id: true },
      });
      if (salesRep?.id) return { assignedToId: salesRep.id, localOrder };
    }

    return { assignedToId: fallbackStaffId, localOrder };
  }

  private async adminRecipients() {
    const admins = await prisma.user.findMany({
      where: { role: { in: ['HEAD_ADMIN', 'ADMIN'] as any[] }, active: true },
      select: { id: true },
    });
    return admins.map((user) => user.id);
  }

  async createFromUcarerRedirect(input: CreateRedirectRequestInput) {
    const sourceProductCode = normalizeCode(input.sourceProductCode);
    const targetProductCode = normalizeCode(input.targetProductCode);
    if (!sourceProductCode || !targetProductCode) {
      throw new AppError('Kaynak ve hedef stok kodu zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }
    if (sourceProductCode === targetProductCode) {
      throw new AppError('Kaynak ve hedef stok ayni olamaz.', 400, ErrorCode.BAD_REQUEST);
    }

    const [orderLines, productSnapshots] = await Promise.all([
      this.getOpenOrderLines(sourceProductCode),
      this.getProductSnapshots([sourceProductCode, targetProductCode]),
    ]);

    if (orderLines.length === 0) {
      throw new AppError('Bu stok icin acik musteri siparisi bulunamadi.', 404, ErrorCode.NOT_FOUND);
    }

    const sourceProduct = productSnapshots.get(sourceProductCode);
    const targetProduct = productSnapshots.get(targetProductCode);
    const created: any[] = [];
    const skippedDuplicates: string[] = [];
    const unassigned: string[] = [];

    for (const line of orderLines) {
      const existing = await prisma.orderProductChangeRequest.findFirst({
        where: {
          status: 'PENDING',
          orderNumber: line.orderNumber,
          orderLineNo: line.orderLineNo,
          sourceProductCode,
          targetProductCode,
        },
        select: { id: true },
      });
      if (existing) {
        skippedDuplicates.push(`${line.orderNumber}/${line.orderLineNo}`);
        continue;
      }

      const { assignedToId } = await this.resolveAssignee({
        orderNumber: line.orderNumber,
        productCode: sourceProductCode,
        customerCode: line.customerCode,
        sectorCode: line.sectorCode,
      });
      if (!assignedToId) unassigned.push(`${line.orderNumber}/${line.orderLineNo}`);

      const request = await prisma.orderProductChangeRequest.create({
        data: {
          status: 'PENDING',
          source: 'UCARER_DEPOT',
          depot: input.depot || null,
          orderNumber: line.orderNumber,
          orderSeries: line.orderSeries,
          orderSequence: line.orderSequence,
          orderLineNo: line.orderLineNo,
          mikroLineGuid: line.lineGuid || null,
          orderDate: line.orderDate,
          customerCode: line.customerCode || null,
          customerName: line.customerName || line.customerCode || null,
          sourceProductCode,
          sourceProductName: sourceProduct?.productName || sourceProductCode,
          targetProductCode,
          targetProductName: targetProduct?.productName || targetProductCode,
          quantity: line.quantity,
          remainingQuantity: line.remainingQuantity,
          unitPrice: line.unitPrice,
          vatRate: line.vatRate,
          sourceCurrentCost: sourceProduct?.currentCost ?? null,
          sourceLastEntryCost: sourceProduct?.lastEntryCost ?? null,
          sourceCurrentMarginPercent: marginPercent(line.unitPrice, sourceProduct?.currentCost),
          sourceLastEntryMarginPercent: marginPercent(line.unitPrice, sourceProduct?.lastEntryCost),
          targetCurrentCost: targetProduct?.currentCost ?? null,
          targetLastEntryCost: targetProduct?.lastEntryCost ?? null,
          targetCurrentMarginPercent: marginPercent(line.unitPrice, targetProduct?.currentCost),
          targetLastEntryMarginPercent: marginPercent(line.unitPrice, targetProduct?.lastEntryCost),
          stockSnapshotAt: new Date(),
          sourceStockAtCreation: sourceProduct?.stock ?? undefined,
          targetStockAtCreation: targetProduct?.stock ?? undefined,
          familyId: input.familyId || null,
          familyCode: input.familyCode || null,
          familyName: input.familyName || null,
          note: input.note || null,
          requestedById: input.requestedById || null,
          assignedToId,
        },
      });
      created.push(request);
    }

    const assignedRecipients = Array.from(new Set(created.map((row) => row.assignedToId).filter(Boolean))) as string[];
    const adminRecipients = unassigned.length > 0 || assignedRecipients.length === 0 ? await this.adminRecipients() : [];
    await notificationService.createForUsers(assignedRecipients.length > 0 ? assignedRecipients : adminRecipients, {
      category: 'ORDER',
      title: 'Onaylanacak urun siparis degisimi',
      body: `${sourceProductCode} yerine ${targetProductCode} icin ${created.length} siparis satiri onay bekliyor.`,
      linkUrl: '/dashboard',
    });
    if (unassigned.length > 0 && assignedRecipients.length > 0) {
      await notificationService.createForUsers(adminRecipients, {
        category: 'ORDER',
        title: 'Satis kullanicisi bulunamayan urun degisimleri',
        body: `${sourceProductCode} -> ${targetProductCode} icin ${unassigned.length} satir yonetici kontrolu bekliyor.`,
        linkUrl: '/dashboard',
      });
    }

    return {
      createdCount: created.length,
      skippedDuplicateCount: skippedDuplicates.length,
      skippedDuplicates,
      unassigned,
      requests: created,
    };
  }

  private async resolveActionablePendingRequests(requests: any[]) {
    const allRequestIds = new Set(requests.map((request) => String(request.id)));
    if (requests.length === 0) {
      return { actionableIds: allRequestIds, liveValidationAvailable: true };
    }
    if (config.useMockMikro) {
      return { actionableIds: allRequestIds, liveValidationAvailable: false };
    }

    let signatureHash = 2166136261;
    requests.forEach((request) => {
      const signaturePart = `${request.id}:${toDate(request.updatedAt)?.getTime() || 0}|`;
      for (let index = 0; index < signaturePart.length; index += 1) {
        signatureHash ^= signaturePart.charCodeAt(index);
        signatureHash = Math.imul(signatureHash, 16777619);
      }
    });
    const cacheKey = `${requests.length}:${signatureHash >>> 0}`;
    const cached = this.liveValidationCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        actionableIds: new Set(cached.actionableIds),
        liveValidationAvailable: cached.liveValidationAvailable,
      };
    }

    try {
      const actionableIds = new Set<string>();
      const chunkSize = 100;
      for (let offset = 0; offset < requests.length; offset += chunkSize) {
        const chunk = requests.slice(offset, offset + chunkSize);
        const conditions = chunk
          .map((request) => {
            const guid = String(request.mikroLineGuid || '').trim();
            const customerCondition = request.customerCode
              ? ` AND LTRIM(RTRIM(ISNULL(s.sip_musteri_kod, ''))) = '${escapeSql(request.customerCode)}'`
              : '';
            if (GUID_PATTERN.test(guid)) {
              return `(s.sip_Guid = CONVERT(uniqueidentifier, '${guid}')${customerCondition})`;
            }
            const orderSeries = String(request.orderSeries || '').trim().toUpperCase();
            const orderSequence = Math.trunc(toNumber(request.orderSequence));
            const orderLineNo = Math.trunc(toNumber(request.orderLineNo));
            if (!orderSeries || orderSequence <= 0 || orderLineNo < 0) return '';
            return `(s.sip_evrakno_seri = '${escapeSql(orderSeries)}'
              AND s.sip_evrakno_sira = ${orderSequence}
              AND s.sip_satirno = ${orderLineNo}${customerCondition})`;
          })
          .filter(Boolean);
        if (conditions.length === 0) continue;

        const rows = await mikroService.executeQuery(`
          SELECT
            CONVERT(varchar(36), s.sip_Guid) AS lineGuid,
            LTRIM(RTRIM(ISNULL(s.sip_evrakno_seri, ''))) AS orderSeries,
            CAST(ISNULL(s.sip_evrakno_sira, 0) AS int) AS orderSequence,
            CAST(ISNULL(s.sip_satirno, 0) AS int) AS orderLineNo,
            LTRIM(RTRIM(ISNULL(s.sip_musteri_kod, ''))) AS customerCode,
            LTRIM(RTRIM(ISNULL(s.sip_stok_kod, ''))) AS productCode,
            CAST(ISNULL(s.sip_kapat_fl, 0) AS int) AS isClosed,
            CAST(ISNULL(s.sip_iptal, 0) AS int) AS isCancelled,
            CAST(ISNULL(s.sip_miktar, 0) AS float) AS quantity,
            CAST(ISNULL(s.sip_teslim_miktar, 0) AS float) AS deliveredQuantity
          FROM SIPARISLER s
          WHERE s.sip_tip = 0
            AND (${conditions.join('\nOR ')})
        `);

        const byGuid = new Map<string, any>();
        const byLine = new Map<string, any[]>();
        (rows || []).forEach((row: any) => {
          const guid = String(row?.lineGuid || '').trim().toLowerCase();
          if (guid) byGuid.set(guid, row);
          const lineKey = requestLineKey(row);
          byLine.set(lineKey, [...(byLine.get(lineKey) || []), row]);
        });

        chunk.forEach((request) => {
          const guid = String(request.mikroLineGuid || '').trim().toLowerCase();
          const lineCandidates = byLine.get(requestLineKey(request)) || [];
          const requestCustomerCode = normalizeCode(request.customerCode);
          const fallbackLine = requestCustomerCode
            ? lineCandidates.find((candidate) => normalizeCode(candidate.customerCode) === requestCustomerCode)
            : lineCandidates.length === 1
              ? lineCandidates[0]
              : undefined;
          const line = (guid ? byGuid.get(guid) : undefined) || fallbackLine;
          if (!line) return;
          const stillUsesSourceProduct =
            normalizeCode(line.productCode) === normalizeCode(request.sourceProductCode);
          const isOpen =
            toNumber(line.isClosed) === 0 &&
            toNumber(line.isCancelled) === 0 &&
            toNumber(line.quantity) > toNumber(line.deliveredQuantity);
          if (stillUsesSourceProduct && isOpen) actionableIds.add(String(request.id));
        });
      }
      const result = { actionableIds, liveValidationAvailable: true };
      const checkedAt = Date.now();
      requests.forEach((request) => {
        this.lastKnownLiveActionability.set(String(request.id), {
          updatedAtMs: toDate(request.updatedAt)?.getTime() || 0,
          actionable: actionableIds.has(String(request.id)),
          checkedAt,
        });
      });
      if (this.lastKnownLiveActionability.size > 10_000) {
        const entriesByAge = Array.from(this.lastKnownLiveActionability.entries())
          .sort((left, right) => right[1].checkedAt - left[1].checkedAt)
          .slice(0, 5_000);
        this.lastKnownLiveActionability = new Map(entriesByAge);
      }
      if (this.liveValidationCache.size > 100) this.liveValidationCache.clear();
      this.liveValidationCache.set(cacheKey, {
        expiresAt: Date.now() + 15_000,
        actionableIds: new Set(actionableIds),
        liveValidationAvailable: true,
      });
      return result;
    } catch (error) {
      // Mikro gecici olarak okunamiyorsa tum yerel PENDING kayitlari yeniden
      // gorunur yapilmaz. Yalnizca ayni kayit surumu icin son basarili
      // kontrolde actionable oldugu bilinenler stale uyarisiyla korunur.
      console.warn('WARN: pending order product change live validation failed', error);
      const lastKnownActionableIds = new Set(
        requests
          .filter((request) => {
            const known = this.lastKnownLiveActionability.get(String(request.id));
            return (
              known?.actionable === true &&
              known.updatedAtMs === (toDate(request.updatedAt)?.getTime() || 0)
            );
          })
          .map((request) => String(request.id))
      );
      this.liveValidationCache.set(cacheKey, {
        expiresAt: Date.now() + 5_000,
        actionableIds: new Set(lastKnownActionableIds),
        liveValidationAvailable: false,
      });
      return { actionableIds: lastKnownActionableIds, liveValidationAvailable: false };
    }
  }

  private async readMikroLineByGuid(request: any) {
    const guid = String(request.mikroLineGuid || '').trim();
    if (!GUID_PATTERN.test(guid)) return null;
    const customerCondition = request.customerCode
      ? `AND LTRIM(RTRIM(ISNULL(s.sip_musteri_kod, ''))) = '${escapeSql(request.customerCode)}'`
      : '';
    const rows = await mikroService.executeQuery(`
      SELECT TOP 1
        LTRIM(RTRIM(ISNULL(s.sip_stok_kod, ''))) AS productCode,
        CAST(ISNULL(s.sip_kapat_fl, 0) AS int) AS isClosed,
        CAST(ISNULL(s.sip_iptal, 0) AS int) AS isCancelled,
        CAST(ISNULL(s.sip_miktar, 0) AS float) AS quantity,
        CAST(ISNULL(s.sip_teslim_miktar, 0) AS float) AS deliveredQuantity
      FROM SIPARISLER s
      WHERE s.sip_tip = 0
        AND s.sip_Guid = CONVERT(uniqueidentifier, '${escapeSql(guid)}')
        ${customerCondition}
    `);
    return rows?.[0] || null;
  }

  private isMikroLineOpen(line: any) {
    return (
      line &&
      toNumber(line.isClosed) === 0 &&
      toNumber(line.isCancelled) === 0 &&
      toNumber(line.quantity) > toNumber(line.deliveredQuantity)
    );
  }

  private async recoverStaleProcessingRequests(assignmentWhere: Record<string, unknown>) {
    if (config.useMockMikro) return;
    const staleBefore = new Date(Date.now() - 5 * 60_000);
    const staleRequests = await prisma.orderProductChangeRequest.findMany({
      where: {
        status: { in: ['PROCESSING', 'FINALIZING', 'RECONCILING'] },
        updatedAt: { lt: staleBefore },
        ...assignmentWhere,
      },
      orderBy: { updatedAt: 'asc' },
      take: 25,
    });

    for (const request of staleRequests) {
      const lease = await prisma.orderProductChangeRequest.updateMany({
        where: {
          id: request.id,
          status: request.status,
          updatedAt: request.updatedAt,
        },
        data: { status: 'RECONCILING' },
      });
      if (lease.count !== 1) continue;

      if (!request.mikroLineGuid || !GUID_PATTERN.test(request.mikroLineGuid)) {
        await prisma.orderProductChangeRequest.updateMany({
          where: { id: request.id, status: 'RECONCILING' },
          data: {
            status: 'FAILED',
            failedReason: 'Kesintiye ugrayan islem guvenli GUID olmadigi icin otomatik uzlastirilamadi.',
          },
        });
        continue;
      }

      try {
        const line = await this.readMikroLineByGuid(request);
        const productCode = normalizeCode(line?.productCode);
        if (line && productCode === normalizeCode(request.targetProductCode)) {
          await this.updateLocalOrderItem(request);
          await prisma.orderProductChangeRequest.updateMany({
            where: { id: request.id, status: 'RECONCILING' },
            data: {
              status: 'APPROVED',
              appliedAt: new Date(),
              failedReason: null,
            },
          });
          continue;
        }

        if (
          line &&
          productCode === normalizeCode(request.sourceProductCode) &&
          this.isMikroLineOpen(line)
        ) {
          await prisma.orderProductChangeRequest.updateMany({
            where: { id: request.id, status: 'RECONCILING' },
            data: {
              status: 'PENDING',
              decidedById: null,
              decidedAt: null,
              appliedAt: null,
              failedReason: 'Kesintiye ugrayan islemde Mikro degisikligi bulunmadi; talep yeniden acildi.',
            },
          });
          continue;
        }

        await prisma.orderProductChangeRequest.updateMany({
          where: { id: request.id, status: 'RECONCILING' },
          data: {
            status: 'FAILED',
            failedReason: !line
              ? 'Kesintiye ugrayan islemin Mikro satiri artik bulunamadi.'
              : 'Kesintiye ugrayan islemde Mikro satiri kapali veya beklenmeyen bir urunde.',
          },
        });
      } catch (error) {
        // Mikro okunamiyorsa sonucu tahmin etmeyiz; RECONCILING lease'i sonraki
        // kontrollu read-back denemesine kadar oldugu gibi kalir.
        console.warn(`WARN: stale product change request ${request.id} could not be reconciled`, error);
      }
    }
  }

  async list(actor: ActorContext, options?: { status?: string; limit?: number }) {
    if (!actor.role || !['HEAD_ADMIN', 'ADMIN', 'MANAGER', 'SALES_REP'].includes(actor.role)) {
      throw new AppError('Urun degisim taleplerini goruntuleme yetkiniz yok.', 403, ErrorCode.FORBIDDEN);
    }
    const status = String(options?.status || 'PENDING').trim().toUpperCase();
    const limitRaw = Number(options?.limit || 25);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 100) : 25;
    const assignmentWhere =
      actor.role === 'SALES_REP' ? { assignedToId: actor.userId || '__none__' } : {};
    await this.recoverStaleProcessingRequests(assignmentWhere);
    const include = {
      assignedTo: { select: { id: true, name: true, displayName: true, mikroName: true, email: true } },
      requestedBy: { select: { id: true, name: true, displayName: true, mikroName: true, email: true } },
    } as const;
    const pendingCandidates = await prisma.orderProductChangeRequest.findMany({
      where: { status: 'PENDING', ...assignmentWhere },
      orderBy: [{ createdAt: 'desc' }],
      include,
    });
    const liveValidation = await this.resolveActionablePendingRequests(pendingCandidates);
    const actionablePending = pendingCandidates.filter((request) =>
      liveValidation.actionableIds.has(request.id)
    );

    const baseRequests =
      status === 'PENDING'
        ? actionablePending.slice(0, limit)
        : await prisma.orderProductChangeRequest.findMany({
            where: {
              ...(status === 'ALL' ? {} : { status }),
              ...assignmentWhere,
            },
            orderBy: [{ createdAt: 'desc' }],
            take: limit,
            include,
          });
    const currentStockAsOf = new Date();
    const productSnapshots = await this.getProductSnapshots(
      baseRequests.flatMap((request) => [request.sourceProductCode, request.targetProductCode])
    );
    const requests = baseRequests.map((request) => ({
      ...request,
      sourceCurrentStock: productSnapshots.get(normalizeCode(request.sourceProductCode))?.stock ?? null,
      targetCurrentStock: productSnapshots.get(normalizeCode(request.targetProductCode))?.stock ?? null,
      currentStockAsOf,
    }));

    return {
      requests,
      pendingCount: actionablePending.length,
      liveValidationAvailable: liveValidation.liveValidationAvailable,
    };
  }

  private async assertCanDecide(request: any, actor: ActorContext) {
    if (!actor.userId) throw new AppError('Oturum bulunamadi.', 401, ErrorCode.UNAUTHORIZED);
    if (actor.role === 'HEAD_ADMIN' || actor.role === 'ADMIN' || actor.role === 'MANAGER') return;
    if (actor.role === 'SALES_REP' && request.assignedToId === actor.userId) return;
    throw new AppError('Bu urun degisim talebini onaylama yetkiniz yok.', 403, ErrorCode.FORBIDDEN);
  }

  private async updateLocalOrderItem(request: any) {
    const localOrder =
      (await this.findLocalOrder(request.orderNumber, request.sourceProductCode)) ||
      (await this.findLocalOrder(request.orderNumber, request.targetProductCode));
    if (!localOrder) return;
    const targetProduct = await prisma.product.findUnique({
      where: { mikroCode: request.targetProductCode },
      select: { id: true, name: true },
    });
    const sourceItems = await prisma.orderItem.findMany({
      where: {
        orderId: localOrder.id,
        mikroCode: request.sourceProductCode,
        ...(request.orderNumber ? { mikroOrderId: request.orderNumber } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, quantity: true, unitPrice: true },
    });
    if (sourceItems.length === 0) {
      const alreadyUpdated = await prisma.orderItem.findFirst({
        where: {
          orderId: localOrder.id,
          mikroCode: request.targetProductCode,
          ...(request.orderNumber ? { mikroOrderId: request.orderNumber } : {}),
          quantity: request.quantity,
          unitPrice: request.unitPrice,
        },
        select: { id: true },
      });
      if (alreadyUpdated) return;
      throw new AppError(
        'Mikro degisikligi dogrulandi ancak eslesen yerel siparis kalemi bulunamadi.',
        409,
        ErrorCode.BAD_REQUEST
      );
    }

    let candidates = sourceItems;
    if (sourceItems.length > 1) {
      candidates = sourceItems.filter(
        (item) =>
          Math.abs(toNumber(item.quantity) - toNumber(request.quantity)) < 0.000001 &&
          Math.abs(toNumber(item.unitPrice) - toNumber(request.unitPrice)) < 0.000001
      );
    }
    if (candidates.length !== 1) {
      throw new AppError(
        'Yerel sipariste Mikro satiriyla guvenle eslestirilemeyen birden fazla urun satiri var.',
        409,
        ErrorCode.BAD_REQUEST
      );
    }

    const updated = await prisma.orderItem.updateMany({
      where: { id: candidates[0].id, mikroCode: request.sourceProductCode },
      data: {
        mikroCode: request.targetProductCode,
        productName: request.targetProductName || targetProduct?.name || request.targetProductCode,
        productId: targetProduct?.id || null,
      },
    });
    if (updated.count !== 1) {
      const readBack = await prisma.orderItem.findUnique({
        where: { id: candidates[0].id },
        select: { mikroCode: true },
      });
      if (normalizeCode(readBack?.mikroCode) !== normalizeCode(request.targetProductCode)) {
        throw new AppError(
          'Yerel siparis satiri degisikligi read-back ile dogrulanamadi.',
          409,
          ErrorCode.BAD_REQUEST
        );
      }
    }
  }

  async approve(id: string, actor: ActorContext) {
    const request = await prisma.orderProductChangeRequest.findUnique({ where: { id } });
    if (!request) throw new AppError('Urun degisim talebi bulunamadi.', 404, ErrorCode.NOT_FOUND);
    await this.assertCanDecide(request, actor);
    if (request.status !== 'PENDING') {
      throw new AppError('Bu talep daha once sonuclandirilmis.', 400, ErrorCode.BAD_REQUEST);
    }
    if (!request.mikroLineGuid || !GUID_PATTERN.test(request.mikroLineGuid)) {
      throw new AppError(
        'Guvenli Mikro yazimi icin siparis satiri GUID bilgisi bulunamadi; talep yeniden olusturulmalidir.',
        409,
        ErrorCode.BAD_REQUEST
      );
    }

    // Ayni talebin iki kullanici/instance tarafindan approve-reject edilmesini
    // engelle. Mikro yazisindan once karar sahipligi atomik olarak alinir.
    const claim = await prisma.orderProductChangeRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: 'PROCESSING',
        decidedById: actor.userId || null,
        decidedAt: new Date(),
        failedReason: null,
      },
    });
    if (claim.count !== 1) {
      throw new AppError('Bu talep baska bir kullanici tarafindan isleme alindi.', 409, ErrorCode.BAD_REQUEST);
    }

    const customerSelectCondition = request.customerCode
      ? `AND LTRIM(RTRIM(ISNULL(s.sip_musteri_kod, ''))) = '${escapeSql(request.customerCode)}'`
      : '';
    const customerUpdateCondition = request.customerCode
      ? `AND LTRIM(RTRIM(ISNULL(sip_musteri_kod, ''))) = '${escapeSql(request.customerCode)}'`
      : '';
    const selectWhereByGuid =
      `s.sip_Guid = CONVERT(uniqueidentifier, '${escapeSql(request.mikroLineGuid)}')
        ${customerSelectCondition}`;
    const updateWhereByGuid =
      `sip_Guid = CONVERT(uniqueidentifier, '${escapeSql(request.mikroLineGuid)}')
        ${customerUpdateCondition}`;

    let mikroWriteAttempted = false;
    let mikroApplied = false;
    let preWriteTerminal = false;
    let claimStatus = 'PROCESSING';
    try {
      const lineRows = await mikroService.executeQuery(`
        SELECT TOP 1
          LTRIM(RTRIM(ISNULL(s.sip_stok_kod, ''))) AS productCode,
          ISNULL(s.sip_kapat_fl, 0) AS isClosed,
          ISNULL(s.sip_iptal, 0) AS isCancelled,
          ISNULL(s.sip_miktar, 0) AS quantity,
          ISNULL(s.sip_teslim_miktar, 0) AS deliveredQuantity
        FROM SIPARISLER s
        WHERE s.sip_tip = 0
          AND ${selectWhereByGuid}
      `);
      const line = lineRows?.[0];
      if (!line) {
        preWriteTerminal = true;
        throw new AppError('Mikro siparis satiri bulunamadi.', 404, ErrorCode.NOT_FOUND);
      }
      if (normalizeCode(line.productCode) !== request.sourceProductCode) {
        preWriteTerminal = true;
        throw new AppError('Mikro satirindaki urun artik kaynak urunle ayni degil.', 409, ErrorCode.BAD_REQUEST);
      }
      if (
        toNumber(line.isClosed) !== 0 ||
        toNumber(line.isCancelled) !== 0 ||
        toNumber(line.quantity) <= toNumber(line.deliveredQuantity)
      ) {
        preWriteTerminal = true;
        throw new AppError('Mikro siparis satiri artik acik degil.', 409, ErrorCode.BAD_REQUEST);
      }

      const targetExists = await mikroService.executeQuery(`
        SELECT TOP 1 sto_kod
        FROM STOKLAR WITH (NOLOCK)
        WHERE sto_kod = '${escapeSql(request.targetProductCode)}'
      `);
      if (!targetExists?.length) {
        throw new AppError('Hedef stok Mikroda bulunamadi.', 404, ErrorCode.NOT_FOUND);
      }

      const mikroUserNoRaw = Number(process.env.MIKRO_USER_NO || process.env.MIKRO_USERNO || 1);
      const mikroUserNo = Number.isFinite(mikroUserNoRaw) && mikroUserNoRaw > 0 ? Math.trunc(mikroUserNoRaw) : 1;
      mikroWriteAttempted = true;
      await mikroService.executeQuery(`
        UPDATE SIPARISLER
        SET
          sip_stok_kod = '${escapeSql(request.targetProductCode)}',
          sip_lastup_date = GETDATE(),
          sip_lastup_user = ${mikroUserNo}
        WHERE sip_tip = 0
          AND ${updateWhereByGuid}
          AND LTRIM(RTRIM(ISNULL(sip_stok_kod, ''))) = '${escapeSql(request.sourceProductCode)}'
          AND ISNULL(sip_kapat_fl, 0) = 0
          AND ISNULL(sip_iptal, 0) = 0
          AND ISNULL(sip_miktar, 0) > ISNULL(sip_teslim_miktar, 0)
      `);

      const readBackRows = await mikroService.executeQuery(`
        SELECT TOP 1
          LTRIM(RTRIM(ISNULL(s.sip_stok_kod, ''))) AS productCode
        FROM SIPARISLER s
        WHERE s.sip_tip = 0
          AND ${selectWhereByGuid}
      `);
      if (normalizeCode(readBackRows?.[0]?.productCode) !== request.targetProductCode) {
        throw new AppError('Mikro urun degisikligi read-back ile dogrulanamadi.', 409, ErrorCode.BAD_REQUEST);
      }
      mikroApplied = true;

      const finalizationClaim = await prisma.orderProductChangeRequest.updateMany({
        where: {
          id,
          status: claimStatus,
          decidedById: actor.userId || null,
        },
        data: { status: 'FINALIZING' },
      });
      if (finalizationClaim.count !== 1) {
        throw new AppError(
          'Urun degisikligi Mikroda uygulandi ancak yerel sonlandirma lease kaybedildi.',
          409,
          ErrorCode.BAD_REQUEST
        );
      }
      claimStatus = 'FINALIZING';
      await this.updateLocalOrderItem(request);
      const finalized = await prisma.orderProductChangeRequest.updateMany({
        where: {
          id,
          status: claimStatus,
          decidedById: actor.userId || null,
        },
        data: {
          status: 'APPROVED',
          decidedById: actor.userId || null,
          decidedAt: new Date(),
          appliedAt: new Date(),
          failedReason: null,
        },
      });
      if (finalized.count !== 1) {
        throw new AppError(
          'Urun degisikligi Mikroda uygulandi ancak yerel durum atomik olarak sonlandirilamadi.',
          409,
          ErrorCode.BAD_REQUEST
        );
      }
      const updated = await prisma.orderProductChangeRequest.findUnique({ where: { id } });
      if (!updated) {
        throw new AppError('Sonuclandirilan urun degisim talebi okunamadi.', 409, ErrorCode.BAD_REQUEST);
      }

      notificationService.createForUsers([request.requestedById], {
        category: 'ORDER',
        title: 'Urun siparis degisimi onaylandi',
        body: `${request.orderNumber} satirinda ${request.sourceProductCode} yerine ${request.targetProductCode} uygulandi.`,
        linkUrl: '/reports/ucarer-depo',
      }).catch((error) => {
        console.warn('WARN: order product change approval notification failed', error);
      });

      return updated;
    } catch (error) {
      let failedReason =
        error instanceof Error
          ? error.message.slice(0, 500)
          : 'Urun degisikligi uygulanamadi.';
      let reconciliationState:
        | 'NOT_ATTEMPTED'
        | 'TARGET_CONFIRMED'
        | 'SOURCE_OPEN'
        | 'SOURCE_TERMINAL'
        | 'OTHER'
        | 'MISSING'
        | 'UNAVAILABLE' = mikroApplied ? 'TARGET_CONFIRMED' : 'NOT_ATTEMPTED';

      if (mikroWriteAttempted) {
        try {
          const readBackLine = await this.readMikroLineByGuid(request);
          if (!readBackLine) {
            reconciliationState = 'MISSING';
          } else {
            const readBackProduct = normalizeCode(readBackLine.productCode);
            if (readBackProduct === normalizeCode(request.targetProductCode)) {
              reconciliationState = 'TARGET_CONFIRMED';
              mikroApplied = true;
            } else if (readBackProduct === normalizeCode(request.sourceProductCode)) {
              reconciliationState = this.isMikroLineOpen(readBackLine)
                ? 'SOURCE_OPEN'
                : 'SOURCE_TERMINAL';
            } else {
              reconciliationState = 'OTHER';
            }
          }
        } catch (readBackError) {
          if (!mikroApplied) reconciliationState = 'UNAVAILABLE';
          console.error('ERROR: uncertain Mikro write could not be independently read back', readBackError);
        }
      }

      if (reconciliationState === 'TARGET_CONFIRMED') {
        try {
          await this.updateLocalOrderItem(request);
          const reconciled = await prisma.orderProductChangeRequest.updateMany({
            where: { id, status: claimStatus, decidedById: actor.userId || null },
            data: {
              status: 'APPROVED',
              appliedAt: new Date(),
              failedReason: null,
            },
          });
          if (reconciled.count === 1) {
            const confirmed = await prisma.orderProductChangeRequest.findUnique({ where: { id } });
            if (confirmed) return confirmed;
          }
          const alreadyFinalized = await prisma.orderProductChangeRequest.findUnique({ where: { id } });
          if (alreadyFinalized?.status === 'APPROVED') return alreadyFinalized;
          failedReason = `${failedReason} Mikro degisikligi read-back ile dogrulandi ancak yerel durum sonlandirilamadi.`;
        } catch (reconciliationError) {
          const reconciliationMessage =
            reconciliationError instanceof Error
              ? reconciliationError.message
              : 'yerel uzlastirma hatasi';
          failedReason = `${failedReason} Mikro hedef urunle dogrulandi; yerel uzlastirma basarisiz: ${reconciliationMessage}`.slice(0, 500);
        }
      } else if (mikroWriteAttempted) {
        failedReason = `${failedReason} Bagimsiz read-back sonucu: ${reconciliationState}.`.slice(0, 500);
      }

      const safeToRetry =
        (!mikroWriteAttempted && !preWriteTerminal) ||
        reconciliationState === 'SOURCE_OPEN';
      await prisma.orderProductChangeRequest.updateMany({
        where: { id, status: claimStatus, decidedById: actor.userId || null },
        data: !safeToRetry
          ? {
              status: 'FAILED',
              appliedAt: mikroApplied ? new Date() : null,
              failedReason,
            }
          : {
              status: 'PENDING',
              decidedById: null,
              decidedAt: null,
              appliedAt: null,
              failedReason,
            },
      }).catch((stateError) => {
        console.error('ERROR: order product change claim could not be finalized', stateError);
      });
      throw error;
    }
  }

  async reject(id: string, actor: ActorContext, reason?: string | null) {
    const request = await prisma.orderProductChangeRequest.findUnique({ where: { id } });
    if (!request) throw new AppError('Urun degisim talebi bulunamadi.', 404, ErrorCode.NOT_FOUND);
    await this.assertCanDecide(request, actor);
    if (request.status !== 'PENDING') {
      throw new AppError('Bu talep daha once sonuclandirilmis.', 400, ErrorCode.BAD_REQUEST);
    }
    const decision = await prisma.orderProductChangeRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: 'REJECTED',
        rejectReason: reason || null,
        decidedById: actor.userId || null,
        decidedAt: new Date(),
      },
    });
    if (decision.count !== 1) {
      throw new AppError('Bu talep baska bir kullanici tarafindan isleme alindi.', 409, ErrorCode.BAD_REQUEST);
    }
    const updated = await prisma.orderProductChangeRequest.findUnique({ where: { id } });
    notificationService.createForUsers([request.requestedById], {
      category: 'ORDER',
      title: 'Urun siparis degisimi reddedildi',
      body: `${request.orderNumber} satiri icin ${request.sourceProductCode} -> ${request.targetProductCode} reddedildi.`,
      linkUrl: '/reports/ucarer-depo',
    }).catch((error) => {
      console.warn('WARN: order product change rejection notification failed', error);
    });
    return updated;
  }
}

export default new OrderProductChangeRequestService();
