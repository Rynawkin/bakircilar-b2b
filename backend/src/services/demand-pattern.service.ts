/**
 * Talep Deseni (Demand Pattern) Servisi — A6
 *
 * Her stoklu urunu son <lookbackWeeks> haftalik satis ritmine gore Syntetos-Boylan
 * dortlusune (SMOOTH / ERRATIC / INTERMITTENT / LUMPY) siniflar ve en buyuk musteri
 * payini hesaplar. "Topakli (LUMPY) + tek-cariden" urunler, depoda gereksiz yatan
 * min-stok'u temsil eder; bunlar "siparise getir" (min=0) adayi olarak isaretlenir.
 *
 * Hesap tanimlari (a6-contract.md):
 *   - Ufuk = Mikro sunucu "bugun"une gore son lookbackWeeks HAFTALIK kova.
 *   - Talep buyuklugu (hafta) = o haftaki satis miktari toplami. Talep vukuu = qty>0 hafta.
 *   - ADI (Average Demand Interval, hafta) = lookbackWeeks / (talep vukuu hafta sayisi).
 *   - CV² = sifir-disi haftalik talep buyukluklerinin (stddev/mean)²; populasyon stddev.
 *   - Kesim: ADI_cut=1.32, CV2_cut=0.49.
 *       ADI<1.32 & CV²<0.49 -> SMOOTH
 *       ADI>=1.32 & CV²<0.49 -> INTERMITTENT
 *       ADI<1.32 & CV²>=0.49 -> ERRATIC
 *       ADI>=1.32 & CV²>=0.49 -> LUMPY
 *       Tek talep haftasi (CV² tanimsiz) -> LUMPY, cv2=null.
 *   - topCustomerShare = max_cari( cari toplam qty / urun toplam qty ), 0..1.
 *   - unitCost = lokal Product.currentCost (Ucarer raporu ile ayni kaynak).
 *   - minStockValueTL = currentMin * unitCost.
 *   - recommended = LUMPY && topCustomerShare>=0.6 && currentMin>0.
 *
 * Satis filtresi min-max motoruyla BIREBIR AYNIDIR (minmax.service.ts previewMinMax):
 *   sth_tip=1, sth_cins=0, sth_evraktip IN (1,4), ISNULL(sth_normal_iade,0)=0,
 *   iptal degil, TOPLU degil, qty>0, gecerli stok+cari, ReportExclusion kosullari +
 *   depo filtresi (sth_cikis_depo_no = depo no; MERKEZ->1, TOPCA->6).
 *
 * Butun agir is SINIRLI SQL'de yapilir (uc sorgu): (1) urun x hafta talep,
 * (2) urun x cari toplam (tek-cari payi), (3) mevcut min/max + isim + tedarikci.
 * ADI/CV²/desen/pay/minStockValueTL JS'te hesaplanir.
 */

import { prisma } from '../utils/prisma';
import { AppError, ErrorCode } from '../types/errors';
import mikroService from './mikro.service';
import exclusionService from './exclusion.service';
import minMaxService from './minmax.service';
import minMaxExclusionService from './minmax-exclusion.service';

export type DemandPatternDepot = 'MERKEZ' | 'TOPCA';
export type DemandPattern = 'SMOOTH' | 'ERRATIC' | 'INTERMITTENT' | 'LUMPY';

export interface DemandPatternRow {
  productCode: string;
  productName: string;
  supplierName: string | null;
  pattern: DemandPattern;
  adi: number;
  cv2: number | null;
  demandWeeks: number;
  totalQty: number;
  topCustomerCode: string | null;
  topCustomerName: string | null;
  topCustomerShare: number;
  currentMin: number;
  currentMax: number;
  unitCost: number;
  minStockValueTL: number;
  recommended: boolean;
}

export interface DemandPatternSummary {
  counts: { smooth: number; erratic: number; intermittent: number; lumpy: number };
  totalProducts: number;
  lumpyMinStockTL: number;
  recommendedCount: number;
  recommendedMinStockTL: number;
  params: { depot: DemandPatternDepot; lookbackWeeks: number; adiCut: number; cv2Cut: number; topShareCut: number };
}

export interface DemandPatternReport {
  depot: DemandPatternDepot;
  lookbackWeeks: number;
  generatedAt: string;
  rows: DemandPatternRow[];
  summary: DemandPatternSummary;
  truncated?: boolean;
}

export interface DemandPatternApplyResult {
  applied: string[];
  skipped: Array<{ productCode: string; reason: string }>;
}

