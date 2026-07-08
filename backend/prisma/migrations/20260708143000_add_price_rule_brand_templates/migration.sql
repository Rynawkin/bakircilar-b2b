CREATE TABLE IF NOT EXISTS "PriceRuleBrandTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "brandCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PriceRuleBrandTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PriceRuleBrandTemplate_name_key" ON "PriceRuleBrandTemplate"("name");
CREATE INDEX IF NOT EXISTS "PriceRuleBrandTemplate_active_idx" ON "PriceRuleBrandTemplate"("active");
CREATE INDEX IF NOT EXISTS "PriceRuleBrandTemplate_createdAt_idx" ON "PriceRuleBrandTemplate"("createdAt");
