import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { AppError, ErrorCode } from '../types/errors';
import mikroService from './mikroFactory.service';
import reportsService from './reports.service';

const normalizeCode = (value: unknown) => String(value || '').trim().toUpperCase();
const escapeSqlLiteral = (value: string) => String(value || '').replace(/'/g, "''");
const asNumber = (value: unknown, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const roundMoney = (value: number) => Number(value.toFixed(4));
const toDateOrNull = (value: unknown) => {
  if (!value) return null;
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date;
};
const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

type UserContext = {
  userId?: string | null;
  userName?: string | null;
};

type CostInput = {
  productCode?: string;
  supplierCode?: string | null;
  supplierName?: string | null;
  supplierProductCode?: string | null;
  costP?: number | string | null;
  costT?: number | string | null;
  currency?: string | null;
  exchangeRate?: number | string | null;
  vatIncluded?: boolean | null;
  vatRate?: number | string | null;
  unit?: string | null;
  unitFactor?: number | string | null;
  minOrderQuantity?: number | string | null;
  leadTimeDays?: number | string | null;
  validUntil?: string | Date | null;
  quoteDate?: string | Date | null;
  note?: string | null;
  sourceType?: string | null;
  attachmentUrl?: string | null;
  status?: string | null;
};

const usableStatuses = new Set(['ACTIVE', 'APPLIED']);

class SupplierCostService {
  async searchProducts(input: { search?: string; limit?: number }) {
    const search = String(input.search || '').trim();
    const limit = Math.max(1, Math.min(Number(input.limit) || 25, 60));
    if (!search) return { products: [] };

    const products = await prisma.product.findMany({
      where: {
        active: true,
        OR: [
          { mikroCode: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { foreignName: { contains: search, mode: 'insensitive' } },
          { brandCode: { contains: search, mode: 'insensitive' } },
        ],
      },
      select: {
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
        category: { select: { mikroCode: true, name: true } },
      },
      orderBy: [{ mikroCode: 'asc' }],
      take: limit,
    });

    const mainSupplierByCode = await this.getMainSupplierMap(products.map((product) => product.mikroCode));
    return {
      products: products.map((product) => ({
        ...product,
        mainSupplier: mainSupplierByCode.get(normalizeCode(product.mikroCode)) || null,
      })),
    };
  }

  async searchSuppliers(input: { search?: string; limit?: number }) {
    const search = String(input.search || '').trim();
    const limit = Math.max(1, Math.min(Number(input.limit) || 25, 100));
    const tokens = search.split(/\s+/).map((token) => token.trim()).filter(Boolean);
    const tokenSql = tokens
      .map((token) => {
        const escaped = escapeSqlLiteral(token);
        return `(cari_kod LIKE N'%${escaped}%' OR cari_unvan1 LIKE N'%${escaped}%')`;
      })
      .join(' AND ');

    const rows = await mikroService.executeQuery(`
      SELECT TOP ${limit}
        LTRIM(RTRIM(cari_kod)) AS code,
        LTRIM(RTRIM(ISNULL(cari_unvan1, ''))) AS name
      FROM CARI_HESAPLAR WITH (NOLOCK)
      WHERE cari_kod LIKE N'320.%'
        ${tokenSql ? `AND ${tokenSql}` : ''}
      ORDER BY cari_kod
    `);

    return {
      suppliers: (rows || []).map((row: any) => ({
        code: String(row.code || '').trim(),
        name: String(row.name || '').trim(),
      })),
    };
  }

  async listCosts(input: {
    search?: string;
    productCode?: string;
    supplierCode?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, Number(input.page) || 1);
    const limit = Math.max(1, Math.min(Number(input.limit) || 50, 200));
    const search = String(input.search || '').trim();
    const productCode = normalizeCode(input.productCode);
    const supplierCode = normalizeCode(input.supplierCode);
    const status = String(input.status || '').trim().toUpperCase();

    const where: Prisma.SupplierProductCostWhereInput = {};
    if (productCode) where.productCode = productCode;
    if (supplierCode) where.supplierCode = supplierCode;
    if (status && status !== 'ALL') where.status = status;
    if (search) {
      where.OR = [
        { productCode: { contains: search, mode: 'insensitive' } },
        { productName: { contains: search, mode: 'insensitive' } },
        { supplierCode: { contains: search, mode: 'insensitive' } },
        { supplierName: { contains: search, mode: 'insensitive' } },
        { supplierProductCode: { contains: search, mode: 'insensitive' } },
        { note: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.supplierProductCost.findMany({
        where,
        include: { product: { select: this.productSelect() } },
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.supplierProductCost.count({ where }),
    ]);

    return {
      items: items.map((item) => this.mapCost(item)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getProductDetail(productCodeRaw: string) {
    const productCode = normalizeCode(productCodeRaw);
    if (!productCode) throw new AppError('Stok kodu zorunludur.', 400, ErrorCode.BAD_REQUEST);

    const product = await prisma.product.findFirst({
      where: { mikroCode: productCode },
      select: this.productSelect(),
    });
    if (!product) throw new AppError('Urun bulunamadi.', 404, ErrorCode.NOT_FOUND);

    const [costs, applications, mainSupplierMap] = await Promise.all([
      prisma.supplierProductCost.findMany({
        where: { productCode, status: { not: 'ARCHIVED' } },
        orderBy: [{ createdAt: 'desc' }],
        include: { product: { select: this.productSelect() } },
      }),
      prisma.supplierCostApplicationLog.findMany({
        where: { productCode },
        orderBy: [{ createdAt: 'desc' }],
        take: 30,
      }),
      this.getMainSupplierMap([productCode]),
    ]);

    const mappedCosts = costs.map((item) => this.mapCost(item));
    return {
      product: {
        ...product,
        mainSupplier: mainSupplierMap.get(productCode) || null,
      },
      costs: mappedCosts,
      applications,
      metrics: this.buildProductMetrics(product, mappedCosts),
    };
  }

  async createCost(input: CostInput, user: UserContext) {
    const product = await this.requireProduct(input.productCode);
    const userInfo = await this.resolveUser(user);
    const data = this.buildCostData(product, input, userInfo);
    const created = await prisma.supplierProductCost.create({
      data,
      include: { product: { select: this.productSelect() } },
    });
    return { cost: this.mapCost(created) };
  }

  async updateCost(id: string, input: CostInput, user: UserContext) {
    const existing = await prisma.supplierProductCost.findUnique({ where: { id } });
    if (!existing) throw new AppError('Maliyet kaydi bulunamadi.', 404, ErrorCode.NOT_FOUND);
    const product = await this.requireProduct(input.productCode || existing.productCode);
    const data = this.buildCostData(product, { ...existing, ...input }, await this.resolveUser(user), false);
    const updated = await prisma.supplierProductCost.update({
      where: { id },
      data,
      include: { product: { select: this.productSelect() } },
    });
    return { cost: this.mapCost(updated) };
  }

  async archiveCost(id: string) {
    const updated = await prisma.supplierProductCost.update({
      where: { id },
      data: { status: 'ARCHIVED' },
      include: { product: { select: this.productSelect() } },
    });
    return { cost: this.mapCost(updated) };
  }

  async applyCost(input: { id: string; updatePriceLists?: boolean; note?: string | null }, user: UserContext) {
    const cost = await prisma.supplierProductCost.findUnique({
      where: { id: input.id },
      include: { product: { select: this.productSelect() } },
    });
    if (!cost || cost.status === 'ARCHIVED') {
      throw new AppError('Uygulanacak maliyet kaydi bulunamadi.', 404, ErrorCode.NOT_FOUND);
    }
    if (!cost.normalizedCostP || cost.normalizedCostP <= 0 || !cost.normalizedCostT || cost.normalizedCostT <= 0) {
      throw new AppError('Normalize maliyet gecersiz.', 400, ErrorCode.BAD_REQUEST);
    }

    const userInfo = await this.resolveUser(user);
    const previousCost = cost.product?.currentCost ?? null;
    const previousCostDate = cost.product?.currentCostDate ?? null;
    const result = await reportsService.updateUcarerProductCost({
      productCode: cost.productCode,
      costP: cost.normalizedCostP,
      costT: cost.normalizedCostT,
      updatePriceLists: Boolean(input.updatePriceLists),
      source: 'SUPPLIER_COST',
      userId: userInfo.userId || null,
    });

    const log = await prisma.supplierCostApplicationLog.create({
      data: {
        supplierCostId: cost.id,
        productId: cost.productId,
        productCode: cost.productCode,
        productName: cost.productName,
        supplierCode: cost.supplierCode,
        supplierName: cost.supplierName,
        previousCost,
        newCostP: result.costP,
        newCostT: result.costT,
        previousCostDate,
        newCostDate: new Date(),
        updatePriceLists: result.priceListsUpdated,
        updatedLists: result.updatedLists as unknown as Prisma.InputJsonValue,
        missingLists: result.missingLists as unknown as Prisma.InputJsonValue,
        note: input.note ? String(input.note).trim() : null,
        userId: userInfo.userId || null,
        userName: userInfo.userName || null,
      },
    });

    const updatedCost = await prisma.supplierProductCost.update({
      where: { id: cost.id },
      data: {
        status: 'APPLIED',
        appliedAt: new Date(),
        appliedById: userInfo.userId || null,
        appliedByName: userInfo.userName || null,
      },
      include: { product: { select: this.productSelect() } },
    });

    return { result, cost: this.mapCost(updatedCost), application: log };
  }

  async importLatestSupplierPriceListMatches(input: { limit?: number }, user: UserContext) {
    const limit = Math.max(1, Math.min(Number(input.limit) || 500, 5000));
    const userInfo = await this.resolveUser(user);
    const matches = await prisma.supplierPriceListMatch.findMany({
      include: {
        product: { select: this.productSelect() },
        item: { include: { upload: { include: { supplier: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    let created = 0;
    let skipped = 0;
    for (const match of matches) {
      const product = match.product;
      const netPrice = Number(match.netPrice || 0);
      if (!product || !Number.isFinite(netPrice) || netPrice <= 0) {
        skipped += 1;
        continue;
      }
      const supplierName = match.item?.upload?.supplier?.name || match.item?.supplierName || 'Tedarikci fiyat listesi';
      const duplicate = await prisma.supplierProductCost.findFirst({
        where: {
          productCode: product.mikroCode,
          supplierName,
          supplierProductCode: match.item?.supplierCode || null,
          normalizedCostP: netPrice,
          sourceType: 'PRICE_LIST',
          createdAt: { gte: daysAgo(2) },
        },
        select: { id: true },
      });
      if (duplicate) {
        skipped += 1;
        continue;
      }
      const productLike = { ...product, vatRate: product.vatRate ?? 0 };
      await prisma.supplierProductCost.create({
        data: this.buildCostData(productLike, {
          productCode: product.mikroCode,
          supplierName,
          supplierProductCode: match.item?.supplierCode || null,
          costP: netPrice,
          costT: netPrice,
          currency: match.item?.priceCurrency || 'TRY',
          vatIncluded: false,
          unit: product.unit,
          unitFactor: 1,
          note: `Tedarikci fiyat listesi eslesmesinden aktarildi. Upload: ${match.item?.uploadId}`,
          sourceType: 'PRICE_LIST',
        }, userInfo),
      });
      created += 1;
    }

    return { created, skipped, total: matches.length };
  }

  async getReports(input: {
    staleDays?: number;
    tolerancePercent?: number;
    spreadPercent?: number;
    search?: string;
    limit?: number;
  }) {
    const staleDays = Math.max(7, Math.min(Number(input.staleDays) || 60, 720));
    const tolerancePercent = Math.max(0, Math.min(Number(input.tolerancePercent) || 10, 100));
    const spreadPercent = Math.max(1, Math.min(Number(input.spreadPercent) || 15, 300));
    const limit = Math.max(20, Math.min(Number(input.limit) || 300, 1000));
    const search = String(input.search || '').trim();
    const cutoff = daysAgo(staleDays);

    const costWhere: Prisma.SupplierProductCostWhereInput = { status: { not: 'ARCHIVED' } };
    if (search) {
      costWhere.OR = [
        { productCode: { contains: search, mode: 'insensitive' } },
        { productName: { contains: search, mode: 'insensitive' } },
        { supplierCode: { contains: search, mode: 'insensitive' } },
        { supplierName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [costs, products] = await Promise.all([
      prisma.supplierProductCost.findMany({
        where: costWhere,
        include: { product: { select: this.productSelect() } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.product.findMany({
        where: search
          ? {
              active: true,
              OR: [
                { mikroCode: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } },
              ],
            }
          : { active: true },
        select: this.productSelect(),
      }),
    ]);

    const productByCode = new Map(products.map((product) => [normalizeCode(product.mikroCode), product]));
    costs.forEach((cost) => {
      if (cost.product) productByCode.set(normalizeCode(cost.productCode), cost.product);
    });

    const grouped = new Map<string, any[]>();
    costs.map((item) => this.mapCost(item)).forEach((item) => {
      const list = grouped.get(item.productCode) || [];
      list.push(item);
      grouped.set(item.productCode, list);
    });

    const mainSupplierMap = await this.getMainSupplierMap(Array.from(grouped.keys()));
    const sections = {
      currentAboveBest: [] as any[],
      currentBelowSupplier: [] as any[],
      staleCosts: [] as any[],
      singleSupplier: [] as any[],
      highSpread: [] as any[],
      expiredCosts: [] as any[],
      betterAfterApplied: [] as any[],
      mainSupplierAboveMarket: [] as any[],
    };

    const now = new Date();
    for (const [productCode, product] of productByCode.entries()) {
      const productCosts = grouped.get(productCode) || [];
      const usable = productCosts.filter((cost) => usableStatuses.has(cost.status) && (!cost.validUntil || new Date(cost.validUntil) >= now));
      const nonExpiredOrApplied = usable.length ? usable : productCosts.filter((cost) => cost.status !== 'ARCHIVED');
      const latestDate = productCosts.reduce<Date | null>((max, cost) => {
        const date = new Date(cost.createdAt);
        return !max || date > max ? date : max;
      }, null);
      const rowBase = this.buildReportRow(product, nonExpiredOrApplied, mainSupplierMap.get(productCode) || null);
      const best = rowBase.bestCost;
      const worst = rowBase.worstCost;
      const current = Number(product.currentCost || 0);

      if (!latestDate || latestDate < cutoff) {
        sections.staleCosts.push({
          ...rowBase,
          daysSinceLatestCost: latestDate ? Math.floor((Date.now() - latestDate.getTime()) / 86400000) : null,
          reason: latestDate ? `${staleDays} gunden eski` : 'Tedarikci maliyeti yok',
        });
      }
      if (usable.length > 0) {
        const suppliers = new Set(usable.map((cost) => cost.supplierCode || cost.supplierName).filter(Boolean));
        if (suppliers.size <= 1) {
          sections.singleSupplier.push({ ...rowBase, reason: 'Tek tedarikci kaydi var' });
        }
      }
      if (best && current > best * (1 + tolerancePercent / 100)) {
        sections.currentAboveBest.push({
          ...rowBase,
          diffAmount: roundMoney(current - best),
          diffPercent: roundMoney(((current - best) / best) * 100),
          reason: 'Mikro maliyeti en iyi tedarikci maliyetinden yuksek',
        });
      }
      if (best && current > 0 && best > current * (1 + tolerancePercent / 100)) {
        sections.currentBelowSupplier.push({
          ...rowBase,
          diffAmount: roundMoney(best - current),
          diffPercent: roundMoney(((best - current) / current) * 100),
          reason: 'Tedarikci maliyeti Mikro maliyetinden yuksek; zarar riski var',
        });
      }
      if (best && worst && best > 0 && ((worst - best) / best) * 100 >= spreadPercent) {
        sections.highSpread.push({
          ...rowBase,
          spreadPercent: roundMoney(((worst - best) / best) * 100),
          reason: 'Tedarikciler arasi fiyat farki yuksek',
        });
      }
      const expired = productCosts.filter((cost) => cost.validUntil && new Date(cost.validUntil) < now);
      if (expired.length > 0) {
        sections.expiredCosts.push({ ...rowBase, expiredCount: expired.length, reason: 'Gecerlilik tarihi dolan maliyet var' });
      }
      if (best && current > 0 && product.currentCostDate) {
        const currentCostDate = new Date(product.currentCostDate);
        const laterBetter = usable.find((cost) => new Date(cost.createdAt) > currentCostDate && cost.normalizedCostP < current * (1 - tolerancePercent / 100));
        if (laterBetter) {
          sections.betterAfterApplied.push({
            ...rowBase,
            bestLaterCost: laterBetter.normalizedCostP,
            reason: 'Son maliyet uygulamasindan sonra daha iyi fiyat gelmis',
          });
        }
      }
      const mainSupplier = mainSupplierMap.get(productCode);
      if (mainSupplier) {
        const mainCosts = usable.filter((cost) => normalizeCode(cost.supplierCode) === normalizeCode(mainSupplier.code));
        const otherCosts = usable.filter((cost) => normalizeCode(cost.supplierCode) !== normalizeCode(mainSupplier.code));
        const mainBest = this.minCost(mainCosts);
        const otherBest = this.minCost(otherCosts);
        if (mainBest && otherBest && mainBest > otherBest * (1 + tolerancePercent / 100)) {
          sections.mainSupplierAboveMarket.push({
            ...rowBase,
            mainSupplierCost: mainBest,
            bestOtherCost: otherBest,
            diffPercent: roundMoney(((mainBest - otherBest) / otherBest) * 100),
            reason: 'Ana saglayici piyasa alternatiflerinden yuksek',
          });
        }
      }
    }

    const sortByImpact = (rows: any[]) =>
      rows
        .sort((a, b) => Number(b.diffPercent || b.spreadPercent || b.daysSinceLatestCost || 0) - Number(a.diffPercent || a.spreadPercent || a.daysSinceLatestCost || 0))
        .slice(0, limit);

    return {
      generatedAt: new Date(),
      params: { staleDays, tolerancePercent, spreadPercent, search, limit },
      summary: {
        productCount: productByCode.size,
        costCount: costs.length,
        currentAboveBest: sections.currentAboveBest.length,
        currentBelowSupplier: sections.currentBelowSupplier.length,
        staleCosts: sections.staleCosts.length,
        singleSupplier: sections.singleSupplier.length,
        highSpread: sections.highSpread.length,
        expiredCosts: sections.expiredCosts.length,
        betterAfterApplied: sections.betterAfterApplied.length,
        mainSupplierAboveMarket: sections.mainSupplierAboveMarket.length,
      },
      sections: Object.fromEntries(Object.entries(sections).map(([key, rows]) => [key, sortByImpact(rows)])),
    };
  }

  private productSelect() {
    return {
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
      category: { select: { mikroCode: true, name: true } },
    } as const;
  }

  private async requireProduct(productCodeRaw: unknown) {
    const productCode = normalizeCode(productCodeRaw);
    if (!productCode) throw new AppError('Stok kodu zorunludur.', 400, ErrorCode.BAD_REQUEST);
    const product = await prisma.product.findFirst({ where: { mikroCode: productCode }, select: this.productSelect() });
    if (!product) throw new AppError('Urun bulunamadi.', 404, ErrorCode.NOT_FOUND);
    return product;
  }

  private async resolveUser(user: UserContext) {
    if (!user.userId) return { userId: null, userName: user.userName || null };
    const row = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { id: true, displayName: true, mikroName: true, name: true, email: true },
    });
    return {
      userId: user.userId,
      userName: row?.displayName || row?.mikroName || row?.name || row?.email || user.userName || null,
    };
  }

  private buildCostData(product: any, input: CostInput, user: { userId?: string | null; userName?: string | null }, includeCreator = true) {
    const supplierName = String(input.supplierName || '').trim();
    const supplierCode = normalizeCode(input.supplierCode);
    if (!supplierName && !supplierCode) {
      throw new AppError('Tedarikci kodu veya adi zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }

    const currency = String(input.currency || 'TRY').trim().toUpperCase() || 'TRY';
    const exchangeRate = currency === 'TRY' ? 1 : asNumber(input.exchangeRate, 0);
    if (currency !== 'TRY' && (!Number.isFinite(exchangeRate) || exchangeRate <= 0)) {
      throw new AppError('Dovizli maliyet icin kur zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }

    const unitFactorRaw = asNumber(input.unitFactor, 1);
    const unitFactor = Number.isFinite(unitFactorRaw) && unitFactorRaw > 0 ? unitFactorRaw : 1;
    const vatRateRaw = input.vatRate === undefined || input.vatRate === null || input.vatRate === ''
      ? Number(product.vatRate || 0)
      : asNumber(input.vatRate);
    const vatRate = vatRateRaw > 1 ? vatRateRaw / 100 : vatRateRaw;
    let costT = asNumber(input.costT);
    let costP = asNumber(input.costP);
    if ((!Number.isFinite(costP) || costP <= 0) && Number.isFinite(costT) && costT > 0) {
      costP = roundMoney(costT * (1 + Math.max(vatRate, 0) / 2));
    }
    if ((!Number.isFinite(costT) || costT <= 0) && Number.isFinite(costP) && costP > 0) {
      costT = costP;
    }
    if (!Number.isFinite(costT) || costT <= 0) {
      throw new AppError('Gecerli bir Maliyet T girin.', 400, ErrorCode.BAD_REQUEST);
    }
    if (!Number.isFinite(costP) || costP <= 0) {
      throw new AppError('Gecerli bir Maliyet P girin.', 400, ErrorCode.BAD_REQUEST);
    }
    const vatDivider = input.vatIncluded ? 1 + vatRate : 1;
    const fx = currency === 'TRY' ? 1 : exchangeRate;
    const normalizedCostP = roundMoney((costP * fx) / unitFactor / vatDivider);
    const normalizedCostT = roundMoney((costT * fx) / unitFactor / vatDivider);

    const data: Prisma.SupplierProductCostUncheckedCreateInput & Prisma.SupplierProductCostUncheckedUpdateInput = {
      productId: product.id,
      productCode: normalizeCode(product.mikroCode),
      productName: product.name || null,
      supplierCode: supplierCode || null,
      supplierName: supplierName || supplierCode,
      supplierProductCode: input.supplierProductCode ? String(input.supplierProductCode).trim() : null,
      costP,
      costT,
      currency,
      exchangeRate: currency === 'TRY' ? null : exchangeRate,
      vatIncluded: Boolean(input.vatIncluded),
      vatRate,
      unit: input.unit ? String(input.unit).trim().toUpperCase() : product.unit || null,
      unitFactor,
      normalizedCostP,
      normalizedCostT,
      minOrderQuantity: input.minOrderQuantity === undefined || input.minOrderQuantity === null || input.minOrderQuantity === '' ? null : asNumber(input.minOrderQuantity),
      leadTimeDays: input.leadTimeDays === undefined || input.leadTimeDays === null || input.leadTimeDays === '' ? null : Math.max(0, Math.round(asNumber(input.leadTimeDays))),
      validUntil: toDateOrNull(input.validUntil),
      quoteDate: toDateOrNull(input.quoteDate) || new Date(),
      note: input.note ? String(input.note).trim() : null,
      sourceType: String(input.sourceType || 'MANUAL').trim().toUpperCase() || 'MANUAL',
      attachmentUrl: input.attachmentUrl ? String(input.attachmentUrl).trim() : null,
      status: String(input.status || 'ACTIVE').trim().toUpperCase() || 'ACTIVE',
    };
    if (includeCreator) {
      data.createdById = user.userId || null;
      data.createdByName = user.userName || null;
    }
    return data;
  }

  private mapCost(item: any) {
    const currentCost = Number(item.product?.currentCost || 0);
    const normalizedCostP = Number(item.normalizedCostP || 0);
    return {
      ...item,
      currentCost,
      currentCostDate: item.product?.currentCostDate || null,
      product: item.product || null,
      diffFromCurrent: currentCost > 0 && normalizedCostP > 0 ? roundMoney(normalizedCostP - currentCost) : null,
      diffFromCurrentPercent: currentCost > 0 && normalizedCostP > 0 ? roundMoney(((normalizedCostP - currentCost) / currentCost) * 100) : null,
      isExpired: item.validUntil ? new Date(item.validUntil) < new Date() : false,
    };
  }

  private buildProductMetrics(product: any, costs: any[]) {
    const usable = costs.filter((cost) => usableStatuses.has(cost.status) && !cost.isExpired);
    const best = usable.reduce<any | null>((min, cost) => (!min || cost.normalizedCostP < min.normalizedCostP ? cost : min), null);
    const worst = usable.reduce<any | null>((max, cost) => (!max || cost.normalizedCostP > max.normalizedCostP ? cost : max), null);
    const supplierCount = new Set(usable.map((cost) => cost.supplierCode || cost.supplierName).filter(Boolean)).size;
    return {
      currentCost: product.currentCost,
      currentCostDate: product.currentCostDate,
      bestCost: best?.normalizedCostP || null,
      bestSupplier: best ? { code: best.supplierCode, name: best.supplierName } : null,
      worstCost: worst?.normalizedCostP || null,
      supplierCount,
      activeCostCount: usable.length,
      expiredCostCount: costs.filter((cost) => cost.isExpired).length,
    };
  }

  private buildReportRow(product: any, costs: any[], mainSupplier: any | null) {
    const sorted = [...costs].sort((a, b) => Number(a.normalizedCostP || 0) - Number(b.normalizedCostP || 0));
    const best = sorted[0] || null;
    const worst = sorted[sorted.length - 1] || null;
    const supplierCount = new Set(costs.map((cost) => cost.supplierCode || cost.supplierName).filter(Boolean)).size;
    return {
      productCode: normalizeCode(product.mikroCode),
      productName: product.name || null,
      categoryName: product.category?.name || null,
      currentCost: product.currentCost ?? null,
      currentCostDate: product.currentCostDate || null,
      lastEntryPrice: product.lastEntryPrice ?? null,
      lastEntryDate: product.lastEntryDate || null,
      bestCost: best?.normalizedCostP || null,
      bestSupplier: best ? { code: best.supplierCode, name: best.supplierName } : null,
      worstCost: worst?.normalizedCostP || null,
      worstSupplier: worst ? { code: worst.supplierCode, name: worst.supplierName } : null,
      supplierCount,
      costCount: costs.length,
      latestCostDate: costs.reduce<string | null>((latest, cost) => {
        const date = String(cost.createdAt || '');
        return !latest || date > latest ? date : latest;
      }, null),
      mainSupplier,
    };
  }

  private minCost(costs: any[]) {
    return costs.reduce<number | null>((min, cost) => {
      const value = Number(cost.normalizedCostP || 0);
      if (!Number.isFinite(value) || value <= 0) return min;
      return min === null || value < min ? value : min;
    }, null);
  }

  private async getMainSupplierMap(productCodes: string[]) {
    const codes = Array.from(new Set(productCodes.map(normalizeCode).filter(Boolean)));
    const map = new Map<string, { code: string; name: string | null }>();
    if (codes.length === 0) return map;
    const inClause = codes.map((code) => `'${escapeSqlLiteral(code)}'`).join(',');
    try {
      const rows = await mikroService.executeQuery(`
        SELECT
          LTRIM(RTRIM(s.sto_kod)) AS productCode,
          LTRIM(RTRIM(ISNULL(s.sto_sat_cari_kod, ''))) AS supplierCode,
          LTRIM(RTRIM(ISNULL(c.cari_unvan1, ''))) AS supplierName
        FROM STOKLAR s WITH (NOLOCK)
        LEFT JOIN CARI_HESAPLAR c WITH (NOLOCK)
          ON c.cari_kod = LTRIM(RTRIM(ISNULL(s.sto_sat_cari_kod, '')))
        WHERE s.sto_kod IN (${inClause})
      `);
      (rows || []).forEach((row: any) => {
        const productCode = normalizeCode(row.productCode);
        const supplierCode = normalizeCode(row.supplierCode);
        if (productCode && supplierCode) {
          map.set(productCode, { code: supplierCode, name: String(row.supplierName || '').trim() || null });
        }
      });
    } catch (error) {
      console.warn('Supplier cost main supplier lookup failed', error);
    }
    return map;
  }
}

export default new SupplierCostService();
