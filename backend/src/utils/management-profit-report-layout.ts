import { z } from 'zod';
import { AppError, ErrorCode } from '../types/errors';

export const MANAGEMENT_PROFIT_REPORT_SCHEMA_VERSION = 1;
export const MANAGEMENT_PROFIT_REPORT_TIME_ZONE = 'Europe/Istanbul';
export const MANAGEMENT_PROFIT_REPORT_MAX_MONTHS = 12;
const TURKISH_MONTH_NAMES = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
] as const;

export type ManagementProfitReportPeriod = {
  preset: 'ISTANBUL_MONTH_TO_DATE' | 'CUSTOM';
  startDate: string;
  endDate: string;
  label: string;
  timeZone: typeof MANAGEMENT_PROFIT_REPORT_TIME_ZONE;
};

export const MANAGEMENT_PROFIT_REPORT_ROW_FIELDS = {
  CUSTOMER_SECTOR_CODE: {
    id: 'CUSTOMER_SECTOR_CODE',
    label: 'CARİ SEKTÖR KODU',
    sqlColumn: '[CARİ SEKTÖR KODU]',
  },
  // GROUP_NAME is persisted in schema-v1 saved layouts. Keep the stable id
  // while exposing the corrected business meaning and live TVF column.
  GROUP_NAME: {
    id: 'GROUP_NAME',
    label: 'CARİ GRUP KODU',
    sqlColumn: '[msg_S_2872]',
  },
  CUSTOMER_NAME: {
    id: 'CUSTOMER_NAME',
    label: 'CARİ İSMİ',
    sqlColumn: '[msg_S_0201]',
  },
  STOCK: {
    id: 'STOCK',
    label: 'STOK',
    sqlColumn: '[msg_S_0542]',
  },
} as const;

export type ManagementProfitReportRowField =
  keyof typeof MANAGEMENT_PROFIT_REPORT_ROW_FIELDS;

export type ManagementProfitReportLayout = {
  schemaVersion: 1;
  rowFields: ManagementProfitReportRowField[];
  columnField: 'MONTH';
  valueField: 'SALES_AMOUNT';
  defaultExpandedDepth: number;
  sort: 'TOTAL_DESC' | 'TOTAL_ASC' | 'LABEL_ASC' | 'LABEL_DESC';
  showGrandTotal: boolean;
};

export type ManagementProfitReportPathItem = {
  field: ManagementProfitReportRowField;
  value: string;
};

export const DEFAULT_MANAGEMENT_PROFIT_REPORT_LAYOUT: ManagementProfitReportLayout = {
  schemaVersion: MANAGEMENT_PROFIT_REPORT_SCHEMA_VERSION,
  rowFields: ['CUSTOMER_SECTOR_CODE', 'GROUP_NAME', 'CUSTOMER_NAME', 'STOCK'],
  columnField: 'MONTH',
  valueField: 'SALES_AMOUNT',
  defaultExpandedDepth: 0,
  sort: 'LABEL_ASC',
  showGrandTotal: true,
};

const rowFieldIds = Object.keys(
  MANAGEMENT_PROFIT_REPORT_ROW_FIELDS
) as ManagementProfitReportRowField[];

const layoutSchema = z
  .object({
    schemaVersion: z.literal(MANAGEMENT_PROFIT_REPORT_SCHEMA_VERSION),
    rowFields: z
      .array(z.enum(rowFieldIds as [ManagementProfitReportRowField, ...ManagementProfitReportRowField[]]))
      .min(1)
      .max(rowFieldIds.length),
    columnField: z.literal('MONTH'),
    valueField: z.literal('SALES_AMOUNT'),
    // Deeper automatic expansion fans out into hundreds of Mikro requests.
    // One level is enough for a saved default; deeper levels stay lazy/manual.
    defaultExpandedDepth: z.number().int().min(0).max(1),
    sort: z.enum(['TOTAL_DESC', 'TOTAL_ASC', 'LABEL_ASC', 'LABEL_DESC']),
    showGrandTotal: z.boolean(),
  })
  .strict()
  .superRefine((layout, context) => {
    if (new Set(layout.rowFields).size !== layout.rowFields.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rowFields'],
        message: 'Satır alanları tekrarlanamaz.',
      });
    }
    if (layout.defaultExpandedDepth >= layout.rowFields.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['defaultExpandedDepth'],
        message: 'Varsayılan açılım derinliği satır alanlarından küçük olmalıdır.',
      });
    }
  });

