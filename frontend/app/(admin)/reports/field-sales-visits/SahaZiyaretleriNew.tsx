'use client';

import Link from 'next/link';
import {
  Camera,
  ChevronRight,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  UserRound,
  Users,
} from 'lucide-react';
import { useSahaZiyaretleri } from './useSahaZiyaretleri';

/**
 * Yeni gorunum: Saha Ziyaretleri raporu.
 * Tum mantik useSahaZiyaretleri hook'undan gelir; hicbir handler/kolon/filtre/
 * ozet/satir-aksiyon (Fotograf modal, Konum -> Google Maps drill, telefon,
 * Talep/Rakip kutulari, cari bazli ozet paneli, sayfalama) dusurulmemistir.
 *
 * Tasarim referansi: design HTML generic report (#scr-genrep) +
 * reportMeta['field-sales-visits'] + brief 4.11.12. Genel rapor stili:
 * beyaz kart #fff / border #e7ebf2 / radius 12px; tablo/baslik bg #fafbfd;
 * primary #15356b; ink #14223b/#51607a/#8b97ac; emerald/amber.
 */

const PRIMARY = '#15356b';
const INK = '#14223b';
const MUTED = '#51607a';
const FAINT = '#8b97ac';
const LINE = '#e7ebf2';
const SOFT_LINE = '#eef1f6';
const INPUT_LINE = '#e3e8f0';
const PANEL_BG = '#fafbfd';
const EMERALD = '#047857';
const EMERALD_BG = '#ecfdf5';
const EMERALD_LINE = '#a7f3d0';
const AMBER = '#b45309';
const AMBER_BG = '#fffbeb';
const AMBER_LINE = '#fde68a';
const SLATE_BG = '#f1f4f9';

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
  border: `1px solid #d8e0ec`,
  borderRadius: 9,
  background: '#fff',
  color: MUTED,
  fontSize: 12.5,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const inputStyle: React.CSSProperties = {
  height: 36,
  width: '100%',
  border: `1px solid ${INPUT_LINE}`,
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

const infoBox: React.CSSProperties = {
  background: PANEL_BG,
  border: `1px solid ${SOFT_LINE}`,
  borderRadius: 9,
  padding: '9px 11px',
};

export default function SahaZiyaretleriNew() {
  const {
    search,
    setSearch,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    onlyVisitCustomers,
    setOnlyVisitCustomers,
    page,
    visits,
    summary,
    pagination,
    loading,
    photoPreview,
    setPhotoPreview,
    customerGroups,
    loadVisits,
    formatDateTime,
  } = useSahaZiyaretleri();

  return (
    <div style={{ maxWidth: 1480, margin: '0 auto', padding: 24 }}>
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
        <span style={{ color: MUTED, fontWeight: 500 }}>Saha Ziyaretleri</span>
      </div>

      {/* Header: baslik + Raporlara Don + Raporu Yenile */}
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
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: EMERALD_BG,
              border: `1px solid ${EMERALD_LINE}`,
              color: EMERALD,
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 10px',
              borderRadius: 999,
              marginBottom: 8,
            }}
          >
            <MapPin size={13} strokeWidth={2} />
            Saha satış raporu
          </div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: '-.02em',
              margin: 0,
              color: INK,
            }}
          >
            Saha Ziyaretleri
          </h1>
          <div style={{ fontSize: 13, color: FAINT, marginTop: 5, maxWidth: 640 }}>
            Açılan ziyaret carilerini ve mevcut carilere yazılan saha notlarını cari bazında takip edin.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/reports" style={{ ...headBtn, textDecoration: 'none' }}>
            <ChevronRight size={15} strokeWidth={2} style={{ transform: 'rotate(180deg)' }} />
            Raporlara Dön
          </Link>
          <button
            type="button"
            onClick={() => loadVisits(1)}
            disabled={loading}
            style={{
              ...headBtn,
              background: PRIMARY,
              color: '#fff',
              border: 'none',
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshCw
              size={15}
              strokeWidth={2}
              className={loading ? 'animate-spin' : undefined}
            />
            Raporu Yenile
          </button>
        </div>
      </div>

      {/* Summary Cards (4 metrik) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 14,
          marginBottom: 16,
        }}
      >
        <div style={summaryCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <MapPin size={14} strokeWidth={2} style={{ color: PRIMARY }} />
            <span style={{ fontSize: 11.5, color: FAINT }}>Toplam Not</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 600, color: INK, marginTop: 6 }}>
            {summary.total || 0}
          </div>
        </div>

        <div style={summaryCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Users size={14} strokeWidth={2} style={{ color: PRIMARY }} />
            <span style={{ fontSize: 11.5, color: FAINT }}>Cari Sayısı</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 600, color: INK, marginTop: 6 }}>
            {summary.uniqueCustomers || 0}
          </div>
        </div>

        <div style={summaryCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <UserRound size={14} strokeWidth={2} style={{ color: EMERALD }} />
            <span style={{ fontSize: 11.5, color: FAINT }}>Ziyaret Carisi Notu</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 600, color: EMERALD, marginTop: 6 }}>
            {summary.visitCustomerNotes || 0}
          </div>
        </div>

        <div style={summaryCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Camera size={14} strokeWidth={2} style={{ color: AMBER }} />
            <span style={{ fontSize: 11.5, color: FAINT }}>Fotoğraflı Not</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 600, color: AMBER, marginTop: 6 }}>
            {summary.photoCount || 0}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ ...cardStyle, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: INK, marginBottom: 12 }}>
          Filtreler
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1fr 1fr auto auto',
            gap: 12,
            alignItems: 'end',
          }}
        >
          <div>
            <label style={labelStyle}>Arama</label>
            <div style={{ position: 'relative' }}>
              <Search
                size={15}
                strokeWidth={2}
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: FAINT,
                  pointerEvents: 'none',
                }}
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void loadVisits(1);
                }}
                placeholder="Cari kodu, cari adı, not, talep, rakip bilgi, personel..."
                style={{ ...inputStyle, paddingLeft: 32 }}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Başlangıç Tarihi</label>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Bitiş Tarihi</label>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              style={inputStyle}
            />
          </div>

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              height: 36,
              border: `1px solid ${INPUT_LINE}`,
              borderRadius: 8,
              padding: '0 12px',
              fontSize: 12.5,
              fontWeight: 500,
              color: MUTED,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <input
              type="checkbox"
              checked={onlyVisitCustomers}
              onChange={(event) => setOnlyVisitCustomers(event.target.checked)}
              style={{ width: 15, height: 15, accentColor: PRIMARY }}
            />
            Sadece ziyaret carileri
          </label>

          <button
            type="button"
            onClick={() => loadVisits(1)}
            disabled={loading}
            style={{
              height: 36,
              padding: '0 18px',
              border: 'none',
              borderRadius: 8,
              background: PRIMARY,
              color: '#fff',
              fontSize: 12.5,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            Listele
          </button>
        </div>
      </div>

      {/* Iki kolon: Cari Bazli Ozet + Ziyaret Detaylari */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '380px minmax(0, 1fr)',
          gap: 18,
          alignItems: 'start',
        }}
      >
        {/* Cari Bazli Ozet */}
        <div style={{ ...cardStyle, padding: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: INK, marginBottom: 12 }}>
            Cari Bazlı Özet
          </div>
          <div style={{ maxHeight: 760, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 2 }}>
            {customerGroups.length === 0 && (
              <EmptyBlock text="Bu filtrelerle cari bulunamadı." />
            )}
            {customerGroups.map((group) => (
              <div
                key={group.code}
                style={{
                  border: `1px solid ${LINE}`,
                  borderRadius: 10,
                  padding: 13,
                  background: '#fff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: INK,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={group.title}
                    >
                      {group.title}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: FAINT,
                        marginTop: 3,
                        fontFamily: "'Roboto Mono', monospace",
                      }}
                    >
                      {group.code}
                    </div>
                  </div>
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '3px 9px',
                      borderRadius: 999,
                      background: group.isVisitCustomer ? EMERALD_BG : SLATE_BG,
                      border: `1px solid ${group.isVisitCustomer ? EMERALD_LINE : '#e2e8f0'}`,
                      color: group.isVisitCustomer ? EMERALD : MUTED,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {group.isVisitCustomer ? 'Ziyaret carisi' : `${group.count} not`}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 9,
                    fontSize: 11.5,
                    color: MUTED,
                    lineHeight: 1.5,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {group.lastNote || '-'}
                </div>
                <div style={{ marginTop: 7, fontSize: 11, color: FAINT }}>
                  Son ziyaret: {formatDateTime(group.lastAt)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ziyaret Detaylari */}
        <div style={{ ...cardStyle, padding: 16 }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 14,
            }}
          >
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>Ziyaret Detayları</div>
              <div style={{ fontSize: 12, color: FAINT, marginTop: 3 }}>
                {pagination.total || 0} kayıt, sayfa {pagination.page || 1}/{pagination.totalPages || 1}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                disabled={loading || page <= 1}
                onClick={() => loadVisits(page - 1)}
                style={{
                  ...headBtn,
                  opacity: loading || page <= 1 ? 0.5 : 1,
                  cursor: loading || page <= 1 ? 'not-allowed' : 'pointer',
                }}
              >
                Önceki
              </button>
              <button
                type="button"
                disabled={loading || page >= (pagination.totalPages || 1)}
                onClick={() => loadVisits(page + 1)}
                style={{
                  ...headBtn,
                  opacity: loading || page >= (pagination.totalPages || 1) ? 0.5 : 1,
                  cursor: loading || page >= (pagination.totalPages || 1) ? 'not-allowed' : 'pointer',
                }}
              >
                Sonraki
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {loading && <EmptyBlock text="Rapor yükleniyor..." />}
            {!loading && visits.length === 0 && (
              <EmptyBlock text="Bu filtrelerle ziyaret notu bulunamadı." />
            )}
            {visits.map((visit) => (
              <article
                key={visit.id}
                style={{
                  border: `1px solid ${LINE}`,
                  borderRadius: 12,
                  padding: 14,
                  background: '#fff',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: INK,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: 360,
                        }}
                        title={visit.customerTitle || visit.customerName || visit.customerCode}
                      >
                        {visit.customerTitle || visit.customerName || visit.customerCode}
                      </span>
                      {visit.isVisitCustomer && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 999,
                            background: EMERALD_BG,
                            border: `1px solid ${EMERALD_LINE}`,
                            color: EMERALD,
                          }}
                        >
                          Ziyaret carisi
                        </span>
                      )}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 11.5, color: FAINT }}>
                      {visit.customerCode} {visit.city ? `- ${visit.city}` : ''}{' '}
                      {visit.district ? `/ ${visit.district}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 11.5, color: MUTED, fontWeight: 500 }}>
                    <div>{formatDateTime(visit.createdAt)}</div>
                    <div style={{ color: FAINT }}>{visit.createdByName || '-'}</div>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 11,
                    background: PANEL_BG,
                    border: `1px solid ${SOFT_LINE}`,
                    borderRadius: 9,
                    padding: 11,
                    fontSize: 12.5,
                    lineHeight: 1.55,
                    color: INK,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {visit.note}
                </div>

                {(visit.demand || visit.competitorInfo) && (
                  <div
                    style={{
                      marginTop: 11,
                      display: 'grid',
                      gridTemplateColumns: visit.demand && visit.competitorInfo ? '1fr 1fr' : '1fr',
                      gap: 9,
                    }}
                  >
                    {visit.demand && (
                      <div style={infoBox}>
                        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em', color: FAINT }}>
                          Talep / İhtiyaç
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, color: INK, whiteSpace: 'pre-wrap' }}>
                          {visit.demand}
                        </div>
                      </div>
                    )}
                    {visit.competitorInfo && (
                      <div style={infoBox}>
                        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em', color: FAINT }}>
                          Rakip Bilgi
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, color: INK, whiteSpace: 'pre-wrap' }}>
                          {visit.competitorInfo}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ marginTop: 11, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {visit.photoUrl && (
                    <button
                      type="button"
                      onClick={() => setPhotoPreview(visit.photoUrl)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: AMBER_BG,
                        border: `1px solid ${AMBER_LINE}`,
                        color: AMBER,
                        borderRadius: 8,
                        padding: '6px 11px',
                        fontSize: 11.5,
                        fontWeight: 600,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      <Camera size={14} strokeWidth={2} />
                      Fotoğraf
                    </button>
                  )}
                  {visit.latitude && visit.longitude && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${visit.latitude},${visit.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: EMERALD_BG,
                        border: `1px solid ${EMERALD_LINE}`,
                        color: EMERALD,
                        borderRadius: 8,
                        padding: '6px 11px',
                        fontSize: 11.5,
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      <MapPin size={14} strokeWidth={2} />
                      Konum
                    </a>
                  )}
                  {visit.phone && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: SLATE_BG,
                        border: `1px solid #e2e8f0`,
                        color: MUTED,
                        borderRadius: 8,
                        padding: '6px 11px',
                        fontSize: 11.5,
                        fontWeight: 600,
                      }}
                    >
                      <Phone size={14} strokeWidth={2} />
                      {visit.phone}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>

      {/* Fotograf onizleme modali */}
      {photoPreview && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,.9)',
            padding: 16,
          }}
          onClick={() => setPhotoPreview(null)}
        >
          <div style={{ position: 'relative', maxHeight: '100%', maxWidth: 1040 }}>
            <button
              type="button"
              style={{
                position: 'absolute',
                right: 8,
                top: 8,
                borderRadius: 999,
                background: 'rgba(255,255,255,.92)',
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 600,
                color: INK,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                boxShadow: '0 6px 18px rgba(0,0,0,.25)',
              }}
            >
              Kapat
            </button>
            <img
              src={photoPreview}
              alt="Ziyaret fotografi"
              style={{
                maxHeight: '88vh',
                maxWidth: '100%',
                borderRadius: 16,
                background: '#fff',
                objectFit: 'contain',
                padding: 12,
                boxShadow: '0 30px 70px rgba(0,0,0,.32)',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div
      style={{
        border: `1px dashed #cbd5e1`,
        background: PANEL_BG,
        borderRadius: 10,
        padding: 24,
        fontSize: 12.5,
        fontWeight: 500,
        color: MUTED,
        textAlign: 'center',
      }}
    >
      {text}
    </div>
  );
}
