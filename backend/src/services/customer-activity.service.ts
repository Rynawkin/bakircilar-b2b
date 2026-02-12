import { CustomerActivityType, Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';

interface TrackCustomerActivityInput {
  type: CustomerActivityType | string;
  userId: string;
  customerId?: string | null;
  sessionId?: string | null;
  pagePath?: string | null;
  pageTitle?: string | null;
  referrer?: string | null;
  productId?: string | null;
  productCode?: string | null;
  cartItemId?: string | null;
  quantity?: number | null;
  durationSeconds?: number | null;
  clickCount?: number | null;
  meta?: Prisma.JsonValue;
  ip?: string | null;
  userAgent?: string | null;
}

type CustomerCacheEntry = {
  id: string | null;
  expiresAt: number;
};

const CUSTOMER_CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 180;

class CustomerActivityService {
  private customerCache = new Map<string, CustomerCacheEntry>();

  private normalizeType(type: TrackCustomerActivityInput['type']): CustomerActivityType {
    if (!type) {
      throw new Error('Activity type is required');
    }
    if (Object.values(CustomerActivityType).includes(type as CustomerActivityType)) {
      return type as CustomerActivityType;
    }
    throw new Error(`Invalid activity type: ${type}`);
  }

  async resolveCustomerId(userId: string): Promise<string | null> {
    if (!userId) return null;

    const cached = this.customerCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.id;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { parentCustomerId: true, role: true },
    });

    if (!user || user.role !== 'CUSTOMER') {
      this.customerCache.set(userId, { id: null, expiresAt: Date.now() + CUSTOMER_CACHE_TTL_MS });
      return null;
    }

    const resolvedId = user.parentCustomerId || userId;
    this.customerCache.set(userId, { id: resolvedId, expiresAt: Date.now() + CUSTOMER_CACHE_TTL_MS });
    return resolvedId;
  }

  async trackEvent(input: TrackCustomerActivityInput) {
    const type = this.normalizeType(input.type);
    const customerId = input.customerId ?? (await this.resolveCustomerId(input.userId));

    return prisma.customerActivityEvent.create({
      data: {
        type,
        userId: input.userId,
        customerId: customerId || undefined,
        sessionId: input.sessionId || undefined,
        pagePath: input.pagePath || undefined,
        pageTitle: input.pageTitle || undefined,
        referrer: input.referrer || undefined,
        productId: input.productId || undefined,
        productCode: input.productCode || undefined,
        cartItemId: input.cartItemId || undefined,
        quantity: input.quantity ?? undefined,
        durationSeconds: input.durationSeconds ?? undefined,
        clickCount: input.clickCount ?? undefined,
        meta: input.meta ?? undefined,
        ip: input.ip || undefined,
        userAgent: input.userAgent || undefined,
      },
    });
  }

  async cleanupOldEvents(retentionDays = DEFAULT_RETENTION_DAYS) {
    const normalizedDays =
      Number.isFinite(retentionDays) && retentionDays > 0 ? Math.floor(retentionDays) : DEFAULT_RETENTION_DAYS;
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - normalizedDays);

    const result = await prisma.customerActivityEvent.deleteMany({
      where: {
        createdAt: { lt: cutoff },
      },
    });

    return { deleted: result.count, cutoff };
  }
}

export default new CustomerActivityService();
