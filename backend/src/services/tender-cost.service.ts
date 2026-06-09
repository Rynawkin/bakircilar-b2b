import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { AppError, ErrorCode } from '../types/errors';
import notificationService from './notification.service';
import { rolePermissionService } from './role-permission.service';
import { splitSearchTokens } from '../utils/search';

type Actor = {
  userId?: string | null;
  role?: string | null;
};

const PRIORITIES = new Set(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
const STATUSES = new Set(['REQUESTED', 'IN_REVIEW', 'COMPLETED', 'CANCELLED']);
const PURCHASING_ROLES = new Set(['HEAD_ADMIN', 'ADMIN', 'MANAGER']);

const normalizeText = (value: unknown) => String(value ?? '').trim();
const normalizeCode = (value: unknown) => normalizeText(value).toLocaleUpperCase('tr-TR');
const asNumber = (value: unknown, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const roundMoney = (value: number) => Number(value.toFixed(4));
const toDateOrNull = (value: unknown) => {
  if (!value) return null;
  const raw = normalizeText(value);
  const localDateTimeMatch = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/);
  const dateOnlyMatch = raw.match(/^(\d{4}-\d{2}-\d{2})$/);
  const date = localDateTimeMatch
    ? new Date(`${localDateTimeMatch[1]}T${localDateTimeMatch[2]}:00+03:00`)
    : dateOnlyMatch
      ? new Date(`${dateOnlyMatch[1]}T23:59:00+03:00`)
      : new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date;
};
const normalizeAttachments = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: any) => ({
      url: normalizeText(item?.url || item?.attachmentUrl),
      name: normalizeText(item?.name || item?.originalName || item?.url),
      size: item?.size !== undefined && item?.size !== null ? asNumber(item.size, 0) : null,
      type: normalizeText(item?.type || item?.mimeType) || null,
    }))
    .filter((item) => item.url);
};

class TenderCostService {
  async listRequests(query: any, actor: Actor) {
    const scope = await this.resolveScope(actor);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(Number(query.limit) || 40, 100));
    const status = normalizeText(query.status).toUpperCase();
    const mine = String(query.mine || '').toLowerCase() === 'true';
    const sort = normalizeText(query.sort || 'newest');
    const tokens = splitSearchTokens(query.search || '');

    const where: Prisma.TenderCostRequestWhereInput = {};
    if (!scope.canManage || mine) where.createdById = scope.userId;
    if (status && status !== 'ALL') where.status = status;
    if (tokens.length > 0) {
      where.AND = tokens.map((token) => ({
        OR: [
          { requestNo: { contains: token, mode: 'insensitive' } },
          { title: { contains: token, mode: 'insensitive' } },
          { customerCode: { contains: token, mode: 'insensitive' } },
          { customerName: { contains: token, mode: 'insensitive' } },
          { salesNote: { contains: token, mode: 'insensitive' } },
          { items: { some: { productCode: { contains: token, mode: 'insensitive' } } } },
          { items: { some: { productName: { contains: token, mode: 'insensitive' } } } },
        ],
      }));
    }

