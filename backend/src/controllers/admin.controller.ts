/**
 * Admin Controller
 */

import { Request, Response, NextFunction } from 'express';
import https from 'https';
import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import path from 'path';
import { hashPassword } from '../utils/password';
import syncService from '../services/sync.service';
import imageService from '../services/image.service';
import cariSyncService from '../services/cariSync.service';
import orderService from '../services/order.service';
import pricingService from '../services/pricing.service';
import mikroService from '../services/mikroFactory.service';
import reportsService from '../services/reports.service';
import emailService from '../services/email.service';
import priceSyncService from '../services/priceSync.service';
import priceHistoryNewService from '../services/priceHistoryNew.service';
import exclusionService from '../services/exclusion.service';
import priceListService from '../services/price-list.service';
import { splitSearchTokens } from '../utils/search';
import { CreateCustomerRequest, SetCategoryPriceRuleRequest } from '../types';

const DEFAULT_CUSTOMER_PRICE_LISTS = {
  BAYI: { invoiced: 6, white: 1 },
  PERAKENDE: { invoiced: 6, white: 1 },
  VIP: { invoiced: 6, white: 1 },
  OZEL: { invoiced: 6, white: 1 },
};

const buildSubUserBase = (mikroCariCode: string | null | undefined, fallbackId: string): string => {
  const trimmed = typeof mikroCariCode === 'string' ? mikroCariCode.trim() : '';
  if (trimmed) return trimmed;
  return `SUB-${fallbackId.slice(0, 6)}`;
};

const buildSubUserPassword = (length = 10): string => {
  const safeLength = Math.max(6, length);
  const raw = crypto.randomBytes(safeLength * 2).toString('base64');
  const cleaned = raw.replace(/[^a-zA-Z0-9]/g, '').slice(0, safeLength);
  if (cleaned.length >= 6) return cleaned;
  return `${Date.now().toString(36)}Abc123`;
};


const parseReportDateInput = (value: unknown): Date | null => {
  if (!value || typeof value !== 'string') return null;
  const cleaned = value.replace(/-/g, '');
  if (!/^\d{8}$/.test(cleaned)) return null;
  const year = Number(cleaned.slice(0, 4));
  const month = Number(cleaned.slice(4, 6));
  const day = Number(cleaned.slice(6, 8));
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
};

const applyPendingOrdersToStocks = (
  warehouseStocks: Record<string, number>,
  pendingByWarehouse: Record<string, number>
): Record<string, number> => {
  const result: Record<string, number> = {};
  Object.entries(warehouseStocks || {}).forEach(([warehouse, qty]) => {
    const pending = Number(pendingByWarehouse?.[warehouse]) || 0;
    const available = Math.max(0, (Number(qty) || 0) - pending);
    result[warehouse] = available;
  });
  return result;
};


const TCMB_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml';
const USD_RATE_TTL_MS = 60 * 60 * 1000;
let usdRateCache: { rate: number; fetchedAt: number } | null = null;

const fetchTcmbXml = () =>
  new Promise<string>((resolve, reject) => {
    const request = https.get(TCMB_URL, (response) => {
      if (response.statusCode && response.statusCode >= 400) {
        response.resume();
        reject(new Error(`TCMB request failed with status ${response.statusCode}`));
        return;
      }

      response.setEncoding('utf8');
      let data = '';
      response.on('data', (chunk) => {
        data += chunk;
      });
      response.on('end', () => resolve(data));
    });

    request.on('error', reject);
  });

const parseUsdSellingRate = (xml: string) => {
  const currencyMatch = xml.match(/<Currency[^>]*CurrencyCode="USD"[^>]*>([\s\S]*?)<\/Currency>/);
  if (!currencyMatch) return null;
  const currencyBlock = currencyMatch[1];
  const sellingMatch =
    currencyBlock.match(/<ForexSelling>([^<]+)<\/ForexSelling>/) ||
    currencyBlock.match(/<BanknoteSelling>([^<]+)<\/BanknoteSelling>/);
  if (!sellingMatch) return null;
  const raw = sellingMatch[1].trim().replace(',', '.');
  const rate = Number(raw);
  return Number.isFinite(rate) ? rate : null;
};

