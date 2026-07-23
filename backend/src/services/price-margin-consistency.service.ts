import { prisma } from '../utils/prisma';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '../utils/search';
import {
  STANDARD_PRICE_LIST_DEFINITIONS,
  STANDARD_PRICE_LIST_NOS,
} from '../config/price-list-registry';
import mikroService from './mikro.service';

export type PriceMarginListStatus =
  | 'OK'
  | 'MISSING_COST'
  | 'MISSING_MARGIN'
  | 'MISSING_PRICE'
  | 'PRICE_MISMATCH'
  | 'DUPLICATE_PRICE';

export type PriceMarginIssueFilter =
  | 'ALL'
  | 'PROBLEM'
  | Exclude<PriceMarginListStatus, 'OK'>;

export interface PriceMarginListCheck {
  listNo: number;
  costType: 'T' | 'P';
  marginNo: number;
  baseCost: number | null;
  margin: number | null;
  expectedPrice: number | null;
  actualPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  priceRowCount: number;
  differenceAmount: number | null;
  differencePercent: number | null;
  status: PriceMarginListStatus;
}

export interface PriceMarginConsistencyRow {
  productCode: string;
  productName: string;
  categoryCode: string | null;
  categoryName: string | null;
  brandCode: string | null;
  mainSupplierCode: string | null;
  mainSupplierName: string | null;
  costP: number | null;
  costT: number | null;
  margins: Array<number | null>;
  listChecks: PriceMarginListCheck[];
  issueTypes: PriceMarginListStatus[];
  problemListCount: number;
  maxDifferenceAmount: number;
  maxDifferencePercent: number;
  isCompliant: boolean;
}

interface Snapshot {
  rows: PriceMarginConsistencyRow[];
  generatedAt: Date;
  stale: boolean;
  staleReason: string | null;
}

const REPORT_TOLERANCE = 0.005;
const CACHE_TTL_MS = 5 * 60 * 1000;
const STALE_RETRY_COOLDOWN_MS = 60 * 1000;

const parsePositiveNumber = (value: unknown): number | null => {
  const raw = String(value ?? '').trim().replace(',', '.');
  if (!raw) return null;
  const numberValue = Number(raw);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
};

const parseNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const round6 = (value: number) => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;

const normalizeCode = (value: unknown) => {
  const scalarValue = Array.isArray(value) ? value[0] : value;
  return String(scalarValue || '').trim().toUpperCase();
};

class PriceMarginConsistencyService {
  private snapshot: Snapshot | null = null;
  private loadingPromise: Promise<Snapshot> | null = null;
  private lastLoadAttemptAt = 0;

  private buildPriceAggregationColumns() {
    return STANDARD_PRICE_LIST_NOS
      .flatMap((listNo) => [
        `MAX(CASE WHEN sfiyat_listesirano = ${listNo} THEN CAST(sfiyat_fiyati AS float) END) AS price${listNo}`,
        `MIN(CASE WHEN sfiyat_listesirano = ${listNo} THEN CAST(sfiyat_fiyati AS float) END) AS minPrice${listNo}`,
        `MAX(CASE WHEN sfiyat_listesirano = ${listNo} THEN CAST(sfiyat_fiyati AS float) END) AS maxPrice${listNo}`,
        `COUNT(CASE WHEN sfiyat_listesirano = ${listNo} THEN 1 END) AS priceCount${listNo}`,
      ])
      .join(',\n          ');
  }

  private buildPriceSelectionColumns() {
    return STANDARD_PRICE_LIST_NOS
      .flatMap((listNo) => [
        `p.price${listNo}`,
        `p.minPrice${listNo}`,
        `p.maxPrice${listNo}`,
        `p.priceCount${listNo}`,
      ])
      .join(',\n        ');
  }

