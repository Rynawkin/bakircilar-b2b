import crypto from 'crypto';
import * as sql from 'mssql';
import config from '../config';
import { AppError, ErrorCode } from '../types/errors';
import {
  MANAGEMENT_PROFIT_REPORT_ROW_FIELDS,
  ManagementProfitReportLayout,
  ManagementProfitReportPathItem,
} from '../utils/management-profit-report-layout';

type Period = {
  startDate: string;
  endDate: string;
};

export type ManagementProfitReportNode = {
  id: string;
  label: string;
  value: string;
  level: number;
  path: ManagementProfitReportPathItem[];
  amounts: Record<string, number>;
  grandTotal: number;
  hasChildren: boolean;
};

export type ManagementProfitReportQueryResult = {
  nodes: ManagementProfitReportNode[];
  months: Array<{ key: string; label: string }>;
  grandTotal: number;
};

type QueryInput = {
  period: Period;
  layout: ManagementProfitReportLayout;
  path: ManagementProfitReportPathItem[];
};

type AggregateRow = {
  dimension_value?: unknown;
  month_key?: unknown;
  amount?: unknown;
};

// Live TVF definition:
// msg_S_1219 = SATIŞ TUTARI, msg_S_0189 = TOPLAM İSKONTO.
export const MANAGEMENT_PROFIT_REPORT_SALES_AMOUNT_COLUMN = 'msg_S_1219';

const REQUIRED_LIVE_COLUMNS = [
  'CARİ SEKTÖR KODU',
  'msg_S_0136',
  'msg_S_0201',
  'msg_S_0199',
  'msg_S_0089',
  MANAGEMENT_PROFIT_REPORT_SALES_AMOUNT_COLUMN,
] as const;

const MAX_AGGREGATE_ROWS = 10_000;
const UNDEFINED_LABEL = 'Tanımsız';
const QUERY_CACHE_TTL_MS = 30_000;
const QUERY_CACHE_MAX_ENTRIES = 200;
const MAX_CONCURRENT_LIVE_QUERIES = 3;

const sqlDate = (date: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new AppError('Rapor tarihi geçersiz.', 400, ErrorCode.VALIDATION_ERROR);
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
};

const monthLabel = (monthKey: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return monthKey;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  const month = new Intl.DateTimeFormat('tr-TR', {
    month: 'long',
    timeZone: 'UTC',
  }).format(date);
  return `${Number(match[1])}-${Number(match[2])} ${month.charAt(0).toUpperCase()}${month.slice(1)}`;
};

const normalizedDimensionSql = (column: string) =>
  `COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(250), source.${column}))), N''), N'${UNDEFINED_LABEL}')`;

const nodeId = (path: ManagementProfitReportPathItem[]) =>
  crypto.createHash('sha256').update(JSON.stringify(path)).digest('base64url').slice(0, 24);

const foldRows = (
  rows: AggregateRow[],
  input: QueryInput
): ManagementProfitReportQueryResult => {
  if (rows.length > MAX_AGGREGATE_ROWS) {
    throw new AppError(
      'Bu kırılım çok fazla satır üretti. Önce daha dar bir üst kırılım seçin.',
      413,
      ErrorCode.VALIDATION_ERROR,
      { reportAccessCode: 'REPORT_RESULT_TOO_LARGE' }
    );
  }

  const nextField = input.layout.rowFields[input.path.length];
  const level = input.path.length;
  const byValue = new Map<string, ManagementProfitReportNode>();
  const months = new Set<string>();

  for (const row of rows) {
    const value = String(row.dimension_value || UNDEFINED_LABEL).trim() || UNDEFINED_LABEL;
    const monthKey = String(row.month_key || '').trim();
    if (!/^\d{4}-\d{2}$/.test(monthKey)) continue;
    const numeric = Number(row.amount);
    const amount = Number.isFinite(numeric) ? numeric : 0;
    months.add(monthKey);

    let node = byValue.get(value);
    if (!node) {
      const path = [...input.path, { field: nextField, value }];
      node = {
        id: nodeId(path),
        label: value,
        value,
        level,
        path,
        amounts: {},
        grandTotal: 0,
        hasChildren: path.length < input.layout.rowFields.length,
      };
      byValue.set(value, node);
    }
    node.amounts[monthKey] = (node.amounts[monthKey] || 0) + amount;
    node.grandTotal += amount;
  }

  const nodes = Array.from(byValue.values());
  const trCompare = (left: string, right: string) =>
    left.localeCompare(right, 'tr-TR', { sensitivity: 'base', numeric: true });
  nodes.sort((left, right) => {
    switch (input.layout.sort) {
      case 'TOTAL_ASC':
        return left.grandTotal - right.grandTotal || trCompare(left.label, right.label);
      case 'LABEL_ASC':
        return trCompare(left.label, right.label);
      case 'LABEL_DESC':
        return trCompare(right.label, left.label);
      case 'TOTAL_DESC':
      default:
        return right.grandTotal - left.grandTotal || trCompare(left.label, right.label);
    }
  });

  const monthList = Array.from(months)
    .sort()
    .map((key) => ({ key, label: monthLabel(key) }));

  return {
    nodes,
    months: monthList,
    grandTotal: nodes.reduce((total, node) => total + node.grandTotal, 0),
  };
};

