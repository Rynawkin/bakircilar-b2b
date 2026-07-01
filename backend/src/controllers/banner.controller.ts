/**
 * Banner Controller
 * Musteri landing sayfasi icin admin tarafindan yonetilen bannerlar.
 */
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';

const POSITIONS = ['HERO', 'STRIP', 'SIDE', 'GRID'];

const sanitize = (body: any) => {
  const out: any = {};
  if (body.title !== undefined) out.title = String(body.title).trim();
  if (body.subtitle !== undefined) out.subtitle = body.subtitle ? String(body.subtitle).trim() : null;
  if (body.imageUrl !== undefined) out.imageUrl = body.imageUrl ? String(body.imageUrl).trim() : null;
  if (body.linkUrl !== undefined) out.linkUrl = body.linkUrl ? String(body.linkUrl).trim() : null;
  if (body.productCode !== undefined) out.productCode = body.productCode ? String(body.productCode).trim() : null;
  if (body.buttonText !== undefined) out.buttonText = body.buttonText ? String(body.buttonText).trim() : null;
  if (body.position !== undefined) out.position = POSITIONS.includes(body.position) ? body.position : 'HERO';
  if (body.sortOrder !== undefined) out.sortOrder = Number.isFinite(Number(body.sortOrder)) ? Math.trunc(Number(body.sortOrder)) : 0;
  if (body.active !== undefined) out.active = Boolean(body.active);
  if (body.startsAt !== undefined) out.startsAt = body.startsAt ? new Date(body.startsAt) : null;
  if (body.endsAt !== undefined) out.endsAt = body.endsAt ? new Date(body.endsAt) : null;
  return out;
};

class BannerController {
  /** Musteri/genel: yalnizca aktif ve tarih penceresindeki bannerlar */
  async listActive(req: Request, res: Response, next: NextFunction) {
    try {
      const now = new Date();
      const position = typeof req.query.position === 'string' ? req.query.position : undefined;
      const banners = await prisma.banner.findMany({
        where: {
          active: true,
          ...(position && POSITIONS.includes(position) ? { position } : {}),
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
        orderBy: [{ position: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
      });
      res.json({ banners });
    } catch (e) { next(e); }
  }

  /** Admin: tum bannerlar */
  async listAll(_req: Request, res: Response, next: NextFunction) {
    try {
      const banners = await prisma.banner.findMany({
        orderBy: [{ position: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
      });
      res.json({ banners });
    } catch (e) { next(e); }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = sanitize(req.body || {});
      if (!data.title) {
        return res.status(400).json({ error: 'Baslik gerekli' });
      }
      const banner = await prisma.banner.create({
        data: {
          title: data.title,
          subtitle: data.subtitle ?? null,
          imageUrl: data.imageUrl ?? null,
          linkUrl: data.linkUrl ?? null,
          productCode: data.productCode ?? null,
          buttonText: data.buttonText ?? null,
          position: data.position ?? 'HERO',
          sortOrder: data.sortOrder ?? 0,
          active: data.active ?? true,
          startsAt: data.startsAt ?? null,
          endsAt: data.endsAt ?? null,
        },
      });
      res.status(201).json({ banner });
    } catch (e) { next(e); }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const data = sanitize(req.body || {});
      const banner = await prisma.banner.update({ where: { id }, data });
      res.json({ banner });
    } catch (e) { next(e); }
  }

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await prisma.banner.delete({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch (e) { next(e); }
  }

  /** Admin: banner gorseli yukle (multipart "image") -> public URL doner */
  async uploadImage(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Dosya yuklenmedi' });
      }
      const imageUrl = `/uploads/${req.file.filename}`;
      res.json({ imageUrl });
    } catch (e) { next(e); }
  }
}

export default new BannerController();
