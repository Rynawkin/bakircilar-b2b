/**
 * Admin Routes
 */

import { Router } from 'express';
import adminController from '../controllers/admin.controller';
import quoteController from '../controllers/quote.controller';
import taskController from '../controllers/task.controller';
import notificationController from '../controllers/notification.controller';
import eInvoiceController from '../controllers/einvoice.controller';
import agreementController from '../controllers/agreement.controller';
import supplierPriceListController from '../controllers/supplier-price-list.controller';
import productComplementController from '../controllers/product-complement.controller';
import operationsIntelligenceController from '../controllers/operations-intelligence.controller';
import {
  authenticate,
  requirePermission,
  requireAnyPermission
} from '../middleware/auth.middleware';
import { trackStaffApiActivity } from '../middleware/staff-activity.middleware';
import { validateBody } from '../middleware/validation.middleware';
import { upload, taskUpload, invoiceUpload, supplierPriceListUpload, quoteItemImageUpload } from '../middleware/upload.middleware';
import { z } from 'zod';

const router = Router();

// TÃ¼m route'lar authentication gerektirir, role kontrolÃ¼ route bazÄ±nda yapÄ±lÄ±r
router.use(authenticate);
router.use(trackStaffApiActivity);

// Validation schemas
const createCustomerSchema = z.object({
  email: z.string().min(1, 'Email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(1, 'Name is required'),
  customerType: z.enum(['BAYI', 'PERAKENDE', 'VIP', 'OZEL']),
  mikroCariCode: z.string().min(1, 'Mikro cari code is required'),
  priceVisibility: z.enum(['INVOICED_ONLY', 'WHITE_ONLY', 'BOTH']).optional(),
});

const categoryPriceRuleSchema = z.object({
  categoryId: z.string().uuid(),
  customerType: z.enum(['BAYI', 'PERAKENDE', 'VIP', 'OZEL']),
  profitMargin: z.number().min(0).max(5), // 0-500% arasÄ±
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
  defaultView: taskViewSchema.optional(),
  colorRules: z.array(z.any()).optional(),
});

const notificationReadSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

const pushTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.string().optional(),
  appName: z.string().optional(),
  deviceName: z.string().optional(),
});

const testPushSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  body: z.string().max(500).optional(),
  linkUrl: z.string().max(500).optional(),
});

const complementUpdateSchema = z.object({
  mode: z.enum(['AUTO', 'MANUAL']).optional(),
  manualProductIds: z.array(z.string().uuid()).optional(),
  complementGroupCode: z.string().optional().nullable(),
});

