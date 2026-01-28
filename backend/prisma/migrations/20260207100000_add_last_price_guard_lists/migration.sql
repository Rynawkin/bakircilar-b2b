-- Add optional price list references for last price guard
ALTER TABLE "User" ADD COLUMN "lastPriceGuardInvoicedListNo" INTEGER;
ALTER TABLE "User" ADD COLUMN "lastPriceGuardWhiteListNo" INTEGER;
