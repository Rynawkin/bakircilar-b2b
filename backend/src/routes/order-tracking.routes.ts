/**
 * Order Tracking Routes
 */

import { Router } from 'express';
import orderTrackingController from '../controllers/order-tracking.controller';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';

const router = Router();

// ==================== ADMIN ROUTES ====================

// Settings
router.get('/admin/settings', authenticate, requireAdmin, orderTrackingController.getSettings);
router.put('/admin/settings', authenticate, requireAdmin, orderTrackingController.updateSettings);

// Sync & Email
router.post('/admin/sync', authenticate, requireAdmin, orderTrackingController.syncPendingOrders);
router.post('/admin/send-emails', authenticate, requireAdmin, orderTrackingController.sendEmails);
router.post('/admin/send-email/:customerCode', authenticate, requireAdmin, orderTrackingController.sendEmailToCustomer);
router.post('/admin/sync-and-send', authenticate, requireAdmin, orderTrackingController.syncAndSend);

// Data
router.get('/admin/pending-orders', authenticate, requireAdmin, orderTrackingController.getAllPendingOrders);
router.get('/admin/summary', authenticate, requireAdmin, orderTrackingController.getCustomerSummary);
router.get('/admin/email-logs', authenticate, requireAdmin, orderTrackingController.getEmailLogs);

// Test
router.post('/admin/test-email', authenticate, requireAdmin, orderTrackingController.sendTestEmail);

// ==================== CUSTOMER ROUTES ====================

router.get('/customer/pending-orders', authenticate, orderTrackingController.getMyPendingOrders);

export default router;
