-- Round 5 (2026-07-04): banner mobil gorseli
-- Idempotent; psql "$DBURL" -v ON_ERROR_STOP=1 --single-transaction -f backend/tmp_round5.sql

ALTER TABLE "Banner" ADD COLUMN IF NOT EXISTS "mobileImageUrl" TEXT;
