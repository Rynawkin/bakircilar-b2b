-- Add optional line notes for cart/request/order items
ALTER TABLE "CartItem" ADD COLUMN "lineNote" TEXT;
ALTER TABLE "CustomerRequestItem" ADD COLUMN "lineNote" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "lineNote" TEXT;

-- Add order header fields
ALTER TABLE "Order" ADD COLUMN "customerOrderNumber" TEXT;
ALTER TABLE "Order" ADD COLUMN "deliveryLocation" TEXT;

-- Agreement updates
ALTER TABLE "CustomerPriceAgreement" ALTER COLUMN "priceWhite" DROP NOT NULL;
ALTER TABLE "CustomerPriceAgreement" ADD COLUMN "customerProductCode" TEXT;
