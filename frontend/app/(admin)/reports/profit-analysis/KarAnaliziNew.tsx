'use client';

import Link from 'next/link';
import {
  ChevronRight,
  Download,
  RefreshCw,
  Search,
  AlertCircle,
  Package,
  Save,
  Mail,
} from 'lucide-react';
import { useKarAnalizi, getCurrentMarginPercent } from './useKarAnalizi';
import type { SummaryBucket, MarginAnalysisRow } from './useKarAnalizi';

/**
 * Yeni gorunum: Kar Marji Analizi (019703) raporu.
 * Tum mantik useKarAnalizi hook'undan gelir; HICBIR handler/kolon/filtre/ozet-kart/
 * bucket/satis-personeli tablosu/sektor-secimi/kolon-yonetimi/Mail Gonder/Yeniden Cek/
 * sayfalama/dinamik kolon DUSURULMEMISTIR.
 *
 * Tasarim referansi: design HTML #scr-profit (data-screen-label="Kâr Marjı Analizi") +
 * brief 4.11.4. Genel rapor stili: beyaz kart #fff / border #e7ebf2 / radius 12px;
 * tablo basligi bg #fafbfd; primary #15356b; ink #14223b/#51607a/#8b97ac;
 * kar-marji renk esigi (>=20 yesil / >=10 amber / <10 kirmizi).
 * TUM tutarlar KDV haric (ozet bucket'lari) — etiketler korunmustur.
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

// Kar marji renk esigi (>=20 yesil / >=10 amber / <10 kirmizi)
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

const smallBtn: React.CSSProperties = {
  ...headBtn,
  height: 32,
  padding: '0 12px',
  fontSize: 12,
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
  padding: 14,
};

const cellRight: React.CSSProperties = { textAlign: 'right' };

// Marj rozeti (Classic getMarginBadge ile ayni esikler/etiketler)
function MarginBadge({ margin, fmt }: { margin: number; fmt: (v: number) => string }) {
  let label: string;
  let bg: string;
  let color: string;
  if (margin < 0) {
    label = `Zarar: ${fmt(margin)}`;
    bg = '#fef2f2';
    color = RED;
  } else if (margin < 10) {
    label = `Düşük: ${fmt(margin)}`;
    bg = '#fef2f2';
    color = RED;
  } else if (margin <= 30) {
    label = `Normal: ${fmt(margin)}`;
    bg = '#eff6ff';
    color = PRIMARY;
  } else {
    label = `Yüksek: ${fmt(margin)}`;
    bg = '#ecfdf5';
    color = EMERALD;
  }
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        background: bg,
        color,
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

export default function KarAnaliziNew() {
  const {
    data,
    summary,
    metadata,
    loading,
    error,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    sortOrder,
    setSortOrder,
    page,
    setPage,
    totalPages,
    visibleColumns,
    emailColumnIds,
    savingEmailColumns,
    includedSectorCodes,
    setIncludedSectorCodes,
    availableSectorCodes,
    savingSectorCodes,
    syncingReport,
    sendingReportEmail,
    isSingleDate,
    fetchData,
    handleSearch,
    toggleColumn,
    toggleIncludedSectorCode,
    handleResyncReport,
    handleSendReportEmail,
    handleSaveEmailColumns,
    handleSaveIncludedSectorCodes,
    exportToExcel,
    formatCurrency,
    formatPercent,
    formatCount,
    formatDate,
    columnDefs,
    visibleColumnDefs,
    filteredData,
  } = useKarAnalizi();

  // Ozet bucket karti (Siparis Ozeti / Satis Ozeti) — KDV haric, Classic ile ayni alanlar.
  const renderBucket = (title: string, bucket: SummaryBucket) => (
    <div style={{ ...cardStyle, padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{title}</div>
      <div style={{ fontSize: 11.5, color: FAINT, marginTop: 2, marginBottom: 12 }}>
        KDV haric degerler
      </div>
      <div style={{ display: 'grid', gap: 8, fontSize: 12.5 }}>
        {[
          ['Toplam Evrak', formatCount(bucket.totalDocuments)],
          ['Toplam Satir', formatCount(bucket.totalRecords)],
          ['Ciro (KDV Haric)', formatCurrency(bucket.totalRevenue)],
          ['Kar (Guncel, KDV Haric)', formatCurrency(bucket.totalProfit)],
          ['Kar (Son Giris)', formatCurrency(bucket.entryProfit)],
          ['Kar % (Guncel)', formatPercent(bucket.avgMargin)],
          ['Zararli Evrak', formatCount(bucket.negativeDocuments)],
          ['Zararli Satir', formatCount(bucket.negativeLines)],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: FAINT }}>{k}</span>
            <span style={{ fontWeight: 600, color: INK }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );

  // Marj kolonu, dinamik kolon listesinde renk esigine gore islensin diye
  // render fonksiyonunu yakalamak yerine satir kar yuzdesini dogrudan kullaniyoruz.
  const isMarginColumn = (id: string) => id === 'margin';

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
        <span style={{ color: MUTED, fontWeight: 500 }}>Kâr Marjı Analizi</span>
      </div>

      {/* Header: baslik + Excel/Yenile */}
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
            Kâr Marjı Analizi
          </h1>
          <div style={{ fontSize: 13, color: FAINT, marginTop: 5 }}>
            Bekleyen siparişler ve faturaların kâr marjı detayları (019703 Raporu) · tüm özetler KDV hariç
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={exportToExcel} style={headBtn}>
            <Download size={15} strokeWidth={2} />
            Excel İndir
          </button>
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
            <RefreshCw
              size={15}
              strokeWidth={2}
              className={loading ? 'animate-spin' : undefined}
            />
            Yenile
          </button>
        </div>
      </div>

      {/* Summary: 6 metrik karti */}
      {summary && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 18 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: 12,
            }}
          >
            <div style={summaryCard}>
              <div style={{ fontSize: 11, color: FAINT }}>Toplam Satır</div>
              <div style={{ fontSize: 19, fontWeight: 600, color: INK, marginTop: 5 }}>
                {formatCount(summary.totalRecords)}
              </div>
              <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>Satır sayısı</div>
            </div>

            <div style={summaryCard}>
              <div style={{ fontSize: 11, color: FAINT }}>Toplam Evrak</div>
              <div style={{ fontSize: 19, fontWeight: 600, color: INK, marginTop: 5 }}>
                {formatCount(summary.totalDocuments)}
              </div>
              <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>Evrak sayısı</div>
            </div>

            <div style={summaryCard}>
              <div style={{ fontSize: 11, color: FAINT }}>Satış Cirosu</div>
              <div style={{ fontSize: 19, fontWeight: 600, color: INK, marginTop: 5 }}>
                {formatCurrency(summary.salesSummary.totalRevenue)}
              </div>
              <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>Sadece satış, KDV Hariç</div>
            </div>

            <div style={summaryCard}>
              <div style={{ fontSize: 11, color: FAINT }}>Toplam Kâr (Güncel)</div>
              <div style={{ fontSize: 19, fontWeight: 600, color: EMERALD, marginTop: 5 }}>
                {formatCurrency(summary.totalProfit)}
              </div>
              <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>Teklif kolonları bazlı, KDV Hariç</div>
            </div>

            <div style={summaryCard}>
              <div style={{ fontSize: 11, color: FAINT }}>Toplam Kâr (Son Giriş)</div>
              <div style={{ fontSize: 19, fontWeight: 600, color: INK, marginTop: 5 }}>
                {formatCurrency(summary.entryProfit)}
              </div>
              <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>SÖ kolonları bazlı</div>
            </div>

            <div style={summaryCard}>
              <div style={{ fontSize: 11, color: FAINT }}>Kâr % (Güncel)</div>
              <div
                style={{
                  fontSize: 19,
                  fontWeight: 600,
                  color: marjColor(summary.avgMargin),
                  marginTop: 5,
                }}
              >
                {formatPercent(summary.avgMargin)}
              </div>
              <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>
                Yüksek: {formatCount(summary.highMarginCount)} | Düşük: {formatCount(summary.lowMarginCount)} | Zarar: {formatCount(summary.negativeMarginCount)}
              </div>
            </div>
          </div>

          {/* Siparis Ozeti / Satis Ozeti bucket'lari */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            {renderBucket('Sipariş Özeti', summary.orderSummary)}
            {renderBucket('Satış Özeti', summary.salesSummary)}
          </div>

          {/* Satis Personeli Ozeti (iki seviyeli tablo) */}
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${SOFT_LINE}` }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>Satış Personeli Özeti</div>
              <div style={{ fontSize: 11.5, color: FAINT, marginTop: 2 }}>
                Günlük sipariş ve satış performansı (KDV hariç)
              </div>
            </div>
            {summary.salespersonSummary.length === 0 ? (
              <div style={{ padding: 24, fontSize: 12.5, color: MUTED }}>Kayıt bulunamadı.</div>
            ) : (
              <div style={{ overflowX: 'auto', maxHeight: '60vh' }}>
                <table style={{ minWidth: 960, width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: TABLE_HEAD_BG }}>
                      <th
                        rowSpan={2}
                        style={{
                          padding: '10px 14px',
                          fontSize: 10,
                          fontWeight: 600,
                          color: FAINT,
                          textTransform: 'uppercase',
                          textAlign: 'left',
                          whiteSpace: 'nowrap',
                          borderBottom: `1px solid ${SOFT_LINE}`,
                          position: 'sticky',
                          left: 0,
                          background: TABLE_HEAD_BG,
                        }}
                      >
                        Satış Personeli
                      </th>
                      <th
                        colSpan={5}
                        style={{
                          padding: '10px 14px',
                          fontSize: 10,
                          fontWeight: 600,
                          color: FAINT,
                          textTransform: 'uppercase',
                          textAlign: 'center',
                          whiteSpace: 'nowrap',
                          borderBottom: `1px solid ${SOFT_LINE}`,
                        }}
                      >
                        Sipariş
                      </th>
                      <th
                        colSpan={5}
                        style={{
                          padding: '10px 14px',
                          fontSize: 10,
                          fontWeight: 600,
                          color: FAINT,
                          textTransform: 'uppercase',
                          textAlign: 'center',
                          whiteSpace: 'nowrap',
                          borderBottom: `1px solid ${SOFT_LINE}`,
                        }}
                      >
                        Satış
                      </th>
                    </tr>
                    <tr style={{ background: TABLE_HEAD_BG }}>
                      {['Ciro', 'Kâr (Güncel)', 'Kâr % (Güncel)', 'Zararlı Evrak', 'Zararlı Satır',
                        'Ciro', 'Kâr (Güncel)', 'Kâr % (Güncel)', 'Zararlı Evrak', 'Zararlı Satır'].map((h, i) => (
                        <th
                          key={i}
                          style={{
                            padding: '8px 14px',
                            fontSize: 10,
                            fontWeight: 600,
                            color: FAINT,
                            textTransform: 'uppercase',
                            textAlign: 'right',
                            whiteSpace: 'nowrap',
                            borderBottom: `1px solid ${SOFT_LINE}`,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.salespersonSummary.map((entry) => (
                      <tr key={entry.sectorCode} style={{ borderTop: `1px solid ${ROW_LINE}` }}>
                        <td
                          style={{
                            padding: '10px 14px',
                            fontSize: 11.5,
                            fontWeight: 500,
                            color: INK,
                            whiteSpace: 'nowrap',
                            position: 'sticky',
                            left: 0,
                            background: '#fff',
                          }}
                        >
                          {entry.sectorCode}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 11.5, color: INK, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(entry.orderSummary.totalRevenue)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 11.5, color: INK, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(entry.orderSummary.totalProfit)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 11.5, color: marjColor(entry.orderSummary.avgMargin), fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatPercent(entry.orderSummary.avgMargin)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 11.5, color: INK, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCount(entry.orderSummary.negativeDocuments)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 11.5, color: INK, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCount(entry.orderSummary.negativeLines)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 11.5, color: INK, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(entry.salesSummary.totalRevenue)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 11.5, color: INK, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(entry.salesSummary.totalProfit)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 11.5, color: marjColor(entry.salesSummary.avgMargin), fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatPercent(entry.salesSummary.avgMargin)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 11.5, color: INK, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCount(entry.salesSummary.negativeDocuments)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 11.5, color: INK, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCount(entry.salesSummary.negativeLines)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filtreler */}
      <div style={{ ...cardStyle, padding: 16, marginBottom: 18 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: INK, marginBottom: 12 }}>Filtreler</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          <div>
            <label style={labelStyle}>Başlangıç Tarihi</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Bitiş Tarihi</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Kâr Durumu</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">Tümü</option>
              <option value="HIGH">Yüksek Kâr (&gt;30%)</option>
              <option value="OK">Normal Kâr (10-30%)</option>
              <option value="LOW">Düşük Kâr (&lt;10%)</option>
              <option value="NEGATIVE">Zarar (&lt;0%)</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Sıralama</label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="desc">Kâr % Azalan</option>
              <option value="asc">Kâr % Artan</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              type="button"
              onClick={handleSearch}
              style={{
                ...headBtn,
                width: '100%',
                justifyContent: 'center',
                background: PRIMARY,
                color: '#fff',
                border: 'none',
              }}
            >
              <Search size={15} strokeWidth={2} />
              Ara
            </button>
          </div>
        </div>

        {/* Serbest arama */}
        <div style={{ marginTop: 14 }}>
          <input
            placeholder="Stok kodu, ürün adı, evrak no veya cari ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Secili Gunu Yeniden Cek + Mail Gonder */}
        <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={handleResyncReport}
            disabled={!isSingleDate || syncingReport}
            style={{
              ...smallBtn,
              opacity: !isSingleDate || syncingReport ? 0.5 : 1,
              cursor: !isSingleDate || syncingReport ? 'not-allowed' : 'pointer',
            }}
          >
            {syncingReport && <RefreshCw size={13} strokeWidth={2} className="animate-spin" />}
            Seçili Günü Yeniden Çek
          </button>
          <button
            type="button"
            onClick={handleSendReportEmail}
            disabled={!isSingleDate || sendingReportEmail}
            style={{
              ...smallBtn,
              opacity: !isSingleDate || sendingReportEmail ? 0.5 : 1,
              cursor: !isSingleDate || sendingReportEmail ? 'not-allowed' : 'pointer',
            }}
          >
            {sendingReportEmail ? (
              <RefreshCw size={13} strokeWidth={2} className="animate-spin" />
            ) : (
              <Mail size={13} strokeWidth={2} />
            )}
            Mail Gönder
          </button>
          <span style={{ fontSize: 11.5, color: FAINT }}>Tek gün seçili olmalı.</span>
        </div>

        {/* Hesaplamaya Dahil Sektor Kodlari (details) */}
        <details style={{ marginTop: 14 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: MUTED }}>
            Hesaplamaya Dahil Sektör Kodları ({includedSectorCodes.length || 'Varsayılan'})
          </summary>
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              onClick={() => setIncludedSectorCodes(availableSectorCodes)}
              disabled={availableSectorCodes.length === 0}
              style={{
                ...smallBtn,
                opacity: availableSectorCodes.length === 0 ? 0.5 : 1,
                cursor: availableSectorCodes.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              Tümünü Seç
            </button>
            <button type="button" onClick={() => setIncludedSectorCodes([])} style={smallBtn}>
              Varsayılana Dön
            </button>
            <button
              type="button"
              onClick={handleSaveIncludedSectorCodes}
              disabled={savingSectorCodes}
              style={{
                ...smallBtn,
                background: PRIMARY,
                color: '#fff',
                border: 'none',
                opacity: savingSectorCodes ? 0.7 : 1,
                cursor: savingSectorCodes ? 'not-allowed' : 'pointer',
              }}
            >
              {savingSectorCodes && <RefreshCw size={13} strokeWidth={2} className="animate-spin" />}
              <Save size={13} strokeWidth={2} />
              Sektör Kodlarını Kaydet
            </button>
          </div>
          <div
            style={{
              marginTop: 12,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 8,
            }}
          >
            {availableSectorCodes.map((sectorCode) => (
              <label
                key={sectorCode}
                style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: MUTED }}
              >
                <input
                  type="checkbox"
                  style={{ width: 16, height: 16 }}
                  checked={includedSectorCodes.includes(sectorCode)}
                  onChange={() => toggleIncludedSectorCode(sectorCode)}
                />
                {sectorCode}
              </label>
            ))}
          </div>
          <p style={{ marginTop: 8, fontSize: 11.5, color: FAINT }}>
            Seçim kaydedilirse rapor o sektör kodlarıyla hesaplanır. Boş bırakılırsa varsayılan SATIŞ kodları kullanılır.
          </p>
        </details>

        {/* Kolonlar (details) */}
        <details style={{ marginTop: 14 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: MUTED }}>
            Kolonlar ({visibleColumns.length}/{columnDefs.length})
          </summary>
          <div
            style={{
              marginTop: 12,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 8,
            }}
          >
            {columnDefs.map((column) => (
              <label
                key={column.id}
                style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: MUTED }}
              >
                <input
                  type="checkbox"
                  style={{ width: 16, height: 16 }}
                  checked={visibleColumns.includes(column.id)}
                  onChange={() => toggleColumn(column.id)}
                />
                {column.label}
              </label>
            ))}
          </div>
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={handleSaveEmailColumns}
              disabled={savingEmailColumns}
              style={{
                ...smallBtn,
                background: PRIMARY,
                color: '#fff',
                border: 'none',
                opacity: savingEmailColumns ? 0.7 : 1,
                cursor: savingEmailColumns ? 'not-allowed' : 'pointer',
              }}
            >
              {savingEmailColumns && <RefreshCw size={13} strokeWidth={2} className="animate-spin" />}
              <Save size={13} strokeWidth={2} />
              Mail Excel Kolonlarını Kaydet
            </button>
            <span style={{ fontSize: 11.5, color: FAINT }}>
              Kayıtlı mail kolonları: {emailColumnIds.length > 0 ? emailColumnIds.length : 'Varsayılan'}
            </span>
          </div>
          <p style={{ marginTop: 8, fontSize: 11.5, color: FAINT }}>En az bir kolon seçili olmalı.</p>
        </details>
      </div>

      {/* Detay tablosu */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${SOFT_LINE}` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>Kâr Marjı Detayları</div>
          {metadata && (
            <div style={{ fontSize: 11.5, color: FAINT, marginTop: 2 }}>
              {`Rapor Tarihi: ${formatDate(metadata.reportDate)} | Tarih Aralığı: ${metadata.startDate} - ${metadata.endDate}`}
            </div>
          )}
        </div>

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
            <AlertCircle size={36} strokeWidth={2} style={{ margin: '0 auto 16px', color: RED, display: 'block' }} />
            <p style={{ color: RED, margin: 0, fontWeight: 500 }}>{error}</p>
          </div>
        ) : filteredData.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Package size={36} strokeWidth={2} style={{ margin: '0 auto 16px', color: FAINT, display: 'block' }} />
            <p style={{ color: MUTED, margin: 0 }}>Veri bulunamadı</p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto', maxHeight: '70vh' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr style={{ background: TABLE_HEAD_BG }}>
                    {visibleColumnDefs.map((column) => {
                      const right =
                        column.headerClassName?.includes('text-right') ||
                        isMarginColumn(column.id);
                      return (
                        <th
                          key={column.id}
                          style={{
                            padding: '11px 16px',
                            fontSize: 10,
                            fontWeight: 600,
                            color: FAINT,
                            textTransform: 'uppercase',
                            textAlign: right ? 'right' : 'left',
                            whiteSpace: 'nowrap',
                            borderBottom: `1px solid ${SOFT_LINE}`,
                            position: 'sticky',
                            top: 0,
                            background: TABLE_HEAD_BG,
                          }}
                        >
                          {column.label}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((row, idx) => (
                    <tr
                      key={`${row.msg_S_0089}-${row.msg_S_0001}-${idx}`}
                      style={{ borderTop: `1px solid ${ROW_LINE}` }}
                    >
                      {visibleColumnDefs.map((column) => {
                        const right = column.cellClassName?.includes('text-right');
                        const mono = column.cellClassName?.includes('font-mono');
                        const semibold = column.cellClassName?.includes('font-semibold');
                        // Marj kolonu: renk esikli rozet
                        if (isMarginColumn(column.id)) {
                          const m = getCurrentMarginPercent(row as MarginAnalysisRow);
                          return (
                            <td
                              key={column.id}
                              style={{ padding: '12px 16px', fontSize: 11.5, textAlign: 'right', whiteSpace: 'nowrap' }}
                            >
                              <MarginBadge margin={m} fmt={(v) => formatPercent(v)} />
                            </td>
                          );
                        }
                        return (
                          <td
                            key={column.id}
                            style={{
                              padding: '12px 16px',
                              fontSize: 11.5,
                              color: INK,
                              textAlign: right ? 'right' : 'left',
                              fontWeight: semibold ? 600 : 400,
                              fontFamily: mono ? "'Roboto Mono', monospace" : 'inherit',
                              maxWidth: column.cellClassName?.includes('max-w-[250px]')
                                ? 250
                                : column.cellClassName?.includes('max-w-[200px]')
                                ? 200
                                : undefined,
                              overflow: column.cellClassName?.includes('truncate') ? 'hidden' : undefined,
                              textOverflow: column.cellClassName?.includes('truncate') ? 'ellipsis' : undefined,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {column.render(row)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
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
