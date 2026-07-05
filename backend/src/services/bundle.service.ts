/**
 * Bundle (paket) admin CRUD servisi.
 *
 * Paket = isBundle=true olan gercek bir Product satiri (sentetik mikroCode). Boylece
 * liste/arama/detay/sepet akislari degismeden "normal urun gibi" calisir. Bilesenler
 * BundleItem'da tutulur. Fiyat/stok musteri-bazli bundle-pricing.service ile hesaplanir.
 *
 * "Paketler" adli gercek bir Category (sentetik kod B2B-PAKETLER) paketin sabit evidir;
 * admin ayrica ikinci bir kategori (bundleSecondaryCategoryId) secebilir.
 */

import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import productImageService from './product-image.service';

const PAKETLER_CATEGORY_CODE = 'B2B-PAKETLER';

export interface BundleItemInput {
  productId: string;
  quantity: number;
  useDiscountedPrice?: boolean;
}
export interface BundleInput {
  title: string;
  secondaryCategoryId?: string | null;
  discountPercent?: number | null;
  active?: boolean;
  items: BundleItemInput[];
}

const clampDiscount = (pct: number | null | undefined): number => {
  const n = Number(pct);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
};

class BundleService {
  /** "Paketler" kategorisini garanti et (yoksa olustur; pasifse aktive et). */
  async ensurePaketlerCategory(): Promise<string> {
    const existing = await prisma.category.findUnique({ where: { mikroCode: PAKETLER_CATEGORY_CODE } });
    if (existing) {
      if (!existing.active) {
        await prisma.category.update({ where: { id: existing.id }, data: { active: true } });
      }
      return existing.id;
    }
    const created = await prisma.category.create({
      data: { mikroCode: PAKETLER_CATEGORY_CODE, name: 'Paketler', active: true },
    });
    return created.id;
  }

