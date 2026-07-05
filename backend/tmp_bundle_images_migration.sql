-- Faz 1 (coklu gorsel) + Faz 2 (paketler) icin additive DB degisiklikleri.
-- Idempotent; psql --single-transaction ile uygulanir. prisma migrate deploy KULLANMA.
-- Product ALTER icin gerekirse: sudo -u postgres psql -d <db> -f bu_dosya

-- ===== Faz 1: ProductImage (urun galerisi) =====
CREATE TABLE IF NOT EXISTS "ProductImage" (
  "id"             TEXT PRIMARY KEY,
  "productId"      TEXT NOT NULL,
  "url"            TEXT NOT NULL,
  "sortOrder"      INTEGER NOT NULL DEFAULT 0,
  "isPrimary"      BOOLEAN NOT NULL DEFAULT false,
  "sizeBytes"      INTEGER,
  "checksum"       TEXT,
  "uploadedAt"     TIMESTAMP(3),
  "uploadedById"   TEXT,
  "uploadedByName" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ProductImage_productId_sortOrder_idx" ON "ProductImage"("productId", "sortOrder");
CREATE INDEX IF NOT EXISTS "ProductImage_productId_isPrimary_idx" ON "ProductImage"("productId", "isPrimary");
DO $$ BEGIN
  ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== Faz 2: Product paket alanlari =====
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isBundle" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "bundleDiscountPercent" DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "bundleSecondaryCategoryId" TEXT;
CREATE INDEX IF NOT EXISTS "Product_isBundle_idx" ON "Product"("isBundle");
CREATE INDEX IF NOT EXISTS "Product_bundleSecondaryCategoryId_idx" ON "Product"("bundleSecondaryCategoryId");

-- ===== Faz 2: BundleItem (paket bilesenleri) =====
CREATE TABLE IF NOT EXISTS "BundleItem" (
  "id"                 TEXT PRIMARY KEY,
  "bundleProductId"    TEXT NOT NULL,
  "componentProductId" TEXT NOT NULL,
  "quantity"           DOUBLE PRECISION NOT NULL DEFAULT 1,
  "useDiscountedPrice" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder"          INTEGER NOT NULL DEFAULT 0,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BundleItem_bundleProductId_idx" ON "BundleItem"("bundleProductId");
CREATE INDEX IF NOT EXISTS "BundleItem_componentProductId_idx" ON "BundleItem"("componentProductId");
DO $$ BEGIN
  ALTER TABLE "BundleItem" ADD CONSTRAINT "BundleItem_bundleProductId_fkey"
    FOREIGN KEY ("bundleProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "BundleItem" ADD CONSTRAINT "BundleItem_componentProductId_fkey"
    FOREIGN KEY ("componentProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== Faz 2: OrderItem bilesen snapshot =====
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "bundleComponents" JSONB;

-- ===== Faz 1: backfill — mevcut imageUrl'lerden birer isPrimary ProductImage =====
-- Sadece hic ProductImage'i olmayan, imageUrl dolu urunler icin.
INSERT INTO "ProductImage" ("id", "productId", "url", "sortOrder", "isPrimary", "sizeBytes", "checksum", "uploadedAt", "uploadedById", "uploadedByName", "createdAt")
SELECT
  gen_random_uuid()::text,
  p."id",
  p."imageUrl",
  0,
  true,
  p."imageSizeBytes",
  p."imageChecksum",
  p."imageUploadedAt",
  p."imageUploadedById",
  p."imageUploadedByName",
  CURRENT_TIMESTAMP
FROM "Product" p
WHERE p."imageUrl" IS NOT NULL
  AND p."imageUrl" <> ''
  AND NOT EXISTS (SELECT 1 FROM "ProductImage" pi WHERE pi."productId" = p."id");
