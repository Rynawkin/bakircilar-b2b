import { Request, Response, NextFunction } from 'express';
import hotSaleService from '../services/hot-sale.service';

const scopeFromRequest = (req: Request) => ({
  role: req.user?.role,
  assignedSectorCodes: req.user?.assignedSectorCodes || [],
  userId: req.user?.userId || null,
});

class HotSaleController {
  async dashboard(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await hotSaleService.getDashboard(req.user?.userId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async vehicles(req: Request, res: Response, next: NextFunction) {
    try {
      const vehicles = await hotSaleService.listVehicles();
      res.json({ vehicles });
    } catch (error) {
      next(error);
    }
  }

  async saveVehicle(req: Request, res: Response, next: NextFunction) {
    try {
      const vehicle = await hotSaleService.upsertVehicle(req.body || {});
      res.json({ vehicle });
    } catch (error) {
      next(error);
    }
  }

  async searchCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await hotSaleService.searchCustomers({
        search: String(req.query.search || ''),
        limit: Number(req.query.limit || 25),
        scope: scopeFromRequest(req),
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async createCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await hotSaleService.createHotCustomer(req.body || {});
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async searchProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await hotSaleService.searchProducts({
        search: String(req.query.search || ''),
        limit: Number(req.query.limit || 40),
        vehicleId: req.query.vehicleId ? String(req.query.vehicleId) : undefined,
        customerIdOrCode: req.query.customerIdOrCode ? String(req.query.customerIdOrCode) : undefined,
        scope: scopeFromRequest(req),
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async openOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await hotSaleService.listOpenOrders({
        search: req.query.search ? String(req.query.search) : undefined,
        customerIdOrCode: req.query.customerIdOrCode ? String(req.query.customerIdOrCode) : undefined,
        vehicleId: req.query.vehicleId ? String(req.query.vehicleId) : undefined,
        limit: Number(req.query.limit || 30),
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async startSession(req: Request, res: Response, next: NextFunction) {
    try {
      const session = await hotSaleService.startSession({
        ...(req.body || {}),
        userId: req.user?.userId || '',
      });
      res.json({ session });
    } catch (error) {
      next(error);
    }
  }

  async addLoad(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await hotSaleService.addLoad(String(req.params.sessionId), {
        ...(req.body || {}),
        userId: req.user?.userId || '',
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async sessionDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await hotSaleService.getSessionDetail(String(req.params.sessionId));
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async inventory(req: Request, res: Response, next: NextFunction) {
    try {
      const inventory = await hotSaleService.getVehicleInventory(String(req.params.vehicleId));
      res.json({ inventory });
    } catch (error) {
      next(error);
    }
  }

  async reconciliation(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await hotSaleService.getReconciliation(Number(req.query.limit || 80));
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async cancelTransaction(req: Request, res: Response, next: NextFunction) {
    try {
      const transaction = await hotSaleService.cancelTransactionLocally(String(req.params.transactionId), {
        ...(req.body || {}),
        userId: req.user?.userId || '',
      });
      res.json({ transaction });
    } catch (error) {
      next(error);
    }
  }

  async createTransaction(req: Request, res: Response, next: NextFunction) {
    try {
      const transaction = await hotSaleService.createTransaction(String(req.params.sessionId), {
        ...(req.body || {}),
        userId: req.user?.userId || '',
      });
      res.json({ transaction });
    } catch (error) {
      next(error);
    }
  }

  async deliverOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const transaction = await hotSaleService.deliverOrderFromVehicle(String(req.params.sessionId), {
        ...(req.body || {}),
        userId: req.user?.userId || '',
      });
      res.json({ transaction });
    } catch (error) {
      next(error);
    }
  }

  async closeSession(req: Request, res: Response, next: NextFunction) {
    try {
      const session = await hotSaleService.closeSession(String(req.params.sessionId), {
        ...(req.body || {}),
        userId: req.user?.userId || '',
      });
      res.json({ session });
    } catch (error) {
      next(error);
    }
  }
}

export default new HotSaleController();
