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

async function checkRiskFoyu() {
  try {
    await sql.connect(config);

    console.log('=== Checking fn_CariRiskFoyu function definition ===\n');

    // Get the function definition
    const functionDef = await sql.query`
      SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.fn_CariRiskFoyu')) AS FunctionDefinition
    `;

    console.log('Function Definition (first 5000 chars):');
    console.log(functionDef.recordset[0].FunctionDefinition.substring(0, 5000));
    console.log('\n...\n');

    // Search for "Sipariş Bakiyesi" section
    const sipBakiyeStart = functionDef.recordset[0].FunctionDefinition.indexOf('Sipariş Bakiyesi');
    if (sipBakiyeStart > -1) {
      console.log('=== Sipariş Bakiyesi Section ===');
      console.log(functionDef.recordset[0].FunctionDefinition.substring(sipBakiyeStart - 500, sipBakiyeStart + 2000));
    }

    await sql.close();
  } catch (err) {
    console.error('Error:', err);
  }
}

checkRiskFoyu();
