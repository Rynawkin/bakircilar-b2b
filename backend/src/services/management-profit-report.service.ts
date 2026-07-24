import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import config from '../config';
import { getRedisClient } from '../lib/redis';
import { AppError, ErrorCode } from '../types/errors';
import { prisma } from '../utils/prisma';
import managementProfitReportMikroService from './management-profit-report-mikro.service';
import {
  DEFAULT_MANAGEMENT_PROFIT_REPORT_LAYOUT,
  managementProfitReportFieldCatalog,
  ManagementProfitReportLayout,
  normalizeManagementProfitReportLayout,
  normalizeManagementProfitReportPath,
  resolveIstanbulMonthToDate,
} from '../utils/management-profit-report-layout';

const LINK_STATUSES = new Set(['ACTIVE', 'PAUSED', 'REVOKED']);
const ACCESS_TTL_MS = 12 * 60 * 60 * 1000;
const PIN_WINDOW_SECONDS = 15 * 60;
const PIN_MAX_FAILURES = 5;
const PIN_LINK_MAX_FAILURES = 50;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,128}$/;
const PIN_PATTERN = /^\d{6,12}$/;

type Actor = {
  userId?: string | null;
  name?: string | null;
};

type PublicContext = {
  sessionToken?: string | null;
  userAgent?: string | null;
  ip?: string | null;
};

type AccessSessionPayload = {
  linkId: string;
  version: number;
  userAgentHash: string;
  expiresAt: number;
  period: ReturnType<typeof resolveIstanbulMonthToDate>;
};

type LinkUpdateInput = {
  name?: unknown;
  status?: unknown;
  pin?: unknown;
  canSaveLayout?: unknown;
  expiresAt?: unknown;
};

const asJson = (value: unknown) => value as Prisma.InputJsonValue;

class ManagementProfitReportService {
  private get redis() {
    return getRedisClient();
  }

  private accessError(
    code: string,
    message: string,
    statusCode = 403
  ): AppError {
    return new AppError(
      message,
      statusCode,
      statusCode === 401 ? ErrorCode.UNAUTHORIZED : ErrorCode.FORBIDDEN,
      { reportAccessCode: code }
    );
  }

  private makeRawToken() {
    return crypto.randomBytes(32).toString('base64url');
  }

  private tokenHash(rawToken: string) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  private userAgentHash(userAgent?: string | null) {
    return crypto
      .createHash('sha256')
      .update(String(userAgent || '').slice(0, 1000))
      .digest('hex');
  }

  private clientHash(context: PublicContext) {
    return crypto
      .createHmac('sha256', config.jwtSecret)
      // User-Agent is caller-controlled and must not partition the PIN
      // throttle. Keep the network identity pseudonymous in audit.
      .update(String(context.ip || 'unknown'))
      .digest('hex');
  }

