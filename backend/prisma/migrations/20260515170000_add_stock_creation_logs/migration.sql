CREATE TABLE "StockCreationLog" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "rowNo" INTEGER,
  "stockCode" TEXT,
  "stockName" TEXT NOT NULL,
  "templateCode" TEXT,
  "payload" JSONB NOT NULL,
  "validation" JSONB,
  "result" JSONB,
  "errorMessage" TEXT,
  "createdById" TEXT,
  "createdByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StockCreationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StockCreationLog_batchId_idx" ON "StockCreationLog"("batchId");
CREATE INDEX "StockCreationLog_status_idx" ON "StockCreationLog"("status");
CREATE INDEX "StockCreationLog_stockCode_idx" ON "StockCreationLog"("stockCode");
CREATE INDEX "StockCreationLog_createdById_idx" ON "StockCreationLog"("createdById");
CREATE INDEX "StockCreationLog_createdAt_idx" ON "StockCreationLog"("createdAt");
