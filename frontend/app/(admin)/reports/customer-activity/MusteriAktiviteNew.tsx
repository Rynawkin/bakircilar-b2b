'use client';

import { useMemo } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Download,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  useMusteriAktivite,
  formatDuration,
  formatDateTime,
  typeLabels,
  type ActivityType,
  type ActivityEventRow,
} from './useMusteriAktivite';

/**
 * Yeni gorunum: Musteri Aktivite Takibi raporu — "Analitik Panel" (Yon 1b).
 *
 * Lacivert komuta basligi (KPI hero kutucuklari) + Aktivite Trendi (alan grafigi)
 * + Olay Dagilimi (donut) + Donusum Hunisi + lacivert baslikli listeler + Detayli Olay Listesi.
 *
 * TUM is mantigi useMusteriAktivite hook'undan gelir; hicbir handler/kolon/filtre/ozet sayisi
 * dusurulmemistir. Trend/Funnel/Donut/Sparkline yalnizca mevcut veriden (summary + dailyCounts)
 * TURETILIR; ek API cagrisi yapilmaz. dailyCounts yoksa trend/sparkline bolumu zarif bos kalir.
 */

// ---- Design tokens (handoff) ----
const NAVY = '#15356b';
const NAVY_DEEP = '#102a55';
const BLUE = '#2f6fc0';
const CYAN = '#1399d6';
const INK = '#16243d';
const MUTED = '#5d6b84';
const FAINT = '#93a0b5';
const LINE = '#e6eaf1';
const SOFT_LINE = '#eef1f6';
const ROW_LINE = '#f4f6fa';
const PANEL = '#f7f9fc';
const SUCCESS = '#0f7a4d';
const DANGER = '#b4283b';
const WARN = '#b9791f';
const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const NAVY_GRADIENT = `linear-gradient(135deg, ${NAVY_DEEP} 0%, #173d77 55%, #1b4a8e 100%)`;

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: `1px solid ${LINE}`,
  borderRadius: 14,
  boxShadow: '0 1px 2px rgba(16,36,77,.04)',
};

const numeric: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };
const cellRight: React.CSSProperties = { textAlign: 'right', ...numeric };

// Tip rozeti renkleri (typeLabels[].variant ile eslesir)
const badgeColors: Record<
  'default' | 'info' | 'success' | 'warning' | 'danger',
  { bg: string; fg: string }
> = {
  default: { bg: SOFT_LINE, fg: MUTED },
  info: { bg: '#e6effb', fg: '#1e5fa8' },
  success: { bg: '#e8f6ee', fg: SUCCESS },
  warning: { bg: '#fdf2e3', fg: WARN },
  danger: { bg: '#fdecec', fg: DANGER },
};

function TypeBadge({ type }: { type: ActivityType }) {
  const meta = typeLabels[type];
  const colors = badgeColors[meta.variant];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 22,
        padding: '0 10px',
        borderRadius: 7,
        fontSize: 11,
        fontWeight: 700,
        background: colors.bg,
        color: colors.fg,
        whiteSpace: 'nowrap',
      }}
    >
      {meta.label}
    </span>
  );
}

// Detayli olay listesi grid: Zaman | Tip | Kullanici | Cari | Sayfa/Urun | Adet | Sure | Tiklama
const EVENT_GRID = '150px 116px 1fr 1.2fr 1.6fr 64px 92px 78px';

function renderEventTarget(event: ActivityEventRow) {
  if (event.productCode) {
    return (
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: '#8593a8' }}>{event.productCode}</div>
        <div style={{ fontSize: 11.5, color: '#3f5273' }}>{event.productName || '-'}</div>
      </div>
    );
  }
  if (event.type === 'SEARCH') {
    const query = typeof event.meta === 'object' && event.meta ? (event.meta as any).query : '';
    return (
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: INK }}>Arama: {query || '-'}</div>
        <div style={{ fontFamily: MONO, fontSize: 9.5, color: FAINT }}>{event.pagePath || '-'}</div>
      </div>
    );
  }
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: '#3f5273' }}>{event.pagePath || '-'}</div>
      {event.pageTitle && <div style={{ fontSize: 11, color: FAINT }}>{event.pageTitle}</div>}
    </div>
  );
}

// ---- Kucuk yardimci formatlayicilar ----
const fmtInt = (value: number) => new Intl.NumberFormat('tr-TR').format(Math.round(value || 0));

const shortDate = (iso: string) => {
  // "2026-06-30" -> "30 Haz" benzeri kisa etiket
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', timeZone: 'UTC' });
};

// Aktif sure -> "4s 12dk" gibi parcali render (KPI vurgusu icin)
function ActiveDurationValue({ seconds }: { seconds: number }) {
  const total = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const unit: React.CSSProperties = { fontSize: 14, color: '#aac3e6', fontWeight: 700 };
  if (h > 0) {
    return (
      <span>
        {h}
        <span style={unit}>s </span>
        {m}
        <span style={unit}>dk</span>
      </span>
    );
  }
  if (m > 0) {
    return (
      <span>
        {m}
        <span style={unit}>dk </span>
        {s}
        <span style={unit}>sn</span>
      </span>
    );
  }
  return (
    <span>
      {s}
      <span style={unit}>sn</span>
    </span>
  );
}

// ---- Sparkline (KPI hero) ----
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (!values || values.length < 2) return null;
  const w = 48;
  const h = 20;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = w / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = h - 2 - ((v - min) / span) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" preserveAspectRatio="none">
      <polyline
        points={points}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---- Aktivite Trendi (alan grafigi) ----
