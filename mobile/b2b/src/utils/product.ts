import { Product } from '../types';

export type CustomerPriceType = 'INVOICED' | 'WHITE';

export function getProductStock(product: Product) {
  const stocks = product.warehouseStocks || {};
  const numeric = (value: unknown) => (typeof value === 'number' ? value : Number(value) || 0);
  const hasPrimary = Object.prototype.hasOwnProperty.call(stocks, '1')
    || Object.prototype.hasOwnProperty.call(stocks, '6');
  const warehouseTotal = hasPrimary
    ? numeric(stocks['1']) + numeric(stocks['6'])
    : Object.values(stocks).reduce<number>((sum, value) => sum + numeric(value), 0);
  return Math.max(warehouseTotal, Number(product.availableStock || 0), Number(product.excessStock || 0));
}

export function getProductMaxQuantity(product: Product) {
  const stock = getProductStock(product);
  const applicableStock = product.pricingMode === 'EXCESS'
    ? Number(product.excessStock ?? stock)
    : stock;
  return Math.max(0, Number(product.maxOrderQuantity ?? applicableStock));
}

export function getProductRawPrice(product: Product, priceType: CustomerPriceType) {
  if (product.agreement) {
    return priceType === 'INVOICED'
      ? Number(product.agreement.priceInvoiced || 0)
      : Number(product.agreement.priceWhite || 0);
  }
  if (product.pricingMode === 'EXCESS' && product.excessPrices) {
    return priceType === 'INVOICED'
      ? Number(product.excessPrices.invoiced || product.prices?.invoiced || 0)
      : Number(product.excessPrices.white || product.prices?.white || 0);
  }
  return priceType === 'INVOICED'
    ? Number(product.prices?.invoiced || 0)
    : Number(product.prices?.white || 0);
}

export function getProductListPrice(product: Product, priceType: CustomerPriceType) {
  return priceType === 'INVOICED'
    ? Number(product.listPrices?.invoiced || 0)
    : Number(product.listPrices?.white || 0);
}

export function hasVisibleDiscount(product: Product, priceType: CustomerPriceType) {
  const list = getProductListPrice(product, priceType);
  const current = getProductRawPrice(product, priceType);
  return list > current && current > 0;
}
