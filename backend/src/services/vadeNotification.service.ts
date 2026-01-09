import { prisma } from '../utils/prisma';
import notificationService from './notification.service';

const buildReminderTitle = (customerName: string) =>
  `${customerName} icin hatirlatma`;

class VadeNotificationService {
  async processNoteReminders() {
    const now = new Date();
    const notes = await prisma.vadeNote.findMany({
      where: {
        reminderDate: { lte: now },
        reminderCompleted: false,
        reminderSentAt: null,
        authorId: { not: null },
      },
      include: {
        customer: { select: { id: true, name: true, displayName: true, mikroName: true } },
      },
    });

    if (notes.length === 0) {
      return { notified: 0 };
    }

    for (const note of notes) {
      const customerLabel =
        note.customer.displayName || note.customer.mikroName || note.customer.name || 'Musteri';
      await notificationService.createForUsers([note.authorId], {
        title: buildReminderTitle(customerLabel),
        body: note.reminderNote || note.noteContent,
        linkUrl: `/vade/customers/${note.customerId}`,
      });
    }

    await prisma.vadeNote.updateMany({
      where: { id: { in: notes.map((note) => note.id) } },
      data: { reminderSentAt: now },
    });

    return { notified: notes.length };
  }
}

export default new VadeNotificationService();
