/**
 * Stock Family Suggestion Service
 *
 * Teklif/siparis girisinde, girilen urunun STOK AILESINDEKI alternatif/yatan-stoklu
 * urune yonlendirme onerisi uretir. Salt-okuma; Mikro'ya/DB'ye yazmaz.
 *
 * Iki uyari tipi:
 *  1) INSUFFICIENT  : Girilen urun istenen miktari karsilamiyor; ailede yeterli stoklu kardes var.
 *  2) OFFLOAD_EXCESS: Girilen urun karsilasa BILE, ailede FAZLA (yatan) stoklu kardes varsa
 *                     siparisin tamamini/kismini ona kaydirarak yatan stogu eritmeyi onerir.
 *
 * Not: Karsilastirma ana birim (genelde ADET) bazinda yapilir; frontend miktari base birime
 * cevirip gonderir. Ayni ailedeki urunler ayni base birimde varsayilir.
 */

import { prisma } from '../utils/prisma';

// Mikro'da ayni birimin farkli kisaltmalari kullanilabiliyor (PK/PAKET, AD/ADET...).
// Birim guvenligi karsilastirmasi kanonik ada gore yapilir.
const UNIT_SYNONYMS: Record<string, string> = {
  AD: 'ADET',
  ADET: 'ADET',
  PK: 'PAKET',
  PKT: 'PAKET',
  PAKET: 'PAKET',
  KT: 'KUTU',
  KUTU: 'KUTU',
  KL: 'KOLI',
  KOLI: 'KOLI',
  RL: 'RULO',
  RULO: 'RULO',
  CFT: 'CIFT',
  CIFT: 'CIFT',
};

export function normalizeUnitName(unit: unknown): string {
  const raw = String(unit || '')
    .trim()
    .toUpperCase()
    // Turkce karakterleri sadelestir (KOLİ -> KOLI, ÇİFT -> CIFT)
    .replace(/İ/g, 'I')
    .replace(/Ç/g, 'C')
    .replace(/Ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/\./g, '');
  return UNIT_SYNONYMS[raw] || raw;
}

function totalIncludedStock(
  warehouseStocks: any,
  includedWarehouses: string[]
): number {
  const ws = (warehouseStocks || {}) as Record<string, number>;
  if (!Array.isArray(includedWarehouses) || includedWarehouses.length === 0) {
    // Ayar yoksa tum depolari topla (guvenli fallback)
    return Object.values(ws).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
  }
  return includedWarehouses.reduce((s, w) => s + (Number(ws[w]) || 0), 0);
}

export interface FamilyAlternative {
  productCode: string;
  productName: string;
  unit: string;
  available: number; // satilabilir stok (eldeki - bekleyen musteri siparisi)
  excess: number; // fazla/yatan stok
}

export interface StockFamilyWarning {
  type: 'INSUFFICIENT' | 'OFFLOAD_EXCESS';
  message: string;
  recommended: {
    productCode: string;
    productName: string;
    unit?: string;
    available?: number;
    excess?: number;
    canCoverFull?: boolean;
    fromAlt?: number; // alternatif urunden girilecek miktar (base birim)
    fromEntered?: number; // girilen urunden kalan miktar (base birim)
  };
}

