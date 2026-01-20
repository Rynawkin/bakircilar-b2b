-- Add lineOrder to QuoteItem
ALTER TABLE "QuoteItem" ADD COLUMN "lineOrder" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY "quoteId" ORDER BY "createdAt", id) AS row_num
  FROM "QuoteItem"
)
UPDATE "QuoteItem" qi
SET "lineOrder" = ranked.row_num
FROM ranked
WHERE qi.id = ranked.id;
