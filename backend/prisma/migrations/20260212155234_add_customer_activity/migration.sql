-- CreateEnum
CREATE TYPE "CustomerActivityType" AS ENUM ('PAGE_VIEW', 'PRODUCT_VIEW', 'CART_ADD', 'CART_REMOVE', 'CART_UPDATE', 'ACTIVE_PING', 'CLICK', 'SEARCH');

-- CreateTable
CREATE TABLE "CustomerActivityEvent" (
    "id" TEXT NOT NULL,
    "type" "CustomerActivityType" NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT,
    "sessionId" TEXT,
    "pagePath" TEXT,
    "pageTitle" TEXT,
    "referrer" TEXT,
    "productId" TEXT,
    "productCode" TEXT,
    "cartItemId" TEXT,
    "quantity" INTEGER,
    "durationSeconds" INTEGER,
    "clickCount" INTEGER,
    "meta" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerActivityEvent_userId_createdAt_idx" ON "CustomerActivityEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerActivityEvent_customerId_createdAt_idx" ON "CustomerActivityEvent"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerActivityEvent_type_createdAt_idx" ON "CustomerActivityEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerActivityEvent_productId_idx" ON "CustomerActivityEvent"("productId");

-- CreateIndex
CREATE INDEX "CustomerActivityEvent_pagePath_idx" ON "CustomerActivityEvent"("pagePath");

-- CreateIndex
CREATE INDEX "CustomerActivityEvent_sessionId_idx" ON "CustomerActivityEvent"("sessionId");

-- AddForeignKey
ALTER TABLE "CustomerActivityEvent" ADD CONSTRAINT "CustomerActivityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerActivityEvent" ADD CONSTRAINT "CustomerActivityEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerActivityEvent" ADD CONSTRAINT "CustomerActivityEvent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

