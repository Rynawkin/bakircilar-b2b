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
import orderProductChangeRequestService from '../services/order-product-change-request.service';
import customer360Service from '../services/customer360.service';
import fieldSalesService from '../services/field-sales.service';
import customerRecoveryService from '../services/customer-recovery.service';
import emailService from '../services/email.service';
import priceSyncService from '../services/priceSync.service';
import priceHistoryNewService from '../services/priceHistoryNew.service';
import exclusionService from '../services/exclusion.service';
import priceListService from '../services/price-list.service';
import productComplementService from '../services/product-complement.service';
import customerCategoryPurchaseService from '../services/customer-category-purchase.service';
import { cacheService } from '../services/cache.service';
import MIKRO_TABLES from '../config/mikro-tables';
import { splitSearchTokens, normalizeSearchText } from '../utils/search';
import { getUploadsDir } from '../utils/storage';
import { CreateCustomerRequest, SetCategoryPriceRuleRequest } from '../types';
import { invalidateCustomerStaticCache } from './customer.controller';

const DEFAULT_CUSTOMER_PRICE_LISTS = {
  BAYI: { invoiced: 6, white: 1 },
  PERAKENDE: { invoiced: 6, white: 1 },
  VIP: { invoiced: 6, white: 1 },
  OZEL: { invoiced: 6, white: 1 },
};

const PRODUCT_SELECT = {
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
  hiddenFromCustomers: true,
  isFeatured: true,
  featuredOrder: true,
  excludeFromDiscount: true,
  category: {
    select: {
      id: true,
      mikroCode: true,
      name: true,
    },
  },
};

const buildReportRequestContext = (req: Request) => ({
  userId: req.user?.userId,
  role: req.user?.role,
  assignedSectorCodes: req.user?.assignedSectorCodes || [],
});

const parseBooleanQuery = (value: unknown) => value === true || value === 'true' || value === '1';

