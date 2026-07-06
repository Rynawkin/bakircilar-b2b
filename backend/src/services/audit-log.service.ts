import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../utils/prisma';

type AuditInput = {
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  entityCode?: string | null;
  summary?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
};

const jsonOrNull = (value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull => {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
};

class AuditLogService {
  fromRequest(req: Request, input: Omit<AuditInput, 'actorId' | 'actorRole' | 'ipAddress' | 'userAgent'> & {
    actorId?: string | null;
    actorRole?: string | null;
  }) {
    return this.log({
      ...input,
      actorId: input.actorId ?? req.user?.userId ?? null,
      actorRole: input.actorRole ?? req.user?.role ?? null,
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] ? String(req.headers['user-agent']) : null,
    });
  }

  async log(input: AuditInput) {
    try {
      await prisma.auditLog.create({
        data: {
          actorId: input.actorId || null,
          actorName: input.actorName || null,
          actorRole: input.actorRole || null,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId || null,
          entityCode: input.entityCode || null,
          summary: input.summary || null,
          ipAddress: input.ipAddress || null,
          userAgent: input.userAgent || null,
          before: jsonOrNull(input.before),
          after: jsonOrNull(input.after),
          metadata: jsonOrNull(input.metadata),
        },
      });
    } catch (error) {
      console.error('Audit log write failed', { action: input.action, entityType: input.entityType, error });
    }
  }
}

export default new AuditLogService();
