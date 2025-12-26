/**
 * Teklif numarasÄ± Ã¼retici
 * Format: TEK-2025-00001
 */
export const generateQuoteNumber = (lastQuoteNumber?: string): string => {
  const year = new Date().getFullYear();
  const prefix = `TEK-${year}-`;

  if (!lastQuoteNumber || !lastQuoteNumber.startsWith(prefix)) {
    return `${prefix}00001`;
  }

  const lastNumber = parseInt(lastQuoteNumber.split('-')[2], 10);
  const nextNumber = Number.isFinite(lastNumber) ? lastNumber + 1 : 1;

  return `${prefix}${nextNumber.toString().padStart(5, '0')}`;
};
