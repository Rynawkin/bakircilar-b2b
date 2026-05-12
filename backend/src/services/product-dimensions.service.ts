import { prisma } from '../utils/prisma';
import mikroService from './mikroFactory.service';

type UnitPayload = {
  index: number;
  name?: string | null;
  factor?: number | null;
  weightKg?: number | null;
  widthMm?: number | null;
  lengthMm?: number | null;
  heightMm?: number | null;
};

type UpdatePayload = {
  shelfCode?: string | null;
  units?: UnitPayload[];
};

const UNIT_INDEXES = [1, 2, 3, 4] as const;

const escapeSql = (value: string) => String(value || '').replace(/'/g, "''");

const normalizeText = (value: unknown) => String(value || '').trim();

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const toSqlNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '0';
  if (!Number.isFinite(value)) return '0';
  return String(value).replace(',', '.');
};

const calcM3 = (widthMm: number | null, lengthMm: number | null, heightMm: number | null) => {
  if (!widthMm || !lengthMm || !heightMm) return 0;
  return (widthMm * lengthMm * heightMm) / 1_000_000_000;
};

const calcDesi = (widthMm: number | null, lengthMm: number | null, heightMm: number | null) => {
  if (!widthMm || !lengthMm || !heightMm) return 0;
  return (widthMm * lengthMm * heightMm) / 3_000_000;
};

const sumWarehouseStocks = (warehouseStocks: unknown) => {
  if (!warehouseStocks || typeof warehouseStocks !== 'object') return 0;
  return Object.values(warehouseStocks as Record<string, unknown>).reduce<number>((sum, value) => {
    const qty = Number(value);
    return sum + (Number.isFinite(qty) ? qty : 0);
  }, 0);
};

const mapProductRow = (row: any) => {
  const units = UNIT_INDEXES.map((index) => {
    const widthMm = toNullableNumber(row[`sto_birim${index}_en`]) || 0;
    const lengthMm = toNullableNumber(row[`sto_birim${index}_boy`]) || 0;
    const heightMm = toNullableNumber(row[`sto_birim${index}_yukseklik`]) || 0;
    return {
      index,
      name: normalizeText(row[`sto_birim${index}_ad`]),
      factor: toNullableNumber(row[`sto_birim${index}_katsayi`]) || 0,
      weightKg: toNullableNumber(row[`sto_birim${index}_agirlik`]) || 0,
      widthMm,
      lengthMm,
      heightMm,
      tareKg: toNullableNumber(row[`sto_birim${index}_dara`]) || 0,
      m3: calcM3(widthMm, lengthMm, heightMm),
      desi: calcDesi(widthMm, lengthMm, heightMm),
    };
  });

  return {
    productCode: normalizeText(row.sto_kod),
    productName: normalizeText(row.sto_isim),
    shelfCode: normalizeText(row.sto_reyon_kodu),
    shelfName: normalizeText(row.reyon_adi),
    imageUrl: null as string | null,
    stockQuantity: 0,
    hasStock: false,
    warehouseStocks: {} as Record<string, number>,
    units,
  };
};

class ProductDimensionsService {
  private async enrichProducts(products: ReturnType<typeof mapProductRow>[]) {
    const codes = [...new Set(products.map((product) => product.productCode).filter(Boolean))];
    if (codes.length === 0) return products;

    const localProducts = await prisma.product.findMany({
      where: { mikroCode: { in: codes } },
      select: {
        mikroCode: true,
        name: true,
        imageUrl: true,
        warehouseStocks: true,
      },
    });
    const localByCode = new Map(localProducts.map((product) => [product.mikroCode, product]));

    return products.map((product) => {
      const local = localByCode.get(product.productCode);
      const warehouseStocks = ((local?.warehouseStocks || {}) as Record<string, number>) || {};
      const stockQuantity = sumWarehouseStocks(warehouseStocks);
      return {
        ...product,
        productName: normalizeText(local?.name) || product.productName,
        imageUrl: local?.imageUrl || null,
        warehouseStocks,
        stockQuantity,
        hasStock: stockQuantity > 0,
      };
    });
  }

  private productSelectSql() {
    return `
      SELECT
        s.sto_kod,
        s.sto_isim,
        s.sto_reyon_kodu,
        r.ryn_ismi as reyon_adi,
        ${UNIT_INDEXES.map((index) => `
        s.sto_birim${index}_ad,
        s.sto_birim${index}_katsayi,
        s.sto_birim${index}_agirlik,
        s.sto_birim${index}_en,
        s.sto_birim${index}_boy,
        s.sto_birim${index}_yukseklik,
        s.sto_birim${index}_dara`).join(',')}
      FROM STOKLAR s WITH (NOLOCK)
      LEFT JOIN STOK_REYONLARI r WITH (NOLOCK)
        ON r.ryn_kod = s.sto_reyon_kodu
    `;
  }

