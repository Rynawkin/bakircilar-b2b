ALTER TABLE "OrderProductChangeRequest"
  ADD COLUMN "stockSnapshotAt" TIMESTAMP(3),
  ADD COLUMN "sourceStockAtCreation" JSONB,
  ADD COLUMN "targetStockAtCreation" JSONB;
