-- Add payment plan fields to User

ALTER TABLE "User" ADD COLUMN "paymentPlanNo" INTEGER;
ALTER TABLE "User" ADD COLUMN "paymentPlanCode" TEXT;
ALTER TABLE "User" ADD COLUMN "paymentPlanName" TEXT;
