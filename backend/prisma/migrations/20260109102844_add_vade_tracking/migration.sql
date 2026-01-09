-- CreateEnum
CREATE TYPE "VadeBalanceSource" AS ENUM ('MIKRO', 'EXCEL', 'MANUAL');

-- CreateEnum
CREATE TYPE "VadeSyncStatus" AS ENUM ('SUCCESS', 'FAILED', 'PARTIAL');

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "lastVadeSyncAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "VadeBalance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pastDueBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pastDueDate" TIMESTAMP(3),
    "notDueBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notDueDate" TIMESTAMP(3),
    "totalBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valor" INTEGER NOT NULL DEFAULT 0,
    "paymentTermLabel" TEXT,
    "referenceDate" TIMESTAMP(3),
    "source" "VadeBalanceSource" NOT NULL DEFAULT 'MIKRO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VadeBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VadeNote" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "authorId" TEXT,
    "noteContent" TEXT NOT NULL,
    "promiseDate" TIMESTAMP(3),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reminderDate" TIMESTAMP(3),
    "reminderNote" TEXT,
    "reminderCompleted" BOOLEAN NOT NULL DEFAULT false,
    "reminderSentAt" TIMESTAMP(3),
    "balanceAtTime" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VadeNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VadeClassification" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "customClassification" TEXT,
    "riskScore" INTEGER,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VadeClassification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VadeAssignment" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VadeAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VadeSyncLog" (
    "id" TEXT NOT NULL,
    "source" "VadeBalanceSource" NOT NULL,
    "status" "VadeSyncStatus" NOT NULL,
    "recordsTotal" INTEGER NOT NULL DEFAULT 0,
    "recordsUpdated" INTEGER NOT NULL DEFAULT 0,
    "recordsSkipped" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "details" JSONB,

    CONSTRAINT "VadeSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VadeBalance_userId_key" ON "VadeBalance"("userId");

-- CreateIndex
CREATE INDEX "VadeBalance_pastDueDate_idx" ON "VadeBalance"("pastDueDate");

-- CreateIndex
CREATE INDEX "VadeBalance_notDueDate_idx" ON "VadeBalance"("notDueDate");

-- CreateIndex
CREATE INDEX "VadeNote_customerId_idx" ON "VadeNote"("customerId");

-- CreateIndex
CREATE INDEX "VadeNote_authorId_idx" ON "VadeNote"("authorId");

-- CreateIndex
CREATE INDEX "VadeNote_reminderDate_idx" ON "VadeNote"("reminderDate");

-- CreateIndex
CREATE INDEX "VadeNote_reminderCompleted_idx" ON "VadeNote"("reminderCompleted");

-- CreateIndex
CREATE UNIQUE INDEX "VadeClassification_customerId_key" ON "VadeClassification"("customerId");

-- CreateIndex
CREATE INDEX "VadeClassification_customerId_idx" ON "VadeClassification"("customerId");

-- CreateIndex
CREATE INDEX "VadeAssignment_staffId_idx" ON "VadeAssignment"("staffId");

-- CreateIndex
CREATE INDEX "VadeAssignment_customerId_idx" ON "VadeAssignment"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "VadeAssignment_staffId_customerId_key" ON "VadeAssignment"("staffId", "customerId");

-- CreateIndex
CREATE INDEX "VadeSyncLog_source_idx" ON "VadeSyncLog"("source");

-- CreateIndex
CREATE INDEX "VadeSyncLog_status_idx" ON "VadeSyncLog"("status");

-- CreateIndex
CREATE INDEX "VadeSyncLog_startedAt_idx" ON "VadeSyncLog"("startedAt");

-- AddForeignKey
ALTER TABLE "VadeBalance" ADD CONSTRAINT "VadeBalance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VadeNote" ADD CONSTRAINT "VadeNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VadeNote" ADD CONSTRAINT "VadeNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VadeClassification" ADD CONSTRAINT "VadeClassification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VadeClassification" ADD CONSTRAINT "VadeClassification_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VadeClassification" ADD CONSTRAINT "VadeClassification_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VadeAssignment" ADD CONSTRAINT "VadeAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VadeAssignment" ADD CONSTRAINT "VadeAssignment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VadeAssignment" ADD CONSTRAINT "VadeAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

