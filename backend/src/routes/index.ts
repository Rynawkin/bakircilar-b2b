/**
 * Routes Index
 *
 * Tüm route'ları toplar
 */

import { Router } from 'express';
import authRoutes from './auth.routes';
import adminRoutes from './admin.routes';
import customerRoutes from './customer.routes';

const router = Router();

// Health check
router.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Routes
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);

// Customer routes (products, cart, orders) - ana path'te
router.use('/', customerRoutes);

export default router;
