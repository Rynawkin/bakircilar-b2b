/**
 * Image Service
 *
 * Mikro ERP'den ürün resimlerini indirir, optimize eder ve kaydeder
 */

import mssql from 'mssql';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';
import mikroService from './mikroFactory.service';

interface ImageDownloadResult {
  success: boolean;
  localPath?: string;
  size?: number;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

interface ImageSyncStats {
  downloaded: number;
  skipped: number;
  failed: number;
  warnings: Array<{
    type: string;
    productCode: string;
    productName: string;
    message: string;
    size?: number;
  }>;
}

class ImageService {
  private readonly MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
  private readonly RESIZE_WIDTH = 1200;
  private readonly RESIZE_HEIGHT = 1200;
  private readonly QUALITY = 85;
  private readonly UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'products');

  /**
   * Upload klasörünü oluştur
   */
  async ensureUploadDir(): Promise<void> {
    try {
      await fs.access(this.UPLOAD_DIR);
    } catch {
      await fs.mkdir(this.UPLOAD_DIR, { recursive: true });
      console.log(`📁 Upload klasörü oluşturuldu: ${this.UPLOAD_DIR}`);
    }
  }

  /**
   * Mikro'dan bir ürünün resmini indir
   */
  async downloadImageFromMikro(
    productCode: string,
    productGuid: string
  ): Promise<ImageDownloadResult> {
    try {
      // Mikro'ya bağlan
      await mikroService.connect();

      // Resmi sorgula
      const query = `
        SELECT Data, DATALENGTH(Data) as DataSize
        FROM mye_ImageData
        WHERE Record_uid = @guid
          AND TableID = 13
      `;

      const request = mikroService.pool!.request();
      request.input('guid', mssql.UniqueIdentifier, productGuid);

      const result = await request.query(query);

      if (result.recordset.length === 0) {
        return {
          success: false,
          skipped: true,
          skipReason: 'Mikro\'da resim yok',
        };
      }

      const imageData = result.recordset[0];
      const dataSize = imageData.DataSize;

      // Boyut kontrolü
      if (dataSize > this.MAX_IMAGE_SIZE) {
        const sizeMB = (dataSize / 1024 / 1024).toFixed(2);
        return {
          success: false,
          skipped: true,
          skipReason: `Resim çok büyük (${sizeMB} MB > ${this.MAX_IMAGE_SIZE / 1024 / 1024} MB limit)`,
          size: dataSize,
        };
      }

      // Binary data'yı al
      const buffer = imageData.Data as Buffer;

      // Sharp ile optimize et ve kaydet
      const filename = `${productCode}.jpg`;
      const filepath = path.join(this.UPLOAD_DIR, filename);

      await sharp(buffer)
        .resize(this.RESIZE_WIDTH, this.RESIZE_HEIGHT, {
          fit: 'inside',
          withoutEnlargement: true, // Küçük resimleri büyütme
        })
        .jpeg({
          quality: this.QUALITY,
          progressive: true,
        })
        .toFile(filepath);

      // Dosya boyutunu kontrol et
      const stats = await fs.stat(filepath);

      console.log(`✅ Resim kaydedildi: ${productCode} (${(stats.size / 1024).toFixed(0)} KB)`);

      return {
        success: true,
        localPath: `/uploads/products/${filename}`,
        size: stats.size,
      };
    } catch (error: any) {
      console.error(`❌ Resim indirme hatası (${productCode}):`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Tüm ürünlerin resimlerini sync et (sadece resmi olmayanlara)
   */
  async syncAllImages(
    products: Array<{ id: string; mikroCode: string; name: string; guid: string; imageUrl: string | null }>
  ): Promise<ImageSyncStats> {
    await this.ensureUploadDir();

    const stats: ImageSyncStats = {
      downloaded: 0,
      skipped: 0,
      failed: 0,
      warnings: [],
    };

    // Sadece resmi olmayan ürünleri al
    const productsWithoutImage = products.filter(p => !p.imageUrl);

    console.log(`\n📸 Resim senkronizasyonu başlıyor: ${productsWithoutImage.length} ürün`);

    for (const product of productsWithoutImage) {
      const result = await this.downloadImageFromMikro(product.mikroCode, product.guid);

      if (result.success && result.localPath) {
        stats.downloaded++;

        // PostgreSQL'de imageUrl güncelle
        try {
          const { prisma } = await import('../utils/prisma');
          await prisma.product.update({
            where: { id: product.id },
            data: { imageUrl: result.localPath },
          });
        } catch (error: any) {
          console.error(`❌ ImageUrl güncelleme hatası (${product.mikroCode}):`, error.message);
        }
      } else if (result.skipped) {
        stats.skipped++;

        // Uyarı ekle (sadece boyut nedeniyle atlananlar için)
        if (result.size && result.size > this.MAX_IMAGE_SIZE) {
          stats.warnings.push({
            type: 'IMAGE_TOO_LARGE',
            productCode: product.mikroCode,
            productName: product.name,
            message: result.skipReason || 'Resim çok büyük',
            size: result.size,
          });
        }
      } else {
        stats.failed++;

        // Gerçek hata varsa uyarı ekle
        if (result.error) {
          stats.warnings.push({
            type: 'IMAGE_DOWNLOAD_ERROR',
            productCode: product.mikroCode,
            productName: product.name,
            message: result.error,
          });
        }
      }

      // Her 50 üründe bir progress göster
      if ((stats.downloaded + stats.skipped + stats.failed) % 50 === 0) {
        console.log(`  📊 İlerleme: ${stats.downloaded} indirildi, ${stats.skipped} atlandı, ${stats.failed} hata`);
      }
    }

    console.log(`\n📸 Resim senkronizasyonu tamamlandı:`);
    console.log(`  ✅ İndirilen: ${stats.downloaded}`);
    console.log(`  ⏭️ Atlanan: ${stats.skipped}`);
    console.log(`  ❌ Hatalı: ${stats.failed}`);
    console.log(`  ⚠️ Uyarı sayısı: ${stats.warnings.length}`);

    return stats;
  }

  /**
   * Bir ürünün resmini sil
   */
  async deleteProductImage(imageUrl: string): Promise<void> {
    try {
      const filename = path.basename(imageUrl);
      const filepath = path.join(this.UPLOAD_DIR, filename);
      await fs.unlink(filepath);
      console.log(`🗑️ Resim silindi: ${filename}`);
    } catch (error: any) {
      console.error(`❌ Resim silme hatası:`, error.message);
    }
  }
}

export default new ImageService();