const complementSyncSchema = z.object({
  months: z.number().int().min(1).max(60).optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

const productCodesSchema = z.object({
  codes: z.array(z.string()).min(1),
});

const complementRecommendationSchema = z.object({
  productCodes: z.array(z.string()).min(1),
  excludeCodes: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

// Settings - ADMIN only
router.get('/settings', requirePermission('admin:settings'), adminController.getSettings);
router.put('/settings', requirePermission('admin:settings'), adminController.updateSettings);

// Sync - ADMIN only
router.post('/sync', requireAnyPermission(['admin:sync', 'dashboard:sync']), adminController.triggerSync);
router.post('/sync/images', requireAnyPermission(['admin:sync', 'dashboard:sync']), adminController.triggerImageSync);
router.get('/sync/status/:id', requireAnyPermission(['admin:sync', 'dashboard:sync']), adminController.getSyncStatus);

// Cari Sync - ADMIN/SALES_REP
router.post('/sync/cari', requireAnyPermission(['admin:sync', 'dashboard:sync']), adminController.triggerCariSync);
router.get('/sync/cari/status/:id', requireAnyPermission(['admin:sync', 'dashboard:sync']), adminController.getCariSyncStatus);
router.get('/sync/cari/latest', requireAnyPermission(['admin:sync', 'dashboard:sync']), adminController.getLatestCariSync);

// Cari list from Mikro - Staff (ADMIN, MANAGER, SALES_REP) - filtered by sector in controller
router.get('/cari-list', requireAnyPermission(['admin:customers', 'admin:einvoices', 'admin:orders', 'admin:quotes']), adminController.getCariList);

// E-Invoice documents - Staff
router.get('/einvoices', requirePermission('admin:einvoices'), eInvoiceController.getDocuments);
router.post('/einvoices/upload', requirePermission('admin:einvoices'), invoiceUpload.array('files', 50), eInvoiceController.uploadDocuments);
router.post('/einvoices/auto-import', requirePermission('admin:einvoices'), eInvoiceController.autoImportDocuments);
router.post('/einvoices/bulk-download', requirePermission('admin:einvoices'), eInvoiceController.bulkDownloadDocuments);
router.get('/einvoices/:id/download', requirePermission('admin:einvoices'), eInvoiceController.downloadDocument);

// Supplier price lists
router.get('/supplier-price-lists/suppliers', requirePermission('admin:supplier-price-lists'), supplierPriceListController.getSuppliers);
router.post('/supplier-price-lists/suppliers', requirePermission('admin:supplier-price-lists'), supplierPriceListController.createSupplier);
router.put('/supplier-price-lists/suppliers/:id', requirePermission('admin:supplier-price-lists'), supplierPriceListController.updateSupplier);
router.get('/supplier-price-lists', requirePermission('admin:supplier-price-lists'), supplierPriceListController.listUploads);
router.post('/supplier-price-lists/preview', requirePermission('admin:supplier-price-lists'), supplierPriceListUpload.array('files', 20), supplierPriceListController.previewPriceLists);
router.post('/supplier-price-lists/upload', requirePermission('admin:supplier-price-lists'), supplierPriceListUpload.array('files', 20), supplierPriceListController.uploadPriceLists);
router.get('/supplier-price-lists/:id', requirePermission('admin:supplier-price-lists'), supplierPriceListController.getUpload);
router.get('/supplier-price-lists/:id/items', requirePermission('admin:supplier-price-lists'), supplierPriceListController.getUploadItems);
router.get('/supplier-price-lists/:id/export', requirePermission('admin:supplier-price-lists'), supplierPriceListController.exportUpload);

// Products - Staff (ADMIN, MANAGER, SALES_REP) + DIVERSEY
router.get('/products', requireAnyPermission(['admin:products', 'dashboard:diversey-stok']), adminController.getProducts);
router.post(
  '/products/by-codes',
  requireAnyPermission(['admin:quotes', 'admin:products']),
  validateBody(productCodesSchema),
  adminController.getProductsByCodes
);
router.post('/products/image-sync', requirePermission('admin:products'), adminController.triggerSelectedImageSync);
router.post('/products/:id/image', requireAnyPermission(['admin:products', 'admin:order-tracking']), upload.single('image'), adminController.uploadProductImage);
router.delete('/products/:id/image', requirePermission('admin:products'), adminController.deleteProductImage);
router.get('/products/:id/complements', requirePermission('admin:products'), productComplementController.getComplements);
router.put(
  '/products/:id/complements',
  requirePermission('admin:products'),
  validateBody(complementUpdateSchema),
  productComplementController.updateComplements
);
router.post(
  '/product-complements/sync',
  requirePermission('admin:products'),
  validateBody(complementSyncSchema),
  productComplementController.syncComplements
);
router.post(
  '/recommendations/complements',
  requireAnyPermission(['admin:quotes', 'reports:complement-missing']),
  validateBody(complementRecommendationSchema),
  adminController.getComplementRecommendations
);

// Brands - Admin/Manager
router.get('/brands', requirePermission('admin:price-rules'), adminController.getBrands);

const updateCustomerSchema = z.object({
  email: z.string().optional(),
  customerType: z.enum(['BAYI', 'PERAKENDE', 'VIP', 'OZEL']).optional(),
  active: z.boolean().optional(),
  invoicedPriceListNo: z.number().nullable().optional(),
  whitePriceListNo: z.number().nullable().optional(),
  priceVisibility: z.enum(['INVOICED_ONLY', 'WHITE_ONLY', 'BOTH']).optional(),
  useLastPrices: z.boolean().optional(),
  lastPriceGuardType: z.enum(['COST', 'PRICE_LIST']).optional(),
  lastPriceGuardInvoicedListNo: z.number().nullable().optional(),
  lastPriceGuardWhiteListNo: z.number().nullable().optional(),
  lastPriceCostBasis: z.enum(['CURRENT_COST', 'LAST_ENTRY']).optional(),
  lastPriceMinCostPercent: z.number().optional(),
});

const subUserCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
  password: z.string().min(6).optional(),
  autoCredentials: z.boolean().optional(),
  active: z.boolean().optional(),
});

const subUserUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().optional(),
  password: z.string().min(6).optional(),
  active: z.boolean().optional(),
});

