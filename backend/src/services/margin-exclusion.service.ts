/**
 * Margin Exclusion Service
 *
 * Marj raporu icin kullanici bazli dislama kurallari (marka / stok kodu / stok adi).
 * Kurallar rapor sayfasindan yonetilir ve OKUMA aninda uygulanir:
 * sync sirasinda satir silinmez, kural kapatilinca dislanan satirlar geri gelir.
 */

import { prisma } from '../utils/prisma';
import { AppError, ErrorCode } from '../types/errors';

export type MarginExclusionTypeValue = 'BRAND' | 'PRODUCT_CODE' | 'PRODUCT_NAME';

const MARGIN_EXCLUSION_TYPES: MarginExclusionTypeValue[] = ['BRAND', 'PRODUCT_CODE', 'PRODUCT_NAME'];

export interface CreateMarginExclusionData {
  type: MarginExclusionTypeValue;
  value: string;
  label?: string | null;
  note?: string | null;
  createdBy?: string | null;
}

interface ActiveMarginExclusion {
  id: string;
  type: MarginExclusionTypeValue;
  value: string;
}

// Stok adi eslesmesi icin sade normalizasyon: kucuk harf + turkce karakter
// sadelestirme + bosluk/ozel karakter silme. (reports.service'teki
// normalizeKeyToken'a paralel ama bagimsiz bir kopya - import cycle olmasin diye.)
const COMBINING_MARKS_REGEX = new RegExp('[\\u0300-\\u036f]', 'g');

const normalizeMatchToken = (value: unknown): string => {
  return String(value || '')
    .normalize('NFKD')
    .replace(COMBINING_MARKS_REGEX, '')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '');
};

const normalizeCode = (value: unknown): string => String(value || '').trim().toUpperCase();

const chunkArray = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

class MarginExclusionService {
  private activeCache: { expiresAt: number; exclusions: ActiveMarginExclusion[] } | null = null;
  private readonly activeCacheTtlMs = 60 * 1000;

  private invalidateCache(): void {
    this.activeCache = null;
  }

  /**
   * Tum kurallari listeler (aktif + pasif).
   */
  async list() {
    return prisma.marginExclusion.findMany({
      orderBy: [
        { type: 'asc' },
        { createdAt: 'desc' },
      ],
    });
  }

  /**
   * Yeni dislama kurali olusturur. Ayni type+value ile aktif kayit varsa 409 doner.
   */
  async create(data: CreateMarginExclusionData) {
    const type = data.type;
    if (!MARGIN_EXCLUSION_TYPES.includes(type)) {
      throw new AppError('Gecersiz dislama tipi. BRAND, PRODUCT_CODE veya PRODUCT_NAME olmali.', 400, ErrorCode.INVALID_INPUT);
    }

    const value = String(data.value || '').trim();
    if (!value) {
      throw new AppError('Dislama degeri bos olamaz.', 400, ErrorCode.MISSING_REQUIRED_FIELD);
    }

    const existing = await prisma.marginExclusion.findFirst({
      where: {
        type,
        active: true,
        value: { equals: value, mode: 'insensitive' },
      },
      select: { id: true },
    });

    if (existing) {
      throw new AppError('Bu deger icin zaten aktif bir dislama kurali var.', 409, ErrorCode.BAD_REQUEST, { existingId: existing.id });
    }

    const created = await prisma.marginExclusion.create({
      data: {
        type,
        value,
        label: data.label ? String(data.label).trim() : null,
        note: data.note ? String(data.note).trim() : null,
        createdBy: data.createdBy || null,
      },
    });

    this.invalidateCache();
    return created;
  }

  /**
   * Kurali siler (soft delete yok, gecmis veri zaten silinmedigi icin geri gelir).
   */
  async remove(id: string) {
    const exclusionId = String(id || '').trim();
    if (!exclusionId) {
      throw new AppError('Dislama kaydi id gerekli.', 400, ErrorCode.MISSING_REQUIRED_FIELD);
    }

    const existing = await prisma.marginExclusion.findUnique({ where: { id: exclusionId } });
    if (!existing) {
      throw new AppError('Dislama kaydi bulunamadi.', 404, ErrorCode.NOT_FOUND);
    }

    const deleted = await prisma.marginExclusion.delete({ where: { id: exclusionId } });
    this.invalidateCache();
    return deleted;
  }

