import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveCustomerPriceLists,
  resolveCustomerPriceListsForProduct,
  resolvePhysicalPriceListNoForPriceType,
} from './customerPricing';

test('customer resolver accepts tier six through explicit plane membership', () => {
  assert.deepEqual(
    resolveCustomerPriceLists({
      invoicedPriceListNo: 13,
      whitePriceListNo: 14,
    }),
    { invoiced: 13, white: 14 }
  );
});

test('customer resolver rejects campaigns, cross-plane and unknown numbers', () => {
  assert.deepEqual(
    resolveCustomerPriceLists({
      invoicedPriceListNo: 14,
      whitePriceListNo: 13,
    }),
    { invoiced: 6, white: 1 }
  );

  assert.deepEqual(
    resolveCustomerPriceLists({
      invoicedPriceListNo: 11,
      whitePriceListNo: 12,
    }),
    { invoiced: 6, white: 1 }
  );

  assert.deepEqual(
    resolveCustomerPriceLists({
      invoicedPriceListNo: 999,
      whitePriceListNo: -1,
    }),
    { invoiced: 6, white: 1 }
  );
});

test('product-specific rules support tier six and preserve safe base fallbacks', () => {
  const base = { invoiced: 6, white: 1 };
  const product = { brandCode: 'GREEN', categoryId: 'category-1' };

  assert.deepEqual(
    resolveCustomerPriceListsForProduct(
      base,
      [{
        brandCode: 'green',
        invoicedPriceListNo: 13,
        whitePriceListNo: 14,
      }],
      product
    ),
    { invoiced: 13, white: 14 }
  );

  assert.deepEqual(
    resolveCustomerPriceListsForProduct(
      base,
      [{
        brandCode: 'GREEN',
        invoicedPriceListNo: 14,
        whitePriceListNo: 13,
      }],
      product
    ),
    base
  );
});

test('order-request conversion preserves F6/P6 physical list audit by selected plane', () => {
  const pair = resolveCustomerPriceListsForProduct(
    { invoiced: 6, white: 1 },
    [{
      brandCode: 'GREEN',
      invoicedPriceListNo: 13,
      whitePriceListNo: 14,
    }],
    { brandCode: 'green' }
  );

  assert.equal(resolvePhysicalPriceListNoForPriceType(pair, 'INVOICED'), 13);
  assert.equal(resolvePhysicalPriceListNoForPriceType(pair, 'WHITE'), 14);
});

test('physical list selection rejects cross-plane and campaign values', () => {
  assert.throws(
    () => resolvePhysicalPriceListNoForPriceType({ invoiced: 14, white: 1 }, 'INVOICED'),
    /Invalid INVOICED physical price list/
  );
  assert.throws(
    () => resolvePhysicalPriceListNoForPriceType({ invoiced: 6, white: 11 }, 'WHITE'),
    /Invalid WHITE physical price list/
  );
});
