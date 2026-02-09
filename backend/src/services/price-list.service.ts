/**
 * Price List Service
 *
 * Reads Mikro list prices from product_price_stats and returns numeric values.
 */

import { prisma } from '../utils/prisma';

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

    const stats = await prisma.productPriceStat.findMany({
      where: { productCode: { in: productCodes } },
      select: {
        productCode: true,
        currentPriceList1: true,
        currentPriceList2: true,
        currentPriceList3: true,
        currentPriceList4: true,
        currentPriceList5: true,
        currentPriceList6: true,
        currentPriceList7: true,
        currentPriceList8: true,
        currentPriceList9: true,
        currentPriceList10: true,
      },
    });

    return new Map(stats.map((row) => [row.productCode, row]));
  }

  async getPriceStats(productCode: string): Promise<any | null> {
    if (!productCode) return null;
    return prisma.productPriceStat.findUnique({
      where: { productCode },
      select: {
        productCode: true,
        currentPriceList1: true,
        currentPriceList2: true,
        currentPriceList3: true,
        currentPriceList4: true,
        currentPriceList5: true,
        currentPriceList6: true,
        currentPriceList7: true,
        currentPriceList8: true,
        currentPriceList9: true,
        currentPriceList10: true,
      },
    });
  }
}

export default new PriceListService();
