CREATE TABLE "ManagementProfitReportLink" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "tokenHint" TEXT NOT NULL,
  "pinHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "canSaveLayout" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "sessionVersion" INTEGER NOT NULL DEFAULT 1,
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "lastViewedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdByName" TEXT,
  "updatedById" TEXT,
  "updatedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ManagementProfitReportLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ManagementProfitReportLink_status_check"
    CHECK ("status" IN ('ACTIVE', 'PAUSED', 'REVOKED')),
  CONSTRAINT "ManagementProfitReportLink_counters_check"
    CHECK ("sessionVersion" >= 1 AND "viewCount" >= 0)
);

CREATE TABLE "ManagementProfitReportLayout" (
  "id" TEXT NOT NULL,
  "linkId" TEXT NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "config" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ManagementProfitReportLayout_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ManagementProfitReportLayout_revision_check"
    CHECK ("schemaVersion" >= 1 AND "revision" >= 1)
);

CREATE TABLE "ManagementProfitReportAccessAttempt" (
  "id" TEXT NOT NULL,
  "linkId" TEXT NOT NULL,
  "clientHash" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ManagementProfitReportAccessAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ManagementProfitReportAccessAttempt_outcome_check"
    CHECK ("outcome" IN ('SUCCESS', 'FAILURE', 'BLOCKED'))
);

CREATE UNIQUE INDEX "ManagementProfitReportLink_tokenHash_key"
  ON "ManagementProfitReportLink"("tokenHash");
CREATE INDEX "ManagementProfitReportLink_status_updatedAt_idx"
  ON "ManagementProfitReportLink"("status", "updatedAt");
CREATE INDEX "ManagementProfitReportLink_expiresAt_idx"
  ON "ManagementProfitReportLink"("expiresAt");

CREATE UNIQUE INDEX "ManagementProfitReportLayout_linkId_key"
  ON "ManagementProfitReportLayout"("linkId");
CREATE INDEX "ManagementProfitReportLayout_updatedAt_idx"
  ON "ManagementProfitReportLayout"("updatedAt");

CREATE INDEX "ManagementProfitReportAccessAttempt_linkId_clientHash_createdAt_idx"
  ON "ManagementProfitReportAccessAttempt"("linkId", "clientHash", "createdAt");
CREATE INDEX "ManagementProfitReportAccessAttempt_createdAt_idx"
  ON "ManagementProfitReportAccessAttempt"("createdAt");

ALTER TABLE "ManagementProfitReportLayout"
  ADD CONSTRAINT "ManagementProfitReportLayout_linkId_fkey"
  FOREIGN KEY ("linkId") REFERENCES "ManagementProfitReportLink"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManagementProfitReportAccessAttempt"
  ADD CONSTRAINT "ManagementProfitReportAccessAttempt_linkId_fkey"
  FOREIGN KEY ("linkId") REFERENCES "ManagementProfitReportLink"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
