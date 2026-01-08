/**
 * Admin Routes
 */

import { Router } from 'express';
import adminController from '../controllers/admin.controller';
import quoteController from '../controllers/quote.controller';
import taskController from '../controllers/task.controller';
import {
  authenticate,
  requireAdmin,
  requireAdminOrManager,
  requireStaff,
  requireOrderApprover,
  requireStaffOrDiversey
} from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validation.middleware';
import { upload, taskUpload } from '../middleware/upload.middleware';
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

const taskStatusSchema = z.enum(['NEW', 'TRIAGE', 'IN_PROGRESS', 'WAITING', 'REVIEW', 'DONE', 'CANCELLED']);
const taskPrioritySchema = z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT']);
const taskTypeSchema = z.enum([
  'BUG',
  'IMPROVEMENT',
  'FEATURE',
  'OPERATION',
  'PROCUREMENT',
  'REPORT',
  'DATA_SYNC',
  'ACCESS',
  'DESIGN_UX',
  'OTHER',
]);
const taskVisibilitySchema = z.enum(['PUBLIC', 'INTERNAL']);
const taskLinkTypeSchema = z.enum(['PRODUCT', 'QUOTE', 'ORDER', 'CUSTOMER', 'PAGE', 'OTHER']);
const taskViewSchema = z.enum(['KANBAN', 'LIST']);

const taskLinkSchema = z.object({
  type: taskLinkTypeSchema,
  label: z.string().optional(),
  referenceId: z.string().optional(),
  referenceCode: z.string().optional(),
  referenceUrl: z.string().optional(),
});

const createTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  type: taskTypeSchema.optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  dueDate: z.string().optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  templateId: z.string().uuid().optional().nullable(),
  links: z.array(taskLinkSchema).optional(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  type: taskTypeSchema.optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  dueDate: z.string().optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
});

const taskCommentSchema = z.object({
  body: z.string().min(1),
  visibility: taskVisibilitySchema.optional(),
});

const taskLinkCreateSchema = z.object({
  type: taskLinkTypeSchema,
  label: z.string().optional(),
  referenceId: z.string().optional(),
  referenceCode: z.string().optional(),
  referenceUrl: z.string().optional(),
});

const taskTemplateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  type: taskTypeSchema,
  priority: taskPrioritySchema.optional(),
  defaultStatus: taskStatusSchema.optional(),
  isActive: z.boolean().optional(),
});

const taskTemplateUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  type: taskTypeSchema.optional(),
  priority: taskPrioritySchema.optional(),
  defaultStatus: taskStatusSchema.optional(),
  isActive: z.boolean().optional(),
});

