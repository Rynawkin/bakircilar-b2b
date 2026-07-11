import test from 'node:test';
import assert from 'node:assert/strict';
import { marginReportTestUtils } from './reports.service';
import { buildMarginViolationScope } from './margin-violation.service';

test('Turkish numeric values are parsed without turning missing data into zero', () => {
  assert.equal(marginReportTestUtils.parseNumberOrNull('1.234,56'), 1234.56);
  assert.equal(marginReportTestUtils.parseNumberOrNull(null), null);
  assert.equal(marginReportTestUtils.parseNumberOrNull('bozuk'), null);
  assert.equal(marginReportTestUtils.hasNumericValue('bozuk'), false);
});

test('current margin uses profit over revenue and keeps markup separate', () => {
  const row = {
    SatışDurumu: 'Vergi Var',
    Vergi: 20,
    Tutar: 100,
    TutarKDV: 120,
    Miktar: 1,
    'A.Teklif+': 80,
    'A.TeklifDahil': 96,
  };
  const result = marginReportTestUtils.calculateCurrentProfit(row);
  assert.equal(result.totalProfit, 20);
  assert.equal(result.margin, 20);
  assert.equal(result.markup, 25);
});

test('entry margin falls back to total profit while raw Mikro source margin stays missing', () => {
  const row = {
    Tutar: 100,
    'SÖ-ToplamKar': -5,
    'SÖ-BirimMaliyet': 105,
  };
  assert.equal(marginReportTestUtils.pickEntrySourceMargin(row), null);
  assert.equal(marginReportTestUtils.pickEntryMargin(row, 100), -5);
});

test('duplicate source rows receive stable but distinct row keys', () => {
  const source = {
    'Evrak No': 'ABC-1',
    'Stok Kodu': 'B100',
    'Cari Kodu': '120.01',
    Miktar: 2,
    Tutar: 100,
  };
  const first = marginReportTestUtils.attachDeterministicRowKeys([{ data: source }, { data: source }]);
  const second = marginReportTestUtils.attachDeterministicRowKeys([{ data: source }, { data: source }]);
  assert.notEqual(first[0].rowKey, first[1].rowKey);
  assert.deepEqual(first.map((row) => row.rowKey), second.map((row) => row.rowKey));
});

test('sales representatives are scoped through the many-to-many assignee relation', () => {
  assert.deepEqual(
    buildMarginViolationScope({ userId: 'rep-1', role: 'SALES_REP' }),
    { assignees: { some: { userId: 'rep-1' } } }
  );
  assert.deepEqual(buildMarginViolationScope({ userId: 'manager-1', role: 'MANAGER' }), {});
  assert.throws(
    () => buildMarginViolationScope({ userId: 'customer-1', role: 'CUSTOMER' }),
    (error: any) => error?.statusCode === 403
  );
});
