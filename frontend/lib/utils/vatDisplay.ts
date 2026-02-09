export type VatDisplayPreference = 'WITH_VAT' | 'WITHOUT_VAT';

export const resolveVatDisplayPreference = (
  value?: string | null
): VatDisplayPreference => (value === 'WITH_VAT' ? 'WITH_VAT' : 'WITHOUT_VAT');

export const getDisplayPrice = (
  price: number,
  vatRate: number | null | undefined,
  priceType: 'INVOICED' | 'WHITE',
  preference?: string | null
): number => {
  const base = Number(price) || 0;
  if (priceType !== 'INVOICED') return base;
  const pref = resolveVatDisplayPreference(preference);
  if (pref === 'WITHOUT_VAT') return base;
  const rate = Number(vatRate) || 0;
  return base * (1 + rate);
};

export const getVatLabel = (
  priceType: 'INVOICED' | 'WHITE',
  preference?: string | null
): string => {
  if (priceType === 'WHITE') return 'Ozel';
  return resolveVatDisplayPreference(preference) === 'WITH_VAT' ? 'KDV Dahil' : '+KDV';
};

export const getVatStatusLabel = (preference?: string | null): string =>
  resolveVatDisplayPreference(preference) === 'WITH_VAT' ? 'KDV Dahil' : 'KDV Haric';
