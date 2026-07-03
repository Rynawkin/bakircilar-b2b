-- Marj raporu kullanici bazli dislama kurallari (MarginExclusion tablosu).
-- Idempotent: birden fazla kez calistirilabilir.
-- Uygulama: psql "<DATABASE_URL>" --single-transaction -f backend/tmp_margin_exclusions.sql
-- prisma migrate deploy KULLANMA (bkz. deploy mekanizmasi notu).

DO $$
BEGIN
  CREATE TYPE "MarginExclusionType" AS ENUM ('BRAND', 'PRODUCT_CODE', 'PRODUCT_NAME');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "MarginExclusion" (
  "id" TEXT NOT NULL,
  "type" "MarginExclusionType" NOT NULL,
  "value" TEXT NOT NULL,
  "label" TEXT,
  "note" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarginExclusion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MarginExclusion_type_idx"
  ON "MarginExclusion"("type");
CREATE INDEX IF NOT EXISTS "MarginExclusion_active_idx"
  ON "MarginExclusion"("active");
