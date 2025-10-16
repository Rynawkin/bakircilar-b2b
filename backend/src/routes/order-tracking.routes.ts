/**
 * Order Tracking Routes
 */

import { Router } from 'express';
import orderTrackingController from '../controllers/order-tracking.controller';
import { authenticateToken, requireAdmin } from '../middleware/auth';

const router = Router();

// ==================== ADMIN ROUTES ====================

// Settings
router.get('/admin/settings', authenticateToken, requireAdmin, orderTrackingController.getSettings);
router.put('/admin/settings', authenticateToken, requireAdmin, orderTrackingController.updateSettings);

// Sync & Email
router.post('/admin/sync', authenticateToken, requireAdmin, orderTrackingController.syncPendingOrders);
router.post('/admin/send-emails', authenticateToken, requireAdmin, orderTrackingController.sendEmails);
router.post('/admin/sync-and-send', authenticateToken, requireAdmin, orderTrackingController.syncAndSend);

// Data
router.get('/admin/pending-orders', authenticateToken, requireAdmin, orderTrackingController.getAllPendingOrders);
router.get('/admin/summary', authenticateToken, requireAdmin, orderTrackingController.getCustomerSummary);
router.get('/admin/email-logs', authenticateToken, requireAdmin, orderTrackingController.getEmailLogs);

// Test
router.post('/admin/test-email', authenticateToken, requireAdmin, orderTrackingController.sendTestEmail);

// ==================== CUSTOMER ROUTES ====================

router.get('/customer/pending-orders', authenticateToken, orderTrackingController.getMyPendingOrders);

export default router;
