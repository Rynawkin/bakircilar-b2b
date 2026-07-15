import crypto from 'crypto';
import UAParser from 'ua-parser-js';
import { prisma } from '../utils/prisma';
import config from '../config';
import { AppError, ErrorCode } from '../types/errors';
import notificationService from './notification.service';
import salesCatalogService, { SalesCatalogSharePricingContext } from './sales-catalog.service';

const LINK_STATUSES = new Set(['ACTIVE', 'PAUSED', 'REVOKED']);
const LINK_ADJUSTMENTS = new Set(['MARKUP', 'GROSS_MARGIN', 'LOSS', 'NONE']);
const EVENT_TYPES = new Set(['VIEW', 'PDF_DOWNLOAD', 'SHARE_CLICK']);
const SESSION_WINDOW_MS = 30 * 60 * 1000;
const ACCESS_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const ANOMALY_WINDOW_MS = 24 * 60 * 60 * 1000;
const ANOMALY_DEVICE_THRESHOLD = 4;
const BOT_PATTERN = /(bot|crawler|spider|slurp|preview|facebookexternalhit|whatsapp|telegrambot|linkedinbot|discordbot|skypeuripreview|headless|lighthouse|pagespeed|uptimerobot|monitoring)/i;

type CatalogActor = {
  userId?: string | null;
  name?: string | null;
};

export type PublicCatalogRequestContext = {
  visitorKey?: string | null;
  userAgent?: string | null;
  accessToken?: string | null;
  ip?: string | null;
};

export type SalesCatalogShareLinkInput = {
  name?: string;
  recipientName?: string | null;
  linkedCustomerId?: string | null;
  status?: string;
  expiresAt?: string | null;
  maxDevices?: number | null;
  maxViews?: number | null;
  pin?: string | null;
  clearPin?: boolean;
  lockToFirstDevice?: boolean;
  resetDeviceBinding?: boolean;
  useCustomPricing?: boolean;
  adjustmentType?: string | null;
  adjustmentValue?: number | null;
};

type PreparedAccess = {
  link: any;
  visitor: any | null;
  visitorKey: string | null;
  linkVisitor: any | null;
  isBot: boolean;
};

const pinAttempts = new Map<string, { count: number; resetAt: number }>();

const clampInt = (value: unknown, min: number, max: number): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(min, parsed));
};

