import { getPriceListDefinition } from '../config/price-list-registry';

export type MikroPriceListCosts = {
  costP: number | null;
  costT: number | null;
};

export type PriceListSnapshotMetrics = {
  currentCost: number | null;
  currentMargin: number | null;
};

export const parseOptionalMikroNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;

  const normalized =
    typeof value === 'string' ? value.trim().replace(',', '.') : value;
  if (normalized === '') return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Resolve the cost and margin stored in the normalized price-list snapshot.
 *
 * Retail lists use STOKLAR_USER.MaliyetT, invoiced lists use MaliyetP, and
 * campaign lists intentionally have no standard cost basis. This prevents a
 * single legacy Product.currentCost value from being attributed to both planes.
 */
export const resolvePriceListSnapshotMetrics = (
  listNo: number,
  currentPrice: number,
  costs: MikroPriceListCosts | null | undefined
): PriceListSnapshotMetrics => {
  const definition = getPriceListDefinition(listNo);

  let currentCost: number | null = null;
  if (definition?.costBasis === 'MALIYET_P') {
    currentCost = parseOptionalMikroNumber(costs?.costP);
  } else if (definition?.costBasis === 'MALIYET_T') {
    currentCost = parseOptionalMikroNumber(costs?.costT);
  }

  const price = Number(currentPrice);
  const currentMargin =
    Number.isFinite(price) && price > 0 && currentCost !== null && currentCost > 0
      ? ((price - currentCost) / price) * 100
      : null;

  return {
    currentCost,
    currentMargin:
      currentMargin !== null && Number.isFinite(currentMargin)
        ? currentMargin
        : null,
  };
};
