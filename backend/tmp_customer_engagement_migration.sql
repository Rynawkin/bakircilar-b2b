-- Cari aktivite/temas raporu: User login alanlari + CustomerContactLog + yaklasik backfill.
-- Idempotent; psql --single-transaction. Product/User ALTER icin gerekirse sudo -u postgres.

-- ===== User giris takibi =====
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "firstLoginAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loginCount" INTEGER NOT NULL DEFAULT 0;

-- ===== CustomerContactLog (temas/hatirlatma gecmisi) =====
CREATE TABLE IF NOT EXISTS "CustomerContactLog" (
  "id"                TEXT PRIMARY KEY,
  "customerCode"      TEXT NOT NULL,
  "customerName"      TEXT,
  "contactedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "contactedByUserId" TEXT,
  "contactedByName"   TEXT,
  "channel"           TEXT,
  "note"              TEXT,
  "outcome"           TEXT,
  "followUpDate"      TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CustomerContactLog_customerCode_contactedAt_idx" ON "CustomerContactLog"("customerCode", "contactedAt");
CREATE INDEX IF NOT EXISTS "CustomerContactLog_followUpDate_idx" ON "CustomerContactLog"("followUpDate");

-- ===== Backfill: son 180 gunluk aktiviteden YAKLASIK first/last login + loginCount (distinct gun) =====
-- Not: yaklasik baslangic; gercek loginCount bugunden itibaren girisle artacak.
UPDATE "User" u SET
  "lastLoginAt"  = COALESCE(u."lastLoginAt", agg.maxc),
  "firstLoginAt" = COALESCE(u."firstLoginAt", agg.minc),
  "loginCount"   = GREATEST(u."loginCount", agg.days)
FROM (
  SELECT "customerId" AS cid,
         MAX("createdAt") AS maxc,
         MIN("createdAt") AS minc,
         COUNT(DISTINCT date_trunc('day', "createdAt")) AS days
  FROM "CustomerActivityEvent"
  WHERE "customerId" IS NOT NULL
  GROUP BY "customerId"
) agg
WHERE u.id = agg.cid;