function TrendChart({ data }: { data: { date: string; count: number }[] }) {
  const W = 560;
  const H = 150;
  const padTop = 20;
  const padBottom = 20;
  const left = 10;
  const right = W - 10;
  const max = Math.max(...data.map((d) => d.count), 1);
  const n = data.length;
  const xAt = (i: number) => (n <= 1 ? left : left + ((right - left) * i) / (n - 1));
  const yAt = (v: number) => padTop + (H - padTop - padBottom) * (1 - v / max);

  const linePts = data.map((d, i) => `${xAt(i).toFixed(1)},${yAt(d.count).toFixed(1)}`).join(' ');
  const areaPts = `${linePts} ${xAt(n - 1).toFixed(1)},${(H - padBottom).toFixed(1)} ${xAt(0).toFixed(
    1,
  )},${(H - padBottom).toFixed(1)}`;

  // zirve (peak) noktasini cyan vurgula
  let peakIdx = 0;
  data.forEach((d, i) => {
    if (d.count > data[peakIdx].count) peakIdx = i;
  });

  const gridLines = [20, 55, 90, 125];

  return (
    <>
      <svg
        style={{ width: '100%', height: 'auto', display: 'block', marginTop: 14 }}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
      >
        {gridLines.map((y) => (
          <line key={y} x1={left} y1={y} x2={right} y2={y} stroke="#f0f3f8" strokeWidth={1} />
        ))}
        <polyline points={areaPts} fill={NAVY} opacity={0.08} stroke="none" />
        <polyline
          points={linePts}
          fill="none"
          stroke={NAVY}
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {data.map((d, i) => {
          const isPeak = i === peakIdx && d.count > 0;
          return (
            <g key={d.date}>
              {isPeak && <circle cx={xAt(i)} cy={yAt(d.count)} r={7.5} fill={CYAN} opacity={0.18} />}
              <circle cx={xAt(i)} cy={yAt(d.count)} r={isPeak ? 4 : 3} fill={isPeak ? CYAN : NAVY} />
            </g>
          );
        })}
      </svg>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          color: '#aeb8c8',
          marginTop: 5,
          fontFamily: MONO,
        }}
      >
        {data.map((d) => (
          <span key={d.date}>{shortDate(d.date)}</span>
        ))}
      </div>
    </>
  );
}

// ---- Olay Dagilimi (donut) ----
function Donut({
  segments,
  total,
}: {
  segments: { label: string; value: number; color: string }[];
  total: number;
}) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const safeTotal = total > 0 ? total : 1;
  let offset = 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14 }}>
      <svg width={118} height={118} viewBox="0 0 120 120" style={{ flexShrink: 0 }}>
        <g transform="rotate(-90 60 60)" fill="none" strokeWidth={18}>
          {segments.map((seg) => {
            const len = (seg.value / safeTotal) * c;
            const dash = `${len.toFixed(2)} ${(c - len).toFixed(2)}`;
            const circle = (
              <circle
                key={seg.label}
                cx={60}
                cy={60}
                r={r}
                stroke={seg.color}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return circle;
          })}
        </g>
        <text
          x={60}
          y={56}
          textAnchor="middle"
          style={{ fontWeight: 800, fontSize: 22, fill: INK, ...numeric }}
        >
          {fmtInt(total)}
        </text>
        <text
          x={60}
          y={73}
          textAnchor="middle"
          style={{ fontWeight: 600, fontSize: 10, fill: FAINT }}
        >
          toplam olay
        </text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 11.5, flex: 1 }}>
        {segments.map((seg) => {
          const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0;
          return (
            <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
              <span style={{ color: MUTED, fontWeight: 600 }}>{seg.label}</span>
              <span style={{ marginLeft: 'auto', color: INK, fontWeight: 800, ...numeric }}>%{pct}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Goreli barli liste satiri ----
function BarRow({
  label,
  sub,
  value,
  ghost,
  max,
  color,
  mono,
}: {
  label: string;
  sub?: React.ReactNode;
  value: number;
  ghost?: React.ReactNode;
  max: number;
  color: string;
  mono?: boolean;
}) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span
          style={{
            fontFamily: mono ? MONO : 'inherit',
            fontSize: mono ? 11 : 12,
            color: mono ? '#3f5273' : INK,
            fontWeight: mono ? 400 : 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
        >
          {label}
          {sub}
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: INK, ...numeric, whiteSpace: 'nowrap' }}>
          {fmtInt(value)}
          {ghost}
        </span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: SOFT_LINE, marginTop: 6 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3 }} />
      </div>
    </div>
  );
}

const panelHeader: React.CSSProperties = {
  padding: '11px 16px',
  background: '#eef3fa',
  borderBottom: '1px solid #e3eaf4',
  fontSize: 12,
  fontWeight: 700,
  color: NAVY,
};

