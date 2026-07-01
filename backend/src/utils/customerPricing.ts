import { PriceListPair } from '../types';

export type CustomerPriceListRule = {
  brandCode?: string | null;
  categoryId?: string | null;
  invoicedPriceListNo: number;
  whitePriceListNo: number;
};

// SEGMENT DEVRE DISI (2026-07): Musteri tipi (BAYI/PERAKENDE/VIP/OZEL) artik fiyat
// listesini belirlemez. Musteri-bazli atama (invoicedPriceListNo/whitePriceListNo)
// yoksa TEK varsayilan kullanilir: faturali = Toptan Satis 1 (ic liste 6),
// beyaz = Perakende Satis 1 (ic liste 1). settings.customerPriceLists artik okunmaz.
const SINGLE_DEFAULT_PRICE_LIST: PriceListPair = { invoiced: 6, white: 1 };

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
  // Imza korunur (cagiranlar settings gecirir) ama artik OKUNMAZ; segment devre disi.
  _settings?: { customerPriceLists?: any } | null
): PriceListPair => {
  return {
    invoiced: resolveListNo(user.invoicedPriceListNo, SINGLE_DEFAULT_PRICE_LIST.invoiced, 6, 10),
    white: resolveListNo(user.whitePriceListNo, SINGLE_DEFAULT_PRICE_LIST.white, 1, 5),
  };
};

const normalizeCode = (value?: string | null) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return null;
  return trimmed.toUpperCase();
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
