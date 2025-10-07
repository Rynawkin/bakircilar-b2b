/**
 * Admin Routes
 */

import { Router } from 'express';
import adminController from '../controllers/admin.controller';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validation.middleware';
import { upload } from '../middleware/upload.middleware';
import { z } from 'zod';

const router = Router();

// Tüm admin route'lar authentication ve admin yetkisi gerektirir
router.use(authenticate, requireAdmin);

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

// Settings
router.get('/settings', adminController.getSettings);
router.put('/settings', adminController.updateSettings);

// Sync
router.post('/sync', adminController.triggerSync);

// Cari list from Mikro
router.get('/cari-list', adminController.getCariList);

// Products
router.get('/products', adminController.getProducts);
router.post('/products/:id/image', upload.single('image'), adminController.uploadProductImage);
router.delete('/products/:id/image', adminController.deleteProductImage);

// Customers
router.get('/customers', adminController.getCustomers);
router.post('/customers', validateBody(createCustomerSchema), adminController.createCustomer);

// Orders
router.get('/orders/pending', adminController.getPendingOrders);
router.post('/orders/:id/approve', adminController.approveOrder);
router.post('/orders/:id/reject', adminController.rejectOrder);

// Categories & Pricing
router.get('/categories', adminController.getCategories);
router.post(
  '/categories/price-rule',
  validateBody(categoryPriceRuleSchema),
  adminController.setCategoryPriceRule
);
router.post(
  '/products/price-override',
  validateBody(productPriceOverrideSchema),
  adminController.setProductPriceOverride
);

// Dashboard stats
router.get('/dashboard/stats', adminController.getDashboardStats);

export default router;
