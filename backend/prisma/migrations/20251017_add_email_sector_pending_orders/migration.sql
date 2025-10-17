-- AlterTable
ALTER TABLE "PendingMikroOrder" ADD COLUMN "customerEmail" TEXT,
ADD COLUMN "sectorCode" TEXT;

-- CreateIndex
CREATE INDEX "PendingMikroOrder_sectorCode_idx" ON "PendingMikroOrder"("sectorCode");
