/**
 * Aday Aile Motoru (Aile Kapsama Radari)
 *
 * Ailesiz urunler icin pg_trgm benzerligiyle en uygun mevcut AKTIF stok ailesini
 * onerir (similarity >= 0.35). Karsilastirma normalize metin uzerinden yapilir:
 * girdiler normalizeSearchText ile, aile uyeleri Product.searchText (DB generated,
 * ayni normalizasyon; migration 20260630120000) ile eslestirilir.
 *
 * KALITE KAPILARI (2026-07 Round 4):
 * pg_trgm skoru taban olarak kalir; ama kullanicidan gelen kotu oneriler icin
 * (400gr cop poseti -> 500gr aile, dispenser pecete -> Z-katli havlu aile,
 * 1500gr aluminyum kase -> 250gr aile) benzerlik skoru YETMIYOR. Bu yuzden asagidaki
 * SERT filtreler uygulanir (skoru gecen bir aday, kapilardan biri tetiklenirse elenir):
 *  a) KATEGORI kisiti: aday urunun categoryId'si vs ailenin cogunluk categoryId'si;
 *     ikisi de biliniyor ve farkliysa -> aile reddedilir.
 *  b) SAYISAL kapilar: gramaj (gr/g/kg/ml/lt/l/cc/oz), olcu (NxM), adet-ici (Nlu/N adet).
 *     Iki tarafta da gramaj varsa ve goreli fark > %15 -> red. Olcu farkliysa -> red.
 *  c) URUN-TIPI kapisi: PECETE/HAVLU/BARDAK/KASE/POSET... anahtar-kelime siniflari;
 *     iki tarafta da taninan tip var ve kesisim bossa -> red.
 *
 * addProductToFamily: oneriyi tek tusla uygular (ProductFamilyItem.create),
 * UcarerOperationLog 'PRODUCT_FAMILY_UPDATE' kaydi yazar. Mikro'ya yazma YOKTUR.
 * removeProductFromFamily: aile uyesini pasifler (active=false), log yazar.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { AppError, ErrorCode } from '../types/errors';
import { normalizeSearchText } from '../utils/search';

const MAX_CODES = 300;
const CHUNK_SIZE = 50;
const MIN_SCORE = 0.35;

// Gramaj esitlik toleransi: iki taraf da gramajliysa goreli fark bunu asarsa red.
const WEIGHT_REL_TOLERANCE = 0.15;

export interface FamilySuggestion {
  familyId: string;
  familyName: string;
  score: number;
  matchedProductName: string;
}

export type FamilySuggestionMap = Record<string, FamilySuggestion | null>;

type SuggestionRow = {
  code: string;
  familyId: string | null;
  familyName: string | null;
  score: number | null;
  matchedProductName: string | null;
};

/* ============================================================================
 * SAYISAL / TIP TOKEN CIKARIMI (ayni kapilar family-report.service tarafindan
 * da kullanilir; buradan export edilir).
 * ==========================================================================*/

/** Gramaj/hacim token: birimi grama (yaklasik) normalize ederek dondurur. */
export interface WeightToken {
  raw: string;
  grams: number; // karsilastirma icin ortak birim (ml/cc/l ~ gr kabul edilir)
}

