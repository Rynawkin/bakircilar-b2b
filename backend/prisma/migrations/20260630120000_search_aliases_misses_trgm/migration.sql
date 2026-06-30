-- Arama iyilestirmeleri: es-anlam (searchAliases) + yazim hatasi toleransi (pg_trgm) + sonuc-cikmayan analitik (SearchMiss)

-- 1) Admin tarafindan girilen es-anlam/alternatif arama kelimeleri. Kalici; sync DOKUNMAZ.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "searchAliases" text;

-- 2) Generated searchText kolonunu searchAliases'i de kapsayacak sekilde YENIDEN tanimla.
--    (STORED generated: name/mikroCode/foreignName/searchAliases degisince Postgres otomatik yeniden hesaplar.)
--    normalizeSearchText (backend/src/utils/search.ts) ile ayni mantik.
ALTER TABLE "Product" DROP COLUMN IF EXISTS "searchText";
ALTER TABLE "Product" ADD COLUMN "searchText" text
GENERATED ALWAYS AS (
  trim(regexp_replace(
    lower(translate(
      coalesce(name, '') || ' ' || coalesce("mikroCode", '') || ' ' || coalesce("foreignName", '') || ' ' || coalesce("searchAliases", ''),
      'ÇĞİıÖŞÜçğöşü', 'CGIIOSUcgosu'
    )),
    '[^a-z0-9]+', ' ', 'g'
  ))
) STORED;

-- 3) Yazim hatasi (typo) toleransi icin trigram. ILIKE/contains aramayi da hizlandirir.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "product_searchtext_trgm" ON "Product" USING gin ("searchText" gin_trgm_ops);

-- 4) Sonuc cikmayan aramalar analitigi (es-anlam eklemek icin)
CREATE TABLE IF NOT EXISTS "SearchMiss" (
  "id" text NOT NULL,
  "normalizedTerm" text NOT NULL,
  "sampleTerm" text NOT NULL,
  "count" integer NOT NULL DEFAULT 1,
  "resolved" boolean NOT NULL DEFAULT false,
  "lastSearchedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SearchMiss_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SearchMiss_normalizedTerm_key" ON "SearchMiss" ("normalizedTerm");
CREATE INDEX IF NOT EXISTS "SearchMiss_resolved_count_idx" ON "SearchMiss" ("resolved", "count");
CREATE INDEX IF NOT EXISTS "SearchMiss_lastSearchedAt_idx" ON "SearchMiss" ("lastSearchedAt");
