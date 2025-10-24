/**
 * Admin Routes
 */

import { Router } from 'express';
import adminController from '../controllers/admin.controller';
import {
  authenticate,
  requireAdmin,
  requireAdminOrManager,
  requireStaff,
  requireOrderApprover
} from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validation.middleware';
import { upload } from '../middleware/upload.middleware';
import { z } from 'zod';

const router = Router();

// Tüm route'lar authentication gerektirir, role kontrolü route bazında yapılır
router.use(authenticate);

// Validation schemas
const createCustomerSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(1, 'Name is required'),
  customerType: z.enum(['BAYI', 'PERAKENDE', 'VIP', 'OZEL']),
  mikroCariCode: z.string().min(1, 'Mikro cari code is required'),
});

const categoryPriceRuleSchema = z.object({
  categoryId: z.string().uuid(),
  customerType: z.enum(['BAYI', 'PERAKENDE', 'VIP', 'OZEL']),
  profitMargin: z.number().min(0).max(5), // 0-500% arası
});

const productPriceOverrideSchema = z.object({
  productId: z.string().uuid(),
  customerType: z.enum(['BAYI', 'PERAKENDE', 'VIP', 'OZEL']),
  profitMargin: z.number().min(0).max(5),
});

// Settings - ADMIN only
router.get('/settings', requireAdmin, adminController.getSettings);
router.put('/settings', requireAdmin, adminController.updateSettings);

// Sync - ADMIN only
router.post('/sync', requireAdmin, adminController.triggerSync);
router.post('/sync/images', requireAdmin, adminController.triggerImageSync);
router.get('/sync/status/:id', requireAdmin, adminController.getSyncStatus);

// Cari Sync - ADMIN only
router.post('/sync/cari', requireAdmin, adminController.triggerCariSync);
router.get('/sync/cari/status/:id', requireAdmin, adminController.getCariSyncStatus);
router.get('/sync/cari/latest', requireAdmin, adminController.getLatestCariSync);

// Cari list from Mikro - Staff (ADMIN, MANAGER, SALES_REP) - filtered by sector in controller
router.get('/cari-list', requireStaff, adminController.getCariList);

// Products - Staff (ADMIN, MANAGER, SALES_REP)
router.get('/products', requireStaff, adminController.getProducts);
router.post('/products/:id/image', requireAdminOrManager, upload.single('image'), adminController.uploadProductImage);
router.delete('/products/:id/image', requireAdminOrManager, adminController.deleteProductImage);

const updateCustomerSchema = z.object({
  email: z.string().email().optional(),
  customerType: z.enum(['BAYI', 'PERAKENDE', 'VIP', 'OZEL']).optional(),
  active: z.boolean().optional(),
});

// Customers - Staff for GET (filtered by sector), ADMIN/MANAGER for POST/PUT
router.get('/customers', requireStaff, adminController.getCustomers);
router.post('/customers', requireAdminOrManager, validateBody(createCustomerSchema), adminController.createCustomer);
router.put('/customers/:id', requireAdminOrManager, validateBody(updateCustomerSchema), adminController.updateCustomer);

// Orders - Staff for GET (filtered by sector), OrderApprover (ADMIN/SALES_REP) for approval
router.get('/orders', requireStaff, adminController.getAllOrders);
router.get('/orders/pending', requireStaff, adminController.getPendingOrders);
router.post('/orders/:id/approve', requireOrderApprover, adminController.approveOrder);
router.post('/orders/:id/reject', requireOrderApprover, adminController.rejectOrder);
router.post('/orders/:id/approve-items', requireOrderApprover, adminController.approveOrderItems);
router.post('/orders/:id/reject-items', requireOrderApprover, adminController.rejectOrderItems);

// Categories & Pricing - ADMIN/MANAGER only
router.get('/categories', requireAdminOrManager, adminController.getCategories);
router.post(
  '/categories/price-rule',
  requireAdminOrManager,
  validateBody(categoryPriceRuleSchema),
  adminController.setCategoryPriceRule
);
router.post(
  '/categories/bulk-price-rules',
  requireAdminOrManager,
  adminController.setBulkCategoryPriceRules
);
router.post(
  '/products/price-override',
  requireAdminOrManager,
  validateBody(productPriceOverrideSchema),
  adminController.setProductPriceOverride
);

// Dashboard stats - Staff (all can see their relevant data)
router.get('/dashboard/stats', requireStaff, adminController.getDashboardStats);

// Staff management
router.get('/sector-codes', requireAdminOrManager, adminController.getSectorCodes);
router.get('/staff', requireAdminOrManager, adminController.getStaffMembers);
router.post('/staff', requireAdminOrManager, adminController.createStaffMember);
router.put('/staff/:id', requireAdminOrManager, adminController.updateStaffMember);

// Bulk user creation from Mikro caris
router.get('/caris/available', requireAdmin, adminController.getAvailableCaris);
router.post('/users/bulk-create', requireAdmin, adminController.bulkCreateUsers);

export default router;
