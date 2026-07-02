import { prisma } from '../utils/prisma';
import pricingService from './pricing.service';
import priceListService from './price-list.service';
import mikroService from './mikroFactory.service';
import { MikroCustomerSaleMovement, ProductPrices } from '../types';
import { resolveCustomerPriceLists, resolveCustomerPriceListsForProduct } from '../utils/customerPricing';
import { isAgreementApplicable, resolveAgreementPrice } from '../utils/agreements';
import { resolveLastPriceOverride } from '../utils/lastPrice';

export type CartPriceType = 'INVOICED' | 'WHITE';
export type CartPriceMode = 'LIST' | 'EXCESS';
type PriceVisibilityValue = 'INVOICED_ONLY' | 'WHITE_ONLY' | 'BOTH';

type PricePair = {
  invoiced: number;
  white: number;
};

type CartProductForPricing = {
  id: string;
  name?: string | null;
  mikroCode: string;
  brandCode?: string | null;
  categoryId?: string | null;
  currentCost?: number | null;
  lastEntryPrice?: number | null;
  excessStock?: number | null;
  excludeFromDiscount?: boolean | null;
  prices: unknown;
};

type ExistingCartItem = {
  id: string;
  cartId: string;
  productId: string;
  quantity: number;
  priceType: string;
  priceMode: string;
  unitPrice: number;
  lineNote?: string | null;
  createdAt?: Date;
  product?: CartProductForPricing;
};

