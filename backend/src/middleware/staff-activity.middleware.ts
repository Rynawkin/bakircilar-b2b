import { NextFunction, Request, Response } from 'express';
import customerActivityService from '../services/customer-activity.service';

const STAFF_ROLES = new Set(['HEAD_ADMIN', 'ADMIN', 'MANAGER', 'SALES_REP', 'DEPOCU', 'DIVERSEY']);
const IGNORED_PATHS = [
  '/api/admin/reports/staff-activity',
  '/api/admin/reports/customer-activity',
  '/api/admin/notifications',
];

const shouldIgnorePath = (path: string) => {
  return IGNORED_PATHS.some((prefix) => path.startsWith(prefix));
};

export const trackStaffApiActivity = (req: Request, res: Response, next: NextFunction): void => {
  const user = req.user;
  if (!user || !STAFF_ROLES.has(user.role)) {
    next();
    return;
  }

  const startedAt = Date.now();
  const originalUrl = req.originalUrl || req.path || '';
  if (shouldIgnorePath(originalUrl)) {
    next();
    return;
  }

  res.on('finish', () => {
    const durationMs = Math.max(0, Date.now() - startedAt);
    const bodyKeys =
      req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? Object.keys(req.body)
        : [];

    customerActivityService
      .trackEvent({
        type: 'CLICK',
        userId: user.userId,
        sessionId: typeof req.headers['x-session-id'] === 'string' ? req.headers['x-session-id'] : null,
        pagePath: req.path || null,
        pageTitle: `${req.method} ${req.path}`,
        referrer: typeof req.headers.referer === 'string' ? req.headers.referer : null,
        clickCount: 1,
        durationSeconds: Math.round(durationMs / 1000),
        ip: req.ip || null,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
        meta: {
          source: 'STAFF_API',
          method: req.method,
          route: req.path,
          originalUrl,
          statusCode: res.statusCode,
          durationMs,
          role: user.role,
          query: req.query,
          bodyKeys,
        },
      })
      .catch((error) => {
        console.error('Staff activity log failed:', error);
      });
  });

  next();
};
