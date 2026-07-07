'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { useMusteriSepetleri } from './useMusteriSepetleri';

/**
 * Yeni gorunum: Musteri Sepetleri raporu (/reports/customer-carts).
 * Tum mantik useMusteriSepetleri hook'undan gelir; hicbir filtre/kolon/ozet/
 * satir-aksiyon (genislet -> kalem detayi)/durum/sayfalama dusurulmemistir.
 *
 * Tasarim referansi: design HTML'de bu rapora ozel ekran YOK; brief 4.11.9 +
 * genel rapor stili. Beyaz kart #fff / border #e7ebf2 / radius 12px;
 * tablo basligi bg #fafbfd; primary #15356b; ink #14223b/#51607a/#8b97ac.
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

// Tablo grid sablonu: Cari | Kullanici | Kalem | Miktar | Tutar | Son Guncelleme | genislet
const GRID = '1.35fr 1.35fr 80px 85px 1fr 1.25fr 170px';
// Genisleyen kalem alt-tablosu: Urun Kodu | Urun | Miktar | Birim Fiyat | Toplam | Fiyat Tipi | Guncelleme
const ITEM_GRID = '1.1fr 2fr 80px 1.1fr 1.1fr 1fr 1.3fr';

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

const inputStyle: React.CSSProperties = {
  height: 36,
  width: '100%',
  border: `1px solid #e3e8f0`,
  borderRadius: 8,
  padding: '0 10px 0 34px',
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

const badgeOutline: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '1px 8px',
  borderRadius: 999,
  border: `1px solid ${LINE}`,
  fontSize: 10.5,
  fontWeight: 600,
  color: MUTED,
  background: '#fff',
  whiteSpace: 'nowrap',
};

const priceTypeColor = (value?: string | null) => {
  if (value === 'WHITE') return MUTED;
  if (value === 'INVOICED') return PRIMARY;
  return MUTED;
};

export default function MusteriSepetleriNew() {
  const {
    search,
    setSearch,
    includeEmpty,
    setIncludeEmpty,
    carts,
    page,
    setPage,
    totalPages,
    totalRecords,
    loading,
    error,
    expanded,
    setRefreshKey,
    clearingCartId,
    canPrev,
    canNext,
    toggleExpanded,
    clearCart,
    formatDateTime,
    formatCurrencySafe,
    priceTypeLabel,
  } = useMusteriSepetleri();

  // Mevcut sayfadaki turetilmis ozet metrikleri (klasik'te toplam kayit zaten gosteriliyor).
  const pageItemTotal = carts.reduce((s, c) => s + (c.itemCount || 0), 0);
  const pageQtyTotal = carts.reduce((s, c) => s + (c.totalQuantity || 0), 0);
  const pageAmountTotal = carts.reduce(
    (s, c) => s + (Number.isFinite(c.totalAmount) ? Number(c.totalAmount) : 0),
    0,
  );

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
        <span style={{ color: MUTED, fontWeight: 500 }}>Müşteri Sepetleri</span>
      </div>

      {/* Header: baslik + Raporlara Don + Yenile */}
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
            <ShoppingCart size={22} strokeWidth={2} style={{ color: PRIMARY }} />
            Müşteri Sepetleri
          </h1>
          <div style={{ fontSize: 13, color: FAINT, marginTop: 5 }}>
            Müşterilerin sepetlerinde bekleyen ürünleri takip edin.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/reports" style={headBtn}>
            <ChevronRight size={15} strokeWidth={2} style={{ transform: 'rotate(180deg)' }} />
            Raporlara Dön
          </Link>
          <button
            type="button"
            onClick={() => setRefreshKey((prev) => prev + 1)}
            disabled={loading}
            style={{
              ...headBtn,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshCw
              size={15}
              strokeWidth={2}
              className={loading ? 'animate-spin' : undefined}
            />
            Yenile
          </button>
        </div>
      </div>

      {/* Summary metric cards (turetilmis) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 14,
          marginBottom: 18,
        }}
      >
        <div style={summaryCard}>
          <div style={{ fontSize: 11.5, color: FAINT }}>Toplam Sepet</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: INK, marginTop: 5 }}>
            {totalRecords}
          </div>
        </div>
        <div style={summaryCard}>
          <div style={{ fontSize: 11.5, color: FAINT }}>Bu Sayfa Kalem</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: INK, marginTop: 5 }}>
            {pageItemTotal}
          </div>
        </div>
        <div style={summaryCard}>
          <div style={{ fontSize: 11.5, color: FAINT }}>Bu Sayfa Miktar</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: INK, marginTop: 5 }}>
            {pageQtyTotal}
          </div>
        </div>
        <div style={summaryCard}>
          <div style={{ fontSize: 11.5, color: FAINT }}>Bu Sayfa Tutar</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: EMERALD, marginTop: 5 }}>
            {formatCurrencySafe(pageAmountTotal)}
          </div>
        </div>
      </div>

      {/* Filters: Arama + Bos sepetleri goster */}
      <div style={{ ...cardStyle, padding: 16, marginBottom: 18 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: INK, marginBottom: 4 }}>
          Filtreler
        </div>
        <div style={{ fontSize: 11.5, color: FAINT, marginBottom: 12 }}>
          Cari, kullanıcı ya da e-posta ile arayın.
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)',
            gap: 14,
            alignItems: 'end',
          }}
        >
          <div>
            <label style={labelStyle}>Ara</label>
            <div style={{ position: 'relative' }}>
              <Search
                size={15}
                strokeWidth={2}
                style={{
                  position: 'absolute',
                  left: 11,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: FAINT,
                }}
              />
              <input
                placeholder="Ara (cari, kullanıcı, email)"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
          <label
            htmlFor="include-empty-new"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              height: 36,
              fontSize: 12.5,
              color: INK,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            <input
              id="include-empty-new"
              type="checkbox"
              checked={includeEmpty}
              onChange={(event) => setIncludeEmpty(event.target.checked)}
              style={{ width: 16, height: 16, accentColor: PRIMARY, cursor: 'pointer' }}
            />
            Boş sepetleri de göster
          </label>
        </div>
      </div>

      {/* List card */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        {/* List header: baslik + toplam + error rozeti */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '14px 16px',
            borderBottom: `1px solid ${SOFT_LINE}`,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>Sepet Listesi</div>
            <div style={{ fontSize: 11.5, color: FAINT, marginTop: 2 }}>
              Toplam {totalRecords} sepet bulundu.
            </div>
          </div>
          {error && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '3px 10px',
                borderRadius: 999,
                background: '#fef2f2',
                border: `1px solid #fecaca`,
                color: RED,
                fontSize: 11.5,
                fontWeight: 600,
              }}
            >
              {error}
            </span>
          )}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 980 }}>
            {/* Table head */}
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
              <span>Cari</span>
              <span>Kullanıcı</span>
              <span style={cellRight}>Kalem</span>
              <span style={cellRight}>Miktar</span>
              <span style={cellRight}>Tutar</span>
              <span>Son Güncelleme</span>
              <span style={{ textAlign: 'right' }}>Aksiyon</span>
            </div>

            {/* Rows / states */}
            {loading ? (
              <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                <RefreshCw
                  size={30}
                  strokeWidth={2}
                  className="animate-spin"
                  style={{ margin: '0 auto 12px', color: FAINT, display: 'block' }}
                />
                <p style={{ color: MUTED, margin: 0 }}>Yükleniyor...</p>
              </div>
            ) : carts.length === 0 ? (
              <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                <ShoppingCart
                  size={30}
                  strokeWidth={2}
                  style={{ margin: '0 auto 8px', color: FAINT, display: 'block' }}
                />
                <p style={{ color: MUTED, margin: 0 }}>Kayıt bulunamadı.</p>
              </div>
            ) : (
              carts.map((cart) => {
                const isExpanded = expanded.has(cart.cartId);
                const detailDate = cart.lastItemAt || cart.updatedAt;
                return (
                  <Fragment key={cart.cartId}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: GRID,
                        gap: 10,
                        padding: '12px 16px',
                        borderTop: `1px solid ${ROW_LINE}`,
                        fontSize: 12,
                        color: INK,
                        alignItems: 'center',
                        background: isExpanded ? '#f9fafc' : '#fff',
                      }}
                    >
                      {/* Cari */}
                      <span style={{ minWidth: 0 }}>
                        <span style={{ fontWeight: 600, display: 'block' }}>
                          {cart.customerCode || '-'}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: FAINT,
                            display: 'block',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={cart.customerName || '-'}
                        >
                          {cart.customerName || '-'}
                        </span>
                      </span>

                      {/* Kullanici (+ Alt Kullanici rozeti) */}
                      <span style={{ minWidth: 0 }}>
                        <span
                          style={{
                            fontWeight: 500,
                            display: 'block',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={cart.userName || '-'}
                        >
                          {cart.userName || '-'}
                        </span>
                        {cart.isSubUser && (
                          <span style={{ ...badgeOutline, marginTop: 4 }}>Alt Kullanıcı</span>
                        )}
                      </span>

                      {/* Kalem (+ Bos rozeti) */}
                      <span
                        style={{
                          ...cellRight,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: 6,
                          fontWeight: 600,
                        }}
                      >
                        {cart.itemCount}
                        {cart.itemCount === 0 && (
                          <span
                            style={{
                              ...badgeOutline,
                              color: AMBER,
                              borderColor: '#fcd9a8',
                              background: '#fffaf2',
                            }}
                          >
                            Boş
                          </span>
                        )}
                      </span>

                      {/* Miktar */}
                      <span style={{ ...cellRight, fontWeight: 500 }}>{cart.totalQuantity}</span>

                      {/* Tutar */}
                      <span style={{ ...cellRight, color: EMERALD, fontWeight: 600 }}>
                        {formatCurrencySafe(cart.totalAmount)}
                      </span>

                      {/* Son Guncelleme */}
                      <span style={{ color: MUTED }}>{formatDateTime(detailDate)}</span>

                      {/* Genislet / temizle aksiyonlari */}
                      <span style={{ textAlign: 'right' }}>
                        <span style={{ display: 'inline-flex', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => toggleExpanded(cart.cartId)}
                            style={{
                              ...headBtn,
                              height: 30,
                              padding: '0 9px',
                              fontSize: 11.5,
                            }}
                          >
                            {isExpanded ? (
                              <>
                                Gizle
                                <ChevronUp size={14} strokeWidth={2} />
                              </>
                            ) : (
                              <>
                                Kalemler
                                <ChevronDown size={14} strokeWidth={2} />
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => clearCart(cart)}
                            disabled={cart.itemCount <= 0 || clearingCartId === cart.cartId}
                            style={{
                              ...headBtn,
                              height: 30,
                              padding: '0 9px',
                              fontSize: 11.5,
                              color: cart.itemCount > 0 ? RED : FAINT,
                              opacity: cart.itemCount <= 0 || clearingCartId === cart.cartId ? 0.55 : 1,
                              cursor: cart.itemCount <= 0 || clearingCartId === cart.cartId ? 'not-allowed' : 'pointer',
                            }}
                          >
                            <Trash2 size={13} strokeWidth={2} />
                            {clearingCartId === cart.cartId ? 'Siliniyor' : 'Temizle'}
                          </button>
                        </span>
                      </span>
                    </div>

                    {/* Genisleyen kalem detay alt-tablosu */}
                    {isExpanded && (
                      <div
                        style={{
                          borderTop: `1px solid ${ROW_LINE}`,
                          background: '#f7f9fc',
                          padding: '12px 16px',
                        }}
                      >
                        {cart.items.length === 0 ? (
                          <div style={{ fontSize: 12, color: MUTED, padding: '4px 0' }}>
                            Sepet boş.
                          </div>
                        ) : (
                          <div
                            style={{
                              ...cardStyle,
                              overflow: 'hidden',
                            }}
                          >
                            <div style={{ overflowX: 'auto' }}>
                              <div style={{ minWidth: 760 }}>
                                {/* Detay head */}
                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: ITEM_GRID,
                                    gap: 10,
                                    padding: '9px 14px',
                                    background: TABLE_HEAD_BG,
                                    borderBottom: `1px solid ${SOFT_LINE}`,
                                    fontSize: 9.5,
                                    fontWeight: 600,
                                    color: FAINT,
                                    textTransform: 'uppercase',
                                    alignItems: 'center',
                                  }}
                                >
                                  <span>Ürün Kodu</span>
                                  <span>Ürün</span>
                                  <span style={cellRight}>Miktar</span>
                                  <span style={cellRight}>Birim Fiyat</span>
                                  <span style={cellRight}>Toplam</span>
                                  <span>Fiyat Tipi</span>
                                  <span>Güncelleme</span>
                                </div>

                                {/* Detay rows */}
                                {cart.items.map((item) => (
                                  <div
                                    key={item.id}
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns: ITEM_GRID,
                                      gap: 10,
                                      padding: '10px 14px',
                                      borderTop: `1px solid ${ROW_LINE}`,
                                      fontSize: 11.5,
                                      color: INK,
                                      alignItems: 'center',
                                      background: '#fff',
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontFamily: "'Roboto Mono', monospace",
                                        fontSize: 11,
                                        color: MUTED,
                                      }}
                                    >
                                      {item.productCode || '-'}
                                    </span>
                                    <span
                                      style={{
                                        fontWeight: 500,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                      }}
                                      title={item.productName || '-'}
                                    >
                                      {item.productName || '-'}
                                    </span>
                                    <span style={{ ...cellRight, fontWeight: 500 }}>
                                      {item.quantity}
                                    </span>
                                    <span style={cellRight}>
                                      {formatCurrencySafe(item.unitPrice)}
                                    </span>
                                    <span style={{ ...cellRight, fontWeight: 600 }}>
                                      {formatCurrencySafe(item.totalPrice)}
                                    </span>
                                    <span style={{ minWidth: 0 }}>
                                      <span
                                        style={{
                                          fontWeight: 600,
                                          color: priceTypeColor(item.priceType as any),
                                          display: 'block',
                                        }}
                                      >
                                        {priceTypeLabel(item.priceType)}
                                      </span>
                                      {item.priceMode && (
                                        <span
                                          style={{
                                            fontSize: 10.5,
                                            color: FAINT,
                                            display: 'block',
                                          }}
                                        >
                                          {item.priceMode}
                                        </span>
                                      )}
                                    </span>
                                    <span style={{ color: MUTED }}>
                                      {formatDateTime(item.updatedAt)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </Fragment>
                );
              })
            )}
          </div>
        </div>

        {/* Pagination */}
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
              disabled={!canPrev || loading}
              style={{
                ...headBtn,
                opacity: !canPrev || loading ? 0.5 : 1,
                cursor: !canPrev || loading ? 'not-allowed' : 'pointer',
              }}
            >
              Önceki
            </button>
            <button
              type="button"
              onClick={() => setPage((prev) => prev + 1)}
              disabled={!canNext || loading}
              style={{
                ...headBtn,
                opacity: !canNext || loading ? 0.5 : 1,
                cursor: !canNext || loading ? 'not-allowed' : 'pointer',
              }}
            >
              Sonraki
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
