'use client';

import Link from 'next/link';
import {
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  Download,
  RefreshCw,
  Loader2,
  Users,
  Wallet,
  TrendingUp,
  Percent,
  ShoppingCart,
  Calendar,
  ListFilter,
  AlertTriangle,
} from 'lucide-react';
import { useEnIyiMusteriler } from './useEnIyiMusteriler';

// ---- Tasarim tokenlari (referans: Yonetim Paneli genel rapor stili) ----
const INK = '#14223b';
const INK_SOFT = '#51607a';
const INK_MUTE = '#8b97ac';
const PRIMARY = '#15356b';
const PRIMARY_HOVER = '#1c4585';
const CARD_BORDER = '#e7ebf2';
const FIELD_BORDER = '#e3e8f0';
const EMERALD = '#047857';
const PURPLE = '#7c3aed';

// Kar marji renk esigi (klasik ile BIREBIR ayni: >=20 yesil, >=10 turuncu, <10 kirmizi)
const marginColor = (margin: number) =>
  margin >= 20 ? '#047857' : margin >= 10 ? '#b45309' : '#dc2626';

// 12 kolon (Sira | Musteri Kodu | Musteri Adi | Sektor | Siparis | Ciro | Maliyet | Kar | Kar Marji | Ort. Siparis | En Cok Aldigi | Son Siparis)
const GRID_COLS =
  '56px 120px minmax(180px,1.6fr) 90px 90px 120px 120px 120px 100px 120px minmax(140px,1fr) 120px';
const MIN_WIDTH = 1480;

