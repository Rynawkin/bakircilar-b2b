/**
 * Aile Yonetimi Raporlari (Family Management Reports) — Round 4
 *
 * Stok ailesi yonetimini kolaylastiran uc rapor + iki bakim islemi:
 *  1) getFamilySuggestions : ailesiz + hareketli urunler icin mevcut aileye ONERI
 *     (family-candidate.suggestFamilies'in gelismis kapilariyla). Sadece adayi olanlar.
 *  2) getFamilyClusters    : adayi OLMAYAN ailesiz urunleri, ayni kategori icinde
 *     pg_trgm ile kumeler (yeni aile onerisi). >=2 urunlu kumeler.
 *  3) getFamilyOutliers    : mevcut ailelerde SUPHELI (yanlis) uyeleri isaretler.
 *  + removeProductFromFamily : uyeyi pasifler (family-candidate servisine delege).
 *  + getFamilyUnitMismatch : birim tutarsiz aileleri listeler (dominantUnit + tum uyeler).
 *  + setFamilyItemUnitFactor: ProductFamilyItem.unitFactorOverride set/temizle + log.
 *
 * Salt-okuma (rapor fonksiyonlari) + kucuk bakim yazmalari (remove/setFactor).
 * Mikro'ya yazma YOKTUR.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { AppError, ErrorCode } from '../types/errors';
import { normalizeSearchText } from '../utils/search';
import familyCandidateService, {
  evaluateNameGuards,
  extractWeights,
  extractDimensions,
} from './family-candidate.service';
import { normalizeUnitName } from './stock-family-suggestion.service';

// Kumeleme benzerlik esigi (seed'e uzaklik). suggestFamilies MIN_SCORE'undan (0.35)
// biraz yuksek: yeni aile onerecegiz, yanlis birlestirme maliyeti daha yuksek.
const CLUSTER_SIM_THRESHOLD = 0.45;
// Outlier: uyenin diger uyelere en iyi benzerligi bu esigin altindaysa supheli.
const OUTLIER_SIM_THRESHOLD = 0.3;
// suggestFamilies chunk boyutu (servis kendi icinde de chunk'lar; universe'i de parcalayalim)
const SUGGEST_CHUNK = 200;

/* ============================================================================
 * TIPLER
 * ==========================================================================*/

export interface FamilySuggestionReportRow {
  productCode: string;
  productName: string;
  unit: string;
  categoryName: string | null;
  candidate: {
    familyId: string;
    familyName: string;
    score: number;
    matchedProductName: string;
  } | null;
}

export interface FamilyClusterProduct {
  productCode: string;
  productName: string;
  unit: string;
  categoryName: string | null;
}

export interface FamilyCluster {
  suggestedName: string;
  products: FamilyClusterProduct[];
}

export interface FamilyOutlierRow {
  familyId: string;
  familyName: string;
  itemId: string;
  productCode: string;
  productName: string;
  score: number;
  reason: string;
}

export interface FamilyUnitMismatchMember {
  itemId: string;
  productCode: string;
  productName: string;
  unit: string;
  unit2: string | null;
  unit2Factor: number | null;
  unitFactorOverride: number | null;
  /**
   * true ise bu uyenin birimi (normalize bazda) ailenin dominant biriminden farkli.
   * Frontend RAW buyuk-harf kiyasi yerine bu alani kullanmali (es-anlam KL vs KOLI
   * yanlis isaretlenmesin diye normalize kiyas backend'de yapilir).
   */
  mismatched: boolean;
}

export interface FamilyUnitMismatchFamily {
  familyId: string;
  familyName: string;
  dominantUnit: string;
  members: FamilyUnitMismatchMember[];
}

/* ============================================================================
 * DAHILI: UNIVERSE (ailesiz + hareketli urunler)
 * ==========================================================================*/

interface UniverseProduct {
  id: string;
  mikroCode: string;
  name: string;
  unit: string;
  searchText: string; // normalize; bosssa isimden turetilir
  categoryId: string;
  categoryName: string | null;
}

