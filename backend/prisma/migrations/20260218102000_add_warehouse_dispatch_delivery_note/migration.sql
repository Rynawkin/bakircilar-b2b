ALTER TABLE "WarehouseOrderWorkflow"
ADD COLUMN "mikroDeliveryNoteNo" TEXT,
ADD COLUMN "dispatchedByUserId" TEXT;

CREATE INDEX "WarehouseOrderWorkflow_mikroDeliveryNoteNo_idx" ON "WarehouseOrderWorkflow"("mikroDeliveryNoteNo");
