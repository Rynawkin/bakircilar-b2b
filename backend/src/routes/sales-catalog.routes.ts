import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import salesCatalogController from '../controllers/sales-catalog.controller';

const router = Router();
const publicCatalogReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
});
const publicCatalogEventLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
const publicCatalogPinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Token yeterince yuksek entropili ve yalniz yayinlanmis kataloglara erisir.
// Bu route authentication middleware'inden once mount edilir.
router.get('/public/:token', publicCatalogReadLimiter, salesCatalogController.getPublic);
router.post('/public/:token/access', publicCatalogPinLimiter, salesCatalogController.authorizePin);
router.post('/public/:token/events', publicCatalogEventLimiter, salesCatalogController.recordEvent);
router.post('/public/:token/pdf-download', publicCatalogEventLimiter, salesCatalogController.recordPdfDownload);

export default router;
