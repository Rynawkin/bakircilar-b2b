-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('PENDING_APPROVAL', 'SENT_TO_MIKRO', 'REJECTED', 'CUSTOMER_ACCEPTED', 'CUSTOMER_REJECTED');

-- CreateEnum
CREATE TYPE "QuotePriceSource" AS ENUM ('LAST_SALE', 'PRICE_LIST', 'MANUAL');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "quoteLastSalesCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "User" ADD COLUMN "quoteWhatsappTemplate" TEXT;

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "customerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "adminUserId" TEXT,
    "note" TEXT,
    "validityDate" TIMESTAMP(3) NOT NULL,
    "vatZeroed" BOOLEAN NOT NULL DEFAULT false,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "totalVat" DOUBLE PRECISION NOT NULL,
    "grandTotal" DOUBLE PRECISION NOT NULL,
    "mikroNumber" TEXT,
    "mikroGuid" TEXT,
    "mikroUpdatedAt" TIMESTAMP(3),
    "adminNote" TEXT,
    "adminActionAt" TIMESTAMP(3),
    "customerRespondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "productId" TEXT,
    "productCode" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "priceSource" "QuotePriceSource" NOT NULL,
    "priceListNo" INTEGER,
    "priceType" "PriceType" NOT NULL DEFAULT 'INVOICED',
    "vatRate" DOUBLE PRECISION NOT NULL,
    "vatZeroed" BOOLEAN NOT NULL DEFAULT false,
    "isManualLine" BOOLEAN NOT NULL DEFAULT false,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "blockedReason" TEXT,
    "sourceSaleDate" TIMESTAMP(3),
    "sourceSalePrice" DOUBLE PRECISION,
    "sourceSaleQuantity" DOUBLE PRECISION,
    "sourceSaleVatZeroed" BOOLEAN,
    "lineDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Quote_quoteNumber_key" ON "Quote"("quoteNumber");

-- CreateIndex
CREATE INDEX "Quote_customerId_idx" ON "Quote"("customerId");

-- CreateIndex
CREATE INDEX "Quote_createdById_idx" ON "Quote"("createdById");

-- CreateIndex
CREATE INDEX "Quote_status_idx" ON "Quote"("status");

-- CreateIndex
CREATE INDEX "Quote_mikroNumber_idx" ON "Quote"("mikroNumber");

-- CreateIndex
CREATE INDEX "QuoteItem_quoteId_idx" ON "QuoteItem"("quoteId");

-- CreateIndex
CREATE INDEX "QuoteItem_productId_idx" ON "QuoteItem"("productId");

-- CreateIndex
CREATE INDEX "QuoteItem_productCode_idx" ON "QuoteItem"("productCode");

-- CreateIndex
CREATE INDEX "QuoteItem_priceSource_idx" ON "QuoteItem"("priceSource");

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
