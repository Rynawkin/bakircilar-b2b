import { CustomerPriceListConfig, PriceListPair } from '../types';

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
  const customerType = (user.customerType || 'BAYI') as keyof CustomerPriceListConfig;
  const base = config[customerType] || DEFAULT_PRICE_LISTS.BAYI;

  return {
    invoiced: resolveListNo(user.invoicedPriceListNo, base.invoiced, 6, 10),
    white: resolveListNo(user.whitePriceListNo, base.white, 1, 5),
  };
};
