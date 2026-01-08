import { prisma } from '../utils/prisma';

type NotificationPayload = {
  title: string;
  body?: string | null;
  linkUrl?: string | null;
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

    await prisma.notification.createMany({
      data: uniqueIds.map((userId) => ({
        userId,
        title: payload.title,
        body: payload.body || null,
        linkUrl: payload.linkUrl || null,
      })),
    });
  }
}

export default new NotificationService();
