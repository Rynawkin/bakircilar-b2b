/**
 * Admin Routes
 */

import { Router } from 'express';
import adminController from '../controllers/admin.controller';
import bundleController from '../controllers/bundle.controller';
import quoteController from '../controllers/quote.controller';
import taskController from '../controllers/task.controller';
import notificationController from '../controllers/notification.controller';
import eInvoiceController from '../controllers/einvoice.controller';
import agreementController from '../controllers/agreement.controller';
import supplierPriceListController from '../controllers/supplier-price-list.controller';
import supplierCostController from '../controllers/supplier-cost.controller';
import priceVerificationController from '../controllers/price-verification.controller';
import tenderCostController from '../controllers/tender-cost.controller';
import productComplementController from '../controllers/product-complement.controller';
import operationsIntelligenceController from '../controllers/operations-intelligence.controller';
import auditLogController from '../controllers/audit-log.controller';
import marginViolationController from '../controllers/margin-violation.controller';
import productDimensionsController from '../controllers/product-dimensions.controller';
import stockCreateController from '../controllers/stock-create.controller';
import hotSaleController from '../controllers/hot-sale.controller';
import stockFamilyController from '../controllers/stock-family.controller';
import {
  authenticate,
  requireAdmin,
  requirePermission,
  requireAnyPermission
} from '../middleware/auth.middleware';
import bannerController from '../controllers/banner.controller';
import giftCampaignController from '../controllers/gift-campaign.controller';
import collectionController from '../controllers/collection.controller';
import salesCatalogController from '../controllers/sales-catalog.controller';
import { trackStaffApiActivity } from '../middleware/staff-activity.middleware';
import { invalidateCacheMiddleware } from '../middleware/cache.middleware';
import { validateBody } from '../middleware/validation.middleware';
import { upload, taskUpload, invoiceUpload, supplierPriceListUpload, quoteItemImageUpload } from '../middleware/upload.middleware';
import { z } from 'zod';

const router = Router();

// TÃ¼m route'lar authentication gerektirir, role kontrolÃ¼ route bazÄ±nda yapÄ±lÄ±r
router.use(authenticate);
router.use(trackStaffApiActivity);

// Stok ailesi yonlendirme onerisi (teklif/siparis girisinde, salt-okuma)
router.post(
  '/stock-family/suggestions',
  requireAnyPermission(['admin:quotes', 'admin:orders', 'admin:field-sales']),
  (req, res) => stockFamilyController.suggestions(req, res)
);

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
  token: z.string().min(1).optional(),
  endpoint: z.string().min(1).optional(),
  subscription: z.object({
    endpoint: z.string().min(1),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }).optional(),
  platform: z.string().optional(),
  appName: z.string().optional(),
  deviceName: z.string().optional(),
});

