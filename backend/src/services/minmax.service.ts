/**
 * Min-Max v2 Servisi
 *
 * Mikro SP'sine (FEBG_MinMaxHesaplaRES) dokunmadan B2B tarafinda calisan paralel
 * min-max hesap motoru. Onizleme (kiyas) uretir; Mikro'ya yazma SADECE kullanicinin
 * onizlemeden secip onayladigi satirlar icin applyMinMax ile yapilir.
 *
 * Hesap mantigi (patron tarifi):
 *   efektifGun  = min(lookbackDays, bugun - penceredeki ilk satis tarihi + 1), taban 7
 *                 ("120 gun baz al" dense bile urun 43 gundur satiliyorsa 43'e bolunur)
 *   gunlukSatis = son <lookbackDays> gun satis miktari / efektifGun
 *   yeniMin     = ceil(gunlukSatis * minDays)
 *   yeniMax     = ceil(gunlukSatis * maxDays)
 *   Pencere satisi olmayan urunler yeniMin=0 / yeniMax=0 alir.
 *   (Eski 'SIPARIS' cold-start mantigi KALDIRILDI: tek seferlik musteri siparisleri
 *    yanlis min/max onerileri uretiyordu.)
 *
 * Parametre onceligi: URUN override > TEDARIKCI override > Settings varsayilani.
 * sto_model_kodu = 'HAYIR' olan urunler hesaplanmaz (listede 'haric' rozetiyle gorunur).
 * MinMaxExclusion (kullanici haric listesi, minmax-exclusion.service.ts) kayitlari da
 * hesaplanmaz: satir listede gorunur ama userExcluded=true, newMin/newMax null doner;
 * applyMinMax bu kodlari 'Kullanici tarafindan hesaplama disi birakildi' ile reddeder.
 * TOPLU sorumluluk merkezi satirlari ve ReportExclusion kayitlari satistan haric tutulur
 * (reports.service.ts getUcarerProductSalesHistory ile ayni satis kosullari).
 */

import * as sql from 'mssql';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { AppError, ErrorCode } from '../types/errors';
import mikroService from './mikro.service';
import exclusionService from './exclusion.service';
import minMaxExclusionService from './minmax-exclusion.service';

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
  userExcluded: boolean;      // MinMaxExclusion listesinde (kullanici hesaplama disi birakti)
  hasDepotRecord: boolean;    // STOK_DEPO_DETAYLARI kaydi var mi (yoksa apply atlanir)
  salesQty: number;           // efektif penceredeki satis miktari (kapsama gore)
  dailySales: number;
  docCount: number;           // efektif penceredeki FARKLI satis evraki sayisi (kapsama gore)
  effectiveDays: number;      // min(pencere, bugun - pencere icindeki ilk satis + 1), taban 7
  firstSaleDate: string | null; // pencere icindeki ilk satis tarihi (kapsama gore, YYYY-MM-DD)
  isShortWindow: boolean;     // efektif gun < pencere (urun pencere ortasinda satisa baslamis)
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
    userExcludedCount: number;      // MinMaxExclusion listesindeki (kullanici haric) satir sayisi
    missingDepotRecordCount: number;
    missingWithSalesCount: number;  // sicilsiz (depo kaydi yok) + penceresinde satisi olan urun sayisi
    missingWithSalesDaily: number;  // bu urunlerin gunluk satis toplami
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
  inserted: string[];  // allowInsert=true ile STOK_DEPO_DETAYLARI'na yeni acilan kayitlarin stok kodlari
}

