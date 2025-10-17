-- Add separate customer and supplier schedule fields
ALTER TABLE "OrderTrackingSettings" ADD COLUMN "customerSyncSchedule" TEXT NOT NULL DEFAULT '0 8 * * 2,5';
ALTER TABLE "OrderTrackingSettings" ADD COLUMN "customerEmailEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "OrderTrackingSettings" ADD COLUMN "customerEmailSubject" TEXT NOT NULL DEFAULT 'Bekleyen Siparişleriniz';

ALTER TABLE "OrderTrackingSettings" ADD COLUMN "supplierSyncSchedule" TEXT NOT NULL DEFAULT '0 8 * * 2,5';
ALTER TABLE "OrderTrackingSettings" ADD COLUMN "supplierEmailEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "OrderTrackingSettings" ADD COLUMN "supplierEmailSubject" TEXT NOT NULL DEFAULT 'Bekleyen Tedarikçi Siparişleri';

ALTER TABLE "OrderTrackingSettings" ADD COLUMN "lastCustomerEmailSentAt" TIMESTAMP(3);
ALTER TABLE "OrderTrackingSettings" ADD COLUMN "lastSupplierEmailSentAt" TIMESTAMP(3);
