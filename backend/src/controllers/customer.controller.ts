/**
 * Customer Controller
 */

import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
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
import bundlePricingService from '../services/bundle-pricing.service';
import vadeService from '../services/vade.service';
import giftCampaignService from '../services/gift-campaign.service';
import { splitSearchTokens, normalizeSearchText } from '../utils/search';
import { MikroCustomerSaleMovement, ProductPrices } from '../types';
import { resolveCustomerPriceLists, resolveCustomerPriceListsForProduct } from '../utils/customerPricing';
import { applyAgreementPrices, isAgreementActive, isAgreementApplicable, resolveAgreementPrice } from '../utils/agreements';
import { applyLastPriceFloor, resolveLastPriceOverride } from '../utils/lastPrice';

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

/** Musteri statik cache'ini (kategori/depo vb.) temizle. Admin gorsel/ayar degisiminde cagrilir. */
export const invalidateCustomerStaticCache = (key?: string): void => {
  if (key) customerStaticCache.delete(key);
  else customerStaticCache.clear();
};

/**
 * Musteriye gosterilebilir kategori agaci (yaprak + ata kodlari) + otomatik gorsel.
 * getCategories ve getUnboughtCategories ayni sonucu paylassin diye tek yerde;
 * 'customer:categories' cache'i (10 dk) altinda tek sefer hesaplanir.
 */
type VisibleCategory = {
  id: string;
  name: string;
  mikroCode: string;
  imageUrl: string | null;
  autoImage: boolean;
  // true = kendi urunu OLAN (yaprak/gercek) kategori; false = sadece ata/ara dugum
  // (urunu yok). "Hic almadigi kategoriler" sayfasi yalniz hasProducts=true gosterir.
  hasProducts: boolean;
};