const ADI_CUT = 1.32;
const CV2_CUT = 0.49;
const TOP_SHARE_CUT = 0.6;

const MIN_LOOKBACK_WEEKS = 1;
const MAX_LOOKBACK_WEEKS = 260; // ~5 yil ust siniri (absurt ufuk engellensin)
const DEFAULT_LOOKBACK_WEEKS = 52;
const MAX_ROWS = 5000;
const MAX_APPLY_CODES = 200;

const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

const normalizeCode = (value: unknown): string => String(value || '').trim().toUpperCase();

const normalizeDepot = (value: unknown): DemandPatternDepot =>
  normalizeCode(value) === 'TOPCA' ? 'TOPCA' : 'MERKEZ';

// minmax.service.ts depotToWarehouseNo ile AYNI: MERKEZ->1, TOPCA->6
const depotToWarehouseNo = (depot: DemandPatternDepot): number => (depot === 'TOPCA' ? 6 : 1);

class DemandPatternService {
  private async runMikroQuery(queryText: string): Promise<any[]> {
    await mikroService.connect();
    const request = mikroService.pool!.request();
    (request as any).timeout = Number(process.env.UCARER_MINMAX_TIMEOUT_MS || 300000);
    const result = await request.query(queryText);
    return Array.isArray(result.recordset) ? result.recordset : [];
  }

  /**
   * Satis WHERE kosullari — minmax.service.ts previewMinMax ile BIREBIR ayni tanim.
   * Depo filtresi ayrica eklenir (sadece ilgili depo cikis satislari).
   */
  private async buildSalesWhere(warehouseNo: number, lookbackWeeks: number): Promise<{
    whereClause: string;
    needsStoklarJoin: boolean;
    needsCariJoin: boolean;
  }> {
    const baseConditions = [
      'sth.sth_cins = 0',
      'sth.sth_tip = 1',
      'ISNULL(sth.sth_normal_iade, 0) = 0',
      'sth.sth_evraktip IN (1, 4)',
      '(sth.sth_iptal = 0 OR sth.sth_iptal IS NULL)',
      'sth.sth_stok_kod IS NOT NULL',
      "LTRIM(RTRIM(sth.sth_stok_kod)) <> ''",
      'sth.sth_cari_kodu IS NOT NULL',
      "LTRIM(RTRIM(sth.sth_cari_kodu)) <> ''",
      'ISNULL(sth.sth_miktar, 0) > 0',
      "UPPER(LTRIM(RTRIM(ISNULL(sth.sth_stok_srm_merkezi, '')))) <> 'TOPLU'",
      // Depo kapsami (per-depot rapor): sadece bu depodan cikan satislar
      `ISNULL(sth.sth_cikis_depo_no, 0) = ${warehouseNo}`,
      // Ufuk: son lookbackWeeks * 7 gun
      `sth.sth_tarih >= DATEADD(DAY, -${lookbackWeeks * 7 - 1}, CAST(GETDATE() AS date))`,
    ];
    const exclusionConditions = await exclusionService.buildStokHareketleriExclusionConditions();
    const needsStoklarJoin = exclusionConditions.some((condition) => condition.includes('st.sto_'));
    const needsCariJoin = exclusionConditions.some((condition) => condition.includes('c.cari_'));

    const whereClause = [...baseConditions, ...exclusionConditions].join(' AND ');
    return { whereClause, needsStoklarJoin, needsCariJoin };
  }

  private salesJoins(needsStoklarJoin: boolean, needsCariJoin: boolean): string {
    return [
      needsStoklarJoin ? 'LEFT JOIN STOKLAR st WITH (NOLOCK) ON st.sto_kod = sth.sth_stok_kod' : '',
      needsCariJoin ? 'LEFT JOIN CARI_HESAPLAR c WITH (NOLOCK) ON c.cari_kod = sth.sth_cari_kodu' : '',
    ]
      .filter(Boolean)
      .join('\n        ');
  }