/** Ondalik ayraci hem nokta hem virgul olabilir (1,5 kg gibi). */
function parseNum(raw: string): number {
  const n = Number(String(raw).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Sayisal cikarimlar icin HAFIF normalize: kucuk harf + Turkce aksan sadelestirme,
 * ama ondalik ayraclari ('.'/','), olcu ayraclari ('x'/'*'), rakamlar ve bosluk KORUNUR.
 * normalizeSearchText '[^a-z0-9]+' -> ' ' yaptigi icin "1,5 kg" -> "1 5 kg" olur ve
 * gramaj yanlis parse edilir; bu yuzden sayisal extractorlarda bu hafif surum kullanilir.
 */
function normalizeNumeric(name: string): string {
  const TR: Record<string, string> = {
    Ç: 'c', ç: 'c', Ğ: 'g', ğ: 'g', İ: 'i', ı: 'i',
    Ö: 'o', ö: 'o', Ş: 's', ş: 's', Ü: 'u', ü: 'u',
  };
  let out = '';
  for (const ch of String(name || '')) {
    out += TR[ch] ?? ch;
  }
  return out.toLowerCase();
}

/**
 * Isimden gramaj/hacim tokenlarini cikarir.
 * Desteklenen birimler: kg, gr, g, ml, cl, lt, l, cc, oz.
 * Not: "80x110" gibi olcu ifadeleri bu regex'e girmez (x'ten dolayi).
 */
export function extractWeights(name: string): WeightToken[] {
  const norm = normalizeNumeric(name); // aksan-sadelestirilmis, kucuk; ayraclar ('.'/','/'x') korunur
  const out: WeightToken[] = [];
  // number + unit; birim urunun kalanina bitisik olabilir ("500gr") veya bosluklu ("500 gr")
  const re = /(\d+(?:[.,]\d+)?)\s*(kg|gr|g|ml|cl|lt|l|cc|oz)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm)) !== null) {
    const val = parseNum(m[1]);
    if (!Number.isFinite(val) || val <= 0) continue;
    const unit = m[2];
    let grams = val;
    switch (unit) {
      case 'kg':
        grams = val * 1000;
        break;
      case 'gr':
      case 'g':
        grams = val;
        break;
      case 'ml':
      case 'cc':
        grams = val; // ~1 g/ml varsayimi (kaba karsilastirma icin yeterli)
        break;
      case 'cl':
        grams = val * 10;
        break;
      case 'lt':
      case 'l':
        grams = val * 1000;
        break;
      case 'oz':
        grams = val * 28.35;
        break;
    }
    out.push({ raw: `${m[1]}${unit}`, grams });
  }
  return out;
}

/** oz ayri tutulur (bardak vb icin ayri kural: oz farkliysa red). */
export function extractOunces(name: string): number[] {
  const norm = normalizeNumeric(name);
  const out: number[] = [];
  const re = /(\d+(?:[.,]\d+)?)\s*oz\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm)) !== null) {
    const v = parseNum(m[1]);
    if (Number.isFinite(v) && v > 0) out.push(v);
  }
  return out;
}

/** Olcu token: "80x110" -> {a:80,b:110}. Birden fazla olabilir. */
export interface DimensionToken {
  a: number;
  b: number;
}

export function extractDimensions(name: string): DimensionToken[] {
  const norm = normalizeNumeric(name);
  const out: DimensionToken[] = [];
  // 80x110, 80 x 110, 80*110
  const re = /(\d+(?:[.,]\d+)?)\s*[x*]\s*(\d+(?:[.,]\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm)) !== null) {
    const a = parseNum(m[1]);
    const b = parseNum(m[2]);
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) out.push({ a, b });
  }
  return out;
}

