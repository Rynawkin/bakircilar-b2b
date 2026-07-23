import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOptionalMikroNumber,
  resolvePriceListSnapshotMetrics,
} from './price-list-snapshot';

const costs = { costP: 80, costT: 90 };

test('normalized retail snapshots use MaliyetT, including physical list 14', () => {
  assert.deepEqual(resolvePriceListSnapshotMetrics(1, 120, costs), {
    currentCost: 90,
    currentMargin: 25,
  });
  assert.deepEqual(resolvePriceListSnapshotMetrics(14, 120, costs), {
    currentCost: 90,
    currentMargin: 25,
  });
});

test('normalized invoiced snapshots use MaliyetP, including physical list 13', () => {
  assert.deepEqual(resolvePriceListSnapshotMetrics(6, 100, costs), {
    currentCost: 80,
    currentMargin: 20,
  });
  assert.deepEqual(resolvePriceListSnapshotMetrics(13, 100, costs), {
    currentCost: 80,
    currentMargin: 20,
  });
});

test('campaign snapshots never claim a standard cost or margin', () => {
  assert.deepEqual(resolvePriceListSnapshotMetrics(11, 100, costs), {
    currentCost: null,
    currentMargin: null,
  });
  assert.deepEqual(resolvePriceListSnapshotMetrics(12, 100, costs), {
    currentCost: null,
    currentMargin: null,
  });
});

test('missing or invalid Mikro costs remain null instead of using a legacy cost', () => {
  assert.deepEqual(
    resolvePriceListSnapshotMetrics(13, 100, { costP: null, costT: 90 }),
    { currentCost: null, currentMargin: null }
  );
  assert.equal(parseOptionalMikroNumber(''), null);
  assert.equal(parseOptionalMikroNumber('not-a-number'), null);
  assert.equal(parseOptionalMikroNumber('80,5'), 80.5);
});
