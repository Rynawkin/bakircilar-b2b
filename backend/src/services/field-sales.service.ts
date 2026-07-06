import { CustomerType, OrderStatus, Prisma, QuoteStatus, UserRole } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { AppError, ErrorCode } from '../types/errors';
import { matchesSearchTokens, normalizeSearchText, splitSearchTokens } from '../utils/search';
import stockF10Service from './stock-f10.service';
import priceListService from './price-list.service';
import mikroService from './mikroFactory.service';
import { resolveCustomerPriceLists, resolveCustomerPriceListsForProduct } from '../utils/customerPricing';
import { hashPassword } from '../utils/password';
import customerCategoryPurchaseService from './customer-category-purchase.service';
import quoteService from './quote.service';

type StaffScope = {
  role?: string;
  assignedSectorCodes?: string[];
  userId?: string | null;
};

const CUSTOMER_SELECT = {
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

const PRODUCT_SELECT = {
  id: true,
  mikroCode: true,
  name: true,
  foreignName: true,
  brandCode: true,
  unit: true,
  unit2: true,
  unit2Factor: true,
  imageUrl: true,
  currentCost: true,
  currentCostDate: true,
  lastEntryPrice: true,
  lastEntryDate: true,
  vatRate: true,
  warehouseStocks: true,
  pendingCustomerOrders: true,
  pendingPurchaseOrders: true,
  categoryId: true,
  category: { select: { id: true, mikroCode: true, name: true } },
} satisfies Prisma.ProductSelect;

const normalizeCode = (value: any) => String(value || '').trim().toUpperCase();
const escapeSqlLiteral = (value: string) => String(value || '').replace(/'/g, "''");
const asNumber = (value: any, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'object' && typeof value.toNumber === 'function') {
    const parsed = value.toNumber();
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const displayName = (customer: {
  displayName?: string | null;
  mikroName?: string | null;
  name?: string | null;
  mikroCariCode?: string | null;
}) => customer.displayName || customer.mikroName || customer.name || customer.mikroCariCode || '-';

const readFirst = (row: Record<string, any>, aliases: string[]) => {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias];
  }
  return undefined;
};

const readNumber = (row: Record<string, any>, aliases: string[], fallback = 0) => asNumber(readFirst(row, aliases), fallback);

const rowsFromMikro = (result: any): any[] => (Array.isArray(result) ? result : []);

const buildProductCodeList = (codes: string[]) =>
  Array.from(new Set(codes.map(normalizeCode).filter(Boolean)))
    .map((code) => `'${escapeSqlLiteral(code)}'`)
    .join(',');

const dateDaysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

const VISIT_CUSTOMER_GROUP_CODE = 'Z\u0130YARET';
const VISIT_CUSTOMER_SECTOR_CODE = 'Z\u0130YARET';
const VISIT_CUSTOMER_PREFIX = '120.01.';

const toSqlString = (value: unknown) => `N'${escapeSqlLiteral(String(value ?? ''))}'`;

const monthsSince = (value: unknown) => {
  if (!value) return null;
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) return null;
  const diffDays = Math.max(0, (Date.now() - date.getTime()) / 86_400_000);
  return Math.round((diffDays / 30.4375) * 10) / 10;
};

const isDateRecent = (value: unknown, cutoff: Date) => {
  if (!value) return false;
  const date = new Date(value as any);
  return !Number.isNaN(date.getTime()) && date.getTime() >= cutoff.getTime();
};

// 4.6: Yeni ziyaret carisi acarken mukerrer/cop cari olusmasini zorlastirmak icin
// isim ve telefon normalizasyon yardimcilari. Sadece karsilastirma amacli kullanilir.
const normalizeNameForMatch = (value: unknown) =>
  String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // birlesik aksan isaretlerini kaldir
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Telefonun son 10 hanesini alir (ulke kodu / bosluk / parantez farklarini eler).
const normalizePhoneForMatch = (value: unknown) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length > 10 ? digits.slice(-10) : digits;
};

class FieldSalesService {
  private cariColumnsCache: string[] | null = null;

  private buildCustomerScope(scope: StaffScope): Prisma.UserWhereInput | null {
    const base: Prisma.UserWhereInput = {
      role: UserRole.CUSTOMER,
      parentCustomerId: null,
      mikroCariCode: { not: null },
    };

    if (scope.role === UserRole.SALES_REP) {
      const sectorCodes = (scope.assignedSectorCodes || []).map((code) => String(code || '').trim()).filter(Boolean);
      return {
        AND: [
          base,
          {
            OR: [
              ...(sectorCodes.length > 0 ? [{ sectorCode: { in: sectorCodes } }] : []),
              { sectorCode: VISIT_CUSTOMER_SECTOR_CODE },
              { groupCode: VISIT_CUSTOMER_GROUP_CODE },
            ],
          },
        ],
      };
    }

    return base;
  }

  private async getCariInsertColumns() {
    if (this.cariColumnsCache) return this.cariColumnsCache;

    const rows = await mikroService.executeQuery(`
      SELECT c.name
      FROM sys.columns c
      INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
      WHERE c.object_id = OBJECT_ID(N'dbo.CARI_HESAPLAR')
        AND c.is_identity = 0
        AND c.is_computed = 0
        AND t.name NOT IN ('timestamp', 'rowversion')
      ORDER BY c.column_id
    `);

    this.cariColumnsCache = rows.map((row: any) => String(row.name || '').trim()).filter(Boolean);
    return this.cariColumnsCache;
  }

  private buildCariColumnExpression(column: string, input: { customerName: string; phone: string; email: string }) {
    const lower = column.toLowerCase();
    const direct: Record<string, string> = {
      cari_guid: '@newGuid',
      cari_kod: '@newCode',
      cari_dbcno: '0',
      cari_specrecno: '0',
      cari_iptal: '0',
      cari_fileid: '31',
      cari_hidden: '0',
      cari_kilitli: '0',
      cari_degisti: '1',
      cari_checksum: '0',
      cari_create_user: '1',
      cari_lastup_user: '1',
      cari_create_date: 'GETDATE()',
      cari_lastup_date: 'GETDATE()',
      cari_special1: "N''",
      cari_special2: "N''",
      cari_special3: "N''",
      cari_unvan1: toSqlString(input.customerName),
      cari_unvan2: "N''",
      cari_grup_kodu: toSqlString(VISIT_CUSTOMER_GROUP_CODE),
      cari_sektor_kodu: toSqlString(VISIT_CUSTOMER_SECTOR_CODE),
      cari_ceptel: toSqlString(input.phone),
      cari_email: toSqlString(input.email),
      cari_efatura_fl: '0',
      cari_cari_kilitli_flg: '0',
    };

    if (direct[lower] !== undefined) return direct[lower];
    return `src.[${column.replace(/]/g, ']]')}]`;
  }

  async getNextVisitCustomerCode() {
    const rows = await mikroService.executeQuery(`
      SELECT MAX(TRY_CONVERT(int, SUBSTRING(cari_kod, ${VISIT_CUSTOMER_PREFIX.length + 1}, 20))) AS maxNo
      FROM CARI_HESAPLAR WITH (NOLOCK)
      WHERE cari_kod LIKE N'${escapeSqlLiteral(VISIT_CUSTOMER_PREFIX)}%'
        AND TRY_CONVERT(int, SUBSTRING(cari_kod, ${VISIT_CUSTOMER_PREFIX.length + 1}, 20)) IS NOT NULL
    `);
    const maxNo = Number(rows[0]?.maxNo) || 0;
    return `${VISIT_CUSTOMER_PREFIX}${maxNo + 1}`;
  }

