/**
 * Resync product images from Mikro for products that already have imageUrl.
 *
 * Usage:
 *   node scripts/resync-existing-images.js
 *   node scripts/resync-existing-images.js --limit=200 --batch=100 --include-inactive
 *   node scripts/resync-existing-images.js --dry-run
 */

const { PrismaClient } = require('@prisma/client');
const imageService = require('../dist/services/image.service').default;
const mikroService = require('../dist/services/mikroFactory.service').default;

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const argMap = Object.fromEntries(
  args
    .filter((arg) => arg.startsWith('--') && arg.includes('='))
    .map((arg) => {
      const [key, value] = arg.slice(2).split('=');
      return [key, value];
    })
);

const limit = argMap.limit ? Number(argMap.limit) : null;
const batchSize = argMap.batch ? Number(argMap.batch) : 200;
const includeInactive = args.includes('--include-inactive');
const dryRun = args.includes('--dry-run') || args.includes('--dry');

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function resyncExistingImages() {
  const where = {
    imageUrl: { not: null },
  };

  if (!includeInactive) {
    where.active = true;
  }

  const products = await prisma.product.findMany({
    where,
    select: {
      id: true,
      mikroCode: true,
      name: true,
      imageUrl: true,
    },
    orderBy: { mikroCode: 'asc' },
  });

  const scopedProducts = limit ? products.slice(0, limit) : products;
  const totalCount = scopedProducts.length;

  console.log(`\nResync starting for ${totalCount} products (batch=${batchSize}, dryRun=${dryRun})`);

  if (totalCount === 0) {
    return;
  }

  await imageService.ensureUploadDir();

  const stats = {
    processed: 0,
    downloaded: 0,
    skipped: 0,
    noImage: 0,
    missingGuid: 0,
    failed: 0,
  };

  const batches = chunkArray(scopedProducts, batchSize);

  for (const batch of batches) {
    const codes = batch.map((product) => product.mikroCode).filter(Boolean);
    const guidRows = await mikroService.getProductGuidsByCodes(codes);
    const guidMap = new Map(guidRows.map((row) => [row.code, row.guid]));

    for (const product of batch) {
      stats.processed += 1;
      const guid = guidMap.get(product.mikroCode);

      if (!guid) {
        stats.missingGuid += 1;
        if (stats.missingGuid <= 10) {
          console.log(`- GUID missing: ${product.mikroCode}`);
        }
        continue;
      }

      const result = await imageService.downloadImageFromMikro(product.mikroCode, guid);

      if (result.success && result.localPath) {
        stats.downloaded += 1;
        if (!dryRun) {
          await prisma.product.update({
            where: { id: product.id },
            data: {
              imageUrl: result.localPath,
              imageChecksum: result.checksum || null,
              imageSyncStatus: 'SUCCESS',
              imageSyncErrorType: null,
              imageSyncErrorMessage: null,
              imageSyncUpdatedAt: new Date(),
            },
          });
        }
      } else if (result.skipped) {
        stats.skipped += 1;
        if (result.errorType === 'NO_IMAGE') {
          stats.noImage += 1;
        }
        if (stats.skipped <= 10) {
          console.log(`- Skipped ${product.mikroCode}: ${result.skipReason || result.error || 'unknown'}`);
        }
      } else {
        stats.failed += 1;
        if (stats.failed <= 10) {
          console.log(`- Failed ${product.mikroCode}: ${result.error || result.skipReason || 'unknown'}`);
        }
      }

      if (stats.processed % 25 === 0) {
        console.log(
          `  Progress: ${stats.processed}/${totalCount} ` +
          `(ok=${stats.downloaded}, skipped=${stats.skipped}, failed=${stats.failed}, noImage=${stats.noImage})`
        );
      }
    }
  }

  console.log('\nResync complete.');
  console.log(`  Processed: ${stats.processed}`);
  console.log(`  Downloaded: ${stats.downloaded}`);
  console.log(`  Skipped: ${stats.skipped} (noImage=${stats.noImage})`);
  console.log(`  Missing GUID: ${stats.missingGuid}`);
  console.log(`  Failed: ${stats.failed}`);
}

resyncExistingImages()
  .catch((error) => {
    console.error('\nResync failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mikroService.disconnect?.();
    } catch {}
    await prisma.$disconnect();
  });