const notificationPreferenceSchema = z.object({
  preferences: z.array(z.object({
    category: z.string().min(1),
    enabled: z.boolean(),
  })),
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

const productCustomerVisibilitySchema = z.object({
  hiddenFromCustomers: z.boolean(),
});

const productAdminFlagsSchema = z.object({
  isFeatured: z.boolean().optional(),
  featuredOrder: z.number().int().optional(),
  excludeFromDiscount: z.boolean().optional(),
});

const complementRecommendationSchema = z.object({
  productCodes: z.array(z.string()).min(1),
  excludeCodes: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

// Settings - ADMIN only (hero gecis suresi Settings'te; degisince /banners cache'ini temizle)
router.get('/settings', requirePermission('admin:settings'), adminController.getSettings);
router.put('/settings', requirePermission('admin:settings'), invalidateCacheMiddleware(['banners:*']), adminController.updateSettings);

// Zamanlanmis isler (scheduled jobs): listeleme + zamanlama override + manuel tetikleme
// NOT: /scheduled-jobs/:key/run (spesifik alt-yol) :key param yolundan sonra gelse de method+path farkli oldugu icin cakismaz
router.get('/scheduled-jobs', requirePermission('admin:settings'), adminController.getScheduledJobs);
router.put('/scheduled-jobs/:key/schedule', requirePermission('admin:settings'), adminController.setScheduledJobSchedule);
router.post('/scheduled-jobs/:key/run', requirePermission('admin:settings'), adminController.runScheduledJob);
router.get('/audit-logs', requirePermission('admin:settings'), auditLogController.list);

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
// Ana saglayici (main supplier) bazli isim eslesmesi (SADECE OKUMA)
router.get('/supplier-price-lists/main-suppliers', requirePermission('admin:supplier-price-lists'), supplierPriceListController.getMainSuppliers);
router.get('/supplier-price-lists/main-suppliers/products', requirePermission('admin:supplier-price-lists'), supplierPriceListController.searchMainSupplierProducts);
// Global urun arama (elle duzeltme picker'i "Tum urunler" modu) — /:id'den ONCE olmali (SADECE OKUMA)
router.get('/supplier-price-lists/products/search', requirePermission('admin:supplier-price-lists'), supplierPriceListController.searchAllProducts);
router.get('/supplier-price-lists', requirePermission('admin:supplier-price-lists'), supplierPriceListController.listUploads);
router.post('/supplier-price-lists/preview', requirePermission('admin:supplier-price-lists'), supplierPriceListUpload.array('files', 20), supplierPriceListController.previewPriceLists);
router.post('/supplier-price-lists/upload', requirePermission('admin:supplier-price-lists'), supplierPriceListUpload.array('files', 20), supplierPriceListController.uploadPriceLists);
router.post('/supplier-price-lists/apply-preview', requirePermission('admin:supplier-price-lists'), supplierPriceListController.applyPreview);
router.post('/supplier-price-lists/apply', requirePermission('admin:supplier-price-lists'), supplierPriceListController.apply);
router.patch('/supplier-price-lists/matches/:matchId', requirePermission('admin:supplier-price-lists'), supplierPriceListController.updateMatchUnitMultiplier);
// Elle duzeltme (B2B; Mikro YAZMA YOK)
router.patch('/supplier-price-lists/matches/:matchId/product', requirePermission('admin:supplier-price-lists'), supplierPriceListController.setMatchProduct);
router.delete('/supplier-price-lists/matches/:matchId', requirePermission('admin:supplier-price-lists'), supplierPriceListController.deleteMatch);
router.post('/supplier-price-lists/items/:itemId/match', requirePermission('admin:supplier-price-lists'), supplierPriceListController.assignItemProduct);
router.get('/supplier-price-lists/:id', requirePermission('admin:supplier-price-lists'), supplierPriceListController.getUpload);
router.get('/supplier-price-lists/:id/items', requirePermission('admin:supplier-price-lists'), supplierPriceListController.getUploadItems);
router.get('/supplier-price-lists/:id/export', requirePermission('admin:supplier-price-lists'), supplierPriceListController.exportUpload);

// Supplier cost pool
router.get('/supplier-costs/products/search', requirePermission('admin:supplier-costs'), supplierCostController.searchProducts);
router.get('/supplier-costs/suppliers/search', requirePermission('admin:supplier-costs'), supplierCostController.searchSuppliers);
router.get('/supplier-costs/reports', requirePermission('admin:supplier-costs'), supplierCostController.getReports);
router.post('/supplier-costs/import-price-list-matches', requirePermission('admin:supplier-costs'), supplierCostController.importLatestSupplierPriceLists);
router.post('/supplier-costs/attachments', requirePermission('admin:supplier-costs'), taskUpload.single('file'), supplierCostController.uploadAttachment);
router.get('/supplier-costs/products/:productCode', requirePermission('admin:supplier-costs'), supplierCostController.getProductDetail);
router.get('/supplier-costs', requirePermission('admin:supplier-costs'), supplierCostController.listCosts);
router.post('/supplier-costs', requirePermission('admin:supplier-costs'), supplierCostController.createCost);
router.put('/supplier-costs/:id', requirePermission('admin:supplier-costs'), supplierCostController.updateCost);
router.delete('/supplier-costs/:id', requirePermission('admin:supplier-costs'), supplierCostController.archiveCost);
router.post('/supplier-costs/:id/apply', requirePermission('admin:supplier-costs'), supplierCostController.applyCost);

// Price freshness verification workflow
const priceVerificationPermissions = ['admin:supplier-costs', 'admin:quotes', 'admin:orders', 'admin:field-sales'];
router.get('/price-verification/products/search', requireAnyPermission(priceVerificationPermissions), priceVerificationController.searchProducts);
router.get('/price-verification/suppliers/search', requireAnyPermission(priceVerificationPermissions), priceVerificationController.searchSuppliers);
router.get('/price-verification/customers/search', requireAnyPermission(priceVerificationPermissions), priceVerificationController.searchCustomers);
router.get('/price-verification/stock-metadata', requireAnyPermission(priceVerificationPermissions), priceVerificationController.getStockMetadata);
router.get('/price-verification/stock-lookups/:type', requireAnyPermission(priceVerificationPermissions), priceVerificationController.searchStockLookups);
router.post('/price-verification/stock-preview', requireAnyPermission(priceVerificationPermissions), priceVerificationController.previewStockPayload);
router.post('/price-verification/attachments', requireAnyPermission(priceVerificationPermissions), taskUpload.single('file'), priceVerificationController.uploadAttachment);
router.get('/price-verification/requests', requireAnyPermission(priceVerificationPermissions), priceVerificationController.listRequests);
router.post('/price-verification/requests', requireAnyPermission(priceVerificationPermissions), priceVerificationController.createRequest);
router.get('/price-verification/requests/:id', requireAnyPermission(priceVerificationPermissions), priceVerificationController.getRequest);
router.post('/price-verification/requests/:id/offers', requireAnyPermission(priceVerificationPermissions), priceVerificationController.addOffer);
router.post('/price-verification/requests/:id/submit-to-sales', requireAnyPermission(priceVerificationPermissions), priceVerificationController.submitToSales);
router.post('/price-verification/requests/:id/sales-decision', requireAnyPermission(priceVerificationPermissions), priceVerificationController.salesDecision);
router.post('/price-verification/requests/:id/mark-current', requireAnyPermission(priceVerificationPermissions), priceVerificationController.markCurrent);
router.post('/price-verification/requests/:id/complete', requireAnyPermission(priceVerificationPermissions), priceVerificationController.completeRequest);
router.post('/price-verification/requests/:id/cancel', requireAnyPermission(priceVerificationPermissions), priceVerificationController.cancelRequest);
router.post('/price-verification/requests/:id/notes', requireAnyPermission(priceVerificationPermissions), priceVerificationController.addNote);

// Tender cost requests
router.get('/tender-cost-requests', requireAnyPermission(priceVerificationPermissions), tenderCostController.listRequests);
router.post('/tender-cost-requests', requireAnyPermission(priceVerificationPermissions), tenderCostController.createRequest);
router.get('/tender-cost-requests/:id', requireAnyPermission(priceVerificationPermissions), tenderCostController.getRequest);
router.post('/tender-cost-requests/:id/items/:itemId/offers', requireAnyPermission(priceVerificationPermissions), tenderCostController.addOffer);
router.post('/tender-cost-requests/:id/complete', requireAnyPermission(priceVerificationPermissions), tenderCostController.completeRequest);
router.post('/tender-cost-requests/:id/cancel', requireAnyPermission(priceVerificationPermissions), tenderCostController.cancelRequest);
router.post('/tender-cost-requests/:id/notes', requireAnyPermission(priceVerificationPermissions), tenderCostController.addNote);

// Products - Staff (ADMIN, MANAGER, SALES_REP) + DIVERSEY
router.get('/products', requireAnyPermission(['admin:products', 'admin:quotes', 'dashboard:diversey-stok', 'reports:cost-update-all-products']), adminController.getProducts);
router.post(
  '/products/by-codes',
  requireAnyPermission(['admin:quotes', 'admin:products', 'reports:cost-update-all-products']),
  validateBody(productCodesSchema),
  adminController.getProductsByCodes
);
router.post('/products/image-sync', requirePermission('admin:products'), adminController.triggerSelectedImageSync);
router.patch(
  '/products/:id/customer-visibility',
  requirePermission('admin:products'),
  validateBody(productCustomerVisibilitySchema),
  adminController.updateProductCustomerVisibility
);
router.patch(
  '/products/:id/flags',
  requirePermission('admin:products'),
  validateBody(productAdminFlagsSchema),
  adminController.updateProductFlags
);
router.post('/products/:id/image', requireAnyPermission(['admin:products', 'admin:order-tracking']), upload.single('image'), adminController.uploadProductImage);

// Urun galerisi (coklu gorsel) — ayni yetki setiyle (admin urunler + resim talepleri fixerlari)
router.get('/products/:id/images', requireAnyPermission(['admin:products', 'admin:order-tracking']), adminController.listProductImages);
router.post('/products/:id/images', requireAnyPermission(['admin:products', 'admin:order-tracking']), upload.single('image'), adminController.addProductImage);
router.patch('/products/:id/images/reorder', requireAnyPermission(['admin:products', 'admin:order-tracking']), adminController.reorderProductImages);
router.patch('/products/:id/images/:imageId/primary', requireAnyPermission(['admin:products', 'admin:order-tracking']), adminController.setPrimaryProductImage);
router.delete('/products/:id/images/:imageId', requireAnyPermission(['admin:products', 'admin:order-tracking']), adminController.deleteProductGalleryImage);

// Paketler (bundle) — admin CRUD (gorsel zorunlu; multipart)
router.get('/bundles', requirePermission('admin:products'), bundleController.list);
router.post('/bundles', requirePermission('admin:products'), upload.single('image'), bundleController.create);
router.put('/bundles/:id', requirePermission('admin:products'), upload.single('image'), bundleController.update);
router.delete('/bundles/:id', requirePermission('admin:products'), bundleController.remove);

router.get('/stock-create/metadata', requirePermission('admin:stock-create'), stockCreateController.getMetadata);
router.get('/stock-create/history', requirePermission('admin:stock-create'), stockCreateController.getHistory);
router.get('/stock-create/stocks/:stockCode', requirePermission('admin:stock-create'), stockCreateController.getStock);
router.put('/stock-create/stocks/:stockCode', requirePermission('admin:stock-create'), stockCreateController.updateStock);
router.get('/stock-create/templates/:templateCode', requirePermission('admin:stock-create'), stockCreateController.getTemplate);
router.get('/stock-create/lookups/:type', requirePermission('admin:stock-create'), stockCreateController.searchLookups);
router.post('/stock-create/preview', requirePermission('admin:stock-create'), stockCreateController.preview);
router.post('/stock-create/create', requirePermission('admin:stock-create'), upload.single('image'), stockCreateController.create);
router.get('/stock-create/passive', requirePermission('admin:stock-create'), stockCreateController.listPassiveStocks);
router.post('/stock-create/activate', requirePermission('admin:stock-create'), upload.single('image'), stockCreateController.activate);

router.get('/product-dimensions/products', requirePermission('admin:product-dimensions'), productDimensionsController.searchProducts);
router.get('/product-dimensions/missing', requirePermission('admin:product-dimensions'), productDimensionsController.getMissingProducts);
router.get('/product-dimensions/shelves', requirePermission('admin:product-dimensions'), productDimensionsController.searchShelves);
router.get('/product-dimensions/unit-names', requirePermission('admin:product-dimensions'), productDimensionsController.getUnitNames);
// Ucarer depo ekrani da urun olcu detayini okuyup guncelleyebilsin (reports:ucarer-depo)
router.get('/product-dimensions/products/:productCode', requireAnyPermission(['admin:product-dimensions', 'reports:ucarer-depo']), productDimensionsController.getProduct);
router.put('/product-dimensions/products/:productCode', requireAnyPermission(['admin:product-dimensions', 'reports:ucarer-depo']), productDimensionsController.updateProduct);
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

// Brands - customer editors need this list for price-list rules.
router.get('/brands', requireAnyPermission(['admin:price-rules', 'admin:customers']), adminController.getBrands);

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

const priceRuleBrandTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  brandCodes: z.array(z.string()).min(1),
  active: z.boolean().optional(),
});

const priceRuleBrandTemplateUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  brandCodes: z.array(z.string()).min(1).optional(),
  active: z.boolean().optional(),
});


