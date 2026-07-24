export const EXCLUDED_VADE_SECTOR_CODES = [
  'DİĞER',
  'DIGER',
  'FATURA',
  'SATICI',
  'SORUNLU',
  'SORUNLU CARİ',
  'SORUNLU CARI',
] as const;

export const normalizeVadeSectorCode = (value?: string | null) =>
  (value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0131/g, 'i')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

const EXCLUDED_VADE_SECTOR_PREFIXES =
  EXCLUDED_VADE_SECTOR_CODES.map(normalizeVadeSectorCode);

export const isExcludedVadeSectorCode = (value?: string | null) => {
  const normalized = normalizeVadeSectorCode(value);
  if (!normalized) return false;
  return EXCLUDED_VADE_SECTOR_PREFIXES.some(
    (code) => normalized === code || normalized.startsWith(code),
  );
};

export const buildExcludedVadeSectorFilters = () =>
  EXCLUDED_VADE_SECTOR_CODES.map((code) => ({
    sectorCode: { startsWith: code, mode: 'insensitive' as const },
  }));

/**
 * Builds query-enforced vade visibility.
 *
 * Users with no sector remain visible only to roles that already have global
 * sector access. Sector-scoped roles stay closed because NULL can never match
 * an assigned sector code.
 */
export const buildVadeSectorAccessWhere = ({
  canAccessAll,
  assignedSectorCodes = [],
  requestedSectorCode,
}: {
  canAccessAll: boolean;
  assignedSectorCodes?: readonly string[];
  requestedSectorCode?: string | null;
}): Prisma.UserWhereInput | null => {
  const requested = (requestedSectorCode || '').trim();
  if (requested && isExcludedVadeSectorCode(requested)) return null;

  const excludedFilters = buildExcludedVadeSectorFilters();
  const notExcluded: Prisma.UserWhereInput = excludedFilters.length > 0
    ? { NOT: { OR: excludedFilters } }
    : {};

  if (!canAccessAll) {
    const assigned = assignedSectorCodes
      .map((code) => String(code).trim())
      .filter(Boolean)
      .filter((code) => !isExcludedVadeSectorCode(code));
    if (assigned.length === 0) return null;
    if (requested && !assigned.includes(requested)) return null;
    return {
      sectorCode: requested
        ? { equals: requested }
        : { in: assigned },
      ...notExcluded,
    };
  }

  if (requested) {
    return {
      sectorCode: { equals: requested },
      ...notExcluded,
    };
  }

  return {
    OR: [
      { sectorCode: null },
      {
        AND: [
          { sectorCode: { not: null } },
          notExcluded,
        ],
      },
    ],
  };
};
import { Prisma } from '@prisma/client';
