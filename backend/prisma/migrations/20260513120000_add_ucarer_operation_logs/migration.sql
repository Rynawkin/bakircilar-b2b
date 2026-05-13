CREATE TABLE "UcarerOperationLog" (
  "id" TEXT NOT NULL,
  "operationType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "productCode" TEXT,
  "productName" TEXT,
  "familyId" TEXT,
  "familyName" TEXT,
  "depot" TEXT,
  "supplierCode" TEXT,
  "supplierName" TEXT,
  "documentNo" TEXT,
  "orderNumbers" JSONB NOT NULL DEFAULT '[]',
  "previousValues" JSONB,
  "newValues" JSONB,
  "metadata" JSONB,
  "userId" TEXT,
  "userName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UcarerOperationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UcarerOperationLog_operationType_idx" ON "UcarerOperationLog"("operationType");
CREATE INDEX "UcarerOperationLog_productCode_idx" ON "UcarerOperationLog"("productCode");
CREATE INDEX "UcarerOperationLog_familyId_idx" ON "UcarerOperationLog"("familyId");
CREATE INDEX "UcarerOperationLog_userId_idx" ON "UcarerOperationLog"("userId");
CREATE INDEX "UcarerOperationLog_createdAt_idx" ON "UcarerOperationLog"("createdAt");
