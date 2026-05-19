CREATE TYPE "HotSaleSessionStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');
CREATE TYPE "HotSaleStockMovementType" AS ENUM ('LOAD', 'SALE', 'ORDER_RESERVE', 'RETURN_TO_DEPOT', 'KEEP_ON_VEHICLE', 'ADJUSTMENT', 'FIRE', 'COUNT');
CREATE TYPE "HotSaleTransactionType" AS ENUM ('CASH_INVOICE', 'INVOICED_DISPATCH', 'ORDER', 'ORDER_DELIVERY');
CREATE TYPE "HotSaleTransactionStatus" AS ENUM ('COMPLETED', 'SYNC_FAILED', 'CANCELLED');
CREATE TYPE "HotSalePaymentType" AS ENUM ('CASH', 'CARD', 'TRANSFER', 'OPEN_ACCOUNT', 'MIXED');
CREATE TYPE "HotSaleClosureAction" AS ENUM ('KEEP_ON_VEHICLE', 'RETURN_TO_DEPOT');

CREATE TABLE "HotSaleVehicle" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "plate" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "hotWarehouseNo" INTEGER NOT NULL DEFAULT 11,
  "defaultSourceWarehouseNo" INTEGER NOT NULL DEFAULT 1,
  "defaultInvoiceSeries" TEXT NOT NULL DEFAULT 'SICAK',
  "defaultDispatchSeries" TEXT NOT NULL DEFAULT 'SICAK',
  "defaultOrderSeries" TEXT NOT NULL DEFAULT 'SICAK',
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HotSaleVehicle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HotSaleSession" (
  "id" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "HotSaleSessionStatus" NOT NULL DEFAULT 'OPEN',
  "hotWarehouseNo" INTEGER NOT NULL DEFAULT 11,
  "sourceWarehouseNo" INTEGER NOT NULL DEFAULT 1,
  "openingCash" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "closingCash" DOUBLE PRECISION,
  "expectedCash" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cashDifference" DOUBLE PRECISION,
  "startKm" DOUBLE PRECISION,
  "endKm" DOUBLE PRECISION,
  "startLatitude" DOUBLE PRECISION,
  "startLongitude" DOUBLE PRECISION,
  "endLatitude" DOUBLE PRECISION,
  "endLongitude" DOUBLE PRECISION,
  "loadDocumentNo" TEXT,
  "returnDocumentNo" TEXT,
  "note" TEXT,
  "closeNote" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HotSaleSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HotSaleStockLedger" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "transactionId" TEXT,
  "type" "HotSaleStockMovementType" NOT NULL,
  "productCode" TEXT NOT NULL,
  "productName" TEXT,
  "unit" TEXT,
  "quantity" DOUBLE PRECISION NOT NULL,
  "sourceWarehouseNo" INTEGER,
  "targetWarehouseNo" INTEGER,
  "documentNo" TEXT,
  "note" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HotSaleStockLedger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HotSaleTransaction" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "type" "HotSaleTransactionType" NOT NULL,
  "status" "HotSaleTransactionStatus" NOT NULL DEFAULT 'COMPLETED',
  "customerId" TEXT,
  "customerCode" TEXT,
  "customerName" TEXT,
  "paymentType" "HotSalePaymentType" NOT NULL DEFAULT 'CASH',
  "priceListNo" INTEGER,
  "documentNo" TEXT,
  "mikroDocumentNo" TEXT,
  "linkedOrderId" TEXT,
  "linkedOrderNumber" TEXT,
  "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "note" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "syncError" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HotSaleTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HotSaleTransactionItem" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "productId" TEXT,
  "productCode" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "unit" TEXT,
  "quantity" DOUBLE PRECISION NOT NULL,
  "unitPrice" DOUBLE PRECISION NOT NULL,
  "totalPrice" DOUBLE PRECISION NOT NULL,
  "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "priceListNo" INTEGER,
  "priceType" "PriceType",
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HotSaleTransactionItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HotSalePayment" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "type" "HotSalePaymentType" NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "referenceNo" TEXT,
  "note" TEXT,
  "receiptPhotoUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HotSalePayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HotSaleClosingCount" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "productCode" TEXT NOT NULL,
  "productName" TEXT,
  "unit" TEXT,
  "expectedQty" DOUBLE PRECISION NOT NULL,
  "countedQty" DOUBLE PRECISION NOT NULL,
  "differenceQty" DOUBLE PRECISION NOT NULL,
  "action" "HotSaleClosureAction" NOT NULL,
  "returnQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "keepQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HotSaleClosingCount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HotSaleVehicle_plate_key" ON "HotSaleVehicle"("plate");
