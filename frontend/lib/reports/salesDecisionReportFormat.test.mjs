import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateDaysSince,
  formatDaysAgo,
  formatReportDate,
  getReportFreshness,
} from './salesDecisionReportFormat.ts';

test('rapor tarihi takvim gunu olarak ve Turkce bicimlenir', () => {
  assert.equal(formatReportDate('2026-07-24'), '24.07.2026');
  assert.equal(formatReportDate('20260724'), '24.07.2026');
  assert.equal(formatReportDate(null), '-');
  assert.equal(formatReportDate('gecersiz'), '-');
});

test('gun farki saat dilimi ve yaz saati farklarindan etkilenmez', () => {
  assert.equal(calculateDaysSince('2026-03-29', '2026-03-30'), 1);
  assert.equal(calculateDaysSince('2026-07-24', '2026-07-24'), 0);
  assert.equal(calculateDaysSince(null, '2026-07-24'), null);
});

test('goreli tarih etiketi kac gun once bilgisini korur', () => {
  assert.equal(formatDaysAgo(0), '0 gün önce · bugün');
  assert.equal(formatDaysAgo(1), '1 gün önce · dün');
  assert.equal(formatDaysAgo(42), '42 gün önce');
  assert.equal(formatDaysAgo(null), '-');
});

test('birlikte satis verisinin yasi tarafsiz olarak hesaplanir', () => {
  const updatedAt = '2026-07-24T02:30:00.000Z';
  assert.equal(getReportFreshness(updatedAt, '2026-07-25T14:30:00.000Z').ageLabel, '1 gün önce');
  assert.equal(getReportFreshness(updatedAt, '2026-07-24T14:30:00.000Z').ageLabel, '12 saat önce');
  assert.equal(getReportFreshness(null).hoursSinceUpdate, null);
});
