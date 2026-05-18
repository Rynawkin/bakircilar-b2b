import { Request, Response, NextFunction } from 'express';
import supplierCostService from '../services/supplier-cost.service';

class SupplierCostController {
  async searchProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await supplierCostService.searchProducts({
        search: String(req.query.search || ''),
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async searchSuppliers(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await supplierCostService.searchSuppliers({
        search: String(req.query.search || ''),
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async listCosts(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await supplierCostService.listCosts({
        search: String(req.query.search || ''),
        productCode: req.query.productCode ? String(req.query.productCode) : undefined,
        supplierCode: req.query.supplierCode ? String(req.query.supplierCode) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async getProductDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await supplierCostService.getProductDetail(String(req.params.productCode || ''));
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async createCost(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await supplierCostService.createCost(req.body || {}, { userId: req.user?.userId || null });
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async updateCost(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await supplierCostService.updateCost(String(req.params.id || ''), req.body || {}, {
        userId: req.user?.userId || null,
      });
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async archiveCost(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await supplierCostService.archiveCost(String(req.params.id || ''));
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async applyCost(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await supplierCostService.applyCost(
        {
          id: String(req.params.id || ''),
          updatePriceLists: Boolean(req.body?.updatePriceLists),
          note: req.body?.note ? String(req.body.note) : null,
        },
        { userId: req.user?.userId || null }
      );
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async getReports(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await supplierCostService.getReports({
        staleDays: req.query.staleDays ? Number(req.query.staleDays) : undefined,
        tolerancePercent: req.query.tolerancePercent ? Number(req.query.tolerancePercent) : undefined,
        spreadPercent: req.query.spreadPercent ? Number(req.query.spreadPercent) : undefined,
        search: String(req.query.search || ''),
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async importLatestSupplierPriceLists(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await supplierCostService.importLatestSupplierPriceListMatches(
        { limit: req.body?.limit ? Number(req.body.limit) : undefined },
        { userId: req.user?.userId || null }
      );
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async uploadAttachment(req: Request, res: Response, next: NextFunction) {
    try {
      const file = req.file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ error: 'Dosya zorunludur.' });
      res.json({
        attachmentUrl: `/uploads/tasks/${file.filename}`,
        originalName: file.originalname,
        size: file.size,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new SupplierCostController();
