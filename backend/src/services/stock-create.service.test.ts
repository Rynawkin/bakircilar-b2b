import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import stockCreateService, { stockCreatePriceListTestUtils } from './stock-create.service';
import mikroService from './mikroFactory.service';
import imageService from './image.service';
import familyCandidateService from './family-candidate.service';
import { prisma } from '../utils/prisma';

const mikroMock = mikroService as any;
const imageMock = imageService as any;
const familyMock = familyCandidateService as any;
const prismaMock = prisma as any;
const serviceMock = stockCreateService as any;

const originals = {
  executeQuery: mikroMock.executeQuery,
  executeQueryOnce: mikroMock.executeQueryOnce,
  processUploadedProductImage: imageMock.processUploadedProductImage,
  uploadImageToMikro: imageMock.uploadImageToMikro,
  downloadImageFromMikro: imageMock.downloadImageFromMikro,
  removeLocalFile: imageMock.removeLocalFile,
  logCreate: prismaMock.stockCreationLog.create,
  productFindUnique: prismaMock.product.findUnique,
  productUpdate: prismaMock.product.update,
  productFamilyFindMany: prismaMock.productFamily.findMany,
  productFamilyItemFindMany: prismaMock.productFamilyItem.findMany,
  priceFamilyFindFirst: prismaMock.priceFamily.findFirst,
  prismaTransaction: prismaMock.$transaction,
  addProductToFamily: familyMock.addProductToFamily,
  removeProductFromFamily: familyMock.removeProductFromFamily,
  previewActivation: serviceMock.previewActivation,
  validateExistingItem: serviceMock.validateExistingItem,
  syncCreatedProduct: serviceMock.syncCreatedProduct,
  getTemplate: serviceMock.getTemplate,
  getStock: serviceMock.getStock,
  updateStock: serviceMock.updateStock,
};

afterEach(() => {
  mikroMock.executeQuery = originals.executeQuery;
  mikroMock.executeQueryOnce = originals.executeQueryOnce;
  imageMock.processUploadedProductImage = originals.processUploadedProductImage;
  imageMock.uploadImageToMikro = originals.uploadImageToMikro;
  imageMock.downloadImageFromMikro = originals.downloadImageFromMikro;
  imageMock.removeLocalFile = originals.removeLocalFile;
  prismaMock.stockCreationLog.create = originals.logCreate;
  prismaMock.product.findUnique = originals.productFindUnique;
  prismaMock.product.update = originals.productUpdate;
  prismaMock.productFamily.findMany = originals.productFamilyFindMany;
  prismaMock.productFamilyItem.findMany = originals.productFamilyItemFindMany;
  prismaMock.priceFamily.findFirst = originals.priceFamilyFindFirst;
  prismaMock.$transaction = originals.prismaTransaction;
  familyMock.addProductToFamily = originals.addProductToFamily;
  familyMock.removeProductFromFamily = originals.removeProductFromFamily;
  serviceMock.previewActivation = originals.previewActivation;
  serviceMock.validateExistingItem = originals.validateExistingItem;
  serviceMock.syncCreatedProduct = originals.syncCreatedProduct;
  serviceMock.getTemplate = originals.getTemplate;
  serviceMock.getStock = originals.getStock;
  serviceMock.updateStock = originals.updateStock;
});

const validActivationInput = {
  stockCode: 'B123',
  templateCode: 'B123',
  name: 'Mevcut pasif stok',
  foreignName: 'TED-123',
  shortName: 'Pasif stok',
  vatRatePercent: '20',
  supplierCode: '320.01',
  brandCode: 'MRK',
  brandName: 'Marka',
  categoryCode: '1.09.04',
  packageCode: '',
  packageName: '',
  shelfCode: '',
  currentCost: '',
  costT: '',
  costP: '',
  mainUnit: 'ADET',
  mainUnitWeightKg: '',
  mainUnitWidthCm: '',
  mainUnitLengthCm: '',
  mainUnitHeightCm: '',
  margins: ['1,1', '1,2', '1,3', '1,4', '1,5', '1,6'],
  barcode: '8690000000123',
  notes: '',
  extraUnits: [],
  calculateMinMax: true,
};

