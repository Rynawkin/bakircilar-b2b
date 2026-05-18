-- Price freshness confirmation workflow between sales and purchasing.
CREATE TABLE "PriceVerificationRequest" (
  "id" TEXT NOT NULL,
  "requestNo" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'EXISTING_PRODUCT',
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "productId" TEXT,
  "productCode" TEXT,
  "productName" TEXT NOT NULL,
  "unit" TEXT,
  "quantity" DOUBLE PRECISION,
  "customerId" TEXT,
  "customerCode" TEXT,
  "customerName" TEXT,
  "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
  "sourceRef" TEXT,
  "sourceUrl" TEXT,
  "currentUnitPrice" DOUBLE PRECISION,
  "currentCost" DOUBLE PRECISION,
  "currentCostDate" TIMESTAMP(3),
  "stockCreatePayload" JSONB,
  "selectedOfferId" TEXT,
  "selectedSupplierCostId" TEXT,
  "salesNote" TEXT,
  "procurementNote" TEXT,
  "salesDecisionNote" TEXT,
  "createdById" TEXT,
  "createdByName" TEXT,
  "assignedToId" TEXT,
  "submittedToSalesAt" TIMESTAMP(3),
  "salesApprovedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PriceVerificationRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PriceVerificationOffer" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "supplierCode" TEXT,
  "supplierName" TEXT NOT NULL,
  "supplierProductCode" TEXT,
  "costP" DOUBLE PRECISION NOT NULL,
  "costT" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'TRY',
  "exchangeRate" DOUBLE PRECISION,
  "vatIncluded" BOOLEAN NOT NULL DEFAULT false,
  "vatRate" DOUBLE PRECISION,
  "unit" TEXT,
  "unitFactor" DOUBLE PRECISION,
  "normalizedCostP" DOUBLE PRECISION NOT NULL,
  "normalizedCostT" DOUBLE PRECISION NOT NULL,
  "minOrderQuantity" DOUBLE PRECISION,
  "leadTimeDays" INTEGER,
  "validUntil" TIMESTAMP(3),
  "quoteDate" TIMESTAMP(3),
  "note" TEXT,
  "attachmentUrl" TEXT,
  "supplierCostId" TEXT,
  "createdById" TEXT,
  "createdByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PriceVerificationOffer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PriceVerificationNote" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "authorId" TEXT,
  "authorName" TEXT,
  "body" TEXT NOT NULL,
  "visibility" TEXT NOT NULL DEFAULT 'INTERNAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PriceVerificationNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PriceVerificationRequest_requestNo_key" ON "PriceVerificationRequest"("requestNo");
CREATE INDEX "PriceVerificationRequest_type_idx" ON "PriceVerificationRequest"("type");
CREATE INDEX "PriceVerificationRequest_status_idx" ON "PriceVerificationRequest"("status");
CREATE INDEX "PriceVerificationRequest_priority_idx" ON "PriceVerificationRequest"("priority");
CREATE INDEX "PriceVerificationRequest_productCode_idx" ON "PriceVerificationRequest"("productCode");
CREATE INDEX "PriceVerificationRequest_customerCode_idx" ON "PriceVerificationRequest"("customerCode");
CREATE INDEX "PriceVerificationRequest_createdById_createdAt_idx" ON "PriceVerificationRequest"("createdById", "createdAt");
CREATE INDEX "PriceVerificationRequest_assignedToId_idx" ON "PriceVerificationRequest"("assignedToId");
CREATE INDEX "PriceVerificationOffer_requestId_idx" ON "PriceVerificationOffer"("requestId");
CREATE INDEX "PriceVerificationOffer_supplierCode_idx" ON "PriceVerificationOffer"("supplierCode");
CREATE INDEX "PriceVerificationOffer_supplierName_idx" ON "PriceVerificationOffer"("supplierName");
CREATE INDEX "PriceVerificationOffer_createdAt_idx" ON "PriceVerificationOffer"("createdAt");
CREATE INDEX "PriceVerificationNote_requestId_createdAt_idx" ON "PriceVerificationNote"("requestId", "createdAt");
CREATE INDEX "PriceVerificationNote_authorId_idx" ON "PriceVerificationNote"("authorId");

ALTER TABLE "PriceVerificationOffer"
  ADD CONSTRAINT "PriceVerificationOffer_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "PriceVerificationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PriceVerificationNote"
  ADD CONSTRAINT "PriceVerificationNote_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "PriceVerificationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
