type PricePair = {
  invoiced: number;
  white: number;
};

type LastPriceConfig = {
  useLastPrices?: boolean | null;
  lastPriceGuardType?: 'COST' | 'PRICE_LIST' | null;
  lastPriceCostBasis?: 'CURRENT_COST' | 'LAST_ENTRY' | null;
  lastPriceMinCostPercent?: number | null;
};

type ProductCostInfo = {
  currentCost?: number | null;
  lastEntryPrice?: number | null;
};

export const resolveLastPriceOverride = (params: {
  config: LastPriceConfig;
  lastSalePrice?: number | null;
  listPrices: PricePair;
  product: ProductCostInfo;
  priceVisibility?: 'INVOICED_ONLY' | 'WHITE_ONLY' | 'BOTH' | null;
}): { prices: PricePair; usedLastPrice: boolean } => {
  const {
    config,
    lastSalePrice,
    listPrices,
    product,
    priceVisibility,
  } = params;

  const candidate = Number(lastSalePrice);
  if (!config.useLastPrices || !Number.isFinite(candidate) || candidate <= 0) {
    return { prices: listPrices, usedLastPrice: false };
  }

  const guardType = config.lastPriceGuardType || 'COST';
  if (guardType === 'PRICE_LIST') {
    const reference =
      priceVisibility === 'WHITE_ONLY' ? listPrices.white : listPrices.invoiced;
    if (Number.isFinite(reference) && reference > 0 && candidate < reference) {
      return { prices: listPrices, usedLastPrice: false };
    }
  } else {
    const basis = config.lastPriceCostBasis || 'CURRENT_COST';
    const costValue =
      basis === 'LAST_ENTRY' ? product.lastEntryPrice : product.currentCost;
    const costNumber = Number(costValue);
    const minPercent = Number(config.lastPriceMinCostPercent ?? 10);
    if (Number.isFinite(costNumber) && costNumber > 0) {
      const minAllowed = costNumber * (1 - minPercent / 100);
      if (candidate < minAllowed) {
        return { prices: listPrices, usedLastPrice: false };
      }
    }
  }

  return {
    prices: { invoiced: candidate, white: candidate },
    usedLastPrice: true,
  };
};
