'use client';

import Link from 'next/link';
import { ChevronRight, ArrowLeft, RefreshCw, ListChecks, Users } from 'lucide-react';
import { useMinMaxHaric } from './useMinMaxHaric';

/**
 * Yeni gorunum: MinMax Hesaplanmayacaklar Raporu.
 * Tum mantik useMinMaxHaric hook'undan gelir; hicbir handler/kolon/filtre/ozet/
 * satir-aksiyon dusurulmemistir. Klasikte OLMAYAN hicbir oge eklenmemistir.
 *
 * Tasarim referansi: design HTML'de bu route'a ozel data-screen-label YOK; bu yuzden
 * design'in GENEL rapor/Ucarer ekran stili taklit edildi (beyaz kart #fff / border
 * #e7ebf2 / radius 12px; ust baslik + Geri/Yenile; ozet metrik kartlari; tablo basligi
 * #fafbfd; primary #15356b; ink #14223b/#51607a/#8b97ac; amber vurgulu satir).
 * Brief 4.12.2: Listeyi Yenile + Toplam:N; Tablo Stok Kodu | Stok Adi | Model Kodu |
 * Son 1/2/3 Ay Farkli Cari | Islem(Hesaplamaya Al); son 2 ayda >1 cari -> amber satir.
 */

const PRIMARY = '#15356b';
const INK = '#14223b';
const MUTED = '#51607a';
const FAINT = '#8b97ac';
const LINE = '#e7ebf2';
const SOFT_LINE = '#eef1f6';
const ROW_LINE = '#f1f4f9';
const TABLE_HEAD_BG = '#fafbfd';
const AMBER_BG = '#fef3c7';
const AMBER_BORDER = '#fcd34d';

// Tablo grid sablonu: basliklar ve satirlar ayni grid'i kullanir.
// Stok Kodu | Stok Adi | Model Kodu | Son 1 Ay | Son 2 Ay | Son 3 Ay | Islem
const GRID = '1.1fr 2.2fr 1fr 130px 130px 130px 130px';

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
  textDecoration: 'none',
};

const summaryCard: React.CSSProperties = {
  ...cardStyle,
  padding: 15,
};

const cellRight: React.CSSProperties = { textAlign: 'right' };

