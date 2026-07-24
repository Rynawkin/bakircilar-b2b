import { NextFunction, Request, Response } from 'express';
import config from '../config';
import auditLogService from '../services/audit-log.service';
import managementProfitReportService from '../services/management-profit-report.service';
import { getTrustedClientIp } from '../utils/trusted-client-ip';

const ACCESS_COOKIE = 'b2b_mpr_access';
const ACCESS_COOKIE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const ACCESS_COOKIE_PATH = '/api/management-profit-report/public';

const readCookie = (req: Request, name: string) => {
  const cookieHeader = String(req.headers.cookie || '');
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
};

const publicContext = (req: Request) => ({
  sessionToken: readCookie(req, ACCESS_COOKIE),
  userAgent: req.get('user-agent') || null,
  ip: getTrustedClientIp(req),
});

const actor = (req: Request) => ({
  userId: req.user?.userId || null,
  name: req.user?.email || null,
});

const setNoStoreHeaders = (res: Response) => {
  res.set({
    'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Referrer-Policy': 'no-referrer',
  });
};

class ManagementProfitReportController {
  async authorize(req: Request, res: Response, next: NextFunction) {
    try {
      setNoStoreHeaders(res);
      const result = await managementProfitReportService.authorize(
        req.body?.token,
        req.body?.pin,
        publicContext(req)
      );
      res.cookie(ACCESS_COOKIE, result.sessionToken, {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: 'strict',
        maxAge: ACCESS_COOKIE_MAX_AGE_MS,
        path: ACCESS_COOKIE_PATH,
      });
      res.json({ success: true, expiresInMs: result.expiresInMs });
    } catch (error) {
      next(error);
    }
  }

  async view(req: Request, res: Response, next: NextFunction) {
    try {
      setNoStoreHeaders(res);
      const data = await managementProfitReportService.getView(publicContext(req));
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async query(req: Request, res: Response, next: NextFunction) {
    try {
      setNoStoreHeaders(res);
      const data = await managementProfitReportService.query(
        req.body || {},
        publicContext(req)
      );
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async saveLayout(req: Request, res: Response, next: NextFunction) {
    try {
      setNoStoreHeaders(res);
      const data = await managementProfitReportService.saveLayout(
        req.body || {},
        publicContext(req)
      );
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async logout(_req: Request, res: Response) {
    setNoStoreHeaders(res);
    res.clearCookie(ACCESS_COOKIE, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'strict',
      path: ACCESS_COOKIE_PATH,
    });
    res.json({ success: true });
  }

  async listLinks(_req: Request, res: Response, next: NextFunction) {
    try {
      setNoStoreHeaders(res);
      const links = await managementProfitReportService.listLinks();
      res.json({ links });
    } catch (error) {
      next(error);
    }
  }

  async createLink(req: Request, res: Response, next: NextFunction) {
    try {
      setNoStoreHeaders(res);
      const result = await managementProfitReportService.createLink(
        req.body || {},
        actor(req)
      );
      await auditLogService.fromRequest(req, {
        action: 'MANAGEMENT_PROFIT_REPORT_LINK_CREATE',
        entityType: 'ManagementProfitReportLink',
        entityId: result.link.id,
        entityCode: result.link.tokenHint,
        summary: `${result.link.name} rapor bağlantısı oluşturuldu`,
        after: result.link,
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  async updateLink(req: Request, res: Response, next: NextFunction) {
    try {
      setNoStoreHeaders(res);
      const link = await managementProfitReportService.updateLink(
        req.params.id,
        req.body || {},
        actor(req)
      );
      await auditLogService.fromRequest(req, {
        action: 'MANAGEMENT_PROFIT_REPORT_LINK_UPDATE',
        entityType: 'ManagementProfitReportLink',
        entityId: link.id,
        entityCode: link.tokenHint,
        summary: `${link.name} rapor bağlantısı güncellendi`,
        after: link,
      });
      res.json({ link });
    } catch (error) {
      next(error);
    }
  }

  async rotateLink(req: Request, res: Response, next: NextFunction) {
    try {
      setNoStoreHeaders(res);
      const result = await managementProfitReportService.rotateLink(
        req.params.id,
        actor(req)
      );
      await auditLogService.fromRequest(req, {
        action: 'MANAGEMENT_PROFIT_REPORT_LINK_ROTATE',
        entityType: 'ManagementProfitReportLink',
        entityId: result.link.id,
        entityCode: result.link.tokenHint,
        summary: `${result.link.name} rapor bağlantısı yenilendi`,
        after: result.link,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const managementProfitReportController =
  new ManagementProfitReportController();
export default managementProfitReportController;
