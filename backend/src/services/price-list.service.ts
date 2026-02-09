/**
 * Price List Service
 *
 * Reads Mikro list prices from product_price_stats and returns numeric values.
 */

import { Prisma } from '@prisma/client';
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
};

const PRICE_LIST_FIELDS: Record<number, string> = {
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
    if (!stats) return 0;
    const field = PRICE_LIST_FIELDS[listNo];
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
    if (!Number.isFinite(listNo)) return 0;

    const min = range?.min ?? (listNo <= 5 ? 1 : 6);
    const max = range?.max ?? (listNo <= 5 ? 5 : 10);
    const start = Math.min(Math.max(listNo - 1, min), max);

    for (let i = start; i >= min; i -= 1) {
      const price = this.getListPrice(stats, i);
      if (price > 0) return price;
    }

    return 0;
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

    return rows[0] || null;
  }
}

export default new PriceListService();
