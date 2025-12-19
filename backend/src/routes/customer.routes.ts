/**
 * Customer Routes
 */

import { Router } from 'express';
import customerController from '../controllers/customer.controller';
import { authenticate } from '../middleware/auth.middleware';
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

export default router;
