/**
 * Auth Routes
 */

import { Router } from 'express';
import authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validation.middleware';
import { z } from 'zod';

const router = Router();

// Validation schemas
const loginSchema = z.object({
  email: z.string().min(3, 'Email or cari code is required'),
  password: z.string().min(1, 'Password is required'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mevcut şifre zorunludur'),
  newPassword: z
    .string()
    .min(10, 'Yeni şifre en az 10 karakter olmalıdır')
    .max(128, 'Yeni şifre en fazla 128 karakter olabilir')
    .regex(/[a-zçğıöşü]/, 'Yeni şifre en az bir küçük harf içermelidir')
    .regex(/[A-ZÇĞİÖŞÜ]/, 'Yeni şifre en az bir büyük harf içermelidir')
    .regex(/[0-9]/, 'Yeni şifre en az bir rakam içermelidir')
    .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Yeni şifre UTF-8 olarak en fazla 72 bayt olabilir'),
}).refine((data) => data.currentPassword !== data.newPassword, {
  message: 'Yeni şifre mevcut şifreden farklı olmalıdır',
  path: ['newPassword'],
});

/**
 * POST /api/auth/login
 * Kullanıcı girişi
 */
router.post('/login', validateBody(loginSchema), authController.login);

/**
 * GET /api/auth/me
 * Giriş yapmış kullanıcı bilgilerini getir
 */
router.get('/me', authenticate, authController.getMe);

/**
 * PUT /api/auth/password
 * Giriş yapmış kullanıcının kendi şifresini değiştirir.
 */
router.put(
  '/password',
  authenticate,
  validateBody(changePasswordSchema),
  authController.changePassword
);

export default router;