type LineNotePatch = {
  itemId: string;
  value: string | null;
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

const getLastPriceGuardPrices = (
  priceStats: any,
  guardInvoicedListNo?: number | null,
  guardWhiteListNo?: number | null
): PricePair | undefined => {
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

export const isCartPriceTypeAllowed = (
  visibility: PriceVisibilityValue | null | undefined,
  priceType: CartPriceType
): boolean => {
  if (visibility === 'WHITE_ONLY') return priceType === 'WHITE';
  if (visibility === 'BOTH') return true;
  return priceType === 'INVOICED';
};

const selectPrice = (prices: PricePair, priceType: CartPriceType) =>
  priceType === 'INVOICED' ? prices.invoiced : prices.white;

const normalizeQuantity = (value: number) => {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return 0;
  return Math.max(0, Math.trunc(quantity));
};

export const loadCartCustomerContext = async (userId: string) => {
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
  if (!user || !customer || !customer.customerType) {
    throw new Error('User has no customer type');
  }

  const [settings, priceListRules] = await Promise.all([
    prisma.settings.findFirst({
      select: {
        customerPriceLists: true,
      },
    }),
    prisma.customerPriceListRule.findMany({
      where: { customerId: customer.id },
    }),
  ]);

  const basePriceListPair = resolveCustomerPriceLists(customer, settings);
  const effectiveVisibility: PriceVisibilityValue | null | undefined = user.parentCustomerId
    ? (customer.priceVisibility === 'WHITE_ONLY' ? 'WHITE_ONLY' : 'INVOICED_ONLY')
    : customer.priceVisibility;

  return {
    user,
    customer,
    settings,
    priceListRules,
    basePriceListPair,
    effectiveVisibility,
  };
};

export const resolveCartUnitPrices = async (params: {
  context: Awaited<ReturnType<typeof loadCartCustomerContext>>;
  product: CartProductForPricing;
  priceType: CartPriceType;
  totalQuantity: number;
}) => {
  const { context, product, priceType, totalQuantity } = params;
  const { customer, priceListRules, basePriceListPair, effectiveVisibility } = context;

  const productPrices = product.prices as ProductPrices;
  const customerPrices = pricingService.getPriceForCustomer(
    productPrices,
    customer.customerType as any
  );

  const priceStats = await priceListService.getPriceStats(product.mikroCode);
  const productPriceListPair = resolveCustomerPriceListsForProduct(
    basePriceListPair,
    priceListRules,
    {
      brandCode: product.brandCode,
      categoryId: product.categoryId,
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
  if (customer.useLastPrices && customer.mikroCariCode) {
    try {
      const sales = await mikroService.getCustomerSalesMovements(
        customer.mikroCariCode as string,
        [product.mikroCode],
        1
      );
      const lastSalesMap = buildLastSalesMap(sales);
      const lastPriceResult = resolveLastPriceOverride({
        config: customer,
        lastSalePrice: lastSalesMap.get(product.mikroCode),
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
      console.error('Customer last price failed while pricing cart', {
        customerId: customer.id,
        productCode: product.mikroCode,
        error,
      });
    }
  }

  let listUnitPrice = selectPrice(listPrices, priceType);
  let excessUnitPrice = selectPrice(customerPrices, priceType);

  const agreement = await prisma.customerPriceAgreement.findFirst({
    where: {
      customerId: customer.id,
      productId: product.id,
    },
    select: {
      priceInvoiced: true,
      priceWhite: true,
      minQuantity: true,
      validFrom: true,
      validTo: true,
    },
  });

  if (agreement && isAgreementApplicable(agreement, new Date(), totalQuantity)) {
    listUnitPrice = resolveAgreementPrice(agreement, priceType, listUnitPrice);
    excessUnitPrice = resolveAgreementPrice(agreement, priceType, excessUnitPrice);
  }

  // excludeFromDiscount: yonetici bu urunu indirime sokmamayi sectiyse fazla stok
  // olsa bile sepette/siparise DAIMA liste fiyati uygulanir (indirim kotasi 0).
  const excessQuantityLimit = product.excludeFromDiscount
    ? 0
    : Math.max(0, normalizeQuantity(Number(product.excessStock || 0)));
  const hasExcessDiscount =
    excessQuantityLimit > 0 &&
    Number.isFinite(listUnitPrice) &&
    Number.isFinite(excessUnitPrice) &&
    listUnitPrice > 0 &&
    excessUnitPrice > 0 &&
    excessUnitPrice < listUnitPrice;

  return {
    listUnitPrice,
    excessUnitPrice,
    excessQuantityLimit: hasExcessDiscount ? excessQuantityLimit : 0,
    hasExcessDiscount,
  };
};

export const rebalanceCartProductPriceType = async (params: {
  context: Awaited<ReturnType<typeof loadCartCustomerContext>>;
  cartId: string;
  productId: string;
  product?: CartProductForPricing | null;
  priceType: CartPriceType;
  totalQuantity: number;
  existingItems?: ExistingCartItem[];
  lineNotePatch?: LineNotePatch;
}) => {
  const {
    context,
    cartId,
    productId,
    priceType,
    lineNotePatch,
  } = params;
  const totalQuantity = normalizeQuantity(params.totalQuantity);
  const product =
    params.product ||
    await prisma.product.findUnique({
      where: { id: productId },
    });

  if (!product) {
    throw new Error('Product not found');
  }

  const existingItems =
    params.existingItems ||
    await prisma.cartItem.findMany({
      where: {
        cartId,
        productId,
        priceType,
      },
      orderBy: { createdAt: 'asc' },
    });

  const prices = await resolveCartUnitPrices({
    context,
    product,
    priceType,
    totalQuantity,
  });

  // Indirim kotasi urun bazindadir: BOTH gorunurluklu musteri faturali+beyaz satirlarla
  // limitin 2 katini indirimli alamasin diye diger fiyat tipine tahsis edilen EXCESS
  // miktari toplam kotadan dusulur (tahsis sirasi mevcut akisla ayni kalir).
  let excessQuantity = 0;
  if (prices.hasExcessDiscount) {
    const otherPriceType: CartPriceType = priceType === 'INVOICED' ? 'WHITE' : 'INVOICED';
    const otherTypeExcess = await prisma.cartItem.aggregate({
      where: {
        cartId,
        productId,
        priceType: otherPriceType,
        priceMode: 'EXCESS',
      },
      _sum: { quantity: true },
    });
    const otherAllocated = normalizeQuantity(Number(otherTypeExcess._sum.quantity || 0));
    const remainingLimit = Math.max(0, prices.excessQuantityLimit - otherAllocated);
    excessQuantity = Math.min(totalQuantity, remainingLimit);
  }
  const listQuantity = Math.max(0, totalQuantity - excessQuantity);
  const fallbackNote =
    lineNotePatch?.value ??
    existingItems.find((item) => item.lineNote && item.lineNote.trim())?.lineNote ??
    null;

  const syncMode = async (mode: CartPriceMode, quantity: number, unitPrice: number) => {
    const modeItems = existingItems.filter((item) => item.priceMode === mode);
    const keep = modeItems[0];
    const duplicateIds = modeItems.slice(1).map((item) => item.id);

    if (duplicateIds.length > 0) {
      await prisma.cartItem.deleteMany({ where: { id: { in: duplicateIds } } });
    }

    if (quantity <= 0) {
      if (keep) {
        await prisma.cartItem.delete({ where: { id: keep.id } });
      }
      return undefined;
    }

    const patchedNote =
      keep && lineNotePatch?.itemId === keep.id
        ? lineNotePatch.value
        : keep?.lineNote ?? fallbackNote;

    if (keep) {
      const updated = await prisma.cartItem.update({
        where: { id: keep.id },
        data: {
          quantity,
          unitPrice,
          lineNote: patchedNote || null,
        },
      });
      return updated.id;
    }

    const created = await prisma.cartItem.create({
      data: {
        cartId,
        productId,
        quantity,
        priceType,
        priceMode: mode,
        unitPrice,
        lineNote: fallbackNote || null,
      },
    });
    return created.id;
  };

  if (totalQuantity <= 0) {
    await prisma.cartItem.deleteMany({
      where: {
        cartId,
        productId,
        priceType,
      },
    });
    await prisma.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } }).catch(() => null);
    return {
      cartItemIds: [],
      excessQuantity: 0,
      listQuantity: 0,
      excessUnitPrice: prices.excessUnitPrice,
      listUnitPrice: prices.listUnitPrice,
    };
  }

  const excessItemId = await syncMode('EXCESS', excessQuantity, prices.excessUnitPrice);
  const listItemId = await syncMode('LIST', listQuantity, prices.listUnitPrice);
  await prisma.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } }).catch(() => null);

  return {
    cartItemIds: [excessItemId, listItemId].filter(Boolean) as string[],
    excessQuantity,
    listQuantity,
    excessUnitPrice: prices.excessUnitPrice,
    listUnitPrice: prices.listUnitPrice,
  };
};