  private async loadFreshSnapshot(): Promise<Snapshot> {
    const requiredUserColumns = [
      'MaliyetP',
      'MaliyetT',
      'Marj_1',
      'Marj_2',
      'Marj_3',
      'Marj_4',
      'Marj_5',
      'Marj_6',
    ];
    const metadataRows = await mikroService.executeQuery(`
      SELECT COLUMN_NAME AS columnName
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = N'dbo'
        AND TABLE_NAME = N'STOKLAR_USER'
        AND COLUMN_NAME IN (${requiredUserColumns.map((column) => `N'${column}'`).join(', ')})
    `);
    const availableUserColumns = new Set(
      (metadataRows || [])
        .map((row: any) => String(row?.columnName ?? row?.COLUMN_NAME ?? '').trim().toLowerCase())
        .filter(Boolean)
    );
    const missingUserColumns = requiredUserColumns.filter(
      (column) => !availableUserColumns.has(column.toLowerCase())
    );
    if (missingUserColumns.length > 0) {
      throw new Error(
        `Fiyat-marj raporu calistirilamadi: Mikro STOKLAR_USER kolonlari eksik (${missingUserColumns.join(', ')}).`
      );
    }

    const priceColumns = this.buildPriceAggregationColumns();
    const priceSelectionColumns = this.buildPriceSelectionColumns();
    const mikroRowsPromise = mikroService.executeQuery(`
      WITH PriceRows AS (
        SELECT
          sfiyat_stokkod AS productCode,
          ${priceColumns}
        FROM STOK_SATIS_FIYAT_LISTELERI WITH (NOLOCK)
        WHERE sfiyat_listesirano IN (${STANDARD_PRICE_LIST_NOS.join(', ')})
          AND sfiyat_deposirano = 0
          AND sfiyat_doviz = 0
          AND sfiyat_odemeplan = 0
          AND sfiyat_iptal = 0
          AND ISNULL(sfiyat_hidden, 0) = 0
        GROUP BY sfiyat_stokkod
      )
      SELECT
        UPPER(RTRIM(s.sto_kod)) AS productCode,
        LTRIM(RTRIM(ISNULL(s.sto_isim, ''))) AS productName,
        LTRIM(RTRIM(ISNULL(s.sto_marka_kodu, ''))) AS brandCode,
        LTRIM(RTRIM(ISNULL(s.sto_sat_cari_kod, ''))) AS mainSupplierCode,
        LTRIM(RTRIM(ISNULL(c.cari_unvan1, ''))) AS mainSupplierName,
        u.MaliyetP AS costP,
        u.MaliyetT AS costT,
        u.Marj_1 AS margin1,
        u.Marj_2 AS margin2,
        u.Marj_3 AS margin3,
        u.Marj_4 AS margin4,
        u.Marj_5 AS margin5,
        u.Marj_6 AS margin6,
        ${priceSelectionColumns}
      FROM STOKLAR s WITH (NOLOCK)
      LEFT JOIN STOKLAR_USER u WITH (NOLOCK) ON s.sto_guid = u.Record_uid
      LEFT JOIN PriceRows p ON p.productCode = s.sto_kod
      LEFT JOIN CARI_HESAPLAR c WITH (NOLOCK)
        ON c.cari_kod = LTRIM(RTRIM(ISNULL(s.sto_sat_cari_kod, '')))
      WHERE ISNULL(s.sto_pasif_fl, 0) = 0
        AND LTRIM(RTRIM(ISNULL(s.sto_kod, ''))) <> ''
      ORDER BY s.sto_kod
    `);

    const productsPromise = prisma.product.findMany({
      where: { isBundle: false },
      select: {
        mikroCode: true,
        name: true,
        brandCode: true,
        category: { select: { mikroCode: true, name: true } },
      },
    });

    const [mikroRows, products] = await Promise.all([mikroRowsPromise, productsPromise]);
    const productByCode = new Map(
      products.map((product) => [normalizeCode(product.mikroCode), product])
    );

    const rows: PriceMarginConsistencyRow[] = (mikroRows || []).map((raw: any) => {
      const productCode = normalizeCode(raw?.productCode);
      const product = productByCode.get(productCode);
      const costP = parsePositiveNumber(raw?.costP);
      const costT = parsePositiveNumber(raw?.costT);
      const margins = Array.from({ length: 6 }, (_, index) =>
        parsePositiveNumber(raw?.[`margin${index + 1}`])
      );

      const listChecks: PriceMarginListCheck[] = STANDARD_PRICE_LIST_DEFINITIONS.map((definition) => {
        const listNo = definition.listNo;
        const marginNo = Number(definition.marginSlot);
        const costType: 'T' | 'P' = definition.costBasis === 'MALIYET_T' ? 'T' : 'P';
        const baseCost = costType === 'T' ? costT : costP;
        const margin = margins[marginNo - 1];
        const actualPrice = parseNullableNumber(raw?.[`price${listNo}`]);
        const minPrice = parseNullableNumber(raw?.[`minPrice${listNo}`]);
        const maxPrice = parseNullableNumber(raw?.[`maxPrice${listNo}`]);
        const priceRowCount = Math.max(0, Math.trunc(Number(raw?.[`priceCount${listNo}`]) || 0));
        const expectedPrice = baseCost && margin ? round6(baseCost * margin) : null;

        let status: PriceMarginListStatus = 'OK';
        if (!baseCost) status = 'MISSING_COST';
        else if (!margin) status = 'MISSING_MARGIN';
        else if (!actualPrice || priceRowCount === 0) status = 'MISSING_PRICE';
        else if (priceRowCount > 1) status = 'DUPLICATE_PRICE';
        else if (expectedPrice !== null && Math.abs(actualPrice - expectedPrice) > REPORT_TOLERANCE) {
          status = 'PRICE_MISMATCH';
        }

        const differenceAmount =
          expectedPrice !== null && actualPrice !== null
            ? round6(actualPrice - expectedPrice)
            : null;
        const differencePercent =
          differenceAmount !== null && expectedPrice && expectedPrice > 0
            ? (differenceAmount / expectedPrice) * 100
            : null;

        return {
          listNo,
          costType,
          marginNo,
          baseCost,
          margin,
          expectedPrice,
          actualPrice,
          minPrice,
          maxPrice,
          priceRowCount,
          differenceAmount,
          differencePercent,
          status,
        };
      });

      const issueTypes = Array.from(
        new Set(listChecks.map((check) => check.status).filter((status) => status !== 'OK'))
      ) as PriceMarginListStatus[];
      const differences = listChecks
        .map((check) => Math.abs(Number(check.differenceAmount || 0)))
        .filter(Number.isFinite);
      const differencePercents = listChecks
        .map((check) => Math.abs(Number(check.differencePercent || 0)))
        .filter(Number.isFinite);

      return {
        productCode,
        productName: String(product?.name || raw?.productName || productCode).trim(),
        categoryCode: product?.category?.mikroCode || null,
        categoryName: product?.category?.name || null,
        brandCode: String(product?.brandCode || raw?.brandCode || '').trim() || null,
        mainSupplierCode: String(raw?.mainSupplierCode || '').trim() || null,
        mainSupplierName: String(raw?.mainSupplierName || '').trim() || null,
        costP,
        costT,
        margins,
        listChecks,
        issueTypes,
        problemListCount: listChecks.filter((check) => check.status !== 'OK').length,
        maxDifferenceAmount: differences.length > 0 ? Math.max(...differences) : 0,
        maxDifferencePercent: differencePercents.length > 0 ? Math.max(...differencePercents) : 0,
        isCompliant: issueTypes.length === 0,
      };
    });

    return {
      rows,
      generatedAt: new Date(),
      stale: false,
      staleReason: null,
    };
  }

