import { prisma } from '../utils/prisma';
import { splitSearchTokens } from '../utils/search';
import notificationService from './notification.service';
import {
  TaskPriority,
  TaskStatus,
  TaskType,
  TaskVisibility,
  TaskLinkType,
  TaskView,
  UserRole,
} from '@prisma/client';

const STAFF_ROLES: UserRole[] = ['HEAD_ADMIN', 'ADMIN', 'MANAGER', 'SALES_REP'];
const TASK_COLOR_OPTIONS = ['red', 'purple', 'amber', 'blue', 'slate', 'green'];
const TASK_NOTIFICATION_LINK = '/requests';

const isAdminRole = (role?: string) =>
  role === 'HEAD_ADMIN' || role === 'ADMIN' || role === 'MANAGER';

const parseDateInput = (value?: string | Date | null) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const taskListInclude = {
  createdBy: {
    select: { id: true, name: true, email: true, role: true },
  },
  assignedTo: {
    select: { id: true, name: true, email: true, role: true },
  },
  customer: {
    select: {
      id: true,
      name: true,
      displayName: true,
      mikroName: true,
      mikroCariCode: true,
      sectorCode: true,
    },
  },
  links: {
    select: {
      id: true,
      type: true,
      label: true,
      referenceId: true,
      referenceCode: true,
      referenceUrl: true,
    },
  },
  _count: {
    select: { comments: true, attachments: true },
  },
};

const taskDetailInclude = {
  ...taskListInclude,
  comments: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      author: { select: { id: true, name: true, email: true, role: true } },
    },
  },
  attachments: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      uploadedBy: { select: { id: true, name: true, email: true, role: true } },
    },
  },
  statusHistory: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      changedBy: { select: { id: true, name: true, email: true, role: true } },
    },
  },
};

