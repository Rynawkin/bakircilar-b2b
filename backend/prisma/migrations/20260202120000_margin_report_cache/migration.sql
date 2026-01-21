-- Add margin compliance report cache
CREATE TYPE "ReportSyncStatus" AS ENUM ('SUCCESS', 'FAILED');

ALTER TABLE "Settings" ADD COLUMN "marginReportEmailEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Settings" ADD COLUMN "marginReportEmailRecipients" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Settings" ADD COLUMN "marginReportEmailSubject" TEXT NOT NULL DEFAULT 'Kar Marji Raporu';

CREATE TABLE "MarginComplianceReportDay" (
    "id" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "status" "ReportSyncStatus" NOT NULL DEFAULT 'SUCCESS',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarginComplianceReportDay_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarginComplianceReportRow" (
    "id" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "sectorCode" TEXT,
    "groupCode" TEXT,
    "avgMargin" DOUBLE PRECISION,
    "totalRevenue" DOUBLE PRECISION,
    "totalProfit" DOUBLE PRECISION,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarginComplianceReportRow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarginComplianceReportDay_reportDate_key" ON "MarginComplianceReportDay"("reportDate");
CREATE INDEX "MarginComplianceReportDay_reportDate_idx" ON "MarginComplianceReportDay"("reportDate");
CREATE INDEX "MarginComplianceReportDay_status_idx" ON "MarginComplianceReportDay"("status");

CREATE INDEX "MarginComplianceReportRow_reportDate_idx" ON "MarginComplianceReportRow"("reportDate");
CREATE INDEX "MarginComplianceReportRow_sectorCode_idx" ON "MarginComplianceReportRow"("sectorCode");
CREATE INDEX "MarginComplianceReportRow_groupCode_idx" ON "MarginComplianceReportRow"("groupCode");
CREATE INDEX "MarginComplianceReportRow_avgMargin_idx" ON "MarginComplianceReportRow"("avgMargin");
