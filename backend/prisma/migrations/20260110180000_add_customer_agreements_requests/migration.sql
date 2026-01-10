-- CreateEnum
CREATE TYPE "PriceVisibility" AS ENUM ('INVOICED_ONLY', 'WHITE_ONLY', 'BOTH');

-- CreateEnum
CREATE TYPE "PriceMode" AS ENUM ('LIST', 'EXCESS');

-- CreateEnum
CREATE TYPE "CustomerRequestStatus" AS ENUM ('PENDING', 'CONVERTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CustomerRequestItemStatus" AS ENUM ('PENDING', 'CONVERTED', 'REJECTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "parentCustomerId" TEXT,
ADD COLUMN     "priceVisibility" "PriceVisibility" NOT NULL DEFAULT 'INVOICED_ONLY';

-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "priceMode" "PriceMode" NOT NULL DEFAULT 'LIST';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "requestedById" TEXT;

-- CreateTable
CREATE TABLE "CustomerPriceAgreement" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "priceInvoiced" DOUBLE PRECISION NOT NULL,
    "priceWhite" DOUBLE PRECISION NOT NULL,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerPriceAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerRequest" (
    "id" TEXT NOT NULL,
    "parentCustomerId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "convertedById" TEXT,
    "status" "CustomerRequestStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "convertedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerRequestItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "CustomerRequestItemStatus" NOT NULL DEFAULT 'PENDING',
    "priceMode" "PriceMode" NOT NULL DEFAULT 'LIST',
    "selectedPriceType" "PriceType",
    "selectedUnitPrice" DOUBLE PRECISION,
    "selectedTotalPrice" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerPriceAgreement_customerId_idx" ON "CustomerPriceAgreement"("customerId");

-- CreateIndex
CREATE INDEX "CustomerPriceAgreement_productId_idx" ON "CustomerPriceAgreement"("productId");

-- CreateIndex
CREATE INDEX "CustomerPriceAgreement_validFrom_idx" ON "CustomerPriceAgreement"("validFrom");

-- CreateIndex
CREATE INDEX "CustomerPriceAgreement_validTo_idx" ON "CustomerPriceAgreement"("validTo");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPriceAgreement_customerId_productId_key" ON "CustomerPriceAgreement"("customerId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerRequest_orderId_key" ON "CustomerRequest"("orderId");

-- CreateIndex
CREATE INDEX "CustomerRequest_parentCustomerId_idx" ON "CustomerRequest"("parentCustomerId");

-- CreateIndex
CREATE INDEX "CustomerRequest_requestedById_idx" ON "CustomerRequest"("requestedById");

-- CreateIndex
CREATE INDEX "CustomerRequest_status_idx" ON "CustomerRequest"("status");

-- CreateIndex
CREATE INDEX "CustomerRequest_orderId_idx" ON "CustomerRequest"("orderId");

-- CreateIndex
CREATE INDEX "CustomerRequestItem_requestId_idx" ON "CustomerRequestItem"("requestId");

-- CreateIndex
CREATE INDEX "CustomerRequestItem_productId_idx" ON "CustomerRequestItem"("productId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_parentCustomerId_fkey" FOREIGN KEY ("parentCustomerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPriceAgreement" ADD CONSTRAINT "CustomerPriceAgreement_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPriceAgreement" ADD CONSTRAINT "CustomerPriceAgreement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRequest" ADD CONSTRAINT "CustomerRequest_parentCustomerId_fkey" FOREIGN KEY ("parentCustomerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRequest" ADD CONSTRAINT "CustomerRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRequest" ADD CONSTRAINT "CustomerRequest_convertedById_fkey" FOREIGN KEY ("convertedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRequest" ADD CONSTRAINT "CustomerRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRequestItem" ADD CONSTRAINT "CustomerRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CustomerRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRequestItem" ADD CONSTRAINT "CustomerRequestItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

