import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPAIGN_PRICE_LIST_NOS,
  getPriceListDefinition,
  getPriceListFallbackChain,
  getPriceListLabel,
  INVOICED_PRICE_LIST_NOS,
  isPriceListInPlane,
  isStandardPriceListNo,
  RETAIL_PRICE_LIST_NOS,
  STANDARD_PRICE_LIST_NOS,
} from './price-list-registry';

test('registry keeps campaign lists separate from the twelve standard lists', () => {
  assert.deepEqual([...STANDARD_PRICE_LIST_NOS], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14]);
  assert.deepEqual([...CAMPAIGN_PRICE_LIST_NOS], [11, 12]);
  assert.deepEqual([...INVOICED_PRICE_LIST_NOS], [6, 7, 8, 9, 10, 13]);
  assert.deepEqual([...RETAIL_PRICE_LIST_NOS], [1, 2, 3, 4, 5, 14]);

  assert.equal(isStandardPriceListNo(11), false);
  assert.equal(isStandardPriceListNo(12), false);
  assert.equal(isPriceListInPlane(11, 'INVOICED'), false);
  assert.equal(isPriceListInPlane(11, 'INVOICED', { includeCampaign: true }), true);
});

test('Faturali 6 and Perakende 6 have explicit physical mappings', () => {
  assert.deepEqual(getPriceListDefinition(13), {
    listNo: 13,
    kind: 'STANDARD',
    plane: 'INVOICED',
    tier: 6,
    label: 'Faturalı 6',
    costBasis: 'MALIYET_P',
    marginSlot: 6,
    fallbackListNo: 10,
  });
  assert.deepEqual(getPriceListDefinition(14), {
    listNo: 14,
    kind: 'STANDARD',
    plane: 'RETAIL',
    tier: 6,
    label: 'Perakende 6',
    costBasis: 'MALIYET_T',
    marginSlot: 6,
    fallbackListNo: 5,
  });
  assert.equal(getPriceListLabel(13), 'Faturalı 6');
  assert.equal(getPriceListLabel(14), 'Perakende 6');
});

test('fallback chains stay inside the correct plane', () => {
  assert.deepEqual(getPriceListFallbackChain(13), [10, 9, 8, 7, 6]);
  assert.deepEqual(getPriceListFallbackChain(14), [5, 4, 3, 2, 1]);
  assert.deepEqual(getPriceListFallbackChain(11), []);
  assert.deepEqual(getPriceListFallbackChain(999), []);
});
