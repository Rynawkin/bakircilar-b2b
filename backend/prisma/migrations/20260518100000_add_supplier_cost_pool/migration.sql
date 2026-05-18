CREATE TABLE "SupplierProductCost" (
  "id" TEXT NOT NULL,
  "productId" TEXT,
  "productCode" TEXT NOT NULL,
  "productName" TEXT,
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
  "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
  "attachmentUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "appliedAt" TIMESTAMP(3),
  "appliedById" TEXT,
  "appliedByName" TEXT,
  "createdById" TEXT,
  "createdByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SupplierProductCost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierCostApplicationLog" (
  "id" TEXT NOT NULL,
  "supplierCostId" TEXT,
  "productId" TEXT,
  "productCode" TEXT NOT NULL,
  "productName" TEXT,
  "supplierCode" TEXT,
  "supplierName" TEXT,
  "previousCost" DOUBLE PRECISION,
  "newCostP" DOUBLE PRECISION NOT NULL,
  "newCostT" DOUBLE PRECISION NOT NULL,
  "previousCostDate" TIMESTAMP(3),
  "newCostDate" TIMESTAMP(3) NOT NULL,
  "updatePriceLists" BOOLEAN NOT NULL DEFAULT false,
  "updatedLists" JSONB NOT NULL DEFAULT '[]',
  "missingLists" JSONB NOT NULL DEFAULT '[]',
  "note" TEXT,
  "userId" TEXT,
  "userName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SupplierCostApplicationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierProductCost_productCode_createdAt_idx" ON "SupplierProductCost"("productCode", "createdAt");
CREATE INDEX "SupplierProductCost_supplierCode_idx" ON "SupplierProductCost"("supplierCode");
CREATE INDEX "SupplierProductCost_supplierName_idx" ON "SupplierProductCost"("supplierName");
CREATE INDEX "SupplierProductCost_status_idx" ON "SupplierProductCost"("status");
CREATE INDEX "SupplierProductCost_validUntil_idx" ON "SupplierProductCost"("validUntil");
CREATE INDEX "SupplierProductCost_createdById_idx" ON "SupplierProductCost"("createdById");

CREATE INDEX "SupplierCostApplicationLog_supplierCostId_idx" ON "SupplierCostApplicationLog"("supplierCostId");
CREATE INDEX "SupplierCostApplicationLog_productCode_createdAt_idx" ON "SupplierCostApplicationLog"("productCode", "createdAt");
CREATE INDEX "SupplierCostApplicationLog_supplierCode_idx" ON "SupplierCostApplicationLog"("supplierCode");
CREATE INDEX "SupplierCostApplicationLog_userId_createdAt_idx" ON "SupplierCostApplicationLog"("userId", "createdAt");

ALTER TABLE "SupplierProductCost"
  ADD CONSTRAINT "SupplierProductCost_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupplierCostApplicationLog"
  ADD CONSTRAINT "SupplierCostApplicationLog_supplierCostId_fkey"
  FOREIGN KEY ("supplierCostId") REFERENCES "SupplierProductCost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupplierCostApplicationLog"
  ADD CONSTRAINT "SupplierCostApplicationLog_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
