-- CreateEnum
CREATE TYPE "WarehouseImageIssueStatus" AS ENUM ('OPEN', 'REVIEWED', 'FIXED');

-- CreateTable
CREATE TABLE "WarehouseImageIssueReport" (
  "id" TEXT NOT NULL,
  "mikroOrderNumber" TEXT NOT NULL,
  "orderSeries" TEXT,
  "customerCode" TEXT,
  "customerName" TEXT,
  "lineKey" TEXT NOT NULL,
  "rowNumber" INTEGER,
  "productCode" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "imageUrl" TEXT,
  "note" TEXT,
  "status" "WarehouseImageIssueStatus" NOT NULL DEFAULT 'OPEN',
  "reporterUserId" TEXT,
  "reporterName" TEXT,
  "reviewedByUserId" TEXT,
  "reviewedByName" TEXT,
  "reviewNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WarehouseImageIssueReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WarehouseImageIssueReport_mikroOrderNumber_idx" ON "WarehouseImageIssueReport"("mikroOrderNumber");

-- CreateIndex
CREATE INDEX "WarehouseImageIssueReport_lineKey_idx" ON "WarehouseImageIssueReport"("lineKey");

-- CreateIndex
CREATE INDEX "WarehouseImageIssueReport_productCode_idx" ON "WarehouseImageIssueReport"("productCode");

-- CreateIndex
CREATE INDEX "WarehouseImageIssueReport_status_idx" ON "WarehouseImageIssueReport"("status");

-- CreateIndex
CREATE INDEX "WarehouseImageIssueReport_createdAt_idx" ON "WarehouseImageIssueReport"("createdAt");
