import { randomUUID } from 'crypto';
import {
  HotSaleClosureAction,
  HotSalePaymentType,
  HotSaleStockMovementType,
  HotSaleTransactionType,
} from '@prisma/client';
import { prisma } from '../utils/prisma';
import { AppError, ErrorCode } from '../types/errors';
import mikroService from './mikroFactory.service';
import fieldSalesService from './field-sales.service';
import orderService from './order.service';

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

const HOT_WAREHOUSE_NO = 11;
const DEFAULT_HOT_SERIES = 'SICAK';
const DEFAULT_CASH_CUSTOMER = '120.01.005';
const DEFAULT_CARD_CUSTOMER = '120.01.860';

const normalizeCode = (value: unknown) => String(value || '').trim().toUpperCase();
const escapeSql = (value: string) => String(value || '').replace(/'/g, "''");
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

  private async getNextStockMovementSequence(series: string): Promise<number> {
    const rows = await mikroService.executeQuery(`
      SELECT ISNULL(MAX(sth_evrakno_sira), 0) + 1 AS nextSira
      FROM STOK_HAREKETLERI WITH (NOLOCK)
      WHERE UPPER(sth_evrakno_seri) = '${escapeSql(series.toUpperCase())}'
    `);
    const next = Number((rows as any[])?.[0]?.nextSira || 0);
    if (!Number.isFinite(next) || next <= 0) {
      throw new AppError('Mikro evrak sira numarasi alinamadi.', 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }
    return Math.trunc(next);
  }

  private async getStockMovementTemplate(kind: 'TRANSFER' | 'INVOICE' | 'DISPATCH') {
    const filter =
      kind === 'TRANSFER'
        ? "ISNULL(sth_tip, 0) = 2 AND ISNULL(sth_cins, 0) = 6 AND ISNULL(sth_evraktip, 0) = 2"
        : kind === 'DISPATCH'
          ? "ISNULL(sth_tip, 1) = 1 AND ISNULL(sth_cins, 0) = 0 AND ISNULL(sth_evraktip, 0) = 1"
          : "ISNULL(sth_tip, 1) = 1 AND ISNULL(sth_cins, 0) = 0 AND ISNULL(sth_evraktip, 0) = 4";
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
        return {
          productCode,
          productName: String(row?.productName || productCode).trim(),
          unit: String(item.unit || row?.unit || 'ADET').trim() || 'ADET',
          quantity,
          unitPrice,
          priceListNo,
          vatRate,
          note: String(item.note || '').trim() || undefined,
        };
      })
      .filter((item) => item.productCode && item.quantity > 0);
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
    const sequence = await this.getNextStockMovementSequence(series);
    const columns = await this.getTableColumns('STOK_HAREKETLERI');
    const zeroGuid = '00000000-0000-0000-0000-000000000000';
    const mikroUserNoRaw = Number(process.env.MIKRO_USER_NO || process.env.MIKRO_USERNO || 1);
    const mikroUserNo = Number.isFinite(mikroUserNoRaw) && mikroUserNoRaw > 0 ? Math.trunc(mikroUserNoRaw) : 1;
    const defaultSorMerkez = String(process.env.MIKRO_SORMERK || 'HENDEK').trim().slice(0, 25);
    const docGuid = randomUUID();
    let totalAmount = 0;
    let vatAmount = 0;

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
        sth_evrakno_sira: sequence,
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

      await mikroService.executeQuery(this.buildInsertSql('STOK_HAREKETLERI', values, columns));
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
    return fieldSalesService.searchCustomers({
      search: params.search,
      limit: params.limit || 25,
      scope: params.scope,
    });
  }

  async searchProducts(params: { search?: string; limit?: number; vehicleId?: string; customerIdOrCode?: string; scope: StaffScope }) {
    const search = String(params.search || '').trim();
    const limit = Math.max(1, Math.min(Math.trunc(toNumber(params.limit, 40)), 120));
    if (!search) return { products: [] };
    const tokens = search.split(/\s+/).map((token) => token.trim()).filter(Boolean);
    const where = tokens.map((token) => {
      const safe = escapeSql(token);
      return `(sto_kod LIKE '%${safe}%' OR sto_isim LIKE '%${safe}%' OR EXISTS (SELECT 1 FROM BARKOD_TANIMLARI WITH (NOLOCK) WHERE bar_stokkodu = sto_kod AND ISNULL(bar_kodu, '') LIKE '%${safe}%'))`;
    }).join(' AND ');
    const rows = await mikroService.executeQuery(`
      SELECT TOP ${limit}
        sto_kod AS productCode,
        sto_isim AS productName,
        ISNULL(sto_birim1_ad, 'ADET') AS unit,
        ISNULL(sto_toptan_vergi, 0) AS vatCode,
        CAST(ISNULL(dbo.fn_DepodakiMiktar(sto_kod, 11, 0), 0) AS decimal(18,3)) AS hotStock,
        CAST(ISNULL(dbo.fn_DepodakiMiktar(sto_kod, 1, 0), 0) AS decimal(18,3)) AS stockMerkez,
        CAST(ISNULL(dbo.fn_DepodakiMiktar(sto_kod, 6, 0), 0) AS decimal(18,3)) AS stockTopca,
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
      ORDER BY sto_isim
    `);
    const codes = (rows as any[]).map((row) => normalizeCode(row.productCode));
    const localProducts = codes.length
      ? await prisma.product.findMany({ where: { mikroCode: { in: codes } }, select: { mikroCode: true, imageUrl: true, currentCost: true, lastEntryPrice: true } })
      : [];
    const imageMap = new Map(localProducts.map((product) => [normalizeCode(product.mikroCode), product]));
    const vehicleStock = params.vehicleId
      ? new Map((await this.getVehicleInventory(params.vehicleId)).map((row) => [normalizeCode(row.productCode), row.quantity]))
      : new Map<string, number>();
    return {
      products: (rows as any[]).map((row) => {
        const code = normalizeCode(row.productCode);
        const local = imageMap.get(code);
        const priceLists: Record<string, number> = {};
        for (let i = 1; i <= 10; i += 1) priceLists[i] = toNumber(row[`price${i}`]);
        return {
          productCode: code,
          productName: String(row.productName || code).trim(),
          unit: String(row.unit || 'ADET').trim(),
          vatRate: row.vatCode === 7 ? 0.1 : row.vatCode === 2 ? 0.01 : row.vatCode === 5 ? 0.2 : 0,
          vehicleStock: toNumber(vehicleStock.get(code)),
          hotWarehouseStock: toNumber(row.hotStock),
          stockMerkez: toNumber(row.stockMerkez),
          stockTopca: toNumber(row.stockTopca),
          priceLists,
          imageUrl: local?.imageUrl || null,
          currentCost: local?.currentCost ?? null,
          lastEntryPrice: local?.lastEntryPrice ?? null,
        };
      }),
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
    const shortages = items
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
