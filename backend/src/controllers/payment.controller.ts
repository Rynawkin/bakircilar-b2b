import { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import paymentService, { PaymentServiceError } from '../services/payment.service';
import { NestpayGatewayError, parseNestpayResponse } from '../services/nestpay-paybylink.service';

const bodyValue = (body: unknown, names: string[]) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return '';
  const entries = Object.entries(body as Record<string, unknown>);
  for (const name of names) {
    const found = entries.find(([key]) => key.toLowerCase() === name.toLowerCase());
    if (found && found[1] !== undefined && found[1] !== null) return String(found[1]);
  }
  return '';
};

const extractInbound = (req: Request) => {
  const xml = typeof req.body === 'string' ? req.body : '';
  const parsed = xml ? parseNestpayResponse(xml) : null;
  const queryOrderId = String(req.query.orderId || req.query.oid || '').trim();
  const orderId = queryOrderId
    || bodyValue(req.body, ['orderId', 'OrderId', 'oid', 'Ecom_ConsumerOrderID'])
    || parsed?.orderId
    || '';
  return {
    orderId: orderId.slice(0, 100),
    paymentId: String(req.query.paymentId || bodyValue(req.body, ['paymentId'])).slice(0, 100),
    payload: {
      response: parsed?.response || bodyValue(req.body, ['Response', 'response']),
      returnCode: parsed?.returnCode || bodyValue(req.body, ['ProcReturnCode', 'Ecom_Transaction_ReturnCode']),
      transactionStatus: parsed?.transactionStatus || bodyValue(req.body, ['TRANS_STAT', 'TransactionStatus']),
    },
  };
};

const resultName = (status?: string | null) => {
  if (status === 'SUCCEEDED') return 'success';
  if (status === 'FAILED' || status === 'EXPIRED' || status === 'CANCELLED') return 'failure';
  if (status === 'REVIEW_REQUIRED') return 'review';
  return 'pending';
};

const customerRedirect = (result: string, paymentId?: string | null) => {
  const url = new URL('/payments', config.frontendUrl);
  url.searchParams.set('result', result);
  if (paymentId) url.searchParams.set('paymentId', paymentId);
  return url.toString();
};

const sendError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof PaymentServiceError) {
    return res.status(error.statusCode).json({ error: error.message, errorCode: error.code });
  }
  if (error instanceof NestpayGatewayError) {
    return res.status(503).json({ error: error.message, errorCode: error.code });
  }
  next(error);
};

class PaymentController {
  async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await paymentService.getCustomerSummary(req.user!.userId));
    } catch (error) {
      sendError(error, res, next);
    }
  }

  async getHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 25)));
      res.json({ payments: await paymentService.listCustomerAttempts(req.user!.userId, limit) });
    } catch (error) {
      sendError(error, res, next);
    }
  }

  async createPayByLink(req: Request, res: Response, next: NextFunction) {
    try {
      const payment = await paymentService.createPayByLink({
        requestedById: req.user!.userId,
        idempotencyKey: req.body.idempotencyKey,
        amountType: req.body.amountType,
        customAmount: req.body.customAmount,
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] ? String(req.headers['user-agent']) : null,
      });
      if (payment.status === 'FAILED') {
        return res.status(409).json({
          error: payment.bankMessage || 'Onceki odeme baglantisi istegi basarisiz oldu.',
          errorCode: 'PAYMENT_PREVIOUS_ATTEMPT_FAILED',
          payment,
        });
      }
      res.status(201).json({ payment });
    } catch (error) {
      sendError(error, res, next);
    }
  }

  async getStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const payment = await paymentService.verifyCustomerAttempt(req.user!.userId, req.params.id);
      res.json({ payment });
    } catch (error) {
      sendError(error, res, next);
    }
  }

  async callback(req: Request, res: Response) {
    const inbound = extractInbound(req);
    if (!inbound.orderId) return res.status(202).json({ ok: true, verified: false });
    try {
      await paymentService.recordInboundEvent(inbound.orderId, 'NESTPAY_CALLBACK', inbound.payload);
      const payment = await paymentService.verifyByOrderId(inbound.orderId, 'NESTPAY_CALLBACK');
      return res.status(200).json({ ok: true, verified: Boolean(payment), status: payment?.status || null });
    } catch (error) {
      console.error('Nestpay callback verification failed', { orderId: inbound.orderId, error });
      return res.status(202).json({ ok: true, verified: false });
    }
  }

  async successResult(req: Request, res: Response) {
    return this.handleResult(req, res, 'NESTPAY_OK_REDIRECT');
  }

  async failureResult(req: Request, res: Response) {
    return this.handleResult(req, res, 'NESTPAY_FAIL_REDIRECT');
  }

  private async handleResult(req: Request, res: Response, source: string) {
    const inbound = extractInbound(req);
    let payment: any = null;
    if (inbound.orderId) {
      try {
        await paymentService.recordInboundEvent(inbound.orderId, source, inbound.payload);
        payment = await paymentService.verifyByOrderId(inbound.orderId, source);
      } catch (error) {
        console.error('Nestpay redirect verification failed', { orderId: inbound.orderId, source, error });
      }
    }
    return res.redirect(303, customerRedirect(resultName(payment?.status), payment?.id || inbound.paymentId || null));
  }

  async listAdmin(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await paymentService.listAdmin({
        status: req.query.status ? String(req.query.status) : undefined,
        reconciled: req.query.reconciled ? String(req.query.reconciled) : undefined,
        search: req.query.search ? String(req.query.search) : undefined,
        page: Number(req.query.page || 1),
        pageSize: Number(req.query.pageSize || 25),
      }));
    } catch (error) {
      sendError(error, res, next);
    }
  }

  async reconcile(req: Request, res: Response, next: NextFunction) {
    try {
      const payment = await paymentService.reconcile(req.params.id, req.user!.userId, req.body.note);
      res.json({ payment });
    } catch (error) {
      sendError(error, res, next);
    }
  }

  async verifyAdmin(req: Request, res: Response, next: NextFunction) {
    try {
      const payment = await paymentService.verifyAdminAttempt(req.params.id);
      res.json({ payment });
    } catch (error) {
      sendError(error, res, next);
    }
  }
}

export default new PaymentController();