export const syncCartDiscountAllocations = async (userId: string) => {
  const context = await loadCartCustomerContext(userId);
  const cart = await prisma.cart.findUnique({
    where: { userId: context.user.id },
    include: {
      items: {
        include: {
          product: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!cart || cart.items.length === 0) {
    return;
  }

  const groups = new Map<string, typeof cart.items>();
  cart.items.forEach((item) => {
    const priceType = item.priceType === 'WHITE' ? 'WHITE' : 'INVOICED';
    const key = `${item.productId}::${priceType}`;
    const current = groups.get(key) || [];
    current.push(item);
    groups.set(key, current);
  });

  for (const items of groups.values()) {
    const first = items[0];
    if (!first) continue;
    if (!first.product?.active || first.product?.hiddenFromCustomers) {
      continue;
    }
    const priceType: CartPriceType = first.priceType === 'WHITE' ? 'WHITE' : 'INVOICED';
    const hasDiscountSignal =
      Number(first.product?.excessStock || 0) > 0 ||
      items.some((item) => item.priceMode === 'EXCESS');
    if (!hasDiscountSignal) {
      continue;
    }

    if (!isCartPriceTypeAllowed(context.effectiveVisibility, priceType)) {
      continue;
    }

    try {
      await rebalanceCartProductPriceType({
        context,
        cartId: cart.id,
        productId: first.productId,
        product: first.product,
        priceType,
        totalQuantity: items.reduce((sum, item) => sum + normalizeQuantity(item.quantity), 0),
        existingItems: items,
      });
    } catch (error) {
      console.error('Cart discount allocation sync failed', {
        userId,
        productId: first.productId,
        priceType,
        error,
      });
    }
  }
};

export default {
  isCartPriceTypeAllowed,
  loadCartCustomerContext,
  resolveCartUnitPrices,
  rebalanceCartProductPriceType,
  syncCartDiscountAllocations,
};
