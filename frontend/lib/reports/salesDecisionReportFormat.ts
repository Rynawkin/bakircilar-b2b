const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

const toUtcCalendarDate = (value: string | Date | null | undefined): Date | null => {
  if (!value) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  const raw = value.trim();
  if (!raw) return null;

  const compactMatch = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  const dateMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const match = compactMatch || dateMatch;
  if (match) {
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
};

export const calculateDaysSince = (
  value: string | Date | null | undefined,
  reference: string | Date | null | undefined = new Date()
): number | null => {
  const date = toUtcCalendarDate(value);
  const referenceDate = toUtcCalendarDate(reference);
  if (!date || !referenceDate) return null;
  return Math.max(0, Math.floor((referenceDate.getTime() - date.getTime()) / DAY_MS));
};

export const formatReportDate = (value: string | Date | null | undefined): string => {
  const date = toUtcCalendarDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
};

export const formatReportDateTime = (value: string | Date | null | undefined): string => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  }).format(date);
};

export const formatDaysAgo = (days: number | null | undefined): string => {
  if (days === null || days === undefined || !Number.isFinite(days)) return '-';
  const normalized = Math.max(0, Math.floor(days));
  if (normalized === 0) return '0 gün önce · bugün';
  if (normalized === 1) return '1 gün önce · dün';
  return `${normalized.toLocaleString('tr-TR')} gün önce`;
};

export interface ReportFreshness {
  ageLabel: string;
  hoursSinceUpdate: number | null;
}

export const getReportFreshness = (
  updatedAt: string | Date | null | undefined,
  reference: string | Date = new Date()
): ReportFreshness => {
  if (!updatedAt) {
    return { ageLabel: 'yenileme zamanı bilinmiyor', hoursSinceUpdate: null };
  }

  const updated = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  const now = reference instanceof Date ? reference : new Date(reference);
  if (Number.isNaN(updated.getTime()) || Number.isNaN(now.getTime())) {
    return { ageLabel: 'yenileme zamanı geçersiz', hoursSinceUpdate: null };
  }

  const hours = Math.max(0, Math.floor((now.getTime() - updated.getTime()) / HOUR_MS));
  const ageLabel = hours < 24
    ? `${hours} saat önce`
    : `${Math.floor(hours / 24)} gün önce`;

  return { ageLabel, hoursSinceUpdate: hours };
};
