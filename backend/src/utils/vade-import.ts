export type VadeImportRowLike = {
  mikroCariCode?: unknown;
};

export type PreparedVadeImportRow<T extends VadeImportRowLike> = {
  row: T;
  /**
   * One-based position in the rows supplied to prepareVadeImportRows.
   * This is a payload row number, not necessarily the original Excel row.
   */
  sourceRowNumber: number;
  code: string;
  canonicalCode: string;
};

export type DuplicateVadeImportRow<T extends VadeImportRowLike> =
  PreparedVadeImportRow<T> & {
    reason: 'DUPLICATE_CARI_CODE';
    keptSourceRowNumber: number;
    keptCode: string;
  };

export type PreparedVadeImportRows<T extends VadeImportRowLike> = {
  uniqueRows: PreparedVadeImportRow<T>[];
  duplicateRows: DuplicateVadeImportRow<T>[];
};

export type VadeImportAmountLike = {
  pastDueBalance?: number | null;
  notDueBalance?: number | null;
  totalBalance?: number | null;
};

export type VadeImportNumericLike = VadeImportAmountLike & {
  valor?: number | null;
};

export const VADE_SNAPSHOT_REQUIRED_NUMERIC_FIELDS = [
  'pastDueBalance',
  'notDueBalance',
  'totalBalance',
  'valor',
] as const;

export type VadeSnapshotRequiredNumericField =
  (typeof VADE_SNAPSHOT_REQUIRED_NUMERIC_FIELDS)[number];

const UNICODE_WHITESPACE_OR_FORMAT = /[\p{White_Space}\p{Cf}]+/gu;

const displayVadeCariCode = (value: unknown) => {
  if (value === null || value === undefined) return '';
  return String(value).normalize('NFKC').trim();
};

/**
 * Builds a stable comparison key without changing meaningful punctuation or
 * leading zeroes. Compatibility-width characters, invisible format marks and
 * whitespace are normalized so Excel and PostgreSQL values can be compared
 * through the same function.
 */
export const normalizeVadeCariCode = (value: unknown) =>
  displayVadeCariCode(value)
    .replace(UNICODE_WHITESPACE_OR_FORMAT, '')
    // Cari kodu bir kimliktir; Turkish locale casing ASCII "i"yi "İ"ye
    // cevirmemeli. Dort I varyantini ayni anahtara indirip diger anlamli
    // karakterleri koruyoruz.
    .replace(/\u0130/g, 'I')
    .replace(/\u0131/g, 'i')
    .toUpperCase();

/**
 * Creates a deterministic canonical index and keeps ambiguous database
 * identities visible instead of silently selecting one of them.
 */
export const indexByCanonicalVadeCariCode = <T>(
  items: readonly T[],
  getCode: (item: T) => unknown,
  relevantCodes?: ReadonlySet<string>,
) => {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const canonicalCode = normalizeVadeCariCode(getCode(item));
    if (!canonicalCode) continue;
    if (relevantCodes && !relevantCodes.has(canonicalCode)) continue;
    const group = groups.get(canonicalCode);
    if (group) {
      group.push(item);
    } else {
      groups.set(canonicalCode, [item]);
    }
  }

  const uniqueByCode = new Map<string, T>();
  const collisions = new Map<string, T[]>();
  for (const [canonicalCode, group] of groups) {
    if (group.length === 1) {
      uniqueByCode.set(canonicalCode, group[0]);
    } else {
      collisions.set(canonicalCode, group);
    }
  }

  return { uniqueByCode, collisions };
};

const finiteVadeAmount = (value: number | null | undefined, fallback = 0) =>
  Number.isFinite(value) ? Number(value) : fallback;

export const getMissingVadeSnapshotNumericFields = (
  row: VadeImportNumericLike,
): VadeSnapshotRequiredNumericField[] =>
  VADE_SNAPSHOT_REQUIRED_NUMERIC_FIELDS.filter(
    (field) => !Number.isFinite(row[field]),
  );

/**
 * PATCH imports must not turn an omitted amount into zero. Zero remains an
 * explicit update, while undefined/null/non-finite values remain untouched.
 */
export const buildVadeImportNumericPatch = (
  row: VadeImportNumericLike,
) => {
  const patch: Partial<Record<VadeSnapshotRequiredNumericField, number>> = {};
  if (Number.isFinite(row.pastDueBalance)) {
    patch.pastDueBalance = Number(row.pastDueBalance);
  }
  if (Number.isFinite(row.notDueBalance)) {
    patch.notDueBalance = Number(row.notDueBalance);
  }
  if (Number.isFinite(row.totalBalance)) {
    patch.totalBalance = Number(row.totalBalance);
  }
  if (Number.isFinite(row.valor)) {
    patch.valor = Math.trunc(Number(row.valor));
  }
  return patch;
};

/**
 * Keeps the Excel overdue/not-due buckets canonical. In particular, a
 * negative value in one bucket is not silently offset against the other.
 */
export const resolveVadeImportAmounts = (row: VadeImportAmountLike) => {
  const pastDueBalance = finiteVadeAmount(row.pastDueBalance);
  const notDueBalance = finiteVadeAmount(row.notDueBalance);
  return {
    pastDueBalance,
    notDueBalance,
    totalBalance: finiteVadeAmount(
      row.totalBalance,
      pastDueBalance + notDueBalance,
    ),
  };
};

/**
 * Prepares rows for a deterministic import plan.
 *
 * Duplicate handling intentionally matches the existing sequential-upsert
 * outcome: the final occurrence wins. Earlier occurrences are returned as
 * explicit duplicate rows instead of being silently overwritten.
 *
 * Empty canonical codes are not deduplicated; callers can classify each one
 * with their own validation/skip reason.
 */
export const prepareVadeImportRows = <T extends VadeImportRowLike>(
  rows: readonly T[],
): PreparedVadeImportRows<T> => {
  const preparedRows: PreparedVadeImportRow<T>[] = rows.map((row, index) => ({
    row,
    sourceRowNumber: index + 1,
    code: displayVadeCariCode(row.mikroCariCode),
    canonicalCode: normalizeVadeCariCode(row.mikroCariCode),
  }));

  const lastIndexByCanonicalCode = new Map<string, number>();
  preparedRows.forEach((preparedRow, index) => {
    if (preparedRow.canonicalCode) {
      lastIndexByCanonicalCode.set(preparedRow.canonicalCode, index);
    }
  });

  const uniqueRows: PreparedVadeImportRow<T>[] = [];
  const duplicateRows: DuplicateVadeImportRow<T>[] = [];

  preparedRows.forEach((preparedRow, index) => {
    if (!preparedRow.canonicalCode) {
      uniqueRows.push(preparedRow);
      return;
    }

    const keptIndex = lastIndexByCanonicalCode.get(preparedRow.canonicalCode);
    if (keptIndex === undefined || keptIndex === index) {
      uniqueRows.push(preparedRow);
      return;
    }

    const keptRow = preparedRows[keptIndex];
    duplicateRows.push({
      ...preparedRow,
      reason: 'DUPLICATE_CARI_CODE',
      keptSourceRowNumber: keptRow.sourceRowNumber,
      keptCode: keptRow.code,
    });
  });

  return { uniqueRows, duplicateRows };
};
