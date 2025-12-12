const sql = require('mssql');

const config = {
  server: '185.123.54.61',
  port: 16022,
  database: 'MikroDB_V16_BKRC2020',
  user: 'BkrcWebL1RgcVc4YexP3LRfWZ6W',
  password: 'uq0#_iZ0FTlvHwF=sPKL',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  }
};

async function compareOrders() {
  try {
    await sql.connect(config);

    console.log('=== Comparing B2B Order (B2BF-3) vs Normal Order (HENDEK-8596) ===\n');

    // Compare main order fields
    const orderComparison = await sql.query`
      SELECT
        sip_evrakno_seri AS EvrakSeri,
        sip_evrakno_sira AS EvrakSira,
        sip_tarih AS Tarih,
        sip_tip AS Tip,
        sip_cins AS Cins,
        sip_cari_kod AS CariKod,
        sip_stok_kod AS StokKod
      FROM SIPARISLER
      WHERE (sip_evrakno_seri = 'B2BF' AND sip_evrakno_sira = 3)
         OR (sip_evrakno_seri = 'HENDEK' AND sip_evrakno_sira = 8596)
      ORDER BY sip_evrakno_seri, sip_evrakno_sira
    `;

    console.log('Order Comparison:');
    console.log(JSON.stringify(orderComparison.recordset, null, 2));

    // Now check fn_CariRiskFoyu for the customer
    console.log('\n=== Checking fn_CariRiskFoyu for customer 120.01.001 ===\n');

    const riskFoyu = await sql.query`
      SELECT *
      FROM dbo.fn_CariRiskFoyu(0, '120.01.001', GETDATE(), GETDATE(), GETDATE(), 0, '', '', '')
      WHERE msg_S_0077 = 'Sipariş Bakiyesi'
    `;

    console.log('Risk Föyü - Sipariş Bakiyesi:');
    console.log(JSON.stringify(riskFoyu.recordset, null, 2));

    // Check all orders for this customer
    console.log('\n=== All orders for customer 120.01.001 ===\n');

    const allOrders = await sql.query`
      SELECT
        sip_evrakno_seri + '-' + CAST(sip_evrakno_sira AS VARCHAR) AS EvrakNo,
        sip_tarih AS Tarih,
        sip_tip AS Tip,
        sip_cins AS Cins,
        (SELECT SUM(sth_tutar) FROM SIPARISLER_HAREKETLERI WHERE sth_sip_uid = sip_Guid) AS Tutar,
        (SELECT SUM(sth_tutar_doviz) FROM SIPARISLER_HAREKETLERI WHERE sth_sip_uid = sip_Guid) AS TutarDoviz
      FROM SIPARISLER
      WHERE sip_cari_kod = '120.01.001'
      ORDER BY sip_tarih DESC
    `;

    console.log('All Orders:');
    console.log(JSON.stringify(allOrders.recordset, null, 2));

    await sql.close();
  } catch (err) {
    console.error('Error:', err);
  }
}

compareOrders();