class FamilyReportService {
  /**
   * Ailesiz + hareketli urun evreni.
   * - Aktif Product
   * - Herhangi bir aileye AKTIF uye DEGIL
   * - Hareketli: dahil-depolardaki warehouseStocks toplami > 0 VEYA excessStock > 0
   *   VEYA pendingCustomerOrders > 0
   *
   * warehouseStocks JSON oldugu icin dahil-depo toplamini SQL'de hesaplamak
   * (jsonb_each_text) yerine JS'te filtreliyoruz; universe genelde birkac bin urun.
   */
  private async loadUniverse(): Promise<UniverseProduct[]> {
    const settings = await prisma.settings.findFirst();
    const included = (settings?.includedWarehouses as string[]) || [];

    // Aktif aile uyesi olan kodlar (bunlari universe DISI birak)
    const activeItems = await prisma.productFamilyItem.findMany({
      where: { active: true, family: { active: true } },
      select: { productCode: true },
    });
    const inFamily = new Set(
      activeItems.map((i) => String(i.productCode || '').trim().toUpperCase()).filter(Boolean)
    );

    const products = await prisma.product.findMany({
      where: { active: true },
      select: {
        id: true,
        mikroCode: true,
        name: true,
        unit: true,
        searchText: true,
        categoryId: true,
        warehouseStocks: true,
        excessStock: true,
        pendingCustomerOrders: true,
        category: { select: { name: true } },
      },
    });

    const hasIncluded = Array.isArray(included) && included.length > 0;
    const totalIncludedStock = (ws: any): number => {
      const obj = (ws || {}) as Record<string, number>;
      if (!hasIncluded) {
        return Object.values(obj).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
      }
      return included.reduce((s, w) => s + (Number(obj[w]) || 0), 0);
    };

    const out: UniverseProduct[] = [];
    for (const p of products) {
      const code = String(p.mikroCode || '').trim().toUpperCase();
      if (!code || inFamily.has(code)) continue;
      const stock = totalIncludedStock(p.warehouseStocks);
      const excess = Number(p.excessStock) || 0;
      const pending = Number(p.pendingCustomerOrders) || 0;
      const active = stock > 0 || excess > 0 || pending > 0;
      if (!active) continue;
      const norm = String(p.searchText || '').trim() || normalizeSearchText(p.name);
      if (!norm) continue;
      out.push({
        id: p.id,
        mikroCode: p.mikroCode,
        name: p.name,
        unit: p.unit || 'ADET',
        searchText: norm,
        categoryId: String(p.categoryId || ''),
        categoryName: p.category?.name || null,
      });
    }
    return out;
  }

  /* --------------------------------------------------------------------------
   * 1) ONERI RAPORU: ailesiz urunler -> mevcut aileye aday
   * ------------------------------------------------------------------------*/
  async getFamilySuggestions(
    params: { limit?: number; offset?: number } = {}
  ): Promise<{ rows: FamilySuggestionReportRow[]; total: number }> {
    const limit = Math.min(Math.max(Number(params.limit) || 200, 1), 1000);
    const offset = Math.max(Number(params.offset) || 0, 0);

    const universe = await this.loadUniverse();
    // Kararli siralama (isim) -> sayfalama tutarli olsun
    universe.sort((a, b) => a.name.localeCompare(b.name, 'tr'));

    // suggestFamilies universe'in TAMAMI icin adayi hesaplamak pahali olabilir; ama
    // "sadece adayi olanlar" dondugumuz icin, once TUM universe'e oneri kosup adayi
    // olanlari suzmek gerekir (aksi halde total/rows tutarsiz olur). Servis kendi
    // icinde chunk'liyor; biz de universe'i SUGGEST_CHUNK'la parcalayip birlestiririz.
    const suggestionByCode = new Map<
      string,
      { familyId: string; familyName: string; score: number; matchedProductName: string }
    >();
    for (let i = 0; i < universe.length; i += SUGGEST_CHUNK) {
      const slice = universe.slice(i, i + SUGGEST_CHUNK);
      const map = await familyCandidateService.suggestFamilies(
        slice.map((p) => p.mikroCode)
      );
      Object.entries(map).forEach(([code, sug]) => {
        if (sug) suggestionByCode.set(String(code).trim().toUpperCase(), sug);
      });
    }

    const withCandidate = universe.filter((p) =>
      suggestionByCode.has(String(p.mikroCode).trim().toUpperCase())
    );

    const total = withCandidate.length;
    const pageItems = withCandidate.slice(offset, offset + limit);

    const rows: FamilySuggestionReportRow[] = pageItems.map((p) => {
      const sug = suggestionByCode.get(String(p.mikroCode).trim().toUpperCase()) || null;
      return {
        productCode: p.mikroCode,
        productName: p.name,
        unit: p.unit,
        categoryName: p.categoryName,
        candidate: sug
          ? {
              familyId: sug.familyId,
              familyName: sug.familyName,
              score: sug.score,
              matchedProductName: sug.matchedProductName,
            }
          : null,
      };
    });

    return { rows, total };
  }

