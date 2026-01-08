-- Add unit to quote items
ALTER TABLE "QuoteItem" ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'ADET';
