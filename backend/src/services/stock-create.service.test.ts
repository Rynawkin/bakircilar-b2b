import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import stockCreateService, { stockCreatePriceListTestUtils } from './stock-create.service';
import mikroService from './mikroFactory.service';
import { prisma } from '../utils/prisma';

const mikroMock = mikroService as any;
const prismaMock = prisma as any;
const originalExecuteQuery = mikroMock.executeQuery;
const originalExecuteQueryOnce = mikroMock.executeQueryOnce;
const originalLogCreate = prismaMock.stockCreationLog.create;

afterEach(() => {
  mikroMock.executeQuery = originalExecuteQuery;
  mikroMock.executeQueryOnce = originalExecuteQueryOnce;
  prismaMock.stockCreationLog.create = originalLogCreate;
});

test('stock price rows map tier 6 to physical lists 13/14 without touching campaign lists', () => {
  const rows = stockCreatePriceListTestUtils.buildStockPriceListRows({
    // Stock-create UI costP maps to Mikro MaliyetT; costT maps to Mikro MaliyetP.
    costP: 120,
    costT: 100,
    margins: ['1', '1,1', '1,2', '1,3', '1,4', '1,5'],
  } as any);

  assert.deepEqual(
    rows.map((row) => row.listNo),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14]
  );
  assert.equal(rows.find((row) => row.listNo === 13)?.value, 150);
  assert.equal(rows.find((row) => row.listNo === 13)?.baseCost, 100);
  assert.equal(rows.find((row) => row.listNo === 14)?.value, 180);
  assert.equal(rows.find((row) => row.listNo === 14)?.baseCost, 120);
  assert.equal(rows.some((row) => row.listNo === 11 || row.listNo === 12), false);
});

test('stock price rows fail closed when Marj_6 is missing', () => {
  assert.throws(
    () =>
      stockCreatePriceListTestUtils.buildStockPriceListRows({
        costP: 120,
        costT: 100,
        margins: ['1', '1,1', '1,2', '1,3', '1,4'],
      } as any),
    /Marj_6 eksik veya gecersiz/
  );
});

test('empty template lookup omits the constant relevance ORDER BY expression', async () => {
  let query = '';
  mikroMock.executeQuery = async (sql: string) => {
    query = sql;
    return [];
  };

  await stockCreateService.searchLookups('template', '', 30);

  assert.doesNotMatch(query, /WHEN\s+N''\s+<>\s+N''/i);
  assert.match(
    query,
    /ORDER BY\s+CASE\s+WHEN sto_kod LIKE N'B%'/i
  );
});

