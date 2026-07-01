/**
 * Musteri urun payload yardimcilari (paylasilan).
 *
 * customer.controller.ts icindeki loadCustomerContext + buildCustomerProductPayloads
 * kaliplariyla BIREBIR ayni mantik; koleksiyon gibi diger servislerin de musteri-fiyatli
 * urun listesi uretebilmesi icin buraya cikarilmis re-usable surumleridir.
 * Controller'daki mevcut ozel surumler DEGISTIRILMEDI (additive).
 */
import { prisma } from './prisma';
import pricingService from '../services/pricing.service';
import priceListService from '../services/price-list.service';
import mikroService from '../services/mikroFactory.service';
import { MikroCustomerSaleMovement, ProductPrices } from '../types';
import { resolveCustomerPriceLists, resolveCustomerPriceListsForProduct } from './customerPricing';
import { applyAgreementPrices, isAgreementActive } from './agreements';
import { resolveLastPriceOverride } from './lastPrice';

type PriceVisibilityValue = 'INVOICED_ONLY' | 'WHITE_ONLY' | 'BOTH';

const getLastPriceGuardPrices = (
  priceStats: any,
  guardInvoicedListNo?: number | null,
  guardWhiteListNo?: number | null
): { invoiced: number; white: number } | undefined => {
  if (!guardInvoicedListNo && !guardWhiteListNo) return undefined;
  return {
    invoiced: guardInvoicedListNo ? priceListService.getListPrice(priceStats, guardInvoicedListNo) : 0,
    white: guardWhiteListNo ? priceListService.getListPrice(priceStats, guardWhiteListNo) : 0,
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

export const loadCustomerContext = async (userId: string) => {
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

export const buildCustomerProductPayloads = async (params: {
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
