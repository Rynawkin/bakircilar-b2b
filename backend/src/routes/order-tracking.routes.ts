/**
 * Order Tracking Routes
 */

import { Router } from 'express';
import orderTrackingController from '../controllers/order-tracking.controller';
import warehouseWorkflowController from '../controllers/warehouse-workflow.controller';
import { authenticate, requirePermission } from '../middleware/auth.middleware';

const router = Router();

// ==================== ADMIN ROUTES ====================

// Settings - Only ADMIN/HEAD_ADMIN can modify
router.get('/admin/settings', authenticate, requirePermission('admin:order-tracking'), orderTrackingController.getSettings);
router.put('/admin/settings', authenticate, requirePermission('admin:order-tracking'), orderTrackingController.updateSettings);

// Sync & Email - Only ADMIN/HEAD_ADMIN
router.post('/admin/sync', authenticate, requirePermission('admin:order-tracking'), orderTrackingController.syncPendingOrders);
router.post('/admin/send-emails', authenticate, requirePermission('admin:order-tracking'), orderTrackingController.sendEmails);
router.post('/admin/send-customer-emails', authenticate, requirePermission('admin:order-tracking'), orderTrackingController.sendCustomerEmails);
router.post('/admin/send-supplier-emails', authenticate, requirePermission('admin:order-tracking'), orderTrackingController.sendSupplierEmails);
router.post('/admin/send-email/:customerCode', authenticate, requirePermission('admin:order-tracking'), orderTrackingController.sendEmailToCustomer);
router.post('/admin/sync-and-send', authenticate, requirePermission('admin:order-tracking'), orderTrackingController.syncAndSend);

// Data - All staff can view
router.get('/admin/pending-orders', authenticate, requirePermission('admin:order-tracking'), orderTrackingController.getAllPendingOrders);
router.get('/admin/summary', authenticate, requirePermission('admin:order-tracking'), orderTrackingController.getCustomerSummary);
router.get('/admin/supplier-summary', authenticate, requirePermission('admin:order-tracking'), orderTrackingController.getSupplierSummary);
router.get('/admin/email-logs', authenticate, requirePermission('admin:order-tracking'), orderTrackingController.getEmailLogs);
router.get('/admin/warehouse/overview', authenticate, requirePermission('admin:order-tracking'), warehouseWorkflowController.getOverview);
router.get('/admin/warehouse/orders/:mikroOrderNumber', authenticate, requirePermission('admin:order-tracking'), warehouseWorkflowController.getOrderDetail);
router.post('/admin/warehouse/orders/:mikroOrderNumber/start', authenticate, requirePermission('admin:order-tracking'), warehouseWorkflowController.startPicking);
router.patch('/admin/warehouse/orders/:mikroOrderNumber/items/:lineKey', authenticate, requirePermission('admin:order-tracking'), warehouseWorkflowController.updateItem);
router.post('/admin/warehouse/orders/:mikroOrderNumber/loaded', authenticate, requirePermission('admin:order-tracking'), warehouseWorkflowController.markLoaded);
router.post('/admin/warehouse/orders/:mikroOrderNumber/dispatched', authenticate, requirePermission('admin:order-tracking'), warehouseWorkflowController.markDispatched);

// Test - Only ADMIN/HEAD_ADMIN
router.post('/admin/test-email', authenticate, requirePermission('admin:order-tracking'), orderTrackingController.sendTestEmail);

// ==================== CUSTOMER ROUTES ====================

router.get('/customer/pending-orders', authenticate, orderTrackingController.getMyPendingOrders);

export default router;
