import { randomUUID } from 'crypto';
import {
  CustomerType,
  HotSaleClosureAction,
  HotSalePaymentType,
  HotSaleStockMovementType,
  HotSaleTransactionType,
  Prisma,
  UserRole,
} from '@prisma/client';
import { prisma } from '../utils/prisma';
import { AppError, ErrorCode } from '../types/errors';
import mikroService from './mikroFactory.service';
import fieldSalesService from './field-sales.service';
import orderService from './order.service';
import { hashPassword } from '../utils/password';

type SqlRawValue = { raw: string };

type StaffScope = {
  role?: string;
  assignedSectorCodes?: string[];
  userId?: string | null;
};

type HotSaleItemInput = {
  productCode?: string;
  quantity?: number;
  unitPrice?: number;
  unit?: string;
  priceListNo?: number;
  note?: string;
  orderGuid?: string;
  orderRowNumber?: number | null;
};

type HotSalePaymentInput = {
  type?: HotSalePaymentType;
  amount?: number;
  referenceNo?: string;
  note?: string;
};

type MikroColumnMeta = {
  name: string;
  typeName: string;
  maxLength: number | null;
  charLength: number | null;
};

const HOT_CUSTOMER_SELECT = {
  id: true,
  email: true,
  name: true,
  mikroName: true,
  displayName: true,
  mikroCariCode: true,
  customerType: true,
  priceVisibility: true,
  vatDisplayPreference: true,
  invoicedPriceListNo: true,
  whitePriceListNo: true,
  active: true,
  city: true,
  district: true,
  phone: true,
  isLocked: true,
  groupCode: true,
  sectorCode: true,
  paymentTerm: true,
  paymentPlanNo: true,
  paymentPlanCode: true,
  paymentPlanName: true,
  hasEInvoice: true,
  balance: true,
  balanceUpdatedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const HOT_WAREHOUSE_NO = 11;
const DEFAULT_HOT_SERIES = 'SICAK';
const DEFAULT_CASH_CUSTOMER = '120.01.005';
const DEFAULT_CARD_CUSTOMER = '120.01.860';
const HOT_CUSTOMER_TEMPLATE_CODE = '120.01.2341';
const HOT_CUSTOMER_PREFIX = '120.01.';
const HOT_CUSTOMER_GROUP_CODE = 'SICAK';
const HOT_CUSTOMER_SECTOR_CODE = 'SICAK';

const normalizeCode = (value: unknown) => String(value || '').trim().toUpperCase();
const escapeSql = (value: string) => String(value || '').replace(/'/g, "''");
const truncateValue = (value: unknown, maxLength?: number | null) => {
  const text = String(value ?? '');
  return maxLength && maxLength > 0 ? text.slice(0, maxLength) : text;
};
const toSqlString = (value: unknown, maxLength?: number | null) => `N'${escapeSql(truncateValue(value, maxLength))}'`;
const toNumber = (value: unknown, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'object' && typeof (value as any).toNumber === 'function') {
    const parsed = (value as any).toNumber();
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const signedStockQty = (type: HotSaleStockMovementType, quantity: number) => {
  const value = Math.abs(Number(quantity) || 0);
  if (type === 'LOAD' || type === 'KEEP_ON_VEHICLE') return value;
  if (type === 'ADJUSTMENT' || type === 'COUNT') return Number(quantity) || 0;
  return -value;
};

const parseMikroOrderNumber = (value: string) => {
  const trimmed = normalizeCode(value);
  const match = trimmed.match(/^(.+)-(\d+)$/);
  if (!match) return null;
  return { series: match[1], sequence: Number(match[2]) };
};

class HotSaleService {
  private tableColumnsCache = new Map<string, Set<string>>();
  private tableColumnMetaCache = new Map<string, MikroColumnMeta[]>();
  private cariInsertColumnsCache: MikroColumnMeta[] | null = null;

  private raw(value: string): SqlRawValue {
    return { raw: value };
  }

  private toSqlLiteral(value: unknown): string {
    if (value && typeof value === 'object' && 'raw' in (value as Record<string, unknown>)) {
      return String((value as SqlRawValue).raw);
    }
    if (value === null || value === undefined) return 'NULL';
    if (value instanceof Date) {
      const pad = (num: number, size = 2) => String(num).padStart(size, '0');
      return `'${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}.${pad(value.getMilliseconds(), 3)}'`;
    }
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
    if (typeof value === 'boolean') return value ? '1' : '0';
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  private async getTableColumns(tableName: string): Promise<Set<string>> {
    const cached = this.tableColumnsCache.get(tableName);
    if (cached) return cached;
    const rows = await mikroService.executeQuery(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = '${escapeSql(tableName)}'
    `);
    const columns = new Set((rows as any[]).map((row) => String(row.COLUMN_NAME || row.column_name || '').trim()));
    this.tableColumnsCache.set(tableName, columns);
    return columns;
  }

  private async getTableColumnMeta(tableName: string): Promise<MikroColumnMeta[]> {
    const cached = this.tableColumnMetaCache.get(tableName);
    if (cached) return cached;
    const rows = await mikroService.executeQuery(`
      SELECT
        c.name,
        t.name AS typeName,
        c.max_length AS maxLength,
        CASE
          WHEN c.max_length < 0 THEN NULL
          WHEN t.name IN ('nvarchar', 'nchar') THEN c.max_length / 2
          WHEN t.name IN ('varchar', 'char') THEN c.max_length
          ELSE NULL
        END AS charLength
      FROM sys.columns c
      INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
      WHERE c.object_id = OBJECT_ID(N'dbo.${escapeSql(tableName)}')
        AND c.is_identity = 0
        AND c.is_computed = 0
        AND t.name NOT IN ('timestamp', 'rowversion')
      ORDER BY c.column_id
    `);
    const meta = (rows as any[])
      .map((row) => ({
        name: String(row.name || '').trim(),
        typeName: String(row.typeName || row.typename || '').trim().toLowerCase(),
        maxLength: row.maxLength === null || row.maxLength === undefined ? null : Number(row.maxLength),
        charLength: row.charLength === null || row.charLength === undefined ? null : Number(row.charLength),
      }))
      .filter((row) => row.name);
    this.tableColumnMetaCache.set(tableName, meta);
    return meta;
  }

  private async getCariInsertColumns() {
    if (this.cariInsertColumnsCache) return this.cariInsertColumnsCache;
    this.cariInsertColumnsCache = await this.getTableColumnMeta('CARI_HESAPLAR');
    return this.cariInsertColumnsCache;
  }

  private sqlStringForColumn(columnMeta: Map<string, MikroColumnMeta>, column: string, value: unknown) {
    const meta = columnMeta.get(column.toLowerCase());
    return toSqlString(value, meta?.charLength);
  }

  private buildHotCustomerColumnExpression(column: string, input: {
    customerName: string;
    phone: string;
    taxOffice: string;
    taxNumber: string;
    email?: string;
    city?: string;
    district?: string;
    address?: string;
  }, columnMeta: Map<string, MikroColumnMeta>) {
    const lower = column.toLowerCase();
    const direct: Record<string, string> = {
      cari_guid: '@newGuid',
      cari_kod: '@newCode',
      cari_create_user: '1',
      cari_lastup_user: '1',
      cari_create_date: 'GETDATE()',
      cari_lastup_date: 'GETDATE()',
      cari_degisti: '1',
      cari_unvan1: this.sqlStringForColumn(columnMeta, 'cari_unvan1', input.customerName),
      cari_unvan2: this.sqlStringForColumn(columnMeta, 'cari_unvan2', input.city || ''),
      cari_grup_kodu: this.sqlStringForColumn(columnMeta, 'cari_grup_kodu', HOT_CUSTOMER_GROUP_CODE),
      cari_sektor_kodu: this.sqlStringForColumn(columnMeta, 'cari_sektor_kodu', HOT_CUSTOMER_SECTOR_CODE),
      cari_ceptel: this.sqlStringForColumn(columnMeta, 'cari_ceptel', input.phone),
      cari_email: this.sqlStringForColumn(columnMeta, 'cari_email', input.email || ''),
      cari_vdaire_adi: this.sqlStringForColumn(columnMeta, 'cari_vdaire_adi', input.taxOffice),
      cari_vdaire_no: this.sqlStringForColumn(columnMeta, 'cari_vdaire_no', input.taxNumber),
      cari_vergikimlikno: this.sqlStringForColumn(columnMeta, 'cari_vergikimlikno', input.taxNumber),
      cari_odeme_cinsi: '0',
      cari_odeme_gunu: '0',
      cari_odemeplan_no: '0',
      cari_odeme_sekli: '0',
      cari_efatura_fl: '0',
      cari_vergimukellefidegil_mi: '0',
    };
    if (input.city) {
      direct.cari_il = this.sqlStringForColumn(columnMeta, 'cari_il', input.city);
      direct.cari_ilkodu = this.sqlStringForColumn(columnMeta, 'cari_ilkodu', input.city);
    }
    if (input.district) {
      direct.cari_ilce = this.sqlStringForColumn(columnMeta, 'cari_ilce', input.district);
      direct.cari_ilcekodu = this.sqlStringForColumn(columnMeta, 'cari_ilcekodu', input.district);
    }
    if (input.address) {
      direct.cari_adres = this.sqlStringForColumn(columnMeta, 'cari_adres', input.address);
      direct.cari_adres1 = this.sqlStringForColumn(columnMeta, 'cari_adres1', input.address);
      direct.cari_adres2 = this.sqlStringForColumn(columnMeta, 'cari_adres2', input.address);
    }

    if (direct[lower] !== undefined) return direct[lower];
    return `src.[${column.replace(/]/g, ']]')}]`;
  }

  private buildInsertSql(tableName: string, values: Record<string, unknown>, allowedColumns: Set<string>) {
    const entries = Object.entries(values).filter(([column, value]) => allowedColumns.has(column) && value !== undefined);
    if (!entries.length) throw new Error(`${tableName} insert kolonlari olusturulamadi`);
    return `INSERT INTO ${tableName} (${entries.map(([column]) => column).join(', ')}) VALUES (${entries.map(([, value]) => this.toSqlLiteral(value)).join(', ')})`;
  }

  private vatRateToCode(vatRate: number): number {
    const normalized = Math.max(Number(vatRate) || 0, 0);
    if (normalized <= 0.0001) return 0;
    if (normalized <= 0.011) return 2;
    if (normalized <= 0.11) return 7;
    return 5;
  }

  private vatCodeToRate(vatCode: number): number {
    const code = Math.max(Math.trunc(toNumber(vatCode)), 0);
    if (code === 2) return 0.01;
    if (code === 7) return 0.1;
    if (code === 5) return 0.2;
    return 0;
  }

  private stockMovementKindFilter(kind: 'TRANSFER' | 'INVOICE' | 'DISPATCH') {
    if (kind === 'TRANSFER') return "ISNULL(sth_tip, 0) = 2 AND ISNULL(sth_cins, 0) = 6 AND ISNULL(sth_evraktip, 0) = 2";
    if (kind === 'DISPATCH') return "ISNULL(sth_tip, 1) = 1 AND ISNULL(sth_cins, 0) = 0 AND ISNULL(sth_evraktip, 0) = 1";
    return "ISNULL(sth_tip, 1) = 1 AND ISNULL(sth_cins, 0) = 0 AND ISNULL(sth_evraktip, 0) = 4";
  }

  private async getNextStockMovementSequence(series: string, kind: 'TRANSFER' | 'INVOICE' | 'DISPATCH'): Promise<number> {
    const rows = await mikroService.executeQuery(`
      SELECT ISNULL(MAX(sth_evrakno_sira), 0) + 1 AS nextSira
      FROM STOK_HAREKETLERI WITH (NOLOCK)
      WHERE UPPER(sth_evrakno_seri) = '${escapeSql(series.toUpperCase())}'
        AND ${this.stockMovementKindFilter(kind)}
    `);
    const next = Number((rows as any[])?.[0]?.nextSira || 0);
    if (!Number.isFinite(next) || next <= 0) {
      throw new AppError('Mikro evrak sira numarasi alinamadi.', 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }
    return Math.trunc(next);
  }

  private stockMovementSequenceBatch(series: string, kind: 'TRANSFER' | 'INVOICE' | 'DISPATCH', insertStatements: string[]) {
    const lockResource = `B2B_HOT_SEQ_${kind}_${series}`.slice(0, 200);
    return `
      SET XACT_ABORT ON;
      BEGIN TRY
        BEGIN TRANSACTION;
        DECLARE @lockResult int;
        EXEC @lockResult = sp_getapplock
          @Resource = N'${escapeSql(lockResource)}',
          @LockMode = 'Exclusive',
          @LockOwner = 'Transaction',
          @LockTimeout = 15000;

        IF @lockResult < 0
          THROW 53100, 'SICAK evrak sira kilidi alinamadi', 1;

        DECLARE @nextSira int;
        SELECT @nextSira = ISNULL(MAX(sth_evrakno_sira), 0) + 1
        FROM STOK_HAREKETLERI WITH (UPDLOCK, HOLDLOCK)
        WHERE UPPER(sth_evrakno_seri) = '${escapeSql(series.toUpperCase())}'
          AND ${this.stockMovementKindFilter(kind)};

        IF @nextSira IS NULL OR @nextSira <= 0
          THROW 53101, 'Mikro evrak sira numarasi alinamadi', 1;

        ${insertStatements.join(';\n        ')};

        COMMIT TRANSACTION;
        SELECT @nextSira AS sequence;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
      END CATCH
    `;
  }

  private async getStockMovementTemplate(kind: 'TRANSFER' | 'INVOICE' | 'DISPATCH') {
    const filter = this.stockMovementKindFilter(kind);
    const preferredSeries = kind === 'TRANSFER' ? 'DSV' : kind === 'DISPATCH' ? 'H' : 'FTR';
    const rows = await mikroService.executeQuery(`
      SELECT TOP 1 *
      FROM STOK_HAREKETLERI WITH (NOLOCK)
      WHERE ${filter}
        AND UPPER(sth_evrakno_seri) = '${preferredSeries}'
      ORDER BY sth_tarih DESC, sth_evrakno_sira DESC, sth_satirno DESC
    `);
    if ((rows as any[]).length > 0) return (rows as any[])[0];

    const fallback = await mikroService.executeQuery(`
      SELECT TOP 1 *
      FROM STOK_HAREKETLERI WITH (NOLOCK)
      WHERE ${filter}
      ORDER BY sth_tarih DESC, sth_evrakno_sira DESC, sth_satirno DESC
    `);
    const template = (fallback as any[])[0];
    if (!template) {
      throw new AppError(`${kind} icin Mikro ornek evrak bulunamadi.`, 400, ErrorCode.BAD_REQUEST);
    }
    return template;
  }

  private async getProductRows(productCodes: string[]) {
    const codes = Array.from(new Set(productCodes.map(normalizeCode).filter(Boolean)));
    if (!codes.length) return new Map<string, any>();
    const rows = await mikroService.executeQuery(`
      SELECT
        sto_kod AS productCode,
        sto_isim AS productName,
        ISNULL(sto_birim1_ad, 'ADET') AS unit,
        ISNULL(sto_toptan_vergi, 0) AS vatCode,
        CAST(ISNULL(dbo.fn_DepodakiMiktar(sto_kod, 11, 0), 0) AS decimal(18,3)) AS hotStock,
        CAST(ISNULL(dbo.fn_DepodakiMiktar(sto_kod, 1, 0), 0) AS decimal(18,3)) AS stockMerkez,
        CAST(ISNULL(dbo.fn_DepodakiMiktar(sto_kod, 6, 0), 0) AS decimal(18,3)) AS stockTopca,
        CAST(ISNULL(sto_standartmaliyet, 0) AS decimal(18,4)) AS currentCost,
        CAST(ISNULL(dbo.fn_StokSatisFiyati(sto_kod, 1, 0, 1), 0) AS decimal(18,4)) AS price1,
        CAST(ISNULL(dbo.fn_StokSatisFiyati(sto_kod, 2, 0, 1), 0) AS decimal(18,4)) AS price2,
        CAST(ISNULL(dbo.fn_StokSatisFiyati(sto_kod, 3, 0, 1), 0) AS decimal(18,4)) AS price3,
        CAST(ISNULL(dbo.fn_StokSatisFiyati(sto_kod, 4, 0, 1), 0) AS decimal(18,4)) AS price4,
        CAST(ISNULL(dbo.fn_StokSatisFiyati(sto_kod, 5, 0, 1), 0) AS decimal(18,4)) AS price5,
        CAST(ISNULL(dbo.fn_StokSatisFiyati(sto_kod, 6, 0, 1), 0) AS decimal(18,4)) AS price6,
        CAST(ISNULL(dbo.fn_StokSatisFiyati(sto_kod, 7, 0, 1), 0) AS decimal(18,4)) AS price7,
        CAST(ISNULL(dbo.fn_StokSatisFiyati(sto_kod, 8, 0, 1), 0) AS decimal(18,4)) AS price8,
        CAST(ISNULL(dbo.fn_StokSatisFiyati(sto_kod, 9, 0, 1), 0) AS decimal(18,4)) AS price9,
        CAST(ISNULL(dbo.fn_StokSatisFiyati(sto_kod, 10, 0, 1), 0) AS decimal(18,4)) AS price10
      FROM STOKLAR WITH (NOLOCK)
      WHERE sto_kod IN (${codes.map((code) => `'${escapeSql(code)}'`).join(', ')})
    `);
    const map = new Map<string, any>();
    (rows as any[]).forEach((row) => map.set(normalizeCode(row.productCode), row));
    return map;
  }

  private aggregateQuantities<T extends { productCode: string; quantity: number }>(items: T[]) {
    const byCode = new Map<string, { productCode: string; quantity: number }>();
    items.forEach((item) => {
      const productCode = normalizeCode(item.productCode);
      const quantity = Math.max(toNumber(item.quantity), 0);
      if (!productCode || quantity <= 0) return;
      const current = byCode.get(productCode);
      if (current) current.quantity += quantity;
      else byCode.set(productCode, { productCode, quantity });
    });
    return Array.from(byCode.values());
  }

  private async getWarehouseStockMap(productCodes: string[], warehouseNo: number) {
    const codes = Array.from(new Set(productCodes.map(normalizeCode).filter(Boolean)));
    const warehouse = Math.max(Math.trunc(toNumber(warehouseNo, 1)), 1);
    if (!codes.length) return new Map<string, number>();
    const rows = await mikroService.executeQuery(`
      SELECT
        sto_kod AS productCode,
        CAST(ISNULL(dbo.fn_DepodakiMiktar(sto_kod, ${warehouse}, 0), 0) AS decimal(18,3)) AS quantity
      FROM STOKLAR WITH (NOLOCK)
      WHERE sto_kod IN (${codes.map((code) => `'${escapeSql(code)}'`).join(', ')})
    `);
    return new Map((rows as any[]).map((row) => [normalizeCode(row.productCode), toNumber(row.quantity)]));
  }

  private async validateWarehouseStock(warehouseNo: number, items: Array<{ productCode: string; quantity: number }>, label: string) {
    const aggregated = this.aggregateQuantities(items);
    if (!aggregated.length) return;
    const stockMap = await this.getWarehouseStockMap(aggregated.map((item) => item.productCode), warehouseNo);
    const shortages = aggregated
      .map((item) => {
        const available = toNumber(stockMap.get(item.productCode));
        return available + 0.0001 >= item.quantity ? null : { productCode: item.productCode, requested: item.quantity, available };
      })
      .filter(Boolean) as Array<{ productCode: string; requested: number; available: number }>;
    if (shortages.length) {
      throw new AppError(
        `${label} stogu yetersiz: ${shortages.map((row) => `${row.productCode} (${row.available}/${row.requested})`).join(', ')}`,
        400,
        ErrorCode.BAD_REQUEST
      );
    }
  }

  private normalizeItems(items: HotSaleItemInput[], productMap: Map<string, any>, defaultPriceListNo: number) {
    return (Array.isArray(items) ? items : [])
      .map((item) => {
        const productCode = normalizeCode(item.productCode);
        const quantity = toNumber(item.quantity);
        const row = productMap.get(productCode);
        const priceListNo = Math.min(Math.max(Math.trunc(toNumber(item.priceListNo, defaultPriceListNo)), 1), 10);
        const listPrice = toNumber(row?.[`price${priceListNo}`]);
        const unitPrice = item.unitPrice === undefined || item.unitPrice === null ? listPrice : toNumber(item.unitPrice);
        const vatCode = Math.max(Math.trunc(toNumber(row?.vatCode)), 0);
        const vatRate = vatCode === 7 ? 0.1 : vatCode === 2 ? 0.01 : vatCode === 5 ? 0.2 : 0;
        const currentCost = Math.max(toNumber(row?.currentCost), 0);
        return {
          productCode,
          productName: String(row?.productName || productCode).trim(),
          unit: String(item.unit || row?.unit || 'ADET').trim() || 'ADET',
          quantity,
          unitPrice,
          priceListNo,
          vatRate,
          currentCost,
          currentCostVatIncluded: currentCost * (1 + vatRate),
          note: String(item.note || '').trim() || undefined,
        };
      })
      .filter((item) => item.productCode && item.quantity > 0);
  }

  private validatePriceFloor(
    type: HotSaleTransactionType,
    items: Array<{ productCode: string; unitPrice: number; currentCost?: number; currentCostVatIncluded?: number }>
  ) {
    const missingCosts = items
      .filter((item) => Math.max(toNumber(item.currentCost), 0) <= 0)
      .map((item) => item.productCode);
    if (missingCosts.length) {
      throw new AppError(
        `Guncel maliyeti olmayan urunler satilamaz: ${missingCosts.join(', ')}`,
        400,
        ErrorCode.BAD_REQUEST
      );
    }

    const violations = items
      .map((item) => {
        const currentCost = Math.max(toNumber(item.currentCost), 0);
        const minPrice = type === 'CASH_INVOICE' ? Math.max(toNumber(item.currentCostVatIncluded), currentCost) : currentCost * 1.05;
        return item.unitPrice + 0.0001 >= minPrice
          ? null
          : {
              productCode: item.productCode,
              minPrice,
              unitPrice: item.unitPrice,
            };
      })
      .filter(Boolean) as Array<{ productCode: string; minPrice: number; unitPrice: number }>;

    if (violations.length) {
      throw new AppError(
        `Fiyat maliyet alt limitini karsilamiyor: ${violations
          .map((row) => `${row.productCode} min ${row.minPrice.toFixed(2)} / girilen ${row.unitPrice.toFixed(2)}`)
          .join(', ')}`,
        400,
        ErrorCode.BAD_REQUEST
      );
    }
  }

  private async createStockMovementDocument(input: {
    kind: 'TRANSFER' | 'INVOICE' | 'DISPATCH';
    series?: string;
    customerCode?: string;
    items: Array<{
      productCode: string;
      productName: string;
      quantity: number;
      unitPrice?: number;
      vatRate?: number;
      priceListNo?: number;
      note?: string;
      orderGuid?: string;
      orderRowNumber?: number | null;
    }>;
    sourceWarehouseNo?: number;
    targetWarehouseNo?: number;
    vatZeroed?: boolean;
    paymentOp?: number;
  }): Promise<{ documentNo: string; sequence: number; totalAmount: number; vatAmount: number }> {
    const series = normalizeCode(input.series || DEFAULT_HOT_SERIES) || DEFAULT_HOT_SERIES;
    const items = input.items.filter((item) => item.productCode && Number(item.quantity) > 0);
    if (!items.length) {
      throw new AppError('Evrak icin urun yok.', 400, ErrorCode.BAD_REQUEST);
    }

    const template = await this.getStockMovementTemplate(input.kind);
    const columns = await this.getTableColumns('STOK_HAREKETLERI');
    const zeroGuid = '00000000-0000-0000-0000-000000000000';
    const mikroUserNoRaw = Number(process.env.MIKRO_USER_NO || process.env.MIKRO_USERNO || 1);
    const mikroUserNo = Number.isFinite(mikroUserNoRaw) && mikroUserNoRaw > 0 ? Math.trunc(mikroUserNoRaw) : 1;
    const defaultSorMerkez = String(process.env.MIKRO_SORMERK || 'HENDEK').trim().slice(0, 25);
    const docGuid = randomUUID();
    let totalAmount = 0;
    let vatAmount = 0;
    const insertStatements: string[] = [];

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const quantity = Math.max(toNumber(item.quantity), 0);
      const unitPrice = Math.max(toNumber(item.unitPrice), 0);
      const lineTotal = input.kind === 'TRANSFER' ? 0 : quantity * unitPrice;
      const lineVatRate = input.vatZeroed ? 0 : Math.max(toNumber(item.vatRate), 0);
      const lineVat = lineTotal * lineVatRate;
      totalAmount += lineTotal;
      vatAmount += lineVat;

      const values: Record<string, unknown> = {
        ...template,
        sth_Guid: this.raw(`CAST('${randomUUID()}' as uniqueidentifier)`),
        sth_iptal: 0,
        sth_degisti: 0,
        sth_create_user: Math.max(Math.trunc(toNumber(template.sth_create_user)), mikroUserNo),
        sth_lastup_user: Math.max(Math.trunc(toNumber(template.sth_lastup_user)), mikroUserNo),
        sth_create_date: this.raw('GETDATE()'),
        sth_lastup_date: this.raw('GETDATE()'),
        sth_tarih: this.raw('CAST(GETDATE() as date)'),
        sth_belge_tarih: this.raw('CAST(GETDATE() as date)'),
        sth_evrakno_seri: series,
        sth_evrakno_sira: this.raw('@nextSira'),
        sth_satirno: index,
        sth_stok_kod: item.productCode,
        sth_miktar: quantity,
        sth_miktar2: input.kind === 'INVOICE' ? quantity : 0,
        sth_birim_pntr: Math.max(Math.trunc(toNumber(template.sth_birim_pntr)), 1),
        sth_tutar: lineTotal,
        sth_vergi: lineVat,
        sth_vergi_pntr: this.vatRateToCode(lineVatRate),
        sth_vergisiz_fl: input.vatZeroed ? 1 : 0,
        sth_fiyat_liste_no: input.kind === 'TRANSFER' ? 0 : Math.max(Math.trunc(toNumber(item.priceListNo)), 0),
        sth_aciklama: String(item.note || item.productName || '').slice(0, 50),
        sth_stok_srm_merkezi: input.kind === 'TRANSFER' ? '' : defaultSorMerkez,
        sth_cari_srm_merkezi: input.kind === 'TRANSFER' ? '' : defaultSorMerkez,
        sth_proje_kodu: input.kind === 'TRANSFER' ? '' : String(process.env.MIKRO_PROJE_KODU || 'R').trim().slice(0, 25),
        sth_odeme_op: input.paymentOp ?? Math.max(Math.trunc(toNumber(template.sth_odeme_op)), 0),
        sth_sip_uid: this.raw(`CAST('${item.orderGuid || zeroGuid}' as uniqueidentifier)`),
        sth_fat_uid: this.raw(`CAST('${zeroGuid}' as uniqueidentifier)`),
      };

      if (input.kind === 'TRANSFER') {
        values.sth_tip = 2;
        values.sth_cins = 6;
        values.sth_normal_iade = 0;
        values.sth_evraktip = 2;
        values.sth_cari_kodu = '';
        values.sth_giris_depo_no = Math.max(Math.trunc(toNumber(input.targetWarehouseNo, HOT_WAREHOUSE_NO)), 1);
        values.sth_cikis_depo_no = Math.max(Math.trunc(toNumber(input.sourceWarehouseNo, 1)), 1);
      } else {
        values.sth_tip = 1;
        values.sth_cins = 0;
        values.sth_normal_iade = 0;
        values.sth_evraktip = input.kind === 'DISPATCH' ? 1 : 4;
        values.sth_cari_kodu = normalizeCode(input.customerCode);
        values.sth_giris_depo_no = HOT_WAREHOUSE_NO;
        values.sth_cikis_depo_no = HOT_WAREHOUSE_NO;
      }

      if (columns.has('sth_har_uid')) values.sth_har_uid = this.raw(`CAST('${zeroGuid}' as uniqueidentifier)`);
      if (columns.has('sth_evrakuid')) values.sth_evrakuid = this.raw(`CAST('${docGuid}' as uniqueidentifier)`);
      if (columns.has('sth_irs_tes_uid')) values.sth_irs_tes_uid = this.raw(`CAST('${zeroGuid}' as uniqueidentifier)`);
      if (columns.has('sth_kons_uid')) values.sth_kons_uid = this.raw(`CAST('${zeroGuid}' as uniqueidentifier)`);
      if (columns.has('sth_yetkili_uid')) values.sth_yetkili_uid = this.raw(`CAST('${zeroGuid}' as uniqueidentifier)`);

      insertStatements.push(this.buildInsertSql('STOK_HAREKETLERI', values, columns));
    }

    const sequenceRows = await mikroService.executeQuery(this.stockMovementSequenceBatch(series, input.kind, insertStatements));
    const sequence = Math.trunc(toNumber((sequenceRows as any[])?.[0]?.sequence));
    if (!sequence || sequence <= 0) {
      throw new AppError('Mikro evrak sira numarasi alinamadi.', 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }

    if (input.kind === 'INVOICE') {
      const chaGuid = await this.ensureInvoiceCariMovement({
        invoiceSeries: series,
        invoiceSequence: sequence,
        customerCode: normalizeCode(input.customerCode) || DEFAULT_CASH_CUSTOMER,
        totalAmount,
        mikroUserNo,
      });
      if (chaGuid) {
        await mikroService.executeQuery(`
          UPDATE STOK_HAREKETLERI
          SET sth_fat_uid = CAST('${escapeSql(chaGuid)}' as uniqueidentifier),
              sth_lastup_date = GETDATE()
          WHERE UPPER(sth_evrakno_seri) = '${escapeSql(series)}'
            AND sth_evrakno_sira = ${sequence}
        `);
      }
    }

    return {
      documentNo: `${series}-${sequence}`,
      sequence,
      totalAmount,
      vatAmount,
    };
  }

  private async ensureInvoiceCariMovement(params: {
    invoiceSeries: string;
    invoiceSequence: number;
    customerCode: string;
    totalAmount: number;
    mikroUserNo: number;
  }): Promise<string | null> {
    const totalAmount = Math.max(toNumber(params.totalAmount), 0);
    if (!params.invoiceSeries || params.invoiceSequence <= 0 || !params.customerCode || totalAmount <= 0) return null;
    const existingRows = await mikroService.executeQuery(`
      SELECT TOP 1 cha_Guid
      FROM CARI_HESAP_HAREKETLERI WITH (NOLOCK)
      WHERE UPPER(cha_evrakno_seri) = '${escapeSql(params.invoiceSeries)}'
        AND cha_evrakno_sira = ${params.invoiceSequence}
    `);
    if ((existingRows as any[]).length > 0) {
      return normalizeCode((existingRows as any[])[0]?.cha_Guid) || null;
    }

    let templateRows = await mikroService.executeQuery(`
      SELECT TOP 1 *
      FROM CARI_HESAP_HAREKETLERI WITH (NOLOCK)
      WHERE UPPER(cha_evrakno_seri) = 'FTR'
      ORDER BY cha_evrakno_sira DESC, cha_satir_no DESC
    `);
    let template = (templateRows as any[])[0];
    if (!template) {
      templateRows = await mikroService.executeQuery(`
        SELECT TOP 1 *
        FROM CARI_HESAP_HAREKETLERI WITH (NOLOCK)
        ORDER BY cha_tarihi DESC, cha_evrakno_sira DESC, cha_satir_no DESC
      `);
      template = (templateRows as any[])[0];
    }
    if (!template) return null;

    const columns = await this.getTableColumns('CARI_HESAP_HAREKETLERI');
    const guid = randomUUID();
    const values: Record<string, unknown> = {
      ...template,
      cha_Guid: this.raw(`CAST('${guid}' as uniqueidentifier)`),
      cha_evrakno_seri: params.invoiceSeries,
      cha_evrakno_sira: params.invoiceSequence,
      cha_satir_no: 0,
      cha_tarihi: this.raw('GETDATE()'),
      cha_belge_tarih: this.raw('GETDATE()'),
      cha_kod: params.customerCode,
      cha_meblag: totalAmount,
      cha_aratoplam: totalAmount,
      cha_vergisiz_fl: 1,
      cha_vergipntr: 0,
      cha_vergi1: 0,
      cha_vergi2: 0,
      cha_vergi3: 0,
      cha_vergi4: 0,
      cha_vergi5: 0,
      cha_vergi6: 0,
      cha_vergi7: 0,
      cha_vergi8: 0,
      cha_vergi9: 0,
      cha_vergi10: 0,
      cha_vergi11: 0,
      cha_vergi12: 0,
      cha_vergi13: 0,
      cha_vergi14: 0,
      cha_vergi15: 0,
      cha_vergi16: 0,
      cha_vergi17: 0,
      cha_vergi18: 0,
      cha_vergi19: 0,
      cha_vergi20: 0,
      cha_create_user: Math.max(Math.trunc(toNumber(template.cha_create_user)), params.mikroUserNo),
      cha_lastup_user: Math.max(Math.trunc(toNumber(template.cha_lastup_user)), params.mikroUserNo),
      cha_create_date: this.raw('GETDATE()'),
      cha_lastup_date: this.raw('GETDATE()'),
    };
    await mikroService.executeQuery(this.buildInsertSql('CARI_HESAP_HAREKETLERI', values, columns));
    return guid;
  }

  private async createMikroHotCustomer(input: {
    customerName: string;
    phone: string;
    taxOffice: string;
    taxNumber: string;
    email?: string;
    city?: string;
    district?: string;
    address?: string;
  }) {
    const columns = await this.getCariInsertColumns();
    const columnNames = columns.map((column) => column.name);
    const columnMeta = new Map(columns.map((column) => [column.name.toLowerCase(), column]));
    if (!columnNames.includes('cari_kod') || !columnNames.some((column) => column.toLowerCase() === 'cari_guid')) {
      throw new AppError('Mikro cari kolonlari beklenen yapida degil.', 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }

    const columnList = columnNames.map((column) => `[${column.replace(/]/g, ']]')}]`).join(', ');
    const expressionList = columnNames.map((column) => this.buildHotCustomerColumnExpression(column, input, columnMeta)).join(', ');

    let rows: any[];
    try {
      rows = await mikroService.executeQuery(`
        SET XACT_ABORT ON;
        BEGIN TRY
          BEGIN TRANSACTION;
          DECLARE @created TABLE(cariCode nvarchar(25), cariGuid uniqueidentifier);
          DECLARE @baseNo int;
          DECLARE @newCode nvarchar(25);
          DECLARE @newGuid uniqueidentifier = NEWID();

          SELECT @baseNo = ISNULL(MAX(TRY_CONVERT(int, SUBSTRING(cari_kod, ${HOT_CUSTOMER_PREFIX.length + 1}, 20))), 0)
          FROM CARI_HESAPLAR WITH (UPDLOCK, HOLDLOCK)
          WHERE cari_kod LIKE N'${escapeSql(HOT_CUSTOMER_PREFIX)}%'
            AND TRY_CONVERT(int, SUBSTRING(cari_kod, ${HOT_CUSTOMER_PREFIX.length + 1}, 20)) IS NOT NULL;

          SET @newCode = N'${escapeSql(HOT_CUSTOMER_PREFIX)}' + CONVERT(nvarchar(20), @baseNo + 1);

          IF NOT EXISTS (SELECT 1 FROM CARI_HESAPLAR WITH (NOLOCK) WHERE cari_kod = N'${escapeSql(HOT_CUSTOMER_TEMPLATE_CODE)}')
            THROW 53000, 'SICAK cari sablonu bulunamadi', 1;

          IF EXISTS (SELECT 1 FROM CARI_HESAPLAR WITH (UPDLOCK, HOLDLOCK) WHERE cari_kod = @newCode)
            THROW 53001, 'Olusacak cari kodu Mikroda zaten var', 1;

          INSERT INTO CARI_HESAPLAR (${columnList})
          OUTPUT inserted.cari_kod, inserted.cari_Guid INTO @created(cariCode, cariGuid)
          SELECT ${expressionList}
          FROM CARI_HESAPLAR src WITH (NOLOCK)
          WHERE src.cari_kod = N'${escapeSql(HOT_CUSTOMER_TEMPLATE_CODE)}';

          IF @@ROWCOUNT = 0
            THROW 53002, 'SICAK cari sablonu okunamadi', 1;

          COMMIT TRANSACTION;
          SELECT cariCode, CONVERT(nvarchar(50), cariGuid) AS cariGuid FROM @created;
        END TRY
        BEGIN CATCH
          IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
          DECLARE @message nvarchar(4000) = ERROR_MESSAGE();
          THROW 53003, @message, 1;
        END CATCH
      `);
    } catch (error: any) {
      const message = String(error?.message || '');
      if (message.toLowerCase().includes('truncated')) {
        throw new AppError('Mikro cari acilamadi: girilen bilgiler Mikro alan uzunluklarini asiyor.', 400, ErrorCode.BAD_REQUEST);
      }
      throw error;
    }

    const created = (rows as any[])[0];
    return {
      cariCode: normalizeCode(created?.cariCode),
      cariGuid: String(created?.cariGuid || '').trim(),
    };
  }

  private async findExistingMikroCustomerByTaxNumber(taxNumber: string) {
    const safeTax = escapeSql(String(taxNumber || '').trim());
    if (!safeTax) return null;
    const rows = await mikroService.executeQuery(`
      SELECT TOP 1
        cari_kod AS cariCode,
        cari_unvan1 AS cariName,
        cari_vdaire_no AS taxNumber,
        cari_vergikimlikno AS taxIdentityNo
      FROM CARI_HESAPLAR WITH (NOLOCK)
      WHERE (
          LTRIM(RTRIM(ISNULL(cari_vdaire_no, ''))) = N'${safeTax}'
          OR LTRIM(RTRIM(ISNULL(cari_vergikimlikno, ''))) = N'${safeTax}'
        )
      ORDER BY cari_kod
    `);
    const row = (rows as any[])[0];
    if (!row) return null;
    return {
      cariCode: normalizeCode(row.cariCode),
      cariName: String(row.cariName || '').trim(),
    };
  }

  async createHotCustomer(input: {
    customerName?: string;
    phone?: string;
    taxOffice?: string;
    taxNumber?: string;
    email?: string;
    city?: string;
    district?: string;
    address?: string;
  }) {
    const customerName = String(input.customerName || '').trim();
    const phone = String(input.phone || '').replace(/\s+/g, '').trim();
    const taxOffice = String(input.taxOffice || '').trim();
    const taxNumber = String(input.taxNumber || '').replace(/\s+/g, '').trim();
    const email = String(input.email || '').trim() || null;
    const city = String(input.city || '').trim() || null;
    const district = String(input.district || '').trim() || null;
    const address = String(input.address || '').trim() || null;

    if (!customerName) throw new AppError('Cari unvani zorunlu.', 400, ErrorCode.BAD_REQUEST);
    if (!phone) throw new AppError('Cep telefonu zorunlu.', 400, ErrorCode.BAD_REQUEST);
    if (!taxOffice) throw new AppError('Vergi dairesi zorunlu.', 400, ErrorCode.BAD_REQUEST);
    if (!taxNumber) throw new AppError('Vergi no zorunlu.', 400, ErrorCode.BAD_REQUEST);
    if (customerName.length > 127) throw new AppError('Cari unvani 127 karakterden uzun olamaz.', 400, ErrorCode.BAD_REQUEST);
    if (phone.length > 20) throw new AppError('Cep telefonu 20 karakterden uzun olamaz.', 400, ErrorCode.BAD_REQUEST);
    if (taxNumber.length > 15) throw new AppError('Vergi no 15 karakterden uzun olamaz.', 400, ErrorCode.BAD_REQUEST);

    const existingByTax = await this.findExistingMikroCustomerByTaxNumber(taxNumber);
    if (existingByTax?.cariCode) {
      throw new AppError(
        `Bu vergi no Mikroda zaten kayitli: ${existingByTax.cariCode} ${existingByTax.cariName || ''}`.trim(),
        400,
        ErrorCode.BAD_REQUEST,
        existingByTax
      );
    }

    if (email) {
      const existingEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (existingEmail) throw new AppError('Bu email ile kayitli cari zaten var.', 400, ErrorCode.BAD_REQUEST);
    }

    const createdMikro = await this.createMikroHotCustomer({
      customerName,
      phone,
      taxOffice,
      taxNumber,
      email: email || undefined,
      city: city || undefined,
      district: district || undefined,
      address: address || undefined,
    });
    if (!createdMikro.cariCode) {
      throw new AppError('Mikro cari kodu olusturulamadi.', 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }

    const hashedPassword = await hashPassword(`HOT-${createdMikro.cariCode}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const customer = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: customerName,
        mikroName: customerName,
        displayName: customerName,
        role: UserRole.CUSTOMER,
        customerType: CustomerType.PERAKENDE,
        mikroCariCode: createdMikro.cariCode,
        phone,
        city,
        district,
        groupCode: HOT_CUSTOMER_GROUP_CODE,
        sectorCode: HOT_CUSTOMER_SECTOR_CODE,
        paymentPlanNo: 0,
        paymentPlanName: 'Pesin',
        hasEInvoice: false,
        balance: 0,
        isLocked: false,
      },
      select: HOT_CUSTOMER_SELECT,
    });

    await prisma.cart.create({ data: { userId: customer.id } }).catch(() => null);
    return {
      customer: {
        ...customer,
        displayTitle: customer.displayName || customer.mikroName || customer.name || customer.mikroCariCode,
      },
      mikro: createdMikro,
    };
  }

  async listVehicles() {
    return prisma.hotSaleVehicle.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] });
  }

  async upsertVehicle(input: {
    id?: string;
    name?: string;
    plate?: string;
    active?: boolean;
    defaultSourceWarehouseNo?: number;
    note?: string | null;
  }) {
    const name = String(input.name || '').trim();
    const plate = normalizeCode(input.plate);
    if (!name || !plate) {
      throw new AppError('Arac adi ve plaka zorunlu.', 400, ErrorCode.BAD_REQUEST);
    }
    const data = {
      name,
      plate,
      active: input.active !== false,
      hotWarehouseNo: HOT_WAREHOUSE_NO,
      defaultSourceWarehouseNo: Math.max(Math.trunc(toNumber(input.defaultSourceWarehouseNo, 1)), 1),
      note: input.note === undefined ? undefined : String(input.note || '').trim() || null,
    };
    if (input.id) {
      return prisma.hotSaleVehicle.update({ where: { id: input.id }, data });
    }
    return prisma.hotSaleVehicle.create({ data });
  }

  async getDashboard(userId?: string) {
    const [vehicles, openSessions, recentTransactions] = await Promise.all([
      this.listVehicles(),
      prisma.hotSaleSession.findMany({
        where: { status: 'OPEN' },
        include: { vehicle: true, user: { select: { id: true, name: true, displayName: true, email: true } } },
        orderBy: { startedAt: 'desc' },
      }),
      prisma.hotSaleTransaction.findMany({
        take: 30,
        include: { session: { include: { vehicle: true } }, items: true, payments: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const myOpenSession = userId ? openSessions.find((session) => session.userId === userId) || null : null;
    return { vehicles, openSessions, myOpenSession, recentTransactions };
  }

  private resolveReportRange(startDate?: string, endDate?: string) {
    const toDateInput = (value?: string) => String(value || '').trim().slice(0, 10);
    const pad = (value: number) => String(value).padStart(2, '0');
    const today = new Date();
    const turkeyNow = new Date(today.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
    const fallback = `${turkeyNow.getFullYear()}-${pad(turkeyNow.getMonth() + 1)}-${pad(turkeyNow.getDate())}`;
    const startInput = toDateInput(startDate) || fallback;
    const endInput = toDateInput(endDate) || startInput;
    const start = new Date(`${startInput}T00:00:00.000+03:00`);
    const end = new Date(`${endInput}T23:59:59.999+03:00`);
    return {
      start,
      end,
      startDate: startInput,
      endDate: endInput,
    };
  }

  async getDailyReport(params: {
    startDate?: string;
    endDate?: string;
    vehicleId?: string;
    userId?: string;
    limit?: number;
  }) {
    const range = this.resolveReportRange(params.startDate, params.endDate);
    const vehicleId = String(params.vehicleId || '').trim() || undefined;
    const userId = String(params.userId || '').trim() || undefined;
    const limit = Math.min(Math.max(Math.trunc(toNumber(params.limit, 250)), 50), 1000);
    const transactionDateWhere = { gte: range.start, lte: range.end };

    const sessionWhere: Prisma.HotSaleSessionWhereInput = {
      ...(vehicleId ? { vehicleId } : {}),
      ...(userId ? { userId } : {}),
      OR: [
        { startedAt: transactionDateWhere },
        { closedAt: transactionDateWhere },
        { transactions: { some: { createdAt: transactionDateWhere } } },
      ],
    };
    const transactionWhere: Prisma.HotSaleTransactionWhereInput = {
      createdAt: transactionDateWhere,
      ...(vehicleId || userId
        ? {
            session: {
              ...(vehicleId ? { vehicleId } : {}),
              ...(userId ? { userId } : {}),
            },
          }
        : {}),
    };

    const [sessions, transactions, stockMovements, vehicles, users] = await Promise.all([
      prisma.hotSaleSession.findMany({
        where: sessionWhere,
        include: {
          vehicle: true,
          user: { select: { id: true, name: true, displayName: true, email: true } },
          closingCounts: true,
        },
        orderBy: [{ startedAt: 'desc' }],
      }),
      prisma.hotSaleTransaction.findMany({
        where: transactionWhere,
        include: {
          session: {
            include: {
              vehicle: true,
              user: { select: { id: true, name: true, displayName: true, email: true } },
            },
          },
          customer: { select: { id: true, displayName: true, mikroName: true, name: true, mikroCariCode: true } },
          items: true,
          payments: true,
        },
        orderBy: [{ createdAt: 'desc' }],
      }),
      prisma.hotSaleStockLedger.findMany({
        where: {
          createdAt: transactionDateWhere,
          ...(vehicleId ? { vehicleId } : {}),
          ...(userId
            ? {
                session: { userId },
              }
            : {}),
        },
        take: 1500,
        include: {
          session: {
            include: {
              vehicle: true,
              user: { select: { id: true, name: true, displayName: true, email: true } },
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }],
      }),
      prisma.hotSaleVehicle.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
      prisma.user.findMany({
        where: {
          hotSaleSessions: { some: {} },
        },
        select: { id: true, name: true, displayName: true, email: true },
        orderBy: [{ displayName: 'asc' }, { name: 'asc' }],
      }),
    ]);

    const nonCancelledTransactions = transactions.filter((transaction) => transaction.status !== 'CANCELLED');
    const cancelledTransactions = transactions.filter((transaction) => transaction.status === 'CANCELLED');
    const money = (value: unknown) => Number(toNumber(value).toFixed(2));

    const paymentTotals: Record<string, number> = {
      CASH: 0,
      CARD: 0,
      TRANSFER: 0,
      OPEN_ACCOUNT: 0,
      MIXED: 0,
    };
    const typeTotals: Record<string, { count: number; amount: number }> = {
      CASH_INVOICE: { count: 0, amount: 0 },
      INVOICED_DISPATCH: { count: 0, amount: 0 },
      ORDER: { count: 0, amount: 0 },
      ORDER_DELIVERY: { count: 0, amount: 0 },
    };
    const statusTotals: Record<string, { count: number; amount: number }> = {
      COMPLETED: { count: 0, amount: 0 },
      SYNC_FAILED: { count: 0, amount: 0 },
      CANCELLED: { count: 0, amount: 0 },
    };
    const productMap = new Map<string, { productCode: string; productName: string; unit?: string | null; quantity: number; revenue: number }>();

    transactions.forEach((transaction) => {
      const amount = toNumber(transaction.totalAmount);
      const status = transaction.status || 'COMPLETED';
      statusTotals[status] = statusTotals[status] || { count: 0, amount: 0 };
      statusTotals[status].count += 1;
      statusTotals[status].amount += amount;

      if (transaction.status === 'CANCELLED') return;

      typeTotals[transaction.type] = typeTotals[transaction.type] || { count: 0, amount: 0 };
      typeTotals[transaction.type].count += 1;
      typeTotals[transaction.type].amount += amount;

      const payments = transaction.payments?.length
        ? transaction.payments
        : [{ type: transaction.paymentType, amount }];
      payments.forEach((payment) => {
        const key = String(payment.type || transaction.paymentType || 'CASH');
        paymentTotals[key] = (paymentTotals[key] || 0) + toNumber(payment.amount);
      });

      transaction.items.forEach((item) => {
        const code = normalizeCode(item.productCode);
        const current = productMap.get(code) || {
          productCode: item.productCode,
          productName: item.productName,
          unit: item.unit,
          quantity: 0,
          revenue: 0,
        };
        current.quantity += toNumber(item.quantity);
        current.revenue += toNumber(item.totalPrice);
        productMap.set(code, current);
      });
    });

    const transactionsBySession = new Map<string, typeof transactions>();
    transactions.forEach((transaction) => {
      const current = transactionsBySession.get(transaction.sessionId) || [];
      current.push(transaction);
      transactionsBySession.set(transaction.sessionId, current);
    });

    const sessionRows = sessions.map((session) => {
      const sessionTransactions = transactionsBySession.get(session.id) || [];
      const activeTransactions = sessionTransactions.filter((transaction) => transaction.status !== 'CANCELLED');
      const cashTotal = activeTransactions.reduce((sum, transaction) => {
        const payments = transaction.payments?.length
          ? transaction.payments
          : [{ type: transaction.paymentType, amount: transaction.totalAmount }];
        return sum + payments
          .filter((payment) => payment.type === 'CASH')
          .reduce((paymentSum, payment) => paymentSum + toNumber(payment.amount), 0);
      }, 0);
      const revenue = activeTransactions.reduce((sum, transaction) => sum + toNumber(transaction.totalAmount), 0);
      const stockDifferenceCount = session.closingCounts.filter((row) => Math.abs(toNumber(row.differenceQty)) > 0.0001).length;
      const stockDifferenceQty = session.closingCounts.reduce((sum, row) => sum + Math.abs(toNumber(row.differenceQty)), 0);
      return {
        id: session.id,
        status: session.status,
        vehicleId: session.vehicleId,
        vehicleName: session.vehicle?.name || null,
        plate: session.vehicle?.plate || null,
        userId: session.userId,
        userName: session.user?.displayName || session.user?.name || session.user?.email || null,
        sourceWarehouseNo: session.sourceWarehouseNo,
        openingCash: money(session.openingCash),
        cashSales: money(cashTotal),
        expectedCash: money(session.openingCash + cashTotal),
        storedExpectedCash: money(session.openingCash + toNumber(session.expectedCash)),
        closingCash: session.closingCash === null ? null : money(session.closingCash),
        cashDifference: session.closingCash === null
          ? null
          : money(toNumber(session.closingCash) - (toNumber(session.openingCash) + cashTotal)),
        storedCashDifference: session.cashDifference === null ? null : money(session.cashDifference),
        revenue: money(revenue),
        transactionCount: sessionTransactions.length,
        syncFailedCount: sessionTransactions.filter((transaction) => transaction.status === 'SYNC_FAILED').length,
        cancelledCount: sessionTransactions.filter((transaction) => transaction.status === 'CANCELLED').length,
        stockDifferenceCount,
        stockDifferenceQty: Number(stockDifferenceQty.toFixed(3)),
        startKm: session.startKm,
        endKm: session.endKm,
        startedAt: session.startedAt,
        closedAt: session.closedAt,
        loadDocumentNo: session.loadDocumentNo,
        returnDocumentNo: session.returnDocumentNo,
        note: session.note,
        closeNote: session.closeNote,
      };
    });

    const stockSummary = stockMovements.reduce((acc, movement) => {
      const key = movement.type;
      const current = acc[key] || { count: 0, quantity: 0 };
      current.count += 1;
      current.quantity += toNumber(movement.quantity);
      acc[key] = current;
      return acc;
    }, {} as Record<string, { count: number; quantity: number }>);

    const riskySessions = sessionRows.filter((session) =>
      Math.abs(toNumber(session.cashDifference)) > 0.01 ||
      session.syncFailedCount > 0 ||
      session.stockDifferenceCount > 0
    );

    return {
      filters: {
        startDate: range.startDate,
        endDate: range.endDate,
        vehicleId: vehicleId || null,
        userId: userId || null,
      },
      summary: {
        sessionCount: sessions.length,
        openSessionCount: sessions.filter((session) => session.status === 'OPEN').length,
        closedSessionCount: sessions.filter((session) => session.status === 'CLOSED').length,
        transactionCount: transactions.length,
        completedTransactionCount: nonCancelledTransactions.length,
        cancelledTransactionCount: cancelledTransactions.length,
        syncFailedCount: transactions.filter((transaction) => transaction.status === 'SYNC_FAILED').length,
        openingCash: money(sessionRows.reduce((sum, session) => sum + toNumber(session.openingCash), 0)),
        cashSales: money(paymentTotals.CASH),
        expectedCash: money(sessionRows.reduce((sum, session) => sum + toNumber(session.expectedCash), 0)),
        closingCash: money(sessionRows.reduce((sum, session) => sum + toNumber(session.closingCash), 0)),
        cashDifference: money(sessionRows.reduce((sum, session) => sum + toNumber(session.cashDifference), 0)),
        totalRevenue: money(nonCancelledTransactions.reduce((sum, transaction) => sum + toNumber(transaction.totalAmount), 0)),
        cancelledAmount: money(cancelledTransactions.reduce((sum, transaction) => sum + toNumber(transaction.totalAmount), 0)),
        stockDifferenceSessionCount: sessionRows.filter((session) => session.stockDifferenceCount > 0).length,
        riskySessionCount: riskySessions.length,
      },
      paymentTotals: Object.fromEntries(Object.entries(paymentTotals).map(([key, value]) => [key, money(value)])),
      typeTotals: Object.fromEntries(Object.entries(typeTotals).map(([key, value]) => [key, { count: value.count, amount: money(value.amount) }])),
      statusTotals: Object.fromEntries(Object.entries(statusTotals).map(([key, value]) => [key, { count: value.count, amount: money(value.amount) }])),
      sessions: sessionRows,
      riskySessions,
      transactions: transactions.slice(0, limit).map((transaction) => ({
        id: transaction.id,
        type: transaction.type,
        status: transaction.status,
        paymentType: transaction.paymentType,
        totalAmount: money(transaction.totalAmount),
        vatAmount: money(transaction.vatAmount),
        customerCode: transaction.customerCode,
        customerName: transaction.customerName || transaction.customer?.displayName || transaction.customer?.mikroName || transaction.customer?.name || null,
        documentNo: transaction.mikroDocumentNo || transaction.documentNo || transaction.linkedOrderNumber || null,
        linkedOrderNumber: transaction.linkedOrderNumber,
        syncError: transaction.syncError,
        vehicleName: transaction.session?.vehicle?.name || null,
        plate: transaction.session?.vehicle?.plate || null,
        userName: transaction.session?.user?.displayName || transaction.session?.user?.name || transaction.session?.user?.email || null,
        itemCount: transaction.items.length,
        quantity: Number(transaction.items.reduce((sum, item) => sum + toNumber(item.quantity), 0).toFixed(3)),
        payments: transaction.payments.map((payment) => ({
          type: payment.type,
          amount: money(payment.amount),
          referenceNo: payment.referenceNo,
        })),
        createdAt: transaction.createdAt,
      })),
      topProducts: Array.from(productMap.values())
        .map((row) => ({
          ...row,
          quantity: Number(row.quantity.toFixed(3)),
          revenue: money(row.revenue),
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 30),
      stockSummary: Object.fromEntries(
        Object.entries(stockSummary).map(([key, value]) => [
          key,
          { count: value.count, quantity: Number(value.quantity.toFixed(3)) },
        ])
      ),
      stockMovements: stockMovements.slice(0, 200).map((movement) => ({
        id: movement.id,
        type: movement.type,
        productCode: movement.productCode,
        productName: movement.productName,
        unit: movement.unit,
        quantity: Number(toNumber(movement.quantity).toFixed(3)),
        documentNo: movement.documentNo,
        vehicleName: movement.session?.vehicle?.name || null,
        userName: movement.session?.user?.displayName || movement.session?.user?.name || movement.session?.user?.email || null,
        createdAt: movement.createdAt,
        note: movement.note,
      })),
      options: {
        vehicles: vehicles.map((vehicle) => ({
          id: vehicle.id,
          name: vehicle.name,
          plate: vehicle.plate,
          active: vehicle.active,
        })),
        users: users.map((row) => ({
          id: row.id,
          name: row.displayName || row.name || row.email,
          email: row.email,
        })),
      },
      generatedAt: new Date(),
    };
  }

  async getVehicleInventory(vehicleId: string) {
    const rows = await prisma.hotSaleStockLedger.groupBy({
      by: ['productCode'],
      where: { vehicleId },
      _sum: { quantity: true },
    });
    const codes = rows.map((row) => row.productCode);
    const products = codes.length
      ? await prisma.product.findMany({
          where: { mikroCode: { in: codes } },
          select: { mikroCode: true, name: true, unit: true, imageUrl: true },
        })
      : [];
    const productMap = new Map(products.map((product) => [normalizeCode(product.mikroCode), product]));
    return rows
      .map((row) => {
        const qty = toNumber(row._sum.quantity);
        const product = productMap.get(normalizeCode(row.productCode));
        return {
          productCode: row.productCode,
          productName: product?.name || row.productCode,
          unit: product?.unit || 'ADET',
          imageUrl: product?.imageUrl || null,
          quantity: qty,
        };
      })
      .filter((row) => Math.abs(row.quantity) > 0.0001)
      .sort((a, b) => a.productName.localeCompare(b.productName, 'tr'));
  }

  private async assertOpenSession(sessionId: string) {
    const session = await prisma.hotSaleSession.findUnique({ where: { id: sessionId }, include: { vehicle: true } });
    if (!session || session.status !== 'OPEN') {
      throw new AppError('Acik sicak satis oturumu bulunamadi.', 404, ErrorCode.NOT_FOUND);
    }
    return session;
  }

  async startSession(input: {
    vehicleId: string;
    userId: string;
    sourceWarehouseNo?: number;
    openingCash?: number;
    startKm?: number;
    latitude?: number;
    longitude?: number;
    note?: string;
    loadItems?: HotSaleItemInput[];
  }) {
    const vehicle = await prisma.hotSaleVehicle.findUnique({ where: { id: input.vehicleId } });
    if (!vehicle || !vehicle.active) throw new AppError('Aktif arac bulunamadi.', 404, ErrorCode.NOT_FOUND);

    const existingOpen = await prisma.hotSaleSession.findFirst({
      where: { vehicleId: vehicle.id, status: 'OPEN' },
    });
    if (existingOpen) {
      throw new AppError('Bu arac icin zaten acik sicak satis oturumu var.', 400, ErrorCode.BAD_REQUEST);
    }

    const sourceWarehouseNo = Math.max(Math.trunc(toNumber(input.sourceWarehouseNo, vehicle.defaultSourceWarehouseNo || 1)), 1);
    const rawLoadItems = Array.isArray(input.loadItems) ? input.loadItems : [];
    const productMap = await this.getProductRows(rawLoadItems.map((item) => normalizeCode(item.productCode)));
    const loadItems = this.normalizeItems(rawLoadItems, productMap, 1);
    let loadDocumentNo: string | null = null;
    if (loadItems.length > 0) {
      await this.validateWarehouseStock(sourceWarehouseNo, loadItems, `Kaynak depo ${sourceWarehouseNo}`);
      const doc = await this.createStockMovementDocument({
        kind: 'TRANSFER',
        series: DEFAULT_HOT_SERIES,
        items: loadItems,
        sourceWarehouseNo,
        targetWarehouseNo: HOT_WAREHOUSE_NO,
      });
      loadDocumentNo = doc.documentNo;
    }

    return prisma.$transaction(async (tx) => {
      const session = await tx.hotSaleSession.create({
        data: {
          vehicleId: vehicle.id,
          userId: input.userId,
          hotWarehouseNo: HOT_WAREHOUSE_NO,
          sourceWarehouseNo,
          openingCash: toNumber(input.openingCash),
          startKm: input.startKm === undefined ? undefined : toNumber(input.startKm),
          startLatitude: input.latitude === undefined ? undefined : toNumber(input.latitude),
          startLongitude: input.longitude === undefined ? undefined : toNumber(input.longitude),
          loadDocumentNo,
          note: String(input.note || '').trim() || undefined,
        },
      });

      if (loadItems.length > 0) {
        await tx.hotSaleStockLedger.createMany({
          data: loadItems.map((item) => ({
            sessionId: session.id,
            vehicleId: vehicle.id,
            type: 'LOAD',
            productCode: item.productCode,
            productName: item.productName,
            unit: item.unit,
            quantity: signedStockQty('LOAD', item.quantity),
            sourceWarehouseNo,
            targetWarehouseNo: HOT_WAREHOUSE_NO,
            documentNo: loadDocumentNo,
            createdById: input.userId,
          })),
        });
      }

      return session;
    });
  }

  async addLoad(sessionId: string, input: { userId: string; sourceWarehouseNo?: number; items: HotSaleItemInput[] }) {
    const session = await this.assertOpenSession(sessionId);
    const productMap = await this.getProductRows(input.items.map((item) => normalizeCode(item.productCode)));
    const items = this.normalizeItems(input.items, productMap, 1);
    if (!items.length) throw new AppError('Yuklenecek urun yok.', 400, ErrorCode.BAD_REQUEST);
    const sourceWarehouseNo = Math.max(Math.trunc(toNumber(input.sourceWarehouseNo, session.sourceWarehouseNo)), 1);
    await this.validateWarehouseStock(sourceWarehouseNo, items, `Kaynak depo ${sourceWarehouseNo}`);
    const doc = await this.createStockMovementDocument({
      kind: 'TRANSFER',
      series: DEFAULT_HOT_SERIES,
      items,
      sourceWarehouseNo,
      targetWarehouseNo: HOT_WAREHOUSE_NO,
    });
    await prisma.hotSaleStockLedger.createMany({
      data: items.map((item) => ({
        sessionId,
        vehicleId: session.vehicleId,
        type: 'LOAD',
        productCode: item.productCode,
        productName: item.productName,
        unit: item.unit,
        quantity: signedStockQty('LOAD', item.quantity),
        sourceWarehouseNo,
        targetWarehouseNo: HOT_WAREHOUSE_NO,
        documentNo: doc.documentNo,
        createdById: input.userId,
      })),
    });
    await prisma.hotSaleSession.update({ where: { id: sessionId }, data: { loadDocumentNo: doc.documentNo } });
    return doc;
  }

  async searchCustomers(params: { search?: string; limit?: number; scope: StaffScope }) {
    const base = await fieldSalesService.searchCustomers({
      search: params.search,
      limit: params.limit || 25,
      scope: params.scope,
    });
    const tokens = String(params.search || '').trim().split(/\s+/).filter(Boolean);
    const hotWhere: Prisma.UserWhereInput = {
      role: UserRole.CUSTOMER,
      active: true,
      OR: [{ sectorCode: HOT_CUSTOMER_SECTOR_CODE }, { groupCode: HOT_CUSTOMER_GROUP_CODE }],
      ...(tokens.length
        ? {
            AND: tokens.map((token) => ({
              OR: [
                { mikroCariCode: { contains: token, mode: 'insensitive' as const } },
                { displayName: { contains: token, mode: 'insensitive' as const } },
                { mikroName: { contains: token, mode: 'insensitive' as const } },
                { name: { contains: token, mode: 'insensitive' as const } },
                { phone: { contains: token, mode: 'insensitive' as const } },
                { city: { contains: token, mode: 'insensitive' as const } },
                { district: { contains: token, mode: 'insensitive' as const } },
              ],
            })),
          }
        : {}),
    };
    const hotCustomers = await prisma.user.findMany({
      where: hotWhere,
      select: HOT_CUSTOMER_SELECT,
      orderBy: [{ active: 'desc' }, { mikroCariCode: 'asc' }],
      take: Math.max(1, Math.min(Number(params.limit) || 25, 50)),
    });
    const byId = new Map<string, any>();
    [...(base.customers || []), ...hotCustomers].forEach((customer: any) => {
      byId.set(customer.id, {
        ...customer,
        displayTitle: customer.displayTitle || customer.displayName || customer.mikroName || customer.name || customer.mikroCariCode,
      });
    });
    return { customers: Array.from(byId.values()).slice(0, Math.max(1, Math.min(Number(params.limit) || 25, 50))) };
  }

  async searchProducts(params: { search?: string; limit?: number; vehicleId?: string; customerIdOrCode?: string; scope: StaffScope }) {
    const search = String(params.search || '').trim();
    const limitCap = search ? 120 : 1000;
    const limit = Math.max(1, Math.min(Math.trunc(toNumber(params.limit, search ? 40 : 500)), limitCap));
    let rows: any[] = [];
    const vehicleInventory = params.vehicleId ? await this.getVehicleInventory(params.vehicleId) : [];
    const vehicleCodeSet = new Set(vehicleInventory.map((row) => normalizeCode(row.productCode)));
    if (!search) {
      if (!params.vehicleId) return { products: [] };
      const inventory = vehicleInventory;
      const productMap = await this.getProductRows(inventory.map((row) => row.productCode));
      rows = inventory.map((item) => ({
        ...(productMap.get(normalizeCode(item.productCode)) || {}),
        productCode: item.productCode,
        productName: productMap.get(normalizeCode(item.productCode))?.productName || item.productName,
        unit: productMap.get(normalizeCode(item.productCode))?.unit || item.unit,
        vehicleLedgerStock: item.quantity,
      }));
    } else {
    const tokens = search.split(/\s+/).map((token) => token.trim()).filter(Boolean);
    const where = tokens.map((token) => {
      const safe = escapeSql(token);
      return `(sto_kod LIKE '%${safe}%' OR sto_isim LIKE '%${safe}%' OR EXISTS (SELECT 1 FROM BARKOD_TANIMLARI WITH (NOLOCK) WHERE bar_stokkodu = sto_kod AND ISNULL(bar_kodu, '') LIKE '%${safe}%'))`;
    }).join(' AND ');
      const vehicleCodes = Array.from(vehicleCodeSet);
      const vehicleOrder = vehicleCodes.length
        ? `CASE WHEN sto_kod IN (${vehicleCodes.map((code) => `'${escapeSql(code)}'`).join(', ')}) THEN 0 ELSE 1 END,`
        : '';
      rows = await mikroService.executeQuery(`
      SELECT TOP ${limit}
        sto_kod AS productCode,
        sto_isim AS productName,
        ISNULL(sto_birim1_ad, 'ADET') AS unit,
        ISNULL(sto_toptan_vergi, 0) AS vatCode,
        CAST(ISNULL(dbo.fn_DepodakiMiktar(sto_kod, 11, 0), 0) AS decimal(18,3)) AS hotStock,
        CAST(ISNULL(dbo.fn_DepodakiMiktar(sto_kod, 1, 0), 0) AS decimal(18,3)) AS stockMerkez,
        CAST(ISNULL(dbo.fn_DepodakiMiktar(sto_kod, 6, 0), 0) AS decimal(18,3)) AS stockTopca,
        CAST(ISNULL(sto_standartmaliyet, 0) AS decimal(18,4)) AS currentCost,
        CAST(ISNULL(dbo.fn_StokSatisFiyati(sto_kod, 1, 0, 1), 0) AS decimal(18,4)) AS price1,
        CAST(ISNULL(dbo.fn_StokSatisFiyati(sto_kod, 2, 0, 1), 0) AS decimal(18,4)) AS price2,
        CAST(ISNULL(dbo.fn_StokSatisFiyati(sto_kod, 3, 0, 1), 0) AS decimal(18,4)) AS price3,
        CAST(ISNULL(dbo.fn_StokSatisFiyati(sto_kod, 4, 0, 1), 0) AS decimal(18,4)) AS price4,
        CAST(ISNULL(dbo.fn_StokSatisFiyati(sto_kod, 5, 0, 1), 0) AS decimal(18,4)) AS price5,
        CAST(ISNULL(dbo.fn_StokSatisFiyati(sto_kod, 6, 0, 1), 0) AS decimal(18,4)) AS price6,
        CAST(ISNULL(dbo.fn_StokSatisFiyati(sto_kod, 7, 0, 1), 0) AS decimal(18,4)) AS price7,
        CAST(ISNULL(dbo.fn_StokSatisFiyati(sto_kod, 8, 0, 1), 0) AS decimal(18,4)) AS price8,
        CAST(ISNULL(dbo.fn_StokSatisFiyati(sto_kod, 9, 0, 1), 0) AS decimal(18,4)) AS price9,
        CAST(ISNULL(dbo.fn_StokSatisFiyati(sto_kod, 10, 0, 1), 0) AS decimal(18,4)) AS price10
      FROM STOKLAR WITH (NOLOCK)
      WHERE ISNULL(sto_pasif_fl, 0) = 0 AND ${where}
      ORDER BY ${vehicleOrder} sto_isim
    `);
    }
    const codes = rows.map((row) => normalizeCode(row.productCode));
    const localProducts = codes.length
      ? await prisma.product.findMany({ where: { mikroCode: { in: codes } }, select: { mikroCode: true, imageUrl: true, currentCost: true, lastEntryPrice: true } })
      : [];
    const imageMap = new Map(localProducts.map((product) => [normalizeCode(product.mikroCode), product]));
    const vehicleStock = new Map(vehicleInventory.map((row) => [normalizeCode(row.productCode), row.quantity]));
    const products = rows.map((row) => {
      const code = normalizeCode(row.productCode);
      const local = imageMap.get(code);
      const priceLists: Record<string, number> = {};
      for (let i = 1; i <= 10; i += 1) priceLists[i] = toNumber(row[`price${i}`]);
      const vatRate = row.vatCode === 7 ? 0.1 : row.vatCode === 2 ? 0.01 : row.vatCode === 5 ? 0.2 : 0;
      const currentCost = toNumber(row.currentCost, toNumber(local?.currentCost));
      const vehicleQty = toNumber(row.vehicleLedgerStock, toNumber(vehicleStock.get(code)));
      const hotWarehouseStock = toNumber(row.hotStock);
      const stockMerkez = toNumber(row.stockMerkez);
      const stockTopca = toNumber(row.stockTopca);
      const totalVisibleStock = vehicleQty + hotWarehouseStock + stockMerkez + stockTopca;
      return {
        productCode: code,
        productName: String(row.productName || code).trim(),
        unit: String(row.unit || 'ADET').trim(),
        vatRate,
        vehicleStock: vehicleQty,
        hotWarehouseStock,
        stockMerkez,
        stockTopca,
        totalVisibleStock,
        stockStatus: vehicleQty > 0 ? 'IN_VEHICLE' : totalVisibleStock <= 0 ? 'NO_STOCK' : 'OTHER_STOCK',
        priceLists,
        imageUrl: local?.imageUrl || null,
        currentCost,
        currentCostVatIncluded: currentCost * (1 + vatRate),
        lastEntryPrice: local?.lastEntryPrice ?? null,
      };
    });
    products.sort((a, b) => {
      const rank = (product: any) => (product.vehicleStock > 0 ? 0 : product.totalVisibleStock <= 0 ? 2 : 1);
      return rank(a) - rank(b) || String(a.productName).localeCompare(String(b.productName), 'tr');
    });
    return {
      products: products.slice(0, limit),
    };
  }

  private async getOpenHotOrderRows(orderNumber: string) {
    const parsed = parseMikroOrderNumber(orderNumber);
    if (!parsed) throw new AppError('Gecersiz siparis numarasi.', 400, ErrorCode.BAD_REQUEST);
    const rows = await mikroService.executeQuery(`
      SELECT
        CAST(s.sip_Guid AS nvarchar(36)) AS orderGuid,
        s.sip_satirno AS rowNumber,
        s.sip_evrakno_seri AS orderSeries,
        s.sip_evrakno_sira AS orderSequence,
        s.sip_tarih AS orderDate,
        s.sip_musteri_kod AS customerCode,
        c.cari_unvan1 AS customerName,
        ISNULL(s.sip_depono, ${HOT_WAREHOUSE_NO}) AS warehouseNo,
        s.sip_stok_kod AS productCode,
        st.sto_isim AS productName,
        ISNULL(st.sto_birim1_ad, 'ADET') AS unit,
        ISNULL(s.sip_miktar, 0) AS quantity,
        ISNULL(s.sip_teslim_miktar, 0) AS deliveredQty,
        ISNULL(s.sip_miktar, 0) - ISNULL(s.sip_teslim_miktar, 0) AS remainingQty,
        ISNULL(s.sip_b_fiyat, 0) AS unitPrice,
        ISNULL(s.sip_tutar, 0) AS lineTotal,
        ISNULL(s.sip_vergi, 0) AS vatAmount,
        ISNULL(s.sip_vergi_pntr, ISNULL(st.sto_toptan_vergi, 0)) AS vatCode,
        ISNULL(s.sip_fiyat_liste_no, 0) AS priceListNo,
        ISNULL(s.sip_stok_sormerk, '') AS stockResponsibilityCenter,
        ISNULL(s.sip_cari_sormerk, '') AS customerResponsibilityCenter,
        ISNULL(s.sip_projekodu, '') AS projectCode,
        ISNULL(dbo.fn_DepodakiMiktar(s.sip_stok_kod, ${HOT_WAREHOUSE_NO}, 0), 0) AS hotWarehouseStock
      FROM SIPARISLER s WITH (NOLOCK)
      LEFT JOIN STOKLAR st WITH (NOLOCK) ON st.sto_kod = s.sip_stok_kod
      LEFT JOIN CARI_HESAPLAR c WITH (NOLOCK) ON c.cari_kod = s.sip_musteri_kod
      WHERE s.sip_evrakno_seri = '${escapeSql(parsed.series)}'
        AND s.sip_evrakno_sira = ${parsed.sequence}
        AND ISNULL(s.sip_tip, 0) = 0
        AND ISNULL(s.sip_iptal, 0) = 0
        AND ISNULL(s.sip_kapat_fl, 0) = 0
        AND ISNULL(s.sip_depono, ${HOT_WAREHOUSE_NO}) = ${HOT_WAREHOUSE_NO}
        AND ISNULL(s.sip_miktar, 0) > ISNULL(s.sip_teslim_miktar, 0)
      ORDER BY s.sip_satirno
    `);
    return rows as any[];
  }

  async listOpenOrders(params: { search?: string; customerIdOrCode?: string; vehicleId?: string; limit?: number }) {
    const limit = Math.max(1, Math.min(Math.trunc(toNumber(params.limit, 30)), 100));
    const search = String(params.search || '').trim();
    const customerCode = normalizeCode(params.customerIdOrCode);
    const filters: string[] = [
      'ISNULL(s.sip_tip, 0) = 0',
      'ISNULL(s.sip_iptal, 0) = 0',
      'ISNULL(s.sip_kapat_fl, 0) = 0',
      `ISNULL(s.sip_depono, ${HOT_WAREHOUSE_NO}) = ${HOT_WAREHOUSE_NO}`,
      'ISNULL(s.sip_miktar, 0) > ISNULL(s.sip_teslim_miktar, 0)',
      `UPPER(s.sip_evrakno_seri) = '${DEFAULT_HOT_SERIES}'`,
    ];

    if (customerCode) {
      filters.push(`UPPER(s.sip_musteri_kod) = '${escapeSql(customerCode)}'`);
    }
    if (search) {
      const safe = escapeSql(search);
      filters.push(`(
        s.sip_evrakno_seri + '-' + CAST(s.sip_evrakno_sira AS nvarchar(20)) LIKE '%${safe}%'
        OR s.sip_musteri_kod LIKE '%${safe}%'
        OR ISNULL(c.cari_unvan1, '') LIKE '%${safe}%'
        OR s.sip_stok_kod LIKE '%${safe}%'
        OR ISNULL(st.sto_isim, '') LIKE '%${safe}%'
      )`);
    }

    const rows = await mikroService.executeQuery(`
      SELECT TOP ${limit * 20}
        CAST(s.sip_Guid AS nvarchar(36)) AS orderGuid,
        s.sip_satirno AS rowNumber,
        s.sip_evrakno_seri AS orderSeries,
        s.sip_evrakno_sira AS orderSequence,
        s.sip_tarih AS orderDate,
        s.sip_musteri_kod AS customerCode,
        c.cari_unvan1 AS customerName,
        s.sip_stok_kod AS productCode,
        st.sto_isim AS productName,
        ISNULL(st.sto_birim1_ad, 'ADET') AS unit,
        ISNULL(s.sip_miktar, 0) AS quantity,
        ISNULL(s.sip_teslim_miktar, 0) AS deliveredQty,
        ISNULL(s.sip_miktar, 0) - ISNULL(s.sip_teslim_miktar, 0) AS remainingQty,
        ISNULL(s.sip_b_fiyat, 0) AS unitPrice,
        ISNULL(s.sip_tutar, 0) AS lineTotal,
        ISNULL(s.sip_vergi, 0) AS vatAmount,
        ISNULL(s.sip_vergi_pntr, ISNULL(st.sto_toptan_vergi, 0)) AS vatCode,
        ISNULL(s.sip_fiyat_liste_no, 0) AS priceListNo
      FROM SIPARISLER s WITH (NOLOCK)
      LEFT JOIN STOKLAR st WITH (NOLOCK) ON st.sto_kod = s.sip_stok_kod
      LEFT JOIN CARI_HESAPLAR c WITH (NOLOCK) ON c.cari_kod = s.sip_musteri_kod
      WHERE ${filters.join('\n        AND ')}
      ORDER BY s.sip_tarih DESC, s.sip_evrakno_sira DESC, s.sip_satirno ASC
    `);

    const productCodes = Array.from(new Set((rows as any[]).map((row) => normalizeCode(row.productCode)).filter(Boolean)));
    const localProducts = productCodes.length
      ? await prisma.product.findMany({ where: { mikroCode: { in: productCodes } }, select: { mikroCode: true, imageUrl: true } })
      : [];
    const imageMap = new Map(localProducts.map((product) => [normalizeCode(product.mikroCode), product.imageUrl]));
    const vehicleStock = params.vehicleId
      ? new Map((await this.getVehicleInventory(params.vehicleId)).map((row) => [normalizeCode(row.productCode), row.quantity]))
      : new Map<string, number>();

    const grouped = new Map<string, any>();
    for (const row of rows as any[]) {
      const orderNumber = `${normalizeCode(row.orderSeries)}-${Math.trunc(toNumber(row.orderSequence))}`;
      if (!grouped.has(orderNumber)) {
        grouped.set(orderNumber, {
          orderNumber,
          orderDate: row.orderDate,
          customerCode: normalizeCode(row.customerCode),
          customerName: String(row.customerName || '').trim(),
          totalRemainingQty: 0,
          totalAmount: 0,
          canDeliverAll: true,
          items: [],
        });
      }
      const order = grouped.get(orderNumber);
      const productCode = normalizeCode(row.productCode);
      const remainingQty = Math.max(toNumber(row.remainingQty), 0);
      const available = toNumber(vehicleStock.get(productCode));
      const unitPrice = toNumber(row.unitPrice);
      order.totalRemainingQty += remainingQty;
      order.totalAmount += remainingQty * unitPrice;
      if (available + 0.0001 < remainingQty) order.canDeliverAll = false;
      order.items.push({
        orderGuid: normalizeCode(row.orderGuid),
        rowNumber: Math.trunc(toNumber(row.rowNumber)),
        productCode,
        productName: String(row.productName || productCode).trim(),
        unit: String(row.unit || 'ADET').trim(),
        quantity: toNumber(row.quantity),
        deliveredQty: toNumber(row.deliveredQty),
        remainingQty,
        unitPrice,
        lineTotal: remainingQty * unitPrice,
        vatRate: this.vatCodeToRate(row.vatCode),
        vatAmount: toNumber(row.vatAmount),
        priceListNo: Math.trunc(toNumber(row.priceListNo)),
        vehicleStock: available,
        imageUrl: imageMap.get(productCode) || null,
      });
    }

    return { orders: Array.from(grouped.values()).slice(0, limit) };
  }

  private async updateOrderDeliveredQuantities(lineLinks: Array<{ orderGuid: string; deliverQty: number }>) {
    for (const link of lineLinks) {
      const orderGuid = normalizeCode(link.orderGuid);
      const deliverQty = Math.max(toNumber(link.deliverQty), 0);
      if (!orderGuid || deliverQty <= 0) continue;
      await mikroService.executeQuery(`
        UPDATE SIPARISLER
        SET
          sip_teslim_miktar = CASE
            WHEN ISNULL(sip_teslim_miktar, 0) + ${deliverQty} > ISNULL(sip_miktar, 0) THEN ISNULL(sip_miktar, 0)
            ELSE ISNULL(sip_teslim_miktar, 0) + ${deliverQty}
          END,
          sip_kapat_fl = CASE
            WHEN CASE
              WHEN ISNULL(sip_teslim_miktar, 0) + ${deliverQty} > ISNULL(sip_miktar, 0) THEN ISNULL(sip_miktar, 0)
              ELSE ISNULL(sip_teslim_miktar, 0) + ${deliverQty}
            END >= ISNULL(sip_miktar, 0) THEN 1
            ELSE ISNULL(sip_kapat_fl, 0)
          END,
          sip_lastup_date = GETDATE()
        WHERE sip_Guid = CAST('${escapeSql(orderGuid)}' AS uniqueidentifier)
          AND ISNULL(sip_iptal, 0) = 0
      `);
    }
  }

  private async validateVehicleStock(vehicleId: string, items: Array<{ productCode: string; quantity: number }>) {
    const inventory = new Map((await this.getVehicleInventory(vehicleId)).map((row) => [normalizeCode(row.productCode), row.quantity]));
    const shortages = this.aggregateQuantities(items)
      .map((item) => {
        const available = toNumber(inventory.get(normalizeCode(item.productCode)));
        return available + 0.0001 >= item.quantity ? null : { productCode: item.productCode, requested: item.quantity, available };
      })
      .filter(Boolean);
    if (shortages.length) {
      throw new AppError(`Arac stogu yetersiz: ${(shortages as any[]).map((row) => `${row.productCode} (${row.available}/${row.requested})`).join(', ')}`, 400, ErrorCode.BAD_REQUEST);
    }
  }

  async createTransaction(sessionId: string, input: {
    userId: string;
    type: HotSaleTransactionType;
    customerId?: string;
    customerCode?: string;
    customerName?: string;
    paymentType?: HotSalePaymentType;
    priceListNo?: number;
    note?: string;
    latitude?: number;
    longitude?: number;
    items: HotSaleItemInput[];
    payments?: HotSalePaymentInput[];
  }) {
    const session = await this.assertOpenSession(sessionId);
    const productMap = await this.getProductRows(input.items.map((item) => normalizeCode(item.productCode)));
    const defaultPriceListNo = input.type === 'CASH_INVOICE' ? 5 : input.type === 'INVOICED_DISPATCH' ? 6 : 6;
    const items = this.normalizeItems(input.items, productMap, input.priceListNo || defaultPriceListNo);
    if (!items.length) throw new AppError('Satis/siparis icin urun yok.', 400, ErrorCode.BAD_REQUEST);
    this.validatePriceFloor(input.type, items);

    const customer = input.customerId
      ? await prisma.user.findUnique({ where: { id: input.customerId }, select: { id: true, mikroCariCode: true, displayName: true, mikroName: true, name: true, paymentPlanNo: true } })
      : null;
    const customerCode =
      normalizeCode(customer?.mikroCariCode || input.customerCode) ||
      (input.paymentType === 'CARD' ? DEFAULT_CARD_CUSTOMER : DEFAULT_CASH_CUSTOMER);
    const customerName = customer?.displayName || customer?.mikroName || customer?.name || input.customerName || customerCode;
    const paymentType = input.paymentType || (input.type === 'INVOICED_DISPATCH' ? 'OPEN_ACCOUNT' : 'CASH');

    let mikroDocumentNo: string | null = null;
    let linkedOrderId: string | null = null;
    let linkedOrderNumber: string | null = null;
    let status: 'COMPLETED' | 'SYNC_FAILED' = 'COMPLETED';
    let syncError: string | null = null;
    let totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    let vatAmount = input.type === 'CASH_INVOICE' ? 0 : items.reduce((sum, item) => sum + item.quantity * item.unitPrice * item.vatRate, 0);

    try {
      if (input.type === 'CASH_INVOICE') {
        await this.validateVehicleStock(session.vehicleId, items);
        const doc = await this.createStockMovementDocument({
          kind: 'INVOICE',
          series: session.vehicle.defaultInvoiceSeries || DEFAULT_HOT_SERIES,
          customerCode,
          items,
          vatZeroed: true,
          paymentOp: paymentType === 'CARD' ? 12 : 1,
        });
        mikroDocumentNo = doc.documentNo;
        totalAmount = doc.totalAmount;
        vatAmount = 0;
      } else if (input.type === 'INVOICED_DISPATCH') {
        if (!customer?.id && !input.customerCode) {
          throw new AppError('Faturali irsaliye icin cari zorunlu.', 400, ErrorCode.BAD_REQUEST);
        }
        await this.validateVehicleStock(session.vehicleId, items);
        const doc = await this.createStockMovementDocument({
          kind: 'DISPATCH',
          series: session.vehicle.defaultDispatchSeries || DEFAULT_HOT_SERIES,
          customerCode,
          items,
          vatZeroed: false,
          paymentOp: 2,
        });
        mikroDocumentNo = doc.documentNo;
        totalAmount = doc.totalAmount;
        vatAmount = doc.vatAmount;
      } else {
        if (!customer?.id) {
          throw new AppError('Siparis icin sistemde kayitli cari zorunlu.', 400, ErrorCode.BAD_REQUEST);
        }
        const result = await orderService.createManualOrder({
          customerId: customer.id,
          warehouseNo: HOT_WAREHOUSE_NO,
          description: input.note || 'Sicak satis siparisi',
          documentDescription: input.note || undefined,
          invoicedSeries: session.vehicle.defaultOrderSeries || DEFAULT_HOT_SERIES,
          whiteSeries: session.vehicle.defaultOrderSeries || DEFAULT_HOT_SERIES,
          requestedById: input.userId,
          items: items.map((item) => ({
            productCode: item.productCode,
            productName: item.productName,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            priceType: input.type === 'ORDER' ? 'INVOICED' : 'INVOICED',
            vatZeroed: false,
            lineDescription: item.note || item.productName,
          })),
        });
        linkedOrderId = result.orderId;
        linkedOrderNumber = result.orderNumber;
        mikroDocumentNo = result.mikroOrderIds.join(', ');
      }
    } catch (error: any) {
      status = 'SYNC_FAILED';
      syncError = error?.message || 'Mikro islemi basarisiz';
      if (input.type !== 'ORDER') throw error;
    }

    return prisma.$transaction(async (tx) => {
      const transaction = await tx.hotSaleTransaction.create({
        data: {
          sessionId,
          type: input.type,
          status,
          customerId: customer?.id || null,
          customerCode,
          customerName,
          paymentType,
          priceListNo: input.priceListNo || defaultPriceListNo,
          mikroDocumentNo,
          linkedOrderId,
          linkedOrderNumber,
          totalAmount,
          vatAmount,
          note: String(input.note || '').trim() || null,
          latitude: input.latitude === undefined ? null : toNumber(input.latitude),
          longitude: input.longitude === undefined ? null : toNumber(input.longitude),
          syncError,
          createdById: input.userId,
          items: {
            create: items.map((item) => ({
              productCode: item.productCode,
              productName: item.productName,
              unit: item.unit,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.quantity * item.unitPrice,
              vatRate: input.type === 'CASH_INVOICE' ? 0 : item.vatRate,
              vatAmount: input.type === 'CASH_INVOICE' ? 0 : item.quantity * item.unitPrice * item.vatRate,
              priceListNo: item.priceListNo,
              priceType: input.type === 'CASH_INVOICE' ? 'WHITE' : 'INVOICED',
              note: item.note,
            })),
          },
          payments: {
            create: (input.payments?.length ? input.payments : [{ type: paymentType, amount: totalAmount }]).map((payment) => ({
              type: payment.type || paymentType,
              amount: toNumber(payment.amount, totalAmount),
              referenceNo: String(payment.referenceNo || '').trim() || null,
              note: String(payment.note || '').trim() || null,
            })),
          },
        },
        include: { items: true, payments: true },
      });

      if (input.type === 'CASH_INVOICE' || input.type === 'INVOICED_DISPATCH') {
        await tx.hotSaleStockLedger.createMany({
          data: items.map((item) => ({
            sessionId,
            vehicleId: session.vehicleId,
            transactionId: transaction.id,
            type: 'SALE',
            productCode: item.productCode,
            productName: item.productName,
            unit: item.unit,
            quantity: signedStockQty('SALE', item.quantity),
            sourceWarehouseNo: HOT_WAREHOUSE_NO,
            documentNo: mikroDocumentNo,
            createdById: input.userId,
          })),
        });
      }

      const cashAmount = transaction.payments
        .filter((payment) => payment.type === 'CASH')
        .reduce((sum, payment) => sum + payment.amount, 0);
      if (cashAmount > 0) {
        await tx.hotSaleSession.update({
          where: { id: sessionId },
          data: { expectedCash: { increment: cashAmount } },
        });
      }

      return transaction;
    });
  }

  async deliverOrderFromVehicle(sessionId: string, input: {
    userId: string;
    orderNumber: string;
    note?: string;
    latitude?: number;
    longitude?: number;
    items?: Array<{ orderGuid?: string; productCode?: string; quantity?: number }>;
  }) {
    const session = await this.assertOpenSession(sessionId);
    const orderNumber = normalizeCode(input.orderNumber);
    const orderRows = await this.getOpenHotOrderRows(orderNumber);
    if (!orderRows.length) {
      throw new AppError('Teslim edilecek acik SICAK siparis bulunamadi.', 404, ErrorCode.NOT_FOUND);
    }

    const requestedByGuid = new Map(
      (input.items || [])
        .map((item) => [normalizeCode(item.orderGuid), Math.max(toNumber(item.quantity), 0)] as const)
        .filter(([guid, quantity]) => Boolean(guid) && quantity > 0)
    );
    const requestedByCode = new Map(
      (input.items || [])
        .map((item) => [normalizeCode(item.productCode), Math.max(toNumber(item.quantity), 0)] as const)
        .filter(([code, quantity]) => Boolean(code) && quantity > 0)
    );
    const hasRequestedItems = requestedByGuid.size > 0 || requestedByCode.size > 0;

    const items = orderRows
      .map((row) => {
        const productCode = normalizeCode(row.productCode);
        const remainingQty = Math.max(toNumber(row.remainingQty), 0);
        const requestedQty = requestedByGuid.get(normalizeCode(row.orderGuid)) ?? requestedByCode.get(productCode) ?? remainingQty;
        const quantity = Math.min(remainingQty, Math.max(requestedQty, 0));
        return {
          productCode,
          productName: String(row.productName || productCode).trim(),
          unit: String(row.unit || 'ADET').trim() || 'ADET',
          quantity,
          unitPrice: Math.max(toNumber(row.unitPrice), 0),
          vatRate: this.vatCodeToRate(row.vatCode),
          priceListNo: Math.max(Math.trunc(toNumber(row.priceListNo)), 0),
          orderGuid: normalizeCode(row.orderGuid),
          orderRowNumber: Math.trunc(toNumber(row.rowNumber)),
          note: String(input.note || '').trim() || undefined,
        };
      })
      .filter((item) => item.quantity > 0 && (!hasRequestedItems || requestedByGuid.has(item.orderGuid) || requestedByCode.has(item.productCode)));

    if (!items.length) {
      throw new AppError('Teslim edilecek siparis satiri secilmedi.', 400, ErrorCode.BAD_REQUEST);
    }
    await this.validateVehicleStock(session.vehicleId, items);

    const customerCode = normalizeCode(orderRows[0]?.customerCode);
    const customerName = String(orderRows[0]?.customerName || customerCode).trim();
    const doc = await this.createStockMovementDocument({
      kind: 'DISPATCH',
      series: session.vehicle.defaultDispatchSeries || DEFAULT_HOT_SERIES,
      customerCode,
      items,
      vatZeroed: false,
      paymentOp: 2,
    });
    await this.updateOrderDeliveredQuantities(items.map((item) => ({ orderGuid: item.orderGuid, deliverQty: item.quantity })));

    return prisma.$transaction(async (tx) => {
      const transaction = await tx.hotSaleTransaction.create({
        data: {
          sessionId,
          type: 'ORDER_DELIVERY',
          status: 'COMPLETED',
          customerCode,
          customerName,
          paymentType: 'OPEN_ACCOUNT',
          priceListNo: items[0]?.priceListNo || 6,
          mikroDocumentNo: doc.documentNo,
          linkedOrderNumber: orderNumber,
          totalAmount: doc.totalAmount,
          vatAmount: doc.vatAmount,
          note: String(input.note || '').trim() || null,
          latitude: input.latitude === undefined ? null : toNumber(input.latitude),
          longitude: input.longitude === undefined ? null : toNumber(input.longitude),
          createdById: input.userId,
          items: {
            create: items.map((item) => ({
              productCode: item.productCode,
              productName: item.productName,
              unit: item.unit,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.quantity * item.unitPrice,
              vatRate: item.vatRate,
              vatAmount: item.quantity * item.unitPrice * item.vatRate,
              priceListNo: item.priceListNo,
              priceType: 'INVOICED',
              note: item.note,
            })),
          },
          payments: {
            create: [{ type: 'OPEN_ACCOUNT', amount: doc.totalAmount }],
          },
        },
        include: { items: true, payments: true },
      });

      await tx.hotSaleStockLedger.createMany({
        data: items.map((item) => ({
          sessionId,
          vehicleId: session.vehicleId,
          transactionId: transaction.id,
          type: 'SALE',
          productCode: item.productCode,
          productName: item.productName,
          unit: item.unit,
          quantity: signedStockQty('SALE', item.quantity),
          sourceWarehouseNo: HOT_WAREHOUSE_NO,
          documentNo: doc.documentNo,
          note: `Siparisten teslim: ${orderNumber}`,
          createdById: input.userId,
        })),
      });

      return transaction;
    });
  }

  async closeSession(sessionId: string, input: {
    userId: string;
    closingCash?: number;
    endKm?: number;
    latitude?: number;
    longitude?: number;
    note?: string;
    counts: Array<{
      productCode: string;
      countedQty: number;
      action?: HotSaleClosureAction;
      note?: string;
    }>;
  }) {
    const session = await this.assertOpenSession(sessionId);
    const inventory = await this.getVehicleInventory(session.vehicleId);
    const countByCode = new Map((input.counts || []).map((row) => [normalizeCode(row.productCode), row]));
    const missingCounts = inventory.filter((row) => Math.abs(row.quantity) > 0.0001 && !countByCode.has(normalizeCode(row.productCode)));
    if (missingCounts.length) {
      throw new AppError(`Sayim zorunlu urunler eksik: ${missingCounts.map((row) => row.productCode).join(', ')}`, 400, ErrorCode.BAD_REQUEST);
    }

    const closingRows = inventory.map((row) => {
      const count = countByCode.get(normalizeCode(row.productCode));
      const countedQty = toNumber(count?.countedQty);
      const action = count?.action || 'KEEP_ON_VEHICLE';
      const returnQty = action === 'RETURN_TO_DEPOT' ? countedQty : 0;
      const keepQty = action === 'KEEP_ON_VEHICLE' ? countedQty : 0;
      return {
        ...row,
        countedQty,
        differenceQty: countedQty - row.quantity,
        action,
        returnQty,
        keepQty,
        note: String(count?.note || '').trim() || null,
      };
    });

    const returnItems = closingRows
      .filter((row) => row.action === 'RETURN_TO_DEPOT' && row.returnQty > 0)
      .map((row) => ({
        productCode: row.productCode,
        productName: row.productName,
        unit: row.unit,
        quantity: row.returnQty,
        unitPrice: 0,
        priceListNo: 0,
      }));
    let returnDocumentNo: string | null = null;
    if (returnItems.length > 0) {
      await this.validateWarehouseStock(HOT_WAREHOUSE_NO, returnItems, 'Sicak depo');
      const doc = await this.createStockMovementDocument({
        kind: 'TRANSFER',
        series: DEFAULT_HOT_SERIES,
        items: returnItems,
        sourceWarehouseNo: HOT_WAREHOUSE_NO,
        targetWarehouseNo: session.sourceWarehouseNo || 1,
      });
      returnDocumentNo = doc.documentNo;
    }

    const closingCash = toNumber(input.closingCash);
    const cashDifference = closingCash - (session.openingCash + session.expectedCash);

    return prisma.$transaction(async (tx) => {
      await tx.hotSaleClosingCount.createMany({
        data: closingRows.map((row) => ({
          sessionId,
          productCode: row.productCode,
          productName: row.productName,
          unit: row.unit,
          expectedQty: row.quantity,
          countedQty: row.countedQty,
          differenceQty: row.differenceQty,
          action: row.action,
          returnQty: row.returnQty,
          keepQty: row.keepQty,
          note: row.note,
        })),
      });

      const ledgerRows: any[] = [];
      closingRows.forEach((row) => {
        if (Math.abs(row.differenceQty) > 0.0001) {
          ledgerRows.push({
            sessionId,
            vehicleId: session.vehicleId,
            type: 'ADJUSTMENT',
            productCode: row.productCode,
            productName: row.productName,
            unit: row.unit,
            quantity: row.differenceQty,
            note: row.note || 'Gun sonu sayim farki',
            createdById: input.userId,
          });
        }
        if (row.returnQty > 0) {
          ledgerRows.push({
            sessionId,
            vehicleId: session.vehicleId,
            type: 'RETURN_TO_DEPOT',
            productCode: row.productCode,
            productName: row.productName,
            unit: row.unit,
            quantity: signedStockQty('RETURN_TO_DEPOT', row.returnQty),
            sourceWarehouseNo: HOT_WAREHOUSE_NO,
            targetWarehouseNo: session.sourceWarehouseNo || 1,
            documentNo: returnDocumentNo,
            createdById: input.userId,
          });
        }
      });
      if (ledgerRows.length) await tx.hotSaleStockLedger.createMany({ data: ledgerRows });

      return tx.hotSaleSession.update({
        where: { id: sessionId },
        data: {
          status: 'CLOSED',
          closingCash,
          cashDifference,
          endKm: input.endKm === undefined ? null : toNumber(input.endKm),
          endLatitude: input.latitude === undefined ? null : toNumber(input.latitude),
          endLongitude: input.longitude === undefined ? null : toNumber(input.longitude),
          returnDocumentNo,
          closeNote: String(input.note || '').trim() || null,
          closedAt: new Date(),
        },
        include: { vehicle: true, closingCounts: true },
      });
    });
  }

  private splitStockDocumentNumbers(value?: string | null) {
    return String(value || '')
      .split(',')
      .map((part) => parseMikroOrderNumber(part.trim()))
      .filter(Boolean) as Array<{ series: string; sequence: number }>;
  }

  private hotTransactionDocumentKind(type: string) {
    if (type === 'CASH_INVOICE') return 'INVOICE';
    if (type === 'INVOICED_DISPATCH' || type === 'ORDER_DELIVERY') return 'DISPATCH';
    return 'OTHER';
  }

  private documentKey(documentNo: string, kind?: string) {
    return `${normalizeCode(documentNo)}:${normalizeCode(kind || '')}`;
  }

  private async getMikroStockDocumentSummaries(documents: Array<{ series: string; sequence: number; kind?: string }>) {
    if (!documents.length) return new Map<string, any>();
    const filters = documents
      .map((doc) => `(UPPER(sth_evrakno_seri) = '${escapeSql(doc.series.toUpperCase())}' AND sth_evrakno_sira = ${Math.trunc(doc.sequence)})`)
      .join(' OR ');
    const rows = await mikroService.executeQuery(`
      SELECT
        documentNo,
        documentKind,
        MAX(sth_tarih) AS documentDate,
        COUNT(*) AS lineCount,
        SUM(ISNULL(sth_miktar, 0)) AS totalQty,
        SUM(ISNULL(sth_tutar, 0)) AS totalAmount
      FROM (
        SELECT
          UPPER(sth_evrakno_seri) + '-' + CAST(sth_evrakno_sira AS nvarchar(20)) AS documentNo,
          CASE
            WHEN ISNULL(sth_tip, 0) = 2 AND ISNULL(sth_cins, 0) = 6 AND ISNULL(sth_evraktip, 0) = 2 THEN 'TRANSFER'
            WHEN ISNULL(sth_evraktip, 0) = 1 THEN 'DISPATCH'
            WHEN ISNULL(sth_evraktip, 0) = 4 THEN 'INVOICE'
            ELSE 'OTHER'
          END AS documentKind,
          sth_tarih,
          sth_miktar,
          sth_tutar
        FROM STOK_HAREKETLERI WITH (NOLOCK)
        WHERE ISNULL(sth_iptal, 0) = 0
          AND (${filters})
      ) d
      GROUP BY documentNo, documentKind
    `);
    return new Map((rows as any[]).map((row) => [this.documentKey(row.documentNo, row.documentKind), row]));
  }

  async getReconciliation(limit = 80) {
    const take = Math.max(10, Math.min(Math.trunc(toNumber(limit, 80)), 200));
    const transactions = await prisma.hotSaleTransaction.findMany({
      take,
      include: {
        session: { include: { vehicle: true } },
        items: true,
        createdBy: { select: { id: true, name: true, displayName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const stockDocTypes = new Set(['CASH_INVOICE', 'INVOICED_DISPATCH', 'ORDER_DELIVERY']);
    const localDocs = transactions
      .filter((transaction) => stockDocTypes.has(transaction.type))
      .flatMap((transaction) =>
        this.splitStockDocumentNumbers(transaction.mikroDocumentNo).map((doc) => ({
          ...doc,
          kind: this.hotTransactionDocumentKind(transaction.type),
        }))
      )
      .filter((doc) => doc.series === DEFAULT_HOT_SERIES);
    const mikroSummary = await this.getMikroStockDocumentSummaries(localDocs);

    const localProblems = transactions
      .map((transaction) => {
        const docs = stockDocTypes.has(transaction.type)
          ? this.splitStockDocumentNumbers(transaction.mikroDocumentNo).filter((doc) => doc.series === DEFAULT_HOT_SERIES)
          : [];
        const missingDocs = docs
          .map((doc) => `${doc.series}-${doc.sequence}`)
          .filter((docNo) => !mikroSummary.has(this.documentKey(docNo, this.hotTransactionDocumentKind(transaction.type))));
        const localQty = transaction.items.reduce((sum, item) => sum + toNumber(item.quantity), 0);
        return {
          id: transaction.id,
          type: transaction.type,
          status: transaction.status,
          documentNo: transaction.mikroDocumentNo,
          linkedOrderNumber: transaction.linkedOrderNumber,
          customerName: transaction.customerName,
          customerCode: transaction.customerCode,
          vehicleName: transaction.session?.vehicle?.name,
          createdAt: transaction.createdAt,
          createdBy: transaction.createdBy?.displayName || transaction.createdBy?.name || transaction.createdBy?.email,
          totalAmount: transaction.totalAmount,
          localQty,
          missingDocs,
          syncError: transaction.syncError,
          canCancelLocal: transaction.status !== 'CANCELLED' && transaction.session?.status === 'OPEN',
        };
      })
      .filter((row) => row.status === 'SYNC_FAILED' || row.missingDocs.length > 0);

    const recentMikroRows = await mikroService.executeQuery(`
      SELECT TOP 120
        documentNo,
        documentKind,
        MAX(sth_tarih) AS documentDate,
        COUNT(*) AS lineCount,
        SUM(ISNULL(sth_miktar, 0)) AS totalQty,
        SUM(ISNULL(sth_tutar, 0)) AS totalAmount
      FROM (
        SELECT
          UPPER(sth_evrakno_seri) + '-' + CAST(sth_evrakno_sira AS nvarchar(20)) AS documentNo,
          sth_evrakno_sira,
          CASE
            WHEN ISNULL(sth_tip, 0) = 2 AND ISNULL(sth_cins, 0) = 6 AND ISNULL(sth_evraktip, 0) = 2 THEN 'TRANSFER'
            WHEN ISNULL(sth_evraktip, 0) = 1 THEN 'DISPATCH'
            WHEN ISNULL(sth_evraktip, 0) = 4 THEN 'INVOICE'
            ELSE 'OTHER'
          END AS documentKind,
          sth_tarih,
          sth_miktar,
          sth_tutar
        FROM STOK_HAREKETLERI WITH (NOLOCK)
        WHERE ISNULL(sth_iptal, 0) = 0
          AND UPPER(sth_evrakno_seri) = '${DEFAULT_HOT_SERIES}'
          AND sth_tarih >= DATEADD(day, -14, CAST(GETDATE() AS date))
          AND (
            ${this.stockMovementKindFilter('TRANSFER')}
            OR ${this.stockMovementKindFilter('DISPATCH')}
            OR ${this.stockMovementKindFilter('INVOICE')}
          )
      ) d
      GROUP BY documentNo, documentKind, sth_evrakno_sira
      ORDER BY MAX(sth_tarih) DESC, sth_evrakno_sira DESC
    `);
    const recentSessions = await prisma.hotSaleSession.findMany({
      take: 120,
      select: { loadDocumentNo: true, returnDocumentNo: true },
      orderBy: { startedAt: 'desc' },
    });
    const knownLocalDocs = new Set([
      ...transactions
        .filter((transaction) => stockDocTypes.has(transaction.type))
        .flatMap((transaction) =>
          this.splitStockDocumentNumbers(transaction.mikroDocumentNo).map((doc) =>
            this.documentKey(`${doc.series}-${doc.sequence}`, this.hotTransactionDocumentKind(transaction.type))
          )
        ),
      ...recentSessions
        .flatMap((session) => [session.loadDocumentNo, session.returnDocumentNo])
        .flatMap((documentNo) => this.splitStockDocumentNumbers(documentNo))
        .map((doc) => this.documentKey(`${doc.series}-${doc.sequence}`, 'TRANSFER')),
    ]);
    const orphanMikroDocs = (recentMikroRows as any[])
      .filter((row) => !knownLocalDocs.has(this.documentKey(row.documentNo, row.documentKind)))
      .slice(0, 50);

    return {
      localProblems,
      orphanMikroDocs,
      checkedTransactions: transactions.length,
      checkedAt: new Date().toISOString(),
    };
  }

  async cancelTransactionLocally(transactionId: string, input: { userId: string; note?: string }) {
    const transaction = await prisma.hotSaleTransaction.findUnique({
      where: { id: transactionId },
      include: { session: true, items: true },
    });
    if (!transaction) throw new AppError('Sicak satis islemi bulunamadi.', 404, ErrorCode.NOT_FOUND);
    if (transaction.status === 'CANCELLED') throw new AppError('Bu islem zaten iptal isaretli.', 400, ErrorCode.BAD_REQUEST);
    if (transaction.session.status !== 'OPEN') {
      throw new AppError('Kapali oturumdaki islem otomatik duzeltilemez. Once muhasebe/Mikro kontrolu gerekir.', 400, ErrorCode.BAD_REQUEST);
    }

    const shouldReverseStock = ['CASH_INVOICE', 'INVOICED_DISPATCH', 'ORDER_DELIVERY'].includes(transaction.type);
    return prisma.$transaction(async (tx) => {
      if (shouldReverseStock && transaction.items.length) {
        await tx.hotSaleStockLedger.createMany({
          data: transaction.items.map((item) => ({
            sessionId: transaction.sessionId,
            vehicleId: transaction.session.vehicleId,
            transactionId: transaction.id,
            type: 'ADJUSTMENT',
            productCode: item.productCode,
            productName: item.productName,
            unit: item.unit,
            quantity: Math.abs(toNumber(item.quantity)),
            sourceWarehouseNo: HOT_WAREHOUSE_NO,
            documentNo: transaction.mikroDocumentNo,
            note: `Yerel iptal/geri alma: ${String(input.note || '').trim() || 'not yok'}`,
            createdById: input.userId,
          })),
        });
      }
      return tx.hotSaleTransaction.update({
        where: { id: transactionId },
        data: {
          status: 'CANCELLED',
          syncError: `Yerel iptal/geri alma. Mikro evragi manuel kontrol edilmeli. ${String(input.note || '').trim()}`.trim(),
        },
        include: { items: true, payments: true, session: { include: { vehicle: true } } },
      });
    });
  }

  async getSessionDetail(sessionId: string) {
    const session = await prisma.hotSaleSession.findUnique({
      where: { id: sessionId },
      include: {
        vehicle: true,
        user: { select: { id: true, name: true, displayName: true, email: true } },
        transactions: { include: { items: true, payments: true }, orderBy: { createdAt: 'desc' } },
        closingCounts: true,
      },
    });
    if (!session) throw new AppError('Sicak satis oturumu bulunamadi.', 404, ErrorCode.NOT_FOUND);
    const inventory = await this.getVehicleInventory(session.vehicleId);
    return { session, inventory };
  }
}

export default new HotSaleService();
