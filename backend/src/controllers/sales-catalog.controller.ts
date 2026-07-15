import { Request, Response, NextFunction } from 'express';
import salesCatalogService from '../services/sales-catalog.service';
import salesCatalogShareService from '../services/sales-catalog-share.service';
import auditLogService from '../services/audit-log.service';
import config from '../config';
import { getTrustedClientIp } from '../utils/trusted-client-ip';

const CATALOG_VISITOR_COOKIE = 'b2b_catalog_vid';

const readCookie = (req: Request, name: string) => {
  const cookieHeader = String(req.headers.cookie || '');
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
};

const publicRequestContext = (req: Request) => ({
  visitorKey: readCookie(req, CATALOG_VISITOR_COOKIE),
  userAgent: req.get('user-agent') || null,
  accessToken: req.get('x-catalog-access-token') || null,
  ip: getTrustedClientIp(req),
});

const setVisitorCookie = (res: Response, visitorKey?: string | null) => {
  if (!visitorKey) return;
  res.cookie(CATALOG_VISITOR_COOKIE, visitorKey, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: 365 * 24 * 60 * 60 * 1000,
    path: '/',
  });
};

class SalesCatalogController {
  async listAdmin(_req: Request, res: Response, next: NextFunction) {
    try {
      const catalogs = await salesCatalogService.listCatalogs();
      res.json({ catalogs });
    } catch (error) {
      next(error);
    }
  }

