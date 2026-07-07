import { Request, Response, NextFunction } from 'express';
import notificationService from '../services/notification.service';
import mobilePushService from '../services/mobile-push.service';
import webPushService from '../services/web-push.service';

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

  async getPreferences(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await notificationService.getPreferences(req.user!.userId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async updatePreferences(req: Request, res: Response, next: NextFunction) {
    try {
      const preferences = Array.isArray(req.body?.preferences) ? req.body.preferences : [];
      const result = await notificationService.updatePreferences(req.user!.userId, preferences);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async getVapidPublicKey(req: Request, res: Response, next: NextFunction) {
    try {
      const publicKey = await webPushService.getPublicKey();
      res.json({ publicKey: publicKey || null });
    } catch (error) {
      next(error);
    }
  }

  async registerPushToken(req: Request, res: Response, next: NextFunction) {
    try {
      const subscription = req.body?.subscription;
      if (subscription?.endpoint) {
        await webPushService.registerSubscription({
          userId: req.user!.userId,
          endpoint: String(subscription.endpoint),
          keys: {
            p256dh: subscription.keys?.p256dh,
            auth: subscription.keys?.auth,
          },
          userAgent: req.headers['user-agent'] ? String(req.headers['user-agent']) : null,
        });

        return res.json({ success: true, type: 'web' });
      }

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

      res.json({ success: true, type: 'mobile' });
    } catch (error) {
      next(error);
    }
  }

  async unregisterPushToken(req: Request, res: Response, next: NextFunction) {
    try {
      const endpoint = String(req.body?.endpoint || req.body?.subscription?.endpoint || '').trim();
      if (endpoint) {
        await webPushService.unregisterSubscription({
          userId: req.user!.userId,
          endpoint,
        });
        return res.json({ success: true, type: 'web' });
      }

      const token = String(req.body?.token || '').trim();
      if (!token) {
        return res.status(400).json({ error: 'Push token is required' });
      }

      await mobilePushService.unregisterToken({
        userId: req.user!.userId,
        token,
      });

      res.json({ success: true, type: 'mobile' });
    } catch (error) {
      next(error);
    }
  }

  async sendTestPush(req: Request, res: Response, next: NextFunction) {
    try {
      const title = String(req.body?.title || '').trim() || 'Test bildirimi';
      const body = String(req.body?.body || '').trim() || 'Push bildirimi test edildi.';
      const linkUrl = req.body?.linkUrl ? String(req.body.linkUrl).trim() : '/notifications';

      await notificationService.createForUsers([req.user!.userId], {
        title,
        body,
        linkUrl: linkUrl || '/notifications',
      });

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
}

export default new NotificationController();
