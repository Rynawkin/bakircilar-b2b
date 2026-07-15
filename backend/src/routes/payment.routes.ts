import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import paymentController from '../controllers/payment.controller';
import { authenticate, requireAdminOrManager, requireCustomer } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validation.middleware';

const router = Router();

// app 'trust proxy: true' calistigi icin req.ip istemcinin gonderdigi X-Forwarded-For'dan gelir ve
// sahtelenebilir. nginx X-Real-IP'yi kendi gordugu peer IP ile yazar; ancak bu basliga YALNIZ
// baglanti loopback'ten (yerel nginx) geldiginde guvenilir - 5000 portuna dogrudan gelen bir
// istemci basligi kendi uretebilir, o durumda soket IP'si esas alinir.
const clientIpKey = (req: express.Request) => {
  const socketIp = req.socket.remoteAddress || '';
  const viaLocalProxy = socketIp === '127.0.0.1' || socketIp === '::1' || socketIp === '::ffff:127.0.0.1';
  if (viaLocalProxy) return String(req.headers['x-real-ip'] || req.ip || 'unknown');
  return socketIp || 'unknown';
};
// Kimlikli rotalarda kullanici bazli limit: header/IP sahteciligiyle asilamaz.
const userKey = (req: express.Request) => req.user?.userId || clientIpKey(req);

const callbackLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many callback requests' },
  keyGenerator: clientIpKey,
  validate: { trustProxy: false, xForwardedForHeader: false },
});
const createLimiter = rateLimit({
  windowMs: 10 * 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Cok fazla odeme baglantisi istegi. Lutfen daha sonra tekrar deneyin.' },
  keyGenerator: userKey,
  validate: { trustProxy: false, xForwardedForHeader: false },
});
const statusLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Odeme durumu cok sik sorgulandi.' },
  keyGenerator: userKey,
  validate: { trustProxy: false, xForwardedForHeader: false },
});

// text/plain ve text/html de kapsanir: bazi gateway'ler XML callback'i bu tiplerle POST'lar;
// aksi halde govde hic okunmaz ve orderId yalniz query parametresine kalir.
const xmlBody = express.text({
  type: ['application/xml', 'text/xml', 'application/*+xml', 'text/plain', 'text/html'],
  limit: '256kb',
});

// Bank redirects/callbacks are public. They never trust inbound success data;
// each request only triggers a server-to-server Nestpay order-status query.
router.post('/nestpay/callback', callbackLimiter, xmlBody, paymentController.callback.bind(paymentController));
router.get('/nestpay/result/success', callbackLimiter, paymentController.successResult.bind(paymentController));
router.post('/nestpay/result/success', callbackLimiter, xmlBody, paymentController.successResult.bind(paymentController));
router.get('/nestpay/result/failure', callbackLimiter, paymentController.failureResult.bind(paymentController));
router.post('/nestpay/result/failure', callbackLimiter, xmlBody, paymentController.failureResult.bind(paymentController));

router.use(authenticate);

const createSchema = z.object({
  idempotencyKey: z.string().uuid(),
  amountType: z.enum(['TOTAL_BALANCE', 'PAST_DUE', 'CUSTOM']),
  customAmount: z.number().positive().max(10_000_000).optional(),
}).superRefine((value, ctx) => {
  if (value.amountType === 'CUSTOM' && value.customAmount === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['customAmount'], message: 'Ozel tutar gerekli' });
  }
});

const reconcileSchema = z.object({ note: z.string().trim().max(500).optional().nullable() });

router.get('/summary', requireCustomer, paymentController.getSummary.bind(paymentController));
router.get('/history', requireCustomer, paymentController.getHistory.bind(paymentController));
router.post('/nestpay/create', requireCustomer, createLimiter, validateBody(createSchema), paymentController.createPayByLink.bind(paymentController));
router.get('/:id/status', requireCustomer, statusLimiter, paymentController.getStatus.bind(paymentController));

router.get('/admin/list', requireAdminOrManager, paymentController.listAdmin.bind(paymentController));
router.post('/admin/:id/verify', requireAdminOrManager, statusLimiter, paymentController.verifyAdmin.bind(paymentController));
router.put('/admin/:id/reconcile', requireAdminOrManager, validateBody(reconcileSchema), paymentController.reconcile.bind(paymentController));

export default router;