  async searchProducts(search: string, limit = 30) {
    const normalized = normalizeText(search);
    if (normalized.length < 2) return [];
    const safe = escapeSql(normalized);
    const safeLimit = Math.min(Math.max(Math.trunc(limit) || 30, 1), 100);

    const rows = await mikroService.executeQuery(`
      ${this.productSelectSql()}
      WHERE ISNULL(s.sto_pasif_fl, 0) = 0
        AND (
          s.sto_kod LIKE N'%${safe}%'
          OR s.sto_isim LIKE N'%${safe}%'
        )
      ORDER BY
        CASE WHEN s.sto_kod = N'${safe}' THEN 0 WHEN s.sto_kod LIKE N'${safe}%' THEN 1 ELSE 2 END,
        s.sto_kod
      OFFSET 0 ROWS FETCH NEXT ${safeLimit} ROWS ONLY
    `);

    return this.enrichProducts(rows.map(mapProductRow));
  }

  async getProduct(productCode: string) {
    const code = normalizeText(productCode);
    if (!code) throw new Error('Urun kodu gerekli');

    const rows = await mikroService.executeQuery(`
      ${this.productSelectSql()}
      WHERE s.sto_kod = N'${escapeSql(code)}'
    `);

    if (!rows[0]) {
      throw new Error('Urun bulunamadi');
    }

    const [product] = await this.enrichProducts([mapProductRow(rows[0])]);
    return product;
  }

  async searchShelves(search: string, limit = 1000) {
    const normalized = normalizeText(search);
    const safe = escapeSql(normalized);
    const safeLimit = Math.min(Math.max(Math.trunc(limit) || 1000, 1), 5000);

    const where = normalized
      ? `AND (ryn_kod LIKE N'%${safe}%' OR ryn_ismi LIKE N'%${safe}%')`
      : '';

    const rows = await mikroService.executeQuery(`
      SELECT TOP ${safeLimit}
        ryn_kod as code,
        ryn_ismi as name
      FROM STOK_REYONLARI WITH (NOLOCK)
      WHERE ISNULL(ryn_iptal, 0) = 0
        ${where}
      ORDER BY ryn_kod
    `);

    return rows.map((row: any) => ({
      code: normalizeText(row.code),
      name: normalizeText(row.name),
    }));
  }

  async getMissingProducts(params: { search?: string; limit?: number }) {
    const safeLimit = Math.min(Math.max(Math.trunc(params.limit || 100), 1), 500);
    const search = normalizeText(params.search);
    const searchClause = search
      ? `AND (s.sto_kod LIKE N'%${escapeSql(search)}%' OR s.sto_isim LIKE N'%${escapeSql(search)}%')`
      : '';

    const rows = await mikroService.executeQuery(`
      ${this.productSelectSql()}
      WHERE ISNULL(s.sto_pasif_fl, 0) = 0
        AND s.sto_kod LIKE N'B%'
        ${searchClause}
        AND (
          NULLIF(LTRIM(RTRIM(ISNULL(s.sto_reyon_kodu, ''))), '') IS NULL
          OR ${UNIT_INDEXES.map((index) => `(
            NULLIF(LTRIM(RTRIM(ISNULL(s.sto_birim${index}_ad, ''))), '') IS NOT NULL
            AND (
              ISNULL(s.sto_birim${index}_agirlik, 0) <= 0
              OR ISNULL(s.sto_birim${index}_en, 0) <= 0
              OR ISNULL(s.sto_birim${index}_boy, 0) <= 0
              OR ISNULL(s.sto_birim${index}_yukseklik, 0) <= 0
            )
          )`).join(' OR ')}
        )
      ORDER BY s.sto_kod
      OFFSET 0 ROWS FETCH NEXT ${safeLimit} ROWS ONLY
    `);

    const products = await this.enrichProducts(rows.map(mapProductRow));
    return products.map((product: any) => {
      const missing: string[] = [];
      if (!product.shelfCode) missing.push('Raf/Reyon kodu eksik');
      product.units.forEach((unit: any) => {
        if (!unit.name) return;
        if (!unit.weightKg) missing.push(`${unit.index}. birim kg eksik`);
        if (!unit.widthMm || !unit.lengthMm || !unit.heightMm) {
          missing.push(`${unit.index}. birim olcu eksik`);
        }
      });
      return { ...product, missing };
    });
  }