  /* --------------------------------------------------------------------------
   * 2) KUMELEME: adayi OLMAYAN ailesiz urunler -> yeni aile onerisi
   * ------------------------------------------------------------------------*/
  async getFamilyClusters(
    params: { limit?: number } = {}
  ): Promise<{ clusters: FamilyCluster[] }> {
    const limit = Math.min(Math.max(Number(params.limit) || 100, 1), 500);

    const universe = await this.loadUniverse();
    if (universe.length === 0) return { clusters: [] };

    // Adayi olanlari cikar (onlar getFamilySuggestions'ta zaten var)
    const suggestionByCode = new Map<string, boolean>();
    for (let i = 0; i < universe.length; i += SUGGEST_CHUNK) {
      const slice = universe.slice(i, i + SUGGEST_CHUNK);
      const map = await familyCandidateService.suggestFamilies(
        slice.map((p) => p.mikroCode)
      );
      Object.entries(map).forEach(([code, sug]) => {
        if (sug) suggestionByCode.set(String(code).trim().toUpperCase(), true);
      });
    }
    const pool = universe.filter(
      (p) => !suggestionByCode.has(String(p.mikroCode).trim().toUpperCase())
    );
    if (pool.length === 0) return { clusters: [] };

    // Kategoriye gore grupla; her grup icinde greedy kumeleme.
    const byCategory = new Map<string, UniverseProduct[]>();
    pool.forEach((p) => {
      const key = p.categoryId || '__none__';
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key)!.push(p);
    });

    const clusters: FamilyCluster[] = [];