const agreementSchema = z.object({
  customerId: z.string().uuid(),
  productId: z.string().uuid(),
  priceInvoiced: z.number().min(0),
  priceWhite: z.union([z.number(), z.string()]).optional().nullable(),
  customerProductCode: z.string().optional().nullable(),
  minQuantity: z.number().int().min(1).optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional().nullable(),
});

const agreementImportSchema = z.object({
  customerId: z.string().uuid(),
  rows: z.array(
    z.object({
      mikroCode: z.string().min(1),
      priceInvoiced: z.union([z.number(), z.string()]),
      priceWhite: z.union([z.number(), z.string()]).optional().nullable(),
      customerProductCode: z.string().optional().nullable(),
      minQuantity: z.union([z.number(), z.string()]).optional(),
      validFrom: z.string().optional().nullable(),
      validTo: z.string().optional().nullable(),
    })
  ).min(1),
});
const agreementBulkDeleteSchema = z.object({
  customerId: z.string().uuid(),
  ids: z.array(z.string().uuid()).optional(),
});

const customerPriceListRulesSchema = z.object({
  rules: z.array(
    z.object({
      brandCode: z.string().optional().nullable(),
      categoryId: z.string().optional().nullable(),
      invoicedPriceListNo: z.number(),
      whitePriceListNo: z.number(),
    })
  ),
});


// Customers - Staff for GET (filtered by sector), ADMIN/MANAGER for POST/PUT
router.get('/customers', requirePermission('admin:customers'), adminController.getCustomers);
router.post('/customers', requirePermission('admin:customers'), validateBody(createCustomerSchema), adminController.createCustomer);
router.put('/customers/:id', requirePermission('admin:customers'), validateBody(updateCustomerSchema), adminController.updateCustomer);
router.get('/customers/:id/price-list-rules', requirePermission('admin:customers'), adminController.getCustomerPriceListRules);
router.put(
  '/customers/:id/price-list-rules',
  requirePermission('admin:customers'),
  validateBody(customerPriceListRulesSchema),
  adminController.updateCustomerPriceListRules
);
router.get('/customers/:id/sub-users', requirePermission('admin:customers'), adminController.getCustomerSubUsers);
router.post('/customers/:id/sub-users', requirePermission('admin:customers'), validateBody(subUserCreateSchema), adminController.createCustomerSubUser);
router.put('/customers/sub-users/:id', requirePermission('admin:customers'), validateBody(subUserUpdateSchema), adminController.updateCustomerSubUser);
router.delete('/customers/sub-users/:id', requirePermission('admin:customers'), adminController.deleteCustomerSubUser);
router.post('/customers/sub-users/:id/reset-password', requirePermission('admin:customers'), adminController.resetCustomerSubUserPassword);
router.get('/customers/:id/contacts', requirePermission('admin:customers'), adminController.getCustomerContacts);
router.post('/customers/:id/contacts', requirePermission('admin:customers'), adminController.createCustomerContact);
router.put('/customers/:id/contacts/:contactId', requirePermission('admin:customers'), adminController.updateCustomerContact);
router.delete('/customers/:id/contacts/:contactId', requirePermission('admin:customers'), adminController.deleteCustomerContact);

// Orders - Staff for GET (filtered by sector), OrderApprover (ADMIN/SALES_REP) for approval
router.get('/orders', requirePermission('admin:orders'), adminController.getAllOrders);
router.get('/orders/pending', requirePermission('admin:orders'), adminController.getPendingOrders);
router.post('/orders/last-orders', requireAnyPermission(['admin:orders', 'admin:quotes']), adminController.getLastOrdersForCustomer);
router.get('/orders/:id', requirePermission('admin:orders'), adminController.getOrderById);
router.put('/orders/:id', requirePermission('admin:orders'), adminController.updateOrder);
router.post('/orders/manual', requirePermission('admin:orders'), adminController.createManualOrder);
router.post('/orders/:id/approve', requirePermission('admin:orders'), adminController.approveOrder);
router.post('/orders/:id/reject', requirePermission('admin:orders'), adminController.rejectOrder);
router.post('/orders/:id/approve-items', requirePermission('admin:orders'), adminController.approveOrderItems);
router.post('/orders/:id/reject-items', requirePermission('admin:orders'), adminController.rejectOrderItems);

