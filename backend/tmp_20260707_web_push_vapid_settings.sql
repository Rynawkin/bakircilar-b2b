ALTER TABLE "Settings"
  ADD COLUMN IF NOT EXISTS "webPushVapidPublicKey" TEXT,
  ADD COLUMN IF NOT EXISTS "webPushVapidPrivateKey" TEXT,
  ADD COLUMN IF NOT EXISTS "webPushVapidSubject" TEXT;
