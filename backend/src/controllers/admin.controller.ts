/**
 * Admin Controller
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { hashPassword } from '../utils/password';
import syncService from '../services/sync.service';
import orderService from '../services/order.service';
import pricingService from '../services/pricing.service';
import mikroService from '../services/mikroFactory.service';
import { CreateCustomerRequest, SetCategoryPriceRuleRequest } from '../types';

export class AdminController {
  /**
   * GET /api/admin/settings
   */
  async getSettings(req: Request, res: Response, next: NextFunction) {
    try {
      let settings = await prisma.settings.findFirst();

      // Eğer settings yoksa default oluştur
      if (!settings) {
        settings = await prisma.settings.create({
          data: {
            calculationPeriodMonths: 3,
            includedWarehouses: ['DEPO1', 'MERKEZ'],
            minimumExcessThreshold: 10,
            costCalculationMethod: 'LAST_ENTRY',
          },
        });
      }

      res.json(settings);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/admin/settings
   */
  async updateSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const data = req.body;

      let settings = await prisma.settings.findFirst();

      if (!settings) {
        // Yoksa oluştur
        settings = await prisma.settings.create({
          data,
        });
      } else {
        // Varsa güncelle
        settings = await prisma.settings.update({
          where: { id: settings.id },
          data,
        });
      }

      res.json({
        message: 'Settings updated successfully',
        settings,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/sync
   */
  async triggerSync(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await syncService.runFullSync('MANUAL');

      if (result.success) {
        res.json({
          message: 'Sync completed successfully',
          stats: result.stats,
        });
      } else {
        res.status(500).json({
          error: 'Sync failed',
          message: result.error,
        });
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/cari-list
   */
  async getCariList(req: Request, res: Response, next: NextFunction) {
    try {
      const cariList = await mikroService.getCariList();
      res.json({ cariList });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/products
   */
  async getProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const { search } = req.query;

      const where: any = { active: true };

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { mikroCode: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      const products = await prisma.product.findMany({
        where,
        select: {
          id: true,
          name: true,
          mikroCode: true,
          unit: true,
          excessStock: true,
          prices: true,
          category: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          name: 'asc',
        },
      });

      res.json({ products });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/customers
   */
  async getCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const customers = await prisma.user.findMany({
        where: { role: 'CUSTOMER' },
        select: {
          id: true,
          email: true,
          name: true,
          customerType: true,
          mikroCariCode: true,
          active: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      res.json({ customers });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/customers
   */
  async createCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password, name, customerType, mikroCariCode } =
        req.body as CreateCustomerRequest;

      // Email kontrolü
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return res.status(400).json({ error: 'Email already exists' });
      }

      // Mikro cari kodu kontrolü
      if (mikroCariCode) {
        const existingCari = await prisma.user.findUnique({
          where: { mikroCariCode },
        });

        if (existingCari) {
          return res.status(400).json({ error: 'Mikro cari code already exists' });
        }
      }

      // Şifreyi hashle
      const hashedPassword = await hashPassword(password);

      // Kullanıcı oluştur
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          role: 'CUSTOMER',
          customerType,
          mikroCariCode,
        },
        select: {
          id: true,
          email: true,
          name: true,
          customerType: true,
          mikroCariCode: true,
        },
      });

      // Cart oluştur
      await prisma.cart.create({
        data: {
          userId: user.id,
        },
      });

      res.status(201).json({
        message: 'Customer created successfully',
        customer: user,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/orders/pending
   */
  async getPendingOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const orders = await orderService.getPendingOrders();
      res.json({ orders });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/orders/:id/approve
   */
  async approveOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { adminNote } = req.body;

      const result = await orderService.approveOrderAndWriteToMikro(id, adminNote);

      res.json({
        message: 'Order approved and sent to Mikro successfully',
        mikroOrderIds: result.mikroOrderIds,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/orders/:id/reject
   */
  async rejectOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { adminNote } = req.body;

      if (!adminNote) {
        return res.status(400).json({ error: 'Admin note is required for rejection' });
      }

      await orderService.rejectOrder(id, adminNote);

      res.json({
        message: 'Order rejected successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/categories
   */
  async getCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const categories = await prisma.category.findMany({
        where: { active: true },
        include: {
          priceRules: true,
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
   * POST /api/admin/categories/price-rule
   */
  async setCategoryPriceRule(req: Request, res: Response, next: NextFunction) {
    try {
      const { categoryId, customerType, profitMargin } = req.body as SetCategoryPriceRuleRequest;

      await prisma.categoryPriceRule.upsert({
        where: {
          categoryId_customerType: {
            categoryId,
            customerType,
          },
        },
        update: {
          profitMargin,
        },
        create: {
          categoryId,
          customerType,
          profitMargin,
        },
      });

      // Bu kategorideki ürünlerin fiyatlarını yeniden hesapla
      await pricingService.recalculatePricesForCategory(categoryId);

      res.json({
        message: 'Price rule set successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/products/price-override
   */
  async setProductPriceOverride(req: Request, res: Response, next: NextFunction) {
    try {
      const { productId, customerType, profitMargin } = req.body;

      await prisma.productPriceOverride.upsert({
        where: {
          productId_customerType: {
            productId,
            customerType,
          },
        },
        update: {
          profitMargin,
        },
        create: {
          productId,
          customerType,
          profitMargin,
        },
      });

      res.json({
        message: 'Price override set successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/dashboard/stats
   */
  async getDashboardStats(req: Request, res: Response, next: NextFunction) {
    try {
      const [orderStats, customerCount, productCount, lastSync] = await Promise.all([
        orderService.getOrderStats(),
        prisma.user.count({ where: { role: 'CUSTOMER', active: true } }),
        prisma.product.count({ where: { active: true, excessStock: { gt: 0 } } }),
        prisma.settings.findFirst({ select: { lastSyncAt: true } }),
      ]);

      res.json({
        orders: orderStats,
        customerCount,
        excessProductCount: productCount,
        lastSyncAt: lastSync?.lastSyncAt,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/products/:id/image
   * Upload product image
   */
  async uploadProductImage(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Dosya bilgileri
      const imageUrl = `/uploads/${req.file.filename}`;

      // Ürünü güncelle
      const product = await prisma.product.update({
        where: { id },
        data: { imageUrl },
      });

      res.json({
        success: true,
        imageUrl: product.imageUrl,
        message: 'Fotoğraf başarıyla yüklendi'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/admin/products/:id/image
   * Delete product image
   */
  async deleteProductImage(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const product = await prisma.product.update({
        where: { id },
        data: { imageUrl: null },
      });

      res.json({
        success: true,
        message: 'Fotoğraf başarıyla silindi'
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new AdminController();
