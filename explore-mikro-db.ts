import * as sql from 'mssql';
import { config } from '../config';

async function exploreTables() {
  let pool: sql.ConnectionPool | null = null;

  try {
    console.log('🔌 Mikro veritabanına bağlanıyor...');
    pool = await sql.connect(config.mikro);
    console.log('✅ Bağlantı başarılı!\n');

    // Get all tables
    const tablesResult = await pool.request().query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `);

    console.log(`📊 Toplam ${tablesResult.recordset.length} tablo bulundu\n`);
    console.log('='.repeat(80));

    // For each table, get columns and row count
    for (const table of tablesResult.recordset) {
      const tableName = table.TABLE_NAME;

      // Get columns
      const columnsResult = await pool.request().query(`
        SELECT
          COLUMN_NAME,
          DATA_TYPE,
          IS_NULLABLE,
          CHARACTER_MAXIMUM_LENGTH
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = '${tableName}'
        ORDER BY ORDINAL_POSITION
      `);

      // Get row count
      let rowCount = 0;
      try {
        const countResult = await pool.request().query(`SELECT COUNT(*) as cnt FROM [${tableName}]`);
        rowCount = countResult.recordset[0].cnt;
      } catch (e) {
        // Skip if error
      }

      console.log(`\n📋 ${tableName} (${columnsResult.recordset.length} kolon, ${rowCount} satır)`);
      console.log('-'.repeat(80));

      columnsResult.recordset.slice(0, 20).forEach(col => {
        const nullable = col.IS_NULLABLE === 'YES' ? '?' : '';
        const length = col.CHARACTER_MAXIMUM_LENGTH ? `(${col.CHARACTER_MAXIMUM_LENGTH})` : '';
        console.log(`  • ${col.COLUMN_NAME}: ${col.DATA_TYPE}${length}${nullable}`);
      });

      if (columnsResult.recordset.length > 20) {
        console.log(`  ... ve ${columnsResult.recordset.length - 20} kolon daha`);
      }
    }

  } catch(err: any) {
    console.error('❌ Hata:', err.message);
  } finally {
    if (pool) {
      await pool.close();
      console.log('\n🔌 Bağlantı kapatıldı');
    }
  }
}

exploreTables();