const pathItemSchema = z
  .object({
    field: z.enum(rowFieldIds as [ManagementProfitReportRowField, ...ManagementProfitReportRowField[]]),
    value: z.string().trim().min(1).max(250),
  })
  .strict();

export const normalizeManagementProfitReportLayout = (
  input: unknown
): ManagementProfitReportLayout => {
  const result = layoutSchema.safeParse(input);
  if (!result.success) {
    throw new AppError(
      'Rapor görünümü geçersiz.',
      400,
      ErrorCode.VALIDATION_ERROR,
      {
        reportAccessCode: 'LAYOUT_INVALID',
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      }
    );
  }
  return result.data;
};

export const normalizeManagementProfitReportPath = (
  input: unknown,
  layout: ManagementProfitReportLayout
): ManagementProfitReportPathItem[] => {
  const result = z.array(pathItemSchema).max(layout.rowFields.length - 1).safeParse(input ?? []);
  if (!result.success) {
    throw new AppError(
      'Rapor kırılım yolu geçersiz.',
      400,
      ErrorCode.VALIDATION_ERROR,
      { reportAccessCode: 'PATH_INVALID' }
    );
  }

  result.data.forEach((item, index) => {
    if (item.field !== layout.rowFields[index]) {
      throw new AppError(
        'Rapor kırılım yolu görünümle eşleşmiyor.',
        400,
        ErrorCode.VALIDATION_ERROR,
        { reportAccessCode: 'PATH_SCOPE_INVALID' }
      );
    }
  });
  return result.data;
};

const datePartsInTimeZone = (instant: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || '';
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
  };
};

type ParsedDateKey = {
  key: string;
  year: number;
  month: number;
  day: number;
};

const periodInputSchema = z
  .object({
    startDate: z.string(),
    endDate: z.string(),
  })
  .strict();

const signedPeriodSchema = z
  .object({
    preset: z.enum(['ISTANBUL_MONTH_TO_DATE', 'CUSTOM']),
    startDate: z.string(),
    endDate: z.string(),
    label: z.string().trim().min(1).max(160),
    timeZone: z.literal(MANAGEMENT_PROFIT_REPORT_TIME_ZONE),
  })
  .strict();

const parseDateKey = (value: unknown): ParsedDateKey | null => {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }
  return { key: value, year, month, day };
};

const istanbulToday = (instant: Date) => {
  const { year, month, day } = datePartsInTimeZone(
    instant,
    MANAGEMENT_PROFIT_REPORT_TIME_ZONE
  );
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) {
    throw new AppError(
      'Rapor tarihi hesaplanamadı.',
      500,
      ErrorCode.INTERNAL_SERVER_ERROR
    );
  }
  return {
    year,
    month,
    day,
    key: `${year}-${month}-${day}`,
  };
};

const formatPeriodDate = (date: ParsedDateKey) =>
  `${date.day} ${TURKISH_MONTH_NAMES[date.month - 1]} ${date.year}`;

const customPeriodLabel = (start: ParsedDateKey, end: ParsedDateKey) =>
  start.key === end.key
    ? formatPeriodDate(start)
    : `${formatPeriodDate(start)} – ${formatPeriodDate(end)}`;

const monthSpan = (start: ParsedDateKey, end: ParsedDateKey) =>
  (end.year - start.year) * 12 + end.month - start.month + 1;