// Customers - Staff for GET (filtered by sector), ADMIN/MANAGER for POST/PUT
router.get('/customers', requirePermission('admin:customers'), adminController.getCustomers);
router.post('/customers', requirePermission('admin:customers'), validateBody(createCustomerSchema), adminController.createCustomer);
router.put('/customers/:id', requirePermission('admin:customers'), validateBody(updateCustomerSchema), adminController.updateCustomer);
router.get(
  '/price-rule-brand-templates',
  requireAnyPermission(['admin:price-rules', 'admin:customers']),
  adminController.getPriceRuleBrandTemplates
);
router.post(
  '/price-rule-brand-templates',
  requirePermission('admin:price-rules'),
  validateBody(priceRuleBrandTemplateSchema),
  adminController.createPriceRuleBrandTemplate
);
router.put(
  '/price-rule-brand-templates/:id',
  requirePermission('admin:price-rules'),
  validateBody(priceRuleBrandTemplateUpdateSchema),
  adminController.updatePriceRuleBrandTemplate
);
router.delete(
  '/price-rule-brand-templates/:id',
  requirePermission('admin:price-rules'),
  adminController.deletePriceRuleBrandTemplate
);
// Fiyat listesi onerisi: motoru elle tetikle + musteri bazli manuel override (null = temizle)
router.post('/price-list-suggestions/run', requirePermission('admin:customers'), adminController.runPriceListSuggestions);
router.put('/customers/:id/price-list-suggestion', requirePermission('admin:customers'), adminController.setCustomerPriceListSuggestion);
router.get('/customer-360/search', requirePermission('admin:customers'), adminController.searchCustomer360);
router.get('/customer-360/:customerId', requirePermission('admin:customers'), adminController.getCustomer360);
router.get('/field-sales/customers', requirePermission('admin:field-sales'), adminController.searchFieldSalesCustomers);
router.get('/field-sales/products', requirePermission('admin:field-sales'), adminController.searchFieldSalesProducts);
router.get('/field-sales/products/:productCode', requirePermission('admin:field-sales'), adminController.getFieldSalesProduct);
router.post('/field-sales/visit-photo', requirePermission('admin:field-sales'), upload.single('image'), adminController.uploadFieldSalesVisitPhoto);
router.get('/field-sales/visits', requirePermission('admin:field-sales'), adminController.getFieldSalesVisits);
router.get('/field-sales/customers/:customerId', requirePermission('admin:field-sales'), adminController.getFieldSalesCustomer);
router.get('/field-sales/customers/:customerId/opportunities', requirePermission('admin:field-sales'), adminController.getFieldSalesOpportunities);
router.post('/field-sales/visit-customers', requirePermission('admin:field-sales'), adminController.createFieldSalesVisitCustomer);
router.get('/field-sales/customers/:customerId/visit-notes', requirePermission('admin:field-sales'), adminController.getFieldSalesVisitNotes);
router.post('/field-sales/customers/:customerId/visit-notes', requirePermission('admin:field-sales'), adminController.createFieldSalesVisitNote);
router.get('/hot-sales/dashboard', requirePermission('admin:hot-sales'), hotSaleController.dashboard);
router.get('/hot-sales/vehicles', requirePermission('admin:hot-sales'), hotSaleController.vehicles);
router.post('/hot-sales/vehicles', requirePermission('admin:hot-sales'), hotSaleController.saveVehicle);
router.get('/hot-sales/customers', requirePermission('admin:hot-sales'), hotSaleController.searchCustomers);
router.post('/hot-sales/customers', requirePermission('admin:hot-sales'), hotSaleController.createCustomer);
router.get('/hot-sales/products', requirePermission('admin:hot-sales'), hotSaleController.searchProducts);
router.get('/hot-sales/orders', requirePermission('admin:hot-sales'), hotSaleController.openOrders);
router.post('/hot-sales/sessions', requirePermission('admin:hot-sales'), hotSaleController.startSession);
router.get('/hot-sales/sessions/:sessionId', requirePermission('admin:hot-sales'), hotSaleController.sessionDetail);
router.post('/hot-sales/sessions/:sessionId/load', requirePermission('admin:hot-sales'), hotSaleController.addLoad);
router.post('/hot-sales/sessions/:sessionId/transactions', requirePermission('admin:hot-sales'), hotSaleController.createTransaction);
router.post('/hot-sales/sessions/:sessionId/order-delivery', requirePermission('admin:hot-sales'), hotSaleController.deliverOrder);
router.post('/hot-sales/sessions/:sessionId/close', requirePermission('admin:hot-sales'), hotSaleController.closeSession);
router.get('/hot-sales/vehicles/:vehicleId/inventory', requirePermission('admin:hot-sales'), hotSaleController.inventory);
router.get('/hot-sales/reconciliation', requirePermission('admin:hot-sales'), hotSaleController.reconciliation);
router.get('/hot-sales/reports/daily', requirePermission('admin:hot-sales'), hotSaleController.dailyReport);
router.post('/hot-sales/transactions/:transactionId/cancel-local', requirePermission('admin:hot-sales'), hotSaleController.cancelTransaction);
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
router.post('/quotes/category-last-purchases', requirePermission('admin:quotes'), quoteController.getCategoryLastPurchasesForCustomer);
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
router.post('/quotes/:id/customer-pdf-sent', requirePermission('admin:quotes'), quoteController.markCustomerPdfSent);
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
router.get('/notifications', notificationController.getNotifications);
router.get('/notifications/preferences', notificationController.getPreferences);
router.put('/notifications/preferences', validateBody(notificationPreferenceSchema), notificationController.updatePreferences);
router.post('/notifications/read', validateBody(notificationReadSchema), notificationController.markRead);
router.post('/notifications/read-all', notificationController.markAllRead);
router.get('/notifications/push/vapid-public-key', notificationController.getVapidPublicKey);
router.post('/notifications/push/register', validateBody(pushTokenSchema), notificationController.registerPushToken);
router.post('/notifications/push/unregister', validateBody(z.object({ token: z.string().min(1).optional(), endpoint: z.string().min(1).optional() })), notificationController.unregisterPushToken);
router.post('/notifications/push/test', validateBody(testPushSchema), notificationController.sendTestPush);

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
// İndirimli fiyatı son giriş maliyetinin altında kalan ürünler (hatalı/eski güncel maliyet tespiti)
router.get('/reports/discount-below-entry-cost', requirePermission('reports:cost-update-alerts'), adminController.getDiscountBelowEntryCostReport);
router.get('/reports/margin-compliance', requirePermission('reports:margin-compliance'), adminController.getMarginComplianceReport);
router.get('/reports/margin-compliance/export', requirePermission('reports:margin-compliance'), adminController.exportMarginComplianceReport);
router.get('/margin-violations', requirePermission('reports:margin-violations'), (req, res, next) => marginViolationController.list(req, res, next));
router.get('/margin-violations/dashboard', requirePermission('reports:margin-violations'), (req, res, next) => marginViolationController.dashboard(req, res, next));
router.get('/margin-violations/scorecard', requirePermission('reports:margin-violations'), (req, res, next) => marginViolationController.scorecard(req, res, next));
router.post('/margin-violations/generate', requirePermission('reports:margin-violations'), (req, res, next) => marginViolationController.generate(req, res, next));
router.post('/margin-violations/escalations/run', requirePermission('reports:margin-violations'), (req, res, next) => marginViolationController.runEscalations(req, res, next));
router.post('/margin-violations/proposals/:proposalId/decision', requirePermission('reports:margin-violations'), (req, res, next) => marginViolationController.decideExclusion(req, res, next));
router.post('/margin-violations/:id/claim', requirePermission('reports:margin-violations'), (req, res, next) => marginViolationController.claim(req, res, next));
router.post('/margin-violations/:id/notes', requirePermission('reports:margin-violations'), (req, res, next) => marginViolationController.addNote(req, res, next));
router.post('/margin-violations/:id/resolve', requirePermission('reports:margin-violations'), (req, res, next) => marginViolationController.resolve(req, res, next));
router.post('/margin-violations/:id/reopen', requirePermission('reports:margin-violations'), (req, res, next) => marginViolationController.reopen(req, res, next));
router.post('/margin-violations/:id/admin-close', requirePermission('reports:margin-violations'), (req, res, next) => marginViolationController.adminClose(req, res, next));
router.post('/margin-violations/:id/exclusion-proposals', requirePermission('reports:margin-violations'), (req, res, next) => marginViolationController.proposeExclusion(req, res, next));
router.post('/margin-violations/:id/price-verification', requirePermission('reports:margin-violations'), (req, res, next) => marginViolationController.openPriceVerification(req, res, next));
router.post('/reports/margin-compliance/sync', requirePermission('reports:margin-compliance'), adminController.syncMarginComplianceReport);
router.post('/reports/margin-compliance/email', requirePermission('reports:margin-compliance'), adminController.sendMarginComplianceReportEmail);
// Marj raporu dislama kurallari (marka / stok kodu / stok adi) - rapor sayfasindan yonetilir
router.get('/reports/margin-compliance/exclusions', requirePermission('reports:margin-compliance'), adminController.getMarginExclusions);
router.post('/reports/margin-compliance/exclusions', requirePermission('reports:margin-compliance'), adminController.createMarginExclusion);
router.delete('/reports/margin-compliance/exclusions/:id', requirePermission('reports:margin-compliance'), adminController.deleteMarginExclusion);
router.get('/reports/margin-compliance/exclusion-options', requirePermission('reports:margin-compliance'), adminController.getMarginExclusionOptions);
// Yapiskan iskonto raporu (son satis fiyati liste konumundan kopmus musteri x urun satirlari)
router.get('/reports/sticky-discounts', requirePermission('reports:margin-compliance'), adminController.getStickyDiscountsReport);
router.get('/reports/categories', requireAnyPermission(['reports:profit-analysis', 'reports:margin-compliance', 'reports:price-history', 'reports:cost-update-alerts', 'reports:top-products', 'reports:top-customers', 'reports:supplier-price-lists', 'reports:complement-missing', 'reports:customer-recovery', 'reports:ucarer-depo', 'reports:ucarer-minmax', 'reports:price-family-costs', 'admin:supplier-costs']), adminController.getReportCategories);
router.get('/reports/top-products', requirePermission('reports:top-products'), adminController.getTopProducts);
router.get('/reports/top-customers', requirePermission('reports:top-customers'), adminController.getTopCustomers);
router.get('/reports/product-customers/:productCode', requirePermission('reports:top-customers'), adminController.getProductCustomers);
router.get('/reports/complement-missing', requirePermission('reports:complement-missing'), adminController.getComplementMissingReport);
router.get('/reports/complement-missing/export', requirePermission('reports:complement-missing'), adminController.exportComplementMissingReport);
router.get('/reports/category-options', requirePermission('reports:complement-missing'), adminController.getCategoryOptions);
router.get('/reports/category-churn', requirePermission('reports:complement-missing'), adminController.getCategoryChurnReport);
router.get('/reports/category-churn/export', requirePermission('reports:complement-missing'), adminController.exportCategoryChurnReport);
router.get('/reports/category-churn/details', requirePermission('reports:complement-missing'), adminController.getCategoryChurnDetail);
router.get('/reports/category-opportunity', requirePermission('reports:complement-missing'), adminController.getCategoryOpportunityReport);
router.get('/reports/customer-recovery', requirePermission('reports:customer-recovery'), adminController.getCustomerRecoveryReport);
router.get('/reports/customer-recovery/historical-value', requirePermission('reports:customer-recovery'), adminController.getCustomerRecoveryHistoricalValueReport);
router.get('/reports/customer-recovery/historical-value/export', requirePermission('reports:customer-recovery'), adminController.exportCustomerRecoveryHistoricalValueReport);
router.get('/reports/customer-recovery/export', requirePermission('reports:customer-recovery'), adminController.exportCustomerRecoveryReport);
router.post('/reports/customer-recovery/bulk-assign', requirePermission('reports:customer-recovery'), adminController.bulkAssignCustomerRecovery);
router.get('/reports/customer-recovery/actions/assigned', requirePermission('reports:customer-recovery'), adminController.getAssignedCustomerRecoveryActions);
router.patch('/reports/customer-recovery/actions/:id', requirePermission('reports:customer-recovery'), adminController.updateCustomerRecoveryAction);
router.get('/reports/customer-recovery/:customerCode/detail', requirePermission('reports:customer-recovery'), adminController.getCustomerRecoveryDetail);
router.get('/reports/customer-recovery/:customerCode/actions', requirePermission('reports:customer-recovery'), adminController.getCustomerRecoveryActions);
router.post('/reports/customer-recovery/:customerCode/actions', requirePermission('reports:customer-recovery'), adminController.createCustomerRecoveryAction);
// Cari aktivite / temas raporu (satisci kendi sektoru; admin/yonetici tumu)
router.get('/reports/customer-engagement', requirePermission('reports:customer-engagement'), adminController.getCustomerEngagement);
router.post('/reports/customer-engagement/:code/contact', requirePermission('reports:customer-engagement'), adminController.addCustomerEngagementContact);
router.get('/reports/customer-engagement/:code/contacts', requirePermission('reports:customer-engagement'), adminController.getCustomerEngagementContacts);

