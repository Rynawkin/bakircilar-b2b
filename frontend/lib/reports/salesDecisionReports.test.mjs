import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SALES_DECISION_REPORT_LIST,
  SALES_DECISION_REPORTS,
} from './salesDecisionReports.ts';

test('dort raporun adresi ve karar aciklamasi benzersizdir', () => {
  assert.equal(SALES_DECISION_REPORT_LIST.length, 4);
  assert.equal(new Set(SALES_DECISION_REPORT_LIST.map((report) => report.key)).size, 4);
  assert.equal(new Set(SALES_DECISION_REPORT_LIST.map((report) => report.href)).size, 4);

  SALES_DECISION_REPORT_LIST.forEach((report) => {
    assert.ok(report.decisionQuestion.length > 20);
    assert.ok(report.inclusionRule.length > 20);
    assert.ok(report.firstAction.length > 20);
  });
});

test('yeni kategori satisi ile sepet tamamlama farkli is kurallarini anlatir', () => {
  const opportunity = SALES_DECISION_REPORTS.categoryOpportunity;
  const complement = SALES_DECISION_REPORTS.complementMissing;

  assert.match(opportunity.purpose, /İLK KATEGORİ SATIŞI/);
  assert.equal(opportunity.title, 'İlk Kategori Satışı Fırsatları');
  assert.match(opportunity.inclusionRule, /hiç almamış/);
  assert.match(complement.purpose, /MEVCUT ALIMI GENİŞLET/);
  assert.match(complement.inclusionRule, /baz ürünü almış/);
  assert.notEqual(opportunity.decisionQuestion, complement.decisionQuestion);
});
