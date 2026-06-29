'use client';

import Link from 'next/link';
import {
  ChevronRight,
  Download,
  RefreshCw,
  Package,
  Users,
} from 'lucide-react';
import { useEnCokSatan } from './useEnCokSatan';

/**
 * Yeni gorunum: En Cok Satan Urunler raporu.
 * Tum mantik useEnCokSatan hook'undan gelir; hicbir handler/kolon/filtre/ozet/
 * satir-aksiyon (Musteri -> product-customers drill) dusurulmemistir.
 *
 * Tasarim referansi: design HTML #scr-top (data-screen-label="En Çok Satan") +
 * brief 4.11.2. Genel rapor stili: beyaz kart #fff / border #e7ebf2 / radius 12px;
 * tablo basligi bg #fafbfd; primary #15356b; ink #14223b/#51607a/#8b97ac;
 * kar-marji renk esigi (>=20 yesil / >=10 amber / <10 kirmizi).
 */

const PRIMARY = '#15356b';
const PRIMARY_HOVER = '#1c4585';
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

// Tablo grid sablonu: basliklar ve satirlar ayni grid'i kullanir.
// Sira | Urun Kodu | Urun Adi | Marka | Miktar | Ciro | Maliyet | Kar | Marj | Ort.Fiyat | Musteri
const GRID =
  '50px 1.2fr 2fr 1fr 80px 1.1fr 1.1fr 1.1fr 90px 1.1fr 80px';

// Kar marji renk esigi (Classic ile ayni: >=20 yesil / >=10 amber / <10 kirmizi)
const marjColor = (m: number) => (m >= 20 ? EMERALD : m >= 10 ? AMBER : RED);

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
  border: `1px solid #e3e8f0`,
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

const cellRight: React.CSSProperties = { textAlign: 'right' };