  private async createMikroVisitCustomer(input: { customerName: string; phone: string; email: string }) {
    const columns = await this.getCariInsertColumns();
    if (!columns.includes('cari_kod') || !columns.includes('cari_Guid')) {
      throw new AppError('Mikro cari kolonlari beklenen yapida degil.', 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }

    const columnList = columns.map((column) => `[${column.replace(/]/g, ']]')}]`).join(', ');
    const expressionList = columns.map((column) => this.buildCariColumnExpression(column, input)).join(', ');

    const rows = await mikroService.executeQuery(`
      SET XACT_ABORT ON;
      BEGIN TRY
        BEGIN TRANSACTION;
        DECLARE @created TABLE(cariCode nvarchar(25), cariGuid uniqueidentifier);
        DECLARE @baseNo int;
        DECLARE @templateCode nvarchar(25);
        DECLARE @newCode nvarchar(25);
        DECLARE @newGuid uniqueidentifier = NEWID();

        SELECT @baseNo = ISNULL(MAX(TRY_CONVERT(int, SUBSTRING(cari_kod, ${VISIT_CUSTOMER_PREFIX.length + 1}, 20))), 0)
        FROM CARI_HESAPLAR WITH (UPDLOCK, HOLDLOCK)
        WHERE cari_kod LIKE N'${escapeSqlLiteral(VISIT_CUSTOMER_PREFIX)}%'
          AND TRY_CONVERT(int, SUBSTRING(cari_kod, ${VISIT_CUSTOMER_PREFIX.length + 1}, 20)) IS NOT NULL;

        SET @newCode = N'${escapeSqlLiteral(VISIT_CUSTOMER_PREFIX)}' + CONVERT(nvarchar(20), @baseNo + 1);

        SELECT TOP 1 @templateCode = cari_kod
        FROM CARI_HESAPLAR WITH (NOLOCK)
        WHERE cari_kod LIKE N'${escapeSqlLiteral(VISIT_CUSTOMER_PREFIX)}%'
          AND cari_kod <> @newCode
        ORDER BY TRY_CONVERT(int, SUBSTRING(cari_kod, ${VISIT_CUSTOMER_PREFIX.length + 1}, 20)) DESC;

        IF @templateCode IS NULL
          THROW 52000, 'Sablon cari bulunamadi', 1;

        IF EXISTS (SELECT 1 FROM CARI_HESAPLAR WITH (UPDLOCK, HOLDLOCK) WHERE cari_kod = @newCode)
          THROW 52001, 'Olusacak cari kodu Mikroda zaten var', 1;

        INSERT INTO CARI_HESAPLAR (${columnList})
        OUTPUT inserted.cari_kod, inserted.cari_Guid INTO @created(cariCode, cariGuid)
        SELECT ${expressionList}
        FROM CARI_HESAPLAR src WITH (NOLOCK)
        WHERE src.cari_kod = @templateCode;

        IF @@ROWCOUNT = 0
          THROW 52002, 'Sablon cari okunamadi', 1;

        COMMIT TRANSACTION;
        SELECT cariCode, CONVERT(nvarchar(50), cariGuid) AS cariGuid FROM @created;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        DECLARE @message nvarchar(4000) = ERROR_MESSAGE();
        THROW 52003, @message, 1;
      END CATCH
    `);

    const created = rows[0];
    return {
      cariCode: normalizeCode(created?.cariCode),
      cariGuid: String(created?.cariGuid || '').trim(),
    };
  }

  private async resolveCustomer(customerIdOrCode: string, scope: StaffScope) {
    const scopedWhere = this.buildCustomerScope(scope);
    if (!scopedWhere) {
      throw new AppError('Bu cariye erisim yetkiniz yok.', 403, ErrorCode.FORBIDDEN);
    }

    const key = String(customerIdOrCode || '').trim();
    if (!key) {
      throw new AppError('Cari secimi zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }

    const customer = await prisma.user.findFirst({
      where: {
        AND: [
          scopedWhere,
          {
            OR: [{ id: key }, { mikroCariCode: normalizeCode(key) }],
          },
        ],
      },
      select: CUSTOMER_SELECT,
    });

    if (!customer) {
      throw new AppError('Cari bulunamadi veya erisim yetkiniz yok.', 404, ErrorCode.NOT_FOUND);
    }

    return customer;
  }

  async searchCustomers(input: { search?: string; limit?: number; scope: StaffScope }) {
    const scopedWhere = this.buildCustomerScope(input.scope);
    if (!scopedWhere) return { customers: [] };

    const tokens = splitSearchTokens(input.search || '');
    const limit = Math.max(1, Math.min(Number(input.limit) || 20, 50));
    const where: Prisma.UserWhereInput = {
      AND: [
        scopedWhere,
        ...(tokens.length > 0
          ? tokens.map((token) => ({
              OR: [
                { mikroCariCode: { contains: token, mode: 'insensitive' as const } },
                { displayName: { contains: token, mode: 'insensitive' as const } },
                { mikroName: { contains: token, mode: 'insensitive' as const } },
                { name: { contains: token, mode: 'insensitive' as const } },
                { city: { contains: token, mode: 'insensitive' as const } },
                { district: { contains: token, mode: 'insensitive' as const } },
                { sectorCode: { contains: token, mode: 'insensitive' as const } },
                { phone: { contains: token, mode: 'insensitive' as const } },
              ],
            }))
          : []),
      ],
    };

    let customers = await prisma.user.findMany({
      where,
      select: CUSTOMER_SELECT,
      orderBy: [{ active: 'desc' }, { mikroCariCode: 'asc' }],
      take: limit,
    });

    if (tokens.length > 0 && customers.length < limit) {
      const normalizedTokens = tokens.map((token) => normalizeSearchText(token)).filter(Boolean);
      const fallbackRows = await prisma.user.findMany({
        where: scopedWhere,
        select: CUSTOMER_SELECT,
        orderBy: [{ active: 'desc' }, { mikroCariCode: 'asc' }],
        take: 1000,
      });
      const seen = new Set(customers.map((customer) => customer.id));
      const fallbackMatches = fallbackRows
        .filter((customer) => !seen.has(customer.id))
        .filter((customer) => {
          const haystack = normalizeSearchText([
            customer.mikroCariCode,
            customer.displayName,
            customer.mikroName,
            customer.name,
            customer.city,
            customer.district,
            customer.sectorCode,
            customer.phone,
          ].filter(Boolean).join(' '));
          return matchesSearchTokens(haystack, normalizedTokens);
        });
      customers = [...customers, ...fallbackMatches].slice(0, limit);
    }

    return {
      customers: customers.map((customer) => ({
        ...customer,
        displayTitle: displayName(customer),
      })),
    };
  }

  async getCustomerSnapshot(input: { customerIdOrCode: string; scope: StaffScope }) {
    const customer = await this.resolveCustomer(input.customerIdOrCode, input.scope);
    const customerCode = normalizeCode(customer.mikroCariCode);

    const [
      orderCounts,
      quoteCounts,
      cart,
      vadeBalance,
      notes,
      recentPurchases,
      opportunities,
      lastSaleDate,
    ] = await Promise.all([
      prisma.order.groupBy({
        by: ['status'],
        where: { userId: customer.id },
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      prisma.quote.groupBy({
        by: ['status'],
        where: { customerId: customer.id },
        _count: { _all: true },
        _sum: { grandTotal: true },
      }),
      prisma.cart.findUnique({
        where: { userId: customer.id },
        select: { id: true, updatedAt: true, _count: { select: { items: true } } },
      }),
      prisma.vadeBalance.findUnique({ where: { userId: customer.id } }),
      this.getVisitNotes(customerCode, input.scope, 8),
      this.getCustomerPurchasedProducts(customerCode, 20),
      this.getCustomerOpportunities(customer.id, input.scope),
      this.getLastSaleDate(customerCode),
    ]);

    const openOrderCount = orderCounts
      .filter((row) => row.status === OrderStatus.PENDING)
      .reduce((sum, row) => sum + row._count._all, 0);
    const orderAmount = orderCounts.reduce((sum, row) => sum + Number(row._sum.totalAmount || 0), 0);
    const openQuoteCount = quoteCounts
      .filter((row) => row.status === QuoteStatus.PENDING_APPROVAL)
      .reduce((sum, row) => sum + row._count._all, 0);
    const quoteAmount = quoteCounts.reduce((sum, row) => sum + Number(row._sum.grandTotal || 0), 0);

    return {
      customer: {
        ...customer,
        displayTitle: displayName(customer),
      },
      summary: {
        balance: Number(customer.balance || 0),
        balanceUpdatedAt: customer.balanceUpdatedAt,
        vade: vadeBalance || null,
        lastSaleDate,
        openOrderCount,
        openQuoteCount,
        orderCount: orderCounts.reduce((sum, row) => sum + row._count._all, 0),
        quoteCount: quoteCounts.reduce((sum, row) => sum + row._count._all, 0),
        orderAmount,
        quoteAmount,
        cartItemCount: cart?._count.items || 0,
        cartUpdatedAt: cart?.updatedAt || null,
      },
      recentPurchases,
      opportunities,
      notes,
    };
  }

  async searchProducts(input: {
    search?: string;
    customerIdOrCode?: string;
    limit?: number;
    safeMode?: boolean;
    scope: StaffScope;
  }) {
    const searchTerm = String(input.search || '').trim();
    if (!searchTerm) return { products: [] };

    const limit = Math.max(1, Math.min(Number(input.limit) || 25, 60));
    const customer = input.customerIdOrCode
      ? await this.resolveCustomer(input.customerIdOrCode, input.scope)
      : null;
    const rows = rowsFromMikro(await stockF10Service.searchStocks({ searchTerm, limit, offset: 0 }));
    const products = await this.normalizeStockRows(rows, {
      customer,
      safeMode: input.safeMode !== false,
    });

    return { products };
  }

  async getProductDetail(input: {
    productCode: string;
    customerIdOrCode?: string;
    safeMode?: boolean;
    scope: StaffScope;
  }) {
    const code = normalizeCode(input.productCode);
    if (!code) throw new AppError('Stok kodu zorunludur.', 400, ErrorCode.BAD_REQUEST);

    const customer = input.customerIdOrCode
      ? await this.resolveCustomer(input.customerIdOrCode, input.scope)
      : null;
    const rows = rowsFromMikro(await stockF10Service.getStocksByCodes([code]));
    const products = await this.normalizeStockRows(rows, {
      customer,
      safeMode: input.safeMode !== false,
    });
    const product = products[0] || null;
    if (!product) throw new AppError('Urun bulunamadi.', 404, ErrorCode.NOT_FOUND);

    return { product };
  }

  private async normalizeStockRows(
    rows: any[],
    options: {
      customer: any | null;
      safeMode: boolean;
    }
  ) {
    if (!Array.isArray(rows) || rows.length === 0) return [];

    const codes = Array.from(new Set(rows.map((row) => normalizeCode(row?.msg_S_0078)).filter(Boolean)));
    const now = new Date();

    const [
      localProducts,
      priceStatsMap,
      settings,
      priceListRules,
      agreements,
      lastSalesMap,
      categoryLastMap,
      lastQuotesMap,
    ] = await Promise.all([
      prisma.product.findMany({
        where: { mikroCode: { in: codes } },
        select: PRODUCT_SELECT,
      }),
      priceListService.getPriceStatsMap(codes),
      options.customer ? prisma.settings.findFirst() : Promise.resolve(null),
      options.customer
        ? prisma.customerPriceListRule.findMany({
            where: { customerId: options.customer.id },
            select: {
              brandCode: true,
              categoryId: true,
              invoicedPriceListNo: true,
              whitePriceListNo: true,
            },
          })
        : Promise.resolve([]),
      options.customer
        ? prisma.customerPriceAgreement.findMany({
            where: {
              customerId: options.customer.id,
              product: { mikroCode: { in: codes } },
              validFrom: { lte: now },
              OR: [{ validTo: null }, { validTo: { gte: now } }],
            },
            select: {
              productId: true,
              priceInvoiced: true,
              priceWhite: true,
              minQuantity: true,
              validFrom: true,
              validTo: true,
              customerProductCode: true,
              product: { select: { mikroCode: true } },
            },
          })
        : Promise.resolve([]),
      options.customer?.mikroCariCode
        ? this.getCustomerProductLastSales(normalizeCode(options.customer.mikroCariCode), codes, 3)
        : Promise.resolve(new Map<string, any[]>()),
      options.customer?.mikroCariCode
        ? customerCategoryPurchaseService.getCategoryLastPurchases(normalizeCode(options.customer.mikroCariCode))
        : Promise.resolve(new Map<string, any>()),
      options.customer?.id
        ? quoteService.getCustomerLastQuoteItems(options.customer.id, codes, 3)
        : Promise.resolve({}),
    ]);

    const productByCode = new Map(localProducts.map((product) => [normalizeCode(product.mikroCode), product]));
    const agreementByCode = new Map(agreements.map((agreement: any) => [normalizeCode(agreement.product?.mikroCode), agreement]));
    const basePriceListPair = options.customer ? resolveCustomerPriceLists(options.customer, settings) : null;

    return rows.map((row) => {
      const code = normalizeCode(row?.msg_S_0078);
      const local = productByCode.get(code) || null;
      const stats = priceStatsMap.get(code) || null;
      const priceLists: Record<string, number> = {};
      for (let listNo = 1; listNo <= 10; listNo += 1) {
        priceLists[listNo] = priceListService.getListPrice(stats, listNo);
      }

      const productMeta = local || {
        brandCode: String(readFirst(row, ['Marka']) || '').trim() || null,
        categoryId: null,
      };
      const productPair = basePriceListPair
        ? resolveCustomerPriceListsForProduct(basePriceListPair, priceListRules, productMeta)
        : null;
      const agreement = agreementByCode.get(code) || null;
      const listInvoiced = productPair
        ? priceListService.getListPriceWithFallback(stats, productPair.invoiced, { min: 6, max: 10 })
        : 0;
      const listWhite = productPair
        ? priceListService.getListPriceWithFallback(stats, productPair.white, { min: 1, max: 5 })
        : 0;
      const categoryCode = String(readFirst(row, ['Kategori kodu']) || local?.category?.mikroCode || '').trim();
      const categoryLastPurchase = categoryCode ? categoryLastMap.get(normalizeCode(categoryCode)) || null : null;
      const lastSales = lastSalesMap.get(code) || [];
      const lastQuotes = (lastQuotesMap as Record<string, any[]>)[code] || [];

      const customerPrice = options.customer
        ? {
            source: agreement ? 'AGREEMENT' : 'PRICE_LIST',
            invoiced: Number(agreement?.priceInvoiced ?? listInvoiced ?? 0),
            white: Number(agreement?.priceWhite ?? listWhite ?? 0),
            priceListNo: productPair?.invoiced || null,
            whitePriceListNo: productPair?.white || null,
            agreement: agreement
              ? {
                  priceInvoiced: agreement.priceInvoiced,
                  priceWhite: agreement.priceWhite,
                  minQuantity: agreement.minQuantity,
                  validFrom: agreement.validFrom,
                  validTo: agreement.validTo,
                  customerProductCode: agreement.customerProductCode,
                }
              : null,
            lastSales,
          }
        : null;

      const cost = options.safeMode
        ? null
        : {
            currentCost: readNumber(row, [
              'G\u00fcncel Maliyet + Kdv.',
              'G\u00c3\u00bcncel Maliyet + Kdv.',
            ], Number(local?.currentCost || 0)),
            currentCostVatIncluded: readNumber(row, [
              'G\u00fcncel Maliyet Kdv Dahil',
              'G\u00c3\u00bcncel Maliyet Kdv Dahil',
            ], Number(local?.currentCost || 0)),
            currentCostDate: readFirst(row, [
              'G\u00fcncel Maliyet Tarihi',
              'G\u00c3\u00bcncel Maliyet Tarihi',
            ]) || local?.currentCostDate || null,
            lastEntryCost: readNumber(row, [
              'Son Giri\u015f Maliyeti + Kdv',
              'Son Giri\u00c5\u0178 Maliyeti + Kdv',
            ], Number(local?.lastEntryPrice || 0)),
            lastEntryCostVatIncluded: readNumber(row, [
              'Son Giri\u015f Maliyeti Kdv Dahil',
              'Son Giri\u00c5\u0178 Maliyeti Kdv Dahil',
            ], 0),
            lastEntryDate: readFirst(row, [
              'Son Giri\u015f Tarihi',
              'Son Giri\u00c5\u0178 Tarihi',
            ]) || local?.lastEntryDate || null,
            margins: {
              marj1: readNumber(row, ['Marj_1']),
              marj2: readNumber(row, ['Marj_2']),
              marj3: readNumber(row, ['Marj_3']),
              marj4: readNumber(row, ['Marj_4']),
              marj5: readNumber(row, ['Marj_5']),
            },
          };

      return {
        id: local?.id || null,
        mikroCode: code,
        name: String(row?.msg_S_0870 || local?.name || '').trim(),
        foreignName: String(readFirst(row, ['Yab.\u0130sim', 'Yab.\u00c4\u00b0sim']) || local?.foreignName || '').trim() || null,
        shortName: String(readFirst(row, ['K\u0131sa \u0130sim', 'K\u00c4\u00b1sa \u00c4\u00b0sim']) || '').trim() || null,
        brandCode: String(readFirst(row, ['Marka']) || local?.brandCode || '').trim() || null,
        categoryCode: categoryCode || null,
        categoryName: String(readFirst(row, ['Kategori Ad\u0131', 'Kategori Ad\u00c4\u00b1']) || local?.category?.name || '').trim() || null,
        unit: String(readFirst(row, ['Birim']) || local?.unit || 'ADET').trim() || 'ADET',
        unit2: String(readFirst(row, ['2. Birim']) || local?.unit2 || '').trim() || null,
        unit2Factor: readNumber(row, ['2. Birim Katsay\u0131s\u0131', '2. Birim Katsay\u00c4\u00b1s\u00c4\u00b1'], Number(local?.unit2Factor || 0)) || null,
        imageUrl: local?.imageUrl || null,
        vatRate: readNumber(row, ['KDV Oran\u0131', 'KDV Oran\u00c4\u00b1'], Number(local?.vatRate || 0) * 100),
        monthlySalesQty: readNumber(row, ['B\u0130R AYLIK SATIS M\u0130KTARI', 'B\u00c4\u00b0R AYLIK SATIS M\u00c4\u00b0KTARI']),
        threeMonthSalesQty: readNumber(row, ['3 Ayl\u0131k Sat\u0131\u015f', '3 Ayl\u00c4\u00b1k Sat\u00c4\u00b1\u00c5\u0178']),
        warehouses: this.buildWarehouseStock(row),
        totalStock: readNumber(row, ['Toplam Eldeki Miktar']),
        totalSellable: readNumber(row, ['Toplam Sat\u0131labilir', 'Toplam Sat\u00c4\u00b1labilir']),
        pendingCustomerOrders: Number(local?.pendingCustomerOrders || 0),
        pendingPurchaseOrders: Number(local?.pendingPurchaseOrders || 0),
        priceLists,
        customerPrice,
        lastQuotes,
        categoryLastPurchase,
        categoryLastPurchaseDate: categoryLastPurchase?.lastPurchaseDate || null,
        categoryMonthsSinceLastPurchase: categoryLastPurchase?.monthsSinceLastPurchase ?? null,
        cost,
        rawUpdatedAt: new Date().toISOString(),
      };
    });
  }

  private buildWarehouseStock(row: Record<string, any>) {
    return [
      {
        no: 1,
        key: 'MERKEZ',
        label: 'Merkez',
        stock: readNumber(row, ['Merkez Depo']),
        pendingCustomer: readNumber(row, ['Merkez Depo Sipari\u015fte Bekleyen', 'Merkez Depo Sipari\u00c5\u0178te Bekleyen']),
        pendingPurchase: readNumber(row, ['Merkez Depo Sat\u0131n Alma Sipari\u015fte Bekleyen', 'Merkez Depo Sat\u00c4\u00b1n Alma Sipari\u00c5\u0178te Bekleyen']),
        sellable: readNumber(row, ['Merkez Depo Sat\u0131labilir', 'Merkez Depo Sat\u00c4\u00b1labilir']),
      },
      {
        no: 6,
        key: 'TOPCA',
        label: 'Topca',
        stock: readNumber(row, ['Topca Depo', 'Top\u00e7a Depo', 'Top\u00c3\u00a7a Depo']),
        pendingCustomer: readNumber(row, ['Topca Depo Sipari\u015fte Bekleyen', 'Topca Depo Sipari\u00c5\u0178te Bekleyen']),
        pendingPurchase: readNumber(row, ['Topca Depo Sat\u0131n Alma Sipari\u015fte Bekleyen', 'Topca Depo Sat\u00c4\u00b1n Alma Sipari\u00c5\u0178te Bekleyen']),
        sellable: readNumber(row, ['Topca Depo Sat\u0131labilir', 'Top\u00e7a Depo Sat\u0131labilir', 'Top\u00c3\u00a7a Depo Sat\u00c4\u00b1labilir']),
      },
      {
        no: 2,
        key: 'EREGLI',
        label: 'Eregli',
        stock: readNumber(row, ['Eregli Depo', 'Ere\u011fli Depo', 'Ere\u00c4\u0178li Depo']),
        pendingCustomer: readNumber(row, ['Eregl\u0131 Depo Sipari\u015fte Bekleyen', 'Eregl\u00c4\u00b1 Depo Sipari\u00c5\u0178te Bekleyen']),
        pendingPurchase: readNumber(row, ['Eregl\u0131 Depo Sat\u0131n Alma Sipari\u015fte Bekleyen', 'Eregl\u00c4\u00b1 Depo Sat\u00c4\u00b1n Alma Sipari\u00c5\u0178te Bekleyen']),
        sellable: readNumber(row, ['Eregli Depo Sat\u0131labilir', 'Ere\u011fli Depo Sat\u0131labilir', 'Ere\u00c4\u0178li Depo Sat\u00c4\u00b1labilir']),
      },
      {
        no: 7,
        key: 'DUKKAN',
        label: 'Dukkan',
        stock: readNumber(row, ['Dukkan Depo', 'D\u00fckkan Depo', 'D\u00c3\u00bckkan Depo']),
        pendingCustomer: readNumber(row, ['Dukkan Depo Sipari\u015fte Bekleyen', 'D\u00fckkan Depo Sipari\u015fte Bekleyen', 'D\u00c3\u00bckkan Depo Sipari\u00c5\u0178te Bekleyen']),
        pendingPurchase: readNumber(row, ['Dukkan Depo Sat\u0131n Alma Sipari\u015fte Bekleyen', 'D\u00fckkan Depo Sat\u0131n Alma Sipari\u015fte Bekleyen', 'D\u00c3\u00bckkan Depo Sat\u00c4\u00b1n Alma Sipari\u00c5\u0178te Bekleyen']),
        sellable: readNumber(row, ['Dukkan Depo Sat\u0131labilir', 'D\u00fckkan Depo Sat\u0131labilir', 'D\u00c3\u00bckkan Depo Sat\u00c4\u00b1labilir']),
      },
      {
        no: 8,
        key: 'ISTANBUL_ARAC',
        label: 'Istanbul Arac',
        stock: readNumber(row, ['Istanbul Arac Depo', '\u0130stanbul Ara\u00e7 Depo', '\u00c4\u00b0stanbul Ara\u00c3\u00a7 Depo']),
        pendingCustomer: 0,
        pendingPurchase: 0,
        sellable: readNumber(row, ['Istanbul Arac Depo', '\u0130stanbul Ara\u00e7 Depo', '\u00c4\u00b0stanbul Ara\u00c3\u00a7 Depo']),
      },
      {
        no: 9,
        key: 'ISTANBUL_YENI',
        label: 'Istanbul Yeni',
        stock: readNumber(row, ['Istanbul Yeni Depo', '\u0130stanbul Yeni Depo', '\u00c4\u00b0stanbul Yeni Depo']),
        pendingCustomer: 0,
        pendingPurchase: 0,
        sellable: readNumber(row, ['Istanbul Yeni Depo', '\u0130stanbul Yeni Depo', '\u00c4\u00b0stanbul Yeni Depo']),
      },
    ];
  }

  private async getLastSaleDate(customerCode: string) {
    if (!customerCode) return null;
    try {
      const rows = rowsFromMikro(await mikroService.executeQuery(`
        SELECT MAX(sth_tarih) as lastSaleDate
        FROM STOK_HAREKETLERI WITH (NOLOCK)
        WHERE LTRIM(RTRIM(sth_cari_kodu)) = '${escapeSqlLiteral(customerCode)}'
          AND ISNULL(sth_tip, 0) = 1
          AND ISNULL(sth_evraktip, 0) IN (1, 4)
      `));
      return rows[0]?.lastSaleDate || null;
    } catch (error) {
      console.warn('FieldSales last sale date failed', error);
      return null;
    }
  }

  private async getCustomerProductLastSales(customerCode: string, productCodes: string[], limit = 3) {
    const safeCodes = buildProductCodeList(productCodes);
    const safeLimit = Math.max(1, Math.min(Number(limit) || 1, 10));
    if (!customerCode || !safeCodes) return new Map<string, any[]>();

    try {
      const rows = rowsFromMikro(await mikroService.executeQuery(`
        WITH ranked AS (
          SELECT
            LTRIM(RTRIM(sth.sth_stok_kod)) as productCode,
            LTRIM(RTRIM(ISNULL(sth.sth_evrakno_seri, ''))) + '-' + CAST(ISNULL(sth.sth_evrakno_sira, 0) AS VARCHAR(30)) as documentNo,
            sth.sth_tarih as saleDate,
            CAST(ISNULL(sth.sth_miktar, 0) AS FLOAT) as quantity,
            CAST(
              dbo.fn_StokHareketNetDeger(
                sth.sth_tutar, sth.sth_iskonto1, sth.sth_iskonto2, sth.sth_iskonto3, sth.sth_iskonto4,
                sth.sth_iskonto5, sth.sth_iskonto6, sth.sth_masraf1, sth.sth_masraf2, sth.sth_masraf3,
                sth.sth_masraf4, sth.sth_otvtutari, sth.sth_tip, 0, 0, sth.sth_har_doviz_kuru,
                sth.sth_alt_doviz_kuru, sth.sth_stok_doviz_kuru
              ) / NULLIF(sth.sth_miktar, 0) AS FLOAT
            ) as unitPrice,
            ROW_NUMBER() OVER (
              PARTITION BY LTRIM(RTRIM(sth.sth_stok_kod))
              ORDER BY sth.sth_tarih DESC, sth.sth_evrakno_sira DESC, sth.sth_satirno DESC
            ) as rn
          FROM STOK_HAREKETLERI sth WITH (NOLOCK)
          WHERE LTRIM(RTRIM(sth.sth_cari_kodu)) = '${escapeSqlLiteral(customerCode)}'
            AND LTRIM(RTRIM(sth.sth_stok_kod)) IN (${safeCodes})
            AND ISNULL(sth.sth_tip, 0) = 1
            AND ISNULL(sth.sth_evraktip, 0) IN (1, 4)
            AND ISNULL(sth.sth_miktar, 0) <> 0
        )
        SELECT productCode, documentNo, saleDate, quantity, unitPrice
        FROM ranked
        WHERE rn <= ${safeLimit}
        ORDER BY productCode, saleDate DESC
      `));

      const map = new Map<string, any[]>();
      rows.forEach((row) => {
        const code = normalizeCode(row.productCode);
        if (!code) return;
        const list = map.get(code) || [];
        list.push({
          documentNo: row.documentNo || null,
          saleDate: row.saleDate || null,
          quantity: asNumber(row.quantity),
          unitPrice: asNumber(row.unitPrice),
        });
        map.set(code, list);
      });
      return map;
    } catch (error) {
      console.warn('FieldSales last sales failed', error);
      return new Map<string, any[]>();
    }
  }

  async getCustomerPurchasedProducts(customerCode: string, limit = 30) {
    const code = normalizeCode(customerCode);
    if (!code) return [];
    const safeLimit = Math.max(1, Math.min(Number(limit) || 30, 80));

    try {
      const rows = rowsFromMikro(await mikroService.executeQuery(`
        SELECT TOP ${safeLimit}
          LTRIM(RTRIM(sth.sth_stok_kod)) as productCode,
          MAX(ISNULL(st.sto_isim, '')) as productName,
          MAX(ISNULL(st.sto_kategori_kodu, '')) as categoryCode,
          MAX(ISNULL(ktg.ktg_isim, '')) as categoryName,
          MAX(sth.sth_tarih) as lastPurchaseDate,
          SUM(CAST(ISNULL(sth.sth_miktar, 0) AS FLOAT)) as totalQuantity,
          SUM(CAST(ISNULL(sth.sth_tutar, 0) AS FLOAT)) as totalAmount,
          COUNT(DISTINCT LTRIM(RTRIM(ISNULL(sth.sth_evrakno_seri, ''))) + '-' + CAST(ISNULL(sth.sth_evrakno_sira, 0) AS VARCHAR(30))) as documentCount
        FROM STOK_HAREKETLERI sth WITH (NOLOCK)
        LEFT JOIN STOKLAR st WITH (NOLOCK) ON st.sto_kod = sth.sth_stok_kod
        LEFT JOIN STOK_KATEGORILERI ktg WITH (NOLOCK) ON ktg.ktg_kod = st.sto_kategori_kodu
        WHERE LTRIM(RTRIM(sth.sth_cari_kodu)) = '${escapeSqlLiteral(code)}'
          AND ISNULL(sth.sth_tip, 0) = 1
          AND ISNULL(sth.sth_evraktip, 0) IN (1, 4)
          AND ISNULL(sth.sth_miktar, 0) > 0
        GROUP BY LTRIM(RTRIM(sth.sth_stok_kod))
        ORDER BY MAX(sth.sth_tarih) DESC
      `));

      const productCodes = rows.map((row) => normalizeCode(row.productCode)).filter(Boolean);
      const products = productCodes.length
        ? await prisma.product.findMany({
            where: { mikroCode: { in: productCodes } },
            select: {
              mikroCode: true,
              imageUrl: true,
              unit: true,
              category: { select: { mikroCode: true, name: true } },
            },
          })
        : [];
      const productMap = new Map(products.map((product) => [normalizeCode(product.mikroCode), product]));
      const categoryLastByProduct = await customerCategoryPurchaseService.getProductCategoryLastPurchases(
        code,
        products
      );

      return rows.map((row) => {
        const product = productMap.get(normalizeCode(row.productCode));
        const categoryLastPurchase = categoryLastByProduct.get(normalizeCode(row.productCode)) || null;
        return {
          productCode: normalizeCode(row.productCode),
          productName: String(row.productName || '').trim(),
          categoryCode: String(row.categoryCode || '').trim(),
          categoryName: String(row.categoryName || '').trim(),
          categoryLastPurchase,
          categoryLastPurchaseDate: categoryLastPurchase?.lastPurchaseDate || null,
          categoryMonthsSinceLastPurchase: categoryLastPurchase?.monthsSinceLastPurchase ?? null,
          lastPurchaseDate: row.lastPurchaseDate || null,
          totalQuantity: asNumber(row.totalQuantity),
          totalAmount: asNumber(row.totalAmount),
          documentCount: asNumber(row.documentCount),
          imageUrl: product?.imageUrl || null,
          unit: product?.unit || null,
        };
      });
    } catch (error) {
      console.warn('FieldSales purchased products failed', error);
      return [];
    }
  }

  private async getCustomerCategoryLastPurchases(customerCode: string) {
    const code = normalizeCode(customerCode);
    if (!code) return new Map<string, { categoryCode: string; categoryName: string; lastPurchaseDate: any }>();

    try {
      const rows = rowsFromMikro(await mikroService.executeQuery(`
        SELECT
          LTRIM(RTRIM(ISNULL(st.sto_kategori_kodu, ''))) as categoryCode,
          MAX(ISNULL(ktg.ktg_isim, '')) as categoryName,
          MAX(sth.sth_tarih) as lastPurchaseDate
        FROM STOK_HAREKETLERI sth WITH (NOLOCK)
        INNER JOIN STOKLAR st WITH (NOLOCK) ON st.sto_kod = sth.sth_stok_kod
        LEFT JOIN STOK_KATEGORILERI ktg WITH (NOLOCK) ON ktg.ktg_kod = st.sto_kategori_kodu
        WHERE LTRIM(RTRIM(sth.sth_cari_kodu)) = '${escapeSqlLiteral(code)}'
          AND ISNULL(sth.sth_tip, 0) = 1
          AND ISNULL(sth.sth_evraktip, 0) IN (1, 4)
          AND ISNULL(sth.sth_miktar, 0) > 0
          AND LTRIM(RTRIM(ISNULL(st.sto_kategori_kodu, ''))) <> ''
        GROUP BY LTRIM(RTRIM(ISNULL(st.sto_kategori_kodu, '')))
      `));

      const map = new Map<string, { categoryCode: string; categoryName: string; lastPurchaseDate: any }>();
      rows.forEach((row) => {
        const categoryCode = String(row.categoryCode || '').trim();
        if (!categoryCode) return;
        map.set(categoryCode, {
          categoryCode,
          categoryName: String(row.categoryName || '').trim(),
          lastPurchaseDate: row.lastPurchaseDate || null,
        });
      });
      return map;
    } catch (error) {
      console.warn('FieldSales category last purchases failed', error);
      return new Map<string, { categoryCode: string; categoryName: string; lastPurchaseDate: any }>();
    }
  }

  async getCustomerOpportunities(customerIdOrCode: string, scope: StaffScope) {
    const customer = await this.resolveCustomer(customerIdOrCode, scope);
    const customerCode = normalizeCode(customer.mikroCariCode);
    const [purchased, categoryLastMap] = await Promise.all([
      this.getCustomerPurchasedProducts(customerCode, 80),
      this.getCustomerCategoryLastPurchases(customerCode),
    ]);
    const ninetyDaysAgo = dateDaysAgo(90);
    const stalePurchased = purchased
      .filter((row) => {
        const date = row.lastPurchaseDate ? new Date(row.lastPurchaseDate).getTime() : 0;
        const categoryLast = row.categoryCode ? categoryLastMap.get(row.categoryCode)?.lastPurchaseDate : null;
        return (!date || date < ninetyDaysAgo.getTime()) && !isDateRecent(categoryLast, ninetyDaysAgo);
      })
      .sort((a, b) => Number(b.totalAmount || 0) - Number(a.totalAmount || 0))
      .slice(0, 12)
      .map((row) => {
        const categoryLast = row.categoryCode ? categoryLastMap.get(row.categoryCode) : null;
        const categoryMonths = monthsSince(categoryLast?.lastPurchaseDate || row.lastPurchaseDate);
        return {
          type: 'STALE_PURCHASE',
          title: 'Eskiden aldigi urun',
          reason: categoryMonths !== null
            ? `Urun ve kategori son ${categoryMonths} aydir alinmiyor`
            : 'Son 90 gunde urun/kategori alimi yok',
          ...row,
          categoryLastPurchaseDate: categoryLast?.lastPurchaseDate || row.lastPurchaseDate || null,
          categoryMonthsSinceLastPurchase: categoryMonths,
        };
      });

    const purchasedSet = new Set(purchased.map((row) => normalizeCode(row.productCode)));
    const now = new Date();
    const agreementNoRecentRows = await prisma.customerPriceAgreement.findMany({
      where: {
        customerId: customer.id,
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gte: now } }],
      },
      orderBy: { updatedAt: 'desc' },
      take: 40,
      select: {
        priceInvoiced: true,
        priceWhite: true,
        minQuantity: true,
        product: { select: { mikroCode: true, name: true, imageUrl: true, unit: true, category: { select: { mikroCode: true, name: true } } } },
      },
    });

    const agreementNoRecent = agreementNoRecentRows
      .filter((row) => {
        const categoryCode = String(row.product.category?.mikroCode || '').trim();
        return !purchasedSet.has(normalizeCode(row.product.mikroCode)) && !isDateRecent(categoryLastMap.get(categoryCode)?.lastPurchaseDate, ninetyDaysAgo);
      })
      .slice(0, 12)
      .map((row) => {
        const categoryCode = String(row.product.category?.mikroCode || '').trim();
        const categoryLast = categoryCode ? categoryLastMap.get(categoryCode) : null;
        return {
          type: 'AGREEMENT_NOT_ORDERED',
          title: 'Anlasmali ama alinmamis urun',
          reason: categoryLast?.lastPurchaseDate
            ? `Aktif anlasma var; kategori son ${monthsSince(categoryLast.lastPurchaseDate)} ay once alinmis`
            : 'Aktif anlasma var, satis gecmisi bulunmadi',
          productCode: row.product.mikroCode,
          productName: row.product.name,
          categoryCode,
          categoryName: row.product.category?.name || null,
          categoryLastPurchaseDate: categoryLast?.lastPurchaseDate || null,
          categoryMonthsSinceLastPurchase: monthsSince(categoryLast?.lastPurchaseDate),
          imageUrl: row.product.imageUrl,
          unit: row.product.unit,
          priceInvoiced: row.priceInvoiced,
          priceWhite: row.priceWhite,
          minQuantity: row.minQuantity,
        };
      });

    const similarSector = await this.getSimilarSectorOpportunities(customer, purchasedSet, categoryLastMap, ninetyDaysAgo);

    return {
      stalePurchased,
      agreementNoRecent,
      similarSector,
    };
  }

  private async getSimilarSectorOpportunities(
    customer: any,
    excludeCodes: Set<string>,
    categoryLastMap: Map<string, { categoryCode: string; categoryName: string; lastPurchaseDate: any }>,
    recentCutoff: Date
  ) {
    const sectorCode = String(customer.sectorCode || '').trim();
    if (!sectorCode) return [];

    try {
      const rows = rowsFromMikro(await mikroService.executeQuery(`
        SELECT TOP 25
          LTRIM(RTRIM(sth.sth_stok_kod)) as productCode,
          MAX(ISNULL(st.sto_isim, '')) as productName,
          MAX(ISNULL(st.sto_kategori_kodu, '')) as categoryCode,
          MAX(ISNULL(ktg.ktg_isim, '')) as categoryName,
          COUNT(DISTINCT LTRIM(RTRIM(sth.sth_cari_kodu))) as customerCount,
          SUM(CAST(ISNULL(sth.sth_miktar, 0) AS FLOAT)) as totalQuantity,
          SUM(CAST(ISNULL(sth.sth_tutar, 0) AS FLOAT)) as totalAmount,
          MAX(sth.sth_tarih) as lastPurchaseDate
        FROM STOK_HAREKETLERI sth WITH (NOLOCK)
        INNER JOIN CARI_HESAPLAR ch WITH (NOLOCK) ON ch.cari_kod = sth.sth_cari_kodu
        LEFT JOIN STOKLAR st WITH (NOLOCK) ON st.sto_kod = sth.sth_stok_kod
        LEFT JOIN STOK_KATEGORILERI ktg WITH (NOLOCK) ON ktg.ktg_kod = st.sto_kategori_kodu
        WHERE LTRIM(RTRIM(ISNULL(ch.cari_sektor_kodu, ''))) = '${escapeSqlLiteral(sectorCode)}'
          AND LTRIM(RTRIM(sth.sth_cari_kodu)) <> '${escapeSqlLiteral(normalizeCode(customer.mikroCariCode))}'
          AND ISNULL(sth.sth_tip, 0) = 1
          AND ISNULL(sth.sth_evraktip, 0) IN (1, 4)
          AND sth.sth_tarih >= DATEADD(DAY, -120, CAST(GETDATE() AS date))
          AND ISNULL(sth.sth_miktar, 0) > 0
        GROUP BY LTRIM(RTRIM(sth.sth_stok_kod))
        ORDER BY COUNT(DISTINCT LTRIM(RTRIM(sth.sth_cari_kodu))) DESC, SUM(CAST(ISNULL(sth.sth_tutar, 0) AS FLOAT)) DESC
      `));

      const filtered = rows
        .filter((row) => {
          const productCode = normalizeCode(row.productCode);
          const categoryCode = String(row.categoryCode || '').trim();
          return !excludeCodes.has(productCode) && !isDateRecent(categoryLastMap.get(categoryCode)?.lastPurchaseDate, recentCutoff);
        })
        .slice(0, 12);
      const codes = filtered.map((row) => normalizeCode(row.productCode)).filter(Boolean);
      const products = codes.length
        ? await prisma.product.findMany({
            where: { mikroCode: { in: codes } },
            select: { mikroCode: true, imageUrl: true, unit: true },
          })
        : [];
      const productMap = new Map(products.map((product) => [normalizeCode(product.mikroCode), product]));

      return filtered.map((row) => {
        const product = productMap.get(normalizeCode(row.productCode));
        return {
          type: 'SIMILAR_SECTOR',
          title: 'Benzer cariler aliyor',
          reason: `${asNumber(row.customerCount)} cari son 120 gunde aldi; bu kategoride yakin alim yok`,
          productCode: normalizeCode(row.productCode),
          productName: String(row.productName || '').trim(),
          categoryCode: String(row.categoryCode || '').trim(),
          categoryName: String(row.categoryName || '').trim() || null,
          categoryLastPurchaseDate: categoryLastMap.get(String(row.categoryCode || '').trim())?.lastPurchaseDate || null,
          categoryMonthsSinceLastPurchase: monthsSince(categoryLastMap.get(String(row.categoryCode || '').trim())?.lastPurchaseDate),
          customerCount: asNumber(row.customerCount),
          totalQuantity: asNumber(row.totalQuantity),
          totalAmount: asNumber(row.totalAmount),
          lastPurchaseDate: row.lastPurchaseDate || null,
          imageUrl: product?.imageUrl || null,
          unit: product?.unit || null,
        };
      });
    } catch (error) {
      console.warn('FieldSales similar sector opportunities failed', error);
      return [];
    }
  }

  // 4.6: Yeni cari olusturmadan once isim+telefon benzerligi ile mevcut carileri arar.
  // Mukerrer/cop cari olusmasini engellemek icin aday listesi dondurur (yazma yapmaz).
  private async findSimilarCustomers(input: { customerName: string; phone: string; scope: StaffScope }) {
    const normalizedName = normalizeNameForMatch(input.customerName);
    const normalizedPhone = normalizePhoneForMatch(input.phone);
    const nameTokens = normalizedName.split(' ').filter((token) => token.length >= 2);
    if (!normalizedPhone && nameTokens.length === 0) return [];

    const scopedWhere = this.buildCustomerScope(input.scope);
    const orConditions: Prisma.UserWhereInput[] = [];

    // Telefon eslesmesi guclu sinyaldir: rakamlardan arindirilmis son 10 hane.
    if (normalizedPhone) {
      orConditions.push({ phone: { contains: normalizedPhone } });
    }
    // Isim eslesmesi: tum anlamli token'lari iceren cariler (yaklasik benzerlik).
    if (nameTokens.length > 0) {
      orConditions.push({
        AND: nameTokens.map((token) => ({
          OR: [
            { displayName: { contains: token, mode: 'insensitive' as const } },
            { mikroName: { contains: token, mode: 'insensitive' as const } },
            { name: { contains: token, mode: 'insensitive' as const } },
          ],
        })),
      });
    }
    if (orConditions.length === 0) return [];

    const where: Prisma.UserWhereInput = {
      AND: [
        { role: UserRole.CUSTOMER, parentCustomerId: null },
        ...(scopedWhere ? [scopedWhere] : []),
        { OR: orConditions },
      ],
    };

    const candidates = await prisma.user.findMany({
      where,
      select: CUSTOMER_SELECT,
      take: 10,
      orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }],
    });

    return candidates
      .map((candidate) => {
        const phoneMatch = Boolean(normalizedPhone) && normalizePhoneForMatch(candidate.phone) === normalizedPhone;
        const candidateName = normalizeNameForMatch(candidate.displayName || candidate.mikroName || candidate.name);
        const nameMatch =
          nameTokens.length > 0 && nameTokens.every((token) => candidateName.includes(token));
        return {
          candidate,
          phoneMatch,
          nameMatch,
        };
      })
      .filter((row) => row.phoneMatch || row.nameMatch)
      .map((row) => ({
        ...row.candidate,
        displayTitle: displayName(row.candidate),
        matchReason: row.phoneMatch && row.nameMatch
          ? 'Ayni telefon ve benzer isim'
          : row.phoneMatch
            ? 'Ayni telefon'
            : 'Benzer isim',
      }));
  }

