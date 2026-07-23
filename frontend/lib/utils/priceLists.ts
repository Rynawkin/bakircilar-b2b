export type StandardPriceListType = 'RETAIL' | 'INVOICED';
export type PriceTier = 1 | 2 | 3 | 4 | 5 | 6;

export type StandardPriceListDefinition = {
  listNo: number;
  tier: PriceTier;
  type: StandardPriceListType;
  label: string;
  shortLabel: string;
  marginNo: 1 | 2 | 3 | 4 | 5 | 6;
};

const createDefinition = (
  listNo: number,
  tier: StandardPriceListDefinition['tier'],
  type: StandardPriceListType
): StandardPriceListDefinition => ({
  listNo,
  tier,
  type,
  label: type === 'RETAIL' ? `Perakende Satış ${tier}` : `Faturalı Satış ${tier}`,
  shortLabel: type === 'RETAIL' ? `P${tier}` : `F${tier}`,
  marginNo: tier,
});

/**
 * Mikro fiziksel liste numaralari ile ticari fiyat seviyeleri ayni sey degildir.
 * Liste 11/12 kampanya listeleridir ve standart secicilere dahil edilmez.
 * Yeni seviye 6 listeleri sonradan eklenmistir: Faturali 6 = 13, Perakende 6 = 14.
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
export const CAMPAIGN_PRICE_LIST_NOS = [11, 12] as const;

export const getStandardPriceListDefinition = (listNo: number | null | undefined) =>
  STANDARD_PRICE_LISTS.find((definition) => definition.listNo === Number(listNo));

export const getStandardPriceListLabel = (
  listNo: number | null | undefined,
  fallback = '-'
) => {
  if (listNo === null || listNo === undefined) return fallback;
  return getStandardPriceListDefinition(listNo)?.label || `Liste ${listNo}`;
};

export const getPriceListDisplayLabel = (listNo: number | null | undefined) => {
  if (listNo === null || listNo === undefined) return '-';
  if (listNo === 11) return 'Kampanya Faturalı';
  if (listNo === 12) return 'Kampanya Perakende';
  return getStandardPriceListLabel(listNo);
};

export const getStandardPriceListShortLabel = (listNo: number) =>
  getStandardPriceListDefinition(listNo)?.shortLabel || `L${listNo}`;

export const isRetailPriceListNo = (listNo: number) =>
  RETAIL_PRICE_LISTS.some((definition) => definition.listNo === listNo);

export const isInvoicedPriceListNo = (listNo: number) =>
  INVOICED_PRICE_LISTS.some((definition) => definition.listNo === listNo);

export const isStandardPriceListNo = (listNo: number) =>
  STANDARD_PRICE_LISTS.some((definition) => definition.listNo === listNo);

export const getStandardPriceListsForPriceType = (
  priceType: 'INVOICED' | 'WHITE'
) => priceType === 'WHITE' ? RETAIL_PRICE_LISTS : INVOICED_PRICE_LISTS;

export const getStandardPriceListNosForPriceType = (
  priceType: 'INVOICED' | 'WHITE'
) => getStandardPriceListsForPriceType(priceType).map((definition) => definition.listNo);

export const getDefaultStandardPriceListNoForPriceType = (
  priceType: 'INVOICED' | 'WHITE'
) => priceType === 'WHITE' ? RETAIL_PRICE_LISTS[0].listNo : INVOICED_PRICE_LISTS[0].listNo;

export const isStandardPriceListNoForPriceType = (
  listNo: number | null | undefined,
  priceType: 'INVOICED' | 'WHITE'
) => {
  const definition = getStandardPriceListDefinition(listNo);
  if (!definition) return false;
  return definition.type === (priceType === 'WHITE' ? 'RETAIL' : 'INVOICED');
};

/**
 * Ayni ticari seviyeyi diger fiyat duzlemindeki fiziksel Mikro listesine tasir.
 * Ornegin Faturali 6 (13) <-> Perakende 6 (14).
 */
export const getPairedStandardPriceListNo = (
  listNo: number | null | undefined,
  priceType: 'INVOICED' | 'WHITE'
) => {
  const current = getStandardPriceListDefinition(listNo);
  if (!current) return null;
  const targetType: StandardPriceListType = priceType === 'WHITE' ? 'RETAIL' : 'INVOICED';
  return STANDARD_PRICE_LISTS.find(
    (definition) => definition.type === targetType && definition.tier === current.tier
  )?.listNo ?? null;
};

export type CustomerPriceListPair = {
  invoicedPriceListNo?: number | null;
  whitePriceListNo?: number | null;
};

/**
 * Bir satirin fiyat listesini secili duzleme guvenli bicimde cozer.
 *
 * Oncelik:
 * 1. Mevcut listenin ticari seviyesi (duzlem degisince tier korunur)
 * 2. Carinin hedef duzlemdeki atanmis listesi
 * 3. Carinin diger duzlemdeki listesinin ayni tier karsiligi
 * 4. Hedef duzlemin seviye 1 varsayilani
 */
export const resolveStandardPriceListNoForPriceType = ({
  priceType,
  currentListNo,
  customerPair,
}: {
  priceType: 'INVOICED' | 'WHITE';
  currentListNo?: number | null;
  customerPair?: CustomerPriceListPair | null;
}) => {
  const fromCurrent = getPairedStandardPriceListNo(currentListNo, priceType);
  if (fromCurrent !== null) return fromCurrent;

  const preferredCustomerListNo = priceType === 'WHITE'
    ? customerPair?.whitePriceListNo
    : customerPair?.invoicedPriceListNo;
  if (isStandardPriceListNoForPriceType(preferredCustomerListNo, priceType)) {
    return Number(preferredCustomerListNo);
  }

  const otherCustomerListNo = priceType === 'WHITE'
    ? customerPair?.invoicedPriceListNo
    : customerPair?.whitePriceListNo;
  const pairedCustomerListNo = getPairedStandardPriceListNo(otherCustomerListNo, priceType);
  if (pairedCustomerListNo !== null) return pairedCustomerListNo;

  return getDefaultStandardPriceListNoForPriceType(priceType);
};
