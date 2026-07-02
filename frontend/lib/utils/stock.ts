import { Product } from '@/types';

const toNumber = (value?: number | string | null) => {
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

// Depo adindan/kodundan warehouseStocks anahtarini bul ("1", "6" gibi).
const resolveWarehouseKey = (warehouseStocks: Record<string, number>, warehouse: string) => {
  if (Object.prototype.hasOwnProperty.call(warehouseStocks, warehouse)) return warehouse;
  const match = String(warehouse).match(/\d+/);
  return match ? match[0] : warehouse;
};

export const getWarehouseTotal = (product: Product, warehouse?: string) => {
  const warehouseStocks = product.warehouseStocks || {};
  // Secili depo varsa SADECE o deponun stogu gosterilir.
  if (warehouse) {
    const key = resolveWarehouseKey(warehouseStocks, warehouse);
    return toNumber(warehouseStocks[key]);
  }
  const keyTotal = (key: string) => toNumber(warehouseStocks[key]);
  const hasPrimaryKeys = Object.prototype.hasOwnProperty.call(warehouseStocks, '1')
    || Object.prototype.hasOwnProperty.call(warehouseStocks, '6');
  const totals = hasPrimaryKeys
    ? keyTotal('1') + keyTotal('6')
    : Object.values(warehouseStocks).reduce((sum, value) => sum + toNumber(value), 0);
  // availableStock/excessStock ile sisirme yapilmaz; depo kirilimi hic yoksa
  // API'nin verdigi kullanilabilir stoga dusulur.
  return Object.keys(warehouseStocks).length > 0 ? totals : toNumber(product.availableStock);
};

export const getDisplayStock = (product: Product, warehouse?: string) => {
  return getWarehouseTotal(product, warehouse);
};

export const getMaxOrderQuantity = (product: Product, mode: 'LIST' | 'EXCESS' = 'LIST') => {
  const totalStock = getWarehouseTotal(product);
  const baseStock = mode === 'EXCESS' ? toNumber(product.excessStock) || totalStock : totalStock;
  return toNumber(product.maxOrderQuantity) || baseStock;
};
