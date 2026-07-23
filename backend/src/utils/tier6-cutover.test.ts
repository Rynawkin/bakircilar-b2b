import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTier6Cutover } from './tier6-cutover';

test('tier6 cutover separates the real instant from Mikro wall-clock time', () => {
  const parsed = parseTier6Cutover('2026-07-23T14:30:00.125+03:00');

  assert.equal(parsed.instant.toISOString(), '2026-07-23T11:30:00.125Z');
  assert.equal(parsed.mikroWallClock.toISOString(), '2026-07-23T14:30:00.125Z');
});

test('tier6 cutover requires an explicit offset', () => {
  assert.throws(
    () => parseTier6Cutover('2026-07-23T14:30:00Z'),
    /UTC offset/
  );
});

test('tier6 cutover rejects normalized invalid calendar values', () => {
  assert.throws(
    () => parseTier6Cutover('2026-02-31T14:30:00+03:00'),
    /takvim tarihi/
  );
});
