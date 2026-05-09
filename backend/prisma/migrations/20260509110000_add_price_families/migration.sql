CREATE TABLE "PriceFamily" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "note" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PriceFamily_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PriceFamilyItem" (
  "id" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "productId" TEXT,
  "productCode" TEXT NOT NULL,
  "productName" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PriceFamilyItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PriceFamilyCostUpdateLog" (
  "id" TEXT NOT NULL,
  "familyId" TEXT,
  "familyName" TEXT,
  "productCode" TEXT NOT NULL,
  "productName" TEXT,
  "previousCost" DOUBLE PRECISION,
  "newCost" DOUBLE PRECISION NOT NULL,
  "previousCostDate" TIMESTAMP(3),
  "newCostDate" TIMESTAMP(3) NOT NULL,
  "updatePriceLists" BOOLEAN NOT NULL DEFAULT false,
  "updatedLists" JSONB NOT NULL DEFAULT '[]',
  "missingLists" JSONB NOT NULL DEFAULT '[]',
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PriceFamilyCostUpdateLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PriceFamily_code_key" ON "PriceFamily"("code");
CREATE INDEX "PriceFamily_active_idx" ON "PriceFamily"("active");

CREATE UNIQUE INDEX "PriceFamilyItem_productCode_key" ON "PriceFamilyItem"("productCode");
CREATE UNIQUE INDEX "PriceFamilyItem_familyId_productCode_key" ON "PriceFamilyItem"("familyId", "productCode");
CREATE INDEX "PriceFamilyItem_familyId_priority_idx" ON "PriceFamilyItem"("familyId", "priority");

CREATE INDEX "PriceFamilyCostUpdateLog_familyId_createdAt_idx" ON "PriceFamilyCostUpdateLog"("familyId", "createdAt");
CREATE INDEX "PriceFamilyCostUpdateLog_productCode_createdAt_idx" ON "PriceFamilyCostUpdateLog"("productCode", "createdAt");
CREATE INDEX "PriceFamilyCostUpdateLog_userId_createdAt_idx" ON "PriceFamilyCostUpdateLog"("userId", "createdAt");

ALTER TABLE "PriceFamilyItem"
  ADD CONSTRAINT "PriceFamilyItem_familyId_fkey"
  FOREIGN KEY ("familyId") REFERENCES "PriceFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PriceFamilyItem"
  ADD CONSTRAINT "PriceFamilyItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PriceFamilyCostUpdateLog"
  ADD CONSTRAINT "PriceFamilyCostUpdateLog_familyId_fkey"
  FOREIGN KEY ("familyId") REFERENCES "PriceFamily"("id") ON DELETE SET NULL ON UPDATE CASCADE;
