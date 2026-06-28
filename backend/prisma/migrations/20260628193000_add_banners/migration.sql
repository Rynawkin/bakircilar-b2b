-- CreateTable (additive, idempotent)
CREATE TABLE IF NOT EXISTS "Banner" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "imageUrl" TEXT,
    "linkUrl" TEXT,
    "productCode" TEXT,
    "buttonText" TEXT,
    "position" TEXT NOT NULL DEFAULT 'HERO',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Banner_active_position_sortOrder_idx" ON "Banner"("active", "position", "sortOrder");