  private async hashPin(pin: string) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(pin, salt, 32, (error, key) =>
        error ? reject(error) : resolve(key as Buffer)
      );
    });
    return `scrypt$${salt}$${derived.toString('hex')}`;
  }

  private async verifyPin(pin: string, stored: string) {
    const [algorithm, salt, expectedHex] = String(stored || '').split('$');
    if (algorithm !== 'scrypt' || !salt || !/^[a-f0-9]{64}$/i.test(expectedHex || '')) {
      return false;
    }
    const derived = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(pin, salt, 32, (error, key) =>
        error ? reject(error) : resolve(key as Buffer)
      );
    });
    const expected = Buffer.from(expectedHex, 'hex');
    return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
  }

  private signSession(link: { id: string; sessionVersion: number }, userAgent?: string | null) {
    const payload: AccessSessionPayload = {
      linkId: link.id,
      version: link.sessionVersion,
      userAgentHash: this.userAgentHash(userAgent),
      expiresAt: Date.now() + ACCESS_TTL_MS,
      // The user asked for the month-to-date period of the day on which the
      // secure link is opened. Keep that period stable for this PIN session so
      // /view and later drill queries cannot cross into different days/months.
      period: resolveIstanbulMonthToDate(),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', config.jwtSecret)
      .update(encoded)
      .digest('base64url');
    return `${encoded}.${signature}`;
  }

  private decodeSession(
    token: string | null | undefined,
    userAgent?: string | null
  ): AccessSessionPayload | null {
    if (!token) return null;
    const [encoded, signature] = String(token).split('.');
    if (!encoded || !signature) return null;
    const expected = crypto
      .createHmac('sha256', config.jwtSecret)
      .update(encoded)
      .digest('base64url');
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      actualBuffer.length !== expectedBuffer.length
      || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      return null;
    }
    try {
      const parsed = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8')
      ) as AccessSessionPayload;
      if (
        !parsed.linkId
        || !Number.isInteger(parsed.version)
        || !Number.isFinite(parsed.expiresAt)
        || parsed.expiresAt <= Date.now()
        || parsed.userAgentHash !== this.userAgentHash(userAgent)
        || parsed.period?.preset !== 'ISTANBUL_MONTH_TO_DATE'
        || parsed.period?.timeZone !== 'Europe/Istanbul'
        || !/^\d{4}-\d{2}-01$/.test(parsed.period?.startDate || '')
        || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.period?.endDate || '')
        || parsed.period.startDate.slice(0, 7) !== parsed.period.endDate.slice(0, 7)
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private assertLinkAvailable(link: {
    status: string;
    expiresAt: Date | null;
  }) {
    if (link.status === 'PAUSED') {
      throw this.accessError('LINK_PAUSED', 'Bu rapor bağlantısı duraklatıldı.');
    }
    if (link.status === 'REVOKED') {
      throw this.accessError('LINK_REVOKED', 'Bu rapor bağlantısı iptal edildi.');
    }
    if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) {
      throw this.accessError('LINK_EXPIRED', 'Bu rapor bağlantısının süresi doldu.');
    }
    if (link.status !== 'ACTIVE') {
      throw this.accessError('LINK_INACTIVE', 'Bu rapor bağlantısı aktif değil.');
    }
  }

  private async requireSession(context: PublicContext) {
    const payload = this.decodeSession(context.sessionToken, context.userAgent);
    if (!payload) {
      throw this.accessError('PIN_REQUIRED', 'Bu rapor PIN ile korunuyor.', 401);
    }
    const link = await prisma.managementProfitReportLink.findUnique({
      where: { id: payload.linkId },
      include: { layout: true },
    });
    if (!link || link.sessionVersion !== payload.version) {
      throw this.accessError('PIN_REQUIRED', 'Rapor oturumunuz geçerli değil.', 401);
    }
    this.assertLinkAvailable(link);
    return { link, period: payload.period };
  }

  private safeLayout(input: unknown): ManagementProfitReportLayout {
    try {
      return normalizeManagementProfitReportLayout(input);
    } catch {
      return DEFAULT_MANAGEMENT_PROFIT_REPORT_LAYOUT;
    }
  }

  private linkDto(link: any) {
    return {
      id: link.id,
      name: link.name,
      tokenHint: link.tokenHint,
      status: link.status,
      effectiveStatus:
        link.status === 'ACTIVE' && link.expiresAt && link.expiresAt.getTime() <= Date.now()
          ? 'EXPIRED'
          : link.status,
      canSaveLayout: link.canSaveLayout,
      expiresAt: link.expiresAt,
      sessionVersion: link.sessionVersion,
      viewCount: link.viewCount,
      lastViewedAt: link.lastViewedAt,
      createdById: link.createdById,
      createdByName: link.createdByName,
      updatedById: link.updatedById,
      updatedByName: link.updatedByName,
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
      layoutRevision: link.layout?.revision || 0,
    };
  }

  private normalizedName(value: unknown) {
    const name = String(value || '').trim();
    if (name.length < 2 || name.length > 100) {
      throw new AppError(
        'Bağlantı adı 2-100 karakter olmalıdır.',
        400,
        ErrorCode.VALIDATION_ERROR
      );
    }
    return name;
  }

  private normalizedPin(value: unknown) {
    const pin = String(value || '').trim();
    if (!PIN_PATTERN.test(pin)) {
      throw new AppError(
        'PIN 6-12 rakamdan oluşmalıdır.',
        400,
        ErrorCode.VALIDATION_ERROR
      );
    }
    return pin;
  }

  private normalizedExpiry(value: unknown, allowUndefined = true) {
    if (value === undefined && allowUndefined) return undefined;
    if (value === null || value === '') return null;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      throw new AppError(
        'Son kullanma tarihi gelecekte olmalıdır.',
        400,
        ErrorCode.VALIDATION_ERROR
      );
    }
    return date;
  }

  private pinRateKey(linkId: string, clientHash: string) {
    return `b2b:mpr:pin:${linkId}:${clientHash}`;
  }

  private pinLinkRateKey(linkId: string) {
    return `b2b:mpr:pin:${linkId}:all`;
  }

  private async fallbackFailureCount(
    linkId: string,
    clientHash?: string
  ) {
    const cutoff = new Date(Date.now() - PIN_WINDOW_SECONDS * 1000);
    return prisma.managementProfitReportAccessAttempt.count({
      where: {
        linkId,
        ...(clientHash ? { clientHash } : {}),
        outcome: { in: ['FAILURE', 'BLOCKED'] },
        createdAt: { gte: cutoff },
      },
    });
  }

  private async currentPinFailureCounts(linkId: string, clientHash: string) {
    try {
      const [clientValue, linkValue] = await this.redis.mget(
        this.pinRateKey(linkId, clientHash),
        this.pinLinkRateKey(linkId)
      );
      return {
        client: Math.max(0, Number(clientValue) || 0),
        link: Math.max(0, Number(linkValue) || 0),
      };
    } catch {
      const [client, link] = await Promise.all([
        this.fallbackFailureCount(linkId, clientHash),
        this.fallbackFailureCount(linkId),
      ]);
      return { client, link };
    }
  }

  private async recordPinFailure(linkId: string, clientHash: string) {
    const clientKey = this.pinRateKey(linkId, clientHash);
    const linkKey = this.pinLinkRateKey(linkId);
    let counts: { client: number; link: number };
    try {
      // Keep increment + first-expiry atomic without relying on Redis 7's
      // EXPIRE NX option. This avoids a permanent lock if production runs an
      // older Redis version.
      const result = await this.redis.eval(
        `
          local clientCount = redis.call('INCR', KEYS[1])
          if clientCount == 1 then
            redis.call('EXPIRE', KEYS[1], ARGV[1])
          end
          local linkCount = redis.call('INCR', KEYS[2])
          if linkCount == 1 then
            redis.call('EXPIRE', KEYS[2], ARGV[1])
          end
          return { clientCount, linkCount }
        `,
        2,
        clientKey,
        linkKey,
        PIN_WINDOW_SECONDS
      );
      const values = Array.isArray(result) ? result : [];
      counts = {
        client: Number(values[0] || 1),
        link: Number(values[1] || 1),
      };
    } catch {
      const [client, link] = await Promise.all([
        this.fallbackFailureCount(linkId, clientHash),
        this.fallbackFailureCount(linkId),
      ]);
      counts = { client: client + 1, link: link + 1 };
    }
    await prisma.managementProfitReportAccessAttempt.create({
      data: { linkId, clientHash, outcome: 'FAILURE' },
    });
    return counts;
  }

  private async clearPinFailures(linkId: string, clientHash: string) {
    try {
      await this.redis.del(
        this.pinRateKey(linkId, clientHash),
        this.pinLinkRateKey(linkId)
      );
    } catch {
      // PostgreSQL audit remains available when Redis is temporarily unavailable.
    }
  }

  async listLinks() {
    const links = await prisma.managementProfitReportLink.findMany({
      include: { layout: { select: { revision: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return links.map((link) => this.linkDto(link));
  }

  async createLink(input: any, actor: Actor) {
    const name = this.normalizedName(input?.name);
    const pin = this.normalizedPin(input?.pin);
    const expiresAt = this.normalizedExpiry(input?.expiresAt, false);
    // Do not generate/share a one-time secret until the production report
    // account and exact TVF output contract have passed a read-only TOP (0)
    // readiness check.
    await managementProfitReportMikroService.assertReady();
    const rawToken = this.makeRawToken();
    const pinHash = await this.hashPin(pin);
    const layout = normalizeManagementProfitReportLayout(
      input?.layout || DEFAULT_MANAGEMENT_PROFIT_REPORT_LAYOUT
    );
    const canSaveLayout =
      input?.canSaveLayout === undefined ? true : input.canSaveLayout === true;

    const link = await prisma.managementProfitReportLink.create({
      data: {
        name,
        tokenHash: this.tokenHash(rawToken),
        tokenHint: rawToken.slice(0, 8),
        pinHash,
        canSaveLayout,
        expiresAt,
        createdById: actor.userId || null,
        createdByName: actor.name || null,
        updatedById: actor.userId || null,
        updatedByName: actor.name || null,
        layout: {
          create: {
            schemaVersion: layout.schemaVersion,
            revision: 1,
            config: asJson(layout),
          },
        },
      },
      include: { layout: true },
    });
    return {
      link: this.linkDto(link),
      rawToken,
      publicPath: `/management-profit#${rawToken}`,
    };
  }

  async updateLink(id: string, input: LinkUpdateInput, actor: Actor) {
    const existing = await prisma.managementProfitReportLink.findUnique({
      where: { id },
      include: { layout: true },
    });
    if (!existing) {
      throw new AppError('Rapor bağlantısı bulunamadı.', 404, ErrorCode.NOT_FOUND);
    }

    const data: Record<string, unknown> = {
      updatedById: actor.userId || null,
      updatedByName: actor.name || null,
    };
    let invalidateSessions = false;
    if (input.name !== undefined) data.name = this.normalizedName(input.name);
    if (input.status !== undefined) {
      const status = String(input.status || '').trim().toUpperCase();
      if (!LINK_STATUSES.has(status)) {
        throw new AppError('Bağlantı durumu geçersiz.', 400, ErrorCode.VALIDATION_ERROR);
      }
      data.status = status;
      invalidateSessions = status !== existing.status;
    }
    if (input.pin !== undefined && input.pin !== null && input.pin !== '') {
      data.pinHash = await this.hashPin(this.normalizedPin(input.pin));
      invalidateSessions = true;
    }
    if (input.canSaveLayout !== undefined) {
      if (typeof input.canSaveLayout !== 'boolean') {
        throw new AppError(
          'Görünüm kaydetme seçeneği geçersiz.',
          400,
          ErrorCode.VALIDATION_ERROR
        );
      }
      data.canSaveLayout = input.canSaveLayout;
    }
    const expiresAt = this.normalizedExpiry(input.expiresAt);
    if (expiresAt !== undefined) {
      data.expiresAt = expiresAt;
      invalidateSessions = true;
    }
    if (invalidateSessions) data.sessionVersion = { increment: 1 };

    const link = await prisma.managementProfitReportLink.update({
      where: { id },
      data,
      include: { layout: true },
    });
    return this.linkDto(link);
  }

  async rotateLink(id: string, actor: Actor) {
    const rawToken = this.makeRawToken();
    const link = await prisma.managementProfitReportLink.update({
      where: { id },
      data: {
        tokenHash: this.tokenHash(rawToken),
        tokenHint: rawToken.slice(0, 8),
        sessionVersion: { increment: 1 },
        updatedById: actor.userId || null,
        updatedByName: actor.name || null,
      },
      include: { layout: true },
    });
    return {
      link: this.linkDto(link),
      rawToken,
      publicPath: `/management-profit#${rawToken}`,
    };
  }

  async authorize(rawTokenInput: unknown, pinInput: unknown, context: PublicContext) {
    const rawToken = String(rawTokenInput || '').trim();
    if (!TOKEN_PATTERN.test(rawToken)) {
      throw new AppError('Rapor bağlantısı bulunamadı.', 404, ErrorCode.NOT_FOUND);
    }
    const link = await prisma.managementProfitReportLink.findUnique({
      where: { tokenHash: this.tokenHash(rawToken) },
    });
    if (!link) {
      throw new AppError('Rapor bağlantısı bulunamadı.', 404, ErrorCode.NOT_FOUND);
    }
    this.assertLinkAvailable(link);

    const clientHash = this.clientHash(context);
    const currentFailures = await this.currentPinFailureCounts(
      link.id,
      clientHash
    );
    if (
      currentFailures.client >= PIN_MAX_FAILURES
      || currentFailures.link >= PIN_LINK_MAX_FAILURES
    ) {
      await prisma.managementProfitReportAccessAttempt.create({
        data: { linkId: link.id, clientHash, outcome: 'BLOCKED' },
      });
      throw this.accessError(
        'PIN_RATE_LIMIT',
        'Çok fazla hatalı PIN denemesi yapıldı. 15 dakika sonra tekrar deneyin.',
        429
      );
    }

    const pin = String(pinInput || '').trim();
    const valid = PIN_PATTERN.test(pin) && (await this.verifyPin(pin, link.pinHash));
    if (!valid) {
      const failureCounts = await this.recordPinFailure(link.id, clientHash);
      const rateLimited =
        failureCounts.client >= PIN_MAX_FAILURES
        || failureCounts.link >= PIN_LINK_MAX_FAILURES;
      throw this.accessError(
        rateLimited ? 'PIN_RATE_LIMIT' : 'PIN_INVALID',
        rateLimited
          ? 'Çok fazla hatalı PIN denemesi yapıldı. 15 dakika sonra tekrar deneyin.'
          : 'Girdiğiniz PIN hatalı.',
        rateLimited ? 429 : 401
      );
    }

    await this.clearPinFailures(link.id, clientHash);
    await prisma.managementProfitReportAccessAttempt.create({
      data: { linkId: link.id, clientHash, outcome: 'SUCCESS' },
    });
    return {
      sessionToken: this.signSession(link, context.userAgent),
      expiresInMs: ACCESS_TTL_MS,
    };
  }

  async getView(context: PublicContext) {
    const { link, period } = await this.requireSession(context);
    const layout = this.safeLayout(link.layout?.config);
    await prisma.managementProfitReportLink.update({
      where: { id: link.id },
      data: {
        viewCount: { increment: 1 },
        lastViewedAt: new Date(),
      },
    });
    return {
      link: {
        name: link.name,
        canSaveLayout: link.canSaveLayout,
      },
      period,
      layout,
      revision: link.layout?.revision || 0,
      fields: managementProfitReportFieldCatalog,
      fixedOptions: {
        currency: 'MAIN',
        includeDeliveryNotes: true,
      },
    };
  }

  async query(input: any, context: PublicContext) {
    const { period } = await this.requireSession(context);
    const layout = normalizeManagementProfitReportLayout(input?.layout);
    const path = normalizeManagementProfitReportPath(input?.path, layout);
    return managementProfitReportMikroService.query({
      period,
      layout,
      path,
    });
  }

  async saveLayout(input: any, context: PublicContext) {
    const { link } = await this.requireSession(context);
    if (!link.canSaveLayout) {
      throw this.accessError(
        'LAYOUT_READ_ONLY',
        'Bu bağlantı görünüm değişikliklerini kaydedemez.'
      );
    }
    const layout = normalizeManagementProfitReportLayout(input?.layout);
    const expectedRevision = Number(input?.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      throw new AppError(
        'Görünüm revizyonu geçersiz.',
        400,
        ErrorCode.VALIDATION_ERROR,
        { reportAccessCode: 'LAYOUT_REVISION_INVALID' }
      );
    }
    const updated = await prisma.managementProfitReportLayout.updateMany({
      where: { linkId: link.id, revision: expectedRevision },
      data: {
        config: asJson(layout),
        schemaVersion: layout.schemaVersion,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new AppError(
        'Görünüm başka bir oturumda değişti. Güncel görünümü yükleyip tekrar deneyin.',
        409,
        ErrorCode.BAD_REQUEST,
        { reportAccessCode: 'LAYOUT_REVISION_CONFLICT' }
      );
    }
    const saved = await prisma.managementProfitReportLayout.findUnique({
      where: { linkId: link.id },
    });
    return {
      layout: this.safeLayout(saved?.config),
      revision: saved?.revision || expectedRevision + 1,
    };
  }
}

export const managementProfitReportService = new ManagementProfitReportService();
export default managementProfitReportService;
