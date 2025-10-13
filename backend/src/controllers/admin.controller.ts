/**
 * Admin Controller
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { hashPassword } from '../utils/password';
import syncService from '../services/sync.service';
import cariSyncService from '../services/cariSync.service';
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
   * Start sync in background and return job ID (resim hariç)
   */
  async triggerSync(req: Request, res: Response, next: NextFunction) {
    try {
      // Start sync in background (don't await)
      const syncLogId = await syncService.startSync('MANUAL');

      // Return immediately with job ID
      res.json({
        message: 'Sync started (excluding images)',
        syncLogId,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/sync/images
   * Start image sync in background and return job ID
   */
  async triggerImageSync(req: Request, res: Response, next: NextFunction) {
    try {
      const syncLogId = await syncService.startImageSync();

      res.json({
        message: 'Image sync started',
        syncLogId,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/sync/status/:id
   * Get sync status by log ID
   */
  async getSyncStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const syncLog = await prisma.syncLog.findUnique({
        where: { id },
      });

      if (!syncLog) {
        return res.status(404).json({ error: 'Sync log not found' });
      }

      // Calculate progress percentage
      const isRunning = syncLog.status === 'RUNNING';
      const isCompleted = syncLog.status === 'SUCCESS' || syncLog.status === 'FAILED';

      res.json({
        id: syncLog.id,
        status: syncLog.status,
        startedAt: syncLog.startedAt,
        completedAt: syncLog.completedAt,
        categoriesCount: syncLog.categoriesCount,
        productsCount: syncLog.productsCount,
        imagesDownloaded: syncLog.imagesDownloaded,
        imagesSkipped: syncLog.imagesSkipped,
        imagesFailed: syncLog.imagesFailed,
        details: syncLog.details,
        warnings: syncLog.warnings,
        errorMessage: syncLog.errorMessage,
        isRunning,
        isCompleted,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/sync/cari
   * Start cari sync in background
   */
  async triggerCariSync(req: Request, res: Response, next: NextFunction) {
    try {
      const syncId = await cariSyncService.startCariSync();

      res.json({
        message: 'Cari sync started',
        syncId,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/sync/cari/status/:id
   * Get cari sync status by ID
   */
  async getCariSyncStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = cariSyncService.getSyncResult(id);

      if (!result) {
        return res.status(404).json({ error: 'Cari sync result not found' });
      }

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/sync/cari/latest
   * Get latest cari sync result
   */
  async getLatestCariSync(req: Request, res: Response, next: NextFunction) {
    try {
      const result = cariSyncService.getLatestSyncResult();

      if (!result) {
        return res.json({ message: 'No cari sync has been performed yet' });
      }

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/cari-list
   */
  async getCariList(req: Request, res: Response, next: NextFunction) {
    try {
      const cariList = await mikroService.getCariDetails();
      res.json({ cariList });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/products
   * Detaylı ürün listesi - filtreleme ve sıralama ile
   */
  async getProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        search,
        hasImage,
        categoryId,
        sortBy = 'name',
        sortOrder = 'asc'
      } = req.query;

      const where: any = { active: true };

      // Arama filtresi
      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { mikroCode: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      // Resim filtresi
      if (hasImage === 'true') {
        where.imageUrl = { not: null };
      } else if (hasImage === 'false') {
        where.imageUrl = null;
      }

      // Kategori filtresi
      if (categoryId) {
        where.categoryId = categoryId as string;
      }

      // Sıralama ayarları
      const orderBy: any = {};
      const validSortFields = ['name', 'mikroCode', 'excessStock', 'lastEntryDate', 'currentCost'];
      if (validSortFields.includes(sortBy as string)) {
        orderBy[sortBy as string] = sortOrder === 'desc' ? 'desc' : 'asc';
      } else {
        orderBy.name = 'asc'; // default
      }

      const products = await prisma.product.findMany({
        where,
        select: {
          id: true,
          name: true,
          mikroCode: true,
          unit: true,
          excessStock: true,
          warehouseStocks: true,
          warehouseExcessStocks: true,
          lastEntryPrice: true,
          lastEntryDate: true,
          currentCost: true,
          currentCostDate: true,
          calculatedCost: true,
          vatRate: true,
          prices: true,
          imageUrl: true,
          category: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy,
      });

      // Toplam stok hesapla (tüm depolar)
      const productsWithTotalStock = products.map(product => {
        const warehouseStocks = product.warehouseStocks as Record<string, number> || {};
        const totalStock = Object.values(warehouseStocks).reduce((sum, val) => sum + val, 0);

        return {
          ...product,
          totalStock,
        };
      });

      res.json({ products: productsWithTotalStock });
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
          // Mikro ERP fields
          city: true,
          district: true,
          phone: true,
          groupCode: true,
          sectorCode: true,
          paymentTerm: true,
          hasEInvoice: true,
          balance: true,
          isLocked: true,
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

      // Mikro'dan cari bilgilerini çek
      let mikroCariData = {};
      if (mikroCariCode) {
        try {
          const cariList = await mikroService.getCariDetails();
          const cari = cariList.find(c => c.code === mikroCariCode);
          if (cari) {
            mikroCariData = {
              city: cari.city,
              district: cari.district,
              phone: cari.phone,
              groupCode: cari.groupCode,
              sectorCode: cari.sectorCode,
              paymentTerm: cari.paymentTerm,
              hasEInvoice: cari.hasEInvoice,
              balance: cari.balance,
              isLocked: cari.isLocked,
            };
          }
        } catch (error) {
          console.error('Mikro cari bilgileri çekilirken hata:', error);
          // Hata olsa bile devam et, sadece Mikro alanları boş kalır
        }
      }

      // Kullanıcı oluştur
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          role: 'CUSTOMER',
          customerType,
          mikroCariCode,
          ...mikroCariData,
        },
        select: {
          id: true,
          email: true,
          name: true,
          customerType: true,
          mikroCariCode: true,
          city: true,
          district: true,
          phone: true,
          groupCode: true,
          sectorCode: true,
          paymentTerm: true,
          hasEInvoice: true,
          balance: true,
          isLocked: true,
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
   * PUT /api/admin/customers/:id
   * Update customer (only editable fields: email, customerType, active)
   */
  async updateCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { email, customerType, active } = req.body;

      // Validate customer exists
      const existingCustomer = await prisma.user.findUnique({
        where: { id },
      });

      if (!existingCustomer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      if (existingCustomer.role !== 'CUSTOMER') {
        return res.status(400).json({ error: 'User is not a customer' });
      }

      // Email değişiyorsa başka kullanıcıda var mı kontrol et
      if (email && email !== existingCustomer.email) {
        const emailTaken = await prisma.user.findUnique({
          where: { email },
        });

        if (emailTaken) {
          return res.status(400).json({ error: 'Email already in use' });
        }
      }

      // Update only editable fields (NOT Mikro fields)
      const updateData: any = {};
      if (email !== undefined) updateData.email = email;
      if (customerType !== undefined) updateData.customerType = customerType;
      if (active !== undefined) updateData.active = active;

      const updatedCustomer = await prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          email: true,
          name: true,
          displayName: true,
          mikroName: true,
          customerType: true,
          mikroCariCode: true,
          active: true,
          city: true,
          district: true,
          phone: true,
          groupCode: true,
          sectorCode: true,
          paymentTerm: true,
          hasEInvoice: true,
          balance: true,
          isLocked: true,
        },
      });

      res.json({
        message: 'Customer updated successfully',
        customer: updatedCustomer,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/orders
   * Get all orders with optional status filtering
   */
  async getAllOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const { status } = req.query;

      const where: any = {};
      if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status as string)) {
        where.status = status;
      }

      const orders = await prisma.order.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              displayName: true,
              mikroName: true,
              customerType: true,
              mikroCariCode: true,
            },
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  mikroCode: true,
                  unit: true,
                  imageUrl: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      res.json({ orders });
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
   * POST /api/admin/orders/:id/approve-items
   * Kısmi onay - Seçili kalemleri onayla
   */
  async approveOrderItems(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { itemIds, adminNote } = req.body;

      if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: 'Item IDs array is required' });
      }

      const result = await orderService.approveOrderItemsAndWriteToMikro(id, itemIds, adminNote);

      res.json({
        message: `${result.approvedCount} items approved successfully`,
        mikroOrderIds: result.mikroOrderIds,
        approvedCount: result.approvedCount,
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * POST /api/admin/orders/:id/reject-items
   * Seçili kalemleri reddet
   */
  async rejectOrderItems(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { itemIds, rejectionReason } = req.body;

      if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: 'Item IDs array is required' });
      }

      if (!rejectionReason) {
        return res.status(400).json({ error: 'Rejection reason is required' });
      }

      const result = await orderService.rejectOrderItems(id, itemIds, rejectionReason);

      res.json({
        message: `${result.rejectedCount} items rejected successfully`,
        rejectedCount: result.rejectedCount,
      });
    } catch (error: any) {
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
