/**
 * Customer Controller
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import stockService from '../services/stock.service';
import pricingService from '../services/pricing.service';
import orderService from '../services/order.service';
import { ProductPrices } from '../types';

export class CustomerController {
  /**
   * GET /api/products
   */
  async getProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const { categoryId, search, warehouse } = req.query;

      // Kullanıcı bilgisini al
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
      });

      if (!user || !user.customerType) {
        return res.status(400).json({ error: 'User has no customer type' });
      }

      // Fazla stoklu ürünleri getir
      const products = await stockService.getExcessStockProducts({
        categoryId: categoryId as string,
        search: search as string,
      });

      // Her ürün için müşteri tipine göre fiyatları filtrele
      let productsWithPrices = products.map((product) => {
        const prices = product.prices as unknown as ProductPrices;
        const customerPrices = pricingService.getPriceForCustomer(
          prices,
          user.customerType as any
        );

        // Depo filtresi varsa, o depo için stok miktarını al
        let excessStock = product.excessStock;
        const warehouseStocks = product.warehouseStocks as any;

        if (warehouse && warehouseStocks) {
          excessStock = warehouseStocks[warehouse as string] || 0;
        }

        return {
          id: product.id,
          name: product.name,
          mikroCode: product.mikroCode,
          unit: product.unit,
          excessStock,
          imageUrl: product.imageUrl,
          warehouseStocks: product.warehouseStocks,
          category: {
            id: product.category.id,
            name: product.category.name,
          },
          prices: customerPrices,
        };
      });

      // Depo filtresi varsa, sadece o depoda stok olanları göster
      if (warehouse) {
        productsWithPrices = productsWithPrices.filter(p => p.excessStock > 0);
      }

      res.json({ products: productsWithPrices });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/products/:id
   */
  async getProductById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
      });

      if (!user || !user.customerType) {
        return res.status(400).json({ error: 'User has no customer type' });
      }

      const product = await prisma.product.findUnique({
        where: { id },
        include: {
          category: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      if (product.excessStock <= 0) {
        return res.status(400).json({ error: 'Product is not available' });
      }

      const prices = product.prices as unknown as ProductPrices;
      const customerPrices = pricingService.getPriceForCustomer(
        prices,
        user.customerType as any
      );

      res.json({
        id: product.id,
        name: product.name,
        mikroCode: product.mikroCode,
        unit: product.unit,
        excessStock: product.excessStock,
        warehouseStocks: product.warehouseStocks,
        imageUrl: product.imageUrl,
        category: product.category,
        prices: customerPrices,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/categories
   */
  async getCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const categories = await prisma.category.findMany({
        where: { active: true },
        select: {
          id: true,
          name: true,
          mikroCode: true,
        },
        orderBy: {
          name: 'asc',
        },
      });

      res.json({ categories });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/warehouses
   */
  async getWarehouses(req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await prisma.settings.findFirst();

      if (!settings) {
        return res.json({ warehouses: [] });
      }

      res.json({ warehouses: settings.includedWarehouses });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/customer/settings
   */
  async updateSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const { vatDisplayPreference } = req.body;

      if (!['WITH_VAT', 'WITHOUT_VAT'].includes(vatDisplayPreference)) {
        return res.status(400).json({ error: 'Invalid VAT display preference' });
      }

      await prisma.user.update({
        where: { id: req.user!.userId },
        data: { vatDisplayPreference },
      });

      res.json({ message: 'Settings updated successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/cart
   */
  async getCart(req: Request, res: Response, next: NextFunction) {
    try {
      const cart = await prisma.cart.findUnique({
        where: { userId: req.user!.userId },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  mikroCode: true,
                  imageUrl: true,
                },
              },
            },
          },
        },
      });

      if (!cart) {
        return res.json({ items: [], total: 0 });
      }

      const total = cart.items.reduce((sum, item) => {
        return sum + item.quantity * item.unitPrice;
      }, 0);

      res.json({
        id: cart.id,
        items: cart.items.map((item) => ({
          id: item.id,
          product: item.product,
          quantity: item.quantity,
          priceType: item.priceType,
          unitPrice: item.unitPrice,
          totalPrice: item.quantity * item.unitPrice,
        })),
        total,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/cart
   */
  async addToCart(req: Request, res: Response, next: NextFunction) {
    try {
      const { productId, quantity, priceType } = req.body;

      // Kullanıcı bilgisi
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
      });

      if (!user || !user.customerType) {
        return res.status(400).json({ error: 'User has no customer type' });
      }

      // Ürün kontrolü
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // Real-time stock check from Mikro ERP
      const stockCheck = await stockService.checkRealtimeStock(productId, quantity);

      if (!stockCheck.available) {
        return res.status(400).json({
          error: 'Yetersiz stok',
          message: `Stok yetersiz. Mevcut: ${stockCheck.currentStock} ${product.unit}`,
          available: stockCheck.currentStock,
        });
      }

      // Fiyatı al
      const prices = product.prices as unknown as ProductPrices;
      const customerPrices = pricingService.getPriceForCustomer(
        prices,
        user.customerType as any
      );

      const unitPrice = priceType === 'INVOICED' ? customerPrices.invoiced : customerPrices.white;

      // Cart'ı bul veya oluştur
      let cart = await prisma.cart.findUnique({
        where: { userId: user.id },
      });

      if (!cart) {
        cart = await prisma.cart.create({
          data: { userId: user.id },
        });
      }

      // Aynı ürün ve fiyat tipi varsa güncelle, yoksa ekle
      const existingItem = await prisma.cartItem.findFirst({
        where: {
          cartId: cart.id,
          productId,
          priceType,
        },
      });

      if (existingItem) {
        await prisma.cartItem.update({
          where: { id: existingItem.id },
          data: {
            quantity: existingItem.quantity + quantity,
          },
        });
      } else {
        await prisma.cartItem.create({
          data: {
            cartId: cart.id,
            productId,
            quantity,
            priceType,
            unitPrice,
          },
        });
      }

      res.json({ message: 'Product added to cart' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/cart/:itemId
   */
  async updateCartItem(req: Request, res: Response, next: NextFunction) {
    try {
      const { itemId } = req.params;
      const { quantity } = req.body;

      if (quantity <= 0) {
        return res.status(400).json({ error: 'Quantity must be greater than 0' });
      }

      await prisma.cartItem.update({
        where: { id: itemId },
        data: { quantity },
      });

      res.json({ message: 'Cart item updated' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/cart/:itemId
   */
  async removeFromCart(req: Request, res: Response, next: NextFunction) {
    try {
      const { itemId } = req.params;

      await prisma.cartItem.delete({
        where: { id: itemId },
      });

      res.json({ message: 'Item removed from cart' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/orders
   */
  async createOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await orderService.createOrderFromCart(req.user!.userId);

      res.status(201).json({
        message: 'Order created successfully',
        orderId: result.orderId,
        orderNumber: result.orderNumber,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/orders
   */
  async getOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const orders = await orderService.getUserOrders(req.user!.userId);

      res.json({ orders });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/orders/:id
   */
  async getOrderById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const order = await orderService.getOrderById(id);

      // Kullanıcının kendi siparişi olduğunu kontrol et
      if (order.userId !== req.user!.userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json(order);
    } catch (error) {
      next(error);
    }
  }
}

export default new CustomerController();