router.get('/reports/customer-activity', requirePermission('reports:customer-activity'), adminController.getCustomerActivityReport);
router.get('/reports/staff-activity', requirePermission('reports:staff-activity'), adminController.getStaffActivityReport);
router.get('/reports/customer-carts', requirePermission('reports:customer-carts'), adminController.getCustomerCartsReport);
router.delete('/reports/customer-carts/:cartId/items', requirePermission('reports:customer-carts'), adminController.clearCustomerCart);
router.get(
  '/reports/action-radar',
  requireAnyPermission(['admin:quotes', 'reports:customer-carts', 'reports:complement-missing', 'admin:products', 'admin:field-sales', 'reports:ucarer-depo']),
  adminController.getActionRadar
);
router.get('/reports/ucarer-depo', requirePermission('reports:ucarer-depo'), adminController.getUcarerDepotReport);
router.get('/reports/ucarer-depo/operation-logs', requirePermission('reports:ucarer-depo'), adminController.getUcarerOperationLogs);
router.get('/reports/ucarer-incoming-order-details', requirePermission('reports:ucarer-depo'), adminController.getUcarerIncomingOrderDetails);
router.get('/reports/ucarer-supplier-recent-series', requirePermission('reports:ucarer-depo'), adminController.getUcarerSupplierRecentSeries);
router.post('/reports/ucarer-depo/order-product-change-requests', requirePermission('reports:ucarer-depo'), adminController.createUcarerOrderProductChangeRequests);
router.get('/order-product-change-requests', requireAnyPermission(['dashboard:orders', 'admin:orders', 'admin:quotes', 'admin:field-sales', 'reports:ucarer-depo']), adminController.getOrderProductChangeRequests);
router.post('/order-product-change-requests/:id/approve', requireAnyPermission(['dashboard:orders', 'admin:orders', 'admin:quotes', 'admin:field-sales', 'reports:ucarer-depo']), adminController.approveOrderProductChangeRequest);
router.post('/order-product-change-requests/:id/reject', requireAnyPermission(['dashboard:orders', 'admin:orders', 'admin:quotes', 'admin:field-sales', 'reports:ucarer-depo']), adminController.rejectOrderProductChangeRequest);
router.get('/reports/ucarer-product-sales-history', requirePermission('reports:ucarer-depo'), adminController.getUcarerProductSalesHistory);
router.post('/reports/ucarer-product-sales-history/mark-toplu', requirePermission('reports:ucarer-depo'), adminController.markUcarerSalesLineAsToplu);
router.get('/reports/ucarer-product-purchase-history', requirePermission('reports:ucarer-depo'), adminController.getUcarerProductPurchaseHistory);
// TOPLU denetim raporu: ritmik TOPLU alimlari cari x urun x ay geri tarar; unmark tek tusla topludan cikarir (Mikro yazma, loglu)
router.get('/reports/toplu-audit', requirePermission('reports:ucarer-depo'), adminController.getTopluAuditReport);
router.post('/reports/toplu-audit/unmark', requirePermission('reports:ucarer-depo'), adminController.unmarkTopluGroup);
// TOPLU aday tarama: TOPLU olmayan ani-sicrama satis satirlarini bulur; mark ile TOPLU isaretler (Mikro yazma, loglu)
router.get('/reports/toplu-candidates', requirePermission('reports:ucarer-depo'), adminController.getTopluCandidates);
router.post('/reports/toplu-candidates/mark', requirePermission('reports:ucarer-depo'), adminController.markTopluCandidateLines);
// Borc-mal takasi radari: vadesi gecmis cariler x satin alma ihtiyaci kesisimi (SALT OKUMA)
router.get('/reports/barter-radar', requirePermission('reports:ucarer-depo'), adminController.getBarterRadar);
// Talep deseni (A6): urunleri Syntetos-Boylan dortlusune siniflar + tek-cari payi (SALT OKUMA);
// apply-order-to-order topakli+tek-cari urunlere min=0 yazar + haric listesine ekler (MIKRO YAZMA, loglu)
router.get('/reports/demand-pattern', requirePermission('reports:ucarer-depo'), adminController.getDemandPatternReport);
router.post('/reports/demand-pattern/apply-order-to-order', requirePermission('reports:ucarer-depo'), adminController.applyDemandPatternOrderToOrder);
// Karsi depo min/max sorgusu (transfer kapisi rozeti icin; salt okuma)
router.get('/reports/ucarer-depot-minmax', requirePermission('reports:ucarer-depo'), adminController.getUcarerDepotMinMax);
router.post('/reports/ucarer-minmax/run', requirePermission('reports:ucarer-minmax'), adminController.runUcarerMinMaxReport);
router.get('/reports/ucarer-minmax/status', requirePermission('reports:ucarer-minmax'), adminController.getUcarerMinMaxJobStatus);
router.get('/reports/ucarer-minmax-excluded', requirePermission('reports:ucarer-depo'), adminController.getUcarerMinMaxExcludedProductsReport);
router.post('/reports/ucarer-minmax-exclusion', requirePermission('reports:ucarer-depo'), adminController.setUcarerMinMaxExclusion);
// Min-Max v2: B2B tarafinda paralel hesap motoru (SP'ye dokunmaz; yazma sadece kullanici onayli apply)
router.get('/minmax/preview', requirePermission('reports:ucarer-minmax'), adminController.getMinMaxV2Preview);
router.post('/minmax/apply', requirePermission('reports:ucarer-minmax'), adminController.applyMinMaxV2);
router.get('/minmax/overrides', requirePermission('reports:ucarer-minmax'), adminController.getMinMaxV2Overrides);
router.post('/minmax/overrides', requirePermission('reports:ucarer-minmax'), adminController.createMinMaxV2Override);
router.delete('/minmax/overrides/:id', requirePermission('reports:ucarer-minmax'), adminController.deleteMinMaxV2Override);
router.get('/minmax/settings', requirePermission('reports:ucarer-minmax'), adminController.getMinMaxV2Settings);
router.put('/minmax/settings', requirePermission('reports:ucarer-minmax'), adminController.updateMinMaxV2Settings);
// Min-Max kullanici haric tutma: stok kodlarini hesaplama disi birakir (B2B tarafi; Mikro'ya dokunmaz)
router.get('/minmax-exclusions', requirePermission('reports:ucarer-depo'), adminController.getMinMaxExclusions);
router.post('/minmax-exclusions', requirePermission('reports:ucarer-depo'), adminController.addMinMaxExclusions);
router.delete('/minmax-exclusions/:id', requirePermission('reports:ucarer-depo'), adminController.removeMinMaxExclusion);
router.get('/reports/product-families', requirePermission('reports:ucarer-depo'), adminController.getProductFamilies);
router.post('/reports/product-families', requirePermission('reports:ucarer-depo'), adminController.createProductFamily);
router.put('/reports/product-families/:id', requirePermission('reports:ucarer-depo'), adminController.updateProductFamily);
router.delete('/reports/product-families/:id', requirePermission('reports:ucarer-depo'), adminController.deleteProductFamily);
// Aday aile motoru: ailesiz urunlere pg_trgm benzerligiyle aile onerir; add-product oneriyi uygular (Mikro yazma YOK)
router.post('/stock-family/candidates', requirePermission('reports:ucarer-depo'), adminController.suggestFamilyCandidates);
// NOT: /stock-family/items/:itemId/... spesifik yol; :familyId param yolundan ONCE tanimli (Express eslesme sirasi)
router.put('/stock-family/items/:itemId/unit-factor', requirePermission('reports:ucarer-depo'), adminController.setFamilyItemUnitFactor);
router.post('/stock-family/:familyId/add-product', requirePermission('reports:ucarer-depo'), adminController.addProductToFamilyFromCandidate);
router.post('/stock-family/:familyId/remove-product', requirePermission('reports:ucarer-depo'), adminController.removeProductFromFamily);
// Aile yonetimi raporlari: oneri / kumeleme / outlier + birim tutarsizlik (SALT OKUMA + kucuk bakim yazmalari)
router.get('/reports/family-management/suggestions', requirePermission('reports:ucarer-depo'), adminController.getFamilySuggestionsReport);
router.get('/reports/family-management/clusters', requirePermission('reports:ucarer-depo'), adminController.getFamilyClustersReport);
router.get('/reports/family-management/outliers', requirePermission('reports:ucarer-depo'), adminController.getFamilyOutliersReport);
router.get('/reports/family-unit-mismatch', requirePermission('reports:ucarer-depo'), adminController.getFamilyUnitMismatch);
router.get('/reports/price-families', requirePermission('reports:price-family-costs'), adminController.getPriceFamilies);
router.post('/reports/price-families', requirePermission('reports:price-family-costs'), adminController.createPriceFamily);
router.put('/reports/price-families/:id', requirePermission('reports:price-family-costs'), adminController.updatePriceFamily);
router.delete('/reports/price-families/:id', requirePermission('reports:price-family-costs'), adminController.deletePriceFamily);
router.get('/reports/price-family-costs', requirePermission('reports:price-family-costs'), adminController.getPriceFamilyCostReport);
router.post('/reports/price-family-costs/update-cost', requirePermission('reports:price-family-costs'), adminController.updatePriceFamilyProductCost);
router.post('/reports/product-families/create-supplier-orders', requirePermission('reports:ucarer-depo'), adminController.createSupplierOrdersFromFamilies);
router.post('/reports/product-families/create-depot-transfer-order', requirePermission('reports:ucarer-depo'), adminController.createDepotTransferOrder);
router.post(
  '/reports/ucarer-depo/update-cost',
  requireAnyPermission(['reports:ucarer-depo', 'reports:cost-update-all-products']),
  adminController.updateUcarerProductCost
);
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
router.get(
  '/reports/price-margin-consistency',
  requirePermission('reports:cost-update-all-products'),
  adminController.getPriceMarginConsistency
);

