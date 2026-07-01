-- Vitrin HERO banner otomatik gecis suresi (ms). Idempotent.
ALTER TABLE "Settings"
  ADD COLUMN IF NOT EXISTS "heroBannerIntervalMs" INTEGER NOT NULL DEFAULT 6000;
