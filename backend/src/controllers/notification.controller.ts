import { Request, Response, NextFunction } from 'express';
import notificationService from '../services/notification.service';

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
}

export default new NotificationController();
