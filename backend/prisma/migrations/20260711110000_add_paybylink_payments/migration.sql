-- Ziraat Nestpay PayByLink payment attempts and append-only bank event history.
-- Card data is never stored in these tables.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentAmountType') THEN
    CREATE TYPE "PaymentAmountType" AS ENUM ('TOTAL_BALANCE', 'PAST_DUE', 'CUSTOM');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentStatus') THEN
    CREATE TYPE "PaymentStatus" AS ENUM (
      'CREATED',
      'PENDING',
      'SUCCEEDED',
      'FAILED',
      'EXPIRED',
      'REVIEW_REQUIRED',
      'CANCELLED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "PaymentAttempt" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "orderId" TEXT NOT NULL UNIQUE,
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "customerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "requestedById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "customerCodeSnapshot" TEXT,
  "customerNameSnapshot" TEXT NOT NULL,
  "amountType" "PaymentAmountType" NOT NULL,
  "amount" NUMERIC(18, 2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'TRY',
  "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
  "provider" TEXT NOT NULL DEFAULT 'NESTPAY_ZIRAAT_PAYBYLINK',
  "bankName" TEXT NOT NULL DEFAULT 'Ziraat Bankasi',
  "paymentLinkUrl" TEXT,
  "linkExpiresAt" TIMESTAMPTZ,
  "totalBalanceSnapshot" NUMERIC(18, 2) NOT NULL,
  "pastDueBalanceSnapshot" NUMERIC(18, 2) NOT NULL,
  "balanceUpdatedAt" TIMESTAMPTZ,
  "bankResponse" TEXT,
  "bankReturnCode" TEXT,
  "bankErrorCode" TEXT,
  "bankMessage" TEXT,
  "bankTransactionStatus" TEXT,
  "bankTransactionId" TEXT,
  "bankAuthCode" TEXT,
  "bankHostReference" TEXT,
  "lastVerifiedAt" TIMESTAMPTZ,
  "succeededAt" TIMESTAMPTZ,
  "failedAt" TIMESTAMPTZ,
  "reconciledAt" TIMESTAMPTZ,
  "reconciledById" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "reconciliationNote" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "PaymentAttempt_amount_positive_check" CHECK ("amount" > 0),
  CONSTRAINT "PaymentAttempt_currency_try_check" CHECK ("currency" = 'TRY')
);

CREATE TABLE IF NOT EXISTS "PaymentEvent" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "paymentAttemptId" TEXT NOT NULL REFERENCES "PaymentAttempt"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "status" "PaymentStatus",
  "payload" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "PaymentAttempt_customerId_createdAt_idx"
  ON "PaymentAttempt" ("customerId", "createdAt");
CREATE INDEX IF NOT EXISTS "PaymentAttempt_requestedById_createdAt_idx"
  ON "PaymentAttempt" ("requestedById", "createdAt");
CREATE INDEX IF NOT EXISTS "PaymentAttempt_status_createdAt_idx"
  ON "PaymentAttempt" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "PaymentAttempt_reconciledAt_status_idx"
  ON "PaymentAttempt" ("reconciledAt", "status");
CREATE INDEX IF NOT EXISTS "PaymentEvent_paymentAttemptId_createdAt_idx"
  ON "PaymentEvent" ("paymentAttemptId", "createdAt");
CREATE INDEX IF NOT EXISTS "PaymentEvent_type_createdAt_idx"
  ON "PaymentEvent" ("type", "createdAt");
