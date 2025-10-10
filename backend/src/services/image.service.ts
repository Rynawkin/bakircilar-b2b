/**
 * Image Service
 *
 * Mikro ERP'den ürün resimlerini indirir, optimize eder ve kaydeder
 */

import mssql from 'mssql';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
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
  private readonly PROCESSING_TIMEOUT = 60000; // 60 saniye timeout (BMP/TIFF için)

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
   * ImageMagick ile resmi dönüştür (fallback) - gerçek timeout ile
   */
  private async convertWithImageMagick(
    inputPath: string,
    outputPath: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = `convert "${inputPath}" -resize ${this.RESIZE_WIDTH}x${this.RESIZE_HEIGHT}\\> -quality ${this.QUALITY} "${outputPath}"`;

      const childProcess = exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });

      // Timeout: Child process'i kill et
      const timeout = setTimeout(() => {
        childProcess.kill('SIGKILL'); // Force kill
        reject(new Error('ImageMagick timeout - process killed'));
      }, this.PROCESSING_TIMEOUT);

      // Cleanup
      childProcess.on('exit', () => {
        clearTimeout(timeout);
      });
    });
  }

  /**
   * Mikro'dan bir ürünün resmini indir
   */
  async downloadImageFromMikro(
    productCode: string,
    productGuid: string
  ): Promise<ImageDownloadResult> {
    try {
      // Mock mode'da çalışma
      if (config.useMockMikro) {
        return {
          success: false,
          skipped: true,
          skipReason: 'Mock mode - resim indirme devre dışı',
        };
      }

      // Real MikroService kullandığımızdan emin ol
      const realMikroService = mikroService as any;
      if (!realMikroService.pool || !realMikroService.connect) {
        return {
          success: false,
          skipped: true,
          skipReason: 'Gerçek Mikro service kullanılmıyor',
        };
      }

      // Mikro'ya bağlan
      await realMikroService.connect();

      // Resmi sorgula
      const query = `
        SELECT Data, DATALENGTH(Data) as DataSize
        FROM mye_ImageData
        WHERE Record_uid = @guid
          AND TableID = 13
      `;

      const request = (mikroService as any).pool!.request();
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

      const filename = `${productCode}.jpg`;
      const filepath = path.join(this.UPLOAD_DIR, filename);

      // 1. Önce Sharp ile dene
      try {
        // Timeout ile Sharp işlemi
        const sharpPromise = sharp(buffer)
          .resize(this.RESIZE_WIDTH, this.RESIZE_HEIGHT, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({
            quality: this.QUALITY,
            progressive: true,
          })
          .toFile(filepath);

        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Image processing timeout')), this.PROCESSING_TIMEOUT);
        });

        await Promise.race([sharpPromise, timeoutPromise]);

        // Başarılı!
        const stats = await fs.stat(filepath);
        console.log(`✅ Resim kaydedildi (Sharp): ${productCode} (${(stats.size / 1024).toFixed(0)} KB)`);

        return {
          success: true,
          localPath: `/uploads/products/${filename}`,
          size: stats.size,
        };
      } catch (sharpError: any) {
        console.log(`⚠️ Sharp başarısız (${productCode}): ${sharpError.message} - ImageMagick deneniyor...`);

        // 2. Sharp başarısız, ImageMagick dene
        try {
          // Önce raw dosyayı kaydet
          const tempPath = path.join(this.UPLOAD_DIR, `${productCode}.tmp`);
          await fs.writeFile(tempPath, buffer);

          // ImageMagick ile dönüştür
          await this.convertWithImageMagick(tempPath, filepath);

          // Temp dosyayı sil
          await fs.unlink(tempPath);

          // Başarılı!
          const stats = await fs.stat(filepath);
          console.log(`✅ Resim kaydedildi (ImageMagick): ${productCode} (${(stats.size / 1024).toFixed(0)} KB)`);

          return {
            success: true,
            localPath: `/uploads/products/${filename}`,
            size: stats.size,
          };
        } catch (imageMagickError: any) {
          // Temp dosyayı temizle (varsa)
          try {
            const tempPath = path.join(this.UPLOAD_DIR, `${productCode}.tmp`);
            await fs.unlink(tempPath);
          } catch {}

          // Her iki yöntem de başarısız
          console.error(`❌ Tüm yöntemler başarısız (${productCode}):`, imageMagickError.message);

          return {
            success: false,
            skipped: true,
            skipReason: `Format dönüştürme başarısız: ${imageMagickError.message}`,
          };
        }
      }
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
    products: Array<{ id: string; mikroCode: string; name: string; guid: string; imageUrl: string | null }>,
    syncLogId?: string
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
    const totalImages = productsWithoutImage.length;

    console.log(`\n📸 Resim senkronizasyonu başlıyor: ${totalImages} ürün`);

    // SyncLog'a toplam resim sayısını kaydet
    if (syncLogId) {
      const { prisma } = await import('../utils/prisma');
      await prisma.syncLog.update({
        where: { id: syncLogId },
        data: {
          details: {
            totalImages,
          },
        },
      });
    }

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

      // Her 10 üründe bir progress göster ve SyncLog'u güncelle
      const processed = stats.downloaded + stats.skipped + stats.failed;
      if (processed % 10 === 0) {
        console.log(`  📊 İlerleme: ${stats.downloaded} indirildi, ${stats.skipped} atlandı, ${stats.failed} hata`);

        // SyncLog'u güncelle
        if (syncLogId) {
          try {
            const { prisma } = await import('../utils/prisma');
            await prisma.syncLog.update({
              where: { id: syncLogId },
              data: {
                imagesDownloaded: stats.downloaded,
                imagesSkipped: stats.skipped,
                imagesFailed: stats.failed,
              },
            });
          } catch (error) {
            // Güncelleme hatasını logla ama devam et
            console.error('SyncLog güncelleme hatası:', error);
          }
        }
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
