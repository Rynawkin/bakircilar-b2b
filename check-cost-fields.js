const mssql = require('mssql');

(async () => {
  try {
    const pool = await mssql.connect({
      server: '185.123.54.61',
      port: 16022,
      database: 'MikroDB_V16_BKRC2020',
      user: 'postgres',
      password: 'Pb270701',
      options: {
        encrypt: false,
        trustServerCertificate: true,
      },
    });

    console.log('✅ Bağlantı başarılı\n');

    // B101823 ürünü için tüm alanları çek
    const query = `
      SELECT TOP 1 *
      FROM STOKLAR
      WHERE sto_kod = 'B101823'
    `;

    const result = await pool.request().query(query);

    if (result.recordset.length > 0) {
      const product = result.recordset[0];

      console.log('=== Maliyet ve Fiyat Alanları ===\n');

      // Sadece maliyet ve fiyat ile ilgili alanları göster
      for (const key in product) {
        const lowerKey = key.toLowerCase();
        if (lowerKey.includes('maliyet') ||
            lowerKey.includes('fiyat') ||
            lowerKey.includes('giris') ||
            lowerKey.includes('son_') ||
            lowerKey.includes('ortalama')) {
          console.log(`${key}: ${product[key]}`);
        }
      }
    }

    await pool.close();
  } catch (err) {
    console.error('❌ Hata:', err.message);
  }
})();
