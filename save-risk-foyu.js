const sql = require('mssql');
const fs = require('fs');

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

async function saveFunction() {
  try {
    await sql.connect(config);

    const functionDef = await sql.query`
      SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.fn_CariRiskFoyu')) AS FunctionDefinition
    `;

    fs.writeFileSync('/tmp/fn_CariRiskFoyu.sql', functionDef.recordset[0].FunctionDefinition);
    console.log('Function saved to /tmp/fn_CariRiskFoyu.sql');

    // Find all instances of "Sipariş"
    const content = functionDef.recordset[0].FunctionDefinition;
    const lines = content.split('\n');

    console.log('\nLines containing "Sipariş":');
    lines.forEach((line, idx) => {
      if (line.includes('Sipariş') || line.includes('SIPARISLER')) {
        console.log(`Line ${idx + 1}: ${line.trim()}`);
      }
    });

    await sql.close();
  } catch (err) {
    console.error('Error:', err);
  }
}

saveFunction();
