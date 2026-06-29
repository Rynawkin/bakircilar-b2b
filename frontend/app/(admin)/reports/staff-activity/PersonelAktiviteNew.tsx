'use client';

import Link from 'next/link';
import {
  ChevronRight,
  RefreshCw,
  Activity,
  Route as RouteIcon,
  Users,
  SlidersHorizontal,
} from 'lucide-react';
import { usePersonelAktivite } from './usePersonelAktivite';

/**
 * Yeni gorunum: Personel Aktivite Takibi raporu.
 * Tum mantik usePersonelAktivite hook'undan gelir; hicbir handler/kolon/filtre/
 * ozet/method-status rozeti/satir/pagination/method-dagilimi dusurulmemistir.
 *
 * Tasarim referansi: design HTML generic "Rapor" (#scr-genrep) + brief 4.11.11.
 * Genel rapor stili: beyaz kart #fff / border #e7ebf2 / radius 12px;
 * tablo basligi bg #fafbfd; primary #15356b; ink #14223b/#51607a/#8b97ac;
 * method/status renkleri Classic'in Badge variant esleştirmesiyle birebir.
 */

const PRIMARY = '#15356b';
const INK = '#14223b';
const MUTED = '#51607a';
const FAINT = '#8b97ac';
const LINE = '#e7ebf2';
const SOFT_LINE = '#eef1f6';
const ROW_LINE = '#f1f4f9';
const TABLE_HEAD_BG = '#fafbfd';

// Badge variant -> renk paleti (Classic'teki info/success/warning/danger/default ile ayni anlam)
const VARIANT_STYLE: Record<
  'default' | 'info' | 'success' | 'warning' | 'danger',
  { bg: string; fg: string; border: string }
> = {
  default: { bg: '#f1f4f9', fg: MUTED, border: '#e3e8f0' },
  info: { bg: '#eef2fb', fg: '#1d4ed8', border: '#d6e0f1' },
  success: { bg: '#ecfdf5', fg: '#047857', border: '#bbf7d0' },
  warning: { bg: '#fffbeb', fg: '#b45309', border: '#fde68a' },
  danger: { bg: '#fef2f2', fg: '#b91c1c', border: '#fecaca' },
};

// Event Detayi grid: Tarih | Personel | Rol | Adim/Aksiyon | Detay | Durum | Sure
const EVENT_GRID = '1.3fr 1.6fr 0.9fr 1.8fr 2fr 0.8fr 0.9fr';

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: `1px solid ${LINE}`,
  borderRadius: 12,
};

const headBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  height: 36,
  padding: '0 14px',
  border: `1px solid ${LINE}`,
  borderRadius: 9,
  background: '#fff',
  color: INK,
  fontSize: 12.5,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const inputStyle: React.CSSProperties = {
  height: 36,
  width: '100%',
  border: '1px solid #e3e8f0',
  borderRadius: 8,
  padding: '0 10px',
  fontSize: 12.5,
  color: INK,
  fontFamily: 'inherit',
  outline: 'none',
  background: '#fff',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: FAINT,
  display: 'block',
  marginBottom: 4,
  fontWeight: 500,
};

const summaryCard: React.CSSProperties = {
  ...cardStyle,
  padding: 15,
};

