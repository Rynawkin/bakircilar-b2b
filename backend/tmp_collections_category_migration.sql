-- Kategori gorselleri + Koleksiyonlar — idempotent prod migration.
-- Deploy: psql "<DATABASE_URL>" --single-transaction -v ON_ERROR_STOP=1 -f backend/tmp_collections_category_migration.sql

-- Kategori "Kategori kesfi" gorseli
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

-- Koleksiyonlar
DO $$ BEGIN
  CREATE TYPE "CollectionSourceType" AS ENUM ('RULE','MANUAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "Collection" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "subtitle" TEXT,
  "imageUrl" TEXT,
  "color" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "sourceType" "CollectionSourceType" NOT NULL DEFAULT 'RULE',
  "ruleType" TEXT,
  "categoryId" TEXT,
  "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "targetType" "GiftTargetType" NOT NULL DEFAULT 'ALL',
  "targetSectorCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "targetUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "active" BOOLEAN NOT NULL DEFAULT true,
  "validFrom" TIMESTAMP(3),
  "validTo" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Collection_active_sortOrder_idx" ON "Collection"("active","sortOrder");
