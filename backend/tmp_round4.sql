-- Round 4 (2026-07-03): minmax haric tutma + aile birim esleme + cron override
-- Idempotent; psql "$DBURL" -v ON_ERROR_STOP=1 --single-transaction -f backend/tmp_round4.sql

CREATE TABLE IF NOT EXISTS "MinMaxExclusion" (
  "id"            TEXT NOT NULL,
  "productCode"   TEXT NOT NULL,
  "productName"   TEXT,
  "note"          TEXT,
  "createdById"   TEXT,
  "createdByName" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MinMaxExclusion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MinMaxExclusion_productCode_key" ON "MinMaxExclusion"("productCode");

ALTER TABLE "ProductFamilyItem" ADD COLUMN IF NOT EXISTS "unitFactorOverride" DOUBLE PRECISION;

ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "cronOverrides" JSONB;

-- Cift yonlu birim secimi: alt birim secilince ana-birim miktari kesirli olabilir
ALTER TABLE "CartItem" ALTER COLUMN "quantity" TYPE DOUBLE PRECISION USING "quantity"::double precision;
ALTER TABLE "CartItem" ALTER COLUMN "approvedQuantity" TYPE DOUBLE PRECISION USING "approvedQuantity"::double precision;
ALTER TABLE "CartItem" ADD COLUMN IF NOT EXISTS "selectedUnit" TEXT;