  /**
   * GET /admin/reports/demand-pattern
   */
  async getDemandPatternReport(input: { depot?: string; lookbackWeeks?: number | string }): Promise<DemandPatternReport> {
    const depot = normalizeDepot(input?.depot);
    const warehouseNo = depotToWarehouseNo(depot);
    const lookbackWeeks = clampInt(input?.lookbackWeeks, MIN_LOOKBACK_WEEKS, MAX_LOOKBACK_WEEKS, DEFAULT_LOOKBACK_WEEKS);

    const { whereClause, needsStoklarJoin, needsCariJoin } = await this.buildSalesWhere(warehouseNo, lookbackWeeks);
    const joins = this.salesJoins(needsStoklarJoin, needsCariJoin);

    // Hafta kovasi: bugunden geriye sabit 7 gunluk dilimler. DATEDIFF(WEEK,...)
    // ISO/pazartesi kaymasina bagli oldugundan, ufuk basi (bugun - lookback*7 gun)
    // referansindan DATEDIFF(DAY)/7 ile deterministik kova uretilir.
    const floorExpr = `DATEADD(DAY, -${lookbackWeeks * 7 - 1}, CAST(GETDATE() AS date))`;

    // (1) Urun x hafta talep buyuklugu (yalniz qty>0 haftalar zaten dogal olarak > 0 olur)
    const weeklyQuery = `
      SELECT
        UPPER(LTRIM(RTRIM(sth.sth_stok_kod))) AS productCode,
        (DATEDIFF(DAY, ${floorExpr}, sth.sth_tarih) / 7) AS weekBucket,
        SUM(CAST(ISNULL(sth.sth_miktar, 0) AS FLOAT)) AS qty
      FROM STOK_HAREKETLERI sth WITH (NOLOCK)
      ${joins}
      WHERE ${whereClause}
      GROUP BY
        UPPER(LTRIM(RTRIM(sth.sth_stok_kod))),
        (DATEDIFF(DAY, ${floorExpr}, sth.sth_tarih) / 7)
    `;

    // (2) Urun x cari toplam (tek-cari payi icin). En buyuk cari JS'te secilir.
    const perCariQuery = `
      SELECT
        UPPER(LTRIM(RTRIM(sth.sth_stok_kod))) AS productCode,
        UPPER(LTRIM(RTRIM(sth.sth_cari_kodu))) AS cariCode,
        SUM(CAST(ISNULL(sth.sth_miktar, 0) AS FLOAT)) AS qty
      FROM STOK_HAREKETLERI sth WITH (NOLOCK)
      ${joins}
      WHERE ${whereClause}
      GROUP BY
        UPPER(LTRIM(RTRIM(sth.sth_stok_kod))),
        UPPER(LTRIM(RTRIM(sth.sth_cari_kodu)))
    `;

    const [weeklyRows, perCariRows] = await Promise.all([
      this.runMikroQuery(weeklyQuery),
      this.runMikroQuery(perCariQuery),
    ]);

    // --- Urun x hafta -> per-urun toplama ---
    interface Agg {
      weeklySizes: number[]; // sifir-disi haftalik talep buyuklukleri
      totalQty: number;
    }
    const aggByCode = new Map<string, Agg>();
    for (const raw of weeklyRows) {
      const code = normalizeCode(raw?.productCode);
      if (!code) continue;
      const qty = Number(raw?.qty) || 0;
      if (qty <= 0) continue; // talep vukuu tanimi
      let agg = aggByCode.get(code);
      if (!agg) {
        agg = { weeklySizes: [], totalQty: 0 };
        aggByCode.set(code, agg);
      }
      agg.weeklySizes.push(qty);
      agg.totalQty += qty;
    }

    if (aggByCode.size === 0) {
      return {
        depot,
        lookbackWeeks,
        generatedAt: new Date().toISOString(),
        rows: [],
        summary: {
          counts: { smooth: 0, erratic: 0, intermittent: 0, lumpy: 0 },
          totalProducts: 0,
          lumpyMinStockTL: 0,
          recommendedCount: 0,
          recommendedMinStockTL: 0,
          params: { depot, lookbackWeeks, adiCut: ADI_CUT, cv2Cut: CV2_CUT, topShareCut: TOP_SHARE_CUT },
        },
      };
    }

    // --- Tek-cari payi: her urun icin en buyuk cari qty ---
    const topCariByCode = new Map<string, { cariCode: string; qty: number }>();
    for (const raw of perCariRows) {
      const code = normalizeCode(raw?.productCode);
      const cariCode = normalizeCode(raw?.cariCode);
      if (!code || !cariCode) continue;
      const qty = Number(raw?.qty) || 0;
      if (qty <= 0) continue;
      const current = topCariByCode.get(code);
      if (!current || qty > current.qty) {
        topCariByCode.set(code, { cariCode, qty });
      }
    }

    const codes = Array.from(aggByCode.keys());

    // (3) Mevcut min/max + urun adi + tedarikci adi (Mikro). unitCost lokal Product'tan.
    const productMetaByCode = await this.fetchProductMeta(codes, warehouseNo);
    // En buyuk cari isimlerini Mikro CARI_HESAPLAR'dan (tek IN sorgusu)
    const topCariCodes = Array.from(
      new Set(Array.from(topCariByCode.values()).map((v) => v.cariCode).filter(Boolean))
    );
    const cariNameByCode = await this.fetchCariNames(topCariCodes);
    // unitCost lokal Product.currentCost (Ucarer raporu ile ayni kaynak)
    const unitCostByCode = await this.fetchUnitCosts(codes);

    const rows: DemandPatternRow[] = [];
    const counts = { smooth: 0, erratic: 0, intermittent: 0, lumpy: 0 };
    let lumpyMinStockTL = 0;
    let recommendedCount = 0;
    let recommendedMinStockTL = 0;

    for (const code of codes) {
      const agg = aggByCode.get(code)!;
      const demandWeeks = agg.weeklySizes.length;
      // ADI = ufuk (hafta) / talep vukuu haftasi
      const adi = lookbackWeeks / demandWeeks;

      // CV² = populasyon stddev² / mean² of non-zero weekly sizes
      let cv2: number | null;
      if (demandWeeks <= 1) {
        cv2 = null; // tek spike -> tanimsiz
      } else {
        const mean = agg.totalQty / demandWeeks;
        if (mean <= 0) {
          cv2 = 0;
        } else {
          let sqSum = 0;
          for (const size of agg.weeklySizes) {
            const d = size - mean;
            sqSum += d * d;
          }
          const variance = sqSum / demandWeeks; // populasyon varyansi
          cv2 = variance / (mean * mean);
        }
      }

      // Desen siniflandirma
      let pattern: DemandPattern;
      if (cv2 === null) {
        pattern = 'LUMPY'; // tek talep haftasi
      } else {
        const spiky = cv2 >= CV2_CUT;
        const rare = adi >= ADI_CUT;
        if (rare && spiky) pattern = 'LUMPY';
        else if (rare && !spiky) pattern = 'INTERMITTENT';
        else if (!rare && spiky) pattern = 'ERRATIC';
        else pattern = 'SMOOTH';
      }

      const top = topCariByCode.get(code) || null;
      const topCustomerShare = top && agg.totalQty > 0
        ? Math.min(1, top.qty / agg.totalQty)
        : 0;
      const topCustomerCode = top?.cariCode || null;
      const topCustomerName = top ? (cariNameByCode.get(top.cariCode) || null) : null;

      const meta = productMetaByCode.get(code);
      const currentMin = meta?.currentMin ?? 0;
      const currentMax = meta?.currentMax ?? 0;
      const productName = meta?.productName || code;
      const supplierName = meta?.supplierName || null;
      const unitCost = unitCostByCode.get(code) ?? 0;
      const minStockValueTL = Math.round(currentMin * unitCost * 100) / 100;

      const recommended = pattern === 'LUMPY' && topCustomerShare >= TOP_SHARE_CUT && currentMin > 0;

      // Ozet sayaclari
      if (pattern === 'SMOOTH') counts.smooth += 1;
      else if (pattern === 'ERRATIC') counts.erratic += 1;
      else if (pattern === 'INTERMITTENT') counts.intermittent += 1;
      else counts.lumpy += 1;

      if (pattern === 'LUMPY') lumpyMinStockTL += minStockValueTL;
      if (recommended) {
        recommendedCount += 1;
        recommendedMinStockTL += minStockValueTL;
      }

      rows.push({
        productCode: code,
        productName,
        supplierName,
        pattern,
        adi: Math.round(adi * 10000) / 10000,
        cv2: cv2 === null ? null : Math.round(cv2 * 10000) / 10000,
        demandWeeks,
        totalQty: Math.round(agg.totalQty * 100) / 100,
        topCustomerCode,
        topCustomerName,
        topCustomerShare: Math.round(topCustomerShare * 10000) / 10000,
        currentMin,
        currentMax,
        unitCost: Math.round(unitCost * 100) / 100,
        minStockValueTL,
        recommended,
      });
    }

    // Onerilenler once, sonra min-stok TL buyukten kucuge (nakit onceligi)
    rows.sort((a, b) => {
      if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
      return b.minStockValueTL - a.minStockValueTL || a.productCode.localeCompare(b.productCode);
    });

    const totalProducts = rows.length;
    let truncated = false;
    let outRows = rows;
    if (rows.length > MAX_ROWS) {
      truncated = true;
      outRows = rows.slice(0, MAX_ROWS);
    }

    return {
      depot,
      lookbackWeeks,
      generatedAt: new Date().toISOString(),
      rows: outRows,
      summary: {
        counts,
        totalProducts,
        lumpyMinStockTL: Math.round(lumpyMinStockTL * 100) / 100,
        recommendedCount,
        recommendedMinStockTL: Math.round(recommendedMinStockTL * 100) / 100,
        params: { depot, lookbackWeeks, adiCut: ADI_CUT, cv2Cut: CV2_CUT, topShareCut: TOP_SHARE_CUT },
      },
      ...(truncated ? { truncated: true } : {}),
    };
  }

