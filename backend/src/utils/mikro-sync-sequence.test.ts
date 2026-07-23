import assert from 'node:assert/strict';
import test from 'node:test';
import { runRequiredMikroSyncStages } from './mikro-sync-sequence';

test('required Mikro sync runs price only after full sync succeeds', async () => {
  const calls: string[] = [];
  const result = await runRequiredMikroSyncStages(
    async () => {
      calls.push('full');
      return { success: true as const };
    },
    async () => {
      calls.push('price');
      return { success: true as const };
    }
  );

  assert.equal(result.success, true);
  assert.deepEqual(calls, ['full', 'price']);
});

test('required Mikro sync does not run price after a failed full sync', async () => {
  let priceRan = false;
  const result = await runRequiredMikroSyncStages(
    async () => ({ success: false as const, error: 'full failed' }),
    async () => {
      priceRan = true;
      return { success: true as const };
    }
  );

  assert.equal(result.success, false);
  assert.equal(result.error, 'full failed');
  assert.equal(result.priceResult, null);
  assert.equal(priceRan, false);
});

test('required Mikro sync treats price failure as overall failure', async () => {
  const result = await runRequiredMikroSyncStages(
    async () => ({ success: true as const }),
    async () => ({ success: false as const, error: 'price failed' })
  );

  assert.equal(result.success, false);
  assert.equal(result.error, 'price failed');
  assert.equal(result.priceResult?.success, false);
});
