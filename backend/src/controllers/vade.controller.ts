import { Request, Response, NextFunction } from 'express';
import { Prisma, VadeBalanceSource } from '@prisma/client';
import { prisma } from '../utils/prisma';
import vadeService from '../services/vade.service';
import vadeSyncService from '../services/vadeSync.service';

const parseNumber = (value: any, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseOptionalNumber = (value: any) => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseBoolean = (value: any) => value === 'true' || value === true;

const parseDateInput = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const canAccessAllSectors = (role?: string) =>
  role === 'HEAD_ADMIN' || role === 'ADMIN' || role === 'MANAGER';

const EXCLUDED_SECTOR_CODES = ['DİĞER', 'DIGER', 'FATURA', 'SATICI', 'SORUNLU', 'SORUNLU CARİ', 'SORUNLU CARI'] as const;
const normalizeSectorCode = (value?: string | null) =>
  (value || '').trim().toLocaleUpperCase('tr-TR');
const EXCLUDED_SECTOR_PREFIXES = EXCLUDED_SECTOR_CODES.map(normalizeSectorCode);
const isExcludedSectorCode = (value?: string | null) => {
  const normalized = normalizeSectorCode(value);
  if (!normalized) return false;
  return EXCLUDED_SECTOR_PREFIXES.some((code) =>
    normalized === code || normalized.startsWith(code)
  );
};
const buildExcludedSectorFilters = () =>
  EXCLUDED_SECTOR_CODES.map((code) => ({
    sectorCode: { startsWith: code, mode: 'insensitive' as const },
  }));

const getAssignedSectorCodes = (req: Request) =>
  (req.user?.assignedSectorCodes || [])
    .map((code) => String(code).trim())
    .filter(Boolean)
    .filter((code) => !isExcludedSectorCode(code));

const ensureSectorAccess = async (req: Request, customerId: string) => {
  const customer = await prisma.user.findUnique({
    where: { id: customerId },
    select: { sectorCode: true },
  });
  if (!customer) return false;
  if (isExcludedSectorCode(customer.sectorCode)) return false;
  if (canAccessAllSectors(req.user?.role)) return true;
  const assignedCodes = getAssignedSectorCodes(req);
  if (assignedCodes.length === 0) return false;
  return assignedCodes.includes(customer.sectorCode || '');
};

class VadeController {
  async getBalances(req: Request, res: Response, next: NextFunction) {
    try {
      const search = (req.query.search as string) || '';
      const page = parseNumber(req.query.page, 1);
      const limit = Math.min(parseNumber(req.query.limit, 50), 200);
      const offset = Math.max(0, (page - 1) * limit);
      const overdueOnly = parseBoolean(req.query.overdueOnly);
      const upcomingOnly = parseBoolean(req.query.upcomingOnly);
      const sectorCode = (req.query.sectorCode as string) || '';
      const groupCode = (req.query.groupCode as string) || '';
      const hasNotes = parseBoolean(req.query.hasNotes);
      const notesKeyword = ((req.query.notesKeyword as string) || '').trim();
      const minBalance = parseOptionalNumber(req.query.minBalance);
      const maxBalance = parseOptionalNumber(req.query.maxBalance);
      const sortBy = (req.query.sortBy as string) || 'pastDueBalance';
      const sortDirection = req.query.sortDirection === 'asc' ? 'asc' : 'desc';
      const exportAll = parseBoolean(req.query.export);

      const where: Prisma.VadeBalanceWhereInput = {};
      const userWhere: Prisma.UserWhereInput = {};
      const excludedSectorCodes = [...EXCLUDED_SECTOR_CODES];
      const excludedSectorFilters = buildExcludedSectorFilters();

      if (excludedSectorFilters.length > 0) {
        userWhere.NOT = { OR: excludedSectorFilters };
      }

      if (sectorCode && isExcludedSectorCode(sectorCode)) {
        res.json({
          balances: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
          },
          summary: {
            overdue: 0,
            upcoming: 0,
            total: 0,
          },
        });
        return;
      }

      if (overdueOnly) {
        where.pastDueBalance = { gt: 0 };
      }
      if (upcomingOnly) {
        where.notDueBalance = { gt: 0 };
      }
      if (minBalance !== undefined || maxBalance !== undefined) {
        where.totalBalance = {
          ...(minBalance !== undefined ? { gte: minBalance } : {}),
          ...(maxBalance !== undefined ? { lte: maxBalance } : {}),
        };
      }

      if (search) {
        userWhere.OR = [
          { mikroCariCode: { contains: search, mode: 'insensitive' } },
          { mikroName: { contains: search, mode: 'insensitive' } },
          { displayName: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { sectorCode: { contains: search, mode: 'insensitive' } },
          { groupCode: { contains: search, mode: 'insensitive' } },
        ];
      }

      if (groupCode) {
        userWhere.groupCode = { equals: groupCode };
      }

      if (hasNotes || notesKeyword) {
        userWhere.vadeNotes = {
          some: notesKeyword
            ? { noteContent: { contains: notesKeyword, mode: 'insensitive' } }
            : {},
        };
      }

      const sectorFilter: Prisma.StringFilter = {};
      let hasSectorFilter = false;
      if (sectorCode) {
        sectorFilter.equals = sectorCode;
        hasSectorFilter = true;
      }
      if (excludedSectorCodes.length > 0) {
        sectorFilter.notIn = excludedSectorCodes;
        hasSectorFilter = true;
      }

      if (!canAccessAllSectors(req.user?.role)) {
        const assignedCodes = getAssignedSectorCodes(req);
        if (assignedCodes.length === 0) {
          res.json({
            balances: [],
            pagination: {
              page,
              limit,
              total: 0,
              totalPages: 0,
            },
            summary: {
              overdue: 0,
              upcoming: 0,
              total: 0,
            },
          });
          return;
        }
        sectorFilter.in = assignedCodes;
        hasSectorFilter = true;
      }

      if (hasSectorFilter) {
        userWhere.sectorCode = sectorFilter;
      }

      if (Object.keys(userWhere).length > 0) {
        where.user = userWhere;
      }

      const orderBy: Prisma.VadeBalanceOrderByWithRelationInput[] = [];
      if (sortBy !== 'lastNoteAt') {
        switch (sortBy) {
          case 'customerName':
            orderBy.push(
              { user: { displayName: sortDirection } },
              { user: { mikroName: sortDirection } },
              { user: { name: sortDirection } },
            );
            break;
          case 'mikroCariCode':
            orderBy.push({ user: { mikroCariCode: sortDirection } });
            break;
          case 'sectorCode':
            orderBy.push({ user: { sectorCode: sortDirection } });
            break;
          case 'groupCode':
            orderBy.push({ user: { groupCode: sortDirection } });
            break;
          case 'pastDueDate':
            orderBy.push({ pastDueDate: sortDirection });
            break;
          case 'notDueDate':
            orderBy.push({ notDueDate: sortDirection });
            break;
          case 'notDueBalance':
            orderBy.push({ notDueBalance: sortDirection });
            break;
          case 'totalBalance':
            orderBy.push({ totalBalance: sortDirection });
            break;
          case 'valor':
            orderBy.push({ valor: sortDirection });
            break;
          case 'updatedAt':
            orderBy.push({ updatedAt: sortDirection });
            break;
          default:
            orderBy.push({ pastDueBalance: sortDirection });
            break;
        }
        if (orderBy.length === 0) {
          orderBy.push({ pastDueBalance: 'desc' }, { totalBalance: 'desc' });
        }
      }

      const paginationOptions: { take?: number; skip?: number } = exportAll || sortBy === 'lastNoteAt'
        ? {}
        : { take: limit, skip: offset };

      const [balances, total, summary] = await prisma.$transaction([
        prisma.vadeBalance.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                displayName: true,
                mikroName: true,
                mikroCariCode: true,
                sectorCode: true,
                groupCode: true,
                city: true,
                district: true,
                phone: true,
                paymentPlanNo: true,
                paymentPlanCode: true,
                paymentPlanName: true,
                balance: true,
                isLocked: true,
              },
            },
          },
          orderBy: orderBy.length > 0 ? orderBy : undefined,
          ...paginationOptions,
        }),
        exportAll || sortBy === 'lastNoteAt'
          ? prisma.vadeBalance.count({ where })
          : prisma.vadeBalance.count({ where }),
        prisma.vadeBalance.aggregate({
          where,
          _sum: {
            pastDueBalance: true,
            notDueBalance: true,
            totalBalance: true,
          },
        }),
      ]);

      type BalanceWithNote = (typeof balances)[number] & { lastNoteAt: Date | null };
      const balancesWithNotes: BalanceWithNote[] = await (async () => {
        if (balances.length === 0) return balances as BalanceWithNote[];
        const userIds = balances.map((balance) => balance.userId);
        const lastNotes = await prisma.vadeNote.groupBy({
          by: ['customerId'],
          where: { customerId: { in: userIds } },
          _max: { createdAt: true },
        });
        const lastNoteMap = new Map(
          lastNotes.map((item) => [item.customerId, item._max.createdAt || null])
        );
        return balances.map((balance) => ({
          ...balance,
          lastNoteAt: lastNoteMap.get(balance.userId) || null,
        })) as BalanceWithNote[];
      })();

      let pagedBalances = balancesWithNotes;
      if (sortBy === 'lastNoteAt') {
        pagedBalances = [...balancesWithNotes].sort((a, b) => {
          const aTime = a.lastNoteAt ? new Date(a.lastNoteAt).getTime() : 0;
          const bTime = b.lastNoteAt ? new Date(b.lastNoteAt).getTime() : 0;
          return sortDirection === 'asc' ? aTime - bTime : bTime - aTime;
        });
      }
      if (!exportAll && sortBy === 'lastNoteAt') {
        pagedBalances = pagedBalances.slice(offset, offset + limit);
      }

      res.json({
        balances: pagedBalances,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        summary: {
          overdue: summary._sum.pastDueBalance ?? 0,
          upcoming: summary._sum.notDueBalance ?? 0,
          total: summary._sum.totalBalance ?? 0,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getFilters(req: Request, res: Response, next: NextFunction) {
    try {
      const excludedSectorCodes = [...EXCLUDED_SECTOR_CODES];
      const excludedSectorFilters = buildExcludedSectorFilters();
      const sectorFilter: Prisma.StringFilter = {};
      let hasSectorFilter = false;

      if (excludedSectorCodes.length > 0) {
        sectorFilter.notIn = excludedSectorCodes;
        hasSectorFilter = true;
      }

      if (!canAccessAllSectors(req.user?.role)) {
        const assignedCodes = getAssignedSectorCodes(req);
        if (assignedCodes.length === 0) {
          res.json({ sectorCodes: [], groupCodes: [] });
          return;
        }
        sectorFilter.in = assignedCodes;
        hasSectorFilter = true;
      }

      const where: Prisma.UserWhereInput = {
        role: 'CUSTOMER',
        vadeBalance: { isNot: null },
      };

      if (excludedSectorFilters.length > 0) {
        where.NOT = { OR: excludedSectorFilters };
      }


      if (hasSectorFilter) {
        where.sectorCode = sectorFilter;
      }

      const users = await prisma.user.findMany({
        where,
        select: { sectorCode: true, groupCode: true },
      });

      const sectorCodes = [...new Set(
        users.map((user) => user.sectorCode).filter(Boolean)
      )].sort();
      const groupCodes = [...new Set(
        users.map((user) => user.groupCode).filter(Boolean)
      )].sort();

      res.json({ sectorCodes, groupCodes });
    } catch (error) {
      next(error);
    }
  }

  async getCustomerDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const customerId = req.params.id;
      const customer = await prisma.user.findUnique({
        where: { id: customerId },
        select: {
          id: true,
          name: true,
          displayName: true,
          mikroName: true,
          mikroCariCode: true,
          sectorCode: true,
          groupCode: true,
          city: true,
          district: true,
          phone: true,
          paymentPlanNo: true,
          paymentPlanCode: true,
          paymentPlanName: true,
          balance: true,
          isLocked: true,
          vadeBalance: true,
          vadeClassification: true,
        },
      });

      if (!customer) {
        res.status(404).json({ error: 'Customer not found' });
        return;
      }

      const hasAccess = await ensureSectorAccess(req, customerId);
      if (!hasAccess) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const notes = await vadeService.listNotes(customerId);
      const assignments = await vadeService.listAssignmentsForCustomer(customerId);

      res.json({
        customer,
        notes,
        assignments,
      });
    } catch (error) {
      next(error);
    }
  }

  async createNote(req: Request, res: Response, next: NextFunction) {
    try {
      const authorId = req.user?.userId || null;
      const { customerId, noteContent, promiseDate, tags, reminderDate, reminderNote, reminderCompleted, balanceAtTime } =
        req.body;

      const hasAccess = await ensureSectorAccess(req, customerId);
      if (!hasAccess) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      let resolvedBalanceAtTime = balanceAtTime;
      if (resolvedBalanceAtTime === undefined) {
        const balance = await vadeService.getBalanceByUserId(customerId);
        resolvedBalanceAtTime = balance?.pastDueBalance ?? balance?.totalBalance ?? null;
      }

      const note = await vadeService.createNote({
        customerId,
        authorId,
        noteContent,
        promiseDate,
        tags,
        reminderDate,
        reminderNote,
        reminderCompleted,
        balanceAtTime: resolvedBalanceAtTime,
      });

      res.json({ note });
    } catch (error) {
      next(error);
    }
  }

  async getNotes(req: Request, res: Response, next: NextFunction) {
    try {
      const customerId = (req.query.customerId as string) || undefined;
      const authorId = (req.query.authorId as string) || undefined;
      const tag = (req.query.tag as string) || undefined;
      const reminderOnly = parseBoolean(req.query.reminderOnly);
      const reminderCompleted = req.query.reminderCompleted !== undefined
        ? parseBoolean(req.query.reminderCompleted)
        : undefined;
      const startDate = parseDateInput(req.query.startDate as string);
      const endDate = parseDateInput(req.query.endDate as string);
      const reminderFrom = parseDateInput(req.query.reminderFrom as string);
      const reminderTo = parseDateInput(req.query.reminderTo as string);

      const where: Prisma.VadeNoteWhereInput = {};
      if (customerId) where.customerId = customerId;
      if (authorId) where.authorId = authorId;
      if (tag) where.tags = { has: tag };
      if (reminderCompleted !== undefined) where.reminderCompleted = reminderCompleted;

      if (startDate || endDate) {
        where.createdAt = {
          ...(startDate ? { gte: startDate } : {}),
          ...(endDate ? { lte: endDate } : {}),
        };
      }

      if (reminderOnly || reminderFrom || reminderTo) {
        where.reminderDate = {
          ...(reminderFrom ? { gte: reminderFrom } : {}),
          ...(reminderTo ? { lte: reminderTo } : {}),
          ...(reminderOnly ? { not: null } : {}),
        };
      }

      const excludedSectorCodes = [...EXCLUDED_SECTOR_CODES];
      const excludedSectorFilters = buildExcludedSectorFilters();
      const sectorFilter: Prisma.StringFilter = {};
      let hasSectorFilter = false;
      if (excludedSectorCodes.length > 0) {
        sectorFilter.notIn = excludedSectorCodes;
        hasSectorFilter = true;
      }

      if (!canAccessAllSectors(req.user?.role)) {
        const assignedCodes = getAssignedSectorCodes(req);
        if (assignedCodes.length === 0) {
          res.json({ notes: [] });
          return;
        }
        sectorFilter.in = assignedCodes;
        hasSectorFilter = true;
      }

      if (hasSectorFilter) {
        where.customer = {
          sectorCode: sectorFilter,
          ...(excludedSectorFilters.length > 0
            ? { NOT: { OR: excludedSectorFilters } }
            : {}),
        };
      } else if (excludedSectorFilters.length > 0) {
        where.customer = { NOT: { OR: excludedSectorFilters } };
      }

      const notes = await prisma.vadeNote.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true, displayName: true, mikroName: true, mikroCariCode: true, sectorCode: true } },
          author: { select: { id: true, name: true, email: true, role: true } },
        },
      });

      res.json({ notes });
    } catch (error) {
      next(error);
    }
  }

  async updateNote(req: Request, res: Response, next: NextFunction) {
    try {
      const noteId = req.params.id;
      const noteRecord = await prisma.vadeNote.findUnique({
        where: { id: noteId },
        select: { customerId: true },
      });
      if (!noteRecord) {
        res.status(404).json({ error: 'Note not found' });
        return;
      }

      const hasAccess = await ensureSectorAccess(req, noteRecord.customerId);
      if (!hasAccess) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const note = await vadeService.updateNote(noteId, req.body);
      res.json({ note });
    } catch (error) {
      next(error);
    }
  }

  async upsertClassification(req: Request, res: Response, next: NextFunction) {
    try {
      const { customerId, classification, customClassification, riskScore } = req.body;
      const updatedById = req.user?.userId || null;

      const hasAccess = await ensureSectorAccess(req, customerId);
      if (!hasAccess) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const record = await vadeService.upsertClassification({
        customerId,
        classification,
        customClassification,
        riskScore,
        createdById: updatedById,
        updatedById,
      });

      res.json({ classification: record });
    } catch (error) {
      next(error);
    }
  }

  async getAssignments(req: Request, res: Response, next: NextFunction) {
    try {
      const staffId = (req.query.staffId as string) || null;
      const customerId = (req.query.customerId as string) || null;
      const restrictBySector = !canAccessAllSectors(req.user?.role);
      const assignedCodes = getAssignedSectorCodes(req);

      if (customerId) {
        const hasAccess = await ensureSectorAccess(req, customerId);
        if (!hasAccess) {
          res.status(403).json({ error: 'Access denied' });
          return;
        }
        const assignments = await vadeService.listAssignmentsForCustomer(customerId);
        res.json({ assignments });
        return;
      }

      if (restrictBySector && staffId && staffId !== req.user?.userId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const targetStaffId = staffId || req.user?.userId;
      if (!targetStaffId) {
        res.status(400).json({ error: 'staffId is required' });
        return;
      }

      let assignments = await vadeService.listAssignmentsForStaff(targetStaffId);
      if (restrictBySector) {
        if (assignedCodes.length === 0) {
          res.json({ assignments: [] });
          return;
        }
        assignments = assignments.filter((item) =>
          assignedCodes.includes(item.customer?.sectorCode || '')
        );
      }
      assignments = assignments.filter((item) => !isExcludedSectorCode(item.customer?.sectorCode));

      res.json({ assignments });
    } catch (error) {
      next(error);
    }
  }

  async assignCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const { staffId, customerIds } = req.body;
      const assignedById = req.user?.userId || null;
      const result = await vadeService.assignCustomers({
        staffId,
        customerIds,
        assignedById,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async removeAssignment(req: Request, res: Response, next: NextFunction) {
    try {
      const { staffId, customerId } = req.body;
      await vadeService.removeAssignment(staffId, customerId);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  async importBalances(req: Request, res: Response, next: NextFunction) {
    try {
      const rows = req.body.rows || [];
      const codes = rows.map((row: any) => String(row.mikroCariCode || '').trim()).filter(Boolean);
      if (codes.length === 0) {
        res.status(400).json({ error: 'No rows to import' });
        return;
      }

      const users = await prisma.user.findMany({
        where: { mikroCariCode: { in: codes } },
        select: { id: true, mikroCariCode: true, sectorCode: true },
      });
      const userByCode = new Map(users.map((user) => [user.mikroCariCode || '', user]));

      let imported = 0;
      let skipped = 0;

      for (const row of rows) {
        const code = String(row.mikroCariCode || '').trim();
        const user = userByCode.get(code);
        if (!user) {
          skipped += 1;
          continue;
        }
        if (isExcludedSectorCode(user.sectorCode)) {
          skipped += 1;
          continue;
        }

        const pastDueBalance = Number(row.pastDueBalance ?? 0);
        const notDueBalance = Number(row.notDueBalance ?? 0);
        const totalBalance =
          row.totalBalance !== undefined && row.totalBalance !== null
            ? Number(row.totalBalance)
            : pastDueBalance + notDueBalance;

        await vadeService.upsertBalance({
          userId: user.id,
          pastDueBalance,
          pastDueDate: row.pastDueDate ?? null,
          notDueBalance,
          notDueDate: row.notDueDate ?? null,
          totalBalance,
          valor: row.valor ?? 0,
          paymentTermLabel: row.paymentTermLabel ?? null,
          referenceDate: row.referenceDate ?? null,
          source: VadeBalanceSource.EXCEL,
        });
        imported += 1;
      }

      const settings = await prisma.settings.findFirst();
      if (settings) {
        await prisma.settings.update({
          where: { id: settings.id },
          data: { lastVadeSyncAt: new Date() },
        });
      }

      res.json({ imported, skipped });
    } catch (error) {
      next(error);
    }
  }

  async triggerSync(req: Request, res: Response, next: NextFunction) {
    try {
      const syncLog = await vadeService.createSyncLog(VadeBalanceSource.MIKRO);
      vadeSyncService.syncFromMikro('MANUAL', syncLog.id)
        .catch((error) => console.error('Vade sync background error:', error));
      res.json({ success: true, started: true, syncLogId: syncLog.id });
    } catch (error) {
      next(error);
    }
  }

  async getSyncStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const syncLogId = req.params.id;
      const log = await prisma.vadeSyncLog.findUnique({
        where: { id: syncLogId },
      });

      if (!log) {
        res.status(404).json({ error: 'Sync log not found' });
        return;
      }

      res.json({ log });
    } catch (error) {
      next(error);
    }
  }
}

export default new VadeController();