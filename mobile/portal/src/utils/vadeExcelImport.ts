export interface VadeExcelImportRow {
  mikroCariCode: string;
  customerName?: string | null;
  sectorCode?: string | null;
  groupCode?: string | null;
  regionCode?: string | null;
  sourceRowNumber?: number;
  pastDueBalance?: number;
  pastDueDate?: string | null;
  notDueBalance?: number;
  notDueDate?: string | null;
  totalBalance?: number;
  valor?: number;
  paymentTermLabel?: string | null;
  referenceDate?: string | null;
}

type VadeExcelColumnKey =
  | 'mikroCariCode'
  | 'customerName'
  | 'sectorCode'
  | 'groupCode'
  | 'regionCode'
  | 'pastDueBalance'
  | 'pastDueDate'
  | 'valor'
  | 'paymentTermLabel'
  | 'notDueBalance'
  | 'totalBalance'
  | 'notDueDate'
  | 'referenceDate';

type VadeColumnDefinition = {
  label: string;
  aliases: string[];
  excludes?: string[];
  critical?: boolean;
};

type VadeExcelColumnIndexes = Record<VadeExcelColumnKey, number>;

export interface ParseVadeExcelOptions {
  date1904?: boolean;
  formattedRows?: unknown[][];
  maxHeaderRows?: number;
}

export interface ParsedVadeExcel {
  rows: VadeExcelImportRow[];
  headers: unknown[];
  headerRowNumber: number;
}

export type VadeExcelParseErrorCode =
  | 'HEADER_NOT_FOUND'
  | 'MISSING_CRITICAL_COLUMNS'
  | 'INVALID_NUMBER'
  | 'INVALID_DATE';

export class VadeExcelParseError extends Error {
  readonly code: VadeExcelParseErrorCode;
  readonly sourceRowNumber?: number;
  readonly missingColumns?: string[];

  constructor(
    message: string,
    details: {
      code: VadeExcelParseErrorCode;
      sourceRowNumber?: number;
      missingColumns?: string[];
    },
  ) {
    super(message);
    this.name = 'VadeExcelParseError';
    this.code = details.code;
    this.sourceRowNumber = details.sourceRowNumber;
    this.missingColumns = details.missingColumns;
  }
}

const COLUMN_DEFINITIONS: Record<VadeExcelColumnKey, VadeColumnDefinition> = {
  mikroCariCode: {
    label: 'Cari hesap kodu',
    aliases: ['cari hesap kodu', 'cari kodu'],
    critical: true,
  },
  customerName: {
    label: 'Cari hesap adi',
    aliases: ['cari hesap adi', 'cari hesap unvani', 'cari unvani', 'cari adi'],
    critical: true,
  },
  sectorCode: {
    label: 'Sektor kodu',
    aliases: ['sektor kodu'],
    critical: true,
  },
  groupCode: {
    label: 'Grup kodu',
    aliases: ['grup kodu'],
    critical: true,
  },
  regionCode: {
    label: 'Bolge kodu',
    aliases: ['bolge kodu'],
  },
  pastDueBalance: {
    label: 'Vadesi gecen bakiye',
    aliases: ['vadesi gecen bakiye'],
    excludes: ['vadesi gecen bakiye vadesi'],
    critical: true,
  },
  pastDueDate: {
    label: 'Vadesi gecen bakiye vadesi',
    aliases: ['vadesi gecen bakiye vadesi'],
    critical: true,
  },
  valor: {
    label: 'Valor',
    aliases: ['valor'],
    critical: true,
  },
  paymentTermLabel: {
    label: 'Cari odeme vadesi',
    aliases: ['cari odeme vadesi'],
  },
  notDueBalance: {
    label: 'Vadesi gecmemis bakiye',
    aliases: ['vadesi gecmemis bakiye', 'vadesi gelmemis bakiye'],
    excludes: ['vadesi gecmemis bakiye vadesi', 'vadesi gelmemis bakiye vadesi'],
    critical: true,
  },
  totalBalance: {
    label: 'Toplam bakiye',
    aliases: ['toplam bakiye'],
    critical: true,
  },
  notDueDate: {
    label: 'Vadesi gecmemis bakiye vadesi',
    aliases: ['vadesi gecmemis bakiye vadesi', 'vadesi gelmemis bakiye vadesi'],
    critical: true,
  },
  referenceDate: {
    label: 'Bakiyeye konu ilk evrak tarihi',
    aliases: ['bakiyeye konu ilk evrak tarihi', 'bakiyeye konu ilk evrak'],
  },
};

const COLUMN_KEYS = Object.keys(COLUMN_DEFINITIONS) as VadeExcelColumnKey[];

const isBlank = (value: unknown) =>
  value === null || value === undefined || String(value).trim() === '';

const cleanText = (value: unknown) => {
  if (isBlank(value)) return null;
  return String(value).normalize('NFKC').trim() || null;
};

