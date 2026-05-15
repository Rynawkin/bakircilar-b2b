CREATE TABLE "FieldSalesVisitNote" (
  "id" TEXT NOT NULL,
  "customerId" TEXT,
  "customerCode" TEXT NOT NULL,
  "customerName" TEXT,
  "note" TEXT NOT NULL,
  "demand" TEXT,
  "competitorInfo" TEXT,
  "photoUrl" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "createdById" TEXT,
  "createdByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FieldSalesVisitNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FieldSalesVisitNote_customerId_idx" ON "FieldSalesVisitNote"("customerId");
CREATE INDEX "FieldSalesVisitNote_customerCode_idx" ON "FieldSalesVisitNote"("customerCode");
CREATE INDEX "FieldSalesVisitNote_createdById_idx" ON "FieldSalesVisitNote"("createdById");
CREATE INDEX "FieldSalesVisitNote_createdAt_idx" ON "FieldSalesVisitNote"("createdAt");

ALTER TABLE "FieldSalesVisitNote"
  ADD CONSTRAINT "FieldSalesVisitNote_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FieldSalesVisitNote"
  ADD CONSTRAINT "FieldSalesVisitNote_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
