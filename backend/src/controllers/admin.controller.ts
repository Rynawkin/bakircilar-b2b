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
import reportsService from '../services/reports.service';
import priceSyncService from '../services/priceSync.service';
import priceHistoryNewService from '../services/priceHistoryNew.service';
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
   * ADMIN/MANAGER: Tüm cariler
   * SALES_REP: Sadece atanan sektör kodlarındaki cariler
   */
  async getCariList(req: Request, res: Response, next: NextFunction) {
    try {
      const userRole = req.user?.role;
      const assignedSectorCodes = req.user?.assignedSectorCodes || [];

      // Tüm cari listesini çek
      const allCariList = await mikroService.getCariDetails();

      // SALES_REP ise sektör filtresi uygula
      let cariList = allCariList;
      if (userRole === 'SALES_REP') {
        cariList = allCariList.filter(cari =>
          cari.sectorCode && assignedSectorCodes.includes(cari.sectorCode)
        );
      }

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

      // Settings'den aktif depoları al
      const settings = await prisma.settings.findFirst();
      const includedWarehouses = settings?.includedWarehouses || [];

      // Toplam stok hesapla (sadece included warehouses)
      const productsWithTotalStock = products.map(product => {
        const warehouseStocks = product.warehouseStocks as Record<string, number> || {};
        const totalStock = includedWarehouses.reduce((sum, warehouse) => {
          return sum + (warehouseStocks[warehouse] || 0);
        }, 0);

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
   * ADMIN/MANAGER: Tüm müşteriler
   * SALES_REP: Sadece atanan sektör kodlarındaki müşteriler
   */
  async getCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const userRole = req.user?.role;
      const assignedSectorCodes = req.user?.assignedSectorCodes || [];

      // Base where clause
      const where: any = { role: 'CUSTOMER' };

      // SALES_REP ise sektör filtresi uygula
      if (userRole === 'SALES_REP') {
        where.sectorCode = { in: assignedSectorCodes };
      }

      const customers = await prisma.user.findMany({
        where,
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
   * ADMIN/MANAGER: Tüm siparişler
   * SALES_REP: Sadece atanan sektör kodlarındaki müşterilerin siparişleri
   */
  async getAllOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const { status } = req.query;
      const userRole = req.user?.role;
      const assignedSectorCodes = req.user?.assignedSectorCodes || [];

      const where: any = {};
      if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status as string)) {
        where.status = status;
      }

      // SALES_REP ise sadece atanan sektörlerdeki müşterilerin siparişlerini göster
      if (userRole === 'SALES_REP') {
        where.user = {
          sectorCode: { in: assignedSectorCodes }
        };
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
              sectorCode: true,
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
   * ADMIN/MANAGER: Tüm bekleyen siparişler
   * SALES_REP: Sadece atanan sektör kodlarındaki müşterilerin bekleyen siparişleri
   */
  async getPendingOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const userRole = req.user?.role;
      const assignedSectorCodes = req.user?.assignedSectorCodes || [];

      // SALES_REP ise sektör filtresi uygula
      const sectorFilter = userRole === 'SALES_REP' ? assignedSectorCodes : undefined;

      const orders = await orderService.getPendingOrders(sectorFilter);
      res.json({ orders });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/orders/:id/approve
   * ADMIN: Tüm siparişleri onaylayabilir
   * SALES_REP: Sadece atanan sektör kodlarındaki müşterilerin siparişlerini onaylayabilir
   */
  async approveOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { adminNote } = req.body;
      const userRole = req.user?.role;
      const assignedSectorCodes = req.user?.assignedSectorCodes || [];

      // Sipariş bilgilerini al (kullanıcı bilgisiyle birlikte)
      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          user: {
            select: { sectorCode: true }
          }
        }
      });

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // SALES_REP ise sektör kontrolü yap
      if (userRole === 'SALES_REP') {
        if (!order.user.sectorCode || !assignedSectorCodes.includes(order.user.sectorCode)) {
          return res.status(403).json({
            error: 'You can only approve orders from customers in your assigned sectors'
          });
        }
      }

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
   * ADMIN: Tüm siparişleri reddedebilir
   * SALES_REP: Sadece atanan sektör kodlarındaki müşterilerin siparişlerini reddedebilir
   */
  async rejectOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { adminNote } = req.body;
      const userRole = req.user?.role;
      const assignedSectorCodes = req.user?.assignedSectorCodes || [];

      if (!adminNote) {
        return res.status(400).json({ error: 'Admin note is required for rejection' });
      }

      // Sipariş bilgilerini al (kullanıcı bilgisiyle birlikte)
      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          user: {
            select: { sectorCode: true }
          }
        }
      });

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // SALES_REP ise sektör kontrolü yap
      if (userRole === 'SALES_REP') {
        if (!order.user.sectorCode || !assignedSectorCodes.includes(order.user.sectorCode)) {
          return res.status(403).json({
            error: 'You can only reject orders from customers in your assigned sectors'
          });
        }
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
   * ADMIN: Tüm siparişlerdeki kalemleri onaylayabilir
   * SALES_REP: Sadece atanan sektör kodlarındaki müşterilerin sipariş kalemlerini onaylayabilir
   */
  async approveOrderItems(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { itemIds, adminNote } = req.body;
      const userRole = req.user?.role;
      const assignedSectorCodes = req.user?.assignedSectorCodes || [];

      if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: 'Item IDs array is required' });
      }

      // Sipariş bilgilerini al (kullanıcı bilgisiyle birlikte)
      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          user: {
            select: { sectorCode: true }
          }
        }
      });

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // SALES_REP ise sektör kontrolü yap
      if (userRole === 'SALES_REP') {
        if (!order.user.sectorCode || !assignedSectorCodes.includes(order.user.sectorCode)) {
          return res.status(403).json({
            error: 'You can only approve order items from customers in your assigned sectors'
          });
        }
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
   * ADMIN: Tüm siparişlerdeki kalemleri reddedebilir
   * SALES_REP: Sadece atanan sektör kodlarındaki müşterilerin sipariş kalemlerini reddedebilir
   */
  async rejectOrderItems(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { itemIds, rejectionReason } = req.body;
      const userRole = req.user?.role;
      const assignedSectorCodes = req.user?.assignedSectorCodes || [];

      if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: 'Item IDs array is required' });
      }

      if (!rejectionReason) {
        return res.status(400).json({ error: 'Rejection reason is required' });
      }

      // Sipariş bilgilerini al (kullanıcı bilgisiyle birlikte)
      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          user: {
            select: { sectorCode: true }
          }
        }
      });

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // SALES_REP ise sektör kontrolü yap
      if (userRole === 'SALES_REP') {
        if (!order.user.sectorCode || !assignedSectorCodes.includes(order.user.sectorCode)) {
          return res.status(403).json({
            error: 'You can only reject order items from customers in your assigned sectors'
          });
        }
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
   * POST /api/admin/categories/bulk-price-rules
   * Toplu kategori fiyat kuralı güncelleme - TEK REQUEST
   */
  async setBulkCategoryPriceRules(req: Request, res: Response, next: NextFunction) {
    try {
      const { rules } = req.body as {
        rules: Array<{
          categoryId: string;
          customerType: string;
          profitMargin: number;
        }>;
      };

      if (!rules || !Array.isArray(rules) || rules.length === 0) {
        return res.status(400).json({ error: 'Rules array is required' });
      }

      console.log(`🚀 Toplu güncelleme başlıyor: ${rules.length} kural...`);

      const results = {
        totalRules: rules.length,
        updatedRules: 0,
        affectedCategories: new Set<string>(),
        errors: [] as string[],
      };

      // Tüm kuralları güncelle
      for (const rule of rules) {
        try {
          await prisma.categoryPriceRule.upsert({
            where: {
              categoryId_customerType: {
                categoryId: rule.categoryId,
                customerType: rule.customerType as any,
              },
            },
            update: {
              profitMargin: rule.profitMargin,
            },
            create: {
              categoryId: rule.categoryId,
              customerType: rule.customerType as any,
              profitMargin: rule.profitMargin,
            },
          });
          results.updatedRules++;
          results.affectedCategories.add(rule.categoryId);
        } catch (error: any) {
          results.errors.push(`${rule.categoryId}-${rule.customerType}: ${error.message}`);
        }
      }

      console.log(`✅ Kurallar güncellendi: ${results.updatedRules}/${results.totalRules}`);
      console.log(`📊 Etkilenen kategori sayısı: ${results.affectedCategories.size}`);

      // Etkilenen kategorilerin fiyatlarını güncelle
      console.log(`🔄 Fiyatlar yeniden hesaplanıyor...`);
      let pricesUpdated = 0;
      for (const categoryId of Array.from(results.affectedCategories)) {
        try {
          const count = await pricingService.recalculatePricesForCategory(categoryId);
          pricesUpdated += count;
        } catch (error: any) {
          console.error(`Kategori ${categoryId} fiyat hesaplama hatası:`, error.message);
        }
      }

      console.log(`✅ ${pricesUpdated} ürün fiyatı güncellendi`);

      res.json({
        message: 'Bulk price rules updated successfully',
        updatedRules: results.updatedRules,
        totalRules: results.totalRules,
        affectedCategories: results.affectedCategories.size,
        pricesUpdated,
        errors: results.errors,
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
   * GET /api/admin/sector-codes
   * Get all unique sector codes from Mikro cari list
   */
  async getSectorCodes(req: Request, res: Response, next: NextFunction) {
    try {
      // Get all cari from Mikro
      const cariList = await mikroService.getCariDetails();

      // Extract unique sector codes (excluding empty ones)
      const sectorCodes = [...new Set(
        cariList
          .map(c => c.sectorCode)
          .filter(code => code && code.trim() !== '') as string[]
      )].sort();

      res.json({ sectorCodes });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/staff
   * Get all staff members (ADMIN, MANAGER, SALES_REP)
   */
  async getStaffMembers(req: Request, res: Response, next: NextFunction) {
    try {
      const staff = await prisma.user.findMany({
        where: {
          role: {
            in: ['ADMIN', 'MANAGER', 'SALES_REP']
          }
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          assignedSectorCodes: true,
          active: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      res.json({ staff });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/staff
   * Create new staff member (SALES_REP or MANAGER)
   * Only ADMIN can create MANAGER
   * ADMIN and MANAGER can create SALES_REP
   */
  async createStaffMember(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password, name, role, assignedSectorCodes } = req.body;
      const currentUserRole = req.user?.role;

      // Validation
      if (!email || !password || !name || !role) {
        return res.status(400).json({ error: 'Email, password, name, and role are required' });
      }

      if (!['SALES_REP', 'MANAGER'].includes(role)) {
        return res.status(400).json({ error: 'Role must be either SALES_REP or MANAGER' });
      }

      // Only ADMIN can create MANAGER
      if (role === 'MANAGER' && currentUserRole !== 'ADMIN') {
        return res.status(403).json({ error: 'Only ADMIN can create MANAGER users' });
      }

      // Check if email already exists
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return res.status(400).json({ error: 'Email already exists' });
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Create staff member
      const staffMember = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          role,
          assignedSectorCodes: role === 'SALES_REP' ? (assignedSectorCodes || []) : [],
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          assignedSectorCodes: true,
          active: true,
          createdAt: true,
        },
      });

      res.status(201).json({
        message: 'Staff member created successfully',
        staff: staffMember,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/admin/staff/:id
   * Update staff member
   */
  async updateStaffMember(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { email, name, active, assignedSectorCodes } = req.body;
      const currentUserRole = req.user?.role;

      // Get existing staff member
      const existingStaff = await prisma.user.findUnique({
        where: { id },
      });

      if (!existingStaff) {
        return res.status(404).json({ error: 'Staff member not found' });
      }

      if (!['ADMIN', 'MANAGER', 'SALES_REP'].includes(existingStaff.role)) {
        return res.status(400).json({ error: 'User is not a staff member' });
      }

      // Only ADMIN can update MANAGER
      if (existingStaff.role === 'MANAGER' && currentUserRole !== 'ADMIN') {
        return res.status(403).json({ error: 'Only ADMIN can update MANAGER users' });
      }

      // Check email uniqueness if changing
      if (email && email !== existingStaff.email) {
        const emailTaken = await prisma.user.findUnique({
          where: { email },
        });

        if (emailTaken) {
          return res.status(400).json({ error: 'Email already in use' });
        }
      }

      // Build update data
      const updateData: any = {};
      if (email !== undefined) updateData.email = email;
      if (name !== undefined) updateData.name = name;
      if (active !== undefined) updateData.active = active;
      if (assignedSectorCodes !== undefined && existingStaff.role === 'SALES_REP') {
        updateData.assignedSectorCodes = assignedSectorCodes;
      }

      const updatedStaff = await prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          assignedSectorCodes: true,
          active: true,
        },
      });

      res.json({
        message: 'Staff member updated successfully',
        staff: updatedStaff,
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

  /**
   * GET /api/admin/caris/available
   * Mikro'daki carileri listele (henüz kullanıcı oluşturulmamış olanlar)
   */
  async getAvailableCaris(req: Request, res: Response, next: NextFunction) {
    try {
      // Mikro'dan tüm cari detaylarını çek
      const mikroCaris = await mikroService.getCariDetails();

      // Sistemde zaten olan kullanıcıların cari kodlarını al
      const existingUsers = await prisma.user.findMany({
        where: {
          mikroCariCode: { not: null }
        },
        select: { mikroCariCode: true }
      });

      const existingCariCodes = new Set(
        existingUsers.map(u => u.mikroCariCode).filter((code): code is string => code !== null)
      );

      // Henüz kullanıcı oluşturulmamış carileri filtrele
      const availableCaris = mikroCaris.filter(
        cari => !existingCariCodes.has(cari.code)
      );

      res.json({
        success: true,
        caris: availableCaris,
        totalAvailable: availableCaris.length,
        totalExisting: existingUsers.length
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/users/bulk-create
   * Seçili cariler için toplu kullanıcı oluştur
   *
   * Body: { cariCodes: string[] }
   */
  async bulkCreateUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const { cariCodes } = req.body;

      if (!Array.isArray(cariCodes) || cariCodes.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Cari kodları gerekli'
        });
      }

      // Mikro'dan cari detaylarını çek
      const mikroCaris = await mikroService.getCariDetails();
      const cariMap = new Map(mikroCaris.map(c => [c.code, c]));

      const results = {
        created: [] as string[],
        skipped: [] as string[],
        errors: [] as { code: string; error: string }[]
      };

      for (const cariCode of cariCodes) {
        try {
          const cariData = cariMap.get(cariCode);

          if (!cariData) {
            results.errors.push({
              code: cariCode,
              error: 'Mikro\'da bulunamadı'
            });
            continue;
          }

          // Kullanıcı zaten var mı kontrol et
          const existingUser = await prisma.user.findUnique({
            where: { mikroCariCode: cariCode }
          });

          if (existingUser) {
            results.skipped.push(cariCode);
            continue;
          }

          // Şifre: cari kodu + "123" (örn: 120.01.1670123)
          const password = `${cariCode}123`;
          const hashedPassword = await hashPassword(password);

          // Kullanıcı oluştur
          await prisma.user.create({
            data: {
              email: undefined, // Email optional
              password: hashedPassword,
              name: cariData.name,
              mikroName: cariData.name,
              displayName: cariData.name,
              role: 'CUSTOMER',
              mikroCariCode: cariCode,
              customerType: cariData.groupCode === 'BAYI' ? 'BAYI' :
                            cariData.groupCode === 'PERAKENDE' ? 'PERAKENDE' :
                            cariData.groupCode === 'VIP' ? 'VIP' : 'OZEL',
              city: cariData.city,
              district: cariData.district,
              phone: cariData.phone,
              groupCode: cariData.groupCode,
              sectorCode: cariData.sectorCode,
              paymentTerm: cariData.paymentTerm,
              hasEInvoice: cariData.hasEInvoice,
              balance: cariData.balance,
              balanceUpdatedAt: new Date(),
              active: true
            }
          });

          results.created.push(cariCode);
        } catch (error) {
          results.errors.push({
            code: cariCode,
            error: error instanceof Error ? error.message : 'Bilinmeyen hata'
          });
        }
      }

      res.json({
        success: true,
        message: `${results.created.length} kullanıcı oluşturuldu`,
        results
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== REPORTS ====================

  /**
   * GET /admin/reports/cost-update-alerts
   * Maliyet Güncelleme Uyarıları Raporu
   */
  async getCostUpdateAlerts(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, sortBy, sortOrder, dayDiff, percentDiff } = req.query;

      const data = await reportsService.getCostUpdateAlerts({
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        dayDiff: dayDiff ? parseInt(dayDiff as string) : undefined,
        percentDiff: percentDiff ? parseInt(percentDiff as string) : undefined,
      });

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/reports/margin-compliance
   * Marj Uyumsuzluğu Raporu
   */
  async getMarginComplianceReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { customerType, category, status, page, limit, sortBy, sortOrder } = req.query;

      const data = await reportsService.getMarginComplianceReport({
        customerType: customerType as string,
        category: category as string,
        status: status as string,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
      });

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/reports/categories
   * Rapor kategorilerini listele
   */
  async getReportCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await reportsService.getReportCategories();

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/price-sync
   * Fiyat değişikliklerini Mikro'dan PostgreSQL'e senkronize eder
   */
  async syncPriceChanges(req: Request, res: Response, next: NextFunction) {
    try {
      console.log('🔄 Price sync başlatıldı...');
      const result = await priceSyncService.syncPriceChanges();

      res.json({
        success: result.success,
        syncType: result.syncType,
        recordsSynced: result.recordsSynced,
        error: result.error,
      });
    } catch (error: any) {
      console.error('❌ Price sync hatası:', error);
      next(error);
    }
  }

  /**
   * GET /api/admin/price-sync/status
   * Son senkronizasyon durumunu getirir
   */
  async getPriceSyncStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const status = await priceSyncService.getLastSyncStatus();

      res.json({
        success: true,
        status,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/reports/price-history-new
   * Yeni Fiyat Geçmişi Raporu (PostgreSQL'den)
   */
  async getPriceHistoryNew(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        startDate,
        endDate,
        productCode,
        productName,
        brand,
        category,
        hasStock,
        minDaysSinceChange,
        maxDaysSinceChange,
        minChangeFrequency,
        maxChangeFrequency,
        page,
        limit,
        sortBy,
        sortOrder,
      } = req.query;

      const data = await priceHistoryNewService.getProductPriceList({
        startDate: startDate as string,
        endDate: endDate as string,
        productCode: productCode as string,
        productName: productName as string,
        brand: brand as string,
        category: category as string,
        hasStock: hasStock === 'true',
        minDaysSinceChange: minDaysSinceChange ? parseInt(minDaysSinceChange as string) : undefined,
        maxDaysSinceChange: maxDaysSinceChange ? parseInt(maxDaysSinceChange as string) : undefined,
        minChangeFrequency: minChangeFrequency ? parseInt(minChangeFrequency as string) : undefined,
        maxChangeFrequency: maxChangeFrequency ? parseInt(maxChangeFrequency as string) : undefined,
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 50,
        sortBy: (sortBy as any) || 'lastChangeDate',
        sortOrder: (sortOrder as 'asc' | 'desc') || 'desc',
      });

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/reports/product-price-detail/:productCode
   * Belirli bir ürünün detaylı fiyat geçmişi
   */
  async getProductPriceDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const { productCode } = req.params;

      const data = await priceHistoryNewService.getProductPriceHistory(productCode);

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/reports/price-summary-stats
   * Fiyat değişim özet istatistikleri
   */
  async getPriceSummaryStats(req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await priceHistoryNewService.getSummaryStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/reports/price-history
   * Fiyat Geçmişi Raporu (ESKİ - backward compatibility)
   */
  async getPriceHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        startDate,
        endDate,
        productCode,
        productName,
        category,
        priceListNo,
        consistencyStatus,
        changeDirection,
        minChangePercent,
        page,
        limit,
        sortBy,
        sortOrder,
      } = req.query;

      const data = await reportsService.getPriceHistory({
        startDate: startDate as string,
        endDate: endDate as string,
        productCode: productCode as string,
        productName: productName as string,
        category: category as string,
        priceListNo: priceListNo ? parseInt(priceListNo as string) : undefined,
        consistencyStatus: (consistencyStatus as 'all' | 'consistent' | 'inconsistent') || 'all',
        changeDirection: (changeDirection as 'increase' | 'decrease' | 'mixed' | 'all') || 'all',
        minChangePercent: minChangePercent ? parseFloat(minChangePercent as string) : undefined,
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 50,
        sortBy: (sortBy as string) || 'changeDate',
        sortOrder: (sortOrder as 'asc' | 'desc') || 'desc',
      });

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new AdminController();
