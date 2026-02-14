import { Request, Response, NextFunction } from 'express';
import notificationService from '../services/notification.service';
import mobilePushService from '../services/mobile-push.service';

export class NotificationController {
  async getNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      const { unreadOnly, limit, offset } = req.query;
      const result = await notificationService.list(req.user!.userId, {
        unreadOnly: unreadOnly === 'true',
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async markRead(req: Request, res: Response, next: NextFunction) {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
      const updated = await notificationService.markRead(req.user!.userId, ids);
      res.json({ updated });
    } catch (error) {
      next(error);
    }
  }

  async markAllRead(req: Request, res: Response, next: NextFunction) {
    try {
      const updated = await notificationService.markAllRead(req.user!.userId);
      res.json({ updated });
    } catch (error) {
      next(error);
    }
  }

  async registerPushToken(req: Request, res: Response, next: NextFunction) {
    try {
      const token = String(req.body?.token || '').trim();
      const platform = req.body?.platform ? String(req.body.platform) : null;
      const appName = req.body?.appName ? String(req.body.appName) : null;
      const deviceName = req.body?.deviceName ? String(req.body.deviceName) : null;

      if (!token) {
        return res.status(400).json({ error: 'Push token is required' });
      }

      await mobilePushService.registerToken({
        userId: req.user!.userId,
        token,
        platform,
        appName,
        deviceName,
      });

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  async unregisterPushToken(req: Request, res: Response, next: NextFunction) {
    try {
      const token = String(req.body?.token || '').trim();
      if (!token) {
        return res.status(400).json({ error: 'Push token is required' });
      }

      await mobilePushService.unregisterToken({
        userId: req.user!.userId,
        token,
      });

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
}

export default new NotificationController();
