/**
 * Image Service
 *
 * Mikro ERP'den ürün resimlerini indirir, optimize eder ve kaydeder
 */

import mssql from 'mssql';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import crypto from 'crypto';
import { config } from '../config';
import mikroService from './mikroFactory.service';
import { getUploadsDir } from '../utils/storage';

interface ImageDownloadResult {
  success: boolean;
  localPath?: string;
  size?: number;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
  checksum?: string;
  errorType?: string;
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
  private readonly MAX_IMAGE_SIZE = 50 * 1024 * 1024; // 50 MB (timeout ile kontrol ediyoruz)
  private readonly RESIZE_WIDTH = 2048;
  private readonly RESIZE_HEIGHT = 2048;
  private readonly QUALITY = 100; // Maksimum kalite
  private readonly UPLOAD_DIR = getUploadsDir('products');
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

  async getChecksumForFile(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }


  async processUploadedProductImage(
    inputPath: string,
    productCode: string
  ): Promise<{ imageUrl: string; filePath: string; checksum: string; buffer: Buffer }> {
    await this.ensureUploadDir();

    const filename = `${productCode}.jpg`;
    const outputPath = path.join(this.UPLOAD_DIR, filename);
    const sizes = [
      { width: this.RESIZE_WIDTH, height: this.RESIZE_HEIGHT },
      { width: 800, height: 800 },
      { width: 600, height: 600 },
    ];

    let converted = false;
    let lastError: Error | null = null;

    for (const size of sizes) {
      try {
        await this.convertWithImageMagick(inputPath, outputPath, size.width, size.height);
        converted = true;
        lastError = null;
        break;
      } catch (error) {
        lastError = error as Error;
      }
    }

    try {
      await fs.unlink(inputPath);
    } catch {}

    if (!converted) {
      throw lastError || new Error('Image processing failed');
    }

    const checksum = await this.getChecksumForFile(outputPath);
    const buffer = await fs.readFile(outputPath);

    return {
      imageUrl: `/uploads/products/${filename}`,
      filePath: outputPath,
      checksum,
      buffer,
    };
  }

  async uploadImageToMikro(productGuid: string, imageBuffer: Buffer): Promise<void> {
    if (config.useMockMikro) {
      return;
    }

    const realMikroService = mikroService as any;
    if (!realMikroService.pool || !realMikroService.connect) {
      throw new Error('Mikro service not available');
    }

    await realMikroService.connect();

    const tableId = 13;
    const checkRequest = realMikroService.pool!.request();
    checkRequest.input('guid', mssql.UniqueIdentifier, productGuid);
    checkRequest.input('tableId', mssql.Int, tableId);

    const existing = await checkRequest.query(`
      SELECT COUNT(*) as count
      FROM mye_ImageData
      WHERE Record_uid = @guid
        AND TableID = @tableId
    `);

    const hasImage = Number(existing.recordset?.[0]?.count || 0) > 0;

    if (hasImage) {
      const updateRequest = realMikroService.pool!.request();
      updateRequest.input('guid', mssql.UniqueIdentifier, productGuid);
      updateRequest.input('tableId', mssql.Int, tableId);
      updateRequest.input('data', mssql.VarBinary(mssql.MAX), imageBuffer);

      await updateRequest.query(`
        UPDATE mye_ImageData
        SET Data = @data
        WHERE Record_uid = @guid
          AND TableID = @tableId
      `);
      return;
    }

    const insertRequest = realMikroService.pool!.request();
    insertRequest.input('guid', mssql.UniqueIdentifier, productGuid);
    insertRequest.input('tableId', mssql.Int, tableId);
    insertRequest.input('imageId', mssql.Int, 0);
    insertRequest.input('data', mssql.VarBinary(mssql.MAX), imageBuffer);

    await insertRequest.query(`
      INSERT INTO mye_ImageData (TableID, Record_uid, ImageID, Data)
      VALUES (@tableId, @guid, @imageId, @data)
    `);
  }

  async removeLocalFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch {}
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
      // -strip: Metadata kaldır (daha küçük dosya)
      // -resize: Yüksek kaliteli boyutlandırma (1600x1600, quality 95)
      const command = `convert "${inputPath}" ` +
        `-limit memory 256MB -limit thread 1 ` +
        `-strip ` +
        `-resize ${width}x${height} ` +
        `-background white -alpha remove -alpha off ` +
        `-gravity center -extent ${width}x${height} ` +
        `-quality ${this.QUALITY} ` +
        `"${outputPath}"`;

