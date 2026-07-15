CREATE TABLE "SalesCatalogVisitor" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "visitorKey" TEXT NOT NULL,
  "deviceType" TEXT,
  "operatingSystem" TEXT,
  "browser" TEXT,
  "userAgentHash" TEXT,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "globalBlockedAt" TIMESTAMP(3),
  "globalBlockReason" TEXT,
  "globalBlockedById" TEXT,
  "globalBlockedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesCatalogVisitor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesCatalogShareLink" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "catalogId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "recipientName" TEXT,
  "linkedCustomerId" TEXT,
  "linkedCustomerCode" TEXT,
  "linkedCustomerName" TEXT,
  "token" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT FALSE,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3),
  "maxDevices" INTEGER,
  "maxViews" INTEGER,
  "pinHash" TEXT,
  "lockToFirstDevice" BOOLEAN NOT NULL DEFAULT FALSE,
  "boundVisitorId" TEXT,
  "useCustomPricing" BOOLEAN NOT NULL DEFAULT FALSE,
  "adjustmentType" TEXT,
  "adjustmentValue" DOUBLE PRECISION,
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "sessionCount" INTEGER NOT NULL DEFAULT 0,
  "pdfDownloadCount" INTEGER NOT NULL DEFAULT 0,
  "shareClickCount" INTEGER NOT NULL DEFAULT 0,
  "lastViewedAt" TIMESTAMP(3),
  "lastAnomalyNotifiedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdByName" TEXT,
  "updatedById" TEXT,
  "updatedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesCatalogShareLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalesCatalogShareLink_status_check" CHECK ("status" IN ('ACTIVE', 'PAUSED', 'REVOKED')),
  CONSTRAINT "SalesCatalogShareLink_maxDevices_check" CHECK ("maxDevices" IS NULL OR "maxDevices" > 0),
  CONSTRAINT "SalesCatalogShareLink_maxViews_check" CHECK ("maxViews" IS NULL OR "maxViews" > 0)
);

CREATE TABLE "SalesCatalogLinkVisitor" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "shareLinkId" TEXT NOT NULL,
  "visitorId" TEXT NOT NULL,
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "sessionCount" INTEGER NOT NULL DEFAULT 0,
  "pdfDownloadCount" INTEGER NOT NULL DEFAULT 0,
  "shareClickCount" INTEGER NOT NULL DEFAULT 0,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesCatalogLinkVisitor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesCatalogVisitorBlock" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "catalogId" TEXT NOT NULL,
  "visitorId" TEXT NOT NULL,
  "reason" TEXT,
  "blockedById" TEXT,
  "blockedByName" TEXT,
  "blockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesCatalogVisitorBlock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesCatalogPriceSnapshot" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "catalogId" TEXT NOT NULL,
  "shareLinkId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "catalogRevision" INTEGER NOT NULL,
  "adjustmentType" TEXT NOT NULL,
  "adjustmentValue" DOUBLE PRECISION NOT NULL,
  "productCount" INTEGER NOT NULL,
  "prices" JSONB NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesCatalogPriceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesCatalogViewSession" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "catalogId" TEXT NOT NULL,
  "shareLinkId" TEXT NOT NULL,
  "visitorId" TEXT NOT NULL,
  "priceSnapshotId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "viewCount" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "SalesCatalogViewSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesCatalogEvent" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "catalogId" TEXT NOT NULL,
  "shareLinkId" TEXT NOT NULL,
  "visitorId" TEXT NOT NULL,
  "sessionId" TEXT,
  "clientEventId" TEXT,
  "eventType" TEXT NOT NULL,
  "priceSnapshotId" TEXT,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesCatalogEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesCatalogVisitor_visitorKey_key" ON "SalesCatalogVisitor"("visitorKey");
