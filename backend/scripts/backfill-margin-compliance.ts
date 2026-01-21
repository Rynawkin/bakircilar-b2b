/**
 * Backfill margin compliance report cache.
 *
 * Usage:
 *   npx ts-node scripts/backfill-margin-compliance.ts --days=90 --delay=200
 */

import reportsService from '../src/services/reports.service';
import { prisma } from '../src/utils/prisma';

const getArgValue = (key: string, fallback: number) => {
  const prefix = `--${key}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  if (!arg) return fallback;
  const raw = arg.slice(prefix.length);
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

const days = getArgValue('days', 90);
const delayMs = getArgValue('delay', 200);

async function run() {
  console.log('Margin compliance backfill started.');
  console.log(`Days: ${days}, Delay: ${delayMs}ms`);

  const result = await reportsService.backfillMarginComplianceReport(days, {
    delayMs,
  });

  const successCount = result.results.filter((item) => item.success).length;
  const failedCount = result.results.length - successCount;

  console.log(`Backfill completed. Success: ${successCount}, Failed: ${failedCount}`);

  if (failedCount > 0) {
    const failures = result.results.filter((item) => !item.success).slice(0, 10);
    console.log('Sample failures:', failures);
  }
}

run()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
