import { Request, Response, NextFunction } from 'express';
import salesCatalogService from '../services/sales-catalog.service';
import auditLogService from '../services/audit-log.service';

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
      const result = await salesCatalogService.getPublicCatalog(req.params.token);
      if (!result) return res.status(404).json({ error: 'Katalog bulunamadi veya yayinda degil' });
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async recordPdfDownload(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await salesCatalogService.recordPdfDownload(req.params.token);
      if (!result.success) return res.status(404).json({ error: 'Katalog bulunamadi veya yayinda degil' });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}

export default new SalesCatalogController();
