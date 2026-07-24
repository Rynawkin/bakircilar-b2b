import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildVadeImportNumericPatch,
  getMissingVadeSnapshotNumericFields,
  indexByCanonicalVadeCariCode,
  normalizeVadeCariCode,
  prepareVadeImportRows,
  resolveVadeImportAmounts,
} from './vade-import';

test('normalizeVadeCariCode preserves meaningful code characters and leading zeroes', () => {
  assert.equal(normalizeVadeCariCode('  00120-ab  '), '00120-AB');
  assert.equal(normalizeVadeCariCode(120), '120');
  assert.equal(normalizeVadeCariCode(null), '');
  assert.equal(normalizeVadeCariCode(undefined), '');
});

test('normalizeVadeCariCode normalizes compatibility width and invisible whitespace', () => {
  assert.equal(
    normalizeVadeCariCode('\u200B１２0\u00A0－\u200Dab'),
    '120-AB',
  );
  assert.equal(normalizeVadeCariCode(' ab \t 12\r\n'), 'AB12');
});

test('normalizeVadeCariCode compares identifier I variants consistently', () => {
  assert.equal(normalizeVadeCariCode('cari001'), 'CARI001');
  assert.equal(normalizeVadeCariCode('CARI001'), 'CARI001');
  assert.equal(normalizeVadeCariCode('CARİ001'), 'CARI001');
  assert.equal(normalizeVadeCariCode('carı001'), 'CARI001');
});

test('prepareVadeImportRows uses the final canonical duplicate and reports superseded rows', () => {
  const rows = [
    { mikroCariCode: ' ab-1 ', amount: 10 },
    { mikroCariCode: 'CD2', amount: 20 },
    { mikroCariCode: 'ＡＢ－１', amount: 30 },
    { mikroCariCode: 'cd 2', amount: 40 },
    { mikroCariCode: 'EF3', amount: 50 },
  ];

  const result = prepareVadeImportRows(rows);

  assert.deepEqual(
    result.uniqueRows.map(({ sourceRowNumber, canonicalCode, row }) => ({
      sourceRowNumber,
      canonicalCode,
      amount: row.amount,
    })),
    [
      { sourceRowNumber: 3, canonicalCode: 'AB-1', amount: 30 },
      { sourceRowNumber: 4, canonicalCode: 'CD2', amount: 40 },
      { sourceRowNumber: 5, canonicalCode: 'EF3', amount: 50 },
    ],
  );
  assert.deepEqual(
    result.duplicateRows.map((row) => ({
      sourceRowNumber: row.sourceRowNumber,
      code: row.code,
      canonicalCode: row.canonicalCode,
      keptSourceRowNumber: row.keptSourceRowNumber,
      keptCode: row.keptCode,
      reason: row.reason,
    })),
    [
      {
        sourceRowNumber: 1,
        code: 'ab-1',
        canonicalCode: 'AB-1',
        keptSourceRowNumber: 3,
        keptCode: 'AB-1',
        reason: 'DUPLICATE_CARI_CODE',
      },
      {
        sourceRowNumber: 2,
        code: 'CD2',
        canonicalCode: 'CD2',
        keptSourceRowNumber: 4,
        keptCode: 'cd 2',
        reason: 'DUPLICATE_CARI_CODE',
      },
    ],
  );
});

test('prepareVadeImportRows reports every superseded occurrence against the final row', () => {
  const result = prepareVadeImportRows([
    { mikroCariCode: 'A', marker: 1 },
    { mikroCariCode: 'a', marker: 2 },
    { mikroCariCode: ' A ', marker: 3 },
  ]);

  assert.deepEqual(
    result.uniqueRows.map(({ sourceRowNumber, row }) => ({
      sourceRowNumber,
      marker: row.marker,
    })),
    [{ sourceRowNumber: 3, marker: 3 }],
  );
  assert.deepEqual(
    result.duplicateRows.map(({ sourceRowNumber, keptSourceRowNumber }) => ({
      sourceRowNumber,
      keptSourceRowNumber,
    })),
    [
      { sourceRowNumber: 1, keptSourceRowNumber: 3 },
      { sourceRowNumber: 2, keptSourceRowNumber: 3 },
    ],
  );
});

test('prepareVadeImportRows leaves empty canonical codes visible for caller planning', () => {
  const rows = [
    { mikroCariCode: '   ', marker: 1 },
    { mikroCariCode: null, marker: 2 },
  ];

  const result = prepareVadeImportRows(rows);

  assert.deepEqual(
    result.uniqueRows.map(({ sourceRowNumber, canonicalCode }) => ({
      sourceRowNumber,
      canonicalCode,
    })),
    [
      { sourceRowNumber: 1, canonicalCode: '' },
      { sourceRowNumber: 2, canonicalCode: '' },
    ],
  );
  assert.deepEqual(result.duplicateRows, []);
});

test('prepareVadeImportRows does not mutate its input rows', () => {
  const row = { mikroCariCode: ' ab 1 ', amount: 25 };
  const rows = [row];

  prepareVadeImportRows(rows);

  assert.deepEqual(rows, [{ mikroCariCode: ' ab 1 ', amount: 25 }]);
  assert.equal(rows[0], row);
});

test('resolveVadeImportAmounts preserves the authoritative Excel buckets', () => {
  assert.deepEqual(resolveVadeImportAmounts({
    pastDueBalance: 1000,
    notDueBalance: -300,
    totalBalance: 700,
  }), {
    pastDueBalance: 1000,
    notDueBalance: -300,
    totalBalance: 700,
  });
  assert.deepEqual(resolveVadeImportAmounts({
    pastDueBalance: 1000,
    notDueBalance: -300,
  }), {
    pastDueBalance: 1000,
    notDueBalance: -300,
    totalBalance: 700,
  });
});

test('indexByCanonicalVadeCariCode keeps canonical database collisions explicit', () => {
  const customers = [
    { id: 'one', code: 'AB 12' },
    { id: 'two', code: 'ab12' },
    { id: 'three', code: 'CD-3' },
    { id: 'ignored', code: 'EF-4' },
  ];
  const result = indexByCanonicalVadeCariCode(
    customers,
    (customer) => customer.code,
    new Set(['AB12', 'CD-3']),
  );

  assert.deepEqual(
    result.collisions.get('AB12')?.map((customer) => customer.id),
    ['one', 'two'],
  );
  assert.equal(result.uniqueByCode.get('CD-3')?.id, 'three');
  assert.equal(result.uniqueByCode.has('EF-4'), false);
});

test('getMissingVadeSnapshotNumericFields requires every complete snapshot number', () => {
  assert.deepEqual(getMissingVadeSnapshotNumericFields({
    pastDueBalance: 0,
    notDueBalance: -50,
    totalBalance: -50,
    valor: 0,
  }), []);
  assert.deepEqual(getMissingVadeSnapshotNumericFields({
    pastDueBalance: 10,
    totalBalance: Number.NaN,
  }), ['notDueBalance', 'totalBalance', 'valor']);
});

test('buildVadeImportNumericPatch preserves omitted fields and accepts explicit zero', () => {
  assert.deepEqual(buildVadeImportNumericPatch({
    pastDueBalance: 0,
    totalBalance: 125.5,
    valor: 30.9,
  }), {
    pastDueBalance: 0,
    totalBalance: 125.5,
    valor: 30,
  });
  assert.deepEqual(buildVadeImportNumericPatch({
    pastDueBalance: undefined,
    notDueBalance: null,
    totalBalance: Number.POSITIVE_INFINITY,
  }), {});
});
