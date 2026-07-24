import assert from 'node:assert/strict';
import test from 'node:test';
import { collectibleVadeAmount } from './vade-balance';

test('collectibleVadeAmount keeps positive receivables', () => {
  assert.equal(collectibleVadeAmount(1250.75), 1250.75);
});

test('collectibleVadeAmount does not let credit balances reduce overdue KPIs', () => {
  assert.equal(collectibleVadeAmount(-300), 0);
  assert.equal(
    collectibleVadeAmount(1000) + collectibleVadeAmount(-300),
    1000,
  );
});

test('collectibleVadeAmount safely handles empty and non-finite values', () => {
  assert.equal(collectibleVadeAmount(null), 0);
  assert.equal(collectibleVadeAmount(Number.NaN), 0);
  assert.equal(collectibleVadeAmount(Number.POSITIVE_INFINITY), 0);
});
