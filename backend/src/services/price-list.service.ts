/**
 * Price List Service
 *
 * Reads Mikro list prices from product_price_stats and returns numeric values.
 */

import { Prisma } from '@prisma/client';
import {
  getPriceListDefinition,
  getPriceListFallbackChain,
  SYNC_PRICE_LIST_NOS,
} from '../config/price-list-registry';
import { prisma } from '../utils/prisma';

type PriceStatsRow = {
  productCode: string;
  currentPriceList1: number | null;
  currentPriceList2: number | null;
  currentPriceList3: number | null;
  currentPriceList4: number | null;
  currentPriceList5: number | null;
  currentPriceList6: number | null;
  currentPriceList7: number | null;
  currentPriceList8: number | null;
  currentPriceList9: number | null;
  currentPriceList10: number | null;
  currentPricesByList?: Map<number, number>;
};

type NormalizedPriceRow = {
  productCode: string;
  priceListNo: number;
  currentPrice: number | string | { toNumber(): number } | null;
};

const LEGACY_PRICE_LIST_FIELDS: Record<number, string> = {
  1: 'currentPriceList1',
  2: 'currentPriceList2',
  3: 'currentPriceList3',
  4: 'currentPriceList4',
  5: 'currentPriceList5',
  6: 'currentPriceList6',
  7: 'currentPriceList7',
  8: 'currentPriceList8',
  9: 'currentPriceList9',
  10: 'currentPriceList10',
};

const toNumber = (value: any): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || 0;
  if (typeof value === 'object' && typeof value.toNumber === 'function') {
    return value.toNumber();
  }
  return Number(value) || 0;
};

class PriceListService {
  getListPrice(stats: any | null, listNo: number): number {
    if (!stats || !getPriceListDefinition(listNo)) return 0;

    const normalizedPrices = stats.currentPricesByList;
    if (normalizedPrices instanceof Map && normalizedPrices.has(listNo)) {
      return toNumber(normalizedPrices.get(listNo));
    }

    const field = LEGACY_PRICE_LIST_FIELDS[listNo];
    if (!field) return 0;
    return toNumber((stats as any)[field]);
  }

  getListPriceWithFallback(
    stats: any | null,
    listNo: number,
    range?: { min?: number; max?: number }
  ): number {
    const primary = this.getListPrice(stats, listNo);
    if (primary > 0) return primary;
    if (!getPriceListDefinition(listNo)) return 0;

    const fallbackListNos = getPriceListFallbackChain(listNo).filter((fallbackListNo) => {
      if (range?.min !== undefined && fallbackListNo < range.min) return false;
      if (range?.max !== undefined && fallbackListNo > range.max) return false;
      return true;
    });

    for (const fallbackListNo of fallbackListNos) {
      const price = this.getListPrice(stats, fallbackListNo);
      if (price > 0) return price;
    }

    return 0;
  }

  private async getNormalizedPricesMap(
    productCodes: string[]
  ): Promise<Map<string, Map<number, number>>> {
    if (productCodes.length === 0) return new Map();

    const rows = await prisma.$queryRaw<NormalizedPriceRow[]>(Prisma.sql`
      SELECT
        product_code AS "productCode",
        price_list_no AS "priceListNo",
        current_price AS "currentPrice"
      FROM product_price_list_current
      WHERE product_code IN (${Prisma.join(productCodes)})
        AND price_list_no IN (${Prisma.join([...SYNC_PRICE_LIST_NOS])})
    `);

    const byProduct = new Map<string, Map<number, number>>();
    for (const row of rows) {
      if (!byProduct.has(row.productCode)) {
        byProduct.set(row.productCode, new Map());
      }
      byProduct.get(row.productCode)!.set(Number(row.priceListNo), toNumber(row.currentPrice));
    }
    return byProduct;
  }

  async getPriceStatsMap(productCodes: string[]): Promise<Map<string, any>> {
    if (productCodes.length === 0) {
      return new Map();
    }

    const uniqueCodes = Array.from(new Set(productCodes.filter(Boolean)));
    if (uniqueCodes.length === 0) return new Map();

    const stats = await prisma.$queryRaw<PriceStatsRow[]>(Prisma.sql`
      SELECT
        product_code AS "productCode",
        current_price_list_1 AS "currentPriceList1",
        current_price_list_2 AS "currentPriceList2",
        current_price_list_3 AS "currentPriceList3",
        current_price_list_4 AS "currentPriceList4",
        current_price_list_5 AS "currentPriceList5",
        current_price_list_6 AS "currentPriceList6",
        current_price_list_7 AS "currentPriceList7",
        current_price_list_8 AS "currentPriceList8",
        current_price_list_9 AS "currentPriceList9",
        current_price_list_10 AS "currentPriceList10"
      FROM product_price_stats
      WHERE product_code IN (${Prisma.join(uniqueCodes)})
    `);

    const normalizedPrices = await this.getNormalizedPricesMap(uniqueCodes);
    for (const row of stats) {
      row.currentPricesByList = normalizedPrices.get(row.productCode) ?? new Map();
    }

    return new Map(stats.map((row) => [row.productCode, row]));
  }

  async getPriceStats(productCode: string): Promise<any | null> {
    if (!productCode) return null;
    const rows = await prisma.$queryRaw<PriceStatsRow[]>(Prisma.sql`
      SELECT
        product_code AS "productCode",
        current_price_list_1 AS "currentPriceList1",
        current_price_list_2 AS "currentPriceList2",
        current_price_list_3 AS "currentPriceList3",
        current_price_list_4 AS "currentPriceList4",
        current_price_list_5 AS "currentPriceList5",
        current_price_list_6 AS "currentPriceList6",
        current_price_list_7 AS "currentPriceList7",
        current_price_list_8 AS "currentPriceList8",
        current_price_list_9 AS "currentPriceList9",
        current_price_list_10 AS "currentPriceList10"
      FROM product_price_stats
      WHERE product_code = ${productCode}
      LIMIT 1
    `);

    const row = rows[0];
    if (!row) return null;

    const normalizedPrices = await this.getNormalizedPricesMap([productCode]);
    row.currentPricesByList = normalizedPrices.get(productCode) ?? new Map();
    return row;
  }
}

export default new PriceListService();