const MAX_APPLY_ITEMS = 5000;
const APPLY_CHUNK_SIZE = 25;
const MAX_DISTINCT_LOOKBACKS = 20;
const MIN_LOOKBACK_DAYS = 7;
const MAX_LOOKBACK_DAYS = 365;
const MAX_DAY_PARAM = 365;
const MIN_EFFECTIVE_WINDOW_DAYS = 7; // efektif pencere tabani (tek gunluk satisla absurt min/max cikmasin)
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

  // ==================== DEPO MIN/MAX SORGUSU ====================

  /**
   * Verilen stok kodlari icin merkez(1) ve topca(6) depo min/max degerlerini dondurur.
   * Ucarer tedarikci siparis modalindaki "karsi depodan transfer" kontrolu icin
   * (karsi depo fazlasi = karsi depo stok - karsi depo MIN; min'in altina dusurmeden oner).
   * SALT OKUMA; max 200 kod.
   */
  async getDepotMinMaxByCodes(codes: string[]): Promise<Record<string, { '1': { min: number; max: number }; '6': { min: number; max: number } }>> {
    const cleaned = Array.from(
      new Set((codes || []).map((c) => String(c || '').trim()).filter(Boolean))
    ).slice(0, 200);
    if (!cleaned.length) return {};

    await mikroService.connect();
    const request = mikroService.pool!.request();
    const placeholders = cleaned.map((code, i) => {
      request.input(`c${i}`, sql.NVarChar, code);
      return `@c${i}`;
    });
    const result = await request.query(`
      SELECT LTRIM(RTRIM(sdp_depo_kod)) AS code, sdp_depo_no AS depoNo,
             ISNULL(sdp_min_stok, 0) AS minStok, ISNULL(sdp_max_stok, 0) AS maxStok
      FROM STOK_DEPO_DETAYLARI WITH (NOLOCK)
      WHERE sdp_depo_no IN (1, 6) AND LTRIM(RTRIM(sdp_depo_kod)) IN (${placeholders.join(', ')})
    `);
    const map: Record<string, { '1': { min: number; max: number }; '6': { min: number; max: number } }> = {};
    for (const row of result.recordset || []) {
      const code = String(row.code || '');
      if (!map[code]) {
        map[code] = { '1': { min: 0, max: 0 }, '6': { min: 0, max: 0 } };
      }
      const depo = String(row.depoNo) === '6' ? '6' : '1';
      map[code][depo] = { min: Number(row.minStok) || 0, max: Number(row.maxStok) || 0 };
    }
    return map;
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

    // Kullanicinin hesaplama disi biraktigi stok kodlari (MinMaxExclusion): satirlar
    // listede kalir ama userExcluded=true + newMin/newMax null doner (UI gri gosterir).
    const userExcludedCodes = await minMaxExclusionService.getExcludedCodes();

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

    // Pencere basina depo-bazli ve sirket-geneli iki ayri SUM kolonu + pencere icindeki
    // ilk satis tarihi (efektif gun hesabi pencereye gore yapilsin; global MIN kullanilirsa
    // kisa pencereli kurallarda pencere disi eski satis tarihi efektif gunu bozar).
    // Depo filtresi: sth_cikis_depo_no (satis cikis deposu; hot-sale/warehouse servislerindeki
    // yazimlarla dogrulanmis kolon adi).
    // Evrak anahtari: seri + '-' + sira (reports.service.ts'deki evrak kimligi kalibi).
    // COUNT(DISTINCT CASE ... END) NULL'lari saymaz; pencere/depo disindaki satirlar
    // CASE'ten NULL dondugu icin sayilmaz. ISNULL sarmalari NULL seri/sira birlesiminin
    // tum ifadeyi NULL yapip evraki dusurmesini engeller.
    const docKeyExpr = `ISNULL(sth.sth_evrakno_seri, '') + '-' + CAST(ISNULL(sth.sth_evrakno_sira, 0) AS VARCHAR(20))`;
    const sumColumns = lookbackWindows
      .map((days) => {
        const cut = `DATEADD(DAY, -${days}, CAST(GETDATE() AS date))`;
        return [
          `SUM(CASE WHEN sth.sth_tarih >= ${cut} AND ISNULL(sth.sth_cikis_depo_no, 0) = ${warehouseNo} THEN CAST(ISNULL(sth.sth_miktar, 0) AS FLOAT) ELSE 0 END) AS depotQty_${days}`,
          `SUM(CASE WHEN sth.sth_tarih >= ${cut} THEN CAST(ISNULL(sth.sth_miktar, 0) AS FLOAT) ELSE 0 END) AS totalQty_${days}`,
          `COUNT(DISTINCT CASE WHEN sth.sth_tarih >= ${cut} AND ISNULL(sth.sth_cikis_depo_no, 0) = ${warehouseNo} THEN ${docKeyExpr} END) AS depotDocCount_${days}`,
          `COUNT(DISTINCT CASE WHEN sth.sth_tarih >= ${cut} THEN ${docKeyExpr} END) AS totalDocCount_${days}`,
          `MIN(CASE WHEN sth.sth_tarih >= ${cut} AND ISNULL(sth.sth_cikis_depo_no, 0) = ${warehouseNo} THEN sth.sth_tarih END) AS depotFirstSale_${days}`,
          `MIN(CASE WHEN sth.sth_tarih >= ${cut} THEN sth.sth_tarih END) AS totalFirstSale_${days}`,
        ].join(',\n          ');
      })
      .join(',\n          ');

    const salesJoins = [
      needsStoklarJoin ? 'LEFT JOIN STOKLAR st WITH (NOLOCK) ON st.sto_kod = sth.sth_stok_kod' : '',
      needsCariJoin ? 'LEFT JOIN CARI_HESAPLAR c WITH (NOLOCK) ON c.cari_kod = sth.sth_cari_kodu' : '',
    ]
      .filter(Boolean)
      .join('\n        ');

    // Tek toplu sorgu: satis SUM'lari + farkli evrak sayilari + pencere icindeki ilk
    // satis tarihi + urun meta + mevcut min/max.
    // Urun seti: penceresinde satisi olan URUNLER ∪ depoda min/max tanimli URUNLER.
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
          .map((days) => `ISNULL(sa.depotQty_${days}, 0) AS depotQty_${days}, ISNULL(sa.totalQty_${days}, 0) AS totalQty_${days}, ISNULL(sa.depotDocCount_${days}, 0) AS depotDocCount_${days}, ISNULL(sa.totalDocCount_${days}, 0) AS totalDocCount_${days}, sa.depotFirstSale_${days}, sa.totalFirstSale_${days}`)
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
      const userExcluded = userExcludedCodes.has(productCode);
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
      // Farkli satis evraki sayisi: kapsam (DEPOT/COMPANY) ve efektif pencere secimi
      // salesQty ile birebir ayni mantik.
      const depotDocCount = Number(raw?.[`depotDocCount_${windowDays}`]) || 0;
      const totalDocCount = Number(raw?.[`totalDocCount_${windowDays}`]) || 0;
      const docCount = defaults.salesScope === 'COMPANY' ? totalDocCount : depotDocCount;

      // Efektif satis penceresi (patron tarifi): urun pencere ortasinda satilmaya
      // baslamissa gun sayisi ilk satis tarihinden itibaren sayilir; taban 7 gun.
      // Ilk satis tarihi de satis kapsamina (DEPOT/COMPANY) VE urunun efektif
      // penceresine gore secilir (pencere-bazli MIN kolonlari).
      const firstSaleRaw = defaults.salesScope === 'COMPANY'
        ? raw?.[`totalFirstSale_${windowDays}`]
        : raw?.[`depotFirstSale_${windowDays}`];
      const firstSale = firstSaleRaw ? new Date(firstSaleRaw) : null;
      let firstSaleDate: string | null = null;
      let effectiveDays = windowDays;
      if (firstSale && !Number.isNaN(firstSale.getTime())) {
        firstSaleDate = firstSale.toISOString().slice(0, 10);
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const saleStart = new Date(firstSale);
        saleStart.setHours(0, 0, 0, 0);
        const daysSinceFirstSale = Math.floor((todayStart.getTime() - saleStart.getTime()) / MS_PER_DAY) + 1;
        effectiveDays = Math.max(MIN_EFFECTIVE_WINDOW_DAYS, Math.min(windowDays, daysSinceFirstSale));
      }
      const isShortWindow = effectiveDays < windowDays;
      const dailySales = effectiveDays > 0 ? salesQty / effectiveDays : 0;

      // userExcluded: kullanici haric listesindeki urunlere oneri uretilmez
      // (newMin/newMax/diff null kalir); satir listede gorunmeye devam eder.
      let newMin: number | null = null;
      let newMax: number | null = null;
      const source: MinMaxOverrideSource = excluded ? 'haric' : params.source;
      if (!excluded && !userExcluded) {
        if (dailySales > 0) {
          newMin = Math.ceil(dailySales * params.minDays);
          newMax = Math.ceil(dailySales * params.maxDays);
        } else {
          newMin = 0;
          newMax = 0;
        }
        if (newMax < newMin) newMax = newMin;
      }

      return {
        productCode,
        productName: String(raw?.productName || '').trim(),
        supplierCode: supplierCode || null,
        supplierName: String(raw?.supplierName || '').trim() || null,
        depot,
        excluded,
        userExcluded,
        hasDepotRecord,
        salesQty: Math.round(salesQty * 100) / 100,
        dailySales: Math.round(dailySales * 10000) / 10000,
        docCount,
        effectiveDays,
        firstSaleDate,
        isShortWindow,
        lookbackUsed: windowDays,
        minDaysUsed: params.minDays,
        maxDaysUsed: params.maxDays,
        currentMin,
        currentMax,
        newMin,
        newMax,
        diffMin: newMin === null ? null : Math.round((newMin - currentMin) * 100) / 100,
        diffMax: newMax === null ? null : Math.round((newMax - currentMax) * 100) / 100,
        overrideSource: source,
      };
    });

    rows.sort((a, b) => Math.abs(b.diffMax ?? 0) - Math.abs(a.diffMax ?? 0) || a.productCode.localeCompare(b.productCode));

    // Sicilsiz urunler (STOK_DEPO_DETAYLARI kaydi yok): satisi olanlar apply'da
    // allowInsert=true ile yeni kayit acilarak yazilabilir; sayaclar UI uyarisi icin.
    const missingWithSales = rows.filter((row) => !row.hasDepotRecord && row.salesQty > 0);
    const summary = {
      changedCount: rows.filter((row) => !row.excluded && !row.userExcluded && ((row.diffMin ?? 0) !== 0 || (row.diffMax ?? 0) !== 0)).length,
      excludedCount: rows.filter((row) => row.excluded).length,
      userExcludedCount: rows.filter((row) => row.userExcluded).length,
      missingDepotRecordCount: rows.filter((row) => !row.hasDepotRecord).length,
      missingWithSalesCount: missingWithSales.length,
      missingWithSalesDaily: Math.round(missingWithSales.reduce((sum, row) => sum + row.dailySales, 0) * 100) / 100,
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
   * Varsayilan davranis (allowInsert verilmez/false): reset kalibi gibi INSERT yapilmaz;
   * kaydi olmayan urunler 'skipped' listesinde doner.
   * allowInsert=true (kullanici onayli, UI'dan secilerek gelir): sicilsiz urunler icin
   * STOK_DEPO_DETAYLARI'na yeni kayit acilir (bkz. insertMissingDepotRecords).
   * Parametreli + chunk'li calisir.
   */
  async applyMinMax(input: {
    depot: string;
    items: MinMaxApplyItem[];
    userId?: string | null;
    allowInsert?: boolean;
  }): Promise<MinMaxApplyResult> {
    const depot = normalizeDepot(input.depot);
    const warehouseNo = depotToWarehouseNo(depot);
    const allowInsert = input.allowInsert === true;

    // Kullanici haric listesi (MinMaxExclusion): bu kodlara yazma yapilmaz,
    // satir sebebiyle 'skipped' olarak raporlanir.
    const userExcludedCodes = await minMaxExclusionService.getExcludedCodes();

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
      if (userExcludedCodes.has(productCode)) {
        invalid.push({ productCode, reason: 'Kullanici tarafindan hesaplama disi birakildi' });
        return;
      }
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
      if (invalid.length > 0) {
        // Tum satirlar reddedildi (haric liste / gecersiz deger): hata firlatmak yerine
        // sebepleri satir bazinda 'skipped' olarak don (Mikro'ya baglanmadan, log'suz).
        return { depot, requested: 0, updated: [], skipped: invalid, inserted: [] };
      }
      throw new AppError('Yazilacak gecerli satir yok.', 400, ErrorCode.BAD_REQUEST);
    }
    if (items.length > MAX_APPLY_ITEMS) {
      throw new AppError(`Tek seferde en fazla ${MAX_APPLY_ITEMS} urun yazilabilir.`, 400, ErrorCode.BAD_REQUEST);
    }

    await mikroService.connect();

    const updated: MinMaxApplyResult['updated'] = [];
    const skipped: Array<{ productCode: string; reason: string }> = [...invalid];
    const missingItems: MinMaxApplyItem[] = [];

    for (let offset = 0; offset < items.length; offset += APPLY_CHUNK_SIZE) {
      const chunk = items.slice(offset, offset + APPLY_CHUNK_SIZE);
      // Chunk hatasi tum apply'i dusurmesin: hatali chunk 'skipped' olarak raporlanir,
      // sonraki chunk'lara devam edilir (insertMissingDepotRecords kalibi). logOperation
      // her durumda calisir; kismi basari bilgisi frontend toast'unda zaten gosteriliyor.
      try {
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
            missingItems.push(item);
          }
        });
      } catch (error: any) {
        const message = String(error?.message || 'bilinmeyen hata').slice(0, 200);
        chunk.forEach((item) => {
          skipped.push({ productCode: item.productCode, reason: `Mikro guncelleme basarisiz: ${message}` });
        });
      }
    }

    // Sicilsiz urunler: varsayilan davranis bugunku gibi 'skipped'; allowInsert=true
    // (kullanicinin UI'dan onaylayip sectigi satirlar) ise yeni depo kaydi acilir.
    let inserted: string[] = [];
    if (missingItems.length > 0) {
      if (allowInsert) {
        const insertResult = await this.insertMissingDepotRecords(warehouseNo, missingItems);
        inserted = insertResult.inserted;
        insertResult.failed.forEach((fail) => skipped.push(fail));
      } else {
        missingItems.forEach((item) => {
          skipped.push({ productCode: item.productCode, reason: 'STOK_DEPO_DETAYLARI kaydi bulunamadi' });
        });
      }
    }

    // Log'a inserted satirlarin min/max'i da yazilsin (sadece updated degil);
    // inserted kayitlarin oncesi yok, o yuzden previousValues'ta yer almazlar.
    const insertedSet = new Set(inserted);
    const insertedRows = missingItems.filter((item) => insertedSet.has(item.productCode));

    await this.logOperation({
      operationType: 'MINMAX_V2_APPLY',
      title: `Min-Max v2: ${updated.length} urun Mikro'ya yazildi (${depot})`,
      depot,
      previousValues: updated.slice(0, 200).map((row) => ({
        productCode: row.productCode,
        min: row.oldMin,
        max: row.oldMax,
      })),
      newValues: [
        ...updated.map((row) => ({
          productCode: row.productCode,
          min: row.newMin,
          max: row.newMax,
        })),
        ...insertedRows.map((item) => ({
          productCode: item.productCode,
          min: item.newMin,
          max: item.newMax,
          inserted: true,
        })),
      ].slice(0, 200),
      metadata: {
        requested: items.length,
        updatedCount: updated.length,
        skippedCount: skipped.length,
        skipped: skipped.slice(0, 50),
        allowInsert,
        insertedCount: inserted.length,
        inserted: inserted.slice(0, 50),
        warehouseNo,
      },
      userId: input.userId || null,
    });

    return {
      depot,
      requested: items.length,
      updated,
      skipped,
      inserted,
    };
  }

  /**
   * Sicilsiz urunler icin STOK_DEPO_DETAYLARI'na yeni kayit acar. SADECE applyMinMax
   * allowInsert=true dalindan cagrilir (kullanici onayi frontend'de alinir).
   *
   * Canli Mikro'da kolonlar versiyona gore degisebildigi icin INSERT kolon listesi
   * sabit yazilmaz; INFORMATION_SCHEMA.COLUMNS'tan dinamik kurulur:
   *   - sdp_depo_kod = STOK KODU (bu tabloda depo kodu degil stok kodu tutulur;
   *     applyMinMax UPDATE'inin WHERE kalibiyla ayni anahtar), sdp_depo_no = hedef depo,
   *     sdp_min_stok / sdp_max_stok = kullanicinin onayladigi yeni degerler
   *   - diger zorunlu (NOT NULL + default'suz; identity/computed/timestamp olmayan) kolonlar:
   *     uniqueidentifier -> NEWID(), tarih -> GETDATE(), string -> '', binary -> 0x,
   *     sayisal -> ornek satirdaki (SELECT TOP 1) tablo-geneli sabit deger (or. sdp_fileid),
   *     ornek okunamazsa 0.
   * IF NOT EXISTS korumasi ayni anahtara cift kayit acilmasini engeller (tekrar denemede guvenli).
   */
  private async insertMissingDepotRecords(
    warehouseNo: number,
    items: MinMaxApplyItem[]
  ): Promise<{ inserted: string[]; failed: Array<{ productCode: string; reason: string }> }> {
    const inserted: string[] = [];
    const failed: Array<{ productCode: string; reason: string }> = [];

    // a) Canli kolon envanteri (kolonlar Mikro versiyonuna gore degisebilir)
    let columns: Array<{
      name: string;
      isNullable: boolean;
      hasDefault: boolean;
      dataType: string;
      isComputed: boolean;
      isIdentity: boolean;
    }> = [];
    try {
      const rawColumns = await this.runMikroQuery(`
        SELECT
          c.COLUMN_NAME AS columnName,
          c.IS_NULLABLE AS isNullable,
          c.COLUMN_DEFAULT AS columnDefault,
          LOWER(c.DATA_TYPE) AS dataType,
          ISNULL(COLUMNPROPERTY(OBJECT_ID('STOK_DEPO_DETAYLARI'), c.COLUMN_NAME, 'IsComputed'), 0) AS isComputed,
          ISNULL(COLUMNPROPERTY(OBJECT_ID('STOK_DEPO_DETAYLARI'), c.COLUMN_NAME, 'IsIdentity'), 0) AS isIdentity
        FROM INFORMATION_SCHEMA.COLUMNS c
        WHERE c.TABLE_NAME = 'STOK_DEPO_DETAYLARI'
        ORDER BY c.ORDINAL_POSITION
      `);
      columns = rawColumns
        .map((raw: any) => ({
          name: String(raw?.columnName || '').trim(),
          isNullable: String(raw?.isNullable || '').trim().toUpperCase() === 'YES',
          hasDefault: raw?.columnDefault !== null && raw?.columnDefault !== undefined,
          dataType: String(raw?.dataType || '').trim().toLowerCase(),
          isComputed: Number(raw?.isComputed) === 1,
          isIdentity: Number(raw?.isIdentity) === 1,
        }))
        .filter((column) => column.name);
    } catch {
      columns = [];
    }
    if (columns.length === 0) {
      items.forEach((item) => {
        failed.push({ productCode: item.productCode, reason: 'STOK_DEPO_DETAYLARI kolon envanteri okunamadi, INSERT atlandi' });
      });
      return { inserted, failed };
    }

    // b) Ornek satir: zorunlu sayisal kolonlar icin tablo-geneli sabit degerler
    //    (or. sdp_fileid) 0 yerine mevcut kayitlardan alinir. Ornek satirdaki string/tarih
    //    degerleri TASINMAZ (urune ozel veri kopyalamamak icin '' / GETDATE() yazilir).
    let sampleRow: Record<string, any> | null = null;
    try {
      const sampleRows = await this.runMikroQuery('SELECT TOP 1 * FROM STOK_DEPO_DETAYLARI WITH (NOLOCK)');
      sampleRow = sampleRows[0] || null;
    } catch {
      // ornek satir opsiyonel; sayisal zorunlulara 0 yazilir
    }

    const KNOWN_COLUMNS = new Set(['sdp_depo_kod', 'sdp_depo_no', 'sdp_min_stok', 'sdp_max_stok']);
    const DATE_TYPES = new Set(['date', 'datetime', 'smalldatetime', 'datetime2', 'datetimeoffset', 'time']);
    const STRING_TYPES = new Set(['char', 'varchar', 'nchar', 'nvarchar', 'text', 'ntext']);
    const NUMERIC_TYPES = new Set(['bit', 'tinyint', 'smallint', 'int', 'bigint', 'decimal', 'numeric', 'float', 'real', 'money', 'smallmoney']);
    const BINARY_TYPES = new Set(['binary', 'varbinary', 'image']);
    const NON_INSERTABLE_TYPES = new Set(['timestamp', 'rowversion']);

    // INSERT kolon listesi: bilinen 4 kolon + zorunlu (NOT NULL, default'suz) diger kolonlar.
    const insertColumns = columns.filter((column) => {
      if (column.isComputed || column.isIdentity || NON_INSERTABLE_TYPES.has(column.dataType)) return false;
      if (KNOWN_COLUMNS.has(column.name.toLowerCase())) return true;
      return !column.isNullable && !column.hasDefault;
    });
    const insertNames = new Set(insertColumns.map((column) => column.name.toLowerCase()));
    const missingKnown = Array.from(KNOWN_COLUMNS).filter((name) => !insertNames.has(name));
    if (missingKnown.length > 0) {
      items.forEach((item) => {
        failed.push({ productCode: item.productCode, reason: `Beklenen kolon(lar) tabloda yok: ${missingKnown.join(', ')}` });
      });
      return { inserted, failed };
    }

    const sampleNumericLiteral = (columnName: string): string => {
      if (!sampleRow) return '0';
      const value = sampleRow[columnName];
      if (typeof value === 'boolean') return value ? '1' : '0';
      const parsed = Number(value);
      return Number.isFinite(parsed) ? String(parsed) : '0';
    };

    const valueExprFor = (column: { name: string; dataType: string }, index: number): string => {
      const lower = column.name.toLowerCase();
      if (lower === 'sdp_depo_kod') return `@icode${index}`;
      if (lower === 'sdp_depo_no') return String(warehouseNo);
      if (lower === 'sdp_min_stok') return `@imin${index}`;
      if (lower === 'sdp_max_stok') return `@imax${index}`;
      if (column.dataType === 'uniqueidentifier') return 'NEWID()';
      if (DATE_TYPES.has(column.dataType)) return 'GETDATE()';
      if (NUMERIC_TYPES.has(column.dataType)) return sampleNumericLiteral(column.name);
      if (BINARY_TYPES.has(column.dataType)) return '0x';
      if (STRING_TYPES.has(column.dataType)) return "''";
      return "''"; // bilinmeyen tip icin en genel guvenli deger
    };

    const columnList = insertColumns.map((column) => `[${column.name.replace(/[\[\]]/g, '')}]`).join(', ');

    for (let offset = 0; offset < items.length; offset += APPLY_CHUNK_SIZE) {
      const chunk = items.slice(offset, offset + APPLY_CHUNK_SIZE);
      try {
        const request = mikroService.pool!.request();
        (request as any).timeout = Number(process.env.UCARER_MINMAX_TIMEOUT_MS || 300000);

        // XACT_ABORT + acik transaction: chunk ya hep ya hic yazilir. Ortadaki bir INSERT
        // patlarsa tum chunk geri alinir ve catch tum chunk'i 'failed' raporlar (kismi
        // commit + yanlis rapor olmaz). @ins tablo degiskeni rollback'ten etkilenmez ama
        // hata durumunda final SELECT'e zaten ulasilmaz.
        const statements: string[] = [
          'SET NOCOUNT ON;',
          'SET XACT_ABORT ON;',
          'DECLARE @ins TABLE (code nvarchar(40));',
          'BEGIN TRAN;',
        ];
        chunk.forEach((item, index) => {
          request.input(`icode${index}`, sql.NVarChar(40), item.productCode);
          request.input(`imin${index}`, sql.Float, item.newMin);
          request.input(`imax${index}`, sql.Float, item.newMax);
          const valueList = insertColumns.map((column) => valueExprFor(column, index)).join(', ');
          statements.push(`
            IF NOT EXISTS (
              SELECT 1 FROM STOK_DEPO_DETAYLARI
              WHERE LTRIM(RTRIM(sdp_depo_kod)) = @icode${index} AND sdp_depo_no = ${warehouseNo}
            )
            BEGIN
              INSERT INTO STOK_DEPO_DETAYLARI (${columnList}) VALUES (${valueList});
              INSERT INTO @ins (code) VALUES (@icode${index});
            END
          `);
        });
        statements.push('COMMIT TRAN;');
        statements.push('SELECT code FROM @ins;');

        const result = await request.query(statements.join('\n'));
        const resultRows = Array.isArray(result.recordset) ? result.recordset : [];
        const insertedCodes = new Set<string>();
        resultRows.forEach((row: any) => {
          const code = normalizeCode(row?.code);
          if (code) insertedCodes.add(code);
        });
        chunk.forEach((item) => {
          if (insertedCodes.has(item.productCode)) {
            inserted.push(item.productCode);
          } else {
            failed.push({ productCode: item.productCode, reason: 'Kayit bu arada olusmus, INSERT atlandi (apply tekrar denenebilir)' });
          }
        });
      } catch (error: any) {
        const message = String(error?.message || 'bilinmeyen hata').slice(0, 200);
        chunk.forEach((item) => {
          failed.push({ productCode: item.productCode, reason: `INSERT basarisiz: ${message}` });
        });
      }
    }

    return { inserted, failed };
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
