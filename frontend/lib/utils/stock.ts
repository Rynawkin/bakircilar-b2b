import { Product } from '@/types';

const toNumber = (value?: number | string | null) => {
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getWarehouseTotal = (product: Product) => {
  const warehouseStocks = product.warehouseStocks || {};
  const keyTotal = (key: string) => toNumber(warehouseStocks[key]);
  const hasPrimaryKeys = Object.prototype.hasOwnProperty.call(warehouseStocks, '1')
    || Object.prototype.hasOwnProperty.call(warehouseStocks, '6');
  const totals = hasPrimaryKeys
    ? keyTotal('1') + keyTotal('6')
    : Object.values(warehouseStocks).reduce((sum, value) => sum + toNumber(value), 0);
  const baseStock = toNumber(product.availableStock);
  const excessStock = toNumber(product.excessStock);
  return Math.max(totals, baseStock, excessStock);
};

export const getDisplayStock = (product: Product) => {
  return getWarehouseTotal(product);
};

export const getMaxOrderQuantity = (product: Product, mode: 'LIST' | 'EXCESS' = 'LIST') => {
  const totalStock = getWarehouseTotal(product);
  const baseStock = mode === 'EXCESS' ? toNumber(product.excessStock) || totalStock : totalStock;
  return toNumber(product.maxOrderQuantity) || baseStock;
};
