export const formatUnitFactor = (value: number) => {
  return value.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
};

const normalizeUnit = (value?: string | null) => {
  if (!value) return '';
  return value.trim().toUpperCase();
};

export const normalizeUnitName = normalizeUnit;

export const hasSecondaryUnit = (
  unit?: string | null,
  unit2?: string | null,
  unit2Factor?: number | null
) => {
  const factor = Number(unit2Factor);
  return Boolean(
    normalizeUnit(unit) &&
      normalizeUnit(unit2) &&
      Number.isFinite(factor) &&
      factor !== 0
  );
};

export const getAvailableUnits = (
  unit?: string | null,
  unit2?: string | null,
  unit2Factor?: number | null
) => {
  const units = [unit || 'ADET'];
  if (hasSecondaryUnit(unit, unit2, unit2Factor) && unit2) {
    units.push(unit2);
  }
  return Array.from(new Set(units.filter(Boolean)));
};

const isSecondaryUnit = (
  selectedUnit?: string | null,
  unit2?: string | null
) => normalizeUnit(selectedUnit) !== '' && normalizeUnit(selectedUnit) === normalizeUnit(unit2);

export const convertQuantityToBaseUnit = (
  quantity: number,
  selectedUnit?: string | null,
  unit?: string | null,
  unit2?: string | null,
  unit2Factor?: number | null
) => {
  const value = Number(quantity);
  if (!Number.isFinite(value)) return 0;
  const factor = Number(unit2Factor);
  if (!hasSecondaryUnit(unit, unit2, factor) || !isSecondaryUnit(selectedUnit, unit2)) {
    return value;
  }
  const absFactor = Math.abs(factor);
  return factor > 0 ? value / absFactor : value * absFactor;
};

export const convertQuantityFromBaseUnit = (
  quantity: number,
  selectedUnit?: string | null,
  unit?: string | null,
  unit2?: string | null,
  unit2Factor?: number | null
) => {
  const value = Number(quantity);
  if (!Number.isFinite(value)) return 0;
  const factor = Number(unit2Factor);
  if (!hasSecondaryUnit(unit, unit2, factor) || !isSecondaryUnit(selectedUnit, unit2)) {
    return value;
  }
  const absFactor = Math.abs(factor);
  return factor > 0 ? value * absFactor : value / absFactor;
};

export const convertPriceToBaseUnit = (
  unitPrice: number,
  selectedUnit?: string | null,
  unit?: string | null,
  unit2?: string | null,
  unit2Factor?: number | null
) => {
  const value = Number(unitPrice);
  if (!Number.isFinite(value)) return 0;
  const factor = Number(unit2Factor);
  if (!hasSecondaryUnit(unit, unit2, factor) || !isSecondaryUnit(selectedUnit, unit2)) {
    return value;
  }
  const absFactor = Math.abs(factor);
  return factor > 0 ? value * absFactor : value / absFactor;
};

export const convertPriceFromBaseUnit = (
  unitPrice: number,
  selectedUnit?: string | null,
  unit?: string | null,
  unit2?: string | null,
  unit2Factor?: number | null
) => {
  const value = Number(unitPrice);
  if (!Number.isFinite(value)) return 0;
  const factor = Number(unit2Factor);
  if (!hasSecondaryUnit(unit, unit2, factor) || !isSecondaryUnit(selectedUnit, unit2)) {
    return value;
  }
  const absFactor = Math.abs(factor);
  return factor > 0 ? value / absFactor : value * absFactor;
};

/**
 * Musteri tarafi birim secici (KOLI/PAKET gibi BUYUK ikinci birim): 1 ikinci birim
 * kac ana birim eder? Mikro katsayi isaret kuralini convertQuantityToBaseUnit uzerinden
 * kullanir (negatif katsayi: 1 unit2 = |katsayi| ana birim). Ikinci birim ana birimden
 * buyuk degilse (sonuc <= 1) null doner — secici gosterilmez.
 */
export const getUnit2BaseQuantity = (
  unit?: string | null,
  unit2?: string | null,
  unit2Factor?: number | null
): number | null => {
  if (!hasSecondaryUnit(unit, unit2, unit2Factor)) return null;
  const perUnit2 = convertQuantityToBaseUnit(1, unit2, unit, unit2, unit2Factor);
  return Number.isFinite(perUnit2) && perUnit2 > 1 ? perUnit2 : null;
};

const roundQty = (value: number, decimals = 6) => {
  if (!Number.isFinite(value)) return 0;
  const p = Math.pow(10, decimals);
  return Math.round(value * p) / p;
};

/**
 * Sepette bir alt-birim (unit2) satiri icin gosterim: kalan miktar (BAZ/ana birim)
 * -> alt birim miktarina cevrilir. Sadece dogru-yon (isaret) mantigi kullanilir.
 */
