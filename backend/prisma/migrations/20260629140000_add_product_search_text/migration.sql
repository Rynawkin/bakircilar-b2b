-- Aksan/buyuk-kucuk duyarsiz arama: normalize edilmis (Turkce katlanmis + noktalama->bosluk) generated kolon.
-- normalizeSearchText (backend/src/utils/search.ts) ile ayni mantik: translate + lower + non-alnum -> space + trim.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "searchText" text
GENERATED ALWAYS AS (
  trim(regexp_replace(
    lower(translate(
      coalesce(name, '') || ' ' || coalesce("mikroCode", '') || ' ' || coalesce("foreignName", ''),
      'ÇĞİıÖŞÜçğöşü', 'CGIIOSUcgosu'
    )),
    '[^a-z0-9]+', ' ', 'g'
  ))
) STORED;
