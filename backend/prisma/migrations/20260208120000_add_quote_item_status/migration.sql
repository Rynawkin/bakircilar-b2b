-- Add quote item status tracking
CREATE TYPE "QuoteItemStatus" AS ENUM ('OPEN', 'CONVERTED', 'CLOSED');

ALTER TABLE "QuoteItem"
ADD COLUMN "status" "QuoteItemStatus" NOT NULL DEFAULT 'OPEN',
ADD COLUMN "statusUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "closedReason" TEXT,
ADD COLUMN "closedAt" TIMESTAMP(3),
ADD COLUMN "convertedAt" TIMESTAMP(3);

CREATE INDEX "QuoteItem_status_idx" ON "QuoteItem"("status");
CREATE INDEX "QuoteItem_statusUpdatedAt_idx" ON "QuoteItem"("statusUpdatedAt");
