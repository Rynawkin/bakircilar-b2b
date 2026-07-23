'use client';

import Link from 'next/link';
import { ChevronRight, RefreshCw, Package } from 'lucide-react';
import {
  useTumUrunlerMaliyetGuncelleme,
  COLUMN_DEFS,
  STICKY_CODE_WIDTH,
  STICKY_NAME_WIDTH,
  toMoney,
  toDate,
} from './useTumUrunlerMaliyetGuncelleme';

/**
 * Yeni gorunum: Tum Urunler Maliyet ve Fiyat Guncelleme.
 * Tum mantik useTumUrunlerMaliyetGuncelleme hook'undan gelir; hicbir
 * handler/kolon/filtre/ozet/satir-aksiyon/modal dusurulmemistir.
 *
 * KRITIK: Mikro'ya maliyet + 12 ana fiyat listesi YAZAN aksiyonlar (Guncelle butonu ->
 * updateCost -> executeCostUpdate) ve onay modali AYNEN hook'tan kullanilir;
 * sadece JSX/gorunum yeni tasarima cevrilmistir.
 *
 * Tasarim referansi: brief 4.9.5 (Filtre + kolon secim grid; sticky kod+ad tablo;
 * son kolon Maliyet Guncelle [T->P + "12 standart liste" + Guncelle]; Maliyet Artis Onayi
 * modal; sayfalama 200). Genel rapor stili: beyaz kart #fff / border #e7ebf2 /
 * radius 12px; tablo basligi bg #fafbfd; primary #15356b; ink #14223b/#51607a/#8b97ac.
 */

const PRIMARY = '#15356b';
const INK = '#14223b';
const MUTED = '#51607a';
const FAINT = '#8b97ac';
const LINE = '#e7ebf2';
const SOFT_LINE = '#eef1f6';
const TABLE_HEAD_BG = '#fafbfd';
const AMBER = '#b45309';
const RED = '#b91c1c';
const EMERALD = '#047857';

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

const searchInputStyle: React.CSSProperties = {
  height: 38,
  width: '100%',
  border: `1px solid #e3e8f0`,
  borderRadius: 9,
  padding: '0 12px',
  fontSize: 13,
  color: INK,
  fontFamily: 'inherit',
  outline: 'none',
  background: '#fff',
};

const numInputStyle: React.CSSProperties = {
  height: 32,
  width: 72,
  border: `1px solid #e3e8f0`,
  borderRadius: 7,
  padding: '0 8px',
  fontSize: 12,
  color: INK,
  fontFamily: 'inherit',
  outline: 'none',
  background: '#fff',
  textAlign: 'right',
};

const thStyle: React.CSSProperties = {
  whiteSpace: 'nowrap',
  borderBottom: `1px solid ${SOFT_LINE}`,
  padding: '10px 10px',
  textAlign: 'left',
  fontSize: 10,
  fontWeight: 600,
  color: FAINT,
  textTransform: 'uppercase',
  letterSpacing: '.02em',
  cursor: 'pointer',
  background: TABLE_HEAD_BG,
};

const tdStyle: React.CSSProperties = {
  whiteSpace: 'nowrap',
  padding: '9px 10px',
  fontSize: 12,
  color: INK,
};