  /**
   * Mikro STOKLAR + STOK_DEPO_DETAYLARI (hedef depo) + tedarikci (sto_sat_cari_kod).
   * Sadece talebi olan urun kodlari icin (chunk'li IN). Isim/min/max okuma.
   */
  private async fetchProductMeta(
    codes: string[],
    warehouseNo: number
  ): Promise<Map<string, { productName: string; supplierName: string | null; currentMin: number; currentMax: number }>> {
    const map = new Map<string, { productName: string; supplierName: string | null; currentMin: number; currentMax: number }>();
    const unique = Array.from(new Set(codes.map((c) => normalizeCode(c)).filter(Boolean)));
    if (unique.length === 0) return map;

    const CHUNK = 500;
    for (let offset = 0; offset < unique.length; offset += CHUNK) {
      const chunk = unique.slice(offset, offset + CHUNK);
      const inClause = chunk.map((code) => `'${code.replace(/'/g, "''")}'`).join(', ');
      const rows = await this.runMikroQuery(`
        SELECT
          UPPER(LTRIM(RTRIM(s.sto_kod))) AS productCode,
          LTRIM(RTRIM(ISNULL(s.sto_isim, ''))) AS productName,
          LTRIM(RTRIM(ISNULL(sc.cari_unvan1, ''))) AS supplierName,
          CAST(ISNULL(sdp.sdp_min_stok, 0) AS FLOAT) AS currentMin,
          CAST(ISNULL(sdp.sdp_max_stok, 0) AS FLOAT) AS currentMax
        FROM STOKLAR s WITH (NOLOCK)
        LEFT JOIN STOK_DEPO_DETAYLARI sdp WITH (NOLOCK)
          ON LTRIM(RTRIM(sdp.sdp_depo_kod)) = LTRIM(RTRIM(s.sto_kod))
          AND sdp.sdp_depo_no = ${warehouseNo}
        LEFT JOIN CARI_HESAPLAR sc WITH (NOLOCK)
          ON sc.cari_kod = LTRIM(RTRIM(ISNULL(s.sto_sat_cari_kod, '')))
        WHERE UPPER(LTRIM(RTRIM(s.sto_kod))) IN (${inClause})
      `);
      for (const raw of rows) {
        const code = normalizeCode(raw?.productCode);
        if (!code) continue;
        map.set(code, {
          productName: String(raw?.productName || '').trim(),
          supplierName: String(raw?.supplierName || '').trim() || null,
          currentMin: Number(raw?.currentMin) || 0,
          currentMax: Number(raw?.currentMax) || 0,
        });
      }
    }
    return map;
  }

