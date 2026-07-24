/**
 * Returns the collectible portion of a vade bucket for KPI aggregation.
 *
 * Stored row values stay authoritative and signed. A credit in one customer's
 * bucket must not reduce another customer's overdue receivable in headline
 * totals or make the KPI disagree with the positive-only aging distribution.
 */
export const collectibleVadeAmount = (value?: number | null) => {
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, numericValue);
};