    for (const [, group] of byCategory.entries()) {
      if (group.length < 2) continue;

      // Grup ici pg_trgm benzerlik matrisi (norm metinler uzerinden, tek sorgu).
      const codes = group.map((p) => p.mikroCode);
      const norms = group.map((p) => p.searchText);
      // Sadece seed >= threshold ciftlerini cek (SxS ama esik ile filtreli).
      const simRows = await prisma.$queryRaw<
        Array<{ a: string; b: string; sim: number }>
      >(Prisma.sql`
        SELECT x.code AS a, y.code AS b, similarity(x.norm, y.norm) AS sim
        FROM unnest(${codes}::text[], ${norms}::text[]) AS x(code, norm)
        JOIN unnest(${codes}::text[], ${norms}::text[]) AS y(code, norm)
          ON x.code < y.code
        WHERE similarity(x.norm, y.norm) >= ${CLUSTER_SIM_THRESHOLD}
      `);

      // Komsuluk haritasi (kod -> {kod->sim})
      const sim = new Map<string, Map<string, number>>();
      const ensure = (c: string) => {
        if (!sim.has(c)) sim.set(c, new Map());
        return sim.get(c)!;
      };
      (Array.isArray(simRows) ? simRows : []).forEach((r) => {
        const a = String(r.a || '').trim().toUpperCase();
        const b = String(r.b || '').trim().toUpperCase();
        const s = Number(r.sim) || 0;
        if (!a || !b) return;
        ensure(a).set(b, s);
        ensure(b).set(a, s);
      });

      const productByCode = new Map(
        group.map((p) => [String(p.mikroCode).trim().toUpperCase(), p])
      );
      const used = new Set<string>();

      // Greedy: en cok komsulu urunu seed sec, esik ustu + kapilardan gecen uyeleri cek.
      const seedOrder = group
        .map((p) => String(p.mikroCode).trim().toUpperCase())
        .sort((a, b) => (sim.get(b)?.size || 0) - (sim.get(a)?.size || 0));

      for (const seed of seedOrder) {
        if (used.has(seed)) continue;
        const seedProduct = productByCode.get(seed);
        if (!seedProduct) continue;
        const neighbors = sim.get(seed);
        if (!neighbors || neighbors.size === 0) continue;

        const members: UniverseProduct[] = [seedProduct];
        const memberCodes = new Set<string>([seed]);

        // Benzerlik desc sirali komsular
        const sortedNeighbors = Array.from(neighbors.entries()).sort(
          (a, b) => b[1] - a[1]
        );
        for (const [code, s] of sortedNeighbors) {
          if (used.has(code) || memberCodes.has(code)) continue;
          if (s < CLUSTER_SIM_THRESHOLD) continue;
          const cand = productByCode.get(code);
          if (!cand) continue;
          // Kapilar: seed vs aday (gramaj/olcu/tip). Zaten ayni kategori.
          const guard = evaluateNameGuards(cand.name, [seedProduct.name]);
          if (guard.rejected) continue;
          members.push(cand);
          memberCodes.add(code);
        }

        if (members.length >= 2) {
          members.forEach((m) => used.add(String(m.mikroCode).trim().toUpperCase()));
          clusters.push({
            suggestedName: this.buildClusterName(members.map((m) => m.name)),
            products: members.map((m) => ({
              productCode: m.mikroCode,
              productName: m.name,
              unit: m.unit,
              categoryName: m.categoryName,
            })),
          });
          if (clusters.length >= limit) break;
        }
      }
      if (clusters.length >= limit) break;
    }

