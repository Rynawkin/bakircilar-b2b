-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('NEW', 'TRIAGE', 'IN_PROGRESS', 'WAITING', 'REVIEW', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('BUG', 'IMPROVEMENT', 'FEATURE', 'OPERATION', 'PROCUREMENT', 'REPORT', 'DATA_SYNC', 'ACCESS', 'DESIGN_UX', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskVisibility" AS ENUM ('PUBLIC', 'INTERNAL');

-- CreateEnum
CREATE TYPE "TaskLinkType" AS ENUM ('PRODUCT', 'QUOTE', 'ORDER', 'CUSTOMER', 'PAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskView" AS ENUM ('KANBAN', 'LIST');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "taskDefaultView" "TaskView" NOT NULL DEFAULT 'KANBAN';

-- CreateTable
CREATE TABLE "TaskTemplate" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "TaskType" NOT NULL,
    "priority" "TaskPriority" NOT NULL DEFAULT 'NONE',
    "defaultStatus" "TaskStatus" NOT NULL DEFAULT 'NEW',
    "checklist" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "TaskType" NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'NEW',
    "priority" "TaskPriority" NOT NULL DEFAULT 'NONE',
    "dueDate" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "customerId" TEXT,
    "sectorCode" TEXT,
    "templateId" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskComment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" "TaskVisibility" NOT NULL DEFAULT 'PUBLIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAttachment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "visibility" "TaskVisibility" NOT NULL DEFAULT 'PUBLIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskLink" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "type" "TaskLinkType" NOT NULL,
    "label" TEXT,
    "referenceId" TEXT,
    "referenceCode" TEXT,
    "referenceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskStatusHistory" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fromStatus" "TaskStatus",
    "toStatus" "TaskStatus" NOT NULL,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_priority_idx" ON "Task"("priority");

-- CreateIndex
CREATE INDEX "Task_type_idx" ON "Task"("type");

-- CreateIndex
CREATE INDEX "Task_assignedToId_idx" ON "Task"("assignedToId");

-- CreateIndex
CREATE INDEX "Task_createdById_idx" ON "Task"("createdById");

-- CreateIndex
CREATE INDEX "Task_customerId_idx" ON "Task"("customerId");

-- CreateIndex
CREATE INDEX "Task_sectorCode_idx" ON "Task"("sectorCode");

-- CreateIndex
CREATE INDEX "Task_lastActivityAt_idx" ON "Task"("lastActivityAt");

-- CreateIndex
CREATE INDEX "TaskComment_taskId_idx" ON "TaskComment"("taskId");

-- CreateIndex
CREATE INDEX "TaskComment_authorId_idx" ON "TaskComment"("authorId");

-- CreateIndex
CREATE INDEX "TaskAttachment_taskId_idx" ON "TaskAttachment"("taskId");

-- CreateIndex
CREATE INDEX "TaskAttachment_uploadedById_idx" ON "TaskAttachment"("uploadedById");

-- CreateIndex
CREATE INDEX "TaskLink_taskId_idx" ON "TaskLink"("taskId");

-- CreateIndex
CREATE INDEX "TaskLink_type_idx" ON "TaskLink"("type");

-- CreateIndex
CREATE INDEX "TaskStatusHistory_taskId_idx" ON "TaskStatusHistory"("taskId");

-- CreateIndex
CREATE INDEX "TaskStatusHistory_changedById_idx" ON "TaskStatusHistory"("changedById");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaskTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskLink" ADD CONSTRAINT "TaskLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskStatusHistory" ADD CONSTRAINT "TaskStatusHistory_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskStatusHistory" ADD CONSTRAINT "TaskStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
