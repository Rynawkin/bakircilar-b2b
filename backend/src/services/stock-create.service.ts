import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import mikroService from './mikroFactory.service';
import pricingService from './pricing.service';

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
  name?: string | null;
  foreignName?: string | null;
  shortName?: string | null;
  vatRatePercent?: number | string | null;
  supplierCode?: string | null;
  brandCode?: string | null;
  categoryCode?: string | null;
  packageCode?: string | null;
  shelfCode?: string | null;
  currentCost?: number | string | null;
  mainUnit?: string | null;
  extraUnits?: UnitInput[] | null;
  margins?: Array<number | string | null> | null;
  barcode?: string | null;
  notes?: string | null;
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
  categoryCode: string;
  packageCode: string;
  shelfCode: string;
  currentCost: number;
  mainUnit: string;
  extraUnits: NormalizedUnit[];
  margins: string[];
  barcode: string;
  notes: string;
};

type ValidationRef = {
  code: string;
  name: string;
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
      categoryCode: normalizeText(input.categoryCode),
      packageCode: normalizeText(input.packageCode),
      shelfCode: upperText(input.shelfCode),
      currentCost: toNumber(input.currentCost, 0),
      mainUnit: upperText(input.mainUnit),
      extraUnits,
      margins: normalizedMargins,
      barcode: normalizeText(input.barcode),
      notes: normalizeText(input.notes),
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
    if (!item.categoryCode) errors.push('Kategori zorunlu');
    if (!item.packageCode) errors.push('Ambalaj zorunlu');
    if (item.currentCost < 0) errors.push('Guncel maliyet negatif olamaz');

    item.margins.forEach((margin, index) => {
      const numeric = toNumber(margin, NaN);
      if (!margin || !Number.isFinite(numeric) || numeric <= 0) {
        errors.push(`Marj ${index + 1} zorunlu ve 0'dan buyuk olmali`);
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
        FROM STOK_KATEGORILERI WITH (NOLOCK)
        WHERE ISNULL(ktg_iptal, 0) = 0
          ${condition('ktg_kod', 'ktg_isim')}
        ORDER BY ktg_kod
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
        SELECT ktg_kod AS code, ktg_isim AS name
        FROM STOK_KATEGORILERI WITH (NOLOCK)
        WHERE ktg_kod IN (${buildInClause(categories)})
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
      new Map<string, ValidationRef>(rows.map((row) => [normalizeText(row.code), { code: normalizeText(row.code), name: normalizeText(row.name) }]));

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
    const rawItems = Array.isArray(itemsInput) ? itemsInput.slice(0, MAX_ITEMS) : [];
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
      if (item.brandCode && !brand) errors.push('Marka Mikroda bulunamadi');
      if (item.categoryCode && !category) errors.push('Kategori Mikroda bulunamadi');
      if (item.packageCode && !packageRef) errors.push('Ambalaj Mikroda bulunamadi');
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
      },
    };
  }

  private buildStockColumnExpression(column: string, item: NormalizedStockInput, itemIndex: number) {
    const lower = column.toLowerCase();
    const extraByIndex = new Map(item.extraUnits.map((unit) => [unit.index, unit]));
    const costDate = item.currentCost > 0 ? toDateOnly() : '';

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
      sto_standartmaliyet: toSqlNumber(item.currentCost),
      sto_reyon_kodu: toSqlString(item.shelfCode),
      sto_pasif_fl: '0',
      sto_degisti: '1',
      sto_checksum: '0',
      sto_create_user: '1',
      sto_lastup_user: '1',
      sto_create_date: 'GETDATE()',
      sto_lastup_date: 'GETDATE()',
      sto_resim_url: toSqlString(costDate),
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
        currentCost: item.currentCost || null,
        currentCostDate: item.currentCost > 0 ? new Date() : null,
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
        currentCost: item.currentCost || null,
        currentCostDate: item.currentCost > 0 ? new Date() : null,
        vatRate: item.vatRatePercent / 100,
        warehouseStocks: {},
        salesHistory: {},
        pendingCustomerOrdersByWarehouse: {},
        warehouseExcessStocks: {},
        prices: {},
        active: true,
      },
    });

    if (item.currentCost > 0) {
      const prices = await pricingService.calculateAllPricesForProduct({
        productId: product.id,
        cost: item.currentCost,
        vatRate: item.vatRatePercent / 100,
      });
      await prisma.product.update({
        where: { id: product.id },
        data: {
          calculatedCost: item.currentCost,
          prices: prices as any,
        },
      });
    }

    return product;
  }

  async create(itemsInput: StockCreateInput[], userId?: string | null) {
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
              MaliyetP = ${toSqlNumber(item.currentCost)},
              MaliyetT = ${toSqlNumber(item.currentCost)},
              MaliyetTarihi = ${toSqlString(item.currentCost > 0 ? marginDate : '')},
              FiyatDegisimTarihi = ${toSqlString(item.currentCost > 0 ? marginDate : '')}
          WHERE Record_uid = @guid${index};
        END
        ELSE
        BEGIN
          INSERT INTO STOKLAR_USER
            (Record_uid, Maliyet_Tar, GUNCEL_MALIYET_TARIHI, TOPCA_MIN, TOPCA_MAX, Marj_1, Marj_2, Marj_3, Marj_4, Marj_5, MaliyetP, MaliyetT, MaliyetTarihi, FiyatDegisimTarihi, Yatan_Stok, Birim_1_Desi, SKT)
          VALUES
            (@guid${index}, NULL, 0, 0, 0, ${toSqlString(item.margins[0])}, ${toSqlString(item.margins[1])}, ${toSqlString(item.margins[2])}, ${toSqlString(item.margins[3])}, ${toSqlString(item.margins[4])}, ${toSqlNumber(item.currentCost)}, ${toSqlNumber(item.currentCost)}, ${toSqlString(item.currentCost > 0 ? marginDate : '')}, ${toSqlString(item.currentCost > 0 ? marginDate : '')}, N'', 0, N'');
        END

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

  async getHistory(limit = 50) {
    return prisma.stockCreationLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(Math.trunc(limit) || 50, 1), 200),
    });
  }
}

export default new StockCreateService();