const MOCK_ROWS: Array<
  Record<keyof typeof MANAGEMENT_PROFIT_REPORT_ROW_FIELDS, string> & {
    amount: number;
  }
> = [
  {
    CUSTOMER_SECTOR_CODE: 'SATIS',
    GROUP_NAME: 'Temizlik',
    CUSTOMER_NAME: 'Örnek Cari A',
    STOCK: 'Örnek Stok 1',
    amount: 128450.75,
  },
  {
    CUSTOMER_SECTOR_CODE: 'SATIS',
    GROUP_NAME: 'Temizlik',
    CUSTOMER_NAME: 'Örnek Cari A',
    STOCK: 'Örnek Stok 2',
    amount: 74230.25,
  },
  {
    CUSTOMER_SECTOR_CODE: 'PROJE',
    GROUP_NAME: 'Kağıt',
    CUSTOMER_NAME: 'Örnek Cari B',
    STOCK: 'Örnek Stok 3',
    amount: 93500,
  },
];

class ManagementProfitReportMikroService {
  private pool: sql.ConnectionPool | null = null;
  private connectPromise: Promise<sql.ConnectionPool> | null = null;
  private contractVerified = false;
  private liveQueryCount = 0;
  private queryCache = new Map<
    string,
    { expiresAt: number; result: ManagementProfitReportQueryResult }
  >();
  private pendingQueries = new Map<
    string,
    Promise<ManagementProfitReportQueryResult>
  >();

  private assertProductionIsLive() {
    if (config.nodeEnv === 'production' && config.useMockMikro) {
      throw new AppError(
        'Production ortamında örnek Mikro raporu kullanılamaz.',
        503,
        ErrorCode.REPORT_DATA_NOT_READY,
        { reportAccessCode: 'MIKRO_REPORT_MOCK_FORBIDDEN' }
      );
    }
  }

  private async connect() {
    if (this.pool?.connected) return this.pool;
    if (this.connectPromise) return this.connectPromise;

    const {
      usesDedicatedCredentials,
      allowSharedCredentials,
      ...connectionConfig
    } = config.managementProfitReportMikro;
    if (
      config.nodeEnv === 'production'
      && !usesDedicatedCredentials
      && !allowSharedCredentials
    ) {
      throw new AppError(
        'Yönetim raporu için salt okunur Mikro hesabı yapılandırılmadı.',
        503,
        ErrorCode.REPORT_DATA_NOT_READY,
        { reportAccessCode: 'MIKRO_REPORT_READ_ONLY_ACCOUNT_REQUIRED' }
      );
    }

    const nextPool = new sql.ConnectionPool(connectionConfig);
    nextPool.on('error', () => {
      if (this.pool === nextPool) this.pool = null;
      this.contractVerified = false;
    });
    this.connectPromise = nextPool
      .connect()
      .then(() => {
        this.pool = nextPool;
        return nextPool;
      })
      .finally(() => {
        this.connectPromise = null;
      });
    return this.connectPromise;
  }

  private async verifyLiveContract(pool: sql.ConnectionPool) {
    if (this.contractVerified) return;
    // TOP (0) compiles the exact allowlisted projection without reading a
    // business row and works with a narrowly granted SELECT-only principal.
    const projection = REQUIRED_LIVE_COLUMNS.map((column) =>
      `[${column.replace(/]/g, ']]')}]`
    ).join(', ');
    const request = pool.request();
    request.input('contractStartDate', sql.DateTime, new Date(Date.UTC(2000, 0, 1)));
    request.input('contractEndDate', sql.DateTime, new Date(Date.UTC(2000, 0, 1)));
    request.input('contractCurrencyMode', sql.TinyInt, 0);
    request.input('contractIncludeDeliveryNotes', sql.Bit, true);
    try {
      await request.query(`
        SELECT TOP (0) ${projection}
        FROM dbo.STOK_MUSTERI_GRUP_SATIS_KARLILIK_KUPU(
          @contractStartDate,
          @contractEndDate,
          @contractCurrencyMode,
          @contractIncludeDeliveryNotes
        )
      `);
    } catch (error) {
      console.error('Management profit report Mikro contract mismatch', {
        message: error instanceof Error ? error.message : String(error),
      });
      throw new AppError(
        'Mikro rapor sözleşmesi doğrulanamadı.',
        503,
        ErrorCode.REPORT_DATA_NOT_READY,
        { reportAccessCode: 'MIKRO_REPORT_CONTRACT_MISMATCH' }
      );
    }
    this.contractVerified = true;
  }

