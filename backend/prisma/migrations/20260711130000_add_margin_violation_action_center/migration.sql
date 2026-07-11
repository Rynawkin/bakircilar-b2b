DO $$ BEGIN
  CREATE TYPE "MarginViolationStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'REOPENED', 'ADMIN_CLOSED', 'INVALIDATED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MarginViolationBasisType" AS ENUM ('CURRENT', 'ENTRY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MarginViolationType" AS ENUM ('NEGATIVE', 'LOW', 'HIGH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MarginViolationResolutionType" AS ENUM ('FIXED', 'APPROVED', 'DATA_ERROR', 'EXCLUDED', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MarginExclusionProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Settings"
  ADD COLUMN IF NOT EXISTS "marginAlertLowThreshold" DOUBLE PRECISION NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "marginAlertHighThreshold" DOUBLE PRECISION NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS "marginEmailWorstLimit" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS "marginPersonalEmailEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "marginViolationEscalationBusinessDays" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "MarginComplianceReportDay"
  ADD COLUMN IF NOT EXISTS "quality" JSONB;

ALTER TABLE "MarginComplianceReportRow"
  ADD COLUMN IF NOT EXISTS "rowKey" TEXT,
  ADD COLUMN IF NOT EXISTS "revenueNet" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "revenueGross" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "currentMarkup" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "entryMargin" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "entrySourceMargin" DOUBLE PRECISION;

CREATE UNIQUE INDEX IF NOT EXISTS "MarginComplianceReportRow_reportDate_rowKey_key"
  ON "MarginComplianceReportRow"("reportDate", "rowKey");

CREATE TABLE IF NOT EXISTS "MarginViolation" (
  "id" TEXT NOT NULL,
  "reportDate" TIMESTAMP(3) NOT NULL,
  "rowKey" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "documentNo" TEXT,
  "documentType" TEXT,
  "customerCode" TEXT,
  "customerName" TEXT,
  "productCode" TEXT NOT NULL,
  "productName" TEXT,
  "quantity" DOUBLE PRECISION,
  "unit" TEXT,
  "quantityLabel" TEXT,
  "unitPrice" DOUBLE PRECISION,
  "revenueNet" DOUBLE PRECISION,
  "revenueGross" DOUBLE PRECISION,
  "sectorCode" TEXT,
  "snapshot" JSONB NOT NULL,
  "status" "MarginViolationStatus" NOT NULL DEFAULT 'OPEN',
  "claimedById" TEXT,
  "claimedByName" TEXT,
  "claimedAt" TIMESTAMP(3),
  "resolutionType" "MarginViolationResolutionType",
  "resolvedById" TEXT,
  "resolvedByName" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "firstNotifiedAt" TIMESTAMP(3),
  "escalatedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "invalidatedAt" TIMESTAMP(3),
  "priceVerificationRequestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarginViolation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarginViolation_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MarginViolation_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "MarginViolation_reportDate_rowKey_key" ON "MarginViolation"("reportDate", "rowKey");
CREATE INDEX IF NOT EXISTS "MarginViolation_status_reportDate_idx" ON "MarginViolation"("status", "reportDate");
CREATE INDEX IF NOT EXISTS "MarginViolation_sectorCode_status_idx" ON "MarginViolation"("sectorCode", "status");
CREATE INDEX IF NOT EXISTS "MarginViolation_productCode_reportDate_idx" ON "MarginViolation"("productCode", "reportDate");
CREATE INDEX IF NOT EXISTS "MarginViolation_fingerprint_reportDate_idx" ON "MarginViolation"("fingerprint", "reportDate");
CREATE INDEX IF NOT EXISTS "MarginViolation_claimedById_status_idx" ON "MarginViolation"("claimedById", "status");

CREATE TABLE IF NOT EXISTS "MarginViolationBasis" (
  "id" TEXT NOT NULL,
  "violationId" TEXT NOT NULL,
  "basis" "MarginViolationBasisType" NOT NULL,
  "violationType" "MarginViolationType" NOT NULL,
  "unitCost" DOUBLE PRECISION,
  "profit" DOUBLE PRECISION,
  "margin" DOUBLE PRECISION,
  "sourceMargin" DOUBLE PRECISION,
  "dataAvailable" BOOLEAN NOT NULL DEFAULT true,
  "missingReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarginViolationBasis_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarginViolationBasis_violationId_fkey" FOREIGN KEY ("violationId") REFERENCES "MarginViolation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "MarginViolationBasis_violationId_basis_key" ON "MarginViolationBasis"("violationId", "basis");
CREATE INDEX IF NOT EXISTS "MarginViolationBasis_basis_violationType_idx" ON "MarginViolationBasis"("basis", "violationType");

CREATE TABLE IF NOT EXISTS "MarginViolationAssignee" (
  "id" TEXT NOT NULL,
  "violationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "userName" TEXT,
  "notifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarginViolationAssignee_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarginViolationAssignee_violationId_fkey" FOREIGN KEY ("violationId") REFERENCES "MarginViolation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MarginViolationAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "MarginViolationAssignee_violationId_userId_key" ON "MarginViolationAssignee"("violationId", "userId");
CREATE INDEX IF NOT EXISTS "MarginViolationAssignee_userId_createdAt_idx" ON "MarginViolationAssignee"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "MarginViolationNote" (
  "id" TEXT NOT NULL,
  "violationId" TEXT NOT NULL,
  "authorId" TEXT,
  "authorName" TEXT,
  "body" TEXT NOT NULL,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarginViolationNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarginViolationNote_violationId_fkey" FOREIGN KEY ("violationId") REFERENCES "MarginViolation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MarginViolationNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "MarginViolationNote_violationId_createdAt_idx" ON "MarginViolationNote"("violationId", "createdAt");
CREATE INDEX IF NOT EXISTS "MarginViolationNote_authorId_idx" ON "MarginViolationNote"("authorId");

CREATE TABLE IF NOT EXISTS "MarginViolationExclusionProposal" (
  "id" TEXT NOT NULL,
  "violationId" TEXT NOT NULL,
  "type" "MarginExclusionType" NOT NULL DEFAULT 'PRODUCT_CODE',
  "value" TEXT NOT NULL,
  "label" TEXT,
  "note" TEXT NOT NULL,
  "status" "MarginExclusionProposalStatus" NOT NULL DEFAULT 'PENDING',
  "proposedById" TEXT,
  "proposedByName" TEXT,
  "decidedById" TEXT,
  "decidedByName" TEXT,
  "decisionNote" TEXT,
  "decidedAt" TIMESTAMP(3),
  "marginExclusionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarginViolationExclusionProposal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarginViolationExclusionProposal_violationId_fkey" FOREIGN KEY ("violationId") REFERENCES "MarginViolation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MarginViolationExclusionProposal_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MarginViolationExclusionProposal_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "MarginViolationExclusionProposal_status_createdAt_idx" ON "MarginViolationExclusionProposal"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "MarginViolationExclusionProposal_violationId_idx" ON "MarginViolationExclusionProposal"("violationId");
CREATE INDEX IF NOT EXISTS "MarginViolationExclusionProposal_proposedById_idx" ON "MarginViolationExclusionProposal"("proposedById");
