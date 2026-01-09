import { Request, Response, NextFunction } from 'express';
import { Prisma, VadeBalanceSource } from '@prisma/client';
import { prisma } from '../utils/prisma';
import vadeService from '../services/vade.service';
import vadeSyncService from '../services/vadeSync.service';

const parseNumber = (value: any, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseBoolean = (value: any) => value === 'true' || value === true;

const parseDateInput = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const ensureSalesRepAccess = async (req: Request, customerId: string) => {
  if (req.user?.role !== 'SALES_REP') return true;
  if (!req.user.assignedSectorCodes?.length) return false;
  const customer = await prisma.user.findUnique({
    where: { id: customerId },
    select: { sectorCode: true },
  });
  if (!customer) return false;
  return req.user.assignedSectorCodes.includes(customer.sectorCode || '');
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

      const where: Prisma.VadeBalanceWhereInput = {};
      const userWhere: Prisma.UserWhereInput = {};

      if (overdueOnly) {
        where.pastDueBalance = { gt: 0 };
      }
      if (upcomingOnly) {
        where.notDueBalance = { gt: 0 };
      }

      if (search) {
        userWhere.OR = [
          { mikroCariCode: { contains: search, mode: 'insensitive' } },
          { mikroName: { contains: search, mode: 'insensitive' } },
          { displayName: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
        ];
      }

      if (req.user?.role === 'SALES_REP' && req.user.assignedSectorCodes?.length) {
        userWhere.sectorCode = { in: req.user.assignedSectorCodes };
      }

      if (Object.keys(userWhere).length > 0) {
        where.user = userWhere;
      }

      const [balances, total] = await prisma.$transaction([
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
          orderBy: [{ pastDueBalance: 'desc' }, { totalBalance: 'desc' }],
          take: limit,
          skip: offset,
        }),
        prisma.vadeBalance.count({ where }),
      ]);

      res.json({
        balances,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
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

      const hasAccess = await ensureSalesRepAccess(req, customerId);
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

      const hasAccess = await ensureSalesRepAccess(req, customerId);
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

      if (req.user?.role === 'SALES_REP' && req.user.assignedSectorCodes?.length) {
        where.customer = {
          sectorCode: { in: req.user.assignedSectorCodes },
        };
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

      const hasAccess = await ensureSalesRepAccess(req, noteRecord.customerId);
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

      const hasAccess = await ensureSalesRepAccess(req, customerId);
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

      if (customerId) {
        const assignments = await vadeService.listAssignmentsForCustomer(customerId);
        res.json({ assignments });
        return;
      }

      const targetStaffId = staffId || req.user?.userId;
      if (!targetStaffId) {
        res.status(400).json({ error: 'staffId is required' });
        return;
      }

      const assignments = await vadeService.listAssignmentsForStaff(targetStaffId);
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
        select: { id: true, mikroCariCode: true },
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
      const result = await vadeSyncService.syncFromMikro('MANUAL');
      res.json(result);
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
