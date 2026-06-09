ALTER TABLE "Product" ADD COLUMN "hiddenFromCustomers" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Product_hiddenFromCustomers_idx" ON "Product"("hiddenFromCustomers");
