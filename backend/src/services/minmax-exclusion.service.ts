/**
 * Min-Max Kullanici Haric Tutma Servisi
 *
 * Kullanicinin min-max hesabindan tamamen cikarmak istedigi stok kodlarini
 * (MinMaxExclusion tablosu) yonetir. Bu liste sto_model_kodu='HAYIR' (Mikro tarafi)
 * mekanizmasindan BAGIMSIZDIR ve sadece B2B tarafinda tutulur:
 *   - previewMinMax: listedeki urunler satirda gorunur ama userExcluded=true,
 *     newMin/newMax null doner (UI gri gosterir).
 *   - applyMinMax: listedeki urunler 'Kullanici tarafindan hesaplama disi birakildi'
 *     gerekcesiyle reddedilir.
 */

import { prisma } from '../utils/prisma';
import { AppError, ErrorCode } from '../types/errors';

const normalizeCode = (value: unknown): string => String(value || '').trim().toUpperCase();

export interface MinMaxExclusionItem {
  id: string;
  productCode: string;
  productName: string | null;
  note: string | null;
  createdByName: string | null;
  createdAt: Date;
}

export interface MinMaxExclusionAddInput {
  productCode: string;
  productName?: string | null;
  note?: string | null;
}

export interface MinMaxExclusionAddResult {
  added: number;
  skipped: string[]; // zaten haric listesinde olan stok kodlari
}

class MinMaxExclusionService {
  async list(): Promise<{ items: MinMaxExclusionItem[] }> {
    const rows = await prisma.minMaxExclusion.findMany({
      orderBy: [{ createdAt: 'desc' }],
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        productCode: row.productCode,
        productName: row.productName || null,
        note: row.note || null,
        createdByName: row.createdByName || null,
        createdAt: row.createdAt,
      })),
    };
  }

  async addMany(
    itemsInput: MinMaxExclusionAddInput[],
    user?: { id?: string | null; name?: string | null }
  ): Promise<MinMaxExclusionAddResult> {
    // Kod normalize (trim + upper) + istek icinde tekrar edenleri ele
    const byCode = new Map<string, MinMaxExclusionAddInput>();
    const skipped: string[] = [];
    (Array.isArray(itemsInput) ? itemsInput : []).forEach((item) => {
      const productCode = normalizeCode(item?.productCode);
      if (!productCode) return;
      if (byCode.has(productCode)) {
        // Ayni istekte tekrar eden kod: ilki islenir, tekrar 'skipped' sayilir
        skipped.push(productCode);
        return;
      }
      byCode.set(productCode, item);
    });

    if (byCode.size === 0) {
      throw new AppError('En az bir gecerli stok kodu girilmelidir.', 400, ErrorCode.BAD_REQUEST);
    }

    const codes = Array.from(byCode.keys());

    // Zaten haric listesinde olanlar -> skipped
    const existing = await prisma.minMaxExclusion.findMany({
      where: { productCode: { in: codes } },
      select: { productCode: true },
    });
    const existingCodes = new Set(existing.map((row) => normalizeCode(row.productCode)));
    const toCreateCodes = codes.filter((code) => {
      if (existingCodes.has(code)) {
        skipped.push(code);
        return false;
      }
      return true;
    });

    if (toCreateCodes.length === 0) {
      return { added: 0, skipped };
    }

    // Urun adi verilmemisse lokal Product tablosundan (mikroCode ile) tamamla
    const missingNameCodes = toCreateCodes.filter((code) => {
      const name = String(byCode.get(code)?.productName || '').trim();
      return !name;
    });
    const productNameByCode = new Map<string, string>();
    if (missingNameCodes.length > 0) {
      const products = await prisma.product.findMany({
        where: { mikroCode: { in: missingNameCodes } },
        select: { mikroCode: true, name: true },
      });
      products.forEach((product) => {
        productNameByCode.set(normalizeCode(product.mikroCode), String(product.name || '').trim());
      });
    }

    const createdById = user?.id ? String(user.id).trim() || null : null;
    const createdByName = user?.name ? String(user.name).trim().slice(0, 200) || null : null;

    const data = toCreateCodes.map((code) => {
      const input = byCode.get(code)!;
      const givenName = String(input?.productName || '').trim();
      const resolvedName = givenName || productNameByCode.get(code) || '';
      const note = String(input?.note || '').trim();
      return {
        productCode: code,
        productName: resolvedName ? resolvedName.slice(0, 300) : null,
        note: note ? note.slice(0, 500) : null,
        createdById,
        createdByName,
      };
    });

    // skipDuplicates: findMany ile createMany arasinda paralel eklenen kod olursa
    // unique hatasi yerine sessizce atlanir; 'added' gercek insert sayisidir.
    const result = await prisma.minMaxExclusion.createMany({
      data,
      skipDuplicates: true,
    });

    return { added: result.count, skipped };
  }

  async remove(id: string): Promise<{ id: string }> {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) {
      throw new AppError('Kayit id zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }
    const existing = await prisma.minMaxExclusion.findUnique({
      where: { id: normalizedId },
      select: { id: true },
    });
    if (!existing) {
      throw new AppError('Haric tutma kaydi bulunamadi.', 404, ErrorCode.NOT_FOUND);
    }
    await prisma.minMaxExclusion.delete({ where: { id: normalizedId } });
    return { id: normalizedId };
  }

  /**
   * Haric tutulan stok kodlarinin normalize (trim+upper) kumesi.
   * previewMinMax / applyMinMax tek seferde yukleyip satir bazinda kontrol eder.
   */
  async getExcludedCodes(): Promise<Set<string>> {
    const rows = await prisma.minMaxExclusion.findMany({
      select: { productCode: true },
    });
    return new Set(rows.map((row) => normalizeCode(row.productCode)));
  }
}

export default new MinMaxExclusionService();
