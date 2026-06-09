ALTER TABLE "PriceVerificationRequest"
  ADD COLUMN IF NOT EXISTS "attachments" JSONB NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS "TenderCostRequest" (
  "id" TEXT NOT NULL,
  "requestNo" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "title" TEXT NOT NULL,
  "customerCode" TEXT,
  "customerName" TEXT,
  "deadline" TIMESTAMP(3),
  "deliveryLocation" TEXT,
  "salesNote" TEXT,
  "procurementNote" TEXT,
  "attachments" JSONB NOT NULL DEFAULT '[]',
  "createdById" TEXT,
  "createdByName" TEXT,
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TenderCostRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TenderCostItem" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "lineNo" INTEGER NOT NULL,
  "productCode" TEXT,
  "productName" TEXT NOT NULL,
  "unit" TEXT,
  "quantity" DOUBLE PRECISION,
  "targetPrice" DOUBLE PRECISION,
  "note" TEXT,
  "attachments" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TenderCostItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TenderCostOffer" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "supplierCode" TEXT,
  "supplierName" TEXT NOT NULL,
  "supplierProductCode" TEXT,
  "costP" DOUBLE PRECISION NOT NULL,
  "costT" DOUBLE PRECISION NOT NULL,
  "freightCost" DOUBLE PRECISION,
  "currency" TEXT NOT NULL DEFAULT 'TRY',
  "exchangeRate" DOUBLE PRECISION,
  "vatIncluded" BOOLEAN NOT NULL DEFAULT false,
  "vatRate" DOUBLE PRECISION,
  "unit" TEXT,
  "unitFactor" DOUBLE PRECISION,
  "normalizedCostP" DOUBLE PRECISION NOT NULL,
  "normalizedCostT" DOUBLE PRECISION NOT NULL,
  "totalUnitCostP" DOUBLE PRECISION NOT NULL,
  "totalLineCostP" DOUBLE PRECISION,
  "leadTimeDays" INTEGER,
  "validUntil" TIMESTAMP(3),
  "quoteDate" TIMESTAMP(3),
  "note" TEXT,
  "attachmentUrl" TEXT,
  "createdById" TEXT,
  "createdByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TenderCostOffer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TenderCostNote" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "authorId" TEXT,
  "authorName" TEXT,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TenderCostNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TenderCostRequest_requestNo_key" ON "TenderCostRequest"("requestNo");
CREATE INDEX IF NOT EXISTS "TenderCostRequest_status_idx" ON "TenderCostRequest"("status");
CREATE INDEX IF NOT EXISTS "TenderCostRequest_priority_idx" ON "TenderCostRequest"("priority");
CREATE INDEX IF NOT EXISTS "TenderCostRequest_customerCode_idx" ON "TenderCostRequest"("customerCode");
CREATE INDEX IF NOT EXISTS "TenderCostRequest_createdById_createdAt_idx" ON "TenderCostRequest"("createdById", "createdAt");
CREATE INDEX IF NOT EXISTS "TenderCostRequest_deadline_idx" ON "TenderCostRequest"("deadline");
CREATE INDEX IF NOT EXISTS "TenderCostItem_requestId_idx" ON "TenderCostItem"("requestId");
CREATE INDEX IF NOT EXISTS "TenderCostItem_productCode_idx" ON "TenderCostItem"("productCode");
CREATE INDEX IF NOT EXISTS "TenderCostOffer_itemId_idx" ON "TenderCostOffer"("itemId");
CREATE INDEX IF NOT EXISTS "TenderCostOffer_supplierCode_idx" ON "TenderCostOffer"("supplierCode");
CREATE INDEX IF NOT EXISTS "TenderCostOffer_supplierName_idx" ON "TenderCostOffer"("supplierName");
CREATE INDEX IF NOT EXISTS "TenderCostOffer_createdAt_idx" ON "TenderCostOffer"("createdAt");
CREATE INDEX IF NOT EXISTS "TenderCostNote_requestId_createdAt_idx" ON "TenderCostNote"("requestId", "createdAt");
CREATE INDEX IF NOT EXISTS "TenderCostNote_authorId_idx" ON "TenderCostNote"("authorId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TenderCostItem_requestId_fkey'
  ) THEN
    ALTER TABLE "TenderCostItem"
      ADD CONSTRAINT "TenderCostItem_requestId_fkey"
      FOREIGN KEY ("requestId") REFERENCES "TenderCostRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TenderCostOffer_itemId_fkey'
  ) THEN
    ALTER TABLE "TenderCostOffer"
      ADD CONSTRAINT "TenderCostOffer_itemId_fkey"
      FOREIGN KEY ("itemId") REFERENCES "TenderCostItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TenderCostNote_requestId_fkey'
  ) THEN
    ALTER TABLE "TenderCostNote"
      ADD CONSTRAINT "TenderCostNote_requestId_fkey"
      FOREIGN KEY ("requestId") REFERENCES "TenderCostRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
