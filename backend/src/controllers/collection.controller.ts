/**
 * Koleksiyon controller ("Sizin icin koleksiyonlar").
 * Customer: GET /collections/active, GET /collections/:id (MANUAL detay).
 * Admin: /admin/collections CRUD.
 */
import { Request, Response, NextFunction } from 'express';
import collectionService from '../services/collection.service';

class CollectionController {
  // ---- CUSTOMER ----
  async getActive(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await collectionService.getActiveForCustomer(req.user!.userId);
      res.json(result);
    } catch (e) {
      next(e);
    }
  }

  async getOne(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await collectionService.getCollectionProductsForCustomer(
        req.params.id,
        req.user!.userId,
        {
          search: typeof req.query.search === 'string' ? req.query.search : undefined,
          sort: typeof req.query.sort === 'string' ? req.query.sort : undefined,
          priceType: req.query.priceType === 'white' ? 'white' : req.query.priceType === 'invoiced' ? 'invoiced' : undefined,
          limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined,
          offset: typeof req.query.offset === 'string' ? Number(req.query.offset) : undefined,
        }
      );
      if (!result) {
        return res.status(404).json({ error: 'Koleksiyon bulunamadi' });
      }
      res.json(result);
    } catch (e) {
      next(e);
    }
  }

  // ---- ADMIN ----
  async listAll(_req: Request, res: Response, next: NextFunction) {
    try {
      const collections = await collectionService.listCollections();
      res.json({ collections });
    } catch (e) {
      next(e);
    }
  }

  async getOneAdmin(req: Request, res: Response, next: NextFunction) {
    try {
      const collection = await collectionService.getCollection(req.params.id);
      if (!collection) {
        return res.status(404).json({ error: 'Koleksiyon bulunamadi' });
      }
      res.json({ collection });
    } catch (e) {
      next(e);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body || {};
      const collection = await collectionService.createCollection(body);
      res.status(201).json({ collection });
    } catch (e) {
      next(e);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const collection = await collectionService.updateCollection(req.params.id, req.body || {});
      res.json({ collection });
    } catch (e) {
      next(e);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await collectionService.deleteCollection(req.params.id);
      res.json(result);
    } catch (e) {
      next(e);
    }
  }
}

export default new CollectionController();
