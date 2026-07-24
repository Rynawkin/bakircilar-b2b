import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_MANAGEMENT_PROFIT_REPORT_LAYOUT,
  isValidManagementProfitReportPeriod,
  MANAGEMENT_PROFIT_REPORT_ROW_FIELDS,
  managementProfitReportFieldCatalog,
  normalizeManagementProfitReportLayout,
  normalizeManagementProfitReportPath,
  resolveIstanbulMonthToDate,
  resolveManagementProfitReportPeriod,
} from './management-profit-report-layout';

test('management profit report keeps the screenshot field order as its default', () => {
  assert.deepEqual(DEFAULT_MANAGEMENT_PROFIT_REPORT_LAYOUT.rowFields, [
    'CUSTOMER_SECTOR_CODE',
    'GROUP_NAME',
    'CUSTOMER_NAME',
    'STOCK',
  ]);
  assert.equal(DEFAULT_MANAGEMENT_PROFIT_REPORT_LAYOUT.columnField, 'MONTH');
  assert.equal(DEFAULT_MANAGEMENT_PROFIT_REPORT_LAYOUT.valueField, 'SALES_AMOUNT');
  assert.equal(DEFAULT_MANAGEMENT_PROFIT_REPORT_LAYOUT.defaultExpandedDepth, 0);
  assert.equal(DEFAULT_MANAGEMENT_PROFIT_REPORT_LAYOUT.sort, 'LABEL_ASC');
  assert.deepEqual(
    managementProfitReportFieldCatalog.rows.map((field) => field.label),
    ['CARİ SEKTÖR KODU', 'CARİ GRUP KODU', 'CARİ İSMİ', 'STOK']
  );
  assert.equal(managementProfitReportFieldCatalog.columns[0]?.label, 'AY');
  assert.equal(
    managementProfitReportFieldCatalog.values[0]?.label,
    'SATIŞ TUTARI'
  );
});

test('drill-down fields map to their live TVF semantic columns', () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(MANAGEMENT_PROFIT_REPORT_ROW_FIELDS).map(
        ([field, definition]) => [field, definition.sqlColumn]
      )
    ),
    {
      CUSTOMER_SECTOR_CODE: '[CARİ SEKTÖR KODU]',
      GROUP_NAME: '[msg_S_2872]',
      CUSTOMER_NAME: '[msg_S_0201]',
      STOCK: '[msg_S_0542]',
    }
  );
});

test('saved layouts reject duplicate, unknown and extra fields', () => {
  assert.throws(() =>
    normalizeManagementProfitReportLayout({
      ...DEFAULT_MANAGEMENT_PROFIT_REPORT_LAYOUT,
      rowFields: ['CUSTOMER_NAME', 'CUSTOMER_NAME'],
    })
  );
  assert.throws(() =>
    normalizeManagementProfitReportLayout({
      ...DEFAULT_MANAGEMENT_PROFIT_REPORT_LAYOUT,
      rowFields: ['UNSAFE_SQL_FIELD'],
    })
  );
  assert.throws(() =>
    normalizeManagementProfitReportLayout({
      ...DEFAULT_MANAGEMENT_PROFIT_REPORT_LAYOUT,
      startDate: '2026-01-01',
    })
  );
  assert.throws(() =>
    normalizeManagementProfitReportLayout({
      ...DEFAULT_MANAGEMENT_PROFIT_REPORT_LAYOUT,
      defaultExpandedDepth: 2,
    })
  );
});

test('drill path must follow the selected row field order', () => {
  const valid = normalizeManagementProfitReportPath(
    [{ field: 'CUSTOMER_SECTOR_CODE', value: 'SATIS' }],
    DEFAULT_MANAGEMENT_PROFIT_REPORT_LAYOUT
  );
  assert.equal(valid.length, 1);
  assert.throws(() =>
    normalizeManagementProfitReportPath(
      [{ field: 'CUSTOMER_NAME', value: 'Example' }],
      DEFAULT_MANAGEMENT_PROFIT_REPORT_LAYOUT
    )
  );
});

test('Istanbul month-to-date follows the local day across UTC midnight', () => {
  assert.deepEqual(
    resolveIstanbulMonthToDate(new Date('2026-07-31T21:30:00.000Z')),
    {
      preset: 'ISTANBUL_MONTH_TO_DATE',
      startDate: '2026-08-01',
      endDate: '2026-08-01',
      label: '1 Ağustos 2026',
      timeZone: 'Europe/Istanbul',
    }
  );
  assert.equal(
    resolveIstanbulMonthToDate(new Date('2026-12-31T21:30:00.000Z')).startDate,
    '2027-01-01'
  );
});

test('management report custom period is normalized and limited to 12 calendar months', () => {
  const now = new Date('2026-07-24T12:00:00.000Z');
  assert.deepEqual(
    resolveManagementProfitReportPeriod(undefined, now),
    resolveIstanbulMonthToDate(now)
  );
  const period = resolveManagementProfitReportPeriod(
    {
      startDate: '2025-08-01',
      endDate: '2026-07-24',
    },
    now
  );
  assert.deepEqual(period, {
    preset: 'CUSTOM',
    startDate: '2025-08-01',
    endDate: '2026-07-24',
    label: '1 Ağustos 2025 – 24 Temmuz 2026',
    timeZone: 'Europe/Istanbul',
  });
  assert.equal(isValidManagementProfitReportPeriod(period, now), true);

  assert.throws(
    () =>
      resolveManagementProfitReportPeriod(
        {
          startDate: '2025-07-01',
          endDate: '2026-07-24',
        },
        now
      ),
    (error: any) =>
      error?.details?.reportAccessCode === 'REPORT_PERIOD_TOO_LARGE'
  );
});

test('management report custom period rejects incomplete, impossible, reversed and future dates', () => {
  const now = new Date('2026-07-24T12:00:00.000Z');
  const rejectsWith = (input: unknown, reportAccessCode: string) =>
    assert.throws(
      () => resolveManagementProfitReportPeriod(input, now),
      (error: any) => error?.details?.reportAccessCode === reportAccessCode
    );

  rejectsWith({ startDate: '2026-07-01' }, 'REPORT_PERIOD_INVALID');
  rejectsWith(
    { startDate: '2026-02-29', endDate: '2026-03-01' },
    'REPORT_PERIOD_INVALID'
  );
  rejectsWith(
    { startDate: '2026-07-24', endDate: '2026-07-01' },
    'REPORT_PERIOD_ORDER_INVALID'
  );
  rejectsWith(
    { startDate: '2026-07-01', endDate: '2026-07-25' },
    'REPORT_PERIOD_FUTURE_INVALID'
  );
  rejectsWith(
    {
      startDate: '2026-07-01',
      endDate: '2026-07-24',
      preset: 'CUSTOM',
    },
    'REPORT_PERIOD_INVALID'
  );
});
