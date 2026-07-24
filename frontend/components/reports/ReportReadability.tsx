import {
  calculateDaysSince,
  formatDaysAgo,
  formatReportDate,
  formatReportDateTime,
  getReportFreshness,
} from '@/lib/reports/salesDecisionReportFormat';

export function ReportRecency({
  value,
  days,
  referenceDate,
  status,
}: {
  value?: string | null;
  days?: number | null;
  referenceDate?: string | Date | null;
  status?: string;
}) {
  if (!value) {
    return <span style={{ color: '#8b97ac' }}>-</span>;
  }

  const resolvedDays = days ?? calculateDaysSince(value, referenceDate || new Date());
  return (
    <span style={{ display: 'flex', minWidth: 0, flexDirection: 'column', gap: 2 }}>
      <span style={{ color: '#334155', whiteSpace: 'nowrap' }}>{formatReportDate(value)}</span>
      <span style={{ color: '#64748b', fontSize: 10.5, lineHeight: 1.3 }}>
        {formatDaysAgo(resolvedDays)}
        {status ? ` · ${status}` : ''}
      </span>
    </span>
  );
}

export function ReportFreshnessBadge({
  updatedAt,
  scheduleLabel = 'Varsayılan plan: her gün 02:30',
}: {
  updatedAt?: string | null;
  scheduleLabel?: string;
}) {
  const freshness = getReportFreshness(updatedAt);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 5 }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          borderRadius: 999,
          border: '1px solid #bfdbfe',
          background: '#eff6ff',
          color: '#1d4ed8',
          padding: '2px 7px',
          fontSize: 10,
          fontWeight: 700,
        }}
      >
        {updatedAt ? 'Son veri yenilemesi' : 'Yenileme kaydı yok'}
      </span>
      <span style={{ color: '#51607a', fontSize: 10.5 }}>
        {updatedAt
          ? `${formatReportDateTime(updatedAt)} · ${freshness.ageLabel}`
          : 'Son yenileme kaydı yok'}
      </span>
      <span style={{ color: '#8b97ac', fontSize: 10.5 }}>{scheduleLabel}</span>
    </div>
  );
}
