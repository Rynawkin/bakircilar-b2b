/**
 * Aday Aile Motoru (Aile Kapsama Radari)
 *
 * Ailesiz urunler icin pg_trgm benzerligiyle en uygun mevcut AKTIF stok ailesini
 * onerir (similarity >= 0.35). Karsilastirma normalize metin uzerinden yapilir:
 * girdiler normalizeSearchText ile, aile uyeleri Product.searchText (DB generated,
 * ayni normalizasyon; migration 20260630120000) ile eslestirilir.
 *
 * ONERI KALIBRASYONU (2026-07 Round 5 — Round 4'un asiri sert kapilari gevsetildi):
 * Round 4'te eklenen SERT kapilar (kategori esitligi + %15 gramaj + tam oz/adet-ici/olcu +
 * tip-kesisim) yakaladigi az sayida kotu oneriden cok daha fazla IYI oneriyi de eliyordu.
 * Kullanici Round 3'teki bol-oneri davranisini tercih ettigi icin oneri motoru yeniden
 * ayarlandi (bkz. scoreSuggestionCandidate + suggestFamilies):
 *  - FINAL skor = pg_trgm taban skoru + kategori TESVIKI (- gevsek cezalar).
 *  - KATEGORI: sert red DEGIL, yumusak +0.08 tesvik (Mikro kategorileri tutarsiz oldugu icin).
 *  - SERT RED yalnizca gercekten celiskili adaylar icin:
 *     a) TIP-SINIFI ayrik (pecete vs havlu, dispenser pecete vs z-havlu),
 *     b) ASIRI gramaj uyumsuzlugu (goreli fark > %50; 250g vs 1500g gibi),
 *     c) ASIRI oz uyumsuzlugu (goreli fark > %50).
 *  - GEVSEK (red DEGIL, ufak -0.03 ceza): orta gramaj farki (%15-50), olcu (NxM) uyumsuz,
 *     adet-ici (Nlu) uyumsuz — bunlar genelde ayni ailenin boy/paket varyantidir.
 *  - FINAL skoru >= 0.35 olan en yuksek FINAL skorlu aday secilir (aileye gore dedup).
 *
 * NOT: evaluateNameGuards SERT kapisi (gramaj %15 / tam oz-adet-olcu / tip-kesisim) DEGISMEDI;
 * family-report.service kume olusturma ve aykiri uye tespitinde bu sikiligi kullanmaya devam
 * ediyor. Oneri motoru artik o sert kapiyi cagirmiyor; scoreSuggestionCandidate'i kullaniyor.
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
// NOT: bu tolerans SADECE evaluateNameGuards (SERT kapi) icin gecerli; bu kapi
// family-report.service tarafindan kume/aykiri tespitinde kullanilir ve orada
// sikiliginin korunmasi ISTENIR. suggestFamilies (Aday Aile onerisi) ARTIK bu sert
// kapiyi KULLANMAZ; bunun yerine asagidaki gevsek "scoreSuggestionCandidate" mantigini
// kullanir (bkz. Round 5 rekalibrasyonu).
const WEIGHT_REL_TOLERANCE = 0.15;

/* ============================================================================
 * ROUND 5 REKALIBRASYON — ADAY AILE ONERI ESIKLERI
 *
 * GEREKCE: Round 4'te suggestFamilies'e eklenen SERT kapilar (kategori esitligi +
 * evaluateNameGuards: gramaj %15 / oz-tam / adet-ici-tam / olcu-tam / tip-kesisim)
 * yakaladigi az sayida kotu oneriden cok daha fazla IYI oneriyi de reddediyordu.
 * Kullanici Round 3'teki bol-oneri davranisini tercih ediyor. Bu yuzden oneri motoru
 * yeniden ayarlanir: kategori ARTIK asla reddetmez (yalnizca yumusak +0.08 tesvik),
 * ve yalnizca gercekten CELISKILI durumlar SERT reddedilir:
 *   (a) TIP-SINIFI ayrik: her iki tarafta da taninan urun-tipi var ve kesisim BOS
 *       (pecete vs havlu, dispenser pecete vs z-havlu -> gercekten farkli urun).
 *   (b) ASIRI gramaj uyumsuzlugu: iki tarafta da gramaj var ve goreli fark > %50
 *       (250g vs 1500g = %83 -> red; 400g vs 500g = %20 -> KAL).
 *   (c) ASIRI oz uyumsuzlugu: iki tarafta da oz var ve goreli fark > %50.
 * Orta gramaj farki (%15-50), olcu (NxM) uyumsuzlugu ve adet-ici (Nlu) uyumsuzlugu
 * ARTIK REDDETMEZ; bunlar genelde AYNI ailenin farkli boy/paket varyantlaridir.
 * Sadece siralamada ufak bir ceza (-0.03) alirlar, boylece tam uyumlu aday one gecer.
 * ==========================================================================*/

