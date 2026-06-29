'use client';

import Link from 'next/link';
import {
  Activity,
  ChevronRight,
  Eye,
  MousePointerClick,
  RefreshCw,
  Search,
  ShoppingCart,
  Users,
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
 * Yeni gorunum: Musteri Aktivite Takibi raporu.
 * Tum mantik useMusteriAktivite hook'undan gelir; HICBIR handler/kolon/filtre/ozet-kart/
 * tablo/satir/sayfalama/durum dusurulmemistir.
 *
 * Tasarim: design HTML'de bu rapora ait data-screen-label YOK, bu yuzden brief 4.11.10
 * (Filtre + 10 ozet + 3 tablo + En Aktif Kullanici + Detayli Olay Listesi) ve genel rapor
 * stili taklit edildi. Genel stil: beyaz kart #fff / border #e7ebf2 / radius 12px;
 * tablo basligi bg #fafbfd; primary #15356b; ink #14223b/#51607a/#8b97ac; emerald/amber/red.
 */

const PRIMARY = '#15356b';
const INK = '#14223b';
const MUTED = '#51607a';
const FAINT = '#8b97ac';
const LINE = '#e7ebf2';
const SOFT_LINE = '#eef1f6';
const ROW_LINE = '#f1f4f9';
const TABLE_HEAD_BG = '#fafbfd';
const EMERALD = '#047857';
const AMBER = '#b45309';
const RED = '#b91c1c';
const MONO = "'Roboto Mono', monospace";

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

const primaryBtn: React.CSSProperties = {
  ...headBtn,
  background: PRIMARY,
  color: '#fff',
  border: 'none',
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

const cellRight: React.CSSProperties = { textAlign: 'right' };

// Tip rozeti renkleri (Classic Badge variant'lariyla esdeger renkler)
const badgeColors: Record<
  'default' | 'info' | 'success' | 'warning' | 'danger',
  { bg: string; fg: string }
> = {
  default: { bg: '#eef1f6', fg: MUTED },
  info: { bg: '#e6effb', fg: '#1e5fa8' },
  success: { bg: '#e8f6ee', fg: EMERALD },
  warning: { bg: '#fdf2e3', fg: AMBER },
  danger: { bg: '#fdecec', fg: RED },
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
        padding: '0 9px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
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
const EVENT_GRID = '150px 100px 1fr 1.2fr 1.6fr 70px 90px 80px';

function renderEventTargetNew(event: ActivityEventRow) {
  if (event.productCode) {
    return (
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>{event.productCode}</div>
        <div style={{ fontSize: 11, color: FAINT }}>{event.productName || '-'}</div>
      </div>
    );
  }

  if (event.type === 'SEARCH') {
    const query = typeof event.meta === 'object' && event.meta ? (event.meta as any).query : '';
    return (
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: INK }}>Arama: {query || '-'}</div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: FAINT }}>{event.pagePath || '-'}</div>
      </div>
    );
  }

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>{event.pagePath || '-'}</div>
      {event.pageTitle && <div style={{ fontSize: 11, color: FAINT }}>{event.pageTitle}</div>}
    </div>
  );
}

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

  const summaryCards = summary
    ? [
        { label: 'Toplam Olay', value: summary.totalEvents, icon: Activity, color: PRIMARY },
        { label: 'Tekil Kullanici', value: summary.uniqueUsers, icon: Users, color: PRIMARY },
        { label: 'Sayfa Goruntuleme', value: summary.pageViews, icon: Eye, color: INK },
        { label: 'Urun Goruntuleme', value: summary.productViews, icon: Eye, color: INK },
        { label: 'Sepet Ekleme', value: summary.cartAdds, icon: ShoppingCart, color: EMERALD },
        { label: 'Sepet Silme', value: summary.cartRemoves, icon: ShoppingCart, color: RED },
        { label: 'Sepet Guncelleme', value: summary.cartUpdates, icon: ShoppingCart, color: AMBER },
        { label: 'Aktif Sure', value: formatDuration(summary.activeSeconds), icon: Activity, color: INK },
        { label: 'Tiklama', value: summary.clickCount, icon: MousePointerClick, color: INK },
        { label: 'Arama', value: summary.searchCount, icon: Search, color: INK },
      ]
    : [];

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
        <span style={{ color: MUTED, fontWeight: 500 }}>Musteri Aktivite Takibi</span>
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
              display: 'flex',
              alignItems: 'center',
              gap: 9,
            }}
          >
            <Activity size={24} strokeWidth={2} style={{ color: PRIMARY }} />
            Musteri Aktivite Takibi
          </h1>
          <div style={{ fontSize: 13, color: FAINT, marginTop: 5 }}>
            Sayfa, urun ve sepet davranislarini takip eder.
          </div>
        </div>

        <button
          type="button"
          onClick={() => submitted && fetchReport(submitted, page)}
          style={headBtn}
        >
          <RefreshCw size={15} strokeWidth={2} />
          Yenile
        </button>
      </div>

      {/* Filtreler */}
      <div style={{ ...cardStyle, padding: 16, marginBottom: 18 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: INK, marginBottom: 4 }}>Filtreler</div>
        <div style={{ fontSize: 12, color: FAINT, marginBottom: 12 }}>
          Rapor icin tarih ve cari secin.
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          <div>
            <label style={labelStyle}>Baslangic Tarihi</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Bitis Tarihi</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Cari Ara</label>
            <div style={{ position: 'relative' }}>
              <input
                placeholder="Kod veya isim"
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setCustomerCode('');
                  setCustomerName('');
                }}
                style={inputStyle}
              />
              {customerSearching && (
                <div
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: 10,
                    fontSize: 11,
                    color: FAINT,
                  }}
                >
                  Araniyor...
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
                    borderRadius: 8,
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
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>
                          {parsed.code}
                        </div>
                        <div style={{ fontSize: 11, color: FAINT }}>{parsed.name || '-'}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {customerName && (
              <div style={{ fontSize: 11, color: FAINT, marginTop: 6 }}>
                Secilen cari: {customerName}
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>Kullanici ID</label>
            <input
              placeholder="Opsiyonel"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <button type="button" onClick={handleRunReport} style={primaryBtn}>
            Raporu Getir
          </button>
        </div>
      </div>

      {/* Secim Ozeti (metadata) */}
      {metadata && (
        <div style={{ ...cardStyle, padding: 16, marginBottom: 18 }}>
          <div style={{ fontSize: 11.5, color: FAINT, marginBottom: 6 }}>Secim Ozeti</div>
          <div style={{ fontSize: 12.5, color: MUTED }}>
            Tarih: {metadata.startDate} - {metadata.endDate}
            {metadata.customer?.code && (
              <span style={{ marginLeft: 16 }}>
                Cari: {metadata.customer.code}{' '}
                {metadata.customer.name ? `- ${metadata.customer.name}` : ''}
              </span>
            )}
            {metadata.userId && (
              <span style={{ marginLeft: 16 }}>Kullanici: {metadata.userId}</span>
            )}
          </div>
        </div>
      )}

      {/* 10 Ozet Kart */}
      {summary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 12,
            marginBottom: 18,
          }}
        >
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} style={{ ...cardStyle, padding: 14 }}>
                <div style={{ fontSize: 11, color: FAINT }}>{card.label}</div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  <Icon size={18} strokeWidth={2} style={{ color: card.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 19, fontWeight: 600, color: INK }}>{card.value}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3 Yan Tablo: Sayfalar / Tiklanan / Urunler */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
          marginBottom: 18,
        }}
      >
        {/* En Cok Ziyaret Edilen Sayfalar */}
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ padding: '13px 16px', borderBottom: `1px solid ${SOFT_LINE}` }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>
              En Cok Ziyaret Edilen Sayfalar
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 90px',
              gap: 10,
              padding: '10px 16px',
              background: TABLE_HEAD_BG,
              borderBottom: `1px solid ${SOFT_LINE}`,
              fontSize: 10,
              fontWeight: 600,
              color: FAINT,
              textTransform: 'uppercase',
            }}
          >
            <span>Sayfa</span>
            <span style={cellRight}>Goruntuleme</span>
          </div>
          {topPages.length === 0 ? (
            <div style={{ padding: '20px 16px', textAlign: 'center', color: MUTED, fontSize: 12.5 }}>
              Veri yok
            </div>
          ) : (
            topPages.map((item) => (
              <div
                key={item.pagePath}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 90px',
                  gap: 10,
                  padding: '10px 16px',
                  borderTop: `1px solid ${ROW_LINE}`,
                  alignItems: 'center',
                }}
              >
                <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED, wordBreak: 'break-all' }}>
                  {item.pagePath}
                </span>
                <span style={{ ...cellRight, fontWeight: 600, color: INK, fontSize: 12.5 }}>
                  {item.count}
                </span>
              </div>
            ))
          )}
        </div>

        {/* En Cok Tiklanan Sayfalar */}
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ padding: '13px 16px', borderBottom: `1px solid ${SOFT_LINE}` }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>
              En Cok Tiklanan Sayfalar
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 90px',
              gap: 10,
              padding: '10px 16px',
              background: TABLE_HEAD_BG,
              borderBottom: `1px solid ${SOFT_LINE}`,
              fontSize: 10,
              fontWeight: 600,
              color: FAINT,
              textTransform: 'uppercase',
            }}
          >
            <span>Sayfa</span>
            <span style={cellRight}>Tiklama</span>
          </div>
          {topClickPages.length === 0 ? (
            <div style={{ padding: '20px 16px', textAlign: 'center', color: MUTED, fontSize: 12.5 }}>
              Veri yok
            </div>
          ) : (
            topClickPages.map((item) => (
              <div
                key={item.pagePath}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 90px',
                  gap: 10,
                  padding: '10px 16px',
                  borderTop: `1px solid ${ROW_LINE}`,
                  alignItems: 'center',
                }}
              >
                <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED, wordBreak: 'break-all' }}>
                  {item.pagePath}
                </span>
                <span style={{ ...cellRight, fontWeight: 600, color: INK, fontSize: 12.5 }}>
                  {item.clickCount}
                  <div style={{ fontSize: 10, fontWeight: 400, color: FAINT }}>
                    {item.eventCount} ping
                  </div>
                </span>
              </div>
            ))
          )}
        </div>

        {/* En Cok Goruntulenen Urunler */}
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ padding: '13px 16px', borderBottom: `1px solid ${SOFT_LINE}` }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>
              En Cok Goruntulenen Urunler
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 90px',
              gap: 10,
              padding: '10px 16px',
              background: TABLE_HEAD_BG,
              borderBottom: `1px solid ${SOFT_LINE}`,
              fontSize: 10,
              fontWeight: 600,
              color: FAINT,
              textTransform: 'uppercase',
            }}
          >
            <span>Urun</span>
            <span style={cellRight}>Goruntuleme</span>
          </div>
          {topProducts.length === 0 ? (
            <div style={{ padding: '20px 16px', textAlign: 'center', color: MUTED, fontSize: 12.5 }}>
              Veri yok
            </div>
          ) : (
            topProducts.map((item, index) => (
              <div
                key={`${item.productCode || item.productId || index}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 90px',
                  gap: 10,
                  padding: '10px 16px',
                  borderTop: `1px solid ${ROW_LINE}`,
                  alignItems: 'center',
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>
                    {item.productCode || '-'}
                  </div>
                  <div style={{ fontSize: 11, color: FAINT }}>{item.productName || '-'}</div>
                </span>
                <span style={{ ...cellRight, fontWeight: 600, color: INK, fontSize: 12.5 }}>
                  {item.count}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* En Aktif Kullanici Listesi */}
      <div style={{ ...cardStyle, overflow: 'hidden', marginBottom: 18 }}>
        <div style={{ padding: '13px 16px', borderBottom: `1px solid ${SOFT_LINE}` }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>En Aktif Kullanici Listesi</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 760 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.4fr 1.6fr 90px 110px 90px 90px',
                gap: 10,
                padding: '10px 16px',
                background: TABLE_HEAD_BG,
                borderBottom: `1px solid ${SOFT_LINE}`,
                fontSize: 10,
                fontWeight: 600,
                color: FAINT,
                textTransform: 'uppercase',
              }}
            >
              <span>Kullanici</span>
              <span>Cari</span>
              <span style={cellRight}>Olay</span>
              <span style={cellRight}>Aktif Sure</span>
              <span style={cellRight}>Tiklama</span>
              <span style={cellRight}>Arama</span>
            </div>
            {topUsers.length === 0 ? (
              <div
                style={{ padding: '20px 16px', textAlign: 'center', color: MUTED, fontSize: 12.5 }}
              >
                Veri yok
              </div>
            ) : (
              topUsers.map((item) => (
                <div
                  key={item.userId}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.4fr 1.6fr 90px 110px 90px 90px',
                    gap: 10,
                    padding: '11px 16px',
                    borderTop: `1px solid ${ROW_LINE}`,
                    fontSize: 12,
                    color: INK,
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{item.userName || item.userId}</span>
                  <span style={{ color: MUTED }}>
                    {item.customerCode
                      ? `${item.customerCode}${item.customerName ? ` - ${item.customerName}` : ''}`
                      : '-'}
                  </span>
                  <span style={cellRight}>{item.eventCount}</span>
                  <span style={cellRight}>{formatDuration(item.activeSeconds)}</span>
                  <span style={cellRight}>{item.clickCount}</span>
                  <span style={cellRight}>{item.searchCount}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Detayli Olay Listesi */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ padding: '13px 16px', borderBottom: `1px solid ${SOFT_LINE}` }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>Detayli Olay Listesi</div>
        </div>

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <RefreshCw
              size={32}
              strokeWidth={2}
              className="animate-spin"
              style={{ margin: '0 auto 16px', color: FAINT, display: 'block' }}
            />
            <p style={{ color: MUTED, margin: 0 }}>Yukleniyor...</p>
          </div>
        ) : error ? (
          <div style={{ padding: 48, textAlign: 'center', color: RED }}>{error}</div>
        ) : events.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: MUTED }}>Veri bulunamadi</div>
        ) : (
          <>
            {/* Ic filtreler: Tip / Ara / Aktiflik pingleri */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 16,
                padding: 16,
                borderBottom: `1px solid ${SOFT_LINE}`,
                alignItems: 'flex-end',
              }}
            >
              <div style={{ minWidth: 180 }}>
                <label style={labelStyle}>Tip</label>
                <select
                  value={eventTypeFilter}
                  onChange={(e) => setEventTypeFilter(e.target.value as ActivityType | 'ALL')}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="ALL">Tum Tipler</option>
                  {Object.entries(typeLabels).map(([key, value]) => (
                    <option key={key} value={key}>
                      {value.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <label style={labelStyle}>Ara</label>
                <input
                  placeholder="Sayfa, urun, cari, arama..."
                  value={eventSearch}
                  onChange={(e) => setEventSearch(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', height: 36 }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 12.5,
                    color: INK,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={showActivePings}
                    onChange={(e) => setShowActivePings(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: PRIMARY }}
                  />
                  Aktiflik pinglerini goster
                </label>
              </div>
            </div>

            {/* Tablo */}
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 980 }}>
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
                  <span>Zaman</span>
                  <span>Tip</span>
                  <span>Kullanici</span>
                  <span>Cari</span>
                  <span>Sayfa / Urun</span>
                  <span style={cellRight}>Adet</span>
                  <span style={cellRight}>Sure</span>
                  <span style={cellRight}>Tiklama</span>
                </div>

                {filteredEvents.length === 0 ? (
                  <div
                    style={{
                      padding: '32px 16px',
                      textAlign: 'center',
                      color: MUTED,
                      fontSize: 12.5,
                    }}
                  >
                    Filtreye uygun veri yok
                  </div>
                ) : (
                  filteredEvents.map((event) => {
                    const customerLabel = event.customerCode
                      ? `${event.customerCode}${event.customerName ? ` - ${event.customerName}` : ''}`
                      : '-';
                    return (
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
                        <span style={{ fontSize: 11, color: MUTED }}>
                          {formatDateTime(event.createdAt)}
                        </span>
                        <span>
                          <TypeBadge type={event.type} />
                        </span>
                        <span style={{ fontSize: 11.5 }}>{event.userName || event.userId}</span>
                        <span style={{ fontSize: 11.5, color: MUTED }}>{customerLabel}</span>
                        <span>{renderEventTargetNew(event)}</span>
                        <span style={cellRight}>{event.quantity ?? '-'}</span>
                        <span style={cellRight}>{formatDuration(event.durationSeconds)}</span>
                        <span style={cellRight}>{event.clickCount ?? '-'}</span>
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
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={page === 1}
                    style={{
                      ...headBtn,
                      opacity: page === 1 ? 0.5 : 1,
                      cursor: page === 1 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Onceki
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={page === totalPages}
                    style={{
                      ...headBtn,
                      opacity: page === totalPages ? 0.5 : 1,
                      cursor: page === totalPages ? 'not-allowed' : 'pointer',
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
    </div>
  );
}
