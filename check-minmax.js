const sql = require('mssql');

const config = {
  server: '185.123.54.61',
  port: 16022,
  database: 'MikroDB_V16_BKRC2020',
  user: 'BkrcWebL1RgcVc4YexP3LRfWZ6W',
  password: 'uq0#_iZ0FTlvHwF=sPKL',
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 30000,
    requestTimeout: 30000
  }
};

(async () => {
  try {
    console.log('Mikro sunucusuna bağlanılıyor...');
    await sql.connect(config);
    console.log('Bağlantı başarılı!\n');

    // 1. Stored Procedure ara
    console.log('=== STORED PROCEDURES (minmax içeren) ===\n');
    const procedures = await sql.query`
      SELECT
        ROUTINE_NAME,
        ROUTINE_TYPE,
        CREATED,
        LAST_ALTERED
      FROM INFORMATION_SCHEMA.ROUTINES
      WHERE ROUTINE_NAME LIKE '%minmax%'
      ORDER BY ROUTINE_NAME
    `;

    if (procedures.recordset.length > 0) {
      console.log('Bulunan Stored Procedures:');
      procedures.recordset.forEach(proc => {
        console.log(`- ${proc.ROUTINE_NAME} (${proc.ROUTINE_TYPE})`);
        console.log(`  Oluşturulma: ${proc.CREATED}`);
        console.log(`  Son Değişiklik: ${proc.LAST_ALTERED}\n`);
      });

      // Her procedure'ün kodunu göster
      for (const proc of procedures.recordset) {
        console.log(`\n=== ${proc.ROUTINE_NAME} KODU ===\n`);
        const code = await sql.query`
          SELECT OBJECT_DEFINITION(OBJECT_ID('${proc.ROUTINE_NAME}')) AS Code
        `;
        console.log(code.recordset[0].Code);
        console.log('\n' + '='.repeat(80) + '\n');
      }
    } else {
      console.log('minmax içeren stored procedure bulunamadı.\n');
    }

    // 2. Function ara
    console.log('=== FUNCTIONS (minmax içeren) ===\n');
    const functions = await sql.query`
      SELECT
        name,
        type_desc,
        create_date,
        modify_date
      FROM sys.objects
      WHERE type IN ('FN', 'IF', 'TF')
        AND name LIKE '%minmax%'
      ORDER BY name
    `;

    if (functions.recordset.length > 0) {
      console.log('Bulunan Functions:');
      functions.recordset.forEach(func => {
        console.log(`- ${func.name} (${func.type_desc})`);
        console.log(`  Oluşturulma: ${func.create_date}`);
        console.log(`  Son Değişiklik: ${func.modify_date}\n`);
      });

      // Her function'ın kodunu göster
      for (const func of functions.recordset) {
        console.log(`\n=== ${func.name} KODU ===\n`);
        const code = await sql.query`
          SELECT OBJECT_DEFINITION(OBJECT_ID('${func.name}')) AS Code
        `;
        console.log(code.recordset[0].Code);
        console.log('\n' + '='.repeat(80) + '\n');
      }
    } else {
      console.log('minmax içeren function bulunamadı.\n');
    }

    // 3. Trigger ara
    console.log('=== TRIGGERS (minmax içeren) ===\n');
    const triggers = await sql.query`
      SELECT
        name,
        parent_class_desc,
        create_date,
        modify_date
      FROM sys.triggers
      WHERE name LIKE '%minmax%'
      ORDER BY name
    `;

    if (triggers.recordset.length > 0) {
      console.log('Bulunan Triggers:');
      triggers.recordset.forEach(trig => {
        console.log(`- ${trig.name} (${trig.parent_class_desc})`);
        console.log(`  Oluşturulma: ${trig.create_date}`);
        console.log(`  Son Değişiklik: ${trig.modify_date}\n`);
      });

      // Her trigger'ın kodunu göster
      for (const trig of triggers.recordset) {
        console.log(`\n=== ${trig.name} KODU ===\n`);
        const code = await sql.query`
          SELECT OBJECT_DEFINITION(OBJECT_ID('${trig.name}')) AS Code
        `;
        console.log(code.recordset[0].Code);
        console.log('\n' + '='.repeat(80) + '\n');
      }
    } else {
      console.log('minmax içeren trigger bulunamadı.\n');
    }

    // 4. Tablo ara (belki bir tablo var)
    console.log('=== TABLES (minmax içeren) ===\n');
    const tables = await sql.query`
      SELECT
        TABLE_NAME,
        TABLE_TYPE
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME LIKE '%minmax%'
      ORDER BY TABLE_NAME
    `;

    if (tables.recordset.length > 0) {
      console.log('Bulunan Tablolar:');
      tables.recordset.forEach(tbl => {
        console.log(`- ${tbl.TABLE_NAME} (${tbl.TABLE_TYPE})`);
      });

      // Her tablonun yapısını ve örnek verilerini göster
      for (const tbl of tables.recordset) {
        console.log(`\n=== ${tbl.TABLE_NAME} YAPISI ===\n`);

        // Kolon bilgileri
        const columns = await sql.query`
          SELECT
            COLUMN_NAME,
            DATA_TYPE,
            CHARACTER_MAXIMUM_LENGTH,
            IS_NULLABLE
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = '${tbl.TABLE_NAME}'
          ORDER BY ORDINAL_POSITION
        `;
        console.log('Kolonlar:');
        console.log(JSON.stringify(columns.recordset, null, 2));

        // Örnek veriler
        console.log(`\n=== ${tbl.TABLE_NAME} ÖRNEK VERİLER (İlk 10 kayıt) ===\n`);
        const sample = await sql.query`SELECT TOP 10 * FROM ${tbl.TABLE_NAME}`;
        console.log(JSON.stringify(sample.recordset, null, 2));
        console.log('\n' + '='.repeat(80) + '\n');
      }
    } else {
      console.log('minmax içeren tablo bulunamadı.\n');
    }

    // 5. View ara
    console.log('=== VIEWS (minmax içeren) ===\n');
    const views = await sql.query`
      SELECT
        TABLE_NAME
      FROM INFORMATION_SCHEMA.VIEWS
      WHERE TABLE_NAME LIKE '%minmax%'
      ORDER BY TABLE_NAME
    `;

    if (views.recordset.length > 0) {
      console.log('Bulunan Views:');
      views.recordset.forEach(view => {
        console.log(`- ${view.TABLE_NAME}`);
      });

      // Her view'in kodunu göster
      for (const view of views.recordset) {
        console.log(`\n=== ${view.TABLE_NAME} KODU ===\n`);
        const code = await sql.query`
          SELECT VIEW_DEFINITION
          FROM INFORMATION_SCHEMA.VIEWS
          WHERE TABLE_NAME = '${view.TABLE_NAME}'
        `;
        console.log(code.recordset[0].VIEW_DEFINITION);
        console.log('\n' + '='.repeat(80) + '\n');
      }
    } else {
      console.log('minmax içeren view bulunamadı.\n');
    }

    await sql.close();
    console.log('\n\nİşlem tamamlandı!');
  } catch (err) {
    console.error('HATA:', err.message);
    console.error('Stack:', err.stack);
    process.exit(1);
  }
})();
