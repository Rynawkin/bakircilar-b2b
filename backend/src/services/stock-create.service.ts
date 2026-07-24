import path from 'path';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import mikroService from './mikroFactory.service';
import pricingService from './pricing.service';
import imageService from './image.service';
import familyCandidateService from './family-candidate.service';
import reportsService from './reports.service';
import { getUploadsDir } from '../utils/storage';
import { STANDARD_PRICE_LIST_DEFINITIONS } from '../config/price-list-registry';
import { randomUUID } from 'crypto';

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

const isUncertainMikroWriteError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return (
    code === 'ECONNCLOSED' ||
    code === 'ESOCKET' ||
    code === 'ETIMEDOUT' ||
    code === 'ETIMEOUT' ||
    message.includes('connection is closed') ||
    message.includes('connection lost')
  );
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

const buildStockPriceListRows = (
  item: Pick<NormalizedStockInput, 'costP' | 'costT' | 'margins'>
): StockPriceListRow[] => {
  if (
    !Number.isFinite(item.costP) ||
    !Number.isFinite(item.costT) ||
    (item.costP <= 0 && item.costT <= 0)
  ) {
    return [];
  }
  if (item.costP <= 0 || item.costT <= 0) {
    throw new Error(
      'Standart fiyat listeleri kismi olusturulamaz: Maliyet P ve Maliyet T birlikte gecerli olmali.'
    );
  }

  return STANDARD_PRICE_LIST_DEFINITIONS.flatMap((definition) => {
    const marginSlot = Number(definition.marginSlot);
    const marginMultiplier = toNumber(item.margins[marginSlot - 1], 0);
    if (!Number.isFinite(marginMultiplier) || marginMultiplier <= 0) {
      throw new Error(
        `Standart fiyat listeleri olusturulamadi: Marj_${marginSlot} eksik veya gecersiz.`
      );
    }

    // Stock-create UI adlari tarihsel olarak Mikro alanlarinin tersidir:
    // item.costP -> Mikro MaliyetT (perakende), item.costT -> Mikro MaliyetP (faturali).
    const baseCost = definition.costBasis === 'MALIYET_T' ? item.costP : item.costT;
    if (!Number.isFinite(baseCost) || baseCost <= 0) return [];

    return [{
      listNo: definition.listNo,
      value: roundMoney(baseCost * marginMultiplier),
      marginMultiplier,
      baseCost,
    }];
  });
};

export const stockCreatePriceListTestUtils = {
  buildStockPriceListRows,
};

class StockCreateService {
  private stockColumnsCache: string[] | null = null;