  /** En buyuk cari isimleri (Mikro CARI_HESAPLAR); hata olursa isim bos kalir. */
  private async fetchCariNames(cariCodes: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const unique = Array.from(new Set(cariCodes.map((c) => normalizeCode(c)).filter(Boolean)));
    if (unique.length === 0) return map;

    const CHUNK = 500;
    for (let offset = 0; offset < unique.length; offset += CHUNK) {
      const chunk = unique.slice(offset, offset + CHUNK);
      const inClause = chunk.map((code) => `'${code.replace(/'/g, "''")}'`).join(', ');
      try {
        const rows = await this.runMikroQuery(`
          SELECT
            UPPER(LTRIM(RTRIM(cari_kod))) AS cariCode,
            LTRIM(RTRIM(ISNULL(cari_unvan1, ''))) AS cariName
          FROM CARI_HESAPLAR WITH (NOLOCK)
          WHERE UPPER(LTRIM(RTRIM(cari_kod))) IN (${inClause})
        `);
        for (const raw of rows) {
          const code = normalizeCode(raw?.cariCode);
          const name = String(raw?.cariName || '').trim();
          if (code && name) map.set(code, name);
        }
      } catch {
        // isim zenginlestirme opsiyonel
      }
    }
    return map;
  }

  /** unitCost = lokal Product.currentCost (Ucarer raporu ile ayni kaynak). */
  private async fetchUnitCosts(codes: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    const unique = Array.from(new Set(codes.map((c) => normalizeCode(c)).filter(Boolean)));
    if (unique.length === 0) return map;

    const products = await prisma.product.findMany({
      where: { mikroCode: { in: unique } },
      select: { mikroCode: true, currentCost: true },
    });
    for (const product of products) {
      map.set(normalizeCode(product.mikroCode), Number(product.currentCost) || 0);
    }
    return map;
  }