/** Adet-ici / paket-ici sayim: "24lu", "12 li", "50 adet", "10'lu". */
export function extractPackCounts(name: string): number[] {
  const norm = normalizeNumeric(name); // 'lü -> 'lu (aksan sadelesir); apostrof korunur
  const out: number[] = [];
  // Nlu / Nli / Nlik / Nluk (klasik -lI eki). Sayi ile ek arasinda apostrof olabilir ("10'lu").
  const reSuffix = /(\d{1,4})\s*['’]?\s*l[iu]k?\b/g;
  let m: RegExpExecArray | null;
  while ((m = reSuffix.exec(norm)) !== null) {
    const v = parseNum(m[1]);
    if (Number.isFinite(v) && v > 0) out.push(v);
  }
  // "N adet"
  const reAdet = /(\d{1,4})\s*adet\b/g;
  while ((m = reAdet.exec(norm)) !== null) {
    const v = parseNum(m[1]);
    if (Number.isFinite(v) && v > 0) out.push(v);
  }
  return out;
}

/* ============================================================================
 * URUN-TIPI ANAHTAR KELIME SINIFLARI
 * Normalize edilmis (aksansiz, kucuk) isimlerde aranir. Her sinif icin birden
 * fazla varyant tutulur; bir isimde bulunan siniflarin kumesi cikarilir.
 * ==========================================================================*/

const TYPE_KEYWORD_CLASSES: Record<string, string[]> = {
  PECETE: ['pecete'],
  HAVLU: ['havlu'],
  TUVALET_KAGIDI: ['tuvalet kagidi', 'tuvalet kag'],
  BARDAK: ['bardak'],
  KASE: ['kase'],
  TABAK: ['tabak'],
  CATAL: ['catal'],
  KASIK: ['kasik'],
  BICAK: ['bicak'],
  POSET: ['poset', 'cop torbasi', 'cop poseti', 'torba'],
  ELDIVEN: ['eldiven'],
  BONE: ['bone'],
  GALOS: ['galos'],
  MASKE: ['maske'],
  KOLONYA: ['kolonya'],
  SABUN: ['sabun'],
  SAMPUAN: ['sampuan'],
  DETERJAN: ['deterjan'],
  YUMUSATICI: ['yumusatici'],
  CAMASIR_SUYU: ['camasir suyu'],
  RULO: ['rulo'],
  DISPENSER: ['dispenser', 'aparat'],
  STRECFILM: ['strec', 'streec', 'strech'],
  ALUMINYUM_FOLYO: ['aluminyum folyo', 'folyo'],
  PIPET: ['pipet'],
  KURDAN: ['kurdan'],
  SUNGER: ['sunger'],
  BEZ: ['bez'],
  MOP: ['mop'],
  FIRCA: ['firca'],
};

/** Isimde bulunan urun-tipi siniflarinin kumesini dondurur. */
export function extractTypeClasses(name: string): Set<string> {
  const norm = normalizeSearchText(name);
  const found = new Set<string>();
  if (!norm) return found;
  for (const [cls, variants] of Object.entries(TYPE_KEYWORD_CLASSES)) {
    if (variants.some((v) => norm.includes(v))) {
      found.add(cls);
    }
  }
  return found;
}

/* ============================================================================
 * SERT KAPI: iki isim (aday urun vs eslesen uye / aile adi) uyumlu mu?
 * true => uyumsuz (RED). Kararli-negatif kanit yoksa false (gecir).
 * ==========================================================================*/

export interface GuardResult {
  rejected: boolean;
  reason: string | null;
}

/**
 * Sayisal + tip kapilarini iki isim uzerinde calistirir.
 * candidateName: aday (ailesiz) urun adi.
 * referenceNames: aday ailenin kanit isimleri (eslesen uye adi + aile adi).
 *   Ailenin gramaji uyesi/adi arasinda tutarsiz olabilir; bu yuzden REFERANS
 *   tarafinda gramaj/olcu/tip birden fazla isimden BIRLESTIRILEREK toplanir.
 */
export function evaluateNameGuards(
  candidateName: string,
  referenceNames: string[]
): GuardResult {
  const cand = String(candidateName || '');
  const refs = (referenceNames || []).map((n) => String(n || '')).filter(Boolean);
  if (!cand || refs.length === 0) return { rejected: false, reason: null };

  // --- Gramaj kapisi ---
  const candW = extractWeights(cand);
  const refW = refs.flatMap((n) => extractWeights(n));
  if (candW.length > 0 && refW.length > 0) {
    // Aday ilk gramaji ile referanslardaki EN YAKIN gramaji kiyasla; hicbir
    // referans gramaji tolerans icinde degilse red.
    const cg = candW[0].grams;
    const anyClose = refW.some((r) => {
      const denom = Math.max(cg, r.grams) || 1;
      const rel = Math.abs(cg - r.grams) / denom;
      return rel <= WEIGHT_REL_TOLERANCE;
    });
    if (!anyClose) {
      const nearest = refW.reduce((a, b) =>
        Math.abs(b.grams - cg) < Math.abs(a.grams - cg) ? b : a
      );
      return {
        rejected: true,
        reason: `Gramaj uyumsuz (${candW[0].raw} vs ${nearest.raw})`,
      };
    }
  }

  // --- oz kapisi (bardak vb) ---
  const candOz = extractOunces(cand);
  const refOz = refs.flatMap((n) => extractOunces(n));
  if (candOz.length > 0 && refOz.length > 0) {
    const co = candOz[0];
    const anyEqual = refOz.some((r) => Math.abs(r - co) < 0.01);
    if (!anyEqual) {
      return { rejected: true, reason: `Oz uyumsuz (${co}oz vs ${refOz[0]}oz)` };
    }
  }

  // --- Adet-ici / paket-ici sayim kapisi (Nlu / N adet) ---
  // Iki tarafta da adet-ici sayim varsa ve hicbir referans sayimi adayla tam
  // (tam sayi) eslesmiyorsa red. Bir tarafta sayim yoksa bu kapi tetiklenmez.
  const candPacks = extractPackCounts(cand);
  const refPacks = refs.flatMap((n) => extractPackCounts(n));
  if (candPacks.length > 0 && refPacks.length > 0) {
    const cp = candPacks[0];
    const anyEqual = refPacks.some((r) => Math.abs(r - cp) < 0.01);
    if (!anyEqual) {
      return {
        rejected: true,
        reason: `Adet-ici uyumsuz (${cp}'lu vs ${refPacks[0]}'lu)`,
      };
    }
  }

  // --- Olcu (NxM) kapisi ---
  const candD = extractDimensions(cand);
  const refD = refs.flatMap((n) => extractDimensions(n));
  if (candD.length > 0 && refD.length > 0) {
    const cd = candD[0];
    // Olcu ciftini SIRASIZ kiyasla: "80x110" ile "110x80" ayni olcudur.
    const anyEqual = refD.some(
      (r) =>
        (Math.abs(r.a - cd.a) < 0.01 && Math.abs(r.b - cd.b) < 0.01) ||
        (Math.abs(r.a - cd.b) < 0.01 && Math.abs(r.b - cd.a) < 0.01)
    );
    if (!anyEqual) {
      return {
        rejected: true,
        reason: `Olcu uyumsuz (${cd.a}x${cd.b} vs ${refD[0].a}x${refD[0].b})`,
      };
    }
  }

  // --- Urun-tipi kapisi ---
  const candT = extractTypeClasses(cand);
  const refT = new Set<string>();
  refs.forEach((n) => extractTypeClasses(n).forEach((c) => refT.add(c)));
  if (candT.size > 0 && refT.size > 0) {
    let intersects = false;
    for (const c of candT) {
      if (refT.has(c)) {
        intersects = true;
        break;
      }
    }
    if (!intersects) {
      return {
        rejected: true,
        reason: `Urun tipi uyumsuz (${Array.from(candT).join('/')} vs ${Array.from(refT).join('/')})`,
      };
    }
  }

  return { rejected: false, reason: null };
}

class FamilyCandidateService {
  /**
   * Verilen urun kodlari icin en benzer aktif aileyi onerir.
   * Donen map'te oneri bulunamayan (veya PG Product cache'inde olmayan) kodlar null'dur.
   *
   * Skorun uzerine SERT kapilar uygulanir:
   *  - Kategori kisiti (aday urun categoryId vs ailenin cogunluk categoryId).
   *  - Sayisal + tip kapilari (evaluateNameGuards).
   */
  async suggestFamilies(productCodes: string[]): Promise<FamilySuggestionMap> {
    const codes = Array.from(
      new Set(
        (Array.isArray(productCodes) ? productCodes : [])
          .map((code) => String(code || '').trim().toUpperCase())
          .filter(Boolean)
      )
    );
    if (codes.length === 0) {
      throw new AppError('En az bir urun kodu gerekli.', 400, ErrorCode.BAD_REQUEST);
    }
    if (codes.length > MAX_CODES) {
      throw new AppError(`Tek seferde en fazla ${MAX_CODES} urun kodu gonderilebilir.`, 400, ErrorCode.BAD_REQUEST);
    }

    const result: FamilySuggestionMap = {};
    codes.forEach((code) => {
      result[code] = null;
    });

    // Urun adlarini + kategori + normalize metni PG cache'inden al
    const products = await prisma.product.findMany({
      where: { mikroCode: { in: codes } },
      select: { mikroCode: true, name: true, searchText: true, categoryId: true },
    });

    const productByCode = new Map(
      products.map((p) => [String(p.mikroCode || '').trim().toUpperCase(), p])
    );

    const queryItems = products
      .map((product) => ({
        code: String(product.mikroCode || '').trim().toUpperCase(),
        norm: String(product.searchText || '').trim() || normalizeSearchText(product.name),
      }))
      .filter((item) => item.code && item.norm);

    if (queryItems.length === 0) {
      return result;
    }

    // Ailelerin cogunluk kategorisini onceden hesapla (kategori kapisi icin).
    const familyMajorityCategory = await this.computeFamilyMajorityCategories();

    // Chunk'la: her chunk tek sorguda LATERAL ile en iyi aile eslesmesini bulur.
    // Aday kume aktif aile + aktif uye ile sinirli; LIMIT 1 ile N x M patlamasi kontrollu.
    // Kapilar bir adayi elerse, "bir sonraki en iyi aday" LATERAL LIMIT 1 ile gorulmez;
    // pratikte tek-en-iyi yeterli (yanlis aile skoru dogru aileninkinden dusuk kalir).
    // Guvenli olmak icin LATERAL'de TOP birkac aday cekip JS'te kapilardan gecen ILK
    // adayi secelim.
    for (let offset = 0; offset < queryItems.length; offset += CHUNK_SIZE) {
      const chunk = queryItems.slice(offset, offset + CHUNK_SIZE);
      const chunkCodes = chunk.map((item) => item.code);
      const chunkNorms = chunk.map((item) => item.norm);

      // Her aday urun icin skoru MIN_SCORE ustunde olan en iyi 5 aile-eslesmesi
      // dondur; JS'te kapilardan gecen ilkini sec.
      const rows = await prisma.$queryRaw<SuggestionRow[]>(Prisma.sql`
        SELECT
          q.code AS "code",
          best."familyId" AS "familyId",
          best."familyName" AS "familyName",
          best.score AS "score",
          best."matchedProductName" AS "matchedProductName"
        FROM unnest(${chunkCodes}::text[], ${chunkNorms}::text[]) AS q(code, norm)
        LEFT JOIN LATERAL (
          SELECT
            pfi."familyId",
            pf.name AS "familyName",
            similarity(
              COALESCE(
                NULLIF(p2."searchText", ''),
                trim(regexp_replace(
                  lower(translate(coalesce(pfi."productName", ''), 'ÇĞİıÖŞÜçğöşü', 'CGIIOSUcgosu')),
                  '[^a-z0-9]+', ' ', 'g'
                ))
              ),
              q.norm
            ) AS score,
            COALESCE(p2.name, pfi."productName", pfi."productCode") AS "matchedProductName"
          FROM "ProductFamilyItem" pfi
          INNER JOIN "ProductFamily" pf ON pf.id = pfi."familyId" AND pf.active = true
          LEFT JOIN "Product" p2 ON p2.id = pfi."productId"
          WHERE pfi.active = true
            AND upper(pfi."productCode") <> q.code
          ORDER BY score DESC
          LIMIT 5
        ) best ON true
        WHERE best."familyId" IS NOT NULL AND best.score >= ${MIN_SCORE}
        ORDER BY q.code, best.score DESC
      `);

      // Aday urun kodu -> sirali (skor desc) aday listesi
      const byCode = new Map<string, SuggestionRow[]>();
      (Array.isArray(rows) ? rows : []).forEach((row) => {
        const code = String(row?.code || '').trim().toUpperCase();
        if (!code || !row?.familyId) return;
        const score = Number(row?.score);
        if (!Number.isFinite(score) || score < MIN_SCORE) return;
        if (!byCode.has(code)) byCode.set(code, []);
        byCode.get(code)!.push(row);
      });

      for (const [code, candidateRows] of byCode.entries()) {
        const candProduct = productByCode.get(code);
        const candCategoryId = candProduct?.categoryId
          ? String(candProduct.categoryId)
          : null;
        const candName = candProduct?.name || '';

        // Kapilardan gecen ilk (en yuksek skorlu) adayi sec.
        // candidateRows skor-desc sirali; ayni aileden birden fazla uye gelebilir,
        // her aileyi bir kez (en iyi uyesiyle) degerlendir.
        const seenFamilies = new Set<string>();
        const accepted = candidateRows.find((row) => {
          const familyId = String(row.familyId);
          if (seenFamilies.has(familyId)) return false;
          seenFamilies.add(familyId);

          const familyName = String(row.familyName || '').trim();
          const matchedName = String(row.matchedProductName || '').trim();

          // (a) KATEGORI kapisi
          const familyCat = familyMajorityCategory.get(familyId) || null;
          if (candCategoryId && familyCat && candCategoryId !== familyCat) {
            return false;
          }

          // (b)+(c) sayisal + tip kapilari (aday adi vs eslesen uye adi + aile adi)
          const guard = evaluateNameGuards(candName, [matchedName, familyName]);
          if (guard.rejected) return false;

          return true;
        });

        if (accepted) {
          const score = Number(accepted.score);
          result[code] = {
            familyId: String(accepted.familyId),
            familyName: String(accepted.familyName || '').trim(),
            score: Math.round(score * 1000) / 1000,
            matchedProductName: String(accepted.matchedProductName || '').trim(),
          };
        } else {
          result[code] = null;
        }
      }
    }

    return result;
  }

  /**
   * Her aktif aile icin, aktif uyelerinin Product.categoryId cogunlugunu dondurur.
   * Kategori kapisi icin kullanilir. productId'si olmayan (kategorisi bilinmeyen)
   * uyeler oy kullanmaz.
   */
  async computeFamilyMajorityCategories(): Promise<Map<string, string>> {
    const rows = await prisma.$queryRaw<
      Array<{ familyId: string; categoryId: string | null; cnt: bigint | number }>
    >(Prisma.sql`
      SELECT pfi."familyId" AS "familyId", p."categoryId" AS "categoryId", COUNT(*) AS cnt
      FROM "ProductFamilyItem" pfi
      INNER JOIN "ProductFamily" pf ON pf.id = pfi."familyId" AND pf.active = true
      INNER JOIN "Product" p ON p.id = pfi."productId"
      WHERE pfi.active = true
      GROUP BY pfi."familyId", p."categoryId"
    `);

    // familyId -> (categoryId -> count) reduce -> en yuksek count'lu kategori
    const byFamily = new Map<string, Map<string, number>>();
    (Array.isArray(rows) ? rows : []).forEach((r) => {
      const familyId = String(r.familyId || '');
      const categoryId = r.categoryId ? String(r.categoryId) : '';
      if (!familyId || !categoryId) return;
      const cnt = Number(r.cnt) || 0;
      if (!byFamily.has(familyId)) byFamily.set(familyId, new Map());
      const inner = byFamily.get(familyId)!;
      inner.set(categoryId, (inner.get(categoryId) || 0) + cnt);
    });

    const out = new Map<string, string>();
    for (const [familyId, inner] of byFamily.entries()) {
      let bestCat = '';
      let bestCnt = -1;
      for (const [cat, cnt] of inner.entries()) {
        if (cnt > bestCnt) {
          bestCnt = cnt;
          bestCat = cat;
        }
      }
      if (bestCat) out.set(familyId, bestCat);
    }
    return out;
  }

  /**
   * Onerilen urunu aileye ekler. Ayni ailede AKTIF kayit varsa 409 doner;
   * pasif kayit varsa yeniden aktive eder (unique [familyId, productCode]).
   */
  async addProductToFamily(
    familyId: string,
    input: { productCode?: string; productName?: string | null },
    userName?: string | null
  ) {
    const normalizedFamilyId = String(familyId || '').trim();
    const productCode = String(input?.productCode || '').trim().toUpperCase();
    if (!normalizedFamilyId) {
      throw new AppError('Aile secimi zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }
    if (!productCode) {
      throw new AppError('Urun kodu zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }

    const family = await prisma.productFamily.findUnique({
      where: { id: normalizedFamilyId },
      select: { id: true, name: true, active: true },
    });
    if (!family) {
      throw new AppError('Stok ailesi bulunamadi.', 404, ErrorCode.NOT_FOUND);
    }
    if (!family.active) {
      throw new AppError('Pasif aileye urun eklenemez.', 400, ErrorCode.BAD_REQUEST);
    }

    const product = await prisma.product.findFirst({
      where: { mikroCode: productCode },
      select: { id: true, name: true },
    });
    const productName =
      String(input?.productName || '').trim() || product?.name || null;

    const existing = await prisma.productFamilyItem.findUnique({
      where: { familyId_productCode: { familyId: family.id, productCode } },
      select: { id: true, active: true },
    });
    if (existing?.active) {
      throw new AppError('Bu urun zaten bu ailede aktif olarak kayitli.', 409, ErrorCode.BAD_REQUEST);
    }

    const maxPriority = await prisma.productFamilyItem.aggregate({
      where: { familyId: family.id },
      _max: { priority: true },
    });
    const priority = (Number(maxPriority._max.priority) || 0) + 1;

    const item = existing
      ? await prisma.productFamilyItem.update({
          where: { id: existing.id },
          data: {
            active: true,
            priority,
            productId: product?.id || null,
            productName,
          },
        })
      : await prisma.productFamilyItem.create({
          data: {
            familyId: family.id,
            productCode,
            productName,
            productId: product?.id || null,
            priority,
            active: true,
          },
        });

    await this.logOperation({
      operationType: 'PRODUCT_FAMILY_UPDATE',
      title: 'Aday aileden eklendi',
      productCode,
      productName,
      familyId: family.id,
      familyName: family.name,
      newValues: { productCode, productName, priority, active: true },
      metadata: { reactivated: Boolean(existing) },
      userName: userName || null,
    });

    return {
      item,
      family: { id: family.id, name: family.name },
    };
  }

  /**
   * Aile uyesini pasifler (active=false). Fiziksel silmez; unique kaydi korur.
   * UcarerOperationLog 'PRODUCT_FAMILY_UPDATE' / 'Aileden cikarildi' yazar.
   * Zaten pasif/olmayan uye icin removed=false doner (hata firlatmaz, idempotent).
   */
  async removeProductFromFamily(
    familyId: string,
    productCode: string,
    userName?: string | null
  ): Promise<{ removed: boolean }> {
    const normalizedFamilyId = String(familyId || '').trim();
    const code = String(productCode || '').trim().toUpperCase();
    if (!normalizedFamilyId) {
      throw new AppError('Aile secimi zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }
    if (!code) {
      throw new AppError('Urun kodu zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }

    const family = await prisma.productFamily.findUnique({
      where: { id: normalizedFamilyId },
      select: { id: true, name: true },
    });
    if (!family) {
      throw new AppError('Stok ailesi bulunamadi.', 404, ErrorCode.NOT_FOUND);
    }

    const existing = await prisma.productFamilyItem.findUnique({
      where: { familyId_productCode: { familyId: family.id, productCode: code } },
      select: { id: true, active: true, productName: true },
    });
    if (!existing || !existing.active) {
      return { removed: false };
    }

    await prisma.productFamilyItem.update({
      where: { id: existing.id },
      data: { active: false },
    });

    await this.logOperation({
      operationType: 'PRODUCT_FAMILY_UPDATE',
      title: 'Aileden cikarildi',
      productCode: code,
      productName: existing.productName || null,
      familyId: family.id,
      familyName: family.name,
      previousValues: { active: true },
      newValues: { active: false },
      userName: userName || null,
    });

    return { removed: true };
  }

  /**
   * UcarerOperationLog kaydi (reports.service.ts logUcarerOperation kalibi;
   * bu serviste aktor adi dogrudan userName olarak gelir).
   */
  private async logOperation(input: {
    operationType: string;
    title: string;
    productCode?: string | null;
    productName?: string | null;
    familyId?: string | null;
    familyName?: string | null;
    previousValues?: Record<string, any> | any[] | null;
    newValues?: Record<string, any> | any[] | null;
    metadata?: Record<string, any> | any[] | null;
    userName?: string | null;
  }): Promise<void> {
    try {
      const jsonOrUndefined = (value: unknown): Prisma.InputJsonValue | undefined => {
        if (value === undefined || value === null) return undefined;
        return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
      };
      await prisma.ucarerOperationLog.create({
        data: {
          operationType: String(input.operationType || 'UNKNOWN').trim() || 'UNKNOWN',
          title: String(input.title || '').trim() || 'Ucarer islemi',
          productCode: input.productCode ? String(input.productCode).trim().toUpperCase() : null,
          productName: input.productName ? String(input.productName).trim() : null,
          familyId: input.familyId ? String(input.familyId).trim() : null,
          familyName: input.familyName ? String(input.familyName).trim() : null,
          orderNumbers: [],
          previousValues: jsonOrUndefined(input.previousValues),
          newValues: jsonOrUndefined(input.newValues),
          metadata: jsonOrUndefined(input.metadata),
          userId: null,
          userName: input.userName ? String(input.userName).trim() : null,
        },
      });
    } catch (error) {
      console.warn('Aday aile islem logu yazilamadi:', error);
    }
  }
}

export default new FamilyCandidateService();