export default function EnIyiMusterilerNew() {
  const {
    data,
    summary,
    loading,
    error,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    sector,
    setSector,
    sortBy,
    setSortBy,
    page,
    setPage,
    totalPages,
    exportLoading,
    fetchData,
    handleExportExcel,
    formatCurrency,
    formatDate,
    getSortLabel,
  } = useEnIyiMusteriler();

  const fieldStyle: React.CSSProperties = {
    height: 38,
    border: `1px solid ${FIELD_BORDER}`,
    borderRadius: 8,
    padding: '0 11px',
    fontSize: 12.5,
    color: INK,
    fontFamily: 'inherit',
    outline: 'none',
    background: '#fff',
    width: '100%',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: INK_MUTE,
    textTransform: 'uppercase',
    letterSpacing: '.02em',
  };

  const secondaryBtn: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: '#fff',
    border: `1px solid #d8e0ec`,
    borderRadius: 8,
    padding: '9px 14px',
    fontSize: 12.5,
    fontWeight: 500,
    color: INK_SOFT,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };

  const headCellBase: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '.03em',
    color: INK_MUTE,
    textTransform: 'uppercase',
  };

  const cellBase: React.CSSProperties = {
    fontSize: 12,
    color: INK,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  // Ozet metrik kartlari (klasik ile ayni 4 deger)
  const metrics = summary
    ? [
        {
          label: 'Toplam Müşteri',
          value: `${summary.totalCustomers} müşteri`,
          icon: Users,
          color: PRIMARY,
        },
        {
          label: 'Toplam Ciro',
          value: formatCurrency(summary.totalRevenue),
          icon: Wallet,
          color: EMERALD,
        },
        {
          label: 'Toplam Kâr',
          value: formatCurrency(summary.totalProfit),
          icon: TrendingUp,
          color: PURPLE,
        },
        {
          label: 'Ortalama Kâr Marjı',
          value: `%${summary.avgProfitMargin.toFixed(2)}`,
          icon: Percent,
          color: '#b45309',
        },
      ]
    : [];

  return (
    <div className="container mx-auto" style={{ padding: '24px', color: INK }}>
      {/* Breadcrumb */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          fontSize: 12.5,
          color: INK_MUTE,
          marginBottom: 12,
        }}
      >
        <Link
          href="/reports"
          style={{ color: INK_MUTE, textDecoration: 'none', fontWeight: 500 }}
        >
          Raporlar
        </Link>
        <ChevronRight size={13} />
        <span style={{ color: INK_SOFT, fontWeight: 500 }}>En İyi Müşteriler</span>
      </div>

      {/* Baslik + aksiyonlar */}
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
              gap: 10,
            }}
          >
            <Users size={26} color={PRIMARY} strokeWidth={2} />
            En İyi Müşteriler
          </h1>
          <div style={{ fontSize: 13, color: INK_MUTE, marginTop: 5 }}>
            {getSortLabel()} bazında sıralanmış müşteriler
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/reports" style={{ textDecoration: 'none' }}>
            <button
              type="button"
              style={secondaryBtn}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f4f6fa')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
            >
              <ArrowLeft size={14} />
              Raporlara Dön
            </button>
          </Link>
          <button
            type="button"
            onClick={fetchData}
            style={secondaryBtn}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f4f6fa')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
          >
            <RefreshCw size={14} />
            Yenile
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={exportLoading}
            style={{
              ...secondaryBtn,
              cursor: exportLoading ? 'not-allowed' : 'pointer',
              opacity: exportLoading ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (!exportLoading) e.currentTarget.style.background = '#f4f6fa';
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
          >
            {exportLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            {exportLoading ? 'Hazırlanıyor...' : 'Excel İndir (Tümü)'}
          </button>
        </div>
      </div>

      {/* Ozet metrik kartlari */}
      {summary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
            marginBottom: 16,
          }}
        >
          {metrics.map((m) => {
            const Icon = m.icon;
            return (
              <div
                key={m.label}
                style={{
                  background: '#fff',
                  border: `1px solid ${CARD_BORDER}`,
                  borderRadius: 12,
                  padding: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 13,
                }}
              >
                <span
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 11,
                    background: `${m.color}14`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon size={20} color={m.color} strokeWidth={2} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, color: INK_MUTE }}>{m.label}</div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 600,
                      color: INK,
                      marginTop: 4,
                      letterSpacing: '-.01em',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {m.value}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Filtre karti */}
      <div
        style={{
          background: '#fff',
          border: `1px solid ${CARD_BORDER}`,
          borderRadius: 12,
          padding: '14px 16px',
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
            fontSize: 13,
            fontWeight: 600,
            color: INK,
          }}
        >
          <ListFilter size={15} color={INK_SOFT} strokeWidth={2} />
          Filtreler
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={labelStyle}>Başlangıç Tarihi</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={fieldStyle}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={labelStyle}>Bitiş Tarihi</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={fieldStyle}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={labelStyle}>Sektör</span>
            <input
              placeholder="Sektör kodu..."
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              style={fieldStyle}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={labelStyle}>Sıralama</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{ ...fieldStyle, cursor: 'pointer' }}
            >
              <option value="revenue">Ciro (Yüksek → Düşük)</option>
              <option value="profit">Kar (Yüksek → Düşük)</option>
              <option value="margin">Kar Marjı (Yüksek → Düşük)</option>
              <option value="orderCount">Sipariş Sayısı (Yüksek → Düşük)</option>
            </select>
          </label>
        </div>
      </div>

      {/* Tablo / durumlar */}
      <div
        style={{
          background: '#fff',
          border: `1px solid ${CARD_BORDER}`,
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        {loading ? (
          <div
            style={{
              padding: '56px 16px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <Loader2 size={26} className="animate-spin" color={PRIMARY} />
            <span style={{ fontSize: 13, color: INK_MUTE }}>Yükleniyor...</span>
          </div>
        ) : error ? (
          <div
            style={{
              padding: '52px 24px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: '#fef2f2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertTriangle size={24} color="#dc2626" strokeWidth={1.8} />
            </span>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: '#dc2626' }}>{error}</div>
            <button
              type="button"
              onClick={fetchData}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: PRIMARY,
                border: 'none',
                borderRadius: 8,
                padding: '9px 16px',
                fontSize: 12.5,
                fontWeight: 600,
                color: '#fff',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = PRIMARY_HOVER)}
              onMouseLeave={(e) => (e.currentTarget.style.background = PRIMARY)}
            >
              <RefreshCw size={13} />
              Tekrar Dene
            </button>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: MIN_WIDTH }}>
                {/* Baslik satiri */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: GRID_COLS,
                    gap: 10,
                    padding: '11px 16px',
                    background: '#fafbfd',
                    borderBottom: '1px solid #eef1f6',
                    alignItems: 'center',
                  }}
                >
                  <span style={headCellBase}>Sıra</span>
                  <span style={headCellBase}>Müşteri Kodu</span>
                  <span style={headCellBase}>Müşteri Adı</span>
                  <span style={headCellBase}>Sektör</span>
                  <span style={{ ...headCellBase, textAlign: 'right' }}>Sipariş</span>
                  <span style={{ ...headCellBase, textAlign: 'right' }}>Ciro</span>
                  <span style={{ ...headCellBase, textAlign: 'right' }}>Maliyet</span>
                  <span style={{ ...headCellBase, textAlign: 'right' }}>Kâr</span>
                  <span style={{ ...headCellBase, textAlign: 'right' }}>Kâr Marjı</span>
                  <span style={{ ...headCellBase, textAlign: 'right' }}>Ort. Sipariş</span>
                  <span style={headCellBase}>En Çok Aldığı</span>
                  <span style={{ ...headCellBase, textAlign: 'right' }}>Son Sipariş</span>
                </div>

                {/* Bos durum */}
                {data.length === 0 ? (
                  <div
                    style={{
                      padding: '48px 16px',
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <span
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 14,
                        background: '#f4f6fa',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Users size={24} color="#9aa6b8" strokeWidth={1.6} />
                    </span>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>
                      Veri bulunamadı
                    </div>
                  </div>
                ) : (
                  data.map((item, index) => (
                    <div
                      key={item.customerCode}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: GRID_COLS,
                        gap: 10,
                        padding: '12px 16px',
                        borderTop: '1px solid #f1f4f9',
                        alignItems: 'center',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#fafbfd')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ ...cellBase, fontWeight: 600 }}>
                        {(page - 1) * 50 + index + 1}
                      </span>
                      <span
                        style={{
                          ...cellBase,
                          fontFamily: "'Roboto Mono', monospace",
                          fontSize: 11.5,
                          color: INK_SOFT,
                        }}
                      >
                        {item.customerCode}
                      </span>
                      <span style={{ ...cellBase, fontWeight: 600 }} title={item.customerName}>
                        {item.customerName}
                      </span>
                      <span style={{ ...cellBase, color: INK_SOFT }}>{item.sector || '-'}</span>
                      <span
                        style={{
                          ...cellBase,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: 5,
                          fontWeight: 600,
                        }}
                      >
                        <ShoppingCart size={14} color={INK_MUTE} />
                        {item.orderCount}
                      </span>
                      <span
                        style={{
                          ...cellBase,
                          textAlign: 'right',
                          fontWeight: 600,
                          color: EMERALD,
                        }}
                      >
                        {formatCurrency(item.revenue)}
                      </span>
                      <span style={{ ...cellBase, textAlign: 'right', color: INK_SOFT }}>
                        {formatCurrency(item.cost)}
                      </span>
                      <span
                        style={{
                          ...cellBase,
                          textAlign: 'right',
                          fontWeight: 700,
                          color: PURPLE,
                        }}
                      >
                        {formatCurrency(item.profit)}
                      </span>
                      <span
                        style={{
                          ...cellBase,
                          textAlign: 'right',
                          fontWeight: 700,
                          color: marginColor(item.profitMargin),
                        }}
                      >
                        %{item.profitMargin.toFixed(2)}
                      </span>
                      <span style={{ ...cellBase, textAlign: 'right' }}>
                        {formatCurrency(item.avgOrderAmount)}
                      </span>
                      <span style={{ ...cellBase, color: INK_SOFT }} title={item.topCategory || '-'}>
                        {item.topCategory || '-'}
                      </span>
                      <span
                        style={{
                          ...cellBase,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: 5,
                          color: INK_SOFT,
                        }}
                      >
                        <Calendar size={14} color={INK_MUTE} />
                        {formatDate(item.lastOrderDate)}
                      </span>
                    </div>
                  ))
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
                  gap: 12,
                  flexWrap: 'wrap',
                  padding: '12px 16px',
                  borderTop: '1px solid #eef1f6',
                }}
              >
                <span style={{ fontSize: 12, color: INK_MUTE }}>
                  Sayfa {page} / {totalPages}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      background: '#fff',
                      border: `1px solid #d8e0ec`,
                      borderRadius: 8,
                      padding: '8px 12px',
                      fontSize: 12,
                      fontWeight: 500,
                      color: INK_SOFT,
                      cursor: page === 1 ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      opacity: page === 1 ? 0.4 : 1,
                    }}
                  >
                    <ChevronLeft size={15} />
                    Önceki
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      background: '#fff',
                      border: `1px solid #d8e0ec`,
                      borderRadius: 8,
                      padding: '8px 12px',
                      fontSize: 12,
                      fontWeight: 500,
                      color: INK_SOFT,
                      cursor: page === totalPages ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      opacity: page === totalPages ? 0.4 : 1,
                    }}
                  >
                    Sonraki
                    <ChevronRight size={15} />
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
