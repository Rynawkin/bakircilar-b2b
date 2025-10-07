/**
 * Customer Routes
 */

import { Router } from 'express';
import customerController from '../controllers/customer.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validation.middleware';
import { z } from 'zod';

const router = Router();

// Tüm customer route'lar authentication gerektirir
router.use(authenticate);

// Validation schemas
const addToCartSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  priceType: z.enum(['INVOICED', 'WHITE']),
});

const updateCartItemSchema = z.object({
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
});

// Products
router.get('/products', customerController.getProducts);
router.get('/products/:id', customerController.getProductById);

// Categories
router.get('/categories', customerController.getCategories);

// Warehouses
router.get('/warehouses', customerController.getWarehouses);

// Customer Settings
router.put('/customer/settings', customerController.updateSettings);

// Cart
router.get('/cart', customerController.getCart);
router.post('/cart', validateBody(addToCartSchema), customerController.addToCart);
router.put('/cart/:itemId', validateBody(updateCartItemSchema), customerController.updateCartItem);
router.delete('/cart/:itemId', customerController.removeFromCart);

// Orders
router.post('/orders', customerController.createOrder);
router.get('/orders', customerController.getOrders);
router.get('/orders/:id', customerController.getOrderById);

export default router;
