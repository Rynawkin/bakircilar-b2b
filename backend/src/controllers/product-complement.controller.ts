import { Request, Response, NextFunction } from 'express';
import productComplementService from '../services/product-complement.service';

class ProductComplementController {
  async getComplements(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await productComplementService.getAdminComplements(id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async updateComplements(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { manualProductIds, mode, complementGroupCode } = req.body as {
        manualProductIds?: string[];
        mode?: 'AUTO' | 'MANUAL';
        complementGroupCode?: string | null;
      };

      const result = await productComplementService.updateManualComplements(
        id,
        manualProductIds || [],
        mode,
        complementGroupCode
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async syncComplements(req: Request, res: Response, next: NextFunction) {
    try {
      const { months, limit } = req.body as { months?: number; limit?: number };
      const result = await productComplementService.syncAutoRecommendations({ months, limit });
      res.json({ success: true, result });
    } catch (error) {
      next(error);
    }
  }
}

export default new ProductComplementController();
