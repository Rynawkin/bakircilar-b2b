'use client';

import { Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import {
  useTeklifKalemleri,
  STATUS_OPTIONS,
  CLOSE_REASONS,
  type QuoteLineItem,
} from './useTeklifKalemleri';

// Yeni gorunum tasarim token'lari (design ref: data-screen-label="Teklif Kalemleri")
const PRIMARY = '#15356b';
const LINE = '#e7ebf2';
const INK = '#14223b';
const MUTED = '#8b97ac';
const SUBINK = '#51607a';
const FIELD_BORDER = '#e3e8f0';
const SOFT_BORDER = '#d8e0ec';
const HEAD_BG = '#fafbfd';
const HEAD_LINE = '#eef1f6';
const ROW_LINE = '#f1f4f9';
const MONO = "'Roboto Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

const GRID_COLS = '40px 110px 90px 1.4fr 1.4fr 1.6fr 90px 1fr 1fr 1.7fr';

// Durum -> rozet stili (Acik/Kapali/Cevrildi)
function statusBadge(status: string) {
  if (status === 'CLOSED') {
    return (
      <span
        style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          color: '#b91c1c',
          fontSize: 10,
          fontWeight: 600,
          padding: '2px 8px',
          borderRadius: 6,
          whiteSpace: 'nowrap',
        }}
      >
        Kapali
      </span>
    );
  }
  if (status === 'CONVERTED') {
    return (
      <span
        style={{
          background: '#eef2fa',
          border: '1px solid #d6e0f1',
          color: '#1c4585',
          fontSize: 10,
          fontWeight: 600,
          padding: '2px 8px',
          borderRadius: 6,
          whiteSpace: 'nowrap',
        }}
      >
        Siparise cevrildi
      </span>
    );
  }
  return (
    <span
      style={{
        background: '#ecfdf5',
        border: '1px solid #a7f3d0',
        color: '#047857',
        fontSize: 10,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 6,
        whiteSpace: 'nowrap',
      }}
    >
      Acik
    </span>
  );
}

const fieldBase: React.CSSProperties = {
  height: 38,
  border: `1px solid ${FIELD_BORDER}`,
  borderRadius: 8,
  padding: '0 11px',
  fontSize: 13,
  color: INK,
  fontFamily: 'inherit',
  outline: 'none',
  background: '#fff',
};

const selectBare: React.CSSProperties = {
  border: 'none',
  background: 'none',
  outline: 'none',
  fontSize: 13,
  fontWeight: 500,
  color: INK,
  fontFamily: 'inherit',
  cursor: 'pointer',
};

