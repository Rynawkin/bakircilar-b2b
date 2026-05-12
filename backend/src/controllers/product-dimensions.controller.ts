import { Request, Response } from 'express';
import productDimensionsService from '../services/product-dimensions.service';

class ProductDimensionsController {
  async searchProducts(req: Request, res: Response) {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : '';
      const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
      const products = await productDimensionsService.searchProducts(search, limit);
      res.json({ products });
    } catch (error: any) {
      console.error('Product dimension search failed:', error);
      res.status(500).json({ error: error.message || 'Urun arama hatasi' });
    }
  }

  async getProduct(req: Request, res: Response) {
    try {
      const product = await productDimensionsService.getProduct(req.params.productCode);
      const history = await productDimensionsService.getHistory(req.params.productCode);
      res.json({ product, history });
    } catch (error: any) {
      console.error('Product dimension get failed:', error);
      res.status(500).json({ error: error.message || 'Urun getirme hatasi' });
    }
  }

  async updateProduct(req: Request, res: Response) {
    try {
      const product = await productDimensionsService.updateProduct(
        req.params.productCode,
        req.body || {},
        req.user?.userId
      );
      const history = await productDimensionsService.getHistory(req.params.productCode);
      res.json({ product, history });
    } catch (error: any) {
      console.error('Product dimension update failed:', error);
      res.status(400).json({ error: error.message || 'Urun guncelleme hatasi' });
    }
  }

  async searchShelves(req: Request, res: Response) {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : '';
      const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
      const shelves = await productDimensionsService.searchShelves(search, limit);
      res.json({ shelves });
    } catch (error: any) {
      console.error('Shelf search failed:', error);
      res.status(500).json({ error: error.message || 'Raf arama hatasi' });
    }
  }

  async getMissingProducts(req: Request, res: Response) {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : '';
      const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
      const products = await productDimensionsService.getMissingProducts({ search, limit });
      res.json({ products });
    } catch (error: any) {
      console.error('Missing dimension list failed:', error);
      res.status(500).json({ error: error.message || 'Eksik veri listesi hatasi' });
    }
  }
}

export default new ProductDimensionsController();
