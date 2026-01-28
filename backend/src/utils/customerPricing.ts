import { CustomerPriceListConfig, PriceListPair } from '../types';

export type CustomerPriceListRule = {
  brandCode?: string | null;
  categoryId?: string | null;
  invoicedPriceListNo: number;
  whitePriceListNo: number;
};

const DEFAULT_PRICE_LISTS: CustomerPriceListConfig = {
  BAYI: { invoiced: 6, white: 1 },
  PERAKENDE: { invoiced: 6, white: 1 },
  VIP: { invoiced: 6, white: 1 },
  OZEL: { invoiced: 6, white: 1 },
};

const resolvePair = (value: any, fallback: PriceListPair): PriceListPair => {
  const invoiced = Number(value?.invoiced);
  const white = Number(value?.white);
  return {
    invoiced: Number.isFinite(invoiced) ? invoiced : fallback.invoiced,
    white: Number.isFinite(white) ? white : fallback.white,
  };
};

const normalizePriceListConfig = (raw: any): CustomerPriceListConfig => {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_PRICE_LISTS;
  }

  return {
    BAYI: resolvePair(raw.BAYI, DEFAULT_PRICE_LISTS.BAYI),
    PERAKENDE: resolvePair(raw.PERAKENDE, DEFAULT_PRICE_LISTS.PERAKENDE),
    VIP: resolvePair(raw.VIP, DEFAULT_PRICE_LISTS.VIP),
    OZEL: resolvePair(raw.OZEL, DEFAULT_PRICE_LISTS.OZEL),
  };
};

const resolveListNo = (value: any, fallback: number, min: number, max: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min || parsed > max) return fallback;
  return parsed;
};

export const resolveCustomerPriceLists = (
  user: {
    customerType?: string | null;
    invoicedPriceListNo?: number | null;
    whitePriceListNo?: number | null;
  },
  settings: { customerPriceLists?: any } | null
): PriceListPair => {
  const config = normalizePriceListConfig(settings?.customerPriceLists);
  const normalizedType =
    typeof user.customerType === 'string' ? user.customerType.trim().toUpperCase() : 'BAYI';
  const base =
    normalizedType === 'PERAKENDE'
      ? config.PERAKENDE
      : normalizedType === 'VIP'
        ? config.VIP
        : normalizedType === 'OZEL'
          ? config.OZEL
          : config.BAYI;

  return {
    invoiced: resolveListNo(user.invoicedPriceListNo, base.invoiced, 6, 10),
    white: resolveListNo(user.whitePriceListNo, base.white, 1, 5),
  };
};

const normalizeCode = (value?: string | null) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || null;
};

export const resolveCustomerPriceListsForProduct = (
  base: PriceListPair,
  rules: CustomerPriceListRule[] | null | undefined,
  product: { brandCode?: string | null; categoryId?: string | null }
): PriceListPair => {
  if (!rules || rules.length === 0) return base;

  const brandCode = normalizeCode(product.brandCode);
  const categoryId = product.categoryId || null;

  const matchesBrand = (ruleBrand?: string | null) =>
    Boolean(brandCode && ruleBrand && normalizeCode(ruleBrand) === brandCode);
  const matchesCategory = (ruleCategory?: string | null) =>
    Boolean(categoryId && ruleCategory === categoryId);

  const findRule = (predicate: (rule: CustomerPriceListRule) => boolean) =>
    rules.find((rule) => predicate(rule)) || null;

  const bestRule =
    findRule((rule) => matchesBrand(rule.brandCode) && matchesCategory(rule.categoryId)) ||
    findRule((rule) => matchesBrand(rule.brandCode) && !rule.categoryId) ||
    findRule((rule) => matchesCategory(rule.categoryId) && !rule.brandCode);

  if (!bestRule) return base;

  return {
    invoiced: resolveListNo(bestRule.invoicedPriceListNo, base.invoiced, 6, 10),
    white: resolveListNo(bestRule.whitePriceListNo, base.white, 1, 5),
  };
};
