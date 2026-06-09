import { Request, Response, NextFunction } from 'express';
import priceVerificationService from '../services/price-verification.service';

const actorFromRequest = (req: Request) => ({
  userId: req.user?.userId || null,
  role: req.user?.role || null,
  email: req.user?.email || null,
  assignedSectorCodes: req.user?.assignedSectorCodes || [],
});

class PriceVerificationController {
  async listRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await priceVerificationService.listRequests(req.query, actorFromRequest(req));
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async getRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await priceVerificationService.getRequest(String(req.params.id || ''), actorFromRequest(req));
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async createRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await priceVerificationService.createRequest(req.body || {}, actorFromRequest(req));
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async addOffer(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await priceVerificationService.addOffer(String(req.params.id || ''), req.body || {}, actorFromRequest(req));
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async submitToSales(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await priceVerificationService.submitToSales(String(req.params.id || ''), req.body || {}, actorFromRequest(req));
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async salesDecision(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await priceVerificationService.salesDecision(String(req.params.id || ''), req.body || {}, actorFromRequest(req));
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async completeRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await priceVerificationService.completeRequest(String(req.params.id || ''), req.body || {}, actorFromRequest(req));
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async cancelRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await priceVerificationService.cancelRequest(String(req.params.id || ''), req.body || {}, actorFromRequest(req));
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async addNote(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await priceVerificationService.addNote(String(req.params.id || ''), req.body || {}, actorFromRequest(req));
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async markCurrent(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await priceVerificationService.markCurrent(String(req.params.id || ''), req.body || {}, actorFromRequest(req));
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
        url: `/uploads/tasks/${file.filename}`,
        originalName: file.originalname,
        size: file.size,
        type: file.mimetype || null,
      });
    } catch (error) {
      next(error);
    }
  }

  async previewStockPayload(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await priceVerificationService.previewStockPayload(req.body || {});
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async searchProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await priceVerificationService.searchProducts({
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
      const data = await priceVerificationService.searchSuppliers({
        search: String(req.query.search || ''),
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async searchCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await priceVerificationService.searchCustomers({
        search: String(req.query.search || ''),
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        actor: actorFromRequest(req),
      });
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async getStockMetadata(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await priceVerificationService.getStockMetadata();
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async searchStockLookups(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await priceVerificationService.searchStockLookups(
        String(req.params.type || ''),
        typeof req.query.search === 'string' ? req.query.search : '',
        typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined
      );
      res.json({ items });
    } catch (error) {
      next(error);
    }
  }
}

export default new PriceVerificationController();
