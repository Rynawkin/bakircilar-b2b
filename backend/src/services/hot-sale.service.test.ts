import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHotSaleRequestHash,
  deterministicHotSaleLineGuid,
  resolveHotSaleLinePriceListNo,
  validateHotSaleTransactionInput,
} from './hot-sale.service';
import { deterministicMikroOrderLineGuid } from './mikro.service';

const tierSixCustomer = {
  invoicedPriceListNo: 13,
  whitePriceListNo: 14,
  priceListRules: [],
};
const validOperationKey = '11111111-1111-4111-8111-111111111111';

test('hot sale keeps legacy anonymous defaults but uses selected customer F6/P6', () => {
  assert.equal(
    resolveHotSaleLinePriceListNo({
      plane: 'RETAIL',
      anonymousDefaultPriceListNo: 5,
    }),
    5
  );
  assert.equal(
    resolveHotSaleLinePriceListNo({
      plane: 'INVOICED',
      anonymousDefaultPriceListNo: 6,
    }),
    6
  );
  assert.equal(
    resolveHotSaleLinePriceListNo({
      plane: 'RETAIL',
      anonymousDefaultPriceListNo: 5,
      customer: tierSixCustomer,
    }),
    14
  );
  assert.equal(
    resolveHotSaleLinePriceListNo({
      plane: 'INVOICED',
      anonymousDefaultPriceListNo: 6,
      customer: tierSixCustomer,
    }),
    13
  );
});

test('hot sale resolves product-specific customer rule before implicit base list', () => {
  const customer = {
    invoicedPriceListNo: 6,
    whitePriceListNo: 1,
    priceListRules: [{
      brandCode: 'GREEN',
      invoicedPriceListNo: 13,
      whitePriceListNo: 14,
    }],
  };

  assert.equal(
    resolveHotSaleLinePriceListNo({
      plane: 'INVOICED',
      anonymousDefaultPriceListNo: 6,
      customer,
      product: { brandCode: 'green' },
    }),
    13
  );
  assert.equal(
    resolveHotSaleLinePriceListNo({
      plane: 'RETAIL',
      anonymousDefaultPriceListNo: 5,
      customer,
      product: { brandCode: 'GREEN' },
    }),
    14
  );
});

test('explicit line override wins over transaction override and customer assignment', () => {
  assert.equal(
    resolveHotSaleLinePriceListNo({
      plane: 'INVOICED',
      anonymousDefaultPriceListNo: 6,
      customer: tierSixCustomer,
      transactionPriceListNo: 10,
      itemPriceListNo: 9,
    }),
    9
  );
});

test('hot sale rejects campaign and cross-plane explicit overrides', () => {
  assert.throws(
    () => resolveHotSaleLinePriceListNo({
      plane: 'INVOICED',
      anonymousDefaultPriceListNo: 6,
      transactionPriceListNo: 11,
    }),
    /Gecersiz faturali fiyat listesi/
  );
  assert.throws(
    () => resolveHotSaleLinePriceListNo({
      plane: 'RETAIL',
      anonymousDefaultPriceListNo: 5,
      itemPriceListNo: 13,
    }),
    /Gecersiz perakende fiyat listesi/
  );
});

test('hot sale write input rejects unsupported type before service side effects', () => {
  assert.throws(
    () => validateHotSaleTransactionInput({
      operationKey: validOperationKey,
      type: 'ORDER_DELIVERY',
      items: [{ productCode: 'STK-1', quantity: 1 }],
    }),
    /Gecersiz sicak satis islem tipi/
  );
  assert.throws(
    () => validateHotSaleTransactionInput({
      operationKey: validOperationKey,
      type: 'UNKNOWN',
      items: [{ productCode: 'STK-1', quantity: 1 }],
    }),
    /Gecersiz sicak satis islem tipi/
  );
});

test('hot sale write input validates payment, item and plane before writes', () => {
  assert.throws(
    () => validateHotSaleTransactionInput({
      operationKey: validOperationKey,
      type: 'CASH_INVOICE',
      paymentType: 'CHEQUE',
      items: [{ productCode: 'STK-1', quantity: 1 }],
    }),
    /Gecersiz sicak satis odeme tipi/
  );
  assert.throws(
    () => validateHotSaleTransactionInput({
      operationKey: validOperationKey,
      type: 'CASH_INVOICE',
      priceListNo: 13,
      items: [{ productCode: 'STK-1', quantity: 1 }],
    }),
    /Fiyat listesi satis tipiyle uyusmuyor/
  );
  assert.throws(
    () => validateHotSaleTransactionInput({
      operationKey: validOperationKey,
      type: 'INVOICED_DISPATCH',
      items: [{ productCode: 'STK-1', quantity: 0 }],
    }),
    /Gecersiz sicak satis kalemi/
  );
});

test('hot sale request hash is stable but detects pricing and payment changes', () => {
  const base = {
    operationKey: validOperationKey,
    type: 'CASH_INVOICE',
    customerCode: ' 120.01.005 ',
    items: [{
      productCode: ' stk-1 ',
      quantity: 2,
      unit: 'adet',
      unitPrice: 25,
      priceListNo: 14,
    }],
    payments: [{ type: 'CASH', amount: 50 }],
  };

  assert.equal(buildHotSaleRequestHash(base), buildHotSaleRequestHash(base));
  assert.notEqual(
    buildHotSaleRequestHash(base),
    buildHotSaleRequestHash({
      ...base,
      items: [{ ...base.items[0], unitPrice: 26 }],
    })
  );
  assert.notEqual(
    buildHotSaleRequestHash(base),
    buildHotSaleRequestHash({
      ...base,
      payments: [{ type: 'CARD', amount: 50 }],
    })
  );
  assert.notEqual(
    buildHotSaleRequestHash(base),
    buildHotSaleRequestHash({
      ...base,
      items: [{
        productCode: base.items[0].productCode,
        quantity: base.items[0].quantity,
        unit: base.items[0].unit,
      }],
    })
  );
});

test('hot sale stock line GUIDs are namespaced, stable and never reuse the raw operation key', () => {
  const first = deterministicHotSaleLineGuid(validOperationKey, 0);
  assert.equal(first, deterministicHotSaleLineGuid(validOperationKey, 0));
  assert.notEqual(first, validOperationKey);
  assert.notEqual(first, deterministicHotSaleLineGuid(validOperationKey, 1));
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('Mikro order line GUIDs are stable per operation side and line', () => {
  const invoicedKey = `${validOperationKey}:INVOICED`;
  const first = deterministicMikroOrderLineGuid(invoicedKey, 0);
  assert.equal(first, deterministicMikroOrderLineGuid(invoicedKey, 0));
  assert.notEqual(first, deterministicMikroOrderLineGuid(invoicedKey, 1));
  assert.notEqual(
    first,
    deterministicMikroOrderLineGuid(`${validOperationKey}:WHITE`, 0)
  );
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
