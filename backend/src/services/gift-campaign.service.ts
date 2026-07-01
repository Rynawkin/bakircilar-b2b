/**
 * Hediyeli Kampanya (GWP / gift-with-purchase) servisi.
 * "Eksik kategorilerinden su tutari gec -> bir urunu bedava sec." Cari bazli calisir.
 *
 * Faz 1: model + admin CRUD + cari-bazli aktif kampanya + sepetten baraj (qualifyingTotal)
 * hesabi. Mikro'ya YAZMA YOK. Siparise hediye satiri (Faz 2) ayri ele alinacak.
 */
import { prisma } from '../utils/prisma';
import { cacheService } from './cache.service';
import mikroService from './mikroFactory.service';
import { GiftScopeType, GiftTargetType, PriceType } from '@prisma/client';

const PURCHASED_CATS_NS = 'giftcamp:purchasedcats';
const PURCHASED_CATS_TTL = 60 * 60; // 1 saat

// Hediye Mikro'ya bu birim fiyatla yazilir (kullanici karari: 0,1 ₺)
const GIFT_UNIT_PRICE = 0.1;

type ScopeInput = {
  type?: string;
  categoryIds?: string[];
  productIds?: string[];
};

type CampaignInput = {
  title?: string;
  subtitle?: string | null;
  bannerImageUrl?: string | null;
  buttonText?: string | null;
  threshold?: number;
  thresholdPriceType?: string;
  thresholdVatIncluded?: boolean;
  scopeType?: string;
  scopeCategoryIds?: string[];
  scopeProductIds?: string[];
  giftPickCount?: number;
  targetType?: string;
  targetSectorCodes?: string[];
  targetUserIds?: string[];
  active?: boolean;
  validFrom?: string | null;
  validTo?: string | null;
  gifts?: Array<{ productId: string; sortOrder?: number }>;
};

