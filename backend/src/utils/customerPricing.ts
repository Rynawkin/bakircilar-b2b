import { PriceListPair } from '../types';
import { isPriceListInPlane, PriceListPlane } from '../config/price-list-registry';

export type CustomerPriceListRule = {
  brandCode?: string | null;
  categoryId?: string | null;
  invoicedPriceListNo: number;
  whitePriceListNo: number;
};

export type CustomerPriceType = 'INVOICED' | 'WHITE';

// SEGMENT DEVRE DISI (2026-07): Musteri tipi (BAYI/PERAKENDE/VIP/OZEL) artik fiyat
// listesini belirlemez. Musteri-bazli atama (invoicedPriceListNo/whitePriceListNo)
// yoksa TEK varsayilan kullanilir: faturali = Toptan Satis 1 (ic liste 6),
// beyaz = Perakende Satis 1 (ic liste 1). settings.customerPriceLists artik okunmaz.
const SINGLE_DEFAULT_PRICE_LIST: PriceListPair = { invoiced: 6, white: 1 };

const resolveListNo = (
  value: any,
  fallback: number,
  plane: PriceListPlane
): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  if (!isPriceListInPlane(parsed, plane)) return fallback;
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
    invoiced: resolveListNo(
      user.invoicedPriceListNo,
      SINGLE_DEFAULT_PRICE_LIST.invoiced,
      'INVOICED'
    ),
    white: resolveListNo(
      user.whitePriceListNo,
      SINGLE_DEFAULT_PRICE_LIST.white,
      'RETAIL'
    ),
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
    invoiced: resolveListNo(bestRule.invoicedPriceListNo, base.invoiced, 'INVOICED'),
    white: resolveListNo(bestRule.whitePriceListNo, base.white, 'RETAIL'),
  };
};

/**
 * Selects the Mikro physical standard list for an order line.
 *
 * Price overrides (agreement, last-sale floor/override or excess-stock pricing)
 * can change the amount, but they must not erase the standard price-list plane
 * that the customer/product assignment selected for the line.
 */
export const resolvePhysicalPriceListNoForPriceType = (
  pair: PriceListPair,
  priceType: CustomerPriceType
): number => {
  const plane: PriceListPlane = priceType === 'WHITE' ? 'RETAIL' : 'INVOICED';
  const listNo = priceType === 'WHITE' ? pair.white : pair.invoiced;

  if (!isPriceListInPlane(listNo, plane)) {
    throw new Error(`Invalid ${priceType} physical price list: ${String(listNo)}`);
  }

  return listNo;
};
