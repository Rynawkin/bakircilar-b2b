'use client';

import Link from 'next/link';
import {
  ChevronRight,
  Download,
  RefreshCw,
  Search,
  AlertCircle,
  Package,
  Mail,
  RotateCw,
} from 'lucide-react';
import {
  useKarMarjiUyum,
  MARGIN_EXCLUSION_TYPE_LABELS,
  GENERAL_EXCLUSION_TYPE_LABELS,
} from './useKarMarjiUyum';
import type { MarginExclusionType, GeneralExclusionType } from './useKarMarjiUyum';

/**
 * Yeni gorunum: Kar Marji Analizi (019703) raporu.
 * Tum mantik useKarMarjiUyum hook'undan gelir; hicbir handler/kolon/filtre/ozet/
 * sekme/satir-aksiyon dusurulmemistir.
 *
 * Tasarim referansi: design HTML #scr-profit (data-screen-label="Kâr Marjı Analizi") +
 * brief 4.11.4. Genel rapor stili: beyaz kart #fff / border #e7ebf2 / radius 12px;
 * tablo basligi bg #fafbfd; primary #15356b; ink #14223b/#51607a/#8b97ac;
 * kar-marji renk esigi (>=20 yesil / >=10 amber / <10 kirmizi).
 *
 * Mevcut tum ozellikler korundu:
 * - Header: Excel Indir + Yenile.
 * - Filtre: Baslangic/Bitis + Kar Durumu + Siralama + Ara + serbest arama +
 *   "Secili Gunu Yeniden Cek" + "Mail Gonder" + <details> Sektor Kodlari + <details> Kolonlar.
 * - 6 ozet kart + Siparis/Satis bucket'lari + Satis Personeli Ozeti (iki seviyeli tablo).
 * - Dinamik kolonlu detay tablosu (visibleColumnDefs.render/headerClassName ile) + sayfalama.
 *   Marj rozeti hook'taki getMarginBadge ile birebir korundu.
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
  fontWeight: 500,
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const primaryBtn: React.CSSProperties = {
  ...headBtn,
  background: PRIMARY,
  color: '#fff',
  border: 'none',
  fontWeight: 600,
};

const smallBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  height: 32,
  padding: '0 12px',
  border: `1px solid #d8e0ec`,
  borderRadius: 8,
  background: '#fff',
  color: MUTED,
  fontSize: 12,
  fontWeight: 500,
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
  padding: 14,
};

const cellRight: React.CSSProperties = { textAlign: 'right' };

// NOT: Marj rozeti, dinamik kolon mantigini bozmamak icin hook'taki getMarginBadge ile
// (Classic'teki Badge component) birebir render edilir; ayri stil tanimi yoktur.

// Tablo grid sablonu: dinamik kolon sayisina gore esit genislik (yatay scroll var).
const detailGrid = (count: number) => `repeat(${count}, minmax(120px, 1fr))`;

export default function KarMarjiUyumNew() {
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
    activeExclusions,
    excludedByUserRules,
    exclusionType,
    setExclusionType,
    exclusionSearch,
    setExclusionSearch,
    exclusionOptions,
    exclusionOptionsLoading,
    exclusionNameInput,
    setExclusionNameInput,
    savingExclusion,
    deletingExclusionId,
    handleAddExclusionOption,
    handleAddNameExclusion,
    handleDeleteExclusion,
    exclusionsPanelOpen,
    setExclusionsPanelOpen,
    exclusionsTab,
    setExclusionsTab,
    generalExclusions,
    activeGeneralExclusions,
    generalExclusionsLoading,
    generalExclusionsForbidden,
    generalFormType,
    setGeneralFormType,
    generalFormValue,
    setGeneralFormValue,
    generalFormDescription,
    setGeneralFormDescription,
    savingGeneralExclusion,
    deletingGeneralExclusionId,
    handleAddGeneralExclusion,
    handleDeleteGeneralExclusion,
    syncingReport,
    sendingReportEmail,
    isSingleDate,
    columnDefs,
    visibleColumnDefs,
    filteredData,
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
  } = useKarMarjiUyum();

  // Ozet bucket karti (Siparis Ozeti / Satis Ozeti) — Classic renderSummaryBucket ile ayni alanlar.
  const renderBucket = (title: string, bucket: NonNullable<typeof summary>['orderSummary']) => (
    <div style={{ ...cardStyle, padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{title}</div>
      <div style={{ fontSize: 11, color: FAINT, marginTop: 2, marginBottom: 12 }}>KDV hariç değerler</div>
      <div style={{ display: 'grid', gap: 8, fontSize: 12.5 }}>
        {[
          ['Toplam Evrak', formatCount(bucket.totalDocuments)],
          ['Toplam Satır', formatCount(bucket.totalRecords)],
          ['Ciro (KDV Hariç)', formatCurrency(bucket.totalRevenue)],
          ['Kâr (Güncel, KDV Hariç)', formatCurrency(bucket.totalProfit)],
          ['Kâr (Son Giriş)', formatCurrency(bucket.entryProfit)],
          ['Kâr % (Güncel)', formatPercent(bucket.avgMargin)],
          ['Zararlı Evrak', formatCount(bucket.negativeDocuments)],
          ['Zararlı Satır', formatCount(bucket.negativeLines)],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: MUTED }}>{k}</span>
            <span style={{ fontWeight: 600, color: INK }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
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
        <span style={{ color: MUTED, fontWeight: 500 }}>Kâr Marjı Analizi</span>
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
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: 0, color: INK }}>
            Kâr Marjı Analizi
          </h1>
          <div style={{ fontSize: 13, color: FAINT, marginTop: 5 }}>
            Bekleyen siparişler ve faturaların kâr marjı detayları (019703 Raporu) · tüm tutarlar KDV hariç
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
            style={{ ...headBtn, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            <RefreshCw size={15} strokeWidth={2} className={loading ? 'animate-spin' : undefined} />
            Yenile
          </button>
        </div>
      </div>

      {/* Summary Cards (6 metrik) */}
      {summary && (
        <div style={{ marginBottom: 18 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: 12,
              marginBottom: 14,
            }}
          >
            <div style={summaryCard}>
              <div style={{ fontSize: 11, color: FAINT }}>Toplam Satır</div>
              <div style={{ fontSize: 19, fontWeight: 600, color: INK, marginTop: 5 }}>
                {formatCount(summary.totalRecords)}
              </div>
              <div style={{ fontSize: 10.5, color: FAINT, marginTop: 3 }}>Satır sayısı</div>
            </div>

            <div style={summaryCard}>
              <div style={{ fontSize: 11, color: FAINT }}>Toplam Evrak</div>
              <div style={{ fontSize: 19, fontWeight: 600, color: INK, marginTop: 5 }}>
                {formatCount(summary.totalDocuments)}
              </div>
              <div style={{ fontSize: 10.5, color: FAINT, marginTop: 3 }}>Evrak sayısı</div>
            </div>

            <div style={summaryCard}>
              <div style={{ fontSize: 11, color: FAINT }}>Satış Cirosu</div>
              <div style={{ fontSize: 19, fontWeight: 600, color: INK, marginTop: 5 }}>
                {formatCurrency(summary.salesSummary.totalRevenue)}
              </div>
              <div style={{ fontSize: 10.5, color: FAINT, marginTop: 3 }}>Sadece satış, KDV Hariç</div>
            </div>

            <div style={summaryCard}>
              <div style={{ fontSize: 11, color: FAINT }}>Toplam Kâr (Güncel)</div>
              <div style={{ fontSize: 19, fontWeight: 600, color: EMERALD, marginTop: 5 }}>
                {formatCurrency(summary.totalProfit)}
              </div>
              <div style={{ fontSize: 10.5, color: FAINT, marginTop: 3 }}>Teklif kolonları bazlı, KDV Hariç</div>
            </div>

            <div style={summaryCard}>
              <div style={{ fontSize: 11, color: FAINT }}>Toplam Kâr (Son Giriş)</div>
              <div style={{ fontSize: 19, fontWeight: 600, color: INK, marginTop: 5 }}>
                {formatCurrency(summary.entryProfit)}
              </div>
              <div style={{ fontSize: 10.5, color: FAINT, marginTop: 3 }}>SÖ kolonları bazlı</div>
            </div>

            <div style={summaryCard}>
              <div style={{ fontSize: 11, color: FAINT }}>Kâr % (Güncel)</div>
              <div style={{ fontSize: 19, fontWeight: 600, color: AMBER, marginTop: 5 }}>
                {formatPercent(summary.avgMargin)}
              </div>
              <div style={{ fontSize: 10.5, color: FAINT, marginTop: 3 }}>
                Yüksek: {formatCount(summary.highMarginCount)} | Düşük: {formatCount(summary.lowMarginCount)} | Zarar:{' '}
                {formatCount(summary.negativeMarginCount)}
              </div>
            </div>
          </div>

          {/* Siparis / Satis bucket'lari */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 14 }}>
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
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 960, borderCollapse: 'collapse', fontSize: 11.5 }}>
                  <thead>
                    <tr style={{ background: TABLE_HEAD_BG }}>
                      <th
                        rowSpan={2}
                        style={{
                          textAlign: 'left',
                          padding: '10px 12px',
                          fontSize: 10,
                          fontWeight: 600,
                          color: FAINT,
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap',
                          borderBottom: `1px solid ${SOFT_LINE}`,
                          verticalAlign: 'bottom',
                        }}
                      >
                        Satış Personeli
                      </th>
                      <th
                        colSpan={5}
                        style={{
                          textAlign: 'center',
                          padding: '10px 12px',
                          fontSize: 10,
                          fontWeight: 600,
                          color: FAINT,
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap',
                          borderBottom: `1px solid ${SOFT_LINE}`,
                          borderLeft: `1px solid ${SOFT_LINE}`,
                        }}
                      >
                        Sipariş
                      </th>
                      <th
                        colSpan={5}
                        style={{
                          textAlign: 'center',
                          padding: '10px 12px',
                          fontSize: 10,
                          fontWeight: 600,
                          color: FAINT,
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap',
                          borderBottom: `1px solid ${SOFT_LINE}`,
                          borderLeft: `1px solid ${SOFT_LINE}`,
                        }}
                      >
                        Satış
                      </th>
                    </tr>
                    <tr style={{ background: TABLE_HEAD_BG }}>
                      {['Ciro', 'Kâr (Güncel)', 'Kâr % (Güncel)', 'Zararlı Evrak', 'Zararlı Satır'].map((h, i) => (
                        <th
                          key={`o-${h}`}
                          style={{
                            textAlign: 'right',
                            padding: '8px 12px',
                            fontSize: 10,
                            fontWeight: 600,
                            color: FAINT,
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                            borderBottom: `1px solid ${SOFT_LINE}`,
                            borderLeft: i === 0 ? `1px solid ${SOFT_LINE}` : undefined,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                      {['Ciro', 'Kâr (Güncel)', 'Kâr % (Güncel)', 'Zararlı Evrak', 'Zararlı Satır'].map((h, i) => (
                        <th
                          key={`s-${h}`}
                          style={{
                            textAlign: 'right',
                            padding: '8px 12px',
                            fontSize: 10,
                            fontWeight: 600,
                            color: FAINT,
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                            borderBottom: `1px solid ${SOFT_LINE}`,
                            borderLeft: i === 0 ? `1px solid ${SOFT_LINE}` : undefined,
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
                        <td style={{ padding: '9px 12px', fontWeight: 600, color: INK, whiteSpace: 'nowrap' }}>
                          {entry.sectorCode}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: INK, borderLeft: `1px solid ${ROW_LINE}` }}>
                          {formatCurrency(entry.orderSummary.totalRevenue)}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: INK }}>
                          {formatCurrency(entry.orderSummary.totalProfit)}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: INK }}>
                          {formatPercent(entry.orderSummary.avgMargin)}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: INK }}>
                          {formatCount(entry.orderSummary.negativeDocuments)}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: INK }}>
                          {formatCount(entry.orderSummary.negativeLines)}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: INK, borderLeft: `1px solid ${ROW_LINE}` }}>
                          {formatCurrency(entry.salesSummary.totalRevenue)}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: INK }}>
                          {formatCurrency(entry.salesSummary.totalProfit)}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: INK }}>
                          {formatPercent(entry.salesSummary.avgMargin)}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: INK }}>
                          {formatCount(entry.salesSummary.negativeDocuments)}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: INK }}>
                          {formatCount(entry.salesSummary.negativeLines)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
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
              <option value="HIGH">Yüksek Kar (&gt;30%)</option>
              <option value="OK">Normal Kar (10-30%)</option>
              <option value="LOW">Düşük Kar (&lt;10%)</option>
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
            <button type="button" onClick={handleSearch} style={{ ...primaryBtn, width: '100%', justifyContent: 'center' }}>
              <Search size={15} strokeWidth={2} />
              Ara
            </button>
          </div>
        </div>

        {/* Serbest arama */}
        <div style={{ marginTop: 12 }}>
          <input
            placeholder="Stok kodu, ürün adı, evrak no veya cari ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Secili Gunu Yeniden Cek + Mail Gonder */}
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
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
            <RotateCw size={13} strokeWidth={2} className={syncingReport ? 'animate-spin' : undefined} />
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
            <Mail size={13} strokeWidth={2} />
            Mail Gönder
          </button>
          <button
            type="button"
            onClick={() => setExclusionsPanelOpen(!exclusionsPanelOpen)}
            style={{
              ...smallBtn,
              border: '1px solid #fecaca',
              background: exclusionsPanelOpen ? '#fee2e2' : '#fef2f2',
              color: RED,
              fontWeight: 600,
            }}
          >
            🚫 Dışlamalar ({activeExclusions.length + activeGeneralExclusions.length})
          </button>
          <span style={{ fontSize: 11, color: FAINT }}>Tek gün seçili olmalı.</span>
        </div>

        {/* Hesaplamaya Dahil Sektor Kodlari */}
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: MUTED }}>
            Hesaplamaya Dahil Sektör Kodları ({includedSectorCodes.length || 'Varsayılan'})
          </summary>
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              onClick={() => setIncludedSectorCodes(availableSectorCodes)}
              disabled={availableSectorCodes.length === 0}
              style={{ ...smallBtn, opacity: availableSectorCodes.length === 0 ? 0.5 : 1 }}
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
              style={{ ...smallBtn, opacity: savingSectorCodes ? 0.6 : 1 }}
            >
              Sektör Kodlarını Kaydet
            </button>
          </div>
          <div
            style={{
              marginTop: 12,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
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
          <p style={{ marginTop: 8, fontSize: 11, color: FAINT }}>
            Seçim kaydedilirse rapor o sektör kodlarıyla hesaplanır. Boş bırakılırsa varsayılan SATIŞ kodları kullanılır.
          </p>
        </details>

        {/* Dislamalar paneli — butonla acilir, iki sekme: Marj / Genel */}
        {exclusionsPanelOpen && (
          <div style={{ marginTop: 12, border: `1px solid ${LINE}`, borderRadius: 10, overflow: 'hidden' }}>
            {/* Sekmeler */}
            <div style={{ display: 'flex', background: TABLE_HEAD_BG, borderBottom: `1px solid ${SOFT_LINE}` }}>
              {[
                ['MARGIN', `Marj Raporu Dışlamaları (${activeExclusions.length})`],
                ['GENERAL', `Genel Rapor Dışlamaları (${activeGeneralExclusions.length})`],
              ].map(([key, label]) => {
                const active = exclusionsTab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setExclusionsTab(key as 'MARGIN' | 'GENERAL')}
                    style={{
                      padding: '10px 16px',
                      fontSize: 12.5,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      border: 'none',
                      borderBottom: active ? `2px solid ${PRIMARY}` : '2px solid transparent',
                      background: active ? '#fff' : 'transparent',
                      color: active ? PRIMARY : MUTED,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {exclusionsTab === 'MARGIN' ? (
              <div style={{ padding: 14 }}>
                <div style={{ fontSize: 11.5, color: FAINT, marginBottom: 10 }}>
                  Sadece marj raporunu etkiler.
                </div>

                {/* Aktif kurallar */}
                <div style={{ display: 'grid', gap: 6 }}>
                  {activeExclusions.length === 0 ? (
                    <span style={{ fontSize: 12, color: FAINT }}>Aktif dışlama kuralı yok.</span>
                  ) : (
                    activeExclusions.map((exclusion) => (
                      <div
                        key={exclusion.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: MUTED }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: PRIMARY,
                            background: '#eef2f9',
                            border: `1px solid ${LINE}`,
                            borderRadius: 6,
                            padding: '2px 6px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {MARGIN_EXCLUSION_TYPE_LABELS[exclusion.type]}
                        </span>
                        <span
                          style={{
                            color: INK,
                            fontWeight: 500,
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {exclusion.value}
                          {exclusion.label && exclusion.label !== exclusion.value ? ` — ${exclusion.label}` : ''}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteExclusion(exclusion)}
                          disabled={deletingExclusionId === exclusion.id}
                          style={{
                            ...smallBtn,
                            height: 26,
                            padding: '0 10px',
                            color: RED,
                            opacity: deletingExclusionId === exclusion.id ? 0.5 : 1,
                            cursor: deletingExclusionId === exclusion.id ? 'not-allowed' : 'pointer',
                          }}
                        >
                          Sil
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Yeni kural ekleme */}
                <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <select
                      value={exclusionType}
                      onChange={(e) => setExclusionType(e.target.value as MarginExclusionType)}
                      style={{ ...inputStyle, width: 180, cursor: 'pointer' }}
                    >
                      <option value="BRAND">Marka</option>
                      <option value="PRODUCT_CODE">Ürün Kodu</option>
                      <option value="PRODUCT_NAME">Ürün Adı (metin)</option>
                    </select>
                    {exclusionType === 'PRODUCT_NAME' ? (
                      <>
                        <input
                          value={exclusionNameInput}
                          onChange={(e) => setExclusionNameInput(e.target.value)}
                          placeholder="Ürün adında geçen ifade..."
                          style={{ ...inputStyle, flex: 1, minWidth: 220 }}
                        />
                        <button
                          type="button"
                          onClick={handleAddNameExclusion}
                          disabled={savingExclusion}
                          style={{ ...smallBtn, height: 36, opacity: savingExclusion ? 0.6 : 1 }}
                        >
                          Ekle
                        </button>
                      </>
                    ) : (
                      <input
                        value={exclusionSearch}
                        onChange={(e) => setExclusionSearch(e.target.value)}
                        placeholder={exclusionType === 'BRAND' ? 'Marka ara...' : 'Ürün kodu veya adı ara...'}
                        style={{ ...inputStyle, flex: 1, minWidth: 220 }}
                      />
                    )}
                  </div>

                  {exclusionType === 'PRODUCT_NAME' ? (
                    <span style={{ fontSize: 11, color: FAINT }}>Ürün adında geçen ifadeyle eşleşir (kısmi eşleşme).</span>
                  ) : (
                    <div style={{ border: `1px solid ${SOFT_LINE}`, borderRadius: 8, maxHeight: 200, overflowY: 'auto' }}>
                      {exclusionOptionsLoading ? (
                        <div style={{ padding: 10, fontSize: 12, color: FAINT }}>Yükleniyor...</div>
                      ) : exclusionOptions.length === 0 ? (
                        <div style={{ padding: 10, fontSize: 12, color: FAINT }}>Sonuç bulunamadı.</div>
                      ) : (
                        exclusionOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => handleAddExclusionOption(option)}
                            disabled={savingExclusion}
                            style={{
                              display: 'flex',
                              width: '100%',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 8,
                              padding: '8px 10px',
                              border: 'none',
                              borderBottom: `1px solid ${ROW_LINE}`,
                              background: '#fff',
                              fontSize: 12.5,
                              color: INK,
                              cursor: savingExclusion ? 'not-allowed' : 'pointer',
                              textAlign: 'left',
                              fontFamily: 'inherit',
                              opacity: savingExclusion ? 0.6 : 1,
                            }}
                          >
                            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {exclusionType === 'BRAND' ? option.label : `${option.value} — ${option.label}`}
                            </span>
                            {typeof option.productCount === 'number' && (
                              <span style={{ fontSize: 11, color: FAINT, whiteSpace: 'nowrap' }}>
                                {option.productCount} ürün
                              </span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  <span style={{ fontSize: 11, color: FAINT }}>
                    Dışlama eklenince/silinince rapor otomatik yenilenir; geçmiş veri silinmez, kural silinince satırlar geri gelir.
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ padding: 14 }}>
                <div style={{ fontSize: 11.5, color: FAINT, marginBottom: 10 }}>
                  Uçarer satış geçmişi, MinMax v2, top ürünler, müşteri kurtarma gibi satış-istatistiği raporlarını etkiler.
                </div>

                {generalExclusionsForbidden ? (
                  <span style={{ fontSize: 12, color: AMBER, fontWeight: 600 }}>
                    Bu bölümü görüntüleme yetkiniz yok (admin:exclusions).
                  </span>
                ) : (
                  <>
                {/* Yeni genel kural ekleme */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  <select
                    value={generalFormType}
                    onChange={(e) => setGeneralFormType(e.target.value as GeneralExclusionType)}
                    style={{ ...inputStyle, width: 180, cursor: 'pointer' }}
                  >
                    {Object.entries(GENERAL_EXCLUSION_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={generalFormValue}
                    onChange={(e) => setGeneralFormValue(e.target.value)}
                    placeholder={generalFormType === 'PRODUCT_CODE' ? 'Örn: B106430' : 'Değer girin'}
                    style={{ ...inputStyle, flex: 1, minWidth: 180 }}
                  />
                  <input
                    value={generalFormDescription}
                    onChange={(e) => setGeneralFormDescription(e.target.value)}
                    placeholder="Açıklama (opsiyonel)"
                    style={{ ...inputStyle, flex: 1, minWidth: 180 }}
                  />
                  <button
                    type="button"
                    onClick={handleAddGeneralExclusion}
                    disabled={savingGeneralExclusion}
                    style={{ ...smallBtn, height: 36, opacity: savingGeneralExclusion ? 0.6 : 1 }}
                  >
                    Ekle
                  </button>
                </div>

                {/* Kurallar listesi */}
                <div style={{ display: 'grid', gap: 6 }}>
                  {generalExclusionsLoading ? (
                    <span style={{ fontSize: 12, color: FAINT }}>Yükleniyor...</span>
                  ) : generalExclusions.length === 0 ? (
                    <span style={{ fontSize: 12, color: FAINT }}>Genel dışlama kuralı yok.</span>
                  ) : (
                    generalExclusions.map((exclusion) => (
                      <div
                        key={exclusion.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: MUTED }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: PRIMARY,
                            background: '#eef2f9',
                            border: `1px solid ${LINE}`,
                            borderRadius: 6,
                            padding: '2px 6px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {GENERAL_EXCLUSION_TYPE_LABELS[exclusion.type]}
                        </span>
                        <span
                          style={{
                            color: INK,
                            fontWeight: 500,
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {exclusion.value}
                          {exclusion.description ? ` — ${exclusion.description}` : ''}
                        </span>
                        {!exclusion.active && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: FAINT,
                              background: '#f4f6fa',
                              border: '1px solid #e3e8f0',
                              borderRadius: 999,
                              padding: '2px 8px',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Pasif
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteGeneralExclusion(exclusion)}
                          disabled={deletingGeneralExclusionId === exclusion.id}
                          style={{
                            ...smallBtn,
                            height: 26,
                            padding: '0 10px',
                            color: RED,
                            opacity: deletingGeneralExclusionId === exclusion.id ? 0.5 : 1,
                            cursor: deletingGeneralExclusionId === exclusion.id ? 'not-allowed' : 'pointer',
                          }}
                        >
                          Sil
                        </button>
                      </div>
                    ))
                  )}
                </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Kolonlar (goster/gizle + mail kolonlari kaydet) */}
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: MUTED }}>
            Kolonlar ({visibleColumns.length}/{columnDefs.length})
          </summary>
          <div
            style={{
              marginTop: 12,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
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
              style={{ ...smallBtn, opacity: savingEmailColumns ? 0.6 : 1 }}
            >
              Mail Excel Kolonlarını Kaydet
            </button>
            <span style={{ fontSize: 11, color: FAINT }}>
              Kayıtlı mail kolonları: {emailColumnIds.length > 0 ? emailColumnIds.length : 'Varsayılan'}
            </span>
          </div>
          <p style={{ marginTop: 8, fontSize: 11, color: FAINT }}>En az bir kolon seçili olmalı.</p>
        </details>
      </div>

      {/* Data Table */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${SOFT_LINE}` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>Kâr Marjı Detayları</div>
          {metadata && (
            <div style={{ fontSize: 11.5, color: FAINT, marginTop: 2 }}>
              Rapor Tarihi: {formatDate(metadata.reportDate)} | Tarih Aralığı: {metadata.startDate} - {metadata.endDate}
            </div>
          )}
          {excludedByUserRules > 0 && (
            <div style={{ fontSize: 11.5, color: AMBER, marginTop: 4 }}>
              Dışlama kurallarınız bu aralıkta {formatCount(excludedByUserRules)} satırı rapordan düşürdü.
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
            <AlertCircle size={32} strokeWidth={2} style={{ margin: '0 auto 16px', color: RED, display: 'block' }} />
            <p style={{ color: RED, margin: 0, fontWeight: 500 }}>{error}</p>
            <button type="button" onClick={fetchData} style={{ ...headBtn, margin: '16px auto 0' }}>
              Tekrar Dene
            </button>
          </div>
        ) : filteredData.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Package size={32} strokeWidth={2} style={{ margin: '0 auto 16px', color: FAINT, display: 'block' }} />
            <p style={{ color: MUTED, margin: 0 }}>Veri bulunamadı</p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: Math.max(960, visibleColumnDefs.length * 130) }}>
                {/* Header row (dinamik kolon) */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: detailGrid(visibleColumnDefs.length),
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
                  {visibleColumnDefs.map((column) => {
                    const isRight = (column.headerClassName || '').includes('text-right');
                    return (
                      <span key={column.id} style={isRight ? cellRight : undefined}>
                        {column.label}
                      </span>
                    );
                  })}
                </div>

                {/* Rows */}
                {filteredData.map((row, idx) => (
                  <div
                    key={`${row.msg_S_0089}-${row.msg_S_0001}-${idx}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: detailGrid(visibleColumnDefs.length),
                      gap: 10,
                      padding: '12px 16px',
                      borderTop: `1px solid ${ROW_LINE}`,
                      fontSize: 11.5,
                      color: INK,
                      alignItems: 'center',
                    }}
                  >
                    {visibleColumnDefs.map((column) => {
                      const cn = column.cellClassName || '';
                      const isRight = cn.includes('text-right');
                      const isMono = cn.includes('font-mono');
                      const isSemibold = cn.includes('font-semibold');
                      const isTruncate = cn.includes('truncate');
                      return (
                        <span
                          key={column.id}
                          style={{
                            textAlign: isRight ? 'right' : undefined,
                            fontFamily: isMono ? "'Roboto Mono', monospace" : undefined,
                            fontSize: isMono ? 11 : undefined,
                            fontWeight: isSemibold ? 600 : undefined,
                            color: isMono ? MUTED : undefined,
                            whiteSpace: isTruncate ? 'nowrap' : undefined,
                            overflow: isTruncate ? 'hidden' : undefined,
                            textOverflow: isTruncate ? 'ellipsis' : undefined,
                            minWidth: 0,
                          }}
                        >
                          {column.render(row)}
                        </span>
                      );
                    })}
                  </div>
                ))}
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
                    style={{ ...headBtn, opacity: page === 1 ? 0.5 : 1, cursor: page === 1 ? 'not-allowed' : 'pointer' }}
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
