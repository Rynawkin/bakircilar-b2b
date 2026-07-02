-- Wave 4 - Min-Max v2 (B2B tarafinda paralel min-max hesap motoru)
-- MinMaxOverride tablosu + Settings varsayilan parametre kolonlari.
-- Idempotent: birden fazla kez calistirilabilir.
-- Uygulama: psql "<DATABASE_URL>" --single-transaction -f backend/tmp_wave4_minmax.sql
-- prisma migrate deploy KULLANMA (bkz. deploy mekanizmasi notu).

CREATE TABLE IF NOT EXISTS "MinMaxOverride" (
  "id" TEXT NOT NULL,
  "scopeType" TEXT NOT NULL,
  "productCode" TEXT,
  "supplierCode" TEXT,
  "depot" TEXT,
  "lookbackDays" INTEGER,
  "minDays" INTEGER,
  "maxDays" INTEGER,
  "note" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MinMaxOverride_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MinMaxOverride_scopeType_idx"
  ON "MinMaxOverride"("scopeType");
CREATE INDEX IF NOT EXISTS "MinMaxOverride_productCode_idx"
  ON "MinMaxOverride"("productCode");
CREATE INDEX IF NOT EXISTS "MinMaxOverride_supplierCode_idx"
  ON "MinMaxOverride"("supplierCode");

-- Settings: Min-Max v2 varsayilan parametreleri
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "minmaxLookbackDays" INTEGER NOT NULL DEFAULT 90;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "minmaxMinDays" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "minmaxMaxDays" INTEGER NOT NULL DEFAULT 45;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "minmaxSalesScope" TEXT NOT NULL DEFAULT 'DEPOT';