CREATE INDEX "SalesCatalogVisitor_globalBlockedAt_idx" ON "SalesCatalogVisitor"("globalBlockedAt");
CREATE INDEX "SalesCatalogVisitor_lastSeenAt_idx" ON "SalesCatalogVisitor"("lastSeenAt");

CREATE UNIQUE INDEX "SalesCatalogShareLink_token_key" ON "SalesCatalogShareLink"("token");
CREATE UNIQUE INDEX "SalesCatalogShareLink_catalogId_name_key" ON "SalesCatalogShareLink"("catalogId", "name");
CREATE INDEX "SalesCatalogShareLink_catalogId_status_updatedAt_idx" ON "SalesCatalogShareLink"("catalogId", "status", "updatedAt");
CREATE INDEX "SalesCatalogShareLink_linkedCustomerId_idx" ON "SalesCatalogShareLink"("linkedCustomerId");
CREATE INDEX "SalesCatalogShareLink_expiresAt_idx" ON "SalesCatalogShareLink"("expiresAt");
CREATE INDEX "SalesCatalogShareLink_boundVisitorId_idx" ON "SalesCatalogShareLink"("boundVisitorId");

CREATE UNIQUE INDEX "SalesCatalogLinkVisitor_shareLinkId_visitorId_key" ON "SalesCatalogLinkVisitor"("shareLinkId", "visitorId");
CREATE INDEX "SalesCatalogLinkVisitor_shareLinkId_lastSeenAt_idx" ON "SalesCatalogLinkVisitor"("shareLinkId", "lastSeenAt");
CREATE INDEX "SalesCatalogLinkVisitor_visitorId_lastSeenAt_idx" ON "SalesCatalogLinkVisitor"("visitorId", "lastSeenAt");

CREATE UNIQUE INDEX "SalesCatalogVisitorBlock_catalogId_visitorId_key" ON "SalesCatalogVisitorBlock"("catalogId", "visitorId");
CREATE INDEX "SalesCatalogVisitorBlock_visitorId_blockedAt_idx" ON "SalesCatalogVisitorBlock"("visitorId", "blockedAt");

CREATE UNIQUE INDEX "SalesCatalogPriceSnapshot_shareLinkId_fingerprint_key" ON "SalesCatalogPriceSnapshot"("shareLinkId", "fingerprint");
CREATE INDEX "SalesCatalogPriceSnapshot_catalogId_generatedAt_idx" ON "SalesCatalogPriceSnapshot"("catalogId", "generatedAt");

CREATE INDEX "SalesCatalogViewSession_shareLinkId_visitorId_lastSeenAt_idx" ON "SalesCatalogViewSession"("shareLinkId", "visitorId", "lastSeenAt");
CREATE INDEX "SalesCatalogViewSession_catalogId_startedAt_idx" ON "SalesCatalogViewSession"("catalogId", "startedAt");
CREATE INDEX "SalesCatalogViewSession_priceSnapshotId_idx" ON "SalesCatalogViewSession"("priceSnapshotId");

CREATE UNIQUE INDEX "SalesCatalogEvent_clientEventId_key" ON "SalesCatalogEvent"("clientEventId");
CREATE INDEX "SalesCatalogEvent_shareLinkId_occurredAt_idx" ON "SalesCatalogEvent"("shareLinkId", "occurredAt");
CREATE INDEX "SalesCatalogEvent_visitorId_occurredAt_idx" ON "SalesCatalogEvent"("visitorId", "occurredAt");
CREATE INDEX "SalesCatalogEvent_eventType_occurredAt_idx" ON "SalesCatalogEvent"("eventType", "occurredAt");
CREATE INDEX "SalesCatalogEvent_priceSnapshotId_idx" ON "SalesCatalogEvent"("priceSnapshotId");

