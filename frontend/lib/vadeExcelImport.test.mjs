import assert from 'node:assert/strict';
import test from 'node:test';
import XLSX from 'xlsx';

import {
  VadeExcelParseError,
  findVadeExcelColumn,
  normalizeVadeExcelHeader,
  parseVadeExcelDate,
  parseVadeExcelNumber,
  parseVadeExcelWorksheet,
} from './vadeExcelImport.ts';

process.env.TZ = 'Europe/Istanbul';

const completeHeaders = [
  'Vadesi geçen bakiye vadesi',
  'Cari hesap kodu',
  'Vadesi geçen bakiye',
  'Cari hesap adı',
  'Sektör kodu',
  'Grup kodu',
  'Bölge kodu',
  'Valör',
  'Cari ödeme vadesi',
  'Vadesi geçmemiş bakiye',
  'TOPLAM BAKİYE',
  'Vadesi geçmemiş bakiye vadesi',
  'Bakiyeye konu ilk evrak tarihi',
];

const completeRow = [
  '23.07.2026',
  '120.01.001',
  '1.234,56',
  'Örnek Cari',
  'HENDEK',
  'BAYİ',
  'MARMARA',
  30,
  '60 GÜN',
  '500,25',
  '1.734,81',
  '22.08.2026',
  '01.05.2026',
];

test('Turkish headers normalize whitespace, dotted I and accents', () => {
  assert.equal(
    normalizeVadeExcelHeader('  CARİ   HESAP\nKODU  '),
    'cari hesap kodu',
  );
  assert.equal(normalizeVadeExcelHeader('Vadesi GEÇMEMİŞ Bakiye'), 'vadesi gecmemis bakiye');
});

test('exact balance header wins even when the date header comes first', () => {
  assert.equal(
    findVadeExcelColumn(completeHeaders, ['vadesi gecen bakiye'], {
      excludes: ['vadesi gecen bakiye vadesi'],
    }),
    2,
  );
  assert.equal(
    findVadeExcelColumn(completeHeaders, ['vadesi gecen bakiye vadesi']),
    0,
  );
});

test('parser finds a later header row and includes customer metadata and source row', () => {
  const worksheet = [
    ['Mikro Vade Farkı Durum Raporu'],
    ['Rapor tarihi', '23.07.2026'],
    completeHeaders,
    completeRow,
  ];
  const parsed = parseVadeExcelWorksheet(worksheet);

  assert.equal(parsed.headerRowNumber, 3);
  assert.equal(parsed.rows.length, 1);
  assert.deepEqual(parsed.rows[0], {
    mikroCariCode: '120.01.001',
    customerName: 'Örnek Cari',
    sectorCode: 'HENDEK',
    groupCode: 'BAYİ',
    regionCode: 'MARMARA',
    sourceRowNumber: 4,
    pastDueBalance: 1234.56,
    pastDueDate: '2026-07-23',
    notDueBalance: 500.25,
    notDueDate: '2026-08-22',
    totalBalance: 1734.81,
    valor: 30,
    paymentTermLabel: '60 GÜN',
    referenceDate: '2026-05-01',
  });
});

test('formatted Excel code preserves leading zeroes without formatting amount cells', () => {
  const rawRow = [...completeRow];
  rawRow[1] = 123;
  const formattedRow = [...completeRow];
  formattedRow[1] = '00123';
  const parsed = parseVadeExcelWorksheet(
    [completeHeaders, rawRow],
    { formattedRows: [completeHeaders, formattedRow] },
  );

  assert.equal(parsed.rows[0].mikroCariCode, '00123');
  assert.equal(parsed.rows[0].pastDueBalance, 1234.56);
});

test('date parsing preserves local Excel day and handles both date systems', () => {
  const localMidnight = new Date(2026, 6, 23, 0, 0, 0);
  assert.equal(parseVadeExcelDate(localMidnight), '2026-07-23');
  assert.equal(parseVadeExcelDate(46226), '2026-07-23');
  assert.equal(parseVadeExcelDate(0, { date1904: true }), '1904-01-01');
  assert.equal(parseVadeExcelDate('31.02.2026'), null);
});

test('SheetJS workbook round-trip keeps the worksheet calendar day', () => {
  const workbook = XLSX.utils.book_new();
  const excelRow = [...completeRow];
  excelRow[0] = new Date(2026, 6, 23);
  excelRow[11] = new Date(2026, 7, 22);
  excelRow[12] = new Date(2026, 4, 1);
  const worksheet = XLSX.utils.aoa_to_sheet(
    [completeHeaders, excelRow],
    { cellDates: true },
  );
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Vade');

  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const reloaded = XLSX.read(bytes, { type: 'buffer', cellDates: false });
  const rawRows = XLSX.utils.sheet_to_json(reloaded.Sheets.Vade, {
    header: 1,
    defval: '',
    raw: true,
  });
  const formattedRows = XLSX.utils.sheet_to_json(reloaded.Sheets.Vade, {
    header: 1,
    defval: '',
    raw: false,
  });
  const parsed = parseVadeExcelWorksheet(rawRows, { formattedRows });

  assert.equal(parsed.rows[0].pastDueDate, '2026-07-23');
  assert.equal(parsed.rows[0].notDueDate, '2026-08-22');
  assert.equal(parsed.rows[0].referenceDate, '2026-05-01');
});

test('Turkish, international and accounting numbers are parsed explicitly', () => {
  assert.equal(parseVadeExcelNumber('1.234,56'), 1234.56);
  assert.equal(parseVadeExcelNumber('1,234.56'), 1234.56);
  assert.equal(parseVadeExcelNumber('(1.234,56)'), -1234.56);
  assert.equal(parseVadeExcelNumber('bozuk'), null);
});

test('missing critical headers stop the snapshot before any API call', () => {
  assert.throws(
    () => parseVadeExcelWorksheet([['Cari hesap kodu'], ['120.01.001']]),
    (error) =>
      error instanceof VadeExcelParseError &&
      error.code === 'MISSING_CRITICAL_COLUMNS' &&
      error.missingColumns.includes('Vadesi geçen bakiye'),
  );
});

test('invalid financial and date values identify the physical source row', () => {
  const invalidNumberRow = [...completeRow];
  invalidNumberRow[2] = 'tutar değil';
  assert.throws(
    () => parseVadeExcelWorksheet([completeHeaders, invalidNumberRow]),
    (error) =>
      error instanceof VadeExcelParseError &&
      error.code === 'INVALID_NUMBER' &&
      error.sourceRowNumber === 2,
  );

  const invalidDateRow = [...completeRow];
  invalidDateRow[0] = '31.02.2026';
  assert.throws(
    () => parseVadeExcelWorksheet([completeHeaders, invalidDateRow]),
    (error) =>
      error instanceof VadeExcelParseError &&
      error.code === 'INVALID_DATE' &&
      error.sourceRowNumber === 2,
  );
});