  private async getSnapshot(forceRefresh = false): Promise<Snapshot> {
    if (
      !forceRefresh &&
      this.snapshot &&
      (
        Date.now() - this.snapshot.generatedAt.getTime() < CACHE_TTL_MS ||
        (this.snapshot.stale && Date.now() - this.lastLoadAttemptAt < STALE_RETRY_COOLDOWN_MS)
      )
    ) {
      return this.snapshot;
    }

    if (this.loadingPromise) return this.loadingPromise;

    const previousSnapshot = this.snapshot;
    this.lastLoadAttemptAt = Date.now();
    this.loadingPromise = this.loadFreshSnapshot()
      .then((snapshot) => {
        this.snapshot = snapshot;
        return snapshot;
      })
      .catch((error: any) => {
        if (!previousSnapshot) throw error;
        const staleSnapshot = {
          ...previousSnapshot,
          stale: true,
          staleReason: String(error?.message || 'Canli Mikro verisi yenilenemedi.'),
        };
        this.snapshot = staleSnapshot;
        return staleSnapshot;
      })
      .finally(() => {
        this.loadingPromise = null;
      });

    return this.loadingPromise;
  }

  async getReport(options: {
    search?: string;
    issueType?: PriceMarginIssueFilter;
    category?: string;
    brand?: string;
    supplier?: string;
    listNo?: number;
    minDifferenceAmount?: number;
    minDifferencePercent?: number;
    sortBy?: 'maxDifferenceAmount' | 'maxDifferencePercent' | 'problemListCount' | 'productCode' | 'productName';
    sortOrder?: 'asc' | 'desc';
    page?: number;
    limit?: number;
    forceRefresh?: boolean;
  } = {}) {
    const snapshot = await this.getSnapshot(Boolean(options.forceRefresh));
    const issueType = options.issueType || 'PROBLEM';
    const selectedListNo = Number(options.listNo || 0);
    const searchTokens = buildSearchTokens(options.search || '');
    const category = normalizeSearchText(options.category || '');
    const brand = normalizeSearchText(options.brand || '');
    const supplier = normalizeSearchText(options.supplier || '');
    const minDifferenceAmount = Math.max(0, Number(options.minDifferenceAmount || 0));
    const minDifferencePercent = Math.max(0, Number(options.minDifferencePercent || 0));

    let filteredRows = snapshot.rows.filter((row) => {
      if (searchTokens.length > 0) {
        const haystack = normalizeSearchText(
          `${row.productCode} ${row.productName} ${row.categoryCode || ''} ${row.categoryName || ''} ${row.brandCode || ''} ${row.mainSupplierCode || ''} ${row.mainSupplierName || ''}`
        );
        if (!matchesSearchTokens(haystack, searchTokens)) return false;
      }
      if (category && normalizeSearchText(row.categoryName || row.categoryCode || '') !== category) return false;
      if (brand && normalizeSearchText(row.brandCode || '') !== brand) return false;
      if (
        supplier &&
        normalizeSearchText(`${row.mainSupplierCode || ''} ${row.mainSupplierName || ''}`) !== supplier
      ) return false;

      const checks = STANDARD_PRICE_LIST_NOS.includes(selectedListNo as any)
        ? row.listChecks.filter((check) => check.listNo === selectedListNo)
        : row.listChecks;
      if (issueType === 'PROBLEM' && !checks.some((check) => check.status !== 'OK')) return false;
      if (issueType !== 'ALL' && issueType !== 'PROBLEM' && !checks.some((check) => check.status === issueType)) {
        return false;
      }
      if (
        minDifferenceAmount > 0 &&
        !checks.some((check) => Math.abs(Number(check.differenceAmount || 0)) >= minDifferenceAmount)
      ) return false;
      if (
        minDifferencePercent > 0 &&
        !checks.some((check) => Math.abs(Number(check.differencePercent || 0)) >= minDifferencePercent)
      ) return false;
      return true;
    });

    const sortBy = options.sortBy || 'maxDifferenceAmount';
    const direction = options.sortOrder === 'asc' ? 1 : -1;
    filteredRows = [...filteredRows].sort((a, b) => {
      if (sortBy === 'productCode' || sortBy === 'productName') {
        return direction * String(a[sortBy] || '').localeCompare(String(b[sortBy] || ''), 'tr', { numeric: true });
      }
      return direction * (Number(a[sortBy] || 0) - Number(b[sortBy] || 0));
    });

    const page = Math.max(1, Math.trunc(Number(options.page || 1)));
    const limit = Math.max(10, Math.min(1000, Math.trunc(Number(options.limit || 50))));
    const totalRecords = filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(totalRecords / limit));
    const safePage = Math.min(page, totalPages);
    const rows = filteredRows.slice((safePage - 1) * limit, safePage * limit);