  private validatePayload(payload: UpdatePayload) {
    const units = Array.isArray(payload.units) ? payload.units : [];
    units.forEach((unit) => {
      if (!UNIT_INDEXES.includes(unit.index as any)) {
        throw new Error('Gecersiz birim sirasi');
      }
      const name = normalizeText(unit.name);
      const factor = toNullableNumber(unit.factor);
      const weightKg = toNullableNumber(unit.weightKg);
      const widthMm = toNullableNumber(unit.widthMm);
      const lengthMm = toNullableNumber(unit.lengthMm);
      const heightMm = toNullableNumber(unit.heightMm);
      if (name.length > 10) throw new Error(`${unit.index}. birim adi 10 karakterden uzun olamaz`);
      if (factor !== null && factor === 0) throw new Error(`${unit.index}. birim katsayisi 0 olamaz`);
      if (weightKg !== null && weightKg < 0) throw new Error(`${unit.index}. birim kg negatif olamaz`);
      if ([widthMm, lengthMm, heightMm].some((value) => value !== null && value < 0)) {
        throw new Error(`${unit.index}. birim olculeri negatif olamaz`);
      }
      const dimensionValues = [widthMm, lengthMm, heightMm].filter((value) => value !== null && value > 0);
      if (dimensionValues.length > 0 && dimensionValues.length < 3) {
        throw new Error(`${unit.index}. birim icin en, boy ve yukseklik birlikte girilmeli`);
      }
      if (dimensionValues.some((value) => value !== null && value > 10000)) {
        throw new Error(`${unit.index}. birim olculeri cok yuksek gorunuyor`);
      }
      if (weightKg !== null && weightKg > 10000) throw new Error(`${unit.index}. birim kg cok yuksek gorunuyor`);
    });
  }

  async updateProduct(productCode: string, payload: UpdatePayload, userId?: string | null) {
    const code = normalizeText(productCode);
    if (!code) throw new Error('Urun kodu gerekli');
    this.validatePayload(payload);

    const oldProduct = await this.getProduct(code);
    const assignments: string[] = [];

    const shelfCode = payload.shelfCode === undefined ? undefined : normalizeText(payload.shelfCode);
    if (shelfCode !== undefined) {
      if (shelfCode) {
        const shelves = await mikroService.executeQuery(`
          SELECT TOP 1 ryn_kod FROM STOK_REYONLARI WITH (NOLOCK)
          WHERE ISNULL(ryn_iptal, 0) = 0
            AND ryn_kod = N'${escapeSql(shelfCode)}'
        `);
        if (!shelves[0]) throw new Error('Secilen raf/reyon kodu Mikroda bulunamadi');
      }
      assignments.push(`sto_reyon_kodu = N'${escapeSql(shelfCode)}'`);
    }

    const units = Array.isArray(payload.units) ? payload.units : [];
    units.forEach((unit) => {
      const index = unit.index;
      const name = normalizeText(unit.name);
      assignments.push(`sto_birim${index}_ad = N'${escapeSql(name)}'`);
      assignments.push(`sto_birim${index}_katsayi = ${toSqlNumber(toNullableNumber(unit.factor))}`);
      assignments.push(`sto_birim${index}_agirlik = ${toSqlNumber(toNullableNumber(unit.weightKg))}`);
      assignments.push(`sto_birim${index}_en = ${toSqlNumber(toNullableNumber(unit.widthMm))}`);
      assignments.push(`sto_birim${index}_boy = ${toSqlNumber(toNullableNumber(unit.lengthMm))}`);
      assignments.push(`sto_birim${index}_yukseklik = ${toSqlNumber(toNullableNumber(unit.heightMm))}`);
    });

    if (assignments.length === 0) {
      return oldProduct;
    }

    assignments.push('sto_degisti = 1');
    assignments.push('sto_lastup_date = GETDATE()');

    await mikroService.executeQuery(`
      UPDATE STOKLAR
      SET ${assignments.join(',\n          ')}
      WHERE sto_kod = N'${escapeSql(code)}'
    `);

    const newProduct = await this.getProduct(code);
    const user = userId
      ? await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
      : null;

    await prisma.productDimensionChangeLog.create({
      data: {
        productCode: code,
        productName: newProduct.productName,
        changedById: userId || null,
        changedByName: user?.name || null,
        oldValues: oldProduct as any,
        newValues: newProduct as any,
      },
    });

    return newProduct;
  }

  async getHistory(productCode: string) {
    const code = normalizeText(productCode);
    if (!code) return [];
    return prisma.productDimensionChangeLog.findMany({
      where: { productCode: code },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }
}

export default new ProductDimensionsService();