  private mockQuery(input: QueryInput) {
    const nextField = input.layout.rowFields[input.path.length];
    const monthKey = input.period.startDate.slice(0, 7);
    const filtered = MOCK_ROWS.filter((row) =>
      input.path.every((item) => row[item.field] === item.value)
    );
    const totals = new Map<string, number>();
    for (const row of filtered) {
      const value = row[nextField] || UNDEFINED_LABEL;
      totals.set(value, (totals.get(value) || 0) + row.amount);
    }
    return foldRows(
      Array.from(totals.entries()).map(([dimension_value, amount]) => ({
        dimension_value,
        month_key: monthKey,
        amount,
      })),
      input
    );
  }

  async assertReady() {
    this.assertProductionIsLive();
    if (config.useMockMikro) return;
    const pool = await this.connect();
    await this.verifyLiveContract(pool);
  }

  private async queryLive(
    input: QueryInput
  ): Promise<ManagementProfitReportQueryResult> {
    const pool = await this.connect();
    await this.verifyLiveContract(pool);

    const nextField = input.layout.rowFields[input.path.length];
    const nextColumn = MANAGEMENT_PROFIT_REPORT_ROW_FIELDS[nextField].sqlColumn;
    const nextExpression = normalizedDimensionSql(nextColumn);
    const filters = input.path
      .map((item, index) => {
        const column = MANAGEMENT_PROFIT_REPORT_ROW_FIELDS[item.field].sqlColumn;
        return `${normalizedDimensionSql(column)} = @path${index}`;
      })
      .join('\n        AND ');
    const whereFilters = filters ? `AND ${filters}` : '';

    const query = `
      WITH report_rows AS (
        SELECT
          ${nextExpression} AS dimension_value,
          CONVERT(char(7), TRY_CONVERT(date, source.[msg_S_0089]), 120) AS month_key,
          TRY_CONVERT(
            decimal(38, 4),
            source.[${MANAGEMENT_PROFIT_REPORT_SALES_AMOUNT_COLUMN}]
          ) AS amount
        FROM dbo.STOK_MUSTERI_GRUP_SATIS_KARLILIK_KUPU(
          @startDate,
          @endDate,
          @currencyMode,
          @includeDeliveryNotes
        ) AS source
        WHERE 1 = 1
          ${whereFilters}
      )
      SELECT TOP (${MAX_AGGREGATE_ROWS + 1})
        dimension_value,
        month_key,
        SUM(COALESCE(amount, 0)) AS amount
      FROM report_rows
      WHERE month_key IS NOT NULL
      GROUP BY dimension_value, month_key
      ORDER BY dimension_value, month_key
    `;

    const request = pool.request();
    request.input('startDate', sql.DateTime, sqlDate(input.period.startDate));
    request.input('endDate', sql.DateTime, sqlDate(input.period.endDate));
    request.input('currencyMode', sql.TinyInt, 0);
    request.input('includeDeliveryNotes', sql.Bit, true);
    input.path.forEach((item, index) => {
      request.input(`path${index}`, sql.NVarChar(250), item.value);
    });

    try {
      const result = await request.query(query);
      return foldRows(result.recordset, input);
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('Management profit report Mikro query failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      throw new AppError(
        'Satış raporu şu anda Mikro’dan alınamıyor.',
        503,
        ErrorCode.MIKRO_CONNECTION_ERROR,
        { reportAccessCode: 'MIKRO_REPORT_UNAVAILABLE' }
      );
    }
  }

  async query(input: QueryInput): Promise<ManagementProfitReportQueryResult> {
    this.assertProductionIsLive();
    if (config.useMockMikro) return this.mockQuery(input);

    const cacheKey = crypto
      .createHash('sha256')
      .update(JSON.stringify(input))
      .digest('base64url');
    const now = Date.now();
    const cached = this.queryCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.result;
    if (cached) this.queryCache.delete(cacheKey);

    const pending = this.pendingQueries.get(cacheKey);
    if (pending) return pending;
    if (this.liveQueryCount >= MAX_CONCURRENT_LIVE_QUERIES) {
      throw new AppError(
        'Rapor servisi şu anda yoğun. Lütfen kısa süre sonra tekrar deneyin.',
        429,
        ErrorCode.REPORT_DATA_NOT_READY,
        { reportAccessCode: 'MIKRO_REPORT_BUSY' }
      );
    }

    this.liveQueryCount += 1;
    const next = this.queryLive(input)
      .then((result) => {
        if (this.queryCache.size >= QUERY_CACHE_MAX_ENTRIES) {
          const oldestKey = this.queryCache.keys().next().value as
            | string
            | undefined;
          if (oldestKey) this.queryCache.delete(oldestKey);
        }
        this.queryCache.set(cacheKey, {
          expiresAt: Date.now() + QUERY_CACHE_TTL_MS,
          result,
        });
        return result;
      })
      .finally(() => {
        this.liveQueryCount = Math.max(0, this.liveQueryCount - 1);
        this.pendingQueries.delete(cacheKey);
      });
    this.pendingQueries.set(cacheKey, next);
    return next;
  }
}

export const managementProfitReportMikroService =
  new ManagementProfitReportMikroService();

export default managementProfitReportMikroService;
