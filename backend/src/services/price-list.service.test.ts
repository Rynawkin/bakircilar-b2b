import test from 'node:test';
import assert from 'node:assert/strict';
import priceListService from './price-list.service';

test('normalized current prices expose non-contiguous tier six lists', () => {
  const stats = {
    currentPricesByList: new Map<number, number>([
      [13, 130],
      [14, 140],
    ]),
  };

  assert.equal(priceListService.getListPrice(stats, 13), 130);
  assert.equal(priceListService.getListPrice(stats, 14), 140);
});

test('tier six fallback follows registry plane and never crosses campaigns', () => {
  const stats = {
    currentPricesByList: new Map<number, number>([
      [10, 110],
      [5, 105],
      [11, 999],
      [12, 999],
    ]),
  };

  assert.equal(priceListService.getListPriceWithFallback(stats, 13), 110);
  assert.equal(priceListService.getListPriceWithFallback(stats, 14), 105);
  assert.equal(priceListService.getListPriceWithFallback(stats, 11), 999);
  assert.equal(priceListService.getListPriceWithFallback(stats, 999), 0);
});

test('legacy fixed columns remain readable during normalized migration', () => {
  assert.equal(
    priceListService.getListPriceWithFallback(
      { currentPriceList10: 88 },
      13,
      { min: 6, max: 10 }
    ),
    88
  );
});
