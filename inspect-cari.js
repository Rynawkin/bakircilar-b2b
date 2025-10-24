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

    // 1. Tablo şeması
    console.log('=== CARI_HESAPLAR TABLO ŞEMASI ===\n');
    const schema = await sql.query`
      SELECT
        COLUMN_NAME,
        DATA_TYPE,
        CHARACTER_MAXIMUM_LENGTH,
        IS_NULLABLE,
        COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'CARI_HESAPLAR'
      ORDER BY ORDINAL_POSITION
    `;

    // Sadece önemli alanları filtrele
    const importantFields = schema.recordset.filter(col =>
      col.COLUMN_NAME.includes('cari_kod') ||
      col.COLUMN_NAME.includes('cari_unvan') ||
      col.COLUMN_NAME.includes('cari_vdaire') ||
      col.COLUMN_NAME.includes('cari_vno') ||
      col.COLUMN_NAME.includes('cari_EMail') ||
      col.COLUMN_NAME.includes('cari_CepTel') ||
      col.COLUMN_NAME.includes('cari_il') ||
      col.COLUMN_NAME.includes('cari_ilce') ||
      col.COLUMN_NAME.includes('cari_adres') ||
      col.COLUMN_NAME.includes('cari_tip') ||
      col.COLUMN_NAME.includes('cari_cins') ||
      col.COLUMN_NAME.includes('cari_statu') ||
      col.COLUMN_NAME.includes('cari_create') ||
      col.COLUMN_NAME.includes('cari_lastup') ||
      col.COLUMN_NAME.includes('cari_special') ||
      col.COLUMN_NAME.includes('cari_muh_kod')
    );

    console.log('Önemli alanlar:');
    console.log(JSON.stringify(importantFields, null, 2));

    // 2. Örnek bir cari kaydı
    console.log('\n\n=== ÖRNEK CARİ KAYDI ===\n');
    const example = await sql.query`
      SELECT TOP 1 *
      FROM CARI_HESAPLAR
      WHERE cari_kod LIKE '120%'
      ORDER BY cari_create_date DESC
    `;
    console.log(JSON.stringify(example.recordset[0], null, 2));

    // 3. TEST001 kodu var mı?
    console.log('\n\n=== TEST001 CARİ KONTROLÜ ===\n');
    const test001 = await sql.query`
      SELECT *
      FROM CARI_HESAPLAR
      WHERE cari_kod = 'TEST001'
    `;
    console.log(`TEST001 bulundu mu? ${test001.recordset.length > 0 ? 'EVET' : 'HAYIR'}`);
    if (test001.recordset.length > 0) {
      console.log(JSON.stringify(test001.recordset[0], null, 2));
    }

    await sql.close();
    console.log('\n\nİşlem tamamlandı!');
  } catch (err) {
    console.error('HATA:', err.message);
    console.error('Stack:', err.stack);
    process.exit(1);
  }
})();
