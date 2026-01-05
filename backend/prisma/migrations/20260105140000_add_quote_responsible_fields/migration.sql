-- Add quote responsible/document fields and user preference
ALTER TABLE "User" ADD COLUMN "quoteResponsibleCode" TEXT;

ALTER TABLE "Quote" ADD COLUMN "documentNo" TEXT;
ALTER TABLE "Quote" ADD COLUMN "responsibleCode" TEXT;