test('activation preview accepts the existing passive stock itself and keeps its code', async () => {
  const queries: string[] = [];
  mikroMock.executeQuery = async (sql: string) => {
    queries.push(sql);
    return [{ code: 'B123', name: 'Mevcut pasif stok', isPassive: 1 }];
  };
  prismaMock.stockCreationLog.create = async () => ({});

  const preview = await stockCreateService.previewActivation('b123');

  assert.equal(preview.results[0].status, 'valid');
  assert.equal(preview.results[0].previewCode, 'B123');
  assert.equal(preview.results[0].item.stockCode, 'B123');
  assert.equal(preview.results[0].item.name, 'Mevcut pasif stok');
  assert.deepEqual(preview.results[0].errors, []);
  assert.equal(preview.summary.error, 0);
  assert.equal(queries.length, 1);
  assert.match(queries[0], /WHERE sto_kod = N'B123'/i);
  assert.doesNotMatch(queries[0], /BARKOD_TANIMLARI|LIKE|MAX\s*\(|INSERT\s+INTO|UPDATE\s+/i);
});

test('activation preview rejects an already active target', async () => {
  mikroMock.executeQuery = async () => [{ code: 'B124', name: 'Aktif stok', isPassive: 0 }];
  prismaMock.stockCreationLog.create = async () => ({});

  await assert.rejects(
    () => stockCreateService.previewActivation('B124'),
    /Stok zaten aktif; sadece pasif stok aktiflestirilebilir/
  );
});

test('activation preview rejects a missing target', async () => {
  mikroMock.executeQuery = async () => [];
  prismaMock.stockCreationLog.create = async () => ({});

  await assert.rejects(
    () => stockCreateService.previewActivation('B999'),
    /Aktiflestirilecek stok Mikroda bulunamadi/
  );
});

test('passive activation verifies schema, updates only the passive flag and audit fields, then reads back', async () => {
  const queries: string[] = [];
  let logInput: any = null;
  const columns = [
    'sto_kod',
    'sto_Guid',
    'sto_isim',
    'sto_pasif_fl',
    'sto_degisti',
    'sto_lastup_user',
    'sto_lastup_date',
  ];

  mikroMock.executeQuery = async (sql: string) => {
    queries.push(sql);
    if (/INFORMATION_SCHEMA\.COLUMNS/i.test(sql)) {
      return columns.map((columnName) => ({ columnName }));
    }
    if (/BEGIN\s+TRANSACTION/i.test(sql)) {
      return [];
    }
    if (/CONVERT\(nvarchar\(50\),\s*sto_Guid\)\s+AS\s+guid/i.test(sql)) {
      return [{ code: 'B125', name: 'Aktiflesen stok', guid: 'guid-125', isPassive: 0 }];
    }
    throw new Error(`Beklenmeyen sorgu: ${sql}`);
  };
  // Factory production ortaminda gercek Mikro servisini secebilir. Yazma yolu
  // her kosulda bu test stub'ina donsun; gercek executeQueryOnce calismasin.
  mikroMock.executeQueryOnce = async (sql: string) => mikroMock.executeQuery(sql);
  prismaMock.stockCreationLog.create = async (input: any) => {
    logInput = input;
    return {};
  };

  const result = await stockCreateService.activatePassiveStock('b125', 'user-1');

  assert.equal(result.success, true);
  assert.equal(result.stockCode, 'B125');
  assert.equal(result.stock.isPassive, false);
  assert.deepEqual(result.warnings, []);
  assert.equal(queries.length, 3);
  assert.match(queries[0], /INFORMATION_SCHEMA\.COLUMNS/i);

  const transactionSql = queries[1];
  assert.match(transactionSql, /FROM dbo\.STOKLAR WITH \(UPDLOCK, HOLDLOCK\)/i);
  assert.match(transactionSql, /IF @targetFound = 0[\s\S]*Aktiflestirilecek stok Mikroda bulunamadi/i);
  assert.match(transactionSql, /IF @isPassive <> 1[\s\S]*Stok zaten aktif/i);
  assert.match(transactionSql, /IF @@ROWCOUNT <> 1/i);

  const updateSet = transactionSql.match(/UPDATE dbo\.STOKLAR\s+SET([\s\S]*?)\s+WHERE sto_kod = @stockCode/i);
  assert.ok(updateSet, 'STOKLAR UPDATE SET bolumu bulunmali');
  const updatedColumns = Array.from(updateSet[1].matchAll(/\b(sto_[a-z0-9_]+)\s*=/gi), (match) => match[1].toLowerCase());
  assert.deepEqual(updatedColumns, ['sto_pasif_fl', 'sto_degisti', 'sto_lastup_user', 'sto_lastup_date']);
  assert.doesNotMatch(
    transactionSql,
    /STOKLAR_USER|BARKOD_TANIMLARI|STOK_SATIS_FIYAT_LISTELERI|INSERT\s+INTO|DELETE\s+FROM|sto_isim\s*=|sto_standartmaliyet\s*=/i
  );

  assert.doesNotMatch(queries[2], /BEGIN\s+TRANSACTION|UPDATE\s+/i);
  assert.match(queries[2], /WHERE sto_kod = N'B125'/i);
  assert.equal(logInput.data.mode, 'ACTIVATE');
  assert.equal(logInput.data.status, 'ACTIVATED');
  assert.deepEqual(logInput.data.payload, { stockCode: 'B125' });
  assert.deepEqual(logInput.data.result, { stockGuid: 'guid-125', passiveFlag: 0 });
  assert.equal(logInput.data.createdById, 'user-1');
});

test('passive activation stops before writing when required Mikro columns are missing', async () => {
  const queries: string[] = [];
  let logCalled = false;
  mikroMock.executeQuery = async (sql: string) => {
    queries.push(sql);
    return [{ columnName: 'sto_kod' }, { columnName: 'sto_pasif_fl' }];
  };
  prismaMock.stockCreationLog.create = async () => {
    logCalled = true;
    return {};
  };

  await assert.rejects(
    () => stockCreateService.activatePassiveStock('B126'),
    /Mikro STOKLAR kolonlari dogrulanamadi/
  );
  assert.equal(queries.length, 1);
  assert.match(queries[0], /INFORMATION_SCHEMA\.COLUMNS/i);
  assert.equal(logCalled, false);
});

test('passive activation does not retry an uncertain write and accepts an active independent read-back', async () => {
  const columns = [
    'sto_kod',
    'sto_Guid',
    'sto_isim',
    'sto_pasif_fl',
    'sto_degisti',
    'sto_lastup_user',
    'sto_lastup_date',
  ];
  let writeAttempts = 0;
  mikroMock.executeQuery = async (sql: string) => {
    if (/INFORMATION_SCHEMA\.COLUMNS/i.test(sql)) {
      return columns.map((columnName) => ({ columnName }));
    }
    if (/CONVERT\(nvarchar\(50\),\s*sto_Guid\)\s+AS\s+guid/i.test(sql)) {
      return [{ code: 'B127', name: 'Aktiflesen stok', guid: 'guid-127', isPassive: 0 }];
    }
    throw new Error(`Beklenmeyen sorgu: ${sql}`);
  };
  mikroMock.executeQueryOnce = async (sql: string) => {
    writeAttempts += 1;
    assert.match(sql, /UPDATE dbo\.STOKLAR/i);
    const error: any = new Error('connection lost after commit');
    error.code = 'ESOCKET';
    throw error;
  };
  prismaMock.stockCreationLog.create = async () => ({});

  const result = await stockCreateService.activatePassiveStock('B127');

  assert.equal(writeAttempts, 1);
  assert.equal(result.success, true);
  assert.equal(result.stock.isPassive, false);
  assert.match(result.warnings[0], /bagimsiz kontrolde stokun aktiflestigi dogrulandi/i);
});

test('passive activation does not turn a deterministic write rejection into success', async () => {
  const columns = [
    'sto_kod',
    'sto_Guid',
    'sto_isim',
    'sto_pasif_fl',
    'sto_degisti',
    'sto_lastup_user',
    'sto_lastup_date',
  ];
  mikroMock.executeQuery = async (sql: string) => {
    if (/INFORMATION_SCHEMA\.COLUMNS/i.test(sql)) {
      return columns.map((columnName) => ({ columnName }));
    }
    if (/CONVERT\(nvarchar\(50\),\s*sto_Guid\)\s+AS\s+guid/i.test(sql)) {
      return [{ code: 'B128', name: 'Zaten aktif stok', guid: 'guid-128', isPassive: 0 }];
    }
    throw new Error(`Beklenmeyen sorgu: ${sql}`);
  };
  mikroMock.executeQueryOnce = async () => {
    throw new Error('Stok zaten aktif; sadece pasif stok aktiflestirilebilir');
  };
  prismaMock.stockCreationLog.create = async () => ({});

  await assert.rejects(
    () => stockCreateService.activatePassiveStock('B128'),
    /Stok zaten aktif; sadece pasif stok aktiflestirilebilir/
  );
});