    const [items, total, summaryRows] = await Promise.all([
      prisma.tenderCostRequest.findMany({
        where,
        include: this.requestInclude(),
        orderBy: this.resolveOrderBy(sort),
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.tenderCostRequest.count({ where }),
      prisma.tenderCostRequest.groupBy({
        by: ['status'],
        where: scope.canManage ? {} : { createdById: scope.userId },
        _count: { _all: true },
      }),
    ]);

    return {
      items: items.map((item) => this.mapRequest(item)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      summary: Object.fromEntries(summaryRows.map((row) => [row.status, row._count._all])),
      scope: { canManage: scope.canManage },
    };
  }

  async getRequest(id: string, actor: Actor) {
    const request = await this.requireRequest(id, actor);
    return { request: this.mapRequest(request) };
  }

  async createRequest(input: any, actor: Actor) {
    const scope = await this.resolveScope(actor);
    const userInfo = await this.resolveUser(scope.userId);
    const title = normalizeText(input.title);
    if (!title) throw new AppError('Ihale adi zorunludur.', 400, ErrorCode.BAD_REQUEST);
    const priority = PRIORITIES.has(normalizeText(input.priority).toUpperCase()) ? normalizeText(input.priority).toUpperCase() : 'NORMAL';
    const rawItems = Array.isArray(input.items) ? input.items : [];
    const items = rawItems
      .map((item: any, index: number) => ({
        lineNo: index + 1,
        productCode: normalizeCode(item.productCode) || null,
        productName: normalizeText(item.productName) || 'Dosyadaki ihale kalemi',
        unit: normalizeCode(item.unit) || null,
        quantity: item.quantity !== undefined && item.quantity !== null && item.quantity !== '' ? asNumber(item.quantity, 0) : null,
        targetPrice: item.targetPrice !== undefined && item.targetPrice !== null && item.targetPrice !== '' ? asNumber(item.targetPrice, 0) : null,
        note: normalizeText(item.note) || null,
        attachments: normalizeAttachments(item.attachments) as unknown as Prisma.InputJsonValue,
      }));
    if (items.length === 0) {
      items.push({
        lineNo: 1,
        productCode: null,
        productName: 'Dosyadaki ihale kalemi',
        unit: null,
        quantity: null,
        targetPrice: null,
        note: null,
        attachments: [],
      });
    }

    const request = await prisma.tenderCostRequest.create({
      data: {
        requestNo: await this.generateRequestNo(),
        status: 'REQUESTED',
        priority,
        title,
        customerCode: normalizeText(input.customerCode) || null,
        customerName: normalizeText(input.customerName) || null,
        deadline: toDateOrNull(input.deadline),
        deliveryLocation: normalizeText(input.deliveryLocation) || null,
        salesNote: normalizeText(input.salesNote || input.note) || null,
        attachments: normalizeAttachments(input.attachments) as unknown as Prisma.InputJsonValue,
        createdById: scope.userId,
        createdByName: userInfo.userName,
        items: { create: items },
      },
      include: this.requestInclude(),
    });

    await this.addSystemNote(request.id, `${userInfo.userName || 'Kullanici'} ihale maliyet talebi olusturdu.`, scope.userId);
    await this.notifyPurchasing({
      title: 'Yeni ihale maliyet talebi',
      body: `${request.requestNo} - ${request.title}`,
      linkUrl: `/supplier-costs?tab=tenders&tenderId=${request.id}`,
    }, scope.userId);

    return { request: this.mapRequest(request) };
  }

  async addOffer(requestId: string, itemId: string, input: any, actor: Actor) {
    await this.requireManager(actor);
    const item = await prisma.tenderCostItem.findFirst({
      where: { id: itemId, requestId },
      include: { request: true },
    });
    if (!item) throw new AppError('Ihale kalemi bulunamadi.', 404, ErrorCode.NOT_FOUND);
    if (['COMPLETED', 'CANCELLED'].includes(item.request.status)) {
      throw new AppError('Kapali ihale talebine fiyat girilemez.', 400, ErrorCode.BAD_REQUEST);
    }
    const normalized = this.normalizeOfferInput(item, input);
    const userInfo = await this.resolveUser(actor.userId || null);

    await prisma.tenderCostOffer.create({
      data: {
        itemId: item.id,
        ...normalized,
        createdById: actor.userId || null,
        createdByName: userInfo.userName,
      },
    });
    const updated = await prisma.tenderCostRequest.update({
      where: { id: requestId },
      data: {
        status: item.request.status === 'REQUESTED' ? 'IN_REVIEW' : item.request.status,
        procurementNote: normalizeText(input.note) || item.request.procurementNote || null,
      },
      include: this.requestInclude(),
    });
    await this.addSystemNote(requestId, `${item.productName} kalemine ${normalized.supplierName} fiyati girildi.`, actor.userId || null);
    return { request: this.mapRequest(updated) };
  }

  async completeRequest(id: string, input: any, actor: Actor) {
    await this.requireManager(actor);
    const request = await this.requireRequestForManage(id);
    if (request.status === 'CANCELLED') throw new AppError('Iptal edilen talep tamamlanamaz.', 400, ErrorCode.BAD_REQUEST);
    const updated = await prisma.tenderCostRequest.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        procurementNote: normalizeText(input.note) || request.procurementNote || null,
        completedAt: new Date(),
      },
      include: this.requestInclude(),
    });
    await this.addSystemNote(id, 'Ihale maliyet talebi tamamlandi.', actor.userId || null);
    if (request.createdById) {
      await notificationService.createForUsers([request.createdById], {
        title: 'Ihale maliyet talebi tamamlandi',
        body: `${request.requestNo} - ${request.title}`,
        linkUrl: `/supplier-costs?tab=tenders&tenderId=${request.id}`,
      });
    }
    return { request: this.mapRequest(updated) };
  }

  async cancelRequest(id: string, input: any, actor: Actor) {
    const request = await this.requireRequest(id, actor);
    const scope = await this.resolveScope(actor);
    if (!scope.canManage && request.createdById !== scope.userId) {
      throw new AppError('Talebi iptal etme yetkiniz yok.', 403, ErrorCode.FORBIDDEN);
    }
    const updated = await prisma.tenderCostRequest.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        procurementNote: normalizeText(input.note) || request.procurementNote || null,
        cancelledAt: new Date(),
      },
      include: this.requestInclude(),
    });
    await this.addSystemNote(id, 'Ihale maliyet talebi iptal edildi.', actor.userId || null);
    return { request: this.mapRequest(updated) };
  }

  async addNote(id: string, input: any, actor: Actor) {
    const request = await this.requireRequest(id, actor);
    const body = normalizeText(input.body || input.note);
    if (!body) throw new AppError('Not bos olamaz.', 400, ErrorCode.BAD_REQUEST);
    const userInfo = await this.resolveUser(actor.userId || null);
    const note = await prisma.tenderCostNote.create({
      data: {
        requestId: request.id,
        authorId: actor.userId || null,
        authorName: userInfo.userName,
        body,
      },
    });
    return { note };
  }

  private normalizeOfferInput(item: any, input: any) {
    const supplierName = normalizeText(input.supplierName);
    const supplierCode = normalizeText(input.supplierCode) || null;
    if (!supplierCode && !supplierName) throw new AppError('Tedarikci zorunludur.', 400, ErrorCode.BAD_REQUEST);
    const currency = normalizeCode(input.currency) || 'TRY';
    const exchangeRate = currency === 'TRY' ? null : asNumber(input.exchangeRate, 0);
    if (currency !== 'TRY' && (!exchangeRate || exchangeRate <= 0)) {
      throw new AppError('Dovizli maliyetlerde kur zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }
    const vatRaw = input.vatRate !== undefined && input.vatRate !== null && input.vatRate !== '' ? asNumber(input.vatRate, 20) : 20;
    const vatRate = vatRaw > 1 ? vatRaw / 100 : vatRaw;
    const factor = Math.max(asNumber(input.unitFactor, 1), 0.0001);
    const fx = currency === 'TRY' ? 1 : Number(exchangeRate);
    const divider = input.vatIncluded ? 1 + vatRate : 1;
    let costT = asNumber(input.costT, 0);
    let costP = asNumber(input.costP, 0);
    if ((!costP || costP <= 0) && costT > 0) costP = roundMoney(costT * (1 + Math.max(vatRate, 0) / 2));
    if ((!costT || costT <= 0) && costP > 0) costT = costP;
    if (!costT || costT <= 0) throw new AppError('Maliyet T zorunludur.', 400, ErrorCode.BAD_REQUEST);
    if (!costP || costP <= 0) throw new AppError('Maliyet P zorunludur.', 400, ErrorCode.BAD_REQUEST);
    const normalizedCostP = roundMoney((costP * fx) / factor / divider);
    const normalizedCostT = roundMoney((costT * fx) / factor / divider);
    const quantity = asNumber(item.quantity, 0);
    const freightCost = input.freightCost !== undefined && input.freightCost !== null && input.freightCost !== '' ? asNumber(input.freightCost, 0) : null;
    const freightPerUnit = freightCost && quantity > 0 ? freightCost / quantity : 0;
    const totalUnitCostP = roundMoney(normalizedCostP + freightPerUnit);

    return {
      supplierCode,
      supplierName: supplierName || supplierCode || 'Tedarikci',
      supplierProductCode: normalizeText(input.supplierProductCode) || null,
      costP,
      costT,
      freightCost,
      currency,
      exchangeRate,
      vatIncluded: Boolean(input.vatIncluded),
      vatRate,
      unit: normalizeText(input.unit) || item.unit || null,
      unitFactor: factor,
      normalizedCostP,
      normalizedCostT,
      totalUnitCostP,
      totalLineCostP: quantity > 0 ? roundMoney(totalUnitCostP * quantity) : null,
      leadTimeDays: input.leadTimeDays !== undefined && input.leadTimeDays !== null && input.leadTimeDays !== '' ? Math.trunc(asNumber(input.leadTimeDays, 0)) : null,
      validUntil: toDateOrNull(input.validUntil),
      quoteDate: toDateOrNull(input.quoteDate) || new Date(),
      note: normalizeText(input.note) || null,
      attachmentUrl: normalizeText(input.attachmentUrl) || null,
    };
  }

  private async requireRequest(id: string, actor: Actor) {
    const request = await prisma.tenderCostRequest.findUnique({
      where: { id },
      include: this.requestInclude(),
    });
    if (!request) throw new AppError('Ihale maliyet talebi bulunamadi.', 404, ErrorCode.NOT_FOUND);
    const scope = await this.resolveScope(actor);
    if (!scope.canManage && request.createdById !== scope.userId) {
      throw new AppError('Bu talebi gorme yetkiniz yok.', 403, ErrorCode.FORBIDDEN);
    }
    return request;
  }

  private async requireRequestForManage(id: string) {
    const request = await prisma.tenderCostRequest.findUnique({
      where: { id },
      include: this.requestInclude(),
    });
    if (!request) throw new AppError('Ihale maliyet talebi bulunamadi.', 404, ErrorCode.NOT_FOUND);
    return request;
  }

  private async requireManager(actor: Actor) {
    const scope = await this.resolveScope(actor);
    if (!scope.canManage) throw new AppError('Bu islem icin satin alma/admin yetkisi gerekli.', 403, ErrorCode.FORBIDDEN);
    return scope;
  }

  private async resolveScope(actor: Actor) {
    const userId = actor.userId || null;
    const role = actor.role || null;
    let canManage = PURCHASING_ROLES.has(String(role));
    if (!canManage && userId) {
      canManage = await rolePermissionService.hasPermission(userId, 'admin:supplier-costs').catch(() => false);
    }
    return { userId, role, canManage };
  }

  private async resolveUser(userId?: string | null) {
    if (!userId) return { userName: null as string | null };
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, mikroName: true, name: true, email: true },
    });
    return { userName: row?.displayName || row?.mikroName || row?.name || row?.email || null };
  }

  private async notifyPurchasing(payload: { title: string; body?: string | null; linkUrl?: string | null }, excludeUserId?: string | null) {
    const users = await prisma.user.findMany({
      where: {
        active: true,
        role: { in: ['HEAD_ADMIN', 'ADMIN', 'MANAGER'] as any },
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true },
    });
    await notificationService.createForUsers(users.map((user) => user.id), payload);
  }

  private async addSystemNote(requestId: string, body: string, authorId?: string | null) {
    const userInfo = await this.resolveUser(authorId || null);
    await prisma.tenderCostNote.create({
      data: {
        requestId,
        authorId: authorId || null,
        authorName: userInfo.userName || 'Sistem',
        body,
      },
    }).catch(() => undefined);
  }

  private requestInclude() {
    return {
      items: {
        include: { offers: { orderBy: [{ totalUnitCostP: 'asc' as const }, { createdAt: 'desc' as const }] } },
        orderBy: { lineNo: 'asc' as const },
      },
      notes: { orderBy: { createdAt: 'desc' as const }, take: 20 },
    };
  }

  private mapRequest(request: any) {
    const items = (request.items || []).map((item: any) => {
      const offers = item.offers || [];
      const bestOffer = offers.length
        ? offers.reduce((best: any, offer: any) => (Number(offer.totalUnitCostP) < Number(best.totalUnitCostP) ? offer : best), offers[0])
        : null;
      return {
        ...item,
        attachments: normalizeAttachments(item.attachments),
        offers,
        bestOffer,
      };
    });
    const totals = items.reduce((acc: any, item: any) => {
      if (item.bestOffer?.totalLineCostP) acc.bestTotal += Number(item.bestOffer.totalLineCostP);
      if ((item.offers || []).length === 0) acc.unpricedLines += 1;
      return acc;
    }, { bestTotal: 0, unpricedLines: 0 });
    return {
      ...request,
      attachments: normalizeAttachments(request.attachments),
      items,
      itemCount: items.length,
      bestTotal: totals.bestTotal || null,
      unpricedLines: totals.unpricedLines,
      deadlineRemaining: this.resolveDeadlineRemaining(request.deadline),
      notes: request.notes || [],
    };
  }

  private resolveOrderBy(sort: string): Prisma.TenderCostRequestOrderByWithRelationInput[] {
    if (sort === 'oldest') return [{ createdAt: 'asc' }, { updatedAt: 'asc' }];
    if (sort === 'deadlineSoon') return [{ deadline: 'asc' }, { createdAt: 'asc' }];
    return [{ createdAt: 'desc' }, { updatedAt: 'desc' }];
  }

  private resolveDeadlineRemaining(deadline: Date | null | undefined) {
    if (!deadline) return null;
    const deadlineMs = new Date(deadline).getTime();
    if (!Number.isFinite(deadlineMs)) return null;
    const diffMs = deadlineMs - Date.now();
    const absMs = Math.abs(diffMs);
    const totalHours = Math.floor(absMs / 36e5);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return {
      overdue: diffMs < 0,
      totalHours: Math.ceil(diffMs / 36e5),
      days,
      hours,
      label: diffMs < 0 ? `${days} gun ${hours} saat gecikti` : `${days} gun ${hours} saat kaldi`,
    };
  }

  private async generateRequestNo() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const now = new Date();
      const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
      const requestNo = `IH-${datePart}-${suffix}`;
      const existing = await prisma.tenderCostRequest.findUnique({ where: { requestNo }, select: { id: true } });
      if (!existing) return requestNo;
    }
    return `IH-${Date.now()}`;
  }
}

export default new TenderCostService();
