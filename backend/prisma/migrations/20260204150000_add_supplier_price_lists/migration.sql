-- Add foreignName to Product
ALTER TABLE "Product" ADD COLUMN "foreignName" TEXT;

CREATE INDEX "Product_foreignName_idx" ON "Product"("foreignName");

-- Create enum for supplier price list uploads
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupplierPriceListStatus') THEN
    CREATE TYPE "SupplierPriceListStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
  END IF;
END$$;

-- Create Supplier table
CREATE TABLE "Supplier" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "discount1" DOUBLE PRECISION,
  "discount2" DOUBLE PRECISION,
  "discount3" DOUBLE PRECISION,
  "discount4" DOUBLE PRECISION,
  "discount5" DOUBLE PRECISION,
  "priceIsNet" BOOLEAN NOT NULL DEFAULT false,
  "priceIncludesVat" BOOLEAN NOT NULL DEFAULT false,
  "defaultVatRate" DOUBLE PRECISION,
  "excelSheetName" TEXT,
  "excelHeaderRow" INTEGER,
  "excelCodeHeader" TEXT,
  "excelNameHeader" TEXT,
  "excelPriceHeader" TEXT,
  "pdfPriceIndex" INTEGER,
  "pdfCodePattern" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

-- Create SupplierPriceListUpload table
CREATE TABLE "SupplierPriceListUpload" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "status" "SupplierPriceListStatus" NOT NULL DEFAULT 'PENDING',
  "fileCount" INTEGER NOT NULL DEFAULT 0,
  "totalItems" INTEGER NOT NULL DEFAULT 0,
  "matchedItems" INTEGER NOT NULL DEFAULT 0,
  "unmatchedItems" INTEGER NOT NULL DEFAULT 0,
  "multiMatchItems" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "details" JSONB,
  CONSTRAINT "SupplierPriceListUpload_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierPriceListUpload_supplierId_idx" ON "SupplierPriceListUpload"("supplierId");
CREATE INDEX "SupplierPriceListUpload_uploadedById_idx" ON "SupplierPriceListUpload"("uploadedById");
CREATE INDEX "SupplierPriceListUpload_createdAt_idx" ON "SupplierPriceListUpload"("createdAt");

ALTER TABLE "SupplierPriceListUpload"
  ADD CONSTRAINT "SupplierPriceListUpload_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SupplierPriceListUpload"
  ADD CONSTRAINT "SupplierPriceListUpload_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create SupplierPriceListFile table
CREATE TABLE "SupplierPriceListFile" (
  "id" TEXT NOT NULL,
  "uploadId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "storagePath" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierPriceListFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierPriceListFile_uploadId_idx" ON "SupplierPriceListFile"("uploadId");

ALTER TABLE "SupplierPriceListFile"
  ADD CONSTRAINT "SupplierPriceListFile_uploadId_fkey"
  FOREIGN KEY ("uploadId") REFERENCES "SupplierPriceListUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create SupplierPriceListItem table
CREATE TABLE "SupplierPriceListItem" (
  "id" TEXT NOT NULL,
  "uploadId" TEXT NOT NULL,
  "supplierCode" TEXT NOT NULL,
  "supplierName" TEXT,
  "sourcePrice" DOUBLE PRECISION,
  "netPrice" DOUBLE PRECISION,
  "priceCurrency" TEXT,
  "priceIncludesVat" BOOLEAN NOT NULL DEFAULT false,
  "rawLine" TEXT,
  "matchCount" INTEGER NOT NULL DEFAULT 0,
  "matchedProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierPriceListItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierPriceListItem_uploadId_idx" ON "SupplierPriceListItem"("uploadId");
CREATE INDEX "SupplierPriceListItem_supplierCode_idx" ON "SupplierPriceListItem"("supplierCode");

ALTER TABLE "SupplierPriceListItem"
  ADD CONSTRAINT "SupplierPriceListItem_uploadId_fkey"
  FOREIGN KEY ("uploadId") REFERENCES "SupplierPriceListUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create SupplierPriceListMatch table
CREATE TABLE "SupplierPriceListMatch" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productCode" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "currentCost" DOUBLE PRECISION,
  "vatRate" DOUBLE PRECISION,
  "netPrice" DOUBLE PRECISION,
  "costDifference" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierPriceListMatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierPriceListMatch_itemId_idx" ON "SupplierPriceListMatch"("itemId");
CREATE INDEX "SupplierPriceListMatch_productId_idx" ON "SupplierPriceListMatch"("productId");

ALTER TABLE "SupplierPriceListMatch"
  ADD CONSTRAINT "SupplierPriceListMatch_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "SupplierPriceListItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierPriceListMatch"
  ADD CONSTRAINT "SupplierPriceListMatch_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
