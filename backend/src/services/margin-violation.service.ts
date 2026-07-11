import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { AppError, ErrorCode } from '../types/errors';
import notificationService from './notification.service';
import reportsService from './reports.service';
import marginExclusionService, { MarginExclusionTypeValue } from './margin-exclusion.service';
import priceVerificationService from './price-verification.service';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '../utils/search';

export type MarginViolationActor = {
  userId?: string | null;
  role?: string | null;
  email?: string | null;
  assignedSectorCodes?: string[];
};
type Actor = MarginViolationActor;

const MANAGEMENT_ROLES = new Set(['HEAD_ADMIN', 'ADMIN', 'MANAGER']);
const OPEN_STATUSES = ['OPEN', 'IN_REVIEW', 'REOPENED'] as const;
const ALL_STATUSES = new Set(['OPEN', 'IN_REVIEW', 'RESOLVED', 'REOPENED', 'ADMIN_CLOSED', 'INVALIDATED']);
const RESOLUTION_TYPES = new Set(['FIXED', 'APPROVED', 'DATA_ERROR', 'EXCLUDED', 'OTHER']);
const PROPOSAL_TYPES = new Set<MarginExclusionTypeValue>(['BRAND', 'PRODUCT_CODE', 'PRODUCT_NAME']);

const normalizeText = (value: unknown) => String(value ?? '').trim();
const normalizeCode = (value: unknown) => normalizeText(value).toLocaleUpperCase('tr-TR');
const actorCanManage = (actor: Actor) => MANAGEMENT_ROLES.has(String(actor.role || ''));

export const buildMarginViolationScope = (actor: MarginViolationActor): Prisma.MarginViolationWhereInput => {
  if (!actor.userId) throw new AppError('Oturum gerekli.', 401, ErrorCode.UNAUTHORIZED);
  if (!actorCanManage(actor) && actor.role !== 'SALES_REP') {
    throw new AppError('Marj ihlali aksiyon merkezine erisim yetkiniz yok.', 403, ErrorCode.FORBIDDEN);
  }
  return actorCanManage(actor) ? {} : { assignees: { some: { userId: actor.userId } } };
};

