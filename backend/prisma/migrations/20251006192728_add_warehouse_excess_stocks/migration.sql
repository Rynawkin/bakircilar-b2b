-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "warehouseExcessStocks" JSONB NOT NULL DEFAULT '{}';
