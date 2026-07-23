/**
 * Mikro physical price-list registry.
 *
 * Business tiers are not contiguous in Mikro:
 * - Retail 1..5: physical lists 1..5
 * - Invoiced 1..5: physical lists 6..10
 * - Campaign lists: physical lists 11/12 (must keep their historical meaning)
 * - Invoiced 6: physical list 13
 * - Retail 6: physical list 14
 *
 * Never infer a plane or tier with numeric ranges. Always use this registry.
 */

export type PriceListKind = 'STANDARD' | 'CAMPAIGN';
export type PriceListPlane = 'RETAIL' | 'INVOICED';
export type PriceListCostBasis = 'MALIYET_T' | 'MALIYET_P';

export type PriceListDefinition = {
  /** Mikro STOK_SATIS_FIYAT_LISTELERI.sfiyat_listesirano. */
  listNo: number;
  kind: PriceListKind;
  plane: PriceListPlane;
  /** Commercial tier within its plane. Campaign lists do not have a tier. */
  tier: number | null;
  label: string;
  costBasis: PriceListCostBasis | null;
  /** Mikro STOKLAR_USER.Marj_N slot. Campaign lists do not use a standard slot. */
  marginSlot: number | null;
  /** Next safer standard list when this list has no positive current price. */
  fallbackListNo: number | null;
};

export const PRICE_LIST_DEFINITIONS = [
  { listNo: 1, kind: 'STANDARD', plane: 'RETAIL', tier: 1, label: 'Perakende 1', costBasis: 'MALIYET_T', marginSlot: 1, fallbackListNo: null },
  { listNo: 2, kind: 'STANDARD', plane: 'RETAIL', tier: 2, label: 'Perakende 2', costBasis: 'MALIYET_T', marginSlot: 2, fallbackListNo: 1 },
  { listNo: 3, kind: 'STANDARD', plane: 'RETAIL', tier: 3, label: 'Perakende 3', costBasis: 'MALIYET_T', marginSlot: 3, fallbackListNo: 2 },
  { listNo: 4, kind: 'STANDARD', plane: 'RETAIL', tier: 4, label: 'Perakende 4', costBasis: 'MALIYET_T', marginSlot: 4, fallbackListNo: 3 },
  { listNo: 5, kind: 'STANDARD', plane: 'RETAIL', tier: 5, label: 'Perakende 5', costBasis: 'MALIYET_T', marginSlot: 5, fallbackListNo: 4 },
  { listNo: 6, kind: 'STANDARD', plane: 'INVOICED', tier: 1, label: 'Faturalı 1', costBasis: 'MALIYET_P', marginSlot: 1, fallbackListNo: null },
  { listNo: 7, kind: 'STANDARD', plane: 'INVOICED', tier: 2, label: 'Faturalı 2', costBasis: 'MALIYET_P', marginSlot: 2, fallbackListNo: 6 },
  { listNo: 8, kind: 'STANDARD', plane: 'INVOICED', tier: 3, label: 'Faturalı 3', costBasis: 'MALIYET_P', marginSlot: 3, fallbackListNo: 7 },
  { listNo: 9, kind: 'STANDARD', plane: 'INVOICED', tier: 4, label: 'Faturalı 4', costBasis: 'MALIYET_P', marginSlot: 4, fallbackListNo: 8 },
  { listNo: 10, kind: 'STANDARD', plane: 'INVOICED', tier: 5, label: 'Faturalı 5', costBasis: 'MALIYET_P', marginSlot: 5, fallbackListNo: 9 },
  { listNo: 11, kind: 'CAMPAIGN', plane: 'INVOICED', tier: null, label: 'Kampanya Satış Fiyatı Faturalı', costBasis: null, marginSlot: null, fallbackListNo: null },
  { listNo: 12, kind: 'CAMPAIGN', plane: 'RETAIL', tier: null, label: 'Kampanya Satış Fiyatı Perakende', costBasis: null, marginSlot: null, fallbackListNo: null },
  { listNo: 13, kind: 'STANDARD', plane: 'INVOICED', tier: 6, label: 'Faturalı 6', costBasis: 'MALIYET_P', marginSlot: 6, fallbackListNo: 10 },
  { listNo: 14, kind: 'STANDARD', plane: 'RETAIL', tier: 6, label: 'Perakende 6', costBasis: 'MALIYET_T', marginSlot: 6, fallbackListNo: 5 },
] as const satisfies readonly PriceListDefinition[];

const DEFINITIONS_BY_LIST_NO = new Map<number, PriceListDefinition>(
  PRICE_LIST_DEFINITIONS.map((definition) => [definition.listNo, definition])
);

export const STANDARD_PRICE_LIST_DEFINITIONS = PRICE_LIST_DEFINITIONS.filter(
  (definition) => definition.kind === 'STANDARD'
);

export const CAMPAIGN_PRICE_LIST_DEFINITIONS = PRICE_LIST_DEFINITIONS.filter(
  (definition) => definition.kind === 'CAMPAIGN'
);

/** Existing fixed PostgreSQL snapshot columns. */
export const LEGACY_STANDARD_PRICE_LIST_NOS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** Standard customer-facing physical lists; campaign 11/12 are deliberately excluded. */
export const STANDARD_PRICE_LIST_NOS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14] as const;
export const RETAIL_PRICE_LIST_NOS = [1, 2, 3, 4, 5, 14] as const;
export const INVOICED_PRICE_LIST_NOS = [6, 7, 8, 9, 10, 13] as const;
export const CAMPAIGN_PRICE_LIST_NOS = [11, 12] as const;

/** All lists whose current values are mirrored by priceSync. */
export const SYNC_PRICE_LIST_NOS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

export const getPriceListDefinition = (
  listNo: number | null | undefined
): PriceListDefinition | null => {
  if (!Number.isInteger(listNo)) return null;
  return DEFINITIONS_BY_LIST_NO.get(Number(listNo)) ?? null;
};

export const getPriceListLabel = (listNo: number | null | undefined): string | null =>
  getPriceListDefinition(listNo)?.label ?? null;

export const isKnownPriceListNo = (listNo: number | null | undefined): boolean =>
  getPriceListDefinition(listNo) !== null;

export const isStandardPriceListNo = (listNo: number | null | undefined): boolean =>
  getPriceListDefinition(listNo)?.kind === 'STANDARD';

export const isPriceListInPlane = (
  listNo: number | null | undefined,
  plane: PriceListPlane,
  options: { includeCampaign?: boolean } = {}
): boolean => {
  const definition = getPriceListDefinition(listNo);
  if (!definition || definition.plane !== plane) return false;
  return options.includeCampaign === true || definition.kind === 'STANDARD';
};

/**
 * Returns fallback physical list numbers, excluding the requested list itself.
 * The registry is validated against cycles defensively so a bad future entry
 * cannot cause an infinite pricing loop.
 */
export const getPriceListFallbackChain = (
  listNo: number | null | undefined
): number[] => {
  const definition = getPriceListDefinition(listNo);
  if (!definition || definition.kind !== 'STANDARD') return [];

  const chain: number[] = [];
  const visited = new Set<number>([definition.listNo]);
  let next = definition.fallbackListNo;

  while (next !== null && !visited.has(next)) {
    const nextDefinition = getPriceListDefinition(next);
    if (
      !nextDefinition ||
      nextDefinition.kind !== 'STANDARD' ||
      nextDefinition.plane !== definition.plane
    ) {
      break;
    }
    chain.push(next);
    visited.add(next);
    next = nextDefinition.fallbackListNo;
  }

  return chain;
};
