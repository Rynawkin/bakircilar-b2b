const mssql = require('mssql');
require('dotenv').config();

const config = {
  user: 'BkrcWebL1RgcVc4YexP3LRfWZ6W',
  password: 'uq0#_iZ0FTlvHwF=sPKL',
  server: '185.123.54.61',
  database: 'MikroDB_V16_BKRC2020',
  port: 16022,
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function exploreTables() {
  try {
    await mssql.connect(config);

    // Tüm tabloları listele
    const tables = await mssql.query`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `;

    console.log('=== MIKRO VERİTABANI TABLOLARI ===\n');
    console.log(`Toplam ${tables.recordset.length} tablo bulundu\n`);

    tables.recordset.forEach(row => console.log(row.TABLE_NAME));

  } catch(err) {
    console.error('Hata:', err);
  } finally {
    await mssql.close();
  }
}

exploreTables();