export interface UnitToggleInfo {
  /** Secici gosterilsin mi? (gecerli 2. birim + katsayi varsa) */
  hasToggle: boolean;
  /** Ana (varsayilan) birim adi */
  mainUnit: string;
  /** Toggle'daki ikinci secenek (2. birim) adi; yoksa null */
  altUnit: string | null;
  /** 'ALT_BIGGER' = 2. birim ana birimden BUYUK (negatif katsayi, KOLI>ADET). 'ALT_SMALLER' = 2. birim daha KUCUK (pozitif katsayi, KOLI>PAKET). */
  direction: 'ALT_BIGGER' | 'ALT_SMALLER' | null;
  /** Gosterilen ANA birim fiyatini 2. birim fiyatina cevirir: altPrice = mainPrice * altPriceFactor */
  altPriceFactor: number;
  /** 2. birimde girilen miktar Q -> BAZ (ana) birim float miktar (6 hane yuvarlanmis) */
  altToBase: (q: number) => number;
  /** BAZ (ana) birim float miktar -> 2. birim miktar (sepet stepper'i icin) */
  baseToAlt: (q: number) => number;
  /** "1 KOLI = 10 ADET" / "1 KOLI = 10 PAKET" gibi oran etiketi */
  ratioLabel: string | null;
}

/**
 * Musteri tarafi birim secici bilgisi — HER IKI yon icin.
 *  - Negatif katsayi (2. birim daha BUYUK, orn. 1 KOLI = 10 ADET):
 *      altToBase(q) = q * |f|,  altPriceFactor = |f|
 *  - Pozitif katsayi (ANA birim daha BUYUK, orn. 1 KOLI = 10 PAKET, ana=KOLI unit2=PAKET):
 *      altToBase(q) = round(q / f, 6),  altPriceFactor = 1/f
 * Katsayi yoksa / gecersizse hasToggle=false doner.
 */
export const getUnitOptions = (
  unit?: string | null,
  unit2?: string | null,
  unit2Factor?: number | null
): UnitToggleInfo => {
  const mainUnit = (unit || 'ADET').trim() || 'ADET';
  const factor = Number(unit2Factor);
  const abs = Math.abs(factor);
  // Gecerli 2. birim + katsayi yoksa VEYA katsayi 1 ise (birimler ayni boyutta) secici gosterme.
  if (!hasSecondaryUnit(unit, unit2, factor) || !unit2 || !(abs > 1)) {
    return {
      hasToggle: false,
      mainUnit,
      altUnit: null,
      direction: null,
      altPriceFactor: 1,
      altToBase: (q) => Number(q) || 0,
      baseToAlt: (q) => Number(q) || 0,
      ratioLabel: null,
    };
  }
  const altUnit = unit2.trim();
  if (factor < 0) {
    // 2. birim ANA birimden BUYUK — 1 unit2 = |f| ana birim
    return {
      hasToggle: true,
      mainUnit,
      altUnit,
      direction: 'ALT_BIGGER',
      altPriceFactor: abs,
      altToBase: (q) => roundQty((Number(q) || 0) * abs),
      baseToAlt: (q) => roundQty((Number(q) || 0) / abs),
      ratioLabel: `1 ${altUnit} = ${formatUnitFactor(abs)} ${mainUnit}`,
    };
  }
  // Pozitif katsayi: ANA birim daha BUYUK — 1 ana birim = f unit2
  return {
    hasToggle: true,
    mainUnit,
    altUnit,
    direction: 'ALT_SMALLER',
    altPriceFactor: 1 / abs,
    altToBase: (q) => roundQty((Number(q) || 0) / abs),
    baseToAlt: (q) => roundQty((Number(q) || 0) * abs),
    ratioLabel: `1 ${mainUnit} = ${formatUnitFactor(abs)} ${altUnit}`,
  };
};

export const getUnitConversionLabel = (
  unit?: string | null,
  unit2?: string | null,
  unit2Factor?: number | null
) => {
  if (!unit || !unit2) return null;
  const factor = Number(unit2Factor);
  if (!Number.isFinite(factor) || factor === 0) return null;
  const absFactor = Math.abs(factor);
  if (absFactor === 0) return null;

  const normalizedUnit = normalizeUnit(unit).replace(/İ/g, 'I');
  const normalizedUnit2 = normalizeUnit(unit2).replace(/İ/g, 'I');
  const isKoli = normalizedUnit.includes('KOLI') || normalizedUnit2.includes('KOLI');
  const primaryUnit = factor > 0 ? unit : unit2;
  const secondaryUnit = factor > 0 ? unit2 : unit;

  if (isKoli) {
    const targetUnit = normalizedUnit.includes('KOLI') ? unit2 : unit;
    return `Koli içi: ${formatUnitFactor(absFactor)} ${targetUnit}`;
  }

  return `Birim oranı: 1 ${primaryUnit} = ${formatUnitFactor(absFactor)} ${secondaryUnit}`;
};
