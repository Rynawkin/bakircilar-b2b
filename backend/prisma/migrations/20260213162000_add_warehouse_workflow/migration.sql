-- CreateEnum
CREATE TYPE "WarehouseWorkflowStatus" AS ENUM (
  'PENDING',
  'PICKING',
  'READY_FOR_LOADING',
  'PARTIALLY_LOADED',
  'LOADED',
  'DISPATCHED'
);

-- CreateEnum
CREATE TYPE "WarehouseWorkflowItemStatus" AS ENUM (
  'PENDING',
  'PICKED',
  'PARTIAL',
  'MISSING',
  'EXTRA'
);

-- CreateTable
CREATE TABLE "WarehouseOrderWorkflow" (
  "id" TEXT NOT NULL,
  "mikroOrderNumber" TEXT NOT NULL,
  "orderSeries" TEXT NOT NULL,
  "orderSequence" INTEGER NOT NULL,
  "customerCode" TEXT NOT NULL,
  "customerName" TEXT NOT NULL,
  "status" "WarehouseWorkflowStatus" NOT NULL DEFAULT 'PENDING',
  "assignedPickerUserId" TEXT,
  "startedAt" TIMESTAMP(3),
  "loadingStartedAt" TIMESTAMP(3),
  "loadedAt" TIMESTAMP(3),
  "dispatchedAt" TIMESTAMP(3),
  "lastActionAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WarehouseOrderWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseOrderWorkflowItem" (
  "id" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "lineKey" TEXT NOT NULL,
  "rowNumber" INTEGER,
  "productCode" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "requestedQty" DOUBLE PRECISION NOT NULL,
  "deliveredQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "remainingQty" DOUBLE PRECISION NOT NULL,
  "pickedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "extraQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "shortageQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "vat" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "stockSnapshot" DOUBLE PRECISION,
  "imageUrl" TEXT,
  "shelfCode" TEXT,
  "status" "WarehouseWorkflowItemStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WarehouseOrderWorkflowItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseShelfLocation" (
  "id" TEXT NOT NULL,
  "productCode" TEXT NOT NULL,
  "shelfCode" TEXT NOT NULL,
  "note" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WarehouseShelfLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseOrderWorkflow_mikroOrderNumber_key" ON "WarehouseOrderWorkflow"("mikroOrderNumber");

-- CreateIndex
CREATE INDEX "WarehouseOrderWorkflow_orderSeries_idx" ON "WarehouseOrderWorkflow"("orderSeries");

-- CreateIndex
CREATE INDEX "WarehouseOrderWorkflow_status_idx" ON "WarehouseOrderWorkflow"("status");

-- CreateIndex
CREATE INDEX "WarehouseOrderWorkflow_customerCode_idx" ON "WarehouseOrderWorkflow"("customerCode");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseOrderWorkflowItem_workflowId_lineKey_key" ON "WarehouseOrderWorkflowItem"("workflowId", "lineKey");

-- CreateIndex
CREATE INDEX "WarehouseOrderWorkflowItem_workflowId_status_idx" ON "WarehouseOrderWorkflowItem"("workflowId", "status");

-- CreateIndex
CREATE INDEX "WarehouseOrderWorkflowItem_productCode_idx" ON "WarehouseOrderWorkflowItem"("productCode");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseShelfLocation_productCode_key" ON "WarehouseShelfLocation"("productCode");

-- CreateIndex
CREATE INDEX "WarehouseShelfLocation_shelfCode_idx" ON "WarehouseShelfLocation"("shelfCode");

-- AddForeignKey
ALTER TABLE "WarehouseOrderWorkflowItem"
ADD CONSTRAINT "WarehouseOrderWorkflowItem_workflowId_fkey"
FOREIGN KEY ("workflowId")
REFERENCES "WarehouseOrderWorkflow"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
