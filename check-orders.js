const sql = require('mssql');

const config = {
  server: '185.85.207.76',
  port: 2014,
  database: 'MikroDB_V16_BAKIR',
  user: 'sa',
  password: 'B@k1rc1l@r',
  options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
};

(async () => {
  try {
    await sql.connect(config);

    // Son B2B siparişlerini kontrol et
    const result = await sql.query`
      SELECT TOP 10
        sip_evrakno_seri,
        sip_evrakno_sira,
        sip_satirno,
        sip_stok_kod,
        sip_miktar,
        sip_b_fiyat,
        sip_tutar,
        sip_vergi,
        sip_doviz_cinsi,
        sip_tip
      FROM SIPARISLER
      WHERE sip_evrakno_seri LIKE 'B2B%'
      ORDER BY sip_create_date DESC
    `;

    console.log('Son B2B Siparişleri:');
    result.recordset.forEach(row => {
      console.log('---');
      console.log(`Seri-Sıra: ${row.sip_evrakno_seri}-${row.sip_evrakno_sira} Satır:${row.sip_satirno}`);
      console.log(`Ürün: ${row.sip_stok_kod} Miktar:${row.sip_miktar}`);
      console.log(`Fiyat: ${row.sip_b_fiyat} Tutar:${row.sip_tutar} Vergi:${row.sip_vergi}`);
      console.log(`Tip: ${row.sip_tip}`);
    });

  } catch (error) {
    console.error('Hata:', error.message);
  } finally {
    await sql.close();
  }
})();
