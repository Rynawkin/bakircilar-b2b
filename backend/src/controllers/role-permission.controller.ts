import { Request, Response, NextFunction } from 'express';
import { rolePermissionService, AVAILABLE_PERMISSIONS } from '../services/role-permission.service';
import { UserRole } from '@prisma/client';

class RolePermissionController {
  /**
   * GET /api/role-permissions/available
   * Tüm mevcut izinleri listele
   */
  async getAvailablePermissions(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({
        permissions: AVAILABLE_PERMISSIONS
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/role-permissions/all
   * Tüm roller için izinleri getir (HEAD_ADMIN için)
   */
  async getAllRolePermissions(req: Request, res: Response, next: NextFunction) {
    try {
      const allPermissions = await rolePermissionService.getAllRolePermissions();

      res.json({
        permissions: allPermissions,
        availablePermissions: AVAILABLE_PERMISSIONS
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/role-permissions/:role
   * Belirli bir rol için izinleri getir
   */
  async getRolePermissions(req: Request, res: Response, next: NextFunction) {
    try {
      const { role } = req.params;

      // Role validation
      const validRoles: UserRole[] = ['HEAD_ADMIN', 'ADMIN', 'MANAGER', 'SALES_REP', 'CUSTOMER', 'DIVERSEY'];
      if (!validRoles.includes(role as UserRole)) {
        res.status(400).json({ error: 'Invalid role' });
        return;
      }

      const permissions = await rolePermissionService.getRolePermissions({
        role: role as UserRole
      });

      res.json({
        role,
        permissions,
        availablePermissions: AVAILABLE_PERMISSIONS
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/role-permissions/:role/:permission
   * Bir izni açma/kapatma
   */
  async setRolePermission(req: Request, res: Response, next: NextFunction) {
    try {
      const { role, permission } = req.params;
      const { enabled } = req.body;

      if (typeof enabled !== 'boolean') {
        res.status(400).json({ error: 'enabled must be a boolean' });
        return;
      }

      // Role validation
      const validRoles: UserRole[] = ['ADMIN', 'MANAGER', 'SALES_REP', 'CUSTOMER', 'DIVERSEY'];
      if (!validRoles.includes(role as UserRole)) {
        res.status(400).json({ error: 'Invalid role' });
        return;
      }

      const result = await rolePermissionService.setRolePermission({
        role: role as UserRole,
        permission,
        enabled
      });

      res.json({
        message: 'Permission updated',
        permission: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/role-permissions/:role/reset
   * Bir rol için izinleri varsayılana sıfırla
   */
  async resetRolePermissions(req: Request, res: Response, next: NextFunction) {
    try {
      const { role } = req.params;

      // Role validation
      const validRoles: UserRole[] = ['ADMIN', 'MANAGER', 'SALES_REP', 'CUSTOMER', 'DIVERSEY'];
      if (!validRoles.includes(role as UserRole)) {
        res.status(400).json({ error: 'Invalid role' });
        return;
      }

      const result = await rolePermissionService.initializeDefaultPermissions({
        role: role as UserRole
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/role-permissions/my-permissions
   * Mevcut kullanıcının izinlerini getir
   */
  async getMyPermissions(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const permissions = await rolePermissionService.getRolePermissions({
        role: req.user.role
      });

      res.json({
        role: req.user.role,
        permissions
      });
    } catch (error) {
      next(error);
    }
  }
}

export const rolePermissionController = new RolePermissionController();