// Report Exclusions - admin:exclusions VEYA marj raporu yetkisi (rapor ekranindan dislama yonetimi)
router.get('/exclusions', requireAnyPermission(['admin:exclusions', 'reports:margin-compliance']), adminController.getExclusions);
router.post('/exclusions', requireAnyPermission(['admin:exclusions', 'reports:margin-compliance']), adminController.createExclusion);
router.put('/exclusions/:id', requireAnyPermission(['admin:exclusions', 'reports:margin-compliance']), adminController.updateExclusion);
router.delete('/exclusions/:id', requireAnyPermission(['admin:exclusions', 'reports:margin-compliance']), adminController.deleteExclusion);

// Arama Yonetimi (bulunamayan terimler + urun arama takma adlari)
router.get('/search-misses', requirePermission('admin:search-management'), adminController.getSearchMisses);
router.patch('/search-misses/:id', requirePermission('admin:search-management'), adminController.updateSearchMiss);
router.get('/product-aliases', requirePermission('admin:search-management'), adminController.getProductAliases);
router.put('/product-aliases/:id', requirePermission('admin:search-management'), adminController.updateProductAliases);

// Banner yonetimi (musteri landing) - HEAD_ADMIN / ADMIN
// Mutasyonlar musteri /banners cache'ini temizler
router.get('/banners', requireAdmin, bannerController.listAll);
router.get('/banners/stats', requireAdmin, bannerController.stats);
router.post('/banners/upload', requireAdmin, upload.single('image'), bannerController.uploadImage);
router.post('/banners', requireAdmin, invalidateCacheMiddleware(['banners:*']), bannerController.create);
router.put('/banners/:id', requireAdmin, invalidateCacheMiddleware(['banners:*']), bannerController.update);
router.delete('/banners/:id', requireAdmin, invalidateCacheMiddleware(['banners:*']), bannerController.remove);