// Kategori esitligi: sert red DEGIL, yumusak tesvik. Mikro kategorileri tutarsiz
// oldugu icin kategori farki oneriyi ELEMEZ; sadece ayni kategoriye kucuk bonus.
const CATEGORY_MATCH_BOOST = 0.08;

// Sert red esigi: gramaj/oz goreli farki bunu asarsa (iki tarafta da olcum varsa) red.
// %50 = 0.5. denom = max(a,b). 400/500 = 0.2 -> KAL; 250/1500 = 0.83 -> RED.
const EXTREME_REL_TOLERANCE = 0.5;

// Orta gramaj farki bandi: bu banttaki (WEIGHT_REL_TOLERANCE < fark <= EXTREME)
// aday reddedilmez, sadece ufak siralama cezasi alir.
const SOFT_MISMATCH_PENALTY = 0.03;

// Oneri motorunun kabul esigi (pg_trgm taban skoru). Round 3 ile ayni: 0.35.
const SUGGEST_MIN_SCORE = MIN_SCORE;

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

/* ============================================================================
 * ROUND 5: ADAY AILE ONERI SKORLAMASI (gevsek)
 *
 * evaluateNameGuards SERT kapisi (family-report kume/aykiri tespiti icin) DEGISMEDEN
 * kalir. Aday Aile ONERI motoru ise asagidaki gevsek mantigi kullanir:
 *  - HARD REJECT yalnizca: tip-sinifi ayrik | asiri gramaj (>%50) | asiri oz (>%50).
 *  - DEMOTE (red DEGIL, ufak -0.03 ceza): orta gramaj farki (%15-50), olcu uyumsuz,
 *    adet-ici uyumsuz. Bunlar genelde ayni ailenin boy/paket varyantidir.
 * Donen 'penalty' final skordan cikarilir; 'rejected' true ise aday tamamen elenir.
 * ==========================================================================*/

export interface SuggestScore {
  rejected: boolean;
  penalty: number; // final skordan cikarilacak toplam ceza (>= 0)
  reason: string | null; // red/ceza gerekcesi (log/debug icin)
}

/**
 * Bir aday aile-eslesmesini oneri motoru icin degerlendirir. evaluateNameGuards'in
 * aksine cogu uyumsuzluk REDDETMEZ; yalnizca gercekten celiskili uc durumlar reddedilir.
 * candidateName: aday (ailesiz) urun adi.
 * referenceNames: aday ailenin kanit isimleri (eslesen uye adi + aile adi).
 */
