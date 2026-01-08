/**
 * Customer Routes
 */

import { Router } from 'express';
import customerController from '../controllers/customer.controller';
import quoteController from '../controllers/quote.controller';
import taskController from '../controllers/task.controller';
import { authenticate, requireCustomer } from '../middleware/auth.middleware';
import { taskUpload } from '../middleware/upload.middleware';
import { validateBody } from '../middleware/validation.middleware';
import { cacheMiddleware, invalidateCacheMiddleware } from '../middleware/cache.middleware';
import { z } from 'zod';

const router = Router();

// Tüm customer route'lar authentication gerektirir
router.use(authenticate);

// Validation schemas
const addToCartSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  priceType: z.enum(['INVOICED', 'WHITE']),
  priceMode: z.enum(['LIST', 'EXCESS']).optional(),
});

const updateCartItemSchema = z.object({
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
});

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
const taskPrioritySchema = z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT']);
const taskStatusSchema = z.enum(['NEW', 'TRIAGE', 'IN_PROGRESS', 'WAITING', 'REVIEW', 'DONE', 'CANCELLED']);
const taskViewSchema = z.enum(['KANBAN', 'LIST']);

const createCustomerTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  type: taskTypeSchema.optional(),
  priority: taskPrioritySchema.optional(),
});

const taskCommentSchema = z.object({
  body: z.string().min(1),
});

const taskPreferencesSchema = z.object({
  defaultView: taskViewSchema,
});

// Products (with cache - 5 minutes TTL)
router.get(
  '/products',
  cacheMiddleware({
    namespace: 'products',
    ttl: 300, // 5 minutes
    keyGenerator: (req) => {
      const userId = req.user?.userId || 'guest';
      const customerType = req.user?.role || 'default';
      const { categoryId, search, warehouse, mode } = req.query;
      return `list:${userId}:${customerType}:${mode || 'all'}:${categoryId || ''}:${search || ''}:${warehouse || ''}`;
    },
  }),
  customerController.getProducts
);

router.get(
  '/products/:id',
  cacheMiddleware({
    namespace: 'product',
    ttl: 600, // 10 minutes
    keyGenerator: (req) => {
      const userId = req.user?.userId || 'guest';
      const customerType = req.user?.role || 'default';
      const mode = req.query.mode || 'all';
      return `${req.params.id}:${userId}:${customerType}:${mode}`;
    },
  }),
  customerController.getProductById
);

// Categories (with cache - 30 minutes TTL)
router.get(
  '/categories',
  cacheMiddleware({
    namespace: 'categories',
    ttl: 1800, // 30 minutes
  }),
  customerController.getCategories
);

// Warehouses
router.get('/warehouses', customerController.getWarehouses);

// Customer Settings
router.put('/customer/settings', customerController.updateSettings);

// Cart
router.get('/cart', customerController.getCart);
router.post(
  '/cart',
  validateBody(addToCartSchema),
  invalidateCacheMiddleware(['products:*', 'product:*']),
  customerController.addToCart
);
router.put(
  '/cart/:itemId',
  validateBody(updateCartItemSchema),
  customerController.updateCartItem
);
router.delete(
  '/cart/:itemId',
  invalidateCacheMiddleware(['products:*', 'product:*']),
  customerController.removeFromCart
);

// Orders
router.post(
  '/orders',
  invalidateCacheMiddleware(['products:*', 'product:*', 'stats:*']),
  customerController.createOrder
);
router.get('/orders', customerController.getOrders);
router.get('/orders/:id', customerController.getOrderById);

// Quotes (customer)
router.get('/quotes', requireCustomer, quoteController.getCustomerQuotes);
router.get('/quotes/:id', requireCustomer, quoteController.getCustomerQuoteById);
router.post('/quotes/:id/accept', requireCustomer, quoteController.acceptQuote);
router.post('/quotes/:id/reject', requireCustomer, quoteController.rejectCustomerQuote);

// Tasks (customer)
router.get('/tasks/preferences', requireCustomer, taskController.getPreferences);
router.put('/tasks/preferences', requireCustomer, validateBody(taskPreferencesSchema), taskController.updatePreferences);
router.get('/tasks', requireCustomer, taskController.getCustomerTasks);
router.post('/tasks', requireCustomer, validateBody(createCustomerTaskSchema), taskController.createCustomerTask);
router.get('/tasks/:id', requireCustomer, taskController.getCustomerTaskById);
router.post('/tasks/:id/comments', requireCustomer, validateBody(taskCommentSchema), taskController.addCustomerComment);
router.post('/tasks/:id/attachments', requireCustomer, taskUpload.single('file'), taskController.addCustomerAttachment);

export default router;
