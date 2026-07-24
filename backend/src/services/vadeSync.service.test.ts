import test from 'node:test';
import assert from 'node:assert/strict';
import { MIKRO_VADE_QUERY, resolveMikroVadeAmounts } from './vadeSync.service';

test('Mikro vade query uses the oldest overdue date', () => {
  assert.match(
    MIKRO_VADE_QUERY,
    /MIN\(CASE WHEN vt\.vade_tarihi < CAST\(GETDATE\(\) AS DATE\) THEN vt\.vade_tarihi END\) AS pastDueDate/,
  );
  assert.doesNotMatch(
    MIKRO_VADE_QUERY,
    /MAX\(CASE WHEN vt\.vade_tarihi < CAST\(GETDATE\(\) AS DATE\) THEN vt\.vade_tarihi END\) AS pastDueDate/,
  );
});

test('Mikro vade amounts keep overdue and not-due buckets canonical', () => {
  assert.deepEqual(resolveMikroVadeAmounts(1000, -300), {
    pastDueBalance: 1000,
    notDueBalance: -300,
    totalBalance: 700,
  });
  assert.deepEqual(resolveMikroVadeAmounts(-100, 300), {
    pastDueBalance: -100,
    notDueBalance: 300,
    totalBalance: 200,
  });
});
