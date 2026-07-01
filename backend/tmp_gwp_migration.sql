-- Hediyeli Kampanya (GWP) — idempotent prod migration.
-- Deploy aninda: psql "<DATABASE_URL>" --single-transaction -f backend/tmp_gwp_migration.sql
-- prisma migrate deploy KULLANMA (bkz. deploy mekanizmasi notu).

DO $$ BEGIN
  CREATE TYPE "GiftScopeType" AS ENUM ('MISSING_CATEGORIES','CATEGORY_IDS','PRODUCT_IDS','ALL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "GiftTargetType" AS ENUM ('ALL','SEGMENT','ACCOUNT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "GiftCampaign" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "subtitle" TEXT,
  "bannerImageUrl" TEXT,
  "buttonText" TEXT,
  "threshold" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "thresholdPriceType" "PriceType" NOT NULL DEFAULT 'INVOICED',
  "thresholdVatIncluded" BOOLEAN NOT NULL DEFAULT false,
  "scopeType" "GiftScopeType" NOT NULL DEFAULT 'MISSING_CATEGORIES',
  "scopeCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "scopeProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "giftPickCount" INTEGER NOT NULL DEFAULT 1,
  "targetType" "GiftTargetType" NOT NULL DEFAULT 'ALL',
  "targetSectorCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "targetUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "active" BOOLEAN NOT NULL DEFAULT true,
  "validFrom" TIMESTAMP(3),
  "validTo" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GiftCampaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GiftCampaign_active_validFrom_validTo_idx"
  ON "GiftCampaign"("active","validFrom","validTo");

CREATE TABLE IF NOT EXISTS "GiftCampaignItem" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GiftCampaignItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GiftCampaignItem_campaignId_idx"
  ON "GiftCampaignItem"("campaignId");

DO $$ BEGIN
  ALTER TABLE "GiftCampaignItem" ADD CONSTRAINT "GiftCampaignItem_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "GiftCampaign"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Cart: hediye secimi (nullable, additive)
ALTER TABLE "Cart" ADD COLUMN IF NOT EXISTS "giftCampaignId" TEXT;
ALTER TABLE "Cart" ADD COLUMN IF NOT EXISTS "giftProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- OrderItem: hediye satiri bayragi (Faz 2 — Mikro'ya 0,1 ₺)
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "isGift" BOOLEAN NOT NULL DEFAULT false;