export default function MusteriAktiviteNew() {
  const {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    customerSearch,
    setCustomerSearch,
    customerCode,
    setCustomerCode,
    customerName,
    setCustomerName,
    customerOptions,
    customerSearching,
    userId,
    setUserId,
    submitted,
    summary,
    topPages,
    topClickPages,
    topProducts,
    topUsers,
    events,
    eventTypeFilter,
    setEventTypeFilter,
    showActivePings,
    setShowActivePings,
    eventSearch,
    setEventSearch,
    metadata,
    page,
    setPage,
    totalPages,
    loading,
    error,
    filteredEvents,
    parseCustomerOption,
    handleSelectCustomer,
    handleRunReport,
    fetchReport,
  } = useMusteriAktivite();

  // ---- Turetilmis veri (mevcut summary'den; ek API yok) ----
  const dailyCounts = summary?.dailyCounts || [];
  const hasTrend = dailyCounts.length > 0;

  const trendStats = useMemo(() => {
    if (!hasTrend) return null;
    const counts = dailyCounts.map((d) => d.count);
    const total = counts.reduce((a, b) => a + b, 0);
    const avg = Math.round(total / counts.length);
    let peakVal = counts[0];
    let peakDate = dailyCounts[0].date;
    dailyCounts.forEach((d) => {
      if (d.count > peakVal) {
        peakVal = d.count;
        peakDate = d.date;
      }
    });
    return { avg, peakVal, peakDate };
  }, [dailyCounts, hasTrend]);

  // KPI haftalik degisim (son gun vs ortalama yerine: ilk yari vs ikinci yari)
  const weeklyChange = useMemo(() => {
    if (!hasTrend || dailyCounts.length < 4) return null;
    const mid = Math.floor(dailyCounts.length / 2);
    const firstHalf = dailyCounts.slice(0, mid).reduce((a, b) => a + b.count, 0);
    const secondHalf = dailyCounts.slice(mid).reduce((a, b) => a + b.count, 0);
    if (firstHalf === 0) return null;
    const pct = Math.round(((secondHalf - firstHalf) / firstHalf) * 100);
    return pct;
  }, [dailyCounts, hasTrend]);

  // Donut: Sayfa / Urun / Sepet / Arama / Diger (summary'den turetilir)
  const donutSegments = useMemo(() => {
    if (!summary) return [];
    const cart = summary.cartAdds + summary.cartRemoves + summary.cartUpdates;
    const known =
      summary.pageViews + summary.productViews + cart + summary.searchCount;
    const other = Math.max(0, summary.totalEvents - known);
    return [
      { label: 'Sayfa', value: summary.pageViews, color: NAVY },
      { label: 'Ürün', value: summary.productViews, color: CYAN },
      { label: 'Sepet', value: cart, color: '#5a6b86' },
      { label: 'Arama', value: summary.searchCount, color: WARN },
      { label: 'Diğer', value: other, color: '#cdd6e3' },
    ];
  }, [summary]);

  // Donusum hunisi: Sayfa Goruntuleme -> Urun Goruntuleme -> Sepet Ekleme
  const funnel = useMemo(() => {
    if (!summary) return null;
    const top = summary.pageViews;
    const mid = summary.productViews;
    const bottom = summary.cartAdds;
    const pct = (v: number) => (top > 0 ? Math.round((v / top) * 100) : 0);
    const stepPct = (a: number, b: number) => (a > 0 ? Math.round((b / a) * 100) : 0);
    return {
      top,
      mid,
      bottom,
      topPct: 100,
      midPct: pct(mid),
      bottomPct: pct(bottom),
      step1: stepPct(top, mid),
      step2: stepPct(mid, bottom),
    };
  }, [summary]);

  const maxTopPage = Math.max(1, ...topPages.map((p) => p.count));
  const maxClickPage = Math.max(1, ...topClickPages.map((p) => p.clickCount));
  const maxProduct = Math.max(1, ...topProducts.map((p) => p.count));
  const maxUser = Math.max(1, ...topUsers.map((u) => u.eventCount));

  const dateRangeLabel = useMemo(() => {
    if (!startDate || !endDate) return '';
    return `${shortDate(startDate)} – ${shortDate(endDate)}`;
  }, [startDate, endDate]);

  const onExport = () => {
    // CSV disa aktarim: mevcut sayfadaki olaylar (ek API yok)
    const rows = [
      ['Zaman', 'Tip', 'Kullanici', 'Cari', 'Hedef', 'Adet', 'Sure(sn)', 'Tiklama'],
      ...filteredEvents.map((e) => [
        formatDateTime(e.createdAt),
        typeLabels[e.type]?.label || e.type,
        e.userName || e.userId,
        e.customerCode ? `${e.customerCode}${e.customerName ? ` - ${e.customerName}` : ''}` : '',
        e.productCode || e.pagePath || '',
        e.quantity ?? '',
        e.durationSeconds ?? '',
        e.clickCount ?? '',
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `musteri-aktivite-${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // KPI hero kutucuklari (tum sayilar korunur)
  const heroTileBase: React.CSSProperties = {
    background: 'rgba(255,255,255,.08)',
    border: '1px solid rgba(255,255,255,.14)',
    borderRadius: 12,
    padding: '13px 14px',
  };
  const heroKicker: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '.06em',
    color: '#9fb6da',
    textTransform: 'uppercase',
  };
  const heroNumber: React.CSSProperties = {
    fontSize: 25,
    fontWeight: 800,
    color: '#fff',
    letterSpacing: '-.03em',
    lineHeight: 1,
    marginTop: 6,
    ...numeric,
  };
  const heroSub: React.CSSProperties = { fontSize: 11, color: '#8aa3cc', marginTop: 7 };

  const headerPillBtn: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    height: 38,
    padding: '0 14px',
    borderRadius: 10,
    background: 'rgba(255,255,255,.1)',
    border: '1px solid rgba(255,255,255,.16)',
    color: '#eaf1fb',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', padding: 24 }}>
      <div
        style={{
          borderRadius: 18,
          overflow: 'hidden',
          border: '1px solid #d9e0ea',
          background: '#eef2f7',
          boxShadow: '0 24px 60px -34px rgba(16,36,77,.45)',
        }}
      >
        {/* ============ Lacivert komuta basligi ============ */}
        <div style={{ background: NAVY_GRADIENT, padding: '22px 28px 24px', position: 'relative' }}>
          {/* Breadcrumb */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: '#9fb6da',
              fontWeight: 600,
              marginBottom: 14,
            }}
          >
            <span>Raporlar</span>
            <ChevronRight size={12} strokeWidth={2.2} />
            <span style={{ color: '#dbe6f5' }}>Müşteri Aktivite Takibi</span>
          </div>

          {/* Baslik + aksiyonlar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 20,
              flexWrap: 'wrap',
              marginBottom: 18,
            }}
          >
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.025em', margin: 0, color: '#fff' }}>
                Müşteri Aktivite Takibi
              </h1>
              <div style={{ fontSize: 13.5, color: '#aac3e6', marginTop: 4 }}>
                Sayfa, ürün ve sepet davranışlarının canlı analizi.
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
              {dateRangeLabel && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    height: 38,
                    padding: '0 14px',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,.1)',
                    border: '1px solid rgba(255,255,255,.16)',
                    color: '#eaf1fb',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  <Calendar size={15} strokeWidth={2} style={{ color: '#9fc4f0' }} />
                  {dateRangeLabel}
                </span>
              )}
              <button
                type="button"
                onClick={() => submitted && fetchReport(submitted, page)}
                style={headerPillBtn}
              >
                <RefreshCw size={15} strokeWidth={2} />
                Yenile
              </button>
              <button
                type="button"
                onClick={onExport}
                disabled={filteredEvents.length === 0}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  height: 38,
                  padding: '0 16px',
                  borderRadius: 10,
                  background: '#fff',
                  border: 'none',
                  color: '#143b7a',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: filteredEvents.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: filteredEvents.length === 0 ? 0.6 : 1,
                  fontFamily: 'inherit',
                }}
              >
                <Download size={15} strokeWidth={2} />
                Dışa Aktar
              </button>
            </div>
          </div>

          {/* KPI hero tiles */}
          {summary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
              {/* Toplam Olay (sparkline + haftalik degisim) */}
              <div style={heroTileBase}>
                <div style={heroKicker}>Toplam Olay</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ ...heroNumber, marginTop: 0 }}>{fmtInt(summary.totalEvents)}</span>
                  {hasTrend && <Sparkline values={dailyCounts.map((d) => d.count)} color="#7fd6ff" />}
                </div>
                {weeklyChange !== null ? (
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: weeklyChange >= 0 ? '#7fe0a8' : '#ffb3b3',
                      marginTop: 7,
                    }}
                  >
                    {weeklyChange >= 0 ? '▲' : '▼'} %{Math.abs(weeklyChange)}{' '}
                    <span style={{ color: '#8aa3cc', fontWeight: 500 }}>hafta</span>
                  </div>
                ) : (
                  <div style={heroSub}>olay</div>
                )}
              </div>

              {/* Tekil Kullanici */}
              <div style={heroTileBase}>
                <div style={heroKicker}>Tekil Kullanıcı</div>
                <div style={heroNumber}>{fmtInt(summary.uniqueUsers)}</div>
                <div style={heroSub}>müşteri</div>
              </div>

              {/* Sayfa Gor. */}
              <div style={heroTileBase}>
                <div style={heroKicker}>Sayfa Gör.</div>
                <div style={heroNumber}>{fmtInt(summary.pageViews)}</div>
                <div style={heroSub}>görüntüleme</div>
              </div>

              {/* Urun Gor. */}
              <div style={heroTileBase}>
                <div style={heroKicker}>Ürün Gör.</div>
                <div style={heroNumber}>{fmtInt(summary.productViews)}</div>
                <div style={heroSub}>detay açılışı</div>
              </div>

              {/* Sepet Hareketleri (+/-/guncelleme tek kartta) */}
              <div style={heroTileBase}>
                <div style={heroKicker}>Sepet Hareketi</div>
                <div style={{ display: 'flex', gap: 5, marginTop: 9, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      padding: '2px 6px',
                      borderRadius: 6,
                      background: 'rgba(127,224,168,.18)',
                      color: '#9becba',
                      fontSize: 11.5,
                      fontWeight: 700,
                      ...numeric,
                    }}
                  >
                    +{fmtInt(summary.cartAdds)}
                  </span>
                  <span
                    style={{
                      padding: '2px 6px',
                      borderRadius: 6,
                      background: 'rgba(255,150,150,.18)',
                      color: '#ffb3b3',
                      fontSize: 11.5,
                      fontWeight: 700,
                      ...numeric,
                    }}
                  >
                    −{fmtInt(summary.cartRemoves)}
                  </span>
                  <span
                    style={{
                      padding: '2px 6px',
                      borderRadius: 6,
                      background: 'rgba(255,210,140,.18)',
                      color: '#ffd28c',
                      fontSize: 11.5,
                      fontWeight: 700,
                      ...numeric,
                    }}
                  >
                    ↻{fmtInt(summary.cartUpdates)}
                  </span>
                </div>
              </div>

              {/* Aktif Sure (+ tikl/arama alt bilgisi) */}
              <div style={heroTileBase}>
                <div style={heroKicker}>Aktif Süre</div>
                <div style={heroNumber}>
                  <ActiveDurationValue seconds={summary.activeSeconds} />
                </div>
                <div style={heroSub}>
                  {fmtInt(summary.clickCount)} tıkl · {fmtInt(summary.searchCount)} ara
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ============ Acik icerik ============ */}
        <div style={{ padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Filtreler */}
          <div
            style={{
              background: '#fff',
              border: `1px solid ${LINE}`,
              borderRadius: 13,
              padding: '12px 14px',
              boxShadow: '0 1px 2px rgba(16,36,77,.04)',
            }}
          >
            <div style={{ display: 'flex', gap: 11, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: NAVY,
                  textTransform: 'uppercase',
                  letterSpacing: '.05em',
                  alignSelf: 'center',
                }}
              >
                Filtre
              </span>
              <div>
                <label style={{ fontSize: 10.5, color: FAINT, display: 'block', marginBottom: 4, fontWeight: 600 }}>
                  Başlangıç
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{
                    height: 36,
                    border: '1px solid #e1e7f0',
                    borderRadius: 9,
                    padding: '0 12px',
                    fontSize: 12.5,
                    color: INK,
                    fontFamily: 'inherit',
                    outline: 'none',
                    background: '#fff',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 10.5, color: FAINT, display: 'block', marginBottom: 4, fontWeight: 600 }}>
                  Bitiş
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{
                    height: 36,
                    border: '1px solid #e1e7f0',
                    borderRadius: 9,
                    padding: '0 12px',
                    fontSize: 12.5,
                    color: INK,
                    fontFamily: 'inherit',
                    outline: 'none',
                    background: '#fff',
                  }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
                <label style={{ fontSize: 10.5, color: FAINT, display: 'block', marginBottom: 4, fontWeight: 600 }}>
                  Cari Ara
                </label>
                <div style={{ position: 'relative' }}>
                  <Search
                    size={14}
                    strokeWidth={2}
                    style={{ position: 'absolute', left: 11, top: 11, color: '#aeb8c8' }}
                  />
                  <input
                    placeholder="Kod veya isim"
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setCustomerCode('');
                      setCustomerName('');
                    }}
                    style={{
                      height: 36,
                      width: '100%',
                      border: '1px solid #e1e7f0',
                      borderRadius: 9,
                      padding: '0 12px 0 32px',
                      fontSize: 12.5,
                      color: INK,
                      fontFamily: 'inherit',
                      outline: 'none',
                      background: '#fff',
                    }}
                  />
                  {customerSearching && (
                    <div style={{ position: 'absolute', right: 10, top: 10, fontSize: 11, color: FAINT }}>
                      Aranıyor...
                    </div>
                  )}
                  {!customerCode && customerOptions.length > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: '100%',
                        zIndex: 20,
                        marginTop: 4,
                        maxHeight: 224,
                        overflow: 'auto',
                        borderRadius: 9,
                        border: `1px solid ${LINE}`,
                        background: '#fff',
                        boxShadow: '0 10px 24px rgba(20,34,59,.12)',
                      }}
                    >
                      {customerOptions.map((item, index) => {
                        const parsed = parseCustomerOption(item);
                        if (!parsed.code) return null;
                        return (
                          <button
                            type="button"
                            key={`${parsed.code}-${index}`}
                            onClick={() => handleSelectCustomer(item)}
                            style={{
                              display: 'block',
                              width: '100%',
                              textAlign: 'left',
                              padding: '8px 12px',
                              border: 'none',
                              borderBottom: `1px solid ${SOFT_LINE}`,
                              background: 'transparent',
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = '#f6f8fb')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          >
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>{parsed.code}</div>
                            <div style={{ fontSize: 11, color: FAINT }}>{parsed.name || '-'}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {customerName && (
                  <div style={{ fontSize: 11, color: FAINT, marginTop: 6 }}>Seçilen cari: {customerName}</div>
                )}
              </div>
              <div style={{ width: 150 }}>
                <label style={{ fontSize: 10.5, color: FAINT, display: 'block', marginBottom: 4, fontWeight: 600 }}>
                  Kullanıcı ID
                </label>
                <input
                  placeholder="Opsiyonel"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  style={{
                    height: 36,
                    width: '100%',
                    border: '1px solid #e1e7f0',
                    borderRadius: 9,
                    padding: '0 12px',
                    fontSize: 12.5,
                    color: INK,
                    fontFamily: 'inherit',
                    outline: 'none',
                    background: '#fff',
                  }}
                />
              </div>
              <button
                type="button"
                onClick={handleRunReport}
                style={{
                  height: 36,
                  padding: '0 18px',
                  borderRadius: 9,
                  background: NAVY,
                  border: 'none',
                  color: '#fff',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Raporu Getir
              </button>
            </div>
          </div>

          {/* Henuz rapor cekilmediyse bilgi */}
          {!submitted && !loading && (
            <div
              style={{
                ...cardStyle,
                padding: '40px 18px',
                textAlign: 'center',
                color: MUTED,
                fontSize: 13,
              }}
            >
              Tarih aralığı ve isteğe bağlı cari seçip <strong style={{ color: NAVY }}>Raporu Getir</strong>'e basın.
            </div>
          )}

          {/* Hata */}
          {error && (
            <div
              style={{
                ...cardStyle,
                padding: 18,
                color: DANGER,
                background: '#fdecec',
                borderColor: '#f6cccc',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}

          {/* Yukleniyor */}
          {loading && !summary && (
            <div style={{ ...cardStyle, padding: 48, textAlign: 'center' }}>
              <RefreshCw
                size={30}
                strokeWidth={2}
                className="animate-spin"
                style={{ margin: '0 auto 14px', color: FAINT, display: 'block' }}
              />
              <p style={{ color: MUTED, margin: 0 }}>Yükleniyor...</p>
            </div>
          )}

          {summary && (
            <>
              {/* Grafik kahramani: Aktivite Trendi + Olay Dagilimi */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 16 }}>
                <div style={{ ...cardStyle, padding: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: INK }}>Aktivite Trendi</span>
                    <span style={{ fontSize: 11.5, color: FAINT }}>
                      Günlük olay {dateRangeLabel ? `· ${dateRangeLabel}` : ''}
                    </span>
                  </div>
                  {hasTrend ? (
                    <TrendChart data={dailyCounts} />
                  ) : (
                    <div style={{ padding: '36px 0', textAlign: 'center', color: FAINT, fontSize: 12.5 }}>
                      Günlük trend verisi yok.
                    </div>
                  )}
                  {trendStats && (
                    <div
                      style={{
                        display: 'flex',
                        gap: 22,
                        marginTop: 14,
                        paddingTop: 14,
                        borderTop: '1px solid #f0f3f8',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 19, fontWeight: 800, color: INK, letterSpacing: '-.02em', ...numeric }}>
                          {fmtInt(trendStats.avg)}
                        </div>
                        <div style={{ fontSize: 10.5, color: FAINT, fontWeight: 600 }}>Günlük ort.</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 19, fontWeight: 800, color: SUCCESS, letterSpacing: '-.02em', ...numeric }}>
                          {fmtInt(trendStats.peakVal)}
                        </div>
                        <div style={{ fontSize: 10.5, color: FAINT, fontWeight: 600 }}>
                          Zirve · {shortDate(trendStats.peakDate)}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 19, fontWeight: 800, color: INK, letterSpacing: '-.02em', ...numeric }}>
                          {fmtInt(summary.clickCount)}
                        </div>
                        <div style={{ fontSize: 10.5, color: FAINT, fontWeight: 600 }}>Tıklama</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 19, fontWeight: 800, color: INK, letterSpacing: '-.02em', ...numeric }}>
                          {fmtInt(summary.searchCount)}
                        </div>
                        <div style={{ fontSize: 10.5, color: FAINT, fontWeight: 600 }}>Arama</div>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ ...cardStyle, padding: 18 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>Olay Dağılımı</div>
                  <Donut segments={donutSegments} total={summary.totalEvents} />
                </div>
              </div>

              {/* Donusum Hunisi (yatay) */}
              {funnel && (
                <div style={{ ...cardStyle, padding: 18 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      marginBottom: 16,
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 700, color: INK }}>Dönüşüm Hunisi</span>
                    <span style={{ fontSize: 11.5, color: FAINT }}>Sayfa → Ürün → Sepet</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
                    {/* Asama 1 */}
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: INK, letterSpacing: '-.02em', ...numeric }}>
                        {fmtInt(funnel.top)}
                      </div>
                      <div
                        style={{
                          height: 84,
                          marginTop: 8,
                          borderRadius: '10px 10px 4px 4px',
                          background: `linear-gradient(180deg, ${NAVY}, #1f4f93)`,
                          display: 'flex',
                          alignItems: 'flex-end',
                          justifyContent: 'center',
                          paddingBottom: 8,
                        }}
                      >
                        <span style={{ color: '#cfe0f5', fontSize: 11, fontWeight: 700 }}>%{funnel.topPct}</span>
                      </div>
                      <div style={{ fontSize: 12, color: MUTED, fontWeight: 600, marginTop: 8 }}>Sayfa Görüntüleme</div>
                    </div>
                    {/* Adim oku 1 */}
                    <div style={{ paddingBottom: 42, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>%{funnel.step1}</div>
                      <ChevronRight size={20} strokeWidth={2.4} style={{ color: '#c4cedd' }} />
                    </div>
                    {/* Asama 2 */}
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: INK, letterSpacing: '-.02em', ...numeric }}>
                        {fmtInt(funnel.mid)}
                      </div>
                      <div
                        style={{
                          height: Math.max(22, Math.round((funnel.midPct / 100) * 84)),
                          marginTop: 8,
                          borderRadius: '10px 10px 4px 4px',
                          background: `linear-gradient(180deg, ${BLUE}, #3f82d4)`,
                          display: 'flex',
                          alignItems: 'flex-end',
                          justifyContent: 'center',
                          paddingBottom: 7,
                        }}
                      >
                        <span style={{ color: '#eaf3ff', fontSize: 11, fontWeight: 700 }}>%{funnel.midPct}</span>
                      </div>
                      <div style={{ fontSize: 12, color: MUTED, fontWeight: 600, marginTop: 8 }}>Ürün Görüntüleme</div>
                    </div>
                    {/* Adim oku 2 */}
                    <div style={{ paddingBottom: 42, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>%{funnel.step2}</div>
                      <ChevronRight size={20} strokeWidth={2.4} style={{ color: '#c4cedd' }} />
                    </div>
                    {/* Asama 3 */}
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: INK, letterSpacing: '-.02em', ...numeric }}>
                        {fmtInt(funnel.bottom)}
                      </div>
                      <div
                        style={{
                          height: Math.max(22, Math.round((funnel.bottomPct / 100) * 84)),
                          marginTop: 8,
                          borderRadius: '8px 8px 4px 4px',
                          background: `linear-gradient(180deg, ${CYAN}, #26a9e0)`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <span style={{ color: '#eafaff', fontSize: 10, fontWeight: 700 }}>%{funnel.bottomPct}</span>
                      </div>
                      <div style={{ fontSize: 12, color: MUTED, fontWeight: 600, marginTop: 8 }}>Sepet Ekleme</div>
                    </div>
                  </div>
                </div>
              )}

              {/* 3 liste: Ziyaret / Tiklanan / Urunler (goreli barlar) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                {/* En Cok Ziyaret Edilen Sayfalar */}
                <div style={{ ...cardStyle, overflow: 'hidden' }}>
                  <div style={panelHeader}>En Çok Ziyaret Edilen Sayfalar</div>
                  <div style={{ padding: '13px 16px', display: 'flex', flexDirection: 'column', gap: 11 }}>
                    {topPages.length === 0 ? (
                      <div style={{ textAlign: 'center', color: MUTED, fontSize: 12.5, padding: '6px 0' }}>Veri yok</div>
                    ) : (
                      topPages.map((item) => (
                        <BarRow
                          key={item.pagePath}
                          label={item.pagePath}
                          value={item.count}
                          max={maxTopPage}
                          color={NAVY}
                          mono
                        />
                      ))
                    )}
                  </div>
                </div>

                {/* En Cok Tiklanan Sayfalar */}
                <div style={{ ...cardStyle, overflow: 'hidden' }}>
                  <div style={panelHeader}>En Çok Tıklanan Sayfalar</div>
                  <div style={{ padding: '13px 16px', display: 'flex', flexDirection: 'column', gap: 11 }}>
                    {topClickPages.length === 0 ? (
                      <div style={{ textAlign: 'center', color: MUTED, fontSize: 12.5, padding: '6px 0' }}>Veri yok</div>
                    ) : (
                      topClickPages.map((item) => (
                        <BarRow
                          key={item.pagePath}
                          label={item.pagePath}
                          value={item.clickCount}
                          ghost={
                            <span style={{ fontSize: 9.5, fontWeight: 500, color: '#b3bccb', marginLeft: 4 }}>
                              {fmtInt(item.eventCount)}p
                            </span>
                          }
                          max={maxClickPage}
                          color={CYAN}
                          mono
                        />
                      ))
                    )}
                  </div>
                </div>

                {/* En Cok Goruntulenen Urunler */}
                <div style={{ ...cardStyle, overflow: 'hidden' }}>
                  <div style={panelHeader}>En Çok Görüntülenen Ürünler</div>
                  <div style={{ padding: '13px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {topProducts.length === 0 ? (
                      <div style={{ textAlign: 'center', color: MUTED, fontSize: 12.5, padding: '6px 0' }}>Veri yok</div>
                    ) : (
                      topProducts.map((item, index) => {
                        const pct = maxProduct > 0 ? Math.max(2, Math.round((item.count / maxProduct) * 100)) : 0;
                        return (
                          <div key={`${item.productCode || item.productId || index}`}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontFamily: MONO, fontSize: 10, color: '#8593a8' }}>
                                  {item.productCode || '-'}
                                </div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: '#2c3c57',
                                    fontWeight: 600,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                >
                                  {item.productName || '-'}
                                </div>
                              </div>
                              <span style={{ fontSize: 12.5, fontWeight: 800, color: INK, ...numeric }}>
                                {fmtInt(item.count)}
                              </span>
                            </div>
                            <div style={{ height: 5, borderRadius: 3, background: SOFT_LINE, marginTop: 6 }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: CYAN, borderRadius: 3 }} />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* En Aktif Kullanicilar (rank + olay bari) */}
              <div style={{ ...cardStyle, overflow: 'hidden' }}>
                <div style={panelHeader}>En Aktif Kullanıcılar</div>
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ minWidth: 760 }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '40px 1.4fr 1.6fr 130px 110px 80px 80px',
                        gap: 10,
                        padding: '10px 16px',
                        background: PANEL,
                        borderBottom: `1px solid ${SOFT_LINE}`,
                        fontSize: 10,
                        fontWeight: 700,
                        color: FAINT,
                        textTransform: 'uppercase',
                        letterSpacing: '.05em',
                        alignItems: 'center',
                      }}
                    >
                      <span>#</span>
                      <span>Kullanıcı</span>
                      <span>Cari</span>
                      <span>Olay</span>
                      <span style={cellRight}>Aktif Süre</span>
                      <span style={cellRight}>Tıkl.</span>
                      <span style={cellRight}>Ara.</span>
                    </div>
                    {topUsers.length === 0 ? (
                      <div style={{ padding: '20px 16px', textAlign: 'center', color: MUTED, fontSize: 12.5 }}>
                        Veri yok
                      </div>
                    ) : (
                      topUsers.map((item, idx) => {
                        const pct = maxUser > 0 ? Math.max(3, Math.round((item.eventCount / maxUser) * 100)) : 0;
                        return (
                          <div
                            key={item.userId}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '40px 1.4fr 1.6fr 130px 110px 80px 80px',
                              gap: 10,
                              padding: '11px 16px',
                              borderTop: `1px solid ${ROW_LINE}`,
                              fontSize: 12,
                              color: INK,
                              alignItems: 'center',
                            }}
                          >
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 22,
                                height: 22,
                                borderRadius: 7,
                                background: idx < 3 ? NAVY : SOFT_LINE,
                                color: idx < 3 ? '#fff' : MUTED,
                                fontSize: 11,
                                fontWeight: 700,
                                ...numeric,
                              }}
                            >
                              {idx + 1}
                            </span>
                            <span style={{ fontWeight: 600 }}>{item.userName || item.userId}</span>
                            <span style={{ color: MUTED, fontSize: 11.5 }}>
                              {item.customerCode
                                ? `${item.customerCode}${item.customerName ? ` - ${item.customerName}` : ''}`
                                : '-'}
                            </span>
                            <span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ flex: 1, height: 5, borderRadius: 3, background: SOFT_LINE }}>
                                  <div
                                    style={{ height: '100%', width: `${pct}%`, background: NAVY, borderRadius: 3 }}
                                  />
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 800, ...numeric }}>
                                  {fmtInt(item.eventCount)}
                                </span>
                              </div>
                            </span>
                            <span style={cellRight}>{formatDuration(item.activeSeconds)}</span>
                            <span style={cellRight}>{fmtInt(item.clickCount)}</span>
                            <span style={cellRight}>{fmtInt(item.searchCount)}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Detayli Olay Listesi (lacivert baslik) */}
              <div style={{ ...cardStyle, overflow: 'hidden' }}>
                <div
                  style={{
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                    background: NAVY,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginRight: 'auto' }}>
                    Detaylı Olay Listesi
                  </div>
                  {/* Tip filtresi (select - lacivert zemine uygun) */}
                  <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                    <select
                      value={eventTypeFilter}
                      onChange={(e) => setEventTypeFilter(e.target.value as ActivityType | 'ALL')}
                      style={{
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        height: 32,
                        padding: '0 30px 0 12px',
                        border: '1px solid rgba(255,255,255,.2)',
                        borderRadius: 8,
                        background: 'rgba(255,255,255,.06)',
                        color: '#eaf1fb',
                        fontSize: 12,
                        fontWeight: 600,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        outline: 'none',
                      }}
                    >
                      <option value="ALL" style={{ color: INK }}>
                        Tüm Tipler
                      </option>
                      {Object.entries(typeLabels).map(([key, value]) => (
                        <option key={key} value={key} style={{ color: INK }}>
                          {value.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={12}
                      strokeWidth={2}
                      style={{ position: 'absolute', right: 11, color: '#9fb6da', pointerEvents: 'none' }}
                    />
                  </div>
                  {/* Aktiflik pingleri */}
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      height: 32,
                      padding: '0 12px',
                      border: '1px solid rgba(255,255,255,.2)',
                      borderRadius: 8,
                      fontSize: 12,
                      color: '#eaf1fb',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={showActivePings}
                      onChange={(e) => setShowActivePings(e.target.checked)}
                      style={{ width: 14, height: 14, accentColor: CYAN }}
                    />
                    Aktiflik pingleri
                  </label>
                  {/* Arama */}
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      height: 32,
                      padding: '0 12px',
                      border: '1px solid rgba(255,255,255,.2)',
                      borderRadius: 8,
                      minWidth: 200,
                      background: 'rgba(255,255,255,.06)',
                    }}
                  >
                    <Search size={13} strokeWidth={2} style={{ color: '#9fb6da', flexShrink: 0 }} />
                    <input
                      placeholder="Ara…"
                      value={eventSearch}
                      onChange={(e) => setEventSearch(e.target.value)}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        border: 'none',
                        background: 'transparent',
                        color: '#eaf1fb',
                        fontSize: 12,
                        fontFamily: 'inherit',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                {loading ? (
                  <div style={{ padding: 48, textAlign: 'center' }}>
                    <RefreshCw
                      size={30}
                      strokeWidth={2}
                      className="animate-spin"
                      style={{ margin: '0 auto 14px', color: FAINT, display: 'block' }}
                    />
                    <p style={{ color: MUTED, margin: 0 }}>Yükleniyor...</p>
                  </div>
                ) : events.length === 0 ? (
                  <div style={{ padding: 48, textAlign: 'center', color: MUTED }}>Veri bulunamadı</div>
                ) : (
                  <>
                    <div style={{ overflowX: 'auto' }}>
                      <div style={{ minWidth: 980 }}>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: EVENT_GRID,
                            gap: 10,
                            padding: '10px 18px',
                            background: PANEL,
                            borderBottom: `1px solid ${SOFT_LINE}`,
                            fontSize: 10,
                            fontWeight: 700,
                            color: FAINT,
                            textTransform: 'uppercase',
                            letterSpacing: '.05em',
                            alignItems: 'center',
                          }}
                        >
                          <span>Zaman</span>
                          <span>Tip</span>
                          <span>Kullanıcı</span>
                          <span>Cari</span>
                          <span>Sayfa / Ürün</span>
                          <span style={cellRight}>Adet</span>
                          <span style={cellRight}>Süre</span>
                          <span style={cellRight}>Tıkl.</span>
                        </div>

                        {filteredEvents.length === 0 ? (
                          <div style={{ padding: '32px 18px', textAlign: 'center', color: MUTED, fontSize: 12.5 }}>
                            Filtreye uygun veri yok
                          </div>
                        ) : (
                          filteredEvents.map((event) => {
                            const customerLabel = event.customerCode
                              ? `${event.customerCode}${event.customerName ? ` · ${event.customerName}` : ''}`
                              : '-';
                            return (
                              <div
                                key={event.id}
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: EVENT_GRID,
                                  gap: 10,
                                  padding: '11px 18px',
                                  borderTop: `1px solid ${ROW_LINE}`,
                                  fontSize: 12,
                                  color: INK,
                                  alignItems: 'center',
                                }}
                              >
                                <span style={{ fontSize: 11, color: '#7a89a1', ...numeric }}>
                                  {formatDateTime(event.createdAt)}
                                </span>
                                <span>
                                  <TypeBadge type={event.type} />
                                </span>
                                <span style={{ fontWeight: 600 }}>{event.userName || event.userId}</span>
                                <span style={{ color: MUTED, fontSize: 11.5 }}>{customerLabel}</span>
                                <span>{renderEventTarget(event)}</span>
                                <span style={cellRight}>
                                  {event.quantity ?? <span style={{ color: '#b3bccb' }}>–</span>}
                                </span>
                                <span style={cellRight}>
                                  {event.durationSeconds != null ? (
                                    formatDuration(event.durationSeconds)
                                  ) : (
                                    <span style={{ color: '#b3bccb' }}>–</span>
                                  )}
                                </span>
                                <span style={cellRight}>
                                  {event.clickCount ?? <span style={{ color: '#b3bccb' }}>–</span>}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Sayfalama */}
                    {totalPages > 1 && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '13px 18px',
                          borderTop: `1px solid ${SOFT_LINE}`,
                        }}
                      >
                        <div style={{ fontSize: 12, color: '#7a89a1' }}>
                          Sayfa{' '}
                          <strong style={{ color: INK }}>{page}</strong> / {totalPages}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                            disabled={page === 1}
                            style={{
                              height: 32,
                              padding: '0 13px',
                              borderRadius: 8,
                              border: '1px solid #e1e7f0',
                              background: '#fff',
                              color: page === 1 ? '#aeb8c8' : INK,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: page === 1 ? 'not-allowed' : 'pointer',
                              fontFamily: 'inherit',
                            }}
                          >
                            Önceki
                          </button>
                          <button
                            type="button"
                            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                            disabled={page === totalPages}
                            style={{
                              height: 32,
                              padding: '0 13px',
                              borderRadius: 8,
                              border: 'none',
                              background: NAVY,
                              color: '#fff',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: page === totalPages ? 'not-allowed' : 'pointer',
                              opacity: page === totalPages ? 0.5 : 1,
                              fontFamily: 'inherit',
                            }}
                          >
                            Sonraki
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
