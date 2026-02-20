/**
 * Order Tracking Routes
 */

import { Router } from 'express';
import orderTrackingController from '../controllers/order-tracking.controller';
import warehouseWorkflowController from '../controllers/warehouse-workflow.controller';
import { authenticate, requireAnyPermission, requirePermission } from '../middleware/auth.middleware';

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
router.get('/admin/warehouse/overview', authenticate, requireAnyPermission(['admin:order-tracking', 'admin:warehouse-kiosk']), warehouseWorkflowController.getOverview);
router.get('/admin/warehouse/dispatch-catalog', authenticate, requireAnyPermission(['admin:order-tracking', 'admin:warehouse-kiosk']), warehouseWorkflowController.getDispatchCatalog);
router.get('/admin/warehouse/dispatch-catalog/admin', authenticate, requirePermission('admin:order-tracking'), warehouseWorkflowController.getDispatchCatalogAdmin);
router.post('/admin/warehouse/dispatch-catalog/drivers', authenticate, requirePermission('admin:order-tracking'), warehouseWorkflowController.createDispatchDriver);
router.patch('/admin/warehouse/dispatch-catalog/drivers/:driverId', authenticate, requirePermission('admin:order-tracking'), warehouseWorkflowController.updateDispatchDriver);
router.delete('/admin/warehouse/dispatch-catalog/drivers/:driverId', authenticate, requirePermission('admin:order-tracking'), warehouseWorkflowController.deleteDispatchDriver);
router.post('/admin/warehouse/dispatch-catalog/vehicles', authenticate, requirePermission('admin:order-tracking'), warehouseWorkflowController.createDispatchVehicle);
router.patch('/admin/warehouse/dispatch-catalog/vehicles/:vehicleId', authenticate, requirePermission('admin:order-tracking'), warehouseWorkflowController.updateDispatchVehicle);
router.delete('/admin/warehouse/dispatch-catalog/vehicles/:vehicleId', authenticate, requirePermission('admin:order-tracking'), warehouseWorkflowController.deleteDispatchVehicle);
router.post('/admin/warehouse/sync', authenticate, requirePermission('admin:order-tracking'), orderTrackingController.syncPendingOrders);
router.get('/admin/warehouse/image-issues', authenticate, requirePermission('admin:order-tracking'), warehouseWorkflowController.getImageIssueReports);
router.patch('/admin/warehouse/image-issues/:reportId', authenticate, requirePermission('admin:order-tracking'), warehouseWorkflowController.updateImageIssueReport);
router.get('/admin/warehouse/orders/:mikroOrderNumber', authenticate, requireAnyPermission(['admin:order-tracking', 'admin:warehouse-kiosk']), warehouseWorkflowController.getOrderDetail);
router.post('/admin/warehouse/orders/:mikroOrderNumber/start', authenticate, requireAnyPermission(['admin:order-tracking', 'admin:warehouse-kiosk']), warehouseWorkflowController.startPicking);
router.patch('/admin/warehouse/orders/:mikroOrderNumber/items/:lineKey', authenticate, requireAnyPermission(['admin:order-tracking', 'admin:warehouse-kiosk']), warehouseWorkflowController.updateItem);
router.post('/admin/warehouse/orders/:mikroOrderNumber/items/:lineKey/report-image-issue', authenticate, requireAnyPermission(['admin:order-tracking', 'admin:warehouse-kiosk']), warehouseWorkflowController.reportImageIssue);
router.post('/admin/warehouse/orders/:mikroOrderNumber/loaded', authenticate, requireAnyPermission(['admin:order-tracking', 'admin:warehouse-kiosk']), warehouseWorkflowController.markLoaded);
router.post('/admin/warehouse/orders/:mikroOrderNumber/dispatched', authenticate, requireAnyPermission(['admin:order-tracking', 'admin:warehouse-kiosk']), warehouseWorkflowController.markDispatched);
router.get('/admin/warehouse/retail/products', authenticate, requireAnyPermission(['admin:order-tracking', 'admin:warehouse-retail']), warehouseWorkflowController.searchRetailProducts);
router.post('/admin/warehouse/retail/sales', authenticate, requireAnyPermission(['admin:order-tracking', 'admin:warehouse-retail']), warehouseWorkflowController.createRetailSale);

// Test - Only ADMIN/HEAD_ADMIN
router.post('/admin/test-email', authenticate, requirePermission('admin:order-tracking'), orderTrackingController.sendTestEmail);

// ==================== CUSTOMER ROUTES ====================

router.get('/customer/pending-orders', authenticate, orderTrackingController.getMyPendingOrders);

export default router;
