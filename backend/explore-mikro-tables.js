const mssql = require('mssql');
require('dotenv').config();

const config = {
  user: process.env.MIKRO_DB_USER || 'sa',
  password: process.env.MIKRO_DB_PASSWORD,
  server: process.env.MIKRO_DB_SERVER || 'localhost',
  database: process.env.MIKRO_DB_NAME || 'MikroDB_V16',
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
