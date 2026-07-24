import { z } from 'zod';
import { AppError, ErrorCode } from '../types/errors';

export const MANAGEMENT_PROFIT_REPORT_SCHEMA_VERSION = 1;
export const MANAGEMENT_PROFIT_REPORT_TIME_ZONE = 'Europe/Istanbul';
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

export const MANAGEMENT_PROFIT_REPORT_ROW_FIELDS = {
  CUSTOMER_SECTOR_CODE: {
    id: 'CUSTOMER_SECTOR_CODE',
    label: 'CARİ SEKTÖR KODU',
    sqlColumn: '[CARİ SEKTÖR KODU]',
  },
  GROUP_NAME: {
    id: 'GROUP_NAME',
    label: 'GRUP İSMİ',
    sqlColumn: '[msg_S_0136]',
  },
  CUSTOMER_NAME: {
    id: 'CUSTOMER_NAME',
    label: 'CARİ İSMİ',
    sqlColumn: '[msg_S_0201]',
  },
  STOCK: {
    id: 'STOCK',
    label: 'STOK',
    sqlColumn: '[msg_S_0199]',
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

export const resolveIstanbulMonthToDate = (instant = new Date()) => {
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

export const managementProfitReportFieldCatalog = {
  rows: rowFieldIds.map((id) => ({
    id,
    label: MANAGEMENT_PROFIT_REPORT_ROW_FIELDS[id].label,
  })),
  columns: [{ id: 'MONTH' as const, label: 'AY' }],
  values: [{ id: 'SALES_AMOUNT' as const, label: 'SATIŞ TUTARI' }],
};