// Quotes (Teklifler) - Staff for list/create, ADMIN for approval
router.get('/quotes/preferences', requirePermission('admin:quotes'), quoteController.getPreferences);
router.put('/quotes/preferences', requirePermission('admin:quotes'), quoteController.updatePreferences);
router.get('/quotes/responsibles', requirePermission('admin:quotes'), quoteController.getResponsibles);
router.get('/quotes/customer/:customerId/purchased-products', requirePermission('admin:quotes'), quoteController.getCustomerPurchasedProducts);
router.post('/quotes/last-quotes', requirePermission('admin:quotes'), quoteController.getLastQuotesForCustomer);
router.post('/quotes/items/upload-image', requirePermission('admin:quotes'), quoteItemImageUpload.single('image'), quoteController.uploadQuoteItemImage);
router.post('/quotes', requirePermission('admin:quotes'), quoteController.createQuote);
router.put('/quotes/:id', requirePermission('admin:quotes'), quoteController.updateQuote);
router.get('/quotes', requirePermission('admin:quotes'), quoteController.getQuotes);
router.get('/quotes/line-items', requirePermission('admin:quotes'), quoteController.getQuoteLineItems);
router.post('/quotes/line-items/close', requirePermission('admin:quotes'), quoteController.closeQuoteItems);
router.post('/quotes/line-items/reopen', requirePermission('admin:quotes'), quoteController.reopenQuoteItems);
router.get('/quotes/:id', requirePermission('admin:quotes'), quoteController.getQuoteById);
router.get('/quotes/:id/history', requirePermission('admin:quotes'), quoteController.getQuoteHistory);
router.post('/quotes/:id/sync', requirePermission('admin:quotes'), quoteController.syncQuoteFromMikro);
router.post('/quotes/:id/convert-to-order', requirePermission('admin:quotes'), quoteController.convertQuoteToOrder);
router.post('/quotes/:id/approve', requirePermission('admin:quotes'), quoteController.approveQuote);
router.post('/quotes/:id/reject', requirePermission('admin:quotes'), quoteController.rejectQuote);

// Tasks (Talepler) - Staff access
router.get('/tasks/preferences', requirePermission('admin:requests'), taskController.getPreferences);
router.put('/tasks/preferences', requirePermission('admin:requests'), validateBody(taskPreferencesSchema), taskController.updatePreferences);
router.get('/tasks/assignees', requirePermission('admin:requests'), taskController.getAssignees);
router.get('/tasks/templates', requirePermission('admin:requests'), taskController.getTemplates);
router.post('/tasks/templates', requirePermission('admin:requests'), validateBody(taskTemplateSchema), taskController.createTemplate);
router.put('/tasks/templates/:id', requirePermission('admin:requests'), validateBody(taskTemplateUpdateSchema), taskController.updateTemplate);
router.get('/tasks', requirePermission('admin:requests'), taskController.getTasks);
router.post('/tasks', requirePermission('admin:requests'), validateBody(createTaskSchema), taskController.createTask);
router.get('/tasks/:id', requirePermission('admin:requests'), taskController.getTaskById);
router.put('/tasks/:id', requirePermission('admin:requests'), validateBody(updateTaskSchema), taskController.updateTask);
router.post('/tasks/:id/comments', requirePermission('admin:requests'), validateBody(taskCommentSchema), taskController.addComment);
router.post('/tasks/:id/attachments', requirePermission('admin:requests'), taskUpload.single('file'), taskController.addAttachment);
router.post('/tasks/:id/links', requirePermission('admin:requests'), validateBody(taskLinkCreateSchema), taskController.addLink);
router.delete('/tasks/:id/links/:linkId', requirePermission('admin:requests'), taskController.deleteLink);