export default function TumUrunlerMaliyetGuncellemeNew() {
  const {
    loading,
    refreshing,
    search,
    setSearch,
    page,
    setPage,
    totalRecords,
    visibleColumns,
    mainSupplierByCode,
    costPInputByCode,
    setCostPInputByCode,
    costTInputByCode,
    setCostTInputByCode,
    manualCostPOverrideByCode,
    setManualCostPOverrideByCode,
    vatRateByCode,
    setUpdatePriceListsByCode,
    updatingByCode,
    currentCostOverrideByCode,
    priceListOverrideByCode,
    confirmModalOpen,
    setConfirmModalOpen,
    pendingUpdate,
    setPendingUpdate,
    filteredAndSortedRows,
    totalPages,
    pagedRows,
    loadData,
    toggleSort,
    sortIndicator,
    toggleColumn,
    shouldUpdatePriceLists,
    executeCostUpdate,
    updateCost,
  } = useTumUrunlerMaliyetGuncelleme();

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', padding: 24 }}>
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
        <span style={{ color: MUTED, fontWeight: 500 }}>Tüm Ürünler Maliyet ve Fiyat Güncelleme</span>
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
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: 0, color: INK }}>
            Tüm Ürünler Maliyet ve Fiyat Güncelleme
          </h1>
          <div style={{ fontSize: 13, color: FAINT, marginTop: 5 }}>
            Tüm aktif ürünleri gör, kolonlarını seç, sırala ve maliyet + 12 standart liste güncelle.
          </div>
        </div>
        <button
          type="button"
          onClick={() => loadData(false)}
          disabled={refreshing}
          style={{ ...headBtn, opacity: refreshing ? 0.7 : 1, cursor: refreshing ? 'not-allowed' : 'pointer' }}
        >
          <RefreshCw size={15} strokeWidth={2} className={refreshing ? 'animate-spin' : ''} />
          Yenile
        </button>
      </div>

      {/* Filtre ve Kolonlar */}
      <div style={{ ...cardStyle, padding: 16, marginBottom: 18 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>Filtre ve Kolonlar</div>
        <div style={{ fontSize: 12, color: FAINT, marginTop: 3, marginBottom: 12 }}>
          Kolon seçimini kaydeder, tekrar girdiğinde aynı görünür.
        </div>

        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Ürün adı, kod, kategori, ana sağlayıcı..."
          style={searchInputStyle}
        />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 8,
            marginTop: 12,
          }}
        >
          {COLUMN_DEFS.map((column) => {
            const isLocked = column.id === 'productCode' || column.id === 'productName';
            const isChecked = visibleColumns.includes(column.id);
            return (
              <label
                key={column.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  border: `1px solid ${isChecked ? '#d6e0f0' : LINE}`,
                  background: isChecked ? '#f4f7fc' : '#fff',
                  borderRadius: 8,
                  padding: '6px 9px',
                  fontSize: 11.5,
                  color: isLocked ? FAINT : INK,
                  cursor: isLocked ? 'not-allowed' : 'pointer',
                  fontWeight: 500,
                }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleColumn(column.id)}
                  disabled={isLocked}
                  style={{ accentColor: PRIMARY }}
                />
                {column.label}
              </label>
            );
          })}
        </div>

        <div style={{ marginTop: 14, display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12, color: MUTED }}>
          <span>
            Toplam ürün: <strong style={{ color: INK }}>{totalRecords.toLocaleString('tr-TR')}</strong>
          </span>
          <span>
            Filtre sonucu: <strong style={{ color: INK }}>{filteredAndSortedRows.length.toLocaleString('tr-TR')}</strong>
          </span>
          <span>
            Bu sayfa: <strong style={{ color: INK }}>{pagedRows.length.toLocaleString('tr-TR')}</strong>
          </span>
        </div>
      </div>

      {/* Tablo */}
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
        ) : (
          <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
            <table style={{ width: 'max-content', minWidth: 2400, borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr>
                  {visibleColumns.map((column) => {
                    const isCode = column === 'productCode';
                    const isName = column === 'productName';
                    const stickyStyle: React.CSSProperties = isCode
                      ? {
                          position: 'sticky',
                          left: 0,
                          zIndex: 30,
                          boxShadow: '2px 0 0 0 #e7ebf2',
                          minWidth: STICKY_CODE_WIDTH,
                          width: STICKY_CODE_WIDTH,
                        }
                      : isName
                      ? {
                          position: 'sticky',
                          left: STICKY_CODE_WIDTH,
                          zIndex: 30,
                          boxShadow: '2px 0 0 0 #e7ebf2',
                          minWidth: STICKY_NAME_WIDTH,
                          width: STICKY_NAME_WIDTH,
                        }
                      : {};
                    return (
                      <th key={column} style={{ ...thStyle, ...stickyStyle }} onClick={() => toggleSort(column)}>
                        {COLUMN_DEFS.find((c) => c.id === column)?.label}
                        {sortIndicator(column)}
                      </th>
                    );
                  })}
                  <th style={{ ...thStyle, cursor: 'default' }}>Maliyet Güncelle</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length + 1} style={{ padding: '40px 16px', textAlign: 'center' }}>
                      <Package size={28} strokeWidth={2} style={{ margin: '0 auto 8px', color: FAINT, display: 'block' }} />
                      <span style={{ color: MUTED }}>Veri bulunamadı</span>
                    </td>
                  </tr>
                ) : (
                  pagedRows.map((item) => {
                    const code = String(item?.mikroCode || '').trim().toUpperCase();
                    const supplier = mainSupplierByCode[code];
                    const mikroPriceLists = item?.mikroPriceLists || {};
                    const overriddenLists = priceListOverrideByCode[code] || {};
                    const currentCost = Number(currentCostOverrideByCode[code] ?? item?.currentCost ?? 0);
                    const vatRate = Number(vatRateByCode[code] ?? item?.vatRate ?? 0);
                    return (
                      <tr key={code} style={{ borderBottom: `1px solid #f1f4f9` }}>
                        {visibleColumns.map((column) => {
                          let value: React.ReactNode = '-';
                          if (column === 'productCode') value = code;
                          else if (column === 'productName') value = item?.name || '-';
                          else if (column === 'mainSupplier') value = supplier ? `${supplier.code} - ${supplier.name}` : '-';
                          else if (column === 'category') value = item?.category?.name || '-';
                          else if (column === 'stock') value = Number(item?.totalStock ?? 0).toLocaleString('tr-TR');
                          else if (column === 'currentCost') value = toMoney(currentCost);
                          else if (column === 'lastEntryPrice') value = toMoney(item?.lastEntryPrice ?? 0);
                          else if (column === 'lastEntryDate') value = toDate(item?.lastEntryDate);
                          else if (column.startsWith('list')) {
                            const listNo = Number(column.replace('list', ''));
                            value = toMoney(overriddenLists[listNo] ?? mikroPriceLists[listNo] ?? 0);
                          }

                          const isCode = column === 'productCode';
                          const isName = column === 'productName';
                          const isNumericCol =
                            column === 'stock' ||
                            column === 'currentCost' ||
                            column === 'lastEntryPrice' ||
                            column.startsWith('list');
                          const stickyStyle: React.CSSProperties = isCode
                            ? {
                                position: 'sticky',
                                left: 0,
                                zIndex: 20,
                                background: '#fff',
                                fontFamily: "'Roboto Mono', monospace",
                                boxShadow: '2px 0 0 0 #e7ebf2',
                                minWidth: STICKY_CODE_WIDTH,
                                width: STICKY_CODE_WIDTH,
                                color: MUTED,
                                fontSize: 11,
                              }
                            : isName
                            ? {
                                position: 'sticky',
                                left: STICKY_CODE_WIDTH,
                                zIndex: 20,
                                background: '#fff',
                                boxShadow: '2px 0 0 0 #e7ebf2',
                                minWidth: STICKY_NAME_WIDTH,
                                width: STICKY_NAME_WIDTH,
                                fontWeight: 500,
                              }
                            : {};
                          return (
                            <td
                              key={`${code}-${column}`}
                              style={{
                                ...tdStyle,
                                ...(isNumericCol ? { textAlign: 'right' } : {}),
                                ...(column === 'currentCost' ? { fontWeight: 600 } : {}),
                                ...stickyStyle,
                              }}
                            >
                              {value}
                            </td>
                          );
                        })}
                        <td style={{ ...tdStyle }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={costPInputByCode[code] ?? ''}
                              onChange={(e) => {
                                const raw = e.target.value;
                                setCostPInputByCode((prev) => ({ ...prev, [code]: raw }));
                                if (manualCostPOverrideByCode[code]) return;
                                const parsed = Number(String(raw || '').replace(',', '.'));
                                if (!Number.isFinite(parsed)) return;
                                const vatPercent = vatRate <= 1 ? vatRate * 100 : vatRate;
                                const autoCostT = parsed * (1 + vatPercent / 200);
                                setCostTInputByCode((prev) => ({
                                  ...prev,
                                  [code]: Number.isFinite(autoCostT) ? autoCostT.toFixed(4).replace(/\.?0+$/, '') : prev[code] || '',
                                }));
                              }}
                              style={numInputStyle}
                              placeholder="T"
                            />
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={costTInputByCode[code] ?? ''}
                              onChange={(e) => {
                                setManualCostPOverrideByCode((prev) => ({ ...prev, [code]: true }));
                                setCostTInputByCode((prev) => ({ ...prev, [code]: e.target.value }));
                              }}
                              style={numInputStyle}
                              placeholder="P"
                            />
                            <label
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: 10,
                                color: MUTED,
                                whiteSpace: 'nowrap',
                                cursor: 'pointer',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={shouldUpdatePriceLists(code)}
                                onChange={(e) => setUpdatePriceListsByCode((prev) => ({ ...prev, [code]: e.target.checked }))}
                                style={{ accentColor: PRIMARY }}
                              />
                              12 standart liste
                            </label>
                            <button
                              type="button"
                              onClick={() => updateCost(item)}
                              disabled={Boolean(updatingByCode[code])}
                              style={{
                                ...headBtn,
                                height: 32,
                                padding: '0 12px',
                                fontSize: 11.5,
                                opacity: updatingByCode[code] ? 0.6 : 1,
                                cursor: updatingByCode[code] ? 'not-allowed' : 'pointer',
                              }}
                            >
                              {updatingByCode[code] ? '...' : 'Güncelle'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Sayfalama */}
        {totalPages > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 14,
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
                disabled={page <= 1}
                style={{ ...headBtn, opacity: page <= 1 ? 0.5 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
              >
                Önceki
              </button>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
                style={{ ...headBtn, opacity: page >= totalPages ? 0.5 : 1, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}
              >
                Sonraki
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Maliyet Artis Onayi modal (Mikro yazma onayi — mantik hook'tan, gorunum yeni) */}
      {confirmModalOpen && pendingUpdate && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,.4)',
            padding: 16,
          }}
        >
          <div style={{ ...cardStyle, width: '100%', maxWidth: 460, padding: 18, boxShadow: '0 20px 50px rgba(15,23,42,.25)' }}>
            <p style={{ fontSize: 16, fontWeight: 600, color: INK, margin: 0 }}>Maliyet Artış Onayı</p>
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: MUTED }}>
              <p style={{ margin: 0 }}>
                <strong style={{ color: INK }}>Ürün:</strong> {pendingUpdate.code}
              </p>
              <p style={{ margin: 0 }}>
                <strong style={{ color: INK }}>Eski Maliyet:</strong> {toMoney(pendingUpdate.oldCost)}
              </p>
              <p style={{ margin: 0 }}>
                <strong style={{ color: INK }}>Yeni Maliyet:</strong> {toMoney(pendingUpdate.costP)}
              </p>
              <p style={{ margin: 0 }}>
                <strong style={{ color: INK }}>Artış:</strong>{' '}
                <span
                  style={{
                    fontWeight: 700,
                    color:
                      pendingUpdate.oldCost > 0 && pendingUpdate.costP >= pendingUpdate.oldCost
                        ? AMBER
                        : pendingUpdate.oldCost > 0
                        ? EMERALD
                        : MUTED,
                  }}
                >
                  {pendingUpdate.oldCost > 0
                    ? `%${(((pendingUpdate.costP - pendingUpdate.oldCost) / pendingUpdate.oldCost) * 100).toLocaleString('tr-TR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`
                    : 'Hesaplanamadı'}
                </span>
              </p>
              <p style={{ margin: 0, fontSize: 12, color: FAINT }}>12 ana fiyat listesi de bu maliyete göre güncellenecek.</p>
            </div>
            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setConfirmModalOpen(false);
                  setPendingUpdate(null);
                }}
                style={headBtn}
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={async () => {
                  const payload = pendingUpdate;
                  setConfirmModalOpen(false);
                  setPendingUpdate(null);
                  await executeCostUpdate(payload.code, payload.costP, payload.costT);
                }}
                style={{ ...headBtn, background: PRIMARY, color: '#fff', border: 'none' }}
              >
                Onayla ve Güncelle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