export function scoreSuggestionCandidate(
  candidateName: string,
  referenceNames: string[]
): SuggestScore {
  const cand = String(candidateName || '');
  const refs = (referenceNames || []).map((n) => String(n || '')).filter(Boolean);
  if (!cand || refs.length === 0) return { rejected: false, penalty: 0, reason: null };

  let penalty = 0;
  const notes: string[] = [];

  // --- (a) TIP-SINIFI kapisi: SERT RED (ayrik ise) ---
  // Iki tarafta da taninan urun-tipi var ve kesisim BOS ise gercekten farkli urundur
  // (pecete vs havlu, dispenser pecete vs z-havlu). Bu kapi Round 4'ten aynen korunur.
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
        penalty: 0,
        reason: `Urun tipi ayrik (${Array.from(candT).join('/')} vs ${Array.from(refT).join('/')})`,
      };
    }
  }

  // --- (b) GRAMAJ kapisi: ASIRI fark SERT RED, orta fark yalnizca ufak ceza ---
  const candW = extractWeights(cand);
  const refW = refs.flatMap((n) => extractWeights(n));
  if (candW.length > 0 && refW.length > 0) {
    const cg = candW[0].grams;
    // En yakin referans gramaji ile goreli fark (denom = max, boylece simetrik).
    let bestRel = Infinity;
    let nearest = refW[0];
    for (const r of refW) {
      const denom = Math.max(cg, r.grams) || 1;
      const rel = Math.abs(cg - r.grams) / denom;
      if (rel < bestRel) {
        bestRel = rel;
        nearest = r;
      }
    }
    if (bestRel > EXTREME_REL_TOLERANCE) {
      // Asiri uyumsuz (>%50): 250g vs 1500g gibi -> gercekten farkli boy sinifi.
      return {
        rejected: true,
        penalty: 0,
        reason: `Gramaj asiri uyumsuz (${candW[0].raw} vs ${nearest.raw})`,
      };
    }
    if (bestRel > WEIGHT_REL_TOLERANCE) {
      // Orta fark (%15-50): 400g vs 500g -> ayni aile, farkli boy; sadece ufak ceza.
      penalty += SOFT_MISMATCH_PENALTY;
      notes.push(`Gramaj orta fark (${candW[0].raw} vs ${nearest.raw})`);
    }
  }

  // --- (c) OZ kapisi: ASIRI fark SERT RED, aksi halde dokunma ---
  const candOz = extractOunces(cand);
  const refOz = refs.flatMap((n) => extractOunces(n));
  if (candOz.length > 0 && refOz.length > 0) {
    const co = candOz[0];
    let bestRel = Infinity;
    let nearest = refOz[0];
    for (const r of refOz) {
      const denom = Math.max(co, r) || 1;
      const rel = Math.abs(co - r) / denom;
      if (rel < bestRel) {
        bestRel = rel;
        nearest = r;
      }
    }
    if (bestRel > EXTREME_REL_TOLERANCE) {
      return {
        rejected: true,
        penalty: 0,
        reason: `Oz asiri uyumsuz (${co}oz vs ${nearest}oz)`,
      };
    }
    // Orta oz farki icin ceza uygulamayiz: oz zaten kaba bir sinyal.
  }

  // --- OLCU (NxM) kapisi: red DEGIL, yalnizca ufak ceza ---
  // 80x110 vs 70x120 gibi farkli boy ayni ailenin varyantidir; elenmemeli.
  const candD = extractDimensions(cand);
  const refD = refs.flatMap((n) => extractDimensions(n));
  if (candD.length > 0 && refD.length > 0) {
    const cd = candD[0];
    const anyEqual = refD.some(
      (r) =>
        (Math.abs(r.a - cd.a) < 0.01 && Math.abs(r.b - cd.b) < 0.01) ||
        (Math.abs(r.a - cd.b) < 0.01 && Math.abs(r.b - cd.a) < 0.01)
    );
    if (!anyEqual) {
      penalty += SOFT_MISMATCH_PENALTY;
      notes.push(`Olcu farkli (${cd.a}x${cd.b})`);
    }
  }

  // --- ADET-ICI (Nlu / N adet) kapisi: red DEGIL, yalnizca ufak ceza ---
  // 12'li vs 24'lu ayni urunun farkli paketidir; elenmemeli.
  const candPacks = extractPackCounts(cand);
  const refPacks = refs.flatMap((n) => extractPackCounts(n));
  if (candPacks.length > 0 && refPacks.length > 0) {
    const cp = candPacks[0];
    const anyEqual = refPacks.some((r) => Math.abs(r - cp) < 0.01);
    if (!anyEqual) {
      penalty += SOFT_MISMATCH_PENALTY;
      notes.push(`Adet-ici farkli (${cp}'lu)`);
    }
  }

  return { rejected: false, penalty, reason: notes.length ? notes.join('; ') : null };
}

