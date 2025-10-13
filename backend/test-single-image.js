/**
 * Test Script - Tek bir ürünün görselini indir
 * Kullanım: node test-single-image.js B102254
 */

const { PrismaClient } = require('@prisma/client');
const imageService = require('./dist/services/image.service').default;

const prisma = new PrismaClient();

async function testSingleImage(mikroCode) {
  try {
    console.log(`\n🔍 Ürün aranıyor: ${mikroCode}`);

    // Ürünü bul
    const product = await prisma.product.findFirst({
      where: { mikroCode: mikroCode }
    });

    if (!product) {
      console.error(`❌ Ürün bulunamadı: ${mikroCode}`);
      process.exit(1);
    }

    console.log(`✅ Ürün bulundu: ${product.name}`);
    console.log(`   ID: ${product.id}`);
    console.log(`   Mikro GUID: ${product.mikroGuid}`);

    // Upload klasörünü oluştur
    await imageService.ensureUploadDir();

    // Görseli indir
    console.log(`\n📸 Görsel indiriliyor...`);
    const result = await imageService.downloadImageFromMikro(
      product.mikroCode,
      product.mikroGuid
    );

    if (result.success && result.localPath) {
      console.log(`\n✅ BAŞARILI!`);
      console.log(`   Dosya yolu: ${result.localPath}`);
      console.log(`   Dosya boyutu: ${(result.size / 1024).toFixed(0)} KB`);

      // Database'e kaydet
      await prisma.product.update({
        where: { id: product.id },
        data: { imageUrl: result.localPath }
      });
      console.log(`   Database güncellendi`);
    } else if (result.skipped) {
      console.log(`\n⏭️ Atlandı: ${result.skipReason}`);
    } else {
      console.log(`\n❌ Hata: ${result.error}`);
    }

  } catch (error) {
    console.error(`\n❌ Beklenmeyen hata:`, error);
  } finally {
    await prisma.$disconnect();
  }
}

// Komut satırı argümanı
const mikroCode = process.argv[2] || 'B102254';
testSingleImage(mikroCode);