  private genBundleCode(): string {
    return `B2B-PKT-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
  }

  private async validateAndLoadComponents(items: BundleItemInput[]) {
    if (!items || items.length === 0) throw new Error('Pakete en az bir urun eklemelisiniz');
    const ids = Array.from(new Set(items.map((i) => i.productId)));
    const products = await prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, isBundle: true, vatRate: true },
    });
    const map = new Map(products.map((p) => [p.id, p]));
    for (const it of items) {
      const p = map.get(it.productId);
      if (!p) throw new Error('Paket bileseni bulunamadi (silinmis olabilir)');
      if (p.isBundle) throw new Error(`Paket icine baska bir paket eklenemez (${p.name})`);
      if (!(Number(it.quantity) > 0)) throw new Error(`Gecersiz adet (${p.name})`);
    }
    return map;
  }

  /** Bilesenlerin en yaygin KDV orani (paket Product.vatRate — sepet KDV yaklasik gosterimi). */
  private dominantVatRate(items: BundleItemInput[], map: Map<string, { vatRate: number }>): number {
    const counts = new Map<number, number>();
    for (const it of items) {
      const v = Number(map.get(it.productId)?.vatRate) || 0;
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    let best = 0.2;
    let bestC = -1;
    for (const [v, c] of counts) {
      if (c > bestC) {
        best = v;
        bestC = c;
      }
    }
    return best;
  }

  async list() {
    const bundles = await prisma.product.findMany({
      where: { isBundle: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, mikroCode: true, imageUrl: true, active: true, hiddenFromCustomers: true,
        bundleDiscountPercent: true, bundleSecondaryCategoryId: true, createdAt: true,
        bundleItems: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, componentProductId: true, quantity: true, useDiscountedPrice: true, sortOrder: true },
        },
      },
    });

    const compIds = Array.from(new Set(bundles.flatMap((b) => b.bundleItems.map((i) => i.componentProductId))));
    const comps = compIds.length
      ? await prisma.product.findMany({
          where: { id: { in: compIds } },
          select: { id: true, name: true, mikroCode: true, imageUrl: true, active: true, hiddenFromCustomers: true },
        })
      : [];
    const compMap = new Map(comps.map((c) => [c.id, c]));

    return bundles.map((b) => ({
      id: b.id,
      title: b.name,
      code: b.mikroCode,
      imageUrl: b.imageUrl,
      active: b.active,
      hiddenFromCustomers: b.hiddenFromCustomers,
      discountPercent: b.bundleDiscountPercent ?? 0,
      secondaryCategoryId: b.bundleSecondaryCategoryId,
      createdAt: b.createdAt,
      items: b.bundleItems.map((i) => {
        const c = compMap.get(i.componentProductId);
        return {
          id: i.id,
          productId: i.componentProductId,
          quantity: i.quantity,
          useDiscountedPrice: i.useDiscountedPrice,
          productName: c?.name || 'Silinmis urun',
          productCode: c?.mikroCode || '',
          imageUrl: c?.imageUrl || null,
          missing: !c || !c.active || c.hiddenFromCustomers,
        };
      }),
    }));
  }

  async create(input: BundleInput, uploaderId: string | null, imageTempPath?: string | null) {
    const title = String(input.title || '').trim();
    if (!title) throw new Error('Paket adi gerekli');
    const map = await this.validateAndLoadComponents(input.items);
    const paketlerCategoryId = await this.ensurePaketlerCategory();
    const discount = clampDiscount(input.discountPercent);
    const vatRate = this.dominantVatRate(input.items, map as any);

    const product = await prisma.product.create({
      data: {
        mikroCode: this.genBundleCode(),
        name: title,
        unit: 'SET',
        vatRate,
        categoryId: paketlerCategoryId,
        bundleSecondaryCategoryId: input.secondaryCategoryId || null,
        isBundle: true,
        bundleDiscountPercent: discount,
        active: input.active !== false,
        hiddenFromCustomers: false,
        prices: {},
        warehouseStocks: {},
        bundleItems: {
          create: input.items.map((it, idx) => ({
            componentProductId: it.productId,
            quantity: Number(it.quantity),
            useDiscountedPrice: Boolean(it.useDiscountedPrice),
            sortOrder: idx,
          })),
        },
      },
    });

    if (imageTempPath) {
      try {
        await productImageService.addImage(product.id, imageTempPath, uploaderId);
      } catch (e) {
        console.error('Bundle image add failed', e);
      }
    }
    return { id: product.id };
  }

  async update(id: string, input: BundleInput, uploaderId: string | null, imageTempPath?: string | null) {
    const bundle = await prisma.product.findUnique({ where: { id }, select: { id: true, isBundle: true } });
    if (!bundle || !bundle.isBundle) throw new Error('Paket bulunamadi');
    const title = String(input.title || '').trim();
    if (!title) throw new Error('Paket adi gerekli');
    const map = await this.validateAndLoadComponents(input.items);
    const discount = clampDiscount(input.discountPercent);
    const vatRate = this.dominantVatRate(input.items, map as any);

    await prisma.$transaction([
      prisma.bundleItem.deleteMany({ where: { bundleProductId: id } }),
      prisma.product.update({
        where: { id },
        data: {
          name: title,
          vatRate,
          bundleSecondaryCategoryId: input.secondaryCategoryId || null,
          bundleDiscountPercent: discount,
          active: input.active !== false,
          bundleItems: {
            create: input.items.map((it, idx) => ({
              componentProductId: it.productId,
              quantity: Number(it.quantity),
              useDiscountedPrice: Boolean(it.useDiscountedPrice),
              sortOrder: idx,
            })),
          },
        },
      }),
    ]);

    if (imageTempPath) {
      try {
        await productImageService.addImage(id, imageTempPath, uploaderId);
      } catch (e) {
        console.error('Bundle image add failed', e);
      }
    }
    return { id };
  }

  async remove(id: string) {
    const bundle = await prisma.product.findUnique({ where: { id }, select: { id: true, isBundle: true } });
    if (!bundle || !bundle.isBundle) throw new Error('Paket bulunamadi');

    // Gecmis siparis/talep satirlarinda referans varsa hard-delete FK'yi kirar (Restrict)
    // -> pasiflestir. (OrderItem ve CustomerRequestItem.productId Restrict FK'dir.)
    const [orderCount, requestCount] = await Promise.all([
      prisma.orderItem.count({ where: { productId: id } }),
      prisma.customerRequestItem.count({ where: { productId: id } }),
    ]);
    if (orderCount > 0 || requestCount > 0) {
      await prisma.product.update({ where: { id }, data: { active: false, hiddenFromCustomers: true } });
      return { deactivated: true };
    }
    // Sepetlerden cikar, sonra sil (cascade: BundleItem + ProductImage).
    await prisma.cartItem.deleteMany({ where: { productId: id } });
    await prisma.product.delete({ where: { id } });
    return { deleted: true };
  }
}

export default new BundleService();
