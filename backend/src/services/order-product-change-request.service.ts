import { prisma } from '../utils/prisma';
import mikroService from './mikroFactory.service';
import notificationService from './notification.service';
import { AppError, ErrorCode } from '../types/errors';

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

class OrderProductChangeRequestService {
  private async getProductSnapshots(codesInput: string[]) {
    const codes = Array.from(new Set(codesInput.map(normalizeCode).filter(Boolean)));
    const map = new Map<
      string,
      {
        productCode: string;
        productName: string | null;
        currentCost: number | null;
        lastEntryCost: number | null;
        vatRate: number | null;
        productId: string | null;
      }
    >();
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
      title: 'Onaylanacak urun siparis degisimi',
      body: `${sourceProductCode} yerine ${targetProductCode} icin ${created.length} siparis satiri onay bekliyor.`,
      linkUrl: '/dashboard',
    });
    if (unassigned.length > 0 && assignedRecipients.length > 0) {
      await notificationService.createForUsers(adminRecipients, {
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

  async list(actor: ActorContext, options?: { status?: string; limit?: number }) {
    const status = String(options?.status || 'PENDING').trim().toUpperCase();
    const limitRaw = Number(options?.limit || 25);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 100) : 25;
    const where: any = status === 'ALL' ? {} : { status };
    if (actor.role === 'SALES_REP') {
      where.assignedToId = actor.userId || '__none__';
    }
    const requests = await prisma.orderProductChangeRequest.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
      include: {
        assignedTo: { select: { id: true, name: true, displayName: true, mikroName: true, email: true } },
        requestedBy: { select: { id: true, name: true, displayName: true, mikroName: true, email: true } },
      },
    });
    const pendingCount = await prisma.orderProductChangeRequest.count({
      where: actor.role === 'SALES_REP' ? { status: 'PENDING', assignedToId: actor.userId || '__none__' } : { status: 'PENDING' },
    });
    return { requests, pendingCount };
  }

  private async assertCanDecide(request: any, actor: ActorContext) {
    if (!actor.userId) throw new AppError('Oturum bulunamadi.', 401, ErrorCode.UNAUTHORIZED);
    if (actor.role === 'HEAD_ADMIN' || actor.role === 'ADMIN' || actor.role === 'MANAGER') return;
    if (actor.role === 'SALES_REP' && request.assignedToId === actor.userId) return;
    throw new AppError('Bu urun degisim talebini onaylama yetkiniz yok.', 403, ErrorCode.FORBIDDEN);
  }

  private async updateLocalOrderItem(request: any) {
    const localOrder = await this.findLocalOrder(request.orderNumber, request.sourceProductCode);
    if (!localOrder) return;
    const targetProduct = await prisma.product.findUnique({
      where: { mikroCode: request.targetProductCode },
      select: { id: true, name: true },
    });
    const item = await prisma.orderItem.findFirst({
      where: {
        orderId: localOrder.id,
        mikroCode: request.sourceProductCode,
        ...(request.orderNumber ? { mikroOrderId: request.orderNumber } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!item) return;
    await prisma.orderItem.update({
      where: { id: item.id },
      data: {
        mikroCode: request.targetProductCode,
        productName: request.targetProductName || targetProduct?.name || request.targetProductCode,
        productId: targetProduct?.id || null,
      },
    });
  }

  async approve(id: string, actor: ActorContext) {
    const request = await prisma.orderProductChangeRequest.findUnique({ where: { id } });
    if (!request) throw new AppError('Urun degisim talebi bulunamadi.', 404, ErrorCode.NOT_FOUND);
    await this.assertCanDecide(request, actor);
    if (request.status !== 'PENDING') {
      throw new AppError('Bu talep daha once sonuclandirilmis.', 400, ErrorCode.BAD_REQUEST);
    }

    const selectWhereByGuid = request.mikroLineGuid
      ? `s.sip_Guid = CONVERT(uniqueidentifier, '${escapeSql(request.mikroLineGuid)}')`
      : `s.sip_evrakno_seri = '${escapeSql(request.orderSeries)}'
          AND s.sip_evrakno_sira = ${Number(request.orderSequence)}
          AND s.sip_satirno = ${Number(request.orderLineNo)}`;
    const updateWhereByGuid = request.mikroLineGuid
      ? `sip_Guid = CONVERT(uniqueidentifier, '${escapeSql(request.mikroLineGuid)}')`
      : `sip_evrakno_seri = '${escapeSql(request.orderSeries)}'
          AND sip_evrakno_sira = ${Number(request.orderSequence)}
          AND sip_satirno = ${Number(request.orderLineNo)}`;
    const lineRows = await mikroService.executeQuery(`
      SELECT TOP 1
        LTRIM(RTRIM(ISNULL(s.sip_stok_kod, ''))) AS productCode,
        ISNULL(s.sip_kapat_fl, 0) AS isClosed,
        ISNULL(s.sip_iptal, 0) AS isCancelled,
        ISNULL(s.sip_miktar, 0) AS quantity,
        ISNULL(s.sip_teslim_miktar, 0) AS deliveredQuantity
      FROM SIPARISLER s WITH (NOLOCK)
      WHERE ${selectWhereByGuid}
    `);
    const line = lineRows?.[0];
    if (!line) throw new AppError('Mikro siparis satiri bulunamadi.', 404, ErrorCode.NOT_FOUND);
    if (normalizeCode(line.productCode) !== request.sourceProductCode) {
      throw new AppError('Mikro satirindaki urun artik kaynak urunle ayni degil.', 409, ErrorCode.BAD_REQUEST);
    }
    if (Boolean(line.isClosed) || Boolean(line.isCancelled) || toNumber(line.quantity) <= toNumber(line.deliveredQuantity)) {
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
    await mikroService.executeQuery(`
      UPDATE SIPARISLER
      SET
        sip_stok_kod = '${escapeSql(request.targetProductCode)}',
        sip_lastup_date = GETDATE(),
        sip_lastup_user = ${mikroUserNo}
      WHERE ${updateWhereByGuid}
        AND LTRIM(RTRIM(ISNULL(sip_stok_kod, ''))) = '${escapeSql(request.sourceProductCode)}'
        AND ISNULL(sip_kapat_fl, 0) = 0
        AND ISNULL(sip_iptal, 0) = 0
    `);

    await this.updateLocalOrderItem(request);
    const updated = await prisma.orderProductChangeRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        decidedById: actor.userId || null,
        decidedAt: new Date(),
        appliedAt: new Date(),
        failedReason: null,
      },
    });

    await notificationService.createForUsers([request.requestedById], {
      title: 'Urun siparis degisimi onaylandi',
      body: `${request.orderNumber} satirinda ${request.sourceProductCode} yerine ${request.targetProductCode} uygulandi.`,
      linkUrl: '/reports/ucarer-depo',
    });

    return updated;
  }

  async reject(id: string, actor: ActorContext, reason?: string | null) {
    const request = await prisma.orderProductChangeRequest.findUnique({ where: { id } });
    if (!request) throw new AppError('Urun degisim talebi bulunamadi.', 404, ErrorCode.NOT_FOUND);
    await this.assertCanDecide(request, actor);
    if (request.status !== 'PENDING') {
      throw new AppError('Bu talep daha once sonuclandirilmis.', 400, ErrorCode.BAD_REQUEST);
    }
    const updated = await prisma.orderProductChangeRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectReason: reason || null,
        decidedById: actor.userId || null,
        decidedAt: new Date(),
      },
    });
    await notificationService.createForUsers([request.requestedById], {
      title: 'Urun siparis degisimi reddedildi',
      body: `${request.orderNumber} satiri icin ${request.sourceProductCode} -> ${request.targetProductCode} reddedildi.`,
      linkUrl: '/reports/ucarer-depo',
    });
    return updated;
  }
}

export default new OrderProductChangeRequestService();
