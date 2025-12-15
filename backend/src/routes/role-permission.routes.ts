import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { rolePermissionController } from '../controllers/role-permission.controller';

const router = Router();

// HEAD_ADMIN only middleware
const requireHeadAdmin = (req: any, res: any, next: any) => {
  if (!req.user || req.user.role !== 'HEAD_ADMIN') {
    return res.status(403).json({ error: 'HEAD_ADMIN access required' });
  }
  next();
};

// Tüm route'lar authenticated olmalı
router.use(authenticate);

// Mevcut kullanıcının izinlerini getir (herkes kendi izinlerini görebilir)
router.get('/my-permissions', rolePermissionController.getMyPermissions);

// Tüm mevcut izinleri listele (HEAD_ADMIN için)
router.get('/available', requireHeadAdmin, rolePermissionController.getAvailablePermissions);

// Tüm roller için izinleri getir (HEAD_ADMIN için)
router.get('/all', requireHeadAdmin, rolePermissionController.getAllRolePermissions);

// Belirli bir rol için izinleri getir (HEAD_ADMIN için)
router.get('/:role', requireHeadAdmin, rolePermissionController.getRolePermissions);

// Bir izni açma/kapatma (HEAD_ADMIN için)
router.put('/:role/:permission', requireHeadAdmin, rolePermissionController.setRolePermission);

// Bir rol için izinleri varsayılana sıfırla (HEAD_ADMIN için)
router.post('/:role/reset', requireHeadAdmin, rolePermissionController.resetRolePermissions);

export default router;
