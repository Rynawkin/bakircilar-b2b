import { Request, Response } from 'express';
import stockCreateService from '../services/stock-create.service';

class StockCreateController {
  async getMetadata(req: Request, res: Response) {
    try {
      const data = await stockCreateService.getMetadata();
      res.json(data);
    } catch (error: any) {
      console.error('Stock create metadata failed:', error);
      res.status(500).json({ error: error.message || 'Stok acma bilgileri alinamadi' });
    }
  }

  async searchLookups(req: Request, res: Response) {
    try {
      const type = String(req.params.type || '') as any;
      const search = typeof req.query.search === 'string' ? req.query.search : '';
      const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

      if (!['supplier', 'brand', 'category', 'package', 'template'].includes(type)) {
        res.status(400).json({ error: 'Gecersiz arama tipi' });
        return;
      }

      const items = await stockCreateService.searchLookups(type, search, limit);
      res.json({ items });
    } catch (error: any) {
      console.error('Stock create lookup failed:', error);
      res.status(500).json({ error: error.message || 'Arama yapilamadi' });
    }
  }

  async preview(req: Request, res: Response) {
    try {
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      const data = await stockCreateService.preview(items);
      res.json(data);
    } catch (error: any) {
      console.error('Stock create preview failed:', error);
      res.status(400).json({ error: error.message || 'On kontrol yapilamadi' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      const data = await stockCreateService.create(items, req.user?.userId);
      res.json(data);
    } catch (error: any) {
      console.error('Stock create failed:', error);
      res.status(400).json({ error: error.message || 'Stok karti olusturulamadi' });
    }
  }

  async getHistory(req: Request, res: Response) {
    try {
      const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
      const logs = await stockCreateService.getHistory(limit);
      res.json({ logs });
    } catch (error: any) {
      console.error('Stock create history failed:', error);
      res.status(500).json({ error: error.message || 'Gecmis alinamadi' });
    }
  }
}

export default new StockCreateController();
