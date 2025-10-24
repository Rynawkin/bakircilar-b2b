const sql = require('mssql');

const config = {
  server: '185.85.207.76',
  port: 2014,
  database: 'MikroDB_V16_BAKIR',
  user: 'sa',
  password: 'B@k1rc1l@r',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
    requestTimeout: 30000,
  },
};

async function cleanTestOrders() {
  try {
    console.log('🔌 Mikro veritabanına bağlanılıyor...');
    await sql.connect(config);
    console.log('✅ Bağlantı başarılı');

    // B2B test siparişlerini sil
    console.log('\n🗑️ B2B test siparişlerini siliyorum...');
    
    const result1 = await sql.query`
      DELETE FROM SIPARISLER_OZET 
      WHERE sip_stok_kod = 'B101310' 
      AND sip_yil = 2025 
      AND sip_ay = 10
    `;
    console.log(`  ✅ SIPARISLER_OZET: ${result1.rowsAffected[0]} kayıt silindi`);

    const result2 = await sql.query`
      DELETE FROM SIPARISLER 
      WHERE sip_evrak_seri LIKE 'B2B%'
    `;
    console.log(`  ✅ SIPARISLER: ${result2.rowsAffected[0]} kayıt silindi`);

    console.log('\n✅ Temizleme tamamlandı!');
  } catch (error) {
    console.error('❌ Hata:', error);
  } finally {
    await sql.close();
  }
}

cleanTestOrders();
