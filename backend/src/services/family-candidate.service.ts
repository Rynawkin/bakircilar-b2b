/**
 * Aday Aile Motoru (Aile Kapsama Radari)
 *
 * Ailesiz urunler icin pg_trgm benzerligiyle en uygun mevcut AKTIF stok ailesini
 * onerir (similarity >= 0.35). Karsilastirma normalize metin uzerinden yapilir:
 * girdiler normalizeSearchText ile, aile uyeleri Product.searchText (DB generated,
 * ayni normalizasyon; migration 20260630120000) ile eslestirilir.
 *
 * addProductToFamily: oneriyi tek tusla uygular (ProductFamilyItem.create),
 * UcarerOperationLog 'PRODUCT_FAMILY_UPDATE' kaydi yazar. Mikro'ya yazma YOKTUR.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { AppError, ErrorCode } from '../types/errors';
import { normalizeSearchText } from '../utils/search';

const MAX_CODES = 300;
const CHUNK_SIZE = 50;
const MIN_SCORE = 0.35;

export interface FamilySuggestion {
  familyId: string;
  familyName: string;
  score: number;
  matchedProductName: string;
}

export type FamilySuggestionMap = Record<string, FamilySuggestion | null>;

type SuggestionRow = {
  code: string;
  familyId: string | null;
  familyName: string | null;
  score: number | null;
  matchedProductName: string | null;
};

class FamilyCandidateService {
  /**
   * Verilen urun kodlari icin en benzer aktif aileyi onerir.
   * Donen map'te oneri bulunamayan (veya PG Product cache'inde olmayan) kodlar null'dur.
   */
  async suggestFamilies(productCodes: string[]): Promise<FamilySuggestionMap> {
    const codes = Array.from(
      new Set(
        (Array.isArray(productCodes) ? productCodes : [])
          .map((code) => String(code || '').trim().toUpperCase())
          .filter(Boolean)
      )
    );
    if (codes.length === 0) {
      throw new AppError('En az bir urun kodu gerekli.', 400, ErrorCode.BAD_REQUEST);
    }
    if (codes.length > MAX_CODES) {
      throw new AppError(`Tek seferde en fazla ${MAX_CODES} urun kodu gonderilebilir.`, 400, ErrorCode.BAD_REQUEST);
    }

    const result: FamilySuggestionMap = {};
    codes.forEach((code) => {
      result[code] = null;
    });

    // Urun adlarini PG cache'inden al
    const products = await prisma.product.findMany({
      where: { mikroCode: { in: codes } },
      select: { mikroCode: true, name: true, searchText: true },
    });

    const queryItems = products
      .map((product) => ({
        code: String(product.mikroCode || '').trim().toUpperCase(),
        norm: String(product.searchText || '').trim() || normalizeSearchText(product.name),
      }))
      .filter((item) => item.code && item.norm);

    if (queryItems.length === 0) {
      return result;
    }

    // Chunk'la: her chunk tek sorguda LATERAL ile en iyi aile eslesmesini bulur.
    // Aday kume aktif aile + aktif uye ile sinirli; LIMIT 1 ile N x M patlamasi kontrollu.
    for (let offset = 0; offset < queryItems.length; offset += CHUNK_SIZE) {
      const chunk = queryItems.slice(offset, offset + CHUNK_SIZE);
      const chunkCodes = chunk.map((item) => item.code);
      const chunkNorms = chunk.map((item) => item.norm);

      const rows = await prisma.$queryRaw<SuggestionRow[]>(Prisma.sql`
        SELECT
          q.code AS "code",
          best."familyId" AS "familyId",
          best."familyName" AS "familyName",
          best.score AS "score",
          best."matchedProductName" AS "matchedProductName"
        FROM unnest(${chunkCodes}::text[], ${chunkNorms}::text[]) AS q(code, norm)
        LEFT JOIN LATERAL (
          SELECT
            pfi."familyId",
            pf.name AS "familyName",
            similarity(
              COALESCE(
                NULLIF(p2."searchText", ''),
                trim(regexp_replace(
                  lower(translate(coalesce(pfi."productName", ''), 'ÇĞİıÖŞÜçğöşü', 'CGIIOSUcgosu')),
                  '[^a-z0-9]+', ' ', 'g'
                ))
              ),
              q.norm
            ) AS score,
            COALESCE(p2.name, pfi."productName", pfi."productCode") AS "matchedProductName"
          FROM "ProductFamilyItem" pfi
          INNER JOIN "ProductFamily" pf ON pf.id = pfi."familyId" AND pf.active = true
          LEFT JOIN "Product" p2 ON p2.id = pfi."productId"
          WHERE pfi.active = true
            AND upper(pfi."productCode") <> q.code
          ORDER BY score DESC
          LIMIT 1
        ) best ON true
      `);

      (Array.isArray(rows) ? rows : []).forEach((row) => {
        const code = String(row?.code || '').trim().toUpperCase();
        if (!code) return;
        const score = Number(row?.score);
        if (!row?.familyId || !Number.isFinite(score) || score < MIN_SCORE) {
          result[code] = null;
          return;
        }
        result[code] = {
          familyId: String(row.familyId),
          familyName: String(row.familyName || '').trim(),
          score: Math.round(score * 1000) / 1000,
          matchedProductName: String(row.matchedProductName || '').trim(),
        };
      });
    }

    return result;
  }

  /**
   * Onerilen urunu aileye ekler. Ayni ailede AKTIF kayit varsa 409 doner;
   * pasif kayit varsa yeniden aktive eder (unique [familyId, productCode]).
   */
  async addProductToFamily(
    familyId: string,
    input: { productCode?: string; productName?: string | null },
    userName?: string | null
  ) {
    const normalizedFamilyId = String(familyId || '').trim();
    const productCode = String(input?.productCode || '').trim().toUpperCase();
    if (!normalizedFamilyId) {
      throw new AppError('Aile secimi zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }
    if (!productCode) {
      throw new AppError('Urun kodu zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }

    const family = await prisma.productFamily.findUnique({
      where: { id: normalizedFamilyId },
      select: { id: true, name: true, active: true },
    });
    if (!family) {
      throw new AppError('Stok ailesi bulunamadi.', 404, ErrorCode.NOT_FOUND);
    }
    if (!family.active) {
      throw new AppError('Pasif aileye urun eklenemez.', 400, ErrorCode.BAD_REQUEST);
    }

    const product = await prisma.product.findFirst({
      where: { mikroCode: productCode },
      select: { id: true, name: true },
    });
    const productName =
      String(input?.productName || '').trim() || product?.name || null;

    const existing = await prisma.productFamilyItem.findUnique({
      where: { familyId_productCode: { familyId: family.id, productCode } },
      select: { id: true, active: true },
    });
    if (existing?.active) {
      throw new AppError('Bu urun zaten bu ailede aktif olarak kayitli.', 409, ErrorCode.BAD_REQUEST);
    }

    const maxPriority = await prisma.productFamilyItem.aggregate({
      where: { familyId: family.id },
      _max: { priority: true },
    });
    const priority = (Number(maxPriority._max.priority) || 0) + 1;

    const item = existing
      ? await prisma.productFamilyItem.update({
          where: { id: existing.id },
          data: {
            active: true,
            priority,
            productId: product?.id || null,
            productName,
          },
        })
      : await prisma.productFamilyItem.create({
          data: {
            familyId: family.id,
            productCode,
            productName,
            productId: product?.id || null,
            priority,
            active: true,
          },
        });

    await this.logOperation({
      operationType: 'PRODUCT_FAMILY_UPDATE',
      title: 'Aday aileden eklendi',
      productCode,
      productName,
      familyId: family.id,
      familyName: family.name,
      newValues: { productCode, productName, priority, active: true },
      metadata: { reactivated: Boolean(existing) },
      userName: userName || null,
    });

    return {
      item,
      family: { id: family.id, name: family.name },
    };
  }

  /**
   * UcarerOperationLog kaydi (reports.service.ts logUcarerOperation kalibi;
   * bu serviste aktor adi dogrudan userName olarak gelir).
   */
  private async logOperation(input: {
    operationType: string;
    title: string;
    productCode?: string | null;
    productName?: string | null;
    familyId?: string | null;
    familyName?: string | null;
    previousValues?: Record<string, any> | any[] | null;
    newValues?: Record<string, any> | any[] | null;
    metadata?: Record<string, any> | any[] | null;
    userName?: string | null;
  }): Promise<void> {
    try {
      const jsonOrUndefined = (value: unknown): Prisma.InputJsonValue | undefined => {
        if (value === undefined || value === null) return undefined;
        return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
      };
      await prisma.ucarerOperationLog.create({
        data: {
          operationType: String(input.operationType || 'UNKNOWN').trim() || 'UNKNOWN',
          title: String(input.title || '').trim() || 'Ucarer islemi',
          productCode: input.productCode ? String(input.productCode).trim().toUpperCase() : null,
          productName: input.productName ? String(input.productName).trim() : null,
          familyId: input.familyId ? String(input.familyId).trim() : null,
          familyName: input.familyName ? String(input.familyName).trim() : null,
          orderNumbers: [],
          previousValues: jsonOrUndefined(input.previousValues),
          newValues: jsonOrUndefined(input.newValues),
          metadata: jsonOrUndefined(input.metadata),
          userId: null,
          userName: input.userName ? String(input.userName).trim() : null,
        },
      });
    } catch (error) {
      console.warn('Aday aile islem logu yazilamadi:', error);
    }
  }
}

export default new FamilyCandidateService();
