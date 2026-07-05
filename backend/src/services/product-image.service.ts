/**
 * Product Image (galeri) Service
 *
 * Bir urunun BIRDEN FAZLA gorselini yonetir. Kaynak dogruluk: ProductImage tablosu.
 * Product.imageUrl + gorsel-meta alanlari, isPrimary olan gorselin AYNASIDIR (denormalize),
 * boylece tum mevcut okuyucular (kartlar, listeler, raporlar, depo, sync) degismeden calisir.
 *
 * Mikro kurali: mye_ImageData tek slot -> Mikro'ya SADECE ana (isPrimary) gorsel gider.
 * Ek gorseller yalniz web'de durur. Paket (isBundle) urunlerinde Mikro'ya HIC gonderilmez.
 */

import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import imageService from './image.service';
import mikroService from './mikroFactory.service';

export interface ProductImageDto {
  id: string;
  url: string;
  sortOrder: number;
  isPrimary: boolean;
  sizeBytes: number | null;
  uploadedAt: Date | null;
  uploadedByName: string | null;
}

class ProductImageService {
  private toDto(row: {
    id: string; url: string; sortOrder: number; isPrimary: boolean;
    sizeBytes: number | null; uploadedAt: Date | null; uploadedByName: string | null;
  }): ProductImageDto {
    return {
      id: row.id,
      url: row.url,
      sortOrder: row.sortOrder,
      isPrimary: row.isPrimary,
      sizeBytes: row.sizeBytes,
      uploadedAt: row.uploadedAt,
      uploadedByName: row.uploadedByName,
    };
  }

  private orderBy = [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];

  async list(productId: string): Promise<ProductImageDto[]> {
    const rows = await prisma.productImage.findMany({ where: { productId }, orderBy: this.orderBy });
    return rows.map((r) => this.toDto(r));
  }

  private async resolveUploaderName(userId: string | null): Promise<string | null> {
    if (!userId) return null;
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
    return u?.name || u?.email || '';
  }

  /** Ana gorseli Mikro'ya yaz (gercek urun; paketlerde cagirilmaz). En iyi caba. */
  private async pushToMikro(mikroCode: string, jpegBuffer: Buffer): Promise<void> {
    const guidRows = await mikroService.getProductGuidsByCodes([mikroCode]);
    const guid = guidRows.find((r) => r.code === mikroCode)?.guid || guidRows[0]?.guid;
    if (!guid) throw new Error('Mikro GUID bulunamadi');
    await imageService.uploadImageToMikro(guid, jpegBuffer);
  }

  /** Product.imageUrl + meta'yi primary ProductImage'dan yeniden yaz. */
  private async syncMirror(productId: string): Promise<void> {
    const primary = await prisma.productImage.findFirst({
      where: { productId, isPrimary: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (primary) {
      await prisma.product.update({
        where: { id: productId },
        data: {
          imageUrl: primary.url,
          imageChecksum: primary.checksum,
          imageSyncStatus: 'SUCCESS',
          imageSyncErrorType: null,
          imageSyncErrorMessage: null,
          imageSyncUpdatedAt: new Date(),
          imageSizeBytes: primary.sizeBytes,
          imageUploadedAt: primary.uploadedAt,
          imageUploadedById: primary.uploadedById,
          imageUploadedByName: primary.uploadedByName,
        },
      });
    } else {
      await prisma.product.update({
        where: { id: productId },
        data: {
          imageUrl: null,
          imageChecksum: null,
          imageSizeBytes: null,
          imageUploadedAt: null,
          imageUploadedById: null,
          imageUploadedByName: null,
          imageSyncUpdatedAt: new Date(),
        },
      });
    }
  }

  /**
   * Galeriye gorsel ekle. Urunun ilk gorseliyse ana (primary) olur -> Mikro'ya gider (paket degilse).
   */
  async addImage(productId: string, tempPath: string, uploaderId: string | null): Promise<ProductImageDto> {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, mikroCode: true, isBundle: true },
    });
    if (!product) throw new Error('Product not found');

    const existingCount = await prisma.productImage.count({ where: { productId } });
    const willBePrimary = existingCount === 0;
    // Ana gorsel `${code}.webp`; ek gorseller benzersiz `${code}-<hex>.webp`.
    const fileKey = willBePrimary ? undefined : `${product.mikroCode}-${crypto.randomBytes(4).toString('hex')}`;

    const processed = await imageService.processUploadedProductImage(tempPath, product.mikroCode, { fileKey });
    const uploaderName = await this.resolveUploaderName(uploaderId);
    const maxSort = (await prisma.productImage.aggregate({ where: { productId }, _max: { sortOrder: true } }))._max.sortOrder ?? -1;

    const row = await prisma.productImage.create({
      data: {
        productId,
        url: processed.imageUrl,
        sortOrder: maxSort + 1,
        isPrimary: willBePrimary,
        sizeBytes: processed.sizeBytes,
        checksum: processed.checksum,
        uploadedAt: new Date(),
        uploadedById: uploaderId,
        uploadedByName: uploaderName,
      },
    });

    if (willBePrimary) {
      if (!product.isBundle) {
        try { await this.pushToMikro(product.mikroCode, processed.buffer); }
        catch (e: any) { console.error(`[product-image] Mikro push (addImage primary) hata (${product.mikroCode}):`, e?.message); }
      }
      await this.syncMirror(productId);
    }

    return this.toDto(row);
  }

