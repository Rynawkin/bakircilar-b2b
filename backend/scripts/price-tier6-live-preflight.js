/* eslint-disable no-console */
const path = require('path');

const fromBackend = (relativePath) => path.join(process.cwd(), relativePath);
require(fromBackend('node_modules/dotenv')).config({
  path: fromBackend('.env'),
});

const { PrismaClient } = require(fromBackend('node_modules/@prisma/client'));

const prisma = new PrismaClient();
let mikroService = null;
const getMikroService = () => {
  if (!mikroService) {
    mikroService = require(fromBackend('dist/services/mikro.service')).default;
  }
  return mikroService;
};
const json = (value) =>
  JSON.stringify(
    value,
    (_key, item) => (typeof item === 'bigint' ? item.toString() : item),
    2
  );

async function checkPostgres() {
  const postgres = await prisma.$queryRawUnsafe(`
    SELECT
      to_regclass('public._prisma_migrations') IS NOT NULL
        AS has_migration_table,
      (
        SELECT COUNT(*)::bigint
        FROM price_changes
      ) AS price_change_count,
      (
        SELECT COUNT(*)::bigint
        FROM price_sync_log
        WHERE status = 'completed'
          AND last_synced_date IS NOT NULL
      ) AS completed_price_sync_watermarks
  `);
  const latestMigrations = await prisma.$queryRawUnsafe(`
    SELECT migration_name, finished_at, rolled_back_at
    FROM "_prisma_migrations"
    ORDER BY started_at DESC
    LIMIT 10
  `);
  const result = {
    state: postgres[0] || null,
    latestMigrations,
  };
  console.log(`POSTGRES_PREFLIGHT=${json(result)}`);
  return result;
}

async function checkMikro() {
  const service = getMikroService();
  await service.connect();
  const stockMovementIdentityColumn = await service.executeQueryOnce(`
    SELECT
      COLUMN_NAME AS columnName,
      DATA_TYPE AS dataType,
      IS_NULLABLE AS isNullable,
      CAST(
        CASE WHEN EXISTS (
          SELECT 1
          FROM sys.indexes i
          JOIN sys.index_columns ic
            ON ic.object_id = i.object_id
           AND ic.index_id = i.index_id
          JOIN sys.columns c
            ON c.object_id = ic.object_id
           AND c.column_id = ic.column_id
          WHERE i.object_id = OBJECT_ID(N'dbo.STOK_HAREKETLERI')
            AND i.is_unique = 1
            AND ic.key_ordinal = 1
            AND c.name = N'sth_Guid'
            AND (
              SELECT COUNT(*)
              FROM sys.index_columns keyColumns
              WHERE keyColumns.object_id = i.object_id
                AND keyColumns.index_id = i.index_id
                AND keyColumns.key_ordinal > 0
            ) = 1
        ) THEN 1 ELSE 0 END
        AS bit
      ) AS hasSingleColumnUniqueIndex
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = N'dbo'
      AND TABLE_NAME = N'STOK_HAREKETLERI'
      AND COLUMN_NAME = N'sth_Guid'
  `);
  const targetState = await service.executeQueryOnce(`
    SELECT
      (
        SELECT COUNT(*)
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = N'dbo'
          AND TABLE_NAME = N'STOKLAR_USER'
          AND COLUMN_NAME = N'Marj_6'
      ) AS margin6ColumnCount,
      (
        SELECT COUNT(*)
        FROM STOK_SATIS_FIYAT_LISTE_TANIMLARI
        WHERE sfl_sirano IN (13, 14)
      ) AS targetDefinitionCount,
      (
        SELECT COUNT(*)
        FROM STOK_SATIS_FIYAT_LISTELERI
        WHERE sfiyat_listesirano IN (13, 14)
      ) AS targetPriceRowCount
  `);
  const recentPriceBatches = await service.executeQueryOnce(`
    WITH RecentRows AS (
      SELECT TOP 1000
        LTRIM(RTRIM(fid_stok_kod)) AS productCode,
        fid_tarih AS changeTime,
        fid_fiyat_no AS listNo
      FROM STOK_FIYAT_DEGISIKLIKLERI
      WHERE fid_fiyat_no IN (1,2,3,4,5,6,7,8,9,10,11,12)
        AND fid_eskifiy_tutar <> fid_yenifiy_tutar
      ORDER BY fid_tarih DESC, fid_stok_kod, fid_fiyat_no
    )
    SELECT TOP 30
      productCode,
      changeTime,
      COUNT(*) AS [rowCount],
      COUNT(DISTINCT listNo) AS distinctListCount,
      MIN(listNo) AS minListNo,
      MAX(listNo) AS maxListNo
    FROM RecentRows
    GROUP BY productCode, changeTime
    ORDER BY changeTime DESC, productCode
  `);
  const duplicateCanonicalPrices = await service.executeQueryOnce(`
    SELECT TOP 50
      LTRIM(RTRIM(price.sfiyat_stokkod)) AS productCode,
      price.sfiyat_listesirano AS listNo,
      COUNT(*) AS [candidateCount]
    FROM STOK_SATIS_FIYAT_LISTELERI price
    INNER JOIN STOKLAR stock
      ON LTRIM(RTRIM(stock.sto_kod)) =
         LTRIM(RTRIM(price.sfiyat_stokkod))
    WHERE ISNULL(stock.sto_pasif_fl, 0) = 0
      AND price.sfiyat_listesirano IN (1,2,3,4,5,6,7,8,9,10,11,12,13,14)
      AND price.sfiyat_deposirano = 0
      AND price.sfiyat_doviz = 0
      AND price.sfiyat_odemeplan = 0
      AND price.sfiyat_iptal = 0
      AND ISNULL(price.sfiyat_hidden, 0) = 0
    GROUP BY
      LTRIM(RTRIM(price.sfiyat_stokkod)),
      price.sfiyat_listesirano
    HAVING COUNT(*) > 1
    ORDER BY productCode, listNo
  `);
  const result = {
    stockMovementIdentityColumn,
    targetState: targetState[0] || null,
    duplicateCanonicalPrices,
    recentPriceBatches,
  };
  console.log(`MIKRO_PREFLIGHT=${json(result)}`);
  return result;
}

async function main() {
  const mode = String(process.argv[2] || 'all').trim().toLowerCase();
  if (!['all', 'pg', 'mikro'].includes(mode)) {
    throw new Error('Usage: node price-tier6-live-preflight.js [all|pg|mikro]');
  }
  if (mode === 'all' || mode === 'pg') await checkPostgres();
  if (mode === 'all' || mode === 'mikro') await checkMikro();
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([
      mikroService?.disconnect(),
      prisma.$disconnect(),
    ]);
    process.exit(process.exitCode || 0);
  });
