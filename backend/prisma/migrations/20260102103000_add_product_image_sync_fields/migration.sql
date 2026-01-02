-- AlterTable
ALTER TABLE "Product" ADD COLUMN "imageChecksum" TEXT;
ALTER TABLE "Product" ADD COLUMN "imageSyncStatus" TEXT;
ALTER TABLE "Product" ADD COLUMN "imageSyncErrorType" TEXT;
ALTER TABLE "Product" ADD COLUMN "imageSyncErrorMessage" TEXT;
ALTER TABLE "Product" ADD COLUMN "imageSyncUpdatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Product_imageSyncStatus_idx" ON "Product"("imageSyncStatus");
CREATE INDEX "Product_imageSyncErrorType_idx" ON "Product"("imageSyncErrorType");
CREATE INDEX "Product_imageSyncUpdatedAt_idx" ON "Product"("imageSyncUpdatedAt");