function Pill({
  variant,
  children,
}: {
  variant: 'default' | 'info' | 'success' | 'warning' | 'danger';
  children: React.ReactNode;
}) {
  const s = VARIANT_STYLE[variant];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        background: s.bg,
        color: s.fg,
        border: `1px solid ${s.border}`,
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

export default function PersonelAktiviteNew() {
  const {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    role,
    setRole,
    route,
    setRoute,
    userId,
    setUserId,
    loading,
    summary,
    topRoutes,
    topUsers,
    events,
    page,
    totalPages,
    fetchReport,
    formatDateTime,
    formatDuration,
    methodVariant,
    statusVariant,
  } = usePersonelAktivite();

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: 24 }}>
      {/* Breadcrumb */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          fontSize: 12.5,
          color: FAINT,
          marginBottom: 12,
        }}
      >
        <Link href="/reports" style={{ color: FAINT, textDecoration: 'none', fontWeight: 500 }}>
          Raporlar
        </Link>
        <ChevronRight size={13} strokeWidth={2} />
        <span style={{ color: MUTED, fontWeight: 500 }}>Personel Aktivite Takibi</span>
      </div>

      {/* Header: baslik + Yenile */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: '-.02em',
              margin: 0,
              color: INK,
            }}
          >
            Personel Aktivite Takibi
          </h1>
          <div style={{ fontSize: 13, color: FAINT, marginTop: 5 }}>
            Staff kullanicilarinin API islemlerini izler
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => fetchReport(page)}
            disabled={loading}
            style={{
              ...headBtn,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshCw size={15} strokeWidth={2} className={loading ? 'animate-spin' : undefined} />
            Yenile
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ ...cardStyle, padding: 16, marginBottom: 18 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
          }}
        >
          <SlidersHorizontal size={15} strokeWidth={2} style={{ color: FAINT }} />
          <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>Filtreler</div>
          <span style={{ fontSize: 11.5, color: FAINT }}>
            Tarih, rol, route ve kullanici bazli filtreleme
          </span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: 12,
            alignItems: 'end',
          }}
        >
          <div>
            <label style={labelStyle}>Başlangıç Tarihi</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Bitiş Tarihi</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Rol</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">Tum Roller</option>
              <option value="HEAD_ADMIN">HEAD_ADMIN</option>
              <option value="ADMIN">ADMIN</option>
              <option value="MANAGER">MANAGER</option>
              <option value="SALES_REP">SALES_REP</option>
              <option value="DEPOCU">DEPOCU</option>
              <option value="DIVERSEY">DIVERSEY</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Route</label>
            <input
              placeholder="Route filtre (or: /orders)"
              value={route}
              onChange={(e) => setRoute(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>User ID</label>
            <input
              placeholder="User ID (opsiyonel)"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <button
              type="button"
              onClick={() => fetchReport(1)}
              disabled={loading}
              style={{
                ...headBtn,
                width: '100%',
                justifyContent: 'center',
                background: PRIMARY,
                color: '#fff',
                border: 'none',
                opacity: loading ? 0.7 : 1,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              <Activity size={15} strokeWidth={2} />
              Raporu Çalıştır
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards (4 metrik) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 14,
          marginBottom: 18,
        }}
      >
        <div style={summaryCard}>
          <div style={{ fontSize: 11.5, color: FAINT }}>Toplam Event</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: INK, marginTop: 5 }}>
            {summary?.totalEvents || 0}
          </div>
        </div>
        <div style={summaryCard}>
          <div style={{ fontSize: 11.5, color: FAINT }}>Aktif Personel</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: INK, marginTop: 5 }}>
            {summary?.uniqueStaff || 0}
          </div>
        </div>
        <div style={summaryCard}>
          <div style={{ fontSize: 11.5, color: FAINT }}>Toplam Tıklama</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: INK, marginTop: 5 }}>
            {summary?.clickCount || 0}
          </div>
        </div>
        <div style={summaryCard}>
          <div style={{ fontSize: 11.5, color: FAINT }}>Toplam Aktiflik (sn)</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: INK, marginTop: 5 }}>
            {summary?.activeSeconds || 0}
          </div>
        </div>
      </div>

      {/* Method Dagilimi */}
      <div style={{ ...cardStyle, padding: 16, marginBottom: 18 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: INK, marginBottom: 12 }}>
          Method Dağılımı
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 10,
          }}
        >
          <Pill variant="info">GET: {summary?.getCount || 0}</Pill>
          <Pill variant="success">POST: {summary?.postCount || 0}</Pill>
          <Pill variant="warning">PUT: {summary?.putCount || 0}</Pill>
          <Pill variant="warning">PATCH: {summary?.patchCount || 0}</Pill>
          <Pill variant="danger">DELETE: {summary?.deleteCount || 0}</Pill>
        </div>
      </div>

      {/* 2 liste: En Cok Islem Yapilan Rotalar + En Aktif Personeller */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 16,
          marginBottom: 18,
        }}
      >
        <div style={{ ...cardStyle, padding: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13.5,
              fontWeight: 600,
              color: INK,
              marginBottom: 12,
            }}
          >
            <RouteIcon size={15} strokeWidth={2} style={{ color: FAINT }} />
            En Cok Islem Yapilan Rotalar
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topRoutes.length === 0 && (
              <p style={{ fontSize: 12.5, color: FAINT, margin: 0 }}>Kayit yok</p>
            )}
            {topRoutes.map((row) => (
              <div
                key={row.route}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  border: `1px solid ${SOFT_LINE}`,
                  borderRadius: 8,
                  padding: '8px 10px',
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontFamily: "'Roboto Mono', monospace",
                    color: MUTED,
                    wordBreak: 'break-all',
                  }}
                >
                  {row.route}
                </span>
                <Pill variant="info">{row.count}</Pill>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...cardStyle, padding: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13.5,
              fontWeight: 600,
              color: INK,
              marginBottom: 12,
            }}
          >
            <Users size={15} strokeWidth={2} style={{ color: FAINT }} />
            En Aktif Personeller
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topUsers.length === 0 && (
              <p style={{ fontSize: 12.5, color: FAINT, margin: 0 }}>Kayit yok</p>
            )}
            {topUsers.map((row) => (
              <div
                key={row.userId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  border: `1px solid ${SOFT_LINE}`,
                  borderRadius: 8,
                  padding: '8px 10px',
                }}
              >
                <div>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: INK, margin: 0 }}>
                    {row.userName || row.email || row.userId}
                  </p>
                  <p style={{ fontSize: 11, color: FAINT, margin: 0 }}>{row.role}</p>
                </div>
                <Pill variant="success">{row.eventCount}</Pill>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Event Detayi */}
      <div style={{ ...cardStyle, overflow: 'hidden', marginBottom: 18 }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${SOFT_LINE}` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>Event Detayi</div>
          <div style={{ fontSize: 12, color: FAINT, marginTop: 3 }}>Son aktiviteler</div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 1040 }}>
            {/* Header row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: EVENT_GRID,
                gap: 10,
                padding: '11px 16px',
                background: TABLE_HEAD_BG,
                borderBottom: `1px solid ${SOFT_LINE}`,
                fontSize: 10,
                fontWeight: 600,
                color: FAINT,
                textTransform: 'uppercase',
                alignItems: 'center',
              }}
            >
              <span>Tarih</span>
              <span>Personel</span>
              <span>Rol</span>
              <span>Adim / Aksiyon</span>
              <span>Detay</span>
              <span>Durum</span>
              <span>Sure</span>
            </div>

            {/* Rows */}
            {events.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                <Activity
                  size={28}
                  strokeWidth={2}
                  style={{ margin: '0 auto 8px', color: FAINT, display: 'block' }}
                />
                <p style={{ color: MUTED, margin: 0 }}>Kayit yok</p>
              </div>
            ) : (
              events.map((event) => (
                <div
                  key={event.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: EVENT_GRID,
                    gap: 10,
                    padding: '12px 16px',
                    borderTop: `1px solid ${ROW_LINE}`,
                    fontSize: 12,
                    color: INK,
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: 11.5, color: MUTED }}>
                    {formatDateTime(event.createdAt)}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: INK,
                        margin: 0,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {event.userName || '-'}
                    </p>
                    <p
                      style={{
                        fontSize: 11,
                        color: FAINT,
                        margin: 0,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {event.email || event.userId}
                    </p>
                  </div>
                  <span>
                    <Pill variant="default">{event.role}</Pill>
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <Pill variant={methodVariant(event.method)}>{event.method}</Pill>
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: "'Roboto Mono', monospace",
                        color: MUTED,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {event.action || event.route || event.pagePath || '-'}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 11.5,
                      color: '#374151',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={event.details || '-'}
                  >
                    {event.details || '-'}
                  </span>
                  <span>
                    <Pill variant={statusVariant(event.statusCode)}>
                      {event.statusCode ?? '-'}
                    </Pill>
                  </span>
                  <span style={{ fontSize: 11.5, color: MUTED }}>
                    {formatDuration(event.durationMs)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Pagination (Geri / Ileri) — Classic ile ayni: her zaman gosterilir */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 16,
            borderTop: `1px solid ${SOFT_LINE}`,
          }}
        >
          <div style={{ fontSize: 12.5, color: MUTED }}>
            Sayfa {page} / {totalPages}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => fetchReport(page - 1)}
              disabled={loading || page <= 1}
              style={{
                ...headBtn,
                opacity: loading || page <= 1 ? 0.5 : 1,
                cursor: loading || page <= 1 ? 'not-allowed' : 'pointer',
              }}
            >
              Geri
            </button>
            <button
              type="button"
              onClick={() => fetchReport(page + 1)}
              disabled={loading || page >= totalPages}
              style={{
                ...headBtn,
                opacity: loading || page >= totalPages ? 0.5 : 1,
                cursor: loading || page >= totalPages ? 'not-allowed' : 'pointer',
              }}
            >
              Ileri
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
