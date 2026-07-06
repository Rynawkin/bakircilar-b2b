import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';

class AuditLogController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        action,
        entityType,
        entityId,
        actorId,
        fromDate,
        toDate,
        page,
        limit,
      } = req.query;

      const where: any = {};
      if (action) where.action = String(action);
      if (entityType) where.entityType = String(entityType);
      if (entityId) where.entityId = String(entityId);
      if (actorId) where.actorId = String(actorId);
      if (fromDate || toDate) {
        where.createdAt = {};
        if (fromDate) where.createdAt.gte = new Date(String(fromDate));
        if (toDate) where.createdAt.lte = new Date(String(toDate));
      }

      const currentPage = Math.max(1, Number(page) || 1);
      const take = Math.min(200, Math.max(10, Number(limit) || 50));
      const skip = (currentPage - 1) * take;

      const [total, logs] = await prisma.$transaction([
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take,
          include: { actor: { select: { id: true, name: true, email: true, role: true } } },
        }),
      ]);

      res.json({
        logs,
        pagination: {
          page: currentPage,
          limit: take,
          total,
          totalPages: Math.max(1, Math.ceil(total / take)),
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new AuditLogController();
