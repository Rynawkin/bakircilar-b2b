import { OrderStatus, Prisma, QuoteStatus, UserRole } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { AppError, ErrorCode } from '../types/errors';
import { splitSearchTokens } from '../utils/search';
import stockF10Service from './stock-f10.service';
import priceListService from './price-list.service';
import mikroService from './mikroFactory.service';
import { resolveCustomerPriceLists, resolveCustomerPriceListsForProduct } from '../utils/customerPricing';

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
  category: { select: { id: true, name: true } },
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

class FieldSalesService {
  private buildCustomerScope(scope: StaffScope): Prisma.UserWhereInput | null {
    const base: Prisma.UserWhereInput = {
      role: UserRole.CUSTOMER,
      parentCustomerId: null,
      mikroCariCode: { not: null },
    };

    if (scope.role === UserRole.SALES_REP) {
      const sectorCodes = (scope.assignedSectorCodes || []).map((code) => String(code || '').trim()).filter(Boolean);
      if (sectorCodes.length === 0) return null;
      base.sectorCode = { in: sectorCodes };
    }

    return base;
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

    const customers = await prisma.user.findMany({
      where,
      select: CUSTOMER_SELECT,
      orderBy: [{ active: 'desc' }, { mikroCariCode: 'asc' }],
      take: limit,
    });

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
      const lastSales = lastSalesMap.get(code) || [];

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
        categoryCode: String(readFirst(row, ['Kategori kodu']) || '').trim() || null,
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
          MAX(sth.sth_tarih) as lastPurchaseDate,
          SUM(CAST(ISNULL(sth.sth_miktar, 0) AS FLOAT)) as totalQuantity,
          SUM(CAST(ISNULL(sth.sth_tutar, 0) AS FLOAT)) as totalAmount,
          COUNT(DISTINCT LTRIM(RTRIM(ISNULL(sth.sth_evrakno_seri, ''))) + '-' + CAST(ISNULL(sth.sth_evrakno_sira, 0) AS VARCHAR(30))) as documentCount
        FROM STOK_HAREKETLERI sth WITH (NOLOCK)
        LEFT JOIN STOKLAR st WITH (NOLOCK) ON st.sto_kod = sth.sth_stok_kod
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
            select: { mikroCode: true, imageUrl: true, unit: true },
          })
        : [];
      const productMap = new Map(products.map((product) => [normalizeCode(product.mikroCode), product]));

      return rows.map((row) => {
        const product = productMap.get(normalizeCode(row.productCode));
        return {
          productCode: normalizeCode(row.productCode),
          productName: String(row.productName || '').trim(),
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

  async getCustomerOpportunities(customerIdOrCode: string, scope: StaffScope) {
    const customer = await this.resolveCustomer(customerIdOrCode, scope);
    const customerCode = normalizeCode(customer.mikroCariCode);
    const purchased = await this.getCustomerPurchasedProducts(customerCode, 80);
    const ninetyDaysAgo = dateDaysAgo(90);
    const stalePurchased = purchased
      .filter((row) => {
        const date = row.lastPurchaseDate ? new Date(row.lastPurchaseDate).getTime() : 0;
        return !date || date < ninetyDaysAgo.getTime();
      })
      .sort((a, b) => Number(b.totalAmount || 0) - Number(a.totalAmount || 0))
      .slice(0, 12)
      .map((row) => ({
        type: 'STALE_PURCHASE',
        title: 'Eskiden aldigi urun',
        reason: 'Son 90 gunde tekrar alim yok',
        ...row,
      }));

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
        product: { select: { mikroCode: true, name: true, imageUrl: true, unit: true } },
      },
    });

    const agreementNoRecent = agreementNoRecentRows
      .filter((row) => !purchasedSet.has(normalizeCode(row.product.mikroCode)))
      .slice(0, 12)
      .map((row) => ({
        type: 'AGREEMENT_NOT_ORDERED',
        title: 'Anlasmali ama alinmamis urun',
        reason: 'Aktif anlasma var, satis gecmisi bulunmadi',
        productCode: row.product.mikroCode,
        productName: row.product.name,
        imageUrl: row.product.imageUrl,
        unit: row.product.unit,
        priceInvoiced: row.priceInvoiced,
        priceWhite: row.priceWhite,
        minQuantity: row.minQuantity,
      }));

    const similarSector = await this.getSimilarSectorOpportunities(customer, purchasedSet);

    return {
      stalePurchased,
      agreementNoRecent,
      similarSector,
    };
  }

  private async getSimilarSectorOpportunities(customer: any, excludeCodes: Set<string>) {
    const sectorCode = String(customer.sectorCode || '').trim();
    if (!sectorCode) return [];

    try {
      const rows = rowsFromMikro(await mikroService.executeQuery(`
        SELECT TOP 25
          LTRIM(RTRIM(sth.sth_stok_kod)) as productCode,
          MAX(ISNULL(st.sto_isim, '')) as productName,
          COUNT(DISTINCT LTRIM(RTRIM(sth.sth_cari_kodu))) as customerCount,
          SUM(CAST(ISNULL(sth.sth_miktar, 0) AS FLOAT)) as totalQuantity,
          SUM(CAST(ISNULL(sth.sth_tutar, 0) AS FLOAT)) as totalAmount,
          MAX(sth.sth_tarih) as lastPurchaseDate
        FROM STOK_HAREKETLERI sth WITH (NOLOCK)
        INNER JOIN CARI_HESAPLAR ch WITH (NOLOCK) ON ch.cari_kod = sth.sth_cari_kodu
        LEFT JOIN STOKLAR st WITH (NOLOCK) ON st.sto_kod = sth.sth_stok_kod
        WHERE LTRIM(RTRIM(ISNULL(ch.cari_sektor_kodu, ''))) = '${escapeSqlLiteral(sectorCode)}'
          AND LTRIM(RTRIM(sth.sth_cari_kodu)) <> '${escapeSqlLiteral(normalizeCode(customer.mikroCariCode))}'
          AND ISNULL(sth.sth_tip, 0) = 1
          AND ISNULL(sth.sth_evraktip, 0) IN (1, 4)
          AND sth.sth_tarih >= DATEADD(DAY, -120, CAST(GETDATE() AS date))
          AND ISNULL(sth.sth_miktar, 0) > 0
        GROUP BY LTRIM(RTRIM(sth.sth_stok_kod))
        ORDER BY COUNT(DISTINCT LTRIM(RTRIM(sth.sth_cari_kodu))) DESC, SUM(CAST(ISNULL(sth.sth_tutar, 0) AS FLOAT)) DESC
      `));

      const filtered = rows.filter((row) => !excludeCodes.has(normalizeCode(row.productCode))).slice(0, 12);
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
          reason: `${asNumber(row.customerCount)} cari son 120 gunde aldi`,
          productCode: normalizeCode(row.productCode),
          productName: String(row.productName || '').trim(),
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
