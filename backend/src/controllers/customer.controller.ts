/**
 * Customer Controller
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import stockService from '../services/stock.service';
import pricingService from '../services/pricing.service';
import priceListService from '../services/price-list.service';
import mikroService from '../services/mikroFactory.service';
import orderService from '../services/order.service';
import productComplementService from '../services/product-complement.service';
import customerActivityService from '../services/customer-activity.service';
import warehouseWorkflowService from '../services/warehouse-workflow.service';
import exclusionService from '../services/exclusion.service';
import cartPricingService, { CartPriceType } from '../services/cart-pricing.service';
import vadeService from '../services/vade.service';
import { splitSearchTokens, normalizeSearchText } from '../utils/search';
import { MikroCustomerSaleMovement, ProductPrices } from '../types';
import { resolveCustomerPriceLists, resolveCustomerPriceListsForProduct } from '../utils/customerPricing';
import { applyAgreementPrices, isAgreementActive, isAgreementApplicable, resolveAgreementPrice } from '../utils/agreements';
import { resolveLastPriceOverride } from '../utils/lastPrice';

const getLastPriceGuardPrices = (
  priceStats: any,
  guardInvoicedListNo?: number | null,
  guardWhiteListNo?: number | null
): { invoiced: number; white: number } | undefined => {
  if (!guardInvoicedListNo && !guardWhiteListNo) return undefined;
  return {
    invoiced: guardInvoicedListNo
      ? priceListService.getListPrice(priceStats, guardInvoicedListNo)
      : 0,
    white: guardWhiteListNo
      ? priceListService.getListPrice(priceStats, guardWhiteListNo)
      : 0,
  };
};


const sumStocks = (warehouseStocks: Record<string, number>, includedWarehouses: string[]): number => {
  if (!warehouseStocks) return 0;
  if (!includedWarehouses || includedWarehouses.length === 0) {
    return Object.values(warehouseStocks).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
  }
  return includedWarehouses.reduce((sum, warehouse) => sum + (Number(warehouseStocks[warehouse]) || 0), 0);
};

const applyPendingOrders = (
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

type PriceVisibilityValue = 'INVOICED_ONLY' | 'WHITE_ONLY' | 'BOTH';

const isPriceTypeAllowed = (visibility: PriceVisibilityValue | null | undefined, priceType: 'INVOICED' | 'WHITE'): boolean => {
  if (visibility === 'WHITE_ONLY') return priceType === 'WHITE';
  if (visibility === 'BOTH') return true;
  return priceType === 'INVOICED';
};

const buildLastSalesMap = (sales: MikroCustomerSaleMovement[]) => {
  const map = new Map<string, number>();
  sales.forEach((sale) => {
    const code = String(sale.productCode || '').trim();
    if (!code || map.has(code)) return;
    const price = Number(sale.unitPrice);
    if (Number.isFinite(price) && price > 0) {
      map.set(code, price);
    }
  });
  return map;
};

const normalizeMikroCode = (value: string | null | undefined): string =>
  String(value || '').trim().toUpperCase();

const CUSTOMER_STATIC_CACHE_TTL_MS = 60 * 1000;
const customerStaticCache = new Map<string, { expiresAt: number; value: any }>();

const getCachedValue = async <T>(key: string, loader: () => Promise<T>, ttlMs = CUSTOMER_STATIC_CACHE_TTL_MS): Promise<T> => {
  const cached = customerStaticCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }
  const value = await loader();
  customerStaticCache.set(key, { expiresAt: Date.now() + ttlMs, value });
  return value;
};

const getCustomerProductContext = async (customerId: string) =>
  getCachedValue(`product-context:${customerId}`, async () => {
    const [settings, priceListRules] = await Promise.all([
      prisma.settings.findFirst({
        select: {
          includedWarehouses: true,
          customerPriceLists: true,
        },
      }),
      prisma.customerPriceListRule.findMany({
        where: { customerId },
      }),
    ]);

    return { settings, priceListRules };
  });

const withTimeout = async <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const loadCustomerContext = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      mikroCariCode: true,
      customerType: true,
      invoicedPriceListNo: true,
      whitePriceListNo: true,
      priceVisibility: true,
      useLastPrices: true,
      lastPriceGuardType: true,
      lastPriceGuardInvoicedListNo: true,
      lastPriceGuardWhiteListNo: true,
      lastPriceCostBasis: true,
      lastPriceMinCostPercent: true,
      parentCustomerId: true,
      parentCustomer: {
        select: {
          id: true,
          mikroCariCode: true,
          customerType: true,
          invoicedPriceListNo: true,
          whitePriceListNo: true,
          priceVisibility: true,
          useLastPrices: true,
          lastPriceGuardType: true,
          lastPriceGuardInvoicedListNo: true,
          lastPriceGuardWhiteListNo: true,
          lastPriceCostBasis: true,
          lastPriceMinCostPercent: true,
        },
      },
    },
  });

  const customer = user?.parentCustomer || user;
  if (!customer || !customer.customerType) {
    throw new Error('User has no customer type');
  }

  const [settings, priceListRules] = await Promise.all([
    prisma.settings.findFirst({
      select: {
        includedWarehouses: true,
        customerPriceLists: true,
      },
    }),
    prisma.customerPriceListRule.findMany({
      where: { customerId: customer.id },
    }),
  ]);

  const basePriceListPair = resolveCustomerPriceLists(customer, settings);
  const includedWarehouses = settings?.includedWarehouses || [];
  const effectiveVisibility: PriceVisibilityValue | null | undefined = user?.parentCustomerId
    ? (customer.priceVisibility === 'WHITE_ONLY' ? 'WHITE_ONLY' : 'INVOICED_ONLY')
    : customer.priceVisibility;

  return {
    user,
    customer,
    settings,
    priceListRules,
    basePriceListPair,
    includedWarehouses,
    effectiveVisibility,
  };
};

const buildCustomerProductPayloads = async (params: {
  products: Array<{
    id: string;
    name: string;
    mikroCode: string;
    brandCode?: string | null;
    unit: string;
    unit2?: string | null;
    unit2Factor?: number | null;
    vatRate?: number | null;
    currentCost?: number | null;
    lastEntryPrice?: number | null;
    excessStock: number;
    imageUrl?: string | null;
    warehouseStocks?: unknown;
    warehouseExcessStocks?: unknown;
    pendingCustomerOrdersByWarehouse?: unknown;
    prices: unknown;
    category: { id: string; name: string };
  }>;
  customer: any;
  priceListRules: any[];
  basePriceListPair: { invoiced: number; white: number };
  includedWarehouses: string[];
  effectiveVisibility: PriceVisibilityValue | null | undefined;
  isDiscounted?: boolean;
}) => {
  const {
    products,
    customer,
    priceListRules,
    basePriceListPair,
    includedWarehouses,
    effectiveVisibility,
    isDiscounted = false,
  } = params;

  if (products.length === 0) {
    return [];
  }

  const productIds = products.map((product) => product.id);
  const productCodes = products.map((product) => product.mikroCode);
  const now = new Date();

  // 1.4: Urun basina ayri fiyat sorgusu yerine tek toplu (batch) sorgu kullan; sonuc ayni kalir.
  const [agreementRows, priceStatsMap] = await Promise.all([
    prisma.customerPriceAgreement.findMany({
      where: {
        customerId: customer.id,
        productId: { in: productIds },
      },
      select: {
        productId: true,
        priceInvoiced: true,
        priceWhite: true,
        customerProductCode: true,
        minQuantity: true,
        validFrom: true,
        validTo: true,
      },
    }),
    priceListService.getPriceStatsMap(productCodes),
  ]);

  const agreementMap = new Map(agreementRows.map((row) => [row.productId, row]));

  let lastSalesMap = new Map<string, number>();
  if (customer.useLastPrices && customer.mikroCariCode && !isDiscounted) {
    try {
      const sales = await mikroService.getCustomerSalesMovements(
        customer.mikroCariCode as string,
        productCodes,
        1
      );
      lastSalesMap = buildLastSalesMap(sales);
    } catch (error) {
      console.error('Customer last price failed', { customerId: customer.id, error });
    }
  }

  return products.map((product) => {
    const prices = product.prices as unknown as ProductPrices;
    const customerPrices = pricingService.getPriceForCustomer(
      prices,
      customer.customerType as any
    );

    const priceStats = priceStatsMap.get(product.mikroCode) || null;
    const productPriceListPair = resolveCustomerPriceListsForProduct(
      basePriceListPair,
      priceListRules,
      {
        brandCode: product.brandCode,
        categoryId: product.category.id,
      }
    );
    const listInvoiced = priceListService.getListPriceWithFallback(
      priceStats,
      productPriceListPair.invoiced
    );
    const listWhite = priceListService.getListPriceWithFallback(
      priceStats,
      productPriceListPair.white
    );
    const listPricesRaw =
      listInvoiced > 0 || listWhite > 0 ? { invoiced: listInvoiced, white: listWhite } : undefined;
    const listPricesBase = {
      invoiced: listInvoiced > 0 ? listInvoiced : customerPrices.invoiced,
      white: listWhite > 0 ? listWhite : customerPrices.white,
    };
    const guardPrices = getLastPriceGuardPrices(
      priceStats,
      customer.lastPriceGuardInvoicedListNo,
      customer.lastPriceGuardWhiteListNo
    );

    let listPrices = listPricesBase;
    if (customer.useLastPrices && customer.mikroCariCode && !isDiscounted) {
      const lastSalePrice = lastSalesMap.get(product.mikroCode);
      const lastPriceResult = resolveLastPriceOverride({
        config: customer,
        lastSalePrice,
        listPrices: listPricesBase,
        guardPrices,
        product: {
          currentCost: product.currentCost,
          lastEntryPrice: product.lastEntryPrice,
        },
        priceVisibility: effectiveVisibility,
      });
      listPrices = lastPriceResult.prices;
    }

    const agreement = agreementMap.get(product.id);
    const agreementActive = agreement ? isAgreementActive(agreement, now) : false;
    const agreementBasePrices = isDiscounted ? customerPrices : listPrices;
    const agreementPrices = agreementActive ? applyAgreementPrices(agreementBasePrices, agreement) : null;
    const agreementExcessPrices = agreementActive ? applyAgreementPrices(customerPrices, agreement) : null;

    const warehouseStocks = (product.warehouseStocks || {}) as Record<string, number>;
    const pendingByWarehouse = (product.pendingCustomerOrdersByWarehouse || {}) as Record<string, number>;
    const availableWarehouseStocks = applyPendingOrders(warehouseStocks, pendingByWarehouse);
    const availableStock = sumStocks(availableWarehouseStocks, includedWarehouses);
    const warehouseExcessStocks = (product as any).warehouseExcessStocks as Record<string, number>;

    return {
      id: product.id,
      name: product.name,
      mikroCode: product.mikroCode,
      unit: product.unit,
      unit2: product.unit2 || null,
      unit2Factor: product.unit2Factor ?? null,
      vatRate: product.vatRate ?? 0,
      excessStock: product.excessStock,
      availableStock,
      maxOrderQuantity: isDiscounted ? product.excessStock : availableStock,
      warehouseStocks: availableWarehouseStocks,
      warehouseExcessStocks,
      imageUrl: product.imageUrl,
      category: product.category,
      prices: agreementPrices || (isDiscounted ? customerPrices : listPrices),
      excessPrices: agreementExcessPrices || customerPrices,
      listPrices: agreementActive ? listPricesRaw : (isDiscounted ? listPricesRaw : undefined),
      pricingMode: isDiscounted ? 'EXCESS' : 'LIST',
      agreement: agreementActive
        ? {
            priceInvoiced: agreement!.priceInvoiced,
            priceWhite: agreement!.priceWhite,
            customerProductCode: agreement!.customerProductCode || null,
            minQuantity: agreement!.minQuantity,
            validFrom: agreement!.validFrom,
            validTo: agreement!.validTo,
          }
        : undefined,
    };
  });
};

export class CustomerController {
  /**
   * GET /api/products
   */
  async getProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const { categoryId, categoryIds: rawCategoryIds, search, warehouse, mode } = req.query;
      const categoryIds = Array.from(
        new Set(
          (Array.isArray(rawCategoryIds) ? rawCategoryIds : [rawCategoryIds])
            .flatMap((value) => String(value || '').split(','))
            .map((value) => value.trim())
            .filter(Boolean)
        )
      );
      const categoryFilter =
        categoryIds.length > 0
          ? { categoryId: categoryIds.length === 1 ? categoryIds[0] : { in: categoryIds } }
          : categoryId
            ? { categoryId: categoryId as string }
            : {};
      const isDiscounted = mode === 'discounted' || mode === 'excess';
      const isPurchased = mode === 'purchased';
      const isAgreementMode = mode === 'agreements';
      // Ana sayfa "one cikan" -> sadece yonetici isaretli urunler
      const featuredOnly = req.query.featured === 'true' || req.query.featured === '1';
      const requestedSort = typeof req.query.sort === 'string' ? req.query.sort : '';
      const productSort = requestedSort || (isPurchased ? 'lastPurchasedDesc' : isAgreementMode ? 'nameAsc' : 'bestsellerValue');
      const bestsellerOrderBy = [{ popularSalesValue: 'desc' as const }, { name: 'asc' as const }];
      const nameOrderBy = [{ name: 'asc' as const }];
      const searchTokens = splitSearchTokens(search as string | undefined);
      const rawLimit = Number(req.query.limit);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 200) : undefined;
      const rawOffset = Number(req.query.offset);
      const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
      const modeLabel = typeof mode === 'string' ? mode : 'all';
      const shouldLogTiming = isAgreementMode || isPurchased;
      const debugTiming =
        (process.env.PRODUCTS_TIMING_LOG === '1' && shouldLogTiming) || req.query.debug === 'timing';
      const start = debugTiming ? process.hrtime.bigint() : 0n;
      let last = start;
      const timings: Record<string, number> = {};
      const lap = (label: string) => {
        if (!debugTiming) return;
        const now = process.hrtime.bigint();
        timings[label] = Number(now - last) / 1e6;
        last = now;
      };
      const logTiming = (extra: Record<string, unknown> = {}) => {
        if (!debugTiming) return;
        const totalMs = Number(process.hrtime.bigint() - start) / 1e6;
        console.log(
          '[products-timing]',
          JSON.stringify({
            mode: modeLabel,
            totalMs,
            steps: timings,
            params: {
              limit,
              offset,
              categoryId: Boolean(categoryId) || categoryIds.length > 0,
              categoryIdsCount: categoryIds.length,
              warehouse: Boolean(warehouse),
              searchTokens: searchTokens.length,
              sort: productSort,
            },
            ...extra,
          })
        );
      };

      // KullanÄ±cÄ± bilgisini al
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: {
          id: true,
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
          parentCustomerId: true,
          parentCustomer: {
            select: {
              id: true,
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
            },
          },
        },
      });
      lap('user');

      const customer = user?.parentCustomer || user;

      if (!customer || !customer.customerType) {
        return res.status(400).json({ error: 'User has no customer type' });
      }

      const excludedProductCodes = await exclusionService.getActiveProductCodeExclusions();
      const excludedProductCodeSet = new Set(excludedProductCodes);
      lap('exclusions');

      if (isPurchased && !customer.mikroCariCode) {
        return res.status(400).json({ error: 'User has no Mikro cari code' });
      }

      let purchasedCodes: string[] = [];
      if (isPurchased) {
        const localPurchasedRows = await prisma.orderItem.findMany({
          where: { order: { userId: customer.id } },
          select: { mikroCode: true },
          orderBy: { createdAt: 'desc' },
          take: 5000,
        });
        const localCodeSet = new Set<string>();
        for (const row of localPurchasedRows) {
          const code = String(row.mikroCode || '').trim();
          const normalized = normalizeMikroCode(code);
          if (!code || localCodeSet.has(normalized) || excludedProductCodeSet.has(normalized)) continue;
          localCodeSet.add(normalized);
          purchasedCodes.push(code);
        }

        if (purchasedCodes.length === 0 && customer.mikroCariCode) {
          try {
            const allPurchasedCodes = await withTimeout(
              mikroService.getPurchasedProductCodes(customer.mikroCariCode as string),
              10000,
              'getPurchasedProductCodes'
            );
            purchasedCodes = allPurchasedCodes.filter(
              (code) => !excludedProductCodeSet.has(normalizeMikroCode(code))
            );
          } catch (error) {
            console.error('Purchased codes fetch failed', { customerId: customer.id, error });
          }
        }

        lap('purchasedCodes');
        if (purchasedCodes.length === 0) {
          logTiming({ counts: { purchasedCodes: 0 }, reason: 'no-purchases' });
          return res.json({ products: [], total: 0 });
        }
      }

      const { settings, priceListRules } = await getCustomerProductContext(customer.id);
      lap('settings');

      const basePriceListPair = resolveCustomerPriceLists(customer, settings);
      const includedWarehouses = settings?.includedWarehouses || [];
      const effectiveVisibility = user?.parentCustomerId
        ? (customer.priceVisibility === 'WHITE_ONLY' ? 'WHITE_ONLY' : 'INVOICED_ONLY')
        : customer.priceVisibility;

      const now = new Date();
      let agreementRows: Array<{
        id: string;
        productId: string;
        priceInvoiced: number;
        priceWhite: number | null;
        customerProductCode?: string | null;
        minQuantity: number;
        validFrom: Date;
        validTo: Date | null;
      }> = [];

      if (isAgreementMode) {
        const agreementWhere: any = {
          customerId: customer.id,
          validFrom: { lte: now },
          OR: [{ validTo: null }, { validTo: { gte: now } }],
          product: {
            active: true,
            hiddenFromCustomers: false,
            ...(excludedProductCodes.length > 0 ? { mikroCode: { notIn: excludedProductCodes } } : {}),
            ...categoryFilter,
          },
        };

        if (searchTokens.length > 0) {
          agreementWhere.AND = searchTokens.map((token) => ({
            OR: [
              { customerProductCode: { contains: token, mode: 'insensitive' } },
              { product: { searchText: { contains: normalizeSearchText(token) } } },
            ],
          }));
        }

        // 1.2: Toplam anlasma sayisi (sayfalama disinda) - frontend "Toplam N urun" gosterimi icin.
        const agreementTotal = await prisma.customerPriceAgreement.count({ where: agreementWhere });

        const agreementRows = await prisma.customerPriceAgreement.findMany({
          where: agreementWhere,
          select: {
            id: true,
            productId: true,
            priceInvoiced: true,
            priceWhite: true,
            customerProductCode: true,
            minQuantity: true,
            validFrom: true,
            validTo: true,
            product: {
              select: {
                id: true,
                name: true,
                mikroCode: true,
                brandCode: true,
                unit: true,
                unit2: true,
                unit2Factor: true,
                vatRate: true,
                currentCost: true,
                lastEntryPrice: true,
                excessStock: true,
                imageUrl: true,
                warehouseStocks: true,
                warehouseExcessStocks: true,
                pendingCustomerOrdersByWarehouse: true,
                prices: true,
                category: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: {
            product: { name: 'asc' },
          },
          ...(limit ? { skip: offset, take: limit } : {}),
        });
        lap('agreementsQuery');

        if (agreementRows.length == 0) {
          logTiming({ counts: { agreementRows: 0 } });
          return res.json({ products: [], total: agreementTotal });
        }

        const agreementProducts = agreementRows.map((row) => row.product);
        const priceStatsMap = await priceListService.getPriceStatsMap(
          agreementProducts.map((product) => product.mikroCode)
        );
        lap('priceStats');

        const shouldUseLastPrices =
          Boolean(customer.useLastPrices && customer.mikroCariCode) && !isDiscounted;
        let lastSalesMap = new Map<string, number>();
        if (shouldUseLastPrices) {
          try {
            const sales = await mikroService.getCustomerSalesMovements(
              customer.mikroCariCode as string,
              agreementProducts.map((product) => product.mikroCode),
              1
            );
            lastSalesMap = buildLastSalesMap(sales);
          } catch (error) {
            console.error('Customer last prices failed', { customerId: customer.id, error });
          }
        }

        let productsWithPrices = agreementRows.map((row) => {
          const product = row.product;
          const prices = product.prices as unknown as ProductPrices;
          const customerPrices = pricingService.getPriceForCustomer(
            prices,
            customer.customerType as any
          );

          const priceStats = priceStatsMap.get(product.mikroCode) || null;
          const productPriceListPair = resolveCustomerPriceListsForProduct(
            basePriceListPair,
            priceListRules,
            {
              brandCode: product.brandCode,
              categoryId: product.category.id,
            }
          );
          const listInvoiced = priceListService.getListPriceWithFallback(
            priceStats,
            productPriceListPair.invoiced
          );
          const listWhite = priceListService.getListPriceWithFallback(
            priceStats,
            productPriceListPair.white
          );
          const listPricesRaw = {
            invoiced: listInvoiced > 0 ? listInvoiced : customerPrices.invoiced,
            white: listWhite > 0 ? listWhite : customerPrices.white,
          };
          const guardPrices = getLastPriceGuardPrices(
            priceStats,
            customer.lastPriceGuardInvoicedListNo,
            customer.lastPriceGuardWhiteListNo
          );
          const lastSalePrice = lastSalesMap.get(product.mikroCode);
          const lastPriceResult = resolveLastPriceOverride({
            config: customer,
            lastSalePrice,
            listPrices: listPricesRaw,
              guardPrices,
            product: {
              currentCost: product.currentCost,
              lastEntryPrice: product.lastEntryPrice,
            },
            priceVisibility: effectiveVisibility,
          });
          const listPrices = lastPriceResult.prices;

          const agreementActive = isAgreementActive(row, now);
          const agreementPrices = agreementActive ? applyAgreementPrices(listPrices, row) : null;
          const agreementExcessPrices = agreementActive ? applyAgreementPrices(customerPrices, row) : null;

          const warehouseStocks = (product.warehouseStocks || {}) as Record<string, number>;
          const warehouseExcessStocks = product.warehouseExcessStocks as Record<string, number>;
          const pendingByWarehouse = product.pendingCustomerOrdersByWarehouse as Record<string, number> || {};
          const availableWarehouseStocks = applyPendingOrders(warehouseStocks, pendingByWarehouse);
          const availableStock = sumStocks(availableWarehouseStocks, includedWarehouses);

          return {
            id: product.id,
            name: product.name,
            mikroCode: product.mikroCode,
            unit: product.unit,
            unit2: product.unit2 || null,
            unit2Factor: product.unit2Factor ?? null,
            vatRate: product.vatRate ?? 0,
            excessStock: product.excessStock,
            availableStock,
            maxOrderQuantity: availableStock,
            imageUrl: product.imageUrl,
            warehouseStocks: availableWarehouseStocks,
            warehouseExcessStocks,
            category: {
              id: product.category.id,
              name: product.category.name,
            },
            prices: agreementPrices || listPrices,
            excessPrices: agreementExcessPrices || customerPrices,
            listPrices: agreementActive ? listPrices : undefined,
            pricingMode: 'LIST',
            agreement: agreementActive
              ? {
                  priceInvoiced: row.priceInvoiced,
                  priceWhite: row.priceWhite,
                  customerProductCode: row.customerProductCode || null,
                  minQuantity: row.minQuantity,
                  validFrom: row.validFrom,
                  validTo: row.validTo,
                }
              : undefined,
          };
        });

        if (warehouse) {
          productsWithPrices = productsWithPrices.filter((p) => p.maxOrderQuantity > 0);
        }

        lap('enrich');
        logTiming({ counts: { agreementRows: agreementRows.length, products: productsWithPrices.length } });
        return res.json({ products: productsWithPrices, total: agreementTotal });
      }

      // Indirime sokulmamasi istenen urun kodlari (yalniz indirimli listeyi etkiler)
      const discountExcludedCodes = isDiscounted
        ? (
            await prisma.product.findMany({
              where: { excludeFromDiscount: true },
              select: { mikroCode: true },
            })
          ).map((p) => p.mikroCode)
        : [];

      const products = isDiscounted
        ? await stockService.getExcessStockProducts({
            categoryId: categoryId as string,
            categoryIds,
            search: search as string,
            limit,
            offset,
            excludeProductCodes: [...excludedProductCodes, ...discountExcludedCodes],
            sort: productSort === 'bestsellerValue' ? 'bestsellerValue' : 'excessStock',
          })
        : isPurchased
          ? await prisma.product.findMany({
              where: {
                active: true,
                hiddenFromCustomers: false,
                mikroCode: { in: purchasedCodes },
                ...categoryFilter,
                ...(searchTokens.length > 0
                  ? {
                      AND: searchTokens.map((token) => ({
                        OR: [
                          { searchText: { contains: normalizeSearchText(token) } },
                        ],
                      })),
                    }
                  : {}),
              },
              select: {

                id: true,

                name: true,

                mikroCode: true,

                brandCode: true,

                unit: true,

                unit2: true,

                unit2Factor: true,

                vatRate: true,

                currentCost: true,

                lastEntryPrice: true,

                popularSalesQuantity: true,

                popularSalesValue: true,

                popularSalesUpdatedAt: true,

                excessStock: true,

                excludeFromDiscount: true,

                imageUrl: true,

                warehouseStocks: true,

                warehouseExcessStocks: true,

                pendingCustomerOrdersByWarehouse: true,

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
            })
          : await prisma.product.findMany({
              where: {
                active: true,
                hiddenFromCustomers: false,
                ...(featuredOnly ? { isFeatured: true } : {}),
                ...(excludedProductCodes.length > 0 ? { mikroCode: { notIn: excludedProductCodes } } : {}),
                ...categoryFilter,
                ...(searchTokens.length > 0
                  ? {
                      AND: searchTokens.map((token) => ({
                        OR: [
                          { searchText: { contains: normalizeSearchText(token) } },
                        ],
                      })),
                    }
                  : {}),
              },
              select: {

                id: true,

                name: true,

                mikroCode: true,

                brandCode: true,

                unit: true,

                unit2: true,

                unit2Factor: true,

                vatRate: true,

                currentCost: true,

                lastEntryPrice: true,

                popularSalesQuantity: true,

                popularSalesValue: true,

                popularSalesUpdatedAt: true,

                excessStock: true,

                excludeFromDiscount: true,

                imageUrl: true,

                warehouseStocks: true,

                warehouseExcessStocks: true,

                pendingCustomerOrdersByWarehouse: true,

                prices: true,

                category: {

                  select: {

                    id: true,

                    name: true,

                  },

                },

              },
              orderBy: featuredOnly
                ? [{ featuredOrder: 'asc' as const }, { name: 'asc' as const }]
                : productSort === 'bestsellerValue' ? bestsellerOrderBy : nameOrderBy,
              ...(limit ? { skip: offset, take: limit } : {}),
            });

      // Indirime sokulmamasi istenen urunlerde fazla stogu sifirla -> her yerde normal fiyattan gosterilir.
      for (const p of products as any[]) {
        if (p && p.excludeFromDiscount) p.excessStock = 0;
      }

      lap('productsQuery');

      let pageProducts = products;
      if (isPurchased) {
        const orderIndex = new Map(purchasedCodes.map((code, index) => [normalizeMikroCode(code), index]));
        pageProducts = [...products].sort((a, b) => {
          if (productSort === 'lastPurchasedDesc') {
            const aIndex = orderIndex.get(normalizeMikroCode(a.mikroCode)) ?? Number.MAX_SAFE_INTEGER;
            const bIndex = orderIndex.get(normalizeMikroCode(b.mikroCode)) ?? Number.MAX_SAFE_INTEGER;
            if (aIndex !== bIndex) return aIndex - bIndex;
          }
          return a.name.localeCompare(b.name, 'tr');
        });
        if (limit) {
          pageProducts = pageProducts.slice(offset, offset + limit);
        }
      }

      // 1.2: Sayfalamadan bagimsiz toplam urun sayisi (frontend "Toplam N urun" gosterimi icin).
      // Fiyat/stok hesaplama mantigina dokunmaz; sadece ayni filtre uzerinden count alir.
      let productsTotal: number | undefined;
      if (isPurchased) {
        // Purchased modunda DB sorgusu limitsiz cekildigi icin tum eslesen kayit sayisi = products.length.
        productsTotal = products.length;
      } else if (isDiscounted) {
        const discountedWhere: any = {
          excessStock: { gt: 0 },
          active: true,
          hiddenFromCustomers: false,
        };
        const allDiscountExcluded = [...excludedProductCodes, ...discountExcludedCodes];
        if (allDiscountExcluded.length > 0) {
          discountedWhere.mikroCode = { notIn: allDiscountExcluded };
        }
        if (categoryIds.length > 0) {
          discountedWhere.categoryId = { in: categoryIds };
        } else if (categoryId) {
          discountedWhere.categoryId = categoryId as string;
        }
        if (searchTokens.length > 0) {
          discountedWhere.AND = searchTokens.map((token) => ({
            OR: [
              { searchText: { contains: normalizeSearchText(token) } },
            ],
          }));
        }
        productsTotal = await prisma.product.count({ where: discountedWhere });
      } else {
        const listWhere: any = {
          active: true,
          hiddenFromCustomers: false,
          ...(featuredOnly ? { isFeatured: true } : {}),
          ...(excludedProductCodes.length > 0 ? { mikroCode: { notIn: excludedProductCodes } } : {}),
          ...categoryFilter,
          ...(searchTokens.length > 0
            ? {
                AND: searchTokens.map((token) => ({
                  OR: [
                    { searchText: { contains: normalizeSearchText(token) } },
                  ],
                })),
              }
            : {}),
        };
        productsTotal = await prisma.product.count({ where: listWhere });
      }
      lap('countTotal');

      const priceStatsMap = await priceListService.getPriceStatsMap(
        pageProducts.map((product) => product.mikroCode)
      );
      lap('priceStats');

      const canFetchLastSalesForList =
        Boolean(limit) || searchTokens.length > 0 || Boolean(categoryId);
      const shouldUseLastPrices =
        Boolean(customer.useLastPrices && customer.mikroCariCode) && !isDiscounted && canFetchLastSalesForList;
      let lastSalesMap = new Map<string, number>();
      let lastSalesDetailsMap = new Map<string, MikroCustomerSaleMovement[]>();
      if (isPurchased) {
        try {
          const recentOrderItems = await prisma.orderItem.findMany({
            where: {
              mikroCode: { in: pageProducts.map((product) => product.mikroCode) },
              order: { userId: customer.id },
            },
            orderBy: {
              order: { createdAt: 'desc' },
            },
            take: Math.max(200, pageProducts.length * 5),
            select: {
              mikroCode: true,
              quantity: true,
              unitPrice: true,
              totalPrice: true,
              order: {
                select: {
                  createdAt: true,
                  orderNumber: true,
                  customerOrderNumber: true,
                },
              },
            },
          });

          recentOrderItems.forEach((item) => {
            const code = String(item.mikroCode || '').trim();
            if (!code) return;
            const existing = lastSalesDetailsMap.get(code) || [];
            if (existing.length >= 5) return;
            existing.push({
              productCode: code,
              saleDate: item.order.createdAt,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineTotal: item.totalPrice,
              vatAmount: 0,
              vatRate: 0,
              vatZeroed: false,
              orderNumber: item.order.orderNumber || null,
              documentNo: item.order.customerOrderNumber || item.order.orderNumber || null,
            });
            lastSalesDetailsMap.set(code, existing);
          });
        } catch (error) {
          console.error('Purchased last sales fallback failed', { customerId: customer.id, error });
        }
      } else if (shouldUseLastPrices && customer.mikroCariCode) {
        try {
          const sales = await withTimeout(
            mikroService.getCustomerSalesMovements(
              customer.mikroCariCode as string,
              pageProducts.map((product) => product.mikroCode),
              1
            ),
            12000,
            'getCustomerSalesMovements'
          );
          lastSalesMap = buildLastSalesMap(sales);
        } catch (error) {
          console.error('Customer last prices failed', { customerId: customer.id, error });
        }
      }

        agreementRows = await prisma.customerPriceAgreement.findMany({
        where: {
          customerId: customer.id,
          productId: { in: pageProducts.map((product) => product.id) },
        },
        select: {
          id: true,
          productId: true,
          priceInvoiced: true,
          priceWhite: true,
          customerProductCode: true,
          minQuantity: true,
          validFrom: true,
          validTo: true,
        },
      });
      lap('agreementsQuery');
      const agreementMap = new Map(agreementRows.map((row) => [row.productId, row]));

      let productsWithPrices = pageProducts.map((product) => {
        const prices = product.prices as unknown as ProductPrices;
        const customerPrices = pricingService.getPriceForCustomer(
          prices,
          customer.customerType as any
        );

        const priceStats = priceStatsMap.get(product.mikroCode) || null;
        const productPriceListPair = resolveCustomerPriceListsForProduct(
          basePriceListPair,
          priceListRules,
          {
            brandCode: product.brandCode,
            categoryId: product.category.id,
          }
        );
        const listInvoiced = priceListService.getListPriceWithFallback(
          priceStats,
          productPriceListPair.invoiced
        );
        const listWhite = priceListService.getListPriceWithFallback(
          priceStats,
          productPriceListPair.white
        );
        const listPricesRaw =
          listInvoiced > 0 || listWhite > 0 ? { invoiced: listInvoiced, white: listWhite } : undefined;
        const listPricesBase = {
          invoiced: listInvoiced > 0 ? listInvoiced : customerPrices.invoiced,
          white: listWhite > 0 ? listWhite : customerPrices.white,
        };
        const guardPrices = getLastPriceGuardPrices(
          priceStats,
          customer.lastPriceGuardInvoicedListNo,
          customer.lastPriceGuardWhiteListNo
        );
        const lastSalePrice = lastSalesMap.get(product.mikroCode);
        const lastPriceResult = resolveLastPriceOverride({
          config: customer,
          lastSalePrice,
          listPrices: listPricesBase,
              guardPrices,
          product: {
            currentCost: product.currentCost,
            lastEntryPrice: product.lastEntryPrice,
          },
          priceVisibility: effectiveVisibility,
        });
        const listPrices = lastPriceResult.prices;

        const agreement = agreementMap.get(product.id);
        const agreementActive = agreement ? isAgreementActive(agreement, now) : false;
        const agreementBasePrices = isDiscounted ? customerPrices : listPrices;
        const agreementPrices = agreementActive ? applyAgreementPrices(agreementBasePrices, agreement) : null;
        const agreementExcessPrices = agreementActive ? applyAgreementPrices(customerPrices, agreement) : null;

        const warehouseStocks = (product.warehouseStocks || {}) as Record<string, number>;
        const warehouseExcessStocks = (product as any).warehouseExcessStocks as Record<string, number>;
        const pendingByWarehouse = (product as any).pendingCustomerOrdersByWarehouse as Record<string, number> || {};
        const availableWarehouseStocks = applyPendingOrders(warehouseStocks, pendingByWarehouse);
        let availableStock = sumStocks(availableWarehouseStocks, includedWarehouses);
        let excessStock = product.excessStock;
        let maxOrderQuantity = isDiscounted ? excessStock : availableStock;

        if (warehouse) {
          const warehouseKey = warehouse as string;
          const warehouseQty = availableWarehouseStocks?.[warehouseKey] || 0;
          const warehouseExcessQty = warehouseExcessStocks?.[warehouseKey] || 0;
          if (isDiscounted) {
            excessStock = warehouseExcessQty;
          } else {
            availableStock = warehouseQty;
            excessStock = warehouseExcessQty;
          }
          maxOrderQuantity = isDiscounted ? warehouseExcessQty : warehouseQty;
        }

        return {
          id: product.id,
          name: product.name,
          mikroCode: product.mikroCode,
          unit: product.unit,
          unit2: product.unit2 || null,
          unit2Factor: product.unit2Factor ?? null,
          vatRate: product.vatRate ?? 0,
          popularSalesQuantity: (product as any).popularSalesQuantity ?? 0,
          popularSalesValue: (product as any).popularSalesValue ?? 0,
          popularSalesUpdatedAt: (product as any).popularSalesUpdatedAt ?? null,
          excessStock,
          availableStock,
          maxOrderQuantity,
          imageUrl: product.imageUrl,
          warehouseStocks: availableWarehouseStocks,
          warehouseExcessStocks,
          category: {
            id: product.category.id,
            name: product.category.name,
          },
          prices: agreementPrices || (isDiscounted ? customerPrices : listPrices),
          excessPrices: agreementExcessPrices || customerPrices,
          listPrices: agreementActive ? listPricesRaw : (isDiscounted ? listPricesRaw : undefined),
          pricingMode: isDiscounted ? 'EXCESS' : 'LIST',
          lastSales: isPurchased
            ? (() => {
                const lastSales = lastSalesDetailsMap.get(product.mikroCode) || [];
                return lastSales.map((lastSale) => ({
                  saleDate: lastSale.saleDate,
                  quantity: lastSale.quantity,
                  unitPrice: lastSale.unitPrice,
                  lineTotal: lastSale.lineTotal,
                  vatAmount: lastSale.vatAmount,
                  vatRate: lastSale.vatRate,
                  vatZeroed: lastSale.vatZeroed,
                  orderNumber: lastSale.orderNumber || null,
                  documentNo: lastSale.documentNo || null,
                }));
              })()
            : undefined,
          agreement: agreementActive
            ? {
                priceInvoiced: agreement!.priceInvoiced,
                priceWhite: agreement!.priceWhite,
                customerProductCode: agreement!.customerProductCode || null,
                minQuantity: agreement!.minQuantity,
                validFrom: agreement!.validFrom,
                validTo: agreement!.validTo,
              }
            : undefined,
        };
      });

      if (warehouse) {
        productsWithPrices = productsWithPrices.filter((p) => p.maxOrderQuantity > 0);
      }

      // INDIRIMLI SAYFA DUZELTMESI: Fazla stogu (excessStock>0) olan ama indirimli fiyati
      // normal liste fiyatiyla AYNI olan urunler gercekte indirimli degildir; "Indirimli
      // Urunler" sayfasinda gozukmemeli. Sadece indirimli fiyati liste fiyatinin altinda
      // olan urunler birakilir. Fiyat HESAPLAMA mantigi degismedi; sadece gosterim filtresi.
      if (isDiscounted) {
        const EPS = 0.001;
        const isGenuinelyDiscounted = (p: any): boolean => {
          const list = p.listPrices;
          const disc = p.prices;
          if (!list || !disc) return false;
          const invoicedOff = Number(list.invoiced) > 0 && Number(disc.invoiced) < Number(list.invoiced) - EPS;
          const whiteOff = Number(list.white) > 0 && Number(disc.white) < Number(list.white) - EPS;
          if (effectiveVisibility === 'WHITE_ONLY') return whiteOff;
          if (effectiveVisibility === 'INVOICED_ONLY') return invoicedOff;
          return invoicedOff || whiteOff;
        };
        productsWithPrices = productsWithPrices.filter(isGenuinelyDiscounted);
      }

      lap('enrich');
      logTiming({ counts: { products: products.length, agreements: agreementRows.length, purchasedCodes: purchasedCodes.length } });
      // 1.2: warehouse ve indirimli ("gercekten indirimli") filtreleri sorgu SONRASI sayfa
      // uzerinde calistigindan DB count'u gercek gorunenle birebir eslesmez; bu durumlarda
      // yaniltici olmamak icin total gondermeyiz (frontend yuklenen adedi gosterir).
      res.json({
        products: productsWithPrices,
        ...((warehouse || isDiscounted) ? {} : { total: productsTotal }),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/agreements/available
   * "Anlasmali Urunler" menusunu/sayfasini sadece musteriye tanimli AKTIF tarihli
   * anlasma varsa gostermek icin hafif kontrol (bos sayfa gostermemek icin).
   */
  async getAgreementsAvailability(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { id: true, parentCustomer: { select: { id: true } } },
      });
      const customerId = user?.parentCustomer?.id || user?.id;
      if (!customerId) {
        return res.json({ available: false });
      }
      const now = new Date();
      const count = await prisma.customerPriceAgreement.count({
        where: {
          customerId,
          validFrom: { lte: now },
          OR: [{ validTo: null }, { validTo: { gte: now } }],
          product: { active: true, hiddenFromCustomers: false },
        },
      });
      res.json({ available: count > 0 });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/financials
   * Musteri cari bakiye + vadesi gecen ozeti (vade senkronundan okunur, hizli; canli Mikro yok).
   * Kayit yoksa { financials: null } doner -> arayuz kutulari gizler.
   */
  async getFinancials(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { id: true, parentCustomer: { select: { id: true } } },
      });
      const customerId = user?.parentCustomer?.id || user?.id;
      if (!customerId) {
        return res.json({ financials: null });
      }
      const balance = await vadeService.getBalanceByUserId(customerId);
      if (!balance) {
        return res.json({ financials: null });
      }
      res.json({
        financials: {
          totalBalance: balance.totalBalance,
          pastDueBalance: balance.pastDueBalance,
          pastDueDate: balance.pastDueDate,
          notDueBalance: balance.notDueBalance,
          notDueDate: balance.notDueDate,
          paymentTermLabel: balance.paymentTermLabel,
          referenceDate: balance.referenceDate,
        },
      });
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
      const { mode } = req.query;
      // 1.19: Indirimli moda istek gelse de, stok tukenince teknik hata yerine normal fiyata dusecegiz.
      const requestedDiscounted = mode === 'discounted' || mode === 'excess';
      let isDiscounted = requestedDiscounted;

      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: {
          id: true,
          mikroCariCode: true,
          customerType: true,
          invoicedPriceListNo: true,
          whitePriceListNo: true,
          priceVisibility: true,
          useLastPrices: true,
          lastPriceGuardType: true,
          lastPriceGuardInvoicedListNo: true,
          lastPriceGuardWhiteListNo: true,
          lastPriceCostBasis: true,
          lastPriceMinCostPercent: true,
          parentCustomerId: true,
          parentCustomer: {
            select: {
              id: true,
              mikroCariCode: true,
              customerType: true,
              invoicedPriceListNo: true,
              whitePriceListNo: true,
              priceVisibility: true,
              useLastPrices: true,
              lastPriceGuardType: true,
              lastPriceGuardInvoicedListNo: true,
              lastPriceGuardWhiteListNo: true,
              lastPriceCostBasis: true,
              lastPriceMinCostPercent: true,
            },
          },
        },
      });

      const customer = user?.parentCustomer || user;

      if (!customer || !customer.customerType) {
        return res.status(400).json({ error: 'User has no customer type' });
      }

      const excludedProductCodeSet = new Set(await exclusionService.getActiveProductCodeExclusions());

      const [settings, priceListRules] = await Promise.all([
        prisma.settings.findFirst({
          select: {
            includedWarehouses: true,
            customerPriceLists: true,
          },
        }),
        prisma.customerPriceListRule.findMany({
          where: { customerId: customer.id },
        }),
      ]);

      const basePriceListPair = resolveCustomerPriceLists(customer, settings);
      const includedWarehouses = settings?.includedWarehouses || [];
      const effectiveVisibility = user?.parentCustomerId
        ? (customer.priceVisibility === 'WHITE_ONLY' ? 'WHITE_ONLY' : 'INVOICED_ONLY')
        : customer.priceVisibility;

      const product = await prisma.product.findUnique({
        where: { id },
        select: {

          id: true,

          name: true,

          mikroCode: true,

          brandCode: true,

          unit: true,

          unit2: true,

          unit2Factor: true,

          vatRate: true,

          currentCost: true,

          lastEntryPrice: true,

          excessStock: true,

          imageUrl: true,

          warehouseStocks: true,

          warehouseExcessStocks: true,

          pendingCustomerOrdersByWarehouse: true,

          prices: true,
          active: true,
          hiddenFromCustomers: true,

          category: {

            select: {

              id: true,

              name: true,

            },

          },

        },
      });

      if (!product || !product.active || product.hiddenFromCustomers) {
        return res.status(404).json({ error: 'Product not found' });
      }

      if (excludedProductCodeSet.has(normalizeMikroCode(product.mikroCode))) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // 1.19: Indirimli urun stogu bittiyse hata donmek yerine urunu normal (liste) fiyatla goster.
      if (requestedDiscounted && product.excessStock <= 0) {
        isDiscounted = false;
      }

      const prices = product.prices as unknown as ProductPrices;
      const customerPrices = pricingService.getPriceForCustomer(
        prices,
        customer.customerType as any
      );

      const priceStats = await priceListService.getPriceStats(product.mikroCode);
      const productPriceListPair = resolveCustomerPriceListsForProduct(
        basePriceListPair,
        priceListRules,
        {
          brandCode: product.brandCode,
          categoryId: product.category.id,
        }
      );
      const listInvoiced = priceListService.getListPriceWithFallback(
        priceStats,
        productPriceListPair.invoiced
      );
      const listWhite = priceListService.getListPriceWithFallback(
        priceStats,
        productPriceListPair.white
      );
      const listPricesRaw =
        listInvoiced > 0 || listWhite > 0 ? { invoiced: listInvoiced, white: listWhite } : undefined;
      const listPricesBase = {
        invoiced: listInvoiced > 0 ? listInvoiced : customerPrices.invoiced,
        white: listWhite > 0 ? listWhite : customerPrices.white,
      };
      const guardPrices = getLastPriceGuardPrices(
        priceStats,
        customer.lastPriceGuardInvoicedListNo,
        customer.lastPriceGuardWhiteListNo
      );
      let listPrices = listPricesBase;
      if (customer.useLastPrices && customer.mikroCariCode && !isDiscounted) {
        try {
          const sales = await mikroService.getCustomerSalesMovements(
            customer.mikroCariCode as string,
            [product.mikroCode],
            1
          );
          const lastSalesMap = buildLastSalesMap(sales);
          const lastSalePrice = lastSalesMap.get(product.mikroCode);
          const lastPriceResult = resolveLastPriceOverride({
            config: customer,
            lastSalePrice,
            listPrices: listPricesBase,
              guardPrices,
            product: {
              currentCost: product.currentCost,
              lastEntryPrice: product.lastEntryPrice,
            },
            priceVisibility: effectiveVisibility,
          });
          listPrices = lastPriceResult.prices;
        } catch (error) {
          console.error('Customer last price failed', { customerId: customer.id, error });
        }
      }

      const warehouseStocks = (product.warehouseStocks || {}) as Record<string, number>;
      const warehouseExcessStocks = (product as any).warehouseExcessStocks as Record<string, number>;
      const pendingByWarehouse = (product as any).pendingCustomerOrdersByWarehouse as Record<string, number> || {};
      const availableWarehouseStocks = applyPendingOrders(warehouseStocks, pendingByWarehouse);
      const availableStock = sumStocks(availableWarehouseStocks, includedWarehouses);

      const agreement = await prisma.customerPriceAgreement.findFirst({
        where: {
          customerId: customer.id,
          productId: product.id,
        },
        select: {
          priceInvoiced: true,
          priceWhite: true,
          customerProductCode: true,
          minQuantity: true,
          validFrom: true,
          validTo: true,
        },
      });
      const now = new Date();
      const agreementActive = agreement ? isAgreementActive(agreement, now) : false;
      const agreementBasePrices = isDiscounted ? customerPrices : listPrices;
      const agreementPrices = agreementActive ? applyAgreementPrices(agreementBasePrices, agreement) : null;
      const agreementExcessPrices = agreementActive ? applyAgreementPrices(customerPrices, agreement) : null;

      res.json({
        id: product.id,
        name: product.name,
        mikroCode: product.mikroCode,
        unit: product.unit,
        unit2: product.unit2 || null,
        unit2Factor: product.unit2Factor ?? null,
        vatRate: product.vatRate ?? 0,
        excessStock: product.excessStock,
        availableStock,
        maxOrderQuantity: isDiscounted ? product.excessStock : availableStock,
        warehouseStocks: availableWarehouseStocks,
        warehouseExcessStocks,
        imageUrl: product.imageUrl,
        category: product.category,
        prices: agreementPrices || (isDiscounted ? customerPrices : listPrices),
        excessPrices: agreementExcessPrices || customerPrices,
        listPrices: agreementActive ? listPricesRaw : (isDiscounted ? listPricesRaw : undefined),
        pricingMode: isDiscounted ? 'EXCESS' : 'LIST',
        agreement: agreementActive
          ? {
              priceInvoiced: agreement!.priceInvoiced,
              priceWhite: agreement!.priceWhite,
              customerProductCode: agreement!.customerProductCode || null,
              minQuantity: agreement!.minQuantity,
              validFrom: agreement!.validFrom,
              validTo: agreement!.validTo,
            }
          : undefined,
      });
    } catch (error) {
      next(error);
    }
  }

  async reportProductImageIssue(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await warehouseWorkflowService.reportProductImageIssue(id, {
        userId: req.user?.userId,
        note: req.body?.note,
      });

      res.json(result);
    } catch (error: any) {
      const status = error.message?.includes('bulunamadi') ? 404 : error.message?.includes('gerekli') ? 400 : 500;
      res.status(status).json({ error: error.message || 'Resim hatasi bildirilemedi' });
    }
  }

  /**
   * GET /api/products/:id/recommendations
   */
  async getProductRecommendations(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const context = await loadCustomerContext(req.user!.userId);
      const recommendedIds = await productComplementService.getRecommendationIdsForProduct(id);

      if (recommendedIds.length === 0) {
        return res.json({ products: [] });
      }
      const excludedProductCodes = await exclusionService.getActiveProductCodeExclusions();

      const popularityMap = await productComplementService.getPopularityByProductIds(recommendedIds);
      const orderIndex = new Map(recommendedIds.map((productId, index) => [productId, index]));
      const sortedIds = [...recommendedIds].sort((a, b) => {
        const aCount = popularityMap.get(a) || 0;
        const bCount = popularityMap.get(b) || 0;
        if (bCount !== aCount) {
          return bCount - aCount;
        }
        return (orderIndex.get(a) || 0) - (orderIndex.get(b) || 0);
      });

      const products = await prisma.product.findMany({
        where: {
          id: { in: sortedIds },
          active: true,
          hiddenFromCustomers: false,
          ...(excludedProductCodes.length > 0 ? { mikroCode: { notIn: excludedProductCodes } } : {}),
        },
        select: {
          id: true,
          name: true,
          mikroCode: true,
          brandCode: true,
          unit: true,
          unit2: true,
          unit2Factor: true,
          vatRate: true,
          currentCost: true,
          lastEntryPrice: true,
          excessStock: true,
          imageUrl: true,
          warehouseStocks: true,
          warehouseExcessStocks: true,
          pendingCustomerOrdersByWarehouse: true,
          prices: true,
          category: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      const productMap = new Map(products.map((product) => [product.id, product]));
      const orderedProducts = sortedIds
        .map((productId) => productMap.get(productId))
        .filter(Boolean) as typeof products;

      const payload = await buildCustomerProductPayloads({
        products: orderedProducts,
        customer: context.customer,
        priceListRules: context.priceListRules,
        basePriceListPair: context.basePriceListPair,
        includedWarehouses: context.includedWarehouses,
        effectiveVisibility: context.effectiveVisibility,
        isDiscounted: false,
      });

      res.json({ products: payload });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/recommendations/cart
   */
  async getCartRecommendations(req: Request, res: Response, next: NextFunction) {
    try {
      const context = await loadCustomerContext(req.user!.userId);
      const cart = await prisma.cart.findUnique({
        where: { userId: req.user!.userId },
        select: {
          items: {
            select: { productId: true },
          },
        },
      });
      const cartProductIds: string[] = [];
      const seen = new Set<string>();
      (cart?.items || []).forEach((item) => {
        if (!item.productId || seen.has(item.productId)) return;
        seen.add(item.productId);
        cartProductIds.push(item.productId);
      });

      if (cartProductIds.length === 0) {
        return res.json({ groups: [] });
      }
      const excludedProductCodes = await exclusionService.getActiveProductCodeExclusions();

      const baseProducts = await prisma.product.findMany({
        where: {
          id: { in: cartProductIds },
          active: true,
          hiddenFromCustomers: false,
          ...(excludedProductCodes.length > 0 ? { mikroCode: { notIn: excludedProductCodes } } : {}),
        },
        select: { id: true, name: true, mikroCode: true },
      });
      const baseProductMap = new Map(baseProducts.map((product) => [product.id, product]));
      const visibleCartProductIds = baseProducts.map((product) => product.id);

      if (visibleCartProductIds.length === 0) {
        return res.json({ groups: [] });
      }

      const recommendationsByProduct = await productComplementService.getRecommendationIdsByProduct(
        visibleCartProductIds,
        5,
        visibleCartProductIds
      );

      const allRecommendedIds = Array.from(
        new Set(Object.values(recommendationsByProduct).flat())
      );

      if (allRecommendedIds.length === 0) {
        return res.json({ groups: [] });
      }

      const popularityMap = await productComplementService.getPopularityByProductIds(allRecommendedIds);
      const sortByPopularity = (ids: string[]) => {
        const orderIndex = new Map(ids.map((id, index) => [id, index]));
        return [...ids].sort((a, b) => {
          const aCount = popularityMap.get(a) || 0;
          const bCount = popularityMap.get(b) || 0;
          if (bCount !== aCount) {
            return bCount - aCount;
          }
          return (orderIndex.get(a) || 0) - (orderIndex.get(b) || 0);
        });
      };

      const products = await prisma.product.findMany({
        where: {
          id: { in: allRecommendedIds },
          active: true,
          hiddenFromCustomers: false,
          ...(excludedProductCodes.length > 0 ? { mikroCode: { notIn: excludedProductCodes } } : {}),
        },
        select: {
          id: true,
          name: true,
          mikroCode: true,
          brandCode: true,
          unit: true,
          unit2: true,
          unit2Factor: true,
          vatRate: true,
          currentCost: true,
          lastEntryPrice: true,
          excessStock: true,
          imageUrl: true,
          warehouseStocks: true,
          warehouseExcessStocks: true,
          pendingCustomerOrdersByWarehouse: true,
          prices: true,
          category: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      const productMap = new Map(products.map((product) => [product.id, product]));
      const orderedProducts = allRecommendedIds
        .map((productId) => productMap.get(productId))
        .filter(Boolean) as typeof products;

      const payload = await buildCustomerProductPayloads({
        products: orderedProducts,
        customer: context.customer,
        priceListRules: context.priceListRules,
        basePriceListPair: context.basePriceListPair,
        includedWarehouses: context.includedWarehouses,
        effectiveVisibility: context.effectiveVisibility,
        isDiscounted: false,
      });

      const payloadMap = new Map(payload.map((product) => [product.id, product]));

      const groups = visibleCartProductIds
        .map((productId) => {
          const baseProduct = baseProductMap.get(productId);
          if (!baseProduct) return null;
          const recommendedIds = sortByPopularity(recommendationsByProduct[productId] || []);
          const recommendedProducts = recommendedIds
            .map((id) => payloadMap.get(id))
            .filter(Boolean);

          if (recommendedProducts.length === 0) return null;

          return {
            baseProduct,
            products: recommendedProducts,
          };
        })
        .filter(Boolean);

      res.json({ groups });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/categories
   */
  async getCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const categories = await getCachedValue('customer:categories', () =>
        prisma.category.findMany({
          // Yalniz musteriye gosterilebilir urunu OLAN kategoriler (bos kategori gizlenir)
          where: {
            active: true,
            products: { some: { active: true, hiddenFromCustomers: false } },
          },
          select: {
            id: true,
            name: true,
            mikroCode: true,
          },
          orderBy: {
            name: 'asc',
          },
        })
      );

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
      const settings = await getCachedValue('customer:warehouses', () =>
        prisma.settings.findFirst({
          select: {
            includedWarehouses: true,
          },
        })
      );

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

      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { id: true, parentCustomerId: true },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const targetId = user.parentCustomerId || user.id;
      const updates = [
        prisma.user.update({
          where: { id: targetId },
          data: { vatDisplayPreference },
        }),
      ];

      if (targetId !== user.id) {
        updates.push(
          prisma.user.update({
            where: { id: user.id },
            data: { vatDisplayPreference },
          })
        );
      }

      await prisma.$transaction(updates);

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
      await cartPricingService.syncCartDiscountAllocations(req.user!.userId);
      const excludedProductCodes = await exclusionService.getActiveProductCodeExclusions();
      const cart = await prisma.cart.findUnique({
        where: { userId: req.user!.userId },
        include: {
          items: {
            where: {
              product: {
                active: true,
                hiddenFromCustomers: false,
                ...(excludedProductCodes.length > 0 ? { mikroCode: { notIn: excludedProductCodes } } : {}),
              },
            },
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  mikroCode: true,
                  imageUrl: true,
                  vatRate: true,
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

      // Her item iÃ§in KDV bilgisini al
      const itemsWithVat = cart.items.map((item) => {
        const { vatRate, ...product } = item.product;
        return {
          id: item.id,
          product,
          quantity: item.quantity,
          priceType: item.priceType,
          priceMode: item.priceMode,
          unitPrice: item.unitPrice,
          totalPrice: item.quantity * item.unitPrice,
          lineNote: item.lineNote || null,
          vatRate: vatRate || 0,
        };
      });

      // KDV hariÃ§ ve KDV dahil toplamlarÄ± hesapla
      const subtotal = total; // KDV hariÃ§
      const totalVat = itemsWithVat.reduce((sum, item) => {
        // Sadece faturalÄ± Ã¼rÃ¼nlerin KDV'sini hesapla (beyaz zaten KDV'nin yarÄ±sÄ±nÄ± iÃ§eriyor)
        if (item.priceType === 'INVOICED') {
          return sum + item.totalPrice * item.vatRate;
        }
        return sum;
      }, 0);
      const totalWithVat = subtotal + totalVat;

      res.json({
        id: cart.id,
        items: itemsWithVat,
        subtotal, // KDV hariÃ§
        totalVat,
        total: totalWithVat, // KDV dahil
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
      {
        const { productId, quantity, priceType, priceMode } = req.body;
        const requestedPriceMode = priceMode === 'EXCESS' ? 'EXCESS' : 'LIST';
        const parsedQuantity = Number(quantity);
        if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
          return res.status(400).json({ error: 'Quantity must be greater than 0' });
        }

        if (priceType !== 'INVOICED' && priceType !== 'WHITE') {
          return res.status(400).json({ error: 'Invalid price type' });
        }

        const context = await cartPricingService.loadCartCustomerContext(req.user!.userId);
        const user = context.user;
        const customer = context.customer;
        const safePriceType = priceType as CartPriceType;

        const product = await prisma.product.findUnique({
          where: { id: productId },
        });

        if (!product || !product.active || product.hiddenFromCustomers) {
          return res.status(404).json({ error: 'Product not found' });
        }

        const excludedProductCodeSet = new Set(await exclusionService.getActiveProductCodeExclusions());
        if (excludedProductCodeSet.has(normalizeMikroCode(product.mikroCode))) {
          return res.status(404).json({ error: 'Product not found' });
        }

        if (requestedPriceMode === 'EXCESS' && product.excessStock <= 0) {
          return res.status(400).json({ error: 'Product is not discounted' });
        }

        if (!cartPricingService.isCartPriceTypeAllowed(context.effectiveVisibility, safePriceType)) {
          return res.status(400).json({ error: 'Price type not allowed for customer' });
        }

        let cart = await prisma.cart.findUnique({
          where: { userId: user.id },
        });

        if (!cart) {
          cart = await prisma.cart.create({
            data: { userId: user.id },
          });
        }

        const existingItems = await prisma.cartItem.findMany({
          where: {
            cartId: cart.id,
            productId,
            priceType: safePriceType,
          },
          orderBy: { createdAt: 'asc' },
        });

        const currentQuantity = existingItems.reduce((sum, item) => sum + item.quantity, 0);
        const rebalanceResult = await cartPricingService.rebalanceCartProductPriceType({
          context,
          cartId: cart.id,
          productId,
          product,
          priceType: safePriceType,
          totalQuantity: currentQuantity + Math.trunc(parsedQuantity),
          existingItems,
        });
        const cartItemId = rebalanceResult.cartItemIds[0];

        const sessionId = typeof req.headers['x-session-id'] === 'string' ? req.headers['x-session-id'] : undefined;
        try {
          await customerActivityService.trackEvent({
            type: 'CART_ADD',
            userId: user.id,
            customerId: customer?.id ?? user.id,
            sessionId,
            productId: product.id,
            productCode: product.mikroCode,
            cartItemId,
            quantity: Math.trunc(parsedQuantity),
            meta: {
              priceType: safePriceType,
              requestedPriceMode,
              excessQuantity: rebalanceResult.excessQuantity,
              listQuantity: rebalanceResult.listQuantity,
            },
            ip: req.ip,
            userAgent: req.headers['user-agent'],
          });
        } catch (error) {
          console.error('Customer activity log failed (cart add):', error);
        }

        return res.json({ message: 'Product added to cart' });
      }

    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/cart/:itemId
   */
  async updateCartItem(req: Request, res: Response, next: NextFunction) {
    try {
      {
        const { itemId } = req.params;
        const { quantity, lineNote } = req.body || {};

        const hasQuantity = quantity !== undefined && quantity !== null;
        const parsedQuantity = Number(quantity);

        if (hasQuantity && (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0)) {
          return res.status(400).json({ error: 'Quantity must be greater than 0' });
        }

        const cartItem = await prisma.cartItem.findUnique({
          where: { id: itemId },
          include: {
            product: true,
            cart: {
              select: {
                id: true,
                userId: true,
              },
            },
          },
        });

        if (!cartItem || cartItem.cart.userId !== req.user!.userId) {
          return res.status(404).json({ error: 'Cart item not found' });
        }

        if (!cartItem.product.active || cartItem.product.hiddenFromCustomers) {
          return res.status(404).json({ error: 'Product not found' });
        }

        const context = await cartPricingService.loadCartCustomerContext(req.user!.userId);
        const safePriceType: CartPriceType = cartItem.priceType === 'WHITE' ? 'WHITE' : 'INVOICED';

        if (!cartPricingService.isCartPriceTypeAllowed(context.effectiveVisibility, safePriceType)) {
          return res.status(400).json({ error: 'Price type not allowed for customer' });
        }

        const existingItems = await prisma.cartItem.findMany({
          where: {
            cartId: cartItem.cartId,
            productId: cartItem.productId,
            priceType: safePriceType,
          },
          orderBy: { createdAt: 'asc' },
        });

        const nextQuantity = hasQuantity ? Math.trunc(parsedQuantity) : cartItem.quantity;
        const otherQuantity = existingItems.reduce((sum, item) => (
          item.id === cartItem.id ? sum : sum + item.quantity
        ), 0);
        const normalizedNote =
          lineNote !== undefined
            ? (String(lineNote).trim() || null)
            : undefined;

        const rebalanceResult = await cartPricingService.rebalanceCartProductPriceType({
          context,
          cartId: cartItem.cartId,
          productId: cartItem.productId,
          product: cartItem.product,
          priceType: safePriceType,
          totalQuantity: otherQuantity + nextQuantity,
          existingItems,
          lineNotePatch: normalizedNote !== undefined
            ? { itemId: cartItem.id, value: normalizedNote }
            : undefined,
        });

        const sessionId = typeof req.headers['x-session-id'] === 'string' ? req.headers['x-session-id'] : undefined;
        try {
          await customerActivityService.trackEvent({
            type: 'CART_UPDATE',
            userId: context.user.id,
            customerId: context.customer?.id ?? context.user.id,
            sessionId,
            productId: cartItem.productId,
            productCode: cartItem.product.mikroCode,
            cartItemId: rebalanceResult.cartItemIds.includes(cartItem.id)
              ? cartItem.id
              : rebalanceResult.cartItemIds[0],
            quantity: hasQuantity ? nextQuantity : undefined,
            meta: {
              priceType: safePriceType,
              previousPriceMode: cartItem.priceMode,
              excessQuantity: rebalanceResult.excessQuantity,
              listQuantity: rebalanceResult.listQuantity,
              lineNote: normalizedNote,
            },
            ip: req.ip,
            userAgent: req.headers['user-agent'],
          });
        } catch (error) {
          console.error('Customer activity log failed (cart update):', error);
        }

        return res.json({ message: 'Cart item updated' });
      }

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

      const cartItem = await prisma.cartItem.findUnique({
        where: { id: itemId },
        include: {
          product: true,
        },
      });

      if (!cartItem) {
        return res.status(404).json({ error: 'Cart item not found' });
      }

      await prisma.cartItem.delete({
        where: { id: itemId },
      });

      const sessionId = typeof req.headers['x-session-id'] === 'string' ? req.headers['x-session-id'] : undefined;
      try {
        const customerId = await customerActivityService.resolveCustomerId(req.user!.userId);
        await customerActivityService.trackEvent({
          type: 'CART_REMOVE',
          userId: req.user!.userId,
          customerId: customerId ?? undefined,
          sessionId,
          productId: cartItem.productId,
          productCode: cartItem.product?.mikroCode,
          cartItemId: cartItem.id,
          quantity: cartItem.quantity,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        });
      } catch (error) {
        console.error('Customer activity log failed (cart remove):', error);
      }

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
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { parentCustomerId: true },
      });

      if (user?.parentCustomerId) {
        return res.status(403).json({ error: 'Sub users cannot create orders' });
      }

      const { customerOrderNumber, deliveryLocation } = req.body || {};
      const result = await orderService.createOrderFromCart(req.user!.userId, {
        customerOrderNumber,
        deliveryLocation,
      });

      res.status(201).json({
        message: 'Order created successfully',
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        // 1.6: Gizli/pasif oldugu icin siparise alinmayan urunler (frontend bilgilendirir)
        skippedItems: result.skippedItems || [],
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

      // KullanÄ±cÄ±nÄ±n kendi sipariÅŸi olduÄŸunu kontrol et
      if (order.userId !== req.user!.userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json(order);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/analytics/events
   */
  async trackActivityEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        type,
        pagePath,
        pageTitle,
        referrer,
        productId,
        productCode,
        cartItemId,
        quantity,
        durationSeconds,
        clickCount,
        meta,
        sessionId,
      } = req.body || {};

      const userId = req.user!.userId;
      const resolvedCustomerId = await customerActivityService.resolveCustomerId(userId);
      const fallbackSessionId =
        typeof req.headers['x-session-id'] === 'string' ? req.headers['x-session-id'] : undefined;

      await customerActivityService.trackEvent({
        type,
        userId,
        customerId: resolvedCustomerId ?? undefined,
        sessionId: sessionId || fallbackSessionId,
        pagePath,
        pageTitle,
        referrer,
        productId,
        productCode,
        cartItemId,
        quantity,
        durationSeconds,
        clickCount,
        meta,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
}

export default new CustomerController();


