'use client';

import { useState } from 'react';
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
import { adminApi } from '@/lib/api/admin';
import ExclusionCombobox, { type ExclusionSuggestion } from './ExclusionCombobox';

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
    sectorFilter,
    setSectorFilter,
    groupFilter,
    setGroupFilter,
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
    savingExclusion,
    deletingExclusionId,
    createExclusion,
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
    generalFormDescription,
    setGeneralFormDescription,
    savingGeneralExclusion,
    deletingGeneralExclusionId,
    createGeneralExclusion,
    handleDeleteGeneralExclusion,
    syncingReport,
    sendingReportEmail,
    isSingleDate,
    columnDefs,
    visibleColumnDefs,
    filteredData,
    fetchData,
    handleSearch,
    handleSectorSummaryClick,
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

  // ---- Dislama combobox'lari (serbest metin + oneri) icin lokal input state ----
  const [marginInput, setMarginInput] = useState('');
  const [generalInput, setGeneralInput] = useState('');

  // Marj tab oneri kaynagi: BRAND -> marka listesi (productCount); PRODUCT_CODE/PRODUCT_NAME -> urun listesi.
  const fetchMarginSuggestions = async (search: string): Promise<ExclusionSuggestion[]> => {
    const optionType = exclusionType === 'BRAND' ? 'BRAND' : 'PRODUCT';
    const result = await adminApi.getMarginExclusionOptions({ type: optionType, search: search || undefined });
    const options = Array.isArray(result.data) ? result.data : [];
    if (optionType === 'BRAND') {
      return options.map((option) => ({
        value: option.value,
        label: option.label || option.value,
        meta: typeof option.productCount === 'number' ? `${option.productCount} urun` : null,
      }));
    }
    // PRODUCT: value = stok kodu, label = stok adi
    return options.map((option) => ({
      value: option.value,
      label: `${option.value} — ${option.label}`,
      meta: null,
      // ham urun adi label kaydinda kullanilacak (asagida onSelect'te ayristiriyoruz)
    }));
  };

  // Marj tab secim: BRAND ve PRODUCT_CODE deger=kod; PRODUCT_NAME deger=urun adi.
  const handleSelectMarginSuggestion = (suggestion: ExclusionSuggestion) => {
    if (exclusionType === 'BRAND') {
      createExclusion({
        type: 'BRAND',
        value: suggestion.value,
        label: suggestion.label && suggestion.label !== suggestion.value ? suggestion.label : undefined,
      });
    } else if (exclusionType === 'PRODUCT_CODE') {
      // suggestion.label = "{kod} — {ad}"; urun adini label olarak sakla.
      const namePart = suggestion.label.includes(' — ')
        ? suggestion.label.split(' — ').slice(1).join(' — ')
        : suggestion.label;
      createExclusion({
        type: 'PRODUCT_CODE',
        value: suggestion.value,
        label: namePart && namePart !== suggestion.value ? namePart : undefined,
      });
    } else {
      // PRODUCT_NAME: deger = urun adi (kod degil)
      const namePart = suggestion.label.includes(' — ')
        ? suggestion.label.split(' — ').slice(1).join(' — ')
        : suggestion.label;
      createExclusion({ type: 'PRODUCT_NAME', value: namePart || suggestion.value });
    }
    setMarginInput('');
  };

  // Marj tab serbest metin (oneri secmeden): PRODUCT_NAME serbest ifade, digerleri kod olarak eklenir.
  const handleSubmitMarginFreeText = (text: string) => {
    if (exclusionType === 'BRAND') {
      createExclusion({ type: 'BRAND', value: text });
    } else if (exclusionType === 'PRODUCT_CODE') {
      createExclusion({ type: 'PRODUCT_CODE', value: text.toUpperCase() });
    } else {
      createExclusion({ type: 'PRODUCT_NAME', value: text });
    }
    setMarginInput('');
  };

  // Genel tab oneri kaynagi: urun tipleri -> urun listesi; cari tipleri -> cari listesi; sektor -> serbest.
  const fetchGeneralSuggestions = async (search: string): Promise<ExclusionSuggestion[]> => {
    if (generalFormType === 'PRODUCT_CODE' || generalFormType === 'PRODUCT_NAME') {
      const result = await adminApi.getMarginExclusionOptions({ type: 'PRODUCT', search: search || undefined });
      const options = Array.isArray(result.data) ? result.data : [];
      return options.map((option) => ({
        value: option.value,
        label: `${option.value} — ${option.label}`,
        meta: null,
      }));
    }
    if (generalFormType === 'CUSTOMER_CODE' || generalFormType === 'CUSTOMER_NAME') {
      // Mevcut getCustomers imzasi: { search, pageSize } -> { customers }
      const result = await adminApi.getCustomers({ search: search || undefined, pageSize: 10 });
      const customers = Array.isArray(result.customers) ? result.customers : [];
      return customers.map((customer: any) => ({
        value: String(customer.mikroCariCode || customer.mikroCode || ''),
        label: `${customer.mikroCariCode || customer.mikroCode || ''} — ${customer.companyName || customer.name || ''}`,
        meta: null,
      }));
    }
    // SECTOR_CODE: serbest metin, oneri yok
    return [];
  };

  // Genel tab secim: urun -> stok kodu/adi; cari -> cari kodu/adi.
  const handleSelectGeneralSuggestion = (suggestion: ExclusionSuggestion) => {
    const namePart = suggestion.label.includes(' — ')
      ? suggestion.label.split(' — ').slice(1).join(' — ')
      : suggestion.label;
    if (generalFormType === 'PRODUCT_NAME' || generalFormType === 'CUSTOMER_NAME') {
      createGeneralExclusion(generalFormType, namePart || suggestion.value, generalFormDescription);
    } else {
      // PRODUCT_CODE / CUSTOMER_CODE -> kod
      createGeneralExclusion(generalFormType, suggestion.value, generalFormDescription);
    }
    setGeneralInput('');
  };

  const handleSubmitGeneralFreeText = (text: string) => {
    createGeneralExclusion(generalFormType, text, generalFormDescription);
    setGeneralInput('');
  };

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
          <Link href="/margin-violations" style={{ ...headBtn, textDecoration: 'none', color: PRIMARY }}>
            <AlertCircle size={15} strokeWidth={2} />
            Marj Aksiyon Merkezi
          </Link>
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
                <table style={{ width: '100%', minWidth: 1120, borderCollapse: 'collapse', fontSize: 11.5 }}>
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
                        colSpan={6}
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
                        colSpan={6}
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
                      {['Ciro', 'Kâr (Güncel)', 'Kâr % (Güncel)', 'Güncel Zarar', 'SÖ Zarar', 'Zararlı Evrak'].map((h, i) => (
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
                      {['Ciro', 'Kâr (Güncel)', 'Kâr % (Güncel)', 'Güncel Zarar', 'SÖ Zarar', 'Zararlı Evrak'].map((h, i) => (
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
                      <tr
                        key={entry.sectorCode}
                        onClick={() => handleSectorSummaryClick(entry.sectorCode)}
                        title="Bu sektoru detay tablosunda filtrele"
                        style={{ borderTop: `1px solid ${ROW_LINE}`, cursor: 'pointer' }}
                      >
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
                          {formatCount(entry.orderSummary.negativeLines)}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: INK }}>
                          {formatCount(entry.orderSummary.entryNegativeLines)}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: INK }}>
                          {formatCount(entry.orderSummary.negativeDocuments)}
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
                          {formatCount(entry.salesSummary.negativeLines)}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: INK }}>
                          {formatCount(entry.salesSummary.entryNegativeLines)}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: INK }}>
                          {formatCount(entry.salesSummary.negativeDocuments)}
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
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
              <option value="HIGH">Yüksek Kar (&gt;{metadata?.thresholds?.high ?? 70}%)</option>
              <option value="OK">Normal Kar ({metadata?.thresholds?.low ?? 5}-{metadata?.thresholds?.high ?? 70}%)</option>
              <option value="LOW">Düşük Kar (&lt;{metadata?.thresholds?.low ?? 5}%)</option>
              <option value="NEGATIVE">Zarar (&lt;0%)</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Sektör</label>
            <input
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              placeholder="Sektör kodu"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Grup</label>
            <input
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              placeholder="Grup kodu"
              style={inputStyle}
            />
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

                {/* Yeni kural ekleme — tip secimi + inline combobox (serbest metin + oneri) */}
                <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <select
                      value={exclusionType}
                      onChange={(e) => {
                        setExclusionType(e.target.value as MarginExclusionType);
                        setMarginInput('');
                      }}
                      style={{ ...inputStyle, width: 180, cursor: 'pointer' }}
                    >
                      <option value="BRAND">Marka</option>
                      <option value="PRODUCT_CODE">Ürün Kodu</option>
                      <option value="PRODUCT_NAME">Ürün Adı (metin)</option>
                    </select>
                    <ExclusionCombobox
                      value={marginInput}
                      onChange={setMarginInput}
                      disabled={savingExclusion}
                      refetchKey={exclusionType}
                      placeholder={
                        exclusionType === 'BRAND'
                          ? 'Marka ara veya yaz...'
                          : exclusionType === 'PRODUCT_CODE'
                          ? 'Ürün kodu/adı ara...'
                          : 'Ürün adında geçen ifade ara/yaz...'
                      }
                      fetchSuggestions={fetchMarginSuggestions}
                      onSelect={handleSelectMarginSuggestion}
                      onSubmitFreeText={handleSubmitMarginFreeText}
                    />
                  </div>
                  <span style={{ fontSize: 11, color: FAINT }}>
                    Öneriden seçebilir veya serbest metin yazıp Enter'a basabilirsiniz. Dışlama eklenince/silinince rapor
                    otomatik yenilenir; geçmiş veri silinmez, kural silinince satırlar geri gelir.
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
                {/* Yeni genel kural ekleme — tip + inline combobox (urun/cari oneri, sektor serbest) */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-start' }}>
                  <select
                    value={generalFormType}
                    onChange={(e) => {
                      setGeneralFormType(e.target.value as GeneralExclusionType);
                      setGeneralInput('');
                    }}
                    style={{ ...inputStyle, width: 180, cursor: 'pointer' }}
                  >
                    {Object.entries(GENERAL_EXCLUSION_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <ExclusionCombobox
                    value={generalInput}
                    onChange={setGeneralInput}
                    disabled={savingGeneralExclusion}
                    refetchKey={generalFormType}
                    minWidth={180}
                    placeholder={
                      generalFormType === 'PRODUCT_CODE'
                        ? 'Ürün kodu/adı ara... (örn: B106430)'
                        : generalFormType === 'PRODUCT_NAME'
                        ? 'Ürün adı ara...'
                        : generalFormType === 'CUSTOMER_CODE'
                        ? 'Cari kodu/adı ara...'
                        : generalFormType === 'CUSTOMER_NAME'
                        ? 'Cari adı ara...'
                        : 'Sektör kodu yazıp Enter...'
                    }
                    fetchSuggestions={fetchGeneralSuggestions}
                    onSelect={handleSelectGeneralSuggestion}
                    onSubmitFreeText={handleSubmitGeneralFreeText}
                  />
                  <input
                    value={generalFormDescription}
                    onChange={(e) => setGeneralFormDescription(e.target.value)}
                    placeholder="Açıklama (opsiyonel)"
                    style={{ ...inputStyle, flex: 1, minWidth: 180 }}
                  />
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
                          {exclusion.resolvedLabel ? ` — ${exclusion.resolvedLabel}` : ''}
                          {exclusion.description ? ` (${exclusion.description})` : ''}
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