const clampNumber = (value: unknown, min: number, max: number, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const optionalDate = (value: unknown): Date | null => {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

const safeMetadata = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const text = JSON.stringify(value);
    if (text.length > 2048) return null;
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
};

class SalesCatalogShareService {
  private accessError(code: string, message: string, statusCode = 403): AppError {
    return new AppError(message, statusCode, statusCode === 401 ? ErrorCode.UNAUTHORIZED : ErrorCode.FORBIDDEN, {
      catalogAccessCode: code,
    });
  }

  private makeToken() {
    return crypto.randomBytes(24).toString('base64url');
  }

  private isBot(userAgent?: string | null) {
    return BOT_PATTERN.test(String(userAgent || ''));
  }

  private parseDevice(userAgent?: string | null) {
    const ua = String(userAgent || '').slice(0, 1000);
    try {
      const parsed = new UAParser(ua).getResult();
      const deviceType = parsed.device.type
        ? String(parsed.device.type)
        : /mobile|android|iphone|ipad/i.test(ua)
          ? 'mobile'
          : 'desktop';
      return {
        deviceType,
        operatingSystem: [parsed.os.name, parsed.os.version].filter(Boolean).join(' ') || 'Bilinmiyor',
        browser: [parsed.browser.name, parsed.browser.version].filter(Boolean).join(' ') || 'Bilinmiyor',
        userAgentHash: crypto.createHash('sha256').update(ua).digest('hex'),
      };
    } catch {
      return {
        deviceType: /mobile|android|iphone|ipad/i.test(ua) ? 'mobile' : 'desktop',
        operatingSystem: 'Bilinmiyor',
        browser: 'Bilinmiyor',
        userAgentHash: crypto.createHash('sha256').update(ua).digest('hex'),
      };
    }
  }

  private async hashPin(pin: string) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(pin, salt, 32, (error, key) => error ? reject(error) : resolve(key as Buffer));
    });
    return `scrypt$${salt}$${derived.toString('hex')}`;
  }

  private async verifyPin(pin: string, stored: string) {
    const [algorithm, salt, expectedHex] = String(stored || '').split('$');
    if (algorithm !== 'scrypt' || !salt || !expectedHex) return false;
    const derived = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(pin, salt, 32, (error, key) => error ? reject(error) : resolve(key as Buffer));
    });
    const expected = Buffer.from(expectedHex, 'hex');
    return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
  }

  private signAccess(linkId: string, visitorId: string) {
    const payload = Buffer.from(JSON.stringify({ linkId, visitorId, exp: Date.now() + ACCESS_TOKEN_TTL_MS })).toString('base64url');
    const signature = crypto.createHmac('sha256', config.jwtSecret).update(payload).digest('base64url');
    return `${payload}.${signature}`;
  }

  private verifyAccess(token: string | null | undefined, linkId: string, visitorId: string) {
    if (!token) return false;
    const [payload, signature] = String(token).split('.');
    if (!payload || !signature) return false;
    const expected = crypto.createHmac('sha256', config.jwtSecret).update(payload).digest('base64url');
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return false;
    try {
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      return decoded.linkId === linkId && decoded.visitorId === visitorId && Number(decoded.exp) > Date.now();
    } catch {
      return false;
    }
  }

  private effectiveStatus(link: any) {
    if (link.status === 'REVOKED') return 'REVOKED';
    if (link.status === 'PAUSED') return 'PAUSED';
    if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) return 'EXPIRED';
    if (link.maxViews && link.sessionCount >= link.maxViews) return 'VIEW_LIMIT_REACHED';
    return 'ACTIVE';
  }

  private linkDto(link: any) {
    const uniqueDevices = Number(link._count?.visitors ?? link.uniqueDevices ?? 0);
    const { pinHash: _pinHash, _count: _count, ...safe } = link;
    return {
      ...safe,
      hasPin: Boolean(link.pinHash),
      uniqueDevices,
      effectiveStatus: this.effectiveStatus(link),
      publicPath: `/catalog/${link.token}`,
    };
  }

  private async ensureDefaultLink(catalog: any) {
    const existing = await prisma.salesCatalogShareLink.findFirst({
      where: { catalogId: catalog.id, isDefault: true },
      include: { catalog: true },
    });
    if (existing) return existing;
    try {
      return await prisma.salesCatalogShareLink.create({
        data: {
          catalogId: catalog.id,
          name: 'Genel Link',
          token: catalog.shareToken,
          isDefault: true,
          status: catalog.status === 'ARCHIVED' ? 'PAUSED' : 'ACTIVE',
          viewCount: catalog.viewCount,
          pdfDownloadCount: catalog.pdfDownloadCount,
          lastViewedAt: catalog.lastViewedAt,
          createdById: catalog.createdById,
          createdByName: catalog.createdByName,
          updatedById: catalog.updatedById,
          updatedByName: catalog.updatedByName,
        },
        include: { catalog: true },
      });
    } catch {
      const raced = await prisma.salesCatalogShareLink.findFirst({
        where: { catalogId: catalog.id, isDefault: true },
        include: { catalog: true },
      });
      if (!raced) throw new AppError('Genel katalog baglantisi olusturulamadi.', 500, ErrorCode.INTERNAL_SERVER_ERROR);
      return raced;
    }
  }

  private async resolveLink(token: string) {
    const direct = await prisma.salesCatalogShareLink.findUnique({
      where: { token },
      include: { catalog: true },
    });
    if (direct) return direct;
    const legacyCatalog = await prisma.salesCatalog.findUnique({ where: { shareToken: token } });
    if (!legacyCatalog) return null;
    return this.ensureDefaultLink(legacyCatalog);
  }

  private assertLinkAvailable(link: any) {
    const now = new Date();
    if (!link || link.catalog?.status !== 'PUBLISHED') {
      throw new AppError('Katalog bulunamadi veya yayinda degil.', 404, ErrorCode.NOT_FOUND);
    }
    if ((link.catalog.validFrom && link.catalog.validFrom > now) || (link.catalog.validTo && link.catalog.validTo < now)) {
      throw this.accessError('CATALOG_DATE_INACTIVE', 'Katalog yayin donemi disinda.');
    }
    if (link.status === 'PAUSED') throw this.accessError('LINK_PAUSED', 'Bu paylasim baglantisi duraklatildi.');
    if (link.status === 'REVOKED') throw this.accessError('LINK_REVOKED', 'Bu paylasim baglantisi iptal edildi.');
    if (link.expiresAt && link.expiresAt < now) throw this.accessError('LINK_EXPIRED', 'Bu paylasim baglantisinin suresi doldu.');
  }

  private async resolveVisitor(visitorKey: string | null | undefined, userAgent?: string | null) {
    const validKey = /^[A-Za-z0-9_-]{24,128}$/.test(String(visitorKey || '')) ? String(visitorKey) : this.makeToken();
    const device = this.parseDevice(userAgent);
    const visitor = await prisma.salesCatalogVisitor.upsert({
      where: { visitorKey: validKey },
      create: { visitorKey: validKey, ...device },
      update: { ...device, lastSeenAt: new Date() },
    });
    return { visitor, visitorKey: validKey };
  }

  private async assertVisitorAllowed(link: any, visitor: any) {
    if (visitor.globalBlockedAt) throw this.accessError('VISITOR_BLOCKED', 'Bu tarayicinin katalog erisimi engellendi.');
    const catalogBlock = await prisma.salesCatalogVisitorBlock.findUnique({
      where: { catalogId_visitorId: { catalogId: link.catalogId, visitorId: visitor.id } },
      select: { id: true },
    });
    if (catalogBlock) throw this.accessError('VISITOR_BLOCKED', 'Bu tarayicinin katalog erisimi engellendi.');
  }

  private async ensureLinkVisitor(link: any, visitor: any) {
    const existing = await prisma.salesCatalogLinkVisitor.findUnique({
      where: { shareLinkId_visitorId: { shareLinkId: link.id, visitorId: visitor.id } },
    });
    if (existing) {
      await prisma.salesCatalogLinkVisitor.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date() },
      });
      return existing;
    }

    if (link.lockToFirstDevice && link.boundVisitorId && link.boundVisitorId !== visitor.id) {
      await this.notifyDeviceAnomaly(link, true);
      throw this.accessError('DEVICE_LIMIT', 'Bu baglanti ilk acan cihaza kilitli.');
    }
    const deviceLimit = link.lockToFirstDevice ? 1 : link.maxDevices;
    if (deviceLimit) {
      const deviceCount = await prisma.salesCatalogLinkVisitor.count({ where: { shareLinkId: link.id } });
      if (deviceCount >= deviceLimit) {
        await this.notifyDeviceAnomaly(link, true);
        throw this.accessError('DEVICE_LIMIT', `Bu baglanti en fazla ${deviceLimit} farkli cihazda kullanilabilir.`);
      }
    }

    return prisma.$transaction(async (tx) => {
      if (link.lockToFirstDevice && !link.boundVisitorId) {
        await tx.salesCatalogShareLink.updateMany({
          where: { id: link.id, boundVisitorId: null },
          data: { boundVisitorId: visitor.id },
        });
        const refreshed = await tx.salesCatalogShareLink.findUnique({ where: { id: link.id }, select: { boundVisitorId: true } });
        if (refreshed?.boundVisitorId !== visitor.id) {
          throw this.accessError('DEVICE_LIMIT', 'Bu baglanti baska bir cihaza kilitlendi.');
        }
      }
      return tx.salesCatalogLinkVisitor.create({
        data: { shareLinkId: link.id, visitorId: visitor.id },
      });
    });
  }

  private async assertViewLimit(link: any, visitorId: string) {
    if (!link.maxViews || link.sessionCount < link.maxViews) return;
    const cutoff = new Date(Date.now() - SESSION_WINDOW_MS);
    const activeSession = await prisma.salesCatalogViewSession.findFirst({
      where: { shareLinkId: link.id, visitorId, lastSeenAt: { gte: cutoff } },
      select: { id: true },
    });
    if (!activeSession) throw this.accessError('VIEW_LIMIT', 'Bu baglantinin goruntulenme limiti doldu.');
  }

  private async prepareAccess(token: string, context: PublicCatalogRequestContext): Promise<PreparedAccess> {
    const link = await this.resolveLink(token);
    if (!link) throw new AppError('Katalog bulunamadi veya yayinda degil.', 404, ErrorCode.NOT_FOUND);
    this.assertLinkAvailable(link);
    const isBot = this.isBot(context.userAgent);
    if (isBot) {
      if (link.pinHash) throw this.accessError('PIN_REQUIRED', 'Bu katalog PIN ile korunuyor.', 401);
      return { link, visitor: null, visitorKey: null, linkVisitor: null, isBot: true };
    }

    const { visitor, visitorKey } = await this.resolveVisitor(context.visitorKey, context.userAgent);
    await this.assertVisitorAllowed(link, visitor);
    if (link.pinHash && !this.verifyAccess(context.accessToken, link.id, visitor.id)) {
      throw this.accessError('PIN_REQUIRED', 'Bu katalog PIN ile korunuyor.', 401);
    }
    await this.assertViewLimit(link, visitor.id);
    const linkVisitor = await this.ensureLinkVisitor(link, visitor);
    return { link, visitor, visitorKey, linkVisitor, isBot: false };
  }

  private sharePricingContext(link: any): SalesCatalogSharePricingContext {
    return {
      id: link.id,
      token: link.token,
      name: link.name,
      recipientName: link.recipientName,
      linkedCustomerName: link.linkedCustomerName,
      linkedCustomerCode: link.linkedCustomerCode,
      useCustomPricing: link.useCustomPricing,
      adjustmentType: link.adjustmentType,
      adjustmentValue: link.adjustmentValue,
    };
  }

  private async ensurePriceSnapshot(link: any, presentation: any) {
    const prices = (presentation.sections || []).flatMap((section: any) =>
      (section.products || []).map((product: any) => ({
        code: product.productCode,
        price: Number(product.salePrice || 0),
      }))
    ).sort((a: any, b: any) => String(a.code).localeCompare(String(b.code), 'tr'));
    const adjustmentType = link.useCustomPricing ? link.adjustmentType : link.catalog.adjustmentType;
    const adjustmentValue = Number(link.useCustomPricing ? link.adjustmentValue : link.catalog.adjustmentValue) || 0;
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({
      catalogRevision: link.catalog.revision,
      adjustmentType,
      adjustmentValue,
      prices,
    })).digest('hex');
    const snapshot = await prisma.salesCatalogPriceSnapshot.upsert({
      where: { shareLinkId_fingerprint: { shareLinkId: link.id, fingerprint } },
      create: {
        catalogId: link.catalogId,
        shareLinkId: link.id,
        fingerprint,
        catalogRevision: link.catalog.revision,
        adjustmentType,
        adjustmentValue,
        productCount: prices.length,
        prices: prices as any,
      },
      update: {},
    });
    presentation.catalog.priceFingerprint = fingerprint.slice(0, 16).toUpperCase();
    presentation.catalog.priceSnapshotId = snapshot.id;
    presentation.catalog.watermarkText = presentation.catalog.recipientLabel
      ? `${presentation.catalog.recipientLabel} icin hazirlanmistir`
      : null;
    return snapshot;
  }

  private async notifyDeviceAnomaly(link: any, force = false) {
    const now = new Date();
    if (!force && link.lastAnomalyNotifiedAt && now.getTime() - new Date(link.lastAnomalyNotifiedAt).getTime() < ANOMALY_WINDOW_MS) return;
    const updated = await prisma.salesCatalogShareLink.updateMany({
      where: {
        id: link.id,
        OR: [
          { lastAnomalyNotifiedAt: null },
          { lastAnomalyNotifiedAt: { lt: new Date(now.getTime() - ANOMALY_WINDOW_MS) } },
        ],
      },
      data: { lastAnomalyNotifiedAt: now },
    });
    if (updated.count === 0) return;
    const recipients = await prisma.user.findMany({
      where: { role: { in: ['HEAD_ADMIN', 'ADMIN', 'MANAGER'] as any }, active: true },
      select: { id: true },
    });
    await notificationService.createForUsers([...recipients.map((row) => row.id), link.createdById], {
      category: 'CATALOG',
      title: 'Katalog baglantisinda olağandisi cihaz hareketi',
      body: `${link.catalog?.name || 'Katalog'} / ${link.name} baglantisi coklu cihazdan acildi veya cihaz sinirina takildi.`,
      linkUrl: `/sales-catalogs?shareCatalog=${encodeURIComponent(link.catalogId)}`,
      channels: { web: true, mobile: false },
    });
  }

  private async normalizeInput(input: SalesCatalogShareLinkInput, existing?: any) {
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = String(input.name || '').trim().slice(0, 120);
      if (!name) throw new AppError('Baglanti adi zorunludur.', 400, ErrorCode.INVALID_INPUT);
      data.name = existing?.isDefault ? existing.name : name;
    }
    if (input.recipientName !== undefined) data.recipientName = input.recipientName ? String(input.recipientName).trim().slice(0, 160) : null;
    if (input.status !== undefined) {
      const status = String(input.status || '').trim().toUpperCase();
      if (!LINK_STATUSES.has(status)) throw new AppError('Baglanti durumu gecersiz.', 400, ErrorCode.INVALID_INPUT);
      data.status = status;
    }
    if (input.expiresAt !== undefined) data.expiresAt = optionalDate(input.expiresAt);
    if (input.maxDevices !== undefined) data.maxDevices = clampInt(input.maxDevices, 1, 20);
    if (input.maxViews !== undefined) data.maxViews = clampInt(input.maxViews, 1, 1_000_000);
    if (input.lockToFirstDevice !== undefined) data.lockToFirstDevice = Boolean(input.lockToFirstDevice);
    if (input.resetDeviceBinding || input.lockToFirstDevice === false) data.boundVisitorId = null;
    if (input.useCustomPricing !== undefined) data.useCustomPricing = Boolean(input.useCustomPricing);
    if (input.adjustmentType !== undefined) {
      const adjustment = String(input.adjustmentType || '').trim().toUpperCase();
      if (!LINK_ADJUSTMENTS.has(adjustment)) throw new AppError('Link fiyat ayari gecersiz.', 400, ErrorCode.INVALID_INPUT);
      data.adjustmentType = adjustment;
    }
    if (input.adjustmentValue !== undefined) data.adjustmentValue = clampNumber(input.adjustmentValue, 0, 99.99, 0);
    const customPricingEnabled = data.useCustomPricing === true
      || (input.useCustomPricing === undefined && existing?.useCustomPricing === true);
    if (customPricingEnabled) {
      if (data.adjustmentType === undefined) data.adjustmentType = existing?.adjustmentType || 'MARKUP';
      if (data.adjustmentValue === undefined) data.adjustmentValue = Number(existing?.adjustmentValue || 0);
    }
    if (input.clearPin) data.pinHash = null;
    if (input.pin !== undefined && input.pin !== null && input.pin !== '') {
      const pin = String(input.pin).trim();
      if (!/^\d{4,12}$/.test(pin)) throw new AppError('PIN 4-12 haneli rakamlardan olusmalidir.', 400, ErrorCode.INVALID_INPUT);
      data.pinHash = await this.hashPin(pin);
    }
    if (input.linkedCustomerId !== undefined) {
      if (!input.linkedCustomerId) {
        data.linkedCustomerId = null;
        data.linkedCustomerCode = null;
        data.linkedCustomerName = null;
      } else {
        const customer = await prisma.user.findFirst({
          where: { id: input.linkedCustomerId, role: 'CUSTOMER' as any },
          select: { id: true, mikroCariCode: true, displayName: true, mikroName: true, name: true },
        });
        if (!customer) throw new AppError('Secilen musteri bulunamadi.', 400, ErrorCode.USER_NOT_FOUND);
        data.linkedCustomerId = customer.id;
        data.linkedCustomerCode = customer.mikroCariCode;
        data.linkedCustomerName = customer.displayName || customer.mikroName || customer.name;
      }
    }
    return data;
  }

  async listShareLinks(catalogId: string) {
    const catalog = await prisma.salesCatalog.findUnique({ where: { id: catalogId } });
    if (!catalog) throw new AppError('Katalog bulunamadi.', 404, ErrorCode.NOT_FOUND);
    await this.ensureDefaultLink(catalog);
    const links = await prisma.salesCatalogShareLink.findMany({
      where: { catalogId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { visitors: true } } },
    });
    return links.map((link) => this.linkDto(link));
  }

  async createShareLink(catalogId: string, input: SalesCatalogShareLinkInput, actor: CatalogActor) {
    const catalog = await prisma.salesCatalog.findUnique({ where: { id: catalogId }, select: { id: true } });
    if (!catalog) throw new AppError('Katalog bulunamadi.', 404, ErrorCode.NOT_FOUND);
    const data = await this.normalizeInput(input);
    if (!data.name) throw new AppError('Baglanti adi zorunludur.', 400, ErrorCode.INVALID_INPUT);
    const link = await prisma.salesCatalogShareLink.create({
      data: {
        ...data,
        catalogId,
        token: this.makeToken(),
        isDefault: false,
        createdById: actor.userId || null,
        createdByName: actor.name || null,
        updatedById: actor.userId || null,
        updatedByName: actor.name || null,
      } as any,
      include: { _count: { select: { visitors: true } } },
    });
    return this.linkDto(link);
  }

  async updateShareLink(catalogId: string, linkId: string, input: SalesCatalogShareLinkInput, actor: CatalogActor) {
    const existing = await prisma.salesCatalogShareLink.findFirst({ where: { id: linkId, catalogId } });
    if (!existing) throw new AppError('Paylasim baglantisi bulunamadi.', 404, ErrorCode.NOT_FOUND);
    const data = await this.normalizeInput(input, existing);
    const link = await prisma.salesCatalogShareLink.update({
      where: { id: linkId },
      data: {
        ...data,
        updatedById: actor.userId || null,
        updatedByName: actor.name || null,
      } as any,
      include: { _count: { select: { visitors: true } } },
    });
    return this.linkDto(link);
  }

  async rotateShareLinkToken(catalogId: string, linkId: string, actor: CatalogActor) {
    const existing = await prisma.salesCatalogShareLink.findFirst({ where: { id: linkId, catalogId } });
    if (!existing) throw new AppError('Paylasim baglantisi bulunamadi.', 404, ErrorCode.NOT_FOUND);
    const token = this.makeToken();
    const link = await prisma.$transaction(async (tx) => {
      const updated = await tx.salesCatalogShareLink.update({
        where: { id: linkId },
        data: { token, updatedById: actor.userId || null, updatedByName: actor.name || null },
      });
      if (existing.isDefault) {
        await tx.salesCatalog.update({
          where: { id: catalogId },
          data: { shareToken: token, revision: { increment: 1 }, updatedById: actor.userId || null, updatedByName: actor.name || null },
        });
      }
      return updated;
    });
    return this.linkDto({ ...link, uniqueDevices: await prisma.salesCatalogLinkVisitor.count({ where: { shareLinkId: linkId } }) });
  }

  async getShareLinkAnalytics(catalogId: string, linkId: string) {
    const link = await prisma.salesCatalogShareLink.findFirst({
      where: { id: linkId, catalogId },
      include: { _count: { select: { visitors: true } } },
    });
    if (!link) throw new AppError('Paylasim baglantisi bulunamadi.', 404, ErrorCode.NOT_FOUND);
    const [visitors, events, snapshots] = await Promise.all([
      prisma.salesCatalogLinkVisitor.findMany({
        where: { shareLinkId: linkId },
        orderBy: { lastSeenAt: 'desc' },
        include: {
          visitor: {
            include: {
              catalogBlocks: {
                where: { catalogId },
                select: { id: true, blockedAt: true },
              },
            },
          },
        },
      }),
      prisma.salesCatalogEvent.findMany({
        where: { shareLinkId: linkId },
        orderBy: { occurredAt: 'desc' },
        take: 100,
        select: { id: true, visitorId: true, eventType: true, metadata: true, occurredAt: true, priceSnapshotId: true },
      }),
      prisma.salesCatalogPriceSnapshot.findMany({
        where: { shareLinkId: linkId },
        orderBy: { generatedAt: 'desc' },
        take: 20,
        select: { id: true, fingerprint: true, catalogRevision: true, adjustmentType: true, adjustmentValue: true, productCount: true, generatedAt: true },
      }),
    ]);
    return {
      link: this.linkDto(link),
      visitors: visitors.map((row) => ({
        id: row.visitor.id,
        anonymousId: row.visitor.id.slice(0, 8).toUpperCase(),
        deviceType: row.visitor.deviceType,
        operatingSystem: row.visitor.operatingSystem,
        browser: row.visitor.browser,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
        viewCount: row.viewCount,
        sessionCount: row.sessionCount,
        pdfDownloadCount: row.pdfDownloadCount,
        shareClickCount: row.shareClickCount,
        catalogBlocked: row.visitor.catalogBlocks.length > 0,
        globalBlocked: Boolean(row.visitor.globalBlockedAt),
        globalBlockedAt: row.visitor.globalBlockedAt,
      })),
      events,
      snapshots,
    };
  }

  private async assertVisitorBelongsToLink(catalogId: string, linkId: string, visitorId: string) {
    const row = await prisma.salesCatalogLinkVisitor.findFirst({
      where: { shareLinkId: linkId, visitorId, shareLink: { catalogId } },
      select: { id: true },
    });
    if (!row) throw new AppError('Ziyaretci kaydi bulunamadi.', 404, ErrorCode.NOT_FOUND);
  }

  async setCatalogBlock(catalogId: string, linkId: string, visitorId: string, blocked: boolean, actor: CatalogActor, reason?: string | null) {
    await this.assertVisitorBelongsToLink(catalogId, linkId, visitorId);
    if (blocked) {
      await prisma.salesCatalogVisitorBlock.upsert({
        where: { catalogId_visitorId: { catalogId, visitorId } },
        create: { catalogId, visitorId, reason: reason || null, blockedById: actor.userId || null, blockedByName: actor.name || null },
        update: { reason: reason || null, blockedById: actor.userId || null, blockedByName: actor.name || null, blockedAt: new Date() },
      });
    } else {
      await prisma.salesCatalogVisitorBlock.deleteMany({ where: { catalogId, visitorId } });
    }
    return { success: true };
  }

  async setGlobalBlock(catalogId: string, linkId: string, visitorId: string, blocked: boolean, actor: CatalogActor, reason?: string | null) {
    await this.assertVisitorBelongsToLink(catalogId, linkId, visitorId);
    await prisma.salesCatalogVisitor.update({
      where: { id: visitorId },
      data: blocked ? {
        globalBlockedAt: new Date(),
        globalBlockReason: reason || null,
        globalBlockedById: actor.userId || null,
        globalBlockedByName: actor.name || null,
      } : {
        globalBlockedAt: null,
        globalBlockReason: null,
        globalBlockedById: null,
        globalBlockedByName: null,
      },
    });
    return { success: true };
  }

  async authorizePin(token: string, pin: unknown, context: PublicCatalogRequestContext) {
    const link = await this.resolveLink(token);
    if (!link) throw new AppError('Katalog bulunamadi veya yayinda degil.', 404, ErrorCode.NOT_FOUND);
    this.assertLinkAvailable(link);
    if (!link.pinHash) return { accessToken: null, visitorKey: context.visitorKey || null, protected: false };
    if (this.isBot(context.userAgent)) throw this.accessError('PIN_REQUIRED', 'Bu katalog PIN ile korunuyor.', 401);
    const attemptKey = `${token}:${context.ip || 'unknown'}`;
    const attempt = pinAttempts.get(attemptKey);
    if (attempt && attempt.resetAt > Date.now() && attempt.count >= 5) {
      throw this.accessError('PIN_RATE_LIMIT', 'Cok fazla hatali PIN denemesi yapildi. 15 dakika sonra tekrar deneyin.', 429);
    }
    const valid = await this.verifyPin(String(pin || ''), link.pinHash);
    if (!valid) {
      const current = attempt && attempt.resetAt > Date.now() ? attempt : { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
      pinAttempts.set(attemptKey, { ...current, count: current.count + 1 });
      throw this.accessError('PIN_INVALID', 'Girdiginiz PIN hatali.', 401);
    }
    pinAttempts.delete(attemptKey);
    const { visitor, visitorKey } = await this.resolveVisitor(context.visitorKey, context.userAgent);
    await this.assertVisitorAllowed(link, visitor);
    await this.ensureLinkVisitor(link, visitor);
    return { accessToken: this.signAccess(link.id, visitor.id), visitorKey, protected: true };
  }

  async getPublicCatalog(token: string, context: PublicCatalogRequestContext) {
    const access = await this.prepareAccess(token, context);
    const presentation = await salesCatalogService.getPublicPresentationForShareLink(
      access.link.catalogId,
      this.sharePricingContext(access.link)
    );
    if (!presentation) throw new AppError('Katalog bulunamadi veya yayinda degil.', 404, ErrorCode.NOT_FOUND);
    await this.ensurePriceSnapshot(access.link, presentation);
    return { data: presentation, visitorKey: access.visitorKey };
  }

  async recordEvent(token: string, eventTypeInput: unknown, input: any, context: PublicCatalogRequestContext) {
    const eventType = String(eventTypeInput || '').trim().toUpperCase();
    if (!EVENT_TYPES.has(eventType)) throw new AppError('Katalog olayi gecersiz.', 400, ErrorCode.INVALID_INPUT);
    const access = await this.prepareAccess(token, context);
    if (access.isBot || !access.visitor || !access.linkVisitor) return { success: true, ignored: true };
    const clientEventId = /^[A-Za-z0-9_-]{8,100}$/.test(String(input?.clientEventId || ''))
      ? String(input.clientEventId)
      : null;
    if (clientEventId) {
      const duplicate = await prisma.salesCatalogEvent.findUnique({ where: { clientEventId }, select: { id: true } });
      if (duplicate) return { success: true, duplicate: true };
    }
    const metadata = safeMetadata(input?.metadata);
    let priceSnapshotId: string | null = null;
    if (typeof input?.priceSnapshotId === 'string') {
      const snapshot = await prisma.salesCatalogPriceSnapshot.findFirst({
        where: { id: input.priceSnapshotId, shareLinkId: access.link.id },
        select: { id: true },
      });
      priceSnapshotId = snapshot?.id || null;
    }
    const now = new Date();
    const cutoff = new Date(now.getTime() - SESSION_WINDOW_MS);
    let session = await prisma.salesCatalogViewSession.findFirst({
      where: { shareLinkId: access.link.id, visitorId: access.visitor.id, lastSeenAt: { gte: cutoff } },
      orderBy: { lastSeenAt: 'desc' },
    });
    const isNewSession = eventType === 'VIEW' && !session;
    if (isNewSession && access.link.maxViews && access.link.sessionCount >= access.link.maxViews) {
      throw this.accessError('VIEW_LIMIT', 'Bu baglantinin goruntulenme limiti doldu.');
    }
    const firstOpen = eventType === 'VIEW' && access.linkVisitor.sessionCount === 0;

    await prisma.$transaction(async (tx) => {
      if (eventType === 'VIEW') {
        if (session) {
          session = await tx.salesCatalogViewSession.update({
            where: { id: session.id },
            data: { lastSeenAt: now, viewCount: { increment: 1 }, ...(priceSnapshotId ? { priceSnapshotId } : {}) },
          });
        } else {
          session = await tx.salesCatalogViewSession.create({
            data: {
              catalogId: access.link.catalogId,
              shareLinkId: access.link.id,
              visitorId: access.visitor.id,
              priceSnapshotId,
            },
          });
        }
        await tx.salesCatalogShareLink.update({
          where: { id: access.link.id },
          data: {
            viewCount: { increment: 1 },
            ...(isNewSession ? { sessionCount: { increment: 1 } } : {}),
            lastViewedAt: now,
          },
        });
        await tx.salesCatalog.update({
          where: { id: access.link.catalogId },
          data: { viewCount: { increment: 1 }, lastViewedAt: now },
        });
        await tx.salesCatalogLinkVisitor.update({
          where: { id: access.linkVisitor.id },
          data: {
            viewCount: { increment: 1 },
            ...(isNewSession ? { sessionCount: { increment: 1 } } : {}),
            lastSeenAt: now,
          },
        });
      } else if (eventType === 'PDF_DOWNLOAD') {
        await tx.salesCatalogShareLink.update({ where: { id: access.link.id }, data: { pdfDownloadCount: { increment: 1 } } });
        await tx.salesCatalog.update({ where: { id: access.link.catalogId }, data: { pdfDownloadCount: { increment: 1 } } });
        await tx.salesCatalogLinkVisitor.update({ where: { id: access.linkVisitor.id }, data: { pdfDownloadCount: { increment: 1 }, lastSeenAt: now } });
      } else {
        await tx.salesCatalogShareLink.update({ where: { id: access.link.id }, data: { shareClickCount: { increment: 1 } } });
        await tx.salesCatalogLinkVisitor.update({ where: { id: access.linkVisitor.id }, data: { shareClickCount: { increment: 1 }, lastSeenAt: now } });
      }

      await tx.salesCatalogVisitor.update({ where: { id: access.visitor.id }, data: { lastSeenAt: now } });
      if (firstOpen) {
        await tx.salesCatalogEvent.create({
          data: {
            catalogId: access.link.catalogId,
            shareLinkId: access.link.id,
            visitorId: access.visitor.id,
            sessionId: session?.id || null,
            eventType: 'FIRST_OPEN',
            priceSnapshotId,
          },
        });
      }
      await tx.salesCatalogEvent.create({
        data: {
          catalogId: access.link.catalogId,
          shareLinkId: access.link.id,
          visitorId: access.visitor.id,
          sessionId: session?.id || null,
          clientEventId,
          eventType,
          priceSnapshotId,
          metadata: metadata as any,
        },
      });
    });

    if (isNewSession && firstOpen) {
      const since = new Date(Date.now() - ANOMALY_WINDOW_MS);
      const recentDevices = await prisma.salesCatalogLinkVisitor.count({
        where: { shareLinkId: access.link.id, firstSeenAt: { gte: since } },
      });
      if (recentDevices > 1) {
        await prisma.salesCatalogEvent.create({
          data: {
            catalogId: access.link.catalogId,
            shareLinkId: access.link.id,
            visitorId: access.visitor.id,
            sessionId: session?.id || null,
            eventType: 'MULTI_DEVICE',
            priceSnapshotId,
            metadata: { deviceCount: recentDevices },
          },
        });
      }
      if (recentDevices >= ANOMALY_DEVICE_THRESHOLD) await this.notifyDeviceAnomaly(access.link);
    }
    return { success: true, sessionId: session?.id || null, isNewSession };
  }
}

export default new SalesCatalogShareService();
