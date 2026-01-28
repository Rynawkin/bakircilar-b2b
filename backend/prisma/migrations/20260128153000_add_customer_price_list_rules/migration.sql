-- Add customer price list rules and last price settings

-- Enums
CREATE TYPE "LastPriceGuardType" AS ENUM ('COST', 'PRICE_LIST');
CREATE TYPE "LastPriceCostBasis" AS ENUM ('CURRENT_COST', 'LAST_ENTRY');

-- User fields
ALTER TABLE "User" ADD COLUMN "useLastPrices" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "lastPriceGuardType" "LastPriceGuardType" NOT NULL DEFAULT 'COST';
ALTER TABLE "User" ADD COLUMN "lastPriceCostBasis" "LastPriceCostBasis" NOT NULL DEFAULT 'CURRENT_COST';
ALTER TABLE "User" ADD COLUMN "lastPriceMinCostPercent" DOUBLE PRECISION NOT NULL DEFAULT 10;

-- Product brand
ALTER TABLE "Product" ADD COLUMN "brandCode" TEXT;

-- Customer price list rules
CREATE TABLE "CustomerPriceListRule" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "brandCode" TEXT,
    "categoryId" TEXT,
    "invoicedPriceListNo" INTEGER NOT NULL,
    "whitePriceListNo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPriceListRule_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CustomerPriceListRule" ADD CONSTRAINT "CustomerPriceListRule_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerPriceListRule" ADD CONSTRAINT "CustomerPriceListRule_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CustomerPriceListRule_customerId_brandCode_categoryId_key"
  ON "CustomerPriceListRule"("customerId", "brandCode", "categoryId");

CREATE INDEX "CustomerPriceListRule_customerId_idx" ON "CustomerPriceListRule"("customerId");
CREATE INDEX "CustomerPriceListRule_brandCode_idx" ON "CustomerPriceListRule"("brandCode");
CREATE INDEX "CustomerPriceListRule_categoryId_idx" ON "CustomerPriceListRule"("categoryId");
