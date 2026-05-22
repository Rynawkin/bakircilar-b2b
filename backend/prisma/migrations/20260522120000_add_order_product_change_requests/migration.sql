-- Order product change approvals for Ucarer depot redirect suggestions.
CREATE TABLE "OrderProductChangeRequest" (
  "id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "source" TEXT NOT NULL DEFAULT 'UCARER_DEPOT',
  "depot" TEXT,
  "orderNumber" TEXT NOT NULL,
  "orderSeries" TEXT NOT NULL,
  "orderSequence" INTEGER NOT NULL,
  "orderLineNo" INTEGER NOT NULL,
  "mikroLineGuid" TEXT,
  "orderDate" TIMESTAMP(3),
  "customerCode" TEXT,
  "customerName" TEXT,
  "sourceProductCode" TEXT NOT NULL,
  "sourceProductName" TEXT,
  "targetProductCode" TEXT NOT NULL,
  "targetProductName" TEXT,
  "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "remainingQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "vatRate" DOUBLE PRECISION,
  "sourceCurrentCost" DOUBLE PRECISION,
  "sourceLastEntryCost" DOUBLE PRECISION,
  "sourceCurrentMarginPercent" DOUBLE PRECISION,
  "sourceLastEntryMarginPercent" DOUBLE PRECISION,
  "targetCurrentCost" DOUBLE PRECISION,
  "targetLastEntryCost" DOUBLE PRECISION,
  "targetCurrentMarginPercent" DOUBLE PRECISION,
  "targetLastEntryMarginPercent" DOUBLE PRECISION,
  "familyId" TEXT,
  "familyCode" TEXT,
  "familyName" TEXT,
  "note" TEXT,
  "rejectReason" TEXT,
  "requestedById" TEXT,
  "assignedToId" TEXT,
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "failedReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OrderProductChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderProductChangeRequest_status_createdAt_idx" ON "OrderProductChangeRequest"("status", "createdAt");
CREATE INDEX "OrderProductChangeRequest_assignedToId_status_idx" ON "OrderProductChangeRequest"("assignedToId", "status");
CREATE INDEX "OrderProductChangeRequest_orderNumber_idx" ON "OrderProductChangeRequest"("orderNumber");
CREATE INDEX "OrderProductChangeRequest_sourceProductCode_idx" ON "OrderProductChangeRequest"("sourceProductCode");
CREATE INDEX "OrderProductChangeRequest_targetProductCode_idx" ON "OrderProductChangeRequest"("targetProductCode");
CREATE INDEX "OrderProductChangeRequest_customerCode_idx" ON "OrderProductChangeRequest"("customerCode");

ALTER TABLE "OrderProductChangeRequest"
  ADD CONSTRAINT "OrderProductChangeRequest_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderProductChangeRequest"
  ADD CONSTRAINT "OrderProductChangeRequest_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderProductChangeRequest"
  ADD CONSTRAINT "OrderProductChangeRequest_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