const normalizeHeader = (value: unknown) =>
  String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0131/g, 'i')
    .replace(/\s+/g, ' ')
    .trim();

const findColumn = (
  headers: unknown[],
  aliases: string[],
  options?: { excludes?: string[] },
) => {
  const normalizedHeaders = headers.map(normalizeHeader);
  const targets = aliases.map(normalizeHeader);
  const excludes = (options?.excludes || []).map(normalizeHeader);

  const exactIndex = normalizedHeaders.findIndex((header) => targets.includes(header));
  if (exactIndex !== -1) return exactIndex;

  return normalizedHeaders.findIndex(
    (header) =>
      targets.some((target) => header.includes(target))
      && !excludes.some((excluded) => header.includes(excluded)),
  );
};

const resolveColumnIndexes = (headers: unknown[]): VadeExcelColumnIndexes => {
  const indexes = {} as VadeExcelColumnIndexes;
  for (const key of COLUMN_KEYS) {
    const definition = COLUMN_DEFINITIONS[key];
    indexes[key] = findColumn(headers, definition.aliases, {
      excludes: definition.excludes,
    });
  }
  return indexes;
};

const scoreHeaderRow = (headers: unknown[]) => {
  const indexes = resolveColumnIndexes(headers);
  if (indexes.mikroCariCode === -1) return { score: -1, indexes };
  const score = COLUMN_KEYS.reduce(
    (total, key) => total + (indexes[key] !== -1 ? 1 : 0),
    0,
  );
  return { score, indexes };
};

const findHeaderRow = (worksheetRows: unknown[][], maxHeaderRows: number) => {
  let best:
    | {
        rowIndex: number;
        score: number;
        indexes: VadeExcelColumnIndexes;
      }
    | undefined;

  const scanCount = Math.min(worksheetRows.length, Math.max(1, maxHeaderRows));
  for (let rowIndex = 0; rowIndex < scanCount; rowIndex += 1) {
    const candidate = worksheetRows[rowIndex] || [];
    const { score, indexes } = scoreHeaderRow(candidate);
    if (score < 0) continue;
    if (!best || score > best.score) {
      best = { rowIndex, score, indexes };
    }
  }

  if (!best) {
    throw new VadeExcelParseError(
      `Ilk ${scanCount} satir icinde "Cari hesap kodu" basligi bulunamadi.`,
      { code: 'HEADER_NOT_FOUND' },
    );
  }

  return best;
};

const validateCriticalColumns = (indexes: VadeExcelColumnIndexes) => {
  const missingColumns = COLUMN_KEYS
    .filter((key) => COLUMN_DEFINITIONS[key].critical && indexes[key] === -1)
    .map((key) => COLUMN_DEFINITIONS[key].label);

  if (missingColumns.length > 0) {
    throw new VadeExcelParseError(
      `Zorunlu Excel kolonlari bulunamadi: ${missingColumns.join(', ')}`,
      {
        code: 'MISSING_CRITICAL_COLUMNS',
        missingColumns,
      },
    );
  }
};

const parseNumber = (value: unknown) => {
  if (isBlank(value)) return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (value instanceof Date) return null;

  let raw = String(value)
    .normalize('NFKC')
    .trim()
    .replace(/\u00a0/g, '')
    .replace(/\s+/g, '')
    .replace(/(?:TL|TRY|₺)$/i, '');

  if (raw === '-' || raw === '—') return 0;

  let negativeByParentheses = false;
  if (/^\(.*\)$/.test(raw)) {
    negativeByParentheses = true;
    raw = raw.slice(1, -1);
  }

  if (/^-?\d{1,3}(?:\.\d{3})*(?:,\d+)?$/.test(raw)) {
    raw = raw.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d+,\d+$/.test(raw)) {
    raw = raw.replace(',', '.');
  } else if (/^-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$/.test(raw)) {
    raw = raw.replace(/,/g, '');
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return negativeByParentheses ? -Math.abs(parsed) : parsed;
};

const pad2 = (value: number) => String(value).padStart(2, '0');

const buildIsoDate = (year: number, month: number, day: number) => {
  if (![year, month, day].every(Number.isInteger)) return null;
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year
    || probe.getUTCMonth() + 1 !== month
    || probe.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
};

const excelSerialToIsoDate = (serial: number, date1904: boolean) => {
  if (!Number.isFinite(serial)) return null;
  const wholeDays = Math.floor(serial);
  const baseUtc = date1904
    ? Date.UTC(1904, 0, 1)
    : Date.UTC(1899, 11, 30);
  const date = new Date(baseUtc + wholeDays * 86_400_000);
  return buildIsoDate(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
};

const parseDate = (value: unknown, date1904: boolean) => {
  if (isBlank(value)) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return buildIsoDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === 'number') {
    return excelSerialToIsoDate(value, date1904);
  }

  const raw = String(value).normalize('NFKC').trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    return buildIsoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const trMatch = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s.*)?$/);
  if (trMatch) {
    return buildIsoDate(Number(trMatch[3]), Number(trMatch[2]), Number(trMatch[1]));
  }

  return null;
};