  /**
   * Aktif kurallar (60 sn memory cache).
   */
  async getActiveExclusions(): Promise<ActiveMarginExclusion[]> {
    if (this.activeCache && this.activeCache.expiresAt > Date.now()) {
      return this.activeCache.exclusions;
    }

    const rows = await prisma.marginExclusion.findMany({
      where: { active: true },
      select: { id: true, type: true, value: true },
    });

    const exclusions: ActiveMarginExclusion[] = rows.map((row) => ({
      id: row.id,
      type: row.type as MarginExclusionTypeValue,
      value: row.value,
    }));

    this.activeCache = {
      expiresAt: Date.now() + this.activeCacheTtlMs,
      exclusions,
    };

    return exclusions;
  }

  /**
   * Aktif kural sayisi (e-posta dipnotu icin).
   */
  async getActiveExclusionCount(): Promise<number> {
    const exclusions = await this.getActiveExclusions();
    return exclusions.length;
  }

  /**
   * Marj rapor satirlarina aktif dislama kurallarini uygular.
   *
   * - PRODUCT_CODE: stok kodu birebir eslesme (trim + upper).
   * - PRODUCT_NAME: normalize edilmis stok adinda substring eslesme.
   * - BRAND: satirlarda marka bilgisi yok; distinct stok kodlari uzerinden
   *   Product.brandCode haritasi kurulur ve markasi dislanan satirlar duser.
   */
  async applyToMarginRows<T extends { data?: unknown }>(
    rows: T[],
    pickStockCode: (data: Record<string, any>) => string,
    pickStockName: (data: Record<string, any>) => string
  ): Promise<{ kept: T[]; excludedCount: number }> {
    if (!rows.length) {
      return { kept: rows, excludedCount: 0 };
    }

    const exclusions = await this.getActiveExclusions();
    if (!exclusions.length) {
      return { kept: rows, excludedCount: 0 };
    }

    const excludedCodes = new Set<string>();
    const excludedNameTokens: string[] = [];
    const excludedBrands = new Set<string>();

    exclusions.forEach((exclusion) => {
      if (exclusion.type === 'PRODUCT_CODE') {
        const code = normalizeCode(exclusion.value);
        if (code) excludedCodes.add(code);
      } else if (exclusion.type === 'PRODUCT_NAME') {
        const token = normalizeMatchToken(exclusion.value);
        if (token) excludedNameTokens.push(token);
      } else if (exclusion.type === 'BRAND') {
        const brand = normalizeCode(exclusion.value);
        if (brand) excludedBrands.add(brand);
      }
    });

    const getRowData = (row: T): Record<string, any> => {
      if (row && typeof row.data === 'object' && row.data !== null) {
        return row.data as Record<string, any>;
      }
      return {};
    };

    // BRAND kurali varsa: satirlardaki distinct stok kodlarini toplayip
    // Product tablosundan kod -> marka haritasi kur (1000'lik chunk).
    const brandByCode = new Map<string, string>();
    if (excludedBrands.size > 0) {
      const distinctCodes = new Map<string, string>(); // normalize -> orijinal (trim)
      rows.forEach((row) => {
        const rawCode = String(pickStockCode(getRowData(row)) || '').trim();
        if (!rawCode) return;
        const normalized = normalizeCode(rawCode);
        if (normalized && !distinctCodes.has(normalized)) {
          distinctCodes.set(normalized, rawCode);
        }
      });

      const codeList = Array.from(distinctCodes.values());
      for (const chunk of chunkArray(codeList, 1000)) {
        if (!chunk.length) continue;
        const products = await prisma.product.findMany({
          where: { mikroCode: { in: chunk } },
          select: { mikroCode: true, brandCode: true },
        });
        products.forEach((product) => {
          const brand = normalizeCode(product.brandCode);
          if (brand) {
            brandByCode.set(normalizeCode(product.mikroCode), brand);
          }
        });
      }
    }

    const kept: T[] = [];
    let excludedCount = 0;

    rows.forEach((row) => {
      const data = getRowData(row);
      const code = normalizeCode(pickStockCode(data));

      if (code && excludedCodes.has(code)) {
        excludedCount += 1;
        return;
      }

      if (excludedNameTokens.length > 0) {
        const nameToken = normalizeMatchToken(pickStockName(data));
        if (nameToken && excludedNameTokens.some((token) => nameToken.includes(token))) {
          excludedCount += 1;
          return;
        }
      }

      if (code && excludedBrands.size > 0) {
        const brand = brandByCode.get(code);
        if (brand && excludedBrands.has(brand)) {
          excludedCount += 1;
          return;
        }
      }

      kept.push(row);
    });

    return { kept, excludedCount };
  }
}

export default new MarginExclusionService();
