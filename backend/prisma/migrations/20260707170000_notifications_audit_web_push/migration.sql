-- Notification preferences, audit log and browser web-push persistence.
-- This migration is intentionally idempotent because parts of it may have
-- been applied manually while the ops improvements were being tested.

ALTER TABLE "EInvoiceDocument"
  ADD COLUMN IF NOT EXISTS "customerTaxNo" TEXT;

ALTER TABLE "Notification"
  ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'SYSTEM';

CREATE INDEX IF NOT EXISTS "Notification_category_idx"
  ON "Notification" ("category");

CREATE TABLE IF NOT EXISTS "NotificationPreference" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "category" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "NotificationPreference_userId_category_key" UNIQUE ("userId", "category")
);

CREATE INDEX IF NOT EXISTS "NotificationPreference_category_idx"
  ON "NotificationPreference" ("category");

CREATE TABLE IF NOT EXISTS "WebPushSubscription" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "endpoint" TEXT NOT NULL UNIQUE,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "userAgent" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "WebPushSubscription_userId_active_idx"
  ON "WebPushSubscription" ("userId", "active");

CREATE INDEX IF NOT EXISTS "WebPushSubscription_active_idx"
  ON "WebPushSubscription" ("active");

ALTER TABLE "Settings"
  ADD COLUMN IF NOT EXISTS "webPushVapidPublicKey" TEXT,
  ADD COLUMN IF NOT EXISTS "webPushVapidPrivateKey" TEXT,
  ADD COLUMN IF NOT EXISTS "webPushVapidSubject" TEXT;

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "actorId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "actorName" TEXT,
  "actorRole" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "entityCode" TEXT,
  "summary" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "before" JSONB,
  "after" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "AuditLog_actorId_createdAt_idx"
  ON "AuditLog" ("actorId", "createdAt");

CREATE INDEX IF NOT EXISTS "AuditLog_entityType_entityId_idx"
  ON "AuditLog" ("entityType", "entityId");

CREATE INDEX IF NOT EXISTS "AuditLog_action_idx"
  ON "AuditLog" ("action");

CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx"
  ON "AuditLog" ("createdAt");
