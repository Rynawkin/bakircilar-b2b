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

    // SIPARISLER tablosundaki vergi ile ilgili kolonları listele
    const columns = await sql.query`
      SELECT
        COLUMN_NAME,
        DATA_TYPE,
        CHARACTER_MAXIMUM_LENGTH,
        IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'SIPARISLER'
      AND (
        COLUMN_NAME LIKE '%vergi%' OR
        COLUMN_NAME LIKE '%kdv%' OR
        COLUMN_NAME LIKE '%vat%'
      )
      ORDER BY ORDINAL_POSITION
    `;

    console.log('SIPARISLER tablosunda vergi ile ilgili kolonlar:');
    console.log(JSON.stringify(columns.recordset, null, 2));

    // Son B2B siparişindeki vergi alanlarına bakalım
    const orders = await sql.query`
      SELECT TOP 3
        sip_evrakno_seri,
        sip_evrakno_sira,
        sip_stok_kod,
        sip_miktar,
        sip_b_fiyat,
        sip_tutar,
        sip_vergi,
        sip_vergi_pntr
      FROM SIPARISLER
      WHERE sip_evrakno_seri LIKE 'B2B%'
      ORDER BY sip_create_date DESC
    `;

    console.log('\n\nSon B2B siparişlerindeki vergi alanları:');
    orders.recordset.forEach(row => {
      console.log('---');
      console.log(`${row.sip_evrakno_seri}-${row.sip_evrakno_sira}: ${row.sip_stok_kod}`);
      console.log(`Tutar: ${row.sip_tutar}, Vergi: ${row.sip_vergi}, Vergi_pntr: ${row.sip_vergi_pntr}`);
    });

  } catch (error) {
    console.error('Hata:', error.message);
  } finally {
    await sql.close();
  }
})();
