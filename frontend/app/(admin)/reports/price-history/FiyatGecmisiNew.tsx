'use client';

import Link from 'next/link';
import {
  ChevronRight,
  ChevronDown,
  Download,
  RefreshCw,
  Search,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Calendar,
  Package,
  AlertTriangle,
} from 'lucide-react';
import { useFiyatGecmisi, priceListNames } from './useFiyatGecmisi';

/**
 * Yeni gorunum: Fiyat Gecmisi raporu.
 * Tum mantik useFiyatGecmisi hook'undan gelir; hicbir handler/kolon/filtre/ozet/
 * akordeon-satir/eksik-liste uyarisi/Excel/Yenile dusurulmemistir.
 *
 * Bu ekran salt-okuma rapordur (Mikro'ya yazan/Excel import eden buton YOKTUR);
 * tek dis-cikti islemi Excel export'tur (exportToExcel) ve mantigi degismemistir.
 *
 * Tasarim referansi: design HTML'de "Fiyat Geçmişi" ekran etiketi yok; brief 4.9.6 +
 * genel rapor stili taklit edildi: beyaz kart #fff / border #e7ebf2 / radius 12px;
 * tablo basligi bg #fafbfd; primary #15356b; ink #14223b/#51607a/#8b97ac;
 * artis kirmizi / azalis emerald / karisik notr; tutarlilik emerald, tutarsiz amber/kirmizi.
 */

const PRIMARY = '#15356b';
const INK = '#14223b';
const MUTED = '#51607a';
const FAINT = '#8b97ac';
const LINE = '#e7ebf2';
const SOFT_LINE = '#eef1f6';
const TABLE_HEAD_BG = '#fafbfd';
const EMERALD = '#047857';
const AMBER = '#b45309';
const RED = '#b91c1c';

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

// Yon ikonu (Classic ile ayni renk mantigi: artis kirmizi / azalis yesil / notr)
function DirectionIcon({ direction }: { direction: string }) {
  if (direction === 'increase') return <TrendingUp size={16} strokeWidth={2} style={{ color: RED }} />;
  if (direction === 'decrease') return <TrendingDown size={16} strokeWidth={2} style={{ color: EMERALD }} />;
  return <span style={{ color: FAINT, fontWeight: 700, fontSize: 14 }}>•</span>;
}

// Yon rozeti (Classic: Artış destructive / Azalış yesil / Karışık outline)
function DirectionBadge({ direction }: { direction: string }) {
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    height: 22,
    padding: '0 9px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  };
  if (direction === 'increase') {
    return <span style={{ ...base, background: '#fde8e8', color: RED }}>Artış</span>;
  }
  if (direction === 'decrease') {
    return <span style={{ ...base, background: '#e7f6ee', color: EMERALD }}>Azalış</span>;
  }
  return <span style={{ ...base, background: '#fff', color: MUTED, border: `1px solid ${LINE}` }}>Karışık</span>;
}

