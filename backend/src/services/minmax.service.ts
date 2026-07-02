/**
 * Min-Max v2 Servisi
 *
 * Mikro SP'sine (FEBG_MinMaxHesaplaRES) dokunmadan B2B tarafinda calisan paralel
 * min-max hesap motoru. Onizleme (kiyas) uretir; Mikro'ya yazma SADECE kullanicinin
 * onizlemeden secip onayladigi satirlar icin applyMinMax ile yapilir.
 *
 * Hesap mantigi (patron tarifi):
 *   gunlukSatis = son <lookbackDays> gun satis miktari / lookbackDays
 *   yeniMin     = ceil(gunlukSatis * minDays)
 *   yeniMax     = ceil(gunlukSatis * maxDays)
 *
 * Parametre onceligi: URUN override > TEDARIKCI override > Settings varsayilani.
 * sto_model_kodu = 'HAYIR' olan urunler hesaplanmaz (listede 'haric' rozetiyle gorunur).
 * TOPLU sorumluluk merkezi satirlari ve ReportExclusion kayitlari satistan haric tutulur
 * (reports.service.ts getUcarerProductSalesHistory ile ayni satis kosullari).
 */

import * as sql from 'mssql';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { AppError, ErrorCode } from '../types/errors';
import mikroService from './mikro.service';
import exclusionService from './exclusion.service';

export type MinMaxDepot = 'MERKEZ' | 'TOPCA';
export type MinMaxSalesScope = 'DEPOT' | 'COMPANY';
export type MinMaxOverrideSource = 'urun' | 'tedarikci' | 'varsayilan' | 'haric';

export interface MinMaxSettings {
  lookbackDays: number;
  minDays: number;
  maxDays: number;
  salesScope: MinMaxSalesScope;
}

export interface MinMaxPreviewRow {
  productCode: string;
  productName: string;
  supplierCode: string | null;
  supplierName: string | null;
  depot: MinMaxDepot;
  excluded: boolean;          // sto_model_kodu = 'HAYIR'
  hasDepotRecord: boolean;    // STOK_DEPO_DETAYLARI kaydi var mi (yoksa apply atlanir)
  salesQty: number;           // efektif penceredeki satis miktari (kapsama gore)
  dailySales: number;
  lookbackUsed: number;
  minDaysUsed: number;
  maxDaysUsed: number;
  currentMin: number;
  currentMax: number;
  newMin: number | null;
  newMax: number | null;
  diffMin: number | null;
  diffMax: number | null;
  overrideSource: MinMaxOverrideSource;
}

export interface MinMaxPreviewResult {
  depot: MinMaxDepot;
  salesScope: MinMaxSalesScope;
  defaults: MinMaxSettings;
  rows: MinMaxPreviewRow[];
  total: number;
  summary: {
    changedCount: number;
    excludedCount: number;
    missingDepotRecordCount: number;
    overrideProductCount: number;
    overrideSupplierCount: number;
  };
  generatedAt: string;
}

export interface MinMaxApplyItem {
  productCode: string;
  newMin: number;
  newMax: number;
}

export interface MinMaxApplyResult {
  depot: MinMaxDepot;
  requested: number;
  updated: Array<{ productCode: string; oldMin: number; oldMax: number; newMin: number; newMax: number }>;
  skipped: Array<{ productCode: string; reason: string }>;
}

const MAX_APPLY_ITEMS = 5000;
const APPLY_CHUNK_SIZE = 25;
const MAX_DISTINCT_LOOKBACKS = 20;
const MIN_LOOKBACK_DAYS = 7;
const MAX_LOOKBACK_DAYS = 365;
const MAX_DAY_PARAM = 365;

const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

const normalizeCode = (value: unknown): string => String(value || '').trim().toUpperCase();

const normalizeDepot = (value: unknown): MinMaxDepot =>
  normalizeCode(value) === 'TOPCA' ? 'TOPCA' : 'MERKEZ';

const depotToWarehouseNo = (depot: MinMaxDepot): number => (depot === 'TOPCA' ? 6 : 1);

const DEFAULT_SETTINGS: MinMaxSettings = {
  lookbackDays: 90,
  minDays: 15,
  maxDays: 45,
  salesScope: 'DEPOT',
};

interface EffectiveParams {
  lookbackDays: number;
  minDays: number;
  maxDays: number;
  source: Exclude<MinMaxOverrideSource, 'haric'>;
}

