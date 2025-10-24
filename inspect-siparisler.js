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
    console.log('=== SIPARISLER TABLO ŞEMASI ===\n');
    const schema = await sql.query`
      SELECT
        COLUMN_NAME,
        DATA_TYPE,
        CHARACTER_MAXIMUM_LENGTH,
        IS_NULLABLE,
        COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'SIPARISLER'
      ORDER BY ORDINAL_POSITION
    `;
    console.log(JSON.stringify(schema.recordset, null, 2));

    // 2. B2B siparişlerini kontrol et
    console.log('\n\n=== B2B SİPARİŞLERİ (B2B_FATURAL ve B2B_BEYAZ) ===\n');
    const b2bOrders = await sql.query`
      SELECT
        sip_evrakno_seri,
        sip_evrakno_sira,
        sip_satirno,
        sip_tarih,
        sip_musteri_kod,
        sip_stok_kod,
        sip_miktar,
        sip_teslim_miktar,
        sip_b_fiyat,
        sip_tutar,
        sip_vergi,
        sip_aciklama,
        sip_iptal,
        sip_depono
      FROM SIPARISLER
      WHERE sip_evrakno_seri IN ('B2B_FATURAL', 'B2B_BEYAZ')
      ORDER BY sip_evrakno_seri, sip_evrakno_sira, sip_satirno
    `;
    console.log(JSON.stringify(b2bOrders.recordset, null, 2));
    console.log(`\nToplam B2B sipariş satırı: ${b2bOrders.recordset.length}`);

    // 3. Sipariş tipi/cinsi değerlerini anlamak için
    console.log('\n\n=== SİPARİŞ TİP/CİNS DEĞERLERİ ===\n');
    const types = await sql.query`
      SELECT DISTINCT
        sip_tip,
        sip_cins,
        COUNT(*) as adet
      FROM SIPARISLER
      WHERE sip_cari_kod IS NOT NULL
      GROUP BY sip_tip, sip_cins
      ORDER BY COUNT(*) DESC
    `;
    console.log(JSON.stringify(types.recordset, null, 2));

    await sql.close();
    console.log('\n\nİşlem tamamlandı!');
  } catch (err) {
    console.error('HATA:', err.message);
    console.error('Stack:', err.stack);
    process.exit(1);
  }
})();
