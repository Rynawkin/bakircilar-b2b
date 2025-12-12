const sql = require('mssql');

const config = {
  server: '185.123.54.61',
  port: 16022,
  database: 'MikroDB_V16_BKRC2020',
  user: 'BkrcWebL1RgcVc4YexP3LRfWZ6W',
  password: 'uq0#_iZ0FTlvHwF=sPKL',
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 30000,
    requestTimeout: 30000
  }
};

(async () => {
  try {
    console.log('Mikro sunucusuna bağlanılıyor...');
    await sql.connect(config);
    console.log('Bağlantı başarılı!\n');

    // Product B106430 için STOKDETAY verilerini çek
    console.log('=== STOKDETAY - Product B106430 ===\n');

    const detail = await sql.query`
      SELECT * FROM STOKDETAY WHERE msg_S_0001 = 'B106430'
    `;

    if (detail.recordset.length > 0) {
      console.log('Ürün bulundu! Tüm msg_S kolonları:\n');

      const record = detail.recordset[0];

      // Tüm msg_S kolonlarını listele
      Object.keys(record).forEach(key => {
        if (key.startsWith('msg_S_')) {
          const value = record[key];
          if (value !== null && value !== '' && value !== 0) {
            console.log(`${key}: ${value}`);
          }
        }
      });

      console.log('\n=== Marj değerlerini arıyoruz ===');
      console.log('Aranılan değerler: 2, 1.5, 1.3, 1.2, 1.15\n');

      // Marj değerlerini bul
      const marginValues = [2, 1.5, 1.3, 1.2, 1.15];
      const foundMargins = [];

      Object.keys(record).forEach(key => {
        if (key.startsWith('msg_S_')) {
          const value = parseFloat(record[key]);
          if (marginValues.includes(value)) {
            foundMargins.push({ column: key, value });
            console.log(`✅ BULUNDU: ${key} = ${value}`);
          }
        }
      });

      if (foundMargins.length > 0) {
        console.log('\n=== Marj Sütun Eşleşmeleri ===');
        foundMargins.forEach((m, i) => {
          console.log(`marj_${i+1} → ${m.column} = ${m.value}`);
        });
      } else {
        console.log('\n❌ Marj değerleri bulunamadı. Tüm sayısal değerleri kontrol edelim:\n');
        Object.keys(record).forEach(key => {
          if (key.startsWith('msg_S_')) {
            const value = parseFloat(record[key]);
            if (!isNaN(value) && value > 0) {
              console.log(`${key}: ${value}`);
            }
          }
        });
      }
    } else {
      console.log('❌ Product B106430 bulunamadı.');
    }

    await sql.close();
    console.log('\n\nİşlem tamamlandı!');
  } catch (err) {
    console.error('HATA:', err.message);
    console.error('Stack:', err.stack);
    process.exit(1);
  }
})();
