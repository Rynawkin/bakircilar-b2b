-- Round 3 (2026-07-03): fiyat listesi onerisi + max-bazli fazla stok + son fiyat endeksleme
-- Idempotent; psql "$DBURL" -v ON_ERROR_STOP=1 --single-transaction -f backend/tmp_round3.sql

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "suggestedInvoicedListNo" INTEGER;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "suggestedRetailListNo" INTEGER;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "suggestedListBasis" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "suggestedListComputedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "manualInvoicedListNo" INTEGER;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "manualRetailListNo" INTEGER;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "manualListNote" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "manualListSetAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "manualListSetByName" TEXT;

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "minStockTotal" DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "maxStockTotal" DOUBLE PRECISION;

ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "lastPriceIndexationEnabled" BOOLEAN NOT NULL DEFAULT false;

-- price_list_no kolonu canli DB'de zaten var (priceSync yaziyor); Prisma modeline eklendi.
-- Idempotent guvence (kolon yoksa NULL olarak acilir; endeksleme kayit bulamayinca no-op kalir):
ALTER TABLE "price_changes" ADD COLUMN IF NOT EXISTS "price_list_no" INTEGER;