class StockFamilySuggestionService {
  async getSuggestions(params: {
    productCode: string;
    quantity: number;
    /** Teklifin DIGER satirlarindaki urun kodlari; bunlar aday olarak onerilmez (oneri dongusunu keser). */
    excludeCodes?: string[];
  }): Promise<{
    product: { code: string; name: string; unit: string; available: number; excess: number } | null;
    family: { id: string; name: string } | null;
    requested: number;
    enteredAvailable: number;
    shortfall: number;
    coversRequested: boolean;
    enteredExcess: number;
    alternatives: FamilyAlternative[];
    warnings: StockFamilyWarning[];
  }> {
    const code = String(params.productCode || '').trim();
    const qty = Math.max(0, Number(params.quantity) || 0);
    const excludedSet = new Set(
      (params.excludeCodes || [])
        .map((c) => String(c || '').trim().toUpperCase())
        .filter(Boolean)
    );

    const empty = {
      product: null,
      family: null,
      requested: qty,
      enteredAvailable: 0,
      shortfall: 0,
      coversRequested: true,
      enteredExcess: 0,
      alternatives: [] as FamilyAlternative[],
      warnings: [] as StockFamilyWarning[],
    };

    if (!code || qty <= 0) return empty;

    const settings = await prisma.settings.findFirst();
    const included = (settings?.includedWarehouses as string[]) || [];

    const entered = await prisma.product.findUnique({ where: { mikroCode: code } });
    if (!entered) return empty;

    const enteredAvail = Math.max(
      0,
      totalIncludedStock(entered.warehouseStocks, included) - (entered.pendingCustomerOrders || 0)
    );
    const shortfall = Math.max(0, qty - enteredAvail);
    const coversRequested = shortfall <= 0;
    const enteredExcess = entered.excessStock || 0;
    const enteredUnit = normalizeUnitName(entered.unit);

    const productShape = {
      code: entered.mikroCode,
      name: entered.name,
      unit: entered.unit,
      available: enteredAvail,
      excess: entered.excessStock || 0,
    };

    // Aile uyeligi
    const membership = await prisma.productFamilyItem.findFirst({
      where: { productCode: code, active: true },
      select: { familyId: true },
    });

    if (!membership) {
      return {
        ...empty,
        product: productShape,
        enteredAvailable: enteredAvail,
        shortfall,
        coversRequested,
        enteredExcess,
      };
    }

    const family = await prisma.productFamily.findUnique({
      where: { id: membership.familyId },
      include: { items: { where: { active: true } } },
    });

    if (!family || !family.active) {
      return {
        ...empty,
        product: productShape,
        enteredAvailable: enteredAvail,
        shortfall,
        coversRequested,
        enteredExcess,
      };
    }

    const upperCode = code.toUpperCase();
    const siblingCodes = Array.from(
      new Set(
        family.items
          .map((i) => i.productCode)
          .filter((c) => c && c.toUpperCase() !== upperCode)
          // Teklifin diger satirlarinda zaten olan kardesleri aday yapma (oneri dongusunu keser)
          .filter((c) => !excludedSet.has(String(c).trim().toUpperCase()))
      )
    );

    const siblings = siblingCodes.length
      ? await prisma.product.findMany({ where: { mikroCode: { in: siblingCodes }, active: true } })
      : [];

    const alternatives: FamilyAlternative[] = siblings
      // Birim guvenligi: ana birimi girilen urunden farkli kardesler aday olamaz
      // (miktar cevrimi yapilmadigi icin yanlis miktar olusur).
      // Es-anlamlilar ayni sayilir: PK=PAKET, AD=ADET, KT=KUTU vb (normalizeUnitName).
      .filter((p) => normalizeUnitName(p.unit) === enteredUnit)
      .map((p) => {
        const available = Math.max(
          0,
          totalIncludedStock(p.warehouseStocks, included) - (p.pendingCustomerOrders || 0)
        );
        return {
          productCode: p.mikroCode,
          productName: p.name,
          unit: p.unit,
          available,
          excess: p.excessStock || 0,
        };
      })
      .filter((a) => a.available > 0 || a.excess > 0)
      .sort((a, b) => b.excess - a.excess || b.available - a.available);

    const warnings: StockFamilyWarning[] = [];

    // Tip 1 — yetersiz stok + aile alternatifi
    if (shortfall > 0) {
      const coverFull = alternatives
        .filter((a) => a.available >= qty)
        .sort((a, b) => b.available - a.available);
      const coverShort = alternatives
        .filter((a) => a.available >= shortfall)
        .sort((a, b) => b.available - a.available);
      const best =
        coverFull[0] ||
        coverShort[0] ||
        [...alternatives].sort((a, b) => b.available - a.available)[0];
      if (best) {
        const full = best.available >= qty;
        warnings.push({
          type: 'INSUFFICIENT',
          message: `Girdiginiz "${entered.name}" stogu istenen ${qty} adedi karsilamiyor (mevcut ${enteredAvail}). Ayni stok ailesinde "${best.productName}" (${best.productCode}) ${best.available} adetle ${full ? 'tamamini' : 'kalanini'} karsilayabiliyor.`,
          recommended: {
            productCode: best.productCode,
            productName: best.productName,
            unit: best.unit,
            available: best.available,
            canCoverFull: full,
          },
        });
      }
    }

    // Tip 2 — yatan (fazla) stok yonlendirme (girilen karsilasa bile)
    // Girilen urunun KENDI yatan stogu varsa uretme: urun zaten yatan stok eritiyor,
    // kardese kaydirmanin anlami yok (oneri dongusunun ana kaynagi).
    const excessAlts = enteredExcess > 0 ? [] : alternatives.filter((a) => a.excess > 0);
    if (excessAlts.length) {
      const top = excessAlts[0];
      const fromAlt = Math.min(top.excess, qty);
      const fromEntered = Math.max(0, qty - fromAlt);
      warnings.push({
        type: 'OFFLOAD_EXCESS',
        message:
          fromEntered > 0
            ? `Ayni stok ailesinde "${top.productName}" (${top.productCode}) ${top.excess} adet fazla (yatan) stoklu. ${qty} adedin ${fromAlt} adedini bu urunden, kalan ${fromEntered} adedini girdiginiz urunden girerek yatan stogu eritebilirsiniz.`
            : `Ayni stok ailesinde "${top.productName}" (${top.productCode}) ${top.excess} adet fazla (yatan) stoklu. Bu siparisin tamamini (${qty} adet) bu urunden girerek yatan stogu eritebilirsiniz.`,
        recommended: {
          productCode: top.productCode,
          productName: top.productName,
          unit: top.unit,
          excess: top.excess,
          available: top.available,
          fromAlt,
          fromEntered,
        },
      });
    }

    return {
      product: productShape,
      family: { id: family.id, name: family.name },
      requested: qty,
      enteredAvailable: enteredAvail,
      shortfall,
      coversRequested,
      enteredExcess,
      alternatives,
      warnings,
    };
  }
}

export default new StockFamilySuggestionService();
