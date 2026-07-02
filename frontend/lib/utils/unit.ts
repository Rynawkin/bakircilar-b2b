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

  const normalizedUnit = normalizeUnit(unit);
  const normalizedUnit2 = normalizeUnit(unit2);
  const isKoli = normalizedUnit.includes('KOLI') || normalizedUnit2.includes('KOLI');
  const primaryUnit = factor > 0 ? unit : unit2;
  const secondaryUnit = factor > 0 ? unit2 : unit;

  if (isKoli) {
    const targetUnit = normalizedUnit.includes('KOLI') ? unit2 : unit;
    return `Koli ici: ${formatUnitFactor(absFactor)} ${targetUnit}`;
  }

  return `Birim orani: 1 ${primaryUnit} = ${formatUnitFactor(absFactor)} ${secondaryUnit}`;
};
