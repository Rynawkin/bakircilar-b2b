'use client';

import Link from 'next/link';
import {
  ChevronRight,
  AlertTriangle,
  Download,
  RefreshCw,
  Search,
  TrendingUp,
  Package,
  DollarSign,
  Database,
} from 'lucide-react';
import { useMaliyetGuncellemeUyarilari } from './useMaliyetGuncellemeUyarilari';

/**
 * Yeni gorunum: Maliyet Guncelleme Uyarilari raporu.
 *
 * Tum mantik useMaliyetGuncellemeUyarilari hook'undan gelir; HICBIR handler/kolon/
 * filtre/ozet/satir-aksiyon dusurulmemistir. Ozellikle:
 *  - handleManualSync (Tekrar Senkronize Et), fetchData (Yenile), handleExportExcel
 *  - per-row Maliyet Guncelle: T input -> P otomatik (yarim KDV), P input (manuel override),
 *    "10 liste" checkbox (updatePriceLists), Guncelle butonu -> updateProductCost
 *    => adminApi.updateUcarerProductCost (Mikro'ya maliyet/fiyat YAZAR). Mantik degismedi.
 *  - sticky Urun Kodu + Urun Adi kolonlari + alt senkron yatay scrollbar korunmustur
 *    (hook'taki tableScrollRef/querySelector('table') mantigi gercek <table> ister).
 *
 * Tasarim referansi: design HTML'de bu ekrana ozel data-screen-label yok; brief 4.9.4 +
 * "Tedarik Maliyetleri" / "Ucarer Depo" ekranlarindaki maliyet-giris (T/P input + "10 liste"
 * checkbox + Guncelle) ve genel rapor stili (beyaz kart #fff / border #e7ebf2 / radius 12px;
 * tablo basligi #fafbfd; primary #15356b; ink #14223b/#51607a/#8b97ac).
 */

const PRIMARY = '#15356b';
const PRIMARY_HOVER = '#1c4585';
const INK = '#14223b';
const MUTED = '#51607a';
const FAINT = '#8b97ac';
const LINE = '#e7ebf2';
const SOFT_LINE = '#eef1f6';
const FIELD_BORDER = '#e3e8f0';
const TABLE_HEAD_BG = '#fafbfd';
const EMERALD = '#047857';
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
  border: `1px solid ${FIELD_BORDER}`,
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

// Tablo hucre temel stilleri
const thBase: React.CSSProperties = {
  padding: '10px 14px',
  background: TABLE_HEAD_BG,
  fontSize: 10,
  fontWeight: 600,
  color: FAINT,
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  borderBottom: `1px solid ${SOFT_LINE}`,
  textAlign: 'left',
};

const tdBase: React.CSSProperties = {
  padding: '11px 14px',
  fontSize: 12,
  color: INK,
  borderTop: `1px solid #f1f4f9`,
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
};

