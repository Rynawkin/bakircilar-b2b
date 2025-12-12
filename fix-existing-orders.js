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

async function fixExistingOrders() {
  try {
    await sql.connect(config);

    console.log('=== Fixing B2B Orders with NULL iskonto/masraf fields ===\n');

    // Update all B2B orders to have 0 instead of NULL
    const result = await sql.query`
      UPDATE SIPARISLER
      SET
        sip_iskonto_1 = ISNULL(sip_iskonto_1, 0),
        sip_iskonto_2 = ISNULL(sip_iskonto_2, 0),
        sip_iskonto_3 = ISNULL(sip_iskonto_3, 0),
        sip_iskonto_4 = ISNULL(sip_iskonto_4, 0),
        sip_iskonto_5 = ISNULL(sip_iskonto_5, 0),
        sip_iskonto_6 = ISNULL(sip_iskonto_6, 0),
        sip_masraf_1 = ISNULL(sip_masraf_1, 0),
        sip_masraf_2 = ISNULL(sip_masraf_2, 0),
        sip_masraf_3 = ISNULL(sip_masraf_3, 0),
        sip_masraf_4 = ISNULL(sip_masraf_4, 0),
        sip_masvergi = ISNULL(sip_masvergi, 0),
        sip_Otv_Vergi = ISNULL(sip_Otv_Vergi, 0),
        sip_otvtutari = ISNULL(sip_otvtutari, 0)
      WHERE sip_evrakno_seri IN ('B2BF', 'B2BB')
        AND (
          sip_iskonto_1 IS NULL OR
          sip_iskonto_2 IS NULL OR
          sip_iskonto_3 IS NULL OR
          sip_iskonto_4 IS NULL OR
          sip_iskonto_5 IS NULL OR
          sip_iskonto_6 IS NULL OR
          sip_masraf_1 IS NULL OR
          sip_masraf_2 IS NULL OR
          sip_masraf_3 IS NULL OR
          sip_masraf_4 IS NULL OR
          sip_masvergi IS NULL OR
          sip_Otv_Vergi IS NULL OR
          sip_otvtutari IS NULL
        )
    `;

    console.log(`Updated ${result.rowsAffected[0]} rows`);

    // Verify the fix
    console.log('\n=== Verifying B2BF-3 fields after fix ===\n');

    const verifyResult = await sql.query`
      SELECT
        sip_evrakno_seri + '-' + CAST(sip_evrakno_sira AS VARCHAR) AS EvrakNo,
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
        sip_masvergi AS MasVergi,
        sip_Otv_Vergi AS OtvVergi,
        sip_otvtutari AS OtvTutari
      FROM SIPARISLER
      WHERE sip_evrakno_seri = 'B2BF' AND sip_evrakno_sira = 3
    `;

    console.log('B2BF-3 after fix:');
    console.log(JSON.stringify(verifyResult.recordset[0], null, 2));

    // Check fn_CariRiskFoyu again
    console.log('\n=== Checking fn_CariRiskFoyu after fix ===\n');

    const riskResult = await sql.query`
      SELECT *
      FROM dbo.fn_CariRiskFoyu(0, '120.01.001', GETDATE(), GETDATE(), GETDATE(), 0, '', 0, 0)
      WHERE msg_S_0077 = 'Sipariş Bakiyesi'
    `;

    console.log('Sipariş Bakiyesi:');
    console.log(JSON.stringify(riskResult.recordset, null, 2));

    await sql.close();
  } catch (err) {
    console.error('Error:', err);
  }
}

fixExistingOrders();
