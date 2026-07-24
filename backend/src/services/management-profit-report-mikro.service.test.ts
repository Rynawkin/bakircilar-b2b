import assert from 'node:assert/strict';
import test from 'node:test';
import config from '../config';
import managementProfitReportMikroService from './management-profit-report-mikro.service';
import { DEFAULT_MANAGEMENT_PROFIT_REPORT_LAYOUT } from '../utils/management-profit-report-layout';

test('mock report aggregates roots and lazy children without returning raw rows', async () => {
  const original = config.useMockMikro;
  const originalNodeEnv = config.nodeEnv;
  const mutableConfig = config as unknown as {
    useMockMikro: boolean;
    nodeEnv: string;
  };
  mutableConfig.useMockMikro = true;
  try {
    await managementProfitReportMikroService.assertReady();
    const root = await managementProfitReportMikroService.query({
      period: { startDate: '2026-07-01', endDate: '2026-07-24' },
      layout: DEFAULT_MANAGEMENT_PROFIT_REPORT_LAYOUT,
      path: [],
    });
    assert.equal(root.months[0]?.key, '2026-07');
    assert.equal(root.nodes.length, 2);
    assert.equal(root.nodes.every((node) => node.level === 0 && node.hasChildren), true);
    assert.equal(
      root.grandTotal,
      root.nodes.reduce((total, node) => total + node.grandTotal, 0)
    );

    const salesSector = root.nodes.find((node) => node.value === 'SATIS');
    assert.ok(salesSector);
    const children = await managementProfitReportMikroService.query({
      period: { startDate: '2026-07-01', endDate: '2026-07-24' },
      layout: DEFAULT_MANAGEMENT_PROFIT_REPORT_LAYOUT,
      path: salesSector.path,
    });
    assert.deepEqual(children.nodes.map((node) => node.value), ['Temizlik']);
    assert.equal(children.nodes[0]?.level, 1);

    mutableConfig.nodeEnv = 'production';
    await assert.rejects(
      () => managementProfitReportMikroService.assertReady(),
      (error: any) =>
        error?.details?.reportAccessCode === 'MIKRO_REPORT_MOCK_FORBIDDEN'
    );
  } finally {
    mutableConfig.useMockMikro = original;
    mutableConfig.nodeEnv = originalNodeEnv;
  }
});
