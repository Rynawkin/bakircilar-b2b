ALTER TABLE "Quote"
  ADD COLUMN "customerPdfSentAt" TIMESTAMP(3),
  ADD COLUMN "customerPdfSentById" TEXT;

CREATE INDEX "Quote_customerPdfSentById_idx" ON "Quote"("customerPdfSentById");

ALTER TABLE "Quote"
  ADD CONSTRAINT "Quote_customerPdfSentById_fkey"
  FOREIGN KEY ("customerPdfSentById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
