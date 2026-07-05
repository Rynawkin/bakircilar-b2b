import { Request, Response, NextFunction } from 'express';
import path from 'path';
import bundleService, { BundleInput } from '../services/bundle.service';
import { getUploadsDir } from '../utils/storage';

function parsePayload(req: Request): BundleInput {
  const raw = (req.body as any)?.payload;
  const data = typeof raw === 'string' ? JSON.parse(raw) : (raw || req.body || {});
  return {
    title: String(data.title || ''),
    secondaryCategoryId: data.secondaryCategoryId ? String(data.secondaryCategoryId) : null,
    discountPercent: data.discountPercent != null ? Number(data.discountPercent) : 0,
    active: data.active !== false,
    items: Array.isArray(data.items)
      ? data.items.map((i: any) => ({
          productId: String(i.productId),
          quantity: Number(i.quantity),
          useDiscountedPrice: Boolean(i.useDiscountedPrice),
        }))
      : [],
  };
}

function tempPathOf(req: Request): string | null {
  if (!req.file) return null;
  return (req.file as any).path || path.join(getUploadsDir(), req.file.filename);
}

class BundleController {
  async list(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ bundles: await bundleService.list() });
    } catch (e) {
      next(e);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const input = parsePayload(req);
      if (!req.file) return res.status(400).json({ error: 'Paket gorseli zorunlu' });
      const result = await bundleService.create(input, req.user?.userId ?? null, tempPathOf(req));
      res.json({ success: true, ...result });
    } catch (e) {
      next(e);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const input = parsePayload(req);
      const result = await bundleService.update(req.params.id, input, req.user?.userId ?? null, tempPathOf(req));
      res.json({ success: true, ...result });
    } catch (e) {
      next(e);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await bundleService.remove(req.params.id);
      res.json({ success: true, ...result });
    } catch (e) {
      next(e);
    }
  }
}

export default new BundleController();