class FamilyCandidateService {
  /**
   * Verilen urun kodlari icin en uygun aktif aileyi onerir (Aday Aile).
   * Donen map'te oneri bulunamayan (veya PG Product cache'inde olmayan) kodlar null'dur.
   *
   * ROUND 5 REKALIBRASYONU (bol ve isabetli oneri):
   *  - pg_trgm taban skoru + kategori tesviki ile FINAL skor hesaplanir.
   *    categoryBoost = +0.08 aday kategorisi ailenin cogunluk kategorisiyle esitse, aksi
   *    halde 0. Kategori ASLA reddetmez (Mikro kategorileri tutarsiz).
   *  - Aday SADECE su durumlarda SERT reddedilir (scoreSuggestionCandidate):
   *    tip-sinifi ayrik | asiri gramaj (>%50) | asiri oz (>%50).
   *  - Orta gramaj farki (%15-50), olcu ve adet-ici uyumsuzluklari REDDETMEZ; final
   *    skordan ufak (-0.03) ceza alir (tam uyumlu aday one gecsin diye).
   *  - Aileye gore dedup edilir (aile basina en yuksek FINAL skorlu aday), FINAL skoru
   *    >= 0.35 olan en yuksek FINAL skorlu aday secilir. Gosterilen 'score' = FINAL skor.
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

    // Ailelerin cogunluk kategorisini onceden hesapla (kategori TESVIKI icin; red DEGIL).
    const familyMajorityCategory = await this.computeFamilyMajorityCategories();

    // Chunk'la: her chunk tek sorguda LATERAL ile aday urun basina en iyi 5 aile-eslesmesini
    // bulur (aile-ici birden fazla uye de gelebilir). JS'te her aile bir kez (en iyi uyesiyle)
    // degerlendirilir; kategori tesviki + gevsek ceza uygulanip FINAL skor hesaplanir ve
    // FINAL skoru en yuksek (>= 0.35) aday secilir. LIMIT 5 tabani, bir SERT-red aday
    // elendiginde bir sonraki iyi adayin gorulebilmesi icin gerekli.
    for (let offset = 0; offset < queryItems.length; offset += CHUNK_SIZE) {
      const chunk = queryItems.slice(offset, offset + CHUNK_SIZE);
      const chunkCodes = chunk.map((item) => item.code);
      const chunkNorms = chunk.map((item) => item.norm);

      // Her aday urun icin taban skoru SUGGEST_MIN_SCORE ustunde olan en iyi 5
      // aile-eslesmesi dondur; JS'te kategori tesviki + gevsek ceza ile FINAL skoru
      // en yuksek adayi sec.
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

        // Her aileyi bir kez (en iyi taban skorlu uyesiyle) degerlendir. candidateRows
        // taban-skor desc sirali oldugu icin bir aile ilk gorunusunde en iyi uyesidir.
        // Kategori TESVIKI (+0.08) + gevsek ceza uygulayip FINAL skoru hesapla; SERT-red
        // adaylar (tip-ayrik / asiri gramaj / asiri oz) elenir. Aile basina en yuksek
        // FINAL skoru tut, sonra global en yuksek FINAL (>= SUGGEST_MIN_SCORE) adayi sec.
        const seenFamilies = new Set<string>();
        let best: {
          familyId: string;
          familyName: string;
          matchedProductName: string;
          baseScore: number;
          finalScore: number;
        } | null = null;

        for (const row of candidateRows) {
          const familyId = String(row.familyId);
          if (seenFamilies.has(familyId)) continue; // aile-ici dedup: en iyi uye zaten ilk
          seenFamilies.add(familyId);

          const familyName = String(row.familyName || '').trim();
          const matchedName = String(row.matchedProductName || '').trim();
          const baseScore = Number(row.score);
          if (!Number.isFinite(baseScore)) continue;

          // Gevsek degerlendirme: yalnizca gercekten celiskili adaylar reddedilir.
          const evalRes = scoreSuggestionCandidate(candName, [matchedName, familyName]);
          if (evalRes.rejected) continue;

          // Kategori TESVIKI (asla red): ayni cogunluk kategorisi -> +0.08.
          const familyCat = familyMajorityCategory.get(familyId) || null;
          const categoryBoost =
            candCategoryId && familyCat && candCategoryId === familyCat
              ? CATEGORY_MATCH_BOOST
              : 0;

          // FINAL skor = taban + kategori tesviki - gevsek cezalar.
          const finalScore = baseScore + categoryBoost - evalRes.penalty;

          if (!best || finalScore > best.finalScore) {
            best = { familyId, familyName, matchedProductName: matchedName, baseScore, finalScore };
          }
        }

        // KABUL esigi TABAN skora bakar (gevsek cezalar SADECE siralama icindir, red degil):
        // taban >= SUGGEST_MIN_SCORE olan her red-edilmemis aile gosterilir; cezalar
        // yalnizca hangi ailenin one gececegini belirler. Boylece 'demote, reject etme'
        // ilkesi bit-bit korunur ve yigilan cezalar taban-gecerli varyanti dusurmez.
        if (best && best.baseScore >= SUGGEST_MIN_SCORE) {
          // Kategori tesviki taban skoru 1.0 uzerine cikarabilir (0.95 + 0.08). Frontend
          // yuzdeyi 'score <= 1 ? score*100 : score' ile hesapladigi icin 1.0'a kirp;
          // boylece near-perfect eslesme "%1" degil "%100" gorunur.
          const displayScore = Math.min(1, best.finalScore);
          result[code] = {
            familyId: best.familyId,
            familyName: best.familyName,
            // Gosterilen skor = FINAL skor (taban + kategori tesviki - ceza), 3 haneli.
            score: Math.round(displayScore * 1000) / 1000,
            matchedProductName: best.matchedProductName,
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
