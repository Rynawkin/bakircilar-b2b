import assert from 'node:assert/strict';
import test from 'node:test';

import { applyLastPriceFloor } from './lastPrice';

const guardedCustomer = {
  useLastPrices: true,
  lastPriceGuardType: 'COST' as const,
  lastPriceCostBasis: 'CURRENT_COST' as const,
  lastPriceMinCostPercent: 10,
};

test('excess discount cannot fall below an eligible last sale price', () => {
  const prices = applyLastPriceFloor({
    config: guardedCustomer,
    lastSalePrice: 100,
    basePrices: { invoiced: 90, white: 90 },
    product: { currentCost: 50 },
  });

  assert.deepEqual(prices, { invoiced: 100, white: 100 });
});

test('a higher excess price is preserved when it is above the last sale floor', () => {
  const prices = applyLastPriceFloor({
    config: guardedCustomer,
    lastSalePrice: 100,
    basePrices: { invoiced: 110, white: 110 },
    product: { currentCost: 50 },
  });

  assert.deepEqual(prices, { invoiced: 110, white: 110 });
});

test('last sale floor stays disabled for customers without last-price pricing', () => {
  const prices = applyLastPriceFloor({
    config: { ...guardedCustomer, useLastPrices: false },
    lastSalePrice: 100,
    basePrices: { invoiced: 90, white: 90 },
    product: { currentCost: 50 },
  });

  assert.deepEqual(prices, { invoiced: 90, white: 90 });
});
