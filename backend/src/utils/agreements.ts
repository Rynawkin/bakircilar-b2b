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
