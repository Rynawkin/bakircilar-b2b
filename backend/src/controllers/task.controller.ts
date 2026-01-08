import { Request, Response, NextFunction } from 'express';
import taskService from '../services/task.service';
import { TaskPriority, TaskStatus, TaskType, TaskVisibility, TaskLinkType, TaskView } from '@prisma/client';

const parseStatusList = (value: unknown): TaskStatus[] | undefined => {
  if (!value) return undefined;
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const statuses = raw
    .map((item) => String(item).trim())
    .filter(Boolean) as TaskStatus[];
  return statuses.length > 0 ? statuses : undefined;
};

export class TaskController {
  async getPreferences(req: Request, res: Response, next: NextFunction) {
    try {
      const preferences = await taskService.getPreferences(req.user!.userId);
      res.json({ preferences });
    } catch (error) {
      next(error);
    }
  }

  async updatePreferences(req: Request, res: Response, next: NextFunction) {
    try {
      const view = req.body?.defaultView as TaskView | undefined;
      const colorRules = req.body?.colorRules as unknown[] | undefined;
      if (!view && colorRules === undefined) {
        return res.status(400).json({ error: 'defaultView or colorRules is required' });
      }
      const preferences = await taskService.updatePreferences(req.user!.userId, {
        defaultView: view,
        colorRules,
      });
      res.json({ preferences });
    } catch (error) {
      next(error);
    }
  }

  async getAssignees(_req: Request, res: Response, next: NextFunction) {
    try {
      const assignees = await taskService.getAssignees();
      res.json({ assignees });
    } catch (error) {
      next(error);
    }
  }

  async getTasks(req: Request, res: Response, next: NextFunction) {
    try {
      const { status, type, priority, assignedToId, createdById, customerId, search, limit, offset } = req.query;
      const tasks = await taskService.getTasksForStaff(req.user!.userId, req.user!.role, {
        status: parseStatusList(status),
        type: type as TaskType | undefined,
        priority: priority as TaskPriority | undefined,
        assignedToId: assignedToId as string | undefined,
        createdById: createdById as string | undefined,
        customerId: customerId as string | undefined,
        search: search as string | undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      });
      res.json({ tasks });
    } catch (error) {
      next(error);
    }
  }

  async getCustomerTasks(req: Request, res: Response, next: NextFunction) {
    try {
      const { status, search, limit, offset } = req.query;
      const tasks = await taskService.getTasksForCustomer(req.user!.userId, {
        status: parseStatusList(status),
        search: search as string | undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      });
      res.json({ tasks });
    } catch (error) {
      next(error);
    }
  }

  async getTaskById(req: Request, res: Response, next: NextFunction) {
    try {
      const task = await taskService.getTaskByIdForStaff(req.params.id, req.user!.userId, req.user!.role);
      res.json({ task });
    } catch (error) {
      next(error);
    }
  }

  async getCustomerTaskById(req: Request, res: Response, next: NextFunction) {
    try {
      const task = await taskService.getTaskByIdForCustomer(req.params.id, req.user!.userId);
      res.json({ task });
    } catch (error) {
      next(error);
    }
  }

  async createTask(req: Request, res: Response, next: NextFunction) {
    try {
      const task = await taskService.createTaskForStaff(req.body, req.user!.userId);
      res.status(201).json({ task });
    } catch (error) {
      next(error);
    }
  }

  async createCustomerTask(req: Request, res: Response, next: NextFunction) {
    try {
      const task = await taskService.createTaskForCustomer(req.body, req.user!.userId);
      res.status(201).json({ task });
    } catch (error) {
      next(error);
    }
  }

  async updateTask(req: Request, res: Response, next: NextFunction) {
    try {
      const task = await taskService.updateTaskForStaff(req.params.id, req.body, req.user!.userId, req.user!.role);
      res.json({ task });
    } catch (error) {
      next(error);
    }
  }

  async addComment(req: Request, res: Response, next: NextFunction) {
    try {
      const { body, visibility } = req.body as { body?: string; visibility?: TaskVisibility };
      const comment = await taskService.addComment(req.params.id, req.user!.userId, req.user!.role, body || '', visibility);
      res.status(201).json({ comment });
    } catch (error) {
      next(error);
    }
  }

  async addCustomerComment(req: Request, res: Response, next: NextFunction) {
    try {
      const { body } = req.body as { body?: string };
      const comment = await taskService.addCommentAsCustomer(req.params.id, req.user!.userId, body || '');
      res.status(201).json({ comment });
    } catch (error) {
      next(error);
    }
  }

  async addAttachment(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'File is required' });
      }
      const visibility = (req.body?.visibility as TaskVisibility | undefined) || TaskVisibility.PUBLIC;
      const attachment = await taskService.addAttachment(req.params.id, req.user!.userId, req.user!.role, req.file, visibility);
      res.status(201).json({ attachment });
    } catch (error) {
      next(error);
    }
  }

  async addCustomerAttachment(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'File is required' });
      }
      const attachment = await taskService.addAttachmentAsCustomer(req.params.id, req.user!.userId, req.file);
      res.status(201).json({ attachment });
    } catch (error) {
      next(error);
    }
  }

  async addLink(req: Request, res: Response, next: NextFunction) {
    try {
      const { type, label, referenceId, referenceCode, referenceUrl } = req.body as {
        type: TaskLinkType;
        label?: string;
        referenceId?: string;
        referenceCode?: string;
        referenceUrl?: string;
      };
      const link = await taskService.addLink(req.params.id, req.user!.userId, req.user!.role, {
        type,
        label,
        referenceId,
        referenceCode,
        referenceUrl,
      });
      res.status(201).json({ link });
    } catch (error) {
      next(error);
    }
  }

  async deleteLink(req: Request, res: Response, next: NextFunction) {
    try {
      await taskService.deleteLink(req.params.id, req.params.linkId, req.user!.userId, req.user!.role);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  async getTemplates(req: Request, res: Response, next: NextFunction) {
    try {
      const activeOnly = req.query.activeOnly !== 'false';
      const templates = await taskService.getTemplates(activeOnly);
      res.json({ templates });
    } catch (error) {
      next(error);
    }
  }

  async createTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const template = await taskService.createTemplate(req.body, req.user!.userId);
      res.status(201).json({ template });
    } catch (error) {
      next(error);
    }
  }

  async updateTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const template = await taskService.updateTemplate(req.params.id, req.body);
      res.json({ template });
    } catch (error) {
      next(error);
    }
  }
}

export default new TaskController();