export default function FiyatGecmisiNew() {
  const {
    data,
    summary,
    loading,
    error,
    expandedRows,
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    consistencyFilter,
    setConsistencyFilter,
    directionFilter,
    setDirectionFilter,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    page,
    setPage,
    totalPages,
    fetchData,
    handleSearch,
    toggleRow,
    exportToExcel,
  } = useFiyatGecmisi();

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
        <span style={{ color: MUTED, fontWeight: 500 }}>Fiyat Geçmişi</span>
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
            Fiyat Geçmişi Raporu
          </h1>
          <div style={{ fontSize: 13, color: FAINT, marginTop: 5 }}>
            Mikro ERP fiyat değişiklikleri ve tutarlılık kontrolü
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            style={{
              ...headBtn,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshCw size={15} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
            Yenile
          </button>
          <button
            type="button"
            onClick={exportToExcel}
            disabled={data.length === 0}
            style={{
              ...headBtn,
              background: PRIMARY,
              color: '#fff',
              border: 'none',
              opacity: data.length === 0 ? 0.6 : 1,
              cursor: data.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            <Download size={15} strokeWidth={2} />
            Excel İndir
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
            <div style={{ fontSize: 11.5, color: FAINT }}>Toplam Değişiklik</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: INK, marginTop: 5 }}>
              {summary.totalChanges}
            </div>
            <div style={{ fontSize: 11, color: FAINT, marginTop: 6 }}>
              Son 7 gün: {summary.last7DaysChanges} | 30 gün: {summary.last30DaysChanges}
            </div>
          </div>

          <div style={summaryCard}>
            <div style={{ fontSize: 11.5, color: FAINT }}>Tutarlılık Oranı</div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                marginTop: 5,
              }}
            >
              {summary.inconsistencyRate < 5 ? (
                <CheckCircle size={18} strokeWidth={2} style={{ color: EMERALD }} />
              ) : (
                <AlertTriangle size={18} strokeWidth={2} style={{ color: AMBER }} />
              )}
              <div style={{ fontSize: 20, fontWeight: 600, color: INK }}>
                {(100 - summary.inconsistencyRate).toFixed(1)}%
              </div>
            </div>
            <div style={{ fontSize: 11, color: FAINT, marginTop: 6 }}>
              Tutarlı: {summary.consistentChanges} | Tutarsız: {summary.inconsistentChanges}
            </div>
          </div>

          <div style={summaryCard}>
            <div style={{ fontSize: 11.5, color: FAINT }}>Ortalama Artış</div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                marginTop: 5,
              }}
            >
              <TrendingUp size={18} strokeWidth={2} style={{ color: RED }} />
              <div style={{ fontSize: 20, fontWeight: 600, color: RED }}>
                {summary.avgIncreasePercent > 0 ? '+' : ''}
                {summary.avgIncreasePercent.toFixed(2)}%
              </div>
            </div>
          </div>

          <div style={summaryCard}>
            <div style={{ fontSize: 11.5, color: FAINT }}>Ortalama Azalış</div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                marginTop: 5,
              }}
            >
              <TrendingDown size={18} strokeWidth={2} style={{ color: EMERALD }} />
              <div style={{ fontSize: 20, fontWeight: 600, color: EMERALD }}>
                {summary.avgDecreasePercent.toFixed(2)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ ...cardStyle, padding: 16, marginBottom: 18 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: INK, marginBottom: 12 }}>
          Filtreler
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
          }}
        >
          <div>
            <label style={labelStyle}>Ürün Ara</label>
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
                placeholder="Ürün kodu veya adı..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                style={{ ...inputStyle, paddingLeft: 32 }}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Kategori</label>
            <input
              placeholder="Kategori..."
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Tutarlılık</label>
            <select
              value={consistencyFilter}
              onChange={(e) => setConsistencyFilter(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="all">Tümü</option>
              <option value="consistent">Tutarlı (10 liste)</option>
              <option value="inconsistent">Tutarsız (&lt;10 liste)</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Değişim Yönü</label>
            <select
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="all">Tümü</option>
              <option value="increase">Artış</option>
              <option value="decrease">Azalış</option>
              <option value="mixed">Karışık</option>
            </select>
          </div>

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
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button
            type="button"
            onClick={handleSearch}
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
            <Search size={15} strokeWidth={2} />
            Filtrele
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setCategoryFilter('');
              setConsistencyFilter('all');
              setDirectionFilter('all');
              setStartDate('');
              setEndDate('');
              setPage(1);
            }}
            style={headBtn}
          >
            Temizle
          </button>
        </div>
      </div>

      {/* Results */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div
          style={{
            padding: '14px 16px',
            borderBottom: `1px solid ${SOFT_LINE}`,
            background: TABLE_HEAD_BG,
          }}
        >
          <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>
            Fiyat Değişiklikleri
          </div>
          <div style={{ fontSize: 12, color: FAINT, marginTop: 3 }}>
            {data.length} değişiklik bulundu (Sayfa {page} / {totalPages})
          </div>
        </div>

        <div style={{ padding: 16 }}>
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
              <AlertCircle
                size={32}
                strokeWidth={2}
                style={{ margin: '0 auto 16px', color: RED, display: 'block' }}
              />
              <p style={{ color: RED, margin: 0 }}>{error}</p>
            </div>
          ) : data.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <Package
                size={32}
                strokeWidth={2}
                style={{ margin: '0 auto 16px', color: FAINT, display: 'block' }}
              />
              <p style={{ color: MUTED, margin: 0 }}>Sonuç bulunamadı</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.map((change, index) => {
                const isOpen = expandedRows.has(index);
                return (
                  <div
                    key={index}
                    style={{
                      border: `1px solid ${LINE}`,
                      borderRadius: 10,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Accordion header */}
                    <div
                      onClick={() => toggleRow(index)}
                      style={{
                        padding: '14px 16px',
                        background: '#fff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
                        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                          <DirectionIcon direction={change.changeDirection} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 600, color: INK }}>
                              {change.productCode}
                            </span>
                            <span style={{ color: FAINT }}>-</span>
                            <span
                              style={{
                                color: MUTED,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                              title={change.productName}
                            >
                              {change.productName}
                            </span>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              marginTop: 4,
                              fontSize: 12,
                              color: FAINT,
                            }}
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Calendar size={12} strokeWidth={2} />
                              {new Date(change.changeDate).toLocaleDateString('tr-TR')}
                            </span>
                            <span>{change.category}</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: INK }}>
                              {change.avgChangePercent > 0 ? '+' : ''}
                              {change.avgChangePercent.toFixed(2)}%
                            </div>
                            <div style={{ fontSize: 11, color: FAINT }}>Ortalama değişim</div>
                          </div>
                          <DirectionBadge direction={change.changeDirection} />
                          {change.isConsistent ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                height: 22,
                                padding: '0 9px',
                                borderRadius: 999,
                                fontSize: 11,
                                fontWeight: 600,
                                background: '#e7f6ee',
                                color: EMERALD,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <CheckCircle size={12} strokeWidth={2} />
                              Tutarlı
                            </span>
                          ) : (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                height: 22,
                                padding: '0 9px',
                                borderRadius: 999,
                                fontSize: 11,
                                fontWeight: 600,
                                background: '#fde8e8',
                                color: RED,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <AlertTriangle size={12} strokeWidth={2} />
                              {change.updatedListsCount}/10 Liste
                            </span>
                          )}
                          <ChevronDown
                            size={16}
                            strokeWidth={2}
                            style={{
                              color: FAINT,
                              transition: 'transform .15s',
                              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Accordion body */}
                    {isOpen && (
                      <div
                        style={{
                          borderTop: `1px solid ${SOFT_LINE}`,
                          background: TABLE_HEAD_BG,
                          padding: 16,
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: MUTED }}>
                            Fiyat Listesi Değişiklikleri:
                          </div>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(2, 1fr)',
                              gap: 8,
                            }}
                          >
                            {change.priceChanges.map((priceChange) => {
                              const pcColor =
                                priceChange.changePercent > 0
                                  ? RED
                                  : priceChange.changePercent < 0
                                  ? EMERALD
                                  : MUTED;
                              return (
                                <div
                                  key={priceChange.listNo}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: 12,
                                    background: '#fff',
                                    borderRadius: 8,
                                    border: `1px solid ${LINE}`,
                                  }}
                                >
                                  <div>
                                    <div style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>
                                      {priceChange.listName}
                                    </div>
                                    <div style={{ fontSize: 11.5, color: FAINT, marginTop: 2 }}>
                                      {priceChange.oldPrice.toFixed(2)} TL → {priceChange.newPrice.toFixed(2)} TL
                                    </div>
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 12.5, fontWeight: 600, color: pcColor }}>
                                      {priceChange.changePercent > 0 ? '+' : ''}
                                      {priceChange.changePercent.toFixed(2)}%
                                    </div>
                                    <div style={{ fontSize: 11.5, color: FAINT, marginTop: 2 }}>
                                      {priceChange.changeAmount > 0 ? '+' : ''}
                                      {priceChange.changeAmount.toFixed(2)} TL
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {!change.isConsistent && change.missingLists.length > 0 && (
                            <div
                              style={{
                                marginTop: 4,
                                padding: 12,
                                background: '#fffbeb',
                                border: '1px solid #fde68a',
                                borderRadius: 8,
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                <AlertTriangle
                                  size={16}
                                  strokeWidth={2}
                                  style={{ color: AMBER, marginTop: 2, flexShrink: 0 }}
                                />
                                <div>
                                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#92400e' }}>
                                    Eksik Listeler
                                  </div>
                                  <div style={{ fontSize: 12.5, color: '#a16207', marginTop: 2 }}>
                                    Bu değişiklikte {change.missingLists.length} liste güncellenmedi:{' '}
                                    {change.missingLists
                                      .map((n) => priceListNames[n] || `Liste ${n}`)
                                      .join(', ')}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 24,
                paddingTop: 16,
                borderTop: `1px solid ${SOFT_LINE}`,
              }}
            >
              <div style={{ fontSize: 12.5, color: MUTED }}>
                Sayfa {page} / {totalPages}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1 || loading}
                  style={{
                    ...headBtn,
                    opacity: page === 1 || loading ? 0.5 : 1,
                    cursor: page === 1 || loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  Önceki
                </button>
                <button
                  type="button"
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages || loading}
                  style={{
                    ...headBtn,
                    opacity: page === totalPages || loading ? 0.5 : 1,
                    cursor: page === totalPages || loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  Sonraki
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
