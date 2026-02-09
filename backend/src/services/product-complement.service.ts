import mikroService from './mikroFactory.service';
import { prisma } from '../utils/prisma';
import { cacheService } from './cache.service';

const COMPLEMENT_LIMIT = 10;
const INITIAL_WINDOW_MONTHS = 24;
const REGULAR_WINDOW_MONTHS = 6;
const MANUAL_WEIGHT = 10000;
const CODE_BATCH_SIZE = 5000;

type ComplementEntry = { code: string; count: number };

const normalizeCode = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().toUpperCase();
};

const buildDocKey = (row: any): string => {
  const docType = row?.docType ?? row?.sth_evraktip ?? '';
  const docSeries = row?.docSeries ?? row?.sth_evrakno_seri ?? '';
  const docNumber = row?.docNumber ?? row?.sth_evrakno_sira ?? '';
  return `${docType}|${docSeries}|${docNumber}`;
};

const getDateOnly = (value: Date): string => value.toISOString().slice(0, 10);

const subtractMonths = (value: Date, months: number): Date => {
  const next = new Date(value);
  next.setMonth(next.getMonth() - months);
  return next;
};

const chunkArray = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

class ProductComplementService {
  async syncAutoRecommendations(params?: { months?: number; limit?: number }) {
    const existing = await prisma.productComplementAuto.findFirst({
      select: { id: true },
    });
    const windowMonths = params?.months ?? (existing ? REGULAR_WINDOW_MONTHS : INITIAL_WINDOW_MONTHS);
    const limit = params?.limit ?? COMPLEMENT_LIMIT;
    const windowEnd = new Date();
    const windowStart = subtractMonths(windowEnd, windowMonths);
    const startDate = getDateOnly(windowStart);
    const endDate = getDateOnly(windowEnd);

    const query = `
      SELECT
        sth_evraktip as docType,
        sth_evrakno_seri as docSeries,
        sth_evrakno_sira as docNumber,
        RTRIM(sth_stok_kod) as productCode
      FROM STOK_HAREKETLERI
      WHERE
        sth_tip = 1
        AND sth_cins = 0
        AND sth_tarih >= '${startDate}'
        AND sth_tarih < '${endDate}'
        AND sth_evraktip IN (1, 4)
        AND sth_stok_kod IS NOT NULL
        AND LTRIM(RTRIM(sth_stok_kod)) <> ''
        AND (sth_iptal = 0 OR sth_iptal IS NULL)
    `;

    const rows = await mikroService.executeQuery(query);
    const docMap = new Map<string, Set<string>>();

    for (const row of rows) {
      const code = normalizeCode(row.productCode);
      if (!code) continue;
      const docKey = buildDocKey(row);
      if (!docKey) continue;
      const existingSet = docMap.get(docKey);
      if (existingSet) {
        existingSet.add(code);
      } else {
        docMap.set(docKey, new Set([code]));
      }
    }

    const pairCounts = new Map<string, number>();
    const relatedMap = new Map<string, Map<string, number>>();

    for (const codesSet of docMap.values()) {
      const codes = Array.from(codesSet);
      if (codes.length < 2) {
        continue;
      }
      for (let i = 0; i < codes.length - 1; i += 1) {
        for (let j = i + 1; j < codes.length; j += 1) {
          const a = codes[i];
          const b = codes[j];
          if (a === b) continue;
          const [left, right] = a < b ? [a, b] : [b, a];
          const key = `${left}::${right}`;
          pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
        }
      }
    }

    for (const [key, count] of pairCounts.entries()) {
      const [left, right] = key.split('::');
      if (!left || !right) continue;
      const leftMap = relatedMap.get(left) || new Map<string, number>();
      leftMap.set(right, count);
      relatedMap.set(left, leftMap);
      const rightMap = relatedMap.get(right) || new Map<string, number>();
      rightMap.set(left, count);
      relatedMap.set(right, rightMap);
    }

    const recommendationsByCode = new Map<string, ComplementEntry[]>();
    const allCodes = new Set<string>();

    for (const [productCode, relMap] of relatedMap.entries()) {
      const entries = Array.from(relMap.entries())
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count);
      const topEntries = entries.slice(0, limit);
      if (topEntries.length === 0) continue;
      recommendationsByCode.set(productCode, topEntries);
      allCodes.add(productCode);
      topEntries.forEach((entry) => allCodes.add(entry.code));
    }

    const codeList = Array.from(allCodes);
    const codeToId = new Map<string, string>();

    for (const chunk of chunkArray(codeList, CODE_BATCH_SIZE)) {
      if (chunk.length === 0) continue;
      const products = await prisma.product.findMany({
        where: { mikroCode: { in: chunk } },
        select: { id: true, mikroCode: true },
      });
      products.forEach((product) => {
        codeToId.set(normalizeCode(product.mikroCode), product.id);
      });
    }