// Notifications
router.get('/notifications', requirePermission('admin:notifications'), notificationController.getNotifications);
router.post('/notifications/read', requirePermission('admin:notifications'), validateBody(notificationReadSchema), notificationController.markRead);
router.post('/notifications/read-all', requirePermission('admin:notifications'), notificationController.markAllRead);
router.post('/notifications/push/register', validateBody(pushTokenSchema), notificationController.registerPushToken);
router.post('/notifications/push/unregister', validateBody(z.object({ token: z.string().min(1) })), notificationController.unregisterPushToken);
router.post('/notifications/push/test', requirePermission('admin:notifications'), validateBody(testPushSchema), notificationController.sendTestPush);

// Exchange rates
router.get('/exchange/usd', requirePermission('admin:quotes'), adminController.getUsdSellingRate);

// Customer Agreements
router.get('/agreements', requirePermission('admin:agreements'), agreementController.getAgreements);
router.post('/agreements', requirePermission('admin:agreements'), validateBody(agreementSchema), agreementController.upsertAgreement);
router.delete('/agreements/:id', requirePermission('admin:agreements'), agreementController.deleteAgreement);
router.post('/agreements/bulk-delete', requirePermission('admin:agreements'), validateBody(agreementBulkDeleteSchema), agreementController.bulkDeleteAgreements);
router.post('/agreements/import', requirePermission('admin:agreements'), validateBody(agreementImportSchema), agreementController.importAgreements);

// Categories & Pricing - ADMIN/MANAGER only
router.get('/categories', requirePermission('admin:price-rules'), adminController.getCategories);
router.post(
  '/categories/price-rule',
  requirePermission('admin:price-rules'),
  validateBody(categoryPriceRuleSchema),
  adminController.setCategoryPriceRule
);




router.post(
  '/categories/bulk-price-rules',
  requirePermission('admin:price-rules'),
  adminController.setBulkCategoryPriceRules
);
router.post(
  '/products/price-override',
  requirePermission('admin:price-rules'),
  validateBody(productPriceOverrideSchema),
  adminController.setProductPriceOverride
);

// Dashboard stats - Staff (all can see their relevant data)
router.get('/dashboard/stats', requireAnyPermission(['dashboard:orders', 'dashboard:customers', 'dashboard:excess-stock', 'dashboard:sync', 'dashboard:stok-ara', 'dashboard:cari-ara', 'dashboard:ekstre', 'dashboard:diversey-stok']), adminController.getDashboardStats);

// Operations Intelligence - Command Center (A2, A3, A5, A7 + Ikame + Data Quality Firewall)
const operationsPermissions = ['admin:order-tracking', 'admin:orders', 'reports:customer-activity', 'admin:vade'];
router.get('/operations/command-center', requireAnyPermission(operationsPermissions), operationsIntelligenceController.getCommandCenter);
router.get('/operations/atp', requireAnyPermission(operationsPermissions), operationsIntelligenceController.getAtp);
router.get('/operations/orchestration', requireAnyPermission(operationsPermissions), operationsIntelligenceController.getOrchestration);
router.get('/operations/customer-intent', requireAnyPermission(operationsPermissions), operationsIntelligenceController.getCustomerIntent);
router.get('/operations/risk', requireAnyPermission(operationsPermissions), operationsIntelligenceController.getRisk);
router.get('/operations/substitution', requireAnyPermission(operationsPermissions), operationsIntelligenceController.getSubstitution);
router.get('/operations/data-quality', requireAnyPermission(operationsPermissions), operationsIntelligenceController.getDataQuality);

// Staff management
router.get('/sector-codes', requirePermission('admin:staff'), adminController.getSectorCodes);
router.get('/staff', requirePermission('admin:staff'), adminController.getStaffMembers);
router.post('/staff', requirePermission('admin:staff'), adminController.createStaffMember);
router.put('/staff/:id', requirePermission('admin:staff'), adminController.updateStaffMember);

// Bulk user creation from Mikro caris
router.get('/caris/available', requirePermission('admin:staff'), adminController.getAvailableCaris);
router.post('/users/bulk-create', requirePermission('admin:staff'), adminController.bulkCreateUsers);

