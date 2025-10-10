/**
 * Image Service
 *
 * Mikro ERP'den ürün resimlerini indirir, optimize eder ve kaydeder
 */

import mssql from 'mssql';
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
  private readonly PROCESSING_TIMEOUT = 10000; // 10 saniye timeout (Sharp için)

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
   * ImageMagick ile resmi dönüştür (fallback) - güvenli ve optimize
   */
  private async convertWithImageMagick(
    inputPath: string,
    outputPath: string,
    width: number = this.RESIZE_WIDTH,
    height: number = this.RESIZE_HEIGHT
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Güvenli ImageMagick parametreleri:
      // -limit memory 256MB: Bellек limiti (CPU donmasını önler)
      // -limit thread 1: Tek thread (daha stabil)
      // -strip: Metadata kaldır (daha hızlı)
      // -thumbnail: Daha hızlı resize (resize yerine)
      const command = `convert "${inputPath}" ` +
        `-limit memory 256MB -limit thread 1 ` +
        `-strip ` +
        `-thumbnail ${width}x${height}\\> ` +
        `-quality ${this.QUALITY} ` +
        `"${outputPath}"`;

      const childProcess = exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });

      // 30 saniye timeout (60 yerine daha kısa)
      const timeout = setTimeout(() => {
        childProcess.kill('SIGKILL');
        reject(new Error('ImageMagick timeout'));
      }, 30000);

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
      const tempPath = path.join(this.UPLOAD_DIR, `${productCode}.tmp`);

      try {
        // Raw dosyayı kaydet
        await fs.writeFile(tempPath, buffer);

        // 1. İlk deneme: Normal boyut (1200x1200)
        try {
          await this.convertWithImageMagick(tempPath, filepath);

          // Başarılı!
          await fs.unlink(tempPath);
          const stats = await fs.stat(filepath);
          console.log(`✅ Resim kaydedildi (1200px): ${productCode} (${(stats.size / 1024).toFixed(0)} KB)`);

          return {
            success: true,
            localPath: `/uploads/products/${filename}`,
            size: stats.size,
          };
        } catch (firstTryError: any) {
          console.log(`⚠️ 1200px başarısız (${productCode}), 800px deneniyor...`);

          // 2. İkinci deneme: Küçük boyut (800x800)
          try {
            await this.convertWithImageMagick(tempPath, filepath, 800, 800);

            // Başarılı!
            await fs.unlink(tempPath);
            const stats = await fs.stat(filepath);
            console.log(`✅ Resim kaydedildi (800px): ${productCode} (${(stats.size / 1024).toFixed(0)} KB)`);

            return {
              success: true,
              localPath: `/uploads/products/${filename}`,
              size: stats.size,
            };
          } catch (secondTryError: any) {
            console.log(`⚠️ 800px başarısız (${productCode}), 600px deneniyor...`);

            // 3. Son deneme: Çok küçük boyut (600x600)
            try {
              await this.convertWithImageMagick(tempPath, filepath, 600, 600);

              // Başarılı!
              await fs.unlink(tempPath);
              const stats = await fs.stat(filepath);
              console.log(`✅ Resim kaydedildi (600px): ${productCode} (${(stats.size / 1024).toFixed(0)} KB)`);

              return {
                success: true,
                localPath: `/uploads/products/${filename}`,
                size: stats.size,
              };
            } catch (thirdTryError: any) {
              // Tüm denemeler başarısız
              throw thirdTryError;
            }
          }
        }
      } catch (imageMagickError: any) {
        // Temp dosyayı temizle (varsa)
        try {
          await fs.unlink(tempPath);
        } catch {}

        // Tüm yöntemler başarısız
        console.error(`❌ Tüm boyutlar başarısız (${productCode}):`, imageMagickError.message);

        return {
          success: false,
          skipped: true,
          skipReason: `Resim işlenemedi - tüm boyutlar denendi`,
        };
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
