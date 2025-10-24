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

    // Normal siparişlerde vergi nasıl yazılmış?
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
        sip_vergi_pntr,
        sip_doviz_cinsi
      FROM SIPARISLER
      WHERE sip_vergi > 0
      ORDER BY sip_create_date DESC
    `;

    console.log('Vergi içeren siparişler:');
    result.recordset.forEach(row => {
      const birimFiyat = row.sip_b_fiyat;
      const miktar = row.sip_miktar;
      const tutar = row.sip_tutar;
      const vergi = row.sip_vergi;
      const vergiPntr = row.sip_vergi_pntr;

      const hesaplananTutar = birimFiyat * miktar;
      const kdvOrani = tutar > 0 ? (vergi / tutar * 100).toFixed(2) : 0;

      console.log('---');
      console.log(`Seri-Sıra: ${row.sip_evrakno_seri}-${row.sip_evrakno_sira} Satır:${row.sip_satirno}`);
      console.log(`Ürün: ${row.sip_stok_kod}`);
      console.log(`Miktar: ${miktar} × ${birimFiyat} = ${hesaplananTutar.toFixed(2)}`);
      console.log(`sip_tutar: ${tutar}`);
      console.log(`sip_vergi: ${vergi}`);
      console.log(`sip_vergi_pntr: ${vergiPntr}`);
      console.log(`Hesaplanan KDV oranı: %${kdvOrani}`);
    });

  } catch (error) {
    console.error('Hata:', error.message);
  } finally {
    await sql.close();
  }
})();
