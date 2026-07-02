-- Wave 3 - ProductStockAlert tablosu (musteri "stoga gelince haber ver" alarmi)
-- Idempotent: birden fazla kez calistirilabilir.
-- Uygulama: psql "<DATABASE_URL>" --single-transaction -f backend/tmp_wave3_stockalert.sql
-- prisma migrate deploy KULLANMA (bkz. deploy mekanizmasi notu).

CREATE TABLE IF NOT EXISTS "ProductStockAlert" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notifiedAt" TIMESTAMP(3),
  CONSTRAINT "ProductStockAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductStockAlert_userId_productId_key"
  ON "ProductStockAlert"("userId", "productId");
CREATE INDEX IF NOT EXISTS "ProductStockAlert_notifiedAt_idx"
  ON "ProductStockAlert"("notifiedAt");
CREATE INDEX IF NOT EXISTS "ProductStockAlert_productId_idx"
  ON "ProductStockAlert"("productId");

DO $$ BEGIN
  ALTER TABLE "ProductStockAlert" ADD CONSTRAINT "ProductStockAlert_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ProductStockAlert" ADD CONSTRAINT "ProductStockAlert_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
