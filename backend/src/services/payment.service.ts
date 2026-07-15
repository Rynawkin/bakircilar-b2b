import crypto from 'crypto';
import { PaymentAmountType, PaymentStatus, Prisma, UserRole } from '@prisma/client';
import { config } from '../config';
import { prisma } from '../utils/prisma';
import auditLogService from './audit-log.service';
import nestpayPayByLinkService, {
  NestpayGatewayError,
  NestpayParsedResponse,
} from './nestpay-paybylink.service';
import notificationService from './notification.service';
import mikroReceiptService from './mikro-receipt.service';

type CreatePaymentInput = {
  requestedById: string;
  idempotencyKey: string;
  amountType: PaymentAmountType;
  customAmount?: number;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type PaymentAccess = {
  actorId: string;
  customerId: string;
  customerName: string;
  customerCode: string | null;
  email: string | null;
  phone: string | null;
  sectorCode: string | null;
};

export class PaymentServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
    public readonly code = 'PAYMENT_ERROR'
  ) {
    super(message);
    this.name = 'PaymentServiceError';
  }
}

// REVIEW_REQUIRED tutarlari bakiye rezervinde sinirli sure tutulur; suresi gecenler manuel
// mutabakata kalir (aksi halde belirsiz bir kayit musterinin odenebilir bakiyesini kalici kilitler).
const REVIEW_REQUIRED_RESERVE_HOURS = 72;

const roundMoney = (value: unknown) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const toCents = (value: unknown) => Math.round(roundMoney(value) * 100);
const fromCents = (value: number) => roundMoney(value / 100);
const asNumber = (value: unknown) => roundMoney(value);
const safeText = (value: unknown, max = 500) => String(value || '').trim().slice(0, max);