const periodValidationError = (message: string, reportAccessCode: string) =>
  new AppError(message, 400, ErrorCode.VALIDATION_ERROR, {
    reportAccessCode,
  });

export const resolveIstanbulMonthToDate = (
  instant = new Date()
): ManagementProfitReportPeriod => {
  const { year, month, day } = istanbulToday(instant);
  return {
    preset: 'ISTANBUL_MONTH_TO_DATE' as const,
    startDate: `${year}-${month}-01`,
    endDate: `${year}-${month}-${day}`,
    label:
      Number(day) === 1
        ? `1 ${TURKISH_MONTH_NAMES[Number(month) - 1]} ${year}`
        : `1–${Number(day)} ${TURKISH_MONTH_NAMES[Number(month) - 1]} ${year}`,
    timeZone: MANAGEMENT_PROFIT_REPORT_TIME_ZONE,
  };
};

export const resolveManagementProfitReportPeriod = (
  input: unknown,
  instant = new Date()
): ManagementProfitReportPeriod => {
  if (input === undefined || input === null) {
    return resolveIstanbulMonthToDate(instant);
  }

  const result = periodInputSchema.safeParse(input);
  if (!result.success) {
    throw periodValidationError(
      'Rapor tarih aralığı geçersiz.',
      'REPORT_PERIOD_INVALID'
    );
  }

  const start = parseDateKey(result.data.startDate);
  const end = parseDateKey(result.data.endDate);
  if (!start || !end) {
    throw periodValidationError(
      'Rapor tarih aralığı geçersiz.',
      'REPORT_PERIOD_INVALID'
    );
  }
  if (start.key > end.key) {
    throw periodValidationError(
      'Rapor başlangıç tarihi bitiş tarihinden sonra olamaz.',
      'REPORT_PERIOD_ORDER_INVALID'
    );
  }

  const today = istanbulToday(instant);
  if (end.key > today.key) {
    throw periodValidationError(
      'Rapor bitiş tarihi bugünden ileri olamaz.',
      'REPORT_PERIOD_FUTURE_INVALID'
    );
  }
  if (monthSpan(start, end) > MANAGEMENT_PROFIT_REPORT_MAX_MONTHS) {
    throw periodValidationError(
      `Rapor tarih aralığı en fazla ${MANAGEMENT_PROFIT_REPORT_MAX_MONTHS} takvim ayı olabilir.`,
      'REPORT_PERIOD_TOO_LARGE'
    );
  }

  return {
    preset: 'CUSTOM',
    startDate: start.key,
    endDate: end.key,
    label: customPeriodLabel(start, end),
    timeZone: MANAGEMENT_PROFIT_REPORT_TIME_ZONE,
  };
};

export const isValidManagementProfitReportPeriod = (
  input: unknown,
  instant = new Date()
): input is ManagementProfitReportPeriod => {
  const result = signedPeriodSchema.safeParse(input);
  if (!result.success) return false;

  const start = parseDateKey(result.data.startDate);
  const end = parseDateKey(result.data.endDate);
  if (!start || !end || start.key > end.key) return false;
  if (end.key > istanbulToday(instant).key) return false;
  if (monthSpan(start, end) > MANAGEMENT_PROFIT_REPORT_MAX_MONTHS) return false;

  if (result.data.preset === 'ISTANBUL_MONTH_TO_DATE') {
    return start.day === 1
      && start.year === end.year
      && start.month === end.month;
  }
  return true;
};

export const managementProfitReportFieldCatalog = {
  rows: rowFieldIds.map((id) => ({
    id,
    label: MANAGEMENT_PROFIT_REPORT_ROW_FIELDS[id].label,
  })),
  columns: [{ id: 'MONTH' as const, label: 'AY' }],
  values: [{ id: 'SALES_AMOUNT' as const, label: 'SATIŞ TUTARI' }],
};
