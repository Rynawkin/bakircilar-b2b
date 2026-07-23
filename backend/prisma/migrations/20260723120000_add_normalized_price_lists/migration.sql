-- Preserve the physical Mikro price-list number on order lines for audit.
ALTER TABLE "OrderItem"
ADD COLUMN "priceListNo" INTEGER;

-- Client-generated hot-sale request key. Nullable keeps historical rows valid;
-- new write APIs require it and the unique index makes retries idempotent.
ALTER TABLE "HotSaleTransaction"
ADD COLUMN "operationKey" TEXT,
ADD COLUMN "requestHash" TEXT;

CREATE UNIQUE INDEX "HotSaleTransaction_operationKey_key"
ON "HotSaleTransaction"("operationKey");

ALTER TABLE "Order"
ADD COLUMN "hotSaleOperationKey" TEXT;

CREATE UNIQUE INDEX "Order_hotSaleOperationKey_key"
ON "Order"("hotSaleOperationKey");

-- Stable Mikro source identity makes price-history sync retry-safe. Existing
-- legacy rows cannot be reliably matched retroactively and remain NULL.
ALTER TABLE "price_changes"
ADD COLUMN "source_guid" TEXT;

CREATE UNIQUE INDEX "price_changes_source_guid_key"
ON "price_changes"("source_guid");

-- Row-based current-price mirror. The fixed product_price_stats list 1..10
-- columns remain in place during the compatibility period.
CREATE TABLE "product_price_list_current" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "product_code" TEXT NOT NULL,
  "price_list_no" INTEGER NOT NULL,
  "current_price" DECIMAL(18,4) NOT NULL,
  "current_cost" DECIMAL(18,4),
  "current_margin" DECIMAL(18,4),
  "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "product_price_list_current_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_price_list_current_product_code_price_list_no_key"
ON "product_price_list_current"("product_code", "price_list_no");

CREATE INDEX "product_price_list_current_price_list_no_idx"
ON "product_price_list_current"("price_list_no");

CREATE INDEX "product_price_list_current_synced_at_idx"
ON "product_price_list_current"("synced_at");

-- Backfill the ten legacy standard prices without changing or deleting the
-- source snapshot. Cost/margin stay NULL until priceSync reads MaliyetT for
-- retail and MaliyetP for invoiced lists; the legacy table has only one cost
-- column and cannot safely represent both planes.
INSERT INTO "product_price_list_current" (
  "product_code",
  "price_list_no",
  "current_price",
  "current_cost",
  "current_margin",
  "synced_at",
  "created_at",
  "updated_at"
)
SELECT
  stats."product_code",
  prices."price_list_no",
  COALESCE(prices."current_price", 0),
  NULL,
  NULL,
  stats."updated_at",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "product_price_stats" AS stats
CROSS JOIN LATERAL (
  VALUES
    (1, stats."current_price_list_1"),
    (2, stats."current_price_list_2"),
    (3, stats."current_price_list_3"),
    (4, stats."current_price_list_4"),
    (5, stats."current_price_list_5"),
    (6, stats."current_price_list_6"),
    (7, stats."current_price_list_7"),
    (8, stats."current_price_list_8"),
    (9, stats."current_price_list_9"),
    (10, stats."current_price_list_10")
) AS prices("price_list_no", "current_price")
ON CONFLICT ("product_code", "price_list_no") DO NOTHING;
