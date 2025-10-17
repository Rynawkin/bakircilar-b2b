const sql = require('mssql');
require('dotenv').config();

const config = {
  server: process.env.MIKRO_DB_HOST || 'localhost',
  database: process.env.MIKRO_DB_NAME || 'MikroDB_V16_BKRC2020',
  user: process.env.MIKRO_DB_USER,
  password: process.env.MIKRO_DB_PASSWORD,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

async function checkColumns() {
  try {
    await sql.connect(config);

    // Check for email and sector columns
    const result = await sql.query`
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'CARI_HESAPLAR'
      AND (
        COLUMN_NAME LIKE '%mail%' OR
        COLUMN_NAME LIKE '%sektor%' OR
        COLUMN_NAME LIKE '%sekt%' OR
        COLUMN_NAME LIKE '%e_posta%' OR
        COLUMN_NAME LIKE '%eposta%'
      )
      ORDER BY COLUMN_NAME
    `;

    console.log('📧 Email/Sector Columns:', JSON.stringify(result.recordset, null, 2));

    // Also get first few cari records to see the data
    const sample = await sql.query`
      SELECT TOP 3 cari_kod, cari_unvan1, *
      FROM CARI_HESAPLAR
    `;

    console.log('\n📊 Sample CARI record columns:', Object.keys(sample.recordset[0] || {}).join(', '));

    await sql.close();
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

checkColumns();