const parseRequiredNumber = (
  value: unknown,
  sourceRowNumber: number,
  label: string,
) => {
  const parsed = parseNumber(value);
  if (parsed !== null) return parsed;
  throw new VadeExcelParseError(
    `${sourceRowNumber}. satirdaki "${label}" sayisal degil.`,
    {
      code: 'INVALID_NUMBER',
      sourceRowNumber,
    },
  );
};

const parseOptionalDate = (
  value: unknown,
  sourceRowNumber: number,
  label: string,
  date1904: boolean,
) => {
  if (isBlank(value)) return null;
  const parsed = parseDate(value, date1904);
  if (parsed) return parsed;
  throw new VadeExcelParseError(
    `${sourceRowNumber}. satirdaki "${label}" gecerli bir tarih degil.`,
    {
      code: 'INVALID_DATE',
      sourceRowNumber,
    },
  );
};

const valueAt = (row: unknown[], index: number) =>
  index === -1 ? undefined : row[index];

const resolveCariCode = (
  rawRow: unknown[],
  formattedRow: unknown[] | undefined,
  codeIndex: number,
) => {
  const rawValue = valueAt(rawRow, codeIndex);
  const formattedValue = formattedRow ? valueAt(formattedRow, codeIndex) : undefined;
  const preferredValue =
    typeof rawValue === 'number' && !isBlank(formattedValue)
      ? formattedValue
      : rawValue;
  return cleanText(preferredValue) || '';
};

export const parseVadeExcelWorksheet = (
  worksheetRows: unknown[][],
  options: ParseVadeExcelOptions = {},
): ParsedVadeExcel => {
  if (!Array.isArray(worksheetRows) || worksheetRows.length === 0) {
    throw new VadeExcelParseError('Excel sayfasi bos.', {
      code: 'HEADER_NOT_FOUND',
    });
  }

  const { rowIndex: headerRowIndex, indexes } = findHeaderRow(
    worksheetRows,
    options.maxHeaderRows ?? 50,
  );
  validateCriticalColumns(indexes);

  const rows: VadeExcelImportRow[] = [];
  const date1904 = options.date1904 === true;

  for (let rowIndex = headerRowIndex + 1; rowIndex < worksheetRows.length; rowIndex += 1) {
    const row = worksheetRows[rowIndex] || [];
    const sourceRowNumber = rowIndex + 1;
    const formattedRow = options.formattedRows?.[rowIndex];
    const mikroCariCode = resolveCariCode(row, formattedRow, indexes.mikroCariCode);
    if (!mikroCariCode) continue;

    rows.push({
      mikroCariCode,
      customerName: cleanText(valueAt(row, indexes.customerName)),
      sectorCode: cleanText(valueAt(row, indexes.sectorCode)),
      groupCode: cleanText(valueAt(row, indexes.groupCode)),
      regionCode: cleanText(valueAt(row, indexes.regionCode)),
      sourceRowNumber,
      pastDueBalance: parseRequiredNumber(
        valueAt(row, indexes.pastDueBalance),
        sourceRowNumber,
        COLUMN_DEFINITIONS.pastDueBalance.label,
      ),
      pastDueDate: parseOptionalDate(
        valueAt(row, indexes.pastDueDate),
        sourceRowNumber,
        COLUMN_DEFINITIONS.pastDueDate.label,
        date1904,
      ),
      notDueBalance: parseRequiredNumber(
        valueAt(row, indexes.notDueBalance),
        sourceRowNumber,
        COLUMN_DEFINITIONS.notDueBalance.label,
      ),
      notDueDate: parseOptionalDate(
        valueAt(row, indexes.notDueDate),
        sourceRowNumber,
        COLUMN_DEFINITIONS.notDueDate.label,
        date1904,
      ),
      totalBalance: parseRequiredNumber(
        valueAt(row, indexes.totalBalance),
        sourceRowNumber,
        COLUMN_DEFINITIONS.totalBalance.label,
      ),
      valor: parseRequiredNumber(
        valueAt(row, indexes.valor),
        sourceRowNumber,
        COLUMN_DEFINITIONS.valor.label,
      ),
      paymentTermLabel: cleanText(valueAt(row, indexes.paymentTermLabel)),
      referenceDate:
        indexes.referenceDate === -1
          ? null
          : parseOptionalDate(
              valueAt(row, indexes.referenceDate),
              sourceRowNumber,
              COLUMN_DEFINITIONS.referenceDate.label,
              date1904,
            ),
    });
  }

  if (rows.length === 0) {
    throw new VadeExcelParseError('Islenecek cari satiri bulunamadi.', {
      code: 'HEADER_NOT_FOUND',
    });
  }

  return {
    rows,
    headers: worksheetRows[headerRowIndex] || [],
    headerRowNumber: headerRowIndex + 1,
  };
};