  async getAdmin(req: Request, res: Response, next: NextFunction) {
    try {
      const catalog = await salesCatalogService.getCatalog(req.params.id);
      if (!catalog) return res.status(404).json({ error: 'Katalog bulunamadi' });
      res.json({ catalog });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const catalog = await salesCatalogService.createCatalog(req.body || {}, {
        userId: req.user?.userId,
        name: req.user?.email,
      });
      await auditLogService.fromRequest(req, {
        action: 'SALES_CATALOG_CREATE',
        entityType: 'SalesCatalog',
        entityId: catalog?.id,
        entityCode: catalog?.shareToken,
        summary: `${catalog?.name || 'Katalog'} olusturuldu`,
        after: catalog,
      });
      res.status(201).json({ catalog });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const before = await salesCatalogService.getCatalog(req.params.id);
      const catalog = await salesCatalogService.updateCatalog(req.params.id, req.body || {}, {
        userId: req.user?.userId,
        name: req.user?.email,
      });
      await auditLogService.fromRequest(req, {
        action: 'SALES_CATALOG_UPDATE',
        entityType: 'SalesCatalog',
        entityId: catalog?.id,
        entityCode: catalog?.shareToken,
        summary: `${catalog?.name || 'Katalog'} guncellendi`,
        before,
        after: catalog,
      });
      res.json({ catalog });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const before = await salesCatalogService.getCatalog(req.params.id);
      const result = await salesCatalogService.deleteCatalog(req.params.id);
      await auditLogService.fromRequest(req, {
        action: 'SALES_CATALOG_DELETE',
        entityType: 'SalesCatalog',
        entityId: req.params.id,
        entityCode: before?.shareToken,
        summary: `${before?.name || 'Katalog'} silindi`,
        before,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async preview(req: Request, res: Response, next: NextFunction) {
    try {
      const preview = await salesCatalogService.getAdminPreview(req.params.id);
      if (!preview) return res.status(404).json({ error: 'Katalog bulunamadi' });
      res.json(preview);
    } catch (error) {
      next(error);
    }
  }

  async rotateToken(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await salesCatalogService.rotateShareToken(req.params.id, {
        userId: req.user?.userId,
        name: req.user?.email,
      });
      await auditLogService.fromRequest(req, {
        action: 'SALES_CATALOG_LINK_ROTATE',
        entityType: 'SalesCatalog',
        entityId: req.params.id,
        entityCode: result.shareToken,
        summary: 'Katalog paylasim baglantisi yenilendi',
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async getPublic(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await salesCatalogShareService.getPublicCatalog(req.params.token, publicRequestContext(req));
      setVisitorCookie(res, result.visitorKey);
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.json(result.data);
    } catch (error) {
      next(error);
    }
  }

  async authorizePin(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await salesCatalogShareService.authorizePin(
        req.params.token,
        req.body?.pin,
        publicRequestContext(req)
      );
      setVisitorCookie(res, result.visitorKey);
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async recordEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await salesCatalogShareService.recordEvent(
        req.params.token,
        req.body?.eventType,
        req.body || {},
        publicRequestContext(req)
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async recordPdfDownload(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await salesCatalogShareService.recordEvent(
        req.params.token,
        'PDF_DOWNLOAD',
        req.body || {},
        publicRequestContext(req)
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async listShareLinks(req: Request, res: Response, next: NextFunction) {
    try {
      const links = await salesCatalogShareService.listShareLinks(req.params.id);
      res.json({ links });
    } catch (error) {
      next(error);
    }
  }

  async createShareLink(req: Request, res: Response, next: NextFunction) {
    try {
      const link = await salesCatalogShareService.createShareLink(req.params.id, req.body || {}, {
        userId: req.user?.userId,
        name: req.user?.email,
      });
      await auditLogService.fromRequest(req, {
        action: 'SALES_CATALOG_SHARE_LINK_CREATE',
        entityType: 'SalesCatalogShareLink',
        entityId: link.id,
        entityCode: link.token,
        summary: `${link.name} katalog baglantisi olusturuldu`,
        after: link,
      });
      res.status(201).json({ link });
    } catch (error) {
      next(error);
    }
  }

  async updateShareLink(req: Request, res: Response, next: NextFunction) {
    try {
      const before = (await salesCatalogShareService.listShareLinks(req.params.id)).find((row: any) => row.id === req.params.linkId);
      const link = await salesCatalogShareService.updateShareLink(req.params.id, req.params.linkId, req.body || {}, {
        userId: req.user?.userId,
        name: req.user?.email,
      });
      await auditLogService.fromRequest(req, {
        action: 'SALES_CATALOG_SHARE_LINK_UPDATE',
        entityType: 'SalesCatalogShareLink',
        entityId: link.id,
        entityCode: link.token,
        summary: `${link.name} katalog baglantisi guncellendi`,
        before,
        after: link,
      });
      res.json({ link });
    } catch (error) {
      next(error);
    }
  }

  async rotateShareLinkToken(req: Request, res: Response, next: NextFunction) {
    try {
      const link = await salesCatalogShareService.rotateShareLinkToken(req.params.id, req.params.linkId, {
        userId: req.user?.userId,
        name: req.user?.email,
      });
      await auditLogService.fromRequest(req, {
        action: 'SALES_CATALOG_SHARE_LINK_ROTATE',
        entityType: 'SalesCatalogShareLink',
        entityId: link.id,
        entityCode: link.token,
        summary: `${link.name} katalog baglantisi yenilendi`,
      });
      res.json({ link });
    } catch (error) {
      next(error);
    }
  }

  async getShareLinkAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const analytics = await salesCatalogShareService.getShareLinkAnalytics(req.params.id, req.params.linkId);
      res.json(analytics);
    } catch (error) {
      next(error);
    }
  }

  async setVisitorBlock(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = { userId: req.user?.userId, name: req.user?.email };
      const scope = String(req.body?.scope || 'CATALOG').toUpperCase();
      const blocked = req.body?.blocked !== false;
      const result = scope === 'GLOBAL'
        ? await salesCatalogShareService.setGlobalBlock(req.params.id, req.params.linkId, req.params.visitorId, blocked, actor, req.body?.reason)
        : await salesCatalogShareService.setCatalogBlock(req.params.id, req.params.linkId, req.params.visitorId, blocked, actor, req.body?.reason);
      await auditLogService.fromRequest(req, {
        action: blocked ? 'SALES_CATALOG_VISITOR_BLOCK' : 'SALES_CATALOG_VISITOR_UNBLOCK',
        entityType: 'SalesCatalogVisitor',
        entityId: req.params.visitorId,
        entityCode: scope,
        summary: `Katalog ziyaretcisi ${blocked ? 'engellendi' : 'yeniden acildi'} (${scope})`,
        after: { catalogId: req.params.id, linkId: req.params.linkId, visitorId: req.params.visitorId, scope, blocked },
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}

export default new SalesCatalogController();
