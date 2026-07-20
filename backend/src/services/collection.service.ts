/**
 * Koleksiyon servisi ("Sizin icin koleksiyonlar" — Vitrin anasayfa seckileri).
 *
 * Admin-yonetimli koleksiyonlar: kurala gore (RULE: kategori/cok satan/indirimli/yeni)
 * ya da elle secilmis urun listesi (MANUAL). Hedefleme GWP ile ayni: ALL/SEGMENT/ACCOUNT.
 * Salt B2B DB + gorunum; Mikro'ya YAZMA YOK.
 */
import { prisma } from '../utils/prisma';
import { CollectionSourceType, GiftTargetType } from '@prisma/client';
import { buildCustomerProductPayloads, loadCustomerContext } from '../utils/customerProducts';
import exclusionService from './exclusion.service';

type CollectionInput = {
  title?: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  color?: string | null;
  sortOrder?: number;
  sourceType?: string;
  ruleType?: string | null;
  categoryId?: string | null;
  productIds?: string[];
  targetType?: string;
  targetSectorCodes?: string[];
  targetUserIds?: string[];
  active?: boolean;
  validFrom?: string | null;
  validTo?: string | null;
};

type CustomerCollectionQuery = {
  search?: string;
  sort?: string;
  priceType?: 'invoiced' | 'white';
  limit?: number;
  offset?: number;
};

const SOURCE_TO_STR: Record<CollectionSourceType, string> = {
  RULE: 'RULE',
  MANUAL: 'MANUAL',
};
const STR_TO_SOURCE: Record<string, CollectionSourceType> = {
  RULE: 'RULE',
  MANUAL: 'MANUAL',
};
const STR_TO_TARGET: Record<string, GiftTargetType> = {
  all: 'ALL',
  segment: 'SEGMENT',
  account: 'ACCOUNT',
};
const TARGET_TO_STR: Record<GiftTargetType, string> = {
  ALL: 'all',
  SEGMENT: 'segment',
  ACCOUNT: 'account',
};

const toStrArray = (value: any): string[] =>
  Array.isArray(value) ? value.map((v) => String(v).trim()).filter(Boolean) : [];

class CollectionService {
  // ==================== ADMIN CRUD ====================