const fetchUsdSellingRate = async () => {
  const now = Date.now();
  if (usdRateCache && now - usdRateCache.fetchedAt < USD_RATE_TTL_MS) {
    return {
      rate: usdRateCache.rate,
      fetchedAt: new Date(usdRateCache.fetchedAt).toISOString(),
    };
  }

  const xml = await fetchTcmbXml();
  const rate = parseUsdSellingRate(xml);
  if (!rate) {
    throw new Error('USD selling rate not found');
  }

  usdRateCache = { rate, fetchedAt: now };

  return {
    rate,
    fetchedAt: new Date(now).toISOString(),
  };
};

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
            customerPriceLists: DEFAULT_CUSTOMER_PRICE_LISTS,
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
   * POST /api/admin/products/image-sync
   * Start image sync for selected products
   */
  async triggerSelectedImageSync(req: Request, res: Response, next: NextFunction) {
    try {
      const { productIds } = req.body as { productIds?: string[] };

      if (!Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({ error: 'Product IDs are required' });
      }

      const syncLogId = await syncService.startImageSyncForProducts(productIds);

      res.json({
        message: 'Selected image sync started',
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
        imageSyncStatus,
        imageSyncErrorType,
        categoryId,
        priceListStatus = 'all',
        sortBy = 'name',
        sortOrder = 'asc',
        page = '1',
        limit = '10000', // Increased for Diversey users to see all products
        hasStock,
        brand,
      } = req.query;

      const where: any = { active: true };

      // Arama filtresi
      const searchTokens = splitSearchTokens(search as string | undefined);
      if (searchTokens.length > 0) {
        where.AND = searchTokens.map((token) => ({
          OR: [
            { name: { contains: token, mode: 'insensitive' } },
            { mikroCode: { contains: token, mode: 'insensitive' } },
          ],
        }));
      }

      // Resim filtresi
      if (hasImage === 'true') {
        where.imageUrl = { not: null };
      } else if (hasImage === 'false') {
        where.imageUrl = null;
      }

      if (imageSyncStatus && imageSyncStatus !== 'all') {
        where.imageSyncStatus = imageSyncStatus as string;
      }

      if (imageSyncErrorType && imageSyncErrorType !== 'all') {
        where.imageSyncErrorType = imageSyncErrorType as string;
      }

      // Kategori filtresi
      if (categoryId) {
        where.categoryId = categoryId as string;
      }

      if (priceListStatus === 'missing' || priceListStatus === 'available') {
        const availableRows = await prisma.$queryRaw<{ product_code: string }[]>`
          SELECT DISTINCT product_code
          FROM product_price_stats
          WHERE COALESCE(current_price_list_1, 0) > 0
             OR COALESCE(current_price_list_2, 0) > 0
             OR COALESCE(current_price_list_3, 0) > 0
             OR COALESCE(current_price_list_4, 0) > 0
             OR COALESCE(current_price_list_5, 0) > 0
             OR COALESCE(current_price_list_6, 0) > 0
             OR COALESCE(current_price_list_7, 0) > 0
             OR COALESCE(current_price_list_8, 0) > 0
             OR COALESCE(current_price_list_9, 0) > 0
             OR COALESCE(current_price_list_10, 0) > 0
        `;
        const availableCodes = availableRows.map((row) => row.product_code);

        if (priceListStatus === 'available') {
          where.mikroCode = {
            in: availableCodes.length > 0 ? availableCodes : ['__none__'],
          };
        } else if (availableCodes.length > 0) {
          where.mikroCode = {
            notIn: availableCodes,
          };
        }
      }

      // Marka filtresi
      const brandValue = typeof brand === 'string' ? brand.trim() : '';
      if (brandValue) {
        const brandRows = await prisma.$queryRaw<{ product_code: string }[]>`
          SELECT DISTINCT product_code
          FROM product_price_stats
          WHERE brand ILIKE ${`%${brandValue}%`}
        `;
        const brandCodes = brandRows.map((row) => row.product_code);

        if (brandCodes.length === 0) {
          where.mikroCode = { in: ['__none__'] };
        } else if (where.mikroCode) {
          const existing = where.mikroCode as { in?: string[]; notIn?: string[] };
          if (existing.in) {
            const brandSet = new Set(brandCodes);
            const filtered = existing.in.filter((code) => brandSet.has(code));
            existing.in = filtered.length > 0 ? filtered : ['__none__'];
          } else {
            existing.in = brandCodes;
          }
          where.mikroCode = existing;
        } else {
          where.mikroCode = { in: brandCodes };
        }
      }
      // Siralama ayarlari
      const orderBy: any = {};
      const sortByValue = String(sortBy || '');
      const sortByTotalStock = sortByValue === 'totalStock';
      const validSortFields = [
        'name',
        'mikroCode',
        'excessStock',
        'lastEntryDate',
        'currentCost',
        'imageSyncErrorType',
        'imageSyncUpdatedAt',
      ];
      if (validSortFields.includes(sortByValue)) {
        orderBy[sortByValue] = sortOrder === 'desc' ? 'desc' : 'asc';
      } else if (!sortByTotalStock) {
        orderBy.name = 'asc'; // default
      }

      const orderByClause = Object.keys(orderBy).length ? orderBy : undefined;
      // Pagination
      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const skip = (pageNum - 1) * limitNum;
      const filterByStock = hasStock === 'true' || hasStock === 'false';
      const paginateInMemory = filterByStock || sortByTotalStock;

      const products = await prisma.product.findMany({
        where,
        select: {
          id: true,
          name: true,
          mikroCode: true,
          unit: true,
          unit2: true,
          unit2Factor: true,
          excessStock: true,
          warehouseStocks: true,
          pendingCustomerOrdersByWarehouse: true,
          warehouseExcessStocks: true,
          lastEntryPrice: true,
          lastEntryDate: true,
          currentCost: true,
          currentCostDate: true,
          calculatedCost: true,
          vatRate: true,
          prices: true,
          imageUrl: true,
          imageChecksum: true,
          imageSyncStatus: true,
          imageSyncErrorType: true,
          imageSyncErrorMessage: true,
          imageSyncUpdatedAt: true,
          category: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        ...(orderByClause ? { orderBy: orderByClause } : {}),
        ...(paginateInMemory ? {} : { skip, take: limitNum }),
      });

      // Settings'den aktif depolar?? al
      const settings = await prisma.settings.findFirst();
      const includedWarehouses = settings?.includedWarehouses || [];

      // Toplam stok hesapla (sadece included warehouses)
      const productsWithTotalStock = products.map(product => {
        const warehouseStocks = product.warehouseStocks as Record<string, number> || {};
        const pendingByWarehouse = (product as any).pendingCustomerOrdersByWarehouse as Record<string, number> || {};
        const availableWarehouseStocks = applyPendingOrdersToStocks(warehouseStocks, pendingByWarehouse);
        const totalStock = includedWarehouses.reduce((sum, warehouse) => {
          return sum + (availableWarehouseStocks[warehouse] || 0);
        }, 0);

        return {
          ...product,
          warehouseStocks: availableWarehouseStocks,
          totalStock,
        };
      });

      let filteredProducts = productsWithTotalStock;
      let totalCount = 0;
      let withImageCount = 0;
      let withoutImageCount = 0;

      if (filterByStock) {
        filteredProducts = productsWithTotalStock.filter((product) => {
          const inStock = (product.totalStock || 0) > 0;
          return hasStock === 'true' ? inStock : !inStock;
        });
      }

      if (sortByTotalStock) {
        const direction = sortOrder === 'desc' ? -1 : 1;
        filteredProducts.sort((a, b) => {
          const diff = (a.totalStock - b.totalStock) * direction;
          if (diff !== 0) return diff;
          return a.name.localeCompare(b.name, 'tr');
        });
      }

      if (paginateInMemory) {
        totalCount = filteredProducts.length;
        withImageCount = filteredProducts.filter((product) => product.imageUrl).length;
        withoutImageCount = totalCount - withImageCount;
      } else {
        [totalCount, withImageCount, withoutImageCount] = await Promise.all([
          prisma.product.count({ where }),
          prisma.product.count({ where: { ...where, imageUrl: { not: null } } }),
          prisma.product.count({ where: { ...where, imageUrl: null } }),
        ]);
      }

      const pagedProducts = paginateInMemory
        ? filteredProducts.slice(skip, skip + limitNum)
        : productsWithTotalStock;

      const priceStatsMap = await priceListService.getPriceStatsMap(
        pagedProducts.map((product) => product.mikroCode)
      );

      const productsWithPriceLists = pagedProducts.map((product) => {
        const priceStats = priceStatsMap.get(product.mikroCode) || null;
        const mikroPriceLists: Record<string, number> = {};

        for (let listNo = 1; listNo <= 10; listNo += 1) {
          mikroPriceLists[listNo] = priceListService.getListPrice(priceStats, listNo);
        }

        return {
          ...product,
          mikroPriceLists,
        };
      });

      res.json({
        products: productsWithPriceLists,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limitNum),
        },
        stats: {
          total: totalCount,
          withImage: withImageCount,
          withoutImage: withoutImageCount,
        },
      });
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
      const where: any = { role: 'CUSTOMER', parentCustomerId: null };

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
            invoicedPriceListNo: true,
            whitePriceListNo: true,
            priceVisibility: true,
            useLastPrices: true,
            lastPriceGuardType: true,
            lastPriceCostBasis: true,
            lastPriceMinCostPercent: true,
            active: true,
          createdAt: true,
          // Mikro ERP fields
          city: true,
          district: true,
          phone: true,
          groupCode: true,
          sectorCode: true,
          paymentTerm: true,
          paymentPlanNo: true,
          paymentPlanCode: true,
          paymentPlanName: true,
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
      const { email, password, name, customerType, mikroCariCode, invoicedPriceListNo, whitePriceListNo, priceVisibility } =
        req.body as CreateCustomerRequest;
      const normalizedEmail = typeof email === 'string' ? email.trim() : '';
      const emailValue = normalizedEmail || null;
      const userRole = req.user?.role;
      const assignedSectorCodes = req.user?.assignedSectorCodes || [];
      const isSalesRep = userRole === 'SALES_REP';

      if (isSalesRep && assignedSectorCodes.length === 0) {
        return res.status(403).json({ error: 'No assigned sector codes' });
      }

      if (isSalesRep && !mikroCariCode) {
        return res.status(400).json({ error: 'Mikro cari code is required' });
      }

      // Email kontrolü
      if (emailValue) {
        const existingUser = await prisma.user.findUnique({
          where: { email: emailValue },
        });

        if (existingUser) {
          return res.status(400).json({ error: 'Email already exists' });
        }
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

          if (isSalesRep) {
            if (!cari) {
              return res.status(400).json({ error: 'Mikro cari not found' });
            }
            if (!cari.sectorCode || !assignedSectorCodes.includes(cari.sectorCode)) {
              return res.status(403).json({ error: 'You can only create customers from your assigned sectors' });
            }
          }

          if (cari) {
            mikroCariData = {
              city: cari.city,
              district: cari.district,
              phone: cari.phone,
              groupCode: cari.groupCode,
              sectorCode: cari.sectorCode,
              paymentTerm: cari.paymentTerm,
              paymentPlanNo: cari.paymentPlanNo ?? null,
              paymentPlanCode: cari.paymentPlanCode ?? null,
              paymentPlanName: cari.paymentPlanName ?? null,
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
          email: emailValue,
          password: hashedPassword,
          name,
          role: 'CUSTOMER',
          customerType,
          priceVisibility: priceVisibility || undefined,
          mikroCariCode,
          invoicedPriceListNo: invoicedPriceListNo ?? undefined,
          whitePriceListNo: whitePriceListNo ?? undefined,
          ...mikroCariData,
        },
        select: {
          id: true,
          email: true,
          name: true,
          customerType: true,
          mikroCariCode: true,
          invoicedPriceListNo: true,
          whitePriceListNo: true,
          city: true,
          district: true,
          phone: true,
          groupCode: true,
          sectorCode: true,
          paymentTerm: true,
          paymentPlanNo: true,
          paymentPlanCode: true,
          paymentPlanName: true,
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
      const {
        email,
        customerType,
        active,
        invoicedPriceListNo,
        whitePriceListNo,
        priceVisibility,
        useLastPrices,
        lastPriceGuardType,
        lastPriceCostBasis,
        lastPriceMinCostPercent,
      } = req.body;
      const normalizedEmail = typeof email === 'string' ? email.trim() : email;
      const emailValue = normalizedEmail === '' ? null : normalizedEmail;

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
      if (emailValue && emailValue !== existingCustomer.email) {
        const emailTaken = await prisma.user.findUnique({
          where: { email: emailValue as string },
        });

        if (emailTaken) {
          return res.status(400).json({ error: 'Email already in use' });
        }
      }

      // Update only editable fields (NOT Mikro fields)
      const updateData: any = {};
      if (email !== undefined) updateData.email = emailValue;
      if (customerType !== undefined) updateData.customerType = customerType;
      if (active !== undefined) updateData.active = active;
      if (invoicedPriceListNo !== undefined) updateData.invoicedPriceListNo = invoicedPriceListNo;
      if (whitePriceListNo !== undefined) updateData.whitePriceListNo = whitePriceListNo;
      if (priceVisibility !== undefined) updateData.priceVisibility = priceVisibility;
      if (useLastPrices !== undefined) updateData.useLastPrices = useLastPrices;
      if (lastPriceGuardType !== undefined) updateData.lastPriceGuardType = lastPriceGuardType;
      if (lastPriceCostBasis !== undefined) updateData.lastPriceCostBasis = lastPriceCostBasis;
      if (lastPriceMinCostPercent !== undefined) updateData.lastPriceMinCostPercent = lastPriceMinCostPercent;

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
            invoicedPriceListNo: true,
            whitePriceListNo: true,
            priceVisibility: true,
            useLastPrices: true,
            lastPriceGuardType: true,
            lastPriceCostBasis: true,
            lastPriceMinCostPercent: true,
            active: true,
          city: true,
          district: true,
          phone: true,
          groupCode: true,
          sectorCode: true,
          paymentTerm: true,
          paymentPlanNo: true,
          paymentPlanCode: true,
          paymentPlanName: true,
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
     * GET /api/admin/brands
     * List distinct brand codes from products
     */
    async getBrands(req: Request, res: Response, next: NextFunction) {
      try {
        const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
        const rows = await prisma.product.findMany({
          where: search
            ? { brandCode: { contains: search, mode: 'insensitive' } }
            : { brandCode: { not: null } },
          select: { brandCode: true },
          distinct: ['brandCode'],
        });
        const brands = rows
          .map((row) => (row.brandCode || '').trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, 'tr'));
        res.json({ brands });
      } catch (error) {
        next(error);
      }
    }

    /**
     * GET /api/admin/customers/:id/price-list-rules
     */
    async getCustomerPriceListRules(req: Request, res: Response, next: NextFunction) {
      try {
        const { id } = req.params;
        const customer = await prisma.user.findUnique({
          where: { id },
          select: { role: true },
        });

        if (!customer || customer.role !== 'CUSTOMER') {
          return res.status(404).json({ error: 'Customer not found' });
        }

        const rules = await prisma.customerPriceListRule.findMany({
          where: { customerId: id },
          orderBy: { createdAt: 'asc' },
        });

        res.json({ rules });
      } catch (error) {
        next(error);
      }
    }

    /**
     * PUT /api/admin/customers/:id/price-list-rules
     */
    async updateCustomerPriceListRules(req: Request, res: Response, next: NextFunction) {
      try {
        const { id } = req.params;
        const { rules } = req.body || {};

        if (!Array.isArray(rules)) {
          return res.status(400).json({ error: 'Rules must be an array' });
        }

        const customer = await prisma.user.findUnique({
          where: { id },
          select: { role: true },
        });

        if (!customer || customer.role !== 'CUSTOMER') {
          return res.status(404).json({ error: 'Customer not found' });
        }

        const normalizedMap = new Map<string, {
          brandCode: string | null;
          categoryId: string | null;
          invoicedPriceListNo: number;
          whitePriceListNo: number;
        }>();

        for (const rule of rules) {
          const brandCode = typeof rule?.brandCode === 'string' ? rule.brandCode.trim() : '';
          const categoryId = typeof rule?.categoryId === 'string' ? rule.categoryId.trim() : '';
          const invoiced = Number(rule?.invoicedPriceListNo);
          const white = Number(rule?.whitePriceListNo);

          if (!brandCode && !categoryId) {
            return res.status(400).json({ error: 'Brand or category is required' });
          }

          if (!Number.isFinite(invoiced) || invoiced < 6 || invoiced > 10) {
            return res.status(400).json({ error: 'Invoiced price list must be between 6 and 10' });
          }

          if (!Number.isFinite(white) || white < 1 || white > 5) {
            return res.status(400).json({ error: 'White price list must be between 1 and 5' });
          }

          const key = `${brandCode || ''}::${categoryId || ''}`;
          normalizedMap.set(key, {
            brandCode: brandCode || null,
            categoryId: categoryId || null,
            invoicedPriceListNo: invoiced,
            whitePriceListNo: white,
          });
        }

        const normalizedRules = Array.from(normalizedMap.values());

        await prisma.$transaction([
          prisma.customerPriceListRule.deleteMany({ where: { customerId: id } }),
          ...(normalizedRules.length > 0
            ? [prisma.customerPriceListRule.createMany({
                data: normalizedRules.map((rule) => ({
                  ...rule,
                  customerId: id,
                })),
              })]
            : []),
        ]);

        const updatedRules = await prisma.customerPriceListRule.findMany({
          where: { customerId: id },
          orderBy: { createdAt: 'asc' },
        });

        res.json({ rules: updatedRules });
      } catch (error) {
        next(error);
      }
    }

  /**
   * GET /api/admin/customers/:id/sub-users
   */
  async getCustomerSubUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const subUsers = await prisma.user.findMany({
        where: { parentCustomerId: id, active: true },
        select: {
          id: true,
          name: true,
          email: true,
          active: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      res.json({ subUsers });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/customers/:id/sub-users
   */
  async createCustomerSubUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { name, email, password, active, autoCredentials } = req.body;
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      const trimmedEmail = typeof email === 'string' ? email.trim() : '';
      const trimmedPassword = typeof password === 'string' ? password.trim() : '';

      const parentCustomer = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          role: true,
          customerType: true,
          priceVisibility: true,
          mikroCariCode: true,
        },
      });

      if (!parentCustomer || parentCustomer.role !== 'CUSTOMER') {
        return res.status(404).json({ error: 'Customer not found' });
      }

      if (!trimmedName) {
        return res.status(400).json({ error: 'Name is required' });
      }

      let finalEmail = trimmedEmail;
      let plainPassword = trimmedPassword;
      let generatedCredentials: { username: string; password: string } | null = null;

      if (autoCredentials || !finalEmail) {
        const base = buildSubUserBase(parentCustomer.mikroCariCode, parentCustomer.id);
        let index = 1;
        while (true) {
          const candidate = `${base}-${index}`;
          const existingUser = await prisma.user.findFirst({
            where: {
              OR: [{ email: candidate }, { mikroCariCode: candidate }],
            },
            select: { id: true },
          });
          if (!existingUser) {
            finalEmail = candidate;
            break;
          }
          index += 1;
        }
        if (!plainPassword) {
          plainPassword = `${finalEmail}123`;
        }
        generatedCredentials = { username: finalEmail, password: plainPassword };
      }

      if (!finalEmail) {
        return res.status(400).json({ error: 'Email is required' });
      }

      if (!plainPassword) {
        return res.status(400).json({ error: 'Password is required' });
      }

      const existingEmail = await prisma.user.findUnique({
        where: { email: finalEmail },
      });

      if (existingEmail) {
        return res.status(400).json({ error: 'Email already exists' });
      }

      const hashedPassword = await hashPassword(plainPassword);

      const subUser = await prisma.user.create({
        data: {
          email: finalEmail,
          password: hashedPassword,
          name: trimmedName,
          role: 'CUSTOMER',
          parentCustomerId: parentCustomer.id,
          customerType: parentCustomer.customerType,
          priceVisibility: parentCustomer.priceVisibility,
          active: active !== undefined ? active : true,
        },
        select: {
          id: true,
          name: true,
          email: true,
          active: true,
          createdAt: true,
        },
      });

      await prisma.cart.create({
        data: {
          userId: subUser.id,
        },
      });

      res.status(201).json({ subUser, credentials: generatedCredentials });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/admin/customers/sub-users/:id
   */
  async updateCustomerSubUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { name, email, password, active } = req.body;
      const trimmedEmail = typeof email === 'string' ? email.trim() : email;

      const existingUser = await prisma.user.findUnique({
        where: { id },
        select: { id: true, parentCustomerId: true, email: true },
      });

      if (!existingUser || !existingUser.parentCustomerId) {
        return res.status(404).json({ error: 'Sub user not found' });
      }

      if (trimmedEmail && trimmedEmail !== existingUser.email) {
        const emailTaken = await prisma.user.findUnique({ where: { email: trimmedEmail } });
        if (emailTaken) {
          return res.status(400).json({ error: 'Email already in use' });
        }
      }

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (email !== undefined) updateData.email = trimmedEmail === '' ? null : trimmedEmail;
      if (active !== undefined) updateData.active = active;
      if (password) {
        updateData.password = await hashPassword(password);
      }

      const updated = await prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          name: true,
          email: true,
          active: true,
          createdAt: true,
        },
      });

      res.json({ subUser: updated });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/admin/customers/sub-users/:id
   */
  async deleteCustomerSubUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existingUser = await prisma.user.findUnique({
        where: { id },
        select: { id: true, parentCustomerId: true, active: true },
      });

      if (!existingUser || !existingUser.parentCustomerId) {
        return res.status(404).json({ error: 'Sub user not found' });
      }

      if (existingUser.active) {
        await prisma.user.update({
          where: { id },
          data: { active: false },
        });
      }

      res.json({ message: 'Sub user deactivated' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/customers/sub-users/:id/reset-password
   */
  async resetCustomerSubUserPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existingUser = await prisma.user.findUnique({
        where: { id },
        select: { id: true, parentCustomerId: true, email: true },
      });

      if (!existingUser || !existingUser.parentCustomerId) {
        return res.status(404).json({ error: 'Sub user not found' });
      }

      const newPassword = buildSubUserPassword(10);
      const hashedPassword = await hashPassword(newPassword);

      await prisma.user.update({
        where: { id },
        data: { password: hashedPassword },
      });

      res.json({
        credentials: {
          username: existingUser.email || existingUser.id,
          password: newPassword,
        },
      });
    } catch (error) {
      next(error);
    }
  }


  /**
   * GET /api/admin/customers/:id/contacts
   */
  async getCustomerContacts(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const userRole = req.user?.role;
      const assignedSectorCodes = req.user?.assignedSectorCodes || [];

      if (userRole === 'SALES_REP') {
        const customer = await prisma.user.findUnique({
          where: { id },
          select: { role: true, sectorCode: true },
        });

        if (!customer || customer.role !== 'CUSTOMER') {
          return res.status(404).json({ error: 'Customer not found' });
        }

        if (!customer.sectorCode || !assignedSectorCodes.includes(customer.sectorCode)) {
          return res.status(403).json({ error: 'You can only access customers in your assigned sectors' });
        }
      }

      const contacts = await prisma.customerContact.findMany({
        where: { customerId: id },
        orderBy: { createdAt: 'asc' },
      });

      res.json({ contacts });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/customers/:id/contacts
   */
  async createCustomerContact(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { name, phone, email } = req.body || {};
      const trimmedName = (name || '').trim();

      if (!trimmedName) {
        return res.status(400).json({ error: 'Contact name is required' });
      }

      const userRole = req.user?.role;
      const assignedSectorCodes = req.user?.assignedSectorCodes || [];

      const customer = await prisma.user.findUnique({
        where: { id },
        select: { role: true, sectorCode: true },
      });

      if (!customer || customer.role !== 'CUSTOMER') {
        return res.status(404).json({ error: 'Customer not found' });
      }

      if (userRole === 'SALES_REP') {
        if (!customer.sectorCode || !assignedSectorCodes.includes(customer.sectorCode)) {
          return res.status(403).json({ error: 'You can only access customers in your assigned sectors' });
        }
      }

      const contact = await prisma.customerContact.create({
        data: {
          customerId: id,
          name: trimmedName,
          phone: phone ? String(phone).trim() : null,
          email: email ? String(email).trim() : null,
        },
      });

      res.status(201).json({ contact });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/admin/customers/:id/contacts/:contactId
   */
  async updateCustomerContact(req: Request, res: Response, next: NextFunction) {
    try {
      const { id, contactId } = req.params;
      const { name, phone, email } = req.body || {};

      if (name === undefined && phone === undefined && email === undefined) {
        return res.status(400).json({ error: 'No fields provided to update' });
      }

      const userRole = req.user?.role;
      const assignedSectorCodes = req.user?.assignedSectorCodes || [];

      const customer = await prisma.user.findUnique({
        where: { id },
        select: { role: true, sectorCode: true },
      });

      if (!customer || customer.role !== 'CUSTOMER') {
        return res.status(404).json({ error: 'Customer not found' });
      }

      if (userRole === 'SALES_REP') {
        if (!customer.sectorCode || !assignedSectorCodes.includes(customer.sectorCode)) {
          return res.status(403).json({ error: 'You can only access customers in your assigned sectors' });
        }
      }

      const existingContact = await prisma.customerContact.findFirst({
        where: { id: contactId, customerId: id },
      });

      if (!existingContact) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      const updateData: any = {};
      if (name !== undefined) {
        const trimmed = String(name).trim();
        if (!trimmed) {
          return res.status(400).json({ error: 'Contact name is required' });
        }
        updateData.name = trimmed;
      }
      if (phone !== undefined) {
        const trimmedPhone = String(phone).trim();
        updateData.phone = trimmedPhone ? trimmedPhone : null;
      }
      if (email !== undefined) {
        const trimmedEmail = String(email).trim();
        updateData.email = trimmedEmail ? trimmedEmail : null;
      }

      const contact = await prisma.customerContact.update({
        where: { id: contactId },
        data: updateData,
      });

      res.json({ contact });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/admin/customers/:id/contacts/:contactId
   */
  async deleteCustomerContact(req: Request, res: Response, next: NextFunction) {
    try {
      const { id, contactId } = req.params;
      const userRole = req.user?.role;
      const assignedSectorCodes = req.user?.assignedSectorCodes || [];

      const customer = await prisma.user.findUnique({
        where: { id },
        select: { role: true, sectorCode: true },
      });

      if (!customer || customer.role !== 'CUSTOMER') {
        return res.status(404).json({ error: 'Customer not found' });
      }

      if (userRole === 'SALES_REP') {
        if (!customer.sectorCode || !assignedSectorCodes.includes(customer.sectorCode)) {
          return res.status(403).json({ error: 'You can only access customers in your assigned sectors' });
        }
      }

      const existingContact = await prisma.customerContact.findFirst({
        where: { id: contactId, customerId: id },
      });

      if (!existingContact) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      await prisma.customerContact.delete({ where: { id: contactId } });

      res.json({ message: 'Contact deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/exchange/usd
   */
  async getUsdSellingRate(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await fetchUsdSellingRate();
      res.json({
        currency: 'USD',
        rate: result.rate,
        fetchedAt: result.fetchedAt,
        source: 'TCMB',
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
          requestedBy: {
            select: { id: true, name: true, email: true },
          },
          customerRequest: {
            select: {
              id: true,
              createdAt: true,
              requestedBy: { select: { id: true, name: true, email: true } },
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
      const { adminNote, invoicedSeries, whiteSeries } = req.body || {};
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

      const result = await orderService.approveOrderAndWriteToMikro(id, adminNote, {
        invoiced: invoicedSeries,
        white: whiteSeries,
      });

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
      const { itemIds, adminNote, invoicedSeries, whiteSeries } = req.body || {};
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

      const result = await orderService.approveOrderItemsAndWriteToMikro(id, itemIds, adminNote, {
        invoiced: invoicedSeries,
        white: whiteSeries,
      });

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
    let processedImage: { imageUrl: string; filePath: string; checksum: string; buffer: Buffer } | null = null;

    try {
      const { id } = req.params;

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const product = await prisma.product.findUnique({
        where: { id },
        select: {
          id: true,
          mikroCode: true,
        },
      });

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      const tempPath = (req.file as any).path || path.join(process.cwd(), 'uploads', req.file.filename);
      processedImage = await imageService.processUploadedProductImage(tempPath, product.mikroCode);

      const guidRows = await mikroService.getProductGuidsByCodes([product.mikroCode]);
      const productGuid = guidRows.find((row) => row.code === product.mikroCode)?.guid || guidRows[0]?.guid;

      if (!productGuid) {
        await imageService.removeLocalFile(processedImage.filePath);
        return res.status(500).json({ error: 'Mikro GUID bulunamadi' });
      }

      await imageService.uploadImageToMikro(productGuid, processedImage.buffer);

      const updatedProduct = await prisma.product.update({
        where: { id },
        data: {
          imageUrl: processedImage.imageUrl,
          imageChecksum: processedImage.checksum,
          imageSyncStatus: 'SUCCESS',
          imageSyncErrorType: null,
          imageSyncErrorMessage: null,
          imageSyncUpdatedAt: new Date(),
        },
      });

      res.json({
        success: true,
        imageUrl: updatedProduct.imageUrl,
        imageChecksum: updatedProduct.imageChecksum,
        imageSyncUpdatedAt: updatedProduct.imageSyncUpdatedAt,
        message: 'Foto?raf ba?ar?yla y?klendi'
      });
    } catch (error) {
      if (processedImage?.filePath) {
        await imageService.removeLocalFile(processedImage.filePath);
      }
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
        data: {
          imageUrl: null,
          imageChecksum: null,
          imageSyncStatus: null,
          imageSyncErrorType: null,
          imageSyncErrorMessage: null,
          imageSyncUpdatedAt: new Date(),
        },
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
              paymentPlanNo: cariData.paymentPlanNo ?? null,
              paymentPlanCode: cariData.paymentPlanCode ?? null,
              paymentPlanName: cariData.paymentPlanName ?? null,
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
      const pageValue = page !== undefined ? parseInt(page as string, 10) : undefined;
      const limitValue = limit !== undefined ? parseInt(limit as string, 10) : undefined;

      const data = await reportsService.getCostUpdateAlerts({
        page: pageValue,
        limit: limitValue,
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
      const { startDate, endDate, includeCompleted, customerType, category, status, page, limit, sortBy, sortOrder } = req.query;

      const data = await reportsService.getMarginComplianceReport({
        startDate: startDate as string,
        endDate: endDate as string,
        includeCompleted: includeCompleted ? parseInt(includeCompleted as string) : undefined,
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
   * POST /admin/reports/margin-compliance/sync
   * Secili gun raporunu tekrar cekip DB'ye yazar
   */
  async syncMarginComplianceReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { reportDate, includeCompleted } = req.body || {};
      const parsedDate = parseReportDateInput(reportDate);
      if (!parsedDate) {
        return res.status(400).json({ error: 'Rapor tarihi gerekli (YYYYMMDD).' });
      }

      const result = await reportsService.syncMarginComplianceReportForDate(parsedDate, {
        includeCompleted: includeCompleted !== undefined ? Number(includeCompleted) : undefined,
      });

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || 'Rapor cekilemedi' });
      }

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /admin/reports/margin-compliance/email
   * Secili gun raporunu manuel mail olarak gonderir
   */
  async sendMarginComplianceReportEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const { reportDate } = req.body || {};
      const parsedDate = parseReportDateInput(reportDate);
      if (!parsedDate) {
        return res.status(400).json({ error: 'Rapor tarihi gerekli (YYYYMMDD).' });
      }

      const day = await prisma.marginComplianceReportDay.findUnique({
        where: { reportDate: parsedDate },
        select: { status: true },
      });

      if (!day || day.status !== 'SUCCESS') {
        return res.status(409).json({ error: 'Veri hazir degil. Once raporu senkronize edin.' });
      }

      const settings = await prisma.settings.findFirst();
      const recipients = settings?.marginReportEmailRecipients || [];
      if (!recipients.length) {
        return res.status(400).json({ error: 'Mail alicisi bulunamadi.' });
      }

      const emailPayload = await reportsService.buildMarginComplianceEmailPayload(
        parsedDate,
        settings?.marginReportEmailColumns || []
      );

      await emailService.sendMarginComplianceReportSummary({
        recipients,
        reportDate: parsedDate,
        summary: emailPayload.summary,
        subject: settings?.marginReportEmailSubject || undefined,
        attachment: emailPayload.attachment,
      });

      res.json({ success: true, message: 'Mail gonderildi.' });
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

  /**
   * En Çok Satan Ürünler Raporu
   */
  async getTopProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        startDate,
        endDate,
        brand,
        category,
        minQuantity,
        sortBy,
        page,
        limit,
      } = req.query;

      const data = await reportsService.getTopProducts({
        startDate: startDate as string,
        endDate: endDate as string,
        brand: brand as string,
        category: category as string,
        minQuantity: minQuantity ? parseInt(minQuantity as string) : undefined,
        sortBy: (sortBy as 'revenue' | 'profit' | 'margin' | 'quantity') || 'revenue',
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 50,
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
   * En Çok Satın Alan Müşteriler Raporu
   */
  async getTopCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        startDate,
        endDate,
        sector,
        minOrderAmount,
        sortBy,
        page,
        limit,
      } = req.query;

      const data = await reportsService.getTopCustomers({
        startDate: startDate as string,
        endDate: endDate as string,
        sector: sector as string,
        minOrderAmount: minOrderAmount ? parseInt(minOrderAmount as string) : undefined,
        sortBy: (sortBy as 'revenue' | 'profit' | 'margin' | 'orderCount') || 'revenue',
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 50,
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
   * Ürün Müşteri Detay Raporu - Belirli bir ürünü hangi müşterilerin aldığını gösterir
   */
  async getProductCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const { productCode } = req.params;
      const {
        startDate,
        endDate,
        page,
        limit,
      } = req.query;

      const result = await reportsService.getProductCustomers({
        productCode,
        startDate: startDate as string,
        endDate: endDate as string,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Exclusion Management - Get all exclusions
   * GET /api/admin/exclusions
   */
  async getExclusions(req: Request, res: Response, next: NextFunction) {
    try {
      const { activeOnly } = req.query;
      const exclusions = await exclusionService.getExclusions(activeOnly === 'true');

      res.json({
        success: true,
        data: exclusions,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Exclusion Management - Create a new exclusion
   * POST /api/admin/exclusions
   */
  async createExclusion(req: Request, res: Response, next: NextFunction) {
    try {
      const { type, value, description } = req.body;
      const userId = (req.user as any)?.userId;

      const exclusion = await exclusionService.createExclusion({
        type,
        value,
        description,
        createdBy: userId,
      });

      res.status(201).json({
        success: true,
        message: 'Hariç tutma kuralı oluşturuldu',
        data: exclusion,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Exclusion Management - Update an exclusion
   * PUT /api/admin/exclusions/:id
   */
  async updateExclusion(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { value, description, active } = req.body;

      const exclusion = await exclusionService.updateExclusion(id, {
        value,
        description,
        active,
      });

      res.json({
        success: true,
        message: 'Hariç tutma kuralı güncellendi',
        data: exclusion,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Exclusion Management - Delete an exclusion
   * DELETE /api/admin/exclusions/:id
   */
  async deleteExclusion(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      await exclusionService.deleteExclusion(id);

      res.json({
        success: true,
        message: 'Hariç tutma kuralı silindi',
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new AdminController();
