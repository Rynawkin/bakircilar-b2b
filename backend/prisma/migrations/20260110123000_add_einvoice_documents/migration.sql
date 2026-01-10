-- CreateEnum
CREATE TYPE "EInvoiceMatchStatus" AS ENUM ('MATCHED', 'PARTIAL', 'NOT_FOUND');

-- CreateTable
CREATE TABLE "EInvoiceDocument" (
    "id" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "evrakSeri" TEXT,
    "evrakSira" INTEGER,
    "eInvoiceUuid" TEXT,
    "customerCode" TEXT,
    "customerName" TEXT,
    "customerId" TEXT,
    "issueDate" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "subtotalAmount" DOUBLE PRECISION,
    "totalAmount" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "matchStatus" "EInvoiceMatchStatus" NOT NULL DEFAULT 'MATCHED',
    "matchError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EInvoiceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EInvoiceDocument_invoiceNo_key" ON "EInvoiceDocument"("invoiceNo");

-- CreateIndex
CREATE INDEX "EInvoiceDocument_customerId_idx" ON "EInvoiceDocument"("customerId");

-- CreateIndex
CREATE INDEX "EInvoiceDocument_customerCode_idx" ON "EInvoiceDocument"("customerCode");

-- CreateIndex
CREATE INDEX "EInvoiceDocument_issueDate_idx" ON "EInvoiceDocument"("issueDate");

-- CreateIndex
CREATE INDEX "EInvoiceDocument_sentAt_idx" ON "EInvoiceDocument"("sentAt");

-- CreateIndex
CREATE INDEX "EInvoiceDocument_matchStatus_idx" ON "EInvoiceDocument"("matchStatus");

-- AddForeignKey
ALTER TABLE "EInvoiceDocument" ADD CONSTRAINT "EInvoiceDocument_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EInvoiceDocument" ADD CONSTRAINT "EInvoiceDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