  async listCollections() {
    const rows = await prisma.collection.findMany({
      orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map((c) => this.toAdminDto(c));
  }

  async getCollection(id: string) {
    const c = await prisma.collection.findUnique({ where: { id } });
    return c ? this.toAdminDto(c) : null;
  }

  private buildData(input: CollectionInput) {
    const data: any = {};
    if (input.title !== undefined) data.title = String(input.title).trim();
    if (input.subtitle !== undefined) data.subtitle = input.subtitle ? String(input.subtitle).trim() : null;
    if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl ? String(input.imageUrl).trim() : null;
    if (input.color !== undefined) data.color = input.color ? String(input.color).trim() : null;
    if (input.sortOrder !== undefined) data.sortOrder = Number.isFinite(Number(input.sortOrder)) ? Math.trunc(Number(input.sortOrder)) : 0;
    if (input.sourceType !== undefined) data.sourceType = STR_TO_SOURCE[String(input.sourceType).toUpperCase()] ?? CollectionSourceType.RULE;
    if (input.ruleType !== undefined) data.ruleType = input.ruleType ? String(input.ruleType).trim() : null;
    if (input.categoryId !== undefined) data.categoryId = input.categoryId ? String(input.categoryId).trim() : null;
    if (input.productIds !== undefined) data.productIds = toStrArray(input.productIds);
    if (input.targetType !== undefined) data.targetType = STR_TO_TARGET[String(input.targetType)] ?? GiftTargetType.ALL;
    if (input.targetSectorCodes !== undefined) data.targetSectorCodes = toStrArray(input.targetSectorCodes);
    if (input.targetUserIds !== undefined) data.targetUserIds = toStrArray(input.targetUserIds);
    if (input.active !== undefined) data.active = Boolean(input.active);
    if (input.validFrom !== undefined) data.validFrom = input.validFrom ? new Date(input.validFrom) : null;
    if (input.validTo !== undefined) data.validTo = input.validTo ? new Date(input.validTo) : null;
    return data;
  }

  async createCollection(input: CollectionInput) {
    const data = this.buildData(input);
    data.title = data.title ?? '';
    const created = await prisma.collection.create({ data });
    return this.toAdminDto(created);
  }

  async updateCollection(id: string, input: CollectionInput) {
    const data = this.buildData(input);
    await prisma.collection.update({ where: { id }, data });
    return this.getCollection(id);
  }

  async deleteCollection(id: string) {
    await prisma.collection.delete({ where: { id } });
    return { success: true };
  }

  private toAdminDto(c: any) {
    return {
      id: c.id,
      title: c.title,
      subtitle: c.subtitle,
      imageUrl: c.imageUrl,
      color: c.color,
      sortOrder: c.sortOrder,
      sourceType: SOURCE_TO_STR[c.sourceType as CollectionSourceType],
      ruleType: c.ruleType,
      categoryId: c.categoryId,
      productIds: c.productIds || [],
      targetType: TARGET_TO_STR[c.targetType as GiftTargetType],
      targetSectorCodes: c.targetSectorCodes || [],
      targetUserIds: c.targetUserIds || [],
      active: c.active,
      validFrom: c.validFrom,
      validTo: c.validTo,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  // ==================== CUSTOMER ====================

  private targetsCustomer(
    collection: { targetType: GiftTargetType; targetSectorCodes: string[]; targetUserIds: string[] },
    user: { id: string; sectorCode: string | null }
  ): boolean {
    if (collection.targetType === GiftTargetType.ALL) return true;
    if (collection.targetType === GiftTargetType.SEGMENT) {
      return !!user.sectorCode && collection.targetSectorCodes.includes(user.sectorCode);
    }
    if (collection.targetType === GiftTargetType.ACCOUNT) {
      return collection.targetUserIds.includes(user.id);
    }
    return false;
  }

  /** RULE koleksiyonlarindaki href turetme; MANUAL ise koleksiyon detay sayfasi. */
  private buildHref(c: {
    id: string;
    sourceType: CollectionSourceType;
    ruleType: string | null;
    categoryId: string | null;
  }): string {
    if (c.sourceType === CollectionSourceType.MANUAL) {
      return `/collections/${c.id}`;
    }
    switch (c.ruleType) {
      case 'category':
        return c.categoryId ? `/products?categoryId=${c.categoryId}` : '/products';
      case 'discounted':
        return '/discounted-products';
      case 'bestseller':
        return '/products';
      case 'new':
        return '/products';
      default:
        return '/products';
    }
  }

  /** Aktif + tarih penceresi + hedefleme eslesen koleksiyonlarin KART verisi (sortOrder). */
  async getActiveForCustomer(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, sectorCode: true },
    });
    if (!user) return { collections: [] };

    const now = new Date();
    const rows = await prisma.collection.findMany({
      where: {
        active: true,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validTo: null }, { validTo: { gte: now } }] },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    const collections = rows
      .filter((c) => this.targetsCustomer(c, user))
      .map((c) => ({
        id: c.id,
        title: c.title,
        subtitle: c.subtitle,
        imageUrl: c.imageUrl,
        color: c.color,
        href: this.buildHref(c),
        sourceType: SOURCE_TO_STR[c.sourceType as CollectionSourceType],
      }));

    return { collections };
  }

  /** MANUAL koleksiyonun urunlerini musteri-fiyatli getir (meta + products). */
  async getCollectionProductsForCustomer(
    id: string,
    userId: string,
    query: CustomerCollectionQuery = {}
  ) {
    const collection = await prisma.collection.findUnique({ where: { id } });
    if (!collection || !collection.active) {
      return null;
    }

    const now = new Date();
    const inWindow =
      (!collection.validFrom || collection.validFrom <= now) &&
      (!collection.validTo || collection.validTo >= now);
    if (!inWindow) return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, sectorCode: true },
    });
    if (!user || !this.targetsCustomer(collection, user)) {
      return null;
    }

    const meta = {
      id: collection.id,
      title: collection.title,
      subtitle: collection.subtitle,
      imageUrl: collection.imageUrl,
      color: collection.color,
      sourceType: SOURCE_TO_STR[collection.sourceType as CollectionSourceType],
    };

    const productIds = collection.productIds || [];
    if (collection.sourceType !== CollectionSourceType.MANUAL || productIds.length === 0) {
      return { collection: meta, products: [], total: 0, hasMore: false };
    }

    const [context, excludedProductCodes] = await Promise.all([
      loadCustomerContext(userId),
      exclusionService.getActiveProductCodeExclusions(),
    ]);
    const searchTokens = String(query.search || '')
      .trim()
      .toLocaleLowerCase('tr')
      .split(/\s+/)
      .filter(Boolean);

    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        active: true,
        hiddenFromCustomers: false,
        ...(excludedProductCodes.length > 0 ? { mikroCode: { notIn: excludedProductCodes } } : {}),
      },
      select: {
        id: true,
        name: true,
        mikroCode: true,
        brandCode: true,
        unit: true,
        unit2: true,
        unit2Factor: true,
        vatRate: true,
        currentCost: true,
        lastEntryPrice: true,
        excessStock: true,
        imageUrl: true,
        warehouseStocks: true,
        warehouseExcessStocks: true,
        pendingCustomerOrdersByWarehouse: true,
        prices: true,
        categoryId: true,
        category: { select: { id: true, name: true } },
      },
    });

    // Admin'in girdigi sirayi koru
    const productMap = new Map(products.map((p) => [p.id, p]));
    const ordered = productIds
      .map((pid) => productMap.get(pid))
      .filter(Boolean)
      .filter((product) => {
        if (searchTokens.length === 0) return true;
        const haystack = `${product?.name || ''} ${product?.mikroCode || ''}`.toLocaleLowerCase('tr');
        return searchTokens.every((token) => haystack.includes(token));
      }) as typeof products;

    const requestedSort = String(query.sort || '');
    const offset = Number.isFinite(query.offset) && Number(query.offset) > 0
      ? Math.floor(Number(query.offset))
      : 0;
    const limit = Number.isFinite(query.limit) && Number(query.limit) > 0
      ? Math.min(Math.floor(Number(query.limit)), 200)
      : undefined;
    const useAdminOrderPreEnrichPaging = !requestedSort && Boolean(limit);
    const productsToPrice = useAdminOrderPreEnrichPaging && limit
      ? ordered.slice(offset, offset + limit)
      : ordered;

    const payload = await buildCustomerProductPayloads({
      products: productsToPrice,
      customer: context.customer,
      priceListRules: context.priceListRules,
      basePriceListPair: context.basePriceListPair,
      includedWarehouses: context.includedWarehouses,
      effectiveVisibility: context.effectiveVisibility,
      isDiscounted: false,
    });

    const priceType = context.effectiveVisibility === 'WHITE_ONLY'
      ? 'white'
      : context.effectiveVisibility === 'INVOICED_ONLY'
        ? 'invoiced'
        : query.priceType || 'invoiced';
    const productPrice = (product: any) => {
      const basePrice = Number(product?.prices?.[priceType]);
      const excessPrice = Number(product?.excessPrices?.[priceType]);
      if (
        !product?.agreement &&
        Number(product?.excessStock) > 0 &&
        Number.isFinite(excessPrice) &&
        excessPrice > 0 &&
        Number.isFinite(basePrice) &&
        excessPrice < basePrice - 0.001
      ) {
        return excessPrice;
      }
      return Number.isFinite(basePrice) ? basePrice : 0;
    };
    const productStock = (product: any) => {
      const value = Number(product?.maxOrderQuantity ?? product?.availableStock ?? product?.excessStock ?? 0);
      return Number.isFinite(value) ? value : 0;
    };
    const compareName = (a: any, b: any) =>
      String(a?.name || '').localeCompare(String(b?.name || ''), 'tr');
    const comparePrice = (a: any, b: any, direction: 1 | -1) => {
      const aPrice = productPrice(a);
      const bPrice = productPrice(b);
      if (aPrice <= 0 && bPrice > 0) return 1;
      if (bPrice <= 0 && aPrice > 0) return -1;
      return (aPrice - bPrice) * direction || compareName(a, b);
    };

    const sortedPayload = [...payload];
    switch (requestedSort) {
      case 'nameAsc':
      case 'name-asc':
        sortedPayload.sort(compareName);
        break;
      case 'nameDesc':
      case 'name-desc':
        sortedPayload.sort((a, b) => compareName(b, a));
        break;
      case 'priceAsc':
      case 'price-asc':
        sortedPayload.sort((a, b) => comparePrice(a, b, 1));
        break;
      case 'priceDesc':
      case 'price-desc':
        sortedPayload.sort((a, b) => comparePrice(a, b, -1));
        break;
      case 'stockAsc':
      case 'stock-asc':
        sortedPayload.sort((a, b) => productStock(a) - productStock(b) || compareName(a, b));
        break;
      case 'stockDesc':
      case 'stock-desc':
        sortedPayload.sort((a, b) => productStock(b) - productStock(a) || compareName(a, b));
        break;
      default:
        // Sort verilmediginde adminin koleksiyon sirasi geriye uyumlu olarak korunur.
        break;
    }

    const total = useAdminOrderPreEnrichPaging ? ordered.length : sortedPayload.length;
    const pagedProducts = useAdminOrderPreEnrichPaging
      ? sortedPayload
      : limit
        ? sortedPayload.slice(offset, offset + limit)
        : sortedPayload.slice(offset);

    return {
      collection: meta,
      products: pagedProducts,
      total,
      hasMore: offset + pagedProducts.length < total,
    };
  }
}

export default new CollectionService();
