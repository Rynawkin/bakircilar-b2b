import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import { AppError, ErrorCode } from '../types/errors';
import priceListService from './price-list.service';
import mikroService from './mikroFactory.service';
import { normalizeSearchText, splitSearchTokens } from '../utils/search';

const STATUS_VALUES = new Set(['DRAFT', 'PUBLISHED', 'ARCHIVED']);
const PRICE_BASIS_VALUES = new Set([
  'CURRENT_COST',
  'LAST_ENTRY',
  'MAX_COST',
  'BETWEEN_COSTS',
  'PRICE_LIST',
]);
const ADJUSTMENT_VALUES = new Set(['MARKUP', 'GROSS_MARGIN', 'LOSS', 'NONE']);
const VAT_VALUES = new Set(['EXCLUDED', 'INCLUDED']);
const DISPLAY_DENSITY_VALUES = new Set(['STANDARD', 'COMPACT']);
const ROUNDING_VALUES = new Set([
  'NONE',
  'NEAREST_0_50',
  'NEAREST_1',
  'NEAREST_5',
  'END_90',
  'END_99',
]);
const GUARD_VALUES = new Set(['NONE', 'CURRENT_COST', 'MAX_COST']);

type CatalogActor = {
  userId?: string | null;
  name?: string | null;
};

type ProductSearchInput = {
  search?: string;
  categoryId?: string;
  brandCode?: string;
  supplierCode?: string;
  page?: number;
  limit?: number;
};

const PRODUCT_FILTER_CACHE_TTL_MS = 5 * 60 * 1000;
let productFilterCache: { data: any; ts: number } | null = null;
const supplierProductCodeCache = new Map<string, { codes: string[]; ts: number }>();

type CatalogItemInput = {
  productId?: string;
  sortOrder?: number;
  fixedPrice?: number | null;
};

type CatalogSectionInput = {
  title?: string;
  categoryId?: string | null;
  categoryName?: string | null;
  sortOrder?: number;
  items?: CatalogItemInput[];
};

type NormalizedCatalogSection = {
  title: string;
  categoryId: string | null;
  categoryName: string | null;
  sortOrder: number;
  items: Array<{ productId: string; sortOrder: number; fixedPrice: number | null }>;
};

export type SalesCatalogInput = {
  name?: string;
  title?: string;
  subtitle?: string | null;
  coverImageUrl?: string | null;
  accentColor?: string;
  status?: string;
  priceBasis?: string;
  adjustmentType?: string;
  adjustmentValue?: number;
  betweenPercent?: number;
  priceListNo?: number | null;
  vatMode?: string;
  roundingMode?: string;
  minimumPriceGuardType?: string;
  minimumPriceGuardPercent?: number;
  excludeStaleCosts?: boolean;
  minCurrentCostDate?: string | null;
  hideOutOfStock?: boolean;
  hideMissingImage?: boolean;
  showStockStatus?: boolean;
  showProductCode?: boolean;
  showUnit?: boolean;
  displayDensity?: string;
  validFrom?: string | null;
  validTo?: string | null;
  sections?: CatalogSectionInput[];
};

type PricingRule = {
  priceBasis: string;
  adjustmentType: string;
  adjustmentValue: number;
  betweenPercent: number;
  priceListNo: number | null;
  vatMode: string;
  roundingMode: string;
  minimumPriceGuardType: string;
  minimumPriceGuardPercent: number;
};

