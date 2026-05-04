ALTER TABLE "QuoteItem"
  ALTER COLUMN "quantity" TYPE DOUBLE PRECISION USING "quantity"::double precision,
  ADD COLUMN "unit2" TEXT,
  ADD COLUMN "unit2Factor" DOUBLE PRECISION,
  ADD COLUMN "selectedUnit" TEXT;

ALTER TABLE "OrderItem"
  ALTER COLUMN "quantity" TYPE DOUBLE PRECISION USING "quantity"::double precision,
  ALTER COLUMN "approvedQuantity" TYPE DOUBLE PRECISION USING "approvedQuantity"::double precision,
  ADD COLUMN "unit" TEXT,
  ADD COLUMN "unit2" TEXT,
  ADD COLUMN "unit2Factor" DOUBLE PRECISION,
  ADD COLUMN "selectedUnit" TEXT;