CREATE INDEX "HotSaleVehicle_active_idx" ON "HotSaleVehicle"("active");
CREATE INDEX "HotSaleVehicle_name_idx" ON "HotSaleVehicle"("name");
CREATE INDEX "HotSaleSession_vehicleId_status_idx" ON "HotSaleSession"("vehicleId", "status");
CREATE INDEX "HotSaleSession_userId_status_idx" ON "HotSaleSession"("userId", "status");
CREATE INDEX "HotSaleSession_startedAt_idx" ON "HotSaleSession"("startedAt");
CREATE INDEX "HotSaleStockLedger_sessionId_idx" ON "HotSaleStockLedger"("sessionId");
CREATE INDEX "HotSaleStockLedger_vehicleId_idx" ON "HotSaleStockLedger"("vehicleId");
CREATE INDEX "HotSaleStockLedger_productCode_idx" ON "HotSaleStockLedger"("productCode");
CREATE INDEX "HotSaleStockLedger_type_idx" ON "HotSaleStockLedger"("type");
CREATE INDEX "HotSaleStockLedger_createdAt_idx" ON "HotSaleStockLedger"("createdAt");
CREATE INDEX "HotSaleTransaction_sessionId_idx" ON "HotSaleTransaction"("sessionId");
CREATE INDEX "HotSaleTransaction_customerId_idx" ON "HotSaleTransaction"("customerId");
CREATE INDEX "HotSaleTransaction_customerCode_idx" ON "HotSaleTransaction"("customerCode");
CREATE INDEX "HotSaleTransaction_type_idx" ON "HotSaleTransaction"("type");
CREATE INDEX "HotSaleTransaction_status_idx" ON "HotSaleTransaction"("status");
CREATE INDEX "HotSaleTransaction_createdAt_idx" ON "HotSaleTransaction"("createdAt");
CREATE INDEX "HotSaleTransactionItem_transactionId_idx" ON "HotSaleTransactionItem"("transactionId");
CREATE INDEX "HotSaleTransactionItem_productCode_idx" ON "HotSaleTransactionItem"("productCode");
CREATE INDEX "HotSalePayment_transactionId_idx" ON "HotSalePayment"("transactionId");
CREATE INDEX "HotSalePayment_type_idx" ON "HotSalePayment"("type");
CREATE INDEX "HotSaleClosingCount_sessionId_idx" ON "HotSaleClosingCount"("sessionId");
CREATE INDEX "HotSaleClosingCount_productCode_idx" ON "HotSaleClosingCount"("productCode");

ALTER TABLE "HotSaleSession" ADD CONSTRAINT "HotSaleSession_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "HotSaleVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HotSaleSession" ADD CONSTRAINT "HotSaleSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HotSaleStockLedger" ADD CONSTRAINT "HotSaleStockLedger_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "HotSaleSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HotSaleStockLedger" ADD CONSTRAINT "HotSaleStockLedger_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "HotSaleVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HotSaleStockLedger" ADD CONSTRAINT "HotSaleStockLedger_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "HotSaleTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HotSaleStockLedger" ADD CONSTRAINT "HotSaleStockLedger_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HotSaleTransaction" ADD CONSTRAINT "HotSaleTransaction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "HotSaleSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HotSaleTransaction" ADD CONSTRAINT "HotSaleTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HotSaleTransaction" ADD CONSTRAINT "HotSaleTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HotSaleTransactionItem" ADD CONSTRAINT "HotSaleTransactionItem_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "HotSaleTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HotSaleTransactionItem" ADD CONSTRAINT "HotSaleTransactionItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HotSalePayment" ADD CONSTRAINT "HotSalePayment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "HotSaleTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HotSaleClosingCount" ADD CONSTRAINT "HotSaleClosingCount_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "HotSaleSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
