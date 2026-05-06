CREATE TABLE "CustomerRecoveryAction" (
  "id" TEXT NOT NULL,
  "customerCode" TEXT NOT NULL,
  "customerName" TEXT,
  "actionType" TEXT NOT NULL DEFAULT 'NOTE',
  "note" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "outcome" TEXT,
  "followUpDate" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "authorId" TEXT,
  "assignedToId" TEXT,
  "snapshot" JSONB,
  "postSnapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomerRecoveryAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerRecoveryAction_customerCode_idx" ON "CustomerRecoveryAction"("customerCode");
CREATE INDEX "CustomerRecoveryAction_status_idx" ON "CustomerRecoveryAction"("status");
CREATE INDEX "CustomerRecoveryAction_followUpDate_idx" ON "CustomerRecoveryAction"("followUpDate");
CREATE INDEX "CustomerRecoveryAction_assignedToId_idx" ON "CustomerRecoveryAction"("assignedToId");
CREATE INDEX "CustomerRecoveryAction_createdAt_idx" ON "CustomerRecoveryAction"("createdAt");

ALTER TABLE "CustomerRecoveryAction"
  ADD CONSTRAINT "CustomerRecoveryAction_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerRecoveryAction"
  ADD CONSTRAINT "CustomerRecoveryAction_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
