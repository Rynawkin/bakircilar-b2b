-- Add weekly cached popularity score used by customer product listing defaults.
ALTER TABLE "Product"
ADD COLUMN "popularSalesQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "popularSalesValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "popularSalesUpdatedAt" TIMESTAMP(3);

CREATE INDEX "Product_popularSalesValue_idx" ON "Product"("popularSalesValue");