const buildProductsWithPriceLists = async (products: any[]) => {
  if (!products || products.length === 0) return [];

  const settings = await prisma.settings.findFirst();
  const includedWarehouses = settings?.includedWarehouses || [];

  const productsWithTotalStock = products.map((product) => {
    const warehouseStocks = (product.warehouseStocks as Record<string, number>) || {};
    const pendingByWarehouse =
      (product as any).pendingCustomerOrdersByWarehouse as Record<string, number> || {};
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

  const priceStatsMap = await priceListService.getPriceStatsMap(
    productsWithTotalStock.map((product) => product.mikroCode)
  );

  return productsWithTotalStock.map((product) => {
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

const resolveScopedCustomerForInsights = async (req: Request, customerIdOrCode?: string | null) => {
  const key = String(customerIdOrCode || '').trim();
  if (!key) return null;

  const where: any = {
    role: 'CUSTOMER',
    parentCustomerId: null,
    OR: [{ id: key }, { mikroCariCode: key.toUpperCase() }],
  };

  if (req.user?.role === 'SALES_REP') {
    const sectorCodes = req.user?.assignedSectorCodes || [];
    if (sectorCodes.length === 0) return null;
    where.sectorCode = { in: sectorCodes };
  }

  return prisma.user.findFirst({
    where,
    select: {
      id: true,
      mikroCariCode: true,
      sectorCode: true,
    },
  });
};

const attachCategoryLastPurchases = async (
  products: any[],
  customerCode?: string | null
) => {
  if (!customerCode || products.length === 0) return products;
  const categoryLastByProduct = await customerCategoryPurchaseService.getProductCategoryLastPurchases(
    customerCode,
    products
  );

  return products.map((product) => {
    const code = String(product?.mikroCode || '').trim().toUpperCase();
    const categoryLastPurchase = categoryLastByProduct.get(code) || null;
    return {
      ...product,
      categoryLastPurchase,
      categoryLastPurchaseDate: categoryLastPurchase?.lastPurchaseDate || null,
      categoryMonthsSinceLastPurchase: categoryLastPurchase?.monthsSinceLastPurchase ?? null,
    };
  });
};

type DashboardPeriod = 'daily' | 'weekly' | 'monthly' | 'custom';

const parseDashboardDate = (value: unknown): Date | null => {
  if (!value || typeof value !== 'string') return null;
  const cleaned = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return null;
  const parsed = new Date(`${cleaned}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const getDashboardPeriod = (value: unknown): DashboardPeriod => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'weekly') return 'weekly';
  if (normalized === 'monthly') return 'monthly';
  if (normalized === 'custom') return 'custom';
  return 'daily';
};

const getPeriodRange = (
  period: DashboardPeriod,
  customStartDate?: unknown,
  customEndDate?: unknown
) => {
  const now = new Date();
  const start = new Date(now);
  let resolvedPeriod: DashboardPeriod = period;

  if (period === 'custom') {
    const parsedStart = parseDashboardDate(customStartDate);
    const parsedEnd = parseDashboardDate(customEndDate);
    if (parsedStart && parsedEnd && parsedStart <= parsedEnd) {
      parsedStart.setHours(0, 0, 0, 0);
      parsedEnd.setHours(23, 59, 59, 999);
      return { start: parsedStart, end: parsedEnd, resolvedPeriod };
    }
    resolvedPeriod = 'daily';
  }

  if (resolvedPeriod === 'weekly') {
    // Monday-start week for TR business reporting.
    const day = start.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diffToMonday);
  } else if (resolvedPeriod === 'monthly') {
    start.setDate(1);
  }

  start.setHours(0, 0, 0, 0);
  return { start, end: now, resolvedPeriod };
};

const toIsoDate = (value: Date) => {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const escapeSqlString = (value: string) => String(value || '').replace(/'/g, "''");

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
      let settings = await prisma.settings.findFirst({
        orderBy: [
          { updatedAt: 'desc' },
          { createdAt: 'desc' },
        ],
      });

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

      let settings = await prisma.settings.findFirst({
        orderBy: [
          { updatedAt: 'desc' },
          { createdAt: 'desc' },
        ],
      });

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
        customerId,
        customerCode,
        hiddenFromCustomers,
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

      if (hiddenFromCustomers === 'true') {
        where.hiddenFromCustomers = true;
      } else if (hiddenFromCustomers === 'false') {
        where.hiddenFromCustomers = false;
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
          hiddenFromCustomers: true,
          imageChecksum: true,
          imageSyncStatus: true,
          imageSyncErrorType: true,
          imageSyncErrorMessage: true,
          imageSyncUpdatedAt: true,
          category: {
            select: {
              id: true,
              mikroCode: true,
              name: true,
            },
          },
        },
        ...(orderByClause ? { orderBy: orderByClause } : {}),
        ...(paginateInMemory ? {} : { skip, take: limitNum }),
      });

      // Settings'den aktif depolar?? al
      const settings = await prisma.settings.findFirst({
        orderBy: [
          { updatedAt: 'desc' },
          { createdAt: 'desc' },
        ],
      });
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

      const insightCustomer = await resolveScopedCustomerForInsights(
        req,
        typeof customerId === 'string' && customerId ? customerId : typeof customerCode === 'string' ? customerCode : null
      );
      const productsWithInsights = await attachCategoryLastPurchases(
        productsWithPriceLists,
        insightCustomer?.mikroCariCode || null
      );

      res.json({
        products: productsWithInsights,
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
   * PATCH /api/admin/products/:id/customer-visibility
   * Müşteri panelindeki ürün görünürlüğünü yönetir.
   */
  async updateProductCustomerVisibility(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const hiddenFromCustomers = Boolean(req.body?.hiddenFromCustomers);

      const product = await prisma.product.update({
        where: { id },
        data: { hiddenFromCustomers },
        select: {
          id: true,
          mikroCode: true,
          name: true,
          hiddenFromCustomers: true,
        },
      });

      await Promise.all([
        cacheService.invalidateAllProductCache(),
        cacheService.deletePattern('recommendations:*'),
      ]);

      res.json({
        success: true,
        product,
        message: hiddenFromCustomers
          ? 'Urun musteri panelinden gizlendi'
          : 'Urun musteri panelinde gosterilecek',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/admin/products/:id/flags
   * Yonetici flag'leri: ana sayfada one cikar (isFeatured/featuredOrder) +
   * fazla stok olsa bile indirime sokma (excludeFromDiscount).
   */
  async updateProductFlags(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const data: { isFeatured?: boolean; featuredOrder?: number; excludeFromDiscount?: boolean } = {};
      if (typeof req.body?.isFeatured === 'boolean') data.isFeatured = req.body.isFeatured;
      if (typeof req.body?.excludeFromDiscount === 'boolean') data.excludeFromDiscount = req.body.excludeFromDiscount;
      if (req.body?.featuredOrder !== undefined && req.body?.featuredOrder !== null) {
        const n = Number(req.body.featuredOrder);
        if (Number.isFinite(n)) data.featuredOrder = Math.trunc(n);
      }

      const product = await prisma.product.update({
        where: { id },
        data,
        select: {
          id: true,
          mikroCode: true,
          name: true,
          isFeatured: true,
          featuredOrder: true,
          excludeFromDiscount: true,
        },
      });

      await Promise.all([
        cacheService.invalidateAllProductCache(),
        cacheService.deletePattern('recommendations:*'),
      ]);

      res.json({ success: true, product });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/products/by-codes
   * Kod listesine gore urunleri getirir.
   */
  async getProductsByCodes(req: Request, res: Response, next: NextFunction) {
    try {
      const { codes } = req.body as { codes?: string[] };
      const normalizedCodes = Array.from(
        new Set((codes || []).map((code) => String(code || '').trim()).filter(Boolean))
      );

      if (normalizedCodes.length === 0) {
        res.json({ products: [], total: 0 });
        return;
      }

      const products = await prisma.product.findMany({
        where: { mikroCode: { in: normalizedCodes } },
        select: PRODUCT_SELECT,
      });

      const productsWithPriceLists = await buildProductsWithPriceLists(products);
      const inClause = normalizedCodes.map((code) => `'${code.replace(/'/g, "''")}'`).join(',');
      const normalizeColumnName = (value: unknown) =>
        String(value || '')
          .trim()
          .toLowerCase();
      const sanitizeSqlIdentifier = (value: string) =>
        String(value || '').replace(/[^a-z0-9_]/gi, '');
      const vatColumnCandidates = Array.from(
        new Set(
          [
            normalizeColumnName(MIKRO_TABLES.PRODUCTS_COLUMNS.VAT_RATE),
            'sto_toptan_vergi',
            'sto_perakende_vergi',
            'sto_oivvergipntr',
          ].filter(Boolean)
        )
      );
      const costColumnCandidates = Array.from(
        new Set(
          [
            normalizeColumnName(MIKRO_TABLES.PRODUCTS_COLUMNS.CURRENT_COST),
            'sto_standartmaliyet',
          ].filter(Boolean)
        )
      );
      const columnCandidates = Array.from(new Set([...vatColumnCandidates, ...costColumnCandidates]));

      let availableColumns = new Set<string>();
      try {
        if (columnCandidates.length > 0) {
          const columnInClause = columnCandidates.map((column) => `'${escapeSqlString(column)}'`).join(',');
          const columnRows = await mikroService.executeQuery(`
            SELECT LOWER(COLUMN_NAME) AS columnName
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'STOKLAR'
              AND LOWER(COLUMN_NAME) IN (${columnInClause})
          `);
          availableColumns = new Set(
            (columnRows || [])
              .map((row: any) => normalizeColumnName(row?.columnName))
              .filter(Boolean)
          );
        }
      } catch {
        availableColumns = new Set<string>();
      }

      const probeFirstExistingColumn = async (candidates: string[]): Promise<string | null> => {
        for (const candidate of candidates) {
          const safeCandidate = sanitizeSqlIdentifier(candidate);
          if (!safeCandidate) continue;
          try {
            await mikroService.executeQuery(`
              SELECT TOP 1 ISNULL(s.[${safeCandidate}], 0) AS probeValue
              FROM STOKLAR s
              WHERE s.sto_kod IN (${inClause})
            `);
            return safeCandidate;
          } catch (error: any) {
            const message = String(error?.message || '').toLowerCase();
            if (!message.includes('invalid column name')) {
              throw error;
            }
          }
        }
        return null;
      };

      const selectedVatColumnRaw =
        vatColumnCandidates.find((column) => availableColumns.has(column)) || null;
      const selectedCostColumnRaw =
        costColumnCandidates.find((column) => availableColumns.has(column)) || null;
      let selectedVatColumn = selectedVatColumnRaw ? sanitizeSqlIdentifier(selectedVatColumnRaw) : null;
      let selectedCostColumn = selectedCostColumnRaw ? sanitizeSqlIdentifier(selectedCostColumnRaw) : null;
      if (!selectedVatColumn) {
        selectedVatColumn = await probeFirstExistingColumn(vatColumnCandidates);
      }
      if (!selectedCostColumn) {
        selectedCostColumn = await probeFirstExistingColumn(costColumnCandidates);
      }
      const supplierBaseQuery = `
        SELECT
          s.sto_kod AS productCode,
          ${selectedVatColumn ? `ISNULL(s.[${selectedVatColumn}], 0)` : 'NULL'} AS vatCode,
          ${selectedCostColumn ? `ISNULL(s.[${selectedCostColumn}], 0)` : 'NULL'} AS mikroCurrentCost,
          LTRIM(RTRIM(ISNULL(s.sto_sat_cari_kod, ''))) AS mainSupplierCode,
          LTRIM(RTRIM(ISNULL(c.cari_unvan1, ''))) AS mainSupplierName
        FROM STOKLAR s
        LEFT JOIN CARI_HESAPLAR c
          ON c.cari_kod = LTRIM(RTRIM(ISNULL(s.sto_sat_cari_kod, '')))
        WHERE s.sto_kod IN (${inClause})
      `;
      const supplierFallbackQuery = `
        SELECT
          s.sto_kod AS productCode,
          NULL AS vatCode,
          NULL AS mikroCurrentCost,
          LTRIM(RTRIM(ISNULL(s.sto_sat_cari_kod, ''))) AS mainSupplierCode,
          LTRIM(RTRIM(ISNULL(c.cari_unvan1, ''))) AS mainSupplierName
        FROM STOKLAR s
        LEFT JOIN CARI_HESAPLAR c
          ON c.cari_kod = LTRIM(RTRIM(ISNULL(s.sto_sat_cari_kod, '')))
        WHERE s.sto_kod IN (${inClause})
      `;

      let supplierRows: any[] = [];
      try {
        supplierRows = await mikroService.executeQuery(supplierBaseQuery);
      } catch (error: any) {
        const message = String(error?.message || '').toLowerCase();
        if (!message.includes('invalid column name')) {
          throw error;
        }
        // Kolon adlari farkliysa ana akis bozulmasin, tedarikci bilgileriyle devam et.
        supplierRows = await mikroService.executeQuery(supplierFallbackQuery);
      }
      const supplierByCode = new Map<
        string,
        { code: string | null; name: string | null; vatCode: number; mikroCurrentCost: number | null }
      >();
      (supplierRows || []).forEach((row: any) => {
        const productCode = String(row?.productCode || '').trim().toUpperCase();
        if (!productCode) return;
        const mainSupplierCode = String(row?.mainSupplierCode || '').trim() || null;
        const mainSupplierName = String(row?.mainSupplierName || '').trim() || null;
        const vatCode = Number(row?.vatCode ?? 0);
        const mikroCurrentCostRaw = Number(row?.mikroCurrentCost);
        const mikroCurrentCost = Number.isFinite(mikroCurrentCostRaw) ? mikroCurrentCostRaw : null;
        supplierByCode.set(productCode, {
          code: mainSupplierCode,
          name: mainSupplierName,
          vatCode: Number.isFinite(vatCode) ? vatCode : 0,
          mikroCurrentCost,
        });
      });

      const productsByCode = new Map<string, any>();
      productsWithPriceLists.forEach((product: any) => {
        const code = String(product?.mikroCode || '').trim().toUpperCase();
        if (code) productsByCode.set(code, product);
      });

      const enrichedProducts = normalizedCodes.map((requestedCode) => {
        const normalizedCode = String(requestedCode || '').trim().toUpperCase();
        const product = productsByCode.get(normalizedCode);
        const supplier = supplierByCode.get(normalizedCode);
        const currentVatRate = Number(product?.vatRate ?? 0);
        const fallbackVatRate = Number(
          mikroService.convertVatCodeToRate(Number(supplier?.vatCode ?? 0))
        );
        const currentCost = Number(product?.currentCost);
        const fallbackCurrentCost = Number(supplier?.mikroCurrentCost);
        const resolvedVatRate =
          Number.isFinite(currentVatRate) && currentVatRate > 0
            ? currentVatRate
            : Number.isFinite(fallbackVatRate)
            ? fallbackVatRate
            : 0;
        const resolvedCurrentCost =
          Number.isFinite(currentCost) && currentCost > 0
            ? currentCost
            : Number.isFinite(fallbackCurrentCost) && fallbackCurrentCost > 0
            ? fallbackCurrentCost
            : Number.isFinite(currentCost)
            ? currentCost
            : null;

        const baseProduct =
          product ||
          ({
            id: null,
            name: normalizedCode,
            mikroCode: normalizedCode,
            unit: null,
            unit2: null,
            unit2Factor: null,
            excessStock: 0,
            warehouseStocks: {},
            pendingCustomerOrdersByWarehouse: {},
            warehouseExcessStocks: {},
            totalStock: 0,
            lastEntryPrice: null,
            lastEntryDate: null,
            currentCost: null,
            currentCostDate: null,
            calculatedCost: null,
            vatRate: 0,
            prices: {},
            imageUrl: null,
            category: null,
            mikroPriceLists: {},
          } as any);

        return {
          ...baseProduct,
          mikroCode: normalizedCode,
          currentCost: resolvedCurrentCost,
          vatRate: resolvedVatRate,
          mainSupplierCode: supplier?.code || null,
          mainSupplierName: supplier?.name || null,
        };
      });
      res.json({ products: enrichedProducts, total: enrichedProducts.length });
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

      const { active, search, page, pageSize } = req.query;

      // Base where clause
      const where: any = { role: 'CUSTOMER', parentCustomerId: null };

      // SALES_REP ise sektör filtresi uygula
      if (userRole === 'SALES_REP') {
        where.sectorCode = { in: assignedSectorCodes };
      }

      // Aktiflik filtresi (sunucu-tarafli; sayfalama ile tutarli olmasi icin)
      if (active === 'active') where.active = true;
      else if (active === 'inactive') where.active = false;

      // Sunucu-tarafli arama (tüm kayıtlarda): çok-token AND
      const custSearchTokens = (typeof search === 'string' ? search : '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 8);
      if (custSearchTokens.length > 0) {
        where.AND = custSearchTokens.map((tok) => ({
          OR: [
            { name: { contains: tok, mode: 'insensitive' } },
            { email: { contains: tok, mode: 'insensitive' } },
            { mikroCariCode: { contains: tok, mode: 'insensitive' } },
            { city: { contains: tok, mode: 'insensitive' } },
            { district: { contains: tok, mode: 'insensitive' } },
            { phone: { contains: tok, mode: 'insensitive' } },
          ],
        }));
      }

      const select: any = {
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
            lastPriceGuardInvoicedListNo: true,
            lastPriceGuardWhiteListNo: true,
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
      };

      const rawCustPageSize = Number(pageSize);
      const custPaginated = Number.isFinite(rawCustPageSize) && rawCustPageSize > 0;
      if (!custPaginated) {
        const customers = await prisma.user.findMany({
          where,
          select,
          orderBy: { createdAt: 'desc' },
        });
        res.json({ customers });
        return;
      }
      const custSize = Math.min(Math.max(1, Math.floor(rawCustPageSize)), 200);
      const rawCustPage = Number(page);
      const custPage = Number.isFinite(rawCustPage) && rawCustPage > 0 ? Math.floor(rawCustPage) : 1;
      const [custTotal, customers] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          select,
          orderBy: { createdAt: 'desc' },
          skip: (custPage - 1) * custSize,
          take: custSize,
        }),
      ]);
      res.json({
        customers,
        pagination: {
          total: custTotal,
          page: custPage,
          pageSize: custSize,
          totalPages: Math.max(1, Math.ceil(custTotal / custSize)),
        },
      });
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
        lastPriceGuardInvoicedListNo,
        lastPriceGuardWhiteListNo,
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
      if (lastPriceGuardInvoicedListNo !== undefined) updateData.lastPriceGuardInvoicedListNo = lastPriceGuardInvoicedListNo;
      if (lastPriceGuardWhiteListNo !== undefined) updateData.lastPriceGuardWhiteListNo = lastPriceGuardWhiteListNo;
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
            lastPriceGuardInvoicedListNo: true,
            lastPriceGuardWhiteListNo: true,
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
   * GET /api/admin/customer-360/search
   */
  async searchCustomer360(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await customer360Service.searchCustomers({
        search: String(req.query.search || ''),
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        scope: {
          role: req.user?.role,
          assignedSectorCodes: req.user?.assignedSectorCodes || [],
        },
      });
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/customer-360/:customerId
   */
  async getCustomer360(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await customer360Service.getCustomer360({
        customerIdOrCode: String(req.params.customerId || ''),
        scope: {
          role: req.user?.role,
          assignedSectorCodes: req.user?.assignedSectorCodes || [],
        },
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/field-sales/customers
   */
  async searchFieldSalesCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await fieldSalesService.searchCustomers({
        search: String(req.query.search || ''),
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        scope: buildReportRequestContext(req),
      });
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/field-sales/customers/:customerId
   */
  async getFieldSalesCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await fieldSalesService.getCustomerSnapshot({
        customerIdOrCode: String(req.params.customerId || ''),
        scope: buildReportRequestContext(req),
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/field-sales/products
   */
  async searchFieldSalesProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const safeMode = req.query.safeMode === undefined ? true : parseBooleanQuery(req.query.safeMode);
      const data = await fieldSalesService.searchProducts({
        search: String(req.query.search || ''),
        customerIdOrCode: req.query.customerId ? String(req.query.customerId) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        safeMode,
        scope: buildReportRequestContext(req),
      });
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/field-sales/products/:productCode
   */
  async getFieldSalesProduct(req: Request, res: Response, next: NextFunction) {
    try {
      const safeMode = req.query.safeMode === undefined ? true : parseBooleanQuery(req.query.safeMode);
      const data = await fieldSalesService.getProductDetail({
        productCode: String(req.params.productCode || ''),
        customerIdOrCode: req.query.customerId ? String(req.query.customerId) : undefined,
        safeMode,
        scope: buildReportRequestContext(req),
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/field-sales/customers/:customerId/opportunities
   */
  async getFieldSalesOpportunities(req: Request, res: Response, next: NextFunction) {
    try {
      const opportunities = await fieldSalesService.getCustomerOpportunities(
        String(req.params.customerId || ''),
        buildReportRequestContext(req)
      );
      res.json({ success: true, data: opportunities });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/field-sales/visit-customers
   */
  async createFieldSalesVisitCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await fieldSalesService.createVisitCustomer({
        customerName: req.body?.customerName,
        phone: req.body?.phone,
        email: req.body?.email,
        note: req.body?.note,
        demand: req.body?.demand,
        competitorInfo: req.body?.competitorInfo,
        photoUrl: req.body?.photoUrl,
        latitude: req.body?.latitude,
        longitude: req.body?.longitude,
        force: parseBooleanQuery(req.body?.force), // 4.6: benzer cari uyarisini bilerek gecmek icin
        scope: buildReportRequestContext(req),
      });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/field-sales/visits
   */
  async getFieldSalesVisits(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await fieldSalesService.listVisits({
        search: String(req.query.search || ''),
        startDate: req.query.startDate ? String(req.query.startDate) : undefined,
        endDate: req.query.endDate ? String(req.query.endDate) : undefined,
        onlyVisitCustomers: parseBooleanQuery(req.query.onlyVisitCustomers),
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        scope: buildReportRequestContext(req),
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/field-sales/customers/:customerId/visit-notes
   */
  async getFieldSalesVisitNotes(req: Request, res: Response, next: NextFunction) {
    try {
      const notes = await fieldSalesService.getVisitNotes(
        String(req.params.customerId || ''),
        buildReportRequestContext(req),
        req.query.limit ? Number(req.query.limit) : undefined
      );
      res.json({ success: true, data: { notes } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/field-sales/customers/:customerId/visit-notes
   */
  async createFieldSalesVisitNote(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await fieldSalesService.createVisitNote({
        customerIdOrCode: String(req.params.customerId || ''),
        scope: buildReportRequestContext(req),
        note: req.body?.note,
        demand: req.body?.demand,
        competitorInfo: req.body?.competitorInfo,
        photoUrl: req.body?.photoUrl,
        latitude: req.body?.latitude,
        longitude: req.body?.longitude,
      });
      res.status(201).json({ success: true, data });
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
      const { status, source, search, page, pageSize } = req.query;
      const userRole = req.user?.role;
      const assignedSectorCodes = req.user?.assignedSectorCodes || [];

      const where: any = {};
      if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status as string)) {
        where.status = status;
      }

      // SALES_REP ise sadece atanan sektörlerdeki müşterilerin siparişlerini göster
      if (userRole === 'SALES_REP') {
        if (assignedSectorCodes.length === 0) {
          res.json({ orders: [] });
          return;
        }
        where.user = {
          sectorCode: { in: assignedSectorCodes }
        };
      }

      const andClauses: any[] = [];

      // Kaynak filtresi (Müşteri / B2B) - frontend sourceTab mantığıyla birebir
      if (source === 'CUSTOMER') {
        andClauses.push({
          OR: [
            { customerRequest: { isNot: null } },
            { AND: [{ requestedById: null }, { sourceQuoteId: null }] },
          ],
        });
      } else if (source === 'B2B') {
        andClauses.push({
          AND: [
            { customerRequest: { is: null } },
            { OR: [{ requestedById: { not: null } }, { sourceQuoteId: { not: null } }] },
          ],
        });
      }

      // Sunucu-tarafli arama (tüm kayıtlarda): çok-token AND
      const orderSearchTokens = (typeof search === 'string' ? search : '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 8);
      for (const tok of orderSearchTokens) {
        andClauses.push({
          OR: [
            { orderNumber: { contains: tok, mode: 'insensitive' } },
            { customerOrderNumber: { contains: tok, mode: 'insensitive' } },
            { adminNote: { contains: tok, mode: 'insensitive' } },
            { deliveryLocation: { contains: tok, mode: 'insensitive' } },
            {
              user: {
                OR: [
                  { name: { contains: tok, mode: 'insensitive' } },
                  { displayName: { contains: tok, mode: 'insensitive' } },
                  { mikroName: { contains: tok, mode: 'insensitive' } },
                  { mikroCariCode: { contains: tok, mode: 'insensitive' } },
                ],
              },
            },
            { sourceQuote: { quoteNumber: { contains: tok, mode: 'insensitive' } } },
            {
              items: {
                some: {
                  OR: [
                    { productName: { contains: tok, mode: 'insensitive' } },
                    { mikroCode: { contains: tok, mode: 'insensitive' } },
                    { lineNote: { contains: tok, mode: 'insensitive' } },
                  ],
                },
              },
            },
          ],
        });
      }
      if (andClauses.length > 0) where.AND = andClauses;

      const include: any = {
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
          sourceQuote: {
            select: { id: true, quoteNumber: true, createdAt: true },
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
                  vatRate: true,
                },
              },
            },
          },
      };

      const rawOrderPageSize = Number(pageSize);
      const orderPaginated = Number.isFinite(rawOrderPageSize) && rawOrderPageSize > 0;
      if (!orderPaginated) {
        const orders = await prisma.order.findMany({
          where,
          include,
          orderBy: { createdAt: 'desc' },
        });
        res.json({ orders });
        return;
      }
      const orderSize = Math.min(Math.max(1, Math.floor(rawOrderPageSize)), 200);
      const rawOrderPage = Number(page);
      const orderPage = Number.isFinite(rawOrderPage) && rawOrderPage > 0 ? Math.floor(rawOrderPage) : 1;
      const [orderTotal, orders] = await Promise.all([
        prisma.order.count({ where }),
        prisma.order.findMany({
          where,
          include,
          orderBy: { createdAt: 'desc' },
          skip: (orderPage - 1) * orderSize,
          take: orderSize,
        }),
      ]);
      res.json({
        orders,
        pagination: {
          total: orderTotal,
          page: orderPage,
          pageSize: orderSize,
          totalPages: Math.max(1, Math.ceil(orderTotal / orderSize)),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/orders/:id
   */
  async getOrderById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const userRole = req.user?.role;
      const assignedSectorCodes = req.user?.assignedSectorCodes || [];

      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          user: { select: { sectorCode: true } },
        },
      });

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      if (userRole == 'SALES_REP') {
        if (!order.user.sectorCode || !assignedSectorCodes.includes(order.user.sectorCode)) {
          return res.status(403).json({
            error: 'You can only access orders from customers in your assigned sectors',
          });
        }
      }

      const detail = await orderService.getOrderById(id);
      res.json({ order: detail });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/admin/orders/:id
   */
  async updateOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const {
        items,
        customerOrderNumber,
        deliveryLocation,
        invoicedSeries,
        invoicedSira,
        whiteSeries,
        whiteSira,
      } = req.body || {};
      const userRole = req.user?.role;
      const assignedSectorCodes = req.user?.assignedSectorCodes || [];

      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          user: { select: { sectorCode: true } },
        },
      });

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      if (userRole == 'SALES_REP') {
        if (!order.user.sectorCode || !assignedSectorCodes.includes(order.user.sectorCode)) {
          return res.status(403).json({
            error: 'You can only update orders from customers in your assigned sectors',
          });
        }
      }

      const updated = await orderService.updateOrder(id, {
        items,
        customerOrderNumber,
        deliveryLocation,
        invoicedSeries,
        invoicedSira,
        whiteSeries,
        whiteSira,
      });

      res.json({ order: updated });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/orders/last-orders
   */
  async getLastOrdersForCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const { customerId, customerCode, productCodes, limit, excludeOrderId } = req.body || {};
      if ((!customerId && !customerCode) || !Array.isArray(productCodes) || productCodes.length === 0) {
        return res.json({ lastOrders: {} });
      }

      const normalizedCodes = productCodes.map((code: any) => String(code)).filter(Boolean);
      const safeLimit = Math.max(1, Math.min(10, Number(limit) || 1));
      console.log('LastOrders request', {
        customerId: customerId ? String(customerId) : null,
        customerCode: customerCode ? String(customerCode).trim() : null,
        productCodeCount: normalizedCodes.length,
        limit: safeLimit,
      });
      const lastOrders = await orderService.getCustomerLastOrderItems(
        customerId ? String(customerId) : '',
        normalizedCodes,
        safeLimit,
        excludeOrderId ? String(excludeOrderId) : undefined,
        customerCode ? String(customerCode).trim() : undefined
      );

      const totalRows = Object.values(lastOrders).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
      console.log('LastOrders response', { totalRows, productCount: Object.keys(lastOrders).length });

      res.json({ lastOrders });
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
      if (userRole === 'SALES_REP' && assignedSectorCodes.length === 0) {
        res.json({ orders: [] });
        return;
      }
      const sectorFilter = userRole === 'SALES_REP' ? assignedSectorCodes : undefined;

      const orders = await orderService.getPendingOrders(sectorFilter);
      res.json({ orders });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/orders/manual
   * Manual order entry for staff
   */
  async createManualOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        customerId,
        items,
        warehouseNo,
        description,
        documentDescription,
        documentNo,
        invoicedSeries,
        invoicedSira,
        whiteSeries,
        whiteSira,
      } = req.body || {};

      const result = await orderService.createManualOrder({
        customerId,
        items,
        warehouseNo,
        description,
        documentDescription,
        documentNo,
        invoicedSeries,
        invoicedSira,
        whiteSeries,
        whiteSira,
        requestedById: req.user?.userId,
      });

      res.json({
        message: 'Order created in Mikro',
        mikroOrderIds: result.mikroOrderIds,
        orderId: result.orderId,
        orderNumber: result.orderNumber,
      });
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
   * PATCH /api/admin/categories/:id/image
   * Kategori kesfi gorseli set/kaldir. Body: { imageUrl: string | null }
   */
  async setCategoryImage(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const rawImageUrl = req.body?.imageUrl;
      const imageUrl =
        typeof rawImageUrl === 'string' && rawImageUrl.trim() ? rawImageUrl.trim() : null;

      const category = await prisma.category.update({
        where: { id },
        data: { imageUrl },
      });

      // Kategori gorseli degisti -> musteri kategori cache'ini temizle (aninda yansisin)
      invalidateCustomerStaticCache('customer:categories');

      res.json({ category });
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

      // 10.2: Override kaydedilince o ürünün satış fiyatlarını ANINDA yeniden hesapla.
      // Fiyat formülü değişmez; sadece kayıttan sonra recalc tetiklenir.
      const recalculated = await pricingService.recalculatePricesForProduct(productId);

      res.json({
        message: 'Price override set successfully',
        recalculated,
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
      const userRole = req.user?.role;
      const assignedSectorCodes = req.user?.assignedSectorCodes || [];
      const ownSectorCode = (req.user as any)?.sectorCode || null;
      const requestedPeriod = getDashboardPeriod(req.query?.period);
      const periodRange = getPeriodRange(
        requestedPeriod,
        req.query?.startDate,
        req.query?.endDate
      );
      const period = periodRange.resolvedPeriod;

      const isSalesRep = userRole === 'SALES_REP';
      const salesRepScopeCodes = isSalesRep
        ? []
        : await mikroService.executeQuery(`
            SELECT DISTINCT LTRIM(RTRIM(ISNULL(sktr_kod, ''))) AS sectorCode
            FROM STOK_SEKTORLERI
            WHERE ISNULL(sktr_iptal, 0) = 0
              AND LTRIM(RTRIM(ISNULL(sktr_kod, ''))) <> ''
              AND UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                LTRIM(RTRIM(ISNULL(sktr_ismi, ''))),
                'İ','I'),'İ','I'),'Ş','S'),'Ğ','G'),'Ü','U'),'Ö','O'),'Ç','C')) = 'SATIS'
          `).then((rows: any[]) =>
            Array.from(
              new Set(
                rows
                  .map((row) => String(row?.sectorCode || '').trim())
                  .filter(Boolean)
              )
            )
          );
      const sectorCodes = isSalesRep
        ? (
            assignedSectorCodes.length > 0
              ? assignedSectorCodes
              : ownSectorCode
                ? [ownSectorCode]
                : []
          )
        : salesRepScopeCodes;
      const hasSectorScope = sectorCodes.length > 0;
      const sectorFilter = hasSectorScope ? sectorCodes : undefined;
      const customerWhere = hasSectorScope
        ? { role: 'CUSTOMER' as const, active: true, sectorCode: { in: sectorCodes } }
        : { role: 'CUSTOMER' as const, active: true };
      const startDateSql = toIsoDate(periodRange.start);
      const endDateSql = toIsoDate(periodRange.end);
      const normalizedSectorTokens = hasSectorScope
        ? Array.from(
            new Set(
              sectorCodes
                .map((raw) => String(raw || '').trim())
                .filter(Boolean)
                .map((value) =>
                  value
                    .toUpperCase()
                    .replace(/İ/g, 'I')
                    .replace(/Ş/g, 'S')
                    .replace(/Ğ/g, 'G')
                    .replace(/Ü/g, 'U')
                    .replace(/Ö/g, 'O')
                    .replace(/Ç/g, 'C')
                )
            )
          )
        : [];
      const sectorInSql = normalizedSectorTokens.length > 0
        ? normalizedSectorTokens.map((code) => `'${escapeSqlString(code)}'`).join(', ')
        : '';
      const normalizedSectorSqlExpr = (columnName: string) =>
        `UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(${columnName}, ''))), 'İ', 'I'), 'İ', 'I'), 'Ş', 'S'), 'Ğ', 'G'), 'Ü', 'U'), 'Ö', 'O'), 'Ç', 'C'))`;
      const sectorConditionSql = hasSectorScope
        ? ` AND ${normalizedSectorSqlExpr('c.cari_sektor_kodu')} IN (${sectorInSql})`
        : '';
      const fetchMikroSalesSummary = async () => {
        const sqlQuery = `
          SELECT
            COUNT(DISTINCT CONCAT(sth.sth_evrakno_seri, '-', CAST(sth.sth_evrakno_sira AS VARCHAR(30)))) AS salesCount,
            ISNULL(SUM(ISNULL(sth.sth_tutar, 0)), 0) AS totalAmount
          FROM STOK_HAREKETLERI sth WITH (NOLOCK)
          LEFT JOIN CARI_HESAPLAR c WITH (NOLOCK) ON c.cari_kod = sth.sth_cari_kodu
          WHERE sth.sth_cins = 0
            AND sth.sth_tip = 1
            AND sth.sth_tarih >= '${startDateSql}'
            AND sth.sth_tarih < DATEADD(DAY, 1, '${endDateSql}')
            ${sectorConditionSql}
        `;
        const rows = await mikroService.executeQuery(sqlQuery);
        const row = rows?.[0] || {};
        return {
          count: Number(row.salesCount || 0),
          amount: Number(row.totalAmount || 0),
        };
      };
      const fetchMikroOrderSummary = async () => {
        const sqlQuery = `
          SELECT
            COUNT(DISTINCT CONCAT(s.sip_evrakno_seri, '-', CAST(s.sip_evrakno_sira AS VARCHAR(30)))) AS orderCount,
            ISNULL(SUM(
              CASE
                WHEN ISNULL(s.sip_tutar, 0) = 0 THEN ISNULL(s.sip_miktar, 0) * ISNULL(s.sip_b_fiyat, 0)
                ELSE ISNULL(s.sip_tutar, 0)
              END
            ), 0) AS totalAmount
          FROM SIPARISLER s WITH (NOLOCK)
          LEFT JOIN CARI_HESAPLAR c WITH (NOLOCK) ON c.cari_kod = s.sip_musteri_kod
          WHERE s.sip_tip = 0
            AND ISNULL(s.sip_iptal, 0) = 0
            AND s.sip_tarih >= '${startDateSql}'
            AND s.sip_tarih < DATEADD(DAY, 1, '${endDateSql}')
            ${sectorConditionSql}
        `;
        const rows = await mikroService.executeQuery(sqlQuery);
        const row = rows?.[0] || {};
        return {
          count: Number(row.orderCount || 0),
          amount: Number(row.totalAmount || 0),
        };
      };
      const fetchMikroQuoteSummary = async () => {
        const sqlQuery = `
          SELECT
            COUNT(DISTINCT CONCAT(t.tkl_evrakno_seri, '-', CAST(t.tkl_evrakno_sira AS VARCHAR(30)))) AS quoteCount,
            ISNULL(SUM(ISNULL(t.tkl_Brut_fiyat, 0)), 0) AS totalAmount
          FROM VERILEN_TEKLIFLER t WITH (NOLOCK)
          LEFT JOIN CARI_HESAPLAR c WITH (NOLOCK) ON c.cari_kod = t.tkl_cari_kod
          WHERE ISNULL(t.tkl_iptal, 0) = 0
            AND t.tkl_evrak_tarihi >= '${startDateSql}'
            AND t.tkl_evrak_tarihi < DATEADD(DAY, 1, '${endDateSql}')
            ${sectorConditionSql}
        `;
        const rows = await mikroService.executeQuery(sqlQuery);
        const row = rows?.[0] || {};
        return {
          count: Number(row.quoteCount || 0),
          amount: Number(row.totalAmount || 0),
        };
      };

      const [
        orderStats,
        customerCount,
        productCount,
        lastSync,
        salesSummary,
        mikroOrderSummary,
        mikroQuoteSummary,
      ] = await Promise.all([
        orderService.getOrderStats(sectorFilter),
        prisma.user.count({ where: customerWhere }),
        prisma.product.count({ where: { active: true, excessStock: { gt: 0 } } }),
        prisma.settings.findFirst({ select: { lastSyncAt: true } }),
        fetchMikroSalesSummary().catch(() => ({ count: 0, amount: 0 })),
        fetchMikroOrderSummary().catch(() => ({ count: 0, amount: 0 })),
        fetchMikroQuoteSummary().catch(() => ({ count: 0, amount: 0 })),
      ]);

      res.json({
        orders: orderStats,
        customerCount,
        excessProductCount: productCount,
        lastSyncAt: lastSync?.lastSyncAt,
        period,
        periodRange: {
          startAt: periodRange.start.toISOString(),
          endAt: periodRange.end.toISOString(),
        },
        sectorScope: {
          mode: isSalesRep ? (assignedSectorCodes.length > 0 ? 'assigned' : ownSectorCode ? 'self' : 'all') : 'all',
          codes: sectorCodes,
        },
        summary: {
          sales: {
            count: salesSummary.count,
            amount: salesSummary.amount,
          },
          orders: {
            count: mikroOrderSummary.count,
            amount: mikroOrderSummary.amount,
          },
          quotes: {
            count: mikroQuoteSummary.count,
            amount: mikroQuoteSummary.amount,
          },
        },
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
   * Get all staff members (ADMIN, MANAGER, SALES_REP, DEPOCU)
   */
  async getStaffMembers(req: Request, res: Response, next: NextFunction) {
    try {
      const staff = await prisma.user.findMany({
        where: {
          role: {
            in: ['ADMIN', 'MANAGER', 'SALES_REP', 'DEPOCU']
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
   * Create new staff member (SALES_REP, MANAGER or DEPOCU)
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

      if (!['SALES_REP', 'MANAGER', 'DEPOCU'].includes(role)) {
        return res.status(400).json({ error: 'Role must be SALES_REP, MANAGER or DEPOCU' });
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

      if (!['ADMIN', 'MANAGER', 'SALES_REP', 'DEPOCU'].includes(existingStaff.role)) {
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

      const tempPath = (req.file as any).path || path.join(getUploadsDir(), req.file.filename);
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

      const settings = await prisma.settings.findFirst({
        orderBy: [
          { updatedAt: 'desc' },
          { createdAt: 'desc' },
        ],
      });
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
   * GET /api/admin/reports/complement-missing
   * Tamamlayici urunleri eksik olanlar raporu
   */
  async getComplementMissingReport(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        mode,
        productCode,
        customerCode,
        periodMonths,
        page,
        limit,
        matchMode,
        sectorCode,
        salesRepId,
        minDocumentCount,
      } = req.query;

      const data = await reportsService.getComplementMissingReport({
        mode: mode as 'product' | 'customer',
        matchMode: matchMode as 'product' | 'category' | 'group',
        productCode: productCode as string,
        customerCode: customerCode as string,
        sectorCode: sectorCode as string,
        salesRepId: salesRepId as string,
        periodMonths: periodMonths ? parseInt(periodMonths as string, 10) : undefined,
        page: page ? parseInt(page as string, 10) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        minDocumentCount: minDocumentCount ? parseInt(minDocumentCount as string, 10) : undefined,
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
   * GET /api/admin/reports/category-churn
   * Kategori alim kaybi raporu
   */
  async getCategoryChurnReport(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        mode,
        categoryCode,
        customerCode,
        inactiveMonths,
        activeCustomerMonths,
        page,
        limit,
        sortBy,
        sortDirection,
      } = req.query;

      const data = await reportsService.getCategoryChurnReport({
        mode: mode as 'category' | 'customer',
        categoryCode: categoryCode as string,
        customerCode: customerCode as string,
        inactiveMonths: inactiveMonths ? parseInt(inactiveMonths as string, 10) : undefined,
        activeCustomerMonths: activeCustomerMonths ? parseInt(activeCustomerMonths as string, 10) : undefined,
        page: page ? parseInt(page as string, 10) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        sortBy: sortBy as any,
        sortDirection: sortDirection as 'asc' | 'desc',
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
   * GET /api/admin/reports/category-opportunity
   * Kategori firsat onerileri (cari hic almadiysa)
   */
  async getCategoryOpportunityReport(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        categoryCode,
        customerCode,
        lookbackMonths,
        minPairCount,
        limit,
      } = req.query;

      const data = await reportsService.getCategoryOpportunityReport({
        categoryCode: categoryCode as string,
        customerCode: customerCode as string,
        lookbackMonths: lookbackMonths ? parseInt(lookbackMonths as string, 10) : undefined,
        minPairCount: minPairCount ? parseInt(minPairCount as string, 10) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
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
   * GET /api/admin/reports/category-options
   * Kategori arama (kod + ad)
   */
  async getCategoryOptions(req: Request, res: Response, next: NextFunction) {
    try {
      const { search, limit } = req.query;
      const data = await reportsService.getCategoryChurnCategoryOptions({
        search: search as string,
        limit: limit ? parseInt(limit as string, 10) : undefined,
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
   * GET /api/admin/reports/category-churn/details
   * Kategori kaybi detay satirlari
   */
  async getCategoryChurnDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const { mode, categoryCode, customerCode, inactiveMonths } = req.query;
      const data = await reportsService.getCategoryChurnDetail({
        mode: mode as 'category' | 'customer',
        categoryCode: categoryCode as string,
        customerCode: customerCode as string,
        inactiveMonths: inactiveMonths ? parseInt(inactiveMonths as string, 10) : undefined,
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
   * GET /api/admin/reports/category-churn/export
   * Kategori kaybi raporu Excel
   */
  async exportCategoryChurnReport(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        mode,
        categoryCode,
        customerCode,
        inactiveMonths,
        activeCustomerMonths,
        sortBy,
        sortDirection,
      } = req.query;

      const { buffer, fileName } = await reportsService.exportCategoryChurnReport({
        mode: mode as 'category' | 'customer',
        categoryCode: categoryCode as string,
        customerCode: customerCode as string,
        inactiveMonths: inactiveMonths ? parseInt(inactiveMonths as string, 10) : undefined,
        activeCustomerMonths: activeCustomerMonths ? parseInt(activeCustomerMonths as string, 10) : undefined,
        sortBy: sortBy as any,
        sortDirection: sortDirection as 'asc' | 'desc',
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=\"${fileName}\"`);
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/reports/customer-recovery
   * Kaybedilen / hareketi dusen carileri geri kazanma raporu
   */
  async getCustomerRecoveryReport(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        recentMonths,
        baselineMonths,
        minDropPercent,
        minHistoricalActiveMonths,
        minHistoricalAmount,
        minMeaningfulMonthlyAmount,
        includeCurrentMonth,
        customerCode,
        search,
        resultSearch,
        sectorCode,
        assignedToId,
        riskTypes,
        onlyWithOpenAction,
        onlyDueFollowUp,
        minLostPotential,
        seasonalityMode,
        purchasePattern,
        page,
        limit,
        sortBy,
        sortDirection,
      } = req.query;

      const data = await customerRecoveryService.getReport({
        recentMonths: recentMonths ? parseInt(recentMonths as string, 10) : undefined,
        baselineMonths: baselineMonths ? parseInt(baselineMonths as string, 10) : undefined,
        minDropPercent: minDropPercent ? parseFloat(minDropPercent as string) : undefined,
        minHistoricalActiveMonths: minHistoricalActiveMonths ? parseInt(minHistoricalActiveMonths as string, 10) : undefined,
        minHistoricalAmount: minHistoricalAmount ? parseFloat(minHistoricalAmount as string) : undefined,
        minMeaningfulMonthlyAmount: minMeaningfulMonthlyAmount ? parseFloat(minMeaningfulMonthlyAmount as string) : undefined,
        includeCurrentMonth: parseBooleanQuery(includeCurrentMonth),
        customerCode: customerCode as string,
        search: search as string,
        resultSearch: resultSearch as string,
        sectorCode: sectorCode as string,
        assignedToId: assignedToId as string,
        riskTypes: riskTypes as string,
        onlyWithOpenAction: parseBooleanQuery(onlyWithOpenAction),
        onlyDueFollowUp: parseBooleanQuery(onlyDueFollowUp),
        minLostPotential: minLostPotential ? parseFloat(minLostPotential as string) : undefined,
        seasonalityMode: seasonalityMode as string,
        purchasePattern: purchasePattern as string,
        page: page ? parseInt(page as string, 10) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        sortBy: sortBy as any,
        sortDirection: sortDirection as 'asc' | 'desc',
      }, buildReportRequestContext(req));

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/reports/customer-recovery/historical-value
   * 2020 ve sonrasi satislari bugunku USD/TL oranina gore degerlenmis cari analizi
   */
  async getCustomerRecoveryHistoricalValueReport(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        startYear,
        inactiveMonths,
        minConsecutiveMonths,
        minMonthlyAmount,
        minTotalAdjustedAmount,
        onlyLostFrequent,
        customerCode,
        search,
        sectorCode,
        page,
        limit,
        sortBy,
        sortDirection,
      } = req.query;

      const data = await customerRecoveryService.getHistoricalValueReport({
        startYear: startYear ? parseInt(startYear as string, 10) : undefined,
        inactiveMonths: inactiveMonths ? parseInt(inactiveMonths as string, 10) : undefined,
        minConsecutiveMonths: minConsecutiveMonths ? parseInt(minConsecutiveMonths as string, 10) : undefined,
        minMonthlyAmount: minMonthlyAmount ? parseFloat(minMonthlyAmount as string) : undefined,
        minTotalAdjustedAmount: minTotalAdjustedAmount ? parseFloat(minTotalAdjustedAmount as string) : undefined,
        onlyLostFrequent: onlyLostFrequent === undefined ? undefined : parseBooleanQuery(onlyLostFrequent),
        customerCode: customerCode as string,
        search: search as string,
        sectorCode: sectorCode as string,
        page: page ? parseInt(page as string, 10) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        sortBy: sortBy as any,
        sortDirection: sortDirection as 'asc' | 'desc',
      }, buildReportRequestContext(req));

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/reports/customer-recovery/historical-value/export
   * Degerlenmis cari analizi Excel export
   */
  async exportCustomerRecoveryHistoricalValueReport(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        startYear,
        inactiveMonths,
        minConsecutiveMonths,
        minMonthlyAmount,
        minTotalAdjustedAmount,
        onlyLostFrequent,
        customerCode,
        search,
        sectorCode,
        sortBy,
        sortDirection,
      } = req.query;

      const { buffer, fileName } = await customerRecoveryService.exportHistoricalValueReport({
        startYear: startYear ? parseInt(startYear as string, 10) : undefined,
        inactiveMonths: inactiveMonths ? parseInt(inactiveMonths as string, 10) : undefined,
        minConsecutiveMonths: minConsecutiveMonths ? parseInt(minConsecutiveMonths as string, 10) : undefined,
        minMonthlyAmount: minMonthlyAmount ? parseFloat(minMonthlyAmount as string) : undefined,
        minTotalAdjustedAmount: minTotalAdjustedAmount ? parseFloat(minTotalAdjustedAmount as string) : undefined,
        onlyLostFrequent: onlyLostFrequent === undefined ? undefined : parseBooleanQuery(onlyLostFrequent),
        customerCode: customerCode as string,
        search: search as string,
        sectorCode: sectorCode as string,
        sortBy: sortBy as any,
        sortDirection: sortDirection as 'asc' | 'desc',
      }, buildReportRequestContext(req));

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=\"${fileName}\"`);
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/reports/customer-recovery/export
   * Cari geri kazanim raporu Excel export
   */
  async exportCustomerRecoveryReport(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        recentMonths,
        baselineMonths,
        minDropPercent,
        minHistoricalActiveMonths,
        minHistoricalAmount,
        minMeaningfulMonthlyAmount,
        includeCurrentMonth,
        customerCode,
        search,
        resultSearch,
        sectorCode,
        assignedToId,
        riskTypes,
        onlyWithOpenAction,
        onlyDueFollowUp,
        minLostPotential,
        seasonalityMode,
        purchasePattern,
        sortBy,
        sortDirection,
      } = req.query;

      const { buffer, fileName } = await customerRecoveryService.exportReport({
        recentMonths: recentMonths ? parseInt(recentMonths as string, 10) : undefined,
        baselineMonths: baselineMonths ? parseInt(baselineMonths as string, 10) : undefined,
        minDropPercent: minDropPercent ? parseFloat(minDropPercent as string) : undefined,
        minHistoricalActiveMonths: minHistoricalActiveMonths ? parseInt(minHistoricalActiveMonths as string, 10) : undefined,
        minHistoricalAmount: minHistoricalAmount ? parseFloat(minHistoricalAmount as string) : undefined,
        minMeaningfulMonthlyAmount: minMeaningfulMonthlyAmount ? parseFloat(minMeaningfulMonthlyAmount as string) : undefined,
        includeCurrentMonth: parseBooleanQuery(includeCurrentMonth),
        customerCode: customerCode as string,
        search: search as string,
        resultSearch: resultSearch as string,
        sectorCode: sectorCode as string,
        assignedToId: assignedToId as string,
        riskTypes: riskTypes as string,
        onlyWithOpenAction: parseBooleanQuery(onlyWithOpenAction),
        onlyDueFollowUp: parseBooleanQuery(onlyDueFollowUp),
        minLostPotential: minLostPotential ? parseFloat(minLostPotential as string) : undefined,
        seasonalityMode: seasonalityMode as string,
        purchasePattern: purchasePattern as string,
        sortBy: sortBy as any,
        sortDirection: sortDirection as 'asc' | 'desc',
      }, buildReportRequestContext(req));

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=\"${fileName}\"`);
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/reports/customer-recovery/:customerCode/detail
   * Cari geri kazanim detay kirilimi
   */
  async getCustomerRecoveryDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const { customerCode } = req.params;
      const {
        recentMonths,
        baselineMonths,
        minDropPercent,
        minHistoricalActiveMonths,
        minHistoricalAmount,
        minMeaningfulMonthlyAmount,
        includeCurrentMonth,
        seasonalityMode,
        purchasePattern,
      } = req.query;

      const data = await customerRecoveryService.getCustomerDetail(customerCode, {
        recentMonths: recentMonths ? parseInt(recentMonths as string, 10) : undefined,
        baselineMonths: baselineMonths ? parseInt(baselineMonths as string, 10) : undefined,
        minDropPercent: minDropPercent ? parseFloat(minDropPercent as string) : undefined,
        minHistoricalActiveMonths: minHistoricalActiveMonths ? parseInt(minHistoricalActiveMonths as string, 10) : undefined,
        minHistoricalAmount: minHistoricalAmount ? parseFloat(minHistoricalAmount as string) : undefined,
        minMeaningfulMonthlyAmount: minMeaningfulMonthlyAmount ? parseFloat(minMeaningfulMonthlyAmount as string) : undefined,
        includeCurrentMonth: parseBooleanQuery(includeCurrentMonth),
        seasonalityMode: seasonalityMode as string,
        purchasePattern: purchasePattern as string,
      }, buildReportRequestContext(req));

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/reports/customer-recovery/:customerCode/actions
   * Cari geri kazanim not ve aksiyon gecmisi
   */
  async getCustomerRecoveryActions(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await customerRecoveryService.getCustomerActions(req.params.customerCode);
      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/reports/customer-recovery/actions/assigned
   * Giris yapan kullaniciya atanmis geri kazanim aksiyonlari
   */
  async getAssignedCustomerRecoveryActions(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await customerRecoveryService.getAssignedActions(req.user!.userId, req.query);
      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/reports/customer-recovery/:customerCode/actions
   * Cari geri kazanim notu / gorev aksiyonu olusturur
   */
  async createCustomerRecoveryAction(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await customerRecoveryService.createAction(req.params.customerCode, req.body, req.user?.userId);
      res.status(201).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/admin/reports/customer-recovery/actions/:id
   * Cari geri kazanim aksiyonunu gunceller
   */
  async updateCustomerRecoveryAction(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await customerRecoveryService.updateAction(req.params.id, req.body, req.user?.userId);
      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/reports/customer-recovery/bulk-assign
   * Secilen cariler icin toplu takip atamasi olusturur
   */
  async bulkAssignCustomerRecovery(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await customerRecoveryService.bulkAssign(req.body, req.user?.userId);
      res.status(201).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/reports/customer-activity
   * Musteri aktivite ve davranis raporu
   */
  async getCustomerActivityReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, customerCode, userId, page, limit } = req.query;

      const data = await reportsService.getCustomerActivityReport({
        startDate: startDate as string,
        endDate: endDate as string,
        customerCode: customerCode as string,
        userId: userId as string,
        page: page ? parseInt(page as string, 10) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
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
   * GET /api/admin/reports/staff-activity
   * Personel aktivite raporu (sales rep, manager, depocu vb.)
   */
  async getStaffActivityReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, role, userId, page, limit, route } = req.query;

      const data = await reportsService.getStaffActivityReport({
        startDate: startDate as string,
        endDate: endDate as string,
        role: role as any,
        userId: userId as string,
        route: route as string,
        page: page ? parseInt(page as string, 10) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
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
   * GET /api/admin/reports/customer-carts
   * Musterilerin guncel sepetlerini listeler
   */
  async getCustomerCartsReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { search, includeEmpty, page, limit } = req.query;

      const data = await reportsService.getCustomerCartsReport({
        search: search as string,
        includeEmpty: includeEmpty === '1' || includeEmpty === 'true',
        page: page ? parseInt(page as string, 10) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
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
   * GET /api/admin/reports/ucarer-depo
   * Ucarer depo karar raporu (Merkez/Topca)
   */
  async getUcarerDepotReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { depot, limit, all } = req.query;

      const data = await reportsService.getUcarerDepotReport({
        depot: String(depot || 'MERKEZ').toUpperCase() === 'TOPCA' ? 'TOPCA' : 'MERKEZ',
        limit: limit ? parseInt(limit as string, 10) : undefined,
        all: all === '1' || all === 'true',
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
   * POST /api/admin/reports/ucarer-minmax/run
   * MinMax dinamik hesap prosedurunu calistirir
   */
  async runUcarerMinMaxReport(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await reportsService.startUcarerMinMaxJob({
        userId: req.user?.userId || null,
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
   * GET /api/admin/reports/ucarer-minmax/status
   */
  async getUcarerMinMaxJobStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const jobId = typeof req.query.jobId === 'string' ? req.query.jobId : null;
      const data = reportsService.getUcarerMinMaxJobStatus(jobId);
      if (!data) {
        return res.status(404).json({ error: 'MinMax hesaplama isi bulunamadi' });
      }

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/reports/ucarer-minmax-excluded
   */
  async getUcarerMinMaxExcludedProductsReport(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await reportsService.getUcarerMinMaxExcludedProductsReport();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/reports/ucarer-incoming-order-details
   */
  async getUcarerIncomingOrderDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const productCode = String(req.query.productCode || '').trim();
      const data = await reportsService.getUcarerIncomingOrderDetails(productCode);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/reports/ucarer-supplier-recent-series
   */
  async getUcarerSupplierRecentSeries(req: Request, res: Response, next: NextFunction) {
    try {
      const rawCodes = Array.isArray(req.query.codes)
        ? req.query.codes.join(',')
        : String(req.query.codes || '');
      const supplierCodes = rawCodes
        .split(',')
        .map((code) => String(code || '').trim())
        .filter(Boolean);
      const data = await reportsService.getUcarerRecentSupplierOrderSeries(supplierCodes);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/reports/ucarer-depo/order-product-change-requests
   */
  async createUcarerOrderProductChangeRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await orderProductChangeRequestService.createFromUcarerRedirect({
        sourceProductCode: String(req.body?.sourceProductCode || ''),
        targetProductCode: String(req.body?.targetProductCode || ''),
        depot: req.body?.depot ? String(req.body.depot) : null,
        familyId: req.body?.familyId ? String(req.body.familyId) : null,
        familyCode: req.body?.familyCode ? String(req.body.familyCode) : null,
        familyName: req.body?.familyName ? String(req.body.familyName) : null,
        note: req.body?.note ? String(req.body.note) : null,
        requestedById: req.user?.userId || null,
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/order-product-change-requests
   */
  async getOrderProductChangeRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await orderProductChangeRequestService.list(
        {
          userId: req.user?.userId || null,
          role: req.user?.role || null,
        },
        {
          status: req.query.status ? String(req.query.status) : 'PENDING',
          limit: req.query.limit ? Number(req.query.limit) : undefined,
        }
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/order-product-change-requests/:id/approve
   */
  async approveOrderProductChangeRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await orderProductChangeRequestService.approve(String(req.params.id || ''), {
        userId: req.user?.userId || null,
        role: req.user?.role || null,
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/order-product-change-requests/:id/reject
   */
  async rejectOrderProductChangeRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await orderProductChangeRequestService.reject(
        String(req.params.id || ''),
        {
          userId: req.user?.userId || null,
          role: req.user?.role || null,
        },
        req.body?.reason ? String(req.body.reason) : null
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/reports/ucarer-product-sales-history
   */
  async getUcarerProductSalesHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const productCode = String(req.query.productCode || '').trim();
      const data = await reportsService.getUcarerProductSalesHistory(productCode);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/reports/ucarer-product-sales-history/mark-toplu
   */
  async markUcarerSalesLineAsToplu(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await reportsService.markUcarerSalesLineAsToplu({
        productCode: String(req.body?.productCode || ''),
        lineGuid: String(req.body?.lineGuid || ''),
        documentSeries: String(req.body?.documentSeries || ''),
        documentSequence: Number(req.body?.documentSequence || 0),
        documentLineNo: Number(req.body?.documentLineNo || 0),
        userId: req.user?.userId || null,
      });

      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/reports/ucarer-product-purchase-history
   */
  async getUcarerProductPurchaseHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const productCode = String(req.query.productCode || '').trim();
      const data = await reportsService.getUcarerProductPurchaseHistory(productCode);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/reports/ucarer-minmax-exclusion
   */
  async setUcarerMinMaxExclusion(req: Request, res: Response, next: NextFunction) {
    try {
      const { productCode, exclude, resetMinMaxValues, depot } = req.body as {
        productCode?: string;
        exclude?: boolean;
        resetMinMaxValues?: boolean;
        depot?: 'MERKEZ' | 'TOPCA';
      };
      const data = await reportsService.setUcarerMinMaxExclusion({
        productCode: String(productCode || ''),
        exclude: Boolean(exclude),
        resetMinMaxValues: Boolean(resetMinMaxValues),
        depot: depot === 'TOPCA' ? 'TOPCA' : 'MERKEZ',
        userId: req.user?.userId || null,
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/reports/product-families
   */
  async getProductFamilies(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await reportsService.getProductFamilies();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/reports/product-families
   */
  async createProductFamily(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, code, note, active, productCodes } = req.body || {};
      const result = await reportsService.upsertProductFamily({
        name,
        code,
        note,
        active,
        productCodes: Array.isArray(productCodes) ? productCodes : [],
        userId: req.user?.userId || null,
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/admin/reports/product-families/:id
   */
  async updateProductFamily(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, code, note, active, productCodes } = req.body || {};
      const result = await reportsService.upsertProductFamily({
        id: req.params.id,
        name,
        code,
        note,
        active,
        productCodes: Array.isArray(productCodes) ? productCodes : [],
        userId: req.user?.userId || null,
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/admin/reports/product-families/:id
   */
  async deleteProductFamily(req: Request, res: Response, next: NextFunction) {
    try {
      await reportsService.deleteProductFamily(req.params.id, req.user?.userId || null);
      res.json({ success: true, message: 'Aile silindi.' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/reports/ucarer-depo/operation-logs
   */
  async getUcarerOperationLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await reportsService.getUcarerOperationLogs({
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        operationType: String(req.query.operationType || ''),
        productCode: String(req.query.productCode || ''),
        familyId: String(req.query.familyId || ''),
        search: String(req.query.search || ''),
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/reports/price-families
   */
  async getPriceFamilies(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await reportsService.getPriceFamilies();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/reports/price-families
   */
  async createPriceFamily(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, code, note, active, productCodes } = req.body || {};
      const result = await reportsService.upsertPriceFamily({
        name,
        code,
        note,
        active,
        productCodes: Array.isArray(productCodes) ? productCodes : [],
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/admin/reports/price-families/:id
   */
  async updatePriceFamily(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, code, note, active, productCodes } = req.body || {};
      const result = await reportsService.upsertPriceFamily({
        id: req.params.id,
        name,
        code,
        note,
        active,
        productCodes: Array.isArray(productCodes) ? productCodes : [],
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/admin/reports/price-families/:id
   */
  async deletePriceFamily(req: Request, res: Response, next: NextFunction) {
    try {
      await reportsService.deletePriceFamily(req.params.id);
      res.json({ success: true, message: 'Fiyat ailesi silindi.' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/reports/price-family-costs
   */
  async getPriceFamilyCostReport(req: Request, res: Response, next: NextFunction) {
    try {
      const statusRaw = String(req.query.status || 'problem');
      const status = statusRaw === 'all' || statusRaw === 'ok' ? statusRaw : 'problem';
      const data = await reportsService.getPriceFamilyCostReport({
        status,
        search: String(req.query.search || ''),
        includeInactive: req.query.includeInactive === '1' || req.query.includeInactive === 'true',
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/reports/price-family-costs/update-cost
   */
  async updatePriceFamilyProductCost(req: Request, res: Response, next: NextFunction) {
    try {
      const { familyId, productCode, cost, costP, costT, updatePriceLists } = req.body as {
        familyId?: string;
        productCode?: string;
        cost?: number;
        costP?: number;
        costT?: number;
        updatePriceLists?: boolean;
      };
      const data = await reportsService.updatePriceFamilyProductCost({
        familyId: String(familyId || ''),
        productCode: String(productCode || ''),
        cost: cost === undefined ? undefined : Number(cost),
        costP: costP === undefined ? undefined : Number(costP),
        costT: costT === undefined ? undefined : Number(costT),
        updatePriceLists: Boolean(updatePriceLists),
        userId: req.user?.userId || null,
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/reports/product-families/create-supplier-orders
   */
  async createSupplierOrdersFromFamilies(req: Request, res: Response, next: NextFunction) {
    try {
      const { depot, allocations, supplierConfigs } = req.body as {
        depot?: 'MERKEZ' | 'TOPCA';
        supplierConfigs?: Record<
          string,
          {
            series?: string;
            applyVAT?: boolean;
            deliveryType?: string;
            deliveryDate?: string | null;
          }
        >;
        allocations?: Array<{
          familyId?: string | null;
          productCode: string;
          quantity: number;
          unitPriceOverride?: number | null;
          supplierCodeOverride?: string | null;
          persistSupplierOverride?: boolean;
        }>;
      };
      const data = await reportsService.createSupplierOrdersFromFamilyAllocations({
        depot: depot === 'TOPCA' ? 'TOPCA' : 'MERKEZ',
        supplierConfigs: supplierConfigs || {},
        allocations: Array.isArray(allocations) ? allocations : [],
        userId: req.user?.userId || null,
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/reports/product-families/create-depot-transfer-order
   */
  async createDepotTransferOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { depot, series, allocations } = req.body as {
        depot?: 'MERKEZ' | 'TOPCA';
        series?: string;
        allocations?: Array<{ productCode?: string; quantity?: number }>;
      };
      const data = await reportsService.createDepotTransferOrder({
        depot: depot === 'TOPCA' ? 'TOPCA' : 'MERKEZ',
        series: String(series || 'DSV').trim(),
        allocations: Array.isArray(allocations)
          ? allocations.map((row) => ({
              productCode: String(row.productCode || ''),
              quantity: Number(row.quantity || 0),
            }))
          : [],
        userId: req.user?.userId || null,
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/reports/ucarer-depo/update-cost
   */
  async updateUcarerProductCost(req: Request, res: Response, next: NextFunction) {
    try {
      const { productCode, cost, costP, costT, updatePriceLists } = req.body as {
        productCode?: string;
        cost?: number;
        costP?: number;
        costT?: number;
        updatePriceLists?: boolean;
      };
      const data = await reportsService.updateUcarerProductCost({
        productCode: String(productCode || ''),
        cost: Number(cost || 0),
        costP: costP === undefined ? undefined : Number(costP),
        costT: costT === undefined ? undefined : Number(costT),
        updatePriceLists: Boolean(updatePriceLists),
        userId: req.user?.userId || null,
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/reports/ucarer-depo/update-main-supplier
   */
  async updateUcarerMainSupplier(req: Request, res: Response, next: NextFunction) {
    try {
      const { productCode, supplierCode } = req.body as {
        productCode?: string;
        supplierCode?: string;
      };
      const data = await reportsService.updateUcarerMainSupplier({
        productCode: String(productCode || ''),
        supplierCode: String(supplierCode || ''),
        userId: req.user?.userId || null,
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/recommendations/complements
   * Tamamlayici urun onerilerini getirir.
   */
  async getComplementRecommendations(req: Request, res: Response, next: NextFunction) {
    try {
      const { productCodes, limit, excludeCodes } = req.body as {
        productCodes?: string[];
        excludeCodes?: string[];
        limit?: number;
      };

      const normalizedCodes = Array.from(
        new Set((productCodes || []).map((code) => String(code || '').trim()).filter(Boolean))
      );
      const normalizedExcludeCodes = Array.from(
        new Set((excludeCodes || []).map((code) => String(code || '').trim()).filter(Boolean))
      );

      if (normalizedCodes.length === 0) {
        res.json({ success: true, products: [], total: 0 });
        return;
      }

      const sourceProducts = await prisma.product.findMany({
        where: { mikroCode: { in: normalizedCodes } },
        select: { id: true, mikroCode: true },
      });

      if (sourceProducts.length === 0) {
        res.json({ success: true, products: [], total: 0 });
        return;
      }

      const excludeProducts = normalizedExcludeCodes.length > 0
        ? await prisma.product.findMany({
            where: { mikroCode: { in: normalizedExcludeCodes } },
            select: { id: true },
          })
        : [];

      const excludeIdSet = new Set([
        ...sourceProducts.map((item) => item.id),
        ...excludeProducts.map((item) => item.id),
      ]);

      const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0
        ? Math.min(20, Math.floor(Number(limit)))
        : 10;

      const sourceIds = sourceProducts.map((item) => item.id);
      const recommendedIds = await productComplementService.getRecommendationIdsForCart(
        sourceIds,
        safeLimit
      );

      const filteredIds = recommendedIds.filter((id) => !excludeIdSet.has(id));
      if (filteredIds.length === 0) {
        res.json({ success: true, products: [], total: 0 });
        return;
      }

      const [autoPairs, manualPairs, popularityMap] = await Promise.all([
        prisma.productComplementAuto.findMany({
          where: { productId: { in: sourceIds }, relatedProductId: { in: filteredIds } },
          select: { relatedProductId: true, pairCount: true },
        }),
        prisma.productComplementManual.findMany({
          where: { productId: { in: sourceIds }, relatedProductId: { in: filteredIds } },
          select: { relatedProductId: true },
        }),
        productComplementService.getPopularityByProductIds(filteredIds),
      ]);

      const pairCountMap = new Map<string, number>();
      autoPairs.forEach((row) => {
        const nextValue = (pairCountMap.get(row.relatedProductId) || 0) + (row.pairCount || 0);
        pairCountMap.set(row.relatedProductId, nextValue);
      });

      const manualSet = new Set(manualPairs.map((row) => row.relatedProductId));
      const orderIndex = new Map(filteredIds.map((id, index) => [id, index]));

      const recommendedProducts = await prisma.product.findMany({
        where: { id: { in: filteredIds } },
        select: PRODUCT_SELECT,
      });
      const enriched = await buildProductsWithPriceLists(recommendedProducts);
      const productMap = new Map(enriched.map((product: any) => [product.id, product]));
      const orderedProducts = filteredIds
        .map((id) => productMap.get(id))
        .filter(Boolean)
        .sort((a: any, b: any) => {
          const aCount = popularityMap.get(a.id) || 0;
          const bCount = popularityMap.get(b.id) || 0;
          if (bCount !== aCount) {
            return bCount - aCount;
          }
          return (orderIndex.get(a.id) || 0) - (orderIndex.get(b.id) || 0);
        })
        .map((product: any) => {
          const popularityCount = popularityMap.get(product.id) || 0;
          const pairCount = pairCountMap.get(product.id) || 0;
          const isManual = manualSet.has(product.id);
          const parts: string[] = [];
          if (isManual) {
            parts.push('Manuel tamamlayici');
          } else if (pairCount > 0) {
            parts.push(`Birlikte ${pairCount} evrak`);
          }
          if (popularityCount > 0) {
            parts.push(`${popularityCount} musteri`);
          }
          return {
            ...product,
            recommendationNote: parts.length > 0 ? parts.join(' / ') : null,
          };
        });

      res.json({ success: true, products: orderedProducts, total: orderedProducts.length });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/reports/complement-missing/export
   * Tamamlayici urun eksikleri raporu Excel
   */
  async exportComplementMissingReport(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        mode,
        productCode,
        customerCode,
        periodMonths,
        matchMode,
        sectorCode,
        salesRepId,
        minDocumentCount,
      } = req.query;

      const { buffer, fileName } = await reportsService.exportComplementMissingReport({
        mode: mode as 'product' | 'customer',
        matchMode: matchMode as 'product' | 'category' | 'group',
        productCode: productCode as string,
        customerCode: customerCode as string,
        sectorCode: sectorCode as string,
        salesRepId: salesRepId as string,
        periodMonths: periodMonths ? parseInt(periodMonths as string, 10) : undefined,
        minDocumentCount: minDocumentCount ? parseInt(minDocumentCount as string, 10) : undefined,
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(buffer);
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

  // ============================================================
  // Arama Yonetimi (Search Management)
  // ============================================================

  /**
   * Bulunamayan arama terimleri listesi (sayfali, count desc).
   * GET /api/admin/search-misses?status=all|open|resolved&search=&page=&pageSize=
   */
  async getSearchMisses(req: Request, res: Response, next: NextFunction) {
    try {
      const status = String(req.query.status || 'all');
      const search = String(req.query.search || '').trim();
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const skip = (page - 1) * pageSize;

      const where: any = {};
      if (status === 'open') where.resolved = false;
      else if (status === 'resolved') where.resolved = true;
      if (search) {
        const norm = normalizeSearchText(search);
        const or: any[] = [
          { sampleTerm: { contains: search, mode: 'insensitive' } },
        ];
        if (norm) or.push({ normalizedTerm: { contains: norm } });
        where.OR = or;
      }

      const [total, items] = await Promise.all([
        prisma.searchMiss.count({ where }),
        prisma.searchMiss.findMany({
          where,
          orderBy: [{ count: 'desc' }, { lastSearchedAt: 'desc' }],
          skip,
          take: pageSize,
          select: {
            id: true,
            normalizedTerm: true,
            sampleTerm: true,
            count: true,
            resolved: true,
            lastSearchedAt: true,
          },
        }),
      ]);

      res.json({
        items,
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Bir arama terimini cozuldu/cozulmedi olarak isaretle.
   * PATCH /api/admin/search-misses/:id { resolved: boolean }
   */
  async updateSearchMiss(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const resolved = Boolean(req.body?.resolved);
      await prisma.searchMiss.update({
        where: { id },
        data: { resolved },
      });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Urun arama takma adlari (searchAliases) yonetimi - liste (sayfali).
   * GET /api/admin/product-aliases?search=&page=&pageSize=
   */
  async getProductAliases(req: Request, res: Response, next: NextFunction) {
    try {
      const search = String(req.query.search || '').trim();
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const skip = (page - 1) * pageSize;

      const where: any = {};
      if (search) {
        const norm = normalizeSearchText(search);
        const or: any[] = [
          { name: { contains: search, mode: 'insensitive' } },
          { mikroCode: { contains: search, mode: 'insensitive' } },
        ];
        if (norm) or.push({ searchText: { contains: norm } });
        where.OR = or;
      }

      const [total, products] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.findMany({
          where,
          orderBy: [{ name: 'asc' }],
          skip,
          take: pageSize,
          select: {
            id: true,
            name: true,
            mikroCode: true,
            searchAliases: true,
            category: { select: { name: true } },
          },
        }),
      ]);

      const items = products.map((p) => ({
        id: p.id,
        name: p.name,
        mikroCode: p.mikroCode,
        categoryName: p.category?.name ?? null,
        searchAliases: p.searchAliases ?? null,
      }));

      res.json({
        items,
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Bir urunun arama takma adlarini (searchAliases) guncelle.
   * PUT /api/admin/product-aliases/:id { searchAliases: string }
   * NOT: searchText GENERATED kolon -> Postgres otomatik gunceller, ELLE YAZMA.
   */
  async updateProductAliases(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const raw = req.body?.searchAliases;
      const trimmed = typeof raw === 'string' ? raw.trim() : '';
      await prisma.product.update({
        where: { id },
        data: { searchAliases: trimmed || null },
      });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  }
}

export default new AdminController();