// Kategori kesfi gorseli - HEAD_ADMIN / ADMIN
router.patch('/categories/:id/image', requireAdmin, invalidateCacheMiddleware(['categories:*']), adminController.setCategoryImage);

// Hediyeli kampanya (GWP) yonetimi - HEAD_ADMIN / ADMIN
router.get('/gift-campaigns', requireAdmin, giftCampaignController.listAll);
router.get('/gift-campaigns/:id', requireAdmin, giftCampaignController.getOne);
router.post('/gift-campaigns', requireAdmin, giftCampaignController.create);
router.put('/gift-campaigns/:id', requireAdmin, giftCampaignController.update);
router.delete('/gift-campaigns/:id', requireAdmin, giftCampaignController.remove);

// Koleksiyon yonetimi ("Sizin icin koleksiyonlar") - HEAD_ADMIN / ADMIN
// Mutasyonlar musteri /collections/active cache'ini temizler
router.get('/collections', requireAdmin, collectionController.listAll);
router.get('/collections/:id', requireAdmin, collectionController.getOneAdmin);
router.post('/collections', requireAdmin, invalidateCacheMiddleware(['collections:*']), collectionController.create);
router.put('/collections/:id', requireAdmin, invalidateCacheMiddleware(['collections:*']), collectionController.update);
router.delete('/collections/:id', requireAdmin, invalidateCacheMiddleware(['collections:*']), collectionController.remove);

