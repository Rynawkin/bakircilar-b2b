-- Add pending customer orders by warehouse
ALTER TABLE "Product"
ADD COLUMN "pendingCustomerOrdersByWarehouse" JSONB NOT NULL DEFAULT '{}'::jsonb;
