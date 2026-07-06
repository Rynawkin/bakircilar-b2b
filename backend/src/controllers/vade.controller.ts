import { Request, Response, NextFunction } from 'express';
import { Prisma, VadeBalanceSource } from '@prisma/client';
import { prisma } from '../utils/prisma';
import vadeService from '../services/vade.service';
import vadeSyncService from '../services/vadeSync.service';
import config from '../config';

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

const round2 = (value: number) => Math.round(value * 100) / 100;

const normalizeBalanceBuckets = (balance: {
  pastDueBalance?: number | null;
  notDueBalance?: number | null;
  totalBalance?: number | null;
}) => {
  let pastDueBalance = Number(balance.pastDueBalance ?? 0);
  let notDueBalance = Number(balance.notDueBalance ?? 0);
  const totalBalance = Number(balance.totalBalance ?? pastDueBalance + notDueBalance);

  if (totalBalance >= 0) {
    if (pastDueBalance < 0) {
      notDueBalance = notDueBalance + pastDueBalance;
      pastDueBalance = 0;
    } else if (notDueBalance < 0) {
      pastDueBalance = pastDueBalance + notDueBalance;
      notDueBalance = 0;
    }
  }

  return {
    pastDueBalance: round2(pastDueBalance),
    notDueBalance: round2(notDueBalance),
  };
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

// Otomatik risk skoru (vade-main CustomerClassification.calculateRiskScore modeli):
// vadesi gecen oran (max 45) + gecikme gunu (max 35) + not sayisi (max 10) + kacirilan soz (max 10)
const computeSuggestedRisk = (
  balance: { pastDueBalance?: number | null; totalBalance?: number | null; valor?: number | null } | null | undefined,
  notes: Array<{ promiseDate?: Date | string | null }>,
): { riskScore: number; classification: string } => {
  if (!balance) return { riskScore: 0, classification: 'green' };
  const pastDue = Number(balance.pastDueBalance || 0);
  const total = Number(balance.totalBalance || 0);
  let score = 0;
  if (total > 0 && pastDue > 0) {
    score += Math.min((pastDue / total) * 90, 45);
  }
  const daysOverdue = Number(balance.valor || 0);
  if (daysOverdue > 0) score += Math.min(daysOverdue / 90, 1) * 35;
  const noteCount = notes.length;
  if (noteCount > 5) score += Math.min((noteCount - 5) / 10, 1) * 10;
  const now = Date.now();
  const missed = notes.filter((n) => n.promiseDate && new Date(n.promiseDate).getTime() < now).length;
  if (missed > 0) score += Math.min(missed / 3, 1) * 10;
  const riskScore = Math.round(Math.min(score, 100));
  const classification =
    riskScore < 30 ? 'green' : riskScore < 60 ? 'yellow' : riskScore < 80 ? 'red' : 'black';
  return { riskScore, classification };
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
      const classification = ((req.query.classification as string) || '').trim();
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
      const totalBalanceFilter: Prisma.FloatFilter = { gte: 0 };
      if (minBalance !== undefined) {
        totalBalanceFilter.gte = Math.max(0, minBalance);
      }
      if (maxBalance !== undefined) {
        totalBalanceFilter.lte = maxBalance;
      }
      where.totalBalance = totalBalanceFilter;

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

      if (classification) {
        if (classification === 'none') {
          userWhere.vadeClassification = { is: null };
        } else {
          userWhere.vadeClassification = { is: { classification } };
        }
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

      const [balances, total, summaryRows] = await prisma.$transaction([
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
                vadeClassification: {
                  select: { classification: true, customClassification: true, riskScore: true },
                },
              },
            },
          },
          orderBy: orderBy.length > 0 ? orderBy : undefined,
          ...paginationOptions,
        }),
        exportAll || sortBy === 'lastNoteAt'
          ? prisma.vadeBalance.count({ where })
          : prisma.vadeBalance.count({ where }),
        prisma.vadeBalance.findMany({
          where,
          select: {
            pastDueBalance: true,
            notDueBalance: true,
            totalBalance: true,
            valor: true,
          },
        }),
      ]);

      const agingBuckets = {
        d0_30: { amount: 0, count: 0 },
        d31_60: { amount: 0, count: 0 },
        d61_90: { amount: 0, count: 0 },
        d91_180: { amount: 0, count: 0 },
        d181_365: { amount: 0, count: 0 },
        d365plus: { amount: 0, count: 0 },
      };
      const overdueAmounts: number[] = [];

      const summary = summaryRows.reduce(
        (acc, row) => {
          const normalized = normalizeBalanceBuckets(row);
          acc.overdue += normalized.pastDueBalance;
          acc.upcoming += normalized.notDueBalance;
          acc.total += row.totalBalance ?? 0;
          const pastDue = normalized.pastDueBalance;
          if (pastDue > 0) {
            overdueAmounts.push(pastDue);
            const v = row.valor ?? 0;
            const bucket =
              v <= 30 ? agingBuckets.d0_30 :
              v <= 60 ? agingBuckets.d31_60 :
              v <= 90 ? agingBuckets.d61_90 :
              v <= 180 ? agingBuckets.d91_180 :
              v <= 365 ? agingBuckets.d181_365 :
              agingBuckets.d365plus;
            bucket.amount += pastDue;
            bucket.count += 1;
          }
          return acc;
        },
        { overdue: 0, upcoming: 0, total: 0 },
      );

      // Yogunlasma (Pareto): vadesi gecmis paranin ne kadari en buyuk N caride
      overdueAmounts.sort((a, b) => b - a);
      const cumTop = (n: number) =>
        round2(overdueAmounts.slice(0, n).reduce((s, x) => s + x, 0));
      const roundBucket = (b: { amount: number; count: number }) => ({
        amount: round2(b.amount),
        count: b.count,
      });
      const aging = {
        d0_30: roundBucket(agingBuckets.d0_30),
        d31_60: roundBucket(agingBuckets.d31_60),
        d61_90: roundBucket(agingBuckets.d61_90),
        d91_180: roundBucket(agingBuckets.d91_180),
        d181_365: roundBucket(agingBuckets.d181_365),
        d365plus: roundBucket(agingBuckets.d365plus),
      };
      const concentration = {
        overdueCount: overdueAmounts.length,
        top10: cumTop(10),
        top20: cumTop(20),
        top50: cumTop(50),
      };

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

      const normalizedBalances = balancesWithNotes.map((balance) => ({
        ...balance,
        ...normalizeBalanceBuckets(balance),
      }));

      let pagedBalances = normalizedBalances;
      if (sortBy === 'lastNoteAt') {
        pagedBalances = [...normalizedBalances].sort((a, b) => {
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
          overdue: round2(summary.overdue),
          upcoming: round2(summary.upcoming),
          total: round2(summary.total),
          aging,
          concentration,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      const sectorCode = (req.query.sectorCode as string) || '';
      const groupCode = (req.query.groupCode as string) || '';

      const emptyPayload = {
        kpis: { count: 0, overdue: 0, upcoming: 0, total: 0 },
        aging: null,
        concentration: { overdueCount: 0, top10: 0, top20: 0, top50: 0 },
        sectorDistribution: [] as Array<{ label: string; amount: number; count: number }>,
        groupDistribution: [] as Array<{ label: string; amount: number; count: number }>,
        topOverdue: [] as Array<{ id: string; code: string; name: string; sector: string; pastDue: number; valor: number }>,
      };

      if (sectorCode && isExcludedSectorCode(sectorCode)) {
        res.json(emptyPayload);
        return;
      }

      const where: Prisma.VadeBalanceWhereInput = { totalBalance: { gte: 0 } };
      const userWhere: Prisma.UserWhereInput = {};
      const excludedSectorFilters = buildExcludedSectorFilters();
      if (excludedSectorFilters.length > 0) {
        userWhere.NOT = { OR: excludedSectorFilters };
      }

      const sectorFilter: Prisma.StringFilter = { notIn: [...EXCLUDED_SECTOR_CODES] };
      if (sectorCode) sectorFilter.equals = sectorCode;

      if (!canAccessAllSectors(req.user?.role)) {
        const assignedCodes = getAssignedSectorCodes(req);
        if (assignedCodes.length === 0) {
          res.json(emptyPayload);
          return;
        }
        sectorFilter.in = assignedCodes;
      }
      userWhere.sectorCode = sectorFilter;
      if (groupCode) userWhere.groupCode = { equals: groupCode };
      where.user = userWhere;

      const rows = await prisma.vadeBalance.findMany({
        where,
        select: {
          pastDueBalance: true,
          notDueBalance: true,
          totalBalance: true,
          valor: true,
          notDueDate: true,
          user: {
            select: {
              id: true,
              mikroCariCode: true,
              name: true,
              displayName: true,
              mikroName: true,
              sectorCode: true,
              groupCode: true,
            },
          },
        },
      });

      const agingBuckets = {
        d0_30: { amount: 0, count: 0 },
        d31_60: { amount: 0, count: 0 },
        d61_90: { amount: 0, count: 0 },
        d91_180: { amount: 0, count: 0 },
        d181_365: { amount: 0, count: 0 },
        d365plus: { amount: 0, count: 0 },
      };
      const overdueAmounts: number[] = [];
      const sectorMap = new Map<string, { amount: number; count: number }>();
      const groupMap = new Map<string, { amount: number; count: number }>();
      const overdueRows: Array<{ id: string; code: string; name: string; sector: string; pastDue: number; valor: number }> = [];

      let overdue = 0;
      let upcoming = 0;
      let total = 0;

      for (const row of rows) {
        const norm = normalizeBalanceBuckets(row);
        overdue += norm.pastDueBalance;
        upcoming += norm.notDueBalance;
        total += row.totalBalance ?? 0;

        if (norm.pastDueBalance > 0) {
          overdueAmounts.push(norm.pastDueBalance);
          const v = row.valor ?? 0;
          const bucket =
            v <= 30 ? agingBuckets.d0_30 :
            v <= 60 ? agingBuckets.d31_60 :
            v <= 90 ? agingBuckets.d61_90 :
            v <= 180 ? agingBuckets.d91_180 :
            v <= 365 ? agingBuckets.d181_365 :
            agingBuckets.d365plus;
          bucket.amount += norm.pastDueBalance;
          bucket.count += 1;

          const sec = (row.user?.sectorCode || 'Tanimsiz').trim() || 'Tanimsiz';
          const grp = (row.user?.groupCode || 'Tanimsiz').trim() || 'Tanimsiz';
          const s = sectorMap.get(sec) || { amount: 0, count: 0 };
          s.amount += norm.pastDueBalance; s.count += 1; sectorMap.set(sec, s);
          const g = groupMap.get(grp) || { amount: 0, count: 0 };
          g.amount += norm.pastDueBalance; g.count += 1; groupMap.set(grp, g);

          overdueRows.push({
            id: row.user?.id || '',
            code: row.user?.mikroCariCode || '',
            name: row.user?.displayName || row.user?.mikroName || row.user?.name || '',
            sector: sec,
            pastDue: norm.pastDueBalance,
            valor: row.valor ?? 0,
          });
        }
      }

      overdueAmounts.sort((a, b) => b - a);
      const cumTop = (n: number) => round2(overdueAmounts.slice(0, n).reduce((s, x) => s + x, 0));
      const roundBucket = (b: { amount: number; count: number }) => ({ amount: round2(b.amount), count: b.count });

      const toDistribution = (m: Map<string, { amount: number; count: number }>, topN: number) => {
        const arr = [...m.entries()].map(([label, v]) => ({ label, amount: round2(v.amount), count: v.count }));
        arr.sort((a, b) => b.amount - a.amount);
        if (arr.length <= topN) return arr;
        const top = arr.slice(0, topN);
        const rest = arr.slice(topN);
        const other = rest.reduce((acc, x) => ({ amount: acc.amount + x.amount, count: acc.count + x.count }), { amount: 0, count: 0 });
        top.push({ label: 'Diger', amount: round2(other.amount), count: other.count });
        return top;
      };

      overdueRows.sort((a, b) => b.pastDue - a.pastDue);
      const topOverdue = overdueRows.slice(0, 10).map((r) => ({ ...r, pastDue: round2(r.pastDue) }));

      res.json({
        kpis: {
          count: rows.length,
          overdue: round2(overdue),
          upcoming: round2(upcoming),
          total: round2(total),
        },
        aging: {
          d0_30: roundBucket(agingBuckets.d0_30),
          d31_60: roundBucket(agingBuckets.d31_60),
          d61_90: roundBucket(agingBuckets.d61_90),
          d91_180: roundBucket(agingBuckets.d91_180),
          d181_365: roundBucket(agingBuckets.d181_365),
          d365plus: roundBucket(agingBuckets.d365plus),
        },
        concentration: {
          overdueCount: overdueAmounts.length,
          top10: cumTop(10),
          top20: cumTop(20),
          top50: cumTop(50),
        },
        sectorDistribution: toDistribution(sectorMap, 8),
        groupDistribution: toDistribution(groupMap, 8),
        topOverdue,
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
        vadeBalance: { is: { totalBalance: { gte: 0 } } },
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

      const resolvedCustomer = customer?.vadeBalance
        ? {
            ...customer,
            vadeBalance: {
              ...customer.vadeBalance,
              ...normalizeBalanceBuckets(customer.vadeBalance),
            },
          }
        : customer;

      const suggested = computeSuggestedRisk(customer.vadeBalance, notes);

      res.json({
        customer: resolvedCustomer,
        notes,
        assignments,
        suggested,
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
      if (config.vadeSyncAutoDisabled) {
        res.status(409).json({
          success: false,
          error: 'Mikro vade sync su anda kapali. Excel import aktif ve otoriter kaynak olarak kullaniliyor.',
        });
        return;
      }
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

  // F4: Analiz — musteri iletisim davranisi + satici not performansi
  async getAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const days = Math.min(Math.max(parseNumber(req.query.days, 90), 1), 730);
      const since = new Date();
      since.setDate(since.getDate() - days);

      const restrict = !canAccessAllSectors(req.user?.role);
      const assigned = getAssignedSectorCodes(req);
      if (restrict && assigned.length === 0) {
        res.json({ customerBehavior: [], staffPerformance: [], days });
        return;
      }

      const sectorFilter: Prisma.StringFilter = { notIn: [...EXCLUDED_SECTOR_CODES] };
      if (restrict) sectorFilter.in = assigned;
      const customerWhere: Prisma.UserWhereInput = {
        sectorCode: sectorFilter,
        NOT: { OR: buildExcludedSectorFilters() },
      };

      const notes = await prisma.vadeNote.findMany({
        where: { createdAt: { gte: since }, customer: customerWhere },
        select: {
          customerId: true,
          authorId: true,
          tags: true,
          promiseDate: true,
          createdAt: true,
          customer: { select: { displayName: true, mikroName: true, name: true, mikroCariCode: true, sectorCode: true } },
          author: { select: { name: true, role: true } },
        },
      });

      type CB = { name: string; code: string; sector: string; noteCount: number; promiseCount: number; lastNoteAt: Date | null; tagCounts: Record<string, number> };
      type SP = { name: string; role: string; totalNotes: number; promiseNotes: number; taggedNotes: number; customers: Set<string> };
      const custMap = new Map<string, CB>();
      const staffMap = new Map<string, SP>();

      for (const n of notes) {
        const cb = custMap.get(n.customerId) || {
          name: n.customer?.displayName || n.customer?.mikroName || n.customer?.name || '',
          code: n.customer?.mikroCariCode || '',
          sector: n.customer?.sectorCode || '',
          noteCount: 0, promiseCount: 0, lastNoteAt: null, tagCounts: {},
        };
        cb.noteCount += 1;
        if (n.promiseDate) cb.promiseCount += 1;
        if (!cb.lastNoteAt || n.createdAt > cb.lastNoteAt) cb.lastNoteAt = n.createdAt;
        for (const t of n.tags || []) cb.tagCounts[t] = (cb.tagCounts[t] || 0) + 1;
        custMap.set(n.customerId, cb);

        if (n.authorId) {
          const sp = staffMap.get(n.authorId) || { name: n.author?.name || 'Bilinmiyor', role: n.author?.role || '', totalNotes: 0, promiseNotes: 0, taggedNotes: 0, customers: new Set<string>() };
          sp.totalNotes += 1;
          if (n.promiseDate) sp.promiseNotes += 1;
          if ((n.tags || []).length > 0) sp.taggedNotes += 1;
          sp.customers.add(n.customerId);
          staffMap.set(n.authorId, sp);
        }
      }

      const customerBehavior = [...custMap.values()]
        .map((c) => {
          let mostUsedTag: string | null = null; let max = 0;
          for (const [t, cnt] of Object.entries(c.tagCounts)) if (cnt > max) { max = cnt; mostUsedTag = t; }
          return {
            name: c.name, code: c.code, sector: c.sector,
            noteCount: c.noteCount, promiseCount: c.promiseCount,
            lastNoteAt: c.lastNoteAt, mostUsedTag, mostUsedTagCount: max,
          };
        })
        .sort((a, b) => b.noteCount - a.noteCount)
        .slice(0, 100);

      const staffPerformance = [...staffMap.values()]
        .map((s) => ({
          name: s.name, role: s.role,
          totalNotes: s.totalNotes, promiseNotes: s.promiseNotes, taggedNotes: s.taggedNotes,
          uniqueCustomers: s.customers.size,
          avgNotesPerCustomer: s.customers.size > 0 ? Math.round((s.totalNotes / s.customers.size) * 10) / 10 : 0,
        }))
        .sort((a, b) => b.totalNotes - a.totalNotes);

      res.json({ customerBehavior, staffPerformance, days });
    } catch (error) {
      next(error);
    }
  }

  // F5: Yonetim/Personel performans — sadece ADMIN/HEAD_ADMIN/MANAGER
  async getManagement(req: Request, res: Response, next: NextFunction) {
    try {
      if (!canAccessAllSectors(req.user?.role)) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
      const days = Math.min(Math.max(parseNumber(req.query.days, 30), 1), 730);
      const since = new Date();
      since.setDate(since.getDate() - days);
      const now = new Date();

      const staffRoles = ['HEAD_ADMIN', 'ADMIN', 'MANAGER', 'SALES_REP', 'DIVERSEY'] as const;
      const staff = await prisma.user.findMany({
        where: { role: { in: staffRoles as any } },
        select: { id: true, name: true, role: true, lastLoginAt: true },
      });
      const staffIds = staff.map((s) => s.id);

      const [notes, assignments] = await Promise.all([
        prisma.vadeNote.findMany({
          where: { createdAt: { gte: since }, authorId: { in: staffIds } },
          select: { authorId: true, createdAt: true },
        }),
        prisma.vadeAssignment.groupBy({ by: ['staffId'], _count: { _all: true } }),
      ]);

      const noteCountByStaff = new Map<string, number>();
      const lastNoteByStaff = new Map<string, Date>();
      const dailyMap = new Map<string, number>();
      for (const n of notes) {
        if (!n.authorId) continue;
        noteCountByStaff.set(n.authorId, (noteCountByStaff.get(n.authorId) || 0) + 1);
        const prev = lastNoteByStaff.get(n.authorId);
        if (!prev || n.createdAt > prev) lastNoteByStaff.set(n.authorId, n.createdAt);
        const key = n.createdAt.toISOString().slice(0, 10);
        dailyMap.set(key, (dailyMap.get(key) || 0) + 1);
      }
      const assignByStaff = new Map<string, number>();
      for (const a of assignments) assignByStaff.set(a.staffId, a._count._all);

      const perf = staff.map((s) => {
        const noteCount = noteCountByStaff.get(s.id) || 0;
        const assignedCustomers = assignByStaff.get(s.id) || 0;
        const lastNoteAt = lastNoteByStaff.get(s.id) || null;
        const lastActivity = [s.lastLoginAt, lastNoteAt].filter(Boolean).sort((a, b) => new Date(b as Date).getTime() - new Date(a as Date).getTime())[0] || null;
        const noteScore = Math.min(noteCount * 2, 20);
        const assignScore = Math.min(assignedCustomers, 10);
        const loginScore = s.lastLoginAt && new Date(s.lastLoginAt) >= since ? 10 : 0;
        const activityScore = noteScore + assignScore + loginScore;
        const daysSince = lastActivity ? Math.floor((now.getTime() - new Date(lastActivity).getTime()) / 86400000) : null;
        return {
          id: s.id, name: s.name, role: s.role,
          noteCount, assignedCustomers,
          efficiency: assignedCustomers > 0 ? Math.round((noteCount / assignedCustomers) * 100) / 100 : 0,
          activityScore, lastActivity, daysSinceActivity: daysSince,
        };
      });

      const activeUsers = perf.filter((p) => p.noteCount > 0).length;
      const totalNotes = notes.length;
      const totalAssignments = [...assignByStaff.values()].reduce((s, x) => s + x, 0);

      const issues: Array<{ type: 'warning' | 'info' | 'error'; title: string; names: string[] }> = [];
      const passive = perf.filter((p) => p.noteCount === 0 && p.role !== 'HEAD_ADMIN' && p.role !== 'ADMIN').map((p) => p.name);
      if (passive.length) issues.push({ type: 'warning', title: 'Hic not girmemis personel', names: passive });
      const inactive = perf.filter((p) => p.daysSinceActivity !== null && p.daysSinceActivity > 7 && p.role !== 'HEAD_ADMIN' && p.role !== 'ADMIN').map((p) => `${p.name} (${p.daysSinceActivity}g)`);
      if (inactive.length) issues.push({ type: 'info', title: '7+ gundur aktif degil', names: inactive });
      const noAssign = perf.filter((p) => p.assignedCustomers === 0 && p.role === 'SALES_REP').map((p) => p.name);
      if (noAssign.length) issues.push({ type: 'error', title: 'Musteri atanmamis satisci', names: noAssign });

      const dailyTrend = [...dailyMap.entries()].map(([date, count]) => ({ date, notes: count })).sort((a, b) => a.date.localeCompare(b.date));

      res.json({
        summary: { totalUsers: staff.length, totalNotes, totalAssignments, activeUsers },
        topPerformers: perf.sort((a, b) => b.activityScore - a.activityScore),
        issues,
        dailyTrend,
        days,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new VadeController();