const SCOPE_TO_STR: Record<GiftScopeType, string> = {
  MISSING_CATEGORIES: 'missingCategories',
  CATEGORY_IDS: 'categoryIds',
  PRODUCT_IDS: 'productIds',
  ALL: 'all',
};
const STR_TO_SCOPE: Record<string, GiftScopeType> = {
  missingCategories: 'MISSING_CATEGORIES',
  categoryIds: 'CATEGORY_IDS',
  productIds: 'PRODUCT_IDS',
  all: 'ALL',
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

const giftValueFromPrices = (prices: any): number => {
  if (!prices || typeof prices !== 'object') return 0;
  const inv = (prices as any).invoiced ?? (prices as any).INVOICED;
  if (typeof inv === 'number') return inv;
  if (inv && typeof inv === 'object') {
    const nested = (inv.LIST ?? inv.list ?? Object.values(inv).find((x) => typeof x === 'number'));
    if (typeof nested === 'number') return nested;
  }
  return 0;
};

class GiftCampaignService {
  // ==================== ADMIN CRUD ====================

  async listCampaigns() {
    const campaigns = await prisma.giftCampaign.findMany({
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      include: { gifts: { orderBy: { sortOrder: 'asc' } } },
    });
    return Promise.all(campaigns.map((c) => this.toAdminDto(c)));
  }

  async getCampaign(id: string) {
    const c = await prisma.giftCampaign.findUnique({
      where: { id },
      include: { gifts: { orderBy: { sortOrder: 'asc' } } },
    });
    return c ? this.toAdminDto(c) : null;
  }

  private buildData(input: CampaignInput) {
    const data: any = {};
    if (input.title !== undefined) data.title = String(input.title).trim();
    if (input.subtitle !== undefined) data.subtitle = input.subtitle ? String(input.subtitle).trim() : null;
    if (input.bannerImageUrl !== undefined) data.bannerImageUrl = input.bannerImageUrl ? String(input.bannerImageUrl).trim() : null;
    if (input.buttonText !== undefined) data.buttonText = input.buttonText ? String(input.buttonText).trim() : null;
    if (input.threshold !== undefined) data.threshold = Number.isFinite(Number(input.threshold)) ? Number(input.threshold) : 0;
    if (input.thresholdPriceType !== undefined) {
      data.thresholdPriceType = String(input.thresholdPriceType).toUpperCase() === 'WHITE' ? PriceType.WHITE : PriceType.INVOICED;
    }
    if (input.thresholdVatIncluded !== undefined) data.thresholdVatIncluded = Boolean(input.thresholdVatIncluded);
    if (input.scopeType !== undefined) data.scopeType = STR_TO_SCOPE[String(input.scopeType)] ?? GiftScopeType.MISSING_CATEGORIES;
    if (input.scopeCategoryIds !== undefined) data.scopeCategoryIds = toStrArray(input.scopeCategoryIds);
    if (input.scopeProductIds !== undefined) data.scopeProductIds = toStrArray(input.scopeProductIds);
    if (input.giftPickCount !== undefined) data.giftPickCount = Math.max(1, Math.trunc(Number(input.giftPickCount) || 1));
    if (input.targetType !== undefined) data.targetType = STR_TO_TARGET[String(input.targetType)] ?? GiftTargetType.ALL;
    if (input.targetSectorCodes !== undefined) data.targetSectorCodes = toStrArray(input.targetSectorCodes);
    if (input.targetUserIds !== undefined) data.targetUserIds = toStrArray(input.targetUserIds);
    if (input.active !== undefined) data.active = Boolean(input.active);
    if (input.validFrom !== undefined) data.validFrom = input.validFrom ? new Date(input.validFrom) : null;
    if (input.validTo !== undefined) data.validTo = input.validTo ? new Date(input.validTo) : null;
    return data;
  }

  async createCampaign(input: CampaignInput) {
    const data = this.buildData(input);
    data.title = data.title ?? '';
    const gifts = Array.isArray(input.gifts) ? input.gifts : [];
    const created = await prisma.giftCampaign.create({
      data: {
        ...data,
        gifts: {
          create: gifts
            .filter((g) => g && g.productId)
            .map((g, index) => ({ productId: String(g.productId), sortOrder: Number(g.sortOrder ?? index) })),
        },
      },
      include: { gifts: { orderBy: { sortOrder: 'asc' } } },
    });
    return this.toAdminDto(created);
  }

  async updateCampaign(id: string, input: CampaignInput) {
    const data = this.buildData(input);
    await prisma.$transaction(async (tx) => {
      await tx.giftCampaign.update({ where: { id }, data });
      if (input.gifts !== undefined) {
        await tx.giftCampaignItem.deleteMany({ where: { campaignId: id } });
        const gifts = Array.isArray(input.gifts) ? input.gifts : [];
        if (gifts.length > 0) {
          await tx.giftCampaignItem.createMany({
            data: gifts
              .filter((g) => g && g.productId)
              .map((g, index) => ({ campaignId: id, productId: String(g.productId), sortOrder: Number(g.sortOrder ?? index) })),
          });
        }
      }
    });
    return this.getCampaign(id);
  }

  async deleteCampaign(id: string) {
    await prisma.giftCampaign.delete({ where: { id } });
    return { success: true };
  }

  private async toAdminDto(campaign: any) {
    const gifts = await this.hydrateGifts(campaign.gifts || []);
    return {
      id: campaign.id,
      title: campaign.title,
      subtitle: campaign.subtitle,
      bannerImageUrl: campaign.bannerImageUrl,
      buttonText: campaign.buttonText,
      threshold: campaign.threshold,
      thresholdPriceType: campaign.thresholdPriceType === PriceType.WHITE ? 'white' : 'invoiced',
      thresholdVatIncluded: campaign.thresholdVatIncluded,
      scopeType: SCOPE_TO_STR[campaign.scopeType as GiftScopeType],
      scopeCategoryIds: campaign.scopeCategoryIds || [],
      scopeProductIds: campaign.scopeProductIds || [],
      giftPickCount: campaign.giftPickCount,
      targetType: TARGET_TO_STR[campaign.targetType as GiftTargetType],
      targetSectorCodes: campaign.targetSectorCodes || [],
      targetUserIds: campaign.targetUserIds || [],
      active: campaign.active,
      validFrom: campaign.validFrom,
      validTo: campaign.validTo,
      gifts,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    };
  }

  private async hydrateGifts(items: Array<{ id: string; productId: string; sortOrder: number }>) {
    if (!items || items.length === 0) return [];
    const productIds = items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, mikroCode: true, imageUrl: true, unit: true, prices: true },
    });
    const map = new Map(products.map((p) => [p.id, p]));
    return items
      .map((item) => {
        const p = map.get(item.productId);
        if (!p) return null;
        return {
          id: item.id,
          productId: item.productId,
          name: p.name,
          mikroCode: p.mikroCode,
          imageUrl: p.imageUrl,
          unit: p.unit,
          value: giftValueFromPrices(p.prices),
        };
      })
      .filter(Boolean);
  }

  // ==================== CUSTOMER (cari bazli aktif kampanya) ====================

  async getActiveForCustomer(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, mikroCariCode: true, sectorCode: true },
    });
    if (!user) return { active: false };

    const now = new Date();
    const campaigns = await prisma.giftCampaign.findMany({
      where: {
        active: true,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validTo: null }, { validTo: { gte: now } }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: { gifts: { orderBy: { sortOrder: 'asc' } } },
    });

    const campaign = campaigns.find((c) => this.targetsCustomer(c, user));
    if (!campaign) return { active: false };

    const qualifyingTotal = await this.computeQualifyingTotal(user, campaign);
    const gifts = await this.hydrateGifts(campaign.gifts || []);
    const remaining = Math.max(0, campaign.threshold - qualifyingTotal);

    // Sepette bu kampanya icin secili hediye(ler) — restore icin
    const cartSel = await prisma.cart.findUnique({
      where: { userId: user.id },
      select: { giftCampaignId: true, giftProductIds: true },
    });
    const selectedGiftProductIds =
      cartSel?.giftCampaignId === campaign.id ? cartSel.giftProductIds || [] : [];

    return {
      active: true,
      id: campaign.id,
      title: campaign.title,
      subtitle: campaign.subtitle,
      bannerImageUrl: campaign.bannerImageUrl,
      buttonText: campaign.buttonText,
      threshold: campaign.threshold,
      thresholdPriceType: campaign.thresholdPriceType === PriceType.WHITE ? 'white' : 'invoiced',
      thresholdVatIncluded: campaign.thresholdVatIncluded,
      qualifyingScope: {
        type: SCOPE_TO_STR[campaign.scopeType as GiftScopeType],
        categoryIds: campaign.scopeCategoryIds || [],
        productIds: campaign.scopeProductIds || [],
      },
      qualifyingTotal: Math.round(qualifyingTotal * 100) / 100,
      qualified: qualifyingTotal >= campaign.threshold && campaign.threshold > 0,
      remaining: Math.round(remaining * 100) / 100,
      giftPickCount: campaign.giftPickCount,
      gifts,
      selectedGiftProductIds,
      validFrom: campaign.validFrom,
      validTo: campaign.validTo,
      target: {
        type: TARGET_TO_STR[campaign.targetType as GiftTargetType],
      },
    };
  }

  /**
   * Siparis olusturulurken eklenecek DOGRULANMIS hediye satirlari.
   * Client'a guvenilmez: kampanya hala aktif+hedefte+baraj gecilmis mi ve secilen urunler
   * havuzda mi yeniden kontrol edilir. Gecerli degilse [] doner (hediye eklenmez).
   * Hediye Mikro'ya 0,1 ₺ olarak yazilir (mevcut writeOrder yolu; yeni Mikro kodu yok).
   */
  async resolveGiftLineForOrder(userId: string): Promise<
    Array<{
      productId: string;
      productName: string;
      mikroCode: string;
      quantity: number;
      unitPrice: number;
      priceType: 'INVOICED';
      lineNote: string;
      isGift: true;
    }>
  > {
    const cart = await prisma.cart.findUnique({
      where: { userId },
      select: { giftCampaignId: true, giftProductIds: true },
    });
    if (!cart?.giftCampaignId || !cart.giftProductIds || cart.giftProductIds.length === 0) {
      return [];
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, mikroCariCode: true, sectorCode: true },
    });
    if (!user) return [];

    const now = new Date();
    const campaign = await prisma.giftCampaign.findFirst({
      where: {
        id: cart.giftCampaignId,
        active: true,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validTo: null }, { validTo: { gte: now } }] },
        ],
      },
      include: { gifts: true },
    });
    if (!campaign) return [];
    if (!this.targetsCustomer(campaign, user)) return [];

    const qualifyingTotal = await this.computeQualifyingTotal(user, campaign);
    if (!(campaign.threshold > 0 && qualifyingTotal >= campaign.threshold)) return [];

    const validGiftProductIds = new Set(campaign.gifts.map((g) => g.productId));
    const selected = cart.giftProductIds
      .filter((id) => validGiftProductIds.has(id))
      .slice(0, Math.max(1, campaign.giftPickCount || 1));
    if (selected.length === 0) return [];

    const products = await prisma.product.findMany({
      where: { id: { in: selected } },
      select: { id: true, name: true, mikroCode: true },
    });
    const map = new Map(products.map((p) => [p.id, p]));

    const lines: Array<{
      productId: string;
      productName: string;
      mikroCode: string;
      quantity: number;
      unitPrice: number;
      priceType: 'INVOICED';
      lineNote: string;
      isGift: true;
    }> = [];
    for (const pid of selected) {
      const p = map.get(pid);
      if (!p || !p.mikroCode) continue;
      lines.push({
        productId: p.id,
        productName: p.name,
        mikroCode: p.mikroCode,
        quantity: 1,
        unitPrice: GIFT_UNIT_PRICE,
        priceType: 'INVOICED',
        lineNote: `KAMPANYA HEDIYESI: ${campaign.title}`,
        isGift: true,
      });
    }
    return lines;
  }

  /** Sepete hediye secimi kaydet (B2B DB — Mikro degil). Faz 2'de siparise tasinir. */
  async setCartGift(userId: string, campaignId: string | null, productIds: string[]) {
    const cart = await prisma.cart.findUnique({ where: { userId }, select: { id: true } });
    if (!cart) return { success: false, error: 'Sepet bulunamadi' };
    const ids = Array.isArray(productIds)
      ? productIds.map((v) => String(v)).filter(Boolean).slice(0, 10)
      : [];
    await prisma.cart.update({
      where: { userId },
      data: { giftCampaignId: campaignId ? String(campaignId) : null, giftProductIds: ids },
    });
    return { success: true };
  }

  private targetsCustomer(
    campaign: { targetType: GiftTargetType; targetSectorCodes: string[]; targetUserIds: string[] },
    user: { id: string; sectorCode: string | null }
  ): boolean {
    if (campaign.targetType === GiftTargetType.ALL) return true;
    if (campaign.targetType === GiftTargetType.SEGMENT) {
      return !!user.sectorCode && campaign.targetSectorCodes.includes(user.sectorCode);
    }
    if (campaign.targetType === GiftTargetType.ACCOUNT) {
      return campaign.targetUserIds.includes(user.id);
    }
    return false;
  }

  /** Sepetteki KAPSAM ICI urunlerin tutarini toplar (tum sepet degil). */
  private async computeQualifyingTotal(
    user: { id: string; mikroCariCode: string | null },
    campaign: {
      scopeType: GiftScopeType;
      scopeCategoryIds: string[];
      scopeProductIds: string[];
      thresholdVatIncluded: boolean;
    }
  ): Promise<number> {
    const cart = await prisma.cart.findUnique({
      where: { userId: user.id },
      select: {
        items: {
          select: {
            quantity: true,
            unitPrice: true,
            product: { select: { id: true, categoryId: true, vatRate: true } },
          },
        },
      },
    });
    const items = cart?.items || [];
    if (items.length === 0) return 0;

    let scopeProductIds: Set<string> | null = null;
    let scopeCategoryIds: Set<string> | null = null;
    let purchasedCategoryIds: Set<string> | null = null;
    let scopeAll = false;

    switch (campaign.scopeType) {
      case GiftScopeType.ALL:
        scopeAll = true;
        break;
      case GiftScopeType.PRODUCT_IDS:
        scopeProductIds = new Set(campaign.scopeProductIds || []);
        break;
      case GiftScopeType.CATEGORY_IDS:
        scopeCategoryIds = new Set(campaign.scopeCategoryIds || []);
        break;
      case GiftScopeType.MISSING_CATEGORIES:
      default:
        purchasedCategoryIds = await this.getPurchasedCategoryIds(user);
        break;
    }

    let total = 0;
    for (const item of items) {
      const product = item.product;
      if (!product) continue;
      let inScope = false;
      if (scopeAll) {
        inScope = true;
      } else if (scopeProductIds) {
        inScope = scopeProductIds.has(product.id);
      } else if (scopeCategoryIds) {
        inScope = !!product.categoryId && scopeCategoryIds.has(product.categoryId);
      } else if (purchasedCategoryIds) {
        // MISSING_CATEGORIES: carinin HIC almadigi kategoriler
        inScope = !!product.categoryId && !purchasedCategoryIds.has(product.categoryId);
      }
      if (!inScope) continue;

      const vatRate = typeof product.vatRate === 'number' ? product.vatRate : 0;
      const vatFactor = campaign.thresholdVatIncluded ? 1 + vatRate : 1;
      total += (item.unitPrice || 0) * (item.quantity || 0) * vatFactor;
    }
    return total;
  }

  private async getPurchasedCategoryIds(user: { id: string; mikroCariCode: string | null }): Promise<Set<string>> {
    const cached = await cacheService.get<string[]>(PURCHASED_CATS_NS, user.id);
    if (cached) return new Set(cached);

    const codeSet = new Set<string>();
    const localRows = await prisma.orderItem.findMany({
      where: { order: { userId: user.id } },
      select: { mikroCode: true },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    for (const row of localRows) {
      const code = String(row.mikroCode || '').trim();
      if (code) codeSet.add(code);
    }
    let codes = Array.from(codeSet);

    if (codes.length === 0 && user.mikroCariCode) {
      try {
        const allCodes = await mikroService.getPurchasedProductCodes(user.mikroCariCode);
        codes = Array.isArray(allCodes) ? allCodes : [];
      } catch (error) {
        console.error('GWP getPurchasedCategoryIds Mikro fallback failed', { userId: user.id, error });
      }
    }

    const catIds = new Set<string>();
    if (codes.length > 0) {
      const products = await prisma.product.findMany({
        where: { mikroCode: { in: codes } },
        select: { categoryId: true },
      });
      for (const p of products) {
        if (p.categoryId) catIds.add(p.categoryId);
      }
    }

    await cacheService.set(PURCHASED_CATS_NS, user.id, Array.from(catIds), PURCHASED_CATS_TTL);
    return catIds;
  }
}

export default new GiftCampaignService();