export type SalesCatalogSharePricingContext = {
  id: string;
  token: string;
  name: string;
  recipientName?: string | null;
  linkedCustomerName?: string | null;
  linkedCustomerCode?: string | null;
  useCustomPricing?: boolean;
  adjustmentType?: string | null;
  adjustmentValue?: number | null;
};

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const optionalDate = (value: unknown, endOfDay = false): Date | null => {
  if (!value) return null;
  const text = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+03:00`)
    : new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const formatTrCalendarDate = (value: Date) => value.toLocaleDateString('tr-TR', {
  timeZone: 'Europe/Istanbul',
});

const normalizeEnum = (value: unknown, allowed: Set<string>, fallback: string) => {
  const normalized = String(value || '').trim().toUpperCase();
  return allowed.has(normalized) ? normalized : fallback;
};

const normalizeColor = (value: unknown) => {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#15356b';
};

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const roundPrice = (value: number, mode: string) => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  let result = value;
  switch (mode) {
    case 'NEAREST_0_50':
      result = Math.round(value * 2) / 2;
      break;
    case 'NEAREST_1':
      result = Math.round(value);
      break;
    case 'NEAREST_5':
      result = Math.round(value / 5) * 5;
      break;
    case 'END_90': {
      const candidate = Math.floor(value) + 0.9;
      result = candidate + 0.000001 < value ? candidate + 1 : candidate;
      break;
    }
    case 'END_99': {
      const candidate = Math.floor(value) + 0.99;
      result = candidate + 0.000001 < value ? candidate + 1 : candidate;
      break;
    }
    default:
      result = value;
  }
  return round2(result);
};

const vatFraction = (value: unknown) => {
  const rate = Number(value || 0);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return rate > 1 ? rate / 100 : rate;
};

const sumAvailableStock = (
  warehouseStocks: unknown,
  pendingByWarehouse: unknown,
  includedWarehouses: string[]
) => {
  const stocks = warehouseStocks && typeof warehouseStocks === 'object'
    ? warehouseStocks as Record<string, unknown>
    : {};
  const pending = pendingByWarehouse && typeof pendingByWarehouse === 'object'
    ? pendingByWarehouse as Record<string, unknown>
    : {};
  const warehouses = includedWarehouses.length > 0
    ? includedWarehouses
    : Array.from(new Set([...Object.keys(stocks), ...Object.keys(pending)]));
  return round2(warehouses.reduce((sum, warehouse) => {
    const stock = Number(stocks[warehouse] || 0);
    const reserved = Number(pending[warehouse] || 0);
    return sum + Math.max(0, (Number.isFinite(stock) ? stock : 0) - (Number.isFinite(reserved) ? reserved : 0));
  }, 0));
};

class SalesCatalogService {
  private async getSupplierProductCodes(supplierCode: string) {
    const cacheKey = supplierCode.trim().toUpperCase();
    const cached = supplierProductCodeCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < PRODUCT_FILTER_CACHE_TTL_MS) return cached.codes;

    const supplierProducts = await mikroService.getProductsByMainSupplier(supplierCode);
    const codes = supplierProducts.map((product) => product.code).filter(Boolean);
    if (supplierProductCodeCache.size >= 200) supplierProductCodeCache.clear();
    supplierProductCodeCache.set(cacheKey, { codes, ts: Date.now() });
    return codes;
  }

  private makeShareToken() {
    return crypto.randomBytes(24).toString('base64url');
  }

  catalogInclude() {
    return {
      sections: {
        orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
        include: {
          items: {
            orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
            include: {
              product: {
                select: {
                  id: true,
                  mikroCode: true,
                  name: true,
                  brandCode: true,
                  unit: true,
                  unit2: true,
                  unit2Factor: true,
                  vatRate: true,
                  currentCost: true,
                  currentCostDate: true,
                  lastEntryPrice: true,
                  lastEntryDate: true,
                  imageUrl: true,
                  active: true,
                  hiddenFromCustomers: true,
                  warehouseStocks: true,
                  pendingCustomerOrdersByWarehouse: true,
                  category: { select: { id: true, name: true, mikroCode: true } },
                  images: {
                    orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
                    take: 1,
                    select: { url: true },
                  },
                },
              },
            },
          },
        },
      },
    };
  }

  private buildCatalogData(input: SalesCatalogInput) {
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = String(input.name).trim();
    if (input.title !== undefined) data.title = String(input.title).trim();
    if (input.subtitle !== undefined) data.subtitle = input.subtitle ? String(input.subtitle).trim() : null;
    if (input.coverImageUrl !== undefined) data.coverImageUrl = input.coverImageUrl ? String(input.coverImageUrl).trim() : null;
    if (input.accentColor !== undefined) data.accentColor = normalizeColor(input.accentColor);
    if (input.status !== undefined) data.status = normalizeEnum(input.status, STATUS_VALUES, 'DRAFT');
    if (input.priceBasis !== undefined) data.priceBasis = normalizeEnum(input.priceBasis, PRICE_BASIS_VALUES, 'CURRENT_COST');
    if (input.adjustmentType !== undefined) data.adjustmentType = normalizeEnum(input.adjustmentType, ADJUSTMENT_VALUES, 'MARKUP');
    if (input.adjustmentValue !== undefined) data.adjustmentValue = clamp(input.adjustmentValue, 0, 99.99, 0);
    if (input.betweenPercent !== undefined) data.betweenPercent = clamp(input.betweenPercent, 0, 100, 50);
    if (input.priceListNo !== undefined) {
      const listNo = Math.trunc(Number(input.priceListNo));
      data.priceListNo = listNo >= 1 && listNo <= 10 ? listNo : null;
    }
    if (input.vatMode !== undefined) data.vatMode = normalizeEnum(input.vatMode, VAT_VALUES, 'EXCLUDED');
    if (input.roundingMode !== undefined) data.roundingMode = normalizeEnum(input.roundingMode, ROUNDING_VALUES, 'NEAREST_1');
    if (input.minimumPriceGuardType !== undefined) {
      data.minimumPriceGuardType = normalizeEnum(input.minimumPriceGuardType, GUARD_VALUES, 'NONE');
    }
    if (input.minimumPriceGuardPercent !== undefined) {
      data.minimumPriceGuardPercent = clamp(input.minimumPriceGuardPercent, 0, 500, 0);
    }
    if (input.excludeStaleCosts !== undefined) data.excludeStaleCosts = Boolean(input.excludeStaleCosts);
    if (input.minCurrentCostDate !== undefined) data.minCurrentCostDate = optionalDate(input.minCurrentCostDate);
    if (input.hideOutOfStock !== undefined) data.hideOutOfStock = Boolean(input.hideOutOfStock);
    if (input.hideMissingImage !== undefined) data.hideMissingImage = Boolean(input.hideMissingImage);
    if (input.showStockStatus !== undefined) data.showStockStatus = Boolean(input.showStockStatus);
    if (input.showProductCode !== undefined) data.showProductCode = Boolean(input.showProductCode);
    if (input.showUnit !== undefined) data.showUnit = Boolean(input.showUnit);
    if (input.displayDensity !== undefined) {
      data.displayDensity = normalizeEnum(input.displayDensity, DISPLAY_DENSITY_VALUES, 'STANDARD');
    }
    if (input.validFrom !== undefined) data.validFrom = optionalDate(input.validFrom);
    if (input.validTo !== undefined) data.validTo = optionalDate(input.validTo, true);
    return data;
  }

  private normalizeSections(input: SalesCatalogInput): NormalizedCatalogSection[] {
    const sections = Array.isArray(input.sections) ? input.sections : [];
    const seenProducts = new Set<string>();
    const result = sections.slice(0, 100).map((section, sectionIndex) => {
      const items = (Array.isArray(section.items) ? section.items : [])
        .map((item, itemIndex) => {
          const productId = String(item?.productId || '').trim();
          if (!productId || seenProducts.has(productId)) return null;
          seenProducts.add(productId);
          const fixedPriceRaw = Number(item?.fixedPrice);
          return {
            productId,
            sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Math.trunc(Number(item?.sortOrder)) : itemIndex,
            fixedPrice: Number.isFinite(fixedPriceRaw) && fixedPriceRaw > 0 ? round2(fixedPriceRaw) : null,
          };
        })
        .filter(Boolean) as Array<{ productId: string; sortOrder: number; fixedPrice: number | null }>;
      return {
        title: String(section.title || section.categoryName || `Bolum ${sectionIndex + 1}`).trim(),
        categoryId: section.categoryId ? String(section.categoryId).trim() : null,
        categoryName: section.categoryName ? String(section.categoryName).trim() : null,
        sortOrder: Number.isFinite(Number(section.sortOrder)) ? Math.trunc(Number(section.sortOrder)) : sectionIndex,
        items,
      };
    }).filter((section) => section.items.length > 0);
    if (seenProducts.size > 500) {
      throw new AppError('Bir katalog en fazla 500 urun icerebilir.', 400, ErrorCode.INVALID_INPUT);
    }
    return result;
  }

  private validateForPublish(data: Record<string, unknown>, itemCount: number) {
    const status = String(data.status || 'DRAFT');
    if (status !== 'PUBLISHED') return;
    if (!String(data.title || '').trim()) {
      throw new AppError('Yayinlamak icin katalog basligi zorunludur.', 400, ErrorCode.MISSING_REQUIRED_FIELD);
    }
    if (itemCount === 0) {
      throw new AppError('Yayinlamak icin en az bir urun secin.', 400, ErrorCode.MISSING_REQUIRED_FIELD);
    }
    if (data.excludeStaleCosts && !data.minCurrentCostDate) {
      throw new AppError('Eski maliyetleri dislamak icin minimum maliyet tarihi secin.', 400, ErrorCode.INVALID_INPUT);
    }
    if (data.priceBasis === 'PRICE_LIST' && !data.priceListNo) {
      throw new AppError('Fiyat listesi yontemi icin 1-10 arasinda liste secin.', 400, ErrorCode.INVALID_INPUT);
    }
    const validFrom = data.validFrom instanceof Date ? data.validFrom : null;
    const validTo = data.validTo instanceof Date ? data.validTo : null;
    if (validFrom && validTo && validFrom > validTo) {
      throw new AppError('Gecerlilik baslangici bitis tarihinden sonra olamaz.', 400, ErrorCode.INVALID_INPUT);
    }
  }

  async getProductFilters() {
    if (productFilterCache && Date.now() - productFilterCache.ts < PRODUCT_FILTER_CACHE_TTL_MS) {
      return productFilterCache.data;
    }

    const [categories, brandRows, suppliers] = await Promise.all([
      prisma.category.findMany({
        where: { active: true },
        select: { id: true, mikroCode: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.product.findMany({
        where: { active: true, brandCode: { not: null } },
        select: { brandCode: true },
        distinct: ['brandCode'],
      }),
      mikroService.getMainSupplierList(),
    ]);

    const brands = brandRows
      .map((row) => String(row.brandCode || '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'tr'))
      .map((code) => ({ code, name: code }));

    const data = {
      categories,
      brands,
      suppliers: suppliers.map((supplier) => ({
        code: supplier.cariKod,
        name: supplier.cariName || supplier.cariKod,
        productCount: supplier.productCount,
      })),
    };
    productFilterCache = { data, ts: Date.now() };
    return data;
  }

  async searchProducts(input: ProductSearchInput) {
    const page = Math.max(1, Math.trunc(Number(input.page) || 1));
    const limit = Math.min(100, Math.max(20, Math.trunc(Number(input.limit) || 100)));
    const where: any = { active: true };
    const andFilters: any[] = [];

    const searchTokens = splitSearchTokens(input.search);
    if (searchTokens.length > 0) {
      andFilters.push(...searchTokens.map((token) => ({
        OR: [
          { name: { contains: token, mode: 'insensitive' } },
          { mikroCode: { contains: token, mode: 'insensitive' } },
          { searchText: { contains: normalizeSearchText(token) } },
        ],
      })));
    }

    const categoryId = String(input.categoryId || '').trim();
    if (categoryId) where.categoryId = categoryId;

    const brandCode = String(input.brandCode || '').trim();
    if (brandCode) where.brandCode = { equals: brandCode, mode: 'insensitive' };

    const supplierCode = String(input.supplierCode || '').trim();
    if (supplierCode) {
      const supplierProductCodes = await this.getSupplierProductCodes(supplierCode);
      andFilters.push({ mikroCode: { in: supplierProductCodes.length > 0 ? supplierProductCodes : ['__none__'] } });
    }

    if (andFilters.length > 0) where.AND = andFilters;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        select: {
          id: true,
          mikroCode: true,
          name: true,
          brandCode: true,
          unit: true,
          imageUrl: true,
          currentCost: true,
          currentCostDate: true,
          lastEntryPrice: true,
          category: {
            select: { id: true, mikroCode: true, name: true },
          },
        },
        orderBy: [{ name: 'asc' }, { mikroCode: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);

    return {
      products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async listCatalogs() {
    const rows = await prisma.salesCatalog.findMany({
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      include: { _count: { select: { sections: true, items: true } } },
    });
    return rows.map((row) => ({
      ...row,
      sectionCount: row._count.sections,
      itemCount: row._count.items,
      publicPath: `/catalog/${row.shareToken}`,
      _count: undefined,
    }));
  }

  async getCatalog(id: string) {
    const row = await prisma.salesCatalog.findUnique({
      where: { id },
      include: this.catalogInclude(),
    });
    if (!row) return null;
    return this.toAdminDto(row);
  }

  async createCatalog(input: SalesCatalogInput, actor: CatalogActor) {
    const data = this.buildCatalogData(input);
    data.name = String(data.name || data.title || 'Yeni Katalog').trim();
    data.title = String(data.title || data.name || 'Yeni Katalog').trim();
    const shareToken = this.makeShareToken();
    data.shareToken = shareToken;
    data.createdById = actor.userId || null;
    data.createdByName = actor.name || null;
    data.updatedById = actor.userId || null;
    data.updatedByName = actor.name || null;
    const sections = this.normalizeSections(input);
    this.validateForPublish(data, sections.reduce((sum, section) => sum + section.items.length, 0));
    if (data.status === 'PUBLISHED') data.publishedAt = new Date();

    const productIds = sections.flatMap((section) => section.items.map((item) => item.productId));
    await this.assertProductsExist(productIds);

    const created = await prisma.$transaction(async (tx) => {
      const catalog = await tx.salesCatalog.create({ data: data as any });
      await tx.salesCatalogShareLink.create({
        data: {
          catalogId: catalog.id,
          name: 'Genel Link',
          token: shareToken,
          isDefault: true,
          status: data.status === 'ARCHIVED' ? 'PAUSED' : 'ACTIVE',
          createdById: actor.userId || null,
          createdByName: actor.name || null,
          updatedById: actor.userId || null,
          updatedByName: actor.name || null,
        },
      });
      for (const section of sections) {
        const createdSection = await tx.salesCatalogSection.create({
          data: {
            catalogId: catalog.id,
            title: section.title,
            categoryId: section.categoryId,
            categoryName: section.categoryName,
            sortOrder: section.sortOrder,
          },
        });
        if (section.items.length > 0) {
          await tx.salesCatalogItem.createMany({
            data: section.items.map((item) => ({
              catalogId: catalog.id,
              sectionId: createdSection.id,
              productId: item.productId,
              sortOrder: item.sortOrder,
              fixedPrice: item.fixedPrice,
            })),
          });
        }
      }
      return catalog;
    });
    return this.getCatalog(created.id);
  }

  async updateCatalog(id: string, input: SalesCatalogInput, actor: CatalogActor) {
    const existing = await prisma.salesCatalog.findUnique({ where: { id } });
    if (!existing) throw new AppError('Katalog bulunamadi.', 404, ErrorCode.NOT_FOUND);
    const data = this.buildCatalogData(input);
    data.updatedById = actor.userId || null;
    data.updatedByName = actor.name || null;
    const sections = input.sections === undefined ? null : this.normalizeSections(input);
    const merged = { ...existing, ...data } as unknown as Record<string, unknown>;
    if (String(merged.status) === 'PUBLISHED') {
      const itemCount = sections === null
        ? await prisma.salesCatalogItem.count({ where: { catalogId: id } })
        : sections.reduce((sum, section) => sum + section.items.length, 0);
      this.validateForPublish(merged, itemCount);
      if (existing.status !== 'PUBLISHED') data.publishedAt = new Date();
    }

    if (sections) await this.assertProductsExist(sections.flatMap((section) => section.items.map((item) => item.productId)));

    await prisma.$transaction(async (tx) => {
      await tx.salesCatalog.update({
        where: { id },
        data: { ...data, revision: { increment: 1 } } as any,
      });
      if (sections !== null) {
        await tx.salesCatalogItem.deleteMany({ where: { catalogId: id } });
        await tx.salesCatalogSection.deleteMany({ where: { catalogId: id } });
        for (const section of sections) {
          const createdSection = await tx.salesCatalogSection.create({
            data: {
              catalogId: id,
              title: section.title,
              categoryId: section.categoryId,
              categoryName: section.categoryName,
              sortOrder: section.sortOrder,
            },
          });
          if (section.items.length > 0) {
            await tx.salesCatalogItem.createMany({
              data: section.items.map((item) => ({
                catalogId: id,
                sectionId: createdSection.id,
                productId: item.productId,
                sortOrder: item.sortOrder,
                fixedPrice: item.fixedPrice,
              })),
            });
          }
        }
      }
    });
    return this.getCatalog(id);
  }

  async deleteCatalog(id: string) {
    await prisma.salesCatalog.delete({ where: { id } });
    return { success: true };
  }

  async rotateShareToken(id: string, actor: CatalogActor) {
    const shareToken = this.makeShareToken();
    const row = await prisma.$transaction(async (tx) => {
      const catalog = await tx.salesCatalog.update({
        where: { id },
        data: {
          shareToken,
          updatedById: actor.userId || null,
          updatedByName: actor.name || null,
          revision: { increment: 1 },
        },
      });
      const existingDefault = await tx.salesCatalogShareLink.findFirst({
        where: { catalogId: id, isDefault: true },
        select: { id: true },
      });
      if (existingDefault) {
        await tx.salesCatalogShareLink.update({
          where: { id: existingDefault.id },
          data: {
            token: shareToken,
            updatedById: actor.userId || null,
            updatedByName: actor.name || null,
          },
        });
      } else {
        await tx.salesCatalogShareLink.create({
          data: {
            catalogId: id,
            name: 'Genel Link',
            token: shareToken,
            isDefault: true,
            createdById: actor.userId || null,
            createdByName: actor.name || null,
            updatedById: actor.userId || null,
            updatedByName: actor.name || null,
          },
        });
      }
      return catalog;
    });
    return { shareToken: row.shareToken, publicPath: `/catalog/${row.shareToken}` };
  }

  async getAdminPreview(id: string) {
    const catalog = await prisma.salesCatalog.findUnique({ where: { id }, include: this.catalogInclude() });
    if (!catalog) return null;
    return this.buildPresentation(catalog, true);
  }

  async getPublicCatalog(token: string) {
    const now = new Date();
    const catalog = await prisma.salesCatalog.findUnique({
      where: { shareToken: token },
      include: this.catalogInclude(),
    });
    if (!catalog || catalog.status !== 'PUBLISHED') return null;
    if ((catalog.validFrom && catalog.validFrom > now) || (catalog.validTo && catalog.validTo < now)) return null;
    return this.buildPresentation(catalog, false);
  }

  async getPublicPresentationForShareLink(catalogId: string, shareLink: SalesCatalogSharePricingContext) {
    const now = new Date();
    const catalog = await prisma.salesCatalog.findUnique({
      where: { id: catalogId },
      include: this.catalogInclude(),
    });
    if (!catalog || catalog.status !== 'PUBLISHED') return null;
    if ((catalog.validFrom && catalog.validFrom > now) || (catalog.validTo && catalog.validTo < now)) return null;
    return this.buildPresentation(catalog, false, shareLink);
  }

  async recordPdfDownload(token: string) {
    const result = await prisma.salesCatalog.updateMany({
      where: { shareToken: token, status: 'PUBLISHED' },
      data: { pdfDownloadCount: { increment: 1 } },
    });
    return { success: result.count > 0 };
  }

  private async assertProductsExist(productIds: string[]) {
    const unique = Array.from(new Set(productIds));
    if (unique.length === 0) return;
    const count = await prisma.product.count({ where: { id: { in: unique } } });
    if (count !== unique.length) {
      throw new AppError('Secili urunlerden biri artik bulunamiyor.', 400, ErrorCode.PRODUCT_NOT_FOUND);
    }
  }

  private calculatePrice(
    product: any,
    fixedPrice: number | null,
    rule: PricingRule,
    priceStats: any | null
  ) {
    const currentCost = Number(product.currentCost || 0);
    const lastEntryPrice = Number(product.lastEntryPrice || 0);
    let basePrice = 0;
    let basisLabel = rule.priceBasis;

    if (fixedPrice && fixedPrice > 0) {
      basePrice = fixedPrice;
      basisLabel = 'FIXED';
    } else {
      switch (rule.priceBasis) {
        case 'LAST_ENTRY':
          basePrice = lastEntryPrice;
          break;
        case 'MAX_COST':
          basePrice = Math.max(currentCost, lastEntryPrice);
          break;
        case 'BETWEEN_COSTS':
          if (currentCost > 0 && lastEntryPrice > 0) {
            basePrice = lastEntryPrice + (currentCost - lastEntryPrice) * (rule.betweenPercent / 100);
          }
          break;
        case 'PRICE_LIST':
          basePrice = priceListService.getListPrice(priceStats, Number(rule.priceListNo || 0));
          break;
        default:
          basePrice = currentCost;
      }
    }

    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      return { error: 'Fiyat hesaplama tabani bulunamadi.' };
    }

    let calculated = basePrice;
    if (!fixedPrice) {
      if (rule.adjustmentType === 'MARKUP') calculated = basePrice * (1 + rule.adjustmentValue / 100);
      if (rule.adjustmentType === 'LOSS') calculated = basePrice * (1 - rule.adjustmentValue / 100);
      if (rule.adjustmentType === 'GROSS_MARGIN') {
        if (rule.adjustmentValue >= 100) return { error: 'Brut marj %100 veya daha buyuk olamaz.' };
        calculated = basePrice / (1 - rule.adjustmentValue / 100);
      }
      if (rule.vatMode === 'INCLUDED') calculated *= 1 + vatFraction(product.vatRate);
      calculated = roundPrice(calculated, rule.roundingMode);
    } else {
      calculated = round2(calculated);
    }
    if (!Number.isFinite(calculated) || calculated <= 0) {
      return { error: 'Hesaplanan satis fiyati gecersiz.' };
    }

    let guardBase = 0;
    if (rule.minimumPriceGuardType === 'CURRENT_COST') guardBase = currentCost;
    if (rule.minimumPriceGuardType === 'MAX_COST') guardBase = Math.max(currentCost, lastEntryPrice);
    if (guardBase > 0) {
      const minimumPrice = guardBase * (1 + rule.minimumPriceGuardPercent / 100);
      const minimumWithVat = rule.vatMode === 'INCLUDED'
        ? minimumPrice * (1 + vatFraction(product.vatRate))
        : minimumPrice;
      if (calculated + 0.005 < minimumWithVat) {
        return { error: `Minimum fiyat guvenlik sinirinin altinda (${round2(minimumWithVat)} TL).` };
      }
    }

    const comparisonCost = currentCost > 0
      ? currentCost * (rule.vatMode === 'INCLUDED' ? 1 + vatFraction(product.vatRate) : 1)
      : 0;
    return {
      price: calculated,
      basePrice: round2(basePrice),
      basisLabel,
      isBelowCurrentCost: comparisonCost > 0 && calculated + 0.005 < comparisonCost,
    };
  }

  async buildPresentation(
    catalog: any,
    includeAdmin: boolean,
    shareLink?: SalesCatalogSharePricingContext | null
  ) {
    const allItems = catalog.sections.flatMap((section: any) => section.items || []);
    const productCodes = allItems.map((item: any) => item.product?.mikroCode).filter(Boolean);
    const [priceStatsMap, settings] = await Promise.all([
      priceListService.getPriceStatsMap(productCodes),
      prisma.settings.findFirst({ select: { includedWarehouses: true } }),
    ]);
    const includedWarehouses = settings?.includedWarehouses || [];
    const rule: PricingRule = {
      priceBasis: catalog.priceBasis,
      adjustmentType: shareLink?.useCustomPricing
        ? normalizeEnum(shareLink.adjustmentType, ADJUSTMENT_VALUES, catalog.adjustmentType)
        : catalog.adjustmentType,
      adjustmentValue: shareLink?.useCustomPricing
        ? clamp(shareLink.adjustmentValue, 0, 99.99, Number(catalog.adjustmentValue || 0))
        : Number(catalog.adjustmentValue || 0),
      betweenPercent: Number(catalog.betweenPercent ?? 50),
      priceListNo: catalog.priceListNo,
      vatMode: catalog.vatMode,
      roundingMode: catalog.roundingMode,
      minimumPriceGuardType: catalog.minimumPriceGuardType,
      minimumPriceGuardPercent: Number(catalog.minimumPriceGuardPercent || 0),
    };
    const excluded: any[] = [];
    const sections = catalog.sections.map((section: any) => {
      const products = section.items.map((item: any) => {
        const product = item.product;
        const reasons: string[] = [];
        if (!product?.active) reasons.push('Urun pasif.');
        if (product?.hiddenFromCustomers) reasons.push('Urun musterilerden gizli.');
        if (catalog.excludeStaleCosts) {
          if (!product?.currentCostDate) reasons.push('Guncel maliyet tarihi yok.');
          else if (catalog.minCurrentCostDate && product.currentCostDate < catalog.minCurrentCostDate) {
            reasons.push(`Guncel maliyet tarihi ${formatTrCalendarDate(catalog.minCurrentCostDate)} oncesinde.`);
          }
        }
        const imageUrl = product?.images?.[0]?.url || product?.imageUrl || null;
        if (catalog.hideMissingImage && !imageUrl) reasons.push('Urun gorseli yok.');
        const totalStock = sumAvailableStock(
          product?.warehouseStocks,
          product?.pendingCustomerOrdersByWarehouse,
          includedWarehouses
        );
        if (catalog.hideOutOfStock && totalStock <= 0) reasons.push('Kullanilabilir stok yok.');

        const priceResult = this.calculatePrice(
          product,
          item.fixedPrice ? Number(item.fixedPrice) : null,
          rule,
          priceStatsMap.get(product?.mikroCode) || null
        );
        if ('error' in priceResult) reasons.push(priceResult.error || 'Fiyat hesaplanamadi.');

        if (reasons.length > 0) {
          excluded.push({
            productId: product?.id || item.productId,
            productCode: product?.mikroCode || '-',
            productName: product?.name || 'Bilinmeyen urun',
            currentCostDate: product?.currentCostDate || null,
            reasons,
          });
          return null;
        }

        const base = {
          id: product.id,
          productCode: product.mikroCode,
          name: product.name,
          brandCode: product.brandCode,
          unit: product.unit,
          unit2: product.unit2,
          unit2Factor: product.unit2Factor,
          imageUrl,
          salePrice: (priceResult as any).price,
          stockStatus: catalog.showStockStatus ? (totalStock > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK') : null,
        };
        if (!includeAdmin) return base;
        return {
          ...base,
          currentCost: product.currentCost,
          currentCostDate: product.currentCostDate,
          lastEntryPrice: product.lastEntryPrice,
          lastEntryDate: product.lastEntryDate,
          totalStock,
          fixedPrice: item.fixedPrice ? Number(item.fixedPrice) : null,
          pricing: priceResult,
        };
      }).filter(Boolean);
      return {
        id: section.id,
        title: section.title,
        categoryId: section.categoryId,
        categoryName: section.categoryName,
        sortOrder: section.sortOrder,
        products,
      };
    }).filter((section: any) => section.products.length > 0);

    const publicMeta = {
      id: catalog.id,
      title: catalog.title,
      subtitle: catalog.subtitle,
      coverImageUrl: catalog.coverImageUrl,
      accentColor: catalog.accentColor,
      shareToken: shareLink?.token || catalog.shareToken,
      publicPath: `/catalog/${shareLink?.token || catalog.shareToken}`,
      status: catalog.status,
      vatMode: catalog.vatMode,
      validFrom: catalog.validFrom,
      validTo: catalog.validTo,
      revision: catalog.revision,
      showStockStatus: catalog.showStockStatus,
      showProductCode: catalog.showProductCode,
      showUnit: catalog.showUnit,
      displayDensity: catalog.displayDensity,
      generatedAt: new Date(),
      shareLinkId: shareLink?.id || null,
      shareLinkName: shareLink?.name || 'Genel Link',
      recipientLabel: shareLink
        ? (shareLink.recipientName || shareLink.linkedCustomerName || null)
        : null,
      linkedCustomerCode: shareLink?.linkedCustomerCode || null,
      personalized: Boolean(shareLink && (shareLink.recipientName || shareLink.linkedCustomerName)),
    };
    if (!includeAdmin) return { catalog: publicMeta, sections };
    return {
      catalog: {
        ...publicMeta,
        name: catalog.name,
        priceBasis: catalog.priceBasis,
        adjustmentType: catalog.adjustmentType,
        adjustmentValue: catalog.adjustmentValue,
        betweenPercent: catalog.betweenPercent,
        priceListNo: catalog.priceListNo,
        roundingMode: catalog.roundingMode,
        minimumPriceGuardType: catalog.minimumPriceGuardType,
        minimumPriceGuardPercent: catalog.minimumPriceGuardPercent,
        excludeStaleCosts: catalog.excludeStaleCosts,
        minCurrentCostDate: catalog.minCurrentCostDate,
      },
      sections,
      excluded,
      summary: {
        selectedProducts: allItems.length,
        includedProducts: sections.reduce((sum: number, section: any) => sum + section.products.length, 0),
        excludedProducts: excluded.length,
      },
    };
  }

  private toAdminDto(catalog: any) {
    return {
      id: catalog.id,
      name: catalog.name,
      title: catalog.title,
      subtitle: catalog.subtitle,
      coverImageUrl: catalog.coverImageUrl,
      accentColor: catalog.accentColor,
      shareToken: catalog.shareToken,
      publicPath: `/catalog/${catalog.shareToken}`,
      status: catalog.status,
      priceBasis: catalog.priceBasis,
      adjustmentType: catalog.adjustmentType,
      adjustmentValue: catalog.adjustmentValue,
      betweenPercent: catalog.betweenPercent,
      priceListNo: catalog.priceListNo,
      vatMode: catalog.vatMode,
      roundingMode: catalog.roundingMode,
      minimumPriceGuardType: catalog.minimumPriceGuardType,
      minimumPriceGuardPercent: catalog.minimumPriceGuardPercent,
      excludeStaleCosts: catalog.excludeStaleCosts,
      minCurrentCostDate: catalog.minCurrentCostDate,
      hideOutOfStock: catalog.hideOutOfStock,
      hideMissingImage: catalog.hideMissingImage,
      showStockStatus: catalog.showStockStatus,
      showProductCode: catalog.showProductCode,
      showUnit: catalog.showUnit,
      displayDensity: catalog.displayDensity,
      validFrom: catalog.validFrom,
      validTo: catalog.validTo,
      publishedAt: catalog.publishedAt,
      revision: catalog.revision,
      viewCount: catalog.viewCount,
      pdfDownloadCount: catalog.pdfDownloadCount,
      lastViewedAt: catalog.lastViewedAt,
      createdById: catalog.createdById,
      createdByName: catalog.createdByName,
      updatedById: catalog.updatedById,
      updatedByName: catalog.updatedByName,
      createdAt: catalog.createdAt,
      updatedAt: catalog.updatedAt,
      sections: catalog.sections.map((section: any) => ({
        id: section.id,
        title: section.title,
        categoryId: section.categoryId,
        categoryName: section.categoryName,
        sortOrder: section.sortOrder,
        items: section.items.map((item: any) => ({
          id: item.id,
          productId: item.productId,
          sortOrder: item.sortOrder,
          fixedPrice: item.fixedPrice,
          product: {
            id: item.product.id,
            mikroCode: item.product.mikroCode,
            name: item.product.name,
            imageUrl: item.product.images?.[0]?.url || item.product.imageUrl,
            category: item.product.category,
            currentCost: item.product.currentCost,
            currentCostDate: item.product.currentCostDate,
            lastEntryPrice: item.product.lastEntryPrice,
          },
        })),
      })),
    };
  }
}

export default new SalesCatalogService();
