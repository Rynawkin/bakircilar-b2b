-- Add customer price list configuration + per-user overrides
ALTER TABLE "Settings" ADD COLUMN "customerPriceLists" JSONB;
ALTER TABLE "User" ADD COLUMN "invoicedPriceListNo" INTEGER;
ALTER TABLE "User" ADD COLUMN "whitePriceListNo" INTEGER;