      let isTimedOut = false;

      const childProcess = exec(command, (error, stdout, stderr) => {
        if (isTimedOut) {
          return; // Timeout olmuş, ignore et
        }

        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });

      // 15 saniye timeout (daha kısa - hızlı fail için)
      const timeout = setTimeout(() => {
        isTimedOut = true;
        childProcess.kill('SIGKILL');
        // Birkaç ms bekle, sonra reject et
        setTimeout(() => {
          reject(new Error('ImageMagick timeout - 15 saniye aşıldı'));
        }, 100);
      }, 15000);

      // Success/error callback'inde timeout'u temizle
      childProcess.on('exit', (code) => {
        if (!isTimedOut) {
          clearTimeout(timeout);
        }
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
    const startTime = Date.now();
    try {
      // Mock mode'da çalışma
      if (config.useMockMikro) {
        return {
          success: false,
          skipped: true,
          skipReason: 'Mock mode - resim indirme devre dışı',
          errorType: 'NO_SERVICE',
        };
      }

      // Real MikroService kullandığımızdan emin ol
      const realMikroService = mikroService as any;
      if (!realMikroService.pool || !realMikroService.connect) {
        return {
          success: false,
          skipped: true,
          skipReason: 'Gerçek Mikro service kullanılmıyor',
          errorType: 'NO_SERVICE',
        };
      }

      // Mikro'ya bağlan
      const connectStart = Date.now();
      await realMikroService.connect();
      const connectTime = Date.now() - connectStart;

      // Resmi sorgula
      const queryStart = Date.now();
      const query = `
        SELECT Data, DATALENGTH(Data) as DataSize
        FROM mye_ImageData
        WHERE Record_uid = @guid
          AND TableID = 13
      `;

      const request = (mikroService as any).pool!.request();
      request.input('guid', mssql.UniqueIdentifier, productGuid);

      const result = await request.query(query);
      const queryTime = Date.now() - queryStart;

      if (result.recordset.length === 0) {
        const totalTime = Date.now() - startTime;
        console.log(`⏱️ [${productCode}] Toplam: ${totalTime}ms (bağlan: ${connectTime}ms, sorgu: ${queryTime}ms) - Resim yok`);
        return {
          success: false,
          skipped: true,
          skipReason: 'Mikro\'da resim yok',
          errorType: 'NO_IMAGE',
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
          errorType: 'IMAGE_TOO_LARGE',
        };
      }

      // Binary data'yı al
      const buffer = imageData.Data as Buffer;

      const filename = `${productCode}.jpg`;
      const filepath = path.join(this.UPLOAD_DIR, filename);
      const tempPath = path.join(this.UPLOAD_DIR, `${productCode}.tmp`);

      try {
        // Raw dosyayı kaydet
        const writeStart = Date.now();
        await fs.writeFile(tempPath, buffer);
        const writeTime = Date.now() - writeStart;

        // 1. İlk deneme: Yüksek kalite (1600x1600, quality 95)
        try {
          const convertStart = Date.now();
          await this.convertWithImageMagick(tempPath, filepath);
          const convertTime = Date.now() - convertStart;

          // Başarılı!
          await fs.unlink(tempPath);
          const stats = await fs.stat(filepath);
          const checksum = await this.getChecksumForFile(filepath);
          const totalTime = Date.now() - startTime;
          console.log(`✅ Resim kaydedildi (2048px): ${productCode} (${(stats.size / 1024).toFixed(0)} KB) - Toplam: ${totalTime}ms (sorgu: ${queryTime}ms, yazma: ${writeTime}ms, convert: ${convertTime}ms)`);

          return {
            success: true,
            localPath: `/uploads/products/${filename}`,
            size: stats.size,
            checksum,
          };
        } catch (firstTryError: any) {
          console.log(`⚠️ 2048px başarısız (${productCode}), 800px deneniyor...`);

          // 2. İkinci deneme: Küçük boyut (800x800)
          try {
            await this.convertWithImageMagick(tempPath, filepath, 800, 800);

            // Başarılı!
            await fs.unlink(tempPath);
            const stats = await fs.stat(filepath);
            const checksum = await this.getChecksumForFile(filepath);
            console.log(`✅ Resim kaydedildi (800px): ${productCode} (${(stats.size / 1024).toFixed(0)} KB)`);

            return {
              success: true,
              localPath: `/uploads/products/${filename}`,
              size: stats.size,
              checksum,
            };
          } catch (secondTryError: any) {
            console.log(`⚠️ 800px başarısız (${productCode}), 600px deneniyor...`);

            // 3. Son deneme: Çok küçük boyut (600x600)
            try {
              await this.convertWithImageMagick(tempPath, filepath, 600, 600);

              // Başarılı!
              await fs.unlink(tempPath);
              const stats = await fs.stat(filepath);
              const checksum = await this.getChecksumForFile(filepath);
              console.log(`✅ Resim kaydedildi (600px): ${productCode} (${(stats.size / 1024).toFixed(0)} KB)`);

              return {
                success: true,
                localPath: `/uploads/products/${filename}`,
                size: stats.size,
                checksum,
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
          error: 'Resim islenemedi - tum boyutlar denendi',
          errorType: 'IMAGE_PROCESS_ERROR',
        };
      }
    } catch (error: any) {
      console.error(`❌ Resim indirme hatası (${productCode}):`, error.message);
      return {
        success: false,
        error: error.message,
        errorType: 'IMAGE_DOWNLOAD_ERROR',
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
    const { prisma } = await import('../utils/prisma');

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
      const updateData: {
        imageUrl?: string | null;
        imageChecksum?: string | null;
        imageSyncStatus: string;
        imageSyncErrorType?: string | null;
        imageSyncErrorMessage?: string | null;
        imageSyncUpdatedAt: Date;
      } = {
        imageSyncStatus: '',
        imageSyncUpdatedAt: new Date(),
      };

      if (result.success && result.localPath) {
        stats.downloaded++;
        updateData.imageUrl = result.localPath;
        updateData.imageChecksum = result.checksum || null;
        updateData.imageSyncStatus = 'SUCCESS';
        updateData.imageSyncErrorType = null;
        updateData.imageSyncErrorMessage = null;
      } else if (result.skipped) {
        stats.skipped++;
        updateData.imageUrl = null;
        updateData.imageChecksum = null;
        updateData.imageSyncStatus = 'SKIPPED';
        updateData.imageSyncErrorType = result.errorType || 'NO_IMAGE';
        updateData.imageSyncErrorMessage = result.skipReason || result.error || null;

        // İlk 10 skip'i logla (debug için)
        if (stats.skipped <= 10) {
          console.log(`⏭️ Resim atlandı (${product.mikroCode}): ${result.skipReason}`);
        }

        // Uyarı ekle (sadece boyut nedeniyle atlananlar için)
        if (result.errorType === 'IMAGE_TOO_LARGE' || (result.size && result.size > this.MAX_IMAGE_SIZE)) {
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
        updateData.imageUrl = null;
        updateData.imageChecksum = null;
        updateData.imageSyncStatus = 'FAILED';
        updateData.imageSyncErrorType = result.errorType || 'IMAGE_DOWNLOAD_ERROR';
        updateData.imageSyncErrorMessage = result.error || result.skipReason || null;

        // Gerçek hata varsa uyarı ekle
        if (result.error) {
          stats.warnings.push({
            type: result.errorType || 'IMAGE_DOWNLOAD_ERROR',
            productCode: product.mikroCode,
            productName: product.name,
            message: result.error,
          });
        }
      }

      try {
        await prisma.product.update({
          where: { id: product.id },
          data: updateData,
        });
      } catch (error: any) {
        console.error(`Image sync guncelleme hatasi (${product.mikroCode}):`, error.message);
      }

      // Her 10 üründe bir progress göster ve SyncLog'u güncelle
      const processed = stats.downloaded + stats.skipped + stats.failed;
      if (processed % 10 === 0) {
        console.log(`  📊 İlerleme: ${stats.downloaded} indirildi, ${stats.skipped} atlandı, ${stats.failed} hata`);

        // SyncLog'u güncelle
        if (syncLogId) {
          try {
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
