import path from 'path';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import mikroService from './mikroFactory.service';
import pricingService from './pricing.service';
import imageService from './image.service';
import familyCandidateService from './family-candidate.service';
import reportsService from './reports.service';
import { getUploadsDir } from '../utils/storage';

type LookupType = 'supplier' | 'brand' | 'category' | 'package' | 'template';
type FactorDirection = 'larger' | 'smaller';

type UnitInput = {
  index?: number;
  name?: string | null;
  factor?: number | string | null;
  factorDirection?: FactorDirection | null;
  weightKg?: number | string | null;
  widthCm?: number | string | null;
  lengthCm?: number | string | null;
  heightCm?: number | string | null;
};

export type StockCreateInput = {
  rowNo?: number;
  templateCode?: string | null;
  // Pasif stok aktiflestirmede aktiflestirilecek mevcut stok kodu (create akisinda kullanilmaz).
  stockCode?: string | null;
  name?: string | null;
  foreignName?: string | null;
  shortName?: string | null;
  vatRatePercent?: number | string | null;
  supplierCode?: string | null;
  brandCode?: string | null;
  brandName?: string | null;
  categoryCode?: string | null;
  packageCode?: string | null;
  packageName?: string | null;
  shelfCode?: string | null;
  currentCost?: number | string | null;
  costP?: number | string | null;
  costT?: number | string | null;
  mainUnit?: string | null;
  mainUnitWeightKg?: number | string | null;
  mainUnitWidthCm?: number | string | null;
  mainUnitLengthCm?: number | string | null;
  mainUnitHeightCm?: number | string | null;
  extraUnits?: UnitInput[] | null;
  margins?: Array<number | string | null> | null;
  barcode?: string | null;
  notes?: string | null;
  // Min-Max: true => Mikro min-max hesaplasin (sto_model_kodu = ''),
  // false => haric tut (sto_model_kodu = 'HAYIR'). Varsayilan true.
  calculateMinMax?: boolean | null;
};

type NormalizedUnit = {
  index: number;
  name: string;
  factor: number;
  factorDirection: FactorDirection;
  mikroFactor: number;
  weightKg: number;
  widthMm: number;
  lengthMm: number;
  heightMm: number;
};

type NormalizedStockInput = {
  rowNo: number;
  templateCode: string;
  name: string;
  foreignName: string;
  shortName: string;
  vatRatePercent: number;
  vatCode: number;
  supplierCode: string;
  brandCode: string;
  brandName: string;
  categoryCode: string;
  packageCode: string;
  packageName: string;
  shelfCode: string;
  currentCost: number;
  costP: number;
  costT: number;
  mainUnit: string;
  mainUnitWeightKg: number;
  mainUnitWidthMm: number;
  mainUnitLengthMm: number;
  mainUnitHeightMm: number;
  extraUnits: NormalizedUnit[];
  margins: string[];
  barcode: string;
  notes: string;
  calculateMinMax: boolean;
};

type ValidationRef = {
  code: string;
  name: string;
  isLeaf?: boolean;
};

type ValidationResult = {
  rowNo: number;
  previewCode: string;
  status: 'valid' | 'warning' | 'error';
  errors: string[];
  warnings: string[];
  item: NormalizedStockInput;
  refs: {
    supplier?: ValidationRef | null;
    brand?: ValidationRef | null;
    category?: ValidationRef | null;
    package?: ValidationRef | null;
    shelf?: ValidationRef | null;
    template?: ValidationRef | null;
  };
};

const DEFAULT_TEMPLATE_CODE = 'B108423';
const MAX_ITEMS = 200;
const UNIT_INDEXES = [2, 3, 4] as const;

// 10.4: Marj carpani makul araligi. Carpan = maliyet x carpan = satis fiyati.
// 1'in altinda zararina satis (uyari), MARGIN_MAX ustu neredeyse kesin hata (ret).
const MARGIN_LOSS_THRESHOLD = 1;
const MARGIN_MAX = 20;

