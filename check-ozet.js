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
  },
};

async function checkOzet() {
  try {
    await sql.connect(config);
    
    // SIPARISLER_OZET'te B101310 var mı?
    const ozet = await sql.query`
      SELECT * FROM SIPARISLER_OZET 
      WHERE sip_stok_kod = 'B101310' 
      AND sip_yil = 2025 
      AND sip_ay = 10
    `;
    
    console.log('\n📊 SIPARISLER_OZET - B101310 (2025-10):');
    console.log(`   Kayıt sayısı: ${ozet.recordset.length}`);
    if (ozet.recordset.length > 0) {
      console.log('   Kayıtlar:', JSON.stringify(ozet.recordset, null, 2));
    }
    
    // SIPARISLER'de B2B siparişi var mı?
    const sip = await sql.query`
      SELECT sip_evrak_seri, sip_evrak_sira, sip_stok_kod 
      FROM SIPARISLER 
      WHERE sip_evrak_seri LIKE 'B2B%'
    `;
    
    console.log('\n📝 SIPARISLER - B2B siparişleri:');
    console.log(`   Kayıt sayısı: ${sip.recordset.length}`);
    if (sip.recordset.length > 0) {
      console.log('   Kayıtlar:', sip.recordset);
    }
    
  } catch (error) {
    console.error('❌ Hata:', error.message);
  } finally {
    await sql.close();
  }
}

checkOzet();
