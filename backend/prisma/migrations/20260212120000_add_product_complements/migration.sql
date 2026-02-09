-- Add product complement mode enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProductComplementMode') THEN
    CREATE TYPE "ProductComplementMode" AS ENUM ('AUTO', 'MANUAL');
  END IF;
END$$;

-- Add mode field to Product
ALTER TABLE "Product" ADD COLUMN "complementMode" "ProductComplementMode" NOT NULL DEFAULT 'AUTO';

-- Auto recommendations
CREATE TABLE "ProductComplementAuto" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "relatedProductId" TEXT NOT NULL,
  "pairCount" INTEGER NOT NULL DEFAULT 0,
  "rank" INTEGER NOT NULL DEFAULT 0,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "windowEnd" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductComplementAuto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductComplementAuto_productId_relatedProductId_key"
  ON "ProductComplementAuto"("productId", "relatedProductId");
CREATE INDEX "ProductComplementAuto_productId_rank_idx"
  ON "ProductComplementAuto"("productId", "rank");

ALTER TABLE "ProductComplementAuto"
  ADD CONSTRAINT "ProductComplementAuto_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductComplementAuto"
  ADD CONSTRAINT "ProductComplementAuto_relatedProductId_fkey"
  FOREIGN KEY ("relatedProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Manual recommendations
CREATE TABLE "ProductComplementManual" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "relatedProductId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductComplementManual_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductComplementManual_productId_relatedProductId_key"
  ON "ProductComplementManual"("productId", "relatedProductId");
CREATE INDEX "ProductComplementManual_productId_sortOrder_idx"
  ON "ProductComplementManual"("productId", "sortOrder");

ALTER TABLE "ProductComplementManual"
  ADD CONSTRAINT "ProductComplementManual_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductComplementManual"
  ADD CONSTRAINT "ProductComplementManual_relatedProductId_fkey"
  FOREIGN KEY ("relatedProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
