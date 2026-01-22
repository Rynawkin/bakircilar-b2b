import { Request, Response, NextFunction } from 'express';
import supplierPriceListService from '../services/supplier-price-list.service';

class SupplierPriceListController {
  async getSuppliers(req: Request, res: Response, next: NextFunction) {
    try {
      const suppliers = await supplierPriceListService.listSuppliers();
      res.json({ suppliers });
    } catch (error) {
      next(error);
    }
  }

  async createSupplier(req: Request, res: Response, next: NextFunction) {
    try {
      const supplier = await supplierPriceListService.createSupplier(req.body || {});
      res.json({ supplier });
    } catch (error) {
      next(error);
    }
  }

  async updateSupplier(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const supplier = await supplierPriceListService.updateSupplier(id, req.body || {});
      res.json({ supplier });
    } catch (error) {
      next(error);
    }
  }

  async listUploads(req: Request, res: Response, next: NextFunction) {
    try {
      const { supplierId, page, limit } = req.query;
      const result = await supplierPriceListService.listUploads({
        supplierId: supplierId as string | undefined,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async getUpload(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const upload = await supplierPriceListService.getUpload(id);
      if (!upload) {
        return res.status(404).json({ error: 'Upload not found' });
      }
      res.json({ upload });
    } catch (error) {
      next(error);
    }
  }

  async getUploadItems(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { status, page, limit } = req.query;
      const result = await supplierPriceListService.getUploadItems({
        uploadId: id,
        status: status as string | undefined,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async exportUpload(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const exportData = await supplierPriceListService.buildExport(id);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${exportData.fileName}`);
      res.send(exportData.buffer);
    } catch (error) {
      next(error);
    }
  }

  async uploadPriceLists(req: Request, res: Response, next: NextFunction) {
    try {
      const supplierId = req.body?.supplierId as string | undefined;
      if (!supplierId) {
        return res.status(400).json({ error: 'supplierId is required' });
      }
      const files = (req.files || []) as Express.Multer.File[];
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const result = await supplierPriceListService.uploadPriceLists({
        supplierId,
        uploadedById: userId,
        files,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}

export default new SupplierPriceListController();
