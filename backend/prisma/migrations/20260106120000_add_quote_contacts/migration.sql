-- Add customer contacts and quote contact snapshot fields

CREATE TABLE "CustomerContact" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerContact_customerId_idx" ON "CustomerContact"("customerId");

ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Quote" ADD COLUMN "contactId" TEXT;
ALTER TABLE "Quote" ADD COLUMN "contactName" TEXT;
ALTER TABLE "Quote" ADD COLUMN "contactPhone" TEXT;
ALTER TABLE "Quote" ADD COLUMN "contactEmail" TEXT;

ALTER TABLE "Quote" ADD CONSTRAINT "Quote_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "CustomerContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