class MinMaxService {
  /**
   * Uzun sureli Mikro sorgusu (SP kalibindaki timeout mantigi; reports.service.ts:7229-7232 esasli).
   */
  private async runMikroQuery(queryText: string): Promise<any[]> {
    await mikroService.connect();
    const request = mikroService.pool!.request();
    (request as any).timeout = Number(process.env.UCARER_MINMAX_TIMEOUT_MS || 300000);
    const result = await request.query(queryText);
    return Array.isArray(result.recordset) ? result.recordset : [];
  }

  // ==================== SETTINGS ====================

  async getSettings(): Promise<MinMaxSettings> {
    const settings = await prisma.settings.findFirst({
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
    if (!settings) {
      return { ...DEFAULT_SETTINGS };
    }
    return {
      lookbackDays: clampInt((settings as any).minmaxLookbackDays, MIN_LOOKBACK_DAYS, MAX_LOOKBACK_DAYS, DEFAULT_SETTINGS.lookbackDays),
      minDays: clampInt((settings as any).minmaxMinDays, 1, MAX_DAY_PARAM, DEFAULT_SETTINGS.minDays),
      maxDays: clampInt((settings as any).minmaxMaxDays, 1, MAX_DAY_PARAM, DEFAULT_SETTINGS.maxDays),
      salesScope: normalizeCode((settings as any).minmaxSalesScope) === 'COMPANY' ? 'COMPANY' : 'DEPOT',
    };
  }

  async updateSettings(input: Partial<MinMaxSettings>): Promise<MinMaxSettings> {
    const current = await this.getSettings();
    const next: MinMaxSettings = {
      lookbackDays: clampInt(input.lookbackDays ?? current.lookbackDays, MIN_LOOKBACK_DAYS, MAX_LOOKBACK_DAYS, current.lookbackDays),
      minDays: clampInt(input.minDays ?? current.minDays, 1, MAX_DAY_PARAM, current.minDays),
      maxDays: clampInt(input.maxDays ?? current.maxDays, 1, MAX_DAY_PARAM, current.maxDays),
      salesScope: normalizeCode(input.salesScope ?? current.salesScope) === 'COMPANY' ? 'COMPANY' : 'DEPOT',
    };
    if (next.maxDays < next.minDays) {
      throw new AppError('Max gun, min gunden kucuk olamaz.', 400, ErrorCode.BAD_REQUEST);
    }

    const data = {
      minmaxLookbackDays: next.lookbackDays,
      minmaxMinDays: next.minDays,
      minmaxMaxDays: next.maxDays,
      minmaxSalesScope: next.salesScope,
    };

    const existing = await prisma.settings.findFirst({
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true },
    });
    if (existing) {
      await prisma.settings.update({ where: { id: existing.id }, data });
    } else {
      // Settings satiri yoksa admin getSettings ile ayni varsayilanlarla olustur (admin.controller.ts:347-356 kalibi)
      await prisma.settings.create({
        data: {
          calculationPeriodMonths: 3,
          includedWarehouses: ['DEPO1', 'MERKEZ'],
          minimumExcessThreshold: 10,
          costCalculationMethod: 'LAST_ENTRY',
          ...data,
        },
      });
    }
    return next;
  }

  // ==================== OVERRIDES (KURALLAR) ====================

  async listOverrides(): Promise<Array<{
    id: string;
    scopeType: 'PRODUCT' | 'SUPPLIER';
    productCode: string | null;
    productName: string | null;
    supplierCode: string | null;
    supplierName: string | null;
    depot: MinMaxDepot | null;
    lookbackDays: number | null;
    minDays: number | null;
    maxDays: number | null;
    note: string | null;
    createdAt: Date;
  }>> {
    const rows = await prisma.minMaxOverride.findMany({
      orderBy: [{ createdAt: 'desc' }],
    });

    // Urun adlari lokal Product tablosundan (Mikro'ya gitmeden)
    const productCodes = Array.from(
      new Set(rows.map((row) => normalizeCode(row.productCode)).filter(Boolean))
    );
    const productNameByCode = new Map<string, string>();
    if (productCodes.length > 0) {
      const products = await prisma.product.findMany({
        where: { mikroCode: { in: productCodes } },
        select: { mikroCode: true, name: true },
      });
      products.forEach((product) => {
        productNameByCode.set(normalizeCode(product.mikroCode), product.name || '');
      });
    }

    // Tedarikci adlari Mikro CARI_HESAPLAR'dan (kural sayisi kucuk, IN sorgusu ucuz);
    // hata olursa isim bos kalir, liste yine doner.
    const supplierCodes = Array.from(
      new Set(rows.map((row) => normalizeCode(row.supplierCode)).filter(Boolean))
    );
    const supplierNameByCode = new Map<string, string>();
    if (supplierCodes.length > 0) {
      try {
        const inClause = supplierCodes.map((code) => `'${code.replace(/'/g, "''")}'`).join(', ');
        const supplierRows = await mikroService.executeQuery(`
          SELECT cari_kod AS supplierCode, LTRIM(RTRIM(ISNULL(cari_unvan1, ''))) AS supplierName
          FROM CARI_HESAPLAR WITH (NOLOCK)
          WHERE cari_kod IN (${inClause})
        `);
        (Array.isArray(supplierRows) ? supplierRows : []).forEach((row: any) => {
          supplierNameByCode.set(normalizeCode(row?.supplierCode), String(row?.supplierName || '').trim());
        });
      } catch {
        // isim zenginlestirme opsiyonel
      }
    }

    return rows.map((row) => ({
      id: row.id,
      scopeType: row.scopeType === 'SUPPLIER' ? 'SUPPLIER' : 'PRODUCT',
      productCode: row.productCode ? normalizeCode(row.productCode) : null,
      productName: row.productCode ? productNameByCode.get(normalizeCode(row.productCode)) || null : null,
      supplierCode: row.supplierCode ? normalizeCode(row.supplierCode) : null,
      supplierName: row.supplierCode ? supplierNameByCode.get(normalizeCode(row.supplierCode)) || null : null,
      depot: row.depot ? normalizeDepot(row.depot) : null,
      lookbackDays: row.lookbackDays ?? null,
      minDays: row.minDays ?? null,
      maxDays: row.maxDays ?? null,
      note: row.note || null,
      createdAt: row.createdAt,
    }));
  }

  async createOverride(input: {
    scopeType?: string;
    productCode?: string | null;
    supplierCode?: string | null;
    depot?: string | null;
    lookbackDays?: number | null;
    minDays?: number | null;
    maxDays?: number | null;
    note?: string | null;
    userId?: string | null;
  }): Promise<{ id: string }> {
    const scopeType = normalizeCode(input.scopeType) === 'SUPPLIER' ? 'SUPPLIER' : 'PRODUCT';
    const productCode = normalizeCode(input.productCode);
    const supplierCode = normalizeCode(input.supplierCode);
    const depotRaw = normalizeCode(input.depot);
    const depot: MinMaxDepot | null = depotRaw === 'MERKEZ' || depotRaw === 'TOPCA' ? (depotRaw as MinMaxDepot) : null;

    if (scopeType === 'PRODUCT' && !productCode) {
      throw new AppError('Urun kurali icin stok kodu zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }
    if (scopeType === 'SUPPLIER' && !supplierCode) {
      throw new AppError('Tedarikci kurali icin cari kodu zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }

    const lookbackDays = input.lookbackDays === null || input.lookbackDays === undefined || input.lookbackDays === ('' as any)
      ? null
      : clampInt(input.lookbackDays, MIN_LOOKBACK_DAYS, MAX_LOOKBACK_DAYS, DEFAULT_SETTINGS.lookbackDays);
    const minDays = input.minDays === null || input.minDays === undefined || input.minDays === ('' as any)
      ? null
      : clampInt(input.minDays, 1, MAX_DAY_PARAM, DEFAULT_SETTINGS.minDays);
    const maxDays = input.maxDays === null || input.maxDays === undefined || input.maxDays === ('' as any)
      ? null
      : clampInt(input.maxDays, 1, MAX_DAY_PARAM, DEFAULT_SETTINGS.maxDays);

    if (lookbackDays === null && minDays === null && maxDays === null) {
      throw new AppError('En az bir gun parametresi (pencere/min/max) girilmelidir.', 400, ErrorCode.BAD_REQUEST);
    }
    if (minDays !== null && maxDays !== null && maxDays < minDays) {
      throw new AppError('Max gun, min gunden kucuk olamaz.', 400, ErrorCode.BAD_REQUEST);
    }

    // Ayni kapsam + kod + depo icin tekrar kural engelle (depot null'lar Postgres unique'te
    // ayrik sayildigi icin kontrol burada yapilir)
    const duplicate = await prisma.minMaxOverride.findFirst({
      where: {
        scopeType,
        productCode: scopeType === 'PRODUCT' ? productCode : null,
        supplierCode: scopeType === 'SUPPLIER' ? supplierCode : null,
        depot: depot,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new AppError('Bu kapsam ve depo icin zaten bir kural var. Once mevcut kurali silin.', 400, ErrorCode.BAD_REQUEST);
    }

    const created = await prisma.minMaxOverride.create({
      data: {
        scopeType,
        productCode: scopeType === 'PRODUCT' ? productCode : null,
        supplierCode: scopeType === 'SUPPLIER' ? supplierCode : null,
        depot,
        lookbackDays,
        minDays,
        maxDays,
        note: input.note ? String(input.note).trim().slice(0, 500) : null,
        createdById: input.userId ? String(input.userId) : null,
      },
      select: { id: true },
    });
    return { id: created.id };
  }

  async deleteOverride(id: string): Promise<{ id: string }> {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) {
      throw new AppError('Kural id zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }
    const existing = await prisma.minMaxOverride.findUnique({ where: { id: normalizedId }, select: { id: true } });
    if (!existing) {
      throw new AppError('Kural bulunamadi.', 404, ErrorCode.NOT_FOUND);
    }
    await prisma.minMaxOverride.delete({ where: { id: normalizedId } });
    return { id: normalizedId };
  }

  // ==================== ONIZLEME (HESAP MOTORU) ====================

  private resolveEffectiveParams(
    productCode: string,
    supplierCode: string,
    depot: MinMaxDepot,
    defaults: MinMaxSettings,
    productOverrides: Map<string, { lookbackDays: number | null; minDays: number | null; maxDays: number | null; depot: string | null }[]>,
    supplierOverrides: Map<string, { lookbackDays: number | null; minDays: number | null; maxDays: number | null; depot: string | null }[]>
  ): EffectiveParams {
    // Depo-spesifik kural, depo=null (her iki depo) kuralindan onceliklidir.
    const pickForDepot = (
      candidates: Array<{ lookbackDays: number | null; minDays: number | null; maxDays: number | null; depot: string | null }> | undefined
    ) => {
      if (!candidates || candidates.length === 0) return null;
      const depotSpecific = candidates.find((candidate) => normalizeCode(candidate.depot) === depot);
      if (depotSpecific) return depotSpecific;
      return candidates.find((candidate) => !candidate.depot) || null;
    };

    const productRule = pickForDepot(productOverrides.get(productCode));
    if (productRule) {
      return {
        lookbackDays: productRule.lookbackDays ?? defaults.lookbackDays,
        minDays: productRule.minDays ?? defaults.minDays,
        maxDays: productRule.maxDays ?? defaults.maxDays,
        source: 'urun',
      };
    }

    const supplierRule = supplierCode ? pickForDepot(supplierOverrides.get(supplierCode)) : null;
    if (supplierRule) {
      return {
        lookbackDays: supplierRule.lookbackDays ?? defaults.lookbackDays,
        minDays: supplierRule.minDays ?? defaults.minDays,
        maxDays: supplierRule.maxDays ?? defaults.maxDays,
        source: 'tedarikci',
      };
    }

    return {
      lookbackDays: defaults.lookbackDays,
      minDays: defaults.minDays,
      maxDays: defaults.maxDays,
      source: 'varsayilan',
    };
  }

  async previewMinMax(depotInput: string): Promise<MinMaxPreviewResult> {
    const depot = normalizeDepot(depotInput);
    const warehouseNo = depotToWarehouseNo(depot);
    const defaults = await this.getSettings();

    const overrides = await prisma.minMaxOverride.findMany();
    const productOverrides = new Map<string, Array<{ lookbackDays: number | null; minDays: number | null; maxDays: number | null; depot: string | null }>>();
    const supplierOverrides = new Map<string, Array<{ lookbackDays: number | null; minDays: number | null; maxDays: number | null; depot: string | null }>>();
    overrides.forEach((row) => {
      const entry = {
        lookbackDays: row.lookbackDays ? clampInt(row.lookbackDays, MIN_LOOKBACK_DAYS, MAX_LOOKBACK_DAYS, defaults.lookbackDays) : null,
        minDays: row.minDays ? clampInt(row.minDays, 1, MAX_DAY_PARAM, defaults.minDays) : null,
        maxDays: row.maxDays ? clampInt(row.maxDays, 1, MAX_DAY_PARAM, defaults.maxDays) : null,
        depot: row.depot || null,
      };
      // Baska depoya ozel kurallari bu onizlemede hic dikkate alma
      if (entry.depot && normalizeDepot(entry.depot) !== depot) return;
      if (row.scopeType === 'SUPPLIER' && row.supplierCode) {
        const key = normalizeCode(row.supplierCode);
        supplierOverrides.set(key, [...(supplierOverrides.get(key) || []), entry]);
      } else if (row.productCode) {
        const key = normalizeCode(row.productCode);
        productOverrides.set(key, [...(productOverrides.get(key) || []), entry]);
      }
    });

    // Kullanilacak tum farkli pencere degerleri (Settings + kurallar); her pencere icin
    // tek sorguda ayri SUM kolonlari uretilir (N+1 yasak).
    const lookbackSet = new Set<number>([defaults.lookbackDays]);
    overrides.forEach((row) => {
      if (row.lookbackDays) {
        lookbackSet.add(clampInt(row.lookbackDays, MIN_LOOKBACK_DAYS, MAX_LOOKBACK_DAYS, defaults.lookbackDays));
      }
    });
    const lookbackWindows = Array.from(lookbackSet).sort((a, b) => a - b);
    if (lookbackWindows.length > MAX_DISTINCT_LOOKBACKS) {
      throw new AppError(
        `Cok fazla farkli pencere degeri var (${lookbackWindows.length}). Kurallardaki pencere cesitliligini azaltin (en fazla ${MAX_DISTINCT_LOOKBACKS}).`,
        400,
        ErrorCode.BAD_REQUEST
      );
    }
    const maxWindow = lookbackWindows[lookbackWindows.length - 1];

    // Satis kosullari: reports.service.ts getUcarerProductSalesHistory (6859-6878) ile AYNI kalip
    // (Fth_MinMaxHesaplama penceresine denk satis hareketi tanimi) + TOPLU haric + exclusion'lar.
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
    ];
    const exclusionConditions = await exclusionService.buildStokHareketleriExclusionConditions();
    // Exclusion kosullari st./c. aliaslarini kullanabilir; sadece gerekirse join eklenir.
    const needsStoklarJoin = exclusionConditions.some((condition) => condition.includes('st.sto_'));
    const needsCariJoin = exclusionConditions.some((condition) => condition.includes('c.cari_'));

    const whereClause = [
      ...baseConditions,
      ...exclusionConditions,
      `sth.sth_tarih >= DATEADD(DAY, -${maxWindow}, CAST(GETDATE() AS date))`,
    ].join(' AND ');

    // Pencere basina depo-bazli ve sirket-geneli iki ayri SUM kolonu.
    // Depo filtresi: sth_cikis_depo_no (satis cikis deposu; hot-sale/warehouse servislerindeki
    // yazimlarla dogrulanmis kolon adi).
    const sumColumns = lookbackWindows
      .map((days) => {
        const cut = `DATEADD(DAY, -${days}, CAST(GETDATE() AS date))`;
        return [
          `SUM(CASE WHEN sth.sth_tarih >= ${cut} AND ISNULL(sth.sth_cikis_depo_no, 0) = ${warehouseNo} THEN CAST(ISNULL(sth.sth_miktar, 0) AS FLOAT) ELSE 0 END) AS depotQty_${days}`,
          `SUM(CASE WHEN sth.sth_tarih >= ${cut} THEN CAST(ISNULL(sth.sth_miktar, 0) AS FLOAT) ELSE 0 END) AS totalQty_${days}`,
        ].join(',\n          ');
      })
      .join(',\n          ');

    const salesJoins = [
      needsStoklarJoin ? 'LEFT JOIN STOKLAR st WITH (NOLOCK) ON st.sto_kod = sth.sth_stok_kod' : '',
      needsCariJoin ? 'LEFT JOIN CARI_HESAPLAR c WITH (NOLOCK) ON c.cari_kod = sth.sth_cari_kodu' : '',
    ]
      .filter(Boolean)
      .join('\n        ');

    // Tek toplu sorgu: satis SUM'lari + urun meta + mevcut min/max.
    // Urun seti: penceresinde satisi olan URUNLER ∪ depoda min/max tanimli URUNLER
    // (dusus/sifirlama onerileri de gorunsun diye).
    const queryText = `
      WITH Sales AS (
        SELECT
          UPPER(LTRIM(RTRIM(sth.sth_stok_kod))) AS productCode,
          ${sumColumns}
        FROM STOK_HAREKETLERI sth WITH (NOLOCK)
        ${salesJoins}
        WHERE ${whereClause}
        GROUP BY UPPER(LTRIM(RTRIM(sth.sth_stok_kod)))
      )
      SELECT
        UPPER(LTRIM(RTRIM(s.sto_kod))) AS productCode,
        LTRIM(RTRIM(ISNULL(s.sto_isim, ''))) AS productName,
        UPPER(LTRIM(RTRIM(ISNULL(s.sto_sat_cari_kod, '')))) AS supplierCode,
        LTRIM(RTRIM(ISNULL(sc.cari_unvan1, ''))) AS supplierName,
        UPPER(LTRIM(RTRIM(ISNULL(s.sto_model_kodu, '')))) AS modelKodu,
        CAST(ISNULL(sdp.sdp_min_stok, 0) AS FLOAT) AS currentMin,
        CAST(ISNULL(sdp.sdp_max_stok, 0) AS FLOAT) AS currentMax,
        CASE WHEN sdp.sdp_depo_kod IS NULL THEN 0 ELSE 1 END AS hasDepotRecord,
        ${lookbackWindows
          .map((days) => `ISNULL(sa.depotQty_${days}, 0) AS depotQty_${days}, ISNULL(sa.totalQty_${days}, 0) AS totalQty_${days}`)
          .join(',\n        ')}
      FROM STOKLAR s WITH (NOLOCK)
      LEFT JOIN STOK_DEPO_DETAYLARI sdp WITH (NOLOCK)
        ON LTRIM(RTRIM(sdp.sdp_depo_kod)) = LTRIM(RTRIM(s.sto_kod))
        AND sdp.sdp_depo_no = ${warehouseNo}
      LEFT JOIN CARI_HESAPLAR sc WITH (NOLOCK)
        ON sc.cari_kod = LTRIM(RTRIM(ISNULL(s.sto_sat_cari_kod, '')))
      LEFT JOIN Sales sa
        ON sa.productCode = UPPER(LTRIM(RTRIM(s.sto_kod)))
      WHERE ISNULL(s.sto_pasif_fl, 0) = 0
        AND (
          sa.productCode IS NOT NULL
          OR ISNULL(sdp.sdp_min_stok, 0) <> 0
          OR ISNULL(sdp.sdp_max_stok, 0) <> 0
        )
    `;

    const rawRows = await this.runMikroQuery(queryText);

    const rows: MinMaxPreviewRow[] = rawRows.map((raw: any) => {
      const productCode = normalizeCode(raw?.productCode);
      const supplierCode = normalizeCode(raw?.supplierCode);
      const excluded = normalizeCode(raw?.modelKodu) === 'HAYIR';
      const currentMin = Number(raw?.currentMin) || 0;
      const currentMax = Number(raw?.currentMax) || 0;
      const hasDepotRecord = Number(raw?.hasDepotRecord) === 1;

      const params = this.resolveEffectiveParams(
        productCode,
        supplierCode,
        depot,
        defaults,
        productOverrides,
        supplierOverrides
      );
      // Efektif pencere her zaman lookbackWindows kumesindedir (kume Settings+kurallardan uretildi)
      const windowDays = lookbackSet.has(params.lookbackDays) ? params.lookbackDays : defaults.lookbackDays;
      const depotQty = Number(raw?.[`depotQty_${windowDays}`]) || 0;
      const totalQty = Number(raw?.[`totalQty_${windowDays}`]) || 0;
      const salesQty = defaults.salesScope === 'COMPANY' ? totalQty : depotQty;
      const dailySales = windowDays > 0 ? salesQty / windowDays : 0;

      let newMin: number | null = null;
      let newMax: number | null = null;
      if (!excluded) {
        newMin = dailySales > 0 ? Math.ceil(dailySales * params.minDays) : 0;
        newMax = dailySales > 0 ? Math.ceil(dailySales * params.maxDays) : 0;
        if (newMax < newMin) newMax = newMin;
      }

      return {
        productCode,
        productName: String(raw?.productName || '').trim(),
        supplierCode: supplierCode || null,
        supplierName: String(raw?.supplierName || '').trim() || null,
        depot,
        excluded,
        hasDepotRecord,
        salesQty: Math.round(salesQty * 100) / 100,
        dailySales: Math.round(dailySales * 10000) / 10000,
        lookbackUsed: windowDays,
        minDaysUsed: params.minDays,
        maxDaysUsed: params.maxDays,
        currentMin,
        currentMax,
        newMin,
        newMax,
        diffMin: newMin === null ? null : Math.round((newMin - currentMin) * 100) / 100,
        diffMax: newMax === null ? null : Math.round((newMax - currentMax) * 100) / 100,
        overrideSource: excluded ? 'haric' : params.source,
      };
    });

    rows.sort((a, b) => Math.abs(b.diffMax ?? 0) - Math.abs(a.diffMax ?? 0) || a.productCode.localeCompare(b.productCode));

    const summary = {
      changedCount: rows.filter((row) => !row.excluded && ((row.diffMin ?? 0) !== 0 || (row.diffMax ?? 0) !== 0)).length,
      excludedCount: rows.filter((row) => row.excluded).length,
      missingDepotRecordCount: rows.filter((row) => !row.hasDepotRecord).length,
      overrideProductCount: rows.filter((row) => row.overrideSource === 'urun').length,
      overrideSupplierCount: rows.filter((row) => row.overrideSource === 'tedarikci').length,
    };

    return {
      depot,
      salesScope: defaults.salesScope,
      defaults,
      rows,
      total: rows.length,
      summary,
      generatedAt: new Date().toISOString(),
    };
  }

  // ==================== MIKRO'YA YAZMA (KULLANICI ONAYLI) ====================

  /**
   * Sadece kullanicinin onizlemeden secip gonderdigi satirlari STOK_DEPO_DETAYLARI'na yazar.
   * Yazma kalibi reports.service.ts:7350-7356 (reset) ile AYNI tablo/kolon/anahtar mantigidir:
   *   UPDATE STOK_DEPO_DETAYLARI SET sdp_min_stok, sdp_max_stok
   *   WHERE LTRIM(RTRIM(sdp_depo_kod)) = <stok kodu> AND sdp_depo_no = <depo no>
   * Reset kalibi INSERT yapmadigi icin burada da yapilmaz; kaydi olmayan urunler
   * 'skipped' listesinde doner. Parametreli + chunk'li calisir.
   */
  async applyMinMax(input: {
    depot: string;
    items: MinMaxApplyItem[];
    userId?: string | null;
  }): Promise<MinMaxApplyResult> {
    const depot = normalizeDepot(input.depot);
    const warehouseNo = depotToWarehouseNo(depot);

    const items: MinMaxApplyItem[] = [];
    const seen = new Set<string>();
    const invalid: Array<{ productCode: string; reason: string }> = [];
    (Array.isArray(input.items) ? input.items : []).forEach((item) => {
      const productCode = normalizeCode(item?.productCode);
      const newMin = Math.trunc(Number(item?.newMin));
      const newMax = Math.trunc(Number(item?.newMax));
      if (!productCode) return;
      if (seen.has(productCode)) return;
      seen.add(productCode);
      if (!Number.isFinite(newMin) || !Number.isFinite(newMax) || newMin < 0 || newMax < 0) {
        invalid.push({ productCode, reason: 'Gecersiz min/max degeri' });
        return;
      }
      if (newMax < newMin) {
        invalid.push({ productCode, reason: 'Max, min degerinden kucuk olamaz' });
        return;
      }
      items.push({ productCode, newMin, newMax });
    });

    if (items.length === 0) {
      throw new AppError('Yazilacak gecerli satir yok.', 400, ErrorCode.BAD_REQUEST);
    }
    if (items.length > MAX_APPLY_ITEMS) {
      throw new AppError(`Tek seferde en fazla ${MAX_APPLY_ITEMS} urun yazilabilir.`, 400, ErrorCode.BAD_REQUEST);
    }

    await mikroService.connect();

    const updated: MinMaxApplyResult['updated'] = [];
    const skipped: Array<{ productCode: string; reason: string }> = [...invalid];

    for (let offset = 0; offset < items.length; offset += APPLY_CHUNK_SIZE) {
      const chunk = items.slice(offset, offset + APPLY_CHUNK_SIZE);
      const request = mikroService.pool!.request();
      (request as any).timeout = Number(process.env.UCARER_MINMAX_TIMEOUT_MS || 300000);

      const statements: string[] = [
        'SET NOCOUNT ON;',
        'DECLARE @res TABLE (code nvarchar(40), oldMin float, oldMax float, newMin float, newMax float);',
      ];
      chunk.forEach((item, index) => {
        request.input(`code${index}`, sql.NVarChar(40), item.productCode);
        request.input(`min${index}`, sql.Float, item.newMin);
        request.input(`max${index}`, sql.Float, item.newMax);
        statements.push(`
          UPDATE sdp
          SET sdp_min_stok = @min${index},
              sdp_max_stok = @max${index}
          OUTPUT
            UPPER(LTRIM(RTRIM(deleted.sdp_depo_kod))),
            CAST(ISNULL(deleted.sdp_min_stok, 0) AS float),
            CAST(ISNULL(deleted.sdp_max_stok, 0) AS float),
            CAST(ISNULL(inserted.sdp_min_stok, 0) AS float),
            CAST(ISNULL(inserted.sdp_max_stok, 0) AS float)
          INTO @res
          FROM STOK_DEPO_DETAYLARI sdp
          WHERE LTRIM(RTRIM(sdp.sdp_depo_kod)) = @code${index}
            AND sdp.sdp_depo_no = ${warehouseNo};
        `);
      });
      statements.push('SELECT code, oldMin, oldMax, newMin, newMax FROM @res;');

      const result = await request.query(statements.join('\n'));
      const resultRows = Array.isArray(result.recordset) ? result.recordset : [];
      const updatedCodes = new Set<string>();
      resultRows.forEach((row: any) => {
        const code = normalizeCode(row?.code);
        if (!code) return;
        updatedCodes.add(code);
        updated.push({
          productCode: code,
          oldMin: Number(row?.oldMin) || 0,
          oldMax: Number(row?.oldMax) || 0,
          newMin: Number(row?.newMin) || 0,
          newMax: Number(row?.newMax) || 0,
        });
      });
      chunk.forEach((item) => {
        if (!updatedCodes.has(item.productCode)) {
          skipped.push({ productCode: item.productCode, reason: 'STOK_DEPO_DETAYLARI kaydi bulunamadi' });
        }
      });
    }

    await this.logOperation({
      operationType: 'MINMAX_V2_APPLY',
      title: `Min-Max v2: ${updated.length} urun Mikro'ya yazildi (${depot})`,
      depot,
      previousValues: updated.slice(0, 200).map((row) => ({
        productCode: row.productCode,
        min: row.oldMin,
        max: row.oldMax,
      })),
      newValues: updated.slice(0, 200).map((row) => ({
        productCode: row.productCode,
        min: row.newMin,
        max: row.newMax,
      })),
      metadata: {
        requested: items.length,
        updatedCount: updated.length,
        skippedCount: skipped.length,
        skipped: skipped.slice(0, 50),
        warehouseNo,
      },
      userId: input.userId || null,
    });

    return {
      depot,
      requested: items.length,
      updated,
      skipped,
    };
  }

  /**
   * UcarerOperationLog kaydi (reports.service.ts logUcarerOperation kalibinin kopyasi;
   * kaynak: reports.service.ts:1924-1970 — metod private oldugu icin burada tekrarlanir).
   */
  private async logOperation(input: {
    operationType: string;
    title: string;
    depot?: string | null;
    previousValues?: Record<string, any> | any[] | null;
    newValues?: Record<string, any> | any[] | null;
    metadata?: Record<string, any> | any[] | null;
    userId?: string | null;
  }): Promise<void> {
    try {
      const normalizedUserId = String(input.userId || '').trim();
      let userName: string | null = null;
      let userId: string | null = null;
      if (normalizedUserId) {
        const user = await prisma.user.findUnique({
          where: { id: normalizedUserId },
          select: { id: true, name: true, email: true },
        });
        userId = user?.id || normalizedUserId;
        userName = user?.name || user?.email || null;
      }
      const jsonOrUndefined = (value: unknown): Prisma.InputJsonValue | undefined => {
        if (value === undefined || value === null) return undefined;
        return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
      };
      await prisma.ucarerOperationLog.create({
        data: {
          operationType: String(input.operationType || 'UNKNOWN').trim() || 'UNKNOWN',
          title: String(input.title || '').trim() || 'Ucarer islemi',
          depot: input.depot ? String(input.depot).trim().toUpperCase() : null,
          orderNumbers: [],
          previousValues: jsonOrUndefined(input.previousValues),
          newValues: jsonOrUndefined(input.newValues),
          metadata: jsonOrUndefined(input.metadata),
          userId,
          userName,
        },
      });
    } catch (error) {
      console.warn('MinMax v2 islem logu yazilamadi:', error);
    }
  }
}

export default new MinMaxService();
