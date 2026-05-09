/**
 * Formatting utilities
 */

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
  }).format(amount);
};

const pad2 = (value: number): string => String(value).padStart(2, '0');

const parseManualDateParts = (value: string): { year: number; month: number; day: number; hour: number; minute: number } | null => {
  const text = String(value || '').trim();
  if (!text) return null;

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (isValidDateParts(year, month, day)) return { year, month, day, hour: 0, minute: 0 };
  }

  const isoMidnightMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})T00:00:00(?:\.000)?Z$/);
  if (isoMidnightMatch) {
    const year = Number(isoMidnightMatch[1]);
    const month = Number(isoMidnightMatch[2]);
    const day = Number(isoMidnightMatch[3]);
    if (isValidDateParts(year, month, day)) return { year, month, day, hour: 0, minute: 0 };
  }

  const trMatch = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::\d{1,2})?)?$/);
  if (trMatch) {
    const day = Number(trMatch[1]);
    const month = Number(trMatch[2]);
    const year = Number(trMatch[3]);
    const hour = trMatch[4] ? Number(trMatch[4]) : 0;
    const minute = trMatch[5] ? Number(trMatch[5]) : 0;
    if (isValidDateParts(year, month, day) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return { year, month, day, hour, minute };
    }
  }

  return null;
};

const isValidDateParts = (year: number, month: number, day: number): boolean => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 2500 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const parseSafeDate = (value: string): Date | null => {
  const manual = parseManualDateParts(value);
  if (manual) {
    return new Date(Date.UTC(manual.year, manual.month - 1, manual.day, manual.hour, manual.minute));
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatDate = (date: string): string => {
  const manual = parseManualDateParts(date);
  const parsed = parseSafeDate(date);
  if (!parsed) return date;

  return new Intl.DateTimeFormat('tr-TR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: manual ? 'UTC' : undefined,
  }).format(parsed);
};

export const formatDateShort = (date: string): string => {
  const manual = parseManualDateParts(date);
  if (manual) {
    return `${pad2(manual.day)}.${pad2(manual.month)}.${manual.year}`;
  }

  const parsed = parseSafeDate(date);
  if (!parsed) return date;

  return new Intl.DateTimeFormat('tr-TR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed);
};
