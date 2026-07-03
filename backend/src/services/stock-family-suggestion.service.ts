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
 * BIRIM CEVRIMI (unitFactorOverride, Round 4):
 * Aile uyeleri farkli ana birimlerde olabilir (biri KOLI, digeri PAKET). Her uyenin
 * ProductFamilyItem.unitFactorOverride alani "bu urunun 1 ana birimi = X aile ortak
 * birimi" demektir. null ise ayni-birim kabul (etkin katsayi 1). Etkin katsayi:
 *   effFactor = unitFactorOverride ?? (normalizeUnitName(member.unit) === enteredUnit ? 1 : null)
 * effFactor null olan uye (farkli birim + override yok) ADAY OLAMAZ (yanlis miktar riski).
 *
 * Karsilastirma "aile ortak birimi" uzerinden yapilir; girilen miktar (qty) girilen
 * urunun kendi ana biriminde gelir. Uye stogunu GIRILEN URUN birimine cevirmek icin:
 *   qtyInEnteredUnits = memberQty * memberEff / enteredEff
 * (enteredEff = girilen urunun aile-ici override'i, yoksa 1).
 * Uyeden girilecek onerilen miktar, kullaniciya UYENIN KENDI biriminde gosterilmeli;
 * bu yuzden entered-birim degerini tekrar uyeye ceviririz:
 *   memberQtyFromEntered = enteredUnits * enteredEff / memberEff
 * Stok tavani asilmasin diye availability sinirinda Math.floor kullanilir.
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
  available: number; // satilabilir stok (UYENIN KENDI biriminde: eldeki - bekleyen musteri siparisi)
  excess: number; // fazla/yatan stok (UYENIN KENDI biriminde)
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

    // Girilen urunun aile-ici etkin katsayisi (aile ortak birimine cevirim).
    // Girilen urun bu akista ailenin uyesi kabul edilir; uye kaydi yoksa 1 kullan.
    const enteredItem = family.items.find(
      (i) => String(i.productCode || '').trim().toUpperCase() === upperCode
    );
    const enteredEff =
      enteredItem?.unitFactorOverride != null && Number(enteredItem.unitFactorOverride) > 0
        ? Number(enteredItem.unitFactorOverride)
        : 1;

    // Kardeslerin override haritasi (kod -> unitFactorOverride|null)
    const overrideByCode = new Map<string, number | null>();
    family.items.forEach((i) => {
      const c = String(i.productCode || '').trim().toUpperCase();
      if (!c) return;
      const v =
        i.unitFactorOverride != null && Number(i.unitFactorOverride) > 0
          ? Number(i.unitFactorOverride)
          : null;
      overrideByCode.set(c, v);
    });

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

    // Her aday uye icin: kendi biriminde available/excess (display) +
    // aile-ortak-birim etkin katsayisi (effFactor). effFactor null -> aday olamaz.
    interface AltInternal extends FamilyAlternative {
      eff: number; // aile ortak birimine cevirim katsayisi (>0)
      availEntered: number; // stok, GIRILEN urun biriminde
      excessEntered: number; // fazla stok, GIRILEN urun biriminde
    }

    const alternatives: AltInternal[] = siblings
      .map((p): AltInternal | null => {
        const c = String(p.mikroCode || '').trim().toUpperCase();
        const override = overrideByCode.get(c);
        // effFactor = override ?? (ayni birim ? 1 : null)
        const eff =
          override != null
            ? override
            : normalizeUnitName(p.unit) === enteredUnit
            ? 1
            : null;
        if (eff == null || !(eff > 0)) return null; // farkli birim + override yok -> disla

        const available = Math.max(
          0,
          totalIncludedStock(p.warehouseStocks, included) - (p.pendingCustomerOrders || 0)
        );
        const excess = p.excessStock || 0;
        // Uye stogunu GIRILEN urun birimine cevir: memberQty * memberEff / enteredEff
        const availEntered = (available * eff) / enteredEff;
        const excessEntered = (excess * eff) / enteredEff;
        return {
          productCode: p.mikroCode,
          productName: p.name,
          unit: p.unit,
          available,
          excess,
          eff,
          availEntered,
          excessEntered,
        };
      })
      .filter((a): a is AltInternal => a !== null)
      .filter((a) => a.available > 0 || a.excess > 0)
      // Siralama GIRILEN urun birimindeki degerlere gore (elmayla elma)
      .sort((a, b) => b.excessEntered - a.excessEntered || b.availEntered - a.availEntered);

    // Public alternatives[] uyenin kendi biriminde (eff/availEntered internal alanlari haric)
    const publicAlternatives: FamilyAlternative[] = alternatives.map((a) => ({
      productCode: a.productCode,
      productName: a.productName,
      unit: a.unit,
      available: a.available,
      excess: a.excess,
    }));

    const warnings: StockFamilyWarning[] = [];

    // Kullaniciya ONERILEN (ihtiyac) miktari uyenin KENDI biriminde: yukari yuvarla
    // (Math.ceil) ki daha buyuk bir uye birimine (orn. 1 KOLI=12 PAKET) donusen kucuk
    // ihtiyac 0'a inip "0 KOLI karsila" gibi ise yaramaz oneri uretmesin. Uyenin
    // stok tavanini ASMA (cap ile kirp). 0 cikarsa cagiran taraf oneriyi hic uretmez.
    const toMemberUnitsCeil = (enteredUnits: number, eff: number, memberCap: number): number => {
      const raw = (enteredUnits * enteredEff) / eff;
      const ceil = Math.max(0, Math.ceil(raw));
      return Math.min(ceil, Math.max(0, memberCap));
    };

    // Tip 1 — yetersiz stok + aile alternatifi (karsilastirma GIRILEN birimde)
    if (shortfall > 0) {
      const coverFull = alternatives
        .filter((a) => a.availEntered >= qty)
        .sort((a, b) => b.availEntered - a.availEntered);
      const coverShort = alternatives
        .filter((a) => a.availEntered >= shortfall)
        .sort((a, b) => b.availEntered - a.availEntered);
      const best =
        coverFull[0] ||
        coverShort[0] ||
        [...alternatives].sort((a, b) => b.availEntered - a.availEntered)[0];
      if (best) {
        const full = best.availEntered >= qty;
        // Kullaniciya onerilen: bu uyeden alinacak miktar (uyenin kendi biriminde).
        // Tamamini karsilayabiliyorsa qty'nin karsiligi; degilse mevcut tavani.
        const targetEntered = full ? qty : best.availEntered;
        // Ihtiyaci yukari yuvarla ama uyenin kendi-birim stok tavanini (best.available) asma.
        const recommendedInMemberUnit = toMemberUnitsCeil(targetEntered, best.eff, best.available);
        // 0'a yuvarlanan (uyenin buyuk biriminde anlamsiz) oneriyi hic uretme.
        if (recommendedInMemberUnit > 0) {
          warnings.push({
            type: 'INSUFFICIENT',
            message: `Girdiginiz "${entered.name}" stogu istenen ${qty} ${entered.unit} miktarini karsilamiyor (mevcut ${enteredAvail}). Ayni stok ailesinde "${best.productName}" (${best.productCode}) ${best.available} ${best.unit} ile ${full ? 'tamamini' : 'kalanini'} karsilayabiliyor.`,
            recommended: {
              productCode: best.productCode,
              productName: best.productName,
              unit: best.unit,
              available: best.available,
              canCoverFull: full,
              fromAlt: recommendedInMemberUnit,
            },
          });
        }
      }
    }

    // Tip 2 — yatan (fazla) stok yonlendirme (girilen karsilasa bile)
    // Girilen urunun KENDI yatan stogu varsa uretme: urun zaten yatan stok eritiyor,
    // kardese kaydirmanin anlami yok (oneri dongusunun ana kaynagi).
    const excessAlts = enteredExcess > 0 ? [] : alternatives.filter((a) => a.excessEntered > 0);
    if (excessAlts.length) {
      const top = excessAlts[0];
      // Bu uyeden girilecek miktari GIRILEN birimde hesapla (fazla stok tavani vs qty).
      const fromAltEntered = Math.min(top.excessEntered, qty);
      // Uyeden girilecek onerilen miktari uyenin KENDI biriminde goster: yukari yuvarla
      // ama uyenin kendi-birim fazla-stok tavanini (top.excess) asma.
      const fromAltMember = toMemberUnitsCeil(fromAltEntered, top.eff, top.excess);
      // 0'a yuvarlanan (buyuk uye biriminde anlamsiz) oneriyi hic uretme.
      if (fromAltMember > 0) {
      const fromEnteredQty = Math.max(0, qty - fromAltEntered);
      warnings.push({
        type: 'OFFLOAD_EXCESS',
        message:
          fromEnteredQty > 0
            ? `Ayni stok ailesinde "${top.productName}" (${top.productCode}) ${top.excess} ${top.unit} fazla (yatan) stoklu. Bu siparisin bir kismini (${fromAltMember} ${top.unit}) bu urunden, kalan ${fromEnteredQty} ${entered.unit} miktarini girdiginiz urunden girerek yatan stogu eritebilirsiniz.`
            : `Ayni stok ailesinde "${top.productName}" (${top.productCode}) ${top.excess} ${top.unit} fazla (yatan) stoklu. Bu siparisin tamamini (${fromAltMember} ${top.unit}) bu urunden girerek yatan stogu eritebilirsiniz.`,
        recommended: {
          productCode: top.productCode,
          productName: top.productName,
          unit: top.unit,
          excess: top.excess,
          available: top.available,
          fromAlt: fromAltMember,
          fromEntered: fromEnteredQty,
        },
      });
      }
    }

    return {
      product: productShape,
      family: { id: family.id, name: family.name },
      requested: qty,
      enteredAvailable: enteredAvail,
      shortfall,
      coversRequested,
      enteredExcess,
      alternatives: publicAlternatives,
      warnings,
    };
  }
}

export default new StockFamilySuggestionService();