// Reports - Staff (all can access reports)
router.get('/reports/cost-update-alerts', requirePermission('reports:cost-update-alerts'), adminController.getCostUpdateAlerts);
router.get('/reports/margin-compliance', requirePermission('reports:margin-compliance'), adminController.getMarginComplianceReport);
router.post('/reports/margin-compliance/sync', requirePermission('reports:margin-compliance'), adminController.syncMarginComplianceReport);
router.post('/reports/margin-compliance/email', requirePermission('reports:margin-compliance'), adminController.sendMarginComplianceReportEmail);
router.get('/reports/categories', requireAnyPermission(['reports:profit-analysis', 'reports:margin-compliance', 'reports:price-history', 'reports:cost-update-alerts', 'reports:top-products', 'reports:top-customers', 'reports:supplier-price-lists', 'reports:complement-missing', 'reports:ucarer-depo', 'reports:ucarer-minmax']), adminController.getReportCategories);
router.get('/reports/top-products', requirePermission('reports:top-products'), adminController.getTopProducts);
router.get('/reports/top-customers', requirePermission('reports:top-customers'), adminController.getTopCustomers);
router.get('/reports/product-customers/:productCode', requirePermission('reports:top-customers'), adminController.getProductCustomers);
router.get('/reports/complement-missing', requirePermission('reports:complement-missing'), adminController.getComplementMissingReport);
router.get('/reports/complement-missing/export', requirePermission('reports:complement-missing'), adminController.exportComplementMissingReport);
router.get('/reports/customer-activity', requirePermission('reports:customer-activity'), adminController.getCustomerActivityReport);
router.get('/reports/staff-activity', requirePermission('reports:staff-activity'), adminController.getStaffActivityReport);
router.get('/reports/customer-carts', requirePermission('reports:customer-carts'), adminController.getCustomerCartsReport);
router.get('/reports/ucarer-depo', requirePermission('reports:ucarer-depo'), adminController.getUcarerDepotReport);
router.post('/reports/ucarer-minmax/run', requirePermission('reports:ucarer-minmax'), adminController.runUcarerMinMaxReport);
router.get('/reports/product-families', requirePermission('reports:ucarer-depo'), adminController.getProductFamilies);
router.post('/reports/product-families', requirePermission('reports:ucarer-depo'), adminController.createProductFamily);
router.put('/reports/product-families/:id', requirePermission('reports:ucarer-depo'), adminController.updateProductFamily);
router.delete('/reports/product-families/:id', requirePermission('reports:ucarer-depo'), adminController.deleteProductFamily);
router.post('/reports/product-families/create-supplier-orders', requirePermission('reports:ucarer-depo'), adminController.createSupplierOrdersFromFamilies);
router.post('/reports/ucarer-depo/update-cost', requirePermission('reports:ucarer-depo'), adminController.updateUcarerProductCost);
router.post('/reports/ucarer-depo/update-main-supplier', requirePermission('reports:ucarer-depo'), adminController.updateUcarerMainSupplier);
// Price Sync endpoints
router.post('/price-sync', requirePermission('admin:price-sync'), adminController.syncPriceChanges);
router.get('/price-sync/status', requirePermission('admin:price-sync'), adminController.getPriceSyncStatus);

// New Price History endpoints (PostgreSQL based)
router.get('/reports/price-history-new', requirePermission('reports:price-history'), adminController.getPriceHistoryNew);
router.get('/reports/product-price-detail/:productCode', requirePermission('reports:price-history'), adminController.getProductPriceDetail);
router.get('/reports/price-summary-stats', requirePermission('reports:price-history'), adminController.getPriceSummaryStats);

// Old Price History endpoint (backward compatibility - Mikro based)
router.get('/reports/price-history', requirePermission('reports:price-history'), adminController.getPriceHistory);

// Report Exclusions - ADMIN only
router.get('/exclusions', requirePermission('admin:exclusions'), adminController.getExclusions);
router.post('/exclusions', requirePermission('admin:exclusions'), adminController.createExclusion);
router.put('/exclusions/:id', requirePermission('admin:exclusions'), adminController.updateExclusion);
router.delete('/exclusions/:id', requirePermission('admin:exclusions'), adminController.deleteExclusion);

export default router;