const paymentOrderId = () => {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `B2BPBL${stamp}${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
};

const addExpiry = (date: Date) => {
  const result = new Date(date);
  const amount = config.nestpay.expiryValue;
  const unit = config.nestpay.expiryUnit.toUpperCase();
  if (unit === 'W') result.setUTCDate(result.getUTCDate() + amount * 7);
  else if (unit === 'M') result.setUTCMonth(result.getUTCMonth() + amount);
  else result.setUTCDate(result.getUTCDate() + amount);
  return result;
};

const appendPaymentParams = (base: string, orderId: string, paymentId: string) => {
  const url = new URL(base);
  url.searchParams.set('orderId', orderId);
  url.searchParams.set('paymentId', paymentId);
  return url.toString();
};

const bankFields = (result?: NestpayParsedResponse) => ({
  bankResponse: safeText(result?.response, 100) || null,
  bankReturnCode: safeText(result?.returnCode, 100) || null,
  bankErrorCode: safeText(result?.errorCode, 100) || null,
  bankMessage: safeText(result?.message, 500) || null,
  bankTransactionStatus: safeText(result?.transactionStatus, 50) || null,
  bankTransactionId: safeText(result?.transactionId, 200) || null,
  bankAuthCode: safeText(result?.authCode, 100) || null,
  bankHostReference: safeText(result?.hostReference, 200) || null,
});

const publicAttempt = (attempt: any) => ({
  id: attempt.id,
  orderId: attempt.orderId,
  customerId: attempt.customerId,
  customerCode: attempt.customerCodeSnapshot,
  customerName: attempt.customerNameSnapshot,
  amountType: attempt.amountType,
  amount: asNumber(attempt.amount),
  currency: attempt.currency,
  status: attempt.status,
  provider: attempt.provider,
  bankName: attempt.bankName,
  paymentLinkUrl: attempt.status === PaymentStatus.PENDING
    && attempt.paymentLinkUrl
    && (!attempt.linkExpiresAt || new Date(attempt.linkExpiresAt) > new Date())
    ? attempt.paymentLinkUrl
    : null,
  linkExpiresAt: attempt.linkExpiresAt,
  lastVerifiedAt: attempt.lastVerifiedAt,
  succeededAt: attempt.succeededAt,
  failedAt: attempt.failedAt,
  reconciledAt: attempt.reconciledAt,
  reconciliationNote: attempt.reconciliationNote,
  bankMessage: attempt.bankMessage,
  bankReturnCode: attempt.bankReturnCode,
  bankTransactionStatus: attempt.bankTransactionStatus,
  createdAt: attempt.createdAt,
  updatedAt: attempt.updatedAt,
});

class PaymentService {
  private async resolveAccess(actorId: string): Promise<PaymentAccess> {
    const actor = await prisma.user.findUnique({
      where: { id: actorId },
      select: {
        id: true,
        role: true,
        email: true,
        phone: true,
        name: true,
        displayName: true,
        mikroName: true,
        mikroCariCode: true,
        sectorCode: true,
        parentCustomer: {
          select: {
            id: true,
            email: true,
            phone: true,
            name: true,
            displayName: true,
            mikroName: true,
            mikroCariCode: true,
            sectorCode: true,
          },
        },
      },
    });
    if (!actor || actor.role !== UserRole.CUSTOMER) {
      throw new PaymentServiceError('Musteri hesabi bulunamadi.', 404, 'CUSTOMER_NOT_FOUND');
    }
    const customer = actor.parentCustomer || actor;
    return {
      actorId: actor.id,
      customerId: customer.id,
      customerName: customer.displayName || customer.mikroName || customer.name,
      customerCode: customer.mikroCariCode || null,
      email: actor.email || customer.email || null,
      phone: actor.phone || customer.phone || null,
      sectorCode: customer.sectorCode || null,
    };
  }

  private async expireStaleAttempts(customerId?: string) {
    const now = new Date();
    const createdCutoff = new Date(now.getTime() - 10 * 60 * 1000);
    await prisma.$transaction([
      prisma.paymentAttempt.updateMany({
        where: {
          ...(customerId ? { customerId } : {}),
          status: PaymentStatus.PENDING,
          linkExpiresAt: { lt: now },
        },
        data: { status: PaymentStatus.EXPIRED, failedAt: now },
      }),
      prisma.paymentAttempt.updateMany({
        where: {
          ...(customerId ? { customerId } : {}),
          status: PaymentStatus.CREATED,
          createdAt: { lt: createdCutoff },
        },
        data: {
          status: PaymentStatus.FAILED,
          failedAt: now,
          bankMessage: 'Odeme baglantisi olusturma islemi tamamlanamadi.',
        },
      }),
    ]);
  }

  private async calculateSummary(customerId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
    const balance = await db.vadeBalance.findUnique({ where: { userId: customerId } });
    if (!balance) {
      throw new PaymentServiceError('Guncel cari bakiye kaydi bulunamadi.', 409, 'BALANCE_NOT_AVAILABLE');
    }
    const now = new Date();
    const createdCutoff = new Date(now.getTime() - 10 * 60 * 1000);
    const reviewCutoff = new Date(now.getTime() - REVIEW_REQUIRED_RESERVE_HOURS * 60 * 60 * 1000);
    const [active, successful] = await Promise.all([
      db.paymentAttempt.aggregate({
        where: {
          customerId,
          OR: [
            { status: PaymentStatus.CREATED, createdAt: { gte: createdCutoff } },
            { status: PaymentStatus.PENDING, linkExpiresAt: { gt: now } },
            { status: PaymentStatus.REVIEW_REQUIRED, createdAt: { gte: reviewCutoff } },
          ],
        },
        _sum: { amount: true },
      }),
      db.paymentAttempt.aggregate({
        where: { customerId, status: PaymentStatus.SUCCEEDED, reconciledAt: null },
        _sum: { amount: true },
      }),
    ]);
    const totalCents = Math.max(0, toCents(balance.totalBalance));
    const pastDueCents = Math.max(0, toCents(balance.pastDueBalance));
    const reservedCents = Math.max(0, toCents(active._sum.amount));
    const unreconciledCents = Math.max(0, toCents(successful._sum.amount));
    const deductionCents = reservedCents + unreconciledCents;
    return {
      balance,
      totalBalance: fromCents(totalCents),
      pastDueBalance: fromCents(pastDueCents),
      reservedAmount: fromCents(reservedCents),
      successfulUnreconciledAmount: fromCents(unreconciledCents),
      availableTotal: fromCents(Math.max(0, totalCents - deductionCents)),
      availablePastDue: fromCents(Math.max(0, pastDueCents - deductionCents)),
    };
  }

  async getCustomerSummary(actorId: string) {
    const access = await this.resolveAccess(actorId);
    await this.expireStaleAttempts(access.customerId);
    const summary = await this.calculateSummary(access.customerId);
    const balanceAgeHours = Math.max(0, (Date.now() - summary.balance.updatedAt.getTime()) / 3_600_000);
    const balanceFresh = balanceAgeHours <= config.nestpay.maxBalanceAgeHours;
    return {
      customer: {
        id: access.customerId,
        code: access.customerCode,
        name: access.customerName,
      },
      balance: {
        total: summary.totalBalance,
        pastDue: summary.pastDueBalance,
        notDue: asNumber(summary.balance.notDueBalance),
        updatedAt: summary.balance.updatedAt,
        referenceDate: summary.balance.referenceDate,
        source: summary.balance.source,
      },
      availability: {
        total: summary.availableTotal,
        pastDue: summary.availablePastDue,
        reserved: summary.reservedAmount,
        successfulUnreconciled: summary.successfulUnreconciledAmount,
      },
      gateway: {
        configured: config.nestpay.configured,
        enabled: config.nestpay.enabled,
        bankName: config.nestpay.bankName,
        method: 'PAY_BY_LINK',
        hosted: true,
      },
      eligibility: {
        canCreate: config.nestpay.enabled && balanceFresh && summary.availableTotal >= config.nestpay.minAmount,
        balanceFresh,
        balanceAgeHours: Math.round(balanceAgeHours * 10) / 10,
        maxBalanceAgeHours: config.nestpay.maxBalanceAgeHours,
        reason: !config.nestpay.enabled
          ? (config.nestpay.configured ? 'GATEWAY_DISABLED' : 'GATEWAY_NOT_CONFIGURED')
          : !balanceFresh
            ? 'BALANCE_STALE'
            : summary.availableTotal < config.nestpay.minAmount
              ? 'NO_PAYABLE_BALANCE'
              : null,
      },
      limits: {
        min: config.nestpay.minAmount,
        max: config.nestpay.maxAmount,
        currency: 'TRY',
      },
    };
  }

  async listCustomerAttempts(actorId: string, limit = 25) {
    const access = await this.resolveAccess(actorId);
    await this.expireStaleAttempts(access.customerId);
    const attempts = await prisma.paymentAttempt.findMany({
      where: { customerId: access.customerId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
    });
    return attempts.map(publicAttempt);
  }

  private chooseAmount(summary: Awaited<ReturnType<PaymentService['calculateSummary']>>, input: CreatePaymentInput) {
    const balanceAgeHours = Math.max(0, (Date.now() - summary.balance.updatedAt.getTime()) / 3_600_000);
    if (balanceAgeHours > config.nestpay.maxBalanceAgeHours) {
      throw new PaymentServiceError('Cari bakiye verisi guncel degil. Yeni vade/bakiye raporu yuklendikten sonra tekrar deneyin.', 409, 'BALANCE_STALE');
    }
    let amount = 0;
    if (input.amountType === PaymentAmountType.TOTAL_BALANCE) amount = summary.availableTotal;
    else if (input.amountType === PaymentAmountType.PAST_DUE) amount = summary.availablePastDue;
    else amount = roundMoney(input.customAmount);

    if (amount < config.nestpay.minAmount) {
      throw new PaymentServiceError('Odenebilir bakiye veya girilen tutar banka alt limitinin altinda.', 409, 'AMOUNT_TOO_LOW');
    }
    if (amount > summary.availableTotal) {
      throw new PaymentServiceError('Girilen tutar odenebilir toplam bakiyeyi asamaz.', 409, 'AMOUNT_EXCEEDS_BALANCE');
    }
    if (amount > config.nestpay.maxAmount) {
      throw new PaymentServiceError(`Tek islem tutari en fazla ${config.nestpay.maxAmount.toLocaleString('tr-TR')} TL olabilir.`, 409, 'AMOUNT_TOO_HIGH');
    }
    return amount;
  }

  async createPayByLink(input: CreatePaymentInput) {
    if (!config.nestpay.enabled) {
      throw new PaymentServiceError(
        config.nestpay.configured ? 'Online odeme gecici olarak devre disi.' : 'Online odeme banka ayarlari tamamlanmadi.',
        503,
        'GATEWAY_DISABLED'
      );
    }

    const access = await this.resolveAccess(input.requestedById);
    await this.expireStaleAttempts(access.customerId);
    const existing = await prisma.paymentAttempt.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      if (existing.requestedById !== input.requestedById) {
        throw new PaymentServiceError('Gecersiz istek anahtari.', 409, 'IDEMPOTENCY_CONFLICT');
      }
      return publicAttempt(existing);
    }

    let attempt: any;
    for (let tryNo = 0; tryNo < 3; tryNo += 1) {
      try {
        attempt = await prisma.$transaction(async (tx) => {
          const duplicate = await tx.paymentAttempt.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
          if (duplicate) return duplicate;
          const summary = await this.calculateSummary(access.customerId, tx);
          const amount = this.chooseAmount(summary, input);
          const created = await tx.paymentAttempt.create({
            data: {
              orderId: paymentOrderId(),
              idempotencyKey: input.idempotencyKey,
              customerId: access.customerId,
              requestedById: access.actorId,
              customerCodeSnapshot: access.customerCode,
              customerNameSnapshot: access.customerName,
              amountType: input.amountType,
              amount: new Prisma.Decimal(amount),
              bankName: config.nestpay.bankName,
              totalBalanceSnapshot: new Prisma.Decimal(summary.totalBalance),
              pastDueBalanceSnapshot: new Prisma.Decimal(summary.pastDueBalance),
              balanceUpdatedAt: summary.balance.updatedAt,
              metadata: {
                ipAddress: input.ipAddress || null,
                userAgent: safeText(input.userAgent, 300) || null,
              },
              events: {
                create: {
                  type: 'PAYMENT_ATTEMPT_CREATED',
                  source: 'CUSTOMER',
                  status: PaymentStatus.CREATED,
                  payload: { amountType: input.amountType, amount },
                },
              },
            },
          });
          return created;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        break;
      } catch (error: any) {
        if (error?.code === 'P2034' && tryNo < 2) continue;
        if (error?.code === 'P2002') {
          const duplicate = await prisma.paymentAttempt.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
          if (duplicate?.requestedById === input.requestedById) return publicAttempt(duplicate);
        }
        throw error;
      }
    }
    if (!attempt) throw new PaymentServiceError('Odeme istegi olusturulamadi.', 500, 'PAYMENT_CREATE_FAILED');

    try {
      const result = await nestpayPayByLinkService.createPaymentLink({
        orderId: attempt.orderId,
        amount: asNumber(attempt.amount),
        customerName: access.customerName,
        customerCode: access.customerCode,
        email: access.email,
        phone: access.phone,
        description: `${access.customerCode || 'Cari'} cari bakiye odemesi`,
        okUrl: appendPaymentParams(config.nestpay.okUrl, attempt.orderId, attempt.id),
        failUrl: appendPaymentParams(config.nestpay.failUrl, attempt.orderId, attempt.id),
        callbackUrl: appendPaymentParams(config.nestpay.callbackUrl, attempt.orderId, attempt.id),
      });
      const updated = await prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: PaymentStatus.PENDING,
          paymentLinkUrl: result.paymentUrl,
          linkExpiresAt: addExpiry(new Date()),
          ...bankFields(result),
          events: {
            create: {
              type: 'PAYMENT_LINK_CREATED',
              source: 'NESTPAY',
              status: PaymentStatus.PENDING,
              payload: {
                response: result.response || null,
                returnCode: result.returnCode || null,
              },
            },
          },
        },
      });
      await auditLogService.log({
        actorId: input.requestedById,
        actorRole: UserRole.CUSTOMER,
        action: 'PAYMENT_LINK_CREATE',
        entityType: 'PaymentAttempt',
        entityId: updated.id,
        entityCode: updated.orderId,
        summary: `${access.customerCode || access.customerName} icin PayByLink olusturuldu`,
        ipAddress: input.ipAddress || null,
        userAgent: input.userAgent || null,
        after: { amount: asNumber(updated.amount), amountType: updated.amountType, status: updated.status },
      });
      return publicAttempt(updated);
    } catch (error: any) {
      const gatewayError = error instanceof NestpayGatewayError ? error : null;
      const failed = await prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: PaymentStatus.FAILED,
          failedAt: new Date(),
          ...(gatewayError?.response ? bankFields(gatewayError.response) : {}),
          bankMessage: safeText(gatewayError?.message || error?.message || 'Banka baglantisi olusturulamadi.', 500),
          events: {
            create: {
              type: 'PAYMENT_LINK_FAILED',
              source: 'NESTPAY',
              status: PaymentStatus.FAILED,
              payload: { code: gatewayError?.code || 'UNKNOWN_GATEWAY_ERROR' },
            },
          },
        },
      });
      await auditLogService.log({
        actorId: input.requestedById,
        actorRole: UserRole.CUSTOMER,
        action: 'PAYMENT_LINK_FAILED',
        entityType: 'PaymentAttempt',
        entityId: failed.id,
        entityCode: failed.orderId,
        summary: 'PayByLink olusturulamadi',
        metadata: { code: gatewayError?.code || 'UNKNOWN_GATEWAY_ERROR' },
      });
      throw gatewayError || error;
    }
  }

  private async notifySuccess(attempt: any, sectorCode?: string | null) {
    const staff = await prisma.user.findMany({
      where: {
        active: true,
        OR: [
          { role: { in: [UserRole.HEAD_ADMIN, UserRole.ADMIN, UserRole.MANAGER] } },
          ...(sectorCode ? [{ role: UserRole.SALES_REP, assignedSectorCodes: { has: sectorCode } }] : []),
        ],
      },
      select: { id: true, role: true },
    });
    const body = `${attempt.customerNameSnapshot} - ${asNumber(attempt.amount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`;
    await notificationService.createForUsers([attempt.customerId, attempt.requestedById], {
      category: 'PAYMENT',
      title: 'Online odeme basarili',
      body,
      linkUrl: '/payments',
    });
    const managers = staff.filter((row) => row.role !== UserRole.SALES_REP).map((row) => row.id);
    const salesReps = staff.filter((row) => row.role === UserRole.SALES_REP).map((row) => row.id);
    await notificationService.createForUsers(managers, {
      category: 'PAYMENT',
      title: 'Online tahsilat basarili',
      body,
      linkUrl: '/payment-operations',
    });
    await notificationService.createForUsers(salesReps, {
      category: 'PAYMENT',
      title: 'Portfoyunuzdan online tahsilat',
      body,
      linkUrl: '/customer-360',
    });
  }

  private async verifyAttempt(attempt: any, source: string) {
    if (attempt.status === PaymentStatus.SUCCEEDED || attempt.status === PaymentStatus.CANCELLED) {
      return publicAttempt(attempt);
    }
    if (attempt.status === PaymentStatus.PENDING && attempt.linkExpiresAt && attempt.linkExpiresAt < new Date()) {
      // Kosullu yazim: es zamanli bir verify bu arada SUCCEEDED yazdiysa EXPIRED ile ezilmez.
      const expiredClaim = await prisma.paymentAttempt.updateMany({
        where: { id: attempt.id, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.EXPIRED, failedAt: new Date() },
      });
      if (expiredClaim.count === 1) {
        await prisma.paymentEvent.create({
          data: { paymentAttemptId: attempt.id, type: 'PAYMENT_LINK_EXPIRED', source, status: PaymentStatus.EXPIRED },
        });
      }
      const fresh = await prisma.paymentAttempt.findUnique({ where: { id: attempt.id } });
      return publicAttempt(fresh || attempt);
    }

    // PayByLink odemesi banka-uretilen ORDER-... numarasi ile kayitli; varsa onunla sorgula
    // (bizim orderId ile sorgu "kayit bulunamadi" doner). providerOrderId yoksa (callback henuz
    // gelmedi) bizim orderId ile denenir; sonuc "kayit yok" olsa PENDING korunur.
    const queryOrderId = attempt.providerOrderId || attempt.orderId;
    const result = await nestpayPayByLinkService.queryOrderStatus(queryOrderId);
    let nextStatus: PaymentStatus = attempt.status;
    let preserveStatus = false;
    if (result.state === 'SUCCEEDED') nextStatus = PaymentStatus.SUCCEEDED;
    else if (result.state === 'PENDING') nextStatus = PaymentStatus.PENDING;
    else if (result.state === 'FAILED' && result.transactionStatus) nextStatus = PaymentStatus.FAILED;
    else if (
      attempt.status === PaymentStatus.PENDING
      || attempt.status === PaymentStatus.EXPIRED
      || attempt.status === PaymentStatus.FAILED
    ) {
      // Henuz odenmemis PayByLink icin banka ORDERSTATUS'a "kayit yok/Error + bos TRANS_STAT"
      // doner (canli dogrulama 2026-07-15). Bu yanit PENDING/EXPIRED/FAILED kayitlar icin
      // beklenen durumdur; incelemeye yukseltmek linki gizler ve tutari rezerve kilitler.
      // Mevcut durum korunur, banka alanlari ezilmez.
      nextStatus = attempt.status;
      preserveStatus = true;
    } else if (result.state === 'FAILED' || result.state === 'UNKNOWN') {
      nextStatus = PaymentStatus.REVIEW_REQUIRED;
    }

    const now = new Date();
    const wantsSuccess = attempt.status !== PaymentStatus.SUCCEEDED && nextStatus === PaymentStatus.SUCCEEDED;
    const updateData = {
      status: nextStatus,
      lastVerifiedAt: now,
      ...(nextStatus === PaymentStatus.SUCCEEDED ? { succeededAt: attempt.succeededAt || now, failedAt: null } : {}),
      ...(nextStatus === PaymentStatus.FAILED && !preserveStatus ? { failedAt: attempt.failedAt || now } : {}),
      ...(preserveStatus ? {} : bankFields(result)),
    };
    // Tum gecisler kosullu yazilir: es zamanli verify/expire yarislarinda SUCCEEDED/CANCELLED
    // geri alinamaz, korunan durum baska bir gecisi ezemez; basari gecisi tek dogrulayiciya
    // verilir (cift bildirim/audit uretilmez). Event ayni transaction icinde kaydedilir.
    const writeGuard = wantsSuccess
      ? { id: attempt.id, status: { not: PaymentStatus.SUCCEEDED } }
      : preserveStatus
        ? { id: attempt.id, status: attempt.status }
        : { id: attempt.id, status: { notIn: [PaymentStatus.SUCCEEDED, PaymentStatus.CANCELLED] } };
    const [claimed] = await prisma.$transaction([
      prisma.paymentAttempt.updateMany({ where: writeGuard, data: updateData }),
      prisma.paymentEvent.create({
        data: {
          paymentAttemptId: attempt.id,
          type: 'PAYMENT_STATUS_VERIFIED',
          source,
          status: nextStatus,
          payload: {
            response: result.response || null,
            returnCode: result.returnCode || null,
            transactionStatus: result.transactionStatus || null,
            state: result.state,
          },
        },
      }),
    ]);
    const becameSuccessful = wantsSuccess && claimed.count === 1;
    const updated = await prisma.paymentAttempt.findUnique({
      where: { id: attempt.id },
      include: { customer: { select: { sectorCode: true } } },
    });
    if (!updated) return publicAttempt(attempt);
    if (becameSuccessful) {
      await auditLogService.log({
        action: 'PAYMENT_SUCCEEDED',
        entityType: 'PaymentAttempt',
        entityId: updated.id,
        entityCode: updated.orderId,
        summary: `${updated.customerNameSnapshot} online odemesi banka tarafindan dogrulandi`,
        after: { amount: asNumber(updated.amount), status: updated.status },
        metadata: { source },
      });
      await this.notifySuccess(updated, updated.customer?.sectorCode).catch((error) => {
        console.error('Payment success notification failed', { paymentId: updated.id, error });
      });
    }
    return publicAttempt(updated);
  }

  async verifyCustomerAttempt(actorId: string, paymentId: string) {
    const access = await this.resolveAccess(actorId);
    const attempt = await prisma.paymentAttempt.findFirst({ where: { id: paymentId, customerId: access.customerId } });
    if (!attempt) throw new PaymentServiceError('Odeme kaydi bulunamadi.', 404, 'PAYMENT_NOT_FOUND');
    return this.verifyAttempt(attempt, 'CUSTOMER_STATUS_CHECK');
  }

  async verifyAdminAttempt(paymentId: string) {
    const attempt = await prisma.paymentAttempt.findUnique({ where: { id: paymentId } });
    if (!attempt) throw new PaymentServiceError('Odeme kaydi bulunamadi.', 404, 'PAYMENT_NOT_FOUND');
    return this.verifyAttempt(attempt, 'ADMIN_STATUS_CHECK');
  }

  async verifyByOrderId(orderId: string, source: string) {
    const attempt = await prisma.paymentAttempt.findUnique({ where: { orderId } });
    if (!attempt) return null;
    return this.verifyAttempt(attempt, source);
  }

  async recordInboundEvent(orderId: string, source: string, payload: Record<string, unknown>) {
    const attempt = await prisma.paymentAttempt.findUnique({ where: { orderId } });
    if (!attempt) return null;
    // PayByLink kendi ORDER-... numarasini uretir ve callback govdesinde gonderir; ilk kez
    // yakalayip kaydet. Durum sorgulari bundan sonra bu numara ile yapilir.
    const bankOrderId = safeText(payload.bankOrderId, 100);
    if (bankOrderId && bankOrderId !== orderId && !attempt.providerOrderId) {
      await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { providerOrderId: bankOrderId } });
      (attempt as any).providerOrderId = bankOrderId;
    }
    await prisma.paymentEvent.create({
      data: {
        paymentAttemptId: attempt.id,
        type: 'BANK_CALLBACK_RECEIVED',
        source,
        status: attempt.status,
        payload: {
          response: safeText(payload.response, 100) || null,
          returnCode: safeText(payload.returnCode, 100) || null,
          transactionStatus: safeText(payload.transactionStatus, 50) || null,
          bankOrderId: safeText(payload.bankOrderId, 100) || null,
        },
      },
    });
    return attempt;
  }

  async listAdmin(query: { status?: string; reconciled?: string; search?: string; page?: number; pageSize?: number }) {
    await this.expireStaleAttempts();
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(10, Number(query.pageSize || 25)));
    const where: Prisma.PaymentAttemptWhereInput = {};
    if (query.status && Object.values(PaymentStatus).includes(query.status as PaymentStatus)) {
      where.status = query.status as PaymentStatus;
    }
    if (query.reconciled === 'true') where.reconciledAt = { not: null };
    if (query.reconciled === 'false') where.reconciledAt = null;
    const search = safeText(query.search, 100);
    if (search) {
      where.OR = [
        { customerNameSnapshot: { contains: search, mode: 'insensitive' } },
        { customerCodeSnapshot: { contains: search, mode: 'insensitive' } },
        { orderId: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await prisma.$transaction([
      prisma.paymentAttempt.findMany({
        where,
        include: {
          requestedBy: { select: { displayName: true, name: true, email: true } },
          reconciledBy: { select: { displayName: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.paymentAttempt.count({ where }),
    ]);
    const totals = await prisma.paymentAttempt.groupBy({
      by: ['status'],
      _count: { _all: true },
      _sum: { amount: true },
    });
    return {
      items: items.map((item) => ({
        ...publicAttempt(item),
        requestedByName: item.requestedBy.displayName || item.requestedBy.name || item.requestedBy.email,
        reconciledByName: item.reconciledBy
          ? item.reconciledBy.displayName || item.reconciledBy.name || item.reconciledBy.email
          : null,
      })),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      totals: totals.map((row) => ({ status: row.status, count: row._count._all, amount: asNumber(row._sum.amount) })),
      gateway: {
        configured: config.nestpay.configured,
        enabled: config.nestpay.enabled,
        bankName: config.nestpay.bankName,
        method: 'PAY_BY_LINK',
      },
    };
  }

  async reconcile(paymentId: string, actorId: string, note?: string | null) {
    const attempt = await prisma.paymentAttempt.findUnique({ where: { id: paymentId } });
    if (!attempt) throw new PaymentServiceError('Odeme kaydi bulunamadi.', 404, 'PAYMENT_NOT_FOUND');
    if (attempt.status !== PaymentStatus.SUCCEEDED) {
      throw new PaymentServiceError('Yalniz banka tarafindan basarili dogrulanmis odeme mutabik edilebilir.', 409, 'PAYMENT_NOT_SUCCEEDED');
    }
    if (attempt.reconciledAt) {
      // Zaten mutabik; ama makbuz onceki denemede yazilamamis olabilir (Mikro down vb.).
      // writeMikroReceipt idempotent oldugu icin eksik makbuzu guvenle tamamla.
      await this.writeMikroReceipt(attempt, actorId).catch((error) =>
        console.error('Mikro receipt backfill failed', { paymentId, orderId: attempt.orderId, error: error?.message }));
      return publicAttempt(await prisma.paymentAttempt.findUnique({ where: { id: paymentId } }) || attempt);
    }
    const now = new Date();
    const updated = await prisma.paymentAttempt.update({
      where: { id: paymentId },
      data: {
        reconciledAt: now,
        reconciledById: actorId,
        reconciliationNote: safeText(note, 500) || null,
        events: {
          create: {
            type: 'PAYMENT_RECONCILED',
            source: 'ADMIN',
            status: PaymentStatus.SUCCEEDED,
            payload: { note: safeText(note, 500) || null },
          },
        },
      },
    });
    await auditLogService.log({
      actorId,
      action: 'PAYMENT_RECONCILE',
      entityType: 'PaymentAttempt',
      entityId: updated.id,
      entityCode: updated.orderId,
      summary: `${updated.customerNameSnapshot} odemesi muhasebe ile mutabik edildi`,
      before: { reconciledAt: null },
      after: { reconciledAt: now, note: updated.reconciliationNote },
    });
    await notificationService.createForUsers([updated.customerId, updated.requestedById], {
      category: 'PAYMENT',
      title: 'Odemeniz hesabiniza islendi',
      body: `${asNumber(updated.amount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL tutarindaki odeme mutabik edildi.`,
      linkUrl: '/payments',
    }).catch((error) => console.error('Payment reconciliation notification failed', { paymentId, error }));
    // Mutabakat sonrasi Mikro tahsilat makbuzu. enabled=false ise no-op; hata mutabakati BOZMAZ
    // (makbuz idempotent - orderId ile isaretli - sonradan tekrar denenebilir).
    await this.writeMikroReceipt(updated, actorId).catch((error) =>
      console.error('Mikro receipt write failed', { paymentId, orderId: updated.orderId, error: error?.message }));
    return publicAttempt(updated);
  }

  private async writeMikroReceipt(attempt: any, actorId: string) {
    if (!mikroReceiptService.isEnabled()) return;
    // Uygulama tarafi idempotency: bu deneme icin makbuz zaten yazildiysa tekrar deneme.
    const priorReceipt = await prisma.paymentEvent.findFirst({
      where: { paymentAttemptId: attempt.id, type: { in: ['MIKRO_RECEIPT_WRITTEN', 'MIKRO_RECEIPT_EXISTS'] } },
      select: { id: true },
    });
    if (priorReceipt) return;
    if (!attempt.customerCodeSnapshot) {
      await prisma.paymentEvent.create({
        data: {
          paymentAttemptId: attempt.id,
          type: 'MIKRO_RECEIPT_SKIPPED',
          source: 'MIKRO',
          status: attempt.status,
          payload: { reason: 'CUSTOMER_CODE_MISSING' },
        },
      });
      return;
    }
    try {
      const result = await mikroReceiptService.writeCollectionReceipt({
        orderId: attempt.orderId,
        customerCode: attempt.customerCodeSnapshot,
        amount: asNumber(attempt.amount),
        description: `B2B online odeme ${attempt.orderId}`,
      });
      if (!result) return;
      await prisma.paymentEvent.create({
        data: {
          paymentAttemptId: attempt.id,
          type: result.alreadyExists ? 'MIKRO_RECEIPT_EXISTS' : 'MIKRO_RECEIPT_WRITTEN',
          source: 'MIKRO',
          status: attempt.status,
          payload: { documentNo: result.documentNo, alreadyExists: result.alreadyExists },
        },
      });
      await auditLogService.log({
        actorId,
        action: 'MIKRO_RECEIPT_WRITE',
        entityType: 'PaymentAttempt',
        entityId: attempt.id,
        entityCode: attempt.orderId,
        summary: `${attempt.customerNameSnapshot} icin Mikro tahsilat makbuzu: ${result.documentNo}`,
        after: { documentNo: result.documentNo, alreadyExists: result.alreadyExists },
      });
    } catch (error: any) {
      await prisma.paymentEvent.create({
        data: {
          paymentAttemptId: attempt.id,
          type: 'MIKRO_RECEIPT_FAILED',
          source: 'MIKRO',
          status: attempt.status,
          payload: { code: error?.code || 'UNKNOWN', message: safeText(error?.message, 300) },
        },
      }).catch(() => undefined);
      throw error;
    }
  }
}

export default new PaymentService();
