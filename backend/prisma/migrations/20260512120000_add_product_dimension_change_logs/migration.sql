CREATE TABLE "ProductDimensionChangeLog" (
  "id" TEXT NOT NULL,
  "productCode" TEXT NOT NULL,
  "productName" TEXT,
  "changedById" TEXT,
  "changedByName" TEXT,
  "oldValues" JSONB NOT NULL,
  "newValues" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProductDimensionChangeLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductDimensionChangeLog_productCode_idx" ON "ProductDimensionChangeLog"("productCode");
CREATE INDEX "ProductDimensionChangeLog_changedById_idx" ON "ProductDimensionChangeLog"("changedById");
CREATE INDEX "ProductDimensionChangeLog_createdAt_idx" ON "ProductDimensionChangeLog"("createdAt");
