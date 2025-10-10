/**
 * Mikro STOKLAR tablosunda resim ile ilgili kolonları araştır
 */

const mssql = require('mssql');

const config = {
  server: '185.123.54.61',
  database: 'MikroDB_V16_BKRC2020',
  user: 'BkrcWebL1RgcVc4YexP3LRfWZ6W',
  password: 'uq0#_iZ0FTlvHwF=sPKL',
  port: 16022,
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

(async () => {
  try {
    console.log('🔌 Mikro ERP\'ye bağlanılıyor...');
    const pool = await mssql.connect(config);

    // 1. STOKLAR tablosunun TÜM kolonlarını listele
    console.log('\n=== STOKLAR Tablosu Tüm Kolonları ===');
    const columnsQuery = `
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'STOKLAR'
      ORDER BY ORDINAL_POSITION
    `;
    const columns = await pool.request().query(columnsQuery);

    // Resim ile ilgili olabilecek kolonları filtrele
    console.log('\n=== Resim/Dosya ile İlgili Olabilecek Kolonlar ===');
    const imageRelatedColumns = columns.recordset.filter(col => {
      const name = col.COLUMN_NAME.toLowerCase();
      return name.includes('resim') ||
             name.includes('image') ||
             name.includes('foto') ||
             name.includes('photo') ||
             name.includes('dosya') ||
             name.includes('file') ||
             name.includes('url') ||
             name.includes('path') ||
             name.includes('yol');
    });

    if (imageRelatedColumns.length > 0) {
      imageRelatedColumns.forEach(col => {
        const maxLen = col.CHARACTER_MAXIMUM_LENGTH ? `(${col.CHARACTER_MAXIMUM_LENGTH})` : '';
        console.log(`  ${col.COLUMN_NAME} - ${col.DATA_TYPE}${maxLen}`);
      });
    } else {
      console.log('  ❌ Direkt resim ile ilgili kolon bulunamadı');
    }

    // 2. REDKIT_KATALOG_RESIMLERI tablosunu kontrol et
    console.log('\n=== REDKIT_KATALOG_RESIMLERI Tablosu ===');
    const imageTableExists = await pool.request().query(`
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = 'REDKIT_KATALOG_RESIMLERI'
    `);

    if (imageTableExists.recordset[0].count > 0) {
      console.log('  ✅ Tablo mevcut');

      // Kolonları göster
      const imageTableColumns = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'REDKIT_KATALOG_RESIMLERI'
        ORDER BY ORDINAL_POSITION
      `);
      console.log('\n  Kolonlar:');
      imageTableColumns.recordset.forEach(col => {
        const maxLen = col.CHARACTER_MAXIMUM_LENGTH ? `(${col.CHARACTER_MAXIMUM_LENGTH})` : '';
        console.log(`    ${col.COLUMN_NAME} - ${col.DATA_TYPE}${maxLen}`);
      });

      // Kaç satır var?
      const imageCount = await pool.request().query(`
        SELECT COUNT(*) as count FROM REDKIT_KATALOG_RESIMLERI
      `);
      console.log(`\n  Toplam ${imageCount.recordset[0].count} satır mevcut`);

      // Örnek 5 satır göster
      if (imageCount.recordset[0].count > 0) {
        console.log('\n  Örnek Kayıtlar:');
        const samples = await pool.request().query(`
          SELECT TOP 5 * FROM REDKIT_KATALOG_RESIMLERI
        `);
        samples.recordset.forEach((row, idx) => {
          console.log(`\n  Kayıt ${idx + 1}:`);
          Object.keys(row).forEach(key => {
            console.log(`    ${key}: ${row[key]}`);
          });
        });
      }
    } else {
      console.log('  ❌ Tablo mevcut değil');
    }

    // 3. İlk 3 ürünü getir ve tüm alanlarını göster
    console.log('\n=== Örnek 3 Ürün (Tüm Alanlar) ===');
    const sampleProducts = await pool.request().query(`
      SELECT TOP 3 * FROM STOKLAR WHERE sto_kod IS NOT NULL
    `);

    sampleProducts.recordset.forEach((product, idx) => {
      console.log(`\n[${idx + 1}] ${product.sto_kod} - ${product.sto_isim}`);

      // Her kolonu yazdır
      Object.keys(product).forEach(key => {
        const value = product[key];
        if (value !== null && value !== '' && value !== 0) {
          // Resim ile ilgili olabilecek alanları vurgula
          const isImageRelated = key.toLowerCase().includes('resim') ||
                                 key.toLowerCase().includes('image') ||
                                 key.toLowerCase().includes('foto') ||
                                 key.toLowerCase().includes('url') ||
                                 key.toLowerCase().includes('path');

          if (isImageRelated) {
            console.log(`  ⭐ ${key}: ${value}`);
          }
        }
      });
    });

    await pool.close();
    console.log('\n✅ Bağlantı kapatıldı');

  } catch (err) {
    console.error('❌ Hata:', err.message);
    process.exit(1);
  }
})();
