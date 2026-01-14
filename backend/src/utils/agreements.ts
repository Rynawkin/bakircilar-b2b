export const isAgreementActive = (agreement: {
  validFrom: Date;
  validTo: Date | null;
}, now: Date) => {
  if (agreement.validFrom && agreement.validFrom > now) return false;
  if (agreement.validTo && agreement.validTo < now) return false;
  return true;
};

export const isAgreementApplicable = (agreement: {
  validFrom: Date;
  validTo: Date | null;
  minQuantity: number;
}, now: Date, quantity: number) => {
  if (!isAgreementActive(agreement, now)) return false;
  const minQty = Number(agreement.minQuantity) || 1;
  return quantity >= minQty;
};

type AgreementPrice = {
  priceInvoiced?: number | null;
  priceWhite?: number | null;
};

type PricePair = {
  invoiced: number;
  white: number;
};

const resolveAgreementWhite = (agreement?: AgreementPrice | null) => {
  const value = agreement?.priceWhite;
  return typeof value === 'number' && value > 0 ? value : null;
};

export const applyAgreementPrices = (
  basePrices: PricePair,
  agreement?: AgreementPrice | null
): PricePair => {
  if (!agreement) return basePrices;
  return {
    invoiced:
      typeof agreement.priceInvoiced === 'number' && agreement.priceInvoiced > 0
        ? agreement.priceInvoiced
        : basePrices.invoiced,
    white: resolveAgreementWhite(agreement) ?? basePrices.white,
  };
};

export const resolveAgreementPrice = (
  agreement: AgreementPrice | null | undefined,
  priceType: 'INVOICED' | 'WHITE',
  fallback: number
): number => {
  if (!agreement) return fallback;
  if (priceType === 'INVOICED') {
    return typeof agreement.priceInvoiced === 'number' && agreement.priceInvoiced > 0
      ? agreement.priceInvoiced
      : fallback;
  }
  return resolveAgreementWhite(agreement) ?? fallback;
};
