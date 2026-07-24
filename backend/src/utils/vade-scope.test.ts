import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildVadeSectorAccessWhere,
  isExcludedVadeSectorCode,
  normalizeVadeSectorCode,
} from './vade-scope';

test('normalizeVadeSectorCode normalizes Turkish dotted and dotless letters', () => {
  assert.equal(normalizeVadeSectorCode('  diğer  '), 'DIGER');
  assert.equal(normalizeVadeSectorCode('diger'), 'DIGER');
  assert.equal(normalizeVadeSectorCode('SORUNLU CARİ'), 'SORUNLU CARI');
});

test('isExcludedVadeSectorCode handles case, suffixes, and Turkish variants', () => {
  assert.equal(isExcludedVadeSectorCode('diger'), true);
  assert.equal(isExcludedVadeSectorCode('DİĞER - PASİF'), true);
  assert.equal(isExcludedVadeSectorCode('sorunlu cari eski'), true);
  assert.equal(isExcludedVadeSectorCode('HENDEK'), false);
});

test('global vade scope explicitly includes customers without a sector', () => {
  const where = buildVadeSectorAccessWhere({ canAccessAll: true });
  assert.ok(where);
  assert.deepEqual((where as { OR?: unknown[] }).OR?.[0], {
    sectorCode: null,
  });
});

test('assigned vade scope remains closed to null and unassigned sectors', () => {
  assert.equal(
    buildVadeSectorAccessWhere({
      canAccessAll: false,
      assignedSectorCodes: [],
    }),
    null,
  );
  assert.equal(
    buildVadeSectorAccessWhere({
      canAccessAll: false,
      assignedSectorCodes: ['HENDEK'],
      requestedSectorCode: 'MERKEZ',
    }),
    null,
  );
  assert.deepEqual(
    buildVadeSectorAccessWhere({
      canAccessAll: false,
      assignedSectorCodes: ['HENDEK'],
    })?.sectorCode,
    { in: ['HENDEK'] },
  );
});
