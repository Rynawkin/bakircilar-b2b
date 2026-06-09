import { Request, Response, NextFunction } from 'express';
import tenderCostService from '../services/tender-cost.service';

const actorFromRequest = (req: Request) => ({
  userId: req.user?.userId || null,
  role: req.user?.role || null,
});

class TenderCostController {
  async listRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await tenderCostService.listRequests(req.query, actorFromRequest(req));
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async getRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await tenderCostService.getRequest(String(req.params.id || ''), actorFromRequest(req));
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async createRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await tenderCostService.createRequest(req.body || {}, actorFromRequest(req));
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async addOffer(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await tenderCostService.addOffer(
        String(req.params.id || ''),
        String(req.params.itemId || ''),
        req.body || {},
        actorFromRequest(req)
      );
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async completeRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await tenderCostService.completeRequest(String(req.params.id || ''), req.body || {}, actorFromRequest(req));
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async cancelRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await tenderCostService.cancelRequest(String(req.params.id || ''), req.body || {}, actorFromRequest(req));
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  async addNote(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await tenderCostService.addNote(String(req.params.id || ''), req.body || {}, actorFromRequest(req));
      res.json(data);
    } catch (error) {
      next(error);
    }
  }
}

export default new TenderCostController();
