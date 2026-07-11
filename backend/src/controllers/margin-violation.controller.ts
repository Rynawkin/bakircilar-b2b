import { NextFunction, Request, Response } from 'express';
import marginViolationService from '../services/margin-violation.service';
import auditLogService from '../services/audit-log.service';
import { AppError, ErrorCode } from '../types/errors';

const actorFromRequest = (req: Request) => ({
  userId: req.user?.userId || null,
  role: req.user?.role || null,
  email: req.user?.email || null,
  assignedSectorCodes: req.user?.assignedSectorCodes || [],
});

const requireManagerActor = (req: Request) => {
  if (!['HEAD_ADMIN', 'ADMIN', 'MANAGER'].includes(String(req.user?.role || ''))) {
    throw new AppError('Yonetici yetkisi gerekli.', 403, ErrorCode.FORBIDDEN);
  }
};

const parseDate = (value: unknown): Date | null => {
  const text = String(value || '').trim();
  if (!/^\d{4}-?\d{2}-?\d{2}$/.test(text)) return null;
  const compact = text.replace(/-/g, '');
  const date = new Date(Date.UTC(Number(compact.slice(0, 4)), Number(compact.slice(4, 6)) - 1, Number(compact.slice(6, 8))));
  return Number.isNaN(date.getTime()) ? null : date;
};

class MarginViolationController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await marginViolationService.list(req.query, actorFromRequest(req)));
    } catch (error) { next(error); }
  }

  async dashboard(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await marginViolationService.getDashboard(actorFromRequest(req)));
    } catch (error) { next(error); }
  }

  async scorecard(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ rows: await marginViolationService.getManagerScorecard(actorFromRequest(req)) });
    } catch (error) { next(error); }
  }

  async generate(req: Request, res: Response, next: NextFunction) {
    try {
      requireManagerActor(req);
      const dates = (Array.isArray(req.body?.dates) ? req.body.dates : [req.body?.reportDate])
        .map(parseDate)
        .filter(Boolean) as Date[];
      if (!dates.length) return res.status(400).json({ error: 'En az bir rapor tarihi gerekli.' });
      const result = await marginViolationService.generateForDates(dates);
      await auditLogService.fromRequest(req, {
        action: 'MARGIN_VIOLATIONS_GENERATE', entityType: 'MarginViolation', summary: `${dates.length} gun icin ihlaller yenilendi.`, after: result,
      });
      res.json(result);
    } catch (error) { next(error); }
  }

  async claim(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await marginViolationService.claim(req.params.id, actorFromRequest(req));
      await auditLogService.fromRequest(req, { action: 'MARGIN_VIOLATION_CLAIM', entityType: 'MarginViolation', entityId: req.params.id, after: result });
      res.json(result);
    } catch (error) { next(error); }
  }

  async addNote(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await marginViolationService.addNote(req.params.id, req.body?.body, actorFromRequest(req));
      await auditLogService.fromRequest(req, { action: 'MARGIN_VIOLATION_NOTE_ADD', entityType: 'MarginViolation', entityId: req.params.id, summary: 'Marj ihlaline not eklendi.' });
      res.json(result);
    } catch (error) { next(error); }
  }

  async resolve(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await marginViolationService.resolve(req.params.id, req.body, actorFromRequest(req));
      await auditLogService.fromRequest(req, { action: 'MARGIN_VIOLATION_RESOLVE', entityType: 'MarginViolation', entityId: req.params.id, after: result });
      res.json(result);
    } catch (error) { next(error); }
  }

  async reopen(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await marginViolationService.reopen(req.params.id, req.body?.note, actorFromRequest(req));
      await auditLogService.fromRequest(req, { action: 'MARGIN_VIOLATION_REOPEN', entityType: 'MarginViolation', entityId: req.params.id, after: result });
      res.json(result);
    } catch (error) { next(error); }
  }

  async adminClose(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await marginViolationService.adminClose(req.params.id, req.body?.note, actorFromRequest(req));
      await auditLogService.fromRequest(req, { action: 'MARGIN_VIOLATION_ADMIN_CLOSE', entityType: 'MarginViolation', entityId: req.params.id, after: result });
      res.json(result);
    } catch (error) { next(error); }
  }

  async proposeExclusion(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await marginViolationService.proposeExclusion(req.params.id, req.body, actorFromRequest(req));
      await auditLogService.fromRequest(req, { action: 'MARGIN_EXCLUSION_PROPOSE', entityType: 'MarginViolation', entityId: req.params.id, after: result });
      res.json(result);
    } catch (error) { next(error); }
  }

  async decideExclusion(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await marginViolationService.decideExclusion(req.params.proposalId, req.body, actorFromRequest(req));
      await auditLogService.fromRequest(req, { action: 'MARGIN_EXCLUSION_DECIDE', entityType: 'MarginViolationExclusionProposal', entityId: req.params.proposalId, after: result });
      res.json(result);
    } catch (error) { next(error); }
  }

  async openPriceVerification(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await marginViolationService.openPriceVerification(req.params.id, req.body?.note, actorFromRequest(req));
      await auditLogService.fromRequest(req, { action: 'MARGIN_PRICE_VERIFICATION_OPEN', entityType: 'MarginViolation', entityId: req.params.id, after: result });
      res.json(result);
    } catch (error) { next(error); }
  }

  async runEscalations(req: Request, res: Response, next: NextFunction) {
    try {
      requireManagerActor(req);
      const result = await marginViolationService.processEscalations();
      await auditLogService.fromRequest(req, { action: 'MARGIN_ESCALATION_RUN', entityType: 'MarginViolation', after: result });
      res.json(result);
    } catch (error) { next(error); }
  }
}

export default new MarginViolationController();