const getVisibleCategories = async (): Promise<VisibleCategory[]> =>
  getCachedValue(
    'customer:categories',
    async () => {
      // 1) Musteriye gosterilebilir urunu OLAN kategoriler (genelde en-alt / yaprak seviye)
      const withProducts = await prisma.category.findMany({
        where: {
          active: true,
          products: { some: { active: true, hiddenFromCustomers: false } },
        },
        select: { mikroCode: true },
      });
      // Kendi urunu olan (yaprak) kategori kodlari — ata dugumlerden ayirmak icin.
      const withProductsSet = new Set(withProducts.map((c) => c.mikroCode).filter(Boolean));

      // 2) Hiyerarsinin (ana -> alt -> en alt) kurulabilmesi icin yaprak kategorilerin
      //    TUM ust (ata) kategori kodlarini da topla. Kodlar nokta-ayracli: "1.02.03"
      //    atalari "1.02" ve "1". (Ara seviyelerin kendi urunu olmadigi icin eski
      //    sorgu onlari eliyordu; bu yuzden menude sadece yaprak gozukuyordu.)
      const neededCodes = new Set<string>();
      for (const cat of withProducts) {
        const code = cat.mikroCode;
        if (!code) continue;
        neededCodes.add(code);
        const parts = code.split('.');
        for (let i = 1; i < parts.length; i += 1) {
          neededCodes.add(parts.slice(0, i).join('.'));
        }
      }

      // 3) Yaprak + ata kategorileri birlikte dondur (ara seviyeler urunu olmasa da gelir)
      const cats = await prisma.category.findMany({
        where: {
          active: true,
          mikroCode: { in: Array.from(neededCodes) },
        },
        select: { id: true, name: true, mikroCode: true, imageUrl: true },
        orderBy: { name: 'asc' },
      });

      // 4) Otomatik gorsel: admin gorsel yuklemediyse (imageUrl null), kategorinin
      //    EN COK SATAN (gorseli olan) urununun gorselini varsayilan olarak kullan.
      //    Cache icinde tek DISTINCT ON sorgusuyla hesaplanir (site hizini etkilemez).
      const hasMissing = cats.some((c) => !c.imageUrl);
      if (hasMissing) {
        try {
          const rows = await prisma.$queryRaw<
            Array<{ mikroCode: string | null; imageUrl: string | null; pop: number | null }>
          >`
            SELECT DISTINCT ON (p."categoryId")
              c."mikroCode" AS "mikroCode",
              p."imageUrl" AS "imageUrl",
              p."popularSalesValue" AS "pop"
            FROM "Product" p
            JOIN "Category" c ON c."id" = p."categoryId"
            WHERE p."active" = true
              AND p."hiddenFromCustomers" = false
              AND p."imageUrl" IS NOT NULL
            ORDER BY p."categoryId", p."popularSalesValue" DESC NULLS LAST
          `;

          // Her kategori kodu (yaprak + atalar) icin en populer urun gorselini sec.
          const bestImageByCode = new Map<string, { url: string; pop: number }>();
          for (const row of rows) {
            const code = row.mikroCode;
            const url = row.imageUrl;
            if (!code || !url) continue;
            const pop = Number(row.pop) || 0;
            const parts = code.split('.');
            for (let i = parts.length; i >= 1; i -= 1) {
              const prefix = parts.slice(0, i).join('.');
              const cur = bestImageByCode.get(prefix);
              if (!cur || pop > cur.pop) bestImageByCode.set(prefix, { url, pop });
            }
          }

          return cats.map((c) => ({
            ...c,
            imageUrl: c.imageUrl || bestImageByCode.get(c.mikroCode)?.url || null,
            autoImage: !c.imageUrl && Boolean(bestImageByCode.get(c.mikroCode)?.url),
            hasProducts: withProductsSet.has(c.mikroCode),
          }));
        } catch (err) {
          console.error('Kategori otomatik gorsel hesabi basarisiz', err);
          return cats.map((c) => ({ ...c, autoImage: false, hasProducts: withProductsSet.has(c.mikroCode) }));
        }
      }

      return cats.map((c) => ({ ...c, autoImage: false, hasProducts: withProductsSet.has(c.mikroCode) }));
    },
    // Kategori + otomatik gorsel nadiren degisir; agir sorguyu seyrek calistir (10 dk).
    10 * 60 * 1000
  );

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
  if (customer.useLastPrices && customer.mikroCariCode) {
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
    const excessPrices = applyLastPriceFloor({
      config: customer,
      lastSalePrice: lastSalesMap.get(product.mikroCode),
      basePrices: agreementExcessPrices || customerPrices,
      guardPrices,
      product: {
        currentCost: product.currentCost,
        lastEntryPrice: product.lastEntryPrice,
      },
      priceVisibility: effectiveVisibility,
    });

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
      prices: isDiscounted ? excessPrices : (agreementPrices || listPrices),
      excessPrices,
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
      const { categoryId, categoryIds: rawCategoryIds, search, warehouse, mode, brands: rawBrands, brand: rawBrand } = req.query;
      const categoryIds = Array.from(
        new Set(
          (Array.isArray(rawCategoryIds) ? rawCategoryIds : [rawCategoryIds])
            .flatMap((value) => String(value || '').split(','))
            .map((value) => value.trim())
            .filter(Boolean)
        )
      );
      // Kategori filtresi: normal urunler categoryId'den; paketler ise "Paketler" ana
      // kategorisine EK OLARAK secilen ikinci kategoride de (bundleSecondaryCategoryId)
      // gorunmeli. Bu yuzden filtre categoryId VEYA bundleSecondaryCategoryId eslesmesi.
      const categoryIdList = categoryIds.length > 0 ? categoryIds : (categoryId ? [categoryId as string] : []);
      const categoryMatch = categoryIdList.length === 1 ? categoryIdList[0] : { in: categoryIdList };
      const categoryFilter: any =
        categoryIdList.length > 0
          ? { OR: [{ categoryId: categoryMatch }, { bundleSecondaryCategoryId: categoryMatch }] }
          : {};
      // Coklu marka filtresi (banner "birden fazla marka" tiklamasi -> /products?brands=A,B,C)
      const brandCodes = Array.from(
        new Set(
          (Array.isArray(rawBrands) ? rawBrands : [rawBrands, rawBrand])
            .flatMap((value) => String(value || '').split(','))
            .map((value) => value.trim())
            .filter(Boolean)
        )
      );
      const brandFilter =
        brandCodes.length > 0
          ? { brandCode: brandCodes.length === 1 ? brandCodes[0] : { in: brandCodes } }
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
            ...brandFilter,
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
          // Min miktarli anlasmada kart fiyati LISTE fiyatidir; anlasma fiyati sepette
          // min miktara ulasilinca uygulanir (rozet bilgisi payload'da).
          const agreementMinQuantity = agreementActive ? (Number(row.minQuantity) || 1) : 1;
          const agreementPriceApplies = agreementActive && agreementMinQuantity <= 1;
          const agreementPrices = agreementPriceApplies ? applyAgreementPrices(listPrices, row) : null;
          const agreementExcessPrices = agreementPriceApplies ? applyAgreementPrices(customerPrices, row) : null;
          const excessPrices = applyLastPriceFloor({
            config: customer,
            lastSalePrice,
            basePrices: agreementExcessPrices || customerPrices,
            guardPrices,
            product: {
              currentCost: product.currentCost,
              lastEntryPrice: product.lastEntryPrice,
            },
            priceVisibility: effectiveVisibility,
          });

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
            excessPrices,
            listPrices: agreementActive ? listPrices : undefined,
            pricingMode: 'LIST',
            agreementMinQuantity: agreementActive ? agreementMinQuantity : undefined,
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

      // Indirimli listede "gercekten indirimli" (excess fiyat < liste fiyat) filtresi
      // DB sayfalamasindan SONRA calistigi icin sayfalar eksik doluyor ve frontend
      // erken "bitti" sanip bazi indirimli urunleri hic gostermiyordu. Cozum: sayfa
      // dolana kadar iteratif ek cekim (makul tarama ust siniriyla). offset burada
      // filtreden GECEN urun sayisi uzerinden ilerler; frontend offset'i zaten
      // teslim edilen urun adedinden hesapladigi icin tutarlidir.
      let discountedPageProducts: any[] = [];
      if (isDiscounted) {
        const discountSort: 'bestsellerValue' | 'excessStock' =
          productSort === 'bestsellerValue' ? 'bestsellerValue' : 'excessStock';
        const discountExcludeCodes = [...excludedProductCodes, ...discountExcludedCodes];
        const EPS = 0.001;
        const isRawGenuinelyDiscounted = (
          rawProduct: any,
          batchStatsMap: Map<string, any>,
          batchAgreementMap: Map<string, any>
        ): boolean => {
          const rawPrices = rawProduct.prices as unknown as ProductPrices;
          const rawCustomerPrices = pricingService.getPriceForCustomer(
            rawPrices,
            customer.customerType as any
          );
          const priceStats = batchStatsMap.get(rawProduct.mikroCode) || null;
          const pair = resolveCustomerPriceListsForProduct(basePriceListPair, priceListRules, {
            brandCode: rawProduct.brandCode,
            categoryId: rawProduct.category?.id,
          });
          const rawListInvoiced = priceListService.getListPriceWithFallback(priceStats, pair.invoiced);
          const rawListWhite = priceListService.getListPriceWithFallback(priceStats, pair.white);
          if (rawListInvoiced <= 0 && rawListWhite <= 0) return false;
          const rawAgreement = batchAgreementMap.get(rawProduct.id);
          const rawAgreementActive = rawAgreement ? isAgreementActive(rawAgreement, now) : false;
          const rawAgreementApplies =
            rawAgreementActive && (Number(rawAgreement.minQuantity) || 1) <= 1;
          const discPrices = rawAgreementApplies
            ? applyAgreementPrices(rawCustomerPrices, rawAgreement)
            : rawCustomerPrices;
          const invoicedOff =
            rawListInvoiced > 0 && Number(discPrices.invoiced) < rawListInvoiced - EPS;
          const whiteOff = rawListWhite > 0 && Number(discPrices.white) < rawListWhite - EPS;
          if (effectiveVisibility === 'WHITE_ONLY') return whiteOff;
          if (effectiveVisibility === 'INVOICED_ONLY') return invoicedOff;
          return invoicedOff || whiteOff;
        };

        if (!limit) {
          // Limitsiz istekte eski davranis: tek cekim (filtre asagida yine uygulanir).
          discountedPageProducts = await stockService.getExcessStockProducts({
            categoryId: categoryId as string,
            categoryIds,
            search: search as string,
            excludeProductCodes: discountExcludeCodes,
            sort: discountSort,
          });
        } else {
          const batchSize = Math.min(200, Math.max(limit * 2, 60));
          const maxScan = Math.max(1200, offset + limit * 10);
          let dbOffset = 0;
          let skippedFiltered = 0;
          let scanned = 0;
          while (discountedPageProducts.length < limit && scanned < maxScan) {
            const batch = await stockService.getExcessStockProducts({
              categoryId: categoryId as string,
              categoryIds,
              search: search as string,
              limit: batchSize,
              offset: dbOffset,
              excludeProductCodes: discountExcludeCodes,
              sort: discountSort,
            });
            if (batch.length === 0) break;
            dbOffset += batch.length;
            scanned += batch.length;
            const [batchStatsMap, batchAgreements] = await Promise.all([
              priceListService.getPriceStatsMap(batch.map((p: any) => p.mikroCode)),
              prisma.customerPriceAgreement.findMany({
                where: {
                  customerId: customer.id,
                  productId: { in: batch.map((p: any) => p.id) },
                },
                select: {
                  productId: true,
                  priceInvoiced: true,
                  priceWhite: true,
                  minQuantity: true,
                  validFrom: true,
                  validTo: true,
                },
              }),
            ]);
            const batchAgreementMap = new Map(batchAgreements.map((row) => [row.productId, row]));
            for (const rawProduct of batch) {
              if (warehouse) {
                const warehouseExcessQty =
                  ((rawProduct.warehouseExcessStocks || {}) as Record<string, number>)[
                    warehouse as string
                  ] || 0;
                if (warehouseExcessQty <= 0) continue;
              }
              if (!isRawGenuinelyDiscounted(rawProduct, batchStatsMap, batchAgreementMap)) continue;
              if (skippedFiltered < offset) {
                skippedFiltered += 1;
                continue;
              }
              discountedPageProducts.push(rawProduct);
              if (discountedPageProducts.length >= limit) break;
            }
            if (batch.length < batchSize) break;
          }
        }
      }

      const products = isDiscounted
        ? discountedPageProducts
        : isPurchased
          ? await prisma.product.findMany({
              where: {
                active: true,
                hiddenFromCustomers: false,
                mikroCode: { in: purchasedCodes },
                ...categoryFilter,
                ...brandFilter,
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

                isBundle: true,

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
                ...brandFilter,
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

                isBundle: true,

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
          ...brandFilter,
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
        Boolean(customer.useLastPrices && customer.mikroCariCode) && canFetchLastSalesForList;
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
        // Anlasma min miktari 1'den buyukse kartta LISTE fiyati gosterilir; anlasma
        // fiyati sepette min miktara ulasilinca uygulanir (rozet bilgisi payload'da).
        const agreementMinQuantity = agreementActive ? (Number(agreement!.minQuantity) || 1) : 1;
        const agreementPriceApplies = agreementActive && agreementMinQuantity <= 1;
        const agreementBasePrices = isDiscounted ? customerPrices : listPrices;
        const agreementPrices = agreementPriceApplies ? applyAgreementPrices(agreementBasePrices, agreement) : null;
        const agreementExcessPrices = agreementPriceApplies ? applyAgreementPrices(customerPrices, agreement) : null;
        const excessPrices = applyLastPriceFloor({
          config: customer,
          lastSalePrice,
          basePrices: agreementExcessPrices || customerPrices,
          guardPrices,
          product: {
            currentCost: product.currentCost,
            lastEntryPrice: product.lastEntryPrice,
          },
          priceVisibility: effectiveVisibility,
        });

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
          // Depo filtresi aktifken excessStock depo bazina duser; karttaki "Ilk N adet
          // indirimli" limiti icin ham toplam ayrica gonderilir.
          totalExcessStock: product.excessStock,
          availableStock,
          maxOrderQuantity,
          imageUrl: product.imageUrl,
          warehouseStocks: availableWarehouseStocks,
          warehouseExcessStocks,
          category: {
            id: product.category.id,
            name: product.category.name,
          },
          prices: isDiscounted ? excessPrices : (agreementPrices || listPrices),
          excessPrices,
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
          // Anlasma fiyatinin hangi miktardan itibaren gecerli oldugu (rozet icin)
          agreementMinQuantity: agreementActive ? agreementMinQuantity : undefined,
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

      // Paketleri (isBundle) musteri-bazli yeniden fiyatla: bilesen fiyat toplami + %iskonto +
      // harmanli KDV + stok=min(bilesen). Sayfada paket yoksa hicbir ek sorgu yapilmaz.
      const bundleIdSet = new Set(
        (pageProducts as any[]).filter((p) => (p as any).isBundle).map((p) => p.id)
      );
      if (bundleIdSet.size > 0) {
        productsWithPrices = await bundlePricingService.decorateBundlePayloads({
          payloads: productsWithPrices,
          bundleIds: bundleIdSet,
          userId: req.user!.userId,
          effectiveVisibility,
        });
      }

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

          excludeFromDiscount: true,

          imageUrl: true,

          warehouseStocks: true,

          warehouseExcessStocks: true,

          pendingCustomerOrdersByWarehouse: true,

          prices: true,
          active: true,
          hiddenFromCustomers: true,
          isBundle: true,

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

      // Paket (bundle): fiyat bilesen toplamindan gelir; ayri detay yolu (icerik + galeri).
      if ((product as any).isBundle) {
        const bundlePayload = await bundlePricingService.buildBundleDetailPayload(req.user!.userId, product.id);
        if (!bundlePayload) return res.status(404).json({ error: 'Product not found' });
        return res.json(bundlePayload);
      }

      // Indirime sokulmamasi istenen urunde fazla stok gosterimde sifirlanir; boylece
      // detay sayfasi da (liste sayfalari ve sepetle tutarli) normal fiyat gosterir.
      if (product.excludeFromDiscount) {
        product.excessStock = 0;
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
      let lastSalePrice: number | undefined;
      if (customer.useLastPrices && customer.mikroCariCode) {
        try {
          const sales = await mikroService.getCustomerSalesMovements(
            customer.mikroCariCode as string,
            [product.mikroCode],
            1
          );
          const lastSalesMap = buildLastSalesMap(sales);
          lastSalePrice = lastSalesMap.get(product.mikroCode);
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
      // Anlasma min miktari 1'den buyukse detayda LISTE fiyati gosterilir; anlasma
      // fiyati sepette min miktara ulasilinca uygulanir (rozet bilgisi payload'da).
      const agreementMinQuantity = agreementActive ? (Number(agreement!.minQuantity) || 1) : 1;
      const agreementPriceApplies = agreementActive && agreementMinQuantity <= 1;
      const agreementBasePrices = isDiscounted ? customerPrices : listPrices;
      const agreementPrices = agreementPriceApplies ? applyAgreementPrices(agreementBasePrices, agreement) : null;
      const agreementExcessPrices = agreementPriceApplies ? applyAgreementPrices(customerPrices, agreement) : null;
      const excessPrices = applyLastPriceFloor({
        config: customer,
        lastSalePrice,
        basePrices: agreementExcessPrices || customerPrices,
        guardPrices,
        product: {
          currentCost: product.currentCost,
          lastEntryPrice: product.lastEntryPrice,
        },
        priceVisibility: effectiveVisibility,
      });

      // Urun galerisi (coklu gorsel) — sadece detay ucu doner (liste payload'i sismesin).
      // Primary once, sonra sortOrder. ProductImage yoksa imageUrl'e geri dus.
      const galleryRows = await prisma.productImage.findMany({
        where: { productId: product.id },
        orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { url: true },
      });
      const images = galleryRows.length
        ? galleryRows.map((g) => g.url)
        : (product.imageUrl ? [product.imageUrl] : []);

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
        images,
        category: product.category,
        prices: isDiscounted ? excessPrices : (agreementPrices || listPrices),
        excessPrices,
        listPrices: agreementActive ? listPricesRaw : (isDiscounted ? listPricesRaw : undefined),
        pricingMode: isDiscounted ? 'EXCESS' : 'LIST',
        agreementMinQuantity: agreementActive ? agreementMinQuantity : undefined,
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
   * GET /api/products/:id/alternatives
   * Ayni STOK AILESINDEKI (ProductFamily) esdeger urunler.
   * Sadece stokta olan (depo 1+6 toplami > 0), aktif ve musteriye acik urunler;
   * fiyatlar musteri kurallariyla (getProducts payload mantigi) doner.
   */
  async getProductAlternatives(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const baseProduct = await prisma.product.findUnique({
        where: { id },
        select: { id: true, mikroCode: true },
      });

      if (!baseProduct) {
        return res.status(404).json({ error: 'Urun bulunamadi' });
      }

      // Urunun uyesi oldugu aktif stok aileleri
      const memberships = await prisma.productFamilyItem.findMany({
        where: {
          active: true,
          family: { active: true },
          OR: [{ productId: baseProduct.id }, { productCode: baseProduct.mikroCode }],
        },
        select: { familyId: true },
      });
      const familyIds = Array.from(new Set(memberships.map((item) => item.familyId)));

      if (familyIds.length === 0) {
        return res.json({ products: [] });
      }

      // Ailelerdeki kardes urun kodlari (aile onceligine gore sirali, kendisi haric)
      const siblingItems = await prisma.productFamilyItem.findMany({
        where: { familyId: { in: familyIds }, active: true },
        select: { productCode: true },
        orderBy: { priority: 'asc' },
      });
      const baseCode = normalizeMikroCode(baseProduct.mikroCode);
      const seenCodes = new Set<string>();
      const siblingCodes: string[] = [];
      for (const item of siblingItems) {
        const code = String(item.productCode || '').trim();
        const normalized = normalizeMikroCode(code);
        if (!code || normalized === baseCode || seenCodes.has(normalized)) continue;
        seenCodes.add(normalized);
        siblingCodes.push(code);
      }

      if (siblingCodes.length === 0) {
        return res.json({ products: [] });
      }

      const [context, excludedProductCodes] = await Promise.all([
        loadCustomerContext(req.user!.userId),
        exclusionService.getActiveProductCodeExclusions(),
      ]);

      const products = await prisma.product.findMany({
        where: {
          mikroCode: {
            in: siblingCodes,
            ...(excludedProductCodes.length > 0 ? { notIn: excludedProductCodes } : {}),
          },
          active: true,
          hiddenFromCustomers: false,
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

      // Sadece stokta olanlar (merkez depo 1 + Topca depo 6 toplami > 0)
      const inStockProducts = products.filter((product) => {
        const stocks = (product.warehouseStocks || {}) as Record<string, number>;
        return (Number(stocks['1']) || 0) + (Number(stocks['6']) || 0) > 0;
      });

      if (inStockProducts.length === 0) {
        return res.json({ products: [] });
      }

      // Aile oncelik sirasini koru
      const codeOrder = new Map(siblingCodes.map((code, index) => [normalizeMikroCode(code), index]));
      const orderedProducts = [...inStockProducts].sort(
        (a, b) =>
          (codeOrder.get(normalizeMikroCode(a.mikroCode)) ?? Number.MAX_SAFE_INTEGER) -
          (codeOrder.get(normalizeMikroCode(b.mikroCode)) ?? Number.MAX_SAFE_INTEGER)
      );

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
   * GET /api/products/:id/stock-alert
   * Kullanicinin bu urun icin bekleyen (henuz bildirilmemis) alarmi var mi?
   */
  async getStockAlert(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const alert = await prisma.productStockAlert.findUnique({
        where: {
          userId_productId: { userId: req.user!.userId, productId: id },
        },
        select: { notifiedAt: true },
      });

      res.json({ active: Boolean(alert && !alert.notifiedAt) });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/products/:id/stock-alert
   * "Stoga gelince haber ver" alarmi kur (varsa yeniden aktive et).
   */
  async createStockAlert(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const product = await prisma.product.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!product) {
        return res.status(404).json({ error: 'Urun bulunamadi' });
      }

      await prisma.productStockAlert.upsert({
        where: {
          userId_productId: { userId: req.user!.userId, productId: id },
        },
        update: { notifiedAt: null },
        create: { userId: req.user!.userId, productId: id },
      });

      res.json({ active: true });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/products/:id/stock-alert
   */
  async deleteStockAlert(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await prisma.productStockAlert.deleteMany({
        where: { userId: req.user!.userId, productId: id },
      });

      res.json({ active: false });
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
   * GET /api/recommendations/personal
   * Musterinin satin alma gecmisine (tum sepetine) gore tamamlayici urun onerileri.
   * - products: genel "sizin icin" listesi (populerlige gore)
   * - missingCategories: musterinin HIC almadigi kategorilerdeki tamamlayici urunler
   *   (or. kagit alip dispenser almayan, ambalaj alip koli bandi almayan cariler).
   */
  async getPersonalRecommendations(req: Request, res: Response, next: NextFunction) {
    try {
      const context = await loadCustomerContext(req.user!.userId);
      const customer = context.customer;
      const excludedProductCodes = await exclusionService.getActiveProductCodeExclusions();
      const excludedSet = new Set(excludedProductCodes.map((code) => normalizeMikroCode(code)));

      // 1) Satin alinan urun kodlari (once yerel siparisler, yoksa Mikro'dan)
      // Reddedilen siparisler satin alma gecmisi sayilmaz (PENDING alim niyeti oldugu icin dahil).
      let purchasedCodes: string[] = [];
      const localRows = await prisma.orderItem.findMany({
        where: { order: { userId: customer.id, status: { not: 'REJECTED' } } },
        select: { mikroCode: true },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      });
      const codeSet = new Set<string>();
      for (const row of localRows) {
        const code = String(row.mikroCode || '').trim();
        const norm = normalizeMikroCode(code);
        if (!code || codeSet.has(norm) || excludedSet.has(norm)) continue;
        codeSet.add(norm);
        purchasedCodes.push(code);
      }
      if (purchasedCodes.length === 0 && customer.mikroCariCode) {
        try {
          const allCodes = await withTimeout(
            mikroService.getPurchasedProductCodes(customer.mikroCariCode as string),
            10000,
            'getPurchasedProductCodes(personal-recs)'
          );
          purchasedCodes = allCodes.filter((code) => !excludedSet.has(normalizeMikroCode(code)));
        } catch (error) {
          console.error('Personal recs purchased codes failed', { customerId: customer.id, error });
        }
      }
      if (purchasedCodes.length === 0) {
        return res.json({ products: [], missingCategories: [] });
      }

      // Puanlama maliyetini sinirla: en guncel 80 urun yeterli sinyal verir
      const cappedCodes = purchasedCodes.slice(0, 80);

      // 2) Kod -> urun (puanlama icin 80 ile sinirli)
      const purchasedProducts = await prisma.product.findMany({
        where: { mikroCode: { in: cappedCodes } },
        select: { id: true },
      });
      const purchasedProductIds = purchasedProducts.map((p) => p.id);
      // "Eksik kategori" kapsami 80 urunle KIRPILMAZ: duzenli alinan bir kategori
      // "hic almadiniz" cikmasin diye TUM satin alinan kodlarin kategorileri
      // minimal select + distinct ile hesaplanir.
      const purchasedCategoryRows = await prisma.product.findMany({
        where: { mikroCode: { in: purchasedCodes } },
        select: { categoryId: true },
        distinct: ['categoryId'],
      });
      const purchasedCategoryIds = new Set(
        purchasedCategoryRows.map((p) => p.categoryId).filter(Boolean) as string[]
      );
      if (purchasedProductIds.length === 0) {
        return res.json({ products: [], missingCategories: [] });
      }

      // 3) Tum sepete gore tamamlayici oneriler (alinan urunler haric)
      const recommendedIds = await productComplementService.getRecommendationIdsForCart(
        purchasedProductIds,
        40
      );
      if (recommendedIds.length === 0) {
        return res.json({ products: [], missingCategories: [] });
      }

      // 4) Populerlige gore sirala
      const popularityMap = await productComplementService.getPopularityByProductIds(recommendedIds);
      const orderIndex = new Map(recommendedIds.map((id, index) => [id, index]));
      const sortedIds = [...recommendedIds].sort((a, b) => {
        const aCount = popularityMap.get(a) || 0;
        const bCount = popularityMap.get(b) || 0;
        if (bCount !== aCount) return bCount - aCount;
        return (orderIndex.get(a) || 0) - (orderIndex.get(b) || 0);
      });

      // 5) Urunleri getir
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
          categoryId: true,
          category: {
            select: { id: true, name: true },
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
      const payloadMap = new Map(payload.map((product) => [product.id, product]));

      // 6) "Eksik kategoriler": musterinin hic almadigi kategorilerdeki oneriler.
      // Complement eslesmeleri ONCE; az urunlu satirlar kotu gozukmesin diye kategorinin
      // populer urunleriyle 6'ya kadar DOLDURULUR; 3'ten az kalan kategori GIZLENIR.
      const TARGET_PER_CAT = 6;
      const MIN_PER_CAT = 3;
      const missingCatOrder: string[] = [];
      const missingCatInfo = new Map<string, { category: { id: string; name: string }; ids: string[] }>();
      for (const productId of sortedIds) {
        const prod = productMap.get(productId);
        if (!prod || !prod.category) continue;
        const catId = prod.category.id;
        if (!catId || purchasedCategoryIds.has(catId)) continue;
        if (!missingCatInfo.has(catId)) {
          missingCatInfo.set(catId, { category: { id: prod.category.id, name: prod.category.name }, ids: [] });
          missingCatOrder.push(catId);
        }
        missingCatInfo.get(catId)!.ids.push(productId);
      }
      const chosenCatIds = missingCatOrder.slice(0, 6);

      // Doldurma: secili kategorilerden populer urunler (oneri disinda kalanlar)
      const recommendedIdSet = new Set(sortedIds);
      const backfillByCat = new Map<string, any[]>();
      if (chosenCatIds.length > 0) {
        const backfillProducts = await prisma.product.findMany({
          where: {
            categoryId: { in: chosenCatIds },
            active: true,
            hiddenFromCustomers: false,
            ...(excludedProductCodes.length > 0 ? { mikroCode: { notIn: excludedProductCodes } } : {}),
          },
          orderBy: { popularSalesValue: 'desc' },
          take: chosenCatIds.length * (TARGET_PER_CAT + 6),
          select: {
            id: true, name: true, mikroCode: true, brandCode: true, unit: true, unit2: true,
            unit2Factor: true, vatRate: true, currentCost: true, lastEntryPrice: true, excessStock: true,
            imageUrl: true, warehouseStocks: true, warehouseExcessStocks: true,
            pendingCustomerOrdersByWarehouse: true, prices: true, categoryId: true,
            category: { select: { id: true, name: true } },
          },
        });
        for (const bp of backfillProducts) {
          if (!bp.categoryId || recommendedIdSet.has(bp.id)) continue;
          const arr = backfillByCat.get(bp.categoryId) || [];
          arr.push(bp);
          backfillByCat.set(bp.categoryId, arr);
        }
      }

      // Kullanilacak doldurma urunlerini tek seferde fiyatla
      const neededBackfill: any[] = [];
      for (const catId of chosenCatIds) {
        const have = missingCatInfo.get(catId)!.ids.length;
        const need = Math.max(0, TARGET_PER_CAT - have);
        if (need > 0) neededBackfill.push(...(backfillByCat.get(catId) || []).slice(0, need));
      }
      const backfillPayload = neededBackfill.length > 0
        ? await buildCustomerProductPayloads({
            products: neededBackfill,
            customer: context.customer,
            priceListRules: context.priceListRules,
            basePriceListPair: context.basePriceListPair,
            includedWarehouses: context.includedWarehouses,
            effectiveVisibility: context.effectiveVisibility,
            isDiscounted: false,
          })
        : [];
      const backfillPayloadMap = new Map(backfillPayload.map((p) => [p.id, p]));

      const missingCategories: Array<{ category: { id: string; name: string }; products: any[] }> = [];
      for (const catId of chosenCatIds) {
        const info = missingCatInfo.get(catId)!;
        const prods: any[] = [];
        for (const id of info.ids) {
          const pl = payloadMap.get(id);
          if (pl) prods.push(pl);
          if (prods.length >= TARGET_PER_CAT) break;
        }
        if (prods.length < TARGET_PER_CAT) {
          for (const bp of (backfillByCat.get(catId) || [])) {
            const pl = backfillPayloadMap.get(bp.id);
            if (pl && !prods.some((x) => x.id === pl.id)) prods.push(pl);
            if (prods.length >= TARGET_PER_CAT) break;
          }
        }
        if (prods.length >= MIN_PER_CAT) {
          missingCategories.push({ category: info.category, products: prods });
        }
      }

      res.json({ products: payload.slice(0, 12), missingCategories });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/categories
   */
  async getCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const categories = await getVisibleCategories();
      res.json({ categories });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/customer/unbought-categories
   * Cari'nin (parent-aware) HIC alisveris yapmadigi kategoriler:
   *   gorunur kategoriler − (satin alinan kategoriler)
   * "Satin alinan kategoriler" GWP ile ayni kaynaktan gelir
   * (giftCampaignService.getPurchasedCategoryIds — yerel siparisler, yoksa Mikro fallback).
   * Kullanici bazli 10 dk cache'lenir.
   */
  async getUnboughtCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const context = await loadCustomerContext(req.user!.userId);
      const customer = context.customer;

      const categories = await getCachedValue(
        `customer:unbought-categories:${customer.id}`,
        async () => {
          // Satin alinan kategori id'leri (parent-aware; GWP mantigiyla ayni, 1 saat cache'li)
          const purchased = await giftCampaignService.getPurchasedCategoryIds({
            id: customer.id,
            mikroCariCode: customer.mikroCariCode ?? null,
          });

          // Gorunur kategori seti (getCategories ile AYNI sorgu/cache)
          const allCats = await getVisibleCategories();

          // "Hic almadigi" = gorunur (SADECE kendi urunu olan yaprak) − satin alinan.
          // Ata/ara dugumler (hasProducts=false) haric: onlar hicbir zaman purchased'ta
          // olmaz (urun leaf kategoriye baglidir) -> aksi halde tum ust kategoriler her
          // musteride "hic alinmadi" gorunurdu. Ada gore (tr) sirali.
          return allCats
            .filter((c) => c.hasProducts && !purchased.has(c.id))
            .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
        },
        // Satin alma gecmisi ve kategori agaci nadiren degisir; 10 dk cache yeterli.
        10 * 60 * 1000
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
            // En son eklenen urun en ustte gorunsun. Ayni urunun (LIST+EXCESS)
            // satirlari, rebalance sirasinda ilk-ekleme zamanini (createdAt)
            // miras aldigi icin birlikte gruplu kalir (bkz. cart-pricing.service).
            orderBy: { createdAt: 'desc' },
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  mikroCode: true,
                  imageUrl: true,
                  vatRate: true,
                  unit: true,
                  unit2: true,
                  unit2Factor: true,
                  isBundle: true,
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

      // Her item iÃ§in KDV bilgisini al. product artik unit/unit2/unit2Factor de icerir
      // (birim gosterimi/kesirli miktar icin). selectedUnit item bazinda doner.
      const itemsWithVat = cart.items.map((item) => {
        const { vatRate, ...product } = item.product;
        return {
          id: item.id,
          product,
          quantity: item.quantity,
          selectedUnit: item.selectedUnit || null,
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
        const { productId, quantity, priceType, priceMode, selectedUnit } = req.body;
        const requestedPriceMode = priceMode === 'EXCESS' ? 'EXCESS' : 'LIST';
        // Miktar ANA birim cinsinden kesirli (Float) olabilir (alt birim secimi). Truncate ETME.
        const parsedQuantity = Number(quantity);
        if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
          return res.status(400).json({ error: 'Quantity must be greater than 0' });
        }
        // Secilen birim adi (null/ana birim disinda ise saklanir). <=20 karakter, trim'li.
        const normalizedSelectedUnit =
          typeof selectedUnit === 'string' && selectedUnit.trim()
            ? selectedUnit.trim().slice(0, 20)
            : null;

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

        if (requestedPriceMode === 'EXCESS' && (product.excessStock <= 0 || product.excludeFromDiscount)) {
          return res.status(400).json({ error: 'Product is not discounted' });
        }

        if (!cartPricingService.isCartPriceTypeAllowed(context.effectiveVisibility, safePriceType)) {
          return res.status(400).json({ error: 'Price type not allowed for customer' });
        }

        // Paket (bundle): tek satir, LIST modu, birim fiyat = bilesen fiyat toplami + %iskonto.
        // Rebalance/EXCESS mantigi paketlere UYGULANMAZ; fiyat siparis aninda yeniden hesaplanir.
        if ((product as any).isBundle) {
          // Alt kullanicilar (talep akisi) paket ekleyemez: talep->siparis cevriminde bilesen
          // patlatma yok. Paketi ana hesap dogrudan siparise eklemeli.
          if (user.parentCustomerId) {
            return res.status(400).json({ error: 'Paketler yalnizca ana hesaptan siparise eklenebilir.' });
          }
          const priced = await bundlePricingService.priceBundleForCart(user.id, product.id, safePriceType);
          if (!priced || !(priced.unitPrice > 0)) {
            return res.status(400).json({ error: 'Paket fiyati hesaplanamadi' });
          }
          // Bilesenlerden biri pasif/gizli/silinmis ise (availableStock=0) veya paket
          // stokta degilse ekleme; eksik paket siparise gitmesin.
          if (!(priced.availableStock > 0)) {
            return res.status(400).json({ error: 'Bu paket su an stokta yok' });
          }
          let bundleCart = await prisma.cart.findUnique({ where: { userId: user.id } });
          if (!bundleCart) {
            bundleCart = await prisma.cart.create({ data: { userId: user.id } });
          }
          const existingBundle = await prisma.cartItem.findFirst({
            where: { cartId: bundleCart.id, productId, priceType: safePriceType, priceMode: 'LIST' },
          });
          if (existingBundle) {
            await prisma.cartItem.update({
              where: { id: existingBundle.id },
              data: { quantity: existingBundle.quantity + parsedQuantity, unitPrice: priced.unitPrice },
            });
          } else {
            await prisma.cartItem.create({
              data: {
                cartId: bundleCart.id,
                productId,
                quantity: parsedQuantity,
                priceType: safePriceType,
                priceMode: 'LIST',
                unitPrice: priced.unitPrice,
              },
            });
          }
          return res.json({ message: 'Product added to cart' });
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
          totalQuantity: currentQuantity + parsedQuantity,
          existingItems,
        });
        const cartItemId = rebalanceResult.cartItemIds[0];

        // Secilen birim adini rebalance sonrasi olusan/guncellenen satirlara yaz.
        // (rebalance servisi cart-pricing.service.ts B5 sahipligi disindadir; birim
        // bilgisini burada persist ediyoruz.) selectedUnit null ise ana birim demektir.
        if (rebalanceResult.cartItemIds.length > 0) {
          await prisma.cartItem.updateMany({
            where: { id: { in: rebalanceResult.cartItemIds } },
            data: { selectedUnit: normalizedSelectedUnit },
          });
        }

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
            // CustomerActivityEvent.quantity Int? oldugu icin analitik amacli yuvarlanir
            // (fiyat/miktar mantigi bundan etkilenmez; asil miktar CartItem'da Float).
            quantity: Math.round(parsedQuantity),
            meta: {
              priceType: safePriceType,
              requestedPriceMode,
              selectedUnit: normalizedSelectedUnit,
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
        const { quantity, lineNote, selectedUnit } = req.body || {};

        const hasQuantity = quantity !== undefined && quantity !== null;
        // Miktar ANA birim cinsinden kesirli (Float) olabilir; truncate ETME.
        const parsedQuantity = Number(quantity);

        if (hasQuantity && (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0)) {
          return res.status(400).json({ error: 'Quantity must be greater than 0' });
        }

        // selectedUnit body'de yoksa (undefined) mevcut deger KORUNUR; verildiyse
        // (bos string dahil) yeni deger uygulanir (bos -> null = ana birim).
        const hasSelectedUnit = selectedUnit !== undefined;
        const normalizedSelectedUnit =
          typeof selectedUnit === 'string' && selectedUnit.trim()
            ? selectedUnit.trim().slice(0, 20)
            : null;

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

        const nextQuantity = hasQuantity ? parsedQuantity : cartItem.quantity;
        const otherQuantity = existingItems.reduce((sum, item) => (
          item.id === cartItem.id ? sum : sum + item.quantity
        ), 0);
        const normalizedNote =
          lineNote !== undefined
            ? (String(lineNote).trim() || null)
            : undefined;

        // Paket (bundle): rebalance UYGULANMAZ — resolveCartUnitPrices paket icin 0 doner
        // ve fiyati sifirlardi. Tek satir; miktar/not guncelle + fiyati bundle-pricing ile
        // yeniden hesapla (bilesen toplami + %iskonto).
        if ((cartItem.product as any).isBundle) {
          const priced = await bundlePricingService.priceBundleForCart(
            context.user.id,
            cartItem.productId,
            safePriceType
          );
          const unitPrice = priced && priced.unitPrice > 0 ? priced.unitPrice : cartItem.unitPrice;
          await prisma.cartItem.update({
            where: { id: cartItem.id },
            data: {
              quantity: nextQuantity,
              unitPrice,
              ...(normalizedNote !== undefined ? { lineNote: normalizedNote } : {}),
              ...(hasSelectedUnit ? { selectedUnit: normalizedSelectedUnit } : {}),
            },
          });
          return res.json({ message: 'Cart item updated' });
        }

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

        // selectedUnit body'de verildiyse rebalance sonrasi satirlara uygula.
        // (verilmediyse mevcut deger korunur — updateMany cagrilmaz.)
        if (hasSelectedUnit && rebalanceResult.cartItemIds.length > 0) {
          await prisma.cartItem.updateMany({
            where: { id: { in: rebalanceResult.cartItemIds } },
            data: { selectedUnit: normalizedSelectedUnit },
          });
        }

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
            // CustomerActivityEvent.quantity Int? -> analitik icin yuvarlanir.
            quantity: hasQuantity ? Math.round(nextQuantity) : undefined,
            meta: {
              priceType: safePriceType,
              previousPriceMode: cartItem.priceMode,
              selectedUnit: hasSelectedUnit ? normalizedSelectedUnit : undefined,
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

      const cartItem = await prisma.cartItem.findFirst({
        where: {
          id: itemId,
          cart: { userId: req.user!.userId },
        },
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
      const { status, search, page, pageSize } = req.query;
      const result = await orderService.getUserOrders(req.user!.userId, {
        status: typeof status === 'string' ? status : undefined,
        search: typeof search === 'string' ? search : undefined,
        page: page !== undefined ? Number(page) : undefined,
        pageSize: pageSize !== undefined ? Number(pageSize) : undefined,
      });

      if (Array.isArray(result)) {
        res.json({ orders: result });
      } else {
        res.json({
          orders: result.orders,
          pagination: {
            total: result.total,
            page: result.page,
            pageSize: result.pageSize,
            totalPages: Math.max(1, Math.ceil(result.total / result.pageSize)),
          },
        });
      }
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

  /**
   * 0-sonuc arama kurtarma: SearchMiss kaydeder + trigram fuzzy oneri doner.
   * GET /products/search-fallback?q=<terim>&categoryId=<ops>
   * NOT: Normal arama searchText (alias dahil) uzerinden calisir; bu endpoint
   * yalnizca arama 0 sonuc verdiginde "bunu mu demek istediniz" onerisi icindir.
   */
  async searchFallback(req: Request, res: Response, next: NextFunction) {
    try {
      const q = String(req.query.q || '').trim();
      const norm = normalizeSearchText(q);
      if (!norm) {
        return res.json({ term: q, suggestions: [] });
      }

      const rawCategoryId = req.query.categoryId;
      const categoryId =
        typeof rawCategoryId === 'string' && rawCategoryId.trim()
          ? rawCategoryId.trim()
          : undefined;

      // SearchMiss upsert - fire-and-forget (cevabi bekletmesin / hata yutulur)
      prisma.searchMiss
        .upsert({
          where: { normalizedTerm: norm },
          update: {
            count: { increment: 1 },
            lastSearchedAt: new Date(),
            sampleTerm: q,
          },
          create: { normalizedTerm: norm, sampleTerm: q },
        })
        .catch(() => {});

      // Trigram fuzzy oneri (pg_trgm + searchText GIN index)
      const categoryFilter = categoryId
        ? Prisma.sql`AND p."categoryId" = ${categoryId}`
        : Prisma.empty;

      const suggestions = await prisma.$queryRaw<
        Array<{
          id: string;
          name: string;
          mikroCode: string;
          imageUrl: string | null;
          categoryId: string | null;
          categoryName: string | null;
        }>
      >(Prisma.sql`
        SELECT p.id, p.name, p."mikroCode", p."imageUrl", p."categoryId", c.name AS "categoryName"
        FROM "Product" p
        JOIN "Category" c ON c.id = p."categoryId"
        WHERE p.active = true
          AND p."hiddenFromCustomers" = false
          AND ( p."searchText" % ${norm} OR word_similarity(${norm}, p."searchText") > 0.3 )
          ${categoryFilter}
        ORDER BY GREATEST(similarity(p."searchText", ${norm}), word_similarity(${norm}, p."searchText")) DESC, p.name ASC
        LIMIT 24
      `);

      return res.json({ term: q, suggestions });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/unbought-category-products
   * "Henuz denemediginiz kategoriler" sayfasi (kategori kartlari yerine URUN listesi).
   * Carinin HIC almadigi kategorilerdeki gorunur urunler (cok-satan sirali), sayfali.
   * - categoryId verilirse: SADECE o kategori (denenmemis set icinde olmak zorunda).
   * - categoryId yoksa: TUM denenmemis kategorilerdeki urunler.
   * Urun payload'i /products ile AYNI (buildCustomerProductPayloads reuse) -> ayni ProductCard.
   * categories = denenmemis yaprak kategori listesi (sol ray). getUnboughtCategories ile ayni mantik.
   */
  async getUnboughtCategoryProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const context = await loadCustomerContext(req.user!.userId);
      const {
        customer,
        priceListRules,
        basePriceListPair,
        includedWarehouses,
        effectiveVisibility,
      } = context;

      // Denenmemis (hic alinmayan) yaprak kategoriler — getUnboughtCategories ile AYNI cache/mantik.
      const unboughtCategories = await getCachedValue(
        `customer:unbought-categories:${customer.id}`,
        async () => {
          const purchased = await giftCampaignService.getPurchasedCategoryIds({
            id: customer.id,
            mikroCariCode: customer.mikroCariCode ?? null,
          });
          const allCats = await getVisibleCategories();
          return allCats
            .filter((c) => c.hasProducts && !purchased.has(c.id))
            .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
        },
        10 * 60 * 1000
      );

      const unboughtIdSet = new Set(unboughtCategories.map((c) => c.id));
      const categories = unboughtCategories.map((c) => ({
        id: c.id,
        name: c.name,
        mikroCode: c.mikroCode,
        imageUrl: c.imageUrl,
      }));

      // Sol ray listesi (categories) her zaman doner; urun sorgusunu daralt.
      const requestedCategoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId.trim() : '';
      // Istenen kategori denenmemis set disindaysa: urun dondurme (ama kategori rayini koru).
      if (requestedCategoryId && !unboughtIdSet.has(requestedCategoryId)) {
        return res.json({ products: [], totalCount: 0, categories });
      }

      const categoryWhere = requestedCategoryId
        ? { categoryId: requestedCategoryId }
        : { categoryId: { in: Array.from(unboughtIdSet) } };

      // Hic denenmemis kategori yoksa: bos liste.
      if (!requestedCategoryId && unboughtIdSet.size === 0) {
        return res.json({ products: [], totalCount: 0, categories });
      }

      const excludedProductCodes = await exclusionService.getActiveProductCodeExclusions();

      const rawLimit = Number(req.query.limit);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 200) : 60;
      const rawOffset = Number(req.query.offset);
      const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;

      // Sort: /products ile ayni cok-satan varsayilani (popularSalesValue desc).
      const requestedSort = typeof req.query.sort === 'string' ? req.query.sort : '';
      const productSort = requestedSort || 'bestsellerValue';
      const bestsellerOrderBy = [{ popularSalesValue: 'desc' as const }, { name: 'asc' as const }];
      const nameOrderBy = [{ name: 'asc' as const }];

      const productWhere: any = {
        active: true,
        hiddenFromCustomers: false,
        ...(excludedProductCodes.length > 0 ? { mikroCode: { notIn: excludedProductCodes } } : {}),
        ...categoryWhere,
      };

      const [totalCount, products] = await Promise.all([
        prisma.product.count({ where: productWhere }),
        prisma.product.findMany({
          where: productWhere,
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
            category: { select: { id: true, name: true } },
          },
          orderBy: productSort === 'bestsellerValue' ? bestsellerOrderBy : nameOrderBy,
          skip: offset,
          take: limit,
        }),
      ]);

      // /products ile AYNI serializasyon/fiyatlandirma -> ayni ProductCard payload'i.
      const payload = await buildCustomerProductPayloads({
        products: products as any,
        customer,
        priceListRules,
        basePriceListPair,
        includedWarehouses,
        effectiveVisibility,
      });

      res.json({ products: payload, totalCount, categories });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/brand-facets
   * Marka filtre rayi: gorunur (aktif + gizli-degil) urunlerden distinct marka + sayac.
   * - categoryId: opsiyonel baglam (o kategorideki markalar).
   * - search: marka koduna gore filtre (marka adi ayri alan degil; brandCode = kod = ad).
   * Sayfalama YOK; TUM katalogu kapsayan marka listesi doner (groupBy, tek agregat sorgu).
   */
  async getBrandFacets(req: Request, res: Response, next: NextFunction) {
    try {
      const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId.trim() : '';
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

      const where: any = {
        active: true,
        hiddenFromCustomers: false,
        brandCode: {
          not: null,
          ...(search ? { contains: search, mode: 'insensitive' } : {}),
        },
      };
      if (categoryId) where.categoryId = categoryId;

      const grouped = await prisma.product.groupBy({
        by: ['brandCode'],
        where,
        _count: { _all: true },
        orderBy: { brandCode: 'asc' },
        take: 500,
      });

      const brands = grouped
        // brandCode = hem kod hem ad (Product'ta ayri marka adi yok).
        .map((entry) => ({ code: (entry.brandCode || '').trim(), count: entry._count._all }))
        .filter((b) => b.code)
        .map((b) => ({ code: b.code, name: b.code, count: b.count }))
        .sort((a, b) => a.name.localeCompare(b.name, 'tr'));

      res.json({ brands });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /category-facets — mevcut arama/marka/depo baglamindaki SONUCLARDA gecen KOK kategoriler.
   * Rail tum kategori agacini degil, yalnizca sonuclarda bulunan (kok) kategorileri gostersin diye.
   * getProducts (mode: 'all') urun-filtresini aynen yansitir: active + hiddenFromCustomers=false +
   * exclusion + arama (searchText token) + marka. categoryId UYGULANMAZ (kategori secilince rail
   * tek kalana dusmesin). Urunun leaf kategorisi mikroCode ilk segmentine gore koke eslenir.
   */
  async getCategoryFacets(req: Request, res: Response, next: NextFunction) {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      const rawBrands = req.query.brands;
      const rawBrand = req.query.brand;
      const brandCodes = Array.from(
        new Set(
          (Array.isArray(rawBrands) ? rawBrands : [rawBrands, rawBrand])
            .flatMap((value) => String(value || '').split(','))
            .map((value) => value.trim())
            .filter(Boolean)
        )
      );
      const brandFilter =
        brandCodes.length > 0
          ? { brandCode: brandCodes.length === 1 ? brandCodes[0] : { in: brandCodes } }
          : {};
      const searchTokens = splitSearchTokens(search);

      const excludedProductCodes = await exclusionService.getActiveProductCodeExclusions();

      // getProducts (mode: 'all') where'i ile ayni — KATEGORI filtresi HARIC.
      const where: any = {
        active: true,
        hiddenFromCustomers: false,
        ...(excludedProductCodes.length > 0 ? { mikroCode: { notIn: excludedProductCodes } } : {}),
        ...brandFilter,
        ...(searchTokens.length > 0
          ? {
              AND: searchTokens.map((token) => ({
                OR: [{ searchText: { contains: normalizeSearchText(token) } }],
              })),
            }
          : {}),
      };

      // Eslesen urunleri leaf kategoriye gore grupla (tek grouped sorgu).
      const grouped = await prisma.product.groupBy({
        by: ['categoryId'],
        where,
        _count: { _all: true },
      });

      if (grouped.length === 0) {
        return res.json({ categories: [] });
      }

      // Kategori haritasi (id -> mikroCode/name) ve mikroCode -> id: leaf->kok eslemesi icin.
      const allCategories = await prisma.category.findMany({
        select: { id: true, mikroCode: true, name: true },
      });
      const catById = new Map(allCategories.map((c) => [c.id, c]));
      const codeToId = new Map(allCategories.map((c) => [c.mikroCode, c.id]));

      // Leaf kategorinin kokunu bul: mikroCode'un ilk '.' oncesi segmenti (rail'in
      // !mikroCode.includes('.') kok tanimiyla tutarli). Kok yoksa kategori kendi kokudur.
      const resolveRootId = (leafId: string): string | null => {
        const leaf = catById.get(leafId);
        if (!leaf) return null;
        const code = String(leaf.mikroCode || '');
        if (!code) return leafId;
        const dot = code.indexOf('.');
        if (dot < 0) return leafId; // zaten kok
        const rootCode = code.slice(0, dot);
        return codeToId.get(rootCode) || leafId; // kok kategori kaydi yoksa leaf'in kendisi
      };

      // Kok bazinda eslesen urun sayilarini topla.
      const rootCounts = new Map<string, number>();
      for (const row of grouped) {
        const rootId = resolveRootId(row.categoryId);
        if (!rootId) continue;
        rootCounts.set(rootId, (rootCounts.get(rootId) || 0) + row._count._all);
      }

      const categories = Array.from(rootCounts.entries())
        .map(([id, count]) => ({ id, name: catById.get(id)?.name || '', count }))
        .filter((c) => c.name)
        .sort((a, b) => a.name.localeCompare(b.name, 'tr'));

      res.json({ categories });
    } catch (error) {
      next(error);
    }
  }
}

export default new CustomerController();


