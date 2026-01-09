import { prisma } from '../utils/prisma';
import { VadeBalanceSource, VadeSyncStatus } from '@prisma/client';

type DateInput = string | Date | null | undefined;

type VadeBalanceInput = {
  userId: string;
  pastDueBalance?: number;
  pastDueDate?: DateInput;
  notDueBalance?: number;
  notDueDate?: DateInput;
  totalBalance?: number;
  valor?: number;
  paymentTermLabel?: string | null;
  referenceDate?: DateInput;
  source?: VadeBalanceSource;
};

type VadeNoteInput = {
  customerId: string;
  authorId?: string | null;
  noteContent: string;
  promiseDate?: DateInput;
  tags?: string[] | null;
  reminderDate?: DateInput;
  reminderNote?: string | null;
  reminderCompleted?: boolean;
  reminderSentAt?: DateInput;
  balanceAtTime?: number | null;
};

type VadeClassificationInput = {
  customerId: string;
  classification: string;
  customClassification?: string | null;
  riskScore?: number | null;
  createdById?: string | null;
  updatedById?: string | null;
};

type VadeAssignmentInput = {
  staffId: string;
  customerIds: string[];
  assignedById?: string | null;
};

const parseDateInput = (value: DateInput) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeTags = (tags?: string[] | null) => {
  if (!tags || tags.length === 0) return [];
  return tags.map((tag) => String(tag).trim()).filter(Boolean);
};

const buildBalanceData = (input: VadeBalanceInput) => ({
  userId: input.userId,
  pastDueBalance: input.pastDueBalance ?? 0,
  pastDueDate: parseDateInput(input.pastDueDate),
  notDueBalance: input.notDueBalance ?? 0,
  notDueDate: parseDateInput(input.notDueDate),
  totalBalance: input.totalBalance ?? 0,
  valor: input.valor ?? 0,
  paymentTermLabel: input.paymentTermLabel ?? null,
  referenceDate: parseDateInput(input.referenceDate),
  source: input.source ?? VadeBalanceSource.MANUAL,
});

class VadeService {
  async upsertBalance(input: VadeBalanceInput) {
    const data = buildBalanceData(input);
    return prisma.vadeBalance.upsert({
      where: { userId: input.userId },
      create: data,
      update: data,
    });
  }

  async getBalanceByUserId(userId: string) {
    return prisma.vadeBalance.findUnique({ where: { userId } });
  }

  async createNote(input: VadeNoteInput) {
    return prisma.vadeNote.create({
      data: {
        customerId: input.customerId,
        authorId: input.authorId ?? null,
        noteContent: input.noteContent,
        promiseDate: parseDateInput(input.promiseDate),
        tags: normalizeTags(input.tags),
        reminderDate: parseDateInput(input.reminderDate),
        reminderNote: input.reminderNote ?? null,
        reminderCompleted: input.reminderCompleted ?? false,
        reminderSentAt: input.reminderSentAt ? parseDateInput(input.reminderSentAt) : null,
        balanceAtTime: input.balanceAtTime ?? null,
      },
    });
  }

  async updateNote(noteId: string, input: Partial<VadeNoteInput>) {
    return prisma.vadeNote.update({
      where: { id: noteId },
      data: {
        noteContent: input.noteContent,
        promiseDate: input.promiseDate !== undefined ? parseDateInput(input.promiseDate) : undefined,
        tags: input.tags !== undefined ? normalizeTags(input.tags) : undefined,
        reminderDate: input.reminderDate !== undefined ? parseDateInput(input.reminderDate) : undefined,
        reminderNote: input.reminderNote,
        reminderCompleted: input.reminderCompleted,
        reminderSentAt: input.reminderSentAt !== undefined ? parseDateInput(input.reminderSentAt) : undefined,
        balanceAtTime: input.balanceAtTime,
      },
    });
  }

  async listNotes(customerId: string) {
    return prisma.vadeNote.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, name: true, email: true, role: true } },
      },
    });
  }

  async markReminderCompleted(noteId: string, completed: boolean) {
    return prisma.vadeNote.update({
      where: { id: noteId },
      data: { reminderCompleted: completed },
    });
  }

  async upsertClassification(input: VadeClassificationInput) {
    return prisma.vadeClassification.upsert({
      where: { customerId: input.customerId },
      create: {
        customerId: input.customerId,
        classification: input.classification,
        customClassification: input.customClassification ?? null,
        riskScore: input.riskScore ?? null,
        createdById: input.createdById ?? null,
        updatedById: input.updatedById ?? null,
      },
      update: {
        classification: input.classification,
        customClassification: input.customClassification ?? null,
        riskScore: input.riskScore ?? null,
        updatedById: input.updatedById ?? null,
      },
    });
  }

  async getClassification(customerId: string) {
    return prisma.vadeClassification.findUnique({ where: { customerId } });
  }

  async assignCustomers(input: VadeAssignmentInput) {
    if (!input.customerIds || input.customerIds.length === 0) {
      return { created: 0 };
    }
    const data = input.customerIds.map((customerId) => ({
      staffId: input.staffId,
      customerId,
      assignedById: input.assignedById ?? null,
    }));
    const result = await prisma.vadeAssignment.createMany({
      data,
      skipDuplicates: true,
    });
    return { created: result.count };
  }

  async removeAssignment(staffId: string, customerId: string) {
    return prisma.vadeAssignment.deleteMany({
      where: { staffId, customerId },
    });
  }

  async listAssignmentsForStaff(staffId: string) {
    return prisma.vadeAssignment.findMany({
      where: { staffId },
      include: {
        customer: { select: { id: true, name: true, mikroCariCode: true, sectorCode: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listAssignmentsForCustomer(customerId: string) {
    return prisma.vadeAssignment.findMany({
      where: { customerId },
      include: {
        staff: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createSyncLog(source: VadeBalanceSource) {
    return prisma.vadeSyncLog.create({
      data: {
        source,
        status: VadeSyncStatus.PARTIAL,
      },
    });
  }

  async updateSyncLog(syncLogId: string, data: {
    status?: VadeSyncStatus;
    recordsTotal?: number;
    recordsUpdated?: number;
    recordsSkipped?: number;
    errorMessage?: string | null;
    details?: Record<string, any> | null;
    completedAt?: Date;
  }) {
    return prisma.vadeSyncLog.update({
      where: { id: syncLogId },
      data: {
        status: data.status,
        recordsTotal: data.recordsTotal,
        recordsUpdated: data.recordsUpdated,
        recordsSkipped: data.recordsSkipped,
        errorMessage: data.errorMessage ?? undefined,
        details: data.details ?? undefined,
        completedAt: data.completedAt,
      },
    });
  }
}

export default new VadeService();