class TaskService {
  async getPreferences(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { taskDefaultView: true, taskColorRules: true },
    });
    return {
      defaultView: user?.taskDefaultView || TaskView.KANBAN,
      colorRules: this.sanitizeColorRules(user?.taskColorRules) || null,
    };
  }

  async updatePreferences(userId: string, data: {
    defaultView?: TaskView;
    colorRules?: unknown[] | null;
  }) {
    const updateData: any = {};
    if (data.defaultView) {
      updateData.taskDefaultView = data.defaultView;
    }
    if (data.colorRules !== undefined) {
      updateData.taskColorRules = this.sanitizeColorRules(data.colorRules);
    }
    if (Object.keys(updateData).length === 0) {
      const current = await this.getPreferences(userId);
      return current;
    }
    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: { taskDefaultView: true, taskColorRules: true },
    });
    return {
      defaultView: user.taskDefaultView,
      colorRules: this.sanitizeColorRules(user.taskColorRules) || null,
    };
  }

  private sanitizeColorRules(input?: unknown) {
    if (!Array.isArray(input)) return null;
    const sanitized = input
      .map((rule) => {
        if (!rule || typeof rule !== 'object') return null;
        const entry = rule as Record<string, unknown>;
        const days = Number.isFinite(Number(entry.days)) ? Math.round(Number(entry.days)) : 0;
        const color = typeof entry.color === 'string' && TASK_COLOR_OPTIONS.includes(entry.color)
          ? entry.color
          : 'red';
        const enabled = entry.enabled !== undefined ? Boolean(entry.enabled) : true;
        const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : undefined;
        if (days <= 0) return null;
        return { id, days, color, enabled };
      })
      .filter(Boolean);
    return sanitized.length > 0 ? sanitized : null;
  }

  async getAssignees() {
    const assignees = await prisma.user.findMany({
      where: {
        role: { in: STAFF_ROLES },
        active: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
      orderBy: { name: 'asc' },
    });
    return assignees;
  }

  private buildSearchWhere(search?: string | null) {
    const tokens = splitSearchTokens(search || undefined);
    if (tokens.length === 0) return [];

    return tokens.map((token) => ({
      OR: [
        { title: { contains: token, mode: 'insensitive' as const } },
        { description: { contains: token, mode: 'insensitive' as const } },
        { createdBy: { name: { contains: token, mode: 'insensitive' as const } } },
        { assignedTo: { name: { contains: token, mode: 'insensitive' as const } } },
        { customer: { name: { contains: token, mode: 'insensitive' as const } } },
        { customer: { displayName: { contains: token, mode: 'insensitive' as const } } },
        { customer: { mikroName: { contains: token, mode: 'insensitive' as const } } },
        { customer: { mikroCariCode: { contains: token, mode: 'insensitive' as const } } },
      ],
    }));
  }

  private getParticipantIds(task: { createdById: string; assignedToId?: string | null; customerId?: string | null }) {
    return [task.createdById, task.assignedToId, task.customerId].filter(Boolean) as string[];
  }

  private async notifyParticipants(task: { createdById: string; assignedToId?: string | null; customerId?: string | null }, actorId: string, payload: { title: string; body?: string | null }) {
    const recipients = this.getParticipantIds(task).filter((id) => id !== actorId);
    if (recipients.length === 0) return;
    await notificationService.createForUsers(recipients, {
      title: payload.title,
      body: payload.body || null,
      linkUrl: TASK_NOTIFICATION_LINK,
    });
  }

  async getTasksForStaff(userId: string, role: string, query: {
    status?: string[];
    type?: TaskType;
    priority?: TaskPriority;
    assignedToId?: string;
    createdById?: string;
    customerId?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: any = {};

    if (!isAdminRole(role)) {
      where.OR = [{ createdById: userId }, { assignedToId: userId }];
    }

    if (query.status && query.status.length > 0) {
      where.status = { in: query.status };
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.priority) {
      where.priority = query.priority;
    }

    if (query.assignedToId) {
      where.assignedToId = query.assignedToId;
    }

    if (query.createdById) {
      where.createdById = query.createdById;
    }

    if (query.customerId) {
      where.customerId = query.customerId;
    }

    const searchClauses = this.buildSearchWhere(query.search);
    if (searchClauses.length > 0) {
      where.AND = [...(where.AND || []), ...searchClauses];
    }

    const tasks = await prisma.task.findMany({
      where,
      include: taskListInclude,
      orderBy: { lastActivityAt: 'desc' },
      ...(query.limit ? { take: query.limit } : {}),
      ...(query.offset ? { skip: query.offset } : {}),
    });

    return tasks;
  }

  async getTasksForCustomer(userId: string, query: {
    status?: string[];
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: any = { customerId: userId };

    if (query.status && query.status.length > 0) {
      where.status = { in: query.status };
    }

    const searchClauses = this.buildSearchWhere(query.search);
    if (searchClauses.length > 0) {
      where.AND = [...(where.AND || []), ...searchClauses];
    }

    const tasks = await prisma.task.findMany({
      where,
      include: taskListInclude,
      orderBy: { lastActivityAt: 'desc' },
      ...(query.limit ? { take: query.limit } : {}),
      ...(query.offset ? { skip: query.offset } : {}),
    });

    return tasks;
  }

  async getTaskByIdForStaff(taskId: string, userId: string, role: string) {
    const where: any = { id: taskId };
    if (!isAdminRole(role)) {
      where.OR = [{ createdById: userId }, { assignedToId: userId }];
    }

    const task = await prisma.task.findFirst({
      where,
      include: taskDetailInclude,
    });

    if (!task) {
      throw new Error('Task not found');
    }

    return task;
  }

  async getTaskByIdForCustomer(taskId: string, userId: string) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, customerId: userId },
      include: {
        ...taskDetailInclude,
        comments: {
          where: { visibility: TaskVisibility.PUBLIC },
          orderBy: { createdAt: 'asc' as const },
          include: {
            author: { select: { id: true, name: true, email: true, role: true } },
          },
        },
        attachments: {
          where: { visibility: TaskVisibility.PUBLIC },
          orderBy: { createdAt: 'asc' as const },
          include: {
            uploadedBy: { select: { id: true, name: true, email: true, role: true } },
          },
        },
      },
    });

    if (!task) {
      throw new Error('Task not found');
    }

    return task;
  }

  private async ensureAssigneeIsStaff(assignedToId?: string | null) {
    if (!assignedToId) return;
    const assignee = await prisma.user.findUnique({
      where: { id: assignedToId },
      select: { role: true, active: true },
    });

    if (!assignee || !assignee.active || assignee.role === 'CUSTOMER') {
      throw new Error('Assignee is invalid');
    }
  }

  private async resolveCustomerInfo(customerId?: string | null) {
    if (!customerId) return null;
    const customer = await prisma.user.findUnique({
      where: { id: customerId },
      select: { id: true, role: true, sectorCode: true },
    });
    if (!customer || customer.role !== 'CUSTOMER') {
      throw new Error('Customer not found');
    }
    return customer;
  }

  async createTaskForStaff(payload: {
    title?: string;
    description?: string | null;
    type?: TaskType;
    status?: TaskStatus;
    priority?: TaskPriority;
    dueDate?: string | Date | null;
    assignedToId?: string | null;
    customerId?: string | null;
    templateId?: string | null;
    links?: Array<{
      type: TaskLinkType;
      label?: string | null;
      referenceId?: string | null;
      referenceCode?: string | null;
      referenceUrl?: string | null;
    }>;
  }, userId: string) {
    let template = null;
    if (payload.templateId) {
      template = await prisma.taskTemplate.findUnique({
        where: { id: payload.templateId },
      });
      if (!template) {
        throw new Error('Template not found');
      }
    }

    const title = payload.title?.trim() || template?.title;
    if (!title) {
      throw new Error('Title is required');
    }

    const resolvedType = payload.type || template?.type || TaskType.OTHER;
    const resolvedPriority = payload.priority || template?.priority || TaskPriority.NONE;
    const resolvedStatus = payload.status || template?.defaultStatus || TaskStatus.NEW;

    const dueDate = parseDateInput(payload.dueDate);
    const assignedToId = payload.assignedToId || userId;
    await this.ensureAssigneeIsStaff(assignedToId);

    const customer = await this.resolveCustomerInfo(payload.customerId);
    const now = new Date();

    const task = await prisma.task.create({
      data: {
        title,
        description: payload.description ?? template?.description ?? null,
        type: resolvedType,
        status: resolvedStatus,
        priority: resolvedPriority,
        dueDate,
        createdById: userId,
        assignedToId,
        customerId: customer?.id || null,
        sectorCode: customer?.sectorCode || null,
        templateId: template?.id || null,
        lastActivityAt: now,
        statusHistory: {
          create: {
            fromStatus: null,
            toStatus: resolvedStatus,
            changedById: userId,
          },
        },
        links: payload.links && payload.links.length > 0 ? {
          create: payload.links.map((link) => ({
            type: link.type,
            label: link.label || null,
            referenceId: link.referenceId || null,
            referenceCode: link.referenceCode || null,
            referenceUrl: link.referenceUrl || null,
          })),
        } : undefined,
      },
      include: taskDetailInclude,
    });

    if (assignedToId && assignedToId !== userId) {
      await notificationService.createForUsers([assignedToId], {
        title: 'Yeni talep atandi',
        body: title,
        linkUrl: TASK_NOTIFICATION_LINK,
      });
    }

    return task;
  }

  async createTaskForCustomer(payload: {
    title?: string;
    description?: string | null;
    type?: TaskType;
    priority?: TaskPriority;
  }, userId: string) {
    const title = payload.title?.trim();
    if (!title) {
      throw new Error('Title is required');
    }

    const customer = await prisma.user.findUnique({
      where: { id: userId },
      select: { sectorCode: true, name: true, displayName: true, mikroName: true },
    });
    const sectorCode = customer?.sectorCode || null;

    let assignedToId: string | null = null;
    if (sectorCode) {
      const salesRep = await prisma.user.findFirst({
        where: {
          role: 'SALES_REP',
          assignedSectorCodes: { has: sectorCode },
          active: true,
        },
        select: { id: true },
        orderBy: { name: 'asc' },
      });
      assignedToId = salesRep?.id || null;
    }

    const now = new Date();
    const task = await prisma.task.create({
      data: {
        title,
        description: payload.description || null,
        type: payload.type || TaskType.OTHER,
        status: TaskStatus.NEW,
        priority: payload.priority || TaskPriority.NONE,
        createdById: userId,
        assignedToId,
        customerId: userId,
        sectorCode,
        lastActivityAt: now,
        statusHistory: {
          create: {
            fromStatus: null,
            toStatus: TaskStatus.NEW,
            changedById: userId,
          },
        },
      },
      include: taskDetailInclude,
    });

    if (assignedToId) {
      const customerLabel = customer?.displayName || customer?.mikroName || customer?.name || '';
      await notificationService.createForUsers([assignedToId], {
        title: 'Yeni musteri talebi',
        body: customerLabel ? `${customerLabel} - ${title}` : title,
        linkUrl: TASK_NOTIFICATION_LINK,
      });
    }

    return task;
  }

  async updateTaskForStaff(taskId: string, payload: {
    title?: string;
    description?: string | null;
    type?: TaskType;
    status?: TaskStatus;
    priority?: TaskPriority;
    dueDate?: string | Date | null;
    assignedToId?: string | null;
    customerId?: string | null;
  }, userId: string, role: string) {
    const existing = await this.getTaskByIdForStaff(taskId, userId, role);
    const now = new Date();

    const data: any = {};
    if (payload.title !== undefined) {
      const trimmed = payload.title.trim();
      if (!trimmed) {
        throw new Error('Title is required');
      }
      data.title = trimmed;
    }
    if (payload.description !== undefined) data.description = payload.description;
    if (payload.type) data.type = payload.type;
    if (payload.priority) data.priority = payload.priority;
    if (payload.dueDate !== undefined) data.dueDate = parseDateInput(payload.dueDate);

    if (payload.assignedToId !== undefined) {
      await this.ensureAssigneeIsStaff(payload.assignedToId);
      data.assignedToId = payload.assignedToId;
    }

    if (payload.customerId !== undefined) {
      const customer = await this.resolveCustomerInfo(payload.customerId);
      data.customerId = customer?.id || null;
      data.sectorCode = customer?.sectorCode || null;
    }

    const statusChanged = payload.status && payload.status !== existing.status;
    const assigneeChanged = payload.assignedToId !== undefined && payload.assignedToId !== existing.assignedToId;
    if (payload.status) {
      data.status = payload.status;
      if (payload.status === TaskStatus.DONE || payload.status === TaskStatus.CANCELLED) {
        data.completedAt = now;
      } else if (existing.completedAt) {
        data.completedAt = null;
      }
    }

    data.lastActivityAt = now;

    const [task] = await prisma.$transaction([
      prisma.task.update({
        where: { id: taskId },
        data,
        include: taskDetailInclude,
      }),
      ...(statusChanged ? [prisma.taskStatusHistory.create({
        data: {
          taskId,
          fromStatus: existing.status,
          toStatus: payload.status as TaskStatus,
          changedById: userId,
        },
      })] : []),
    ]);

    if (assigneeChanged && task.assignedToId && task.assignedToId !== userId) {
      await notificationService.createForUsers([task.assignedToId], {
        title: 'Talep size atandi',
        body: task.title,
        linkUrl: TASK_NOTIFICATION_LINK,
      });
    }

    if (statusChanged) {
      await this.notifyParticipants(task, userId, {
        title: 'Talep durumu guncellendi',
        body: `${task.title} (${task.status})`,
      });
    }

    return task;
  }

  async addComment(taskId: string, userId: string, role: string, body: string, visibility?: TaskVisibility) {
    const task = await this.getTaskByIdForStaff(taskId, userId, role);
    if (!body || !body.trim()) {
      throw new Error('Comment is required');
    }

    const comment = await prisma.taskComment.create({
      data: {
        taskId: task.id,
        authorId: userId,
        body: body.trim(),
        visibility: visibility || TaskVisibility.PUBLIC,
      },
      include: {
        author: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    await prisma.task.update({
      where: { id: task.id },
      data: { lastActivityAt: new Date() },
    });

    await this.notifyParticipants(task, userId, {
      title: 'Talep yorumu',
      body: task.title,
    });

    return comment;
  }

  async addCommentAsCustomer(taskId: string, userId: string, body: string) {
    const task = await this.getTaskByIdForCustomer(taskId, userId);
    if (!body || !body.trim()) {
      throw new Error('Comment is required');
    }

    const comment = await prisma.taskComment.create({
      data: {
        taskId: task.id,
        authorId: userId,
        body: body.trim(),
        visibility: TaskVisibility.PUBLIC,
      },
      include: {
        author: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    await prisma.task.update({
      where: { id: task.id },
      data: { lastActivityAt: new Date() },
    });

    await this.notifyParticipants(task, userId, {
      title: 'Talep yorumu',
      body: task.title,
    });

    return comment;
  }

  async addAttachment(taskId: string, userId: string, role: string, file: Express.Multer.File, visibility?: TaskVisibility) {
    const task = await this.getTaskByIdForStaff(taskId, userId, role);
    const attachment = await prisma.taskAttachment.create({
      data: {
        taskId: task.id,
        uploadedById: userId,
        fileName: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url: `/uploads/tasks/${file.filename}`,
        visibility: visibility || TaskVisibility.PUBLIC,
      },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    await prisma.task.update({
      where: { id: task.id },
      data: { lastActivityAt: new Date() },
    });

    await this.notifyParticipants(task, userId, {
      title: 'Talep dosyasi eklendi',
      body: task.title,
    });

    return attachment;
  }

  async addAttachmentAsCustomer(taskId: string, userId: string, file: Express.Multer.File) {
    const task = await this.getTaskByIdForCustomer(taskId, userId);
    const attachment = await prisma.taskAttachment.create({
      data: {
        taskId: task.id,
        uploadedById: userId,
        fileName: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url: `/uploads/tasks/${file.filename}`,
        visibility: TaskVisibility.PUBLIC,
      },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    await prisma.task.update({
      where: { id: task.id },
      data: { lastActivityAt: new Date() },
    });

    await this.notifyParticipants(task, userId, {
      title: 'Talep dosyasi eklendi',
      body: task.title,
    });

    return attachment;
  }

  async addLink(taskId: string, userId: string, role: string, payload: {
    type: TaskLinkType;
    label?: string | null;
    referenceId?: string | null;
    referenceCode?: string | null;
    referenceUrl?: string | null;
  }) {
    const task = await this.getTaskByIdForStaff(taskId, userId, role);

    const link = await prisma.taskLink.create({
      data: {
        taskId: task.id,
        type: payload.type,
        label: payload.label || null,
        referenceId: payload.referenceId || null,
        referenceCode: payload.referenceCode || null,
        referenceUrl: payload.referenceUrl || null,
      },
    });

    await prisma.task.update({
      where: { id: task.id },
      data: { lastActivityAt: new Date() },
    });

    return link;
  }

  async deleteLink(taskId: string, linkId: string, userId: string, role: string) {
    const task = await this.getTaskByIdForStaff(taskId, userId, role);

    await prisma.taskLink.delete({
      where: { id: linkId },
    });

    await prisma.task.update({
      where: { id: task.id },
      data: { lastActivityAt: new Date() },
    });
  }

  async getTemplates(activeOnly = true) {
    const where: any = {};
    if (activeOnly) {
      where.isActive = true;
    }
    const templates = await prisma.taskTemplate.findMany({
      where,
      orderBy: { title: 'asc' },
    });
    return templates;
  }

  async createTemplate(payload: {
    title: string;
    description?: string | null;
    type: TaskType;
    priority?: TaskPriority;
    defaultStatus?: TaskStatus;
    isActive?: boolean;
  }, userId: string) {
    const template = await prisma.taskTemplate.create({
      data: {
        title: payload.title.trim(),
        description: payload.description || null,
        type: payload.type,
        priority: payload.priority || TaskPriority.NONE,
        defaultStatus: payload.defaultStatus || TaskStatus.NEW,
        isActive: payload.isActive ?? true,
        createdById: userId,
      },
    });
    return template;
  }

  async updateTemplate(id: string, payload: {
    title?: string;
    description?: string | null;
    type?: TaskType;
    priority?: TaskPriority;
    defaultStatus?: TaskStatus;
    isActive?: boolean;
  }) {
    const data: any = {};
    if (payload.title !== undefined) {
      const trimmed = payload.title.trim();
      if (!trimmed) {
        throw new Error('Title is required');
      }
      data.title = trimmed;
    }
    if (payload.description !== undefined) data.description = payload.description;
    if (payload.type) data.type = payload.type;
    if (payload.priority) data.priority = payload.priority;
    if (payload.defaultStatus) data.defaultStatus = payload.defaultStatus;
    if (payload.isActive !== undefined) data.isActive = payload.isActive;

    const template = await prisma.taskTemplate.update({
      where: { id },
      data,
    });
    return template;
  }
}

export default new TaskService();