    const allRows = snapshot.rows;
    const hasIssue = (row: PriceMarginConsistencyRow, status: PriceMarginListStatus) =>
      row.issueTypes.includes(status);
    const uniqueOptions = (values: Array<string | null>) =>
      Array.from(new Set(values.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }));

    return {
      rows,
      summary: {
        totalProducts: allRows.length,
        compliantProducts: allRows.filter((row) => row.isCompliant).length,
        problemProducts: allRows.filter((row) => !row.isCompliant).length,
        priceMismatchProducts: allRows.filter((row) => hasIssue(row, 'PRICE_MISMATCH')).length,
        missingMarginProducts: allRows.filter((row) => hasIssue(row, 'MISSING_MARGIN')).length,
        missingPriceProducts: allRows.filter((row) => hasIssue(row, 'MISSING_PRICE')).length,
        missingCostProducts: allRows.filter((row) => hasIssue(row, 'MISSING_COST')).length,
        duplicatePriceProducts: allRows.filter((row) => hasIssue(row, 'DUPLICATE_PRICE')).length,
        filteredProducts: totalRecords,
      },
      pagination: {
        page: safePage,
        limit,
        totalRecords,
        totalPages,
      },
      options: {
        categories: uniqueOptions(allRows.map((row) => row.categoryName || row.categoryCode)),
        brands: uniqueOptions(allRows.map((row) => row.brandCode)),
        suppliers: uniqueOptions(
          allRows.map((row) =>
            row.mainSupplierCode
              ? `${row.mainSupplierCode}${row.mainSupplierName ? ` - ${row.mainSupplierName}` : ''}`
              : null
          )
        ),
      },
      metadata: {
        generatedAt: snapshot.generatedAt,
        stale: snapshot.stale,
        staleReason: snapshot.staleReason,
        cacheTtlSeconds: CACHE_TTL_MS / 1000,
        tolerance: REPORT_TOLERANCE,
        source: 'MIKRO_LIVE',
      },
    };
  }
}

export default new PriceMarginConsistencyService();
