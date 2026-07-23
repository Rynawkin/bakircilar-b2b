export type StandardPriceListType = 'RETAIL' | 'INVOICED';
export type PriceTier = 1 | 2 | 3 | 4 | 5 | 6;

export type StandardPriceListDefinition = {
  listNo: number;
  tier: PriceTier;
  type: StandardPriceListType;
  label: string;
  shortLabel: string;
};

const createDefinition = (
  listNo: number,
  tier: PriceTier,
  type: StandardPriceListType
): StandardPriceListDefinition => ({
  listNo,
  tier,
  type,
  label: type === 'RETAIL' ? `Perakende Satis ${tier}` : `Faturali Satis ${tier}`,
  shortLabel: type === 'RETAIL' ? `P${tier}` : `F${tier}`,
});

/**
 * Liste 11/12 kampanya listeleridir. Standart fiyat secicileri yalnizca bu
 * tanimlari kullanir; Faturali 6 fiziksel 13, Perakende 6 fiziksel 14'tur.
 */
export const RETAIL_PRICE_LISTS: readonly StandardPriceListDefinition[] = [
  createDefinition(1, 1, 'RETAIL'),
  createDefinition(2, 2, 'RETAIL'),
  createDefinition(3, 3, 'RETAIL'),
  createDefinition(4, 4, 'RETAIL'),
  createDefinition(5, 5, 'RETAIL'),
  createDefinition(14, 6, 'RETAIL'),
];

export const INVOICED_PRICE_LISTS: readonly StandardPriceListDefinition[] = [
  createDefinition(6, 1, 'INVOICED'),
  createDefinition(7, 2, 'INVOICED'),
  createDefinition(8, 3, 'INVOICED'),
  createDefinition(9, 4, 'INVOICED'),
  createDefinition(10, 5, 'INVOICED'),
  createDefinition(13, 6, 'INVOICED'),
];

export const STANDARD_PRICE_LISTS: readonly StandardPriceListDefinition[] = [
  ...RETAIL_PRICE_LISTS,
  ...INVOICED_PRICE_LISTS,
];

export const STANDARD_PRICE_LIST_NOS = STANDARD_PRICE_LISTS.map((definition) => definition.listNo);
export const RETAIL_PRICE_LEVELS = RETAIL_PRICE_LISTS.map((definition) => definition.tier);

export const getStandardPriceListDefinition = (listNo: number | null | undefined) =>
  STANDARD_PRICE_LISTS.find((definition) => definition.listNo === Number(listNo));

export const getStandardPriceListLabel = (listNo: number) =>
  getStandardPriceListDefinition(listNo)?.label || `Liste ${listNo}`;

export const getPriceListDisplayLabel = (listNo: number) => {
  if (listNo === 11) return 'Kampanya Faturali';
  if (listNo === 12) return 'Kampanya Perakende';
  return getStandardPriceListLabel(listNo);
};

export const getStandardPriceListShortLabel = (listNo: number) =>
  getStandardPriceListDefinition(listNo)?.shortLabel || `L${listNo}`;

export const getStandardPriceListsForPriceType = (
  priceType: 'INVOICED' | 'WHITE'
) => priceType === 'WHITE' ? RETAIL_PRICE_LISTS : INVOICED_PRICE_LISTS;

export const getStandardPriceListNosForPriceType = (
  priceType: 'INVOICED' | 'WHITE'
) => getStandardPriceListsForPriceType(priceType).map((definition) => definition.listNo);