const priceListColumns = [
  'MaliyetP',
  'MaliyetT',
  'Marj_1',
  'Marj_2',
  'Marj_3',
  'Marj_4',
  'Marj_5',
  'Marj_6',
];

const mockActivationPreviewQueries = (target: { code: string; name: string; isPassive: number } | null) => {
  mikroMock.executeQuery = async (sql: string) => {
    if (/FROM dbo\.STOKLAR[\s\S]*WHERE sto_kod = N'/i.test(sql)) {
      return target ? [{ ...target, guid: `guid-${target.code}` }] : [];
    }
    if (/FROM CARI_HESAPLAR/i.test(sql)) {
      return [{ code: '320.01', name: 'Saglayici' }];
    }
    if (/FROM STOK_MARKALARI/i.test(sql)) {
      return [{ code: 'MRK', name: 'Marka' }];
    }
    if (/FROM STOK_KATEGORILERI parent/i.test(sql)) {
      return [{ code: '1.09.04', name: 'Alt kategori', isLeaf: 1 }];
    }
    if (/FROM STOK_AMBALAJLARI/i.test(sql) || /FROM STOK_REYONLARI/i.test(sql)) {
      return [];
    }
    if (/WHERE sto_kod IN/i.test(sql)) {
      return target ? [{ code: target.code, name: target.name }] : [];
    }
    if (/WHERE sto_isim IN/i.test(sql)) {
      return target ? [{ code: target.code, name: target.name }] : [];
    }
    if (/FROM BARKOD_TANIMLARI/i.test(sql)) {
      return target ? [{ code: validActivationInput.barcode, name: target.code }] : [];
    }
    throw new Error(`Beklenmeyen sorgu: ${sql}`);
  };
};

