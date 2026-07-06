import { prisma } from '../utils/prisma';
import mobilePushService from './mobile-push.service';
import webPushService from './web-push.service';

type NotificationPayload = {
  category?: string | null;
  title: string;
  body?: string | null;
  linkUrl?: string | null;
};

export const NOTIFICATION_CATEGORIES = [
  { key: 'SYSTEM', label: 'Sistem' },
  { key: 'ORDER', label: 'Siparis' },
  { key: 'QUOTE', label: 'Teklif' },
  { key: 'VADE', label: 'Vade' },
  { key: 'TASK', label: 'Talepler' },
  { key: 'CART', label: 'Sepet' },
  { key: 'PRICE', label: 'Fiyat / Maliyet' },
  { key: 'STOCK', label: 'Stok' },
  { key: 'PACKAGE', label: 'Paketler' },
  { key: 'IMAGE', label: 'Gorsel' },
  { key: 'AUDIT', label: 'Audit' },
] as const;

const normalizeCategory = (value?: string | null) => {
  const raw = String(value || 'SYSTEM').trim().toUpperCase();
  return NOTIFICATION_CATEGORIES.some((item) => item.key === raw) ? raw : 'SYSTEM';
};

class NotificationService {
  async list(userId: string, query: {
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
  }) {
    const where: any = { userId };
    if (query.unreadOnly) {
      where.isRead = false;
    }

    const [notifications, unreadCount] = await prisma.$transaction([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...(query.limit ? { take: query.limit } : {}),
        ...(query.offset ? { skip: query.offset } : {}),
      }),
      prisma.notification.count({
        where: { userId, isRead: false },
      }),
    ]);

    return { notifications, unreadCount };
  }

  async getPreferences(userId: string) {
    const rows = await prisma.notificationPreference.findMany({
      where: { userId },
      select: { category: true, enabled: true },
    });
    const byCategory = new Map(rows.map((row) => [row.category, row.enabled]));

    return {
      categories: NOTIFICATION_CATEGORIES.map((item) => ({
        ...item,
        enabled: byCategory.get(item.key) ?? true,
      })),
    };
  }

  async updatePreferences(userId: string, preferences: Array<{ category?: string; enabled?: boolean }>) {
    const normalized = preferences
      .map((item) => ({
        category: normalizeCategory(item.category),
        enabled: item.enabled !== false,
      }))
      .filter((item, index, arr) => arr.findIndex((candidate) => candidate.category === item.category) === index);

    await prisma.$transaction(
      normalized.map((item) =>
        prisma.notificationPreference.upsert({
          where: { userId_category: { userId, category: item.category } },
          create: { userId, category: item.category, enabled: item.enabled },
          update: { enabled: item.enabled },
        })
      )
    );

    return this.getPreferences(userId);
  }

  async markRead(userId: string, ids: string[]) {
    if (!ids || ids.length === 0) return 0;
    const result = await prisma.notification.updateMany({
      where: { userId, id: { in: ids } },
      data: { isRead: true },
    });
    return result.count;
  }

  async markAllRead(userId: string) {
    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return result.count;
  }

  async createForUsers(userIds: Array<string | null | undefined>, payload: NotificationPayload) {
    const uniqueIds = Array.from(new Set(userIds.filter(Boolean))) as string[];
    if (uniqueIds.length === 0) return;
    const category = normalizeCategory(payload.category);

    const disabledRows = await prisma.notificationPreference.findMany({
      where: {
        userId: { in: uniqueIds },
        category,
        enabled: false,
      },
      select: { userId: true },
    });
    const disabled = new Set(disabledRows.map((row) => row.userId));
    const enabledIds = uniqueIds.filter((id) => !disabled.has(id));
    if (enabledIds.length === 0) return;

    await prisma.notification.createMany({
      data: enabledIds.map((userId) => ({
        userId,
        category,
        title: payload.title,
        body: payload.body || null,
        linkUrl: payload.linkUrl || null,
      })),
    });

    try {
      await webPushService.sendToUsers(enabledIds, payload);
    } catch (error) {
      console.error('Web push notification dispatch failed', { error });
    }

    try {
      await mobilePushService.sendToUsers(enabledIds, payload);
    } catch (error) {
      console.error('Mobile push notification dispatch failed', { error });
    }
  }
}

export default new NotificationService();
