/**
 * Order Tracking Routes
 */

import { Router } from 'express';
import orderTrackingController from '../controllers/order-tracking.controller';
import { authenticate, requireAdmin, requireStaff } from '../middleware/auth.middleware';

const router = Router();

// ==================== ADMIN ROUTES ====================

// Settings - Only ADMIN/HEAD_ADMIN can modify
router.get('/admin/settings', authenticate, requireStaff, orderTrackingController.getSettings);
router.put('/admin/settings', authenticate, requireAdmin, orderTrackingController.updateSettings);

// Sync & Email - Only ADMIN/HEAD_ADMIN
router.post('/admin/sync', authenticate, requireAdmin, orderTrackingController.syncPendingOrders);
router.post('/admin/send-emails', authenticate, requireAdmin, orderTrackingController.sendEmails);
router.post('/admin/send-customer-emails', authenticate, requireAdmin, orderTrackingController.sendCustomerEmails);
router.post('/admin/send-supplier-emails', authenticate, requireAdmin, orderTrackingController.sendSupplierEmails);
router.post('/admin/send-email/:customerCode', authenticate, requireAdmin, orderTrackingController.sendEmailToCustomer);
router.post('/admin/sync-and-send', authenticate, requireAdmin, orderTrackingController.syncAndSend);

// Data - All staff can view
router.get('/admin/pending-orders', authenticate, requireStaff, orderTrackingController.getAllPendingOrders);
router.get('/admin/summary', authenticate, requireStaff, orderTrackingController.getCustomerSummary);
router.get('/admin/supplier-summary', authenticate, requireStaff, orderTrackingController.getSupplierSummary);
router.get('/admin/email-logs', authenticate, requireStaff, orderTrackingController.getEmailLogs);

// Test - Only ADMIN/HEAD_ADMIN
router.post('/admin/test-email', authenticate, requireAdmin, orderTrackingController.sendTestEmail);

// ==================== CUSTOMER ROUTES ====================

router.get('/customer/pending-orders', authenticate, orderTrackingController.getMyPendingOrders);

export default router;
