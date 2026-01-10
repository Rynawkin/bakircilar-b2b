export type PriceVisibility = 'INVOICED_ONLY' | 'WHITE_ONLY' | 'BOTH' | undefined;

export const getAllowedPriceTypes = (visibility: PriceVisibility): Array<'INVOICED' | 'WHITE'> => {
  if (visibility === 'WHITE_ONLY') return ['WHITE'];
  if (visibility === 'BOTH') return ['INVOICED', 'WHITE'];
  return ['INVOICED'];
};

export const getDefaultPriceType = (visibility: PriceVisibility): 'INVOICED' | 'WHITE' => {
  return visibility === 'WHITE_ONLY' ? 'WHITE' : 'INVOICED';
};

export const isPriceTypeAllowed = (
  visibility: PriceVisibility,
  priceType: 'INVOICED' | 'WHITE'
) => {
  if (visibility === 'WHITE_ONLY') return priceType === 'WHITE';
  if (visibility === 'BOTH') return true;
  return priceType === 'INVOICED';
};