  private async assertPriceListUserColumns() {
    const requiredColumns = [
      'MaliyetP',
      'MaliyetT',
      'Marj_1',
      'Marj_2',
      'Marj_3',
      'Marj_4',
      'Marj_5',
      'Marj_6',
    ];
    const rows = await mikroService.executeQuery(`
      SELECT COLUMN_NAME AS columnName
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = N'dbo'
        AND TABLE_NAME = N'STOKLAR_USER'
        AND COLUMN_NAME IN (${requiredColumns.map((column) => `N'${column}'`).join(', ')})
    `);
    const availableColumns = new Set(
      (rows || [])
        .map((row: any) => normalizeText(row?.columnName ?? row?.COLUMN_NAME).toLowerCase())
        .filter(Boolean)
    );
    const missingColumns = requiredColumns.filter(
      (column) => !availableColumns.has(column.toLowerCase())
    );
    if (missingColumns.length > 0) {
      throw new Error(
        `Stok fiyat alanlari Mikroda hazir degil: STOKLAR_USER kolonlari eksik (${missingColumns.join(', ')}).`
      );
    }
  }

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
    const normalizedMargins = [0, 1, 2, 3, 4, 5].map((index) => {
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
      templateCode: upperText(input.templateCode),
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

    if (!item.templateCode) errors.push('Sablon stok zorunlu');
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

  private async getMaxBStockNo() {
    const rows = await mikroService.executeQuery(`
      SELECT MAX(TRY_CONVERT(int, SUBSTRING(sto_kod, 2, 20))) AS maxBNo
      FROM STOKLAR WITH (NOLOCK)
      WHERE sto_kod LIKE N'B%' AND TRY_CONVERT(int, SUBSTRING(sto_kod, 2, 20)) IS NOT NULL
    `);
    return Number(rows[0]?.maxBNo) || 0;
  }

  async getNextStockCode(offset = 1) {
    const maxNo = await this.getMaxBStockNo();
    return `B${maxNo + offset}`;
  }

  async getMetadata() {
    const [maxBNo, unitRows, recentCreations] = await Promise.all([
      this.getMaxBStockNo(),
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
      nextCode: `B${maxBNo + 1}`,
      defaultTemplateCode: maxBNo > 0 ? `B${maxBNo}` : '',
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

    const templateSearch = normalizeText(search);
    const templateTokens = templateSearch
      .replace(/\*/g, ' ')
      .split(/\s+/)
      .map((token) => escapeSql(token.trim()))
      .filter(Boolean);
    const templateCondition = templateTokens.length > 0
      ? `AND ${templateTokens
          .map((token) => `(sto_kod LIKE N'%${token}%' OR sto_isim LIKE N'%${token}%')`)
          .join(' AND ')}`
      : '';
    const exactTemplateSearch = escapeSql(templateSearch);
    const templateRelevanceOrder = exactTemplateSearch
      ? `
        CASE
          WHEN sto_kod = N'${exactTemplateSearch}' THEN 0
          WHEN sto_kod LIKE N'${exactTemplateSearch}%' THEN 1
          WHEN sto_isim LIKE N'${exactTemplateSearch}%' THEN 2
          ELSE 3
        END,`
      : '';

    const rows = await mikroService.executeQuery(`
      SELECT TOP ${safeLimit}
        sto_kod AS code,
        sto_isim AS name
      FROM STOKLAR WITH (NOLOCK)
      WHERE ISNULL(sto_pasif_fl, 0) = 0
        ${templateCondition}
      ORDER BY
        ${templateRelevanceOrder}
        CASE
          WHEN sto_kod LIKE N'B%' THEN TRY_CONVERT(int, SUBSTRING(sto_kod, 2, 20))
          ELSE NULL
        END DESC,
        sto_kod DESC
    `);
    return rows.map((row: any) => ({ code: normalizeText(row.code), name: normalizeText(row.name) }));
  }

  async getTemplate(templateCode: string, options: { consistent?: boolean } = {}) {
    const code = upperText(templateCode);
    if (!code) {
      throw new Error('Sablon stok kodu gerekli');
    }
    await this.assertPriceListUserColumns();
    const readHint = options.consistent ? '' : 'WITH (NOLOCK)';

    const rows = await mikroService.executeQuery(`
      SELECT TOP 1
        s.sto_kod AS templateCode,
        CONVERT(nvarchar(50), s.sto_Guid) AS stockGuid,
        ISNULL(s.sto_pasif_fl, 0) AS isPassive,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM mye_ImageData img ${readHint}
            WHERE img.Record_uid = s.sto_Guid
              AND img.TableID = 13
              AND DATALENGTH(img.Data) > 0
          )
          THEN 1 ELSE 0
        END AS hasMikroImage,
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
          FROM BARKOD_TANIMLARI b ${readHint}
          WHERE b.bar_stokkodu = s.sto_kod
            AND b.bar_birimpntr = 1
            AND b.bar_master = 1
          ORDER BY b.bar_master DESC, b.bar_create_date DESC
        ) AS barcode,
        u.Marj_1 AS margin1,
        u.Marj_2 AS margin2,
        u.Marj_3 AS margin3,
        u.Marj_4 AS margin4,
        u.Marj_5 AS margin5,
        u.Marj_6 AS margin6
      FROM STOKLAR s ${readHint}
      LEFT JOIN CARI_HESAPLAR c ${readHint} ON c.cari_kod = s.sto_sat_cari_kod
      LEFT JOIN STOK_MARKALARI m ${readHint} ON m.mrk_kod = s.sto_marka_kodu
      LEFT JOIN STOK_KATEGORILERI k ${readHint} ON k.ktg_kod = s.sto_kategori_kodu
      LEFT JOIN STOK_AMBALAJLARI a ${readHint} ON a.amb_kod = s.sto_ambalaj_kodu
      LEFT JOIN STOK_REYONLARI r ${readHint} ON r.ryn_kod = s.sto_reyon_kodu
      LEFT JOIN STOKLAR_USER u ${readHint} ON u.Record_uid = s.sto_Guid
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
      stockGuid: normalizeText(row.stockGuid),
      isPassive: row.isPassive === true || Number(row.isPassive) === 1,
      hasMikroImage: row.hasMikroImage === true || Number(row.hasMikroImage) === 1,
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
      standardCost: decimalText(row.currentCost),
      currentCost: decimalText(costs.currentCost),
      costP: decimalText(costs.costP),
      costT: decimalText(costs.costT),
      mainUnit: normalizeText(row.mainUnit),
      mainUnitWeightKg: decimalText(row.mainUnitWeightKg),
      mainUnitWidthCm: mmToCmText(row.mainUnitWidthMm),
      mainUnitLengthCm: mmToCmText(row.mainUnitLengthMm),
      mainUnitHeightCm: mmToCmText(row.mainUnitHeightMm),
      margins: [row.margin1, row.margin2, row.margin3, row.margin4, row.margin5, row.margin6].map(decimalText),
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

  async getStock(stockCode: string, options: { consistent?: boolean } = {}) {
    const stock = await this.getTemplate(stockCode, options);
    const code = upperText(stock.templateCode || stockCode);
    const [product, stockFamilyItems, priceFamilyItem] = await Promise.all([
      prisma.product.findUnique({
        where: { mikroCode: code },
        select: { imageUrl: true },
      }),
      prisma.productFamilyItem.findMany({
        where: {
          productCode: code,
          active: true,
          family: { active: true },
        },
        select: { familyId: true },
      }),
      prisma.priceFamilyItem.findFirst({
        where: {
          productCode: code,
          active: true,
          family: { active: true },
        },
        select: { familyId: true },
      }),
    ]);
    const imageUrl = normalizeText(product?.imageUrl) || null;
    return {
      ...stock,
      stockCode: code,
      imageUrl,
      hasExistingImage: Boolean(imageUrl || stock.hasMikroImage),
      stockFamilyIds: stockFamilyItems.map((item) => item.familyId),
      priceFamilyId: priceFamilyItem?.familyId || null,
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

  private async validateExistingItem(
    stockCode: string,
    input: StockCreateInput,
    actionLabel: 'guncelleme' | 'aktiflestirme'
  ) {
    const code = upperText(stockCode);
    const item = this.normalizeItem({ ...input, templateCode: code, stockCode: code }, 1);
    const refs = await this.loadValidationRefs([item]);
    const { errors, warnings } = this.validateShape(item);
    const supplier = refs.suppliers.get(item.supplierCode) || null;
    const brand = refs.brands.get(item.brandCode) || null;
    const category = refs.categories.get(item.categoryCode) || null;
    const packageRef = refs.packages.get(item.packageCode) || null;
    const shelf = item.shelfCode ? refs.shelves.get(item.shelfCode) || null : null;
    const template = refs.templates.get(code) || null;
    const duplicate = refs.duplicates.get(item.name) || null;
    const barcodeDuplicate = item.barcode ? refs.barcodes.get(item.barcode) || null : null;

    if (item.supplierCode && !supplier) errors.push('Ana saglayici Mikroda bulunamadi');
    if (item.brandCode && !brand) {
      if (item.brandName) {
        warnings.push(`Marka Mikroda yok, ${actionLabel} sirasinda olusturulacak: ${item.brandCode} - ${item.brandName}`);
      } else {
        errors.push('Marka Mikroda bulunamadi; yeni marka icin marka adi girilmeli');
      }
    }
    if (item.categoryCode && !category) errors.push('Kategori Mikroda bulunamadi');
    if (category && !category.isLeaf) errors.push('Kategori en alt 3 kademeli kategori olmali');
    if (item.packageCode && !packageRef) {
      if (item.packageName) {
        warnings.push(`Ambalaj Mikroda yok, ${actionLabel} sirasinda olusturulacak: ${item.packageCode} - ${item.packageName}`);
      } else {
        errors.push('Ambalaj Mikroda bulunamadi; yeni ambalaj icin ambalaj adi girilmeli');
      }
    }
    if (item.shelfCode && !shelf) errors.push('Raf/Reyon kodu Mikroda bulunamadi');
    if (!template) errors.push('Mevcut stok Mikroda bulunamadi');
    if (duplicate && upperText(duplicate.code) !== code) warnings.push(`Ayni isimde baska stok var: ${duplicate.code}`);
    if (barcodeDuplicate && upperText(barcodeDuplicate.name) !== code) {
      errors.push(`Barkod baska stokta kayitli: ${barcodeDuplicate.name}`);
    }

    return {
      item,
      errors,
      warnings,
      refs: {
        supplier,
        brand,
        category,
        package: packageRef,
        shelf,
        template,
      },
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
    return buildStockPriceListRows(item);
  }

  private buildMikroPriceListStatements(stockCodeSql: string, item: NormalizedStockInput) {
    const priceRows = this.buildPriceListRows(item);
    if (!priceRows.length) return '';
    const expectedListNos = priceRows.map(({ listNo }) => listNo).join(', ');
    const retailListNos = STANDARD_PRICE_LIST_DEFINITIONS
      .filter((definition) => definition.plane === 'RETAIL')
      .map((definition) => definition.listNo)
      .join(', ');
    const invoicedListNos = STANDARD_PRICE_LIST_DEFINITIONS
      .filter((definition) => definition.plane === 'INVOICED')
      .map((definition) => definition.listNo)
      .join(', ');

    const writeStatements = priceRows
      .map(({ listNo, value }) => {
        const definition = STANDARD_PRICE_LIST_DEFINITIONS.find(
          (entry) => entry.listNo === listNo
        );
        const unitPointerVariable =
          definition?.plane === 'RETAIL'
            ? '@retailPriceUnitPointer'
            : '@invoicedPriceUnitPointer';
        return `
        UPDATE STOK_SATIS_FIYAT_LISTELERI
        SET sfiyat_fiyati = ${toSqlNumber(value)},
            sfiyat_degisti = 1,
            sfiyat_lastup_user = 1,
            sfiyat_lastup_date = GETDATE()
        WHERE sfiyat_stokkod = ${stockCodeSql}
          AND sfiyat_listesirano = ${listNo}
          AND sfiyat_deposirano = 0
          AND sfiyat_doviz = 0
          AND sfiyat_odemeplan = 0
          AND sfiyat_iptal = 0
          AND ISNULL(sfiyat_hidden, 0) = 0;

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
             ${stockCodeSql}, ${listNo}, 0, 0, ${unitPointerVariable}, ${toSqlNumber(value)}, 0,
             N'', 0, 0, N'', 0);
        END
      `;
      })
      .join('\n');

    const expectedRows = priceRows
      .map(({ listNo, value }) => `(${listNo}, ${toSqlNumber(value)})`)
      .join(',\n          ');

    return `
      DECLARE @retailPriceUnitPointer tinyint = 0;
      DECLARE @invoicedPriceUnitPointer tinyint = 0;

      IF EXISTS (
        SELECT pricePlane
        FROM (
          SELECT
            CASE
              WHEN sfiyat_listesirano IN (${retailListNos}) THEN N'RETAIL'
              ELSE N'INVOICED'
            END AS pricePlane,
            sfiyat_birim_pntr
          FROM STOK_SATIS_FIYAT_LISTELERI
          WHERE sfiyat_stokkod = ${stockCodeSql}
            AND sfiyat_listesirano IN (${expectedListNos})
            AND sfiyat_deposirano = 0
            AND sfiyat_doviz = 0
            AND sfiyat_odemeplan = 0
            AND sfiyat_iptal = 0
            AND ISNULL(sfiyat_hidden, 0) = 0
        ) unit_candidates
        GROUP BY pricePlane
        HAVING COUNT(DISTINCT sfiyat_birim_pntr) > 1
      )
        THROW 51004, 'Stok fiyat listelerinde ayni duzlem icin birim pointer belirsiz.', 1;

      SELECT TOP 1 @retailPriceUnitPointer = sfiyat_birim_pntr
      FROM STOK_SATIS_FIYAT_LISTELERI
      WHERE sfiyat_stokkod = ${stockCodeSql}
        AND sfiyat_listesirano IN (${retailListNos})
        AND sfiyat_deposirano = 0
        AND sfiyat_doviz = 0
        AND sfiyat_odemeplan = 0
        AND sfiyat_iptal = 0
        AND ISNULL(sfiyat_hidden, 0) = 0
      ORDER BY sfiyat_listesirano;

      SELECT TOP 1 @invoicedPriceUnitPointer = sfiyat_birim_pntr
      FROM STOK_SATIS_FIYAT_LISTELERI
      WHERE sfiyat_stokkod = ${stockCodeSql}
        AND sfiyat_listesirano IN (${invoicedListNos})
        AND sfiyat_deposirano = 0
        AND sfiyat_doviz = 0
        AND sfiyat_odemeplan = 0
        AND sfiyat_iptal = 0
        AND ISNULL(sfiyat_hidden, 0) = 0
      ORDER BY sfiyat_listesirano;

      IF EXISTS (
        SELECT sfiyat_listesirano
        FROM STOK_SATIS_FIYAT_LISTELERI
        WHERE sfiyat_stokkod = ${stockCodeSql}
          AND sfiyat_listesirano IN (${expectedListNos})
          AND sfiyat_deposirano = 0
          AND sfiyat_doviz = 0
          AND sfiyat_odemeplan = 0
          AND sfiyat_iptal = 0
          AND ISNULL(sfiyat_hidden, 0) = 0
        GROUP BY sfiyat_listesirano
        HAVING COUNT(*) > 1
      )
        THROW 51005, 'Standart fiyat listesinde birden fazla aktif canonical satir var.', 1;

      ${writeStatements}

      IF EXISTS (
        SELECT 1
        FROM (VALUES
          ${expectedRows}
        ) expected(listNo, expectedPrice)
        WHERE NOT EXISTS (
          SELECT 1
          FROM STOK_SATIS_FIYAT_LISTELERI actual
          WHERE actual.sfiyat_stokkod = ${stockCodeSql}
            AND actual.sfiyat_listesirano = expected.listNo
            AND actual.sfiyat_deposirano = 0
            AND actual.sfiyat_doviz = 0
            AND actual.sfiyat_odemeplan = 0
            AND actual.sfiyat_iptal = 0
            AND ISNULL(actual.sfiyat_hidden, 0) = 0
            AND ABS(CAST(actual.sfiyat_fiyati AS float) - CAST(expected.expectedPrice AS float)) <= 0.005
        )
      )
        THROW 51006, 'Standart fiyat listelerinin tamami Mikroda dogrulanamadi.', 1;
    `;
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

    const syncedAt = new Date();
    await prisma.$transaction(
      priceRows.map((row) => {
        const currentMargin =
          row.value > 0 && row.baseCost > 0
            ? Math.round(((row.value - row.baseCost) / row.value) * 100 * 10000) / 10000
            : null;
        return prisma.productPriceListCurrent.upsert({
          where: {
            productCode_priceListNo: {
              productCode: stockCode,
              priceListNo: row.listNo,
            },
          },
          create: {
            productCode: stockCode,
            priceListNo: row.listNo,
            currentPrice: row.value,
            currentCost: row.baseCost,
            currentMargin,
            syncedAt,
          },
          update: {
            currentPrice: row.value,
            currentCost: row.baseCost,
            currentMargin,
            syncedAt,
          },
        });
      })
    );
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

    await this.assertPriceListUserColumns();
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
    // Deterministic per-request GUIDs make an uncertain COMMIT result
    // independently discoverable without ever replaying the create batch.
    const requestGuids = items.map(() => randomUUID());

    items.forEach((item, index) => {
      const columnList = columns.map((column) => `[${column.replace(/]/g, ']]')}]`).join(', ');
      const expressionList = columns.map((column) => this.buildStockColumnExpression(column, item, index)).join(', ');
      const templateCode = toSqlString(item.templateCode);

      declarations.push(
        `DECLARE @guid${index} uniqueidentifier = ${toSqlString(requestGuids[index])};`
      );
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
              Marj_6 = ${toSqlString(item.margins[5])},
              MaliyetP = ${toSqlNumber(item.costT)},
              MaliyetT = ${toSqlNumber(item.costP)},
              MaliyetTarihi = ${toSqlString(item.costP > 0 || item.costT > 0 ? marginDate : '')},
              FiyatDegisimTarihi = ${toSqlString(item.costP > 0 || item.costT > 0 ? marginDate : '')}
          WHERE Record_uid = @guid${index};
        END
        ELSE
        BEGIN
          INSERT INTO STOKLAR_USER
            (Record_uid, Maliyet_Tar, GUNCEL_MALIYET_TARIHI, TOPCA_MIN, TOPCA_MAX, Marj_1, Marj_2, Marj_3, Marj_4, Marj_5, Marj_6, MaliyetP, MaliyetT, MaliyetTarihi, FiyatDegisimTarihi, Yatan_Stok, Birim_1_Desi, SKT)
          VALUES
            (@guid${index}, NULL, 0, 0, 0, ${toSqlString(item.margins[0])}, ${toSqlString(item.margins[1])}, ${toSqlString(item.margins[2])}, ${toSqlString(item.margins[3])}, ${toSqlString(item.margins[4])}, ${toSqlString(item.margins[5])}, ${toSqlNumber(item.costT)}, ${toSqlNumber(item.costP)}, ${toSqlString(item.costP > 0 || item.costT > 0 ? marginDate : '')}, ${toSqlString(item.costP > 0 || item.costT > 0 ? marginDate : '')}, N'', 0, N'');
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

    let createdRows: any[];
    try {
      // Creation is non-idempotent (MAX(B...)+1), so the generic reconnect
      // retry must never replay it after an uncertain COMMIT response.
      createdRows = await mikroService.executeQueryOnce(sql);
    } catch (writeError) {
      const expectedRowsSql = preview.results
        .map(
          (validation, index) =>
            `(${validation.rowNo}, CONVERT(uniqueidentifier, ${toSqlString(requestGuids[index])}))`
        )
        .join(',\n          ');
      let readbackRows: any[] = [];
      try {
        readbackRows = await mikroService.executeQuery(`
          SELECT
            expected.rowNo,
            stock.sto_kod AS stockCode,
            CONVERT(nvarchar(50), stock.sto_Guid) AS stockGuid
          FROM (VALUES
            ${expectedRowsSql}
          ) expected(rowNo, stockGuid)
          INNER JOIN STOKLAR stock WITH (NOLOCK)
            ON stock.sto_Guid = expected.stockGuid
          ORDER BY expected.rowNo
        `);
      } catch {
        // Preserve the original write failure; a failed read-back is not
        // evidence that the transaction did or did not commit.
      }

      if (readbackRows.length !== preview.results.length) {
        throw writeError;
      }
      createdRows = readbackRows;
    }
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
        // Gorseli yukleyenin adini bir kez cek (null-safe; meta opsiyonel).
        let uploaderName: string | null = null;
        if (userId) {
          const uploader = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true, email: true },
          });
          uploaderName = uploader?.name || uploader?.email || '';
        }
        await prisma.product.update({
          where: { id: productId },
          data: {
            imageUrl: processed.imageUrl,
            imageChecksum: processed.checksum,
            imageSyncStatus: 'SUCCESS',
            imageSyncErrorType: null,
            imageSyncErrorMessage: null,
            imageSyncUpdatedAt: new Date(),
            imageSizeBytes: processed.sizeBytes,
            imageUploadedAt: new Date(),
            imageUploadedById: userId ?? null,
            imageUploadedByName: uploaderName,
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
    options: { activate?: boolean } = {}
  ) {
    const code = upperText(stockCode);
    const activate = options.activate === true;
    if (!code) {
      throw new Error('Stok kodu gerekli');
    }
    await this.assertPriceListUserColumns();

    const existingRows = await mikroService.executeQuery(`
      SELECT TOP 1
        sto_kod AS code,
        CONVERT(nvarchar(50), sto_Guid) AS guid,
        ISNULL(sto_standartmaliyet, 0) AS currentCost,
        ISNULL(sto_pasif_fl, 0) AS isPassive
      FROM STOKLAR WITH (UPDLOCK, HOLDLOCK)
      WHERE sto_kod = ${toSqlString(code)}
    `);
    const existing = existingRows[0];
    if (!existing) {
      throw new Error('Guncellenecek stok Mikroda bulunamadi');
    }
    if (activate && !(existing.isPassive === true || Number(existing.isPassive) === 1)) {
      throw new Error('Stok zaten aktif; sadece pasif stok aktiflestirilebilir');
    }

    const validation = await this.validateExistingItem(code, input, activate ? 'aktiflestirme' : 'guncelleme');
    const { item, errors, warnings, refs } = validation;

    if (errors.length > 0) {
      throw new Error(`${activate ? 'Stok aktiflestirilemedi' : 'Stok guncellenemedi'}: ${errors.join('; ')}`);
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
    if (activate) {
      // Ayrim yeni kart acilip acilmamasidir: mevcut kartin tum form alanlari
      // guncellenirken ayni transaction icinde pasif bayragi indirilir.
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

    // Do not replay a transaction after an uncertain COMMIT response.
    const transactionSql = `
      SET XACT_ABORT ON;
      BEGIN TRY
        BEGIN TRANSACTION;
        DECLARE @stockCode nvarchar(25) = ${toSqlString(code)};
        DECLARE @stockGuid uniqueidentifier;
        DECLARE @isPassive bit;

        SELECT
          @stockGuid = sto_Guid,
          @isPassive = ISNULL(sto_pasif_fl, 0)
        FROM STOKLAR WITH (UPDLOCK, HOLDLOCK)
        WHERE sto_kod = @stockCode;

        IF @stockGuid IS NULL
          THROW 51004, 'Guncellenecek stok bulunamadi', 1;

        ${activate ? `
        IF @isPassive <> 1
          THROW 51011, 'Stok zaten aktif; sadece pasif stok aktiflestirilebilir', 1;
        ` : ''}

        ${this.buildReferenceCreateStatements(item)}

        UPDATE STOKLAR
        SET ${stockAssignments.join(',\n            ')}
        WHERE sto_kod = @stockCode
          ${activate ? 'AND sto_pasif_fl = 1' : ''};

        ${activate ? `
        IF @@ROWCOUNT <> 1
          THROW 51012, 'Stok aktiflestirme satir sayisi beklenenden farkli', 1;
        ` : ''}

        IF EXISTS (SELECT 1 FROM STOKLAR_USER WITH (UPDLOCK, HOLDLOCK) WHERE Record_uid = @stockGuid)
        BEGIN
          UPDATE STOKLAR_USER
          SET Marj_1 = ${toSqlString(item.margins[0])},
              Marj_2 = ${toSqlString(item.margins[1])},
              Marj_3 = ${toSqlString(item.margins[2])},
              Marj_4 = ${toSqlString(item.margins[3])},
              Marj_5 = ${toSqlString(item.margins[4])},
              Marj_6 = ${toSqlString(item.margins[5])},
              MaliyetP = ${currentCostSql},
              MaliyetT = ${retailCostSql},
              MaliyetTarihi = CASE WHEN ${userCostChangedExpression} THEN ${toSqlString(marginDate)} ELSE MaliyetTarihi END,
              FiyatDegisimTarihi = CASE WHEN ${userCostChangedExpression} THEN ${toSqlString(marginDate)} ELSE FiyatDegisimTarihi END
          WHERE Record_uid = @stockGuid;
        END
        ELSE
        BEGIN
          INSERT INTO STOKLAR_USER
            (Record_uid, Maliyet_Tar, GUNCEL_MALIYET_TARIHI, TOPCA_MIN, TOPCA_MAX, Marj_1, Marj_2, Marj_3, Marj_4, Marj_5, Marj_6, MaliyetP, MaliyetT, MaliyetTarihi, FiyatDegisimTarihi, Yatan_Stok, Birim_1_Desi, SKT)
          VALUES
            (@stockGuid, NULL, 0, 0, 0, ${toSqlString(item.margins[0])}, ${toSqlString(item.margins[1])}, ${toSqlString(item.margins[2])}, ${toSqlString(item.margins[3])}, ${toSqlString(item.margins[4])}, ${toSqlString(item.margins[5])}, ${currentCostSql}, ${retailCostSql}, ${toSqlString(item.costP > 0 || item.costT > 0 ? marginDate : '')}, ${toSqlString(item.costP > 0 || item.costT > 0 ? marginDate : '')}, N'', 0, N'');
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
    `;
    let writeError: any = null;
    try {
      await mikroService.executeQueryOnce(transactionSql);
    } catch (error: any) {
      writeError = error;
      if (!activate || !isUncertainMikroWriteError(error)) {
        throw error;
      }
    }

    let activationReadback: Awaited<ReturnType<StockCreateService['getTemplate']>> | null = null;
    if (activate) {
      let readback: Awaited<ReturnType<StockCreateService['getTemplate']>>;
      let priceReadbackRows: any[] = [];
      try {
        readback = await this.getTemplate(code, { consistent: true });
        const expectedPriceRows = this.buildPriceListRows(item);
        if (expectedPriceRows.length > 0) {
          const listNos = expectedPriceRows.map((row) => row.listNo).join(', ');
          priceReadbackRows = await mikroService.executeQuery(`
            SELECT
              sfiyat_listesirano AS listNo,
              COUNT(*) AS rowCount,
              MAX(sfiyat_fiyati) AS price
            FROM STOK_SATIS_FIYAT_LISTELERI
            WHERE sfiyat_stokkod = ${toSqlString(code)}
              AND sfiyat_listesirano IN (${listNos})
              AND sfiyat_deposirano = 0
              AND sfiyat_doviz = 0
              AND sfiyat_odemeplan = 0
              AND sfiyat_iptal = 0
              AND ISNULL(sfiyat_hidden, 0) = 0
            GROUP BY sfiyat_listesirano
          `);
        }
      } catch (readbackError: any) {
        if (writeError) {
          throw new Error(
            'Mikro baglantisi yazma sirasinda kesildi ve aktivasyon sonucu dogrulanamadi; islemi tekrar calistirmadan once stok kartini Mikrodan kontrol edin'
          );
        }
        throw readbackError;
      }

      activationReadback = readback;
      const sameNumber = (left: unknown, right: unknown) =>
        Math.abs(toNumber(left, 0) - toNumber(right, 0)) <= 0.0001;
      const normalizedReadback = this.normalizeItem(
        { ...(readback as StockCreateInput), templateCode: code, stockCode: code },
        1
      );
      const expectedUnits = new Map(item.extraUnits.map((unit) => [unit.index, unit]));
      const actualUnits = new Map(normalizedReadback.extraUnits.map((unit) => [unit.index, unit]));
      const extraUnitsMatch = UNIT_INDEXES.every((unitIndex) => {
        const expected = expectedUnits.get(unitIndex);
        const actual = actualUnits.get(unitIndex);
        if (!expected && !actual) return true;
        if (!expected || !actual) return false;
        return (
          actual.name === expected.name &&
          actual.factorDirection === expected.factorDirection &&
          sameNumber(actual.factor, expected.factor) &&
          sameNumber(actual.weightKg, expected.weightKg) &&
          sameNumber(actual.widthMm, expected.widthMm) &&
          sameNumber(actual.lengthMm, expected.lengthMm) &&
          sameNumber(actual.heightMm, expected.heightMm)
        );
      });
      const expectedPriceRows = this.buildPriceListRows(item);
      const priceReadbackMap = new Map(
        priceReadbackRows.map((row) => [Number(row.listNo), row])
      );
      const pricesMatch =
        expectedPriceRows.length === priceReadbackRows.length &&
        expectedPriceRows.every((expected) => {
          const actual = priceReadbackMap.get(expected.listNo);
          return (
            actual &&
            Number(actual.rowCount) === 1 &&
            Math.abs(toNumber(actual.price, 0) - expected.value) <= 0.005
          );
        });
      const readbackMatches =
        readback.isPassive === false &&
        normalizedReadback.name === item.name &&
        normalizedReadback.foreignName === item.foreignName &&
        normalizedReadback.shortName === item.shortName &&
        normalizedReadback.vatCode === item.vatCode &&
        normalizedReadback.supplierCode === item.supplierCode &&
        normalizedReadback.brandCode === item.brandCode &&
        (Boolean(refs.brand) || !item.brandName || normalizeText(readback.brandName) === item.brandName) &&
        normalizedReadback.categoryCode === item.categoryCode &&
        normalizedReadback.packageCode === item.packageCode &&
        (Boolean(refs.package) || !item.packageName || normalizeText(readback.packageName) === item.packageName) &&
        normalizedReadback.shelfCode === item.shelfCode &&
        normalizedReadback.mainUnit === item.mainUnit &&
        normalizedReadback.calculateMinMax === item.calculateMinMax &&
        normalizedReadback.barcode === item.barcode &&
        sameNumber(readback.standardCost, item.costT) &&
        sameNumber(normalizedReadback.costT, item.costT) &&
        sameNumber(normalizedReadback.costP, item.costP) &&
        sameNumber(normalizedReadback.mainUnitWeightKg, item.mainUnitWeightKg) &&
        sameNumber(normalizedReadback.mainUnitWidthMm, item.mainUnitWidthMm) &&
        sameNumber(normalizedReadback.mainUnitLengthMm, item.mainUnitLengthMm) &&
        sameNumber(normalizedReadback.mainUnitHeightMm, item.mainUnitHeightMm) &&
        item.margins.every((margin, index) =>
          sameNumber(normalizedReadback.margins[index], margin)
        ) &&
        extraUnitsMatch &&
        pricesMatch;

      if (!readbackMatches) {
        throw new Error(
          'Stok aktivasyonu sonrasi alanlarin tamami Mikro read-back kontrolunde dogrulanamadi; islemi tekrar calistirmadan once stok kartini kontrol edin'
        );
      }
      if (writeError) {
        warnings.push('Mikro baglantisi kesildi ancak bagimsiz kontrolde stok alanlari ve aktivasyon dogrulandi');
      }
    }

    let syncedProductId: string | null = null;
    try {
      const product = await this.syncCreatedProduct(item, code);
      syncedProductId = product.id;
    } catch (syncError: any) {
      if (!activate) throw syncError;
      warnings.push(
        `Stok Mikroda aktiflestirildi; B2B urun senkronu tamamlanamadi: ${syncError?.message || 'bilinmeyen hata'}`
      );
    }

    let user: { name: string; displayName: string | null; mikroName: string | null; email: string | null } | null = null;
    try {
      user = userId
        ? await prisma.user.findUnique({ where: { id: userId }, select: { name: true, displayName: true, mikroName: true, email: true } })
        : null;
    } catch (userError: any) {
      if (!activate) throw userError;
      warnings.push('Stok Mikroda aktiflestirildi; islem yapan kullanici bilgisi log icin okunamadi');
    }
    const userName = user?.displayName || user?.mikroName || user?.name || user?.email || null;

    try {
      await prisma.stockCreationLog.create({
        data: {
          batchId: `stock-${activate ? 'activate' : 'edit'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          mode: activate ? 'ACTIVATE' : 'EDIT',
          status: activate ? 'ACTIVATED' : 'UPDATED',
          rowNo: 1,
          stockCode: code,
          stockName: item.name,
          templateCode: item.templateCode,
          payload: item as any,
          validation: {
            errors,
            warnings,
            refs,
          } as any,
          result: {
            stockGuid: normalizeText(existing.guid),
            syncedProductId,
            ...(activate ? { passiveFlag: 0 } : {}),
          } as any,
          errorMessage: null,
          createdById: userId || null,
          createdByName: userName,
        },
      });
    } catch (logError: any) {
      if (!activate) throw logError;
      warnings.push(
        `Stok Mikroda aktiflestirildi; B2B islem kaydi yazilamadi: ${logError?.message || 'bilinmeyen hata'}`
      );
    }

    let finalStock: any;
    try {
      finalStock = await this.getStock(code);
    } catch (stockReadError: any) {
      if (!activate) throw stockReadError;
      warnings.push('Stok Mikroda aktiflestirildi; B2B stok detaylari yeniden okunamadi');
      finalStock = {
        ...(activationReadback || {}),
        stockCode: code,
        imageUrl: null,
        hasExistingImage: Boolean(activationReadback?.hasMikroImage),
        stockFamilyIds: [],
        priceFamilyId: null,
      };
    }

    return {
      stockCode: code,
      warnings,
      stock: finalStock,
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
   * Pasif stok on kontrolu yeni kod uretmez; ancak yeni stok formundaki alan ve
   * referans zorunluluklarini aynen uygular. Isim ve barkod kontrollerinde hedef
   * kart kendisiyle cakisma sayilmaz.
   */
  async previewActivation(stockCode: string, input: StockCreateInput) {
    const requestedCode = upperText(stockCode);
    if (!requestedCode) {
      throw new Error('Aktiflestirilecek stok kodu gerekli');
    }

    const rows = await mikroService.executeQuery(`
      SELECT TOP 1
        sto_kod AS code,
        sto_isim AS name,
        CONVERT(nvarchar(50), sto_Guid) AS guid,
        ISNULL(sto_pasif_fl, 0) AS isPassive
      FROM dbo.STOKLAR
      WHERE sto_kod = ${toSqlString(requestedCode)}
    `);
    const target = rows[0];
    if (!target) {
      throw new Error('Aktiflestirilecek stok Mikroda bulunamadi');
    }
    if (!(target.isPassive === true || Number(target.isPassive) === 1)) {
      throw new Error('Stok zaten aktif; sadece pasif stok aktiflestirilebilir');
    }

    const code = upperText(target.code) || requestedCode;
    const validation = await this.validateExistingItem(code, input || {}, 'aktiflestirme');
    const status =
      validation.errors.length > 0
        ? 'error' as const
        : validation.warnings.length > 0
          ? 'warning' as const
          : 'valid' as const;
    const result = {
      rowNo: 1,
      previewCode: code,
      status,
      errors: validation.errors,
      warnings: validation.warnings,
      item: { ...validation.item, stockCode: code },
      refs: validation.refs,
    };

    return {
      results: [result],
      summary: {
        total: 1,
        valid: status === 'valid' ? 1 : 0,
        warning: status === 'warning' ? 1 : 0,
        error: status === 'error' ? 1 : 0,
        requestedTotal: 1,
        maxItems: 1,
        skippedCount: 0,
        truncated: false,
        truncationMessage: null,
      },
    };
  }

  /**
   * Mevcut pasif kartin eksik/duzeltilecek alanlarini yazip ayni karti aktifler.
   * Yeni STOKLAR kaydi veya yeni B kodu uretilmez. Gorsel yoksa gorsel pipeline
   * aktivasyondan once basariyla tamamlanmak zorundadir.
   */
  async activateStock(params: {
    stockCode: string;
    item: StockCreateInput;
    imageFile?: Express.Multer.File | null;
    stockFamilyIds?: string[] | null;
    priceFamilyId?: string | null;
    userId?: string | null;
  }): Promise<{
    success: boolean;
    stockCode: string;
    productId?: string;
    warnings: string[];
    stock: Awaited<ReturnType<StockCreateService['getStock']>>;
  }> {
    const code = upperText(params.stockCode);
    if (!code) {
      throw new Error('Aktiflestirilecek stok kodu gerekli');
    }
    const itemCode = upperText(params.item?.stockCode || params.item?.templateCode);
    if (itemCode && itemCode !== code) {
      throw new Error('Aktivasyon hedef kodu ile formdaki stok kodu eslesmiyor');
    }

    const preview = await this.previewActivation(code, params.item);
    const validation = preview.results[0];
    if (!validation || validation.errors.length > 0) {
      throw new Error(`Stok aktiflestirilemedi: ${validation?.errors.join('; ') || 'zorunlu alanlar eksik'}`);
    }

    const before = await this.getStock(code, { consistent: true });
    if (before.isPassive !== true) {
      throw new Error('Stok zaten aktif; sadece pasif stok aktiflestirilebilir');
    }

    const warnings = [...validation.warnings];
    const imageFile = params.imageFile || null;
    const existingImageUrl = normalizeText(before.imageUrl) || null;
    const hasExistingImage = Boolean(before.hasExistingImage);
    if (!hasExistingImage && !imageFile) {
      throw new Error('Gorsel zorunlu - mevcut gorseli olmayan stok aktiflestirilemez');
    }

    let preparedImage: {
      imageUrl: string;
      checksum?: string | null;
      sizeBytes?: number | null;
      uploaded: boolean;
      filePath: string;
      buffer?: Buffer;
      mikroUploaded: boolean;
    } | null = null;

    if (imageFile) {
      let processedFilePath: string | null = null;
      try {
        const tempPath = (imageFile as any).path || path.join(getUploadsDir(), imageFile.filename);
        const processed = await imageService.processUploadedProductImage(tempPath, code, {
          fileKey: `${code}-${randomUUID().slice(0, 8)}`,
        });
        processedFilePath = processed.filePath;
        if (!before.stockGuid) throw new Error('Mikro GUID bulunamadi');
        // Kartta hic gorsel yoksa aktif bir kartin gorselsiz kalmamasi icin
        // Mikro gorseli aktivasyondan once yazilir. Mevcut gorsel degisimi ise
        // aktivasyon dogrulandiktan sonra yapilir; basarisiz olursa eski gorsel kalir.
        if (!hasExistingImage) {
          await imageService.uploadImageToMikro(before.stockGuid, processed.buffer);
          const imageReadback = await this.getTemplate(code, { consistent: true });
          if (!imageReadback.hasMikroImage) {
            throw new Error('Mikro gorsel yazimi bagimsiz kontrolde dogrulanamadi');
          }
        }
        preparedImage = {
          imageUrl: processed.imageUrl,
          checksum: processed.checksum,
          sizeBytes: processed.sizeBytes,
          uploaded: true,
          filePath: processed.filePath,
          buffer: processed.buffer,
          mikroUploaded: !hasExistingImage,
        };
      } catch (imageError: any) {
        if (processedFilePath) {
          await imageService.removeLocalFile(processedFilePath).catch(() => {});
        }
        throw new Error(`Gorsel yuklenemedi; stok aktiflestirilmedi: ${imageError?.message || 'bilinmeyen hata'}`);
      }
    } else if (!existingImageUrl && before.hasMikroImage) {
      if (!before.stockGuid) throw new Error('Mikro GUID bulunamadi');
      const downloaded = await imageService.downloadImageFromMikro(code, before.stockGuid);
      if (!downloaded.success || !downloaded.localPath) {
        throw new Error(
          `Mevcut Mikro gorseli siteye alinamadi; yeni gorsel yukleyin: ${downloaded.error || downloaded.skipReason || 'gorsel islenemedi'}`
        );
      }
      preparedImage = {
        imageUrl: downloaded.localPath,
        checksum: downloaded.checksum || null,
        sizeBytes: downloaded.size || null,
        uploaded: false,
        filePath: imageService.absPathForUrl(downloaded.localPath),
        mikroUploaded: true,
      };
    }

    // Alanlar + pasif bayragi tek Mikro transactioninda yazilir. Bu yol
    // create()/getNextStockCode() cagirmadigi icin yeni stok kodu uretemez.
    let updateResult: Awaited<ReturnType<StockCreateService['updateStock']>>;
    try {
      updateResult = await this.updateStock(code, params.item, params.userId, { activate: true });
    } catch (updateError: any) {
      // Eksik gorsel icin Mikro resmi once yazilmis olabilir. Bu durumda kart
      // pasif kalir ama artik gorsellidir; ayni Mikro yazisini korlemesine geri
      // almaya calismayiz. Yalnizca benzersiz yerel staging dosyasini temizleriz.
      const imageWasPersisted = Boolean(preparedImage?.uploaded && preparedImage.mikroUploaded);
      if (preparedImage?.uploaded) {
        await imageService.removeLocalFile(preparedImage.filePath).catch(() => {});
      }
      if (imageWasPersisted) {
        throw new Error(
          `Gorsel mevcut karta eklendi; aktivasyon tamamlanamadi veya sonucu tam dogrulanamadi. Islemi tekrar calistirmadan once karti Mikrodan kontrol edin: ${updateError?.message || 'bilinmeyen hata'}`
        );
      }
      throw updateError;
    }
    updateResult.warnings?.forEach((warning) => {
      if (!warnings.includes(warning)) warnings.push(warning);
    });

    if (preparedImage?.uploaded && !preparedImage.mikroUploaded) {
      try {
        if (!before.stockGuid || !preparedImage.buffer) throw new Error('Mikro gorsel verisi hazir degil');
        await imageService.uploadImageToMikro(before.stockGuid, preparedImage.buffer);
        preparedImage.mikroUploaded = true;
      } catch (imageError: any) {
        await imageService.removeLocalFile(preparedImage.filePath).catch(() => {});
        preparedImage = null;
        warnings.push(
          `Stok aktiflestirildi; yeni gorsel yuklenemedi ve mevcut gorsel korundu: ${imageError?.message || 'bilinmeyen hata'}`
        );
      }
    }

    let product: { id: string; name: string } | null = null;
    try {
      product = await prisma.product.findUnique({
        where: { mikroCode: code },
        select: { id: true, name: true },
      });
    } catch (productError: any) {
      warnings.push(
        `Stok Mikroda aktiflestirildi; B2B urun kaydi okunamadi: ${productError?.message || 'bilinmeyen hata'}`
      );
    }
    const productId = product?.id;
    const productName = product?.name || validation.item.name || code;

    if (preparedImage && productId) {
      try {
        let uploaderName: string | null = null;
        if (params.userId && preparedImage.uploaded) {
          const uploader = await prisma.user.findUnique({
            where: { id: params.userId },
            select: { name: true, email: true },
          });
          uploaderName = uploader?.name || uploader?.email || '';
        }
        await prisma.product.update({
          where: { id: productId },
          data: {
            imageUrl: preparedImage.imageUrl,
            imageChecksum: preparedImage.checksum || null,
            imageSyncStatus: 'SUCCESS',
            imageSyncErrorType: null,
            imageSyncErrorMessage: null,
            imageSyncUpdatedAt: new Date(),
            imageSizeBytes: preparedImage.sizeBytes || null,
            imageUploadedAt: preparedImage.uploaded ? new Date() : undefined,
            imageUploadedById: preparedImage.uploaded ? params.userId ?? null : undefined,
            imageUploadedByName: preparedImage.uploaded ? uploaderName : undefined,
          },
        });
      } catch (imageMetadataError: any) {
        warnings.push(
          `Stok ve Mikro gorseli aktif; B2B gorsel bilgisi kaydedilemedi: ${imageMetadataError?.message || 'bilinmeyen hata'}`
        );
      }
    } else if (preparedImage && !productId) {
      warnings.push('Stok ve Mikro gorseli aktif; B2B urun kaydi bulunamadigi icin gorsel bilgisi eslestirilemedi');
    }

    if (Array.isArray(params.stockFamilyIds)) {
      const selectedFamilyIds = Array.from(
        new Set(params.stockFamilyIds.map(normalizeText).filter(Boolean))
      );
      try {
        const currentFamilyRows = await prisma.productFamilyItem.findMany({
          where: {
            productCode: code,
            active: true,
            family: { active: true },
          },
          select: { familyId: true },
        });
        const currentFamilyIds = new Set(currentFamilyRows.map((row) => row.familyId));
        const validSelectedFamilies = selectedFamilyIds.length
          ? await prisma.productFamily.findMany({
              where: { id: { in: selectedFamilyIds }, active: true },
              select: { id: true },
            })
          : [];
        const validSelectedFamilyIds = new Set(validSelectedFamilies.map((family) => family.id));
        const invalidSelectedFamilyIds = selectedFamilyIds.filter(
          (familyId) => !validSelectedFamilyIds.has(familyId)
        );
        if (invalidSelectedFamilyIds.length > 0) {
          warnings.push(
            `Secilen stok aileleri bulunamadi veya pasif; mevcut aileler korundu: ${invalidSelectedFamilyIds.join(', ')}`
          );
        } else {
          let additionsComplete = true;
          // Once yeni uyelikleri ekle. Ekleme basarisizsa mevcut uyelikleri
          // kaldirmayarak duzeltmeyi veri kaybi olmadan fail-safe birakiriz.
          for (const familyId of selectedFamilyIds) {
            if (currentFamilyIds.has(familyId)) continue;
            try {
              await familyCandidateService.addProductToFamily(familyId, { productCode: code, productName });
            } catch (familyError: any) {
              const status = familyError?.statusCode || familyError?.status;
              if (status === 409) continue;
              additionsComplete = false;
              warnings.push(
                `Stok ailesine eklenemedi (${familyId}): ${familyError?.message || 'bilinmeyen hata'}`
              );
            }
          }
          if (additionsComplete) {
            for (const familyId of currentFamilyIds) {
              if (selectedFamilyIds.includes(familyId)) continue;
              try {
                await familyCandidateService.removeProductFromFamily(familyId, code);
              } catch (familyError: any) {
                warnings.push(
                  `Stok ailesinden cikarilamadi (${familyId}): ${familyError?.message || 'bilinmeyen hata'}`
                );
              }
            }
          } else {
            warnings.push('Yeni stok ailesi uyelikleri tamamlanamadigi icin mevcut aileler korundu');
          }
        }
      } catch (familyReadError: any) {
        warnings.push(
          `Stok aktiflestirildi; stok ailesi secimleri uygulanamadi: ${familyReadError?.message || 'bilinmeyen hata'}`
        );
      }
    }

    if (params.priceFamilyId !== undefined) {
      const priceFamilyId = normalizeText(params.priceFamilyId);
      try {
        const target = priceFamilyId
          ? await prisma.priceFamily.findFirst({
              where: { id: priceFamilyId, active: true },
              select: { id: true },
            })
          : null;
        if (priceFamilyId && !target) {
          warnings.push('Secilen fiyat ailesi bulunamadi veya pasif; mevcut fiyat ailesi korundu');
        } else {
          await prisma.$transaction(async (tx) => {
            if (!priceFamilyId) {
              await tx.priceFamilyItem.deleteMany({ where: { productCode: code } });
              return;
            }
            const existingPriceFamilyItem = await tx.priceFamilyItem.findUnique({
              where: { productCode: code },
              select: { familyId: true, priority: true },
            });
            const maxPriority = await tx.priceFamilyItem.aggregate({
              where: { familyId: priceFamilyId },
              _max: { priority: true },
            });
            const nextPriority =
              existingPriceFamilyItem?.familyId === priceFamilyId
                ? existingPriceFamilyItem.priority
                : (Number(maxPriority._max.priority) || 0) + 1;
            await tx.priceFamilyItem.upsert({
              where: { productCode: code },
              create: {
                familyId: priceFamilyId,
                productCode: code,
                productId: productId || null,
                productName,
                priority: nextPriority,
                active: true,
              },
              update: {
                familyId: priceFamilyId,
                productId: productId || null,
                productName,
                priority: nextPriority,
                active: true,
              },
            });
          });
        }
      } catch (priceFamilyError: any) {
        warnings.push(
          `Stok aktiflestirildi; fiyat ailesi secimi uygulanamadi: ${priceFamilyError?.message || 'bilinmeyen hata'}`
        );
      }
    }

    let finalStock = updateResult.stock;
    try {
      finalStock = await this.getStock(code);
    } catch (finalReadError: any) {
      warnings.push(
        `Stok Mikroda aktiflestirildi; son B2B detaylari okunamadi: ${finalReadError?.message || 'bilinmeyen hata'}`
      );
    }

    return {
      success: true,
      stockCode: code,
      productId,
      warnings,
      stock: finalStock,
    };
  }

  async getHistory(limit = 50) {
    return prisma.stockCreationLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(Math.trunc(limit) || 50, 1), 200),
    });
  }
}

export default new StockCreateService();