  async createVisitCustomer(input: {
    customerName?: string;
    phone?: string | null;
    email?: string | null;
    note?: string | null;
    demand?: string | null;
    competitorInfo?: string | null;
    photoUrl?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    force?: boolean;
    scope: StaffScope;
  }) {
    const customerName = String(input.customerName || '').trim();
    if (!customerName) throw new AppError('Musteri adi zorunludur.', 400, ErrorCode.BAD_REQUEST);
    if (customerName.length > 127) throw new AppError('Musteri adi 127 karakterden uzun olamaz.', 400, ErrorCode.BAD_REQUEST);

    const phone = String(input.phone || '').trim();
    const email = String(input.email || '').trim();
    const note = String(input.note || '').trim() || 'Yeni musteri ziyareti';
    if (phone.length > 20) throw new AppError('Telefon 20 karakterden uzun olamaz.', 400, ErrorCode.BAD_REQUEST);
    if (email.length > 127) throw new AppError('Email 127 karakterden uzun olamaz.', 400, ErrorCode.BAD_REQUEST);

    if (email) {
      const existingEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (existingEmail) throw new AppError('Bu email ile kayitli musteri zaten var.', 400, ErrorCode.BAD_REQUEST);
    }

    // 4.6: Mikro yazmadan once isim+telefon benzerligine bakip mukerrer cari olusmasini zorlastir.
    // Kullanici bilerek "yine de olustur" derse (force) gecilir.
    if (!input.force) {
      const similar = await this.findSimilarCustomers({ customerName, phone, scope: input.scope });
      if (similar.length > 0) {
        throw new AppError(
          'Benzer cari(ler) bulundu. Mevcut cariyi secebilir veya yine de yeni cari olusturabilirsiniz.',
          409,
          ErrorCode.BAD_REQUEST,
          { kind: 'DUPLICATE_VISIT_CUSTOMER', candidates: similar }
        );
      }
    }

    const createdMikro = await this.createMikroVisitCustomer({ customerName, phone, email });
    if (!createdMikro.cariCode) {
      throw new AppError('Mikro cari kodu olusturulamadi.', 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }

    const actor = input.scope.userId
      ? await prisma.user.findUnique({
          where: { id: input.scope.userId },
          select: { id: true, name: true, displayName: true, email: true },
        })
      : null;

    const hashedPassword = await hashPassword(`VISIT-${createdMikro.cariCode}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const customer = await prisma.user.create({
      data: {
        email: email || null,
        password: hashedPassword,
        name: customerName,
        mikroName: customerName,
        displayName: customerName,
        role: UserRole.CUSTOMER,
        customerType: CustomerType.PERAKENDE,
        mikroCariCode: createdMikro.cariCode,
        phone: phone || null,
        groupCode: VISIT_CUSTOMER_GROUP_CODE,
        sectorCode: VISIT_CUSTOMER_SECTOR_CODE,
        hasEInvoice: false,
        balance: 0,
        isLocked: false,
      },
      select: CUSTOMER_SELECT,
    });

    await prisma.cart.create({ data: { userId: customer.id } }).catch(() => null);

    const createdNote = await prisma.fieldSalesVisitNote.create({
      data: {
        customerId: customer.id,
        customerCode: createdMikro.cariCode,
        customerName,
        note,
        demand: input.demand ? String(input.demand).trim() : null,
        competitorInfo: input.competitorInfo ? String(input.competitorInfo).trim() : null,
        photoUrl: input.photoUrl ? String(input.photoUrl).trim() : null,
        latitude: Number.isFinite(Number(input.latitude)) ? Number(input.latitude) : null,
        longitude: Number.isFinite(Number(input.longitude)) ? Number(input.longitude) : null,
        createdById: actor?.id || null,
        createdByName: actor?.displayName || actor?.name || actor?.email || null,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return {
      customer: {
        ...customer,
        displayTitle: displayName(customer),
      },
      note: createdNote,
    };
  }

  async listVisits(input: {
    search?: string;
    startDate?: string;
    endDate?: string;
    onlyVisitCustomers?: boolean;
    page?: number;
    limit?: number;
    scope: StaffScope;
  }) {
    const page = Math.max(1, Math.trunc(Number(input.page) || 1));
    const limit = Math.max(1, Math.min(Math.trunc(Number(input.limit) || 60), 200));
    const tokens = splitSearchTokens(input.search || '');
    const and: Prisma.FieldSalesVisitNoteWhereInput[] = [];

    if (input.startDate || input.endDate) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (input.startDate) {
        const start = new Date(`${input.startDate}T00:00:00`);
        if (!Number.isNaN(start.getTime())) createdAt.gte = start;
      }
      if (input.endDate) {
        const end = new Date(`${input.endDate}T23:59:59.999`);
        if (!Number.isNaN(end.getTime())) createdAt.lte = end;
      }
      if (createdAt.gte || createdAt.lte) and.push({ createdAt });
    }

    if (input.onlyVisitCustomers) {
      and.push({
        OR: [
          { customerCode: { startsWith: VISIT_CUSTOMER_PREFIX } },
          { customer: { is: { groupCode: VISIT_CUSTOMER_GROUP_CODE } } },
          { customer: { is: { sectorCode: VISIT_CUSTOMER_SECTOR_CODE } } },
        ],
      });
    }

    if (tokens.length > 0) {
      and.push(
        ...tokens.map((token) => ({
          OR: [
            { customerCode: { contains: token, mode: 'insensitive' as const } },
            { customerName: { contains: token, mode: 'insensitive' as const } },
            { note: { contains: token, mode: 'insensitive' as const } },
            { demand: { contains: token, mode: 'insensitive' as const } },
            { competitorInfo: { contains: token, mode: 'insensitive' as const } },
            { createdByName: { contains: token, mode: 'insensitive' as const } },
            { customer: { is: { displayName: { contains: token, mode: 'insensitive' as const } } } },
            { customer: { is: { mikroName: { contains: token, mode: 'insensitive' as const } } } },
            { customer: { is: { name: { contains: token, mode: 'insensitive' as const } } } },
            { customer: { is: { phone: { contains: token, mode: 'insensitive' as const } } } },
            { customer: { is: { city: { contains: token, mode: 'insensitive' as const } } } },
            { customer: { is: { district: { contains: token, mode: 'insensitive' as const } } } },
          ],
        }))
      );
    }

    if (input.scope.role === UserRole.SALES_REP) {
      const customerScope = this.buildCustomerScope(input.scope);
      and.push({
        OR: [
          { createdById: input.scope.userId || '__none__' },
          ...(customerScope ? [{ customer: { is: customerScope } }] : []),
        ],
      });
    }

    const where: Prisma.FieldSalesVisitNoteWhereInput = and.length > 0 ? { AND: and } : {};

    const visitCustomerFilter: Prisma.FieldSalesVisitNoteWhereInput = {
      OR: [
        { customerCode: { startsWith: VISIT_CUSTOMER_PREFIX } },
        { customer: { is: { groupCode: VISIT_CUSTOMER_GROUP_CODE } } },
        { customer: { is: { sectorCode: VISIT_CUSTOMER_SECTOR_CODE } } },
      ],
    };

    const [total, customerGroups, photoCount, visitCustomerNotes, visits] = await Promise.all([
      prisma.fieldSalesVisitNote.count({ where }),
      prisma.fieldSalesVisitNote.groupBy({
        by: ['customerCode'],
        where,
        _count: { _all: true },
      }),
      prisma.fieldSalesVisitNote.count({
        where: {
          AND: [
            where,
            { photoUrl: { not: null } },
          ],
        },
      }),
      prisma.fieldSalesVisitNote.count({
        where: {
          AND: [
            where,
            visitCustomerFilter,
          ],
        },
      }),
      prisma.fieldSalesVisitNote.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          customer: {
            select: {
              id: true,
              displayName: true,
              mikroName: true,
              name: true,
              mikroCariCode: true,
              phone: true,
              city: true,
              district: true,
              groupCode: true,
              sectorCode: true,
            },
          },
          createdBy: { select: { id: true, name: true, displayName: true, email: true } },
        },
      }),
    ]);

    const mappedVisits = visits.map((visit) => {
      const customerCode = normalizeCode(visit.customerCode || visit.customer?.mikroCariCode);
      const isVisitCustomer =
        customerCode.startsWith(VISIT_CUSTOMER_PREFIX) ||
        visit.customer?.groupCode === VISIT_CUSTOMER_GROUP_CODE ||
        visit.customer?.sectorCode === VISIT_CUSTOMER_SECTOR_CODE;
      return {
        id: visit.id,
        customerId: visit.customerId,
        customerCode,
        customerName: visit.customerName || displayName(visit.customer || {}),
        customerTitle: displayName(visit.customer || {
          displayName: visit.customerName,
          mikroCariCode: customerCode,
        }),
        phone: visit.customer?.phone || null,
        city: visit.customer?.city || null,
        district: visit.customer?.district || null,
        isVisitCustomer,
        note: visit.note,
        demand: visit.demand,
        competitorInfo: visit.competitorInfo,
        photoUrl: visit.photoUrl,
        latitude: visit.latitude,
        longitude: visit.longitude,
        createdById: visit.createdById,
        createdByName: visit.createdByName || visit.createdBy?.displayName || visit.createdBy?.name || visit.createdBy?.email || null,
        createdAt: visit.createdAt,
        updatedAt: visit.updatedAt,
      };
    });

    return {
      visits: mappedVisits,
      summary: {
        total,
        uniqueCustomers: customerGroups.length,
        visitCustomerNotes,
        photoCount,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getVisitNotes(customerIdOrCode: string, scope: StaffScope, limit = 20) {
    const customer = await this.resolveCustomer(customerIdOrCode, scope);
    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 80));
    return prisma.fieldSalesVisitNote.findMany({
      where: {
        OR: [
          { customerId: customer.id },
          { customerCode: normalizeCode(customer.mikroCariCode) },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async createVisitNote(input: {
    customerIdOrCode: string;
    scope: StaffScope;
    note?: string;
    demand?: string | null;
    competitorInfo?: string | null;
    photoUrl?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  }) {
    const customer = await this.resolveCustomer(input.customerIdOrCode, input.scope);
    const note = String(input.note || '').trim();
    if (!note) throw new AppError('Not alanı zorunludur.', 400, ErrorCode.BAD_REQUEST);

    const actor = input.scope.userId
      ? await prisma.user.findUnique({
          where: { id: input.scope.userId },
          select: { id: true, name: true, displayName: true, email: true },
        })
      : null;

    const created = await prisma.fieldSalesVisitNote.create({
      data: {
        customerId: customer.id,
        customerCode: normalizeCode(customer.mikroCariCode),
        customerName: displayName(customer),
        note,
        demand: input.demand ? String(input.demand).trim() : null,
        competitorInfo: input.competitorInfo ? String(input.competitorInfo).trim() : null,
        photoUrl: input.photoUrl ? String(input.photoUrl).trim() : null,
        latitude: Number.isFinite(Number(input.latitude)) ? Number(input.latitude) : null,
        longitude: Number.isFinite(Number(input.longitude)) ? Number(input.longitude) : null,
        createdById: actor?.id || null,
        createdByName: actor?.displayName || actor?.name || actor?.email || null,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return { note: created };
  }
}

export default new FieldSalesService();