export default function TeklifKalemleriNew() {
  const {
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
    closeReasonFilter,
    setCloseReasonFilter,
    minDays,
    setMinDays,
    maxDays,
    setMaxDays,
    sortBy,
    setSortBy,
    page,
    setPage,
    total,
    totalPages,
    items,
    sortedItems,
    loading,
    actionId,
    closeReasonMap,
    setCloseReasonMap,
    selectedOpenIds,
    openItemIds,
    allSelected,
    selectAllRef,
    bulkReason,
    setBulkReason,
    bulkClosing,
    loadItems,
    handleCloseItem,
    toggleSelectAll,
    toggleSelectItem,
    handleBulkClose,
    handleReopenItem,
    setSelectedIds,
  } = useTeklifKalemleri();

  return (
    <div style={{ minHeight: '100vh', background: '#f4f6fa' }}>
      <div
        style={{
          maxWidth: 1400,
          margin: '0 auto',
          padding: '24px 20px 40px',
          fontFamily:
            "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
          color: INK,
        }}
      >
        {/* Baslik + Yenile */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            margin: '0 0 18px',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 600,
                letterSpacing: '-0.02em',
                margin: 0,
                color: INK,
              }}
            >
              Teklif Kalemleri
            </h1>
            <div style={{ fontSize: 13, color: MUTED, marginTop: 5 }}>
              Acik/kapali/cevrilen teklif satirlarinin izlenmesi ve toplu kapatma
            </div>
          </div>
          <button
            type="button"
            onClick={loadItems}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: '#fff',
              border: `1px solid ${SOFT_BORDER}`,
              borderRadius: 9,
              padding: '10px 15px',
              fontSize: 13,
              fontWeight: 500,
              color: SUBINK,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              opacity: loading ? 0.6 : 1,
            }}
          >
            <RefreshCw size={15} />
            Yenile
          </button>
        </div>

        {/* Durum sekmeleri (sayacli) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            flexWrap: 'wrap',
            marginBottom: 14,
          }}
        >
          {STATUS_OPTIONS.map((opt) => {
            const active = statusFilter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatusFilter(opt.value)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  height: 34,
                  padding: '0 14px',
                  borderRadius: 9,
                  border: `1px solid ${active ? PRIMARY : SOFT_BORDER}`,
                  background: active ? PRIMARY : '#fff',
                  color: active ? '#fff' : SUBINK,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Filtre cubugu */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            background: '#fff',
            border: `1px solid ${LINE}`,
            borderRadius: 12,
            padding: '11px 14px',
            marginBottom: 16,
          }}
        >
          {/* Arama */}
          <div
            style={{
              flex: 1,
              minWidth: 200,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 38,
              border: `1px solid ${FIELD_BORDER}`,
              borderRadius: 8,
              padding: '0 12px',
            }}
          >
            <Search size={15} color="#9aa6b8" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Teklif, musteri veya urun ara..."
              style={{
                flex: 1,
                border: 'none',
                background: 'none',
                outline: 'none',
                fontSize: 13,
                color: INK,
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Kapatma Nedeni */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              height: 38,
              border: `1px solid ${FIELD_BORDER}`,
              borderRadius: 8,
              padding: '0 11px',
            }}
          >
            <span style={{ fontSize: 12, color: MUTED }}>Kapatma Nedeni</span>
            <select
              value={closeReasonFilter}
              onChange={(e) => setCloseReasonFilter(e.target.value)}
              style={selectBare}
            >
              <option value="">Tum nedenler</option>
              {CLOSE_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </label>

          {/* Min Gun */}
          <input
            type="number"
            min={0}
            value={minDays}
            onChange={(e) => setMinDays(e.target.value)}
            placeholder="Min gun"
            style={{ ...fieldBase, width: 100 }}
          />
          {/* Max Gun */}
          <input
            type="number"
            min={0}
            value={maxDays}
            onChange={(e) => setMaxDays(e.target.value)}
            placeholder="Max gun"
            style={{ ...fieldBase, width: 100 }}
          />

          {/* Siralama */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              height: 38,
              border: `1px solid ${FIELD_BORDER}`,
              borderRadius: 8,
              padding: '0 11px',
            }}
          >
            <span style={{ fontSize: 12, color: MUTED }}>Sirala</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={selectBare}>
              <option value="created_desc">Yeni teklif ustte</option>
              <option value="created_asc">Eski teklif ustte</option>
              <option value="waiting_desc">Bekleme suresi (cok-az)</option>
              <option value="waiting_asc">Bekleme suresi (az-cok)</option>
              <option value="total_desc">Tutar (buyuk-kucuk)</option>
              <option value="total_asc">Tutar (kucuk-buyuk)</option>
            </select>
          </label>
        </div>

        {/* Toplu islem cubugu */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            background: '#fff',
            border: `1px solid ${LINE}`,
            borderRadius: 12,
            padding: '11px 14px',
            marginBottom: 16,
          }}
        >
          <span style={{ fontSize: 13, color: SUBINK }}>
            Secili:{' '}
            <span style={{ fontWeight: 600, color: INK }}>{selectedOpenIds.length}</span>
          </span>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              height: 36,
              border: `1px solid ${FIELD_BORDER}`,
              borderRadius: 8,
              padding: '0 11px',
              marginLeft: 4,
            }}
          >
            <span style={{ fontSize: 12, color: MUTED }}>Toplu kapatma nedeni</span>
            <select
              value={bulkReason}
              onChange={(e) => setBulkReason(e.target.value)}
              style={selectBare}
            >
              <option value="">Kapatma nedeni secin</option>
              {CLOSE_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </label>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleBulkClose}
              disabled={!bulkReason || selectedOpenIds.length === 0 || bulkClosing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                height: 36,
                padding: '0 14px',
                borderRadius: 8,
                border: '1px solid #fecaca',
                background:
                  !bulkReason || selectedOpenIds.length === 0 || bulkClosing ? '#fff5f5' : '#fff',
                color: '#b91c1c',
                fontSize: 12.5,
                fontWeight: 600,
                cursor:
                  !bulkReason || selectedOpenIds.length === 0 || bulkClosing
                    ? 'not-allowed'
                    : 'pointer',
                fontFamily: 'inherit',
                opacity:
                  !bulkReason || selectedOpenIds.length === 0 || bulkClosing ? 0.6 : 1,
              }}
            >
              {bulkClosing ? 'Kapatiliyor...' : 'Secilileri Kapat'}
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              disabled={selectedOpenIds.length === 0 || bulkClosing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                height: 36,
                padding: '0 14px',
                borderRadius: 8,
                border: `1px solid ${SOFT_BORDER}`,
                background: '#fff',
                color: SUBINK,
                fontSize: 12.5,
                fontWeight: 500,
                cursor:
                  selectedOpenIds.length === 0 || bulkClosing ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                opacity: selectedOpenIds.length === 0 || bulkClosing ? 0.6 : 1,
              }}
            >
              Secimi Temizle
            </button>
          </div>
        </div>

        {/* Tablo karti */}
        <div
          style={{
            background: '#fff',
            border: `1px solid ${LINE}`,
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 1120 }}>
              {/* Baslik satiri */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: GRID_COLS,
                  gap: 10,
                  padding: '12px 16px',
                  background: HEAD_BG,
                  borderBottom: `1px solid ${HEAD_LINE}`,
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: '0.03em',
                  color: MUTED,
                  textTransform: 'uppercase',
                  alignItems: 'center',
                }}
              >
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  style={{ width: 15, height: 15, accentColor: PRIMARY }}
                  checked={allSelected}
                  onChange={(e) => toggleSelectAll(e.target.checked)}
                  disabled={openItemIds.length === 0}
                  aria-label="Tum acik kalemleri sec"
                />
                <span>Durum</span>
                <span>Bekleme</span>
                <span>Teklif</span>
                <span>Musteri</span>
                <span>Urun</span>
                <span style={{ textAlign: 'right' }}>Adet</span>
                <span style={{ textAlign: 'right' }}>Birim</span>
                <span style={{ textAlign: 'right' }}>Toplam</span>
                <span>Islem</span>
              </div>

              {/* Govde: yukleniyor / bos / satirlar */}
              {loading ? (
                <div
                  style={{
                    padding: '48px 16px',
                    textAlign: 'center',
                    fontSize: 13,
                    color: MUTED,
                  }}
                >
                  Yukleniyor...
                </div>
              ) : items.length === 0 ? (
                <div
                  style={{
                    padding: '48px 16px',
                    textAlign: 'center',
                    fontSize: 13,
                    color: MUTED,
                  }}
                >
                  Kayit bulunamadi.
                </div>
              ) : (
                sortedItems.map((item: QuoteLineItem) => {
                  const status = item.status || 'OPEN';
                  const quoteNumber = item.quote?.quoteNumber || '-';
                  const documentNo = item.quote?.documentNo || '-';
                  const customerName =
                    item.quote?.customer?.displayName || item.quote?.customer?.name || '-';
                  const customerCode = item.quote?.customer?.mikroCariCode;
                  const waiting = item.waitingDays ?? '-';
                  const isSelected = selectedOpenIds.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: GRID_COLS,
                        gap: 10,
                        padding: '13px 16px',
                        borderTop: `1px solid ${ROW_LINE}`,
                        fontSize: 12.5,
                        color: INK,
                        alignItems: 'center',
                        background: isSelected ? '#f6f8fc' : '#fff',
                      }}
                    >
                      {/* Secim */}
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {status === 'OPEN' ? (
                          <input
                            type="checkbox"
                            style={{ width: 15, height: 15, accentColor: PRIMARY }}
                            checked={isSelected}
                            onChange={(e) => toggleSelectItem(item.id, e.target.checked)}
                            aria-label="Kalem sec"
                          />
                        ) : (
                          <span style={{ fontSize: 11, color: '#cbd3e0' }}>-</span>
                        )}
                      </div>

                      {/* Durum */}
                      <span>{statusBadge(status)}</span>

                      {/* Bekleme */}
                      <span style={{ fontSize: 11.5, color: SUBINK }}>
                        {waiting !== '-' ? `${waiting} gun` : '-'}
                      </span>

                      {/* Teklif */}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 600 }}>
                          {quoteNumber}
                        </div>
                        <div style={{ fontSize: 10.5, color: MUTED }}>
                          Belge: {documentNo}
                          {item.quote?.createdAt
                            ? ` · ${formatDateShort(item.quote.createdAt)}`
                            : ''}
                        </div>
                      </div>

                      {/* Musteri */}
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 500,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {customerName}
                        </div>
                        {customerCode && (
                          <div style={{ fontSize: 10.5, color: MUTED, fontFamily: MONO }}>
                            {customerCode}
                          </div>
                        )}
                      </div>

                      {/* Urun */}
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 500,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.productName}
                        </div>
                        <div style={{ fontSize: 10.5, color: MUTED, fontFamily: MONO }}>
                          {item.productCode}
                        </div>
                      </div>

                      {/* Adet */}
                      <span style={{ textAlign: 'right', color: SUBINK }}>{item.quantity}</span>

                      {/* Birim */}
                      <span style={{ textAlign: 'right' }}>{formatCurrency(item.unitPrice)}</span>

                      {/* Toplam */}
                      <span style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatCurrency(item.totalPrice)}
                      </span>

                      {/* Islem */}
                      <div>
                        {status === 'OPEN' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <select
                              value={closeReasonMap[item.id] || ''}
                              onChange={(e) =>
                                setCloseReasonMap((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value,
                                }))
                              }
                              style={{
                                height: 30,
                                border: `1px solid ${FIELD_BORDER}`,
                                borderRadius: 7,
                                padding: '0 8px',
                                fontSize: 11.5,
                                color: INK,
                                fontFamily: 'inherit',
                                background: '#fff',
                                cursor: 'pointer',
                                outline: 'none',
                                width: '100%',
                              }}
                            >
                              <option value="">Kapatma nedeni secin</option>
                              {CLOSE_REASONS.map((reason) => (
                                <option key={reason} value={reason}>
                                  {reason}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => handleCloseItem(item)}
                              disabled={!closeReasonMap[item.id] || actionId === item.id}
                              style={{
                                background: '#fff',
                                border: '1px solid #fecaca',
                                borderRadius: 7,
                                padding: '6px 11px',
                                fontSize: 11.5,
                                fontWeight: 600,
                                color: '#b91c1c',
                                cursor:
                                  !closeReasonMap[item.id] || actionId === item.id
                                    ? 'not-allowed'
                                    : 'pointer',
                                fontFamily: 'inherit',
                                opacity:
                                  !closeReasonMap[item.id] || actionId === item.id ? 0.6 : 1,
                              }}
                            >
                              {actionId === item.id ? 'Kapatiliyor...' : 'Kapat'}
                            </button>
                          </div>
                        )}
                        {status === 'CLOSED' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span style={{ fontSize: 10.5, color: MUTED }}>
                              {item.closedReason || '-'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleReopenItem(item)}
                              disabled={actionId === item.id}
                              style={{
                                background: '#fff',
                                border: `1px solid ${SOFT_BORDER}`,
                                borderRadius: 7,
                                padding: '5px 10px',
                                fontSize: 11.5,
                                fontWeight: 600,
                                color: PRIMARY,
                                cursor: actionId === item.id ? 'not-allowed' : 'pointer',
                                fontFamily: 'inherit',
                                opacity: actionId === item.id ? 0.6 : 1,
                                alignSelf: 'flex-start',
                              }}
                            >
                              {actionId === item.id ? 'Aciliyor...' : 'Ac'}
                            </button>
                          </div>
                        )}
                        {status === 'CONVERTED' && (
                          <span style={{ fontSize: 11, color: '#cbd3e0' }}>-</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Alt cubuk: toplam + sayfalama */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderTop: `1px solid ${HEAD_LINE}`,
              fontSize: 12,
              color: MUTED,
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <span>Toplam {total} kayit</span>
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page <= 1 || loading}
                  style={{
                    width: 32,
                    height: 32,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `1px solid ${SOFT_BORDER}`,
                    borderRadius: 7,
                    background: '#fff',
                    color: SUBINK,
                    cursor: page <= 1 || loading ? 'not-allowed' : 'pointer',
                    opacity: page <= 1 || loading ? 0.5 : 1,
                  }}
                  aria-label="Onceki"
                >
                  <ChevronLeft size={16} />
                </button>
                <span style={{ color: SUBINK, fontWeight: 500 }}>
                  Sayfa {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page >= totalPages || loading}
                  style={{
                    width: 32,
                    height: 32,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `1px solid ${SOFT_BORDER}`,
                    borderRadius: 7,
                    background: '#fff',
                    color: SUBINK,
                    cursor: page >= totalPages || loading ? 'not-allowed' : 'pointer',
                    opacity: page >= totalPages || loading ? 0.5 : 1,
                  }}
                  aria-label="Sonraki"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
