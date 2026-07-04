-- Round 6 (2026-07-04): hediyeli kampanya urun basina hediye adedi
-- Idempotent; psql "$DBURL" -v ON_ERROR_STOP=1 --single-transaction -f backend/tmp_round6.sql

ALTER TABLE "GiftCampaignItem" ADD COLUMN IF NOT EXISTS "giftQuantity" INTEGER NOT NULL DEFAULT 1;
