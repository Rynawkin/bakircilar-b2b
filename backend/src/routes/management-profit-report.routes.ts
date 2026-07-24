import { NextFunction, Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import managementProfitReportController from '../controllers/management-profit-report.controller';
import { authenticate } from '../middleware/auth.middleware';
import { prisma } from '../utils/prisma';
import { getTrustedClientIp } from '../utils/trusted-client-ip';

const router = Router();

const limiter = (windowMs: number, max: number) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getTrustedClientIp,
    validate: { trustProxy: false, xForwardedForHeader: false },
  });

const publicReadLimiter = limiter(60 * 1000, 60);
const publicQueryLimiter = limiter(60 * 1000, 45);
// Coarse process/IP guard. The authoritative per-link and pseudonymous-client
// counters live in Redis/PostgreSQL because a reverse proxy may collapse IPs.
const publicPinLimiter = limiter(15 * 60 * 1000, 60);
const publicWriteLimiter = limiter(15 * 60 * 1000, 20);

const requireHeadAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    // JWT role claims can outlive a role downgrade. Re-read the current role
    // for this sensitive link-management surface before authorizing a write.
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { role: true, active: true },
    });
    if (!currentUser?.active || currentUser.role !== 'HEAD_ADMIN') {
      res.status(403).json({ error: 'HEAD_ADMIN access required' });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
};

// Static public endpoints keep the raw share token out of URL/access logs.
router.post(
  '/public/access',
  publicPinLimiter,
  managementProfitReportController.authorize.bind(managementProfitReportController)
);
router.get(
  '/public/view',
  publicReadLimiter,
  managementProfitReportController.view.bind(managementProfitReportController)
);
router.post(
  '/public/query',
  publicQueryLimiter,
  managementProfitReportController.query.bind(managementProfitReportController)
);
router.put(
  '/public/layout',
  publicWriteLimiter,
  managementProfitReportController.saveLayout.bind(managementProfitReportController)
);
router.post(
  '/public/logout',
  publicWriteLimiter,
  managementProfitReportController.logout.bind(managementProfitReportController)
);

router.use('/admin', authenticate, requireHeadAdmin);
router.get(
  '/admin/links',
  managementProfitReportController.listLinks.bind(managementProfitReportController)
);
router.post(
  '/admin/links',
  managementProfitReportController.createLink.bind(managementProfitReportController)
);
router.patch(
  '/admin/links/:id',
  managementProfitReportController.updateLink.bind(managementProfitReportController)
);
router.post(
  '/admin/links/:id/rotate',
  managementProfitReportController.rotateLink.bind(managementProfitReportController)
);

export default router;
