/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const backendDir = process.cwd();
require(path.join(backendDir, 'node_modules', 'dotenv')).config({
  path: path.join(backendDir, '.env'),
});

const mikroService = require(
  path.join(backendDir, 'dist', 'services', 'mikro.service')
).default;

const migrationPath = path.join(
  backendDir,
  'scripts',
  'mikro-price-list-tier6-migration.sql'
);
const dryRunMarker = 'DECLARE @dryRun bit = 1;';

const toNumber = (value) => Number(value ?? 0);

async function readState() {
  const rows = await mikroService.executeQueryOnce(`
    SELECT
      (
        SELECT COUNT(*)
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = N'dbo'
          AND TABLE_NAME = N'STOKLAR_USER'
          AND COLUMN_NAME = N'Marj_6'
          AND DATA_TYPE = N'nvarchar'
          AND CHARACTER_MAXIMUM_LENGTH = 17
          AND IS_NULLABLE = N'YES'
      ) AS margin6ColumnCount,
      (
        SELECT COUNT(*)
        FROM dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI
        WHERE sfl_sirano = 13
          AND sfl_aciklama = N'Faturalı Satış 6'
      ) AS invoiced6DefinitionCount,
      (
        SELECT COUNT(*)
        FROM dbo.STOK_SATIS_FIYAT_LISTE_TANIMLARI
        WHERE sfl_sirano = 14
          AND sfl_aciklama = N'Perakende Satış 6'
      ) AS retail6DefinitionCount,
      (
        SELECT COUNT(*)
        FROM dbo.STOK_SATIS_FIYAT_LISTELERI
        WHERE sfiyat_listesirano = 10
      ) AS invoiced5PriceRowCount,
      (
        SELECT COUNT(*)
        FROM dbo.STOK_SATIS_FIYAT_LISTELERI
        WHERE sfiyat_listesirano = 13
      ) AS invoiced6PriceRowCount,
      (
        SELECT COUNT(*)
        FROM dbo.STOK_SATIS_FIYAT_LISTELERI
        WHERE sfiyat_listesirano = 5
      ) AS retail5PriceRowCount,
      (
        SELECT COUNT(*)
        FROM dbo.STOK_SATIS_FIYAT_LISTELERI
        WHERE sfiyat_listesirano = 14
      ) AS retail6PriceRowCount,
      (
        SELECT COUNT(*)
        FROM dbo.STOK_SATIS_FIYAT_LISTELERI
        WHERE sfiyat_listesirano = 11
      ) AS campaign11PriceRowCount,
      (
        SELECT COUNT(*)
        FROM dbo.STOK_SATIS_FIYAT_LISTELERI
        WHERE sfiyat_listesirano = 12
      ) AS campaign12PriceRowCount
  `);
  const state = rows[0] || {};

  // Keep Marj_6 out of the first compiled batch: it does not exist before the
  // additive migration and SQL Server resolves column names before CASE runs.
  if (toNumber(state.margin6ColumnCount) === 1) {
    const marginRows = await mikroService.executeQueryOnce(`
      SELECT COUNT(*) AS validMargin5MissingMargin6Count
      FROM dbo.STOKLAR_USER
      WHERE TRY_CONVERT(
          decimal(19, 6),
          REPLACE(
            NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), Marj_5))), N''),
            N',',
            N'.'
          )
        ) > 0
        AND (
          TRY_CONVERT(
            decimal(19, 6),
            REPLACE(
              NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), Marj_6))), N''),
              N',',
              N'.'
            )
          ) IS NULL
          OR TRY_CONVERT(
            decimal(19, 6),
            REPLACE(
              NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), Marj_6))), N''),
              N',',
              N'.'
            )
          ) <= 0
        )
    `);
    state.validMargin5MissingMargin6Count =
      marginRows[0]?.validMargin5MissingMargin6Count ?? null;
  } else {
    state.validMargin5MissingMargin6Count = null;
  }

  return state;
}

function assertApplied(before, after) {
  const failures = [];
  const expect = (condition, message) => {
    if (!condition) failures.push(message);
  };

  expect(toNumber(after.margin6ColumnCount) === 1, 'Marj_6 kolonu dogrulanamadi');
  expect(
    toNumber(after.invoiced6DefinitionCount) === 1,
    'Faturali 6 tanimi dogrulanamadi'
  );
  expect(
    toNumber(after.retail6DefinitionCount) === 1,
    'Perakende 6 tanimi dogrulanamadi'
  );
  expect(
    toNumber(after.invoiced6PriceRowCount) ===
      toNumber(after.invoiced5PriceRowCount),
    'Faturali 6 satir sayisi Faturali 5 ile ayni degil'
  );
  expect(
    toNumber(after.retail6PriceRowCount) ===
      toNumber(after.retail5PriceRowCount),
    'Perakende 6 satir sayisi Perakende 5 ile ayni degil'
  );
  expect(
    toNumber(after.campaign11PriceRowCount) ===
      toNumber(before.campaign11PriceRowCount),
    'Kampanya 11 satir sayisi degisti'
  );
  expect(
    toNumber(after.campaign12PriceRowCount) ===
      toNumber(before.campaign12PriceRowCount),
    'Kampanya 12 satir sayisi degisti'
  );
  expect(
    toNumber(after.validMargin5MissingMargin6Count) === 0,
    'Gecerli Marj_5 degeri olan stoklarda Marj_6 eksik'
  );

  if (failures.length > 0) {
    throw new Error(`Mikro migration read-back basarisiz: ${failures.join('; ')}`);
  }
}

async function main() {
  if (process.argv[2] !== '--apply') {
    throw new Error(
      'Bu script yalniz acik production onayiyla --apply parametresi kullanilarak calistirilir.'
    );
  }

  const sourceSql = fs.readFileSync(migrationPath, 'utf8');
  const markerMatches = sourceSql.split(dryRunMarker).length - 1;
  if (markerMatches !== 1) {
    throw new Error(
      `Migration dry-run guvenlik isareti tekil degil (bulunan: ${markerMatches}).`
    );
  }

  const before = await readState();
  const applySql = sourceSql.replace(
    dryRunMarker,
    'DECLARE @dryRun bit = 0;'
  );
  const result = await mikroService.executeQueryOnce(applySql);
  const migrationResult = result[0] || {};
  if (toNumber(migrationResult.dryRun) !== 0) {
    throw new Error('Migration apply modunda tamamlanmadi.');
  }

  // Independent query after COMMIT: do not trust only the transaction result.
  const after = await readState();
  assertApplied(before, after);

  console.log(
    JSON.stringify(
      {
        applied: true,
        migration: migrationResult,
        readBack: after,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await mikroService.disconnect().catch(() => {});
    process.exit(process.exitCode || 0);
  });