test('stock price rows map tier 6 to physical lists 13/14 without touching campaign lists', () => {
  const rows = stockCreatePriceListTestUtils.buildStockPriceListRows({
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
  assert.match(query, /ORDER BY\s+CASE\s+WHEN sto_kod LIKE N'B%'/i);
});

test('activation preview validates the full form but ignores self name and barcode collisions', async () => {
  mockActivationPreviewQueries({ code: 'B123', name: 'Mevcut pasif stok', isPassive: 1 });

  const preview = await stockCreateService.previewActivation('b123', validActivationInput);

  assert.equal(preview.results[0].status, 'valid');
  assert.equal(preview.results[0].previewCode, 'B123');
  assert.equal(preview.results[0].item.stockCode, 'B123');
  assert.deepEqual(preview.results[0].errors, []);
  assert.equal(preview.summary.error, 0);
});

test('activation preview returns create-form required errors for incomplete passive stock data', async () => {
  mockActivationPreviewQueries({ code: 'B123', name: 'Mevcut pasif stok', isPassive: 1 });

  const preview = await stockCreateService.previewActivation('B123', {
    stockCode: 'B123',
    templateCode: 'B123',
    name: '',
    margins: [],
  });

  assert.equal(preview.results[0].status, 'error');
  assert.match(preview.results[0].errors.join(' | '), /Stok adi zorunlu/);
  assert.match(preview.results[0].errors.join(' | '), /Ana birim zorunlu/);
  assert.match(preview.results[0].errors.join(' | '), /Ana saglayici zorunlu/);
  assert.match(preview.results[0].errors.join(' | '), /Marka zorunlu/);
  assert.match(preview.results[0].errors.join(' | '), /Kategori zorunlu/);
  assert.match(preview.results[0].errors.join(' | '), /Marj 6 zorunlu/);
});

test('activation preview rejects an already active target', async () => {
  mockActivationPreviewQueries({ code: 'B124', name: 'Aktif stok', isPassive: 0 });

  await assert.rejects(
    () => stockCreateService.previewActivation('B124', { ...validActivationInput, stockCode: 'B124', templateCode: 'B124' }),
    /Stok zaten aktif; sadece pasif stok aktiflestirilebilir/
  );
});

test('activation preview rejects a missing target', async () => {
  mockActivationPreviewQueries(null);

  await assert.rejects(
    () => stockCreateService.previewActivation('B999', { ...validActivationInput, stockCode: 'B999', templateCode: 'B999' }),
    /Aktiflestirilecek stok Mikroda bulunamadi/
  );
});

const mockFullActivationUpdate = (
  code: string,
  writeError?: Error & { code?: string },
  readbackOverrides: Record<string, unknown> = {},
  inputOverrides: Record<string, unknown> = {},
  firstPriceOffset = 0
) => {
  const normalized = serviceMock.normalizeItem(
    { ...validActivationInput, ...inputOverrides, stockCode: code, templateCode: code },
    1
  );
  let transactionSql = '';

  serviceMock.validateExistingItem = async () => ({
    item: normalized,
    errors: [],
    warnings: [],
    refs: {},
  });
  serviceMock.syncCreatedProduct = async () => ({ id: 'product-1' });
  serviceMock.getStock = async () => ({
    stockCode: code,
    isPassive: false,
    hasExistingImage: true,
    imageUrl: '/uploads/products/existing.webp',
  });
  prismaMock.stockCreationLog.create = async () => ({});

  mikroMock.executeQuery = async (sql: string) => {
    if (/INFORMATION_SCHEMA\.COLUMNS[\s\S]*STOKLAR_USER/i.test(sql)) {
      return priceListColumns.map((columnName) => ({ columnName }));
    }
    if (/sto_kod AS code,[\s\S]*sto_standartmaliyet/i.test(sql)) {
      return [{ code, guid: `guid-${code}`, currentCost: 0, isPassive: 1 }];
    }
    if (/s\.sto_kod AS templateCode/i.test(sql)) {
      return [{
        templateCode: code,
        stockGuid: `guid-${code}`,
        isPassive: 0,
        hasMikroImage: 1,
        modelKodu: '',
        name: normalized.name,
        foreignName: normalized.foreignName,
        shortName: normalized.shortName,
        vatRatePercent: normalized.vatRatePercent,
        supplierCode: normalized.supplierCode,
        brandCode: normalized.brandCode,
        brandName: normalized.brandName,
        categoryCode: normalized.categoryCode,
        packageCode: normalized.packageCode,
        shelfCode: normalized.shelfCode,
        currentCost: 0,
        costP: 0,
        costT: 0,
        mainUnit: normalized.mainUnit,
        mainUnitWeightKg: 0,
        mainUnitWidthMm: 0,
        mainUnitLengthMm: 0,
        mainUnitHeightMm: 0,
        margin1: normalized.margins[0],
        margin2: normalized.margins[1],
        margin3: normalized.margins[2],
        margin4: normalized.margins[3],
        margin5: normalized.margins[4],
        margin6: normalized.margins[5],
        barcode: normalized.barcode,
        ...readbackOverrides,
      }];
    }
    if (/sfiyat_listesirano AS listNo[\s\S]*COUNT\(\*\) AS rowCount/i.test(sql)) {
      return stockCreatePriceListTestUtils.buildStockPriceListRows(normalized).map((row, index) => ({
        listNo: row.listNo,
        rowCount: 1,
        price: row.value + (index === 0 ? firstPriceOffset : 0),
      }));
    }
    throw new Error(`Beklenmeyen sorgu: ${sql}`);
  };
  mikroMock.executeQueryOnce = async (sql: string) => {
    transactionSql = sql;
    if (writeError) throw writeError;
    return [];
  };

  return {
    normalized,
    getTransactionSql: () => transactionSql,
  };
};

test('full passive activation updates fields and passive flag atomically without creating a STOKLAR row', async () => {
  const harness = mockFullActivationUpdate('B125');

  const result = await stockCreateService.updateStock(
    'B125',
    { ...validActivationInput, stockCode: 'B125', templateCode: 'B125' },
    null,
    { activate: true }
  );

  assert.equal(result.stockCode, 'B125');
  const transactionSql = harness.getTransactionSql();
  assert.match(transactionSql, /FROM STOKLAR WITH \(UPDLOCK, HOLDLOCK\)/i);
  assert.match(transactionSql, /IF @isPassive <> 1[\s\S]*Stok zaten aktif/i);
  assert.match(transactionSql, /sto_isim\s*=\s*N'Mevcut pasif stok'/i);
  assert.match(transactionSql, /sto_sat_cari_kod\s*=\s*N'320\.01'/i);
  assert.match(transactionSql, /sto_kategori_kodu\s*=\s*N'1\.09\.04'/i);
  assert.match(transactionSql, /sto_pasif_fl\s*=\s*0/i);
  assert.match(transactionSql, /AND sto_pasif_fl = 1/i);
  assert.match(transactionSql, /IF @@ROWCOUNT <> 1/i);
  assert.match(transactionSql, /STOKLAR_USER/i);
  assert.match(transactionSql, /BARKOD_TANIMLARI/i);
  assert.doesNotMatch(transactionSql, /INSERT\s+INTO\s+(?:dbo\.)?STOKLAR\s*\(/i);
  assert.doesNotMatch(transactionSql, /MAX\s*\(\s*TRY_CONVERT[\s\S]*SUBSTRING\(sto_kod/i);
});

test('full activation does not retry an uncertain write and accepts a complete independent read-back', async () => {
  const uncertain: Error & { code?: string } = new Error('connection lost after commit');
  uncertain.code = 'ESOCKET';
  let writeAttempts = 0;
  const harness = mockFullActivationUpdate('B127', uncertain);
  const originalOnce = mikroMock.executeQueryOnce;
  mikroMock.executeQueryOnce = async (sql: string) => {
    writeAttempts += 1;
    return originalOnce(sql);
  };

  const result = await stockCreateService.updateStock(
    'B127',
    { ...validActivationInput, stockCode: 'B127', templateCode: 'B127' },
    null,
    { activate: true }
  );

  assert.equal(writeAttempts, 1);
  assert.match(harness.getTransactionSql(), /sto_pasif_fl\s*=\s*0/i);
  assert.match(result.warnings[0], /bagimsiz kontrolde stok alanlari ve aktivasyon dogrulandi/i);
});

test('activation read-back rejects a mismatch in a form field outside the old partial check', async () => {
  mockFullActivationUpdate('B128', undefined, { shortName: 'Yanlis kisa ad' });

  await assert.rejects(
    () => stockCreateService.updateStock(
      'B128',
      { ...validActivationInput, stockCode: 'B128', templateCode: 'B128' },
      null,
      { activate: true }
    ),
    /alanlarin tamami Mikro read-back kontrolunde dogrulanamadi/
  );
});

test('activation independently verifies every generated nonzero price-list row', async () => {
  const pricedInput = {
    ...validActivationInput,
    stockCode: 'B130',
    templateCode: 'B130',
    costT: '100',
    costP: '120',
    currentCost: '100',
  };
  mockFullActivationUpdate(
    'B130',
    undefined,
    { currentCost: 100, costP: 100, costT: 120 },
    { costT: '100', costP: '120', currentCost: '100' }
  );

  const result = await stockCreateService.updateStock('B130', pricedInput, null, { activate: true });

  assert.equal(result.stockCode, 'B130');
});

test('activation rejects a mismatched generated price in independent read-back', async () => {
  const pricedInput = {
    ...validActivationInput,
    stockCode: 'B131',
    templateCode: 'B131',
    costT: '100',
    costP: '120',
    currentCost: '100',
  };
  mockFullActivationUpdate(
    'B131',
    undefined,
    { currentCost: 100, costP: 100, costT: 120 },
    { costT: '100', costP: '120', currentCost: '100' },
    1
  );

  await assert.rejects(
    () => stockCreateService.updateStock('B131', pricedInput, null, { activate: true }),
    /alanlarin tamami Mikro read-back kontrolunde dogrulanamadi/
  );
});

test('verified Mikro activation remains successful when later B2B sync, log and detail reads fail', async () => {
  mockFullActivationUpdate('B129');
  serviceMock.syncCreatedProduct = async () => {
    throw new Error('postgres unavailable');
  };
  prismaMock.stockCreationLog.create = async () => {
    throw new Error('audit unavailable');
  };
  serviceMock.getStock = async () => {
    throw new Error('detail unavailable');
  };

  const result = await stockCreateService.updateStock(
    'B129',
    { ...validActivationInput, stockCode: 'B129', templateCode: 'B129' },
    null,
    { activate: true }
  );

  assert.equal(result.stockCode, 'B129');
  assert.equal(result.stock.isPassive, false);
  assert.match(result.warnings.join(' | '), /B2B urun senkronu tamamlanamadi/);
  assert.match(result.warnings.join(' | '), /B2B islem kaydi yazilamadi/);
  assert.match(result.warnings.join(' | '), /B2B stok detaylari yeniden okunamadi/);
});

test('activation requires an image when neither B2B nor Mikro has one', async () => {
  const normalized = serviceMock.normalizeItem(validActivationInput, 1);
  serviceMock.previewActivation = async () => ({
    results: [{ item: normalized, errors: [], warnings: [], status: 'valid', previewCode: 'B123', rowNo: 1 }],
  });
  serviceMock.getStock = async () => ({
    stockCode: 'B123',
    stockGuid: 'guid-B123',
    isPassive: true,
    imageUrl: null,
    hasMikroImage: false,
    hasExistingImage: false,
  });

  await assert.rejects(
    () => stockCreateService.activateStock({
      stockCode: 'B123',
      item: validActivationInput,
    }),
    /Gorsel zorunlu/
  );
});

test('activation keeps an existing image optional and updates the existing code only', async () => {
  const normalized = serviceMock.normalizeItem(validActivationInput, 1);
  let activated = false;
  serviceMock.previewActivation = async () => ({
    results: [{ item: normalized, errors: [], warnings: [], status: 'valid', previewCode: 'B123', rowNo: 1 }],
  });
  serviceMock.getStock = async () => ({
    stockCode: 'B123',
    stockGuid: 'guid-B123',
    isPassive: !activated,
    imageUrl: '/uploads/products/B123.webp',
    hasMikroImage: true,
    hasExistingImage: true,
  });
  serviceMock.updateStock = async (code: string, item: any, userId: any, options: any) => {
    assert.equal(code, 'B123');
    assert.equal(options.activate, true);
    activated = true;
    return { stockCode: code, warnings: [] };
  };
  prismaMock.product.findUnique = async () => ({ id: 'product-123', name: normalized.name });

  const result = await stockCreateService.activateStock({
    stockCode: 'B123',
    item: validActivationInput,
  });

  assert.equal(result.success, true);
  assert.equal(result.stockCode, 'B123');
  assert.equal(result.stock.isPassive, false);
});

test('activation reconciles stock-family selections by removing and adding memberships', async () => {
  const normalized = serviceMock.normalizeItem(validActivationInput, 1);
  let activated = false;
  const removed: string[] = [];
  const added: string[] = [];
  serviceMock.previewActivation = async () => ({
    results: [{ item: normalized, errors: [], warnings: [], status: 'valid', previewCode: 'B123', rowNo: 1 }],
  });
  serviceMock.getStock = async () => ({
    stockCode: 'B123',
    stockGuid: 'guid-B123',
    isPassive: !activated,
    imageUrl: '/uploads/products/existing.webp',
    hasMikroImage: true,
    hasExistingImage: true,
  });
  serviceMock.updateStock = async () => {
    activated = true;
    return { stockCode: 'B123', warnings: [], stock: { stockCode: 'B123', isPassive: false } };
  };
  prismaMock.product.findUnique = async () => ({ id: 'product-123', name: normalized.name });
  prismaMock.productFamilyItem.findMany = async () => [{ familyId: 'family-old' }];
  prismaMock.productFamily.findMany = async () => [{ id: 'family-new' }];
  familyMock.removeProductFromFamily = async (familyId: string) => {
    removed.push(familyId);
    return { removed: true };
  };
  familyMock.addProductToFamily = async (familyId: string) => {
    added.push(familyId);
    return {};
  };

  const result = await stockCreateService.activateStock({
    stockCode: 'B123',
    item: validActivationInput,
    stockFamilyIds: ['family-new'],
  });

  assert.equal(result.success, true);
  assert.deepEqual(removed, ['family-old']);
  assert.deepEqual(added, ['family-new']);

  activated = false;
  removed.length = 0;
  added.length = 0;
  prismaMock.productFamily.findMany = async () => [];

  const staleResult = await stockCreateService.activateStock({
    stockCode: 'B123',
    item: validActivationInput,
    stockFamilyIds: ['family-stale'],
  });

  assert.deepEqual(removed, []);
  assert.deepEqual(added, []);
  assert.match(staleResult.warnings.join(' | '), /mevcut aileler korundu/);
});

test('activation moves the product to the selected price family', async () => {
  const normalized = serviceMock.normalizeItem(validActivationInput, 1);
  let activated = false;
  let upsertData: any = null;
  serviceMock.previewActivation = async () => ({
    results: [{ item: normalized, errors: [], warnings: [], status: 'valid', previewCode: 'B123', rowNo: 1 }],
  });
  serviceMock.getStock = async () => ({
    stockCode: 'B123',
    stockGuid: 'guid-B123',
    isPassive: !activated,
    imageUrl: '/uploads/products/existing.webp',
    hasMikroImage: true,
    hasExistingImage: true,
  });
  serviceMock.updateStock = async () => {
    activated = true;
    return { stockCode: 'B123', warnings: [], stock: { stockCode: 'B123', isPassive: false } };
  };
  prismaMock.product.findUnique = async () => ({ id: 'product-123', name: normalized.name });
  prismaMock.priceFamily.findFirst = async () => ({ id: 'price-new' });
  prismaMock.$transaction = async (callback: any) => callback({
    priceFamilyItem: {
      findUnique: async () => ({ familyId: 'price-old', priority: 2 }),
      aggregate: async () => ({ _max: { priority: 4 } }),
      upsert: async (args: any) => {
        upsertData = args;
        return {};
      },
      deleteMany: async () => ({ count: 0 }),
    },
  });

  const result = await stockCreateService.activateStock({
    stockCode: 'B123',
    item: validActivationInput,
    priceFamilyId: 'price-new',
  });

  assert.equal(result.success, true);
  assert.equal(upsertData.where.productCode, 'B123');
  assert.equal(upsertData.update.familyId, 'price-new');
  assert.equal(upsertData.update.priority, 5);
  assert.equal(upsertData.create.priority, 5);

  activated = false;
  upsertData = null;
  prismaMock.$transaction = async (callback: any) => callback({
    priceFamilyItem: {
      findUnique: async () => ({ familyId: 'price-new', priority: 2 }),
      aggregate: async () => ({ _max: { priority: 9 } }),
      upsert: async (args: any) => {
        upsertData = args;
        return {};
      },
      deleteMany: async () => ({ count: 0 }),
    },
  });

  await stockCreateService.activateStock({
    stockCode: 'B123',
    item: validActivationInput,
    priceFamilyId: 'price-new',
  });

  assert.equal(upsertData.update.priority, 2);
});

test('replacement image failure after activation keeps the existing image and returns success with a warning', async () => {
  const normalized = serviceMock.normalizeItem(validActivationInput, 1);
  let activated = false;
  let updateCalledBeforeImageWrite = false;
  serviceMock.previewActivation = async () => ({
    results: [{ item: normalized, errors: [], warnings: [], status: 'valid', previewCode: 'B123', rowNo: 1 }],
  });
  serviceMock.getStock = async () => ({
    stockCode: 'B123',
    stockGuid: 'guid-B123',
    isPassive: !activated,
    imageUrl: '/uploads/products/existing.webp',
    hasMikroImage: true,
    hasExistingImage: true,
  });
  serviceMock.updateStock = async () => {
    activated = true;
    return { stockCode: 'B123', warnings: [], stock: { stockCode: 'B123', isPassive: false } };
  };
  imageMock.processUploadedProductImage = async () => ({
    imageUrl: '/uploads/products/B123-new.webp',
    filePath: 'B123-new.webp',
    checksum: 'checksum',
    buffer: Buffer.from('image'),
    sizeBytes: 5,
    filename: 'B123-new.webp',
  });
  imageMock.uploadImageToMikro = async () => {
    updateCalledBeforeImageWrite = activated;
    throw new Error('mikro image write failed');
  };
  imageMock.removeLocalFile = async () => {};
  prismaMock.product.findUnique = async () => ({ id: 'product-123', name: normalized.name });

  const result = await stockCreateService.activateStock({
    stockCode: 'B123',
    item: validActivationInput,
    imageFile: { path: 'temp-image.jpg', filename: 'temp-image.jpg' } as any,
  });

  assert.equal(updateCalledBeforeImageWrite, true);
  assert.equal(result.success, true);
  assert.equal(result.stock.isPassive, false);
  assert.match(result.warnings.join(' | '), /mevcut gorsel korundu/);
});

test('a missing-image stock is not activated unless the Mikro image write is independently verified', async () => {
  const normalized = serviceMock.normalizeItem(validActivationInput, 1);
  let updateCalled = false;
  serviceMock.previewActivation = async () => ({
    results: [{ item: normalized, errors: [], warnings: [], status: 'valid', previewCode: 'B123', rowNo: 1 }],
  });
  serviceMock.getStock = async () => ({
    stockCode: 'B123',
    stockGuid: 'guid-B123',
    isPassive: true,
    imageUrl: null,
    hasMikroImage: false,
    hasExistingImage: false,
  });
  serviceMock.getTemplate = async () => ({ hasMikroImage: false });
  serviceMock.updateStock = async () => {
    updateCalled = true;
    return { warnings: [] };
  };
  imageMock.processUploadedProductImage = async () => ({
    imageUrl: '/uploads/products/B123-new.webp',
    filePath: 'B123-new.webp',
    checksum: 'checksum',
    buffer: Buffer.from('image'),
    sizeBytes: 5,
    filename: 'B123-new.webp',
  });
  imageMock.uploadImageToMikro = async () => {};
  imageMock.removeLocalFile = async () => {};

  await assert.rejects(
    () => stockCreateService.activateStock({
      stockCode: 'B123',
      item: validActivationInput,
      imageFile: { path: 'temp-image.jpg', filename: 'temp-image.jpg' } as any,
    }),
    /Mikro gorsel yazimi bagimsiz kontrolde dogrulanamadi/
  );
  assert.equal(updateCalled, false);
});

test('a required image upload failure stops before the passive stock is activated', async () => {
  const normalized = serviceMock.normalizeItem(validActivationInput, 1);
  let updateCalled = false;
  serviceMock.previewActivation = async () => ({
    results: [{ item: normalized, errors: [], warnings: [], status: 'valid', previewCode: 'B123', rowNo: 1 }],
  });
  serviceMock.getStock = async () => ({
    stockCode: 'B123',
    stockGuid: 'guid-B123',
    isPassive: true,
    imageUrl: null,
    hasMikroImage: false,
    hasExistingImage: false,
  });
  serviceMock.updateStock = async () => {
    updateCalled = true;
    return { warnings: [] };
  };
  imageMock.processUploadedProductImage = async () => {
    throw new Error('image conversion failed');
  };

  await assert.rejects(
    () => stockCreateService.activateStock({
      stockCode: 'B123',
      item: validActivationInput,
      imageFile: { path: 'temp-image.jpg', filename: 'temp-image.jpg' } as any,
    }),
    /Gorsel yuklenemedi; stok aktiflestirilmedi/
  );
  assert.equal(updateCalled, false);
});
