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

async function checkOrders() {
  try {
    await sql.connect(config);

    console.log('=== Checking B2B Order vs Normal Order Fields ===\n');

    const result = await sql.query`
      SELECT
        sip_evrakno_seri + '-' + CAST(sip_evrakno_sira AS VARCHAR) AS EvrakNo,
        sip_tarih AS Tarih,
        sip_tip AS Tip,
        sip_cins AS Cins,
        sip_kapat_fl AS KapatFl,
        sip_miktar AS Miktar,
        sip_teslim_miktar AS TeslimMiktar,
        sip_tutar AS Tutar,
        CASE WHEN sip_kapat_fl = 0 THEN 'AÇIK' ELSE 'KAPALI' END AS Durum,
        CASE WHEN sip_miktar > sip_teslim_miktar THEN 'VAR' ELSE 'YOK' END AS KalanMiktar,
        sip_Guid AS Guid
      FROM SIPARISLER
      WHERE (sip_evrakno_seri = 'B2BF' AND sip_evrakno_sira = 3)
         OR (sip_evrakno_seri = 'HENDEK' AND sip_evrakno_sira = 8596)
      ORDER BY sip_evrakno_seri, sip_evrakno_sira
    `;

    console.log('Orders:');
    result.recordset.forEach(order => {
      console.log(JSON.stringify(order, null, 2));
    });

    // Now check if these orders appear in fn_CariRiskFoyu
    console.log('\n=== Checking fn_CariRiskFoyu for customer 120.01.001 ===\n');

    const riskResult = await sql.query`
      SELECT *
      FROM dbo.fn_CariRiskFoyu(0, '120.01.001', GETDATE(), GETDATE(), GETDATE(), 0, '', 0, 0)
      WHERE msg_S_0077 LIKE '%Sipariş%'
    `;

    console.log('Sipariş Bakiyesi from Risk Föyü:');
    console.log(JSON.stringify(riskResult.recordset, null, 2));

    // Check the WHERE conditions manually
    console.log('\n=== Checking which orders meet fn_CariRiskFoyu conditions ===\n');

    const conditionCheck = await sql.query`
      SELECT
        sip_evrakno_seri + '-' + CAST(sip_evrakno_sira AS VARCHAR) AS EvrakNo,
        sip_kapat_fl AS KapatFl,
        sip_miktar AS Miktar,
        sip_teslim_miktar AS TeslimMiktar,
        CASE
          WHEN sip_kapat_fl = 0 AND sip_miktar > sip_teslim_miktar THEN 'GÖSTERILECEK'
          ELSE 'GÖSTERILMEYECEK (kapat_fl=' + CAST(sip_kapat_fl AS VARCHAR) + ', miktar=' + CAST(sip_miktar AS VARCHAR) + ', teslim=' + CAST(sip_teslim_miktar AS VARCHAR) + ')'
        END AS Sonuc
      FROM SIPARISLER
      WHERE sip_evrakno_seri IN ('B2BF', 'HENDEK')
        AND sip_evrakno_sira IN (3, 8596)
      ORDER BY sip_evrakno_seri, sip_evrakno_sira
    `;

    console.log('Condition Check:');
    console.log(JSON.stringify(conditionCheck.recordset, null, 2));

    // Check detailed fields
    console.log('\n=== Detailed Field Check ===\n');

    const detailedCheck = await sql.query`
      SELECT
        sip_evrakno_seri + '-' + CAST(sip_evrakno_sira AS VARCHAR) AS EvrakNo,
        sip_doviz_cinsi AS DovizCinsi,
        sip_doviz_kuru AS DovizKuru,
        sip_miktar AS Miktar,
        sip_teslim_miktar AS TeslimMiktar,
        sip_tutar AS Tutar,
        sip_iskonto_1 AS Iskonto1,
        sip_iskonto_2 AS Iskonto2,
        sip_iskonto_3 AS Iskonto3,
        sip_iskonto_4 AS Iskonto4,
        sip_iskonto_5 AS Iskonto5,
        sip_iskonto_6 AS Iskonto6,
        sip_masraf_1 AS Masraf1,
        sip_masraf_2 AS Masraf2,
        sip_masraf_3 AS Masraf3,
        sip_masraf_4 AS Masraf4,
        sip_vergi AS Vergi,
        sip_masvergi AS MasVergi,
        sip_Otv_Vergi AS OtvVergi,
        sip_otvtutari AS OtvTutari,
        sip_kapat_fl AS KapatFl
      FROM SIPARISLER
      WHERE (sip_evrakno_seri = 'B2BF' AND sip_evrakno_sira = 3)
         OR (sip_evrakno_seri = 'HENDEK' AND sip_evrakno_sira = 8596)
    `;

    console.log('Detailed Fields:');
    console.log(JSON.stringify(detailedCheck.recordset, null, 2));

    await sql.close();
  } catch (err) {
    console.error('Error:', err);
  }
}

checkOrders();
