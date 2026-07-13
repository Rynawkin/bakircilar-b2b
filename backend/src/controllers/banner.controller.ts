/**
 * Banner Controller
 * Musteri landing sayfasi icin admin tarafindan yonetilen bannerlar.
 */
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';

const POSITIONS = ['HERO', 'STRIP', 'SIDE', 'GRID', 'CATALOG'];

const sanitize = (body: any) => {
  const out: any = {};
  if (body.title !== undefined) out.title = String(body.title).trim();
  if (body.subtitle !== undefined) out.subtitle = body.subtitle ? String(body.subtitle).trim() : null;
  if (body.imageUrl !== undefined) out.imageUrl = body.imageUrl ? String(body.imageUrl).trim() : null;
  // Dar (mobil) ekran icin ayri gorsel; bos ise musteri tarafinda imageUrl'e dusulur.
  if (body.mobileImageUrl !== undefined) out.mobileImageUrl = body.mobileImageUrl ? String(body.mobileImageUrl).trim() : null;
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
      // HERO istegi (veya pozisyonsuz genel istek) icinde hero gecis suresini de dondur.
      const wantsHeroInterval = !position || position === 'HERO';
      const [banners, settings] = await Promise.all([
        prisma.banner.findMany({
          where: {
            active: true,
            ...(position && POSITIONS.includes(position) ? { position } : {}),
            AND: [
              { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
              { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
            ],
          },
          orderBy: [{ position: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
        }),
        wantsHeroInterval
          ? prisma.settings.findFirst({
              orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
              select: { heroBannerIntervalMs: true },
            })
          : Promise.resolve(null),
      ]);
      // 2000ms altina inmesin (cok hizli olmasin); tanimsizsa 6000ms varsayilan.
      const heroIntervalMs = Math.max(2000, settings?.heroBannerIntervalMs ?? 6000);
      res.json(wantsHeroInterval ? { banners, heroIntervalMs } : { banners });
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
      const banner = await prisma.banner.create({
        data: {
          title: data.title ?? '',
          subtitle: data.subtitle ?? null,
          imageUrl: data.imageUrl ?? null,
          mobileImageUrl: data.mobileImageUrl ?? null,
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

  /**
   * Admin: banner tiklama istatistikleri.
   * CustomerActivityEvent uzerinden eventType CLICK + meta.bannerId dolu olaylari sayar.
   * GET /api/admin/banners/stats?days=30 -> { stats: [{ bannerId, clicks }] }
   */
  async stats(req: Request, res: Response, next: NextFunction) {
    try {
      const rawDays = Number(req.query.days);
      const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(Math.trunc(rawDays), 365) : 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // meta JSON path sorgusu icin raw query (PostgreSQL)
      const rows = await prisma.$queryRaw<Array<{ bannerId: string; clicks: number }>>`
        SELECT e."meta"->>'bannerId' AS "bannerId", COUNT(*)::int AS "clicks"
        FROM "CustomerActivityEvent" e
        WHERE e."type" = 'CLICK'
          AND e."createdAt" >= ${since}
          AND e."meta"->>'bannerId' IS NOT NULL
        GROUP BY e."meta"->>'bannerId'
        ORDER BY COUNT(*) DESC
      `;

      res.json({
        stats: rows.map((row) => ({ bannerId: row.bannerId, clicks: Number(row.clicks) })),
      });
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