const escapeSql = (value: unknown) => String(value ?? '').replace(/'/g, "''");
const normalizeText = (value: unknown) => String(value ?? '').trim();
const upperText = (value: unknown) => normalizeText(value).toLocaleUpperCase('tr-TR');

const toNumber = (value: unknown, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = Number(String(value).replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : fallback;
};

const toSqlNumber = (value: unknown) => {
  const numeric = toNumber(value, 0);
  if (!Number.isFinite(numeric)) return '0';
  return String(numeric).replace(',', '.');
};

const toSqlString = (value: unknown) => `N'${escapeSql(value)}'`;

const toDateOnly = (date = new Date()) => {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
};

const cmToMm = (value: unknown) => Math.round(toNumber(value, 0) * 10 * 1000) / 1000;
const mmToCmText = (value: unknown) => {
  const numeric = toNumber(value, 0);
  if (!numeric) return '';
  return String(Math.round((numeric / 10) * 1000) / 1000).replace('.', ',');
};
const decimalText = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '';
  return String(value).trim().replace('.', ',');
};
const roundMoney = (value: number) => Math.round(value * 10000) / 10000;

const deriveUiCostsFromMikro = (
  mikroCostPValue: unknown,
  mikroCostTValue: unknown,
  standardCostValue: unknown,
  vatRatePercentValue: unknown
) => {
  const mikroCostP = toNumber(mikroCostPValue, 0);
  const mikroCostT = toNumber(mikroCostTValue, 0);
  const standardCost = toNumber(standardCostValue, 0);
  const vatRatePercent = toNumber(vatRatePercentValue, 20);
  const hasBothCosts = mikroCostP > 0 && mikroCostT > 0;
  const usesUcarerConvention = !hasBothCosts || vatRatePercent <= 0 || mikroCostT >= mikroCostP;
  const costT = usesUcarerConvention ? mikroCostP || standardCost : mikroCostT || standardCost;
  const costP = (usesUcarerConvention ? mikroCostT : mikroCostP) || (costT > 0 ? roundMoney(costT * (1 + vatRatePercent / 200)) : 0);
  return { currentCost: costT, costT, costP };
};

const vatRateToCode = (percent: number) => {
  const normalized = Math.round(percent * 100) / 100;
  if (normalized === 20 || normalized === 18) return 5;
  if (normalized === 10) return 7;
  if (normalized === 1) return 2;
  if (normalized === 0) return 0;
  return 5;
};

const buildInClause = (values: string[]) => {
  const unique = [...new Set(values.map(normalizeText).filter(Boolean))];
  if (!unique.length) return "N'__none__'";
  return unique.map((value) => toSqlString(value)).join(',');
};

type StockPriceListRow = {
  listNo: number;
  value: number;
  marginMultiplier: number;
  baseCost: number;
};

class StockCreateService {
  private stockColumnsCache: string[] | null = null;

  private async getStockInsertColumns() {
    if (this.stockColumnsCache) return this.stockColumnsCache;

    const rows = await mikroService.executeQuery(`
      SELECT c.name
      FROM sys.columns c
      INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
      WHERE c.object_id = OBJECT_ID(N'dbo.STOKLAR')
        AND c.is_identity = 0
        AND c.is_computed = 0
        AND t.name NOT IN ('timestamp', 'rowversion')
      ORDER BY c.column_id
    `);

    this.stockColumnsCache = rows.map((row: any) => normalizeText(row.name)).filter(Boolean);
    return this.stockColumnsCache;
  }

  private normalizeItem(input: StockCreateInput, rowNo: number): NormalizedStockInput {
    const margins = Array.isArray(input.margins) ? input.margins : [];
    const normalizedMargins = [0, 1, 2, 3, 4].map((index) => {
      const value = margins[index];
      const numeric = toNumber(value, NaN);
      if (!Number.isFinite(numeric)) return normalizeText(value);
      return String(value ?? '').trim().replace('.', ',') || String(numeric).replace('.', ',');
    });

    const extraUnits = (Array.isArray(input.extraUnits) ? input.extraUnits : [])
      .map((unit, offset) => {
        const index = Number(unit.index || UNIT_INDEXES[offset] || offset + 2);
        const name = upperText(unit.name);
        const factor = Math.abs(toNumber(unit.factor, 0));
        const factorDirection: FactorDirection = unit.factorDirection === 'smaller' ? 'smaller' : 'larger';
        const mikroFactor = factorDirection === 'smaller' ? factor : -factor;
        return {
          index,
          name,
          factor,
          factorDirection,
          mikroFactor,
          weightKg: toNumber(unit.weightKg, 0),
          widthMm: cmToMm(unit.widthCm),
          lengthMm: cmToMm(unit.lengthCm),
          heightMm: cmToMm(unit.heightCm),
        };
      })
      .filter((unit) => unit.name || unit.factor > 0);

    const vatRatePercent = toNumber(input.vatRatePercent, 20);
    const legacyCost = toNumber(input.currentCost, 0);
    const explicitCostT = toNumber(input.costT, NaN);
    const explicitCostP = toNumber(input.costP, NaN);
    const costT = Number.isFinite(explicitCostT) ? explicitCostT : legacyCost;
    const calculatedCostP = costT > 0 ? roundMoney(costT * (1 + vatRatePercent / 200)) : 0;
    const costP = Number.isFinite(explicitCostP)
      ? explicitCostP
      : calculatedCostP > 0
        ? calculatedCostP
        : legacyCost;

    return {
      rowNo,
      templateCode: upperText(input.templateCode) || DEFAULT_TEMPLATE_CODE,
      name: normalizeText(input.name),
      foreignName: normalizeText(input.foreignName),
      shortName: normalizeText(input.shortName),
      vatRatePercent,
      vatCode: vatRateToCode(vatRatePercent),
      supplierCode: normalizeText(input.supplierCode),
      brandCode: upperText(input.brandCode),
      brandName: normalizeText(input.brandName),
      categoryCode: normalizeText(input.categoryCode),
      packageCode: normalizeText(input.packageCode),
      packageName: normalizeText(input.packageName),
      shelfCode: upperText(input.shelfCode),
      currentCost: costT,
      costP,
      costT,
      mainUnit: upperText(input.mainUnit),
      mainUnitWeightKg: toNumber(input.mainUnitWeightKg, 0),
      mainUnitWidthMm: cmToMm(input.mainUnitWidthCm),
      mainUnitLengthMm: cmToMm(input.mainUnitLengthCm),
      mainUnitHeightMm: cmToMm(input.mainUnitHeightCm),
      extraUnits,
      margins: normalizedMargins,
      barcode: normalizeText(input.barcode),
      notes: normalizeText(input.notes),
      // Min-Max varsayilani ACIK; yalnizca acikca false gelirse haric tutulur.
      calculateMinMax: input.calculateMinMax === false ? false : true,
    };
  }

  private validateShape(item: NormalizedStockInput) {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!item.name) errors.push('Stok adi zorunlu');
    if (item.name.length > 127) errors.push('Stok adi Mikro limitini asiyor (127 karakter)');
    if (item.foreignName.length > 127) errors.push('Tedarikci urun kodu / yabanci isim 127 karakterden uzun olamaz');
    if (!item.mainUnit) errors.push('Ana birim zorunlu');
    if (item.mainUnit.length > 10) errors.push('Ana birim 10 karakterden uzun olamaz');
    if (![0, 1, 10, 18, 20].includes(item.vatRatePercent)) warnings.push('KDV orani standart oranlardan farkli gorunuyor');
    if (!item.supplierCode) errors.push('Ana saglayici zorunlu');
    if (!item.brandCode) errors.push('Marka zorunlu');
    if (item.brandName.length > 50) errors.push('Marka adi 50 karakterden uzun olamaz');
    if (!item.categoryCode) errors.push('Kategori zorunlu');
    if (item.categoryCode && item.categoryCode.split('.').length !== 3) {
      errors.push('Kategori sadece 3 kademeli en alt kategori kodu olmali (orn. 1.09.04)');
    }
    if (item.packageName.length > 50) errors.push('Ambalaj adi 50 karakterden uzun olamaz');
    if (item.costT < 0) errors.push('Maliyet T negatif olamaz');
    if (item.costP < 0) errors.push('Maliyet P negatif olamaz');
    if ([item.mainUnitWeightKg, item.mainUnitWidthMm, item.mainUnitLengthMm, item.mainUnitHeightMm].some((value) => value < 0)) {
      errors.push('Ana birimde negatif olcu/kg olamaz');
    }
    const mainDimensionCount = [item.mainUnitWidthMm, item.mainUnitLengthMm, item.mainUnitHeightMm].filter((value) => value > 0).length;
    if (mainDimensionCount > 0 && mainDimensionCount < 3) {
      errors.push('Ana birim icin en, boy ve yukseklik birlikte girilmeli');
    }

    item.margins.forEach((margin, index) => {
      const numeric = toNumber(margin, NaN);
      if (!margin || !Number.isFinite(numeric) || numeric <= 0) {
        errors.push(`Marj ${index + 1} zorunlu ve 0'dan buyuk olmali`);
        return;
      }
      // 10.4: Carpan makul araligin disindaysa uyar/reddet; Mikro fiyat listesine yanlis carpan gitmesin.
      if (numeric > MARGIN_MAX) {
        errors.push(`Marj ${index + 1} carpani cok yuksek (${numeric}); makul ust sinir ${MARGIN_MAX}. Hatali girilmis olabilir.`);
      } else if (numeric < MARGIN_LOSS_THRESHOLD) {
        warnings.push(`Marj ${index + 1} carpani 1'in altinda (${numeric}); bu carpan zararina satis fiyati uretir.`);
      }
    });

    item.extraUnits.forEach((unit) => {
      if (!UNIT_INDEXES.includes(unit.index as any)) {
        errors.push(`${unit.index}. birim sirasi gecersiz`);
      }
      if (!unit.name) errors.push(`${unit.index}. ek birim adi zorunlu`);
      if (unit.name.length > 10) errors.push(`${unit.index}. ek birim adi 10 karakterden uzun olamaz`);
      if (!unit.factor || unit.factor <= 0) errors.push(`${unit.index}. ek birim katsayisi zorunlu`);
      if ([unit.weightKg, unit.widthMm, unit.lengthMm, unit.heightMm].some((value) => value < 0)) {
        errors.push(`${unit.index}. ek birimde negatif olcu/kg olamaz`);
      }
      const dimensionCount = [unit.widthMm, unit.lengthMm, unit.heightMm].filter((value) => value > 0).length;
      if (dimensionCount > 0 && dimensionCount < 3) {
        errors.push(`${unit.index}. ek birim icin en, boy ve yukseklik birlikte girilmeli`);
      }
    });

    if (item.barcode && item.barcode.length > 50) errors.push('Barkod 50 karakterden uzun olamaz');

    return { errors, warnings };
  }

  async getNextStockCode(offset = 1) {
    const rows = await mikroService.executeQuery(`
      SELECT MAX(TRY_CONVERT(int, SUBSTRING(sto_kod, 2, 20))) AS maxBNo
      FROM STOKLAR WITH (NOLOCK)
      WHERE sto_kod LIKE N'B%' AND TRY_CONVERT(int, SUBSTRING(sto_kod, 2, 20)) IS NOT NULL
    `);
    const maxNo = Number(rows[0]?.maxBNo) || 0;
    return `B${maxNo + offset}`;
  }

  async getMetadata() {
    const [nextCode, unitRows, recentCreations] = await Promise.all([
      this.getNextStockCode(),
      mikroService.executeQuery(`
        SELECT DISTINCT unitName
        FROM (
          SELECT NULLIF(LTRIM(RTRIM(sto_birim1_ad)), '') as unitName FROM STOKLAR WITH (NOLOCK)
          UNION
          SELECT NULLIF(LTRIM(RTRIM(sto_birim2_ad)), '') as unitName FROM STOKLAR WITH (NOLOCK)
          UNION
          SELECT NULLIF(LTRIM(RTRIM(sto_birim3_ad)), '') as unitName FROM STOKLAR WITH (NOLOCK)
          UNION
          SELECT NULLIF(LTRIM(RTRIM(sto_birim4_ad)), '') as unitName FROM STOKLAR WITH (NOLOCK)
        ) units
        WHERE unitName IS NOT NULL
        ORDER BY unitName
      `),
      prisma.stockCreationLog.findMany({
        where: { status: 'CREATED' },
        orderBy: { createdAt: 'desc' },
        take: 15,
      }),
    ]);

    return {
      nextCode,
      defaultTemplateCode: DEFAULT_TEMPLATE_CODE,
      vatOptions: [
        { label: '%20', value: 20, mikroCode: 5 },
        { label: '%10', value: 10, mikroCode: 7 },
        { label: '%1', value: 1, mikroCode: 2 },
        { label: '%0', value: 0, mikroCode: 0 },
      ],
      unitNames: unitRows.map((row: any) => normalizeText(row.unitName)).filter(Boolean),
      recentCreations,
    };
  }

  async searchLookups(type: LookupType, search = '', limit = 30) {
    const safe = escapeSql(search);
    const safeLimit = Math.min(Math.max(Math.trunc(Number(limit)) || 30, 1), 100);
    const condition = search
      ? (code: string, name: string) => `AND (${code} LIKE N'%${safe}%' OR ${name} LIKE N'%${safe}%')`
      : () => '';

    if (type === 'supplier') {
      const rows = await mikroService.executeQuery(`
        SELECT TOP ${safeLimit}
          cari_kod AS code,
          cari_unvan1 AS name
        FROM CARI_HESAPLAR WITH (NOLOCK)
        WHERE ISNULL(cari_iptal, 0) = 0
          AND cari_kod LIKE N'320.%'
          ${condition('cari_kod', 'cari_unvan1')}
        ORDER BY cari_unvan1
      `);
      return rows.map((row: any) => ({ code: normalizeText(row.code), name: normalizeText(row.name) }));
    }

    if (type === 'brand') {
      const rows = await mikroService.executeQuery(`
        SELECT TOP ${safeLimit}
          mrk_kod AS code,
          mrk_ismi AS name
        FROM STOK_MARKALARI WITH (NOLOCK)
        WHERE ISNULL(mrk_iptal, 0) = 0
          ${condition('mrk_kod', 'mrk_ismi')}
        ORDER BY mrk_kod
      `);
      return rows.map((row: any) => ({ code: normalizeText(row.code), name: normalizeText(row.name) }));
    }

    if (type === 'category') {
      const rows = await mikroService.executeQuery(`
        SELECT TOP ${safeLimit}
          ktg_kod AS code,
          ktg_isim AS name
        FROM STOK_KATEGORILERI parent WITH (NOLOCK)
        WHERE ISNULL(parent.ktg_iptal, 0) = 0
          AND (LEN(parent.ktg_kod) - LEN(REPLACE(parent.ktg_kod, N'.', N''))) = 2
          AND NOT EXISTS (
            SELECT 1
            FROM STOK_KATEGORILERI child WITH (NOLOCK)
            WHERE ISNULL(child.ktg_iptal, 0) = 0
              AND child.ktg_kod LIKE parent.ktg_kod + N'.%'
          )
          ${condition('parent.ktg_kod', 'parent.ktg_isim')}
        ORDER BY parent.ktg_kod
      `);
      return rows.map((row: any) => ({ code: normalizeText(row.code), name: normalizeText(row.name) }));
    }

    if (type === 'package') {
      const rows = await mikroService.executeQuery(`
        SELECT TOP ${safeLimit}
          amb_kod AS code,
          amb_ismi AS name
        FROM STOK_AMBALAJLARI WITH (NOLOCK)
        WHERE ISNULL(amb_iptal, 0) = 0
          ${condition('amb_kod', 'amb_ismi')}
        ORDER BY amb_kod
      `);
      return rows.map((row: any) => ({ code: normalizeText(row.code), name: normalizeText(row.name) }));
    }

    const rows = await mikroService.executeQuery(`
      SELECT TOP ${safeLimit}
        sto_kod AS code,
        sto_isim AS name
      FROM STOKLAR WITH (NOLOCK)
      WHERE ISNULL(sto_pasif_fl, 0) = 0
        AND (sto_kod LIKE N'%${safe}%' OR sto_isim LIKE N'%${safe}%')
      ORDER BY
        CASE WHEN sto_kod = N'${safe}' THEN 0 WHEN sto_kod LIKE N'${safe}%' THEN 1 ELSE 2 END,
        sto_kod
    `);
    return rows.map((row: any) => ({ code: normalizeText(row.code), name: normalizeText(row.name) }));
  }

  async getTemplate(templateCode: string) {
    const code = upperText(templateCode);
    if (!code) {
      throw new Error('Sablon stok kodu gerekli');
    }

    const rows = await mikroService.executeQuery(`
      SELECT TOP 1
        s.sto_kod AS templateCode,
        s.sto_isim AS name,
        s.sto_yabanci_isim AS foreignName,
        s.sto_kisa_ismi AS shortName,
        s.sto_model_kodu AS modelKodu,
        CASE
          WHEN s.sto_toptan_vergi = 5 THEN 20
          WHEN s.sto_toptan_vergi = 7 THEN 10
          WHEN s.sto_toptan_vergi = 2 THEN 1
          WHEN s.sto_toptan_vergi = 0 THEN 0
          ELSE 20
        END AS vatRatePercent,
        s.sto_sat_cari_kod AS supplierCode,
        c.cari_unvan1 AS supplierName,
        s.sto_marka_kodu AS brandCode,
        m.mrk_ismi AS brandName,
        s.sto_kategori_kodu AS categoryCode,
        k.ktg_isim AS categoryName,
        s.sto_ambalaj_kodu AS packageCode,
        a.amb_ismi AS packageName,
        s.sto_reyon_kodu AS shelfCode,
        r.ryn_ismi AS shelfName,
        s.sto_standartmaliyet AS currentCost,
        u.MaliyetP AS costP,
        u.MaliyetT AS costT,
        s.sto_birim1_ad AS mainUnit,
        s.sto_birim1_agirlik AS mainUnitWeightKg,
        s.sto_birim1_en AS mainUnitWidthMm,
        s.sto_birim1_boy AS mainUnitLengthMm,
        s.sto_birim1_yukseklik AS mainUnitHeightMm,
        s.sto_birim2_ad AS unit2Name,
        s.sto_birim2_katsayi AS unit2Factor,
        s.sto_birim2_agirlik AS unit2WeightKg,
        s.sto_birim2_en AS unit2WidthMm,
        s.sto_birim2_boy AS unit2LengthMm,
        s.sto_birim2_yukseklik AS unit2HeightMm,
        s.sto_birim3_ad AS unit3Name,
        s.sto_birim3_katsayi AS unit3Factor,
        s.sto_birim3_agirlik AS unit3WeightKg,
        s.sto_birim3_en AS unit3WidthMm,
        s.sto_birim3_boy AS unit3LengthMm,
        s.sto_birim3_yukseklik AS unit3HeightMm,
        s.sto_birim4_ad AS unit4Name,
        s.sto_birim4_katsayi AS unit4Factor,
        s.sto_birim4_agirlik AS unit4WeightKg,
        s.sto_birim4_en AS unit4WidthMm,
        s.sto_birim4_boy AS unit4LengthMm,
        s.sto_birim4_yukseklik AS unit4HeightMm,
        (
          SELECT TOP 1 b.bar_kodu
          FROM BARKOD_TANIMLARI b WITH (NOLOCK)
          WHERE b.bar_stokkodu = s.sto_kod
          ORDER BY b.bar_master DESC, b.bar_create_date DESC
        ) AS barcode,
        u.Marj_1 AS margin1,
        u.Marj_2 AS margin2,
        u.Marj_3 AS margin3,
        u.Marj_4 AS margin4,
        u.Marj_5 AS margin5
      FROM STOKLAR s WITH (NOLOCK)
      LEFT JOIN CARI_HESAPLAR c WITH (NOLOCK) ON c.cari_kod = s.sto_sat_cari_kod
      LEFT JOIN STOK_MARKALARI m WITH (NOLOCK) ON m.mrk_kod = s.sto_marka_kodu
      LEFT JOIN STOK_KATEGORILERI k WITH (NOLOCK) ON k.ktg_kod = s.sto_kategori_kodu
      LEFT JOIN STOK_AMBALAJLARI a WITH (NOLOCK) ON a.amb_kod = s.sto_ambalaj_kodu
      LEFT JOIN STOK_REYONLARI r WITH (NOLOCK) ON r.ryn_kod = s.sto_reyon_kodu
      LEFT JOIN STOKLAR_USER u WITH (NOLOCK) ON u.Record_uid = s.sto_Guid
      WHERE s.sto_kod = ${toSqlString(code)}
    `);

    const row = rows[0];
    if (!row) {
      throw new Error('Sablon stok Mikroda bulunamadi');
    }

    const extraUnits = [2, 3, 4]
      .map((index) => {
        const name = normalizeText(row[`unit${index}Name`]);
        const rawFactor = toNumber(row[`unit${index}Factor`], 0);
        if (!name && !rawFactor) return null;
        return {
          index,
          name,
          factor: rawFactor ? decimalText(Math.abs(rawFactor)) : '',
          factorDirection: rawFactor > 0 ? 'smaller' : 'larger',
          weightKg: decimalText(row[`unit${index}WeightKg`]),
          widthCm: mmToCmText(row[`unit${index}WidthMm`]),
          lengthCm: mmToCmText(row[`unit${index}LengthMm`]),
          heightCm: mmToCmText(row[`unit${index}HeightMm`]),
        };
      })
      .filter(Boolean);

    const costs = deriveUiCostsFromMikro(row.costP, row.costT, row.currentCost, row.vatRatePercent);

    return {
      templateCode: normalizeText(row.templateCode),
      // Mikro sto_model_kodu === 'HAYIR' => min-max haric; edit'te mevcut secim korunsun diye don.
      calculateMinMax: String(row.modelKodu ?? '').trim().toLocaleUpperCase('tr') !== 'HAYIR',
      name: normalizeText(row.name),
      foreignName: normalizeText(row.foreignName),
      shortName: normalizeText(row.shortName),
      vatRatePercent: decimalText(row.vatRatePercent) || '20',
      supplierCode: normalizeText(row.supplierCode),
      supplierName: normalizeText(row.supplierName),
      brandCode: normalizeText(row.brandCode),
      brandName: normalizeText(row.brandName),
      categoryCode: normalizeText(row.categoryCode),
      categoryName: normalizeText(row.categoryName),
      packageCode: normalizeText(row.packageCode),
      packageName: normalizeText(row.packageName),
      shelfCode: normalizeText(row.shelfCode),
      shelfName: normalizeText(row.shelfName),
      currentCost: decimalText(costs.currentCost),
      costP: decimalText(costs.costP),
      costT: decimalText(costs.costT),
      mainUnit: normalizeText(row.mainUnit),
      mainUnitWeightKg: decimalText(row.mainUnitWeightKg),
      mainUnitWidthCm: mmToCmText(row.mainUnitWidthMm),
      mainUnitLengthCm: mmToCmText(row.mainUnitLengthMm),
      mainUnitHeightCm: mmToCmText(row.mainUnitHeightMm),
      margins: [row.margin1, row.margin2, row.margin3, row.margin4, row.margin5].map(decimalText),
      barcode: normalizeText(row.barcode),
      extraUnits,
      refs: {
        supplier: row.supplierCode ? { code: normalizeText(row.supplierCode), name: normalizeText(row.supplierName) } : null,
        brand: row.brandCode ? { code: normalizeText(row.brandCode), name: normalizeText(row.brandName) } : null,
        category: row.categoryCode ? { code: normalizeText(row.categoryCode), name: normalizeText(row.categoryName) } : null,
        package: row.packageCode ? { code: normalizeText(row.packageCode), name: normalizeText(row.packageName) } : null,
        shelf: row.shelfCode ? { code: normalizeText(row.shelfCode), name: normalizeText(row.shelfName) } : null,
      },
    };
  }

  async getStock(stockCode: string) {
    const stock = await this.getTemplate(stockCode);
    return {
      ...stock,
      stockCode: stock.templateCode,
    };
  }

  private async loadValidationRefs(items: NormalizedStockInput[]) {
    const suppliers = items.map((item) => item.supplierCode);
    const brands = items.map((item) => item.brandCode);
    const categories = items.map((item) => item.categoryCode);
    const packages = items.map((item) => item.packageCode);
    const shelves = items.map((item) => item.shelfCode).filter(Boolean);
    const templates = items.map((item) => item.templateCode);
    const names = items.map((item) => item.name).filter(Boolean);
    const barcodes = items.map((item) => item.barcode).filter(Boolean);

    const [supplierRows, brandRows, categoryRows, packageRows, shelfRows, templateRows, duplicateRows, barcodeRows] = await Promise.all([
      mikroService.executeQuery(`
        SELECT cari_kod AS code, cari_unvan1 AS name
        FROM CARI_HESAPLAR WITH (NOLOCK)
        WHERE cari_kod IN (${buildInClause(suppliers)})
      `),
      mikroService.executeQuery(`
        SELECT mrk_kod AS code, mrk_ismi AS name
        FROM STOK_MARKALARI WITH (NOLOCK)
        WHERE mrk_kod IN (${buildInClause(brands)})
      `),
      mikroService.executeQuery(`
        SELECT
          parent.ktg_kod AS code,
          parent.ktg_isim AS name,
          CASE
            WHEN (LEN(parent.ktg_kod) - LEN(REPLACE(parent.ktg_kod, N'.', N''))) = 2
             AND NOT EXISTS (
              SELECT 1
              FROM STOK_KATEGORILERI child WITH (NOLOCK)
              WHERE ISNULL(child.ktg_iptal, 0) = 0
                AND child.ktg_kod LIKE parent.ktg_kod + N'.%'
             )
            THEN 1 ELSE 0
          END AS isLeaf
        FROM STOK_KATEGORILERI parent WITH (NOLOCK)
        WHERE ISNULL(parent.ktg_iptal, 0) = 0
          AND parent.ktg_kod IN (${buildInClause(categories)})
      `),
      mikroService.executeQuery(`
        SELECT amb_kod AS code, amb_ismi AS name
        FROM STOK_AMBALAJLARI WITH (NOLOCK)
        WHERE amb_kod IN (${buildInClause(packages)})
      `),
      shelves.length
        ? mikroService.executeQuery(`
          SELECT ryn_kod AS code, ryn_ismi AS name
          FROM STOK_REYONLARI WITH (NOLOCK)
          WHERE ryn_kod IN (${buildInClause(shelves)})
        `)
        : Promise.resolve([]),
      mikroService.executeQuery(`
        SELECT sto_kod AS code, sto_isim AS name
        FROM STOKLAR WITH (NOLOCK)
        WHERE sto_kod IN (${buildInClause(templates)})
      `),
      mikroService.executeQuery(`
        SELECT sto_kod AS code, sto_isim AS name
        FROM STOKLAR WITH (NOLOCK)
        WHERE sto_isim IN (${buildInClause(names)})
      `),
      barcodes.length
        ? mikroService.executeQuery(`
          SELECT bar_kodu AS code, bar_stokkodu AS name
          FROM BARKOD_TANIMLARI WITH (NOLOCK)
          WHERE bar_kodu IN (${buildInClause(barcodes)})
        `).catch(() => [])
        : Promise.resolve([]),
    ]);

    const toMap = (rows: any[]) =>
      new Map<string, ValidationRef>(
        rows.map((row) => [
          normalizeText(row.code),
          {
            code: normalizeText(row.code),
            name: normalizeText(row.name),
            isLeaf: row.isLeaf === undefined ? undefined : row.isLeaf === true || row.isLeaf === 1 || row.isLeaf === '1',
          },
        ])
      );

    return {
      suppliers: toMap(supplierRows),
      brands: toMap(brandRows),
      categories: toMap(categoryRows),
      packages: toMap(packageRows),
      shelves: toMap(shelfRows),
      templates: toMap(templateRows),
      duplicates: new Map<string, ValidationRef>(duplicateRows.map((row: any) => [normalizeText(row.name), { code: normalizeText(row.code), name: normalizeText(row.name) }])),
      barcodes: toMap(barcodeRows),
    };
  }

  async preview(itemsInput: StockCreateInput[]) {
    const allItems = Array.isArray(itemsInput) ? itemsInput : [];
    // 10.3: 200 ustu satir sessizce kesilmesin; ne kadarinin atlandigini hesapla.
    const requestedTotal = allItems.length;
    const rawItems = allItems.slice(0, MAX_ITEMS);
    const skippedCount = Math.max(requestedTotal - rawItems.length, 0);
    if (!rawItems.length) {
      throw new Error('En az bir stok satiri gerekli');
    }

    const items = rawItems.map((item, index) => this.normalizeItem(item, Number(item.rowNo || index + 1)));
    const refs = await this.loadValidationRefs(items);
    const firstCode = await this.getNextStockCode(1);
    const firstNo = Number(firstCode.slice(1)) || 0;

    const nameCounts = new Map<string, number>();
    items.forEach((item) => {
      if (!item.name) return;
      nameCounts.set(item.name, (nameCounts.get(item.name) || 0) + 1);
    });

    const results: ValidationResult[] = items.map((item, index) => {
      const { errors, warnings } = this.validateShape(item);
      const supplier = refs.suppliers.get(item.supplierCode) || null;
      const brand = refs.brands.get(item.brandCode) || null;
      const category = refs.categories.get(item.categoryCode) || null;
      const packageRef = refs.packages.get(item.packageCode) || null;
      const shelf = item.shelfCode ? refs.shelves.get(item.shelfCode) || null : null;
      const template = refs.templates.get(item.templateCode) || null;
      const duplicate = refs.duplicates.get(item.name);
      const barcodeDuplicate = item.barcode ? refs.barcodes.get(item.barcode) : null;

      if (item.supplierCode && !supplier) errors.push('Ana saglayici Mikroda bulunamadi');
      if (item.brandCode && !brand) {
        if (item.brandName) warnings.push(`Marka Mikroda yok, kayit sirasinda olusturulacak: ${item.brandCode} - ${item.brandName}`);
        else errors.push('Marka Mikroda bulunamadi; yeni marka icin marka adi girilmeli');
      }
      if (item.categoryCode && !category) errors.push('Kategori Mikroda bulunamadi');
      if (category && !category.isLeaf) errors.push('Kategori en alt 3 kademeli kategori olmali');
      if (item.packageCode && !packageRef) {
        if (item.packageName) warnings.push(`Ambalaj Mikroda yok, kayit sirasinda olusturulacak: ${item.packageCode} - ${item.packageName}`);
        else errors.push('Ambalaj Mikroda bulunamadi; yeni ambalaj icin ambalaj adi girilmeli');
      }
      if (item.shelfCode && !shelf) errors.push('Raf/Reyon kodu Mikroda bulunamadi');
      if (!template) errors.push('Sablon stok Mikroda bulunamadi');
      if (duplicate) warnings.push(`Ayni isimde mevcut stok var: ${duplicate.code}`);
      if (barcodeDuplicate) errors.push(`Barkod baska stokta kayitli: ${barcodeDuplicate.name}`);
      if ((nameCounts.get(item.name) || 0) > 1) warnings.push('Yuklenen satirlar icinde ayni stok adi birden fazla var');

      const status = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'valid';
      return {
        rowNo: item.rowNo,
        previewCode: `B${firstNo + index}`,
        status,
        errors,
        warnings,
        item,
        refs: {
          supplier,
          brand,
          category,
          package: packageRef,
          shelf,
          template,
        },
      };
    });

    return {
      results,
      summary: {
        total: results.length,
        valid: results.filter((row) => row.status === 'valid').length,
        warning: results.filter((row) => row.status === 'warning').length,
        error: results.filter((row) => row.status === 'error').length,
        // 10.3: Limit asildiysa kac satir geldi, kac islendi, kac atlandi acikca dondurulur.
        requestedTotal,
        maxItems: MAX_ITEMS,
        skippedCount,
        truncated: skippedCount > 0,
        truncationMessage:
          skippedCount > 0
            ? `${requestedTotal} satirdan ilk ${rawItems.length} islendi, ${skippedCount} satir tek seferde islenemez (limit ${MAX_ITEMS}). Kalan satirlari ayri parti olarak yukleyin.`
            : null,
      },
    };
  }

  private buildStockColumnExpression(column: string, item: NormalizedStockInput, itemIndex: number) {
    const lower = column.toLowerCase();
    const extraByIndex = new Map(item.extraUnits.map((unit) => [unit.index, unit]));
    const hasCost = item.costP > 0 || item.costT > 0;
    const costDate = hasCost ? toDateOnly() : '';

    const direct: Record<string, string> = {
      sto_guid: `@guid${itemIndex}`,
      sto_kod: `@code${itemIndex}`,
      sto_isim: toSqlString(item.name),
      sto_yabanci_isim: toSqlString(item.foreignName),
      sto_kisa_ismi: toSqlString(item.shortName),
      sto_toptan_vergi: String(item.vatCode),
      sto_perakende_vergi: String(item.vatCode),
      sto_sat_cari_kod: toSqlString(item.supplierCode),
      sto_marka_kodu: toSqlString(item.brandCode),
      sto_kategori_kodu: toSqlString(item.categoryCode),
      sto_ambalaj_kodu: toSqlString(item.packageCode),
      sto_birim1_ad: toSqlString(item.mainUnit),
      sto_birim1_katsayi: '1',
      sto_birim1_agirlik: toSqlNumber(item.mainUnitWeightKg),
      sto_birim1_en: toSqlNumber(item.mainUnitWidthMm),
      sto_birim1_boy: toSqlNumber(item.mainUnitLengthMm),
      sto_birim1_yukseklik: toSqlNumber(item.mainUnitHeightMm),
      sto_standartmaliyet: toSqlNumber(item.costT),
      sto_reyon_kodu: toSqlString(item.shelfCode),
      sto_min_stok: '0',
      sto_siparis_stok: '0',
      sto_max_stok: '0',
      sto_webe_gonderilecek_fl: '0',
      sto_min_stok_belirleme_gun: '0',
      sto_sip_stok_belirleme_gun: '0',
      sto_max_stok_belirleme_gun: '0',
      sto_pasif_fl: '0',
      sto_degisti: '1',
      sto_checksum: '0',
      sto_create_user: '1',
      sto_lastup_user: '1',
      sto_create_date: 'GETDATE()',
      sto_lastup_date: 'GETDATE()',
      sto_resim_url: toSqlString(costDate),
      // Min-Max: sablondan (SELECT ile klonlanan) deger sizmasin diye ACIKCA set ediyoruz.
      // 'HAYIR' => min-max hesaplama disi; '' => hesaplansin (minmax.service excluded = modelKodu === 'HAYIR').
      sto_model_kodu: toSqlString(item.calculateMinMax ? '' : 'HAYIR'),
    };

    if (direct[lower] !== undefined) return direct[lower];

    const unitMatch = lower.match(/^sto_birim([2-4])_(ad|katsayi|agirlik|en|boy|yukseklik)$/);
    if (unitMatch) {
      const unitIndex = Number(unitMatch[1]);
      const field = unitMatch[2];
      const unit = extraByIndex.get(unitIndex);
      if (!unit) {
        return field === 'ad' ? "N''" : '0';
      }
      if (field === 'ad') return toSqlString(unit.name);
      if (field === 'katsayi') return toSqlNumber(unit.mikroFactor);
      if (field === 'agirlik') return toSqlNumber(unit.weightKg);
      if (field === 'en') return toSqlNumber(unit.widthMm);
      if (field === 'boy') return toSqlNumber(unit.lengthMm);
      if (field === 'yukseklik') return toSqlNumber(unit.heightMm);
    }

    return `s.[${column.replace(/]/g, ']]')}]`;
  }

  private buildReferenceCreateStatements(item: NormalizedStockInput) {
    const statements: string[] = [];

    if (item.brandCode && item.brandName) {
      statements.push(`
        IF NOT EXISTS (SELECT 1 FROM STOK_MARKALARI WITH (UPDLOCK, HOLDLOCK) WHERE mrk_kod = ${toSqlString(item.brandCode)})
        BEGIN
          INSERT INTO STOK_MARKALARI
            (mrk_Guid, mrk_DBCno, mrk_SpecRECno, mrk_iptal, mrk_fileid, mrk_hidden, mrk_kilitli, mrk_degisti, mrk_checksum,
             mrk_create_user, mrk_create_date, mrk_lastup_user, mrk_lastup_date, mrk_special1, mrk_special2, mrk_special3, mrk_kod, mrk_ismi)
          VALUES
            (NEWID(), 0, 0, 0, 19, 0, 0, 1, 0,
             1, GETDATE(), 1, GETDATE(), N'', N'', N'', ${toSqlString(item.brandCode)}, ${toSqlString(item.brandName)});
        END
      `);
    }

    if (item.packageCode && item.packageName) {
      statements.push(`
        IF NOT EXISTS (SELECT 1 FROM STOK_AMBALAJLARI WITH (UPDLOCK, HOLDLOCK) WHERE amb_kod = ${toSqlString(item.packageCode)})
        BEGIN
          INSERT INTO STOK_AMBALAJLARI
            (amb_Guid, amb_DBCno, amb_SpecRECno, amb_iptal, amb_fileid, amb_hidden, amb_kilitli, amb_degisti, amb_checksum,
             amb_create_user, amb_create_date, amb_lastup_user, amb_lastup_date, amb_special1, amb_special2, amb_special3,
             amb_kod, amb_ismi, amb_miktar, amb_dara, amb_fiyat)
          VALUES
            (NEWID(), 0, 0, 0, 20, 0, 0, 1, 0,
             1, GETDATE(), 1, GETDATE(), N'', N'', N'',
             ${toSqlString(item.packageCode)}, ${toSqlString(item.packageName)}, 1, 0, 0);
        END
      `);
    }

    return statements.join('\n');
  }

  private buildPriceListRows(item: NormalizedStockInput): StockPriceListRow[] {
    if (!Number.isFinite(item.costP) || !Number.isFinite(item.costT) || (item.costP <= 0 && item.costT <= 0)) return [];

    const rows: StockPriceListRow[] = [];
    item.margins.forEach((margin, index) => {
      const marginMultiplier = toNumber(margin, 0);
      if (!Number.isFinite(marginMultiplier) || marginMultiplier <= 0) return;
      if (item.costP > 0) {
        const value = roundMoney(item.costP * marginMultiplier);
        rows.push({ listNo: index + 1, value, marginMultiplier, baseCost: item.costP });
      }
      if (item.costT > 0) {
        const value = roundMoney(item.costT * marginMultiplier);
        rows.push({ listNo: index + 6, value, marginMultiplier, baseCost: item.costT });
      }
    });
    return rows;
  }

  private buildMikroPriceListStatements(stockCodeSql: string, item: NormalizedStockInput) {
    const priceRows = this.buildPriceListRows(item);
    if (!priceRows.length) return '';

    return priceRows
      .map(({ listNo, value }) => `
        UPDATE STOK_SATIS_FIYAT_LISTELERI
        SET sfiyat_fiyati = ${toSqlNumber(value)},
            sfiyat_degisti = 1,
            sfiyat_lastup_user = 1,
            sfiyat_lastup_date = GETDATE()
        WHERE sfiyat_stokkod = ${stockCodeSql}
          AND sfiyat_listesirano = ${listNo};

        IF @@ROWCOUNT = 0
        BEGIN
          INSERT INTO STOK_SATIS_FIYAT_LISTELERI
            (sfiyat_Guid, sfiyat_DBCno, sfiyat_SpecRECno, sfiyat_iptal, sfiyat_fileid, sfiyat_hidden, sfiyat_kilitli, sfiyat_degisti, sfiyat_checksum,
             sfiyat_create_user, sfiyat_create_date, sfiyat_lastup_user, sfiyat_lastup_date, sfiyat_special1, sfiyat_special2, sfiyat_special3,
             sfiyat_stokkod, sfiyat_listesirano, sfiyat_deposirano, sfiyat_odemeplan, sfiyat_birim_pntr, sfiyat_fiyati, sfiyat_doviz,
             sfiyat_iskontokod, sfiyat_deg_nedeni, sfiyat_primyuzdesi, sfiyat_kampanyakod, sfiyat_doviz_kuru)
          VALUES
            (NEWID(), 0, 0, 0, 0, 0, 0, 1, 0,
             1, GETDATE(), 1, GETDATE(), N'', N'', N'',
             ${stockCodeSql}, ${listNo}, 0, 0, 0, ${toSqlNumber(value)}, 0,
             N'', 0, 0, N'', 0);
        END
      `)
      .join('\n');
  }

  private async syncProductPriceStats(stockCode: string, item: NormalizedStockInput) {
    const priceRows = this.buildPriceListRows(item);
    if (!priceRows.length) return;

    const data: Record<string, any> = {
      productName: item.name,
      lastChangeDate: new Date(),
      currentCost: item.costT,
    };

    for (let listNo = 1; listNo <= 10; listNo += 1) {
      const row = priceRows.find((entry) => entry.listNo === listNo);
      const price = row?.value || null;
      data[`currentPriceList${listNo}`] = price;
      data[`currentMarginList${listNo}`] =
        price && price > 0 && row?.baseCost
          ? Math.round(((price - row.baseCost) / price) * 100 * 10000) / 10000
          : null;
    }

    await prisma.productPriceStat.upsert({
      where: { productCode: stockCode },
      create: {
        productCode: stockCode,
        productName: item.name,
        lastChangeDate: data.lastChangeDate,
        totalChanges: 0,
        currentCost: item.costT,
        currentPriceList1: data.currentPriceList1,
        currentPriceList2: data.currentPriceList2,
        currentPriceList3: data.currentPriceList3,
        currentPriceList4: data.currentPriceList4,
        currentPriceList5: data.currentPriceList5,
        currentPriceList6: data.currentPriceList6,
        currentPriceList7: data.currentPriceList7,
        currentPriceList8: data.currentPriceList8,
        currentPriceList9: data.currentPriceList9,
        currentPriceList10: data.currentPriceList10,
        currentMarginList1: data.currentMarginList1,
        currentMarginList2: data.currentMarginList2,
        currentMarginList3: data.currentMarginList3,
        currentMarginList4: data.currentMarginList4,
        currentMarginList5: data.currentMarginList5,
        currentMarginList6: data.currentMarginList6,
        currentMarginList7: data.currentMarginList7,
        currentMarginList8: data.currentMarginList8,
        currentMarginList9: data.currentMarginList9,
        currentMarginList10: data.currentMarginList10,
      },
      update: data,
    });
  }

  private async syncCreatedProduct(item: NormalizedStockInput, stockCode: string) {
    const categoryRows = await mikroService.executeQuery(`
      SELECT TOP 1 ktg_kod AS code, ktg_isim AS name
      FROM STOK_KATEGORILERI WITH (NOLOCK)
      WHERE ktg_kod = ${toSqlString(item.categoryCode)}
    `);
    const categoryName = normalizeText(categoryRows[0]?.name) || item.categoryCode;

    const category = await prisma.category.upsert({
      where: { mikroCode: item.categoryCode },
      update: { name: categoryName, active: true },
      create: { mikroCode: item.categoryCode, name: categoryName, active: true },
    });

    const unit2 = item.extraUnits.find((unit) => unit.index === 2);
    const product = await prisma.product.upsert({
      where: { mikroCode: stockCode },
      update: {
        name: item.name,
        foreignName: item.foreignName || null,
        brandCode: item.brandCode || null,
        unit: item.mainUnit,
        unit2: unit2?.name || null,
        unit2Factor: unit2?.mikroFactor || null,
        categoryId: category.id,
        currentCost: item.costT || null,
        currentCostDate: item.costP > 0 || item.costT > 0 ? new Date() : null,
        vatRate: item.vatRatePercent / 100,
        active: true,
      },
      create: {
        mikroCode: stockCode,
        name: item.name,
        foreignName: item.foreignName || null,
        brandCode: item.brandCode || null,
        unit: item.mainUnit,
        unit2: unit2?.name || null,
        unit2Factor: unit2?.mikroFactor || null,
        categoryId: category.id,
        currentCost: item.costT || null,
        currentCostDate: item.costP > 0 || item.costT > 0 ? new Date() : null,
        vatRate: item.vatRatePercent / 100,
        warehouseStocks: {},
        salesHistory: {},
        pendingCustomerOrdersByWarehouse: {},
        warehouseExcessStocks: {},
        prices: {},
        active: true,
      },
    });

    if (item.costT > 0) {
      const prices = await pricingService.calculateAllPricesForProduct({
        productId: product.id,
        cost: item.costT,
        vatRate: item.vatRatePercent / 100,
      });
      await prisma.product.update({
        where: { id: product.id },
        data: {
          calculatedCost: item.costT,
          prices: prices as any,
        },
      });
    }

    await this.syncProductPriceStats(stockCode, item);

    return product;
  }

  async create(itemsInput: StockCreateInput[], userId?: string | null) {
    // 10.3: Limit asildiysa sessizce ilk 200'u yazip "hepsi olustu" demeyelim.
    // Kullaniciya net hata don; partiyi bolup tekrar gondersin (sessiz kayip yok).
    const requestedTotal = Array.isArray(itemsInput) ? itemsInput.length : 0;
    // Toplu/Excel akisi kaldirildi: yalnizca TEK stok karti acilir.
    if (requestedTotal > 1) {
      throw new Error(
        `Stok acma yalnizca tek kart destekler; ${requestedTotal} satir gonderildi. Her stok karti ayri ayri acilmalidir.`
      );
    }
    if (requestedTotal > MAX_ITEMS) {
      throw new Error(
        `Tek seferde en fazla ${MAX_ITEMS} stok karti acilabilir. ${requestedTotal} satir gonderildi; sessiz kayip olmamasi icin satirlari ${MAX_ITEMS}'lik partilere bolup tekrar yazin.`
      );
    }

    const preview = await this.preview(itemsInput);
    const invalidRows = preview.results.filter((row) => row.errors.length > 0);
    if (invalidRows.length > 0) {
      throw new Error(`Hatali satirlar var: ${invalidRows.map((row) => row.rowNo).join(', ')}`);
    }

    const items = preview.results.map((row) => row.item);
    const columns = await this.getStockInsertColumns();
    if (!columns.includes('sto_kod') || !columns.includes('sto_Guid')) {
      throw new Error('Mikro STOKLAR kolonlari beklenen yapida degil');
    }

    const batchId = `stock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const declarations: string[] = [];
    const statements: string[] = [];
    const marginDate = toDateOnly();

    items.forEach((item, index) => {
      const columnList = columns.map((column) => `[${column.replace(/]/g, ']]')}]`).join(', ');
      const expressionList = columns.map((column) => this.buildStockColumnExpression(column, item, index)).join(', ');
      const templateCode = toSqlString(item.templateCode);

      declarations.push(`DECLARE @guid${index} uniqueidentifier = NEWID();`);
      declarations.push(`DECLARE @code${index} nvarchar(25) = N'B' + CONVERT(nvarchar(20), @baseNo + ${index + 1});`);

      statements.push(`
        IF EXISTS (SELECT 1 FROM STOKLAR WITH (UPDLOCK, HOLDLOCK) WHERE sto_kod = @code${index})
          THROW 51000, 'Olusacak stok kodu Mikroda zaten var', 1;

        ${this.buildReferenceCreateStatements(item)}

        INSERT INTO STOKLAR (${columnList})
        OUTPUT ${item.rowNo}, inserted.sto_kod, inserted.sto_Guid INTO @created(rowNo, stockCode, stockGuid)
        SELECT ${expressionList}
        FROM STOKLAR s WITH (NOLOCK)
        WHERE s.sto_kod = ${templateCode};

        IF @@ROWCOUNT = 0
          THROW 51001, 'Sablon stok bulunamadi', 1;

        IF EXISTS (SELECT 1 FROM STOKLAR_USER WHERE Record_uid = @guid${index})
        BEGIN
          UPDATE STOKLAR_USER
          SET Marj_1 = ${toSqlString(item.margins[0])},
              Marj_2 = ${toSqlString(item.margins[1])},
              Marj_3 = ${toSqlString(item.margins[2])},
              Marj_4 = ${toSqlString(item.margins[3])},
              Marj_5 = ${toSqlString(item.margins[4])},
              MaliyetP = ${toSqlNumber(item.costT)},
              MaliyetT = ${toSqlNumber(item.costP)},
              MaliyetTarihi = ${toSqlString(item.costP > 0 || item.costT > 0 ? marginDate : '')},
              FiyatDegisimTarihi = ${toSqlString(item.costP > 0 || item.costT > 0 ? marginDate : '')}
          WHERE Record_uid = @guid${index};
        END
        ELSE
        BEGIN
          INSERT INTO STOKLAR_USER
            (Record_uid, Maliyet_Tar, GUNCEL_MALIYET_TARIHI, TOPCA_MIN, TOPCA_MAX, Marj_1, Marj_2, Marj_3, Marj_4, Marj_5, MaliyetP, MaliyetT, MaliyetTarihi, FiyatDegisimTarihi, Yatan_Stok, Birim_1_Desi, SKT)
          VALUES
            (@guid${index}, NULL, 0, 0, 0, ${toSqlString(item.margins[0])}, ${toSqlString(item.margins[1])}, ${toSqlString(item.margins[2])}, ${toSqlString(item.margins[3])}, ${toSqlString(item.margins[4])}, ${toSqlNumber(item.costT)}, ${toSqlNumber(item.costP)}, ${toSqlString(item.costP > 0 || item.costT > 0 ? marginDate : '')}, ${toSqlString(item.costP > 0 || item.costT > 0 ? marginDate : '')}, N'', 0, N'');
        END

        ${this.buildMikroPriceListStatements(`@code${index}`, item)}

        ${item.barcode ? `
        IF EXISTS (SELECT 1 FROM BARKOD_TANIMLARI WITH (UPDLOCK, HOLDLOCK) WHERE bar_kodu = ${toSqlString(item.barcode)})
          THROW 51003, 'Barkod Mikroda zaten kayitli', 1;

        INSERT INTO BARKOD_TANIMLARI
          (bar_Guid, bar_DBCno, bar_SpecRECno, bar_iptal, bar_fileid, bar_hidden, bar_kilitli, bar_degisti, bar_checksum,
           bar_create_user, bar_create_date, bar_lastup_user, bar_lastup_date, bar_special1, bar_special2, bar_special3,
           bar_kodu, bar_stokkodu, bar_partikodu, bar_lotno, bar_serino_veya_bagkodu, bar_barkodtipi, bar_icerigi,
           bar_birimpntr, bar_master, bar_bedenpntr, bar_renkpntr, bar_baglantitipi, bar_har_uid, bar_asortitanimkodu)
        VALUES
          (NEWID(), 0, 0, 0, 15, 0, 0, 1, 0,
           1, GETDATE(), 1, GETDATE(), N'', N'', N'',
           ${toSqlString(item.barcode)}, @code${index}, N'', 0, N'', 0, 0,
           1, 1, 0, 0, 0, '00000000-0000-0000-0000-000000000000', N'');
        ` : ''}
      `);
    });

    const sql = `
      SET XACT_ABORT ON;
      BEGIN TRY
        BEGIN TRANSACTION;
        DECLARE @created TABLE(rowNo int, stockCode nvarchar(25), stockGuid uniqueidentifier);
        DECLARE @baseNo int;

        SELECT @baseNo = ISNULL(MAX(TRY_CONVERT(int, SUBSTRING(sto_kod, 2, 20))), 0)
        FROM STOKLAR WITH (UPDLOCK, HOLDLOCK)
        WHERE sto_kod LIKE N'B%' AND TRY_CONVERT(int, SUBSTRING(sto_kod, 2, 20)) IS NOT NULL;

        ${declarations.join('\n')}
        ${statements.join('\n')}

        COMMIT TRANSACTION;
        SELECT rowNo, stockCode, CONVERT(nvarchar(50), stockGuid) AS stockGuid FROM @created ORDER BY rowNo;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        DECLARE @message nvarchar(4000) = ERROR_MESSAGE();
        THROW 51002, @message, 1;
      END CATCH
    `;

    const createdRows = await mikroService.executeQuery(sql);
    const user = userId
      ? await prisma.user.findUnique({ where: { id: userId }, select: { name: true, displayName: true, mikroName: true, email: true } })
      : null;
    const userName = user?.displayName || user?.mikroName || user?.name || user?.email || null;

    const byRowNo = new Map<number, any>(createdRows.map((row: any) => [Number(row.rowNo), row]));
    const logs: Prisma.StockCreationLogCreateManyInput[] = [];
    const synced: any[] = [];

    for (const validation of preview.results) {
      const created = byRowNo.get(validation.rowNo);
      const stockCode = normalizeText(created?.stockCode);
      if (stockCode) {
        const product = await this.syncCreatedProduct(validation.item, stockCode);
        synced.push(product);
      }
      logs.push({
        batchId,
        mode: items.length > 1 ? 'BULK' : 'SINGLE',
        status: stockCode ? 'CREATED' : 'FAILED',
        rowNo: validation.rowNo,
        stockCode: stockCode || null,
        stockName: validation.item.name,
        templateCode: validation.item.templateCode,
        payload: validation.item as any,
        validation: {
          errors: validation.errors,
          warnings: validation.warnings,
          refs: validation.refs,
        } as any,
        result: created ? { stockGuid: created.stockGuid } as any : Prisma.JsonNull,
        errorMessage: stockCode ? null : 'Mikro kaydi donmedi',
        createdById: userId || null,
        createdByName: userName,
      });
    }

    await prisma.stockCreationLog.createMany({ data: logs });

    return {
      batchId,
      created: createdRows.map((row: any) => ({
        rowNo: Number(row.rowNo),
        stockCode: normalizeText(row.stockCode),
        stockGuid: normalizeText(row.stockGuid),
      })),
      syncedCount: synced.length,
    };
  }

  /**
   * Tek stok karti + zorunlu gorsel + opsiyonel aile atamalari.
   * Akis:
   *  1) Mikro STOKLAR INSERT (mevcut create yolu; sto_model_kodu dahil) + Product upsert (syncCreatedProduct).
   *  2) Gorsel pipeline (Mikro mye_ImageData + Product.imageUrl). Stok olustuktan SONRA
   *     gorsel adiminda hata olursa TUM istek basarisiz sayilmaz; uyari ile devam edilir.
   *  3) Aile atamalari (stok aileleri + tek fiyat ailesi). Postgres-only, non-fatal.
   */
  async createSingleWithImage(params: {
    item: StockCreateInput;
    imageFile: Express.Multer.File;
    stockFamilyIds?: string[] | null;
    priceFamilyId?: string | null;
    userId?: string | null;
  }): Promise<{ success: boolean; stockCode?: string; productId?: string; warnings: string[]; error?: string }> {
    const { item, imageFile, userId } = params;
    const stockFamilyIds = Array.isArray(params.stockFamilyIds) ? params.stockFamilyIds : [];
    const priceFamilyId = params.priceFamilyId ? String(params.priceFamilyId).trim() : null;
    const warnings: string[] = [];

    if (!imageFile) {
      throw new Error('Gorsel zorunlu - gorsel yuklemeden stok acilamaz');
    }

    // 1) Mikro STOKLAR INSERT + Product upsert (mevcut, degistirilmemis create yolu).
    const createResult = await this.create([item], userId);
    const createdRow = createResult.created?.[0];
    const stockCode = normalizeText(createdRow?.stockCode);
    if (!stockCode) {
      // Mikro kaydi donmediyse ne gorsel ne aile atanabilir.
      throw new Error('Stok Mikroya yazilamadi (stok kodu donmedi)');
    }

    // create() icinde syncCreatedProduct zaten Product'i upsert etti; id'sini al.
    const product = await prisma.product.findUnique({
      where: { mikroCode: stockCode },
      select: { id: true, name: true },
    });
    const productId = product?.id;
    const productName = product?.name || normalizeText(item.name) || stockCode;

    // 2) Gorsel pipeline - stok OLUSTUKTAN sonra; hata olursa istek basarisiz olmaz.
    let processedFilePath: string | null = null;
    try {
      const tempPath = (imageFile as any).path || path.join(getUploadsDir(), imageFile.filename);
      const processed = await imageService.processUploadedProductImage(tempPath, stockCode);
      processedFilePath = processed.filePath;

      const guidRows = await mikroService.getProductGuidsByCodes([stockCode]);
      const productGuid = guidRows.find((row) => row.code === stockCode)?.guid || guidRows[0]?.guid;
      if (!productGuid) {
        throw new Error('Mikro GUID bulunamadi');
      }

      await imageService.uploadImageToMikro(productGuid, processed.buffer);

      if (productId) {
        await prisma.product.update({
          where: { id: productId },
          data: {
            imageUrl: processed.imageUrl,
            imageChecksum: processed.checksum,
            imageSyncStatus: 'SUCCESS',
            imageSyncErrorType: null,
            imageSyncErrorMessage: null,
            imageSyncUpdatedAt: new Date(),
          },
        });
      }
    } catch (imageError: any) {
      // Stok zaten olustu; gorseli sonra Urunler ekranindan ekletebiliriz.
      if (processedFilePath) {
        await imageService.removeLocalFile(processedFilePath).catch(() => {});
      }
      console.error('Stock create image pipeline failed:', imageError?.message || imageError);
      warnings.push('Stok olusturuldu ancak gorsel yuklenemedi - Urunler ekranindan ekleyin');
    }

    // 3) Stok aileleri (cok secimli, non-fatal). 409 "zaten ailede" sessizce yutulur.
    for (const rawId of stockFamilyIds) {
      const familyId = String(rawId || '').trim();
      if (!familyId) continue;
      try {
        await familyCandidateService.addProductToFamily(familyId, { productCode: stockCode, productName });
      } catch (familyError: any) {
        const status = familyError?.statusCode || familyError?.status;
        if (status === 409) continue; // zaten ailede - sorun degil
        console.error('Stock create stock-family assign failed:', familyId, familyError?.message || familyError);
        warnings.push(`Stok ailesine eklenemedi (${familyId}): ${familyError?.message || 'bilinmeyen hata'}`);
      }
    }

    // 3b) Tek fiyat ailesi (opsiyonel, non-fatal). reportsService'te incremental add yok;
    // mevcut ailenin productCodes'una yeni kodu ekleyip upsertPriceFamily ile geri yaziyoruz.
    if (priceFamilyId) {
      try {
        const families = await reportsService.getPriceFamilies();
        const target = families.find((family) => family.id === priceFamilyId);
        if (!target) {
          warnings.push('Fiyat ailesi bulunamadi; fiyat ailesi atanmadi');
        } else {
          const existingCodes = target.items.map((entry) => String(entry.productCode || '').trim().toUpperCase());
          const nextCodes = Array.from(new Set([...existingCodes, stockCode.toUpperCase()])).filter(Boolean);
          // upsertPriceFamily imzasinda userId yok; ailenin kendi ad/kod/not/aktif degerlerini koruyup
          // yalnizca yeni stok kodunu productCodes'a ekliyoruz (bir urun tek fiyat ailesinde kurali servis icinde).
          await reportsService.upsertPriceFamily({
            id: target.id,
            name: target.name,
            code: target.code,
            note: target.note,
            active: target.active,
            productCodes: nextCodes,
          });
        }
      } catch (priceFamilyError: any) {
        console.error('Stock create price-family assign failed:', priceFamilyId, priceFamilyError?.message || priceFamilyError);
        warnings.push(`Fiyat ailesine eklenemedi: ${priceFamilyError?.message || 'bilinmeyen hata'}`);
      }
    }

    return { success: true, stockCode, productId, warnings };
  }

  async updateStock(
    stockCode: string,
    input: StockCreateInput,
    userId?: string | null,
    opts?: { activate?: boolean }
  ) {
    const activate = opts?.activate === true;
    const code = upperText(stockCode);
    if (!code) {
      throw new Error('Stok kodu gerekli');
    }

    const existingRows = await mikroService.executeQuery(`
      SELECT TOP 1
        sto_kod AS code,
        CONVERT(nvarchar(50), sto_Guid) AS guid,
        ISNULL(sto_standartmaliyet, 0) AS currentCost
      FROM STOKLAR WITH (UPDLOCK, HOLDLOCK)
      WHERE sto_kod = ${toSqlString(code)}
    `);
    const existing = existingRows[0];
    if (!existing) {
      throw new Error('Guncellenecek stok Mikroda bulunamadi');
    }

    const item = this.normalizeItem({ ...input, templateCode: input?.templateCode || code }, 1);
    const refs = await this.loadValidationRefs([item]);
    const { errors, warnings } = this.validateShape(item);
    const supplier = refs.suppliers.get(item.supplierCode) || null;
    const brand = refs.brands.get(item.brandCode) || null;
    const category = refs.categories.get(item.categoryCode) || null;
    const packageRef = refs.packages.get(item.packageCode) || null;
    const shelf = item.shelfCode ? refs.shelves.get(item.shelfCode) || null : null;
    const duplicate = refs.duplicates.get(item.name) || null;
    const barcodeDuplicate = item.barcode ? refs.barcodes.get(item.barcode) || null : null;

    if (item.supplierCode && !supplier) errors.push('Ana saglayici Mikroda bulunamadi');
    if (item.brandCode && !brand) {
      if (item.brandName) warnings.push(`Marka Mikroda yok, guncelleme sirasinda olusturulacak: ${item.brandCode} - ${item.brandName}`);
      else errors.push('Marka Mikroda bulunamadi; yeni marka icin marka adi girilmeli');
    }
    if (item.categoryCode && !category) errors.push('Kategori Mikroda bulunamadi');
    if (category && !category.isLeaf) errors.push('Kategori en alt 3 kademeli kategori olmali');
    if (item.packageCode && !packageRef) {
      if (item.packageName) warnings.push(`Ambalaj Mikroda yok, guncelleme sirasinda olusturulacak: ${item.packageCode} - ${item.packageName}`);
      else errors.push('Ambalaj Mikroda bulunamadi; yeni ambalaj icin ambalaj adi girilmeli');
    }
    if (item.shelfCode && !shelf) errors.push('Raf/Reyon kodu Mikroda bulunamadi');
    if (duplicate && duplicate.code !== code) warnings.push(`Ayni isimde baska stok var: ${duplicate.code}`);
    if (barcodeDuplicate && barcodeDuplicate.name !== code) errors.push(`Barkod baska stokta kayitli: ${barcodeDuplicate.name}`);

    if (errors.length > 0) {
      throw new Error(`Stok guncellenemedi: ${errors.join('; ')}`);
    }

    const extraByIndex = new Map(item.extraUnits.map((unit) => [unit.index, unit]));
    const marginDate = toDateOnly();
    const currentCostSql = toSqlNumber(item.costT);
    const retailCostSql = toSqlNumber(item.costP);
    const hasCostSql = `(${currentCostSql} > 0 OR ${retailCostSql} > 0)`;
    const costChangedExpression = `ABS(ISNULL(sto_standartmaliyet, 0) - ${currentCostSql}) > 0.0001 AND ${hasCostSql}`;
    const stockAssignments = [
      `sto_isim = ${toSqlString(item.name)}`,
      `sto_yabanci_isim = ${toSqlString(item.foreignName)}`,
      `sto_kisa_ismi = ${toSqlString(item.shortName)}`,
      `sto_toptan_vergi = ${item.vatCode}`,
      `sto_perakende_vergi = ${item.vatCode}`,
      `sto_sat_cari_kod = ${toSqlString(item.supplierCode)}`,
      `sto_marka_kodu = ${toSqlString(item.brandCode)}`,
      `sto_kategori_kodu = ${toSqlString(item.categoryCode)}`,
      `sto_ambalaj_kodu = ${toSqlString(item.packageCode)}`,
      `sto_birim1_ad = ${toSqlString(item.mainUnit)}`,
      `sto_birim1_katsayi = 1`,
      `sto_birim1_agirlik = ${toSqlNumber(item.mainUnitWeightKg)}`,
      `sto_birim1_en = ${toSqlNumber(item.mainUnitWidthMm)}`,
      `sto_birim1_boy = ${toSqlNumber(item.mainUnitLengthMm)}`,
      `sto_birim1_yukseklik = ${toSqlNumber(item.mainUnitHeightMm)}`,
      `sto_standartmaliyet = ${currentCostSql}`,
      `sto_resim_url = CASE WHEN ${costChangedExpression} THEN ${toSqlString(marginDate)} ELSE sto_resim_url END`,
      `sto_reyon_kodu = ${toSqlString(item.shelfCode)}`,
      // Min-Max ac/kapa: 'HAYIR' => hesaplama disi, '' => hesaplansin (duzenleme + pasif-aktiflestirme bunu set edebilsin).
      `sto_model_kodu = ${toSqlString(item.calculateMinMax ? '' : 'HAYIR')}`,
    ];

    UNIT_INDEXES.forEach((unitIndex) => {
      const unit = extraByIndex.get(unitIndex);
      stockAssignments.push(`sto_birim${unitIndex}_ad = ${unit ? toSqlString(unit.name) : "N''"}`);
      stockAssignments.push(`sto_birim${unitIndex}_katsayi = ${unit ? toSqlNumber(unit.mikroFactor) : '0'}`);
      stockAssignments.push(`sto_birim${unitIndex}_agirlik = ${unit ? toSqlNumber(unit.weightKg) : '0'}`);
      stockAssignments.push(`sto_birim${unitIndex}_en = ${unit ? toSqlNumber(unit.widthMm) : '0'}`);
      stockAssignments.push(`sto_birim${unitIndex}_boy = ${unit ? toSqlNumber(unit.lengthMm) : '0'}`);
      stockAssignments.push(`sto_birim${unitIndex}_yukseklik = ${unit ? toSqlNumber(unit.heightMm) : '0'}`);
    });

    stockAssignments.push('sto_degisti = 1');
    stockAssignments.push('sto_lastup_user = 1');
    stockAssignments.push('sto_lastup_date = GETDATE()');

    // Pasif stok -> aktiflestirme: yalnizca activate=true iken pasif bayragini indir.
    // sto_degisti/sto_lastup_* zaten yukarida her guncellemede set ediliyor; burada
    // sadece pasif->aktif gecisini ekliyoruz.
    if (activate) {
      stockAssignments.push('sto_pasif_fl = 0');
    }

    const userCostChangedExpression = `(ABS(ISNULL(MaliyetP, 0) - ${currentCostSql}) > 0.0001 OR ABS(ISNULL(MaliyetT, 0) - ${retailCostSql}) > 0.0001) AND ${hasCostSql}`;
    const barcodeSql = item.barcode
      ? `
        IF EXISTS (SELECT 1 FROM BARKOD_TANIMLARI WITH (UPDLOCK, HOLDLOCK) WHERE bar_kodu = ${toSqlString(item.barcode)} AND bar_stokkodu <> @stockCode)
          THROW 51003, 'Barkod Mikroda baska stokta kayitli', 1;

        IF EXISTS (SELECT 1 FROM BARKOD_TANIMLARI WITH (UPDLOCK, HOLDLOCK) WHERE bar_stokkodu = @stockCode AND bar_birimpntr = 1 AND bar_master = 1)
        BEGIN
          UPDATE TOP (1) BARKOD_TANIMLARI
          SET bar_kodu = ${toSqlString(item.barcode)},
              bar_degisti = 1,
              bar_lastup_user = 1,
              bar_lastup_date = GETDATE()
          WHERE bar_stokkodu = @stockCode
            AND bar_birimpntr = 1
            AND bar_master = 1;
        END
        ELSE
        BEGIN
          INSERT INTO BARKOD_TANIMLARI
            (bar_Guid, bar_DBCno, bar_SpecRECno, bar_iptal, bar_fileid, bar_hidden, bar_kilitli, bar_degisti, bar_checksum,
             bar_create_user, bar_create_date, bar_lastup_user, bar_lastup_date, bar_special1, bar_special2, bar_special3,
             bar_kodu, bar_stokkodu, bar_partikodu, bar_lotno, bar_serino_veya_bagkodu, bar_barkodtipi, bar_icerigi,
             bar_birimpntr, bar_master, bar_bedenpntr, bar_renkpntr, bar_baglantitipi, bar_har_uid, bar_asortitanimkodu)
          VALUES
            (NEWID(), 0, 0, 0, 15, 0, 0, 1, 0,
             1, GETDATE(), 1, GETDATE(), N'', N'', N'',
             ${toSqlString(item.barcode)}, @stockCode, N'', 0, N'', 0, 0,
             1, 1, 0, 0, 0, '00000000-0000-0000-0000-000000000000', N'');
        END
      `
      : `
        DELETE FROM BARKOD_TANIMLARI
        WHERE bar_stokkodu = @stockCode
          AND bar_birimpntr = 1
          AND bar_master = 1;
      `;

    await mikroService.executeQuery(`
      SET XACT_ABORT ON;
      BEGIN TRY
        BEGIN TRANSACTION;
        DECLARE @stockCode nvarchar(25) = ${toSqlString(code)};
        DECLARE @stockGuid uniqueidentifier;

        SELECT @stockGuid = sto_Guid
        FROM STOKLAR WITH (UPDLOCK, HOLDLOCK)
        WHERE sto_kod = @stockCode;

        IF @stockGuid IS NULL
          THROW 51004, 'Guncellenecek stok bulunamadi', 1;

        ${this.buildReferenceCreateStatements(item)}

        UPDATE STOKLAR
        SET ${stockAssignments.join(',\n            ')}
        WHERE sto_kod = @stockCode;

        IF EXISTS (SELECT 1 FROM STOKLAR_USER WITH (UPDLOCK, HOLDLOCK) WHERE Record_uid = @stockGuid)
        BEGIN
          UPDATE STOKLAR_USER
          SET Marj_1 = ${toSqlString(item.margins[0])},
              Marj_2 = ${toSqlString(item.margins[1])},
              Marj_3 = ${toSqlString(item.margins[2])},
              Marj_4 = ${toSqlString(item.margins[3])},
              Marj_5 = ${toSqlString(item.margins[4])},
              MaliyetP = ${currentCostSql},
              MaliyetT = ${retailCostSql},
              MaliyetTarihi = CASE WHEN ${userCostChangedExpression} THEN ${toSqlString(marginDate)} ELSE MaliyetTarihi END,
              FiyatDegisimTarihi = CASE WHEN ${userCostChangedExpression} THEN ${toSqlString(marginDate)} ELSE FiyatDegisimTarihi END
          WHERE Record_uid = @stockGuid;
        END
        ELSE
        BEGIN
          INSERT INTO STOKLAR_USER
            (Record_uid, Maliyet_Tar, GUNCEL_MALIYET_TARIHI, TOPCA_MIN, TOPCA_MAX, Marj_1, Marj_2, Marj_3, Marj_4, Marj_5, MaliyetP, MaliyetT, MaliyetTarihi, FiyatDegisimTarihi, Yatan_Stok, Birim_1_Desi, SKT)
          VALUES
            (@stockGuid, NULL, 0, 0, 0, ${toSqlString(item.margins[0])}, ${toSqlString(item.margins[1])}, ${toSqlString(item.margins[2])}, ${toSqlString(item.margins[3])}, ${toSqlString(item.margins[4])}, ${currentCostSql}, ${retailCostSql}, ${toSqlString(item.costP > 0 || item.costT > 0 ? marginDate : '')}, ${toSqlString(item.costP > 0 || item.costT > 0 ? marginDate : '')}, N'', 0, N'');
        END

        ${this.buildMikroPriceListStatements('@stockCode', item)}

        ${barcodeSql}

        COMMIT TRANSACTION;
        SELECT @stockCode AS stockCode, CONVERT(nvarchar(50), @stockGuid) AS stockGuid;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        DECLARE @message nvarchar(4000) = ERROR_MESSAGE();
        THROW 51005, @message, 1;
      END CATCH
    `);

    const product = await this.syncCreatedProduct(item, code);
    const user = userId
      ? await prisma.user.findUnique({ where: { id: userId }, select: { name: true, displayName: true, mikroName: true, email: true } })
      : null;
    const userName = user?.displayName || user?.mikroName || user?.name || user?.email || null;

    await prisma.stockCreationLog.create({
      data: {
        batchId: `stock-edit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        mode: 'EDIT',
        status: 'UPDATED',
        rowNo: 1,
        stockCode: code,
        stockName: item.name,
        templateCode: item.templateCode,
        payload: item as any,
        validation: {
          errors,
          warnings,
          refs: { supplier, brand, category, package: packageRef, shelf },
        } as any,
        result: { stockGuid: normalizeText(existing.guid), syncedProductId: product.id } as any,
        errorMessage: null,
        createdById: userId || null,
        createdByName: userName,
      },
    });

    return {
      stockCode: code,
      warnings,
      stock: await this.getStock(code),
    };
  }

  /**
   * Pasif (arsivlenmis) stok kartlarini listeler. Salt-okunur.
   * Aktif arama filtresi (searchLookups 'template') sto_pasif_fl = 0 kullanir;
   * burada filtreyi ters ceviriyoruz: yalnizca ISNULL(sto_pasif_fl, 0) = 1 olanlar.
   */
  async listPassiveStocks(search = '', limit?: number) {
    const safe = escapeSql(search);
    const safeLimit = Math.min(Math.max(Math.trunc(Number(limit)) || 50, 1), 200);
    const term = normalizeText(search);
    const filter = term
      ? `AND (sto_kod LIKE N'%${safe}%' OR sto_isim LIKE N'%${safe}%')`
      : '';

    const rows = await mikroService.executeQuery(`
      SELECT TOP ${safeLimit}
        sto_kod AS code,
        sto_isim AS name,
        sto_kategori_kodu AS categoryCode,
        sto_sat_cari_kod AS supplierCode,
        sto_standartmaliyet AS currentCost,
        CONVERT(nvarchar(50), sto_Guid) AS guid
      FROM STOKLAR WITH (NOLOCK)
      WHERE ISNULL(sto_pasif_fl, 0) = 1
        ${filter}
      ORDER BY sto_isim
    `);

    const items = rows.map((row: any) => ({
      code: normalizeText(row.code),
      name: normalizeText(row.name),
      categoryCode: normalizeText(row.categoryCode),
      supplierCode: normalizeText(row.supplierCode),
      currentCost: toNumber(row.currentCost, 0),
      guid: normalizeText(row.guid),
    }));

    return { items };
  }

  /**
   * Pasif stok -> aktiflestirme. Feature 1 (createSingleWithImage) ile ayni
   * gorsel + aile mantigini kullanir; farki INSERT yerine pasif bayragini indirip
   * eksik alanlari doldurmasidir.
   *
   * Akis:
   *  1) Zorunlu alanlar (create ile ayni: isim/saglayici/kategori-leaf/ana birim/KDV/marj 1-5)
   *     normalizeItem + validateShape ile dogrulanir. Hata varsa aktiflestirme YAPILMAZ.
   *  2) updateStock({ activate: true }) tum STOKLAR alanlarini yazar VE sto_pasif_fl = 0 yapar.
   *     (updateStock transactional; syncCreatedProduct'i de kendisi cagirir.)
   *  3) Postgres Product satiri active:true ile hazir hale gelir (pasif stokta genelde yoktur;
   *     updateStock icindeki syncCreatedProduct bunu upsert eder).
   *  4) Gorsel pipeline (zorunlu dosya; aktiflestirmeden sonra hata non-fatal, uyari).
   *  5) Stok aileleri + tek fiyat ailesi (non-fatal) - createSingleWithImage ile ayni.
   */
  async activateStock(params: {
    item: StockCreateInput;
    imageFile: Express.Multer.File;
    stockFamilyIds?: string[] | null;
    priceFamilyId?: string | null;
    userId?: string | null;
  }): Promise<{ success: boolean; stockCode: string; warnings: string[] }> {
    const { item, imageFile, userId } = params;
    const stockFamilyIds = Array.isArray(params.stockFamilyIds) ? params.stockFamilyIds : [];
    const priceFamilyId = params.priceFamilyId ? String(params.priceFamilyId).trim() : null;
    const warnings: string[] = [];

    if (!imageFile) {
      throw new Error('Gorsel zorunlu - gorsel yuklemeden aktiflestirilemez');
    }

    // a) Aktiflestirilecek stok kodu.
    const stockCode = upperText(item?.stockCode || item?.templateCode);
    if (!stockCode) {
      throw new Error('Aktiflestirilecek stok kodu gerekli');
    }

    // Zorunlu alan dogrulamasi create ile ayni (updateStock zaten normalizeItem +
    // validateShape calistirip errors varsa throw eder). Burada da onden kontrol edip
    // net hata donduruyoruz ki eksik alanli stok yanlislikla aktiflestirilmesin.
    const normalized = this.normalizeItem({ ...item, templateCode: item?.templateCode || stockCode }, 1);
    const { errors } = this.validateShape(normalized);
    if (errors.length > 0) {
      throw new Error(`Stok aktiflestirilemedi: ${errors.join('; ')}`);
    }

    // b) Alanlari doldur + pasif bayragini indir (transactional; Product'i da upsert eder).
    const updateResult = await this.updateStock(stockCode, item, userId, { activate: true });
    updateResult.warnings?.forEach((warning) => warnings.push(warning));

    // c) Postgres Product satiri: updateStock icindeki syncCreatedProduct upsert etti (active:true).
    //    Gorsel guncellemesi icin id'ye ihtiyacimiz var.
    const product = await prisma.product.findUnique({
      where: { mikroCode: stockCode },
      select: { id: true, name: true },
    });
    const productId = product?.id;
    const productName = product?.name || normalizeText(item?.name) || stockCode;

    // d) Gorsel pipeline - stok AKTIF + Product upsert edildikten sonra; hata non-fatal.
    let processedFilePath: string | null = null;
    try {
      const tempPath = (imageFile as any).path || path.join(getUploadsDir(), imageFile.filename);
      const processed = await imageService.processUploadedProductImage(tempPath, stockCode);
      processedFilePath = processed.filePath;

      const guidRows = await mikroService.getProductGuidsByCodes([stockCode]);
      const productGuid = guidRows.find((row) => row.code === stockCode)?.guid || guidRows[0]?.guid;
      if (!productGuid) {
        throw new Error('Mikro GUID bulunamadi');
      }

      await imageService.uploadImageToMikro(productGuid, processed.buffer);

      if (productId) {
        await prisma.product.update({
          where: { id: productId },
          data: {
            imageUrl: processed.imageUrl,
            imageChecksum: processed.checksum,
            imageSyncStatus: 'SUCCESS',
            imageSyncErrorType: null,
            imageSyncErrorMessage: null,
            imageSyncUpdatedAt: new Date(),
          },
        });
      }
    } catch (imageError: any) {
      if (processedFilePath) {
        await imageService.removeLocalFile(processedFilePath).catch(() => {});
      }
      console.error('Stock activate image pipeline failed:', imageError?.message || imageError);
      warnings.push('Stok aktiflestirildi ancak gorsel yuklenemedi - Urunler ekranindan ekleyin');
    }

    // e) Stok aileleri (cok secimli, non-fatal). 409 "zaten ailede" sessizce yutulur.
    for (const rawId of stockFamilyIds) {
      const familyId = String(rawId || '').trim();
      if (!familyId) continue;
      try {
        await familyCandidateService.addProductToFamily(familyId, { productCode: stockCode, productName });
      } catch (familyError: any) {
        const status = familyError?.statusCode || familyError?.status;
        if (status === 409) continue; // zaten ailede - sorun degil
        console.error('Stock activate stock-family assign failed:', familyId, familyError?.message || familyError);
        warnings.push(`Stok ailesine eklenemedi (${familyId}): ${familyError?.message || 'bilinmeyen hata'}`);
      }
    }

    // e2) Tek fiyat ailesi (opsiyonel, non-fatal) - createSingleWithImage ile ayni.
    if (priceFamilyId) {
      try {
        const families = await reportsService.getPriceFamilies();
        const target = families.find((family) => family.id === priceFamilyId);
        if (!target) {
          warnings.push('Fiyat ailesi bulunamadi; fiyat ailesi atanmadi');
        } else {
          const existingCodes = target.items.map((entry) => String(entry.productCode || '').trim().toUpperCase());
          const nextCodes = Array.from(new Set([...existingCodes, stockCode.toUpperCase()])).filter(Boolean);
          await reportsService.upsertPriceFamily({
            id: target.id,
            name: target.name,
            code: target.code,
            note: target.note,
            active: target.active,
            productCodes: nextCodes,
          });
        }
      } catch (priceFamilyError: any) {
        console.error('Stock activate price-family assign failed:', priceFamilyId, priceFamilyError?.message || priceFamilyError);
        warnings.push(`Fiyat ailesine eklenemedi: ${priceFamilyError?.message || 'bilinmeyen hata'}`);
      }
    }

    return { success: true, stockCode, warnings };
  }

  async getHistory(limit = 50) {
    return prisma.stockCreationLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(Math.trunc(limit) || 50, 1), 200),
    });
  }
}

export default new StockCreateService();