ALTER TABLE "SalesCatalogShareLink" ADD CONSTRAINT "SalesCatalogShareLink_catalogId_fkey"
  FOREIGN KEY ("catalogId") REFERENCES "SalesCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesCatalogShareLink" ADD CONSTRAINT "SalesCatalogShareLink_boundVisitorId_fkey"
  FOREIGN KEY ("boundVisitorId") REFERENCES "SalesCatalogVisitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesCatalogLinkVisitor" ADD CONSTRAINT "SalesCatalogLinkVisitor_shareLinkId_fkey"
  FOREIGN KEY ("shareLinkId") REFERENCES "SalesCatalogShareLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesCatalogLinkVisitor" ADD CONSTRAINT "SalesCatalogLinkVisitor_visitorId_fkey"
  FOREIGN KEY ("visitorId") REFERENCES "SalesCatalogVisitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesCatalogVisitorBlock" ADD CONSTRAINT "SalesCatalogVisitorBlock_catalogId_fkey"
  FOREIGN KEY ("catalogId") REFERENCES "SalesCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesCatalogVisitorBlock" ADD CONSTRAINT "SalesCatalogVisitorBlock_visitorId_fkey"
  FOREIGN KEY ("visitorId") REFERENCES "SalesCatalogVisitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesCatalogPriceSnapshot" ADD CONSTRAINT "SalesCatalogPriceSnapshot_catalogId_fkey"
  FOREIGN KEY ("catalogId") REFERENCES "SalesCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesCatalogPriceSnapshot" ADD CONSTRAINT "SalesCatalogPriceSnapshot_shareLinkId_fkey"
  FOREIGN KEY ("shareLinkId") REFERENCES "SalesCatalogShareLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesCatalogViewSession" ADD CONSTRAINT "SalesCatalogViewSession_catalogId_fkey"
  FOREIGN KEY ("catalogId") REFERENCES "SalesCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesCatalogViewSession" ADD CONSTRAINT "SalesCatalogViewSession_shareLinkId_fkey"
  FOREIGN KEY ("shareLinkId") REFERENCES "SalesCatalogShareLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesCatalogViewSession" ADD CONSTRAINT "SalesCatalogViewSession_visitorId_fkey"
  FOREIGN KEY ("visitorId") REFERENCES "SalesCatalogVisitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesCatalogViewSession" ADD CONSTRAINT "SalesCatalogViewSession_priceSnapshotId_fkey"
  FOREIGN KEY ("priceSnapshotId") REFERENCES "SalesCatalogPriceSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesCatalogEvent" ADD CONSTRAINT "SalesCatalogEvent_catalogId_fkey"
  FOREIGN KEY ("catalogId") REFERENCES "SalesCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesCatalogEvent" ADD CONSTRAINT "SalesCatalogEvent_shareLinkId_fkey"
  FOREIGN KEY ("shareLinkId") REFERENCES "SalesCatalogShareLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesCatalogEvent" ADD CONSTRAINT "SalesCatalogEvent_visitorId_fkey"
  FOREIGN KEY ("visitorId") REFERENCES "SalesCatalogVisitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesCatalogEvent" ADD CONSTRAINT "SalesCatalogEvent_priceSnapshotId_fkey"
  FOREIGN KEY ("priceSnapshotId") REFERENCES "SalesCatalogPriceSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "SalesCatalogShareLink" (
  "id", "catalogId", "name", "token", "isDefault", "status",
  "viewCount", "pdfDownloadCount", "lastViewedAt",
  "createdById", "createdByName", "updatedById", "updatedByName",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  catalog."id",
  'Genel Link',
  catalog."shareToken",
  TRUE,
  CASE WHEN catalog."status" = 'ARCHIVED' THEN 'PAUSED' ELSE 'ACTIVE' END,
  catalog."viewCount",
  catalog."pdfDownloadCount",
  catalog."lastViewedAt",
  catalog."createdById",
  catalog."createdByName",
  catalog."updatedById",
  catalog."updatedByName",
  catalog."createdAt",
  catalog."updatedAt"
FROM "SalesCatalog" catalog
ON CONFLICT ("token") DO NOTHING;