const taskPreferencesSchema = z.object({
  defaultView: taskViewSchema,
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

// Products - Staff (ADMIN, MANAGER, SALES_REP) + DIVERSEY
router.get('/products', requireStaffOrDiversey, adminController.getProducts);
router.post('/products/image-sync', requireAdminOrManager, adminController.triggerSelectedImageSync);
router.post('/products/:id/image', requireAdminOrManager, upload.single('image'), adminController.uploadProductImage);
router.delete('/products/:id/image', requireAdminOrManager, adminController.deleteProductImage);

const updateCustomerSchema = z.object({
  email: z.string().email().optional(),
  customerType: z.enum(['BAYI', 'PERAKENDE', 'VIP', 'OZEL']).optional(),
  active: z.boolean().optional(),
});

// Customers - Staff for GET (filtered by sector), ADMIN/MANAGER for POST/PUT
router.get('/customers', requireStaff, adminController.getCustomers);
router.post('/customers', requireStaff, validateBody(createCustomerSchema), adminController.createCustomer);
router.put('/customers/:id', requireAdminOrManager, validateBody(updateCustomerSchema), adminController.updateCustomer);
router.get('/customers/:id/contacts', requireStaff, adminController.getCustomerContacts);
router.post('/customers/:id/contacts', requireStaff, adminController.createCustomerContact);
router.put('/customers/:id/contacts/:contactId', requireStaff, adminController.updateCustomerContact);
router.delete('/customers/:id/contacts/:contactId', requireStaff, adminController.deleteCustomerContact);

// Orders - Staff for GET (filtered by sector), OrderApprover (ADMIN/SALES_REP) for approval
router.get('/orders', requireStaff, adminController.getAllOrders);
router.get('/orders/pending', requireStaff, adminController.getPendingOrders);
router.post('/orders/:id/approve', requireOrderApprover, adminController.approveOrder);
router.post('/orders/:id/reject', requireOrderApprover, adminController.rejectOrder);
router.post('/orders/:id/approve-items', requireOrderApprover, adminController.approveOrderItems);
router.post('/orders/:id/reject-items', requireOrderApprover, adminController.rejectOrderItems);

// Quotes (Teklifler) - Staff for list/create, ADMIN for approval
router.get('/quotes/preferences', requireStaff, quoteController.getPreferences);
router.put('/quotes/preferences', requireStaff, quoteController.updatePreferences);
router.get('/quotes/responsibles', requireStaff, quoteController.getResponsibles);
router.get('/quotes/customer/:customerId/purchased-products', requireStaff, quoteController.getCustomerPurchasedProducts);
router.post('/quotes', requireStaff, quoteController.createQuote);
router.get('/quotes', requireStaff, quoteController.getQuotes);
router.get('/quotes/:id', requireStaff, quoteController.getQuoteById);
router.post('/quotes/:id/sync', requireStaff, quoteController.syncQuoteFromMikro);
router.post('/quotes/:id/approve', requireAdmin, quoteController.approveQuote);
router.post('/quotes/:id/reject', requireAdmin, quoteController.rejectQuote);

// Tasks (Talepler) - Staff access
router.get('/tasks/preferences', requireStaff, taskController.getPreferences);
router.put('/tasks/preferences', requireStaff, validateBody(taskPreferencesSchema), taskController.updatePreferences);
router.get('/tasks/assignees', requireStaff, taskController.getAssignees);
router.get('/tasks/templates', requireStaff, taskController.getTemplates);
router.post('/tasks/templates', requireAdminOrManager, validateBody(taskTemplateSchema), taskController.createTemplate);
router.put('/tasks/templates/:id', requireAdminOrManager, validateBody(taskTemplateUpdateSchema), taskController.updateTemplate);
router.get('/tasks', requireStaff, taskController.getTasks);
router.post('/tasks', requireStaff, validateBody(createTaskSchema), taskController.createTask);
router.get('/tasks/:id', requireStaff, taskController.getTaskById);
router.put('/tasks/:id', requireStaff, validateBody(updateTaskSchema), taskController.updateTask);
router.post('/tasks/:id/comments', requireStaff, validateBody(taskCommentSchema), taskController.addComment);
router.post('/tasks/:id/attachments', requireStaff, taskUpload.single('file'), taskController.addAttachment);
router.post('/tasks/:id/links', requireStaff, validateBody(taskLinkCreateSchema), taskController.addLink);
router.delete('/tasks/:id/links/:linkId', requireStaff, taskController.deleteLink);

// Exchange rates
router.get('/exchange/usd', requireStaff, adminController.getUsdSellingRate);

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

// Reports - Staff (all can access reports)
router.get('/reports/cost-update-alerts', requireStaff, adminController.getCostUpdateAlerts);
router.get('/reports/margin-compliance', requireStaff, adminController.getMarginComplianceReport);
router.get('/reports/categories', requireStaff, adminController.getReportCategories);
router.get('/reports/top-products', requireStaff, adminController.getTopProducts);
router.get('/reports/top-customers', requireStaff, adminController.getTopCustomers);
router.get('/reports/product-customers/:productCode', requireStaff, adminController.getProductCustomers);
// Price Sync endpoints
router.post('/price-sync', requireAdmin, adminController.syncPriceChanges);
router.get('/price-sync/status', requireStaff, adminController.getPriceSyncStatus);

// New Price History endpoints (PostgreSQL based)
router.get('/reports/price-history-new', requireStaff, adminController.getPriceHistoryNew);
router.get('/reports/product-price-detail/:productCode', requireStaff, adminController.getProductPriceDetail);
router.get('/reports/price-summary-stats', requireStaff, adminController.getPriceSummaryStats);

// Old Price History endpoint (backward compatibility - Mikro based)
router.get('/reports/price-history', requireStaff, adminController.getPriceHistory);

// Report Exclusions - ADMIN only
router.get('/exclusions', requireAdmin, adminController.getExclusions);
router.post('/exclusions', requireAdmin, adminController.createExclusion);
router.put('/exclusions/:id', requireAdmin, adminController.updateExclusion);
router.delete('/exclusions/:id', requireAdmin, adminController.deleteExclusion);

export default router;