// Canli satis katalogu: B2B DB + public token gorunumu, Mikro yazimi yok.
router.get('/sales-catalogs', requirePermission('admin:campaigns'), salesCatalogController.listAdmin);
router.get('/sales-catalogs/:id', requirePermission('admin:campaigns'), salesCatalogController.getAdmin);
router.get('/sales-catalogs/:id/preview', requirePermission('admin:campaigns'), salesCatalogController.preview);
router.post('/sales-catalogs', requirePermission('admin:campaigns'), salesCatalogController.create);
router.put('/sales-catalogs/:id', requirePermission('admin:campaigns'), salesCatalogController.update);
router.post('/sales-catalogs/:id/rotate-token', requirePermission('admin:campaigns'), salesCatalogController.rotateToken);
router.get('/sales-catalogs/:id/share-links', requirePermission('admin:campaigns'), salesCatalogController.listShareLinks);
router.post('/sales-catalogs/:id/share-links', requirePermission('admin:campaigns'), salesCatalogController.createShareLink);
router.patch('/sales-catalogs/:id/share-links/:linkId', requirePermission('admin:campaigns'), salesCatalogController.updateShareLink);
router.post('/sales-catalogs/:id/share-links/:linkId/rotate-token', requirePermission('admin:campaigns'), salesCatalogController.rotateShareLinkToken);
router.get('/sales-catalogs/:id/share-links/:linkId/analytics', requirePermission('admin:campaigns'), salesCatalogController.getShareLinkAnalytics);
router.post('/sales-catalogs/:id/share-links/:linkId/visitors/:visitorId/block', requirePermission('admin:campaigns'), salesCatalogController.setVisitorBlock);
router.delete('/sales-catalogs/:id', requirePermission('admin:campaigns'), salesCatalogController.remove);

export default router;
