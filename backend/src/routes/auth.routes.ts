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
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
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

export default router;
