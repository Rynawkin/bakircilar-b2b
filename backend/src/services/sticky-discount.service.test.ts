import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCanonicalPriceRows } from './sticky-discount.service';

test('sticky-discount snapshot keeps deterministic selected rows and reports duplicates', () => {
  const snapshot = normalizeCanonicalPriceRows([
    {
      productCode: ' b104594 ',
      listNo: 1,
      price: 125,
      candidateCount: 2,
    },
    {
      productCode: 'B104594',
      listNo: 13,
      price: 110,
      candidateCount: 1,
    },
    {
      productCode: 'B110693',
      listNo: 14,
      price: 0,
      candidateCount: 2,
    },
  ]);

  assert.equal(snapshot.prices.get('B104594')?.get(1), 125);
  assert.equal(snapshot.prices.get('B104594')?.get(13), 110);
  assert.equal(snapshot.prices.has('B110693'), false);
  assert.deepEqual(snapshot.duplicateProducts, ['B104594', 'B110693']);
  assert.deepEqual(snapshot.duplicatePairs, ['B104594/L1', 'B110693/L14']);
});

test('sticky-discount snapshot excludes campaign and unknown list numbers', () => {
  const snapshot = normalizeCanonicalPriceRows([
    { productCode: 'B1', listNo: 11, price: 999, candidateCount: 1 },
    { productCode: 'B1', listNo: 12, price: 999, candidateCount: 1 },
    { productCode: 'B1', listNo: 999, price: 999, candidateCount: 1 },
  ]);

  assert.equal(snapshot.prices.size, 0);
  assert.deepEqual(snapshot.duplicatePairs, []);
});