export default function EnCokSatanNew() {
  const {
    data,
    summary,
    loading,
    error,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    brand,
    setBrand,
    category,
    setCategory,
    sortBy,
    setSortBy,
    page,
    setPage,
    totalPages,
    exportLoading,
    fetchData,
    handleExportExcel,
    formatCurrency,
    getSortLabel,
  } = useEnCokSatan();

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
          href="/reports"
          style={{ color: FAINT, textDecoration: 'none', fontWeight: 500 }}
        >
          Raporlar
        </Link>
        <ChevronRight size={13} strokeWidth={2} />
        <span style={{ color: MUTED, fontWeight: 500 }}>En Çok Satan Ürünler</span>
      </div>

      {/* Header: baslik + Yenile/Excel */}
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
            En Çok Satan Ürünler
          </h1>
          <div style={{ fontSize: 13, color: FAINT, marginTop: 5 }}>
            {getSortLabel()} bazında sıralanmış ürünler
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={fetchData} style={headBtn}>
            <RefreshCw size={15} strokeWidth={2} />
            Yenile
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={exportLoading}
            style={{
              ...headBtn,
              background: PRIMARY,
              color: '#fff',
              border: 'none',
              opacity: exportLoading ? 0.7 : 1,
              cursor: exportLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {exportLoading ? (
              <RefreshCw size={15} strokeWidth={2} className="animate-spin" />
            ) : (
              <Download size={15} strokeWidth={2} />
            )}
            {exportLoading ? 'Hazırlanıyor...' : 'Excel İndir (Tümü)'}
          </button>
        </div>
      </div>

      {/* Summary Cards (4 metrik) */}
      {summary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 14,
            marginBottom: 18,
          }}
        >
          <div style={summaryCard}>
            <div style={{ fontSize: 11.5, color: FAINT }}>Toplam Ürün</div>
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
              {summary.totalProducts}
              <span style={{ fontSize: 12, fontWeight: 400, color: FAINT }}>ürün</span>
            </div>
          </div>

          <div style={summaryCard}>
            <div style={{ fontSize: 11.5, color: FAINT }}>Toplam Ciro</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: INK, marginTop: 5 }}>
              {formatCurrency(summary.totalRevenue)}
            </div>
          </div>

          <div style={summaryCard}>
            <div style={{ fontSize: 11.5, color: FAINT }}>Toplam Kâr</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: EMERALD, marginTop: 5 }}>
              {formatCurrency(summary.totalProfit)}
            </div>
          </div>

          <div style={summaryCard}>
            <div style={{ fontSize: 11.5, color: FAINT }}>Ortalama Kâr Marjı</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: AMBER, marginTop: 5 }}>
              %{summary.avgProfitMargin.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ ...cardStyle, padding: 16, marginBottom: 18 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: INK,
            marginBottom: 12,
          }}
        >
          Filtreler
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 12,
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
            <label style={labelStyle}>Marka</label>
            <input
              placeholder="Marka kodu..."
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Kategori</label>
            <input
              placeholder="Kategori..."
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Sıralama</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="revenue">Ciro (Yüksek → Düşük)</option>
              <option value="profit">Kar (Yüksek → Düşük)</option>
              <option value="profit_asc">Kar (Düşük → Yüksek)</option>
              <option value="margin">Kar Marjı (Yüksek → Düşük)</option>
              <option value="margin_asc">Kar Marjı (Düşük → Yüksek)</option>
              <option value="quantity">Miktar (Yüksek → Düşük)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <RefreshCw
              size={32}
              strokeWidth={2}
              className="animate-spin"
              style={{ margin: '0 auto 16px', color: FAINT, display: 'block' }}
            />
            <p style={{ color: MUTED, margin: 0 }}>Yükleniyor...</p>
          </div>
        ) : error ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Package
              size={32}
              strokeWidth={2}
              style={{ margin: '0 auto 16px', color: RED, display: 'block' }}
            />
            <p style={{ color: RED, margin: 0 }}>{error}</p>
            <button
              type="button"
              onClick={fetchData}
              style={{ ...headBtn, margin: '16px auto 0' }}
            >
              Tekrar Dene
            </button>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 1040 }}>
                {/* Header row */}
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
                  }}
                >
                  <span>Sıra</span>
                  <span>Ürün Kodu</span>
                  <span>Ürün Adı</span>
                  <span>Marka</span>
                  <span style={cellRight}>Miktar</span>
                  <span style={cellRight}>Ciro</span>
                  <span style={cellRight}>Maliyet</span>
                  <span style={cellRight}>Kâr</span>
                  <span style={cellRight}>Marj</span>
                  <span style={cellRight}>Ort. Fiyat</span>
                  <span style={cellRight}>Müşteri</span>
                </div>

                {/* Rows */}
                {data.length === 0 ? (
                  <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                    <Package
                      size={32}
                      strokeWidth={2}
                      style={{ margin: '0 auto 8px', color: FAINT, display: 'block' }}
                    />
                    <p style={{ color: MUTED, margin: 0 }}>Veri bulunamadı</p>
                  </div>
                ) : (
                  data.map((item, index) => (
                    <div
                      key={item.productCode}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: GRID,
                        gap: 10,
                        padding: '12px 16px',
                        borderTop: `1px solid ${ROW_LINE}`,
                        fontSize: 12,
                        color: INK,
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontWeight: 700, color: PRIMARY }}>
                        {(page - 1) * 50 + index + 1}
                      </span>
                      <span
                        style={{
                          fontFamily: "'Roboto Mono', monospace",
                          fontSize: 11,
                          color: MUTED,
                        }}
                      >
                        {item.productCode}
                      </span>
                      <span
                        style={{
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={item.productName}
                      >
                        {item.productName}
                      </span>
                      <span style={{ color: MUTED }}>{item.brand || '-'}</span>
                      <span style={{ ...cellRight, fontWeight: 500 }}>
                        {item.quantity.toFixed(2)}
                      </span>
                      <span style={{ ...cellRight, color: EMERALD, fontWeight: 600 }}>
                        {formatCurrency(item.revenue)}
                      </span>
                      <span style={{ ...cellRight, color: MUTED }}>
                        {formatCurrency(item.cost)}
                      </span>
                      <span style={{ ...cellRight, color: '#7c3aed', fontWeight: 700 }}>
                        {formatCurrency(item.profit)}
                      </span>
                      <span
                        style={{
                          ...cellRight,
                          color: marjColor(item.profitMargin),
                          fontWeight: 700,
                        }}
                      >
                        %{item.profitMargin.toFixed(2)}
                      </span>
                      <span style={cellRight}>{formatCurrency(item.avgPrice)}</span>
                      <span style={cellRight}>
                        <Link
                          href={`/reports/product-customers/${item.productCode}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: 4,
                            color: PRIMARY,
                            textDecoration: 'none',
                            fontWeight: 600,
                          }}
                          title="Bu ürünü alan müşteriler"
                        >
                          <Users size={14} strokeWidth={2} style={{ color: FAINT }} />
                          <span style={{ textDecoration: 'underline' }}>
                            {item.customerCount}
                          </span>
                        </Link>
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Pagination */}
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
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    style={{
                      ...headBtn,
                      opacity: page === 1 ? 0.5 : 1,
                      cursor: page === 1 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Önceki
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