const startOfDayUtc = (value: Date) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
const addDaysUtc = (value: Date, days: number) => {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const businessDaysBetween = (from: Date, to: Date) => {
  let count = 0;
  let cursor = startOfDayUtc(from);
  const end = startOfDayUtc(to);
  while (cursor < end) {
    cursor = addDaysUtc(cursor, 1);
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
};

class MarginViolationService {
  private async resolveUser(userId?: string | null) {
    if (!userId) return { id: null, name: 'Sistem', email: null };
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, displayName: true, mikroName: true, email: true },
    });
    return {
      id: user?.id || userId,
      name: user?.displayName || user?.mikroName || user?.name || user?.email || 'Kullanici',
      email: user?.email || null,
    };
  }

  private scopeWhere(actor: Actor): Prisma.MarginViolationWhereInput {
    return buildMarginViolationScope(actor);
  }

  private async requireViolation(id: string, actor: Actor) {
    const violation = await prisma.marginViolation.findFirst({
      where: { id, ...this.scopeWhere(actor) },
      include: {
        bases: { orderBy: { basis: 'asc' } },
        assignees: { orderBy: { userName: 'asc' } },
        notes: { orderBy: { createdAt: 'desc' }, take: 30 },
        exclusionProposals: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!violation) throw new AppError('Marj ihlali bulunamadi veya yetkiniz yok.', 404, ErrorCode.NOT_FOUND);
    return violation;
  }

  private async addSystemNote(violationId: string, body: string, authorId?: string | null) {
    const user = await this.resolveUser(authorId);
    await prisma.marginViolationNote.create({
      data: {
        violationId,
        authorId: authorId || null,
        authorName: user.name,
        body,
        isSystem: true,
      },
    });
  }

  private mapViolation(violation: any, actor: Actor, repeatCount = 1) {
    const canManage = actorCanManage(actor);
    const isAssigned = canManage || violation.assignees?.some((item: any) => item.userId === actor.userId);
    const claimedByAnother = Boolean(violation.claimedById && violation.claimedById !== actor.userId);
    const isOpen = OPEN_STATUSES.includes(violation.status);
    return {
      ...violation,
      repeatCount,
      isRecurring: repeatCount > 1,
      availableActions: {
        canClaim: isOpen && isAssigned && (!violation.claimedById || violation.claimedById === actor.userId || canManage),
        canAddNote: isAssigned,
        canResolve: isOpen && isAssigned && (canManage || !claimedByAnother),
        canReopen: canManage && ['RESOLVED', 'ADMIN_CLOSED', 'INVALIDATED'].includes(violation.status),
        canAdminClose: canManage && !['ADMIN_CLOSED', 'INVALIDATED'].includes(violation.status),
        canProposeExclusion: isOpen && isAssigned,
        canDecideExclusion: canManage,
        canOpenPriceVerification: isOpen && isAssigned && !violation.priceVerificationRequestId,
      },
    };
  }

  async list(query: any, actor: Actor) {
    const scope = this.scopeWhere(actor);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(Number(query.limit) || 50, 200));
    const status = normalizeCode(query.status);
    const search = normalizeText(query.search);
    const assignee = normalizeText(query.assignee);
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    const where: Prisma.MarginViolationWhereInput = { ...scope };

    if (status && status !== 'ALL') {
      if (!ALL_STATUSES.has(status)) throw new AppError('Gecersiz ihlal durumu.', 400, ErrorCode.INVALID_INPUT);
      where.status = status as any;
    }
    if (assignee === 'me' && actor.userId) where.assignees = { some: { userId: actor.userId } };
    else if (assignee && actorCanManage(actor)) where.assignees = { some: { userId: assignee } };
    if (from && !Number.isNaN(from.getTime())) where.reportDate = { ...(where.reportDate as any), gte: startOfDayUtc(from) };
    if (to && !Number.isNaN(to.getTime())) where.reportDate = { ...(where.reportDate as any), lte: new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate(), 23, 59, 59, 999)) };
    if (String(query.unassigned || '') === 'true' && actorCanManage(actor)) where.assignees = { none: {} };
    if (normalizeCode(query.proposal) === 'PENDING' && actorCanManage(actor)) {
      where.exclusionProposals = { some: { status: 'PENDING' } };
    }
    if (search) {
      where.OR = [
        { documentNo: { contains: search, mode: 'insensitive' } },
        { customerCode: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { productCode: { contains: search, mode: 'insensitive' } },
        { productName: { contains: search, mode: 'insensitive' } },
        { sectorCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (String(query.recurringOnly || '') === 'true') {
      const recentRows = await prisma.marginViolation.findMany({
        where: {
          ...scope,
          status: { not: 'INVALIDATED' },
          reportDate: { gte: addDaysUtc(startOfDayUtc(new Date()), -6) },
        },
        select: { productCode: true, reportDate: true },
      });
      const datesByProduct = new Map<string, Set<string>>();
      recentRows.forEach((row) => {
        const dates = datesByProduct.get(row.productCode) || new Set<string>();
        dates.add(row.reportDate.toISOString().slice(0, 10));
        datesByProduct.set(row.productCode, dates);
      });
      const recurringCodes = Array.from(datesByProduct.entries())
        .filter(([, dates]) => dates.size > 1)
        .map(([productCode]) => productCode);
      where.productCode = { in: recurringCodes };
    }

    const [items, total, statusGroups] = await Promise.all([
      prisma.marginViolation.findMany({
        where,
        include: {
          bases: { orderBy: { basis: 'asc' } },
          assignees: { orderBy: { userName: 'asc' } },
          notes: { orderBy: { createdAt: 'desc' }, take: 3 },
          exclusionProposals: { orderBy: { createdAt: 'desc' }, take: 3 },
        },
        orderBy: [{ reportDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.marginViolation.count({ where }),
      prisma.marginViolation.groupBy({
        by: ['status'],
        where: scope,
        _count: { _all: true },
      }),
    ]);

    const productCodes = Array.from(new Set(items.map((item) => item.productCode).filter(Boolean)));
    const earliest = items.length ? items.reduce((min, item) => item.reportDate < min ? item.reportDate : min, items[0].reportDate) : new Date();
    const repeatRows = productCodes.length
      ? await prisma.marginViolation.findMany({
          where: {
            productCode: { in: productCodes },
            reportDate: { gte: addDaysUtc(earliest, -6) },
            status: { not: 'INVALIDATED' },
          },
          select: { productCode: true, reportDate: true },
        })
      : [];
    const repeatMap = new Map<string, Set<string>>();
    repeatRows.forEach((row) => {
      const dates = repeatMap.get(row.productCode) || new Set<string>();
      dates.add(row.reportDate.toISOString().slice(0, 10));
      repeatMap.set(row.productCode, dates);
    });

    const mapped = items.map((item) => this.mapViolation(item, actor, repeatMap.get(item.productCode)?.size || 1));

    return {
      items: mapped,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      summary: Object.fromEntries(statusGroups.map((row) => [row.status, row._count._all])),
      scope: { canManage: actorCanManage(actor) },
    };
  }

  async getDashboard(actor: Actor) {
    const scope = this.scopeWhere(actor);
    const [open, inReview, resolved, unassigned, due, proposals] = await Promise.all([
      prisma.marginViolation.count({ where: { ...scope, status: { in: ['OPEN', 'REOPENED'] } } }),
      prisma.marginViolation.count({ where: { ...scope, status: 'IN_REVIEW' } }),
      prisma.marginViolation.count({ where: { ...scope, status: { in: ['RESOLVED', 'ADMIN_CLOSED'] } } }),
      actorCanManage(actor) ? prisma.marginViolation.count({ where: { status: { in: [...OPEN_STATUSES] }, assignees: { none: {} } } }) : Promise.resolve(0),
      prisma.marginViolation.count({ where: { ...scope, status: { in: [...OPEN_STATUSES] }, escalatedAt: { not: null } } }),
      actorCanManage(actor) ? prisma.marginViolationExclusionProposal.count({ where: { status: 'PENDING' } }) : Promise.resolve(0),
    ]);
    return { open, inReview, resolved, unassigned, escalated: due, pendingExclusionProposals: proposals, totalOpen: open + inReview };
  }

  async getManagerScorecard(actor: Actor) {
    if (!actorCanManage(actor)) throw new AppError('Yonetici yetkisi gerekli.', 403, ErrorCode.FORBIDDEN);
    const since = addDaysUtc(new Date(), -30);
    const rows = await prisma.marginViolation.findMany({
      where: { reportDate: { gte: since } },
      select: {
        id: true, productCode: true, status: true, createdAt: true, resolvedAt: true,
        assignees: { select: { userId: true, userName: true } },
      },
    });
    const byUser = new Map<string, { userId: string; userName: string; total: number; open: number; resolved: number; resolutionHours: number; recurringProducts: Map<string, number> }>();
    rows.forEach((row) => row.assignees.forEach((assignee) => {
      const current = byUser.get(assignee.userId) || {
        userId: assignee.userId, userName: assignee.userName || 'Personel', total: 0, open: 0, resolved: 0, resolutionHours: 0, recurringProducts: new Map<string, number>(),
      };
      current.total += 1;
      if (OPEN_STATUSES.includes(row.status as any)) current.open += 1;
      if (row.resolvedAt) {
        current.resolved += 1;
        current.resolutionHours += Math.max(0, (row.resolvedAt.getTime() - row.createdAt.getTime()) / 3600000);
      }
      current.recurringProducts.set(row.productCode, (current.recurringProducts.get(row.productCode) || 0) + 1);
      byUser.set(assignee.userId, current);
    }));
    return Array.from(byUser.values()).map((row) => ({
      userId: row.userId,
      userName: row.userName,
      total: row.total,
      open: row.open,
      resolved: row.resolved,
      avgResolutionHours: row.resolved ? Math.round((row.resolutionHours / row.resolved) * 10) / 10 : null,
      recurringProductCount: Array.from(row.recurringProducts.values()).filter((count) => count > 1).length,
    })).sort((a, b) => b.open - a.open || (b.avgResolutionHours || 0) - (a.avgResolutionHours || 0));
  }

  async generateForDates(reportDates: Date[]) {
    const reps = await prisma.user.findMany({
      where: { role: 'SALES_REP', active: true },
      select: { id: true, name: true, displayName: true, mikroName: true, assignedSectorCodes: true },
    });
    const repsBySector = new Map<string, typeof reps>();
    reps.forEach((rep) => (rep.assignedSectorCodes || []).forEach((code) => {
      const normalized = normalizeCode(code);
      if (!normalized) return;
      const list = repsBySector.get(normalized) || [];
      if (!list.some((item) => item.id === rep.id)) list.push(rep);
      repsBySector.set(normalized, list);
    }));

    const notificationsByUser = new Map<string, number>();
    let created = 0;
    let updated = 0;
    let invalidated = 0;
    let unassigned = 0;

    for (const reportDate of reportDates) {
      const candidates = await reportsService.getMarginViolationCandidatesForDate(reportDate);
      const existing = await prisma.marginViolation.findMany({
        where: { reportDate },
        select: { id: true, rowKey: true, status: true, invalidatedAt: true },
      });
      const existingByKey = new Map(existing.map((item) => [item.rowKey, item]));
      const seenKeys = new Set<string>();

      for (const candidate of candidates) {
        seenKeys.add(candidate.rowKey);
        const previous = existingByKey.get(candidate.rowKey);
        const assignees = repsBySector.get(normalizeCode(candidate.sectorCode)) || [];
        if (!assignees.length) unassigned += 1;
        const violation = await prisma.$transaction(async (tx) => {
          const { bases, ...candidateData } = candidate;
          const record = await tx.marginViolation.upsert({
            where: { reportDate_rowKey: { reportDate, rowKey: candidate.rowKey } },
            create: {
              ...candidateData,
              snapshot: candidate.snapshot as Prisma.InputJsonValue,
            },
            update: {
              fingerprint: candidate.fingerprint,
              documentNo: candidate.documentNo,
              documentType: candidate.documentType,
              customerCode: candidate.customerCode,
              customerName: candidate.customerName,
              productCode: candidate.productCode,
              productName: candidate.productName,
              quantity: candidate.quantity,
              unit: candidate.unit,
              quantityLabel: candidate.quantityLabel,
              unitPrice: candidate.unitPrice,
              revenueNet: candidate.revenueNet,
              revenueGross: candidate.revenueGross,
              sectorCode: candidate.sectorCode,
              snapshot: candidate.snapshot as Prisma.InputJsonValue,
              lastSeenAt: new Date(),
              invalidatedAt: null,
              ...(previous?.status === 'INVALIDATED' ? { status: 'REOPENED' as any } : {}),
            },
          });
          const activeBases = bases.map((basis) => basis.basis);
          await tx.marginViolationBasis.deleteMany({
            where: { violationId: record.id, basis: { notIn: activeBases as any } },
          });
          for (const basis of bases) {
            await tx.marginViolationBasis.upsert({
              where: { violationId_basis: { violationId: record.id, basis: basis.basis as any } },
              create: { violationId: record.id, ...basis as any },
              update: { ...basis as any },
            });
          }
          const assigneeIds = assignees.map((rep) => rep.id);
          await tx.marginViolationAssignee.deleteMany({
            where: { violationId: record.id, ...(assigneeIds.length ? { userId: { notIn: assigneeIds } } : {}) },
          });
          for (const rep of assignees) {
            await tx.marginViolationAssignee.upsert({
              where: { violationId_userId: { violationId: record.id, userId: rep.id } },
              create: {
                violationId: record.id,
                userId: rep.id,
                userName: rep.displayName || rep.mikroName || rep.name,
              },
              update: { userName: rep.displayName || rep.mikroName || rep.name },
            });
          }
          return record;
        });

        if (!previous || previous.status === 'INVALIDATED') {
          created += 1;
          assignees.forEach((rep) => notificationsByUser.set(rep.id, (notificationsByUser.get(rep.id) || 0) + 1));
          if (previous?.status === 'INVALIDATED') {
            await this.addSystemNote(violation.id, 'Kaynak satir yeniden rapora girdi; ihlal tekrar acildi.');
          }
        } else {
          updated += 1;
        }
      }

      const disappeared = existing.filter((item) => !seenKeys.has(item.rowKey) && !item.invalidatedAt);
      if (disappeared.length) {
        const openDisappearedIds = disappeared
          .filter((item) => OPEN_STATUSES.includes(item.status as any))
          .map((item) => item.id);
        await prisma.marginViolation.updateMany({
          where: { id: { in: disappeared.map((item) => item.id) } },
          data: { invalidatedAt: new Date() },
        });
        if (openDisappearedIds.length) {
          await prisma.marginViolation.updateMany({
            where: { id: { in: openDisappearedIds } },
            data: { status: 'INVALIDATED' },
          });
        }
        await prisma.marginViolationNote.createMany({
          data: disappeared.map((item) => ({
            violationId: item.id,
            authorName: 'Sistem',
            body: 'Yeniden senkronizasyonda kaynak satir artik ihlal olarak bulunamadi; kayit audit icin korundu.',
            isSystem: true,
          })),
        });
        invalidated += disappeared.length;
      }
    }

    for (const [userId, count] of notificationsByUser) {
      await notificationService.createForUsers([userId], {
        category: 'MARGIN',
        title: `${count} yeni marj ihlalin var`,
        body: 'Maliyet alti satislari inceleyip aciklama ekleyin.',
        linkUrl: '/margin-violations?assignee=me&status=OPEN',
        channels: { web: true, mobile: false },
      });
      await prisma.marginViolationAssignee.updateMany({
        where: { userId, violation: { reportDate: { in: reportDates } }, notifiedAt: null },
        data: { notifiedAt: new Date() },
      });
    }
    if (unassigned > 0) {
      const managers = await prisma.user.findMany({
        where: { active: true, role: { in: ['HEAD_ADMIN', 'ADMIN', 'MANAGER'] } },
        select: { id: true },
      });
      await notificationService.createForUsers(managers.map((user) => user.id), {
        category: 'MARGIN',
        title: `${unassigned} sahipsiz marj ihlali`,
        body: 'Sektor atamasi olmayan ihlalleri yonetim havuzundan inceleyin.',
        linkUrl: '/margin-violations?unassigned=true',
        channels: { web: true, mobile: false },
      });
    }
    await prisma.marginViolation.updateMany({
      where: { reportDate: { in: reportDates }, firstNotifiedAt: null, status: { in: [...OPEN_STATUSES] } },
      data: { firstNotifiedAt: new Date() },
    });
    return { created, updated, invalidated, unassigned, notifiedUsers: notificationsByUser.size };
  }

  async claim(id: string, actor: Actor) {
    const violation = await this.requireViolation(id, actor);
    if (!OPEN_STATUSES.includes(violation.status as any)) throw new AppError('Bu ihlal sahiplenilemez.', 400, ErrorCode.BAD_REQUEST);
    if (violation.claimedById && violation.claimedById !== actor.userId && !actorCanManage(actor)) {
      throw new AppError('Bu ihlal baska bir personel tarafindan sahiplenildi.', 409, ErrorCode.BAD_REQUEST);
    }
    const user = await this.resolveUser(actor.userId);
    const updated = await prisma.marginViolation.update({
      where: { id },
      data: {
        claimedById: actor.userId,
        claimedByName: user.name,
        claimedAt: violation.claimedAt || new Date(),
        status: 'IN_REVIEW',
      },
    });
    await this.addSystemNote(id, `${user.name} ihlali incelemeye aldi.`, actor.userId);
    return updated;
  }

  async addNote(id: string, body: string, actor: Actor) {
    await this.requireViolation(id, actor);
    const note = normalizeText(body);
    if (!note) throw new AppError('Not zorunludur.', 400, ErrorCode.MISSING_REQUIRED_FIELD);
    const user = await this.resolveUser(actor.userId);
    return prisma.marginViolationNote.create({
      data: { violationId: id, authorId: actor.userId || null, authorName: user.name, body: note },
    });
  }

  async resolve(id: string, input: any, actor: Actor) {
    const violation = await this.requireViolation(id, actor);
    if (!OPEN_STATUSES.includes(violation.status as any)) throw new AppError('Yalniz acik ihlaller kapatilabilir.', 400, ErrorCode.BAD_REQUEST);
    if (violation.claimedById && violation.claimedById !== actor.userId && !actorCanManage(actor)) {
      throw new AppError('Bu ihlal baska bir personel tarafindan sahiplenildi.', 409, ErrorCode.BAD_REQUEST);
    }
    const resolutionType = normalizeCode(input.resolutionType);
    const note = normalizeText(input.note);
    if (!RESOLUTION_TYPES.has(resolutionType)) throw new AppError('Gecerli bir kapatma nedeni secin.', 400, ErrorCode.INVALID_INPUT);
    if (!note) throw new AppError('Kapatma notu zorunludur.', 400, ErrorCode.MISSING_REQUIRED_FIELD);
    const user = await this.resolveUser(actor.userId);
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.marginViolation.update({
        where: { id },
        data: {
          status: 'RESOLVED',
          resolutionType: resolutionType as any,
          resolvedById: actor.userId || null,
          resolvedByName: user.name,
          resolvedAt: new Date(),
          claimedById: violation.claimedById || actor.userId || null,
          claimedByName: violation.claimedByName || user.name,
          claimedAt: violation.claimedAt || new Date(),
        },
      });
      await tx.marginViolationNote.create({
        data: { violationId: id, authorId: actor.userId || null, authorName: user.name, body: note },
      });
      return row;
    });
    return updated;
  }

  async reopen(id: string, noteInput: string, actor: Actor) {
    if (!actorCanManage(actor)) throw new AppError('Yonetici yetkisi gerekli.', 403, ErrorCode.FORBIDDEN);
    const violation = await this.requireViolation(id, actor);
    const note = normalizeText(noteInput);
    if (!note) throw new AppError('Yeniden acma gerekcesi zorunludur.', 400, ErrorCode.MISSING_REQUIRED_FIELD);
    const user = await this.resolveUser(actor.userId);
    const updated = await prisma.marginViolation.update({
      where: { id },
      data: { status: 'REOPENED', resolutionType: null, resolvedById: null, resolvedByName: null, resolvedAt: null, invalidatedAt: null },
    });
    await this.addSystemNote(id, `${user.name} kaydi yeniden acti: ${note}`, actor.userId);
    return updated;
  }

  async adminClose(id: string, noteInput: string, actor: Actor) {
    if (!actorCanManage(actor)) throw new AppError('Yonetici yetkisi gerekli.', 403, ErrorCode.FORBIDDEN);
    await this.requireViolation(id, actor);
    const note = normalizeText(noteInput);
    if (!note) throw new AppError('Yonetici kapatma gerekcesi zorunludur.', 400, ErrorCode.MISSING_REQUIRED_FIELD);
    const user = await this.resolveUser(actor.userId);
    const updated = await prisma.marginViolation.update({
      where: { id },
      data: { status: 'ADMIN_CLOSED', resolvedById: actor.userId || null, resolvedByName: user.name, resolvedAt: new Date() },
    });
    await this.addSystemNote(id, `${user.name} yonetici kapatmasi yapti: ${note}`, actor.userId);
    return updated;
  }

  async proposeExclusion(id: string, input: any, actor: Actor) {
    const violation = await this.requireViolation(id, actor);
    const type = normalizeCode(input.type || 'PRODUCT_CODE') as MarginExclusionTypeValue;
    const value = normalizeText(input.value || (type === 'PRODUCT_CODE' ? violation.productCode : violation.productName));
    const note = normalizeText(input.note);
    if (!PROPOSAL_TYPES.has(type) || !value) throw new AppError('Gecersiz dislama onerisi.', 400, ErrorCode.INVALID_INPUT);
    if (!note) throw new AppError('Dislama onerisi gerekcesi zorunludur.', 400, ErrorCode.MISSING_REQUIRED_FIELD);
    const user = await this.resolveUser(actor.userId);
    const proposal = await prisma.marginViolationExclusionProposal.create({
      data: {
        violationId: id,
        type: type as any,
        value,
        label: normalizeText(input.label || violation.productName) || null,
        note,
        proposedById: actor.userId || null,
        proposedByName: user.name,
      },
    });
    await this.addSystemNote(id, `${user.name} dislama onerisi acti: ${note}`, actor.userId);
    const managers = await prisma.user.findMany({ where: { active: true, role: { in: ['HEAD_ADMIN', 'ADMIN', 'MANAGER'] } }, select: { id: true } });
    await notificationService.createForUsers(managers.map((item) => item.id), {
      category: 'MARGIN', title: 'Yeni marj dislama onerisi', body: `${violation.productCode} icin yonetici karari bekleniyor.`, linkUrl: `/margin-violations?proposal=pending&search=${encodeURIComponent(violation.productCode)}`, channels: { web: true, mobile: false },
    });
    return proposal;
  }

  async decideExclusion(proposalId: string, input: any, actor: Actor) {
    if (!actorCanManage(actor)) throw new AppError('Yonetici yetkisi gerekli.', 403, ErrorCode.FORBIDDEN);
    const proposal = await prisma.marginViolationExclusionProposal.findUnique({ where: { id: proposalId }, include: { violation: true } });
    if (!proposal) throw new AppError('Dislama onerisi bulunamadi.', 404, ErrorCode.NOT_FOUND);
    if (proposal.status !== 'PENDING') throw new AppError('Bu oneri daha once karara baglanmis.', 409, ErrorCode.BAD_REQUEST);
    const approve = input.approve === true;
    const decisionNote = normalizeText(input.note);
    if (!decisionNote) throw new AppError('Karar notu zorunludur.', 400, ErrorCode.MISSING_REQUIRED_FIELD);
    const user = await this.resolveUser(actor.userId);
    let exclusionId: string | null = null;
    if (approve) {
      try {
        const exclusion = await marginExclusionService.create({
          type: proposal.type as MarginExclusionTypeValue,
          value: proposal.value,
          label: proposal.label,
          note: `${proposal.note} | Onay: ${decisionNote}`,
          createdBy: actor.userId || null,
        });
        exclusionId = exclusion.id;
      } catch (error: any) {
        if (error?.statusCode !== 409 && error?.status !== 409) throw error;
      }
    }
    const updated = await prisma.marginViolationExclusionProposal.update({
      where: { id: proposalId },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        decidedById: actor.userId || null,
        decidedByName: user.name,
        decisionNote,
        decidedAt: new Date(),
        marginExclusionId: exclusionId,
      },
    });
    await this.addSystemNote(proposal.violationId, `${user.name} dislama onerisini ${approve ? 'onayladi' : 'reddetti'}: ${decisionNote}`, actor.userId);
    return updated;
  }

  async openPriceVerification(id: string, noteInput: string, actor: Actor) {
    const violation = await this.requireViolation(id, actor);
    if (violation.priceVerificationRequestId) return { requestId: violation.priceVerificationRequestId, existing: true };
    const note = normalizeText(noteInput) || 'Marj ihlalinde maliyet verisi kontrol edilmeli.';
    const result = await priceVerificationService.createRequest({
      type: 'EXISTING_PRODUCT',
      priority: 'HIGH',
      productCode: violation.productCode,
      productName: violation.productName,
      customerCode: violation.customerCode,
      customerName: violation.customerName,
      currentUnitPrice: violation.unitPrice,
      sourceType: 'MARGIN_VIOLATION',
      sourceRef: violation.id,
      sourceUrl: `/margin-violations?search=${encodeURIComponent(violation.productCode)}`,
      note,
    }, actor);
    const requestId = result.request.id;
    await prisma.marginViolation.update({ where: { id }, data: { priceVerificationRequestId: requestId } });
    await this.addSystemNote(id, `Fiyat/maliyet teyit talebi acildi: ${result.request.requestNo}`, actor.userId);
    return { requestId, requestNo: result.request.requestNo, existing: false };
  }

  async processEscalations() {
    const settings = await reportsService.getMarginRuntimeSettings();
    const candidates = await prisma.marginViolation.findMany({
      where: { status: { in: [...OPEN_STATUSES] }, escalatedAt: null },
      include: { assignees: { select: { userId: true } } },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    });
    const due = candidates.filter((item) => businessDaysBetween(item.createdAt, new Date()) >= settings.escalationBusinessDays);
    if (!due.length) return { escalated: 0 };
    const managers = await prisma.user.findMany({ where: { active: true, role: { in: ['HEAD_ADMIN', 'ADMIN', 'MANAGER'] } }, select: { id: true } });
    for (const item of due) {
      await notificationService.createForUsers(
        [...item.assignees.map((assignee) => assignee.userId), ...managers.map((manager) => manager.id)],
        { category: 'MARGIN', title: 'Geciken marj ihlali', body: `${item.productCode} ihlali ${settings.escalationBusinessDays} is gunudur acik.`, linkUrl: `/margin-violations?search=${encodeURIComponent(item.productCode)}`, channels: { web: true, mobile: false } }
      );
    }
    await prisma.marginViolation.updateMany({ where: { id: { in: due.map((item) => item.id) } }, data: { escalatedAt: new Date() } });
    return { escalated: due.length };
  }
}

export default new MarginViolationService();