// Risk rozeti (klasik esiklerle BIREBIR: >=20 Kritik / >=10 Yuksek / >=5 Orta / <5 Dusuk)
function RiskBadge({ percent }: { percent: number | null | undefined }) {
  const ok = Number.isFinite(percent as number);
  let label = '-';
  let bg = '#f1f5f9';
  let bd = '#e2e8f0';
  let fg = MUTED;
  if (ok) {
    const p = percent as number;
    if (p >= 20) {
      label = 'Kritik';
      bg = '#fef2f2';
      bd = '#fecaca';
      fg = '#b91c1c';
    } else if (p >= 10) {
      label = 'Yüksek';
      bg = '#fff7ed';
      bd = '#fed7aa';
      fg = '#c2410c';
    } else if (p >= 5) {
      label = 'Orta';
      bg = '#fefce8';
      bd = '#fde68a';
      fg = '#a16207';
    } else {
      label = 'Düşük';
      bg = '#ecfdf5';
      bd = '#a7f3d0';
      fg = '#047857';
    }
  }
  return (
    <span
      style={{
        display: 'inline-block',
        background: bg,
        border: `1px solid ${bd}`,
        color: fg,
        fontSize: 10.5,
        fontWeight: 600,
        padding: '2px 9px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

export default function MaliyetGuncellemeUyarilariNew() {
  const {
    summary,
    metadata,
    loading,
    error,
    isSyncing,
    isExporting,
    searchQuery,
    setSearchQuery,
    dayDiffFilter,
    setDayDiffFilter,
    percentDiffFilter,
    setPercentDiffFilter,
    page,
    setPage,
    currentCostByCode,
    vatRateByCode,
    mainSupplierByCode,
    costPInputByCode,
    setCostPInputByCode,
    costTInputByCode,
    setCostTInputByCode,
    manualCostPOverrideByCode,
    setManualCostPOverrideByCode,
    updatePriceListsByCode,
    setUpdatePriceListsByCode,
    updatingCostByCode,
    toggleSort,
    sortIndicator,
    tableScrollRef,
    bottomScrollRef,
    bottomScrollbarWidth,
    syncFromMainScroll,
    syncFromBottomScroll,
    totalPages,
    pagedData,
    stickyCodeWidth,
    stickyNameWidth,
    isFiniteNumber,
    toFixedSafe,
    formatCurrency,
    formatDate,
    fetchData,
    handleManualSync,
    handleExportExcel,
    updateProductCost,
  } = useMaliyetGuncellemeUyarilari();

  // Siralanabilir baslik (klasik toggleSort + sortIndicator mantigi)
  const SortTh = ({
    label,
    sortKey,
    align = 'left',
    sticky,
  }: {
    label: string;
    sortKey: Parameters<typeof toggleSort>[0];
    align?: 'left' | 'right';
    sticky?: React.CSSProperties;
  }) => (
    <th
      onClick={() => toggleSort(sortKey)}
      title="Sırala"
      style={{
        ...thBase,
        textAlign: align,
        cursor: 'pointer',
        ...(sticky || {}),
      }}
    >
      {label}
      {sortIndicator(sortKey)}
    </th>
  );

  const stickyCodeTh: React.CSSProperties = {
    position: 'sticky',
    left: 0,
    zIndex: 22,
    background: TABLE_HEAD_BG,
    minWidth: stickyCodeWidth,
    width: stickyCodeWidth,
  };
  const stickyNameTh: React.CSSProperties = {
    position: 'sticky',
    left: stickyCodeWidth,
    zIndex: 22,
    background: TABLE_HEAD_BG,
    minWidth: stickyNameWidth,
    width: stickyNameWidth,
  };

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
        <span style={{ color: MUTED, fontWeight: 500 }}>Maliyet Güncelleme Uyarıları</span>
      </div>

      {/* Header: baslik + Tekrar Senkronize Et / Yenile / Excel */}
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
            <AlertTriangle size={22} strokeWidth={2} style={{ color: '#d97706' }} />
            Maliyet Güncelleme Uyarıları
          </h1>
          <div style={{ fontSize: 13, color: FAINT, marginTop: 6 }}>
            Son giriş maliyeti güncel maliyetten yüksek olan ürünler (KDV Hariç)
          </div>
          {metadata?.lastSyncAt && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11.5,
                color: MUTED,
                marginTop: 7,
              }}
            >
              <Database size={13} strokeWidth={2} style={{ color: FAINT }} />
              <span>
                Son Senkronizasyon: {new Date(metadata.lastSyncAt).toLocaleString('tr-TR')}
                {metadata.syncType === 'AUTO' ? ' (Otomatik)' : ' (Manuel)'}
              </span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            style={{
              ...headBtn,
              opacity: isSyncing ? 0.7 : 1,
              cursor: isSyncing ? 'not-allowed' : 'pointer',
            }}
          >
            <Database
              size={15}
              strokeWidth={2}
              className={isSyncing ? 'animate-spin' : ''}
            />
            {isSyncing ? 'Senkronize Ediliyor...' : 'Tekrar Senkronize Et'}
          </button>
          <button type="button" onClick={fetchData} style={headBtn}>
            <RefreshCw size={15} strokeWidth={2} />
            Yenile
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={isExporting}
            style={{
              ...headBtn,
              background: PRIMARY,
              color: '#fff',
              border: 'none',
              opacity: isExporting ? 0.7 : 1,
              cursor: isExporting ? 'not-allowed' : 'pointer',
            }}
          >
            {isExporting ? (
              <RefreshCw size={15} strokeWidth={2} className="animate-spin" />
            ) : (
              <Download size={15} strokeWidth={2} />
            )}
            {isExporting ? 'Hazırlanıyor...' : 'Excel İndir'}
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
            <div style={{ fontSize: 11.5, color: FAINT, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={14} strokeWidth={2} style={{ color: '#d97706' }} />
              Toplam Uyarı
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: INK,
                marginTop: 6,
                display: 'flex',
                alignItems: 'baseline',
                gap: 6,
              }}
            >
              {summary.totalAlerts}
              <span style={{ fontSize: 12, fontWeight: 400, color: FAINT }}>ürün</span>
            </div>
          </div>

          <div style={summaryCard}>
            <div style={{ fontSize: 11.5, color: FAINT, display: 'flex', alignItems: 'center', gap: 6 }}>
              <DollarSign size={14} strokeWidth={2} style={{ color: RED }} />
              Toplam Risk Tutarı
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, color: RED, marginTop: 6 }}>
              {formatCurrency(summary.totalRiskAmount)}
            </div>
          </div>

          <div style={summaryCard}>
            <div style={{ fontSize: 11.5, color: FAINT, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Package size={14} strokeWidth={2} style={{ color: PRIMARY }} />
              Etkilenen Stok Değeri
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, color: INK, marginTop: 6 }}>
              {formatCurrency(summary.totalStockValue)}
            </div>
          </div>

          <div style={summaryCard}>
            <div style={{ fontSize: 11.5, color: FAINT, display: 'flex', alignItems: 'center', gap: 6 }}>
              <TrendingUp size={14} strokeWidth={2} style={{ color: '#7c3aed' }} />
              Ortalama Fark
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#7c3aed', marginTop: 6 }}>
              %{toFixedSafe(summary.avgDiffPercent, 1)}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ ...cardStyle, padding: 16, marginBottom: 18 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: INK, marginBottom: 12 }}>
          Filtreler
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
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
                }}
              />
              <input
                placeholder="Ürün kodu veya adı..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                style={{ ...inputStyle, paddingLeft: 32 }}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Minimum Gün Farkı</label>
            <select
              value={dayDiffFilter}
              onChange={(e) => {
                setDayDiffFilter(e.target.value);
                setPage(1);
              }}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">Tümü</option>
              <option value="7">7 gün+</option>
              <option value="15">15 gün+</option>
              <option value="30">30 gün+</option>
              <option value="60">60 gün+</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Minimum % Fark</label>
            <select
              value={percentDiffFilter}
              onChange={(e) => {
                setPercentDiffFilter(e.target.value);
                setPage(1);
              }}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">Tümü</option>
              <option value="5">%5+</option>
              <option value="10">%10+</option>
              <option value="20">%20+</option>
              <option value="50">%50+</option>
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
            <AlertTriangle
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
            <div
              ref={tableScrollRef}
              style={{ maxHeight: '68vh', overflowY: 'auto', overflowX: 'scroll' }}
              onScroll={syncFromMainScroll}
            >
              <table
                style={{
                  minWidth: 2400,
                  width: '100%',
                  borderCollapse: 'separate',
                  borderSpacing: 0,
                }}
              >
                <thead style={{ position: 'sticky', top: 0, zIndex: 30 }}>
                  <tr>
                    <th style={thBase}>Risk</th>
                    <SortTh label="Ürün Kodu" sortKey="productCode" sticky={stickyCodeTh} />
                    <SortTh label="Ürün Adı" sortKey="productName" sticky={stickyNameTh} />
                    <SortTh label="Ana Sağlayıcı" sortKey="mainSupplierName" />
                    <SortTh label="G. Mal. Tarihi" sortKey="currentCostDate" align="right" />
                    <SortTh label="Güncel Maliyet" sortKey="currentCost" align="right" />
                    <SortTh label="S. Giriş Tarihi" sortKey="lastEntryDate" align="right" />
                    <SortTh label="S. Giriş Maliyeti" sortKey="lastEntryCost" align="right" />
                    <SortTh label="Fark (TL)" sortKey="diffAmount" align="right" />
                    <SortTh label="Fark (%)" sortKey="diffPercent" align="right" />
                    <SortTh label="Gün Farkı" sortKey="dayDiff" align="right" />
                    <SortTh label="Eldeki Stok" sortKey="stockQuantity" align="right" />
                    <SortTh label="Risk Tutarı" sortKey="riskAmount" align="right" />
                    <th style={{ ...thBase, textAlign: 'right' }}>Maliyet Güncelle</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedData.length === 0 ? (
                    <tr>
                      <td colSpan={14} style={{ ...tdBase, textAlign: 'center', padding: '48px 14px' }}>
                        <Package
                          size={32}
                          strokeWidth={2}
                          style={{ margin: '0 auto 8px', color: FAINT, display: 'block' }}
                        />
                        <p style={{ color: MUTED, margin: 0 }}>Uyarı bulunamadı</p>
                      </td>
                    </tr>
                  ) : (
                    pagedData.map((item) => {
                      const code = String(item.productCode || '').trim().toUpperCase();
                      const rowBg = '#fff';
                      const stickyCodeTd: React.CSSProperties = {
                        ...tdBase,
                        position: 'sticky',
                        left: 0,
                        zIndex: 10,
                        background: rowBg,
                        minWidth: stickyCodeWidth,
                        width: stickyCodeWidth,
                        fontFamily: "'Roboto Mono', monospace",
                        fontSize: 11,
                        color: MUTED,
                      };
                      const stickyNameTd: React.CSSProperties = {
                        ...tdBase,
                        position: 'sticky',
                        left: stickyCodeWidth,
                        zIndex: 10,
                        background: rowBg,
                        minWidth: stickyNameWidth,
                        width: stickyNameWidth,
                        maxWidth: stickyNameWidth,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        fontWeight: 500,
                      };
                      const supplier = mainSupplierByCode[code];
                      return (
                        <tr key={item.productCode}>
                          <td style={tdBase}>
                            <RiskBadge percent={item.diffPercent} />
                          </td>
                          <td style={stickyCodeTd}>{item.productCode}</td>
                          <td style={stickyNameTd} title={item.productName}>
                            {item.productName}
                          </td>
                          <td style={{ ...tdBase, color: MUTED }}>
                            {supplier ? `${supplier.code}${supplier.name ? ` - ${supplier.name}` : ''}` : '-'}
                          </td>
                          <td style={{ ...tdBase, textAlign: 'right' }}>
                            {formatDate(item.currentCostDate)}
                          </td>
                          <td style={{ ...tdBase, textAlign: 'right', fontWeight: 600 }}>
                            {formatCurrency(currentCostByCode[code] ?? item.currentCost)}
                          </td>
                          <td style={{ ...tdBase, textAlign: 'right', color: EMERALD }}>
                            {formatDate(item.lastEntryDate)}
                          </td>
                          <td style={{ ...tdBase, textAlign: 'right', fontWeight: 600, color: RED }}>
                            {formatCurrency(item.lastEntryCost)}
                          </td>
                          <td style={{ ...tdBase, textAlign: 'right', fontWeight: 700, color: RED }}>
                            {formatCurrency(item.diffAmount)}
                          </td>
                          <td style={{ ...tdBase, textAlign: 'right', fontWeight: 700 }}>
                            %{toFixedSafe(item.diffPercent, 1)}
                          </td>
                          <td style={{ ...tdBase, textAlign: 'right' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                border: `1px solid ${LINE}`,
                                borderRadius: 999,
                                padding: '1px 9px',
                                fontSize: 10.5,
                                fontWeight: 600,
                                color: MUTED,
                                background: '#fff',
                              }}
                            >
                              {isFiniteNumber(item.dayDiff) ? `${item.dayDiff} gün` : '-'}
                            </span>
                          </td>
                          <td style={{ ...tdBase, textAlign: 'right' }}>
                            {toFixedSafe(item.stockQuantity, 0)}
                          </td>
                          <td style={{ ...tdBase, textAlign: 'right', fontWeight: 700, color: '#991b1b' }}>
                            {formatCurrency(item.riskAmount)}
                          </td>
                          <td style={{ ...tdBase, textAlign: 'right' }}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'flex-end',
                                gap: 7,
                              }}
                            >
                              {/* Maliyet T input -> Maliyet P otomatik (yarim KDV). Mantik degismedi. */}
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={costPInputByCode[code] ?? ''}
                                onChange={(e) => {
                                  const rawValue = e.target.value;
                                  setCostPInputByCode((prev) => ({ ...prev, [code]: rawValue }));
                                  if (manualCostPOverrideByCode[code]) return;
                                  const parsed = Number(String(rawValue || '').replace(',', '.'));
                                  if (!Number.isFinite(parsed)) return;
                                  const vatRate = Number(vatRateByCode[code] ?? 0);
                                  const vatPercent = vatRate <= 1 ? vatRate * 100 : vatRate;
                                  const autoCostP = parsed * (1 + vatPercent / 200);
                                  setCostTInputByCode((prev) => ({
                                    ...prev,
                                    [code]: Number.isFinite(autoCostP)
                                      ? autoCostP.toFixed(4).replace(/\.?0+$/, '')
                                      : prev[code] || '',
                                  }));
                                }}
                                title="Maliyet T"
                                placeholder="T"
                                style={{
                                  height: 32,
                                  width: 72,
                                  border: `1px solid ${FIELD_BORDER}`,
                                  borderRadius: 7,
                                  padding: '0 8px',
                                  textAlign: 'right',
                                  fontSize: 12,
                                  color: INK,
                                  fontFamily: 'inherit',
                                  outline: 'none',
                                }}
                              />
                              {/* Maliyet P input (manuel override). Mantik degismedi. */}
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={costTInputByCode[code] ?? ''}
                                onChange={(e) => {
                                  setManualCostPOverrideByCode((prev) => ({ ...prev, [code]: true }));
                                  setCostTInputByCode((prev) => ({ ...prev, [code]: e.target.value }));
                                }}
                                title="Maliyet P"
                                placeholder="P"
                                style={{
                                  height: 32,
                                  width: 72,
                                  border: `1px solid ${FIELD_BORDER}`,
                                  borderRadius: 7,
                                  padding: '0 8px',
                                  textAlign: 'right',
                                  fontSize: 12,
                                  color: INK,
                                  fontFamily: 'inherit',
                                  outline: 'none',
                                }}
                              />
                              {/* 10 liste checkbox (updatePriceLists). Mantik degismedi. */}
                              <label
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  fontSize: 10.5,
                                  color: MUTED,
                                  whiteSpace: 'nowrap',
                                  cursor: 'pointer',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={Boolean(updatePriceListsByCode[code])}
                                  onChange={(e) => {
                                    setUpdatePriceListsByCode((prev) => ({ ...prev, [code]: e.target.checked }));
                                  }}
                                  style={{ width: 14, height: 14, accentColor: PRIMARY }}
                                />
                                10 liste
                              </label>
                              {/* Guncelle -> updateProductCost -> adminApi.updateUcarerProductCost (Mikro YAZAR). */}
                              <button
                                type="button"
                                onClick={() => updateProductCost(item.productCode)}
                                disabled={Boolean(updatingCostByCode[code])}
                                style={{
                                  height: 32,
                                  padding: '0 12px',
                                  border: `1px solid #d6e0f1`,
                                  borderRadius: 7,
                                  background: '#eef2fa',
                                  color: PRIMARY,
                                  fontSize: 11.5,
                                  fontWeight: 600,
                                  fontFamily: 'inherit',
                                  cursor: updatingCostByCode[code] ? 'not-allowed' : 'pointer',
                                  opacity: updatingCostByCode[code] ? 0.6 : 1,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {updatingCostByCode[code] ? '...' : 'Güncelle'}
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

            {/* Alt senkron yatay scrollbar (sticky kolonlu genis tablo icin) */}
            <div
              ref={bottomScrollRef}
              style={{
                height: 16,
                overflowX: 'scroll',
                overflowY: 'hidden',
                borderTop: `1px solid ${SOFT_LINE}`,
                background: '#f8fafc',
              }}
              onScroll={syncFromBottomScroll}
            >
              <div style={{ width: bottomScrollbarWidth, height: 1 }} />
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