    const data: Array<{
      productId: string;
      relatedProductId: string;
      pairCount: number;
      rank: number;
      windowStart: Date;
      windowEnd: Date;
    }> = [];

    for (const [productCode, entries] of recommendationsByCode.entries()) {
      const productId = codeToId.get(normalizeCode(productCode));
      if (!productId) continue;
      let rank = 1;
      for (const entry of entries) {
        const relatedId = codeToId.get(normalizeCode(entry.code));
        if (!relatedId || relatedId === productId) continue;
        data.push({
          productId,
          relatedProductId: relatedId,
          pairCount: entry.count,
          rank,
          windowStart,
          windowEnd,
        });
        rank += 1;
      }
    }

    await prisma.$transaction([
      prisma.productComplementAuto.deleteMany({}),
      ...(data.length > 0 ? [prisma.productComplementAuto.createMany({ data })] : []),
    ]);

    await cacheService.deletePattern('recommendations:*');

    return {
      windowMonths,
      totalDocuments: docMap.size,
      totalPairs: pairCounts.size,
      recordsWritten: data.length,
      windowStart,
      windowEnd,
    };
  }

  async getAdminComplements(productId: string) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, complementMode: true },
    });
    if (!product) {
      throw new Error('Product not found');
    }

    const [autoRows, manualRows] = await Promise.all([
      prisma.productComplementAuto.findMany({
        where: { productId },
        orderBy: { rank: 'asc' },
        include: {
          relatedProduct: {
            select: {
              id: true,
              name: true,
              mikroCode: true,
              imageUrl: true,
            },
          },
        },
      }),
      prisma.productComplementManual.findMany({
        where: { productId },
        orderBy: { sortOrder: 'asc' },
        include: {
          relatedProduct: {
            select: {
              id: true,
              name: true,
              mikroCode: true,
              imageUrl: true,
            },
          },
        },
      }),
    ]);

    return {
      mode: product.complementMode,
      limit: COMPLEMENT_LIMIT,
      auto: autoRows.map((row) => ({
        productId: row.relatedProductId,
        productCode: row.relatedProduct.mikroCode,
        productName: row.relatedProduct.name,
        imageUrl: row.relatedProduct.imageUrl,
        pairCount: row.pairCount,
        rank: row.rank,
      })),
      manual: manualRows.map((row) => ({
        productId: row.relatedProductId,
        productCode: row.relatedProduct.mikroCode,
        productName: row.relatedProduct.name,
        imageUrl: row.relatedProduct.imageUrl,
        sortOrder: row.sortOrder,
      })),
    };
  }

  async updateManualComplements(productId: string, manualProductIds: string[], mode?: 'AUTO' | 'MANUAL') {
    const normalizedIds = Array.from(
      new Set(
        manualProductIds
          .map((id) => id.trim())
          .filter((id) => id && id !== productId)
      )
    ).slice(0, COMPLEMENT_LIMIT);

    if (mode === 'AUTO') {
      await prisma.$transaction([
        prisma.productComplementManual.deleteMany({ where: { productId } }),
        prisma.product.update({
          where: { id: productId },
          data: { complementMode: 'AUTO' },
        }),
      ]);
      await cacheService.deletePattern('recommendations:*');
      return { mode: 'AUTO', manual: [] };
    }

    const nextMode = mode === 'MANUAL' ? 'MANUAL' : normalizedIds.length > 0 ? 'MANUAL' : 'AUTO';

    await prisma.$transaction(async (tx) => {
      if (nextMode === 'AUTO') {
        await tx.productComplementManual.deleteMany({ where: { productId } });
        await tx.product.update({
          where: { id: productId },
          data: { complementMode: 'AUTO' },
        });
        return;
      }

      const existing = await tx.productComplementManual.findMany({
        where: { productId },
        select: { relatedProductId: true },
      });
      const existingSet = new Set(existing.map((row) => row.relatedProductId));

      await tx.productComplementManual.deleteMany({
        where: {
          productId,
          relatedProductId: { notIn: normalizedIds },
        },
      });

      const toCreate = normalizedIds
        .filter((id) => !existingSet.has(id))
        .map((id, index) => ({
          productId,
          relatedProductId: id,
          sortOrder: index,
        }));

      if (toCreate.length > 0) {
        await tx.productComplementManual.createMany({ data: toCreate });
      }

      await Promise.all(
        normalizedIds.map((id, index) =>
          tx.productComplementManual.updateMany({
            where: { productId, relatedProductId: id },
            data: { sortOrder: index },
          })
        )
      );

      await tx.product.update({
        where: { id: productId },
        data: { complementMode: 'MANUAL' },
      });
    });

    await cacheService.deletePattern('recommendations:*');
    return { mode: nextMode, manual: normalizedIds };
  }

  async getRecommendationIdsForProduct(productId: string, limit = COMPLEMENT_LIMIT) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { complementMode: true },
    });
    if (!product) return [];

    if (product.complementMode === 'MANUAL') {
      const manualRows = await prisma.productComplementManual.findMany({
        where: { productId },
        orderBy: { sortOrder: 'asc' },
        take: limit,
        select: { relatedProductId: true },
      });
      if (manualRows.length > 0) {
        return manualRows.map((row) => row.relatedProductId);
      }
    }

    const autoRows = await prisma.productComplementAuto.findMany({
      where: { productId },
      orderBy: { rank: 'asc' },
      take: limit,
      select: { relatedProductId: true },
    });
    return autoRows.map((row) => row.relatedProductId);
  }

  async getRecommendationIdsForCart(productIds: string[], limit = COMPLEMENT_LIMIT) {
    const uniqueProductIds = Array.from(new Set(productIds.filter(Boolean)));
    if (uniqueProductIds.length === 0) return [];

    const products = await prisma.product.findMany({
      where: { id: { in: uniqueProductIds } },
      select: { id: true, complementMode: true },
    });
    const manualIds = products.filter((p) => p.complementMode === 'MANUAL').map((p) => p.id);
    const autoIds = products.filter((p) => p.complementMode !== 'MANUAL').map((p) => p.id);

    const [manualRows, autoRows] = await Promise.all([
      manualIds.length
        ? prisma.productComplementManual.findMany({
            where: { productId: { in: manualIds } },
            orderBy: { sortOrder: 'asc' },
            select: { productId: true, relatedProductId: true },
          })
        : Promise.resolve([]),
      autoIds.length
        ? prisma.productComplementAuto.findMany({
            where: { productId: { in: autoIds } },
            orderBy: { rank: 'asc' },
            select: { productId: true, relatedProductId: true, pairCount: true },
          })
        : Promise.resolve([]),
    ]);

    const scores = new Map<string, number>();

    manualRows.forEach((row) => {
      if (uniqueProductIds.includes(row.relatedProductId)) return;
      scores.set(row.relatedProductId, (scores.get(row.relatedProductId) || 0) + MANUAL_WEIGHT);
    });

    autoRows.forEach((row) => {
      if (uniqueProductIds.includes(row.relatedProductId)) return;
      const weight = Math.max(1, row.pairCount || 0);
      scores.set(row.relatedProductId, (scores.get(row.relatedProductId) || 0) + weight);
    });

    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([productId]) => productId);
  }

  async getRecommendationIdsByProduct(
    productIds: string[],
    limit = COMPLEMENT_LIMIT,
    excludeIds: string[] = []
  ): Promise<Record<string, string[]>> {
    const uniqueProductIds = Array.from(new Set(productIds.filter(Boolean)));
    if (uniqueProductIds.length === 0) return {};

    const products = await prisma.product.findMany({
      where: { id: { in: uniqueProductIds } },
      select: { id: true, complementMode: true },
    });

    const manualIds = products.filter((p) => p.complementMode === 'MANUAL').map((p) => p.id);
    const autoIds = products.filter((p) => p.complementMode !== 'MANUAL').map((p) => p.id);

    const [manualRows, autoRows] = await Promise.all([
      manualIds.length
        ? prisma.productComplementManual.findMany({
            where: { productId: { in: manualIds } },
            orderBy: [{ productId: 'asc' }, { sortOrder: 'asc' }],
            select: { productId: true, relatedProductId: true },
          })
        : Promise.resolve([]),
      uniqueProductIds.length
        ? prisma.productComplementAuto.findMany({
            where: { productId: { in: uniqueProductIds } },
            orderBy: [{ productId: 'asc' }, { rank: 'asc' }],
            select: { productId: true, relatedProductId: true },
          })
        : Promise.resolve([]),
    ]);

    const manualMap = new Map<string, string[]>();
    manualRows.forEach((row) => {
      const list = manualMap.get(row.productId) || [];
      list.push(row.relatedProductId);
      manualMap.set(row.productId, list);
    });

    const autoMap = new Map<string, string[]>();
    autoRows.forEach((row) => {
      const list = autoMap.get(row.productId) || [];
      list.push(row.relatedProductId);
      autoMap.set(row.productId, list);
    });

    const excludeSet = new Set(excludeIds.filter(Boolean));
    const result: Record<string, string[]> = {};

    products.forEach((product) => {
      const manualList = manualMap.get(product.id) || [];
      const autoList = autoMap.get(product.id) || [];
      const baseList = product.complementMode === 'MANUAL' && manualList.length > 0
        ? manualList
        : autoList;

      const filtered = baseList
        .filter((id) => id && id !== product.id && !excludeSet.has(id))
        .slice(0, limit);

      result[product.id] = filtered;
    });

    return result;
  }
}

export default new ProductComplementService();