  // ==================== MIKRO'YA YAZMA (SIPARISE GETIR) ====================

  /**
   * POST /admin/reports/demand-pattern/apply-order-to-order
   *
   * Her stok kodu icin SIRA ONEMLI (Round 4 kurali): once Mikro'ya min=0/max=0 yazilir
   * (applyMinMax), sonra min-max motoru bu urunu bir daha onermesin diye haric listesine
   * eklenir (minMaxExclusionService.addMany). applyMinMax zaten haric listesindeki kodlari
   * reddettigi icin exclusion eklemesi MUTLAKA applyMinMax'ten SONRA yapilir.
   */
  async applyOrderToOrder(input: {
    depot?: string;
    productCodes?: string[];
    userId?: string | null;
    userName?: string | null;
  }): Promise<DemandPatternApplyResult> {
    const depot = normalizeDepot(input?.depot);
    const userId = input?.userId ? String(input.userId) : null;
    const userName = input?.userName ? String(input.userName) : null;

    const rawCodes = Array.isArray(input?.productCodes) ? input!.productCodes! : [];
    const codes: string[] = [];
    const seen = new Set<string>();
    for (const raw of rawCodes) {
      const code = normalizeCode(raw);
      if (!code || seen.has(code)) continue;
      seen.add(code);
      codes.push(code);
    }

    if (codes.length === 0) {
      throw new AppError('En az bir stok kodu gonderilmelidir.', 400, ErrorCode.BAD_REQUEST);
    }
    if (codes.length > MAX_APPLY_CODES) {
      throw new AppError(`Tek seferde en fazla ${MAX_APPLY_CODES} urun islenebilir.`, 400, ErrorCode.BAD_REQUEST);
    }

    const applied: string[] = [];
    const skipped: Array<{ productCode: string; reason: string }> = [];

    for (const productCode of codes) {
      try {
        // 1) Mikro'ya min=0/max=0 yaz (haric eklemeden ONCE)
        const applyResult = await minMaxService.applyMinMax({
          depot,
          items: [{ productCode, newMin: 0, newMax: 0 }],
          userId,
        });

        const wasUpdated = applyResult.updated.some((row) => normalizeCode(row.productCode) === productCode);
        if (!wasUpdated) {
          const skipReason = applyResult.skipped.find((row) => normalizeCode(row.productCode) === productCode)?.reason
            || 'Mikro min/max yazilamadi (depo kaydi bulunamadi olabilir)';
          skipped.push({ productCode, reason: skipReason });
          continue;
        }

        // 2) min-max motoru bir daha onermesin: haric listesine ekle
        try {
          await minMaxExclusionService.addMany(
            [{ productCode, note: 'Siparise getir (talep deseni)' }],
            { id: userId, name: userName }
          );
        } catch (exclusionError: any) {
          // Min=0 Mikro'ya yazildi ama exclusion eklenemedi: yine de basarili say,
          // motorda min=0 zaten oneri uretmez; sebebi not olarak dusur.
          skipped.push({
            productCode,
            reason: `Min=0 yazildi ancak haric listesine eklenemedi: ${String(exclusionError?.message || 'bilinmeyen hata').slice(0, 150)}`,
          });
          // min=0 yazildigi icin applied kabul ediyoruz (motorda tekrar onerilmez)
          applied.push(productCode);
          continue;
        }

        applied.push(productCode);
      } catch (error: any) {
        skipped.push({
          productCode,
          reason: `Islem basarisiz: ${String(error?.message || 'bilinmeyen hata').slice(0, 150)}`,
        });
      }
    }

    return { applied, skipped };
  }
}

export default new DemandPatternService();
