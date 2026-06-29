'use client';

import React from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency } from '@/lib/utils/format';
import {
  ChevronRight,
  ArrowUpDown,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  Eye,
  FileText,
  Filter,
  MessageSquare,
  RefreshCw,
  Save,
  Search,
  TrendingDown,
  Users,
} from 'lucide-react';
import {
  useCariGeriKazanim,
  riskTypeLabels,
  developmentLabels,
  scenarioPresets,
  safeDate,
  monthLabel,
  percent,
  toDateInputValue,
  PAGE_SIZE,
  type SortBy,
  type SortDirection,
  type HistoricalSortBy,
  type SeasonalityMode,
  type CustomerRecoveryRiskType,
  type CustomerRecoveryPurchasePattern,
  type CustomerRecoveryHistoricalValueData,
  type HistoricalFilterState,
  type CustomerRecoveryRow,
} from './useCariGeriKazanim';

/**
 * Yeni gorunum: Cari Geri Kazanim raporu.
 * Tum mantik useCariGeriKazanim hook'undan gelir; hicbir handler/kolon/filtre/ozet/
 * sekme/satir-aksiyon (Detay/openDetail, Excel, Bana atananlar, toplu takip, aksiyon
 * formu+gecmisi, historical tablosu) dusurulmemistir.
 *
 * Tasarim referansi: design HTML #scr-recov (data-screen-label="Cari Geri Kazanım")
 * + brief 4.11.7. Genel rapor stili: beyaz kart #fff / border #e7ebf2 / radius 12px;
 * koyu gradient hero; tablo basligi #fafbfd; primary #15356b; ink #14223b/#51607a/#8b97ac;
 * emerald/amber/red; risk rozetleri renk kodlu; EMOJI YOK; lucide ikon.
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
const BLUE = '#1d4ed8';

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

const primaryBtn: React.CSSProperties = {
  ...headBtn,
  background: PRIMARY,
  color: '#fff',
  border: 'none',
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
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: FAINT,
  display: 'block',
  marginBottom: 4,
  fontWeight: 500,
};

const textAreaStyle: React.CSSProperties = {
  width: '100%',
  border: `1px solid #e3e8f0`,
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 12.5,
  color: INK,
  fontFamily: 'inherit',
  outline: 'none',
  background: '#fff',
  boxSizing: 'border-box',
  resize: 'vertical',
};

const cellRight: React.CSSProperties = { textAlign: 'right' };
const cellCenter: React.CSSProperties = { textAlign: 'center' };
const mono: React.CSSProperties = { fontFamily: "'Roboto Mono', monospace" };

// Risk rozet stilleri (Classic ile ayni renk semantigi: NO_RECENT kirmizi / INSIGNIFICANT
// turuncu / DECLINING amber / WATCH mavi)
const riskBadgeStyle: Record<CustomerRecoveryRiskType, React.CSSProperties> = {
  NO_RECENT_SALES: { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' },
  INSIGNIFICANT_ACTIVITY: { background: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c' },
  DECLINING: { background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309' },
  WATCH: { background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8' },
};

// Gelisme rozet stilleri (Classic ile ayni)
const developmentBadgeStyle: Record<CustomerRecoveryRow['developmentStatus'], React.CSSProperties> = {
  RECOVERED: { background: '#ecfdf5', color: '#047857' },
  IMPROVED: { background: '#eff6ff', color: '#1d4ed8' },
  UNCHANGED: { background: '#f1f5f9', color: '#475569' },
  WORSENED: { background: '#fef2f2', color: '#b91c1c' },
  NO_ACTION: { background: '#f8fafc', color: '#64748b' },
};

const pill = (extra: React.CSSProperties): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 999,
  padding: '2px 9px',
  fontSize: 10.5,
  fontWeight: 600,
  ...extra,
});

// Ana tablo grid: [sec] | Cari | Risk | Gecmis ort | Son ort | Dusme | Kayip |
// Kayip kategori | Son alim | Onerilen aksiyon | Takip | Detay
const MAIN_GRID =
  '34px 1.6fr 1.25fr 1fr 1fr 0.9fr 1fr 1.2fr 1.2fr 1.4fr 1.2fr 96px';

// Historical tablo grid: Cari | Durum | Son aktif ay | Ardisik | En yuksek ay |
// Nominal toplam | Bugunku deger | Tahmini kayip | En degerli aylar
const HIST_GRID = '1.6fr 1.1fr 1.2fr 1.2fr 1.2fr 1fr 1fr 1fr 1.6fr';

function MetricCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div style={{ ...cardStyle, padding: 14 }}>
      <div style={{ fontSize: 11.5, color: FAINT }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 600, color: accent || INK, marginTop: 5 }}>{value}</div>
    </div>
  );
}

function SortHead({
  label,
  sortBy,
  activeSort,
  onSort,
  align = 'left',
}: {
  label: string;
  sortBy: SortBy;
  activeSort: { sortBy: SortBy; sortDirection: SortDirection };
  onSort: (sortBy: SortBy) => void;
  align?: 'left' | 'right';
}) {
  const active = activeSort.sortBy === sortBy;
  return (
    <span
      onClick={() => onSort(sortBy)}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
      }}
    >
      {label}
      <ArrowUpDown size={11} strokeWidth={2} style={{ color: active ? EMERALD : '#c2cad6' }} />
      {active && (
        <span style={{ fontSize: 8.5, color: EMERALD }}>{activeSort.sortDirection === 'asc' ? 'A' : 'Z'}</span>
      )}
    </span>
  );
}

function HistSortHead({
  label,
  sortBy,
  activeSort,
  onSort,
  align = 'left',
}: {
  label: string;
  sortBy: HistoricalSortBy;
  activeSort: { sortBy: HistoricalSortBy; sortDirection: SortDirection };
  onSort: (sortBy: HistoricalSortBy) => void;
  align?: 'left' | 'right';
}) {
  const active = activeSort.sortBy === sortBy;
  return (
    <span
      onClick={() => onSort(sortBy)}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
      }}
    >
      {label}
      <ArrowUpDown size={11} strokeWidth={2} style={{ color: active ? EMERALD : '#c2cad6' }} />
      {active && (
        <span style={{ fontSize: 8.5, color: EMERALD }}>{activeSort.sortDirection === 'asc' ? 'A' : 'Z'}</span>
      )}
    </span>
  );
}

function NewLabeledInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </div>
  );
}

export default function CariGeriKazanimNew() {
  const {
    activeView,
    setActiveView,
    filters,
    summary,
    metadata,
    page,
    setPage,
    loading,
    exporting,
    selectedCodes,
    detailRow,
    setDetailRow,
    detail,
    setDetail,
    detailLoading,
    actionSaving,
    actionForm,
    setActionForm,
    actionUpdateDrafts,
    setActionUpdateDrafts,
    actionUpdateSavingId,
    bulkAssignedToId,
    setBulkAssignedToId,
    bulkFollowUpDate,
    setBulkFollowUpDate,
    bulkNote,
    setBulkNote,
    bulkSaving,
    selectedScenario,
    showManualSettings,
    setShowManualSettings,
    clientSort,
    historicalFilters,
    submittedHistoricalFilters,
    historicalData,
    historicalPage,
    setHistoricalPage,
    historicalLoading,
    historicalExporting,
    setSubmittedFilters,
    assignmentOptions,
    displayRows,
    pagination,
    visibleRows,
    updateFilter,
    updateHistoricalFilter,
    runReport,
    runHistoricalReport,
    applyScenario,
    toggleRisk,
    toggleRow,
    toggleCurrentPage,
    openDetail,
    saveAction,
    completeAction,
    updateActionDraft,
    saveActionUpdate,
    bulkAssign,
    exportReport,
    sort,
    sortHistorical,
    exportHistoricalReport,
  } = useCariGeriKazanim();

  const allVisibleSelected =
    visibleRows.length > 0 && visibleRows.every((row) => selectedCodes.includes(row.customerCode));

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto', padding: 24 }}>
      {/* Hero */}
      <div
        style={{
          background: 'linear-gradient(120deg,#0c2247,#15356b)',
          borderRadius: 16,
          padding: 22,
          marginBottom: 16,
          color: '#fff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#9bb0d4', marginBottom: 10 }}>
          <Link href="/reports" style={{ color: '#9bb0d4', textDecoration: 'none' }}>
            Raporlar
          </Link>
          <ChevronRight size={13} strokeWidth={2} />
          <span>Cari Geri Kazanım</span>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.02em', margin: 0 }}>Cari Geri Kazanım</h1>
        <div style={{ fontSize: 13, color: '#9bb0d4', marginTop: 6, maxWidth: 760 }}>
          Son dönem satışı duran, anlamsız düşen veya aktif ay ortalamasının altına inen carileri bulur; not, takip
          tarihi, temsilci ataması ve gelişme durumuyla izler.
        </div>
        <div style={{ display: 'flex', gap: 30, flexWrap: 'wrap', marginTop: 18 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{summary?.totalCustomers ?? 0}</div>
            <div style={{ fontSize: 11.5, color: '#9bb0d4' }}>Riskli Cari</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fca5a5' }}>{formatCurrency(summary?.totalLostPotential || 0)}</div>
            <div style={{ fontSize: 11.5, color: '#9bb0d4' }}>Kayıp Potansiyel</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{summary?.noActionCount ?? 0}</div>
            <div style={{ fontSize: 11.5, color: '#9bb0d4' }}>Aksiyon Yok</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fbbf24' }}>{summary?.dueFollowUpCount ?? 0}</div>
            <div style={{ fontSize: 11.5, color: '#9bb0d4' }}>Geciken Takip</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#93c5fd' }}>{summary?.seasonalCount ?? 0}</div>
            <div style={{ fontSize: 11.5, color: '#9bb0d4' }}>Dönemsel</div>
          </div>
        </div>
      </div>

      {/* Sekmeler */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setActiveView('recovery')}
          style={{
            ...cardStyle,
            textAlign: 'left',
            padding: '14px 18px',
            cursor: 'pointer',
            background: activeView === 'recovery' ? PRIMARY : '#fff',
            border: activeView === 'recovery' ? 'none' : `1px solid ${LINE}`,
            color: activeView === 'recovery' ? '#fff' : INK,
            fontFamily: 'inherit',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600 }}>Kayıp cari analizi</div>
          <div style={{ fontSize: 11.5, marginTop: 3, color: activeView === 'recovery' ? 'rgba(255,255,255,.72)' : FAINT }}>
            Son dönem düşen, duran ve aksiyon bekleyen cariler.
          </div>
        </button>
        <button
          type="button"
          onClick={() => setActiveView('historicalValue')}
          style={{
            ...cardStyle,
            textAlign: 'left',
            padding: '14px 18px',
            cursor: 'pointer',
            background: activeView === 'historicalValue' ? EMERALD : '#fff',
            border: activeView === 'historicalValue' ? 'none' : `1px solid ${LINE}`,
            color: activeView === 'historicalValue' ? '#fff' : INK,
            fontFamily: 'inherit',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600 }}>2020 bugünkü değer analizi</div>
          <div style={{ fontSize: 11.5, marginTop: 3, color: activeView === 'historicalValue' ? 'rgba(255,255,255,.78)' : FAINT }}>
            Eski satışları USD/TL oranına göre bugünkü TL karşılığına çevirir.
          </div>
        </button>
      </div>

      {activeView === 'recovery' ? (
        <>
          {/* Senaryolar kart */}
          <div style={{ ...cardStyle, marginBottom: 16, overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 14,
                flexWrap: 'wrap',
                padding: '15px 18px',
                borderBottom: `1px solid ${SOFT_LINE}`,
                background: '#fafdfb',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 15, fontWeight: 600, color: INK }}>
                  <Filter size={16} strokeWidth={2} style={{ color: EMERALD }} />
                  Hazır senaryolar
                </div>
                <div style={{ fontSize: 12, color: FAINT, marginTop: 3 }}>
                  Teknik alan doldurmadan raporu çalıştırın. İsterseniz manuel detaylı ayarları açabilirsiniz.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Link href="/reports/customer-recovery/actions" style={{ textDecoration: 'none' }}>
                  <span style={headBtn}>
                    <ClipboardCheck size={15} strokeWidth={2} />
                    Bana atananlar
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={exportReport}
                  disabled={exporting}
                  style={{ ...headBtn, opacity: exporting ? 0.7 : 1, cursor: exporting ? 'not-allowed' : 'pointer' }}
                >
                  {exporting ? <RefreshCw size={15} strokeWidth={2} className="animate-spin" /> : <Download size={15} strokeWidth={2} />}
                  Excel
                </button>
                <button
                  type="button"
                  onClick={runReport}
                  disabled={loading}
                  style={{ ...primaryBtn, opacity: loading ? 0.75 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
                >
                  {loading ? <RefreshCw size={15} strokeWidth={2} className="animate-spin" /> : <RefreshCw size={15} strokeWidth={2} />}
                  Raporu çalıştır
                </button>
              </div>
            </div>

            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Senaryo presetleri */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {scenarioPresets.map((scenario) => {
                  const active = selectedScenario === scenario.id;
                  return (
                    <button
                      key={scenario.id}
                      type="button"
                      onClick={() => applyScenario(scenario.id)}
                      style={{
                        textAlign: 'left',
                        borderRadius: 11,
                        padding: 14,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        border: active ? '1px solid #6ee7b7' : `1px solid ${LINE}`,
                        background: active ? '#ecfdf5' : '#fff',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontWeight: 600, color: INK, fontSize: 13 }}>{scenario.title}</span>
                        {active && <span style={pill({ background: '#d1fae5', color: EMERALD })}>Seçili</span>}
                      </div>
                      <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.5, color: MUTED }}>{scenario.description}</p>
                      <p style={{ margin: '10px 0 0', fontSize: 11, fontWeight: 500, color: EMERALD }}>{scenario.helper}</p>
                    </button>
                  );
                })}
              </div>

              {/* Bilgi kutusu */}
              <div
                style={{
                  borderRadius: 10,
                  border: '1px solid #a7f3d0',
                  background: '#ecfdf5',
                  padding: 12,
                  fontSize: 12,
                  color: '#065f46',
                  lineHeight: 1.5,
                }}
              >
                Bu ayarlarla son {filters.recentMonths} ay, önceki {filters.baselineMonths} aylık aktif satış
                ortalamasıyla karşılaştırılır. Geçmişe göre en az %{filters.minDropPercent} düşen veya son dönemde
                hareketi duran cariler listelenir.
              </div>

              {/* Filtreler */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
                <NewLabeledInput label="Sektör kodu" value={filters.sectorCode} onChange={(v) => updateFilter('sectorCode', v.toUpperCase())} />
                <div>
                  <label style={labelStyle}>Temsilci / takip sahibi</label>
                  <select value={filters.assignedToId} onChange={(e) => updateFilter('assignedToId', e.target.value)} style={selectStyle}>
                    <option value="">Tümü</option>
                    {assignmentOptions.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name || member.email || member.id}
                      </option>
                    ))}
                  </select>
                </div>
                <NewLabeledInput label="Min. tahmini kayıp" value={filters.minLostPotential} onChange={(v) => updateFilter('minLostPotential', v)} />
                <div>
                  <label style={labelStyle}>Dönemsel cariler</label>
                  <select value={filters.seasonalityMode} onChange={(e) => updateFilter('seasonalityMode', e.target.value as SeasonalityMode)} style={selectStyle}>
                    <option value="include">Dahil et</option>
                    <option value="exclude">Normal ritimdekileri ayır</option>
                    <option value="only">Sadece dönemsel</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Alım ritmi</label>
                  <select value={filters.purchasePattern} onChange={(e) => updateFilter('purchasePattern', e.target.value as CustomerRecoveryPurchasePattern)} style={selectStyle}>
                    <option value="ALL">Tümü</option>
                    <option value="FREQUENT">Sık alırken duranlar</option>
                    <option value="PERIODIC">Dönemsel / ihale</option>
                    <option value="SPORADIC">Seyrek / belirsiz</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Sırala</label>
                  <select
                    value={`${filters.sortBy}:${filters.sortDirection}`}
                    onChange={(e) => {
                      const [sortBy, sortDirection] = e.target.value.split(':') as [SortBy, SortDirection];
                      updateFilter('sortBy', sortBy);
                      updateFilter('sortDirection', sortDirection);
                    }}
                    style={selectStyle}
                  >
                    <option value="riskScore:desc">Risk skoru yüksek</option>
                    <option value="lostPotential:desc">Kayıp potansiyel yüksek</option>
                    <option value="dropPercent:desc">Düşme oranı yüksek</option>
                    <option value="lastSaleDate:asc">Son satış en eski</option>
                    <option value="customerName:asc">Cari adı A-Z</option>
                  </select>
                </div>
              </div>

              {/* Checkboxlar + manuel toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <label style={pill({ border: `1px solid ${LINE}`, background: '#fff', color: MUTED, gap: 7, padding: '6px 11px', fontSize: 12, cursor: 'pointer' })}>
                  <input type="checkbox" style={{ accentColor: PRIMARY }} checked={filters.onlyWithOpenAction} onChange={(e) => updateFilter('onlyWithOpenAction', e.target.checked)} />
                  Sadece açık aksiyon
                </label>
                <label style={pill({ border: `1px solid ${LINE}`, background: '#fff', color: MUTED, gap: 7, padding: '6px 11px', fontSize: 12, cursor: 'pointer' })}>
                  <input type="checkbox" style={{ accentColor: PRIMARY }} checked={filters.onlyDueFollowUp} onChange={(e) => updateFilter('onlyDueFollowUp', e.target.checked)} />
                  Sadece geciken takip
                </label>
                <label style={pill({ border: `1px solid ${LINE}`, background: '#fff', color: MUTED, gap: 7, padding: '6px 11px', fontSize: 12, cursor: 'pointer' })}>
                  <input type="checkbox" style={{ accentColor: PRIMARY }} checked={filters.includeCurrentMonth} onChange={(e) => updateFilter('includeCurrentMonth', e.target.checked)} />
                  Bu ayı dahil et
                </label>
                <button
                  type="button"
                  onClick={() => setShowManualSettings((value) => !value)}
                  style={{ ...headBtn, height: 32, border: 'none', background: 'transparent', color: PRIMARY }}
                >
                  {showManualSettings ? 'Manuel ayarları gizle' : 'Detaylı manuel çalıştır'}
                </button>
              </div>

              {showManualSettings && (
                <div style={{ borderRadius: 11, border: `1px dashed #cbd5e1`, background: '#f8fafc', padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
                    <NewLabeledInput label="Son dönem ay" value={filters.recentMonths} onChange={(v) => updateFilter('recentMonths', v)} />
                    <NewLabeledInput label="Geçmiş baz ay" value={filters.baselineMonths} onChange={(v) => updateFilter('baselineMonths', v)} />
                    <NewLabeledInput label="Düşme yüzdesi" value={filters.minDropPercent} onChange={(v) => updateFilter('minDropPercent', v)} />
                    <NewLabeledInput label="Min aktif ay" value={filters.minHistoricalActiveMonths} onChange={(v) => updateFilter('minHistoricalActiveMonths', v)} />
                    <NewLabeledInput label="Min geçmiş ciro" value={filters.minHistoricalAmount} onChange={(v) => updateFilter('minHistoricalAmount', v)} />
                    <NewLabeledInput label="Anlamlı ay ciro" value={filters.minMeaningfulMonthlyAmount} onChange={(v) => updateFilter('minMeaningfulMonthlyAmount', v)} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {(Object.keys(riskTypeLabels) as CustomerRecoveryRiskType[]).map((riskType) => {
                      const active = filters.riskTypes.includes(riskType);
                      const rb = riskBadgeStyle[riskType];
                      return (
                        <button
                          key={riskType}
                          type="button"
                          onClick={() => toggleRisk(riskType)}
                          style={{
                            borderRadius: 999,
                            padding: '6px 12px',
                            fontSize: 12,
                            fontWeight: 500,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            ...(active
                              ? rb
                              : { border: `1px solid ${LINE}`, background: '#fff', color: FAINT }),
                          }}
                        >
                          {riskTypeLabels[riskType]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Ana grid: tablo + sag kolon */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 16, alignItems: 'start' }}>
            {/* Riskli cariler tablosu */}
            <div style={{ ...cardStyle, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${SOFT_LINE}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: INK }}>Riskli cariler</div>
                    <div style={{ fontSize: 12, color: FAINT, marginTop: 3 }}>
                      {metadata ? `${metadata.baselineStartDate} - ${metadata.reportEndDate} aralığı incelendi` : 'Rapor yükleniyor'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={pill({ border: `1px solid ${LINE}`, background: '#fff', color: MUTED, padding: '4px 10px', fontSize: 11 })}>{pagination.totalRecords} kayıt</span>
                    <span style={pill({ border: `1px solid ${LINE}`, background: '#fff', color: MUTED, padding: '4px 10px', fontSize: 11 })}>Sayfa {pagination.page || page} / {pagination.totalPages || 0}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
                    <Search size={15} strokeWidth={2} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: FAINT, pointerEvents: 'none' }} />
                    <input
                      value={filters.resultSearch}
                      onChange={(e) => updateFilter('resultSearch', e.target.value)}
                      placeholder="Rapor sonucu içinde cari kodu, cari adı, şehir veya sektör ara..."
                      style={{ ...inputStyle, paddingLeft: 34 }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') runReport();
                      }}
                    />
                  </div>
                  <button type="button" onClick={runReport} disabled={loading} style={{ ...headBtn, opacity: loading ? 0.7 : 1 }}>
                    Sonuçta ara
                  </button>
                  {filters.resultSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        updateFilter('resultSearch', '');
                        setSubmittedFilters((previous) => ({ ...previous, resultSearch: '' }));
                        setPage(1);
                      }}
                      style={{ ...headBtn, border: 'none', background: 'transparent', color: MUTED }}
                    >
                      Temizle
                    </button>
                  )}
                </div>
              </div>

              <div style={{ overflowX: 'auto', maxHeight: 720, overflowY: 'auto' }}>
                <div style={{ minWidth: 1240 }}>
                  {/* Header */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: MAIN_GRID,
                      gap: 10,
                      padding: '11px 16px',
                      background: TABLE_HEAD_BG,
                      borderBottom: `1px solid ${SOFT_LINE}`,
                      fontSize: 10,
                      fontWeight: 600,
                      color: FAINT,
                      textTransform: 'uppercase',
                      alignItems: 'center',
                      position: 'sticky',
                      top: 0,
                      zIndex: 1,
                    }}
                  >
                    <input type="checkbox" style={{ accentColor: PRIMARY }} checked={allVisibleSelected} onChange={toggleCurrentPage} />
                    <span>Cari</span>
                    <SortHead label="Risk" sortBy="riskScore" activeSort={clientSort} onSort={sort} />
                    <SortHead label="Geçmiş ort." sortBy="historicalAverage" activeSort={clientSort} onSort={sort} align="right" />
                    <SortHead label="Son ort." sortBy="recentAverage" activeSort={clientSort} onSort={sort} align="right" />
                    <SortHead label="Düşme" sortBy="dropPercent" activeSort={clientSort} onSort={sort} align="right" />
                    <SortHead label="Kayıp" sortBy="lostPotential" activeSort={clientSort} onSort={sort} align="right" />
                    <span>Kayıp kategori</span>
                    <SortHead label="Son alım" sortBy="lastSaleDate" activeSort={clientSort} onSort={sort} />
                    <span>Önerilen aksiyon</span>
                    <span>Takip</span>
                    <span style={cellRight}>Detay</span>
                  </div>

                  {/* Satirlar */}
                  {loading ? (
                    <div style={{ padding: '48px 16px', textAlign: 'center', color: MUTED }}>Rapor hesaplanıyor...</div>
                  ) : displayRows.length === 0 ? (
                    <div style={{ padding: '48px 16px', textAlign: 'center', color: MUTED }}>Filtrelere uygun cari bulunamadı.</div>
                  ) : (
                    visibleRows.map((row) => {
                      const selected = selectedCodes.includes(row.customerCode);
                      const rb = riskBadgeStyle[row.riskType];
                      const db = developmentBadgeStyle[row.developmentStatus];
                      return (
                        <div
                          key={row.customerCode}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: MAIN_GRID,
                            gap: 10,
                            padding: '12px 16px',
                            borderTop: `1px solid ${ROW_LINE}`,
                            fontSize: 12,
                            color: INK,
                            alignItems: 'center',
                            background: selected ? '#f0fdf4' : undefined,
                          }}
                        >
                          <input type="checkbox" style={{ accentColor: PRIMARY }} checked={selected} onChange={() => toggleRow(row)} />
                          {/* Cari */}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: INK }}>{row.customerName || '-'}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 10.5, color: FAINT, marginTop: 2 }}>
                              <span style={mono}>{row.customerCode}</span>
                              {row.sectorCode && <span>Sektör: {row.sectorCode}</span>}
                              {row.assignedSalesRep?.name && <span>{row.assignedSalesRep.name}</span>}
                            </div>
                          </div>
                          {/* Risk */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span style={pill(rb)}>
                              {riskTypeLabels[row.riskType]} / {row.riskScore}
                            </span>
                            <span style={{ fontSize: 10.5, color: FAINT }}>{row.confidence} güven</span>
                            {row.isSeasonal && (
                              <span style={{ fontSize: 10.5, fontWeight: 500, color: row.seasonalityStatus === 'OVERDUE' ? RED : BLUE }}>
                                {row.seasonalityStatus === 'OVERDUE' ? 'Dönemsel periyot geçmiş' : 'Dönemsel/ihale ritmi'}
                              </span>
                            )}
                            {row.purchasePattern === 'FREQUENT' && (
                              <span style={{ fontSize: 10.5, fontWeight: 500, color: EMERALD }}>Sık alım geçmişi</span>
                            )}
                          </div>
                          {/* Gecmis ort */}
                          <span style={{ ...cellRight, fontWeight: 500, color: MUTED }}>{formatCurrency(row.historicalAverage)}</span>
                          {/* Son ort */}
                          <span style={{ ...cellRight, color: MUTED }}>{formatCurrency(row.recentAverage)}</span>
                          {/* Dusme */}
                          <div style={cellRight}>
                            <span style={{ fontWeight: 600, color: RED }}>{percent(row.dropPercent)}</span>
                            {row.seasonalDropPercent !== null && (
                              <div style={{ fontSize: 10, color: FAINT }}>Sezonsal {percent(row.seasonalDropPercent)}</div>
                            )}
                            {row.averagePurchaseIntervalMonths && (
                              <div style={{ fontSize: 10, color: FAINT }}>
                                Ritm {row.averagePurchaseIntervalMonths} ay / son {row.monthsSinceLastMeaningfulPurchase ?? '-'} ay
                              </div>
                            )}
                          </div>
                          {/* Kayip */}
                          <span style={{ ...cellRight, fontWeight: 600, color: INK }}>{formatCurrency(row.lostPotential)}</span>
                          {/* Kayip kategori */}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 500, color: INK }}>{row.topLostCategory?.categoryName || '-'}</div>
                            <div style={{ fontSize: 10.5, color: FAINT }}>
                              {row.topLostCategory ? formatCurrency(row.topLostCategory.lostAmount) : row.seasonalityReason || '-'}
                            </div>
                          </div>
                          {/* Son alim */}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.lastPurchasedProduct?.productName || ''}>
                              {row.lastPurchasedProduct?.productName || '-'}
                            </div>
                            <div style={{ fontSize: 10.5, color: FAINT }}>
                              {safeDate(row.lastPurchasedProduct?.lastPurchaseDate || row.lastSaleDate)} / {row.daysSinceLastSale ?? '-'} gün
                            </div>
                          </div>
                          {/* Onerilen aksiyon */}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, color: '#334155' }}>{row.recommendedAction || '-'}</div>
                            <div style={{ fontSize: 10.5, color: FAINT, marginTop: 2 }}>
                              Teklif {row.openQuoteCount}, sipariş {row.openOrderCount}, bakiye {formatCurrency(row.balance || 0)}
                            </div>
                          </div>
                          {/* Takip */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span style={pill({ ...db, padding: '2px 8px' })}>{developmentLabels[row.developmentStatus]}</span>
                            <span style={{ fontSize: 10.5, color: FAINT }}>
                              {row.openActionCount} açık, {row.overdueActionCount} geciken
                            </span>
                            {row.lastAction?.note && (
                              <span style={{ fontSize: 10.5, color: FAINT, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                Son not: {row.lastAction.note}
                              </span>
                            )}
                          </div>
                          {/* Detay */}
                          <div style={cellRight}>
                            <button
                              type="button"
                              onClick={() => openDetail(row)}
                              style={{ ...headBtn, height: 30, padding: '0 10px', fontSize: 11.5 }}
                            >
                              <Eye size={14} strokeWidth={2} />
                              Aç / Not
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Footer + sayfalama */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: 16, borderTop: `1px solid ${SOFT_LINE}`, background: '#fafbfd' }}>
                <div style={{ fontSize: 12, color: MUTED }}>
                  {selectedCodes.length > 0 ? `${selectedCodes.length} cari seçildi` : 'Toplu takip için carileri seçin'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))} style={{ ...headBtn, height: 32, opacity: page <= 1 || loading ? 0.5 : 1, cursor: page <= 1 || loading ? 'not-allowed' : 'pointer' }}>
                    Önceki
                  </button>
                  <button type="button" disabled={page >= pagination.totalPages || loading} onClick={() => setPage((current) => current + 1)} style={{ ...headBtn, height: 32, opacity: page >= pagination.totalPages || loading ? 0.5 : 1, cursor: page >= pagination.totalPages || loading ? 'not-allowed' : 'pointer' }}>
                    Sonraki
                  </button>
                </div>
              </div>
            </div>

            {/* Sag kolon */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Risk dagilimi */}
              <div style={{ ...cardStyle, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 600, color: INK }}>
                  <TrendingDown size={16} strokeWidth={2} style={{ color: RED }} />
                  Risk dağılımı
                </div>
                <div style={{ fontSize: 11.5, color: FAINT, marginTop: 2, marginBottom: 12 }}>Rapor sonucu risk tipi özeti</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(Object.keys(riskTypeLabels) as CustomerRecoveryRiskType[]).map((riskType) => (
                    <div key={riskType} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, border: `1px solid ${SOFT_LINE}`, background: '#fafbfd', padding: '8px 12px' }}>
                      <span style={{ fontSize: 12.5, color: MUTED }}>{riskTypeLabels[riskType]}</span>
                      <span style={{ fontWeight: 600, color: INK }}>{summary?.countsByRisk?.[riskType] || 0}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Donemsel ayrim */}
              <div style={{ ...cardStyle, padding: 16, border: '1px solid #bfdbfe', background: '#eff6ff' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1e3a8a' }}>Dönemsel alım ayrımı</div>
                <div style={{ fontSize: 11.5, color: '#3b5b8c', marginTop: 2, marginBottom: 12 }}>Alımları seyrek veya belirli periyotla tekrar eden cariler</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, background: '#fff', padding: '8px 12px' }}>
                    <span style={{ fontSize: 12.5, color: MUTED }}>Dönemsel cari</span>
                    <span style={{ fontWeight: 600, color: BLUE }}>{summary?.seasonalCount || 0}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, background: '#fff', padding: '8px 12px' }}>
                    <span style={{ fontSize: 12.5, color: MUTED }}>Dönemsel kayıp</span>
                    <span style={{ fontWeight: 600, color: BLUE }}>{formatCurrency(summary?.seasonalLostPotential || 0)}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.5, color: '#3b5b8c' }}>
                    Normal ritimdeki dönemsel cariler ana kayıp listesinden ayrılır; beklenen alım periyodu aşıldıysa yine risk olarak kalır.
                  </p>
                </div>
              </div>

              {/* Toplu takip */}
              <div style={{ ...cardStyle, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 600, color: INK }}>
                  <Clock size={16} strokeWidth={2} style={{ color: EMERALD }} />
                  Toplu takip
                </div>
                <div style={{ fontSize: 11.5, color: FAINT, marginTop: 2, marginBottom: 12 }}>Seçilen carileri bir personele takip olarak ata</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Atanacak personel</label>
                    <select value={bulkAssignedToId} onChange={(e) => setBulkAssignedToId(e.target.value)} style={selectStyle}>
                      <option value="">Personel seç</option>
                      {assignmentOptions.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name || member.email || member.id}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Takip tarihi</label>
                    <input type="date" value={bulkFollowUpDate} onChange={(e) => setBulkFollowUpDate(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Toplu not</label>
                    <textarea value={bulkNote} onChange={(e) => setBulkNote(e.target.value)} style={{ ...textAreaStyle, minHeight: 80 }} />
                  </div>
                  <button
                    type="button"
                    disabled={selectedCodes.length === 0 || bulkSaving}
                    onClick={bulkAssign}
                    style={{ ...primaryBtn, width: '100%', justifyContent: 'center', opacity: selectedCodes.length === 0 || bulkSaving ? 0.55 : 1, cursor: selectedCodes.length === 0 || bulkSaving ? 'not-allowed' : 'pointer' }}
                  >
                    {bulkSaving && <RefreshCw size={15} strokeWidth={2} className="animate-spin" />}
                    {selectedCodes.length > 0 ? `${selectedCodes.length} cariye takip aç` : 'Cari seçin'}
                  </button>
                </div>
              </div>

              {/* Temsilci ozeti */}
              <div style={{ ...cardStyle, padding: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>Temsilci özeti</div>
                <div style={{ fontSize: 11.5, color: FAINT, marginTop: 2, marginBottom: 12 }}>Riskli portföy ve açık takipler</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(summary?.teamSummary || []).slice(0, 6).map((item) => (
                    <div key={item.userId} style={{ borderRadius: 10, border: `1px solid ${SOFT_LINE}`, background: '#fff', padding: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 500, color: INK }}>{item.name || '-'}</span>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: RED }}>{formatCurrency(item.lostPotential || 0)}</span>
                      </div>
                      <div style={{ fontSize: 10.5, color: FAINT, marginTop: 6 }}>
                        {item.customerCount} cari, {item.openActionCount} açık, {item.overdueActionCount} geciken
                      </div>
                    </div>
                  ))}
                  {(!summary?.teamSummary || summary.teamSummary.length === 0) && (
                    <div style={{ borderRadius: 10, border: `1px dashed ${LINE}`, padding: 14, fontSize: 12, color: FAINT }}>
                      Temsilci eşleşmesi bulunamadı.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <HistoricalValueSection
          filters={historicalFilters}
          data={historicalData}
          loading={historicalLoading}
          exporting={historicalExporting}
          page={historicalPage}
          activeSort={{
            sortBy: submittedHistoricalFilters.sortBy,
            sortDirection: submittedHistoricalFilters.sortDirection,
          }}
          onPageChange={setHistoricalPage}
          onFilterChange={updateHistoricalFilter}
          onRun={runHistoricalReport}
          onSort={sortHistorical}
          onExport={exportHistoricalReport}
        />
      )}

      {/* Detay modal */}
      <Modal
        isOpen={Boolean(detailRow)}
        onClose={() => {
          setDetailRow(null);
          setDetail(null);
          setActionUpdateDrafts({});
        }}
        title={detailRow ? `${detailRow.customerCode} - ${detailRow.customerName || 'Cari detayı'}` : 'Cari detayı'}
        size="full"
      >
        {detailLoading ? (
          <div style={{ padding: '64px 0', textAlign: 'center', color: MUTED }}>Cari detayları yükleniyor...</div>
        ) : detailRow ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 420px', gap: 20, alignItems: 'start' }}>
            {/* Sol */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <MetricCard label="Geçmiş aylık ort." value={formatCurrency(detailRow.historicalAverage)} />
                <MetricCard label="Son dönem ort." value={formatCurrency(detailRow.recentAverage)} />
                <MetricCard label="Tahmini kayıp" value={formatCurrency(detailRow.lostPotential)} />
                <MetricCard label="Son satış" value={safeDate(detailRow.lastSaleDate)} />
              </div>

              {/* Insight */}
              <div style={{ ...cardStyle, border: '1px solid #fde68a', background: '#fffbeb', padding: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  <InsightBlock label="Ana kayıp kategori" value={detailRow.topLostCategory?.categoryName || '-'} helper={detailRow.topLostCategory ? formatCurrency(detailRow.topLostCategory.lostAmount) : '-'} />
                  <InsightBlock label="Son alınan ürün" value={detailRow.lastPurchasedProduct?.productName || '-'} helper={safeDate(detailRow.lastPurchasedProduct?.lastPurchaseDate || detailRow.lastSaleDate)} />
                  <InsightBlock
                    label={detailRow.isSeasonal ? 'Dönemsel ritim' : 'Önerilen aksiyon'}
                    value={
                      detailRow.seasonalityStatus === 'OVERDUE'
                        ? 'Beklenen periyot aşılmış'
                        : detailRow.isSeasonal
                          ? 'Ritim tolerans içinde'
                          : (detailRow.recommendedAction || '-')
                    }
                    helper={detailRow.seasonalityReason || detailRow.recommendedAction || '-'}
                  />
                </div>
              </div>

              {/* Aylik satis seyri */}
              <div style={{ ...cardStyle, padding: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>Aylık satış seyri</div>
                <div style={{ fontSize: 11.5, color: FAINT, marginTop: 2, marginBottom: 12 }}>Geçmiş baz dönem ve son dönem beraber gösterilir</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                  {detailRow.monthlySales.map((month) => {
                    const maxValue = Math.max(...detailRow.monthlySales.map((item) => item.amount), 1);
                    return (
                      <div key={month.month} style={{ borderRadius: 11, border: `1px solid ${SOFT_LINE}`, background: '#fafbfd', padding: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10.5, color: FAINT }}>
                          <span>{month.month}</span>
                          <span>{month.documentCount} evrak</span>
                        </div>
                        <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: '#fff', overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 999, background: EMERALD, width: `${Math.max(4, (month.amount / maxValue) * 100)}%` }} />
                        </div>
                        <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 600, color: INK }}>{formatCurrency(month.amount)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Kategori kaybi */}
              <div style={{ ...cardStyle, padding: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>Kategori kaybı ve ürünler</div>
                <div style={{ fontSize: 11.5, color: FAINT, marginTop: 2, marginBottom: 12 }}>Düşüşü hangi kategori ve ürünlerin yarattığını gösterir</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(detail?.categories || []).map((category) => (
                    <div key={category.categoryCode} style={{ borderRadius: 11, border: `1px solid ${SOFT_LINE}`, background: '#fff', padding: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 600, color: INK }}>{category.categoryName}</div>
                          <div style={{ fontSize: 10.5, color: FAINT }}>{category.categoryCode} / {category.productCount} ürün</div>
                        </div>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: RED }}>{formatCurrency(category.lostAmount)}</div>
                      </div>
                      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                        {category.products.slice(0, 6).map((product) => (
                          <div key={product.productCode} style={{ borderRadius: 9, background: '#f8fafc', padding: 10, fontSize: 12 }}>
                            <div style={{ fontWeight: 500, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{product.productName}</div>
                            <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10.5, color: FAINT }}>
                              <span>{product.productCode}</span>
                              <span>{formatCurrency(product.lostAmount)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {(!detail?.categories || detail.categories.length === 0) && (
                    <div style={{ borderRadius: 11, border: `1px dashed ${LINE}`, padding: 18, fontSize: 12, color: FAINT }}>Kategori kırılımı bulunamadı.</div>
                  )}
                </div>
              </div>

              {/* Son evraklar */}
              <div style={{ ...cardStyle, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 600, color: INK, marginBottom: 12 }}>
                  <FileText size={16} strokeWidth={2} />
                  Son evraklar
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ minWidth: 420 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 0.7fr', gap: 8, padding: '9px 0', borderBottom: `1px solid ${SOFT_LINE}`, fontSize: 10, fontWeight: 600, color: FAINT, textTransform: 'uppercase' }}>
                      <span>Evrak</span>
                      <span>Tarih</span>
                      <span style={cellRight}>Tutar</span>
                      <span style={cellRight}>Satır</span>
                    </div>
                    {(detail?.documents || []).map((document) => (
                      <div key={`${document.documentNo}-${document.documentDate}`} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 0.7fr', gap: 8, padding: '10px 0', borderTop: `1px solid ${ROW_LINE}`, fontSize: 12, color: INK }}>
                        <span>{document.documentNo}</span>
                        <span>{safeDate(document.documentDate)}</span>
                        <span style={cellRight}>{formatCurrency(document.amount)}</span>
                        <span style={cellRight}>{document.lineCount}</span>
                      </div>
                    ))}
                    {(!detail?.documents || detail.documents.length === 0) && (
                      <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 12, color: FAINT }}>Evrak bulunamadı.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Sag: yeni aksiyon + gecmis */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ ...cardStyle, border: '1px solid #a7f3d0', background: '#ecfdf5', padding: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>Yeni aksiyon / not</div>
                <div style={{ fontSize: 11.5, color: '#3b6e5b', marginTop: 2, marginBottom: 12 }}>Yapılan çalışma sonraki raporlarda gelişme durumuyla birlikte görünür</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>Tip</label>
                      <select value={actionForm.actionType} onChange={(e) => setActionForm((p) => ({ ...p, actionType: e.target.value }))} style={selectStyle}>
                        <option value="CALL">Arama</option>
                        <option value="VISIT">Ziyaret</option>
                        <option value="QUOTE">Teklif</option>
                        <option value="DISCOUNT">İskonto</option>
                        <option value="NOTE">Not</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Öncelik</label>
                      <select value={actionForm.priority} onChange={(e) => setActionForm((p) => ({ ...p, priority: e.target.value }))} style={selectStyle}>
                        <option value="HIGH">Yüksek</option>
                        <option value="NORMAL">Normal</option>
                        <option value="LOW">Düşük</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Durum</label>
                      <select value={actionForm.status} onChange={(e) => setActionForm((p) => ({ ...p, status: e.target.value }))} style={selectStyle}>
                        <option value="OPEN">Açık</option>
                        <option value="DONE">Tamamlandı</option>
                        <option value="CANCELLED">İptal</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Atanan</label>
                    <select value={actionForm.assignedToId} onChange={(e) => setActionForm((p) => ({ ...p, assignedToId: e.target.value }))} style={selectStyle}>
                      <option value="">Atama yok</option>
                      {assignmentOptions.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name || member.email || member.id}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Takip tarihi</label>
                    <input type="date" value={actionForm.followUpDate} onChange={(e) => setActionForm((p) => ({ ...p, followUpDate: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Not / yapılan çalışma</label>
                    <textarea
                      value={actionForm.note}
                      onChange={(e) => setActionForm((p) => ({ ...p, note: e.target.value }))}
                      placeholder="Müşteri neden düşmüş, ne konuşuldu, hangi teklif veya ziyaret planlandı?"
                      style={{ ...textAreaStyle, minHeight: 110 }}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Sonuç / durum notu</label>
                    <textarea
                      value={actionForm.outcome}
                      onChange={(e) => setActionForm((p) => ({ ...p, outcome: e.target.value }))}
                      placeholder="Aksiyon sonucu, müşteri cevabı veya sonraki adım..."
                      style={{ ...textAreaStyle, minHeight: 76 }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={saveAction}
                    disabled={actionSaving}
                    style={{ ...primaryBtn, width: '100%', justifyContent: 'center', opacity: actionSaving ? 0.7 : 1, cursor: actionSaving ? 'not-allowed' : 'pointer' }}
                  >
                    {actionSaving && <RefreshCw size={15} strokeWidth={2} className="animate-spin" />}
                    Aksiyonu kaydet
                  </button>
                </div>
              </div>

              <div style={{ ...cardStyle, padding: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>Aksiyon geçmişi</div>
                <div style={{ fontSize: 11.5, color: FAINT, marginTop: 2, marginBottom: 12 }}>Notlar ve takiplerin son durumu</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(detail?.actions || []).map((action) => {
                    const draft = actionUpdateDrafts[action.id] || {
                      status: action.status || 'OPEN',
                      outcome: action.outcome || '',
                      followUpDate: toDateInputValue(action.followUpDate),
                      assignedToId: action.assignedTo?.id || '',
                    };
                    const statusBadge: React.CSSProperties =
                      action.status === 'DONE'
                        ? { background: '#ecfdf5', color: EMERALD }
                        : { background: '#fffbeb', color: AMBER };
                    return (
                      <div key={action.id} style={{ borderRadius: 11, border: `1px solid ${SOFT_LINE}`, background: '#fff', padding: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={pill(statusBadge)}>{action.status}</span>
                              <span style={pill({ border: `1px solid ${LINE}`, background: '#fff', color: MUTED })}>{action.actionType}</span>
                              <span style={pill({ border: `1px solid ${LINE}`, background: '#fff', color: MUTED })}>{action.priority}</span>
                            </div>
                            <div style={{ fontSize: 10.5, color: FAINT }}>
                              {safeDate(action.createdAt)} / {action.author?.name || '-'}
                            </div>
                          </div>
                          {action.status !== 'DONE' && (
                            <button type="button" onClick={() => completeAction(action.id, detailRow.customerCode)} style={{ ...headBtn, height: 30, padding: '0 10px', fontSize: 11.5 }}>
                              <CheckCircle2 size={14} strokeWidth={2} />
                              Kapat
                            </button>
                          )}
                        </div>
                        <p style={{ margin: '12px 0 0', whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.5, color: '#334155' }}>{action.note}</p>
                        {action.outcome && (
                          <p style={{ margin: '12px 0 0', whiteSpace: 'pre-wrap', borderRadius: 9, background: '#f8fafc', padding: 10, fontSize: 12, lineHeight: 1.5, color: '#334155' }}>
                            <span style={{ fontWeight: 600, color: INK }}>Durum notu: </span>
                            {action.outcome}
                          </p>
                        )}
                        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 10.5, color: FAINT }}>
                          <span>Takip: {safeDate(action.followUpDate)}</span>
                          <span>Atanan: {action.assignedTo?.name || '-'}</span>
                        </div>
                        <div style={{ marginTop: 14, borderRadius: 11, border: `1px dashed #cbd5e1`, background: '#f8fafc', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: INK }}>
                            <MessageSquare size={14} strokeWidth={2} style={{ color: EMERALD }} />
                            Aksiyon durumu / notu
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                            <div>
                              <label style={labelStyle}>Durum</label>
                              <select value={draft.status} onChange={(e) => updateActionDraft(action.id, { status: e.target.value })} style={selectStyle}>
                                <option value="OPEN">Açık</option>
                                <option value="DONE">Tamamlandı</option>
                                <option value="CANCELLED">İptal</option>
                              </select>
                            </div>
                            <div>
                              <label style={labelStyle}>Takip tarihi</label>
                              <input type="date" value={draft.followUpDate} onChange={(e) => updateActionDraft(action.id, { followUpDate: e.target.value })} style={inputStyle} />
                            </div>
                            <div>
                              <label style={labelStyle}>Atanan</label>
                              <select value={draft.assignedToId} onChange={(e) => updateActionDraft(action.id, { assignedToId: e.target.value })} style={selectStyle}>
                                <option value="">Atama yok</option>
                                {assignmentOptions.map((member) => (
                                  <option key={member.id} value={member.id}>
                                    {member.name || member.email || member.id}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <textarea
                            value={draft.outcome}
                            onChange={(e) => updateActionDraft(action.id, { outcome: e.target.value })}
                            placeholder="Atanan kullanıcı bu aksiyonla ilgili son durumu veya görüşme notunu buraya yazar."
                            style={{ ...textAreaStyle, minHeight: 76 }}
                          />
                          <button
                            type="button"
                            onClick={() => saveActionUpdate(action)}
                            disabled={actionUpdateSavingId === action.id}
                            style={{ ...headBtn, opacity: actionUpdateSavingId === action.id ? 0.7 : 1, cursor: actionUpdateSavingId === action.id ? 'not-allowed' : 'pointer', alignSelf: 'flex-start' }}
                          >
                            {actionUpdateSavingId === action.id ? <RefreshCw size={14} strokeWidth={2} className="animate-spin" /> : <Save size={14} strokeWidth={2} />}
                            Durumu kaydet
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {(!detail?.actions || detail.actions.length === 0) && (
                    <div style={{ borderRadius: 11, border: `1px dashed ${LINE}`, padding: 18, fontSize: 12, color: FAINT }}>Henüz not veya aksiyon yok.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function InsightBlock({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div style={{ borderRadius: 11, background: '#fff', padding: 14, boxShadow: '0 1px 2px rgba(20,34,59,.05)' }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em', color: AMBER }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 12.5, fontWeight: 600, color: INK, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 10.5, color: FAINT, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{helper}</div>
    </div>
  );
}

function HistoricalValueSection({
  filters,
  data,
  loading,
  exporting,
  page,
  activeSort,
  onPageChange,
  onFilterChange,
  onRun,
  onSort,
  onExport,
}: {
  filters: HistoricalFilterState;
  data: CustomerRecoveryHistoricalValueData | null;
  loading: boolean;
  exporting: boolean;
  page: number;
  activeSort: { sortBy: HistoricalSortBy; sortDirection: SortDirection };
  onPageChange: (page: number) => void;
  onFilterChange: <K extends keyof HistoricalFilterState>(key: K, value: HistoricalFilterState[K]) => void;
  onRun: () => void;
  onSort: (sortBy: HistoricalSortBy) => void;
  onExport: () => void;
}) {
  const summary = data?.summary;
  const metadata = data?.metadata;
  const rows = data?.rows || [];
  const pagination = data?.pagination || { page, limit: PAGE_SIZE, totalPages: 0, totalRecords: 0 };
  const currentRateLabel = metadata?.currentUsdTryRate
    ? metadata.currentUsdTryRate.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    : '-';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Hero kart + filtreler */}
      <div style={{ ...cardStyle, overflow: 'hidden', border: '1px solid #a7f3d0' }}>
        <div style={{ background: 'linear-gradient(120deg,#064e3b,#0c2247)', color: '#fff', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-.02em' }}>2020'den bugüne değerlenmiş cari analizi</h2>
              <div style={{ marginTop: 8, maxWidth: 760, fontSize: 12.5, color: 'rgba(209,250,229,.82)', lineHeight: 1.5 }}>
                Geçmiş satışları Mikro hareketindeki USD/TL kuru ile bugünkü USD/TL kuruna taşır. Ardışık aktif aylarda
                alım yapıp sonrasında duran carileri ayrıca işaretler.
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, minWidth: 320 }}>
              <div style={{ borderRadius: 11, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.1)', padding: 14 }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.7)' }}>Bugünkü USD/TL</div>
                <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>{currentRateLabel}</div>
              </div>
              <div style={{ borderRadius: 11, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.1)', padding: 14 }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.7)' }}>Ardışık alırken duran</div>
                <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>{summary?.lostAfterConsecutiveCount ?? 0}</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
            <NewLabeledInput label="Başlangıç yılı" value={filters.startYear} onChange={(v) => onFilterChange('startYear', v)} />
            <NewLabeledInput label="Pasif ay eşiği" value={filters.inactiveMonths} onChange={(v) => onFilterChange('inactiveMonths', v)} />
            <NewLabeledInput label="Min. ardışık aktif ay" value={filters.minConsecutiveMonths} onChange={(v) => onFilterChange('minConsecutiveMonths', v)} />
            <NewLabeledInput label="Anlamlı ay cirosu" value={filters.minMonthlyAmount} onChange={(v) => onFilterChange('minMonthlyAmount', v)} />
            <NewLabeledInput label="Min. bugünkü toplam" value={filters.minTotalAdjustedAmount} onChange={(v) => onFilterChange('minTotalAdjustedAmount', v)} />
            <div>
              <label style={labelStyle}>Sırala</label>
              <select
                value={`${filters.sortBy}:${filters.sortDirection}`}
                onChange={(e) => {
                  const [sortBy, sortDirection] = e.target.value.split(':') as [HistoricalSortBy, SortDirection];
                  onFilterChange('sortBy', sortBy);
                  onFilterChange('sortDirection', sortDirection);
                }}
                style={selectStyle}
              >
                <option value="lostPotentialAdjusted:desc">Tahmini kayıp yüksek</option>
                <option value="peakAdjustedAmount:desc">En yüksek ay değeri</option>
                <option value="totalRawAmount:desc">Nominal toplam yüksek</option>
                <option value="totalAdjustedAmount:desc">Toplam bugünkü değer</option>
                <option value="lastSaleDate:asc">Son satış en eski</option>
                <option value="maxConsecutiveActiveMonths:desc">Ardışık ay sayısı</option>
                <option value="customerName:asc">Cari adı A-Z</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 220px 150px 150px', gap: 12, alignItems: 'end' }}>
            <div style={{ position: 'relative' }}>
              <Search size={15} strokeWidth={2} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: FAINT, pointerEvents: 'none' }} />
              <input
                value={filters.search}
                onChange={(e) => onFilterChange('search', e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onRun();
                }}
                placeholder="Cari kodu, unvanı, sektör, il veya ilçe ara..."
                style={{ ...inputStyle, paddingLeft: 34 }}
              />
            </div>
            <NewLabeledInput label="Sektör kodu" value={filters.sectorCode} onChange={(v) => onFilterChange('sectorCode', v.toUpperCase())} />
            <button type="button" onClick={onRun} disabled={loading} style={{ ...primaryBtn, justifyContent: 'center', opacity: loading ? 0.75 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? <RefreshCw size={15} strokeWidth={2} className="animate-spin" /> : <RefreshCw size={15} strokeWidth={2} />}
              Raporu getir
            </button>
            <button type="button" onClick={onExport} disabled={!data || loading || exporting} style={{ ...headBtn, justifyContent: 'center', opacity: !data || loading || exporting ? 0.6 : 1, cursor: !data || loading || exporting ? 'not-allowed' : 'pointer' }}>
              {exporting ? <RefreshCw size={15} strokeWidth={2} className="animate-spin" /> : <Download size={15} strokeWidth={2} />}
              Excel
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label style={pill({ border: '1px solid #a7f3d0', background: '#ecfdf5', color: '#065f46', gap: 7, padding: '6px 11px', fontSize: 12, cursor: 'pointer' })}>
              <input type="checkbox" style={{ accentColor: PRIMARY }} checked={filters.onlyLostFrequent} onChange={(e) => onFilterChange('onlyLostFrequent', e.target.checked)} />
              Sadece ardışık alırken duranları göster
            </label>
            <span style={{ fontSize: 10.5, color: FAINT }}>
              Anlamlı ay cirosu bugünkü TL karşılığına göre değerlendirilir. Örnek: eski 75.000 TL, eski kur 18,86 ve bugünkü kur 45,5 ise yaklaşık 181.000 TL sayılır.
            </span>
          </div>
        </div>
      </div>

      {/* Ozet metrikler */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <MetricCard label="Cari sayısı" value={summary?.totalCustomers ?? 0} />
        <MetricCard label="Nominal toplam" value={formatCurrency(summary?.totalRawAmount || 0)} />
        <MetricCard label="Bugünkü değer" value={formatCurrency(summary?.totalAdjustedAmount || 0)} />
        <MetricCard label="Tahmini kayıp" value={formatCurrency(summary?.totalLostPotentialAdjusted || 0)} accent={RED} />
        <MetricCard label="Ortalama katsayı" value={`${(summary?.averageMultiplier || 1).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}x`} />
      </div>

      {/* Tablo */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${SOFT_LINE}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: INK }}>Değerlenmiş satışlar ve kayıp ritmi</div>
              <div style={{ fontSize: 12, color: FAINT, marginTop: 3 }}>
                {metadata ? `${metadata.startDate} - ${metadata.endDate} aralığı incelendi. Geçmiş kur: Mikro, güncel kur: ${metadata.currentUsdTryRateSource}.` : 'Rapor yükleniyor'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={pill({ border: `1px solid ${LINE}`, background: '#fff', color: MUTED, padding: '4px 10px', fontSize: 11 })}>{pagination.totalRecords} kayıt</span>
              <span style={pill({ border: `1px solid ${LINE}`, background: '#fff', color: MUTED, padding: '4px 10px', fontSize: 11 })}>Sayfa {pagination.page || page} / {pagination.totalPages || 0}</span>
            </div>
          </div>
        </div>

        <div style={{ overflowX: 'auto', maxHeight: 720, overflowY: 'auto' }}>
          <div style={{ minWidth: 1200 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: HIST_GRID,
                gap: 10,
                padding: '11px 16px',
                background: TABLE_HEAD_BG,
                borderBottom: `1px solid ${SOFT_LINE}`,
                fontSize: 10,
                fontWeight: 600,
                color: FAINT,
                textTransform: 'uppercase',
                alignItems: 'center',
                position: 'sticky',
                top: 0,
                zIndex: 1,
              }}
            >
              <HistSortHead label="Cari" sortBy="customerName" activeSort={activeSort} onSort={onSort} />
              <span>Durum</span>
              <HistSortHead label="Son aktif ay" sortBy="lastSaleDate" activeSort={activeSort} onSort={onSort} />
              <HistSortHead label="Ardışık aktiflik" sortBy="maxConsecutiveActiveMonths" activeSort={activeSort} onSort={onSort} />
              <HistSortHead label="En yüksek ay" sortBy="peakAdjustedAmount" activeSort={activeSort} onSort={onSort} />
              <HistSortHead label="Nominal toplam" sortBy="totalRawAmount" activeSort={activeSort} onSort={onSort} align="right" />
              <HistSortHead label="Bugünkü değer" sortBy="totalAdjustedAmount" activeSort={activeSort} onSort={onSort} align="right" />
              <HistSortHead label="Tahmini kayıp" sortBy="lostPotentialAdjusted" activeSort={activeSort} onSort={onSort} align="right" />
              <span>En değerli aylar</span>
            </div>

            {loading ? (
              <div style={{ padding: '48px 16px', textAlign: 'center', color: MUTED }}>Rapor hesaplanıyor...</div>
            ) : rows.length === 0 ? (
              <div style={{ padding: '48px 16px', textAlign: 'center', color: MUTED }}>Filtrelere uygun cari bulunamadı.</div>
            ) : (
              rows.map((row) => (
                <div
                  key={row.customerCode}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: HIST_GRID,
                    gap: 10,
                    padding: '12px 16px',
                    borderTop: `1px solid ${ROW_LINE}`,
                    fontSize: 12,
                    color: INK,
                    alignItems: 'center',
                    background: row.lostAfterConsecutiveActivity ? '#fef5f5' : undefined,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: INK }}>{row.customerName || '-'}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 10.5, color: FAINT, marginTop: 2 }}>
                      <span style={mono}>{row.customerCode}</span>
                      {row.sectorCode && <span>Sektör: {row.sectorCode}</span>}
                      {row.assignedSalesRep?.name && <span>{row.assignedSalesRep.name}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={pill(row.lostAfterConsecutiveActivity ? { background: '#fef2f2', border: '1px solid #fecaca', color: RED } : { border: `1px solid ${LINE}`, background: '#fff', color: MUTED })}>
                      {row.lostAfterConsecutiveActivity ? 'Ardışık alırken durdu' : 'İzleme'}
                    </span>
                    <span style={{ fontSize: 10.5, color: FAINT }}>Aktif ay {row.activeMonths}, evrak {row.documentCount}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: INK }}>{monthLabel(row.lastActiveMonth?.month)}</div>
                    <div style={{ fontSize: 10.5, color: FAINT }}>{row.monthsSinceLastActive ?? '-'} ay önce / {safeDate(row.lastSaleDate)}</div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: INK }}>{row.maxConsecutiveActiveMonths} ay</div>
                    {row.latestConsecutiveStreak ? (
                      <div style={{ fontSize: 10.5, color: FAINT }}>
                        {monthLabel(row.latestConsecutiveStreak.startMonth)} - {monthLabel(row.latestConsecutiveStreak.endMonth)}
                        <br />
                        Ort. {formatCurrency(row.latestConsecutiveStreak.averageAdjustedAmount)}
                      </div>
                    ) : (
                      <div style={{ fontSize: 10.5, color: FAINT }}>Eşik üstü ardışık ritim yok</div>
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: INK }}>{formatCurrency(row.peakMonth?.adjustedAmount || 0)}</div>
                    <div style={{ fontSize: 10.5, color: FAINT }}>{monthLabel(row.peakMonth?.month)} / nominal {formatCurrency(row.peakMonth?.amount || 0)}</div>
                    {row.peakMonth?.usdRate && (
                      <div style={{ fontSize: 10, color: '#a3aec0' }}>Kur {row.peakMonth.usdRate.toLocaleString('tr-TR', { maximumFractionDigits: 4 })}</div>
                    )}
                  </div>
                  <span style={{ ...cellRight, fontWeight: 500, color: MUTED }}>{formatCurrency(row.totalRawAmount)}</span>
                  <span style={{ ...cellRight, fontWeight: 600, color: INK }}>{formatCurrency(row.totalAdjustedAmount)}</span>
                  <span style={{ ...cellRight, fontWeight: 600, color: RED }}>{formatCurrency(row.lostPotentialAdjusted)}</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {row.topMonths.slice(0, 3).map((month) => (
                      <span key={`${row.customerCode}-${month.month}`} style={{ borderRadius: 999, background: '#f1f5f9', padding: '3px 8px', fontSize: 10.5, color: '#475569' }}>
                        {monthLabel(month.month)}: {formatCurrency(month.adjustedAmount)}
                      </span>
                    ))}
                    {row.topMonths.length === 0 && <span style={{ fontSize: 10.5, color: FAINT }}>-</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: 16, borderTop: `1px solid ${SOFT_LINE}`, background: '#fafbfd' }}>
          <div style={{ fontSize: 12, color: MUTED }}>
            USD oranlama: bugünkü kur / evrak ayındaki Mikro USD kuru. Kur yoksa nominal tutar kullanılır.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={page <= 1 || loading} onClick={() => onPageChange(Math.max(1, page - 1))} style={{ ...headBtn, height: 32, opacity: page <= 1 || loading ? 0.5 : 1, cursor: page <= 1 || loading ? 'not-allowed' : 'pointer' }}>
              Önceki
            </button>
            <button type="button" disabled={page >= pagination.totalPages || loading} onClick={() => onPageChange(page + 1)} style={{ ...headBtn, height: 32, opacity: page >= pagination.totalPages || loading ? 0.5 : 1, cursor: page >= pagination.totalPages || loading ? 'not-allowed' : 'pointer' }}>
              Sonraki
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
