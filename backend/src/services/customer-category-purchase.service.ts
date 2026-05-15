import mikroService from './mikroFactory.service';

export type CategoryLastPurchaseInfo = {
  categoryCode: string;
  categoryName: string | null;
  lastPurchaseDate: string | Date | null;
  monthsSinceLastPurchase: number | null;
};

type ProductCategoryLike = {
  mikroCode?: string | null;
  category?: {
    mikroCode?: string | null;
    name?: string | null;
  } | null;
};

const normalizeCode = (value: unknown) => String(value || '').trim().toUpperCase();

const escapeSqlLiteral = (value: string) => String(value || '').replace(/'/g, "''");

const rowsFromMikro = (result: unknown): any[] => (Array.isArray(result) ? result : []);

const monthsSince = (value: unknown) => {
  if (!value) return null;
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) return null;
  const diffDays = Math.max(0, (Date.now() - date.getTime()) / 86_400_000);
  return Math.round((diffDays / 30.4375) * 10) / 10;
};

const buildSqlList = (values: string[]) =>
  Array.from(new Set(values.map(normalizeCode).filter(Boolean)))
    .map((value) => `N'${escapeSqlLiteral(value)}'`)
    .join(',');

class CustomerCategoryPurchaseService {
  async getCategoryLastPurchases(
    customerCode: string,
    categoryCodes?: string[]
  ): Promise<Map<string, CategoryLastPurchaseInfo>> {
    const cariCode = normalizeCode(customerCode);
    if (!cariCode) return new Map();

    const safeCategoryList = categoryCodes?.length ? buildSqlList(categoryCodes) : '';
    const categoryFilter = safeCategoryList
      ? `AND LTRIM(RTRIM(ISNULL(st.sto_kategori_kodu, ''))) IN (${safeCategoryList})`
      : '';

    try {
      const rows = rowsFromMikro(await mikroService.executeQuery(`
        SELECT
          LTRIM(RTRIM(ISNULL(st.sto_kategori_kodu, ''))) AS categoryCode,
          MAX(NULLIF(LTRIM(RTRIM(ISNULL(ktg.ktg_isim, ''))), '')) AS categoryName,
          MAX(sth.sth_tarih) AS lastPurchaseDate
        FROM STOK_HAREKETLERI sth WITH (NOLOCK)
        INNER JOIN STOKLAR st WITH (NOLOCK) ON st.sto_kod = sth.sth_stok_kod
        LEFT JOIN STOK_KATEGORILERI ktg WITH (NOLOCK) ON ktg.ktg_kod = st.sto_kategori_kodu
        WHERE LTRIM(RTRIM(sth.sth_cari_kodu)) = N'${escapeSqlLiteral(cariCode)}'
          AND ISNULL(sth.sth_tip, 0) = 1
          AND ISNULL(sth.sth_evraktip, 0) IN (1, 4)
          AND ISNULL(sth.sth_miktar, 0) > 0
          AND LTRIM(RTRIM(ISNULL(st.sto_kategori_kodu, ''))) <> ''
          ${categoryFilter}
        GROUP BY LTRIM(RTRIM(ISNULL(st.sto_kategori_kodu, '')))
      `));

      const map = new Map<string, CategoryLastPurchaseInfo>();
      rows.forEach((row) => {
        const categoryCode = normalizeCode(row.categoryCode);
        if (!categoryCode) return;
        const lastPurchaseDate = row.lastPurchaseDate || null;
        map.set(categoryCode, {
          categoryCode,
          categoryName: row.categoryName ? String(row.categoryName).trim() : null,
          lastPurchaseDate,
          monthsSinceLastPurchase: monthsSince(lastPurchaseDate),
        });
      });
      return map;
    } catch (error) {
      console.warn('Customer category last purchases failed', error);
      return new Map();
    }
  }

  async getProductCategoryLastPurchases(
    customerCode: string,
    products: ProductCategoryLike[]
  ): Promise<Map<string, CategoryLastPurchaseInfo>> {
    const productCategoryPairs = products
      .map((product) => ({
        productCode: normalizeCode(product.mikroCode),
        categoryCode: normalizeCode(product.category?.mikroCode),
        categoryName: product.category?.name ? String(product.category.name).trim() : null,
      }))
      .filter((row) => row.productCode && row.categoryCode);

    if (!productCategoryPairs.length) return new Map();

    const categoryMap = await this.getCategoryLastPurchases(
      customerCode,
      productCategoryPairs.map((row) => row.categoryCode)
    );

    const output = new Map<string, CategoryLastPurchaseInfo>();
    productCategoryPairs.forEach((row) => {
      const info = categoryMap.get(row.categoryCode);
      if (!info) return;
      output.set(row.productCode, {
        ...info,
        categoryName: info.categoryName || row.categoryName,
      });
    });
    return output;
  }
}

export default new CustomerCategoryPurchaseService();