  /**
   * Ana gorseli DEGISTIR (eski tek-yukleme davranisi). Mevcut `${code}.webp` dosyasini ezer.
   * Legacy POST /products/:id/image bu yolu kullanir.
   */
  async replacePrimary(
    productId: string,
    tempPath: string,
    uploaderId: string | null
  ): Promise<{ image: ProductImageDto; mikroWarning?: string }> {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, mikroCode: true, isBundle: true },
    });
    if (!product) throw new Error('Product not found');

    const processed = await imageService.processUploadedProductImage(tempPath, product.mikroCode);
    const uploaderName = await this.resolveUploaderName(uploaderId);

    const existingPrimary = await prisma.productImage.findFirst({ where: { productId, isPrimary: true } });
    let row;
    if (existingPrimary) {
      const oldUrl = existingPrimary.url;
      row = await prisma.productImage.update({
        where: { id: existingPrimary.id },
        data: {
          url: processed.imageUrl,
          sizeBytes: processed.sizeBytes,
          checksum: processed.checksum,
          uploadedAt: new Date(),
          uploadedById: uploaderId,
          uploadedByName: uploaderName,
        },
      });
      // Eski primary farkli bir dosyaysa (promote edilmis ek gorsel) yetim dosyayi temizle.
      if (oldUrl && oldUrl !== processed.imageUrl) {
        const stillUsed = await prisma.productImage.count({ where: { url: oldUrl } });
        if (stillUsed === 0) await imageService.deleteProductImage(oldUrl);
      }
    } else {
      // Primary yok: varsa digerlerini primary'den dusur, yenisini olustur.
      await prisma.productImage.updateMany({ where: { productId }, data: { isPrimary: false } });
      row = await prisma.productImage.create({
        data: {
          productId,
          url: processed.imageUrl,
          sortOrder: 0,
          isPrimary: true,
          sizeBytes: processed.sizeBytes,
          checksum: processed.checksum,
          uploadedAt: new Date(),
          uploadedById: uploaderId,
          uploadedByName: uploaderName,
        },
      });
    }

    let mikroWarning: string | undefined;
    if (!product.isBundle) {
      try { await this.pushToMikro(product.mikroCode, processed.buffer); }
      catch (e: any) { mikroWarning = e?.message; console.error(`[product-image] Mikro push (replacePrimary) hata (${product.mikroCode}):`, e?.message); }
    }
    await this.syncMirror(productId);
    return { image: this.toDto(row), mikroWarning };
  }

  /** Bir gorseli ana yap: eskiyi dusur, hedefi kaldir, aynayi guncelle, hedefi Mikro'ya yaz. */
  async setPrimary(productId: string, imageId: string): Promise<void> {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { mikroCode: true, isBundle: true },
    });
    if (!product) throw new Error('Product not found');
    const target = await prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!target) throw new Error('Image not found');

    await prisma.$transaction([
      prisma.productImage.updateMany({ where: { productId, isPrimary: true }, data: { isPrimary: false } }),
      prisma.productImage.update({ where: { id: imageId }, data: { isPrimary: true } }),
    ]);

    if (!product.isBundle) {
      try {
        const abs = imageService.absPathForUrl(target.url);
        const jpeg = await imageService.makeMikroJpegBuffer(abs);
        await this.pushToMikro(product.mikroCode, jpeg);
      } catch (e: any) {
        console.error(`[product-image] Mikro push (setPrimary) hata (${product.mikroCode}):`, e?.message);
      }
    }
    await this.syncMirror(productId);
  }

  /** Gorseli sil. Ana gorselse siradaki gorsel ana olur (ve Mikro'ya yazilir). */
  async deleteImage(productId: string, imageId: string): Promise<void> {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { mikroCode: true, isBundle: true },
    });
    if (!product) throw new Error('Product not found');
    const target = await prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!target) throw new Error('Image not found');

    const wasPrimary = target.isPrimary;
    await prisma.productImage.delete({ where: { id: imageId } });

    // Dosyayi sil (baska satir ayni URL'i kullanmiyorsa).
    const stillUsed = await prisma.productImage.count({ where: { url: target.url } });
    if (stillUsed === 0) await imageService.deleteProductImage(target.url);

    if (wasPrimary) {
      const next = await prisma.productImage.findFirst({
        where: { productId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      if (next) {
        await prisma.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
        if (!product.isBundle) {
          try {
            const abs = imageService.absPathForUrl(next.url);
            const jpeg = await imageService.makeMikroJpegBuffer(abs);
            await this.pushToMikro(product.mikroCode, jpeg);
          } catch (e: any) {
            console.error(`[product-image] Mikro push (delete->promote) hata (${product.mikroCode}):`, e?.message);
          }
        }
      }
    }
    await this.syncMirror(productId);
  }

  /** Legacy DELETE /products/:id/image = ana gorseli sil (varsa siradakini ana yapar). */
  async deletePrimary(productId: string): Promise<void> {
    const primary = await prisma.productImage.findFirst({ where: { productId, isPrimary: true } });
    if (primary) {
      await this.deleteImage(productId, primary.id);
    } else {
      // ProductImage yoksa yalnizca aynayi temizle (eski veri).
      await this.syncMirror(productId);
    }
  }

  /** Galeri sirasini guncelle (primary bayragini degistirmez). */
  async reorder(productId: string, orderedIds: string[]): Promise<void> {
    const rows = await prisma.productImage.findMany({ where: { productId }, select: { id: true } });
    const valid = new Set(rows.map((r) => r.id));
    const ops = orderedIds
      .filter((id) => valid.has(id))
      .map((id, idx) => prisma.productImage.update({ where: { id }, data: { sortOrder: idx } }));
    if (ops.length) await prisma.$transaction(ops);
  }
}

export default new ProductImageService();