export default function MinMaxHaricNew() {
  const { rows, loading, updatingByCode, load, includeBackToMinMax } = useMinMaxHaric();

  const multiCustomerCount = rows.filter((r) => r.hasMultiCustomerSalesLast2Months).length;

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
        <Link
          href="/reports/ucarer-depo"
          style={{ color: FAINT, textDecoration: 'none', fontWeight: 500 }}
        >
          Üçarer Depo
        </Link>
        <ChevronRight size={13} strokeWidth={2} />
        <span style={{ color: MUTED, fontWeight: 500 }}>MinMax Hesaplanmayacaklar</span>
      </div>

      {/* Header: Geri + baslik + Yenile */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/reports/ucarer-depo" style={headBtn} title="Üçarer Depo'ya dön">
            <ArrowLeft size={15} strokeWidth={2} />
            Üçarer Depo
          </Link>
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
              MinMax Hesaplanmayacaklar Raporu
            </h1>
            <div style={{ fontSize: 13, color: FAINT, marginTop: 5 }}>
              <code style={{ fontFamily: "'Roboto Mono', monospace" }}>sto_model_kodu = HAYIR</code> işaretli stoklar
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={load}
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
          {loading ? 'Yenileniyor...' : 'Listeyi Yenile'}
        </button>
      </div>

      {/* Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 280px))',
          gap: 14,
          marginBottom: 18,
        }}
      >
        <div style={summaryCard}>
          <div style={{ fontSize: 11.5, color: FAINT }}>Toplam</div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: INK,
              marginTop: 5,
              display: 'flex',
              alignItems: 'baseline',
              gap: 6,
            }}
          >
            {rows.length.toLocaleString('tr-TR')}
            <span style={{ fontSize: 12, fontWeight: 400, color: FAINT }}>stok</span>
          </div>
        </div>

        <div style={summaryCard}>
          <div style={{ fontSize: 11.5, color: FAINT }}>Son 2 Ayda &gt;1 Cariye Satılan</div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: '#b45309',
              marginTop: 5,
              display: 'flex',
              alignItems: 'baseline',
              gap: 6,
            }}
          >
            {multiCustomerCount.toLocaleString('tr-TR')}
            <span style={{ fontSize: 12, fontWeight: 400, color: FAINT }}>satır (amber)</span>
          </div>
        </div>
      </div>

      {/* Liste karti */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        {/* Kart basligi */}
        <div
          style={{
            padding: '14px 16px',
            borderBottom: `1px solid ${SOFT_LINE}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 14,
              fontWeight: 600,
              color: INK,
            }}
          >
            <ListChecks size={16} strokeWidth={2} style={{ color: PRIMARY }} />
            Liste
          </div>
          <div style={{ fontSize: 12, color: FAINT, marginTop: 4 }}>
            Son 1/2/3 ay farklı cari satış sayıları ile birlikte listelenir. Son 2 ayda 1'den fazla cariye satılanlar renklidir.
          </div>
        </div>

        {/* Tablo */}
        <div style={{ overflowX: 'auto', maxHeight: '70vh', overflowY: 'auto' }}>
          <div style={{ minWidth: 980 }}>
            {/* Header row (sticky) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: GRID,
                gap: 10,
                padding: '11px 16px',
                background: TABLE_HEAD_BG,
                borderBottom: `1px solid ${SOFT_LINE}`,
                fontSize: 10,
                fontWeight: 600,
                color: FAINT,
                textTransform: 'uppercase',
                alignItems: 'center',
                position: 'sticky',
                top: 0,
                zIndex: 10,
              }}
            >
              <span>Stok Kodu</span>
              <span>Stok Adı</span>
              <span>Model Kodu</span>
              <span style={cellRight}>Son 1 Ay Farklı Cari</span>
              <span style={cellRight}>Son 2 Ay Farklı Cari</span>
              <span style={cellRight}>Son 3 Ay Farklı Cari</span>
              <span style={{ textAlign: 'center' }}>İşlem</span>
            </div>

            {/* Rows */}
            {rows.length === 0 ? (
              <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                <ListChecks
                  size={32}
                  strokeWidth={2}
                  style={{ margin: '0 auto 8px', color: FAINT, display: 'block' }}
                />
                <p style={{ color: MUTED, margin: 0 }}>Kayıt yok.</p>
              </div>
            ) : (
              rows.map((row) => {
                const code = String(row.productCode || '').trim().toUpperCase();
                const highlight = row.hasMultiCustomerSalesLast2Months;
                return (
                  <div
                    key={code}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: GRID,
                      gap: 10,
                      padding: '12px 16px',
                      borderTop: `1px solid ${highlight ? AMBER_BORDER : ROW_LINE}`,
                      background: highlight ? AMBER_BG : '#fff',
                      fontSize: 12,
                      color: INK,
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'Roboto Mono', monospace",
                        fontSize: 11,
                        fontWeight: 700,
                        color: INK,
                      }}
                    >
                      {code}
                    </span>
                    <span
                      style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={row.productName || '-'}
                    >
                      {row.productName || '-'}
                    </span>
                    <span style={{ color: MUTED }}>{row.stoModelKodu || '-'}</span>
                    <span style={cellRight}>
                      {Number(row.distinctCustomersLast1Month || 0).toLocaleString('tr-TR')}
                    </span>
                    <span style={cellRight}>
                      {Number(row.distinctCustomersLast2Months || 0).toLocaleString('tr-TR')}
                    </span>
                    <span style={cellRight}>
                      {Number(row.distinctCustomersLast3Months || 0).toLocaleString('tr-TR')}
                    </span>
                    <span style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => includeBackToMinMax(code)}
                        disabled={Boolean(updatingByCode[code])}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          height: 30,
                          padding: '0 12px',
                          border: `1px solid ${LINE}`,
                          borderRadius: 8,
                          background: '#fff',
                          color: INK,
                          fontSize: 11.5,
                          fontWeight: 600,
                          fontFamily: 'inherit',
                          cursor: updatingByCode[code] ? 'not-allowed' : 'pointer',
                          opacity: updatingByCode[code] ? 0.6 : 1,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {updatingByCode[code] ? (
                          <RefreshCw size={13} strokeWidth={2} className="animate-spin" />
                        ) : (
                          <Users size={13} strokeWidth={2} style={{ color: FAINT }} />
                        )}
                        {updatingByCode[code] ? '...' : 'Hesaplamaya Al'}
                      </button>
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