    return { clusters: clusters.slice(0, limit) };
  }

  /**
   * Kume adi: uye isimlerinden ORTAK anlamli token dizisi. Ilk token markaya
   * benziyorsa (uyeler arasinda farkli) atilir; gramaj/olcu/adet-ici tokenlar cikarilir.
   */
  private buildClusterName(names: string[]): string {
    const cleaned = names
      .map((n) => String(n || '').trim())
      .filter(Boolean);
    if (cleaned.length === 0) return 'Yeni Aile';
    if (cleaned.length === 1) return cleaned[0];

    // Her ismi token'la (orijinal token'lari koru; kiyas normalize uzerinden)
    const tokenized = cleaned.map((n) => ({
      original: n.split(/\s+/).filter(Boolean),
      norm: normalizeSearchText(n).split(' ').filter(Boolean),
    }));

    // Ilk token marka mi? Uyeler arasinda ilk-token FARKLIYSA marka kabul, at.
    const firstNorms = new Set(tokenized.map((t) => t.norm[0] || ''));
    const dropFirst = firstNorms.size > 1;

    // Ortak norm token'lari bul (tum uyelerde gecen), gramaj/olcu/adet-ici olanlari at.
    // Icinde rakam gecen her token guvenli sekilde atilir (gramaj/olcu/adet/kod parcasi).
    const isNumericToken = (tok: string): boolean => /\d/.test(tok);

    const commonNorms: string[] = [];
    const base = tokenized[0].norm;
    base.forEach((tok, idx) => {
      if (dropFirst && idx === 0) return;
      if (!tok) return;
      if (isNumericToken(tok)) return;
      const inAll = tokenized.every((t) => t.norm.includes(tok));
      if (inAll && !commonNorms.includes(tok)) commonNorms.push(tok);
    });

    if (commonNorms.length === 0) {
      // Ortak yoksa: ilk uyenin markasiz + numarasiz halinden isim uret
      const firstClean = tokenized[0].original
        .filter((_, idx) => !(dropFirst && idx === 0))
        .filter((t) => extractWeights(t).length === 0 && extractDimensions(t).length === 0 && !/^\d/.test(t))
        .join(' ')
        .trim();
      return firstClean || cleaned[0];
    }

    // commonNorms normalize; kullaniciya ORIJINAL yazilisi ile goster (ilk uyeden esle)
    const originalByNorm = new Map<string, string>();
    tokenized[0].original.forEach((orig) => {
      const n = normalizeSearchText(orig);
      if (n && !originalByNorm.has(n)) originalByNorm.set(n, orig);
    });
    const label = commonNorms
      .map((n) => originalByNorm.get(n) || n)
      .join(' ')
      .trim();
    return label || cleaned[0];
  }

  /* --------------------------------------------------------------------------
   * 3) OUTLIER: mevcut ailelerde supheli uyeler
   * ------------------------------------------------------------------------*/
  async getFamilyOutliers(): Promise<{ rows: FamilyOutlierRow[] }> {
    // Aktif ailelerin >=2 aktif uyeli olanlari + uye urun bilgisi
    const families = await prisma.productFamily.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        items: {
          where: { active: true },
          select: {
            id: true,
            productCode: true,
            productName: true,
            product: {
              select: { name: true, categoryId: true, searchText: true, unit: true },
            },
          },
        },
      },
    });

    const rows: FamilyOutlierRow[] = [];

    for (const fam of families) {
      const members = fam.items;
      if (members.length < 2) continue;

      // Uye "temsili isim" ve normalize metin
      const enriched = members.map((it) => {
        const name = it.product?.name || it.productName || it.productCode;
        const norm =
          String(it.product?.searchText || '').trim() || normalizeSearchText(name);
        return {
          itemId: it.id,
          productCode: it.productCode,
          name,
          norm,
          categoryId: it.product?.categoryId ? String(it.product.categoryId) : null,
        };
      });

      // Kategori cogunlugu (>=3 uyeli ailelerde azinlik kategori outlier sebebi)
      const catCount = new Map<string, number>();
      enriched.forEach((e) => {
        if (e.categoryId) catCount.set(e.categoryId, (catCount.get(e.categoryId) || 0) + 1);
      });
      let majorityCat: string | null = null;
      let majorityCnt = -1;
      for (const [cat, cnt] of catCount.entries()) {
        if (cnt > majorityCnt) {
          majorityCnt = cnt;
          majorityCat = cat;
        }
      }

      // Uyeler-arasi pg_trgm benzerlik (norm) — tek sorgu.
      const codes = enriched.map((e) => e.productCode);
      const norms = enriched.map((e) => e.norm);
      const simRows = await prisma.$queryRaw<
        Array<{ a: string; b: string; sim: number }>
      >(Prisma.sql`
        SELECT x.code AS a, y.code AS b, similarity(x.norm, y.norm) AS sim
        FROM unnest(${codes}::text[], ${norms}::text[]) AS x(code, norm)
        JOIN unnest(${codes}::text[], ${norms}::text[]) AS y(code, norm)
          ON x.code <> y.code
      `);

      // kod -> en iyi benzerlik (digerlerine)
      const bestSim = new Map<string, number>();
      (Array.isArray(simRows) ? simRows : []).forEach((r) => {
        const a = String(r.a || '').trim().toUpperCase();
        const s = Number(r.sim) || 0;
        if (!a) return;
        if (!bestSim.has(a) || s > (bestSim.get(a) as number)) bestSim.set(a, s);
      });

      for (const e of enriched) {
        const codeUpper = String(e.productCode).trim().toUpperCase();
        const best = bestSim.get(codeUpper) ?? 0;
        const reasons: string[] = [];

        // (1) benzerlik dusuk
        if (best < OUTLIER_SIM_THRESHOLD) {
          reasons.push(`Benzerlik dusuk (${(Math.round(best * 100) / 100).toFixed(2)})`);
        }

        // (2) gramaj/olcu/tip kapilari: digerlerine gore uyumsuz mu?
        // Referans = DIGER uyelerin isimleri.
        const otherNames = enriched
          .filter((o) => o.productCode !== e.productCode)
          .map((o) => o.name);
        const guard = evaluateNameGuards(e.name, otherNames);
        if (guard.rejected && guard.reason) {
          reasons.push(guard.reason);
        }

        // (3) kategori azinligi (aile >=3 uyeli + uye kategorisi cogunluktan farkli)
        if (
          enriched.length >= 3 &&
          majorityCat &&
          e.categoryId &&
          e.categoryId !== majorityCat
        ) {
          reasons.push('Kategori uyumsuz');
        }

        if (reasons.length > 0) {
          rows.push({
            familyId: fam.id,
            familyName: fam.name,
            itemId: e.itemId,
            productCode: e.productCode,
            productName: e.name,
            score: Math.round(best * 1000) / 1000,
            reason: reasons.join(' · '),
          });
        }
      }
    }

    // En supheli once (dusuk skor)
    rows.sort((a, b) => a.score - b.score);
    return { rows };
  }

  /* --------------------------------------------------------------------------
   * + removeProductFromFamily : uyeyi pasifle (family-candidate servisine delege)
   * ------------------------------------------------------------------------*/
  async removeProductFromFamily(
    familyId: string,
    productCode: string,
    userName?: string | null
  ): Promise<{ removed: boolean }> {
    return familyCandidateService.removeProductFromFamily(familyId, productCode, userName);
  }

  /* --------------------------------------------------------------------------
   * + getFamilyUnitMismatch : birim tutarsiz aileler
   * ------------------------------------------------------------------------*/
  async getFamilyUnitMismatch(): Promise<{ families: FamilyUnitMismatchFamily[] }> {
    const families = await prisma.productFamily.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        items: {
          where: { active: true },
          orderBy: [{ priority: 'asc' }, { productCode: 'asc' }],
          select: {
            id: true,
            productCode: true,
            productName: true,
            unitFactorOverride: true,
            product: {
              select: { name: true, unit: true, unit2: true, unit2Factor: true },
            },
          },
        },
      },
    });

    const out: FamilyUnitMismatchFamily[] = [];

    for (const fam of families) {
      const members = fam.items;
      if (members.length < 2) continue;

      const enriched: FamilyUnitMismatchMember[] = members.map((it) => ({
        itemId: it.id,
        productCode: it.productCode,
        productName: it.product?.name || it.productName || it.productCode,
        unit: it.product?.unit || 'ADET',
        unit2: it.product?.unit2 || null,
        unit2Factor:
          it.product?.unit2Factor != null ? Number(it.product.unit2Factor) : null,
        unitFactorOverride:
          it.unitFactorOverride != null ? Number(it.unitFactorOverride) : null,
        mismatched: false, // dominantNorm hesaplandiktan sonra asagida guncellenir
      }));

      // Dominant birim: NORMALIZE bazda en cok gecen grup bulunur; ama disari
      // ham (raw) birim yazilir ki frontend "member.unit === dominantUnit" ile
      // dogru eslestirsin. Ham temsilci = o normalize grup icinde en cok gecen ham
      // yazilis (cogu uye ayni yazdigi icin tam esitlik saglanir; sadece es-anlam
      // farkli yazan uye -KL vs KOLI- isaretlenir, ki bu da duzeltmeye deger).
      const normGroupCount = new Map<string, number>();
      const rawByNorm = new Map<string, Map<string, number>>();
      enriched.forEach((m) => {
        const nu = normalizeUnitName(m.unit);
        normGroupCount.set(nu, (normGroupCount.get(nu) || 0) + 1);
        if (!rawByNorm.has(nu)) rawByNorm.set(nu, new Map());
        const rm = rawByNorm.get(nu)!;
        const raw = String(m.unit || '').trim();
        rm.set(raw, (rm.get(raw) || 0) + 1);
      });
      let dominantNorm = '';
      let dominantCnt = -1;
      for (const [u, c] of normGroupCount.entries()) {
        if (c > dominantCnt) {
          dominantCnt = c;
          dominantNorm = u;
        }
      }
      // Dominant normalize grup icindeki en yaygin ham yazilis
      let dominantUnit = dominantNorm;
      const rawMap = rawByNorm.get(dominantNorm);
      if (rawMap) {
        let bestRaw = '';
        let bestRawCnt = -1;
        for (const [raw, c] of rawMap.entries()) {
          if (raw && c > bestRawCnt) {
            bestRawCnt = c;
            bestRaw = raw;
          }
        }
        if (bestRaw) dominantUnit = bestRaw;
      }

      // Her uye icin normalize kiyasla dominant'tan farkli mi isaretle (frontend
      // RAW kiyas yapmasin; es-anlam KL vs KOLI yanlis flag'lenmesin).
      enriched.forEach((m) => {
        m.mismatched = normalizeUnitName(m.unit) !== dominantNorm;
      });

      // En az bir uyenin normalize birimi dominant normalize'dan farkliysa tutarsiz.
      const hasMismatch = enriched.some((m) => m.mismatched);
      if (!hasMismatch) continue;

      out.push({
        familyId: fam.id,
        familyName: fam.name,
        dominantUnit,
        members: enriched,
      });
    }

    return { families: out };
  }

  /* --------------------------------------------------------------------------
   * + setFamilyItemUnitFactor : unitFactorOverride set/temizle + log
   * ------------------------------------------------------------------------*/
  async setFamilyItemUnitFactor(
    itemId: string,
    factor: number | null,
    userName?: string | null
  ): Promise<{ item: { itemId: string; unitFactorOverride: number | null } }> {
    const id = String(itemId || '').trim();
    if (!id) {
      throw new AppError('Uye kaydi zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }

    let normalized: number | null;
    if (factor === null || factor === undefined) {
      normalized = null;
    } else {
      const n = Number(factor);
      if (!Number.isFinite(n) || n <= 0) {
        throw new AppError('Katsayi 0 dan buyuk olmali veya bos (temizle) olmali.', 400, ErrorCode.BAD_REQUEST);
      }
      normalized = n;
    }

    const existing = await prisma.productFamilyItem.findUnique({
      where: { id },
      select: {
        id: true,
        productCode: true,
        productName: true,
        unitFactorOverride: true,
        family: { select: { id: true, name: true } },
      },
    });
    if (!existing) {
      throw new AppError('Aile uye kaydi bulunamadi.', 404, ErrorCode.NOT_FOUND);
    }

    const updated = await prisma.productFamilyItem.update({
      where: { id },
      data: { unitFactorOverride: normalized },
      select: { id: true, unitFactorOverride: true },
    });

    await this.logOperation({
      operationType: 'PRODUCT_FAMILY_UPDATE',
      title: 'Aile ici birim katsayisi guncellendi',
      productCode: existing.productCode,
      productName: existing.productName || null,
      familyId: existing.family?.id || null,
      familyName: existing.family?.name || null,
      previousValues: { unitFactorOverride: existing.unitFactorOverride ?? null },
      newValues: { unitFactorOverride: normalized },
      userName: userName || null,
    });

    return {
      item: {
        itemId: updated.id,
        unitFactorOverride:
          updated.unitFactorOverride != null ? Number(updated.unitFactorOverride) : null,
      },
    };
  }

  /* --------------------------------------------------------------------------
   * UcarerOperationLog (family-candidate.service kalibiyla ayni; userName dogrudan)
   * ------------------------------------------------------------------------*/
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
      console.warn('Aile raporu islem logu yazilamadi:', error);
    }
  }
}

export default new FamilyReportService();
