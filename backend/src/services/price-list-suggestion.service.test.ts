import assert from 'node:assert/strict';
import test from 'node:test';
import { isPriceSnapshotCompleteForSuggestionWrites } from './price-list-suggestion.service';

test('price-list suggestions fail closed when any price chunk is incomplete', () => {
  assert.equal(isPriceSnapshotCompleteForSuggestionWrites(3, 1), false);
  assert.equal(isPriceSnapshotCompleteForSuggestionWrites(3, 3), false);
  assert.equal(isPriceSnapshotCompleteForSuggestionWrites(0, 1), false);
});

test('price-list suggestions may write only after a complete price snapshot', () => {
  assert.equal(isPriceSnapshotCompleteForSuggestionWrites(3, 0), true);
  assert.equal(isPriceSnapshotCompleteForSuggestionWrites(0, 0), true);
});
