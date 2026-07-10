CREATE TABLE IF NOT EXISTS "SalesCatalog" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "subtitle" TEXT,
  "coverImageUrl" TEXT,
  "accentColor" TEXT NOT NULL DEFAULT '#15356b',
  "shareToken" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "priceBasis" TEXT NOT NULL DEFAULT 'CURRENT_COST',
  "adjustmentType" TEXT NOT NULL DEFAULT 'MARKUP',
  "adjustmentValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "betweenPercent" DOUBLE PRECISION NOT NULL DEFAULT 50,
  "priceListNo" INTEGER,
  "vatMode" TEXT NOT NULL DEFAULT 'EXCLUDED',
  "roundingMode" TEXT NOT NULL DEFAULT 'NEAREST_1',
  "minimumPriceGuardType" TEXT NOT NULL DEFAULT 'NONE',
  "minimumPriceGuardPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "excludeStaleCosts" BOOLEAN NOT NULL DEFAULT FALSE,
  "minCurrentCostDate" TIMESTAMP(3),
  "hideOutOfStock" BOOLEAN NOT NULL DEFAULT FALSE,
  "hideMissingImage" BOOLEAN NOT NULL DEFAULT FALSE,
  "showStockStatus" BOOLEAN NOT NULL DEFAULT TRUE,
  "showProductCode" BOOLEAN NOT NULL DEFAULT TRUE,
  "showUnit" BOOLEAN NOT NULL DEFAULT TRUE,
  "validFrom" TIMESTAMP(3),
  "validTo" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "pdfDownloadCount" INTEGER NOT NULL DEFAULT 0,
  "lastViewedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdByName" TEXT,
  "updatedById" TEXT,
  "updatedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "SalesCatalogSection" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "catalogId" TEXT NOT NULL REFERENCES "SalesCatalog"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "categoryId" TEXT,
  "categoryName" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "SalesCatalogItem" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "catalogId" TEXT NOT NULL REFERENCES "SalesCatalog"("id") ON DELETE CASCADE,
  "sectionId" TEXT REFERENCES "SalesCatalogSection"("id") ON DELETE SET NULL,
  "productId" TEXT NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "fixedPrice" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesCatalogItem_catalogId_productId_key" UNIQUE ("catalogId", "productId")
);

CREATE INDEX IF NOT EXISTS "SalesCatalog_status_updatedAt_idx" ON "SalesCatalog"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "SalesCatalog_validFrom_validTo_idx" ON "SalesCatalog"("validFrom", "validTo");
CREATE INDEX IF NOT EXISTS "SalesCatalog_createdById_createdAt_idx" ON "SalesCatalog"("createdById", "createdAt");
CREATE INDEX IF NOT EXISTS "SalesCatalogSection_catalogId_sortOrder_idx" ON "SalesCatalogSection"("catalogId", "sortOrder");
CREATE INDEX IF NOT EXISTS "SalesCatalogSection_categoryId_idx" ON "SalesCatalogSection"("categoryId");
CREATE INDEX IF NOT EXISTS "SalesCatalogItem_catalogId_sectionId_sortOrder_idx" ON "SalesCatalogItem"("catalogId", "sectionId", "sortOrder");
CREATE INDEX IF NOT EXISTS "SalesCatalogItem_productId_idx" ON "SalesCatalogItem"("productId");
