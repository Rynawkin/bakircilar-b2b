/**
 * Routes Index
 *
 * Tüm route'ları toplar
 */

import { Router } from 'express';
import authRoutes from './auth.routes';
import adminRoutes from './admin.routes';
import customerRoutes from './customer.routes';
import campaignRoutes from './campaigns';
import orderTrackingRoutes from './order-tracking.routes';
import reportsRoutes from './reports.routes';
import searchRoutes from './search.routes';
import cariHareketRoutes from './cari-hareket.routes';
import rolePermissionRoutes from './role-permission.routes';

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
router.use('/admin/reports', reportsRoutes);
router.use('/search', searchRoutes);
router.use('/cari-hareket', cariHareketRoutes);
router.use('/campaigns', campaignRoutes);
router.use('/order-tracking', orderTrackingRoutes);
router.use('/role-permissions', rolePermissionRoutes);

// Customer routes (products, cart, orders) - ana path'te
router.use('/', customerRoutes);

export default router;
